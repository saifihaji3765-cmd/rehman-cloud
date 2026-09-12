/* =========================================================
   ZyrionOS SUBSCRIPTION CONTROLLER
   =========================================================

   Responsibilities:
   - Read user's real subscription
   - Never activate subscription without webhook
   - Upgrade/cancel safely
   - Return real usage from database
   - Enforce current plan catalog
   - Keep payment provider IDs available
========================================================= */


/* =========================
   MODELS
========================= */

const Subscription =
  require(
    "../models/subscriptionModel"
  );

const User =
  require(
    "../models/userModel"
  );


/* =========================
   SERVICES
========================= */

const formatResponse =
  require(
    "../utils/formatResponse"
  );

const logger =
  require(
    "../services/loggerService"
  );


/* =========================
   PLAN CATALOG
========================= */

const PLAN_PRICES = {

  Starter: {
    monthly: 19,
    yearly: 190
  },

  Pro: {
    monthly: 99,
    yearly: 990
  },

  Business: {
    monthly: 199,
    yearly: 1990
  },

  Scale: {
    monthly: 299,
    yearly: 2990
  },

  Enterprise: {
    monthly: 499,
    yearly: 4990
  }

};


/* =========================================================
   HELPERS
========================================================= */


/* =========================
   USER ID
========================= */

function getUserId(req) {

  return (
    req?.user?.id ||
    req?.user?._id ||
    req?.user?.userId ||
    null
  );

}


/* =========================
   PLAN NORMALIZER
========================= */

function normalizePlan(
  plan
) {

  if (!plan) {
    return null;
  }

  const value =
    String(plan)
      .trim()
      .toLowerCase();


  const aliases = {

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


  return (
    aliases[value] ||
    null
  );

}


/* =========================
   BILLING CYCLE
========================= */

function normalizeBillingCycle(
  value
) {

  return value ===
    "yearly"
    ? "yearly"
    : "monthly";

}


/* =========================
   PRICE
========================= */

function getExpectedPrice(
  plan,
  billingCycle
) {

  const selected =
    PLAN_PRICES[
      plan
    ];


  if (!selected) {
    return null;
  }


  return selected[
    billingCycle
  ];

}


/* =========================
   ACTIVE SUBSCRIPTION
========================= */

async function getActiveSubscription(
  userId
) {

  return Subscription
    .findOne({

      userId,

      status:
        "active"

    })
    .sort({
      createdAt:
        -1
    });

}


/* =========================================================
   CREATE SUBSCRIPTION
   =========================================================

   IMPORTANT:
   This endpoint does NOT activate a paid subscription.

   Payment provider webhook is authoritative.
========================================================= */

async function createSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      getUserId(req);


    if (!userId) {

      return res
        .status(401)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Authentication required"

          })
        );

    }


    const {
      planName,
      plan,
      price,
      currency = "USD",
      paymentProvider,
      paymentId,
      orderId,
      billingCycle = "monthly"
    } =
      req.body || {};


    const normalizedPlan =
      normalizePlan(
        planName ||
        plan
      );


    if (!normalizedPlan) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Invalid plan selected",

            allowedPlans:
              Object.keys(
                PLAN_PRICES
              )

          })
        );

    }


    const cycle =
      normalizeBillingCycle(
        billingCycle
      );


    const expectedPrice =
      getExpectedPrice(
        normalizedPlan,
        cycle
      );


    if (
      expectedPrice ===
      null
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Unable to resolve plan price"

          })
        );

    }


    /*
     * Never trust the price sent by frontend.
     */

    if (
      price !==
        undefined &&
      Number(price) !==
        expectedPrice
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Plan price mismatch",

            expectedPrice,

            currency:
              "USD"

          })
        );

    }


    /*
     * Do not create ACTIVE subscription from
     * a normal authenticated request.
     */

    return res
      .status(409)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Subscription activation requires verified payment",

          code:
            "PAYMENT_REQUIRED",

          plan:
            normalizedPlan,

          billingCycle:
            cycle,

          amount:
            expectedPrice,

          currency:
            "USD",

          paymentProvider:
            paymentProvider ||
            null,

          paymentId:
            paymentId ||
            null,

          orderId:
            orderId ||
            null,

          nextStep:
            "Complete payment and wait for the verified provider webhook."

        })
      );

  }

  catch (error) {

    logger.error(
      `Subscription creation failed: ${error?.message}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Subscription request failed",

          error:
            error?.message ||
            "Unknown error"

        })
      );

  }

}


/* =========================================================
   GET MY SUBSCRIPTIONS
========================================================= */

async function getSubscriptionsController(
  req,
  res
) {

  try {

    const userId =
      getUserId(req);


    if (!userId) {

      return res
        .status(401)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Authentication required"

          })
        );

    }


    const subscriptions =
      await Subscription
        .find({
          userId
        })
        .sort({
          createdAt:
            -1
        })
        .lean();


    return res.json(
      formatResponse({

        success:
          true,

        data:
          subscriptions

      })
    );

  }

  catch (error) {

    logger.error(
      `Subscription history failed: ${error?.message}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to fetch subscriptions",

          error:
            error?.message ||
            "Unknown error"

        })
      );

  }

}


/* =========================================================
   UPGRADE SUBSCRIPTION
========================================================= */

