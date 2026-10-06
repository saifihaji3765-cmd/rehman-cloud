/**
 * ================================================================
 * ZYRIONOS ENGINEERING ORCHESTRATOR
 * ================================================================
 *
 * File:
 *   services/engineering/engineeringOrchestrator.js
 *
 * Version:
 *   1.5.0
 *
 * Role:
 *   Engineering Control Plane / Workflow Orchestrator
 *
 * Authority:
 *   Engineering Executor
 *
 * Success Rule:
 *   Only authoritative execution + authoritative verification
 *   + verified artifact + checksum can produce success.
 *
 * ================================================================
 */

"use strict";

/* ================================================================
   MODULE IDENTITY
================================================================ */

const ORCHESTRATOR_VERSION = "1.5.0";
const ENGINEERING_SYSTEM_VERSION = "2.0.0";

/* ================================================================
   NODE MODULES
================================================================ */

const crypto = require("crypto");

/* ================================================================
   DEPENDENCIES
================================================================ */

let engineeringState = null;
let engineeringExecutor = null;
let engineeringIntelligence = null;

let dependenciesLoaded = false;
let dependencyLoadErrors = [];

/* ================================================================
   SAFE REQUIRE
================================================================ */

function safeRequire(modulePath) {
  try {
    return {
      success: true,
      module: require(modulePath),
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      module: null,
      error,
    };
  }
}

/* ================================================================
   DEPENDENCY LOADING
================================================================ */

function loadDependencies(force = false) {
  if (dependenciesLoaded && !force) {
    return {
      engineeringState,
      engineeringExecutor,
      engineeringIntelligence,
      dependencyLoadErrors,
    };
  }

  dependencyLoadErrors = [];

  const stateResult = safeRequire("./engineeringState");

  if (stateResult.success) {
    engineeringState = stateResult.module;
  } else {
    engineeringState = null;

    dependencyLoadErrors.push({
      dependency: "engineeringState",
      path: "./engineeringState",
      message:
        stateResult.error?.message ||
        "Failed to load engineeringState",
    });
  }

  const executorResult = safeRequire("./engineeringExecutor");

  if (executorResult.success) {
    engineeringExecutor = executorResult.module;
  } else {
    engineeringExecutor = null;

    dependencyLoadErrors.push({
      dependency: "engineeringExecutor",
      path: "./engineeringExecutor",
      message:
        executorResult.error?.message ||
        "Failed to load engineeringExecutor",
    });
  }

  const intelligenceResult =
    safeRequire("./engineeringIntelligence");

  if (intelligenceResult.success) {
    engineeringIntelligence =
      intelligenceResult.module;
  } else {
    engineeringIntelligence = null;

    dependencyLoadErrors.push({
      dependency: "engineeringIntelligence",
      path: "./engineeringIntelligence",
      message:
        intelligenceResult.error?.message ||
        "Failed to load engineeringIntelligence",
    });
  }

  dependenciesLoaded = true;

  return {
    engineeringState,
    engineeringExecutor,
    engineeringIntelligence,
    dependencyLoadErrors,
  };
}

/* ================================================================
   STATES
================================================================ */

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
  PROMOTED: "PROMOTED",
});

/* ================================================================
   TERMINAL STATES
================================================================ */

const TERMINAL_STATES = new Set([
  STATES.ESCALATED,
  STATES.PROMOTED,
]);

/* ================================================================
   STATE TRANSITION GRAPH
================================================================ */

const ALLOWED_TRANSITIONS = Object.freeze({
  CREATED: [
    STATES.ANALYZING,
    STATES.ESCALATED,
  ],

  ANALYZING: [
    STATES.EXECUTING,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ],

  EXECUTING: [
    STATES.VERIFYING,
    STATES.FAILED,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ],

  FAILED: [
    STATES.DIAGNOSING,
    STATES.EXECUTING,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ],

  DIAGNOSING: [
    STATES.REPAIRING,
    STATES.EXECUTING,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ],

  REPAIRING: [
    STATES.EXECUTING,
    STATES.VERIFYING,
    STATES.FAILED,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ],

  VERIFYING: [
    STATES.PASSED,
    STATES.FAILED,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ],

  PASSED: [
    STATES.PROMOTED,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ],

  ROLLBACK: [
    STATES.ANALYZING,
    STATES.EXECUTING,
    STATES.ESCALATED,
  ],

  ESCALATED: [],

  PROMOTED: [],
});

/* ================================================================
   DEFAULT POLICY
================================================================ */

const DEFAULT_POLICY = Object.freeze({
  MAX_ATTEMPTS: 5,
  MAX_REPAIR_ATTEMPTS: 3,
  MAX_DIAGNOSIS_ATTEMPTS: 3,

  MAX_EXECUTION_TIME_MS:
    15 * 60 * 1000,

  MAX_REPAIR_FILES: 25,
  MAX_DEPENDENCY_CHANGES: 15,
  MAX_SCOPE_EXPANSION: 1.5,
  MAX_AUTO_SCALE: 4,
  MAX_ROLLBACKS: 2,
  MAX_CHECKPOINTS: 25,

  RETRY_BASE_DELAY_MS: 1000,
  RETRY_MAX_DELAY_MS: 30000,
  RETRY_JITTER_MS: 500,
});

/* ================================================================
   FAILURE CATEGORIES
================================================================ */

const RETRYABLE_FAILURES = new Set([
  "timeout",
  "network",
  "temporary",
  "process-terminated",
  "resource",
  "infrastructure",
  "service-unavailable",
  "rate-limit",
  "busy",
]);

const NON_RETRYABLE_FAILURES = new Set([
  "syntax",
  "invalid-project",
  "invalid-command",
  "permission",
  "security",
  "policy",
  "configuration",
  "authentication",
  "authorization",
  "unsupported",
  "cancelled",
  "orchestrator",
]);

/* ================================================================
   ID
================================================================ */

function createId(prefix) {
  return [
    prefix,
    Date.now().toString(36),
    crypto.randomBytes(8).toString("hex"),
  ].join("-");
}

/* ================================================================
   CLONE
================================================================ */

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/* ================================================================
   FILE HASH
================================================================ */

