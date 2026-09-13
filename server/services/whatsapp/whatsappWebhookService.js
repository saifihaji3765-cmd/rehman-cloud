"use strict";

/**
 * =========================================================
 * ZyrionOS WHATSAPP WEBHOOK SERVICE
 * =========================================================
 *
 * Responsibilities:
 * - Meta webhook signature verification
 * - Meta webhook verification challenge
 * - Safe raw-body parsing
 * - WhatsApp Cloud API payload normalization
 * - Message extraction
 * - Status extraction
 * - Provider error extraction
 *
 * IMPORTANT:
 * - Does NOT execute commands.
 * - Does NOT execute payments.
 * - Does NOT execute infrastructure actions.
 * - Does NOT send WhatsApp messages.
 * - Does NOT expose secrets.
 * - Signature verification uses the exact raw request body.
 *
 * Location:
 *
 *   server/services/whatsapp/whatsappWebhookService.js
 *
 * Provider service:
 *
 *   ./whatsappProviderService
 * =========================================================
 */

const crypto =
  require("crypto");

const whatsappProviderService =
  require("./whatsappProviderService");


/* =========================================================
   CONSTANTS
========================================================= */

const MAX_BODY_SIZE =
  1024 * 1024;

const MAX_TEXT_LENGTH =
  4096;

const MAX_ENTRIES =
  100;

const MAX_ERROR_ITEMS =
  50;


/* =========================================================
   STATUS CONSTANTS
========================================================= */

const STATUS = Object.freeze({
  VERIFIED:
    "verified",

  INVALID:
    "invalid",

  UNAUTHORIZED:
    "unauthorized",

  NOT_CONFIGURED:
    "not_configured",

  AVAILABLE:
    "available",

  ERROR:
    "error"
});


/* =========================================================
   HELPERS
========================================================= */

function isObject(
  value
) {
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

  const stringValue =
    String(value).trim();

  if (!stringValue) {
    return null;
  }

  return stringValue.slice(
    0,
    maxLength
  );
}


function normalizePhone(
  value
) {
  const phone =
    cleanString(
      value,
      100
    );

  if (!phone) {
    return null;
  }

  /*
   * WhatsApp Cloud API normally provides an international
   * phone number. Keep only a safe normalized representation.
   */
  const normalized =
    phone.replace(
      /[^\d+]/g,
      ""
    );

  return (
    normalized ||
    null
  );
}


function normalizeTimestamp(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const numeric =
    Number(value);

  if (
    Number.isFinite(
      numeric
    )
  ) {
    return numeric;
  }

  return cleanString(
    value,
    100
  );
}


function safeError(
  error
) {
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
   RAW BODY NORMALIZATION
========================================================= */

function normalizeRawBody(
  rawBody
) {
  if (
    Buffer.isBuffer(
      rawBody
    )
  ) {
    if (
      rawBody.length >
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

    return rawBody;
  }


  if (
    typeof rawBody ===
    "string"
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
      const error =
        new Error(
          "WhatsApp webhook body is too large."
        );

      error.code =
        "WEBHOOK_BODY_TOO_LARGE";

      throw error;
    }

    return buffer;
  }


  /*
   * Objects are intentionally NOT serialized for signature
   * verification because serialization can change the exact
   * bytes that Meta signed.
   */
  if (
    isObject(rawBody)
  ) {
    return null;
  }


  return null;
}


/* =========================================================
   SIGNATURE HEADER NORMALIZATION
========================================================= */

function normalizeSignature(
  signature
) {
  const value =
    cleanString(
      signature,
      500
    );

  if (!value) {
    return null;
  }

  return value;
}


/* =========================================================
   SIGNATURE HEX EXTRACTION
========================================================= */

function extractSignatureHex(
  signature
) {
  const normalized =
    normalizeSignature(
      signature
    );

  if (!normalized) {
    return null;
  }

  let value =
    normalized;

  if (
    value
      .toLowerCase()
      .startsWith(
        "sha256="
      )
  ) {
    value =
      value.slice(
        7
      );
  }

  value =
    value.trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(
      value
    )
  ) {
    return null;
  }

  return value;
}


/* =========================================================
   APP SECRET
========================================================= */

function getAppSecret() {
  /*
   * Keep compatibility with the existing environment naming.
   */
  return (
    cleanString(
      process.env.WHATSAPP_APP_SECRET,
      500
    ) ||
    cleanString(
      process.env.META_APP_SECRET,
      500
    ) ||
    null
  );
}


