"use strict";

/*
 * ============================================================
 * ZYRION OS — ENGINEERING EXECUTOR v1.2.0
 * ============================================================
 *
 * Enterprise Autonomous Engineering Control Plane
 *
 * REAL EXECUTION ONLY
 *
 * Responsibilities:
 *   - dependency installation
 *   - authoritative build execution
 *   - process execution
 *   - runtime execution
 *   - preview execution
 *   - test execution
 *   - Docker isolation
 *   - timeout handling
 *   - cancellation
 *   - CPU / memory / PID / disk controls
 *   - network policy
 *   - filesystem isolation
 *   - process termination
 *   - stdout / stderr capture
 *   - secret redaction
 *   - artifact creation
 *   - artifact verification
 *   - source hashing
 *   - resource evidence
 *   - execution-state persistence
 *   - checkpoint creation
 *   - rollback
 *
 * IMPORTANT:
 *   AI output is NEVER execution evidence.
 *   Static validation is NEVER authoritative execution.
 *   Process launch is NEVER success.
 *
 * Authoritative build success requires:
 *   1. real Docker execution
 *   2. successful exit
 *   3. authoritative execution mode
 *   4. artifact creation
 *   5. artifact checksum verification
 *   6. source identity
 *   7. build identity
 *
 * ============================================================
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const net = require("net");

const {
  spawn
} = require("child_process");

const {
  promisify
} = require("util");

const {
  execFile
} = require("child_process");

const execFileAsync =
  promisify(execFile);

/* ============================================================
   OPTIONAL ENGINEERING STATE
============================================================ */

let engineeringState = null;

try {
  engineeringState =
    require("./engineeringState");
} catch (_) {
  engineeringState = null;
}

/* ============================================================
   VERSION
============================================================ */

const SERVICE_VERSION =
  "1.2.0";

const EXECUTION_MODE =
  "engineering-control-plane";

const AUTHORITATIVE =
  true;

/* ============================================================
   NETWORK POLICY
============================================================ */

const NETWORK_POLICIES =
  Object.freeze({
    NONE: "none",
    BRIDGE: "bridge",
    HOST: "host"
  });

const DEFAULT_NETWORK_POLICY =
  NETWORK_POLICIES.NONE;

/* ============================================================
   EXECUTION TYPES
============================================================ */

const EXECUTION_TYPES =
  Object.freeze({
    PROCESS: "process",
    INSTALL: "install",
    BUILD: "build",
    TEST: "test",
    RUNTIME: "runtime",
    PREVIEW: "preview",
    ARTIFACT: "artifact"
  });

/* ============================================================
   DEFAULT EXECUTION LIMITS
============================================================ */

const DEFAULT_LIMITS =
  Object.freeze({
    timeoutMs:
      15 * 60 * 1000,

    installTimeoutMs:
      10 * 60 * 1000,

    runtimeTimeoutMs:
      5 * 60 * 1000,

    testTimeoutMs:
      10 * 60 * 1000,

    previewTimeoutMs:
      5 * 60 * 1000,

    cpuCores: 2,

    memoryMB: 2048,

    pids: 256,

    diskMB: 10240,

    maxOutputBytes:
      5 * 1024 * 1024,

    maxErrorBytes:
      20 * 1024,

    maxArtifactBytes:
      500 * 1024 * 1024,

    gracePeriodMs:
      5000,

    resourceSampleMs:
      1000,

    readinessTimeoutMs:
      30000,

    readinessIntervalMs:
      1000
  });

/* ============================================================
   FILESYSTEM POLICY
============================================================ */

const FILESYSTEM_POLICY =
  Object.freeze({
    WORKSPACE:
      "/workspace",

    TMP:
      "/tmp",

    NODE_HOME:
      "/home/node",

    ARTIFACT:
      "/workspace/.zyrionos/artifacts"
  });

/* ============================================================
   COMMAND SAFETY
============================================================ */

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

/* ============================================================
   GENERIC HELPERS
============================================================ */

function normalizeString(
  value,
  maxLength = 4000
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).slice(
    0,
    maxLength
  );
}

function clampNumber(
  value,
  minimum,
  maximum,
  fallback
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(numeric)
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      numeric
    )
  );
}

function createId(prefix) {
  return (
    `${prefix}-${Date.now()}-` +
    crypto
      .randomBytes(8)
      .toString("hex")
  );
}

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}

function redactSecrets(value) {
  let output =
    normalizeString(
      value,
      20000
    );

  for (
    const pattern of
      SECRET_PATTERNS
  ) {
    output =
      output.replace(
        pattern,
        "[REDACTED]"
      );
  }

  return output;
}

function safeError(error) {
  if (!error) {
    return null;
  }

  return {
    name:
      normalizeString(
        error.name,
        200
      ),

    message:
      normalizeString(
        error.message ||
          error,
        4000
      ),

    code:
      normalizeString(
        error.code,
        100
      ),

    stack:
      normalizeString(
        error.stack,
        8000
      )
  };
}

/* ============================================================
   ENGINEERING STATE LIMITS
 *
 * If State exposes stricter resource policy, executor never
 * exceeds it.
============================================================ */

function getStateResourceLimits() {
  try {
    if (
      engineeringState &&
      engineeringState.ENGINEERING_LIMITS &&
      engineeringState
        .ENGINEERING_LIMITS
        .MAX_RESOURCE_LIMIT
    ) {
      return {
        ...engineeringState
          .ENGINEERING_LIMITS
          .MAX_RESOURCE_LIMIT
      };
    }
  } catch (_) {}

  return null;
}

/* ============================================================
   LIMIT NORMALIZATION
============================================================ */

function normalizeLimits(
  input = {}
) {
  const requested =
    input &&
    typeof input === "object"
      ? input
      : {};

  const stateLimits =
    getStateResourceLimits();

  const stateCpu =
    Number(
      stateLimits?.cpu
    );

  const stateMemory =
    Number(
      stateLimits?.memory
    );

  const statePids =
    Number(
      stateLimits?.pids
    );

  const stateDisk =
    Number(
      stateLimits?.disk
    );

  const cpuMaximum =
    Number.isFinite(stateCpu) &&
    stateCpu > 0
      ? Math.min(
          DEFAULT_LIMITS.cpuCores,
          stateCpu
        )
      : DEFAULT_LIMITS.cpuCores;

  const memoryMaximum =
    Number.isFinite(stateMemory) &&
    stateMemory > 0
      ? Math.min(
          DEFAULT_LIMITS.memoryMB,
          stateMemory
        )
      : DEFAULT_LIMITS.memoryMB;

  const pidsMaximum =
    Number.isFinite(statePids) &&
    statePids > 0
      ? Math.min(
          DEFAULT_LIMITS.pids,
          statePids
        )
      : DEFAULT_LIMITS.pids;

  const diskMaximum =
    Number.isFinite(stateDisk) &&
    stateDisk > 0
      ? Math.min(
          DEFAULT_LIMITS.diskMB,
          stateDisk
        )
      : DEFAULT_LIMITS.diskMB;

  return {
    timeoutMs:
      clampNumber(
        requested.timeoutMs,
        1000,
        DEFAULT_LIMITS.timeoutMs,
        DEFAULT_LIMITS.timeoutMs
      ),

    installTimeoutMs:
      clampNumber(
        requested.installTimeoutMs,
        1000,
        DEFAULT_LIMITS.installTimeoutMs,
        DEFAULT_LIMITS.installTimeoutMs
      ),

    runtimeTimeoutMs:
      clampNumber(
        requested.runtimeTimeoutMs,
        1000,
        DEFAULT_LIMITS.runtimeTimeoutMs,
        DEFAULT_LIMITS.runtimeTimeoutMs
      ),

    testTimeoutMs:
      clampNumber(
        requested.testTimeoutMs,
        1000,
        DEFAULT_LIMITS.testTimeoutMs,
        DEFAULT_LIMITS.testTimeoutMs
      ),

    previewTimeoutMs:
      clampNumber(
        requested.previewTimeoutMs,
        1000,
        DEFAULT_LIMITS.previewTimeoutMs,
        DEFAULT_LIMITS.previewTimeoutMs
      ),

    cpuCores:
      clampNumber(
        requested.cpuCores,
        0.25,
        cpuMaximum,
        cpuMaximum
      ),

    memoryMB:
      clampNumber(
        requested.memoryMB,
        128,
        memoryMaximum,
        memoryMaximum
      ),

    pids:
      clampNumber(
        requested.pids,
        32,
        pidsMaximum,
        pidsMaximum
      ),

    diskMB:
      clampNumber(
        requested.diskMB,
        256,
        diskMaximum,
        diskMaximum
      ),

    maxOutputBytes:
      clampNumber(
        requested.maxOutputBytes,
        64 * 1024,
        DEFAULT_LIMITS.maxOutputBytes,
        DEFAULT_LIMITS.maxOutputBytes
      ),

    maxErrorBytes:
      clampNumber(
        requested.maxErrorBytes,
        4096,
        DEFAULT_LIMITS.maxErrorBytes,
        DEFAULT_LIMITS.maxErrorBytes
      ),

    maxArtifactBytes:
      clampNumber(
        requested.maxArtifactBytes,
        1024 * 1024,
        DEFAULT_LIMITS.maxArtifactBytes,
        DEFAULT_LIMITS.maxArtifactBytes
      ),

    gracePeriodMs:
      clampNumber(
        requested.gracePeriodMs,
        250,
        DEFAULT_LIMITS.gracePeriodMs,
        DEFAULT_LIMITS.gracePeriodMs
      ),

    resourceSampleMs:
      clampNumber(
        requested.resourceSampleMs,
        250,
        DEFAULT_LIMITS.resourceSampleMs,
        DEFAULT_LIMITS.resourceSampleMs
      ),

    readinessTimeoutMs:
      clampNumber(
        requested.readinessTimeoutMs,
        1000,
        DEFAULT_LIMITS.readinessTimeoutMs,
        DEFAULT_LIMITS.readinessTimeoutMs
      ),

    readinessIntervalMs:
      clampNumber(
        requested.readinessIntervalMs,
        250,
        DEFAULT_LIMITS.readinessIntervalMs,
        DEFAULT_LIMITS.readinessIntervalMs
      )
  };
}

