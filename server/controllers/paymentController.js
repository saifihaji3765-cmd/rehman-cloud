/* =========================================================
   ZyrionOS PAYMENT CONTROLLER v2.0.0

   Responsibilities:
   - Stripe PaymentIntent creation
   - Razorpay Order creation
   - Authenticated user validation
   - Billing Agent authoritative plan validation
   - Client price protection
   - Provider normalization
   - Billing-cycle normalization
   - Razorpay payment signature verification
   - No direct subscription activation
   - Webhook remains authoritative for activation
   - Billing history
   - Credit lookup
   - Stripe + Razorpay compatibility

   IMPORTANT:
   - Never trust client supplied amount.
   - Never activate subscription from payment creation.
   - Never activate subscription from Razorpay signature verification.
   - Provider webhooks are authoritative for final payment state.
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const crypto =
  require("crypto");


/* =========================================================
   SERVICES
========================================================= */

const formatResponse =
  require("../utils/formatResponse");

const logger =
  require("../services/loggerService");


/* =========================================================
   AGENTS
========================================================= */

const billingAgent =
  require("../agents/billingAgent");


/* =========================================================
   PAYMENT SERVICES
========================================================= */

const razorpayService =
  require("../services/razorpayService");

const stripeService =
  require("../services/stripeService");


/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_PLANS = [
  "Starter",
  "Pro",
  "Business",
  "Scale",
  "Enterprise"
];


const ALLOWED_PROVIDERS = [
  "stripe",
  "razorpay"
];


const ALLOWED_BILLING_CYCLES = [
  "monthly",
  "yearly"
];


/* =========================================================
   AUTH USER
========================================================= */

function getUserId(req) {

  const value =
    req?.user?.id ||
    req?.user?._id ||
    req?.user?.userId ||
    null;


  if (!value) {
    return null;
  }


  return String(value).trim();

}


/* =========================================================
   NORMALIZE PROVIDER
========================================================= */

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
    ALLOWED_PROVIDERS.includes(
      value
    )
  ) {

    return value;

  }


  return null;

}


/* =========================================================
   NORMALIZE PLAN
========================================================= */

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


/* =========================================================
   NORMALIZE BILLING CYCLE
========================================================= */

function normalizeBillingCycle(
  billingCycle
) {

  const value =
    String(
      billingCycle ||
      "monthly"
    )
      .trim()
      .toLowerCase();


  return value === "yearly"
    ? "yearly"
    : "monthly";

}


/* =========================================================
   NORMALIZE CURRENCY
========================================================= */

function normalizeCurrency(
  currency
) {

  if (!currency) {
    return null;
  }


  const value =
    String(currency)
      .trim()
      .toUpperCase();


  if (
    !/^[A-Z]{3}$/.test(
      value
    )
  ) {

    return null;

  }


  return value;

}


/* =========================================================
   BILLING PLAN RESOLUTION
========================================================= */

async function resolvePlan({
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


  if (
    !selectedPlan
  ) {

    const error =
      new Error(
        "Billing agent returned no selected plan"
      );


    error.code =
      "PLAN_DATA_MISSING";


    throw error;

  }


  const billingData =
    billing?.billing ||
    {};


  const amount =
    Number(
      billingData.amount ??
      selectedPlan.amount
    );


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    const error =
      new Error(
        "Billing Agent returned an invalid plan amount"
      );


    error.code =
      "INVALID_SERVER_PLAN_PRICE";


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

    plan:
      selectedPlan,

    amount,

    currency

  };

}


/* =========================================================
   MONEY
========================================================= */

