"use strict";

/**
 * ZyrionOS Financial Control System
 * Cost Monitor Agent
 *
 * Responsibilities:
 * - Collect real cost data from registered provider adapters.
 * - Normalize provider responses into one consistent structure.
 * - Never invent cost, balance, quota, or billing values.
 * - Preserve provider source and retrieval timestamp.
 * - Detect cost anomalies only from actual numeric data.
 * - Support multiple providers.
 *
 * IMPORTANT:
 * - No API keys are stored here.
 * - No fake/demo values.
 * - No hardcoded production costs.
 * - Provider adapters are responsible for authenticated API access.
 */

const {
  PROVIDER_NAMES,
  DATA_STATUS,
  getProvider,
  getProviderCosts,
} = require("./providerRegistry");

const DEFAULT_ANOMALY_MULTIPLIER = 2;
const MAX_PROVIDER_COUNT = 20;

const SUPPORTED_PROVIDERS = Object.freeze(
  Object.values(PROVIDER_NAMES)
);

/**
 * Convert a value to a finite number.
 *
 * Returns null instead of inventing/coercing invalid financial data.
 *
 * @param {*} value
 * @returns {number|null}
 */
function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Normalize provider names.
 *
 * @param {string|string[]|undefined} providers
 * @returns {string[]}
 */
