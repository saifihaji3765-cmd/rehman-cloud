/*
 * ZYRIONOS — ENGINEERING AGENT
 * Version: 2.1.0
 *
 * SINGLE ENGINEERING CONTROL PLANE
 *
 * Master Agent
 *      ↓
 * Engineering Agent
 *      ├── State
 *      ├── Execution
 *      ├── Intelligence
 *      ├── Diagnosis
 *      ├── Repair
 *      ├── Retry
 *      ├── Checkpoint
 *      ├── Rollback
 *      ├── Verification
 *      ├── Build Validation
 *      ├── Artifact
 *      ├── Promotion
 *      └── Escalation
 *
 * Engineering Agent is the ONLY engineering boundary.
 *
 * CommonJS
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

/* =========================================================
   CONSTANTS
========================================================= */

const VERSION = "2.1.0";
const AGENT_NAME = "engineeringAgent";

const STATES = Object.freeze({
  CREATED: "CREATED",
  ANALYZING: "ANALYZING",
  EXECUTING: "EXECUTING",
  FAILED: "FAILED",
  DIAGNOSING: "DIAGNOSING",
  REPAIRING: "REPAIRING",
  VERIFYING: "VERIFYING",
  PASSED: "PASSED",
  ROLLBACK: "ROLLBACK",
  ESCALATED: "ESCALATED",
  PROMOTED: "PROMOTED"
});

const TERMINAL_STATES = new Set([
  STATES.PROMOTED,
  STATES.ESCALATED
]);

const LIMITS = Object.freeze({
  maxAttempts: 5,
  maxRepairAttempts: 3,

  maxCheckpoints: 20,

  maxFiles: 5000,

  maxFileSize:
    5 * 1024 * 1024,

  maxTotalSourceSize:
    100 * 1024 * 1024,

  maxStdout:
    20000,

  maxStderr:
    30000,

  maxErrorLength:
    15000,

  installTimeoutMs:
    10 * 60 * 1000,

  buildTimeoutMs:
    15 * 60 * 1000,

  maxTotalExecutionMs:
    25 * 60 * 1000,

  maxRepairFiles:
    25,

  maxRepairFileSize:
    5 * 1024 * 1024,

  maxRepairSourceBytes:
    25 * 1024 * 1024,

  maxArtifactFileSize:
    500 * 1024 * 1024,

  maxArtifactTotalSize:
    500 * 1024 * 1024,

  maxArtifactFiles:
    20000,

  diagnosisAiTokens:
    2500,

  repairAiTokens:
    6500,

  maxRepairResponseChars:
    50000,

  killGraceMs:
    5000
});

const TRANSITIONS = Object.freeze({
  CREATED: new Set([
    STATES.ANALYZING,
    STATES.ESCALATED
  ]),

  ANALYZING: new Set([
    STATES.EXECUTING,
    STATES.FAILED,
    STATES.ESCALATED
  ]),

  EXECUTING: new Set([
    STATES.VERIFYING,
    STATES.FAILED,
    STATES.DIAGNOSING,
    STATES.ROLLBACK,
    STATES.ESCALATED
  ]),

  FAILED: new Set([
    STATES.DIAGNOSING,
    STATES.REPAIRING,
    STATES.ROLLBACK,
    STATES.ESCALATED,
    STATES.EXECUTING
  ]),

  DIAGNOSING: new Set([
    STATES.REPAIRING,
    STATES.EXECUTING,
    STATES.ROLLBACK,
    STATES.FAILED,
    STATES.ESCALATED
  ]),

  REPAIRING: new Set([
    STATES.EXECUTING,
    STATES.VERIFYING,
    STATES.FAILED,
    STATES.ROLLBACK,
    STATES.ESCALATED
  ]),

  VERIFYING: new Set([
    STATES.PASSED,
    STATES.FAILED,
    STATES.REPAIRING,
    STATES.ROLLBACK,
    STATES.ESCALATED
  ]),

  PASSED: new Set([
    STATES.PROMOTED
  ]),

  ROLLBACK: new Set([
    STATES.EXECUTING,
    STATES.DIAGNOSING,
    STATES.ESCALATED
  ]),

  ESCALATED: new Set(),

  PROMOTED: new Set()
});

/* =========================================================
   OPTIONAL DEPENDENCIES
========================================================= */

function optionalRequire(modulePath) {
  try {
    return require(modulePath);
  } catch {
    return null;
  }
}

const logger = optionalRequire(
  "../services/loggerService"
);

const aiProvider = optionalRequire(
  "../services/ai/aiProviderService"
);

/* =========================================================
   BASIC HELPERS
========================================================= */

function now() {
  return new Date().toISOString();
}

function cleanString(
  value,
  max = 10000
) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function safeError(error) {
  if (!error) {
    return {
      message:
        "Unknown engineering error",

      name:
        "Error",

      code:
        "",

      stack:
        ""
    };
  }

  return {
    message:
      cleanString(
        error.message ||
          String(error),
        LIMITS.maxErrorLength
      ),

    name:
      cleanString(
        error.name ||
          "Error",
        200
      ),

    code:
      cleanString(
        error.code ||
          "",
        200
      ),

    stack:
      cleanString(
        error.stack ||
          "",
        LIMITS.maxErrorLength
      )
  };
}

function hashBuffer(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function hashString(value) {
  return hashBuffer(
    Buffer.from(
      String(value),
      "utf8"
    )
  );
}

function generateId(prefix) {
  return (
    `${prefix}_` +
    `${Date.now()}_` +
    crypto
      .randomBytes(8)
      .toString("hex")
  );
}

function clone(value) {
  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

function truncate(
  value,
  max
) {
  const text =
    String(value ?? "");

  if (
    text.length <= max
  ) {
    return text;
  }

  return (
    text.slice(0, max) +
    "\n...[truncated]"
  );
}

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}

/* =========================================================
   LOGGING
========================================================= */

/*
 * IMPORTANT:
 * Some logger implementations serialize metadata poorly.
 * Therefore important diagnostic evidence is also encoded
 * into the message itself.
 */

function stringifyLogData(
  data
) {
  if (
    data === undefined ||
    data === null
  ) {
    return "";
  }

  try {
    return JSON.stringify(
      data
    );
  } catch {
    return String(data);
  }
}

function emitLog(
  level,
  message,
  data
) {
  const suffix =
    data !== undefined &&
    data !== null
      ? ` | ${stringifyLogData(
          data
        )}`
      : "";

  const finalMessage =
    `${message}${suffix}`;

  try {
    if (
      logger &&
      typeof logger[level] ===
        "function"
    ) {
      logger[level](
        finalMessage
      );

      return;
    }
  } catch {}

  if (
    level === "error"
  ) {
    console.error(
      finalMessage
    );
    return;
  }

  if (
    level === "warning" ||
    level === "warn"
  ) {
    console.warn(
      finalMessage
    );
    return;
  }

  console.log(
    finalMessage
  );
}

function logInfo(
  message,
  data
) {
  emitLog(
    "info",
    message,
    data
  );
}

function logSuccess(
  message,
  data
) {
  /*
   * Some logger services expose success(),
   * some do not.
   */
  try {
    if (
      logger &&
      typeof logger.success ===
        "function"
    ) {
      logger.success(
        data !== undefined
          ? `${message} | ${stringifyLogData(
              data
            )}`
          : message
      );

      return;
    }
  } catch {}

  emitLog(
    "info",
    `[SUCCESS] ${message}`,
    data
  );
}

function logWarning(
  message,
  data
) {
  if (
    logger &&
    typeof logger.warning ===
      "function"
  ) {
    emitLog(
      "warning",
      message,
      data
    );
    return;
  }

  emitLog(
    "warning",
    message,
    data
  );
}

function logError(
  message,
  data
) {
  emitLog(
    "error",
    message,
    data
  );
}

/* =========================================================
   FILE NORMALIZATION
========================================================= */

function normalizeRelativePath(
  rawPath
) {
  const value =
    cleanString(
      rawPath,
      1000
    )
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\/+/,
        ""
      );

  if (!value) {
    throw new Error(
      "Project file path is empty"
    );
  }

  if (
    value.includes("\0") ||
    path.isAbsolute(value)
  ) {
    throw new Error(
      `Unsafe project file path: ${value}`
    );
  }

  const segments =
    value.split("/");

  if (
    segments.some(
      segment =>
        segment === ".."
    )
  ) {
    throw new Error(
      `Unsafe project file path: ${value}`
    );
  }

  return value;
}

function normalizeFile(raw) {
  if (
    !raw ||
    typeof raw !==
      "object"
  ) {
    return null;
  }

  const filePath =
    normalizeRelativePath(
      raw.path ||
        raw.name
    );

  const content =
    raw.content ===
      undefined ||
    raw.content ===
      null
      ? ""
      : String(
          raw.content
        );

  const size =
    Buffer.byteLength(
      content,
      "utf8"
    );

  if (
    size >
    LIMITS.maxFileSize
  ) {
    throw new Error(
      `File exceeds maximum allowed size: ${filePath}`
    );
  }

  return {
    path:
      filePath,

    name:
      cleanString(
        raw.name ||
          path.basename(
            filePath
          ),
        200
      ),

    content,

    language:
      cleanString(
        raw.language ||
          "",
        50
      ),

    type:
      cleanString(
        raw.type ||
          "file",
        50
      ),

    isEntryPoint:
      Boolean(
        raw.isEntryPoint
      ),

    isGenerated:
      raw.isGenerated ===
      undefined
        ? true
        : Boolean(
            raw.isGenerated
          ),

    size
  };
}

