"use strict";

const crypto = require("crypto");

const whatsappProviderService = require("./whatsappProviderService");

const MAX_BODY_SIZE = 1024 * 1024;
const MAX_TEXT_LENGTH = 4096;
const MAX_ENTRIES = 100;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value, max = 1000) {
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

function normalizePhoneNumber(
  value
) {
  if (!value) {
    return null;
  }

  const normalized =
    String(value)
      .trim()
      .replace(/[^\d]/g, "");

  if (
    normalized.length < 8 ||
    normalized.length > 15
  ) {
    return null;
  }

  return normalized;
}

/**
 * Convert the incoming request body into a Buffer.
 *
 * Signature verification must use the exact raw bytes received
 * from Meta, not a re-serialized JSON object.
 */
function normalizeRawBody(
  rawBody
) {
  if (
    Buffer.isBuffer(rawBody)
  ) {
    if (
      rawBody.length >
      MAX_BODY_SIZE
    ) {
      throw new Error(
        "WhatsApp webhook body is too large."
      );
    }

    return rawBody;
  }

  if (
    typeof rawBody === "string"
  ) {
    const buffer =
      Buffer.from(
        rawBody,
        "utf8"
      );

    if (
      buffer.length >
      MAX_BODY_SIZE
    ) {
      throw new Error(
        "WhatsApp webhook body is too large."
      );
    }

    return buffer;
  }

  if (isObject(rawBody)) {
    const serialized =
      JSON.stringify(
        rawBody
      );

    const buffer =
      Buffer.from(
        serialized,
        "utf8"
      );

    if (
      buffer.length >
      MAX_BODY_SIZE
    ) {
      throw new Error(
        "WhatsApp webhook body is too large."
      );
    }

    return buffer;
  }

  throw new Error(
    "WhatsApp webhook body is required."
  );
}

/**
 * Extract the Meta App Secret from environment.
 *
 * We intentionally do not expose the secret in responses.
 */
function getAppSecret() {
  return (
    process.env.WHATSAPP_APP_SECRET ||
    process.env.META_APP_SECRET ||
    null
  );
}

/**
 * Verify X-Hub-Signature-256.
 *
 * Returns false when the secret or signature is unavailable.
 * It never silently treats a missing signature as valid.
 */
function verifySignature(
  rawBody,
  signature
) {
  const appSecret =
    getAppSecret();

  if (!appSecret) {
    return {
      success: false,
      status: "not_configured",
      verified: false,
      error: {
        code:
          "WHATSAPP_APP_SECRET_MISSING",
        message:
          "WhatsApp webhook app secret is not configured."
      }
    };
  }

  const provided =
    safeString(
      signature,
      500
    );

  if (!provided) {
    return {
      success: false,
      status: "unauthorized",
      verified: false,
      error: {
        code:
          "WHATSAPP_SIGNATURE_MISSING",
        message:
          "WhatsApp webhook signature is missing."
      }
    };
  }

  const normalized =
    provided.startsWith(
      "sha256="
    )
      ? provided.slice(
          7
        )
      : provided;

  if (
    !/^[a-f0-9]{64}$/i.test(
      normalized
    )
  ) {
    return {
      success: false,
      status: "unauthorized",
      verified: false,
      error: {
        code:
          "WHATSAPP_SIGNATURE_INVALID",
        message:
          "WhatsApp webhook signature format is invalid."
      }
    };
  }

  const body =
    normalizeRawBody(
      rawBody
    );

  const expected =
    crypto
      .createHmac(
        "sha256",
        appSecret
      )
      .update(body)
      .digest("hex");

  const expectedBuffer =
    Buffer.from(
      expected,
      "hex"
    );

  const providedBuffer =
    Buffer.from(
      normalized,
      "hex"
    );

  if (
    expectedBuffer.length !==
    providedBuffer.length
  ) {
    return {
      success: false,
      status: "unauthorized",
      verified: false,
      error: {
        code:
          "WHATSAPP_SIGNATURE_MISMATCH",
        message:
          "WhatsApp webhook signature does not match."
      }
    };
  }

  const verified =
    crypto.timingSafeEqual(
      expectedBuffer,
      providedBuffer
    );

  if (!verified) {
    return {
      success: false,
      status: "unauthorized",
      verified: false,
      error: {
        code:
          "WHATSAPP_SIGNATURE_MISMATCH",
        message:
          "WhatsApp webhook signature does not match."
      }
    };
  }

  return {
    success: true,
    status: "verified",
    verified: true
  };
}

/**
 * Parse raw webhook body safely.
 */
function parseBody(
  rawBody
) {
  const body =
    normalizeRawBody(
      rawBody
    );

  let parsed;

  try {
    parsed =
      JSON.parse(
        body.toString(
          "utf8"
        )
      );
  } catch {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_WEBHOOK_JSON",
        message:
          "WhatsApp webhook body is not valid JSON."
      }
    };
  }

  if (!isObject(parsed)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_WEBHOOK_PAYLOAD",
        message:
          "WhatsApp webhook payload must be an object."
      }
    };
  }

  return {
    success: true,
    status: "parsed",
    body: parsed
  };
}

