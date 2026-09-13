"use strict";

const Razorpay = require("razorpay");

function getKeyId() {
  return (
    process.env.RAZORPAY_KEY_ID ||
    ""
  ).trim();
}

function getKeySecret() {
  return (
    process.env.RAZORPAY_KEY_SECRET ||
    ""
  ).trim();
}

function isConfigured() {
  return Boolean(
    getKeyId() && getKeySecret()
  );
}

function getClient() {
  const keyId = getKeyId();
  const keySecret = getKeySecret();

  if (!keyId || !keySecret) {
    const error = new Error(
      "RAZORPAY_CREDENTIALS_NOT_CONFIGURED"
    );

    error.code =
      "RAZORPAY_CREDENTIALS_NOT_CONFIGURED";

    throw error;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

function clean(value, max = 500) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function normalizeError(error) {
  if (!error) {
    return {
      code: "RAZORPAY_UNKNOWN_ERROR",
      message: "Razorpay request failed",
      status: "error",
    };
  }

  const code =
    error.code ||
    error.error?.code ||
    error.statusCode ||
    "RAZORPAY_REQUEST_FAILED";

  const message =
    error.error?.description ||
    error.description ||
    error.message ||
    "Razorpay request failed";

  let status = "error";

  if (
    code ===
      "RAZORPAY_CREDENTIALS_NOT_CONFIGURED" ||
    code === 401 ||
    code === "BAD_REQUEST_ERROR"
  ) {
    status =
      code === "BAD_REQUEST_ERROR"
        ? "unavailable"
        : "not_configured";
  }

  if (
    code === 429 ||
    code === "TOO_MANY_REQUESTS" ||
    code === "NETWORK_ERROR" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET"
  ) {
    status = "unavailable";
  }

  return {
    code: clean(code, 150),
    message: clean(message, 500),
    status,
  };
}

function safeOrder(order) {
  if (!order) {
    return null;
  }

  return {
    id: order.id || null,
    entity: order.entity || null,
    amount:
      typeof order.amount === "number"
        ? order.amount
        : null,
    amountPaid:
      typeof order.amount_paid === "number"
        ? order.amount_paid
        : null,
    amountDue:
      typeof order.amount_due === "number"
        ? order.amount_due
        : null,
    currency:
      order.currency || null,
    status:
      order.status || null,
    attempts:
      typeof order.attempts === "number"
        ? order.attempts
        : null,
    receipt:
      order.receipt || null,
    createdAt:
      typeof order.created_at === "number"
        ? new Date(
            order.created_at * 1000
          )
        : null,
  };
}

function safePayment(payment) {
  if (!payment) {
    return null;
  }

  return {
    id: payment.id || null,
    entity: payment.entity || null,
    amount:
      typeof payment.amount === "number"
        ? payment.amount
        : null,
    currency:
      payment.currency || null,
    status:
      payment.status || null,
    orderId:
      payment.order_id || null,
    invoiceId:
      payment.invoice_id || null,
    method:
      payment.method || null,
    captured:
      typeof payment.captured === "boolean"
        ? payment.captured
        : null,
    amountRefunded:
      typeof payment.amount_refunded ===
      "number"
        ? payment.amount_refunded
        : null,
    refundStatus:
      payment.refund_status || null,
    description:
      payment.description || null,
    createdAt:
      typeof payment.created_at === "number"
        ? new Date(
            payment.created_at * 1000
          )
        : null,
  };
}

function safeSubscription(subscription) {
  if (!subscription) {
    return null;
  }

  return {
    id: subscription.id || null,
    entity:
      subscription.entity || null,
    planId:
      subscription.plan_id || null,
    status:
      subscription.status || null,
    currentStart:
      typeof subscription.current_start ===
      "number"
        ? new Date(
            subscription.current_start * 1000
          )
        : null,
    currentEnd:
      typeof subscription.current_end ===
      "number"
        ? new Date(
            subscription.current_end * 1000
          )
        : null,
    chargeAt:
      typeof subscription.charge_at ===
      "number"
        ? new Date(
            subscription.charge_at * 1000
          )
        : null,
    startAt:
      typeof subscription.start_at ===
      "number"
        ? new Date(
            subscription.start_at * 1000
          )
        : null,
    endAt:
      typeof subscription.end_at ===
      "number"
        ? new Date(
            subscription.end_at * 1000
          )
        : null,
    totalCount:
      typeof subscription.total_count ===
      "number"
        ? subscription.total_count
        : null,
    paidCount:
      typeof subscription.paid_count ===
      "number"
        ? subscription.paid_count
        : null,
    remainingCount:
      typeof subscription.remaining_count ===
      "number"
        ? subscription.remaining_count
        : null,
    customerNotify:
      typeof subscription.customer_notify ===
      "boolean"
        ? subscription.customer_notify
        : null,
    authAttempts:
      typeof subscription.auth_attempts ===
      "number"
        ? subscription.auth_attempts
        : null,
  };
}

async function health() {
  if (!isConfigured()) {
    return {
      provider: "razorpay",
      status: "not_configured",
      available: false,
      source: "razorpay_api",
      retrievedAt: new Date(),
    };
  }

  try {
    const razorpay = getClient();

    /*
     * Fetch a small order page only as an authenticated
     * connectivity check. No payment is created.
     */
    await razorpay.orders.all({
      count: 1,
    });

    return {
      provider: "razorpay",
      status: "available",
      available: true,
      source: "razorpay_api",
      retrievedAt: new Date(),
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "razorpay",
      status: normalized.status,
      available: false,
      source: "razorpay_api",
      retrievedAt: new Date(),
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getOrderStatus({
  orderId,
} = {}) {
  if (!orderId) {
    return {
      provider: "razorpay",
      status: "invalid",
      available: false,
      source: "razorpay_api",
      order: null,
      error: "RAZORPAY_ORDER_ID_REQUIRED",
    };
  }

  if (!isConfigured()) {
    return {
      provider: "razorpay",
      status: "not_configured",
      available: false,
      source: "razorpay_api",
      order: null,
    };
  }

  try {
    const razorpay = getClient();

    const order =
      await razorpay.orders.fetch(
        clean(orderId, 200)
      );

    return {
      provider: "razorpay",
      status: "available",
      available: true,
      source: "razorpay_api",
      retrievedAt: new Date(),
      order: safeOrder(order),
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "razorpay",
      status: normalized.status,
      available: false,
      source: "razorpay_api",
      order: null,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getPaymentStatus({
  paymentId,
} = {}) {
  if (!paymentId) {
    return {
      provider: "razorpay",
      status: "invalid",
      available: false,
      source: "razorpay_api",
      payment: null,
      error:
        "RAZORPAY_PAYMENT_ID_REQUIRED",
    };
  }

  if (!isConfigured()) {
    return {
      provider: "razorpay",
      status: "not_configured",
      available: false,
      source: "razorpay_api",
      payment: null,
    };
  }

  try {
    const razorpay = getClient();

    const payment =
      await razorpay.payments.fetch(
        clean(paymentId, 200)
      );

    return {
      provider: "razorpay",
      status: "available",
      available: true,
      source: "razorpay_api",
      retrievedAt: new Date(),
      payment: safePayment(payment),
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "razorpay",
      status: normalized.status,
      available: false,
      source: "razorpay_api",
      payment: null,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getSubscriptionStatus({
  subscriptionId,
} = {}) {
  if (!subscriptionId) {
    return {
      provider: "razorpay",
      status: "invalid",
      available: false,
      source: "razorpay_api",
      subscription: null,
      error:
        "RAZORPAY_SUBSCRIPTION_ID_REQUIRED",
    };
  }

  if (!isConfigured()) {
    return {
      provider: "razorpay",
      status: "not_configured",
      available: false,
      source: "razorpay_api",
      subscription: null,
    };
  }

  try {
    const razorpay = getClient();

    const subscription =
      await razorpay.subscriptions.fetch(
        clean(subscriptionId, 200)
      );

    return {
      provider: "razorpay",
      status: "available",
      available: true,
      source: "razorpay_api",
      retrievedAt: new Date(),
      subscription:
        safeSubscription(subscription),
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "razorpay",
      status: normalized.status,
      available: false,
      source: "razorpay_api",
      subscription: null,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getProviderData({
  orderId,
  paymentId,
  subscriptionId,
} = {}) {
  const healthResult =
    await health();

  const result = {
    provider: "razorpay",
    retrievedAt: new Date(),
    health: healthResult,
    order: null,
    payment: null,
    subscription: null,
  };

  if (!healthResult.available) {
    return result;
  }

  if (orderId) {
    result.order =
      await getOrderStatus({
        orderId,
      });
  }

  if (paymentId) {
    result.payment =
      await getPaymentStatus({
        paymentId,
      });
  }

  if (subscriptionId) {
    result.subscription =
      await getSubscriptionStatus({
        subscriptionId,
      });
  }

  return result;
}

module.exports = {
  provider: "razorpay",

  isConfigured,

  health,

  getOrderStatus,

  getPaymentStatus,

  getSubscriptionStatus,

  getProviderData,
};
