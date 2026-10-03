const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ProjectBuild = require("../models/projectBuildModel");

/* =========================================================
   ZYRION OS — AUTHORITATIVE BUILD SERVICE
   Enterprise Build Executor + Artifact Producer

   Architecture:

   Builder Agent
        ↓
   Static Validation
        ↓
   Authoritative Build
        ↓
   Verified Artifact
        ↓
   ProjectBuild.artifacts[]
        ↓
   Preview / Deployment

   IMPORTANT:
   - This service is the authoritative build boundary.
   - Generated source is never considered production-ready
     merely because Builder Agent generated it.
   - Build executes inside an isolated Docker container.
   - Successful output becomes an immutable artifact.
   - Preview must consume this artifact instead of rebuilding
     source independently.
   ========================================================= */


/* =========================================================
   SERVICE CONFIG
========================================================= */

const SERVICE_VERSION = "2.0.0";

const MAX_FILES =
  Number(process.env.AUTH_BUILD_MAX_FILES) || 1000;

const MAX_FILE_SIZE =
  Number(process.env.AUTH_BUILD_MAX_FILE_SIZE) ||
  2 * 1024 * 1024;

const MAX_SOURCE_SIZE =
  Number(process.env.AUTH_BUILD_MAX_SOURCE_SIZE) ||
  25 * 1024 * 1024;

const MAX_ARTIFACT_SIZE =
  Number(process.env.AUTH_BUILD_MAX_ARTIFACT_SIZE) ||
  500 * 1024 * 1024;

const INSTALL_TIMEOUT_MS =
  Number(process.env.AUTH_BUILD_INSTALL_TIMEOUT_MS) ||
  5 * 60 * 1000;

const BUILD_TIMEOUT_MS =
  Number(process.env.AUTH_BUILD_TIMEOUT_MS) ||
  5 * 60 * 1000;

const DOCKER_CHECK_TIMEOUT_MS = 5000;

const CPU_LIMIT =
  process.env.AUTH_BUILD_CPU_LIMIT || "2";

const MEMORY_LIMIT =
  process.env.AUTH_BUILD_MEMORY_LIMIT || "2g";

const PIDS_LIMIT =
  Number(process.env.AUTH_BUILD_PIDS_LIMIT) || 256;

const BUILD_NETWORK =
  process.env.AUTH_BUILD_NETWORK || "none";

const INSTALL_NETWORK =
  process.env.AUTH_INSTALL_NETWORK || "bridge";

const ARTIFACT_ROOT =
  process.env.AUTH_ARTIFACT_ROOT ||
  path.join(
    os.tmpdir(),
    "zyrionos-build-artifacts"
  );

const ARTIFACT_STORAGE_PREFIX =
  String(
    process.env.AUTH_ARTIFACT_PREFIX ||
      "zyrionos/builds"
  ).replace(/^\/+|\/+$/g, "");

const ARTIFACT_BUCKET =
  process.env.AUTH_ARTIFACT_BUCKET || "";

const ARTIFACT_REGION =
  process.env.AWS_REGION ||
  "ap-south-1";

const NODE_IMAGES = {
  "20": "node:20-bookworm-slim",
  "22": "node:22-bookworm-slim"
};


/* =========================================================
   CONCURRENCY
========================================================= */

const MAX_CONCURRENT_BUILDS =
  Number(
    process.env.AUTH_BUILD_MAX_CONCURRENCY
  ) || 2;

let activeBuilds = 0;

const buildQueue = [];


/* =========================================================
   UTILITIES
========================================================= */

function generateBuildId() {
  return `build_${Date.now()}_${crypto
    .randomBytes(8)
    .toString("hex")}`;
}


function sha256Buffer(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}


function sha256String(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}


function safeString(value, max = 10000) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).slice(0, max);
}


function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}


function sanitizeFilePath(filePath) {
  const value =
    String(filePath || "")
      .replace(/\\/g, "/")
      .trim();

  if (!value) {
    throw new Error(
      "File path is required"
    );
  }

  if (
    value.startsWith("/") ||
    value.includes("\0") ||
    value
      .split("/")
      .includes("..")
  ) {
    throw new Error(
      `Unsafe file path: ${value}`
    );
  }

  return value;
}


function ensureInside(
  root,
  target
) {
  const resolvedRoot =
    path.resolve(root) +
    path.sep;

  const resolvedTarget =
    path.resolve(target);

  if (
    !resolvedTarget.startsWith(
      resolvedRoot
    )
  ) {
    throw new Error(
      "Path escapes build workspace"
    );
  }
}


/* =========================================================
   SOURCE VALIDATION
========================================================= */