function normalizeFiles(
  files
) {
  if (
    !Array.isArray(files)
  ) {
    return [];
  }

  if (
    files.length >
    LIMITS.maxFiles
  ) {
    throw new Error(
      `Project contains too many files. Maximum: ${LIMITS.maxFiles}`
    );
  }

  const result = [];
  const seen = new Set();

  let totalSize = 0;

  for (
    const raw of files
  ) {
    const file =
      normalizeFile(
        raw
      );

    if (!file) {
      continue;
    }

    if (
      seen.has(
        file.path
      )
    ) {
      throw new Error(
        `Duplicate project file: ${file.path}`
      );
    }

    seen.add(
      file.path
    );

    totalSize +=
      file.size;

    if (
      totalSize >
      LIMITS.maxTotalSourceSize
    ) {
      throw new Error(
        "Project source exceeds maximum allowed size"
      );
    }

    result.push(
      file
    );
  }

  return result;
}

/* =========================================================
   PACKAGE MANAGER
========================================================= */

function detectPackageManager(
  files
) {
  const paths =
    new Set(
      files.map(
        file =>
          file.path
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

  return "npm";
}

/* =========================================================
   JOB NORMALIZATION
========================================================= */

function normalizeJob(
  input = {}
) {
  const files =
    normalizeFiles(
      input.files ||
        input.project?.files ||
        input.build?.files ||
        []
    );

  const projectId =
    cleanString(
      input.projectId ||
        input.project?.id ||
        "local-project",
      200
    );

  const userId =
    cleanString(
      input.userId ||
        input.user?.id ||
        "system",
      200
    );

  const workspacePath =
    cleanString(
      input.workspacePath ||
        input.workspace ||
        "",
      2000
    );

  const projectName =
    cleanString(
      input.projectName ||
        input.project?.name ||
        "zyrionos-project",
      200
    );

  const packageManager =
    cleanString(
      input.packageManager ||
        detectPackageManager(
          files
        ),
      50
    );

  const buildCommand =
    cleanString(
      input.buildCommand ||
        input.project?.buildCommand ||
        `${packageManager} run build`,
      500
    );

  const installCommand =
    cleanString(
      input.installCommand ||
        input.project?.installCommand ||
        `${packageManager} install`,
      500
    );

  return {
    ...clone(input),

    jobId:
      cleanString(
        input.jobId ||
          generateId("job"),
        200
      ),

    projectId,

    userId,

    projectName,

    prompt:
      cleanString(
        input.prompt ||
          input.userPrompt ||
          "",
        12000
      ),

    framework:
      cleanString(
        input.framework ||
          input.project?.framework ||
          "",
        100
      ),

    packageManager,

    nodeVersion:
      cleanString(
        input.nodeVersion ||
          process.version,
        100
      ),

    buildCommand,

    installCommand,

    workspacePath,

    outputDirectory:
      cleanString(
        input.outputDirectory ||
          input.project?.outputDirectory ||
          "",
        500
      ),

    files,

    allowEmptyWorkspace:
      Boolean(
        input.allowEmptyWorkspace
      ),

    autoRepair:
      input.autoRepair !==
      false,

    allowNewFiles:
      Boolean(
        input.allowNewFiles
      ),

    maxAttempts:
      Math.min(
        Math.max(
          Number(
            input.maxAttempts
          ) ||
            LIMITS.maxAttempts,
          1
        ),
        LIMITS.maxAttempts
      )
  };
}

/* =========================================================
   INTERNAL STATE
========================================================= */

function createContext(
  job
) {
  return {
    runId:
      generateId("run"),

    buildId:
      null,

    job,

    state:
      STATES.CREATED,

    startedAt:
      now(),

    updatedAt:
      now(),

    transitions: [],

    attempts: [],

    failures: [],

    diagnoses: [],

    repairs: [],

    checkpoints: [],

    rollbacks: [],

    executions: [],

    verifications: [],

    artifacts: [],

    currentAttempt:
      0,

    repairAttempts:
      0,

    authoritative:
      false,

    verified:
      false,

    promoted:
      false,

    validationMode:
      null,

    workspacePath:
      job.workspacePath ||
      null,

    preflight:
      null,

    finalError:
      null,

    runStartedMs:
      Date.now()
  };
}

function transition(
  ctx,
  next,
  metadata = {}
) {
  const current =
    ctx.state;

  if (
    current === next
  ) {
    return;
  }

  const allowed =
    TRANSITIONS[
      current
    ];

  if (
    !allowed ||
    !allowed.has(next)
  ) {
    throw new Error(
      `Invalid engineering transition: ${current} → ${next}`
    );
  }

  ctx.state =
    next;

  ctx.updatedAt =
    now();

  ctx.transitions.push({
    from:
      current,

    to:
      next,

    timestamp:
      now(),

    metadata:
      clone(
        metadata
      )
  });

  logInfo(
    `Engineering State: ${current} → ${next}`,
    metadata
  );
}

/* =========================================================
   TIME BUDGET
========================================================= */

function remainingRunTime(
  ctx
) {
  return (
    LIMITS.maxTotalExecutionMs -
    (
      Date.now() -
      ctx.runStartedMs
    )
  );
}

function ensureRunBudget(
  ctx,
  requestedMs
) {
  const remaining =
    remainingRunTime(
      ctx
    );

  if (
    remaining <= 0
  ) {
    throw new Error(
      "Engineering total execution budget exceeded"
    );
  }

  return Math.min(
    requestedMs,
    remaining
  );
}

/* =========================================================
   WORKSPACE
========================================================= */

async function ensureWorkspace(
  ctx
) {
  if (
    ctx.workspacePath
  ) {
    await fsp.mkdir(
      ctx.workspacePath,
      {
        recursive:
          true
      }
    );

    return ctx.workspacePath;
  }

  const base =
    path.join(
      os.tmpdir(),
      "zyrionos-engineering"
    );

  await fsp.mkdir(
    base,
    {
      recursive:
        true
    }
  );

  ctx.workspacePath =
    await fsp.mkdtemp(
      path.join(
        base,
        `${ctx.job.projectId}-`
      )
    );

  return ctx.workspacePath;
}

function safeWorkspacePath(
  workspace,
  relativePath
) {
  const normalized =
    normalizeRelativePath(
      relativePath
    );

  const workspaceRoot =
    path.resolve(
      workspace
    );

  const resolved =
    path.resolve(
      workspaceRoot,
      normalized
    );

  const relative =
    path.relative(
      workspaceRoot,
      resolved
    );

  if (
    relative.startsWith(
      ".." +
        path.sep
    ) ||
    relative === ".." ||
    path.isAbsolute(
      relative
    )
  ) {
    throw new Error(
      `Workspace escape detected: ${relativePath}`
    );
  }

  return resolved;
}

async function writeSourceFiles(
  ctx
) {
  const workspace =
    await ensureWorkspace(
      ctx
    );

  for (
    const file of ctx.job.files
  ) {
    const target =
      safeWorkspacePath(
        workspace,
        file.path
      );

    await fsp.mkdir(
      path.dirname(
        target
      ),
      {
        recursive:
          true
      }
    );

    await fsp.writeFile(
      target,
      file.content,
      "utf8"
    );
  }

  return workspace;
}

/* =========================================================
   PREFLIGHT
========================================================= */

function validateCommand(
  command
) {
  const value =
    cleanString(
      command,
      500
    );

  if (!value) {
    throw new Error(
      "Engineering command is missing"
    );
  }

  const dangerousPatterns = [
    /\brm\s+-rf\s+\/(?:\s|$)/i,
    /\brm\s+-rf\s+--no-preserve-root/i,
    /\bmkfs(?:\.[a-z0-9]+)?\b/i,
    /\bdd\s+if=/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bpoweroff\b/i,
    /\bhalt\b/i,
    /\bmount\b/i,
    /\bumount\b/i,
    /\bkill\s+-9\s+1\b/i,
    /\bchmod\s+777\s+\/(?:\s|$)/i,
    /\bchown\s+.*\/(?:\s|$)/i
  ];

  for (
    const pattern of
      dangerousPatterns
  ) {
    if (
      pattern.test(
        value
      )
    ) {
      throw new Error(
        "Unsafe engineering command rejected"
      );
    }
  }

  return value;
}

function parsePackageJson(
  files
) {
  const packageFile =
    files.find(
      file =>
        file.path ===
        "package.json"
    );

  if (!packageFile) {
    return null;
  }

  try {
    return JSON.parse(
      packageFile.content
    );
  } catch (
    error
  ) {
    throw new Error(
      `Invalid package.json: ${error.message}`
    );
  }
}

async function preflight(
  ctx
) {
  const files =
    ctx.job.files;

  if (
    files.length === 0 &&
    !ctx.job.allowEmptyWorkspace
  ) {
    throw new Error(
      "Engineering job contains no project files"
    );
  }

  validateCommand(
    ctx.job.installCommand
  );

  validateCommand(
    ctx.job.buildCommand
  );

  const packageJson =
    parsePackageJson(
      files
    );

  const packageFiles =
    files.filter(
      file =>
        file.path ===
        "package.json"
    );

  if (
    packageFiles.length > 1
  ) {
    throw new Error(
      "Multiple package.json files detected"
    );
  }

  if (
    packageJson &&
    packageJson.scripts &&
    packageJson.scripts.build &&
    (
      !ctx.job.buildCommand ||
      ctx.job.buildCommand ===
        "npm run build"
    )
  ) {
    ctx.job.buildCommand =
      `${ctx.job.packageManager} run build`;
  }

  return {
    success:
      true,

    fileCount:
      files.length,

    totalBytes:
      files.reduce(
        (
          total,
          file
        ) =>
          total +
          file.size,
        0
      ),

    packageJsonPresent:
      Boolean(
        packageJson
      ),

    packageManager:
      ctx.job.packageManager,

    buildCommand:
      ctx.job.buildCommand,

    installCommand:
      ctx.job.installCommand
  };
}

/* =========================================================
   CHECKPOINTS
========================================================= */

async function createCheckpoint(
  ctx,
  label
) {
  if (
    ctx.checkpoints.length >=
    LIMITS.maxCheckpoints
  ) {
    throw new Error(
      "Checkpoint limit exceeded"
    );
  }

  const checkpoint = {
    id:
      generateId(
        "checkpoint"
      ),

    label:
      cleanString(
        label,
        200
      ),

    timestamp:
      now(),

    files:
      ctx.job.files.map(
        file => ({
          path:
            file.path,

          name:
            file.name,

          content:
            file.content,

          language:
            file.language,

          type:
            file.type,

          isEntryPoint:
            Boolean(
              file.isEntryPoint
            ),

          isGenerated:
            Boolean(
              file.isGenerated
            ),

          size:
            file.size,

          checksum:
            hashString(
              file.content
            )
        })
      )
  };

  ctx.checkpoints.push(
    checkpoint
  );

  logInfo(
    "Engineering: Checkpoint created",
    {
      runId:
        ctx.runId,

      checkpointId:
        checkpoint.id,

      label:
        checkpoint.label,

      fileCount:
        checkpoint.files.length
    }
  );

  return checkpoint;
}

/* =========================================================
   COMMAND EXECUTION
========================================================= */

function executeCommand(
  command,
  cwd,
  timeoutMs
) {
  return new Promise(
    resolve => {
      const started =
        Date.now();

      let stdout = "";
      let stderr = "";

      let timedOut =
        false;

      let settled =
        false;

      let killTimer =
        null;

      let timer =
        null;

      let child;

      const finish =
        result => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          if (timer) {
            clearTimeout(
              timer
            );
          }

          if (killTimer) {
            clearTimeout(
              killTimer
            );
          }

          resolve(
            result
          );
        };

      try {
        child =
          spawn(
            command,
            {
              cwd,

              shell:
                true,

              windowsHide:
                true,

              env: {
                ...process.env,

                CI:
                  "true",

                NODE_ENV:
                  process.env.NODE_ENV ||
                  "production"
              },

              stdio: [
                "ignore",
                "pipe",
                "pipe"
              ]
            }
          );
      } catch (
        error
      ) {
        finish({
          success:
            false,

          exitCode:
            null,

          signal:
            null,

          stdout,

          stderr,

          durationMs:
            Date.now() -
            started,

          timedOut:
            false,

          error:
            safeError(
              error
            )
        });

        return;
      }

      timer =
        setTimeout(
          () => {
            timedOut =
              true;

            logWarning(
              "Engineering: Command timeout reached",
              {
                command,
                timeoutMs
              }
            );

            try {
              child.kill(
                "SIGTERM"
              );
            } catch {}

            killTimer =
              setTimeout(
                () => {
                  try {
                    child.kill(
                      "SIGKILL"
                    );
                  } catch {}
                },
                LIMITS.killGraceMs
              );
          },
          timeoutMs
        );

      if (
        child.stdout
      ) {
        child.stdout.on(
          "data",
          chunk => {
            stdout =
              truncate(
                stdout +
                  chunk.toString(),
                LIMITS.maxStdout
              );
          }
        );
      }

      if (
        child.stderr
      ) {
        child.stderr.on(
          "data",
          chunk => {
            stderr =
              truncate(
                stderr +
                  chunk.toString(),
                LIMITS.maxStderr
              );
          }
        );
      }

      child.on(
        "error",
        error => {
          finish({
            success:
              false,

            exitCode:
              null,

            signal:
              null,

            stdout,

            stderr,

            durationMs:
              Date.now() -
              started,

            timedOut,

            error:
              safeError(
                error
              )
          });
        }
      );

      child.on(
        "close",
        (
          exitCode,
          signal
        ) => {
          finish({
            success:
              !timedOut &&
              exitCode === 0,

            exitCode,

            signal,

            stdout,

            stderr,

            durationMs:
              Date.now() -
              started,

            timedOut,

            error:
              timedOut
                ? {
                    name:
                      "TimeoutError",

                    message:
                      "Engineering command timed out",

                    code:
                      "ENGINEERING_COMMAND_TIMEOUT",

                    stack:
                      ""
                  }
                : exitCode !== 0
                ? {
                    name:
                      "EngineeringProcessError",

                    message:
                      cleanString(
                        stderr ||
                          stdout ||
                          `Command exited with code ${exitCode}`,
                        LIMITS.maxErrorLength
                      ),

                    code:
                      `EXIT_${exitCode}`,

                    stack:
                      ""
                  }
                : null
          });
        }
      );
    }
  );
}

/* =========================================================
   EXECUTION DIAGNOSTICS
========================================================= */

function buildExecutionEvidence(
  execution
) {
  return {
    success:
      Boolean(
        execution?.success
      ),

    phase:
      execution?.phase ||
      null,

    exitCode:
      execution?.exitCode ??
      null,

    signal:
      execution?.signal ||
      null,

    timedOut:
      Boolean(
        execution?.timedOut
      ),

    durationMs:
      execution?.durationMs ||
      0,

    error:
      execution?.error
        ? safeError(
            execution.error
          )
        : null,

    stderr:
      truncate(
        execution?.stderr ||
          "",
        LIMITS.maxStderr
      ),

    stdout:
      truncate(
        execution?.stdout ||
          "",
        LIMITS.maxStdout
      )
  };
}

function logExecutionFailure(
  ctx,
  phase,
  execution
) {
  const evidence =
    buildExecutionEvidence(
      execution
    );

  /*
   * Deliberately use a STRING payload
   * so ECS logger output cannot hide stderr.
   */
  logError(
    `Engineering: ${phase} failed | ` +
      `runId=${ctx.runId} | ` +
      `buildId=${ctx.buildId} | ` +
      `attempt=${ctx.currentAttempt} | ` +
      `exitCode=${evidence.exitCode} | ` +
      `signal=${evidence.signal} | ` +
      `timedOut=${evidence.timedOut} | ` +
      `durationMs=${evidence.durationMs}\n` +
      `ERROR:\n${JSON.stringify(
        evidence.error
      )}\n` +
      `STDERR:\n${evidence.stderr}\n` +
      `STDOUT:\n${evidence.stdout}`
  );
}

/* =========================================================
   BUILD EXECUTION
========================================================= */

async function executeBuild(
  ctx
) {
  const workspace =
    await writeSourceFiles(
      ctx
    );

  /* -------------------------------------------------------
     INSTALL
  ------------------------------------------------------- */

  const installTimeout =
    ensureRunBudget(
      ctx,
      LIMITS.installTimeoutMs
    );

  logInfo(
    "Engineering: Installing dependencies",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      attempt:
        ctx.currentAttempt,

      command:
        ctx.job.installCommand,

      timeoutMs:
        installTimeout
    }
  );

  const install =
    await executeCommand(
      ctx.job.installCommand,
      workspace,
      installTimeout
    );

  ctx.executions.push({
    type:
      "install",

    timestamp:
      now(),

    attempt:
      ctx.currentAttempt,

    ...clone(
      install
    )
  });

  if (
    !install.success
  ) {
    logExecutionFailure(
      ctx,
      "Dependency installation",
      install
    );

    return {
      success:
        false,

      phase:
        "install",

      ...install
    };
  }

  logSuccess(
    "Engineering: Dependencies installed",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      attempt:
        ctx.currentAttempt,

      durationMs:
        install.durationMs
    }
  );

  /* -------------------------------------------------------
     PRODUCTION BUILD
  ------------------------------------------------------- */

  const buildTimeout =
    ensureRunBudget(
      ctx,
      LIMITS.buildTimeoutMs
    );

  logInfo(
    "Engineering: Running production build",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      attempt:
        ctx.currentAttempt,

      command:
        ctx.job.buildCommand,

      timeoutMs:
        buildTimeout
    }
  );

  const build =
    await executeCommand(
      ctx.job.buildCommand,
      workspace,
      buildTimeout
    );

  ctx.executions.push({
    type:
      "build",

    timestamp:
      now(),

    attempt:
      ctx.currentAttempt,

    ...clone(
      build
    )
  });

  if (
    !build.success
  ) {
    logExecutionFailure(
      ctx,
      "Production build",
      build
    );
  } else {
    logSuccess(
      "Engineering: Production build completed",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        attempt:
          ctx.currentAttempt,

        exitCode:
          build.exitCode,

        durationMs:
          build.durationMs
      }
    );
  }

  return {
    success:
      build.success,

    phase:
      "build",

    ...build
  };
}

