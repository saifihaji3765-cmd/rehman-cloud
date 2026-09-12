const crypto = require("crypto");
const Stripe = require("stripe");

const Subscription = require("../models/subscriptionModel");
const User = require("../models/userModel");

const formatResponse = require("../utils/formatResponse");
const logger = require("../services/loggerService");


/* =========================================================
   PROVIDER CONFIGURATION
========================================================= */

const stripe =
  process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;


/* =========================================================
   ZYRIONOS PLAN CATALOG
========================================================= */

const PLAN_CATALOG = {
  Starter: {
    monthly: 19,
    yearly: 190
  },

  Pro: {
    monthly: 99,
    yearly: 990
  },

  Business: {
    monthly: 199,
    yearly: 1990
  },

  Scale: {
    monthly: 299,
    yearly: 2990
  },

  Enterprise: {
    monthly: 499,
    yearly: 4990
  }
};


/* =========================================================
   BASIC HELPERS
========================================================= */

function normalizePlan(plan) {
  if (!plan) {
    return null;
  }

  const value =
    String(plan)
      .trim()
      .toLowerCase();

  const plans = {
    starter: "Starter",
    pro: "Pro",
    business: "Business",
    scale: "Scale",
    enterprise: "Enterprise"
  };

  return plans[value] || null;
}


function normalizeCycle(cycle) {
  return String(cycle || "").toLowerCase() === "yearly"
    ? "yearly"
    : "monthly";
}


function expectedPrice(plan, cycle) {
  const data = PLAN_CATALOG[plan];

  if (!data) {
    return null;
  }

  return data[cycle];
}


function getUserIdFromMetadata(metadata = {}) {
  return (
    metadata.userId ||
    metadata.user_id ||
    metadata.userID ||
    null
  );
}


/* =========================================================
   DATE HELPERS
========================================================= */

function getExpiryDate(
  billingCycle,
  startDate = new Date()
) {
  const expiry = new Date(startDate);

  if (billingCycle === "yearly") {
    expiry.setFullYear(
      expiry.getFullYear() + 1
    );
  } else {
    expiry.setMonth(
      expiry.getMonth() + 1
    );
  }

  return expiry;
}


function getRenewedExpiryDate(
  subscription,
  billingCycle,
  now
) {
  /*
   * For an existing active subscription, renew from the
   * later of:
   *
   * - existing expiry date
   * - current time
   *
   * This prevents a recurring invoice from accidentally
   * shortening the subscription.
   */

  if (
    subscription &&
    subscription.expiryDate
  ) {
    const existingExpiry =
      new Date(
        subscription.expiryDate
      );

    if (
      !Number.isNaN(
        existingExpiry.getTime()
      ) &&
      existingExpiry > now
    ) {
      return getExpiryDate(
        billingCycle,
        existingExpiry
      );
    }
  }

  return getExpiryDate(
    billingCycle,
    now
  );
}


/* =========================================================
   PROVIDER AMOUNT HELPERS
========================================================= */

function minorToMajor(amount) {
  const numeric = Number(amount);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric / 100;
}


/* =========================================================
   PLAN PRICE VALIDATION
========================================================= */

function validatePlanAmount(
  plan,
  cycle,
  amount
) {
  const normalizedPlan =
    normalizePlan(plan);

  if (!normalizedPlan) {
    return {
      valid: false,
      reason: "Unknown plan"
    };
  }

  const normalizedCycle =
    normalizeCycle(cycle);

  const expected =
    expectedPrice(
      normalizedPlan,
      normalizedCycle
    );

  if (expected === null) {
    return {
      valid: false,
      reason:
        "Unable to resolve plan price"
    };
  }

  const received = Number(amount);

  if (!Number.isFinite(received)) {
    return {
      valid: false,
      reason:
        "Invalid payment amount"
    };
  }

  /*
   * ZyrionOS public catalog is currently USD.
   *
   * Do NOT silently treat INR as USD.
   */

  if (received !== expected) {
    return {
      valid: false,

      reason:
        "Payment amount does not match configured plan price",

      expected,

      received
    };
  }

  return {
    valid: true,

    plan:
      normalizedPlan,

    billingCycle:
      normalizedCycle,

    amount:
      expected
  };
}


/* =========================================================
   FIND SUBSCRIPTION
========================================================= */