function validateFiles(files) {
  if (!Array.isArray(files)) {
    throw new Error(
      "Build files must be an array"
    );
  }

  if (files.length === 0) {
    throw new Error(
      "Cannot build project without files"
    );
  }

  if (
    files.length >
    MAX_FILES
  ) {
    throw new Error(
      `Project exceeds maximum file count of ${MAX_FILES}`
    );
  }

  let totalSize = 0;

  for (const file of files) {
    const filePath =
      sanitizeFilePath(
        file.path
      );

    const content =
      String(
        file.content || ""
      );

    const size =
      Buffer.byteLength(
        content,
        "utf8"
      );

    if (
      size >
      MAX_FILE_SIZE
    ) {
      throw new Error(
        `File exceeds maximum size: ${filePath}`
      );
    }

    totalSize += size;
  }

  if (
    totalSize >
    MAX_SOURCE_SIZE
  ) {
    throw new Error(
      `Project source exceeds ${MAX_SOURCE_SIZE} bytes`
    );
  }

  return {
    fileCount: files.length,
    totalSize
  };
}


/* =========================================================
   SOURCE HASH
========================================================= */

function calculateSourceHash(
  files
) {
  const normalized =
    files
      .map(
        (file) => ({
          path:
            sanitizeFilePath(
              file.path
            ),
          content:
            String(
              file.content || ""
            )
        })
      )
      .sort(
        (a, b) =>
          a.path.localeCompare(
            b.path
          )
      );

  return sha256String(
    JSON.stringify(
      normalized
    )
  );
}


/* =========================================================
   NODE VERSION
========================================================= */

function resolveNodeVersion(
  nodeVersion
) {
  const raw =
    String(
      nodeVersion || "20"
    );

  const match =
    raw.match(
      /^(20|22)/
    );

  if (!match) {
    return "20";
  }

  return match[1];
}


/* =========================================================
   PACKAGE MANAGER
========================================================= */

function detectPackageManager(
  files,
  requested
) {
  const valid = [
    "npm",
    "yarn",
    "pnpm",
    "bun"
  ];

  if (
    valid.includes(
      requested
    )
  ) {
    return requested;
  }

  const paths =
    new Set(
      files.map(
        (file) =>
          sanitizeFilePath(
            file.path
          )
      )
    );

  if (
    paths.has(
      "pnpm-lock.yaml"
    )
  ) {
    return "pnpm";
  }

  if (
    paths.has(
      "yarn.lock"
    )
  ) {
    return "yarn";
  }

  if (
    paths.has(
      "bun.lock"
    ) ||
    paths.has(
      "bun.lockb"
    )
  ) {
    return "bun";
  }

  return "npm";
}


/* =========================================================
   PACKAGE JSON
========================================================= */

function getPackageJson(
  files
) {
  const packageFile =
    files.find(
      (file) =>
        sanitizeFilePath(
          file.path
        ) === "package.json"
    );

  if (!packageFile) {
    throw new Error(
      "package.json is required for authoritative build"
    );
  }

  try {
    return JSON.parse(
      String(
        packageFile.content || ""
      )
    );
  } catch {
    throw new Error(
      "package.json contains invalid JSON"
    );
  }
}


/* =========================================================
   PACKAGE MANAGER COMMANDS
========================================================= */

function getInstallCommand(
  manager,
  hasLockfile
) {
  switch (manager) {
    case "pnpm":
      return hasLockfile
        ? "corepack pnpm install --frozen-lockfile"
        : "corepack pnpm install";

    case "yarn":
      return hasLockfile
        ? "corepack yarn install --immutable"
        : "corepack yarn install";

    case "bun":
      return hasLockfile
        ? "bun install --frozen-lockfile"
        : "bun install";

    case "npm":
    default:
      return hasLockfile
        ? "npm ci"
        : "npm install";
  }
}


function getBuildCommand(
  packageJson
) {
  const scripts =
    packageJson.scripts || {};

  if (
    typeof scripts.build !==
    "string" ||
    !scripts.build.trim()
  ) {
    throw new Error(
      "package.json must contain a build script"
    );
  }

  return "npm run build";
}


/* =========================================================
   ARTIFACT FILE FILTER
========================================================= */

function shouldExcludeArtifact(
  relativePath
) {
  const normalized =
    relativePath.replace(
      /\\/g,
      "/"
    );

  const parts =
    normalized.split("/");

  /*
   * Dependencies are deliberately excluded.

   * Preview/runtime should install runtime dependencies
   * or consume a future OCI image artifact.
   */
  if (
    parts.includes(
      "node_modules"
    )
  ) {
    return true;
  }

  /*
   * VCS data.
   */
  if (
    parts.includes(".git")
  ) {
    return true;
  }

  /*
   * Local environment secrets.
   */
  if (
    [
      ".env",
      ".env.local",
      ".env.production",
      ".env.development",
      ".env.preview"
    ].includes(
      normalized
    )
  ) {
    return true;
  }

  /*
   * Temporary files.
   */
  if (
    normalized.startsWith(
      ".cache/"
    ) ||
    normalized.startsWith(
      ".tmp/"
    )
  ) {
    return true;
  }

  return false;
}


