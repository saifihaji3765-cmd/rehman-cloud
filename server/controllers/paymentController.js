/* =========================================================
   ZyrionOS PAYMENT CONTROLLER
   =========================================================

   Responsibilities:
   - Create Stripe PaymentIntent
   - Create Razorpay Order
   - Validate authenticated user
   - Validate plan through Billing Agent
   - Never trust client-supplied plan price
   - Verify Razorpay payment signature
   - Never activate subscription directly
   - Subscription activation happens through verified webhook
   - Return real provider data only

   Plans:
   Starter     $19
   Pro         $99
   Business    $199
   Scale       $299
   Enterprise  $499
========================================================= */


/* =========================
   PACKAGES
========================= */

const crypto =
  require("crypto");


/* =========================
   SERVICES
========================= */

const formatResponse =
  require("../utils/formatResponse");

const logger =
  require("../services/loggerService");


/* =========================
   AGENTS
========================= */

const billingAgent =
  require("../agents/billingAgent");


/* =========================
   PAYMENT SERVICES
========================= */

const razorpayService =
  require("../services/razorpayService");

const stripeService =
  require("../services/stripeService");


/* =========================================================
   HELPERS
========================================================= */


/* =========================
   AUTH USER
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
   NORMALIZE PROVIDER
========================= */

function normalizeProvider(
  provider
) {

  if (!provider) {
    return null;
  }

  const value =
    String(provider)
      .trim()
      .toLowerCase();

  if (
    value === "stripe" ||
    value === "razorpay"
  ) {

    return value;

  }

  return null;

}


/* =========================
   NORMALIZE PLAN
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
   BILLING PLAN
========================= */

async function resolvePlan({
  userId,
  plan,
  billingCycle
}) {

  const billing =
    await billingAgent({

      userId,

      plan,

      billingCycle:
        billingCycle === "yearly"
          ? "yearly"
          : "monthly"

    });


  if (
    !billing ||
    billing.success !== true
  ) {

    const error =
      new Error(
        billing?.error ||
        billing?.message ||
        "Unable to validate billing plan"
      );

    error.code =
      "BILLING_PLAN_INVALID";

    throw error;

  }


  const selectedPlan =
    billing
      ?.billing
      ?.selectedPlan;


  if (!selectedPlan) {

    const error =
      new Error(
        "Billing agent returned no selected plan"
      );

    error.code =
      "PLAN_DATA_MISSING";

    throw error;

  }


  return {

    billing,

    plan:
      selectedPlan

  };

}


/* =========================
   SAFE AMOUNT
========================= */

