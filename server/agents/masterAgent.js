/**
 * =========================================================
 * ZYRIONOS MASTER AGENT
 * =========================================================
 *
 * Version: 5.3.0
 *
 * Central Autonomous Orchestrator / CEO Control Plane
 *
 * IMPORTANT ARCHITECTURE
 *
 * User Request
 *      ↓
 * Master
 *      ↓
 * Memory
 *      ↓
 * Intent
 *      ↓
 * Workflow
 *      ↓
 * Planning
 *      ↓
 * Builder
 *      ↓
 * Build Validation
 *      ↓
 * Deployment Gates
 *      ↓
 * Deployment
 *      ↓
 * Deployment Logs
 *      ↓
 * Auto Fix
 *      ↓
 * Monitoring / Scaling
 *      ↓
 * Final Response
 *
 *
 * MASTER DOES NOT:
 *
 * - Generate source code directly
 * - Modify source files directly
 * - Access MongoDB directly
 * - Access GitHub API directly
 * - Execute Docker directly
 * - Configure AWS directly
 * - Resolve secrets directly
 * - Process payments directly
 * - Call Gemini/OpenAI directly
 *
 * AI generation remains behind:
 *
 * services/ai/aiProviderService.js
 *
 * Build validation remains behind:
 *
 * services/buildValidationService.js
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   CORE AGENTS
========================================================= */

const intentAgent =
  require("./intentAgent");

const planningAgent =
  require("./planningAgent");

const builderAgent =
  require("./builderAgent");

const fixAgent =
  require("./fixAgent");

const fileAgent =
  require("./fileAgent");

const memoryAgent =
  require("./memoryAgent");

const environmentAgent =
  require("./environmentAgent");

const logAgent =
  require("./logAgent");


/* =========================================================
   GITHUB
========================================================= */

const githubAgent =
  require("./githubAgent");

const githubDeploymentAgent =
  require("./githubDeploymentAgent");


/* =========================================================
   INFRASTRUCTURE
========================================================= */

const dockerAgent =
  require("./dockerAgent");

const awsAgent =
  require("./awsAgent");

const domainAgent =
  require("./domainAgent");

const sslAgent =
  require("./sslAgent");

const monitoringAgent =
  require("./monitoringAgent");

const scalingAgent =
  require("./scalingAgent");


/* =========================================================
   BUSINESS
========================================================= */

const billingAgent =
  require("./billingAgent");

const subscriptionAgent =
  require("./subscriptionAgent");

const deployAgent =
  require("./deployAgent");


/* =========================================================
   FINANCIAL CONTROL
========================================================= */

const financialControlAgent =
  require("./financial/financialControlAgent");

const providerRegistry =
  require("./financial/providerRegistry");

const costMonitorAgent =
  require("./financial/costMonitorAgent");

const usageMonitorAgent =
  require("./financial/usageMonitorAgent");

const forecastAgent =
  require("./financial/forecastAgent");

const paymentApprovalAgent =
  require("./financial/paymentApprovalAgent");

const emergencyAgent =
  require("./financial/emergencyAgent");

const whatsappControlAgent =
  require("./financial/whatsappControlAgent");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");

const buildValidationService =
  require("../services/buildValidationService");

const {
  generateText
} =
  require("../services/ai/aiProviderService");


/* =========================================================
   CONSTANTS
========================================================= */

const MASTER_VERSION =
  "5.3.0";

const MAX_PROMPT_LENGTH =
  12000;

const MAX_WORKFLOW_STEPS =
  40;

const MAX_AGENT_RESULTS =
  60;

const MAX_FINAL_RESPONSE_TOKENS =
  1800;


/* =========================================================
   ENVIRONMENTS
========================================================= */

const VALID_ENVIRONMENTS =
  new Set([
    "development",
    "preview",
    "production"
  ]);


/* =========================================================
   AGENT REGISTRY
========================================================= */

const agentRegistry = {

  intent:
    intentAgent,

  planning:
    planningAgent,

  builder:
    builderAgent,

  fix:
    fixAgent,

  file:
    fileAgent,

  memory:
    memoryAgent,

  environment:
    environmentAgent,

  log:
    logAgent,

  github:
    githubAgent,

  githubDeployment:
    githubDeploymentAgent,

  deploy:
    deployAgent,

  docker:
    dockerAgent,

  aws:
    awsAgent,

  domain:
    domainAgent,

  ssl:
    sslAgent,

  monitoring:
    monitoringAgent,

  scaling:
    scalingAgent,

  billing:
    billingAgent,

  subscription:
    subscriptionAgent,

  financialControl:
    financialControlAgent,

  providerRegistry:
    providerRegistry,

  costMonitor:
    costMonitorAgent,

  usageMonitor:
    usageMonitorAgent,

  forecast:
    forecastAgent,

  paymentApproval:
    paymentApprovalAgent,

  emergency:
    emergencyAgent,

  whatsappControl:
    whatsappControlAgent

};


/* =========================================================
   SECRET SANITIZATION
========================================================= */

const SECRET_KEYS =
  new Set([

    "password",
    "passwd",
    "secret",
    "token",
    "accessToken",
    "refreshToken",
    "apiKey",
    "api_key",
    "authorization",
    "cookie",
    "privateKey",
    "private_key",
    "encryptedValue",
    "plainValue",
    "credentials",
    "clientSecret",
    "client_secret",
    "webhookSecret",
    "webhook_secret",
    "secretValue",
    "secret_value"

  ]);


/* =========================================================
   SAFE CONTEXT SANITIZER
========================================================= */

function sanitizeForContext(
  value,
  depth = 0
) {

  if (depth > 7) {
    return "[truncated]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {

    return value
      .slice(0, 100)
      .map(
        item =>
          sanitizeForContext(
            item,
            depth + 1
          )
      );

  }

  if (
    typeof value === "object"
  ) {

    const output = {};

    for (
      const [
        key,
        item
      ] of Object.entries(value)
    ) {

      if (
        SECRET_KEYS.has(key)
      ) {

        output[key] =
          "[REDACTED]";

        continue;

      }

      output[key] =
        sanitizeForContext(
          item,
          depth + 1
        );

    }

    return output;

  }

  return "[unsupported]";

}


/* =========================================================
   SAFE JSON
========================================================= */

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      sanitizeForContext(
        value
      )
    );

  } catch {

    return JSON.stringify({
      error:
        "Unable to serialize value"
    });

  }

}


/* =========================================================
   STRING CLEANER
========================================================= */

function cleanString(
  value,
  maxLength = 4000
) {

  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(
      0,
      maxLength
    );

}


/* =========================================================
   USER ID
========================================================= */

function getUserId(
  user = {}
) {

  return (
    user?.id ||
    user?._id ||
    user?.userId ||
    null
  );

}


/* =========================================================
   PROJECT ID
========================================================= */

