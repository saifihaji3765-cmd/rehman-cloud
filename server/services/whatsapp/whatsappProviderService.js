"use strict";

const https = require("https");

const GRAPH_API_VERSION =
  process.env.WHATSAPP_GRAPH_API_VERSION ||
  "v23.0";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_MESSAGE_LENGTH = 4096;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value, maxLength = 1000) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

function getConfig() {
  return {
    accessToken:
      process.env.WHATSAPP_ACCESS_TOKEN ||
      null,

    phoneNumberId:
      process.env.WHATSAPP_PHONE_NUMBER_ID ||
      null,

    businessAccountId:
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
      null,

    verifyToken:
      process.env.WHATSAPP_VERIFY_TOKEN ||
      null,

    webhookSecret:
      process.env.WHATSAPP_WEBHOOK_SECRET ||
      null,

    graphApiVersion:
      process.env.WHATSAPP_GRAPH_API_VERSION ||
      GRAPH_API_VERSION
  };
}

function getMissingConfig(
  config,
  options = {}
) {
  const required = [
    "accessToken",
    "phoneNumberId"
  ];

  if (
    options.requireBusinessAccount
  ) {
    required.push(
      "businessAccountId"
    );
  }

  return required.filter(
    (key) => !config[key]
  );
}

function normalizePhoneNumber(
  phoneNumber
) {
  if (!phoneNumber) {
    return null;
  }

  /*
   * WhatsApp Cloud API expects the recipient number
   * in international format without "+".
   */
  const normalized = String(
    phoneNumber
  )
    .trim()
    .replace(/[^\d]/g, "");

  if (
    !normalized ||
    normalized.length < 8 ||
    normalized.length > 15
  ) {
    return null;
  }

  return normalized;
}

function normalizeMessage(
  message
) {
  const value = safeString(
    message,
    MAX_MESSAGE_LENGTH
  );

  if (!value) {
    return null;
  }

  return value;
}

function createJsonRequest(
  url,
  options = {},
  body = null
) {
  return new Promise(
    (resolve, reject) => {
      const parsedUrl =
        new URL(url);

      const requestOptions = {
        protocol:
          parsedUrl.protocol,

        hostname:
          parsedUrl.hostname,

        port:
          parsedUrl.port || 443,

        path:
          `${parsedUrl.pathname}${parsedUrl.search}`,

        method:
          options.method || "GET",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          ...(options.headers || {})
        },

        timeout:
          Number.isFinite(
            options.timeout
          )
            ? options.timeout
            : DEFAULT_TIMEOUT_MS
      };

      const request =
        https.request(
          requestOptions,
          (response) => {
            const chunks = [];

            response.on(
              "data",
              (chunk) => {
                chunks.push(
                  Buffer.from(chunk)
                );
              }
            );

            response.on(
              "end",
              () => {
                const rawBody =
                  Buffer.concat(
                    chunks
                  ).toString(
                    "utf8"
                  );

                let parsedBody =
                  null;

                try {
                  parsedBody =
                    rawBody
                      ? JSON.parse(
                          rawBody
                        )
                      : null;
                } catch {
                  parsedBody =
                    {
                      raw: rawBody.slice(
                        0,
                        5000
                      )
                    };
                }

                resolve({
                  statusCode:
                    response.statusCode,

                  headers:
                    response.headers,

                  body:
                    parsedBody
                });
              }
            );
          }
        );

      request.on(
        "timeout",
        () => {
          request.destroy(
            new Error(
              "WhatsApp API request timed out."
            )
          );
        }
      );

      request.on(
        "error",
        reject
      );

      if (
        body !== null &&
        body !== undefined
      ) {
        request.write(
          JSON.stringify(body)
        );
      }

      request.end();
    }
  );
}

function buildGraphUrl(
  path,
  version
) {
  const cleanVersion =
    String(
      version ||
        GRAPH_API_VERSION
    )
      .trim()
      .replace(
        /^\/+/,
        ""
      );

  const cleanPath =
    String(path || "")
      .trim()
      .replace(
        /^\/+/,
        ""
      );

  return (
    `https://graph.facebook.com/` +
    `${cleanVersion}/${cleanPath}`
  );
}

function extractProviderError(
  response
) {
  const error =
    response?.body?.error;

  if (!isObject(error)) {
    return null;
  }

  return {
    code:
      safeString(
        error.code,
        200
      ),

    subcode:
      safeString(
        error.error_subcode,
        200
      ),

    type:
      safeString(
        error.type,
        200
      ),

    message:
      safeString(
        error.message,
        2000
      )
  };
}

