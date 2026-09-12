/* =========================================================
   BILLING AGENT
   =========================================================
   Responsibilities:
   - Manage official ZyrionOS pricing plans
   - Validate billing requests
   - Calculate monthly/yearly pricing
   - Return normalized plan data
   - Provide the contract consumed by Subscription Agent
   - Never claim payment success
   - Never activate a subscription by itself
   ========================================================= */

const { v4: uuidv4 } =
  require("uuid");

/* =========================
   SERVICES
========================= */

const logger =
  require("../services/loggerService");

/* =========================================================
   PLANS
   =========================================================
   Monthly pricing:
   Starter     $19
   Pro         $99
   Business    $199
   Scale       $299
   Enterprise  $499
   ========================================================= */

const plans = [
  /* =========================
     STARTER — $19
  ========================= */

  {
    name: "Starter",

    monthlyPrice: 19,

    yearlyPrice: 190,

    currency: "USD",

    ram: "2GB",

    cpu: "1 vCPU",

    storage: "25GB",

    bandwidth: "250GB",

    deploymentsLimit: 3,

    aiCredits: 2000,

    thumbnailCredits: 500,

    videoCredits: 100,

    customDomain: true,

    autoSSL: true,

    autoScaling: false,

    advancedMonitoring: false,

    priorityDeployments: false,

    dedicatedInfrastructure: false,

    dedicatedSupport: false,

    support:
      "Community Support",

    features: [
      "Basic Deployments",
      "AI Assistant",
      "SSL",
      "Custom Domains",
    ],
  },

  /* =========================
     PRO — $99
  ========================= */

  {
    name: "Pro",

    monthlyPrice: 99,

    yearlyPrice: 990,

    currency: "USD",

    ram: "8GB",

    cpu: "4 vCPU",

    storage: "100GB",

    bandwidth: "1TB",

    deploymentsLimit: 15,

    aiCredits: 10000,

    thumbnailCredits: 5000,

    videoCredits: 1000,

    customDomain: true,

    autoSSL: true,

    autoScaling: true,

    advancedMonitoring: true,

    priorityDeployments: true,

    dedicatedInfrastructure: false,

    dedicatedSupport: false,

    support:
      "Priority Support",

    features: [
      "Advanced AI",
      "Priority Deployments",
      "AI Thumbnail Generator",
      "Advanced Monitoring",
      "Auto Scaling",
    ],
  },

  /* =========================
     BUSINESS — $199
  ========================= */

  {
    name: "Business",

    monthlyPrice: 199,

    yearlyPrice: 1990,

    currency: "USD",

    ram: "16GB",

    cpu: "8 vCPU",

    storage: "250GB",

    bandwidth: "Unlimited",

    deploymentsLimit: 100,

    aiCredits: 50000,

    thumbnailCredits: 25000,

    videoCredits: 10000,

    customDomain: true,

    autoSSL: true,

    autoScaling: true,

    advancedMonitoring: true,

    priorityDeployments: true,

    dedicatedInfrastructure: false,

    dedicatedSupport: true,

    support:
      "24/7 Premium Support",

    features: [
      "Business AI Automation",
      "Auto Scaling",
      "Advanced Analytics",
      "Team Features",
      "Priority AI Processing",
      "Premium Support",
    ],
  },

  /* =========================
     SCALE — $299
  ========================= */

  {
    name: "Scale",

    monthlyPrice: 299,

    yearlyPrice: 2990,

    currency: "USD",

    ram: "32GB",

    cpu: "12 vCPU",

    storage: "500GB",

    bandwidth: "Unlimited",

    deploymentsLimit: 250,

    aiCredits: 100000,

    thumbnailCredits: 50000,

    videoCredits: 25000,

    customDomain: true,

    autoSSL: true,

    autoScaling: true,

    advancedMonitoring: true,

    priorityDeployments: true,

    dedicatedInfrastructure: true,

    dedicatedSupport: true,

    support:
      "Priority Business Support",

    features: [
      "High-Scale AI Automation",
      "Advanced Auto Scaling",
      "Advanced Analytics",
      "Team Collaboration",
      "Priority AI Processing",
      "Dedicated Infrastructure",
      "Premium Monitoring",
    ],
  },

  /* =========================
     ENTERPRISE — $499
  ========================= */

  {
    name: "Enterprise",

    monthlyPrice: 499,

    yearlyPrice: 4990,

    currency: "USD",

    ram: "64GB",

    cpu: "16 vCPU",

    storage: "1TB",

    bandwidth: "Unlimited",

    deploymentsLimit: -1,

    aiCredits: -1,

    thumbnailCredits: -1,

    videoCredits: -1,

    customDomain: true,

    autoSSL: true,

    autoScaling: true,

    advancedMonitoring: true,

    priorityDeployments: true,

    dedicatedInfrastructure: true,

    dedicatedSupport: true,

    support:
      "Dedicated Success Manager",

    features: [
      "Unlimited AI",
      "Unlimited Deployments",
      "Dedicated Infrastructure",
      "Enterprise Monitoring",
      "Priority AI Processing",
      "Advanced Automation",
      "Dedicated Support",
    ],
  },
];

