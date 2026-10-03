const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const Project = require("../models/projectModel");
const ProjectBuild = require("../models/projectBuildModel");
const ProjectPreview = require("../models/projectPreviewModel");

const authoritativeBuildService = require("./authoritativeBuildService");


/* =========================================================
   ZYRION OS — PREVIEW SERVICE
   ENTERPRISE ARTIFACT-NATIVE PREVIEW RUNTIME

   Architecture:

   Project
      ↓
   Successful Authoritative Build
      ↓
   ProjectBuild.artifacts[]
      ↓
   Artifact Verification
      ↓
   Artifact Extraction
      ↓
   Runtime Preparation
      ↓
   Isolated Docker Runtime
      ↓
   Health Check
      ↓
   Preview URL

   IMPORTANT:

   1. Preview NEVER trusts raw generated source as the
      authoritative build result.

   2. Preview NEVER calls the authoritative build service
      to rebuild the same source.

   3. Preview consumes an existing successful authoritative
      build artifact.

   4. Artifact checksum is verified before extraction.

   5. Production secrets are never injected.

   6. Runtime is isolated inside Docker.

   7. Preview is ephemeral and TTL controlled.

   8. MongoDB is the persistent source of truth.

   9. activeRuntimes is only process-local coordination
      state and is NOT treated as persistent state.
   ========================================================= */


/* =========================================================
   SERVICE CONFIGURATION
========================================================= */

const SERVICE_VERSION = "2.0.0";

const DEFAULT_TTL_MS =
  Number(process.env.PREVIEW_TTL_MS) ||
  30 * 60 * 1000;

const MIN_TTL_MS =
  5 * 60 * 1000;

const MAX_TTL_MS =
  24 * 60 * 60 * 1000;

const STARTUP_TIMEOUT_MS =
  Number(process.env.PREVIEW_STARTUP_TIMEOUT_MS) ||
  60 * 1000;

const HEALTHCHECK_TIMEOUT_MS =
  Number(process.env.PREVIEW_HEALTHCHECK_TIMEOUT_MS) ||
  15 * 1000;

const HEALTHCHECK_INTERVAL_MS =
  Number(process.env.PREVIEW_HEALTHCHECK_INTERVAL_MS) ||
  1000;

const MAX_ARTIFACT_SIZE =
  Number(process.env.PREVIEW_MAX_ARTIFACT_SIZE) ||
  500 * 1024 * 1024;

const PREVIEW_CPU_LIMIT =
  process.env.PREVIEW_CPU_LIMIT ||
  "1";

const PREVIEW_MEMORY_LIMIT =
  process.env.PREVIEW_MEMORY_LIMIT ||
  "512m";

const PREVIEW_PIDS_LIMIT =
  Number(process.env.PREVIEW_PIDS_LIMIT) ||
  128;

const PREVIEW_NETWORK =
  process.env.PREVIEW_NETWORK ||
  "bridge";

const PREVIEW_CONTAINER_PORT =
  Number(process.env.PREVIEW_CONTAINER_PORT) ||
  3000;

const PREVIEW_IMAGE =
  process.env.PREVIEW_DOCKER_IMAGE ||
  "node:20-bookworm-slim";

const PREVIEW_BASE_URL =
  String(
    process.env.PREVIEW_BASE_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");

const ARTIFACT_ROOT =
  process.env.AUTH_ARTIFACT_ROOT ||
  path.join(
    os.tmpdir(),
    "zyrionos-build-artifacts"
  );

const ARTIFACT_BUCKET =
  process.env.AUTH_ARTIFACT_BUCKET ||
  "";

const ARTIFACT_REGION =
  process.env.AWS_REGION ||
  "ap-south-1";

const ARTIFACT_STORAGE_PREFIX =
  String(
    process.env.AUTH_ARTIFACT_PREFIX ||
      "zyrionos/builds"
  )
    .replace(/^\/+|\/+$/g, "");

const MAX_LOG_SIZE =
  Number(process.env.PREVIEW_MAX_LOG_SIZE) ||
  1024 * 1024;

const RUNTIME_INSTALL_TIMEOUT_MS =
  Number(
    process.env.PREVIEW_RUNTIME_INSTALL_TIMEOUT_MS
  ) ||
  5 * 60 * 1000;


/* =========================================================
   ACTIVE RUNTIME REGISTRY
========================================================= */

const activeRuntimes =
  new Map();


/* =========================================================
   UTILITIES
========================================================= */

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto
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


function clamp(
  value,
  min,
  max
) {
  return Math.min(
    Math.max(value, min),
    max
  );
}


function safeString(
  value,
  max = 5000
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).slice(
    0,
    max
  );
}


function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


/* =========================================================
   ERROR CREATION
========================================================= */

function createPreviewError(
  code,
  message,
  stage = "system",
  category = "unknown",
  retryable = false
) {
  const error =
    new Error(
      safeString(
        message,
        5000
      )
    );

  error.code =
    code;

  error.stage =
    stage;

  error.category =
    category;

  error.retryable =
    Boolean(
      retryable
    );

  return error;
}


/* =========================================================
   DOCKER AVAILABILITY
========================================================= */