/**
 * Extract WhatsApp messages from a Meta webhook payload.
 *
 * Meta can deliver multiple entries/changes/messages in one
 * webhook request, so we return an array.
 */
function extractMessages(
  payload
) {
  if (!isObject(payload)) {
    return [];
  }

  const messages = [];

  const entries =
    Array.isArray(
      payload.entry
    )
      ? payload.entry
      : [];

  for (
    const entry of entries.slice(
      0,
      MAX_ENTRIES
    )
  ) {
    if (!isObject(entry)) {
      continue;
    }

    const changes =
      Array.isArray(
        entry.changes
      )
        ? entry.changes
        : [];

    for (
      const change of changes.slice(
        0,
        MAX_ENTRIES
      )
    ) {
      if (!isObject(change)) {
        continue;
      }

      const value =
        isObject(change.value)
          ? change.value
          : null;

      if (!value) {
        continue;
      }

      const metadata =
        isObject(
          value.metadata
        )
          ? value.metadata
          : {};

      const phoneNumberId =
        safeString(
          metadata.phone_number_id,
          200
        );

      const displayPhoneNumber =
        safeString(
          metadata.display_phone_number,
          100
        );

      const contacts =
        Array.isArray(
          value.contacts
        )
          ? value.contacts
          : [];

      const contactsByWaId =
        new Map();

      for (
        const contact of contacts
      ) {
        if (
          !isObject(contact)
        ) {
          continue;
        }

        const waId =
          normalizePhoneNumber(
            contact.wa_id
          );

        if (waId) {
          contactsByWaId.set(
            waId,
            contact
          );
        }
      }

      const messageList =
        Array.isArray(
          value.messages
        )
          ? value.messages
          : [];

      for (
        const message of messageList.slice(
          0,
          MAX_ENTRIES
        )
      ) {
        if (
          !isObject(message)
        ) {
          continue;
        }

        const from =
          normalizePhoneNumber(
            message.from
          );

        if (!from) {
          continue;
        }

        const messageType =
          safeString(
            message.type,
            100
          ) || "unknown";

        let text = null;

        /*
         * Text message.
         */
        if (
          isObject(
            message.text
          )
        ) {
          text =
            safeString(
              message.text.body,
              MAX_TEXT_LENGTH
            );
        }

        /*
         * Button reply.
         */
        if (
          !text &&
          isObject(
            message.button
          )
        ) {
          text =
            safeString(
              message.button.text,
              MAX_TEXT_LENGTH
            );
        }

        /*
         * Interactive button/list reply.
         */
        if (
          !text &&
          isObject(
            message.interactive
          )
        ) {
          if (
            isObject(
              message.interactive.button_reply
            )
          ) {
            text =
              safeString(
                message.interactive
                  .button_reply.title,
                MAX_TEXT_LENGTH
              );
          }

          if (
            !text &&
            isObject(
              message.interactive.list_reply
            )
          ) {
            text =
              safeString(
                message.interactive
                  .list_reply.title,
                MAX_TEXT_LENGTH
              );
          }
        }

        const contact =
          contactsByWaId.get(
            from
          );

        messages.push({
          provider:
            "whatsapp_cloud_api",

          entryId:
            safeString(
              entry.id,
              300
            ),

          changeField:
            safeString(
              change.field,
              100
            ),

          phoneNumberId,

          displayPhoneNumber,

          messageId:
            safeString(
              message.id,
              300
            ),

          from,

          profileName:
            safeString(
              contact?.profile?.name,
              300
            ),

          timestamp:
            safeString(
              message.timestamp,
              100
            ),

          type:
            messageType,

          text,

          context:
            isObject(
              message.context
            )
              ? {
                  messageId:
                    safeString(
                      message.context
                        .id,
                      300
                    ),

                  from:
                    normalizePhoneNumber(
                      message.context
                        .from
                    )
                }
              : null
        });
      }
    }
  }

  return messages.slice(
    0,
    MAX_ENTRIES
  );
}

