/* =========================================================
   ZYRIONOS BILLING AGENT
   ---------------------------------------------------------
   Responsibilities:

   - Own official ZyrionOS pricing catalog
   - Own resource entitlement catalog
   - Validate billing requests
   - Calculate monthly/yearly pricing
   - Return immutable plan snapshots
   - Provide resource limits to Subscription Agent
   - Provide deployment resource limits to Deploy Agent
   - Validate payment-related state when supplied
   - NEVER claim payment success without authoritative
     payment confirmation
   - NEVER activate a subscription by itself
   - NEVER invent resources outside the selected plan
   - NEVER grant unlimited infrastructure accidentally

   RESOURCE MODEL:

   Lower price
       ↓
   Lower resources

   Higher price
       ↓
   Higher resources

   Every plan has explicit:

   - CPU
   - RAM
   - Storage
   - Bandwidth
   - Deployment limits
   - AI credits
   - Thumbnail credits
   - Video credits
   - Feature entitlements

   AWS FARGATE COMPATIBILITY:

   Resource combinations are intentionally selected
   from supported Fargate CPU/memory combinations.

========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const {
  v4: uuidv4
} = require("uuid");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   CONSTANTS
========================================================= */

const BILLING_VERSION =
  "2.0.0";


const SUPPORTED_CURRENCY =
  "USD";


const SUPPORTED_PAYMENT_PROVIDERS = [

  "stripe",

  "razorpay"

];


/* =========================================================
   OFFICIAL PLAN CATALOG
=========================================================

   IMPORTANT:

   These values are the SOURCE OF TRUTH for the
   application-level entitlement layer.

   Subscription Agent and Deploy Agent should consume
   the resulting plan snapshot instead of inventing
   their own resource values.

========================================================= */

