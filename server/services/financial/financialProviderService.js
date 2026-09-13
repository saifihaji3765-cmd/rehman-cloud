"use strict";

/*
 * Financial Provider Service
 *
 * Flow:
 *
 * Provider Adapter
 *       ↓
 * Financial Provider Service
 *       ↓
 * Standardized observations
 *       ↓
 * Financial Data / Snapshot / Control services
 *
 * Rules:
 * - No fake values
 * - No hardcoded cost
 * - No hardcoded usage
 * - Provider must explicitly report the value
 * - Missing provider data stays unavailable/null
 * - Credentials are never returned
 */

const providerAdapterService = require(
  "./providerAdapterService"
);

const SUPPORTED_PROVIDERS = Object.freeze([
  "openai",
  "aws",
  "stripe",
  "razorpay",
  "whatsapp",
]);

const MAX_OBSERVATIONS = 5000;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeProvider(provider) {
  if (
    provider === undefined ||
    provider === null
  ) {
    return null;
  }

  const value = String(provider)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return value || null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isoDate(value) {
  const date = normalizeDate(value);

  return date
    ? date.toISOString()
    : null;
}

function finiteNumber(value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value;
}

function cleanString(
  value,
  max = 500
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return null;
  }

  const result = String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);

  return result || null;
}

function normalizeStatus(
  value
) {
  const status =
    cleanString(value, 80);

  if (!status) {
    return "unavailable";
  }

  return status.toLowerCase();
}

function isSupportedProvider(
  provider
) {
  return SUPPORTED_PROVIDERS.includes(
    normalizeProvider(provider)
  );
}

function safeProviderError(
  error
) {
  if (!error) {
    return null;
  }

  return {
    code:
      cleanString(
        error.code ||
          error.name,
        200
      ) ||
      "PROVIDER_REQUEST_FAILED",

    message:
      cleanString(
        error.message,
        1000
      ) ||
      "Provider request failed.",
  };
}

/*
 * Remove obviously sensitive fields from
 * provider metadata.
 */
const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "authorization",
  "password",
  "passwd",
  "secret",
  "client_secret",
  "clientsecret",
  "private_key",
  "privatekey",
  "cvv",
  "cvc",
  "otp",
  "pin",
  "card_number",
  "cardnumber",
]);

function sanitizeProviderData(
  value,
  depth = 0
) {
  if (depth > 5) {
    return null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) =>
        sanitizeProviderData(
          item,
          depth + 1
        )
      );
  }

  if (typeof value === "object") {
    const output = {};

    for (
      const [
        key,
        item,
      ] of Object.entries(value)
    ) {
      const normalizedKey =
        String(key)
          .trim()
          .toLowerCase()
          .replace(/[\s-]/g, "_");

      if (
        SENSITIVE_KEYS.has(
          normalizedKey
        )
      ) {
        continue;
      }

      output[
        cleanString(key, 150) ||
          "field"
      ] =
        sanitizeProviderData(
          item,
          depth + 1
        );
    }

    return output;
  }

  return null;
}

/*
 * Normalize a cost observation.
 */
function normalizeCostObservation(
  observation,
  defaults = {}
) {
  if (
    !isObject(observation)
  ) {
    return null;
  }

  const provider =
    normalizeProvider(
      observation.provider ||
        defaults.provider
    );

  const source =
    cleanString(
      observation.source ||
        defaults.source,
      500
    );

  const value =
    finiteNumber(
      observation.value ??
        observation.amount ??
        observation.cost
    );

  const currency =
    cleanString(
      observation.currency ||
        observation.unit,
      30
    );

  if (!provider) {
    return null;
  }

  if (!source) {
    return null;
  }

  if (
    value === null ||
    !currency
  ) {
    return null;
  }

  const observedAt =
    normalizeDate(
      observation.observedAt ||
        observation.timestamp ||
        defaults.observedAt
    ) || null;

  const retrievedAt =
    normalizeDate(
      observation.retrievedAt ||
        defaults.retrievedAt
    ) || new Date();

  if (!observedAt) {
    return null;
  }

  return {
    provider,
    source,
    valueType: "cost",
    value,
    currency:
      currency.toUpperCase(),
    observedAt:
      observedAt.toISOString(),
    retrievedAt:
      retrievedAt.toISOString(),

    period: isObject(
      observation.period
    )
      ? {
          start:
            isoDate(
              observation.period.start
            ),
          end:
            isoDate(
              observation.period.end
            ),
        }
      : null,

    periodStart:
      isoDate(
        observation.periodStart
      ),

    periodEnd:
      isoDate(
        observation.periodEnd
      ),

    accountId:
      cleanString(
        observation.accountId,
        200
      ),

    projectId:
      cleanString(
        observation.projectId,
        200
      ),

    model:
      cleanString(
        observation.model,
        200
      ),

    service:
      cleanString(
        observation.service,
        200
      ),

    resource:
      cleanString(
        observation.resource,
        200
      ),

    region:
      cleanString(
        observation.region,
        100
      ),

    status:
      normalizeStatus(
        observation.status ||
          defaults.status ||
          "available"
      ),

    confidence:
      cleanString(
        observation.confidence ||
          defaults.confidence,
        100
      ),

    providerData:
      sanitizeProviderData(
        observation.providerData ||
          observation.metadata ||
          {}
      ),
  };
}