/* =========================================================
   FAILURE CLASSIFICATION
========================================================= */

function classifyFailure(
  result
) {
  const text =
    [
      result?.stderr,
      result?.stdout,
      result?.error?.message
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();

  if (
    result?.timedOut ||
    /timeout|timed out/.test(
      text
    )
  ) {
    return "timeout";
  }

  if (
    /enoent|cannot find module|module not found|failed to resolve/.test(
      text
    )
  ) {
    return "missing_dependency_or_module";
  }

  if (
    /syntaxerror|unexpected token|parse error|expected .* but found/.test(
      text
    )
  ) {
    return "syntax_error";
  }

  if (
    /typescript|ts\d{4}|type error|typecheck/.test(
      text
    )
  ) {
    return "type_error";
  }

  if (
    /eslint|lint error|linting/.test(
      text
    )
  ) {
    return "lint_error";
  }

  if (
    /out of memory|heap out of memory|allocation failed|javascript heap/.test(
      text
    )
  ) {
    return "memory_error";
  }

  if (
    /permission denied|eacces|eperm/.test(
      text
    )
  ) {
    return "permission_error";
  }

  if (
    /npm err|yarn error|pnpm error|npm install|unable to resolve dependency/.test(
      text
    )
  ) {
    return "dependency_error";
  }

  return "build_failure";
}

/* =========================================================
   AI RESPONSE NORMALIZATION
========================================================= */

function unwrapAIResponse(
  response
) {
  let value =
    response;

  if (
    value &&
    typeof value ===
      "object"
  ) {
    const candidates = [
      "data",
      "text",
      "content",
      "output",
      "result",
      "message"
    ];

    for (
      const key of
        candidates
    ) {
      if (
        value[key] !==
        undefined &&
        value[key] !==
        null
      ) {
        value =
          value[key];

        break;
      }
    }
  }

  if (
    Array.isArray(value)
  ) {
    value =
      value
        .map(
          item =>
            typeof item ===
              "string"
              ? item
              : item?.text ||
                item?.content ||
                ""
        )
        .join("\n");
  }

  return value;
}

function parseAIJson(
  response
) {
  const value =
    unwrapAIResponse(
      response
    );

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return clone(
      value
    );
  }

  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  let text =
    value.trim();

  text =
    text
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();

  try {
    return JSON.parse(
      text
    );
  } catch {}

  const start =
    text.indexOf(
      "{"
    );

  const end =
    text.lastIndexOf(
      "}"
    );

  if (
    start >= 0 &&
    end > start
  ) {
    try {
      return JSON.parse(
        text.slice(
          start,
          end + 1
        )
      );
    } catch {}
  }

  return null;
}

