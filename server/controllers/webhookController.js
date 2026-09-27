/* =========================================================
   ZyrionOS PAYMENT WEBHOOK CONTROLLER v2.0.0

   Responsibilities:
   - Verify Stripe webhooks
   - Verify Razorpay webhooks
   - Resolve user / plan / billing context
   - Validate provider payment data
   - Activate paid subscriptions
   - Process renewals
   - Process failed payments
   - Process cancellations
   - Maintain webhook idempotency
   - Persist official Billing Agent entitlements
   - Keep User plan mirror synchronized

   IMPORTANT:
   - Frontend payment success is NEVER trusted.
   - Client supplied price is NEVER authoritative.
   - Billing Agent is the authoritative entitlement source.
   - Provider webhook signature must be verified first.
   - Subscription activation happens only after verified
     provider events.
   - Webhook events must be idempotent.
   - No automatic USD <-> INR conversion is performed.
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const crypto =
  require("crypto");


/* =========================================================
   MODELS
========================================================= */

const Subscription =
  require("../models/subscriptionModel");

const User =
  require("../models/userModel");


/* =========================================================
   AGENTS
========================================================= */

const billingAgent =
  require("../agents/billingAgent");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   STRIPE
========================================================= */

let stripe = null;


if (
  process.env.STRIPE_SECRET_KEY
) {

  const Stripe =
    require("stripe");


  stripe =
    new Stripe(
      process.env.STRIPE_SECRET_KEY
    );

}


/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_PLANS =
  Object.freeze([

    "Starter",
    "Pro",
    "Business",
    "Scale",
    "Enterprise"

  ]);


const ALLOWED_CYCLES =
  Object.freeze([

    "monthly",
    "yearly"

  ]);


const ALLOWED_PROVIDERS =
  Object.freeze([

    "stripe",
    "razorpay"

  ]);


const MAX_WEBHOOK_EVENTS =
  100;


/* =========================================================
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  const plans = {

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
    plans[normalized] ||
    null
  );

}


/* =========================================================
   BILLING CYCLE
========================================================= */

function normalizeCycle(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return "monthly";

  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  return ALLOWED_CYCLES.includes(
    normalized
  )
    ? normalized
    : "monthly";

}


/* =========================================================
   PROVIDER
========================================================= */

function normalizeProvider(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  return ALLOWED_PROVIDERS.includes(
    normalized
  )
    ? normalized
    : null;

}


/* =========================================================
   CURRENCY
========================================================= */

function normalizeCurrency(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }


  const normalized =
    value
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
   USER ID
========================================================= */

function normalizeUserId(
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


  if (
    typeof value ===
    "string"
  ) {

    return (
      value.trim() ||
      null
    );

  }


  if (
    typeof value ===
      "number"
  ) {

    return String(
      value
    );

  }


  if (
    typeof value ===
      "object" &&
    typeof value.toString ===
      "function"
  ) {

    const result =
      value.toString();


    return (
      result &&
      result !==
        "[object Object]"
    )
      ? result
      : null;

  }


  return null;

}


/* =========================================================
   METADATA USER
========================================================= */

function getUserIdFromMetadata(
  metadata = {}
) {

  return normalizeUserId(

    metadata.userId ||
    metadata.user_id ||
    metadata.uid ||
    metadata.user ||
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

  const date =
    new Date(
      startDate
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;

  }


  if (
    billingCycle ===
    "yearly"
  ) {

    date.setUTCFullYear(
      date.getUTCFullYear() +
        1
    );

  }

  else {

    date.setUTCMonth(
      date.getUTCMonth() +
        1
    );

  }


  return date;

}


/* =========================================================
   RENEWED EXPIRY
========================================================= */

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

    baseDate =
      now;

  }


  if (
    baseDate <
    now
  ) {

    baseDate =
      now;

  }


  return getExpiryDate(
    billingCycle,
    baseDate
  );

}


/* =========================================================
   MINOR -> MAJOR
========================================================= */

