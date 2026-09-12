"use strict";

const providerRegistry = require("../../agents/financial/providerRegistry");

const MAX_RESULT_ITEMS = 500;

const SUPPORTED_PROVIDERS = [
  "openai",
  "aws",
  "whatsapp",
  "stripe",
  "razorpay"
];

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeProvider(provider) {
  if (!provider) {
    return null;
  }

  return String(provider)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeOperation(operation) {
  if (!operation) {
    return null;
  }

  return String(operation)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
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
      return null;
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

function getAdapter(entry) {
  if (!entry) {
    return null;
  }

  if (
    isObject(entry.adapter)
  ) {
    return entry.adapter;
  }

  return entry;
}

function normalizeAdapterResult(
  provider,
  operation,
  result
) {
  const normalizedProvider =
    normalizeProvider(provider);

  if (!isObject(result)) {
    return {
      success: true,
      status: "available",
      provider: normalizedProvider,
      operation,
      data: result,
      source:
        `provider:${normalizedProvider}`,
      retrievedAt:
        new Date().toISOString()
    };
  }

  const data =
    isObject(result.data)
      ? result.data
      : result;

  return {
    success:
      typeof result.success ===
      "boolean"
        ? result.success
        : true,

    status:
      safeString(
        result.status ||
        data.status,
        100
      ) || "available",

    provider:
      normalizedProvider,

    operation,

    data,

    source:
      safeString(
        result.source ||
        data.source,
        500
      ) ||
      `provider:${normalizedProvider}`,

    retrievedAt:
      safeString(
        result.retrievedAt ||
        data.retrievedAt,
        100
      ) ||
      new Date().toISOString(),

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
      )
  };
}

function findMethod(
  adapter,
  operation
) {
  if (!adapter) {
    return null;
  }

  const aliases = {
    health: [
      "health",
      "healthCheck",
      "checkHealth"
    ],

    usage: [
      "usage",
      "getUsage",
      "fetchUsage",
      "usageData"
    ],

    costs: [
      "costs",
      "getCosts",
      "fetchCosts",
      "costData"
    ],

    forecast: [
      "forecast",
      "getForecast",
      "fetchForecast"
    ],

    budget: [
      "budget",
      "getBudget",
      "fetchBudget"
    ],

    payment: [
      "payment",
      "createPayment",
      "processPayment"
    ],

    paymentStatus: [
      "paymentStatus",
      "getPaymentStatus",
      "fetchPaymentStatus"
    ],

    sendMessage: [
      "sendMessage",
      "sendWhatsAppMessage",
      "send"
    ],

    verifyWebhook: [
      "verifyWebhook",
      "verifySignature",
      "verify"
    ]
  };

  const candidates =
    aliases[operation] || [
      operation
    ];

  return candidates.find(
    (method) =>
      typeof adapter[method] ===
      "function"
  ) || null;
}

/**
 * Return a provider adapter without exposing credentials.
 */
function getProviderAdapter(provider) {
  const normalized =
    normalizeProvider(provider);

  if (!normalized) {
    return {
      success: false,
      status: "invalid",
      adapter: null,
      error: {
        code:
          "PROVIDER_REQUIRED",
        message:
          "Provider is required."
      }
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
      error: {
        code:
          "UNSUPPORTED_PROVIDER",
        message:
          `Unsupported financial provider: ${normalized}`
      }
    };
  }

  const entry =
    getRegistryEntry(normalized);

  if (!entry) {
    return {
      success: false,
      status: "not_configured",
      provider: normalized,
      adapter: null,
      error: {
        code:
          "PROVIDER_NOT_REGISTERED",
        message:
          `Provider ${normalized} is not registered.`
      }
    };
  }

  const adapter =
    getAdapter(entry);

  if (!adapter) {
    return {
      success: false,
      status: "not_configured",
      provider: normalized,
      adapter: null,
      error: {
        code:
          "PROVIDER_ADAPTER_NOT_CONFIGURED",
        message:
          `Provider ${normalized} has no adapter.`
      }
    };
  }

  return {
    success: true,
    status: "available",
    provider: normalized,
    adapter,
    registry: entry
  };
}

/**
 * Execute one adapter operation.
 *
 * This service intentionally does not invent fallback values.
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
          "Provider is required."
      }
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
          "Provider operation is required."
      }
    };
  }

  const providerResult =
    getProviderAdapter(
      normalizedProvider
    );

  if (!providerResult.success) {
    return providerResult;
  }

  const {
    adapter
  } = providerResult;

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
      error: {
        code:
          "PROVIDER_OPERATION_NOT_CONFIGURED",
        message:
          `Operation ${normalizedOperation} is not configured for ${normalizedProvider}.`
      }
    };
  }

  /*
   * The adapter receives only the context intentionally supplied
   * by the caller. This service never adds credentials or secrets.
   */
  try {
    const rawResult =
      await adapter[method](
        isObject(context)
          ? context
          : {}
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
        `provider:${normalizedProvider}`,

      retrievedAt:
        new Date().toISOString(),

      error: {
        code:
          safeString(
            error?.code,
            200
          ) ||
          "PROVIDER_OPERATION_FAILED",

        message:
          safeString(
            error?.message,
            1000
          ) ||
          "Provider operation failed."
      }
    };
  }
}

