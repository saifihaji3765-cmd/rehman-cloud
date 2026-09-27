const mongoose = require("mongoose");

/* =========================================================
   SUBSCRIPTION MODEL
   Version: 4.0.0

   Responsibilities:
   - Store authoritative subscription state
   - Preserve payment-provider references
   - Store billing snapshot
   - Store entitlement limits
   - Store infrastructure entitlements
   - Store feature flags
   - Track usage
   - Support webhook idempotency
   - Support Stripe + Razorpay
   - Remain backward compatible with existing controllers
========================================================= */


/* =========================================================
   PLAN ENUM
========================================================= */

const PLAN_NAMES = [
  "Starter",
  "Pro",
  "Business",
  "Scale",
  "Enterprise"
];


/* =========================================================
   CURRENCY ENUM
========================================================= */

const CURRENCIES = [
  "USD",
  "INR"
];


/* =========================================================
   BILLING CYCLE
========================================================= */

const BILLING_CYCLES = [
  "monthly",
  "yearly"
];


/* =========================================================
   PAYMENT PROVIDERS
========================================================= */

const PAYMENT_PROVIDERS = [
  "stripe",
  "razorpay"
];


/* =========================================================
   PAYMENT STATUS
========================================================= */

const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
  "cancelled"
];


/* =========================================================
   SUBSCRIPTION STATUS
========================================================= */

const SUBSCRIPTION_STATUSES = [
  "pending",
  "active",
  "past_due",
  "cancelled",
  "expired",
  "upgraded"
];


/* =========================================================
   SUBSCRIPTION SCHEMA
========================================================= */

