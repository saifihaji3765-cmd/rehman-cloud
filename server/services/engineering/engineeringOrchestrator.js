/**
 * ================================================================
 * ZYRIONOS ENGINEERING ORCHESTRATOR
 * ================================================================
 *
 * File:
 *   services/engineering/engineeringOrchestrator.js
 *
 * Version:
 *   1.2.0
 *
 * Role:
 *   Engineering Control Plane / Workflow Orchestrator
 *
 * Architecture:
 *
 *   Job Intake
 *        ↓
 *   Engineering Run
 *        ↓
 *   State Machine
 *        ↓
 *   Checkpoint
 *        ↓
 *   Master Analysis
 *        ↓
 *   Authoritative Executor
 *        ↓
 *   Verification
 *        ↓
 *   PASSED
 *      /   \
 *   FAIL   SUCCESS
 *    ↓       ↓
 * Diagnosis  Promotion
 *    ↓
 * Repair
 *    ↓
 * Rebuild
 *    ↓
 * Verify
 *    ↓
 * Retry / Rollback / Escalate
 *
 * IMPORTANT:
 *
 * This orchestrator NEVER declares success based on:
 *
 *   - AI response
 *   - static validation
 *   - syntax confidence
 *   - repair confidence
 *   - Master Agent opinion
 *   - generated files alone
 *
 * PASSED requires authoritative execution evidence.
 *
 * PROMOTED requires authoritative verification + artifact evidence.
 *
 * ================================================================
 */

"use strict";


/* ================================================================
   MODULE IDENTITY
================================================================ */

const ORCHESTRATOR_VERSION =
  "1.2.0";

const ENGINEERING_SYSTEM_VERSION =
  "2.0.0";


/* ================================================================
   NODE MODULES
================================================================ */

const crypto =
  require("crypto");


/* ================================================================
   DEPENDENCIES
================================================================ */

let engineeringState = null;
let engineeringExecutor = null;
let engineeringIntelligence = null;
let masterAgent = null;
let legacyAuthoritativeBuildService = null;


/* ================================================================
   SAFE REQUIRE
================================================================ */

function safeRequire(modulePath) {

  try {

    return require(modulePath);

  } catch (error) {

    return null;

  }

}


/* ================================================================
   DEPENDENCY LOADING
================================================================ */

function loadDependencies() {

  if (!engineeringState) {

    engineeringState =
      safeRequire("./engineeringState");

  }


  if (!engineeringExecutor) {

    engineeringExecutor =
      safeRequire("./engineeringExecutor");

  }


  if (!engineeringIntelligence) {

    engineeringIntelligence =
      safeRequire("./engineeringIntelligence");

  }


  /*
   * Master Agent is intentionally loaded from known locations only.
   */

  if (!masterAgent) {

    const candidates = [

      "../../agents/masterAgent",
      "../../agent/masterAgent",
      "../../masterAgent",
      "../masterAgent",

    ];


    for (const candidate of candidates) {

      const loaded =
        safeRequire(candidate);


      if (loaded) {

        masterAgent =
          loaded;

        break;

      }

    }

  }


  /*
   * Legacy service is migration-only.
   */

  if (!legacyAuthoritativeBuildService) {

    const candidates = [

      "../authoritativeBuildService",
      "../../services/authoritativeBuildService",
      "../../authoritativeBuildService",

    ];


    for (const candidate of candidates) {

      const loaded =
        safeRequire(candidate);


      if (loaded) {

        legacyAuthoritativeBuildService =
          loaded;

        break;

      }

    }

  }


  return {

    engineeringState,
    engineeringExecutor,
    engineeringIntelligence,
    masterAgent,
    legacyAuthoritativeBuildService,

  };

}


/* ================================================================
   STATES
================================================================ */

const STATES = Object.freeze({

  CREATED:
    "CREATED",

  ANALYZING:
    "ANALYZING",

  EXECUTING:
    "EXECUTING",

  FAILED:
    "FAILED",

  DIAGNOSING:
    "DIAGNOSING",

  REPAIRING:
    "REPAIRING",

  VERIFYING:
    "VERIFYING",

  PASSED:
    "PASSED",

  ROLLBACK:
    "ROLLBACK",

  ESCALATED:
    "ESCALATED",

  PROMOTED:
    "PROMOTED",

});


/* ================================================================
   TERMINAL STATES
================================================================ */

const TERMINAL_STATES =
  new Set([

    STATES.ESCALATED,
    STATES.PROMOTED,

  ]);


/* ================================================================
   STATE TRANSITION GRAPH
================================================================ */

const ALLOWED_TRANSITIONS =
  Object.freeze({

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

const DEFAULT_POLICY =
  Object.freeze({

    MAX_ATTEMPTS:
      5,

    MAX_REPAIR_ATTEMPTS:
      3,

    MAX_DIAGNOSIS_ATTEMPTS:
      3,

    MAX_EXECUTION_TIME_MS:
      15 * 60 * 1000,

    MAX_REPAIR_FILES:
      25,

    MAX_DEPENDENCY_CHANGES:
      15,

    MAX_SCOPE_EXPANSION:
      1.5,

    MAX_AUTO_SCALE:
      4,

    MAX_ROLLBACKS:
      2,

    MAX_CHECKPOINTS:
      25,

    RETRY_BASE_DELAY_MS:
      1000,

    RETRY_MAX_DELAY_MS:
      30000,

    RETRY_JITTER_MS:
      500,

  });


/* ================================================================
   FAILURE POLICY
================================================================ */

const RETRYABLE_FAILURES =
  new Set([

    "timeout",
    "network",
    "temporary",
    "process-terminated",
    "resource",
    "infrastructure",
    "service-unavailable",
    "rate-limit",

  ]);


const NON_RETRYABLE_FAILURES =
  new Set([

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

  ]);


/* ================================================================
   IDENTIFIER
================================================================ */

function createId(prefix) {

  return [

    prefix,

    Date.now().toString(36),

    crypto
      .randomBytes(8)
      .toString("hex"),

  ].join("-");

}


/* ================================================================
   CLONE
================================================================ */

function clone(value) {

  if (
    value ===
    undefined
  ) {

    return undefined;

  }


  if (
    value ===
    null
  ) {

    return null;

  }


  return JSON.parse(
    JSON.stringify(value)
  );

}


/* ================================================================
   FILE HASH
================================================================ */

function calculateFilesHash(files) {

  const normalized =
    Array.isArray(files)
      ? files.map(file => ({

          path:
            String(
              file?.path ||
              file?.name ||
              ""
            ),

          content:
            typeof file?.content === "string"
              ? file.content
              : String(
                  file?.content ||
                  ""
                ),

        }))
      : [];


  normalized.sort(
    (a, b) =>
      a.path.localeCompare(
        b.path
      )
  );


  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        normalized
      )
    )
    .digest("hex");

}


