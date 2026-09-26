/* =========================================================
   ZYRIONOS DEPLOY AGENT
   ---------------------------------------------------------
   Production Deployment Orchestrator

   FLOW

   MASTER
      ↓
   BILLING / SUBSCRIPTION GATE
      ↓
   DOCKER
      ↓
   AWS
      ↓
   DOMAIN
      ↓
   SSL
      ↓
   MONITORING
      ↓
   SCALING
      ↓
   FINAL VERIFICATION
      ↓
   DEPLOYMENT RESULT

   OWNERSHIP
   ---------------------------------------------------------
   Deploy Agent owns deployment orchestration.

   It does NOT:
   - generate application code
   - call AI providers
   - process payments
   - invent payment success
   - invent subscription entitlements
   - invent URLs
   - report unverified health as healthy
   - fabricate infrastructure metrics

========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const {
  v4: uuidv4,
} = require("uuid");


/* =========================================================
   AGENTS
========================================================= */

const dockerAgent =
  require("./dockerAgent");

const awsAgent =
  require("./awsAgent");

const domainAgent =
  require("./domainAgent");

const sslAgent =
  require("./sslAgent");

const billingAgent =
  require("./billingAgent");

const subscriptionAgent =
  require("./subscriptionAgent");

const monitoringAgent =
  require("./monitoringAgent");

const scalingAgent =
  require("./scalingAgent");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   CONSTANTS
========================================================= */

const DEPLOYMENT_VERSION =
  "3.0.0";

const MAX_PROJECT_NAME_LENGTH =
  200;

const MAX_PROMPT_LENGTH =
  12000;

const MAX_FILES =
  1000;


/* =========================================================
   STRING HELPERS
========================================================= */

function cleanString(
  value,
  maxLength = 4000
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}


/* =========================================================
   OBJECT HELPERS
========================================================= */

function safeObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


/* =========================================================
   SUCCESS
========================================================= */

function isSuccessful(
  result
) {
  return Boolean(
    result &&
    result.success === true
  );
}


/* =========================================================
   ERROR
========================================================= */

function getErrorMessage(
  result,
  fallback = "Unknown deployment error"
) {
  return (
    result?.error ||
    result?.message ||
    fallback
  );
}


/* =========================================================
   USER
========================================================= */

function getUserId(
  data
) {
  return (
    data?.userId ||
    data?.user?.id ||
    data?.user?._id ||
    data?.user?.userId ||
    null
  );
}


/* =========================================================
   DEPLOYMENT ID
========================================================= */

function createDeploymentId(
  projectData
) {
  return (
    cleanString(
      projectData.deploymentId,
      300
    ) ||
    cleanString(
      projectData.requestId,
      300
    ) ||
    cleanString(
      projectData.workflowId,
      300
    ) ||
    uuidv4()
  );
}


/* =========================================================
   PLAN
========================================================= */

function normalizePlan(
  projectData
) {
  const plan =
    projectData.plan ||
    projectData.subscriptionPlan ||
    projectData.subscription?.activePlan ||
    projectData.subscription?.plan ||
    "Starter";

  return (
    cleanString(
      plan,
      100
    ) ||
    "Starter"
  );
}


/* =========================================================
   FRAMEWORK
========================================================= */

function normalizeFramework(
  projectData
) {
  return (
    cleanString(
      projectData.framework,
      200
    ) ||
    cleanString(
      projectData.planning?.framework,
      200
    ) ||
    cleanString(
      projectData.planData?.framework,
      200
    ) ||
    "node"
  );
}


/* =========================================================
   FILES
========================================================= */

function normalizeFiles(
  files
) {
  if (
    !Array.isArray(files)
  ) {
    return [];
  }

  return files
    .filter(
      (file) =>
        file &&
        typeof file === "object"
    )
    .slice(
      0,
      MAX_FILES
    );
}


/* =========================================================
   INPUT VALIDATION
========================================================= */

