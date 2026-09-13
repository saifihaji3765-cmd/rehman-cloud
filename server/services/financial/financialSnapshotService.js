"use strict";

/**
 * ZyrionOS Financial Snapshot Service
 *
 * Purpose:
 * - Persist verified financial observations.
 * - Keep every observation strictly user-scoped.
 * - Read historical observations for forecasting.
 * - Prevent duplicate snapshots.
 * - Preserve provider/source/timestamp/period/currency/unit.
 * - Keep account/project/model/service/resource context.
 * - Never fabricate missing financial data.
 *
 * Source of truth:
 * - Provider-confirmed observations only.
 *
 * Architecture:
 *
 * Provider Adapters
 *       ↓
 * financialProviderService
 *       ↓
 * financialDataService
 *       ↓
 * financialSnapshotService
 *       ↓
 * CostEvent MongoDB
 *
 * SECURITY:
 * - userId is mandatory.
 * - Queries cannot intentionally operate globally.
 * - Provider credentials are never stored.
 * - Card/OTP/CVV/password/token data is removed.
 * - Payment execution is NOT performed here.
 */

const CostEvent =
  require("../../models/costEventModel");

const VALUE_TYPE = Object.freeze({
  COST: "cost",
  USAGE: "usage",
});

const DATA_STATUS = Object.freeze({
  VERIFIED: "verified",
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  NOT_CONFIGURED: "not_configured",
  ERROR: "error",
});

const VALID_STORAGE_STATUSES =
  new Set([
    DATA_STATUS.VERIFIED,
    DATA_STATUS.AVAILABLE,
  ]);

const MAX_BULK_EVENTS = 500;
const MAX_QUERY_LIMIT = 1000;
const MAX_HISTORY_LIMIT = 5000;

/* -------------------------------------------------------------------------- */
/* Basic helpers                                                              */
/* -------------------------------------------------------------------------- */

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

function normalizeUserId(
  userId
) {
  /*
   * Mongo ObjectId is normally represented as
   * a string by the controller/service layer.
   *
   * We intentionally do not cast or invent IDs here.
   */
  return normalizeString(
    userId,
    200
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

  if (
    value instanceof Date
  ) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : new Date(
          value.getTime()
        );
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
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

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
    );

  return value
    ? value.toLowerCase()
    : null;
}

