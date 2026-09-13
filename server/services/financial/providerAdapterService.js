"use strict";

/*
 * Central financial provider adapter service.
 *
 * Responsibilities:
 * - Resolve registered real provider adapters
 * - Execute provider operations safely
 * - Normalize provider responses
 * - Never invent provider data
 * - Never expose credentials
 * - Require real message IDs for confirmed delivery
 *
 * This service does NOT:
 * - create fake costs
 * - create fake usage
 * - create fake health
 * - process payments itself
 * - expose API keys/secrets
 */

const providerRegistry = require(
  "../../agents/financial/providerRegistry"
);

const providerAdapters = require(
  "./providers"
);

const MAX_RESULT_ITEMS = 500;

const SUPPORTED_PROVIDERS = Object.freeze([
  "openai",
  "aws",
  "whatsapp",
  "stripe",
  "razorpay",
]);

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

  const normalized = String(provider)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || null;
}

function normalizeOperation(operation) {
  if (
    operation === undefined ||
    operation === null
  ) {
    return null;
  }

  const normalized = String(operation)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || null;
}

function safeString(value, max = 1000) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).slice(0, max);
  }

  return null;
}

function safeError(error) {
  if (!error) {
    return null;
  }

  return {
    code:
      safeString(
        error.code ||
          error.name,
        200
      ) ||
      "PROVIDER_OPERATION_FAILED",

    message:
      safeString(
        error.message,
        1000
      ) ||
      "Provider operation failed.",
  };
}

/**
 * Resolve adapter from the new central provider
 * adapter collection.
 */
function getDirectProviderAdapter(
  provider
) {
  const normalized =
    normalizeProvider(provider);

  if (!normalized) {
    return null;
  }

  if (
    !providerAdapters ||
    typeof providerAdapters.getProvider !==
      "function"
  ) {
    return null;
  }

  try {
    return providerAdapters.getProvider(
      normalized
    );
  } catch {
    return null;
  }
}

/**
 * Backward-compatible registry lookup.
 *
 * This allows older registered adapters to keep
 * working while the new real provider adapter
 * collection becomes the primary source.
 */
function getRegistryEntry(provider) {
  const normalized =
    normalizeProvider(provider);

  if (!normalized) {
    return null;
  }

  if (
    typeof providerRegistry?.get ===
    "function"
  ) {
    try {
      return providerRegistry.get(
        normalized
      );
    } catch {
      // Continue to fallback lookup.
    }
  }

  if (
    typeof providerRegistry?.getProvider ===
    "function"
  ) {
    try {
      return providerRegistry.getProvider(
        normalized
      );
    } catch {
      return null;
    }
  }

  return null;
}

function getAdapterFromRegistryEntry(
  entry
) {
  if (!entry) {
    return null;
  }

  if (
    isObject(entry.adapter)
  ) {
    return entry.adapter;
  }

  /*
   * Some registries may directly store the
   * adapter object.
   */
  if (
    typeof entry === "object"
  ) {
    return entry;
  }

  return null;
}

/**
 * Primary adapter resolution:
 *
 * 1. New real provider adapter
 * 2. Existing registry adapter for backward
 *    compatibility
 */
function resolveAdapter(provider) {
  const normalized =
    normalizeProvider(provider);

  if (!normalized) {
    return {
      success: false,
      status: "invalid",
      provider: null,
      adapter: null,
      source: null,
      error: {
        code:
          "PROVIDER_REQUIRED",
        message:
          "Provider is required.",
      },
    };
  }

  if (
    !SUPPORTED_PROVIDERS.includes(
      normalized
    )
  ) {
    return {
      success: false,
      status: "unsupported",
      provider: normalized,
      adapter: null,
      source: null,
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          `Unsupported financial provider: ${normalized}`,
      },
    };
  }

  /*
   * New real adapter collection.
   */
  const directAdapter =
    getDirectProviderAdapter(
      normalized
    );

  if (directAdapter) {
    return {
      success: true,
      status: "available",
      provider: normalized,
      adapter: directAdapter,
      source: "provider_adapters",
      registry: null,
    };
  }

  /*
   * Backward-compatible registry.
   */
  const registryEntry =
    getRegistryEntry(normalized);

  const registryAdapter =
    getAdapterFromRegistryEntry(
      registryEntry
    );

  if (registryAdapter) {
    return {
      success: true,
      status: "available",
      provider: normalized,
      adapter: registryAdapter,
      source: "provider_registry",
      registry: registryEntry,
    };
  }

  return {
    success: false,
    status: "not_configured",
    provider: normalized,
    adapter: null,
    source: null,
    error: {
      code:
        "PROVIDER_ADAPTER_NOT_CONFIGURED",
      message:
        `Provider ${normalized} has no usable adapter.`,
    },
  };
}

