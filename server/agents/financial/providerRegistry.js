"use strict";

/**
 * ZyrionOS Financial Control System
 * Provider Registry
 *
 * Purpose:
 * - Keep a single registry of external financial/usage providers.
 * - Define what data each provider is expected to supply.
 * - Prevent agents from inventing provider data.
 * - Provide a consistent provider status contract.
 *
 * IMPORTANT:
 * This file does NOT contain API keys.
 * This file does NOT contain fake balances/costs/usage.
 * This file does NOT claim that a provider supports an operation
 * unless an actual adapter is registered for it.
 */

const PROVIDER_NAMES = Object.freeze({
  OPENAI: "openai",
  AWS: "aws",
  WHATSAPP: "whatsapp",
  STRIPE: "stripe",
  RAZORPAY: "razorpay",
});

const PROVIDER_STATUS = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  NOT_CONFIGURED: "not_configured",
  ERROR: "error",
  DISABLED: "disabled",
});

const DATA_STATUS = Object.freeze({
  VERIFIED: "verified",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
  NOT_CONFIGURED: "not_configured",
});

const registry = new Map();

/**
 * Validate provider name.
 *
 * @param {string} provider
 * @returns {string}
 */
function normalizeProviderName(provider) {
  if (typeof provider !== "string") {
    throw new TypeError("Provider name must be a string");
  }

  const normalized = provider.trim().toLowerCase();

  if (!normalized) {
    throw new TypeError("Provider name cannot be empty");
  }

  return normalized;
}

/**
 * Register a provider adapter.
 *
 * An adapter is expected to expose:
 *
 * {
 *   name: "provider-name",
 *   capabilities: [...],
 *   healthCheck: async () => ({...}),
 *   getUsage: async (...) => ({...}),
 *   getCosts: async (...) => ({...})
 * }
 *
 * No provider is considered usable merely because it exists
 * in PROVIDER_NAMES. A real adapter must be registered.
 *
 * @param {object} adapter
 * @returns {object}
 */
function registerProvider(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Provider adapter is required");
  }

  const name = normalizeProviderName(adapter.name);

  if (!Object.values(PROVIDER_NAMES).includes(name)) {
    throw new Error(`Unsupported provider: ${name}`);
  }

  if (
    adapter.healthCheck !== undefined &&
    typeof adapter.healthCheck !== "function"
  ) {
    throw new TypeError(
      `Provider ${name}: healthCheck must be a function`
    );
  }

  if (
    adapter.getUsage !== undefined &&
    typeof adapter.getUsage !== "function"
  ) {
    throw new TypeError(
      `Provider ${name}: getUsage must be a function`
    );
  }

  if (
    adapter.getCosts !== undefined &&
    typeof adapter.getCosts !== "function"
  ) {
    throw new TypeError(
      `Provider ${name}: getCosts must be a function`
    );
  }

  const capabilities = Array.isArray(adapter.capabilities)
    ? [...new Set(adapter.capabilities.map(String))]
    : [];

  const registeredAdapter = Object.freeze({
    ...adapter,
    name,
    capabilities: Object.freeze(capabilities),
    registeredAt: new Date(),
  });

  registry.set(name, registeredAdapter);

  return registeredAdapter;
}

/**
 * Remove a provider adapter.
 *
 * Useful for controlled shutdown/testing of the provider layer.
 *
 * @param {string} provider
 * @returns {boolean}
 */
function unregisterProvider(provider) {
  const name = normalizeProviderName(provider);
  return registry.delete(name);
}

/**
 * Check whether a real provider adapter is registered.
 *
 * @param {string} provider
 * @returns {boolean}
 */
function hasProvider(provider) {
  const name = normalizeProviderName(provider);
  return registry.has(name);
}

/**
 * Get a registered provider adapter.
 *
 * @param {string} provider
 * @returns {object|null}
 */
function getProvider(provider) {
  const name = normalizeProviderName(provider);
  return registry.get(name) || null;
}

/**
 * Return registered providers without exposing credentials.
 *
 * @returns {Array<object>}
 */
function listProviders() {
  return Array.from(registry.values()).map((provider) => ({
    name: provider.name,
    capabilities: [...provider.capabilities],
    registeredAt: provider.registeredAt,
  }));
}

/**
 * Safely execute a provider health check.
 *
 * A missing adapter is NOT treated as healthy.
 *
 * @param {string} provider
 * @returns {Promise<object>}
 */
