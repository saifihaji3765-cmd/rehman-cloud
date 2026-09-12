const { v4: uuidv4 } = require("uuid");

/* =========================
   BILLING AGENT
========================= */

const billingAgent =
  require("./billingAgent");

/* =========================
   SERVICES
========================= */

const logger =
  require("../services/loggerService");

/* =========================
   HELPERS
========================= */

function normalizeUserId(value) {
  if (!value) {
    return null;
  }

  const userId =
    String(value).trim();

  return userId || null;
}

function normalizePlanName(value) {
  if (!value) {
    return "Starter";
  }

  return String(value).trim();
}

function isValidLimit(value) {
  return (
    value === -1 ||
    (
      Number.isFinite(Number(value)) &&
      Number(value) >= 0
    )
  );
}

function normalizeLimit(value, fallback = 0) {
  if (value === -1) {
    return -1;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function normalizeFeatureFlag(value) {
  return value === true;
}

function normalizePaymentProvider(value) {
  if (!value) {
    return null;
  }

  const provider =
    String(value)
      .trim()
      .toLowerCase();

  const allowedProviders = [
    "stripe",
    "razorpay",
  ];

  if (
    !allowedProviders.includes(provider)
  ) {
    return null;
  }

  return provider;
}

/* =========================
   PLAN NORMALIZATION
========================= */

function normalizePlan(plan) {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const deploymentsLimit =
    normalizeLimit(
      plan.deploymentsLimit,
      0
    );

  const aiCredits =
    normalizeLimit(
      plan.aiCredits,
      0
    );

  const thumbnailCredits =
    normalizeLimit(
      plan.thumbnailCredits,
      0
    );

  const videoCredits =
    normalizeLimit(
      plan.videoCredits,
      0
    );

  /*
   * Reject invalid limits instead of silently
   * creating an unsafe subscription.
   */

  if (
    !isValidLimit(plan.deploymentsLimit) ||
    !isValidLimit(plan.aiCredits) ||
    !isValidLimit(plan.thumbnailCredits) ||
    !isValidLimit(plan.videoCredits)
  ) {
    return null;
  }

  return {
    name:
      String(
        plan.name || "Starter"
      ).trim(),

    currency:
      plan.currency || "USD",

    monthlyPrice:
      Number.isFinite(
        Number(plan.monthlyPrice)
      )
        ? Number(plan.monthlyPrice)
        : 0,

    deploymentsLimit,

    aiCredits,

    thumbnailCredits,

    videoCredits,

    ram:
      plan.ram ?? null,

    cpu:
      plan.cpu ?? null,

    storage:
      plan.storage ?? null,

    bandwidth:
      plan.bandwidth ?? null,

    customDomain:
      normalizeFeatureFlag(
        plan.customDomain
      ),

    autoSSL:
      normalizeFeatureFlag(
        plan.autoSSL
      ),

    autoScaling:
      normalizeFeatureFlag(
        plan.autoScaling
      ),

    advancedMonitoring:
      normalizeFeatureFlag(
        plan.advancedMonitoring
      ),

    priorityDeployments:
      normalizeFeatureFlag(
        plan.priorityDeployments
      ),

    dedicatedInfrastructure:
      normalizeFeatureFlag(
        plan.dedicatedInfrastructure
      ),

    dedicatedSupport:
      normalizeFeatureFlag(
        plan.dedicatedSupport
      ),

    features:
      Array.isArray(plan.features)
        ? plan.features
        : [],

    support:
      plan.support ?? null,
  };
}

/* =========================
   BILLING CYCLE
========================= */

function calculateNextBillingDate(
  startedAt,
  billingCycle = "monthly"
) {
  const nextDate =
    new Date(startedAt);

  if (
    billingCycle === "yearly"
  ) {
    nextDate.setFullYear(
      nextDate.getFullYear() + 1
    );

    return nextDate;
  }

  /*
   * Calendar-month calculation instead of
   * hardcoded 30 days.
   */

  const originalDay =
    nextDate.getDate();

  nextDate.setMonth(
    nextDate.getMonth() + 1
  );

  /*
   * Handle months with fewer days.
   */

  if (
    nextDate.getDate() !==
    originalDay
  ) {
    nextDate.setDate(0);
  }

  return nextDate;
}

/* =========================================================
   SUBSCRIPTION AGENT
========================================================= */

async function subscriptionAgent(
  userData = {}
) {
  try {
    logger.info(
      "Subscription Agent Started"
    );

    /* =========================
       INPUT VALIDATION
    ========================= */

    if (
      !userData ||
      typeof userData !== "object"
    ) {
      return {
        success: false,
        message:
          "Subscription input must be an object",
      };
    }

    const userId =
      normalizeUserId(
        userData.userId
      );

    /*
     * Anonymous users must not receive
     * paid subscription entitlements.
     */

    if (!userId) {
      return {
        success: false,
        message:
          "Authenticated user ID required",
      };
    }

    const selectedPlan =
      normalizePlanName(
        userData.plan
      );

    const paymentProvider =
      normalizePaymentProvider(
        userData.paymentProvider
      );

    /* =========================
       BILLING INITIALIZATION
    ========================= */

    const billingResult =
      await billingAgent({
        userId,
        plan: selectedPlan,
      });

    if (
      !billingResult ||
      billingResult.success !== true
    ) {
      logger.error(
        "Billing initialization failed"
      );

      return {
        success: false,

        message:
          "Billing initialization failed",

        error:
          billingResult?.error ||
          billingResult?.message ||
          "Unable to initialize billing",
      };
    }

    /* =========================
       PLAN EXTRACTION
    ========================= */

    const rawPlan =
      billingResult?.billing?.selectedPlan ||
      billingResult?.selectedPlan ||
      billingResult?.plan;

    const plan =
      normalizePlan(rawPlan);

    if (!plan) {
      logger.error(
        "Invalid billing plan returned"
      );

      return {
        success: false,

        message:
          "Invalid subscription plan",
      };
    }

    /* =========================
       BILLING CYCLE
    ========================= */

    const billingCycle =
      userData.billingCycle ===
      "yearly"
        ? "yearly"
        : "monthly";

    /* =========================
       PAYMENT STATE
    ========================= */

    /*
     * IMPORTANT:
     *
     * Initializing a subscription is NOT the
     * same as receiving successful payment.
     *
     * Therefore a new subscription is pending
     * unless an authoritative payment event has
     * already been supplied.
     */

    const paymentConfirmed =
      userData.paymentConfirmed === true;

    const initialStatus =
      paymentConfirmed
        ? "active"
        : "pending";

    const paymentStatus =
      paymentConfirmed
        ? "paid"
        : "pending";

    /* =========================
       DATES
    ========================= */

    const startedAt =
      new Date();

    const nextBillingDate =
      calculateNextBillingDate(
        startedAt,
        billingCycle
      );

    /* =========================
       SUBSCRIPTION ID
    ========================= */

    const subscriptionId =
      uuidv4();

    /* =========================
       USAGE
    ========================= */

    const usage = {
      deploymentsUsed: 0,
      aiCreditsUsed: 0,
      thumbnailCreditsUsed: 0,
      videoCreditsUsed: 0,
    };

    /* =========================
       LIMITS
    ========================= */

    const limits = {
      deployments:
        plan.deploymentsLimit,

      aiCredits:
        plan.aiCredits,

      thumbnailCredits:
        plan.thumbnailCredits,

      videoCredits:
        plan.videoCredits,
    };

    /* =========================
       UNLIMITED FLAGS
    ========================= */

    const unlimitedAI =
      plan.aiCredits === -1;

    const unlimitedDeployments =
      plan.deploymentsLimit === -1;

    const unlimitedThumbnails =
      plan.thumbnailCredits === -1;

    const unlimitedVideo =
      plan.videoCredits === -1;

    /* =========================
       FEATURE FLAGS
    ========================= */

    const featureFlags = {
      customDomain:
        plan.customDomain,

      autoSSL:
        plan.autoSSL,

      autoScaling:
        plan.autoScaling,

      advancedMonitoring:
        plan.advancedMonitoring,

      priorityDeployments:
        plan.priorityDeployments,

      dedicatedInfrastructure:
        plan.dedicatedInfrastructure,

      dedicatedSupport:
        plan.dedicatedSupport,
    };

    /* =========================
       INFRASTRUCTURE
    ========================= */

    const infrastructure = {
      ram: plan.ram,
      cpu: plan.cpu,
      storage: plan.storage,
      bandwidth: plan.bandwidth,
    };

    /* =========================
       SUBSCRIPTION OBJECT
    ========================= */

    const subscription = {
      subscriptionId,

      userId,

      activePlan:
        plan.name,

      status:
        initialStatus,

      billingCycle,

      currency:
        plan.currency,

      monthlyPrice:
        plan.monthlyPrice,

      paymentProvider,

      paymentStatus,

      /*
       * Provider IDs remain null until the real
       * payment provider creates/returns them.
       */

      providerCustomerId:
        userData.providerCustomerId ||
        null,

      providerSubscriptionId:
        userData.providerSubscriptionId ||
        null,

      paymentId:
        userData.paymentId ||
        null,

      /* =========================
         BILLING DATES
      ========================= */

      startedAt,

      nextBillingDate,

      autoRenew:
        userData.autoRenew !== false,

      /* =========================
         LIMITS
      ========================= */

      deploymentsLimit:
        plan.deploymentsLimit,

      unlimitedDeployments,

      unlimitedAI,

      unlimitedThumbnails,

      unlimitedVideo,

      limits,

      usage,

      /* =========================
         INFRASTRUCTURE
      ========================= */

      infrastructure,

      /* =========================
         FEATURES
      ========================= */

      features:
        plan.features,

      featureFlags,

      support:
        plan.support,

      /* =========================
         METADATA
      ========================= */

      metadata: {
        environment:
          process.env.NODE_ENV ||
          "development",

        version:
          "2.0.0",

        source:
          "subscriptionAgent",
      },

      createdAt:
        startedAt,

      updatedAt:
        startedAt,
    };

    /* =========================
       RESULT
    ========================= */

    logger.success(
      paymentConfirmed
        ? "Subscription Activated"
        : "Subscription Created - Payment Pending"
    );

    return {
      success: true,

      subscription,

      /*
       * Explicitly tell the orchestration
       * layer whether paid entitlements can
       * be granted.
       */

      entitlementActive:
        paymentConfirmed,

      paymentRequired:
        !paymentConfirmed,

      message:
        paymentConfirmed
          ? "Subscription activated successfully"
          : "Subscription created and awaiting payment confirmation",
    };
  } catch (error) {
    logger.error(
      error?.message ||
      "Unknown subscription error"
    );

    return {
      success: false,

      message:
        "Subscription initialization failed",

      error:
        error?.message ||
        "Unknown subscription error",
    };
  }
}

/* =========================
   EXPORT
========================= */

module.exports =
  subscriptionAgent;