const subscriptionSchema = new mongoose.Schema(
  {

    /* =====================================================
       USER
    ===================================================== */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },


    /* =====================================================
       PLAN
    ===================================================== */

    planName: {
      type: String,
      enum: PLAN_NAMES,
      required: true,
      index: true
    },


    /* =====================================================
       BILLING SNAPSHOT

       These values represent the plan actually purchased
       for this subscription.

       They are NOT the live pricing catalog.
    ===================================================== */

    price: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      enum: CURRENCIES,
      default: "USD",
      uppercase: true,
      required: true
    },

    billingCycle: {
      type: String,
      enum: BILLING_CYCLES,
      default: "monthly",
      required: true,
      index: true
    },


    /* =====================================================
       PAYMENT PROVIDER
    ===================================================== */

    paymentProvider: {
      type: String,
      enum: PAYMENT_PROVIDERS,
      required: true,
      index: true
    },


    /* =====================================================
       PROVIDER REFERENCES

       Different providers expose different identifiers.

       Stripe:
       - paymentId
       - providerCustomerId
       - providerSubscriptionId

       Razorpay:
       - paymentId
       - orderId
       - providerSubscriptionId
    ===================================================== */

    paymentId: {
      type: String,
      default: "",
      trim: true,
      index: true
    },

    orderId: {
      type: String,
      default: "",
      trim: true,
      index: true
    },

    providerCustomerId: {
      type: String,
      default: "",
      trim: true,
      index: true
    },

    providerSubscriptionId: {
      type: String,
      default: "",
      trim: true,
      index: true
    },


    /* =====================================================
       PAYMENT STATUS
    ===================================================== */

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
      required: true,
      index: true
    },


    /* =====================================================
       SUBSCRIPTION STATUS
    ===================================================== */

    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: "pending",
      required: true,
      index: true
    },


    /* =====================================================
       DATES
    ===================================================== */

    startDate: {
      type: Date,
      default: Date.now,
      required: true
    },

    /*
     * Existing field retained for compatibility.
     */
    expiryDate: {
      type: Date,
      required: true,
      index: true
    },

    /*
     * Explicit current billing-period boundary.

     * This is useful for:
     * - entitlement checks
     * - renewals
     * - Stripe recurring subscriptions
     * - Razorpay recurring subscriptions
     * - future billing-period calculations
     *
     * expiryDate remains for backward compatibility.
     */
    currentPeriodEnd: {
      type: Date,
      default: null,
      index: true
    },

    autoRenew: {
      type: Boolean,
      default: true
    },

    cancelledAt: {
      type: Date,
      default: null
    },


    /* =====================================================
       USAGE
    ===================================================== */

    aiRequestsUsed: {
      type: Number,
      default: 0,
      min: 0
    },

    aiCreditsUsed: {
      type: Number,
      default: 0,
      min: 0
    },

    deploymentsUsed: {
      type: Number,
      default: 0,
      min: 0
    },

    thumbnailsGenerated: {
      type: Number,
      default: 0,
      min: 0
    },

    videoCreditsUsed: {
      type: Number,
      default: 0,
      min: 0
    },


    /* =====================================================
       ENTITLEMENT LIMITS
    ===================================================== */

    deploymentsLimit: {
      type: Number,
      default: 0,
      min: 0
    },

    aiCreditsLimit: {
      type: Number,
      default: 0,
      min: 0
    },

    thumbnailCreditsLimit: {
      type: Number,
      default: 0,
      min: 0
    },

    videoCreditsLimit: {
      type: Number,
      default: 0,
      min: 0
    },


    /* =====================================================
       INFRASTRUCTURE ENTITLEMENTS
    ===================================================== */

    infrastructure: {

      ram: {
        type: String,
        default: null,
        trim: true
      },

      cpu: {
        type: String,
        default: null,
        trim: true
      },

      storage: {
        type: String,
        default: null,
        trim: true
      },

      bandwidth: {
        type: String,
        default: null,
        trim: true
      }

    },


    /* =====================================================
       FEATURE FLAGS
    ===================================================== */

    featureFlags: {

      customDomain: {
        type: Boolean,
        default: false
      },

      autoSSL: {
        type: Boolean,
        default: false
      },

      autoScaling: {
        type: Boolean,
        default: false
      },

      advancedMonitoring: {
        type: Boolean,
        default: false
      },

      priorityDeployments: {
        type: Boolean,
        default: false
      },

      dedicatedInfrastructure: {
        type: Boolean,
        default: false
      },

      dedicatedSupport: {
        type: Boolean,
        default: false
      }

    },


    /* =====================================================
       PLAN FEATURES
    ===================================================== */

    features: {
      type: [String],
      default: []
    },

    support: {
      type: String,
      default: "Community Support",
      trim: true
    },


    /* =====================================================
       WEBHOOK IDEMPOTENCY
    ===================================================== */

    /*
     * Stores provider event IDs already processed.

     * This is retained for backward compatibility.
     *
     * A dedicated WebhookEvent collection can later become
     * the stronger global idempotency layer.
     */
    processedWebhookEvents: {
      type: [String],
      default: []
    },

    lastWebhookEventId: {
      type: String,
      default: "",
      trim: true
    },

    lastWebhookEventType: {
      type: String,
      default: "",
      trim: true
    },


    /* =====================================================
       PROVIDER METADATA
    ===================================================== */

    providerMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },


    /* =====================================================
       BILLING METADATA
    ===================================================== */

    metadata: {

      environment: {
        type: String,
        default: null,
        trim: true
      },

      version: {
        type: String,
        default: "4.0.0",
        trim: true
      },

      billingId: {
        type: String,
        default: "",
        trim: true,
        index: true
      },

      requestId: {
        type: String,
        default: "",
        trim: true
      },

      workflowId: {
        type: String,
        default: "",
        trim: true
      }

    }

  },

  {
    timestamps: true,

    /*
     * Do not silently discard future fields added by
     * controlled backend migrations.
     *
     * Explicit schema fields remain authoritative.
     */
    strict: true

  }
);


/* =========================================================
   INDEXES
========================================================= */


/*
 * Fast lookup of user's subscriptions.
 */
subscriptionSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1
});


/*
 * Fast lookup of user's latest subscription.
 */
subscriptionSchema.index({
  userId: 1,
  createdAt: -1
});


/*
 * Provider subscription lookup.
 */
subscriptionSchema.index({
  paymentProvider: 1,
  providerSubscriptionId: 1
});


/*
 * Provider payment lookup.
 */
subscriptionSchema.index({
  paymentProvider: 1,
  paymentId: 1
});


/*
 * Provider order lookup.
 */
subscriptionSchema.index({
  paymentProvider: 1,
  orderId: 1
});


/*
 * Billing ID lookup.
 */
subscriptionSchema.index({
  "metadata.billingId": 1
});


