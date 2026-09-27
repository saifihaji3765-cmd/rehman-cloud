/* =========================================================
   ZyrionOS RAZORPAY SERVICE v4.0.0
   =========================================================

   Responsibilities:
   - Razorpay client configuration
   - Server-side order creation
   - Billing Agent plan resolution
   - Server-side amount validation
   - Currency validation
   - Order metadata / notes
   - Receipt generation
   - Order retrieval
   - Payment retrieval
   - Payment signature verification
   - No client-controlled pricing
   - No invented currency conversion
   - No subscription activation
   - No entitlement mutation

   ARCHITECTURE:

   Controller
       ↓
   Razorpay Service
       ↓
   Billing Agent
       ↓
   Razorpay API

   IMPORTANT:
   ---------------------------------------------------------
   Billing Agent is the source of truth for:

   - plan
   - amount
   - currency
   - billing cycle
   - entitlements

   Razorpay Service NEVER trusts a client supplied price.

   Razorpay Service also NEVER activates a subscription.
   Subscription activation belongs to the verified webhook flow.
========================================================= */

const crypto =
  require("crypto");

const Razorpay =
  require("razorpay");

const logger =
  require("./loggerService");

const billingAgent =
  require("../agents/billingAgent");


/* =========================================================
   RAZORPAY CLIENT
========================================================= */

let razorpay = null;


const keyId =
  String(
    process.env.RAZORPAY_KEY_ID ||
    ""
  ).trim();


const keySecret =
  String(
    process.env.RAZORPAY_KEY_SECRET ||
    ""
  ).trim();


if (
  keyId &&
  keySecret
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
   CONSTANTS
========================================================= */

const PROVIDER =
  "razorpay";


const DEFAULT_CURRENCY =
  "USD";


const PLATFORM_NAME =
  "ZyrionOS";


const SERVICE_VERSION =
  "4.0.0";


const MAX_RECEIPT_LENGTH =
  40;


const MAX_NOTE_LENGTH =
  255;


/* =========================================================
   SUPPORTED CURRENCY CONFIGURATION
========================================================= */

/*
 * Razorpay account capabilities can differ.
 *
 * Configure explicitly:
 *
 * RAZORPAY_SUPPORTED_CURRENCIES=USD
 *
 * or, if the merchant account is approved/configured:
 *
 * RAZORPAY_SUPPORTED_CURRENCIES=USD,EUR,GBP
 *
 * No automatic conversion is performed here.
 */

function getConfiguredCurrencies() {

  const raw =
    String(
      process.env
        .RAZORPAY_SUPPORTED_CURRENCIES ||
      DEFAULT_CURRENCY
    ).trim();


  const currencies =
    raw
      .split(",")
      .map(
        (value) =>
          value
            .trim()
            .toUpperCase()
      )
      .filter(
        (value) =>
          /^[A-Z]{3}$/.test(
            value
          )
      );


  if (
    currencies.length ===
    0
  ) {

    return new Set([
      DEFAULT_CURRENCY
    ]);

  }


  return new Set(
    currencies
  );

}


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

    const value =
      userId.trim();


    return value ||
      null;

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
   ENSURE RAZORPAY
========================================================= */

function ensureRazorpay() {

  if (
    !razorpay
  ) {

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
    normalizeCycle(
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
        "Invalid Razorpay plan"
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
        "Billing Agent failed to resolve Razorpay plan"

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


  const supported =
    getConfiguredCurrencies();


  if (
    !supported.has(
      normalized
    )
  ) {

    return {

      valid:
        false,

      currency:
        normalized,

      reason:
        "Currency is not enabled in the ZyrionOS Razorpay configuration",

      supportedCurrencies:
        Array.from(
          supported
        )

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
   * If the caller supplies an amount, it is only treated
   * as a consistency check.
   *
   * It is NEVER authoritative.
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
   PROVIDER MINOR UNIT AMOUNT
========================================================= */

function toProviderAmount(
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
        "Invalid payment amount"
      );


    error.code =
      "INVALID_PROVIDER_AMOUNT";


    throw error;

  }


  /*
   * Razorpay Orders API uses the smallest currency unit.
   */

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
        "Payment amount exceeds safe provider limits"
      );


    error.code =
      "UNSAFE_PROVIDER_AMOUNT";


    throw error;

  }


  return minor;

}


/* =========================================================
   RECEIPT SANITIZATION
========================================================= */

function sanitizeReceipt(
  receipt
) {

  if (
    receipt ===
      null ||
    receipt ===
      undefined ||
    receipt ===
      ""
  ) {

    return null;

  }


  const value =
    String(
      receipt
    )
      .trim()
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      )
      .slice(
        0,
        MAX_RECEIPT_LENGTH
      );


  return value ||
    null;

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
        18
      );


  const timestamp =
    Date.now()
      .toString();


  const random =
    crypto
      .randomBytes(
        4
      )
      .toString(
        "hex"
      );


  return (

    `zyrionos_${safeUser}_${timestamp}_${random}`

  ).slice(
    0,
    MAX_RECEIPT_LENGTH
  );

}