function validateProjectData(
  projectData
) {
  if (
    !projectData ||
    typeof projectData !==
      "object" ||
    Array.isArray(projectData)
  ) {
    return {
      valid: false,
      error:
        "Deployment project data is required.",
    };
  }

  const projectName =
    cleanString(
      projectData.projectName ||
        projectData.name,
      MAX_PROJECT_NAME_LENGTH
    );

  if (!projectName) {
    return {
      valid: false,
      error:
        "Project name required.",
    };
  }

  return {
    valid: true,
    projectName,
    files:
      normalizeFiles(
        projectData.files
      ),
  };
}


/* =========================================================
   RESULT EXTRACTION
========================================================= */

function extractSubscription(
  result
) {
  if (!result) {
    return null;
  }

  return (
    result.subscription ||
    result.data?.subscription ||
    result.data ||
    null
  );
}


function extractBilling(
  result
) {
  if (!result) {
    return null;
  }

  return (
    result.billing ||
    result.data?.billing ||
    result.data ||
    null
  );
}


/* =========================================================
   SUBSCRIPTION RESOURCE NORMALIZATION
   ---------------------------------------------------------
   Supports the new Subscription Agent contract.
========================================================= */

function getSubscriptionInfrastructure(
  subscription
) {
  const infrastructure =
    safeObject(
      subscription?.infrastructure
    );

  return {
    cpu:
      infrastructure.cpu ??
      subscription?.cpu ??
      null,

    ram:
      infrastructure.ram ??
      subscription?.ram ??
      null,

    storage:
      infrastructure.storage ??
      subscription?.storage ??
      null,

    bandwidth:
      infrastructure.bandwidth ??
      subscription?.bandwidth ??
      null,
  };
}


/* =========================================================
   DEPLOYMENT LIMIT
========================================================= */

function getDeploymentUsage(
  subscription
) {
  return Number(
    subscription?.usage
      ?.deploymentsUsed ??
      subscription?.deploymentsUsed ??
      0
  );
}


function getDeploymentLimit(
  subscription
) {
  const limit =
    subscription?.limits
      ?.deployments ??
    subscription?.deploymentsLimit;

  if (
    limit === -1
  ) {
    return -1;
  }

  const number =
    Number(limit);

  return Number.isFinite(number)
    ? number
    : 0;
}


/* =========================================================
   SUBSCRIPTION ENTITLEMENT
========================================================= */

function validateSubscriptionEntitlement(
  result
) {
  if (
    !isSuccessful(result)
  ) {
    return {
      valid: false,
      reason:
        getErrorMessage(
          result,
          "Subscription validation failed."
        ),
    };
  }

  const subscription =
    extractSubscription(
      result
    );

  if (!subscription) {
    return {
      valid: false,
      reason:
        "Subscription result did not contain subscription data.",
    };
  }

  if (
    subscription.status !==
    "active"
  ) {
    return {
      valid: false,
      reason:
        `Subscription is not active: ${
          subscription.status ||
          "unknown"
        }`,
    };
  }

  if (
    subscription.paymentConfirmed !==
      true &&
    subscription.paymentStatus !==
      "paid"
  ) {
    return {
      valid: false,
      reason:
        "Subscription payment has not been confirmed.",
    };
  }

  if (
    subscription.canDeploy ===
    false
  ) {
    return {
      valid: false,
      reason:
        "Current subscription does not allow deployment.",
    };
  }

  if (
    subscription.deploymentAccess ===
    false
  ) {
    return {
      valid: false,
      reason:
        "Deployment access is disabled.",
    };
  }

  const used =
    getDeploymentUsage(
      subscription
    );

  const limit =
    getDeploymentLimit(
      subscription
    );

  if (
    limit !== -1 &&
    used >= limit
  ) {
    return {
      valid: false,
      reason:
        "Deployment limit reached.",
      code:
        "DEPLOYMENT_LIMIT_REACHED",
    };
  }

  return {
    valid: true,
    subscription,
    deploymentUsage: {
      used,
      limit,
      remaining:
        limit === -1
          ? -1
          : Math.max(
              0,
              limit - used
            ),
    },
  };
}


/* =========================================================
   BILLING VALIDATION
   ---------------------------------------------------------
   Billing is only a payment-state gate here.

   Deploy Agent NEVER charges.
========================================================= */