/* =========================================================
   ARTIFACT FILE COLLECTION
========================================================= */

async function collectArtifactFiles(
  workspace
) {
  const result = [];

  async function walk(
    directory
  ) {
    const entries =
      await fsp.readdir(
        directory,
        {
          withFileTypes: true
        }
      );

    for (
      const entry of entries
    ) {
      const absolute =
        path.join(
          directory,
          entry.name
        );

      const relative =
        path
          .relative(
            workspace,
            absolute
          )
          .replace(
            /\\/g,
            "/"
          );

      if (
        shouldExcludeArtifact(
          relative
        )
      ) {
        continue;
      }

      if (
        entry.isDirectory()
      ) {
        await walk(
          absolute
        );
        continue;
      }

      if (
        !entry.isFile()
      ) {
        continue;
      }

      const stat =
        await fsp.stat(
          absolute
        );

      result.push({
        absolute,
        relative,
        size: stat.size
      });
    }
  }

  await walk(
    workspace
  );

  return result;
}


/* =========================================================
   ARTIFACT MANIFEST
========================================================= */

async function createArtifactManifest(
  workspace
) {
  const files =
    await collectArtifactFiles(
      workspace
    );

  let totalSize = 0;

  const entries = [];

  for (
    const file of files
  ) {
    totalSize +=
      file.size;

    if (
      totalSize >
      MAX_ARTIFACT_SIZE
    ) {
      throw new Error(
        `Build artifact exceeds maximum size of ${MAX_ARTIFACT_SIZE} bytes`
      );
    }

    const content =
      await fsp.readFile(
        file.absolute
      );

    entries.push({
      path:
        file.relative,
      size:
        file.size,
      checksum:
        sha256Buffer(
          content
        )
    });
  }

  entries.sort(
    (a, b) =>
      a.path.localeCompare(
        b.path
      )
  );

  const manifest = {
    version: 1,
    createdAt:
      new Date().toISOString(),
    fileCount:
      entries.length,
    totalSize,
    files: entries
  };

  const manifestRaw =
    JSON.stringify(
      manifest,
      null,
      2
    );

  const artifactChecksum =
    sha256String(
      manifestRaw
    );

  return {
    manifest,
    manifestRaw,
    artifactChecksum,
    fileCount:
      entries.length,
    totalSize
  };
}


/* =========================================================
   TAR COMMAND
========================================================= */

async function createTarArtifact(
  workspace,
  destination
) {
  await fsp.mkdir(
    path.dirname(
      destination
    ),
    {
      recursive: true
    }
  );

  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          "tar",
          [
            "--exclude=node_modules",
            "--exclude=.git",
            "--exclude=.env",
            "--exclude=.env.local",
            "--exclude=.env.production",
            "--exclude=.env.development",
            "--exclude=.env.preview",

            "-czf",
            destination,

            "-C",
            workspace,
            "."
          ],
          {
            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ]
          }
        );

      let stderr = "";

      child.stderr.on(
        "data",
        (chunk) => {
          stderr +=
            chunk.toString();
        }
      );

      child.on(
        "error",
        reject
      );

      child.on(
        "close",
        (code) => {
          if (
            code !== 0
          ) {
            return reject(
              new Error(
                stderr ||
                `tar exited with code ${code}`
              )
            );
          }

          resolve();
        }
      );
    }
  );
}


/* =========================================================
   ARTIFACT CHECKSUM
========================================================= */

async function checksumFile(
  filePath
) {
  const hash =
    crypto.createHash(
      "sha256"
    );

  return new Promise(
    (resolve, reject) => {
      const stream =
        fs.createReadStream(
          filePath
        );

      stream.on(
        "data",
        (chunk) =>
          hash.update(
            chunk
          )
      );

      stream.on(
        "error",
        reject
      );

      stream.on(
        "end",
        () =>
          resolve(
            hash.digest(
              "hex"
            )
          )
      );
    }
  );
}


/* =========================================================
   LOCAL ARTIFACT STORAGE
========================================================= */

async function storeLocalArtifact({
  buildId,
  artifactPath
}) {
  const destinationDirectory =
    path.join(
      ARTIFACT_ROOT,
      buildId
    );

  await fsp.mkdir(
    destinationDirectory,
    {
      recursive: true
    }
  );

  const destination =
    path.join(
      destinationDirectory,
      "build.tar.gz"
    );

  await fsp.copyFile(
    artifactPath,
    destination
  );

  const stat =
    await fsp.stat(
      destination
    );

  const checksum =
    await checksumFile(
      destination
    );

  return {
    storageKey:
      `${ARTIFACT_STORAGE_PREFIX}/${buildId}/build.tar.gz`,

    url: "",

    localPath:
      destination,

    size:
      stat.size,

    checksum
  };
}


