/**
 * ================================================================
 * ZYRIONOS ENGINEERING ORCHESTRATOR
 * ================================================================
 *
 * File:
 *   services/engineering/engineeringOrchestrator.js
 *
 * Version:
 *   1.0.0
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
 *   Executor
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
 * This file NEVER pretends that a build succeeded.
 *
 * A run can become:
 *
 *   PASSED
 *
 * only when the authoritative execution evidence says so.
 *
 * ================================================================
 */

"use strict";


/* ================================================================
   MODULE IDENTITY
================================================================ */

const ORCHESTRATOR_VERSION =
  "1.0.0";

const ENGINEERING_SYSTEM_VERSION =
  "1.0.0";


/* ================================================================
   NODE MODULES
================================================================ */

const crypto =
  require("crypto");

const path =
  require("path");


/* ================================================================
   INTERNAL DEPENDENCIES
================================================================ */

/**
 * The orchestrator is intentionally tolerant about dependency
 * initialization so the four-file engineering system can be
 * integrated into the existing backend without forcing a massive
 * refactor.
 */

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
   LOAD ENGINEERING MODULES
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


  /**
   * Master Agent location can differ between deployments.
   *
   * We intentionally check known backend locations.
   *
   * No AI-generated path is ever accepted here.
   */

  if (!masterAgent) {

    const candidates = [

      "../../agents/masterAgent",

      "../../agent/masterAgent",

      "../../masterAgent",

      "../masterAgent",

    ];


    for (
      const candidate
      of candidates
    ) {

      const loaded =
        safeRequire(candidate);


      if (loaded) {

        masterAgent =
          loaded;

        break;

      }

    }

  }


  /**
   * Legacy adapter.
   *
   * This remains only as a compatibility bridge while the new
   * engineering executor becomes authoritative.
   */

  if (!legacyAuthoritativeBuildService) {

    const candidates = [

      "../authoritativeBuildService",

      "../../services/authoritativeBuildService",

      "../../authoritativeBuildService",

    ];


    for (
      const candidate
      of candidates
    ) {

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

    STATES.PASSED,

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

      STATES.ROLLBACK,

      STATES.ESCALATED,

    ],

    DIAGNOSING: [

      STATES.REPAIRING,

      STATES.ROLLBACK,

      STATES.ESCALATED,

    ],

    REPAIRING: [

      STATES.VERIFYING,

      STATES.EXECUTING,

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
   RETRYABLE FAILURE CATEGORIES
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


/* ================================================================
   NON-RETRYABLE FAILURE CATEGORIES
================================================================ */

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
   FAILURE NORMALIZATION
================================================================ */

function normalizeFailure(error, fallbackCategory) {

  if (!error) {

    return {

      category:
        fallbackCategory ||
        "unknown",

      message:
        "Unknown engineering failure",

      retryable:
        false,

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
      RETRYABLE_FAILURES.has(category)
    ) {

      retryable =
        true;

    }

    else if (
      NON_RETRYABLE_FAILURES.has(category)
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

    affectedFiles:
      Array.isArray(error.affectedFiles)
        ? error.affectedFiles
        : [],

    errors:
      Array.isArray(error.errors)
        ? error.errors
        : [],

    stdout:
      error.stdout ||
      "",

    stderr:
      error.stderr ||
      "",

    exitCode:
      Number.isInteger(error.exitCode)
        ? error.exitCode
        : null,

    signal:
      error.signal ||
      null,

    timedOut:
      Boolean(error.timedOut),

    buildId:
      error.buildId ||
      null,

    sourceHash:
      error.sourceHash ||
      null,

  };

}


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
   HASH
================================================================ */

function hashObject(value) {

  return crypto
    .createHash("sha256")
    .update(

      JSON.stringify(
        value,
        Object.keys(value || {}).sort()
      )

    )
    .digest("hex");

}


/* ================================================================
   DEEP CLONE
================================================================ */

function clone(value) {

  if (
    value ===
    undefined
  ) {

    return undefined;

  }


  return JSON.parse(
    JSON.stringify(value)
  );

}


/* ================================================================
   NUMBER NORMALIZATION
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


  /**
   * Scope expansion is a ratio, not an integer.
   */

  if (
    Number.isFinite(
      Number(input.MAX_SCOPE_EXPANSION)
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
   JOB INTAKE
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
    Array.isArray(request.files)
      ? request.files
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
    files.length ===
    0 &&
    !request.allowEmptyWorkspace
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

    files:
      clone(files),

    planning:
      clone(request.planning || null),

    intent:
      clone(request.intent || null),

    builder:
      clone(request.builder || null),

    manifest:
      clone(request.manifest || null),

    projectData:
      clone(request.projectData || {}),

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
      clone(request.environment || {}),

    metadata:
      clone(request.metadata || {}),

    policy:
      normalizePolicy(
        request.policy
      ),

    allowLegacyAdapter:
      request.allowLegacyAdapter !==
      false,

    allowAutoScale:
      request.allowAutoScale !==
      false,

    dryRun:
      request.dryRun ===
      true,

  };

}


/* ================================================================
   STATE ACCESS ADAPTER
================================================================ */

/**
 * The State file remains the source of truth.
 *
 * Because the exact public API of engineeringState.js may evolve,
 * this adapter supports several conventional method names without
 * duplicating state logic.
 */

function stateCall(
  methodNames,
  args
) {

  loadDependencies();


  if (!engineeringState) {

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
      typeof method ===
      "function"
    ) {

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
    createId("eng-run");


  const run = {

    runId,

    jobId:
      job.jobId,

    projectId:
      job.projectId,

    userId:
      job.userId,

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
      clone(job.policy),

    attempts: 0,

    repairAttempts: 0,

    diagnosisAttempts: 0,

    rollbackCount: 0,

    checkpointCount: 0,

    retryCount: 0,

    scopeExpansion: 1,

    autoScaleLevel: 1,

    currentFiles:
      clone(job.files),

    originalFiles:
      clone(job.files),

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

  };


  stateCall(

    [
      "createRun",
      "createEngineeringRun",
      "initializeRun",
    ],

    [run]

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
      createId("audit"),

    runId:
      run.runId,

    timestamp:
      new Date().toISOString(),

    event,

    state:
      run.state,

    attempt:
      run.attempts,

    data:
      clone(data || {}),

  };


  run.audit.push(
    record
  );


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


  const previousState =
    currentState;


  run.state =
    nextState;


  const transitionRecord = {

    from:
      previousState,

    to:
      nextState,

    reason:
      reason ||
      null,

    timestamp:
      new Date().toISOString(),

    metadata:
      clone(metadata || {}),

  };


  stateCall(

    [
      "transitionState",
      "transitionRun",
      "setState",
    ],

    [
      run.runId,
      nextState,
      transitionRecord,
    ]

  );


  audit(
    run,
    "STATE_TRANSITION",
    transitionRecord
  );


  return transitionRecord;

}


/* ================================================================
   ATTEMPT LIMIT
================================================================ */

function hasAttemptBudget(
  run
) {

  return (
    run.attempts <
    run.policy.MAX_ATTEMPTS
  );

}


/* ================================================================
   REPAIR LIMIT
================================================================ */

function hasRepairBudget(
  run
) {

  return (
    run.repairAttempts <
    run.policy.MAX_REPAIR_ATTEMPTS
  );

}


/* ================================================================
   ROLLBACK LIMIT
================================================================ */

function hasRollbackBudget(
  run
) {

  return (
    run.rollbackCount <
    run.policy.MAX_ROLLBACKS
  );

}


/* ================================================================
   SCOPE LIMIT
================================================================ */

function withinScope(
  run,
  candidateFiles
) {

  const original =
    Math.max(
      1,
      run.originalFiles.length
    );


  const current =
    Array.isArray(candidateFiles)
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
   CHECKPOINT CREATION
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
      clone(run.currentFiles),

    sourceHash:
      calculateFilesHash(
        run.currentFiles
      ),

  };


  run.checkpoints.push(
    checkpoint
  );


  run.checkpointCount +=
    1;


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


  audit(
    run,
    "CHECKPOINT_CREATED",
    checkpoint
  );


  return checkpoint;

}


/* ================================================================
   FILE HASH
================================================================ */

function calculateFilesHash(
  files
) {

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        Array.isArray(files)
          ? files.map(
              file => ({

                path:
                  file.path ||
                  file.name ||
                  "",

                content:
                  file.content ||
                  "",

              })
            )
          : []
      )
    )
    .digest("hex");

}


/* ================================================================
   CHECKPOINT ROLLBACK
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
    !hasRollbackBudget(run)
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


  run.currentFiles =
    clone(
      checkpoint.files
    );


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
      reason ||
      null,

    restoredSourceHash:
      checkpoint.sourceHash,

    timestamp:
      new Date().toISOString(),

  };


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


  audit(
    run,
    "ROLLBACK_COMPLETED",
    rollbackRecord
  );


  return rollbackRecord;

}


/* ================================================================
   BACKOFF
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


/* ================================================================
   WAIT
================================================================ */

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


/* ================================================================
   RETRY DECISION
================================================================ */

function shouldRetry(
  run,
  failure
) {

  if (
    !failure
  ) {

    return false;

  }


  if (
    !failure.retryable
  ) {

    return false;

  }


  if (
    !hasAttemptBudget(run)
  ) {

    return false;

  }


  return true;

}


/* ================================================================
   RECORD FAILURE
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
      createId("failure"),

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


  audit(
    run,
    "FAILURE_RECORDED",
    record
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

    exitCode:
      Number.isInteger(
        result?.exitCode
      )
        ? result.exitCode
        : null,

    durationMs:
      result?.durationMs ||
      null,

    artifact:
      clone(
        result?.artifact ||
        null
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
    record
  );


  return record;

}


/* ================================================================
   AUTHORITATIVE RESULT CHECK
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


  /**
   * A successful authoritative build must have actual evidence.
   */

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
   EXECUTOR CALL
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


  /**
   * The new engineering executor is preferred.
   */

  if (
    typeof engineeringExecutor.executeBuild ===
    "function"
  ) {

    return engineeringExecutor
      .executeBuild({

        projectId:
          run.projectId,

        userId:
          run.userId,

        projectName:
          run.job?.projectName ||
          "ZyrionOS Project",

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

      });

  }


  throw new Error(
    "engineeringExecutor.executeBuild is unavailable"
  );

}


