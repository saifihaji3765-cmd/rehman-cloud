/* =========================================================
   ZyrionOS RAZORPAY SERVICE
   =========================================================

   Responsibilities:
   - Razorpay client configuration
   - Real order creation
   - Server-side amount validation
   - Plan metadata / notes
   - Receipt generation
   - Order retrieval
   - Payment retrieval
   - No client-controlled pricing

   IMPORTANT:
   ZyrionOS public plan catalog is USD.

   Razorpay must NOT receive a fake USD -> INR
   conversion.

   This service supports an explicitly supplied
   currency/amount, but the payment controller must
   only enable a currency that is officially configured
   for the selected plan.
========================================================= */

const Razorpay =
  require("razorpay");

const logger =
  require("./loggerService");


/* =========================================================
   RAZORPAY CLIENT
========================================================= */

let razorpay = null;


const keyId =
  process.env.RAZORPAY_KEY_ID;

const keySecret =
  process.env.RAZORPAY_KEY_SECRET;


if (
  keyId &&
  keySecret &&
  keyId.trim() !== "" &&
  keySecret.trim() !== ""
) {

  razorpay =
    new Razorpay({

      key_id:
        keyId,

      key_secret:
        keySecret

    });

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


function normalizeCycle(
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
    normalizeCycle(
      billingCycle
    );


  return (
    PLANS[
      normalizedPlan
    ]?.[cycle] ??
    null
  );

}


/* =========================================================
   RAZORPAY CONFIG CHECK
========================================================= */

function ensureRazorpay() {

  if (!razorpay) {

    const error =
      new Error(
        "Razorpay credentials are not configured"
      );

    error.code =
      "RAZORPAY_NOT_CONFIGURED";

    throw error;

  }

}


/* =========================================================
   AMOUNT VALIDATION
========================================================= */

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
        "Invalid Razorpay plan"

    };

  }


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
        "Razorpay amount does not match server plan price",

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
   RECEIPT
========================================================= */

function createReceipt(
  userId
) {

  const safeUser =
    String(
      userId ||
      "user"
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(
        0,
        20
      );


  const timestamp =
    Date.now()
      .toString();


  return (
    `zyrionos_${safeUser}_${timestamp}`
  )
    .slice(
      0,
      40
    );

}


/* =========================================================
   CREATE ORDER
========================================================= */

async function createOrder({
  amount,
  currency = "INR",
  receipt,
  userId,
  plan,
  billingCycle = "monthly",
  notes = {}
} = {}) {

  try {

    ensureRazorpay();


    const selectedPlan =
      normalizePlan(
        plan
      );


    if (!selectedPlan) {

      return {

        success:
          false,

        message:
          "Invalid Razorpay plan"

      };

    }


    const cycle =
      normalizeCycle(
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
      )
        .trim()
        .toUpperCase();


    /*
     * Do not silently convert USD pricing into INR.
     *
     * If Razorpay is used for ZyrionOS, the caller must
     * provide a deliberately configured currency mapping.
     *
     * The current public catalog remains USD.
     */

    if (
      normalizedCurrency !==
      "USD" &&
      normalizedCurrency !==
      "INR"
    ) {

      return {

        success:
          false,

        message:
          "Unsupported Razorpay currency",

        currency:
          normalizedCurrency

      };

    }


    /*
     * Current plan price is USD.
     *
     * Do not pretend INR amount is equal to USD amount.
     *
     * Until an official INR catalog exists, USD should
     * not be silently converted.
     */

    if (
      normalizedCurrency ===
      "INR"
    ) {

      return {

        success:
          false,

        message:
          "Razorpay INR pricing is not configured for the current USD plan catalog",

        code:
          "RAZORPAY_INR_PRICE_MAPPING_REQUIRED",

        plan:
          selectedPlan,

        usdPrice:
          validation.amount

      };

    }


    /*
     * If Razorpay account/configuration supports the
     * requested currency, amount is represented in the
     * provider's minor units.
     */

    const providerAmount =
      Math.round(
        validation.amount *
        100
      );


    const receiptId =
      receipt ||
      createReceipt(
        userId
      );


    const orderNotes = {

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
        normalizedCurrency,

      platform:
        "ZyrionOS",

      version:
        "3.0.0"

    };


    /*
     * Add caller-provided notes only after
     * mandatory platform metadata.
     *
     * User notes cannot overwrite security-critical
     * identifiers.
     */

    if (
      notes &&
      typeof notes ===
        "object"
    ) {

      for (
        const [key, value]
        of Object.entries(notes)
      ) {

        if (
          [
            "userId",
            "plan",
            "billingCycle",
            "amount",
            "currency",
            "platform",
            "version"
          ].includes(key)
        ) {
          continue;
        }


        const stringValue =
          String(
            value
          );


        if (
          stringValue.length <=
          255
        ) {

          orderNotes[key] =
            stringValue;

        }

      }

    }


    const order =
      await razorpay
        .orders
        .create({

          amount:
            providerAmount,

          currency:
            normalizedCurrency,

          receipt:
            receiptId,

          notes:
            orderNotes

        });


    logger.success(
      `Razorpay order created for ${selectedPlan}`
    );


    return {

      success:
        true,

      provider:
        "razorpay",

      order: {

        id:
          order.id,

        entity:
          order.entity,

        amount:
          order.amount,

        amountPaid:
          order.amount_paid,

        amountDue:
          order.amount_due,

        currency:
          order.currency,

        receipt:
          order.receipt,

        status:
          order.status,

        createdAt:
          order.created_at

      },

      plan:
        selectedPlan,

      billingCycle:
        cycle,

      catalogAmount:
        validation.amount

    };

  }

  catch (error) {

    logger.error(
      `Razorpay order creation failed: ${error?.message}`
    );


    return {

      success:
        false,

      message:
        "Razorpay order creation failed",

      error:
        error?.message ||
        "Unknown Razorpay error",

      code:
        error?.code ||
        null

    };

  }

}


/* =========================================================
   RETRIEVE ORDER
========================================================= */

async function fetchOrder(
  orderId
) {

  try {

    ensureRazorpay();


    if (!orderId) {

      return {

        success:
          false,

        message:
          "Razorpay order ID required"

      };

    }


    const order =
      await razorpay
        .orders
        .fetch(
          orderId
        );


    return {

      success:
        true,

      provider:
        "razorpay",

      order

    };

  }

  catch (error) {

    logger.error(
      `Razorpay order retrieval failed: ${error?.message}`
    );


    return {

      success:
        false,

      error:
        error?.message ||
        "Unable to retrieve Razorpay order"

    };

  }

}


/* =========================================================
   RETRIEVE PAYMENT
========================================================= */

async function fetchPayment(
  paymentId
) {

  try {

    ensureRazorpay();


    if (!paymentId) {

      return {

        success:
          false,

        message:
          "Razorpay payment ID required"

      };

    }


    const payment =
      await razorpay
        .payments
        .fetch(
          paymentId
        );


    return {

      success:
        true,

      provider:
        "razorpay",

      payment

    };

  }

  catch (error) {

    logger.error(
      `Razorpay payment retrieval failed: ${error?.message}`
    );


    return {

      success:
        false,

      error:
        error?.message ||
        "Unable to retrieve Razorpay payment"

    };

  }

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  createOrder,

  fetchOrder,

  fetchPayment,

  getPlanPrice,

  normalizePlan

};