/* =========================================================
   OPTIONAL S3 ARTIFACT STORAGE
========================================================= */

async function storeS3Artifact({
  buildId,
  artifactPath
}) {
  if (
    !ARTIFACT_BUCKET
  ) {
    return null;
  }

  let S3Client;
  let PutObjectCommand;

  try {
    const s3 =
      require(
        "@aws-sdk/client-s3"
      );

    S3Client =
      s3.S3Client;

    PutObjectCommand =
      s3.PutObjectCommand;

  } catch {
    throw new Error(
      "AWS S3 artifact storage is configured but @aws-sdk/client-s3 is not installed"
    );
  }

  const client =
    new S3Client({
      region:
        ARTIFACT_REGION
    });

  const key =
    `${ARTIFACT_STORAGE_PREFIX}/${buildId}/build.tar.gz`;

  const body =
    fs.createReadStream(
      artifactPath
    );

  const stat =
    await fsp.stat(
      artifactPath
    );

  await client.send(
    new PutObjectCommand({
      Bucket:
        ARTIFACT_BUCKET,

      Key:
        key,

      Body:
        body,

      ContentLength:
        stat.size,

      ContentType:
        "application/gzip",

      Metadata: {
        buildId,
        serviceVersion:
          SERVICE_VERSION
      }
    })
  );

  const checksum =
    await checksumFile(
      artifactPath
    );

  return {
    storageKey:
      key,

    url:
      `s3://${ARTIFACT_BUCKET}/${key}`,

    size:
      stat.size,

    checksum
  };
}


/* =========================================================
   ARTIFACT STORAGE STRATEGY
========================================================= */

async function persistArtifact({
  buildId,
  artifactPath
}) {
  /*
   * S3 becomes the durable artifact store when configured.
   */
  if (
    ARTIFACT_BUCKET
  ) {
    return storeS3Artifact({
      buildId,
      artifactPath
    });
  }

  /*
   * Local storage is intended for:
   * - development
   * - single-node deployments
   * - initial testing

   * Production multi-worker deployments should use S3
   * or another durable artifact store.
   */
  return storeLocalArtifact({
    buildId,
    artifactPath
  });
}


/* =========================================================
   DOCKER AVAILABILITY
========================================================= */

async function checkDockerAvailable() {
  return new Promise(
    (resolve) => {
      let finished = false;

      const child =
        spawn(
          "docker",
          [
            "version",
            "--format",
            "{{.Server.Version}}"
          ],
          {
            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ]
          }
        );

      const timer =
        setTimeout(
          () => {
            if (
              finished
            ) {
              return;
            }

            finished = true;

            try {
              child.kill(
                "SIGKILL"
              );
            } catch {}

            resolve(false);
          },
          DOCKER_CHECK_TIMEOUT_MS
        );

      child.on(
        "error",
        () => {
          if (
            finished
          ) {
            return;
          }

          finished = true;
          clearTimeout(
            timer
          );

          resolve(false);
        }
      );

      child.on(
        "close",
        (code) => {
          if (
            finished
          ) {
            return;
          }

          finished = true;
          clearTimeout(
            timer
          );

          resolve(
            code === 0
          );
        }
      );
    }
  );
}


/* =========================================================
   DOCKER EXECUTION
========================================================= */

function runDockerCommand({
  image,
  workspace,
  command,
  network,
  timeoutMs
}) {
  return new Promise(
    (resolve) => {
      const args = [
        "run",
        "--rm",

        "--cpus",
        CPU_LIMIT,

        "--memory",
        MEMORY_LIMIT,

        "--pids-limit",
        String(
          PIDS_LIMIT
        ),

        "--cap-drop",
        "ALL",

        "--security-opt",
        "no-new-privileges",

        "--read-only",

        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=256m",

        "--tmpfs",
        "/home/node:rw,nosuid,size=128m",

        "--network",
        network,

        "-v",
        `${workspace}:/workspace:rw`,

        "-w",
        "/workspace",

        image,

        "sh",
        "-lc",
        command
      ];

      const child =
        spawn(
          "docker",
          args,
          {
            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ]
          }
        );

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const append =
        (
          current,
          chunk
        ) => {
          const next =
            current +
            chunk.toString();

          if (
            Buffer.byteLength(
              next,
              "utf8"
            ) <=
            2 * 1024 * 1024
          ) {
            return next;
          }

          return next.slice(
            -2 * 1024 * 1024
          );
        };

      child.stdout.on(
        "data",
        (chunk) => {
          stdout =
            append(
              stdout,
              chunk
            );
        }
      );

      child.stderr.on(
        "data",
        (chunk) => {
          stderr =
            append(
              stderr,
              chunk
            );
        }
      );

      const timer =
        setTimeout(
          () => {
            if (
              settled
            ) {
              return;
            }

            timedOut = true;

            try {
              child.kill(
                "SIGKILL"
              );
            } catch {}
          },
          timeoutMs
        );

      child.on(
        "error",
        (error) => {
          if (
            settled
          ) {
            return;
          }

          settled = true;
          clearTimeout(
            timer
          );

          resolve({
            success: false,
            timedOut,
            exitCode: null,
            signal: null,
            stdout,
            stderr:
              stderr ||
              error.message
          });
        }
      );

      child.on(
        "close",
        (
          code,
          signal
        ) => {
          if (
            settled
          ) {
            return;
          }

          settled = true;
          clearTimeout(
            timer
          );

          resolve({
            success:
              code === 0 &&
              !timedOut,

            timedOut,

            exitCode:
              code,

            signal:
              signal || null,

            stdout,
            stderr
          });
        }
      );
    }
  );
}