/**
 * Public adapter resolver.
 *
 * Credentials are never returned.
 */
function getProviderAdapter(
  provider
) {
  const result =
    resolveAdapter(provider);

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    status: result.status,
    provider: result.provider,
    adapter: result.adapter,
    source: result.source,
  };
}

const OPERATION_ALIASES =
  Object.freeze({
    health: [
      "health",
      "healthCheck",
      "checkHealth",
    ],

    usage: [
      "usage",
      "getUsage",
      "fetchUsage",
      "usageData",
    ],

    costs: [
      "costs",
      "getCosts",
      "fetchCosts",
      "costData",
    ],

    forecast: [
      "forecast",
      "getForecast",
      "fetchForecast",
    ],

    budget: [
      "budget",
      "getBudget",
      "fetchBudget",
    ],

    payment: [
      "payment",
      "createPayment",
      "processPayment",
    ],

    paymentStatus: [
      "paymentStatus",
      "getPaymentStatus",
      "fetchPaymentStatus",
      "getPayment",
    ],

    sendMessage: [
      "sendMessage",
      "sendWhatsAppMessage",
      "send",
    ],

    sendTemplate: [
      "sendTemplate",
      "sendWhatsAppTemplate",
    ],

    verifyWebhook: [
      "verifyWebhook",
      "verifySignature",
      "verify",
    ],
  });

/**
 * Find the actual method implemented by the adapter.
 */
function findMethod(
  adapter,
  operation
) {
  if (!adapter) {
    return null;
  }

  const normalizedOperation =
    normalizeOperation(
      operation
    );

  if (!normalizedOperation) {
    return null;
  }

  const candidates =
    OPERATION_ALIASES[
      normalizedOperation
    ] || [
      normalizedOperation,
    ];

  return (
    candidates.find(
      (method) =>
        typeof adapter[method] ===
        "function"
    ) || null
  );
}

/**
 * Normalize a provider response without
 * manufacturing missing values.
 */
function normalizeAdapterResult(
  provider,
  operation,
  result
) {
  const normalizedProvider =
    normalizeProvider(provider);

  const normalizedOperation =
    normalizeOperation(operation);

  if (!isObject(result)) {
    return {
      success: true,
      status: "available",
      provider:
        normalizedProvider,
      operation:
        normalizedOperation,
      data: result,
      source:
        `provider:${normalizedProvider}`,
      retrievedAt:
        new Date().toISOString(),
    };
  }

  const data =
    isObject(result.data)
      ? result.data
      : result;

  const success =
    typeof result.success ===
    "boolean"
      ? result.success
      : typeof data.success ===
          "boolean"
        ? data.success
        : true;

  const status =
    safeString(
      result.status ||
        data.status,
      100
    ) || "available";

  const source =
    safeString(
      result.source ||
        data.source,
      500
    ) ||
    `provider:${normalizedProvider}`;

  const retrievedAt =
    safeString(
      result.retrievedAt ||
        data.retrievedAt,
      100
    ) ||
    new Date().toISOString();

  const normalized = {
    success,
    status,
    provider:
      normalizedProvider,
    operation:
      normalizedOperation,
    data,
    source,
    retrievedAt,

    message:
      safeString(
        result.message ||
          data.message,
        1000
      ),

    errorCode:
      safeString(
        result.errorCode ||
          data.errorCode,
        200
      ),
  };

  if (result.error) {
    normalized.error =
      isObject(result.error)
        ? {
            code:
              safeString(
                result.error.code,
                200
              ) ||
              "PROVIDER_ERROR",

            message:
              safeString(
                result.error.message,
                1000
              ) ||
              "Provider error.",
          }
        : {
            code:
              "PROVIDER_ERROR",

            message:
              safeString(
                result.error,
                1000
              ) ||
              "Provider error.",
          };
  }

  return normalized;
}

