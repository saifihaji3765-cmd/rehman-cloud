const { v4: uuidv4 } = require("uuid");

/* =========================================================
   ZyrionOS SUBSCRIPTION AGENT
   =========================================================

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Resolve subscription plan from Billing Agent
   - Never claim payment success without confirmation
   - Create normalized subscription state
   - Activate paid entitlements only after payment confirmation
   - Validate deployment entitlement
   - Validate feature access
   - Validate usage limits
   - Support subscription lifecycle operations
   - Preserve infrastructure/resource entitlements
   - Keep Billing Agent as pricing/catalog authority
   - Never directly charge a payment provider

   SUPPORTED OPERATIONS
   ---------------------------------------------------------
   quote
   create
   activate
   validate-deployment
   check-entitlement
   consume-usage
   status
   renew
   upgrade
   downgrade
   cancel
========================================================= */

/* =========================================================
   BILLING AGENT
========================================================= */

const billingAgent =
  require("./billingAgent");

/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");

/* =========================================================
   CONSTANTS
========================================================= */

const SUBSCRIPTION_VERSION =
  "3.0.0";

const ALLOWED_OPERATIONS = [
  "quote",
  "create",
  "activate",
  "validate-deployment",
  "check-entitlement",
  "consume-usage",
  "status",
  "renew",
  "upgrade",
  "downgrade",
  "cancel",
];

const ALLOWED_PAYMENT_PROVIDERS = [
  "stripe",
  "razorpay",
];

/*
 * These are safety ceilings.
 *
 * They do not change the Billing Agent catalog.
 * They prevent malformed plans from accidentally
 * granting absurd resources.
 */

const RESOURCE_SAFETY_LIMITS = {
  maxRamGB: 256,
  maxCpu: 64,
  maxStorageGB: 10000,
  maxBandwidthGB: 100000,
};

/* =========================================================
   BASIC HELPERS
========================================================= */

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

function normalizeOperation(value) {
  const operation =
    String(value || "quote")
      .trim()
      .toLowerCase();

  if (
    !ALLOWED_OPERATIONS.includes(
      operation
    )
  ) {
    return "quote";
  }

  return operation;
}

function normalizePaymentProvider(value) {
  if (!value) {
    return null;
  }

  const provider =
    String(value)
      .trim()
      .toLowerCase();

  if (
    !ALLOWED_PAYMENT_PROVIDERS.includes(
      provider
    )
  ) {
    return null;
  }

  return provider;
}

function normalizeString(value, fallback = null) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  const normalized =
    String(value).trim();

  return normalized || fallback;
}

function isFiniteNonNegative(value) {
  const number =
    Number(value);

  return (
    Number.isFinite(number) &&
    number >= 0
  );
}

function isValidLimit(value) {
  return (
    value === -1 ||
    isFiniteNonNegative(value)
  );
}

function normalizeLimit(
  value,
  fallback = 0
) {
  if (value === -1) {
    return -1;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return fallback;
  }

  return Math.floor(number);
}

function normalizeFeatureFlag(value) {
  return value === true;
}

function normalizeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function toDate(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

/* =========================================================
   RESOURCE NORMALIZATION
========================================================= */

function normalizeRam(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const match =
    String(value)
      .trim()
      .match(
        /^(\d+(?:\.\d+)?)\s*(gb)?$/i
      );

  if (!match) {
    return null;
  }

  const ram =
    Number(match[1]);

  if (
    !Number.isFinite(ram) ||
    ram <= 0 ||
    ram > RESOURCE_SAFETY_LIMITS.maxRamGB
  ) {
    return null;
  }

  return `${ram}GB`;
}

function normalizeCpu(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const match =
    String(value)
      .trim()
      .match(
        /^(\d+(?:\.\d+)?)\s*(v?cpu|vcpu)?$/i
      );

  if (!match) {
    return null;
  }

  const cpu =
    Number(match[1]);

  if (
    !Number.isFinite(cpu) ||
    cpu <= 0 ||
    cpu > RESOURCE_SAFETY_LIMITS.maxCpu
  ) {
    return null;
  }

  return cpu;
}

function normalizeStorage(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const match =
    String(value)
      .trim()
      .match(
        /^(\d+(?:\.\d+)?)\s*(gb|tb)?$/i
      );

  if (!match) {
    return null;
  }

  let storage =
    Number(match[1]);

  const unit =
    String(match[2] || "GB")
      .toUpperCase();

  if (unit === "TB") {
    storage *= 1024;
  }

  if (
    !Number.isFinite(storage) ||
    storage <= 0 ||
    storage >
      RESOURCE_SAFETY_LIMITS.maxStorageGB
  ) {
    return null;
  }

  return `${storage}GB`;
}

function normalizeBandwidth(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    normalized === "unlimited"
  ) {
    return "unlimited";
  }

  const match =
    normalized.match(
      /^(\d+(?:\.\d+)?)\s*(gb|tb)?$/
    );

  if (!match) {
    return null;
  }

  let bandwidth =
    Number(match[1]);

  const unit =
    String(match[2] || "GB")
      .toUpperCase();

  if (unit === "TB") {
    bandwidth *= 1024;
  }

  if (
    !Number.isFinite(bandwidth) ||
    bandwidth <= 0 ||
    bandwidth >
      RESOURCE_SAFETY_LIMITS.maxBandwidthGB
  ) {
    return null;
  }

  return `${bandwidth}GB`;
}