function dockerAvailable() {
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
          5000
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
   TEMP WORKSPACE
========================================================= */

async function createWorkspace() {
  return fsp.mkdtemp(
    path.join(
      os.tmpdir(),
      "zyrion-preview-"
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
      "[PreviewService] workspace cleanup failed:",
      error.message
    );
  }
}


/* =========================================================
   PATH SAFETY
========================================================= */

function validateArchivePath(
  archivePath
) {
  const normalized =
    String(
      archivePath || ""
    )
      .replace(
        /\\/g,
        "/"
      )
      .trim();

  if (!normalized) {
    return false;
  }

  if (
    normalized.startsWith("/")
  ) {
    return false;
  }

  if (
    normalized.includes("\0")
  ) {
    return false;
  }

  const parts =
    normalized.split("/");

  if (
    parts.includes("..")
  ) {
    return false;
  }

  return true;
}


function ensureInside(
  root,
  target
) {
  const rootPath =
    path.resolve(root) +
    path.sep;

  const targetPath =
    path.resolve(target);

  if (
    !targetPath.startsWith(
      rootPath
    )
  ) {
    throw new Error(
      "Path escapes preview workspace"
    );
  }
}


/* =========================================================
   ARTIFACT LOCAL PATH
========================================================= */

function resolveLocalArtifactPath(
  storageKey
) {
  if (!storageKey) {
    throw new Error(
      "Artifact storage key is missing"
    );
  }

  const prefix =
    `${ARTIFACT_STORAGE_PREFIX}/`;

  if (
    !storageKey.startsWith(
      prefix
    )
  ) {
    throw new Error(
      "Invalid artifact storage key"
    );
  }

  const relative =
    storageKey.slice(
      prefix.length
    );

  if (
    !validateArchivePath(
      relative
    )
  ) {
    throw new Error(
      "Unsafe artifact storage path"
    );
  }

  const root =
    path.resolve(
      ARTIFACT_ROOT
    );

  const artifactPath =
    path.resolve(
      root,
      relative
    );

  ensureInside(
    root,
    artifactPath
  );

  return artifactPath;
}


/* =========================================================
   CHECKSUM
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
   ARTIFACT DOWNLOAD
========================================================= */

async function downloadS3Artifact(
  storageKey,
  destination
) {
  let S3Client;
  let GetObjectCommand;

  try {
    const s3 =
      require(
        "@aws-sdk/client-s3"
      );

    S3Client =
      s3.S3Client;

    GetObjectCommand =
      s3.GetObjectCommand;

  } catch {
    throw new Error(
      "S3 artifact storage requires @aws-sdk/client-s3"
    );
  }

  const client =
    new S3Client({
      region:
        ARTIFACT_REGION
    });

  const result =
    await client.send(
      new GetObjectCommand({
        Bucket:
          ARTIFACT_BUCKET,

        Key:
          storageKey
      })
    );

  if (
    !result.Body
  ) {
    throw new Error(
      "Artifact download returned an empty body"
    );
  }

  const file =
    fs.createWriteStream(
      destination
    );

  await new Promise(
    (resolve, reject) => {
      result.Body.pipe(
        file
      );

      result.Body.on(
        "error",
        reject
      );

      file.on(
        "finish",
        resolve
      );

      file.on(
        "error",
        reject
      );
    }
  );
}


async function acquireArtifact({
  artifact
}) {
  if (
    !artifact ||
    !artifact.storageKey
  ) {
    throw createPreviewError(
      "PREVIEW_ARTIFACT_MISSING",
      "Authoritative build artifact is missing",
      "artifact",
      "build",
      false
    );
  }

  const workspace =
    await createWorkspace();

  const artifactPath =
    path.join(
      workspace,
      "build.tar.gz"
    );

  try {
    /*
     * S3 artifact.
     */
    if (
      ARTIFACT_BUCKET
    ) {
      await downloadS3Artifact(
        artifact.storageKey,
        artifactPath
      );
    } else {
      /*
       * Local artifact.
       */
      const sourcePath =
        resolveLocalArtifactPath(
          artifact.storageKey
        );

      await fsp.copyFile(
        sourcePath,
        artifactPath
      );
    }

    const stat =
      await fsp.stat(
        artifactPath
      );

    if (
      stat.size >
      MAX_ARTIFACT_SIZE
    ) {
      throw createPreviewError(
        "PREVIEW_ARTIFACT_TOO_LARGE",
        "Build artifact exceeds preview size limit",
        "artifact",
        "resource",
        false
      );
    }

    /*
     * Verify immutable artifact checksum
     * before any extraction.
     */
    const actualChecksum =
      await checksumFile(
        artifactPath
      );

    if (
      actualChecksum !==
      artifact.checksum
    ) {
      throw createPreviewError(
        "PREVIEW_ARTIFACT_CHECKSUM_MISMATCH",
        "Build artifact checksum verification failed",
        "artifact",
        "build",
        false
      );
    }

    return {
      workspace,
      artifactPath,
      checksum:
        actualChecksum,
      size:
        stat.size
    };

  } catch (error) {
    await cleanupWorkspace(
      workspace
    );

    throw error;
  }
}


/* =========================================================
   ARCHIVE VALIDATION
========================================================= */

async function listArchiveFiles(
  artifactPath
) {
  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          "tar",
          [
            "-tzf",
            artifactPath
          ],
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

      child.stdout.on(
        "data",
        (chunk) => {
          stdout +=
            chunk.toString();
        }
      );

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
                "Unable to inspect build artifact"
              )
            );
          }

          const entries =
            stdout
              .split(/\r?\n/)
              .map(
                (value) =>
                  value.trim()
              )
              .filter(
                Boolean
              );

          for (
            const entry of entries
          ) {
            if (
              !validateArchivePath(
                entry
              )
            ) {
              return reject(
                new Error(
                  `Unsafe path detected inside build artifact: ${entry}`
                )
              );
            }
          }

          resolve(
            entries
          );
        }
      );
    }
  );
}


/* =========================================================
   ARTIFACT EXTRACTION
========================================================= */

async function extractArtifact({
  artifactPath,
  destination
}) {
  await listArchiveFiles(
    artifactPath
  );

  await fsp.mkdir(
    destination,
    {
      recursive: true
    }
  );

  await new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          "tar",
          [
            "--no-same-owner",
            "--no-same-permissions",
            "-xzf",
            artifactPath,
            "-C",
            destination
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
                "Build artifact extraction failed"
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
    !fs.existsSync(
      packagePath
    )
  ) {
    throw createPreviewError(
      "PREVIEW_PACKAGE_JSON_MISSING",
      "Build artifact does not contain package.json",
      "runtime",
      "runtime",
      false
    );
  }

  try {
    const raw =
      await fsp.readFile(
        packagePath,
        "utf8"
      );

    return JSON.parse(
      raw
    );

  } catch {
    throw createPreviewError(
      "PREVIEW_PACKAGE_JSON_INVALID",
      "Build artifact contains invalid package.json",
      "runtime",
      "runtime",
      false
    );
  }
}


/* =========================================================
   PACKAGE MANAGER
========================================================= */