const plans = [

  /* =======================================================
     STARTER
     $19 / month
  ======================================================= */

  {

    name:
      "Starter",

    monthlyPrice:
      19,

    yearlyPrice:
      190,

    currency:
      SUPPORTED_CURRENCY,

    resources: {

      /*
       * Fargate-compatible:
       * 0.25 vCPU + 1 GB RAM
       */

      cpu:
        "0.25 vCPU",

      cpuUnits:
        256,

      ram:
        "1GB",

      ramGB:
        1,

      storage:
        "10GB",

      storageGB:
        10,

      bandwidth:
        "100GB",

      bandwidthGB:
        100

    },

    limits: {

      deployments:
        3,

      aiCredits:
        2000,

      thumbnailCredits:
        500,

      videoCredits:
        100

    },

    features: {

      customDomain:
        true,

      autoSSL:
        true,

      autoScaling:
        false,

      advancedMonitoring:
        false,

      priorityDeployments:
        false,

      dedicatedInfrastructure:
        false,

      dedicatedSupport:
        false

    },

    support:
      "Community Support",

    featureList: [

      "Basic Deployments",

      "AI Assistant",

      "SSL",

      "Custom Domains"

    ]

  },


  /* =======================================================
     PRO
     $99 / month
  ======================================================= */

  {

    name:
      "Pro",

    monthlyPrice:
      99,

    yearlyPrice:
      990,

    currency:
      SUPPORTED_CURRENCY,

    resources: {

      /*
       * Fargate-compatible:
       * 1 vCPU + 2 GB RAM
       */

      cpu:
        "1 vCPU",

      cpuUnits:
        1024,

      ram:
        "2GB",

      ramGB:
        2,

      storage:
        "50GB",

      storageGB:
        50,

      bandwidth:
        "500GB",

      bandwidthGB:
        500

    },

    limits: {

      deployments:
        15,

      aiCredits:
        10000,

      thumbnailCredits:
        5000,

      videoCredits:
        1000

    },

    features: {

      customDomain:
        true,

      autoSSL:
        true,

      autoScaling:
        true,

      advancedMonitoring:
        true,

      priorityDeployments:
        true,

      dedicatedInfrastructure:
        false,

      dedicatedSupport:
        false

    },

    support:
      "Priority Support",

    featureList: [

      "Advanced AI",

      "Priority Deployments",

      "AI Thumbnail Generator",

      "Advanced Monitoring",

      "Auto Scaling"

    ]

  },


  /* =======================================================
     BUSINESS
     $199 / month
  ======================================================= */

  {

    name:
      "Business",

    monthlyPrice:
      199,

    yearlyPrice:
      1990,

    currency:
      SUPPORTED_CURRENCY,

    resources: {

      /*
       * Fargate-compatible:
       * 2 vCPU + 4 GB RAM
       */

      cpu:
        "2 vCPU",

      cpuUnits:
        2048,

      ram:
        "4GB",

      ramGB:
        4,

      storage:
        "150GB",

      storageGB:
        150,

      bandwidth:
        "1TB",

      bandwidthGB:
        1024

    },

    limits: {

      deployments:
        100,

      aiCredits:
        50000,

      thumbnailCredits:
        25000,

      videoCredits:
        10000

    },

    features: {

      customDomain:
        true,

      autoSSL:
        true,

      autoScaling:
        true,

      advancedMonitoring:
        true,

      priorityDeployments:
        true,

      dedicatedInfrastructure:
        false,

      dedicatedSupport:
        true

    },

    support:
      "Premium Support",

    featureList: [

      "Business AI Automation",

      "Auto Scaling",

      "Advanced Analytics",

      "Team Features",

      "Priority AI Processing",

      "Premium Support"

    ]

  },


  /* =======================================================
     SCALE
     $299 / month
  ======================================================= */

  {

    name:
      "Scale",

    monthlyPrice:
      299,

    yearlyPrice:
      2990,

    currency:
      SUPPORTED_CURRENCY,

    resources: {

      /*
       * Fargate-compatible:
       * 4 vCPU + 8 GB RAM
       */

      cpu:
        "4 vCPU",

      cpuUnits:
        4096,

      ram:
        "8GB",

      ramGB:
        8,

      storage:
        "300GB",

      storageGB:
        300,

      bandwidth:
        "2TB",

      bandwidthGB:
        2048

    },

    limits: {

      deployments:
        250,

      aiCredits:
        100000,

      thumbnailCredits:
        50000,

      videoCredits:
        25000

    },

    features: {

      customDomain:
        true,

      autoSSL:
        true,

      autoScaling:
        true,

      advancedMonitoring:
        true,

      priorityDeployments:
        true,

      dedicatedInfrastructure:
        true,

      dedicatedSupport:
        true

    },

    support:
      "Priority Business Support",

    featureList: [

      "High-Scale AI Automation",

      "Advanced Auto Scaling",

      "Advanced Analytics",

      "Team Collaboration",

      "Priority AI Processing",

      "Dedicated Infrastructure",

      "Premium Monitoring"

    ]

  },


  /* =======================================================
     ENTERPRISE
     $499 / month
  ======================================================= */

  {

    name:
      "Enterprise",

    monthlyPrice:
      499,

    yearlyPrice:
      4990,

    currency:
      SUPPORTED_CURRENCY,

    resources: {

      /*
       * Fargate-compatible:
       * 8 vCPU + 16 GB RAM
       */

      cpu:
        "8 vCPU",

      cpuUnits:
        8192,

      ram:
        "16GB",

      ramGB:
        16,

      storage:
        "1TB",

      storageGB:
        1024,

      bandwidth:
        "5TB",

      bandwidthGB:
        5120

    },

    limits: {

      /*
       * Enterprise does not mean literally
       * infinite infrastructure.
       */

      deployments:
        500,

      aiCredits:
        500000,

      thumbnailCredits:
        100000,

      videoCredits:
        50000

    },

    features: {

      customDomain:
        true,

      autoSSL:
        true,

      autoScaling:
        true,

      advancedMonitoring:
        true,

      priorityDeployments:
        true,

      dedicatedInfrastructure:
        true,

      dedicatedSupport:
        true

    },

    support:
      "Dedicated Success Support",

    featureList: [

      "Enterprise AI",

      "High-Scale Deployments",

      "Dedicated Infrastructure",

      "Enterprise Monitoring",

      "Priority AI Processing",

      "Advanced Automation",

      "Dedicated Support"

    ]

  }

];


/* =========================================================
   SAFE STRING
========================================================= */

function cleanString(
  value,
  maxLength = 500
) {

  if (
    typeof value !==
    "string"
  ) {

    return "";

  }


  return value
    .trim()
    .slice(
      0,
      maxLength
    );

}


/* =========================================================
   USER ID
========================================================= */

function normalizeUserId(
  value
) {

  const userId =
    cleanString(
      value,
      300
    );


  return userId || null;

}


/* =========================================================
   BILLING CYCLE
========================================================= */

function normalizeBillingCycle(
  value
) {

  return value ===
    "yearly"

    ? "yearly"

    : "monthly";

}


/* =========================================================
   PLAN LOOKUP
========================================================= */