function getAmountInMinorUnits(
  amount
) {

  const numeric =
    Number(amount);


  if (
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {

    throw new Error(
      "Invalid payment amount"
    );

  }


  return Math.round(
    numeric * 100
  );

}


/* =========================================================
   CREATE PAYMENT
========================================================= */

async function createPaymentController(
  req,
  res
) {

  try {

    logger.info(
      "Payment creation started"
    );


    /* =========================
       USER
    ========================= */

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


    /* =========================
       REQUEST
    ========================= */

    const {
      plan,
      provider,
      billingCycle = "monthly",
      currency
    } =
      req.body || {};


    /* =========================
       VALIDATION
    ========================= */

    const normalizedPlan =
      normalizePlan(plan);

    const normalizedProvider =
      normalizeProvider(provider);


    if (!normalizedPlan) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Valid plan is required",

            allowedPlans: [
              "Starter",
              "Pro",
              "Business",
              "Scale",
              "Enterprise"
            ]

          })
        );

    }


    if (!normalizedProvider) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Valid payment provider is required",

            allowedProviders: [
              "stripe",
              "razorpay"
            ]

          })
        );

    }


    const normalizedCycle =
      billingCycle === "yearly"
        ? "yearly"
        : "monthly";


    /* =====================================================
       BILLING AGENT
       =====================================================

       IMPORTANT:
       Client does NOT control the final price.
    */

    const {
      billing,
      plan: selectedPlan
    } =
      await resolvePlan({

        userId,

        plan:
          normalizedPlan,

        billingCycle:
          normalizedCycle

      });


    const amount =
      Number(
        billing
          ?.billing
          ?.amount
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      return res
        .status(500)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Invalid server-side plan price"

          })
        );

    }


    /* =====================================================
       CURRENCY
    ===================================================== */

    const planCurrency =
      String(
        selectedPlan.currency ||
        "USD"
      ).toUpperCase();


    /*
     * Current ZyrionOS pricing is USD.
     *
     * Stripe receives USD directly.
     *
     * Razorpay orders generally require a supported
     * settlement currency. We do NOT silently convert
     * USD into INR because that would create an
     * unverified exchange-rate/pricing system.
     */

    if (
      normalizedProvider ===
        "razorpay" &&
      planCurrency !== "INR" &&
      String(
        currency ||
        planCurrency
      ).toUpperCase() !== "INR"
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Razorpay requires an INR-priced billing configuration",

            code:
              "RAZORPAY_CURRENCY_UNSUPPORTED",

            planCurrency,

            requestedCurrency:
              String(
                currency ||
                planCurrency
              ).toUpperCase(),

            hint:
              "Use Stripe for the current USD subscription plans, or configure an official INR price mapping before enabling Razorpay for USD plans."

          })
        );

    }


    /* =====================================================
       STRIPE
    ===================================================== */

    if (
      normalizedProvider ===
      "stripe"
    ) {

      if (
        planCurrency !==
        "USD"
      ) {

        return res
          .status(400)
          .json(
            formatResponse({

              success:
                false,

              message:
                "Stripe pricing configuration is not USD"

            })
          );

      }


      const payment =
        await stripeService
          .createPaymentIntent({

            amount,

            currency:
              "USD",

            userId,

            plan:
              normalizedPlan,

            billingCycle:
              normalizedCycle

          });


      if (
        !payment ||
        payment.success !== true
      ) {

        return res
          .status(502)
          .json(
            formatResponse({

              success:
                false,

              provider:
                "stripe",

              message:
                "Stripe payment initialization failed",

              error:
                payment?.error ||
                "Stripe service returned an unsuccessful result"

            })
          );

      }


      logger.success(
        `Stripe payment initialized for ${normalizedPlan}`
      );


      return res.json(
        formatResponse({

          success:
            true,

          provider:
            "stripe",

          data: {

            paymentIntentId:
              payment
                ?.paymentIntent
                ?.id ||
              null,

            clientSecret:
              payment
                ?.paymentIntent
                ?.client_secret ||
              null,

            amount,

            currency:
              "USD",

            plan:
              normalizedPlan,

            billingCycle:
              normalizedCycle

          },

          billing: {

            billingId:
              billing
                ?.billing
                ?.billingId ||
              null,

            amount,

            currency:
              "USD",

            plan:
              normalizedPlan

          },

          subscriptionActivation:
            "pending_webhook"

        })
      );

    }


    /* =====================================================
       RAZORPAY
    ===================================================== */

    if (
      normalizedProvider ===
      "razorpay"
    ) {

      /*
       * Current public plan catalog is USD.
       * Do not invent an INR conversion.
       */

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            provider:
              "razorpay",

            message:
              "Razorpay is not enabled for the current USD plan catalog",

            code:
              "RAZORPAY_USD_PLAN_NOT_CONFIGURED",

            plan:
              normalizedPlan,

            amount,

            currency:
              planCurrency,

            hint:
              "Configure verified INR prices separately before accepting Razorpay payments for these plans."

          })
        );

    }


    return res
      .status(400)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Unsupported payment provider"

        })
      );

  }

  catch (error) {

    const message =
      error?.message ||
      "Payment creation failed";


    logger.error(
      `Payment creation failed: ${message}`
    );


    const status =
      error?.code ===
        "BILLING_PLAN_INVALID"
        ? 400
        : 500;


    return res
      .status(status)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Payment creation failed",

          error:
            message

        })
      );

  }

}


/* =========================================================
   VERIFY RAZORPAY PAYMENT
========================================================= */