/* ============================================================
   NETWORK
============================================================ */

function normalizeNetworkPolicy(
  policy =
    DEFAULT_NETWORK_POLICY
) {
  const normalized =
    normalizeString(
      policy,
      50
    )
      .trim()
      .toLowerCase();

  if (
    !Object.values(
      NETWORK_POLICIES
    ).includes(normalized)
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
  options = {}
) {
  const type =
    options.type ||
    EXECUTION_TYPES.PROCESS;

  const allowDevelopmentProcess =
    Boolean(
      options.allowDevelopmentProcess
    );

  const normalized =
    normalizeString(
      command,
      4000
    ).trim();

  if (!normalized) {
    throw new Error(
      "Execution command is required"
    );
  }

  for (
    const pattern of
      FORBIDDEN_CONTROL_PATTERNS
  ) {
    if (
      pattern.test(normalized)
    ) {
      throw new Error(
        "Command rejected by execution safety policy"
      );
    }
  }

  if (
    type ===
      EXECUTION_TYPES.BUILD &&
    !allowDevelopmentProcess
  ) {
    for (
      const pattern of
        FORBIDDEN_BUILD_PATTERNS
    ) {
      if (
        pattern.test(normalized)
      ) {
        throw new Error(
          `Invalid production build command: ${normalized}`
        );
      }
    }
  }

  return normalized;
}

/* ============================================================
   PATH SAFETY
============================================================ */

function normalizeWorkspacePath(
  workspacePath
) {
  if (!workspacePath) {
    throw new Error(
      "workspacePath is required"
    );
  }

  return path.resolve(
    workspacePath
  );
}

function assertPathInside(
  targetPath,
  rootPath
) {
  const target =
    path.resolve(
      targetPath
    );

  const root =
    path.resolve(
      rootPath
    );

  const relative =
    path.relative(
      root,
      target
    );

  if (
    relative === "" ||
    (
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
   WORKSPACE
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

async function prepareFilesystemIsolation(
  workspacePath
) {
  const result =
    await ensureWorkspace(
      workspacePath
    );

  assertPathInside(
    result.artifactDirectory,
    result.workspace
  );

  return {
    ...result,

    policy: {
      writableRoot:
        FILESYSTEM_POLICY.WORKSPACE,

      artifactRoot:
        FILESYSTEM_POLICY.ARTIFACT,

      generatedOutsideWorkspace:
        false,

      hostWorkspace:
        result.workspace
    }
  };
}

/* ============================================================
   OUTPUT COLLECTOR
============================================================ */

function createOutputCollector(
  maxStdoutBytes,
  maxStderrBytes
) {
  let stdout = "";
  let stderr = "";

  let stdoutBytes = 0;
  let stderrBytes = 0;

  let stdoutTruncated = false;
  let stderrTruncated = false;

  function append(
    current,
    bytes,
    chunk,
    limit
  ) {
    const text =
      Buffer.isBuffer(chunk)
        ? chunk.toString("utf8")
        : String(chunk);

    const buffer =
      Buffer.from(
        text,
        "utf8"
      );

    const remaining =
      limit - bytes;

    if (remaining <= 0) {
      return {
        text: current,
        bytes,
        truncated: true
      };
    }

    if (
      buffer.length <=
      remaining
    ) {
      return {
        text:
          current + text,
        bytes:
          bytes + buffer.length,
        truncated: false
      };
    }

    return {
      text:
        current +
        buffer
          .subarray(
            0,
            remaining
          )
          .toString("utf8"),

      bytes:
        limit,

      truncated:
        true
    };
  }

  return {
    appendStdout(chunk) {
      const result =
        append(
          stdout,
          stdoutBytes,
          chunk,
          maxStdoutBytes
        );

      stdout =
        result.text;

      stdoutBytes =
        result.bytes;

      stdoutTruncated ||=
        result.truncated;
    },

    appendStderr(chunk) {
      const result =
        append(
          stderr,
          stderrBytes,
          chunk,
          maxStderrBytes
        );

      stderr =
        result.text;

      stderrBytes =
        result.bytes;

      stderrTruncated ||=
        result.truncated;
    },

    getResult() {
      return {
        stdout:
          redactSecrets(
            stdout
          ),

        stderr:
          redactSecrets(
            stderr
          ),

        stdoutBytes,

        stderrBytes,

        stdoutTruncated,

        stderrTruncated
      };
    }
  };
}

/* ============================================================
   PROCESS TERMINATION
============================================================ */

function terminateProcessTree(
  child,
  gracePeriodMs =
    DEFAULT_LIMITS.gracePeriodMs
) {
  return new Promise(
    resolve => {
      if (
        !child ||
        child.killed
      ) {
        resolve({
          terminated: true,
          signal: null
        });

        return;
      }

      let finished = false;

      const finish =
        signal => {
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
        if (
          process.platform !==
            "win32" &&
          child.pid
        ) {
          try {
            process.kill(
              -child.pid,
              "SIGTERM"
            );
          } catch (_) {
            try {
              child.kill(
                "SIGTERM"
              );
            } catch (_) {}
          }
        } else {
          child.kill(
            "SIGTERM"
          );
        }
      } catch (_) {}

      setTimeout(
        () => {
          if (finished) {
            return;
          }

          try {
            if (
              process.platform !==
                "win32" &&
              child.pid
            ) {
              try {
                process.kill(
                  -child.pid,
                  "SIGKILL"
                );
              } catch (_) {
                try {
                  child.kill(
                    "SIGKILL"
                  );
                } catch (_) {}
              }
            } else {
              child.kill(
                "SIGKILL"
              );
            }
          } catch (_) {}

          finish(
            "SIGKILL"
          );
        },
        gracePeriodMs
      );
    }
  );
}

/* ============================================================
   PROCESS RESOURCE MEASUREMENT
============================================================ */

async function readProcessResourceSnapshot(
  pid
) {
  if (
    !pid ||
    process.platform ===
      "win32"
  ) {
    return {
      supported: false
    };
  }

  try {
    const {
      stdout
    } =
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
      line
        .trim()
        .match(
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

      processExists:
        true,

      pid:
        Number(match[1]),

      ppid:
        Number(match[2]),

      cpuPercent:
        Number(match[3]),

      memoryKB:
        Number(match[4]),

      elapsed:
        match[5]
    };
  } catch (error) {
    return {
      supported: false,

      error:
        normalizeString(
          error.message,
          500
        )
    };
  }
}

async function readDiskUsageMB(
  workspacePath
) {
  try {
    const {
      stdout
    } =
      await execFileAsync(
        "du",
        [
          "-sm",
          "--",
          workspacePath
        ],
        {
          timeout: 3000,
          windowsHide: true
        }
      );

    const value =
      Number(
        String(stdout)
          .trim()
          .split(/\s+/)[0]
      );

    return Number.isFinite(value)
      ? value
      : null;
  } catch (_) {
    return null;
  }
}

/* ============================================================
   GENERIC PROCESS EXECUTION
============================================================ */

async function executeProcess({
  command,

  cwd,

  env = {},

  type =
    EXECUTION_TYPES.PROCESS,

  timeoutMs =
    DEFAULT_LIMITS.timeoutMs,

  maxOutputBytes =
    DEFAULT_LIMITS.maxOutputBytes,

  maxErrorBytes =
    DEFAULT_LIMITS.maxErrorBytes,

  gracePeriodMs =
    DEFAULT_LIMITS.gracePeriodMs,

  resourceSampleMs =
    DEFAULT_LIMITS.resourceSampleMs,

  cpuCores =
    DEFAULT_LIMITS.cpuCores,

  memoryMB =
    DEFAULT_LIMITS.memoryMB,

  diskMB =
    DEFAULT_LIMITS.diskMB,

  allowDevelopmentProcess =
    false,

  cancellationToken =
    null
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
    normalizeWorkspacePath(
      cwd
    );

  const output =
    createOutputCollector(
      maxOutputBytes,
      maxErrorBytes
    );

  const startedAt =
    new Date();

  return new Promise(
    resolve => {
      let settled = false;
      let timedOut = false;
      let cancelled = false;
      let resourceViolation =
        null;
      let launchError =
        null;

      const resourceSamples =
        [];

      let resourceTimer =
        null;

      let cancellationTimer =
        null;

      const child =
        spawn(
          "sh",
          [
            "-lc",
            safeCommand
          ],
          {
            cwd:
              workingDirectory,

            env: {
              ...process.env,
              ...env
            },

            detached:
              process.platform !==
              "win32",

            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ],

            windowsHide:
              true
          }
        );

      const sampleResources =
        async () => {
          if (
            settled ||
            !child.pid
          ) {
            return;
          }

          const snapshot =
            await readProcessResourceSnapshot(
              child.pid
            );

          resourceSamples.push(
            snapshot
          );

          if (
            snapshot &&
            snapshot.supported &&
            snapshot.memoryKB
          ) {
            const memoryUsedMB =
              snapshot.memoryKB /
              1024;

            if (
              memoryUsedMB >
              Number(memoryMB)
            ) {
              resourceViolation =
                [
                  {
                    resource:
                      "memoryMB",

                    actual:
                      memoryUsedMB,

                    limit:
                      Number(memoryMB)
                  }
                ];

              await terminateProcessTree(
                child,
                gracePeriodMs
              );

              return;
            }
          }

          if (
            snapshot &&
            snapshot.supported &&
            Number.isFinite(
              snapshot.cpuPercent
            )
          ) {
            const cpuLimitPercent =
              Number(cpuCores) *
              100;

            if (
              snapshot.cpuPercent >
              cpuLimitPercent
            ) {
              resourceViolation =
                [
                  {
                    resource:
                      "cpu",

                    actual:
                      snapshot.cpuPercent,

                    limit:
                      cpuLimitPercent
                  }
                ];

              await terminateProcessTree(
                child,
                gracePeriodMs
              );

              return;
            }
          }

          if (
            diskMB &&
            diskMB > 0
          ) {
            const used =
              await readDiskUsageMB(
                workingDirectory
              );

            if (
              used !== null &&
              used > diskMB
            ) {
              resourceViolation =
                [
                  {
                    resource:
                      "diskMB",

                    actual:
                      used,

                    limit:
                      diskMB
                  }
                ];

              await terminateProcessTree(
                child,
                gracePeriodMs
              );
            }
          }
        };

      resourceTimer =
        setInterval(
          () => {
            sampleResources()
              .catch(() => {});
          },
          resourceSampleMs
        );

      if (
        cancellationToken &&
        typeof
          cancellationToken.aborted ===
          "boolean"
      ) {
        cancellationTimer =
          setInterval(
            async () => {
              if (
                !settled &&
                cancellationToken.aborted
              ) {
                cancelled =
                  true;

                await terminateProcessTree(
                  child,
                  gracePeriodMs
                );
              }
            },
            250
          );
      }

      child.stdout.on(
        "data",
        chunk =>
          output.appendStdout(
            chunk
          )
      );

      child.stderr.on(
        "data",
        chunk =>
          output.appendStderr(
            chunk
          )
      );

      const timeoutTimer =
        setTimeout(
          async () => {
            if (settled) {
              return;
            }

            timedOut =
              true;

            await terminateProcessTree(
              child,
              gracePeriodMs
            );
          },
          timeoutMs
        );

      const finalize =
        (
          exitCode,
          signal,
          error = null
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

          if (
            cancellationTimer
          ) {
            clearInterval(
              cancellationTimer
            );
          }

          launchError =
            error || launchError;

          const completedAt =
            new Date();

          const collected =
            output.getResult();

          const success =
            !timedOut &&
            !cancelled &&
            !resourceViolation &&
            !launchError &&
            exitCode === 0;

          resolve({
            executionId:
              createId(
                "exec"
              ),

            type,

            command:
              safeCommand,

            cwd:
              workingDirectory,

            status:
              timedOut
                ? "timeout"
                : cancelled
                  ? "cancelled"
                  : resourceViolation
                    ? "resource-limit"
                    : success
                      ? "success"
                      : "failed",

            success,

            authoritative:
              true,

            pid:
              child.pid ||
              null,

            exitCode:
              typeof exitCode ===
              "number"
                ? exitCode
                : null,

            signal:
              signal || "",

            timedOut,

            cancelled,

            resourceViolation,

            error:
              launchError
                ? safeError(
                    launchError
                  )
                : null,

            startedAt,

            completedAt,

            durationMs:
              completedAt.getTime() -
              startedAt.getTime(),

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
                    resourceSamples.length -
                    1
                  ]
                : null,

            evidence: {
              processStarted:
                true,

              processExited:
                typeof exitCode ===
                  "number" ||
                Boolean(signal),

              exitCode,

              signal:
                signal || "",

              timeout:
                timedOut,

              cancelled,

              resourceLimitExceeded:
                Boolean(
                  resourceViolation
                ),

              error:
                launchError
                  ? safeError(
                      launchError
                    )
                  : null
            }
          });
        };

      child.once(
        "error",
        error =>
          finalize(
            null,
            null,
            error
          )
      );

      child.once(
        "close",
        (
          exitCode,
          signal
        ) =>
          finalize(
            exitCode,
            signal
          )
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
   NODE IMAGE
============================================================ */

function resolveNodeImage(
  nodeVersion = "20"
) {
  const major =
    normalizeString(
      nodeVersion,
      50
    )
      .trim()
      .match(/^\d+/)?.[0] ||
    "20";

  if (
    !new Set([
      "18",
      "20",
      "22"
    ]).has(major)
  ) {
    throw new Error(
      `Unsupported Node runtime: ${nodeVersion}`
    );
  }

  return `node:${major}-bookworm-slim`;
}

/* ============================================================
   DOCKER ARGUMENTS
============================================================ */

function buildDockerArguments({
  workspacePath,

  command,

  nodeVersion = "20",

  networkPolicy =
    DEFAULT_NETWORK_POLICY,

  limits,

  type =
    EXECUTION_TYPES.PROCESS,

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
        type,

        allowDevelopmentProcess:
          type ===
            EXECUTION_TYPES.RUNTIME ||
          type ===
            EXECUTION_TYPES.PREVIEW
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
    String(
      limits.cpuCores
    ),

    "--memory",
    `${limits.memoryMB}m`,

    "--memory-swap",
    `${limits.memoryMB}m`,

    "--pids-limit",
    String(
      limits.pids
    ),

    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    "--read-only",

    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=512m",

    "--tmpfs",
    "/home/node:rw,nosuid,nodev,size=512m",

    "-v",
    `${workspacePath}:/workspace:rw`,

    "-w",
    "/workspace",

    "--network",
    network
  );

  if (user) {
    args.push(
      "--user",
      user
    );
  }

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

    command:
      safeCommand
  };
}

/* ============================================================
   DOCKER RESOURCE MEASUREMENT
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
      String(stdout).trim();

    if (!line) {
      return null;
    }

    const [
      cpuRaw,
      memoryRaw,
      pidsRaw
    ] =
      line.split("|");

    const cpuPercent =
      parseFloat(
        String(cpuRaw)
          .replace("%", "")
      ) || 0;

    const memoryMatch =
      String(memoryRaw).match(
        /([\d.]+)\s*(MiB|GiB|MB|GB)/i
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
      supported:
        true,

      cpuPercent,

      memoryMB,

      pids:
        Number(pidsRaw) || 0
    };
  } catch (_) {
    return null;
  }
}

/* ============================================================
   DOCKER CLEANUP
============================================================ */

async function removeDockerContainer(
  containerName
) {
  if (!containerName) {
    return;
  }

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
  } catch (_) {}
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

  limits =
    DEFAULT_LIMITS,

  type =
    EXECUTION_TYPES.PROCESS,

  environment = {},

  user = "node",

  cancellationToken = null
}) {
  await assertDockerAvailable();

  const workspace =
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
        workspace,

      command,

      nodeVersion,

      networkPolicy,

      limits:
        normalizedLimits,

      type,

      user,

      containerName
    });

  const output =
    createOutputCollector(
      normalizedLimits.maxOutputBytes,
      normalizedLimits.maxErrorBytes
    );

  const startedAt =
    new Date();

  const resourceSamples =
    [];

  let settled = false;
  let timedOut = false;
  let cancelled = false;
  let resourceViolation =
    null;

  let processError =
    null;

  let resourceTimer =
    null;

  let cancellationTimer =
    null;

  const child =
    spawn(
      "docker",
      docker.args,
      {
        cwd:
          workspace,

        env: {
          ...process.env,
          ...environment
        },

        detached:
          process.platform !==
          "win32",

        stdio: [
          "ignore",
          "pipe",
          "pipe"
        ],

        windowsHide:
          true
      }
    );

  const sampleResources =
    async () => {
      if (settled) {
        return;
      }

      const snapshot =
        await readDockerResourceSnapshot(
          containerName
        );

      if (!snapshot) {
        return;
      }

      resourceSamples.push(
        snapshot
      );

      if (
        snapshot.memoryMB >
        normalizedLimits.memoryMB
      ) {
        resourceViolation =
          [
            {
              resource:
                "memoryMB",

              actual:
                snapshot.memoryMB,

              limit:
                normalizedLimits.memoryMB
            }
          ];

        await terminateProcessTree(
          child,
          normalizedLimits.gracePeriodMs
        );

        await removeDockerContainer(
          containerName
        );

        return;
      }

      if (
        snapshot.pids >
        normalizedLimits.pids
      ) {
        resourceViolation =
          [
            {
              resource:
                "pids",

              actual:
                snapshot.pids,

              limit:
                normalizedLimits.pids
            }
          ];

        await terminateProcessTree(
          child,
          normalizedLimits.gracePeriodMs
        );

        await removeDockerContainer(
          containerName
        );
      }
    };

  resourceTimer =
    setInterval(
      () => {
        sampleResources()
          .catch(() => {});
      },
      normalizedLimits.resourceSampleMs
    );

  if (
    cancellationToken &&
    typeof
      cancellationToken.aborted ===
      "boolean"
  ) {
    cancellationTimer =
      setInterval(
        async () => {
          if (
            !settled &&
            cancellationToken.aborted
          ) {
            cancelled =
              true;

            await terminateProcessTree(
              child,
              normalizedLimits.gracePeriodMs
            );

            await removeDockerContainer(
              containerName
            );
          }
        },
        250
      );
  }

  child.stdout.on(
    "data",
    chunk =>
      output.appendStdout(
        chunk
      )
  );

  child.stderr.on(
    "data",
    chunk =>
      output.appendStderr(
        chunk
      )
  );

  return new Promise(
    resolve => {
      const timeoutTimer =
        setTimeout(
          async () => {
            if (settled) {
              return;
            }

            timedOut =
              true;

            await terminateProcessTree(
              child,
              normalizedLimits.gracePeriodMs
            );

            await removeDockerContainer(
              containerName
            );
          },
          normalizedLimits.timeoutMs
        );

      const finalize =
        (
          exitCode,
          signal,
          error = null
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

          if (
            cancellationTimer
          ) {
            clearInterval(
              cancellationTimer
            );
          }

          processError =
            error || processError;

          const completedAt =
            new Date();

          const collected =
            output.getResult();

          const success =
            !timedOut &&
            !cancelled &&
            !resourceViolation &&
            !processError &&
            exitCode === 0;

          resolve({
            executionId:
              createId(
                "docker-exec"
              ),

            type,

            mode:
              "docker",

            authoritative:
              true,

            validationMode:
              "authoritative",

            success,

            status:
              timedOut
                ? "timeout"
                : cancelled
                  ? "cancelled"
                  : resourceViolation
                    ? "resource-limit"
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

            durationMs:
              completedAt.getTime() -
              startedAt.getTime(),

            exitCode:
              typeof exitCode ===
              "number"
                ? exitCode
                : null,

            signal:
              signal || "",

            timedOut,

            cancelled,

            resourceViolation,

            error:
              processError
                ? safeError(
                    processError
                  )
                : null,

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
                    resourceSamples.length -
                    1
                  ]
                : null,

            filesystemIsolation: {
              workspaceMount:
                "/workspace",

              readOnlyRootFilesystem:
                true,

              tmpfs: [
                "/tmp",
                "/home/node"
              ],

              capDrop:
                "ALL",

              noNewPrivileges:
                true
            },

            evidence: {
              dockerExecuted:
                true,

              containerStarted:
                !processError,

              commandExecuted:
                !processError,

              processExited:
                !processError &&
                (
                  typeof exitCode ===
                    "number" ||
                  Boolean(signal)
                ),

              artifactCreated:
                false,

              artifactVerified:
                false,

              authoritative:
                true,

              validationMode:
                "authoritative",

              error:
                processError
                  ? safeError(
                      processError
                    )
                  : null
            }
          });
        };

      child.once(
        "error",
        error =>
          finalize(
            null,
            null,
            error
          )
      );

      child.once(
        "close",
        (
          exitCode,
          signal
        ) =>
          finalize(
            exitCode,
            signal
          )
      );
    }
  );
}

/* ============================================================
   PACKAGE MANAGER
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

/* ============================================================
   PACKAGE JSON
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

/* ============================================================
   INSTALL COMMAND
============================================================ */

function getInstallCommand(
  workspacePath,
  packageManager = ""
) {
  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

  const packageJson =
    readPackageJson(
      workspace
    );

  const manager =
    normalizeString(
      packageManager,
      50
    ).toLowerCase() ||
    detectPackageManager(
      workspace
    );

  const dependencies = {
    ...(packageJson.dependencies ||
      {}),

    ...(packageJson.devDependencies ||
      {})
  };

  if (
    Object.keys(
      dependencies
    ).length === 0
  ) {
    return {
      packageManager:
        manager,

      command:
        "printf '%s\\n' 'No dependencies declared; installation skipped.'",

      skipped:
        true
    };
  }

  if (
    manager === "pnpm"
  ) {
    return {
      packageManager:
        "pnpm",

      command:
        fs.existsSync(
          path.join(
            workspace,
            "pnpm-lock.yaml"
          )
        )
          ? "corepack pnpm install --frozen-lockfile"
          : "corepack pnpm install",

      skipped:
        false
    };
  }

  if (
    manager === "yarn"
  ) {
    return {
      packageManager:
        "yarn",

      command:
        fs.existsSync(
          path.join(
            workspace,
            "yarn.lock"
          )
        )
          ? "corepack yarn install --immutable"
          : "corepack yarn install",

      skipped:
        false
    };
  }

  return {
    packageManager:
      "npm",

    command:
      fs.existsSync(
        path.join(
          workspace,
          "package-lock.json"
        )
      )
        ? "npm ci"
        : "npm install",

    skipped:
      false
  };
}

/* ============================================================
   DEPENDENCY INSTALL
============================================================ */

async function installDependencies({
  workspacePath,

  packageManager = "",

  nodeVersion = "20",

  networkPolicy =
    NETWORK_POLICIES.BRIDGE,

  limits =
    DEFAULT_LIMITS,

  environment = {},

  cancellationToken =
    null
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

  if (
    install.skipped
  ) {
    return {
      success:
        true,

      status:
        "success",

      authoritative:
        true,

      validationMode:
        "authoritative",

      skipped:
        true,

      packageManager:
        install.packageManager,

      command:
        install.command,

      evidence: {
        dependenciesInstalled:
          false,

        installationSkipped:
          true
      }
    };
  }

  const normalizedLimits =
    normalizeLimits(
      limits
    );

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
      {
        ...normalizedLimits,

        timeoutMs:
          normalizedLimits.installTimeoutMs
      },

    type:
      EXECUTION_TYPES.INSTALL,

    environment,

    cancellationToken
  });
}