/* =========================================================
   VERIFY SIGNATURE
========================================================= */

function verifySignature(
  rawBody,
  signature
) {
  try {
    const body =
      normalizeRawBody(
        rawBody
      );

    if (!body) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        verified: false,

        error: {
          code:
            "WHATSAPP_RAW_BODY_REQUIRED",

          message:
            "Raw webhook body is required for signature verification."
        }
      };
    }


    const secret =
      getAppSecret();

    if (!secret) {
      return {
        success: false,

        status:
          STATUS.NOT_CONFIGURED,

        verified: false,

        error: {
          code:
            "WHATSAPP_APP_SECRET_NOT_CONFIGURED",

          message:
            "WhatsApp webhook app secret is not configured."
        }
      };
    }


    const signatureHex =
      extractSignatureHex(
        signature
      );

    if (!signatureHex) {
      return {
        success: false,

        status:
          STATUS.UNAUTHORIZED,

        verified: false,

        error: {
          code:
            "WHATSAPP_SIGNATURE_INVALID",

          message:
            "WhatsApp webhook signature is missing or invalid."
        }
      };
    }


    const expected =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(
          body
        )
        .digest(
          "hex"
        );


    const expectedBuffer =
      Buffer.from(
        expected,
        "hex"
      );

    const receivedBuffer =
      Buffer.from(
        signatureHex,
        "hex"
      );


    if (
      expectedBuffer.length !==
      receivedBuffer.length
    ) {
      return {
        success: false,

        status:
          STATUS.UNAUTHORIZED,

        verified: false,

        error: {
          code:
            "WHATSAPP_SIGNATURE_MISMATCH",

          message:
            "WhatsApp webhook signature verification failed."
        }
      };
    }


    const verified =
      crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
      );


    if (!verified) {
      return {
        success: false,

        status:
          STATUS.UNAUTHORIZED,

        verified: false,

        error: {
          code:
            "WHATSAPP_SIGNATURE_MISMATCH",

          message:
            "WhatsApp webhook signature verification failed."
        }
      };
    }


    return {
      success: true,

      status:
        STATUS.VERIFIED,

      verified: true
    };
  } catch (error) {
    return {
      success: false,

      status:
        STATUS.ERROR,

      verified: false,

      error:
        safeError(error)
    };
  }
}


/* =========================================================
   JSON PARSER
========================================================= */

function parseBody(
  rawBody
) {
  try {
    let body =
      normalizeRawBody(
        rawBody
      );


    /*
     * Support an already parsed object for internal use.
     * This function is NOT used to calculate signatures.
     */
    if (
      isObject(rawBody)
    ) {
      return {
        success: true,

        status:
          STATUS.AVAILABLE,

        data:
          rawBody
      };
    }


    if (!body) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_RAW_BODY_REQUIRED",

          message:
            "Raw webhook body is required."
        }
      };
    }


    const text =
      body.toString(
        "utf8"
      );


    if (!text.trim()) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_EMPTY_BODY",

          message:
            "WhatsApp webhook body is empty."
        }
      };
    }


    let parsed;

    try {
      parsed =
        JSON.parse(
          text
        );
    } catch (error) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_INVALID_JSON",

          message:
            "WhatsApp webhook body contains invalid JSON."
        }
      };
    }


    if (
      !isObject(parsed)
    ) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_INVALID_PAYLOAD",

          message:
            "WhatsApp webhook payload must be a JSON object."
        }
      };
    }


    return {
      success: true,

      status:
        STATUS.AVAILABLE,

      data:
        parsed
    };
  } catch (error) {
    return {
      success: false,

      status:
        STATUS.ERROR,

      error:
        safeError(error)
    };
  }
}


/* =========================================================
   ENTRY EXTRACTION
========================================================= */

function getEntries(
  payload
) {
  if (
    !isObject(payload)
  ) {
    return [];
  }


  if (
    !Array.isArray(
      payload.entry
    )
  ) {
    return [];
  }


  return payload.entry
    .slice(
      0,
      MAX_ENTRIES
    )
    .filter(
      isObject
    );
}


/* =========================================================
   CHANGE EXTRACTION
========================================================= */

