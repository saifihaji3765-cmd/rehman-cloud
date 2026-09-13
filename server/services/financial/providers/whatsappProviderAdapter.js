"use strict";

const whatsappProviderService = require("../../whatsapp/whatsappProviderService");

const PROVIDER = "whatsapp";

function clean(value, max = 500) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function isConfigured() {
  if (
    typeof whatsappProviderService.isConfigured ===
    "function"
  ) {
    return Boolean(
      whatsappProviderService.isConfigured()
    );
  }

  if (
    typeof whatsappProviderService.getConfigurationStatus ===
    "function"
  ) {
    const status =
      whatsappProviderService.getConfigurationStatus();

    return Boolean(status?.configured);
  }

  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

function normalizeStatus(result) {
  if (!result) {
    return "unavailable";
  }

  if (
    result.status === "not_configured" ||
    result.status === "not_configured"
  ) {
    return "not_configured";
  }

  if (result.status === "sent") {
    return "available";
  }

  if (result.success === true) {
    return "available";
  }

  return result.status || "error";
}

function safeError(error) {
  if (!error) {
    return null;
  }

  return {
    code: clean(
      error.code ||
        error.name ||
        "WHATSAPP_PROVIDER_ERROR",
      150
    ),
    message: clean(
      error.message ||
        "WhatsApp provider request failed",
      500
    ),
  };
}

function normalizeHealthResult(result) {
  if (!result || typeof result !== "object") {
    return {
      provider: PROVIDER,
      status: "unavailable",
      available: false,
      source: "whatsapp_cloud_api",
      retrievedAt: new Date(),
    };
  }

  return {
    provider: PROVIDER,
    status:
      result.status ||
      (result.available
        ? "available"
        : "unavailable"),
    available: Boolean(result.available),
    source:
      result.source ||
      "whatsapp_cloud_api",
    retrievedAt:
      result.retrievedAt || new Date(),
    error: result.error
      ? safeError(
          typeof result.error === "object"
            ? result.error
            : {
                message: result.error,
              }
        )
      : null,
  };
}

async function health() {
  if (!isConfigured()) {
    return {
      provider: PROVIDER,
      status: "not_configured",
      available: false,
      source: "whatsapp_cloud_api",
      retrievedAt: new Date(),
    };
  }

  try {
    let result;

    if (
      typeof whatsappProviderService.health ===
      "function"
    ) {
      result =
        await whatsappProviderService.health();
    } else if (
      typeof whatsappProviderService.checkHealth ===
      "function"
    ) {
      result =
        await whatsappProviderService.checkHealth();
    } else {
      return {
        provider: PROVIDER,
        status: "unavailable",
        available: false,
        source: "whatsapp_cloud_api",
        retrievedAt: new Date(),
        error: {
          code:
            "WHATSAPP_HEALTH_METHOD_UNAVAILABLE",
          message:
            "WhatsApp health method is unavailable",
        },
      };
    }

    return normalizeHealthResult(result);
  } catch (error) {
    return {
      provider: PROVIDER,
      status: "error",
      available: false,
      source: "whatsapp_cloud_api",
      retrievedAt: new Date(),
      error: safeError(error),
    };
  }
}

function normalizeMessageResult(result) {
  if (!result || typeof result !== "object") {
    return {
      success: false,
      status: "unavailable",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code: "WHATSAPP_NO_PROVIDER_RESULT",
        message:
          "WhatsApp provider returned no result",
      },
    };
  }

  const messageId =
    result.messageId ||
    result.providerMessageId ||
    result.messages?.[0]?.id ||
    null;

  const success =
    Boolean(result.success) &&
    Boolean(messageId);

  return {
    success,
    status: success
      ? "sent"
      : normalizeStatus(result),
    provider: PROVIDER,
    source:
      result.source ||
      "whatsapp_cloud_api",
    messageId,
    recipient:
      result.recipient ||
      result.to ||
      null,
    retrievedAt:
      result.retrievedAt ||
      new Date(),
    error: result.error
      ? safeError(
          typeof result.error === "object"
            ? result.error
            : {
                message: result.error,
              }
        )
      : success
        ? null
        : {
            code:
              "WHATSAPP_MESSAGE_NOT_SENT",
            message:
              "WhatsApp message was not confirmed as sent",
          },
  };
}

