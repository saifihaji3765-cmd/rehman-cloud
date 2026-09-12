"use strict";

const crypto = require("crypto");

const MAX_TEXT_LENGTH = 4000;
const MAX_COMMAND_LENGTH = 1000;
const MAX_ARGUMENT_LENGTH = 1000;

const BLOCKED_PATTERNS = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\bprivate[_ -]?key\b/i,
  /\bsecret[_ -]?key\b/i,
  /\baccess[_ -]?token\b/i,
  /\brefresh[_ -]?token\b/i,
  /\bapi[_ -]?key\b/i,
  /\bclient[_ -]?secret\b/i,
  /\bpassword\b/i,
  /\bpasswd\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\botp\b/i,
  /\bcard[_ -]?number\b/i,
  /\bcredit[_ -]?card\b/i,
  /\bdebit[_ -]?card\b/i,
  /\bauthorization:\s*bearer\b/i,
];

const DANGEROUS_COMMANDS = [
  "DELETE",
  "DESTROY",
  "DROP",
  "WIPE",
  "FORMAT",
  "SHUTDOWN",
  "TERMINATE",
  "KILL",
  "PURGE",
];

const APPROVAL_COMMANDS = [
  "APPROVE",
  "APPROVE PAYMENT",
  "REJECT",
  "REJECT PAYMENT",
];

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function containsSensitiveData(value) {
  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value || {});

  return BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  const text = cleanText(value, maxLength);

  if (!text) {
    return {
      safe: true,
      value: "",
      blocked: false,
      reason: null,
    };
  }

  if (containsSensitiveData(text)) {
    return {
      safe: false,
      value: null,
      blocked: true,
      reason: "SENSITIVE_DATA_BLOCKED",
    };
  }

  return {
    safe: true,
    value: text,
    blocked: false,
    reason: null,
  };
}

function normalizeCommand(value) {
  return cleanText(value, MAX_COMMAND_LENGTH)
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function getCommandRoot(command) {
  const normalized = normalizeCommand(command);

  if (!normalized) {
    return "";
  }

  return normalized.split(" ")[0];
}

function isDangerousCommand(command) {
  const normalized = normalizeCommand(command);

  if (!normalized) {
    return false;
  }

  const root = getCommandRoot(normalized);

  return DANGEROUS_COMMANDS.includes(root);
}

function isPaymentApprovalCommand(command) {
  const normalized = normalizeCommand(command);

  return APPROVAL_COMMANDS.some(
    (approvalCommand) =>
      normalized === approvalCommand ||
      normalized.startsWith(`${approvalCommand} `)
  );
}

function requiresExplicitApproval(command) {
  const normalized = normalizeCommand(command);

  if (!normalized) {
    return false;
  }

  if (isPaymentApprovalCommand(normalized)) {
    return true;
  }

  const actionKeywords = [
    "PAY",
    "PAYMENT",
    "CHARGE",
    "PURCHASE",
    "UPGRADE",
    "SCALE",
    "DEPLOY",
    "REDEPLOY",
    "CANCEL",
    "CHANGE PLAN",
  ];

  return actionKeywords.some(
    (keyword) =>
      normalized === keyword ||
      normalized.startsWith(`${keyword} `)
  );
}

function sanitizeArguments(args) {
  if (!Array.isArray(args)) {
    return [];
  }

  const safeArgs = [];

  for (const arg of args.slice(0, 20)) {
    const sanitized = sanitizeText(
      String(arg ?? ""),
      MAX_ARGUMENT_LENGTH
    );

    if (!sanitized.safe) {
      return {
        safe: false,
        args: [],
        reason: sanitized.reason,
      };
    }

    safeArgs.push(sanitized.value);
  }

  return {
    safe: true,
    args: safeArgs,
    reason: null,
  };
}

function validateIncomingCommand({ text } = {}) {
  const sanitized = sanitizeText(text, MAX_COMMAND_LENGTH);

  if (!sanitized.safe) {
    return {
      valid: false,
      safe: false,
      command: null,
      args: [],
      blocked: true,
      requiresApproval: false,
      dangerous: false,
      reason: sanitized.reason,
    };
  }

  if (!sanitized.value) {
    return {
      valid: false,
      safe: true,
      command: null,
      args: [],
      blocked: false,
      requiresApproval: false,
      dangerous: false,
      reason: "COMMAND_REQUIRED",
    };
  }

  const parts = sanitized.value.split(/\s+/);
  const command = normalizeCommand(parts.shift());

  const argsResult = sanitizeArguments(parts);

  if (!argsResult.safe) {
    return {
      valid: false,
      safe: false,
      command,
      args: [],
      blocked: true,
      requiresApproval: false,
      dangerous: false,
      reason: argsResult.reason,
    };
  }

  const fullCommand = [command, ...argsResult.args]
    .filter(Boolean)
    .join(" ");

  const dangerous = isDangerousCommand(fullCommand);
  const approvalRequired =
    requiresExplicitApproval(fullCommand);

  return {
    valid: true,
    safe: true,
    command,
    args: argsResult.args,
    blocked: false,
    dangerous,
    requiresApproval: approvalRequired || dangerous,
    reason: dangerous
      ? "DANGEROUS_COMMAND_REQUIRES_SEPARATE_AUTHORIZATION"
      : approvalRequired
        ? "EXPLICIT_APPROVAL_REQUIRED"
        : null,
  };
}

function validateOutboundMessage(text) {
  const sanitized = sanitizeText(text, MAX_TEXT_LENGTH);

  if (!sanitized.safe) {
    return {
      valid: false,
      safe: false,
      text: null,
      reason: sanitized.reason,
    };
  }

  return {
    valid: Boolean(sanitized.value),
    safe: true,
    text: sanitized.value,
    reason: sanitized.value
      ? null
      : "MESSAGE_REQUIRED",
  };
}

function createRequestFingerprint({
  ownerPhone,
  command,
  args = [],
  correlationId = "",
} = {}) {
  const payload = JSON.stringify({
    ownerPhone: String(ownerPhone || ""),
    command: normalizeCommand(command),
    args: Array.isArray(args) ? args : [],
    correlationId: String(correlationId || ""),
  });

  return crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex");
}

function createIdempotencyKey({
  operation,
  requestId,
  reference,
} = {}) {
  const payload = [
    String(operation || ""),
    String(requestId || ""),
    String(reference || ""),
  ].join(":");

  return crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex");
}

function safeError(error) {
  if (!error) {
    return null;
  }

  return {
    code: error.code || "WHATSAPP_SECURITY_ERROR",
    message: cleanText(
      error.message || "WhatsApp security validation failed",
      500
    ),
  };
}

module.exports = {
  MAX_TEXT_LENGTH,
  MAX_COMMAND_LENGTH,
  MAX_ARGUMENT_LENGTH,
  cleanText,
  containsSensitiveData,
  sanitizeText,
  normalizeCommand,
  getCommandRoot,
  isDangerousCommand,
  isPaymentApprovalCommand,
  requiresExplicitApproval,
  sanitizeArguments,
  validateIncomingCommand,
  validateOutboundMessage,
  createRequestFingerprint,
  createIdempotencyKey,
  safeError,
};