function getChanges(
  entry
) {
  if (
    !isObject(entry)
  ) {
    return [];
  }


  if (
    !Array.isArray(
      entry.changes
    )
  ) {
    return [];
  }


  return entry.changes
    .slice(
      0,
      MAX_ENTRIES
    )
    .filter(
      isObject
    );
}


/* =========================================================
   VALUE EXTRACTION
========================================================= */

function getValue(
  change
) {
  if (
    !isObject(change)
  ) {
    return null;
  }


  if (
    !isObject(
      change.value
    )
  ) {
    return null;
  }


  return change.value;
}


/* =========================================================
   CONTACT NAME MAP
========================================================= */

function buildContactMap(
  value
) {
  const map =
    new Map();


  if (
    !isObject(value) ||
    !Array.isArray(
      value.contacts
    )
  ) {
    return map;
  }


  for (
    const contact of value.contacts.slice(
      0,
      MAX_ENTRIES
    )
  ) {
    if (
      !isObject(contact)
    ) {
      continue;
    }


    const waId =
      normalizePhone(
        contact.wa_id
      );


    if (!waId) {
      continue;
    }


    const profile =
      isObject(
        contact.profile
      )
        ? contact.profile
        : {};


    const name =
      cleanString(
        profile.name,
        300
      );


    map.set(
      waId,
      name
    );
  }


  return map;
}


/* =========================================================
   MESSAGE TEXT EXTRACTION
========================================================= */

function extractText(
  message
) {
  if (
    !isObject(message)
  ) {
    return null;
  }


  /*
   * Standard text message.
   */
  if (
    isObject(
      message.text
    )
  ) {
    return cleanString(
      message.text.body,
      MAX_TEXT_LENGTH
    );
  }


  /*
   * Button reply.
   */
  if (
    isObject(
      message.button
    )
  ) {
    return (
      cleanString(
        message.button.text,
        MAX_TEXT_LENGTH
      ) ||
      cleanString(
        message.button.payload,
        MAX_TEXT_LENGTH
      )
    );
  }


  /*
   * Interactive reply.
   */
  if (
    isObject(
      message.interactive
    )
  ) {
    const interactive =
      message.interactive;


    if (
      isObject(
        interactive.button_reply
      )
    ) {
      return (
        cleanString(
          interactive.button_reply.title,
          MAX_TEXT_LENGTH
        ) ||
        cleanString(
          interactive.button_reply.id,
          MAX_TEXT_LENGTH
        )
      );
    }


    if (
      isObject(
        interactive.list_reply
      )
    ) {
      return (
        cleanString(
          interactive.list_reply.title,
          MAX_TEXT_LENGTH
        ) ||
        cleanString(
          interactive.list_reply.id,
          MAX_TEXT_LENGTH
        )
      );
    }
  }


  return null;
}


/* =========================================================
   MESSAGE TYPE
========================================================= */

function getMessageType(
  message
) {
  const type =
    cleanString(
      message?.type,
      100
    );

  return (
    type ||
    "unknown"
  );
}


/* =========================================================
   MESSAGE EXTRACTION
========================================================= */