function validateBillingResult(
  result,
  projectData
) {
  /*
   * Explicit free/trial/internal workflow.
   *
   * This must be intentionally supplied by
   * the trusted orchestration layer.
   */

  if (
    projectData.paymentRequired ===
    false
  ) {
    return {
      valid: true,
      bypassed: true,
      reason:
        "Payment was explicitly marked as not required.",
    };
  }

  if (!result) {
    return {
      valid: false,
      reason:
        "No authoritative billing result supplied.",
    };
  }

  if (
    !isSuccessful(result)
  ) {
    return {
      valid: false,
      reason:
        getErrorMessage(
          result,
          "Billing validation failed."
        ),
    };
  }

  const billing =
    extractBilling(
      result
    );

  /*
   * If billing says payment is required,
   * deployment must have authoritative confirmation.
   */

  const paymentRequired =
    billing?.paymentRequired ??
    projectData.paymentRequired ??
    true;

  if (
    paymentRequired !== false
  ) {
    const confirmed =
      billing?.paymentConfirmed === true ||
      projectData.paymentConfirmed === true ||
      billing?.paymentStatus === "paid" ||
      billing?.status === "paid";

    if (!confirmed) {
      return {
        valid: false,
        reason:
          "Payment has not been authoritatively confirmed.",
      };
    }
  }

  return {
    valid: true,
    billing,
  };
}


/* =========================================================
   BILLING RESOLUTION
========================================================= */

async function resolveBilling(
  projectData,
  deploymentId
) {
  /*
   * Master result has highest priority.
   */

  if (
    projectData.billingResult
  ) {
    return {
      result:
        projectData.billingResult,
      source:
        "master",
    };
  }

  /*
   * Existing billing state.
   */

  if (
    projectData.billing
  ) {
    return {
      result: {
        success: true,
        billing:
          projectData.billing,
      },
      source:
        "request",
    };
  }

  /*
   * Explicitly payment-free workflow.
   */

  if (
    projectData.paymentRequired ===
    false
  ) {
    return {
      result: {
        success: true,
        billing: {
          paymentRequired:
            false,
          paymentConfirmed:
            true,
        },
      },
      source:
        "not-required",
    };
  }

  /*
   * Validate existing payment state.
   *
   * Do NOT create a new subscription/payment.
   */

  try {
    const result =
      await billingAgent({
        operation:
          "validate-deployment",

        action:
          "validate-deployment",

        userId:
          getUserId(
            projectData
          ),

        projectId:
          projectData.projectId ||
          null,

        plan:
          normalizePlan(
            projectData
          ),

        billingCycle:
          projectData.billingCycle ||
          null,

        paymentProvider:
          projectData.paymentProvider ||
          null,

        paymentId:
          projectData.paymentId ||
          null,

        providerCustomerId:
          projectData.providerCustomerId ||
          null,

        providerSubscriptionId:
          projectData.providerSubscriptionId ||
          null,

        paymentConfirmed:
          projectData.paymentConfirmed ===
          true,

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null,
      });

    return {
      result,
      source:
        "billingAgent",
    };
  } catch (error) {
    return {
      result: {
        success: false,
        error:
          error?.message ||
          "Billing validation failed.",
      },
      source:
        "billingAgent",
    };
  }
}


/* =========================================================
   SUBSCRIPTION RESOLUTION
========================================================= */

async function resolveSubscription(
  projectData,
  deploymentId
) {
  /*
   * Master-provided result.
   */

  if (
    projectData.subscriptionResult
  ) {
    return {
      result:
        projectData.subscriptionResult,
      source:
        "master",
    };
  }

  /*
   * Direct subscription.
   */

  if (
    projectData.subscription
  ) {
    return {
      result: {
        success: true,
        subscription:
          projectData.subscription,
      },
      source:
        "request",
    };
  }

  /*
   * Read/validation operation only.
   */

  try {
    const result =
      await subscriptionAgent({
        operation:
          "validate-deployment",

        action:
          "validate-deployment",

        userId:
          getUserId(
            projectData
          ),

        projectId:
          projectData.projectId ||
          null,

        plan:
          normalizePlan(
            projectData
          ),

        paymentId:
          projectData.paymentId ||
          null,

        providerCustomerId:
          projectData.providerCustomerId ||
          null,

        providerSubscriptionId:
          projectData.providerSubscriptionId ||
          null,

        paymentConfirmed:
          projectData.paymentConfirmed ===
          true,

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null,
      });

    return {
      result,
      source:
        "subscriptionAgent",
    };
  } catch (error) {
    return {
      result: {
        success: false,
        error:
          error?.message ||
          "Subscription validation failed.",
      },
      source:
        "subscriptionAgent",
    };
  }
}