function getProjectId(
  request
) {

  return (
    request?.projectId ||
    request?.project?._id ||
    request?.project?.id ||
    null
  );

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
   ERROR NORMALIZATION
========================================================= */

function normalizeError(
  error
) {

  if (!error) {

    return {
      message:
        "Unknown error",
      name:
        "Error",
      status:
        null,
      code:
        null
    };

  }

  return {

    message:
      error.message ||
      "Unknown error",

    name:
      error.name ||
      "Error",

    status:
      error.status ||
      error.statusCode ||
      null,

    code:
      error.code ||
      null

  };

}


/* =========================================================
   AGENT ERROR
========================================================= */

function getAgentError(
  result
) {

  if (!result) {
    return "Agent returned no result.";
  }

  return (
    result.error ||
    result.message ||
    result.details?.message ||
    "Agent returned an unsuccessful result."
  );

}


/* =========================================================
   LOGGER
========================================================= */

function logInfo(
  message,
  metadata = {}
) {

  const safe =
    sanitizeForContext(
      metadata
    );

  try {

    if (
      typeof logger?.info ===
      "function"
    ) {

      logger.info(
        message,
        safe
      );

      return;

    }

  } catch {}

  console.log(
    `[MASTER] ${message}`,
    safe
  );

}


function logSuccess(
  message,
  metadata = {}
) {

  const safe =
    sanitizeForContext(
      metadata
    );

  try {

    if (
      typeof logger?.success ===
      "function"
    ) {

      logger.success(
        message,
        safe
      );

      return;

    }

  } catch {}

  console.log(
    `[MASTER] ${message}`,
    safe
  );

}


function logWarn(
  message,
  metadata = {}
) {

  const safe =
    sanitizeForContext(
      metadata
    );

  try {

    if (
      typeof logger?.warn ===
      "function"
    ) {

      logger.warn(
        message,
        safe
      );

      return;

    }

    if (
      typeof logger?.warning ===
      "function"
    ) {

      logger.warning(
        message,
        safe
      );

      return;

    }

  } catch {}

  console.warn(
    `[MASTER] ${message}`,
    safe
  );

}


function logError(
  message,
  metadata = {}
) {

  const safe =
    sanitizeForContext(
      metadata
    );

  try {

    if (
      typeof logger?.error ===
      "function"
    ) {

      logger.error(
        message,
        safe
      );

      return;

    }

  } catch {}

  console.error(
    `[MASTER] ${message}`,
    safe
  );

}


/* =========================================================
   REQUEST NORMALIZATION
========================================================= */

function normalizeRequest(
  request,
  fallbackUser = {}
) {

  let normalized = {};

  if (
    typeof request === "string"
  ) {

    normalized = {
      prompt:
        request
    };

  } else if (
    request &&
    typeof request === "object"
  ) {

    normalized = {
      ...request
    };

  }

  normalized.prompt =
    cleanString(
      normalized.prompt,
      MAX_PROMPT_LENGTH
    );

  normalized.type =
    cleanString(
      normalized.type,
      100
    ).toLowerCase();

  normalized.framework =
    cleanString(
      normalized.framework,
      200
    );

  normalized.projectId =
    cleanString(
      normalized.projectId,
      300
    );

  normalized.projectName =
    cleanString(
      normalized.projectName,
      200
    );

  normalized.workflowId =
    cleanString(
      normalized.workflowId,
      200
    );

  normalized.requestId =
    cleanString(
      normalized.requestId,
      200
    );

  normalized.environmentName =
    normalizeEnvironmentName(
      normalized.environmentName ||
      normalized.environment ||
      normalized.deployEnvironment,
      {
        allowEmpty: true
      }
    );

  normalized.user =
    normalized.user ||
    fallbackUser ||
    {};

  return normalized;

}


/* =========================================================
   ENVIRONMENT NORMALIZATION
========================================================= */

function normalizeEnvironmentName(
  value,
  options = {}
) {

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {

    return options.allowEmpty
      ? null
      : "production";

  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    !VALID_ENVIRONMENTS.has(
      normalized
    )
  ) {

    throw new Error(
      `Invalid environment '${normalized}'. ` +
      `Allowed values: development, preview, production.`
    );

  }

  return normalized;

}


/* =========================================================
   WORKFLOW STATE
========================================================= */

function createWorkflowState(
  request,
  userId
) {

  return {

    workflowId:
      request.workflowId ||
      `zyrionos-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,

    requestId:
      request.requestId ||
      null,

    startedAt:
      new Date(),

    userId:
      userId ||
      null,

    projectId:
      request.projectId ||
      null,

    projectName:
      request.projectName ||
      null,

    environmentName:
      request.environmentName ||
      null,

    primaryIntent:
      null,

    projectScale:
      null,

    complexity:
      null,

    currentStage:
      "initialized",

    completedStages:
      [],

    failedStages:
      [],

    skippedStages:
      [],

    status:
      "running",

    agentResults:
      {},

    buildValidation:
      null,

    metrics: {

      startedAt:
        new Date(),

      completedAt:
        null,

      durationMs:
        null

    }

  };

}


/* =========================================================
   RECORD STAGE
========================================================= */

function recordStage(
  workflow,
  stage,
  result,
  status = "completed"
) {

  if (!workflow) {
    return;
  }

  if (
    status === "completed"
  ) {

    workflow.completedStages
      .push(stage);

  } else if (
    status === "failed"
  ) {

    workflow.failedStages
      .push(stage);

  } else if (
    status === "skipped"
  ) {

    workflow.skippedStages
      .push(stage);

  }

  workflow.agentResults[stage] =
    sanitizeForContext(
      result
    );

  if (
    workflow.completedStages.length >
    MAX_WORKFLOW_STEPS
  ) {

    workflow.completedStages =
      workflow.completedStages.slice(
        -MAX_WORKFLOW_STEPS
      );

  }

  if (
    workflow.failedStages.length >
    MAX_WORKFLOW_STEPS
  ) {

    workflow.failedStages =
      workflow.failedStages.slice(
        -MAX_WORKFLOW_STEPS
      );

  }

  if (
    workflow.skippedStages.length >
    MAX_WORKFLOW_STEPS
  ) {

    workflow.skippedStages =
      workflow.skippedStages.slice(
        -MAX_WORKFLOW_STEPS
      );

  }

  const keys =
    Object.keys(
      workflow.agentResults
    );

  if (
    keys.length >
    MAX_AGENT_RESULTS
  ) {

    const removeCount =
      keys.length -
      MAX_AGENT_RESULTS;

    for (
      let i = 0;
      i < removeCount;
      i++
    ) {

      delete workflow.agentResults[
        keys[i]
      ];

    }

  }

}


/* =========================================================
   INTENT DATA
========================================================= */

function getIntentData(
  intent
) {

  if (
    intent?.data &&
    typeof intent.data === "object"
  ) {

    return intent.data;

  }

  if (
    intent &&
    typeof intent === "object"
  ) {

    return intent;

  }

  return {
    type:
      "chat"
  };

}


/* =========================================================
   SECONDARY INTENTS
========================================================= */

function getSecondaryIntents(
  intent
) {

  const data =
    getIntentData(
      intent
    );

  if (
    !Array.isArray(
      data.secondaryIntents
    )
  ) {

    return [];

  }

  return [
    ...new Set(
      data.secondaryIntents
        .filter(
          item =>
            typeof item === "string"
        )
        .map(
          item =>
            item
              .trim()
              .toLowerCase()
        )
        .filter(Boolean)
    )
  ];

}


/* =========================================================
   WORKFLOW CLASSIFICATION
========================================================= */

function determineWorkflow(
  intent,
  request
) {

  const data =
    getIntentData(
      intent
    );

  const type =
    cleanString(
      data.type,
      100
    ).toLowerCase();

  const secondary =
    getSecondaryIntents(
      intent
    );

  const workflow = {

    type:
      type || "chat",

    secondary,

    requiresMemory:
      true,

    requiresPlanning:
      false,

    requiresEnvironment:
      false,

    requiresBuild:
      false,

    requiresDeploy:
      false,

    requiresBilling:
      false,

    requiresSubscription:
      false,

    requiresMonitoring:
      false,

    requiresScaling:
      false,

    requiresFix:
      false,

    requiresFile:
      false,

    requiresGithub:
      false,

    requiresGithubDeployment:
      false,

    autonomousSequence:
      false

  };


  switch (
    workflow.type
  ) {

    case "build":
    case "create":
    case "code":

      workflow.requiresPlanning =
        true;

      workflow.requiresBuild =
        true;

      break;


    case "fix":
    case "debug":

      workflow.requiresFix =
        true;

      break;


    case "deploy":

      workflow.requiresDeploy =
        true;

      break;


    case "environment":
    case "env":
    case "configuration":

      workflow.requiresEnvironment =
        true;

      break;


    case "github":
    case "repository":
    case "repo":
    case "github-import":
    case "github_import":
    case "repository-import":

      workflow.requiresGithub =
        true;

      break;


    case "github-deploy":
    case "github_deploy":
    case "repository-deploy":
    case "repository_deploy":
    case "repo-deploy":

      workflow.requiresGithub =
        true;

      workflow.requiresGithubDeployment =
        true;

      workflow.requiresDeploy =
        true;

      break;


    case "billing":

      workflow.requiresBilling =
        true;

      break;


    case "subscription":

      workflow.requiresSubscription =
        true;

      break;


    case "monitor":
    case "monitoring":

      workflow.requiresMonitoring =
        true;

      break;


    case "scale":
    case "scaling":

      workflow.requiresScaling =
        true;

      break;


    case "file":

      workflow.requiresFile =
        true;

      break;


    case "automation":
    case "infrastructure":

      workflow.requiresPlanning =
        true;

      break;

    default:
      break;

  }


  if (
    secondary.includes("github") ||
    secondary.includes("repository") ||
    secondary.includes("repo")
  ) {

    workflow.requiresGithub =
      true;

  }


  if (
    secondary.includes("github-deploy") ||
    secondary.includes("github_deploy") ||
    secondary.includes("repository-deploy") ||
    secondary.includes("repository_deploy")
  ) {

    workflow.requiresGithub =
      true;

    workflow.requiresGithubDeployment =
      true;

    workflow.requiresDeploy =
      true;

  }


  if (
    secondary.includes("deploy")
  ) {

    workflow.requiresDeploy =
      true;

  }


  if (
    secondary.includes("environment") ||
    secondary.includes("env") ||
    secondary.includes("configuration")
  ) {

    workflow.requiresEnvironment =
      true;

  }


  if (
    secondary.includes("build")
  ) {

    workflow.requiresBuild =
      true;

    workflow.requiresPlanning =
      true;

  }


  if (
    secondary.includes("fix")
  ) {

    workflow.requiresFix =
      true;

  }


  if (
    secondary.includes("billing")
  ) {

    workflow.requiresBilling =
      true;

  }


  if (
    secondary.includes("subscription")
  ) {

    workflow.requiresSubscription =
      true;

  }


  if (
    secondary.includes("monitor") ||
    secondary.includes("monitoring")
  ) {

    workflow.requiresMonitoring =
      true;

  }


  if (
    secondary.includes("scale") ||
    secondary.includes("scaling")
  ) {

    workflow.requiresScaling =
      true;

  }


  if (
    request?.autoDeploy === true
  ) {

    workflow.requiresDeploy =
      true;

  }


  if (
    request?.afterBuild === "deploy"
  ) {

    workflow.requiresDeploy =
      true;

  }


  if (
    request?.environmentName ||
    request?.environment ||
    request?.deployEnvironment
  ) {

    workflow.requiresEnvironment =
      true;

  }


  if (
    workflow.requiresBuild &&
    workflow.requiresDeploy
  ) {

    workflow.autonomousSequence =
      true;

  }


  if (
    workflow.requiresGithubDeployment
  ) {

    workflow.autonomousSequence =
      true;

  }


  return workflow;

}


/* =========================================================
   PROJECT NAME
========================================================= */

function getProjectName(
  request,
  planningData
) {

  return (
    planningData?.projectName ||
    request?.projectName ||
    request?.name ||
    null
  );

}


/* =========================================================
   PLANNING DATA
========================================================= */

function getPlanningData(
  planning
) {

  return (
    planning?.data ||
    planning ||
    null
  );

}


/* =========================================================
   PROJECT FILES
========================================================= */

function getProjectFiles(
  request,
  buildResult
) {

  return (
    buildResult?.data?.files ||
    buildResult?.files ||
    request?.files ||
    []
  );

}


/* =========================================================
   DEPLOYMENT ID
========================================================= */

function getDeploymentId(
  deploymentResult,
  projectId
) {

  return (
    deploymentResult?.deployment?.deploymentId ||
    deploymentResult?.data?.deploymentId ||
    deploymentResult?.deploymentId ||
    deploymentResult?.data?.id ||
    projectId ||
    null
  );

}


/* =========================================================
   BUILD RESULT SHAPE
========================================================= */

function validateBuildResult(
  result
) {

  if (
    !isSuccessful(result)
  ) {

    return {

      valid:
        false,

      error:
        getAgentError(
          result
        )

    };

  }

  const files =
    result?.data?.files ||
    result?.files;

  if (
    !Array.isArray(files)
  ) {

    return {

      valid:
        false,

      error:
        "Builder returned no files array."

    };

  }

  if (
    files.length === 0
  ) {

    return {

      valid:
        false,

      error:
        "Builder returned an empty project."

    };

  }

  return {

    valid:
      true,

    files

  };

}


/* =========================================================
   BUILD VALIDATION
========================================================= */

async function validateGeneratedBuild(
  workflowState,
  request,
  planningData,
  buildResult
) {

  const basic =
    validateBuildResult(
      buildResult
    );

  if (
    !basic.valid
  ) {

    return {

      success:
        false,

      ready:
        false,

      authoritative:
        false,

      mode:
        "builder-contract",

      error:
        basic.error

    };

  }


  const files =
    basic.files;

  const framework =
    request.framework ||
    planningData?.framework ||
    planningData?.frontend?.framework ||
    "react";


  try {

    if (
      typeof buildValidationService
        ?.validateProject !==
      "function"
    ) {

      return {

        success:
          false,

        ready:
          false,

        authoritative:
          false,

        mode:
          "validator-unavailable",

        error:
          "Build validation service is unavailable."

      };

    }


    const validation =
      await buildValidationService.validateProject({

        projectId:
          workflowState.projectId,

        projectName:
          getProjectName(
            request,
            planningData
          ),

        framework,

        files

      });


    const ready =
      validation?.success === true &&
      validation?.valid === true &&
      validation?.ready === true;


    return {

      success:
        validation?.success !== false,

      ready,

      authoritative:
        validation?.authoritative === true,

      mode:
        validation?.validationMode ||
        validation?.mode ||
        "static",

      framework,

      fileCount:
        files.length,

      sourceHash:
        validation?.sourceHash ||
        null,

      errors:
        Array.isArray(
          validation?.errors
        )
          ? validation.errors
          : [],

      warnings:
        Array.isArray(
          validation?.warnings
        )
          ? validation.warnings
          : [],

      validation

    };

  } catch (
    error
  ) {

    const normalized =
      normalizeError(
        error
      );

    return {

      success:
        false,

      ready:
        false,

      authoritative:
        false,

      mode:
        "validator-exception",

      error:
        normalized.message,

      errors: [
        {
          message:
            normalized.message,
          code:
            normalized.code
        }
      ]

    };

  }

}


/* =========================================================
   DEPLOYMENT BUILD GATE
========================================================= */

function canDeployAfterBuild(
  workflow,
  buildResult,
  buildValidation
) {

  if (
    !workflow.requiresBuild
  ) {

    return {

      allowed:
        true,

      reason:
        "Deployment does not require a new build."

    };

  }


  if (
    !isSuccessful(
      buildResult
    )
  ) {

    return {

      allowed:
        false,

      reason:
        "Deployment blocked because builder failed."

    };

  }


  if (
    !buildValidation ||
    buildValidation.ready !== true
  ) {

    return {

      allowed:
        false,

      reason:
        "Deployment blocked because build validation did not pass."

    };

  }


  return {

    allowed:
      true,

    reason:
      "Build and static validation gates passed."

  };

}


/* =========================================================
   ENVIRONMENT GATE
========================================================= */

async function checkEnvironmentGate(
  workflow,
  request,
  workflowState
) {

  if (
    !workflow.requiresDeploy
  ) {

    return {

      allowed:
        true,

      environment:
        null,

      reason:
        "No deployment requested."

    };

  }

  const environmentName =
    request.environmentName ||
    "production";

  workflowState.environmentName =
    environmentName;


  const result =
    await runAgent(

      workflowState,

      "environment-readiness",

      environmentAgent,

      {

        action:
          "deployment_readiness",

        userId:
          workflowState.userId,

        projectId:
          workflowState.projectId,

        name:
          environmentName,

        workflowId:
          workflowState.workflowId,

        requestId:
          workflowState.requestId

      }

    );


  if (
    !isSuccessful(result)
  ) {

    return {

      allowed:
        false,

      environment:
        environmentName,

      reason:
        getAgentError(result),

      result

    };

  }


  const readiness =
    result.readiness ||
    result.data?.readiness ||
    null;


  if (
    readiness &&
    readiness.deployable === false
  ) {

    return {

      allowed:
        false,

      environment:
        environmentName,

      reason:
        readiness.reason ||
        "Environment is not deployable.",

      result

    };

  }


  return {

    allowed:
      true,

    environment:
      environmentName,

    reason:
      "Environment readiness gate passed.",

    result

  };

}


/* =========================================================
   ENVIRONMENT SNAPSHOT
========================================================= */

async function createEnvironmentSnapshot(
  workflowState,
  environmentName
) {

  if (
    !environmentName
  ) {

    return {

      success:
        true,

      skipped:
        true

    };

  }


  return await runAgent(

    workflowState,

    "environment-snapshot",

    environmentAgent,

    {

      action:
        "create_deployment_snapshot",

      userId:
        workflowState.userId,

      projectId:
        workflowState.projectId,

      name:
        environmentName,

      deploymentId:
        workflowState.workflowId,

      workflowId:
        workflowState.workflowId,

      requestId:
        workflowState.requestId

    }

  );

}


/* =========================================================
   MARK ENVIRONMENT DEPLOYED
========================================================= */

async function markEnvironmentDeployed(
  workflowState,
  environmentName,
  deploymentResult
) {

  if (
    !environmentName
  ) {

    return {

      success:
        true,

      skipped:
        true

    };

  }


  const deploymentId =
    getDeploymentId(
      deploymentResult,
      workflowState.projectId
    );


  if (
    !deploymentId
  ) {

    return {

      success:
        false,

      error:
        "DEPLOYMENT_ID_MISSING",

      message:
        "Cannot synchronize environment state without deployment ID."

    };

  }


  return await runAgent(

    workflowState,

    "environment-deployed",

    environmentAgent,

    {

      action:
        "mark_deployed",

      userId:
        workflowState.userId,

      projectId:
        workflowState.projectId,

      name:
        environmentName,

      deploymentId,

      workflowId:
        workflowState.workflowId,

      requestId:
        workflowState.requestId

    }

  );

}


/* =========================================================
   PAYMENT CONTEXT
========================================================= */

function getPaymentContext(
  request
) {

  return {

    paymentId:
      request?.paymentId ||
      null,

    paymentConfirmed:
      request?.paymentConfirmed === true,

    paymentProvider:
      request?.paymentProvider ||
      null,

    providerCustomerId:
      request?.providerCustomerId ||
      null,

    providerSubscriptionId:
      request?.providerSubscriptionId ||
      null,

    billingCycle:
      request?.billingCycle ||
      null,

    plan:
      request?.plan ||
      request?.subscriptionPlan ||
      null

  };

}


/* =========================================================
   SUBSCRIPTION GATE
========================================================= */

function canProcessSubscription(
  request
) {

  const payment =
    getPaymentContext(
      request
    );

  if (
    request?.operation === "status"
  ) {

    return {

      allowed:
        true,

      reason:
        "Subscription status operation."

    };

  }

  if (
    payment.paymentConfirmed
  ) {

    return {

      allowed:
        true,

      reason:
        "Payment confirmation supplied; Subscription Agent must verify authoritative state."

    };

  }

  return {

    allowed:
      true,

    reason:
      "Subscription Agent may inspect authoritative entitlement/payment state."

  };

}


/* =========================================================
   GITHUB CONTEXT
========================================================= */

function getGithubContext(
  request,
  workflowState,
  intent,
  planningData,
  memoryContext,
  buildResult
) {

  return {

    action:
      request?.action ||
      request?.githubAction ||
      request?.operation ||
      "repositories-list",

    workflowId:
      workflowState.workflowId,

    requestId:
      workflowState.requestId,

    userId:
      workflowState.userId,

    projectId:
      workflowState.projectId,

    projectName:
      workflowState.projectName ||
      getProjectName(
        request,
        planningData
      ),

    connectionId:
      request?.connectionId ||
      request?.githubConnectionId ||
      null,

    owner:
      request?.owner ||
      request?.githubOwner ||
      null,

    repository:
      request?.repository ||
      request?.repo ||
      request?.githubRepository ||
      null,

    branch:
      request?.branch ||
      request?.ref ||
      null,

    path:
      request?.path ||
      null,

    prompt:
      cleanString(
        request?.prompt,
        MAX_PROMPT_LENGTH
      ),

    intent:
      sanitizeForContext(
        intent
      ),

    planning:
      sanitizeForContext(
        planningData
      ),

    memoryContext:
      sanitizeForContext(
        memoryContext
      ),

    buildResult:
      sanitizeForContext(
        buildResult
      ),

    user:
      sanitizeForContext(
        request?.user
      )

  };

}


/* =========================================================
   GITHUB DEPLOYMENT CONTEXT
========================================================= */

function getGithubDeploymentContext(
  request,
  workflowState,
  intent,
  planningData,
  githubResult,
  buildResult
) {

  return {

    action:
      request?.githubDeploymentAction ||
      request?.deploymentAction ||
      request?.operation ||
      "prepare-deployment",

    workflowId:
      workflowState.workflowId,

    requestId:
      workflowState.requestId,

    userId:
      workflowState.userId,

    projectId:
      workflowState.projectId,

    projectName:
      workflowState.projectName ||
      getProjectName(
        request,
        planningData
      ),

    connectionId:
      request?.connectionId ||
      request?.githubConnectionId ||
      null,

    owner:
      request?.owner ||
      request?.githubOwner ||
      githubResult?.repository?.owner ||
      githubResult?.data?.repository?.owner ||
      null,

    repository:
      request?.repository ||
      request?.repo ||
      request?.githubRepository ||
      githubResult?.repository?.name ||
      githubResult?.data?.repository?.name ||
      null,

    branch:
      request?.branch ||
      request?.ref ||
      githubResult?.repository?.defaultBranch ||
      githubResult?.data?.repository?.defaultBranch ||
      null,

    environmentName:
      workflowState.environmentName ||
      request?.environmentName ||
      "production",

    analysis:
      sanitizeForContext(
        request?.analysis ||
        githubResult?.analysis ||
        githubResult?.data?.analysis ||
        null
      ),

    files:
      sanitizeForContext(
        request?.files ||
        githubResult?.files ||
        githubResult?.data?.files ||
        []
      ),

    githubResult:
      sanitizeForContext(
        githubResult
      ),

    buildResult:
      sanitizeForContext(
        buildResult
      ),

    intent:
      sanitizeForContext(
        intent
      ),

    planning:
      sanitizeForContext(
        planningData
      )

  };

}


/* =========================================================
   DEPLOYMENT ERROR
========================================================= */

function getDeploymentErrorDetails(
  deploymentResult
) {

  const source =
    deploymentResult ||
    {};

  const nestedError =
    source?.errorDetails ||
    source?.details ||
    source?.data?.errorDetails ||
    source?.data?.details ||
    null;

  return {

    message:
      cleanString(
        source?.error ||
        source?.message ||
        nestedError?.message ||
        "Deployment failed.",
        4000
      ),

    code:
      cleanString(
        source?.code ||
        nestedError?.code ||
        "DEPLOYMENT_FAILED",
        200
      ),

    type:
      cleanString(
        source?.errorType ||
        source?.type ||
        nestedError?.type ||
        "deployment_error",
        200
      ),

    stage:
      cleanString(
        source?.stage ||
        nestedError?.stage ||
        "deployment",
        200
      ),

    details:
      sanitizeForContext(
        nestedError ||
        source
      )

  };

}


/* =========================================================
   AUTO FIX FROM DEPLOYMENT FAILURE
========================================================= */

async function triggerAutoFixFromDeploymentFailure(
  workflowState,
  request,
  intent,
  planningData,
  buildResult,
  deploymentResult
) {

  const deploymentId =
    getDeploymentId(
      deploymentResult,
      workflowState.projectId
    );


  if (!deploymentId) {

    return {

      success:
        false,

      triggered:
        false,

      eligible:
        false,

      error:
        "DEPLOYMENT_ID_MISSING",

      message:
        "Auto Fix skipped because deployment ID is missing."

    };

  }


  const errorDetails =
    getDeploymentErrorDetails(
      deploymentResult
    );


  try {

    const logResult =
      await runAgent(

        workflowState,

        "deployment-error-log",

        logAgent,

        {

          action:
            "record_deployment_error",

          deploymentId,

          projectId:
            workflowState.projectId,

          workflowId:
            workflowState.workflowId,

          requestId:
            workflowState.requestId,

          userId:
            workflowState.userId,

          error:
            errorDetails,

          environmentName:
            workflowState.environmentName

        }

      );


    if (
      !isSuccessful(logResult)
    ) {

      return {

        success:
          false,

        triggered:
          false,

        eligible:
          false,

        deploymentId,

        error:
          getAgentError(
            logResult
          ),

        message:
          "Deployment failed and error logging could not establish Auto Fix eligibility."

      };

    }


    const autoFixResult =
      await runAgent(

        workflowState,

        "auto-fix-trigger",

        logAgent,

        {

          action:
            "trigger_auto_fix",

          deploymentId,

          projectId:
            workflowState.projectId,

          workflowId:
            workflowState.workflowId,

          requestId:
            workflowState.requestId,

          userId:
            workflowState.userId,

          error:
            errorDetails,

          fixRequest: {

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId,

            deploymentId,

            projectId:
              workflowState.projectId,

            projectName:
              workflowState.projectName ||
              getProjectName(
                request,
                planningData
              ),

            userId:
              workflowState.userId,

            environmentName:
              workflowState.environmentName,

            prompt:
              cleanString(
                request.prompt,
                MAX_PROMPT_LENGTH
              ),

            error:
              errorDetails,

            intent:
              sanitizeForContext(
                intent
              ),

            planning:
              sanitizeForContext(
                planningData
              ),

            buildResult:
              sanitizeForContext(
                buildResult
              ),

            deploymentResult:
              sanitizeForContext(
                deploymentResult
              ),

            files:
              sanitizeForContext(
                getProjectFiles(
                  request,
                  buildResult
                )
              ),

            source:
              "masterAgent",

            trigger:
              "deployment_failure"

          }

        }

      );


    const triggered =
      autoFixResult?.triggered === true ||
      autoFixResult?.data?.triggered === true ||
      autoFixResult?.autoFixTriggered === true ||
      autoFixResult?.data?.autoFixTriggered === true;


    return {

      success:
        isSuccessful(
          autoFixResult
        ),

      triggered,

      eligible:
        true,

      deploymentId,

      logResult,

      autoFixResult

    };

  } catch (
    error
  ) {

    const normalized =
      normalizeError(
        error
      );

    return {

      success:
        false,

      triggered:
        false,

      eligible:
        false,

      deploymentId,

      error:
        normalized.message

    };

  }

}


/* =========================================================
   RUN AGENT
========================================================= */

async function runAgent(
  workflow,
  stage,
  agent,
  payload
) {

  workflow.currentStage =
    stage;


  if (
    typeof agent !== "function"
  ) {

    const failure = {

      success:
        false,

      message:
        `${stage} Agent is unavailable.`,

      error:
        `No callable agent registered for ${stage}.`

    };


    recordStage(
      workflow,
      stage,
      failure,
      "failed"
    );

    return failure;

  }


  try {

    logInfo(
      `Master → ${stage} Agent`,
      {
        workflowId:
          workflow.workflowId,

        requestId:
          workflow.requestId,

        projectId:
          workflow.projectId

      }
    );


    const result =
      await agent(
        payload
      );


    if (
      isSuccessful(result)
    ) {

      recordStage(
        workflow,
        stage,
        result,
        "completed"
      );


      logSuccess(
        `Master ← ${stage} Agent Completed`,
        {
          workflowId:
            workflow.workflowId,

          stage

        }
      );

    } else {

      recordStage(
        workflow,
        stage,
        result,
        "failed"
      );


      logError(
        `Master ← ${stage} Agent Failed`,
        {
          workflowId:
            workflow.workflowId,

          stage,

          error:
            getAgentError(
              result
            )

        }
      );

    }


    return result;

  } catch (
    error
  ) {

    const normalized =
      normalizeError(
        error
      );


    const result = {

      success:
        false,

      message:
        `${stage} Agent Failed.`,

      error:
        normalized.message,

      details:
        normalized

    };


    recordStage(
      workflow,
      stage,
      result,
      "failed"
    );


    logError(
      `Master ← ${stage} Agent Exception`,
      {
        workflowId:
          workflow.workflowId,

        stage,

        error:
          normalized.message

      }
    );


    return result;

  }

}


/* =========================================================
   MAIN MASTER AGENT
========================================================= */

async function masterAgent(
  request,
  user = {}
) {

  const startedAt =
    Date.now();

  let currentStage =
    "request-normalization";

  let normalizedRequest =
    null;

  let workflowState =
    null;

  let workflow =
    null;

  let memoryContext =
    null;

  let intent =
    null;

  let planning =
    null;

  let planningData =
    null;

  let buildResult =
    null;

  let buildValidation =
    null;

  let fixResult =
    null;

  let fileResult =
    null;

  let environmentResult =
    null;

  let githubResult =
    null;

  let githubDeploymentResult =
    null;

  let deploymentResult =
    null;

  let monitoringResult =
    null;

  let scalingResult =
    null;

  let billingResult =
    null;

  let subscriptionResult =
    null;

  let autoFixResult =
    null;


  try {

    logInfo(
      "ZyrionOS Master Agent Started"
    );


    /* =====================================================
       REQUEST
    ===================================================== */

    normalizedRequest =
      normalizeRequest(
        request,
        user
      );


    if (
      !normalizedRequest.prompt
    ) {

      return {

        success:
          false,

        message:
          "User prompt required",

        error:
          "Master Agent received an empty prompt.",

        stage:
          currentStage

      };

    }


    const normalizedUser =
      normalizedRequest.user ||
      {};


    const userId =
      getUserId(
        normalizedUser
      );


    const projectId =
      getProjectId(
        normalizedRequest
      );


    normalizedRequest.projectId =
      projectId;


    workflowState =
      createWorkflowState(
        normalizedRequest,
        userId
      );


    /* =====================================================
       MEMORY
    ===================================================== */

    currentStage =
      "memory";


    memoryContext =
      await runAgent(

        workflowState,

        "memory",

        memoryAgent,

        {

          prompt:
            normalizedRequest.prompt,

          user:
            normalizedUser,

          userId,

          projectId,

          workflowId:
            workflowState.workflowId,

          requestId:
            workflowState.requestId

        }

      );


    /* =====================================================
       INTENT
    ===================================================== */

    currentStage =
      "intent";


    intent =
      await runAgent(

        workflowState,

        "intent",

        intentAgent,

        {

          prompt:
            normalizedRequest.prompt,

          user:
            normalizedUser,

          userId,

          memoryContext,

          projectId,

          workflowId:
            workflowState.workflowId,

          requestId:
            workflowState.requestId

        }

      );


    if (
      !isSuccessful(intent)
    ) {

      workflowState.status =
        "failed";

      return {

        success:
          false,

        message:
          "Intent classification failed",

        error:
          getAgentError(
            intent
          ),

        stage:
          currentStage,

        workflow:
          workflowState

      };

    }


    /* =====================================================
       EXPLICIT OVERRIDES
    ===================================================== */

    if (
      normalizedRequest.type === "code"
    ) {

      intent = {

        ...intent,

        success:
          true,

        data: {

          ...getIntentData(
            intent
          ),

          type:
            "build"

        }

      };

    }


    if (
      normalizedRequest.type === "deploy"
    ) {

      intent = {

        ...intent,

        success:
          true,

        data: {

          ...getIntentData(
            intent
          ),

          type:
            "deploy"

        }

      };

    }


    if (
      normalizedRequest.type === "environment"
    ) {

      intent = {

        ...intent,

        success:
          true,

        data: {

          ...getIntentData(
            intent
          ),

          type:
            "environment"

        }

      };

    }


    /* =====================================================
       WORKFLOW
    ===================================================== */

    currentStage =
      "workflow-decision";


    workflow =
      determineWorkflow(
        intent,
        normalizedRequest
      );


    workflowState.primaryIntent =
      workflow.type;


    workflowState.projectScale =
      getIntentData(
        intent
      ).projectScale ||
      null;


    workflowState.complexity =
      getIntentData(
        intent
      ).complexity ||
      null;


    workflowState.projectName =
      getProjectName(
        normalizedRequest,
        null
      );


    if (
      workflow.requiresDeploy &&
      !workflowState.environmentName
    ) {

      workflowState.environmentName =
        "production";

    }


    logInfo(
      "Master workflow selected",
      {
        workflowId:
          workflowState.workflowId,

        type:
          workflow.type,

        build:
          workflow.requiresBuild,

        deploy:
          workflow.requiresDeploy,

        github:
          workflow.requiresGithub

      }
    );


    /* =====================================================
       ENVIRONMENT OPERATION
    ===================================================== */

    if (
      workflow.requiresEnvironment &&
      !workflow.requiresBuild &&
      !workflow.requiresDeploy
    ) {

      currentStage =
        "environment";


      environmentResult =
        await runAgent(

          workflowState,

          "environment",

          environmentAgent,

          {

            ...normalizedRequest,

            action:
              normalizedRequest.action ||
              normalizedRequest.operation ||
              getIntentData(
                intent
              ).environmentAction ||
              "get",

            user:
              normalizedUser,

            userId,

            projectId,

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId

          }

        );


      if (
        !isSuccessful(
          environmentResult
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Environment operation failed",

          error:
            getAgentError(
              environmentResult
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          environmentResult

        };

      }

    }


    /* =====================================================
       GITHUB
    ===================================================== */

    if (
      workflow.requiresGithub
    ) {

      currentStage =
        "github";


      githubResult =
        await runAgent(

          workflowState,

          "github",

          githubAgent,

          getGithubContext(

            normalizedRequest,

            workflowState,

            intent,

            planningData,

            memoryContext,

            buildResult

          )

        );


      if (
        !isSuccessful(
          githubResult
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "GitHub operation failed",

          error:
            getAgentError(
              githubResult
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          githubResult

        };

      }

    }


    /* =====================================================
       PLANNING
    ===================================================== */

    if (
      workflow.requiresPlanning
    ) {

      currentStage =
        "planning";


      planning =
        await runAgent(

          workflowState,

          "planning",

          planningAgent,

          {

            prompt:
              normalizedRequest.prompt,

            intent,

            user:
              normalizedUser,

            userId,

            memoryContext,

            projectId,

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId

          }

        );


      if (
        !isSuccessful(
          planning
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Planning Agent failed",

          error:
            getAgentError(
              planning
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          intent,

          planning

        };

      }


      planningData =
        getPlanningData(
          planning
        );

    }


    /* =====================================================
       GITHUB DEPLOYMENT
    ===================================================== */

    if (
      workflow.requiresGithubDeployment
    ) {

      currentStage =
        "github-deployment";


      githubDeploymentResult =
        await runAgent(

          workflowState,

          "github-deployment",

          githubDeploymentAgent,

          getGithubDeploymentContext(

            normalizedRequest,

            workflowState,

            intent,

            planningData,

            githubResult,

            buildResult

          )

        );


      if (
        !isSuccessful(
          githubDeploymentResult
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "GitHub deployment preparation failed",

          error:
            getAgentError(
              githubDeploymentResult
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          githubResult,

          githubDeploymentResult

        };

      }

    }


    /* =====================================================
       BUILD
       ===================================================== */

    if (
      workflow.requiresBuild
    ) {

      if (
        !isSuccessful(
          planning
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Build blocked",

          error:
            "Builder requires successful planning.",

          stage:
            "build-gate",

          workflow:
            workflowState,

          planning

        };

      }


      /* ---------------------------------------------------
         BUILDER
      --------------------------------------------------- */

      currentStage =
        "builder";


      buildResult =
        await runAgent(

          workflowState,

          "builder",

          builderAgent,

          {

            prompt:
              normalizedRequest.prompt,

            plan:
              planningData,

            framework:
              normalizedRequest.framework ||
              planningData?.framework ||
              planningData?.frontend?.framework ||
              "React",

            user:
              normalizedUser,

            userId,

            memoryContext,

            intent,

            projectId,

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId

          }

        );


      const builderContract =
        validateBuildResult(
          buildResult
        );


      if (
        !builderContract.valid
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Build generation failed",

          error:
            builderContract.error,

          stage:
            currentStage,

          workflow:
            workflowState,

          planning,

          buildResult

        };

      }


      /* ---------------------------------------------------
         STATIC BUILD VALIDATION
      --------------------------------------------------- */

      currentStage =
        "build-validation";


      buildValidation =
        await validateGeneratedBuild(

          workflowState,

          normalizedRequest,

          planningData,

          buildResult

        );


      workflowState.buildValidation =
        sanitizeForContext(
          buildValidation
        );


      recordStage(
        workflowState,
        "build-validation",
        buildValidation,
        buildValidation.ready
          ? "completed"
          : "failed"
      );


      if (
        !buildValidation.ready
      ) {

        workflowState.status =
          "failed";


        logError(
          "Build Validation Failed",
          {
            workflowId:
              workflowState.workflowId,

            errors:
              buildValidation.errors,

            error:
              buildValidation.error ||
              "Generated project failed static validation."

          }
        );


        return {

          success:
            false,

          message:
            "Build validation failed",

          error:
            buildValidation.error ||
            "Generated project failed validation.",

          stage:
            "build-validation",

          workflow:
            workflowState,

          planning,

          buildResult,

          buildValidation

        };

      }


      logSuccess(
        "Build Validation Passed",
        {
          workflowId:
            workflowState.workflowId,

          fileCount:
            buildValidation.fileCount,

          mode:
            buildValidation.mode,

          authoritative:
            buildValidation.authoritative

        }
      );

    }


    /* =====================================================
       FIX
    ===================================================== */

    if (
      workflow.requiresFix
    ) {

      currentStage =
        "fix";


      fixResult =
        await runAgent(

          workflowState,

          "fix",

          fixAgent,

          {

            prompt:
              normalizedRequest.prompt,

            user:
              normalizedUser,

            userId,

            intent,

            planning:
              planningData,

            memoryContext,

            projectId,

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId,

            files:
              getProjectFiles(
                normalizedRequest,
                buildResult
              )

          }

        );


      if (
        !isSuccessful(
          fixResult
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Fix Agent failed",

          error:
            getAgentError(
              fixResult
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          fixResult

        };

      }

    }


    /* =====================================================
       FILE
    ===================================================== */

    if (
      workflow.requiresFile
    ) {

      currentStage =
        "file";


      fileResult =
        await runAgent(

          workflowState,

          "file",

          fileAgent,

          {

            prompt:
              normalizedRequest.prompt,

            user:
              normalizedUser,

            userId,

            intent,

            planning:
              planningData,

            memoryContext,

            projectId,

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId,

            files:
              getProjectFiles(
                normalizedRequest,
                buildResult
              )

          }

        );


      if (
        !isSuccessful(
          fileResult
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "File Agent failed",

          error:
            getAgentError(
              fileResult
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          fileResult

        };

      }

    }


    /* =====================================================
       BILLING
    ===================================================== */

    if (
      workflow.requiresBilling
    ) {

      currentStage =
        "billing";


      const payment =
        getPaymentContext(
          normalizedRequest
        );


      billingResult =
        await runAgent(

          workflowState,

          "billing",

          billingAgent,

          {

            prompt:
              normalizedRequest.prompt,

            user:
              normalizedUser,

            userId,

            projectId,

            plan:
              payment.plan,

            billingCycle:
              payment.billingCycle,

            paymentProvider:
              payment.paymentProvider,

            paymentId:
              payment.paymentId,

            providerCustomerId:
              payment.providerCustomerId,

            providerSubscriptionId:
              payment.providerSubscriptionId,

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId,

            planning:
              planningData

          }

        );

    }


    /* =====================================================
       SUBSCRIPTION
    ===================================================== */

    if (
      workflow.requiresSubscription
    ) {

      const gate =
        canProcessSubscription(
          normalizedRequest
        );


      if (
        !gate.allowed
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Subscription operation blocked",

          error:
            gate.reason,

          stage:
            "subscription-gate",

          workflow:
            workflowState

        };

      }


      currentStage =
        "subscription";


      const payment =
        getPaymentContext(
          normalizedRequest
        );


      subscriptionResult =
        await runAgent(

          workflowState,

          "subscription",

          subscriptionAgent,

          {

            prompt:
              normalizedRequest.prompt,

            user:
              normalizedUser,

            userId,

            projectId,

            plan:
              payment.plan,

            billingCycle:
              payment.billingCycle,

            paymentProvider:
              payment.paymentProvider,

            paymentConfirmed:
              payment.paymentConfirmed,

            paymentId:
              payment.paymentId,

            providerCustomerId:
              payment.providerCustomerId,

            providerSubscriptionId:
              payment.providerSubscriptionId,

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId,

            planning:
              planningData

          }

        );

    }


    /* =====================================================
       DEPLOYMENT
    ===================================================== */

    if (
      workflow.requiresDeploy
    ) {

      /* ---------------------------------------------------
         BUILD GATE
      --------------------------------------------------- */

      currentStage =
        "deployment-build-gate";


      const buildGate =
        canDeployAfterBuild(

          workflow,

          buildResult,

          buildValidation

        );


      if (
        !buildGate.allowed
      ) {

        workflowState.status =
          "failed";


        return {

          success:
            false,

          message:
            "Deployment blocked",

          error:
            buildGate.reason,

          stage:
            currentStage,

          workflow:
            workflowState,

          buildResult,

          buildValidation

        };

      }


      /* ---------------------------------------------------
         ENVIRONMENT GATE
      --------------------------------------------------- */

      currentStage =
        "deployment-environment-gate";


      const environmentGate =
        await checkEnvironmentGate(

          workflow,

          normalizedRequest,

          workflowState

        );


      if (
        !environmentGate.allowed
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Deployment blocked by environment gate",

          error:
            environmentGate.reason,

          stage:
            currentStage,

          workflow:
            workflowState,

          buildResult,

          buildValidation,

          environmentResult:
            environmentGate.result ||
            null

        };

      }


      environmentResult =
        environmentGate.result ||
        null;


      /* ---------------------------------------------------
         ENVIRONMENT SNAPSHOT
      --------------------------------------------------- */

      currentStage =
        "deployment-environment-snapshot";


      const snapshotResult =
        await createEnvironmentSnapshot(

          workflowState,

          environmentGate.environment

        );


      if (
        !isSuccessful(
          snapshotResult
        )
      ) {

        workflowState.status =
          "failed";

        return {

          success:
            false,

          message:
            "Deployment blocked because environment snapshot failed",

          error:
            getAgentError(
              snapshotResult
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          environmentResult,

          snapshotResult

        };

      }


      /* ---------------------------------------------------
         DEPLOY
      --------------------------------------------------- */

      currentStage =
        "deploy";


      deploymentResult =
        await runAgent(

          workflowState,

          "deploy",

          deployAgent,

          {

            prompt:
              normalizedRequest.prompt,

            user:
              normalizedUser,

            userId,

            projectId,

            projectName:
              getProjectName(
                normalizedRequest,
                planningData
              ),

            framework:
              normalizedRequest.framework ||
              planningData?.framework ||
              planningData?.frontend?.framework,

            plan:
              planningData,

            planning:
              planningData,

            files:
              getProjectFiles(
                normalizedRequest,
                buildResult
              ),

            intent,

            githubResult:
              sanitizeForContext(
                githubResult
              ),

            githubDeploymentResult:
              sanitizeForContext(
                githubDeploymentResult
              ),

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId,

            environmentName:
              environmentGate.environment,

            environmentId:
              environmentResult
                ?.environment
                ?.id ||
              environmentResult
                ?.environment
                ?._id ||
              null,

            environmentReady:
              true,

            resolveEnvironment:
              true,

            paymentId:
              normalizedRequest.paymentId ||
              null,

            paymentConfirmed:
              normalizedRequest.paymentConfirmed ===
              true,

            paymentProvider:
              normalizedRequest.paymentProvider ||
              null,

            providerCustomerId:
              normalizedRequest.providerCustomerId ||
              null,

            providerSubscriptionId:
              normalizedRequest.providerSubscriptionId ||
              null,

            billingCycle:
              normalizedRequest.billingCycle ||
              null,

            infrastructureOwnership:
              "deployAgent"

          }

        );


      /* ---------------------------------------------------
         DEPLOYMENT FAILURE
      --------------------------------------------------- */

      if (
        !isSuccessful(
          deploymentResult
        )
      ) {

        workflowState.status =
          "failed";


        currentStage =
          "deployment-auto-fix";


        autoFixResult =
          await triggerAutoFixFromDeploymentFailure(

            workflowState,

            normalizedRequest,

            intent,

            planningData,

            buildResult,

            deploymentResult

          );


        return {

          success:
            false,

          message:
            autoFixResult?.triggered
              ? "Deployment failed. Auto Fix has been triggered."
              : "Deployment failed.",

          error:
            getAgentError(
              deploymentResult
            ),

          stage:
            "deploy",

          workflow:
            workflowState,

          intent,

          planning,

          githubResult,

          githubDeploymentResult,

          buildResult,

          buildValidation,

          environmentResult,

          deploymentResult,

          autoFixResult

        };

      }


      /* ---------------------------------------------------
         ENVIRONMENT DEPLOYED
      --------------------------------------------------- */

      currentStage =
        "environment-deployed";


      const environmentDeployedResult =
        await markEnvironmentDeployed(

          workflowState,

          environmentGate.environment,

          deploymentResult

        );


      if (
        !isSuccessful(
          environmentDeployedResult
        )
      ) {

        workflowState.status =
          "degraded";


        logWarn(
          "Deployment succeeded but environment state synchronization failed.",
          {
            workflowId:
              workflowState.workflowId,

            error:
              getAgentError(
                environmentDeployedResult
              )

          }
        );

      }


      logSuccess(
        "Deployment Gate Passed",
        {
          workflowId:
            workflowState.workflowId,

          deploymentId:
            getDeploymentId(
              deploymentResult,
              projectId
            ),

          environment:
            environmentGate.environment

        }
      );

    }


    /* =====================================================
       MONITORING
    ===================================================== */

    if (
      workflow.requiresMonitoring
    ) {

      currentStage =
        "monitoring";


      const deploymentId =
        getDeploymentId(
          deploymentResult,
          projectId
        );


      if (
        !deploymentId
      ) {

        monitoringResult = {

          success:
            false,

          error:
            "DEPLOYMENT_ID_MISSING",

          message:
            "Deployment or project ID required for monitoring."

        };


        recordStage(
          workflowState,
          "monitoring",
          monitoringResult,
          "failed"
        );

      } else {

        monitoringResult =
          await runAgent(

            workflowState,

            "monitoring",

            monitoringAgent,

            {

              deploymentId,

              projectId,

              projectName:
                getProjectName(
                  normalizedRequest,
                  planningData
                ),

              appName:
                getProjectName(
                  normalizedRequest,
                  planningData
                ),

              user:
                normalizedUser,

              userId,

              planning:
                planningData,

              workflowId:
                workflowState.workflowId,

              requestId:
                workflowState.requestId

            }

          );

      }

    }


    /* =====================================================
       SCALING
    ===================================================== */

    if (
      workflow.requiresScaling
    ) {

      currentStage =
        "scaling";


      const deploymentId =
        getDeploymentId(
          deploymentResult,
          projectId
        );


      if (
        !deploymentId
      ) {

        scalingResult = {

          success:
            false,

          error:
            "DEPLOYMENT_ID_MISSING",

          message:
            "Deployment or project ID required for scaling."

        };


        recordStage(
          workflowState,
          "scaling",
          scalingResult,
          "failed"
        );

      } else {

        scalingResult =
          await runAgent(

            workflowState,

            "scaling",

            scalingAgent,

            {

              deploymentId,

              projectId,

              projectName:
                getProjectName(
                  normalizedRequest,
                  planningData
                ),

              appName:
                getProjectName(
                  normalizedRequest,
                  planningData
                ),

              user:
                normalizedUser,

              userId,

              planning:
                planningData,

              workflowId:
                workflowState.workflowId,

              requestId:
                workflowState.requestId

            }

          );

      }

    }


    /* =====================================================
       COMPLETE
    ===================================================== */

    workflowState.currentStage =
      "completed";


    workflowState.status =
      workflowState.status ===
      "degraded"
        ? "degraded"
        : "completed";


    workflowState.metrics.completedAt =
      new Date();


    workflowState.metrics.durationMs =
      Date.now() -
      startedAt;


    /* =====================================================
       ORCHESTRATION
    ===================================================== */

    const orchestration = {

      workflowId:
        workflowState.workflowId,

      requestId:
        workflowState.requestId,

      status:
        workflowState.status,

      intent:
        sanitizeForContext(
          intent
        ),

      planning:
        sanitizeForContext(
          planning
        ),

      githubResult:
        sanitizeForContext(
          githubResult
        ),

      githubDeploymentResult:
        sanitizeForContext(
          githubDeploymentResult
        ),

      environment:
        sanitizeForContext(
          environmentResult
        ),

      buildResult:
        sanitizeForContext(
          buildResult
        ),

      buildValidation:
        sanitizeForContext(
          buildValidation
        ),

      deploymentResult:
        sanitizeForContext(
          deploymentResult
        ),

      monitoringResult:
        sanitizeForContext(
          monitoringResult
        ),

      scalingResult:
        sanitizeForContext(
          scalingResult
        ),

      billingResult:
        sanitizeForContext(
          billingResult
        ),

      subscriptionResult:
        sanitizeForContext(
          subscriptionResult
        ),

      fixResult:
        sanitizeForContext(
          fixResult
        ),

      fileResult:
        sanitizeForContext(
          fileResult
        ),

      autoFixResult:
        sanitizeForContext(
          autoFixResult
        ),

      workflow:
        sanitizeForContext(
          workflow
        ),

      completedStages:
        workflowState.completedStages,

      failedStages:
        workflowState.failedStages,

      skippedStages:
        workflowState.skippedStages

    };


    /* =====================================================
       FINAL AI RESPONSE
    ===================================================== */

    currentStage =
      "final-response";


    let reply =
      "";


    try {

      const completion =
        await generateText({

          messages: [

            {

              role:
                "system",

              content: `

You are the final communication layer of ZyrionOS.

The Master Agent has already executed the workflow.

The backend is the source of truth.

Rules:

1. Never invent results.
2. Never invent URLs.
3. Never invent deployment success.
4. Never invent payment success.
5. Never invent subscription entitlement.
6. Never invent AWS resources.
7. Never expose secrets.
8. Never expose API keys.
9. Never expose tokens.
10. Never expose passwords.
11. Never claim build success unless buildResult.success=true AND buildValidation.ready=true.
12. Never claim deployment success unless deploymentResult.success=true.
13. Never claim environment readiness unless its gate passed.
14. Never claim GitHub success unless githubResult.success=true.
15. Never claim GitHub deployment preparation success unless githubDeploymentResult.success=true.
16. If something failed, clearly state it failed.
17. If Auto Fix was triggered, say it was triggered but do not claim the issue is already repaired.
18. Use only the exact deployment URL returned by the backend.
19. Never construct URLs.
20. Keep the answer concise.
21. Never expose internal secrets or credentials.
22. Never claim that an agent ran when it was skipped.

`

            },

            {

              role:
                "user",

              content: `

USER REQUEST:

${cleanString(
  normalizedRequest.prompt,
  MAX_PROMPT_LENGTH
)}

WORKFLOW:

${safeJson(
  workflowState
)}

INTENT:

${safeJson(
  intent
)}

PLANNING:

${safeJson(
  planning
)}

BUILD:

${safeJson(
  buildResult
)}

BUILD VALIDATION:

${safeJson(
  buildValidation
)}

GITHUB:

${safeJson(
  githubResult
)}

GITHUB DEPLOYMENT:

${safeJson(
  githubDeploymentResult
)}

ENVIRONMENT:

${safeJson(
  environmentResult
)}

DEPLOYMENT:

${safeJson(
  deploymentResult
)}

AUTO FIX:

${safeJson(
  autoFixResult
)}

BILLING:

${safeJson(
  billingResult
)}

SUBSCRIPTION:

${safeJson(
  subscriptionResult
)}

MONITORING:

${safeJson(
  monitoringResult
)}

SCALING:

${safeJson(
  scalingResult
)}

FIX:

${safeJson(
  fixResult
)}

FILE:

${safeJson(
  fileResult
)}

`

            }

          ],

          maxTokens:
            MAX_FINAL_RESPONSE_TOKENS

        });


      if (
        completion?.success === true
      ) {

        reply =
          cleanString(
            completion.text,
            12000
          );

      }

    } catch (
      error
    ) {

      logWarn(
        "Final communication generation failed.",
        {
          error:
            error.message
        }
      );

    }


    /* =====================================================
       DETERMINISTIC FALLBACK
    ===================================================== */

    if (!reply) {

      const completed =
        workflowState.completedStages
          .join(", ");

      const failed =
        workflowState.failedStages
          .join(", ");

      const deploymentUrl =
        deploymentResult?.deployment?.url ||
        deploymentResult?.data?.url ||
        null;


      reply =
        [

          `Workflow ${workflowState.status}.`,

          completed
            ? `Completed: ${completed}.`
            : "",

          failed
            ? `Failed: ${failed}.`
            : "",

          buildValidation?.ready
            ? "Build validation passed."
            : "",

          githubResult?.success
            ? "GitHub operation completed."
            : "",

          githubDeploymentResult?.success
            ? "GitHub deployment preparation completed."
            : "",

          workflowState.environmentName
            ? `Environment: ${workflowState.environmentName}.`
            : "",

          autoFixResult?.triggered
            ? "Auto Fix has been triggered."
            : "",

          deploymentUrl
            ? `Deployment URL: ${deploymentUrl}`
            : ""

        ]
          .filter(Boolean)
          .join(" ");

    }


    /* =====================================================
       FINAL SUCCESS
    ===================================================== */

    logSuccess(
      "Master Agent Completed",
      {
        workflowId:
          workflowState.workflowId,

        status:
          workflowState.status,

        durationMs:
          Date.now() -
          startedAt

      }
    );


    return {

      success:
        true,

      reply,

      workflow:
        workflowState,

      orchestration

    };

  } catch (
    error
  ) {

    const normalized =
      normalizeError(
        error
      );


    if (
      workflowState
    ) {

      workflowState.status =
        "failed";

      workflowState.currentStage =
        currentStage;

      workflowState.metrics.completedAt =
        new Date();

      workflowState.metrics.durationMs =
        Date.now() -
        startedAt;

    }


    logError(
      "Master Agent Failed",
      {
        workflowId:
          workflowState?.workflowId ||
          null,

        stage:
          currentStage,

        error:
          normalized.message

      }
    );


    return {

      success:
        false,

      message:
        "Master Agent Failed",

      error:
        normalized.message,

      code:
        normalized.code,

      stage:
        currentStage,

      workflow:
        workflowState,

      orchestration: {

        intent:
          sanitizeForContext(
            intent
          ),

        planning:
          sanitizeForContext(
            planning
          ),

        buildResult:
          sanitizeForContext(
            buildResult
          ),

        buildValidation:
          sanitizeForContext(
            buildValidation
          ),

        githubResult:
          sanitizeForContext(
            githubResult
          ),

        githubDeploymentResult:
          sanitizeForContext(
            githubDeploymentResult
          ),

        environment:
          sanitizeForContext(
            environmentResult
          ),

        deploymentResult:
          sanitizeForContext(
            deploymentResult
          ),

        monitoringResult:
          sanitizeForContext(
            monitoringResult
          ),

        scalingResult:
          sanitizeForContext(
            scalingResult
          ),

        billingResult:
          sanitizeForContext(
            billingResult
          ),

        subscriptionResult:
          sanitizeForContext(
            subscriptionResult
          ),

        fixResult:
          sanitizeForContext(
            fixResult
          ),

        fileResult:
          sanitizeForContext(
            fileResult
          ),

        autoFixResult:
          sanitizeForContext(
            autoFixResult
          )

      }

    };

  }

}


/* =========================================================
   METADATA
========================================================= */

masterAgent.version =
  MASTER_VERSION;

masterAgent.agentName =
  "masterAgent";

masterAgent.agents =
  agentRegistry;

masterAgent.agentCount =
  Object.keys(
    agentRegistry
  ).length;


/* =========================================================
   OWNERSHIP
========================================================= */

masterAgent.ownership = {

  master: [

    "request_normalization",
    "intent_routing",
    "workflow_orchestration",
    "dependency_enforcement",
    "build_validation_gates",
    "environment_gates",
    "github_workflow_coordination",
    "deployment_gates",
    "deployment_failure_logging",
    "auto_fix_trigger_coordination",
    "failure_propagation",
    "final_result_aggregation"

  ],

  memory: [
    "context_memory"
  ],

  intent: [
    "intent_classification"
  ],

  planning: [
    "implementation_planning",
    "dependency_planning",
    "project_decomposition"
  ],

  builder: [
    "project_file_generation"
  ],

  fix: [
    "bug_analysis",
    "bug_repair"
  ],

  file: [
    "file_operations"
  ],

  environment: [
    "environment_configuration",
    "environment_validation",
    "environment_secret_boundary",
    "deployment_environment_state"
  ],

  log: [
    "deployment_logging",
    "deployment_error_recording",
    "auto_fix_eligibility",
    "auto_fix_trigger"
  ],

  github: [
    "github_connection_operations",
    "repository_operations",
    "branch_operations",
    "repository_contents",
    "repository_analysis"
  ],

  githubDeployment: [
    "github_deployment_contract",
    "github_deployment_readiness",
    "github_deployment_preparation"
  ],

  deploy: [
    "deployment_orchestration",
    "deployment_lifecycle",
    "deployment_result"
  ],

  docker: [
    "docker_operations"
  ],

  aws: [
    "aws_infrastructure"
  ],

  domain: [
    "dns_operations"
  ],

  ssl: [
    "certificate_operations"
  ],

  monitoring: [
    "runtime_monitoring"
  ],

  scaling: [
    "capacity_scaling"
  ],

  billing: [
    "billing_operations",
    "payment_state"
  ],

  subscription: [
    "subscription_state",
    "entitlements"
  ]

};


/* =========================================================
   SECURITY CONTRACT
========================================================= */

masterAgent.security = {

  directDatabaseAccess:
    false,

  directProviderAccess:
    false,

  directInfrastructureAccess:
    false,

  directPaymentProcessing:
    false,

  directSecretResolution:
    false,

  directGithubApiAccess:
    false,

  environmentSecretsExposedToMaster:
    false,

  githubTokensExposedToMaster:
    false,

  deploymentSecretsResolvedBy:
    "trusted-deployment-workflow",

  providerArchitecture:
    "centralized-ai-provider-service",

  buildValidationArchitecture:
    "centralized-build-validation-service",

  githubArchitecture:
    "github-agent-service-boundary",

  autoFixArchitecture:
    "log-agent-trigger-boundary"

};


/* =========================================================
   WORKFLOW CONTRACT
========================================================= */

masterAgent.workflowContract = {

  build: [

    "memory",
    "intent",
    "planning",
    "builder",
    "build-validation"

  ],

  buildAndDeploy: [

    "memory",
    "intent",
    "planning",
    "builder",
    "build-validation",
    "environment-readiness",
    "environment-snapshot",
    "deploy",
    "environment-deployed"

  ],

  deploy: [

    "memory",
    "intent",
    "environment-readiness",
    "environment-snapshot",
    "deploy",
    "deployment-error-log",
    "auto-fix-trigger",
    "environment-deployed"

  ],

  github: [

    "memory",
    "intent",
    "github"

  ],

  githubDeployment: [

    "memory",
    "intent",
    "github",
    "github-deployment",
    "build-validation",
    "environment-readiness",
    "environment-snapshot",
    "deploy",
    "environment-deployed"

  ],

  deploymentFailure: [

    "deploy",
    "deployment-error-log",
    "auto-fix-trigger",
    "fix-agent-handoff"

  ],

  environment: [

    "memory",
    "intent",
    "environment"

  ],

  fix: [

    "memory",
    "intent",
    "fix"

  ],

  subscription: [

    "memory",
    "intent",
    "subscription"

  ],

  billing: [

    "memory",
    "intent",
    "billing"

  ]

};


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  masterAgent;