async function findSubscription({
  providerSubscriptionId,
  paymentProvider,
  paymentId,
  userId
}) {
  let subscription = null;

  if (providerSubscriptionId) {
    subscription =
      await Subscription.findOne({
        providerSubscriptionId
      });
  }

  if (
    !subscription &&
    paymentProvider &&
    paymentId
  ) {
    subscription =
      await Subscription.findOne({
        paymentProvider,
        paymentId
      });
  }

  if (
    !subscription &&
    userId
  ) {
    subscription =
      await Subscription.findOne({
        userId,
        status: "active"
      }).sort({
        createdAt: -1
      });
  }

  return subscription;
}


/* =========================================================
   WEBHOOK IDEMPOTENCY
========================================================= */

function hasProcessedEvent(
  subscription,
  eventId
) {
  if (
    !subscription ||
    !eventId
  ) {
    return false;
  }

  const events =
    Array.isArray(
      subscription.processedWebhookEvents
    )
      ? subscription.processedWebhookEvents
      : [];

  return events.includes(eventId);
}


async function alreadyProcessed(
  eventId
) {
  if (!eventId) {
    return false;
  }

  const existing =
    await Subscription.findOne({
      processedWebhookEvents: eventId
    })
      .select("_id")
      .lean();

  return Boolean(existing);
}


/* =========================================================
   USER PLAN UPDATE
========================================================= */

async function updateUserPlan(
  userId,
  planName
) {
  if (!userId || !planName) {
    return;
  }

  await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        subscriptionPlan:
          planName.toLowerCase()
      }
    }
  );
}


/* =========================================================
   ACTIVATE / RENEW SUBSCRIPTION
========================================================= */

async function activateSubscription({
  userId,
  planName,
  amount,
  currency,
  paymentProvider,
  paymentId,
  orderId,
  providerCustomerId,
  providerSubscriptionId,
  billingCycle,
  eventId,
  eventType
}) {
  if (!userId) {
    throw new Error(
      "Webhook did not contain a user ID"
    );
  }

  const normalizedPlan =
    normalizePlan(planName);

  if (!normalizedPlan) {
    throw new Error(
      "Webhook contains an invalid plan"
    );
  }

  const cycle =
    normalizeCycle(
      billingCycle
    );

  const normalizedCurrency =
    String(
      currency || "USD"
    ).toUpperCase();

  /*
   * Current public catalog is USD.
   */
  if (
    normalizedCurrency !== "USD"
  ) {
    throw new Error(
      "Only USD subscription activation is currently supported by the configured plan catalog"
    );
  }

  const validation =
    validatePlanAmount(
      normalizedPlan,
      cycle,
      Number(amount)
    );

  if (!validation.valid) {
    throw new Error(
      validation.reason
    );
  }

  const now = new Date();

  let subscription =
    await findSubscription({
      providerSubscriptionId,
      paymentProvider,
      paymentId,
      userId
    });

  /*
   * Never process the exact same provider event twice.
   */
  if (
    hasProcessedEvent(
      subscription,
      eventId
    )
  ) {
    return subscription;
  }

  const startDate =
    subscription &&
    subscription.startDate &&
    subscription.status === "active"
      ? subscription.startDate
      : now;

  const expiryDate =
    subscription
      ? getRenewedExpiryDate(
          subscription,
          cycle,
          now
        )
      : getExpiryDate(
          cycle,
          now
        );

  const processedEvents =
    subscription &&
    Array.isArray(
      subscription.processedWebhookEvents
    )
      ? subscription.processedWebhookEvents
      : [];

  if (eventId) {
    processedEvents.push(
      eventId
    );
  }

  const updateData = {
    userId,

    planName:
      normalizedPlan,

    price:
      validation.amount,

    currency:
      normalizedCurrency,

    paymentProvider,

    paymentId:
      paymentId ||
      subscription?.paymentId ||
      "",

    orderId:
      orderId ||
      subscription?.orderId ||
      "",

    providerCustomerId:
      providerCustomerId ||
      subscription?.providerCustomerId ||
      "",

    providerSubscriptionId:
      providerSubscriptionId ||
      subscription?.providerSubscriptionId ||
      "",

    billingCycle:
      cycle,

    status:
      "active",

    paymentStatus:
      "paid",

    startDate,

    expiryDate,

    autoRenew:
      true,

    processedWebhookEvents:
      processedEvents,

    lastWebhookEventId:
      eventId ||
      subscription?.lastWebhookEventId ||
      "",

    lastWebhookEventType:
      eventType ||
      subscription?.lastWebhookEventType ||
      ""
  };

  if (subscription) {
    Object.assign(
      subscription,
      updateData
    );

    await subscription.save();

  } else {
    subscription =
      await Subscription.create(
        updateData
      );
  }

  await updateUserPlan(
    userId,
    normalizedPlan
  );

  return subscription;
}


