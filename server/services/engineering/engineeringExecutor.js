"use strict";

/*
 * ============================================================
 * ZYRION OS — ENGINEERING EXECUTOR
 * ============================================================
 *
 * Enterprise Autonomous Engineering Control Plane
 * Execution Layer
 *
 * FILE:
 *   services/engineering/engineeringExecutor.js
 *
 * RESPONSIBILITIES
 * ------------------------------------------------------------
 *   - Build execution
 *   - Dependency installation
 *   - Process execution
 *   - Runtime execution
 *   - Preview execution
 *   - Test execution
 *   - Docker/container execution
 *   - Timeout handling
 *   - CPU / memory / PID limits
 *   - Network policy
 *   - Filesystem isolation
 *   - Process termination
 *   - stdout / stderr capture
 *   - exit-code handling
 *   - artifact creation
 *   - artifact verification
 *   - resource measurements
 *
 * IMPORTANT
 * ------------------------------------------------------------
 * This file performs REAL execution.
 *
 * It never declares success merely because:
 *   - a command was launched
 *   - an AI said it worked
 *   - static validation passed
 *
 * Execution success requires actual execution evidence.
 *
 * Existing AuthoritativeBuildService is supported as a
 * compatibility adapter during migration.
 *
 * ============================================================
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {
  spawn,
  execFile
} = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

/* ============================================================
   OPTIONAL EXISTING STATE LAYER
============================================================ */

let engineeringState = null;

try {
  engineeringState = require("./engineeringState");
} catch (error) {
  /*
   * Executor remains loadable during staged deployment.
   * Actual engineering orchestration should provide state
   * integration through the exported hooks below.
   */
  engineeringState = null;
}

/* ============================================================
   OPTIONAL LEGACY AUTHORITATIVE BUILD ADAPTER
============================================================ */

let authoritativeBuildService = null;

try {
  authoritativeBuildService = require("../authoritativeBuildService");
} catch (error) {
  authoritativeBuildService = null;
}

/* ============================================================
   VERSION
============================================================ */

const SERVICE_VERSION = "1.0.0";

const EXECUTION_MODE = "engineering-control-plane";

const AUTHORITATIVE = true;

/* ============================================================
   DEFAULT LIMITS
============================================================ */

const DEFAULT_LIMITS = Object.freeze({
  timeoutMs: 15 * 60 * 1000,

  installTimeoutMs: 10 * 60 * 1000,

  runtimeTimeoutMs: 5 * 60 * 1000,

  testTimeoutMs: 10 * 60 * 1000,

  previewTimeoutMs: 5 * 60 * 1000,

  cpuCores: 2,

  memoryMB: 2048,

  pids: 256,

  diskMB: 10240,

  maxOutputBytes: 5 * 1024 * 1024,

  maxErrorBytes: 20 * 1024,

  maxArtifactBytes: 500 * 1024 * 1024,

  gracePeriodMs: 5000,

  maxProcesses: 256
});

/* ============================================================
   NETWORK POLICY
============================================================ */

const NETWORK_POLICIES = Object.freeze({
  NONE: "none",
  BRIDGE: "bridge",
  HOST: "host"
});

/*
 * HOST networking is intentionally not enabled by default.
 * It should only be explicitly selected by a trusted
 * orchestration policy.
 */
const DEFAULT_NETWORK_POLICY = NETWORK_POLICIES.NONE;

/* ============================================================
   FILESYSTEM POLICY
============================================================ */

const FILESYSTEM_POLICY = Object.freeze({
  WORKSPACE: "/workspace",
  TMP: "/tmp",
  NODE_HOME: "/home/node",
  ARTIFACT: "/workspace/.zyrionos/artifacts"
});

/* ============================================================
   EXECUTION TYPES
============================================================ */

const EXECUTION_TYPES = Object.freeze({
  PROCESS: "process",
  INSTALL: "install",
  BUILD: "build",
  TEST: "test",
  RUNTIME: "runtime",
  PREVIEW: "preview",
  ARTIFACT: "artifact"
});

/* ============================================================
   TERMINAL STATES
============================================================ */

const TERMINAL_PROCESS_STATES = new Set([
  "success",
  "failed",
  "timeout",
  "cancelled"
]);

/* ============================================================
   COMMAND SAFETY
============================================================ */

/*
 * These patterns are rejected as build commands.
 *
 * A build executor must never silently convert a development
 * server into a production build.
 */
const FORBIDDEN_BUILD_PATTERNS = [
  /\bnpm\s+start\b/i,
  /\bnpm\s+run\s+dev\b/i,
  /\bnpm\s+run\s+serve\b/i,
  /\byarn\s+start\b/i,
  /\byarn\s+dev\b/i,
  /\bpnpm\s+start\b/i,
  /\bpnpm\s+dev\b/i,

  /\bnext\s+dev\b/i,
  /\bvite\s+preview\b/i,
  /^\s*vite\s*$/i,
  /\bvite\s+--host\b/i,

  /\bwebpack\s+serve\b/i,
  /\bwebpack-dev-server\b/i,

  /\breact-scripts\s+start\b/i,
  /\bvue-cli-service\s+serve\b/i,

  /\bng\s+serve\b/i,
  /\bng\s+start\b/i,

  /\bnodemon\b/i,
  /\bts-node-dev\b/i,
  /\btsx\s+watch\b/i,
  /\btsc\s+--watch\b/i,

  /\bpython(?:3)?\s+-m\s+http\.server\b/i,
  /\bserve\s+-s\b/i
];

/*
 * Shell commands that can terminate or escape the intended
 * execution boundary.
 *
 * This is deliberately conservative.
 */
const FORBIDDEN_CONTROL_PATTERNS = [
  /(^|[;&|])\s*rm\s+-rf\s+\/\s*($|[;&|])/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bmount\b/i,
  /\bumount\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\biptables\b/i,
  /\bnft\b/i,
  /\bchown\s+-R\s+\/\s*/i,
  /\bchmod\s+-R\s+777\s+\/\s*/i
];

/* ============================================================
   GENERIC HELPERS
============================================================ */

function normalizeString(value, maxLength = 4000) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).slice(0, maxLength);
}

