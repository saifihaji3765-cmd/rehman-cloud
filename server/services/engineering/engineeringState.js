"use strict";

/**
 * ZyrionOS Engineering State
 * ---------------------------------------------
 * Version: 1.4.0
 * Schema: 4
 *
 * Responsibility:
 * - Engineering run state / source of truth
 * - Run identity compatibility: id + runId
 * - Atomic state transitions
 * - Attempts / failures / repairs / verification
 * - Checkpoints / rollback records
 * - Resource events
 * - Repair pattern learning records
 * - Engineering budgets / limits
 * - Audit trail
 * - Authoritative evidence tracking
 *
 * This module MUST NOT:
 * - execute builds
 * - call AI providers
 * - modify source files
 * - deploy applications
 * - fabricate success
 */

const crypto = require("crypto");

/* =========================================================
 * VERSION
 * ======================================================= */

const SERVICE_VERSION = "1.4.0";
const SCHEMA_VERSION = 4;
const ENGINEERING_SYSTEM_VERSION = "2.0.0";

/* =========================================================
 * STATES
 * ======================================================= */

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

/* =========================================================
 * TERMINAL STATES
 * ======================================================= */

const TERMINAL_STATES = Object.freeze(
  new Set([
    STATES.PASSED,
    STATES.ESCALATED,
    STATES.PROMOTED,
  ])
);

/* =========================================================
 * VALID STATE TRANSITIONS
 * ======================================================= */

const STATE_TRANSITIONS = Object.freeze({
  [STATES.CREATED]: new Set([
    STATES.ANALYZING,
    STATES.ESCALATED,
  ]),

  [STATES.ANALYZING]: new Set([
    STATES.EXECUTING,
    STATES.FAILED,
    STATES.ESCALATED,
  ]),

  [STATES.EXECUTING]: new Set([
    STATES.VERIFYING,
    STATES.FAILED,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ]),

  [STATES.FAILED]: new Set([
    STATES.DIAGNOSING,
    STATES.REPAIRING,
    STATES.ROLLBACK,
    STATES.ESCALATED,
    STATES.EXECUTING,
  ]),

  [STATES.DIAGNOSING]: new Set([
    STATES.REPAIRING,
    STATES.EXECUTING,
    STATES.ROLLBACK,
    STATES.ESCALATED,
    STATES.FAILED,
  ]),

  [STATES.REPAIRING]: new Set([
    STATES.VERIFYING,
    STATES.EXECUTING,
    STATES.FAILED,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ]),

  [STATES.VERIFYING]: new Set([
    STATES.PASSED,
    STATES.FAILED,
    STATES.REPAIRING,
    STATES.EXECUTING,
    STATES.ROLLBACK,
    STATES.ESCALATED,
  ]),

  [STATES.PASSED]: new Set([
    STATES.PROMOTED,
  ]),

  [STATES.ROLLBACK]: new Set([
    STATES.EXECUTING,
    STATES.DIAGNOSING,
    STATES.ESCALATED,
  ]),

  [STATES.ESCALATED]: new Set([]),

  [STATES.PROMOTED]: new Set([]),
});

/* =========================================================
 * GLOBAL ENGINEERING LIMITS
 * ======================================================= */

const ENGINEERING_LIMITS = Object.freeze({
  MAX_ATTEMPTS: 5,
  MAX_REPAIR_ATTEMPTS: 3,
  MAX_DIAGNOSIS_ATTEMPTS: 3,

  MAX_REPAIR_FILES: 25,
  MAX_DEPENDENCY_CHANGES: 15,

  MAX_EXECUTION_TIME: 15 * 60 * 1000,

  MAX_RESOURCE_LIMIT: Object.freeze({
    cpu: 2,
    memory: 2048,
    pids: 256,
    disk: 10 * 1024,
  }),

  MAX_SCOPE_EXPANSION: 1.5,
  MAX_AUTO_SCALE: 4,

  MAX_ROLLBACKS: 2,
  MAX_CHECKPOINTS: 25,

  MAX_OUTPUT_CHARS: 20000,
  MAX_ERROR_MESSAGES: 100,
  MAX_AFFECTED_FILES: 25,
  MAX_AFFECTED_DEPENDENCIES: 15,
});

/* =========================================================
 * COMPATIBILITY LIMITS
 * ======================================================= */

const LIMITS = Object.freeze({
  ...ENGINEERING_LIMITS,

  MAX_EXECUTION_TIME_MS:
    ENGINEERING_LIMITS.MAX_EXECUTION_TIME,

  MAX_CPU:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.cpu,

  MAX_MEMORY_MB:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.memory,

  MAX_PIDS:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.pids,

  MAX_DISK_MB:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.disk,

  MAX_RESOURCE_CPU:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.cpu,

  MAX_RESOURCE_MEMORY:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.memory,

  MAX_RESOURCE_PIDS:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.pids,

  MAX_RESOURCE_DISK:
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT.disk,
});

/* =========================================================
 * ENUMS
 * ======================================================= */

const ATTEMPT_STATUS = Object.freeze({
  CREATED: "created",
  RUNNING: "running",
  FAILED: "failed",
  PASSED: "passed",
  CANCELLED: "cancelled",
  ROLLED_BACK: "rolled_back",
});

const REPAIR_STATUS = Object.freeze({
  PROPOSED: "proposed",
  APPLIED: "applied",
  VERIFIED: "verified",
  FAILED: "failed",
  REJECTED: "rejected",
});

const VERIFICATION_STATUS = Object.freeze({
  PASSED: "passed",
  FAILED: "failed",
  INCONCLUSIVE: "inconclusive",
});

const EXECUTION_STATUS = Object.freeze({
  PASSED: "passed",
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "cancelled",
  TIMEOUT: "timeout",
});

const REPAIR_TYPES = Object.freeze({
  SOURCE_FIX: "source_fix",
  DEPENDENCY_FIX: "dependency_fix",
  CONFIG_FIX: "config_fix",
  BUILD_FIX: "build_fix",
  ARTIFACT_FIX: "artifact_fix",
  ENVIRONMENT_FIX: "environment_fix",
  UNKNOWN: "unknown",
});

/* =========================================================
 * INTERNAL STORAGE
 * ======================================================= */

const runs = new Map();
const attempts = new Map();
const executions = new Map();
const failures = new Map();
const repairs = new Map();
const verifications = new Map();
const artifacts = new Map();
const resourceEvents = new Map();
const checkpoints = new Map();
const rollbacks = new Map();
const patterns = new Map();

/*
 * Kept for compatibility/diagnostics.
 *
 * JavaScript synchronous Map mutations are atomic within a
 * single Node.js event-loop turn. Public State APIs remain
 * synchronous intentionally because Orchestrator/Executor
 * contracts depend on synchronous State methods.
 */
const locks = new Map();

/* =========================================================
 * UTILITIES
 * ======================================================= */

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function finiteNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function nonNegative(value, fallback = 0) {
  const number = finiteNumber(
    value,
    fallback
  );

  return Math.max(0, number);
}

function positiveInteger(
  value,
  fallback
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(
    1,
    Math.floor(number)
  );
}

function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

function safeString(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}

function normalizeArray(
  value,
  max = Infinity
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, max);
}

function timestampMs(value) {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return Date.now();
  }

  return parsed;
}

/* =========================================================
 * LIMIT NORMALIZATION
 * ======================================================= */