/*
 * Normalize a usage observation.
 */
function normalizeUsageObservation(
  observation,
  defaults = {}
) {
  if (
    !isObject(observation)
  ) {
    return null;
  }

  const provider =
    normalizeProvider(
      observation.provider ||
        defaults.provider
    );

  const source =
    cleanString(
      observation.source ||
        defaults.source,
      500
    );

  const value =
    finiteNumber(
      observation.value ??
        observation.units ??
        observation.tokens ??
        observation.requests
    );

  const unit =
    cleanString(
      observation.unit ||
        (
          observation.tokens !==
          undefined
            ? "tokens"
            : observation.requests !==
                undefined
              ? "requests"
              : null
        ),
      100
    );

  if (!provider) {
    return null;
  }

  if (!source) {
    return null;
  }

  if (
    value === null ||
    !unit
  ) {
    return null;
  }

  const observedAt =
    normalizeDate(
      observation.observedAt ||
        observation.timestamp ||
        defaults.observedAt
    );

  const retrievedAt =
    normalizeDate(
      observation.retrievedAt ||
        defaults.retrievedAt
    ) || new Date();

  if (!observedAt) {
    return null;
  }

  return {
    provider,
    source,
    valueType: "usage",
    value,
    unit,
    observedAt:
      observedAt.toISOString(),
    retrievedAt:
      retrievedAt.toISOString(),

    period: isObject(
      observation.period
    )
      ? {
          start:
            isoDate(
              observation.period.start
            ),
          end:
            isoDate(
              observation.period.end
            ),
        }
      : null,

    periodStart:
      isoDate(
        observation.periodStart
      ),

    periodEnd:
      isoDate(
        observation.periodEnd
      ),

    accountId:
      cleanString(
        observation.accountId,
        200
      ),

    projectId:
      cleanString(
        observation.projectId,
        200
      ),

    model:
      cleanString(
        observation.model,
        200
      ),

    service:
      cleanString(
        observation.service,
        200
      ),

    resource:
      cleanString(
        observation.resource,
        200
      ),

    region:
      cleanString(
        observation.region,
        100
      ),

    status:
      normalizeStatus(
        observation.status ||
          defaults.status ||
          "available"
      ),

    confidence:
      cleanString(
        observation.confidence ||
          defaults.confidence,
        100
      ),

    providerData:
      sanitizeProviderData(
        observation.providerData ||
          observation.metadata ||
          {}
      ),
  };
}

/*
 * Convert provider result into normalized
 * financial observations.
 */
function normalizeProviderObservations(
  provider,
  type,
  result
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !normalizedProvider ||
    !isObject(result)
  ) {
    return [];
  }

  const observations =
    Array.isArray(
      result.observations
    )
      ? result.observations
      : Array.isArray(
          result.data?.observations
        )
        ? result.data.observations
        : [];

  if (!observations.length) {
    return [];
  }

  const defaults = {
    provider:
      normalizedProvider,

    source:
      result.source ||
      result.data?.source ||
      `provider:${normalizedProvider}`,

    retrievedAt:
      result.retrievedAt ||
      result.data?.retrievedAt ||
      new Date(),

    status:
      result.status ||
      result.data?.status ||
      "available",

    confidence:
      result.confidence ||
      result.data?.confidence ||
      null,
  };

  const normalized = [];

  for (
    const observation
    of observations
  ) {
    const item =
      type === "cost"
        ? normalizeCostObservation(
            observation,
            defaults
          )
        : normalizeUsageObservation(
            observation,
            defaults
          );

    if (item) {
      normalized.push(item);
    }

    if (
      normalized.length >=
      MAX_OBSERVATIONS
    ) {
      break;
    }
  }

  return normalized;
}

