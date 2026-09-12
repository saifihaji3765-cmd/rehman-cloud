"use strict";

/**
 * Payment Approval Agent
 *
 * Purpose:
 * - Prepare and validate payment approval requests.
 * - Require explicit owner approval before a real payment can proceed.
 * - Never handle/store card numbers, CVV, OTPs, banking passwords,
 *   private keys, or provider API secrets.
 * - Never claim that a payment succeeded unless a real payment adapter
 *   later confirms it.
 *
 * IMPORTANT:
 * This agent is an approval/control layer.
 * Actual payment execution belongs to a dedicated provider adapter/service.
 */

const crypto = require("crypto");

const APPROVAL_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired",
  EXECUTED: "executed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const PAYMENT_STATUS = Object.freeze({
  NOT_EXECUTED: "not_executed",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
});

const ALLOWED_PROVIDERS = new Set([
  "stripe",
  "razorpay",
]);

const SENSITIVE_KEY_PATTERN =
  /(card|cardnumber|card_number|cvv|cvc|cid|otp|pin|password|passwd|secret|private.?key|access.?key|secret.?key|token|authorization|api.?key)/i;

const DEFAULT_APPROVAL_TTL_MINUTES = 15;
const MAX_APPROVAL_TTL_MINUTES = 24 * 60;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function createApprovalId() {
  return `pay_${crypto.randomUUID()}`;
}

function normalizeString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeProvider(provider) {
  const value = normalizeString(provider, 50);

  if (!value) {
    return null;
  }

  return value.toLowerCase();
}

function normalizeCurrency(currency) {
  const value = normalizeString(currency, 10);

  if (!value) {
    return null;
  }

  return value.toUpperCase();
}

function normalizeAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  if (amount <= 0) {
    return null;
  }

  /*
   * Financial calculations should never silently accept absurdly large
   * values. The actual provider/account limits remain authoritative.
   */
  if (amount > 1_000_000_000) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function normalizeExpiryMinutes(value) {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return DEFAULT_APPROVAL_TTL_MINUTES;
  }

  return Math.min(
    Math.floor(parsed),
    MAX_APPROVAL_TTL_MINUTES
  );
}

function containsSensitiveKey(value, path = "") {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    /*
     * We inspect only object keys for normal requests.
     * Raw arbitrary strings are not interpreted as secrets here.
     */
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item, index) =>
      containsSensitiveKey(
        item,
        `${path}[${index}]`
      )
    );
  }

  if (isObject(value)) {
    return Object.entries(value).some(
      ([key, child]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return true;
        }

        return containsSensitiveKey(
          child,
          path
            ? `${path}.${key}`
            : key
        );
      }
    );
  }

  return false;
}

function sanitizeMetadata(metadata = {}) {
  if (!isObject(metadata)) {
    return {};
  }

  const safe = {};

  for (const [key, value] of Object.entries(
    metadata
  )) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] =
        typeof value === "string"
          ? value.slice(0, 500)
          : value;
    }
  }

  return safe;
}

function normalizeOwnerId(ownerId) {
  if (
    typeof ownerId !== "string" &&
    typeof ownerId !== "number"
  ) {
    return null;
  }

  const value = String(ownerId).trim();

  return value || null;
}

function normalizePlan(plan) {
  const value = normalizeString(plan, 100);

  if (!value) {
    return null;
  }

  return value;
}

function validateOwner(ownerId) {
  const normalized = normalizeOwnerId(ownerId);

  if (!normalized) {
    return {
      valid: false,
      reason: "Owner identity is required.",
    };
  }

  return {
    valid: true,
    ownerId: normalized,
  };
}

