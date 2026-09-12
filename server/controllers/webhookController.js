/* =========================================================
   ZyrionOS PAYMENT WEBHOOK CONTROLLER
   =========================================================

   Responsibilities:
   - Verify Stripe webhooks
   - Verify Razorpay webhooks
   - Activate paid subscriptions
   - Persist official billing entitlements
   - Handle renewals
   - Handle failed payments
   - Handle cancellations
   - Maintain webhook idempotency

   IMPORTANT:
   ---------------------------------------------------------
   Payment success is NEVER trusted from the frontend.

   Subscription activation happens only after a verified
   payment-provider webhook.

   Billing Agent is the source of plan entitlements.

========================================================= */

const crypto = require("crypto");

const Subscription =
  require("../models/subscriptionModel");

const User =
  require("../models/userModel");

const billingAgent =
  require("../agents/billingAgent");


/* =========================================================
   STRIPE
========================================================= */

let stripe = null;

if (
  process.env.STRIPE_SECRET_KEY
) {
  const Stripe = require("stripe");

  stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY
  );
}


/* =========================================================
   PLAN CATALOG
========================================================= */

const PLAN_CATALOG = Object.freeze({
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
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(value) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  const plans = {
    starter: "Starter",
    pro: "Pro",
    business: "Business",
    scale: "Scale",
    enterprise: "Enterprise"
  };

  return plans[normalized] || null;
}


/* =========================================================
   BILLING CYCLE
========================================================= */

function normalizeCycle(value) {
  if (
    typeof value !== "string"
  ) {
    return "monthly";
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    normalized === "yearly"
  ) {
    return "yearly";
  }

  return "monthly";
}


/* =========================================================
   EXPECTED PRICE
========================================================= */

function expectedPrice(
  planName,
  billingCycle
) {
  const plan =
    PLAN_CATALOG[planName];

  if (!plan) {
    return null;
  }

  return (
    plan[billingCycle] ??
    null
  );
}


/* =========================================================
   USER ID NORMALIZATION
========================================================= */

function normalizeUserId(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    return (
      value.trim() || null
    );
  }

  if (
    typeof value === "object" &&
    typeof value.toString ===
      "function"
  ) {
    return value.toString();
  }

  return null;
}


/* =========================================================
   STRIPE / PROVIDER METADATA USER
========================================================= */

function getUserIdFromMetadata(
  metadata = {}
) {
  return normalizeUserId(
    metadata.userId ||
    metadata.user_id ||
    metadata.uid ||
    metadata.user
  );
}


/* =========================================================
   DATE HELPERS
========================================================= */

function getExpiryDate(
  billingCycle,
  startDate = new Date()
) {
  const date =
    new Date(startDate);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  if (
    billingCycle === "yearly"
  ) {
    date.setUTCFullYear(
      date.getUTCFullYear() + 1
    );
  } else {
    date.setUTCMonth(
      date.getUTCMonth() + 1
    );
  }

  return date;
}


function getRenewedExpiryDate(
  currentExpiryDate,
  billingCycle
) {
  const now =
    new Date();

  let baseDate =
    currentExpiryDate
      ? new Date(
          currentExpiryDate
        )
      : now;

  if (
    Number.isNaN(
      baseDate.getTime()
    )
  ) {
    baseDate = now;
  }

  if (
    baseDate < now
  ) {
    baseDate = now;
  }

  return getExpiryDate(
    billingCycle,
    baseDate
  );
}


/* =========================================================
   MONEY
========================================================= */

function minorToMajor(
  amount
) {
  if (
    amount === null ||
    amount === undefined
  ) {
    return null;
  }

  const numeric =
    Number(amount);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return null;
  }

  return numeric / 100;
}


/* =========================================================
   PAYMENT AMOUNT VALIDATION
========================================================= */

function validatePlanAmount({
  planName,
  billingCycle,
  amount,
  allowMissing = false
}) {
  const expected =
    expectedPrice(
      planName,
      billingCycle
    );

  if (
    expected === null
  ) {
    return {
      valid: false,
      reason:
        "PLAN_NOT_CONFIGURED"
    };
  }

  if (
    amount === null ||
    amount === undefined
  ) {
    return {
      valid: allowMissing,
      reason: allowMissing
        ? null
        : "PAYMENT_AMOUNT_MISSING"
    };
  }

  const numeric =
    Number(amount);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return {
      valid: false,
      reason:
        "INVALID_PAYMENT_AMOUNT"
    };
  }

  if (
    Math.abs(
      numeric - expected
    ) > 0.01
  ) {
    return {
      valid: false,
      reason:
        "PAYMENT_AMOUNT_MISMATCH",
      expected,
      received: numeric
    };
  }

  return {
    valid: true,
    expected,
    received: numeric
  };
}