/* =========================================================
   FAILURE CLASSIFICATION
========================================================= */

function classifyFailure({
  stage,
  stdout = "",
  stderr = "",
  timedOut = false
}) {
  const text =
    `${stdout}\n${stderr}`
      .toLowerCase();

  if (
    timedOut
  ) {
    return {
      category:
        "timeout",
      retryable:
        true
    };
  }

  if (
    text.includes(
      "eacces"
    ) ||
    text.includes(
      "permission denied"
    )
  ) {
    return {
      category:
        "permission",
      retryable:
        false
    };
  }

  if (
    text.includes(
      "network"
    ) ||
    text.includes(
      "enotfound"
    ) ||
    text.includes(
      "fetch failed"
    )
  ) {
    return {
      category:
        "network",
      retryable:
        true
    };
  }

  if (
    text.includes(
      "module not found"
    ) ||
    text.includes(
      "cannot find module"
    )
  ) {
    return {
      category:
        "missing-module",
      retryable:
        false
    };
  }

  if (
    text.includes(
      "syntaxerror"
    ) ||
    text.includes(
      "unexpected token"
    )
  ) {
    return {
      category:
        "syntax",
      retryable:
        false
    };
  }

  if (
    stage ===
    "install"
  ) {
    return {
      category:
        "dependency-install",
      retryable:
        false
    };
  }

  if (
    stage ===
    "build"
  ) {
    return {
      category:
        "build",
      retryable:
        false
    };
  }

  return {
    category:
      "unknown",
    retryable:
      false
  };
}


/* =========================================================
   TEMP WORKSPACE
========================================================= */

async function createWorkspace() {
  return fsp.mkdtemp(
    path.join(
      os.tmpdir(),
      "zyrion-authoritative-build-"
    )
  );
}


async function cleanupWorkspace(
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
  } catch (error) {
    console.error(
      "[AuthoritativeBuildService] workspace cleanup failed:",
      error.message
    );
  }
}


/* =========================================================
   MATERIALIZE SOURCE
========================================================= */

async function materializeSource(
  files,
  workspace
) {
  for (
    const file of files
  ) {
    const relativePath =
      sanitizeFilePath(
        file.path
      );

    const destination =
      path.resolve(
        workspace,
        relativePath
      );

    ensureInside(
      workspace,
      destination
    );

    await fsp.mkdir(
      path.dirname(
        destination
      ),
      {
        recursive: true
      }
    );

    await fsp.writeFile(
      destination,
      String(
        file.content || ""
      ),
      "utf8"
    );
  }
}


/* =========================================================
   BUILD RECORD
========================================================= */

async function createBuildRecord({
  projectId,
  userId,
  buildId,
  trigger,
  framework,
  runtime,
  nodeVersion,
  packageManager,
  buildCommand,
  outputDirectory,
  sourceHash,
  aiGenerated,
  aiModel,
  promptId
}) {
  const latest =
    await ProjectBuild
      .findOne({
        projectId
      })
      .sort({
        buildNumber: -1
      })
      .select({
        buildNumber: 1
      })
      .lean();

  const buildNumber =
    latest &&
    Number.isFinite(
      latest.buildNumber
    )
      ? latest.buildNumber + 1
      : 1;

  return ProjectBuild.create({
    projectId,
    userId,

    buildId,
    buildNumber,

    status:
      "queued",

    trigger:
      trigger || "manual",

    framework:
      framework || "",

    runtime:
      runtime || "",

    nodeVersion:
      nodeVersion || "",

    packageManager:
      packageManager || "",

    buildCommand:
      buildCommand || "",

    outputDirectory:
      outputDirectory || "",

    aiGenerated:
      Boolean(
        aiGenerated
      ),

    aiModel:
      aiModel || "",

    promptId:
      promptId || "",

    metadata: {
      serviceVersion:
        SERVICE_VERSION,

      sourceHash,

      authoritative:
        true,

      validationMode:
        "authoritative"
    }
  });
}