function clampNumber(
  value,
  minimum,
  maximum,
  fallback
) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(minimum, numeric)
  );
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(8)
    .toString("hex")}`;
}

function now() {
  return new Date();
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

/* ============================================================
   SECRET REDACTION
============================================================ */

const SECRET_PATTERNS = [
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /authorization\s*[:=]\s*[^\s]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s]+/gi,
  /secret\s*[:=]\s*[^\s]+/gi,
  /password\s*[:=]\s*[^\s]+/gi,
  /token\s*[:=]\s*[^\s]+/gi,
  /access[_-]?token\s*[:=]\s*[^\s]+/gi,
  /refresh[_-]?token\s*[:=]\s*[^\s]+/gi
];

function redactSecrets(value) {
  let output = normalizeString(value, 20000);

  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(
      pattern,
      "[REDACTED]"
    );
  }

  return output;
}

/* ============================================================
   RESOURCE LIMIT NORMALIZATION
============================================================ */

function normalizeLimits(input = {}) {
  const requested =
    input && typeof input === "object"
      ? input
      : {};

  return {
    timeoutMs: clampNumber(
      requested.timeoutMs,
      1000,
      DEFAULT_LIMITS.timeoutMs,
      DEFAULT_LIMITS.timeoutMs
    ),

    installTimeoutMs: clampNumber(
      requested.installTimeoutMs,
      1000,
      DEFAULT_LIMITS.installTimeoutMs,
      DEFAULT_LIMITS.installTimeoutMs
    ),

    runtimeTimeoutMs: clampNumber(
      requested.runtimeTimeoutMs,
      1000,
      DEFAULT_LIMITS.runtimeTimeoutMs,
      DEFAULT_LIMITS.runtimeTimeoutMs
    ),

    testTimeoutMs: clampNumber(
      requested.testTimeoutMs,
      1000,
      DEFAULT_LIMITS.testTimeoutMs,
      DEFAULT_LIMITS.testTimeoutMs
    ),

    previewTimeoutMs: clampNumber(
      requested.previewTimeoutMs,
      1000,
      DEFAULT_LIMITS.previewTimeoutMs,
      DEFAULT_LIMITS.previewTimeoutMs
    ),

    cpuCores: clampNumber(
      requested.cpuCores,
      0.25,
      DEFAULT_LIMITS.cpuCores,
      DEFAULT_LIMITS.cpuCores
    ),

    memoryMB: clampNumber(
      requested.memoryMB,
      128,
      DEFAULT_LIMITS.memoryMB,
      DEFAULT_LIMITS.memoryMB
    ),

    pids: clampNumber(
      requested.pids,
      32,
      DEFAULT_LIMITS.pids,
      DEFAULT_LIMITS.pids
    ),

    diskMB: clampNumber(
      requested.diskMB,
      256,
      DEFAULT_LIMITS.diskMB,
      DEFAULT_LIMITS.diskMB
    ),

    maxOutputBytes: clampNumber(
      requested.maxOutputBytes,
      64 * 1024,
      DEFAULT_LIMITS.maxOutputBytes,
      DEFAULT_LIMITS.maxOutputBytes
    ),

    maxErrorBytes: clampNumber(
      requested.maxErrorBytes,
      4096,
      DEFAULT_LIMITS.maxErrorBytes,
      DEFAULT_LIMITS.maxErrorBytes
    ),

    maxArtifactBytes: clampNumber(
      requested.maxArtifactBytes,
      1024 * 1024,
      DEFAULT_LIMITS.maxArtifactBytes,
      DEFAULT_LIMITS.maxArtifactBytes
    ),

    gracePeriodMs: clampNumber(
      requested.gracePeriodMs,
      250,
      DEFAULT_LIMITS.gracePeriodMs,
      DEFAULT_LIMITS.gracePeriodMs
    )
  };
}

/* ============================================================
   NETWORK POLICY
============================================================ */

function normalizeNetworkPolicy(
  policy = DEFAULT_NETWORK_POLICY
) {
  const normalized =
    normalizeString(policy, 50)
      .trim()
      .toLowerCase();

  if (
    !Object.values(NETWORK_POLICIES).includes(
      normalized
    )
  ) {
    return DEFAULT_NETWORK_POLICY;
  }

  return normalized;
}

/* ============================================================
   COMMAND VALIDATION
============================================================ */

function validateCommand(
  command,
  {
    type = EXECUTION_TYPES.PROCESS,
    allowDevelopmentProcess = false
  } = {}
) {
  const normalized =
    normalizeString(command, 4000).trim();

  if (!normalized) {
    throw new Error(
      "Execution command is required"
    );
  }

  for (
    const pattern of FORBIDDEN_CONTROL_PATTERNS
  ) {
    if (pattern.test(normalized)) {
      throw new Error(
        "Command rejected by execution safety policy"
      );
    }
  }

  if (
    type === EXECUTION_TYPES.BUILD &&
    !allowDevelopmentProcess
  ) {
    for (
      const pattern of FORBIDDEN_BUILD_PATTERNS
    ) {
      if (pattern.test(normalized)) {
        throw new Error(
          `Invalid production build command: ${normalized}`
        );
      }
    }
  }

  return normalized;
}

/* ============================================================
   WORKSPACE PATH SAFETY
============================================================ */

function normalizeWorkspacePath(
  workspacePath
) {
  if (!workspacePath) {
    throw new Error(
      "workspacePath is required"
    );
  }

  const resolved =
    path.resolve(workspacePath);

  return resolved;
}

function assertPathInside(
  targetPath,
  rootPath
) {
  const target =
    path.resolve(targetPath);

  const root =
    path.resolve(rootPath);

  const relative =
    path.relative(root, target);

  if (
    relative === "" ||
    (
      relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    )
  ) {
    return target;
  }

  throw new Error(
    `Path escapes workspace: ${targetPath}`
  );
}

/* ============================================================
   WORKSPACE PREPARATION
============================================================ */

async function ensureDirectory(
  directory
) {
  await fsp.mkdir(
    directory,
    {
      recursive: true
    }
  );

  return directory;
}

async function ensureWorkspace(
  workspacePath
) {
  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

  await ensureDirectory(
    workspace
  );

  const metadataDirectory =
    path.join(
      workspace,
      ".zyrionos"
    );

  const artifactDirectory =
    path.join(
      metadataDirectory,
      "artifacts"
    );

  await ensureDirectory(
    metadataDirectory
  );

  await ensureDirectory(
    artifactDirectory
  );

  return {
    workspace,
    metadataDirectory,
    artifactDirectory
  };
}

/* ============================================================
   FILESYSTEM ISOLATION
============================================================ */

async function prepareFilesystemIsolation(
  workspacePath
) {
  const {
    workspace,
    artifactDirectory
  } = await ensureWorkspace(
    workspacePath
  );

  /*
   * All internally-created execution paths are validated
   * against the workspace root.
   */
  assertPathInside(
    artifactDirectory,
    workspace
  );

  return {
    workspace,
    artifactDirectory,
    policy: {
      writableRoot: workspace,
      artifactRoot: artifactDirectory,
      generatedOutsideWorkspace: false
    }
  };
}

/* ============================================================
   OUTPUT COLLECTOR
============================================================ */

function createOutputCollector(
  maxBytes
) {
  let stdout = "";
  let stderr = "";

  let stdoutBytes = 0;
  let stderrBytes = 0;

  let stdoutTruncated = false;
  let stderrTruncated = false;

  function appendStdout(chunk) {
    const text =
      Buffer.isBuffer(chunk)
        ? chunk.toString("utf8")
        : String(chunk);

    const remaining =
      maxBytes - stdoutBytes;

    if (remaining <= 0) {
      stdoutTruncated = true;
      return;
    }

    const buffer =
      Buffer.from(text, "utf8");

    if (buffer.length <= remaining) {
      stdout += text;
      stdoutBytes += buffer.length;
      return;
    }

    stdout += buffer
      .subarray(0, remaining)
      .toString("utf8");

    stdoutBytes = maxBytes;
    stdoutTruncated = true;
  }

  function appendStderr(chunk) {
    const text =
      Buffer.isBuffer(chunk)
        ? chunk.toString("utf8")
        : String(chunk);

    const remaining =
      maxBytes - stderrBytes;

    if (remaining <= 0) {
      stderrTruncated = true;
      return;
    }

    const buffer =
      Buffer.from(text, "utf8");

    if (buffer.length <= remaining) {
      stderr += text;
      stderrBytes += buffer.length;
      return;
    }

    stderr += buffer
      .subarray(0, remaining)
      .toString("utf8");

    stderrBytes = maxBytes;
    stderrTruncated = true;
  }

  return {
    appendStdout,
    appendStderr,

    getResult() {
      return {
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
        stdoutBytes,
        stderrBytes,
        stdoutTruncated,
        stderrTruncated
      };
    }
  };
}

/* ============================================================
   PROCESS TREE TERMINATION
============================================================ */

function terminateProcessTree(
  child,
  gracePeriodMs
) {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve({
        terminated: true,
        signal: null
      });
      return;
    }

    let finished = false;

    const finish = (
      signal = "SIGTERM"
    ) => {
      if (finished) {
        return;
      }

      finished = true;

      resolve({
        terminated: true,
        signal
      });
    };

    try {
      /*
       * Negative PID targets the process group on Unix.
       * The spawned child is created detached so its process
       * group can be terminated together.
       */
      if (
        process.platform !== "win32" &&
        child.pid
      ) {
        try {
          process.kill(
            -child.pid,
            "SIGTERM"
          );
        } catch (error) {
          try {
            child.kill("SIGTERM");
          } catch (killError) {
            // Process may already have exited.
          }
        }
      } else {
        child.kill("SIGTERM");
      }
    } catch (error) {
      try {
        child.kill("SIGTERM");
      } catch (killError) {
        // Already terminated.
      }
    }

    setTimeout(() => {
      if (finished) {
        return;
      }

      try {
        if (
          process.platform !== "win32" &&
          child.pid
        ) {
          try {
            process.kill(
              -child.pid,
              "SIGKILL"
            );
          } catch (error) {
            try {
              child.kill("SIGKILL");
            } catch (killError) {
              // Already exited.
            }
          }
        } else {
          child.kill("SIGKILL");
        }
      } catch (error) {
        // Already exited.
      }

      finish("SIGKILL");
    }, gracePeriodMs);
  });
}

/* ============================================================
   RESOURCE MEASUREMENT
============================================================ */

async function readProcessResourceSnapshot(
  pid
) {
  if (
    !pid ||
    process.platform === "win32"
  ) {
    return {
      supported: false
    };
  }

  try {
    const { stdout } =
      await execFileAsync(
        "ps",
        [
          "-o",
          "pid=,ppid=,%cpu=,rss=,etime=",
          "-p",
          String(pid)
        ],
        {
          timeout: 2000,
          windowsHide: true
        }
      );

    const line =
      String(stdout)
        .trim()
        .split("\n")[0];

    if (!line) {
      return {
        supported: true,
        processExists: false
      };
    }

    const match =
      line.trim().match(
        /^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/
      );

    if (!match) {
      return {
        supported: true,
        processExists: true
      };
    }

    return {
      supported: true,
      processExists: true,
      pid: Number(match[1]),
      ppid: Number(match[2]),
      cpuPercent: Number(match[3]),
      memoryKB: Number(match[4]),
      elapsed: match[5]
    };
  } catch (error) {
    return {
      supported: false,
      error: normalizeString(
        error.message,
        500
      )
    };
  }
}

/* ============================================================
   GENERIC PROCESS EXECUTION
============================================================ */

async function executeProcess({
  command,
  cwd,
  env = {},
  type = EXECUTION_TYPES.PROCESS,
  timeoutMs = DEFAULT_LIMITS.timeoutMs,
  maxOutputBytes =
    DEFAULT_LIMITS.maxOutputBytes,
  gracePeriodMs =
    DEFAULT_LIMITS.gracePeriodMs,
  allowDevelopmentProcess = false
}) {
  const safeCommand =
    validateCommand(
      command,
      {
        type,
        allowDevelopmentProcess
      }
    );

  const workingDirectory =
    normalizeWorkspacePath(cwd);

  const output =
    createOutputCollector(
      maxOutputBytes
    );

  const startedAt = now();

  return new Promise(
    (resolve, reject) => {
      let timedOut = false;
      let cancelled = false;
      let settled = false;

      let resourceTimer = null;

      const child =
        spawn(
          "sh",
          [
            "-lc",
            safeCommand
          ],
          {
            cwd: workingDirectory,

            env: {
              ...process.env,
              ...env
            },

            detached:
              process.platform !== "win32",

            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ],

            windowsHide: true
          }
        );

      const resourceSamples = [];

      const collectResources =
        async () => {
          if (!child.pid) {
            return;
          }

          const snapshot =
            await readProcessResourceSnapshot(
              child.pid
            );

          resourceSamples.push(
            snapshot
          );
        };

      resourceTimer =
        setInterval(
          collectResources,
          1000
        );

      child.stdout.on(
        "data",
        (chunk) => {
          output.appendStdout(
            chunk
          );
        }
      );

      child.stderr.on(
        "data",
        (chunk) => {
          output.appendStderr(
            chunk
          );
        }
      );

      const timeoutTimer =
        setTimeout(
          async () => {
            if (settled) {
              return;
            }

            timedOut = true;

            await terminateProcessTree(
              child,
              gracePeriodMs
            );
          },
          timeoutMs
        );

      const finalize = (
        result
      ) => {
        if (settled) {
          return;
        }

        settled = true;

        clearTimeout(
          timeoutTimer
        );

        if (resourceTimer) {
          clearInterval(
            resourceTimer
          );
        }

        const completedAt = now();

        const durationMs =
          completedAt.getTime() -
          startedAt.getTime();

        const collected =
          output.getResult();

        const success =
          !timedOut &&
          !cancelled &&
          result.error === null &&
          result.exitCode === 0;

        const status =
          timedOut
            ? "timeout"
            : cancelled
              ? "cancelled"
              : success
                ? "success"
                : "failed";

        resolve({
          executionId:
            createId("exec"),

          type,

          command: safeCommand,

          cwd: workingDirectory,

          status,

          success,

          authoritative: true,

          pid: child.pid || null,

          exitCode:
            typeof result.exitCode ===
            "number"
              ? result.exitCode
              : null,

          signal:
            result.signal ||
            "",

          timedOut,

          cancelled,

          startedAt,

          completedAt,

          durationMs,

          stdout:
            collected.stdout,

          stderr:
            collected.stderr,

          stdoutBytes:
            collected.stdoutBytes,

          stderrBytes:
            collected.stderrBytes,

          stdoutTruncated:
            collected.stdoutTruncated,

          stderrTruncated:
            collected.stderrTruncated,

          resourceSamples,

          finalResourceSnapshot:
            resourceSamples.length
              ? resourceSamples[
                  resourceSamples.length - 1
                ]
              : null,

          evidence: {
            processStarted: true,
            processExited:
              result.exitCode !== null ||
              Boolean(result.signal),
            exitCode:
              result.exitCode,
            signal:
              result.signal || "",
            timeout:
              timedOut,
            cancelled
          }
        });
      };

      child.on(
        "error",
        (error) => {
          finalize({
            error,
            exitCode: null,
            signal: null
          });
        }
      );

      child.on(
        "close",
        (exitCode, signal) => {
          finalize({
            error: null,
            exitCode,
            signal
          });
        }
      );
    }
  );
}

/* ============================================================
   DOCKER AVAILABILITY
============================================================ */

async function assertDockerAvailable() {
  try {
    await execFileAsync(
      "docker",
      [
        "version",
        "--format",
        "{{.Server.Version}}"
      ],
      {
        timeout: 5000,
        windowsHide: true
      }
    );

    return true;
  } catch (error) {
    throw new Error(
      `Docker is unavailable: ${normalizeString(
        error.message,
        1000
      )}`
    );
  }
}

/* ============================================================
   DOCKER IMAGE RESOLUTION
============================================================ */

function resolveNodeImage(
  nodeVersion = "20"
) {
  const normalized =
    normalizeString(
      nodeVersion,
      50
    ).trim();

  /*
   * Only known major versions are accepted.
   * This prevents arbitrary image injection.
   */
  const allowed =
    new Set([
      "18",
      "20",
      "22"
    ]);

  const major =
    normalized.match(
      /^\d+/
    )?.[0] || "20";

  if (!allowed.has(major)) {
    throw new Error(
      `Unsupported Node runtime: ${nodeVersion}`
    );
  }

  return `node:${major}-bookworm-slim`;
}

/* ============================================================
   DOCKER ARGUMENT BUILDER
============================================================ */

function buildDockerArguments({
  workspacePath,
  command,
  nodeVersion = "20",
  networkPolicy =
    DEFAULT_NETWORK_POLICY,
  limits,
  readOnlyRootFilesystem = true,
  user = "node",
  containerName = null
}) {
  const image =
    resolveNodeImage(
      nodeVersion
    );

  const safeCommand =
    validateCommand(
      command,
      {
        type: EXECUTION_TYPES.PROCESS
      }
    );

  const network =
    normalizeNetworkPolicy(
      networkPolicy
    );

  const args = [
    "run",
    "--rm"
  ];

  if (containerName) {
    args.push(
      "--name",
      containerName
    );
  }

  args.push(
    "--cpus",
    String(limits.cpuCores)
  );

  args.push(
    "--memory",
    `${limits.memoryMB}m`
  );

  args.push(
    "--pids-limit",
    String(limits.pids)
  );

  args.push(
    "--cap-drop",
    "ALL"
  );

  args.push(
    "--security-opt",
    "no-new-privileges"
  );

  if (readOnlyRootFilesystem) {
    args.push(
      "--read-only"
    );
  }

  args.push(
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=512m"
  );

  args.push(
    "--tmpfs",
    "/home/node:rw,nosuid,nodev,size=512m"
  );

  /*
   * Workspace is the only writable project mount.
   */
  args.push(
    "-v",
    `${workspacePath}:/workspace:rw`
  );

  args.push(
    "-w",
    "/workspace"
  );

  /*
   * Never use host root.
   */
  if (user) {
    args.push(
      "--user",
      user
    );
  }

  /*
   * Network policy.
   */
  args.push(
    "--network",
    network
  );

  args.push(
    image,
    "sh",
    "-lc",
    safeCommand
  );

  return {
    args,
    image,
    network,
    command: safeCommand
  };
}

/* ============================================================
   DOCKER EXECUTION
============================================================ */

async function executeDocker({
  workspacePath,
  command,
  nodeVersion = "20",
  networkPolicy =
    DEFAULT_NETWORK_POLICY,
  limits = DEFAULT_LIMITS,
  type = EXECUTION_TYPES.PROCESS,
  environment = {},
  user = "node"
}) {
  await assertDockerAvailable();

  const safeWorkspace =
    normalizeWorkspacePath(
      workspacePath
    );

  const normalizedLimits =
    normalizeLimits(
      limits
    );

  const containerName =
    `zyrionos-eng-${crypto
      .randomBytes(8)
      .toString("hex")}`;

  const docker =
    buildDockerArguments({
      workspacePath:
        safeWorkspace,
      command,
      nodeVersion,
      networkPolicy,
      limits:
        normalizedLimits,
      user,
      containerName
    });

  const output =
    createOutputCollector(
      normalizedLimits.maxOutputBytes
    );

  const startedAt = now();

  let timedOut = false;
  let settled = false;

  const child =
    spawn(
      "docker",
      docker.args,
      {
        cwd:
          safeWorkspace,

        env: {
          ...process.env,
          ...environment
        },

        detached:
          process.platform !== "win32",

        stdio: [
          "ignore",
          "pipe",
          "pipe"
        ],

        windowsHide: true
      }
    );

  const resourceSamples = [];

  const resourceTimer =
    setInterval(
      async () => {
        const snapshot =
          await readDockerResourceSnapshot(
            containerName
          );

        if (snapshot) {
          resourceSamples.push(
            snapshot
          );
        }
      },
      1000
    );

  child.stdout.on(
    "data",
    (chunk) => {
      output.appendStdout(
        chunk
      );
    }
  );

  child.stderr.on(
    "data",
    (chunk) => {
      output.appendStderr(
        chunk
      );
    }
  );

  const terminate =
    async () => {
      timedOut = true;

      await terminateProcessTree(
        child,
        normalizedLimits.gracePeriodMs
      );

      /*
       * Docker container may still exist if docker CLI itself
       * received a signal. Explicitly attempt container removal.
       */
      try {
        await execFileAsync(
          "docker",
          [
            "rm",
            "-f",
            containerName
          ],
          {
            timeout: 5000,
            windowsHide: true
          }
        );
      } catch (error) {
        // Container may already have been removed by --rm.
      }
    };

  const timeoutTimer =
    setTimeout(
      terminate,
      normalizedLimits.timeoutMs
    );

  return new Promise(
    (resolve) => {
      const finalize =
        async (
          exitCode,
          signal,
          processError = null
        ) => {
          if (settled) {
            return;
          }

          settled = true;

          clearTimeout(
            timeoutTimer
          );

          clearInterval(
            resourceTimer
          );

          const completedAt = now();

          const durationMs =
            completedAt.getTime() -
            startedAt.getTime();

          const collected =
            output.getResult();

          const success =
            !timedOut &&
            !processError &&
            exitCode === 0;

          resolve({
            executionId:
              createId("docker-exec"),

            type,

            mode: "docker",

            authoritative: true,

            success,

            status:
              timedOut
                ? "timeout"
                : success
                  ? "success"
                  : "failed",

            command:
              docker.command,

            image:
              docker.image,

            containerName,

            networkPolicy:
              docker.network,

            nodeVersion,

            startedAt,

            completedAt,

            durationMs,

            exitCode:
              typeof exitCode ===
              "number"
                ? exitCode
                : null,

            signal:
              signal || "",

            timedOut,

            stdout:
              collected.stdout,

            stderr:
              collected.stderr,

            stdoutBytes:
              collected.stdoutBytes,

            stderrBytes:
              collected.stderrBytes,

            stdoutTruncated:
              collected.stdoutTruncated,

            stderrTruncated:
              collected.stderrTruncated,

            resourceSamples,

            finalResourceSnapshot:
              resourceSamples.length
                ? resourceSamples[
                    resourceSamples.length - 1
                  ]
                : null,

            filesystemIsolation: {
              workspaceMount:
                "/workspace",
              readOnlyRootFilesystem:
                true,
              tmpfs:
                [
                  "/tmp",
                  "/home/node"
                ],
              capDrop:
                "ALL",
              noNewPrivileges:
                true
            },

            evidence: {
              dockerExecuted: true,
              containerStarted:
                !processError,
              commandExecuted:
                !processError,
              processExited:
                !processError,
              artifactCreated:
                false,
              artifactVerified:
                false
            }
          });
        };

      child.on(
        "error",
        (error) => {
          finalize(
            null,
            null,
            error
          );
        }
      );

      child.on(
        "close",
        (exitCode, signal) => {
          finalize(
            exitCode,
            signal,
            null
          );
        }
      );
    }
  );
}

/* ============================================================
   DOCKER RESOURCE SNAPSHOT
============================================================ */

async function readDockerResourceSnapshot(
  containerName
) {
  try {
    const {
      stdout
    } =
      await execFileAsync(
        "docker",
        [
          "stats",
          "--no-stream",
          "--format",
          "{{.CPUPerc}}|{{.MemUsage}}|{{.PIDs}}",
          containerName
        ],
        {
          timeout: 3000,
          windowsHide: true
        }
      );

    const line =
      String(stdout)
        .trim();

    if (!line) {
      return null;
    }

    const [
      cpuPercentRaw,
      memoryRaw,
      pidsRaw
    ] =
      line.split("|");

    const cpuPercent =
      parseFloat(
        String(cpuPercentRaw)
          .replace("%", "")
      ) || 0;

    const memoryMatch =
      String(memoryRaw)
        .match(
          /([\d.]+)\s*(MiB|GiB|MB|GB)/
        );

    let memoryMB = 0;

    if (memoryMatch) {
      const value =
        Number(
          memoryMatch[1]
        );

      const unit =
        memoryMatch[2]
          .toUpperCase();

      memoryMB =
        unit === "GIB" ||
        unit === "GB"
          ? value * 1024
          : value;
    }

    return {
      supported: true,
      cpuPercent,
      memoryMB,
      pids:
        Number(pidsRaw) || 0
    };
  } catch (error) {
    return null;
  }
}

/* ============================================================
   DEPENDENCY INSTALLATION
============================================================ */

function detectPackageManager(
  workspacePath
) {
  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

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
        "package-lock.json"
      )
    )
  ) {
    return "npm";
  }

  return "npm";
}

function getInstallCommand(
  workspacePath,
  packageManager
) {
  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

  const packageJsonPath =
    path.join(
      workspace,
      "package.json"
    );

  if (
    !fs.existsSync(
      packageJsonPath
    )
  ) {
    throw new Error(
      "package.json is required for dependency installation"
    );
  }

  const packageJson =
    JSON.parse(
      fs.readFileSync(
        packageJsonPath,
        "utf8"
      )
    );

  const manager =
    normalizeString(
      packageManager,
      50
    ).toLowerCase() ||
    detectPackageManager(
      workspace
    );

  const hasDependencies =
    Object.keys({
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    }).length > 0;

  if (!hasDependencies) {
    return {
      packageManager:
        manager,
      command:
        "printf '%s\\n' 'No dependencies declared; installation skipped.'",
      skipped: true
    };
  }

  if (manager === "pnpm") {
    if (
      fs.existsSync(
        path.join(
          workspace,
          "pnpm-lock.yaml"
        )
      )
    ) {
      return {
        packageManager: "pnpm",
        command:
          "corepack pnpm install --frozen-lockfile",
        skipped: false
      };
    }

    return {
      packageManager: "pnpm",
      command:
        "corepack pnpm install",
      skipped: false
    };
  }

  if (manager === "yarn") {
    if (
      fs.existsSync(
        path.join(
          workspace,
          "yarn.lock"
        )
      )
    ) {
      return {
        packageManager: "yarn",
        command:
          "corepack yarn install --immutable",
        skipped: false
      };
    }

    return {
      packageManager: "yarn",
      command:
        "corepack yarn install",
      skipped: false
    };
  }

  if (
    fs.existsSync(
      path.join(
        workspace,
        "package-lock.json"
      )
    )
  ) {
    return {
      packageManager: "npm",
      command:
        "npm ci",
      skipped: false
    };
  }

  return {
    packageManager: "npm",
    command:
      "npm install",
    skipped: false
  };
}

async function installDependencies({
  workspacePath,
  packageManager = "",
  nodeVersion = "20",
  networkPolicy =
    NETWORK_POLICIES.BRIDGE,
  limits = DEFAULT_LIMITS,
  environment = {}
}) {
  const {
    workspace
  } =
    await prepareFilesystemIsolation(
      workspacePath
    );

  const install =
    getInstallCommand(
      workspace,
      packageManager
    );

  if (install.skipped) {
    return {
      success: true,
      status: "success",
      skipped: true,
      packageManager:
        install.packageManager,
      command:
        install.command
    };
  }

  /*
   * Dependency installation normally requires network access.
   * It is therefore explicitly separated from build execution.
   */
  return executeDocker({
    workspacePath:
      workspace,
    command:
      install.command,
    nodeVersion,
    networkPolicy:
      normalizeNetworkPolicy(
        networkPolicy
      ),
    limits:
      normalizeLimits(
        {
          ...limits,
          timeoutMs:
            limits.installTimeoutMs ||
            DEFAULT_LIMITS.installTimeoutMs
        }
      ),
    type:
      EXECUTION_TYPES.INSTALL,
    environment
  });
}

/* ============================================================
   PACKAGE / BUILD COMMAND
============================================================ */

function readPackageJson(
  workspacePath
) {
  const packageJsonPath =
    path.join(
      normalizeWorkspacePath(
        workspacePath
      ),
      "package.json"
    );

  if (
    !fs.existsSync(
      packageJsonPath
    )
  ) {
    throw new Error(
      "package.json not found"
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        packageJsonPath,
        "utf8"
      )
    );
  } catch (error) {
    throw new Error(
      `Invalid package.json: ${error.message}`
    );
  }
}

function getBuildCommandFromPackage(
  workspacePath
) {
  const packageJson =
    readPackageJson(
      workspacePath
    );

  const command =
    packageJson?.scripts?.build;

  if (
    typeof command !== "string" ||
    !command.trim()
  ) {
    throw new Error(
      "package.json does not contain a production build script"
    );
  }

  return validateCommand(
    command,
    {
      type:
        EXECUTION_TYPES.BUILD
    }
  );
}

/* ============================================================
   BUILD EXECUTION
============================================================ */

async function executeBuild({
  workspacePath,
  buildCommand = "",
  packageManager = "",
  nodeVersion = "20",
  installDependenciesFirst = true,
  installNetworkPolicy =
    NETWORK_POLICIES.BRIDGE,
  buildNetworkPolicy =
    DEFAULT_NETWORK_POLICY,
  limits = DEFAULT_LIMITS,
  environment = {},
  useLegacyAuthoritativeService = true,
  legacyOptions = {}
}) {
  const filesystem =
    await prepareFilesystemIsolation(
      workspacePath
    );

  const normalizedLimits =
    normalizeLimits(
      limits
    );

  /*
   * Compatibility migration path.
   *
   * The existing authoritative service remains available while
   * this execution layer is introduced.
   *
   * We only use it when explicitly enabled and available.
   */
  if (
    useLegacyAuthoritativeService &&
    authoritativeBuildService &&
    typeof
      authoritativeBuildService.executeBuild ===
      "function"
  ) {
    try {
      const legacyResult =
        await authoritativeBuildService.executeBuild({
          ...legacyOptions,

          files:
            legacyOptions.files ||
            [],

          workspacePath:
            filesystem.workspace,

          packageManager,
          nodeVersion,

          /*
           * Explicitly tell the old service that this execution
           * is being controlled by the new engineering layer.
           */
          engineeringExecutor:
            true
        });

      return normalizeLegacyBuildResult(
        legacyResult
      );
    } catch (error) {
      /*
       * Do NOT silently report success.
       *
       * The caller receives a real execution failure and may
       * choose native execution if its policy permits it.
       */
      return createExecutionFailure({
        type:
          EXECUTION_TYPES.BUILD,
        command:
          buildCommand,
        stage:
          "legacy-authoritative-build",
        error
      });
    }
  }

  let command =
    buildCommand;

  if (!command) {
    command =
      getBuildCommandFromPackage(
        filesystem.workspace
      );
  }

  command =
    validateCommand(
      command,
      {
        type:
          EXECUTION_TYPES.BUILD
      }
    );

  /*
   * Install and build are intentionally separate execution
   * records.
   */
  let installation = null;

  if (installDependenciesFirst) {
    installation =
      await installDependencies({
        workspacePath:
          filesystem.workspace,
        packageManager,
        nodeVersion,
        networkPolicy:
          installNetworkPolicy,
        limits:
          normalizedLimits,
        environment
      });

    if (!installation.success) {
      return {
        success: false,
        status: "failed",
        authoritative: true,
        type:
          EXECUTION_TYPES.BUILD,
        stage:
          "dependency-install",
        command:
          installation.command,
        buildCommand:
          command,
        packageManager:
          installation.packageManager ||
          packageManager,
        installResult:
          installation,
        repairContext: {
          required: true,
          failureStage:
            "dependency-install",
          failureCategory:
            "dependency",
          affectedFiles: [
            "package.json"
          ],
          stdout:
            installation.stdout || "",
          stderr:
            installation.stderr || "",
          exitCode:
            installation.exitCode,
          signal:
            installation.signal || "",
          timedOut:
            Boolean(
              installation.timedOut
            )
        }
      };
    }
  }

  const execution =
    await executeDocker({
      workspacePath:
        filesystem.workspace,
      command,
      nodeVersion,
      networkPolicy:
        buildNetworkPolicy,
      limits:
        normalizedLimits,
      type:
        EXECUTION_TYPES.BUILD,
      environment
    });

  const artifact =
    execution.success
      ? await createArtifact({
          workspacePath:
            filesystem.workspace,
          limits:
            normalizedLimits
        })
      : null;

  if (
    execution.success &&
    !artifact?.verified
  ) {
    return {
      success: false,
      status: "failed",
      authoritative: true,
      type:
        EXECUTION_TYPES.BUILD,
      stage:
        "artifact-verification",
      execution,
      installation,
      artifact,
      repairContext: {
        required: true,
        failureStage:
          "artifact-verification",
        failureCategory:
          "artifact",
        affectedFiles: [],
        stdout:
          execution.stdout,
        stderr:
          execution.stderr
      }
    };
  }

  return {
    success:
      execution.success &&
      Boolean(
        artifact?.verified
      ),

    status:
      execution.success &&
      artifact?.verified
        ? "success"
        : "failed",

    authoritative: true,

    type:
      EXECUTION_TYPES.BUILD,

    execution,

    installation,

    buildCommand:
      command,

    artifact,

    filesystem:
      filesystem.policy
  };
}

/* ============================================================
   PROCESS EXECUTION
============================================================ */

async function executeCommand({
  workspacePath,
  command,
  type =
    EXECUTION_TYPES.PROCESS,
  nodeVersion = "20",
  networkPolicy =
    DEFAULT_NETWORK_POLICY,
  limits = DEFAULT_LIMITS,
  environment = {},
  docker = true,
  allowDevelopmentProcess = false
}) {
  const {
    workspace
  } =
    await prepareFilesystemIsolation(
      workspacePath
    );

  const normalizedLimits =
    normalizeLimits(
      limits
    );

  validateCommand(
    command,
    {
      type,
      allowDevelopmentProcess
    }
  );

  if (docker) {
    return executeDocker({
      workspacePath:
        workspace,
      command,
      nodeVersion,
      networkPolicy,
      limits:
        normalizedLimits,
      type,
      environment
    });
  }

  return executeProcess({
    command,
    cwd:
      workspace,
    env:
      environment,
    type,
    timeoutMs:
      normalizedLimits.timeoutMs,
    maxOutputBytes:
      normalizedLimits.maxOutputBytes,
    gracePeriodMs:
      normalizedLimits.gracePeriodMs,
    allowDevelopmentProcess
  });
}

/* ============================================================
   RUNTIME EXECUTION
============================================================ */

async function executeRuntime({
  workspacePath,
  command,
  nodeVersion = "20",
  networkPolicy =
    NETWORK_POLICIES.NONE,
  limits = DEFAULT_LIMITS,
  environment = {},
  docker = true
}) {
  return executeCommand({
    workspacePath,
    command:
      validateCommand(
        command,
        {
          type:
            EXECUTION_TYPES.RUNTIME,
          allowDevelopmentProcess:
            true
        }
      ),
    type:
      EXECUTION_TYPES.RUNTIME,
    nodeVersion,
    networkPolicy,
    limits:
      normalizeLimits({
        ...limits,
        timeoutMs:
          limits.runtimeTimeoutMs ||
          DEFAULT_LIMITS.runtimeTimeoutMs
      }),
    environment,
    docker,
    allowDevelopmentProcess:
      true
  });
}

/* ============================================================
   PREVIEW EXECUTION
============================================================ */

async function executePreview({
  workspacePath,
  command,
  nodeVersion = "20",
  networkPolicy =
    NETWORK_POLICIES.BRIDGE,
  limits = DEFAULT_LIMITS,
  environment = {},
  docker = true
}) {
  return executeCommand({
    workspacePath,
    command:
      validateCommand(
        command,
        {
          type:
            EXECUTION_TYPES.PREVIEW,
          allowDevelopmentProcess:
            true
        }
      ),
    type:
      EXECUTION_TYPES.PREVIEW,
    nodeVersion,
    networkPolicy,
    limits:
      normalizeLimits({
        ...limits,
        timeoutMs:
          limits.previewTimeoutMs ||
          DEFAULT_LIMITS.previewTimeoutMs
      }),
    environment,
    docker,
    allowDevelopmentProcess:
      true
  });
}

/* ============================================================
   TEST EXECUTION
============================================================ */

async function executeTests({
  workspacePath,
  command,
  nodeVersion = "20",
  networkPolicy =
    DEFAULT_NETWORK_POLICY,
  limits = DEFAULT_LIMITS,
  environment = {},
  docker = true
}) {
  return executeCommand({
    workspacePath,
    command,
    type:
      EXECUTION_TYPES.TEST,
    nodeVersion,
    networkPolicy,
    limits:
      normalizeLimits({
        ...limits,
        timeoutMs:
          limits.testTimeoutMs ||
          DEFAULT_LIMITS.testTimeoutMs
      }),
    environment,
    docker
  });
}

/* ============================================================
   ARTIFACT CREATION
============================================================ */

async function createArtifact({
  workspacePath,
  limits = DEFAULT_LIMITS,
  outputDirectory = ""
}) {
  const filesystem =
    await prepareFilesystemIsolation(
      workspacePath
    );

  const normalizedLimits =
    normalizeLimits(
      limits
    );

  let sourceRoot =
    filesystem.workspace;

  if (outputDirectory) {
    sourceRoot =
      assertPathInside(
        path.join(
          filesystem.workspace,
          outputDirectory
        ),
        filesystem.workspace
      );
  }

  if (
    !fs.existsSync(
      sourceRoot
    )
  ) {
    return {
      created: false,
      verified: false,
      error:
        "Artifact source directory does not exist"
    };
  }

  const artifactId =
    createId("artifact");

  const archiveName =
    `${artifactId}.tar.gz`;

  const archivePath =
    assertPathInside(
      path.join(
        filesystem.artifactDirectory,
        archiveName
      ),
      filesystem.workspace
    );

  /*
   * Do not recursively package node_modules, git metadata,
   * environment files or the artifact directory itself.
   */
  const tarResult =
    await executeProcess({
      command:
        [
          "tar",
          "-czf",
          `"${archivePath.replace(
            /"/g,
            '\\"'
          )}"`,
          "--exclude=node_modules",
          "--exclude=.git",
          "--exclude=.env",
          "--exclude=.env.*",
          "--exclude=.zyrionos/artifacts",
          "-C",
          `"${sourceRoot.replace(
            /"/g,
            '\\"'
          )}"`,
          "."
        ].join(" "),
      cwd:
        filesystem.workspace,
      type:
        EXECUTION_TYPES.ARTIFACT,
      timeoutMs:
        normalizedLimits.timeoutMs,
      maxOutputBytes:
        normalizedLimits.maxOutputBytes,
      gracePeriodMs:
        normalizedLimits.gracePeriodMs
    });

  if (!tarResult.success) {
    return {
      created: false,
      verified: false,
      artifactId,
      execution:
        tarResult
    };
  }

  if (
    !fs.existsSync(
      archivePath
    )
  ) {
    return {
      created: false,
      verified: false,
      artifactId,
      error:
        "Artifact command completed but archive was not created"
    };
  }

  const stats =
    await fsp.stat(
      archivePath
    );

  if (
    stats.size <= 0
  ) {
    return {
      created: false,
      verified: false,
      artifactId,
      error:
        "Artifact is empty"
    };
  }

  if (
    stats.size >
    normalizedLimits.maxArtifactBytes
  ) {
    await safeUnlink(
      archivePath
    );

    return {
      created: false,
      verified: false,
      artifactId,
      error:
        "Artifact exceeds maximum allowed size"
    };
  }

  const checksum =
    await calculateSha256(
      archivePath
    );

  const verified =
    await verifyArtifact({
      artifactPath:
        archivePath,
      expectedChecksum:
        checksum,
      maxBytes:
        normalizedLimits.maxArtifactBytes
    });

  return {
    created: true,
    verified,
    artifactId,
    name:
      archiveName,
    path:
      archivePath,
    size:
      stats.size,
    checksum,
    type:
      "archive",
    storageKey:
      archivePath
  };
}