/**
 * Execute one real provider operation.
 */
async function executeProviderOperation(
  provider,
  operation,
  context = {}
) {
  const normalizedProvider =
    normalizeProvider(provider);

  const normalizedOperation =
    normalizeOperation(operation);

  if (!normalizedProvider) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "PROVIDER_REQUIRED",
        message:
          "Provider is required.",
      },
    };
  }

  if (!normalizedOperation) {
    return {
      success: false,
      status: "invalid",
      provider:
        normalizedProvider,
      error: {
        code:
          "OPERATION_REQUIRED",
        message:
          "Provider operation is required.",
      },
    };
  }

  const providerResult =
    resolveAdapter(
      normalizedProvider
    );

  if (!providerResult.success) {
    return providerResult;
  }

  const adapter =
    providerResult.adapter;

  const method =
    findMethod(
      adapter,
      normalizedOperation
    );

  if (!method) {
    return {
      success: false,
      status: "unavailable",
      provider:
        normalizedProvider,
      operation:
        normalizedOperation,
      source:
        providerResult.source,
      error: {
        code:
          "PROVIDER_OPERATION_NOT_CONFIGURED",
        message:
          `Operation ${normalizedOperation} is not configured for ${normalizedProvider}.`,
      },
    };
  }

  /*
   * Only caller-supplied context reaches the adapter.
   * This service never adds credentials.
   */
  const safeContext =
    isObject(context)
      ? context
      : {};

  try {
    const rawResult =
      await adapter[method](
        safeContext
      );

    return normalizeAdapterResult(
      normalizedProvider,
      normalizedOperation,
      rawResult
    );
  } catch (error) {
    return {
      success: false,
      status: "error",
      provider:
        normalizedProvider,
      operation:
        normalizedOperation,
      source:
        providerResult.source ||
        `provider:${normalizedProvider}`,
      retrievedAt:
        new Date().toISOString(),
      error:
        safeError(error),
    };
  }
}

/**
 * Provider health.
 */
async function health(
  provider,
  context = {}
) {
  return executeProviderOperation(
    provider,
    "health",
    context
  );
}

/**
 * Provider usage.
 */
async function usage(
  provider,
  context = {}
) {
  return executeProviderOperation(
    provider,
    "usage",
    context
  );
}

/**
 * Provider costs.
 */
async function costs(
  provider,
  context = {}
) {
  return executeProviderOperation(
    provider,
    "costs",
    context
  );
}

/**
 * Provider forecast.
 */
async function forecast(
  provider,
  context = {}
) {
  return executeProviderOperation(
    provider,
    "forecast",
    context
  );
}

/**
 * Provider budget.
 */
async function budget(
  provider,
  context = {}
) {
  return executeProviderOperation(
    provider,
    "budget",
    context
  );
}

/**
 * Payment status.
 *
 * This does NOT create or execute a payment.
 */
async function paymentStatus(
  provider,
  context = {}
) {
  return executeProviderOperation(
    provider,
    "paymentStatus",
    context
  );
}

/**
 * Send message.
 *
 * A successful delivery requires a real provider
 * message ID.
 */