function normalizeProviderResponse(
  response
) {
  if (
    !response ||
    typeof response.statusCode !==
      "number"
  ) {
    return {
      success: false,
      status: "error",
      error: {
        code:
          "INVALID_PROVIDER_RESPONSE",
        message:
          "Invalid response from WhatsApp provider."
      }
    };
  }

  const providerError =
    extractProviderError(
      response
    );

  if (
    response.statusCode < 200 ||
    response.statusCode >= 300
  ) {
    return {
      success: false,

      status:
        response.statusCode === 401 ||
        response.statusCode === 403
          ? "unauthorized"
          : "error",

      httpStatus:
        response.statusCode,

      error:
        providerError || {
          code:
            "WHATSAPP_API_ERROR",

          message:
            "WhatsApp API request failed."
        }
    };
  }

  return {
    success: true,
    status: "available",

    httpStatus:
      response.statusCode,

    data:
      response.body
  };
}

/**
 * Check whether the WhatsApp Cloud API configuration exists.
 *
 * This does NOT claim that the credentials are valid.
 */
function getConfigurationStatus() {
  const config =
    getConfig();

  const missing =
    getMissingConfig(
      config
    );

  return {
    success: true,

    status:
      missing.length === 0
        ? "configured"
        : "not_configured",

    configured:
      missing.length === 0,

    missing,

    provider:
      "whatsapp_cloud_api",

    graphApiVersion:
      config.graphApiVersion,

    /*
     * Never return the access token or verify token.
     */
    phoneNumberId:
      config.phoneNumberId
        ? "configured"
        : null,

    businessAccountId:
      config.businessAccountId
        ? "configured"
        : null
  };
}

/**
 * Perform a real WhatsApp API health check.
 *
 * The phone number ID is requested from Graph API.
 */
async function health(
  context = {}
) {
  const config =
    getConfig();

  const missing =
    getMissingConfig(
      config
    );

  if (missing.length > 0) {
    return {
      success: false,
      status: "not_configured",

      provider:
        "whatsapp_cloud_api",

      source:
        "environment",

      retrievedAt:
        new Date().toISOString(),

      missing
    };
  }

  try {
    const url =
      buildGraphUrl(
        config.phoneNumberId,
        config.graphApiVersion
      );

    const response =
      await createJsonRequest(
        url,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${config.accessToken}`
          },

          timeout:
            context.timeoutMs ||
            DEFAULT_TIMEOUT_MS
        }
      );

    const normalized =
      normalizeProviderResponse(
        response
      );

    if (
      !normalized.success
    ) {
      return {
        ...normalized,

        provider:
          "whatsapp_cloud_api",

        source:
          "graph_api",

        retrievedAt:
          new Date().toISOString()
      };
    }

    return {
      success: true,
      status: "available",

      available: true,

      provider:
        "whatsapp_cloud_api",

      source:
        "graph_api",

      retrievedAt:
        new Date().toISOString(),

      phoneNumberId:
        safeString(
          normalized.data?.id,
          200
        ),

      displayPhoneNumber:
        safeString(
          normalized.data
            ?.display_phone_number,
          100
        ),

      verifiedName:
        safeString(
          normalized.data
            ?.verified_name,
          300
        )
    };
  } catch (error) {
    return {
      success: false,

      status: "error",

      available: false,

      provider:
        "whatsapp_cloud_api",

      source:
        "graph_api",

      retrievedAt:
        new Date().toISOString(),

      error: {
        code:
          safeString(
            error?.code,
            200
          ) ||
          "WHATSAPP_HEALTH_CHECK_FAILED",

        message:
          safeString(
            error?.message,
            1000
          ) ||
          "WhatsApp health check failed."
      }
    };
  }
}

/**
 * Send a plain text WhatsApp message.
 *
 * This performs a REAL provider request.
 */
async function sendTextMessage(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_WHATSAPP_INPUT",
        message:
          "WhatsApp message input must be an object."
      }
    };
  }

  const config =
    getConfig();

  const missing =
    getMissingConfig(
      config
    );

  if (missing.length > 0) {
    return {
      success: false,
      status: "not_configured",

      provider:
        "whatsapp_cloud_api",

      error: {
        code:
          "WHATSAPP_NOT_CONFIGURED",

        message:
          "WhatsApp Cloud API credentials are not configured.",

        missing
      }
    };
  }

  const to =
    normalizePhoneNumber(
      input.to ||
        input.recipient ||
        input.phoneNumber
    );

  if (!to) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_RECIPIENT",
        message:
          "A valid international recipient phone number is required."
      }
    };
  }

  const message =
    normalizeMessage(
      input.message ||
        input.text ||
        input.body
    );

  if (!message) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "MESSAGE_REQUIRED",
        message:
          "WhatsApp message text is required."
      }
    };
  }

  /*
   * Owner-only enforcement is intentionally not guessed here.
   *
   * The WhatsApp security/owner service will decide whether
   * this recipient is authorized.
   */
  if (
    input.requireOwner === true &&
    input.ownerPhone
  ) {
    const owner =
      normalizePhoneNumber(
        input.ownerPhone
      );

    if (
      !owner ||
      owner !== to
    ) {
      return {
        success: false,
        status: "blocked",

        provider:
          "whatsapp_cloud_api",

        error: {
          code:
            "OWNER_RECIPIENT_MISMATCH",

          message:
            "Recipient does not match the configured owner."
        }
      };
    }
  }

  const url =
    buildGraphUrl(
      `${config.phoneNumberId}/messages`,
      config.graphApiVersion
    );

  const payload = {
    messaging_product:
      "whatsapp",

    recipient_type:
      "individual",

    to,

    type:
      "text",

    text: {
      preview_url:
        input.previewUrl === true,

      body: message
    }
  };

  try {
    const response =
      await createJsonRequest(
        url,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${config.accessToken}`
          },

          timeout:
            input.timeoutMs ||
            DEFAULT_TIMEOUT_MS
        },

        payload
      );

    const normalized =
      normalizeProviderResponse(
        response
      );

    if (
      !normalized.success
    ) {
      return {
        ...normalized,

        provider:
          "whatsapp_cloud_api",

        source:
          "graph_api",

        retrievedAt:
          new Date().toISOString()
      };
    }

    const messages =
      Array.isArray(
        normalized.data?.messages
      )
        ? normalized.data.messages
        : [];

    const providerMessageId =
      messages[0]?.id ||
      null;

    /*
     * Never report "sent" without the provider returning
     * a real message ID.
     */
    if (!providerMessageId) {
      return {
        success: false,

        status: "unavailable",

        provider:
          "whatsapp_cloud_api",

        source:
          "graph_api",

        retrievedAt:
          new Date().toISOString(),

        error: {
          code:
            "WHATSAPP_MESSAGE_ID_MISSING",

          message:
            "WhatsApp API did not return a message ID."
        }
      };
    }

    return {
      success: true,

      status: "sent",

      provider:
        "whatsapp_cloud_api",

      source:
        "graph_api",

      retrievedAt:
        new Date().toISOString(),

      providerMessageId,

      recipient:
        to
    };
  } catch (error) {
    return {
      success: false,

      status: "error",

      provider:
        "whatsapp_cloud_api",

      source:
        "graph_api",

      retrievedAt:
        new Date().toISOString(),

      error: {
        code:
          safeString(
            error?.code,
            200
          ) ||
          "WHATSAPP_SEND_FAILED",

        message:
          safeString(
            error?.message,
            1000
          ) ||
          "WhatsApp message request failed."
      }
    };
  }
}

