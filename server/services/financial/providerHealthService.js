"use strict";

const providerRegistry = require("../../agents/financial/providerRegistry");

const DEFAULT_PROVIDERS = [
  "openai",
  "aws",
  "whatsapp",
  "stripe",
  "razorpay"
];

const ALLOWED_STATUSES = new Set([
  "available",
  "unavailable",
  "not_configured",
  "error",
  "disabled",
  "unknown"
]);

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

function normalizeStatus(value) {
  const status = safeString(value, 100);

  if (!status) {
    return "unknown";
  }

  const normalized = status.toLowerCase();

  return ALLOWED_STATUSES.has(normalized)
    ? normalized
    : "unknown";
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeProviderName(provider) {
  return safeString(provider, 100)
    ?.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "") || null;
}

function getProviderList(input = {}) {
  if (Array.isArray(input.providers)) {
    return [
      ...new Set(
        input.providers
          .map(normalizeProviderName)
          .filter(Boolean)
      )
    ].slice(0, 50);
  }

  return DEFAULT_PROVIDERS.slice();
}

function extractHealthResult(result) {
  if (!isObject(result)) {
    return {
      status: "unknown",
      available: false,
      source: null,
      retrievedAt: null,
      message: null
    };
  }

  const data =
    isObject(result.data)
      ? result.data
      : result;

  const status =
    normalizeStatus(
      data.status ||
      result.status
    );

  let available = null;

  if (
    typeof data.available === "boolean"
  ) {
    available = data.available;
  } else if (
    typeof result.available === "boolean"
  ) {
    available = result.available;
  } else if (
    status === "available"
  ) {
    available = true;
  } else if (
    [
      "unavailable",
      "not_configured",
      "disabled",
      "error"
    ].includes(status)
  ) {
    available = false;
  }

  return {
    status,

    available,

    source:
      safeString(
        data.source ||
        result.source,
        500
      ),

    retrievedAt:
      normalizeTimestamp(
        data.retrievedAt ||
        result.retrievedAt
      ),

    checkedAt:
      normalizeTimestamp(
        data.checkedAt ||
        result.checkedAt
      ),

    message:
      safeString(
        data.message ||
        result.message,
        1000
      ),

    errorCode:
      safeString(
        data.errorCode ||
        result.errorCode,
        200
      )
  };
}

/**
 * Try to obtain the registered provider entry without assuming
 * a particular adapter implementation.
 */