/* ============================================================
   SHA-256
============================================================ */

async function calculateSha256(
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
        (chunk) => {
          hash.update(
            chunk
          );
        }
      );

      stream.on(
        "error",
        reject
      );

      stream.on(
        "end",
        () => {
          resolve(
            hash.digest("hex")
          );
        }
      );
    }
  );
}

/* ============================================================
   ARTIFACT VERIFICATION
============================================================ */

async function verifyArtifact({
  artifactPath,
  expectedChecksum,
  maxBytes =
    DEFAULT_LIMITS.maxArtifactBytes
}) {
  if (
    !artifactPath ||
    !fs.existsSync(
      artifactPath
    )
  ) {
    return false;
  }

  const stats =
    await fsp.stat(
      artifactPath
    );

  if (
    !stats.isFile() ||
    stats.size <= 0 ||
    stats.size > maxBytes
  ) {
    return false;
  }

  const actualChecksum =
    await calculateSha256(
      artifactPath
    );

  return (
    actualChecksum ===
    expectedChecksum
  );
}

/* ============================================================
   SAFE FILE DELETE
============================================================ */

async function safeUnlink(
  filePath
) {
  try {
    await fsp.unlink(
      filePath
    );
  } catch (error) {
    if (
      error.code !==
      "ENOENT"
    ) {
      throw error;
    }
  }
}

