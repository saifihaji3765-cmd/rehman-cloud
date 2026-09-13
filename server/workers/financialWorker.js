"use strict";

/**
 * ZyrionOS Financial Worker Entry Point
 *
 * Production-oriented one-shot worker.
 *
 * Intended execution:
 *
 *   ECS Scheduled Task
 *          ↓
 *   node server/workers/financialWorker.js
 *          ↓
 *   financialIngestionWorker
 *          ↓
 *   real provider observations
 *          ↓
 *   financial snapshots
 *          ↓
 *   process exits
 *
 * IMPORTANT:
 * - This file does NOT create a repeating timer.
 * - This file does NOT execute payments.
 * - This file does NOT modify infrastructure.
 * - This file does NOT send WhatsApp messages.
 * - No fake/mock/demo data is generated.
 * - A missing provider does not become zero.
 * - User identity must be explicitly configured.
 */

const financialIngestionWorker = require(
  "./financialIngestionWorker"
);

const logger = require(
  "../services/loggerService"
);

const SHUTDOWN_TIMEOUT_MS = 15000;

let shuttingDown = false;

/**
 * ---------------------------------------------------------
 * SAFE LOGGING
 * ---------------------------------------------------------
 *
 * Do not print provider credentials, environment values,
 * tokens, request bodies, or provider payloads.
 */
function logInfo(message, metadata = null) {
  const safeMessage =
    typeof message === "string"
      ? message.slice(0, 1000)
      : "Financial worker event.";

  try {
    if (
      logger &&
      typeof logger.info === "function"
    ) {
      logger.info(safeMessage);
      return;
    }
  } catch (error) {
    // Fall through to console.
  }

  console.log(
    `[FINANCIAL_WORKER] ${safeMessage}`
  );

  /*
   * Metadata is intentionally not printed by default.
   * Financial provider payloads can contain sensitive data.
   */
  void metadata;
}

function logSuccess(message) {
  const safeMessage =
    typeof message === "string"
      ? message.slice(0, 1000)
      : "Financial worker completed.";

  try {
    if (
      logger &&
      typeof logger.success === "function"
    ) {
      logger.success(safeMessage);
      return;
    }
  } catch (error) {
    // Fall through to console.
  }

  console.log(
    `[FINANCIAL_WORKER] ${safeMessage}`
  );
}

function logError(error) {
  const message =
    typeof error?.message === "string"
      ? error.message.slice(0, 1000)
      : "Financial worker failed.";

  try {
    if (
      logger &&
      typeof logger.error === "function"
    ) {
      logger.error(message);
      return;
    }
  } catch (loggerError) {
    // Fall through to console.
  }

  console.error(
    `[FINANCIAL_WORKER] ${message}`
  );
}

/**
 * ---------------------------------------------------------
 * USER ID RESOLUTION
 * ---------------------------------------------------------
 *
 * The worker must never silently operate without a user
 * scope.
 *
 * Priority:
 *
 * FINANCIAL_OWNER_USER_ID
 * OWNER_USER_ID
 * ZYRIONOS_OWNER_USER_ID
 */
function resolveUserId() {
  const candidates = [
    process.env.FINANCIAL_OWNER_USER_ID,
    process.env.OWNER_USER_ID,
    process.env.ZYRIONOS_OWNER_USER_ID
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate !== "string"
    ) {
      continue;
    }

    const userId =
      candidate.trim();

    if (
      userId &&
      userId.length <= 200
    ) {
      return userId;
    }
  }

  return null;
}

/**
 * ---------------------------------------------------------
 * WORKER INPUT
 * ---------------------------------------------------------
 *
 * Environment variables are used only for operational
 * configuration, never for provider credentials in logs.
 */
function buildWorkerInput() {
  const userId =
    resolveUserId();

  if (!userId) {
    const error =
      new Error(
        "Financial worker user ID is not configured."
      );

    error.code =
      "FINANCIAL_USER_ID_REQUIRED";

    throw error;
  }

  const input = {
    userId
  };

  /*
   * Optional provider list.
   *
   * Example:
   *
   * FINANCIAL_PROVIDERS=openai,aws
   *
   * If absent, the financial provider service can resolve
   * its configured providers itself.
   */
  if (
    typeof process.env.FINANCIAL_PROVIDERS ===
      "string" &&
    process.env.FINANCIAL_PROVIDERS.trim()
  ) {
    const providers =
      process.env.FINANCIAL_PROVIDERS
        .split(",")
        .map((provider) =>
          provider.trim().toLowerCase()
        )
        .filter(Boolean);

    if (providers.length > 0) {
      input.providers =
        [...new Set(providers)];
    }
  }

  /*
   * Optional observation period.
   *
   * These are passed only when explicitly configured.
   * We do not invent a billing period.
   */
  if (
    typeof process.env.FINANCIAL_PERIOD ===
      "string" &&
    process.env.FINANCIAL_PERIOD.trim()
  ) {
    input.period =
      process.env.FINANCIAL_PERIOD
        .trim()
        .slice(0, 100);
  }

  return input;
}

