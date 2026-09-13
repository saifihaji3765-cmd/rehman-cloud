"use strict";

/**
 * ZyrionOS Financial Data Service
 *
 * Purpose:
 * - Common normalization layer between Financial Control
 *   agents and the real provider service.
 * - Consume provider data through financialProviderService.
 * - Normalize real cost/usage observations.
 * - Preserve provider, source, timestamps, period and status.
 * - Prevent fake/demo financial values.
 * - Prevent aggregation across incompatible currencies/units.
 *
 * Architecture:
 *
 * Financial Agents
 *        ↓
 * financialDataService
 *        ↓
 * financialProviderService
 *        ↓
 * Provider Adapters
 *        ↓
 * OpenAI / AWS / Stripe / Razorpay / WhatsApp
 *
 * IMPORTANT:
 * - This service does NOT contain provider credentials.
 * - This service does NOT generate financial values.
 * - Missing provider data remains unavailable/null.
 * - Provider-specific API calls belong to provider adapters.
 */

const financialProviderService = require("./financialProviderService");

const DATA_STATUS = Object.freeze({
  VERIFIED: "verified",
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  NOT_CONFIGURED: "not_configured",
  ERROR: "error",
});

const VALUE_TYPE = Object.freeze({
  COST: "cost",
  USAGE: "usage",
});

const MAX_PROVIDERS = 20;
const MAX_OBSERVATIONS = 5000;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeProvider(provider) {
  const value = normalizeString(provider, 100);

  return value ? value.toLowerCase() : null;
}

function normalizeProviderList(providers) {
  if (!Array.isArray(providers)) {
    return [];
  }

  return [
    ...new Set(
      providers
        .map(normalizeProvider)
        .filter(Boolean)
    ),
  ].slice(0, MAX_PROVIDERS);
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeStatus(status) {
  const value = normalizeString(status, 50);

  return value ? value.toLowerCase() : null;
}

function normalizeCurrency(currency) {
  const value = normalizeString(currency, 10);

  return value ? value.toUpperCase() : null;
}

function sanitizeProviderData(data, depth = 0) {
  if (!isObject(data)) {
    return null;
  }

  if (depth > 3) {
    return null;
  }

  const blockedKeys = new Set([
    "apikey",
    "api_key",
    "authorization",
    "auth",
    "token",
    "accesstoken",
    "access_token",
    "refresh_token",
    "refreshtoken",
    "secret",
    "secretkey",
    "secret_key",
    "privatekey",
    "private_key",
    "password",
    "passwd",
    "credential",
    "credentials",
    "clientsecret",
    "client_secret",
    "cvv",
    "cvc",
    "otp",
    "pin",
    "cardnumber",
    "card_number",
    "accountnumber",
    "account_number",
  ]);

  const result = {};

  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = String(key)
      .toLowerCase()
      .replace(/[\s-]/g, "");

    if (blockedKeys.has(normalizedKey)) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] =
        typeof value === "string"
          ? value.slice(0, 1000)
          : value;

      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value
        .slice(0, 50)
        .map((item) => {
          if (
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean" ||
            item === null
          ) {
            return item;
          }

          if (isObject(item)) {
            return sanitizeProviderData(
              item,
              depth + 1
            );
          }

          return null;
        })
        .filter(
          (item) => item !== null
        );

      continue;
    }

    if (isObject(value)) {
      const nested =
        sanitizeProviderData(
          value,
          depth + 1
        );

      if (nested) {
        result[key] = nested;
      }
    }
  }

  return result;
}

/**
 * Normalize a single provider observation.
 */