/* =========================================================
   PLAN EXTRACTION
========================================================= */

function extractPlanFromBillingResult(
  billingResult
) {
  if (
    !billingResult ||
    typeof billingResult !== "object"
  ) {
    return null;
  }

  return (
    billingResult?.billing?.selectedPlan ||
    billingResult?.selectedPlan ||
    billingResult?.plan ||
    billingResult?.billing?.plan ||
    null
  );
}

/* =========================================================
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(plan) {
  if (
    !plan ||
    typeof plan !== "object"
  ) {
    return null;
  }

  const limits =
    plan.limits &&
    typeof plan.limits === "object"
      ? plan.limits
      : {};

  const resources =
    plan.resources &&
    typeof plan.resources === "object"
      ? plan.resources
      : {};

  const deploymentsLimit =
    normalizeLimit(
      plan.deploymentsLimit ??
        limits.deployments ??
        limits.deploymentsLimit,
      0
    );

  const aiCredits =
    normalizeLimit(
      plan.aiCredits ??
        limits.aiCredits,
      0
    );

  const thumbnailCredits =
    normalizeLimit(
      plan.thumbnailCredits ??
        limits.thumbnailCredits,
      0
    );

  const videoCredits =
    normalizeLimit(
      plan.videoCredits ??
        limits.videoCredits,
      0
    );

  /*
   * Never silently accept invalid limits.
   */

  if (
    !isValidLimit(
      plan.deploymentsLimit ??
        limits.deployments ??
        limits.deploymentsLimit
    ) ||
    !isValidLimit(
      plan.aiCredits ??
        limits.aiCredits
    ) ||
    !isValidLimit(
      plan.thumbnailCredits ??
        limits.thumbnailCredits
    ) ||
    !isValidLimit(
      plan.videoCredits ??
        limits.videoCredits
    )
  ) {
    return null;
  }

  const monthlyPrice =
    Number(
      plan.monthlyPrice ??
        plan.price ??
        0
    );

  const yearlyPrice =
    Number(
      plan.yearlyPrice ??
        plan.annualPrice ??
        monthlyPrice * 10
    );

  if (
    !Number.isFinite(
      monthlyPrice
    ) ||
    monthlyPrice < 0 ||
    !Number.isFinite(
      yearlyPrice
    ) ||
    yearlyPrice < 0
  ) {
    return null;
  }

  const ram =
    normalizeRam(
      plan.ram ??
        resources.ram
    );

  const cpu =
    normalizeCpu(
      plan.cpu ??
        resources.cpu
    );

  const storage =
    normalizeStorage(
      plan.storage ??
        resources.storage
    );

  const bandwidth =
    normalizeBandwidth(
      plan.bandwidth ??
        resources.bandwidth
    );

  return {
    name:
      normalizeString(
        plan.name,
        "Starter"
      ),

    currency:
      normalizeString(
        plan.currency,
        "USD"
      ),

    monthlyPrice,

    yearlyPrice,

    deploymentsLimit,

    aiCredits,

    thumbnailCredits,

    videoCredits,

    ram,

    cpu,

    storage,

    bandwidth,

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
      normalizeArray(
        plan.features
      ),

    support:
      plan.support ?? null,
  };
}

/* =========================================================
   BILLING DATE
========================================================= */

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

  const originalDay =
    nextDate.getDate();

  nextDate.setMonth(
    nextDate.getMonth() + 1
  );

  /*
   * Handle dates such as:
   * Jan 31 -> Feb 28/29
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
   PAYMENT STATE
========================================================= */

function resolvePaymentState(
  userData = {}
) {
  const paymentConfirmed =
    userData.paymentConfirmed === true;

  const rawStatus =
    String(
      userData.paymentStatus ||
        ""
    )
      .trim()
      .toLowerCase();

  /*
   * Only explicit confirmed payment may
   * activate paid entitlements.
   */

  if (paymentConfirmed) {
    return {
      confirmed: true,
      status: "paid",
    };
  }

  if (
    rawStatus === "paid" ||
    rawStatus === "succeeded" ||
    rawStatus === "success"
  ) {
    /*
     * Status alone is not treated as authoritative.
     * The orchestration layer should pass
     * paymentConfirmed=true after verification.
     */
    return {
      confirmed: false,
      status: "pending",
    };
  }

  if (
    rawStatus === "failed" ||
    rawStatus === "declined"
  ) {
    return {
      confirmed: false,
      status: "failed",
    };
  }

  return {
    confirmed: false,
    status: "pending",
  };
}

/* =========================================================
   USAGE
========================================================= */