/* =========================================================
   NOTE VALUE
========================================================= */

function normalizeNoteValue(
  value
) {

  if (
    value ===
      null ||
    value ===
      undefined
  ) {

    return null;

  }


  const result =
    String(
      value
    );


  if (
    !result
  ) {

    return null;

  }


  return result.slice(
    0,
    MAX_NOTE_LENGTH
  );

}


/* =========================================================
   BUILD ORDER NOTES
========================================================= */

function buildOrderNotes({
  userId,
  plan,
  billingCycle,
  amount,
  currency,
  billingId,
  notes
} = {}) {

  const orderNotes = {

    userId:
      String(
        userId
      ),

    plan:
      plan,

    billingCycle:
      billingCycle,

    amount:
      String(
        amount
      ),

    currency:
      currency,

    platform:
      PLATFORM_NAME,

    version:
      SERVICE_VERSION

  };


  if (
    billingId
  ) {

    orderNotes.billingId =
      normalizeNoteValue(
        billingId
      );

  }


  /*
   * Optional notes cannot overwrite authoritative
   * provider metadata.
   */

  if (
    notes &&
    typeof notes ===
      "object" &&
    !Array.isArray(
      notes
    )
  ) {

    const protectedKeys =
      new Set([

        "userId",

        "plan",

        "billingCycle",

        "amount",

        "currency",

        "platform",

        "version",

        "billingId"

      ]);


    for (
      const [
        key,
        value
      ]
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
        !/^[a-zA-Z0-9_.-]{1,50}$/.test(
          key
        )
      ) {

        continue;

      }


      const normalized =
        normalizeNoteValue(
          value
        );


      if (
        normalized !==
        null
      ) {

        orderNotes[key] =
          normalized;

      }

    }

  }


  return orderNotes;

}


/* =========================================================
   CREATE ORDER
========================================================= */