/* ================================================================
   POSITIVE INTEGER
================================================================ */

function positiveInteger(
  value,
  fallback
) {

  const parsed =
    Number(value);


  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {

    return fallback;

  }


  return Math.floor(parsed);

}


/* ================================================================
   POLICY NORMALIZATION
================================================================ */

function normalizePolicy(
  supplied
) {

  const input =
    supplied || {};


  const policy = {

    ...DEFAULT_POLICY,

  };


  for (
    const key
    of Object.keys(policy)
  ) {

    if (
      input[key] !==
      undefined
    ) {

      policy[key] =
        positiveInteger(
          input[key],
          policy[key]
        );

    }

  }


  if (
    Number.isFinite(
      Number(
        input.MAX_SCOPE_EXPANSION
      )
    )
  ) {

    policy.MAX_SCOPE_EXPANSION =
      Math.max(
        1,
        Number(
          input.MAX_SCOPE_EXPANSION
        )
      );

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
        fallbackCategory ||
        "unknown",

      message:
        "Unknown engineering failure",

      retryable:
        false,

      affectedFiles: [],
      errors: [],

    };

  }


  const category =
    String(

      error.category ||
      error.failureCategory ||
      fallbackCategory ||
      "unknown"

    ).toLowerCase();


  let retryable =
    error.retryable;


  if (
    typeof retryable !==
    "boolean"
  ) {

    if (
      RETRYABLE_FAILURES.has(
        category
      )
    ) {

      retryable =
        true;

    }

    else if (
      NON_RETRYABLE_FAILURES.has(
        category
      )
    ) {

      retryable =
        false;

    }

    else {

      retryable =
        false;

    }

  }


  return {

    category,

    message:
      error.message ||
      error.error ||
      "Engineering execution failed",

    retryable,

    failureStage:
      error.failureStage ||
      null,

    failureCategory:
      error.failureCategory ||
      category,

    authoritative:
      error.authoritative ===
      true,

    validationMode:
      error.validationMode ||
      null,

    buildId:
      error.buildId ||
      null,

    sourceHash:
      error.sourceHash ||
      null,

    buildCommand:
      error.buildCommand ||
      null,

    installCommand:
      error.installCommand ||
      null,

    affectedFiles:
      Array.isArray(
        error.affectedFiles
      )
        ? error.affectedFiles
        : [],

    errors:
      Array.isArray(
        error.errors
      )
        ? error.errors
        : [],

    stdout:
      error.stdout ||
      "",

    stderr:
      error.stderr ||
      "",

    exitCode:
      Number.isInteger(
        error.exitCode
      )
        ? error.exitCode
        : null,

    signal:
      error.signal ||
      null,

    timedOut:
      Boolean(
        error.timedOut
      ),

    resourceViolation:
      Boolean(
        error.resourceViolation
      ),

  };

}


/* ================================================================
   JOB NORMALIZATION
================================================================ */

function normalizeJob(
  request
) {

  if (
    !request ||
    typeof request !==
    "object"
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


  const files =
    Array.isArray(
      request.files
    )
      ? clone(
          request.files
        )
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
    request.allowEmptyWorkspace !==
      true
  ) {

    throw new Error(
      "Engineering job requires project files"
    );

  }


  return {

    jobId:
      request.jobId ||
      createId("eng-job"),

    projectId:
      String(projectId),

    userId:
      String(userId),

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

    planning:
      clone(
        request.planning ||
        null
      ),

    intent:
      clone(
        request.intent ||
        null
      ),

    builder:
      clone(
        request.builder ||
        null
      ),

    manifest:
      clone(
        request.manifest ||
        null
      ),

    projectData:
      clone(
        request.projectData ||
        {}
      ),

    framework:
      request.framework ||
      request.projectData?.framework ||
      null,

    packageManager:
      request.packageManager ||
      request.projectData?.packageManager ||
      null,

    branch:
      request.branch ||
      "engineering",

    baseCommit:
      request.baseCommit ||
      null,

    environment:
      clone(
        request.environment ||
        {}
      ),

    metadata:
      clone(
        request.metadata ||
        {}
      ),

    policy:
      normalizePolicy(
        request.policy
      ),

    allowLegacyAdapter:
      request.allowLegacyAdapter ===
      true,

    allowAutoScale:
      request.allowAutoScale !==
      false,

    dryRun:
      request.dryRun ===
      true,

  };

}


/* ================================================================
   STATE CALL
================================================================ */

function stateCall(
  methodNames,
  args
) {

  loadDependencies();


  if (
    !engineeringState
  ) {

    return null;

  }


  for (
    const methodName
    of methodNames
  ) {

    const method =
      engineeringState[
        methodName
      ];


    if (
      typeof method !==
      "function"
    ) {

      continue;

    }


    try {

      return method.apply(
        engineeringState,
        args
      );

    } catch (error) {

      return {

        success:
          false,

        error:
          error.message,

      };

    }

  }


  return null;

}


/* ================================================================
   CREATE RUN
================================================================ */

