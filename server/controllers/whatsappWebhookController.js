"use strict";

/**
 * =========================================================
 * ZyrionOS WHATSAPP WEBHOOK CONTROLLER
 * =========================================================
 *
 * Responsibilities:
 * - Meta/WhatsApp webhook verification challenge
 * - X-Hub-Signature-256 verification
 * - Safe parsing of incoming WhatsApp events
 * - Owner-message authorization
 * - Safe command extraction
 *
 * IMPORTANT:
 * - This controller does NOT execute financial payments.
 * - This controller does NOT execute infrastructure actions.
 * - This controller does NOT expose provider credentials.
 * - This controller does NOT trust client-supplied owner IDs.
 * - Incoming commands are passed only to the WhatsApp control
 *   layer after signature + owner authorization.
 *
 * Raw-body requirement:
 *
 * Express must preserve the original request body for
 * POST webhook requests.
 */

const crypto = require("crypto");

const whatsappWebhookService = require(
  "../services/whatsapp/whatsappWebhookService"
);

const whatsappOwnerService = require(
  "../services/whatsapp/whatsappOwnerService"
);

const whatsappSecurityService = require(
  "../services/whatsapp/whatsappSecurityService"
);

const MAX_BODY_SIZE = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4096;

/* =========================================================
   HELPERS
========================================================= */

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function cleanString(
  value,
  maxLength = 500
) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const valueTrimmed =
    value.trim();

  if (!valueTrimmed) {
    return null;
  }

  return valueTrimmed.slice(
    0,
    maxLength
  );
}

function safeError(error) {
  return {
    code:
      cleanString(
        error?.code,
        200
      ) ||
      "WHATSAPP_WEBHOOK_ERROR",

    message:
      cleanString(
        error?.message,
        1000
      ) ||
      "WhatsApp webhook processing failed."
  };
}

/* =========================================================
   RAW BODY
========================================================= */

function getRawBody(req) {
  if (
    Buffer.isBuffer(req?.body)
  ) {
    if (
      req.body.length >
      MAX_BODY_SIZE
    ) {
      const error =
        new Error(
          "Webhook body is too large."
        );

      error.code =
        "WEBHOOK_BODY_TOO_LARGE";

      throw error;
    }

    return req.body;
  }

  if (
    typeof req?.body === "string"
  ) {
    const buffer =
      Buffer.from(
        req.body,
        "utf8"
      );

    if (
      buffer.length >
      MAX_BODY_SIZE
    ) {
      const error =
        new Error(
          "Webhook body is too large."
        );

      error.code =
        "WEBHOOK_BODY_TOO_LARGE";

      throw error;
    }

    return buffer;
  }

  return null;
}

/* =========================================================
   SIGNATURE
========================================================= */

/**
 * Verify Meta X-Hub-Signature-256.
 *
 * Preferred implementation is the existing
 * whatsappWebhookService so signature logic remains in one
 * place.
 *
 * This helper exists only as a defensive fallback when the
 * service exposes the lower-level verification method.
 */
