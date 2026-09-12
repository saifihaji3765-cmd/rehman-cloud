"use strict";

/**
 * ZyrionOS Financial Control System
 * Usage Monitor Agent
 *
 * Responsibilities:
 * - Collect REAL usage data from registered provider adapters.
 * - Normalize usage into a common structure.
 * - Track API requests, tokens and provider-specific usage
 *   when the provider actually supplies those values.
 * - Never invent usage, quotas, balances or remaining credits.
 * - Preserve provider/source metadata and retrieval timestamps.
 *
 * IMPORTANT:
 * - No API keys are stored in this file.
 * - No fake/demo usage.
 * - No hardcoded provider quotas.
 * - Missing provider data remains null/unavailable.
 */

const {
  PROVIDER_NAMES,
  DATA_STATUS,
  getProvider,
  getProviderUsage,
} = require("./providerRegistry");

const SUPPORTED_PROVIDERS = Object.freeze(
  Object.values(PROVIDER_NAMES)
);

const MAX_PROVIDER_COUNT = 20;

/**
 * Convert a value to a finite non-negative number.
 *
 * Invalid values become null instead of being guessed.
 *
 * @param {*} value
 * @returns {number|null}
 */
function toNonNegativeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * Normalize provider list.
 *
 * @param {string|string[]|undefined} providers
 * @returns {string[]}
 */
function normalizeProviders(providers) {
  if (providers === undefined || providers === null) {
    return [...SUPPORTED_PROVIDERS];
  }

  const input = Array.isArray(providers)
    ? providers
    : [providers];

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
 * Normalize date.
 *
 * @param {*} value
 * @param {string} fieldName
 * @returns {string|undefined}
 */
function normalizeDate(value, fieldName) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `${fieldName} must be a valid date`
    );
  }

  return date.toISOString();
}

/**
 * Extract request count from REAL provider response.
 *
 * @param {object} result
 * @returns {number|null}
 */
