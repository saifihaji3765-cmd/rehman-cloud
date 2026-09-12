/* =========================================================
   ZyrionOS STRIPE SERVICE
   =========================================================

   Responsibilities:
   - Stripe configuration
   - Recurring Checkout Session
   - PaymentIntent creation
   - Server-side plan validation
   - User/plan metadata
   - Monthly/yearly billing
   - No client-controlled pricing
   - Webhook-compatible metadata

   PRICING:

   Starter     $19
   Pro         $99
   Business    $199
   Scale       $299
   Enterprise  $499
========================================================= */

const Stripe =
  require("stripe");

const logger =
  require("./loggerService");


/* =========================================================
   STRIPE CLIENT
========================================================= */

let stripe = null;


if (
  process.env.STRIPE_SECRET_KEY &&
  process.env.STRIPE_SECRET_KEY
    .trim() !== ""
) {

  stripe =
    new Stripe(
      process.env.STRIPE_SECRET_KEY
    );

}


/* =========================================================
   PLAN CATALOG
========================================================= */

const PLANS = {

  Starter: {

    monthly:
      19,

    yearly:
      190

  },

  Pro: {

    monthly:
      99,

    yearly:
      990

  },

  Business: {

    monthly:
      199,

    yearly:
      1990

  },

  Scale: {

    monthly:
      299,

    yearly:
      2990

  },

  Enterprise: {

    monthly:
      499,

    yearly:
      4990

  }

};


/* =========================================================
   HELPERS
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


function normalizeBillingCycle(
  cycle
) {

  return cycle ===
    "yearly"

    ? "yearly"

    : "monthly";

}


function getPlanPrice(
  plan,
  billingCycle
) {

  const normalizedPlan =
    normalizePlan(
      plan
    );


  if (!normalizedPlan) {
    return null;
  }


  const cycle =
    normalizeBillingCycle(
      billingCycle
    );


  return (
    PLANS[
      normalizedPlan
    ]?.[cycle] ??
    null
  );

}


function validateAmount({
  plan,
  billingCycle,
  amount
}) {

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
        "Invalid Stripe plan"

    };

  }


  /*
   * Amount is optional for server-side calls.
   *
   * If supplied, it must exactly match
   * the server catalog.
   */

  if (
    amount !==
      undefined &&
    Number(amount) !==
      expected
  ) {

    return {

      valid:
        false,

      reason:
        "Stripe amount does not match server plan price",

      expected,

      received:
        Number(amount)

    };

  }


  return {

    valid:
      true,

    amount:
      expected

  };

}


/* =========================================================
   CONFIG CHECK
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


    const cycle =
      normalizeBillingCycle(
        billingCycle
      );


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


    if (!userId) {

      return {

        success:
          false,

        message:
          "User ID required"

      };

    }


    /*
     * Stripe uses minor currency units.
     */

    const unitAmount =
      Math.round(
        validation.amount *
        100
      );


    const interval =
      cycle ===
        "yearly"

        ? "year"

        : "month";


    const metadata = {

      userId:
        String(userId),

      plan:
        selectedPlan,

      billingCycle:
        cycle,

      amount:
        String(
          validation.amount
        ),

      currency:
        "USD",

      platform:
        "ZyrionOS",

      version:
        "3.0.0"

    };


    const sessionParams = {

      mode:
        "subscription",

      line_items: [

        {

          price_data: {

            currency:
              "usd",

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


      metadata,


      subscription_data: {

        metadata

      },


      success_url:
        `${
          process.env.FRONTEND_URL ||
          "https://zyrionos.com"
        }/success?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:
        `${
          process.env.FRONTEND_URL ||
          "https://zyrionos.com"
        }/cancel`,

      allow_promotion_codes:
        true

    };


    if (
      customerEmail
    ) {

      sessionParams.customer_email =
        String(
          customerEmail
        ).trim();

    }


    const session =
      await stripe
        .checkout
        .sessions
        .create(
          sessionParams
        );


    logger.success(
      `Stripe Checkout Session created for ${selectedPlan}`
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
        "USD"

    };

  }

  catch (error) {

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

   This method is retained because existing controller
   integrations may call createPaymentIntent().

   IMPORTANT:
   PaymentIntent is a payment object, NOT a recurring
   subscription by itself.

   For recurring ZyrionOS plans, use
   createCheckoutSession().
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


    const cycle =
      normalizeBillingCycle(
        billingCycle
      );


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


    if (!userId) {

      return {

        success:
          false,

        message:
          "User ID required"

      };

    }


    const normalizedCurrency =
      String(
        currency
      ).toLowerCase();


    if (
      normalizedCurrency !==
      "usd"
    ) {

      return {

        success:
          false,

        message:
          "ZyrionOS Stripe catalog currently uses USD"

      };

    }


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
            "usd",

          automatic_payment_methods: {

            enabled:
              true

          },

          metadata: {

            userId:
              String(userId),

            plan:
              selectedPlan,

            billingCycle:
              cycle,

            amount:
              String(
                validation.amount
              ),

            currency:
              "USD",

            platform:
              "ZyrionOS"

          }

        });


    logger.success(
      `Stripe PaymentIntent created for ${selectedPlan}`
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

  }

  catch (error) {

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

  }

  catch (error) {

    logger.error(
      `Stripe session retrieval failed: ${error?.message}`
    );


    return {

      success:
        false,

      error:
        error?.message ||
        "Unable to retrieve Stripe session"

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

  }

  catch (error) {

    logger.error(
      `Stripe subscription retrieval failed: ${error?.message}`
    );


    return {

      success:
        false,

      error:
        error?.message ||
        "Unable to retrieve Stripe subscription"

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

  normalizePlan

};