/*
 * Fetch provider health.
 */
async function getHealth(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  return providerAdapterService.health(
    normalizedProvider,
    context
  );
}

/*
 * Fetch and normalize provider costs.
 */
async function getCosts(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      observations: [],
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  const result =
    await providerAdapterService.costs(
      normalizedProvider,
      context
    );

  const observations =
    result.success === true
      ? normalizeProviderObservations(
          normalizedProvider,
          "cost",
          result.data || result
        )
      : [];

  return {
    success:
      result.success === true &&
      observations.length > 0,

    status:
      result.status ||
      (
        observations.length
          ? "available"
          : "unavailable"
      ),

    provider:
      normalizedProvider,

    source:
      result.source ||
      `provider:${normalizedProvider}`,

    retrievedAt:
      result.retrievedAt ||
      new Date().toISOString(),

    observations,

    error:
      result.error ||
      null,
  };
}

/*
 * Fetch and normalize provider usage.
 */
async function getUsage(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      observations: [],
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  const result =
    await providerAdapterService.usage(
      normalizedProvider,
      context
    );

  const observations =
    result.success === true
      ? normalizeProviderObservations(
          normalizedProvider,
          "usage",
          result.data || result
        )
      : [];

  return {
    success:
      result.success === true &&
      observations.length > 0,

    status:
      result.status ||
      (
        observations.length
          ? "available"
          : "unavailable"
      ),

    provider:
      normalizedProvider,

    source:
      result.source ||
      `provider:${normalizedProvider}`,

    retrievedAt:
      result.retrievedAt ||
      new Date().toISOString(),

    observations,

    error:
      result.error ||
      null,
  };
}

/*
 * Fetch provider forecast.
 *
 * Forecast values are returned only when the
 * provider explicitly reports a forecast.
 */
async function getForecast(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      forecast: null,
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  const result =
    await providerAdapterService.forecast(
      normalizedProvider,
      context
    );

  if (
    result.success !== true
  ) {
    return {
      success: false,
      status:
        result.status ||
        "unavailable",
      provider:
        normalizedProvider,
      forecast: null,
      source:
        result.source ||
        `provider:${normalizedProvider}`,
      retrievedAt:
        result.retrievedAt ||
        new Date().toISOString(),
      error:
        result.error ||
        null,
    };
  }

  const data =
    isObject(result.data)
      ? result.data
      : result;

  const forecast =
    isObject(data.forecast)
      ? data.forecast
      : null;

  if (!forecast) {
    return {
      success: false,
      status: "unavailable",
      provider:
        normalizedProvider,
      forecast: null,
      source:
        result.source ||
        `provider:${normalizedProvider}`,
      retrievedAt:
        result.retrievedAt ||
        new Date().toISOString(),
    };
  }

  const value =
    finiteNumber(
      forecast.value ??
        forecast.amount
    );

  if (value === null) {
    return {
      success: false,
      status: "unavailable",
      provider:
        normalizedProvider,
      forecast: null,
      source:
        result.source ||
        `provider:${normalizedProvider}`,
      retrievedAt:
        result.retrievedAt ||
        new Date().toISOString(),
    };
  }

  return {
    success: true,
    status: "available",
    provider:
      normalizedProvider,
    source:
      result.source ||
      `provider:${normalizedProvider}`,
    retrievedAt:
      result.retrievedAt ||
      new Date().toISOString(),
    forecast: {
      value,

      currency:
        cleanString(
          forecast.currency ||
            forecast.unit,
          30
        ),

      unit:
        cleanString(
          forecast.unit,
          100
        ),

      period:
        isObject(
          forecast.period
        )
          ? {
              start:
                isoDate(
                  forecast.period.start
                ),
              end:
                isoDate(
                  forecast.period.end
                ),
            }
          : null,

      confidence:
        cleanString(
          forecast.confidence,
          100
        ),

      providerReported:
        true,
    },
  };
}

/*
 * Fetch provider payment status.
 *
 * This function never creates a payment.
 */
async function getPaymentStatus(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  return providerAdapterService.paymentStatus(
    normalizedProvider,
    context
  );
}

/*
 * Send a message through the provider adapter.
 */
async function sendMessage(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  return providerAdapterService.sendMessage(
    normalizedProvider,
    context
  );
}

/*
 * Verify provider webhook.
 */