function normalizeProviders(providers) {
  if (providers === undefined || providers === null) {
    return [...SUPPORTED_PROVIDERS];
  }

  const input = Array.isArray(providers) ? providers : [providers];

  const normalized = [
    ...new Set(
      input
        .filter((provider) => typeof provider === "string")
        .map((provider) => provider.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  if (normalized.length > MAX_PROVIDER_COUNT) {
    throw new Error(
      `A maximum of ${MAX_PROVIDER_COUNT} providers can be monitored at once`
    );
  }

  return normalized;
}

/**
 * Validate ISO-like date input.
 *
 * @param {*} value
 * @param {string} fieldName
 * @returns {string|undefined}
 */
function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  return date.toISOString();
}

/**
 * Extract a numeric cost from a provider response.
 *
 * We intentionally accept only clearly named financial fields.
 * If none exist, cost remains null.
 *
 * @param {object} result
 * @returns {number|null}
 */
function extractCost(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const candidates = [
    result.cost,
    result.totalCost,
    result.amount,
    result.totalAmount,
    result.currentCost,
    result.currentPeriodCost,
    result.actualCost,
  ];

  for (const candidate of candidates) {
    const value = toFiniteNumber(candidate);

    if (value !== null && value >= 0) {
      return value;
    }
  }

  if (result.costs && typeof result.costs === "object") {
    const nestedCandidates = [
      result.costs.cost,
      result.costs.totalCost,
      result.costs.amount,
      result.costs.totalAmount,
      result.costs.actualCost,
    ];

    for (const candidate of nestedCandidates) {
      const value = toFiniteNumber(candidate);

      if (value !== null && value >= 0) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Extract currency from provider response.
 *
 * Never assumes USD/INR or any other currency when the provider
 * does not explicitly return one.
 *
 * @param {object} result
 * @returns {string|null}
 */
function extractCurrency(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const candidates = [
    result.currency,
    result.currencyCode,
    result.costCurrency,
    result.costs?.currency,
    result.costs?.currencyCode,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().toUpperCase();
    }
  }

  return null;
}

/**
 * Extract billing period.
 *
 * @param {object} result
 * @returns {object|null}
 */
function extractPeriod(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const period = result.period || result.costPeriod;

  if (!period || typeof period !== "object") {
    return null;
  }

  const start =
    period.start ||
    period.startDate ||
    period.from ||
    null;

  const end =
    period.end ||
    period.endDate ||
    period.to ||
    null;

  let normalizedStart = null;
  let normalizedEnd = null;

  if (start !== null) {
    try {
      normalizedStart = normalizeDate(start, "period.start");
    } catch {
      normalizedStart = null;
    }
  }

  if (end !== null) {
    try {
      normalizedEnd = normalizeDate(end, "period.end");
    } catch {
      normalizedEnd = null;
    }
  }

  if (!normalizedStart && !normalizedEnd) {
    return null;
  }

  return {
    start: normalizedStart || null,
    end: normalizedEnd || null,
  };
}

/**
 * Extract source information.
 *
 * @param {object} result
 * @param {string} provider
 * @returns {object}
 */
function extractSource(result, provider) {
  const source =
    result?.source && typeof result.source === "object"
      ? result.source
      : {};

  return {
    provider,
    service:
      typeof source.service === "string"
        ? source.service
        : provider,
    system:
      typeof source.system === "string"
        ? source.system
        : null,
    endpoint:
      typeof source.endpoint === "string"
        ? source.endpoint
        : null,
    report:
      typeof source.report === "string"
        ? source.report
        : null,
  };
}

/**
 * Normalize one provider cost response.
 *
 * @param {string} provider
 * @param {object} result
 * @returns {object}
 */
function normalizeCostResult(provider, result) {
  const retrievedAt =
    result?.retrievedAt instanceof Date
      ? result.retrievedAt.toISOString()
      : typeof result?.retrievedAt === "string"
        ? result.retrievedAt
        : new Date().toISOString();

  const dataStatus =
    typeof result?.dataStatus === "string"
      ? result.dataStatus
      : DATA_STATUS.VERIFIED;

  const cost = extractCost(result);
  const currency = extractCurrency(result);
  const period = extractPeriod(result);
  const source = extractSource(result, provider);

  const hasRealCost =
    cost !== null &&
    currency !== null &&
    dataStatus === DATA_STATUS.VERIFIED;

  return {
    provider,
    dataStatus,
    available:
      result?.available === true && hasRealCost,
    cost: hasRealCost ? cost : null,
    currency: hasRealCost ? currency : null,
    period,
    source,
    retrievedAt,
    providerData:
      result?.providerData &&
      typeof result.providerData === "object"
        ? result.providerData
        : null,
    reason:
      hasRealCost
        ? null
        : result?.reason ||
          "Verified cost data is unavailable from the provider",
  };
}

/**
 * Fetch real cost information for one provider.
 *
 * @param {string} provider
 * @param {object} options
 * @returns {Promise<object>}
 */
async function monitorProviderCost(provider, options = {}) {
  const normalizedProvider = String(provider)
    .trim()
    .toLowerCase();

  const adapter = getProvider(normalizedProvider);

  if (!adapter) {
    return {
      provider: normalizedProvider,
      dataStatus: DATA_STATUS.NOT_CONFIGURED,
      available: false,
      cost: null,
      currency: null,
      period: null,
      source: {
        provider: normalizedProvider,
        service: normalizedProvider,
        system: null,
        endpoint: null,
        report: null,
      },
      retrievedAt: new Date().toISOString(),
      providerData: null,
      reason: "No real provider adapter is registered",
    };
  }

  if (typeof adapter.getCosts !== "function") {
    return {
      provider: normalizedProvider,
      dataStatus: DATA_STATUS.UNAVAILABLE,
      available: false,
      cost: null,
      currency: null,
      period: null,
      source: {
        provider: normalizedProvider,
        service: normalizedProvider,
        system: null,
        endpoint: null,
        report: null,
      },
      retrievedAt: new Date().toISOString(),
      providerData: null,
      reason: "Provider cost retrieval is not implemented",
    };
  }

  const result = await getProviderCosts(
    normalizedProvider,
    options
  );

  return normalizeCostResult(
    normalizedProvider,
    result
  );
}

/**
 * Detect an abnormal increase based ONLY on supplied real
 * current and previous cost values.
 *
 * @param {number|null} currentCost
 * @param {number|null} previousCost
 * @param {number} multiplier
 * @returns {object}
 */
function detectCostAnomaly(
  currentCost,
  previousCost,
  multiplier = DEFAULT_ANOMALY_MULTIPLIER
) {
  const current = toFiniteNumber(currentCost);
  const previous = toFiniteNumber(previousCost);
  const threshold = toFiniteNumber(multiplier);

  if (
    current === null ||
    previous === null ||
    previous <= 0 ||
    threshold === null ||
    threshold <= 0
  ) {
    return {
      detected: false,
      comparable: false,
      reason:
        "Insufficient verified cost history for anomaly detection",
      increaseRatio: null,
    };
  }

  const increaseRatio = current / previous;

  return {
    detected: increaseRatio >= threshold,
    comparable: true,
    reason:
      increaseRatio >= threshold
        ? "Current verified cost is above the configured anomaly threshold"
        : "No configured cost anomaly detected",
    increaseRatio,
  };
}

/**
 * Calculate a total ONLY when all values use the same currency.
 *
 * Mixed currencies are never silently combined.
 *
 * @param {Array<object>} results
 * @returns {object}
 */
function calculateTotal(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      available: false,
      total: null,
      currency: null,
      providerCount: 0,
      reason: "No provider cost data available",
    };
  }

  const valid = results.filter(
    (result) =>
      result &&
      result.available === true &&
      typeof result.cost === "number" &&
      Number.isFinite(result.cost) &&
      typeof result.currency === "string" &&
      result.currency
  );

  if (valid.length === 0) {
    return {
      available: false,
      total: null,
      currency: null,
      providerCount: 0,
      reason: "No verified provider costs are available",
    };
  }

  const currencies = [
    ...new Set(
      valid.map((result) => result.currency)
    ),
  ];

  if (currencies.length !== 1) {
    return {
      available: false,
      total: null,
      currency: null,
      providerCount: valid.length,
      reason:
        "Provider costs use different currencies and cannot be safely combined",
    };
  }

  const total = valid.reduce(
    (sum, result) => sum + result.cost,
    0
  );

  return {
    available: true,
    total,
    currency: currencies[0],
    providerCount: valid.length,
    reason: null,
  };
}

/**
 * Main Cost Monitor Agent.
 *
 * Example:
 *
 * await costMonitorAgent({
 *   providers: ["aws", "openai"],
 *   startDate: "...",
 *   endDate: "..."
 * });
 *
 * @param {object} input
 * @returns {Promise<object>}
 */
async function costMonitorAgent(input = {}) {
  if (!input || typeof input !== "object") {
    throw new TypeError(
      "costMonitorAgent input must be an object"
    );
  }

  const providers = normalizeProviders(
    input.providers
  );

  const startDate = normalizeDate(
    input.startDate,
    "startDate"
  );

  const endDate = normalizeDate(
    input.endDate,
    "endDate"
  );

  if (startDate && endDate) {
    if (
      new Date(startDate).getTime() >
      new Date(endDate).getTime()
    ) {
      throw new Error(
        "startDate cannot be later than endDate"
      );
    }
  }

  const providerOptions = {
    startDate,
    endDate,
    period: input.period || null,
    accountId: input.accountId || null,
    projectId: input.projectId || null,
  };

  const results = [];

  for (const provider of providers) {
    results.push(
      await monitorProviderCost(
        provider,
        providerOptions
      )
    );
  }

  const total = calculateTotal(results);

  const anomalyResults = [];

  if (Array.isArray(input.previousCosts)) {
    for (const current of results) {
      const previous = input.previousCosts.find(
        (item) =>
          item &&
          typeof item.provider === "string" &&
          item.provider.trim().toLowerCase() ===
            current.provider
      );

      if (!previous) {
        continue;
      }

      anomalyResults.push({
        provider: current.provider,
        ...detectCostAnomaly(
          current.cost,
          previous.cost,
          input.anomalyMultiplier ??
            DEFAULT_ANOMALY_MULTIPLIER
        ),
      });
    }
  }

  const availableProviders = results.filter(
    (result) => result.available
  ).length;

  const unavailableProviders =
    results.length - availableProviders;

  return {
    success: true,

    data: {
      generatedAt: new Date().toISOString(),

      providers: results,

      summary: {
        requestedProviders: results.length,
        availableProviders,
        unavailableProviders,

        totalCost: total.available
          ? total.total
          : null,

        currency: total.available
          ? total.currency
          : null,

        totalStatus: total.available
          ? DATA_STATUS.VERIFIED
          : DATA_STATUS.UNAVAILABLE,
      },

      anomalies: anomalyResults,

      reliability: {
        verifiedProviderCount:
          availableProviders,

        unverifiedProviderCount:
          unavailableProviders,

        hasCompleteProviderCoverage:
          results.length > 0 &&
          availableProviders === results.length,
      },
    },
  };
}

/**
 * Convenience helper for a single provider.
 *
 * @param {string} provider
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getProviderCost(
  provider,
  options = {}
) {
  return monitorProviderCost(
    provider,
    options
  );
}

module.exports = costMonitorAgent;

module.exports.costMonitorAgent =
  costMonitorAgent;

module.exports.monitorProviderCost =
  monitorProviderCost;

module.exports.getProviderCost =
  getProviderCost;

module.exports.detectCostAnomaly =
  detectCostAnomaly;

module.exports.calculateTotal =
  calculateTotal;

module.exports.normalizeCostResult =
  normalizeCostResult;