function extractMessages(
  payload
) {
  const messages =
    [];


  const entries =
    getEntries(
      payload
    );


  for (
    const entry of entries
  ) {
    const changes =
      getChanges(
        entry
      );


    for (
      const change of changes
    ) {
      const value =
        getValue(
          change
        );


      if (!value) {
        continue;
      }


      const contactMap =
        buildContactMap(
          value
        );


      if (
        !Array.isArray(
          value.messages
        )
      ) {
        continue;
      }


      for (
        const message of value.messages.slice(
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
          normalizePhone(
            message.from
          );


        const messageId =
          cleanString(
            message.id,
            300
          );


        if (
          !from &&
          !messageId
        ) {
          continue;
        }


        const text =
          extractText(
            message
          );


        const type =
          getMessageType(
            message
          );


        const profileName =
          from
            ? contactMap.get(
                from
              ) || null
            : null;


        messages.push({
          messageId:
            messageId ||
            null,

          from:
            from ||
            null,

          profileName:
            profileName ||
            null,

          text:
            text ||
            null,

          timestamp:
            normalizeTimestamp(
              message.timestamp
            ),

          type,

          provider:
            "whatsapp_cloud_api",

          phoneNumberId:
            cleanString(
              value.metadata
                ?.phone_number_id,
              300
            ) || null,

          displayPhoneNumber:
            cleanString(
              value.metadata
                ?.display_phone_number,
              100
            ) || null
        });


        if (
          messages.length >=
          MAX_ENTRIES
        ) {
          return messages;
        }
      }
    }
  }


  return messages;
}


/* =========================================================
   STATUS EXTRACTION
========================================================= */

function extractStatuses(
  payload
) {
  const statuses =
    [];


  const entries =
    getEntries(
      payload
    );


  for (
    const entry of entries
  ) {
    const changes =
      getChanges(
        entry
      );


    for (
      const change of changes
    ) {
      const value =
        getValue(
          change
        );


      if (!value) {
        continue;
      }


      if (
        !Array.isArray(
          value.statuses
        )
      ) {
        continue;
      }


      for (
        const status of value.statuses.slice(
          0,
          MAX_ENTRIES
        )
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
            ) || null,

          recipientId:
            normalizePhone(
              status.recipient_id
            ),

          status:
            cleanString(
              status.status,
              100
            ) || null,

          timestamp:
            normalizeTimestamp(
              status.timestamp
            ),

          conversation:
            isObject(
              status.conversation
            )
              ? {
                  id:
                    cleanString(
                      status.conversation.id,
                      300
                    ) || null,

                  origin:
                    isObject(
                      status
                        .conversation
                        .origin
                    )
                      ? {
                          type:
                            cleanString(
                              status
                                .conversation
                                .origin
                                .type,
                              100
                            ) || null
                        }
                      : null,

                  expirationTimestamp:
                    normalizeTimestamp(
                      status
                        .conversation
                        .expiration_timestamp
                    )
                }
              : null,

          pricing:
            isObject(
              status.pricing
            )
              ? {
                  billable:
                    typeof status
                      .pricing
                      .billable ===
                    "boolean"
                      ? status
                          .pricing
                          .billable
                      : null,

                  pricingModel:
                    cleanString(
                      status
                        .pricing
                        .pricing_model,
                      100
                    ) || null,

                  category:
                    cleanString(
                      status
                        .pricing
                        .category,
                      100
                    ) || null
                }
              : null,

          provider:
            "whatsapp_cloud_api"
        });


        if (
          statuses.length >=
          MAX_ENTRIES
        ) {
          return statuses;
        }
      }
    }
  }


  return statuses;
}


/* =========================================================
   PROVIDER ERROR EXTRACTION
========================================================= */

function extractErrors(
  payload
) {
  const errors =
    [];


  const entries =
    getEntries(
      payload
    );


  for (
    const entry of entries
  ) {
    const changes =
      getChanges(
        entry
      );


    for (
      const change of changes
    ) {
      const value =
        getValue(
          change
        );


      if (!value) {
        continue;
      }


      if (
        Array.isArray(
          value.errors
        )
      ) {
        for (
          const item of value.errors.slice(
            0,
            MAX_ERROR_ITEMS
          )
        ) {
          if (
            !isObject(item)
          ) {
            continue;
          }


          errors.push({
            code:
              item.code ??
              null,

            title:
              cleanString(
                item.title,
                500
              ) || null,

            message:
              cleanString(
                item.message,
                1000
              ) || null,

            errorData:
              isObject(
                item.error_data
              )
                ? {
                    details:
                      cleanString(
                        item
                          .error_data
                          .details,
                        1000
                      ) || null
                  }
                : null,

            provider:
              "whatsapp_cloud_api"
          });


          if (
            errors.length >=
            MAX_ERROR_ITEMS
          ) {
            return errors;
          }
        }
      }
    }
  }


  return errors;
}


/* =========================================================
   WEBHOOK FIELD SUMMARY
========================================================= */

