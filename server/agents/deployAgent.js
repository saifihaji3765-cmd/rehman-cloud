/* =========================================================
   ZYRIONOS DEPLOY AGENT
   ---------------------------------------------------------
   Production Deployment Orchestrator
   Version: 4.0.0

   OWNERSHIP
   ---------------------------------------------------------
   Deploy Agent owns deployment orchestration.

   It coordinates:

   MASTER
      ↓
   ENVIRONMENT
      ↓
   BILLING
      ↓
   SUBSCRIPTION
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

   Deploy Agent DOES NOT:
   - generate application source code
   - call AI providers directly
   - process payments
   - create subscriptions
   - invent entitlements
   - invent URLs
   - expose secrets
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

const environmentAgent =
  require("./environmentAgent");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   CONSTANTS
========================================================= */

const DEPLOYMENT_VERSION =
  "4.0.0";

const MAX_PROJECT_NAME_LENGTH =
  200;

const MAX_PROMPT_LENGTH =
  12000;

const MAX_FILES =
  1000;

const MAX_ENVIRONMENT_NAME_LENGTH =
  50;


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
   SAFE OBJECT
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
   ERROR MESSAGE
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
   ENVIRONMENT
========================================================= */

function normalizeEnvironmentName(
  value
) {
  const normalized =
    cleanString(
      value,
      MAX_ENVIRONMENT_NAME_LENGTH
    ).toLowerCase();

  if (
    normalized ===
      "development" ||
    normalized ===
      "dev"
  ) {
    return "development";
  }

  if (
    normalized ===
      "preview" ||
    normalized ===
      "staging"
  ) {
    return "preview";
  }

  if (
    normalized ===
      "production" ||
    normalized ===
      "prod"
  ) {
    return "production";
  }

  /*
   * Production remains the backward-compatible
   * default for old deployment requests.
   */

  return "production";
}


/* =========================================================
   SECRET KEY DETECTION
========================================================= */

function looksSensitiveKey(
  key
) {
  const normalized =
    cleanString(
      key,
      300
    ).toLowerCase();

  return [
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "access_key",
    "accesskey",
    "private_key",
    "privatekey",
    "client_secret",
    "clientsecret",
    "authorization",
    "cookie",
    "session",
    "credential",
    "credentials",
  ].some(
    (fragment) =>
      normalized.includes(
        fragment
      )
  );
}


/* =========================================================
   REDACT ENVIRONMENT
   ---------------------------------------------------------
   Deployment Agent may internally receive real environment
   values from Environment Agent.

   Those values must NEVER appear in the final deployment
   response or logs.
========================================================= */

function sanitizeEnvironment(
  environment
) {
  if (
    !environment ||
    typeof environment !==
      "object"
  ) {
    return null;
  }

  const result = {};


  for (
    const [key, value]
    of Object.entries(
      environment
    )
  ) {
    if (
      looksSensitiveKey(
        key
      )
    ) {
      result[key] =
        "[REDACTED]";

      continue;
    }

    if (
      typeof value ===
      "object" &&
      value !== null
    ) {
      result[key] =
        sanitizeEnvironment(
          value
        );

      continue;
    }

    result[key] =
      typeof value ===
        "string"
        ? value.length > 500
          ? `${value.slice(
              0,
              100
            )}...[REDACTED]`
          : value
        : value;
  }

  return result;
}


/* =========================================================
   ENVIRONMENT SUMMARY
========================================================= */