function createEmptyUsage() {
  return {
    deploymentsUsed: 0,
    aiCreditsUsed: 0,
    thumbnailCreditsUsed: 0,
    videoCreditsUsed: 0,
  };
}

function normalizeUsage(
  usage = {}
) {
  return {
    deploymentsUsed:
      normalizeLimit(
        usage.deploymentsUsed,
        0
      ),

    aiCreditsUsed:
      normalizeLimit(
        usage.aiCreditsUsed,
        0
      ),

    thumbnailCreditsUsed:
      normalizeLimit(
        usage.thumbnailCreditsUsed,
        0
      ),

    videoCreditsUsed:
      normalizeLimit(
        usage.videoCreditsUsed,
        0
      ),
  };
}

/* =========================================================
   LIMIT CHECK
========================================================= */

function hasRemainingLimit(
  used,
  limit,
  requested = 1
) {
  const amount =
    Number(requested);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return false;
  }

  /*
   * -1 means unlimited.
   */

  if (limit === -1) {
    return true;
  }

  return (
    Number(used) + amount <=
    Number(limit)
  );
}

/* =========================================================
   ENTITLEMENT CHECK
========================================================= */

function validateSubscriptionActive(
  subscription
) {
  if (
    !subscription ||
    typeof subscription !== "object"
  ) {
    return {
      valid: false,
      message:
        "Subscription data required",
    };
  }

  if (
    subscription.status !==
    "active"
  ) {
    return {
      valid: false,
      message:
        `Subscription is not active: ${subscription.status || "unknown"}`,
    };
  }

  const nextBillingDate =
    toDate(
      subscription.nextBillingDate
    );

  if (
    nextBillingDate &&
    nextBillingDate.getTime() <
      Date.now()
  ) {
    return {
      valid: false,
      message:
        "Subscription billing period has expired",
    };
  }

  return {
    valid: true,
  };
}

/* =========================================================
   FEATURE ACCESS
========================================================= */

function checkFeature(
  subscription,
  feature
) {
  const active =
    validateSubscriptionActive(
      subscription
    );

  if (!active.valid) {
    return active;
  }

  const flags =
    subscription.featureFlags || {};

  if (
    flags[feature] !== true
  ) {
    return {
      valid: false,
      message:
        `Feature not available on current plan: ${feature}`,
    };
  }

  return {
    valid: true,
  };
}

/* =========================================================
   DEPLOYMENT VALIDATION
========================================================= */

function validateDeploymentEntitlement(
  subscription
) {
  const active =
    validateSubscriptionActive(
      subscription
    );

  if (!active.valid) {
    return active;
  }

  const deploymentsUsed =
    Number(
      subscription?.usage
        ?.deploymentsUsed || 0
    );

  const deploymentsLimit =
    subscription
      ?.limits
      ?.deployments ??
    subscription
      ?.deploymentsLimit ??
    0;

  if (
    !hasRemainingLimit(
      deploymentsUsed,
      deploymentsLimit,
      1
    )
  ) {
    return {
      valid: false,

      message:
        "Deployment limit reached",

      code:
        "DEPLOYMENT_LIMIT_REACHED",

      usage: {
        used: deploymentsUsed,
        limit:
          deploymentsLimit,
      },
    };
  }

  return {
    valid: true,

    usage: {
      used: deploymentsUsed,
      limit:
        deploymentsLimit,
      remaining:
        deploymentsLimit === -1
          ? -1
          : deploymentsLimit -
            deploymentsUsed,
    },
  };
}

/* =========================================================
   PLAN → SUBSCRIPTION SNAPSHOT
========================================================= */

function createSubscriptionSnapshot({
  userId,
  plan,
  billingCycle,
  paymentProvider,
  paymentState,
  userData,
}) {
  const now =
    new Date();

  const nextBillingDate =
    calculateNextBillingDate(
      now,
      billingCycle
    );

  const usage =
    normalizeUsage(
      userData.usage ||
        createEmptyUsage()
    );

  const active =
    paymentState.confirmed;

  const status =
    active
      ? "active"
      : paymentState.status ===
          "failed"
        ? "payment_failed"
        : "pending";

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

  const infrastructure = {
    cpu: plan.cpu,
    ram: plan.ram,
    storage: plan.storage,
    bandwidth: plan.bandwidth,
  };

  return {
    subscriptionId:
      normalizeString(
        userData.subscriptionId,
        uuidv4()
      ),

    userId,

    activePlan:
      plan.name,

    status,

    billingCycle,

    currency:
      plan.currency,

    monthlyPrice:
      plan.monthlyPrice,

    yearlyPrice:
      plan.yearlyPrice,

    paymentProvider,

    paymentStatus:
      paymentState.status,

    paymentConfirmed:
      paymentState.confirmed,

    providerCustomerId:
      normalizeString(
        userData.providerCustomerId
      ),

    providerSubscriptionId:
      normalizeString(
        userData.providerSubscriptionId
      ),

    paymentId:
      normalizeString(
        userData.paymentId
      ),

    startedAt:
      toDate(
        userData.startedAt
      ) || now,

    nextBillingDate,

    autoRenew:
      userData.autoRenew !== false,

    limits,

    usage,

    infrastructure,

    features:
      [...plan.features],

    featureFlags,

    support:
      plan.support,

    unlimitedDeployments:
      plan.deploymentsLimit === -1,

    unlimitedAI:
      plan.aiCredits === -1,

    unlimitedThumbnails:
      plan.thumbnailCredits === -1,

    unlimitedVideo:
      plan.videoCredits === -1,

    metadata: {
      environment:
        process.env.NODE_ENV ||
        "development",

      version:
        SUBSCRIPTION_VERSION,

      source:
        "subscriptionAgent",
    },

    createdAt:
      toDate(
        userData.createdAt
      ) || now,

    updatedAt:
      now,
  };
}

