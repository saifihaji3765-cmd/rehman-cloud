/**
 * =========================================================
 * ZYRIONOS MASTER AGENT
 * =========================================================
 *
 * Version: 7.1.0
 *
 * CEO / GLOBAL CONTROL PLANE
 *
 * Master owns:
 * - request normalization
 * - intent routing
 * - workflow coordination
 * - cross-domain orchestration
 * - deployment gates
 * - final result aggregation
 *
 * Engineering Orchestrator owns:
 * - engineering lifecycle
 * - execution
 * - authoritative build
 * - diagnosis
 * - repair
 * - retry
 * - checkpoint
 * - rollback
 * - verification
 * - promotion
 * - escalation
 *
 * Master NEVER directly executes:
 * - Docker
 * - npm/pnpm/yarn
 * - production builds
 * - runtime processes
 * - test processes
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   CORE AGENTS
========================================================= */

const intentAgent = require("./intentAgent");
const planningAgent = require("./planningAgent");
const builderAgent = require("./builderAgent");
const fixAgent = require("./fixAgent");
const fileAgent = require("./fileAgent");
const memoryAgent = require("./memoryAgent");
const environmentAgent = require("./environmentAgent");
const logAgent = require("./logAgent");


/* =========================================================
   GITHUB
========================================================= */

const githubAgent = require("./githubAgent");
const githubDeploymentAgent = require("./githubDeploymentAgent");


/* =========================================================
   INFRASTRUCTURE
========================================================= */

const dockerAgent = require("./dockerAgent");
const awsAgent = require("./awsAgent");
const domainAgent = require("./domainAgent");
const sslAgent = require("./sslAgent");
const monitoringAgent = require("./monitoringAgent");
const scalingAgent = require("./scalingAgent");


/* =========================================================
   BUSINESS
========================================================= */

const billingAgent = require("./billingAgent");
const subscriptionAgent = require("./subscriptionAgent");
const deployAgent = require("./deployAgent");


/* =========================================================
   FINANCIAL
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

const {
  generateText
} =
  require("../services/ai/aiProviderService");


/* =========================================================
   ENGINEERING SYSTEM
========================================================= */

const engineeringOrchestrator =
  require("../services/engineering/engineeringOrchestrator");

const engineeringState =
  require("../services/engineering/engineeringState");

const engineeringIntelligence =
  require("../services/engineering/engineeringIntelligence");

const engineeringExecutor =
  require("../services/engineering/engineeringExecutor");


/* =========================================================
   CONSTANTS
========================================================= */

const MASTER_VERSION =
  "7.1.0";

const MAX_PROMPT_LENGTH =
  12000;

const MAX_WORKFLOW_STEPS =
  100;

const MAX_AGENT_RESULTS =
  100;

const MAX_FINAL_RESPONSE_TOKENS =
  1800;

const MAX_DIAGNOSTIC_ERRORS =
  100;

const MAX_AFFECTED_FILES =
  100;

const MAX_STDOUT_LENGTH =
  12000;

const MAX_STDERR_LENGTH =
  20000;

const VALID_ENVIRONMENTS =
  new Set([
    "development",
    "preview",
    "production"
  ]);

