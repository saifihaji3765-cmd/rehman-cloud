"use strict";

/**
 * ZyrionOS Financial Ingestion Worker
 *
 * Purpose:
 *   Fetch real financial observations from the configured
 *   provider layer and persist verified observations into
 *   the financial snapshot store.
 *
 * Flow:
 *
 *   Provider Adapters
 *        ↓
 *   financialProviderService
 *        ↓
 *   financialDataService
 *        ↓
 *   validation / normalization
 *        ↓
 *   financialSnapshotService
 *        ↓
 *   MongoDB
 *
 * IMPORTANT:
 * - No fake/mock/demo values.
 * - No hardcoded provider costs.
 * - No payment execution.
 * - No infrastructure modification.
 * - No WhatsApp message sending.
 * - No provider credentials are persisted.
 * - Every observation must belong to a user.
 * - Provider-unavailable data is not converted to zero.
 * - This file does NOT automatically start a timer.
 *
 * A production scheduler / ECS scheduled task can call:
 *
 *   financialIngestionWorker.run(...)
 *
 * later.
 */

const financialDataService = require(
  "../services/financial/financialDataService"
);

const financialSnapshotService = require(
  "../services/financial/financialSnapshotService"
);

const MAX_OBSERVATIONS = 500;
const MAX_ERROR_LENGTH = 1000;