/* =========================================================
   BILLING PLAN RESOLUTION
========================================================= */

async function resolveBillingPlan(
  userData
) {
  /*
   * If Master/another internal agent already
   * resolved billing, reuse it.
   *
   * This prevents duplicate billing initialization.
   */

  if (
    userData.billingResult &&
    typeof userData.billingResult ===
      "object"
  ) {
    if (
      userData.billingResult.success ===
      true
    ) {
      const suppliedPlan =
        extractPlanFromBillingResult(
          userData.billingResult
        );

      const normalized =
        normalizePlan(
          suppliedPlan
        );

      if (normalized) {
        return {
          success: true,
          plan: normalized,
          billingResult:
            userData.billingResult,
        };
      }
    }
  }

  /*
   * Existing subscription can also be used
   * without initializing billing again.
   */

  if (
    userData.subscription &&
    typeof userData.subscription ===
      "object"
  ) {
    const existingPlan =
      normalizePlan({
        name:
          userData.subscription
            .activePlan,

        currency:
          userData.subscription
            .currency,

        monthlyPrice:
          userData.subscription
            .monthlyPrice,

        yearlyPrice:
          userData.subscription
            .yearlyPrice,

        deploymentsLimit:
          userData.subscription
            ?.limits?.deployments,

        aiCredits:
          userData.subscription
            ?.limits?.aiCredits,

        thumbnailCredits:
          userData.subscription
            ?.limits
            ?.thumbnailCredits,

        videoCredits:
          userData.subscription
            ?.limits?.videoCredits,

        ...(userData.subscription
          .infrastructure || {}),

        ...(userData.subscription
          .featureFlags || {}),
      });

    if (existingPlan) {
      return {
        success: true,
        plan: existingPlan,
        billingResult: null,
      };
    }
  }

  /*
   * Only initialize billing when no authoritative
   * billing result is already available.
   */

  const billingResult =
    await billingAgent({
      userId:
        userData.userId,

      plan:
        userData.plan,

      billingCycle:
        userData.billingCycle,

      paymentProvider:
        userData.paymentProvider,

      operation:
        "quote",

      paymentRequired:
        userData.paymentRequired,
    });

  if (
    !billingResult ||
    billingResult.success !== true
  ) {
    return {
      success: false,

      message:
        "Unable to resolve billing plan",

      error:
        billingResult?.error ||
        billingResult?.message ||
        "Billing plan resolution failed",
    };
  }

  const rawPlan =
    extractPlanFromBillingResult(
      billingResult
    );

  const plan =
    normalizePlan(rawPlan);

  if (!plan) {
    return {
      success: false,

      message:
        "Billing Agent returned an invalid plan",
    };
  }

  return {
    success: true,
    plan,
    billingResult,
  };
}

/* =========================================================
   CREATE / QUOTE
========================================================= */

async function createOrQuoteSubscription(
  userData,
  operation
) {
  const resolved =
    await resolveBillingPlan(
      userData
    );

  if (!resolved.success) {
    return resolved;
  }

  const paymentState =
    resolvePaymentState(
      userData
    );

  const billingCycle =
    userData.billingCycle ===
    "yearly"
      ? "yearly"
      : "monthly";

  const paymentProvider =
    normalizePaymentProvider(
      userData.paymentProvider
    );

  /*
   * Quote operation should never activate
   * entitlements merely because the caller
   * requested a quote.
   */

  if (
    operation === "quote"
  ) {
    return {
      success: true,

      quote: {
        plan:
          resolved.plan.name,

        currency:
          resolved.plan.currency,

        monthlyPrice:
          resolved.plan.monthlyPrice,

        yearlyPrice:
          resolved.plan.yearlyPrice,

        billingCycle,

        price:
          billingCycle ===
          "yearly"
            ? resolved.plan.yearlyPrice
            : resolved.plan.monthlyPrice,

        infrastructure: {
          cpu:
            resolved.plan.cpu,

          ram:
            resolved.plan.ram,

          storage:
            resolved.plan.storage,

          bandwidth:
            resolved.plan.bandwidth,
        },

        limits: {
          deployments:
            resolved.plan
              .deploymentsLimit,

          aiCredits:
            resolved.plan
              .aiCredits,

          thumbnailCredits:
            resolved.plan
              .thumbnailCredits,

          videoCredits:
            resolved.plan
              .videoCredits,
        },

        features: {
          customDomain:
            resolved.plan
              .customDomain,

          autoSSL:
            resolved.plan
              .autoSSL,

          autoScaling:
            resolved.plan
              .autoScaling,

          advancedMonitoring:
            resolved.plan
              .advancedMonitoring,

          priorityDeployments:
            resolved.plan
              .priorityDeployments,

          dedicatedInfrastructure:
            resolved.plan
              .dedicatedInfrastructure,

          dedicatedSupport:
            resolved.plan
              .dedicatedSupport,
        },
      },

      entitlementActive: false,

      paymentRequired:
        true,

      message:
        "Subscription quote generated",
    };
  }

  const subscription =
    createSubscriptionSnapshot({
      userId:
        userData.userId,

      plan:
        resolved.plan,

      billingCycle,

      paymentProvider,

      paymentState,

      userData,
    });

  return {
    success: true,

    subscription,

    entitlementActive:
      subscription.status ===
      "active",

    paymentRequired:
      subscription.status !==
      "active",

    billingResult:
      resolved.billingResult,

    message:
      subscription.status ===
      "active"
        ? "Subscription activated successfully"
        : "Subscription created and awaiting payment confirmation",
  };
}