async function sendMessage(
  provider,
  context = {}
) {
  const result =
    await executeProviderOperation(
      provider,
      "sendMessage",
      context
    );

  if (
    result.success !== true
  ) {
    return result;
  }

  const data =
    isObject(result.data)
      ? result.data
      : {};

  const providerMessageId =
    data.providerMessageId ||
    data.messageId ||
    data.id ||
    result.providerMessageId ||
    result.messageId ||
    null;

  if (!providerMessageId) {
    return {
      success: false,
      status: "unavailable",
      provider:
        normalizeProvider(provider),
      operation:
        "sendMessage",
      source:
        result.source ||
        `provider:${normalizeProvider(
          provider
        )}`,
      retrievedAt:
        result.retrievedAt ||
        new Date().toISOString(),
      error: {
        code:
          "MESSAGE_ID_NOT_RETURNED",
        message:
          "Provider did not return a real message ID.",
      },
    };
  }

  return {
    ...result,
    success: true,
    status: "sent",
    providerMessageId:
      safeString(
        providerMessageId,
        500
      ),
  };
}

/**
 * Send WhatsApp template/message through
 * an adapter that explicitly supports it.
 */
async function sendTemplate(
  provider,
  context = {}
) {
  const result =
    await executeProviderOperation(
      provider,
      "sendTemplate",
      context
    );

  if (
    result.success !== true
  ) {
    return result;
  }

  const data =
    isObject(result.data)
      ? result.data
      : {};

  const providerMessageId =
    data.providerMessageId ||
    data.messageId ||
    data.id ||
    result.providerMessageId ||
    result.messageId ||
    null;

  if (!providerMessageId) {
    return {
      success: false,
      status: "unavailable",
      provider:
        normalizeProvider(provider),
      operation:
        "sendTemplate",
      source:
        result.source ||
        `provider:${normalizeProvider(
          provider
        )}`,
      retrievedAt:
        result.retrievedAt ||
        new Date().toISOString(),
      error: {
        code:
          "MESSAGE_ID_NOT_RETURNED",
        message:
          "Provider did not return a real template message ID.",
      },
    };
  }

  return {
    ...result,
    success: true,
    status: "sent",
    providerMessageId:
      safeString(
        providerMessageId,
        500
      ),
  };
}

/**
 * Verify provider webhook.
 */
async function verifyWebhook(
  provider,
  context = {}
) {
  return executeProviderOperation(
    provider,
    "verifyWebhook",
    context
  );
}

/**
 * Execute one operation against multiple
 * providers.
 */
async function executeAcrossProviders(
  providers,
  operation,
  context = {}
) {
  const requested =
    Array.isArray(providers)
      ? providers
      : SUPPORTED_PROVIDERS;

  const normalizedProviders =
    [
      ...new Set(
        requested
          .map(normalizeProvider)
          .filter(Boolean)
      ),
    ].slice(
      0,
      MAX_RESULT_ITEMS
    );

  if (
    !normalizedProviders.length
  ) {
    return {
      success: false,
      status: "invalid",
      operation:
        normalizeOperation(operation),
      results: [],
      error: {
        code:
          "NO_PROVIDERS_SPECIFIED",
        message:
          "No financial providers were specified.",
      },
    };
  }

  const normalizedOperation =
    normalizeOperation(
      operation
    );

  if (!normalizedOperation) {
    return {
      success: false,
      status: "invalid",
      results: [],
      error: {
        code:
          "OPERATION_REQUIRED",
        message:
          "Provider operation is required.",
      },
    };
  }

  const results = [];

  for (
    const provider
    of normalizedProviders
  ) {
    results.push(
      await executeProviderOperation(
        provider,
        normalizedOperation,
        context
      )
    );
  }

  const successful =
    results.filter(
      (item) =>
        item.success === true
    ).length;

  const failed =
    results.length -
    successful;

  let status = "unavailable";

  if (
    successful ===
    results.length
  ) {
    status = "available";
  } else if (
    successful > 0
  ) {
    status = "partial";
  }

  return {
    success:
      successful > 0,
    status,
    operation:
      normalizedOperation,
    providerCount:
      results.length,
    successfulProviders:
      successful,
    failedProviders:
      failed,
    results,
  };
}

