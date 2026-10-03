// server/services/previewService.js

"use strict";

/**
 * =========================================================
 * ZYRION OS — PREVIEW SERVICE
 * =========================================================
 *
 * Flow:
 *
 * Successful Authoritative Build
 *          ↓
 * ProjectBuild.artifacts[]
 *          ↓
 * Artifact verification
 *          ↓
 * Artifact extraction
 *          ↓
 * Runtime dependency preparation
 *          ↓
 * Isolated Docker runtime
 *          ↓
 * Health check
 *          ↓
 * Preview URL
 *
 * IMPORTANT:
 * - This service NEVER rebuilds source code.
 * - Preview MUST consume a successful authoritative build.
 * - Runtime executes only the verified build artifact.
 * =========================================================
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");

const ProjectBuild = require("../models/projectBuildModel");
const ProjectPreview = require("../models/projectPreviewModel");

const execFileAsync = promisify(execFile);

/* =========================================================
   SERVICE CONFIG
   ========================================================= */

const SERVICE_VERSION = "3.0.0";

const PREVIEW_HOST =
  process.env.PREVIEW_HOST || "127.0.0.1";

const PREVIEW_BASE_URL =
  process.env.PREVIEW_BASE_URL || "";

const PREVIEW_PORT =
  Number(process.env.PREVIEW_PORT || 0);

const PREVIEW_TTL_MS =
  Number(process.env.PREVIEW_TTL_MS || 30 * 60 * 1000);

const PREVIEW_MAX_ACTIVE =
  Number(process.env.PREVIEW_MAX_ACTIVE || 3);

const PREVIEW_CPU =
  process.env.PREVIEW_CPU || "1";

const PREVIEW_MEMORY =
  process.env.PREVIEW_MEMORY || "512m";

const PREVIEW_PIDS =
  process.env.PREVIEW_PIDS || "128";

const PREVIEW_NETWORK =
  process.env.PREVIEW_NETWORK || "bridge";

const PREVIEW_RUNTIME_NETWORK =
  process.env.PREVIEW_RUNTIME_NETWORK || "none";

const PREVIEW_INSTALL_TIMEOUT =
  Number(
    process.env.PREVIEW_INSTALL_TIMEOUT ||
      10 * 60 * 1000
  );

const PREVIEW_START_TIMEOUT =
  Number(
    process.env.PREVIEW_START_TIMEOUT ||
      30 * 1000
  );

const PREVIEW_HEALTH_TIMEOUT =
  Number(
    process.env.PREVIEW_HEALTH_TIMEOUT ||
      30 * 1000
  );

const PREVIEW_HEALTH_INTERVAL =
  Number(
    process.env.PREVIEW_HEALTH_INTERVAL ||
      1000
  );

const PREVIEW_MAX_ARTIFACT_SIZE =
  Number(
    process.env.PREVIEW_MAX_ARTIFACT_SIZE ||
      500 * 1024 * 1024
  );

const PREVIEW_MAX_LOG_SIZE =
  Number(
    process.env.PREVIEW_MAX_LOG_SIZE ||
      200 * 1024
  );

const AUTH_ARTIFACT_ROOT =
  process.env.AUTH_ARTIFACT_ROOT || "";

const AUTH_ARTIFACT_BUCKET =
  process.env.AUTH_ARTIFACT_BUCKET || "";

const AUTH_ARTIFACT_REGION =
  process.env.AUTH_ARTIFACT_REGION ||
  process.env.AWS_REGION ||
  "ap-south-1";

/* =========================================================
   DOCKER IMAGES
   ========================================================= */

const NODE_IMAGES = {
  "20": "node:20-bookworm-slim",
  "22": "node:22-bookworm-slim"
};

const BUN_IMAGE =
  process.env.PREVIEW_BUN_DOCKER_IMAGE ||
  "oven/bun:1";

/* =========================================================
   STATUS
   ========================================================= */

const ACTIVE_STATUSES = [
  "queued",
  "starting",
  "running",
  "ready"
];

const STOPPED_STATUSES = [
  "stopped",
  "expired",
  "failed"
];

/* =========================================================
   ERROR CLASS
   ========================================================= */

class PreviewServiceError extends Error {
  constructor(
    message,
    code = "PREVIEW_ERROR",
    statusCode = 500,
    details = {}
  ) {
    super(message);

    this.name = "PreviewServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    Error.captureStackTrace(
      this,
      PreviewServiceError
    );
  }
}

/* =========================================================
   ACTIVE RUNTIME REGISTRY
   ========================================================= */

const activeRuntimes = new Map();

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function now() {
  return new Date();
}