/* =========================================================
   ACTIVATE
========================================================= */

async function activateSubscription(
  userData
) {
  /*
   * Activation requires explicit payment
   * confirmation.
   */

  if (
    userData.paymentConfirmed !==
    true
  ) {
    return {
      success: false,

      message:
        "Verified payment confirmation required before subscription activation",

      code:
        "PAYMENT_NOT_CONFIRMED",

      entitlementActive:
        false,

      paymentRequired:
        true,
    };
  }

  const result =
    await createOrQuoteSubscription(
      userData,
      "activate"
    );

  if (!result.success) {
    return result;
  }

  if (
    !result.subscription ||
    result.subscription.status !==
      "active"
  ) {
    return {
      success: false,

      message:
        "Subscription could not be activated",

      entitlementActive:
        false,
    };
  }

  return {
    ...result,

    entitlementActive:
      true,

    paymentRequired:
      false,

    message:
      "Subscription activated successfully",
  };
}

/* =========================================================
   VALIDATE EXISTING SUBSCRIPTION
========================================================= */

function validateExistingSubscription(
  subscription
) {
  if (
    !subscription ||
    typeof subscription !==
      "object"
  ) {
    return {
      success: false,

      message:
        "Existing subscription required",

      code:
        "SUBSCRIPTION_REQUIRED",
    };
  }

  const active =
    validateSubscriptionActive(
      subscription
    );

  if (!active.valid) {
    return {
      success: false,

      message:
        active.message,

      code:
        "SUBSCRIPTION_INACTIVE",

      entitlementActive:
        false,

      subscription,
    };
  }

  return {
    success: true,

    subscription,

    entitlementActive:
      true,

    paymentRequired:
      false,
  };
}

/* =========================================================
   CHECK ENTITLEMENT
========================================================= */

function checkEntitlement(
  userData
) {
  const validation =
    validateExistingSubscription(
      userData.subscription
    );

  if (!validation.success) {
    return validation;
  }

  const subscription =
    userData.subscription;

  const entitlement =
    normalizeString(
      userData.entitlement ||
        userData.feature ||
        userData.resource
    );

  if (!entitlement) {
    return {
      success: false,

      message:
        "Entitlement name required",
    };
  }

  const featureMap = {
    customDomain:
      "customDomain",

    ssl:
      "autoSSL",

    autoSSL:
      "autoSSL",

    autoScaling:
      "autoScaling",

    advancedMonitoring:
      "advancedMonitoring",

    priorityDeployments:
      "priorityDeployments",

    dedicatedInfrastructure:
      "dedicatedInfrastructure",

    dedicatedSupport:
      "dedicatedSupport",
  };

  if (
    featureMap[entitlement]
  ) {
    const result =
      checkFeature(
        subscription,
        featureMap[
          entitlement
        ]
      );

    return {
      success:
        result.valid,

      entitlementActive:
        result.valid,

      message:
        result.valid
          ? `Entitlement available: ${entitlement}`
          : result.message,

      subscription,
    };
  }

  const resourceMap = {
    deployments:
      "deployments",

    aiCredits:
      "aiCredits",

    thumbnailCredits:
      "thumbnailCredits",

    videoCredits:
      "videoCredits",
  };

  const resource =
    resourceMap[
      entitlement
    ];

  if (resource) {
    const limit =
      subscription
        ?.limits?.[resource] ??
      0;

    const usageKey =
      `${resource}Used`;

    const used =
      Number(
        subscription
          ?.usage?.[usageKey] ||
          0
      );

    const available =
      limit === -1
        ? -1
        : Math.max(
            0,
            limit - used
          );

    return {
      success:
        limit === -1 ||
        available > 0,

      entitlementActive:
        limit === -1 ||
        available > 0,

      limit,

      used,

      available,

      message:
        limit === -1 ||
        available > 0
          ? `Entitlement available: ${entitlement}`
          : `Entitlement limit reached: ${entitlement}`,

      subscription,
    };
  }

  return {
    success: false,

    entitlementActive:
      false,

    message:
      `Unknown entitlement: ${entitlement}`,

    code:
      "UNKNOWN_ENTITLEMENT",

    subscription,
  };
}