/* ============================================================
   BUILD COMMAND
============================================================ */

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
    typeof command !==
      "string" ||
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
   FAILURE CLASSIFICATION
============================================================ */

function classifyExecutionFailure(
  result
) {
  if (!result) {
    return "unknown";
  }

  if (
    result.timedOut ||
    result.status ===
      "timeout"
  ) {
    return "timeout";
  }

  if (
    result.resourceViolation ||
    result.status ===
      "resource-limit"
  ) {
    return "resource";
  }

  if (
    result.status ===
      "cancelled"
  ) {
    return "cancelled";
  }

  if (
    result.exitCode === 127
  ) {
    return "missing-module";
  }

  if (
    result.exitCode === 126
  ) {
    return "permission";
  }

  const combined =
    `${result.stderr || ""}\n${result.stdout || ""}`
      .toLowerCase();

  if (
    combined.includes(
      "network"
    ) ||
    combined.includes(
      "eai_again"
    ) ||
    combined.includes(
      "enotfound"
    )
  ) {
    return "network";
  }

  if (
    combined.includes(
      "syntaxerror"
    ) ||
    combined.includes(
      "unexpected token"
    )
  ) {
    return "syntax";
  }

  if (
    combined.includes(
      "cannot find module"
    ) ||
    combined.includes(
      "module not found"
    )
  ) {
    return "missing-module";
  }

  if (
    combined.includes(
      "permission denied"
    )
  ) {
    return "permission";
  }

  if (
    combined.includes(
      "no space left"
    )
  ) {
    return "resource";
  }

  if (
    combined.includes(
      "npm err"
    ) ||
    combined.includes(
      "dependency"
    )
  ) {
    return "dependency";
  }

  return "build";
}