async function upgradeSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      getUserId(req);


    if (!userId) {

      return res
        .status(401)
        .json({
          success:
            false,

          message:
            "Authentication required"
        });

    }


    const {
      newPlan,
      billingCycle = "monthly"
    } =
      req.body || {};


    const normalizedPlan =
      normalizePlan(
        newPlan
      );


    if (!normalizedPlan) {

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "Invalid target plan",

          allowedPlans:
            Object.keys(
              PLAN_PRICES
            )
        });

    }


    const cycle =
      normalizeBillingCycle(
        billingCycle
      );


    const targetPrice =
      getExpectedPrice(
        normalizedPlan,
        cycle
      );


    const currentSubscription =
      await getActiveSubscription(
        userId
      );


    if (!currentSubscription) {

      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "No active subscription found"
        });

    }


    const currentPlan =
      normalizePlan(
        currentSubscription.planName
      );


    const currentPrice =
      Number(
        currentSubscription.price ||
        0
      );


    /*
     * Do not mutate the active subscription here.
     *
     * A real provider-side subscription change
     * must be confirmed through webhook.
     */

    if (
      currentPlan ===
      normalizedPlan
    ) {

      return res
        .status(400)
        .json({
          success:
            false,

          message:
            "User is already on this plan"
        });

    }


    logger.info(
      `Subscription upgrade requested: ${currentPlan} -> ${normalizedPlan}`
    );


    return res.json({
      success:
        true,

      message:
        "Subscription upgrade requires payment provider confirmation",

      upgrade: {

        currentPlan,

        currentPrice,

        newPlan:
          normalizedPlan,

        newPrice:
          targetPrice,

        currency:
          "USD",

        billingCycle:
          cycle,

        status:
          "payment_required"

      },

      nextStep:
        "Create the payment/subscription with the selected provider. The verified webhook will apply the new entitlement."

    });

  }

  catch (error) {

    logger.error(
      `Subscription upgrade failed: ${error?.message}`
    );


    return res
      .status(500)
      .json({
        success:
          false,

        message:
          "Subscription upgrade failed",

        error:
          error?.message ||
          "Unknown error"
      });

  }

}


/* =========================================================
   CANCEL SUBSCRIPTION
========================================================= */

async function cancelSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      getUserId(req);


    if (!userId) {

      return res
        .status(401)
        .json({
          success:
            false,

          message:
            "Authentication required"
        });

    }


    const subscription =
      await getActiveSubscription(
        userId
      );


    if (!subscription) {

      return res
        .status(404)
        .json({
          success:
            false,

          message:
            "No active subscription"
        });

    }


    /*
     * Provider-managed subscriptions should be
     * cancelled at the provider first.
     *
     * Local entitlement must not be revoked
     * merely because a client called this endpoint.
     */

    return res.json({

      success:
        true,

      message:
        "Subscription cancellation requested",

      subscription: {

        subscriptionId:
          subscription._id,

        planName:
          subscription.planName,

        status:
          subscription.status,

        provider:
          subscription.paymentProvider,

        providerSubscriptionId:
          subscription.providerSubscriptionId ||
          null

      },

      nextStep:
        "Cancel the provider subscription. The verified provider webhook will update the local subscription status."

    });

  }

  catch (error) {

    logger.error(
      `Subscription cancellation failed: ${error?.message}`
    );


    return res
      .status(500)
      .json({
        success:
          false,

        message:
          "Subscription cancellation failed",

        error:
          error?.message ||
          "Unknown error"
      });

  }

}


/* =========================================================
   USAGE + CREDITS
========================================================= */

async function usageController(
  req,
  res
) {

  try {

    const userId =
      getUserId(req);


    if (!userId) {

      return res
        .status(401)
        .json({
          success:
            false,

          message:
            "Authentication required"
        });

    }


    const subscription =
      await getActiveSubscription(
        userId
      );


    if (!subscription) {

      return res.json({

        success:
          true,

        usage: {

          aiRequests:
            0,

          deployments:
            0,

          thumbnailsGenerated:
            0,

          creditsRemaining:
            0

        },

        subscription:
          null

      });

    }


    const aiRequests =
      Number(
        subscription.aiRequestsUsed ||
        0
      );


    const deployments =
      Number(
        subscription.deploymentsUsed ||
        0
      );


    const thumbnailsGenerated =
      Number(
        subscription.thumbnailsGenerated ||
        0
      );


    const creditsLimit =
      Number(
        subscription.aiCreditsLimit ??
        subscription.creditsLimit ??
        0
      );


    const creditsUsed =
      Number(
        subscription.aiCreditsUsed ||
        0
      );


    const creditsRemaining =
      creditsLimit ===
        -1
        ? -1
        : Math.max(
            0,
            creditsLimit -
            creditsUsed
          );


    return res.json({

      success:
        true,

      usage: {

        aiRequests,

        deployments,

        thumbnailsGenerated,

        creditsRemaining,

        creditsLimit,

        unlimitedCredits:
          creditsLimit === -1

      },

      subscription: {

        id:
          subscription._id,

        planName:
          subscription.planName,

        status:
          subscription.status,

        expiryDate:
          subscription.expiryDate,

        autoRenew:
          subscription.autoRenew

      }

    });

  }

  catch (error) {

    logger.error(
      `Subscription usage failed: ${error?.message}`
    );


    return res
      .status(500)
      .json({

        success:
          false,

        message:
          "Failed to fetch subscription usage",

        error:
          error?.message ||
          "Unknown error"

      });

  }

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  createSubscriptionController,

  getSubscriptionsController,

  upgradeSubscriptionController,

  cancelSubscriptionController,

  usageController

};