function normalizeLimits(input = {}) {
  const requested = input || {};

  const resourceInput =
    requested.resourceLimit ||
    requested.resourceLimits ||
    requested.resources ||
    {};

  const max = ENGINEERING_LIMITS;

  return {
    MAX_ATTEMPTS: clamp(
      positiveInteger(
        requested.MAX_ATTEMPTS,
        max.MAX_ATTEMPTS
      ),
      1,
      max.MAX_ATTEMPTS
    ),

    MAX_REPAIR_ATTEMPTS: clamp(
      positiveInteger(
        requested.MAX_REPAIR_ATTEMPTS,
        max.MAX_REPAIR_ATTEMPTS
      ),
      0,
      max.MAX_REPAIR_ATTEMPTS
    ),

    MAX_DIAGNOSIS_ATTEMPTS: clamp(
      positiveInteger(
        requested.MAX_DIAGNOSIS_ATTEMPTS,
        max.MAX_DIAGNOSIS_ATTEMPTS
      ),
      0,
      max.MAX_DIAGNOSIS_ATTEMPTS
    ),

    MAX_REPAIR_FILES: clamp(
      positiveInteger(
        requested.MAX_REPAIR_FILES,
        max.MAX_REPAIR_FILES
      ),
      1,
      max.MAX_REPAIR_FILES
    ),

    MAX_DEPENDENCY_CHANGES: clamp(
      positiveInteger(
        requested.MAX_DEPENDENCY_CHANGES,
        max.MAX_DEPENDENCY_CHANGES
      ),
      0,
      max.MAX_DEPENDENCY_CHANGES
    ),

    MAX_EXECUTION_TIME: clamp(
      positiveInteger(
        requested.MAX_EXECUTION_TIME ??
          requested.MAX_EXECUTION_TIME_MS,
        max.MAX_EXECUTION_TIME
      ),
      1,
      max.MAX_EXECUTION_TIME
    ),

    MAX_EXECUTION_TIME_MS: clamp(
      positiveInteger(
        requested.MAX_EXECUTION_TIME_MS ??
          requested.MAX_EXECUTION_TIME,
        max.MAX_EXECUTION_TIME
      ),
      1,
      max.MAX_EXECUTION_TIME
    ),

    MAX_SCOPE_EXPANSION: clamp(
      finiteNumber(
        requested.MAX_SCOPE_EXPANSION,
        max.MAX_SCOPE_EXPANSION
      ),
      1,
      max.MAX_SCOPE_EXPANSION
    ),

    MAX_AUTO_SCALE: clamp(
      positiveInteger(
        requested.MAX_AUTO_SCALE,
        max.MAX_AUTO_SCALE
      ),
      1,
      max.MAX_AUTO_SCALE
    ),

    MAX_ROLLBACKS: clamp(
      positiveInteger(
        requested.MAX_ROLLBACKS,
        max.MAX_ROLLBACKS
      ),
      0,
      max.MAX_ROLLBACKS
    ),

    MAX_CHECKPOINTS: clamp(
      positiveInteger(
        requested.MAX_CHECKPOINTS,
        max.MAX_CHECKPOINTS
      ),
      1,
      max.MAX_CHECKPOINTS
    ),

    MAX_OUTPUT_CHARS: clamp(
      positiveInteger(
        requested.MAX_OUTPUT_CHARS,
        max.MAX_OUTPUT_CHARS
      ),
      1000,
      max.MAX_OUTPUT_CHARS
    ),

    MAX_ERROR_MESSAGES: clamp(
      positiveInteger(
        requested.MAX_ERROR_MESSAGES,
        max.MAX_ERROR_MESSAGES
      ),
      1,
      max.MAX_ERROR_MESSAGES
    ),

    MAX_AFFECTED_FILES: clamp(
      positiveInteger(
        requested.MAX_AFFECTED_FILES,
        max.MAX_AFFECTED_FILES
      ),
      1,
      max.MAX_AFFECTED_FILES
    ),

    MAX_AFFECTED_DEPENDENCIES: clamp(
      positiveInteger(
        requested.MAX_AFFECTED_DEPENDENCIES,
        max.MAX_AFFECTED_DEPENDENCIES
      ),
      0,
      max.MAX_AFFECTED_DEPENDENCIES
    ),

    resourceLimit: {
      cpu: clamp(
        finiteNumber(
          resourceInput.cpu,
          max.MAX_RESOURCE_LIMIT.cpu
        ),
        0.1,
        max.MAX_RESOURCE_LIMIT.cpu
      ),

      memory: clamp(
        finiteNumber(
          resourceInput.memory ??
            resourceInput.memoryMB,
          max.MAX_RESOURCE_LIMIT.memory
        ),
        128,
        max.MAX_RESOURCE_LIMIT.memory
      ),

      pids: clamp(
        positiveInteger(
          resourceInput.pids,
          max.MAX_RESOURCE_LIMIT.pids
        ),
        16,
        max.MAX_RESOURCE_LIMIT.pids
      ),

      disk: clamp(
        finiteNumber(
          resourceInput.disk ??
            resourceInput.diskMB,
          max.MAX_RESOURCE_LIMIT.disk
        ),
        256,
        max.MAX_RESOURCE_LIMIT.disk
      ),
    },
  };
}

/* =========================================================
 * RUN ASSERTIONS
 * ======================================================= */

function assertRun(runId) {
  const normalizedRunId =
    safeString(runId);

  const run =
    runs.get(normalizedRunId);

  if (!run) {
    throw new Error(
      `Engineering run not found: ${normalizedRunId}`
    );
  }

  return run;
}

function assertAttempt(attemptId) {
  const attempt =
    attempts.get(attemptId);

  if (!attempt) {
    throw new Error(
      `Engineering attempt not found: ${attemptId}`
    );
  }

  return attempt;
}

function assertTerminalMutationAllowed(
  run
) {
  if (
    TERMINAL_STATES.has(
      run.state
    )
  ) {
    throw new Error(
      `Run ${run.runId} is terminal and cannot be mutated from state ${run.state}`
    );
  }
}

/* =========================================================
 * RUN CREATION
 * ======================================================= */

function createRun(input = {}) {
  const requestedRunId =
    input.runId ||
    input.id ||
    id("engrun");

  const runId =
    safeString(requestedRunId);

  if (runs.has(runId)) {
    throw new Error(
      `Engineering run already exists: ${runId}`
    );
  }

  const limits =
    normalizeLimits(
      input.policy ||
        input.engineeringPolicy ||
        input.limits ||
        {}
    );

  const createdAt = now();

  /*
   * IMPORTANT:
   *
   * `runId` is the canonical external identity.
   * `id` is retained as a compatibility alias.
   *
   * This fixes the State <-> Orchestrator contract mismatch.
   */
  const run = {
    id: runId,
    runId,

    serviceVersion:
      SERVICE_VERSION,

    schemaVersion:
      SCHEMA_VERSION,

    engineeringSystemVersion:
      ENGINEERING_SYSTEM_VERSION,

    projectId:
      input.projectId ||
      null,

    userId:
      input.userId ||
      null,

    projectName:
      input.projectName ||
      null,

    jobId:
      input.jobId ||
      input.requestId ||
      null,

    state:
      STATES.CREATED,

    status:
      "created",

    createdAt,
    updatedAt,

    startedAt:
      null,

    completedAt:
      null,

    deadlineAt:
      null,

    currentAttemptId:
      null,

    attemptCount:
      0,

    repairAttemptCount:
      0,

    diagnosisAttemptCount:
      0,

    rollbackCount:
      0,

    checkpointCount:
      0,

    cancellationRequested:
      false,

    cancellationReason:
      null,

    resumedFrom:
      input.resumedFrom ||
      null,

    policy: {
      ...limits,
    },

    scope:
      clone(
        input.scope ||
          input.planningScope ||
          null
      ),

    scopeExpansion:
      1,

    resources: {
      requested:
        clone(
          input.resources ||
            limits.resourceLimit
        ),

      effective:
        clone(
          limits.resourceLimit
        ),

      scaleFactor:
        1,

      violations: [],
    },

    planning:
      clone(
        input.planning ||
          null
      ),

    sourceHash:
      input.sourceHash ||
      null,

    finalSourceHash:
      input.finalSourceHash ||
      null,

    buildId:
      input.buildId ||
      null,

    artifact:
      null,

    authoritative:
      false,

    validationMode:
      null,

    execution:
      null,

    latestFailureId:
      null,

    latestRepairId:
      null,

    latestVerificationId:
      null,

    latestCheckpointId:
      null,

    latestRollbackId:
      null,

    failureIds: [],
    repairIds: [],
    verificationIds: [],
    artifactIds: [],
    executionIds: [],
    resourceEventIds: [],
    checkpointIds: [],
    rollbackIds: [],

    repairHistory: [],
    verificationHistory: [],

    audit: [],

    recovery: {
      available: false,
      reason: null,
      lastCheckpointId:
        null,
      lastRollbackId:
        null,
    },

    result:
      null,

    error:
      null,

    metadata:
      clone(
        input.metadata ||
          {}
      ),

    version:
      0,
  };

  if (input.deadlineAt) {
    run.deadlineAt =
      input.deadlineAt;
  } else if (
    input.deadlineMs
  ) {
    run.deadlineAt =
      new Date(
        Date.now() +
          Number(
            input.deadlineMs
          )
      ).toISOString();
  }

  runs.set(
    runId,
    run
  );

  appendAudit(run, {
    type:
      "RUN_CREATED",

    state:
      STATES.CREATED,

    metadata: {
      runId,
    },
  });

  return snapshotRun(run);
}

/* =========================================================
 * RUN ACCESS
 * ======================================================= */

function getRun(runId) {
  const run =
    runs.get(
      safeString(runId)
    );

  if (!run) {
    return null;
  }

  return snapshotRun(run);
}

function getMutableRun(runId) {
  return assertRun(runId);
}

function snapshotRun(run) {
  return clone(run);
}

/* =========================================================
 * AUDIT
 * ======================================================= */

function appendAudit(
  run,
  event = {}
) {
  const entry = {
    id:
      id("audit"),

    timestamp:
      now(),

    type:
      safeString(
        event.type,
        "UNKNOWN"
      ),

    fromState:
      event.fromState ??
      null,

    toState:
      event.toState ??
      null,

    state:
      event.state ??
      run.state,

    actor:
      event.actor ||
      "engineering-state",

    reason:
      event.reason ||
      null,

    metadata:
      clone(
        event.metadata ||
          {}
      ),
  };

  run.audit.push(
    entry
  );

  if (
    run.audit.length >
    500
  ) {
    run.audit.splice(
      0,
      run.audit.length -
        500
    );
  }

  run.updatedAt =
    entry.timestamp;

  run.version +=
    1;

  return entry;
}