function detectPackageManager(
  workspace,
  project,
  build
) {
  /*
   * The authoritative build's package manager
   * is the source of truth.
   */
  if (
    build.packageManager &&
    [
      "npm",
      "yarn",
      "pnpm",
      "bun"
    ].includes(
      build.packageManager
    )
  ) {
    return build.packageManager;
  }

  if (
    project.settings &&
    [
      "npm",
      "yarn",
      "pnpm",
      "bun"
    ].includes(
      project.settings.packageManager
    )
  ) {
    return project.settings.packageManager;
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
        "bun.lock"
      )
    ) ||
    fs.existsSync(
      path.join(
        workspace,
        "bun.lockb"
      )
    )
  ) {
    return "bun";
  }

  return "npm";
}


/* =========================================================
   RUNTIME INSTALL COMMAND
========================================================= */

function getRuntimeInstallCommand(
  packageManager,
  hasLockfile
) {
  switch (
    packageManager
  ) {
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


/* =========================================================
   START COMMAND
========================================================= */

function resolveStartCommand(
  project,
  packageJson
) {
  const scripts =
    packageJson.scripts || {};

  /*
   * A preview command can be supplied through
   * project settings in future.
   */
  if (
    project.settings &&
    project.settings.previewCommand
  ) {
    return String(
      project.settings.previewCommand
    );
  }

  /*
   * Production start.
   */
  if (
    typeof scripts.start ===
      "string" &&
    scripts.start.trim()
  ) {
    return "npm run start";
  }

  /*
   * Vite preview.
   */
  if (
    typeof scripts.preview ===
      "string" &&
    scripts.preview.trim()
  ) {
    return "npm run preview -- --host 0.0.0.0";
  }

  /*
   * Development fallback.
   */
  if (
    typeof scripts.dev ===
      "string" &&
    scripts.dev.trim()
  ) {
    return "npm run dev -- --host 0.0.0.0";
  }

  throw createPreviewError(
    "PREVIEW_START_COMMAND_MISSING",
    "Build artifact has no supported start, preview, or dev script",
    "startup",
    "runtime",
    false
  );
}


/* =========================================================
   LOG BUFFER
========================================================= */

function createLogBuffer() {
  let stdout = "";
  let stderr = "";

  function append(
    current,
    chunk
  ) {
    const next =
      current +
      chunk.toString();

    if (
      Buffer.byteLength(
        next,
        "utf8"
      ) <=
      MAX_LOG_SIZE
    ) {
      return next;
    }

    return next.slice(
      -MAX_LOG_SIZE
    );
  }

  return {
    appendStdout(
      chunk
    ) {
      stdout =
        append(
          stdout,
          chunk
        );
    },

    appendStderr(
      chunk
    ) {
      stderr =
        append(
          stderr,
          chunk
        );
    },

    get stdout() {
      return stdout;
    },

    get stderr() {
      return stderr;
    }
  };
}


/* =========================================================
   DOCKER COMMAND
========================================================= */

function spawnDocker(
  args,
  options = {}
) {
  return spawn(
    "docker",
    args,
    {
      cwd:
        options.cwd,

      env: {
        /*
         * Start with only a clean subset of the
         * server environment.
         *
         * Generated preview applications should
         * never inherit backend credentials.
         */
        NODE_ENV:
          "production",

        PATH:
          process.env.PATH,

        ...(
          options.env || {}
        )
      },

      stdio: [
        "ignore",
        "pipe",
        "pipe"
      ]
    }
  );
}


/* =========================================================
   RUNTIME INSTALL
========================================================= */

async function installRuntimeDependencies({
  workspace,
  packageManager,
  hasLockfile,
  image
}) {
  const command =
    getRuntimeInstallCommand(
      packageManager,
      hasLockfile
    );

  return runDockerCommand({
    image,
    workspace,
    command,
    network:
      PREVIEW_NETWORK,
    timeoutMs:
      RUNTIME_INSTALL_TIMEOUT_MS
  });
}


/* =========================================================
   DOCKER COMMAND EXECUTION
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
        PREVIEW_CPU_LIMIT,

        "--memory",
        PREVIEW_MEMORY_LIMIT,

        "--pids-limit",
        String(
          PREVIEW_PIDS_LIMIT
        ),

        "--cap-drop",
        "ALL",

        "--security-opt",
        "no-new-privileges",

        "--read-only",

        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=128m",

        "--tmpfs",
        "/home/node:rw,nosuid,size=64m",

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
        spawnDocker(
          args
        );

      const logs =
        createLogBuffer();

      let finished =
        false;

      let timedOut =
        false;

      const timer =
        setTimeout(
          () => {
            if (
              finished
            ) {
              return;
            }

            timedOut =
              true;

            try {
              child.kill(
                "SIGKILL"
              );
            } catch {}
          },
          timeoutMs
        );

      child.stdout.on(
        "data",
        (chunk) =>
          logs.appendStdout(
            chunk
          )
      );

      child.stderr.on(
        "data",
        (chunk) =>
          logs.appendStderr(
            chunk
          )
      );

      child.on(
        "error",
        (error) => {
          if (
            finished
          ) {
            return;
          }

          finished =
            true;

          clearTimeout(
            timer
          );

          resolve({
            success:
              false,

            timedOut,

            exitCode:
              null,

            signal:
              null,

            stdout:
              logs.stdout,

            stderr:
              logs.stderr ||
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
            finished
          ) {
            return;
          }

          finished =
            true;

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

            stdout:
              logs.stdout,

            stderr:
              logs.stderr
          });
        }
      );
    }
  );
}


/* =========================================================
   START RUNTIME
========================================================= */

async function startRuntime({
  previewId,
  workspace,
  startCommand,
  nodeVersion
}) {
  const safeId =
    previewId
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(-50);

  const containerName =
    `zyrion-preview-${safeId}`;

  const image =
    NODE_IMAGES[
      nodeVersion
    ] ||
    PREVIEW_IMAGE;

  const args = [
    "run",
    "--rm",

    "--name",
    containerName,

    "--cpus",
    PREVIEW_CPU_LIMIT,

    "--memory",
    PREVIEW_MEMORY_LIMIT,

    "--pids-limit",
    String(
      PREVIEW_PIDS_LIMIT
    ),

    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    "--read-only",

    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=128m",

    "--tmpfs",
    "/home/node:rw,nosuid,size=64m",

    "-p",
    `127.0.0.1::${PREVIEW_CONTAINER_PORT}`,

    "-w",
    "/workspace",

    "-e",
    `PORT=${PREVIEW_CONTAINER_PORT}`,

    "-e",
    "HOST=0.0.0.0",

    "-e",
    "NODE_ENV=production",

    "-v",
    `${workspace}:/workspace:rw`,

    /*
     * Runtime does not need outbound network
     * after dependency preparation.
     */
    "--network",
    "none",

    image,

    "sh",
    "-lc",
    startCommand
  ];

  const child =
    spawnDocker(
      args
    );

  const logs =
    createLogBuffer();

  let started =
    false;

  let resolved =
    false;

  return new Promise(
    (resolve) => {
      const timer =
        setTimeout(
          () => {
            if (
              resolved
            ) {
              return;
            }

            resolved =
              true;

            try {
              child.kill(
                "SIGTERM"
              );
            } catch {}

            resolve({
              success:
                false,

              timedOut:
                true,

              containerName,

              stdout:
                logs.stdout,

              stderr:
                logs.stderr
            });
          },
          STARTUP_TIMEOUT_MS
        );

      child.stdout.on(
        "data",
        (chunk) => {
          logs.appendStdout(
            chunk
          );

          if (
            !started
          ) {
            started =
              true;
          }
        }
      );

      child.stderr.on(
        "data",
        (chunk) => {
          logs.appendStderr(
            chunk
          );

          if (
            !started
          ) {
            started =
              true;
          }
        }
      );

      child.on(
        "error",
        (error) => {
          if (
            resolved
          ) {
            return;
          }

          resolved =
            true;

          clearTimeout(
            timer
          );

          resolve({
            success:
              false,

            timedOut:
              false,

            containerName,

            error:
              error.message,

            stdout:
              logs.stdout,

            stderr:
              logs.stderr
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
            resolved
          ) {
            return;
          }

          /*
           * If the process exits before health check,
           * startup failed.
           */
          resolved =
            true;

          clearTimeout(
            timer
          );

          resolve({
            success:
              false,

            timedOut:
              false,

            containerName,

            exitCode:
              code,

            signal:
              signal || null,

            stdout:
              logs.stdout,

            stderr:
              logs.stderr
          });
        }
      );

      /*
       * Docker has been given enough time to create
       * the runtime. Health check is the actual readiness
       * gate.
       */
      setTimeout(
        () => {
          if (
            resolved
          ) {
            return;
          }

          resolve({
            success:
              true,

            timedOut:
              false,

            containerName,

            process:
              child,

            logs
          });
        },
        1500
      );
    }
  );
}


/* =========================================================
   PORT LOOKUP
========================================================= */

async function getMappedPort(
  containerName
) {
  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          "docker",
          [
            "port",
            containerName,
            String(
              PREVIEW_CONTAINER_PORT
            )
          ],
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

      child.stdout.on(
        "data",
        (chunk) => {
          stdout +=
            chunk.toString();
        }
      );

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
                "Unable to resolve preview port"
              )
            );
          }

          const match =
            stdout.match(
              /:(\d+)/
            );

          if (
            !match
          ) {
            return reject(
              new Error(
                "Docker did not return a mapped preview port"
              )
            );
          }

          resolve(
            Number(
              match[1]
            )
          );
        }
      );
    }
  );
}


