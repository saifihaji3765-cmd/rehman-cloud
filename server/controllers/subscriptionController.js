/* =========================================================
   ZyrionOS SUBSCRIPTION CONTROLLER
   =========================================================

   Responsibilities:
   - Current subscription
   - Subscription history
   - Subscription creation/payment handoff
   - Upgrade request
   - Cancellation request
   - Usage + credits

   IMPORTANT:
   This controller NEVER treats a client request as
   successful payment.

   Subscription activation is performed by the verified
   payment-provider webhook.
========================================================= */

const Subscription = require("../models/subscriptionModel");

/* =========================================================
   PLAN CATALOG
=========================================================

   Pricing is kept aligned with the ZyrionOS billing catalog.

   The client cannot control the final price.

========================================================= */

const PLAN_PRICES = Object.freeze({
  Starter: Object.freeze({
    monthly: 19,
    yearly: 190
  }),

  Pro: Object.freeze({
    monthly: 99,
    yearly: 990
  }),

  Business: Object.freeze({
    monthly: 199,
    yearly: 1990
  }),

  Scale: Object.freeze({
    monthly: 299,
    yearly: 2990
  }),

  Enterprise: Object.freeze({
    monthly: 499,
    yearly: 4990
  })
});

/* =========================================================
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  const plans = {
    starter: "Starter",
    pro: "Pro",
    business: "Business",
    scale: "Scale",
    enterprise: "Enterprise"
  };

  return plans[normalized] || null;
}

/* =========================================================
   BILLING CYCLE NORMALIZATION
========================================================= */

function normalizeBillingCycle(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "monthly") {
    return "monthly";
  }

  if (normalized === "yearly") {
    return "yearly";
  }

  return null;
}

/* =========================================================
   USER ID
========================================================= */

function getUserId(req) {
  return (
    req?.user?.id ||
    req?.user?._id ||
    req?.user?.userId ||
    null
  );
}

/* =========================================================
   EXPECTED PRICE
========================================================= */

function getExpectedPrice(planName, billingCycle) {
  const plan = PLAN_PRICES[planName];

  if (!plan) {
    return null;
  }

  return plan[billingCycle] ?? null;
}

/* =========================================================
   ACTIVE SUBSCRIPTION
========================================================= */

async function getActiveSubscription(userId) {
  return Subscription.findOne({
    userId,
    status: "active"
  })
    .sort({
      createdAt: -1
    })
    .lean();
}

/* =========================================================
   GET CURRENT SUBSCRIPTION
=========================================================

   GET /api/subscription/me

   Returns a stable single-subscription response.

========================================================= */

async function getSubscriptionController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const subscription = await getActiveSubscription(userId);

    if (!subscription) {
      return res.status(200).json({
        success: true,
        subscription: null,
        active: false
      });
    }

    return res.status(200).json({
      success: true,
      active: true,
      subscription
    });
  } catch (error) {
    console.error(
      "Get Subscription Error:",
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load subscription"
    });
  }
}

/* =========================================================
   GET SUBSCRIPTION HISTORY
=========================================================

   GET /api/subscription

========================================================= */

async function getSubscriptionsController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const subscriptions = await Subscription.find({
      userId
    })
      .sort({
        createdAt: -1
      })
      .lean();

    return res.status(200).json({
      success: true,
      subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    console.error(
      "Get Subscriptions Error:",
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load subscriptions"
    });
  }
}

/* =========================================================
   CREATE SUBSCRIPTION
=========================================================

   POST /api/subscription/create

   IMPORTANT:
   This endpoint does NOT activate the subscription.

   Actual activation happens only after verified payment
   provider confirmation/webhook.

========================================================= */