/**
 * Extract delivery/read/status updates.
 */
function extractStatuses(
  payload
) {
  if (!isObject(payload)) {
    return [];
  }

  const statuses = [];

  const entries =
    Array.isArray(
      payload.entry
    )
      ? payload.entry
      : [];

  for (
    const entry of entries.slice(
      0,
      MAX_ENTRIES
    )
  ) {
    const changes =
      Array.isArray(
        entry?.changes
      )
        ? entry.changes
        : [];

    for (
      const change of changes.slice(
        0,
        MAX_ENTRIES
      )
    ) {
      const value =
        isObject(change?.value)
          ? change.value
          : {};

      const statusList =
        Array.isArray(
          value.statuses
        )
          ? value.statuses
          : [];

      for (
        const item of statusList.slice(
          0,
          MAX_ENTRIES
        )
      ) {
        if (
          !isObject(item)
        ) {
          continue;
        }

        statuses.push({
          provider:
            "whatsapp_cloud_api",

          messageId:
            safeString(
              item.id,
              300
            ),

          recipientId:
            normalizePhoneNumber(
              item.recipient_id
            ),

          status:
            safeString(
              item.status,
              100
            ),

          timestamp:
            safeString(
              item.timestamp,
              100
            ),

          conversation:
            isObject(
              item.conversation
            )
              ? {
                  id:
                    safeString(
                      item.conversation.id,
                      300
                    ),

                  origin:
                    safeString(
                      item.conversation
                        .origin?.type,
                      100
                    )
                }
              : null,

          pricing:
            isObject(
              item.pricing
            )
              ? {
                  billable:
                    item.pricing.billable,

                  pricingModel:
                    safeString(
                      item.pricing
                        .pricing_model,
                      100
                    ),

                  category:
                    safeString(
                      item.pricing
                        .category,
                      100
                    )
                }
              : null
        });
      }
    }
  }

  return statuses.slice(
    0,
    MAX_ENTRIES
  );
}

/**
 * Extract provider errors from webhook payload.
 */
function extractErrors(
  payload
) {
  if (!isObject(payload)) {
    return [];
  }

  const errors = [];

  const entries =
    Array.isArray(
      payload.entry
    )
      ? payload.entry
      : [];

  for (
    const entry of entries.slice(
      0,
      MAX_ENTRIES
    )
  ) {
    const changes =
      Array.isArray(
        entry?.changes
      )
        ? entry.changes
        : [];

    for (
      const change of changes.slice(
        0,
        MAX_ENTRIES
      )
    ) {
      const value =
        isObject(change?.value)
          ? change.value
          : {};

      const providerErrors =
        Array.isArray(
          value.errors
        )
          ? value.errors
          : [];

      for (
        const error of providerErrors.slice(
          0,
          MAX_ENTRIES
        )
      ) {
        if (
          !isObject(error)
        ) {
          continue;
        }

        errors.push({
          code:
            safeString(
              error.code,
              200
            ),

          title:
            safeString(
              error.title,
              500
            ),

          message:
            safeString(
              error.message,
              2000
            ),

          details:
            safeString(
              error.error_data?.details,
              2000
            )
        });
      }
    }
  }

  return errors.slice(
    0,
    MAX_ENTRIES
  );
}

/**
 * Full webhook processing pipeline.
 *
 * It verifies the signature first, then parses the payload.
 */
