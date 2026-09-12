"use strict";

/**
 * ZyrionOS Financial Data Service
 *
 * Purpose:
 * - Common service layer between financial agents and provider adapters.
 * - Normalize real provider observations.
 * - Preserve source, provider, timestamp, period and status.
 * - Prepare data for Cost Monitor, Usage Monitor and Forecast agents.
 *
 * IMPORTANT:
 * This service does NOT call external providers by itself.
 * Provider-specific adapters must be registered through providerRegistry.
 *
 * No fake/demo financial values are generated.
 */

const providerRegistry = require("../../agents/financial/providerRegistry");

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

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeProvider(provider) {
  const value =
    normalizeString(provider, 100);

  return value
    ? value.toLowerCase()
    : null;
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
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeStatus(status) {
  const value =
    normalizeString(status, 50)
      ?.toLowerCase();

  if (!value) {
    return null;
  }

  return value;
}

function normalizeCurrency(currency) {
  const value =
    normalizeString(currency, 10);

  return value
    ? value.toUpperCase()
    : null;
}

function normalizeObservation(
  observation,
  valueType,
  providerFallback = null
) {
  if (!isObject(observation)) {
    return null;
  }

  const provider =
    normalizeProvider(
      observation.provider ||
        providerFallback
    );

  const value =
    normalizeNumber(
      observation.value ??
        observation.amount ??
        observation.cost ??
        observation.usage ??
        observation.total
    );

  const timestamp =
    normalizeDate(
      observation.timestamp ??
        observation.retrievedAt ??
        observation.date ??
        observation.periodEnd
    );

  const status =
    normalizeStatus(
      observation.status
    );

  const source =
    normalizeString(
      observation.source,
      500
    );

  /*
   * A financial observation without a provider,
   * numeric value, timestamp or source cannot be
   * considered trustworthy.
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
   * Only provider-confirmed/available data is accepted
   * as a verified observation.
   */
  if (
    status !==
      DATA_STATUS.VERIFIED &&
    status !==
      DATA_STATUS.AVAILABLE
  ) {
    return null;
  }

  const normalized = {
    provider,
    value,
    valueType,
    status,
    source,
    retrievedAt:
      normalizeDate(
        observation.retrievedAt
      ) || timestamp,

    timestamp,

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
  };

  if (
    valueType ===
    VALUE_TYPE.COST
  ) {
    normalized.currency =
      normalizeCurrency(
        observation.currency
      );
  }

  if (
    valueType ===
    VALUE_TYPE.USAGE
  ) {
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

  /*
   * Preserve provider-specific information without
   * copying credentials/secrets.
   */
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
    normalized.providerData =
      null;
  }

  return normalized;
}

function sanitizeProviderData(
  data
) {
  if (!isObject(data)) {
    return null;
  }

  const result = {};

  const blockedKeys = new Set([
    "apikey",
    "api_key",
    "authorization",
    "token",
    "accesstoken",
    "access_token",
    "secret",
    "secretkey",
    "secret_key",
    "privatekey",
    "private_key",
    "password",
    "passwd",
    "cvv",
    "cvc",
    "otp",
    "pin",
  ]);

  for (
    const [
      key,
      value,
    ] of Object.entries(data)
  ) {
    const normalizedKey =
      String(key)
        .toLowerCase()
        .replace(/[\s-]/g, "");

    if (
      blockedKeys.has(
        normalizedKey
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
          ? value.slice(0, 1000)
          : value;
    }
  }

  return result;
}

function normalizeProviderList(
  providers
) {
  if (!Array.isArray(providers)) {
    return [];
  }

  return [
    ...new Set(
      providers
        .map(
          normalizeProvider
        )
        .filter(Boolean)
    ),
  ];
}

async function fetchProviderData(
  provider,
  input,
  valueType
) {
  const normalizedProvider =
    normalizeProvider(
      provider
    );

  if (!normalizedProvider) {
    return {
      provider: null,
      status:
        DATA_STATUS.ERROR,
      observations: [],
      error:
        "Provider name is required.",
    };
  }

  let registeredProvider;

  try {
    registeredProvider =
      providerRegistry.getProvider(
        normalizedProvider
      );
  } catch (error) {
    return {
      provider:
        normalizedProvider,
      status:
        DATA_STATUS.ERROR,
      observations: [],
      error:
        error.message,
    };
  }

  if (!registeredProvider) {
    return {
      provider:
        normalizedProvider,
      status:
        DATA_STATUS.NOT_CONFIGURED,
      observations: [],
      error:
        "Provider adapter is not registered.",
    };
  }

  /*
   * providerRegistry#getProvider may expose an adapter,
   * health state or provider object depending on the
   * registered implementation.
   */
  const adapter =
    registeredProvider.adapter ||
    registeredProvider;

  if (!isObject(adapter)) {
    return {
      provider:
        normalizedProvider,
      status:
        DATA_STATUS.NOT_CONFIGURED,
      observations: [],
      error:
        "Provider adapter is unavailable.",
    };
  }

  const methodName =
    valueType ===
    VALUE_TYPE.COST
      ? "getCosts"
      : "getUsage";

  const method =
    typeof adapter[
      methodName
    ] === "function"
      ? adapter[
          methodName
        ]
      : null;

  if (!method) {
    return {
      provider:
        normalizedProvider,
      status:
        DATA_STATUS.NOT_CONFIGURED,
      observations: [],
      error:
        `Provider adapter does not implement ${methodName}.`,
    };
  }

  try {
    const result =
      await method.call(
        adapter,
        input
      );

    if (!isObject(result)) {
      return {
        provider:
          normalizedProvider,
        status:
          DATA_STATUS.UNAVAILABLE,
        observations: [],
        error:
          "Provider returned no usable financial data.",
      };
    }

    const resultStatus =
      normalizeStatus(
        result.status
      ) ||
      DATA_STATUS.AVAILABLE;

    const rawObservations =
      Array.isArray(
        result.observations
      )
        ? result.observations
        : Array.isArray(
            result.data
          )
        ? result.data
        : [];

    const observations =
      rawObservations
        .map(
          (observation) =>
            normalizeObservation(
              observation,
              valueType,
              normalizedProvider
            )
        )
        .filter(Boolean);

    if (!observations.length) {
      return {
        provider:
          normalizedProvider,
        status:
          resultStatus ===
          DATA_STATUS.ERROR
            ? DATA_STATUS.ERROR
            : DATA_STATUS.UNAVAILABLE,
        observations: [],
        error:
          normalizeString(
            result.message ||
              result.error,
            1000
          ),
        providerData:
          sanitizeProviderData(
            result.providerData
          ),
      };
    }

    return {
      provider:
        normalizedProvider,
      status:
        resultStatus,
      observations,
      providerData:
        sanitizeProviderData(
          result.providerData
        ),
      retrievedAt:
        normalizeDate(
          result.retrievedAt
        ),
    };
  } catch (error) {
    console.error(
      `[FinancialDataService] ${normalizedProvider} ${methodName} error:`,
      error.message
    );

    return {
      provider:
        normalizedProvider,
      status:
        DATA_STATUS.ERROR,
      observations: [],
      error:
        process.env.NODE_ENV ===
        "production"
          ? "Provider data request failed."
          : error.message,
    };
  }
}

function sortObservations(
  observations
) {
  return [
    ...observations,
  ].sort(
    (a, b) =>
      new Date(
        a.timestamp
      ).getTime() -
      new Date(
        b.timestamp
      ).getTime()
  );
}

function deduplicateObservations(
  observations
) {
  const map =
    new Map();

  for (
    const observation of observations
  ) {
    const key = [
      observation.provider,
      observation.valueType,
      observation.timestamp,
      observation.source,
      observation.value,
      observation.currency ||
        "",
      observation.unit ||
        "",
      observation.model ||
        "",
    ].join("|");

    map.set(
      key,
      observation
    );
  }

  return Array.from(
    map.values()
  );
}

function filterObservations(
  observations,
  input = {}
) {
  let result =
    observations;

  const start =
    normalizeDate(
      input.startDate
    );

  const end =
    normalizeDate(
      input.endDate
    );

  if (start) {
    const startTime =
      new Date(
        start
      ).getTime();

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
      new Date(
        end
      ).getTime();

    result =
      result.filter(
        (observation) =>
          new Date(
            observation.timestamp
          ).getTime() <=
          endTime
      );
  }

  if (
    input.accountId
  ) {
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
  }

  if (
    input.projectId
  ) {
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
  }

  if (
    input.model
  ) {
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
            observation.model ===
              model
        );
    }
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

  if (
    currencies.length === 0
  ) {
    return {
      consistent: false,
      currency: null,
      reason:
        "No verified currency was supplied.",
    };
  }

  if (
    currencies.length > 1
  ) {
    return {
      consistent: false,
      currency: null,
      reason:
        "Multiple currencies cannot be aggregated without an explicit FX conversion source.",
    };
  }

  return {
    consistent: true,
    currency:
      currencies[0],
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

  if (
    units.length === 0
  ) {
    return {
      consistent: false,
      unit: null,
      reason:
        "No verified usage unit was supplied.",
    };
  }

  if (
    units.length > 1
  ) {
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
  } else {
    consistency =
      validateUnitConsistency(
        observations
      );
  }

  if (
    !consistency.consistent
  ) {
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
        sum +
        observation.value,
      0
    );

  if (
    !Number.isFinite(
      total
    )
  ) {
    return {
      status:
        DATA_STATUS.ERROR,
      observations: [],
      total: null,
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
      },
    };
  }

  const providerResults = [];

  for (
    const provider of providers
  ) {
    const result =
      await fetchProviderData(
        provider,
        input,
        valueType
      );

    providerResults.push(
      result
    );
  }

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
        result.observations?.length
    ).length;

  const errorProviderCount =
    providerResults.filter(
      (result) =>
        result.status ===
        DATA_STATUS.ERROR
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
    providerResults.length
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

  normalizeObservation,
  normalizeProviderList,
  sanitizeProviderData,

  filterObservations,
  aggregateObservations,
  validateCurrencyConsistency,
  validateUnitConsistency,

  buildObservation,
};