function getPlanByName(
  planName
) {

  const normalized =
    cleanString(
      planName,
      100
    )
      .toLowerCase();


  if (
    !normalized
  ) {

    return null;

  }


  return (

    plans.find(
      (
        plan
      ) =>
        plan.name
          .toLowerCase() ===
        normalized
    ) ||

    null

  );

}


/* =========================================================
   PLAN VALIDATION
========================================================= */

function validatePlan(
  plan
) {

  if (
    !plan ||
    typeof plan !==
      "object"
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
    plan.currency !==
    SUPPORTED_CURRENCY
  ) {

    return false;

  }


  if (
    !Number.isFinite(
      Number(
        plan.monthlyPrice
      )
    ) ||

    Number(
      plan.monthlyPrice
    ) < 0
  ) {

    return false;

  }


  if (
    !Number.isFinite(
      Number(
        plan.yearlyPrice
      )
    ) ||

    Number(
      plan.yearlyPrice
    ) < 0
  ) {

    return false;

  }


  if (
    !plan.resources
  ) {

    return false;

  }


  if (
    !Number.isFinite(
      Number(
        plan.resources
          .cpuUnits
      )
    )
  ) {

    return false;

  }


  if (
    !Number.isFinite(
      Number(
        plan.resources
          .ramGB
      )
    ) ||

    Number(
      plan.resources.ramGB
    ) <= 0
  ) {

    return false;

  }


  if (
    !Number.isFinite(
      Number(
        plan.resources
          .storageGB
      )
    ) ||

    Number(
      plan.resources.storageGB
    ) <= 0
  ) {

    return false;

  }


  if (
    !Number.isFinite(
      Number(
        plan.resources
          .bandwidthGB
      )
    ) ||

    Number(
      plan.resources.bandwidthGB
    ) <= 0
  ) {

    return false;

  }


  if (
    !plan.limits
  ) {

    return false;

  }


  const limits = [

    plan.limits.deployments,

    plan.limits.aiCredits,

    plan.limits.thumbnailCredits,

    plan.limits.videoCredits

  ];


  for (
    const limit of limits
  ) {

    if (
      !Number.isFinite(
        Number(limit)
      ) ||

      Number(limit) < 0
    ) {

      return false;

    }

  }


  return true;

}


/* =========================================================
   RESOURCE SANITY VALIDATION
=========================================================

   These rules prevent accidental plan configuration
   explosions.

========================================================= */

function validateResourceEconomics(
  plan
) {

  if (
    !validatePlan(
      plan
    )
  ) {

    return {

      valid:
        false,

      reason:
        "Invalid plan structure."

    };

  }


  const price =
    Number(
      plan.monthlyPrice
    );


  const ram =
    Number(
      plan.resources.ramGB
    );


  const storage =
    Number(
      plan.resources.storageGB
    );


  /*
   * Basic safety ceiling.

   * These are intentionally conservative.
   */

  const maxRamByPrice = {

    19:
      1,

    99:
      2,

    199:
      4,

    299:
      8,

    499:
      16

  };


  if (
    maxRamByPrice[price] &&
    ram >
      maxRamByPrice[price]
  ) {

    return {

      valid:
        false,

      reason:
        `RAM entitlement exceeds configured economic ceiling for ${plan.name}.`

    };

  }


  /*
   * Storage should remain bounded relative
   * to the plan price.

   * This is a guardrail, not the pricing formula.
   */

  const maxStorageByPrice = {

    19:
      10,

    99:
      50,

    199:
      150,

    299:
      300,

    499:
      1024

  };


  if (
    maxStorageByPrice[price] &&
    storage >
      maxStorageByPrice[price]
  ) {

    return {

      valid:
        false,

      reason:
        `Storage entitlement exceeds configured economic ceiling for ${plan.name}.`

    };

  }


  return {

    valid:
      true

  };

}


/* =========================================================
   CALCULATE NEXT BILLING DATE
========================================================= */