/* =========================================================
   UPDATE BUILD
========================================================= */

async function updateBuild(
  build,
  patch
) {
  Object.assign(
    build,
    patch
  );

  await build.save();

  return build;
}


/* =========================================================
   BUILD ERROR OBJECT
========================================================= */

function createBuildError({
  code,
  message,
  step,
  category
}) {
  return {
    code:
      safeString(
        code,
        200
      ),

    message:
      safeString(
        message,
        4000
      ),

    step:
      safeString(
        step,
        300
      ),

    file:
      "",

    line:
      null,

    column:
      null
  };
}


/* =========================================================
   MAIN BUILD
========================================================= */

async function executeBuild(
  options
) {
  const {
    projectId,
    userId,
    projectName = "",
    framework = "",
    runtime = "",
    files,

    nodeVersion:
      requestedNodeVersion = "20",

    packageManager:
      requestedPackageManager = "",

    trigger =
      "manual",

    outputDirectory =
      "",

    aiGenerated =
      false,

    aiModel =
      "",

    promptId =
      ""
  } = options || {};

  if (!projectId) {
    throw new Error(
      "projectId is required"
    );
  }

  if (!userId) {
    throw new Error(
      "userId is required"
    );
  }

  const sourceStats =
    validateFiles(
      files
    );

  const sourceHash =
    calculateSourceHash(
      files
    );

  const packageJson =
    getPackageJson(
      files
    );

  const nodeVersion =
    resolveNodeVersion(
      requestedNodeVersion
    );

  const packageManager =
    detectPackageManager(
      files,
      requestedPackageManager
    );

  const image =
    NODE_IMAGES[
      nodeVersion
    ];

  const buildCommand =
    getBuildCommand(
      packageJson
    );

  const hasLockfile =
    files.some(
      (file) => {
        const p =
          sanitizeFilePath(
            file.path
          );

        return [
          "package-lock.json",
          "npm-shrinkwrap.json",
          "pnpm-lock.yaml",
          "yarn.lock",
          "bun.lock",
          "bun.lockb"
        ].includes(p);
      }
    );

  const installCommand =
    getInstallCommand(
      packageManager,
      hasLockfile
    );

  const buildId =
    generateBuildId();

  let workspace = null;
  let build = null;

  const startedAt =
    Date.now();

  try {
    /*
     * Docker must be available.
     */
    const dockerReady =
      await checkDockerAvailable();

    if (!dockerReady) {
      throw createBuildError({
        code:
          "DOCKER_UNAVAILABLE",

        message:
          "Docker daemon is unavailable",

        step:
          "preflight",

        category:
          "runtime"
      });
    }


    /*
     * Create DB build record.
     */
    build =
      await createBuildRecord({
        projectId,
        userId,

        buildId,

        trigger,

        framework,

        runtime,

        nodeVersion,

        packageManager,

        buildCommand,

        outputDirectory,

        sourceHash,

        aiGenerated,

        aiModel,

        promptId
      });


    /*
     * Mark running.
     */
    await updateBuild(
      build,
      {
        status:
          "running",

        startedAt:
          new Date(),

        metadata: {
          ...(build.metadata || {}),

          sourceStats,

          installCommand,

          buildCommand,

          dockerImage:
            image
        }
      }
    );


    /*
     * Workspace.
     */
    workspace =
      await createWorkspace();

    await materializeSource(
      files,
      workspace
    );


    /* =====================================================
       INSTALL DEPENDENCIES
    ===================================================== */

    const installResult =
      await runDockerCommand({
        image,
        workspace,
        command:
          installCommand,
        network:
          INSTALL_NETWORK,
        timeoutMs:
          INSTALL_TIMEOUT_MS
      });

    if (
      !installResult.success
    ) {
      const failure =
        classifyFailure({
          stage:
            "install",

          stdout:
            installResult.stdout,

          stderr:
            installResult.stderr,

          timedOut:
            installResult.timedOut
        });

      const message =
        installResult.timedOut
          ? "Dependency installation timed out"
          : (
              installResult.stderr ||
              installResult.stdout ||
              "Dependency installation failed"
            );

      const error =
        createBuildError({
          code:
            "DEPENDENCY_INSTALL_FAILED",

          message,

          step:
            "install",

          category:
            failure.category
        });

      error.stdout =
        installResult.stdout;

      error.stderr =
        installResult.stderr;

      error.retryable =
        failure.retryable;

      throw error;
    }


    /* =====================================================
       AUTHORITATIVE BUILD
    ===================================================== */

    const buildResult =
      await runDockerCommand({
        image,
        workspace,
        command:
          buildCommand,
        network:
          BUILD_NETWORK,
        timeoutMs:
          BUILD_TIMEOUT_MS
      });

    if (
      !buildResult.success
    ) {
      const failure =
        classifyFailure({
          stage:
            "build",

          stdout:
            buildResult.stdout,

          stderr:
            buildResult.stderr,

          timedOut:
            buildResult.timedOut
        });

      const message =
        buildResult.timedOut
          ? "Authoritative build timed out"
          : (
              buildResult.stderr ||
              buildResult.stdout ||
              "Authoritative build failed"
            );

      const error =
        createBuildError({
          code:
            "AUTHORITATIVE_BUILD_FAILED",

          message,

          step:
            "build",

          category:
            failure.category
        });

      error.stdout =
        buildResult.stdout;

      error.stderr =
        buildResult.stderr;

      error.retryable =
        failure.retryable;

      throw error;
    }


    /* =====================================================
       BUILD OUTPUT MANIFEST
    ===================================================== */

    const manifest =
      await createArtifactManifest(
        workspace
      );


    /* =====================================================
       ARTIFACT
    ===================================================== */

    const temporaryArtifactPath =
      path.join(
        os.tmpdir(),
        `${buildId}.tar.gz`
      );

    await createTarArtifact(
      workspace,
      temporaryArtifactPath
    );

    const artifactStat =
      await fsp.stat(
        temporaryArtifactPath
      );

    if (
      artifactStat.size >
      MAX_ARTIFACT_SIZE
    ) {
      throw new Error(
        `Artifact exceeds maximum allowed size`
      );
    }

    const artifact =
      await persistArtifact({
        buildId,
        artifactPath:
          temporaryArtifactPath
      });


    /*
     * Add manifest as artifact metadata.
     */
    const artifactRecord = {
      name:
        "build.tar.gz",

      type:
        "build",

      storageKey:
        artifact.storageKey,

      url:
        artifact.url || "",

      size:
        artifact.size,

      checksum:
        artifact.checksum
    };


    /* =====================================================
       SUCCESS
    ===================================================== */

    const durationMs =
      Date.now() -
      startedAt;

    await updateBuild(
      build,
      {
        status:
          "success",

        completedAt:
          new Date(),

        artifacts: [
          artifactRecord
        ],

        artifactCount:
          1,

        outputSize:
          artifact.size,

        errorMessage:
          "",

        errors: [],

        durationMs,

        metadata: {
          ...(build.metadata || {}),

          authoritative:
            true,

          validationMode:
            "authoritative",

          artifact: {
            manifestVersion:
              manifest.manifest
                .version,

            fileCount:
              manifest.fileCount,

            totalSourceSize:
              manifest.totalSize,

            manifestChecksum:
              manifest.artifactChecksum,

            artifactChecksum:
              artifact.checksum,

            storageType:
              ARTIFACT_BUCKET
                ? "s3"
                : "local"
          },

          buildOutput:
            {
              stdout:
                safeString(
                  buildResult.stdout,
                  20000
                ),

              stderr:
                safeString(
                  buildResult.stderr,
                  20000
                )
            }
        }
      }
    );


    /*
     * Cleanup temporary tar.
     */
    try {
      await fsp.rm(
        temporaryArtifactPath,
        {
          force: true
        }
      );
    } catch {}


    return {
      success:
        true,

      status:
        "success",

      authoritative:
        true,

      validationMode:
        "authoritative",

      serviceVersion:
        SERVICE_VERSION,

      buildId,

      buildNumber:
        build.buildNumber,

      sourceHash,

      projectId,

      projectName,

      framework,

      runtime,

      nodeVersion,

      packageManager,

      buildCommand,

      artifact: {
        name:
          artifactRecord.name,

        type:
          artifactRecord.type,

        storageKey:
          artifactRecord.storageKey,

        url:
          artifactRecord.url,

        size:
          artifactRecord.size,

        checksum:
          artifactRecord.checksum,

        fileCount:
          manifest.fileCount
      },

      durationMs,

      errors: [],

      warnings: [],

      summary:
        "Authoritative build completed and verified artifact was created."
    };

  } catch (error) {

    const normalized =
      error &&
      error.code
        ? error
        : createBuildError({
            code:
              "AUTHORITATIVE_BUILD_FAILED",

            message:
              error.message ||
              "Authoritative build failed",

            step:
              "build",

            category:
              "unknown"
          });

    if (build) {
      const durationMs =
        Date.now() -
        startedAt;

      await updateBuild(
        build,
        {
          status:
            "failed",

          completedAt:
            new Date(),

          durationMs,

          errorMessage:
            safeString(
              normalized.message,
              4000
            ),

          errors: [
            {
              code:
                safeString(
                  normalized.code,
                  200
                ),

              message:
                safeString(
                  normalized.message,
                  4000
                ),

              step:
                safeString(
                  normalized.step ||
                    "build",
                  300
                ),

              file:
                safeString(
                  normalized.file ||
                    "",
                  1000
                ),

              line:
                normalized.line ||
                null,

              column:
                normalized.column ||
                null
            }
          ],

          metadata: {
            ...(build.metadata || {}),

            failureCategory:
              normalized.category ||
              "unknown",

            retryable:
              Boolean(
                normalized.retryable
              )
          }
        }
      );
    }

    return {
      success:
        false,

      status:
        "failed",

      authoritative:
        true,

      validationMode:
        "authoritative",

      serviceVersion:
        SERVICE_VERSION,

      buildId,

      buildNumber:
        build &&
        build.buildNumber,

      sourceHash,

      projectId,

      projectName,

      framework,

      runtime,

      nodeVersion,

      packageManager,

      failureStage:
        normalized.step ||
        "build",

      failureCategory:
        normalized.category ||
        "unknown",

      retryable:
        Boolean(
          normalized.retryable
        ),

      errors: [
        {
          code:
            normalized.code ||
            "AUTHORITATIVE_BUILD_FAILED",

          message:
            normalized.message ||
            "Authoritative build failed",

          step:
            normalized.step ||
            "build"
        }
      ],

      stdout:
        safeString(
          normalized.stdout ||
            "",
          20000
        ),

      stderr:
        safeString(
          normalized.stderr ||
            "",
          20000
        ),

      summary:
        normalized.message ||
        "Authoritative build failed."
    };

  } finally {
    /*
     * Source workspace is disposable.
     *
     * Artifact survives independently.
     */
    await cleanupWorkspace(
      workspace
    );
  }
}