function normalizeObservation(
  observation,
  valueType,
  providerFallback = null
) {
  if (!isObject(observation)) {
    return null;
  }

  const provider = normalizeProvider(
    observation.provider ||
      providerFallback
  );

  const value = normalizeNumber(
    observation.value ??
      observation.amount ??
      observation.cost ??
      observation.usage ??
      observation.total
  );

  const timestamp = normalizeDate(
    observation.timestamp ??
      observation.observedAt ??
      observation.retrievedAt ??
      observation.date ??
      observation.periodEnd
  );

  const retrievedAt =
    normalizeDate(
      observation.retrievedAt
    ) || timestamp;

  const status =
    normalizeStatus(
      observation.status
    );

  const source = normalizeString(
    observation.source,
    500
  );

  /*
   * Financial observations must have:
   * provider + numeric value + timestamp + source.
   */
  if (
    !provider ||
    value === null ||
    value < 0 ||
    !timestamp ||
    !source
  ) {
    return null;
  }

  /*
   * Only provider-confirmed states are accepted.
   */
  if (
    status !== DATA_STATUS.VERIFIED &&
    status !== DATA_STATUS.AVAILABLE
  ) {
    return null;
  }

  const normalized = {
    provider,
    valueType,
    value,
    status,
    source,
    timestamp,
    observedAt:
      normalizeDate(
        observation.observedAt
      ) || timestamp,
    retrievedAt,
    period:
      normalizeString(
        observation.period,
        200
      ),
    accountId:
      normalizeString(
        observation.accountId,
        300
      ),
    projectId:
      normalizeString(
        observation.projectId,
        300
      ),
    service:
      normalizeString(
        observation.service,
        300
      ),
    resource:
      normalizeString(
        observation.resource,
        500
      ),
    region:
      normalizeString(
        observation.region,
        200
      ),
    confidence:
      normalizeString(
        observation.confidence,
        50
      ),
  };

  if (valueType === VALUE_TYPE.COST) {
    normalized.currency =
      normalizeCurrency(
        observation.currency
      );
  }

  if (valueType === VALUE_TYPE.USAGE) {
    normalized.unit =
      normalizeString(
        observation.unit,
        100
      );

    normalized.model =
      normalizeString(
        observation.model,
        200
      );
  }

  if (
    isObject(
      observation.providerData
    )
  ) {
    normalized.providerData =
      sanitizeProviderData(
        observation.providerData
      );
  } else {
    normalized.providerData = null;
  }

  if (
    isObject(
      observation.metadata
    )
  ) {
    normalized.metadata =
      sanitizeProviderData(
        observation.metadata
      );
  } else {
    normalized.metadata = null;
  }

  return normalized;
}

/**
 * Extract observations from a provider-service result.
 *
 * Supports:
 * {
 *   observations: [...]
 * }
 *
 * and:
 * {
 *   data: {
 *     observations: [...]
 *   }
 * }
 *
 * and:
 * {
 *   data: [...]
 * }
 */
function extractRawObservations(result) {
  if (!isObject(result)) {
    return [];
  }

  if (
    Array.isArray(
      result.observations
    )
  ) {
    return result.observations;
  }

  if (
    isObject(result.data) &&
    Array.isArray(
      result.data.observations
    )
  ) {
    return result.data.observations;
  }

  if (
    Array.isArray(result.data)
  ) {
    return result.data;
  }

  return [];
}

/**
 * Normalize result returned by financialProviderService.
 */
function normalizeProviderResult(
  provider,
  result,
  valueType
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (!normalizedProvider) {
    return {
      provider: null,
      status: DATA_STATUS.ERROR,
      observations: [],
      providerData: null,
      error: "Provider name is required.",
    };
  }

  if (!isObject(result)) {
    return {
      provider: normalizedProvider,
      status: DATA_STATUS.UNAVAILABLE,
      observations: [],
      providerData: null,
      error:
        "Provider returned no usable financial data.",
    };
  }

  const resultStatus =
    normalizeStatus(
      result.status
    ) ||
    DATA_STATUS.UNAVAILABLE;

  const rawObservations =
    extractRawObservations(result);

  const observations =
    rawObservations
      .slice(0, MAX_OBSERVATIONS)
      .map((observation) =>
        normalizeObservation(
          observation,
          valueType,
          normalizedProvider
        )
      )
      .filter(Boolean);

  const providerData =
    sanitizeProviderData(
      result.providerData ||
        result.data?.providerData
    );

  const error =
    normalizeString(
      result.error ||
        result.message ||
        result.data?.error,
      1000
    );

  /*
   * A provider may be healthy/configured but return
   * no financial observations. Do NOT turn that into
   * fake zero values.
   */
  if (!observations.length) {
    return {
      provider: normalizedProvider,
      status:
        resultStatus ===
        DATA_STATUS.ERROR
          ? DATA_STATUS.ERROR
          : resultStatus ===
            DATA_STATUS.NOT_CONFIGURED
          ? DATA_STATUS.NOT_CONFIGURED
          : DATA_STATUS.UNAVAILABLE,
      observations: [],
      providerData,
      retrievedAt:
        normalizeDate(
          result.retrievedAt ||
            result.data?.retrievedAt
        ),
      error,
    };
  }

  return {
    provider: normalizedProvider,
    status:
      resultStatus ===
      DATA_STATUS.ERROR
        ? DATA_STATUS.ERROR
        : resultStatus,
    observations,
    providerData,
    retrievedAt:
      normalizeDate(
        result.retrievedAt ||
          result.data?.retrievedAt
      ),
    error,
  };
}