function calculateNextBillingDate(
  startDate,
  billingCycle
) {

  const nextDate =
    new Date(
      startDate
    );


  if (
    billingCycle ===
    "yearly"
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
   * Handle dates such as January 31
   * moving into shorter months.
   */

  if (
    nextDate.getDate() !==
    originalDay
  ) {

    nextDate.setDate(
      0
    );

  }


  return nextDate;

}


/* =========================================================
   DEEP PLAN SNAPSHOT
========================================================= */

function createPlanSnapshot(
  plan
) {

  return {

    name:
      plan.name,

    monthlyPrice:
      plan.monthlyPrice,

    yearlyPrice:
      plan.yearlyPrice,

    currency:
      plan.currency,

    /*
     * Legacy-compatible top-level resources.
     */

    ram:
      plan.resources.ram,

    ramGB:
      plan.resources.ramGB,

    cpu:
      plan.resources.cpu,

    cpuUnits:
      plan.resources.cpuUnits,

    storage:
      plan.resources.storage,

    storageGB:
      plan.resources.storageGB,

    bandwidth:
      plan.resources.bandwidth,

    bandwidthGB:
      plan.resources.bandwidthGB,

    /*
     * Structured resource contract.
     */

    resources: {

      cpu:
        plan.resources.cpu,

      cpuUnits:
        plan.resources.cpuUnits,

      ram:
        plan.resources.ram,

      ramGB:
        plan.resources.ramGB,

      storage:
        plan.resources.storage,

      storageGB:
        plan.resources.storageGB,

      bandwidth:
        plan.resources.bandwidth,

      bandwidthGB:
        plan.resources.bandwidthGB

    },

    /*
     * Legacy-compatible limits.
     */

    deploymentsLimit:
      plan.limits.deployments,

    aiCredits:
      plan.limits.aiCredits,

    thumbnailCredits:
      plan.limits.thumbnailCredits,

    videoCredits:
      plan.limits.videoCredits,

    /*
     * Feature entitlements.
     */

    customDomain:
      plan.features.customDomain,

    autoSSL:
      plan.features.autoSSL,

    autoScaling:
      plan.features.autoScaling,

    advancedMonitoring:
      plan.features.advancedMonitoring,

    priorityDeployments:
      plan.features.priorityDeployments,

    dedicatedInfrastructure:
      plan.features.dedicatedInfrastructure,

    dedicatedSupport:
      plan.features.dedicatedSupport,

    support:
      plan.support,

    features:
      [
        ...plan.featureList
      ]

  };

}


/* =========================================================
   PAYMENT PROVIDER NORMALIZATION
========================================================= */

function normalizePaymentProvider(
  value
) {

  if (
    !value
  ) {

    return null;

  }


  return cleanString(
    value,
    50
  ).toLowerCase();

}


/* =========================================================
   AUTHORITATIVE PAYMENT CHECK
========================================================= */

function hasAuthoritativePayment(
  data
) {

  if (
    data.paymentConfirmed ===
    true
  ) {

    return true;

  }


  if (
    data.paymentStatus ===
    "paid"
  ) {

    return true;

  }


  if (
    data.paymentStatus ===
    "succeeded"
  ) {

    return true;

  }


  if (
    data.status ===
    "paid"
  ) {

    return true;

  }


  if (
    data.status ===
    "succeeded"
  ) {

    return true;

  }


  return false;

}


/* =========================================================
   BILLING AGENT
========================================================= */

async function billingAgent(
  userData = {}
) {

  try {

    logger.info(
      "💳 ZyrionOS Billing Agent Started"
    );


    /* =====================================================
       PAYLOAD VALIDATION
    ===================================================== */

    if (
      !userData ||
      typeof userData !==
        "object" ||
      Array.isArray(
        userData
      )
    ) {

      return {

        success:
          false,

        message:
          "Invalid billing payload"

      };

    }


    /* =====================================================
       USER
    ===================================================== */

    const userId =
      normalizeUserId(
        userData.userId
      );


    if (
      !userId
    ) {

      return {

        success:
          false,

        message:
          "Authenticated user ID required"

      };

    }


    /* =====================================================
       OPERATION
    ===================================================== */

    const operation =
      cleanString(
        userData.operation ||
        userData.action ||
        "quote",
        100
      )
        .toLowerCase();


    /* =====================================================
       PLAN
    ===================================================== */

    const planName =
      userData.plan ||
      "Starter";


    const selectedPlan =
      getPlanByName(
        planName
      );


    if (
      !selectedPlan
    ) {

      return {

        success:
          false,

        message:
          "Invalid plan selected",

        availablePlans:
          plans.map(
            (
              plan
            ) =>
              plan.name
          )

      };

    }


    /* =====================================================
       PLAN VALIDATION
    ===================================================== */

    if (
      !validatePlan(
        selectedPlan
      )
    ) {

      logger.error(
        `Invalid billing configuration: ${selectedPlan.name}`
      );


      return {

        success:
          false,

        message:
          "Selected billing plan is incorrectly configured"

      };

    }


    /* =====================================================
       ECONOMIC VALIDATION
    ===================================================== */

    const economics =
      validateResourceEconomics(
        selectedPlan
      );


    if (
      !economics.valid
    ) {

      logger.error(
        economics.reason
      );


      return {

        success:
          false,

        message:
          "Billing resource configuration failed",

        error:
          economics.reason

      };

    }


    /* =====================================================
       BILLING CYCLE
    ===================================================== */

    const billingCycle =
      normalizeBillingCycle(
        userData.billingCycle
      );


    /* =====================================================
       PRICE
    ===================================================== */

    const finalPrice =

      billingCycle ===
      "yearly"

        ? selectedPlan.yearlyPrice

        : selectedPlan.monthlyPrice;


    /* =====================================================
       DATES
    ===================================================== */

    const now =
      new Date();


    const nextBillingDate =
      calculateNextBillingDate(
        now,
        billingCycle
      );


    /* =====================================================
       BILLING ID
    ===================================================== */

    const billingId =
      cleanString(
        userData.billingId,
        300
      ) ||
      uuidv4();


    /* =====================================================
       PAYMENT PROVIDER
    ===================================================== */

    const paymentProvider =
      normalizePaymentProvider(
        userData.paymentProvider
      );


    if (
      paymentProvider &&
      !SUPPORTED_PAYMENT_PROVIDERS
        .includes(
          paymentProvider
        )
    ) {

      return {

        success:
          false,

        message:
          "Unsupported payment provider",

        supportedProviders:
          [
            ...SUPPORTED_PAYMENT_PROVIDERS
          ]

      };

    }


    /* =====================================================
       PAYMENT STATE
    ===================================================== */

    const paymentConfirmed =
      hasAuthoritativePayment(
        userData
      );


    /*
     * Billing Agent itself never turns a pending
     * payment into a successful payment.
     *
     * It only preserves an authoritative state
     * supplied by the payment layer.
     */

    const paymentStatus =

      paymentConfirmed

        ? "paid"

        : "pending";


    const invoiceStatus =

      paymentConfirmed

        ? "paid"

        : "unpaid";


    const subscriptionStatus =

      paymentConfirmed

        ? "active"

        : "pending";


    /* =====================================================
       PLAN SNAPSHOT
    ===================================================== */

    const planSnapshot =
      createPlanSnapshot(
        selectedPlan
      );


    /* =====================================================
       BILLING DATA
    ===================================================== */

    const billingData = {

      billingId,

      userId,

      operation,

      selectedPlan:
        planSnapshot,

      billingCycle,

      amount:
        finalPrice,

      currency:
        selectedPlan.currency,

      paymentProvider,

      paymentStatus,

      invoiceStatus,

      subscriptionStatus,

      paymentConfirmed,

      entitlementActive:
        paymentConfirmed,

      providerCustomerId:
        userData.providerCustomerId ||
        null,

      providerSubscriptionId:
        userData.providerSubscriptionId ||
        null,

      paymentId:
        userData.paymentId ||
        null,

      autoRenew:
        userData.autoRenew !==
        false,

      nextBillingDate,

      createdAt:
        now,

      updatedAt:
        now

    };


    /* =====================================================
       OPERATION-SPECIFIC SAFETY
    ===================================================== */

    if (
      [
        "activate",
        "activate-subscription",
        "payment-confirmation"
      ].includes(
        operation
      )
    ) {

      if (
        !paymentConfirmed
      ) {

        logger.warning(
          `Billing activation blocked: payment not confirmed for ${planSnapshot.name}`
        );


        return {

          success:
            false,

          message:
            "Payment confirmation required before activation",

          billing:
            billingData,

          paymentRequired:
            true,

          paymentConfirmed:
            false,

          entitlementActive:
            false

        };

      }

    }


    /* =====================================================
       DEPLOYMENT VALIDATION
    ===================================================== */

    if (
      [
        "validate-deployment",
        "deployment-validation"
      ].includes(
        operation
      )
    ) {

      /*
       * If deployment requires payment, payment
       * must already be authoritative.

       * If caller explicitly says payment is not
       * required, validation can proceed.
       */

      const paymentRequired =
        userData.paymentRequired !==
        false;


      if (
        paymentRequired &&
        !paymentConfirmed
      ) {

        return {

          success:
            false,

          message:
            "Deployment requires confirmed payment",

          billing:
            billingData,

          paymentRequired:
            true,

          paymentConfirmed:
            false,

          entitlementActive:
            false

        };

      }

    }


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(

      `Billing Contract Ready` +

      ` | Plan=${planSnapshot.name}` +

      ` | Price=${selectedPlan.currency} ${finalPrice}` +

      ` | Cycle=${billingCycle}` +

      ` | RAM=${planSnapshot.ram}` +

      ` | CPU=${planSnapshot.cpu}` +

      ` | Storage=${planSnapshot.storage}`

    );


    /* =====================================================
       RESPONSE
    ===================================================== */

    return {

      success:
        true,

      billing:
        billingData,

      paymentRequired:
        true,

      paymentConfirmed,

      entitlementActive:
        paymentConfirmed,

      /*
       * Explicit resource contract for
       * Subscription and Deploy agents.
       */

      resources:
        planSnapshot.resources,

      limits: {

        deployments:
          planSnapshot
            .deploymentsLimit,

        aiCredits:
          planSnapshot
            .aiCredits,

        thumbnailCredits:
          planSnapshot
            .thumbnailCredits,

        videoCredits:
          planSnapshot
            .videoCredits

      },

      features: {

        customDomain:
          planSnapshot
            .customDomain,

        autoSSL:
          planSnapshot
            .autoSSL,

        autoScaling:
          planSnapshot
            .autoScaling,

        advancedMonitoring:
          planSnapshot
            .advancedMonitoring,

        priorityDeployments:
          planSnapshot
            .priorityDeployments,

        dedicatedInfrastructure:
          planSnapshot
            .dedicatedInfrastructure,

        dedicatedSupport:
          planSnapshot
            .dedicatedSupport

      },

      availablePlans:
        plans.map(
          (
            plan
          ) => ({

            name:
              plan.name,

            monthlyPrice:
              plan.monthlyPrice,

            yearlyPrice:
              plan.yearlyPrice,

            currency:
              plan.currency,

            resources:
              createPlanSnapshot(
                plan
              ).resources,

            deploymentsLimit:
              plan.limits
                .deployments

          })
        ),

      metadata: {

        agent:
          "billingAgent",

        version:
          BILLING_VERSION,

        generatedAt:
          now

      }

    };

  }

  catch (
    error
  ) {

    logger.error(

      `Billing Agent Failed: ${
        error?.message ||
        "Unknown billing error"
      }`

    );


    return {

      success:
        false,

      message:
        "Billing Agent Failed",

      error:
        error?.message ||
        "Unknown billing error"

    };

  }

}


/* =========================================================
   PUBLIC PLAN API
========================================================= */


/*
 * Return one immutable-style snapshot.
 */

billingAgent.getPlanByName =
  function (
    planName
  ) {

    const plan =
      getPlanByName(
        planName
      );


    if (
      !plan
    ) {

      return null;

    }


    return createPlanSnapshot(
      plan
    );

  };


/*
 * Return all public plans.
 */

billingAgent.getPlans =
  function () {

    return plans.map(
      (
        plan
      ) =>
        createPlanSnapshot(
          plan
        )
    );

  };


/*
 * Return only the resource contract.
 */

billingAgent.getPlanResources =
  function (
    planName
  ) {

    const plan =
      getPlanByName(
        planName
      );


    if (
      !plan
    ) {

      return null;

    }


    return {

      ...createPlanSnapshot(
        plan
      ).resources

    };

  };


/*
 * Validate the complete catalog at startup
 * or during tests.
 */

billingAgent.validateCatalog =
  function () {

    const errors = [];


    for (
      const plan of plans
    ) {

      if (
        !validatePlan(
          plan
        )
      ) {

        errors.push(
          `${plan?.name || "unknown"}: invalid plan`
        );

        continue;

      }


      const economics =
        validateResourceEconomics(
          plan
        );


      if (
        !economics.valid
      ) {

        errors.push(
          `${plan.name}: ${economics.reason}`
        );

      }

    }


    return {

      valid:
        errors.length ===
        0,

      errors

    };

  };


/* =========================================================
   METADATA
========================================================= */

billingAgent.version =
  BILLING_VERSION;


billingAgent.supportedPaymentProviders =
  [
    ...SUPPORTED_PAYMENT_PROVIDERS
  ];


billingAgent.planCount =
  plans.length;


/* =========================================================
   STARTUP VALIDATION
========================================================= */

const catalogValidation =
  billingAgent.validateCatalog();


if (
  !catalogValidation.valid
) {

  logger.error(

    `Billing plan catalog validation failed: ${
      catalogValidation.errors.join(
        " | "
      )
    }`

  );

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  billingAgent;