/* =========================================================
   CONSUME USAGE
========================================================= */

function consumeUsage(
  userData
) {
  const validation =
    validateExistingSubscription(
      userData.subscription
    );

  if (!validation.success) {
    return validation;
  }

  const subscription =
    userData.subscription;

  const resource =
    normalizeString(
      userData.resource
    );

  const amount =
    Number(
      userData.amount ?? 1
    );

  if (
    !resource ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return {
      success: false,

      message:
        "Valid resource and positive amount required",
    };
  }

  const resourceConfig = {
    deployments: {
      limitKey:
        "deployments",

      usageKey:
        "deploymentsUsed",
    },

    aiCredits: {
      limitKey:
        "aiCredits",

      usageKey:
        "aiCreditsUsed",
    },

    thumbnailCredits: {
      limitKey:
        "thumbnailCredits",

      usageKey:
        "thumbnailCreditsUsed",
    },

    videoCredits: {
      limitKey:
        "videoCredits",

      usageKey:
        "videoCreditsUsed",
    },
  };

  const config =
    resourceConfig[
      resource
    ];

  if (!config) {
    return {
      success: false,

      message:
        `Unknown usage resource: ${resource}`,
    };
  }

  const limit =
    Number(
      subscription
        ?.limits?.[
          config.limitKey
        ] ?? 0
    );

  const used =
    Number(
      subscription
        ?.usage?.[
          config.usageKey
        ] ?? 0
    );

  if (
    !hasRemainingLimit(
      used,
      limit,
      amount
    )
  ) {
    return {
      success: false,

      message:
        `Usage limit reached for ${resource}`,

      code:
        "USAGE_LIMIT_REACHED",

      usage: {
        resource,
        used,
        limit,
        requested:
          amount,
      },

      subscription,
    };
  }

  /*
   * This returns the proposed updated usage.
   *
   * Persistent storage should be performed by
   * the owning persistence layer/agent.
   *
   * The Subscription Agent itself does not
   * pretend that an in-memory object is a DB.
   */

  const updatedSubscription =
    {
      ...subscription,

      usage: {
        ...subscription.usage,

        [config.usageKey]:
          used + amount,
      },

      updatedAt:
        new Date(),
    };

  return {
    success: true,

    subscription:
      updatedSubscription,

    usage: {
      resource,

      previous:
        used,

      consumed:
        amount,

      current:
        used + amount,

      limit,

      remaining:
        limit === -1
          ? -1
          : limit -
            (used + amount),
    },

    message:
      `${resource} usage updated successfully`,
  };
}

/* =========================================================
   STATUS
========================================================= */

function getSubscriptionStatus(
  userData
) {
  const subscription =
    userData.subscription;

  if (!subscription) {
    return {
      success: false,

      message:
        "Subscription not found",

      code:
        "SUBSCRIPTION_NOT_FOUND",
    };
  }

  const nextBillingDate =
    toDate(
      subscription.nextBillingDate
    );

  const expired =
    Boolean(
      nextBillingDate &&
        nextBillingDate.getTime() <
          Date.now()
    );

  let status =
    subscription.status;

  if (
    status === "active" &&
    expired
  ) {
    status = "expired";
  }

  return {
    success: true,

    status,

    entitlementActive:
      status === "active",

    paymentRequired:
      status !== "active",

    subscription: {
      ...subscription,
      status,
    },
  };
}

/* =========================================================
   CANCEL
========================================================= */

function cancelSubscription(
  userData
) {
  const subscription =
    userData.subscription;

  if (!subscription) {
    return {
      success: false,

      message:
        "Subscription required",
    };
  }

  if (
    subscription.status ===
    "canceled"
  ) {
    return {
      success: true,

      subscription,

      entitlementActive:
        false,

      message:
        "Subscription is already canceled",
    };
  }

  const now =
    new Date();

  const canceledSubscription =
    {
      ...subscription,

      status:
        "canceled",

      autoRenew:
        false,

      canceledAt:
        now,

      updatedAt:
        now,
    };

  return {
    success: true,

    subscription:
      canceledSubscription,

    entitlementActive:
      false,

    paymentRequired:
      false,

    message:
      "Subscription canceled successfully",
  };
}

/* =========================================================
   RENEW
========================================================= */

