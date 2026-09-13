"use strict";

const Stripe = require("stripe");

const STRIPE_API_VERSION =
  process.env.STRIPE_API_VERSION || undefined;

function getSecretKey() {
  return (
    process.env.STRIPE_SECRET_KEY ||
    ""
  ).trim();
}

function isConfigured() {
  return Boolean(getSecretKey());
}

function getClient() {
  const secretKey = getSecretKey();

  if (!secretKey) {
    const error = new Error(
      "STRIPE_SECRET_KEY_NOT_CONFIGURED"
    );

    error.code =
      "STRIPE_SECRET_KEY_NOT_CONFIGURED";

    throw error;
  }

  const options = {};

  if (STRIPE_API_VERSION) {
    options.apiVersion = STRIPE_API_VERSION;
  }

  return new Stripe(secretKey, options);
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
      code: "STRIPE_UNKNOWN_ERROR",
      message: "Stripe request failed",
      status: "error",
    };
  }

  const code =
    error.code ||
    error.type ||
    error.name ||
    "STRIPE_REQUEST_FAILED";

  let status = "error";

  if (
    code ===
      "STRIPE_SECRET_KEY_NOT_CONFIGURED" ||
    code === "authentication_error"
  ) {
    status = "not_configured";
  }

  if (
    code === "rate_limit_error" ||
    code === "api_connection_error" ||
    code === "timeout"
  ) {
    status = "unavailable";
  }

  if (
    code === "resource_missing"
  ) {
    status = "unavailable";
  }

  return {
    code: clean(code, 150),
    message: clean(
      error.message ||
        "Stripe request failed",
      500
    ),
    status,
  };
}

function safePaymentIntent(payment) {
  if (!payment) {
    return null;
  }

  return {
    id: payment.id || null,
    object: payment.object || null,
    status: payment.status || null,
    amount:
      typeof payment.amount === "number"
        ? payment.amount
        : null,
    amountReceived:
      typeof payment.amount_received ===
      "number"
        ? payment.amount_received
        : null,
    currency:
      payment.currency || null,
    customer:
      typeof payment.customer ===
      "string"
        ? payment.customer
        : payment.customer?.id ||
          null,
    invoice:
      typeof payment.invoice ===
      "string"
        ? payment.invoice
        : payment.invoice?.id ||
          null,
    subscription:
      typeof payment.subscription ===
      "string"
        ? payment.subscription
        : payment.subscription?.id ||
          null,
    createdAt: payment.created
      ? new Date(payment.created * 1000)
      : null,
  };
}

function safeSubscription(subscription) {
  if (!subscription) {
    return null;
  }

  return {
    id: subscription.id || null,
    status:
      subscription.status || null,
    customer:
      typeof subscription.customer ===
      "string"
        ? subscription.customer
        : subscription.customer?.id ||
          null,
    currency:
      subscription.currency || null,
    collectionMethod:
      subscription.collection_method ||
      null,
    cancelAtPeriodEnd:
      typeof subscription.cancel_at_period_end ===
      "boolean"
        ? subscription.cancel_at_period_end
        : null,
    currentPeriodStart:
      subscription.current_period_start
        ? new Date(
            subscription.current_period_start *
              1000
          )
        : null,
    currentPeriodEnd:
      subscription.current_period_end
        ? new Date(
            subscription.current_period_end *
              1000
          )
        : null,
    canceledAt:
      subscription.canceled_at
        ? new Date(
            subscription.canceled_at *
              1000
          )
        : null,
    createdAt:
      subscription.created
        ? new Date(
            subscription.created * 1000
          )
        : null,
    items: Array.isArray(
      subscription.items?.data
    )
      ? subscription.items.data.map(
          (item) => ({
            id: item.id || null,
            priceId:
              item.price?.id || null,
            quantity:
              typeof item.quantity ===
              "number"
                ? item.quantity
                : null,
          })
        )
      : [],
  };
}

