"use strict";

/**
 * ZyrionOS Financial Snapshot Service
 *
 * Purpose:
 * - Persist verified financial observations.
 * - Read historical observations for forecasting.
 * - Prevent duplicate snapshots.
 * - Keep provider/source/timestamp/period/currency information.
 * - Never fabricate missing financial data.
 *
 * Source of truth:
 * - Provider-confirmed observations only.
 *
 * This service does NOT:
 * - execute payments
 * - call AWS/OpenAI directly
 * - store API keys
 * - store card/OTP/CVV/password data
 */

const CostEvent =
  require("../../models/costEventModel");

const VALUE_TYPE = Object.freeze({
  COST: "cost",
  USAGE: "usage",
});

const VALID_STATUSES = new Set([
  "verified",
  "available",
]);

const MAX_BULK_EVENTS = 500;

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
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

function normalizeProvider(
  provider
) {
  const value =
    normalizeString(
      provider,
      100
    );

  return value
    ? value.toLowerCase()
    : null;
}

function normalizeDate(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function normalizeNumber(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function normalizeCurrency(
  currency
) {
  const value =
    normalizeString(
      currency,
      10
    );

  return value
    ? value.toUpperCase()
    : null;
}

function normalizeStatus(
  status
) {
  const value =
    normalizeString(
      status,
      50
    )?.toLowerCase();

  return value || null;
}

function normalizeValueType(
  valueType
) {
  const value =
    normalizeString(
      valueType,
      50
    )?.toLowerCase();

  if (
    value ===
      VALUE_TYPE.COST ||
    value ===
      VALUE_TYPE.USAGE
  ) {
    return value;
  }

  return null;
}

function sanitizeProviderData(
  data
) {
  if (!isObject(data)) {
    return null;
  }

  const blocked =
    /(^|_)(api.?key|access.?token|token|secret|private.?key|password|passwd|otp|pin|cvv|cvc|authorization)$/i;

  const result = {};

  for (
    const [
      key,
      value,
    ] of Object.entries(data)
  ) {
    if (
      blocked.test(
        String(key)
      )
    ) {
      continue;
    }

    if (
      typeof value ===
        "string" ||
      typeof value ===
        "number" ||
      typeof value ===
        "boolean" ||
      value === null
    ) {
      result[key] =
        typeof value ===
        "string"
          ? value.slice(
              0,
              1000
            )
          : value;
    }
  }

  return result;
}

function normalizeObservation(
  input = {}
) {
  if (!isObject(input)) {
    return {
      valid: false,
      reason:
        "Observation must be an object.",
      data: null,
    };
  }

  const provider =
    normalizeProvider(
      input.provider
    );

  const valueType =
    normalizeValueType(
      input.valueType
    );

  const value =
    normalizeNumber(
      input.value ??
        input.amount ??
        input.cost ??
        input.usage ??
        input.total
    );

  const timestamp =
    normalizeDate(
      input.timestamp ??
        input.periodEnd ??
        input.date ??
        input.retrievedAt
    );

  const retrievedAt =
    normalizeDate(
      input.retrievedAt
    ) || timestamp;

  const status =
    normalizeStatus(
      input.status
    );

  const source =
    normalizeString(
      input.source,
      500
    );

  if (!provider) {
    return {
      valid: false,
      reason:
        "Provider is required.",
      data: null,
    };
  }

  if (!valueType) {
    return {
      valid: false,
      reason:
        "valueType must be cost or usage.",
      data: null,
    };
  }

  if (
    value === null ||
    value < 0
  ) {
    return {
      valid: false,
      reason:
        "A valid non-negative numeric value is required.",
      data: null,
    };
  }

  if (!timestamp) {
    return {
      valid: false,
      reason:
        "Observation timestamp is required.",
      data: null,
    };
  }

  if (!source) {
    return {
      valid: false,
      reason:
        "Observation source is required.",
      data: null,
    };
  }

  if (
    !VALID_STATUSES.has(
      status
    )
  ) {
    return {
      valid: false,
      reason:
        "Only verified or available provider observations can be stored.",
      data: null,
    };
  }

  const data = {
    provider,
    valueType,
    value,
    timestamp,
    retrievedAt,
    status,
    source,

    period:
      normalizeString(
        input.period,
        200
      ),

    accountId:
      normalizeString(
        input.accountId,
        300
      ),

    projectId:
      normalizeString(
        input.projectId,
        300
      ),

    currency:
      valueType ===
      VALUE_TYPE.COST
        ? normalizeCurrency(
            input.currency
          )
        : undefined,

    unit:
      valueType ===
      VALUE_TYPE.USAGE
        ? normalizeString(
            input.unit,
            100
          )
        : undefined,

    model:
      valueType ===
      VALUE_TYPE.USAGE
        ? normalizeString(
            input.model,
            200
          )
        : undefined,

    providerData:
      sanitizeProviderData(
        input.providerData
      ),
  };

  /*
   * Cost records require a currency.
   * Usage records require a unit.
   *
   * Without these, cross-period/provider aggregation can become unsafe.
   */
  if (
    valueType ===
      VALUE_TYPE.COST &&
    !data.currency
  ) {
    return {
      valid: false,
      reason:
        "Cost observation requires a verified currency.",
      data: null,
    };
  }

  if (
    valueType ===
      VALUE_TYPE.USAGE &&
    !data.unit
  ) {
    return {
      valid: false,
      reason:
        "Usage observation requires a verified unit.",
      data: null,
    };
  }

  return {
    valid: true,
    reason: null,
    data,
  };
}

function buildDeduplicationFilter(
  observation
) {
  return {
    provider:
      observation.provider,

    valueType:
      observation.valueType,

    timestamp:
      observation.timestamp,

    source:
      observation.source,

    value:
      observation.value,

    ...(observation.currency
      ? {
          currency:
            observation.currency,
        }
      : {}),

    ...(observation.unit
      ? {
          unit:
            observation.unit,
        }
      : {}),

    ...(observation.model
      ? {
          model:
            observation.model,
        }
      : {}),

    ...(observation.accountId
      ? {
          accountId:
            observation.accountId,
        }
      : {}),

    ...(observation.projectId
      ? {
          projectId:
            observation.projectId,
        }
      : {}),
  };
}

async function saveObservation(
  input = {}
) {
  try {
    const normalized =
      normalizeObservation(
        input
      );

    if (
      !normalized.valid
    ) {
      return {
        success: false,
        status:
          "invalid",
        message:
          normalized.reason,
        data: null,
      };
    }

    const observation =
      normalized.data;

    const filter =
      buildDeduplicationFilter(
        observation
      );

    /*
     * Upsert makes repeated provider polling idempotent.
     */
    const result =
      await CostEvent.findOneAndUpdate(
        filter,
        {
          $setOnInsert:
            observation,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert:
            true,
        }
      ).lean();

    return {
      success: true,
      status:
        "verified",
      message:
        "Financial observation persisted.",
      data: {
        observation:
          result,
        insertedOrExisting:
          true,
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] saveObservation:",
      error.message
    );

    return {
      success: false,
      status:
        "error",
      message:
        "Failed to persist financial observation.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

async function saveObservations(
  observations = []
) {
  try {
    if (
      !Array.isArray(
        observations
      )
    ) {
      return {
        success: false,
        status:
          "invalid",
        message:
          "Observations must be an array.",
        data: null,
      };
    }

    if (
      observations.length ===
      0
    ) {
      return {
        success: true,
        status:
          "empty",
        message:
          "No observations supplied.",
        data: {
          insertedCount: 0,
          rejectedCount: 0,
          observations: [],
        },
      };
    }

    if (
      observations.length >
      MAX_BULK_EVENTS
    ) {
      return {
        success: false,
        status:
          "invalid",
        message:
          `A maximum of ${MAX_BULK_EVENTS} observations can be stored per request.`,
        data: null,
      };
    }

    const normalized =
      observations.map(
        normalizeObservation
      );

    const valid =
      normalized.filter(
        (item) =>
          item.valid
      );

    const rejected =
      normalized.filter(
        (item) =>
          !item.valid
      );

    if (!valid.length) {
      return {
        success: false,
        status:
          "invalid",
        message:
          "No valid verified observations were supplied.",
        data: {
          insertedCount: 0,
          rejectedCount:
            rejected.length,
          rejectedReasons:
            rejected.map(
              (item) =>
                item.reason
            ),
        },
      };
    }

    const operations =
      valid.map(
        (item) => ({
          updateOne: {
            filter:
              buildDeduplicationFilter(
                item.data
              ),

            update: {
              $setOnInsert:
                item.data,
            },

            upsert: true,
          },
        })
      );

    const result =
      await CostEvent.bulkWrite(
        operations,
        {
          ordered: false,
        }
      );

    return {
      success: true,
      status:
        "verified",
      message:
        "Financial observations processed.",
      data: {
        requestedCount:
          observations.length,

        validCount:
          valid.length,

        rejectedCount:
          rejected.length,

        insertedCount:
          result.upsertedCount || 0,

        matchedExistingCount:
          result.matchedCount || 0,

        rejectedReasons:
          rejected.map(
            (item) =>
              item.reason
          ),
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] saveObservations:",
      error.message
    );

    return {
      success: false,
      status:
        "error",
      message:
        "Failed to persist financial observations.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

function buildQuery(
  input = {}
) {
  const query = {};

  const provider =
    normalizeProvider(
      input.provider
    );

  if (provider) {
    query.provider =
      provider;
  }

  const valueType =
    normalizeValueType(
      input.valueType
    );

  if (valueType) {
    query.valueType =
      valueType;
  }

  const accountId =
    normalizeString(
      input.accountId,
      300
    );

  if (accountId) {
    query.accountId =
      accountId;
  }

  const projectId =
    normalizeString(
      input.projectId,
      300
    );

  if (projectId) {
    query.projectId =
      projectId;
  }

  const model =
    normalizeString(
      input.model,
      200
    );

  if (model) {
    query.model =
      model;
  }

  const status =
    normalizeStatus(
      input.status
    );

  if (status) {
    query.status =
      status;
  }

  const startDate =
    normalizeDate(
      input.startDate
    );

  const endDate =
    normalizeDate(
      input.endDate
    );

  if (
    startDate ||
    endDate
  ) {
    query.timestamp = {};

    if (startDate) {
      query.timestamp.$gte =
        startDate;
    }

    if (endDate) {
      query.timestamp.$lte =
        endDate;
    }
  }

  if (
    input.currency
  ) {
    const currency =
      normalizeCurrency(
        input.currency
      );

    if (currency) {
      query.currency =
        currency;
    }
  }

  if (
    input.unit
  ) {
    const unit =
      normalizeString(
        input.unit,
        100
      );

    if (unit) {
      query.unit =
        unit;
    }
  }

  return query;
}

function normalizeLimit(
  value,
  fallback = 100
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(parsed),
    1000
  );
}

async function getObservations(
  input = {}
) {
  try {
    const query =
      buildQuery(
        input
      );

    const limit =
      normalizeLimit(
        input.limit
      );

    const sort =
      input.sort ===
      "asc"
        ? {
            timestamp: 1,
          }
        : {
            timestamp: -1,
          };

    const observations =
      await CostEvent.find(
        query
      )
        .sort(sort)
        .limit(limit)
        .lean();

    return {
      success: true,
      status:
        observations.length
          ? "verified"
          : "unavailable",
      message:
        observations.length
          ? "Financial observations retrieved."
          : "No matching financial observations found.",
      data: {
        observations,
        count:
          observations.length,
        query,
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] getObservations:",
      error.message
    );

    return {
      success: false,
      status:
        "error",
      message:
        "Failed to retrieve financial observations.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

async function getHistoricalSeries(
  input = {}
) {
  try {
    const query =
      buildQuery(
        input
      );

    const observations =
      await CostEvent.find(
        query
      )
        .sort({
          timestamp: 1,
        })
        .limit(
          normalizeLimit(
            input.limit,
            500
          )
        )
        .lean();

    return {
      success: true,
      status:
        observations.length
          ? "verified"
          : "unavailable",
      message:
        observations.length
          ? "Historical financial series retrieved."
          : "No historical financial observations are available.",
      data: {
        observations,
        count:
          observations.length,
        query,
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] getHistoricalSeries:",
      error.message
    );

    return {
      success: false,
      status:
        "error",
      message:
        "Failed to retrieve historical financial series.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

async function getLatestObservation(
  input = {}
) {
  try {
    const query =
      buildQuery(
        input
      );

    const observation =
      await CostEvent.findOne(
        query
      )
        .sort({
          timestamp: -1,
        })
        .lean();

    if (!observation) {
      return {
        success: true,
        status:
          "unavailable",
        message:
          "No verified financial observation is available.",
        data: {
          observation: null,
        },
      };
    }

    return {
      success: true,
      status:
        "verified",
      message:
        "Latest financial observation retrieved.",
      data: {
        observation,
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] getLatestObservation:",
      error.message
    );

    return {
      success: false,
      status:
        "error",
      message:
        "Failed to retrieve latest financial observation.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

async function getProviderSummary(
  input = {}
) {
  try {
    const query =
      buildQuery(
        input
      );

    const match =
      await CostEvent.aggregate([
        {
          $match:
            query,
        },

        {
          $group: {
            _id: {
              provider:
                "$provider",

              valueType:
                "$valueType",

              currency:
                "$currency",

              unit:
                "$unit",
            },

            total: {
              $sum:
                "$value",
            },

            count: {
              $sum: 1,
            },

            latestTimestamp: {
              $max:
                "$timestamp",
            },

            firstTimestamp: {
              $min:
                "$timestamp",
            },
          },
        },

        {
          $sort: {
            latestTimestamp:
              -1,
          },
        },
      ]);

    return {
      success: true,
      status:
        match.length
          ? "verified"
          : "unavailable",
      message:
        match.length
          ? "Provider financial summary retrieved."
          : "No verified financial summary is available.",
      data: {
        providers:
          match,
        count:
          match.length,
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] getProviderSummary:",
      error.message
    );

    return {
      success: false,
      status:
        "error",
      message:
        "Failed to build provider financial summary.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

async function deleteOldSnapshots(
  beforeDate
) {
  try {
    const date =
      normalizeDate(
        beforeDate
      );

    if (!date) {
      return {
        success: false,
        status:
          "invalid",
        message:
          "A valid beforeDate is required.",
        data: null,
      };
    }

    /*
     * This operation is intentionally explicit.
     * Nothing is automatically deleted by the service.
     */
    const result =
      await CostEvent.deleteMany({
        timestamp: {
          $lt: date,
        },
      });

    return {
      success: true,
      status:
        "deleted",
      message:
        "Old financial snapshots deleted.",
      data: {
        deletedCount:
          result.deletedCount || 0,
        beforeDate:
          date.toISOString(),
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] deleteOldSnapshots:",
      error.message
    );

    return {
      success: false,
      status:
        "error",
      message:
        "Failed to delete old financial snapshots.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

module.exports = {
  VALUE_TYPE,
  DATA_STATUS: {
    VERIFIED:
      "verified",
    AVAILABLE:
      "available",
    UNAVAILABLE:
      "unavailable",
    ERROR:
      "error",
  },

  normalizeObservation,

  saveObservation,
  saveObservations,

  getObservations,
  getHistoricalSeries,
  getLatestObservation,
  getProviderSummary,

  buildQuery,

  deleteOldSnapshots,
};