function verifySignatureFallback(
  req,
  rawBody
) {
  const signature =
    cleanString(
      req?.headers?.[
        "x-hub-signature-256"
      ],
      500
    );

  const appSecret =
    process.env.WHATSAPP_APP_SECRET ||
    process.env.META_APP_SECRET;

  if (
    !signature ||
    !appSecret ||
    !rawBody
  ) {
    return false;
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac(
        "sha256",
        appSecret
      )
      .update(rawBody)
      .digest("hex");

  const expectedBuffer =
    Buffer.from(
      expected,
      "utf8"
    );

  const receivedBuffer =
    Buffer.from(
      signature,
      "utf8"
    );

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
}

async function verifyWebhook(
  req,
  rawBody
) {
  /*
   * Use the existing service as the primary authority.
   */
  if (
    whatsappWebhookService &&
    typeof
      whatsappWebhookService.verifySignature ===
      "function"
  ) {
    return Boolean(
      await whatsappWebhookService.verifySignature(
        rawBody,
        req?.headers?.[
          "x-hub-signature-256"
        ]
      )
    );
  }

  if (
    whatsappWebhookService &&
    typeof
      whatsappWebhookService.verifyWebhookSignature ===
      "function"
  ) {
    return Boolean(
      await whatsappWebhookService.verifyWebhookSignature(
        rawBody,
        req?.headers?.[
          "x-hub-signature-256"
        ]
      )
    );
  }

  /*
   * Defensive fallback.
   *
   * If the service does not expose either method, verify
   * directly without weakening the security requirement.
   */
  return verifySignatureFallback(
    req,
    rawBody
  );
}

/* =========================================================
   PAYLOAD PARSING
========================================================= */

function parsePayload(
  rawBody
) {
  if (
    !rawBody
  ) {
    return null;
  }

  try {
    const text =
      rawBody.toString(
        "utf8"
      );

    if (
      !text.trim()
    ) {
      return null;
    }

    if (
      text.length >
      MAX_BODY_SIZE
    ) {
      return null;
    }

    return JSON.parse(
      text
    );
  } catch (error) {
    return null;
  }
}

/* =========================================================
   META EVENT EXTRACTION
========================================================= */

function extractIncomingMessages(
  payload
) {
  if (
    !isObject(payload)
  ) {
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
    const entry of entries
  ) {
    if (
      !isObject(entry)
    ) {
      continue;
    }

    const changes =
      Array.isArray(
        entry.changes
      )
        ? entry.changes
        : [];

    for (
      const change of changes
    ) {
      if (
        !isObject(change)
      ) {
        continue;
      }

      const value =
        isObject(change.value)
          ? change.value
          : null;

      if (!value) {
        continue;
      }

      const contacts =
        Array.isArray(
          value.contacts
        )
          ? value.contacts
          : [];

      const incoming =
        Array.isArray(
          value.messages
        )
          ? value.messages
          : [];

      for (
        const message of incoming
      ) {
        if (
          !isObject(message)
        ) {
          continue;
        }

        const contact =
          contacts.find(
            (item) =>
              isObject(item) &&
              item.wa_id ===
                message.from
          ) ||
          contacts[0] ||
          null;

        messages.push({
          messageId:
            cleanString(
              message.id,
              300
            ),

          from:
            cleanString(
              message.from,
              100
            ),

          timestamp:
            cleanString(
              message.timestamp,
              100
            ),

          type:
            cleanString(
              message.type,
              100
            ),

          text:
            isObject(
              message.text
            )
              ? cleanString(
                  message.text.body,
                  MAX_TEXT_LENGTH
                )
              : null,

          contactName:
            isObject(contact)
              ? cleanString(
                  contact.profile?.name,
                  200
                )
              : null,

          rawType:
            cleanString(
              message.type,
              100
            )
        });
      }
    }
  }

  return messages;
}

/* =========================================================
   STATUS / DELIVERY EVENTS
========================================================= */

function extractStatuses(
  payload
) {
  if (
    !isObject(payload)
  ) {
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
    const entry of entries
  ) {
    if (
      !isObject(entry)
    ) {
      continue;
    }

    const changes =
      Array.isArray(
        entry.changes
      )
        ? entry.changes
        : [];

    for (
      const change of changes
    ) {
      if (
        !isObject(change) ||
        !isObject(change.value)
      ) {
        continue;
      }

      const value =
        change.value;

      const list =
        Array.isArray(
          value.statuses
        )
          ? value.statuses
          : [];

      for (
        const status of list
      ) {
        if (
          !isObject(status)
        ) {
          continue;
        }

        statuses.push({
          messageId:
            cleanString(
              status.id,
              300
            ),

          status:
            cleanString(
              status.status,
              100
            ),

          timestamp:
            cleanString(
              status.timestamp,
              100
            ),

          recipientId:
            cleanString(
              status.recipient_id,
              100
            )
        });
      }
    }
  }

  return statuses;
}

/* =========================================================
   OWNER AUTHORIZATION
========================================================= */

async function authorizeMessage(
  message
) {
  if (
    !isObject(message)
  ) {
    return {
      authorized: false,
      reason:
        "INVALID_MESSAGE"
    };
  }

  const phone =
    cleanString(
      message.from,
      100
    );

  if (!phone) {
    return {
      authorized: false,
      reason:
        "SENDER_PHONE_MISSING"
    };
  }

  /*
   * Prefer the existing owner service.
   */
  if (
    whatsappOwnerService &&
    typeof
      whatsappOwnerService.authorizeIncomingMessage ===
      "function"
  ) {
    try {
      const result =
        await whatsappOwnerService.authorizeIncomingMessage(
          {
            from: phone,
            message
          }
        );

      if (
        result === true
      ) {
        return {
          authorized: true
        };
      }

      if (
        isObject(result)
      ) {
        return {
          authorized:
            result.authorized === true,
          reason:
            cleanString(
              result.reason,
              300
            ) ||
            (
              result.authorized ===
              true
                ? null
                : "OWNER_AUTHORIZATION_FAILED"
            )
        };
      }
    } catch (error) {
      return {
        authorized: false,
        reason:
          "OWNER_AUTHORIZATION_ERROR"
      };
    }
  }

  /*
   * Fallback to isOwnerPhone if available.
   */
  if (
    whatsappOwnerService &&
    typeof
      whatsappOwnerService.isOwnerPhone ===
      "function"
  ) {
    try {
      return {
        authorized:
          Boolean(
            await whatsappOwnerService.isOwnerPhone(
              phone
            )
          ),
        reason:
          "OWNER_PHONE_CHECK"
      };
    } catch (error) {
      return {
        authorized: false,
        reason:
          "OWNER_AUTHORIZATION_ERROR"
      };
    }
  }

  /*
   * No owner service means NO authorization.
   */
  return {
    authorized: false,
    reason:
      "OWNER_AUTH_SERVICE_UNAVAILABLE"
  };
}

/* =========================================================
   COMMAND SECURITY
========================================================= */

function validateCommandText(
  text
) {
  const cleaned =
    cleanString(
      text,
      MAX_TEXT_LENGTH
    );

  if (!cleaned) {
    return {
      valid: false,
      reason:
        "TEXT_MESSAGE_REQUIRED"
    };
  }

  /*
   * Existing security service remains the authority.
   */
  if (
    whatsappSecurityService &&
    typeof
      whatsappSecurityService.validateIncoming ===
      "function"
  ) {
    try {
      const result =
        whatsappSecurityService.validateIncoming(
          cleaned
        );

      if (
        result === false
      ) {
        return {
          valid: false,
          reason:
            "MESSAGE_BLOCKED"
        };
      }

      if (
        isObject(result) &&
        result.valid === false
      ) {
        return {
          valid: false,
          reason:
            cleanString(
              result.reason,
              300
            ) ||
            "MESSAGE_BLOCKED"
        };
      }
    } catch (error) {
      return {
        valid: false,
        reason:
          "MESSAGE_SECURITY_CHECK_FAILED"
      };
    }
  }

  return {
    valid: true,
    text: cleaned
  };
}

/* =========================================================
   MESSAGE HANDLER
========================================================= */

async function processIncomingMessage(
  message
) {
  const authorization =
    await authorizeMessage(
      message
    );

  /*
   * Unauthorized messages are ignored safely.
   *
   * Do not send an informative response to an unauthorized
   * sender because that can reveal that the WhatsApp number
   * is connected to ZyrionOS.
   */
  if (
    authorization.authorized !==
    true
  ) {
    return {
      success: true,
      status:
        "ignored_unauthorized",
      processed: false
    };
  }

  const validation =
    validateCommandText(
      message.text
    );

  if (
    !validation.valid
  ) {
    return {
      success: false,
      status:
        "message_rejected",
      processed: false,
      error: {
        code:
          "WHATSAPP_MESSAGE_REJECTED",
        message:
          validation.reason
      }
    };
  }

  /*
   * IMPORTANT:
   *
   * This controller intentionally stops here.
   *
   * It does not execute the command.
   *
   * The next control layer can consume this normalized,
   * owner-authorized command.
   */
  return {
    success: true,
    status:
      "authorized_command",
    processed: true,

    command: {
      messageId:
        message.messageId,

      from:
        message.from,

      text:
        validation.text,

      timestamp:
        message.timestamp,

      type:
        message.type
    }
  };
}

/* =========================================================
   VERIFY WEBHOOK
========================================================= */

/**
 * GET /api/webhook/whatsapp
 *
 * Meta verification challenge.
 *
 * No authentication middleware is used.
 * Verification is performed using the configured
 * WhatsApp verify token.
 */
async function verify(
  req,
  res
) {
  try {
    const mode =
      cleanString(
        req.query?.[
          "hub.mode"
        ],
        100
      );

    const token =
      cleanString(
        req.query?.[
          "hub.verify_token"
        ],
        500
      );

    const challenge =
      cleanString(
        req.query?.[
          "hub.challenge"
        ],
        1000
      );

    if (
      !mode ||
      !token ||
      !challenge
    ) {
      return res.status(400).json({
        success: false,
        status: "invalid",
        error: {
          code:
            "WHATSAPP_VERIFICATION_PARAMETERS_MISSING",
          message:
            "Webhook verification parameters are missing."
        }
      });
    }

    if (
      mode !== "subscribe"
    ) {
      return res.status(403).json({
        success: false,
        status: "forbidden",
        error: {
          code:
            "WHATSAPP_INVALID_VERIFY_MODE",
          message:
            "Invalid webhook verification mode."
        }
      });
    }

    /*
     * Use the existing provider/webhook service for token
     * verification whenever available.
     */
    if (
      whatsappWebhookService &&
      typeof
        whatsappWebhookService.verifyChallenge ===
        "function"
    ) {
      const result =
        await whatsappWebhookService.verifyChallenge(
          mode,
          token,
          challenge
        );

      if (
        result?.verified === true ||
        result === true
      ) {
        return res
          .status(200)
          .send(challenge);
      }

      return res.status(403).json({
        success: false,
        status: "forbidden",
        error: {
          code:
            "WHATSAPP_VERIFY_TOKEN_INVALID",
          message:
            "Webhook verification failed."
        }
      });
    }

    /*
     * Existing service in this project exposes challenge
     * verification through the provider layer. If that
     * interface is unavailable, use the configured token
     * directly rather than accepting the challenge.
     */
    const configuredToken =
      process.env.WHATSAPP_VERIFY_TOKEN;

    if (
      !configuredToken
    ) {
      return res.status(503).json({
        success: false,
        status: "unavailable",
        error: {
          code:
            "WHATSAPP_VERIFY_TOKEN_NOT_CONFIGURED",
          message:
            "WhatsApp webhook verification is not configured."
        }
      });
    }

    const tokenBuffer =
      Buffer.from(
        token,
        "utf8"
      );

    const configuredBuffer =
      Buffer.from(
        configuredToken,
        "utf8"
      );

    if (
      tokenBuffer.length !==
      configuredBuffer.length ||
      !crypto.timingSafeEqual(
        tokenBuffer,
        configuredBuffer
      )
    ) {
      return res.status(403).json({
        success: false,
        status: "forbidden",
        error: {
          code:
            "WHATSAPP_VERIFY_TOKEN_INVALID",
          message:
            "Webhook verification failed."
        }
      });
    }

    return res
      .status(200)
      .send(challenge);
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: "error",
      error: safeError(error)
    });
  }
}