async function renewSubscription(
  userData
) {
  if (
    userData.paymentConfirmed !==
    true
  ) {
    return {
      success: false,

      message:
        "Verified renewal payment required",

      code:
        "PAYMENT_NOT_CONFIRMED",

      entitlementActive:
        false,

      paymentRequired:
        true,
    };
  }

  const existing =
    userData.subscription;

  if (!existing) {
    return {
      success: false,

      message:
        "Existing subscription required for renewal",
    };
  }

  const currentStart =
    toDate(
      existing.nextBillingDate
    ) ||
    new Date();

  const billingCycle =
    existing.billingCycle ===
    "yearly"
      ? "yearly"
      : "monthly";

  const nextBillingDate =
    calculateNextBillingDate(
      currentStart,
      billingCycle
    );

  const renewedSubscription =
    {
      ...existing,

      status:
        "active",

      paymentStatus:
        "paid",

      paymentConfirmed:
        true,

      nextBillingDate,

      autoRenew:
        userData.autoRenew !== false,

      updatedAt:
        new Date(),
    };

  return {
    success: true,

    subscription:
      renewedSubscription,

    entitlementActive:
      true,

    paymentRequired:
      false,

    message:
      "Subscription renewed successfully",
  };
}

/* =========================================================
   PLAN CHANGE
========================================================= */

async function changePlan(
  userData,
  operation
) {
  const currentSubscription =
    userData.subscription;

  if (!currentSubscription) {
    return {
      success: false,

      message:
        "Existing subscription required for plan change",
    };
  }

  if (
    currentSubscription.status !==
    "active"
  ) {
    return {
      success: false,

      message:
        "Only active subscriptions can change plans",
    };
  }

  const requestedPlan =
    normalizePlanName(
      userData.plan
    );

  if (
    requestedPlan.toLowerCase() ===
    String(
      currentSubscription.activePlan ||
        ""
    )
      .trim()
      .toLowerCase()
  ) {
    return {
      success: false,

      message:
        "Requested plan is already active",
    };
  }

  /*
   * Resolve target plan from Billing Agent.
   */

  const billingResult =
    await billingAgent({
      userId:
        userData.userId,

      plan:
        requestedPlan,

      billingCycle:
        userData.billingCycle ||
        currentSubscription.billingCycle,

      paymentProvider:
        userData.paymentProvider ||
        currentSubscription.paymentProvider,

      operation:
        "quote",
    });

  if (
    !billingResult ||
    billingResult.success !== true
  ) {
    return {
      success: false,

      message:
        "Unable to resolve requested plan",

      error:
        billingResult?.error ||
        billingResult?.message ||
        "Plan change failed",
    };
  }

  const targetPlan =
    normalizePlan(
      extractPlanFromBillingResult(
        billingResult
      )
    );

  if (!targetPlan) {
    return {
      success: false,

      message:
        "Invalid target plan returned by Billing Agent",
    };
  }

  /*
   * Do not silently activate the new plan
   * without payment confirmation.
   *
   * For an upgrade, payment confirmation is
   * required before the new paid entitlement
   * becomes active.
   */

  if (
    userData.paymentConfirmed !==
    true
  ) {
    return {
      success: true,

      changePending:
        true,

      entitlementActive:
        true,

      paymentRequired:
        true,

      currentSubscription,

      targetPlan,

      message:
        `${operation === "upgrade" ? "Upgrade" : "Downgrade"} prepared and awaiting payment confirmation`,
    };
  }

  const billingCycle =
    userData.billingCycle ||
    currentSubscription.billingCycle ||
    "monthly";

  const paymentProvider =
    normalizePaymentProvider(
      userData.paymentProvider ||
        currentSubscription.paymentProvider
    );

  const paymentState =
    resolvePaymentState(
      userData
    );

  const newSubscription =
    createSubscriptionSnapshot({
      userId:
        userData.userId,

      plan:
        targetPlan,

      billingCycle,

      paymentProvider,

      paymentState,

      userData: {
        ...userData,

        subscriptionId:
          currentSubscription
            .subscriptionId,

        usage:
          currentSubscription
            .usage ||
          createEmptyUsage(),

        createdAt:
          currentSubscription
            .createdAt,

        startedAt:
          currentSubscription
            .startedAt,
      },
    });

  return {
    success: true,

    changePending:
      false,

    subscription:
      newSubscription,

    previousPlan:
      currentSubscription
        .activePlan,

    newPlan:
      targetPlan.name,

    entitlementActive:
      true,

    paymentRequired:
      false,

    message:
      `${operation === "upgrade" ? "Upgrade" : "Downgrade"} completed successfully`,
  };
}

/* =========================================================
   MAIN SUBSCRIPTION AGENT
========================================================= */