function buildRepairContext(
  stage,
  category,
  result
) {
  return {
    required:
      true,

    failureStage:
      stage,

    failureCategory:
      category,

    affectedFiles:
      [],

    errors: [
      {
        message:
          normalizeString(
            result?.error?.message ||
              result?.error ||
              result?.stderr ||
              "Execution failed",
            4000
          )
      }
    ],

    stdout:
      normalizeString(
        result?.stdout,
        20000
      ),

    stderr:
      normalizeString(
        result?.stderr,
        20000
      ),

    exitCode:
      result?.exitCode ??
      null,

    signal:
      result?.signal ||
      "",

    timedOut:
      Boolean(
        result?.timedOut
      ),

    resourceViolation:
      result?.resourceViolation ||
      null,

    retryable:
      category === "timeout" ||
      category === "resource" ||
      category === "network"
  };
}

/* ============================================================
   SOURCE HASH
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
        chunk =>
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

async function calculateWorkspaceSourceHash(
  workspacePath
) {
  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

  const hash =
    crypto.createHash(
      "sha256"
    );

  async function walk(
    directory
  ) {
    const entries =
      await fsp.readdir(
        directory,
        {
          withFileTypes:
            true
        }
      );

    entries.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

    for (
      const entry of
        entries
    ) {
      if (
        entry.name ===
          ".git" ||
        entry.name ===
          "node_modules" ||
        entry.name ===
          ".zyrionos"
      ) {
        continue;
      }

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
        entry.isDirectory()
      ) {
        await walk(
          absolute
        );
      } else if (
        entry.isFile()
      ) {
        hash.update(
          relative
        );

        hash.update(
          "\0"
        );

        hash.update(
          await fsp.readFile(
            absolute
          )
        );

        hash.update(
          "\0"
        );
      }
    }
  }

  await walk(
    workspace
  );

  return hash.digest(
    "hex"
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
   ARTIFACT CREATION
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

async function createArtifact({
  workspacePath,

  limits =
    DEFAULT_LIMITS,

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

  if (
    outputDirectory
  ) {
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
      created:
        false,

      verified:
        false,

      error:
        "Artifact source directory does not exist"
    };
  }

  const artifactId =
    createId(
      "artifact"
    );

  const archivePath =
    assertPathInside(
      path.join(
        filesystem.artifactDirectory,
        `${artifactId}.tar.gz`
      ),
      filesystem.workspace
    );

  const tarArguments = [
    "-czf",
    archivePath,

    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=.env",
    "--exclude=.env.*",
    "--exclude=.zyrionos/artifacts",

    "-C",
    sourceRoot,

    "."
  ];

  let tarResult;

  try {
    const startedAt =
      new Date();

    const {
      stdout,
      stderr
    } =
      await execFileAsync(
        "tar",
        tarArguments,
        {
          cwd:
            filesystem.workspace,

          timeout:
            normalizedLimits.timeoutMs,

          windowsHide:
            true,

          maxBuffer:
            normalizedLimits.maxOutputBytes
        }
      );

    tarResult = {
      success:
        true,

      status:
        "success",

      stdout:
        redactSecrets(
          stdout
        ),

      stderr:
        redactSecrets(
          stderr
        ),

      startedAt,

      completedAt:
        new Date()
    };
  } catch (error) {
    return {
      created:
        false,

      verified:
        false,

      artifactId,

      execution: {
        success:
          false,

        status:
          "failed",

        error:
          safeError(
            error
          ),

        stdout:
          redactSecrets(
            error.stdout ||
              ""
          ),

        stderr:
          redactSecrets(
            error.stderr ||
              ""
          )
      }
    };
  }

  if (
    !fs.existsSync(
      archivePath
    )
  ) {
    return {
      created:
        false,

      verified:
        false,

      artifactId,

      execution:
        tarResult,

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
      created:
        false,

      verified:
        false,

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
      created:
        false,

      verified:
        false,

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
    created:
      true,

    verified,

    authoritative:
      true,

    validationMode:
      "authoritative",

    artifactId,

    name:
      path.basename(
        archivePath
      ),

    path:
      archivePath,

    size:
      stats.size,

    checksum,

    type:
      "archive",

    storageKey:
      archivePath,

    execution:
      tarResult
  };
}

/* ============================================================
   AUTHORITATIVE BUILD
============================================================ */