function getWebhookSummary(
  payload
) {
  const entries =
    getEntries(
      payload
    );


  let changesCount =
    0;

  let messagesCount =
    0;

  let statusesCount =
    0;

  let errorsCount =
    0;


  for (
    const entry of entries
  ) {
    const changes =
      getChanges(
        entry
      );


    changesCount +=
      changes.length;


    for (
      const change of changes
    ) {
      const value =
        getValue(
          change
        );


      if (!value) {
        continue;
      }


      if (
        Array.isArray(
          value.messages
        )
      ) {
        messagesCount +=
          Math.min(
            value.messages.length,
            MAX_ENTRIES
          );
      }


      if (
        Array.isArray(
          value.statuses
        )
      ) {
        statusesCount +=
          Math.min(
            value.statuses.length,
            MAX_ENTRIES
          );
      }


      if (
        Array.isArray(
          value.errors
        )
      ) {
        errorsCount +=
          Math.min(
            value.errors.length,
            MAX_ERROR_ITEMS
          );
      }
    }
  }


  return {
    object:
      cleanString(
        payload?.object,
        100
      ) || null,

    entries:
      entries.length,

    changes:
      changesCount,

    messages:
      messagesCount,

    statuses:
      statusesCount,

    errors:
      errorsCount
  };
}


/* =========================================================
   VERIFICATION CHALLENGE
========================================================= */

/**
 * Meta verification:
 *
 * mode      -> hub.mode
 * token     -> hub.verify_token
 * challenge -> hub.challenge
 *
 * Provider service remains the authority for configured
 * verification credentials.
 */
async function verifyChallenge(
  input = {}
) {
  try {
    const mode =
      cleanString(
        input?.mode,
        100
      );

    const token =
      cleanString(
        input?.token,
        500
      );

    const challenge =
      cleanString(
        input?.challenge,
        1000
      );


    if (
      mode !==
      "subscribe"
    ) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_INVALID_VERIFY_MODE",

          message:
            "Invalid webhook verification mode."
        }
      };
    }


    if (
      !token ||
      !challenge
    ) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_VERIFICATION_PARAMETERS_MISSING",

          message:
            "Webhook verification parameters are missing."
        }
      };
    }


    /*
     * Current provider service owns the actual verification
     * token configuration.
     */
    if (
      whatsappProviderService &&
      typeof
        whatsappProviderService.verifyWebhookChallenge ===
          "function"
    ) {
      const result =
        await Promise.resolve(
          whatsappProviderService
            .verifyWebhookChallenge({
              mode,
              token,
              challenge
            })
        );


      if (
        result === true
      ) {
        return {
          success: true,

          status:
            STATUS.VERIFIED,

          challenge
        };
      }


      if (
        isObject(result)
      ) {
        if (
          result.success ===
          true
        ) {
          return {
            success: true,

            status:
              STATUS.VERIFIED,

            challenge:
              result.challenge ||
              challenge
          };
        }


        return {
          success: false,

          status:
            result.status ||
            STATUS.UNAUTHORIZED,

          error:
            isObject(
              result.error
            )
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
        };
      }
    }


    /*
     * Compatibility fallback:
     *
     * Some provider-service versions expose configuration
     * but not a dedicated challenge method.
     */
    const configuredToken =
      cleanString(
        process.env.WHATSAPP_VERIFY_TOKEN,
        500
      );


    if (
      !configuredToken
    ) {
      return {
        success: false,

        status:
          STATUS.NOT_CONFIGURED,

        error: {
          code:
            "WHATSAPP_VERIFY_TOKEN_NOT_CONFIGURED",

          message:
            "WhatsApp verification token is not configured."
        }
      };
    }


    const tokenMatches =
      crypto.timingSafeEqual(
        Buffer.from(
          configuredToken,
          "utf8"
        ),
        Buffer.from(
          token,
          "utf8"
        )
      );


    if (!tokenMatches) {
      return {
        success: false,

        status:
          STATUS.UNAUTHORIZED,

        error: {
          code:
            "WHATSAPP_VERIFY_TOKEN_INVALID",

          message:
            "Webhook verification token is invalid."
        }
      };
    }


    return {
      success: true,

      status:
        STATUS.VERIFIED,

      challenge
    };
  } catch (error) {
    return {
      success: false,

      status:
        STATUS.ERROR,

      error:
        safeError(error)
    };
  }
}


/* =========================================================
   PROCESS WEBHOOK
========================================================= */

/**
 * Complete webhook processing:
 *
 * 1. Receive exact raw body
 * 2. Verify signature
 * 3. Parse JSON
 * 4. Extract messages
 * 5. Extract statuses
 * 6. Extract provider errors
 *
 * No commands are executed here.
 */
