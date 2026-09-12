"use strict";

const mongoose = require("mongoose");

const agentAuditSchema = new mongoose.Schema(
  {
    /*
     * ---------------------------------------------------------
     * OWNER / TENANT
     * ---------------------------------------------------------
     */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /*
     * ---------------------------------------------------------
     * AGENT
     * ---------------------------------------------------------
     */

    agent: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 150,
      index: true
    },

    operation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true
    },

    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    /*
     * ---------------------------------------------------------
     * RESULT
     * ---------------------------------------------------------
     */

    status: {
      type: String,
      required: true,
      enum: [
        "started",
        "completed",
        "partial",
        "failed",
        "blocked",
        "rejected",
        "pending",
        "unavailable"
      ],
      index: true
    },

    success: {
      type: Boolean,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * PROVIDER
     * ---------------------------------------------------------
     */

    provider: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
      default: null,
      index: true
    },

    source: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * RESOURCE CONTEXT
     * ---------------------------------------------------------
     */

    projectId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      index: true
    },

    accountId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      index: true
    },

    resourceId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * REQUEST / CORRELATION
     * ---------------------------------------------------------
     */

    requestId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
      index: true
    },

    correlationId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
      index: true
    },

    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * DECISION
     * ---------------------------------------------------------
     */

    decision: {
      type: String,
      enum: [
        "allow",
        "deny",
        "approve",
        "reject",
        "execute",
        "defer",
        "observe",
        "alert",
        "none"
      ],
      default: "none",
      index: true
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * RISK
     * ---------------------------------------------------------
     */

    riskLevel: {
      type: String,
      enum: [
        "none",
        "low",
        "medium",
        "high",
        "critical"
      ],
      default: "none",
      index: true
    },

    requiresOwnerApproval: {
      type: Boolean,
      default: false
    },

    ownerApproved: {
      type: Boolean,
      default: false
    },

    /*
     * ---------------------------------------------------------
     * APPROVAL REFERENCE
     * ---------------------------------------------------------
     */

    approvalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentApproval",
      default: null,
      index: true
    },

    approvalReference: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * SAFE INPUT SUMMARY
     * ---------------------------------------------------------
     *
     * This is intentionally NOT a raw request/body dump.
     */

    inputSummary: {
      type: Map,
      of: String,
      default: {}
    },

    /*
     * ---------------------------------------------------------
     * SAFE RESULT SUMMARY
     * ---------------------------------------------------------
     */

    resultSummary: {
      type: Map,
      of: String,
      default: {}
    },

    /*
     * ---------------------------------------------------------
     * ERROR
     * ---------------------------------------------------------
     */

    errorCode: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },

    errorMessage: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * TIMING
     * ---------------------------------------------------------
     */

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    durationMs: {
      type: Number,
      min: 0,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * METADATA
     * ---------------------------------------------------------
     *
     * Only non-sensitive metadata belongs here.
     */

    metadata: {
      type: Map,
      of: String,
      default: {}
    }
  },
  {
    timestamps: true,
    strict: true,
    minimize: false
  }
);

/*
 * -------------------------------------------------------------
 * INDEXES
 * -------------------------------------------------------------
 */

agentAuditSchema.index({
  userId: 1,
  createdAt: -1
});

agentAuditSchema.index({
  userId: 1,
  agent: 1,
  createdAt: -1
});

agentAuditSchema.index({
  userId: 1,
  operation: 1,
  createdAt: -1
});

agentAuditSchema.index({
  userId: 1,
  provider: 1,
  createdAt: -1
});

agentAuditSchema.index({
  userId: 1,
  riskLevel: 1,
  createdAt: -1
});

agentAuditSchema.index({
  userId: 1,
  decision: 1,
  createdAt: -1
});

agentAuditSchema.index({
  correlationId: 1,
  createdAt: -1
});

agentAuditSchema.index({
  approvalId: 1,
  createdAt: -1
});

/*
 * -------------------------------------------------------------
 * VALIDATION
 * -------------------------------------------------------------
 */

agentAuditSchema.pre("validate", function (next) {
  if (!this.userId) {
    return next(new Error("userId is required."));
  }

  if (!this.agent) {
    return next(new Error("agent is required."));
  }

  if (!this.operation) {
    return next(new Error("operation is required."));
  }

  if (!this.action) {
    return next(new Error("action is required."));
  }

  /*
   * A completed operation should have completion information.
   */
  if (
    ["completed", "partial", "failed", "blocked", "rejected"].includes(
      this.status
    )
  ) {
    if (!this.completedAt && this.startedAt) {
      this.completedAt = new Date();
    }
  }

  /*
   * Calculate duration only from real timestamps.
   */
  if (
    this.startedAt &&
    this.completedAt &&
    this.completedAt >= this.startedAt
  ) {
    this.durationMs =
      this.completedAt.getTime() -
      this.startedAt.getTime();
  }

  /*
   * Owner approval must never be implied by a generic allow
   * decision.
   */
  if (
    this.requiresOwnerApproval === true &&
    this.ownerApproved !== true &&
    ["approve", "execute"].includes(this.decision)
  ) {
    return next(
      new Error(
        "Owner approval is required before approval or execution."
      )
    );
  }

  next();
});

/*
 * -------------------------------------------------------------
 * SECURITY GUARD
 * -------------------------------------------------------------
 *
 * Prevent obvious secret-bearing fields from being persisted
 * through inputSummary/resultSummary/metadata.
 */

function containsSensitiveKey(key) {
  const normalized = String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const blocked = [
    "password",
    "passwd",
    "secret",
    "apikey",
    "accesstoken",
    "refreshtoken",
    "authorization",
    "bearertoken",
    "privatekey",
    "clientsecret",
    "cvv",
    "cvc",
    "otp",
    "pin",
    "cardnumber",
    "creditcard",
    "debitcard"
  ];

  return blocked.some((item) =>
    normalized.includes(item)
  );
}

function sanitizeMap(map) {
  if (!(map instanceof Map)) {
    return map;
  }

  for (const key of map.keys()) {
    if (containsSensitiveKey(key)) {
      map.delete(key);
    }
  }

  return map;
}

agentAuditSchema.pre("save", function (next) {
  sanitizeMap(this.inputSummary);
  sanitizeMap(this.resultSummary);
  sanitizeMap(this.metadata);

  next();
});

/*
 * -------------------------------------------------------------
 * JSON TRANSFORM
 * -------------------------------------------------------------
 */

agentAuditSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const AgentAudit =
  mongoose.models.AgentAudit ||
  mongoose.model("AgentAudit", agentAuditSchema);

module.exports = AgentAudit;