/* ================================================================
   LEGACY AUTHORITATIVE BUILD ADAPTER
================================================================ */

/**
 * Compatibility bridge only.
 *
 * The new engineering executor remains the preferred execution
 * authority.
 *
 * This adapter exists so existing ZyrionOS builds can continue to
 * work during migration.
 */

async function executeLegacyBuild(
  run
) {

  loadDependencies();


  if (
    !run.job.allowLegacyAdapter
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
        legacyAuthoritativeBuildService.SERVICE_VERSION ||
        null,

    }

  );


  const result =
    await execute({

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


  return result;

}


/* ================================================================
   MASTER AGENT ANALYSIS
================================================================ */

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


  /**
   * Supported Master Agent contracts.
   */

  const candidates = [

    "analyzeEngineeringJob",

    "analyzeBuild",

    "run",

    "execute",

    "build",

  ];


  let method = null;


  for (
    const name
    of candidates
  ) {

    if (
      typeof masterAgent[name] ===
      "function"
    ) {

      method =
        masterAgent[name];

      break;

    }

  }


  if (!method) {

    return {

      success:
        true,

      skipped:
        true,

      reason:
        "No compatible Master Agent method",

    };

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

  };


  const result =
    await method.call(
      masterAgent,
      context
    );


  return (
    result || {

      success:
        true,

    }
  );

}


