/* =========================================================
   ZyrionOS STRIPE SERVICE v4.0.0
   =========================================================

   Responsibilities:
   - Stripe client configuration
   - Recurring Checkout Sessions
   - PaymentIntent support for legacy integrations
   - Billing Agent plan resolution
   - Server-side amount validation
   - Currency validation
   - User / plan / billing metadata
   - Monthly / yearly billing
   - Checkout Session retrieval
   - Subscription retrieval
   - PaymentIntent retrieval
   - No client-controlled pricing
   - No invented currency conversion
   - No subscription activation

   ARCHITECTURE:

   Controller
       ↓
   Stripe Service
       ↓
   Billing Agent
       ↓
   Stripe API

   Subscription activation:

   Stripe
       ↓
   Verified Webhook
       ↓
   Webhook Controller
       ↓
   Subscription state

   IMPORTANT:
   ---------------------------------------------------------
   Billing Agent is authoritative for:

   - plan
   - amount
   - currency
   - billing cycle
   - entitlements

   Stripe Service NEVER activates subscriptions.
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const Stripe =
  require("stripe");

const logger =
  require("./loggerService");

const billingAgent =
  require("../agents/billingAgent");


/* =========================================================
   STRIPE CLIENT
========================================================= */

let stripe = null;


const stripeSecretKey =
  String(
    process.env.STRIPE_SECRET_KEY ||
    ""
  ).trim();


if (
  stripeSecretKey
) {

  stripe =
    new Stripe(
      stripeSecretKey
    );

}


/* =========================================================
   CONSTANTS
========================================================= */

const PROVIDER =
  "stripe";


const DEFAULT_CURRENCY =
  "USD";


const STRIPE_API_CURRENCY =
  "usd";


const DEFAULT_FRONTEND_URL =
  "https://zyrionos.com";


const SERVICE_VERSION =
  "4.0.0";


const PLATFORM_NAME =
  "ZyrionOS";


/* =========================================================
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(
  plan
) {

  if (
    plan ===
      null ||
    plan ===
      undefined
  ) {

    return null;

  }


  const value =
    String(
      plan
    )
      .trim()
      .toLowerCase();


  const map = {

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
    map[value] ||
    null
  );

}


/* =========================================================
   BILLING CYCLE NORMALIZATION
========================================================= */

function normalizeBillingCycle(
  cycle
) {

  if (
    cycle ===
      undefined ||
    cycle ===
      null ||
    cycle ===
      ""
  ) {

    return "monthly";

  }


  const value =
    String(
      cycle
    )
      .trim()
      .toLowerCase();


  if (
    value ===
    "monthly"
  ) {

    return "monthly";

  }


  if (
    value ===
    "yearly"
  ) {

    return "yearly";

  }


  return null;

}


/* =========================================================
   CURRENCY NORMALIZATION
========================================================= */