/* ============================================================
   LEGACY RESULT NORMALIZATION
============================================================ */

function normalizeLegacyBuildResult(
  result
) {
  if (!result) {
    return {
      success: false,
      status: "failed",
      authoritative: true,
      stage:
        "legacy-authoritative-build",
      error:
        "Legacy authoritative build returned no result"
    };
  }

  /*
   * Never turn an ambiguous result into success.
   */
  const success =
    result.success === true &&
    result.authoritative === true &&
    Boolean(
      result.buildId ||
      result.artifact
    );

  return {
    ...result,

    success,

    status:
      success
        ? "success"
        : "failed",

    authoritative: true,

    executionMode:
      "legacy-authoritative-adapter"
  };
}

/* ============================================================
   GENERIC FAILURE
============================================================ */

function createExecutionFailure({
  type,
  command = "",
  stage,
  error
}) {
  const message =
    normalizeString(
      error?.message ||
        error ||
        "Execution failed",
      4000
    );

  return {
    success: false,

    status: "failed",

    authoritative: true,

    type,

    stage,

    command:
      normalizeString(
        command,
        2000
      ),

    error: message,

    stdout: "",

    stderr: message,

    exitCode: null,

    signal: "",

    timedOut: false,

    repairContext: {
      required: true,
      failureStage: stage,
      failureCategory:
        "execution",
      affectedFiles: [],
      errors: [
        {
          message
        }
      ]
    }
  };
}