/* =========================================================
   UPDATE SUBSCRIPTION STATUS
========================================================= */

async function updateSubscriptionStatus({
  providerSubscriptionId,
  userId,
  status,
  paymentStatus,
  eventId,
  eventType
}) {
  const query =
    providerSubscriptionId
      ? {
          providerSubscriptionId
        }
      : userId
        ? {
            userId,
            status: "active"
          }
        : null;

  if (!query) {
    return null;
  }

  const subscription =
    await Subscription.findOne(
      query
    );

  if (!subscription) {
    return null;
  }

  if (
    hasProcessedEvent(
      subscription,
      eventId
    )
  ) {
    return subscription;
  }

  subscription.status =
    status;

  if (paymentStatus) {
    subscription.paymentStatus =
      paymentStatus;
  }

  if (eventId) {
    if (
      !Array.isArray(
        subscription.processedWebhookEvents
      )
    ) {
      subscription.processedWebhookEvents =
        [];
    }

    subscription.processedWebhookEvents.push(
      eventId
    );

    subscription.lastWebhookEventId =
      eventId;
  }

  subscription.lastWebhookEventType =
    eventType ||
    subscription.lastWebhookEventType;

  await subscription.save();

  /*
   * If subscription becomes cancelled/expired,
   * do not leave the user's plan pointing to the
   * old active subscription.
   */
  if (
    status === "cancelled" ||
    status === "expired"
  ) {
    await User.findByIdAndUpdate(
      subscription.userId,
      {
        $set: {
          subscriptionPlan:
            "free"
        }
      }
    );
  }

  return subscription;
}


/* =========================================================
   STRIPE RAW BODY
========================================================= */

function getRawBody(req) {
  if (
    Buffer.isBuffer(req.body)
  ) {
    return req.body;
  }

  if (
    Buffer.isBuffer(req.rawBody)
  ) {
    return req.rawBody;
  }

  return null;
}


/* =========================================================
   STRIPE METADATA RESOLUTION
========================================================= */

async function resolveStripeSubscription(
  subscriptionId
) {
  if (
    !stripe ||
    !subscriptionId
  ) {
    return null;
  }

  return stripe.subscriptions.retrieve(
    subscriptionId
  );
}


/* =========================================================
   STRIPE WEBHOOK
========================================================= */