function getRegistryProvider(provider) {
  if (!providerRegistry) {
    return null;
  }

  try {
    if (
      typeof providerRegistry.get ===
      "function"
    ) {
      return providerRegistry.get(
        provider
      );
    }

    if (
      typeof providerRegistry.getProvider ===
      "function"
    ) {
      return providerRegistry.getProvider(
        provider
      );
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Execute a real health check exposed by a provider adapter.
 *
 * Supported adapter styles:
 *
 * adapter.health()
 * adapter.healthCheck()
 * adapter.checkHealth()
 *
 * If none exists, the provider is reported as unknown/not_configured.
 *
 * No provider is marked healthy merely because it exists in the registry.
 */
async function checkProvider(provider, input = {}) {
  const normalizedProvider =
    normalizeProviderName(provider);

  if (!normalizedProvider) {
    return {
      provider: null,
      status: "unknown",
      available: false,
      source: null,
      retrievedAt: new Date().toISOString(),
      message: "Invalid provider name."
    };
  }

  const checkedAt =
    new Date().toISOString();

  const registered =
    getRegistryProvider(
      normalizedProvider
    );

  if (!registered) {
    return {
      provider: normalizedProvider,
      status: "not_configured",
      available: false,
      source: "provider_registry",
      retrievedAt: checkedAt,
      checkedAt,
      message:
        "Provider is not registered."
    };
  }

  /*
   * Registry entries may expose the adapter directly
   * or through an adapter property.
   */
  const adapter =
    isObject(registered.adapter)
      ? registered.adapter
      : registered;

  /*
   * A registry-level disabled state must remain disabled.
   */
  const registryStatus =
    normalizeStatus(
      registered.status
    );

  if (
    registryStatus === "disabled"
  ) {
    return {
      provider: normalizedProvider,
      status: "disabled",
      available: false,
      source:
        safeString(
          registered.source,
          500
        ) || "provider_registry",
      retrievedAt: checkedAt,
      checkedAt,
      message:
        "Provider is disabled."
    };
  }

  const healthMethods = [
    "health",
    "healthCheck",
    "checkHealth"
  ];

  const method =
    healthMethods.find(
      (name) =>
        typeof adapter?.[name] ===
        "function"
    );

  /*
   * No real health method means we cannot honestly claim
   * that the provider is healthy.
   */
  if (!method) {
    return {
      provider: normalizedProvider,
      status:
        registryStatus ===
        "not_configured"
          ? "not_configured"
          : "unknown",

      available: false,

      source:
        safeString(
          registered.source,
          500
        ) || "provider_registry",

      retrievedAt: checkedAt,
      checkedAt,

      message:
        "No provider health check is configured."
    };
  }

  try {
    const healthResult =
      await adapter[method](
        input.providerContext || {}
      );

    const normalized =
      extractHealthResult(
        healthResult
      );

    return {
      provider:
        normalizedProvider,

      status:
        normalized.status,

      available:
        normalized.available,

      source:
        normalized.source ||
        safeString(
          registered.source,
          500
        ) ||
        `provider:${normalizedProvider}`,

      retrievedAt:
        normalized.retrievedAt ||
        checkedAt,

      checkedAt,

      message:
        normalized.message,

      errorCode:
        normalized.errorCode
    };
  } catch (error) {
    return {
      provider: normalizedProvider,

      status: "error",

      available: false,

      source:
        safeString(
          registered.source,
          500
        ) ||
        `provider:${normalizedProvider}`,

      retrievedAt: checkedAt,
      checkedAt,

      message:
        safeString(
          error?.message,
          1000
        ) ||
        "Provider health check failed.",

      errorCode:
        safeString(
          error?.code,
          200
        ) ||
        "PROVIDER_HEALTH_CHECK_FAILED"
    };
  }
}

/**
 * Check all requested providers.
 */
async function checkAllProviders(
  input = {}
) {
  const providers =
    getProviderList(input);

  const results = [];

  for (const provider of providers) {
    const result =
      await checkProvider(
        provider,
        input
      );

    results.push(result);
  }

  const available =
    results.filter(
      (item) =>
        item.available === true
    );

  const unavailable =
    results.filter(
      (item) =>
        item.available !== true
    );

  return {
    success: true,
    status:
      results.length === 0
        ? "unavailable"
        : available.length ===
          results.length
          ? "available"
          : available.length > 0
            ? "partial"
            : "unavailable",

    checkedAt:
      new Date().toISOString(),

    providers: results,

    summary: {
      total: results.length,

      available:
        available.length,

      unavailable:
        unavailable.length,

      notConfigured:
        results.filter(
          (item) =>
            item.status ===
            "not_configured"
        ).length,

      errors:
        results.filter(
          (item) =>
            item.status === "error"
        ).length,

      disabled:
        results.filter(
          (item) =>
            item.status === "disabled"
        ).length,

      unknown:
        results.filter(
          (item) =>
            item.status === "unknown"
        ).length
    }
  };
}

/**
 * Return the current registry view without claiming that the
 * providers are healthy.
 */
function getRegisteredProviders() {
  const providers =
    getProviderList({});

  return providers.map(
    (provider) => {
      const registered =
        getRegistryProvider(
          provider
        );

      return {
        provider,

        registered:
          Boolean(registered),

        status:
          registered
            ? normalizeStatus(
                registered.status
              )
            : "not_configured",

        source:
          registered
            ? safeString(
                registered.source,
                500
              )
            : "provider_registry"
      };
    }
  );
}

/**
 * Get one provider's health state.
 */
async function getProviderHealth(
  provider,
  input = {}
) {
  return checkProvider(
    provider,
    input
  );
}

/**
 * Main callable service.
 */
async function providerHealthService(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code: "INVALID_PROVIDER_HEALTH_INPUT",
        message:
          "Provider health input must be an object."
      }
    };
  }

  const operation =
    String(
      input.operation ||
      "check"
    )
      .trim()
      .toLowerCase();

  switch (operation) {
    case "check":
    case "health":
    case "all":
      return checkAllProviders(
        input
      );

    case "provider":
      if (!input.provider) {
        return {
          success: false,
          status: "invalid",
          error: {
            code:
              "PROVIDER_REQUIRED",
            message:
              "provider is required."
          }
        };
      }

      return {
        success: true,
        status: "completed",
        provider:
          await getProviderHealth(
            input.provider,
            input
          )
      };

    case "registry":
      return {
        success: true,
        status: "available",
        providers:
          getRegisteredProviders()
      };

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code:
            "UNSUPPORTED_PROVIDER_HEALTH_OPERATION",
          message:
            `Unsupported provider health operation: ${operation}`
        }
      };
  }
}

providerHealthService.checkProvider =
  checkProvider;

providerHealthService.checkAllProviders =
  checkAllProviders;

providerHealthService.getProviderHealth =
  getProviderHealth;

providerHealthService.getRegisteredProviders =
  getRegisteredProviders;

module.exports =
  providerHealthService;
