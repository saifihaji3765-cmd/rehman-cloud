/* =========================================================
   ZyrionOS SUBSCRIPTION CONTROLLER v2.0.0

   Responsibilities:
   - Current subscription
   - Subscription history
   - Payment handoff
   - Upgrade request
   - Cancellation request
   - Usage + credits
   - Provider / entitlement state visibility

   IMPORTANT:
   - This controller NEVER activates a subscription.
   - This controller NEVER trusts client supplied price.
   - Billing Agent is the authoritative pricing source.
   - Verified payment webhook is the authoritative
     subscription activation source.
   - Provider cancellation must be confirmed before
     entitlement state is changed.
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const Subscription =
  require("../models/subscriptionModel");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");

const formatResponse =
  require("../utils/formatResponse");


/* =========================================================
   AGENTS
========================================================= */

const billingAgent =
  require("../agents/billingAgent");


/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_PLANS = Object.freeze([
  "Starter",
  "Pro",
  "Business",
  "Scale",
  "Enterprise"
]);


const ALLOWED_BILLING_CYCLES =
  Object.freeze([
    "monthly",
    "yearly"
  ]);


const ALLOWED_PROVIDERS =
  Object.freeze([
    "stripe",
    "razorpay"
  ]);


/* =========================================================
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(value) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  const plans = {

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
    plans[normalized] ||
    null
  );

}


/* =========================================================
   BILLING CYCLE NORMALIZATION
========================================================= */

function normalizeBillingCycle(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    ALLOWED_BILLING_CYCLES.includes(
      normalized
    )
  ) {

    return normalized;

  }


  return null;

}


/* =========================================================
   PROVIDER NORMALIZATION
========================================================= */

function normalizeProvider(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    ALLOWED_PROVIDERS.includes(
      normalized
    )
  ) {

    return normalized;

  }


  return null;

}


/* =========================================================
   CURRENCY NORMALIZATION
========================================================= */

function normalizeCurrency(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }


  const normalized =
    value
      .trim()
      .toUpperCase();


  if (
    !/^[A-Z]{3}$/.test(
      normalized
    )
  ) {

    return null;

  }


  return normalized;

}


/* =========================================================
   USER ID
========================================================= */

function getUserId(req) {

  const value =
    req?.user?.id ||
    req?.user?._id ||
    req?.user?.userId ||
    null;


  if (
    !value
  ) {

    return null;

  }


  return String(
    value
  ).trim();

}


/* =========================================================
   AUTHENTICATION RESPONSE
========================================================= */

function requireUser(
  req,
  res
) {

  const userId =
    getUserId(
      req
    );


  if (
    !userId
  ) {

    res
      .status(401)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Authentication required"

        })
      );


    return null;

  }


  return userId;

}


/* =========================================================
   BILLING PLAN RESOLUTION
========================================================= */

/*
 * IMPORTANT:
 *
 * Subscription Controller does NOT maintain a second
 * hard-coded pricing catalog.
 *
 * Billing Agent is the authoritative source.
 */

async function resolveBillingPlan({
  userId,
  plan,
  billingCycle
}) {

  const billing =
    await billingAgent({

      userId,

      plan,

      billingCycle

    });


  if (
    !billing ||
    billing.success !== true
  ) {

    const error =
      new Error(
        billing?.error ||
        billing?.message ||
        "Unable to resolve billing plan"
      );


    error.code =
      "BILLING_PLAN_INVALID";


    throw error;

  }


  const billingData =
    billing?.billing ||
    {};


  const selectedPlan =
    billingData.selectedPlan;


  if (
    !selectedPlan
  ) {

    const error =
      new Error(
        "Billing Agent returned no selected plan"
      );


    error.code =
      "PLAN_DATA_MISSING";


    throw error;

  }


  const amount =
    Number(
      billingData.amount ??
      selectedPlan.amount
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {

    const error =
      new Error(
        "Billing Agent returned an invalid plan amount"
      );


    error.code =
      "INVALID_PLAN_PRICE";


    throw error;

  }


  const currency =
    normalizeCurrency(
      selectedPlan.currency ||
      billingData.currency ||
      "USD"
    );


  if (
    !currency
  ) {

    const error =
      new Error(
        "Billing Agent returned an invalid plan currency"
      );


    error.code =
      "INVALID_PLAN_CURRENCY";


    throw error;

  }


  return {

    billing,

    billingData,

    selectedPlan,

    amount,

    currency

  };

}


/* =========================================================
   ACTIVE SUBSCRIPTION
========================================================= */

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

    })
    .lean();

}