/* =========================================================
 * STATE TRANSITION
 * ======================================================= */

function canTransition(
  from,
  to
) {
  if (
    !STATES[from] ||
    !STATES[to]
  ) {
    return false;
  }

  if (from === to) {
    return true;
  }

  const allowed =
    STATE_TRANSITIONS[from];

  return Boolean(
    allowed &&
      allowed.has(to)
  );
}

function transitionState(
  runId,
  nextState,
  options = {}
) {
  const run =
    assertRun(runId);

  if (!STATES[nextState]) {
    throw new Error(
      `Invalid engineering state: ${nextState}`
    );
  }

  const previousState =
    run.state;

  if (
    previousState ===
    nextState
  ) {
    appendAudit(run, {
      type:
        "STATE_REASSERTED",

      fromState:
        previousState,

      toState:
        nextState,

      reason:
        options.reason ||
        null,

      actor:
        options.actor ||
        "engineering-orchestrator",

      metadata:
        options.metadata ||
        {},
    });

    return snapshotRun(run);
  }

  if (
    TERMINAL_STATES.has(
      previousState
    )
  ) {
    throw new Error(
      `Illegal transition from terminal state ${previousState} to ${nextState}`
    );
  }

  if (
    !canTransition(
      previousState,
      nextState
    )
  ) {
    throw new Error(
      `Invalid engineering state transition: ${previousState} -> ${nextState}`
    );
  }

  const timestamp =
    now();

  run.state =
    nextState;

  if (
    nextState ===
      STATES.ANALYZING &&
    !run.startedAt
  ) {
    run.startedAt =
      timestamp;
  }

  if (
    TERMINAL_STATES.has(
      nextState
    )
  ) {
    run.completedAt =
      run.completedAt ||
      timestamp;

    run.status =
      nextState ===
        STATES.PASSED ||
      nextState ===
        STATES.PROMOTED
        ? "success"
        : "failed";
  } else {
    run.status =
      nextState.toLowerCase();
  }

  appendAudit(run, {
    type:
      "STATE_TRANSITION",

    fromState:
      previousState,

    toState:
      nextState,

    reason:
      options.reason ||
      null,

    actor:
      options.actor ||
      "engineering-orchestrator",

    metadata:
      options.metadata ||
      {},
  });

  return snapshotRun(run);
}

/* =========================================================
 * ATTEMPTS
 * ======================================================= */

function createAttempt(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  assertTerminalMutationAllowed(
    run
  );

  if (run.currentAttemptId) {
    const current =
      attempts.get(
        run.currentAttemptId
      );

    if (
      current &&
      (
        current.status ===
          ATTEMPT_STATUS.CREATED ||
        current.status ===
          ATTEMPT_STATUS.RUNNING
      )
    ) {
      throw new Error(
        `Run ${runId} already has an active attempt: ${current.id}`
      );
    }
  }

  if (
    run.attemptCount >=
    run.policy.MAX_ATTEMPTS
  ) {
    throw new Error(
      `Maximum engineering attempts exceeded for run ${runId}`
    );
  }

  const attemptId =
    input.attemptId ||
    id("attempt");

  if (
    attempts.has(attemptId)
  ) {
    throw new Error(
      `Engineering attempt already exists: ${attemptId}`
    );
  }

  const timestamp =
    now();

  const attempt = {
    id:
      attemptId,

    runId,

    number:
      run.attemptCount +
      1,

    status:
      ATTEMPT_STATUS.CREATED,

    createdAt:
      timestamp,

    startedAt:
      null,

    completedAt:
      null,

    stateAtCreation:
      run.state,

    executionId:
      null,

    failureRecordId:
      null,

    repairRecordId:
      null,

    verificationRecordId:
      null,

    sourceHashBefore:
      input.sourceHashBefore ||
      run.finalSourceHash ||
      run.sourceHash ||
      null,

    sourceHashAfter:
      input.sourceHashAfter ||
      null,

    buildId:
      input.buildId ||
      null,

    authoritative:
      false,

    validationMode:
      input.validationMode ||
      null,

    resourceEventIds:
      [],

    metadata:
      clone(
        input.metadata ||
          {}
      ),

    error:
      null,
  };

  attempts.set(
    attemptId,
    attempt
  );

  run.attemptCount +=
    1;

  run.currentAttemptId =
    attemptId;

  appendAudit(run, {
    type:
      "ATTEMPT_CREATED",

    metadata: {
      attemptId,

      attemptNumber:
        attempt.number,
    },
  });

  return snapshotAttempt(
    attempt
  );
}

function startAttempt(
  attemptId
) {
  const attempt =
    assertAttempt(
      attemptId
    );

  if (
    attempt.status !==
      ATTEMPT_STATUS.CREATED
  ) {
    throw new Error(
      `Attempt ${attemptId} cannot start from status ${attempt.status}`
    );
  }

  attempt.status =
    ATTEMPT_STATUS.RUNNING;

  attempt.startedAt =
    now();

  return snapshotAttempt(
    attempt
  );
}

function completeAttempt(
  attemptId,
  result = {}
) {
  const attempt =
    assertAttempt(
      attemptId
    );

  if (
    attempt.status !==
      ATTEMPT_STATUS.RUNNING
  ) {
    throw new Error(
      `Attempt ${attemptId} is not running`
    );
  }

  attempt.completedAt =
    now();

  if (
    result.cancelled
  ) {
    attempt.status =
      ATTEMPT_STATUS.CANCELLED;
  } else if (
    result.success === true
  ) {
    attempt.status =
      ATTEMPT_STATUS.PASSED;
  } else {
    attempt.status =
      ATTEMPT_STATUS.FAILED;
  }

  attempt.sourceHashAfter =
    result.sourceHash ||
    result.sourceHashAfter ||
    attempt.sourceHashAfter ||
    null;

  attempt.buildId =
    result.buildId ||
    attempt.buildId ||
    null;

  attempt.authoritative =
    result.authoritative ===
    true;

  attempt.validationMode =
    result.validationMode ||
    attempt.validationMode ||
    null;

  attempt.error =
    clone(
      result.error ||
        null
    );

  return snapshotAttempt(
    attempt
  );
}

function cancelAttempt(
  attemptId,
  reason
) {
  const attempt =
    assertAttempt(
      attemptId
    );

  if (
    attempt.status ===
      ATTEMPT_STATUS.PASSED ||
    attempt.status ===
      ATTEMPT_STATUS.FAILED ||
    attempt.status ===
      ATTEMPT_STATUS.ROLLED_BACK ||
    attempt.status ===
      ATTEMPT_STATUS.CANCELLED
  ) {
    return snapshotAttempt(
      attempt
    );
  }

  attempt.status =
    ATTEMPT_STATUS.CANCELLED;

  attempt.completedAt =
    now();

  attempt.error = {
    message:
      reason ||
      "Attempt cancelled",
  };

  return snapshotAttempt(
    attempt
  );
}

function markAttemptRolledBack(
  attemptId,
  reason
) {
  const attempt =
    assertAttempt(
      attemptId
    );

  attempt.status =
    ATTEMPT_STATUS.ROLLED_BACK;

  attempt.completedAt =
    attempt.completedAt ||
    now();

  attempt.error = {
    message:
      reason ||
      "Attempt rolled back",
  };

  return snapshotAttempt(
    attempt
  );
}

function getAttempt(
  attemptId
) {
  const attempt =
    attempts.get(
      attemptId
    );

  return attempt
    ? snapshotAttempt(attempt)
    : null;
}

function snapshotAttempt(
  attempt
) {
  return clone(attempt);
}

/* =========================================================
 * EXECUTION RECORD
 * ======================================================= */

function normalizeExecutionStatus(
  status
) {
  const value =
    safeString(
      status
    ).toLowerCase();

  if (
    value ===
      EXECUTION_STATUS.SUCCESS ||
    value ===
      "ok"
  ) {
    return EXECUTION_STATUS.PASSED;
  }

  if (
    Object.values(
      EXECUTION_STATUS
    ).includes(value)
  ) {
    return value;
  }

  return EXECUTION_STATUS.FAILED;
}

