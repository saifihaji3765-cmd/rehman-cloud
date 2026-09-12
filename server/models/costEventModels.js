"use strict";

const mongoose = require("mongoose");

const providerDataSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      trim: true,
      maxlength: 100
    },

    source: {
      type: String,
      trim: true,
      maxlength: 500
    },

    accountId: {
      type: String,
      trim: true,
      maxlength: 200
    },

    projectId: {
      type: String,
      trim: true,
      maxlength: 200
    },

    model: {
      type: String,
      trim: true,
      maxlength: 200
    },

    period: {
      type: String,
      trim: true,
      maxlength: 100
    },

    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10
    },

    unit: {
      type: String,
      trim: true,
      maxlength: 100
    },

    retrievedAt: {
      type: Date
    },

    confidence: {
      type: String,
      trim: true,
      maxlength: 50
    },

    status: {
      type: String,
      trim: true,
      maxlength: 50
    }
  },
  {
    _id: false,
    strict: true
  }
);

const costEventSchema = new mongoose.Schema(
  {
    /*
     * ---------------------------------------------------------
     * IDENTITY
     * ---------------------------------------------------------
     */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    provider: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
      index: true
    },

    source: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    /*
     * ---------------------------------------------------------
     * OBSERVATION TYPE
     * ---------------------------------------------------------
     *
     * cost = monetary observation
     * usage = non-monetary usage observation
     *
     * The same collection can therefore store both financial
     * and usage telemetry while keeping the semantics explicit.
     */

    valueType: {
      type: String,
      required: true,
      enum: ["cost", "usage"],
      index: true
    },

    /*
     * ---------------------------------------------------------
     * VALUE
     * ---------------------------------------------------------
     */

    value: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      default: null,
      index: true
    },

    unit: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
      index: true
    },

    /*
     * ---------------------------------------------------------
     * TIME
     * ---------------------------------------------------------
     *
     * observedAt = time represented by the provider observation.
     * retrievedAt = time ZyrionOS obtained the observation.
     */

    observedAt: {
      type: Date,
      required: true,
      index: true
    },

    retrievedAt: {
      type: Date,
      required: true,
      default: Date.now
    },

    period: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null
    },

    periodStart: {
      type: Date,
      default: null
    },

    periodEnd: {
      type: Date,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * SCOPE
     * ---------------------------------------------------------
     */

    accountId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      index: true
    },

    projectId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      index: true
    },

    model: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      index: true
    },

    service: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },

    resource: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null
    },

    region: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null
    },

    /*
     * ---------------------------------------------------------
     * DATA QUALITY
     * ---------------------------------------------------------
     */

    status: {
      type: String,
      enum: [
        "verified",
        "available",
        "unavailable",
        "not_configured",
        "error",
        "partial"
      ],
      required: true,
      default: "verified",
      index: true
    },

    confidence: {
      type: String,
      enum: [
        "verified",
        "high",
        "medium",
        "low",
        "unknown"
      ],
      default: "unknown"
    },

    /*
     * ---------------------------------------------------------
     * PROVIDER METADATA
     * ---------------------------------------------------------
     *
     * Only safe provider metadata should be persisted here.
     *
     * Secrets, access tokens, API keys, passwords, OTPs,
     * card data and credentials must never be stored.
     */

    providerData: {
      type: providerDataSchema,
      default: null
    },

    metadata: {
      type: Map,
      of: String,
      default: {}
    },

    /*
     * ---------------------------------------------------------
     * DEDUPLICATION
     * ---------------------------------------------------------
     *
     * Provider adapters should create a stable observationId
     * whenever the provider gives us a reliable identifier.
     *
     * When unavailable, financialSnapshotService can generate
     * a deterministic fingerprint.
     */

    observationId: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null
    },

    fingerprint: {
      type: String,
      trim: true,
      maxlength: 500,
      required: true
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

/*
 * Main chronological query:
 * "Give me this user's provider observations in this period."
 */
costEventSchema.index({
  userId: 1,
  provider: 1,
  observedAt: -1
});

/*
 * Financial/usage history queries.
 */
costEventSchema.index({
  userId: 1,
  valueType: 1,
  observedAt: -1
});

/*
 * Project-specific financial telemetry.
 */
costEventSchema.index({
  userId: 1,
  projectId: 1,
  valueType: 1,
  observedAt: -1
});

/*
 * Provider + source + period queries.
 */
costEventSchema.index({
  userId: 1,
  provider: 1,
  source: 1,
  observedAt: -1
});

/*
 * Deduplication.
 *
 * The same provider observation must not be inserted twice
 * for the same owner.
 */
costEventSchema.index(
  {
    userId: 1,
    provider: 1,
    fingerprint: 1
  },
  {
    unique: true,
    name: "financial_observation_unique_fingerprint"
  }
);

/*
 * Currency/unit-aware aggregation.
 */
costEventSchema.index({
  userId: 1,
  valueType: 1,
  currency: 1,
  unit: 1,
  observedAt: -1
});

/*
 * Account-level queries.
 */
costEventSchema.index({
  userId: 1,
  accountId: 1,
  observedAt: -1
});

/*
 * -------------------------------------------------------------
 * VALIDATION
 * -------------------------------------------------------------
 */

costEventSchema.pre("validate", function (next) {
  /*
   * Monetary observations require currency.
   */
  if (this.valueType === "cost" && !this.currency) {
    return next(
      new Error("Currency is required for cost observations.")
    );
  }

  /*
   * Usage observations require a unit.
   */
  if (this.valueType === "usage" && !this.unit) {
    return next(
      new Error("Unit is required for usage observations.")
    );
  }

  /*
   * Invalid time range protection.
   */
  if (
    this.periodStart &&
    this.periodEnd &&
    this.periodStart > this.periodEnd
  ) {
    return next(
      new Error("periodStart cannot be after periodEnd.")
    );
  }

  /*
   * retrievedAt cannot be meaningfully before observedAt
   * when the provider observation represents a past period.
   *
   * We do not reject it because some providers can report
   * delayed historical data. The timestamp remains provider-
   * supplied and queryable.
   */

  next();
});

/*
 * -------------------------------------------------------------
 * JSON TRANSFORM
 * -------------------------------------------------------------
 *
 * Never expose internal MongoDB version fields unnecessarily.
 */

costEventSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const CostEvent =
  mongoose.models.CostEvent ||
  mongoose.model("CostEvent", costEventSchema);

module.exports = CostEvent;