/* =========================================================
   PLAN VALIDATION
========================================================= */

function validatePlan(plan) {
  if (
    !plan ||
    typeof plan !== "object"
  ) {
    return false;
  }

  if (
    !plan.name ||
    !plan.currency
  ) {
    return false;
  }

  if (
    !Number.isFinite(
      Number(plan.monthlyPrice)
    ) ||
    Number(plan.monthlyPrice) < 0
  ) {
    return false;
  }

  if (
    !Number.isFinite(
      Number(plan.yearlyPrice)
    ) ||
    Number(plan.yearlyPrice) < 0
  ) {
    return false;
  }

  const limits = [
    plan.deploymentsLimit,
    plan.aiCredits,
    plan.thumbnailCredits,
    plan.videoCredits,
  ];

  for (const limit of limits) {
    if (
      limit !== -1 &&
      (
        !Number.isFinite(
          Number(limit)
        ) ||
        Number(limit) < 0
      )
    ) {
      return false;
    }
  }

  return true;
}

/* =========================================================
   GET PLAN
========================================================= */

function getPlanByName(
  planName
) {
  if (!planName) {
    return null;
  }

  const normalizedName =
    String(planName)
      .trim()
      .toLowerCase();

  return plans.find(
    (plan) =>
      plan.name
        .toLowerCase() ===
      normalizedName
  ) || null;
}

/* =========================================================
   USER VALIDATION
========================================================= */

function normalizeUserId(
  value
) {
  if (!value) {
    return null;
  }

  const userId =
    String(value).trim();

  return userId || null;
}

/* =========================================================
   BILLING CYCLE
========================================================= */

function normalizeBillingCycle(
  value
) {
  return value === "yearly"
    ? "yearly"
    : "monthly";
}

/* =========================================================
   NEXT BILLING DATE
========================================================= */