async function subscriptionAgent(
  userData = {}
) {
  const startedAt =
    Date.now();

  try {
    logger.info(
      "Subscription Agent Started"
    );

    /* =========================
       INPUT VALIDATION
    ========================= */

    if (
      !userData ||
      typeof userData !==
        "object" ||
      Array.isArray(userData)
    ) {
      return {
        success: false,

        message:
          "Subscription input must be an object",

        code:
          "INVALID_INPUT",
      };
    }

    const userId =
      normalizeUserId(
        userData.userId
      );

    if (!userId) {
      return {
        success: false,

        message:
          "Authenticated user ID required",

        code:
          "USER_ID_REQUIRED",
      };
    }

    const operation =
      normalizeOperation(
        userData.operation ||
          userData.action
      );

    /*
     * Operations working with an existing
     * subscription should not automatically
     * create a new subscription.
     */

    if (
      operation ===
        "validate-deployment" ||
      operation ===
        "check-entitlement" ||
      operation ===
        "consume-usage" ||
      operation === "status" ||
      operation === "cancel"
    ) {
      let result;

      if (
        operation ===
        "validate-deployment"
      ) {
        const validation =
          validateExistingSubscription(
            userData.subscription
          );

        if (!validation.success) {
          return validation;
        }

        const deployment =
          validateDeploymentEntitlement(
            userData.subscription
          );

        return {
          success:
            deployment.valid,

          entitlementActive:
            deployment.valid,

          paymentRequired:
            false,

          message:
            deployment.valid
              ? "Deployment entitlement validated"
              : deployment.message,

          code:
            deployment.valid
              ? "DEPLOYMENT_ALLOWED"
              : deployment.code,

          usage:
            deployment.usage,

          subscription:
            userData.subscription,

          metadata: {
            operation,

            durationMs:
              Date.now() -
              startedAt,
          },
        };
      }

      if (
        operation ===
        "check-entitlement"
      ) {
        result =
          checkEntitlement(
            userData
          );
      }

      if (
        operation ===
        "consume-usage"
      ) {
        result =
          consumeUsage(
            userData
          );
      }

      if (
        operation === "status"
      ) {
        result =
          getSubscriptionStatus(
            userData
          );
      }

      if (
        operation === "cancel"
      ) {
        result =
          cancelSubscription(
            userData
          );
      }

      if (result) {
        result.metadata = {
          ...(result.metadata ||
            {}),

          operation,

          durationMs:
            Date.now() -
            startedAt,
        };

        return result;
      }
    }

    /* =========================
       RENEW
    ========================= */

    if (
      operation === "renew"
    ) {
      const result =
        await renewSubscription(
          userData
        );

      result.metadata = {
        ...(result.metadata || {}),

        operation,

        durationMs:
          Date.now() -
          startedAt,
      };

      return result;
    }

    /* =========================
       UPGRADE
       DOWNGRADE
    ========================= */

    if (
      operation === "upgrade" ||
      operation === "downgrade"
    ) {
      const result =
        await changePlan(
          userData,
          operation
        );

      result.metadata = {
        ...(result.metadata || {}),

        operation,

        durationMs:
          Date.now() -
          startedAt,
      };

      return result;
    }

    /* =========================
       QUOTE / CREATE / ACTIVATE
    ========================= */

    if (
      operation === "quote" ||
      operation === "create"
    ) {
      const result =
        await createOrQuoteSubscription(
          {
            ...userData,

            userId,

            plan:
              normalizePlanName(
                userData.plan
              ),
          },

          operation
        );

      result.metadata = {
        ...(result.metadata || {}),

        operation,

        durationMs:
          Date.now() -
          startedAt,
      };

      if (result.success) {
        logger.success(
          operation === "quote"
            ? "Subscription Quote Generated"
            : result.entitlementActive
              ? "Subscription Activated"
              : "Subscription Created - Payment Pending"
        );
      }

      return result;
    }

    /* =========================
       ACTIVATE
    ========================= */

    if (
      operation === "activate"
    ) {
      const result =
        await activateSubscription(
          {
            ...userData,

            userId,

            plan:
              normalizePlanName(
                userData.plan
              ),
          }
        );

      result.metadata = {
        ...(result.metadata || {}),

        operation,

        durationMs:
          Date.now() -
          startedAt,
      };

      if (result.success) {
        logger.success(
          "Subscription Activation Completed"
        );
      }

      return result;
    }

    /* =========================
       FALLBACK
    ========================= */

    return {
      success: false,

      message:
        `Unsupported subscription operation: ${operation}`,

      code:
        "UNSUPPORTED_OPERATION",

      supportedOperations:
        ALLOWED_OPERATIONS,

      metadata: {
        durationMs:
          Date.now() -
          startedAt,
      },
    };
  } catch (error) {
    logger.error(
      error?.message ||
        "Unknown subscription error"
    );

    return {
      success: false,

      message:
        "Subscription operation failed",

      error:
        error?.message ||
        "Unknown subscription error",

      code:
        "SUBSCRIPTION_AGENT_ERROR",

      metadata: {
        durationMs:
          Date.now() -
          startedAt,
      },
    };
  }
}

/* =========================================================
   AGENT CAPABILITIES
========================================================= */

subscriptionAgent.owns = [
  "subscription-lifecycle",
  "subscription-status",
  "subscription-entitlements",
  "subscription-limits",
  "subscription-usage",
  "subscription-plan-change",
];

subscriptionAgent.dependencies = [
  "billingAgent",
  "payment-verification-layer",
  "subscription-persistence-layer",
];

/* =========================================================
   EXPORT
========================================================= */

module.exports =
  subscriptionAgent;