const VALID_VALUE_TYPES = new Set([
  "cost",
  "usage"
]);

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeString(
  value,
  maxLength = 500
) {
  if (
    typeof value !== "string"
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

function normalizeUserId(value) {
  const normalized =
    normalizeString(value, 200);

  if (!normalized) {
    return null;
  }

  return normalized;
}

function normalizeProvider(value) {
  const normalized =
    normalizeString(value, 100);

  if (!normalized) {
    return null;
  }

  return normalized.toLowerCase();
}

function normalizeValueType(value) {
  const normalized =
    normalizeString(value, 50);

  if (!normalized) {
    return null;
  }

  const valueType =
    normalized.toLowerCase();

  return VALID_VALUE_TYPES.has(
    valueType
  )
    ? valueType
    : null;
}

function normalizeNumber(value) {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(
    0,
    MAX_OBSERVATIONS
  );
}

function safeError(error) {
  return {
    code:
      normalizeString(
        error?.code,
        200
      ) ||
      "FINANCIAL_INGESTION_ERROR",

    message:
      normalizeString(
        error?.message,
        MAX_ERROR_LENGTH
      ) ||
      "Financial ingestion failed."
  };
}

/**
 * ---------------------------------------------------------
 * ENVIRONMENT USER RESOLUTION
 * ---------------------------------------------------------
 *
 * Background workers must never silently ingest data for
 * an unknown user.
 *
 * Preferred:
 *   FINANCIAL_OWNER_USER_ID
 *
 * Fallback:
 *   OWNER_USER_ID
 *   ZYRIONOS_OWNER_USER_ID
 */
function getConfiguredUserId() {
  const candidates = [
    process.env.FINANCIAL_OWNER_USER_ID,
    process.env.OWNER_USER_ID,
    process.env.ZYRIONOS_OWNER_USER_ID
  ];

  for (const candidate of candidates) {
    const userId =
      normalizeUserId(candidate);

    if (userId) {
      return userId;
    }
  }

  return null;
}

/**
 * Resolve user ID.
 *
 * Explicit input wins, but the worker requires an actual
 * user identity and never creates one.
 */
function resolveUserId(input = {}) {
  if (isObject(input)) {
    const explicit =
      normalizeUserId(
        input.userId
      );

    if (explicit) {
      return explicit;
    }
  }

  return getConfiguredUserId();
}

/**
 * ---------------------------------------------------------
 * PROVIDER LIST
 * ---------------------------------------------------------
 *
 * We intentionally do not invent a provider list.
 *
 * If input.providers is supplied, use it.
 * Otherwise financialDataService can use its configured
 * provider layer.
 */
function normalizeProviders(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const providers = [];

  for (const provider of value) {
    const normalized =
      normalizeProvider(provider);

    if (
      normalized &&
      !providers.includes(normalized)
    ) {
      providers.push(normalized);
    }
  }

  return providers.length > 0
    ? providers
    : undefined;
}

/**
 * ---------------------------------------------------------
 * PROVIDER RESULT EXTRACTION
 * ---------------------------------------------------------
 */

function extractData(result) {
  if (!isObject(result)) {
    return {};
  }

  if (
    isObject(result.data)
  ) {
    return result.data;
  }

  return result;
}

function extractObservations(
  result,
  valueType
) {
  const data =
    extractData(result);

  const candidates = [];

  if (
    Array.isArray(
      data.observations
    )
  ) {
    candidates.push(
      ...data.observations
    );
  }

  if (
    valueType === "cost" &&
    Array.isArray(data.costs)
  ) {
    candidates.push(
      ...data.costs
    );
  }

  if (
    valueType === "usage" &&
    Array.isArray(data.usage)
  ) {
    candidates.push(
      ...data.usage
    );
  }

  return candidates
    .slice(0, MAX_OBSERVATIONS);
}

/**
 * ---------------------------------------------------------
 * OBSERVATION VALIDATION
 * ---------------------------------------------------------
 *
 * The snapshot service is still the final persistence
 * authority.
 *
 * This worker performs an additional boundary check so that
 * obviously invalid provider output is not passed onward.
 */
function validateObservation(
  observation,
  expectedValueType
) {
  if (
    !isObject(observation)
  ) {
    return {
      valid: false,
      reason: "observation_not_object"
    };
  }

  const valueType =
    normalizeValueType(
      observation.valueType ||
        expectedValueType
    );

  if (
    valueType !== expectedValueType
  ) {
    return {
      valid: false,
      reason: "invalid_value_type"
    };
  }

  const provider =
    normalizeProvider(
      observation.provider
    );

  if (!provider) {
    return {
      valid: false,
      reason: "missing_provider"
    };
  }

  const source =
    normalizeString(
      observation.source,
      500
    );

  if (!source) {
    return {
      valid: false,
      reason: "missing_source"
    };
  }

  const value =
    normalizeNumber(
      observation.value
    );

  if (
    value === null ||
    value < 0
  ) {
    return {
      valid: false,
      reason: "invalid_value"
    };
  }

  const observedAt =
    normalizeDate(
      observation.observedAt ||
        observation.timestamp ||
        observation.retrievedAt
    );

  if (!observedAt) {
    return {
      valid: false,
      reason: "missing_observed_at"
    };
  }

  if (
    valueType === "cost"
  ) {
    const currency =
      normalizeString(
        observation.currency,
        20
      );

    if (!currency) {
      return {
        valid: false,
        reason: "missing_currency"
      };
    }
  }

  if (
    valueType === "usage"
  ) {
    const unit =
      normalizeString(
        observation.unit,
        100
      );

    if (!unit) {
      return {
        valid: false,
        reason: "missing_unit"
      };
    }
  }

  return {
    valid: true
  };
}

/**
 * ---------------------------------------------------------
 * SANITIZE OBSERVATION FOR STORAGE
 * ---------------------------------------------------------
 *
 * We deliberately select allowed financial fields rather
 * than copying arbitrary provider objects into MongoDB.
 */
function prepareObservation(
  observation,
  userId,
  expectedValueType
) {
  const validation =
    validateObservation(
      observation,
      expectedValueType
    );

  if (!validation.valid) {
    return {
      observation: null,
      reason: validation.reason
    };
  }

  const valueType =
    normalizeValueType(
      observation.valueType ||
        expectedValueType
    );

  const provider =
    normalizeProvider(
      observation.provider
    );

  const source =
    normalizeString(
      observation.source,
      500
    );

  const value =
    normalizeNumber(
      observation.value
    );

  const prepared = {
    userId,
    provider,
    valueType,
    value,
    source,

    observedAt:
      normalizeDate(
        observation.observedAt ||
          observation.timestamp ||
          observation.retrievedAt
      ),

    retrievedAt:
      normalizeDate(
        observation.retrievedAt
      ) || new Date().toISOString(),

    status:
      normalizeString(
        observation.status,
        50
      ) || "available",

    confidence:
      normalizeString(
        observation.confidence,
        50
      ) || null,

    period:
      normalizeString(
        observation.period,
        100
      ) || null,

    accountId:
      normalizeString(
        observation.accountId,
        200
      ) || null,

    projectId:
      normalizeString(
        observation.projectId,
        200
      ) || null,

    model:
      normalizeString(
        observation.model,
        200
      ) || null,

    service:
      normalizeString(
        observation.service,
        300
      ) || null,

    resource:
      normalizeString(
        observation.resource,
        300
      ) || null,

    region:
      normalizeString(
        observation.region,
        200
      ) || null,

    currency:
      valueType === "cost"
        ? normalizeString(
            observation.currency,
            20
          )
        : null,

    unit:
      valueType === "usage"
        ? normalizeString(
            observation.unit,
            100
          )
        : null,

    observationId:
      normalizeString(
        observation.observationId,
        300
      ) || null,

    fingerprint:
      normalizeString(
        observation.fingerprint,
        300
      ) || null
  };

  return {
    observation: prepared,
    reason: null
  };
}

/**
 * ---------------------------------------------------------
 * INGEST ONE VALUE TYPE
 * ---------------------------------------------------------
 */
async function ingestValueType({
  userId,
  valueType,
  input
}) {
  const result = {
    valueType,
    status: "unavailable",
    providerStatus: null,
    received: 0,
    valid: 0,
    rejected: 0,
    saved: 0,
    observations: [],
    errors: []
  };

  let providerResult;

  try {
    if (
      valueType === "cost"
    ) {
      providerResult =
        await financialDataService.getCosts({
          userId,

          providers:
            normalizeProviders(
              input.providers
            ),

          providerData:
            input.providerData,

          start:
            normalizeDate(
              input.start
            ),

          end:
            normalizeDate(
              input.end
            ),

          period:
            normalizeString(
              input.period,
              100
            ),

          accountId:
            normalizeString(
              input.accountId,
              200
            ),

          projectId:
            normalizeString(
              input.projectId,
              200
            )
        });
    } else {
      providerResult =
        await financialDataService.getUsage({
          userId,

          providers:
            normalizeProviders(
              input.providers
            ),

          providerData:
            input.providerData,

          start:
            normalizeDate(
              input.start
            ),

          end:
            normalizeDate(
              input.end
            ),

          period:
            normalizeString(
              input.period,
              100
            ),

          accountId:
            normalizeString(
              input.accountId,
              200
            ),

          projectId:
            normalizeString(
              input.projectId,
              200
            ),

          model:
            normalizeString(
              input.model,
              200
            )
        });
    }
  } catch (error) {
    result.status = "error";

    result.errors.push(
      safeError(error)
    );

    return result;
  }

  result.providerStatus =
    isObject(providerResult)
      ? providerResult.status ||
        (
          providerResult.success === true
            ? "available"
            : providerResult.success === false
              ? "error"
              : "unavailable"
        )
      : "unavailable";

  const rawObservations =
    extractObservations(
      providerResult,
      valueType
    );

  result.received =
    rawObservations.length;

  if (
    rawObservations.length === 0
  ) {
    result.status =
      providerResult?.success === false
        ? "error"
        : "unavailable";

    return result;
  }

  const prepared = [];

  for (
    const rawObservation
    of rawObservations
  ) {
    const preparedResult =
      prepareObservation(
        rawObservation,
        userId,
        valueType
      );

    if (
      !preparedResult.observation
    ) {
      result.rejected += 1;
      continue;
    }

    result.valid += 1;

    prepared.push(
      preparedResult.observation
    );
  }

  result.observations =
    prepared.slice(
      0,
      MAX_OBSERVATIONS
    );

  if (
    result.observations.length === 0
  ) {
    result.status = "insufficient";
    return result;
  }

  try {
    const saveResult =
      await financialSnapshotService.saveObservations(
        result.observations
      );

    if (
      isObject(saveResult)
    ) {
      if (
        Number.isFinite(
          Number(saveResult.saved)
        )
      ) {
        result.saved =
          Number(saveResult.saved);
      } else if (
        Number.isFinite(
          Number(saveResult.insertedCount)
        )
      ) {
        result.saved =
          Number(
            saveResult.insertedCount
          );
      } else if (
        saveResult.success === true
      ) {
        /*
         * Do not pretend to know the exact database count
         * if the snapshot service does not provide one.
         */
        result.saved =
          result.observations.length;
      }
    }

    /*
     * If the snapshot service returns no explicit count,
     * successful persistence is represented by the number
     * of submitted valid observations only when the service
     * explicitly reports success.
     */
    if (
      result.saved === 0 &&
      saveResult?.success === true
    ) {
      result.saved =
        result.observations.length;
    }

    result.status =
      saveResult?.success === false
        ? "error"
        : "saved";
  } catch (error) {
    result.status = "error";

    result.errors.push(
      safeError(error)
    );
  }

  return result;
}

/**
 * ---------------------------------------------------------
 * MAIN INGESTION RUN
 * ---------------------------------------------------------
 */
async function runFinancialIngestion(
  input = {}
) {
  const startedAt =
    new Date().toISOString();

  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      operation:
        "financial_ingestion",
      startedAt,
      completedAt:
        new Date().toISOString(),
      error: {
        code: "INVALID_INPUT",
        message:
          "Financial ingestion input must be an object."
      }
    };
  }

  const userId =
    resolveUserId(input);

  /*
   * Never ingest financial observations without an explicit
   * user scope.
   */
  if (!userId) {
    return {
      success: false,
      status: "invalid",
      operation:
        "financial_ingestion",
      startedAt,
      completedAt:
        new Date().toISOString(),
      error: {
        code:
          "FINANCIAL_USER_ID_REQUIRED",
        message:
          "A userId or configured financial owner user ID is required."
      }
    };
  }

  const result = {
    success: true,
    status: "completed",

    operation:
      "financial_ingestion",

    startedAt,
    completedAt: null,

    userId,

    costs: null,
    usage: null,

    totals: {
      received: 0,
      valid: 0,
      rejected: 0,
      saved: 0
    },

    errors: []
  };

  /*
   * -------------------------------------------------------
   * COST INGESTION
   * -------------------------------------------------------
   */
  result.costs =
    await ingestValueType({
      userId,
      valueType: "cost",
      input
    });

  /*
   * -------------------------------------------------------
   * USAGE INGESTION
   * -------------------------------------------------------
   */
  result.usage =
    await ingestValueType({
      userId,
      valueType: "usage",
      input
    });

  /*
   * -------------------------------------------------------
   * TOTALS
   * -------------------------------------------------------
   */
  const sections = [
    result.costs,
    result.usage
  ];

  for (const section of sections) {
    if (!section) {
      continue;
    }

    result.totals.received +=
      Number(section.received) || 0;

    result.totals.valid +=
      Number(section.valid) || 0;

    result.totals.rejected +=
      Number(section.rejected) || 0;

    result.totals.saved +=
      Number(section.saved) || 0;

    if (
      Array.isArray(section.errors)
    ) {
      result.errors.push(
        ...section.errors.map(
          (error) => ({
            stage:
              section.valueType ||
              "financial_ingestion",
            ...error
          })
        )
      );
    }
  }

  /*
   * -------------------------------------------------------
   * FINAL STATUS
   * -------------------------------------------------------
   */
  if (
    result.totals.saved > 0
  ) {
    result.status =
      result.errors.length > 0
        ? "completed_with_errors"
        : "completed";
  } else if (
    result.totals.valid > 0 &&
    result.errors.length > 0
  ) {
    result.status =
      "completed_with_errors";
  } else if (
    result.totals.received === 0
  ) {
    result.status =
      "no_provider_data";
  } else {
    result.status =
      "no_observations_saved";
  }

  result.completedAt =
    new Date().toISOString();

  return result;
}

/**
 * ---------------------------------------------------------
 * SAFE MANUAL RUN INTERFACE
 * ---------------------------------------------------------
 */
async function run(input = {}) {
  return runFinancialIngestion(
    input
  );
}

/**
 * ---------------------------------------------------------
 * WORKER STATUS
 * ---------------------------------------------------------
 *
 * This describes worker capability only.
 * It does not claim provider availability.
 */
function getStatus() {
  return {
    success: true,
    status: "available",
    worker:
      "financialIngestionWorker",
    operation:
      "financial_ingestion",

    automaticScheduling:
      false,

    realProviderDataOnly:
      true,

    userScoped:
      true,

    snapshotPersistence:
      true,

    paymentExecution:
      false,

    infrastructureExecution:
      false,

    whatsappSending:
      false
  };
}

/**
 * ---------------------------------------------------------
 * EXPORTS
 * ---------------------------------------------------------
 */

runFinancialIngestion.run =
  runFinancialIngestion;

runFinancialIngestion.runFinancialIngestion =
  runFinancialIngestion;

runFinancialIngestion.getStatus =
  getStatus;

module.exports =
  runFinancialIngestion;