async function stripeWebhookController(
  req,
  res
) {
  try {
    logger.info(
      "Stripe Webhook Received"
    );

    if (!stripe) {
      return res
        .status(500)
        .json(
          formatResponse({
            success: false,
            provider: "stripe",
            message:
              "Stripe is not configured"
          })
        );
    }

    const signature =
      req.headers[
        "stripe-signature"
      ];

    const webhookSecret =
      process.env
        .STRIPE_WEBHOOK_SECRET;

    if (
      !signature ||
      !webhookSecret
    ) {
      return res
        .status(400)
        .json(
          formatResponse({
            success: false,
            provider: "stripe",
            message:
              "Stripe webhook signature configuration missing"
          })
        );
    }

    const rawBody =
      getRawBody(req);

    if (!rawBody) {
      return res
        .status(400)
        .json(
          formatResponse({
            success: false,
            provider: "stripe",
            message:
              "Raw Stripe webhook body required"
          })
        );
    }

    /*
     * Stripe signature verification.
     */
    const event =
      stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );

    const eventId =
      event.id;

    const eventType =
      event.type;

    /*
     * Fast duplicate protection.
     */
    if (
      await alreadyProcessed(
        eventId
      )
    ) {
      logger.info(
        `Stripe webhook already processed: ${eventId}`
      );

      return res
        .status(200)
        .json({
          received: true,
          duplicate: true
        });
    }

    const object =
      event?.data?.object || {};


    /* =====================================================
       CHECKOUT COMPLETED
    ===================================================== */

    if (
      eventType ===
      "checkout.session.completed"
    ) {
      const metadata =
        object.metadata || {};

      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const plan =
        normalizePlan(
          metadata.plan
        );

      const cycle =
        normalizeCycle(
          metadata.billingCycle
        );

      /*
       * Stripe checkout amount is in minor units.
       */
      const amount =
        minorToMajor(
          object.amount_total
        );

      if (
        object.mode ===
        "subscription"
      ) {
        if (
          !userId ||
          !plan ||
          amount === null
        ) {
          throw new Error(
            "Stripe checkout webhook is missing userId, plan or amount metadata"
          );
        }

        await activateSubscription({
          userId,

          planName:
            plan,

          amount,

          currency:
            object.currency ||
            "USD",

          paymentProvider:
            "stripe",

          paymentId:
            object.payment_intent ||
            "",

          orderId:
            object.id,

          providerCustomerId:
            object.customer ||
            "",

          providerSubscriptionId:
            object.subscription ||
            "",

          billingCycle:
            cycle,

          eventId,

          eventType
        });
      }
    }


    /* =====================================================
       PAYMENT INTENT SUCCEEDED
    ===================================================== */

    else if (
      eventType ===
      "payment_intent.succeeded"
    ) {
      const metadata =
        object.metadata || {};

      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const plan =
        normalizePlan(
          metadata.plan
        );

      const cycle =
        normalizeCycle(
          metadata.billingCycle
        );

      const amount =
        minorToMajor(
          object.amount_received ??
          object.amount
        );

      /*
       * PaymentIntent metadata may not be present
       * for subscription checkout. Do not invent a
       * subscription activation without metadata.
       */
      if (
        userId &&
        plan &&
        amount !== null
      ) {
        await activateSubscription({
          userId,

          planName:
            plan,

          amount,

          currency:
            object.currency ||
            "USD",

          paymentProvider:
            "stripe",

          paymentId:
            object.id,

          providerCustomerId:
            object.customer ||
            "",

          billingCycle:
            cycle,

          eventId,

          eventType
        });
      } else {
        logger.warning(
          `Stripe PaymentIntent ${object.id} has insufficient metadata; subscription activation skipped`
        );
      }
    }


    /* =====================================================
       INVOICE PAID
    ===================================================== */

    else if (
      eventType ===
      "invoice.paid"
    ) {
      const subscriptionId =
        object.subscription;

      if (subscriptionId) {
        const stripeSubscription =
          await resolveStripeSubscription(
            subscriptionId
          );

        const metadata =
          stripeSubscription?.metadata ||
          object.metadata ||
          {};

        const userId =
          getUserIdFromMetadata(
            metadata
          );

        const plan =
          normalizePlan(
            metadata.plan
          );

        const cycle =
          normalizeCycle(
            metadata.billingCycle
          );

        const amount =
          minorToMajor(
            object.amount_paid ??
            object.amount_due
          );

        if (
          userId &&
          plan &&
          amount !== null
        ) {
          await activateSubscription({
            userId,

            planName:
              plan,

            amount,

            currency:
              object.currency ||
              "USD",

            paymentProvider:
              "stripe",

            paymentId:
              object.payment_intent ||
              object.id,

            providerCustomerId:
              object.customer ||
              "",

            providerSubscriptionId:
              subscriptionId,

            billingCycle:
              cycle,

            eventId,

            eventType
          });
        } else {
          logger.warning(
            `Stripe invoice ${object.id} has insufficient subscription metadata`
          );
        }
      }
    }


    /* =====================================================
       PAYMENT FAILED
    ===================================================== */

    else if (
      eventType ===
      "invoice.payment_failed"
    ) {
      await updateSubscriptionStatus({
        providerSubscriptionId:
          object.subscription,

        userId:
          object.metadata
            ?.userId,

        status:
          "past_due",

        paymentStatus:
          "failed",

        eventId,

        eventType
      });
    }


    /* =====================================================
       SUBSCRIPTION UPDATED
    ===================================================== */

    else if (
      eventType ===
      "customer.subscription.updated"
    ) {
      const stripeStatus =
        object.status;

      let localStatus =
        "active";

      let paymentStatus =
        "paid";

      if (
        stripeStatus ===
        "past_due"
      ) {
        localStatus =
          "past_due";

        paymentStatus =
          "failed";

      } else if (
        stripeStatus ===
          "canceled" ||
        stripeStatus ===
          "unpaid"
      ) {
        localStatus =
          "cancelled";

        paymentStatus =
          "cancelled";

      } else if (
        stripeStatus ===
        "incomplete"
      ) {
        localStatus =
          "pending";

        paymentStatus =
          "pending";

      } else if (
        stripeStatus ===
        "incomplete_expired"
      ) {
        localStatus =
          "cancelled";

        paymentStatus =
          "failed";
      }

      await updateSubscriptionStatus({
        providerSubscriptionId:
          object.id,

        userId:
          object.metadata
            ?.userId,

        status:
          localStatus,

        paymentStatus,

        eventId,

        eventType
      });
    }


    /* =====================================================
       SUBSCRIPTION DELETED
    ===================================================== */

    else if (
      eventType ===
      "customer.subscription.deleted"
    ) {
      await updateSubscriptionStatus({
        providerSubscriptionId:
          object.id,

        userId:
          object.metadata
            ?.userId,

        status:
          "cancelled",

        paymentStatus:
          "cancelled",

        eventId,

        eventType
      });
    }


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res
      .status(200)
      .json({
        received: true,
        provider: "stripe",
        eventId
      });

  } catch (error) {
    logger.error(
      `Stripe webhook failed: ${error?.message}`
    );

    /*
     * Returning 400 allows the provider to regard the
     * webhook as unsuccessful and retry according to its
     * delivery policy.
     */

    return res
      .status(400)
      .json({
        success: false,
        provider: "stripe",
        message:
          "Webhook processing failed",
        error:
          error?.message ||
          "Unknown webhook error"
      });
  }
}


