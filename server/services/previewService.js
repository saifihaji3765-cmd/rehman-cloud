const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const Project = require("../models/projectModel");
const ProjectBuild = require("../models/projectBuildModel");
const ProjectPreview = require("../models/projectPreviewModel");

const buildValidationService = require("./buildValidationService");
const authoritativeBuildService = require("./authoritativeBuildService");


/* =========================================================
   ZYRION OS — PREVIEW SERVICE
   Enterprise Isolated Preview Runtime

   Flow:

   Project
      ↓
   Static Validation
      ↓
   Authoritative Build
      ↓
   Preview Runtime
      ↓
   Health Check
      ↓
   Preview URL

   IMPORTANT:
   - Preview is NOT production deployment.
   - Production secrets are never injected.
   - Runtime executes inside Docker.
   - Preview has TTL-based expiration.
   - Internal container/host details are never returned
     as public preview information.
   ========================================================= */


/* =========================================================
   CONFIGURATION
========================================================= */

const SERVICE_VERSION = "1.0.0";

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

const MAX_SOURCE_FILES =
  Number(process.env.PREVIEW_MAX_FILES) ||
  1000;

const MAX_FILE_SIZE =
  Number(process.env.PREVIEW_MAX_FILE_SIZE) ||
  2 * 1024 * 1024;

const MAX_TOTAL_SOURCE_SIZE =
  Number(process.env.PREVIEW_MAX_TOTAL_SOURCE_SIZE) ||
  25 * 1024 * 1024;

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