/**
 * Call the new financialProviderService.
 *
 * Provider adapters remain the only layer that
 * communicates with external providers.
 */
async function fetchProviderData(
  provider,
  input,
  valueType
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (!normalizedProvider) {
    return {
      provider: null,
      status: DATA_STATUS.ERROR,
      observations: [],
      error:
        "Provider name is required.",
    };
  }

  const payload = {
    ...input,
    provider:
      normalizedProvider,
    providers: [
      normalizedProvider,
    ],
    valueType,
  };

  try {
    let result;

    if (
      valueType ===
      VALUE_TYPE.COST
    ) {
      result =
        await financialProviderService.getCosts(
          payload
        );
    } else {
      result =
        await financialProviderService.getUsage(
          payload
        );
    }

    /*
     * Some provider-service implementations may
     * return an array directly. Normalize it safely.
     */
    if (Array.isArray(result)) {
      result = {
        status:
          DATA_STATUS.AVAILABLE,
        observations: result,
      };
    }

    /*
     * If the provider service returns:
     * { success:false, ... }
     */
    if (
      isObject(result) &&
      result.success === false
    ) {
      return {
        provider:
          normalizedProvider,
        status:
          normalizeStatus(
            result.status
          ) ||
          DATA_STATUS.ERROR,
        observations: [],
        providerData:
          sanitizeProviderData(
            result.providerData
          ),
        error:
          normalizeString(
            result.message ||
              result.error,
            1000
          ),
      };
    }

    return normalizeProviderResult(
      normalizedProvider,
      result,
      valueType
    );
  } catch (error) {
    console.error(
      `[FinancialDataService] ${normalizedProvider} ${valueType} error:`,
      error.message
    );

    return {
      provider:
        normalizedProvider,
      status:
        DATA_STATUS.ERROR,
      observations: [],
      providerData: null,
      error:
        process.env.NODE_ENV ===
        "production"
          ? "Provider financial data request failed."
          : error.message,
    };
  }
}

function sortObservations(
  observations
) {
  return [...observations].sort(
    (a, b) =>
      new Date(
        a.timestamp
      ).getTime() -
      new Date(
        b.timestamp
      ).getTime()
  );
}

function observationFingerprint(
  observation
) {
  return [
    observation.provider || "",
    observation.valueType || "",
    observation.timestamp || "",
    observation.observedAt || "",
    observation.retrievedAt || "",
    observation.source || "",
    observation.value ?? "",
    observation.currency || "",
    observation.unit || "",
    observation.model || "",
    observation.accountId || "",
    observation.projectId || "",
    observation.service || "",
    observation.resource || "",
    observation.region || "",
  ].join("|");
}

function deduplicateObservations(
  observations
) {
  const map = new Map();

  for (const observation of observations) {
    if (!isObject(observation)) {
      continue;
    }

    const key =
      observationFingerprint(
        observation
      );

    if (!map.has(key)) {
      map.set(
        key,
        observation
      );
    }
  }

  return Array.from(
    map.values()
  );
}