function processWebhook(
  input = {}
) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "INVALID_WEBHOOK_INPUT",
        message:
          "Webhook input must be an object."
      }
    };
  }

  const rawBody =
    input.rawBody ??
    input.body;

  if (
    rawBody === undefined ||
    rawBody === null
  ) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "WEBHOOK_BODY_REQUIRED",
        message:
          "Raw webhook body is required."
      }
    };
  }

  let signatureResult;

  try {
    signatureResult =
      verifySignature(
        rawBody,
        input.signature ||
          input["x-hub-signature-256"]
      );
  } catch (error) {
    return {
      success: false,
      status: "error",
      error: {
        code:
          "WEBHOOK_SIGNATURE_CHECK_FAILED",
        message:
          safeString(
            error?.message,
            1000
          ) ||
          "Webhook signature verification failed."
      }
    };
  }

  if (
    signatureResult.success !==
    true
  ) {
    return signatureResult;
  }

  let parsed;

  try {
    parsed =
      parseBody(
        rawBody
      );
  } catch (error) {
    return {
      success: false,
      status: "error",
      error: {
        code:
          "WEBHOOK_PARSE_FAILED",
        message:
          safeString(
            error?.message,
            1000
          ) ||
          "Webhook parsing failed."
      }
    };
  }

  if (
    parsed.success !==
    true
  ) {
    return parsed;
  }

  const payload =
    parsed.body;

  const messages =
    extractMessages(
      payload
    );

  const statuses =
    extractStatuses(
      payload
    );

  const errors =
    extractErrors(
      payload
    );

  return {
    success: true,

    status:
      messages.length > 0
        ? "received"
        : statuses.length > 0
          ? "status_update"
          : errors.length > 0
            ? "provider_error"
            : "accepted",

    provider:
      "whatsapp_cloud_api",

    receivedAt:
      new Date().toISOString(),

    messages,

    statuses,

    errors,

    counts: {
      messages:
        messages.length,

      statuses:
        statuses.length,

      errors:
        errors.length
    }
  };
}

/**
 * Verify Meta's webhook GET challenge.
 */
function verifyChallenge(
  input = {}
) {
  return whatsappProviderService
    .verifyWebhookChallenge(
      input
    );
}

/**
 * Main service interface.
 */
function whatsappWebhookService(
  input = {}
) {
  const operation =
    String(
      input.operation ||
        "process"
    )
      .trim()
      .toLowerCase();

  switch (operation) {
    case "verify":
    case "challenge":
      return verifyChallenge(
        input
      );

    case "signature":
    case "verify_signature":
      try {
        return verifySignature(
          input.rawBody ??
            input.body,
          input.signature ||
            input[
              "x-hub-signature-256"
            ]
        );
      } catch (error) {
        return {
          success: false,
          status: "error",
          verified: false,
          error: {
            code:
              "SIGNATURE_VERIFICATION_FAILED",
            message:
              safeString(
                error?.message,
                1000
              ) ||
              "Signature verification failed."
          }
        };
      }

    case "parse":
      try {
        return parseBody(
          input.rawBody ??
            input.body
        );
      } catch (error) {
        return {
          success: false,
          status: "error",
          error: {
            code:
              "WEBHOOK_PARSE_FAILED",
            message:
              safeString(
                error?.message,
                1000
              ) ||
              "Webhook parsing failed."
          }
        };
      }

    case "process":
    case "handle":
      return processWebhook(
        input
      );

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code:
            "UNSUPPORTED_WEBHOOK_OPERATION",
          message:
            `Unsupported WhatsApp webhook operation: ${operation}`
        }
      };
  }
}

whatsappWebhookService.verifySignature =
  verifySignature;

whatsappWebhookService.parseBody =
  parseBody;

whatsappWebhookService.extractMessages =
  extractMessages;

whatsappWebhookService.extractStatuses =
  extractStatuses;

whatsappWebhookService.extractErrors =
  extractErrors;

whatsappWebhookService.processWebhook =
  processWebhook;

whatsappWebhookService.verifyChallenge =
  verifyChallenge;

module.exports =
  whatsappWebhookService;