/* =========================================================
   AI DIAGNOSIS
========================================================= */

async function requestAIDiagnosis(
  ctx,
  category,
  result
) {
  if (
    !aiProvider ||
    typeof aiProvider.generateText !==
      "function"
  ) {
    return {
      success:
        false,

      available:
        false,

      error: {
        name:
          "AIProviderUnavailable",

        message:
          "Centralized AI provider is unavailable",

        code:
          "AI_PROVIDER_UNAVAILABLE",

        stack:
          ""
      }
    };
  }

  const systemMessage = [
    "You are the ZyrionOS Engineering Diagnosis Engine.",
    "Analyze software build failures only.",
    "Never claim a build succeeded.",
    "Never invent execution results.",
    "Use stderr/stdout as primary evidence.",
    "Return strict JSON only.",
    "",
    "Required JSON:",
    "{",
    '  "rootCause": "string",',
    '  "repairable": true,',
    '  "reason": "string",',
    '  "files": ["relative/path"]',
    "}"
  ].join("\n");

  const userMessage = [
    "ENGINEERING FAILURE",

    `Failure category: ${category}`,

    `Phase: ${
      result?.phase ||
      "unknown"
    }`,

    `Exit code: ${
      result?.exitCode ??
      "null"
    }`,

    `Signal: ${
      result?.signal ||
      "null"
    }`,

    `Timed out: ${
      Boolean(
        result?.timedOut
      )
    }`,

    "",

    "STDERR:",

    truncate(
      result?.stderr ||
        "",
      15000
    ),

    "",

    "STDOUT:",

    truncate(
      result?.stdout ||
        "",
      10000
    ),

    "",

    "PROCESS ERROR:",

    JSON.stringify(
      result?.error ||
        null
    )
  ].join("\n");

  try {
    logInfo(
      "Engineering: Requesting AI diagnosis",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        category
      }
    );

    const response =
      await aiProvider.generateText({
        messages: [
          {
            role:
              "system",

            content:
              systemMessage
          },

          {
            role:
              "user",

            content:
              userMessage
          }
        ],

        temperature:
          0,

        maxTokens:
          LIMITS.diagnosisAiTokens,

        responseFormat:
          "json"
      });

    return {
      success:
        true,

      available:
        true,

      response
    };
  } catch (
    error
  ) {
    logWarning(
      "Engineering: AI diagnosis failed",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        category,

        error:
          safeError(
            error
          )
      }
    );

    return {
      success:
        false,

      available:
        true,

      error:
        safeError(
          error
        )
    };
  }
}

/* =========================================================
   AI REPAIR SCOPE
========================================================= */

function getRepairScope(
  ctx,
  diagnosis
) {
  const existingMap =
    new Map(
      ctx.job.files.map(
        file => [
          file.path,
          file
        ]
      )
    );

  const diagnosed =
    Array.isArray(
      diagnosis?.ai?.files
    )
      ? diagnosis.ai.files
          .map(
            file =>
              cleanString(
                file,
                1000
              )
          )
          .filter(
            Boolean
          )
      : [];

  /*
   * If AI diagnosis names files,
   * ONLY those files are sent to repair.
   *
   * If diagnosis has no files, repair is
   * intentionally refused instead of sending
   * the entire project blindly.
   */
  if (
    diagnosed.length ===
    0
  ) {
    return {
      success:
        false,

      reason:
        "diagnosis_did_not_identify_repair_files"
    };
  }

  const files =
    diagnosed
      .filter(
        file =>
          existingMap.has(
            file
          )
      )
      .map(
        file =>
          existingMap.get(
            file
          )
      );

  if (
    files.length ===
    0
  ) {
    return {
      success:
        false,

      reason:
        "diagnosed_files_not_found_in_project"
    };
  }

  let totalBytes =
    0;

  for (
    const file of files
  ) {
    totalBytes +=
      Buffer.byteLength(
        file.content,
        "utf8"
      );
  }

  if (
    totalBytes >
    LIMITS.maxRepairSourceBytes
  ) {
    return {
      success:
        false,

      reason:
        "repair_source_scope_too_large"
    };
  }

  return {
    success:
      true,

    files,

    paths:
      files.map(
        file =>
          file.path
      )
  };
}

/* =========================================================
   AI REPAIR
========================================================= */

async function requestAIRepair(
  ctx,
  diagnosis,
  failure
) {
  if (
    !aiProvider ||
    typeof aiProvider.generateText !==
      "function"
  ) {
    return {
      success:
        false,

      reason:
        "ai_provider_unavailable"
    };
  }

  const scope =
    getRepairScope(
      ctx,
      diagnosis
    );

  if (
    !scope.success
  ) {
    logWarning(
      "Engineering: AI repair scope rejected",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        reason:
          scope.reason
      }
    );

    return {
      success:
        false,

      reason:
        scope.reason
    };
  }

  const currentFiles =
    scope.files.map(
      file => ({
        path:
          file.path,

        content:
          truncate(
            file.content,
            LIMITS.maxRepairFileSize
          ),

        language:
          file.language,

        type:
          file.type
      })
    );

  const systemMessage = [
    "You are the ZyrionOS Engineering Repair Engine.",
    "Repair ONLY the supplied build failure.",
    "Do not redesign the project.",
    "Do not modify unrelated files.",
    "Do not invent dependencies unless the evidence requires them.",
    "Only modify files included in the supplied repair scope.",
    "Return COMPLETE replacement content for every changed file.",
    "If no safe repair is possible, return repairable=false.",
    "Never claim the build succeeded.",
    "Return strict JSON only.",
    "",
    "Required JSON:",
    "{",
    '  "repairable": true,',
    '  "reason": "string",',
    '  "files": [',
    "    {",
    '      "path": "relative/path",',
    '      "content": "complete file content"',
    "    }",
    "  ]",
    "}",
    "",
    "If repairable=false:",
    "{",
    '  "repairable": false,',
    '  "reason": "string",',
    '  "files": []',
    "}"
  ].join("\n");

  const userMessage = [
    "REPAIR REQUEST",

    `Failure category: ${
      diagnosis?.category ||
      "unknown"
    }`,

    `Root cause: ${
      diagnosis?.ai?.rootCause ||
      diagnosis?.message ||
      "unknown"
    }`,

    `Repair reason: ${
      diagnosis?.ai?.reason ||
      ""
    }`,

    "",

    "REPAIR SCOPE:",

    JSON.stringify(
      scope.paths
    ),

    "",

    "FAILURE EVIDENCE:",

    JSON.stringify(
      {
        phase:
          failure?.phase,

        category:
          failure?.category,

        exitCode:
          failure?.exitCode,

        signal:
          failure?.signal,

        timedOut:
          failure?.timedOut,

        stderr:
          truncate(
            failure?.stderr ||
              "",
            12000
          ),

        stdout:
          truncate(
            failure?.stdout ||
              "",
            8000
          ),

        error:
          failure?.error ||
          null
      }
    ),

    "",

    "FILES IN REPAIR SCOPE:",

    JSON.stringify(
      currentFiles
    )
  ].join("\n");

  try {
    logInfo(
      "Engineering: Requesting AI repair",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        repairAttempt:
          ctx.repairAttempts + 1,

        files:
          scope.paths
      }
    );

    const response =
      await aiProvider.generateText({
        messages: [
          {
            role:
              "system",

            content:
              systemMessage
          },

          {
            role:
              "user",

            content:
              userMessage
          }
        ],

        temperature:
          0,

        maxTokens:
          LIMITS.repairAiTokens,

        responseFormat:
          "json"
      });

    const raw =
      unwrapAIResponse(
        response
      );

    const rawText =
      typeof raw ===
        "string"
        ? raw
        : JSON.stringify(
            raw
          );

    logInfo(
      "Engineering: AI repair response received",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        responseLength:
          rawText.length
      }
    );

    if (
      rawText.length >
      LIMITS.maxRepairResponseChars
    ) {
      return {
        success:
          false,

        reason:
          "repair_response_too_large"
      };
    }

    const parsed =
      parseAIJson(
        response
      );

    if (!parsed) {
      logWarning(
        "Engineering: AI repair returned invalid JSON",
        {
          runId:
            ctx.runId,

          buildId:
            ctx.buildId,

          response:
            truncate(
              rawText,
              5000
            )
        }
      );

      return {
        success:
          false,

        reason:
          "invalid_ai_repair_response"
      };
    }

    if (
      parsed.repairable ===
      false
    ) {
      return {
        success:
          false,

        reason:
          cleanString(
            parsed.reason ||
              "ai_declared_not_repairable",
            2000
          )
      };
    }

    if (
      !Array.isArray(
        parsed.files
      )
    ) {
      return {
        success:
          false,

        reason:
          "ai_repair_files_missing"
      };
    }

    logInfo(
      "Engineering: AI repair JSON accepted",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        returnedFiles:
          parsed.files.length
      }
    );

    return {
      success:
        true,

      data:
        parsed
    };
  } catch (
    error
  ) {
    logWarning(
      "Engineering: AI repair provider failed",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        error:
          safeError(
            error
          )
      }
    );

    return {
      success:
        false,

      reason:
        "ai_repair_provider_error",

      error:
        safeError(
          error
        )
    };
  }
}