async function executeBuild({
  workspacePath,

  buildCommand = "",

  packageManager = "",

  nodeVersion = "20",

  installDependenciesFirst =
    true,

  installNetworkPolicy =
    NETWORK_POLICIES.BRIDGE,

  buildNetworkPolicy =
    NETWORK_POLICIES.NONE,

  limits =
    DEFAULT_LIMITS,

  environment = {},

  attemptId = null,

  runId = null,

  cancellationToken =
    null,

  outputDirectory = "",

  useLegacyAuthoritativeService =
    false,

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

  if (
    useLegacyAuthoritativeService &&
    legacyOptions &&
    typeof
      legacyOptions.executeBuild ===
      "function"
  ) {
    const legacyResult =
      await legacyOptions.executeBuild({
        ...legacyOptions,

        workspacePath:
          filesystem.workspace,

        engineeringExecutor:
          true
      });

    return normalizeLegacyBuildResult(
      legacyResult
    );
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

  let installation =
    null;

  if (
    installDependenciesFirst
  ) {
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

        environment,

        cancellationToken
      });

    if (
      !installation.success
    ) {
      return {
        success:
          false,

        status:
          installation.status ||
          "failed",

        authoritative:
          true,

        validationMode:
          "authoritative",

        type:
          EXECUTION_TYPES.BUILD,

        stage:
          "dependency-install",

        command,

        packageManager:
          installation.packageManager ||
          packageManager,

        installResult:
          installation,

        repairContext:
          buildRepairContext(
            "dependency-install",
            "dependency",
            installation
          )
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

      environment,

      cancellationToken
    });

  if (
    !execution.success
  ) {
    return {
      success:
        false,

      status:
        execution.status,

      authoritative:
        true,

      validationMode:
        "authoritative",

      type:
        EXECUTION_TYPES.BUILD,

      stage:
        "build",

      execution,

      installation,

      buildCommand:
        command,

      repairContext:
        buildRepairContext(
          "build",
          classifyExecutionFailure(
            execution
          ),
          execution
        )
    };
  }

  const artifact =
    await createArtifact({
      workspacePath:
        filesystem.workspace,

      limits:
        normalizedLimits,

      outputDirectory
    });

  if (
    !artifact.created ||
    !artifact.verified
  ) {
    return {
      success:
        false,

      status:
        "failed",

      authoritative:
        true,

      validationMode:
        "authoritative",

      type:
        EXECUTION_TYPES.BUILD,

      stage:
        "artifact-verification",

      execution,

      installation,

      artifact,

      repairContext:
        buildRepairContext(
          "artifact-verification",
          "artifact",
          artifact
        )
    };
  }

  const sourceHash =
    await calculateWorkspaceSourceHash(
      filesystem.workspace
    );

  const result = {
    success:
      true,

    status:
      "success",

    authoritative:
      true,

    validationMode:
      "authoritative",

    type:
      EXECUTION_TYPES.BUILD,

    buildId:
      createId(
        "eng-build"
      ),

    runId,

    attemptId,

    sourceHash,

    buildCommand:
      command,

    packageManager:
      packageManager ||
      detectPackageManager(
        filesystem.workspace
      ),

    nodeVersion,

    execution,

    installation,

    artifact: {
      ...artifact,

      authoritative:
        true,

      validationMode:
        "authoritative"
    },

    filesystem:
      filesystem.policy,

    evidence: {
      dependenciesInstalled:
        installation
          ? Boolean(
              !installation.skipped &&
              installation.success
            )
          : false,

      installationSkipped:
        Boolean(
          installation?.skipped
        ),

      buildCommandExecuted:
        Boolean(
          execution.success
        ),

      generatedCodeExecuted:
        Boolean(
          execution.success
        ),

      dockerExecuted:
        Boolean(
          execution.evidence
            ?.dockerExecuted
        ),

      artifactCreated:
        Boolean(
          artifact.created
        ),

      artifactVerified:
        Boolean(
          artifact.verified
        ),

      runtimeStarted:
        false,

      browserSmokeTested:
        false
    }
  };

  await persistAuthoritativeEvidence(
    runId,
    attemptId,
    result
  );

  return result;
}

/* ============================================================
   LEGACY RESULT NORMALIZATION
============================================================ */

function normalizeLegacyBuildResult(
  result
) {
  if (!result) {
    return {
      success:
        false,

      status:
        "failed",

      authoritative:
        true,

      validationMode:
        "authoritative",

      stage:
        "legacy-authoritative-build",

      error:
        "Legacy authoritative build returned no result"
    };
  }

  const artifact =
    result.artifact;

  const artifactEvidence =
    artifact &&
    (artifact.storageKey ||
      artifact.path) &&
    (artifact.checksum ||
      artifact.sha256);

  const success =
    result.success === true &&
    result.authoritative ===
      true &&
    Boolean(
      result.buildId
    ) &&
    Boolean(
      artifactEvidence
    );

  return {
    ...result,

    success,

    status:
      success
        ? "success"
        : "failed",

    authoritative:
      true,

    validationMode:
      "authoritative",

    executionMode:
      "legacy-authoritative-adapter"
  };
}

/* ============================================================
   GENERIC COMMAND
============================================================ */

async function executeCommand({
  workspacePath,

  command,

  type =
    EXECUTION_TYPES.PROCESS,

  nodeVersion = "20",

  networkPolicy =
    DEFAULT_NETWORK_POLICY,

  limits =
    DEFAULT_LIMITS,

  environment = {},

  docker = true,

  allowDevelopmentProcess =
    false,

  cancellationToken =
    null
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

      environment,

      cancellationToken
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

    maxErrorBytes:
      normalizedLimits.maxErrorBytes,

    gracePeriodMs:
      normalizedLimits.gracePeriodMs,

    resourceSampleMs:
      normalizedLimits.resourceSampleMs,

    cpuCores:
      normalizedLimits.cpuCores,

    memoryMB:
      normalizedLimits.memoryMB,

    diskMB:
      normalizedLimits.diskMB,

    allowDevelopmentProcess,

    cancellationToken
  });
}