/* =========================================================
   CONCURRENCY QUEUE
========================================================= */

function acquireBuildSlot() {
  if (
    activeBuilds <
    MAX_CONCURRENT_BUILDS
  ) {
    activeBuilds++;
    return Promise.resolve();
  }

  return new Promise(
    (resolve) => {
      buildQueue.push(
        resolve
      );
    }
  );
}


function releaseBuildSlot() {
  activeBuilds =
    Math.max(
      0,
      activeBuilds - 1
    );

  const next =
    buildQueue.shift();

  if (next) {
    activeBuilds++;
    next();
  }
}


/* =========================================================
   PUBLIC BUILD API
========================================================= */

async function buildProject(
  options
) {
  await acquireBuildSlot();

  try {
    return await executeBuild(
      options
    );
  } finally {
    releaseBuildSlot();
  }
}


/* =========================================================
   ARTIFACT VERIFICATION
========================================================= */

async function verifyArtifactChecksum(
  artifactPath,
  expectedChecksum
) {
  if (
    !artifactPath ||
    !expectedChecksum
  ) {
    return false;
  }

  if (
    !fs.existsSync(
      artifactPath
    )
  ) {
    return false;
  }

  const actual =
    await checksumFile(
      artifactPath
    );

  return (
    actual ===
    expectedChecksum
  );
}