/* =========================================================
   CURRENT SUBSCRIPTION
========================================================= */

async function getSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      requireUser(
        req,
        res
      );


    if (
      !userId
    ) {

      return;

    }


    const subscription =
      await getActiveSubscription(
        userId
      );


    if (
      !subscription
    ) {

      return res
        .status(200)
        .json(
          formatResponse({

            success:
              true,

            active:
              false,

            subscription:
              null

          })
        );

    }


    return res
      .status(200)
      .json(
        formatResponse({

          success:
            true,

          active:
            true,

          subscription

        })
      );

  }

  catch (error) {

    logger.error(
      `Get Subscription Error: ${error?.message || error}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to load subscription",

          error:
            error?.message ||
            "Unknown subscription error"

        })
      );

  }

}


/* =========================================================
   SUBSCRIPTION HISTORY
========================================================= */

async function getSubscriptionsController(
  req,
  res
) {

  try {

    const userId =
      requireUser(
        req,
        res
      );


    if (
      !userId
    ) {

      return;

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


    return res
      .status(200)
      .json(
        formatResponse({

          success:
            true,

          subscriptions,

          count:
            subscriptions.length

        })
      );

  }

  catch (error) {

    logger.error(
      `Get Subscriptions Error: ${error?.message || error}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to load subscriptions",

          error:
            error?.message ||
            "Unknown subscription error"

        })
      );

  }

}


/* =========================================================
   CREATE SUBSCRIPTION REQUEST
========================================================= */

/*
 * POST /api/subscription/create
 *
 * This endpoint creates NO subscription.
 *
 * It validates the requested plan and returns the
 * authoritative billing information needed by the
 * payment flow.
 *
 * Final activation:
 *
 * Payment
 *   ↓
 * Provider Webhook
 *   ↓
 * Verified Payment
 *   ↓
 * Subscription Service
 *   ↓
 * Active Entitlement
 */

async function createSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      requireUser(
        req,
        res
      );


    if (
      !userId
    ) {

      return;

    }


    const body =
      req.body ||
      {};


    const planName =
      normalizePlan(
        body.plan ||
        body.planName
      );


    if (
      !planName
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Invalid subscription plan",

            allowedPlans:
              ALLOWED_PLANS

          })
        );

    }


    const cycle =
      normalizeBillingCycle(
        body.billingCycle ||
        "monthly"
      );


    if (
      !cycle
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Invalid billing cycle. Use monthly or yearly.",

            allowedBillingCycles:
              ALLOWED_BILLING_CYCLES

          })
        );

    }


    const normalizedProvider =
      normalizeProvider(
        body.provider ||
        body.paymentProvider
      );


    const requestedCurrency =
      body.currency
        ? normalizeCurrency(
            body.currency
          )
        : null;


    if (
      body.currency &&
      !requestedCurrency
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Invalid currency"

          })
        );

    }


    const {
      billingData,
      amount,
      currency
    } =
      await resolveBillingPlan({

        userId,

        plan:
          planName,

        billingCycle:
          cycle

      });


    /*
     * Client currency cannot override Billing Agent.
     */

    if (
      requestedCurrency &&
      requestedCurrency !==
        currency
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            code:
              "PLAN_CURRENCY_MISMATCH",

            message:
              "Requested currency does not match the configured plan currency",

            planCurrency:
              currency,

            requestedCurrency

          })
        );

    }


    return res
      .status(200)
      .json(
        formatResponse({

          success:
            true,

          paymentRequired:
            true,

          paymentConfirmed:
            false,

          entitlementActive:
            false,

          subscription: {

            planName,

            billingCycle:
              cycle,

            price:
              amount,

            currency,

            paymentProvider:
              normalizedProvider,

            billingId:
              billingData?.billingId ||
              null

          },

          nextStep:
            "Create and complete payment through the selected provider. Subscription activation occurs only after verified webhook confirmation."

        })
      );

  }

  catch (error) {

    logger.error(
      `Create Subscription Error: ${error?.message || error}`
    );


    const status =
      error?.code ===
        "BILLING_PLAN_INVALID" ||
      error?.code ===
        "PLAN_DATA_MISSING" ||
      error?.code ===
        "INVALID_PLAN_PRICE" ||
      error?.code ===
        "INVALID_PLAN_CURRENCY"
        ? 400
        : 500;


    return res
      .status(status)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to create subscription request",

          error:
            error?.message ||
            "Unknown subscription error",

          code:
            error?.code ||
            "SUBSCRIPTION_CREATE_FAILED"

        })
      );

  }

}