async function createSubscriptionController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const {
      plan,
      billingCycle = "monthly",
      provider,
      currency
    } = req.body || {};

    const planName = normalizePlan(plan);

    if (!planName) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription plan"
      });
    }

    const cycle = normalizeBillingCycle(billingCycle);

    if (!cycle) {
      return res.status(400).json({
        success: false,
        message: "Invalid billing cycle. Use monthly or yearly."
      });
    }

    const expectedPrice = getExpectedPrice(
      planName,
      cycle
    );

    if (expectedPrice === null) {
      return res.status(400).json({
        success: false,
        message: "Subscription pricing is not configured"
      });
    }

    const normalizedProvider =
      typeof provider === "string"
        ? provider.trim().toLowerCase()
        : null;

    const normalizedCurrency =
      typeof currency === "string"
        ? currency.trim().toUpperCase()
        : "USD";

    /* -------------------------------------------------------
       DO NOT ACTIVATE HERE
    ------------------------------------------------------- */

    return res.status(409).json({
      success: false,
      code: "PAYMENT_REQUIRED",
      message:
        "Payment is required before the subscription can be activated.",
      paymentRequired: true,
      paymentConfirmed: false,
      entitlementActive: false,

      subscription: {
        planName,
        billingCycle: cycle,
        price: expectedPrice,
        currency: normalizedCurrency,
        paymentProvider: normalizedProvider
      },

      userId: String(userId)
    });
  } catch (error) {
    console.error(
      "Create Subscription Error:",
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create subscription request"
    });
  }
}

/* =========================================================
   UPGRADE SUBSCRIPTION
=========================================================

   POST /api/subscription/upgrade

   Accepts both:
   {
      plan: "Pro"
   }

   and:

   {
      newPlan: "Pro"
   }

   This keeps the API compatible with the current frontend
   billing service.

   IMPORTANT:
   No subscription is activated here.

========================================================= */

async function upgradeSubscriptionController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const requestedPlan =
      req.body?.plan ??
      req.body?.newPlan;

    const planName = normalizePlan(requestedPlan);

    if (!planName) {
      return res.status(400).json({
        success: false,
        message: "Invalid target subscription plan"
      });
    }

    const billingCycle = normalizeBillingCycle(
      req.body?.billingCycle || "monthly"
    );

    if (!billingCycle) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid billing cycle. Use monthly or yearly."
      });
    }

    const currentSubscription =
      await getActiveSubscription(userId);

    if (!currentSubscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found"
      });
    }

    const expectedPrice = getExpectedPrice(
      planName,
      billingCycle
    );

    if (expectedPrice === null) {
      return res.status(400).json({
        success: false,
        message: "Subscription pricing is not configured"
      });
    }

    if (
      String(currentSubscription.planName).toLowerCase() ===
      planName.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: "You are already subscribed to this plan"
      });
    }

    return res.status(409).json({
      success: false,
      code: "PAYMENT_REQUIRED",
      message:
        "Payment is required before the subscription can be upgraded.",
      paymentRequired: true,
      paymentConfirmed: false,
      entitlementActive: false,

      currentSubscription: {
        id: currentSubscription._id,
        planName: currentSubscription.planName,
        billingCycle:
          currentSubscription.billingCycle,
        price: currentSubscription.price,
        currency: currentSubscription.currency
      },

      targetSubscription: {
        planName,
        billingCycle,
        price: expectedPrice,
        currency: "USD"
      }
    });
  } catch (error) {
    console.error(
      "Upgrade Subscription Error:",
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to process subscription upgrade"
    });
  }
}

/* =========================================================
   CANCEL SUBSCRIPTION
=========================================================

   IMPORTANT:
   A real provider-side cancellation must be performed by
   the payment-provider integration.

   This controller does not falsely mark the subscription
   cancelled before provider confirmation.

========================================================= */

