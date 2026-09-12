"use strict";

const whatsappProviderService = require("./whatsappProviderService");

const MAX_MESSAGE_LENGTH = 4096;
const MAX_CHUNKS = 10;

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\u0000/g, "").trim();
}

function normalizePhone(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/[^\d]/g, "");
}

function validateRecipient(to) {
  const phone = normalizePhone(to);

  if (!phone) {
    return {
      valid: false,
      phone: null,
      reason: "WHATSAPP_RECIPIENT_REQUIRED",
    };
  }

  if (phone.length < 8 || phone.length > 15) {
    return {
      valid: false,
      phone: null,
      reason: "INVALID_WHATSAPP_RECIPIENT",
    };
  }

  return {
    valid: true,
    phone,
    reason: null,
  };
}

function splitMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
  const normalized = cleanText(text);

  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength);

    if (splitAt < Math.floor(maxLength * 0.5)) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }

    if (splitAt < Math.floor(maxLength * 0.5)) {
      splitAt = maxLength;
    }

    const chunk = remaining.slice(0, splitAt).trim();

    if (!chunk) {
      break;
    }

    chunks.push(chunk);
    remaining = remaining.slice(splitAt).trim();

    if (chunks.length >= MAX_CHUNKS) {
      throw new Error("WHATSAPP_MESSAGE_TOO_LARGE");
    }
  }

  if (remaining) {
    chunks.push(remaining);
  }

  if (chunks.length > MAX_CHUNKS) {
    throw new Error("WHATSAPP_MESSAGE_TOO_LARGE");
  }

  return chunks;
}

function normalizeProviderResult(result) {
  if (!result || typeof result !== "object") {
    return {
      success: false,
      status: "unavailable",
      messageId: null,
      error: "WHATSAPP_PROVIDER_NO_RESULT",
    };
  }

  const messageId =
    result.messageId ||
    result.providerMessageId ||
    result.id ||
    null;

  if (result.success === true && !messageId) {
    return {
      success: false,
      status: "error",
      messageId: null,
      error: "WHATSAPP_PROVIDER_MESSAGE_ID_MISSING",
    };
  }

  return {
    ...result,
    success: Boolean(result.success && messageId),
    messageId,
  };
}

async function sendText({
  to,
  text,
  previewUrl = false,
  requireOwner = false,
} = {}) {
  const recipient = validateRecipient(to);

  if (!recipient.valid) {
    return {
      success: false,
      status: "invalid",
      error: recipient.reason,
    };
  }

  const normalizedText = cleanText(text);

  if (!normalizedText) {
    return {
      success: false,
      status: "invalid",
      error: "WHATSAPP_MESSAGE_REQUIRED",
    };
  }

  let chunks;

  try {
    chunks = splitMessage(normalizedText);
  } catch (error) {
    return {
      success: false,
      status: "invalid",
      error: error.message,
    };
  }

  const results = [];

  for (const chunk of chunks) {
    let result;

    try {
      result = await whatsappProviderService.sendTextMessage({
        to: recipient.phone,
        text: chunk,
        previewUrl: Boolean(previewUrl),
        requireOwner: Boolean(requireOwner),
      });
    } catch (error) {
      return {
        success: false,
        status: "error",
        error: error.message || "WHATSAPP_SEND_FAILED",
        results,
      };
    }

    const normalizedResult = normalizeProviderResult(result);

    results.push(normalizedResult);

    if (!normalizedResult.success) {
      return {
        success: false,
        status: normalizedResult.status || "error",
        error:
          normalizedResult.error ||
          "WHATSAPP_MESSAGE_NOT_SENT",
        results,
      };
    }
  }

  return {
    success: true,
    status: "sent",
    recipient: recipient.phone,
    messageId:
      results.length === 1
        ? results[0].messageId
        : null,
    messageIds: results.map((item) => item.messageId),
    chunks: results.length,
    results,
  };
}

async function sendTemplate({
  to,
  templateName,
  languageCode = "en_US",
  components,
  requireOwner = false,
} = {}) {
  const recipient = validateRecipient(to);

  if (!recipient.valid) {
    return {
      success: false,
      status: "invalid",
      error: recipient.reason,
    };
  }

  const template = cleanText(templateName);

  if (!template) {
    return {
      success: false,
      status: "invalid",
      error: "WHATSAPP_TEMPLATE_NAME_REQUIRED",
    };
  }

  let result;

  try {
    result = await whatsappProviderService.sendTemplateMessage({
      to: recipient.phone,
      templateName: template,
      languageCode: cleanText(languageCode) || "en_US",
      components: Array.isArray(components) ? components : undefined,
      requireOwner: Boolean(requireOwner),
    });
  } catch (error) {
    return {
      success: false,
      status: "error",
      error: error.message || "WHATSAPP_TEMPLATE_SEND_FAILED",
    };
  }

  const normalizedResult = normalizeProviderResult(result);

  if (!normalizedResult.success) {
    return {
      success: false,
      status: normalizedResult.status || "error",
      error:
        normalizedResult.error ||
        "WHATSAPP_TEMPLATE_NOT_SENT",
      result: normalizedResult,
    };
  }

  return {
    success: true,
    status: "sent",
    recipient: recipient.phone,
    messageId: normalizedResult.messageId,
    result: normalizedResult,
  };
}

async function sendOwnerText({
  ownerPhone,
  text,
  previewUrl = false,
} = {}) {
  const recipient = validateRecipient(ownerPhone);

  if (!recipient.valid) {
    return {
      success: false,
      status: "invalid",
      error: recipient.reason,
    };
  }

  return sendText({
    to: recipient.phone,
    text,
    previewUrl,
    requireOwner: true,
  });
}

async function sendOwnerTemplate({
  ownerPhone,
  templateName,
  languageCode = "en_US",
  components,
} = {}) {
  const recipient = validateRecipient(ownerPhone);

  if (!recipient.valid) {
    return {
      success: false,
      status: "invalid",
      error: recipient.reason,
    };
  }

  return sendTemplate({
    to: recipient.phone,
    templateName,
    languageCode,
    components,
    requireOwner: true,
  });
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  MAX_CHUNKS,
  cleanText,
  normalizePhone,
  validateRecipient,
  splitMessage,
  sendText,
  sendTemplate,
  sendOwnerText,
  sendOwnerTemplate,
};
