"use strict";

const financialControlService = require("./financialControlService");
const financialAuditService = require("./financialAuditService");

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 60 * 1000;

const jobs = new Map();

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value, max = 500) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return String(value)
    .trim()
    .slice(0, max);
}

function normalizeInterval(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_INTERVAL_MS;
  }

  return Math.min(
    MAX_INTERVAL_MS,
    Math.max(
      MIN_INTERVAL_MS,
      Math.floor(number)
    )
  );
}

function normalizeUserId(userId) {
  if (!userId) {
    return null;
  }

  return String(userId).trim();
}

function buildJobId(input = {}) {
  if (input.jobId) {
    return safeString(input.jobId, 200);
  }

  const userId =
    normalizeUserId(input.userId);

  if (!userId) {
    return null;
  }

  return `financial-${userId}`;
}

/**
 * Run one financial assessment.
 *
 * This function performs exactly one check. It does not create
 * a permanent background process.
 */
async function runFinancialCheck(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_FINANCIAL_CHECK_INPUT",
        message:
          "Financial check input must be an object."
      }
    };
  }

  const startedAt =
    new Date();

  let assessment;

  try {
    assessment =
      await financialControlService({
        ...input,
        operation:
          input.operation ||
          "assessment"
      });
  } catch (error) {
    const result = {
      success: false,
      status: "error",
      operation:
        "financial_assessment",
      error: {
        code:
          safeString(
            error?.code,
            200
          ) ||
          "FINANCIAL_CHECK_FAILED",

        message:
          safeString(
            error?.message,
            1000
          ) ||
          "Financial assessment failed."
      }
    };

    /*
     * Audit failure only when a valid owner ID exists.
     */
    if (input.userId) {
      try {
        await financialAuditService({
          operation: "fail",

          userId:
            input.userId,

          agent:
            "financial_scheduler",

          operation:
            "financial_check",

          action:
            "scheduled_assessment",

          source:
            "financial_scheduler",

          success: false,

          errorCode:
            result.error.code,

          errorMessage:
            result.error.message,

          startedAt,

          completedAt:
            new Date()
        });
      } catch {
        /*
         * Audit failure must not hide the original financial
         * failure.
         */
      }
    }

    return result;
  }

  const completedAt =
    new Date();

  /*
   * Record successful/partial assessment in audit trail.
   */
  if (input.userId) {
    try {
      const summary =
        assessment?.summary || {};

      await financialAuditService({
        operation:
          assessment?.status ===
          "completed_with_errors"
            ? "complete"
            : "complete",

        userId:
          input.userId,

        agent:
          "financial_scheduler",

        operation:
          "financial_check",

        action:
          "scheduled_assessment",

        source:
          "financial_scheduler",

        success:
          assessment?.success === true,

        status:
          assessment?.status ===
          "completed_with_errors"
            ? "partial"
            : "completed",

        decision:
          summary.criticalIncidents > 0
            ? "alert"
            : "observe",

        riskLevel:
          summary.criticalIncidents > 0
            ? "critical"
            : summary.highIncidents > 0
              ? "high"
              : "none",

        projectId:
          input.projectId,

        accountId:
          input.accountId,

        startedAt,

        completedAt,

        resultSummary: {
          costObservations:
            summary.costObservations,

          usageObservations:
            summary.usageObservations,

          forecasts:
            summary.forecasts,

          incidents:
            summary.incidents,

          criticalIncidents:
            summary.criticalIncidents,

          highIncidents:
            summary.highIncidents,

          alertsPrepared:
            summary.alertsPrepared,

          financialDataQuality:
            summary.financialDataQuality
        }
      });
    } catch {
      /*
       * Never replace a valid financial assessment with an
       * audit-storage error.
       */
    }
  }

  return {
    success:
      assessment?.success !== false,

    status:
      assessment?.status ||
      "completed",

    operation:
      "financial_check",

    startedAt:
      startedAt.toISOString(),

    completedAt:
      completedAt.toISOString(),

    assessment
  };
}

/**
 * Internal timer callback.
 */
async function executeJob(jobId) {
  const job =
    jobs.get(jobId);

  if (!job || job.running) {
    return null;
  }

  job.running = true;
  job.lastStartedAt =
    new Date();

  try {
    const result =
      await runFinancialCheck(
        job.input
      );

    job.lastFinishedAt =
      new Date();

    job.lastResult =
      result;

    job.runCount += 1;

    return result;
  } catch (error) {
    const result = {
      success: false,
      status: "error",
      error: {
        code:
          safeString(
            error?.code,
            200
          ) ||
          "SCHEDULER_JOB_FAILED",

        message:
          safeString(
            error?.message,
            1000
          ) ||
          "Scheduled financial job failed."
      }
    };

    job.lastFinishedAt =
      new Date();

    job.lastResult =
      result;

    job.runCount += 1;

    return result;
  } finally {
    job.running = false;
  }
}

/**
 * Start one recurring financial check.
 */
