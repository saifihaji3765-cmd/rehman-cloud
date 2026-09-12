const crypto =
  require("crypto");

const Stripe =
  require("stripe");

const Subscription =
  require("../models/subscriptionModel");

const User =
  require("../models/userModel");

const formatResponse =
  require("../utils/formatResponse");

const logger =
  require("../services/loggerService");


/* =========================================================
   CONFIGURATION
========================================================= */

const stripe =
  process.env.STRIPE_SECRET_KEY
    ? new Stripe(
        process.env.STRIPE_SECRET_KEY
      )
    : null;


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
   HELPERS
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

  return (
    plans[value] ||
    null
  );

}


function normalizeCycle(
  cycle
) {

  return cycle === "yearly"
    ? "yearly"
    : "monthly";

}


function expectedPrice(
  plan,
  cycle
) {

  const data =
    PLAN_CATALOG[plan];

  if (!data) {
    return null;
  }

  return data[cycle];

}


function getUserIdFromRequest(
  req
) {

  return (
    req?.user?.id ||
    req?.user?._id ||
    req?.user?.userId ||
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

  const expiry =
    new Date(startDate);

  if (
    billingCycle ===
    "yearly"
  ) {

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


/* =========================================================
   SAFE PAYMENT AMOUNT
========================================================= */

function normalizeProviderAmount(
  amount
) {

  const numeric =
    Number(amount);

  if (
    !Number.isFinite(numeric)
  ) {
    return null;
  }

  /*
   * Provider webhook amounts are normally in
   * minor currency units.
   */

  return numeric / 100;

}


/* =========================================================
   PLAN VALIDATION
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
      reason:
        "Unknown plan"
    };
  }

  const normalizedCycle =
    normalizeCycle(cycle);

  const expected =
    expectedPrice(
      normalizedPlan,
      normalizedCycle
    );

  if (
    expected === null
  ) {
    return {
      valid: false,
      reason:
        "Unable to resolve plan price"
    };
  }

  const received =
    Number(amount);

  if (
    !Number.isFinite(received)
  ) {
    return {
      valid: false,
      reason:
        "Invalid payment amount"
    };
  }

  /*
   * Exact pricing validation.
   *
   * No silent conversion between INR and USD.
   */

  if (
    received !== expected
  ) {
    return {
      valid: false,

      reason:
        "Payment amount does not match configured plan",

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
   ATOMIC WEBHOOK IDEMPOTENCY
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
      subscriptionPlan:
        planName.toLowerCase()
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
    normalizePlan(
      planName
    );

  if (!normalizedPlan) {
    throw new Error(
      "Webhook contains an invalid plan"
    );
  }

  const cycle =
    normalizeCycle(
      billingCycle
    );

  const validation =
    validatePlanAmount(
      normalizedPlan,
      cycle,
      Number(amount)
    );

  if (
    !validation.valid
  ) {
    throw new Error(
      validation.reason
    );
  }


  const now =
    new Date();


  /*
   * Existing provider subscription takes priority.
   */

  let subscription = null;


  if (
    providerSubscriptionId
  ) {

    subscription =
      await Subscription.findOne({
        providerSubscriptionId
      });

  }


  /*
   * Fallback to provider payment/order.
   */

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


  /*
   * Fallback to active user's subscription.
   */

  if (
    !subscription
  ) {

    subscription =
      await Subscription.findOne({
        userId,

        status:
          "active"

      })
      .sort({
        createdAt:
          -1
      });

  }


  const startDate =
    subscription?.startDate &&
    subscription.status ===
      "active"

      ? subscription.startDate

      : now;


  const expiryDate =
    getExpiryDate(
      cycle,
      startDate
    );


  const update = {

    userId,

    planName:
      normalizedPlan,

    price:
      validation.amount,

    currency:
      String(
        currency ||
        "USD"
      ).toUpperCase(),

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

    lastWebhookEventId:
      eventId ||
      "",

    lastWebhookEventType:
      eventType ||
      "",

    $addToSet: {
      processedWebhookEvents:
        eventId
          ? eventId
          : undefined
    }

  };


  /*
   * Remove undefined $addToSet.
   */

  if (
    !eventId
  ) {
    delete update.$addToSet;
  }


  if (
    subscription
  ) {

    Object.assign(
      subscription,
      {
        ...update
      }
    );

    if (
      eventId &&
      !subscription.processedWebhookEvents.includes(
        eventId
      )
    ) {

      subscription.processedWebhookEvents.push(
        eventId
      );

    }

    subscription.status =
      "active";

    subscription.paymentStatus =
      "paid";

    subscription.planName =
      normalizedPlan;

    subscription.price =
      validation.amount;

    subscription.currency =
      String(
        currency ||
        "USD"
      ).toUpperCase();

    subscription.billingCycle =
      cycle;

    subscription.expiryDate =
      expiryDate;

    subscription.autoRenew =
      true;

    subscription.lastWebhookEventId =
      eventId ||
      subscription.lastWebhookEventId;

    subscription.lastWebhookEventType =
      eventType ||
      subscription.lastWebhookEventType;

    await subscription.save();

  } else {

    const data = {

      userId,

      planName:
        normalizedPlan,

      price:
        validation.amount,

      currency:
        String(
          currency ||
          "USD"
        ).toUpperCase(),

      paymentProvider,

      paymentId:
        paymentId ||
        "",

      orderId:
        orderId ||
        "",

      providerCustomerId:
        providerCustomerId ||
        "",

      providerSubscriptionId:
        providerSubscriptionId ||
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
        eventId
          ? [eventId]
          : [],

      lastWebhookEventId:
        eventId ||
        "",

      lastWebhookEventType:
        eventType ||
        ""

    };


    subscription =
      await Subscription.create(
        data
      );

  }


  await updateUserPlan(
    userId,
    normalizedPlan
  );


  return subscription;

}


/* =========================================================
   MARK SUBSCRIPTION STATUS
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
      : {
          userId,

          status:
            "active"
        };


  const subscription =
    await Subscription.findOne(
      query
    );


  if (!subscription) {
    return null;
  }


  if (
    eventId &&
    subscription.processedWebhookEvents.includes(
      eventId
    )
  ) {
    return subscription;
  }


  subscription.status =
    status;

  if (
    paymentStatus
  ) {
    subscription.paymentStatus =
      paymentStatus;
  }


  if (eventId) {

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


  return subscription;

}


/* =========================================================
   STRIPE RAW BODY
========================================================= */

function getRawBody(
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


  return null;

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

            success:
              false,

            provider:
              "stripe",

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

            success:
              false,

            provider:
              "stripe",

            message:
              "Stripe webhook signature configuration missing"

          })
        );

    }


    const rawBody =
      getRawBody(
        req
      );


    if (!rawBody) {

      return res
        .status(400)
        .json(
          formatResponse({

            success:
              false,

            provider:
              "stripe",

            message:
              "Raw Stripe webhook body required"

          })
        );

    }


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


    if (
      await alreadyProcessed(
        eventId
      )
    ) {

      logger.info(
        `Stripe webhook already processed: ${eventId}`
      );

      return res.status(200)
        .json({

          received:
            true,

          duplicate:
            true

        });

    }


    const object =
      event?.data?.object ||
      {};


    /* =====================================================
       CHECKOUT COMPLETED
    ===================================================== */

    if (
      eventType ===
      "checkout.session.completed"
    ) {

      const metadata =
        object.metadata ||
        {};


      const userId =
        metadata.userId ||
        null;


      const plan =
        normalizePlan(
          metadata.plan
        );


      const cycle =
        normalizeCycle(
          metadata.billingCycle
        );


      const amount =
        normalizeProviderAmount(
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
            "Stripe checkout webhook is missing required subscription metadata"
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
        object.metadata ||
        {};


      const userId =
        metadata.userId ||
        null;


      const plan =
        normalizePlan(
          metadata.plan
        );


      const cycle =
        normalizeCycle(
          metadata.billingCycle
        );


      const amount =
        normalizeProviderAmount(
          object.amount_received ||
          object.amount
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
          `Stripe payment intent ${object.id} has insufficient subscription metadata`
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


      if (
        subscriptionId
      ) {

        let stripeSubscription =
          null;


        if (stripe) {

          stripeSubscription =
            await stripe
              .subscriptions
              .retrieve(
                subscriptionId
              );

        }


        const metadata =
          stripeSubscription
            ?.metadata ||
          object.metadata ||
          {};


        const plan =
          normalizePlan(
            metadata.plan
          );


        const userId =
          metadata.userId ||
          null;


        const cycle =
          normalizeCycle(
            metadata.billingCycle
          );


        const amount =
          normalizeProviderAmount(
            object.amount_paid ||
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
            `Stripe invoice ${object.id} does not contain sufficient subscription metadata`
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


      if (
        stripeStatus ===
        "past_due"
      ) {

        localStatus =
          "past_due";

      } else if (
        stripeStatus ===
          "canceled" ||
        stripeStatus ===
          "unpaid"
      ) {

        localStatus =
          "cancelled";

      } else if (
        stripeStatus ===
        "incomplete"
      ) {

        localStatus =
          "pending";

      }


      await updateSubscriptionStatus({

        providerSubscriptionId:
          object.id,

        userId:
          object.metadata
            ?.userId,

        status:
          localStatus,

        paymentStatus:
          stripeStatus ===
          "active"
            ? "paid"
            : stripeStatus,

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


    return res
      .status(200)
      .json({

        received:
          true,

        provider:
          "stripe",

        eventId

      });

  }

  catch (error) {

    logger.error(
      `Stripe webhook failed: ${error?.message}`
    );


    /*
     * 400 tells Stripe the event could not be
     * accepted/verified. Stripe can retry according
     * to its webhook delivery behavior.
     */

    return res
      .status(400)
      .json({

        success:
          false,

        provider:
          "stripe",

        message:
          "Webhook processing failed",

        error:
          error?.message ||
          "Unknown webhook error"

      });

  }

}


/* =========================================================
   RAZORPAY SIGNATURE
========================================================= */

function verifyRazorpayWebhook(
  req
) {

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


  let rawBody = null;


  if (
    Buffer.isBuffer(
      req.body
    )
  ) {

    rawBody =
      req.body;

  } else if (
    Buffer.isBuffer(
      req.rawBody
    )
  ) {

    rawBody =
      req.rawBody;

  } else if (
    typeof req.rawBody ===
    "string"
  ) {

    rawBody =
      Buffer.from(
        req.rawBody
      );

  }


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

          success:
            false,

          provider:
            "razorpay",

          message:
            "Invalid webhook signature"

        });

    }


    const event =
      Buffer.isBuffer(
        req.body
      )
        ? JSON.parse(
            req.body.toString(
              "utf8"
            )
          )
        : req.body;


    if (
      !event ||
      typeof event !==
        "object"
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          provider:
            "razorpay",

          message:
            "Invalid webhook payload"

        });

    }


    const eventType =
      event.event ||
      null;


    const eventId =
      event.id ||
      event.payload
        ?.payment
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

          received:
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
      "payment.captured"
    ) {

      const payment =
        event
          ?.payload
          ?.payment
          ?.entity ||
        {};


      const notes =
        payment.notes ||
        {};


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


      const amount =
        normalizeProviderAmount(
          payment.amount
        );


      if (
        !userId ||
        !plan ||
        amount === null
      ) {

        throw new Error(
          "Razorpay payment webhook is missing userId, plan or amount metadata"
        );

      }


      /*
       * Razorpay currently receives INR orders.
       *
       * The new ZyrionOS public plan catalog is USD.
       * Therefore this path should only be enabled after
       * an official INR price mapping is configured.
       */

      const currency =
        String(
          payment.currency ||
          "INR"
        ).toUpperCase();


      if (
        currency !==
        "USD"
      ) {

        throw new Error(
          "Razorpay payment currency is not USD. Configure a verified INR-to-plan mapping before activating USD subscriptions through Razorpay."
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
        event
          ?.payload
          ?.payment
          ?.entity ||
        {};


      const notes =
        payment.notes ||
        {};


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
       RAZORPAY SUBSCRIPTION ACTIVATED
    ===================================================== */

    else if (
      eventType ===
      "subscription.activated"
    ) {

      const subscriptionEntity =
        event
          ?.payload
          ?.subscription
          ?.entity ||
        {};


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


      if (
        plan &&
        notes.userId
      ) {

        await activateSubscription({

          userId:
            notes.userId,

          planName:
            plan,

          amount:
            Number(
              notes.amount
            ),

          currency:
            "INR",

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

      }

    }


    /* =====================================================
       RAZORPAY SUBSCRIPTION CANCELLED
    ===================================================== */

    else if (
      eventType ===
      "subscription.cancelled"
    ) {

      const subscriptionEntity =
        event
          ?.payload
          ?.subscription
          ?.entity ||
        {};


      await updateSubscriptionStatus({

        providerSubscriptionId:
          subscriptionEntity.id,

        userId:
          subscriptionEntity
            ?.notes
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
       RAZORPAY SUBSCRIPTION HALTED
    ===================================================== */

    else if (
      eventType ===
      "subscription.halted"
    ) {

      const subscriptionEntity =
        event
          ?.payload
          ?.subscription
          ?.entity ||
        {};


      await updateSubscriptionStatus({

        providerSubscriptionId:
          subscriptionEntity.id,

        userId:
          subscriptionEntity
            ?.notes
            ?.userId,

        status:
          "past_due",

        paymentStatus:
          "failed",

        eventId,

        eventType

      });

    }


    return res
      .status(200)
      .json({

        received:
          true,

        provider:
          "razorpay",

        eventId

      });

  }

  catch (error) {

    logger.error(
      `Razorpay webhook failed: ${error?.message}`
    );


    return res
      .status(400)
      .json({

        success:
          false,

        provider:
          "razorpay",

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
