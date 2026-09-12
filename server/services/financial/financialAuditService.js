"use strict";

const mongoose = require("mongoose");
const AgentAudit = require("../../models/agentAuditModel");

const MAX_STRING_LENGTH = 2000;
const MAX_MAP_ENTRIES = 50;

const SENSITIVE_KEYS = [
  "password",
  "passwd",
  "secret",
  "apikey",
  "api_key",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "authorization",
  "bearer",
  "private_key",
  "privatekey",
  "client_secret",
  "clientsecret",
  "cvv",
  "cvc",
  "otp",
  "pin",
  "card_number",
  "cardnumber",
  "credit_card",
  "creditcard",
  "debit_card",
  "debitcard"
];

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof mongoose.Types.ObjectId)
  );
}

function isSensitiveKey(key) {
  const normalized = String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return SENSITIVE_KEYS.some((blocked) => {
    const normalizedBlocked = blocked.replace(
      /[^a-z0-9]/g,
      ""
    );

    return (
      normalized === normalizedBlocked ||
      normalized.includes(normalizedBlocked)
    );
  });
}

function safeString(value, maxLength = MAX_STRING_LENGTH) {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).slice(0, maxLength);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  return null;
}

/**
 * Converts arbitrary metadata into a small, safe Map-compatible object.
 *
 * This is deliberately restrictive because audit logs should never become
 * a dumping ground for request bodies, credentials or provider responses.
 */
function sanitizeMetadata(input) {
  if (!isObject(input) && !(input instanceof Map)) {
    return {};
  }

  const output = {};
  let count = 0;

  const entries =
    input instanceof Map
      ? Array.from(input.entries())
      : Object.entries(input);

  for (const [key, value] of entries) {
    if (count >= MAX_MAP_ENTRIES) {
      break;
    }

    if (isSensitiveKey(key)) {
      continue;
    }

    const normalizedKey = String(key)
      .trim()
      .slice(0, 100);

    if (!normalizedKey || isSensitiveKey(normalizedKey)) {
      continue;
    }

    const safeValue = safeString(value, 1000);

    if (safeValue === null) {
      continue;
    }

    output[normalizedKey] = safeValue;
    count += 1;
  }

  return output;
}

function normalizeUserId(userId) {
  if (!userId) {
    throw new Error("userId is required.");
  }

  if (
    mongoose.Types.ObjectId.isValid(userId) &&
    String(new mongoose.Types.ObjectId(userId)) ===
      String(userId)
  ) {
    return new mongoose.Types.ObjectId(userId);
  }

  if (userId instanceof mongoose.Types.ObjectId) {
    return userId;
  }

  throw new Error("Invalid userId.");
}

function normalizeStatus(status) {
  const allowed = [
    "started",
    "completed",
    "partial",
    "failed",
    "blocked",
    "rejected",
    "pending",
    "unavailable"
  ];

  const normalized = String(status || "completed")
    .trim()
    .toLowerCase();

  return allowed.includes(normalized)
    ? normalized
    : "completed";
}

function normalizeDecision(decision) {
  const allowed = [
    "allow",
    "deny",
    "approve",
    "reject",
    "execute",
    "defer",
    "observe",
    "alert",
    "none"
  ];

  const normalized = String(decision || "none")
    .trim()
    .toLowerCase();

  return allowed.includes(normalized)
    ? normalized
    : "none";
}