function createRunRecord(
  job
) {

  const runId =
    createId(
      "eng-run"
    );


  const run = {

    runId,

    jobId:
      job.jobId,

    projectId:
      job.projectId,

    userId:
      job.userId,

    projectName:
      job.projectName,

    operation:
      job.operation,

    goal:
      job.goal,

    state:
      STATES.CREATED,

    version:
      ENGINEERING_SYSTEM_VERSION,

    orchestratorVersion:
      ORCHESTRATOR_VERSION,

    policy:
      clone(
        job.policy
      ),

    attempts:
      0,

    repairAttempts:
      0,

    diagnosisAttempts:
      0,

    rollbackCount:
      0,

    checkpointCount:
      0,

    retryCount:
      0,

    scopeExpansion:
      1,

    autoScaleLevel:
      1,

    currentFiles:
      clone(
        job.files
      ),

    originalFiles:
      clone(
        job.files
      ),

    checkpoints: [],

    failures: [],

    repairs: [],

    verifications: [],

    executions: [],

    audit: [],

    startedAt:
      new Date().toISOString(),

    completedAt:
      null,

    promotedAt:
      null,

    lastError:
      null,

    authoritative:
      false,

    passed:
      false,

    promoted:
      false,

    escalated:
      false,

    rollbackRequired:
      false,

    result:
      null,

    job:
      clone(job),

    planning:
      clone(job.planning),

    intent:
      clone(job.intent),

    builder:
      clone(job.builder),

    manifest:
      clone(job.manifest),

    projectData:
      clone(job.projectData),

    framework:
      job.framework,

    packageManager:
      job.packageManager,

    deadlineAt:
      new Date(
        Date.now() +
        job.policy.MAX_EXECUTION_TIME_MS
      ).toISOString(),

  };


  stateCall(

    [
      "createRun",
      "createEngineeringRun",
      "initializeRun",

    ],

    [
      run,

    ]

  );


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

    eventId:
      createId(
        "audit"
      ),

    runId:
      run.runId,

    timestamp:
      new Date().toISOString(),

    event,

    state:
      run.state,

    attempt:
      run.attempts ||
      0,

    data:
      clone(
        data ||
        {}
      ),

  };


  if (
    Array.isArray(
      run.audit
    )
  ) {

    run.audit.push(
      record
    );

  }


  stateCall(

    [
      "recordAuditEvent",
      "addAuditEvent",
      "appendAudit",

    ],

    [
      run.runId,
      record,

    ]

  );


  return record;

}


/* ================================================================
   STATE TRANSITION
================================================================ */

function transition(
  run,
  nextState,
  reason,
  metadata
) {

  const currentState =
    run.state;


  if (
    currentState ===
    nextState
  ) {

    return {

      from:
        currentState,

      to:
        nextState,

      reason:
        reason ||
        "state-already-current",

      timestamp:
        new Date().toISOString(),

      metadata:
        clone(
          metadata ||
          {}
        ),

      noop:
        true,

    };

  }


  const allowed =
    ALLOWED_TRANSITIONS[
      currentState
    ] || [];


  if (
    !allowed.includes(
      nextState
    )
  ) {

    throw new Error(

      `Illegal engineering state transition: ` +
      `${currentState} → ${nextState}`

    );

  }


  const transitionRecord = {

    from:
      currentState,

    to:
      nextState,

    reason:
      reason ||
      null,

    timestamp:
      new Date().toISOString(),

    metadata:
      clone(
        metadata ||
        {}
      ),

  };


  const stateResult =
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


  /*
   * Local state changes only after the State service accepts the
   * transition or when no persistent State implementation exists.
   */

  if (
    stateResult &&
    stateResult.success ===
    false
  ) {

    throw new Error(
      stateResult.error ||
      "Engineering state transition failed"
    );

  }


  run.state =
    nextState;


  audit(
    run,
    "STATE_TRANSITION",
    transitionRecord
  );


  return transitionRecord;

}


/* ================================================================
   ATTEMPT / BUDGET
================================================================ */

function hasAttemptBudget(
  run
) {

  return (
    run.attempts <
    run.policy.MAX_ATTEMPTS
  );

}


function hasRepairBudget(
  run
) {

  return (
    run.repairAttempts <
    run.policy.MAX_REPAIR_ATTEMPTS
  );

}


function hasDiagnosisBudget(
  run
) {

  return (
    run.diagnosisAttempts <
    run.policy.MAX_DIAGNOSIS_ATTEMPTS
  );

}


function hasRollbackBudget(
  run
) {

  return (
    run.rollbackCount <
    run.policy.MAX_ROLLBACKS
  );

}


/* ================================================================
   DEADLINE
================================================================ */

function isRunDeadlineExceeded(
  run
) {

  if (
    !run.deadlineAt
  ) {

    return false;

  }


  return (
    Date.now() >=
    new Date(
      run.deadlineAt
    ).getTime()
  );

}