function toMinorUnits(
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
   SAFE PROVIDER ERROR
========================================================= */

function providerError(
  provider,
  error,
  fallbackMessage
) {

  const message =
    error?.message ||
    fallbackMessage;


  const result =
    new Error(
      message
    );


  result.code =
    error?.code ||
    `${provider.toUpperCase()}_PAYMENT_FAILED`;


  result.provider =
    provider;


  return result;

}


/* =========================================================
   STRIPE PAYMENT CREATION
========================================================= */

async function createStripePayment({
  amount,
  currency,
  userId,
  plan,
  billingCycle,
  billingData
}) {

  if (
    currency !==
    "USD"
  ) {

    const error =
      new Error(
        "Stripe payment requires a configured USD plan"
      );


    error.code =
      "STRIPE_CURRENCY_UNSUPPORTED";


    throw error;

  }


  if (
    !stripeService ||
    typeof stripeService.createPaymentIntent !==
      "function"
  ) {

    const error =
      new Error(
        "Stripe payment service is not configured correctly"
      );


    error.code =
      "STRIPE_SERVICE_UNAVAILABLE";


    throw error;

  }


  const payment =
    await stripeService
      .createPaymentIntent({

        amount,

        currency:
          "USD",

        userId,

        plan,

        billingCycle,

        billingId:
          billingData?.billingId ||
          null

      });


  if (
    !payment ||
    payment.success !== true
  ) {

    throw providerError(
      "stripe",
      payment,
      "Stripe payment initialization failed"
    );

  }


  const paymentIntent =
    payment.paymentIntent ||
    {};


  if (
    !paymentIntent.id
  ) {

    const error =
      new Error(
        "Stripe service returned no PaymentIntent ID"
      );


    error.code =
      "STRIPE_PAYMENT_ID_MISSING";


    throw error;

  }


  return {

    provider:
      "stripe",

    paymentIntentId:
      paymentIntent.id,

    clientSecret:
      paymentIntent.client_secret ||
      null,

    amount,

    currency:
      "USD",

    plan,

    billingCycle

  };

}


/* =========================================================
   RAZORPAY SERVICE ADAPTER
========================================================= */

/*
 * Supports common service contracts without
 * inventing provider data.
 *
 * Preferred:
 *   razorpayService.createOrder(...)
 *
 * Compatibility:
 *   razorpayService.createPayment(...)
 */

async function createRazorpayOrder({
  amount,
  currency,
  userId,
  plan,
  billingCycle,
  billingData
}) {

  if (
    currency !==
    "INR"
  ) {

    const error =
      new Error(
        "Razorpay requires a configured INR plan price"
      );


    error.code =
      "RAZORPAY_CURRENCY_UNSUPPORTED";


    throw error;

  }


  if (
    !razorpayService
  ) {

    const error =
      new Error(
        "Razorpay payment service is not configured"
      );


    error.code =
      "RAZORPAY_SERVICE_UNAVAILABLE";


    throw error;

  }


  const orderPayload = {

    amount:
      toMinorUnits(
        amount
      ),

    currency:
      "INR",

    receipt:
      `zyrionos_${userId}_${Date.now()}`,

    notes: {

      userId:
        String(userId),

      plan:
        String(plan),

      billingCycle:
        String(billingCycle),

      billingId:
        String(
          billingData?.billingId ||
          ""
        )

    }

  };


  let payment;


  if (
    typeof razorpayService.createOrder ===
      "function"
  ) {

    payment =
      await razorpayService
        .createOrder(
          orderPayload
        );

  }

  else if (
    typeof razorpayService.createPayment ===
      "function"
  ) {

    payment =
      await razorpayService
        .createPayment(
          orderPayload
        );

  }

  else {

    const error =
      new Error(
        "Razorpay service does not expose createOrder/createPayment"
      );


    error.code =
      "RAZORPAY_SERVICE_METHOD_MISSING";


    throw error;

  }


  if (
    !payment ||
    payment.success !== true
  ) {

    throw providerError(
      "razorpay",
      payment,
      "Razorpay order creation failed"
    );

  }


  const order =
    payment.order ||
    payment.data?.order ||
    payment.data ||
    {};


  const orderId =
    order.id ||
    payment.orderId ||
    payment.id ||
    null;


  if (
    !orderId
  ) {

    const error =
      new Error(
        "Razorpay service returned no order ID"
      );


    error.code =
      "RAZORPAY_ORDER_ID_MISSING";


    throw error;

  }


  return {

    provider:
      "razorpay",

    orderId,

    amount:
      Number(
        order.amount ??
        orderPayload.amount
      ),

    currency:
      String(
        order.currency ||
        "INR"
      ).toUpperCase(),

    receipt:
      order.receipt ||
      orderPayload.receipt,

    plan,

    billingCycle

  };

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


    if (
      !userId
    ) {

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

    const body =
      req.body ||
      {};


    const normalizedPlan =
      normalizePlan(
        body.plan
      );


    const normalizedProvider =
      normalizeProvider(
        body.provider ||
        body.paymentProvider
      );


    const normalizedCycle =
      normalizeBillingCycle(
        body.billingCycle
      );


    const requestedCurrency =
      normalizeCurrency(
        body.currency
      );


    /* =========================
       PLAN VALIDATION
       ========================= */

    if (
      !normalizedPlan
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Valid plan is required",

            allowedPlans:
              ALLOWED_PLANS

          })
        );

    }


    /* =========================
       PROVIDER VALIDATION
       ========================= */

    if (
      !normalizedProvider
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Valid payment provider is required",

            allowedProviders:
              ALLOWED_PROVIDERS

          })
        );

    }


    /* =========================
       BILLING
       ========================= */

    const {
      billing,
      billingData,
      plan: selectedPlan,
      amount,
      currency
    } =
      await resolvePlan({

        userId,

        plan:
          normalizedPlan,

        billingCycle:
          normalizedCycle

      });


    /*
     * The client supplied currency can only
     * request a currency. It cannot override
     * the Billing Agent's authoritative price.
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

            message:
              "Requested currency does not match the configured plan currency",

            code:
              "PLAN_CURRENCY_MISMATCH",

            planCurrency:
              currency,

            requestedCurrency

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

      let payment;


      try {

        payment =
          await createStripePayment({

            amount,

            currency,

            userId,

            plan:
              normalizedPlan,

            billingCycle:
              normalizedCycle,

            billingData

          });

      }

      catch (error) {

        const status =
          error?.code ===
            "STRIPE_CURRENCY_UNSUPPORTED"
            ? 400
            : 502;


        return res
          .status(status)
          .json(
            formatResponse({

              success:
                false,

              provider:
                "stripe",

              message:
                "Stripe payment initialization failed",

              error:
                error?.message ||
                "Stripe payment initialization failed"

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
              payment.paymentIntentId,

            clientSecret:
              payment.clientSecret,

            amount:
              payment.amount,

            currency:
              payment.currency,

            plan:
              payment.plan,

            billingCycle:
              payment.billingCycle

          },

          billing: {

            billingId:
              billingData?.billingId ||
              null,

            amount,

            currency,

            plan:
              normalizedPlan,

            billingCycle:
              normalizedCycle

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
       * IMPORTANT:
       *
       * We do NOT convert the USD plan price to INR.
       *
       * Billing Agent must expose a verified INR price
       * if Razorpay is to be used.
       */

      if (
        currency !==
        "INR"
      ) {

        return res
          .status(400)
          .json(
            formatResponse({

              success:
                false,

              provider:
                "razorpay",

              message:
                "Razorpay requires a separately configured INR plan price",

              code:
                "RAZORPAY_INR_PRICE_REQUIRED",

              plan:
                normalizedPlan,

              configuredCurrency:
                currency,

              amount,

              hint:
                "Add an authoritative INR price to the Billing Agent plan configuration. Do not use an automatic USD-to-INR conversion."

            })
          );

      }


      let payment;


      try {

        payment =
          await createRazorpayOrder({

            amount,

            currency,

            userId,

            plan:
              normalizedPlan,

            billingCycle:
              normalizedCycle,

            billingData

          });

      }

      catch (error) {

        logger.error(
          `Razorpay order creation failed: ${error?.message}`
        );


        const status =
          error?.code ===
            "RAZORPAY_CURRENCY_UNSUPPORTED"
            ? 400
            : 502;


        return res
          .status(status)
          .json(
            formatResponse({

              success:
                false,

              provider:
                "razorpay",

              message:
                "Razorpay order creation failed",

              error:
                error?.message ||
                "Razorpay order creation failed"

            })
          );

      }


      logger.success(
        `Razorpay order created for ${normalizedPlan}: ${payment.orderId}`
      );


      return res.json(
        formatResponse({

          success:
            true,

          provider:
            "razorpay",

          data: {

            orderId:
              payment.orderId,

            amount:
              payment.amount,

            currency:
              payment.currency,

            receipt:
              payment.receipt,

            plan:
              payment.plan,

            billingCycle:
              payment.billingCycle

          },

          billing: {

            billingId:
              billingData?.billingId ||
              null,

            amount,

            currency:
              "INR",

            plan:
              normalizedPlan,

            billingCycle:
              normalizedCycle

          },

          subscriptionActivation:
            "pending_webhook"

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

    logger.error(
      `Payment creation failed: ${error?.message}`
    );


    let status =
      500;


    if (
      error?.code ===
        "BILLING_PLAN_INVALID" ||
      error?.code ===
        "PLAN_DATA_MISSING" ||
      error?.code ===
        "INVALID_SERVER_PLAN_PRICE" ||
      error?.code ===
        "INVALID_PLAN_CURRENCY"
    ) {

      status =
        400;

    }


    return res
      .status(status)
      .json(
        formatResponse({

          success:
            false,

          message:
            "Payment creation failed",

          error:
            error?.message ||
            "Unknown payment error",

          code:
            error?.code ||
            "PAYMENT_CREATION_FAILED"

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


    if (
      !userId
    ) {

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


    const body =
      req.body ||
      {};


    const razorpayOrderId =
      String(
        body.razorpay_order_id ||
        ""
      ).trim();


    const razorpayPaymentId =
      String(
        body.razorpay_payment_id ||
        ""
      ).trim();


    const razorpaySignature =
      String(
        body.razorpay_signature ||
        ""
      ).trim();


    if (
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature
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


    /* =====================================================
       SECRET
    ===================================================== */

    const secret =
      process.env.RAZORPAY_KEY_SECRET ||
      process.env.RAZORPAY_SECRET;


    if (
      !secret
    ) {

      logger.error(
        "Razorpay verification secret is not configured"
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

    const payload =
      `${razorpayOrderId}|${razorpayPaymentId}`;


    const generatedSignature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(
          payload,
          "utf8"
        )
        .digest("hex");


    const expectedBuffer =
      Buffer.from(
        generatedSignature,
        "utf8"
      );


    const receivedBuffer =
      Buffer.from(
        razorpaySignature,
        "utf8"
      );


    const signatureValid =
      expectedBuffer.length ===
        receivedBuffer.length &&
      crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
      );


    if (
      !signatureValid
    ) {

      logger.warning(
        `Razorpay signature verification failed for user ${userId}`
      );


      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            verified:
              false,

            message:
              "Payment verification failed"

          })
        );

    }


    /*
     * CRITICAL:
     *
     * A valid client-side payment signature does NOT
     * activate the subscription.
     *
     * The webhook remains authoritative.
     */

    logger.success(
      `Razorpay payment signature verified: ${razorpayPaymentId}`
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
          razorpayPaymentId,

        orderId:
          razorpayOrderId,

        subscriptionActivation:
          "pending_webhook",

        message:
          "Payment signature verified. Subscription activation remains pending until the verified Razorpay webhook is processed."

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
========================================================= */

/*
 * Compatibility endpoint.
 *
 * It intentionally DOES NOT activate a subscription.
 *
 * Payment creation + provider webhook are the
 * authoritative activation path.
 */

async function createSubscriptionController(
  req,
  res
) {

  try {

    const userId =
      getUserId(req);


    if (
      !userId
    ) {

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


    const body =
      req.body ||
      {};


    const selectedPlan =
      normalizePlan(
        body.plan ||
        body.planName
      );


    const billingCycle =
      normalizeBillingCycle(
        body.billingCycle
      );


    const paymentProvider =
      normalizeProvider(
        body.paymentProvider ||
        body.provider
      );


    if (
      !selectedPlan
    ) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            message:
              "Valid plan is required",

            allowedPlans:
              ALLOWED_PLANS

          })
        );

    }


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

          billingCycle,

          paymentProvider,

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


    if (
      !userId
    ) {

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


    if (
      !userId
    ) {

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


    if (
      !subscription
    ) {

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
              0,

            unlimited:
              false

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


    const unlimited =
      total === -1;


    const remaining =
      unlimited
        ? -1
        : Math.max(
            0,
            total -
            used
          );


    return res.json(
      formatResponse({

        success:
          true,

        credits: {

          total,

          used,

          remaining,

          unlimited

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
   WEBHOOK COMPATIBILITY EXPORTS
========================================================= */

/*
 * Actual webhook processing must live in the dedicated
 * webhook controller/service layer.
 *
 * These functions remain exported so existing routes
 * do not immediately crash while the webhook layer is
 * being migrated.
 */

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
          "Stripe webhook endpoint moved to the dedicated webhook controller",

        code:
          "WEBHOOK_ENDPOINT_MOVED"

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
          "Razorpay webhook endpoint moved to the dedicated webhook controller",

        code:
          "WEBHOOK_ENDPOINT_MOVED"

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

  razorpayWebhookController,

  normalizeProvider,

  normalizePlan,

  normalizeBillingCycle,

  normalizeCurrency,

  resolvePlan

};
