"use strict";

/**
 * =========================================================
 * ZyrionOS WHATSAPP WEBHOOK CONTROLLER
 * =========================================================
 *
 * Responsibilities:
 * - Meta webhook verification challenge
 * - Raw-body signature verification
 * - Safe webhook parsing
 * - Owner authorization for incoming messages
 * - Safe command extraction
 *
 * IMPORTANT:
 * - Does NOT execute payments.
 * - Does NOT execute infrastructure actions.
 * - Does NOT send WhatsApp messages.
 * - Does NOT trust client-supplied owner identity.
 * - Does NOT expose secrets.
 *
 * Signature and payload parsing remain owned by:
 *
 *   services/whatsapp/whatsappWebhookService.js
 *
 * This controller is the HTTP boundary only.
 */

const whatsappWebhookService =
  require(
    "../services/whatsapp/whatsappWebhookService"
  );

const whatsappOwnerService =
  require(
    "../services/whatsapp/whatsappOwnerService"
  );

const whatsappSecurityService =
  require(
    "../services/whatsapp/whatsappSecurityService"
  );

const MAX_BODY_SIZE =
  1024 * 1024;

const MAX_TEXT_LENGTH =
  4096;

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
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const valueString =
    String(value).trim();

  if (!valueString) {
    return null;
  }

  return valueString.slice(
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
    Buffer.isBuffer(
      req?.body
    )
  ) {
    if (
      req.body.length >
      MAX_BODY_SIZE
    ) {
      const error =
        new Error(
          "WhatsApp webhook body is too large."
        );

      error.code =
        "WEBHOOK_BODY_TOO_LARGE";

      throw error;
    }

    return req.body;
  }

  /*
   * A string body can be used by some custom middleware
   * configurations.
   */
  if (
    typeof req?.body ===
    "string"
  ) {
    const body =
      Buffer.from(
        req.body,
        "utf8"
      );

    if (
      body.length >
      MAX_BODY_SIZE
    ) {
      const error =
        new Error(
          "WhatsApp webhook body is too large."
        );

      error.code =
        "WEBHOOK_BODY_TOO_LARGE";

      throw error;
    }

    return body;
  }

  /*
   * Do NOT stringify a parsed JSON object here.
   *
   * Signature verification requires the original bytes.
   */
  return null;
}

/* =========================================================
   META VERIFICATION CHALLENGE
========================================================= */