/* =========================================================
   RECEIVE WEBHOOK
========================================================= */

/**
 * POST /api/webhook/whatsapp
 *
 * Signature verification must happen before trusting the
 * JSON payload.
 */
async function receive(
  req,
  res
) {
  try {
    const rawBody =
      getRawBody(req);

    if (!rawBody) {
      return res.status(400).json({
        success: false,
        status: "invalid",
        error: {
          code:
            "WHATSAPP_RAW_BODY_REQUIRED",
          message:
            "Raw webhook body is required."
        }
      });
    }

    const verified =
      await verifyWebhook(
        req,
        rawBody
      );

    if (!verified) {
      return res.status(401).json({
        success: false,
        status: "unauthorized",
        error: {
          code:
            "WHATSAPP_WEBHOOK_SIGNATURE_INVALID",
          message:
            "Webhook signature verification failed."
        }
      });
    }

    const payload =
      parsePayload(
        rawBody
      );

    if (
      !isObject(payload)
    ) {
      return res.status(400).json({
        success: false,
        status: "invalid",
        error: {
          code:
            "WHATSAPP_WEBHOOK_INVALID_JSON",
          message:
            "Invalid WhatsApp webhook payload."
        }
      });
    }

    const messages =
      extractIncomingMessages(
        payload
      );

    const statuses =
      extractStatuses(
        payload
      );

    const processedMessages = [];

    for (
      const message of messages
    ) {
      try {
        const result =
          await processIncomingMessage(
            message
          );

        processedMessages.push(
          result
        );
      } catch (error) {
        processedMessages.push({
          success: false,
          status: "error",
          processed: false,
          error:
            safeError(error)
        });
      }
    }

    /*
     * Return quickly to Meta after authenticating and parsing
     * the event.
     *
     * Long-running financial operations must NOT be performed
     * synchronously inside the webhook request.
     */
    return res.status(200).json({
      success: true,
      status: "received",

      messagesReceived:
        messages.length,

      messagesProcessed:
        processedMessages.filter(
          (item) =>
            item.processed === true
        ).length,

      statusesReceived:
        statuses.length,

      /*
       * Do not return message text or sender phone numbers.
       */
      events: {
        messages:
          processedMessages.map(
            (item) => ({
              success:
                item.success === true,
              status:
                item.status
            })
          ),

        statuses:
          statuses.map(
            (item) => ({
              messageId:
                item.messageId,
              status:
                item.status,
              timestamp:
                item.timestamp
            })
          )
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: "error",
      error: safeError(error)
    });
  }
}

/* =========================================================
   CONTROLLER STATUS
========================================================= */

function status(
  req,
  res
) {
  return res.status(200).json({
    success: true,
    status: "available",

    controller:
      "whatsappWebhookController",

    signatureVerification:
      true,

    ownerAuthorization:
      true,

    commandExecution:
      false,

    paymentExecution:
      false,

    infrastructureExecution:
      false,

    secretExposure:
      false
  });
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  verify,
  receive,
  status,

  /*
   * Explicit aliases.
   */
  verifyWebhook: verify,
  receiveWebhook: receive
};