function normalizeValueType(
  valueType
) {
  const value =
    normalizeString(
      valueType,
      50
    );

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

/* -------------------------------------------------------------------------- */
/* Sensitive-data protection                                                  */
/* -------------------------------------------------------------------------- */

const BLOCKED_KEY_PATTERN =
  /(^|[_\-.])(api.?key|access.?token|refresh.?token|token|secret|private.?key|password|passwd|credential|credentials|otp|pin|cvv|cvc|authorization|bearer|card.?number|security.?code)([_\-.]|$)/i;

function isSensitiveKey(
  key
) {
  return BLOCKED_KEY_PATTERN.test(
    String(key)
  );
}

function sanitizeProviderData(
  data,
  depth = 0
) {
  if (!isObject(data)) {
    return null;
  }

  if (depth > 3) {
    return null;
  }

  const result = {};

  for (
    const [
      key,
      value,
    ] of Object.entries(data)
  ) {
    if (
      isSensitiveKey(key)
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

      continue;
    }

    if (
      Array.isArray(value)
    ) {
      result[key] =
        value
          .slice(0, 50)
          .map(
            (item) => {
              if (
                typeof item ===
                  "string" ||
                typeof item ===
                  "number" ||
                typeof item ===
                  "boolean" ||
                item === null
              ) {
                return item;
              }

              if (
                isObject(item)
              ) {
                return sanitizeProviderData(
                  item,
                  depth + 1
                );
              }

              return null;
            }
          )
          .filter(
            (item) =>
              item !== null
          );

      continue;
    }

    if (
      isObject(value)
    ) {
      const nested =
        sanitizeProviderData(
          value,
          depth + 1
        );

      if (nested) {
        result[key] =
          nested;
      }
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Observation normalization                                                  */
/* -------------------------------------------------------------------------- */

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

  const userId =
    normalizeUserId(
      input.userId
    );

  if (!userId) {
    return {
      valid: false,
      reason:
        "userId is required.",
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
        input.observedAt ??
        input.periodEnd ??
        input.date ??
        input.retrievedAt
    );

  const retrievedAt =
    normalizeDate(
      input.retrievedAt
    ) || timestamp;

  const observedAt =
    normalizeDate(
      input.observedAt
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
    !VALID_STORAGE_STATUSES.has(
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

  const currency =
    valueType ===
    VALUE_TYPE.COST
      ? normalizeCurrency(
          input.currency
        )
      : undefined;

  const unit =
    valueType ===
    VALUE_TYPE.USAGE
      ? normalizeString(
          input.unit,
          100
        )
      : undefined;

  if (
    valueType ===
      VALUE_TYPE.COST &&
    !currency
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
    !unit
  ) {
    return {
      valid: false,
      reason:
        "Usage observation requires a verified unit.",
      data: null,
    };
  }

  const data = {
    userId,

    provider,
    valueType,
    value,

    timestamp,
    observedAt,
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

    service:
      normalizeString(
        input.service,
        300
      ),

    resource:
      normalizeString(
        input.resource,
        500
      ),

    region:
      normalizeString(
        input.region,
        200
      ),

    model:
      valueType ===
      VALUE_TYPE.USAGE
        ? normalizeString(
            input.model,
            200
          )
        : undefined,

    currency,
    unit,

    confidence:
      normalizeString(
        input.confidence,
        50
      ),

    observationId:
      normalizeString(
        input.observationId,
        300
      ),

    fingerprint:
      normalizeString(
        input.fingerprint,
        500
      ),

    providerData:
      sanitizeProviderData(
        input.providerData
      ),

    metadata:
      sanitizeProviderData(
        input.metadata
      ),
  };

  return {
    valid: true,
    reason: null,
    data,
  };
}

/* -------------------------------------------------------------------------- */
/* Deduplication                                                              */
/* -------------------------------------------------------------------------- */

function buildDeduplicationFilter(
  observation
) {
  if (!observation.userId) {
    throw new Error(
      "userId is required for financial observation deduplication."
    );
  }

  /*
   * IMPORTANT:
   * userId is ALWAYS part of the filter.
   */
  if (
    observation.observationId
  ) {
    return {
      userId:
        observation.userId,

      provider:
        observation.provider,

      observationId:
        observation.observationId,
    };
  }

  return {
    userId:
      observation.userId,

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

    ...(observation.service
      ? {
          service:
            observation.service,
        }
      : {}),

    ...(observation.resource
      ? {
          resource:
            observation.resource,
        }
      : {}),

    ...(observation.region
      ? {
          region:
            observation.region,
        }
      : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Save one observation                                                       */
/* -------------------------------------------------------------------------- */

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
        status: "invalid",
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

    if (!result) {
      return {
        success: false,
        status: DATA_STATUS.ERROR,
        message:
          "Financial observation could not be persisted.",
        data: null,
      };
    }

    return {
      success: true,
      status:
        DATA_STATUS.VERIFIED,
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
        DATA_STATUS.ERROR,
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

/* -------------------------------------------------------------------------- */
/* Save multiple observations                                                 */
/* -------------------------------------------------------------------------- */

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
        status: "invalid",
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
        status: "empty",
        message:
          "No observations supplied.",
        data: {
          requestedCount: 0,
          validCount: 0,
          rejectedCount: 0,
          insertedCount: 0,
          matchedExistingCount: 0,
        },
      };
    }

    if (
      observations.length >
      MAX_BULK_EVENTS
    ) {
      return {
        success: false,
        status: "invalid",
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
        status: "invalid",
        message:
          "No valid verified observations were supplied.",
        data: {
          requestedCount:
            observations.length,
          validCount: 0,
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

    const uniqueMap =
      new Map();

    for (
      const item of valid
    ) {
      const filter =
        buildDeduplicationFilter(
          item.data
        );

      const key =
        JSON.stringify(
          filter
        );

      if (
        !uniqueMap.has(key)
      ) {
        uniqueMap.set(
          key,
          item.data
        );
      }
    }

    const uniqueObservations =
      Array.from(
        uniqueMap.values()
      );

    const operations =
      uniqueObservations.map(
        (observation) => ({
          updateOne: {
            filter:
              buildDeduplicationFilter(
                observation
              ),

            update: {
              $setOnInsert:
                observation,
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
        DATA_STATUS.VERIFIED,
      message:
        "Financial observations processed.",
      data: {
        requestedCount:
          observations.length,

        validCount:
          valid.length,

        uniqueCount:
          uniqueObservations.length,

        duplicateInputCount:
          valid.length -
          uniqueObservations.length,

        rejectedCount:
          rejected.length,

        insertedCount:
          result.upsertedCount ||
          0,

        matchedExistingCount:
          result.matchedCount ||
          0,

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
        DATA_STATUS.ERROR,
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

/* -------------------------------------------------------------------------- */
/* Query builder                                                              */
/* -------------------------------------------------------------------------- */

function buildQuery(
  input = {}
) {
  const query = {};

  if (!isObject(input)) {
    return query;
  }

  /*
   * SECURITY:
   * Financial queries must always be user-scoped.
   */
  const userId =
    normalizeUserId(
      input.userId
    );

  if (!userId) {
    throw new Error(
      "userId is required for financial snapshot queries."
    );
  }

  query.userId =
    userId;

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

  const service =
    normalizeString(
      input.service,
      300
    );

  if (service) {
    query.service =
      service;
  }

  const resource =
    normalizeString(
      input.resource,
      500
    );

  if (resource) {
    query.resource =
      resource;
  }

  const region =
    normalizeString(
      input.region,
      200
    );

  if (region) {
    query.region =
      region;
  }

  const status =
    normalizeStatus(
      input.status
    );

  if (status) {
    query.status =
      status;
  }

  const currency =
    normalizeCurrency(
      input.currency
    );

  if (currency) {
    query.currency =
      currency;
  }

  const unit =
    normalizeString(
      input.unit,
      100
    );

  if (unit) {
    query.unit =
      unit;
  }

  const startDate =
    normalizeDate(
      input.startDate ||
        input.start
    );

  const endDate =
    normalizeDate(
      input.endDate ||
        input.end
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

  return query;
}

/* -------------------------------------------------------------------------- */
/* Query limits                                                               */
/* -------------------------------------------------------------------------- */

function normalizeLimit(
  value,
  fallback = 100,
  maximum = MAX_QUERY_LIMIT
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
    maximum
  );
}

/* -------------------------------------------------------------------------- */
/* Read observations                                                          */
/* -------------------------------------------------------------------------- */

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
        input.limit,
        100,
        MAX_QUERY_LIMIT
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
          ? DATA_STATUS.VERIFIED
          : DATA_STATUS.UNAVAILABLE,

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
        DATA_STATUS.ERROR,
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

/* -------------------------------------------------------------------------- */
/* Historical series                                                          */
/* -------------------------------------------------------------------------- */

async function getHistoricalSeries(
  input = {}
) {
  try {
    const query =
      buildQuery(
        input
      );

    const limit =
      normalizeLimit(
        input.limit,
        500,
        MAX_HISTORY_LIMIT
      );

    const observations =
      await CostEvent.find(
        query
      )
        .sort({
          timestamp: 1,
        })
        .limit(limit)
        .lean();

    return {
      success: true,

      status:
        observations.length
          ? DATA_STATUS.VERIFIED
          : DATA_STATUS.UNAVAILABLE,

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
        DATA_STATUS.ERROR,
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

/* -------------------------------------------------------------------------- */
/* Latest observation                                                         */
/* -------------------------------------------------------------------------- */

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
          DATA_STATUS.UNAVAILABLE,
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
        DATA_STATUS.VERIFIED,
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
        DATA_STATUS.ERROR,
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

/* -------------------------------------------------------------------------- */
/* Provider summary                                                           */
/* -------------------------------------------------------------------------- */

async function getProviderSummary(
  input = {}
) {
  try {
    const query =
      buildQuery(
        input
      );

    const summary =
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
        summary.length
          ? DATA_STATUS.VERIFIED
          : DATA_STATUS.UNAVAILABLE,

      message:
        summary.length
          ? "Provider financial summary retrieved."
          : "No verified financial summary is available.",

      data: {
        providers:
          summary,
        count:
          summary.length,
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
        DATA_STATUS.ERROR,
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

/* -------------------------------------------------------------------------- */
/* Totals                                                                     */
/* -------------------------------------------------------------------------- */

async function getTotal(
  input = {}
) {
  try {
    const valueType =
      normalizeValueType(
        input.valueType
      );

    if (!valueType) {
      return {
        success: false,
        status: "invalid",
        message:
          "valueType must be cost or usage.",
        data: null,
      };
    }

    const query =
      buildQuery(
        input
      );

    const rows =
      await CostEvent.aggregate([
        {
          $match:
            query,
        },

        {
          $group: {
            _id: {
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
          },
        },
      ]);

    if (
      rows.length > 1
    ) {
      return {
        success: true,
        status:
          DATA_STATUS.UNAVAILABLE,
        message:
          "Multiple currencies or usage units prevent safe aggregation.",
        data: {
          totals:
            rows,
        },
      };
    }

    if (!rows.length) {
      return {
        success: true,
        status:
          DATA_STATUS.UNAVAILABLE,
        message:
          "No verified observations are available.",
        data: {
          total: null,

          currency:
            valueType ===
            VALUE_TYPE.COST
              ? null
              : undefined,

          unit:
            valueType ===
            VALUE_TYPE.USAGE
              ? null
              : undefined,

          count: 0,
        },
      };
    }

    const row =
      rows[0];

    return {
      success: true,
      status:
        DATA_STATUS.VERIFIED,
      message:
        "Financial total calculated from verified observations.",
      data: {
        total:
          row.total,

        currency:
          valueType ===
          VALUE_TYPE.COST
            ? row._id.currency ||
              null
            : undefined,

        unit:
          valueType ===
          VALUE_TYPE.USAGE
            ? row._id.unit ||
              null
            : undefined,

        count:
          row.count,
      },
    };
  } catch (error) {
    console.error(
      "[FinancialSnapshotService] getTotal:",
      error.message
    );

    return {
      success: false,
      status:
        DATA_STATUS.ERROR,
      message:
        "Failed to calculate financial total.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Explicit cleanup                                                           */
/* -------------------------------------------------------------------------- */

async function deleteOldSnapshots(
  input = {}
) {
  try {
    if (!isObject(input)) {
      return {
        success: false,
        status: "invalid",
        message:
          "Input must be an object containing userId and beforeDate.",
        data: null,
      };
    }

    const userId =
      normalizeUserId(
        input.userId
      );

    if (!userId) {
      return {
        success: false,
        status: "invalid",
        message:
          "userId is required.",
        data: null,
      };
    }

    const date =
      normalizeDate(
        input.beforeDate
      );

    if (!date) {
      return {
        success: false,
        status: "invalid",
        message:
          "A valid beforeDate is required.",
        data: null,
      };
    }

    /*
     * CRITICAL:
     * Cleanup is ALWAYS scoped to the requesting user.
     */
    const result =
      await CostEvent.deleteMany({
        userId,

        timestamp: {
          $lt: date,
        },
      });

    return {
      success: true,
      status: "deleted",
      message:
        "Old financial snapshots deleted.",
      data: {
        userId,
        deletedCount:
          result.deletedCount ||
          0,
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
        DATA_STATUS.ERROR,
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

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  VALUE_TYPE,
  DATA_STATUS,

  normalizeUserId,
  normalizeObservation,
  sanitizeProviderData,

  buildDeduplicationFilter,
  buildQuery,

  saveObservation,
  saveObservations,

  getObservations,
  getHistoricalSeries,
  getLatestObservation,
  getProviderSummary,
  getTotal,

  deleteOldSnapshots,
};