/* =========================================================
   UPGRADE SUBSCRIPTION
========================================================= */

/*
 * POST /api/subscription/upgrade
 *
 * No direct activation.
 *
 * Upgrade flow:
 *
 * Existing subscription
 *        ↓
 * Target plan validation
 *        ↓
 * Payment
 *        ↓
 * Verified webhook
 *        ↓
 * Subscription Service
 *        ↓
 * New entitlement
 */

async function upgradeSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      requireUser(
        req,
        res
      );


    if (
      !userId
    ) {

      return;

    }


    const requestedPlan =
      req.body?.plan ??
      req.body?.newPlan;


    const planName =
      normalizePlan(
        requestedPlan
      );


    if (
      !planName
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Invalid target subscription plan",

            allowedPlans:
              ALLOWED_PLANS

          })
        );

    }


    const billingCycle =
      normalizeBillingCycle(
        req.body?.billingCycle ||
        "monthly"
      );


    if (
      !billingCycle
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Invalid billing cycle",

            allowedBillingCycles:
              ALLOWED_BILLING_CYCLES

          })
        );

    }


    const currentSubscription =
      await getActiveSubscription(
        userId
      );


    if (
      !currentSubscription
    ) {

      return res
        .status(404)
        .json(
          formatResponse({

            success:
              false,

            message:
              "No active subscription found"

          })
        );

    }


    if (
      String(
        currentSubscription.planName ||
        ""
      ).toLowerCase() ===
      planName.toLowerCase() &&
      String(
        currentSubscription.billingCycle ||
        ""
      ).toLowerCase() ===
      billingCycle.toLowerCase()
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "You are already subscribed to this plan and billing cycle"

          })
        );

    }


    const {
      billingData,
      amount,
      currency
    } =
      await resolveBillingPlan({

        userId,

        plan:
          planName,

        billingCycle

      });


    const provider =
      normalizeProvider(
        req.body?.provider ||
        req.body?.paymentProvider ||
        currentSubscription.paymentProvider
      );


    return res
      .status(200)
      .json(
        formatResponse({

          success:
            true,

          paymentRequired:
            true,

          paymentConfirmed:
            false,

          entitlementActive:
            false,

          currentSubscription: {

            id:
              currentSubscription._id,

            planName:
              currentSubscription.planName,

            billingCycle:
              currentSubscription.billingCycle,

            price:
              currentSubscription.price,

            currency:
              currentSubscription.currency,

            paymentProvider:
              currentSubscription.paymentProvider

          },

          targetSubscription: {

            planName,

            billingCycle,

            price:
              amount,

            currency,

            paymentProvider:
              provider,

            billingId:
              billingData?.billingId ||
              null

          },

          nextStep:
            "Complete payment for the target plan. The verified webhook will determine when the new entitlement becomes active."

        })
      );

  }

  catch (error) {

    logger.error(
      `Upgrade Subscription Error: ${error?.message || error}`
    );


    const status =
      error?.code ===
        "BILLING_PLAN_INVALID" ||
      error?.code ===
        "PLAN_DATA_MISSING" ||
      error?.code ===
        "INVALID_PLAN_PRICE" ||
      error?.code ===
        "INVALID_PLAN_CURRENCY"
        ? 400
        : 500;


    return res
      .status(status)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to process subscription upgrade",

          error:
            error?.message ||
            "Unknown subscription error",

          code:
            error?.code ||
            "SUBSCRIPTION_UPGRADE_FAILED"

        })
      );

  }

}


/* =========================================================
   CANCEL SUBSCRIPTION
========================================================= */

/*
 * IMPORTANT:
 *
 * This controller does NOT directly change:
 *
 * status = cancelled
 *
 * because provider-side cancellation must be confirmed.
 *
 * The dedicated subscription/payment service should perform
 * provider cancellation and then update the database.
 */