/* =========================================================
   BILLING AGENT ENTITLEMENTS
========================================================= */

function getPlanEntitlements(
  planName
) {
  if (
    !billingAgent ||
    typeof billingAgent.getPlanByName !==
      "function"
  ) {
    throw new Error(
      "Billing Agent plan catalog is unavailable"
    );
  }

  const plan =
    billingAgent.getPlanByName(
      planName
    );

  if (!plan) {
    throw new Error(
      `Billing plan not found: ${planName}`
    );
  }

  return plan;
}


/* =========================================================
   BUILD REAL ENTITLEMENTS
========================================================= */

function buildEntitlementData(
  plan
) {
  return {
    deploymentsLimit:
      Number(
        plan.deploymentsLimit ??
          0
      ),

    aiCreditsLimit:
      Number(
        plan.aiCredits ??
          0
      ),

    thumbnailCreditsLimit:
      Number(
        plan.thumbnailCredits ??
          0
      ),

    videoCreditsLimit:
      Number(
        plan.videoCredits ??
          0
      ),

    infrastructure: {
      ram:
        plan.ram ?? null,

      cpu:
        plan.cpu ?? null,

      storage:
        plan.storage ?? null,

      bandwidth:
        plan.bandwidth ?? null
    },

    featureFlags: {
      customDomain:
        Boolean(
          plan.customDomain
        ),

      autoSSL:
        Boolean(
          plan.autoSSL
        ),

      autoScaling:
        Boolean(
          plan.autoScaling
        ),

      advancedMonitoring:
        Boolean(
          plan.advancedMonitoring
        ),

      priorityDeployments:
        Boolean(
          plan.priorityDeployments
        ),

      dedicatedInfrastructure:
        Boolean(
          plan.dedicatedInfrastructure
        ),

      dedicatedSupport:
        Boolean(
          plan.dedicatedSupport
        )
    },

    features:
      Array.isArray(
        plan.features
      )
        ? [...plan.features]
        : [],

    support:
      plan.support ||
      "Community Support"
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
  if (
    providerSubscriptionId
  ) {
    const subscription =
      await Subscription.findOne({
        providerSubscriptionId,
        paymentProvider
      });

    if (subscription) {
      return subscription;
    }
  }

  if (
    paymentId
  ) {
    const subscription =
      await Subscription.findOne({
        paymentId,
        paymentProvider
      });

    if (subscription) {
      return subscription;
    }
  }

  if (
    userId
  ) {
    return Subscription.findOne({
      userId,
      paymentProvider,
      status: "active"
    }).sort({
      createdAt: -1
    });
  }

  return null;
}


/* =========================================================
   GLOBAL WEBHOOK DUPLICATE CHECK
========================================================= */

async function alreadyProcessed(
  eventId
) {
  if (!eventId) {
    return false;
  }

  const existing =
    await Subscription.findOne({
      processedWebhookEvents:
        eventId
    }).select("_id");

  return Boolean(
    existing
  );
}


/* =========================================================
   SUBSCRIPTION EVENT CHECK
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

  if (
    subscription.lastWebhookEventId ===
    eventId
  ) {
    return true;
  }

  return Array.isArray(
    subscription.processedWebhookEvents
  )
    ? subscription.processedWebhookEvents.includes(
        eventId
      )
    : false;
}


/* =========================================================
   EVENT HISTORY
========================================================= */

function appendWebhookEvent(
  existingEvents,
  eventId
) {
  const events =
    Array.isArray(
      existingEvents
    )
      ? [...existingEvents]
      : [];

  if (
    eventId &&
    !events.includes(eventId)
  ) {
    events.push(eventId);
  }

  const MAX_EVENTS = 100;

  if (
    events.length >
    MAX_EVENTS
  ) {
    return events.slice(
      events.length -
        MAX_EVENTS
    );
  }

  return events;
}


/* =========================================================
   USER PLAN MIRROR
========================================================= */

async function updateUserPlan(
  userId,
  planName
) {
  const normalizedUserId =
    normalizeUserId(
      userId
    );

  const normalizedPlan =
    normalizePlan(
      planName
    );

  if (
    !normalizedUserId ||
    !normalizedPlan
  ) {
    return;
  }

  await User.findByIdAndUpdate(
    normalizedUserId,
    {
      $set: {
        subscriptionPlan:
          normalizedPlan.toLowerCase()
      }
    }
  );
}


/* =========================================================
   ACTIVATE SUBSCRIPTION
========================================================= */

async function activateSubscription({
  userId,
  planName,
  billingCycle = "monthly",
  paymentProvider,
  paymentId = null,
  orderId = null,
  providerCustomerId = null,
  providerSubscriptionId = null,
  currency = "USD",
  amount = null,
  eventId,
  eventType,
  renewal = false
}) {
  const normalizedUserId =
    normalizeUserId(
      userId
    );

  if (
    !normalizedUserId
  ) {
    throw new Error(
      "Subscription activation requires userId"
    );
  }

  const normalizedPlan =
    normalizePlan(
      planName
    );

  if (
    !normalizedPlan
  ) {
    throw new Error(
      "Invalid subscription plan"
    );
  }

  const cycle =
    normalizeCycle(
      billingCycle
    );

  const normalizedCurrency =
    String(
      currency || "USD"
    )
      .trim()
      .toUpperCase();

  if (
    normalizedCurrency !==
    "USD"
  ) {
    throw new Error(
      "Current ZyrionOS subscription catalog requires USD"
    );
  }

  /*
   * Get official entitlements.
   */
  const plan =
    getPlanEntitlements(
      normalizedPlan
    );

  const entitlementData =
    buildEntitlementData(
      plan
    );

  /*
   * Verify payment amount.
   */
  const amountValidation =
    validatePlanAmount({
      planName:
        normalizedPlan,
      billingCycle:
        cycle,
      amount,
      allowMissing:
        Boolean(
          providerSubscriptionId
        )
    });

  if (
    !amountValidation.valid
  ) {
    throw new Error(
      `Subscription payment validation failed: ${amountValidation.reason}`
    );
  }

  /*
   * Locate existing subscription.
   */
  let subscription =
    await findSubscription({
      providerSubscriptionId,
      paymentProvider,
      paymentId,
      userId:
        normalizedUserId
    });

  /*
   * Exact event idempotency.
   */
  if (
    hasProcessedEvent(
      subscription,
      eventId
    )
  ) {
    return {
      success: true,
      duplicate: true,
      subscription
    };
  }

  /*
   * Global event idempotency.
   */
  if (
    !subscription &&
    await alreadyProcessed(
      eventId
    )
  ) {
    return {
      success: true,
      duplicate: true
    };
  }

  const now =
    new Date();

  let startDate =
    now;

  let expiryDate;

  /*
   * Renewal.
   */
  if (
    subscription &&
    renewal
  ) {
    expiryDate =
      getRenewedExpiryDate(
        subscription.expiryDate,
        cycle
      );
  }

  /*
   * Existing active provider subscription:
   *
   * Do NOT extend it again from another webhook type.
   *
   * This protects against:
   * checkout.session.completed
   * payment_intent.succeeded
   * invoice.paid
   *
   * accidentally giving multiple billing periods.
   */
  else if (
    subscription &&
    subscription.status ===
      "active" &&
    providerSubscriptionId &&
    subscription.providerSubscriptionId &&
    String(
      providerSubscriptionId
    ) ===
      String(
        subscription.providerSubscriptionId
      )
  ) {
    subscription.processedWebhookEvents =
      appendWebhookEvent(
        subscription.processedWebhookEvents,
        eventId
      );

    subscription.lastWebhookEventId =
      eventId || null;

    subscription.lastWebhookEventType =
      eventType || null;

    /*
     * Even though activation is skipped, refresh the
     * entitlement snapshot from the official Billing Agent.
     *
     * This fixes old records whose entitlement fields were
     * missing.
     */
    subscription.deploymentsLimit =
      entitlementData.deploymentsLimit;

    subscription.aiCreditsLimit =
      entitlementData.aiCreditsLimit;

    subscription.thumbnailCreditsLimit =
      entitlementData.thumbnailCreditsLimit;

    subscription.videoCreditsLimit =
      entitlementData.videoCreditsLimit;

    subscription.infrastructure =
      entitlementData.infrastructure;

    subscription.featureFlags =
      entitlementData.featureFlags;

    subscription.features =
      entitlementData.features;

    subscription.support =
      entitlementData.support;

    await subscription.save();

    await updateUserPlan(
      normalizedUserId,
      normalizedPlan
    );

    return {
      success: true,
      duplicate: true,
      alreadyActive: true,
      subscription
    };
  }

  /*
   * New activation / old inactive subscription.
   */
  else {
    expiryDate =
      getExpiryDate(
        cycle,
        startDate
      );
  }

  /*
   * Existing usage.
   */
  const currentUsage =
    subscription?.usage || {};

  /*
   * For a genuine renewal, start a new billing-period
   * usage window.
   */
  const usage =
    renewal
      ? {
          aiRequestsUsed: 0,
          aiCreditsUsed: 0,
          deploymentsUsed: 0,
          thumbnailsGenerated: 0,
          videoCreditsUsed: 0
        }
      : {
          aiRequestsUsed:
            Number(
              currentUsage.aiRequestsUsed ??
                0
            ),

          aiCreditsUsed:
            Number(
              currentUsage.aiCreditsUsed ??
                0
            ),

          deploymentsUsed:
            Number(
              currentUsage.deploymentsUsed ??
                0
            ),

          thumbnailsGenerated:
            Number(
              currentUsage.thumbnailsGenerated ??
                0
            ),

          videoCreditsUsed:
            Number(
              currentUsage.videoCreditsUsed ??
                0
            )
        };

  const processedEvents =
    appendWebhookEvent(
      subscription?.processedWebhookEvents,
      eventId
    );

  /*
   * =======================================================
   * REAL SUBSCRIPTION DATA
   * =======================================================
   */

  const updateData = {

    userId:
      normalizedUserId,

    planName:
      normalizedPlan,

    price:
      amountValidation.expected ??
      expectedPrice(
        normalizedPlan,
        cycle
      ),

    currency:
      normalizedCurrency,

    paymentProvider,

    paymentStatus:
      "paid",

    status:
      "active",

    billingCycle:
      cycle,

    startDate,

    expiryDate,

    autoRenew:
      true,

    usage,

    /*
     * REAL BILLING ENTITLEMENTS
     */
    deploymentsLimit:
      entitlementData.deploymentsLimit,

    aiCreditsLimit:
      entitlementData.aiCreditsLimit,

    thumbnailCreditsLimit:
      entitlementData.thumbnailCreditsLimit,

    videoCreditsLimit:
      entitlementData.videoCreditsLimit,

    /*
     * REAL INFRASTRUCTURE ENTITLEMENTS
     */
    infrastructure:
      entitlementData.infrastructure,

    /*
     * REAL FEATURES
     */
    featureFlags:
      entitlementData.featureFlags,

    features:
      entitlementData.features,

    support:
      entitlementData.support,

    /*
     * WEBHOOK AUDIT
     */
    processedWebhookEvents:
      processedEvents,

    lastWebhookEventId:
      eventId || null,

    lastWebhookEventType:
      eventType || null
  };

  if (
    paymentId
  ) {
    updateData.paymentId =
      paymentId;
  }

  if (
    orderId
  ) {
    updateData.orderId =
      orderId;
  }

  if (
    providerCustomerId
  ) {
    updateData.providerCustomerId =
      providerCustomerId;
  }

  if (
    providerSubscriptionId
  ) {
    updateData.providerSubscriptionId =
      providerSubscriptionId;
  }

  /*
   * Save existing subscription.
   */
  if (
    subscription
  ) {
    Object.assign(
      subscription,
      updateData
    );

    await subscription.save();
  }

  /*
   * Create new subscription.
   */
  else {
    subscription =
      await Subscription.create(
        updateData
      );
  }

  /*
   * User model only receives the current plan label.
   *
   * It does NOT receive credits/RAM/CPU/etc.
   */
  await updateUserPlan(
    normalizedUserId,
    normalizedPlan
  );

  return {
    success: true,
    duplicate: false,
    renewed:
      Boolean(renewal),
    created:
      !subscription.isNew,
    subscription
  };
}


/* =========================================================
   UPDATE SUBSCRIPTION STATUS
========================================================= */

async function updateSubscriptionStatus({
  userId,
  providerSubscriptionId,
  paymentProvider,
  status,
  paymentStatus,
  eventId,
  eventType,
  cancelled = false
}) {
  const normalizedUserId =
    normalizeUserId(
      userId
    );

  const subscription =
    await findSubscription({
      providerSubscriptionId,
      paymentProvider,
      userId:
        normalizedUserId
    });

  if (
    !subscription
  ) {
    return {
      success: false,
      found: false
    };
  }

  if (
    hasProcessedEvent(
      subscription,
      eventId
    )
  ) {
    return {
      success: true,
      duplicate: true,
      subscription
    };
  }

  subscription.processedWebhookEvents =
    appendWebhookEvent(
      subscription.processedWebhookEvents,
      eventId
    );

  subscription.lastWebhookEventId =
    eventId || null;

  subscription.lastWebhookEventType =
    eventType || null;

  if (
    status
  ) {
    subscription.status =
      status;
  }

  if (
    paymentStatus
  ) {
    subscription.paymentStatus =
      paymentStatus;
  }

  if (
    cancelled
  ) {
    subscription.cancelledAt =
      new Date();

    subscription.autoRenew =
      false;
  }

  await subscription.save();

  /*
   * Only cancellation/expiry removes the plan mirror.
   */
  if (
    cancelled &&
    normalizedUserId
  ) {
    await User.findByIdAndUpdate(
      normalizedUserId,
      {
        $set: {
          subscriptionPlan:
            "free"
        }
      }
    );
  }

  return {
    success: true,
    duplicate: false,
    found: true,
    subscription
  };
}


/* =========================================================
   STRIPE RAW BODY
========================================================= */

function getStripeRawBody(
  req
) {
  if (
    Buffer.isBuffer(
      req.body
    )
  ) {
    return req.body;
  }

  if (
    Buffer.isBuffer(
      req.rawBody
    )
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


/* =========================================================
   STRIPE WEBHOOK
========================================================= */

async function stripeWebhookController(
  req,
  res
) {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      message:
        "Stripe is not configured"
    });
  }

  const signature =
    req.headers[
      "stripe-signature"
    ];

  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  if (
    !signature ||
    !webhookSecret
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Stripe webhook configuration is incomplete"
    });
  }

  const rawBody =
    getStripeRawBody(
      req
    );

  if (!rawBody) {
    return res.status(400).json({
      success: false,
      message:
        "Stripe raw request body is required"
    });
  }

  let event;

  try {
    event =
      stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
  } catch (error) {
    console.error(
      "Stripe Webhook Signature Error:",
      error?.message ||
        error
    );

    return res.status(400).json({
      success: false,
      message:
        "Invalid Stripe webhook signature"
    });
  }

  const eventId =
    event.id;

  try {

    if (
      await alreadyProcessed(
        eventId
      )
    ) {
      return res.status(200).json({
        success: true,
        duplicate: true
      });
    }

    const object =
      event.data?.object ||
      {};


    /* =====================================================
       CHECKOUT SESSION COMPLETED
    ===================================================== */

    if (
      event.type ===
      "checkout.session.completed"
    ) {
      const metadata =
        object.metadata ||
        {};

      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const planName =
        normalizePlan(
          metadata.plan ||
          metadata.planName
        );

      const billingCycle =
        normalizeCycle(
          metadata.billingCycle ||
          metadata.billing_cycle
        );

      const providerSubscriptionId =
        typeof object.subscription ===
        "string"
          ? object.subscription
          : object.subscription?.id ||
            null;

      if (
        !userId ||
        !planName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Stripe checkout metadata is incomplete"
        });
      }

      const amount =
        minorToMajor(
          object.amount_total
        );

      const result =
        await activateSubscription({
          userId,
          planName,
          billingCycle,
          paymentProvider:
            "stripe",
          paymentId:
            object.payment_intent ||
            null,
          orderId:
            object.id ||
            null,
          providerCustomerId:
            typeof object.customer ===
            "string"
              ? object.customer
              : object.customer?.id ||
                null,
          providerSubscriptionId,
          currency:
            String(
              object.currency ||
                "usd"
            ).toUpperCase(),
          amount,
          eventId,
          eventType:
            event.type,
          renewal: false
        });

      return res.status(200).json({
        success: true,
        event:
          event.type,
        activation:
          result.success,
        duplicate:
          Boolean(
            result.duplicate
          )
      });
    }


    /* =====================================================
       PAYMENT INTENT SUCCEEDED
    ===================================================== */

    if (
      event.type ===
      "payment_intent.succeeded"
    ) {
      const metadata =
        object.metadata ||
        {};

      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const planName =
        normalizePlan(
          metadata.plan ||
          metadata.planName
        );

      const providerSubscriptionId =
        metadata.providerSubscriptionId ||
        metadata.provider_subscription_id ||
        null;

      /*
       * Real recurring Stripe subscriptions should be
       * handled through subscription lifecycle events.
       */
      if (
        providerSubscriptionId
      ) {
        return res.status(200).json({
          success: true,
          ignored: true,
          reason:
            "Subscription PaymentIntent handled by subscription lifecycle"
        });
      }

      if (
        !userId ||
        !planName
      ) {
        return res.status(200).json({
          success: true,
          ignored: true,
          reason:
            "PaymentIntent metadata incomplete"
        });
      }

      const billingCycle =
        normalizeCycle(
          metadata.billingCycle ||
          metadata.billing_cycle
        );

      const amount =
        minorToMajor(
          object.amount_received ??
          object.amount
        );

      const result =
        await activateSubscription({
          userId,
          planName,
          billingCycle,
          paymentProvider:
            "stripe",
          paymentId:
            object.id,
          providerCustomerId:
            typeof object.customer ===
            "string"
              ? object.customer
              : object.customer?.id ||
                null,
          currency:
            String(
              object.currency ||
                "usd"
            ).toUpperCase(),
          amount,
          eventId,
          eventType:
            event.type,
          renewal: false
        });

      return res.status(200).json({
        success: true,
        event:
          event.type,
        activation:
          result.success,
        duplicate:
          Boolean(
            result.duplicate
          )
      });
    }


    /* =====================================================
       INVOICE PAID
    ===================================================== */

    if (
      event.type ===
      "invoice.paid"
    ) {
      const providerSubscriptionId =
        typeof object.subscription ===
        "string"
          ? object.subscription
          : object.subscription?.id ||
            null;

      let providerCustomerId =
        typeof object.customer ===
        "string"
          ? object.customer
          : object.customer?.id ||
            null;

      let metadata =
        object.metadata ||
        {};

      if (
        providerSubscriptionId
      ) {
        try {
          const stripeSubscription =
            await stripe.subscriptions.retrieve(
              providerSubscriptionId
            );

          metadata = {
            ...(
              stripeSubscription.metadata ||
              {}
            ),
            ...metadata
          };

          providerCustomerId =
            providerCustomerId ||
            (
              typeof stripeSubscription.customer ===
              "string"
                ? stripeSubscription.customer
                : stripeSubscription.customer?.id ||
                  null
            );
        } catch (error) {
          console.error(
            "Stripe Subscription Retrieval Error:",
            error?.message ||
              error
          );
        }
      }

      let userId =
        getUserIdFromMetadata(
          metadata
        );

      let planName =
        normalizePlan(
          metadata.plan ||
          metadata.planName
        );

      /*
       * Fallback to existing local subscription.
       */
      let existingSubscription =
        null;

      if (
        !userId ||
        !planName
      ) {
        existingSubscription =
          await findSubscription({
            providerSubscriptionId,
            paymentProvider:
              "stripe"
          });

        if (
          existingSubscription
        ) {
          userId =
            existingSubscription.userId;

          planName =
            normalizePlan(
              existingSubscription.planName
            );
        }
      }

      if (
        !userId ||
        !planName
      ) {
        return res.status(200).json({
          success: true,
          ignored: true,
          reason:
            "Invoice could not identify subscription"
        });
      }

      const billingCycle =
        normalizeCycle(
          metadata.billingCycle ||
          metadata.billing_cycle ||
          existingSubscription?.billingCycle
        );

      const amount =
        minorToMajor(
          object.amount_paid ??
          object.amount_due
        );

      const result =
        await activateSubscription({
          userId,
          planName,
          billingCycle,
          paymentProvider:
            "stripe",
          paymentId:
            object.payment_intent ||
            existingSubscription?.paymentId ||
            null,
          providerCustomerId,
          providerSubscriptionId,
          currency:
            String(
              object.currency ||
                existingSubscription?.currency ||
                "usd"
            ).toUpperCase(),
          amount,
          eventId,
          eventType:
            event.type,
          renewal: true
        });

      return res.status(200).json({
        success: true,
        event:
          event.type,
        activation:
          result.success,
        duplicate:
          Boolean(
            result.duplicate
          ),
        renewed:
          Boolean(
            result.renewed
          )
      });
    }


    /* =====================================================
       INVOICE PAYMENT FAILED
    ===================================================== */

    if (
      event.type ===
      "invoice.payment_failed"
    ) {
      const providerSubscriptionId =
        typeof object.subscription ===
        "string"
          ? object.subscription
          : object.subscription?.id ||
            null;

      const metadata =
        object.metadata ||
        {};

      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const result =
        await updateSubscriptionStatus({
          userId,
          providerSubscriptionId,
          paymentProvider:
            "stripe",
          status:
            "past_due",
          paymentStatus:
            "failed",
          eventId,
          eventType:
            event.type
        });

      return res.status(200).json({
        success: true,
        event:
          event.type,
        updated:
          Boolean(
            result.found
          )
      });
    }


    /* =====================================================
       CUSTOMER SUBSCRIPTION UPDATED
    ===================================================== */

    if (
      event.type ===
      "customer.subscription.updated"
    ) {
      const metadata =
        object.metadata ||
        {};

      const userId =
        getUserIdFromMetadata(
          metadata
        );

      let status =
        "pending";

      let paymentStatus =
        "pending";

      switch (
        object.status
      ) {

        case "active":
          status =
            "active";
          paymentStatus =
            "paid";
          break;

        case "trialing":
          status =
            "active";
          paymentStatus =
            "pending";
          break;

        case "past_due":
          status =
            "past_due";
          paymentStatus =
            "failed";
          break;

        case "unpaid":
          status =
            "past_due";
          paymentStatus =
            "failed";
          break;

        case "canceled":
          status =
            "cancelled";
          paymentStatus =
            "cancelled";
          break;

        case "incomplete":
        case "incomplete_expired":
          status =
            "expired";
          paymentStatus =
            "failed";
          break;

        default:
          status =
            "pending";
      }

      const result =
        await updateSubscriptionStatus({
          userId,
          providerSubscriptionId:
            object.id,
          paymentProvider:
            "stripe",
          status,
          paymentStatus,
          eventId,
          eventType:
            event.type,
          cancelled:
            status ===
            "cancelled"
        });

      return res.status(200).json({
        success: true,
        event:
          event.type,
        updated:
          Boolean(
            result.found
          ),
        duplicate:
          Boolean(
            result.duplicate
          )
      });
    }


    /* =====================================================
       CUSTOMER SUBSCRIPTION DELETED
    ===================================================== */

    if (
      event.type ===
      "customer.subscription.deleted"
    ) {
      const metadata =
        object.metadata ||
        {};

      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const result =
        await updateSubscriptionStatus({
          userId,
          providerSubscriptionId:
            object.id,
          paymentProvider:
            "stripe",
          status:
            "cancelled",
          paymentStatus:
            "cancelled",
          eventId,
          eventType:
            event.type,
          cancelled: true
        });

      return res.status(200).json({
        success: true,
        event:
          event.type,
        cancelled:
          Boolean(
            result.found
          ),
        duplicate:
          Boolean(
            result.duplicate
          )
      });
    }


    /* =====================================================
       UNKNOWN STRIPE EVENT
    ===================================================== */

    return res.status(200).json({
      success: true,
      received: true,
      handled: false,
      event:
        event.type
    });

  } catch (error) {
    console.error(
      "Stripe Webhook Processing Error:",
      error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Stripe webhook processing failed"
    });
  }
}