/* =========================================================
   DIAGNOSIS
========================================================= */

async function diagnose(
  ctx,
  result
) {
  const category =
    classifyFailure(
      result
    );

  const originalError =
    result?.error
      ? safeError(
          result.error
        )
      : {
          name:
            "BuildFailure",

          message:
            cleanString(
              result?.stderr ||
                result?.stdout ||
                "Engineering build failed",
              LIMITS.maxErrorLength
            ),

          code:
            `ENGINEERING_${String(
              category
            ).toUpperCase()}`,

          stack:
            ""
        };

  const diagnosis = {
    id:
      generateId(
        "diagnosis"
      ),

    timestamp:
      now(),

    category,

    phase:
      result?.phase ||
      "unknown",

    confidence:
      0.75,

    originalFailure:
      originalError,

    message:
      originalError.message,

    aiStatus:
      "not_attempted",

    aiError:
      null,

    ai:
      null
  };

  const aiResult =
    await requestAIDiagnosis(
      ctx,
      category,
      result
    );

  if (
    aiResult.success
  ) {
    const parsed =
      parseAIJson(
        aiResult.response
      );

    if (
      parsed &&
      typeof parsed ===
        "object"
    ) {
      diagnosis.ai =
        clone(
          parsed
        );

      diagnosis.aiStatus =
        "success";
    } else {
      diagnosis.aiStatus =
        "invalid_response";
    }
  } else {
    diagnosis.aiStatus =
      aiResult.available
        ? "failed"
        : "unavailable";

    diagnosis.aiError =
      aiResult.error ||
      null;
  }

  ctx.diagnoses.push(
    diagnosis
  );

  logInfo(
    "Engineering: Diagnosis completed",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      category,

      aiStatus:
        diagnosis.aiStatus,

      rootCause:
        diagnosis.ai?.rootCause ||
        null,

      repairable:
        diagnosis.ai?.repairable ??
        null,

      files:
        diagnosis.ai?.files ||
        []
    }
  );

  return diagnosis;
}

/* =========================================================
   REPAIR VALIDATION
========================================================= */

function applyRepairFiles(
  ctx,
  diagnosis,
  response
) {
  const files =
    Array.isArray(
      response?.files
    )
      ? response.files
      : [];

  if (
    files.length ===
    0
  ) {
    return {
      success:
        false,

      reason:
        "repair_returned_no_files"
    };
  }

  if (
    files.length >
    LIMITS.maxRepairFiles
  ) {
    return {
      success:
        false,

      reason:
        "repair_scope_exceeded"
    };
  }

  const diagnosed =
    new Set(
      Array.isArray(
        diagnosis?.ai?.files
      )
        ? diagnosis.ai.files
            .map(
              file =>
                cleanString(
                  file,
                  1000
                )
            )
            .filter(
              Boolean
            )
        : []
    );

  if (
    diagnosed.size ===
    0
  ) {
    return {
      success:
        false,

      reason:
        "repair_scope_missing_from_diagnosis"
    };
  }

  const existing =
    new Set(
      ctx.job.files.map(
        file =>
          file.path
      )
    );

  const existingMap =
    new Map(
      ctx.job.files.map(
        file => [
          file.path,
          file
        ]
      )
    );

  const changedFiles =
    [];

  const rejectedFiles =
    [];

  for (
    const raw of files
  ) {
    let file;

    try {
      file =
        normalizeFile(
          raw
        );
    } catch (
      error
    ) {
      rejectedFiles.push({
        path:
          raw?.path ||
          raw?.name ||
          null,

        reason:
          "invalid_file",

        error:
          safeError(
            error
          )
      });

      continue;
    }

    if (!file) {
      continue;
    }

    /*
     * Hard scope enforcement.
     */
    if (
      !diagnosed.has(
        file.path
      )
    ) {
      rejectedFiles.push({
        path:
          file.path,

        reason:
          "file_not_in_diagnosis_scope"
      });

      continue;
    }

    /*
     * New files are forbidden unless explicitly enabled.
     */
    if (
      !existing.has(
        file.path
      )
    ) {
      if (
        !ctx.job.allowNewFiles
      ) {
        rejectedFiles.push({
          path:
            file.path,

          reason:
            "new_file_not_allowed"
        });

        continue;
      }

      ctx.job.files.push(
        file
      );

      changedFiles.push(
        file.path
      );

      continue;
    }

    const current =
      existingMap.get(
        file.path
      );

    if (
      current.content !==
      file.content
    ) {
      current.content =
        file.content;

      current.size =
        file.size;

      current.name =
        file.name;

      current.language =
        file.language;

      current.type =
        file.type;

      current.isEntryPoint =
        file.isEntryPoint;

      current.isGenerated =
        file.isGenerated;

      changedFiles.push(
        file.path
      );
    }
  }

  if (
    changedFiles.length ===
    0
  ) {
    return {
      success:
        false,

      reason:
        "repair_made_no_source_change",

      rejectedFiles
    };
  }

  /*
   * If AI returned some rejected files but also
   * valid changes, keep the valid changes and
   * preserve rejection evidence.
   */
  return {
    success:
      true,

    changedFiles,

    rejectedFiles
  };
}

/* =========================================================
   REPAIR
========================================================= */

async function attemptRepair(
  ctx,
  diagnosis,
  failure
) {
  if (
    !ctx.job.autoRepair
  ) {
    return {
      success:
        false,

      reason:
        "auto_repair_disabled"
    };
  }

  if (
    ctx.repairAttempts >=
    LIMITS.maxRepairAttempts
  ) {
    return {
      success:
        false,

      reason:
        "repair_limit_reached"
    };
  }

  if (
    diagnosis?.ai?.repairable ===
    false
  ) {
    return {
      success:
        false,

      reason:
        "failure_not_repairable"
    };
  }

  if (
    !diagnosis?.ai
  ) {
    return {
      success:
        false,

      reason:
        "diagnosis_ai_unavailable_or_invalid"
    };
  }

  const repairCheckpoint =
    await createCheckpoint(
      ctx,
      `pre-repair-${ctx.repairAttempts + 1}`
    );

  ctx.repairAttempts +=
    1;

  const response =
    await requestAIRepair(
      ctx,
      diagnosis,
      failure
    );

  if (
    !response.success
  ) {
    logWarning(
      "Engineering: AI repair was not applied",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        repairAttempt:
          ctx.repairAttempts,

        reason:
          response.reason,

        error:
          response.error ||
          null
      }
    );

    await safeRollback(
      ctx,
      repairCheckpoint,
      "repair-provider-or-response-failure"
    );

    return {
      success:
        false,

      reason:
        response.reason,

      error:
        response.error ||
        null
    };
  }

  const applied =
    applyRepairFiles(
      ctx,
      diagnosis,
      response.data
    );

  if (
    !applied.success
  ) {
    logWarning(
      "Engineering: AI repair rejected after validation",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        repairAttempt:
          ctx.repairAttempts,

        reason:
          applied.reason,

        rejectedFiles:
          applied.rejectedFiles ||
          []
      }
    );

    await safeRollback(
      ctx,
      repairCheckpoint,
      "repair-validation-failure"
    );

    return applied;
  }

  const repair = {
    id:
      generateId(
        "repair"
      ),

    timestamp:
      now(),

    attempt:
      ctx.currentAttempt,

    repairAttempt:
      ctx.repairAttempts,

    checkpointId:
      repairCheckpoint.id,

    changedFiles:
      applied.changedFiles,

    rejectedFiles:
      applied.rejectedFiles,

    category:
      diagnosis.category,

    rootCause:
      cleanString(
        diagnosis?.ai?.rootCause ||
          "",
        2000
      ),

    reason:
      cleanString(
        diagnosis?.ai?.reason ||
          "",
        4000
      )
  };

  ctx.repairs.push(
    repair
  );

  logSuccess(
    "Engineering: AI repair applied",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      repairAttempt:
        ctx.repairAttempts,

      changedFiles:
        repair.changedFiles,

      rejectedFiles:
        repair.rejectedFiles
    }
  );

  /*
   * Create a post-repair checkpoint.
   *
   * This is useful for evidence and rollback
   * analysis, while the pre-repair checkpoint
   * remains the rollback source.
   */
  await createCheckpoint(
    ctx,
    `post-repair-${ctx.repairAttempts}`
  );

  return {
    success:
      true,

    ...repair
  };
}

/* =========================================================
   ROLLBACK
========================================================= */

async function rollback(
  ctx,
  checkpoint
) {
  if (
    !checkpoint
  ) {
    return {
      success:
        false,

      reason:
        "checkpoint_missing"
    };
  }

  const restored =
    checkpoint.files.map(
      file => ({
        path:
          file.path,

        name:
          file.name ||
          path.basename(
            file.path
          ),

        content:
          file.content ||
          "",

        language:
          file.language ||
          "",

        type:
          file.type ||
          "file",

        isEntryPoint:
          Boolean(
            file.isEntryPoint
          ),

        isGenerated:
          Boolean(
            file.isGenerated
          ),

        size:
          Buffer.byteLength(
            file.content ||
              "",
            "utf8"
          )
      })
    );

  ctx.job.files =
    restored;

  if (
    ctx.workspacePath
  ) {
    await fsp.rm(
      ctx.workspacePath,
      {
        recursive:
          true,

        force:
          true
      }
    );

    await fsp.mkdir(
      ctx.workspacePath,
      {
        recursive:
          true
      }
    );

    await writeSourceFiles(
      ctx
    );
  }

  const rollbackRecord = {
    id:
      generateId(
        "rollback"
      ),

    timestamp:
      now(),

    checkpointId:
      checkpoint.id,

    restoredFiles:
      restored.length
  };

  ctx.rollbacks.push(
    rollbackRecord
  );

  logWarning(
    "Engineering: Source rolled back",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      checkpointId:
        checkpoint.id,

      restoredFiles:
        restored.length
    }
  );

  return {
    success:
      true,

    ...rollbackRecord
  };
}