/* =========================================================
   RAZORPAY SIGNATURE VERIFICATION
========================================================= */

function getRazorpayRawBody(req) {
  if (
    Buffer.isBuffer(req.body)
  ) {
    return req.body;
  }

  if (
    Buffer.isBuffer(req.rawBody)
  ) {
    return req.rawBody;
  }

  if (
    typeof req.rawBody ===
    "string"
  ) {
    return Buffer.from(
      req.rawBody
    );
  }

  return null;
}


function verifyRazorpayWebhook(req) {
  const signature =
    req.headers[
      "x-razorpay-signature"
    ];

  const secret =
    process.env
      .RAZORPAY_WEBHOOK_SECRET;

  if (
    !signature ||
    !secret
  ) {
    return false;
  }

  const rawBody =
    getRazorpayRawBody(req);

  if (!rawBody) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(rawBody)
      .digest("hex");

  const expectedBuffer =
    Buffer.from(
      expected,
      "utf8"
    );

  const receivedBuffer =
    Buffer.from(
      String(signature),
      "utf8"
    );

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
}


/* =========================================================
   RAZORPAY WEBHOOK
========================================================= */

async function razorpayWebhookController(
  req,
  res
) {
  try {
    logger.info(
      "Razorpay Webhook Received"
    );

    if (
      !verifyRazorpayWebhook(
        req
      )
    ) {
      logger.warning(
        "Invalid Razorpay webhook signature"
      );

      return res
        .status(400)
        .json({
          success: false,
          provider: "razorpay",
          message:
            "Invalid webhook signature"
        });
    }

    let event;

    try {
      event =
        Buffer.isBuffer(req.body)
          ? JSON.parse(
              req.body.toString(
                "utf8"
              )
            )
          : req.body;
    } catch {
      return res
        .status(400)
        .json({
          success: false,
          provider: "razorpay",
          message:
            "Invalid webhook payload"
        });
    }

    if (
      !event ||
      typeof event !==
        "object"
    ) {
      return res
        .status(400)
        .json({
          success: false,
          provider: "razorpay",
          message:
            "Invalid webhook payload"
        });
    }

    const eventType =
      event.event || null;

    /*
     * Razorpay webhook payloads do not always expose a
     * universal top-level event ID. Payment/subscription
     * entity IDs are used as fallback.
     */
    const eventId =
      event.id ||
      event.payload
        ?.payment
        ?.entity
        ?.id ||
      event.payload
        ?.subscription
        ?.entity
        ?.id ||
      null;

    if (
      await alreadyProcessed(
        eventId
      )
    ) {
      return res
        .status(200)
        .json({
          received: true,
          duplicate: true
        });
    }


    /* =====================================================
       PAYMENT CAPTURED
    ===================================================== */

    if (
      eventType ===
      "payment.captured"
    ) {
      const payment =
        event.payload
          ?.payment
          ?.entity || {};

      const notes =
        payment.notes || {};

      const userId =
        notes.userId ||
        notes.user_id ||
        null;

      const plan =
        normalizePlan(
          notes.plan
        );

      const cycle =
        normalizeCycle(
          notes.billingCycle
        );

      const currency =
        String(
          payment.currency ||
          "INR"
        ).toUpperCase();

      const amount =
        minorToMajor(
          payment.amount
        );

      /*
       * The current ZyrionOS catalog is USD.
       *
       * Do not convert INR to USD using an invented
       * exchange rate or silently map arbitrary INR
       * amounts to plans.
       */
      if (
        currency !==
        "USD"
      ) {
        throw new Error(
          "Razorpay USD plan activation requires a verified USD payment. Current Razorpay payload is not USD."
        );
      }

      if (
        !userId ||
        !plan ||
        amount === null
      ) {
        throw new Error(
          "Razorpay payment webhook is missing userId, plan or amount metadata"
        );
      }

      await activateSubscription({
        userId,

        planName:
          plan,

        amount,

        currency,

        paymentProvider:
          "razorpay",

        paymentId:
          payment.id,

        orderId:
          payment.order_id ||
          "",

        billingCycle:
          cycle,

        eventId,

        eventType
      });
    }


    /* =====================================================
       PAYMENT FAILED
    ===================================================== */

    else if (
      eventType ===
      "payment.failed"
    ) {
      const payment =
        event.payload
          ?.payment
          ?.entity || {};

      const notes =
        payment.notes || {};

      await updateSubscriptionStatus({
        userId:
          notes.userId ||
          notes.user_id ||
          null,

        status:
          "past_due",

        paymentStatus:
          "failed",

        eventId,

        eventType
      });
    }


    /* =====================================================
       SUBSCRIPTION ACTIVATED
    ===================================================== */

    else if (
      eventType ===
      "subscription.activated"
    ) {
      const subscriptionEntity =
        event.payload
          ?.subscription
          ?.entity || {};

      const notes =
        subscriptionEntity.notes ||
        {};

      const plan =
        normalizePlan(
          notes.plan
        );

      const cycle =
        normalizeCycle(
          notes.billingCycle
        );

      const userId =
        notes.userId ||
        notes.user_id ||
        null;

      /*
       * Razorpay subscription amount must be explicitly
       * supplied in trusted provider metadata.
       *
       * Do not invent the plan price.
       */
      const amount =
        Number(
          notes.amount
        );

      if (
        userId &&
        plan &&
        Number.isFinite(amount)
      ) {
        await activateSubscription({
          userId,

          planName:
            plan,

          amount,

          currency:
            String(
              notes.currency ||
              "USD"
            ).toUpperCase(),

          paymentProvider:
            "razorpay",

          paymentId:
            "",

          orderId:
            "",

          providerSubscriptionId:
            subscriptionEntity.id,

          billingCycle:
            cycle,

          eventId,

          eventType
        });
      } else {
        logger.warning(
          `Razorpay subscription ${subscriptionEntity.id} has insufficient metadata`
        );
      }
    }


    /* =====================================================
       SUBSCRIPTION CANCELLED
    ===================================================== */

    else if (
      eventType ===
      "subscription.cancelled"
    ) {
      const subscriptionEntity =
        event.payload
          ?.subscription
          ?.entity || {};

      await updateSubscriptionStatus({
        providerSubscriptionId:
          subscriptionEntity.id,

        userId:
          subscriptionEntity
            ?.notes
            ?.userId ||
          subscriptionEntity
            ?.notes
            ?.user_id ||
          null,

        status:
          "cancelled",

        paymentStatus:
          "cancelled",

        eventId,

        eventType
      });
    }


    /* =====================================================
       SUBSCRIPTION HALTED
    ===================================================== */

    else if (
      eventType ===
      "subscription.halted"
    ) {
      const subscriptionEntity =
        event.payload
          ?.subscription
          ?.entity || {};

      await updateSubscriptionStatus({
        providerSubscriptionId:
          subscriptionEntity.id,

        userId:
          subscriptionEntity
            ?.notes
            ?.userId ||
          subscriptionEntity
            ?.notes
            ?.user_id ||
          null,

        status:
          "past_due",

        paymentStatus:
          "failed",

        eventId,

        eventType
      });
    }


    /* =====================================================
       SUCCESS RESPONSE
    ===================================================== */

    return res
      .status(200)
      .json({
        received: true,
        provider: "razorpay",
        eventId
      });

  } catch (error) {
    logger.error(
      `Razorpay webhook failed: ${error?.message}`
    );

    return res
      .status(400)
      .json({
        success: false,
        provider: "razorpay",
        message:
          "Webhook processing failed",
        error:
          error?.message ||
          "Unknown webhook error"
      });
  }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  stripeWebhookController,
  razorpayWebhookController
};