async function cancelSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      requireUser(
        req,
        res
      );


    if (
      !userId
    ) {

      return;

    }


    const subscription =
      await getActiveSubscription(
        userId
      );


    if (
      !subscription
    ) {

      return res
        .status(404)
        .json(
          formatResponse({

            success:
              false,

            message:
              "No active subscription found"

          })
        );

    }


    const provider =
      normalizeProvider(
        subscription.paymentProvider
      );


    if (
      !provider
    ) {

      return res
        .status(409)
        .json(
          formatResponse({

            success:
              false,

            code:
              "PAYMENT_PROVIDER_MISSING",

            message:
              "Subscription payment provider is missing"

          })
        );

    }


    const providerSubscriptionId =
      String(
        subscription.providerSubscriptionId ||
        subscription.stripeSubscriptionId ||
        subscription.razorpaySubscriptionId ||
        ""
      ).trim();


    /*
     * Some payment implementations use one-time
     * orders + internal subscriptions. In that case
     * there may be no provider subscription ID.
     *
     * Do not invent one.
     */

    if (
      !providerSubscriptionId
    ) {

      return res
        .status(409)
        .json(
          formatResponse({

            success:
              false,

            code:
              "PROVIDER_SUBSCRIPTION_REQUIRED",

            message:
              "This subscription does not have a provider subscription ID and cannot be cancelled automatically.",

            paymentProvider:
              provider,

            subscriptionId:
              subscription._id

          })
        );

    }


    return res
      .status(202)
      .json(
        formatResponse({

          success:
            true,

          cancellationRequested:
            true,

          cancellationConfirmed:
            false,

          entitlementActive:
            true,

          paymentProvider:
            provider,

          providerSubscriptionId,

          subscriptionId:
            subscription._id,

          message:
            "Cancellation request accepted. Provider cancellation must be confirmed before the subscription entitlement is changed."

        })
      );

  }

  catch (error) {

    logger.error(
      `Cancel Subscription Error: ${error?.message || error}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to process subscription cancellation",

          error:
            error?.message ||
            "Unknown subscription error"

        })
      );

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
      requireUser(
        req,
        res
      );


    if (
      !userId
    ) {

      return;

    }


    const subscription =
      await getActiveSubscription(
        userId
      );


    if (
      !subscription
    ) {

      return res
        .status(200)
        .json(
          formatResponse({

            success:
              true,

            active:
              false,

            usage: {

              aiRequestsUsed:
                0,

              aiCreditsUsed:
                0,

              deploymentsUsed:
                0,

              thumbnailsGenerated:
                0,

              videoCreditsUsed:
                0

            },

            limits: {

              aiCreditsLimit:
                0,

              deploymentsLimit:
                0,

              thumbnailCreditsLimit:
                0,

              videoCreditsLimit:
                0

            },

            remaining: {

              aiCredits:
                0,

              deployments:
                0,

              thumbnailCredits:
                0,

              videoCredits:
                0

            }

          })
        );

    }


    const usageData =
      (
        subscription.usage &&
        typeof subscription.usage ===
          "object"
      )
        ? subscription.usage
        : {};


    const limitData =
      (
        subscription.limits &&
        typeof subscription.limits ===
          "object"
      )
        ? subscription.limits
        : {};


    /*
     * Backward compatibility with the older
     * top-level subscription fields.
     */

    const aiCreditsLimit =
      Number(
        limitData.aiCreditsLimit ??
        subscription.aiCreditsLimit ??
        subscription.creditsLimit ??
        0
      );


    const deploymentsLimit =
      Number(
        limitData.deploymentsLimit ??
        subscription.deploymentsLimit ??
        0
      );


    const thumbnailCreditsLimit =
      Number(
        limitData.thumbnailCreditsLimit ??
        subscription.thumbnailCreditsLimit ??
        0
      );


    const videoCreditsLimit =
      Number(
        limitData.videoCreditsLimit ??
        subscription.videoCreditsLimit ??
        0
      );


    const aiRequestsUsed =
      Number(
        usageData.aiRequestsUsed ??
        subscription.aiRequestsUsed ??
        0
      );


    const aiCreditsUsed =
      Number(
        usageData.aiCreditsUsed ??
        subscription.aiCreditsUsed ??
        0
      );


    const deploymentsUsed =
      Number(
        usageData.deploymentsUsed ??
        subscription.deploymentsUsed ??
        0
      );


    const thumbnailsGenerated =
      Number(
        usageData.thumbnailsGenerated ??
        subscription.thumbnailsGenerated ??
        0
      );


    const videoCreditsUsed =
      Number(
        usageData.videoCreditsUsed ??
        subscription.videoCreditsUsed ??
        0
      );


    function remaining(
      limit,
      used
    ) {

      if (
        limit === -1
      ) {

        return -1;

      }


      return Math.max(
        0,
        limit -
        used
      );

    }


    return res
      .status(200)
      .json(
        formatResponse({

          success:
            true,

          active:
            true,

          subscriptionId:
            subscription._id,

          planName:
            subscription.planName,

          billingCycle:
            subscription.billingCycle,

          status:
            subscription.status,

          paymentProvider:
            subscription.paymentProvider ||
            null,

          usage: {

            aiRequestsUsed,

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
              remaining(
                aiCreditsLimit,
                aiCreditsUsed
              ),

            deployments:
              remaining(
                deploymentsLimit,
                deploymentsUsed
              ),

            thumbnailCredits:
              remaining(
                thumbnailCreditsLimit,
                thumbnailsGenerated
              ),

            videoCredits:
              remaining(
                videoCreditsLimit,
                videoCreditsUsed
              )

          },

          infrastructure:
            subscription.infrastructure ||
            {},

          featureFlags:
            subscription.featureFlags ||
            {},

          features:
            Array.isArray(
              subscription.features
            )
              ? subscription.features
              : [],

          support:
            subscription.support ||
            "Community Support"

        })
      );

  }

  catch (error) {

    logger.error(
      `Subscription Usage Error: ${error?.message || error}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to load subscription usage",

          error:
            error?.message ||
            "Unknown subscription error"

        })
      );

  }

}