function filterObservations(
  observations,
  input = {}
) {
  if (!Array.isArray(observations)) {
    return [];
  }

  let result = observations;

  const start =
    normalizeDate(
      input.startDate ||
        input.start
    );

  const end =
    normalizeDate(
      input.endDate ||
        input.end
    );

  if (start) {
    const startTime =
      new Date(start).getTime();

    result =
      result.filter(
        (observation) =>
          new Date(
            observation.timestamp
          ).getTime() >=
          startTime
      );
  }

  if (end) {
    const endTime =
      new Date(end).getTime();

    result =
      result.filter(
        (observation) =>
          new Date(
            observation.timestamp
          ).getTime() <=
          endTime
      );
  }

  const accountId =
    normalizeString(
      input.accountId,
      300
    );

  if (accountId) {
    result =
      result.filter(
        (observation) =>
          !observation.accountId ||
          observation.accountId ===
            accountId
      );
  }

  const projectId =
    normalizeString(
      input.projectId,
      300
    );

  if (projectId) {
    result =
      result.filter(
        (observation) =>
          !observation.projectId ||
          observation.projectId ===
            projectId
      );
  }

  const model =
    normalizeString(
      input.model,
      200
    );

  if (model) {
    result =
      result.filter(
        (observation) =>
          !observation.model ||
          observation.model === model
      );
  }

  const service =
    normalizeString(
      input.service,
      300
    );

  if (service) {
    result =
      result.filter(
        (observation) =>
          !observation.service ||
          observation.service ===
            service
      );
  }

  const region =
    normalizeString(
      input.region,
      200
    );

  if (region) {
    result =
      result.filter(
        (observation) =>
          !observation.region ||
          observation.region ===
            region
      );
  }

  return result;
}

function validateCurrencyConsistency(
  observations
) {
  const currencies = [
    ...new Set(
      observations
        .map(
          (observation) =>
            observation.currency
        )
        .filter(Boolean)
    ),
  ];

  if (!currencies.length) {
    return {
      consistent: false,
      currency: null,
      reason:
        "No verified currency was supplied.",
    };
  }

  if (currencies.length > 1) {
    return {
      consistent: false,
      currency: null,
      reason:
        "Multiple currencies cannot be aggregated without an explicit FX conversion source.",
    };
  }

  return {
    consistent: true,
    currency: currencies[0],
    reason: null,
  };
}

function validateUnitConsistency(
  observations
) {
  const units = [
    ...new Set(
      observations
        .map(
          (observation) =>
            observation.unit
        )
        .filter(Boolean)
    ),
  ];

  if (!units.length) {
    return {
      consistent: false,
      unit: null,
      reason:
        "No verified usage unit was supplied.",
    };
  }

  if (units.length > 1) {
    return {
      consistent: false,
      unit: null,
      reason:
        "Different usage units cannot be aggregated.",
    };
  }

  return {
    consistent: true,
    unit: units[0],
    reason: null,
  };
}

function aggregateObservations(
  observations,
  valueType
) {
  if (
    !Array.isArray(
      observations
    ) ||
    !observations.length
  ) {
    return {
      status:
        DATA_STATUS.UNAVAILABLE,
      observations: [],
      total: null,
      currency: null,
      unit: null,
      reason:
        "No verified observations are available.",
    };
  }

  let consistency;

  if (
    valueType ===
    VALUE_TYPE.COST
  ) {
    consistency =
      validateCurrencyConsistency(
        observations
      );
  } else if (
    valueType ===
    VALUE_TYPE.USAGE
  ) {
    consistency =
      validateUnitConsistency(
        observations
      );
  } else {
    return {
      status:
        DATA_STATUS.ERROR,
      observations: [],
      total: null,
      currency: null,
      unit: null,
      reason:
        "Unsupported financial value type.",
    };
  }

  if (!consistency.consistent) {
    return {
      status:
        DATA_STATUS.UNAVAILABLE,
      observations: [],
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
      reason:
        consistency.reason,
    };
  }

  const total =
    observations.reduce(
      (sum, observation) =>
        sum + observation.value,
      0
    );

  if (
    !Number.isFinite(total)
  ) {
    return {
      status:
        DATA_STATUS.ERROR,
      observations: [],
      total: null,
      currency: null,
      unit: null,
      reason:
        "Aggregated financial value is not finite.",
    };
  }

  return {
    status:
      DATA_STATUS.VERIFIED,

    observations:
      sortObservations(
        observations
      ),

    total,

    currency:
      valueType ===
      VALUE_TYPE.COST
        ? consistency.currency
        : undefined,

    unit:
      valueType ===
      VALUE_TYPE.USAGE
        ? consistency.unit
        : undefined,

    reason: null,
  };
}

