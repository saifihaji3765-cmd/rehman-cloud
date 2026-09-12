"use strict";

const crypto = require("crypto");
const whatsappMessageService = require("./whatsappMessageService");

const OWNER_PHONE_ENV = "WHATSAPP_OWNER_PHONE";

function normalizePhone(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/[^\d]/g, "");
}

function getConfiguredOwnerPhone() {
  return normalizePhone(process.env[OWNER_PHONE_ENV]);
}

function isConfigured() {
  return Boolean(getConfiguredOwnerPhone());
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function isOwnerPhone(phone) {
  const incoming = normalizePhone(phone);
  const owner = getConfiguredOwnerPhone();

  if (!incoming || !owner) {
    return false;
  }

  return constantTimeEqual(incoming, owner);
}

function authorizeIncomingMessage({ from } = {}) {
  const normalizedFrom = normalizePhone(from);
  const ownerPhone = getConfiguredOwnerPhone();

  if (!normalizedFrom) {
    return {
      authorized: false,
      reason: "SENDER_PHONE_REQUIRED",
    };
  }

  if (!ownerPhone) {
    return {
      authorized: false,
      reason: "OWNER_PHONE_NOT_CONFIGURED",
    };
  }

  if (!isOwnerPhone(normalizedFrom)) {
    return {
      authorized: false,
      reason: "OWNER_ONLY_ACCESS",
    };
  }

  return {
    authorized: true,
    ownerPhone,
  };
}

function sanitizeCommandText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 4000);
}

function authorizeCommand({ from, text } = {}) {
  const authorization = authorizeIncomingMessage({ from });

  if (!authorization.authorized) {
    return {
      ...authorization,
      command: null,
      text: null,
    };
  }

  const commandText = sanitizeCommandText(text);

  if (!commandText) {
    return {
      authorized: true,
      command: null,
      text: "",
      ownerPhone: authorization.ownerPhone,
      reason: "COMMAND_REQUIRED",
    };
  }

  return {
    authorized: true,
    command: commandText,
    text: commandText,
    ownerPhone: authorization.ownerPhone,
  };
}

function assertOwner({ from } = {}) {
  const result = authorizeIncomingMessage({ from });

  if (!result.authorized) {
    const error = new Error(result.reason || "OWNER_ONLY_ACCESS");
    error.code = result.reason || "OWNER_ONLY_ACCESS";
    error.statusCode = 403;
    throw error;
  }

  return result;
}

async function sendOwnerText({ text, previewUrl = false } = {}) {
  const ownerPhone = getConfiguredOwnerPhone();

  if (!ownerPhone) {
    return {
      success: false,
      status: "not_configured",
      error: "OWNER_PHONE_NOT_CONFIGURED",
    };
  }

  return whatsappMessageService.sendOwnerText({
    ownerPhone,
    text,
    previewUrl,
  });
}

async function sendOwnerTemplate({
  templateName,
  languageCode = "en_US",
  components,
} = {}) {
  const ownerPhone = getConfiguredOwnerPhone();

  if (!ownerPhone) {
    return {
      success: false,
      status: "not_configured",
      error: "OWNER_PHONE_NOT_CONFIGURED",
    };
  }

  return whatsappMessageService.sendOwnerTemplate({
    ownerPhone,
    templateName,
    languageCode,
    components,
  });
}

function getStatus() {
  const ownerPhone = getConfiguredOwnerPhone();

  return {
    configured: Boolean(ownerPhone),
    ownerPhoneConfigured: Boolean(ownerPhone),
    ownerPhone: ownerPhone || null,
    accessPolicy: "owner_only",
  };
}

module.exports = {
  normalizePhone,
  getConfiguredOwnerPhone,
  isConfigured,
  isOwnerPhone,
  authorizeIncomingMessage,
  authorizeCommand,
  assertOwner,
  sendOwnerText,
  sendOwnerTemplate,
  getStatus,
};