/* =========================================================
   HEALTH CHECK
========================================================= */

async function healthCheck(
  url
) {
  const startedAt =
    Date.now();

  const deadline =
    startedAt +
    HEALTHCHECK_TIMEOUT_MS;

  let attempts =
    0;

  let lastError =
    null;

  while (
    Date.now() <
    deadline
  ) {
    attempts++;

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
            method:
              "GET",

            redirect:
              "manual",

            signal:
              controller.signal
          }
        );

      clearTimeout(
        timer
      );

      const responseTimeMs =
        Date.now() -
        startedAt;

      /*
       * Any application response means the
       * process is reachable. Application-level
       * errors are preserved in the response status.
       */
      if (
        response.status >= 200 &&
        response.status < 500
      ) {
        return {
          healthy:
            true,

          status:
            response.status,

          responseTimeMs,

          attempts
        };
      }

      lastError =
        `Preview returned HTTP ${response.status}`;

    } catch (error) {
      lastError =
        error.message;
    }

    await sleep(
      HEALTHCHECK_INTERVAL_MS
    );
  }

  return {
    healthy:
      false,

    status:
      null,

    responseTimeMs:
      Date.now() -
      startedAt,

    attempts,

    error:
      lastError ||
      "Preview health check timed out"
  };
}


/* =========================================================
   STOP CONTAINER
========================================================= */

async function stopContainer(
  containerName
) {
  if (
    !containerName
  ) {
    return;
  }

  await new Promise(
    (resolve) => {
      const child =
        spawn(
          "docker",
          [
            "stop",
            "-t",
            "5",
            containerName
          ],
          {
            stdio:
              "ignore"
          }
        );

      const timer =
        setTimeout(
          () => {
            try {
              child.kill(
                "SIGKILL"
              );
            } catch {}

            resolve();
          },
          10000
        );

      child.on(
        "close",
        () => {
          clearTimeout(
            timer
          );

          resolve();
        }
      );

      child.on(
        "error",
        () => {
          clearTimeout(
            timer
          );

          resolve();
        }
      );
    }
  );
}


/* =========================================================
   PREVIEW URL
========================================================= */

function createPreviewUrl(
  previewId,
  mappedPort
) {
  /*
   * Production:
   *
   * PREVIEW_BASE_URL=https://preview.zyrionos.com
   *
   * The gateway/reverse proxy should route:
   *
   * /preview/:previewId
   *
   * to the correct runtime.
   */

  if (
    PREVIEW_BASE_URL
  ) {
    return `${PREVIEW_BASE_URL}/preview/${encodeURIComponent(
      previewId
    )}`;
  }

  /*
   * Local development fallback.
   */
  return `http://127.0.0.1:${mappedPort}`;
}


/* =========================================================
   GET AUTHORITATIVE BUILD
========================================================= */