/* ============================================================
   RUNTIME
============================================================ */

async function executeRuntime({
  workspacePath,

  command,

  nodeVersion = "20",

  networkPolicy =
    NETWORK_POLICIES.NONE,

  limits =
    DEFAULT_LIMITS,

  environment = {},

  docker = true,

  cancellationToken =
    null
}) {
  const normalizedLimits =
    normalizeLimits(
      limits
    );

  return executeCommand({
    workspacePath,

    command,

    type:
      EXECUTION_TYPES.RUNTIME,

    nodeVersion,

    networkPolicy,

    limits: {
      ...normalizedLimits,

      timeoutMs:
        normalizedLimits.runtimeTimeoutMs
    },

    environment,

    docker,

    allowDevelopmentProcess:
      true,

    cancellationToken
  });
}

/* ============================================================
   TCP READINESS
============================================================ */

async function waitForPort({
  host,

  port,

  timeoutMs,

  intervalMs
}) {
  const started =
    Date.now();

  while (
    Date.now() -
      started <
    timeoutMs
  ) {
    const connected =
      await new Promise(
        resolve => {
          const socket =
            new net.Socket();

          socket.setTimeout(
            Math.min(
              intervalMs,
              2000
            )
          );

          socket.once(
            "connect",
            () => {
              socket.destroy();
              resolve(true);
            }
          );

          socket.once(
            "timeout",
            () => {
              socket.destroy();
              resolve(false);
            }
          );

          socket.once(
            "error",
            () => {
              socket.destroy();
              resolve(false);
            }
          );

          socket.connect(
            port,
            host
          );
        }
      );

    if (connected) {
      return true;
    }

    await sleep(
      intervalMs
    );
  }

  return false;
}