/**
 * Get real provider health.
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
 * Get real provider usage.
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
 * Get real provider costs.
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
 * Get real provider forecast.
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
 * Get real provider budget information.
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
 * Get payment status.
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
 * Send a message through a registered messaging adapter.
 *
 * The adapter must perform the actual delivery and return a real
 * provider message ID. This layer does not claim delivery itself.
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
    null;

  if (!providerMessageId) {
    return {
      success: false,
      status: "unavailable",
      provider:
        normalizeProvider(provider),
      operation: "sendMessage",
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
          "Provider did not return a real message ID."
      }
    };
  }

  return {
    ...result,
    status: "sent",
    providerMessageId:
      safeString(
        providerMessageId,
        500
      )
  };
}

/**
 * Verify a provider webhook.
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
 * Check multiple providers for one operation.
 */
async function executeAcrossProviders(
  providers,
  operation,
  context = {}
) {
  const list =
    Array.isArray(providers)
      ? providers
      : SUPPORTED_PROVIDERS;

  const normalizedProviders =
    [
      ...new Set(
        list
          .map(normalizeProvider)
          .filter(Boolean)
      )
    ].slice(
      0,
      MAX_RESULT_ITEMS
    );

  const results = [];

  for (
    const provider
    of normalizedProviders
  ) {
    results.push(
      await executeProviderOperation(
        provider,
        operation,
        context
      )
    );
  }

  return {
    success: true,
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

    operation,

    results
  };
}

/**
 * List configured providers without exposing adapter internals
 * or credentials.
 */
function listProviders() {
  return SUPPORTED_PROVIDERS.map(
    (provider) => {
      const entry =
        getRegistryEntry(provider);

      return {
        provider,

        registered:
          Boolean(entry),

        status:
          entry?.status ||
          (
            entry
              ? "registered"
              : "not_configured"
          )
      };
    }
  );
}

/**
 * Main service interface.
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
          "Provider adapter input must be an object."
      }
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
          listProviders()
      };

    case "health":
    case "usage":
    case "costs":
    case "forecast":
    case "budget":
    case "paymentstatus":
    case "sendmessage":
    case "verifywebhook":
      return executeProviderOperation(
        input.provider,
        operation ===
        "paymentstatus"
          ? "paymentStatus"
          : operation ===
              "sendmessage"
            ? "sendMessage"
            : operation,
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

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code:
            "UNSUPPORTED_PROVIDER_OPERATION",
          message:
            `Unsupported provider adapter operation: ${operation}`
        }
      };
  }
}

providerAdapterService.getProviderAdapter =
  getProviderAdapter;

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

providerAdapterService.verifyWebhook =
  verifyWebhook;

providerAdapterService.listProviders =
  listProviders;

module.exports =
  providerAdapterService;
