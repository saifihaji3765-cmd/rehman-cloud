/*
 * ZYRIONOS — ENGINEERING AGENT
 * Version: 1.1.0
 *
 * Single engineering control-plane agent.
 *
 * Responsibilities:
 * - job normalization
 * - state machine
 * - preflight validation
 * - workspace preparation
 * - dependency installation
 * - build execution
 * - failure classification
 * - AI-assisted diagnosis
 * - repair/retry
 * - checkpoints
 * - rollback
 * - verification
 * - authoritative build validation
 * - artifact validation
 * - promotion
 * - escalation
 *
 * Master Agent must treat this agent as the ONLY engineering boundary.
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

const VERSION = "1.1.0";
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
  maxCheckpoints: 10,
  maxFiles: 5000,

  maxFileSize:
    5 * 1024 * 1024,

  maxTotalSourceSize:
    100 * 1024 * 1024,

  maxStdout: 12000,
  maxStderr: 20000,
  maxErrorLength: 12000,

  maxExecutionMs:
    15 * 60 * 1000,

  maxRepairFiles: 25,

  maxArtifactSize:
    500 * 1024 * 1024
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

const logger =
  optionalRequire(
    "../services/loggerService"
  );

const aiProvider =
  optionalRequire(
    "../services/ai/aiProviderService"
  );

const buildValidationService =
  optionalRequire(
    "../services/buildValidationService"
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
      name: "Error",
      code: "",
      stack: ""
    };
  }

  return {
    message: cleanString(
      error.message ||
        String(error),
      LIMITS.maxErrorLength
    ),

    name: cleanString(
      error.name ||
        "Error",
      200
    ),

    code: cleanString(
      error.code ||
        "",
      200
    ),

    stack: cleanString(
      error.stack ||
        "",
      12000
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
  return `${prefix}_${Date.now()}_${crypto
    .randomBytes(8)
    .toString("hex")}`;
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

/* =========================================================
   LOGGING
========================================================= */

function logInfo(
  message,
  data
) {
  try {
    if (
      logger &&
      typeof logger.info ===
        "function"
    ) {
      logger.info(
        message,
        data
      );
      return;
    }

    console.log(
      message,
      data || ""
    );
  } catch {}
}

function logSuccess(
  message,
  data
) {
  try {
    if (
      logger &&
      typeof logger.success ===
        "function"
    ) {
      logger.success(
        message,
        data
      );
      return;
    }

    console.log(
      message,
      data || ""
    );
  } catch {}
}

function logWarning(
  message,
  data
) {
  try {
    if (
      logger &&
      typeof logger.warning ===
        "function"
    ) {
      logger.warning(
        message,
        data
      );
      return;
    }

    console.warn(
      message,
      data || ""
    );
  } catch {}
}

function logError(
  message,
  data
) {
  try {
    if (
      logger &&
      typeof logger.error ===
        "function"
    ) {
      logger.error(
        message,
        data
      );
      return;
    }

    console.error(
      message,
      data || ""
    );
  } catch {}
}

/* =========================================================
   FILE NORMALIZATION
========================================================= */