function recordExecution(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  const executionId =
    input.executionId ||
    id("execution");

  if (
    executions.has(
      executionId
    )
  ) {
    throw new Error(
      `Execution already exists: ${executionId}`
    );
  }

  const record = {
    id:
      executionId,

    runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    type:
      input.type ||
      "build",

    status:
      normalizeExecutionStatus(
        input.status ||
          (
            input.success === true
              ? EXECUTION_STATUS.PASSED
              : EXECUTION_STATUS.FAILED
          )
      ),

    startedAt:
      input.startedAt ||
      null,

    completedAt:
      input.completedAt ||
      now(),

    exitCode:
      input.exitCode ??
      null,

    signal:
      input.signal ||
      null,

    timedOut:
      input.timedOut ===
      true,

    cancelled:
      input.cancelled ===
      true,

    success:
      input.success === true,

    authoritative:
      input.authoritative ===
      true,

    validationMode:
      input.validationMode ||
      null,

    buildId:
      input.buildId ||
      null,

    buildCommand:
      input.buildCommand ||
      null,

    installCommand:
      input.installCommand ||
      null,

    stdout:
      safeString(
        input.stdout
      ).slice(
        -run.policy
          .MAX_OUTPUT_CHARS
      ),

    stderr:
      safeString(
        input.stderr
      ).slice(
        -run.policy
          .MAX_OUTPUT_CHARS
      ),

    errors:
      normalizeArray(
        input.errors,
        run.policy
          .MAX_ERROR_MESSAGES
      ),

    warnings:
      normalizeArray(
        input.warnings,
        run.policy
          .MAX_ERROR_MESSAGES
      ),

    sourceHash:
      input.sourceHash ||
      null,

    artifact:
      clone(
        input.artifact ||
          null
      ),

    resourceUsage:
      clone(
        input.resourceUsage ||
          null
      ),

    metadata:
      clone(
        input.metadata ||
          {}
      ),
  };

  executions.set(
    executionId,
    record
  );

  run.executionIds.push(
    executionId
  );

  run.execution =
    clone(record);

  if (record.buildId) {
    run.buildId =
      record.buildId;
  }

  if (
    record.authoritative
  ) {
    run.authoritative =
      true;
  }

  if (
    record.validationMode
  ) {
    run.validationMode =
      record.validationMode;
  }

  if (
    record.artifact
  ) {
    run.artifact =
      clone(
        record.artifact
      );
  }

  const attempt =
    record.attemptId
      ? attempts.get(
          record.attemptId
        )
      : null;

  if (attempt) {
    attempt.executionId =
      executionId;

    attempt.buildId =
      record.buildId ||
      attempt.buildId;

    attempt.authoritative =
      record.authoritative;

    attempt.validationMode =
      record.validationMode ||
      attempt.validationMode;
  }

  appendAudit(run, {
    type:
      "EXECUTION_RECORDED",

    metadata: {
      executionId,

      attemptId:
        record.attemptId,

      status:
        record.status,

      authoritative:
        record.authoritative,
    },
  });

  return clone(record);
}

/* =========================================================
 * FAILURE
 * ======================================================= */

function normalizeFailure(
  run,
  input = {}
) {
  const affectedFiles =
    normalizeArray(
      input.affectedFiles,
      run.policy
        .MAX_AFFECTED_FILES
    );

  const affectedDependencies =
    normalizeArray(
      input.affectedDependencies,
      run.policy
        .MAX_AFFECTED_DEPENDENCIES
    );

  return {
    id:
      input.id ||
      id("failure"),

    runId:
      run.runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    timestamp:
      input.timestamp ||
      now(),

    stage:
      input.stage ||
      input.failureStage ||
      "unknown",

    category:
      input.category ||
      "unknown",

    signature:
      input.signature ||
      null,

    message:
      safeString(
        input.message ||
          input.error ||
          "Engineering execution failed"
      ).slice(
        0,
        5000
      ),

    errors:
      normalizeArray(
        input.errors,
        run.policy
          .MAX_ERROR_MESSAGES
      ),

    stdout:
      safeString(
        input.stdout
      ).slice(
        -run.policy
          .MAX_OUTPUT_CHARS
      ),

    stderr:
      safeString(
        input.stderr
      ).slice(
        -run.policy
          .MAX_OUTPUT_CHARS
      ),

    exitCode:
      input.exitCode ??
      null,

    signal:
      input.signal ||
      null,

    timedOut:
      input.timedOut ===
      true,

    retryable:
      input.retryable ===
      true,

    authoritative:
      input.authoritative ===
      true,

    validationMode:
      input.validationMode ||
      null,

    buildId:
      input.buildId ||
      null,

    sourceHash:
      input.sourceHash ||
      null,

    buildCommand:
      input.buildCommand ||
      null,

    installCommand:
      input.installCommand ||
      null,

    resourceViolation:
      input.resourceViolation ===
      true,

    affectedFiles,

    affectedDependencies,

    metadata:
      clone(
        input.metadata ||
          {}
      ),
  };
}

function recordFailure(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  const failure =
    normalizeFailure(
      run,
      input
    );

  if (
    failures.has(
      failure.id
    )
  ) {
    throw new Error(
      `Failure already exists: ${failure.id}`
    );
  }

  failures.set(
    failure.id,
    failure
  );

  run.failureIds.push(
    failure.id
  );

  run.latestFailureId =
    failure.id;

  if (failure.sourceHash) {
    run.finalSourceHash =
      failure.sourceHash;
  }

  const attempt =
    failure.attemptId
      ? attempts.get(
          failure.attemptId
        )
      : null;

  if (attempt) {
    attempt.failureRecordId =
      failure.id;

    attempt.status =
      ATTEMPT_STATUS.FAILED;

    attempt.completedAt =
      attempt.completedAt ||
      now();

    attempt.error =
      clone(failure);
  }

  appendAudit(run, {
    type:
      "FAILURE_RECORDED",

    metadata: {
      failureId:
        failure.id,

      category:
        failure.category,

      stage:
        failure.stage,

      retryable:
        failure.retryable,
    },
  });

  return clone(failure);
}

function getFailure(
  failureId
) {
  const failure =
    failures.get(
      failureId
    );

  return failure
    ? clone(failure)
    : null;
}

/* =========================================================
 * REPAIR
 * ======================================================= */

function createRepair(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  assertTerminalMutationAllowed(
    run
  );

  if (
    run.repairAttemptCount >=
    run.policy
      .MAX_REPAIR_ATTEMPTS
  ) {
    throw new Error(
      `Maximum repair attempts exceeded for run ${runId}`
    );
  }

  const repairId =
    input.repairId ||
    id("repair");

  if (
    repairs.has(
      repairId
    )
  ) {
    throw new Error(
      `Repair already exists: ${repairId}`
    );
  }

  const affectedFiles =
    normalizeArray(
      input.affectedFiles ||
        input.files,
      run.policy
        .MAX_REPAIR_FILES
    );

  const dependencyChanges =
    normalizeArray(
      input.dependencyChanges,
      run.policy
        .MAX_DEPENDENCY_CHANGES
    );

  const repair = {
    id:
      repairId,

    runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    failureId:
      input.failureId ||
      run.latestFailureId ||
      null,

    timestamp:
      now(),

    type:
      input.type ||
      REPAIR_TYPES.UNKNOWN,

    status:
      input.status ||
      REPAIR_STATUS.PROPOSED,

    reason:
      input.reason ||
      null,

    confidence:
      clamp(
        finiteNumber(
          input.confidence,
          0
        ),
        0,
        1
      ),

    affectedFiles,

    dependencyChanges,

    sourceHashBefore:
      input.sourceHashBefore ||
      run.finalSourceHash ||
      run.sourceHash ||
      null,

    sourceHashAfter:
      input.sourceHashAfter ||
      null,

    changedBytes:
      nonNegative(
        input.changedBytes,
        0
      ),

    patchBytes:
      nonNegative(
        input.patchBytes,
        0
      ),

    newFiles:
      normalizeArray(
        input.newFiles,
        run.policy
          .MAX_REPAIR_FILES
      ),

    deletedFiles:
      normalizeArray(
        input.deletedFiles,
        run.policy
          .MAX_REPAIR_FILES
      ),

    metadata:
      clone(
        input.metadata ||
          {}
      ),
  };

  repairs.set(
    repairId,
    repair
  );

  run.repairIds.push(
    repairId
  );

  run.latestRepairId =
    repairId;

  run.repairAttemptCount +=
    1;

  run.repairHistory.push({
    repairId,

    type:
      repair.type,

    status:
      repair.status,

    timestamp:
      repair.timestamp,
  });

  const attempt =
    repair.attemptId
      ? attempts.get(
          repair.attemptId
        )
      : null;

  if (attempt) {
    attempt.repairRecordId =
      repairId;
  }

  appendAudit(run, {
    type:
      "REPAIR_RECORDED",

    metadata: {
      repairId,

      type:
        repair.type,

      affectedFiles:
        affectedFiles.length,

      dependencyChanges:
        dependencyChanges.length,
    },
  });

  return clone(repair);
}

function updateRepair(
  repairId,
  patch = {}
) {
  const repair =
    repairs.get(
      repairId
    );

  if (!repair) {
    throw new Error(
      `Repair not found: ${repairId}`
    );
  }

  if (
    patch.status &&
    !Object.values(
      REPAIR_STATUS
    ).includes(
      patch.status
    )
  ) {
    throw new Error(
      `Invalid repair status: ${patch.status}`
    );
  }

  Object.assign(
    repair,
    clone(patch)
  );

  repair.updatedAt =
    now();

  return clone(repair);
}

function recordRepair(
  runId,
  input = {}
) {
  return createRepair(
    runId,
    input
  );
}