/* ================================================================
   INTELLIGENCE DIAGNOSIS
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


  const candidates = [

    "diagnoseFailure",

    "diagnose",

    "analyzeFailure",

    "analyze",

  ];


  let method = null;


  for (
    const name
    of candidates
  ) {

    if (
      typeof engineeringIntelligence[name] ===
      "function"
    ) {

      method =
        engineeringIntelligence[name];

      break;

    }

  }


  if (!method) {

    return {

      success:
        false,

      error:
        "No compatible diagnosis method",

    };

  }


  return method.call(

    engineeringIntelligence,

    {

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
        clone(failure),

      authoritative:
        true,

      planning:
        clone(
          run.planning ||
          null
        ),

    }

  );

}


/* ================================================================
   INTELLIGENCE REPAIR
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


  const candidates = [

    "repairFailure",

    "repair",

    "generateRepair",

    "fix",

  ];


  let method = null;


  for (
    const name
    of candidates
  ) {

    if (
      typeof engineeringIntelligence[name] ===
      "function"
    ) {

      method =
        engineeringIntelligence[name];

      break;

    }

  }


  if (!method) {

    return {

      success:
        false,

      error:
        "No compatible repair method",

    };

  }


  return method.call(

    engineeringIntelligence,

    {

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
        clone(failure),

      diagnosis:
        clone(diagnosis),

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

    }

  );

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
        "Repair produced no file set",

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
        "Repair exceeded scope expansion limit",

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


  /**
   * Dependency-change enforcement.
   */

  const dependencyChanges =
    Number(
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

    };

  }


  run.currentFiles =
    clone(
      candidateFiles
    );


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
      clone(
        changedFiles
      ),

    dependencyChanges,

    sourceHashBefore:
      calculateFilesHash(
        run.originalFiles
      ),

    sourceHashAfter:
      calculateFilesHash(
        candidateFiles
      ),

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
    repairRecord
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
      createId("verify"),

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
    verification
  );


  return verification;

}