/* ============================================================
   PREVIEW
 *
 * IMPORTANT:
 * A long-running preview process cannot be treated like a
 * normal finite build process. Docker execution therefore
 * remains the authoritative process lifecycle.
 *
 * The readiness probe is used only when the supplied command
 * terminates successfully.
============================================================ */

async function executePreview({
  workspacePath,

  command,

  nodeVersion = "20",

  networkPolicy =
    NETWORK_POLICIES.BRIDGE,

  limits =
    DEFAULT_LIMITS,

  environment = {},

  docker = true,

  readiness = null,

  cancellationToken =
    null
}) {
  const normalizedLimits =
    normalizeLimits(
      limits
    );

  const execution =
    await executeCommand({
      workspacePath,

      command,

      type:
        EXECUTION_TYPES.PREVIEW,

      nodeVersion,

      networkPolicy,

      limits: {
        ...normalizedLimits,

        timeoutMs:
          normalizedLimits.previewTimeoutMs
      },

      environment,

      docker,

      allowDevelopmentProcess:
        true,

      cancellationToken
    });

  if (
    !execution.success ||
    !readiness
  ) {
    return execution;
  }

  if (
    readiness.port
  ) {
    const ready =
      await waitForPort({
        host:
          readiness.host ||
          "127.0.0.1",

        port:
          Number(
            readiness.port
          ),

        timeoutMs:
          readiness.timeoutMs ||
          normalizedLimits.readinessTimeoutMs,

        intervalMs:
          readiness.intervalMs ||
          normalizedLimits.readinessIntervalMs
      });

    const readinessResult = {
      type:
        "tcp",

      host:
        readiness.host ||
        "127.0.0.1",

      port:
        Number(
          readiness.port
        ),

      ready
    };

    if (!ready) {
      return {
        ...execution,

        success:
          false,

        status:
          "readiness-failed",

        readiness:
          readinessResult,

        repairContext:
          buildRepairContext(
            "preview-readiness",
            "runtime",
            execution
          )
      };
    }

    return {
      ...execution,

      readiness:
        readinessResult,

      evidence: {
        ...(execution.evidence ||
          {}),

        previewReady:
          true
      }
    };
  }

  return execution;
}

/* ============================================================
   TESTS
============================================================ */

async function executeTests({
  workspacePath,

  command,

  nodeVersion = "20",

  networkPolicy =
    NETWORK_POLICIES.NONE,

  limits =
    DEFAULT_LIMITS,

  environment = {},

  docker = true,

  cancellationToken =
    null
}) {
  const normalizedLimits =
    normalizeLimits(
      limits
    );

  return executeCommand({
    workspacePath,

    command,

    type:
      EXECUTION_TYPES.TEST,

    nodeVersion,

    networkPolicy,

    limits: {
      ...normalizedLimits,

      timeoutMs:
        normalizedLimits.testTimeoutMs
    },

    environment,

    docker,

    cancellationToken
  });
}

/* ============================================================
   CHECKPOINT
============================================================ */

async function createCheckpoint({
  runId = null,

  attemptId = null,

  workspacePath,

  label =
    "engineering-checkpoint"
}) {
  if (!engineeringState) {
    return {
      success:
        false,

      persisted:
        false,

      error:
        "Engineering state is unavailable"
    };
  }

  const filesystem =
    await prepareFilesystemIsolation(
      workspacePath
    );

  const sourceHash =
    await calculateWorkspaceSourceHash(
      filesystem.workspace
    );

  const checkpointId =
    createId(
      "checkpoint"
    );

  const archivePath =
    assertPathInside(
      path.join(
        filesystem.metadataDirectory,
        `${checkpointId}.tar.gz`
      ),
      filesystem.workspace
    );

  const args = [
    "-czf",
    archivePath,

    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=.zyrionos/artifacts",

    "-C",
    filesystem.workspace,

    "."
  ];

  await execFileAsync(
    "tar",
    args,
    {
      cwd:
        filesystem.workspace,

      timeout:
        DEFAULT_LIMITS.timeoutMs,

      windowsHide:
        true
    }
  );

  const stats =
    await fsp.stat(
      archivePath
    );

  if (
    !stats.isFile() ||
    stats.size <= 0
  ) {
    throw new Error(
      "Checkpoint archive was not created correctly"
    );
  }

  const checksum =
    await calculateSha256(
      archivePath
    );

  const create =
    engineeringState.createCheckpoint ||
    engineeringState.createCheckpointRecord;

  if (
    typeof create !==
    "function"
  ) {
    throw new Error(
      "Checkpoint API is unavailable"
    );
  }

  if (!runId) {
    throw new Error(
      "runId is required to persist checkpoint"
    );
  }

  const payload = {
    attemptId,

    checkpointId,

    label,

    sourceHash,

    storageKey:
      archivePath,

    path:
      archivePath,

    checksum,

    size:
      stats.size,

    artifact: {
      storageKey:
        archivePath,

      path:
        archivePath,

      checksum,

      size:
        stats.size
    },

    state:
      "checkpointed",

    valid:
      true
  };

  const record =
    await create.call(
      engineeringState,
      runId,
      payload
    );

  return {
    success:
      true,

    persisted:
      true,

    checkpointId,

    sourceHash,

    storageKey:
      archivePath,

    path:
      archivePath,

    checksum,

    size:
      stats.size,

    record
  };
}

/* ============================================================
   ROLLBACK
============================================================ */

async function rollbackToCheckpoint({
  runId = null,

  workspacePath,

  checkpoint,

  attemptId = null
}) {
  if (!checkpoint) {
    throw new Error(
      "checkpoint is required"
    );
  }

  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

  const archivePath =
    checkpoint.storageKey ||
    checkpoint.path;

  if (!archivePath) {
    throw new Error(
      "Checkpoint storage path is missing"
    );
  }

  assertPathInside(
    archivePath,
    workspace
  );

  if (
    !fs.existsSync(
      archivePath
    )
  ) {
    throw new Error(
      "Checkpoint archive does not exist"
    );
  }

  if (
    checkpoint.checksum
  ) {
    const actualChecksum =
      await calculateSha256(
        archivePath
      );

    if (
      actualChecksum !==
      checkpoint.checksum
    ) {
      throw new Error(
        "Checkpoint checksum verification failed"
      );
    }
  }

  const rollbackDirectory =
    path.join(
      workspace,
      ".zyrionos",
      `rollback-${crypto
        .randomBytes(6)
        .toString("hex")}`
    );

  await ensureDirectory(
    rollbackDirectory
  );

  try {
    await execFileAsync(
      "tar",
      [
        "-xzf",
        archivePath,
        "-C",
        rollbackDirectory
      ],
      {
        timeout:
          DEFAULT_LIMITS.timeoutMs,

        windowsHide:
          true
      }
    );

    const currentEntries =
      await fsp.readdir(
        workspace,
        {
          withFileTypes:
            true
        }
      );

    for (
      const entry of
        currentEntries
    ) {
      if (
        entry.name ===
        ".zyrionos"
      ) {
        continue;
      }

      await fsp.rm(
        path.join(
          workspace,
          entry.name
        ),
        {
          recursive:
            true,

          force:
            true
        }
      );
    }

    const restoredEntries =
      await fsp.readdir(
        rollbackDirectory,
        {
          withFileTypes:
            true
        }
      );

    for (
      const entry of
        restoredEntries
    ) {
      await fsp.rename(
        path.join(
          rollbackDirectory,
          entry.name
        ),
        path.join(
          workspace,
          entry.name
        )
      );
    }

    const sourceHash =
      await calculateWorkspaceSourceHash(
        workspace
      );

    if (
      checkpoint.sourceHash &&
      sourceHash !==
        checkpoint.sourceHash
    ) {
      throw new Error(
        "Rollback source hash verification failed"
      );
    }

    if (
      engineeringState &&
      typeof
        engineeringState.recordRollback ===
        "function"
    ) {
      if (!runId) {
        throw new Error(
          "runId is required to persist rollback"
        );
      }

      await engineeringState.recordRollback(
        runId,
        {
          attemptId,

          checkpointId:
            checkpoint.checkpointId,

          success:
            true,

          sourceHash,

          storageKey:
            archivePath,

          checksum:
            checkpoint.checksum ||
            null
        }
      );
    }

    return {
      success:
        true,

      checkpointId:
        checkpoint.checkpointId,

      sourceHash
    };
  } finally {
    await fsp.rm(
      rollbackDirectory,
      {
        recursive:
          true,

        force:
          true
      }
    );
  }
}