async function createOrder({
  amount,
  currency,
  receipt,
  userId,
  plan,
  billingCycle = "monthly",
  billingId = null,
  notes = {}
} = {}) {

  try {

    ensureRazorpay();


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
     * Resolve the authoritative billing state.
     */

    const billing =
      await resolveBillingPlan({

        userId:
          normalizedUserId,

        plan,

        billingCycle

      });


    /*
     * Billing Agent currency is authoritative.
     */

    const configuredCurrency =
      billing.currency;


    /*
     * If the caller supplied currency, it must match.
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
        configuredCurrency
      ) {

        return {

          success:
            false,

          code:
            "CURRENCY_MISMATCH",

          message:
            "Requested currency does not match the Billing Agent currency",

          expected:
            configuredCurrency,

          received:
            requestedCurrency

        };

      }

    }


    /*
     * Verify Razorpay is configured to handle the currency.
     */

    const currencyValidation =
      validateCurrency(
        configuredCurrency
      );


    if (
      !currencyValidation.valid
    ) {

      return {

        success:
          false,

        code:
          "RAZORPAY_CURRENCY_NOT_CONFIGURED",

        message:
          currencyValidation.reason,

        currency:
          currencyValidation.currency,

        supportedCurrencies:
          currencyValidation.supportedCurrencies ||
          []

      };

    }


    /*
     * Client amount is only a consistency check.
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


    const providerAmount =
      toProviderAmount(
        billing.amount
      );


    /*
     * Receipt.
     */

    const receiptId =
      sanitizeReceipt(
        receipt
      ) ||
      createReceipt(
        normalizedUserId
      );


    /*
     * Notes.
     */

    const orderNotes =
      buildOrderNotes({

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

        billingId,

        notes

      });


    /*
     * REAL RAZORPAY ORDER
     */

    const order =
      await razorpay.orders.create({

        amount:
          providerAmount,

        currency:
          billing.currency,

        receipt:
          receiptId,

        notes:
          orderNotes

      });


    if (
      !order ||
      !order.id
    ) {

      const error =
        new Error(
          "Razorpay returned an invalid order"
        );


      error.code =
        "INVALID_RAZORPAY_ORDER_RESPONSE";


      throw error;

    }


    logger.success(
      `Razorpay order created: ${order.id} (${billing.plan}/${billing.billingCycle})`
    );


    return {

      success:
        true,

      provider:
        PROVIDER,

      order: {

        id:
          order.id,

        entity:
          order.entity ||
          "order",

        amount:
          Number(
            order.amount ??
            providerAmount
          ),

        amountPaid:
          Number(
            order.amount_paid ??
            0
          ),

        amountDue:
          Number(
            order.amount_due ??
            providerAmount
          ),

        currency:
          order.currency ||
          billing.currency,

        receipt:
          order.receipt ||
          receiptId,

        status:
          order.status ||
          "created",

        createdAt:
          order.created_at ||
          null

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
      `Razorpay order creation failed: ${error?.message || error}`
    );


    return {

      success:
        false,

      code:
        error?.code ||
        "RAZORPAY_ORDER_CREATION_FAILED",

      message:
        "Razorpay order creation failed",

      error:
        error?.message ||
        "Unknown Razorpay error"

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


    const normalizedOrderId =
      String(
        orderId ||
        ""
      ).trim();


    if (
      !normalizedOrderId
    ) {

      return {

        success:
          false,

        code:
          "ORDER_ID_REQUIRED",

        message:
          "Razorpay order ID required"

      };

    }


    const order =
      await razorpay.orders.fetch(
        normalizedOrderId
      );


    if (
      !order
    ) {

      return {

        success:
          false,

        code:
          "ORDER_NOT_FOUND",

        message:
          "Razorpay order not found"

      };

    }


    return {

      success:
        true,

      provider:
        PROVIDER,

      order

    };

  }

  catch (error) {

    logger.error(
      `Razorpay order retrieval failed: ${error?.message || error}`
    );


    return {

      success:
        false,

      code:
        error?.code ||
        "RAZORPAY_ORDER_FETCH_FAILED",

      message:
        "Unable to retrieve Razorpay order",

      error:
        error?.message ||
        "Unknown Razorpay error"

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


    const normalizedPaymentId =
      String(
        paymentId ||
        ""
      ).trim();


    if (
      !normalizedPaymentId
    ) {

      return {

        success:
          false,

        code:
          "PAYMENT_ID_REQUIRED",

        message:
          "Razorpay payment ID required"

      };

    }


    const payment =
      await razorpay.payments.fetch(
        normalizedPaymentId
      );


    if (
      !payment
    ) {

      return {

        success:
          false,

        code:
          "PAYMENT_NOT_FOUND",

        message:
          "Razorpay payment not found"

      };

    }


    return {

      success:
        true,

      provider:
        PROVIDER,

      payment

    };

  }

  catch (error) {

    logger.error(
      `Razorpay payment retrieval failed: ${error?.message || error}`
    );


    return {

      success:
        false,

      code:
        error?.code ||
        "RAZORPAY_PAYMENT_FETCH_FAILED",

      message:
        "Unable to retrieve Razorpay payment",

      error:
        error?.message ||
        "Unknown Razorpay error"

    };

  }

}


/* =========================================================
   VERIFY PAYMENT SIGNATURE
========================================================= */

/*
 * Used for client-side payment verification when required.
 *
 * IMPORTANT:
 * This does NOT activate a subscription.
 *
 * Final subscription activation still belongs to the
 * verified Razorpay webhook.
 */

function verifyPaymentSignature({
  orderId,
  paymentId,
  signature
} = {}) {

  if (
    !keySecret
  ) {

    return {

      valid:
        false,

      code:
        "RAZORPAY_SECRET_NOT_CONFIGURED",

      message:
        "Razorpay secret is not configured"

    };

  }


  const normalizedOrderId =
    String(
      orderId ||
      ""
    ).trim();


  const normalizedPaymentId =
    String(
      paymentId ||
      ""
    ).trim();


  const normalizedSignature =
    String(
      signature ||
      ""
    ).trim();


  if (
    !normalizedOrderId ||
    !normalizedPaymentId ||
    !normalizedSignature
  ) {

    return {

      valid:
        false,

      code:
        "PAYMENT_SIGNATURE_DATA_MISSING",

      message:
        "Razorpay payment verification data is incomplete"

    };

  }


  const payload =
    `${normalizedOrderId}|${normalizedPaymentId}`;


  const expected =
    crypto
      .createHmac(
        "sha256",
        keySecret
      )
      .update(
        payload
      )
      .digest(
        "hex"
      );


  const expectedBuffer =
    Buffer.from(
      expected,
      "utf8"
    );


  const receivedBuffer =
    Buffer.from(
      normalizedSignature,
      "utf8"
    );


  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {

    return {

      valid:
        false,

      code:
        "INVALID_PAYMENT_SIGNATURE",

      message:
        "Invalid Razorpay payment signature"

    };

  }


  const valid =
    crypto.timingSafeEqual(
      expectedBuffer,
      receivedBuffer
    );


  return {

    valid,

    code:
      valid
        ? null
        : "INVALID_PAYMENT_SIGNATURE",

    message:
      valid
        ? null
        : "Invalid Razorpay payment signature"

  };

}


/* =========================================================
   GET CONFIGURATION STATUS
========================================================= */

function getConfigurationStatus() {

  const supportedCurrencies =
    Array.from(
      getConfiguredCurrencies()
    );


  return {

    configured:
      Boolean(
        razorpay
      ),

    provider:
      PROVIDER,

    keyConfigured:
      Boolean(
        keyId
      ),

    secretConfigured:
      Boolean(
        keySecret
      ),

    supportedCurrencies

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
        "RAZORPAY_NOT_CONFIGURED",

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

  createOrder,

  fetchOrder,

  fetchPayment,

  verifyPaymentSignature,

  getConfigurationStatus,

  healthCheck,

  resolveBillingPlan,

  validateCurrency,

  validateAmount,

  toProviderAmount,

  createReceipt,

  normalizePlan,

  normalizeCycle,

  normalizeCurrency

};
