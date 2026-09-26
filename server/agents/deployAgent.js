/* =========================================================
   ZYRIONOS DEPLOY AGENT
   ---------------------------------------------------------
   Production Deployment Orchestrator

   RESPONSIBILITY:

   Deployment Request
          ↓
   Deployment Validation
          ↓
   Billing / Entitlement Gate
          ↓
   Docker Build
          ↓
   AWS Deployment
          ↓
   Domain Configuration
          ↓
   SSL
          ↓
   Monitoring
          ↓
   Scaling
          ↓
   Final Deployment Verification
          ↓
   Canonical Deployment Result


   IMPORTANT OWNERSHIP:

   Master Agent
        ↓
   owns workflow orchestration

   Deploy Agent
        ↓
   owns deployment orchestration

   Deploy Agent coordinates:

      Docker
      AWS
      Domain
      SSL
      Monitoring
      Scaling


   Deploy Agent does NOT:

      - generate source code
      - directly call AI providers
      - invent deployment URLs
      - invent payment success
      - invent subscription entitlements
      - automatically charge users merely because
        deployment was requested
      - report unhealthy deployments as healthy


   BILLING / SUBSCRIPTION:

   Billing and Subscription are financial/business
   control planes.

   Deployment may consume their authoritative
   results, but should not blindly create a second
   payment/subscription operation.


   IDEMPOTENCY:

   deploymentId can be supplied by the caller.

   If absent, one is generated.

   workflowId/requestId may be used to correlate
   deployment attempts.


   FINAL SOURCE OF TRUTH:

   This agent only reports facts returned by
   downstream agents.

========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const {
  v4: uuidv4
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

const MAX_PROJECT_NAME_LENGTH =
  200;

const MAX_PROMPT_LENGTH =
  12000;

const MAX_FILES =
  1000;

const DEPLOYMENT_VERSION =
  "2.0.0";


/* =========================================================
   SAFE STRING
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
    .replace(
      /\u0000/g,
      ""
    )
    .trim()
    .slice(
      0,
      maxLength
    );

}


/* =========================================================
   SAFE OBJECT
========================================================= */

function safeObject(
  value
) {

  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {

    return {};

  }


  return value;

}


/* =========================================================
   SUCCESS CHECK
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
   ERROR MESSAGE
========================================================= */

function getErrorMessage(
  result,
  fallback
) {

  return (

    result?.error ||

    result?.message ||

    fallback ||

    "Unknown deployment error"

  );

}


/* =========================================================
   USER ID
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
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(
  projectData
) {

  const plan =

    projectData.plan ||

    projectData.subscriptionPlan ||

    projectData.subscription
      ?.plan ||

    "Starter";


  return cleanString(
    plan,
    100
  ) || "Starter";

}


/* =========================================================
   FRAMEWORK NORMALIZATION
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
      projectData.planning
        ?.framework,
      200
    ) ||

    cleanString(
      projectData.plan
        ?.framework,
      200
    ) ||

    "node"

  );

}


/* =========================================================
   FILE VALIDATION
========================================================= */

function normalizeFiles(
  files
) {

  if (
    !Array.isArray(
      files
    )
  ) {

    return [];

  }


  return files
    .filter(
      (
        file
      ) =>
        file &&
        typeof file ===
          "object"
    )
    .slice(
      0,
      MAX_FILES
    );

}


/* =========================================================
   REQUIRED INPUT VALIDATION
========================================================= */

function validateProjectData(
  projectData
) {

  if (
    !projectData ||
    typeof projectData !==
      "object"
  ) {

    return {

      valid:
        false,

      error:
        "Deployment project data is required."

    };

  }


  const projectName =
    cleanString(
      projectData.projectName ||
      projectData.name,
      MAX_PROJECT_NAME_LENGTH
    );


  if (
    !projectName
  ) {

    return {

      valid:
        false,

      error:
        "Project name required."

    };

  }


  const files =
    normalizeFiles(
      projectData.files
    );


  /*
   * Existing-project deployment may sometimes
   * be performed without files.
   *
   * Therefore files are not automatically required.
   */

  return {

    valid:
      true,

    projectName,

    files

  };

}


/* =========================================================
   ENTITLEMENT EXTRACTION
========================================================= */