async function processWebhook(
  input = {}
) {
  try {
    const rawBody =
      input?.rawBody ??
      input?.body ??
      null;


    const signature =
      input?.signature ??
      input?.["x-hub-signature-256"] ??
      null;


    if (!rawBody) {
      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_RAW_BODY_REQUIRED",

          message:
            "Raw webhook body is required."
        }
      };
    }


    /*
     * Verify exact bytes before parsing.
     */
    const signatureResult =
      verifySignature(
        rawBody,
        signature
      );


    if (
      signatureResult?.verified !==
      true
    ) {
      return signatureResult;
    }


    /*
     * Parse only after successful signature verification.
     */
    const parsed =
      parseBody(
        rawBody
      );


    if (
      parsed?.success !==
      true
    ) {
      return {
        success: false,

        status:
          parsed?.status ||
          STATUS.INVALID,

        error:
          parsed?.error || {
            code:
              "WHATSAPP_PAYLOAD_PARSE_FAILED",

            message:
              "Unable to parse WhatsApp webhook payload."
          }
      };
    }


    const payload =
      parsed.data;


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


    const summary =
      getWebhookSummary(
        payload
      );


    return {
      success: true,

      status:
        STATUS.VERIFIED,

      verified: true,

      provider:
        "whatsapp_cloud_api",

      object:
        summary.object,

      entries:
        summary.entries,

      changes:
        summary.changes,

      messages,

      statuses,

      errors,

      summary
    };
  } catch (error) {
    return {
      success: false,

      status:
        STATUS.ERROR,

      verified: false,

      error:
        safeError(error)
    };
  }
}


/* =========================================================
   VALIDATE WEBHOOK INPUT
========================================================= */

function validateWebhookInput(
  input = {}
) {
  const rawBody =
    input?.rawBody ??
    input?.body ??
    null;


  const signature =
    input?.signature ??
    input?.["x-hub-signature-256"] ??
    null;


  if (!rawBody) {
    return {
      valid: false,

      reason:
        "RAW_BODY_REQUIRED"
    };
  }


  if (!signature) {
    return {
      valid: false,

      reason:
        "SIGNATURE_REQUIRED"
    };
  }


  return {
    valid: true
  };
}


/* =========================================================
   SERVICE STATUS
========================================================= */

function getStatus() {
  const appSecretConfigured =
    Boolean(
      getAppSecret()
    );

  const verifyTokenConfigured =
    Boolean(
      cleanString(
        process.env.WHATSAPP_VERIFY_TOKEN,
        500
      )
    );


  return {
    success: true,

    status:
      "available",

    provider:
      "whatsapp_cloud_api",

    signatureVerification:
      appSecretConfigured,

    verificationChallenge:
      verifyTokenConfigured,

    appSecretConfigured,

    verifyTokenConfigured,

    rawBodyRequired:
      true,

    commandExecution:
      false,

    paymentExecution:
      false,

    infrastructureExecution:
      false,

    secretExposure:
      false
  };
}


/* =========================================================
   CALLABLE SERVICE
========================================================= */

async function whatsappWebhookService(
  input = {}
) {
  const operation =
    cleanString(
      input?.operation,
      100
    ) ||
    "process";


  switch (
    operation.toLowerCase()
  ) {
    case "verify":

    case "signature":

      return verifySignature(
        input?.rawBody ??
          input?.body,

        input?.signature ??
          input?.["x-hub-signature-256"]
      );


    case "challenge":

    case "verification":

      return verifyChallenge(
        input
      );


    case "parse":

      return parseBody(
        input?.rawBody ??
          input?.body
      );


    case "process":

    case "webhook":

      return processWebhook(
        input
      );


    case "status":

      return getStatus();


    case "validate":

      return validateWebhookInput(
        input
      );


    default:

      return {
        success: false,

        status:
          STATUS.INVALID,

        error: {
          code:
            "WHATSAPP_UNKNOWN_WEBHOOK_OPERATION",

          message:
            "Unknown WhatsApp webhook operation."
        }
      };
  }
}


/* =========================================================
   ATTACHED METHODS
========================================================= */

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

whatsappWebhookService.verifyChallenge =
  verifyChallenge;

whatsappWebhookService.processWebhook =
  processWebhook;

whatsappWebhookService.validateWebhookInput =
  validateWebhookInput;

whatsappWebhookService.getStatus =
  getStatus;


/* =========================================================
   METADATA
========================================================= */

whatsappWebhookService.provider =
  "whatsapp_cloud_api";

whatsappWebhookService.version =
  "1.0.0";


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  whatsappWebhookService;