function normalizeCurrency(
  currency
) {

  if (
    currency ===
      null ||
    currency ===
      undefined
  ) {

    return null;

  }


  const normalized =
    String(
      currency
    )
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
   USER ID NORMALIZATION
========================================================= */

function normalizeUserId(
  userId
) {

  if (
    userId ===
      null ||
    userId ===
      undefined
  ) {

    return null;

  }


  if (
    typeof userId ===
    "string"
  ) {

    return (
      userId.trim() ||
      null
    );

  }


  if (
    typeof userId ===
    "number"
  ) {

    return String(
      userId
    );

  }


  if (
    typeof userId ===
      "object" &&
    typeof userId.toString ===
      "function"
  ) {

    const value =
      userId.toString();


    if (
      value &&
      value !==
        "[object Object]"
    ) {

      return value;

    }

  }


  return null;

}


/* =========================================================
   ENSURE STRIPE
========================================================= */

function ensureStripe() {

  if (
    !stripe
  ) {

    const error =
      new Error(
        "STRIPE_SECRET_KEY is not configured"
      );


    error.code =
      "STRIPE_NOT_CONFIGURED";


    throw error;

  }

}


/* =========================================================
   FRONTEND URL
========================================================= */

function getFrontendUrl() {

  const configured =
    String(
      process.env.FRONTEND_URL ||
      ""
    ).trim();


  if (
    configured
  ) {

    return configured.replace(
      /\/+$/,
      ""
    );

  }


  return DEFAULT_FRONTEND_URL;

}


/* =========================================================
   BILLING AGENT PLAN RESOLUTION
========================================================= */

async function resolveBillingPlan({
  userId,
  plan,
  billingCycle
} = {}) {

  const normalizedUserId =
    normalizeUserId(
      userId
    );


  const normalizedPlan =
    normalizePlan(
      plan
    );


  const normalizedCycle =
    normalizeBillingCycle(
      billingCycle
    );


  if (
    !normalizedUserId
  ) {

    const error =
      new Error(
        "User ID is required"
      );


    error.code =
      "USER_ID_REQUIRED";


    throw error;

  }


  if (
    !normalizedPlan
  ) {

    const error =
      new Error(
        "Invalid Stripe plan"
      );


    error.code =
      "INVALID_PLAN";


    throw error;

  }


  if (
    !normalizedCycle
  ) {

    const error =
      new Error(
        "Invalid billing cycle"
      );


    error.code =
      "INVALID_BILLING_CYCLE";


    throw error;

  }


  if (
    !billingAgent ||
    typeof billingAgent !==
      "function"
  ) {

    const error =
      new Error(
        "Billing Agent is unavailable"
      );


    error.code =
      "BILLING_AGENT_UNAVAILABLE";


    throw error;

  }


  /*
   * Billing Agent is authoritative.
   */

  const result =
    await billingAgent({

      userId:
        normalizedUserId,

      plan:
        normalizedPlan,

      billingCycle:
        normalizedCycle,

      paymentProvider:
        PROVIDER

    });


  if (
    !result ||
    result.success !==
      true
  ) {

    const error =
      new Error(

        result?.error ||
        result?.message ||
        "Billing Agent failed to resolve Stripe plan"

      );


    error.code =
      "BILLING_PLAN_RESOLUTION_FAILED";


    throw error;

  }


  const billing =
    result.billing ||
    {};


  const selectedPlan =
    billing.selectedPlan;


  if (
    !selectedPlan
  ) {

    const error =
      new Error(
        "Billing Agent returned no selected plan"
      );


    error.code =
      "BILLING_PLAN_MISSING";


    throw error;

  }


  const resolvedPlan =
    normalizePlan(

      selectedPlan.name ||
      selectedPlan.planName ||
      normalizedPlan

    );


  if (
    resolvedPlan !==
    normalizedPlan
  ) {

    const error =
      new Error(
        "Billing Agent plan mismatch"
      );


    error.code =
      "BILLING_PLAN_MISMATCH";


    throw error;

  }


  const amount =
    Number(

      billing.amount ??
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
        "Billing Agent returned an invalid amount"
      );


    error.code =
      "INVALID_BILLING_AMOUNT";


    throw error;

  }


  const currency =
    normalizeCurrency(

      selectedPlan.currency ||
      billing.currency ||
      DEFAULT_CURRENCY

    );


  if (
    !currency
  ) {

    const error =
      new Error(
        "Billing Agent returned an invalid currency"
      );


    error.code =
      "INVALID_BILLING_CURRENCY";


    throw error;

  }


  return {

    billing,

    selectedPlan,

    plan:
      normalizedPlan,

    billingCycle:
      normalizedCycle,

    amount,

    currency

  };

}


/* =========================================================
   CURRENCY VALIDATION
========================================================= */

function validateCurrency(
  currency
) {

  const normalized =
    normalizeCurrency(
      currency
    );


  if (
    !normalized
  ) {

    return {

      valid:
        false,

      currency:
        null,

      reason:
        "Invalid currency"

    };

  }


  /*
   * Current Stripe catalog is configured for USD.
   *
   * No automatic FX conversion.
   */

  if (
    normalized !==
    DEFAULT_CURRENCY
  ) {

    return {

      valid:
        false,

      currency:
        normalized,

      reason:
        "ZyrionOS Stripe catalog currently uses USD"

    };

  }


  return {

    valid:
      true,

    currency:
      normalized

  };

}


/* =========================================================
   AMOUNT VALIDATION
========================================================= */