function calculateFilesHash(files) {
  const normalized = Array.isArray(files)
    ? files.map((file) => ({
        path: String(
          file?.path ||
            file?.name ||
            ""
        ),

        content:
          typeof file?.content === "string"
            ? file.content
            : String(file?.content || ""),
      }))
    : [];

  normalized.sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

/* ================================================================
   INTEGER
================================================================ */

function positiveInteger(value, fallback) {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.floor(parsed);
}

/* ================================================================
   EXTRACT STATE RUN ID
================================================================ */

function extractStateRunId(result) {
  if (!result) {
    return null;
  }

  const candidates = [
    result.runId,
    result.id,
    result.data?.runId,
    result.data?.id,
    result.run?.runId,
    result.run?.id,
  ];

  for (const candidate of candidates) {
    if (
      candidate !== undefined &&
      candidate !== null &&
      String(candidate).trim()
    ) {
      return String(candidate);
    }
  }

  return null;
}

/* ================================================================
   POLICY NORMALIZATION
================================================================ */

function normalizePolicy(supplied) {
  const input =
    supplied &&
    typeof supplied === "object"
      ? supplied
      : {};

  const policy = {
    ...DEFAULT_POLICY,
  };

  for (const key of Object.keys(DEFAULT_POLICY)) {
    if (input[key] === undefined) {
      continue;
    }

    if (key === "MAX_SCOPE_EXPANSION") {
      const value = Number(input[key]);

      if (Number.isFinite(value)) {
        policy[key] = Math.max(1, value);
      }

      continue;
    }

    policy[key] = positiveInteger(
      input[key],
      policy[key]
    );
  }

  loadDependencies();

  const globalLimits =
    engineeringState?.ENGINEERING_LIMITS ||
    engineeringState?.LIMITS ||
    {};

  const normalizedGlobal = {
    ...globalLimits,
  };

  if (
    normalizedGlobal.MAX_EXECUTION_TIME_MS ===
      undefined &&
    normalizedGlobal.MAX_EXECUTION_TIME !==
      undefined
  ) {
    normalizedGlobal.MAX_EXECUTION_TIME_MS =
      Number(
        normalizedGlobal.MAX_EXECUTION_TIME
      );
  }

  if (
    normalizedGlobal.MAX_EXECUTION_TIME ===
      undefined &&
    normalizedGlobal.MAX_EXECUTION_TIME_MS !==
      undefined
  ) {
    normalizedGlobal.MAX_EXECUTION_TIME =
      Number(
        normalizedGlobal.MAX_EXECUTION_TIME_MS
      );
  }

  for (const key of Object.keys(policy)) {
    const globalValue = Number(
      normalizedGlobal[key]
    );

    if (!Number.isFinite(globalValue)) {
      continue;
    }

    if (key === "MAX_SCOPE_EXPANSION") {
      policy[key] = Math.min(
        policy[key],
        Math.max(1, globalValue)
      );
    } else {
      policy[key] = Math.min(
        policy[key],
        Math.max(1, globalValue)
      );
    }
  }

  return policy;
}

/* ================================================================
   FAILURE NORMALIZATION
================================================================ */

function normalizeFailure(
  error,
  fallbackCategory
) {
  if (!error) {
    return {
      category:
        fallbackCategory || "unknown",

      message:
        "Unknown engineering failure",

      retryable: false,

      affectedFiles: [],

      errors: [],
    };
  }

  const category = String(
    error.category ||
      error.failureCategory ||
      fallbackCategory ||
      "unknown"
  ).toLowerCase();

  let retryable = error.retryable;

  if (typeof retryable !== "boolean") {
    retryable =
      RETRYABLE_FAILURES.has(category);
  }

  return {
    category,

    message:
      error.message ||
      error.error ||
      "Engineering execution failed",

    retryable,

    failureStage:
      error.failureStage || null,

    failureCategory:
      error.failureCategory ||
      category,

    authoritative:
      error.authoritative === true,

    validationMode:
      error.validationMode || null,

    buildId:
      error.buildId || null,

    sourceHash:
      error.sourceHash || null,

    buildCommand:
      error.buildCommand || null,

    installCommand:
      error.installCommand || null,

    affectedFiles:
      Array.isArray(error.affectedFiles)
        ? error.affectedFiles
        : [],

    errors:
      Array.isArray(error.errors)
        ? error.errors
        : [],

    stdout:
      typeof error.stdout === "string"
        ? error.stdout
        : "",

    stderr:
      typeof error.stderr === "string"
        ? error.stderr
        : "",

    exitCode:
      Number.isInteger(error.exitCode)
        ? error.exitCode
        : null,

    signal:
      error.signal || null,

    timedOut:
      Boolean(error.timedOut),

    resourceViolation:
      Boolean(error.resourceViolation),
  };
}

/* ================================================================
   JOB NORMALIZATION
================================================================ */

function normalizeJob(request) {
  if (
    !request ||
    typeof request !== "object"
  ) {
    throw new TypeError(
      "Engineering job request is required"
    );
  }

  const projectId =
    request.projectId ||
    request.project?._id ||
    request.project?.id ||
    null;

  const userId =
    request.userId ||
    request.user?._id ||
    request.user?.id ||
    null;

  const files = Array.isArray(request.files)
    ? clone(request.files)
    : [];

  if (!projectId) {
    throw new Error(
      "Engineering job requires projectId"
    );
  }

  if (!userId) {
    throw new Error(
      "Engineering job requires userId"
    );
  }

  if (
    files.length === 0 &&
    request.allowEmptyWorkspace !== true
  ) {
    throw new Error(
      "Engineering job requires project files"
    );
  }

  return {
    jobId:
      request.jobId ||
      createId("eng-job"),

    projectId: String(projectId),

    userId: String(userId),

    projectName:
      request.projectName ||
      request.project?.name ||
      "ZyrionOS Project",

    operation:
      request.operation ||
      "build",

    goal:
      request.goal ||
      request.prompt ||
      request.description ||
      "Build and validate the project.",

    files,

    planning: clone(
      request.planning || null
    ),

    intent: clone(
      request.intent || null
    ),

    builder: clone(
      request.builder || null
    ),

    manifest: clone(
      request.manifest || null
    ),

    projectData: clone(
      request.projectData || {}
    ),

    framework:
      request.framework ||
      request.projectData?.framework ||
      null,

    packageManager:
      request.packageManager ||
      request.projectData?.packageManager ||
      null,

    workspacePath:
      request.workspacePath ||
      request.project?.workspacePath ||
      request.projectData?.workspacePath ||
      null,

    branch:
      request.branch ||
      "engineering",

    baseCommit:
      request.baseCommit || null,

    environment: clone(
      request.environment || {}
    ),

    metadata: clone(
      request.metadata || {}
    ),

    masterAnalyzer:
      typeof request.masterAnalyzer ===
      "function"
        ? request.masterAnalyzer
        : null,

    policy: normalizePolicy(
      request.policy
    ),

    allowLegacyAdapter:
      request.allowLegacyAdapter === true,

    allowAutoScale:
      request.allowAutoScale !== false,

    dryRun:
      request.dryRun === true,
  };
}

/* ================================================================
   STATE CALL
================================================================ */

function stateCall(
  methodNames,
  args,
  options = {}
) {
  loadDependencies();

  if (!engineeringState) {
    if (options.required !== false) {
      throw new Error(
        `Engineering State unavailable. Load errors: ${JSON.stringify(
          dependencyLoadErrors
        )}`
      );
    }

    return null;
  }

  let foundMethod = false;
  let lastError = null;

  for (const methodName of methodNames) {
    const method =
      engineeringState[methodName];

    if (typeof method !== "function") {
      continue;
    }

    foundMethod = true;

    try {
      return method.apply(
        engineeringState,
        args
      );
    } catch (error) {
      lastError = error;
      break;
    }
  }

  if (foundMethod && lastError) {
    throw new Error(
      `Engineering State method failed: ${lastError.message}`
    );
  }

  if (options.required !== false) {
    throw new Error(
      `Engineering State method unavailable: ${methodNames.join(
        ", "
      )}`
    );
  }

  return null;
}

/* ================================================================
   RUN RECORD
================================================================ */

function createRunRecord(job) {
  if (!job) {
    throw new Error(
      "Cannot create engineering run without job"
    );
  }

  const requestedRunId =
    createId("eng-run");

  const now = Date.now();

  const run = {
    runId: requestedRunId,

    jobId: job.jobId,

    projectId: job.projectId,

    userId: job.userId,

    projectName: job.projectName,

    operation: job.operation,

    goal: job.goal,

    state: STATES.CREATED,

    version:
      ENGINEERING_SYSTEM_VERSION,

    orchestratorVersion:
      ORCHESTRATOR_VERSION,

    policy: clone(job.policy),

    attempts: 0,

    repairAttempts: 0,

    diagnosisAttempts: 0,

    rollbackCount: 0,

    checkpointCount: 0,

    retryCount: 0,

    scopeExpansion: 1,

    autoScaleLevel: 1,

    currentFiles: clone(
      job.files
    ),

    originalFiles: clone(
      job.files
    ),

    checkpoints: [],

    failures: [],

    repairs: [],

    verifications: [],

    executions: [],

    audit: [],

    startedAt:
      new Date(now).toISOString(),

    completedAt: null,

    promotedAt: null,

    lastError: null,

    authoritative: false,

    passed: false,

    promoted: false,

    escalated: false,

    rollbackRequired: false,

    result: null,

    job: clone(job),

    planning: clone(job.planning),

    intent: clone(job.intent),

    builder: clone(job.builder),

    manifest: clone(job.manifest),

    projectData: clone(
      job.projectData
    ),

    framework: job.framework,

    packageManager:
      job.packageManager,

    workspacePath:
      job.workspacePath,

    masterAnalyzer:
      job.masterAnalyzer,

    deadlineAt:
      new Date(
        now +
          job.policy.MAX_EXECUTION_TIME_MS
      ).toISOString(),

    cancellationRequested: false,

    resumedFrom:
      job.metadata?.resumedFrom ||
      null,

    recovery:
      job.metadata?.recovery === true,
  };

  const result = stateCall(
    [
      "createRun",
      "createEngineeringRun",
      "initializeRun",
    ],
    [run]
  );

  if (
    result &&
    result.success === false
  ) {
    throw new Error(
      result.error ||
        "Engineering State failed to create run"
    );
  }

  /*
   * CRITICAL CONTRACT FIX:
   *
   * State v1.3.0 owns the canonical external identity as `id`.
   * Orchestrator historically used `runId`.
   *
   * From this point forward the Orchestrator uses the ID returned
   * by State as its canonical runId.
   */
  const stateRunId =
    extractStateRunId(result);

  if (!stateRunId) {
    throw new Error(
      "Engineering State created a run but returned no canonical run id"
    );
  }

  run.runId = stateRunId;

  /*
   * Keep both forms available for compatibility with integrations.
   */
  run.id = stateRunId;

  return run;
}

/* ================================================================
   AUDIT
================================================================ */

function audit(
  run,
  event,
  data
) {
  const record = {
    eventId: createId("audit"),

    runId: run.runId,

    timestamp:
      new Date().toISOString(),

    event,

    state: run.state,

    attempt:
      run.attempts || 0,

    data: clone(data || {}),
  };

  if (Array.isArray(run.audit)) {
    run.audit.push(record);
  }

  try {
    stateCall(
      [
        "recordAuditEvent",
        "addAuditEvent",
        "appendAudit",
      ],
      [
        run.runId,
        record,
      ],
      {
        required: false,
      }
    );
  } catch {
    /* Audit is non-authoritative. */
  }

  return record;
}

/* ================================================================
   TRANSITION
================================================================ */

function transition(
  run,
  nextState,
  reason,
  metadata
) {
  if (!run) {
    throw new Error(
      "Engineering run is required for transition"
    );
  }

  const currentState =
    run.state;

  if (currentState === nextState) {
    return {
      from: currentState,

      to: nextState,

      reason:
        reason ||
        "state-already-current",

      timestamp:
        new Date().toISOString(),

      metadata:
        clone(metadata || {}),

      noop: true,
    };
  }

  const allowed =
    ALLOWED_TRANSITIONS[
      currentState
    ] || [];

  if (!allowed.includes(nextState)) {
    throw new Error(
      `Illegal engineering state transition: ${currentState} → ${nextState}`
    );
  }

  const transitionRecord = {
    from: currentState,

    to: nextState,

    reason: reason || null,

    timestamp:
      new Date().toISOString(),

    metadata:
      clone(metadata || {}),
  };

  stateCall(
    [
      "transitionState",
      "transitionEngineeringState",
      "transitionRun",
      "setState",
    ],
    [
      run.runId,
      nextState,
      transitionRecord,
    ]
  );

  run.state = nextState;

  audit(
    run,
    "STATE_TRANSITION",
    transitionRecord
  );

  return transitionRecord;
}

/* ================================================================
   BUDGETS
================================================================ */

function hasAttemptBudget(run) {
  return (
    run.attempts <
    run.policy.MAX_ATTEMPTS
  );
}

function hasRepairBudget(run) {
  return (
    run.repairAttempts <
    run.policy.MAX_REPAIR_ATTEMPTS
  );
}

function hasDiagnosisBudget(run) {
  return (
    run.diagnosisAttempts <
    run.policy.MAX_DIAGNOSIS_ATTEMPTS
  );
}

function hasRollbackBudget(run) {
  return (
    run.rollbackCount <
    run.policy.MAX_ROLLBACKS
  );
}

/* ================================================================
   DEADLINE
================================================================ */

function isRunDeadlineExceeded(run) {
  if (!run.deadlineAt) {
    return false;
  }

  return (
    Date.now() >=
    new Date(
      run.deadlineAt
    ).getTime()
  );
}

function getRemainingExecutionTime(run) {
  if (!run.deadlineAt) {
    return run.policy
      .MAX_EXECUTION_TIME_MS;
  }

  return Math.max(
    0,
    new Date(
      run.deadlineAt
    ).getTime() -
      Date.now()
  );
}

/* ================================================================
   CANCELLATION
================================================================ */

function isCancellationRequested(run) {
  return (
    run.cancellationRequested === true
  );
}

/* ================================================================
   SCOPE
================================================================ */

function withinScope(
  run,
  candidateFiles
) {
  const original =
    Math.max(
      1,
      Array.isArray(
        run.originalFiles
      )
        ? run.originalFiles.length
        : 1
    );

  const current =
    Array.isArray(candidateFiles)
      ? candidateFiles.length
      : 0;

  const ratio =
    current / original;

  run.scopeExpansion = ratio;

  return (
    ratio <=
    run.policy.MAX_SCOPE_EXPANSION
  );
}

/* ================================================================
   CHECKPOINT
================================================================ */

async function createCheckpoint(
  run,
  reason
) {
  if (
    run.checkpointCount >=
    run.policy.MAX_CHECKPOINTS
  ) {
    throw new Error(
      "Maximum engineering checkpoints exceeded"
    );
  }

  const checkpoint = {
    checkpointId:
      createId("checkpoint"),

    runId: run.runId,

    attempt:
      run.attempts,

    reason:
      reason ||
      "engineering-checkpoint",

    createdAt:
      new Date().toISOString(),

    state:
      run.state,

    files:
      clone(run.currentFiles),

    sourceHash:
      calculateFilesHash(
        run.currentFiles
      ),
  };

  /*
   * State v1.3.0 contract:
   * createCheckpoint(runId, input)
   */
  stateCall(
    [
      "createCheckpoint",
      "recordCheckpoint",
      "saveCheckpoint",
    ],
    [
      run.runId,
      checkpoint,
    ]
  );

  run.checkpoints.push(
    checkpoint
  );

  run.checkpointCount += 1;

  audit(
    run,
    "CHECKPOINT_CREATED",
    {
      checkpointId:
        checkpoint.checkpointId,

      sourceHash:
        checkpoint.sourceHash,

      reason:
        checkpoint.reason,
    }
  );

  return checkpoint;
}

/* ================================================================
   ROLLBACK
================================================================ */

async function rollbackToCheckpoint(
  run,
  checkpoint,
  reason
) {
  if (!checkpoint) {
    throw new Error(
      "Rollback checkpoint is required"
    );
  }

  if (!hasRollbackBudget(run)) {
    throw new Error(
      "Maximum rollback limit exceeded"
    );
  }

  if (
    TERMINAL_STATES.has(
      run.state
    )
  ) {
    throw new Error(
      "Cannot rollback a terminal engineering run"
    );
  }

  transition(
    run,
    STATES.ROLLBACK,
    reason ||
      "rollback-requested"
  );

  const previousFiles =
    clone(run.currentFiles);

  run.currentFiles =
    clone(checkpoint.files);

  run.rollbackCount += 1;

  const rollbackRecord = {
    rollbackId:
      createId("rollback"),

    checkpointId:
      checkpoint.checkpointId,

    runId:
      run.runId,

    attempt:
      run.attempts,

    reason:
      reason || null,

    restoredSourceHash:
      checkpoint.sourceHash,

    previousSourceHash:
      calculateFilesHash(
        previousFiles
      ),

    timestamp:
      new Date().toISOString(),
  };

  /*
   * State v1.3.0 contract:
   * recordRollback(runId, input)
   */
  stateCall(
    [
      "recordRollback",
      "rollbackRun",
      "restoreCheckpoint",
    ],
    [
      run.runId,
      rollbackRecord,
    ]
  );

  loadDependencies();

  if (
    engineeringExecutor &&
    typeof engineeringExecutor
      .restoreCheckpoint ===
      "function"
  ) {
    await engineeringExecutor
      .restoreCheckpoint({
        runId:
          run.runId,

        projectId:
          run.projectId,

        files:
          clone(checkpoint.files),

        sourceHash:
          checkpoint.sourceHash,
      });
  }

  audit(
    run,
    "ROLLBACK_COMPLETED",
    rollbackRecord
  );

  return rollbackRecord;
}

/* ================================================================
   RETRY
================================================================ */

function calculateRetryDelay(run) {
  const exponent =
    Math.max(
      0,
      run.retryCount - 1
    );

  const base =
    Math.min(
      run.policy
        .RETRY_MAX_DELAY_MS,

      run.policy
        .RETRY_BASE_DELAY_MS *
        Math.pow(2, exponent)
    );

  const jitter =
    Math.floor(
      Math.random() *
        run.policy.RETRY_JITTER_MS
    );

  return base + jitter;
}

function sleep(milliseconds) {
  if (
    !milliseconds ||
    milliseconds <= 0
  ) {
    return Promise.resolve();
  }

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

function shouldRetry(
  run,
  failure
) {
  if (
    !failure ||
    failure.retryable !== true
  ) {
    return false;
  }

  if (!hasAttemptBudget(run)) {
    return false;
  }

  if (isRunDeadlineExceeded(run)) {
    return false;
  }

  if (
    isCancellationRequested(run)
  ) {
    return false;
  }

  return true;
}

/* ================================================================
   FAILURE RECORD
================================================================ */

function recordFailure(
  run,
  failure
) {
  const normalized =
    normalizeFailure(failure);

  const record = {
    failureId:
      createId("failure"),

    runId:
      run.runId,

    attempt:
      run.attempts,

    timestamp:
      new Date().toISOString(),

    ...normalized,
  };

  run.failures.push(record);

  run.lastError = record;

  try {
    stateCall(
      [
        "recordFailure",
        "addFailure",
        "recordFailureRecord",
      ],
      [
        run.runId,
        record,
      ],
      {
        required: false,
      }
    );
  } catch (error) {
    audit(
      run,
      "STATE_FAILURE_RECORD_ERROR",
      {
        error:
          error.message,
      }
    );
  }

  audit(
    run,
    "FAILURE_RECORDED",
    {
      failureId:
        record.failureId,

      category:
        record.category,

      retryable:
        record.retryable,

      affectedFiles:
        record.affectedFiles,
    }
  );

  return record;
}

/* ================================================================
   EXECUTION RECORD
================================================================ */

function recordExecution(
  run,
  result
) {
  const record = {
    executionId:
      createId("execution"),

    runId:
      run.runId,

    attempt:
      run.attempts,

    timestamp:
      new Date().toISOString(),

    success:
      result?.success === true,

    authoritative:
      result?.authoritative === true,

    validationMode:
      result?.validationMode ||
      null,

    buildId:
      result?.buildId ||
      null,

    sourceHash:
      result?.sourceHash ||
      null,

    failureCategory:
      result?.repairContext
        ?.failureCategory ||
      result?.failureCategory ||
      null,

    failureStage:
      result?.repairContext
        ?.failureStage ||
      result?.failureStage ||
      null,

    exitCode:
      Number.isInteger(
        result?.exitCode
      )
        ? result.exitCode
        : null,

    signal:
      result?.signal || null,

    timedOut:
      Boolean(
        result?.timedOut
      ),

    durationMs:
      Number.isFinite(
        Number(
          result?.durationMs
        )
      )
        ? Number(
            result.durationMs
          )
        : null,

    artifact:
      clone(
        result?.artifact ||
          null
      ),

    metadata:
      clone(
        result?.metadata ||
          {}
      ),
  };

  run.executions.push(record);

  try {
    /*
     * State v1.3.0:
     * recordExecution(runId, input)
     */
    stateCall(
      [
        "recordExecution",
        "addExecutionRecord",
      ],
      [
        run.runId,
        record,
      ],
      {
        required: false,
      }
    );
  } catch (error) {
    audit(
      run,
      "STATE_EXECUTION_RECORD_ERROR",
      {
        error:
          error.message,
      }
    );
  }

  audit(
    run,
    "EXECUTION_RECORDED",
    {
      executionId:
        record.executionId,

      success:
        record.success,

      authoritative:
        record.authoritative,

      buildId:
        record.buildId,
    }
  );

  return record;
}

/* ================================================================
   AUTHORITATIVE EVIDENCE
================================================================ */

function getAuthoritativeEvidence(
  result
) {
  if (
    !result ||
    result.success !== true
  ) {
    return {
      valid: false,
      reason:
        "Execution result is not successful",
    };
  }

  if (
    result.authoritative !== true
  ) {
    return {
      valid: false,
      reason:
        "Execution is not authoritative",
    };
  }

  if (
    result.validationMode !==
    "authoritative"
  ) {
    return {
      valid: false,
      reason:
        "Validation mode is not authoritative",
    };
  }

  if (!result.buildId) {
    return {
      valid: false,
      reason:
        "Authoritative buildId is missing",
    };
  }

  const artifact =
    result.artifact;

  if (!artifact) {
    return {
      valid: false,
      reason:
        "Verified artifact is missing",
    };
  }

  const artifactPath =
    artifact.storageKey ||
    artifact.path ||
    artifact.key;

  if (!artifactPath) {
    return {
      valid: false,
      reason:
        "Artifact storage path/key is missing",
    };
  }

  if (
    typeof artifact.checksum !==
      "string" ||
    artifact.checksum.trim()
      .length === 0
  ) {
    return {
      valid: false,
      reason:
        "Artifact checksum is missing",
    };
  }

  return {
    valid: true,

    buildId:
      result.buildId,

    sourceHash:
      result.sourceHash ||
      null,

    artifact:
      clone(artifact),

    artifactPath,

    checksum:
      artifact.checksum,
  };
}

function isAuthoritativeSuccess(
  result
) {
  return getAuthoritativeEvidence(
    result
  ).valid;
}

/* ================================================================
   EXECUTOR
================================================================ */

async function executeBuild(run) {
  loadDependencies();

  if (!engineeringExecutor) {
    throw Object.assign(
      new Error(
        "Engineering Executor unavailable"
      ),
      {
        category:
          "infrastructure",

        retryable: false,

        dependencyLoadErrors:
          clone(
            dependencyLoadErrors
          ),
      }
    );
  }

  if (
    typeof engineeringExecutor
      .executeBuild !==
    "function"
  ) {
    throw Object.assign(
      new Error(
        "Engineering Executor executeBuild contract unavailable"
      ),
      {
        category:
          "configuration",

        retryable: false,
      }
    );
  }

  const remainingTime =
    getRemainingExecutionTime(
      run
    );

  if (remainingTime <= 0) {
    throw Object.assign(
      new Error(
        "Engineering execution deadline exceeded"
      ),
      {
        category:
          "timeout",

        retryable: false,

        timedOut: true,
      }
    );
  }

  const resourceLimits =
    engineeringState
      ?.ENGINEERING_LIMITS ||
    engineeringState?.LIMITS ||
    {};

  const maxCpu = Number(
    resourceLimits
      .MAX_RESOURCE_CPU ||
      resourceLimits.MAX_CPU ||
      2
  );

  const maxMemory = Number(
    resourceLimits
      .MAX_RESOURCE_MEMORY ||
      resourceLimits.MAX_MEMORY ||
      2048
  );

  const maxPids = Number(
    resourceLimits
      .MAX_RESOURCE_PIDS ||
      resourceLimits.MAX_PIDS ||
      256
  );

  return engineeringExecutor.executeBuild({
    projectId:
      run.projectId,

    userId:
      run.userId,

    projectName:
      run.projectName,

    files:
      clone(run.currentFiles),

    planning:
      clone(run.planning || null),

    manifest:
      clone(run.manifest || null),

    projectData:
      clone(run.projectData || {}),

    framework:
      run.framework || null,

    packageManager:
      run.packageManager || null,

    workspacePath:
      run.workspacePath || null,

    attempt:
      run.attempts,

    runId:
      run.runId,

    timeoutMs:
      remainingTime,

    resourcePolicy: {
      maxCpu:
        Number.isFinite(maxCpu)
          ? maxCpu
          : 2,

      maxMemoryMb:
        Number.isFinite(maxMemory)
          ? maxMemory
          : 2048,

      maxPids:
        Number.isFinite(maxPids)
          ? maxPids
          : 256,

      autoScaleLevel:
        run.autoScaleLevel,
    },

    engineeringPolicy:
      clone(run.policy),

    cancellationRequested:
      isCancellationRequested(run),
  });
}

/* ================================================================
   LEGACY ADAPTER
================================================================ */

async function executeLegacyBuild(run) {
  if (
    !run.job?.allowLegacyAdapter
  ) {
    return null;
  }

  const legacyCandidates = [
    "../authoritativeBuildService",
    "../../services/authoritativeBuildService",
    "../../authoritativeBuildService",
  ];

  let legacyService = null;

  for (const path of legacyCandidates) {
    const result =
      safeRequire(path);

    if (result.success) {
      legacyService =
        result.module;
      break;
    }
  }

  if (!legacyService) {
    return null;
  }

  const execute =
    legacyService.executeBuild ||
    legacyService.buildProject;

  if (
    typeof execute !== "function"
  ) {
    return null;
  }

  audit(
    run,
    "LEGACY_AUTHORITY_ADAPTER_USED",
    {
      serviceVersion:
        legacyService.SERVICE_VERSION ||
        null,
    }
  );

  return execute({
    projectId:
      run.projectId,

    userId:
      run.userId,

    projectName:
      run.projectName,

    files:
      clone(run.currentFiles),

    planning:
      clone(run.planning || null),

    manifest:
      clone(run.manifest || null),

    projectData:
      clone(run.projectData || {}),

    framework:
      run.framework || null,

    packageManager:
      run.packageManager || null,

    workspacePath:
      run.workspacePath || null,

    attempt:
      run.attempts,

    runId:
      run.runId,

    timeoutMs:
      getRemainingExecutionTime(run),
  });
}

/* ================================================================
   MASTER ANALYSIS
================================================================ */

async function analyzeWithMaster(run) {
  if (
    typeof run.masterAnalyzer !==
    "function"
  ) {
    return {
      success: true,

      skipped: true,

      reason:
        "Master analysis delegated to caller; no analyzer callback supplied",
    };
  }

  const context = {
    engineeringRun: true,

    runId:
      run.runId,

    jobId:
      run.jobId,

    projectId:
      run.projectId,

    userId:
      run.userId,

    operation:
      run.operation,

    goal:
      run.goal,

    files:
      clone(run.currentFiles),

    planning:
      clone(run.planning || null),

    intent:
      clone(run.intent || null),

    builder:
      clone(run.builder || null),

    manifest:
      clone(run.manifest || null),

    projectData:
      clone(run.projectData || {}),

    framework:
      run.framework || null,

    packageManager:
      run.packageManager || null,

    engineeringPolicy:
      clone(run.policy),
  };

  try {
    return (
      (await run.masterAnalyzer(
        context
      )) || {
        success: true,
      }
    );
  } catch (error) {
    return {
      success: false,

      error:
        error.message,

      category:
        "master-agent",

      retryable: false,
    };
  }
}

/* ================================================================
   DIAGNOSIS
================================================================ */

async function diagnoseFailure(
  run,
  failure
) {
  loadDependencies();

  if (
    !engineeringIntelligence
  ) {
    return {
      success: false,

      error:
        "Engineering Intelligence unavailable",
    };
  }

  if (
    typeof engineeringIntelligence
      .diagnoseFailure !==
    "function"
  ) {
    return {
      success: false,

      error:
        "Engineering Intelligence diagnosis contract unavailable",
    };
  }

  const knownRepairs =
    typeof engineeringIntelligence
      .findKnownRepair ===
    "function"
      ? engineeringIntelligence.findKnownRepair(
          failure
        )
      : [];

  return engineeringIntelligence.diagnoseFailure({
    runId:
      run.runId,

    projectId:
      run.projectId,

    attempt:
      run.attempts,

    files:
      clone(run.currentFiles),

    failure:
      clone(failure),

    authoritative: true,

    planning:
      clone(run.planning || null),

    knownRepairs,
  });
}

/* ================================================================
   REPAIR
================================================================ */

async function repairFailure(
  run,
  failure,
  diagnosis
) {
  loadDependencies();

  if (
    !engineeringIntelligence
  ) {
    return {
      success: false,

      error:
        "Engineering Intelligence unavailable",
    };
  }

  if (
    typeof engineeringIntelligence
      .repairFailure !==
    "function"
  ) {
    return {
      success: false,

      error:
        "Engineering Intelligence repair contract unavailable",
    };
  }

  return engineeringIntelligence.repairFailure({
    runId:
      run.runId,

    projectId:
      run.projectId,

    attempt:
      run.attempts,

    repairAttempt:
      run.repairAttempts,

    files:
      clone(run.currentFiles),

    failure:
      clone(failure),

    diagnosis:
      clone(diagnosis),

    planning:
      clone(run.planning || null),

    authoritative: true,

    limits: {
      MAX_REPAIR_FILES:
        run.policy.MAX_REPAIR_FILES,

      MAX_DEPENDENCY_CHANGES:
        run.policy
          .MAX_DEPENDENCY_CHANGES,

      MAX_SCOPE_EXPANSION:
        run.policy
          .MAX_SCOPE_EXPANSION,
    },
  });
}

/* ================================================================
   APPLY REPAIR
================================================================ */

function applyRepair(
  run,
  repair
) {
  if (
    !repair ||
    repair.success !== true
  ) {
    return {
      success: false,

      reason:
        repair?.error ||
        "Repair result was not successful",
    };
  }

  const candidateFiles =
    repair.files ||
    repair.data?.files ||
    repair.changedFiles ||
    null;

  if (
    !Array.isArray(
      candidateFiles
    )
  ) {
    return {
      success: false,

      reason:
        "Repair produced no complete file set",
    };
  }

  if (
    !withinScope(
      run,
      candidateFiles
    )
  ) {
    return {
      success: false,

      reason:
        "Repair exceeded MAX_SCOPE_EXPANSION",
    };
  }

  const changedFiles =
    Array.isArray(
      repair.changedFiles
    )
      ? repair.changedFiles
      : candidateFiles;

  if (
    changedFiles.length >
    run.policy.MAX_REPAIR_FILES
  ) {
    return {
      success: false,

      reason:
        "Repair exceeded MAX_REPAIR_FILES",
    };
  }

  loadDependencies();

  let dependencyChanges = 0;

  if (
    engineeringIntelligence &&
    typeof engineeringIntelligence
      .calculateDependencyChanges ===
      "function"
  ) {
    dependencyChanges =
      engineeringIntelligence
        .calculateDependencyChanges(
          run.currentFiles,
          candidateFiles
        );
  } else {
    dependencyChanges =
      Number(
        repair.dependencyChanges ||
          repair.metadata
            ?.dependencyChanges ||
          0
      );
  }

  if (
    !Number.isFinite(
      dependencyChanges
    )
  ) {
    dependencyChanges = 0;
  }

  if (
    dependencyChanges >
    run.policy.MAX_DEPENDENCY_CHANGES
  ) {
    return {
      success: false,

      reason:
        "Repair exceeded MAX_DEPENDENCY_CHANGES",

      dependencyChanges,
    };
  }

  const sourceHashBefore =
    calculateFilesHash(
      run.currentFiles
    );

  const sourceHashAfter =
    calculateFilesHash(
      candidateFiles
    );

  if (
    sourceHashBefore ===
    sourceHashAfter
  ) {
    return {
      success: false,

      reason:
        "Repair produced no source change",
    };
  }

  run.currentFiles =
    clone(candidateFiles);

  const repairRecord = {
    repairId:
      createId("repair"),

    runId:
      run.runId,

    attempt:
      run.attempts,

    repairAttempt:
      run.repairAttempts,

    changedFiles:
      clone(changedFiles),

    dependencyChanges,

    sourceHashBefore,

    sourceHashAfter,

    timestamp:
      new Date().toISOString(),
  };

  run.repairs.push(
    repairRecord
  );

  try {
    stateCall(
      [
        "recordRepair",
        "addRepairRecord",
      ],
      [
        run.runId,
        repairRecord,
      ],
      {
        required: false,
      }
    );
  } catch (error) {
    audit(
      run,
      "STATE_REPAIR_RECORD_ERROR",
      {
        error:
          error.message,
      }
    );
  }

  audit(
    run,
    "REPAIR_APPLIED",
    {
      repairId:
        repairRecord.repairId,

      changedFileCount:
        changedFiles.length,

      dependencyChanges,

      sourceHashBefore,

      sourceHashAfter,
    }
  );

  return {
    success: true,

    repairRecord,
  };
}

/* ================================================================
   VERIFICATION
================================================================ */

function recordVerification(
  run,
  result
) {
  const evidence =
    getAuthoritativeEvidence(
      result
    );

  const verification = {
    verificationId:
      createId("verify"),

    runId:
      run.runId,

    attempt:
      run.attempts,

    timestamp:
      new Date().toISOString(),

    passed:
      evidence.valid,

    authoritative:
      result?.authoritative === true,

    validationMode:
      result?.validationMode ||
      null,

    buildId:
      result?.buildId ||
      null,

    artifactChecksum:
      result?.artifact?.checksum ||
      null,

    artifactPath:
      result?.artifact?.storageKey ||
      result?.artifact?.path ||
      result?.artifact?.key ||
      null,

    sourceHash:
      result?.sourceHash ||
      null,

    errors:
      clone(result?.errors || []),

    failureCategory:
      result?.repairContext
        ?.failureCategory ||
      result?.failureCategory ||
      null,

    failureStage:
      result?.repairContext
        ?.failureStage ||
      result?.failureStage ||
      null,

    evidenceReason:
      evidence.reason ||
      null,
  };

  run.verifications.push(
    verification
  );

  try {
    stateCall(
      [
        "recordVerification",
        "addVerificationRecord",
      ],
      [
        run.runId,
        verification,
      ],
      {
        required: false,
      }
    );
  } catch (error) {
    audit(
      run,
      "STATE_VERIFICATION_RECORD_ERROR",
      {
        error:
          error.message,
      }
    );
  }

  audit(
    run,
    "VERIFICATION_RECORDED",
    {
      verificationId:
        verification.verificationId,

      passed:
        verification.passed,

      authoritative:
        verification.authoritative,

      buildId:
        verification.buildId,

      evidenceReason:
        verification.evidenceReason,
    }
  );

  return verification;
}

/* ================================================================
   REPAIR LEARNING
================================================================ */

function recordAuthoritativeRepairOutcome(
  run,
  result
) {
  loadDependencies();

  if (
    !engineeringIntelligence ||
    typeof engineeringIntelligence
      .recordAuthoritativeRepairOutcome !==
      "function"
  ) {
    return null;
  }

  const lastRepair =
    run.repairs[
      run.repairs.length - 1
    ] || null;

  if (!lastRepair) {
    return null;
  }

  return engineeringIntelligence
    .recordAuthoritativeRepairOutcome({
      runId:
        run.runId,

      projectId:
        run.projectId,

      attempt:
        run.attempts,

      repairId:
        lastRepair.repairId,

      sourceHashBefore:
        lastRepair.sourceHashBefore,

      sourceHashAfter:
        lastRepair.sourceHashAfter,

      authoritativeSuccess:
        isAuthoritativeSuccess(
          result
        ),

      result:
        clone(result),

      failure:
        clone(
          run.lastError || null
        ),
    });
}

/* ================================================================
   PROMOTION
================================================================ */

function canPromote(
  run,
  result
) {
  const evidence =
    getAuthoritativeEvidence(
      result
    );

  if (!evidence.valid) {
    return {
      promote: false,

      reason:
        evidence.reason ||
        "Authoritative execution evidence is incomplete",
    };
  }

  if (
    run.state !==
    STATES.PASSED
  ) {
    return {
      promote: false,

      reason:
        `Run is not in PASSED state: ${run.state}`,
    };
  }

  if (run.rollbackRequired) {
    return {
      promote: false,

      reason:
        "Run requires rollback",
    };
  }

  const lastVerification =
    run.verifications[
      run.verifications.length - 1
    ];

  if (
    !lastVerification ||
    lastVerification.passed !== true
  ) {
    return {
      promote: false,

      reason:
        "Authoritative verification evidence is incomplete",
    };
  }

  if (
    lastVerification.buildId !==
    result.buildId
  ) {
    return {
      promote: false,

      reason:
        "Verification buildId does not match promotion result",
    };
  }

  if (
    lastVerification.artifactChecksum !==
    result.artifact.checksum
  ) {
    return {
      promote: false,

      reason:
        "Verification artifact checksum does not match promotion result",
    };
  }

  return {
    promote: true,

    reason:
      "Authoritative execution, artifact, checksum and verification passed",
  };
}

/* ================================================================
   PROMOTION
================================================================ */

function promote(
  run,
  result
) {
  const decision =
    canPromote(
      run,
      result
    );

  if (!decision.promote) {
    return decision;
  }

  /*
   * IMPORTANT ORDER:
   *
   * State v1.3.0 completeRun/promoteRun require the run to still
   * satisfy the PASSED-state contract.
   *
   * Therefore persistence happens BEFORE local transition to
   * PROMOTED.
   */

  try {
    const completeResult =
      stateCall(
        [
          "completeRun",
        ],
        [
          run.runId,
          clone(result),
        ],
        {
          required: false,
        }
      );

    if (
      completeResult &&
      completeResult.success === false
    ) {
      return {
        promote: false,

        reason:
          completeResult.error ||
          "Engineering State refused run completion",
      };
    }
  } catch (error) {
    return {
      promote: false,

      reason:
        `Engineering State completion failed: ${error.message}`,
    };
  }

  try {
    const promoteResult =
      stateCall(
        [
          "promoteRun",
          "finalizePromotion",
          "markPromoted",
        ],
        [
          run.runId,
          {
            ...clone(result),
            authoritative: true,
            validationMode:
              "authoritative",
            verificationPassed: true,
          },
        ],
        {
          required: false,
        }
      );

    if (
      promoteResult &&
      promoteResult.success === false
    ) {
      return {
        promote: false,

        reason:
          promoteResult.error ||
          "Engineering State refused promotion",
      };
    }
  } catch (error) {
    return {
      promote: false,

      reason:
        `Engineering State promotion failed: ${error.message}`,
    };
  }

  /*
   * State persistence succeeded while local run is PASSED.
   * Now transition the authoritative orchestration state.
   */
  transition(
    run,
    STATES.PROMOTED,
    decision.reason
  );

  run.promoted = true;
  run.passed = true;
  run.authoritative = true;

  run.promotedAt =
    new Date().toISOString();

  run.result =
    clone(result);

  audit(
    run,
    "FINAL_PROMOTION",
    {
      buildId:
        result.buildId,

      sourceHash:
        result.sourceHash,

      artifact:
        clone(result.artifact),
    }
  );

  return {
    promote: true,

    result,
  };
}

/* ================================================================
   ESCALATION
================================================================ */

function escalate(
  run,
  reason,
  failure
) {
  if (
    run.state !==
    STATES.ESCALATED
  ) {
    const allowed =
      ALLOWED_TRANSITIONS[
        run.state
      ] || [];

    if (
      allowed.includes(
        STATES.ESCALATED
      )
    ) {
      transition(
        run,
        STATES.ESCALATED,
        reason
      );
    }
  }

  run.escalated = true;
  run.passed = false;
  run.authoritative = false;
  run.promoted = false;

  run.completedAt =
    new Date().toISOString();

  run.result = {
    success: false,

    status: "escalated",

    authoritative: false,

    promoted: false,

    reason,

    failure:
      clone(failure || null),
  };

  try {
    stateCall(
      [
        "escalateRun",
        "markEscalated",
        "finalizeRun",
      ],
      [
        run.runId,
        run.result,
      ],
      {
        required: false,
      }
    );
  } catch {
    /* Local escalation remains authoritative for this run. */
  }

  audit(
    run,
    "RUN_ESCALATED",
    {
      reason,

      failure:
        clone(failure || null),
    }
  );

  return run.result;
}

/* ================================================================
   VERIFY EXECUTION
================================================================ */

async function verifyExecution(
  run,
  result
) {
  const verification =
    recordVerification(
      run,
      result
    );

  if (run.repairs.length > 0) {
    try {
      recordAuthoritativeRepairOutcome(
        run,
        result
      );
    } catch (error) {
      audit(
        run,
        "REPAIR_LEARNING_ERROR",
        {
          error:
            error.message,
        }
      );
    }
  }

  if (verification.passed) {
    transition(
      run,
      STATES.PASSED,
      "Authoritative verification passed"
    );

    run.passed = true;
    run.authoritative = true;

    return {
      success: true,

      passed: true,

      verification,
    };
  }

  transition(
    run,
    STATES.FAILED,
    "Authoritative verification failed"
  );

  run.passed = false;
  run.authoritative = false;

  return {
    success: false,

    passed: false,

    verification,
  };
}

/* ================================================================
   EXECUTION ATTEMPT
================================================================ */

async function performExecutionAttempt(
  run
) {
  if (!hasAttemptBudget(run)) {
    throw Object.assign(
      new Error(
        "MAX_ATTEMPTS exhausted"
      ),
      {
        category: "policy",
        retryable: false,
      }
    );
  }

  if (
    isRunDeadlineExceeded(run)
  ) {
    throw Object.assign(
      new Error(
        "Engineering run execution deadline exceeded"
      ),
      {
        category: "timeout",
        retryable: false,
        timedOut: true,
      }
    );
  }

  if (
    isCancellationRequested(run)
  ) {
    throw Object.assign(
      new Error(
        "Engineering run cancellation requested"
      ),
      {
        category: "cancelled",
        retryable: false,
      }
    );
  }

  run.attempts += 1;

  audit(
    run,
    "EXECUTION_ATTEMPT_STARTED",
    {
      attempt:
        run.attempts,

      remainingExecutionTimeMs:
        getRemainingExecutionTime(
          run
        ),
    }
  );

  transition(
    run,
    STATES.EXECUTING,
    "Starting authoritative execution"
  );

  let result;

  try {
    result =
      await executeBuild(run);
  } catch (executorError) {
    audit(
      run,
      "ENGINEERING_EXECUTOR_ERROR",
      {
        message:
          executorError.message,

        category:
          executorError.category ||
          null,

        errorName:
          executorError.name ||
          null,

        stack:
          executorError.stack ||
          null,

        dependencyLoadErrors:
          executorError.dependencyLoadErrors ||
          null,
      }
    );

    const executorUnavailable =
      /unavailable/i.test(
        String(
          executorError.message ||
            ""
        )
      ) ||
      executorError.category ===
        "infrastructure";

    if (
      executorUnavailable &&
      run.job?.allowLegacyAdapter
    ) {
      result =
        await executeLegacyBuild(
          run
        );
    } else {
      throw executorError;
    }
  }

  if (!result) {
    throw Object.assign(
      new Error(
        "Engineering Executor returned no result"
      ),
      {
        category:
          "infrastructure",

        retryable: false,
      }
    );
  }

  recordExecution(
    run,
    result
  );

  transition(
    run,
    STATES.VERIFYING,
    "Authoritative execution completed"
  );

  return result;
}

/* ================================================================
   FAILURE HANDLER
================================================================ */

async function handleFailure(
  run,
  resultOrFailure,
  options = {}
) {
  const rawFailure =
    resultOrFailure?.repairContext ||
    resultOrFailure?.failure ||
    resultOrFailure;

  let failure =
    options.failureRecord ||
    null;

  if (!failure) {
    failure =
      recordFailure(
        run,
        rawFailure
      );
  }

  if (
    run.state !==
    STATES.FAILED
  ) {
    transition(
      run,
      STATES.FAILED,
      failure.message
    );
  }

  /*
   * Transient failures must never enter AI repair.
   * Retry policy handles them.
   */
  if (
    failure.retryable === true
  ) {
    return {
      retry: false,

      transient: true,

      failure,
    };
  }

  if (
    isCancellationRequested(run)
  ) {
    return {
      retry: false,

      escalated: true,

      result:
        escalate(
          run,
          "Engineering run cancelled",
          failure
        ),
    };
  }

  if (!hasDiagnosisBudget(run)) {
    return {
      retry: false,

      escalated: true,

      result:
        escalate(
          run,
          "Diagnosis attempt limit exhausted",
          failure
        ),
    };
  }

  if (!hasRepairBudget(run)) {
    return {
      retry: false,

      escalated: true,

      result:
        escalate(
          run,
          "Repair attempt limit exhausted",
          failure
        ),
    };
  }

  transition(
    run,
    STATES.DIAGNOSING,
    "Starting authoritative failure diagnosis"
  );

  run.diagnosisAttempts +=
    1;

  let diagnosis;

  try {
    diagnosis =
      await diagnoseFailure(
        run,
        failure
      );
  } catch (error) {
    diagnosis = {
      success: false,

      error:
        error.message,
    };
  }

  audit(
    run,
    "FAILURE_DIAGNOSED",
    {
      success:
        diagnosis?.success !== false,

      diagnosis:
        clone(diagnosis),
    }
  );

  if (
    !diagnosis ||
    diagnosis.success === false
  ) {
    return {
      retry: false,

      escalated: true,

      result:
        escalate(
          run,
          "Failure diagnosis failed",
          failure
        ),
    };
  }

  transition(
    run,
    STATES.REPAIRING,
    "Applying controlled engineering repair"
  );

  run.repairAttempts +=
    1;

  let repair;

  try {
    repair =
      await repairFailure(
        run,
        failure,
        diagnosis
      );
  } catch (error) {
    repair = {
      success: false,

      error:
        error.message,
    };
  }

  audit(
    run,
    "REPAIR_GENERATED",
    {
      success:
        repair?.success === true,

      repairAttempt:
        run.repairAttempts,
    }
  );

  const applied =
    applyRepair(
      run,
      repair
    );

  if (!applied.success) {
    return {
      retry: false,

      escalated: true,

      result:
        escalate(
          run,
          applied.reason ||
            "Repair could not be safely applied",
          failure
        ),
    };
  }

  await createCheckpoint(
    run,
    "post-repair-before-rebuild"
  );

  transition(
    run,
    STATES.EXECUTING,
    "Rebuilding repaired source tree"
  );

  return {
    retry: true,

    repaired: true,

    failure,

    diagnosis,

    repair,

    repairRecord:
      applied.repairRecord,
  };
}

/* ================================================================
   RETRY
================================================================ */

async function retryIfAllowed(
  run,
  failure
) {
  if (
    !shouldRetry(
      run,
      failure
    )
  ) {
    return false;
  }

  run.retryCount += 1;

  const delay =
    calculateRetryDelay(run);

  const remaining =
    getRemainingExecutionTime(
      run
    );

  if (remaining <= 0) {
    return false;
  }

  const effectiveDelay =
    Math.min(
      delay,
      remaining
    );

  audit(
    run,
    "RETRY_SCHEDULED",
    {
      retryCount:
        run.retryCount,

      delayMs:
        effectiveDelay,

      category:
        failure.category,
    }
  );

  await sleep(
    effectiveDelay
  );

  if (
    isRunDeadlineExceeded(run)
  ) {
    return false;
  }

  if (
    run.state ===
    STATES.FAILED
  ) {
    transition(
      run,
      STATES.EXECUTING,
      "Retrying transient engineering failure"
    );
  }

  return true;
}

/* ================================================================
   AUTO SCALE
================================================================ */

function evaluateAutoScale(
  run,
  result
) {
  if (
    !run.job?.allowAutoScale
  ) {
    return {
      scaled: false,

      level:
        run.autoScaleLevel,

      reason:
        "Auto-scale disabled",
    };
  }

  if (
    run.autoScaleLevel >=
    run.policy.MAX_AUTO_SCALE
  ) {
    return {
      scaled: false,

      level:
        run.autoScaleLevel,

      reason:
        "MAX_AUTO_SCALE reached",
    };
  }

  const metadata =
    result?.metadata || {};

  const resource =
    metadata.resourceUsage ||
    result?.resourceUsage ||
    null;

  if (!resource) {
    return {
      scaled: false,

      level:
        run.autoScaleLevel,

      reason:
        "No resource pressure evidence",
    };
  }

  const cpu =
    Number(
      resource.cpuPercent
    );

  const memory =
    Number(
      resource.memoryPercent
    );

  if (
    (!Number.isFinite(cpu) ||
      cpu < 80) &&
    (!Number.isFinite(memory) ||
      memory < 80)
  ) {
    return {
      scaled: false,

      level:
        run.autoScaleLevel,

      reason:
        "Resource pressure below threshold",
    };
  }

  run.autoScaleLevel += 1;

  audit(
    run,
    "AUTO_SCALE_REQUESTED",
    {
      level:
        run.autoScaleLevel,

      cpuPercent:
        cpu,

      memoryPercent:
        memory,
    }
  );

  return {
    scaled: true,

    level:
      run.autoScaleLevel,

    reason:
      "Resource pressure detected",
  };
}

/* ================================================================
   START JOB
================================================================ */

async function startJob(request) {
  const job =
    normalizeJob(request);

  const run =
    createRunRecord(job);

  audit(
    run,
    "ENGINEERING_JOB_ACCEPTED",
    {
      operation:
        job.operation,

      projectId:
        job.projectId,

      fileCount:
        job.files.length,

      policy:
        clone(job.policy),

      canonicalRunId:
        run.runId,
    }
  );

  return run;
}

/* ================================================================
   MAIN RUN
================================================================ */

async function run(request) {
  let runRecord = null;

  try {
    runRecord =
      await startJob(request);

    transition(
      runRecord,
      STATES.ANALYZING,
      "Engineering analysis started"
    );

    await createCheckpoint(
      runRecord,
      "pre-analysis"
    );

    const masterResult =
      await analyzeWithMaster(
        runRecord
      );

    audit(
      runRecord,
      "MASTER_ANALYSIS_COMPLETED",
      {
        success:
          masterResult?.success !==
          false,

        skipped:
          masterResult?.skipped ||
          false,
      }
    );

    if (
      masterResult &&
      masterResult.success === false &&
      !masterResult.skipped
    ) {
      return finalizeRun(
        runRecord,
        escalate(
          runRecord,
          "Master Agent analysis failed",
          {
            category:
              "master-agent",

            message:
              masterResult.error ||
              "Master Agent analysis failed",

            retryable: false,
          }
        )
      );
    }

    while (
      hasAttemptBudget(runRecord)
    ) {
      if (
        TERMINAL_STATES.has(
          runRecord.state
        )
      ) {
        break;
      }

      if (
        isCancellationRequested(
          runRecord
        )
      ) {
        const failure =
          recordFailure(
            runRecord,
            {
              category:
                "cancelled",

              failureStage:
                "orchestrator",

              message:
                "Engineering run cancellation requested",

              retryable: false,
            }
          );

        return finalizeRun(
          runRecord,
          escalate(
            runRecord,
            "Engineering run cancelled",
            failure
          )
        );
      }

      if (
        isRunDeadlineExceeded(
          runRecord
        )
      ) {
        const failure =
          recordFailure(
            runRecord,
            {
              category:
                "timeout",

              failureStage:
                "orchestrator",

              message:
                "Engineering run deadline exceeded",

              retryable: false,

              timedOut: true,
            }
          );

        return finalizeRun(
          runRecord,
          escalate(
            runRecord,
            "Engineering execution deadline exceeded",
            failure
          )
        );
      }

      let result;

      try {
        result =
          await performExecutionAttempt(
            runRecord
          );
      } catch (error) {
        const failure =
          recordFailure(
            runRecord,
            error
          );

        if (
          runRecord.state !==
          STATES.FAILED
        ) {
          transition(
            runRecord,
            STATES.FAILED,
            failure.message
          );
        }

        const failureOutcome =
          await handleFailure(
            runRecord,
            failure,
            {
              failureRecord:
                failure,
            }
          );

        if (
          failureOutcome?.retry
        ) {
          continue;
        }

        if (
          await retryIfAllowed(
            runRecord,
            failure
          )
        ) {
          continue;
        }

        return finalizeRun(
          runRecord,
          escalate(
            runRecord,
            "Engineering execution failed",
            failure
          )
        );
      }

      evaluateAutoScale(
        runRecord,
        result
      );

      const verification =
        await verifyExecution(
          runRecord,
          result
        );

      if (
        verification.passed
      ) {
        const promotion =
          promote(
            runRecord,
            result
          );

        if (
          promotion.promote
        ) {
          return finalizeRun(
            runRecord,
            result
          );
        }

        return finalizeRun(
          runRecord,
          escalate(
            runRecord,
            promotion.reason,
            result
          )
        );
      }

      const failureOutcome =
        await handleFailure(
          runRecord,
          result
        );

      if (
        failureOutcome?.retry
      ) {
        continue;
      }

      const failure =
        runRecord.lastError;

      if (
        await retryIfAllowed(
          runRecord,
          failure
        )
      ) {
        continue;
      }

      return finalizeRun(
        runRecord,
        escalate(
          runRecord,
          "Engineering retry policy exhausted",
          failure
        )
      );
    }

    return finalizeRun(
      runRecord,
      escalate(
        runRecord,
        "MAX_ATTEMPTS exhausted",
        runRecord.lastError
      )
    );
  } catch (error) {
    if (!runRecord) {
      return {
        success: false,

        status: "failed",

        state:
          STATES.ESCALATED,

        authoritative: false,

        passed: false,

        promoted: false,

        escalated: true,

        error:
          error.message,

        errorName:
          error.name,

        stack:
          error.stack,

        dependencyLoadErrors:
          clone(
            dependencyLoadErrors
          ),

        metadata: {
          orchestratorVersion:
            ORCHESTRATOR_VERSION,

          engineeringSystemVersion:
            ENGINEERING_SYSTEM_VERSION,
        },
      };
    }

    const failure =
      recordFailure(
        runRecord,
        {
          category:
            "orchestrator",

          message:
            error.message,

          retryable: false,

          failureStage:
            "orchestrator",

          errors: [
            {
              name:
                error.name,

              message:
                error.message,
            },
          ],

          stderr:
            error.stack || "",
        }
      );

    return finalizeRun(
      runRecord,
      escalate(
        runRecord,
        "Engineering orchestrator failure",
        failure
      )
    );
  }
}

/* ================================================================
   FINALIZE
================================================================ */

function finalizeRun(
  runRecord,
  terminalResult
) {
  runRecord.completedAt =
    runRecord.completedAt ||
    new Date().toISOString();

  const evidence =
    getAuthoritativeEvidence(
      terminalResult ||
        runRecord.result
    );

  const authoritative =
    runRecord.state ===
      STATES.PROMOTED &&
    runRecord.authoritative === true &&
    runRecord.passed === true &&
    runRecord.promoted === true &&
    evidence.valid;

  const finalResult = {
    success:
      authoritative,

    status:
      authoritative
        ? "promoted"
        : "failed",

    runId:
      runRecord.runId,

    jobId:
      runRecord.jobId,

    projectId:
      runRecord.projectId,

    state:
      runRecord.state,

    authoritative,

    passed:
      authoritative,

    promoted:
      authoritative,

    escalated:
      runRecord.escalated === true,

    attempts:
      runRecord.attempts,

    repairAttempts:
      runRecord.repairAttempts,

    diagnosisAttempts:
      runRecord.diagnosisAttempts,

    rollbackCount:
      runRecord.rollbackCount,

    checkpointCount:
      runRecord.checkpointCount,

    autoScaleLevel:
      runRecord.autoScaleLevel,

    sourceHash:
      calculateFilesHash(
        runRecord.currentFiles
      ),

    result:
      clone(
        terminalResult ||
          runRecord.result ||
          null
      ),

    artifact:
      evidence.valid
        ? clone(
            evidence.artifact
          )
        : null,

    metadata: {
      orchestratorVersion:
        ORCHESTRATOR_VERSION,

      engineeringSystemVersion:
        ENGINEERING_SYSTEM_VERSION,

      completedAt:
        runRecord.completedAt,

      authoritativeEvidence:
        evidence.valid,

      authoritativeEvidenceReason:
        evidence.reason ||
        null,
    },
  };

  if (
    finalResult.success !== true
  ) {
    finalResult.success = false;
    finalResult.authoritative = false;
    finalResult.passed = false;
    finalResult.promoted = false;

    if (
      finalResult.status !==
      "escalated"
    ) {
      finalResult.status =
        "failed";
    }
  }

  runRecord.result =
    clone(finalResult);

  /*
   * IMPORTANT:
   *
   * completeRun is already called during promotion while the
   * State run is PASSED. Calling it again after PROMOTED can
   * violate State's PASSED-only completion contract.
   *
   * Therefore finalization only performs a best-effort final save
   * if such a generic persistence method exists.
   */
  if (
    !authoritative
  ) {
    try {
      stateCall(
        [
          "finalizeRun",
          "saveRun",
        ],
        [
          runRecord.runId,
          finalResult,
        ],
        {
          required: false,
        }
      );
    } catch {
      /* Never manufacture success from persistence. */
    }
  }

  return finalResult;
}

/* ================================================================
   CANCEL
================================================================ */

async function cancelRun(
  runId,
  reason
) {
  loadDependencies();

  const cancellation = {
    runId,

    reason:
      reason ||
      "Cancelled by operator",

    timestamp:
      new Date().toISOString(),
  };

  try {
    const stateResult =
      stateCall(
        [
          "cancelRun",
          "requestCancellation",
          "markCancelled",
        ],
        [
          runId,
          cancellation,
        ]
      );

    if (
      stateResult &&
      stateResult.success === false
    ) {
      return {
        success: false,

        runId,

        error:
          stateResult.error,
      };
    }
  } catch (error) {
    return {
      success: false,

      runId,

      error:
        error.message,
    };
  }

  if (
    engineeringExecutor &&
    typeof engineeringExecutor
      .cancel === "function"
  ) {
    try {
      await engineeringExecutor.cancel(
        runId
      );
    } catch (error) {
      return {
        success: false,

        runId,

        error:
          error.message,
      };
    }
  }

  return {
    success: true,

    runId,

    cancelled: true,
  };
}

/* ================================================================
   RESUME
================================================================ */

async function resume(request) {
  if (
    !request ||
    !request.run
  ) {
    throw new Error(
      "Resume requires an existing engineering run"
    );
  }

  const existing =
    clone(request.run);

  /*
   * Backward compatibility:
   *
   * Persisted State v1.3.0 uses `id`.
   * Older orchestrator snapshots may use `runId`.
   */
  existing.runId =
    existing.runId ||
    existing.id ||
    null;

  existing.id =
    existing.id ||
    existing.runId ||
    null;

  if (!existing.runId) {
    throw new Error(
      "Resume requires an engineering run id"
    );
  }

  if (
    TERMINAL_STATES.has(
      existing.state
    )
  ) {
    return {
      success:
        existing.state ===
        STATES.PROMOTED,

      status:
        existing.state.toLowerCase(),

      runId:
        existing.runId,
    };
  }

  existing.policy =
    normalizePolicy(
      existing.policy
    );

  existing.recovery = true;

  existing.resumedAt =
    new Date().toISOString();

  audit(
    existing,
    "RUN_RESUME_REQUESTED",
    {
      runId:
        existing.runId,

      previousState:
        existing.state,

      attempts:
        existing.attempts,

      remainingExecutionTimeMs:
        getRemainingExecutionTime(
          existing
        ),
    }
  );

  if (
    existing.state ===
      STATES.FAILED ||
    existing.state ===
      STATES.ROLLBACK
  ) {
    transition(
      existing,
      STATES.ANALYZING,
      "Engineering run resumed"
    );
  }

  return runExistingRecord(
    existing
  );
}

/* ================================================================
   EXISTING RUN EXECUTION
================================================================ */

async function runExistingRecord(
  runRecord
) {
  try {
    while (
      hasAttemptBudget(runRecord)
    ) {
      if (
        TERMINAL_STATES.has(
          runRecord.state
        )
      ) {
        break;
      }

      if (
        isRunDeadlineExceeded(
          runRecord
        )
      ) {
        const failure =
          recordFailure(
            runRecord,
            {
              category:
                "timeout",

              message:
                "Engineering run deadline exceeded during resume",

              retryable: false,

              timedOut: true,
            }
          );

        return finalizeRun(
          runRecord,
          escalate(
            runRecord,
            "Engineering execution deadline exceeded during resume",
            failure
          )
        );
      }

      if (
        runRecord.state ===
        STATES.ANALYZING
      ) {
        await createCheckpoint(
          runRecord,
          "resume-analysis"
        );

        const analysis =
          await analyzeWithMaster(
            runRecord
          );

        if (
          analysis &&
          analysis.success ===
            false &&
          !analysis.skipped
        ) {
          return finalizeRun(
            runRecord,
            escalate(
              runRecord,
              "Master Agent analysis failed during resume",
              analysis
            )
          );
        }
      }

      let result;

      try {
        result =
          await performExecutionAttempt(
            runRecord
          );
      } catch (error) {
        const failure =
          recordFailure(
            runRecord,
            error
          );

        if (
          runRecord.state !==
          STATES.FAILED
        ) {
          transition(
            runRecord,
            STATES.FAILED,
            failure.message
          );
        }

        const outcome =
          await handleFailure(
            runRecord,
            failure,
            {
              failureRecord:
                failure,
            }
          );

        if (
          outcome?.retry
        ) {
          continue;
        }

        if (
          await retryIfAllowed(
            runRecord,
            failure
          )
        ) {
          continue;
        }

        return finalizeRun(
          runRecord,
          escalate(
            runRecord,
            "Engineering resume execution failed",
            failure
          )
        );
      }

      evaluateAutoScale(
        runRecord,
        result
      );

      const verification =
        await verifyExecution(
          runRecord,
          result
        );

      if (
        verification.passed
      ) {
        const promotion =
          promote(
            runRecord,
            result
          );

        if (
          promotion.promote
        ) {
          return finalizeRun(
            runRecord,
            result
          );
        }

        return finalizeRun(
          runRecord,
          escalate(
            runRecord,
            promotion.reason,
            result
          )
        );
      }

      const failureOutcome =
        await handleFailure(
          runRecord,
          result
        );

      if (
        failureOutcome?.retry
      ) {
        continue;
      }

      const failure =
        runRecord.lastError;

      if (
        await retryIfAllowed(
          runRecord,
          failure
        )
      ) {
        continue;
      }

      return finalizeRun(
        runRecord,
        escalate(
          runRecord,
          "Engineering resume retry policy exhausted",
          failure
        )
      );
    }

    return finalizeRun(
      runRecord,
      escalate(
        runRecord,
        "MAX_ATTEMPTS exhausted during resume",
        runRecord.lastError
      )
    );
  } catch (error) {
    const failure =
      recordFailure(
        runRecord,
        {
          category:
            "orchestrator",

          message:
            error.message,

          retryable: false,

          failureStage:
            "resume",

          errors: [
            {
              name:
                error.name,

              message:
                error.message,
            },
          ],

          stderr:
            error.stack || "",
        }
      );

    return finalizeRun(
      runRecord,
      escalate(
        runRecord,
        "Engineering resume orchestrator failure",
        failure
      )
    );
  }
}

/* ================================================================
   HEALTH
================================================================ */

function getHealth() {
  loadDependencies();

  return {
    success: true,

    service:
      "engineeringOrchestrator",

    version:
      ORCHESTRATOR_VERSION,

    systemVersion:
      ENGINEERING_SYSTEM_VERSION,

    dependencies: {
      state:
        Boolean(
          engineeringState
        ),

      executor:
        Boolean(
          engineeringExecutor
        ),

      intelligence:
        Boolean(
          engineeringIntelligence
        ),
    },

    dependencyLoadErrors:
      clone(
        dependencyLoadErrors
      ),

    authority:
      "engineeringExecutor",

    authoritativePromotion: true,

    fakeSuccessAllowed: false,

    staticValidationCanPromote: false,

    aiCanPromote: false,

    masterCanPromote: false,

    artifactRequired: true,

    checksumRequired: true,

    circularMasterRequire: false,

    terminalStates:
      Array.from(
        TERMINAL_STATES
      ),
  };
}

/* ================================================================
   PUBLIC CONTRACT
================================================================ */

module.exports = {
  ORCHESTRATOR_VERSION,

  ENGINEERING_SYSTEM_VERSION,

  STATES,

  TERMINAL_STATES,

  ALLOWED_TRANSITIONS,

  DEFAULT_POLICY,

  normalizeJob,

  normalizeFailure,

  normalizePolicy,

  createRunRecord,

  transition,

  createCheckpoint,

  rollbackToCheckpoint,

  recordFailure,

  recordExecution,

  recordVerification,

  recordAuthoritativeRepairOutcome,

  getAuthoritativeEvidence,

  isAuthoritativeSuccess,

  canPromote,

  promote,

  diagnoseFailure,

  repairFailure,

  applyRepair,

  executeBuild,

  executeLegacyBuild,

  analyzeWithMaster,

  evaluateAutoScale,

  shouldRetry,

  calculateRetryDelay,

  startJob,

  run,

  resume,

  cancelRun,

  finalizeRun,

  getHealth,
};
