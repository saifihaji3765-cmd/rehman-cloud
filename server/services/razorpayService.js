/* =========================================================
   ZyrionOS RAZORPAY SERVICE
   =========================================================

   Responsibilities:
   - Razorpay client configuration
   - Real order creation
   - Server-side plan validation
   - Plan metadata / notes
   - Receipt generation
   - Order retrieval
   - Payment retrieval
   - No client-controlled pricing
   - No fake currency conversion

   IMPORTANT:

   ZyrionOS public catalog is currently USD.

   Razorpay order creation is therefore intentionally
   blocked until an officially configured Razorpay
   currency catalog exists.

   NEVER convert USD -> INR using an invented exchange rate.
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
        keyId.trim(),

      key_secret:
        keySecret.trim()

    });

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

const PUBLIC_CATALOG_CURRENCY =
  "USD";

const SUPPORTED_RAZORPAY_CURRENCIES =
  new Set([
    "USD"
  ]);


/* =========================================================
   PLAN NORMALIZATION
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


/* =========================================================
   BILLING CYCLE NORMALIZATION
========================================================= */

function normalizeCycle(
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
   CURRENCY VALIDATION
========================================================= */

function validateCurrency(
  currency
) {

  const normalized =
    String(
      currency ||
      PUBLIC_CATALOG_CURRENCY
    )
      .trim()
      .toUpperCase();

  if (
    !SUPPORTED_RAZORPAY_CURRENCIES.has(
      normalized
    )
  ) {

    return {

      valid:
        false,

      currency:
        normalized,

      reason:
        "Unsupported Razorpay currency"

    };

  }

  /*
   * The current catalog is USD.
   *
   * There is deliberately NO USD -> INR conversion.
   */

  if (
    normalized !==
    PUBLIC_CATALOG_CURRENCY
  ) {

    return {

      valid:
        false,

      currency:
        normalized,

      reason:
        "Razorpay currency does not match the configured ZyrionOS catalog"

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
        "Invalid Razorpay plan or billing cycle"

    };

  }

  /*
   * Amount is optional for trusted internal calls.
   *
   * If supplied, it must exactly equal the server
   * catalog price.
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
          "Invalid Razorpay amount",

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
          "Razorpay amount does not match server plan price",

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
   RECEIPT GENERATION
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
    Date.now().toString();

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
  currency = PUBLIC_CATALOG_CURRENCY,
  receipt,
  userId,
  plan,
  billingCycle = "monthly",
  notes = {}
} = {}) {

  try {

    ensureRazorpay();


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
          "Invalid Razorpay plan",

        error:
          "Supported plans: Starter, Pro, Business, Scale, Enterprise"

      };

    }


    /* -----------------------------------------------------
       BILLING CYCLE
    ----------------------------------------------------- */

    const cycle =
      normalizeCycle(
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
       CURRENCY
    ----------------------------------------------------- */

    const currencyValidation =
      validateCurrency(
        currency
      );

    if (
      !currencyValidation.valid
    ) {

      return {

        success:
          false,

        message:
          currencyValidation.reason,

        currency:
          currencyValidation.currency,

        code:
          "RAZORPAY_CURRENCY_NOT_CONFIGURED"

      };

    }


    /* -----------------------------------------------------
       PLAN PRICE
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
       PROVIDER AMOUNT
    ----------------------------------------------------- */

    const providerAmount =
      Math.round(
        validation.amount *
        100
      );


    if (
      !Number.isSafeInteger(
        providerAmount
      ) ||
      providerAmount <= 0
    ) {

      return {

        success:
          false,

        message:
          "Invalid provider payment amount"

      };

    }


    /* -----------------------------------------------------
       RECEIPT
    ----------------------------------------------------- */

    const receiptId =
      receipt
        ? String(receipt)
            .trim()
            .slice(0, 40)
        : createReceipt(
            userId
          );


    /* -----------------------------------------------------
       MANDATORY PROVIDER NOTES
    ----------------------------------------------------- */

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
        currencyValidation.currency,

      platform:
        "ZyrionOS",

      version:
        "3.0.0"

    };


    /* -----------------------------------------------------
       OPTIONAL NOTES
    ----------------------------------------------------- */

    if (
      notes &&
      typeof notes ===
        "object" &&
      !Array.isArray(notes)
    ) {

      const protectedKeys =
        new Set([

          "userId",

          "plan",

          "billingCycle",

          "amount",

          "currency",

          "platform",

          "version"

        ]);


      for (
        const [key, value]
        of Object.entries(
          notes
        )
      ) {

        if (
          protectedKeys.has(
            key
          )
        ) {

          continue;

        }


        if (
          value ===
            undefined ||
          value ===
            null
        ) {

          continue;

        }


        const stringValue =
          String(value);


        if (
          stringValue.length <=
          255
        ) {

          orderNotes[key] =
            stringValue;

        }

      }

    }


    /* -----------------------------------------------------
       CREATE REAL RAZORPAY ORDER
    ----------------------------------------------------- */

    const order =
      await razorpay
        .orders
        .create({

          amount:
            providerAmount,

          currency:
            currencyValidation.currency,

          receipt:
            receiptId,

          notes:
            orderNotes

        });


    logger.success(
      `Razorpay order created: ${order.id} (${selectedPlan}/${cycle})`
    );


    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

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
        validation.amount,

      currency:
        currencyValidation.currency

    };

  } catch (error) {

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
   FETCH ORDER
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
          String(
            orderId
          ).trim()
        );


    return {

      success:
        true,

      provider:
        "razorpay",

      order

    };

  } catch (error) {

    logger.error(
      `Razorpay order retrieval failed: ${error?.message}`
    );

    return {

      success:
        false,

      message:
        "Unable to retrieve Razorpay order",

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
   FETCH PAYMENT
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
          String(
            paymentId
          ).trim()
        );


    return {

      success:
        true,

      provider:
        "razorpay",

      payment

    };

  } catch (error) {

    logger.error(
      `Razorpay payment retrieval failed: ${error?.message}`
    );

    return {

      success:
        false,

      message:
        "Unable to retrieve Razorpay payment",

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
   EXPORTS
========================================================= */

module.exports = {

  createOrder,

  fetchOrder,

  fetchPayment,

  getPlanPrice,

  normalizePlan,

  normalizeCycle

};