function minorToMajor(
  amount
) {

  if (
    amount ===
      null ||
    amount ===
      undefined
  ) {

    return null;

  }


  const numeric =
    Number(
      amount
    );


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
   BILLING PLAN RESOLUTION
========================================================= */

/*
 * Billing Agent is the ONLY pricing / entitlement source.
 *
 * No duplicate hard-coded price catalog here.
 */

async function resolveBillingPlan({
  userId,
  planName,
  billingCycle
}) {

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


  const billing =
    await billingAgent({

      userId,

      plan:
        normalizedPlan,

      billingCycle:
        cycle

    });


  if (
    !billing ||
    billing.success !==
      true
  ) {

    throw new Error(
      billing?.error ||
      billing?.message ||
      "Billing Agent failed to resolve plan"
    );

  }


  const billingData =
    billing.billing ||
    {};


  const selectedPlan =
    billingData.selectedPlan;


  if (
    !selectedPlan
  ) {

    throw new Error(
      "Billing Agent returned no selected plan"
    );

  }


  const amount =
    Number(
      billingData.amount ??
      selectedPlan.amount
    );


  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {

    throw new Error(
      "Billing Agent returned invalid plan price"
    );

  }


  const currency =
    normalizeCurrency(
      selectedPlan.currency ||
      billingData.currency ||
      "USD"
    );


  if (
    !currency
  ) {

    throw new Error(
      "Billing Agent returned invalid plan currency"
    );

  }


  return {

    billing,

    billingData,

    selectedPlan,

    amount,

    currency,

    billingCycle:
      cycle,

    planName:
      normalizedPlan

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


  if (
    !plan
  ) {

    throw new Error(
      `Billing plan not found: ${planName}`
    );

  }


  return plan;

}


/* =========================================================
   BUILD ENTITLEMENTS
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
        plan.ram ??
        null,

      cpu:
        plan.cpu ??
        null,

      storage:
        plan.storage ??
        null,

      bandwidth:
        plan.bandwidth ??
        null

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
        ? [
            ...plan.features
          ]
        : [],

    support:
      plan.support ||
      "Community Support"

  };

}


/* =========================================================
   PAYMENT AMOUNT VALIDATION
========================================================= */

function validatePaymentAmount({
  configuredAmount,
  receivedAmount,
  allowMissing = false
}) {

  if (
    receivedAmount ===
      null ||
    receivedAmount ===
      undefined
  ) {

    return {

      valid:
        allowMissing,

      reason:
        allowMissing
          ? null
          : "PAYMENT_AMOUNT_MISSING"

    };

  }


  const expected =
    Number(
      configuredAmount
    );


  const received =
    Number(
      receivedAmount
    );


  if (
    !Number.isFinite(
      expected
    ) ||
    !Number.isFinite(
      received
    )
  ) {

    return {

      valid:
        false,

      reason:
        "INVALID_PAYMENT_AMOUNT"

    };

  }


  /*
   * Money comparison at cent precision.
   */

  const expectedMinor =
    Math.round(
      expected * 100
    );


  const receivedMinor =
    Math.round(
      received * 100
    );


  if (
    expectedMinor !==
    receivedMinor
  ) {

    return {

      valid:
        false,

      reason:
        "PAYMENT_AMOUNT_MISMATCH",

      expected,

      received

    };

  }


  return {

    valid:
      true,

    expected,

    received

  };

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
      ? [
          ...existingEvents
        ]
      : [];


  if (
    eventId &&
    !events.includes(
      eventId
    )
  ) {

    events.push(
      eventId
    );

  }


  if (
    events.length >
    MAX_WEBHOOK_EVENTS
  ) {

    return events.slice(
      events.length -
        MAX_WEBHOOK_EVENTS
    );

  }


  return events;

}


/* =========================================================
   EVENT ALREADY PROCESSED
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
  ) &&
    subscription.processedWebhookEvents.includes(
      eventId
    );

}


/* =========================================================
   GLOBAL WEBHOOK EVENT CHECK
========================================================= */

/*
 * NOTE:
 * Existing Subscription schema may not have a dedicated
 * WebhookEvent collection.
 *
 * We therefore retain compatibility with the current
 * processedWebhookEvents field.
 */

async function alreadyProcessed(
  eventId
) {

  if (
    !eventId
  ) {

    return false;

  }


  const existing =
    await Subscription
      .findOne({

        processedWebhookEvents:
          eventId

      })
      .select(
        "_id"
      )
      .lean();


  return Boolean(
    existing
  );

}


/* =========================================================
   FIND SUBSCRIPTION
========================================================= */

async function findSubscription({
  providerSubscriptionId,
  paymentProvider,
  paymentId,
  orderId,
  userId
}) {

  const provider =
    normalizeProvider(
      paymentProvider
    );


  if (
    providerSubscriptionId &&
    provider
  ) {

    const subscription =
      await Subscription.findOne({

        providerSubscriptionId,

        paymentProvider:
          provider

      });


    if (
      subscription
    ) {

      return subscription;

    }

  }


  if (
    paymentId &&
    provider
  ) {

    const subscription =
      await Subscription.findOne({

        paymentId,

        paymentProvider:
          provider

      });


    if (
      subscription
    ) {

      return subscription;

    }

  }


  if (
    orderId &&
    provider
  ) {

    const subscription =
      await Subscription.findOne({

        orderId,

        paymentProvider:
          provider

      });


    if (
      subscription
    ) {

      return subscription;

    }

  }


  /*
   * User fallback is intentionally limited to active
   * subscriptions. This prevents unrelated historical
   * subscriptions from being selected.
   */

  if (
    userId &&
    provider
  ) {

    return Subscription
      .findOne({

        userId,

        paymentProvider:
          provider,

        status:
          "active"

      })
      .sort({

        createdAt:
          -1

      });

  }


  return null;

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
   RESET USER PLAN
========================================================= */

async function resetUserPlanIfNoActiveSubscription(
  userId
) {

  const normalizedUserId =
    normalizeUserId(
      userId
    );


  if (
    !normalizedUserId
  ) {

    return;

  }


  const active =
    await Subscription
      .findOne({

        userId:
          normalizedUserId,

        status:
          "active"

      })
      .select(
        "_id"
      )
      .lean();


  if (
    active
  ) {

    return;

  }


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
  currency,
  amount = null,
  eventId,
  eventType,
  renewal = false
}) {

  const normalizedUserId =
    normalizeUserId(
      userId
    );


  const provider =
    normalizeProvider(
      paymentProvider
    );


  if (
    !normalizedUserId
  ) {

    throw new Error(
      "Subscription activation requires userId"
    );

  }


  if (
    !provider
  ) {

    throw new Error(
      "Subscription activation requires a valid payment provider"
    );

  }


  const {
    billingData,
    amount:
      configuredAmount,
    currency:
      configuredCurrency,
    billingCycle:
      cycle,
    planName:
      normalizedPlan
  } =
    await resolveBillingPlan({

      userId:
        normalizedUserId,

      planName,

      billingCycle

    });


  const receivedCurrency =
    normalizeCurrency(
      currency
    );


  if (
    !receivedCurrency
  ) {

    throw new Error(
      "Provider payment currency is missing or invalid"
    );

  }


  /*
   * Provider currency must match the Billing Agent.
   *
   * No automatic conversion.
   */

  if (
    receivedCurrency !==
    configuredCurrency
  ) {

    throw new Error(
      `Payment currency mismatch: expected ${configuredCurrency}, received ${receivedCurrency}`
    );

  }


  const amountValidation =
    validatePaymentAmount({

      configuredAmount,

      receivedAmount:
        amount,

      /*
       * Provider subscription lifecycle events can omit
       * the amount. The plan itself is already resolved
       * from Billing Agent.
       */
      allowMissing:
        Boolean(
          providerSubscriptionId
        )

    });


  if (
    !amountValidation.valid
  ) {

    throw new Error(
      `Payment validation failed: ${amountValidation.reason}`
    );

  }


  const plan =
    getPlanEntitlements(
      normalizedPlan
    );


  const entitlementData =
    buildEntitlementData(
      plan
    );


  /*
   * Find existing record.
   */

  let subscription =
    await findSubscription({

      providerSubscriptionId,

      paymentProvider:
        provider,

      paymentId,

      orderId,

      userId:
        normalizedUserId

    });


  /*
   * Exact webhook idempotency.
   */

  if (
    hasProcessedEvent(
      subscription,
      eventId
    )
  ) {

    return {

      success:
        true,

      duplicate:
        true,

      subscription

    };

  }


  /*
   * Global webhook idempotency.
   */

  if (
    !subscription &&
    await alreadyProcessed(
      eventId
    )
  ) {

    return {

      success:
        true,

      duplicate:
        true

    };

  }


  const now =
    new Date();


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

  else {

    expiryDate =
      getExpiryDate(

        cycle,

        now

      );

  }


  /*
   * Existing usage.
   */

  const previousUsage =
    subscription?.usage ||
    {};


  const usage =
    renewal
      ? {

          aiRequestsUsed:
            0,

          aiCreditsUsed:
            0,

          deploymentsUsed:
            0,

          thumbnailsGenerated:
            0,

          videoCreditsUsed:
            0

        }
      : {

          aiRequestsUsed:
            Number(
              previousUsage.aiRequestsUsed ??
              0
            ),

          aiCreditsUsed:
            Number(
              previousUsage.aiCreditsUsed ??
              0
            ),

          deploymentsUsed:
            Number(
              previousUsage.deploymentsUsed ??
              0
            ),

          thumbnailsGenerated:
            Number(
              previousUsage.thumbnailsGenerated ??
              0
            ),

          videoCreditsUsed:
            Number(
              previousUsage.videoCreditsUsed ??
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
   * UPDATE DATA
   * =======================================================
   */

  const updateData = {

    userId:
      normalizedUserId,

    planName:
      normalizedPlan,

    price:
      configuredAmount,

    currency:
      configuredCurrency,

    paymentProvider:
      provider,

    paymentStatus:
      "paid",

    status:
      "active",

    billingCycle:
      cycle,

    startDate:
      subscription?.startDate ||
      now,

    expiryDate,

    autoRenew:
      true,

    usage,

    /*
     * Entitlements
     */

    deploymentsLimit:
      entitlementData.deploymentsLimit,

    aiCreditsLimit:
      entitlementData.aiCreditsLimit,

    thumbnailCreditsLimit:
      entitlementData.thumbnailCreditsLimit,

    videoCreditsLimit:
      entitlementData.videoCreditsLimit,

    infrastructure:
      entitlementData.infrastructure,

    featureFlags:
      entitlementData.featureFlags,

    features:
      entitlementData.features,

    support:
      entitlementData.support,

    /*
     * Webhook audit
     */

    processedWebhookEvents:
      processedEvents,

    lastWebhookEventId:
      eventId ||
      null,

    lastWebhookEventType:
      eventType ||
      null

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
   * Existing record.
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
   * New record.
   */

  else {

    subscription =
      await Subscription.create(
        updateData
      );

  }


  /*
   * User model receives only the current plan mirror.
   */

  await updateUserPlan(

    normalizedUserId,

    normalizedPlan

  );


  return {

    success:
      true,

    duplicate:
      false,

    renewed:
      Boolean(
        renewal
      ),

    created:
      !Boolean(
        subscription?.isNew
      ),

    subscription,

    billingId:
      billingData?.billingId ||
      null

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


  const provider =
    normalizeProvider(
      paymentProvider
    );


  if (
    !provider
  ) {

    return {

      success:
        false,

      found:
        false,

      error:
        "Invalid payment provider"

    };

  }


  let subscription =
    await findSubscription({

      providerSubscriptionId,

      paymentProvider:
        provider,

      userId:
        normalizedUserId

    });


  /*
   * Some webhook events may not carry userId in metadata.
   *
   * Provider subscription ID must therefore be enough
   * to locate the local subscription.
   */

  if (
    !subscription &&
    providerSubscriptionId
  ) {

    subscription =
      await Subscription.findOne({

        providerSubscriptionId,

        paymentProvider:
          provider

      });

  }


  if (
    !subscription
  ) {

    return {

      success:
        false,

      found:
        false

    };

  }


  if (
    hasProcessedEvent(
      subscription,
      eventId
    )
  ) {

    return {

      success:
        true,

      duplicate:
        true,

      found:
        true,

      subscription

    };

  }


  subscription.processedWebhookEvents =
    appendWebhookEvent(

      subscription.processedWebhookEvents,

      eventId

    );


  subscription.lastWebhookEventId =
    eventId ||
    null;


  subscription.lastWebhookEventType =
    eventType ||
    null;


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


  if (
    cancelled
  ) {

    await resetUserPlanIfNoActiveSubscription(
      subscription.userId
    );

  }


  return {

    success:
      true,

    duplicate:
      false,

    found:
      true,

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
      req.rawBody,
      "utf8"
    );

  }


  return null;

}


/* =========================================================
   STRIPE WEBHOOK CONTROLLER
========================================================= */

async function stripeWebhookController(
  req,
  res
) {

  if (
    !stripe
  ) {

    return res
      .status(503)
      .json({

        success:
          false,

        message:
          "Stripe is not configured"

      });

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
      .json({

        success:
          false,

        message:
          "Stripe webhook configuration is incomplete"

      });

  }


  const rawBody =
    getStripeRawBody(
      req
    );


  if (
    !rawBody
  ) {

    return res
      .status(400)
      .json({

        success:
          false,

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

  }

  catch (error) {

    logger.error(
      `Stripe webhook signature verification failed: ${error?.message || error}`
    );


    return res
      .status(400)
      .json({

        success:
          false,

        message:
          "Invalid Stripe webhook signature"

      });

  }


  const eventId =
    event.id;


  try {

    /*
     * Global idempotency before processing.
     */

    if (
      await alreadyProcessed(
        eventId
      )
    ) {

      return res
        .status(200)
        .json({

          success:
            true,

          duplicate:
            true

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

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

            reason:
              "Stripe checkout metadata incomplete"

          });

      }


      /*
       * Only paid checkout sessions may activate.
       */

      if (
        object.payment_status &&
        object.payment_status !==
          "paid"
      ) {

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

            reason:
              "Stripe checkout payment is not paid"

          });

      }


      const amount =
        minorToMajor(
          object.amount_total
        );


      const currency =
        normalizeCurrency(
          object.currency ||
          "USD"
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

          currency,

          amount,

          eventId,

          eventType:
            event.type,

          renewal:
            false

        });


      return res
        .status(200)
        .json({

          success:
            true,

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


      /*
       * Recurring Stripe subscriptions should be controlled
       * by invoice/subscription lifecycle events.
       */

      const providerSubscriptionId =
        metadata.providerSubscriptionId ||
        metadata.provider_subscription_id ||
        null;


      if (
        providerSubscriptionId
      ) {

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

            reason:
              "Recurring subscription payment handled by subscription lifecycle events"

          });

      }


      if (
        !userId ||
        !planName
      ) {

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

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


      const currency =
        normalizeCurrency(
          object.currency ||
          "USD"
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

          currency,

          amount,

          eventId,

          eventType:
            event.type,

          renewal:
            false

        });


      return res
        .status(200)
        .json({

          success:
            true,

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


      /*
       * Fetch Stripe subscription metadata when available.
       */

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

        }

        catch (error) {

          logger.error(
            `Stripe subscription lookup failed: ${error?.message || error}`
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


      let existingSubscription =
        null;


      /*
       * Local DB fallback.
       */

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

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

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


      const currency =
        normalizeCurrency(

          object.currency ||
          existingSubscription?.currency ||
          "USD"

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

          currency,

          amount,

          eventId,

          eventType:
            event.type,

          renewal:
            true

        });


      return res
        .status(200)
        .json({

          success:
            true,

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


      return res
        .status(200)
        .json({

          success:
            true,

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
       STRIPE SUBSCRIPTION UPDATED
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


      return res
        .status(200)
        .json({

          success:
            true,

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
       STRIPE SUBSCRIPTION DELETED
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

          cancelled:
            true

        });


      return res
        .status(200)
        .json({

          success:
            true,

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


    /*
     * Unknown but correctly signed Stripe event.
     *
     * Return 200 so Stripe does not endlessly retry an
     * event that ZyrionOS intentionally does not consume.
     */

    return res
      .status(200)
      .json({

        success:
          true,

        received:
          true,

        handled:
          false,

        event:
          event.type

      });

  }

  catch (error) {

    logger.error(
      `Stripe webhook processing failed: ${error?.message || error}`
    );


    return res
      .status(500)
      .json({

        success:
          false,

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
      req.rawBody,
      "utf8"
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
      .update(
        rawBody
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
      String(
        signature
      ),
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
   RAZORPAY PAYLOAD
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


  if (
    !rawBody
  ) {

    return null;

  }


  try {

    return JSON.parse(
      rawBody.toString(
        "utf8"
      )
    );

  }

  catch {

    return null;

  }

}


/* =========================================================
   RAZORPAY WEBHOOK CONTROLLER
========================================================= */

async function razorpayWebhookController(
  req,
  res
) {

  const secret =
    process.env
      .RAZORPAY_WEBHOOK_SECRET;


  const signature =
    req.headers[
      "x-razorpay-signature"
    ];


  if (
    !secret ||
    !signature
  ) {

    return res
      .status(400)
      .json({

        success:
          false,

        message:
          "Razorpay webhook configuration is incomplete"

      });

  }


  const rawBody =
    getRazorpayRawBody(
      req
    );


  if (
    !rawBody
  ) {

    return res
      .status(400)
      .json({

        success:
          false,

        message:
          "Razorpay raw request body is required"

      });

  }


  if (
    !verifyRazorpaySignature(

      rawBody,

      signature,

      secret

    )
  ) {

    logger.error(
      "Razorpay webhook signature verification failed"
    );


    return res
      .status(400)
      .json({

        success:
          false,

        message:
          "Invalid Razorpay webhook signature"

      });

  }


  const payload =
    parseRazorpayBody(
      req
    );


  if (
    !payload
  ) {

    return res
      .status(400)
      .json({

        success:
          false,

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
    crypto
      .createHash(
        "sha256"
      )
      .update(
        rawBody
      )
      .digest(
        "hex"
      );


  try {

    /*
     * Global idempotency.
     */

    if (
      await alreadyProcessed(
        eventId
      )
    ) {

      return res
        .status(200)
        .json({

          success:
            true,

          duplicate:
            true

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

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

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
        normalizeCurrency(

          paymentEntity.currency

        );


      if (
        !currency
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Razorpay payment currency is missing"

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

          renewal:
            false

        });


      return res
        .status(200)
        .json({

          success:
            true,

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


      return res
        .status(200)
        .json({

          success:
            true,

          event:
            eventType,

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

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

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
        normalizeCurrency(

          subscriptionEntity.currency

        );


      if (
        !currency
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Razorpay subscription currency is missing"

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

          renewal:
            false

        });


      return res
        .status(200)
        .json({

          success:
            true,

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
       SUBSCRIPTION CHARGED
    ===================================================== */

    if (
      eventType ===
      "subscription.charged"
    ) {

      const userId =
        getUserIdFromMetadata(
          metadata
        );


      let planName =
        normalizePlan(

          metadata.plan ||
          metadata.planName

        );


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
              "razorpay"

          });


        if (
          existingSubscription
        ) {

          planName =
            normalizePlan(
              existingSubscription.planName
            );

        }

      }


      const resolvedUserId =
        userId ||
        normalizeUserId(
          existingSubscription?.userId
        );


      if (
        !resolvedUserId ||
        !planName
      ) {

        return res
          .status(200)
          .json({

            success:
              true,

            handled:
              false,

            reason:
              "Razorpay subscription charge could not identify subscription"

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

          paymentEntity.amount ??
          subscriptionEntity.amount

        );


      const currency =
        normalizeCurrency(

          paymentEntity.currency ||
          subscriptionEntity.currency

        );


      if (
        !currency
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "Razorpay subscription charge currency is missing"

          });

      }


      const result =
        await activateSubscription({

          userId:
            resolvedUserId,

          planName,

          billingCycle,

          paymentProvider:
            "razorpay",

          paymentId,

          orderId,

          providerCustomerId:
            subscriptionEntity.customer_id ||
            paymentEntity.customer_id ||
            null,

          providerSubscriptionId,

          currency,

          amount,

          eventId,

          eventType,

          renewal:
            true

        });


      return res
        .status(200)
        .json({

          success:
            true,

          event:
            eventType,

          activation:
            result.success,

          renewed:
            Boolean(
              result.renewed
            ),

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


      return res
        .status(200)
        .json({

          success:
            true,

          event:
            eventType,

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
       SUBSCRIPTION CANCELLED
    ===================================================== */

    if (
      eventType ===
      "subscription.cancelled"
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

          cancelled:
            true

        });


      return res
        .status(200)
        .json({

          success:
            true,

          event:
            eventType,

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
       SUBSCRIPTION COMPLETED
    ===================================================== */

    if (
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
            "expired",

          paymentStatus:
            "completed",

          eventId,

          eventType,

          cancelled:
            true

        });


      return res
        .status(200)
        .json({

          success:
            true,

          event:
            eventType,

          completed:
            Boolean(
              result.found
            ),

          duplicate:
            Boolean(
              result.duplicate
            )

        });

    }


    /*
     * Unknown signed event.
     */

    return res
      .status(200)
      .json({

        success:
          true,

        received:
          true,

        handled:
          false,

        event:
          eventType

      });

  }

  catch (error) {

    logger.error(
      `Razorpay webhook processing failed: ${error?.message || error}`
    );


    return res
      .status(500)
      .json({

        success:
          false,

        message:
          "Razorpay webhook processing failed"

      });

  }

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  stripeWebhookController,

  razorpayWebhookController,

  normalizePlan,

  normalizeCycle,

  normalizeProvider,

  normalizeCurrency,

  resolveBillingPlan,

  activateSubscription,

  updateSubscriptionStatus,

  verifyRazorpaySignature

};