/* ================================================================
   FINAL PROMOTION DECISION
================================================================ */

function canPromote(
  run,
  result
) {

  /**
   * Absolutely no promotion without authoritative evidence.
   */

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
      "Authoritative build, artifact and verification requirements passed",

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
    clone(result);


  audit(
    run,
    "FINAL_PROMOTION",
    {

      buildId:
        result.buildId,

      artifact:
        clone(
          result.artifact
        ),

      sourceHash:
        result.sourceHash,

    }

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

    transition(
      run,
      STATES.ESCALATED,
      reason
    );

  }


  run.escalated =
    true;


  run.passed =
    false;


  run.authoritative =
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

    reason,

    failure:
      clone(failure || null),

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
        clone(failure || null),

    }

  );


  return run.result;

}


/* ================================================================
   VERIFY
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


  return {

    success:
      false,

    passed:
      false,

    verification,

  };

}


/* ================================================================
   SINGLE EXECUTION ATTEMPT
================================================================ */

async function performExecutionAttempt(
  run
) {

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


  const startedAt =
    Date.now();


  let result =
    null;


  try {

    /**
     * New executor is authoritative.
     */

    result =
      await executeBuild(
        run
      );


  } catch (executorError) {

    /**
     * If the new executor itself cannot execute, the legacy
     * adapter is allowed only as a migration bridge.
     */

    audit(
      run,
      "ENGINEERING_EXECUTOR_ERROR",
      {

        message:
          executorError.message,

      }

    );


    if (
      run.job.allowLegacyAdapter
    ) {

      result =
        await executeLegacyBuild(
          run
        );

    }


    if (!result) {

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
   FAILURE HANDLING
================================================================ */

async function handleFailure(
  run,
  result
) {

  const failure =
    recordFailure(

      run,

      result?.repairContext ||

      result?.failure ||

      result

    );


  transition(
    run,
    STATES.FAILED,
    failure.message
  );


  /**
   * Non-retryable failures can still be repairable.
   *
   * Therefore retryability is NOT the same as repairability.
   */

  if (
    !hasRepairBudget(run)
  ) {

    return escalate(

      run,

      "Repair attempt limit exhausted",

      failure

    );

  }


  transition(
    run,
    STATES.DIAGNOSING,
    "Starting failure diagnosis"
  );


  run.diagnosisAttempts +=
    1;


  if (
    run.diagnosisAttempts >
    run.policy.MAX_DIAGNOSIS_ATTEMPTS
  ) {

    return escalate(

      run,

      "Diagnosis attempt limit exhausted",

      failure

    );

  }


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

    return escalate(

      run,

      "Failure diagnosis failed",

      failure

    );

  }


  if (
    !hasRepairBudget(run)
  ) {

    return escalate(

      run,

      "Repair budget exhausted",

      failure

    );

  }


  transition(
    run,
    STATES.REPAIRING,
    "Applying engineering repair"
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


  const applied =
    applyRepair(
      run,
      repair
    );


  if (
    !applied.success
  ) {

    return escalate(

      run,

      applied.reason ||
        "Repair could not be safely applied",

      failure

    );

  }


  /**
   * Every repair creates a new checkpoint before rebuild.
   */

  await createCheckpoint(

    run,

    "post-repair-before-rebuild"

  );


  /**
   * Retry from EXECUTING.
   */

  return {

    repaired:
      true,

    retry:
      true,

    failure,

    diagnosis,

    repair,

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


  return true;

}


/* ================================================================
   AUTO-SCALE DECISION
================================================================ */

function evaluateAutoScale(
  run,
  result
) {

  if (
    !run.job.allowAutoScale
  ) {

    return {

      scaled:
        false,

      level:
        run.autoScaleLevel,

      reason:
        "Auto-scale disabled for run",

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
    cpu < 80 &&
    memory < 80
  ) {

    return {

      scaled:
        false,

      level:
        run.autoScaleLevel,

      reason:
        "Resource pressure below scale threshold",

    };

  }


  run.autoScaleLevel +=
    1;


  audit(
    run,
    "AUTO_SCALE",
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

    scaled:
      true,

    level:
      run.autoScaleLevel,

    reason:
      "Observed resource pressure",

  };

}


/* ================================================================
   JOB START
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


  /**
   * Keep original job data attached to the run so every downstream
   * operation has one deterministic source of execution context.
   */

  run.job =
    clone(job);

  run.jobId =
    job.jobId;

  run.projectName =
    job.projectName;

  run.projectData =
    clone(
      job.projectData
    );

  run.planning =
    clone(
      job.planning
    );

  run.intent =
    clone(
      job.intent
    );

  run.builder =
    clone(
      job.builder
    );

  run.manifest =
    clone(
      job.manifest
    );

  run.framework =
    job.framework;

  run.packageManager =
    job.packageManager;


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
   MAIN RUN LOOP
================================================================ */

async function run(
  request
) {

  const run =
    await startJob(
      request
    );


  try {

    /**
     * ============================================================
     * PHASE 1 — ANALYSIS
     * ============================================================
     */

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


    if (
      masterResult &&
      masterResult.success ===
      false &&
      !masterResult.skipped
    ) {

      return escalate(

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

      );

    }


    /**
     * ============================================================
     * PHASE 2 — EXECUTION / REPAIR LOOP
     * ============================================================
     */

    while (
      hasAttemptBudget(run)
    ) {

      /**
       * Never execute a terminal run.
       */

      if (
        TERMINAL_STATES.has(
          run.state
        )
      ) {

        break;

      }


      let result;


      try {

        result =
          await performExecutionAttempt(
            run
          );


      } catch (error) {

        const failure =
          recordFailure(

            run,

            {

              category:
                "execution",

              message:
                error.message,

              retryable:
                false,

            }

          );


        /**
         * Try repair path even when execution itself throws.
         */

        if (
          hasRepairBudget(run)
        ) {

          const repairOutcome =
            await handleFailure(

              run,

              {

                success:
                  false,

                failure,

              }

            );


          if (
            repairOutcome?.retry
          ) {

            continue;

          }

        }


        return escalate(

          run,

          "Engineering execution failed",

          failure

        );

      }


      /**
       * ==========================================================
       * RESOURCE / SCALE EVALUATION
       * ==========================================================
       */

      evaluateAutoScale(
        run,
        result
      );


      /**
       * ==========================================================
       * AUTHORITATIVE VERIFICATION
       * ==========================================================
       */

      const verification =
        await verifyExecution(

          run,

          result

        );


      if (
        verification.passed
      ) {

        /**
         * --------------------------------------------------------
         * PASSED
         * --------------------------------------------------------
         */

        const promotion =
          promote(
            run,
            result
          );


        if (
          promotion.promote
        ) {

          return finalizeRun(
            run
          );

        }


        return escalate(

          run,

          promotion.reason,

          result

        );

      }


      /**
       * ==========================================================
       * FAILURE → DIAGNOSIS → REPAIR
       * ==========================================================
       */

      const failureResult =
        await handleFailure(

          run,

          result

        );


      if (
        failureResult?.retry
      ) {

        /**
         * A repaired source tree must be executed again.
         */

        continue;

      }


      /**
       * ==========================================================
       * RETRY POLICY
       * ==========================================================
       */

      const failure =
        run.lastError;


      if (
        await retryIfAllowed(
          run,
          failure
        )
      ) {

        /**
         * A retry without repair is only permitted for explicitly
         * retryable transient failures.
         */

        transition(
          run,
          STATES.EXECUTING,
          "Retrying transient engineering failure"
        );


        continue;

      }


      return escalate(

        run,

        "Engineering retry policy exhausted",

        failure

      );

    }


    /**
     * ============================================================
     * ATTEMPT LIMIT EXHAUSTED
     * ============================================================
     */

    return escalate(

      run,

      "MAX_ATTEMPTS exhausted",

      run.lastError

    );

  } catch (error) {

    /**
     * ============================================================
     * GLOBAL ORCHESTRATOR FAILURE
     * ============================================================
     */

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


    return escalate(

      run,

      "Engineering orchestrator failure",

      failure

    );

  }

}


/* ================================================================
   FINALIZE RUN
================================================================ */

function finalizeRun(
  run
) {

  run.completedAt =
    new Date().toISOString();


  const result = {

    success:
      run.promoted ===
      true,

    status:
      run.promoted
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

    authoritative:
      run.authoritative,

    passed:
      run.passed,

    promoted:
      run.promoted,

    attempts:
      run.attempts,

    repairAttempts:
      run.repairAttempts,

    diagnosisAttempts:
      run.diagnosisAttempts,

    rollbackCount:
      run.rollbackCount,

    checkpoints:
      run.checkpointCount,

    autoScaleLevel:
      run.autoScaleLevel,

    sourceHash:
      calculateFilesHash(
        run.currentFiles
      ),

    result:
      clone(
        run.result
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
   CANCEL RUN
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


  audit(
    {

      runId,

      state:
        "UNKNOWN",

      attempts:
        0,

      audit: [],

    },

    "RUN_CANCELLATION_REQUESTED",
    cancellation
  );


  /**
   * Executor cancellation is intentionally delegated if supported.
   */

  if (
    engineeringExecutor &&
    typeof engineeringExecutor.cancel ===
    "function"
  ) {

    try {

      await engineeringExecutor.cancel(
        runId
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


  return {

    success:
      true,

    runId,

    cancelled:
      true,

  };

}


/* ================================================================
   RESUME / RECOVERY
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


  /**
   * Resume by rebuilding the job context from the persisted run.
   */

  const job = {

    ...existing.job,

    jobId:
      existing.jobId,

    projectId:
      existing.projectId,

    userId:
      existing.userId,

    files:
      existing.currentFiles,

    policy:
      existing.policy,

  };


  const recovered =
    await startJob(
      job
    );


  /**
   * Preserve durable counters.
   */

  recovered.runId =
    existing.runId;

  recovered.attempts =
    existing.attempts || 0;

  recovered.repairAttempts =
    existing.repairAttempts || 0;

  recovered.diagnosisAttempts =
    existing.diagnosisAttempts || 0;

  recovered.rollbackCount =
    existing.rollbackCount || 0;

  recovered.checkpointCount =
    existing.checkpointCount || 0;

  recovered.retryCount =
    existing.retryCount || 0;

  recovered.autoScaleLevel =
    existing.autoScaleLevel || 1;

  recovered.currentFiles =
    clone(
      existing.currentFiles
    );


  audit(
    recovered,
    "RUN_RESUMED",
    {

      previousState:
        existing.state,

    }

  );


  /**
   * Resume through the same controlled pipeline.
   */

  return run({

    ...job,

    jobId:
      existing.jobId,

    metadata: {

      ...(job.metadata || {}),

      resumedFrom:
        existing.runId,

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

  };

}


/* ================================================================
   PUBLIC CONTRACT
================================================================ */

module.exports = {

  ORCHESTRATOR_VERSION,

  ENGINEERING_SYSTEM_VERSION,

  STATES,

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