/* =========================================================
   DOCKER VALIDATION
========================================================= */

function validateDockerResult(
  result
) {
  if (
    !isSuccessful(result)
  ) {
    return {
      valid: false,
      reason:
        getErrorMessage(
          result,
          "Docker build failed."
        ),
    };
  }

  const docker =
    result.docker ||
    result.data?.docker ||
    result.data ||
    null;

  if (!docker) {
    return {
      valid: false,
      reason:
        "Docker Agent succeeded but returned no Docker artifact.",
    };
  }

  return {
    valid: true,
    docker,
  };
}


/* =========================================================
   AWS VALIDATION
========================================================= */

function validateAwsResult(
  result
) {
  if (
    !isSuccessful(result)
  ) {
    return {
      valid: false,
      reason:
        getErrorMessage(
          result,
          "AWS deployment failed."
        ),
    };
  }

  const aws =
    result.aws ||
    result.data?.aws ||
    result.data ||
    null;

  if (!aws) {
    return {
      valid: false,
      reason:
        "AWS Agent succeeded but returned no deployment information.",
    };
  }

  return {
    valid: true,
    aws,
  };
}


/* =========================================================
   DOMAIN VALIDATION
========================================================= */

function validateDomainResult(
  result
) {
  if (
    !isSuccessful(result)
  ) {
    return {
      valid: false,
      reason:
        getErrorMessage(
          result,
          "Domain configuration failed."
        ),
    };
  }

  const domain =
    result.domain ||
    result.data?.domain ||
    result.data ||
    null;

  if (!domain) {
    return {
      valid: false,
      reason:
        "Domain Agent succeeded but returned no domain information.",
    };
  }

  return {
    valid: true,
    domain,
  };
}


/* =========================================================
   SSL VALIDATION
========================================================= */

function validateSslResult(
  result
) {
  if (
    !isSuccessful(result)
  ) {
    return {
      valid: false,
      reason:
        getErrorMessage(
          result,
          "SSL activation failed."
        ),
    };
  }

  const ssl =
    result.ssl ||
    result.data?.ssl ||
    result.data ||
    null;

  if (!ssl) {
    return {
      valid: false,
      reason:
        "SSL Agent succeeded but returned no SSL information.",
    };
  }

  return {
    valid: true,
    ssl,
  };
}


/* =========================================================
   MONITORING
========================================================= */

function resolveHealth(
  result
) {
  if (
    !isSuccessful(result)
  ) {
    return {
      status:
        "unknown",
      verified:
        false,
    };
  }

  const data =
    result.monitoring ||
    result.data?.monitoring ||
    result.data ||
    {};

  const raw =
    data.health ||
    data.healthStatus ||
    data.status ||
    null;

  if (
    typeof raw !==
    "string"
  ) {
    return {
      status:
        "unknown",
      verified:
        false,
    };
  }

  const health =
    raw
      .trim()
      .toLowerCase();

  if (
    [
      "healthy",
      "ok",
      "running",
      "operational",
    ].includes(
      health
    )
  ) {
    return {
      status:
        "healthy",
      verified:
        true,
    };
  }

  if (
    [
      "unhealthy",
      "failed",
      "down",
      "error",
    ].includes(
      health
    )
  ) {
    return {
      status:
        "unhealthy",
      verified:
        true,
    };
  }

  return {
    status:
      "unknown",
    verified:
      false,
  };
}


/* =========================================================
   MONITORING EXECUTION
========================================================= */