/**
 * ---------------------------------------------------------
 * RESULT SUMMARY
 * ---------------------------------------------------------
 *
 * Only log operational counts, not provider payloads.
 */
function buildSafeSummary(result) {
  return {
    success:
      result?.success === true,

    status:
      typeof result?.status === "string"
        ? result.status
        : "unknown",

    operation:
      typeof result?.operation === "string"
        ? result.operation
        : "financial_ingestion",

    received:
      Number(result?.totals?.received) || 0,

    valid:
      Number(result?.totals?.valid) || 0,

    rejected:
      Number(result?.totals?.rejected) || 0,

    saved:
      Number(result?.totals?.saved) || 0
  };
}

/**
 * ---------------------------------------------------------
 * SHUTDOWN
 * ---------------------------------------------------------
 */
async function shutdown(
  signal,
  exitCode = 0
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logInfo(
    `${signal} received. Financial worker shutting down.`
  );

  /*
   * This worker performs one-shot work and does not maintain
   * an HTTP server, repeating timer, or long-lived connection
   * of its own.
   *
   * MongoDB/Redis lifecycle management belongs to the
   * application's database modules and deployment runtime.
   */

  setTimeout(
    () => {
      process.exit(
        exitCode
      );
    },
    SHUTDOWN_TIMEOUT_MS
  ).unref();

  process.exit(
    exitCode
  );
}

/**
 * ---------------------------------------------------------
 * MAIN JOB
 * ---------------------------------------------------------
 */
async function runFinancialWorker() {
  const startedAt =
    new Date().toISOString();

  logInfo(
    "Financial worker started."
  );

  const input =
    buildWorkerInput();

  /*
   * IMPORTANT:
   *
   * The worker calls the existing ingestion worker only.
   * It does not bypass:
   *
   * financialDataService
   * financialSnapshotService
   *
   * This keeps provider validation and persistence in their
   * existing source-of-truth layers.
   */
  const result =
    await financialIngestionWorker(
      input
    );

  const summary =
    buildSafeSummary(result);

  const completedAt =
    new Date().toISOString();

  if (
    result?.success !== true
  ) {
    logError({
      code:
        result?.error?.code ||
        "FINANCIAL_WORKER_FAILED",

      message:
        result?.error?.message ||
        `Financial worker completed with status: ${summary.status}`
    });

    return {
      ...summary,
      startedAt,
      completedAt
    };
  }

  logSuccess(
    "Financial worker completed successfully."
  );

  logInfo(
    `Financial ingestion saved ${summary.saved} observation(s).`
  );

  return {
    ...summary,
    startedAt,
    completedAt
  };
}

/**
 * ---------------------------------------------------------
 * PROCESS ERROR HANDLERS
 * ---------------------------------------------------------
 *
 * These prevent unhandled failures from leaving a scheduled
 * job looking successful.
 */
process.on(
  "unhandledRejection",
  async (reason) => {
    logError(
      reason instanceof Error
        ? reason
        : new Error(
            "Unhandled promise rejection in financial worker."
          )
    );

    await shutdown(
      "unhandledRejection",
      1
    );
  }
);

process.on(
  "uncaughtException",
  async (error) => {
    logError(error);

    await shutdown(
      "uncaughtException",
      1
    );
  }
);

process.once(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM",
      0
    );
  }
);

process.once(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT",
      0
    );
  }
);

/**
 * ---------------------------------------------------------
 * CLI ENTRY
 * ---------------------------------------------------------
 *
 * When executed directly:
 *
 * node server/workers/financialWorker.js
 *
 * the job runs exactly once.
 */
if (
  require.main === module
) {
  runFinancialWorker()
    .then(
      (result) => {
        /*
         * A provider-unavailable state is not necessarily
         * an application crash. The worker exits successfully
         * only when the ingestion operation itself succeeded.
         */
        const exitCode =
          result.success === true
            ? 0
            : 1;

        process.exitCode =
          exitCode;
      }
    )
    .catch(
      async (error) => {
        logError(error);

        await shutdown(
          "worker_failure",
          1
        );
      }
    );
}

/**
 * ---------------------------------------------------------
 * EXPORTS
 * ---------------------------------------------------------
 */

module.exports = {
  run: runFinancialWorker,
  runFinancialWorker,
  buildWorkerInput,
  buildSafeSummary
};
