"use strict";

/**
 * ZyrionOS Preview Service
 * Version: 4.0.0
 *
 * Responsibilities:
 * - Consume authoritative Engineering Agent build artifacts
 * - Validate build authority
 * - Resolve manifest/output artifacts
 * - Verify artifact integrity
 * - Materialize static build output
 * - Start isolated Docker preview runtime
 * - Health-check runtime
 * - Expose preview metadata
 * - Stop / expire / cleanup previews
 *
 * IMPORTANT:
 * This service previews the AUTHORITATIVE BUILD OUTPUT.
 * It does not rebuild the project.
 * It does not install project dependencies.
 * It does not deploy to production.
 */

const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const Project = require("../models/projectModel");
const ProjectBuild = require("../models/projectBuildModel");
const ProjectPreview = require("../models/projectPreviewModel");

let logger = null;

try {
  logger = require("./loggerService");
} catch (_) {
  logger = null;
}

/* -------------------------------------------------------------------------- */
/* CONFIGURATION                                                              */
/* -------------------------------------------------------------------------- */

const VERSION = "4.0.0";
const SERVICE_NAME = "previewService";

const PREVIEW_HOST =
  String(process.env.PREVIEW_HOST || "127.0.0.1").trim();

const PREVIEW_BASE_URL =
  String(process.env.PREVIEW_BASE_URL || "").trim();

const PREVIEW_PORT =
  Number(process.env.PREVIEW_PORT || 0);

const PREVIEW_TTL_MS =
  Number(process.env.PREVIEW_TTL_MS || 30 * 60 * 1000);

const PREVIEW_MAX_ACTIVE =
  Number(process.env.PREVIEW_MAX_ACTIVE || 3);

const PREVIEW_HEALTH_TIMEOUT_MS =
  Number(process.env.PREVIEW_HEALTH_TIMEOUT_MS || 15_000);

const PREVIEW_HEALTH_RETRIES =
  Number(process.env.PREVIEW_HEALTH_RETRIES || 10);

const PREVIEW_HEALTH_RETRY_DELAY_MS =
  Number(process.env.PREVIEW_HEALTH_RETRY_DELAY_MS || 1_000);

const PREVIEW_CPU =
  String(process.env.PREVIEW_CPU || "1");

const PREVIEW_MEMORY =
  String(process.env.PREVIEW_MEMORY || "512m");

const PREVIEW_PIDS =
  Number(process.env.PREVIEW_PIDS || 128);

const PREVIEW_RUNTIME_NETWORK =
  String(process.env.PREVIEW_RUNTIME_NETWORK || "none");

const PREVIEW_NODE_IMAGE =
  String(process.env.PREVIEW_NODE_IMAGE || "node:20-bookworm-slim");

const PREVIEW_WORK_ROOT =
  String(
    process.env.PREVIEW_WORK_ROOT ||
      path.join(os.tmpdir(), "zyrionos-previews")
  ).trim();

const AUTH_ARTIFACT_ROOT =
  String(process.env.AUTH_ARTIFACT_ROOT || "").trim();

const AUTH_ARTIFACT_BUCKET =
  String(process.env.AUTH_ARTIFACT_BUCKET || "").trim();

const AUTH_ARTIFACT_REGION =
  String(
    process.env.AUTH_ARTIFACT_REGION ||
      process.env.AWS_REGION ||
      ""
  ).trim();

const MAX_ARTIFACT_FILE_SIZE =
  Number(process.env.PREVIEW_MAX_ARTIFACT_FILE_SIZE || 500 * 1024 * 1024);

const MAX_ARTIFACT_TOTAL_SIZE =
  Number(process.env.PREVIEW_MAX_ARTIFACT_TOTAL_SIZE || 500 * 1024 * 1024);

const MAX_ARTIFACT_FILES =
  Number(process.env.PREVIEW_MAX_ARTIFACT_FILES || 20_000);

const DOCKER_COMMAND =
  String(process.env.DOCKER_COMMAND || "docker").trim();

/* -------------------------------------------------------------------------- */
/* STATE                                                                      */
/* -------------------------------------------------------------------------- */

const activeRuntimes = new Map();

/* -------------------------------------------------------------------------- */
/* ERRORS                                                                     */
/* -------------------------------------------------------------------------- */

class PreviewServiceError extends Error {
  constructor(message, code = "PREVIEW_ERROR", details = {}) {
    super(message);

    this.name = "PreviewServiceError";
    this.code = code;
    this.details = details;
  }
}

/* -------------------------------------------------------------------------- */
/* LOGGING                                                                    */
/* -------------------------------------------------------------------------- */