async function safeRollback(
  ctx,
  checkpoint,
  reason
) {
  try {
    if (
      ctx.state !==
      STATES.ROLLBACK
    ) {
      if (
        TRANSITIONS[
          ctx.state
        ]?.has(
          STATES.ROLLBACK
        )
      ) {
        transition(
          ctx,
          STATES.ROLLBACK,
          {
            reason
          }
        );
      }
    }

    const result =
      await rollback(
        ctx,
        checkpoint
      );

    return result;
  } catch (
    error
  ) {
    logError(
      "Engineering: Rollback failed",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        reason,

        error:
          safeError(
            error
          )
      }
    );

    return {
      success:
        false,

      reason:
        "rollback_failed",

      error:
        safeError(
          error
        )
    };
  }
}

/* =========================================================
   ARTIFACT DISCOVERY
========================================================= */

async function pathIsDirectory(
  target
) {
  try {
    const stat =
      await fsp.stat(
        target
      );

    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function collectDirectoryFiles(
  directory
) {
  const result =
    [];

  let totalSize =
    0;

  async function walk(
    current
  ) {
    const entries =
      await fsp.readdir(
        current,
        {
          withFileTypes:
            true
        }
      );

    for (
      const entry of
        entries
    ) {
      const full =
        path.join(
          current,
          entry.name
        );

      if (
        entry.isSymbolicLink()
      ) {
        continue;
      }

      if (
        entry.isDirectory()
      ) {
        await walk(
          full
        );

        continue;
      }

      const stat =
        await fsp.stat(
          full
        );

      if (
        stat.size >
        LIMITS.maxArtifactFileSize
      ) {
        throw new Error(
          `Artifact file too large: ${entry.name}`
        );
      }

      totalSize +=
        stat.size;

      if (
        totalSize >
        LIMITS.maxArtifactTotalSize
      ) {
        throw new Error(
          "Total artifact size exceeds maximum allowed size"
        );
      }

      if (
        result.length >=
        LIMITS.maxArtifactFiles
      ) {
        throw new Error(
          "Artifact contains too many files"
        );
      }

      const data =
        await fsp.readFile(
          full
        );

      result.push({
        path:
          path
            .relative(
              directory,
              full
            )
            .replace(
              /\\/g,
              "/"
            ),

        size:
          stat.size,

        checksum:
          hashBuffer(
            data
          )
      });
    }
  }

  await walk(
    directory
  );

  return {
    files:
      result,

    totalSize
  };
}

/* =========================================================
   ARTIFACT STORAGE
========================================================= */

async function copyDirectory(
  source,
  destination
) {
  await fsp.mkdir(
    destination,
    {
      recursive:
        true
    }
  );

  const entries =
    await fsp.readdir(
      source,
      {
        withFileTypes:
          true
      }
    );

  for (
    const entry of
      entries
  ) {
    if (
      entry.isSymbolicLink()
    ) {
      continue;
    }

    const sourcePath =
      path.join(
        source,
        entry.name
      );

    const destinationPath =
      path.join(
        destination,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      await copyDirectory(
        sourcePath,
        destinationPath
      );
    } else {
      await fsp.copyFile(
        sourcePath,
        destinationPath
      );
    }
  }
}

async function collectBuildArtifacts(
  ctx
) {
  const workspace =
    ctx.workspacePath;

  if (!workspace) {
    throw new Error(
      "Workspace unavailable for artifact validation"
    );
  }

  const configured =
    cleanString(
      ctx.job.outputDirectory ||
        "",
      500
    );

  const candidates =
    configured
      ? [
          configured,
          "dist",
          "build",
          ".next",
          "out"
        ]
      : [
          "dist",
          "build",
          ".next",
          "out"
        ];

  const unique =
    Array.from(
      new Set(
        candidates
      )
    );

  for (
    const item of unique
  ) {
    const candidate =
      safeWorkspacePath(
        workspace,
        item
      );

    if (
      await pathIsDirectory(
        candidate
      )
    ) {
      return createVerifiedArtifact(
        ctx,
        candidate,
        item
      );
    }
  }

  throw new Error(
    "Production build artifact directory was not found. Checked: " +
      unique.join(", ")
  );
}

async function createVerifiedArtifact(
  ctx,
  outputDirectory,
  outputName
) {
  const collected =
    await collectDirectoryFiles(
      outputDirectory
    );

  if (
    collected.files.length ===
    0
  ) {
    throw new Error(
      "Build artifact directory is empty"
    );
  }

  if (
    !ctx.buildId
  ) {
    throw new Error(
      "Build ID is missing during artifact creation"
    );
  }

  const artifactRoot =
    safeWorkspacePath(
      ctx.workspacePath,
      `.zyrionos-artifacts/${ctx.buildId}`
    );

  const artifactOutput =
    path.join(
      artifactRoot,
      "output"
    );

  await fsp.rm(
    artifactRoot,
    {
      recursive:
        true,

      force:
        true
    }
  );

  await fsp.mkdir(
    artifactRoot,
    {
      recursive:
        true
    }
  );

  await copyDirectory(
    outputDirectory,
    artifactOutput
  );

  const manifestFiles =
    collected.files
      .slice()
      .sort(
        (
          a,
          b
        ) =>
          a.path.localeCompare(
            b.path
          )
      );

  const manifestObject = {
    schemaVersion:
      1,

    agent:
      AGENT_NAME,

    agentVersion:
      VERSION,

    buildId:
      ctx.buildId,

    projectId:
      ctx.job.projectId,

    projectName:
      ctx.job.projectName,

    outputDirectory:
      outputName,

    totalSize:
      collected.totalSize,

    files:
      manifestFiles
  };

  const manifest =
    JSON.stringify(
      manifestObject,
      null,
      2
    );

  const manifestChecksum =
    hashString(
      manifest
    );

  const manifestPath =
    path.join(
      artifactRoot,
      "manifest.json"
    );

  await fsp.writeFile(
    manifestPath,
    manifest,
    "utf8"
  );

  const persistedManifest =
    await fsp.readFile(
      manifestPath
    );

  const persistedChecksum =
    hashBuffer(
      persistedManifest
    );

  if (
    persistedChecksum !==
    manifestChecksum
  ) {
    throw new Error(
      "Artifact manifest checksum verification failed"
    );
  }

  for (
    const file of
      manifestFiles
  ) {
    const persistedPath =
      safeWorkspacePath(
        artifactOutput,
        file.path
      );

    const stat =
      await fsp.stat(
        persistedPath
      );

    if (
      !stat.isFile()
    ) {
      throw new Error(
        `Persisted artifact file is not a regular file: ${file.path}`
      );
    }

    const data =
      await fsp.readFile(
        persistedPath
      );

    const checksum =
      hashBuffer(
        data
      );

    if (
      checksum !==
      file.checksum
    ) {
      throw new Error(
        `Artifact checksum mismatch: ${file.path}`
      );
    }
  }

  const artifact = {
    id:
      generateId(
        "artifact"
      ),

    buildId:
      ctx.buildId,

    outputDirectory:
      outputName,

    files:
      manifestFiles,

    manifest,

    checksum:
      persistedChecksum,

    size:
      collected.totalSize,

    manifestSize:
      persistedManifest.length,

    artifactDirectory:
      path.relative(
        ctx.workspacePath,
        artifactRoot
      ),

    storageKey:
      path
        .relative(
          ctx.workspacePath,
          manifestPath
        )
        .replace(
          /\\/g,
          "/"
        ),

    verified:
      true,

    authoritative:
      true,

    validationMode:
      "authoritative"
  };

  ctx.artifacts.push(
    artifact
  );

  logSuccess(
    "Engineering: Artifact verified",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      storageKey:
        artifact.storageKey,

      checksum:
        artifact.checksum,

      fileCount:
        artifact.files.length,

      size:
        artifact.size
    }
  );

  return artifact;
}

/* =========================================================
   AUTHORITATIVE VALIDATION
========================================================= */

async function authoritativeValidation(
  ctx,
  execution,
  artifact
) {
  if (
    !execution ||
    !execution.success
  ) {
    return {
      success:
        false,

      reason:
        "Real production build execution did not succeed"
    };
  }

  if (
    !artifact ||
    !artifact.verified ||
    !artifact.authoritative
  ) {
    return {
      success:
        false,

      reason:
        "Artifact is missing or failed authoritative verification"
    };
  }

  if (
    !artifact.storageKey ||
    !artifact.checksum
  ) {
    return {
      success:
        false,

      reason:
        "Artifact persistence evidence is incomplete"
    };
  }

  const manifestPath =
    safeWorkspacePath(
      ctx.workspacePath,
      artifact.storageKey
    );

  try {
    const stat =
      await fsp.stat(
        manifestPath
      );

    if (
      !stat.isFile()
    ) {
      return {
        success:
          false,

        reason:
          "Artifact manifest is not a file"
      };
    }

    const persisted =
      await fsp.readFile(
        manifestPath
      );

    const checksum =
      hashBuffer(
        persisted
      );

    if (
      checksum !==
      artifact.checksum
    ) {
      return {
        success:
          false,

        reason:
          "Persisted artifact manifest checksum mismatch"
      };
    }
  } catch (
    error
  ) {
    return {
      success:
        false,

      reason:
        "Artifact manifest is not persisted",

      error:
        safeError(
          error
        )
    };
  }

  const evidence = {
    success:
      true,

    authoritative:
      true,

    verified:
      true,

    validationMode:
      "authoritative",

    buildId:
      ctx.buildId,

    artifact: {
      storageKey:
        artifact.storageKey,

      checksum:
        artifact.checksum,

      size:
        artifact.size,

      manifestSize:
        artifact.manifestSize,

      fileCount:
        artifact.files.length
    },

    execution: {
      phase:
        execution.phase,

      exitCode:
        execution.exitCode,

      signal:
        execution.signal,

      durationMs:
        execution.durationMs
    }
  };

  return {
    success:
      true,

    evidence
  };
}

/* =========================================================
   VERIFICATION
========================================================= */

async function verify(
  ctx,
  execution
) {
  if (
    !execution?.success
  ) {
    return {
      success:
        false,

      reason:
        "Production execution did not succeed"
    };
  }

  const artifact =
    await collectBuildArtifacts(
      ctx
    );

  const authoritative =
    await authoritativeValidation(
      ctx,
      execution,
      artifact
    );

  if (
    !authoritative.success
  ) {
    return authoritative;
  }

  ctx.verified =
    true;

  ctx.authoritative =
    true;

  ctx.validationMode =
    "authoritative";

  const verification = {
    id:
      generateId(
        "verification"
      ),

    timestamp:
      now(),

    success:
      true,

    authoritative:
      true,

    verified:
      true,

    validationMode:
      "authoritative",

    buildId:
      ctx.buildId,

    artifactChecksum:
      artifact.checksum,

    artifactStorageKey:
      artifact.storageKey,

    artifactFileCount:
      artifact.files.length
  };

  ctx.verifications.push(
    verification
  );

  logSuccess(
    "Engineering: Authoritative verification passed",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      artifact:
        artifact.storageKey,

      checksum:
        artifact.checksum
    }
  );

  return {
    success:
      true,

    artifact,

    evidence:
      authoritative.evidence,

    verification
  };
}