async function runMonitoring(
  projectData,
  deploymentId,
  aws
) {
  try {
    return await monitoringAgent({
      deploymentId,

      projectId:
        projectData.projectId ||
        null,

      projectName:
        projectData.projectName,

      appName:
        projectData.projectName,

      userId:
        getUserId(
          projectData
        ),

      user:
        projectData.user,

      aws,

      workflowId:
        projectData.workflowId ||
        null,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error?.message ||
        "Monitoring failed.",
    };
  }
}


/* =========================================================
   SCALING
========================================================= */

async function runScaling(
  projectData,
  deploymentId,
  subscription,
  aws
) {
  try {
    return await scalingAgent({
      deploymentId,

      projectId:
        projectData.projectId ||
        null,

      projectName:
        projectData.projectName,

      appName:
        projectData.projectName,

      userId:
        getUserId(
          projectData
        ),

      user:
        projectData.user,

      workflowId:
        projectData.workflowId ||
        null,

      subscription,

      aws,

      autoScaling:
        subscription?.featureFlags
          ?.autoScaling === true ||
        subscription?.autoScaling === true,

      metricsSource:
        "infrastructure",
    });
  } catch (error) {
    return {
      success: false,
      error:
        error?.message ||
        "Scaling failed.",
    };
  }
}


/* =========================================================
   LIVE URL
========================================================= */

function resolveLiveUrl(
  ssl,
  domain,
  aws
) {
  const sslUrl =
    ssl?.securedUrl ||
    ssl?.httpsUrl ||
    ssl?.liveUrl;

  if (
    typeof sslUrl ===
      "string" &&
    sslUrl.trim()
  ) {
    return sslUrl.trim();
  }

  const domainUrl =
    domain?.fullDomain ||
    domain?.httpsUrl ||
    domain?.url;

  if (
    typeof domainUrl ===
      "string" &&
    domainUrl.trim()
  ) {
    return domainUrl.trim();
  }

  const providerUrl =
    aws?.publicUrl ||
    aws?.serviceUrl ||
    aws?.loadBalancerUrl ||
    aws?.url;

  if (
    typeof providerUrl ===
      "string" &&
    providerUrl.trim()
  ) {
    return providerUrl.trim();
  }

  return null;
}


/* =========================================================
   DEPLOYMENT STATE
========================================================= */

function createDeploymentState(
  deploymentId,
  projectData
) {
  return {
    deploymentId,

    workflowId:
      projectData.workflowId ||
      null,

    projectId:
      projectData.projectId ||
      null,

    projectName:
      projectData.projectName,

    status:
      "initializing",

    stages: {
      billing:
        "pending",

      subscription:
        "pending",

      docker:
        "pending",

      aws:
        "pending",

      domain:
        "pending",

      ssl:
        "pending",

      monitoring:
        "pending",

      scaling:
        "pending",
    },

    startedAt:
      new Date(),
  };
}


/* =========================================================
   MAIN DEPLOY AGENT
========================================================= */

async function deployAgent(
  projectData = {}
) {
  const startedAt =
    Date.now();

  let state =
    null;

  try {
    logger.info(
      "ZYRIONOS Deploy Agent Started"
    );


    /* =====================================================
       VALIDATION
    ===================================================== */

    const validation =
      validateProjectData(
        projectData
      );

    if (
      !validation.valid
    ) {
      return {
        success: false,

        message:
          "Deployment validation failed",

        error:
          validation.error,

        stage:
          "validation",
      };
    }


    const projectName =
      validation.projectName;

    const files =
      validation.files;

    const framework =
      normalizeFramework(
        projectData
      );

    const plan =
      normalizePlan(
        projectData
      );

    const userId =
      getUserId(
        projectData
      );

    const deploymentId =
      createDeploymentId(
        projectData
      );


    state =
      createDeploymentState(
        deploymentId,
        {
          ...projectData,
          projectName,
        }
      );


    /* =====================================================
       CONTEXT
    ===================================================== */

    const deploymentContext = {
      deploymentId,

      workflowId:
        projectData.workflowId ||
        null,

      projectId:
        projectData.projectId ||
        null,

      userId,

      projectName,

      framework,

      plan,

      paymentId:
        projectData.paymentId ||
        null,

      paymentConfirmed:
        projectData.paymentConfirmed ===
        true,

      paymentProvider:
        projectData.paymentProvider ||
        null,

      providerCustomerId:
        projectData.providerCustomerId ||
        null,

      providerSubscriptionId:
        projectData.providerSubscriptionId ||
        null,
    };


    /* =====================================================
       BILLING GATE
    ===================================================== */

    state.stages.billing =
      "running";


    const billingResolution =
      await resolveBilling(
        projectData,
        deploymentId
      );


    const billingValidation =
      validateBillingResult(
        billingResolution.result,
        projectData
      );


    if (
      !billingValidation.valid
    ) {
      state.status =
        "blocked";

      state.stages.billing =
        "failed";

      return {
        success: false,

        message:
          "Deployment blocked by billing validation",

        error:
          billingValidation.reason,

        stage:
          "billing",

        deployment: {
          deploymentId,
          projectName,
          status:
            "blocked",
        },

        billing:
          billingResolution.result ||
          null,
      };
    }


    state.stages.billing =
      "validated";


    /* =====================================================
       SUBSCRIPTION GATE
    ===================================================== */

    state.stages.subscription =
      "running";


    const subscriptionResolution =
      await resolveSubscription(
        projectData,
        deploymentId
      );


    const subscriptionValidation =
      validateSubscriptionEntitlement(
        subscriptionResolution.result
      );


    if (
      !subscriptionValidation.valid
    ) {
      state.status =
        "blocked";

      state.stages.subscription =
        "failed";

      return {
        success: false,

        message:
          "Deployment blocked by subscription entitlement",

        error:
          subscriptionValidation.reason,

        stage:
          "subscription",

        deployment: {
          deploymentId,
          projectName,
          status:
            "blocked",
        },

        subscription:
          subscriptionResolution.result ||
          null,
      };
    }


    state.stages.subscription =
      "validated";


    const subscription =
      subscriptionValidation.subscription;


    const infrastructure =
      getSubscriptionInfrastructure(
        subscription
      );


    /* =====================================================
       DOCKER
    ===================================================== */

    state.stages.docker =
      "running";


    let docker;

    try {
      docker =
        await dockerAgent({
          ...deploymentContext,

          projectName,

          framework,

          files,

          prompt:
            cleanString(
              projectData.prompt,
              MAX_PROMPT_LENGTH
            ),

          planning:
            projectData.planning ||
            projectData.planData ||
            null,

          workflow:
            projectData.workflow ||
            null,

          subscription,

          infrastructure,
        });
    } catch (error) {
      docker = {
        success: false,
        error:
          error?.message ||
          "Docker Agent failed.",
      };
    }


    const dockerValidation =
      validateDockerResult(
        docker
      );


    if (
      !dockerValidation.valid
    ) {
      state.status =
        "failed";

      state.stages.docker =
        "failed";

      return {
        success: false,

        message:
          "Docker build failed",

        error:
          dockerValidation.reason,

        stage:
          "docker",

        deployment: {
          deploymentId,
          projectName,
          status:
            "failed",
        },

        docker,
      };
    }


    state.stages.docker =
      "completed";


    /* =====================================================
       AWS
    ===================================================== */

    state.stages.aws =
      "running";


    let aws;

    try {
      aws =
        await awsAgent({
          ...deploymentContext,

          projectName,

          framework,

          docker:
            dockerValidation.docker,

          subscription,

          infrastructure,

          cpu:
            infrastructure.cpu,

          ram:
            infrastructure.ram,

          storage:
            infrastructure.storage,

          bandwidth:
            infrastructure.bandwidth,

          region:
            projectData.region ||
            process.env.AWS_REGION ||
            null,
        });
    } catch (error) {
      aws = {
        success: false,
        error:
          error?.message ||
          "AWS Agent failed.",
      };
    }


    const awsValidation =
      validateAwsResult(
        aws
      );


    if (
      !awsValidation.valid
    ) {
      state.status =
        "failed";

      state.stages.aws =
        "failed";

      return {
        success: false,

        message:
          "AWS deployment failed",

        error:
          awsValidation.reason,

        stage:
          "aws",

        deployment: {
          deploymentId,
          projectName,
          status:
            "failed",
        },

        docker,
        aws,
      };
    }


    state.stages.aws =
      "completed";


    /* =====================================================
       DOMAIN
    ===================================================== */

    state.stages.domain =
      "running";


    let domain;

    try {
      domain =
        await domainAgent({
          ...deploymentContext,

          projectName,

          deploymentId,

          aws:
            awsValidation.aws,

          publicUrl:
            awsValidation.aws
              ?.publicUrl ||
            awsValidation.aws
              ?.serviceUrl ||
            awsValidation.aws
              ?.loadBalancerUrl ||
            null,

          subscription,
        });
    } catch (error) {
      domain = {
        success: false,
        error:
          error?.message ||
          "Domain Agent failed.",
      };
    }


    const domainValidation =
      validateDomainResult(
        domain
      );


    if (
      !domainValidation.valid
    ) {
      state.status =
        "failed";

      state.stages.domain =
        "failed";

      return {
        success: false,

        message:
          "Domain configuration failed",

        error:
          domainValidation.reason,

        stage:
          "domain",

        deployment: {
          deploymentId,
          projectName,
          status:
            "failed",

          providerUrl:
            awsValidation.aws
              ?.publicUrl ||
            null,
        },

        docker,
        aws,
        domain,
      };
    }


    state.stages.domain =
      "completed";


    /* =====================================================
       SSL
    ===================================================== */

    state.stages.ssl =
      "running";


    let ssl;

    try {
      ssl =
        await sslAgent({
          ...deploymentContext,

          projectName,

          deploymentId,

          domain:
            domainValidation.domain,

          aws:
            awsValidation.aws,

          subscription,
        });
    } catch (error) {
      ssl = {
        success: false,
        error:
          error?.message ||
          "SSL Agent failed.",
      };
    }


    const sslValidation =
      validateSslResult(
        ssl
      );


    if (
      !sslValidation.valid
    ) {
      state.status =
        "deployed_without_verified_ssl";

      state.stages.ssl =
        "failed";


      /*
       * Infrastructure may already exist.
       * Do NOT falsely call entire deployment
       * destroyed.
       */

      return {
        success: false,

        message:
          "Infrastructure deployed but SSL activation failed",

        error:
          sslValidation.reason,

        stage:
          "ssl",

        deployment: {
          deploymentId,

          projectName,

          status:
            "deployed_without_verified_ssl",

          providerUrl:
            awsValidation.aws
              ?.publicUrl ||
            null,

          domain:
            domainValidation.domain,
        },

        docker,
        aws,
        domain,
        ssl,
      };
    }


    state.stages.ssl =
      "completed";


    /* =====================================================
       MONITORING
    ===================================================== */

    state.stages.monitoring =
      "running";


    const monitoring =
      await runMonitoring(
        {
          ...projectData,
          projectName,
        },

        deploymentId,

        awsValidation.aws
      );


    const health =
      resolveHealth(
        monitoring
      );


    if (
      isSuccessful(
        monitoring
      )
    ) {
      state.stages.monitoring =
        "completed";
    } else {
      state.stages.monitoring =
        "unverified";

      logger.warning(
        `Deployment health could not be verified: ${getErrorMessage(
          monitoring,
          "Unknown monitoring error"
        )}`
      );
    }


    /* =====================================================
       SCALING
    ===================================================== */

    let scaling =
      null;


    const autoScalingEnabled =
      subscription
        ?.featureFlags
        ?.autoScaling === true ||
      subscription
        ?.autoScaling === true;


    if (
      autoScalingEnabled
    ) {
      state.stages.scaling =
        "running";


      scaling =
        await runScaling(
          {
            ...projectData,
            projectName,
          },

          deploymentId,

          subscription,

          awsValidation.aws
        );


      if (
        isSuccessful(
          scaling
        )
      ) {
        state.stages.scaling =
          "completed";
      } else {
        state.stages.scaling =
          "unverified";

        logger.warning(
          `Auto scaling could not be verified: ${getErrorMessage(
            scaling,
            "Unknown scaling error"
          )}`
        );
      }
    } else {
      state.stages.scaling =
        "not-enabled";
    }


    /* =====================================================
       LIVE URL
    ===================================================== */

    const liveUrl =
      resolveLiveUrl(
        sslValidation.ssl,
        domainValidation.domain,
        awsValidation.aws
      );


    /* =====================================================
       FINAL STATUS
    ===================================================== */

    if (!liveUrl) {
      state.status =
        "deployed_without_url";
    } else if (
      health.verified &&
      health.status ===
        "healthy"
    ) {
      state.status =
        "deployed";
    } else if (
      health.verified &&
      health.status ===
        "unhealthy"
    ) {
      state.status =
        "deployed_unhealthy";
    } else {
      state.status =
        "deployed_health_unverified";
    }


    /* =====================================================
       FINAL DEPLOYMENT OBJECT
    ===================================================== */

    const deployment = {
      deploymentId,

      workflowId:
        projectData.workflowId ||
        null,

      projectId:
        projectData.projectId ||
        null,

      projectName,

      framework,

      plan,

      status:
        state.status,

      health:
        health.status,

      healthVerified:
        health.verified,

      provider:
        "AWS",

      liveUrl,

      providerUrl:
        awsValidation.aws
          ?.publicUrl ||
        awsValidation.aws
          ?.serviceUrl ||
        awsValidation.aws
          ?.loadBalancerUrl ||
        null,

      infrastructure,

      deploymentUsage:
        subscriptionValidation
          .deploymentUsage,

      services: {
        docker:
          dockerValidation.docker,

        aws:
          awsValidation.aws,

        domain:
          domainValidation.domain,

        ssl:
          sslValidation.ssl,

        monitoring:
          monitoring?.monitoring ||
          monitoring?.data ||
          null,

        scaling:
          scaling?.scaling ||
          scaling?.data ||
          null,
      },

      billing:
        extractBilling(
          billingResolution.result
        ),

      subscription,

      stages:
        state.stages,

      metadata: {
        environment:
          process.env.NODE_ENV ||
          "production",

        region:
          projectData.region ||
          process.env.AWS_REGION ||
          null,

        version:
          DEPLOYMENT_VERSION,

        deploymentAgent:
          "zyrionos-deploy-agent",

        durationMs:
          Date.now() -
          startedAt,
      },

      deployedAt:
        new Date(),
    };


    /* =====================================================
       SUCCESS
    ===================================================== */

    logger.success(
      `Deployment Completed | project=${projectName} | deploymentId=${deploymentId} | status=${state.status}`
    );


    return {
      success: true,

      message:
        liveUrl
          ? "Deployment completed."
          : "Deployment completed but no authoritative live URL was returned.",

      deployment,

      billing:
        billingResolution.result,

      subscription:
        subscriptionResolution.result,

      docker,

      aws,

      domain,

      ssl,

      monitoring,

      scaling,

      metadata: {
        agent:
          "deployAgent",

        version:
          DEPLOYMENT_VERSION,

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null,

        durationMs:
          Date.now() -
          startedAt,
      },
    };

  } catch (error) {
    const message =
      error?.message ||
      "Unknown deployment error";


    logger.error(
      `Deploy Agent Failed: ${message}`
    );


    if (state) {
      state.status =
        "failed";
    }


    return {
      success: false,

      message:
        "Deployment failed",

      error:
        message,

      stage:
        state?.stages ||
        null,

      deployment:
        state
          ? {
              deploymentId:
                state.deploymentId,

              projectName:
                state.projectName,

              status:
                "failed",
            }
          : null,

      metadata: {
        agent:
          "deployAgent",

        version:
          DEPLOYMENT_VERSION,

        durationMs:
          Date.now() -
          startedAt,
      },
    };
  }
}


/* =========================================================
   AGENT METADATA
========================================================= */

deployAgent.version =
  DEPLOYMENT_VERSION;


deployAgent.owns = [
  "deployment",
  "docker-orchestration",
  "aws-orchestration",
  "domain-orchestration",
  "ssl-orchestration",
  "deployment-health-verification",
  "deployment-url-resolution",
  "deployment-lifecycle",
];


deployAgent.dependencies = [
  "dockerAgent",
  "awsAgent",
  "domainAgent",
  "sslAgent",
  "billingAgent",
  "subscriptionAgent",
  "monitoringAgent",
  "scalingAgent",
];


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  deployAgent;