async function verifyPaymentController(
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
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } =
      req.body || {};


    /* =========================
       VALIDATION
    ========================= */

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Razorpay payment verification fields are required"

          })
        );

    }


    const secret =
      process.env
        .RAZORPAY_KEY_SECRET ||
      process.env
        .RAZORPAY_SECRET;


    if (!secret) {

      logger.error(
        "Razorpay secret is not configured"
      );

      return res
        .status(500)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Razorpay verification is not configured"

          })
        );

    }


    /* =====================================================
       SIGNATURE
    ===================================================== */

    const generatedSignature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(
          `${razorpay_order_id}|${razorpay_payment_id}`
        )
        .digest("hex");


    /* =====================================================
       TIMING-SAFE COMPARISON
    ===================================================== */

    const expectedBuffer =
      Buffer.from(
        generatedSignature,
        "utf8"
      );

    const receivedBuffer =
      Buffer.from(
        String(
          razorpay_signature
        ),
        "utf8"
      );


    if (
      expectedBuffer.length !==
      receivedBuffer.length ||
      !crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
      )
    ) {

      logger.warning(
        "Razorpay payment signature verification failed"
      );


      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Payment verification failed"

          })
        );

    }


    /*
     * IMPORTANT:
     *
     * Signature verification does NOT mean the
     * subscription is activated here.
     *
     * The authoritative webhook must confirm the
     * payment event and activate the subscription.
     */


    logger.success(
      `Razorpay payment signature verified: ${razorpay_payment_id}`
    );


    return res.json(
      formatResponse({

        success:
          true,

        verified:
          true,

        provider:
          "razorpay",

        paymentId:
          razorpay_payment_id,

        orderId:
          razorpay_order_id,

        subscriptionActivation:
          "pending_webhook",

        message:
          "Payment signature verified. Subscription activation will occur after the verified webhook."

      })
    );

  }

  catch (error) {

    logger.error(
      `Razorpay verification failed: ${error?.message}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Payment verification failed",

          error:
            error?.message ||
            "Unknown verification error"

        })
      );

  }

}


/* =========================================================
   CREATE SUBSCRIPTION
   =========================================================

   Legacy-compatible endpoint.

   It does NOT activate a subscription.

   Payment must happen first and the verified webhook
   is responsible for activation.
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
      plan,
      planName,
      billingCycle = "monthly",
      paymentProvider
    } =
      req.body || {};


    const selectedPlan =
      normalizePlan(
        plan ||
        planName
      );


    if (!selectedPlan) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Valid plan is required"

          })
        );

    }


    /*
     * This endpoint is intentionally not allowed
     * to activate a subscription.
     */

    return res
      .status(409)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Subscription cannot be activated directly",

          code:
            "PAYMENT_REQUIRED",

          plan:
            selectedPlan,

          billingCycle:
            billingCycle ===
            "yearly"
              ? "yearly"
              : "monthly",

          paymentProvider:
            normalizeProvider(
              paymentProvider
            ),

          nextStep:
            "Create and complete payment. The verified provider webhook will activate the subscription."

        })
      );

  }

  catch (error) {

    logger.error(
      `Subscription creation request failed: ${error?.message}`
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
   BILLING HISTORY
========================================================= */

async function billingHistoryController(
  req,
  res
) {

  try {

    const Subscription =
      require(
        "../models/subscriptionModel"
      );


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


    const history =
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
          history

      })
    );

  }

  catch (error) {

    logger.error(
      `Billing history failed: ${error?.message}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to fetch billing history",

          error:
            error?.message ||
            "Unknown error"

        })
      );

  }

}


/* =========================================================
   USER CREDITS
========================================================= */

async function creditsController(
  req,
  res
) {

  try {

    const Subscription =
      require(
        "../models/subscriptionModel"
      );


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


    const subscription =
      await Subscription
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


    if (!subscription) {

      return res.json(
        formatResponse({

          success:
            true,

          credits: {

            total:
              0,

            used:
              0,

            remaining:
              0

          }

        })
      );

    }


    const total =
      Number(
        subscription.aiCreditsLimit ??
        subscription.creditsLimit ??
        0
      );


    const used =
      Number(
        subscription.aiCreditsUsed ??
        0
      );


    const remaining =
      total === -1
        ? -1
        : Math.max(
            0,
            total - used
          );


    return res.json(
      formatResponse({

        success:
          true,

        credits: {

          total,

          used,

          remaining,

          unlimited:
            total === -1

        }

      })
    );

  }

  catch (error) {

    logger.error(
      `Credits lookup failed: ${error?.message}`
    );


    return res
      .status(500)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Failed to fetch credits",

          error:
            error?.message ||
            "Unknown error"

        })
      );

  }

}


/* =========================================================
   WEBHOOK FUNCTIONS
   =========================================================

   Kept as compatibility exports.

   Actual webhook processing should be handled by
   webhookController.js so that provider signature
   verification and subscription activation have one
   authoritative path.
========================================================= */

async function stripeWebhookController(
  req,
  res
) {

  return res
    .status(410)
    .json(
      formatResponse({

        success:
          false,

        message:
          "Stripe webhook endpoint moved to webhookController"

      })
    );

}


async function razorpayWebhookController(
  req,
  res
) {

  return res
    .status(410)
    .json(
      formatResponse({

        success:
          false,

        message:
          "Razorpay webhook endpoint moved to webhookController"

      })
    );

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  createPaymentController,

  verifyPaymentController,

  createSubscriptionController,

  billingHistoryController,

  creditsController,

  stripeWebhookController,

  razorpayWebhookController

};