function normalizeFile(raw) {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return null;
  }

  const rawPath =
    cleanString(
      raw.path ||
        raw.name,
      500
    )
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

  if (!rawPath) {
    return null;
  }

  if (
    rawPath.includes("\0") ||
    rawPath.startsWith("../") ||
    rawPath.includes("/../") ||
    path.isAbsolute(rawPath)
  ) {
    throw new Error(
      `Unsafe project file path: ${rawPath}`
    );
  }

  const content =
    raw.content ===
      undefined ||
    raw.content === null
      ? ""
      : String(raw.content);

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
      `File exceeds maximum allowed size: ${rawPath}`
    );
  }

  return {
    path: rawPath,

    name:
      cleanString(
        raw.name ||
          path.basename(
            rawPath
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
      normalizeFile(raw);

    if (!file) {
      continue;
    }

    if (
      seen.has(file.path)
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

    result.push(file);
  }

  return result;
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

  const buildCommand =
    cleanString(
      input.buildCommand ||
        input.project?.buildCommand ||
        "npm run build",
      500
    );

  const installCommand =
    cleanString(
      input.installCommand ||
        input.project?.installCommand ||
        "npm install",
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

    packageManager:
      cleanString(
        input.packageManager ||
          "npm",
        50
      ),

    nodeVersion:
      cleanString(
        input.nodeVersion ||
          process.version,
        100
      ),

    buildCommand,

    installCommand,

    workspacePath,

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

    currentAttempt: 0,

    repairAttempts: 0,

    authoritative: false,

    verified: false,

    promoted: false,

    validationMode:
      null,

    workspacePath:
      job.workspacePath ||
      null,

    finalError:
      null
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
    TRANSITIONS[current];

  if (
    !allowed ||
    !allowed.has(next)
  ) {
    throw new Error(
      `Invalid engineering transition: ${current} -> ${next}`
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
      clone(metadata)
  });

  logInfo(
    `Engineering State: ${current} → ${next}`,
    metadata
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
        recursive: true
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
      recursive: true
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
    String(
      relativePath || ""
    )
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

  if (
    normalized.includes(
      ".."
    ) ||
    path.isAbsolute(
      normalized
    )
  ) {
    throw new Error(
      `Unsafe workspace path: ${relativePath}`
    );
  }

  const resolved =
    path.resolve(
      workspace,
      normalized
    );

  const root =
    path.resolve(
      workspace
    ) + path.sep;

  if (
    resolved !==
      path.resolve(
        workspace
      ) &&
    !resolved.startsWith(
      root
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
        recursive: true
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
      "Build command is missing"
    );
  }

  const dangerousPatterns = [
    /\brm\s+-rf\s+\//i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bpoweroff\b/i,
    /\bformat\b.*\bdrive\b/i
  ];

  for (
    const pattern of
      dangerousPatterns
  ) {
    if (
      pattern.test(value)
    ) {
      throw new Error(
        "Unsafe build command rejected"
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
    ctx.job.buildCommand
  );

  if (
    ctx.job.installCommand
  ) {
    validateCommand(
      ctx.job.installCommand
    );
  }

  const packageJson =
    parsePackageJson(
      files
    );

  if (
    packageJson &&
    packageJson.scripts &&
    packageJson.scripts.build
  ) {
    ctx.job.buildCommand =
      ctx.job.buildCommand ||
      `${ctx.job.packageManager} run build`;
  }

  const paths =
    files.map(
      file =>
        file.path
    );

  const packageCount =
    paths.filter(
      p =>
        p ===
        "package.json"
    ).length;

  if (
    packageCount > 1
  ) {
    throw new Error(
      "Multiple package.json files detected"
    );
  }

  return {
    success: true,

    fileCount:
      files.length,

    totalBytes:
      files.reduce(
        (
          sum,
          file
        ) =>
          sum +
          file.size,
        0
      ),

    packageJsonPresent:
      Boolean(packageJson)
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

      const child =
        spawn(
          command,
          {
            cwd,

            shell:
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

      const finish =
        result => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          resolve(
            result
          );
        };

      const timer =
        setTimeout(
          () => {
            timedOut =
              true;

            try {
              child.kill(
                "SIGTERM"
              );
            } catch {}

            setTimeout(
              () => {
                try {
                  child.kill(
                    "SIGKILL"
                  );
                } catch {}
              },
              5000
            );
          },
          timeoutMs
        );

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

      child.on(
        "error",
        error => {
          clearTimeout(
            timer
          );

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
          clearTimeout(
            timer
          );

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
                      "BuildProcessError",

                    message:
                      stderr ||
                      stdout ||
                      `Command exited with code ${exitCode}`,

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
   BUILD EXECUTION
========================================================= */

async function executeBuild(
  ctx
) {
  const workspace =
    await writeSourceFiles(
      ctx
    );

  logInfo(
    "Engineering: Installing dependencies",
    {
      runId:
        ctx.runId,
      command:
        ctx.job.installCommand
    }
  );

  const install =
    await executeCommand(
      ctx.job.installCommand,
      workspace,
      Math.min(
        10 * 60 * 1000,
        LIMITS.maxExecutionMs
      )
    );

  ctx.executions.push({
    type:
      "install",

    timestamp:
      now(),

    ...install
  });

  if (
    !install.success
  ) {
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
        ctx.runId
    }
  );

  logInfo(
    "Engineering: Running production build",
    {
      runId:
        ctx.runId,

      command:
        ctx.job.buildCommand
    }
  );

  const build =
    await executeCommand(
      ctx.job.buildCommand,
      workspace,
      LIMITS.maxExecutionMs
    );

  ctx.executions.push({
    type:
      "build",

    timestamp:
      now(),

    ...build
  });

  if (
    build.success
  ) {
    logSuccess(
      "Engineering: Production build completed",
      {
        runId:
          ctx.runId,

        durationMs:
          build.durationMs
      }
    );
  } else {
    logError(
      "Engineering: Production build failed",
      {
        runId:
          ctx.runId,

        exitCode:
          build.exitCode,

        stderr:
          truncate(
            build.stderr,
            5000
          )
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
    /enoent|cannot find module|module not found/.test(
      text
    )
  ) {
    return "missing_dependency_or_module";
  }

  if (
    /syntaxerror|unexpected token|parse error/.test(
      text
    )
  ) {
    return "syntax_error";
  }

  if (
    /typescript|ts\d{4}/.test(
      text
    )
  ) {
    return "type_error";
  }

  if (
    /eslint|lint error/.test(
      text
    )
  ) {
    return "lint_error";
  }

  if (
    /out of memory|heap out of memory|allocation failed/.test(
      text
    )
  ) {
    return "memory_error";
  }

  if (
    /timeout|timed out/.test(
      text
    )
  ) {
    return "timeout";
  }

  if (
    /permission denied|eacces/.test(
      text
    )
  ) {
    return "permission_error";
  }

  if (
    /npm err|yarn error|pnpm error/.test(
      text
    )
  ) {
    return "dependency_error";
  }

  return "build_failure";
}

/* =========================================================
   AI PROVIDER NORMALIZATION
========================================================= */

/*
 * IMPORTANT:
 *
 * The centralized ZyrionOS AI provider expects
 * chat messages, not a raw prompt string.
 *
 * Previous implementation:
 *
 *   generateText(prompt)
 *
 * caused:
 *
 *   "AI messages are required"
 *
 * This adapter always sends:
 *
 *   generateText({
 *      messages: [...]
 *   })
 *
 * and preserves provider failures as advisory
 * diagnosis errors.
 */

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
    "You are ZyrionOS Engineering Diagnosis Agent.",
    "Diagnose software build failures only.",
    "Do not claim that a build succeeded.",
    "Do not invent execution results.",
    "Return strict JSON only.",
    "",
    "Required JSON shape:",
    "{",
    '  "rootCause": "string",',
    '  "repairable": true,',
    '  "reason": "string",',
    '  "files": ["path"]',
    "}"
  ].join("\n");

  const userMessage = [
    "Engineering build failure diagnosis.",
    "",
    `Failure category: ${category}`,
    `Phase: ${result?.phase || "unknown"}`,
    `Exit code: ${result?.exitCode ?? "null"}`,
    `Signal: ${result?.signal || "null"}`,
    `Timed out: ${Boolean(result?.timedOut)}`,
    "",
    "STDERR:",
    truncate(
      result?.stderr || "",
      10000
    ),
    "",
    "STDOUT:",
    truncate(
      result?.stdout || "",
      6000
    ),
    "",
    "Process error:",
    JSON.stringify(
      result?.error || null
    )
  ].join("\n");

  const messages = [
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
  ];

  try {
    logInfo(
      "Engineering: Requesting AI diagnosis",
      {
        runId:
          ctx.runId,

        category,

        messageCount:
          messages.length
      }
    );

    /*
     * PRIMARY CONTRACT
     *
     * Centralized provider receives an object
     * containing messages.
     */
    const response =
      await aiProvider.generateText({
        messages,

        temperature:
          0,

        maxTokens:
          1200,

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
    /*
     * IMPORTANT:
     * Provider failure is captured.
     * It must NEVER replace the original
     * engineering/build failure.
     */

    logWarning(
      "Engineering: AI diagnosis failed",
      {
        runId:
          ctx.runId,

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

function parseAIResponse(
  response
) {
  if (
    response ===
      null ||
    response ===
      undefined
  ) {
    return null;
  }

  let value =
    response;

  /*
   * Common provider wrappers.
   */
  if (
    value &&
    typeof value ===
      "object"
  ) {
    if (
      value.data !==
        undefined
    ) {
      value =
        value.data;
    } else if (
      value.text !==
        undefined
    ) {
      value =
        value.text;
    } else if (
      value.content !==
        undefined
    ) {
      value =
        value.content;
    } else if (
      value.output !==
        undefined
    ) {
      value =
        value.output;
    }
  }

  if (
    typeof value !==
      "string"
  ) {
    return (
      value &&
      typeof value ===
        "object"
        ? value
        : null
    );
  }

  let text =
    value.trim();

  /*
   * Remove accidental markdown fences.
   */
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
  } catch {
    /*
     * Try to extract the first JSON object.
     */
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
}

/* =========================================================
   FAILURE DIAGNOSIS
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
                "Build failed",
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
      parseAIResponse(
        aiResult.response
      );

    if (parsed) {
      diagnosis.ai =
        clone(parsed);

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

  return diagnosis;
}

/* =========================================================
   REPAIR
========================================================= */

function extractRepairableFiles(
  ctx,
  diagnosis
) {
  const names =
    Array.isArray(
      diagnosis?.ai?.files
    )
      ? diagnosis.ai.files
      : [];

  const allowed =
    new Set(
      ctx.job.files.map(
        file =>
          file.path
      )
    );

  return names
    .map(
      file =>
        cleanString(
          file,
          500
        )
    )
    .filter(
      file =>
        allowed.has(
          file
        )
    )
    .slice(
      0,
      LIMITS.maxRepairFiles
    );
}

async function attemptRepair(
  ctx,
  diagnosis,
  failure
) {
  if (
    !ctx.job.autoRepair ||
    ctx.repairAttempts >=
      LIMITS.maxRepairAttempts
  ) {
    return {
      success:
        false,

      reason:
        "repair_limit_or_policy"
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

  /*
   * If AI diagnosis itself failed,
   * do NOT manufacture a repair.
   */
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

  ctx.repairAttempts +=
    1;

  if (
    typeof ctx.job.repairProvider !==
    "function"
  ) {
    return {
      success:
        false,

      reason:
        "repair_provider_unavailable"
    };
  }

  try {
    const response =
      await ctx.job.repairProvider({
        job:
          clone(
            ctx.job
          ),

        diagnosis:
          clone(
            diagnosis
          ),

        failure:
          clone(
            failure
          ),

        attempt:
          ctx.currentAttempt,

        repairAttempt:
          ctx.repairAttempts
      });

    const repairFiles =
      Array.isArray(
        response?.files
      )
        ? response.files
        : [];

    if (
      repairFiles.length ===
      0
    ) {
      return {
        success:
          false,

        reason:
          "repair_provider_returned_no_files"
      };
    }

    if (
      repairFiles.length >
      LIMITS.maxRepairFiles
    ) {
      return {
        success:
          false,

        reason:
          "repair_scope_exceeded"
      };
    }

    const existing =
      new Map(
        ctx.job.files.map(
          file => [
            file.path,
            file
          ]
        )
      );

    const changed =
      [];

    for (
      const rawFile of
        repairFiles
    ) {
      const file =
        normalizeFile(
          rawFile
        );

      if (!file) {
        continue;
      }

      if (
        !existing.has(
          file.path
        )
      ) {
        if (
          !ctx.job.allowNewFiles
        ) {
          continue;
        }

        ctx.job.files.push(
          file
        );

        changed.push(
          file.path
        );

        continue;
      }

      const current =
        existing.get(
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

        changed.push(
          file.path
        );
      }
    }

    if (
      changed.length ===
      0
    ) {
      return {
        success:
          false,

        reason:
          "repair_made_no_source_change"
      };
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

      changedFiles:
        changed,

      category:
        diagnosis.category
    };

    ctx.repairs.push(
      repair
    );

    return {
      success:
        true,

      ...repair
    };
  } catch (
    error
  ) {
    return {
      success:
        false,

      reason:
        "repair_provider_error",

      error:
        safeError(
          error
        )
    };
  }
}

/* =========================================================
   ROLLBACK
========================================================= */

async function rollback(
  ctx,
  checkpoint
) {
  if (!checkpoint) {
    return false;
  }

  const checkpointMap =
    new Map(
      checkpoint.files.map(
        file => [
          file.path,
          file
        ]
      )
    );

  ctx.job.files =
    Array.from(
      checkpointMap.values()
    ).map(
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

        size:
          Buffer.byteLength(
            file.content ||
              "",
            "utf8"
          ),

        isGenerated:
          true
      })
    );

  ctx.rollbacks.push({
    id:
      generateId(
        "rollback"
      ),

    timestamp:
      now(),

    checkpointId:
      checkpoint.id
  });

  logInfo(
    "Engineering: Source rolled back to checkpoint",
    {
      runId:
        ctx.runId,

      checkpointId:
        checkpoint.id
    }
  );

  return true;
}

/* =========================================================
   ARTIFACT
========================================================= */

async function collectDirectoryFiles(
  directory
) {
  const result =
    [];

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
        LIMITS.maxArtifactSize
      ) {
        throw new Error(
          `Artifact file too large: ${entry.name}`
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

  return result;
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

  /*
   * Respect explicit outputDirectory first.
   * Then detect common framework output
   * directories.
   */
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
    try {
      const candidate =
        safeWorkspacePath(
          workspace,
          item
        );

      const stat =
        await fsp.stat(
          candidate
        );

      if (
        stat.isDirectory()
      ) {
        return collectDirectoryArtifact(
          ctx,
          candidate,
          item
        );
      }
    } catch {}
  }

  throw new Error(
    "Production build artifact directory was not found. Checked: " +
      unique.join(", ")
  );
}

async function collectDirectoryArtifact(
  ctx,
  directory,
  outputName
) {
  const files =
    await collectDirectoryFiles(
      directory
    );

  if (
    files.length ===
    0
  ) {
    throw new Error(
      "Build artifact directory is empty"
    );
  }

  /*
   * Deterministic artifact manifest.
   */
  const manifest =
    JSON.stringify(
      {
        buildId:
          ctx.buildId,

        output:
          outputName,

        files:
          files
            .slice()
            .sort(
              (
                a,
                b
              ) =>
                a.path.localeCompare(
                  b.path
                )
            )
      },
      null,
      2
    );

  const checksum =
    hashString(
      manifest
    );

  const artifact = {
    id:
      generateId(
        "artifact"
      ),

    buildId:
      ctx.buildId,

    outputDirectory:
      outputName,

    files,

    manifest,

    checksum,

    size:
      Buffer.byteLength(
        manifest,
        "utf8"
      ),

    verified:
      true,

    authoritative:
      true,

    validationMode:
      "authoritative",

    storageKey:
      `engineering/${ctx.job.projectId}/${ctx.buildId}/artifact.json`
  };

  ctx.artifacts.push(
    artifact
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
        "Build execution was not successful"
    };
  }

  if (
    !artifact ||
    !artifact.verified
  ) {
    return {
      success:
        false,

      reason:
        "Artifact is missing or unverified"
    };
  }

  /*
   * Optional static validation is supplementary only.
   * It can never replace real build execution.
   */
  let staticValidation =
    null;

  if (
    buildValidationService &&
    typeof buildValidationService.validateProject ===
      "function"
  ) {
    try {
      staticValidation =
        await buildValidationService.validateProject(
          {
            files:
              ctx.job.files,

            projectData:
              ctx.job,

            plan:
              ctx.job.plan,

            manifest:
              ctx.job.manifest
          }
        );
    } catch (
      error
    ) {
      staticValidation = {
        success:
          false,

        error:
          safeError(
            error
          )
      };
    }
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
        artifact.size
    },

    execution: {
      phase:
        execution.phase,

      exitCode:
        execution.exitCode,

      durationMs:
        execution.durationMs
    },

    staticValidation
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
        "Execution did not succeed"
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

    checksum:
      artifact.checksum
  };

  ctx.verifications.push(
    verification
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

    execution:
      ctx.executions[
        ctx.executions.length - 1
      ] ||
      null,

    failures:
      ctx.failures,

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
   FAILURE HANDLER
========================================================= */

async function handleBuildFailure(
  ctx,
  execution
) {
  /*
   * ALWAYS preserve original failure first.
   */
  const originalFailure = {
    phase:
      execution.phase,

    error:
      execution.error
        ? safeError(
            execution.error
          )
        : null,

    stderr:
      execution.stderr,

    stdout:
      execution.stdout,

    exitCode:
      execution.exitCode,

    signal:
      execution.signal,

    timedOut:
      execution.timedOut,

    durationMs:
      execution.durationMs
  };

  ctx.failures.push({
    timestamp:
      now(),

    ...clone(
      originalFailure
    )
  });

  /*
   * If this is the final attempt,
   * diagnose once and escalate.
   */
  if (
    ctx.currentAttempt >=
    ctx.job.maxAttempts
  ) {
    transition(
      ctx,
      STATES.FAILED,
      {
        attempt:
          ctx.currentAttempt
      }
    );

    /*
     * IMPORTANT:
     * Enter DIAGNOSING before AI diagnosis.
     */
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

    transition(
      ctx,
      STATES.ESCALATED,
      {
        reason:
          "maximum_attempts_reached"
      }
    );

    /*
     * Original execution error remains
     * the primary failure.
     */
    return failureResult(
      ctx,
      execution.error ||
        new Error(
          execution.stderr ||
            "Engineering build failed"
        ),
      {
        failure:
          originalFailure,

        diagnosis
      }
    );
  }

  transition(
    ctx,
    STATES.FAILED,
    {
      attempt:
        ctx.currentAttempt
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
   * If diagnosis AI failed,
   * do not invent a repair.
   */
  const repair =
    await attemptRepair(
      ctx,
      diagnosis,
      originalFailure
    );

  if (
    !repair.success
  ) {
    transition(
      ctx,
      STATES.ESCALATED,
      {
        reason:
          repair.reason
      }
    );

    return failureResult(
      ctx,
      execution.error ||
        new Error(
          execution.stderr ||
            "Engineering build failed"
        ),
      {
        failure:
          originalFailure,

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

  logSuccess(
    "Engineering: Repair applied",
    {
      runId:
        ctx.runId,

      changedFiles:
        repair.changedFiles
    }
  );

  return {
    success:
      true,

    repaired:
      true
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

    logInfo(
      "Engineering Agent Started",
      {
        runId:
          ctx.runId,

        projectId:
          job.projectId,

        projectName:
          job.projectName
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
      ctx.currentAttempt +=
        1;

      const attempt = {
        number:
          ctx.currentAttempt,

        startedAt:
          now()
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

      const execution =
        await executeBuild(
          ctx
        );

      attempt.completedAt =
        now();

      attempt.success =
        execution.success;

      attempt.phase =
        execution.phase;

      attempt.exitCode =
        execution.exitCode;

      /*
       * ===================================================
       * BUILD SUCCESS
       * ===================================================
       */

      if (
        execution.success
      ) {
        transition(
          ctx,
          STATES.VERIFYING
        );

        /*
         * Build identity must exist before artifact
         * creation and authoritative evidence.
         */
        ctx.buildId =
          generateId(
            "build"
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

          logSuccess(
            "Engineering Build Promoted",
            {
              runId:
                ctx.runId,

              buildId:
                ctx.buildId
            }
          );

          const artifact =
            ctx.artifacts[
              ctx.artifacts.length - 1
            ];

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
                artifact.size
            }
          };

          return successResult(
            ctx,
            artifact,
            evidence
          );
        } catch (
          verificationError
        ) {
          const verificationFailure =
            safeError(
              verificationError
            );

          ctx.failures.push({
            timestamp:
              now(),

            phase:
              "verification",

            error:
              verificationFailure
          });

          /*
           * Do not run diagnosis before entering
           * DIAGNOSING.
           */
          if (
            ctx.currentAttempt >=
            job.maxAttempts
          ) {
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
              STATES.DIAGNOSING
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
                    verificationFailure.message,

                  stdout:
                    "",

                  error:
                    verificationError
                }
              );

            transition(
              ctx,
              STATES.ESCALATED
            );

            return failureResult(
              ctx,
              verificationError,
              {
                failure:
                  "authoritative_verification_failure",

                diagnosis
              }
            );
          }

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
            STATES.DIAGNOSING
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
                  verificationFailure.message,

                stdout:
                  "",

                error:
                  verificationError
              }
            );

          const repair =
            await attemptRepair(
              ctx,
              diagnosis,
              verificationError
            );

          if (
            !repair.success
          ) {
            transition(
              ctx,
              STATES.ESCALATED,
              {
                reason:
                  repair.reason
              }
            );

            return failureResult(
              ctx,
              verificationError,
              {
                failure:
                  "verification_failed",

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

          continue;
        }
      }

      /* ===================================================
         BUILD FAILURE
      =================================================== */

      const failureHandled =
        await handleBuildFailure(
          ctx,
          execution
        );

      if (
        !failureHandled.success
      ) {
        return failureHandled;
      }

      /*
       * Repair was successful.
       * The next loop iteration executes the repaired
       * source from scratch.
       */
      continue;
    }

    /*
     * Defensive terminal path.
     */
    if (
      !TERMINAL_STATES.has(
        ctx.state
      )
    ) {
      transition(
        ctx,
        STATES.ESCALATED,
        {
          reason:
            "attempt_limit_exceeded"
        }
      );
    }

    return failureResult(
      ctx,
      new Error(
        "Engineering attempt limit exceeded"
      ),
      {
        failure:
          "attempt_limit_exceeded"
      }
    );
  } catch (
    error
  ) {
    if (ctx) {
      try {
        if (
          !TERMINAL_STATES.has(
            ctx.state
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
        }
      } catch {}

      const normalized =
        safeError(
          error
        );

      logError(
        "Engineering Agent Failed",
        {
          runId:
            ctx.runId,

          state:
            ctx.state,

          error:
            normalized
        }
      );

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
  "build-execution",
  "failure-classification",
  "ai-diagnosis",
  "diagnosis-failure-preservation",
  "repair",
  "retry",
  "checkpoint",
  "rollback",
  "verification",
  "authoritative-build-validation",
  "artifact-validation",
  "promotion",
  "escalation"
];

engineeringAgent.contract = {
  masterMayExecuteBuild:
    false,

  masterMayPromoteBuild:
    false,

  engineeringAgentMayExecuteBuild:
    true,

  engineeringAgentMayPromoteBuild:
    true,

  authoritativeSuccessRequired:
    true,

  artifactVerificationRequired:
    true,

  validationMode:
    "authoritative",

  separateAuthoritativeBuildService:
    false,

  providerArchitecture:
    "centralized-ai-provider-service",

  diagnosisArchitecture:
    "advisory-ai-preserves-original-failure",

  originalFailurePreserved:
    true,

  aiMayDeclareBuildSuccess:
    false
};

module.exports =
  engineeringAgent;