/**
 * Get financial data from requested providers.
 */
async function getFinancialData(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status:
        DATA_STATUS.ERROR,
      message:
        "Financial data input must be an object.",
      data: null,
    };
  }

  const valueType =
    input.valueType ===
    VALUE_TYPE.USAGE
      ? VALUE_TYPE.USAGE
      : VALUE_TYPE.COST;

  const providers =
    normalizeProviderList(
      input.providers
    );

  if (!providers.length) {
    return {
      success: true,
      status:
        DATA_STATUS.UNAVAILABLE,
      message:
        "No financial providers were requested.",
      data: {
        valueType,
        providers: [],
        observations: [],
        providerResults: [],
        aggregate: null,
        quality: {
          requestedProviderCount: 0,
          availableProviderCount: 0,
          errorProviderCount: 0,
          verifiedObservationCount: 0,
          generatedAt:
            new Date().toISOString(),
        },
      },
    };
  }

  const providerResults = [];

  /*
   * Provider requests are isolated.
   * One provider failure must not erase
   * valid data from another provider.
   */
  const results =
    await Promise.all(
      providers.map(
        (provider) =>
          fetchProviderData(
            provider,
            input,
            valueType
          )
      )
    );

  providerResults.push(
    ...results
  );

  const allObservations =
    providerResults.flatMap(
      (result) =>
        Array.isArray(
          result.observations
        )
          ? result.observations
          : []
    );

  const filtered =
    filterObservations(
      allObservations,
      input
    );

  const unique =
    deduplicateObservations(
      filtered
    );

  const sorted =
    sortObservations(
      unique
    );

  const aggregate =
    aggregateObservations(
      sorted,
      valueType
    );

  const availableProviderCount =
    providerResults.filter(
      (result) =>
        Array.isArray(
          result.observations
        ) &&
        result.observations.length >
          0
    ).length;

  const errorProviderCount =
    providerResults.filter(
      (result) =>
        result.status ===
        DATA_STATUS.ERROR
    ).length;

  const unavailableProviderCount =
    providerResults.filter(
      (result) =>
        result.status ===
          DATA_STATUS.UNAVAILABLE ||
        result.status ===
          DATA_STATUS.NOT_CONFIGURED
    ).length;

  let overallStatus =
    DATA_STATUS.UNAVAILABLE;

  if (
    sorted.length &&
    aggregate.status ===
      DATA_STATUS.VERIFIED
  ) {
    overallStatus =
      DATA_STATUS.VERIFIED;
  } else if (
    errorProviderCount ===
      providers.length &&
    providers.length > 0
  ) {
    overallStatus =
      DATA_STATUS.ERROR;
  }

  return {
    success: true,

    status:
      overallStatus,

    message:
      overallStatus ===
      DATA_STATUS.VERIFIED
        ? "Verified financial data retrieved."
        : "Verified financial data is unavailable or incomplete.",

    data: {
      valueType,

      providers,

      observations:
        sorted,

      providerResults,

      aggregate,

      quality: {
        requestedProviderCount:
          providers.length,

        availableProviderCount,

        unavailableProviderCount,

        errorProviderCount,

        verifiedObservationCount:
          sorted.length,

        generatedAt:
          new Date().toISOString(),
      },
    },
  };
}

async function getCosts(
  input = {}
) {
  return getFinancialData({
    ...input,
    valueType:
      VALUE_TYPE.COST,
  });
}

async function getUsage(
  input = {}
) {
  return getFinancialData({
    ...input,
    valueType:
      VALUE_TYPE.USAGE,
  });
}

function buildObservation(
  data,
  valueType
) {
  return normalizeObservation(
    data,
    valueType
  );
}

module.exports = {
  DATA_STATUS,
  VALUE_TYPE,

  getFinancialData,
  getCosts,
  getUsage,

  fetchProviderData,
  normalizeProviderResult,

  normalizeObservation,
  normalizeProviderList,
  sanitizeProviderData,

  filterObservations,
  aggregateObservations,

  validateCurrencyConsistency,
  validateUnitConsistency,

  deduplicateObservations,
  sortObservations,

  buildObservation,
};