function extractRequestCount(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const candidates = [
    result.requests,
    result.requestCount,
    result.apiRequests,
    result.totalRequests,
    result.usage?.requests,
    result.usage?.requestCount,
    result.usage?.apiRequests,
    result.usage?.totalRequests,
  ];

  for (const candidate of candidates) {
    const value = toNonNegativeNumber(candidate);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

/**
 * Extract input tokens.
 *
 * @param {object} result
 * @returns {number|null}
 */
function extractInputTokens(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const candidates = [
    result.inputTokens,
    result.promptTokens,
    result.input_token_count,
    result.usage?.inputTokens,
    result.usage?.promptTokens,
    result.usage?.input_token_count,
    result.tokens?.input,
    result.tokens?.prompt,
  ];

  for (const candidate of candidates) {
    const value = toNonNegativeNumber(candidate);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

/**
 * Extract output tokens.
 *
 * @param {object} result
 * @returns {number|null}
 */
function extractOutputTokens(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const candidates = [
    result.outputTokens,
    result.completionTokens,
    result.output_token_count,
    result.usage?.outputTokens,
    result.usage?.completionTokens,
    result.usage?.output_token_count,
    result.tokens?.output,
    result.tokens?.completion,
  ];

  for (const candidate of candidates) {
    const value = toNonNegativeNumber(candidate);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

/**
 * Extract total tokens.
 *
 * If provider gives total tokens directly, use it.
 * Otherwise derive it ONLY when both input and output are real.
 *
 * @param {object} result
 * @param {number|null} inputTokens
 * @param {number|null} outputTokens
 * @returns {number|null}
 */
function extractTotalTokens(
  result,
  inputTokens,
  outputTokens
) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const candidates = [
    result.totalTokens,
    result.tokensUsed,
    result.usage?.totalTokens,
    result.usage?.tokensUsed,
    result.tokens?.total,
  ];

  for (const candidate of candidates) {
    const value = toNonNegativeNumber(candidate);

    if (value !== null) {
      return value;
    }
  }

  if (
    inputTokens !== null &&
    outputTokens !== null
  ) {
    return inputTokens + outputTokens;
  }

  return null;
}

/**
 * Extract image/video/audio/general units where a provider
 * exposes such usage.
 *
 * @param {object} result
 * @returns {object}
 */
function extractProviderUnits(result) {
  if (!result || typeof result !== "object") {
    return {};
  }

  const source =
    result.units &&
    typeof result.units === "object"
      ? result.units
      : result.usage?.units &&
          typeof result.usage.units === "object"
        ? result.usage.units
        : {};

  const units = {};

  for (const [key, value] of Object.entries(source)) {
    const normalizedValue =
      toNonNegativeNumber(value);

    if (normalizedValue !== null) {
      units[String(key)] = normalizedValue;
    }
  }

  return units;
}

/**
 * Extract provider/model information.
 *
 * @param {object} result
 * @returns {object}
 */
function extractModelInformation(result) {
  if (!result || typeof result !== "object") {
    return {
      model: null,
      models: [],
    };
  }

  const model =
    typeof result.model === "string" &&
    result.model.trim()
      ? result.model.trim()
      : null;

  const models = Array.isArray(result.models)
    ? [
        ...new Set(
          result.models
            .filter(
              (item) =>
                typeof item === "string" &&
                item.trim()
            )
            .map((item) => item.trim())
        ),
      ]
    : [];

  return {
    model,
    models,
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
    result?.source &&
    typeof result.source === "object"
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
 * Extract usage period.
 *
 * @param {object} result
 * @returns {object|null}
 */
function extractPeriod(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const period =
    result.period ||
    result.usagePeriod ||
    result.billingPeriod;

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
      normalizedStart = normalizeDate(
        start,
        "period.start"
      );
    } catch {
      normalizedStart = null;
    }
  }

  if (end !== null) {
    try {
      normalizedEnd = normalizeDate(
        end,
        "period.end"
      );
    } catch {
      normalizedEnd = null;
    }
  }

  if (!normalizedStart && !normalizedEnd) {
    return null;
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
  };
}

/**
 * Extract quota information ONLY when the provider
 * explicitly supplies it.
 *
 * @param {object} result
 * @returns {object}
 */
function extractQuota(result) {
  if (!result || typeof result !== "object") {
    return {
      limit: null,
      used: null,
      remaining: null,
      resetAt: null,
      unit: null,
    };
  }

  const quota =
    result.quota &&
    typeof result.quota === "object"
      ? result.quota
      : result.usage?.quota &&
          typeof result.usage.quota === "object"
        ? result.usage.quota
        : null;

  if (!quota) {
    return {
      limit: null,
      used: null,
      remaining: null,
      resetAt: null,
      unit: null,
    };
  }

  let resetAt = null;

  if (quota.resetAt) {
    try {
      resetAt = normalizeDate(
        quota.resetAt,
        "quota.resetAt"
      );
    } catch {
      resetAt = null;
    }
  }

  return {
    limit: toNonNegativeNumber(
      quota.limit
    ),
    used: toNonNegativeNumber(
      quota.used
    ),
    remaining: toNonNegativeNumber(
      quota.remaining
    ),
    resetAt,
    unit:
      typeof quota.unit === "string" &&
      quota.unit.trim()
        ? quota.unit.trim()
        : null,
  };
}

/**
 * Normalize a provider usage response.
 *
 * @param {string} provider
 * @param {object} result
 * @returns {object}
 */
function normalizeUsageResult(
  provider,
  result
) {
  const inputTokens =
    extractInputTokens(result);

  const outputTokens =
    extractOutputTokens(result);

  const totalTokens =
    extractTotalTokens(
      result,
      inputTokens,
      outputTokens
    );

  const requests =
    extractRequestCount(result);

  const units =
    extractProviderUnits(result);

  const quota =
    extractQuota(result);

  const modelInformation =
    extractModelInformation(result);

  const dataStatus =
    typeof result?.dataStatus === "string"
      ? result.dataStatus
      : DATA_STATUS.VERIFIED;

  const hasVerifiedUsage =
    dataStatus === DATA_STATUS.VERIFIED &&
    (
      requests !== null ||
      inputTokens !== null ||
      outputTokens !== null ||
      totalTokens !== null ||
      Object.keys(units).length > 0
    );

  const retrievedAt =
    result?.retrievedAt instanceof Date
      ? result.retrievedAt.toISOString()
      : typeof result?.retrievedAt === "string"
        ? result.retrievedAt
        : new Date().toISOString();

  return {
    provider,

    dataStatus,

    available:
      result?.available === true &&
      hasVerifiedUsage,

    usage: hasVerifiedUsage
      ? {
          requests,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens,
          },
          units,
        }
      : null,

    quota,

    model: modelInformation.model,

    models: modelInformation.models,

    period: extractPeriod(result),

    source: extractSource(
      result,
      provider
    ),

    retrievedAt,

    providerData:
      result?.providerData &&
      typeof result.providerData === "object"
        ? result.providerData
        : null,

    reason:
      hasVerifiedUsage
        ? null
        : result?.reason ||
          "Verified usage data is unavailable from the provider",
  };
}

/**
 * Monitor one provider.
 *
 * @param {string} provider
 * @param {object} options
 * @returns {Promise<object>}
 */
async function monitorProviderUsage(
  provider,
  options = {}
) {
  const normalizedProvider =
    String(provider)
      .trim()
      .toLowerCase();

  const adapter =
    getProvider(normalizedProvider);

  if (!adapter) {
    return {
      provider: normalizedProvider,
      dataStatus:
        DATA_STATUS.NOT_CONFIGURED,
      available: false,
      usage: null,
      quota: {
        limit: null,
        used: null,
        remaining: null,
        resetAt: null,
        unit: null,
      },
      model: null,
      models: [],
      period: null,
      source: {
        provider: normalizedProvider,
        service: normalizedProvider,
        system: null,
        endpoint: null,
        report: null,
      },
      retrievedAt:
        new Date().toISOString(),
      providerData: null,
      reason:
        "No real provider adapter is registered",
    };
  }

  if (
    typeof adapter.getUsage !== "function"
  ) {
    return {
      provider: normalizedProvider,
      dataStatus:
        DATA_STATUS.UNAVAILABLE,
      available: false,
      usage: null,
      quota: {
        limit: null,
        used: null,
        remaining: null,
        resetAt: null,
        unit: null,
      },
      model: null,
      models: [],
      period: null,
      source: {
        provider: normalizedProvider,
        service: normalizedProvider,
        system: null,
        endpoint: null,
        report: null,
      },
      retrievedAt:
        new Date().toISOString(),
      providerData: null,
      reason:
        "Provider usage retrieval is not implemented",
    };
  }

  const result =
    await getProviderUsage(
      normalizedProvider,
      options
    );

  return normalizeUsageResult(
    normalizedProvider,
    result
  );
}

/**
 * Calculate aggregate usage.
 *
 * Only combines values that are actually available.
 * Missing provider values remain unavailable.
 *
 * @param {Array<object>} results
 * @returns {object}
 */
function calculateAggregateUsage(results) {
  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    return {
      requestCount: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      providerCount: 0,
    };
  }

  const validResults =
    results.filter(
      (result) =>
        result &&
        result.available === true &&
        result.usage
    );

  if (validResults.length === 0) {
    return {
      requestCount: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      providerCount: 0,
    };
  }

  function sumNullable(values) {
    const valid = values.filter(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value)
    );

    if (valid.length === 0) {
      return null;
    }

    return valid.reduce(
      (sum, value) => sum + value,
      0
    );
  }

  return {
    requestCount: sumNullable(
      validResults.map(
        (result) =>
          result.usage.requests
      )
    ),

    inputTokens: sumNullable(
      validResults.map(
        (result) =>
          result.usage.tokens.input
      )
    ),

    outputTokens: sumNullable(
      validResults.map(
        (result) =>
          result.usage.tokens.output
      )
    ),

    totalTokens: sumNullable(
      validResults.map(
        (result) =>
          result.usage.tokens.total
      )
    ),

    providerCount:
      validResults.length,
  };
}

/**
 * Main Usage Monitor Agent.
 *
 * Example:
 *
 * await usageMonitorAgent({
 *   providers: ["openai", "aws"],
 *   startDate: "...",
 *   endDate: "..."
 * });
 *
 * @param {object} input
 * @returns {Promise<object>}
 */
async function usageMonitorAgent(
  input = {}
) {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new TypeError(
      "usageMonitorAgent input must be an object"
    );
  }

  const providers =
    normalizeProviders(
      input.providers
    );

  const startDate =
    normalizeDate(
      input.startDate,
      "startDate"
    );

  const endDate =
    normalizeDate(
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
    period:
      input.period || null,
    accountId:
      input.accountId || null,
    projectId:
      input.projectId || null,
    model:
      input.model || null,
  };

  const results = [];

  for (const provider of providers) {
    results.push(
      await monitorProviderUsage(
        provider,
        providerOptions
      )
    );
  }

  const aggregate =
    calculateAggregateUsage(
      results
    );

  const availableProviders =
    results.filter(
      (result) =>
        result.available === true
    ).length;

  const unavailableProviders =
    results.length -
    availableProviders;

  return {
    success: true,

    data: {
      generatedAt:
        new Date().toISOString(),

      providers: results,

      summary: {
        requestedProviders:
          results.length,

        availableProviders,

        unavailableProviders,

        requests:
          aggregate.requestCount,

        inputTokens:
          aggregate.inputTokens,

        outputTokens:
          aggregate.outputTokens,

        totalTokens:
          aggregate.totalTokens,

        usageStatus:
          availableProviders > 0
            ? DATA_STATUS.VERIFIED
            : DATA_STATUS.UNAVAILABLE,
      },

      reliability: {
        verifiedProviderCount:
          availableProviders,

        unverifiedProviderCount:
          unavailableProviders,

        hasCompleteProviderCoverage:
          results.length > 0 &&
          availableProviders ===
            results.length,
      },
    },
  };
}

/**
 * Convenience helper for one provider.
 *
 * @param {string} provider
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getProviderUsageData(
  provider,
  options = {}
) {
  return monitorProviderUsage(
    provider,
    options
  );
}

module.exports =
  usageMonitorAgent;

module.exports.usageMonitorAgent =
  usageMonitorAgent;

module.exports.monitorProviderUsage =
  monitorProviderUsage;

module.exports.getProviderUsageData =
  getProviderUsageData;

module.exports.normalizeUsageResult =
  normalizeUsageResult;

module.exports.calculateAggregateUsage =
  calculateAggregateUsage;