async function verifyWebhook(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  return providerAdapterService.verifyWebhook(
    normalizedProvider,
    context
  );
}

/*
 * Fetch a complete financial provider snapshot.
 */
async function getProviderData(
  provider,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (
    !isSupportedProvider(
      normalizedProvider
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider:
        normalizedProvider,
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          "Unsupported financial provider.",
      },
    };
  }

  const [
    healthResult,
    costsResult,
    usageResult,
    forecastResult,
  ] = await Promise.all([
    getHealth(
      normalizedProvider,
      context
    ),
    getCosts(
      normalizedProvider,
      context
    ),
    getUsage(
      normalizedProvider,
      context
    ),
    getForecast(
      normalizedProvider,
      context
    ),
  ]);

  const hasAnyData =
    healthResult.success === true ||
    costsResult.observations.length > 0 ||
    usageResult.observations.length > 0 ||
    forecastResult.success === true;

  return {
    success: hasAnyData,
    status:
      hasAnyData
        ? "available"
        : "unavailable",

    provider:
      normalizedProvider,

    retrievedAt:
      new Date().toISOString(),

    health:
      healthResult,

    costs:
      costsResult,

    usage:
      usageResult,

    forecast:
      forecastResult,
  };
}

/*
 * Fetch all provider snapshots.
 *
 * Failures in one provider do not become fake
 * values for another provider.
 */
async function getAllProviderData(
  context = {}
) {
  const results = [];

  for (
    const provider
    of SUPPORTED_PROVIDERS
  ) {
    try {
      results.push(
        await getProviderData(
          provider,
          context
        )
      );
    } catch (error) {
      results.push({
        success: false,
        status: "error",
        provider,
        retrievedAt:
          new Date().toISOString(),
        error:
          safeProviderError(error),
      });
    }
  }

  return {
    success: results.some(
      (item) =>
        item.success === true
    ),

    status:
      results.every(
        (item) =>
          item.success === true
      )
        ? "available"
        : results.some(
              (item) =>
                item.success === true
            )
          ? "partial"
          : "unavailable",

    providers: results,
  };
}

/*
 * Main callable interface.
 */
async function financialProviderService(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_FINANCIAL_PROVIDER_INPUT",
        message:
          "Financial provider input must be an object.",
      },
    };
  }

  const operation =
    normalizeOperation(
      input.operation ||
        "providerData"
    );

  const provider =
    normalizeProvider(
      input.provider
    );

  switch (operation) {
    case "health":
      return getHealth(
        provider,
        input.context || {}
      );

    case "usage":
      return getUsage(
        provider,
        input.context || {}
      );

    case "costs":
    case "cost":
      return getCosts(
        provider,
        input.context || {}
      );

    case "forecast":
      return getForecast(
        provider,
        input.context || {}
      );

    case "paymentstatus":
      return getPaymentStatus(
        provider,
        input.context || {}
      );

    case "sendmessage":
      return sendMessage(
        provider,
        input.context || {}
      );

    case "verifywebhook":
      return verifyWebhook(
        provider,
        input.context || {}
      );

    case "providerdata":
      return getProviderData(
        provider,
        input.context || {}
      );

    case "all":
    case "allproviders":
      return getAllProviderData(
        input.context || {}
      );

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code:
            "UNSUPPORTED_FINANCIAL_PROVIDER_OPERATION",
          message:
            `Unsupported financial provider operation: ${operation}`,
        },
      };
  }
}

function normalizeOperation(
  operation
) {
  if (
    operation === undefined ||
    operation === null
  ) {
    return null;
  }

  const value = String(operation)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return value || null;
}

financialProviderService.getHealth =
  getHealth;

financialProviderService.getCosts =
  getCosts;

financialProviderService.getUsage =
  getUsage;

financialProviderService.getForecast =
  getForecast;

financialProviderService.getPaymentStatus =
  getPaymentStatus;

financialProviderService.sendMessage =
  sendMessage;

financialProviderService.verifyWebhook =
  verifyWebhook;

financialProviderService.getProviderData =
  getProviderData;

financialProviderService.getAllProviderData =
  getAllProviderData;

financialProviderService.normalizeCostObservation =
  normalizeCostObservation;

financialProviderService.normalizeUsageObservation =
  normalizeUsageObservation;

financialProviderService.normalizeProviderObservations =
  normalizeProviderObservations;

financialProviderService.sanitizeProviderData =
  sanitizeProviderData;

module.exports =
  financialProviderService;