function createEnvironmentSummary(
  result,
  environmentName
) {
  const environment =
    result?.environment ||
    result?.data?.environment ||
    result?.data ||
    {};

  return {
    name:
      environment.name ||
      environmentName,

    id:
      environment.id ||
      environment._id ||
      null,

    status:
      environment.status ||
      "unknown",

    ready:
      environment.ready === true ||
      result?.ready === true,

    variableCount:
      Number(
        environment.variableCount ||
        environment.variablesCount ||
        0
      ),

    configured:
      environment.configured !==
        false,

    deploymentSnapshotId:
      result?.deploymentSnapshotId ||
      environment.deploymentSnapshotId ||
      null,
  };
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
        typeof file ===
          "object"
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
   SUBSCRIPTION INFRASTRUCTURE
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
   DEPLOYMENT USAGE
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


/* =========================================================
   DEPLOYMENT LIMIT
========================================================= */

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

  return Number.isFinite(
    number
  )
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
========================================================= */

function validateBillingResult(
  result,
  projectData
) {
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

  const paymentRequired =
    billing?.paymentRequired ??
    projectData.paymentRequired ??
    true;

  if (
    paymentRequired !== false
  ) {
    const confirmed =
      billing?.paymentConfirmed ===
        true ||
      projectData.paymentConfirmed ===
        true ||
      billing?.paymentStatus ===
        "paid" ||
      billing?.status ===
        "paid";

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
   ENVIRONMENT RESOLUTION
   ---------------------------------------------------------
   Environment Agent is authoritative for project
   environment configuration.

   Deploy Agent never exposes resolved secret values.
========================================================= */

async function resolveDeploymentEnvironment(
  projectData,
  deploymentId
) {
  const environmentName =
    normalizeEnvironmentName(
      projectData.environmentName ||
      projectData.environment ||
      projectData.deployEnvironment ||
      "production"
    );


  /*
   * Master may already have performed readiness validation.
   * Deploy Agent still validates again because deployment
   * is a security boundary.
   */

  let readiness;

  try {
    readiness =
      await environmentAgent({
        action:
          "deployment_readiness",

        operation:
          "deployment_readiness",

        userId:
          getUserId(
            projectData
          ),

        projectId:
          projectData.projectId ||
          null,

        name:
          environmentName,

        environmentName,

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null,

        requestId:
          projectData.requestId ||
          null,
      });
  } catch (error) {
    return {
      success: false,

      error:
        error?.message ||
        "Environment readiness validation failed.",

      environmentName,
    };
  }


  if (
    !isSuccessful(
      readiness
    )
  ) {
    return {
      success: false,

      error:
        getErrorMessage(
          readiness,
          "Environment is not ready for deployment."
        ),

      environmentName,

      readiness,
    };
  }


  const readinessData =
    readiness?.environment ||
    readiness?.data?.environment ||
    readiness?.data ||
    {};


  const ready =
    readiness?.ready === true ||
    readinessData?.ready === true ||
    readinessData?.configured !== false;


  if (!ready) {
    return {
      success: false,

      error:
        readiness?.error ||
        "Deployment environment is not ready.",

      environmentName,

      readiness,
    };
  }


  /*
   * Create immutable deployment snapshot.
   */

  let snapshot;

  try {
    snapshot =
      await environmentAgent({
        action:
          "create_deployment_snapshot",

        operation:
          "create_deployment_snapshot",

        userId:
          getUserId(
            projectData
          ),

        projectId:
          projectData.projectId ||
          null,

        name:
          environmentName,

        environmentName,

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null,

        requestId:
          projectData.requestId ||
          null,
      });
  } catch (error) {
    return {
      success: false,

      error:
        error?.message ||
        "Environment deployment snapshot failed.",

      environmentName,
    };
  }


  if (
    !isSuccessful(
      snapshot
    )
  ) {
    return {
      success: false,

      error:
        getErrorMessage(
          snapshot,
          "Environment deployment snapshot failed."
        ),

      environmentName,

      readiness,

      snapshot,
    };
  }


  /*
   * Resolve actual environment values internally.
   *
   * IMPORTANT:
   * These values remain inside Deploy Agent.
   */

  let resolved;

  try {
    resolved =
      await environmentAgent({
        action:
          "resolve_for_deployment",

        operation:
          "resolve_for_deployment",

        userId:
          getUserId(
            projectData
          ),

        projectId:
          projectData.projectId ||
          null,

        name:
          environmentName,

        environmentName,

        deploymentId,

        workflowId:
          projectData.workflowId ||
          null,

        requestId:
          projectData.requestId ||
          null,

        deploymentSnapshotId:
          snapshot?.deploymentSnapshotId ||
          snapshot?.data
            ?.deploymentSnapshotId ||
          null,
      });
  } catch (error) {
    return {
      success: false,

      error:
        error?.message ||
        "Environment resolution failed.",

      environmentName,

      readiness,

      snapshot,
    };
  }


  if (
    !isSuccessful(
      resolved
    )
  ) {
    return {
      success: false,

      error:
        getErrorMessage(
          resolved,
          "Environment resolution failed."
        ),

      environmentName,

      readiness,

      snapshot,
    };
  }


  /*
   * Accept several compatibility response shapes.
   */

  const values =
    resolved.variables ||
    resolved.environmentVariables ||
    resolved.env ||
    resolved.data?.variables ||
    resolved.data?.environmentVariables ||
    resolved.data?.env ||
    {};


  return {
    success: true,

    environmentName,

    environmentId:
      resolved.environmentId ||
      resolved.environment?.id ||
      resolved.environment?._id ||
      resolved.data?.environmentId ||
      null,

    deploymentSnapshotId:
      resolved.deploymentSnapshotId ||
      snapshot?.deploymentSnapshotId ||
      snapshot?.data
        ?.deploymentSnapshotId ||
      null,

    values,

    summary:
      createEnvironmentSummary(
        {
          ...resolved,

          environment:
            resolved.environment ||
            readiness?.environment ||
            readiness?.data?.environment,
        },

        environmentName
      ),

    readiness,

    snapshot,
  };
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

  /*
   * SSL Agent success alone is not enough.
   *
   * HTTPS must actually be active.
   */

  const httpsReady =
    ssl.httpsReady === true ||
    ssl.sslReady === true ||
    ssl.status === "active";


  if (!httpsReady) {
    return {
      valid: false,

      reason:
        "SSL Agent returned success but HTTPS readiness could not be verified.",

      ssl,
    };
  }

  return {
    valid: true,

    ssl,
  };
}


/* =========================================================
   MONITORING HEALTH
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

      environmentName:
        normalizeEnvironmentName(
          projectData.environmentName ||
          projectData.environment ||
          "production"
        ),
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
   SCALING EXECUTION
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

      environmentName:
        normalizeEnvironmentName(
          projectData.environmentName ||
          projectData.environment ||
          "production"
        ),

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
  /*
   * Only accept URLs from verified SSL.
   */

  const sslVerified =
    ssl?.httpsReady === true ||
    ssl?.sslReady === true ||
    ssl?.status === "active";


  if (
    sslVerified
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
  }


  /*
   * Domain Agent may have a DNS URL, but that is
   * not necessarily HTTPS-ready.
   *
   * Only accept explicit verified HTTPS.
   */

  const domainHttpsReady =
    domain?.httpsReady === true ||
    domain?.sslReady === true;


  if (
    domainHttpsReady
  ) {
    const domainUrl =
      domain?.httpsUrl ||
      domain?.secureUrl ||
      domain?.fullDomain;

    if (
      typeof domainUrl ===
        "string" &&
      domainUrl.trim()
    ) {
      return domainUrl.trim();
    }
  }


  /*
   * AWS provider URL is useful as fallback, but it
   * must be explicitly supplied by AWS Agent.
   */

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

    environmentName:
      normalizeEnvironmentName(
        projectData.environmentName ||
        projectData.environment ||
        "production"
      ),

    status:
      "initializing",

    stages: {
      environment:
        "pending",

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
   FINAL SAFE ENVIRONMENT DATA
========================================================= */

function getSafeEnvironmentResult(
  environmentResult
) {
  if (
    !environmentResult
  ) {
    return null;
  }

  return {
    environment:
      environmentResult.summary ||
      null,

    environmentName:
      environmentResult.environmentName ||
      null,

    environmentId:
      environmentResult.environmentId ||
      null,

    deploymentSnapshotId:
      environmentResult.deploymentSnapshotId ||
      null,

    /*
     * Never return:
     *
     * environmentResult.values
     */

    ready:
      environmentResult.success === true,
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

    const environmentName =
      normalizeEnvironmentName(
        projectData.environmentName ||
        projectData.environment ||
        projectData.deployEnvironment ||
        "production"
      );


    state =
      createDeploymentState(
        deploymentId,
        {
          ...projectData,

          projectName,

          environmentName,
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

      requestId:
        projectData.requestId ||
        null,

      projectId:
        projectData.projectId ||
        null,

      userId,

      projectName,

      framework,

      plan,

      environmentName,

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
       ENVIRONMENT GATE
    ===================================================== */

    state.stages.environment =
      "running";


    const environmentResult =
      await resolveDeploymentEnvironment(
        {
          ...projectData,

          projectName,

          environmentName,
        },

        deploymentId
      );


    if (
      !environmentResult.success
    ) {
      state.status =
        "blocked";

      state.stages.environment =
        "failed";

      return {
        success: false,

        message:
          "Deployment blocked by environment validation",

        error:
          environmentResult.error,

        stage:
          "environment",

        deployment: {
          deploymentId,

          projectId:
            projectData.projectId ||
            null,

          projectName,

          environmentName,

          status:
            "blocked",
        },

        environment:
          getSafeEnvironmentResult(
            environmentResult
          ),
      };
    }


    state.stages.environment =
      "validated";


    const deploymentEnvironment =
      environmentResult.values;


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

          environmentName,

          status:
            "blocked",
        },

        billing:
          billingResolution.result ||
          null,

        environment:
          getSafeEnvironmentResult(
            environmentResult
          ),
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

          environmentName,

          status:
            "blocked",
        },

        subscription:
          subscriptionResolution.result ||
          null,

        environment:
          getSafeEnvironmentResult(
            environmentResult
          ),
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

    state.status =
      "building";

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

          /*
           * Environment values are passed only
           * to the trusted Docker Agent.
           *
           * They are NEVER returned from Deploy Agent.
           */

          environment:
            deploymentEnvironment,

          environmentName,

          environmentId:
            environmentResult.environmentId,

          deploymentSnapshotId:
            environmentResult.deploymentSnapshotId,

          resolveEnvironment:
            false,
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

          environmentName,

          status:
            "failed",
        },

        environment:
          getSafeEnvironmentResult(
            environmentResult
          ),

        docker,
      };
    }


    state.stages.docker =
      "completed";


    /* =====================================================
       AWS
    ===================================================== */

    state.status =
      "provisioning";

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

          /*
           * Runtime environment for the deployed
           * workload.
           */

          environment:
            deploymentEnvironment,

          environmentName,

          environmentId:
            environmentResult.environmentId,

          deploymentSnapshotId:
            environmentResult.deploymentSnapshotId,

          resolveEnvironment:
            false,
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

          environmentName,

          status:
            "failed",
        },

        environment:
          getSafeEnvironmentResult(
            environmentResult
          ),

        docker,

        aws,
      };
    }


    state.stages.aws =
      "completed";


    /* =====================================================
       DOMAIN
    ===================================================== */

    state.status =
      "securing";

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

          environmentName,
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

          environmentName,

          status:
            "failed",

          providerUrl:
            awsValidation.aws
              ?.publicUrl ||
            null,
        },

        environment:
          getSafeEnvironmentResult(
            environmentResult
          ),

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

          environmentName,
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

          environmentName,

          status:
            "deployed_without_verified_ssl",

          providerUrl:
            awsValidation.aws
              ?.publicUrl ||
            null,

          domain:
            domainValidation.domain,
        },

        environment:
          getSafeEnvironmentResult(
            environmentResult
          ),

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

    state.status =
      "verifying";

    state.stages.monitoring =
      "running";


    const monitoring =
      await runMonitoring(
        {
          ...projectData,

          projectName,

          environmentName,
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

            environmentName,
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
       ENVIRONMENT DEPLOYMENT MARK
       -----------------------------------------------------
       Do not put secret values here.
    ===================================================== */

    let environmentDeploymentState =
      null;


    try {
      environmentDeploymentState =
        await environmentAgent({
          action:
            "mark_deployed",

          operation:
            "mark_deployed",

          userId,

          projectId:
            projectData.projectId ||
            null,

          name:
            environmentName,

          environmentName,

          deploymentId,

          workflowId:
            projectData.workflowId ||
            null,

          requestId:
            projectData.requestId ||
            null,

          deploymentSnapshotId:
            environmentResult.deploymentSnapshotId ||
            null,

          status:
            state.status,

          liveUrl:
            liveUrl || null,
        });
    } catch (error) {
      environmentDeploymentState = {
        success: false,

        error:
          error?.message ||
          "Environment deployment state update failed.",
      };
    }


    /*
     * Environment bookkeeping failure should not
     * turn an already verified infrastructure
     * deployment into a fabricated failure.
     *
     * It is explicitly reported as degraded metadata.
     */

    if (
      !isSuccessful(
        environmentDeploymentState
      )
    ) {
      logger.warning(
        `Environment deployment state could not be recorded: ${getErrorMessage(
          environmentDeploymentState,
          "Unknown environment state error"
        )}`
      );
    }


    /* =====================================================
       FINAL DEPLOYMENT OBJECT
    ===================================================== */

    const deployment = {
      deploymentId,

      workflowId:
        projectData.workflowId ||
        null,

      requestId:
        projectData.requestId ||
        null,

      projectId:
        projectData.projectId ||
        null,

      projectName,

      framework,

      plan,

      environment: {
        name:
          environmentName,

        id:
          environmentResult.environmentId ||
          null,

        deploymentSnapshotId:
          environmentResult.deploymentSnapshotId ||
          null,

        ready:
          true,

        configured:
          environmentResult.summary
            ?.configured !== false,

        /*
         * No secret values.
         */
      },

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
          environmentName,

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

        environmentStateRecorded:
          isSuccessful(
            environmentDeploymentState
          ),
      },

      deployedAt:
        new Date(),
    };


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(
      `Deployment Completed | project=${projectName} | deploymentId=${deploymentId} | environment=${environmentName} | status=${state.status}`
    );


    /* =====================================================
       FINAL RESPONSE
       -----------------------------------------------------
       IMPORTANT:
       deploymentEnvironment is NEVER returned.
    ===================================================== */

    return {
      success: true,

      message:
        liveUrl
          ? "Deployment completed."
          : "Deployment completed but no authoritative live URL was returned.",

      deployment,

      environment:
        getSafeEnvironmentResult(
          environmentResult
        ),

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

        environmentName,

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

              projectId:
                state.projectId,

              projectName:
                state.projectName,

              environmentName:
                state.environmentName,

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


deployAgent.agentName =
  "deployAgent";


deployAgent.owns = [
  "deployment",
  "environment-deployment-orchestration",
  "docker-orchestration",
  "aws-orchestration",
  "domain-orchestration",
  "ssl-orchestration",
  "deployment-health-verification",
  "deployment-url-resolution",
  "deployment-lifecycle",
];


deployAgent.dependencies = [
  "environmentAgent",
  "dockerAgent",
  "awsAgent",
  "domainAgent",
  "sslAgent",
  "billingAgent",
  "subscriptionAgent",
  "monitoringAgent",
  "scalingAgent",
];


deployAgent.security = {
  doesNotProcessPayments:
    true,

  doesNotGenerateSourceCode:
    true,

  doesNotCallAIProvidersDirectly:
    true,

  doesNotExposeEnvironmentSecrets:
    true,

  doesNotInventUrls:
    true,

  doesNotInventEntitlements:
    true,

  requiresVerifiedHealth:
    true,

  requiresEnvironmentReadiness:
    true,

  requiresBillingValidation:
    true,

  requiresSubscriptionValidation:
    true,
};


deployAgent.workflowContract = {
  version:
    "4.0.0",

  stages: [
    "environment",
    "billing",
    "subscription",
    "docker",
    "aws",
    "domain",
    "ssl",
    "monitoring",
    "scaling",
    "final-verification",
  ],

  environmentOwnership:
    "environmentAgent",

  infrastructureOwnership:
    "deployAgent",

  paymentOwnership:
    "billingAgent",

  subscriptionOwnership:
    "subscriptionAgent",

  sourceCodeOwnership:
    "builderAgent",

  healthOwnership:
    "monitoringAgent",

  scalingOwnership:
    "scalingAgent",
};


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  deployAgent;