/* =========================================================
   AUTHORITATIVE READY CHECK
========================================================= */

function isAuthoritativeBuildReady(
  buildResult
) {
  return Boolean(
    buildResult &&
    buildResult.success === true &&
    buildResult.authoritative === true &&
    buildResult.validationMode ===
      "authoritative" &&
    buildResult.buildId &&
    buildResult.artifact &&
    buildResult.artifact.storageKey &&
    buildResult.artifact.checksum
  );
}


/* =========================================================
   ARTIFACT LOOKUP
========================================================= */

async function getBuildArtifact({
  projectId,
  userId,
  buildId
}) {
  const build =
    await ProjectBuild.findOne({
      projectId,
      userId,
      buildId,
      status:
        "success"
    }).lean();

  if (!build) {
    throw new Error(
      "Successful authoritative build not found"
    );
  }

  if (
    !build.metadata ||
    build.metadata.authoritative !==
      true
  ) {
    throw new Error(
      "Build is not authoritative"
    );
  }

  if (
    !Array.isArray(
      build.artifacts
    ) ||
    build.artifacts.length === 0
  ) {
    throw new Error(
      "Authoritative build has no artifact"
    );
  }

  const artifact =
    build.artifacts.find(
      (item) =>
        item.type ===
        "build"
    ) ||
    build.artifacts[0];

  if (
    !artifact.storageKey ||
    !artifact.checksum
  ) {
    throw new Error(
      "Build artifact metadata is incomplete"
    );
  }

  return {
    buildId:
      build.buildId,

    buildNumber:
      build.buildNumber,

    projectId:
      build.projectId,

    sourceHash:
      build.metadata
        .sourceHash || "",

    artifact
  };
}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  SERVICE_VERSION,

  buildProject,

  executeBuild,

  isAuthoritativeBuildReady,

  getBuildArtifact,

  verifyArtifactChecksum,

  calculateSourceHash,

  validateFiles,

  detectPackageManager
};