async function health() {
  if (!isConfigured()) {
    return {
      provider: "stripe",
      status: "not_configured",
      available: false,
      source: "stripe_api",
      retrievedAt: new Date(),
    };
  }

  try {
    const stripe = getClient();

    /*
     * Retrieve the account itself. This verifies
     * that the configured Stripe credential can
     * actually authenticate against Stripe.
     */
    const account =
      await stripe.accounts.retrieve();

    return {
      provider: "stripe",
      status: "available",
      available: true,
      source: "stripe_api",
      retrievedAt: new Date(),
      accountId:
        account?.id || null,
      country:
        account?.country || null,
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "stripe",
      status: normalized.status,
      available: false,
      source: "stripe_api",
      retrievedAt: new Date(),
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
      provider: "stripe",
      status: "invalid",
      available: false,
      source: "stripe_api",
      payment: null,
      error: "STRIPE_PAYMENT_ID_REQUIRED",
    };
  }

  if (!isConfigured()) {
    return {
      provider: "stripe",
      status: "not_configured",
      available: false,
      source: "stripe_api",
      payment: null,
    };
  }

  try {
    const stripe = getClient();

    const payment =
      await stripe.paymentIntents.retrieve(
        clean(paymentId, 200)
      );

    return {
      provider: "stripe",
      status: "available",
      available: true,
      source: "stripe_api",
      retrievedAt: new Date(),
      payment:
        safePaymentIntent(payment),
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "stripe",
      status: normalized.status,
      available: false,
      source: "stripe_api",
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
      provider: "stripe",
      status: "invalid",
      available: false,
      source: "stripe_api",
      subscription: null,
      error:
        "STRIPE_SUBSCRIPTION_ID_REQUIRED",
    };
  }

  if (!isConfigured()) {
    return {
      provider: "stripe",
      status: "not_configured",
      available: false,
      source: "stripe_api",
      subscription: null,
    };
  }

  try {
    const stripe = getClient();

    const subscription =
      await stripe.subscriptions.retrieve(
        clean(subscriptionId, 200)
      );

    return {
      provider: "stripe",
      status: "available",
      available: true,
      source: "stripe_api",
      retrievedAt: new Date(),
      subscription:
        safeSubscription(subscription),
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "stripe",
      status: normalized.status,
      available: false,
      source: "stripe_api",
      subscription: null,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getCustomer({
  customerId,
} = {}) {
  if (!customerId) {
    return {
      provider: "stripe",
      status: "invalid",
      available: false,
      source: "stripe_api",
      customer: null,
      error:
        "STRIPE_CUSTOMER_ID_REQUIRED",
    };
  }

  if (!isConfigured()) {
    return {
      provider: "stripe",
      status: "not_configured",
      available: false,
      source: "stripe_api",
      customer: null,
    };
  }

  try {
    const stripe = getClient();

    const customer =
      await stripe.customers.retrieve(
        clean(customerId, 200)
      );

    /*
     * Never return billing details, payment
     * methods, addresses, or other unnecessary
     * customer data to the financial control layer.
     */
    return {
      provider: "stripe",
      status: "available",
      available: true,
      source: "stripe_api",
      retrievedAt: new Date(),
      customer: {
        id: customer?.id || null,
        deleted:
          customer?.deleted === true,
        email:
          customer?.email || null,
        name:
          customer?.name || null,
      },
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    return {
      provider: "stripe",
      status: normalized.status,
      available: false,
      source: "stripe_api",
      customer: null,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    };
  }
}

async function getProviderData({
  paymentId,
  subscriptionId,
  customerId,
} = {}) {
  const healthResult =
    await health();

  const result = {
    provider: "stripe",
    retrievedAt: new Date(),
    health: healthResult,
    payment: null,
    subscription: null,
    customer: null,
  };

  if (!healthResult.available) {
    return result;
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

  if (customerId) {
    result.customer =
      await getCustomer({
        customerId,
      });
  }

  return result;
}

module.exports = {
  provider: "stripe",

  isConfigured,

  health,

  getPaymentStatus,

  getSubscriptionStatus,

  getCustomer,

  getProviderData,
};