async function cancelSubscriptionController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const subscription =
      await getActiveSubscription(userId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found"
      });
    }

    if (!subscription.providerSubscriptionId) {
      return res.status(409).json({
        success: false,
        code: "PROVIDER_SUBSCRIPTION_REQUIRED",
        message:
          "This subscription does not have a provider subscription ID and cannot be cancelled automatically."
      });
    }

    return res.status(409).json({
      success: false,
      code: "PROVIDER_CANCELLATION_REQUIRED",
      message:
        "Subscription cancellation must be completed through the payment provider integration.",
      paymentProvider:
        subscription.paymentProvider,
      providerSubscriptionId:
        subscription.providerSubscriptionId,
      subscriptionId: subscription._id
    });
  } catch (error) {
    console.error(
      "Cancel Subscription Error:",
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to process subscription cancellation"
    });
  }
}

/* =========================================================
   USAGE + CREDITS
=========================================================

   GET /api/subscription/usage

========================================================= */

async function usageController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const subscription =
      await getActiveSubscription(userId);

    if (!subscription) {
      return res.status(200).json({
        success: true,
        active: false,

        usage: {
          aiRequestsUsed: 0,
          aiCreditsUsed: 0,
          deploymentsUsed: 0,
          thumbnailsGenerated: 0,
          videoCreditsUsed: 0
        },

        limits: {
          aiCreditsLimit: 0,
          deploymentsLimit: 0,
          thumbnailCreditsLimit: 0,
          videoCreditsLimit: 0
        },

        remaining: {
          aiCredits: 0,
          deployments: 0,
          thumbnailCredits: 0,
          videoCredits: 0
        }
      });
    }

    const usageData = subscription.usage || {};
    const limitData = subscription.limits || {};

    const aiCreditsLimit =
      Number(limitData.aiCreditsLimit ?? 0);

    const deploymentsLimit =
      Number(limitData.deploymentsLimit ?? 0);

    const thumbnailCreditsLimit =
      Number(limitData.thumbnailCreditsLimit ?? 0);

    const videoCreditsLimit =
      Number(limitData.videoCreditsLimit ?? 0);

    const aiCreditsUsed =
      Number(usageData.aiCreditsUsed ?? 0);

    const deploymentsUsed =
      Number(usageData.deploymentsUsed ?? 0);

    const thumbnailsGenerated =
      Number(usageData.thumbnailsGenerated ?? 0);

    const videoCreditsUsed =
      Number(usageData.videoCreditsUsed ?? 0);

    return res.status(200).json({
      success: true,
      active: true,

      subscriptionId: subscription._id,
      planName: subscription.planName,
      billingCycle: subscription.billingCycle,
      status: subscription.status,

      usage: {
        aiRequestsUsed:
          Number(usageData.aiRequestsUsed ?? 0),

        aiCreditsUsed,

        deploymentsUsed,

        thumbnailsGenerated,

        videoCreditsUsed
      },

      limits: {
        aiCreditsLimit,

        deploymentsLimit,

        thumbnailCreditsLimit,

        videoCreditsLimit
      },

      remaining: {
        aiCredits:
          aiCreditsLimit === -1
            ? -1
            : Math.max(
                aiCreditsLimit - aiCreditsUsed,
                0
              ),

        deployments:
          deploymentsLimit === -1
            ? -1
            : Math.max(
                deploymentsLimit - deploymentsUsed,
                0
              ),

        thumbnailCredits:
          thumbnailCreditsLimit === -1
            ? -1
            : Math.max(
                thumbnailCreditsLimit -
                  thumbnailsGenerated,
                0
              ),

        videoCredits:
          videoCreditsLimit === -1
            ? -1
            : Math.max(
                videoCreditsLimit -
                  videoCreditsUsed,
                0
              )
      },

      infrastructure:
        subscription.infrastructure || {},

      featureFlags:
        subscription.featureFlags || {},

      features:
        Array.isArray(subscription.features)
          ? subscription.features
          : [],

      support:
        subscription.support ||
        "Community Support"
    });
  } catch (error) {
    console.error(
      "Subscription Usage Error:",
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load subscription usage"
    });
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createSubscriptionController,
  getSubscriptionController,
  getSubscriptionsController,
  cancelSubscriptionController,
  upgradeSubscriptionController,
  usageController
};