function getRepair(
  repairId
) {
  const repair =
    repairs.get(
      repairId
    );

  return repair
    ? clone(repair)
    : null;
}

/* =========================================================
 * VERIFICATION
 * ======================================================= */

function recordVerification(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  const verificationId =
    input.verificationId ||
    id("verification");

  if (
    verifications.has(
      verificationId
    )
  ) {
    throw new Error(
      `Verification already exists: ${verificationId}`
    );
  }

  const status =
    input.status ||
    (
      input.success === true
        ? VERIFICATION_STATUS.PASSED
        : VERIFICATION_STATUS.FAILED
    );

  if (
    !Object.values(
      VERIFICATION_STATUS
    ).includes(status)
  ) {
    throw new Error(
      `Invalid verification status: ${status}`
    );
  }

  const record = {
    id:
      verificationId,

    runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    timestamp:
      input.timestamp ||
      now(),

    status,

    success:
      status ===
      VERIFICATION_STATUS.PASSED,

    authoritative:
      input.authoritative ===
      true,

    validationMode:
      input.validationMode ||
      null,

    buildId:
      input.buildId ||
      null,

    sourceHash:
      input.sourceHash ||
      null,

    checks:
      clone(
        input.checks ||
          {}
      ),

    errors:
      normalizeArray(
        input.errors,
        run.policy
          .MAX_ERROR_MESSAGES
      ),

    warnings:
      normalizeArray(
        input.warnings,
        run.policy
          .MAX_ERROR_MESSAGES
      ),

    artifact:
      clone(
        input.artifact ||
          null
      ),

    metadata:
      clone(
        input.metadata ||
          {}
      ),
  };

  /*
   * A successful verification is not allowed to silently
   * become authoritative unless the verification itself
   * carries authoritative evidence.
   */
  if (
    record.success &&
    record.authoritative &&
    record.validationMode ===
      "authoritative"
  ) {
    if (
      !isAuthoritativeSuccess({
        success: true,
        authoritative:
          record.authoritative,
        validationMode:
          record.validationMode,
        buildId:
          record.buildId,
        artifact:
          record.artifact,
      })
    ) {
      throw new Error(
        "Authoritative verification requires complete authoritative artifact evidence"
      );
    }
  }

  verifications.set(
    verificationId,
    record
  );

  run.verificationIds.push(
    verificationId
  );

  run.latestVerificationId =
    verificationId;

  run.verificationHistory.push({
    verificationId,

    status,

    timestamp:
      record.timestamp,
  });

  const attempt =
    record.attemptId
      ? attempts.get(
          record.attemptId
        )
      : null;

  if (attempt) {
    attempt.verificationRecordId =
      verificationId;
  }

  appendAudit(run, {
    type:
      "VERIFICATION_RECORDED",

    metadata: {
      verificationId,

      status,

      authoritative:
        record.authoritative,
    },
  });

  return clone(record);
}

function getVerification(
  verificationId
) {
  const verification =
    verifications.get(
      verificationId
    );

  return verification
    ? clone(verification)
    : null;
}

/* =========================================================
 * ARTIFACT
 * ======================================================= */

function recordArtifact(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  const artifactId =
    input.artifactId ||
    id("artifact");

  if (
    artifacts.has(
      artifactId
    )
  ) {
    throw new Error(
      `Artifact already exists: ${artifactId}`
    );
  }

  const artifact = {
    id:
      artifactId,

    runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    timestamp:
      input.timestamp ||
      now(),

    name:
      input.name ||
      null,

    path:
      input.path ||
      null,

    storageKey:
      input.storageKey ||
      null,

    url:
      input.url ||
      null,

    checksum:
      input.checksum ||
      null,

    size:
      nonNegative(
        input.size,
        0
      ),

    contentType:
      input.contentType ||
      null,

    authoritative:
      input.authoritative ===
      true,

    verified:
      input.verified ===
      true,

    metadata:
      clone(
        input.metadata ||
          {}
      ),
  };

  /*
   * Keep artifact as the authoritative evidence object only
   * when the caller explicitly supplies authoritative=true.
   * State never fabricates this flag.
   */
  artifacts.set(
    artifactId,
    artifact
  );

  run.artifactIds.push(
    artifactId
  );

  run.artifact =
    clone(artifact);

  if (
    artifact.authoritative
  ) {
    run.authoritative =
      true;

    run.validationMode =
      "authoritative";
  }

  appendAudit(run, {
    type:
      "ARTIFACT_RECORDED",

    metadata: {
      artifactId,

      checksum:
        artifact.checksum,

      authoritative:
        artifact.authoritative,

      verified:
        artifact.verified,
    },
  });

  return clone(artifact);
}

function getArtifact(
  artifactId
) {
  const artifact =
    artifacts.get(
      artifactId
    );

  return artifact
    ? clone(artifact)
    : null;
}

/* =========================================================
 * RESOURCE EVENTS
 * ======================================================= */

function recordResourceEvent(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  const eventId =
    input.eventId ||
    id("resource");

  if (
    resourceEvents.has(
      eventId
    )
  ) {
    throw new Error(
      `Resource event already exists: ${eventId}`
    );
  }

  const event = {
    id:
      eventId,

    runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    timestamp:
      input.timestamp ||
      now(),

    type:
      input.type ||
      "sample",

    cpu:
      finiteNumber(
        input.cpu,
        0
      ),

    memory:
      finiteNumber(
        input.memory ??
          input.memoryMB,
        0
      ),

    pids:
      finiteNumber(
        input.pids,
        0
      ),

    disk:
      finiteNumber(
        input.disk ??
          input.diskMB,
        0
      ),

    limit:
      clone(
        input.limit ||
          run.policy
            .resourceLimit
      ),

    violation:
      input.violation ===
      true,

    violations:
      normalizeArray(
        input.violations,
        25
      ),

    metadata:
      clone(
        input.metadata ||
          {}
      ),
  };

  resourceEvents.set(
    eventId,
    event
  );

  run.resourceEventIds.push(
    eventId
  );

  if (event.violation) {
    run.resources.violations.push({
      eventId,

      timestamp:
        event.timestamp,

      violations:
        clone(
          event.violations
        ),
    });
  }

  if (event.attemptId) {
    const attempt =
      attempts.get(
        event.attemptId
      );

    if (attempt) {
      attempt.resourceEventIds.push(
        eventId
      );
    }
  }

  appendAudit(run, {
    type:
      "RESOURCE_EVENT",

    metadata: {
      eventId,

      violation:
        event.violation,
    },
  });

  return clone(event);
}

function getResourceEvent(
  eventId
) {
  const event =
    resourceEvents.get(
      eventId
    );

  return event
    ? clone(event)
    : null;
}

/* =========================================================
 * CHECKPOINT
 * ======================================================= */

function createCheckpoint(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  assertTerminalMutationAllowed(
    run
  );

  if (
    run.checkpointCount >=
    run.policy.MAX_CHECKPOINTS
  ) {
    throw new Error(
      `Maximum checkpoints exceeded for run ${runId}`
    );
  }

  const checkpointId =
    input.checkpointId ||
    id("checkpoint");

  if (
    checkpoints.has(
      checkpointId
    )
  ) {
    throw new Error(
      `Checkpoint already exists: ${checkpointId}`
    );
  }

  const checkpoint = {
    id:
      checkpointId,

    runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    timestamp:
      input.timestamp ||
      now(),

    sourceHash:
      input.sourceHash ||
      run.finalSourceHash ||
      run.sourceHash ||
      null,

    /*
     * IMPORTANT:
     * Executor-generated checkpoint archives need these
     * fields for rollback.
     */
    storageKey:
      input.storageKey ||
      null,

    path:
      input.path ||
      null,

    checksum:
      input.checksum ||
      null,

    size:
      nonNegative(
        input.size,
        0
      ),

    name:
      input.name ||
      null,

    files:
      normalizeArray(
        input.files,
        run.policy
          .MAX_REPAIR_FILES
      ),

    artifact:
      clone(
        input.artifact ||
          null
      ),

    state:
      run.state,

    metadata:
      clone(
        input.metadata ||
          {}
      ),

    valid:
      input.valid !== false,
  };

  /*
   * A checkpoint with artifact evidence can expose the
   * artifact information without manufacturing authority.
   */
  if (
    checkpoint.artifact
  ) {
    checkpoint.artifact =
      clone(
        checkpoint.artifact
      );
  }

  checkpoints.set(
    checkpointId,
    checkpoint
  );

  run.checkpointIds.push(
    checkpointId
  );

  run.checkpointCount +=
    1;

  run.latestCheckpointId =
    checkpointId;

  run.recovery.available =
    checkpoint.valid === true;

  run.recovery.lastCheckpointId =
    checkpointId;

  appendAudit(run, {
    type:
      "CHECKPOINT_CREATED",

    metadata: {
      checkpointId,

      storageKey:
        checkpoint.storageKey,

      path:
        checkpoint.path,

      checksum:
        checkpoint.checksum,

      valid:
        checkpoint.valid,
    },
  });

  return clone(checkpoint);
}