/*
 * Expiry processing.
 */
subscriptionSchema.index({
  status: 1,
  expiryDate: 1
});


/*
 * Current billing-period processing.
 */
subscriptionSchema.index({
  status: 1,
  currentPeriodEnd: 1
});


/* =========================================================
   PARTIAL UNIQUE INDEXES
========================================================= */

/*
 * Do NOT make providerSubscriptionId globally unique because
 * empty strings would otherwise collide.
 *
 * Only enforce uniqueness when a real provider ID exists.
 */
subscriptionSchema.index(
  {
    paymentProvider: 1,
    providerSubscriptionId: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      providerSubscriptionId: {
        $type: "string",
        $ne: ""
      }
    }
  }
);


/*
 * Provider payment IDs should not be duplicated.
 */
subscriptionSchema.index(
  {
    paymentProvider: 1,
    paymentId: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      paymentId: {
        $type: "string",
        $ne: ""
      }
    }
  }
);


/*
 * Provider order IDs should not be duplicated.
 */
subscriptionSchema.index(
  {
    paymentProvider: 1,
    orderId: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      orderId: {
        $type: "string",
        $ne: ""
      }
    }
  }
);


/* =========================================================
   NORMALIZATION HELPERS
========================================================= */

function normalizePlanName(value) {

  if (!value) {
    return value;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  const planMap = {

    starter: "Starter",

    pro: "Pro",

    business: "Business",

    scale: "Scale",

    enterprise: "Enterprise"

  };

  return (
    planMap[normalized] ||
    value
  );
}


function normalizeCurrency(value) {

  if (!value) {
    return value;
  }

  return String(value)
    .trim()
    .toUpperCase();
}


function normalizeBillingCycle(value) {

  if (!value) {
    return value;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    normalized === "month" ||
    normalized === "monthly"
  ) {
    return "monthly";
  }

  if (
    normalized === "year" ||
    normalized === "yearly" ||
    normalized === "annual"
  ) {
    return "yearly";
  }

  return value;
}


function normalizePaymentProvider(value) {

  if (!value) {
    return value;
  }

  return String(value)
    .trim()
    .toLowerCase();
}


/* =========================================================
   PRE-VALIDATION NORMALIZATION
========================================================= */

subscriptionSchema.pre(
  "validate",
  function(next) {

    try {

      if (this.planName) {

        this.planName =
          normalizePlanName(
            this.planName
          );

      }


      if (this.currency) {

        this.currency =
          normalizeCurrency(
            this.currency
          );

      }


      if (this.billingCycle) {

        this.billingCycle =
          normalizeBillingCycle(
            this.billingCycle
          );

      }


      if (this.paymentProvider) {

        this.paymentProvider =
          normalizePaymentProvider(
            this.paymentProvider
          );

      }


      /*
       * Keep expiryDate and currentPeriodEnd
       * synchronized when only one is supplied.
       */

      if (
        !this.currentPeriodEnd &&
        this.expiryDate
      ) {

        this.currentPeriodEnd =
          this.expiryDate;

      }


      if (
        !this.expiryDate &&
        this.currentPeriodEnd
      ) {

        this.expiryDate =
          this.currentPeriodEnd;

      }


      /*
       * Prevent negative usage values from entering
       * the database through direct mutation paths.
       */

      const usageFields = [

        "aiRequestsUsed",

        "aiCreditsUsed",

        "deploymentsUsed",

        "thumbnailsGenerated",

        "videoCreditsUsed",

        "deploymentsLimit",

        "aiCreditsLimit",

        "thumbnailCreditsLimit",

        "videoCreditsLimit"

      ];


      for (
        const field of usageFields
      ) {

        if (
          this[field] !== undefined &&
          this[field] !== null
        ) {

          const value =
            Number(
              this[field]
            );

          if (
            Number.isFinite(value) &&
            value >= 0
          ) {

            this[field] =
              value;

          }

        }

      }


      next();

    } catch (error) {

      next(error);

    }

  }
);


/* =========================================================
   INSTANCE METHODS
========================================================= */


/*
 * Check whether the subscription is currently active.
 */
subscriptionSchema.methods.isActive = function() {

  if (
    this.status !== "active"
  ) {

    return false;

  }

  const endDate =
    this.currentPeriodEnd ||
    this.expiryDate;

  if (!endDate) {

    return true;

  }

  return (
    new Date(endDate).getTime() >
    Date.now()
  );

};


/*
 * Check whether a usage limit is available.
 */
subscriptionSchema.methods.hasUsageAvailable =
  function(
    used,
    limit
  ) {

    const usedValue =
      Number(used || 0);

    const limitValue =
      Number(limit || 0);

    /*
     * Zero means no allowance.
     */
    if (limitValue <= 0) {

      return false;

    }

    return usedValue < limitValue;

  };


/*
 * Return a normalized entitlement snapshot.
 */
subscriptionSchema.methods.getEntitlements =
  function() {

    return {

      planName:
        this.planName,

      currency:
        this.currency,

      billingCycle:
        this.billingCycle,

      deployments: {

        used:
          this.deploymentsUsed,

        limit:
          this.deploymentsLimit

      },

      aiCredits: {

        used:
          this.aiCreditsUsed,

        limit:
          this.aiCreditsLimit

      },

      thumbnails: {

        used:
          this.thumbnailsGenerated,

        limit:
          this.thumbnailCreditsLimit

      },

      videoCredits: {

        used:
          this.videoCreditsUsed,

        limit:
          this.videoCreditsLimit

      },

      infrastructure:
        this.infrastructure,

      featureFlags:
        this.featureFlags,

      features:
        this.features,

      support:
        this.support

    };

  };


/* =========================================================
   STATIC HELPERS
========================================================= */


/*
 * Normalize plan name externally.
 */
subscriptionSchema.statics.normalizePlanName =
  normalizePlanName;


/*
 * Normalize currency externally.
 */
subscriptionSchema.statics.normalizeCurrency =
  normalizeCurrency;


/*
 * Normalize billing cycle externally.
 */
subscriptionSchema.statics.normalizeBillingCycle =
  normalizeBillingCycle;


/*
 * Normalize provider externally.
 */
subscriptionSchema.statics.normalizePaymentProvider =
  normalizePaymentProvider;


/*
 * Find user's newest subscription.
 */
subscriptionSchema.statics.findLatestForUser =
  function(userId) {

    return this.findOne({
      userId
    })
      .sort({
        createdAt: -1
      });

  };


/*
 * Find user's active subscription.
 */
subscriptionSchema.statics.findActiveForUser =
  function(userId) {

    return this.findOne({

      userId,

      status: "active"

    })
      .sort({
        createdAt: -1
      });

  };


/*
 * Find subscription by provider subscription ID.
 */
subscriptionSchema.statics.findByProviderSubscriptionId =
  function(
    paymentProvider,
    providerSubscriptionId
  ) {

    if (
      !paymentProvider ||
      !providerSubscriptionId
    ) {

      return null;

    }

    return this.findOne({

      paymentProvider:
        normalizePaymentProvider(
          paymentProvider
        ),

      providerSubscriptionId:
        String(
          providerSubscriptionId
        ).trim()

    });

  };


/*
 * Find subscription by provider payment ID.
 */
subscriptionSchema.statics.findByPaymentId =
  function(
    paymentProvider,
    paymentId
  ) {

    if (
      !paymentProvider ||
      !paymentId
    ) {

      return null;

    }

    return this.findOne({

      paymentProvider:
        normalizePaymentProvider(
          paymentProvider
        ),

      paymentId:
        String(
          paymentId
        ).trim()

    });

  };


/* =========================================================
   MODEL
========================================================= */

const Subscription =
  mongoose.models.Subscription ||
  mongoose.model(
    "Subscription",
    subscriptionSchema
  );


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  Subscription;


/* =========================================================
   EXPORT CONSTANTS
========================================================= */

module.exports.PLAN_NAMES =
  PLAN_NAMES;

module.exports.CURRENCIES =
  CURRENCIES;

module.exports.BILLING_CYCLES =
  BILLING_CYCLES;

module.exports.PAYMENT_PROVIDERS =
  PAYMENT_PROVIDERS;

module.exports.PAYMENT_STATUSES =
  PAYMENT_STATUSES;

module.exports.SUBSCRIPTION_STATUSES =
  SUBSCRIPTION_STATUSES;