/* =========================================================
   PROMOTION GATE
========================================================= */

function promotionGate(
  ctx
) {
  const artifact =
    ctx.artifacts[
      ctx.artifacts.length - 1
    ];

  const verification =
    ctx.verifications[
      ctx.verifications.length - 1
    ];

  const valid =
    ctx.state ===
      STATES.PASSED &&

    Boolean(
      ctx.buildId
    ) &&

    Boolean(
      artifact
    ) &&

    Boolean(
      artifact.storageKey
    ) &&

    Boolean(
      artifact.checksum
    ) &&

    artifact.verified ===
      true &&

    artifact.authoritative ===
      true &&

    verification?.success ===
      true &&

    verification?.verified ===
      true &&

    verification?.authoritative ===
      true &&

    verification?.validationMode ===
      "authoritative";

  if (!valid) {
    return {
      success:
        false,

      reason:
        "Authoritative promotion evidence is incomplete"
    };
  }

  return {
    success:
      true
  };
}

/* =========================================================
   FAILURE RESULT
========================================================= */

function failureResult(
  ctx,
  error,
  extra = {}
) {
  const normalized =
    safeError(
      error
    );

  ctx.finalError =
    normalized;

  const latestExecution =
    ctx.executions[
      ctx.executions.length - 1
    ] ||
    null;

  return {
    success:
      false,

    state:
      ctx.state,

    promoted:
      false,

    verified:
      Boolean(
        ctx.verified
      ),

    authoritative:
      Boolean(
        ctx.authoritative
      ),

    validationMode:
      ctx.validationMode,

    runId:
      ctx.runId,

    buildId:
      ctx.buildId,

    error:
      normalized.message,

    errorName:
      normalized.name,

    errorCode:
      normalized.code,

    stack:
      normalized.stack,

    failure:
      extra.failure ||
      null,

    diagnosis:
      extra.diagnosis ||
      ctx.diagnoses[
        ctx.diagnoses.length - 1
      ] ||
      null,

    repair:
      ctx.repairs[
        ctx.repairs.length - 1
      ] ||
      null,

    repairFailure:
      extra.repairFailure ||
      null,

    execution:
      extra.execution ||
      latestExecution,

    failures:
      ctx.failures,

    rollbacks:
      ctx.rollbacks,

    engineeringBoundary:
      true,

    metadata: {
      agent:
        AGENT_NAME,

      version:
        VERSION,

      attempts:
        ctx.currentAttempt,

      repairAttempts:
        ctx.repairAttempts,

      startedAt:
        ctx.startedAt,

      completedAt:
        now(),

      transitions:
        ctx.transitions
    }
  };
}

/* =========================================================
   SUCCESS RESULT
========================================================= */

function successResult(
  ctx,
  artifact,
  evidence
) {
  return {
    success:
      true,

    state:
      STATES.PROMOTED,

    promoted:
      true,

    verified:
      true,

    authoritative:
      true,

    validationMode:
      "authoritative",

    runId:
      ctx.runId,

    buildId:
      ctx.buildId,

    artifact: {
      storageKey:
        artifact.storageKey,

      path:
        artifact.storageKey,

      key:
        artifact.storageKey,

      checksum:
        artifact.checksum,

      size:
        artifact.size,

      manifestSize:
        artifact.manifestSize,

      fileCount:
        artifact.files.length,

      verified:
        true,

      authoritative:
        true
    },

    files:
      ctx.job.files.map(
        file => ({
          path:
            file.path,

          size:
            file.size,

          checksum:
            hashString(
              file.content
            )
        })
      ),

    verification:
      ctx.verifications[
        ctx.verifications.length - 1
      ],

    authoritativeEvidence:
      evidence,

    engineeringBoundary:
      true,

    metadata: {
      agent:
        AGENT_NAME,

      version:
        VERSION,

      attempts:
        ctx.currentAttempt,

      repairAttempts:
        ctx.repairAttempts,

      startedAt:
        ctx.startedAt,

      completedAt:
        now()
    }
  };
}

/* =========================================================
   ESCALATION
========================================================= */

async function escalate(
  ctx,
  reason,
  error,
  extra = {}
) {
  if (
    !TERMINAL_STATES.has(
      ctx.state
    )
  ) {
    if (
      TRANSITIONS[
        ctx.state
      ]?.has(
        STATES.ESCALATED
      )
    ) {
      transition(
        ctx,
        STATES.ESCALATED,
        {
          reason
        }
      );
    } else {
      ctx.state =
        STATES.ESCALATED;

      ctx.updatedAt =
        now();
    }
  }

  logError(
    "Engineering: Escalated",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      reason,

      state:
        ctx.state,

      error:
        safeError(
          error
        )
    }
  );

  return failureResult(
    ctx,
    error ||
      new Error(
        reason
      ),
    extra
  );
}

/* =========================================================
   BUILD FAILURE HANDLER
========================================================= */

async function handleBuildFailure(
  ctx,
  execution,
  checkpoint
) {
  const originalFailure = {
    phase:
      execution.phase,

    category:
      classifyFailure(
        execution
      ),

    error:
      execution.error
        ? safeError(
            execution.error
          )
        : null,

    stderr:
      truncate(
        execution.stderr,
        LIMITS.maxStderr
      ),

    stdout:
      truncate(
        execution.stdout,
        LIMITS.maxStdout
      ),

    exitCode:
      execution.exitCode,

    signal:
      execution.signal,

    timedOut:
      Boolean(
        execution.timedOut
      ),

    durationMs:
      execution.durationMs,

    attempt:
      ctx.currentAttempt
  };

  ctx.failures.push({
    timestamp:
      now(),

    ...clone(
      originalFailure
    )
  });

  /*
   * Always expose actual build evidence.
   */
  logError(
    "Engineering: Build failure evidence",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      attempt:
        ctx.currentAttempt,

      category:
        originalFailure.category,

      exitCode:
        originalFailure.exitCode,

      stderr:
        originalFailure.stderr,

      stdout:
        originalFailure.stdout
    }
  );

  transition(
    ctx,
    STATES.FAILED,
    {
      attempt:
        ctx.currentAttempt,

      category:
        originalFailure.category
    }
  );

  transition(
    ctx,
    STATES.DIAGNOSING,
    {
      attempt:
        ctx.currentAttempt
    }
  );

  const diagnosis =
    await diagnose(
      ctx,
      execution
    );

  /*
   * No attempts left.
   */
  if (
    ctx.currentAttempt >=
    ctx.job.maxAttempts
  ) {
    await safeRollback(
      ctx,
      checkpoint,
      "maximum-attempts-reached"
    );

    return escalate(
      ctx,
      "maximum_attempts_reached",
      execution.error ||
        new Error(
          execution.stderr ||
            execution.stdout ||
            "Engineering build failed"
        ),
      {
        failure:
          originalFailure,

        diagnosis,

        execution
      }
    );
  }

  const repair =
    await attemptRepair(
      ctx,
      diagnosis,
      originalFailure
    );

  if (
    !repair.success
  ) {
    /*
     * attemptRepair already performs
     * rollback when appropriate.
     */
    return escalate(
      ctx,
      repair.reason ||
        "repair_failed",
      execution.error ||
        new Error(
          execution.stderr ||
            execution.stdout ||
            "Engineering build failed"
        ),
      {
        failure:
          originalFailure,

        diagnosis,

        repairFailure:
          repair,

        execution
      }
    );
  }

  transition(
    ctx,
    STATES.REPAIRING,
    {
      changedFiles:
        repair.changedFiles,

      repairAttempt:
        ctx.repairAttempts
    }
  );

  logSuccess(
    "Engineering: Repair accepted; retrying build",
    {
      runId:
        ctx.runId,

      buildId:
        ctx.buildId,

      attempt:
        ctx.currentAttempt,

      repairAttempt:
        ctx.repairAttempts,

      changedFiles:
        repair.changedFiles
    }
  );

  return {
    success:
      true,

    repaired:
      true,

    repair
  };
}

/* =========================================================
   VERIFICATION FAILURE HANDLER
========================================================= */