/* =========================================================
   ENTITLEMENT STATUS
========================================================= */

/*
 * Read-only control-plane endpoint.
 *
 * This is useful for Deploy Agent / frontend to determine
 * whether the user currently has an active entitlement.
 *
 * It NEVER changes subscription state.
 */

async function entitlementController(
  req,
  res
) {

  try {

    const userId =
      requireUser(
        req,
        res
      );


    if (
      !userId
    ) {

      return;

    }


    const subscription =
      await getActiveSubscription(
        userId
      );


    if (
      !subscription
    ) {

      return res
        .status(200)
        .json(
          formatResponse({

            success:
              true,

            entitled:
              false,

            active:
              false,

            subscription:
              null

          })
        );

    }


    const now =
      Date.now();


    let entitlementActive =
      true;


    if (
      subscription.currentPeriodEnd
    ) {

      const periodEnd =
        new Date(
          subscription.currentPeriodEnd
        ).getTime();


      if (
        Number.isFinite(
          periodEnd
        ) &&
        periodEnd <= now
      ) {

        entitlementActive =
          false;

      }

    }


    if (
      subscription.expiresAt
    ) {

      const expiresAt =
        new Date(
          subscription.expiresAt
        ).getTime();


      if (
        Number.isFinite(
          expiresAt
        ) &&
        expiresAt <= now
      ) {

        entitlementActive =
          false;

      }

    }


    return res
      .status(200)
      .json(
        formatResponse({

          success:
            true,

          entitled:
            entitlementActive,

          active:
            subscription.status ===
              "active" &&
            entitlementActive,

          subscriptionId:
            subscription._id,

          planName:
            subscription.planName,

          billingCycle:
            subscription.billingCycle,

          paymentProvider:
            subscription.paymentProvider ||
            null,

          status:
            subscription.status,

          currentPeriodEnd:
            subscription.currentPeriodEnd ||
            null,

          expiresAt:
            subscription.expiresAt ||
            null

        })
      );

  }

  catch (error) {

    logger.error(
      `Entitlement lookup failed: ${error?.message || error}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to determine subscription entitlement",

          error:
            error?.message ||
            "Unknown entitlement error"

        })
      );

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

  usageController,

  entitlementController,

  normalizePlan,

  normalizeBillingCycle,

  normalizeProvider,

  normalizeCurrency,

  resolveBillingPlan,

  getActiveSubscription

};
