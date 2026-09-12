const mongoose =
  require("mongoose");


/* =========================================================
   SUBSCRIPTION SCHEMA
========================================================= */

const subscriptionSchema =
  new mongoose.Schema(

    {

      /* =====================================================
         USER
      ===================================================== */

      userId: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true

      },


      /* =====================================================
         PLAN
      ===================================================== */

      planName: {

        type:
          String,

        enum: [
          "Starter",
          "Pro",
          "Business",
          "Scale",
          "Enterprise"
        ],

        required:
          true,

        index:
          true

      },


      /* =====================================================
         BILLING
      ===================================================== */

      price: {

        type:
          Number,

        required:
          true,

        min:
          0

      },


      currency: {

        type:
          String,

        enum: [
          "USD",
          "INR"
        ],

        default:
          "USD",

        uppercase:
          true

      },


      billingCycle: {

        type:
          String,

        enum: [
          "monthly",
          "yearly"
        ],

        default:
          "monthly",

        index:
          true

      },


      /* =====================================================
         PAYMENT PROVIDER
      ===================================================== */

      paymentProvider: {

        type:
          String,

        enum: [
          "stripe",
          "razorpay"
        ],

        required:
          true,

        index:
          true

      },


      paymentId: {

        type:
          String,

        default:
          "",

        index:
          true

      },


      orderId: {

        type:
          String,

        default:
          "",

        index:
          true

      },


      providerCustomerId: {

        type:
          String,

        default:
          "",

        index:
          true

      },


      providerSubscriptionId: {

        type:
          String,

        default:
          "",

        index:
          true

      },


      /* =====================================================
         PAYMENT STATUS
      ===================================================== */

      paymentStatus: {

        type:
          String,

        enum: [
          "pending",
          "paid",
          "failed",
          "refunded",
          "cancelled"
        ],

        default:
          "pending",

        index:
          true

      },


      /* =====================================================
         SUBSCRIPTION STATUS
      ===================================================== */

      status: {

        type:
          String,

        enum: [
          "pending",
          "active",
          "past_due",
          "cancelled",
          "expired",
          "upgraded"
        ],

        default:
          "pending",

        index:
          true

      },


      /* =====================================================
         DATES
      ===================================================== */

      startDate: {

        type:
          Date,

        default:
          Date.now

      },


      expiryDate: {

        type:
          Date,

        required:
          true,

        index:
          true

      },


      autoRenew: {

        type:
          Boolean,

        default:
          true

      },


      cancelledAt: {

        type:
          Date,

        default:
          null

      },


      /* =====================================================
         USAGE
      ===================================================== */

      aiRequestsUsed: {

        type:
          Number,

        default:
          0,

        min:
          0

      },


      aiCreditsUsed: {

        type:
          Number,

        default:
          0,

        min:
          0

      },


      deploymentsUsed: {

        type:
          Number,

        default:
          0,

        min:
          0

      },


      thumbnailsGenerated: {

        type:
          Number,

        default:
          0,

        min:
          0

      },


      videoCreditsUsed: {

        type:
          Number,

        default:
          0,

        min:
          0

      },


      /* =====================================================
         ENTITLEMENT LIMITS
      ===================================================== */

      deploymentsLimit: {

        type:
          Number,

        default:
          0

      },


      aiCreditsLimit: {

        type:
          Number,

        default:
          0

      },


      thumbnailCreditsLimit: {

        type:
          Number,

        default:
          0

      },


      videoCreditsLimit: {

        type:
          Number,

        default:
          0

      },


      /* =====================================================
         INFRASTRUCTURE ENTITLEMENTS
      ===================================================== */

      infrastructure: {

        ram: {

          type:
            String,

          default:
            null

        },

        cpu: {

          type:
            String,

          default:
            null

        },

        storage: {

          type:
            String,

          default:
            null

        },

        bandwidth: {

          type:
            String,

          default:
            null

        }

      },


      /* =====================================================
         FEATURE FLAGS
      ===================================================== */

      featureFlags: {

        customDomain: {

          type:
            Boolean,

          default:
            false

        },

        autoSSL: {

          type:
            Boolean,

          default:
            false

        },

        autoScaling: {

          type:
            Boolean,

          default:
            false

        },

        advancedMonitoring: {

          type:
            Boolean,

          default:
            false

        },

        priorityDeployments: {

          type:
            Boolean,

          default:
            false

        },

        dedicatedInfrastructure: {

          type:
            Boolean,

          default:
            false

        },

        dedicatedSupport: {

          type:
            Boolean,

          default:
            false

        }

      },


      /* =====================================================
         PLAN FEATURES
      ===================================================== */

      features: {

        type:
          [String],

        default:
          []

      },


      support: {

        type:
          String,

        default:
          "Community Support"

      },


      /* =====================================================
         WEBHOOK IDEMPOTENCY
      ===================================================== */

      processedWebhookEvents: {

        type:
          [String],

        default:
          []

      },


      lastWebhookEventId: {

        type:
          String,

        default:
          ""

      },


      lastWebhookEventType: {

        type:
          String,

        default:
          ""

      },


      /* =====================================================
         METADATA
      ===================================================== */

      metadata: {

        environment: {

          type:
            String,

          default:
            null

        },

        version: {

          type:
            String,

          default:
            "3.0.0"

        }

      }

    },

    {

      timestamps:
        true

    }

  );


/* =========================================================
   INDEXES
========================================================= */


/*
 * Fast lookup of user's active subscription.
 */

subscriptionSchema.index({

  userId:
    1,

  status:
    1,

  createdAt:
    -1

});


/*
 * Provider subscription lookup.
 */

subscriptionSchema.index({

  paymentProvider:
    1,

  providerSubscriptionId:
    1

});


/*
 * Provider payment lookup.
 */

subscriptionSchema.index({

  paymentProvider:
    1,

  paymentId:
    1

});


/*
 * Expiry processing.
 */

subscriptionSchema.index({

  status:
    1,

  expiryDate:
    1

});


/* =========================================================
   NORMALIZATION
========================================================= */

subscriptionSchema.pre(
  "save",
  function(next) {

    if (
      this.planName
    ) {

      const normalized =
        String(
          this.planName
        ).trim();


      const planMap = {

        starter:
          "Starter",

        pro:
          "Pro",

        business:
          "Business",

        scale:
          "Scale",

        enterprise:
          "Enterprise"

      };


      const mapped =
        planMap[
          normalized.toLowerCase()
        ];


      if (mapped) {

        this.planName =
          mapped;

      }

    }


    if (
      this.currency
    ) {

      this.currency =
        String(
          this.currency
        ).toUpperCase();

    }


    next();

  }
);


/* =========================================================
   MODEL
========================================================= */

const Subscription =
  mongoose.model(
    "Subscription",
    subscriptionSchema
  );


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  Subscription;