const PREVIEW_BASE_URL =
  String(process.env.PREVIEW_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

const PREVIEW_HOST =
  process.env.PREVIEW_HOST ||
  "0.0.0.0";

const PREVIEW_CONTAINER_PORT =
  Number(process.env.PREVIEW_CONTAINER_PORT) ||
  3000;

const PREVIEW_IMAGE =
  process.env.PREVIEW_DOCKER_IMAGE ||
  "node:20-bookworm-slim";

const MAX_LOG_SIZE =
  Number(process.env.PREVIEW_MAX_LOG_SIZE) ||
  1024 * 1024;


/* =========================================================
   ACTIVE RUNTIME REGISTRY
   =========================================================
   In production this should eventually move to Redis.

   This in-memory registry is intentionally only runtime
   coordination state. MongoDB remains the source of truth.
========================================================= */

const activeRuntimes = new Map();


/* =========================================================
   UTILITIES
========================================================= */

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto
    .randomBytes(8)
    .toString("hex")}`;
}


function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}


function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}


function safeString(value, max = 5000) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).slice(0, max);
}


function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}


/* =========================================================
   SOURCE HASH
========================================================= */

function calculateSourceHash(files) {
  const normalized = files
    .map((file) => ({
      path: String(file.path || ""),
      content: String(file.content || "")
    }))
    .sort((a, b) =>
      a.path.localeCompare(b.path)
    );

  return sha256(
    JSON.stringify(normalized)
  );
}


/* =========================================================
   FILE VALIDATION
========================================================= */

function validateProjectFiles(files) {
  if (!Array.isArray(files)) {
    throw new Error(
      "Project files must be an array"
    );
  }

  if (files.length === 0) {
    throw new Error(
      "Project contains no files"
    );
  }

  if (files.length > MAX_SOURCE_FILES) {
    throw new Error(
      `Project exceeds maximum file limit of ${MAX_SOURCE_FILES}`
    );
  }

  let totalSize = 0;

  for (const file of files) {
    const filePath = String(
      file.path || ""
    );

    const content = String(
      file.content || ""
    );

    if (!filePath) {
      throw new Error(
        "Project contains a file without a path"
      );
    }

    if (
      filePath.startsWith("/") ||
      filePath.includes("\\") ||
      filePath.includes("..")
    ) {
      throw new Error(
        `Unsafe project file path: ${filePath}`
      );
    }

    if (Buffer.byteLength(content, "utf8") >
        MAX_FILE_SIZE) {
      throw new Error(
        `File exceeds size limit: ${filePath}`
      );
    }

    totalSize += Buffer.byteLength(
      content,
      "utf8"
    );
  }

  if (
    totalSize >
    MAX_TOTAL_SOURCE_SIZE
  ) {
    throw new Error(
      `Project source exceeds ${MAX_TOTAL_SOURCE_SIZE} bytes`
    );
  }

  return {
    fileCount: files.length,
    totalSize
  };
}


/* =========================================================
   PROJECT FILE MATERIALIZATION
========================================================= */

async function materializeProject(
  project,
  workspace
) {
  for (const file of project.files || []) {
    if (file.isDeleted) {
      continue;
    }

    const relativePath = String(
      file.path || ""
    );

    if (
      !relativePath ||
      relativePath.startsWith("/") ||
      relativePath.includes("\\") ||
      relativePath.includes("..")
    ) {
      throw new Error(
        `Unsafe project file path: ${relativePath}`
      );
    }

    const destination = path.resolve(
      workspace,
      relativePath
    );

    const workspaceRoot =
      path.resolve(workspace) +
      path.sep;

    if (
      !destination.startsWith(
        workspaceRoot
      )
    ) {
      throw new Error(
        `Path escapes preview workspace: ${relativePath}`
      );
    }

    await fsp.mkdir(
      path.dirname(destination),
      {
        recursive: true
      }
    );

    await fsp.writeFile(
      destination,
      String(file.content || ""),
      "utf8"
    );
  }
}


/* =========================================================
   PACKAGE.JSON
========================================================= */

async function readPackageJson(workspace) {
  const packagePath =
    path.join(
      workspace,
      "package.json"
    );

  if (
    !fs.existsSync(packagePath)
  ) {
    throw new Error(
      "Preview requires package.json"
    );
  }

  let raw;

  try {
    raw = await fsp.readFile(
      packagePath,
      "utf8"
    );
  } catch {
    throw new Error(
      "Unable to read package.json"
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "Invalid package.json"
    );
  }
}


/* =========================================================
   PACKAGE MANAGER
========================================================= */

function detectPackageManager(
  project,
  packageJson
) {
  const settings =
    project.settings || {};

  if (
    settings.packageManager &&
    [
      "npm",
      "yarn",
      "pnpm",
      "bun"
    ].includes(
      settings.packageManager
    )
  ) {
    return settings.packageManager;
  }

  if (
    fs.existsSync(
      path.join(
        project.__previewWorkspace,
        "pnpm-lock.yaml"
      )
    )
  ) {
    return "pnpm";
  }

  if (
    fs.existsSync(
      path.join(
        project.__previewWorkspace,
        "yarn.lock"
      )
    )
  ) {
    return "yarn";
  }

  if (
    fs.existsSync(
      path.join(
        project.__previewWorkspace,
        "bun.lockb"
      )
    ) ||
    fs.existsSync(
      path.join(
        project.__previewWorkspace,
        "bun.lock"
      )
    )
  ) {
    return "bun";
  }

  return "npm";
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

  const framework =
    String(
      project.framework || ""
    ).toLowerCase();

  /*
   * Explicit preview command has highest priority.
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
   * Standard production start.
   */
  if (scripts.start) {
    return "npm run start";
  }

  /*
   * Next.js fallback.
   */
  if (
    framework === "next.js" &&
    scripts.start
  ) {
    return "npm run start";
  }

  /*
   * Vite commonly exposes preview.
   */
  if (scripts.preview) {
    return "npm run preview -- --host 0.0.0.0";
  }

  /*
   * Development fallback.
   */
  if (scripts.dev) {
    return "npm run dev -- --host 0.0.0.0";
  }

  throw new Error(
    "No supported preview start command found. Add a start, preview, or dev script."
  );
}


/* =========================================================
   DOCKER COMMAND
========================================================= */

function dockerAvailable() {
  return new Promise((resolve) => {
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

    let finished = false;

    const timer =
      setTimeout(() => {
        if (!finished) {
          finished = true;

          try {
            child.kill("SIGKILL");
          } catch {}

          resolve(false);
        }
      }, 5000);

    child.on(
      "error",
      () => {
        if (finished) return;

        finished = true;
        clearTimeout(timer);
        resolve(false);
      }
    );

    child.on(
      "close",
      (code) => {
        if (finished) return;

        finished = true;
        clearTimeout(timer);

        resolve(
          code === 0
        );
      }
    );
  });
}


/* =========================================================
   DOCKER RUNNER
========================================================= */

function spawnDocker(
  args,
  options = {}
) {
  return spawn(
    "docker",
    args,
    {
      cwd: options.cwd,
      env: {
        ...process.env,

        /*
         * Never pass production secrets to
         * generated preview applications.
         */
        AWS_ACCESS_KEY_ID: undefined,
        AWS_SECRET_ACCESS_KEY: undefined,
        AWS_SESSION_TOKEN: undefined,
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        DEEPSEEK_API_KEY: undefined,
        GEMINI_API_KEY: undefined,
        STRIPE_SECRET_KEY: undefined,
        RAZORPAY_KEY_SECRET: undefined,

        ...options.env
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
      ) <= MAX_LOG_SIZE
    ) {
      return next;
    }

    return next.slice(
      -MAX_LOG_SIZE
    );
  }

  return {
    appendStdout(chunk) {
      stdout =
        append(
          stdout,
          chunk
        );
    },

    appendStderr(chunk) {
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
   CONTAINER START
========================================================= */

async function startRuntime({
  previewId,
  workspace,
  startCommand
}) {
  const containerName =
    `zyrion-preview-${previewId
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(-50)}`;

  const dockerArgs = [
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

    "--network",
    PREVIEW_NETWORK,

    PREVIEW_IMAGE,

    "sh",
    "-lc",
    startCommand
  ];

  const child =
    spawnDocker(
      dockerArgs
    );

  const logs =
    createLogBuffer();

  let resolved = false;

  const result =
    await new Promise(
      (resolve) => {
        const startupTimer =
          setTimeout(() => {
            if (resolved) return;

            resolved = true;

            try {
              child.kill(
                "SIGTERM"
              );
            } catch {}

            resolve({
              success: false,
              timedOut: true,
              containerName,
              stdout: logs.stdout,
              stderr: logs.stderr
            });
          }, STARTUP_TIMEOUT_MS);

        child.stdout.on(
          "data",
          (chunk) => {
            logs.appendStdout(
              chunk
            );
          }
        );

        child.stderr.on(
          "data",
          (chunk) => {
            logs.appendStderr(
              chunk
            );
          }
        );

        child.on(
          "error",
          (error) => {
            if (resolved) return;

            resolved = true;
            clearTimeout(
              startupTimer
            );

            resolve({
              success: false,
              timedOut: false,
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
          (code, signal) => {
            if (resolved) return;

            /*
             * A running preview should not immediately
             * close. If it closes before health check,
             * startup failed.
             */
            resolved = true;

            clearTimeout(
              startupTimer
            );

            resolve({
              success: false,
              timedOut: false,
              containerName,
              exitCode: code,
              signal,
              stdout:
                logs.stdout,
              stderr:
                logs.stderr
            });
          }
        );

        /*
         * Give Docker enough time to create the
         * container before resolving startup phase.
         */
        setTimeout(() => {
          if (resolved) return;

          resolve({
            success: true,
            timedOut: false,
            containerName,
            process: child,
            logs
          });
        }, 1500);
      }
    );

  return result;
}


/* =========================================================
   DOCKER PORT
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
          if (code !== 0) {
            return reject(
              new Error(
                stderr ||
                "Unable to resolve preview port"
              )
            );
          }

          /*
           * Example:
           *
           * 127.0.0.1:49152
           */
          const match =
            stdout.match(
              /:(\d+)/
            );

          if (!match) {
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

  let attempts = 0;
  let lastError = null;

  while (
    Date.now() <
    deadline
  ) {
    attempts += 1;

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

      const responseTimeMs =
        Date.now() -
        startedAt;

      if (
        response.status >= 200 &&
        response.status < 500
      ) {
        return {
          healthy: true,
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
    healthy: false,
    status: null,
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
  if (!containerName) {
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
            stdio: "ignore"
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
  } catch {}
}


/* =========================================================
   SOURCE SNAPSHOT
========================================================= */

function buildSourceSnapshot(
  project
) {
  const files =
    (project.files || [])
      .filter(
        (file) =>
          !file.isDeleted
      )
      .map(
        (file) => ({
          path:
            String(
              file.path || ""
            ),
          content:
            String(
              file.content || ""
            )
        })
      );

  return files;
}


/* =========================================================
   PREVIEW URL
========================================================= */

function createPreviewUrl(
  previewId,
  mappedPort
) {
  /*
   * Recommended production mode:
   *
   * PREVIEW_BASE_URL=https://preview.zyrionos.com
   *
   * Then an external reverse proxy should route:
   *
   * /preview/:previewId
   *
   * to the isolated runtime.
   */

  if (PREVIEW_BASE_URL) {
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
   AUTHORITATIVE BUILD GATE
========================================================= */

async function runAuthoritativeBuild(
  project,
  buildId
) {
  /*
   * First check that the build exists.
   */
  const build =
    await ProjectBuild.findOne({
      projectId:
        project._id,
      buildId
    });

  if (!build) {
    throw new Error(
      "Authoritative build not found"
    );
  }

  if (
    build.status !== "success"
  ) {
    throw new Error(
      `Preview requires a successful authoritative build. Current status: ${build.status}`
    );
  }

  return build;
}


/* =========================================================
   CREATE PREVIEW
========================================================= */

async function createPreview({
  projectId,
  userId,
  buildId = "",
  trigger = "manual",
  ttlMs = DEFAULT_TTL_MS,
  workspaceSessionId = "",
  aiGenerated = false,
  aiModel = "",
  promptId = ""
}) {
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

  const project =
    await Project.findOne({
      _id: projectId,
      userId
    });

  if (!project) {
    throw new Error(
      "Project not found"
    );
  }

  if (
    project.isArchived
  ) {
    throw new Error(
      "Cannot create preview for archived project"
    );
  }

  if (
    project.settings &&
    project.settings.previewEnabled === false
  ) {
    throw new Error(
      "Preview is disabled for this project"
    );
  }


  /* -------------------------------------------------------
     Validate source
  ------------------------------------------------------- */

  const files =
    buildSourceSnapshot(
      project
    );

  validateProjectFiles(
    files
  );

  const sourceHash =
    calculateSourceHash(
      files
    );


  /* -------------------------------------------------------
     Static validation
  ------------------------------------------------------- */

  const validation =
    await Promise.resolve(
      buildValidationService.validateProject(
        {
          projectId:
            project._id,
          userId,
          projectName:
            project.projectName,
          framework:
            project.framework,
          files
        }
      )
    );

  if (
    !validation ||
    validation.success !== true
  ) {
    const message =
      validation &&
      validation.errors &&
      validation.errors.length
        ? validation.errors
            .map(
              (error) =>
                error.message ||
                String(error)
            )
            .join("; ")
        : "Static validation failed";

    throw new Error(
      message
    );
  }


  /* -------------------------------------------------------
     Authoritative build
  ------------------------------------------------------- */

  let authoritativeBuild;

  if (buildId) {
    authoritativeBuild =
      await runAuthoritativeBuild(
        project,
        buildId
      );
  } else {
    /*
     * No existing successful build supplied.
     *
     * Run the authoritative build against the
     * current project source.
     */
    const result =
      await authoritativeBuildService.buildProject(
        {
          projectId:
            project._id,
          userId,
          projectName:
            project.projectName,
          framework:
            project.framework,
          files,
          settings:
            project.settings || {},
          nodeVersion:
            project.settings &&
            project.settings.nodeVersion
        }
      );

    if (
      !result ||
      result.success !== true ||
      result.authoritative !== true
    ) {
      const error =
        new Error(
          result &&
          result.summary
            ? result.summary
            : "Authoritative build failed"
        );

      error.code =
        "PREVIEW_BUILD_FAILED";

      error.buildResult =
        result;

      throw error;
    }

    /*
     * The authoritative build service owns its own
     * build identity. Preview stores that identity.
     */
    authoritativeBuild = {
      buildId:
        result.buildId,
      buildNumber:
        null,
      status:
        "success"
    };
  }


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
     Persist queued preview
  ------------------------------------------------------- */

  const preview =
    new ProjectPreview({
      projectId:
        project._id,

      userId,

      previewId,

      previewNumber,

      buildId:
        authoritativeBuild.buildId ||
        "",

      buildNumber:
        authoritativeBuild.buildNumber ||
        null,

      sourceVersionId:
        authoritativeBuild.sourceVersionId ||
        null,

      sourceHash,

      framework:
        project.framework,

      runtime:
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
        "restricted"
    });

  await preview.save();


  /* -------------------------------------------------------
     Runtime workspace
  ------------------------------------------------------- */

  let workspace = null;
  let containerName = "";

  try {
    await updatePreviewStatus(
      preview,
      "building"
    );

    preview.buildStartedAt =
      new Date();

    await preview.save();


    /*
     * Docker availability.
     */
    const dockerReady =
      await dockerAvailable();

    if (!dockerReady) {
      throw createPreviewError(
        "PREVIEW_DOCKER_UNAVAILABLE",
        "Docker runtime is unavailable",
        "runtime",
        "unknown",
        false
      );
    }


    /*
     * Workspace.
     */
    workspace =
      await createWorkspace();

    await materializeProject(
      project,
      workspace
    );


    /*
     * Read package configuration.
     */
    const packageJson =
      await readPackageJson(
        workspace
      );

    /*
     * Temporary compatibility field used only
     * during package manager detection.
     */
    project.__previewWorkspace =
      workspace;

    const packageManager =
      detectPackageManager(
        project,
        packageJson
      );

    delete project.__previewWorkspace;


    /*
     * Preview currently expects a runtime start
     * command.
     */
    const startCommand =
      resolveStartCommand(
        project,
        packageJson
      );


    preview.runtimeInfo = {
      status:
        "starting",

      runtime:
        project.framework,

      nodeVersion:
        project.settings &&
        project.settings.nodeVersion
          ? project.settings.nodeVersion
          : "20",

      packageManager,

      command:
        startCommand,

      workingDirectory:
        "/workspace",

      cpuLimit:
        PREVIEW_CPU_LIMIT,

      memoryLimit:
        PREVIEW_MEMORY_LIMIT
    };

    preview.buildCompletedAt =
      new Date();

    await preview.save();


    /* -----------------------------------------------------
       Start isolated runtime
    ----------------------------------------------------- */

    await updatePreviewStatus(
      preview,
      "starting"
    );

    preview.startedAt =
      new Date();

    await preview.save();

    const runtime =
      await startRuntime({
        previewId,
        workspace,
        startCommand
      });

    if (!runtime.success) {
      const error =
        createPreviewError(
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

      error.stdout =
        runtime.stdout || "";

      error.stderr =
        runtime.stderr || "";

      throw error;
    }

    containerName =
      runtime.containerName;

    preview.runtimeInfo.containerId =
      containerName;

    preview.runtimeInfo.status =
      "running";

    await preview.save();


    /* -----------------------------------------------------
       Resolve host port
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
       Health check
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
                .includes("timeout")
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


    if (!health.healthy) {
      throw createPreviewError(
        "PREVIEW_HEALTHCHECK_FAILED",
        health.error ||
          "Preview failed health check",
        "healthcheck",
        health.error &&
        health.error
          .toLowerCase()
          .includes("timeout")
          ? "timeout"
          : "healthcheck",
        true
      );
    }


    /* -----------------------------------------------------
       Preview ready
    ----------------------------------------------------- */

    const publicUrl =
      createPreviewUrl(
        previewId,
        mappedPort
      );

    preview.url =
      publicUrl;

    preview.publicUrl =
      publicUrl;

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
        workspace,
        expiresAt:
          expiresAt.getTime()
      }
    );


    /*
     * Cleanup is intentionally scheduled independently
     * from the HTTP request lifecycle.
     */
    scheduleExpiration(
      previewId,
      normalizedTtl
    );


    return serializePreview(
      preview
    );

  } catch (error) {

    /*
     * Persist structured failure.
     */
    const previewError =
      normalizePreviewError(
        error
      );

    preview.errors.push(
      previewError
    );

    preview.errorMessage =
      previewError.message;

    preview.failureCategory =
      previewError.category ||
      "unknown";

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


    /*
     * Stop runtime if it started.
     */
    if (containerName) {
      await stopContainer(
        containerName
      );
    }

    activeRuntimes.delete(
      previewId
    );

    await cleanupWorkspace(
      workspace
    );

    throw error;

  } finally {

    /*
     * IMPORTANT:
     *
     * Do not delete the workspace while a runtime
     * is still running.
     *
     * The workspace remains mounted until preview
     * expiration/stop.
     */
    if (
      workspace &&
      !activeRuntimes.has(
        previewId
      )
    ) {
      await cleanupWorkspace(
        workspace
      );
    }
  }
}


/* =========================================================
   NEXT PREVIEW NUMBER
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
        previewNumber: -1
      })
      .select({
        previewNumber: 1
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
   STATUS UPDATE
========================================================= */

async function updatePreviewStatus(
  preview,
  status
) {
  preview.status =
    status;

  if (
    status === "stopped" &&
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
    ].includes(status) &&
    !preview.completedAt
  ) {
    preview.completedAt =
      new Date();
  }

  await preview.save();

  return preview;
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

  if (!preview) {
    throw new Error(
      "Preview not found"
    );
  }

  const runtime =
    activeRuntimes.get(
      previewId
    );

  const containerName =
    runtime &&
    runtime.containerName
      ? runtime.containerName
      : preview.runtimeInfo &&
        preview.runtimeInfo.containerId;

  if (containerName) {
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
    runtime &&
    runtime.workspace
  ) {
    await cleanupWorkspace(
      runtime.workspace
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

  if (!preview) {
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
    runtime &&
    runtime.containerName
      ? runtime.containerName
      : preview.runtimeInfo &&
        preview.runtimeInfo.containerId;

  if (containerName) {
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
    runtime &&
    runtime.workspace
  ) {
    await cleanupWorkspace(
      runtime.workspace
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
  ).unref();
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

  if (!preview) {
    throw new Error(
      "Preview not found"
    );
  }

  return serializePreview(
    preview
  );
}


/* =========================================================
   LIST PROJECT PREVIEWS
========================================================= */

async function listPreviews({
  projectId,
  userId,
  limit = 20,
  skip = 0
}) {
  const safeLimit =
    clamp(
      Number(limit) || 20,
      1,
      100
    );

  const safeSkip =
    Math.max(
      Number(skip) || 0,
      0
    );

  const previews =
    await ProjectPreview
      .find({
        projectId,
        userId
      })
      .sort({
        createdAt: -1
      })
      .skip(safeSkip)
      .limit(safeLimit)
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
      Number(limit) || 50,
      1,
      200
    );

  const now =
    new Date();

  const previews =
    await ProjectPreview
      .find({
        expiresAt: {
          $lte: now
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
        expiresAt: 1
      })
      .limit(safeLimit);

  const results = [];

  for (
    const preview of previews
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
   ERROR HELPERS
========================================================= */

function createPreviewError(
  code,
  message,
  stage,
  category,
  retryable
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
      FAILURE_CATEGORIES.includes(
        error.category || ""
      )
        ? error.category
        : "unknown",

    retryable:
      Boolean(
        error.retryable
      ),

    timestamp:
      new Date()
  };
}


/* =========================================================
   SERIALIZATION
   =========================================================
   Never expose internal runtime details to frontend.
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

  /*
   * Internal runtime fields must never leave
   * the backend API.
   */
  if (data.runtimeInfo) {
    delete data.runtimeInfo.containerId;
    delete data.runtimeInfo.workerId;
    delete data.runtimeInfo.workingDirectory;
    delete data.runtimeInfo.hostPort;
    delete data.runtimeInfo.internalPort;
  }

  /*
   * Internal security state is backend-only.
   */
  delete data.secretsInjected;
  delete data.productionSecretsBlocked;

  return data;
}


/* =========================================================
   HEALTH / RUNTIME STATUS
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
    throw new Error(
      "Preview not found"
    );
  }

  if (
    preview.status !== "ready"
  ) {
    return serializePreview(
      preview
    );
  }

  const runtime =
    activeRuntimes.get(
      previewId
    );

  if (!runtime) {
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
    preview.runtimeInfo &&
    preview.runtimeInfo.hostPort;

  if (!mappedPort) {
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

  if (!result.healthy) {
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

  calculateSourceHash,

  validateProjectFiles
};