/* ================================================================
   SCOPE CHECK
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
    Array.isArray(
      candidateFiles
    )
      ? candidateFiles.length
      : 0;


  const ratio =
    current /
    original;


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
      createId(
        "checkpoint"
      ),

    runId:
      run.runId,

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
      clone(
        run.currentFiles
      ),

    sourceHash:
      calculateFilesHash(
        run.currentFiles
      ),

  };


  const result =
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


  if (
    result &&
    result.success ===
    false
  ) {

    throw new Error(
      result.error ||
      "Checkpoint persistence failed"
    );

  }


  run.checkpoints.push(
    checkpoint
  );


  run.checkpointCount +=
    1;


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


  if (
    !hasRollbackBudget(
      run
    )
  ) {

    throw new Error(
      "Maximum rollback limit exceeded"
    );

  }


  transition(
    run,
    STATES.ROLLBACK,
    reason ||
      "rollback-requested"
  );


  run.rollbackCount +=
    1;


  const previousFiles =
    clone(
      run.currentFiles
    );


  run.currentFiles =
    clone(
      checkpoint.files
    );


  const rollbackRecord = {

    rollbackId:
      createId(
        "rollback"
      ),

    checkpointId:
      checkpoint.checkpointId,

    runId:
      run.runId,

    attempt:
      run.attempts,

    reason:
      reason ||
      null,

    restoredSourceHash:
      checkpoint.sourceHash,

    previousSourceHash:
      calculateFilesHash(
        previousFiles
      ),

    timestamp:
      new Date().toISOString(),

  };


  const stateResult =
    stateCall(

      [
        "recordRollback",
        "rollbackRun",
        "restoreCheckpoint",

      ],

      [
        run.runId,
        rollbackRecord,
        checkpoint,

      ]

    );


  if (
    stateResult &&
    stateResult.success ===
    false
  ) {

    throw new Error(
      stateResult.error ||
      "Rollback persistence failed"
    );

  }


  /*
   * If the Executor provides a workspace restore operation, use it.
   */

  loadDependencies();


  if (
    engineeringExecutor &&
    typeof engineeringExecutor.restoreCheckpoint ===
      "function"
  ) {

    await engineeringExecutor
      .restoreCheckpoint({

        runId:
          run.runId,

        projectId:
          run.projectId,

        files:
          clone(
            checkpoint.files
          ),

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

function calculateRetryDelay(
  run
) {

  const exponent =
    Math.max(
      0,
      run.retryCount - 1
    );


  const base =
    Math.min(

      run.policy.RETRY_MAX_DELAY_MS,

      run.policy.RETRY_BASE_DELAY_MS *
      Math.pow(
        2,
        exponent
      )

    );


  const jitter =
    Math.floor(
      Math.random() *
      run.policy.RETRY_JITTER_MS
    );


  return (
    base +
    jitter
  );

}


function sleep(
  milliseconds
) {

  if (
    !milliseconds ||
    milliseconds <= 0
  ) {

    return Promise.resolve();

  }


  return new Promise(
    resolve =>
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
    failure.retryable !==
      true
  ) {

    return false;

  }


  if (
    !hasAttemptBudget(
      run
    )
  ) {

    return false;

  }


  if (
    isRunDeadlineExceeded(
      run
    )
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
    normalizeFailure(
      failure
    );


  const record = {

    failureId:
      createId(
        "failure"
      ),

    runId:
      run.runId,

    attempt:
      run.attempts,

    timestamp:
      new Date().toISOString(),

    ...normalized,

  };


  run.failures.push(
    record
  );


  run.lastError =
    record;


  const result =
    stateCall(

      [
        "recordFailure",
        "addFailure",
        "recordFailureRecord",

      ],

      [
        run.runId,
        record,

      ]

    );


  if (
    result &&
    result.success ===
      false
  ) {

    audit(
      run,
      "STATE_FAILURE_RECORD_ERROR",
      {

        error:
          result.error,

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
      createId(
        "execution"
      ),

    runId:
      run.runId,

    attempt:
      run.attempts,

    timestamp:
      new Date().toISOString(),

    success:
      result?.success ===
      true,

    authoritative:
      result?.authoritative ===
      true,

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
      result?.repairContext?.failureCategory ||
      result?.failureCategory ||
      null,

    failureStage:
      result?.repairContext?.failureStage ||
      result?.failureStage ||
      null,

    exitCode:
      Number.isInteger(
        result?.exitCode
      )
        ? result.exitCode
        : null,

    signal:
      result?.signal ||
      null,

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


  run.executions.push(
    record
  );


  stateCall(

    [
      "recordExecution",
      "addExecutionRecord",

    ],

    [
      run.runId,
      record,

    ]

  );


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
   AUTHORITATIVE SUCCESS
================================================================ */

function isAuthoritativeSuccess(
  result
) {

  if (
    !result ||
    result.success !==
      true
  ) {

    return false;

  }


  if (
    result.authoritative !==
      true
  ) {

    return false;

  }


  if (
    result.validationMode !==
      "authoritative"
  ) {

    return false;

  }


  if (
    !result.buildId
  ) {

    return false;

  }


  const artifact =
    result.artifact;


  if (
    !artifact
  ) {

    return false;

  }


  if (
    !artifact.storageKey &&
    !artifact.path
  ) {

    return false;

  }


  if (
    !artifact.checksum
  ) {

    return false;

  }


  return true;

}


/* ================================================================
   EXECUTOR
================================================================ */

async function executeBuild(
  run
) {

  loadDependencies();


  if (
    !engineeringExecutor
  ) {

    throw new Error(
      "engineeringExecutor is unavailable"
    );

  }


  if (
    typeof engineeringExecutor.executeBuild !==
      "function"
  ) {

    throw new Error(
      "engineeringExecutor.executeBuild is unavailable"
    );

  }


  return engineeringExecutor
    .executeBuild({

      projectId:
        run.projectId,

      userId:
        run.userId,

      projectName:
        run.projectName,

      files:
        clone(
          run.currentFiles
        ),

      planning:
        clone(
          run.planning ||
          null
        ),

      manifest:
        clone(
          run.manifest ||
          null
        ),

      projectData:
        clone(
          run.projectData ||
          {}
        ),

      framework:
        run.framework ||
        null,

      packageManager:
        run.packageManager ||
        null,

      attempt:
        run.attempts,

      runId:
        run.runId,

      timeoutMs:
        run.policy.MAX_EXECUTION_TIME_MS,

      resourcePolicy: {

        maxCpu:
          run.policy.MAX_AUTO_SCALE,

      },

    });

}


/* ================================================================
   LEGACY BUILD
================================================================ */

async function executeLegacyBuild(
  run
) {

  loadDependencies();


  if (
    !run.job?.allowLegacyAdapter
  ) {

    return null;

  }


  if (
    !legacyAuthoritativeBuildService
  ) {

    return null;

  }


  const execute =
    legacyAuthoritativeBuildService.executeBuild ||
    legacyAuthoritativeBuildService.buildProject;


  if (
    typeof execute !==
      "function"
  ) {

    return null;

  }


  audit(
    run,
    "LEGACY_AUTHORITY_ADAPTER_USED",
    {

      serviceVersion:
        legacyAuthoritativeBuildService
          .SERVICE_VERSION ||
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
      clone(
        run.currentFiles
      ),

    planning:
      clone(
        run.planning ||
        null
      ),

    manifest:
      clone(
        run.manifest ||
        null
      ),

    projectData:
      clone(
        run.projectData ||
        {}
      ),

    framework:
      run.framework ||
      null,

    packageManager:
      run.packageManager ||
      null,

    attempt:
      run.attempts,

    runId:
      run.runId,

  });

}


/* ================================================================
   MASTER AGENT
================================================================ */

/**
 * IMPORTANT:
 *
 * Master Agent integration is intentionally isolated here.
 *
 * Once the real Master Agent code is supplied, this adapter will be
 * locked to its exact production contract instead of guessing.
 */

async function analyzeWithMaster(
  run
) {

  loadDependencies();


  if (
    !masterAgent
  ) {

    return {

      success:
        true,

      skipped:
        true,

      reason:
        "Master Agent unavailable",

    };

  }


  const candidates = [

    "analyzeEngineeringJob",
    "analyzeBuild",

  ];


  for (
    const name
    of candidates
  ) {

    if (
      typeof masterAgent[name] !==
        "function"
    ) {

      continue;

    }


    const context = {

      engineeringRun:
        true,

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
        clone(
          run.currentFiles
        ),

      planning:
        clone(
          run.planning ||
          null
        ),

      intent:
        clone(
          run.intent ||
          null
        ),

      builder:
        clone(
          run.builder ||
          null
        ),

      manifest:
        clone(
          run.manifest ||
          null
        ),

      projectData:
        clone(
          run.projectData ||
          {}
        ),

      framework:
        run.framework ||
        null,

      packageManager:
        run.packageManager ||
        null,

      engineeringPolicy:
        clone(
          run.policy
        ),

    };


    return (
      await masterAgent[name](
        context
      )
    ) || {

      success:
        true,

    };

  }


  return {

    success:
      true,

    skipped:
      true,

    reason:
      "No dedicated Master engineering analysis contract yet",

  };

}


/* ================================================================
   INTELLIGENCE — DIAGNOSIS
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

      success:
        false,

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

      success:
        false,

      error:
        "Engineering Intelligence diagnosis contract unavailable",

    };

  }


  return engineeringIntelligence
    .diagnoseFailure({

      runId:
        run.runId,

      projectId:
        run.projectId,

      attempt:
        run.attempts,

      files:
        clone(
          run.currentFiles
        ),

      failure:
        clone(
          failure
        ),

      authoritative:
        true,

      planning:
        clone(
          run.planning ||
          null
        ),

      knownRepairs:
        typeof engineeringIntelligence
          .findKnownRepair ===
          "function"
          ? engineeringIntelligence
              .findKnownRepair(
                failure
              )
          : [],

    });

}


/* ================================================================
   INTELLIGENCE — REPAIR
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

      success:
        false,

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

      success:
        false,

      error:
        "Engineering Intelligence repair contract unavailable",

    };

  }


  return engineeringIntelligence
    .repairFailure({

      runId:
        run.runId,

      projectId:
        run.projectId,

      attempt:
        run.attempts,

      repairAttempt:
        run.repairAttempts,

      files:
        clone(
          run.currentFiles
        ),

      failure:
        clone(
          failure
        ),

      diagnosis:
        clone(
          diagnosis
        ),

      planning:
        clone(
          run.planning ||
          null
        ),

      authoritative:
        true,

      limits: {

        MAX_REPAIR_FILES:
          run.policy.MAX_REPAIR_FILES,

        MAX_DEPENDENCY_CHANGES:
          run.policy.MAX_DEPENDENCY_CHANGES,

        MAX_SCOPE_EXPANSION:
          run.policy.MAX_SCOPE_EXPANSION,

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
    repair.success !==
      true
  ) {

    return {

      success:
        false,

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

      success:
        false,

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

      success:
        false,

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

      success:
        false,

      reason:
        "Repair exceeded MAX_REPAIR_FILES",

    };

  }


  /*
   * Intelligence v1.1.0 performs the actual package.json diff.
   * Orchestrator therefore does not trust an AI-declared dependency
   * number as authoritative.
   */

  const dependencyChanges =
    typeof engineeringIntelligence
      ?.calculateDependencyChanges ===
      "function"

      ? engineeringIntelligence
          .calculateDependencyChanges(
            run.currentFiles,
            candidateFiles
          )

      : Number(
          repair.dependencyChanges ||
          repair.metadata?.dependencyChanges ||
          0
        );


  if (
    dependencyChanges >
    run.policy.MAX_DEPENDENCY_CHANGES
  ) {

    return {

      success:
        false,

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


  run.currentFiles =
    clone(
      candidateFiles
    );


  const repairRecord = {

    repairId:
      createId(
        "repair"
      ),

    runId:
      run.runId,

    attempt:
      run.attempts,

    repairAttempt:
      run.repairAttempts,

    changedFiles:
      clone(
        changedFiles
      ),

    dependencyChanges,

    sourceHashBefore,

    sourceHashAfter,

    timestamp:
      new Date().toISOString(),

  };


  run.repairs.push(
    repairRecord
  );


  stateCall(

    [
      "recordRepair",
      "addRepairRecord",

    ],

    [
      run.runId,
      repairRecord,

    ]

  );


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

    success:
      true,

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

  const verification = {

    verificationId:
      createId(
        "verify"
      ),

    runId:
      run.runId,

    attempt:
      run.attempts,

    timestamp:
      new Date().toISOString(),

    passed:
      isAuthoritativeSuccess(
        result
      ),

    authoritative:
      result?.authoritative ===
      true,

    validationMode:
      result?.validationMode ||
      null,

    buildId:
      result?.buildId ||
      null,

    artifactChecksum:
      result?.artifact?.checksum ||
      null,

    sourceHash:
      result?.sourceHash ||
      null,

    errors:
      clone(
        result?.errors ||
        []
      ),

    failureCategory:
      result?.repairContext?.failureCategory ||
      result?.failureCategory ||
      null,

    failureStage:
      result?.repairContext?.failureStage ||
      result?.failureStage ||
      null,

  };


  run.verifications.push(
    verification
  );


  stateCall(

    [
      "recordVerification",
      "addVerificationRecord",

    ],

    [
      run.runId,
      verification,

    ]

  );


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

    }

  );


  return verification;

}


/* ================================================================
   AUTHORITATIVE REPAIR LEARNING
================================================================ */

/**
 * Intelligence learns ONLY after authoritative execution.
 *
 * AI saying "repair worked" is not sufficient.
 */

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


  const outcome = {

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
      clone(
        result
      ),

    failure:
      clone(
        run.lastError ||
        null
      ),

  };


  return engineeringIntelligence
    .recordAuthoritativeRepairOutcome(
      outcome
    );

}


/* ================================================================
   PROMOTION
================================================================ */

function canPromote(
  run,
  result
) {

  if (
    !isAuthoritativeSuccess(
      result
    )
  ) {

    return {

      promote:
        false,

      reason:
        "Authoritative execution evidence is incomplete",

    };

  }


  if (
    run.state !==
    STATES.PASSED
  ) {

    return {

      promote:
        false,

      reason:
        `Run is not in PASSED state: ${run.state}`,

    };

  }


  if (
    run.rollbackRequired
  ) {

    return {

      promote:
        false,

      reason:
        "Run requires rollback",

    };

  }


  return {

    promote:
      true,

    reason:
      "Authoritative execution, artifact and verification passed",

  };

}


function promote(
  run,
  result
) {

  const decision =
    canPromote(
      run,
      result
    );


  if (
    !decision.promote
  ) {

    return decision;

  }


  transition(
    run,
    STATES.PROMOTED,
    decision.reason
  );


  run.promoted =
    true;

  run.passed =
    true;

  run.authoritative =
    true;

  run.promotedAt =
    new Date().toISOString();


  run.result =
    clone(
      result
    );


  stateCall(

    [
      "promoteRun",
      "finalizePromotion",
      "markPromoted",

    ],

    [
      run.runId,
      result,

    ]

  );


  audit(
    run,
    "FINAL_PROMOTION",
    {

      buildId:
        result.buildId,

      sourceHash:
        result.sourceHash,

      artifact:
        clone(
          result.artifact
        ),

    }

  );


  return {

    promote:
      true,

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

    if (
      !ALLOWED_TRANSITIONS[
        run.state
      ]?.includes(
        STATES.ESCALATED
      )
    ) {

      /*
       * A terminal/non-transitionable state cannot be moved.
       * We still return a failed result without fabricating success.
       */

      run.escalated =
        true;

    }

    else {

      transition(
        run,
        STATES.ESCALATED,
        reason
      );

    }

  }


  run.escalated =
    true;

  run.passed =
    false;

  run.authoritative =
    false;

  run.promoted =
    false;

  run.completedAt =
    new Date().toISOString();


  run.result = {

    success:
      false,

    status:
      "escalated",

    authoritative:
      false,

    promoted:
      false,

    reason,

    failure:
      clone(
        failure ||
        null
      ),

  };


  stateCall(

    [
      "escalateRun",
      "markEscalated",
      "finalizeRun",

    ],

    [
      run.runId,
      run.result,

    ]

  );


  audit(
    run,
    "RUN_ESCALATED",
    {

      reason,

      failure:
        clone(
          failure ||
          null
        ),

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


  /*
   * Intelligence learns from the authoritative result only after
   * verification has determined the actual outcome.
   */

  if (
    run.repairAttempts > 0
  ) {

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


  if (
    verification.passed
  ) {

    transition(
      run,
      STATES.PASSED,
      "Authoritative verification passed"
    );


    run.passed =
      true;

    run.authoritative =
      true;


    return {

      success:
        true,

      passed:
        true,

      verification,

    };

  }


  transition(
    run,
    STATES.FAILED,
    "Authoritative verification failed"
  );


  run.passed =
    false;

  run.authoritative =
    false;


  return {

    success:
      false,

    passed:
      false,

    verification,

  };

}


/* ================================================================
   EXECUTION ATTEMPT
================================================================ */

async function performExecutionAttempt(
  run
) {

  if (
    !hasAttemptBudget(
      run
    )
  ) {

    throw new Error(
      "MAX_ATTEMPTS exhausted"
    );

  }


  if (
    isRunDeadlineExceeded(
      run
    )
  ) {

    throw Object.assign(

      new Error(
        "Engineering run execution deadline exceeded"
      ),

      {

        category:
          "timeout",

        retryable:
          false,

        timedOut:
          true,

      }

    );

  }


  run.attempts +=
    1;


  audit(
    run,
    "EXECUTION_ATTEMPT_STARTED",
    {

      attempt:
        run.attempts,

    }

  );


  transition(
    run,
    STATES.EXECUTING,
    "Starting authoritative execution"
  );


  let result;


  try {

    /*
     * New Engineering Executor is ALWAYS first authority.
     */

    result =
      await executeBuild(
        run
      );


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

      }

    );


    /*
     * IMPORTANT:
     *
     * We do NOT automatically switch to legacy service merely
     * because a build failed.
     *
     * Legacy is only for migration when the new executor contract
     * itself is unavailable.
     */

    const executorUnavailable =
      /unavailable/i.test(
        String(
          executorError.message ||
          ""
        )
      );


    if (
      executorUnavailable &&
      run.job?.allowLegacyAdapter
    ) {

      result =
        await executeLegacyBuild(
          run
        );

    }

    else {

      throw executorError;

    }

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
   FAILURE → DIAGNOSIS → REPAIR
================================================================ */

async function handleFailure(
  run,
  resultOrFailure
) {

  /*
   * If the execution result already contains authoritative failure
   * context, use it directly.
   */

  const rawFailure =
    resultOrFailure?.repairContext ||
    resultOrFailure?.failure ||
    resultOrFailure;


  const failure =
    recordFailure(
      run,
      rawFailure
    );


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
   * First determine whether a repair is possible.
   */

  if (
    !hasRepairBudget(
      run
    )
  ) {

    return {

      retry:
        false,

      escalated:
        true,

      result:
        escalate(
          run,
          "Repair attempt limit exhausted",
          failure
        ),

    };

  }


  if (
    !hasDiagnosisBudget(
      run
    )
  ) {

    return {

      retry:
        false,

      escalated:
        true,

      result:
        escalate(
          run,
          "Diagnosis attempt limit exhausted",
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

      success:
        false,

      error:
        error.message,

    };

  }


  audit(
    run,
    "FAILURE_DIAGNOSED",
    diagnosis
  );


  if (
    !diagnosis ||
    diagnosis.success ===
      false
  ) {

    return {

      retry:
        false,

      escalated:
        true,

      result:
        escalate(
          run,
          "Failure diagnosis failed",
          failure
        ),

    };

  }


  if (
    !hasRepairBudget(
      run
    )
  ) {

    return {

      retry:
        false,

      escalated:
        true,

      result:
        escalate(
          run,
          "Repair budget exhausted",
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

      success:
        false,

      error:
        error.message,

    };

  }


  audit(
    run,
    "REPAIR_GENERATED",
    {

      success:
        repair?.success ===
        true,

      repairAttempt:
        run.repairAttempts,

    }

  );


  const applied =
    applyRepair(
      run,
      repair
    );


  if (
    !applied.success
  ) {

    return {

      retry:
        false,

      escalated:
        true,

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


  /*
   * Repair creates a new source state.
   *
   * The next authoritative build must start from that state.
   */

  transition(
    run,
    STATES.EXECUTING,
    "Rebuilding repaired source tree"
  );


  return {

    retry:
      true,

    repaired:
      true,

    failure,

    diagnosis,

    repair,

    repairRecord:
      applied.repairRecord,

  };

}


/* ================================================================
   RETRY HANDLER
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


  run.retryCount +=
    1;


  const delay =
    calculateRetryDelay(
      run
    );


  audit(
    run,
    "RETRY_SCHEDULED",
    {

      retryCount:
        run.retryCount,

      delayMs:
        delay,

      category:
        failure.category,

    }

  );


  await sleep(
    delay
  );


  /*
   * Correct state transition:
   *
   * FAILED → EXECUTING
   *
   * is explicitly legal in v1.2.0.
   */

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

      scaled:
        false,

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

      scaled:
        false,

      level:
        run.autoScaleLevel,

      reason:
        "MAX_AUTO_SCALE reached",

    };

  }


  const metadata =
    result?.metadata ||
    {};


  const resource =
    metadata.resourceUsage ||
    result?.resourceUsage ||
    null;


  if (!resource) {

    return {

      scaled:
        false,

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
    (!Number.isFinite(cpu) || cpu < 80) &&
    (!Number.isFinite(memory) || memory < 80)
  ) {

    return {

      scaled:
        false,

      level:
        run.autoScaleLevel,

      reason:
        "Resource pressure below threshold",

    };

  }


  run.autoScaleLevel +=
    1;


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


  /*
   * Actual resource scaling remains an Executor concern.
   * Orchestrator only authorizes a level within the policy.
   */

  return {

    scaled:
      true,

    level:
      run.autoScaleLevel,

    reason:
      "Resource pressure detected",

  };

}


/* ================================================================
   START JOB
================================================================ */

async function startJob(
  request
) {

  loadDependencies();


  const job =
    normalizeJob(
      request
    );


  const run =
    createRunRecord(
      job
    );


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
        clone(
          job.policy
        ),

    }

  );


  return run;

}


/* ================================================================
   MAIN RUN
================================================================ */

async function run(
  request
) {

  const run =
    await startJob(
      request
    );


  try {

    /* ============================================================
       PHASE 1 — ANALYSIS
    ============================================================ */

    transition(
      run,
      STATES.ANALYZING,
      "Engineering analysis started"
    );


    await createCheckpoint(
      run,
      "pre-analysis"
    );


    let masterResult;


    try {

      masterResult =
        await analyzeWithMaster(
          run
        );

    } catch (error) {

      masterResult = {

        success:
          false,

        error:
          error.message,

      };

    }


    audit(
      run,
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
      masterResult.success ===
        false &&
      !masterResult.skipped
    ) {

      return finalizeRun(
        run,
        escalate(
          run,
          "Master Agent analysis failed",
          {

            category:
              "master-agent",

            message:
              masterResult.error ||
              "Master Agent analysis failed",

            retryable:
              false,

          }
        )
      );

    }


    /* ============================================================
       PHASE 2 — AUTHORITATIVE ENGINEERING LOOP
    ============================================================ */

    while (
      hasAttemptBudget(
        run
      )
    ) {

      if (
        TERMINAL_STATES.has(
          run.state
        )
      ) {

        break;

      }


      if (
        isRunDeadlineExceeded(
          run
        )
      ) {

        const timeoutFailure =
          recordFailure(
            run,
            {

              category:
                "timeout",

              failureStage:
                "orchestrator",

              message:
                "Engineering run deadline exceeded",

              retryable:
                false,

              timedOut:
                true,

            }
          );


        return finalizeRun(
          run,
          escalate(
            run,
            "Engineering execution deadline exceeded",
            timeoutFailure
          )
        );

      }


      let result;


      /* ==========================================================
         EXECUTION
      ========================================================== */

      try {

        result =
          await performExecutionAttempt(
            run
          );

      } catch (error) {

        /*
         * The exception itself is the authoritative execution
         * failure. Record exactly once.
         */

        const failure =
          recordFailure(
            run,
            error
          );


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
         * Try controlled diagnosis/repair.
         */

        if (
          hasRepairBudget(
            run
          )
        ) {

          const repairOutcome =
            await handleFailure(
              run,
              failure
            );


          if (
            repairOutcome?.retry
          ) {

            continue;

          }

        }


        /*
         * Finally allow transient retry if applicable.
         */

        if (
          await retryIfAllowed(
            run,
            failure
          )
        ) {

          continue;

        }


        return finalizeRun(
          run,
          escalate(
            run,
            "Engineering execution failed",
            failure
          )
        );

      }


      /* ==========================================================
         RESOURCE EVALUATION
      ========================================================== */

      evaluateAutoScale(
        run,
        result
      );


      /* ==========================================================
         VERIFICATION
      ========================================================== */

      const verification =
        await verifyExecution(
          run,
          result
        );


      if (
        verification.passed
      ) {

        const promotion =
          promote(
            run,
            result
          );


        if (
          promotion.promote
        ) {

          return finalizeRun(
            run,
            result
          );

        }


        return finalizeRun(
          run,
          escalate(
            run,
            promotion.reason,
            result
          )
        );

      }


      /* ==========================================================
         FAILURE → DIAGNOSIS → REPAIR
      ========================================================== */

      const failureResult =
        await handleFailure(
          run,
          result
        );


      if (
        failureResult?.retry
      ) {

        continue;

      }


      /* ==========================================================
         TRANSIENT RETRY
      ========================================================== */

      const failure =
        run.lastError;


      if (
        await retryIfAllowed(
          run,
          failure
        )
      ) {

        continue;

      }


      return finalizeRun(
        run,
        escalate(
          run,
          "Engineering retry policy exhausted",
          failure
        )
      );

    }


    /* ============================================================
       ATTEMPT LIMIT
    ============================================================ */

    return finalizeRun(
      run,
      escalate(
        run,
        "MAX_ATTEMPTS exhausted",
        run.lastError
      )
    );

  } catch (error) {

    /* ============================================================
       GLOBAL ORCHESTRATOR FAILURE
    ============================================================ */

    const failure =
      recordFailure(
        run,
        {

          category:
            "orchestrator",

          message:
            error.message,

          retryable:
            false,

        }
      );


    return finalizeRun(
      run,
      escalate(
        run,
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
  run,
  terminalResult
) {

  run.completedAt =
    run.completedAt ||
    new Date().toISOString();


  /*
   * Never infer success from state alone.
   */

  const authoritative =
    run.authoritative ===
      true &&
    run.passed ===
      true &&
    run.promoted ===
      true;


  const result = {

    success:
      authoritative,

    status:
      authoritative
        ? "promoted"
        : "failed",

    runId:
      run.runId,

    jobId:
      run.jobId,

    projectId:
      run.projectId,

    state:
      run.state,

    authoritative,

    passed:
      run.passed ===
      true,

    promoted:
      run.promoted ===
      true,

    escalated:
      run.escalated ===
      true,

    attempts:
      run.attempts,

    repairAttempts:
      run.repairAttempts,

    diagnosisAttempts:
      run.diagnosisAttempts,

    rollbackCount:
      run.rollbackCount,

    checkpointCount:
      run.checkpointCount,

    autoScaleLevel:
      run.autoScaleLevel,

    sourceHash:
      calculateFilesHash(
        run.currentFiles
      ),

    result:
      clone(
        terminalResult ||
        run.result ||
        null
      ),

    metadata: {

      orchestratorVersion:
        ORCHESTRATOR_VERSION,

      engineeringSystemVersion:
        ENGINEERING_SYSTEM_VERSION,

      completedAt:
        run.completedAt,

    },

  };


  run.result =
    clone(
      result
    );


  stateCall(

    [
      "completeRun",
      "finalizeRun",
      "saveRun",

    ],

    [
      run.runId,
      result,

    ]

  );


  return result;

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
    stateResult.success ===
      false
  ) {

    return {

      success:
        false,

      error:
        stateResult.error,

    };

  }


  if (
    engineeringExecutor &&
    typeof engineeringExecutor.cancel ===
      "function"
  ) {

    try {

      await engineeringExecutor
        .cancel(
          runId
        );

    } catch (error) {

      return {

        success:
          false,

        runId,

        error:
          error.message,

      };

    }

  }


  return {

    success:
      true,

    runId,

    cancelled:
      true,

  };

}


/* ================================================================
   RESUME
================================================================ */

async function resume(
  request
) {

  if (
    !request ||
    !request.run
  ) {

    throw new Error(
      "Resume requires an existing engineering run"
    );

  }


  const existing =
    clone(
      request.run
    );


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


  /*
   * Resume uses the persisted source tree and policy.
   */

  const job = {

    ...(existing.job || {}),

    jobId:
      existing.jobId,

    projectId:
      existing.projectId,

    userId:
      existing.userId,

    projectName:
      existing.projectName,

    files:
      clone(
        existing.currentFiles
      ),

    planning:
      clone(
        existing.planning
      ),

    intent:
      clone(
        existing.intent
      ),

    builder:
      clone(
        existing.builder
      ),

    manifest:
      clone(
        existing.manifest
      ),

    projectData:
      clone(
        existing.projectData
      ),

    framework:
      existing.framework,

    packageManager:
      existing.packageManager,

    policy:
      clone(
        existing.policy
      ),

  };


  /*
   * Do not silently create a different logical run.
   *
   * A resumed run gets a recovery marker and is executed through a
   * new orchestration invocation while preserving its source state.
   */

  audit(
    existing,
    "RUN_RESUME_REQUESTED",
    {

      previousRunId:
        existing.runId,

      previousState:
        existing.state,

    }

  );


  return run({

    ...job,

    metadata: {

      ...(job.metadata || {}),

      resumedFrom:
        existing.runId,

      recovery:
        true,

    },

  });

}


/* ================================================================
   HEALTH
================================================================ */

function getHealth() {

  loadDependencies();


  return {

    success:
      true,

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

      masterAgent:
        Boolean(
          masterAgent
        ),

      legacyAuthoritativeBuildService:
        Boolean(
          legacyAuthoritativeBuildService
        ),

    },

    authoritativePromotion:
      true,

    fakeSuccessAllowed:
      false,

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