function getCheckpoint(
  checkpointId
) {
  const checkpoint =
    checkpoints.get(
      checkpointId
    );

  return checkpoint
    ? clone(checkpoint)
    : null;
}

/* =========================================================
 * ROLLBACK
 * ======================================================= */

function recordRollback(
  runId,
  input = {}
) {
  const run =
    assertRun(runId);

  if (
    run.state ===
      STATES.PASSED ||
    run.state ===
      STATES.PROMOTED
  ) {
    throw new Error(
      `Cannot rollback terminal successful run ${runId}`
    );
  }

  if (
    run.rollbackCount >=
    run.policy.MAX_ROLLBACKS
  ) {
    throw new Error(
      `Maximum rollbacks exceeded for run ${runId}`
    );
  }

  const rollbackId =
    input.rollbackId ||
    id("rollback");

  if (
    rollbacks.has(
      rollbackId
    )
  ) {
    throw new Error(
      `Rollback already exists: ${rollbackId}`
    );
  }

  const checkpointId =
    input.checkpointId ||
    run.latestCheckpointId ||
    null;

  const checkpoint =
    checkpointId
      ? checkpoints.get(
          checkpointId
        )
      : null;

  if (
    checkpointId &&
    !checkpoint
  ) {
    throw new Error(
      `Rollback checkpoint not found: ${checkpointId}`
    );
  }

  if (
    checkpoint &&
    checkpoint.valid !== true
  ) {
    throw new Error(
      `Rollback checkpoint is invalid: ${checkpointId}`
    );
  }

  const rollback = {
    id:
      rollbackId,

    runId,

    attemptId:
      input.attemptId ||
      run.currentAttemptId ||
      null,

    checkpointId,

    timestamp:
      input.timestamp ||
      now(),

    reason:
      input.reason ||
      "Engineering rollback",

    sourceHashBefore:
      input.sourceHashBefore ||
      run.finalSourceHash ||
      null,

    sourceHashAfter:
      input.sourceHashAfter ||
      (
        checkpoint
          ? checkpoint.sourceHash
          : null
      ),

    storageKey:
      input.storageKey ||
      (
        checkpoint
          ? checkpoint.storageKey
          : null
      ),

    path:
      input.path ||
      (
        checkpoint
          ? checkpoint.path
          : null
      ),

    checksum:
      input.checksum ||
      (
        checkpoint
          ? checkpoint.checksum
          : null
      ),

    success:
      input.success !== false,

    metadata:
      clone(
        input.metadata ||
          {}
      ),
  };

  rollbacks.set(
    rollbackId,
    rollback
  );

  run.rollbackIds.push(
    rollbackId
  );

  run.rollbackCount +=
    1;

  run.latestRollbackId =
    rollbackId;

  run.recovery.lastRollbackId =
    rollbackId;

  run.recovery.available =
    Boolean(
      checkpointId &&
        checkpoint &&
        checkpoint.valid
    );

  if (run.currentAttemptId) {
    const attempt =
      attempts.get(
        run.currentAttemptId
      );

    if (attempt) {
      markAttemptRolledBack(
        attempt.id,
        rollback.reason
      );
    }
  }

  appendAudit(run, {
    type:
      "ROLLBACK_RECORDED",

    metadata: {
      rollbackId,

      checkpointId,

      storageKey:
        rollback.storageKey,

      checksum:
        rollback.checksum,

      success:
        rollback.success,
    },
  });

  return clone(rollback);
}

function getRollback(
  rollbackId
) {
  const rollback =
    rollbacks.get(
      rollbackId
    );

  return rollback
    ? clone(rollback)
    : null;
}

/* =========================================================
 * REPAIR PATTERNS / LEARNING
 * ======================================================= */

function normalizePattern(
  input = {}
) {
  return {
    id:
      input.id ||
      id("pattern"),

    signature:
      input.signature ||
      null,

    category:
      input.category ||
      "unknown",

    repairType:
      input.repairType ||
      REPAIR_TYPES.UNKNOWN,

    description:
      input.description ||
      null,

    source:
      input.source ||
      "engineering",

    successCount:
      Math.max(
        0,
        Math.floor(
          finiteNumber(
            input.successCount,
            0
          )
        )
      ),

    failureCount:
      Math.max(
        0,
        Math.floor(
          finiteNumber(
            input.failureCount,
            0
          )
        )
      ),

    confidence:
      clamp(
        finiteNumber(
          input.confidence,
          0
        ),
        0,
        1
      ),

    examples:
      normalizeArray(
        input.examples,
        20
      ),

    metadata:
      clone(
        input.metadata ||
          {}
      ),

    createdAt:
      input.createdAt ||
      now(),

    updatedAt:
      now(),
  };
}

function recordPattern(
  input = {}
) {
  const incoming =
    normalizePattern(
      input
    );

  const key =
    incoming.signature ||
    incoming.id;

  const existing =
    patterns.get(key);

  if (existing) {
    existing.successCount +=
      incoming.successCount;

    existing.failureCount +=
      incoming.failureCount;

    if (
      incoming.description
    ) {
      existing.description =
        incoming.description;
    }

    if (
      incoming.repairType
    ) {
      existing.repairType =
        incoming.repairType;
    }

    existing.confidence =
      clamp(
        finiteNumber(
          incoming.confidence,
          existing.confidence
        ),
        0,
        1
      );

    existing.examples = [
      ...existing.examples,
      ...incoming.examples,
    ].slice(-20);

    existing.updatedAt =
      now();

    return clone(existing);
  }

  patterns.set(
    key,
    incoming
  );

  return clone(incoming);
}

function getPattern(
  signature
) {
  const pattern =
    patterns.get(
      signature
    );

  return pattern
    ? clone(pattern)
    : null;
}

function listPatterns() {
  return Array.from(
    patterns.values()
  ).map(clone);
}

/* =========================================================
 * BUDGET HELPERS
 * ======================================================= */

function getRunBudget(
  runId
) {
  const run =
    assertRun(runId);

  return {
    attempts: {
      used:
        run.attemptCount,

      limit:
        run.policy.MAX_ATTEMPTS,

      remaining:
        Math.max(
          0,
          run.policy.MAX_ATTEMPTS -
            run.attemptCount
        ),
    },

    repairs: {
      used:
        run.repairAttemptCount,

      limit:
        run.policy
          .MAX_REPAIR_ATTEMPTS,

      remaining:
        Math.max(
          0,
          run.policy
            .MAX_REPAIR_ATTEMPTS -
            run.repairAttemptCount
        ),
    },

    diagnoses: {
      used:
        run.diagnosisAttemptCount,

      limit:
        run.policy
          .MAX_DIAGNOSIS_ATTEMPTS,

      remaining:
        Math.max(
          0,
          run.policy
            .MAX_DIAGNOSIS_ATTEMPTS -
            run.diagnosisAttemptCount
        ),
    },

    rollbacks: {
      used:
        run.rollbackCount,

      limit:
        run.policy.MAX_ROLLBACKS,

      remaining:
        Math.max(
          0,
          run.policy.MAX_ROLLBACKS -
            run.rollbackCount
        ),
    },

    checkpoints: {
      used:
        run.checkpointCount,

      limit:
        run.policy
          .MAX_CHECKPOINTS,

      remaining:
        Math.max(
          0,
          run.policy
            .MAX_CHECKPOINTS -
            run.checkpointCount
        ),
    },

    executionTime: {
      limit:
        run.policy
          .MAX_EXECUTION_TIME_MS,

      deadlineAt:
        run.deadlineAt,
    },

    scopeExpansion: {
      current:
        run.scopeExpansion,

      limit:
        run.policy
          .MAX_SCOPE_EXPANSION,

      remaining:
        Math.max(
          0,
          run.policy
            .MAX_SCOPE_EXPANSION -
            run.scopeExpansion
        ),
    },
  };
}

function canCreateAttempt(
  runId
) {
  const run =
    assertRun(runId);

  if (
    TERMINAL_STATES.has(
      run.state
    )
  ) {
    return false;
  }

  if (
    run.cancellationRequested
  ) {
    return false;
  }

  if (
    run.attemptCount >=
    run.policy.MAX_ATTEMPTS
  ) {
    return false;
  }

  if (run.currentAttemptId) {
    const attempt =
      attempts.get(
        run.currentAttemptId
      );

    if (
      attempt &&
      (
        attempt.status ===
          ATTEMPT_STATUS.CREATED ||
        attempt.status ===
          ATTEMPT_STATUS.RUNNING
      )
    ) {
      return false;
    }
  }

  return true;
}

function canRepair(
  runId
) {
  const run =
    assertRun(runId);

  return (
    !TERMINAL_STATES.has(
      run.state
    ) &&
    !run.cancellationRequested &&
    run.repairAttemptCount <
      run.policy
        .MAX_REPAIR_ATTEMPTS
  );
}