async function checkProviderHealth(provider) {
  const name = normalizeProviderName(provider);
  const adapter = registry.get(name);

  if (!adapter) {
    return {
      provider: name,
      status: PROVIDER_STATUS.NOT_CONFIGURED,
      dataStatus: DATA_STATUS.NOT_CONFIGURED,
      available: false,
      reason: "No real provider adapter is registered",
      checkedAt: new Date(),
    };
  }

  if (typeof adapter.healthCheck !== "function") {
    return {
      provider: name,
      status: PROVIDER_STATUS.UNAVAILABLE,
      dataStatus: DATA_STATUS.UNAVAILABLE,
      available: false,
      reason: "Provider health check is not implemented",
      checkedAt: new Date(),
    };
  }

  try {
    const result = await adapter.healthCheck();

    if (!result || typeof result !== "object") {
      return {
        provider: name,
        status: PROVIDER_STATUS.ERROR,
        dataStatus: DATA_STATUS.ERROR,
        available: false,
        reason: "Provider returned an invalid health response",
        checkedAt: new Date(),
      };
    }

    return {
      provider: name,
      ...result,
      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      provider: name,
      status: PROVIDER_STATUS.ERROR,
      dataStatus: DATA_STATUS.ERROR,
      available: false,
      reason: error?.message || "Provider health check failed",
      checkedAt: new Date(),
    };
  }
}

/**
 * Execute a provider usage request.
 *
 * No fallback number is generated when the provider cannot
 * return real data.
 *
 * @param {string} provider
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getProviderUsage(provider, options = {}) {
  const name = normalizeProviderName(provider);
  const adapter = registry.get(name);

  if (!adapter) {
    return {
      provider: name,
      dataStatus: DATA_STATUS.NOT_CONFIGURED,
      available: false,
      usage: null,
      reason: "No real provider adapter is registered",
      retrievedAt: new Date(),
    };
  }

  if (typeof adapter.getUsage !== "function") {
    return {
      provider: name,
      dataStatus: DATA_STATUS.UNAVAILABLE,
      available: false,
      usage: null,
      reason: "Provider usage API is not implemented",
      retrievedAt: new Date(),
    };
  }

  try {
    const result = await adapter.getUsage(options);

    if (!result || typeof result !== "object") {
      return {
        provider: name,
        dataStatus: DATA_STATUS.ERROR,
        available: false,
        usage: null,
        reason: "Provider returned an invalid usage response",
        retrievedAt: new Date(),
      };
    }

    return {
      provider: name,
      ...result,
      retrievedAt: new Date(),
    };
  } catch (error) {
    return {
      provider: name,
      dataStatus: DATA_STATUS.ERROR,
      available: false,
      usage: null,
      reason: error?.message || "Provider usage request failed",
      retrievedAt: new Date(),
    };
  }
}

/**
 * Execute a provider cost request.
 *
 * Cost is returned ONLY when the real adapter supplies it.
 *
 * @param {string} provider
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getProviderCosts(provider, options = {}) {
  const name = normalizeProviderName(provider);
  const adapter = registry.get(name);

  if (!adapter) {
    return {
      provider: name,
      dataStatus: DATA_STATUS.NOT_CONFIGURED,
      available: false,
      costs: null,
      reason: "No real provider adapter is registered",
      retrievedAt: new Date(),
    };
  }

  if (typeof adapter.getCosts !== "function") {
    return {
      provider: name,
      dataStatus: DATA_STATUS.UNAVAILABLE,
      available: false,
      costs: null,
      reason: "Provider cost API is not implemented",
      retrievedAt: new Date(),
    };
  }

  try {
    const result = await adapter.getCosts(options);

    if (!result || typeof result !== "object") {
      return {
        provider: name,
        dataStatus: DATA_STATUS.ERROR,
        available: false,
        costs: null,
        reason: "Provider returned an invalid cost response",
        retrievedAt: new Date(),
      };
    }

    return {
      provider: name,
      ...result,
      retrievedAt: new Date(),
    };
  } catch (error) {
    return {
      provider: name,
      dataStatus: DATA_STATUS.ERROR,
      available: false,
      costs: null,
      reason: error?.message || "Provider cost request failed",
      retrievedAt: new Date(),
    };
  }
}

/**
 * Return all known provider identifiers.
 *
 * @returns {object}
 */
function getProviderNames() {
  return { ...PROVIDER_NAMES };
}

/**
 * Return provider status constants.
 *
 * @returns {object}
 */
function getProviderStatuses() {
  return { ...PROVIDER_STATUS };
}

/**
 * Return data status constants.
 *
 * @returns {object}
 */
function getDataStatuses() {
  return { ...DATA_STATUS };
}

module.exports = {
  PROVIDER_NAMES,
  PROVIDER_STATUS,
  DATA_STATUS,

  registerProvider,
  unregisterProvider,
  hasProvider,
  getProvider,
  listProviders,

  checkProviderHealth,
  getProviderUsage,
  getProviderCosts,

  getProviderNames,
  getProviderStatuses,
  getDataStatuses,
};