function calculateNextBillingDate(
  startDate,
  billingCycle
) {
  const nextDate =
    new Date(startDate);

  if (
    billingCycle === "yearly"
  ) {
    nextDate.setFullYear(
      nextDate.getFullYear() + 1
    );

    return nextDate;
  }

  /*
   * Calendar-month calculation.
   * This avoids treating every month as exactly
   * 30 days.
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
   PLAN SNAPSHOT
========================================================= */

function createPlanSnapshot(
  plan
) {
  return {
    name: plan.name,

    monthlyPrice:
      plan.monthlyPrice,

    yearlyPrice:
      plan.yearlyPrice,

    currency:
      plan.currency,

    ram:
      plan.ram,

    cpu:
      plan.cpu,

    storage:
      plan.storage,

    bandwidth:
      plan.bandwidth,

    /*
     * IMPORTANT:
     * -1 MUST remain -1.
     *
     * Subscription Agent uses -1 to represent
     * unlimited resources.
     */

    deploymentsLimit:
      plan.deploymentsLimit,

    aiCredits:
      plan.aiCredits,

    thumbnailCredits:
      plan.thumbnailCredits,

    videoCredits:
      plan.videoCredits,

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

    support:
      plan.support,

    features:
      Array.isArray(plan.features)
        ? [...plan.features]
        : [],
  };
}

/* =========================================================
   BILLING AGENT
========================================================= */

async function billingAgent(
  userData = {}
) {
  try {
    logger.info(
      "Billing Agent Started"
    );

    /* =========================
       PAYLOAD VALIDATION
    ========================= */

    if (
      !userData ||
      typeof userData !== "object"
    ) {
      return {
        success: false,

        message:
          "Invalid billing payload",
      };
    }

    /* =========================
       USER ID
    ========================= */

    const userId =
      normalizeUserId(
        userData.userId
      );

    /*
     * Billing must belong to a real
     * authenticated user.
     */

    if (!userId) {
      return {
        success: false,

        message:
          "Authenticated user ID required",
      };
    }

    /* =========================
       PLAN
    ========================= */

    const planName =
      userData.plan ||
      "Starter";

    const selectedPlan =
      getPlanByName(
        planName
      );

    if (!selectedPlan) {
      return {
        success: false,

        message:
          "Invalid plan selected",

        availablePlans:
          plans.map(
            (plan) =>
              plan.name
          ),
      };
    }

    /* =========================
       PLAN VALIDATION
    ========================= */

    if (
      !validatePlan(
        selectedPlan
      )
    ) {
      logger.error(
        `Invalid configuration for plan: ${selectedPlan.name}`
      );

      return {
        success: false,

        message:
          "Selected billing plan is incorrectly configured",
      };
    }

    /* =========================
       BILLING CYCLE
    ========================= */

    const billingCycle =
      normalizeBillingCycle(
        userData.billingCycle
      );

    /* =========================
       PRICE
    ========================= */

    const finalPrice =
      billingCycle === "yearly"
        ? selectedPlan.yearlyPrice
        : selectedPlan.monthlyPrice;

    /* =========================
       BILLING DATES
    ========================= */

    const now =
      new Date();

    const nextBillingDate =
      calculateNextBillingDate(
        now,
        billingCycle
      );

    /* =========================
       BILLING ID
    ========================= */

    const billingId =
      uuidv4();

    /* =========================
       PAYMENT PROVIDER
    ========================= */

    const paymentProvider =
      userData.paymentProvider
        ? String(
            userData.paymentProvider
          )
            .trim()
            .toLowerCase()
        : null;

    const allowedProviders = [
      "stripe",
      "razorpay",
    ];

    if (
      paymentProvider &&
      !allowedProviders.includes(
        paymentProvider
      )
    ) {
      return {
        success: false,

        message:
          "Unsupported payment provider",
      };
    }

    /* =========================
       PLAN SNAPSHOT
    ========================= */

    const planSnapshot =
      createPlanSnapshot(
        selectedPlan
      );

    /* =========================
       BILLING OBJECT
    ========================= */

    const billingData = {
      billingId,

      userId,

      selectedPlan:
        planSnapshot,

      billingCycle,

      amount:
        finalPrice,

      currency:
        selectedPlan.currency,

      paymentProvider,

      /*
       * Billing Agent does NOT claim that
       * payment succeeded.
       */

      paymentStatus:
        "pending",

      invoiceStatus:
        "unpaid",

      subscriptionStatus:
        "pending",

      paymentConfirmed: false,

      providerCustomerId:
        userData.providerCustomerId ||
        null,

      providerSubscriptionId:
        userData.providerSubscriptionId ||
        null,

      paymentId:
        userData.paymentId ||
        null,

      nextBillingDate,

      autoRenew:
        userData.autoRenew !== false,

      createdAt:
        now,

      updatedAt:
        now,
    };

    /* =========================
       LOG
    ========================= */

    logger.success(
      `Billing Generated: ${selectedPlan.name} - ${selectedPlan.currency} ${finalPrice}`
    );

    /* =========================
       RETURN
    ========================= */

    return {
      success: true,

      billing:
        billingData,

      /*
       * These values make the contract
       * explicit for Subscription Agent.
       */

      paymentRequired: true,

      paymentConfirmed: false,

      entitlementActive: false,

      availablePlans:
        plans.map(
          (plan) => ({
            name:
              plan.name,

            monthlyPrice:
              plan.monthlyPrice,

            yearlyPrice:
              plan.yearlyPrice,

            currency:
              plan.currency,
          })
        ),
    };
  } catch (error) {
    logger.error(
      error?.message ||
        "Billing agent failed"
    );

    return {
      success: false,

      message:
        "Billing agent failed",

      error:
        error?.message ||
        "Unknown billing error",
    };
  }
}

/* =========================================================
   PLAN ACCESS
========================================================= */

billingAgent.getPlanByName =
  getPlanByName;

billingAgent.getPlans =
  () =>
    plans.map(
      (plan) =>
        createPlanSnapshot(plan)
    );

/* =========================
   EXPORT
========================= */

module.exports =
  billingAgent;