function startFinancialJob(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_SCHEDULER_INPUT",
        message:
          "Scheduler input must be an object."
      }
    };
  }

  const jobId =
    buildJobId(input);

  if (!jobId) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "JOB_ID_REQUIRED",
        message:
          "userId or jobId is required."
      }
    };
  }

  /*
   * Prevent duplicate timers.
   */
  if (jobs.has(jobId)) {
    return {
      success: false,
      status: "already_running",
      jobId,
      message:
        "Financial scheduler job is already running."
    };
  }

  const intervalMs =
    normalizeInterval(
      input.intervalMs
    );

  const job = {
    jobId,

    userId:
      normalizeUserId(
        input.userId
      ),

    intervalMs,

    running: false,

    startedAt:
      new Date(),

    lastStartedAt: null,
    lastFinishedAt: null,

    runCount: 0,

    lastResult: null,

    input: {
      ...input,

      operation:
        "assessment"
    },

    timer: null
  };

  job.timer =
    setInterval(
      () => {
        executeJob(
          jobId
        ).catch(() => {
          /*
           * executeJob already converts failures into job state.
           */
        });
      },
      intervalMs
    );

  /*
   * Do not allow this timer to keep a process alive during
   * graceful shutdown/testing.
   */
  if (
    typeof job.timer.unref ===
    "function"
  ) {
    job.timer.unref();
  }

  jobs.set(
    jobId,
    job
  );

  return {
    success: true,
    status: "started",
    jobId,
    intervalMs,
    nextCheckAt:
      new Date(
        Date.now() +
          intervalMs
      ).toISOString()
  };
}

/**
 * Stop one scheduler job.
 */
function stopFinancialJob(
  jobId
) {
  const normalizedJobId =
    safeString(
      jobId,
      200
    );

  if (!normalizedJobId) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "JOB_ID_REQUIRED",
        message:
          "jobId is required."
      }
    };
  }

  const job =
    jobs.get(
      normalizedJobId
    );

  if (!job) {
    return {
      success: false,
      status: "not_found",
      jobId:
        normalizedJobId
    };
  }

  clearInterval(
    job.timer
  );

  jobs.delete(
    normalizedJobId
  );

  return {
    success: true,
    status: "stopped",
    jobId:
      normalizedJobId
  };
}

/**
 * Stop every local scheduler job.
 *
 * Useful during application shutdown.
 */
function stopAllFinancialJobs() {
  const stopped = [];

  for (
    const [
      jobId,
      job
    ] of jobs.entries()
  ) {
    clearInterval(
      job.timer
    );

    stopped.push(
      jobId
    );
  }

  jobs.clear();

  return {
    success: true,
    status: "stopped",
    count:
      stopped.length,
    jobs: stopped
  };
}

/**
 * Run a check immediately without creating a timer.
 */
async function runNow(
  input = {}
) {
  return runFinancialCheck(
    input
  );
}

/**
 * Get scheduler status.
 */
function getSchedulerStatus(
  userId = null
) {
  const normalizedUserId =
    normalizeUserId(
      userId
    );

  const records = [];

  for (
    const job of jobs.values()
  ) {
    if (
      normalizedUserId &&
      job.userId !==
        normalizedUserId
    ) {
      continue;
    }

    records.push({
      jobId:
        job.jobId,

      userId:
        job.userId,

      intervalMs:
        job.intervalMs,

      running:
        job.running,

      startedAt:
        job.startedAt,

      lastStartedAt:
        job.lastStartedAt,

      lastFinishedAt:
        job.lastFinishedAt,

      runCount:
        job.runCount,

      lastStatus:
        job.lastResult?.status ||
        null,

      lastSuccess:
        typeof job.lastResult?.success ===
        "boolean"
          ? job.lastResult.success
          : null
    });
  }

  return {
    success: true,
    status: "available",

    count:
      records.length,

    jobs: records
  };
}

/**
 * Main service interface.
 */
async function financialSchedulerService(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_SCHEDULER_INPUT",
        message:
          "Scheduler input must be an object."
      }
    };
  }

  const operation =
    String(
      input.operation ||
      "run_now"
    )
      .trim()
      .toLowerCase();

  switch (operation) {
    case "run":
    case "run_now":
    case "check":
      return runNow(
        input
      );

    case "start":
    case "start_job":
      return startFinancialJob(
        input
      );

    case "stop":
    case "stop_job":
      return stopFinancialJob(
        input.jobId
      );

    case "stop_all":
      return stopAllFinancialJobs();

    case "status":
      return getSchedulerStatus(
        input.userId
      );

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code:
            "UNSUPPORTED_SCHEDULER_OPERATION",
          message:
            `Unsupported scheduler operation: ${operation}`
        }
      };
  }
}

financialSchedulerService.runNow =
  runNow;

financialSchedulerService.startFinancialJob =
  startFinancialJob;

financialSchedulerService.stopFinancialJob =
  stopFinancialJob;

financialSchedulerService.stopAllFinancialJobs =
  stopAllFinancialJobs;

financialSchedulerService.getSchedulerStatus =
  getSchedulerStatus;

module.exports =
  financialSchedulerService;