function validateAmount({
  expectedAmount,
  receivedAmount
} = {}) {

  const expected =
    Number(
      expectedAmount
    );


  if (
    !Number.isFinite(
      expected
    ) ||
    expected <= 0
  ) {

    return {

      valid:
        false,

      reason:
        "Invalid server billing amount"

    };

  }


  /*
   * Client supplied amount is never authoritative.
   * It is only a consistency check.
   */

  if (
    receivedAmount !==
      undefined &&
    receivedAmount !==
      null
  ) {

    const received =
      Number(
        receivedAmount
      );


    if (
      !Number.isFinite(
        received
      )
    ) {

      return {

        valid:
          false,

        reason:
          "Invalid supplied amount",

        expected,

        received

      };

    }


    const expectedMinor =
      Math.round(
        expected *
        100
      );


    const receivedMinor =
      Math.round(
        received *
        100
      );


    if (
      expectedMinor !==
      receivedMinor
    ) {

      return {

        valid:
          false,

        reason:
          "Supplied amount does not match Billing Agent amount",

        expected,

        received

      };

    }

  }


  return {

    valid:
      true,

    amount:
      expected

  };

}


/* =========================================================
   PROVIDER AMOUNT
========================================================= */

function toStripeAmount(
  amount
) {

  const numeric =
    Number(
      amount
    );


  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric <= 0
  ) {

    const error =
      new Error(
        "Invalid Stripe payment amount"
      );


    error.code =
      "INVALID_STRIPE_AMOUNT";


    throw error;

  }


  const minor =
    Math.round(
      numeric *
      100
    );


  if (
    !Number.isSafeInteger(
      minor
    ) ||
    minor <= 0
  ) {

    const error =
      new Error(
        "Stripe payment amount exceeds safe limits"
      );


    error.code =
      "UNSAFE_STRIPE_AMOUNT";


    throw error;

  }


  return minor;

}


/* =========================================================
   METADATA BUILDER
========================================================= */

function buildMetadata({
  userId,
  plan,
  billingCycle,
  amount,
  currency,
  billingId
} = {}) {

  const metadata = {

    userId:
      String(
        userId
      ),

    plan:
      String(
        plan
      ),

    billingCycle:
      String(
        billingCycle
      ),

    amount:
      String(
        amount
      ),

    currency:
      String(
        currency
      ),

    platform:
      PLATFORM_NAME,

    version:
      SERVICE_VERSION

  };


  if (
    billingId
  ) {

    metadata.billingId =
      String(
        billingId
      );

  }


  return metadata;

}


/* =========================================================
   CUSTOMER EMAIL
========================================================= */

function normalizeEmail(
  email
) {

  if (
    email ===
      null ||
    email ===
      undefined
  ) {

    return null;

  }


  const value =
    String(
      email
    ).trim();


  if (
    !value
  ) {

    return null;

  }


  /*
   * Basic validation only.
   * Stripe performs final validation.
   */

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
    )
  ) {

    return null;

  }


  return value;

}


/* =========================================================
   CREATE RECURRING CHECKOUT SESSION
========================================================= */