function extractSubscription(
  result
) {

  if (
    !result
  ) {

    return null;

  }


  return (

    result.subscription ||

    result.data?.subscription ||

    result.data ||

    null

  );

}


/* =========================================================
   BILLING EXTRACTION
========================================================= */

function extractBilling(
  result
) {

  if (
    !result
  ) {

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
   ENTITLEMENT CHECK
   ---------------------------------------------------------
   This does NOT process a payment.

   It only determines whether an authoritative
   subscription result contains deployment access.
========================================================= */

function validateDeploymentEntitlement(
  subscriptionResult
) {

  if (
    !isSuccessful(
      subscriptionResult
    )
  ) {

    return {

      valid:
        false,

      reason:
        getErrorMessage(
          subscriptionResult,
          "Subscription validation failed."
        )

    };

  }


  const subscription =
    extractSubscription(
      subscriptionResult
    );


  if (
    !subscription
  ) {

    return {

      valid:
        false,

      reason:
        "Subscription result did not contain subscription data."

    };

  }


  /*
   * Explicit deployment permission fields.
   */

  if (
    subscription.canDeploy ===
    false
  ) {

    return {

      valid:
        false,

      reason:
        "Current subscription does not allow deployment."

    };

  }


  if (
    subscription.deploymentAccess ===
    false
  ) {

    return {

      valid:
        false,

      reason:
        "Deployment access is disabled for this subscription."

    };

  }


  /*
   * Deployment limits.

   * Support multiple possible field names so the
   * agent remains compatible with different
   * subscription implementations.
   */

  const deploymentsUsed =
    Number(
      subscription.deploymentsUsed
    );


  const deploymentsLimit =
    Number(
      subscription.deploymentsLimit
    );


  if (
    Number.isFinite(
      deploymentsLimit
    ) &&
    deploymentsLimit >= 0
  ) {

    if (
      Number.isFinite(
        deploymentsUsed
      ) &&
      deploymentsUsed >=
        deploymentsLimit
    ) {

      return {

        valid:
          false,

        reason:
          "Deployment limit reached."

      };

    }

  }


  return {

    valid:
      true,

    subscription

  };

}


/* =========================================================
   BILLING VALIDATION
   ---------------------------------------------------------
   Billing success is accepted only when explicitly
   supplied by the billing control plane.

   This function NEVER treats missing billing data
   as successful payment.
========================================================= */

function validateBillingResult(
  billingResult,
  projectData
) {

  /*
   * Existing deployment flows may intentionally
   * not require a payment operation.

   * In that case caller can explicitly set:
   *
   * paymentRequired: false
   */

  if (
    projectData.paymentRequired ===
    false
  ) {

    return {

      valid:
        true,

      bypassed:
        true,

      reason:
        "Payment not required for this deployment workflow."

    };

  }


  if (
    !billingResult
  ) {

    return {

      valid:
        false,

      reason:
        "No authoritative billing result was supplied."

    };

  }


  if (
    !isSuccessful(
      billingResult
    )
  ) {

    return {

      valid:
        false,

      reason:
        getErrorMessage(
          billingResult,
          "Billing validation failed."
        )

    };

  }


  const billing =
    extractBilling(
      billingResult
    );


  /*
   * Do not infer payment from an empty object.

   * Some billing agents return success for a
   * non-payment informational operation. That is
   * not automatically payment confirmation.
   */

  if (
    projectData.paymentRequired ===
    true
  ) {

    const confirmed =
      billing?.paymentConfirmed ===
        true ||

      billing?.paid ===
        true ||

      billing?.status ===
        "paid" ||

      billing?.status ===
        "active";


    if (
      !confirmed
    ) {

      return {

        valid:
          false,

        reason:
          "Billing agent did not provide authoritative payment confirmation."

      };

    }

  }


  return {

    valid:
      true,

    billing

  };

}


/* =========================================================
   SUBSCRIPTION RESOLUTION
   ---------------------------------------------------------
   Priority:

   1. subscriptionResult supplied by Master
   2. subscription supplied directly
   3. read/validation call to Subscription Agent

   The agent should not silently create a new
   subscription just because deployment was requested.
========================================================= */

async function resolveSubscription(
  projectData,
  deploymentId
) {

  if (
    projectData.subscriptionResult
  ) {

    return {

      result:
        projectData.subscriptionResult,

      source:
        "master"

    };

  }


  if (
    projectData.subscription
  ) {

    return {

      result: {

        success:
          true,

        subscription:
          projectData.subscription

      },

      source:
        "request"

    };

  }


  /*
   * Ask Subscription Agent for the current
   * deployment entitlement.

   * This is a validation/read operation.
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

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null

      });


    return {

      result,

      source:
        "subscriptionAgent"

    };

  }

  catch (
    error
  ) {

    return {

      result: {

        success:
          false,

        error:
          error?.message ||
          "Subscription validation failed."

      },

      source:
        "subscriptionAgent"

    };

  }

}


/* =========================================================
   BILLING RESOLUTION
========================================================= */

async function resolveBilling(
  projectData,
  deploymentId
) {

  /*
   * Master-provided authoritative result wins.
   */

  if (
    projectData.billingResult
  ) {

    return {

      result:
        projectData.billingResult,

      source:
        "master"

    };

  }


  /*
   * Direct billing result supplied by request.
   */

  if (
    projectData.billing
  ) {

    return {

      result: {

        success:
          true,

        billing:
          projectData.billing

      },

      source:
        "request"

    };

  }


  /*
   * If payment is explicitly not required,
   * do not call the billing agent.
   */

  if (
    projectData.paymentRequired ===
    false
  ) {

    return {

      result: {

        success:
          true,

        billing: {

          paymentRequired:
            false

        }

      },

      source:
        "not-required"

    };

  }


  /*
   * Billing validation.

   * IMPORTANT:
   * This should validate billing state rather than
   * blindly create a second payment.
   *
   * The Billing Agent must honor the operation
   * field.
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

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null

      });


    return {

      result,

      source:
        "billingAgent"

    };

  }

  catch (
    error
  ) {

    return {

      result: {

        success:
          false,

        error:
          error?.message ||
          "Billing validation failed."

      },

      source:
        "billingAgent"

    };

  }

}


/* =========================================================
   DOCKER RESULT VALIDATION
========================================================= */

function validateDockerResult(
  docker
) {

  if (
    !isSuccessful(
      docker
    )
  ) {

    return {

      valid:
        false,

      reason:
        getErrorMessage(
          docker,
          "Docker build failed."
        )

    };

  }


  /*
   * Docker result may expose different structures.
   */

  const dockerData =
    docker.docker ||
    docker.data?.docker ||
    docker.data ||
    null;


  if (
    !dockerData
  ) {

    return {

      valid:
        false,

      reason:
        "Docker Agent succeeded but returned no Docker artifact."

    };

  }


  return {

    valid:
      true,

    docker:
      dockerData

  };

}


/* =========================================================
   AWS RESULT VALIDATION
========================================================= */

function validateAwsResult(
  aws
) {

  if (
    !isSuccessful(
      aws
    )
  ) {

    return {

      valid:
        false,

      reason:
        getErrorMessage(
          aws,
          "AWS deployment failed."
        )

    };

  }


  const awsData =
    aws.aws ||
    aws.data?.aws ||
    aws.data ||
    null;


  if (
    !awsData
  ) {

    return {

      valid:
        false,

      reason:
        "AWS Agent succeeded but returned no deployment information."

    };

  }


  return {

    valid:
      true,

    aws:
      awsData

  };

}


/* =========================================================
   DOMAIN RESULT VALIDATION
========================================================= */

function validateDomainResult(
  domain
) {

  if (
    !isSuccessful(
      domain
    )
  ) {

    return {

      valid:
        false,

      reason:
        getErrorMessage(
          domain,
          "Domain configuration failed."
        )

    };

  }


  const domainData =
    domain.domain ||
    domain.data?.domain ||
    domain.data ||
    null;


  if (
    !domainData
  ) {

    return {

      valid:
        false,

      reason:
        "Domain Agent succeeded but returned no domain information."

    };

  }


  return {

    valid:
      true,

    domain:
      domainData

  };

}


/* =========================================================
   SSL RESULT VALIDATION
========================================================= */

function validateSslResult(
  ssl
) {

  if (
    !isSuccessful(
      ssl
    )
  ) {

    return {

      valid:
        false,

      reason:
        getErrorMessage(
          ssl,
          "SSL activation failed."
        )

    };

  }


  const sslData =
    ssl.ssl ||
    ssl.data?.ssl ||
    ssl.data ||
    null;


  if (
    !sslData
  ) {

    return {

      valid:
        false,

      reason:
        "SSL Agent succeeded but returned no SSL information."

    };

  }


  return {

    valid:
      true,

    ssl:
      sslData

  };

}


/* =========================================================
   LIVE URL RESOLUTION
========================================================= */

function resolveLiveUrl(
  sslData,
  domainData,
  awsData
) {

  /*
   * Preferred:

   * SSL secured URL
   */

  const sslUrl =

    sslData?.securedUrl ||

    sslData?.httpsUrl ||

    sslData?.liveUrl;


  if (
    typeof sslUrl ===
      "string" &&
    sslUrl.trim()
  ) {

    return sslUrl.trim();

  }


  /*
   * Canonical/custom domain
   */

  const domainUrl =

    domainData?.fullDomain ||

    domainData?.httpsUrl ||

    domainData?.url;


  if (
    typeof domainUrl ===
      "string" &&
    domainUrl.trim()
  ) {

    return domainUrl.trim();

  }


  /*
   * Provider URL.

   * This is a fallback only.
   */

  const providerUrl =

    awsData?.publicUrl ||

    awsData?.serviceUrl ||

    awsData?.loadBalancerUrl ||

    awsData?.url;


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
   HEALTH RESOLUTION
========================================================= */

function resolveHealth(
  monitoring
) {

  if (
    !monitoring ||
    monitoring.success !==
      true
  ) {

    return {

      status:
        "unknown",

      verified:
        false

    };

  }


  const data =
    monitoring.monitoring ||
    monitoring.data?.monitoring ||
    monitoring.data ||
    {};


  const health =
    data.health ||
    data.status ||
    data.healthStatus ||
    null;


  if (
    typeof health ===
      "string"
  ) {

    const normalized =
      health
        .trim()
        .toLowerCase();


    if (
      [
        "healthy",
        "ok",
        "running",
        "operational"
      ].includes(
        normalized
      )
    ) {

      return {

        status:
          "healthy",

        verified:
          true

      };

    }


    if (
      [
        "unhealthy",
        "failed",
        "down",
        "error"
      ].includes(
        normalized
      )
    ) {

      return {

        status:
          "unhealthy",

        verified:
          true

      };

    }

  }


  return {

    status:
      "unknown",

    verified:
      false

  };

}


/* =========================================================
   RUN MONITORING SAFELY
========================================================= */

async function runMonitoring(
  projectData,
  deploymentId
) {

  try {

    return await monitoringAgent({

      deploymentId,

      projectId:
        projectData.projectId ||
        null,

      appName:
        projectData.projectName,

      projectName:
        projectData.projectName,

      userId:
        getUserId(
          projectData
        ),

      user:
        projectData.user,

      workflowId:
        projectData.workflowId ||
        null

    });

  }

  catch (
    error
  ) {

    return {

      success:
        false,

      error:
        error?.message ||
        "Monitoring failed."

    };

  }

}


/* =========================================================
   RUN SCALING SAFELY
   ---------------------------------------------------------
   IMPORTANT:

   No fake CPU/RAM/user metrics.

   Scaling Agent should use actual infrastructure
   metrics or configure policy from subscription.
========================================================= */

async function runScaling(
  projectData,
  deploymentId,
  subscription
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

      autoScaling:
        subscription?.autoScaling ===
        true,

      /*
       * Explicitly tell Scaling Agent to
       * obtain real metrics rather than using
       * fabricated numbers.
       */

      metricsSource:
        "infrastructure"

    });

  }

  catch (
    error
  ) {

    return {

      success:
        false,

      error:
        error?.message ||
        "Scaling failed."

    };

  }

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
        "pending"

    },

    startedAt:
      new Date()

  };

}


