"use strict";

const mongoose = require("mongoose");

const paymentApprovalSchema = new mongoose.Schema(
  {
    /*
     * ---------------------------------------------------------
     * OWNER / USER
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
     * PAYMENT PROVIDER
     * ---------------------------------------------------------
     */

    provider: {
      type: String,
      enum: ["stripe", "razorpay"],
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },

    /*
     * ---------------------------------------------------------
     * PAYMENT PURPOSE
     * ---------------------------------------------------------
     */

    purpose: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * MONEY
     * ---------------------------------------------------------
     */

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 10
    },

    /*
     * ---------------------------------------------------------
     * PROVIDER-SAFE REFERENCES
     * ---------------------------------------------------------
     *
     * These are identifiers only.
     *
     * Never store:
     * - card number
     * - CVV
     * - OTP
     * - PIN
     * - bank password
     * - provider secret
     * - access token
     */

    providerCustomerId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    providerPaymentId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    providerOrderId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    providerSubscriptionId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * APPROVAL
     * ---------------------------------------------------------
     */

    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "expired",
        "processing",
        "paid",
        "failed",
        "cancelled"
      ],
      required: true,
      default: "pending",
      index: true
    },

    requestedAt: {
      type: Date,
      required: true,
      default: Date.now
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    approvedAt: {
      type: Date,
      default: null
    },

    rejectedAt: {
      type: Date,
      default: null
    },

    processedAt: {
      type: Date,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * APPROVAL ACTOR
     * ---------------------------------------------------------
     */

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    /*
     * ---------------------------------------------------------
     * OWNER APPROVAL REFERENCE
     * ---------------------------------------------------------
     *
     * A random internal approval ID can be safely shown to the
     * owner through WhatsApp/UI.
     */

    approvalTokenHash: {
      type: String,
      required: true,
      select: false
    },

    approvalReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
      index: true
    },

    /*
     * ---------------------------------------------------------
     * PAYMENT RESULT
     * ---------------------------------------------------------
     *
     * Only provider result metadata is stored.
     */

    paymentStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "succeeded",
        "failed",
        "cancelled",
        "refunded",
        "unknown"
      ],
      default: "not_started",
      index: true
    },

    providerStatus: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },

    providerTransactionId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    providerResult: {
      status: {
        type: String,
        trim: true,
        maxlength: 100,
        default: null
      },

      message: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: null
      },

      receivedAt: {
        type: Date,
        default: null
      }
    },

    /*
     * ---------------------------------------------------------
     * FAILURE / REJECTION
     * ---------------------------------------------------------
     */

    failureCode: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },

    failureReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * SOURCE / CONTEXT
     * ---------------------------------------------------------
     */

    source: {
      type: String,
      enum: [
        "financial_control",
        "whatsapp",
        "dashboard",
        "api",
        "system"
      ],
      required: true,
      default: "financial_control"
    },

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

    /*
     * ---------------------------------------------------------
     * IDEMPOTENCY
     * ---------------------------------------------------------
     */

    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
      index: true
    },

    /*
     * ---------------------------------------------------------
     * SAFE METADATA
     * ---------------------------------------------------------
     *
     * Metadata must contain identifiers/status information only.
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

paymentApprovalSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1
});

paymentApprovalSchema.index({
  userId: 1,
  provider: 1,
  createdAt: -1
});

paymentApprovalSchema.index({
  userId: 1,
  expiresAt: 1,
  status: 1
});

paymentApprovalSchema.index({
  userId: 1,
  projectId: 1,
  createdAt: -1
});

/*
 * Prevent duplicate provider actions when the same idempotency
 * key is supplied for the same owner.
 */
paymentApprovalSchema.index(
  {
    userId: 1,
    idempotencyKey: 1
  },
  {
    unique: true,
    sparse: true,
    name: "payment_approval_idempotency_unique"
  }
);

/*
 * -------------------------------------------------------------
 * VALIDATION
 * -------------------------------------------------------------
 */

paymentApprovalSchema.pre("validate", function (next) {
  if (!this.userId) {
    return next(new Error("userId is required."));
  }

  if (!this.provider) {
    return next(new Error("Payment provider is required."));
  }

  if (!Number.isFinite(this.amount) || this.amount < 0) {
    return next(new Error("Payment amount must be a valid number."));
  }

  if (!this.currency) {
    return next(new Error("Payment currency is required."));
  }

  if (!this.expiresAt) {
    return next(new Error("Approval expiry time is required."));
  }

  if (this.expiresAt <= this.requestedAt) {
    return next(
      new Error("Approval expiry must be after request time.")
    );
  }

  /*
   * Approved state requires an approval timestamp.
   */
  if (this.status === "approved" && !this.approvedAt) {
    return next(
      new Error("approvedAt is required for approved payments.")
    );
  }

  /*
   * Rejected state requires rejection timestamp.
   */
  if (this.status === "rejected" && !this.rejectedAt) {
    return next(
      new Error("rejectedAt is required for rejected payments.")
    );
  }

  next();
});

/*
 * -------------------------------------------------------------
 * JSON TRANSFORM
 * -------------------------------------------------------------
 *
 * approvalTokenHash is already select:false, but this additional
 * protection prevents accidental serialization.
 */

paymentApprovalSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.approvalTokenHash;
    return ret;
  }
});

const PaymentApproval =
  mongoose.models.PaymentApproval ||
  mongoose.model("PaymentApproval", paymentApprovalSchema);

module.exports = PaymentApproval;