function validatePaymentRequest(input) {
  if (!isObject(input)) {
    return {
      valid: false,
      reason: "Payment request must be an object.",
    };
  }

  /*
   * Never accept sensitive payment credentials in this layer.
   */
  if (containsSensitiveKey(input)) {
    return {
      valid: false,
      reason:
        "Sensitive payment credentials are not accepted by the approval agent.",
    };
  }

  const ownerValidation = validateOwner(
    input.ownerId
  );

  if (!ownerValidation.valid) {
    return ownerValidation;
  }

  const provider = normalizeProvider(
    input.provider
  );

  if (!provider) {
    return {
      valid: false,
      reason: "Payment provider is required.",
    };
  }

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return {
      valid: false,
      reason:
        `Unsupported payment provider: ${provider}.`,
    };
  }

  const amount = normalizeAmount(
    input.amount
  );

  if (amount === null) {
    return {
      valid: false,
      reason:
        "A valid positive payment amount is required.",
    };
  }

  const currency = normalizeCurrency(
    input.currency
  );

  if (!currency) {
    return {
      valid: false,
      reason: "Payment currency is required.",
    };
  }

  const description = normalizeString(
    input.description,
    1000
  );

  if (!description) {
    return {
      valid: false,
      reason: "Payment description is required.",
    };
  }

  const plan = normalizePlan(input.plan);

  const approvalTtlMinutes =
    normalizeExpiryMinutes(
      input.approvalTtlMinutes
    );

  return {
    valid: true,
    request: {
      ownerId: ownerValidation.ownerId,
      provider,
      amount,
      currency,
      description,
      plan,
      projectId:
        normalizeString(input.projectId, 200),
      resourceId:
        normalizeString(input.resourceId, 200),
      reason:
        normalizeString(input.reason, 1000),
      approvalTtlMinutes,
      metadata: sanitizeMetadata(
        input.metadata
      ),
    },
  };
}

function calculateExpiryDate(minutes) {
  return new Date(
    Date.now() +
      minutes * 60 * 1000
  );
}

function isExpired(request) {
  if (!request || !request.expiresAt) {
    return false;
  }

  const expiry = new Date(
    request.expiresAt
  );

  if (Number.isNaN(expiry.getTime())) {
    return true;
  }

  return Date.now() >= expiry.getTime();
}

function buildApprovalRequest(input) {
  const validation =
    validatePaymentRequest(input);

  if (!validation.valid) {
    return {
      success: false,
      status: "invalid",
      message: validation.reason,
      data: null,
    };
  }

  const request = validation.request;

  const approvalId =
    createApprovalId();

  const createdAt = new Date();
  const expiresAt =
    calculateExpiryDate(
      request.approvalTtlMinutes
    );

  return {
    success: true,
    status: APPROVAL_STATUS.PENDING,
    message:
      "Payment approval request created. Explicit owner approval is required before execution.",
    data: {
      approvalId,
      ownerId: request.ownerId,

      payment: {
        provider: request.provider,
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        plan: request.plan,
        projectId: request.projectId,
        resourceId: request.resourceId,
      },

      approval: {
        status: APPROVAL_STATUS.PENDING,
        createdAt:
          createdAt.toISOString(),
        expiresAt:
          expiresAt.toISOString(),
        required: true,
        approvedAt: null,
        rejectedAt: null,
        approvedBy: null,
        rejectionReason: null,
      },

      execution: {
        status:
          PAYMENT_STATUS.NOT_EXECUTED,
        startedAt: null,
        completedAt: null,
        providerPaymentId: null,
      },

      reason: request.reason,

      metadata: request.metadata,

      security: {
        ownerApprovalRequired: true,
        sensitiveCredentialsAccepted: false,
        otpAccepted: false,
        cardDataAccepted: false,
        providerSecretsAccepted: false,
      },
    },
  };
}

/**
 * Approve a pending request.
 *
 * IMPORTANT:
 * This does not execute the payment.
 * A separate payment service must consume the approved request.
 */
function approvePayment(input = {}) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      message:
        "Approval input must be an object.",
      data: null,
    };
  }

  if (
    containsSensitiveKey(input)
  ) {
    return {
      success: false,
      status: "invalid",
      message:
        "Sensitive credentials cannot be submitted for approval.",
      data: null,
    };
  }

  const approvalId =
    normalizeString(
      input.approvalId,
      200
    );

  const ownerId =
    normalizeOwnerId(
      input.ownerId
    );

  if (!approvalId || !ownerId) {
    return {
      success: false,
      status: "invalid",
      message:
        "approvalId and ownerId are required.",
      data: null,
    };
  }

  /*
   * The actual persisted request must be loaded by the controller/service.
   * This pure agent function returns the requested state transition
   * information without pretending that persistence happened.
   */
  return {
    success: true,
    status: APPROVAL_STATUS.APPROVED,
    message:
      "Owner approval recorded as a requested state transition. Persist this state only after verifying the authenticated owner.",
    data: {
      approvalId,
      ownerId,
      approval: {
        status:
          APPROVAL_STATUS.APPROVED,
        approvedAt:
          new Date().toISOString(),
        approvedBy: ownerId,
      },
      execution: {
        status:
          PAYMENT_STATUS.NOT_EXECUTED,
      },
      nextAction:
        "Execute through the configured payment provider service.",
    },
  };
}