function normalizeRiskLevel(riskLevel) {
  const allowed = [
    "none",
    "low",
    "medium",
    "high",
    "critical"
  ];

  const normalized = String(riskLevel || "none")
    .trim()
    .toLowerCase();

  return allowed.includes(normalized)
    ? normalized
    : "none";
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Create an audit entry.
 *
 * This function records what happened.
 * It does not execute the underlying action.
 */
async function recordAudit(input = {}) {
  if (!isObject(input)) {
    throw new Error("Audit input must be an object.");
  }

  const userId = normalizeUserId(input.userId);

  const agent = safeString(input.agent, 150);

  const operation = safeString(
    input.operation,
    200
  );

  const action = safeString(
    input.action,
    200
  );

  if (!agent) {
    throw new Error("agent is required.");
  }

  if (!operation) {
    throw new Error("operation is required.");
  }

  if (!action) {
    throw new Error("action is required.");
  }

  const startedAt =
    normalizeDate(input.startedAt) ||
    new Date();

  const completedAt =
    normalizeDate(input.completedAt);

  let durationMs = null;

  if (
    completedAt &&
    completedAt.getTime() >= startedAt.getTime()
  ) {
    durationMs =
      completedAt.getTime() -
      startedAt.getTime();
  }

  const audit = new AgentAudit({
    userId,

    agent,
    operation,
    action,

    status: normalizeStatus(input.status),

    success:
      typeof input.success === "boolean"
        ? input.success
        : null,

    provider: safeString(input.provider, 100),
    source: safeString(input.source, 500),

    projectId: safeString(input.projectId, 200),
    accountId: safeString(input.accountId, 200),
    resourceId: safeString(input.resourceId, 300),

    requestId: safeString(input.requestId, 300),
    correlationId: safeString(
      input.correlationId,
      300
    ),
    idempotencyKey: safeString(
      input.idempotencyKey,
      300
    ),

    decision: normalizeDecision(
      input.decision
    ),

    reason: safeString(input.reason, 2000),

    riskLevel: normalizeRiskLevel(
      input.riskLevel
    ),

    requiresOwnerApproval:
      input.requiresOwnerApproval === true,

    ownerApproved:
      input.ownerApproved === true,

    approvalId:
      input.approvalId &&
      mongoose.Types.ObjectId.isValid(
        input.approvalId
      )
        ? input.approvalId
        : null,

    approvalReference: safeString(
      input.approvalReference,
      100
    ),

    inputSummary: sanitizeMetadata(
      input.inputSummary
    ),

    resultSummary: sanitizeMetadata(
      input.resultSummary
    ),

    errorCode: safeString(
      input.errorCode,
      200
    ),

    errorMessage: safeString(
      input.errorMessage,
      2000
    ),

    startedAt,
    completedAt,
    durationMs,

    metadata: sanitizeMetadata(
      input.metadata
    )
  });

  /*
   * Important:
   * Mongoose validation runs before the document is written.
   */
  await audit.validate();

  const saved = await audit.save();

  return {
    success: true,
    status: "recorded",

    audit: {
      id: saved._id.toString(),
      userId: saved.userId.toString(),

      agent: saved.agent,
      operation: saved.operation,
      action: saved.action,

      status: saved.status,
      success: saved.success,

      provider: saved.provider,
      source: saved.source,

      projectId: saved.projectId,
      accountId: saved.accountId,
      resourceId: saved.resourceId,

      decision: saved.decision,
      riskLevel: saved.riskLevel,

      requiresOwnerApproval:
        saved.requiresOwnerApproval,

      ownerApproved:
        saved.ownerApproved,

      approvalId:
        saved.approvalId
          ? saved.approvalId.toString()
          : null,

      approvalReference:
        saved.approvalReference,

      startedAt: saved.startedAt,
      completedAt: saved.completedAt,
      durationMs: saved.durationMs,

      createdAt: saved.createdAt
    }
  };
}

/**
 * Record the beginning of an operation.
 */
async function startAudit(input = {}) {
  return recordAudit({
    ...input,
    status: "started",
    startedAt:
      input.startedAt || new Date()
  });
}

/**
 * Record a successful operation.
 */
async function completeAudit(input = {}) {
  return recordAudit({
    ...input,
    status: input.status || "completed",
    success:
      typeof input.success === "boolean"
        ? input.success
        : true,

    completedAt:
      input.completedAt || new Date()
  });
}

/**
 * Record a failed operation.
 */
async function failAudit(input = {}) {
  return recordAudit({
    ...input,
    status: "failed",
    success: false,
    completedAt:
      input.completedAt || new Date()
  });
}

/**
 * Record a blocked high-risk action.
 */
async function blockAudit(input = {}) {
  return recordAudit({
    ...input,
    status: "blocked",
    success: false,
    decision: "deny",
    completedAt:
      input.completedAt || new Date()
  });
}

/**
 * Query audit history for one owner.
 */
async function getAuditHistory(input = {}) {
  const userId = normalizeUserId(
    input.userId
  );

  const filter = {
    userId
  };

  if (input.agent) {
    filter.agent = String(
      input.agent
    )
      .trim()
      .toLowerCase();
  }

  if (input.operation) {
    filter.operation = String(
      input.operation
    ).trim();
  }

  if (input.provider) {
    filter.provider = String(
      input.provider
    )
      .trim()
      .toLowerCase();
  }

  if (input.status) {
    filter.status = normalizeStatus(
      input.status
    );
  }

  if (input.riskLevel) {
    filter.riskLevel =
      normalizeRiskLevel(
        input.riskLevel
      );
  }

  if (input.projectId) {
    filter.projectId = String(
      input.projectId
    ).trim();
  }

  if (input.correlationId) {
    filter.correlationId = String(
      input.correlationId
    ).trim();
  }

  const startDate =
    normalizeDate(input.start);

  const endDate =
    normalizeDate(input.end);

  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      filter.createdAt.$gte = startDate;
    }

    if (endDate) {
      filter.createdAt.$lte = endDate;
    }
  }

  let limit = Number(input.limit);

  if (!Number.isFinite(limit)) {
    limit = 50;
  }

  limit = Math.max(
    1,
    Math.min(200, Math.floor(limit))
  );

  const records = await AgentAudit.find(filter)
    .sort({
      createdAt: -1
    })
    .limit(limit)
    .lean();

  return {
    success: true,
    status: "available",

    count: records.length,

    records: records.map(
      (record) => ({
        ...record,
        _id:
          record._id?.toString?.() ||
          record._id,

        userId:
          record.userId?.toString?.() ||
          record.userId,

        approvalId:
          record.approvalId?.toString?.() ||
          record.approvalId
      })
    )
  };
}