async function sendMessage({
  to,
  text,
  previewUrl = false,
  requireOwner = false,
} = {}) {
  if (!to) {
    return {
      success: false,
      status: "invalid",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code: "WHATSAPP_RECIPIENT_REQUIRED",
        message:
          "WhatsApp recipient is required",
      },
    };
  }

  if (!text) {
    return {
      success: false,
      status: "invalid",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code: "WHATSAPP_MESSAGE_REQUIRED",
        message:
          "WhatsApp message is required",
      },
    };
  }

  if (!isConfigured()) {
    return {
      success: false,
      status: "not_configured",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code:
          "WHATSAPP_NOT_CONFIGURED",
        message:
          "WhatsApp Cloud API is not configured",
      },
    };
  }

  try {
    let result;

    /*
     * Prefer the existing message service so that
     * recipient validation, message splitting and
     * owner-only handling remain centralized.
     */
    const messageService = require(
      "../../whatsapp/whatsappMessageService"
    );

    if (
      typeof messageService.sendText !==
      "function"
    ) {
      return {
        success: false,
        status: "unavailable",
        provider: PROVIDER,
        source: "whatsapp_cloud_api",
        messageId: null,
        error: {
          code:
            "WHATSAPP_MESSAGE_SERVICE_UNAVAILABLE",
          message:
            "WhatsApp message service is unavailable",
        },
      };
    }

    result =
      await messageService.sendText({
        to,
        text,
        previewUrl: Boolean(previewUrl),
        requireOwner: Boolean(requireOwner),
      });

    return normalizeMessageResult(result);
  } catch (error) {
    return {
      success: false,
      status: "error",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: safeError(error),
    };
  }
}

async function sendOwnerMessage({
  text,
  previewUrl = false,
} = {}) {
  if (!text) {
    return {
      success: false,
      status: "invalid",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code: "WHATSAPP_MESSAGE_REQUIRED",
        message:
          "WhatsApp message is required",
      },
    };
  }

  if (!isConfigured()) {
    return {
      success: false,
      status: "not_configured",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code:
          "WHATSAPP_NOT_CONFIGURED",
        message:
          "WhatsApp Cloud API is not configured",
      },
    };
  }

  try {
    const result =
      await require(
        "../../whatsapp/whatsappOwnerService"
      ).sendOwnerText({
        text,
        previewUrl,
      });

    return normalizeMessageResult(result);
  } catch (error) {
    return {
      success: false,
      status: "error",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: safeError(error),
    };
  }
}

async function sendTemplate({
  to,
  templateName,
  languageCode = "en_US",
  components,
  requireOwner = false,
} = {}) {
  if (!to) {
    return {
      success: false,
      status: "invalid",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code: "WHATSAPP_RECIPIENT_REQUIRED",
        message:
          "WhatsApp recipient is required",
      },
    };
  }

  if (!templateName) {
    return {
      success: false,
      status: "invalid",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code:
          "WHATSAPP_TEMPLATE_REQUIRED",
        message:
          "WhatsApp template name is required",
      },
    };
  }

  if (!isConfigured()) {
    return {
      success: false,
      status: "not_configured",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: {
        code:
          "WHATSAPP_NOT_CONFIGURED",
        message:
          "WhatsApp Cloud API is not configured",
      },
    };
  }

  try {
    const messageService = require(
      "../../whatsapp/whatsappMessageService"
    );

    if (
      typeof messageService.sendTemplate !==
      "function"
    ) {
      return {
        success: false,
        status: "unavailable",
        provider: PROVIDER,
        source: "whatsapp_cloud_api",
        messageId: null,
        error: {
          code:
            "WHATSAPP_TEMPLATE_SERVICE_UNAVAILABLE",
          message:
            "WhatsApp template service is unavailable",
        },
      };
    }

    const result =
      await messageService.sendTemplate({
        to,
        templateName,
        languageCode,
        components,
        requireOwner:
          Boolean(requireOwner),
      });

    return normalizeMessageResult(result);
  } catch (error) {
    return {
      success: false,
      status: "error",
      provider: PROVIDER,
      source: "whatsapp_cloud_api",
      messageId: null,
      error: safeError(error),
    };
  }
}

async function getUsage() {
  /*
   * WhatsApp messaging delivery is not treated as
   * financial usage here. We only expose data that
   * the provider adapter actually has.
   */
  return {
    provider: PROVIDER,
    status: "unavailable",
    available: false,
    source: "whatsapp_cloud_api",
    retrievedAt: new Date(),
    observations: [],
    reason:
      "WHATSAPP_FINANCIAL_USAGE_NOT_EXPOSED_BY_ADAPTER",
  };
}

async function getCosts() {
  /*
   * Do not invent WhatsApp costs. If Meta billing
   * data is added later, it will get its own
   * authoritative billing adapter.
   */
  return {
    provider: PROVIDER,
    status: "unavailable",
    available: false,
    source: "whatsapp_cloud_api",
    retrievedAt: new Date(),
    observations: [],
    reason:
      "WHATSAPP_COST_DATA_NOT_CONFIGURED",
  };
}

async function getProviderData({
  includeUsage = false,
  includeCosts = false,
} = {}) {
  const healthResult =
    await health();

  const result = {
    provider: PROVIDER,
    retrievedAt: new Date(),
    health: healthResult,
  };

  if (includeUsage) {
    result.usage =
      await getUsage();
  }

  if (includeCosts) {
    result.costs =
      await getCosts();
  }

  return result;
}

module.exports = {
  provider: PROVIDER,

  isConfigured,

  health,

  sendMessage,

  sendOwnerMessage,

  sendTemplate,

  getUsage,

  getCosts,

  getProviderData,
};