/**
 * Send a WhatsApp template message.
 *
 * Templates are required by WhatsApp for certain business-
 * initiated conversations outside the allowed customer-service
 * window.
 */
async function sendTemplateMessage(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_WHATSAPP_TEMPLATE_INPUT",
        message:
          "Template input must be an object."
      }
    };
  }

  const config =
    getConfig();

  const missing =
    getMissingConfig(
      config
    );

  if (missing.length > 0) {
    return {
      success: false,
      status: "not_configured",

      provider:
        "whatsapp_cloud_api",

      error: {
        code:
          "WHATSAPP_NOT_CONFIGURED",
        message:
          "WhatsApp Cloud API credentials are not configured.",
        missing
      }
    };
  }

  const to =
    normalizePhoneNumber(
      input.to ||
        input.recipient ||
        input.phoneNumber
    );

  if (!to) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_RECIPIENT",
        message:
          "A valid international recipient phone number is required."
      }
    };
  }

  const templateName =
    safeString(
      input.templateName ||
        input.name,
      200
    );

  if (!templateName) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "TEMPLATE_NAME_REQUIRED",
        message:
          "WhatsApp template name is required."
      }
    };
  }

  const languageCode =
    safeString(
      input.languageCode ||
        input.language ||
        "en_US",
      50
    );

  const components =
    Array.isArray(
      input.components
    )
      ? input.components.slice(
          0,
          20
        )
      : [];

  const url =
    buildGraphUrl(
      `${config.phoneNumberId}/messages`,
      config.graphApiVersion
    );

  const payload = {
    messaging_product:
      "whatsapp",

    recipient_type:
      "individual",

    to,

    type:
      "template",

    template: {
      name:
        templateName,

      language: {
        code:
          languageCode
      }
    }
  };

  if (
    components.length > 0
  ) {
    payload.template.components =
      components;
  }

  try {
    const response =
      await createJsonRequest(
        url,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${config.accessToken}`
          },

          timeout:
            input.timeoutMs ||
            DEFAULT_TIMEOUT_MS
        },

        payload
      );

    const normalized =
      normalizeProviderResponse(
        response
      );

    if (
      !normalized.success
    ) {
      return {
        ...normalized,

        provider:
          "whatsapp_cloud_api",

        source:
          "graph_api",

        retrievedAt:
          new Date().toISOString()
      };
    }

    const messages =
      Array.isArray(
        normalized.data?.messages
      )
        ? normalized.data.messages
        : [];

    const providerMessageId =
      messages[0]?.id ||
      null;

    if (!providerMessageId) {
      return {
        success: false,

        status: "unavailable",

        provider:
          "whatsapp_cloud_api",

        source:
          "graph_api",

        retrievedAt:
          new Date().toISOString(),

        error: {
          code:
            "WHATSAPP_MESSAGE_ID_MISSING",

          message:
            "WhatsApp API did not return a message ID."
        }
      };
    }

    return {
      success: true,

      status: "sent",

      provider:
        "whatsapp_cloud_api",

      source:
        "graph_api",

      retrievedAt:
        new Date().toISOString(),

      providerMessageId,

      recipient:
        to,

      template:
        templateName
    };
  } catch (error) {
    return {
      success: false,

      status: "error",

      provider:
        "whatsapp_cloud_api",

      source:
        "graph_api",

      retrievedAt:
        new Date().toISOString(),

      error: {
        code:
          safeString(
            error?.code,
            200
          ) ||
          "WHATSAPP_TEMPLATE_SEND_FAILED",

        message:
          safeString(
            error?.message,
            1000
          ) ||
          "WhatsApp template request failed."
      }
    };
  }
}

/**
 * Verify the webhook challenge sent by Meta.
 *
 * This function does not handle the HTTP response itself;
 * the controller/webhook service will do that.
 */
function verifyWebhookChallenge(
  input = {}
) {
  const config =
    getConfig();

  const mode =
    safeString(
      input.mode ||
        input["hub.mode"],
      100
    );

  const token =
    safeString(
      input.token ||
        input["hub.verify_token"],
      1000
    );

  const challenge =
    safeString(
      input.challenge ||
        input["hub.challenge"],
      2000
    );

  if (!config.verifyToken) {
    return {
      success: false,
      status: "not_configured",
      error: {
        code:
          "WHATSAPP_VERIFY_TOKEN_MISSING",
        message:
          "WHATSAPP_VERIFY_TOKEN is not configured."
      }
    };
  }

  if (
    mode !==
    "subscribe"
  ) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_WEBHOOK_MODE",
        message:
          "Invalid WhatsApp webhook mode."
      }
    };
  }

  if (
    !token ||
    token !==
      config.verifyToken
  ) {
    return {
      success: false,
      status: "unauthorized",
      error: {
        code:
          "INVALID_WEBHOOK_TOKEN",
        message:
          "WhatsApp webhook verification token is invalid."
      }
    };
  }

  if (!challenge) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "WEBHOOK_CHALLENGE_MISSING",
        message:
          "WhatsApp webhook challenge is missing."
      }
    };
  }

  return {
    success: true,
    status: "verified",
    challenge
  };
}

/**
 * Main service interface.
 */
async function whatsappProviderService(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_WHATSAPP_SERVICE_INPUT",
        message:
          "WhatsApp provider input must be an object."
      }
    };
  }

  const operation =
    String(
      input.operation ||
        "configuration"
    )
      .trim()
      .toLowerCase();

  switch (operation) {
    case "configuration":
    case "config":
      return getConfigurationStatus();

    case "health":
    case "check":
      return health(
        input
      );

    case "send":
    case "send_text":
    case "message":
      return sendTextMessage(
        input
      );

    case "template":
    case "send_template":
      return sendTemplateMessage(
        input
      );

    case "verify":
    case "verify_webhook":
      return verifyWebhookChallenge(
        input
      );

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code:
            "UNSUPPORTED_WHATSAPP_OPERATION",

          message:
            `Unsupported WhatsApp operation: ${operation}`
        }
      };
  }
}

whatsappProviderService.getConfigurationStatus =
  getConfigurationStatus;

whatsappProviderService.health =
  health;

whatsappProviderService.sendTextMessage =
  sendTextMessage;

whatsappProviderService.sendTemplateMessage =
  sendTemplateMessage;

whatsappProviderService.verifyWebhookChallenge =
  verifyWebhookChallenge;

whatsappProviderService.normalizePhoneNumber =
  normalizePhoneNumber;

module.exports =
  whatsappProviderService;
