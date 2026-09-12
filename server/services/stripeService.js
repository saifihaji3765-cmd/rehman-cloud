const Stripe = require("stripe");
const logger = require("./loggerService");


/* =========================================================
   ZyrionOS STRIPE SERVICE
   =========================================================

   Responsibilities:
   - Stripe configuration
   - Recurring Checkout Sessions
   - PaymentIntent support for legacy integrations
   - Server-side plan validation
   - User / plan / billing metadata
   - Monthly / yearly billing
   - No client-controlled pricing
   - Webhook-compatible metadata

   PUBLIC PRICING

   Starter     $19 / month
   Pro         $99 / month
   Business    $199 / month
   Scale       $299 / month
   Enterprise  $499 / month
========================================================= */


/* =========================================================
   STRIPE CLIENT
========================================================= */

let stripe = null;

if (
  process.env.STRIPE_SECRET_KEY &&
  process.env.STRIPE_SECRET_KEY.trim() !== ""
) {
  stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY.trim()
  );
}


/* =========================================================
   PLAN CATALOG
========================================================= */

const PLANS = Object.freeze({

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
   CONSTANTS
========================================================= */

const SUPPORTED_CURRENCY = "USD";

const STRIPE_API_CURRENCY = "usd";

const DEFAULT_FRONTEND_URL =
  "https://zyrionos.com";


/* =========================================================
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(plan) {

  if (!plan) {
    return null;
  }

  const value =
    String(plan)
      .trim()
      .toLowerCase();

  const map = {

    starter: "Starter",

    pro: "Pro",

    business: "Business",

    scale: "Scale",

    enterprise: "Enterprise"

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
    cycle === ""
  ) {
    return "monthly";
  }

  const value =
    String(cycle)
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
   PLAN PRICE
========================================================= */

function getPlanPrice(
  plan,
  billingCycle
) {

  const normalizedPlan =
    normalizePlan(plan);

  if (!normalizedPlan) {
    return null;
  }

  const cycle =
    normalizeBillingCycle(
      billingCycle
    );

  if (!cycle) {
    return null;
  }

  return (
    PLANS[
      normalizedPlan
    ]?.[cycle] ??
    null
  );
}


/* =========================================================
   AMOUNT VALIDATION
========================================================= */

function validateAmount({
  plan,
  billingCycle,
  amount
} = {}) {

  const expected =
    getPlanPrice(
      plan,
      billingCycle
    );

  if (
    expected ===
    null
  ) {

    return {

      valid:
        false,

      reason:
        "Invalid Stripe plan or billing cycle"

    };

  }

  /*
   * Amount is optional for internal server calls.
   *
   * When supplied, it MUST exactly match the
   * server-side catalog.
   */

  if (
    amount !==
      undefined &&
    amount !==
      null
  ) {

    const received =
      Number(amount);

    if (
      !Number.isFinite(
        received
      )
    ) {

      return {

        valid:
          false,

        reason:
          "Invalid Stripe amount",

        expected,

        received

      };

    }

    if (
      received !==
      expected
    ) {

      return {

        valid:
          false,

        reason:
          "Stripe amount does not match server plan price",

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
   STRIPE CONFIGURATION CHECK
========================================================= */

function ensureStripe() {

  if (!stripe) {

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
    process.env.FRONTEND_URL;

  if (
    configured &&
    configured.trim() !== ""
  ) {

    return configured
      .trim()
      .replace(
        /\/+$/,
        ""
      );

  }

  return DEFAULT_FRONTEND_URL;
}


/* =========================================================
   METADATA BUILDER
========================================================= */

function buildMetadata({
  userId,
  plan,
  billingCycle,
  amount
}) {

  return {

    userId:
      String(userId),

    plan:
      String(plan),

    billingCycle:
      String(billingCycle),

    amount:
      String(amount),

    currency:
      SUPPORTED_CURRENCY,

    platform:
      "ZyrionOS",

    version:
      "3.0.0"

  };
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
  amount
} = {}) {

  try {

    ensureStripe();


    /* -----------------------------------------------------
       PLAN
    ----------------------------------------------------- */

    const selectedPlan =
      normalizePlan(
        planName ||
        plan
      );

    if (!selectedPlan) {

      return {

        success:
          false,

        message:
          "Invalid Stripe plan",

        error:
          "Supported plans: Starter, Pro, Business, Scale, Enterprise"

      };

    }


    /* -----------------------------------------------------
       BILLING CYCLE
    ----------------------------------------------------- */

    const cycle =
      normalizeBillingCycle(
        billingCycle
      );

    if (!cycle) {

      return {

        success:
          false,

        message:
          "Invalid billing cycle",

        error:
          "Supported billing cycles: monthly, yearly"

      };

    }


    /* -----------------------------------------------------
       PRICE
    ----------------------------------------------------- */

    const validation =
      validateAmount({

        plan:
          selectedPlan,

        billingCycle:
          cycle,

        amount

      });

    if (
      !validation.valid
    ) {

      return {

        success:
          false,

        message:
          validation.reason,

        expected:
          validation.expected,

        received:
          validation.received

      };

    }


    /* -----------------------------------------------------
       USER
    ----------------------------------------------------- */

    if (!userId) {

      return {

        success:
          false,

        message:
          "User ID required"

      };

    }


    /* -----------------------------------------------------
       CURRENCY
    ----------------------------------------------------- */

    const unitAmount =
      Math.round(
        validation.amount *
        100
      );


    /* -----------------------------------------------------
       STRIPE INTERVAL
    ----------------------------------------------------- */

    const interval =
      cycle ===
      "yearly"
        ? "year"
        : "month";


    /* -----------------------------------------------------
       METADATA
    ----------------------------------------------------- */

    const metadata =
      buildMetadata({

        userId,

        plan:
          selectedPlan,

        billingCycle:
          cycle,

        amount:
          validation.amount

      });


    /* -----------------------------------------------------
       CHECKOUT SESSION
    ----------------------------------------------------- */

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
                `ZyrionOS ${selectedPlan}`,

              metadata: {

                plan:
                  selectedPlan,

                platform:
                  "ZyrionOS"

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

      /*
       * Session metadata.
       */
      metadata,

      /*
       * Subscription metadata.
       *
       * This is critical because recurring invoice
       * webhooks need user/plan information.
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


    /* -----------------------------------------------------
       CUSTOMER EMAIL
    ----------------------------------------------------- */

    if (
      customerEmail &&
      String(customerEmail).trim()
    ) {

      sessionParams.customer_email =
        String(
          customerEmail
        ).trim();

    }


    /* -----------------------------------------------------
       CREATE SESSION
    ----------------------------------------------------- */

    const session =
      await stripe
        .checkout
        .sessions
        .create(
          sessionParams
        );


    logger.success(
      `Stripe Checkout Session created: ${session.id} (${selectedPlan}/${cycle})`
    );


    return {

      success:
        true,

      provider:
        "stripe",

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

      plan:
        selectedPlan,

      billingCycle:
        cycle,

      amount:
        validation.amount,

      currency:
        SUPPORTED_CURRENCY

    };

  } catch (error) {

    logger.error(
      `Stripe Checkout creation failed: ${error?.message}`
    );

    return {

      success:
        false,

      message:
        "Stripe Checkout creation failed",

      error:
        error?.message ||
        "Unknown Stripe error",

      code:
        error?.code ||
        null

    };
  }
}


/* =========================================================
   CREATE PAYMENT INTENT
=========================================================

   This method is retained for compatibility with existing
   integrations.

   IMPORTANT:

   PaymentIntent != recurring subscription.

   For ZyrionOS recurring subscriptions, the preferred
   production flow is:

   createCheckoutSession()
       ↓
   Stripe Checkout
       ↓
   Stripe webhook
       ↓
   Subscription activation

========================================================= */

async function createPaymentIntent({
  amount,
  currency = "USD",
  userId,
  plan,
  billingCycle = "monthly"
} = {}) {

  try {

    ensureStripe();


    /* -----------------------------------------------------
       USER
    ----------------------------------------------------- */

    if (!userId) {

      return {

        success:
          false,

        message:
          "User ID required"

      };

    }


    /* -----------------------------------------------------
       PLAN
    ----------------------------------------------------- */

    const selectedPlan =
      normalizePlan(
        plan
      );

    if (!selectedPlan) {

      return {

        success:
          false,

        message:
          "Invalid Stripe plan"

      };

    }


    /* -----------------------------------------------------
       BILLING CYCLE
    ----------------------------------------------------- */

    const cycle =
      normalizeBillingCycle(
        billingCycle
      );

    if (!cycle) {

      return {

        success:
          false,

        message:
          "Invalid billing cycle"

      };

    }


    /* -----------------------------------------------------
       CURRENCY
    ----------------------------------------------------- */

    const normalizedCurrency =
      String(
        currency
      )
        .trim()
        .toUpperCase();

    if (
      normalizedCurrency !==
      SUPPORTED_CURRENCY
    ) {

      return {

        success:
          false,

        message:
          "ZyrionOS Stripe catalog currently uses USD"

      };

    }


    /* -----------------------------------------------------
       PRICE
    ----------------------------------------------------- */

    const validation =
      validateAmount({

        plan:
          selectedPlan,

        billingCycle:
          cycle,

        amount

      });

    if (
      !validation.valid
    ) {

      return {

        success:
          false,

        message:
          validation.reason,

        expected:
          validation.expected,

        received:
          validation.received

      };

    }


    /* -----------------------------------------------------
       METADATA
    ----------------------------------------------------- */

    const metadata =
      buildMetadata({

        userId,

        plan:
          selectedPlan,

        billingCycle:
          cycle,

        amount:
          validation.amount

      });


    /* -----------------------------------------------------
       PAYMENT INTENT
    ----------------------------------------------------- */

    const paymentIntent =
      await stripe
        .paymentIntents
        .create({

          amount:
            Math.round(
              validation.amount *
              100
            ),

          currency:
            STRIPE_API_CURRENCY,

          automatic_payment_methods: {

            enabled:
              true

          },

          metadata

        });


    logger.success(
      `Stripe PaymentIntent created: ${paymentIntent.id}`
    );


    return {

      success:
        true,

      provider:
        "stripe",

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

      plan:
        selectedPlan,

      billingCycle:
        cycle

    };

  } catch (error) {

    logger.error(
      `Stripe PaymentIntent creation failed: ${error?.message}`
    );

    return {

      success:
        false,

      message:
        "Stripe PaymentIntent creation failed",

      error:
        error?.message ||
        "Unknown Stripe error",

      code:
        error?.code ||
        null

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

    if (!sessionId) {

      return {

        success:
          false,

        message:
          "Stripe session ID required"

      };

    }


    const session =
      await stripe
        .checkout
        .sessions
        .retrieve(
          sessionId
        );


    return {

      success:
        true,

      provider:
        "stripe",

      session

    };

  } catch (error) {

    logger.error(
      `Stripe session retrieval failed: ${error?.message}`
    );

    return {

      success:
        false,

      message:
        "Unable to retrieve Stripe session",

      error:
        error?.message ||
        "Unknown Stripe error",

      code:
        error?.code ||
        null

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

    if (!subscriptionId) {

      return {

        success:
          false,

        message:
          "Stripe subscription ID required"

      };

    }


    const subscription =
      await stripe
        .subscriptions
        .retrieve(
          subscriptionId
        );


    return {

      success:
        true,

      provider:
        "stripe",

      subscription

    };

  } catch (error) {

    logger.error(
      `Stripe subscription retrieval failed: ${error?.message}`
    );

    return {

      success:
        false,

      message:
        "Unable to retrieve Stripe subscription",

      error:
        error?.message ||
        "Unknown Stripe error",

      code:
        error?.code ||
        null

    };
  }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  createCheckoutSession,

  createPaymentIntent,

  retrieveCheckoutSession,

  retrieveSubscription,

  getPlanPrice,

  normalizePlan,

  normalizeBillingCycle

};