async function handleVerificationFailure(
  ctx,
  verificationError
) {
  const error =
    safeError(
      verificationError
    );

  const failure = {
    phase:
      "verification",

    category:
      "authoritative_verification_failure",

    error,

    stderr:
      error.message,

    stdout:
      "",

    exitCode:
      null,

    signal:
      null,

    timedOut:
      false,

    durationMs:
      0,

    attempt:
      ctx.currentAttempt
  };

  ctx.failures.push({
    timestamp:
      now(),

    ...clone(
      failure
    )
  });

  transition(
    ctx,
    STATES.FAILED,
    {
      phase:
        "verification"
    }
  );

  transition(
    ctx,
    STATES.DIAGNOSING,
    {
      phase:
        "verification"
    }
  );

  const diagnosis =
    await diagnose(
      ctx,
      {
        success:
          false,

        phase:
          "verification",

        stderr:
          error.message,

        stdout:
          "",

        error:
          verificationError
      }
    );

  if (
    ctx.currentAttempt >=
    ctx.job.maxAttempts
  ) {
    return escalate(
      ctx,
      "maximum_verification_attempts_reached",
      verificationError,
      {
        failure,
        diagnosis
      }
    );
  }

  const repair =
    await attemptRepair(
      ctx,
      diagnosis,
      failure
    );

  if (
    !repair.success
  ) {
    return escalate(
      ctx,
      repair.reason ||
        "verification_repair_failed",
      verificationError,
      {
        failure,
        diagnosis,

        repairFailure:
          repair
      }
    );
  }

  transition(
    ctx,
    STATES.REPAIRING,
    {
      changedFiles:
        repair.changedFiles
    }
  );

  return {
    success:
      true,

    repaired:
      true,

    repair
  };
}

/* =========================================================
   MAIN ENGINEERING PIPELINE
========================================================= */

async function engineeringAgent(
  input = {}
) {
  let ctx =
    null;

  try {
    const job =
      normalizeJob(
        input
      );

    ctx =
      createContext(
        job
      );

    /*
     * Stable build identity exists from
     * the beginning of the run.
     */
    ctx.buildId =
      generateId(
        "build"
      );

    logInfo(
      "Engineering Agent Started",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        projectId:
          job.projectId,

        projectName:
          job.projectName,

        maxAttempts:
          job.maxAttempts,

        autoRepair:
          job.autoRepair
      }
    );

    /* =====================================================
       ANALYSIS
    ===================================================== */

    transition(
      ctx,
      STATES.ANALYZING
    );

    const preflightResult =
      await preflight(
        ctx
      );

    ctx.preflight =
      preflightResult;

    logSuccess(
      "Engineering: Preflight passed",
      {
        runId:
          ctx.runId,

        buildId:
          ctx.buildId,

        fileCount:
          preflightResult.fileCount,

        packageManager:
          preflightResult.packageManager,

        installCommand:
          preflightResult.installCommand,

        buildCommand:
          preflightResult.buildCommand
      }
    );

    await createCheckpoint(
      ctx,
      "pre-analysis"
    );

    /* =====================================================
       EXECUTION LOOP
    ===================================================== */

    while (
      ctx.currentAttempt <
      job.maxAttempts
    ) {
      if (
        remainingRunTime(
          ctx
        ) <= 0
      ) {
        return escalate(
          ctx,
          "total_execution_budget_exceeded",
          new Error(
            "Engineering total execution budget exceeded"
          )
        );
      }

      ctx.currentAttempt +=
        1;

      const attempt = {
        number:
          ctx.currentAttempt,

        startedAt:
          now(),

        buildId:
          ctx.buildId
      };

      ctx.attempts.push(
        attempt
      );

      transition(
        ctx,
        STATES.EXECUTING,
        {
          attempt:
            ctx.currentAttempt
        }
      );

      const checkpoint =
        await createCheckpoint(
          ctx,
          `attempt-${ctx.currentAttempt}-before-build`
        );

      let execution;

      try {
        execution =
          await executeBuild(
            ctx
          );
      } catch (
        error
      ) {
        execution = {
          success:
            false,

          phase:
            "execution",

          stdout:
            "",

          stderr:
            "",

          exitCode:
            null,

          signal:
            null,

          timedOut:
            false,

          durationMs:
            0,

          error:
            safeError(
              error
            )
        };

        logError(
          "Engineering: Unexpected execution exception",
          {
            runId:
              ctx.runId,

            buildId:
              ctx.buildId,

            attempt:
              ctx.currentAttempt,

            error:
              execution.error
          }
        );
      }

      attempt.completedAt =
        now();

      attempt.success =
        execution.success;

      attempt.phase =
        execution.phase;

      attempt.exitCode =
        execution.exitCode;

      attempt.error =
        execution.error ||
        null;

      /* ===================================================
         BUILD SUCCESS
      =================================================== */

      if (
        execution.success
      ) {
        transition(
          ctx,
          STATES.VERIFYING,
          {
            attempt:
              ctx.currentAttempt
          }
        );

        try {
          const verification =
            await verify(
              ctx,
              execution
            );

          if (
            !verification.success
          ) {
            throw new Error(
              verification.reason ||
                "Authoritative verification failed"
            );
          }

          transition(
            ctx,
            STATES.PASSED,
            {
              buildId:
                ctx.buildId
            }
          );

          const promotion =
            promotionGate(
              ctx
            );

          if (
            !promotion.success
          ) {
            throw new Error(
              promotion.reason
            );
          }

          transition(
            ctx,
            STATES.PROMOTED,
            {
              buildId:
                ctx.buildId
            }
          );

          ctx.promoted =
            true;

          const artifact =
            ctx.artifacts[
              ctx.artifacts.length - 1
            ];

          const evidence =
            verification.evidence;

          logSuccess(
            "Engineering Build Promoted",
            {
              runId:
                ctx.runId,

              buildId:
                ctx.buildId,

              artifact:
                artifact.storageKey,

              checksum:
                artifact.checksum
            }
          );

          return successResult(
            ctx,
            artifact,
            evidence
          );
        } catch (
          verificationError
        ) {
          logError(
            "Engineering: Authoritative verification failed",
            {
              runId:
                ctx.runId,

              buildId:
                ctx.buildId,

              error:
                safeError(
                  verificationError
                )
            }
          );

          await safeRollback(
            ctx,
            checkpoint,
            "authoritative-verification-failure"
          );

          const handled =
            await handleVerificationFailure(
              ctx,
              verificationError
            );

          if (
            !handled.success
          ) {
            return handled;
          }

          continue;
        }
      }

      /* ===================================================
         BUILD FAILURE
      =================================================== */

      const failureHandled =
        await handleBuildFailure(
          ctx,
          execution,
          checkpoint
        );

      if (
        !failureHandled.success
      ) {
        return failureHandled;
      }

      /*
       * Repair was accepted.
       * Next iteration writes repaired source
       * and performs a clean install/build.
       */
      continue;
    }

    return escalate(
      ctx,
      "attempt_limit_exceeded",
      new Error(
        "Engineering attempt limit exceeded"
      )
    );
  } catch (
    error
  ) {
    if (ctx) {
      const normalized =
        safeError(
          error
        );

      logError(
        "Engineering Agent Failed",
        {
          runId:
            ctx.runId,

          buildId:
            ctx.buildId,

          state:
            ctx.state,

          error:
            normalized
        }
      );

      if (
        !TERMINAL_STATES.has(
          ctx.state
        )
      ) {
        try {
          if (
            TRANSITIONS[
              ctx.state
            ]?.has(
              STATES.ESCALATED
            )
          ) {
            transition(
              ctx,
              STATES.ESCALATED,
              {
                reason:
                  "engineering_agent_exception"
              }
            );
          } else {
            ctx.state =
              STATES.ESCALATED;

            ctx.updatedAt =
              now();
          }
        } catch {}
      }

      return failureResult(
        ctx,
        error,
        {
          failure:
            "engineering_agent_exception"
        }
      );
    }

    const normalized =
      safeError(
        error
      );

    return {
      success:
        false,

      state:
        STATES.ESCALATED,

      promoted:
        false,

      verified:
        false,

      authoritative:
        false,

      validationMode:
        null,

      engineeringBoundary:
        true,

      error:
        normalized.message,

      errorName:
        normalized.name,

      errorCode:
        normalized.code,

      stack:
        normalized.stack,

      metadata: {
        agent:
          AGENT_NAME,

        version:
          VERSION
      }
    };
  }
}

/* =========================================================
   PUBLIC METADATA
========================================================= */

engineeringAgent.agentName =
  AGENT_NAME;

engineeringAgent.version =
  VERSION;

engineeringAgent.states =
  STATES;

engineeringAgent.terminalStates =
  Array.from(
    TERMINAL_STATES
  );

engineeringAgent.capabilities = [
  "job-normalization",
  "state-management",
  "preflight-validation",
  "workspace-management",
  "dependency-installation",
  "production-build-execution",
  "execution-evidence",
  "failure-classification",
  "ai-diagnosis",
  "scoped-ai-repair",
  "repair-validation",
  "retry",
  "checkpoint",
  "source-snapshot",
  "rollback",
  "artifact-collection",
  "artifact-persistence",
  "artifact-integrity-verification",
  "authoritative-build-validation",
  "authoritative-artifact-validation",
  "verification",
  "promotion",
  "escalation"
];

engineeringAgent.contract = {
  masterMayExecuteBuild:
    false,

  masterMayPromoteBuild:
    false,

  masterMayValidateBuild:
    false,

  masterMayCreateArtifact:
    false,

  engineeringAgentMayExecuteBuild:
    true,

  engineeringAgentMayPromoteBuild:
    true,

  engineeringAgentMayValidateBuild:
    true,

  engineeringAgentMayCreateArtifact:
    true,

  authoritativeSuccessRequired:
    true,

  artifactVerificationRequired:
    true,

  validationMode:
    "authoritative",

  separateAuthoritativeBuildService:
    false,

  separateEngineeringServices:
    false,

  engineeringArchitecture:
    "single-agent-control-plane",

  providerArchitecture:
    "centralized-ai-provider-service",

  diagnosisArchitecture:
    "advisory-ai-preserves-original-failure",

  repairArchitecture:
    "engineering-agent-owned-centralized-ai-provider",

  originalFailurePreserved:
    true,

  aiMayDeclareBuildSuccess:
    false,

  aiMayPromoteBuild:
    false,

  promotionRequiresRealBuild:
    true,

  promotionRequiresVerifiedArtifact:
    true
};

module.exports =
  engineeringAgent;