function canDiagnose(
  runId
) {
  const run =
    assertRun(runId);

  return (
    !TERMINAL_STATES.has(
      run.state
    ) &&
    !run.cancellationRequested &&
    run.diagnosisAttemptCount <
      run.policy
        .MAX_DIAGNOSIS_ATTEMPTS
  );
}

function incrementDiagnosisAttempt(
  runId
) {
  const run =
    assertRun(runId);

  assertTerminalMutationAllowed(
    run
  );

  if (
    run.diagnosisAttemptCount >=
    run.policy
      .MAX_DIAGNOSIS_ATTEMPTS
  ) {
    throw new Error(
      `Maximum diagnosis attempts exceeded for run ${runId}`
    );
  }

  run.diagnosisAttemptCount +=
    1;

  appendAudit(run, {
    type:
      "DIAGNOSIS_ATTEMPT",

    metadata: {
      count:
        run.diagnosisAttemptCount,
    },
  });

  return run.diagnosisAttemptCount;
}

/* =========================================================
 * SCOPE
 * ======================================================= */

function updateScopeExpansion(
  runId,
  value
) {
  const run =
    assertRun(runId);

  assertTerminalMutationAllowed(
    run
  );

  const expansion =
    finiteNumber(
      value,
      run.scopeExpansion
    );

  if (
    expansion >
    run.policy
      .MAX_SCOPE_EXPANSION
  ) {
    throw new Error(
      `Scope expansion ${expansion} exceeds limit ${run.policy.MAX_SCOPE_EXPANSION}`
    );
  }

  if (expansion < 1) {
    throw new Error(
      "Scope expansion cannot be below 1"
    );
  }

  run.scopeExpansion =
    expansion;

  appendAudit(run, {
    type:
      "SCOPE_UPDATED",

    metadata: {
      scopeExpansion:
        expansion,
    },
  });

  return run.scopeExpansion;
}

/* =========================================================
 * RESOURCE LIMITS
 * ======================================================= */

function updateEffectiveResources(
  runId,
  resources = {}
) {
  const run =
    assertRun(runId);

  assertTerminalMutationAllowed(
    run
  );

  const current =
    run.resources.effective;

  const requested = {
    cpu:
      finiteNumber(
        resources.cpu,
        current.cpu
      ),

    memory:
      finiteNumber(
        resources.memory ??
          resources.memoryMB,
        current.memory
      ),

    pids:
      positiveInteger(
        resources.pids,
        current.pids
      ),

    disk:
      finiteNumber(
        resources.disk ??
          resources.diskMB,
        current.disk
      ),
  };

  const limit =
    run.policy.resourceLimit;

  const next = {
    cpu:
      clamp(
        requested.cpu,
        0.1,
        limit.cpu
      ),

    memory:
      clamp(
        requested.memory,
        128,
        limit.memory
      ),

    pids:
      clamp(
        requested.pids,
        16,
        limit.pids
      ),

    disk:
      clamp(
        requested.disk,
        256,
        limit.disk
      ),
  };

  run.resources.effective =
    next;

  run.resources.scaleFactor =
    Math.max(
      next.cpu /
        Math.max(
          0.1,
          limit.cpu
        ),
      next.memory /
        Math.max(
          128,
          limit.memory
        ),
      next.pids /
        Math.max(
          16,
          limit.pids
        ),
      next.disk /
        Math.max(
          256,
          limit.disk
        ),
      1
    );

  appendAudit(run, {
    type:
      "RESOURCE_LIMIT_UPDATED",

    metadata: {
      resources:
        clone(next),
    },
  });

  return clone(next);
}

/* =========================================================
 * CANCELLATION
 * ======================================================= */

function requestCancellation(
  runId,
  reason
) {
  const run =
    assertRun(runId);

  if (
    TERMINAL_STATES.has(
      run.state
    )
  ) {
    return snapshotRun(run);
  }

  run.cancellationRequested =
    true;

  run.cancellationReason =
    reason ||
    "Cancellation requested";

  appendAudit(run, {
    type:
      "CANCELLATION_REQUESTED",

    reason:
      run.cancellationReason,
  });

  if (run.currentAttemptId) {
    const attempt =
      attempts.get(
        run.currentAttemptId
      );

    if (
      attempt &&
      (
        attempt.status ===
          ATTEMPT_STATUS.CREATED ||
        attempt.status ===
          ATTEMPT_STATUS.RUNNING
      )
    ) {
      cancelAttempt(
        attempt.id,
        run.cancellationReason
      );
    }
  }

  return snapshotRun(run);
}

/* =========================================================
 * DEADLINE
 * ======================================================= */

function isDeadlineExceeded(
  runId
) {
  const run =
    assertRun(runId);

  if (!run.deadlineAt) {
    return false;
  }

  return (
    Date.now() >=
    timestampMs(
      run.deadlineAt
    )
  );
}

function getRemainingExecutionTime(
  runId
) {
  const run =
    assertRun(runId);

  if (!run.deadlineAt) {
    return (
      run.policy
        .MAX_EXECUTION_TIME_MS
    );
  }

  return Math.max(
    0,
    timestampMs(
      run.deadlineAt
    ) -
      Date.now()
  );
}

/* =========================================================
 * AUTHORITATIVE EVIDENCE
 * ======================================================= */

function isAuthoritativeSuccess(
  input = {}
) {
  if (
    input.success !== true
  ) {
    return false;
  }

  if (
    input.authoritative !==
    true
  ) {
    return false;
  }

  if (
    input.validationMode !==
    "authoritative"
  ) {
    return false;
  }

  if (!input.buildId) {
    return false;
  }

  const artifact =
    input.artifact ||
    null;

  if (!artifact) {
    return false;
  }

  if (
    !artifact.storageKey &&
    !artifact.path
  ) {
    return false;
  }

  if (!artifact.checksum) {
    return false;
  }

  return true;
}

function hasPassedVerification(
  runId
) {
  const run =
    assertRun(runId);

  if (
    !run.latestVerificationId
  ) {
    return false;
  }

  const verification =
    verifications.get(
      run.latestVerificationId
    );

  if (!verification) {
    return false;
  }

  return (
    verification.success ===
      true &&
    verification.status ===
      VERIFICATION_STATUS.PASSED
  );
}

/* =========================================================
 * COMPLETE RUN
 * ======================================================= */

function completeRun(
  runId,
  result = {}
) {
  const run =
    assertRun(runId);

  if (
    TERMINAL_STATES.has(
      run.state
    )
  ) {
    return snapshotRun(run);
  }

  const authoritativeSuccess =
    isAuthoritativeSuccess(
      result
    );

  if (
    result.success === true &&
    !authoritativeSuccess
  ) {
    throw new Error(
      "Cannot complete engineering run successfully without authoritative build evidence"
    );
  }

  if (
    result.success === true &&
    !hasPassedVerification(
      runId
    )
  ) {
    throw new Error(
      "Cannot complete engineering run successfully without passed verification"
    );
  }

  run.result =
    clone(result);

  if (
    authoritativeSuccess
  ) {
    run.authoritative =
      true;

    run.buildId =
      result.buildId ||
      run.buildId;

    run.validationMode =
      "authoritative";

    run.artifact =
      clone(
        result.artifact ||
          run.artifact
      );

    run.finalSourceHash =
      result.sourceHash ||
      run.finalSourceHash;

    /*
     * Ensure authoritative artifact is represented in
     * State's artifact registry as well.
     */
    const artifact =
      result.artifact;

    if (artifact) {
      const alreadyRegistered =
        Array.from(
          artifacts.values()
        ).some(
          (item) =>
            item.runId ===
              run.runId &&
            item.checksum ===
              artifact.checksum &&
            (
              item.storageKey ===
                artifact.storageKey ||
              item.path ===
                artifact.path
            )
        );

      if (!alreadyRegistered) {
        const registered =
          recordArtifact(
            run.runId,
            {
              ...artifact,

              authoritative:
                true,

              verified:
                artifact.verified !==
                false,
            }
          );

        run.artifact =
          clone(
            registered
          );
      } else {
        const matching =
          Array.from(
            artifacts.values()
          ).find(
            (item) =>
              item.runId ===
                run.runId &&
              item.checksum ===
                artifact.checksum &&
              (
                item.storageKey ===
                  artifact.storageKey ||
                item.path ===
                  artifact.path
              )
          );

        if (matching) {
          matching.authoritative =
            true;

          matching.verified =
            matching.verified ||
            artifact.verified ===
              true;

          run.artifact =
            clone(matching);
        }
      }
    }
  }

  if (
    result.success === true
  ) {
    transitionState(
      runId,
      STATES.PASSED,
      {
        reason:
          "Engineering run completed successfully",
      }
    );
  } else {
    run.error =
      clone(
        result.error ||
          result
      );

    transitionState(
      runId,
      STATES.ESCALATED,
      {
        reason:
          result.error?.message ||
          "Engineering run completed unsuccessfully",
      }
    );
  }

  return snapshotRun(run);
}