/**
 * Get a single audit record.
 */
async function getAuditById({
  userId,
  auditId
} = {}) {
  const normalizedUserId =
    normalizeUserId(userId);

  if (
    !auditId ||
    !mongoose.Types.ObjectId.isValid(
      auditId
    )
  ) {
    throw new Error(
      "Valid auditId is required."
    );
  }

  const record =
    await AgentAudit.findOne({
      _id: auditId,
      userId: normalizedUserId
    }).lean();

  if (!record) {
    return {
      success: false,
      status: "not_found",
      audit: null
    };
  }

  return {
    success: true,
    status: "available",

    audit: {
      ...record,

      _id:
        record._id?.toString?.() ||
        record._id,

      userId:
        record.userId?.toString?.() ||
        record.userId,

      approvalId:
        record.approvalId?.toString?.() ||
        record.approvalId
    }
  };
}

/**
 * Convenience function for recording an agent decision.
 */
async function recordDecision(input = {}) {
  return recordAudit({
    ...input,

    operation:
      input.operation || "decision",

    action:
      input.action || "agent_decision",

    decision:
      input.decision || "observe",

    status:
      input.status || "completed"
  });
}

/**
 * Convenience function for recording an owner approval.
 */
async function recordOwnerApproval(input = {}) {
  return recordAudit({
    ...input,

    operation:
      input.operation ||
      "payment_approval",

    action:
      input.action ||
      "owner_approval",

    decision: "approve",

    ownerApproved: true,

    requiresOwnerApproval: true,

    riskLevel:
      input.riskLevel || "high",

    status:
      input.status || "completed",

    success:
      typeof input.success === "boolean"
        ? input.success
        : true
  });
}

/**
 * Convenience function for recording a rejected action.
 */
async function recordRejection(input = {}) {
  return recordAudit({
    ...input,

    operation:
      input.operation || "action",

    action:
      input.action || "action_rejected",

    decision: "reject",

    ownerApproved: false,

    status: "rejected",

    success: false
  });
}

/*
 * -------------------------------------------------------------
 * MAIN CALLABLE SERVICE
 * -------------------------------------------------------------
 */

async function financialAuditService(
  input = {}
) {
  const operation = String(
    input.operation || "record"
  )
    .trim()
    .toLowerCase();

  switch (operation) {
    case "record":
      return recordAudit(input);

    case "start":
      return startAudit(input);

    case "complete":
      return completeAudit(input);

    case "fail":
      return failAudit(input);

    case "block":
      return blockAudit(input);

    case "decision":
      return recordDecision(input);

    case "owner_approval":
      return recordOwnerApproval(input);

    case "reject":
      return recordRejection(input);

    case "history":
      return getAuditHistory(input);

    case "get":
      return getAuditById(input);

    default:
      return {
        success: false,
        status: "invalid",
        error: {
          code: "UNSUPPORTED_AUDIT_OPERATION",
          message:
            `Unsupported audit operation: ${operation}`
        }
      };
  }
}

financialAuditService.recordAudit =
  recordAudit;

financialAuditService.startAudit =
  startAudit;

financialAuditService.completeAudit =
  completeAudit;

financialAuditService.failAudit =
  failAudit;

financialAuditService.blockAudit =
  blockAudit;

financialAuditService.recordDecision =
  recordDecision;

financialAuditService.recordOwnerApproval =
  recordOwnerApproval;

financialAuditService.recordRejection =
  recordRejection;

financialAuditService.getAuditHistory =
  getAuditHistory;

financialAuditService.getAuditById =
  getAuditById;

module.exports =
  financialAuditService;