async function createCheckoutSession({
  planName,
  plan,
  userId,
  customerEmail,
  billingCycle = "monthly",
  amount,
  billingId
} = {}) {

  try {

    ensureStripe();


    const normalizedUserId =
      normalizeUserId(
        userId
      );


    if (
      !normalizedUserId
    ) {

      return {

        success:
          false,

        code:
          "USER_ID_REQUIRED",

        message:
          "User ID required"

      };

    }


    /*
     * Resolve authoritative plan.
     */

    const billing =
      await resolveBillingPlan({

        userId:
          normalizedUserId,

        plan:
          planName ||
          plan,

        billingCycle

      });


    /*
     * Currency comes from Billing Agent.
     */

    const currencyValidation =
      validateCurrency(
        billing.currency
      );


    if (
      !currencyValidation.valid
    ) {

      return {

        success:
          false,

        code:
          "STRIPE_CURRENCY_NOT_CONFIGURED",

        message:
          currencyValidation.reason,

        currency:
          currencyValidation.currency

      };

    }


    /*
     * Optional caller amount is only a check.
     */

    const amountValidation =
      validateAmount({

        expectedAmount:
          billing.amount,

        receivedAmount:
          amount

      });


    if (
      !amountValidation.valid
    ) {

      return {

        success:
          false,

        code:
          "AMOUNT_VALIDATION_FAILED",

        message:
          amountValidation.reason,

        expected:
          amountValidation.expected,

        received:
          amountValidation.received

      };

    }


    const unitAmount =
      toStripeAmount(
        billing.amount
      );


    const interval =
      billing.billingCycle ===
      "yearly"

        ? "year"

        : "month";


    const metadata =
      buildMetadata({

        userId:
          normalizedUserId,

        plan:
          billing.plan,

        billingCycle:
          billing.billingCycle,

        amount:
          billing.amount,

        currency:
          billing.currency,

        billingId

      });


    /*
     * Recurring Checkout.
     */

    const sessionParams = {

      mode:
        "subscription",

      line_items: [

        {

          price_data: {

            currency:
              STRIPE_API_CURRENCY,

            product_data: {

              name:
                `ZyrionOS ${billing.plan}`,

              metadata: {

                plan:
                  billing.plan,

                platform:
                  PLATFORM_NAME

              }

            },

            unit_amount:
              unitAmount,

            recurring: {

              interval

            }

          },

          quantity:
            1

        }

      ],

      metadata,

      /*
       * Critical:
       * Copy metadata onto the Stripe Subscription so
       * subscription/invoice lifecycle events retain the
       * user and plan context.
       */

      subscription_data: {

        metadata

      },

      success_url:
        `${getFrontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:
        `${getFrontendUrl()}/cancel`,

      allow_promotion_codes:
        true

    };


    const normalizedEmail =
      normalizeEmail(
        customerEmail
      );


    if (
      normalizedEmail
    ) {

      sessionParams.customer_email =
        normalizedEmail;

    }


    const session =
      await stripe
        .checkout
        .sessions
        .create(
          sessionParams
        );


    if (
      !session ||
      !session.id
    ) {

      const error =
        new Error(
          "Stripe returned an invalid Checkout Session"
        );


      error.code =
        "INVALID_STRIPE_SESSION_RESPONSE";


      throw error;

    }


    logger.success(

      `Stripe Checkout Session created: ${session.id} (${billing.plan}/${billing.billingCycle})`

    );


    return {

      success:
        true,

      provider:
        PROVIDER,

      session: {

        id:
          session.id,

        url:
          session.url,

        mode:
          session.mode,

        status:
          session.status,

        paymentStatus:
          session.payment_status

      },

      billing: {

        plan:
          billing.plan,

        billingCycle:
          billing.billingCycle,

        amount:
          billing.amount,

        currency:
          billing.currency,

        billingId:
          billingId ||
          billing.billing?.billingId ||
          null

      }

    };

  }

  catch (error) {

    logger.error(

      `Stripe Checkout creation failed: ${error?.message || error}`

    );


    return {

      success:
        false,

      code:
        error?.code ||
        "STRIPE_CHECKOUT_CREATION_FAILED",

      message:
        "Stripe Checkout creation failed",

      error:
        error?.message ||
        "Unknown Stripe error"

    };

  }

}


/* =========================================================
   CREATE PAYMENT INTENT
=========================================================

   Compatibility method.

   IMPORTANT:

   PaymentIntent is NOT treated as a recurring subscription.

   Preferred recurring flow:

   createCheckoutSession()
       ↓
   Stripe Checkout
       ↓
   Verified webhook
       ↓
   Subscription activation

========================================================= */

async function createPaymentIntent({
  amount,
  currency = DEFAULT_CURRENCY,
  userId,
  plan,
  billingCycle = "monthly",
  billingId
} = {}) {

  try {

    ensureStripe();


    const normalizedUserId =
      normalizeUserId(
        userId
      );


    if (
      !normalizedUserId
    ) {

      return {

        success:
          false,

        code:
          "USER_ID_REQUIRED",

        message:
          "User ID required"

      };

    }


    const billing =
      await resolveBillingPlan({

        userId:
          normalizedUserId,

        plan,

        billingCycle

      });


    const currencyValidation =
      validateCurrency(
        billing.currency
      );


    if (
      !currencyValidation.valid
    ) {

      return {

        success:
          false,

        code:
          "STRIPE_CURRENCY_NOT_CONFIGURED",

        message:
          currencyValidation.reason,

        currency:
          currencyValidation.currency

      };

    }


    /*
     * The method argument is only a consistency check.
     */

    if (
      currency !==
        undefined &&
      currency !==
        null
    ) {

      const requestedCurrency =
        normalizeCurrency(
          currency
        );


      if (
        requestedCurrency !==
        billing.currency
      ) {

        return {

          success:
            false,

          code:
            "CURRENCY_MISMATCH",

          message:
            "Requested currency does not match Billing Agent currency",

          expected:
            billing.currency,

          received:
            requestedCurrency

        };

      }

    }


    const validation =
      validateAmount({

        expectedAmount:
          billing.amount,

        receivedAmount:
          amount

      });


    if (
      !validation.valid
    ) {

      return {

        success:
          false,

        code:
          "AMOUNT_VALIDATION_FAILED",

        message:
          validation.reason,

        expected:
          validation.expected,

        received:
          validation.received

      };

    }


    const metadata =
      buildMetadata({

        userId:
          normalizedUserId,

        plan:
          billing.plan,

        billingCycle:
          billing.billingCycle,

        amount:
          billing.amount,

        currency:
          billing.currency,

        billingId

      });


    const paymentIntent =
      await stripe
        .paymentIntents
        .create({

          amount:
            toStripeAmount(
              billing.amount
            ),

          currency:
            STRIPE_API_CURRENCY,

          automatic_payment_methods: {

            enabled:
              true

          },

          metadata

        });


    if (
      !paymentIntent ||
      !paymentIntent.id
    ) {

      const error =
        new Error(
          "Stripe returned an invalid PaymentIntent"
        );


      error.code =
        "INVALID_STRIPE_PAYMENT_INTENT_RESPONSE";


      throw error;

    }


    logger.success(

      `Stripe PaymentIntent created: ${paymentIntent.id}`

    );


    return {

      success:
        true,

      provider:
        PROVIDER,

      paymentIntent: {

        id:
          paymentIntent.id,

        client_secret:
          paymentIntent.client_secret,

        status:
          paymentIntent.status,

        amount:
          paymentIntent.amount,

        currency:
          paymentIntent.currency

      },

      billing: {

        plan:
          billing.plan,

        billingCycle:
          billing.billingCycle,

        amount:
          billing.amount,

        currency:
          billing.currency,

        billingId:
          billingId ||
          billing.billing?.billingId ||
          null

      }

    };

  }

  catch (error) {

    logger.error(

      `Stripe PaymentIntent creation failed: ${error?.message || error}`

    );


    return {

      success:
        false,

      code:
        error?.code ||
        "STRIPE_PAYMENT_INTENT_CREATION_FAILED",

      message:
        "Stripe PaymentIntent creation failed",

      error:
        error?.message ||
        "Unknown Stripe error"

    };

  }

}


/* =========================================================
   RETRIEVE CHECKOUT SESSION
========================================================= */

async function retrieveCheckoutSession(
  sessionId
) {

  try {

    ensureStripe();


    const normalizedId =
      String(
        sessionId ||
        ""
      ).trim();


    if (
      !normalizedId
    ) {

      return {

        success:
          false,

        code:
          "SESSION_ID_REQUIRED",

        message:
          "Stripe session ID required"

      };

    }


    const session =
      await stripe
        .checkout
        .sessions
        .retrieve(
          normalizedId
        );


    if (
      !session
    ) {

      return {

        success:
          false,

        code:
          "SESSION_NOT_FOUND",

        message:
          "Stripe Checkout Session not found"

      };

    }


    return {

      success:
        true,

      provider:
        PROVIDER,

      session

    };

  }

  catch (error) {

    logger.error(

      `Stripe session retrieval failed: ${error?.message || error}`

    );


    return {

      success:
        false,

      code:
        error?.code ||
        "STRIPE_SESSION_RETRIEVAL_FAILED",

      message:
        "Unable to retrieve Stripe session",

      error:
        error?.message ||
        "Unknown Stripe error"

    };

  }

}


/* =========================================================
   RETRIEVE STRIPE SUBSCRIPTION
========================================================= */

async function retrieveSubscription(
  subscriptionId
) {

  try {

    ensureStripe();


    const normalizedId =
      String(
        subscriptionId ||
        ""
      ).trim();


    if (
      !normalizedId
    ) {

      return {

        success:
          false,

        code:
          "SUBSCRIPTION_ID_REQUIRED",

        message:
          "Stripe subscription ID required"

      };

    }


    const subscription =
      await stripe
        .subscriptions
        .retrieve(
          normalizedId
        );


    if (
      !subscription
    ) {

      return {

        success:
          false,

        code:
          "SUBSCRIPTION_NOT_FOUND",

        message:
          "Stripe subscription not found"

      };

    }


    return {

      success:
        true,

      provider:
        PROVIDER,

      subscription

    };

  }

  catch (error) {

    logger.error(

      `Stripe subscription retrieval failed: ${error?.message || error}`

    );


    return {

      success:
        false,

      code:
        error?.code ||
        "STRIPE_SUBSCRIPTION_RETRIEVAL_FAILED",

      message:
        "Unable to retrieve Stripe subscription",

      error:
        error?.message ||
        "Unknown Stripe error"

    };

  }

}


/* =========================================================
   RETRIEVE PAYMENT INTENT
========================================================= */

async function retrievePaymentIntent(
  paymentIntentId
) {

  try {

    ensureStripe();


    const normalizedId =
      String(
        paymentIntentId ||
        ""
      ).trim();


    if (
      !normalizedId
    ) {

      return {

        success:
          false,

        code:
          "PAYMENT_INTENT_ID_REQUIRED",

        message:
          "Stripe PaymentIntent ID required"

      };

    }


    const paymentIntent =
      await stripe
        .paymentIntents
        .retrieve(
          normalizedId
        );


    if (
      !paymentIntent
    ) {

      return {

        success:
          false,

        code:
          "PAYMENT_INTENT_NOT_FOUND",

        message:
          "Stripe PaymentIntent not found"

      };

    }


    return {

      success:
        true,

      provider:
        PROVIDER,

      paymentIntent

    };

  }

  catch (error) {

    logger.error(

      `Stripe PaymentIntent retrieval failed: ${error?.message || error}`

    );


    return {

      success:
        false,

      code:
        error?.code ||
        "STRIPE_PAYMENT_INTENT_RETRIEVAL_FAILED",

      message:
        "Unable to retrieve Stripe PaymentIntent",

      error:
        error?.message ||
        "Unknown Stripe error"

    };

  }

}


/* =========================================================
   GET CONFIGURATION STATUS
========================================================= */

function getConfigurationStatus() {

  return {

    configured:
      Boolean(
        stripe
      ),

    provider:
      PROVIDER,

    secretConfigured:
      Boolean(
        stripeSecretKey
      ),

    catalogCurrency:
      DEFAULT_CURRENCY,

    stripeCurrency:
      STRIPE_API_CURRENCY,

    frontendUrl:
      getFrontendUrl()

  };

}


/* =========================================================
   HEALTH CHECK
========================================================= */

async function healthCheck() {

  const configuration =
    getConfigurationStatus();


  if (
    !configuration.configured
  ) {

    return {

      success:
        false,

      healthy:
        false,

      code:
        "STRIPE_NOT_CONFIGURED",

      configuration

    };

  }


  return {

    success:
      true,

    healthy:
      true,

    provider:
      PROVIDER,

    configuration

  };

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  createCheckoutSession,

  createPaymentIntent,

  retrieveCheckoutSession,

  retrieveSubscription,

  retrievePaymentIntent,

  getPlanPrice: async function getPlanPrice(
    plan,
    billingCycle,
    userId
  ) {

    /*
     * Kept for compatibility.
     *
     * New code should use resolveBillingPlan().
     */

    if (
      userId
    ) {

      const billing =
        await resolveBillingPlan({

          userId,

          plan,

          billingCycle

        });


      return billing.amount;

    }


    /*
     * Without userId, Billing Agent cannot be consulted
     * safely. Return null instead of maintaining another
     * price catalog here.
     */

    return null;

  },

  normalizePlan,

  normalizeBillingCycle,

  normalizeCurrency,

  resolveBillingPlan,

  validateCurrency,

  validateAmount,

  toStripeAmount,

  getConfigurationStatus,

  healthCheck

};