function rejectPayment(input = {}) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      message:
        "Rejection input must be an object.",
      data: null,
    };
  }

  if (
    containsSensitiveKey(input)
  ) {
    return {
      success: false,
      status: "invalid",
      message:
        "Sensitive credentials cannot be submitted for rejection.",
      data: null,
    };
  }

  const approvalId =
    normalizeString(
      input.approvalId,
      200
    );

  const ownerId =
    normalizeOwnerId(
      input.ownerId
    );

  const reason =
    normalizeString(
      input.reason,
      1000
    );

  if (!approvalId || !ownerId) {
    return {
      success: false,
      status: "invalid",
      message:
        "approvalId and ownerId are required.",
      data: null,
    };
  }

  return {
    success: true,
    status: APPROVAL_STATUS.REJECTED,
    message:
      "Payment approval rejected.",
    data: {
      approvalId,
      ownerId,
      approval: {
        status:
          APPROVAL_STATUS.REJECTED,
        rejectedAt:
          new Date().toISOString(),
        rejectionReason:
          reason ||
          "Rejected by owner.",
      },
      execution: {
        status:
          PAYMENT_STATUS.NOT_EXECUTED,
      },
    },
  };
}

/**
 * Verify whether a persisted approval may be executed.
 *
 * This function intentionally does NOT execute the payment.
 */
function authorizeExecution(
  approvalRequest,
  ownerId
) {
  if (!isObject(approvalRequest)) {
    return {
      allowed: false,
      status: "invalid",
      reason:
        "Approval request is invalid.",
    };
  }

  const authenticatedOwner =
    normalizeOwnerId(ownerId);

  if (!authenticatedOwner) {
    return {
      allowed: false,
      status: "unauthorized",
      reason:
        "Authenticated owner identity is required.",
    };
  }

  if (
    approvalRequest.ownerId !==
    authenticatedOwner
  ) {
    return {
      allowed: false,
      status: "unauthorized",
      reason:
        "Only the payment request owner can authorize execution.",
    };
  }

  if (
    containsSensitiveKey(
      approvalRequest
    )
  ) {
    return {
      allowed: false,
      status: "invalid",
      reason:
        "Approval request contains prohibited sensitive fields.",
    };
  }

  if (
    approvalRequest.approval?.status !==
    APPROVAL_STATUS.APPROVED
  ) {
    return {
      allowed: false,
      status: "not_approved",
      reason:
        "Explicit owner approval is required.",
    };
  }

  if (isExpired(approvalRequest.approval)) {
    return {
      allowed: false,
      status: APPROVAL_STATUS.EXPIRED,
      reason:
        "Payment approval has expired.",
    };
  }

  if (
    approvalRequest.execution?.status ===
    PAYMENT_STATUS.SUCCEEDED
  ) {
    return {
      allowed: false,
      status: "already_completed",
      reason:
        "Payment has already been confirmed as successful.",
    };
  }

  return {
    allowed: true,
    status: "authorized",
    reason:
      "Approval is valid for provider execution.",
  };
}

/**
 * Create an execution-start state.
 *
 * This still does not call Stripe/Razorpay.
 */
function markExecutionStarted(
  approvalRequest,
  ownerId
) {
  const authorization =
    authorizeExecution(
      approvalRequest,
      ownerId
    );

  if (!authorization.allowed) {
    return {
      success: false,
      status: authorization.status,
      message: authorization.reason,
      data: null,
    };
  }

  return {
    success: true,
    status: APPROVAL_STATUS.EXECUTED,
    message:
      "Payment execution may now be handed to the provider service.",
    data: {
      approvalId:
        approvalRequest.approvalId,

      approvalStatus:
        APPROVAL_STATUS.APPROVED,

      execution: {
        status:
          PAYMENT_STATUS.PROCESSING,
        startedAt:
          new Date().toISOString(),
      },

      provider:
        approvalRequest.payment?.provider,

      payment:
        approvalRequest.payment,
    },
  };
}

/**
 * Record a REAL provider result.
 *
 * The caller must provide the provider's actual result.
 * This function does not manufacture providerPaymentId,
 * success, amount, or status.
 */