/* ============================================================
   RESOURCE MEASUREMENT API
============================================================ */

async function measureProcess(
  pid
) {
  return readProcessResourceSnapshot(
    pid
  );
}

async function measureContainer(
  containerName
) {
  return readDockerResourceSnapshot(
    containerName
  );
}

/* ============================================================
   FILESYSTEM CLEANUP
============================================================ */

async function cleanupWorkspaceMetadata(
  workspacePath
) {
  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

  const artifactDirectory =
    path.join(
      workspace,
      ".zyrionos",
      "artifacts"
    );

  assertPathInside(
    artifactDirectory,
    workspace
  );

  /*
   * Only remove our generated artifact directory.
   * Never recursively delete the user's project workspace.
   */
  await fsp.rm(
    artifactDirectory,
    {
      recursive: true,
      force: true
    }
  );

  await ensureDirectory(
    artifactDirectory
  );

  return {
    success: true
  };
}

/* ============================================================
   STATE INTEGRATION
 *
 * These helpers record real execution evidence when the state
 * layer is available. They never fabricate execution results.
============================================================ */

async function persistExecutionRecord({
  attemptId,
  result
}) {
  if (
    !engineeringState ||
    !attemptId ||
    !result
  ) {
    return null;
  }

  if (
    typeof
      engineeringState.createExecutionRecord !==
    "function"
  ) {
    return null;
  }

  const record =
    await engineeringState.createExecutionRecord({
      attemptId,
      type:
        result.type ||
        EXECUTION_TYPES.PROCESS,
      command:
        result.command ||
        "",
      workingDirectory:
        result.cwd ||
        ""
    });

  if (
    typeof
      engineeringState.completeExecutionRecord ===
    "function"
  ) {
    return engineeringState.completeExecutionRecord({
      executionId:
        record.executionId,

      status:
        result.status ||
        "failed",

      exitCode:
        result.exitCode,

      signal:
        result.signal,

      timedOut:
        Boolean(
          result.timedOut
        ),

      startedAt:
        result.startedAt,

      completedAt:
        result.completedAt,

      stdout:
        result.stdout,

      stderr:
        result.stderr,

      resourceSnapshot:
        result.finalResourceSnapshot ||
        {}
    });
  }

  return record;
}