const ENGINEERING_STATES =
  new Set([
    "CREATED",
    "ANALYZING",
    "EXECUTING",
    "FAILED",
    "DIAGNOSING",
    "REPAIRING",
    "VERIFYING",
    "PASSED",
    "ROLLBACK",
    "ESCALATED",
    "PROMOTED"
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
    whatsappControlAgent,

  engineeringOrchestrator:
    engineeringOrchestrator,

  engineeringState:
    engineeringState,

  engineeringIntelligence:
    engineeringIntelligence,

  engineeringExecutor:
    engineeringExecutor

};


/* =========================================================
   SECRET KEYS
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
  user = {},
  request = {}
) {

  return (
    user?.id ||
    user?._id ||
    user?.userId ||
    user?.uid ||
    request?.userId ||
    request?.user?.id ||
    request?.user?._id ||
    request?.user?.userId ||
    request?.user?.uid ||
    null
  );

}


/* =========================================================
   PROJECT ID
========================================================= */

function getProjectId(
  request = {}
) {

  return (
    request?.projectId ||
    request?.project?._id ||
    request?.project?.id ||
    request?.project?.projectId ||
    request?.data?.projectId ||
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
        null,

      stack:
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
      null,

    stack:
      typeof error.stack === "string"
        ? error.stack.slice(0, 20000)
        : null

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
    result.failure?.message ||
    result.failureRecord?.message ||
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
      getProjectId(
        normalized
      ),
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

  normalized.userId =
    cleanString(
      normalized.userId ||
      normalized.user?.id ||
      normalized.user?._id ||
      normalized.user?.userId ||
      normalized.user?.uid,
      300
    );

  normalized.environmentName =
    normalizeEnvironmentName(
      normalized.environmentName ||
      normalized.environment ||
      normalized.deployEnvironment,
      {
        allowEmpty:
          true
      }
    );

  normalized.user =
    (
      normalized.user &&
      typeof normalized.user === "object"
    )
      ? normalized.user
      : fallbackUser || {};

  return normalized;

}


/* =========================================================
   ENVIRONMENT
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

    engineeringRun:
      null,

    engineeringStatus:
      null,

    engineeringPromotion:
      null,

    engineeringVerification:
      null,

    engineeringFailure:
      null,

    engineeringRepair:
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
   PROJECT HELPERS
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


function getPlanningData(
  planning
) {

  return (
    planning?.data ||
    planning ||
    null
  );

}


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
   BUILD CONTRACT
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
   ENGINEERING FILE CONTRACT
========================================================= */

function normalizeEngineeringFiles(
  files
) {

  if (
    !Array.isArray(files)
  ) {

    return [];

  }

  return files
    .filter(
      file =>
        file &&
        typeof file === "object"
    )
    .map(
      file => {

        const path =
          file.path ||
          file.name ||
          file.filePath ||
          file.relativePath ||
          null;

        const content =
          typeof file.content === "string"
            ? file.content
            : typeof file.source === "string"
              ? file.source
              : typeof file.code === "string"
                ? file.code
                : null;

        return {

          ...file,

          path,

          name:
            file.name ||
            path,

          content

        };

      }
    )
    .filter(
      file =>
        Boolean(
          file.path
        ) &&
        typeof file.content === "string"
    );

}


/* =========================================================
   ENGINEERING RESULT EXTRACTION
========================================================= */

function extractEngineeringFiles(
  result
) {

  const candidates = [

    result?.files,

    result?.data?.files,

    result?.result?.files,

    result?.result?.data?.files,

    result?.artifact?.files,

    result?.verification?.files,

    result?.verification?.artifact?.files,

    result?.data?.verification?.files,

    result?.data?.artifact?.files

  ];

  for (
    const candidate of candidates
  ) {

    if (
      Array.isArray(candidate) &&
      candidate.length > 0
    ) {

      return normalizeEngineeringFiles(
        candidate
      );

    }

  }

  return [];

}


/* =========================================================
   ENGINEERING STATE EXTRACTION
========================================================= */

function extractEngineeringState(
  result
) {

  if (
    !result ||
    typeof result !== "object"
  ) {

    return null;

  }

  return (
    result.state ||
    result.engineeringState ||
    result.runState ||
    result.snapshot ||
    result.data?.state ||
    result.data?.engineeringState ||
    result.data?.runState ||
    null
  );

}


/* =========================================================
   ENGINEERING FAILURE EXTRACTION
========================================================= */

function extractEngineeringFailure(
  result
) {

  if (
    !result ||
    typeof result !== "object"
  ) {

    return null;

  }

  return (
    result.failure ||
    result.failureRecord ||
    result.repairContext ||
    result.errorDetails ||
    result.data?.failure ||
    result.data?.failureRecord ||
    result.data?.repairContext ||
    result.data?.errorDetails ||
    null
  );

}


/* =========================================================
   ENGINEERING VERIFICATION
========================================================= */

function extractEngineeringVerification(
  result
) {

  if (
    !result ||
    typeof result !== "object"
  ) {

    return null;

  }

  return (
    result.verification ||
    result.verificationRecord ||
    result.data?.verification ||
    result.data?.verificationRecord ||
    result.result?.verification ||
    null
  );

}


/* =========================================================
   ENGINEERING PROMOTION
========================================================= */

function extractEngineeringPromotion(
  result
) {

  if (
    !result ||
    typeof result !== "object"
  ) {

    return null;

  }

  return (
    result.promotion ||
    result.promotionRecord ||
    result.data?.promotion ||
    result.data?.promotionRecord ||
    result.result?.promotion ||
    null
  );

}


/* =========================================================
   AUTHORITATIVE EVIDENCE
========================================================= */

function getAuthoritativeEvidence(
  result
) {

  if (
    !result ||
    typeof result !== "object"
  ) {

    return {

      valid:
        false,

      reason:
        "Engineering result is missing."

    };

  }

  const verification =
    extractEngineeringVerification(
      result
    ) || {};

  const promotion =
    extractEngineeringPromotion(
      result
    ) || {};

  const state =
    String(
      result.state ||
      result.engineeringState ||
      result.status ||
      result.data?.state ||
      result.data?.engineeringState ||
      ""
    )
      .toUpperCase();

  const authoritative =
    result.authoritative === true ||
    result.data?.authoritative === true ||
    verification.authoritative === true ||
    verification.data?.authoritative === true;

  const validationMode =
    result.validationMode ||
    result.data?.validationMode ||
    verification.validationMode ||
    verification.data?.validationMode ||
    verification.mode ||
    verification.data?.mode ||
    null;

  const normalizedValidationMode =
    typeof validationMode === "string"
      ? validationMode.trim().toLowerCase()
      : "";

  const verified =
    result.verified === true ||
    result.data?.verified === true ||
    verification.verified === true ||
    verification.data?.verified === true ||
    verification.success === true;

  const promoted =
    result.promoted === true ||
    result.data?.promoted === true ||
    promotion.promoted === true ||
    promotion.data?.promoted === true ||
    state === "PROMOTED";

  const buildId =
    result.buildId ||
    result.data?.buildId ||
    verification.buildId ||
    verification.data?.buildId ||
    promotion.buildId ||
    promotion.data?.buildId ||
    null;

  const artifact =
    result.artifact ||
    result.data?.artifact ||
    verification.artifact ||
    verification.data?.artifact ||
    promotion.artifact ||
    promotion.data?.artifact ||
    null;

  const storageKey =
    artifact?.storageKey ||
    artifact?.storage_key ||
    artifact?.key ||
    artifact?.path ||
    artifact?.artifactPath ||
    result.artifactStorageKey ||
    result.data?.artifactStorageKey ||
    verification.storageKey ||
    verification.data?.storageKey ||
    null;

  const checksum =
    artifact?.checksum ||
    artifact?.sha256 ||
    artifact?.hash ||
    result.checksum ||
    result.data?.checksum ||
    verification.checksum ||
    verification.data?.checksum ||
    null;

  const valid =
    result.success === true &&
    state === "PROMOTED" &&
    promoted === true &&
    authoritative === true &&
    verified === true &&
    normalizedValidationMode === "authoritative" &&
    Boolean(buildId) &&
    Boolean(storageKey) &&
    Boolean(checksum);

  if (!valid) {

    const missing = [];

    if (result.success !== true) {
      missing.push("success=true");
    }

    if (state !== "PROMOTED") {
      missing.push("state=PROMOTED");
    }

    if (!promoted) {
      missing.push("promoted=true");
    }

    if (!authoritative) {
      missing.push("authoritative=true");
    }

    if (!verified) {
      missing.push("verified=true");
    }

    if (
      normalizedValidationMode !==
      "authoritative"
    ) {
      missing.push(
        "validationMode=authoritative"
      );
    }

    if (!buildId) {
      missing.push("buildId");
    }

    if (!storageKey) {
      missing.push(
        "artifact.storageKey/path/key"
      );
    }

    if (!checksum) {
      missing.push("artifact.checksum");
    }

    return {

      valid:
        false,

      reason:
        `Authoritative promotion evidence incomplete: ${missing.join(", ")}.`,

      state,

      promoted,

      authoritative,

      verified,

      validationMode:
        normalizedValidationMode ||
        null,

      buildId,

      storageKey,

      checksum

    };

  }

  return {

    valid:
      true,

    state,

    promoted,

    authoritative,

    verified,

    validationMode:
      normalizedValidationMode,

    buildId,

    storageKey,

    checksum

  };

}


/* =========================================================
   STRICT ENGINEERING SUCCESS
========================================================= */

function isEngineeringPromoted(
  result
) {

  return Boolean(
    getAuthoritativeEvidence(
      result
    ).valid
  );

}


/* =========================================================
   ENGINEERING FAILURE
========================================================= */

function isEngineeringFailure(
  result
) {

  if (
    !result ||
    typeof result !== "object"
  ) {

    return true;

  }

  if (
    result.success === false
  ) {

    return true;

  }

  const state =
    String(
      result.state ||
      result.engineeringState ||
      result.status ||
      ""
    )
      .toUpperCase();

  return (
    state === "FAILED" ||
    state === "ESCALATED" ||
    state === "ROLLBACK"
  );

}


/* =========================================================
   ENGINEERING PAYLOAD
========================================================= */

function createEngineeringJob(
  workflowState,
  request,
  normalizedUser,
  intent,
  planningData,
  buildResult,
  memoryContext
) {

  const files =
    normalizeEngineeringFiles(
      getProjectFiles(
        request,
        buildResult
      )
    );

  return {

    jobType:
      "build",

    operation:
      "autonomous-engineering-build",

    source:
      "masterAgent",

    masterVersion:
      MASTER_VERSION,

    workflowId:
      workflowState.workflowId,

    requestId:
      workflowState.requestId,

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

    prompt:
      cleanString(
        request.prompt,
        MAX_PROMPT_LENGTH
      ),

    user:
      sanitizeForContext(
        normalizedUser
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

    files,

    framework:
      request.framework ||
      planningData?.framework ||
      planningData?.frontend?.framework ||
      null,

    packageManager:
      planningData?.packageManager ||
      null,

    nodeVersion:
      planningData?.nodeVersion ||
      planningData?.runtime?.nodeVersion ||
      null,

    buildCommand:
      planningData?.buildCommand ||
      planningData?.scripts?.build ||
      null,

    installCommand:
      planningData?.installCommand ||
      null,

    outputDirectory:
      planningData?.outputDirectory ||
      planningData?.build?.outputDirectory ||
      null,

    projectScale:
      getIntentData(
        intent
      ).projectScale ||
      planningData?.projectScale ||
      planningData?.scale ||
      null,

    complexity:
      getIntentData(
        intent
      ).complexity ||
      planningData?.complexity ||
      null,

    environmentName:
      workflowState.environmentName ||
      request.environmentName ||
      null

  };

}


/* =========================================================
   ENGINEERING ORCHESTRATOR ADAPTER
========================================================= */

async function executeEngineeringWorkflow(
  workflowState,
  request,
  normalizedUser,
  intent,
  planningData,
  buildResult,
  memoryContext
) {

  workflowState.currentStage =
    "engineering-orchestration";

  const job =
    createEngineeringJob(
      workflowState,
      request,
      normalizedUser,
      intent,
      planningData,
      buildResult,
      memoryContext
    );

  recordStage(
    workflowState,
    "engineering-job-created",
    {
      projectId:
        workflowState.projectId,

      workflowId:
        workflowState.workflowId,

      requestId:
        workflowState.requestId,

      userId:
        workflowState.userId,

      fileCount:
        job.files.length,

      framework:
        job.framework,

      projectScale:
        job.projectScale,

      complexity:
        job.complexity
    },
    "completed"
  );

  if (
    !engineeringOrchestrator
  ) {

    const failure = {

      success:
        false,

      state:
        "ESCALATED",

      status:
        "service_unavailable",

      error:
        "Engineering Orchestrator is unavailable.",

      engineeringBoundary:
        true

    };

    workflowState.engineeringStatus =
      "ESCALATED";

    workflowState.engineeringFailure =
      failure;

    recordStage(
      workflowState,
      "engineering-orchestration",
      failure,
      "failed"
    );

    return failure;

  }

  try {

    logInfo(
      "Master → Engineering Orchestrator",
      {

        workflowId:
          workflowState.workflowId,

        requestId:
          workflowState.requestId,

        projectId:
          workflowState.projectId,

        userId:
          workflowState.userId,

        fileCount:
          job.files.length

      }
    );

    let result = null;

    if (
      typeof engineeringOrchestrator.run ===
      "function"
    ) {

      result =
        await engineeringOrchestrator.run(
          job
        );

    } else if (
      typeof engineeringOrchestrator.execute ===
      "function"
    ) {

      result =
        await engineeringOrchestrator.execute(
          job
        );

    } else if (
      typeof engineeringOrchestrator.build ===
      "function"
    ) {

      result =
        await engineeringOrchestrator.build(
          job
        );

    } else if (
      typeof engineeringOrchestrator ===
      "function"
    ) {

      result =
        await engineeringOrchestrator(
          job
        );

    } else {

      result = {

        success:
          false,

        state:
          "ESCALATED",

        status:
          "service_unavailable",

        error:
          "Engineering Orchestrator exposes no supported execution entrypoint.",

        engineeringBoundary:
          true

      };

    }

    if (
      !result ||
      typeof result !== "object"
    ) {

      result = {

        success:
          false,

        state:
          "ESCALATED",

        status:
          "invalid_result",

        error:
          "Engineering Orchestrator returned an invalid result.",

        engineeringBoundary:
          true

      };

    }

    const engineeringStateSnapshot =
      extractEngineeringState(
        result
      );

    const engineeringFailure =
      extractEngineeringFailure(
        result
      );

    const engineeringVerification =
      extractEngineeringVerification(
        result
      );

    const engineeringPromotion =
      extractEngineeringPromotion(
        result
      );

    const authoritativeEvidence =
      getAuthoritativeEvidence(
        result
      );

    workflowState.engineeringRun =
      sanitizeForContext(
        result
      );

    workflowState.engineeringStatus =
      String(
        result?.state ||
        result?.engineeringState ||
        result?.status ||
        engineeringStateSnapshot?.state ||
        "UNKNOWN"
      )
        .toUpperCase();

    workflowState.engineeringFailure =
      sanitizeForContext(
        engineeringFailure
      );

    workflowState.engineeringVerification =
      sanitizeForContext(
        engineeringVerification
      );

    workflowState.engineeringPromotion =
      sanitizeForContext(
        engineeringPromotion
      );

    workflowState.engineeringRepair =
      sanitizeForContext(
        result?.repair ||
        result?.repairRecord ||
        result?.data?.repair ||
        result?.data?.repairRecord ||
        null
      );

    if (
      authoritativeEvidence.valid
    ) {

      const files =
        extractEngineeringFiles(
          result
        );

      if (
        files.length > 0
      ) {

        buildResult = {

          ...buildResult,

          success:
            true,

          data: {

            ...(buildResult?.data || {}),

            files

          },

          files,

          engineering:
            sanitizeForContext(
              result
            )

        };

      }

      recordStage(
        workflowState,
        "engineering-orchestration",
        {

          success:
            true,

          state:
            "PROMOTED",

          promoted:
            true,

          verified:
            true,

          authoritative:
            true,

          validationMode:
            "authoritative",

          buildId:
            authoritativeEvidence.buildId,

          artifact:
            {
              storageKey:
                authoritativeEvidence.storageKey,

              checksum:
                authoritativeEvidence.checksum
            }

        },
        "completed"
      );

      logSuccess(
        "Master ← Engineering Orchestrator PROMOTED",
        {

          workflowId:
            workflowState.workflowId,

          requestId:
            workflowState.requestId,

          projectId:
            workflowState.projectId,

          state:
            "PROMOTED",

          buildId:
            authoritativeEvidence.buildId,

          artifactStorageKey:
            authoritativeEvidence.storageKey,

          checksum:
            authoritativeEvidence.checksum

        }
      );

      return {

        ...result,

        success:
          true,

        promoted:
          true,

        verified:
          true,

        authoritative:
          true,

        validationMode:
          "authoritative",

        state:
          "PROMOTED",

        buildId:
          result.buildId ||
          result.data?.buildId ||
          authoritativeEvidence.buildId,

        authoritativeEvidence:
          sanitizeForContext(
            authoritativeEvidence
          ),

        buildResult

      };

    }

    const failureResult = {

      ...result,

      success:
        false,

      state:
        workflowState.engineeringStatus ||
        "ESCALATED",

      failure:
        engineeringFailure ||
        result?.failure ||
        result?.errorDetails ||
        null,

      error:
        result?.error ||
        result?.message ||
        authoritativeEvidence.reason ||
        "Engineering workflow did not reach authoritative PROMOTED state.",

      authoritativeEvidence:
        sanitizeForContext(
          authoritativeEvidence
        ),

      engineeringBoundary:
        true

    };

    recordStage(
      workflowState,
      "engineering-orchestration",
      failureResult,
      "failed"
    );

    logError(
      "Master ← Engineering Orchestrator FAILED",
      {

        workflowId:
          workflowState.workflowId,

        requestId:
          workflowState.requestId,

        projectId:
          workflowState.projectId,

        state:
          workflowState.engineeringStatus,

        error:
          failureResult.error,

        errorName:
          result?.errorName ||
          result?.errorType ||
          result?.name ||
          null,

        code:
          result?.code ||
          null,

        runId:
          result?.runId ||
          result?.data?.runId ||
          null,

        dependencyLoadErrors:
          result?.dependencyLoadErrors ||
          result?.data?.dependencyLoadErrors ||
          null,

        authoritativeEvidence:
          authoritativeEvidence

      }
    );

    return failureResult;

  } catch (
    error
  ) {

    const normalized =
      normalizeError(
        error
      );

    const failure = {

      success:
        false,

      state:
        "ESCALATED",

      status:
        "exception",

      error:
        normalized.message,

      errorName:
        normalized.name,

      code:
        normalized.code,

      statusCode:
        normalized.status,

      stack:
        normalized.stack,

      engineeringBoundary:
        true

    };

    workflowState.engineeringStatus =
      "ESCALATED";

    workflowState.engineeringFailure =
      failure;

    recordStage(
      workflowState,
      "engineering-orchestration",
      failure,
      "failed"
    );

    logError(
      "Engineering Orchestrator Exception",
      {

        workflowId:
          workflowState.workflowId,

        requestId:
          workflowState.requestId,

        projectId:
          workflowState.projectId,

        error:
          normalized.message,

        errorName:
          normalized.name,

        code:
          normalized.code,

        stack:
          normalized.stack

      }
    );

    return failure;

  }

}


/* =========================================================
   DEPLOYMENT HELPERS
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


function canDeployAfterEngineering(
  workflow,
  engineeringResult
) {

  if (
    !workflow.requiresBuild
  ) {

    return {

      allowed:
        true,

      reason:
        "Deployment does not require a new engineering build."

    };

  }

  if (
    !engineeringResult
  ) {

    return {

      allowed:
        false,

      reason:
        "Deployment blocked because Engineering Orchestrator returned no result."

    };

  }

  const evidence =
    getAuthoritativeEvidence(
      engineeringResult
    );

  if (
    !evidence.valid
  ) {

    return {

      allowed:
        false,

      reason:
        `Deployment blocked because authoritative PROMOTED evidence is incomplete: ${evidence.reason}`,

      evidence

    };

  }

  return {

    allowed:
      true,

    reason:
      "Engineering build reached authoritative PROMOTED state.",

    evidence

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
        getAgentError(
          result
        ),

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
   ENVIRONMENT DEPLOYED
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
   PAYMENT
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
   SUBSCRIPTION
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
   DEPLOYMENT AUTO FIX
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

  if (
    !deploymentId
  ) {

    return {

      success:
        false,

      triggered:
        false,

      eligible:
        false,

      error:
        "DEPLOYMENT_ID_MISSING"

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
      !isSuccessful(
        logResult
      )
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
          )

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
        normalized.message,

      errorName:
        normalized.name,

      code:
        normalized.code

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

      errorName:
        normalized.name,

      code:
        normalized.code,

      status:
        normalized.status,

      stack:
        normalized.stack,

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
          normalized.message,

        errorName:
          normalized.name,

        code:
          normalized.code

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

  let engineeringResult =
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
      "ZyrionOS Master Agent Started",
      {
        version:
          MASTER_VERSION,

        engineeringSystem:
          "enabled"
      }
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
        normalizedUser,
        normalizedRequest
      );

    const projectId =
      getProjectId(
        normalizedRequest
      );

    normalizedRequest.projectId =
      projectId;


    /* =====================================================
       WORKFLOW STATE
    ===================================================== */

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
       ENVIRONMENT
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
       GITHUB DEPLOYMENT PREPARATION
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
       BUILD GENERATION + ENGINEERING
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
         ENGINEERING ORCHESTRATOR
      --------------------------------------------------- */

      currentStage =
        "engineering-orchestration";

      engineeringResult =
        await executeEngineeringWorkflow(

          workflowState,

          normalizedRequest,

          normalizedUser,

          intent,

          planningData,

          buildResult,

          memoryContext

        );


      const engineeringFiles =
        extractEngineeringFiles(
          engineeringResult
        );

      if (
        engineeringFiles.length > 0
      ) {

        buildResult = {

          ...buildResult,

          success:
            true,

          data: {

            ...(buildResult?.data || {}),

            files:
              engineeringFiles

          },

          files:
            engineeringFiles,

          engineering:
            sanitizeForContext(
              engineeringResult
            )

        };

      }


      if (
        !isEngineeringPromoted(
          engineeringResult
        )
      ) {

        workflowState.status =
          "failed";

        const failure =
          extractEngineeringFailure(
            engineeringResult
          );

        const evidence =
          getAuthoritativeEvidence(
            engineeringResult
          );

        logError(
          "Engineering Build Pipeline Failed",
          {

            workflowId:
              workflowState.workflowId,

            projectId:
              workflowState.projectId,

            state:
              workflowState.engineeringStatus,

            error:
              engineeringResult?.error ||
              evidence.reason ||
              "Engineering pipeline did not reach PROMOTED state.",

            failure,

            authoritativeEvidence:
              evidence

          }
        );

        return {

          success:
            false,

          message:
            "Engineering build pipeline failed",

          error:
            engineeringResult?.error ||
            evidence.reason ||
            "Engineering pipeline did not produce a verified promoted build.",

          stage:
            "engineering-orchestration",

          workflow:
            workflowState,

          intent,

          planning,

          buildResult,

          engineering:
            sanitizeForContext(
              engineeringResult
            ),

          authoritativeEvidence:
            sanitizeForContext(
              evidence
            )

        };

      }

      logSuccess(
        "Engineering Build Pipeline Passed",
        {

          workflowId:
            workflowState.workflowId,

          projectId:
            workflowState.projectId,

          state:
            workflowState.engineeringStatus,

          buildId:
            engineeringResult?.buildId ||
            engineeringResult?.data?.buildId ||
            engineeringResult?.authoritativeEvidence?.buildId ||
            null

        }
      );

    }


    /* =====================================================
       EXPLICIT FIX WORKFLOW
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

      currentStage =
        "deployment-build-gate";

      const buildGate =
        canDeployAfterEngineering(

          workflow,

          engineeringResult

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

          engineering:
            sanitizeForContext(
              engineeringResult
            ),

          authoritativeEvidence:
            sanitizeForContext(
              buildGate.evidence
            )

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

          engineering:
            sanitizeForContext(
              engineeringResult
            ),

          environmentResult:
            environmentGate.result ||
            null

        };

      }

      environmentResult =
        environmentGate.result ||
        null;


      /* ---------------------------------------------------
         SNAPSHOT
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

            engineering:
              sanitizeForContext(
                engineeringResult
              ),

            authoritativeBuild:
              sanitizeForContext(
                engineeringResult
              ),

            workflowId:
              workflowState.workflowId,

            requestId:
              workflowState.requestId,

            environmentName:
              environmentGate.environment,

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

          engineering:
            sanitizeForContext(
              engineeringResult
            ),

          buildResult,

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
       ORCHESTRATION RESULT
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

      engineering:
        sanitizeForContext(
          engineeringResult
        ),

      engineeringStatus:
        workflowState.engineeringStatus,

      engineeringPromotion:
        sanitizeForContext(
          workflowState.engineeringPromotion
        ),

      engineeringVerification:
        sanitizeForContext(
          workflowState.engineeringVerification
        ),

      engineeringFailure:
        sanitizeForContext(
          workflowState.engineeringFailure
        ),

      authoritativeEvidence:
        sanitizeForContext(
          getAuthoritativeEvidence(
            engineeringResult
          )
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
       FINAL COMMUNICATION
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

The backend is the source of truth.

Engineering builds are controlled exclusively by
Engineering Orchestrator.

Rules:

1. Never invent results.
2. Never invent URLs.
3. Never invent deployment success.
4. Never invent payment success.
5. Never invent subscription entitlement.
6. Never invent infrastructure resources.
7. Never expose secrets.
8. Never expose API keys.
9. Never expose tokens.
10. Never expose passwords.

11. Never claim a build succeeded merely because:
    - Builder succeeded
    - static validation passed
    - a buildId exists
    - Docker started
    - an artifact object exists

12. A build may be reported as successful only when:
    - Engineering Orchestrator reached PROMOTED
    - authoritative verification passed
    - validationMode is authoritative
    - buildId exists
    - artifact storage key/path exists
    - artifact checksum exists

13. Never call static validation authoritative.

14. Never claim deployment success unless:
    deploymentResult.success=true.

15. Never claim environment readiness unless its gate passed.

16. Never claim GitHub success unless:
    githubResult.success=true.

17. If engineering failed or escalated, clearly say it failed.

18. If Auto Fix was triggered, say it was triggered but
    never claim the issue is already repaired.

19. Use only exact deployment URLs returned by backend.

20. Never construct URLs.

21. Never claim runtime/browser health from a successful
    build alone.

22. Never claim a repair succeeded unless the repaired
    project subsequently reached authoritative verification
    and PROMOTED state.

23. Never expose internal secrets or credentials.

24. Never claim an agent ran if it was skipped.

25. The final answer must reflect backend state exactly.

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

ENGINEERING:

${safeJson(
  engineeringResult
)}

AUTHORITATIVE EVIDENCE:

${safeJson(
  getAuthoritativeEvidence(
    engineeringResult
  )
)}

BUILD:

${safeJson(
  buildResult
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
        deploymentResult?.url ||
        null;

      const engineeringPassed =
        isEngineeringPromoted(
          engineeringResult
        );

      reply =
        [

          `Workflow ${workflowState.status}.`,

          completed
            ? `Completed: ${completed}.`
            : "",

          failed
            ? `Failed: ${failed}.`
            : "",

          engineeringPassed
            ? "Engineering build passed authoritative verification and was promoted."
            : "",

          workflowState.engineeringStatus &&
          !engineeringPassed
            ? `Engineering state: ${workflowState.engineeringStatus}.`
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
       COMPLETE LOG
    ===================================================== */

    logSuccess(
      "Master Agent Completed",
      {

        workflowId:
          workflowState.workflowId,

        status:
          workflowState.status,

        engineeringStatus:
          workflowState.engineeringStatus,

        engineeringPromoted:
          isEngineeringPromoted(
            engineeringResult
          ),

        authoritativeEvidence:
          sanitizeForContext(
            getAuthoritativeEvidence(
              engineeringResult
            )
          ),

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
          normalized.message,

        errorName:
          normalized.name,

        code:
          normalized.code,

        stack:
          normalized.stack

      }
    );

    return {

      success:
        false,

      message:
        "Master Agent Failed",

      error:
        normalized.message,

      errorName:
        normalized.name,

      code:
        normalized.code,

      status:
        normalized.status,

      stack:
        normalized.stack,

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

        engineering:
          sanitizeForContext(
            engineeringResult
          ),

        authoritativeEvidence:
          sanitizeForContext(
            getAuthoritativeEvidence(
              engineeringResult
            )
          ),

        buildResult:
          sanitizeForContext(
            buildResult
          ),

        deploymentResult:
          sanitizeForContext(
            deploymentResult
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
   ENGINEERING OWNERSHIP
========================================================= */

masterAgent.engineeringOwnership = {

  master: [

    "request_to_engineering_job",
    "engineering_result_consumption",
    "deployment_gate_after_promotion",
    "final_result_aggregation"

  ],

  engineeringOrchestrator: [

    "engineering_run_lifecycle",
    "execution_orchestration",
    "failure_diagnosis_loop",
    "repair_loop",
    "retry_policy",
    "checkpoint_coordination",
    "rollback_coordination",
    "verification",
    "promotion",
    "escalation"

  ],

  engineeringExecutor: [

    "dependency_installation",
    "build_execution",
    "test_execution",
    "runtime_execution",
    "preview_execution",
    "docker_execution",
    "timeouts",
    "resource_limits",
    "process_termination",
    "stdout_stderr_capture",
    "artifact_creation",
    "artifact_verification"

  ],

  engineeringIntelligence: [

    "failure_classification",
    "root_cause_analysis",
    "failure_signatures",
    "repair_strategy",
    "repair_validation",
    "repair_memory",
    "regression_detection",
    "resource_analysis",
    "auto_scale_recommendation"

  ],

  engineeringState: [

    "engineering_run_state",
    "attempt_records",
    "execution_records",
    "failure_records",
    "repair_records",
    "verification_records",
    "artifact_records",
    "resource_events",
    "checkpoints",
    "rollback_records",
    "audit_events",
    "state_transitions",
    "successful_patterns"

  ],

  builder: [

    "source_generation_only"

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

  directDockerExecution:
    false,

  directBuildExecution:
    false,

  environmentSecretsExposedToMaster:
    false,

  githubTokensExposedToMaster:
    false,

  providerArchitecture:
    "centralized-ai-provider-service",

  buildArchitecture:
    "engineering-orchestrator",

  executionArchitecture:
    "engineering-executor",

  intelligenceArchitecture:
    "engineering-intelligence",

  stateArchitecture:
    "engineering-state",

  artifactAuthority:
    "engineering-executor",

  promotionAuthority:
    "engineering-orchestrator"

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
    "engineering-orchestration",
    "ANALYZING",
    "EXECUTING",
    "DIAGNOSING",
    "REPAIRING",
    "VERIFYING",
    "PASSED",
    "PROMOTED"

  ],

  buildAndDeploy: [

    "memory",
    "intent",
    "planning",
    "builder",
    "engineering-orchestration",
    "PROMOTED",
    "environment-readiness",
    "environment-snapshot",
    "deploy",
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
    "planning",
    "builder",
    "engineering-orchestration",
    "PROMOTED",
    "environment-readiness",
    "environment-snapshot",
    "deploy",
    "environment-deployed"

  ],

  deploymentFailure: [

    "deploy",
    "deployment-error-log",
    "auto-fix-trigger"

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
   LEGACY BUILD CONTRACT
========================================================= */

masterAgent.legacyBuildArchitecture = {

  masterDirectAuthoritativeBuild:
    false,

  masterDirectDocker:
    false,

  masterDirectInstall:
    false,

  masterDirectRuntime:
    false,

  masterDirectArtifactCreation:
    false,

  adapterLocation:
    "engineeringExecutor",

  finalOwner:
    "engineeringOrchestrator"

};


/* =========================================================
   ENGINEERING SYSTEM CONTRACT
========================================================= */

masterAgent.engineeringContract = {

  version:
    "2.0.0",

  files: [

    "engineeringState.js",
    "engineeringExecutor.js",
    "engineeringIntelligence.js",
    "engineeringOrchestrator.js"

  ],

  states:
    Array.from(
      ENGINEERING_STATES
    ),

  successState:
    "PROMOTED",

  failureStates: [

    "FAILED",
    "ROLLBACK",
    "ESCALATED"

  ],

  authoritativeSuccessRequired:
    true,

  artifactVerificationRequired:
    true,

  promotionRequiredForDeployment:
    true,

  masterMayDeclareBuildSuccess:
    false,

  orchestratorMayDeclareBuildSuccess:
    true,

  executorMayExecuteBuild:
    true,

  intelligenceMayDeclareBuildSuccess:
    false,

  stateIsSourceOfTruth:
    true

};


/* =========================================================
   VERSION / DIAGNOSTIC CONTRACT
========================================================= */

masterAgent.diagnosticContract = {

  version:
    "7.1.0",

  engineeringPromotionAuthority:
    "engineeringOrchestrator",

  authoritativeValidationMode:
    "authoritative",

  requiredPromotionEvidence: [

    "success=true",
    "state=PROMOTED",
    "promoted=true",
    "verified=true",
    "authoritative=true",
    "validationMode=authoritative",
    "buildId",
    "artifact.storageKey|artifact.path|artifact.key",
    "artifact.checksum"

  ],

  masterDoesNotExecuteBuild:
    true,

  masterDoesNotPromoteBuild:
    true

};


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  masterAgent;