function recordProviderResult(
  approvalRequest,
  ownerId,
  providerResult = {}
) {
  const authorization =
    authorizeExecution(
      approvalRequest,
      ownerId
    );

  if (!authorization.allowed) {
    return {
      success: false,
      status: authorization.status,
      message: authorization.reason,
      data: null,
    };
  }

  if (!isObject(providerResult)) {
    return {
      success: false,
      status: "invalid",
      message:
        "Provider result must be an object.",
      data: null,
    };
  }

  if (
    containsSensitiveKey(
      providerResult
    )
  ) {
    return {
      success: false,
      status: "invalid",
      message:
        "Sensitive provider credentials cannot be stored in the approval record.",
      data: null,
    };
  }

  const provider =
    normalizeProvider(
      providerResult.provider
    );

  if (
    provider !==
    approvalRequest.payment?.provider
  ) {
    return {
      success: false,
      status: "provider_mismatch",
      message:
        "Provider result does not match the approved payment provider.",
      data: null,
    };
  }

  const providerPaymentId =
    normalizeString(
      providerResult.paymentId ??
        providerResult.providerPaymentId,
      300
    );

  const resultStatus =
    normalizeString(
      providerResult.status,
      100
    );

  if (!resultStatus) {
    return {
      success: false,
      status: "invalid",
      message:
        "Real provider payment status is required.",
      data: null,
    };
  }

  const normalizedStatus =
    resultStatus.toLowerCase();

  const succeeded =
    normalizedStatus ===
      PAYMENT_STATUS.SUCCEEDED ||
    normalizedStatus ===
      "paid" ||
    normalizedStatus ===
      "captured";

  const failed =
    normalizedStatus ===
      PAYMENT_STATUS.FAILED ||
    normalizedStatus ===
      "failed" ||
    normalizedStatus ===
      "cancelled";

  if (!succeeded && !failed) {
    return {
      success: true,
      status: APPROVAL_STATUS.EXECUTED,
      message:
        "Provider returned a non-terminal payment status.",
      data: {
        approvalId:
          approvalRequest.approvalId,
        execution: {
          status:
            PAYMENT_STATUS.PROCESSING,
          providerPaymentId:
            providerPaymentId || null,
          providerStatus:
            normalizedStatus,
        },
      },
    };
  }

  const completedAt =
    new Date().toISOString();

  return {
    success: true,
    status: succeeded
      ? APPROVAL_STATUS.EXECUTED
      : APPROVAL_STATUS.FAILED,
    message: succeeded
      ? "Real provider payment result recorded as successful."
      : "Real provider payment result recorded as failed.",
    data: {
      approvalId:
        approvalRequest.approvalId,

      approval: {
        status:
          succeeded
            ? APPROVAL_STATUS.EXECUTED
            : APPROVAL_STATUS.FAILED,
      },

      execution: {
        status: succeeded
          ? PAYMENT_STATUS.SUCCEEDED
          : PAYMENT_STATUS.FAILED,

        providerPaymentId:
          providerPaymentId || null,

        providerStatus:
          normalizedStatus,

        completedAt,
      },
    },
  };
}

/**
 * Main callable agent.
 *
 * Default action = create approval request.
 *
 * Supported actions:
 * - create
 * - approve
 * - reject
 * - authorize
 * - execution_started
 * - provider_result
 */
async function paymentApprovalAgent(
  input = {}
) {
  try {
    const action =
      normalizeString(
        input.action || "create",
        50
      )?.toLowerCase();

    switch (action) {
      case "create":
        return buildApprovalRequest(
          input
        );

      case "approve":
        return approvePayment(
          input
        );

      case "reject":
        return rejectPayment(
          input
        );

      case "authorize":
        return authorizeExecution(
          input.approvalRequest,
          input.ownerId
        );

      case "execution_started":
        return markExecutionStarted(
          input.approvalRequest,
          input.ownerId
        );

      case "provider_result":
        return recordProviderResult(
          input.approvalRequest,
          input.ownerId,
          input.providerResult
        );

      default:
        return {
          success: false,
          status: "invalid",
          message:
            `Unsupported payment approval action: ${action}`,
          data: null,
        };
    }
  } catch (error) {
    console.error(
      "[PaymentApprovalAgent] Error:",
      error.message
    );

    return {
      success: false,
      status: "error",
      message:
        "Payment approval agent failed.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

paymentApprovalAgent.APPROVAL_STATUS =
  APPROVAL_STATUS;

paymentApprovalAgent.PAYMENT_STATUS =
  PAYMENT_STATUS;

paymentApprovalAgent.validatePaymentRequest =
  validatePaymentRequest;

paymentApprovalAgent.buildApprovalRequest =
  buildApprovalRequest;

paymentApprovalAgent.approvePayment =
  approvePayment;

paymentApprovalAgent.rejectPayment =
  rejectPayment;

paymentApprovalAgent.authorizeExecution =
  authorizeExecution;

paymentApprovalAgent.recordProviderResult =
  recordProviderResult;

module.exports =
  paymentApprovalAgent;