/**
 * Return provider information without exposing
 * adapter credentials or internal secrets.
 */
function listProviders() {
  return SUPPORTED_PROVIDERS.map(
    (provider) => {
      let registered = false;
      let source = null;

      const directAdapter =
        getDirectProviderAdapter(
          provider
        );

      if (directAdapter) {
        registered = true;
        source =
          "provider_adapters";
      } else {
        const registryEntry =
          getRegistryEntry(
            provider
          );

        if (
          getAdapterFromRegistryEntry(
            registryEntry
          )
        ) {
          registered = true;
          source =
            "provider_registry";
        }
      }

      let configured = false;

      const adapter =
        directAdapter ||
        getAdapterFromRegistryEntry(
          getRegistryEntry(provider)
        );

      if (
        adapter &&
        typeof adapter.isConfigured ===
          "function"
      ) {
        try {
          configured = Boolean(
            adapter.isConfigured()
          );
        } catch {
          configured = false;
        }
      }

      return {
        provider,
        registered,
        configured,
        source,
      };
    }
  );
}

/**
 * Get all provider health states.
 */
async function getAllProviderHealth() {
  const results = [];

  for (
    const provider
    of SUPPORTED_PROVIDERS
  ) {
    results.push(
      await health(provider)
    );
  }

  return results;
}

/**
 * Main callable service.
 */
async function providerAdapterService(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_PROVIDER_ADAPTER_INPUT",
        message:
          "Provider adapter input must be an object.",
      },
    };
  }

  const operation =
    normalizeOperation(
      input.operation ||
        "registry"
    );

  switch (operation) {
    case "registry":
    case "providers":
      return {
        success: true,
        status: "available",
        providers:
          listProviders(),
      };

    case "health":
      return health(
        input.provider,
        input.context || {}
      );

    case "usage":
      return usage(
        input.provider,
        input.context || {}
      );

    case "costs":
      return costs(
        input.provider,
        input.context || {}
      );

    case "forecast":
      return forecast(
        input.provider,
        input.context || {}
      );

    case "budget":
      return budget(
        input.provider,
        input.context || {}
      );

    case "paymentstatus":
      return paymentStatus(
        input.provider,
        input.context || {}
      );

    case "sendmessage":
      return sendMessage(
        input.provider,
        input.context || {}
      );

    case "sendtemplate":
      return sendTemplate(
        input.provider,
        input.context || {}
      );

    case "verifywebhook":
      return verifyWebhook(
        input.provider,
        input.context || {}
      );

    case "execute":
      return executeProviderOperation(
        input.provider,
        input.providerOperation,
        input.context || {}
      );

    case "execute_all":
      return executeAcrossProviders(
        input.providers,
        input.providerOperation ||
          input.operationName,
        input.context || {}
      );

    case "health_all":
      return {
        success: true,
        status: "available",
        providers:
          await getAllProviderHealth(),
      };

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code:
            "UNSUPPORTED_PROVIDER_OPERATION",
          message:
            `Unsupported provider adapter operation: ${operation}`,
        },
      };
  }
}

/*
 * Public helper methods.
 */
providerAdapterService.getProviderAdapter =
  getProviderAdapter;

providerAdapterService.resolveAdapter =
  resolveAdapter;

providerAdapterService.executeProviderOperation =
  executeProviderOperation;

providerAdapterService.executeAcrossProviders =
  executeAcrossProviders;

providerAdapterService.health =
  health;

providerAdapterService.usage =
  usage;

providerAdapterService.costs =
  costs;

providerAdapterService.forecast =
  forecast;

providerAdapterService.budget =
  budget;

providerAdapterService.paymentStatus =
  paymentStatus;

providerAdapterService.sendMessage =
  sendMessage;

providerAdapterService.sendTemplate =
  sendTemplate;

providerAdapterService.verifyWebhook =
  verifyWebhook;

providerAdapterService.listProviders =
  listProviders;

providerAdapterService.getAllProviderHealth =
  getAllProviderHealth;

module.exports =
  providerAdapterService;