/**
 * GET /api/webhook/whatsapp
 *
 * Meta sends:
 *
 * hub.mode
 * hub.verify_token
 * hub.challenge
 *
 * No authentication middleware is used.
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
     * IMPORTANT:
     *
     * whatsappWebhookService.verifyChallenge()
     * expects ONE object.
     */
    const result =
      await whatsappWebhookService.verifyChallenge(
        {
          mode,
          token,
          challenge
        }
      );

    /*
     * Provider service should be the authority for the
     * verification result.
     */
    if (
      result === true
    ) {
      return res
        .status(200)
        .send(challenge);
    }

    if (
      isObject(result) &&
      result.success === true
    ) {
      return res
        .status(200)
        .send(
          result.challenge ||
            challenge
        );
    }

    return res.status(403).json({
      success: false,
      status: "forbidden",
      error:
        isObject(result) &&
        isObject(result.error)
          ? {
              code:
                cleanString(
                  result.error.code,
                  200
                ) ||
                "WHATSAPP_VERIFY_FAILED",

              message:
                cleanString(
                  result.error.message,
                  1000
                ) ||
                "Webhook verification failed."
            }
          : {
              code:
                "WHATSAPP_VERIFY_FAILED",
              message:
                "Webhook verification failed."
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
   SIGNATURE VERIFICATION
========================================================= */

async function verifyRequestSignature(
  req
) {
  const rawBody =
    getRawBody(req);

  if (!rawBody) {
    return {
      success: false,
      status: "invalid",
      verified: false,
      error: {
        code:
          "WHATSAPP_RAW_BODY_REQUIRED",
        message:
          "Raw webhook body is required for signature verification."
      }
    };
  }

  const signature =
    cleanString(
      req.headers?.[
        "x-hub-signature-256"
      ],
      500
    );

  if (!signature) {
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

  /*
   * Existing service is the single source of truth.
   */
  const result =
    whatsappWebhookService.verifySignature(
      rawBody,
      signature
    );

  /*
   * verifySignature() is synchronous in the current service,
   * but Promise.resolve() also keeps this controller compatible
   * if that service becomes asynchronous later.
   */
  return await Promise.resolve(
    result
  );
}

/* =========================================================
   PAYLOAD PROCESSING
========================================================= */

async function processWebhookRequest(
  req
) {
  const rawBody =
    getRawBody(req);

  if (!rawBody) {
    return {
      success: false,
      status: "invalid",
      error: {
        code:
          "WHATSAPP_RAW_BODY_REQUIRED",
        message:
          "Raw webhook body is required."
      }
    };
  }

  /*
   * First verify the exact bytes.
   */
  const signatureResult =
    whatsappWebhookService.verifySignature(
      rawBody,
      req.headers?.[
        "x-hub-signature-256"
      ]
    );

  if (
    signatureResult?.verified !==
    true
  ) {
    return signatureResult;
  }

  /*
   * Now let the existing service parse and normalize the
   * verified webhook.
   */
  const result =
    whatsappWebhookService.processWebhook(
      {
        rawBody,
        signature:
          req.headers?.[
            "x-hub-signature-256"
          ]
      }
    );

  return await Promise.resolve(
    result
  );
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
   * Existing owner service is the authority.
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
   * Fallback only if the existing owner service exposes
   * isOwnerPhone().
   */
  if (
    whatsappOwnerService &&
    typeof
      whatsappOwnerService.isOwnerPhone ===
        "function"
  ) {
    try {
      const authorized =
        await whatsappOwnerService.isOwnerPhone(
          phone
        );

      return {
        authorized:
          authorized === true,

        reason:
          authorized === true
            ? null
            : "OWNER_ACCESS_REQUIRED"
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
   * Fail closed.
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

function validateCommand(
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
   * Use the existing security service when its current
   * interface provides an incoming-message validator.
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
   NORMALIZED OWNER COMMAND
========================================================= */

async function processIncomingMessage(
  message
) {
  const authorization =
    await authorizeMessage(
      message
    );

  /*
   * Fail closed.
   *
   * We intentionally do not tell unauthorized senders
   * why they were rejected.
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

  const command =
    validateCommand(
      message.text
    );

  if (
    command.valid !== true
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
          command.reason
      }
    };
  }

  /*
   * This controller ONLY produces an authorized,
   * security-checked command.
   *
   * It deliberately does not execute it.
   */
  return {
    success: true,
    status:
      "authorized_command",
    processed: true,

    command: {
      messageId:
        message.messageId || null,

      from:
        message.from || null,

      text:
        command.text,

      timestamp:
        message.timestamp || null,

      type:
        message.type || "unknown",

      provider:
        message.provider ||
        "whatsapp_cloud_api"
    }
  };
}

/* =========================================================
   RECEIVE WEBHOOK
========================================================= */

/**
 * POST /api/webhook/whatsapp
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

    /*
     * Verify exact raw bytes first.
     */
    const signatureResult =
      whatsappWebhookService.verifySignature(
        rawBody,
        req.headers?.[
          "x-hub-signature-256"
        ]
      );

    if (
      signatureResult?.verified !==
      true
    ) {
      const statusCode =
        signatureResult?.status ===
        "not_configured"
          ? 503
          : 401;

      return res
        .status(statusCode)
        .json(
          signatureResult
        );
    }

    /*
     * Parse through the existing service.
     */
    const webhookResult =
      whatsappWebhookService.processWebhook(
        {
          rawBody,
          signature:
            req.headers?.[
              "x-hub-signature-256"
            ]
        }
      );

    if (
      webhookResult?.success !==
      true
    ) {
      return res.status(400).json(
        webhookResult
      );
    }

    const messages =
      Array.isArray(
        webhookResult.messages
      )
        ? webhookResult.messages
        : [];

    const statuses =
      Array.isArray(
        webhookResult.statuses
      )
        ? webhookResult.statuses
        : [];

    const providerErrors =
      Array.isArray(
        webhookResult.errors
      )
        ? webhookResult.errors
        : [];

    const processedMessages = [];

    /*
     * Owner authorization and command validation happen
     * after signature verification.
     */
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
     * Return a minimal response.
     *
     * Do NOT echo:
     * - sender phone numbers
     * - command text
     * - provider secrets
     * - raw webhook payload
     */
    return res.status(200).json({
      success: true,
      status: "received",

      provider:
        "whatsapp_cloud_api",

      messagesReceived:
        messages.length,

      messagesProcessed:
        processedMessages.filter(
          (item) =>
            item.processed === true
        ).length,

      unauthorizedMessages:
        processedMessages.filter(
          (item) =>
            item.status ===
            "ignored_unauthorized"
        ).length,

      rejectedMessages:
        processedMessages.filter(
          (item) =>
            item.status ===
            "message_rejected"
        ).length,

      statusesReceived:
        statuses.length,

      providerErrors:
        providerErrors.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: "error",
      error:
        safeError(error)
    });
  }
}

/* =========================================================
   STATUS
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

  verifyWebhook:
    verify,

  receiveWebhook:
    receive,

  verifyRequestSignature
};