function log(level, message, meta = {}) {
  const payload = {
    service: SERVICE_NAME,
    version: VERSION,
    message,
    ...meta,
  };

  try {
    if (logger) {
      const fn = logger[level] || logger.info;

      if (typeof fn === "function") {
        fn.call(logger, payload);
        return;
      }
    }
  } catch (_) {
    // Fall through to console.
  }

  const serialized = safeJson(payload);

  if (level === "error") {
    console.error(`[${SERVICE_NAME}] ${serialized}`);
  } else if (level === "warn") {
    console.warn(`[${SERVICE_NAME}] ${serialized}`);
  } else {
    console.log(`[${SERVICE_NAME}] ${serialized}`);
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({
      serializationError: true,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* GENERIC HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function now() {
  return new Date();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomId(prefix = "") {
  return `${prefix}${crypto.randomBytes(12).toString("hex")}`;
}

function sha256Buffer(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");

  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function normalizeRelativePath(value) {
  if (typeof value !== "string") {
    throw new PreviewServiceError(
      "Invalid artifact path.",
      "ARTIFACT_INVALID"
    );
  }

  const normalized = value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (
    !normalized ||
    normalized === "." ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    throw new PreviewServiceError(
      `Unsafe artifact path: ${value}`,
      "ARTIFACT_INVALID"
    );
  }

  return normalized;
}

function ensureInside(parent, child) {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);

  if (
    childResolved !== parentResolved &&
    !childResolved.startsWith(`${parentResolved}${path.sep}`)
  ) {
    throw new PreviewServiceError(
      "Artifact path escapes allowed workspace.",
      "ARTIFACT_INVALID"
    );
  }

  return childResolved;
}

function normalizeBuildId(buildId) {
  const value = String(buildId || "").trim();

  if (!value) {
    throw new PreviewServiceError(
      "buildId is required.",
      "BUILD_NOT_SUCCESSFUL"
    );
  }

  if (
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("\0")
  ) {
    throw new PreviewServiceError(
      "Invalid buildId.",
      "BUILD_NOT_SUCCESSFUL"
    );
  }

  return value;
}

function normalizeProjectId(projectId) {
  const value = String(projectId || "").trim();

  if (!value) {
    throw new PreviewServiceError(
      "projectId is required.",
      "BUILD_NOT_SUCCESSFUL"
    );
  }

  return value;
}

function normalizeUserId(userId) {
  const value = String(userId || "").trim();

  if (!value) {
    throw new PreviewServiceError(
      "userId is required.",
      "BUILD_NOT_SUCCESSFUL"
    );
  }

  return value;
}

function isSha256(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/i.test(value.trim())
  );
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch (_) {
    return false;
  }
}

async function statSafe(target) {
  try {
    return await fsp.stat(target);
  } catch (_) {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* DOCKER                                                                      */
/* -------------------------------------------------------------------------- */

function runProcess(command, args = [], options = {}) {
  const {
    cwd,
    env,
    timeoutMs = 60_000,
    maxOutput = 50_000,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...(env || {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    let settled = false;

    const finish = (result) => {
      if (settled) return;

      settled = true;
      resolve(result);
    };

    const fail = (error) => {
      if (settled) return;

      settled = true;
      reject(error);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch (_) {}

      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (_) {}
      }, 2_000);

      finish({
        code: null,
        signal: "TIMEOUT",
        stdout: stdout.slice(-maxOutput),
        stderr: stderr.slice(-maxOutput),
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);

      if (stdout.length > maxOutput) {
        stdout = stdout.slice(-maxOutput);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);

      if (stderr.length > maxOutput) {
        stderr = stderr.slice(-maxOutput);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);

      finish({
        code,
        signal,
        stdout,
        stderr,
        timedOut: false,
      });
    });
  });
}

async function docker(args, options = {}) {
  const result = await runProcess(
    DOCKER_COMMAND,
    args,
    {
      timeoutMs: options.timeoutMs || 60_000,
      maxOutput: options.maxOutput || 50_000,
    }
  );

  if (result.timedOut) {
    throw new PreviewServiceError(
      "Docker command timed out.",
      "DOCKER_UNAVAILABLE",
      {
        args,
      }
    );
  }

  return result;
}

async function assertDockerAvailable() {
  const result = await docker(
    ["info", "--format", "{{.ServerVersion}}"],
    {
      timeoutMs: 10_000,
    }
  );

  if (result.code !== 0) {
    throw new PreviewServiceError(
      `Docker is unavailable: ${String(result.stderr || "").trim()}`,
      "DOCKER_UNAVAILABLE"
    );
  }

  return String(result.stdout || "").trim();
}

/* -------------------------------------------------------------------------- */
/* PROJECT ACCESS                                                              */
/* -------------------------------------------------------------------------- */

async function validateProjectAccess(projectId, userId, project) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const normalizedUserId = normalizeUserId(userId);

  if (project) {
    const ownerId = String(
      project.userId ||
        project.ownerId ||
        project.user?._id ||
        ""
    );

    if (
      ownerId &&
      ownerId !== normalizedUserId
    ) {
      throw new PreviewServiceError(
        "Project access denied.",
        "BUILD_NOT_SUCCESSFUL"
      );
    }

    return project;
  }

  const query = {
    _id: normalizedProjectId,
    userId: normalizedUserId,
    isArchived: false,
  };

  const found = await Project.findOne(query).lean();

  if (!found) {
    throw new PreviewServiceError(
      "Project not found.",
      "BUILD_NOT_SUCCESSFUL"
    );
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* AUTHORITATIVE BUILD                                                        */
/* -------------------------------------------------------------------------- */

async function getAuthoritativeBuild({
  projectId,
  userId,
  buildId,
}) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const normalizedUserId = normalizeUserId(userId);
  const normalizedBuildId = normalizeBuildId(buildId);

  const build = await ProjectBuild.findOne({
    projectId: normalizedProjectId,
    userId: normalizedUserId,
    buildId: normalizedBuildId,
  }).lean();

  if (!build) {
    throw new PreviewServiceError(
      "Authoritative build not found.",
      "BUILD_NOT_SUCCESSFUL",
      {
        projectId: normalizedProjectId,
        buildId: normalizedBuildId,
      }
    );
  }

  const metadata = build.metadata || {};

  const authoritative =
    metadata.authoritative === true;

  const validationMode =
    String(metadata.validationMode || "").toLowerCase();

  const verified =
    metadata.verified === true ||
    metadata.artifactVerified === true ||
    metadata.authoritativeVerified === true;

  if (build.status !== "success") {
    throw new PreviewServiceError(
      `Build ${normalizedBuildId} is not successful.`,
      "BUILD_NOT_SUCCESSFUL",
      {
        status: build.status,
      }
    );
  }

  if (!authoritative) {
    throw new PreviewServiceError(
      "Preview requires an authoritative build.",
      "BUILD_NOT_SUCCESSFUL",
      {
        reason: "authoritative flag missing",
      }
    );
  }

  if (validationMode !== "authoritative") {
    throw new PreviewServiceError(
      "Preview requires authoritative validation.",
      "BUILD_NOT_SUCCESSFUL",
      {
        validationMode,
      }
    );
  }

  if (!verified) {
    throw new PreviewServiceError(
      "Authoritative build artifact is not verified.",
      "BUILD_NOT_SUCCESSFUL"
    );
  }

  if (!Array.isArray(build.artifacts) || build.artifacts.length === 0) {
    throw new PreviewServiceError(
      "Authoritative build has no artifacts.",
      "ARTIFACT_NOT_FOUND"
    );
  }

  return build;
}

/* -------------------------------------------------------------------------- */
/* ARTIFACT SELECTION                                                         */
/* -------------------------------------------------------------------------- */

function selectPreviewArtifact(build) {
  const artifacts = Array.isArray(build.artifacts)
    ? build.artifacts
    : [];

  const candidates = artifacts.filter((artifact) => {
    if (!artifact || !artifact.storageKey) {
      return false;
    }

    const type = String(artifact.type || "").toLowerCase();

    return (
      type === "build" ||
      type === "bundle" ||
      type === "archive" ||
      type === "other" ||
      !type
    );
  });

  if (!candidates.length) {
    throw new PreviewServiceError(
      "No previewable authoritative artifact was found.",
      "ARTIFACT_NOT_FOUND"
    );
  }

  /*
   * Prefer:
   * 1. build
   * 2. bundle
   * 3. archive
   * 4. other
   */
  const priority = {
    build: 1,
    bundle: 2,
    archive: 3,
    other: 4,
  };

  candidates.sort(
    (a, b) =>
      (priority[String(a.type || "").toLowerCase()] || 10) -
      (priority[String(b.type || "").toLowerCase()] || 10)
  );

  return candidates[0];
}

/* -------------------------------------------------------------------------- */
/* MANIFEST                                                                   */
/* -------------------------------------------------------------------------- */

async function readManifest(manifestPath) {
  let raw;

  try {
    raw = await fsp.readFile(manifestPath, "utf8");
  } catch (error) {
    throw new PreviewServiceError(
      `Unable to read artifact manifest: ${error.message}`,
      "ARTIFACT_NOT_FOUND"
    );
  }

  let manifest;

  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    throw new PreviewServiceError(
      `Artifact manifest is invalid JSON: ${error.message}`,
      "ARTIFACT_INVALID"
    );
  }

  if (!manifest || typeof manifest !== "object") {
    throw new PreviewServiceError(
      "Artifact manifest is empty or invalid.",
      "ARTIFACT_INVALID"
    );
  }

  return {
    manifest,
    raw,
  };
}

function extractManifestFiles(manifest) {
  const possible =
    manifest.files ||
    manifest.artifacts ||
    manifest.entries ||
    [];

  if (!Array.isArray(possible)) {
    return [];
  }

  return possible
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          path: normalizeRelativePath(entry),
        };
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      const relativePath =
        entry.path ||
        entry.relativePath ||
        entry.name ||
        entry.file;

      if (!relativePath) {
        return null;
      }

      return {
        path: normalizeRelativePath(relativePath),
        checksum:
          entry.checksum ||
          entry.sha256 ||
          entry.hash ||
          null,
        size:
          Number.isFinite(Number(entry.size))
            ? Number(entry.size)
            : null,
      };
    })
    .filter(Boolean);
}

function resolveManifestOutputDirectory(
  manifestPath,
  manifest
) {
  const manifestDir = path.dirname(manifestPath);

  const configured =
    manifest.outputDirectory ||
    manifest.outputPath ||
    manifest.output ||
    "output";

  const normalized = normalizeRelativePath(
    String(configured)
  );

  return ensureInside(
    manifestDir,
    path.resolve(manifestDir, normalized)
  );
}

/* -------------------------------------------------------------------------- */
/* ARTIFACT INTEGRITY                                                         */
/* -------------------------------------------------------------------------- */

async function validateArtifactTree({
  rootDir,
  manifest,
}) {
  const root = path.resolve(rootDir);

  if (!(await pathExists(root))) {
    throw new PreviewServiceError(
      "Authoritative artifact output directory does not exist.",
      "ARTIFACT_NOT_FOUND"
    );
  }

  const rootStat = await statSafe(root);

  if (!rootStat || !rootStat.isDirectory()) {
    throw new PreviewServiceError(
      "Authoritative artifact output is not a directory.",
      "ARTIFACT_INVALID"
    );
  }

  const manifestFiles = extractManifestFiles(manifest);

  let filesToCheck = manifestFiles;

  /*
   * If the manifest does not expose a file list, recursively inspect
   * the output directory while still enforcing hard limits.
   */
  if (!filesToCheck.length) {
    filesToCheck = await collectFiles(root);
  }

  if (filesToCheck.length > MAX_ARTIFACT_FILES) {
    throw new PreviewServiceError(
      "Artifact contains too many files.",
      "ARTIFACT_INVALID",
      {
        fileCount: filesToCheck.length,
      }
    );
  }

  let totalSize = 0;

  for (const entry of filesToCheck) {
    const relative = normalizeRelativePath(entry.path);
    const absolute = ensureInside(
      root,
      path.join(root, relative)
    );

    const stat = await statSafe(absolute);

    if (!stat || !stat.isFile()) {
      throw new PreviewServiceError(
        `Artifact file is missing: ${relative}`,
        "ARTIFACT_INVALID"
      );
    }

    if (stat.size > MAX_ARTIFACT_FILE_SIZE) {
      throw new PreviewServiceError(
        `Artifact file exceeds size limit: ${relative}`,
        "ARTIFACT_INVALID"
      );
    }

    totalSize += stat.size;

    if (totalSize > MAX_ARTIFACT_TOTAL_SIZE) {
      throw new PreviewServiceError(
        "Artifact exceeds total size limit.",
        "ARTIFACT_INVALID"
      );
    }

    if (entry.size !== null && entry.size !== stat.size) {
      throw new PreviewServiceError(
        `Artifact file size mismatch: ${relative}`,
        "ARTIFACT_CHECKSUM_MISMATCH"
      );
    }

    if (entry.checksum && isSha256(entry.checksum)) {
      const actual = await sha256File(absolute);

      if (
        actual.toLowerCase() !==
        String(entry.checksum).toLowerCase()
      ) {
        throw new PreviewServiceError(
          `Artifact checksum mismatch: ${relative}`,
          "ARTIFACT_CHECKSUM_MISMATCH"
        );
      }
    }
  }

  return {
    fileCount: filesToCheck.length,
    totalSize,
  };
}

/* -------------------------------------------------------------------------- */
/* RECURSIVE FILE COLLECTION                                                  */
/* -------------------------------------------------------------------------- */

async function collectFiles(rootDir) {
  const output = [];

  async function walk(current, relativeBase) {
    const entries = await fsp.readdir(current, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const absolute = path.join(
        current,
        entry.name
      );

      const relative = relativeBase
        ? path.posix.join(
            relativeBase,
            entry.name
          )
        : entry.name;

      const safeRelative =
        normalizeRelativePath(relative);

      if (entry.isDirectory()) {
        await walk(absolute, safeRelative);
        continue;
      }

      if (entry.isFile()) {
        const stat = await fsp.stat(absolute);

        output.push({
          path: safeRelative,
          size: stat.size,
        });

        if (output.length > MAX_ARTIFACT_FILES) {
          throw new PreviewServiceError(
            "Artifact contains too many files.",
            "ARTIFACT_INVALID"
          );
        }
      }
    }
  }

  await walk(rootDir, "");

  return output;
}

/* -------------------------------------------------------------------------- */
/* LOCAL ARTIFACT RESOLUTION                                                  */
/* -------------------------------------------------------------------------- */

function resolveLocalStorageKey(storageKey) {
  if (!AUTH_ARTIFACT_ROOT) {
    return null;
  }

  const normalized = normalizeRelativePath(
    storageKey
  );

  return ensureInside(
    AUTH_ARTIFACT_ROOT,
    path.resolve(
      AUTH_ARTIFACT_ROOT,
      normalized
    )
  );
}

async function resolveLocalArtifact(storageKey) {
  const manifestCandidate =
    resolveLocalStorageKey(storageKey);

  if (!manifestCandidate) {
    return null;
  }

  if (!(await pathExists(manifestCandidate))) {
    return null;
  }

  const stat = await fsp.stat(
    manifestCandidate
  );

  /*
   * Current Engineering Agent contract:
   *
   * .zyrionos-artifacts/<buildId>/manifest.json
   * .zyrionos-artifacts/<buildId>/output/
   */
  if (
    stat.isFile() &&
    path.basename(manifestCandidate).toLowerCase() ===
      "manifest.json"
  ) {
    const { manifest, raw } =
      await readManifest(manifestCandidate);

    const outputDir =
      resolveManifestOutputDirectory(
        manifestCandidate,
        manifest
      );

    return {
      mode: "manifest",
      manifestPath: manifestCandidate,
      manifest,
      rawManifest: raw,
      outputDir,
    };
  }

  /*
   * Future/alternate artifact:
   * direct directory storageKey.
   */
  if (stat.isDirectory()) {
    const possibleManifest =
      path.join(
        manifestCandidate,
        "manifest.json"
      );

    if (await pathExists(possibleManifest)) {
      const { manifest, raw } =
        await readManifest(possibleManifest);

      const outputDir =
        resolveManifestOutputDirectory(
          possibleManifest,
          manifest
        );

      return {
        mode: "manifest",
        manifestPath: possibleManifest,
        manifest,
        rawManifest: raw,
        outputDir,
      };
    }

    return {
      mode: "directory",
      manifestPath: null,
      manifest: {},
      rawManifest: null,
      outputDir: manifestCandidate,
    };
  }

  /*
   * Archive support.
   * We deliberately do not execute arbitrary archive contents.
   * Archive extraction can be added once the durable archive contract
   * is explicitly enabled.
   */
  if (stat.isFile()) {
    const lower = manifestCandidate.toLowerCase();

    if (
      lower.endsWith(".tar.gz") ||
      lower.endsWith(".tgz") ||
      lower.endsWith(".zip")
    ) {
      return {
        mode: "archive",
        archivePath: manifestCandidate,
      };
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* S3 ARTIFACT RESOLUTION                                                     */
/* -------------------------------------------------------------------------- */

let s3Client = null;

function getS3Client() {
  if (!AUTH_ARTIFACT_BUCKET) {
    return null;
  }

  if (s3Client) {
    return s3Client;
  }

  let S3Client;

  try {
    ({ S3Client } = require("@aws-sdk/client-s3"));
  } catch (_) {
    throw new PreviewServiceError(
      "AWS S3 support is configured but @aws-sdk/client-s3 is not installed.",
      "ARTIFACT_NOT_FOUND"
    );
  }

  s3Client = new S3Client({
    region:
      AUTH_ARTIFACT_REGION ||
      process.env.AWS_REGION ||
      "us-east-1",
  });

  return s3Client;
}

async function getS3ObjectBuffer(key) {
  const client = getS3Client();

  if (!client) {
    return null;
  }

  let GetObjectCommand;

  try {
    ({ GetObjectCommand } = require("@aws-sdk/client-s3"));
  } catch (_) {
    throw new PreviewServiceError(
      "AWS S3 support is unavailable.",
      "ARTIFACT_NOT_FOUND"
    );
  }

  let response;

  try {
    response = await client.send(
      new GetObjectCommand({
        Bucket: AUTH_ARTIFACT_BUCKET,
        Key: key,
      })
    );
  } catch (error) {
    if (
      error &&
      (
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404
      )
    ) {
      return null;
    }

    throw new PreviewServiceError(
      `Unable to read authoritative artifact from S3: ${error.message}`,
      "ARTIFACT_NOT_FOUND"
    );
  }

  if (!response.Body) {
    return null;
  }

  const chunks = [];

  for await (const chunk of response.Body) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

async function resolveS3Artifact(storageKey) {
  if (!AUTH_ARTIFACT_BUCKET) {
    return null;
  }

  const key = normalizeRelativePath(
    storageKey
  );

  /*
   * Current contract stores manifest.json.
   */
  if (key.toLowerCase().endsWith("manifest.json")) {
    const buffer =
      await getS3ObjectBuffer(key);

    if (!buffer) {
      return null;
    }

    const raw = buffer.toString("utf8");

    let manifest;

    try {
      manifest = JSON.parse(raw);
    } catch (error) {
      throw new PreviewServiceError(
        "S3 artifact manifest is invalid JSON.",
        "ARTIFACT_INVALID"
      );
    }

    const tempRoot =
      await fsp.mkdtemp(
        path.join(
          PREVIEW_WORK_ROOT,
          "s3-artifact-"
        )
      );

    const manifestPath =
      path.join(
        tempRoot,
        "manifest.json"
      );

    await fsp.writeFile(
      manifestPath,
      buffer
    );

    const outputDir =
      resolveManifestOutputDirectory(
        manifestPath,
        manifest
      );

    await fsp.mkdir(
      outputDir,
      {
        recursive: true,
      }
    );

    const files =
      extractManifestFiles(manifest);

    const artifactPrefix =
      path.posix.dirname(key);

    for (const entry of files) {
      const relative =
        normalizeRelativePath(
          entry.path
        );

      /*
       * First attempt:
       * <artifact-prefix>/output/<relative>
       *
       * Second attempt:
       * <artifact-prefix>/<relative>
       */
      const candidates = [
        path.posix.join(
          artifactPrefix,
          "output",
          relative
        ),
        path.posix.join(
          artifactPrefix,
          relative
        ),
      ];

      let downloaded = false;

      for (const candidate of candidates) {
        const fileBuffer =
          await getS3ObjectBuffer(
            candidate
          );

        if (!fileBuffer) {
          continue;
        }

        const destination =
          ensureInside(
            outputDir,
            path.join(
              outputDir,
              relative
            )
          );

        await fsp.mkdir(
          path.dirname(destination),
          {
            recursive: true,
          }
        );

        await fsp.writeFile(
          destination,
          fileBuffer
        );

        downloaded = true;
        break;
      }

      if (!downloaded) {
        throw new PreviewServiceError(
          `S3 artifact file is missing: ${relative}`,
          "ARTIFACT_NOT_FOUND"
        );
      }
    }

    return {
      mode: "manifest",
      manifestPath,
      manifest,
      rawManifest: raw,
      outputDir,
      cleanupRoot: tempRoot,
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* ARTIFACT MATERIALIZATION                                                   */
/* -------------------------------------------------------------------------- */

async function materializeArtifact({
  build,
  artifact,
}) {
  const storageKey =
    String(artifact.storageKey || "").trim();

  if (!storageKey) {
    throw new PreviewServiceError(
      "Authoritative artifact has no storageKey.",
      "ARTIFACT_NOT_FOUND"
    );
  }

  /*
   * 1. Local/shared artifact storage.
   */
  let resolved =
    await resolveLocalArtifact(
      storageKey
    );

  /*
   * 2. Durable S3 artifact storage.
   */
  if (!resolved) {
    resolved =
      await resolveS3Artifact(
        storageKey
      );
  }

  if (!resolved) {
    throw new PreviewServiceError(
      "Authoritative artifact is not available to the Preview runtime.",
      "ARTIFACT_NOT_FOUND",
      {
        storageKey,
        buildId: build.buildId,
        hint:
          "Configure AUTH_ARTIFACT_ROOT for shared local storage or AUTH_ARTIFACT_BUCKET for durable S3 storage.",
      }
    );
  }

  /*
   * Archives are intentionally not treated as the current artifact
   * contract. The current Engineering Agent produces a manifest/output
   * structure.
   */
  if (resolved.mode === "archive") {
    throw new PreviewServiceError(
      "Archive artifacts are not supported by the current Preview runtime contract. Preview expects an authoritative manifest/output artifact.",
      "ARTIFACT_INVALID"
    );
  }

  /*
   * Verify manifest checksum if ProjectBuild recorded it.
   */
  if (
    resolved.manifestPath &&
    artifact.checksum &&
    isSha256(artifact.checksum)
  ) {
    const actual =
      await sha256File(
        resolved.manifestPath
      );

    if (
      actual.toLowerCase() !==
      String(artifact.checksum).toLowerCase()
    ) {
      throw new PreviewServiceError(
        "Authoritative artifact manifest checksum mismatch.",
        "ARTIFACT_CHECKSUM_MISMATCH",
        {
          expected: artifact.checksum,
          actual,
        }
      );
    }
  }

  /*
   * Verify build ID when the manifest exposes it.
   */
  if (resolved.manifest) {
    const manifestBuildId =
      resolved.manifest.buildId ||
      resolved.manifest.id ||
      resolved.manifest.build?.buildId ||
      null;

    if (
      manifestBuildId &&
      String(manifestBuildId) !==
        String(build.buildId)
    ) {
      throw new PreviewServiceError(
        "Artifact manifest does not belong to the requested build.",
        "ARTIFACT_INVALID",
        {
          requestedBuildId: build.buildId,
          manifestBuildId,
        }
      );
    }
  }

  const integrity =
    await validateArtifactTree({
      rootDir: resolved.outputDir,
      manifest:
        resolved.manifest || {},
    });

  return {
    ...resolved,
    storageKey,
    integrity,
  };
}

/* -------------------------------------------------------------------------- */
/* PREVIEW WORKSPACE                                                          */
/* -------------------------------------------------------------------------- */

async function createRuntimeWorkspace(previewId) {
  await fsp.mkdir(
    PREVIEW_WORK_ROOT,
    {
      recursive: true,
    }
  );

  const workspace =
    await fsp.mkdtemp(
      path.join(
        PREVIEW_WORK_ROOT,
        `${previewId}-`
      )
    );

  return workspace;
}

async function copyDirectorySafe(
  sourceDir,
  destinationDir
) {
  await fsp.mkdir(
    destinationDir,
    {
      recursive: true,
    }
  );

  const entries =
    await fsp.readdir(
      sourceDir,
      {
        withFileTypes: true,
      }
    );

  for (const entry of entries) {
    const source =
      path.join(
        sourceDir,
        entry.name
      );

    const destination =
      ensureInside(
        destinationDir,
        path.join(
          destinationDir,
          entry.name
        )
      );

    if (entry.isDirectory()) {
      await copyDirectorySafe(
        source,
        destination
      );
      continue;
    }

    if (entry.isFile()) {
      const stat =
        await fsp.stat(source);

      if (
        stat.size >
        MAX_ARTIFACT_FILE_SIZE
      ) {
        throw new PreviewServiceError(
          `Artifact file exceeds preview limit: ${entry.name}`,
          "ARTIFACT_INVALID"
        );
      }

      await fsp.copyFile(
        source,
        destination
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* STATIC PREVIEW SERVER                                                      */
/* -------------------------------------------------------------------------- */

function createStaticServerScript(rootDir) {
  const safeRoot =
    JSON.stringify(
      path.resolve(rootDir)
    );

  return `'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = ${safeRoot};
const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

function safeResolve(requestPath) {
  let decoded;

  try {
    decoded = decodeURIComponent(requestPath);
  } catch (_) {
    return null;
  }

  decoded = decoded.split('?')[0];

  if (
    decoded.includes('\\0') ||
    decoded.includes('\\\\')
  ) {
    return null;
  }

  const relative = decoded.replace(/^\\\\/+/, '');

  if (
    relative.split('/').includes('..')
  ) {
    return null;
  }

  const target = path.resolve(
    ROOT,
    relative
  );

  if (
    target !== ROOT &&
    !target.startsWith(ROOT + path.sep)
  ) {
    return null;
  }

  return target;
}

function sendFile(res, filePath) {
  const extension =
    path.extname(filePath).toLowerCase();

  res.setHeader(
    'Content-Type',
    MIME[extension] ||
      'application/octet-stream'
  );

  res.setHeader(
    'Cache-Control',
    'no-cache'
  );

  const stream =
    fs.createReadStream(filePath);

  stream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 500;
    }

    res.end('Preview file read error');
  });

  stream.pipe(res);
}

const server =
  http.createServer(
    async (req, res) => {
      try {
        const parsed =
          new URL(
            req.url || '/',
            'http://preview.local'
          );

        let target =
          safeResolve(
            parsed.pathname
          );

        if (!target) {
          res.statusCode = 400;
          res.end('Bad Request');
          return;
        }

        let stat = null;

        try {
          stat =
            await fs.promises.stat(
              target
            );
        } catch (_) {
          stat = null;
        }

        if (
          stat &&
          stat.isDirectory()
        ) {
          target =
            path.join(
              target,
              'index.html'
            );

          try {
            stat =
              await fs.promises.stat(
                target
              );
          } catch (_) {
            stat = null;
          }
        }

        /*
         * SPA fallback:
         * /dashboard -> /index.html
         */
        if (
          !stat &&
          !path.extname(
            parsed.pathname
          )
        ) {
          const fallback =
            path.join(
              ROOT,
              'index.html'
            );

          try {
            const fallbackStat =
              await fs.promises.stat(
                fallback
              );

            if (
              fallbackStat.isFile()
            ) {
              target = fallback;
              stat = fallbackStat;
            }
          } catch (_) {}
        }

        if (
          !stat ||
          !stat.isFile()
        ) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        sendFile(
          res,
          target
        );
      } catch (_) {
        res.statusCode = 500;
        res.end('Preview runtime error');
      }
    }
  );

server.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      'ZYRIONOS_PREVIEW_READY'
    );
  }
);

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on(
  'SIGTERM',
  shutdown
);

process.on(
  'SIGINT',
  shutdown
);
`;
}

async function prepareRuntimeWorkspace({
  previewId,
  artifact,
}) {
  const workspace =
    await createRuntimeWorkspace(
      previewId
    );

  const staticRoot =
    path.join(
      workspace,
      "site"
    );

  await fsp.mkdir(
    staticRoot,
    {
      recursive: true,
    }
  );

  await copyDirectorySafe(
    artifact.outputDir,
    staticRoot
  );

  const indexPath =
    path.join(
      staticRoot,
      "index.html"
    );

  if (!(await pathExists(indexPath))) {
    throw new PreviewServiceError(
      "Authoritative build output does not contain index.html. The current Preview runtime supports static frontend builds.",
      "ARTIFACT_INVALID"
    );
  }

  const serverPath =
    path.join(
      workspace,
      "__zyrionos_preview_server.cjs"
    );

  await fsp.writeFile(
    serverPath,
    createStaticServerScript(
      staticRoot
    ),
    {
      encoding: "utf8",
      mode: 0o444,
    }
  );

  return {
    workspace,
    staticRoot,
    serverPath,
  };
}

/* -------------------------------------------------------------------------- */
/* PORT                                                                       */
/* -------------------------------------------------------------------------- */

function parsePublishedPort(output) {
  const text =
    String(output || "").trim();

  /*
   * Docker --format '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}'
   * gives a simple number.
   */
  const direct =
    text.match(/^\d+$/);

  if (direct) {
    return Number(direct[0]);
  }

  const matches =
    text.match(/(?:127\.0\.0\.1|0\.0\.0\.0|:::)?:(\d+)/g);

  if (matches && matches.length) {
    const last =
      matches[matches.length - 1];

    const portMatch =
      last.match(/:(\d+)$/);

    if (portMatch) {
      return Number(
        portMatch[1]
      );
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* RUNTIME CREATION                                                           */
/* -------------------------------------------------------------------------- */

async function startRuntime({
  previewId,
  runtimeWorkspace,
}) {
  const containerName =
    `zyrionos-preview-${previewId}`;

  /*
   * Clean up stale container with the same deterministic name.
   */
  await docker(
    [
      "rm",
      "-f",
      containerName,
    ],
    {
      timeoutMs: 15_000,
    }
  ).catch(() => {});

  const portArgs = [
    "-p",
  ];

  if (PREVIEW_PORT > 0) {
    portArgs.push(
      `${PREVIEW_HOST}:${PREVIEW_PORT}:3000`
    );
  } else {
    portArgs.push(
      `${PREVIEW_HOST}::3000`
    );
  }

  const args = [
    "run",
    "-d",

    "--name",
    containerName,

    "--cpus",
    PREVIEW_CPU,

    "--memory",
    PREVIEW_MEMORY,

    "--pids-limit",
    String(PREVIEW_PIDS),

    "--read-only",

    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",

    "--tmpfs",
    "/run:rw,noexec,nosuid,size=16m",

    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    "--restart",
    "no",

    "--network",
    PREVIEW_RUNTIME_NETWORK,

    ...portArgs,

    "-v",
    `${runtimeWorkspace}:/workspace:ro`,

    PREVIEW_NODE_IMAGE,

    "node",
    "/workspace/__zyrionos_preview_server.cjs",
  ];

  const result =
    await docker(
      args,
      {
        timeoutMs: 120_000,
      }
    );

  if (
    result.code !== 0 ||
    !String(result.stdout || "").trim()
  ) {
    throw new PreviewServiceError(
      `Preview container failed to start: ${String(result.stderr || "").trim()}`,
      "PREVIEW_RUNTIME_FAILED",
      {
        stderr: result.stderr,
        stdout: result.stdout,
      }
    );
  }

  const containerId =
    String(result.stdout)
      .trim()
      .split(/\s+/)[0];

  if (!containerId) {
    throw new PreviewServiceError(
      "Docker did not return a preview container ID.",
      "PREVIEW_RUNTIME_FAILED"
    );
  }

  let hostPort = null;

  if (PREVIEW_PORT > 0) {
    hostPort = PREVIEW_PORT;
  } else {
    const portResult =
      await docker([
        "port",
        containerId,
        "3000/tcp",
      ]);

    if (portResult.code === 0) {
      hostPort =
        parsePublishedPort(
          portResult.stdout
        );
    }
  }

  if (!hostPort) {
    await stopRuntimeContainer(
      containerId
    );

    throw new PreviewServiceError(
      "Docker preview container started but no host port was assigned.",
      "PREVIEW_RUNTIME_FAILED"
    );
  }

  return {
    containerId,
    containerName,
    hostPort,
    internalPort: 3000,
    image: PREVIEW_NODE_IMAGE,
  };
}

/* -------------------------------------------------------------------------- */
/* RUNTIME HEALTH                                                             */
/* -------------------------------------------------------------------------- */

async function httpHealthCheck(
  host,
  port,
  pathName = "/"
) {
  const url =
    `http://${host}:${port}${pathName}`;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      PREVIEW_HEALTH_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
        }
      );

    return {
      ok:
        response.status >= 200 &&
        response.status < 500,
      status:
        response.status,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForRuntimeHealth(
  hostPort
) {
  let lastResult = null;

  for (
    let attempt = 1;
    attempt <= PREVIEW_HEALTH_RETRIES;
    attempt++
  ) {
    lastResult =
      await httpHealthCheck(
        "127.0.0.1",
        hostPort,
        "/"
      );

    if (lastResult.ok) {
      return {
        ...lastResult,
        attempt,
      };
    }

    if (
      attempt <
      PREVIEW_HEALTH_RETRIES
    ) {
      await sleep(
        PREVIEW_HEALTH_RETRY_DELAY_MS
      );
    }
  }

  throw new PreviewServiceError(
    "Preview runtime health check failed.",
    "HEALTH_CHECK_FAILED",
    {
      hostPort,
      lastResult,
    }
  );
}

/* -------------------------------------------------------------------------- */
/* URL                                                                        */
/* -------------------------------------------------------------------------- */

function buildPreviewUrls({
  previewId,
  hostPort,
}) {
  const directUrl =
    `http://${PREVIEW_HOST}:${hostPort}`;

  if (!PREVIEW_BASE_URL) {
    return {
      url: directUrl,
      publicUrl: directUrl,
      hostname: PREVIEW_HOST,
    };
  }

  const base =
    PREVIEW_BASE_URL.replace(
      /\/+$/,
      ""
    );

  /*
   * Public preview gateway contract:
   *
   * PREVIEW_BASE_URL/preview/<previewId>
   *
   * A gateway/proxy can later route this ID to the runtime.
   */
  const publicUrl =
    `${base}/preview/${encodeURIComponent(
      previewId
    )}`;

  let hostname = null;

  try {
    hostname =
      new URL(
        publicUrl
      ).hostname;
  } catch (_) {
    hostname = null;
  }

  return {
    url: publicUrl,
    publicUrl,
    hostname,
    directUrl,
  };
}

/* -------------------------------------------------------------------------- */
/* RUNTIME STOP                                                               */
/* -------------------------------------------------------------------------- */

async function stopRuntimeContainer(
  containerId
) {
  if (!containerId) {
    return;
  }

  await docker(
    [
      "rm",
      "-f",
      String(containerId),
    ],
    {
      timeoutMs: 20_000,
    }
  ).catch(() => {});
}

async function cleanupRuntimeWorkspace(
  workspace
) {
  if (!workspace) {
    return;
  }

  try {
    const resolved =
      path.resolve(
        workspace
      );

    const root =
      path.resolve(
        PREVIEW_WORK_ROOT
      );

    if (
      resolved !== root &&
      !resolved.startsWith(
        `${root}${path.sep}`
      )
    ) {
      log(
        "warn",
        "Refusing to remove workspace outside preview root.",
        {
          workspace,
        }
      );

      return;
    }

    await fsp.rm(
      resolved,
      {
        recursive: true,
        force: true,
      }
    );
  } catch (error) {
    log(
      "warn",
      "Failed to cleanup preview workspace.",
      {
        workspace,
        error: error.message,
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PREVIEW NUMBER                                                             */
/* -------------------------------------------------------------------------- */

async function getNextPreviewNumber(
  projectId
) {
  const latest =
    await ProjectPreview
      .findOne({
        projectId,
      })
      .sort({
        previewNumber: -1,
      })
      .select({
        previewNumber: 1,
      })
      .lean();

  return (
    Number(
      latest?.previewNumber || 0
    ) + 1
  );
}

/* -------------------------------------------------------------------------- */
/* SOURCE HASH                                                                */
/* -------------------------------------------------------------------------- */

function resolveSourceHash({
  build,
  artifact,
}) {
  const metadata =
    build.metadata || {};

  const candidate =
    metadata.sourceHash ||
    metadata.sourceChecksum ||
    build.sourceHash ||
    artifact.checksum ||
    build.buildId;

  return String(candidate);
}

/* -------------------------------------------------------------------------- */
/* ACTIVE PREVIEW LIMIT                                                       */
/* -------------------------------------------------------------------------- */

async function assertPreviewCapacity(
  projectId
) {
  const count =
    await ProjectPreview.countDocuments({
      projectId,
      status: {
        $in: [
          "queued",
          "building",
          "starting",
          "ready",
        ],
      },
    });

  if (
    count >=
    PREVIEW_MAX_ACTIVE
  ) {
    throw new PreviewServiceError(
      `Preview limit reached. Maximum active previews: ${PREVIEW_MAX_ACTIVE}.`,
      "PREVIEW_LIMIT_REACHED",
      {
        count,
        limit: PREVIEW_MAX_ACTIVE,
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PREVIEW SERIALIZATION                                                      */
/* -------------------------------------------------------------------------- */

function serializePreview(
  preview
) {
  if (!preview) {
    return null;
  }

  const source =
    typeof preview.toObject === "function"
      ? preview.toObject()
      : {
          ...preview,
        };

  const runtimeInfo =
    source.runtimeInfo || {};

  /*
   * Never expose infrastructure internals.
   */
  delete source.containerId;
  delete source.workerId;
  delete source.queueName;

  delete source.runtimeInfo?.hostPort;
  delete source.runtimeInfo?.internalPort;
  delete source.runtimeInfo?.image;

  delete source.metadata?.artifactPath;
  delete source.metadata?.artifactStorageKey;
  delete source.metadata?.runtimeWorkspace;

  source.runtimeInfo = {
    status:
      runtimeInfo.status ||
      "unknown",
  };

  return source;
}

/* -------------------------------------------------------------------------- */
/* CREATE PREVIEW                                                             */
/* -------------------------------------------------------------------------- */

async function createPreview({
  projectId,
  userId,
  buildId,
  project,
  requestContext = {},
}) {
  const normalizedProjectId =
    normalizeProjectId(
      projectId
    );

  const normalizedUserId =
    normalizeUserId(
      userId
    );

  const normalizedBuildId =
    normalizeBuildId(
      buildId
    );

  log(
    "info",
    "Creating authoritative preview.",
    {
      projectId:
        normalizedProjectId,
      userId:
        normalizedUserId,
      buildId:
        normalizedBuildId,
    }
  );

  const access =
    await validateProjectAccess(
      normalizedProjectId,
      normalizedUserId,
      project
    );

  await assertPreviewCapacity(
    normalizedProjectId
  );

  await assertDockerAvailable();

  const build =
    await getAuthoritativeBuild({
      projectId:
        normalizedProjectId,
      userId:
        normalizedUserId,
      buildId:
        normalizedBuildId,
    });

  const artifact =
    selectPreviewArtifact(
      build
    );

  const materialized =
    await materializeArtifact({
      build,
      artifact,
    });

  const previewId =
    randomId("preview_");

  const previewNumber =
    await getNextPreviewNumber(
      normalizedProjectId
    );

  const sourceHash =
    resolveSourceHash({
      build,
      artifact,
    });

  let runtimeWorkspace = null;

  let cleanupArtifactRoot =
    materialized.cleanupRoot || null;

  try {
    runtimeWorkspace =
      await prepareRuntimeWorkspace({
        previewId,
        artifact: materialized,
      });

    const expiresAt =
      new Date(
        Date.now() +
          PREVIEW_TTL_MS
      );

    const framework =
      String(
        build.framework ||
          access.framework ||
          "static"
      );

    const runtime =
      String(
        build.runtime ||
          "node"
      );

    const nodeVersion =
      String(
        build.nodeVersion ||
          "20"
      );

    const packageManager =
      String(
        build.packageManager ||
          "npm"
      );

    /*
     * Create initial DB record BEFORE starting container.
     *
     * This gives the frontend a durable preview state.
     */
    let preview =
      await ProjectPreview.create({
        projectId:
          normalizedProjectId,

        userId:
          normalizedUserId,

        previewId,

        previewNumber,

        buildId:
          normalizedBuildId,

        sourceVersionId:
          build.sourceVersionId ||
          build.sourceId ||
          null,

        sourceHash,

        framework,

        runtime,

        nodeVersion,

        packageManager,

        status: "starting",

        startedAt: now(),

        expiresAt,

        runtimeInfo: {
          status: "starting",
        },

        healthCheck: {
          status: "unknown",
        },

        secretsInjected: false,

        productionSecretsBlocked: true,

        networkAccess: "restricted",

        metadata: {
          serviceVersion:
            VERSION,

          artifactType:
            artifact.type ||
            "build",

          artifactChecksum:
            artifact.checksum ||
            null,

          artifactFileCount:
            materialized.integrity.fileCount,

          artifactSize:
            materialized.integrity.totalSize,

          trigger:
            requestContext.trigger ||
            "manual",
        },
      });

    log(
      "info",
      "Preview record created.",
      {
        previewId,
        previewNumber,
        buildId:
          normalizedBuildId,
      }
    );

    let runtime;

    try {
      runtime =
        await startRuntime({
          previewId,
          runtimeWorkspace:
            runtimeWorkspace.workspace,
        });
    } catch (error) {
      await ProjectPreview.updateOne(
        {
          _id: preview._id,
        },
        {
          $set: {
            status: "failed",
            runtimeInfo: {
              status: "crashed",
            },
            errors: [
              {
                code:
                  error.code ||
                  "PREVIEW_RUNTIME_FAILED",
                message:
                  error.message,
                at: now(),
              },
            ],
          },
        }
      );

      throw error;
    }

    activeRuntimes.set(
      previewId,
      {
        previewId,

        containerId:
          runtime.containerId,

        containerName:
          runtime.containerName,

        hostPort:
          runtime.hostPort,

        internalPort:
          runtime.internalPort,

        image:
          runtime.image,

        workspace:
          runtimeWorkspace.workspace,

        artifactRoot:
          cleanupArtifactRoot,

        startedAt:
          Date.now(),
      }
    );

    await ProjectPreview.updateOne(
      {
        _id: preview._id,
      },
      {
        $set: {
          runtimeInfo: {
            status: "starting",
            hostPort:
              runtime.hostPort,
            internalPort:
              runtime.internalPort,
            image:
              runtime.image,
          },
        },
      }
    );

    let health;

    try {
      health =
        await waitForRuntimeHealth(
          runtime.hostPort
        );
    } catch (error) {
      await stopRuntimeContainer(
        runtime.containerId
      );

      activeRuntimes.delete(
        previewId
      );

      await cleanupRuntimeWorkspace(
        runtimeWorkspace.workspace
      );

      if (cleanupArtifactRoot) {
        await cleanupRuntimeWorkspace(
          cleanupArtifactRoot
        );
      }

      await ProjectPreview.updateOne(
        {
          _id: preview._id,
        },
        {
          $set: {
            status: "failed",

            runtimeInfo: {
              status: "crashed",
            },

            healthCheck: {
              status: "failed",
              lastCheckedAt: now(),
              lastStatusCode:
                error.details?.lastResult
                  ?.status || null,
            },

            errors: [
              {
                code:
                  error.code ||
                  "HEALTH_CHECK_FAILED",
                message:
                  error.message,
                at: now(),
              },
            ],
          },
        }
      );

      throw error;
    }

    const urls =
      buildPreviewUrls({
        previewId,
        hostPort:
          runtime.hostPort,
      });

    /*
     * IMPORTANT:
     * runtimeInfo.status must be "running"
     * before status becomes "ready".
     * ProjectPreview model explicitly validates this.
     */
    await ProjectPreview.updateOne(
      {
        _id: preview._id,
      },
      {
        $set: {
          status: "ready",

          url:
            urls.url,

          publicUrl:
            urls.publicUrl,

          hostname:
            urls.hostname,

          runtimeInfo: {
            status: "running",
            hostPort:
              runtime.hostPort,
            internalPort:
              runtime.internalPort,
            image:
              runtime.image,
          },

          healthCheck: {
            status: "healthy",
            lastCheckedAt: now(),
            lastStatusCode:
              health.status,
            responseTimeMs: null,
          },
        },
      }
    );

    preview =
      await ProjectPreview.findOne({
        _id: preview._id,
      });

    log(
      "info",
      "Authoritative preview is ready.",
      {
        previewId,
        buildId:
          normalizedBuildId,
        url:
          urls.url,
        publicUrl:
          urls.publicUrl,
        hostPort:
          runtime.hostPort,
        fileCount:
          materialized.integrity.fileCount,
      }
    );

    return serializePreview(
      preview
    );
  } catch (error) {
    if (runtimeWorkspace?.workspace) {
      await cleanupRuntimeWorkspace(
        runtimeWorkspace.workspace
      );
    }

    if (cleanupArtifactRoot) {
      await cleanupRuntimeWorkspace(
        cleanupArtifactRoot
      );
    }

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* GET ACTIVE PREVIEW                                                         */
/* -------------------------------------------------------------------------- */

async function getActivePreview({
  projectId,
  userId,
}) {
  const preview =
    await ProjectPreview.findOne({
      projectId:
        normalizeProjectId(
          projectId
        ),

      userId:
        normalizeUserId(
          userId
        ),

      status: "ready",
    })
      .sort({
        createdAt: -1,
      })
      .lean();

  return preview
    ? serializePreview(preview)
    : null;
}

/* -------------------------------------------------------------------------- */
/* GET PREVIEW                                                                */
/* -------------------------------------------------------------------------- */

async function getPreview({
  projectId,
  userId,
  previewId,
}) {
  const preview =
    await ProjectPreview.findOne({
      projectId:
        normalizeProjectId(
          projectId
        ),

      userId:
        normalizeUserId(
          userId
        ),

      previewId:
        String(previewId || "").trim(),
    }).lean();

  if (!preview) {
    throw new PreviewServiceError(
      "Preview not found.",
      "PREVIEW_NOT_FOUND"
    );
  }

  return serializePreview(
    preview
  );
}

/* -------------------------------------------------------------------------- */
/* LIST PREVIEWS                                                              */
/* -------------------------------------------------------------------------- */

async function listPreviews({
  projectId,
  userId,
  limit = 20,
}) {
  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 20,
        1
      ),
      100
    );

  const previews =
    await ProjectPreview.find({
      projectId:
        normalizeProjectId(
          projectId
        ),

      userId:
        normalizeUserId(
          userId
        ),
    })
      .sort({
        createdAt: -1,
      })
      .limit(safeLimit)
      .lean();

  return previews.map(
    serializePreview
  );
}

/* -------------------------------------------------------------------------- */
/* HEALTH                                                                     */
/* -------------------------------------------------------------------------- */

async function getPreviewHealth({
  projectId,
  userId,
  previewId,
}) {
  const normalizedProjectId =
    normalizeProjectId(
      projectId
    );

  const normalizedUserId =
    normalizeUserId(
      userId
    );

  const normalizedPreviewId =
    String(
      previewId || ""
    ).trim();

  const preview =
    await ProjectPreview.findOne({
      projectId:
        normalizedProjectId,

      userId:
        normalizedUserId,

      previewId:
        normalizedPreviewId,
    });

  if (!preview) {
    throw new PreviewServiceError(
      "Preview not found.",
      "PREVIEW_NOT_FOUND"
    );
  }

  const runtime =
    activeRuntimes.get(
      normalizedPreviewId
    );

  if (!runtime) {
    return {
      previewId:
        normalizedPreviewId,

      status:
        preview.runtimeInfo?.status ||
        "unknown",

      healthy:
        preview.healthCheck?.status ===
        "healthy",

      runtimeRegistered: false,
    };
  }

  const health =
    await httpHealthCheck(
      "127.0.0.1",
      runtime.hostPort,
      "/"
    );

  const healthStatus =
    health.ok
      ? "healthy"
      : "unhealthy";

  await ProjectPreview.updateOne(
    {
      _id: preview._id,
    },
    {
      $set: {
        "healthCheck.status":
          healthStatus,

        "healthCheck.lastCheckedAt":
          now(),

        "healthCheck.lastStatusCode":
          health.status,

        "runtimeInfo.status":
          health.ok
            ? "running"
            : "unknown",
      },
    }
  );

  return {
    previewId:
      normalizedPreviewId,

    status:
      health.ok
        ? "running"
        : "unknown",

    healthy:
      health.ok,

    statusCode:
      health.status,

    url:
      preview.publicUrl ||
      preview.url ||
      null,

    runtimeRegistered: true,
  };
}

/* -------------------------------------------------------------------------- */
/* STOP PREVIEW                                                               */
/* -------------------------------------------------------------------------- */

async function stopPreview({
  projectId,
  userId,
  previewId,
}) {
  const normalizedProjectId =
    normalizeProjectId(
      projectId
    );

  const normalizedUserId =
    normalizeUserId(
      userId
    );

  const normalizedPreviewId =
    String(
      previewId || ""
    ).trim();

  const preview =
    await ProjectPreview.findOne({
      projectId:
        normalizedProjectId,

      userId:
        normalizedUserId,

      previewId:
        normalizedPreviewId,
    });

  if (!preview) {
    throw new PreviewServiceError(
      "Preview not found.",
      "PREVIEW_NOT_FOUND"
    );
  }

  const runtime =
    activeRuntimes.get(
      normalizedPreviewId
    );

  if (runtime) {
    await stopRuntimeContainer(
      runtime.containerId
    );

    await cleanupRuntimeWorkspace(
      runtime.workspace
    );

    if (runtime.artifactRoot) {
      await cleanupRuntimeWorkspace(
        runtime.artifactRoot
      );
    }

    activeRuntimes.delete(
      normalizedPreviewId
    );
  }

  await ProjectPreview.updateOne(
    {
      _id: preview._id,
    },
    {
      $set: {
        status: "stopped",

        stoppedAt: now(),

        "runtimeInfo.status":
          "stopped",
      },
    }
  );

  const updated =
    await ProjectPreview.findOne({
      _id: preview._id,
    }).lean();

  log(
    "info",
    "Preview stopped.",
    {
      previewId:
        normalizedPreviewId,
    }
  );

  return serializePreview(
    updated
  );
}

/* -------------------------------------------------------------------------- */
/* EXPIRE PREVIEW                                                             */
/* -------------------------------------------------------------------------- */

async function expirePreview({
  projectId,
  userId,
  previewId,
}) {
  const normalizedProjectId =
    normalizeProjectId(
      projectId
    );

  const normalizedUserId =
    normalizeUserId(
      userId
    );

  const normalizedPreviewId =
    String(
      previewId || ""
    ).trim();

  const preview =
    await ProjectPreview.findOne({
      projectId:
        normalizedProjectId,

      userId:
        normalizedUserId,

      previewId:
        normalizedPreviewId,
    });

  if (!preview) {
    throw new PreviewServiceError(
      "Preview not found.",
      "PREVIEW_NOT_FOUND"
    );
  }

  const runtime =
    activeRuntimes.get(
      normalizedPreviewId
    );

  if (runtime) {
    await stopRuntimeContainer(
      runtime.containerId
    );

    await cleanupRuntimeWorkspace(
      runtime.workspace
    );

    if (runtime.artifactRoot) {
      await cleanupRuntimeWorkspace(
        runtime.artifactRoot
      );
    }

    activeRuntimes.delete(
      normalizedPreviewId
    );
  }

  await ProjectPreview.updateOne(
    {
      _id: preview._id,
    },
    {
      $set: {
        status: "expired",

        expiredAt: now(),

        "runtimeInfo.status":
          "stopped",
      },
    }
  );

  const updated =
    await ProjectPreview.findOne({
      _id: preview._id,
    }).lean();

  return serializePreview(
    updated
  );
}

/* -------------------------------------------------------------------------- */
/* CLEANUP EXPIRED PREVIEWS                                                   */
/* -------------------------------------------------------------------------- */

async function cleanupExpiredPreviews() {
  const cutoff =
    new Date(
      Date.now() -
        PREVIEW_TTL_MS
    );

  const candidates =
    await ProjectPreview.find({
      status: {
        $in: [
          "ready",
          "starting",
          "building",
        ],
      },

      $or: [
        {
          expiresAt: {
            $lte: now(),
          },
        },
        {
          createdAt: {
            $lte: cutoff,
          },
        },
      ],
    })
      .limit(100);

  let cleaned = 0;

  for (const preview of candidates) {
    try {
      const runtime =
        activeRuntimes.get(
          preview.previewId
        );

      if (runtime) {
        await stopRuntimeContainer(
          runtime.containerId
        );

        await cleanupRuntimeWorkspace(
          runtime.workspace
        );

        if (runtime.artifactRoot) {
          await cleanupRuntimeWorkspace(
            runtime.artifactRoot
          );
        }

        activeRuntimes.delete(
          preview.previewId
        );
      }

      await ProjectPreview.updateOne(
        {
          _id: preview._id,
        },
        {
          $set: {
            status: "expired",

            expiredAt: now(),

            "runtimeInfo.status":
              "stopped",
          },
        }
      );

      cleaned += 1;
    } catch (error) {
      log(
        "warn",
        "Failed to cleanup expired preview.",
        {
          previewId:
            preview.previewId,
          error:
            error.message,
        }
      );
    }
  }

  if (cleaned > 0) {
    log(
      "info",
      "Expired previews cleaned.",
      {
        cleaned,
      }
    );
  }

  return {
    cleaned,
  };
}

/* -------------------------------------------------------------------------- */
/* SHUTDOWN ALL                                                               */
/* -------------------------------------------------------------------------- */

async function shutdownAllPreviews() {
  const entries =
    Array.from(
      activeRuntimes.values()
    );

  for (const runtime of entries) {
    try {
      await stopRuntimeContainer(
        runtime.containerId
      );

      await cleanupRuntimeWorkspace(
        runtime.workspace
      );

      if (runtime.artifactRoot) {
        await cleanupRuntimeWorkspace(
          runtime.artifactRoot
        );
      }
    } catch (error) {
      log(
        "warn",
        "Failed to shutdown preview runtime.",
        {
          previewId:
            runtime.previewId,
          error:
            error.message,
        }
      );
    }
  }

  activeRuntimes.clear();
}

/* -------------------------------------------------------------------------- */
/* SERVICE INFO                                                               */
/* -------------------------------------------------------------------------- */

function getServiceInfo() {
  return {
    name: SERVICE_NAME,

    version: VERSION,

    architecture:
      "authoritative-build-static-preview",

    authoritativeBuildRequired:
      true,

    rebuildsProject:
      false,

    productionDeployment:
      false,

    dependencyInstall:
      false,

    runtime:
      "isolated-docker",

    runtimeNetwork:
      PREVIEW_RUNTIME_NETWORK,

    activeRuntimeCount:
      activeRuntimes.size,

    maxActivePreviews:
      PREVIEW_MAX_ACTIVE,

    artifactRootConfigured:
      Boolean(AUTH_ARTIFACT_ROOT),

    artifactBucketConfigured:
      Boolean(AUTH_ARTIFACT_BUCKET),

    publicBaseUrlConfigured:
      Boolean(PREVIEW_BASE_URL),
  };
}

/* -------------------------------------------------------------------------- */
/* EXPORTS                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  VERSION,
  SERVICE_NAME,

  PreviewServiceError,

  createPreview,

  getActivePreview,

  getPreview,

  listPreviews,

  getPreviewHealth,

  stopPreview,

  expirePreview,

  cleanupExpiredPreviews,

  shutdownAllPreviews,

  getServiceInfo,

  assertDockerAvailable,
};