function normalizeId(value) {
  if (!value) return "";
  return String(value).trim();
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function clampText(
  value,
  max = PREVIEW_MAX_LOG_SIZE
) {
  if (!value) return "";

  const text = String(value);

  if (text.length <= max) {
    return text;
  }

  return (
    text.slice(0, max) +
    "\n...[truncated]"
  );
}

function safeErrorMessage(error) {
  if (!error) {
    return "Unknown preview error";
  }

  return clampText(
    error.message ||
      String(error)
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/* =========================================================
   HASH
   ========================================================= */

async function sha256File(filePath) {
  return new Promise(
    (resolve, reject) => {
      const hash =
        crypto.createHash("sha256");

      const stream =
        fs.createReadStream(filePath);

      stream.on("error", reject);

      stream.on(
        "data",
        (chunk) => hash.update(chunk)
      );

      stream.on(
        "end",
        () => resolve(hash.digest("hex"))
      );
    }
  );
}

/* =========================================================
   DOCKER
   ========================================================= */

function dockerAvailable() {
  return execFileAsync(
    "docker",
    ["version", "--format", "{{.Server.Version}}"],
    {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    }
  )
    .then(() => true)
    .catch(() => false);
}

function spawnDocker(args, options = {}) {
  return spawn(
    "docker",
    args,
    {
      stdio: [
        "ignore",
        "pipe",
        "pipe"
      ],
      ...options
    }
  );
}

async function dockerExec(
  args,
  {
    timeout = 30000,
    maxBuffer = 1024 * 1024
  } = {}
) {
  try {
    const result =
      await execFileAsync(
        "docker",
        args,
        {
          timeout,
          maxBuffer
        }
      );

    return {
      stdout:
        result.stdout || "",
      stderr:
        result.stderr || "",
      exitCode: 0
    };
  } catch (error) {
    return {
      stdout:
        error.stdout || "",
      stderr:
        error.stderr ||
        error.message ||
        "",
      exitCode:
        typeof error.code === "number"
          ? error.code
          : 1
    };
  }
}

/* =========================================================
   PACKAGE MANAGER
   ========================================================= */

function detectPackageManager(
  packageJson,
  workspace
) {
  const packageManager =
    String(
      packageJson?.packageManager || ""
    )
      .trim()
      .toLowerCase();

  if (packageManager.startsWith("pnpm")) {
    return "pnpm";
  }

  if (packageManager.startsWith("yarn")) {
    return "yarn";
  }

  if (packageManager.startsWith("bun")) {
    return "bun";
  }

  if (
    fs.existsSync(
      path.join(
        workspace,
        "pnpm-lock.yaml"
      )
    )
  ) {
    return "pnpm";
  }

  if (
    fs.existsSync(
      path.join(
        workspace,
        "yarn.lock"
      )
    )
  ) {
    return "yarn";
  }

  if (
    fs.existsSync(
      path.join(
        workspace,
        "bun.lockb"
      )
    ) ||
    fs.existsSync(
      path.join(
        workspace,
        "bun.lock"
      )
    )
  ) {
    return "bun";
  }

  return "npm";
}

/* =========================================================
   NODE VERSION
   ========================================================= */

function normalizeNodeVersion(
  value
) {
  const raw =
    String(value || "20")
      .trim();

  if (raw.startsWith("22")) {
    return "22";
  }

  return "20";
}

function getRuntimeImage(
  nodeVersion,
  packageManager
) {
  if (packageManager === "bun") {
    return BUN_IMAGE;
  }

  return (
    NODE_IMAGES[
      normalizeNodeVersion(
        nodeVersion
      )
    ] ||
    NODE_IMAGES["20"]
  );
}

/* =========================================================
   PACKAGE COMMANDS
   ========================================================= */

function getInstallCommand(
  packageManager,
  workspace
) {
  const hasPackageLock =
    fs.existsSync(
      path.join(
        workspace,
        "package-lock.json"
      )
    );

  const hasPnpmLock =
    fs.existsSync(
      path.join(
        workspace,
        "pnpm-lock.yaml"
      )
    );

  const hasYarnLock =
    fs.existsSync(
      path.join(
        workspace,
        "yarn.lock"
      )
    );

  const hasBunLock =
    fs.existsSync(
      path.join(
        workspace,
        "bun.lock"
      )
    ) ||
    fs.existsSync(
      path.join(
        workspace,
        "bun.lockb"
      )
    );

  switch (packageManager) {
    case "pnpm":
      return hasPnpmLock
        ? "corepack enable && corepack pnpm install --frozen-lockfile"
        : "corepack enable && corepack pnpm install";

    case "yarn":
      return hasYarnLock
        ? "corepack enable && corepack yarn install --immutable"
        : "corepack enable && corepack yarn install";

    case "bun":
      return hasBunLock
        ? "bun install --frozen-lockfile"
        : "bun install";

    default:
      return hasPackageLock
        ? "npm ci"
        : "npm install";
  }
}

function getRunCommand(
  packageManager,
  script
) {
  switch (packageManager) {
    case "pnpm":
      return `corepack enable && corepack pnpm run ${script}`;

    case "yarn":
      return `corepack enable && corepack yarn run ${script}`;

    case "bun":
      return `bun run ${script}`;

    default:
      return `npm run ${script}`;
  }
}

/* =========================================================
   PACKAGE.JSON
   ========================================================= */

async function readPackageJson(
  workspace
) {
  const packagePath =
    path.join(
      workspace,
      "package.json"
    );

  if (
    !fs.existsSync(packagePath)
  ) {
    throw new PreviewServiceError(
      "Preview artifact does not contain package.json",
      "PREVIEW_PACKAGE_JSON_MISSING",
      422
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        await fsp.readFile(
          packagePath,
          "utf8"
        )
      );
  } catch (error) {
    throw new PreviewServiceError(
      "Preview artifact contains invalid package.json",
      "PREVIEW_PACKAGE_JSON_INVALID",
      422,
      {
        reason:
          safeErrorMessage(error)
      }
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object"
  ) {
    throw new PreviewServiceError(
      "Invalid package.json structure",
      "PREVIEW_PACKAGE_JSON_INVALID",
      422
    );
  }

  return parsed;
}

/* =========================================================
   START SCRIPT
   ========================================================= */

function resolveStartScript(
  packageJson
) {
  const scripts =
    packageJson?.scripts || {};

  if (
    typeof scripts.start ===
    "string" &&
    scripts.start.trim()
  ) {
    return "start";
  }

  if (
    typeof scripts.preview ===
    "string" &&
    scripts.preview.trim()
  ) {
    return "preview";
  }

  if (
    typeof scripts.dev ===
    "string" &&
    scripts.dev.trim()
  ) {
    return "dev";
  }

  throw new PreviewServiceError(
    "Preview artifact has no start, preview, or dev script",
    "PREVIEW_START_SCRIPT_MISSING",
    422
  );
}

/* =========================================================
   START COMMAND
   ========================================================= */

function resolveStartCommand({
  packageJson,
  packageManager,
  project
}) {
  const configured =
    project?.settings?.previewCommand;

  if (
    typeof configured === "string" &&
    configured.trim()
  ) {
    return configured.trim();
  }

  const script =
    resolveStartScript(
      packageJson
    );

  return getRunCommand(
    packageManager,
    script
  );
}

/* =========================================================
   ARTIFACT STORAGE
   ========================================================= */

function resolveLocalArtifactPath(
  storageKey
) {
  if (
    !AUTH_ARTIFACT_ROOT
  ) {
    return null;
  }

  const normalizedKey =
    String(storageKey || "")
      .replace(/^\/+/, "");

  if (
    !normalizedKey ||
    normalizedKey.includes("..")
  ) {
    throw new PreviewServiceError(
      "Invalid artifact storage key",
      "PREVIEW_INVALID_ARTIFACT_KEY",
      422
    );
  }

  const root =
    path.resolve(
      AUTH_ARTIFACT_ROOT
    );

  const candidate =
    path.resolve(
      root,
      normalizedKey
    );

  if (
    candidate !== root &&
    !candidate.startsWith(
      root + path.sep
    )
  ) {
    throw new PreviewServiceError(
      "Artifact path escapes storage root",
      "PREVIEW_ARTIFACT_PATH_TRAVERSAL",
      422
    );
  }

  return candidate;
}

/* =========================================================
   S3
   ========================================================= */

async function downloadArtifactFromS3(
  storageKey,
  destination
) {
  if (
    !AUTH_ARTIFACT_BUCKET
  ) {
    return false;
  }

  let S3Client;
  let GetObjectCommand;

  try {
    ({
      S3Client,
      GetObjectCommand
    } = require(
      "@aws-sdk/client-s3"
    ));
  } catch (error) {
    throw new PreviewServiceError(
      "AWS S3 SDK is required for remote preview artifacts",
      "PREVIEW_S3_SDK_MISSING",
      500
    );
  }

  const client =
    new S3Client({
      region:
        AUTH_ARTIFACT_REGION
    });

  const response =
    await client.send(
      new GetObjectCommand({
        Bucket:
          AUTH_ARTIFACT_BUCKET,
        Key:
          storageKey
      })
    );

  if (
    !response.Body ||
    typeof response.Body.pipe !==
      "function"
  ) {
    throw new PreviewServiceError(
      "S3 artifact stream is unavailable",
      "PREVIEW_ARTIFACT_DOWNLOAD_FAILED",
      502
    );
  }

  await new Promise(
    (resolve, reject) => {
      const output =
        fs.createWriteStream(
          destination
        );

      response.Body.on(
        "error",
        reject
      );

      output.on(
        "error",
        reject
      );

      output.on(
        "finish",
        resolve
      );

      response.Body.pipe(
        output
      );
    }
  );

  return true;
}

/* =========================================================
   ARTIFACT DOWNLOAD
   ========================================================= */

async function materializeArtifact(
  artifact,
  workspace
) {
  if (!artifact) {
    throw new PreviewServiceError(
      "Authoritative build has no preview artifact",
      "PREVIEW_ARTIFACT_MISSING",
      422
    );
  }

  const storageKey =
    String(
      artifact.storageKey || ""
    ).trim();

  if (!storageKey) {
    throw new PreviewServiceError(
      "Preview artifact has no storage key",
      "PREVIEW_ARTIFACT_STORAGE_KEY_MISSING",
      422
    );
  }

  const artifactFile =
    path.join(
      workspace,
      "__artifact.tar.gz"
    );

  const localPath =
    resolveLocalArtifactPath(
      storageKey
    );

  if (
    localPath &&
    fs.existsSync(localPath)
  ) {
    await fsp.copyFile(
      localPath,
      artifactFile
    );
  } else {
    const downloaded =
      await downloadArtifactFromS3(
        storageKey,
        artifactFile
      );

    if (!downloaded) {
      throw new PreviewServiceError(
        "Preview artifact is not available in local storage or S3",
        "PREVIEW_ARTIFACT_UNAVAILABLE",
        404
      );
    }
  }

  const stat =
    await fsp.stat(
      artifactFile
    );

  if (
    stat.size >
    PREVIEW_MAX_ARTIFACT_SIZE
  ) {
    throw new PreviewServiceError(
      "Preview artifact exceeds maximum allowed size",
      "PREVIEW_ARTIFACT_TOO_LARGE",
      413
    );
  }

  if (
    artifact.size &&
    Number(artifact.size) !==
      stat.size
  ) {
    throw new PreviewServiceError(
      "Preview artifact size verification failed",
      "PREVIEW_ARTIFACT_SIZE_MISMATCH",
      422,
      {
        expected:
          Number(artifact.size),
        actual:
          stat.size
      }
    );
  }

  if (
    artifact.checksum
  ) {
    const actual =
      await sha256File(
        artifactFile
      );

    const expected =
      String(
        artifact.checksum
      )
        .replace(
          /^sha256:/i,
          ""
        )
        .trim()
        .toLowerCase();

    if (
      actual.toLowerCase() !==
      expected
    ) {
      throw new PreviewServiceError(
        "Preview artifact checksum verification failed",
        "PREVIEW_ARTIFACT_CHECKSUM_MISMATCH",
        422,
        {
          expected,
          actual
        }
      );
    }
  }

  return artifactFile;
}

/* =========================================================
   TAR SECURITY
   ========================================================= */

function validateTarEntry(
  entry
) {
  const normalized =
    String(entry || "")
      .trim();

  if (!normalized) {
    return;
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("\\")
  ) {
    throw new PreviewServiceError(
      "Artifact contains an absolute path",
      "PREVIEW_ARTIFACT_PATH_TRAVERSAL",
      422,
      { entry }
    );
  }

  const parts =
    normalized.split(
      /[\\/]+/
    );

  if (
    parts.includes("..")
  ) {
    throw new PreviewServiceError(
      "Artifact contains path traversal",
      "PREVIEW_ARTIFACT_PATH_TRAVERSAL",
      422,
      { entry }
    );
  }
}

/* =========================================================
   TAR LIST
   ========================================================= */

async function validateArchive(
  archivePath
) {
  const result =
    await dockerExec(
      [
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${archivePath}:/artifact.tar.gz:ro`,
        "alpine:3.20",
        "sh",
        "-lc",
        "tar -tzf /artifact.tar.gz"
      ],
      {
        timeout: 30000,
        maxBuffer:
          10 * 1024 * 1024
      }
    );

  if (
    result.exitCode !== 0
  ) {
    throw new PreviewServiceError(
      "Preview artifact is not a valid tar.gz archive",
      "PREVIEW_ARTIFACT_INVALID_ARCHIVE",
      422,
      {
        stderr:
          clampText(
            result.stderr
          )
      }
    );
  }

  const entries =
    result.stdout
      .split("\n")
      .map((item) =>
        item.trim()
      )
      .filter(Boolean);

  for (
    const entry of entries
  ) {
    validateTarEntry(entry);
  }

  return entries;
}

/* =========================================================
   EXTRACT ARTIFACT
   ========================================================= */

async function extractArtifact(
  archivePath,
  targetWorkspace
) {
  await validateArchive(
    archivePath
  );

  await fsp.mkdir(
    targetWorkspace,
    {
      recursive: true
    }
  );

  const result =
    await dockerExec(
      [
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${archivePath}:/artifact.tar.gz:ro`,
        "-v",
        `${targetWorkspace}:/workspace:rw`,
        "alpine:3.20",
        "sh",
        "-lc",
        "cd /workspace && tar --no-same-owner --no-same-permissions --no-overwrite-dir -xzf /artifact.tar.gz"
      ],
      {
        timeout:
          120000,
        maxBuffer:
          2 * 1024 * 1024
      }
    );

  if (
    result.exitCode !== 0
  ) {
    throw new PreviewServiceError(
      "Failed to extract preview artifact",
      "PREVIEW_ARTIFACT_EXTRACTION_FAILED",
      422,
      {
        stderr:
          clampText(
            result.stderr
          )
      }
    );
  }
}

/* =========================================================
   AUTHORITATIVE BUILD
   ========================================================= */

async function getAuthoritativeBuild({
  projectId,
  userId,
  buildId
}) {
  if (!buildId) {
    throw new PreviewServiceError(
      "buildId is required",
      "PREVIEW_BUILD_ID_REQUIRED",
      400
    );
  }

  const build =
    await ProjectBuild.findOne({
      _id: undefined,
      projectId,
      userId,
      buildId
    });

  if (!build) {
    throw new PreviewServiceError(
      "Authoritative build was not found",
      "PREVIEW_BUILD_NOT_FOUND",
      404
    );
  }

  if (
    build.status !== "success"
  ) {
    throw new PreviewServiceError(
      "Preview requires a successful build",
      "PREVIEW_BUILD_NOT_SUCCESSFUL",
      409,
      {
        status:
          build.status
      }
    );
  }

  const metadata =
    isObject(build.metadata)
      ? build.metadata
      : {};

  if (
    metadata.authoritative !== true
  ) {
    throw new PreviewServiceError(
      "Build is not authoritative",
      "PREVIEW_BUILD_NOT_AUTHORITATIVE",
      409
    );
  }

  if (
    metadata.validationMode !==
    "authoritative"
  ) {
    throw new PreviewServiceError(
      "Build validation mode is not authoritative",
      "PREVIEW_BUILD_VALIDATION_MODE_INVALID",
      409
    );
  }

  if (
    !Array.isArray(
      build.artifacts
    ) ||
    build.artifacts.length === 0
  ) {
    throw new PreviewServiceError(
      "Authoritative build contains no artifacts",
      "PREVIEW_ARTIFACT_MISSING",
      422
    );
  }

  return build;
}

/* =========================================================
   SELECT ARTIFACT
   ========================================================= */

function selectPreviewArtifact(
  build
) {
  const artifacts =
    Array.isArray(
      build.artifacts
    )
      ? build.artifacts
      : [];

  const artifact =
    artifacts.find(
      (item) =>
        item &&
        item.storageKey &&
        (
          item.type ===
            "build" ||
          item.type ===
            "archive" ||
          item.type ===
            "bundle"
        )
    ) ||
    artifacts.find(
      (item) =>
        item &&
        item.storageKey
    );

  if (!artifact) {
    throw new PreviewServiceError(
      "No executable preview artifact exists for this build",
      "PREVIEW_ARTIFACT_MISSING",
      422
    );
  }

  return artifact;
}

/* =========================================================
   RUNTIME INSTALL
   ========================================================= */

async function installRuntimeDependencies({
  workspace,
  packageManager,
  image
}) {
  const command =
    getInstallCommand(
      packageManager,
      workspace
    );

  const args = [
    "run",
    "--rm",

    "--network",
    PREVIEW_NETWORK,

    "--cpus",
    PREVIEW_CPU,

    "--memory",
    PREVIEW_MEMORY,

    "--pids-limit",
    PREVIEW_PIDS,

    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    "--read-only",

    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=128m",

    "--tmpfs",
    "/home/node:rw,nosuid,size=256m",

    "-v",
    `${workspace}:/workspace:rw`,

    "-w",
    "/workspace",

    image,

    "sh",
    "-lc",
    command
  ];

  const result =
    await dockerExec(
      args,
      {
        timeout:
          PREVIEW_INSTALL_TIMEOUT,
        maxBuffer:
          10 * 1024 * 1024
      }
    );

  if (
    result.exitCode !== 0
  ) {
    throw new PreviewServiceError(
      "Preview runtime dependency installation failed",
      "PREVIEW_RUNTIME_INSTALL_FAILED",
      422,
      {
        stdout:
          clampText(
            result.stdout
          ),
        stderr:
          clampText(
            result.stderr
          )
      }
    );
  }

  return {
    command,
    stdout:
      clampText(
        result.stdout
      ),
    stderr:
      clampText(
        result.stderr
      )
  };
}

/* =========================================================
   CONTAINER NAME
   ========================================================= */

function containerName(
  previewId
) {
  const safe =
    String(previewId)
      .replace(
        /[^a-zA-Z0-9_.-]/g,
        "-"
      )
      .slice(0, 100);

  return `zyrionos-preview-${safe}`;
}

/* =========================================================
   PORT
   ========================================================= */

function getInternalPort() {
  return 3000;
}

/* =========================================================
   CREATE DOCKER RUNTIME
   ========================================================= */

async function startRuntime({
  previewId,
  workspace,
  image,
  startCommand
}) {
  const name =
    containerName(
      previewId
    );

  await dockerExec(
    [
      "rm",
      "-f",
      name
    ],
    {
      timeout: 10000
    }
  );

  const internalPort =
    getInternalPort();

  const dockerArgs = [
    "run",
    "-d",

    "--name",
    name,

    "--network",
    PREVIEW_RUNTIME_NETWORK,

    "--cpus",
    PREVIEW_CPU,

    "--memory",
    PREVIEW_MEMORY,

    "--pids-limit",
    PREVIEW_PIDS,

    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    "--read-only",

    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=128m",

    "--tmpfs",
    "/home/node:rw,nosuid,size=256m",

    "-p",
    `${PREVIEW_HOST}::${internalPort}`,

    "-e",
    "NODE_ENV=production",

    "-e",
    "HOST=0.0.0.0",

    "-e",
    `PORT=${internalPort}`,

    "-v",
    `${workspace}:/workspace:ro`,

    "-w",
    "/workspace",

    image,

    "sh",
    "-lc",
    `exec ${startCommand}`
  ];

  const result =
    await dockerExec(
      dockerArgs,
      {
        timeout:
          PREVIEW_START_TIMEOUT,
        maxBuffer:
          2 * 1024 * 1024
      }
    );

  if (
    result.exitCode !== 0
  ) {
    throw new PreviewServiceError(
      "Failed to start preview runtime",
      "PREVIEW_RUNTIME_START_FAILED",
      500,
      {
        stdout:
          clampText(
            result.stdout
          ),
        stderr:
          clampText(
            result.stderr
          )
      }
    );
  }

  const containerId =
    String(
      result.stdout || ""
    ).trim();

  if (!containerId) {
    throw new PreviewServiceError(
      "Docker did not return a preview container id",
      "PREVIEW_RUNTIME_START_FAILED",
      500
    );
  }

  const portResult =
    await dockerExec(
      [
        "port",
        containerId,
        `${internalPort}/tcp`
      ],
      {
        timeout: 10000
      }
    );

  if (
    portResult.exitCode !== 0
  ) {
    await stopDockerContainer(
      containerId
    );

    throw new PreviewServiceError(
      "Preview runtime port could not be resolved",
      "PREVIEW_RUNTIME_PORT_FAILED",
      500,
      {
        stderr:
          clampText(
            portResult.stderr
          )
      }
    );
  }

  const portText =
    String(
      portResult.stdout || ""
    ).trim();

  const match =
    portText.match(
      /:(\d+)\s*$/
    );

  if (!match) {
    await stopDockerContainer(
      containerId
    );

    throw new PreviewServiceError(
      "Preview runtime exposed port could not be determined",
      "PREVIEW_RUNTIME_PORT_FAILED",
      500
    );
  }

  const hostPort =
    Number(match[1]);

  if (
    !Number.isInteger(
      hostPort
    ) ||
    hostPort <= 0
  ) {
    await stopDockerContainer(
      containerId
    );

    throw new PreviewServiceError(
      "Invalid preview host port",
      "PREVIEW_RUNTIME_PORT_FAILED",
      500
    );
  }

  const runtime = {
    containerId,
    containerName: name,
    hostPort,
    internalPort,
    image
  };

  activeRuntimes.set(
    String(previewId),
    runtime
  );

  return runtime;
}

/* =========================================================
   CONTAINER STATUS
   ========================================================= */

async function isContainerRunning(
  containerId
) {
  const result =
    await dockerExec(
      [
        "inspect",
        "-f",
        "{{.State.Running}}",
        containerId
      ],
      {
        timeout: 10000
      }
    );

  return (
    result.exitCode === 0 &&
    String(
      result.stdout || ""
    ).trim() === "true"
  );
}

/* =========================================================
   CONTAINER LOGS
   ========================================================= */

async function getContainerLogs(
  containerId
) {
  const result =
    await dockerExec(
      [
        "logs",
        "--tail",
        "200",
        containerId
      ],
      {
        timeout: 10000,
        maxBuffer:
          PREVIEW_MAX_LOG_SIZE
      }
    );

  return {
    stdout:
      clampText(
        result.stdout
      ),
    stderr:
      clampText(
        result.stderr
      )
  };
}

/* =========================================================
   STOP CONTAINER
   ========================================================= */

async function stopDockerContainer(
  containerId
) {
  if (!containerId) {
    return;
  }

  await dockerExec(
    [
      "rm",
      "-f",
      containerId
    ],
    {
      timeout: 15000
    }
  );
}

/* =========================================================
   HEALTH CHECK
   ========================================================= */

async function healthCheck(
  hostPort
) {
  const deadline =
    Date.now() +
    PREVIEW_HEALTH_TIMEOUT;

  const url =
    `http://${PREVIEW_HOST}:${hostPort}/`;

  let lastError =
    "Health check has not completed";

  while (
    Date.now() < deadline
  ) {
    try {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () =>
            controller.abort(),
          5000
        );

      const response =
        await fetch(
          url,
          {
            method: "GET",
            redirect: "manual",
            signal:
              controller.signal
          }
        );

      clearTimeout(timer);

      if (
        response.status >= 200 &&
        response.status < 500
      ) {
        return {
          healthy: true,
          statusCode:
            response.status,
          url
        };
      }

      lastError =
        `HTTP ${response.status}`;
    } catch (error) {
      lastError =
        safeErrorMessage(error);
    }

    await sleep(
      PREVIEW_HEALTH_INTERVAL
    );
  }

  return {
    healthy: false,
    statusCode: null,
    url,
    error: lastError
  };
}

/* =========================================================
   PREVIEW URL
   ========================================================= */

function buildPreviewUrl(
  previewId,
  hostPort
) {
  if (
    PREVIEW_BASE_URL
  ) {
    return (
      PREVIEW_BASE_URL.replace(
        /\/+$/,
        ""
      ) +
      `/preview/${encodeURIComponent(
        previewId
      )}`
    );
  }

  return (
    `http://${PREVIEW_HOST}:${hostPort}`
  );
}

/* =========================================================
   CLEANUP WORKSPACE
   ========================================================= */

async function removeWorkspace(
  workspace
) {
  if (!workspace) {
    return;
  }

  try {
    await fsp.rm(
      workspace,
      {
        recursive: true,
        force: true
      }
    );
  } catch (_) {
    // Cleanup must never hide the original error.
  }
}

/* =========================================================
   CLEANUP RUNTIME
   ========================================================= */

async function cleanupRuntime(
  previewId
) {
  const key =
    String(previewId);

  const runtime =
    activeRuntimes.get(
      key
    );

  if (!runtime) {
    return;
  }

  await stopDockerContainer(
    runtime.containerId
  );

  activeRuntimes.delete(
    key
  );
}

/* =========================================================
   SERIALIZE
   ========================================================= */

function serializePreview(
  preview
) {
  if (!preview) {
    return null;
  }

  const data =
    typeof preview.toObject ===
    "function"
      ? preview.toObject()
      : {
          ...preview
        };

  if (
    data.runtimeInfo
  ) {
    data.runtimeInfo = {
      hostPort:
        data.runtimeInfo.hostPort ||
        null,
      internalPort:
        data.runtimeInfo.internalPort ||
        null,
      image:
        data.runtimeInfo.image ||
        ""
    };
  }

  if (
    data.metadata
  ) {
    delete data.metadata
      .artifactStorageKey;

    delete data.metadata
      .workingDirectory;

    delete data.metadata
      .containerId;

    delete data.metadata
      .workerId;
  }

  delete data.workingDirectory;
  delete data.containerId;

  return data;
}

/* =========================================================
   ACTIVE PREVIEW
   ========================================================= */

async function getPreview({
  projectId,
  userId,
  previewId
}) {
  const query = {
    projectId,
    userId
  };

  if (previewId) {
    query.previewId =
      previewId;

    const preview =
      await ProjectPreview.findOne(
        query
      );

    return preview
      ? serializePreview(preview)
      : null;
  }

  const preview =
    await ProjectPreview.findOne({
      ...query,
      status: {
        $in:
          ACTIVE_STATUSES
      }
    })
      .sort({
        createdAt: -1
      });

  return preview
    ? serializePreview(preview)
    : null;
}

/* =========================================================
   CREATE PREVIEW
   ========================================================= */

async function createPreview({
  projectId,
  userId,
  buildId,
  project
}) {
  const dockerReady =
    await dockerAvailable();

  if (!dockerReady) {
    throw new PreviewServiceError(
      "Docker is unavailable on the preview worker",
      "PREVIEW_DOCKER_UNAVAILABLE",
      503
    );
  }

  if (
    project?.settings &&
    project.settings.previewEnabled ===
      false
  ) {
    throw new PreviewServiceError(
      "Preview is disabled for this project",
      "PREVIEW_DISABLED",
      403
    );
  }

  /* -------------------------------------------------------
     AUTHORITATIVE BUILD
     ------------------------------------------------------- */

  const build =
    await getAuthoritativeBuild({
      projectId,
      userId,
      buildId
    });

  const artifact =
    selectPreviewArtifact(
      build
    );

  /* -------------------------------------------------------
     REUSE SAME READY PREVIEW
     ------------------------------------------------------- */

  const existing =
    await ProjectPreview.findOne({
      projectId,
      userId,
      buildId,
      status: "ready"
    })
      .sort({
        createdAt: -1
      });

  if (
    existing
  ) {
    const runtime =
      activeRuntimes.get(
        String(
          existing.previewId
        )
      );

    if (
      runtime &&
      (await isContainerRunning(
        runtime.containerId
      ))
    ) {
      return serializePreview(
        existing
      );
    }

    await ProjectPreview.updateOne(
      {
        _id:
          existing._id
      },
      {
        $set: {
          status: "stopped",
          stoppedAt: now(),
          errorMessage:
            "Runtime was no longer active"
        }
      }
    );
  }

  /* -------------------------------------------------------
     ACTIVE PREVIEW LIMIT
     ------------------------------------------------------- */

  const activeCount =
    await ProjectPreview.countDocuments({
      projectId,
      userId,
      status: {
        $in:
          ACTIVE_STATUSES
      }
    });

  if (
    activeCount >=
    PREVIEW_MAX_ACTIVE
  ) {
    throw new PreviewServiceError(
      "Preview limit reached for this project",
      "PREVIEW_LIMIT_REACHED",
      429
    );
  }

  /* -------------------------------------------------------
     CREATE ID
     ------------------------------------------------------- */

  const previewId =
    `preview_${crypto
      .randomBytes(12)
      .toString("hex")}`;

  const createdAt =
    now();

  const expiresAt =
    new Date(
      createdAt.getTime() +
        PREVIEW_TTL_MS
    );

  let preview =
    await ProjectPreview.create({
      projectId,
      userId,
      previewId,
      buildId,
      status: "starting",
      startedAt: createdAt,
      expiresAt,

      framework:
        build.framework || "",

      runtime:
        build.runtime || "node",

      nodeVersion:
        normalizeNodeVersion(
          build.nodeVersion
        ),

      packageManager:
        build.packageManager ||
        "npm",

      metadata: {
        serviceVersion:
          SERVICE_VERSION,

        authoritativeBuild:
          true,

        validationMode:
          "authoritative",

        buildSourceHash:
          build.metadata?.sourceHash ||
          "",

        artifactName:
          artifact.name || "",

        artifactType:
          artifact.type || ""
      }
    });

  let runtimeWorkspace = null;
  let artifactWorkspace = null;

  try {
    /* -----------------------------------------------------
       TEMP WORKSPACE
       ----------------------------------------------------- */

    const root =
      await fsp.mkdtemp(
        path.join(
          os.tmpdir(),
          "zyrionos-preview-"
        )
      );

    artifactWorkspace =
      path.join(
        root,
        "artifact"
      );

    runtimeWorkspace =
      path.join(
        root,
        "runtime"
      );

    await fsp.mkdir(
      artifactWorkspace,
      {
        recursive: true
      }
    );

    await fsp.mkdir(
      runtimeWorkspace,
      {
        recursive: true
      }
    );

    /* -----------------------------------------------------
       ARTIFACT
       ----------------------------------------------------- */

    const artifactFile =
      await materializeArtifact(
        artifact,
        root
      );

    /* -----------------------------------------------------
       EXTRACT
       ----------------------------------------------------- */

    await extractArtifact(
      artifactFile,
      artifactWorkspace
    );

    /* -----------------------------------------------------
       PACKAGE
       ----------------------------------------------------- */

    const packageJson =
      await readPackageJson(
        artifactWorkspace
      );

    const packageManager =
      detectPackageManager(
        packageJson,
        artifactWorkspace
      );

    const nodeVersion =
      normalizeNodeVersion(
        build.nodeVersion
      );

    const image =
      getRuntimeImage(
        nodeVersion,
        packageManager
      );

    const startCommand =
      resolveStartCommand({
        packageJson,
        packageManager,
        project
      });

    /* -----------------------------------------------------
       COPY ARTIFACT TO RUNTIME
       ----------------------------------------------------- */

    await fsp.cp(
      artifactWorkspace,
      runtimeWorkspace,
      {
        recursive: true
      }
    );

    /* -----------------------------------------------------
       UPDATE STATE
       ----------------------------------------------------- */

    await ProjectPreview.updateOne(
      {
        _id:
          preview._id
      },
      {
        $set: {
          packageManager,
          nodeVersion,
          status: "starting",
          metadata: {
            ...(preview.metadata || {}),
            runtimeImage:
              image,
            startCommand:
              startCommand
          }
        }
      }
    );

    /* -----------------------------------------------------
       INSTALL RUNTIME DEPENDENCIES
       ----------------------------------------------------- */

    const installResult =
      await installRuntimeDependencies({
        workspace:
          runtimeWorkspace,
        packageManager,
        image
      });

    /* -----------------------------------------------------
       START RUNTIME
       ----------------------------------------------------- */

    const runtime =
      await startRuntime({
        previewId,
        workspace:
          runtimeWorkspace,
        image,
        startCommand
      });

    /* -----------------------------------------------------
       HEALTH CHECK
       ----------------------------------------------------- */

    const health =
      await healthCheck(
        runtime.hostPort
      );

    if (
      !health.healthy
    ) {
      const logs =
        await getContainerLogs(
          runtime.containerId
        );

      throw new PreviewServiceError(
        "Preview health check failed",
        "PREVIEW_HEALTHCHECK_FAILED",
        502,
        {
          health,
          logs
        }
      );
    }

    /* -----------------------------------------------------
       FINAL READY
       ----------------------------------------------------- */

    const previewUrl =
      buildPreviewUrl(
        previewId,
        runtime.hostPort
      );

    preview =
      await ProjectPreview.findOneAndUpdate(
        {
          _id:
            preview._id
        },
        {
          $set: {
            status: "ready",

            readyAt:
              now(),

            url:
              previewUrl,

            previewUrl,

            runtimeInfo: {
              hostPort:
                runtime.hostPort,

              internalPort:
                runtime.internalPort,

              image:
                runtime.image
            },

            metadata: {
              ...(preview.metadata || {}),
              installCommand:
                installResult.command,

              installOutput:
                clampText(
                  installResult.stdout
                ),

              healthStatus:
                health.statusCode
            }
          }
        },
        {
          new: true
        }
      );

    return serializePreview(
      preview
    );
  } catch (error) {
    await cleanupRuntime(
      previewId
    );

    const normalized =
      error instanceof
      PreviewServiceError
        ? error
        : new PreviewServiceError(
            safeErrorMessage(
              error
            ),
            "PREVIEW_START_FAILED",
            500
          );

    await ProjectPreview.updateOne(
      {
        _id:
          preview._id
      },
      {
        $set: {
          status: "failed",
          failedAt: now(),
          errorMessage:
            normalized.message,
          errors: [
            {
              code:
                normalized.code,
              message:
                normalized.message,
              details:
                normalized.details ||
                {}
            }
          ]
        }
      }
    );

    throw normalized;
  } finally {
    /*
     * Runtime container has its own bind-mounted
     * workspace. We intentionally remove the temporary
     * host workspace only after the runtime is stopped.
     *
     * Successful runtime needs the files, therefore
     * cleanup is handled when the preview is stopped.
     */
  }
}

/* =========================================================
   STOP PREVIEW
   ========================================================= */

async function stopPreview({
  projectId,
  userId,
  previewId
}) {
  const preview =
    await ProjectPreview.findOne({
      projectId,
      userId,
      previewId
    });

  if (!preview) {
    throw new PreviewServiceError(
      "Preview was not found",
      "PREVIEW_NOT_FOUND",
      404
    );
  }

  await cleanupRuntime(
    previewId
  );

  const updated =
    await ProjectPreview.findOneAndUpdate(
      {
        _id:
          preview._id
      },
      {
        $set: {
          status: "stopped",
          stoppedAt: now()
        }
      },
      {
        new: true
      }
    );

  return serializePreview(
    updated
  );
}

/* =========================================================
   EXPIRE PREVIEW
   ========================================================= */

async function expirePreview(
  input
) {
  const isArgsObject =
    isObject(input);

  const projectId =
    isArgsObject
      ? input.projectId
      : undefined;

  const userId =
    isArgsObject
      ? input.userId
      : undefined;

  const previewId =
    isArgsObject
      ? input.previewId
      : input;

  if (!previewId) {
    throw new PreviewServiceError(
      "previewId is required",
      "PREVIEW_ID_REQUIRED",
      400
    );
  }

  const query = {
    previewId
  };

  if (projectId) {
    query.projectId =
      projectId;
  }

  if (userId) {
    query.userId =
      userId;
  }

  const preview =
    await ProjectPreview.findOne(
      query
    );

  if (!preview) {
    throw new PreviewServiceError(
      "Preview was not found",
      "PREVIEW_NOT_FOUND",
      404
    );
  }

  await cleanupRuntime(
    previewId
  );

  const updated =
    await ProjectPreview.findOneAndUpdate(
      {
        _id:
          preview._id
      },
      {
        $set: {
          status: "expired",
          expiredAt: now()
        }
      },
      {
        new: true
      }
    );

  return serializePreview(
    updated
  );
}

/* =========================================================
   LIST PREVIEWS
   ========================================================= */

async function listPreviews({
  projectId,
  userId,
  limit = 20
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
      projectId,
      userId
    })
      .sort({
        createdAt: -1
      })
      .limit(
        safeLimit
      );

  return previews.map(
    serializePreview
  );
}

/* =========================================================
   REFRESH HEALTH
   ========================================================= */

async function refreshPreviewHealth({
  projectId,
  userId,
  previewId
}) {
  const preview =
    await ProjectPreview.findOne({
      projectId,
      userId,
      previewId
    });

  if (!preview) {
    throw new PreviewServiceError(
      "Preview was not found",
      "PREVIEW_NOT_FOUND",
      404
    );
  }

  const runtime =
    activeRuntimes.get(
      String(previewId)
    );

  if (!runtime) {
    return {
      healthy: false,
      status:
        preview.status,
      reason:
        "Runtime is not registered"
    };
  }

  const running =
    await isContainerRunning(
      runtime.containerId
    );

  if (!running) {
    const logs =
      await getContainerLogs(
        runtime.containerId
      );

    await ProjectPreview.updateOne(
      {
        _id:
          preview._id
      },
      {
        $set: {
          status: "failed",
          failedAt: now(),
          errorMessage:
            "Preview runtime exited unexpectedly",
          runtimeLogs:
            clampText(
              [
                logs.stdout,
                logs.stderr
              ]
                .filter(Boolean)
                .join("\n")
            )
        }
      }
    );

    activeRuntimes.delete(
      String(previewId)
    );

    return {
      healthy: false,
      status: "failed",
      reason:
        "Runtime exited",
      logs
    };
  }

  const health =
    await healthCheck(
      runtime.hostPort
    );

  if (
    health.healthy &&
    preview.status !== "ready"
  ) {
    await ProjectPreview.updateOne(
      {
        _id:
          preview._id
      },
      {
        $set: {
          status: "ready",
          readyAt: now()
        }
      }
    );
  }

  return {
    ...health,
    status:
      health.healthy
        ? "ready"
        : "unhealthy"
  };
}

/* =========================================================
   EXPIRE OLD PREVIEWS
   ========================================================= */

async function cleanupExpiredPreviews() {
  const expired =
    await ProjectPreview.find({
      status: {
        $in:
          ACTIVE_STATUSES
      },
      expiresAt: {
        $lte: now()
      }
    }).limit(100);

  let count = 0;

  for (
    const preview of expired
  ) {
    try {
      await expirePreview({
        projectId:
          preview.projectId,
        userId:
          preview.userId,
        previewId:
          preview.previewId
      });

      count++;
    } catch (_) {
      // Continue cleaning remaining previews.
    }
  }

  return {
    expired: count
  };
}

/* =========================================================
   GET ARTIFACT INFO
   ========================================================= */

async function getPreviewArtifact({
  projectId,
  userId,
  buildId
}) {
  const build =
    await getAuthoritativeBuild({
      projectId,
      userId,
      buildId
    });

  const artifact =
    selectPreviewArtifact(
      build
    );

  return {
    buildId:
      build.buildId,

    artifact: {
      name:
        artifact.name || "",
      type:
        artifact.type || "",
      size:
        artifact.size || 0,
      checksum:
        artifact.checksum || ""
    }
  };
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  SERVICE_VERSION,

  PreviewServiceError,

  createPreview,

  getPreview,

  stopPreview,

  expirePreview,

  listPreviews,

  refreshPreviewHealth,

  cleanupExpiredPreviews,

  getPreviewArtifact,

  serializePreview,

  getAuthoritativeBuild,

  selectPreviewArtifact,

  detectPackageManager,

  resolveStartCommand,

  isContainerRunning
};