/* =========================================================
   RAZORPAY RAW BODY
========================================================= */

function getRazorpayRawBody(
  req
) {
  if (
    Buffer.isBuffer(
      req.body
    )
  ) {
    return req.body;
  }

  if (
    Buffer.isBuffer(
      req.rawBody
    )
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


/* =========================================================
   RAZORPAY SIGNATURE
========================================================= */

function verifyRazorpaySignature(
  rawBody,
  signature,
  secret
) {
  if (
    !rawBody ||
    !signature ||
    !secret
  ) {
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
      expected
    );

  const receivedBuffer =
    Buffer.from(
      String(signature)
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
   RAZORPAY BODY
========================================================= */

function parseRazorpayBody(
  req
) {
  if (
    req.body &&
    !Buffer.isBuffer(
      req.body
    ) &&
    typeof req.body ===
      "object"
  ) {
    return req.body;
  }

  const rawBody =
    getRazorpayRawBody(
      req
    );

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(
      rawBody.toString(
        "utf8"
      )
    );
  } catch {
    return null;
  }
}


/* =========================================================
   RAZORPAY WEBHOOK
========================================================= */

async function razorpayWebhookController(
  req,
  res
) {
  const secret =
    process.env.RAZORPAY_WEBHOOK_SECRET;

  const signature =
    req.headers[
      "x-razorpay-signature"
    ];

  if (
    !secret ||
    !signature
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Razorpay webhook configuration is incomplete"
    });
  }

  const rawBody =
    getRazorpayRawBody(
      req
    );

  if (!rawBody) {
    return res.status(400).json({
      success: false,
      message:
        "Razorpay raw request body is required"
    });
  }

  const validSignature =
    verifyRazorpaySignature(
      rawBody,
      signature,
      secret
    );

  if (!validSignature) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid Razorpay webhook signature"
    });
  }

  const payload =
    parseRazorpayBody(
      req
    );

  if (!payload) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid Razorpay webhook payload"
    });
  }

  const eventType =
    payload.event ||
    payload.type ||
    null;

  const paymentEntity =
    payload.payload?.payment?.entity ||
    {};

  const orderEntity =
    payload.payload?.order?.entity ||
    {};

  const subscriptionEntity =
    payload.payload?.subscription?.entity ||
    {};

  const paymentId =
    paymentEntity.id ||
    null;

  const orderId =
    paymentEntity.order_id ||
    orderEntity.id ||
    null;

  const providerSubscriptionId =
    subscriptionEntity.id ||
    paymentEntity.subscription_id ||
    null;

  const metadata =
    paymentEntity.notes ||
    subscriptionEntity.notes ||
    orderEntity.notes ||
    {};

  const eventId =
    payload.id ||
    `${eventType || "razorpay"}:${paymentId || orderId || providerSubscriptionId || Date.now()}`;

  try {

    if (
      await alreadyProcessed(
        eventId
      )
    ) {
      return res.status(200).json({
        success: true,
        duplicate: true
      });
    }


    /* =====================================================
       PAYMENT CAPTURED
    ===================================================== */

    if (
      eventType ===
        "payment.captured" ||
      eventType ===
        "order.paid"
    ) {
      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const planName =
        normalizePlan(
          metadata.plan ||
          metadata.planName
        );

      if (
        !userId ||
        !planName
      ) {
        return res.status(200).json({
          success: true,
          ignored: true,
          reason:
            "Razorpay payment metadata incomplete"
        });
      }

      const billingCycle =
        normalizeCycle(
          metadata.billingCycle ||
          metadata.billing_cycle
        );

      const amount =
        minorToMajor(
          paymentEntity.amount
        );

      const currency =
        String(
          paymentEntity.currency ||
            "USD"
        ).toUpperCase();

      /*
       * Current ZyrionOS catalog is USD.
       */
      if (
        currency !== "USD"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Razorpay currency is not configured for the current ZyrionOS catalog"
        });
      }

      const result =
        await activateSubscription({
          userId,
          planName,
          billingCycle,
          paymentProvider:
            "razorpay",
          paymentId,
          orderId,
          providerCustomerId:
            paymentEntity.customer_id ||
            null,
          providerSubscriptionId,
          currency,
          amount,
          eventId,
          eventType,
          renewal: false
        });

      return res.status(200).json({
        success: true,
        event:
          eventType,
        activation:
          result.success,
        duplicate:
          Boolean(
            result.duplicate
          )
      });
    }


    /* =====================================================
       PAYMENT FAILED
    ===================================================== */

    if (
      eventType ===
      "payment.failed"
    ) {
      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const result =
        await updateSubscriptionStatus({
          userId,
          providerSubscriptionId,
          paymentProvider:
            "razorpay",
          status:
            "past_due",
          paymentStatus:
            "failed",
          eventId,
          eventType
        });

      return res.status(200).json({
        success: true,
        event:
          eventType,
        updated:
          Boolean(
            result.found
          )
      });
    }


    /* =====================================================
       SUBSCRIPTION ACTIVATED
    ===================================================== */

    if (
      eventType ===
      "subscription.activated"
    ) {
      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const planName =
        normalizePlan(
          metadata.plan ||
          metadata.planName
        );

      if (
        !userId ||
        !planName
      ) {
        return res.status(200).json({
          success: true,
          ignored: true,
          reason:
            "Razorpay subscription metadata incomplete"
        });
      }

      const billingCycle =
        normalizeCycle(
          metadata.billingCycle ||
          metadata.billing_cycle
        );

      const amount =
        minorToMajor(
          subscriptionEntity.amount
        );

      const currency =
        String(
          subscriptionEntity.currency ||
            "USD"
        ).toUpperCase();

      if (
        currency !== "USD"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Razorpay currency is not configured for the current ZyrionOS catalog"
        });
      }

      const result =
        await activateSubscription({
          userId,
          planName,
          billingCycle,
          paymentProvider:
            "razorpay",
          paymentId,
          orderId,
          providerCustomerId:
            subscriptionEntity.customer_id ||
            null,
          providerSubscriptionId,
          currency,
          amount,
          eventId,
          eventType,
          renewal: false
        });

      return res.status(200).json({
        success: true,
        event:
          eventType,
        activation:
          result.success,
        duplicate:
          Boolean(
            result.duplicate
          )
      });
    }


    /* =====================================================
       SUBSCRIPTION HALTED
    ===================================================== */

    if (
      eventType ===
      "subscription.halted"
    ) {
      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const result =
        await updateSubscriptionStatus({
          userId,
          providerSubscriptionId,
          paymentProvider:
            "razorpay",
          status:
            "past_due",
          paymentStatus:
            "failed",
          eventId,
          eventType
        });

      return res.status(200).json({
        success: true,
        event:
          eventType,
        updated:
          Boolean(
            result.found
          )
      });
    }


    /* =====================================================
       SUBSCRIPTION CANCELLED / COMPLETED
    ===================================================== */

    if (
      eventType ===
        "subscription.cancelled" ||
      eventType ===
        "subscription.completed"
    ) {
      const userId =
        getUserIdFromMetadata(
          metadata
        );

      const result =
        await updateSubscriptionStatus({
          userId,
          providerSubscriptionId,
          paymentProvider:
            "razorpay",
          status:
            "cancelled",
          paymentStatus:
            "cancelled",
          eventId,
          eventType,
          cancelled: true
        });

      return res.status(200).json({
        success: true,
        event:
          eventType,
        cancelled:
          Boolean(
            result.found
          )
      });
    }


    /* =====================================================
       UNKNOWN RAZORPAY EVENT
    ===================================================== */

    return res.status(200).json({
      success: true,
      received: true,
      handled: false,
      event:
        eventType
    });

  } catch (error) {
    console.error(
      "Razorpay Webhook Processing Error:",
      error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Razorpay webhook processing failed"
    });
  }
}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  stripeWebhookController,
  razorpayWebhookController
};