async function getAuthoritativeBuild({
  projectId,
  userId,
  buildId
}) {
  if (
    !buildId
  ) {
    throw createPreviewError(
      "PREVIEW_BUILD_ID_REQUIRED",
      "A successful authoritative buildId is required for preview",
      "build",
      "build",
      false
    );
  }

  const build =
    await ProjectBuild.findOne({
      projectId,
      userId,
      buildId
    });

  if (
    !build
  ) {
    throw createPreviewError(
      "PREVIEW_BUILD_NOT_FOUND",
      "Authoritative build was not found",
      "build",
      "build",
      false
    );
  }

  if (
    build.status !==
    "success"
  ) {
    throw createPreviewError(
      "PREVIEW_BUILD_NOT_SUCCESSFUL",
      `Preview requires a successful build. Current status: ${build.status}`,
      "build",
      "build",
      false
    );
  }

  if (
    !build.metadata ||
    build.metadata.authoritative !==
      true
  ) {
    throw createPreviewError(
      "PREVIEW_BUILD_NOT_AUTHORITATIVE",
      "Selected build is not an authoritative build",
      "build",
      "build",
      false
    );
  }

  if (
    build.metadata.validationMode !==
    "authoritative"
  ) {
    throw createPreviewError(
      "PREVIEW_BUILD_VALIDATION_MODE_INVALID",
      "Selected build does not have authoritative validation mode",
      "build",
      "build",
      false
    );
  }

  if (
    !Array.isArray(
      build.artifacts
    ) ||
    build.artifacts.length === 0
  ) {
    throw createPreviewError(
      "PREVIEW_BUILD_ARTIFACT_MISSING",
      "Successful authoritative build has no artifact",
      "artifact",
      "build",
      false
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
    throw createPreviewError(
      "PREVIEW_ARTIFACT_METADATA_INVALID",
      "Authoritative build artifact metadata is incomplete",
      "artifact",
      "build",
      false
    );
  }

  return {
    build,
    artifact
  };
}


/* =========================================================
   PREVIEW NUMBER
========================================================= */

async function getNextPreviewNumber(
  projectId
) {
  const latest =
    await ProjectPreview
      .findOne({
        projectId
      })
      .sort({
        previewNumber:
          -1
      })
      .select({
        previewNumber:
          1
      })
      .lean();

  return latest &&
    Number.isFinite(
      latest.previewNumber
    )
    ? latest.previewNumber + 1
    : 1;
}


/* =========================================================
   STATUS
========================================================= */

async function updatePreviewStatus(
  preview,
  status
) {
  preview.status =
    status;

  if (
    status ===
    "stopped" &&
    !preview.stoppedAt
  ) {
    preview.stoppedAt =
      new Date();
  }

  if (
    [
      "stopped",
      "expired",
      "cancelled",
      "failed"
    ].includes(
      status
    ) &&
    !preview.completedAt
  ) {
    preview.completedAt =
      new Date();
  }

  await preview.save();

  return preview;
}


/* =========================================================
   NORMALIZE ERROR
========================================================= */

function normalizePreviewError(
  error
) {
  return {
    code:
      safeString(
        error.code ||
          "PREVIEW_FAILED",
        200
      ),

    message:
      safeString(
        error.message ||
          "Preview failed",
        5000
      ),

    stage:
      safeString(
        error.stage ||
          "system",
        100
      ),

    category:
      safeString(
        error.category ||
          "unknown",
        100
      ),

    retryable:
      Boolean(
        error.retryable
      ),

    timestamp:
      new Date()
  };
}


/* =========================================================
   CREATE PREVIEW
========================================================= */

async function createPreview({
  projectId,
  userId,
  buildId,
  trigger = "manual",
  ttlMs = DEFAULT_TTL_MS,
  workspaceSessionId = "",
  aiGenerated = false,
  aiModel = "",
  promptId = ""
}) {
  if (
    !projectId
  ) {
    throw new Error(
      "projectId is required"
    );
  }

  if (
    !userId
  ) {
    throw new Error(
      "userId is required"
    );
  }

  /*
   * IMPORTANT:
   *
   * buildId is mandatory in the artifact-native
   * architecture.
   *
   * No hidden rebuild is performed here.
   */
  if (
    !buildId
  ) {
    throw createPreviewError(
      "PREVIEW_BUILD_ID_REQUIRED",
      "Preview requires a successful authoritative buildId",
      "build",
      "build",
      false
    );
  }

  const project =
    await Project.findOne({
      _id:
        projectId,

      userId
    });

  if (
    !project
  ) {
    throw createPreviewError(
      "PROJECT_NOT_FOUND",
      "Project not found",
      "validation",
      "validation",
      false
    );
  }

  if (
    project.isArchived
  ) {
    throw createPreviewError(
      "PROJECT_ARCHIVED",
      "Cannot create preview for archived project",
      "validation",
      "validation",
      false
    );
  }

  if (
    project.settings &&
    project.settings.previewEnabled ===
      false
  ) {
    throw createPreviewError(
      "PREVIEW_DISABLED",
      "Preview is disabled for this project",
      "validation",
      "validation",
      false
    );
  }


  /* -------------------------------------------------------
     Build gate
  ------------------------------------------------------- */

  const {
    build,
    artifact
  } =
    await getAuthoritativeBuild({
      projectId,
      userId,
      buildId
    });


  /* -------------------------------------------------------
     Source identity
  ------------------------------------------------------- */

  const sourceHash =
    build.metadata &&
    build.metadata.sourceHash
      ? build.metadata.sourceHash
      : "";


  /* -------------------------------------------------------
     TTL
  ------------------------------------------------------- */

  const normalizedTtl =
    clamp(
      Number(ttlMs) ||
        DEFAULT_TTL_MS,

      MIN_TTL_MS,

      MAX_TTL_MS
    );

  const expiresAt =
    new Date(
      Date.now() +
      normalizedTtl
    );


  /* -------------------------------------------------------
     Preview identity
  ------------------------------------------------------- */

  const previewId =
    generateId(
      "preview"
    );

  const previewNumber =
    await getNextPreviewNumber(
      project._id
    );


  /* -------------------------------------------------------
     Persist queued state
  ------------------------------------------------------- */

  const preview =
    new ProjectPreview({
      projectId:
        project._id,

      userId,

      previewId,

      previewNumber,

      buildId:
        build.buildId,

      buildNumber:
        build.buildNumber,

      sourceVersionId:
        build.sourceVersionId ||
        null,

      sourceHash,

      framework:
        build.framework ||
        project.framework,

      runtime:
        build.runtime ||
        project.framework,

      status:
        "queued",

      trigger,

      isEphemeral:
        true,

      expiresAt,

      aiGenerated,

      aiModel,

      promptId,

      workspaceSessionId,

      productionSecretsBlocked:
        true,

      secretsInjected:
        false,

      networkAccess:
        "restricted",

      metadata: {
        serviceVersion:
          SERVICE_VERSION,

        artifactChecksum:
          artifact.checksum,

        artifactStorageKey:
          artifact.storageKey,

        authoritativeBuild:
          true
      }
    });

  await preview.save();


  let artifactWorkspace =
    null;

  let runtimeWorkspace =
    null;

  let containerName =
    "";

  try {
    /* -----------------------------------------------------
       Docker
    ----------------------------------------------------- */

    const dockerReady =
      await dockerAvailable();

    if (
      !dockerReady
    ) {
      throw createPreviewError(
        "PREVIEW_DOCKER_UNAVAILABLE",
        "Docker runtime is unavailable",
        "runtime",
        "runtime",
        true
      );
    }


    /* -----------------------------------------------------
       Artifact acquisition
    ----------------------------------------------------- */

    await updatePreviewStatus(
      preview,
      "building"
    );

    preview.buildStartedAt =
      new Date();

    await preview.save();

    const acquired =
      await acquireArtifact({
        artifact
      });

    artifactWorkspace =
      acquired.workspace;


    /* -----------------------------------------------------
       Runtime workspace
    ----------------------------------------------------- */

    runtimeWorkspace =
      await createWorkspace();

    await extractArtifact({
      artifactPath:
        acquired.artifactPath,

      destination:
        runtimeWorkspace
    });


    /* -----------------------------------------------------
       Read runtime package
    ----------------------------------------------------- */

    const packageJson =
      await readPackageJson(
        runtimeWorkspace
      );

    const packageManager =
      detectPackageManager(
        runtimeWorkspace,
        project,
        build
      );

    const nodeVersion =
      String(
        build.nodeVersion ||
          "20"
      ).match(
        /^(20|22)/
      )?.[1] ||
      "20";

    const runtimeImage =
      NODE_IMAGES[
        nodeVersion
      ] ||
      PREVIEW_IMAGE;

    const hasLockfile =
      [
        "package-lock.json",
        "npm-shrinkwrap.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lock",
        "bun.lockb"
      ].some(
        (fileName) =>
          fs.existsSync(
            path.join(
              runtimeWorkspace,
              fileName
            )
          )
      );


    /* -----------------------------------------------------
       Runtime dependency preparation
    ----------------------------------------------------- */

    /*
     * IMPORTANT:
     *
     * This is NOT an authoritative build.
     *
     * The artifact is already the verified output of
     * the authoritative build.
     *
     * This step only restores runtime dependencies
     * because node_modules was intentionally not packed
     * into the portable artifact.
     */
    const installResult =
      await installRuntimeDependencies({
        workspace:
          runtimeWorkspace,

        packageManager,

        hasLockfile,

        image:
          runtimeImage
      });

    if (
      !installResult.success
    ) {
      throw createPreviewError(
        installResult.timedOut
          ? "PREVIEW_RUNTIME_INSTALL_TIMEOUT"
          : "PREVIEW_RUNTIME_INSTALL_FAILED",

        installResult.timedOut
          ? "Preview runtime dependency preparation timed out"
          : (
              installResult.stderr ||
              installResult.stdout ||
              "Preview runtime dependency preparation failed"
            ),

        "runtime",

        installResult.timedOut
          ? "timeout"
          : "runtime",

        installResult.timedOut
      );
    }


    /* -----------------------------------------------------
       Build completed
    ----------------------------------------------------- */

    preview.buildCompletedAt =
      new Date();

    preview.runtimeInfo = {
      status:
        "starting",

      runtime:
        build.runtime ||
        project.framework,

      nodeVersion,

      packageManager,

      command:
        "",

      workingDirectory:
        "/workspace",

      cpuLimit:
        PREVIEW_CPU_LIMIT,

      memoryLimit:
        PREVIEW_MEMORY_LIMIT
    };

    await preview.save();


    /* -----------------------------------------------------
       Start runtime
    ----------------------------------------------------- */

    await updatePreviewStatus(
      preview,
      "starting"
    );

    preview.startedAt =
      new Date();

    const startCommand =
      resolveStartCommand(
        project,
        packageJson
      );

    preview.runtimeInfo.command =
      startCommand;

    await preview.save();

    const runtime =
      await startRuntime({
        previewId,

        workspace:
          runtimeWorkspace,

        startCommand,

        nodeVersion
      });

    if (
      !runtime.success
    ) {
      throw createPreviewError(
        runtime.timedOut
          ? "PREVIEW_START_TIMEOUT"
          : "PREVIEW_START_FAILED",

        runtime.timedOut
          ? "Preview runtime startup timed out"
          : (
              runtime.stderr ||
              runtime.error ||
              "Preview runtime failed to start"
            ),

        "startup",

        runtime.timedOut
          ? "timeout"
          : "runtime",

        runtime.timedOut
      );
    }

    containerName =
      runtime.containerName;

    preview.runtimeInfo.containerId =
      containerName;

    preview.runtimeInfo.status =
      "running";

    await preview.save();


    /* -----------------------------------------------------
       Port
    ----------------------------------------------------- */

    const mappedPort =
      await getMappedPort(
        containerName
      );

    preview.runtimeInfo.hostPort =
      mappedPort;

    preview.runtimeInfo.internalPort =
      PREVIEW_CONTAINER_PORT;

    await preview.save();


    /* -----------------------------------------------------
       Health
    ----------------------------------------------------- */

    const localUrl =
      `http://127.0.0.1:${mappedPort}`;

    const health =
      await healthCheck(
        localUrl
      );

    preview.healthCheck = {
      status:
        health.healthy
          ? "healthy"
          : (
              health.error &&
              health.error
                .toLowerCase()
                .includes(
                  "timeout"
                )
                ? "timeout"
                : "unhealthy"
            ),

      url:
        localUrl,

      method:
        "GET",

      expectedStatus:
        200,

      actualStatus:
        health.status,

      responseTimeMs:
        health.responseTimeMs,

      attempts:
        health.attempts,

      lastCheckedAt:
        new Date(),

      healthyAt:
        health.healthy
          ? new Date()
          : null,

      errorMessage:
        health.error || ""
    };

    if (
      !health.healthy
    ) {
      throw createPreviewError(
        "PREVIEW_HEALTHCHECK_FAILED",
        health.error ||
          "Preview failed health check",
        "healthcheck",
        "healthcheck",
        true
      );
    }


    /* -----------------------------------------------------
       READY
    ----------------------------------------------------- */

    const previewUrl =
      createPreviewUrl(
        previewId,
        mappedPort
      );

    preview.url =
      previewUrl;

    preview.publicUrl =
      previewUrl;

    preview.hostname =
      PREVIEW_BASE_URL
        ? new URL(
            PREVIEW_BASE_URL
          ).hostname
        : "127.0.0.1";

    preview.readyAt =
      new Date();

    preview.runtimeInfo.status =
      "running";

    preview.status =
      "ready";

    preview.completedAt =
      null;

    await preview.save();


    /* -----------------------------------------------------
       Runtime registry
    ----------------------------------------------------- */

    activeRuntimes.set(
      previewId,
      {
        previewId,

        containerName,

        workspace:
          runtimeWorkspace,

        artifactWorkspace,

        expiresAt:
          expiresAt.getTime()
      }
    );


    scheduleExpiration(
      previewId,
      normalizedTtl
    );


    /*
     * Artifact acquisition workspace is no longer needed.
     */
    await cleanupWorkspace(
      artifactWorkspace
    );

    artifactWorkspace =
      null;


    return serializePreview(
      preview
    );

  } catch (error) {
    const normalized =
      normalizePreviewError(
        error
      );

    preview.errors.push(
      normalized
    );

    preview.errorMessage =
      normalized.message;

    preview.failureCategory =
      normalized.category;

    preview.status =
      "failed";

    preview.completedAt =
      new Date();

    if (
      preview.runtimeInfo
    ) {
      preview.runtimeInfo.status =
        "crashed";
    }

    await preview.save();


    if (
      containerName
    ) {
      await stopContainer(
        containerName
      );
    }


    activeRuntimes.delete(
      previewId
    );


    await cleanupWorkspace(
      artifactWorkspace
    );

    await cleanupWorkspace(
      runtimeWorkspace
    );


    throw error;

  } finally {
    /*
     * Runtime workspace survives only when runtime
     * successfully entered activeRuntimes.
     */
    if (
      runtimeWorkspace &&
      !activeRuntimes.has(
        previewId
      )
    ) {
      await cleanupWorkspace(
        runtimeWorkspace
      );
    }

    if (
      artifactWorkspace
    ) {
      await cleanupWorkspace(
        artifactWorkspace
      );
    }
  }
}


/* =========================================================
   STOP PREVIEW
========================================================= */

async function stopPreview({
  projectId,
  userId,
  previewId,
  reason = "manual"
}) {
  const preview =
    await ProjectPreview.findOne({
      projectId,
      userId,
      previewId
    });

  if (
    !preview
  ) {
    throw new Error(
      "Preview not found"
    );
  }

  const runtime =
    activeRuntimes.get(
      previewId
    );

  const containerName =
    runtime?.containerName ||
    preview.runtimeInfo?.containerId ||
    "";

  if (
    containerName
  ) {
    await stopContainer(
      containerName
    );
  }

  if (
    preview.runtimeInfo
  ) {
    preview.runtimeInfo.status =
      "stopped";

    preview.runtimeInfo.stoppedAt =
      new Date();
  }

  preview.status =
    "stopped";

  preview.stoppedAt =
    new Date();

  preview.completedAt =
    new Date();

  preview.stopReason =
    safeString(
      reason,
      2000
    );

  await preview.save();


  activeRuntimes.delete(
    previewId
  );


  if (
    runtime?.workspace
  ) {
    await cleanupWorkspace(
      runtime.workspace
    );
  }

  if (
    runtime?.artifactWorkspace
  ) {
    await cleanupWorkspace(
      runtime.artifactWorkspace
    );
  }


  return serializePreview(
    preview
  );
}


/* =========================================================
   EXPIRE PREVIEW
========================================================= */

async function expirePreview(
  previewId
) {
  const preview =
    await ProjectPreview.findOne({
      previewId
    });

  if (
    !preview
  ) {
    return null;
  }

  if (
    [
      "expired",
      "stopped",
      "cancelled"
    ].includes(
      preview.status
    )
  ) {
    return serializePreview(
      preview
    );
  }

  const runtime =
    activeRuntimes.get(
      previewId
    );

  const containerName =
    runtime?.containerName ||
    preview.runtimeInfo?.containerId ||
    "";

  if (
    containerName
  ) {
    await stopContainer(
      containerName
    );
  }

  if (
    preview.runtimeInfo
  ) {
    preview.runtimeInfo.status =
      "stopped";

    preview.runtimeInfo.stoppedAt =
      new Date();
  }

  preview.status =
    "expired";

  preview.expiredAt =
    new Date();

  preview.completedAt =
    new Date();

  preview.expirationReason =
    "TTL expired";

  await preview.save();


  activeRuntimes.delete(
    previewId
  );


  if (
    runtime?.workspace
  ) {
    await cleanupWorkspace(
      runtime.workspace
    );
  }

  if (
    runtime?.artifactWorkspace
  ) {
    await cleanupWorkspace(
      runtime.artifactWorkspace
    );
  }


  return serializePreview(
    preview
  );
}


/* =========================================================
   EXPIRATION SCHEDULER
========================================================= */

function scheduleExpiration(
  previewId,
  ttlMs
) {
  const timer =
    setTimeout(
      async () => {
        try {
          await expirePreview(
            previewId
          );
        } catch (error) {
          console.error(
            "[PreviewService] expiration failed:",
            error.message
          );
        }
      },
      ttlMs
    );

  /*
   * Do not keep Node process alive only for
   * preview expiration.
   */
  if (
    typeof timer.unref ===
    "function"
  ) {
    timer.unref();
  }
}


/* =========================================================
   GET PREVIEW
========================================================= */

async function getPreview({
  projectId,
  userId,
  previewId
}) {
  const preview =
    await ProjectPreview.findOne({
      projectId,
      userId,
      previewId
    }).lean();

  if (
    !preview
  ) {
    throw new Error(
      "Preview not found"
    );
  }

  return serializePreview(
    preview
  );
}


/* =========================================================
   LIST PREVIEWS
========================================================= */

async function listPreviews({
  projectId,
  userId,
  limit = 20,
  skip = 0
}) {
  const safeLimit =
    clamp(
      Number(limit) ||
        20,

      1,

      100
    );

  const safeSkip =
    Math.max(
      Number(skip) ||
        0,

      0
    );

  const previews =
    await ProjectPreview
      .find({
        projectId,
        userId
      })
      .sort({
        createdAt:
          -1
      })
      .skip(
        safeSkip
      )
      .limit(
        safeLimit
      )
      .lean();

  return previews.map(
    serializePreview
  );
}


/* =========================================================
   CLEANUP EXPIRED PREVIEWS
========================================================= */

async function cleanupExpiredPreviews({
  limit = 50
} = {}) {
  const safeLimit =
    clamp(
      Number(limit) ||
        50,

      1,

      200
    );

  const now =
    new Date();

  const previews =
    await ProjectPreview
      .find({
        expiresAt: {
          $lte:
            now
        },

        status: {
          $in: [
            "queued",
            "building",
            "starting",
            "ready"
          ]
        }
      })
      .sort({
        expiresAt:
          1
      })
      .limit(
        safeLimit
      );

  const results =
    [];

  for (
    const preview of
      previews
  ) {
    try {
      results.push(
        await expirePreview(
          preview.previewId
        )
      );
    } catch (error) {
      console.error(
        `[PreviewService] cleanup failed for ${preview.previewId}:`,
        error.message
      );
    }
  }

  return results;
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

  if (
    !preview
  ) {
    throw new Error(
      "Preview not found"
    );
  }

  if (
    preview.status !==
    "ready"
  ) {
    return serializePreview(
      preview
    );
  }

  const runtime =
    activeRuntimes.get(
      previewId
    );

  if (
    !runtime
  ) {
    preview.status =
      "stopped";

    preview.runtimeInfo.status =
      "stopped";

    preview.completedAt =
      new Date();

    await preview.save();

    return serializePreview(
      preview
    );
  }

  const mappedPort =
    preview.runtimeInfo?.hostPort;

  if (
    !mappedPort
  ) {
    return serializePreview(
      preview
    );
  }

  const result =
    await healthCheck(
      `http://127.0.0.1:${mappedPort}`
    );

  preview.healthCheck.status =
    result.healthy
      ? "healthy"
      : "unhealthy";

  preview.healthCheck.actualStatus =
    result.status;

  preview.healthCheck.responseTimeMs =
    result.responseTimeMs;

  preview.healthCheck.attempts =
    result.attempts;

  preview.healthCheck.lastCheckedAt =
    new Date();

  preview.healthCheck.healthyAt =
    result.healthy
      ? new Date()
      : preview.healthCheck.healthyAt;

  preview.healthCheck.errorMessage =
    result.error || "";


  if (
    !result.healthy
  ) {
    preview.status =
      "failed";

    preview.failureCategory =
      "healthcheck";

    preview.errorMessage =
      result.error ||
      "Preview became unhealthy";

    preview.errors.push({
      code:
        "PREVIEW_HEALTHCHECK_FAILED",

      message:
        preview.errorMessage,

      stage:
        "healthcheck",

      category:
        "healthcheck",

      retryable:
        true,

      timestamp:
        new Date()
    });

    preview.completedAt =
      new Date();

    preview.runtimeInfo.status =
      "crashed";

    await preview.save();

    await stopContainer(
      runtime.containerName
    );

    activeRuntimes.delete(
      previewId
    );

    await cleanupWorkspace(
      runtime.workspace
    );

  } else {
    await preview.save();
  }

  return serializePreview(
    preview
  );
}


/* =========================================================
   SERIALIZATION
========================================================= */

function serializePreview(
  preview
) {
  if (
    !preview
  ) {
    return null;
  }

  const data =
    typeof preview.toObject ===
    "function"
      ? preview.toObject()
      : {
          ...preview
        };

  /*
   * Never expose internal container/runtime
   * infrastructure to frontend.
   */
  if (
    data.runtimeInfo
  ) {
    delete data.runtimeInfo.containerId;
    delete data.runtimeInfo.workerId;
    delete data.runtimeInfo.workingDirectory;
    delete data.runtimeInfo.hostPort;
    delete data.runtimeInfo.internalPort;
  }

  /*
   * Never expose internal security state.
   */
  delete data.secretsInjected;

  delete data.productionSecretsBlocked;

  /*
   * Artifact storage keys are internal infrastructure
   * identifiers. Frontend only needs preview URL.
   */
  if (
    data.metadata
  ) {
    delete data.metadata.artifactStorageKey;
  }

  return data;
}


/* =========================================================
   ARTIFACT INFORMATION
========================================================= */

async function getPreviewArtifact({
  projectId,
  userId,
  buildId
}) {
  const {
    build,
    artifact
  } =
    await getAuthoritativeBuild({
      projectId,
      userId,
      buildId
    });

  return {
    buildId:
      build.buildId,

    buildNumber:
      build.buildNumber,

    sourceHash:
      build.metadata?.sourceHash ||
      "",

    artifact: {
      name:
        artifact.name,

      type:
        artifact.type,

      size:
        artifact.size,

      checksum:
        artifact.checksum
    }
  };
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  SERVICE_VERSION,

  createPreview,

  stopPreview,

  expirePreview,

  getPreview,

  listPreviews,

  cleanupExpiredPreviews,

  refreshPreviewHealth,

  getPreviewArtifact
};