/* ============================================================
   STATE INTEGRATION
============================================================ */

async function persistExecutionRecord({
  runId = null,

  attemptId = null,

  result
}) {
  if (
    !engineeringState ||
    !result
  ) {
    return null;
  }

  const create =
    engineeringState.recordExecution ||
    engineeringState.createExecutionRecord;

  if (
    typeof create !==
    "function"
  ) {
    return null;
  }

  if (!runId) {
    return {
      persisted:
        false,

      error:
        "runId is required for execution persistence"
    };
  }

  try {
    const payload = {
      attemptId,

      executionId:
        result.executionId ||
        null,

      type:
        result.type ||
        EXECUTION_TYPES.PROCESS,

      command:
        result.command ||
        "",

      workingDirectory:
        result.cwd ||
        "",

      status:
        result.status ||
        "failed",

      success:
        Boolean(
          result.success
        ),

      authoritative:
        result.authoritative ===
        true,

      validationMode:
        result.validationMode ||
        (
          result.authoritative ===
          true
            ? "authoritative"
            : "unknown"
        ),

      exitCode:
        result.exitCode ??
        null,

      signal:
        result.signal ||
        "",

      timedOut:
        Boolean(
          result.timedOut
        ),

      cancelled:
        Boolean(
          result.cancelled
        ),

      startedAt:
        result.startedAt,

      completedAt:
        result.completedAt,

      stdout:
        normalizeString(
          result.stdout,
          20000
        ),

      stderr:
        normalizeString(
          result.stderr,
          20000
        ),

      resourceSnapshot:
        result.finalResourceSnapshot ||
        {},

      resourceViolation:
        result.resourceViolation ||
        null,

      evidence:
        result.evidence ||
        {},

      error:
        result.error ||
        null
    };

    /*
     * engineeringState v1.4.0 contract:
     * recordExecution(runId, payload)
     */
    return await create.call(
      engineeringState,
      runId,
      payload
    );
  } catch (error) {
    return {
      persisted:
        false,

      error:
        normalizeString(
          error.message,
          1000
        )
    };
  }
}

async function persistAuthoritativeEvidence(
  runId,
  attemptId,
  result
) {
  if (
    !runId ||
    !engineeringState ||
    !result
  ) {
    return null;
  }

  const executionResult =
    await persistExecutionRecord({
      runId,

      attemptId,

      result: {
        ...(
          result.execution ||
          {}
        ),

        type:
          EXECUTION_TYPES.BUILD,

        command:
          result.buildCommand,

        authoritative:
          true,

        validationMode:
          "authoritative"
      }
    });

  if (
    result.artifact &&
    typeof
      engineeringState.recordArtifact ===
      "function"
  ) {
    try {
      await engineeringState.recordArtifact(
        runId,
        {
          attemptId,

          artifactId:
            result.artifact.artifactId,

          name:
            result.artifact.name,

          path:
            result.artifact.path,

          storageKey:
            result.artifact.storageKey,

          checksum:
            result.artifact.checksum,

          size:
            result.artifact.size,

          type:
            result.artifact.type ||
            "archive",

          verified:
            result.artifact.verified ===
            true,

          authoritative:
            true,

          validationMode:
            "authoritative"
        }
      );
    } catch (_) {}
  }

  return executionResult;
}

/* ============================================================
   RESOURCE API
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
   CLEANUP
============================================================ */

async function cleanupWorkspaceMetadata(
  workspacePath
) {
  const workspace =
    normalizeWorkspacePath(
      workspacePath
    );

  const artifactDirectory =
    assertPathInside(
      path.join(
        workspace,
        ".zyrionos",
        "artifacts"
      ),
      workspace
    );

  await fsp.rm(
    artifactDirectory,
    {
      recursive:
        true,

      force:
        true
    }
  );

  await ensureDirectory(
    artifactDirectory
  );

  return {
    success:
      true
  };
}

/* ============================================================
   HIGH-LEVEL EXECUTE
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

  limits =
    DEFAULT_LIMITS,

  environment = {},

  outputDirectory = "",

  attemptId = null,

  runId = null,

  cancellationToken = null,

  useLegacyAuthoritativeService =
    false,

  legacyOptions = {}
}) {
  let result;

  switch (type) {
    case EXECUTION_TYPES.INSTALL:
      result =
        await installDependencies({
          workspacePath,

          packageManager,

          nodeVersion,

          networkPolicy:
            installNetworkPolicy,

          limits,

          environment,

          cancellationToken
        });

      break;

    case EXECUTION_TYPES.BUILD:
      result =
        await executeBuild({
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

          attemptId,

          runId,

          cancellationToken,

          outputDirectory,

          useLegacyAuthoritativeService,

          legacyOptions
        });

      break;

    case EXECUTION_TYPES.RUNTIME:
      result =
        await executeRuntime({
          workspacePath,

          command,

          nodeVersion,

          networkPolicy,

          limits,

          environment,

          cancellationToken
        });

      break;

    case EXECUTION_TYPES.PREVIEW:
      result =
        await executePreview({
          workspacePath,

          command,

          nodeVersion,

          networkPolicy,

          limits,

          environment,

          cancellationToken
        });

      break;

    case EXECUTION_TYPES.TEST:
      result =
        await executeTests({
          workspacePath,

          command,

          nodeVersion,

          networkPolicy,

          limits,

          environment,

          cancellationToken
        });

      break;

    case EXECUTION_TYPES.PROCESS:
      result =
        await executeCommand({
          workspacePath,

          command,

          type,

          nodeVersion,

          networkPolicy,

          limits,

          environment,

          cancellationToken
        });

      break;

    case EXECUTION_TYPES.ARTIFACT:
      result =
        await createArtifact({
          workspacePath,

          limits,

          outputDirectory
        });

      break;

    default:
      throw new Error(
        `Unsupported execution type: ${type}`
      );
  }

  /*
   * Build execution already persists its authoritative
   * execution + artifact evidence as one evidence transaction.
   *
   * Avoid duplicate execution records for builds.
   */
  if (
    attemptId &&
    type !==
      EXECUTION_TYPES.ARTIFACT &&
    type !==
      EXECUTION_TYPES.BUILD
  ) {
    await persistExecutionRecord({
      runId,

      attemptId,

      result
    });
  }

  return result;
}

/* ============================================================
   HEALTH
============================================================ */

function health() {
  return {
    healthy:
      true,

    service:
      "engineeringExecutor",

    version:
      SERVICE_VERSION,

    executionMode:
      EXECUTION_MODE,

    authoritative:
      AUTHORITATIVE,

    dockerRequiredForBuild:
      true,

    stateAvailable:
      Boolean(
        engineeringState
      ),

    stateVersion:
      engineeringState?.SERVICE_VERSION ||
      null,

    stateSchemaVersion:
      engineeringState?.SCHEMA_VERSION ||
      null,

    limits:
      DEFAULT_LIMITS,

    effectiveStateResourceLimits:
      getStateResourceLimits(),

    networkPolicies:
      NETWORK_POLICIES
  };
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

  normalizeWorkspacePath,

  assertPathInside,

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

  calculateWorkspaceSourceHash,

  verifyArtifact,

  createCheckpoint,

  rollbackToCheckpoint,

  measureProcess,

  measureContainer,

  cleanupWorkspaceMetadata,

  persistExecutionRecord,

  persistAuthoritativeEvidence,

  terminateProcessTree,

  resolveNodeImage,

  buildDockerArguments,

  execute,

  health
};