/* =========================================================
   DEPLOY AGENT
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
      "🚀 ZyrionOS Deployment Agent Started"
    );


    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    const validation =
      validateProjectData(
        projectData
      );


    if (
      !validation.valid
    ) {

      logger.error(
        `Deployment Validation Failed: ${validation.error}`
      );


      return {

        success:
          false,

        message:
          "Deployment validation failed",

        error:
          validation.error,

        stage:
          "validation"

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


    const selectedPlan =
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

          projectName

        }

      );


    /* =====================================================
       DEPLOYMENT CONTEXT
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

      plan:
        selectedPlan,

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
        null

    };


    logger.info(

      `Deployment Context Created` +
      ` | deploymentId=${deploymentId}` +
      ` | project=${projectName}` +
      ` | plan=${selectedPlan}`

    );


    /* =====================================================
       BILLING GATE
       -----------------------------------------------------
       Do not automatically charge merely because
       deployAgent was invoked.

       If Master already validated billing,
       reuse that result.
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

        success:
          false,

        message:
          "Deployment blocked by billing validation",

        error:
          billingValidation.reason,

        stage:
          "billing",

        deployment:
          {

            deploymentId,

            projectName,

            status:
              "blocked"

          },

        billing:
          billingResolution.result ||

          null

      };

    }


    state.stages.billing =
      "validated";


    logger.success(
      "Deployment Billing Gate Passed"
    );


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
      validateDeploymentEntitlement(
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

        success:
          false,

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
            "blocked"

        },

        subscription:
          subscriptionResolution.result ||

          null

      };

    }


    state.stages.subscription =
      "validated";


    const subscription =
      subscriptionValidation.subscription;


    logger.success(
      "Deployment Subscription Gate Passed"
    );


    /* =====================================================
       DOCKER BUILD
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
            null

        });

    }

    catch (
      error
    ) {

      docker = {

        success:
          false,

        error:
          error?.message ||
          "Docker Agent failed."

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

        success:
          false,

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
            "failed"

        },

        billing:
          billingResolution.result,

        subscription:
          subscriptionResolution.result,

        docker

      };

    }


    state.stages.docker =
      "completed";


    logger.success(
      "Docker Build Completed"
    );


    /* =====================================================
       AWS DEPLOYMENT
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

          /*
           * Infrastructure limits are passed from
           * the authoritative subscription result.
           */

          cpu:
            subscription?.cpu,

          ram:
            subscription?.ram,

          storage:
            subscription?.storage,

          bandwidth:
            subscription?.bandwidth,

          region:
            projectData.region ||
            process.env.AWS_REGION ||
            null

        });

    }

    catch (
      error
    ) {

      aws = {

        success:
          false,

        error:
          error?.message ||
          "AWS Agent failed."

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

        success:
          false,

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
            "failed"

        },

        docker,

        aws

      };

    }


    state.stages.aws =
      "completed";


    logger.success(
      "AWS Deployment Completed"
    );


    /* =====================================================
       DOMAIN
       -----------------------------------------------------
       Pass the AWS deployment target so the domain
       layer knows what the domain should point to.
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
            awsValidation
              .aws
              ?.publicUrl ||

            awsValidation
              .aws
              ?.serviceUrl ||

            awsValidation
              .aws
              ?.loadBalancerUrl ||

            null

        });

    }

    catch (
      error
    ) {

      domain = {

        success:
          false,

        error:
          error?.message ||
          "Domain Agent failed."

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

        success:
          false,

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
            awsValidation
              .aws
              ?.publicUrl ||
            null

        },

        docker,

        aws,

        domain

      };

    }


    state.stages.domain =
      "completed";


    logger.success(
      "Domain Configuration Completed"
    );


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
            awsValidation.aws

        });

    }

    catch (
      error
    ) {

      ssl = {

        success:
          false,

        error:
          error?.message ||
          "SSL Agent failed."

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
        "failed";

      state.stages.ssl =
        "failed";


      return {

        success:
          false,

        message:
          "SSL activation failed",

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
            awsValidation
              .aws
              ?.publicUrl ||
            null,

          domain:
            domainValidation.domain

        },

        docker,

        aws,

        domain,

        ssl

      };

    }


    state.stages.ssl =
      "completed";


    logger.success(
      "SSL Activation Completed"
    );


    /* =====================================================
       MONITORING
       -----------------------------------------------------
       Monitoring is verification, not decoration.
    ===================================================== */

    state.stages.monitoring =
      "running";


    const monitoring =
      await runMonitoring(
        {

          ...projectData,

          projectName

        },

        deploymentId

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

      logger.success(
        "Monitoring Verification Completed"
      );

    }

    else {

      /*
       * Monitoring failure does NOT mean the
       * deployment itself failed.

       * It means health could not be verified.
       */

      state.stages.monitoring =
        "unverified";


      logger.warning(
        `Monitoring verification unavailable: ${getErrorMessage(
          monitoring,
          "Unknown monitoring error"
        )}`
      );

    }


    /* =====================================================
       AUTO SCALING
    ===================================================== */

    let scaling =
      null;


    if (
      subscription?.autoScaling ===
      true
    ) {

      state.stages.scaling =
        "running";


      scaling =
        await runScaling(

          {

            ...projectData,

            projectName

          },

          deploymentId,

          subscription

        );


      if (
        isSuccessful(
          scaling
        )
      ) {

        state.stages.scaling =
          "completed";


        logger.success(
          "Auto Scaling Configuration Completed"
        );

      }

      else {

        state.stages.scaling =
          "unverified";


        logger.warning(
          `Auto Scaling configuration unavailable: ${getErrorMessage(
            scaling,
            "Unknown scaling error"
          )}`
        );

      }

    }

    else {

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
       FINAL DEPLOYMENT VALIDATION
    ===================================================== */

    if (
      !liveUrl
    ) {

      state.status =
        "deployed_without_url";

      logger.warning(
        "Deployment completed but no authoritative live URL was returned."
      );

    }

    else {

      state.status =
        health.verified
          ? (
              health.status ===
              "healthy"
                ? "deployed"
                : "deployed_unhealthy"
            )
          : "deployed_health_unverified";

    }


    /* =====================================================
       INFRASTRUCTURE LIMITS
    ===================================================== */

    const infrastructure = {

      cpu:
        subscription?.cpu ??
        null,

      ram:
        subscription?.ram ??
        null,

      storage:
        subscription?.storage ??
        null,

      bandwidth:
        subscription?.bandwidth ??
        null

    };


    /* =====================================================
       FINAL RESULT
    ===================================================== */

    const deployment = {

      deploymentId,

      workflowId:
        projectData.workflowId ||
        null,

      projectId:
        projectData.projectId ||
        null,

      status:
        state.status,

      health:
        health.status,

      healthVerified:
        health.verified,

      provider:
        "AWS",

      projectName,

      framework,

      liveUrl,

      providerUrl:

        awsValidation
          .aws
          ?.publicUrl ||

        awsValidation
          .aws
          ?.serviceUrl ||

        awsValidation
          .aws
          ?.loadBalancerUrl ||

        null,

      infrastructure,

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

          null

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

        deploymentDurationMs:
          Date.now() -
          startedAt

      },

      deployedAt:
        new Date()

    };


    /* =====================================================
       FINAL LOGGING
    ===================================================== */

    logger.success(

      `🚀 Deployment Completed` +

      ` | Project=${projectName}` +

      ` | Deployment=${deploymentId}` +

      ` | Status=${state.status}` +

      ` | URL=${liveUrl || "unavailable"}`

    );


    /* =====================================================
       FINAL RESPONSE
    ===================================================== */

    return {

      success:
        true,

      message:
        liveUrl
          ? "Deployment completed."
          : "Deployment completed but live URL could not be verified.",

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

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null,

        durationMs:
          Date.now() -
          startedAt

      }

    };

  }

  catch (
    error
  ) {

    const message =
      error?.message ||
      "Unknown deployment error";


    logger.error(
      `Deploy Agent Failed: ${message}`
    );


    if (
      state
    ) {

      state.status =
        "failed";

    }


    return {

      success:
        false,

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
                "failed"

            }

          : null,

      metadata: {

        agent:
          "deployAgent",

        durationMs:
          Date.now() -
          startedAt

      }

    };

  }

}


/* =========================================================
   AGENT METADATA
========================================================= */

deployAgent.version =
DEPLOYMENT_VERSION;


deployAgent.owns = [

  "docker",

  "aws",

  "domain",

  "ssl",

  "monitoring",

  "scaling",

  "deployment_url"

];


deployAgent.dependencies = [

  "dockerAgent",

  "awsAgent",

  "domainAgent",

  "sslAgent",

  "billingAgent",

  "subscriptionAgent",

  "monitoringAgent",

  "scalingAgent"

];


/* =========================================================
   EXPORT
========================================================= */

module.exports =
deployAgent;