/* ============================================================
   HIGH-LEVEL EXECUTION API
============================================================ */

async function execute({
  type,
  workspacePath,
  command = "",
  buildCommand = "",
  packageManager = "",
  nodeVersion = "20",
  networkPolicy =
    DEFAULT_NETWORK_POLICY,
  installNetworkPolicy =
    NETWORK_POLICIES.BRIDGE,
  limits = DEFAULT_LIMITS,
  environment = {},
  outputDirectory = "",
  attemptId = null,
  useLegacyAuthoritativeService = true,
  legacyOptions = {}
}) {
  switch (type) {
    case EXECUTION_TYPES.INSTALL:
      return installDependencies({
        workspacePath,
        packageManager,
        nodeVersion,
        networkPolicy:
          installNetworkPolicy,
        limits,
        environment
      });

    case EXECUTION_TYPES.BUILD:
      return executeBuild({
        workspacePath,
        buildCommand,
        packageManager,
        nodeVersion,
        installDependenciesFirst:
          true,
        installNetworkPolicy,
        buildNetworkPolicy:
          networkPolicy,
        limits,
        environment,
        useLegacyAuthoritativeService,
        legacyOptions
      });

    case EXECUTION_TYPES.RUNTIME:
      return executeRuntime({
        workspacePath,
        command,
        nodeVersion,
        networkPolicy,
        limits,
        environment
      });

    case EXECUTION_TYPES.PREVIEW:
      return executePreview({
        workspacePath,
        command,
        nodeVersion,
        networkPolicy,
        limits,
        environment
      });

    case EXECUTION_TYPES.TEST:
      return executeTests({
        workspacePath,
        command,
        nodeVersion,
        networkPolicy,
        limits,
        environment
      });

    case EXECUTION_TYPES.PROCESS:
      return executeCommand({
        workspacePath,
        command,
        type,
        nodeVersion,
        networkPolicy,
        limits,
        environment
      });

    case EXECUTION_TYPES.ARTIFACT:
      return createArtifact({
        workspacePath,
        limits,
        outputDirectory
      });

    default:
      throw new Error(
        `Unsupported execution type: ${type}`
      );
  }
}

/* ============================================================
   PUBLIC CONTRACT
============================================================ */

module.exports = {
  SERVICE_VERSION,

  EXECUTION_MODE,

  AUTHORITATIVE,

  DEFAULT_LIMITS,

  NETWORK_POLICIES,

  FILESYSTEM_POLICY,

  EXECUTION_TYPES,

  normalizeLimits,

  normalizeNetworkPolicy,

  validateCommand,

  ensureWorkspace,

  prepareFilesystemIsolation,

  executeProcess,

  executeDocker,

  installDependencies,

  detectPackageManager,

  getInstallCommand,

  readPackageJson,

  getBuildCommandFromPackage,

  executeBuild,

  executeCommand,

  executeRuntime,

  executePreview,

  executeTests,

  createArtifact,

  calculateSha256,

  verifyArtifact,

  measureProcess,

  measureContainer,

  cleanupWorkspaceMetadata,

  persistExecutionRecord,

  execute,

  terminateProcessTree,

  resolveNodeImage
};