/* =========================================================
 * PROMOTE
 * ======================================================= */

function promoteRun(
  runId,
  metadata = {}
) {
  const run =
    assertRun(runId);

  if (
    run.state !==
    STATES.PASSED
  ) {
    throw new Error(
      `Only PASSED runs can be promoted. Current state: ${run.state}`
    );
  }

  if (
    !run.authoritative ||
    run.validationMode !==
      "authoritative"
  ) {
    throw new Error(
      "Cannot promote non-authoritative run"
    );
  }

  if (
    !isAuthoritativeSuccess({
      success: true,

      authoritative:
        run.authoritative,

      validationMode:
        run.validationMode,

      buildId:
        run.buildId,

      artifact:
        run.artifact,
    })
  ) {
    throw new Error(
      "Promotion requires authoritative artifact evidence"
    );
  }

  if (
    !hasPassedVerification(
      runId
    )
  ) {
    throw new Error(
      "Promotion requires passed verification"
    );
  }

  run.result = {
    ...(run.result || {}),

    promotion:
      clone(metadata),
  };

  transitionState(
    runId,
    STATES.PROMOTED,
    {
      reason:
        "Engineering run promoted",

      metadata,
    }
  );

  return snapshotRun(run);
}

/* =========================================================
 * ESCALATE
 * ======================================================= */

function escalateRun(
  runId,
  reason,
  metadata = {}
) {
  const run =
    assertRun(runId);

  if (
    run.state ===
      STATES.PROMOTED ||
    run.state ===
      STATES.PASSED ||
    run.state ===
      STATES.ESCALATED
  ) {
    return snapshotRun(run);
  }

  run.error = {
    message:
      reason ||
      "Engineering run escalated",

    metadata:
      clone(metadata),
  };

  transitionState(
    runId,
    STATES.ESCALATED,
    {
      reason:
        reason ||
        "Engineering run escalated",

      metadata,
    }
  );

  return snapshotRun(run);
}

/* =========================================================
 * LIST / QUERY
 * ======================================================= */

function listAttempts(
  runId
) {
  assertRun(runId);

  return Array.from(
    attempts.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(
      snapshotAttempt
    );
}

function listFailures(
  runId
) {
  assertRun(runId);

  return Array.from(
    failures.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

function listRepairs(
  runId
) {
  assertRun(runId);

  return Array.from(
    repairs.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

function listVerifications(
  runId
) {
  assertRun(runId);

  return Array.from(
    verifications.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

function listExecutions(
  runId
) {
  assertRun(runId);

  return Array.from(
    executions.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

function listArtifacts(
  runId
) {
  assertRun(runId);

  return Array.from(
    artifacts.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

function listCheckpoints(
  runId
) {
  assertRun(runId);

  return Array.from(
    checkpoints.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

function listRollbacks(
  runId
) {
  assertRun(runId);

  return Array.from(
    rollbacks.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

function listResourceEvents(
  runId
) {
  assertRun(runId);

  return Array.from(
    resourceEvents.values()
  )
    .filter(
      (item) =>
        item.runId ===
        runId
    )
    .map(clone);
}

/* =========================================================
 * RUN SUMMARY
 * ======================================================= */

function getRunSummary(
  runId
) {
  const run =
    assertRun(runId);

  return {
    id:
      run.id,

    runId:
      run.runId,

    projectId:
      run.projectId,

    state:
      run.state,

    status:
      run.status,

    authoritative:
      run.authoritative,

    validationMode:
      run.validationMode,

    buildId:
      run.buildId,

    sourceHash:
      run.finalSourceHash ||
      run.sourceHash,

    currentAttemptId:
      run.currentAttemptId,

    attempts:
      run.attemptCount,

    repairs:
      run.repairAttemptCount,

    diagnoses:
      run.diagnosisAttemptCount,

    rollbacks:
      run.rollbackCount,

    checkpoints:
      run.checkpointCount,

    scopeExpansion:
      run.scopeExpansion,

    cancellationRequested:
      run.cancellationRequested,

    deadlineExceeded:
      isDeadlineExceeded(
        runId
      ),

    remainingExecutionTime:
      getRemainingExecutionTime(
        runId
      ),

    latestFailureId:
      run.latestFailureId,

    latestRepairId:
      run.latestRepairId,

    latestVerificationId:
      run.latestVerificationId,

    latestCheckpointId:
      run.latestCheckpointId,

    latestRollbackId:
      run.latestRollbackId,

    artifact:
      clone(
        run.artifact
      ),

    recovery:
      clone(
        run.recovery
      ),

    budget:
      getRunBudget(
        runId
      ),
  };
}

/* =========================================================
 * HEALTH
 * ======================================================= */

function health() {
  return {
    service:
      "engineeringState",

    healthy:
      true,

    serviceVersion:
      SERVICE_VERSION,

    schemaVersion:
      SCHEMA_VERSION,

    engineeringSystemVersion:
      ENGINEERING_SYSTEM_VERSION,

    authority: {
      stateOwnsTruth:
        true,

      fakeSuccessAllowed:
        false,

      authoritativeBuildRequired:
        true,

      verificationRequired:
        true,
    },

    identity: {
      canonical:
        "runId",

      compatibilityAlias:
        "id",
    },

    states:
      Object.values(
        STATES
      ),

    terminalStates:
      Array.from(
        TERMINAL_STATES
      ),

    activeRuns:
      Array.from(
        runs.values()
      ).filter(
        (run) =>
          !TERMINAL_STATES.has(
            run.state
          )
      ).length,

    totals: {
      runs:
        runs.size,

      attempts:
        attempts.size,

      executions:
        executions.size,

      failures:
        failures.size,

      repairs:
        repairs.size,

      verifications:
        verifications.size,

      artifacts:
        artifacts.size,

      resourceEvents:
        resourceEvents.size,

      checkpoints:
        checkpoints.size,

      rollbacks:
        rollbacks.size,

      patterns:
        patterns.size,
    },

    limits:
      clone(
        ENGINEERING_LIMITS
      ),
  };
}

/* =========================================================
 * RESET
 * ======================================================= */

function reset() {
  runs.clear();
  attempts.clear();
  executions.clear();
  failures.clear();
  repairs.clear();
  verifications.clear();
  artifacts.clear();
  resourceEvents.clear();
  checkpoints.clear();
  rollbacks.clear();
  patterns.clear();
  locks.clear();
}

/* =========================================================
 * COMPATIBILITY ALIASES
 * ======================================================= */

const createEngineeringRun =
  createRun;

const getEngineeringRun =
  getRun;

const getEngineeringBudget =
  getRunBudget;

/* =========================================================
 * EXPORTS
 * ======================================================= */

module.exports = {
  /* versions */
  SERVICE_VERSION,
  SCHEMA_VERSION,
  ENGINEERING_SYSTEM_VERSION,

  /* states */
  STATES,
  TERMINAL_STATES,
  STATE_TRANSITIONS,

  /* limits */
  ENGINEERING_LIMITS,
  LIMITS,

  /* enums */
  ATTEMPT_STATUS,
  REPAIR_STATUS,
  VERIFICATION_STATUS,
  EXECUTION_STATUS,
  REPAIR_TYPES,

  /* run */
  createRun,
  createEngineeringRun,
  getRun,
  getEngineeringRun,
  getMutableRun,
  snapshotRun,

  /* state */
  canTransition,
  transitionState,

  /* attempts */
  createAttempt,
  startAttempt,
  completeAttempt,
  cancelAttempt,
  markAttemptRolledBack,
  getAttempt,
  listAttempts,
  canCreateAttempt,

  /* execution */
  recordExecution,
  listExecutions,

  /* failures */
  normalizeFailure,
  recordFailure,
  getFailure,
  listFailures,

  /* diagnosis */
  incrementDiagnosisAttempt,
  canDiagnose,

  /* repairs */
  createRepair,
  recordRepair,
  updateRepair,
  getRepair,
  listRepairs,
  canRepair,

  /* verification */
  recordVerification,
  getVerification,
  listVerifications,
  hasPassedVerification,

  /* artifacts */
  recordArtifact,
  getArtifact,
  listArtifacts,

  /* resources */
  recordResourceEvent,
  getResourceEvent,
  listResourceEvents,
  updateEffectiveResources,

  /* checkpoints */
  createCheckpoint,
  getCheckpoint,
  listCheckpoints,

  /* rollback */
  recordRollback,
  getRollback,
  listRollbacks,

  /* learning */
  recordPattern,
  getPattern,
  listPatterns,

  /* budgets */
  normalizeLimits,
  getRunBudget,
  getEngineeringBudget,

  /* scope */
  updateScopeExpansion,

  /* cancellation / deadline */
  requestCancellation,
  isDeadlineExceeded,
  getRemainingExecutionTime,

  /* authority */
  isAuthoritativeSuccess,

  /* lifecycle */
  completeRun,
  promoteRun,
  escalateRun,

  /* queries */
  getRunSummary,

  /* health */
  health,

  /* testing */
  reset,
};
