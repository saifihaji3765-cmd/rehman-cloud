/* =========================================================
   ZYRIONOS MASTER AGENT
   ---------------------------------------------------------
   Central Autonomous Orchestrator / CEO Control Plane

   CORE RESPONSIBILITY:

   User Request
        ↓
   Master Agent
        ↓
   Intent
        ↓
   Workflow Decision
        ↓
   Specialized Agents
        ↓
   Validation Gates
        ↓
   Final Result
        ↓
   Master Response

   MASTER IS RESPONSIBLE FOR:

   - Request normalization
   - Memory context
   - Intent classification
   - Workflow selection
   - Agent sequencing
   - Dependency enforcement
   - Failure propagation
   - Execution gates
   - Build → Deploy protection
   - Billing → Subscription coordination
   - Infrastructure ownership
   - Large-project orchestration
   - Final result aggregation

   MASTER DOES NOT:

   - Generate source code itself
   - Deploy infrastructure itself
   - Process payments itself
   - Modify files itself
   - Directly call an AI provider
   - Invent successful results

   AI PROVIDERS:

   Master never calls Gemini/OpenAI/etc directly.

   All AI calls go through:

       services/ai/aiProviderService.js

========================================================= */


/* =========================================================
   SPECIALIZED AGENTS
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


/* =========================================================
   INFRASTRUCTURE AGENTS
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
   BUSINESS / DEPLOYMENT AGENTS
========================================================= */

const billingAgent =
  require("./billingAgent");

const subscriptionAgent =
  require("./subscriptionAgent");

const deployAgent =
  require("./deployAgent");


/* =========================================================
   FINANCIAL CONTROL AGENTS
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
   CONSTANTS
========================================================= */

const MAX_PROMPT_LENGTH =
  12000;

const MAX_MEMORY_LENGTH =
  5000;

const MAX_CONTEXT_LENGTH =
  18000;

const MAX_WORKFLOW_STEPS =
  20;

const MAX_AGENT_RESULTS =
  30;


/* =========================================================
   AGENT REGISTRY
   ---------------------------------------------------------
   Registry describes ownership.

   IMPORTANT:

   Master owns workflow orchestration.

   Deploy Agent owns deployment internals.

   Therefore Master does NOT independently execute:

       dockerAgent
       awsAgent
       domainAgent
       sslAgent

   during a deploy workflow unless a future
   explicit architecture requires it.
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

  deploy:
    deployAgent,

  billing:
    billingAgent,

  subscription:
    subscriptionAgent,

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
   SAFE JSON
========================================================= */

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      value ?? null
    );

  } catch (
    error
  ) {

    return JSON.stringify({

      error:
        "Unable to serialize value"

    });

  }

}


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
   ERROR NORMALIZER
========================================================= */

function normalizeError(
  error
) {

  if (
    !error
  ) {

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

  if (
    !result
  ) {

    return "Agent returned no result.";

  }


  return (

    result.error ||

    result.message ||

    "Agent returned an unsuccessful result."

  );

}


/* =========================================================
   GET PLANNING DATA
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
   GET DEPLOYMENT ID
========================================================= */

function getDeploymentId(
  deploymentResult,
  projectId
) {

  return (

    deploymentResult
      ?.deployment
      ?.deploymentId ||

    deploymentResult
      ?.data
      ?.deploymentId ||

    deploymentResult
      ?.deploymentId ||

    deploymentResult
      ?.data
      ?.id ||

    projectId ||

    null

  );

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
   REQUEST NORMALIZATION
========================================================= */

function normalizeRequest(
  request,
  fallbackUser = {}
) {

  let normalized = {};


  if (
    typeof request ===
    "string"
  ) {

    normalized = {

      prompt:
        request

    };

  }

  else if (
    request &&
    typeof request ===
      "object"
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
    )
      .toLowerCase();


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


  normalized.user =
    normalized.user ||
    fallbackUser ||
    {};


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

    startedAt:
      new Date(),

    userId:
      userId || null,

    projectId:
      request.projectId || null,

    projectName:
      request.projectName || null,

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
      {}

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

  if (
    !workflow
  ) {

    return;

  }


  const entry = {

    stage,

    status,

    timestamp:
      new Date(),

    success:
      result?.success === true

  };


  if (
    status ===
    "completed"
  ) {

    workflow.completedStages.push(
      stage
    );

  }

  else if (
    status ===
    "failed"
  ) {

    workflow.failedStages.push(
      stage
    );

  }

  else if (
    status ===
    "skipped"
  ) {

    workflow.skippedStages.push(
      stage
    );

  }


  workflow.agentResults[
    stage
  ] =
    result || null;


  /*
   * Keep orchestration state bounded.
   */

  if (
    workflow.completedStages.length >
    MAX_WORKFLOW_STEPS
  ) {

    workflow.completedStages =
      workflow.completedStages.slice(
        -MAX_WORKFLOW_STEPS
      );

  }


  return entry;

}


/* =========================================================
   ROUTE NORMALIZATION
========================================================= */

function getIntentData(
  intent
) {

  if (
    intent?.data &&
    typeof intent.data ===
      "object"
  ) {

    return intent.data;

  }


  if (
    intent &&
    typeof intent ===
      "object"
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
          (
            item
          ) =>
            typeof item ===
            "string"
        )

        .map(
          (
            item
          ) =>
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
   ---------------------------------------------------------
   Master converts Intent output into an explicit
   execution workflow.

   This prevents every agent from making its own
   interpretation of the request.
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
    )
      .toLowerCase();


  const secondary =
    getSecondaryIntents(
      intent
    );


  const workflow = {

    type:
      type || "chat",

    secondary,

    requiresPlanning:
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

    autonomousSequence:
      false

  };


  /*
   * PRIMARY ROUTES
   */

  switch (
    workflow.type
  ) {

    case "build":

      workflow.requiresPlanning =
        true;

      workflow.requiresBuild =
        true;

      break;


    case "fix":

      workflow.requiresPlanning =
        true;

      workflow.requiresFix =
        true;

      break;


    case "deploy":

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

      workflow.requiresMonitoring =
        true;

      break;


    case "scale":

      workflow.requiresScaling =
        true;

      break;


    case "file":

      workflow.requiresFile =
        true;

      break;


    case "automation":

      workflow.requiresPlanning =
        true;

      break;


    case "infrastructure":

      workflow.requiresPlanning =
        true;

      break;


    case "chat":

    case "thumbnail":

    default:

      break;

  }


  /*
   * EXPLICIT SECONDARY OPERATIONS
   *
   * Only explicit secondary intents can
   * expand the workflow.
   */

  if (
    secondary.includes(
      "deploy"
    )
  ) {

    workflow.requiresDeploy =
      true;

  }


  if (
    secondary.includes(
      "billing"
    )
  ) {

    workflow.requiresBilling =
      true;

  }


  if (
    secondary.includes(
      "subscription"
    )
  ) {

    workflow.requiresSubscription =
      true;

  }


  if (
    secondary.includes(
      "monitor"
    )
  ) {

    workflow.requiresMonitoring =
      true;

  }


  if (
    secondary.includes(
      "scale"
    )
  ) {

    workflow.requiresScaling =
      true;

  }


  /*
   * Explicit request flags.
   */

  if (
    request?.autoDeploy ===
    true
  ) {

    workflow.requiresDeploy =
      true;

  }


  if (
    request?.afterBuild ===
    "deploy"
  ) {

    workflow.requiresDeploy =
      true;

  }


  /*
   * A build + deploy workflow is autonomous,
   * but deployment is only allowed after
   * successful build validation.
   */

  if (
    workflow.requiresBuild &&
    workflow.requiresDeploy
  ) {

    workflow.autonomousSequence =
      true;

  }


  return workflow;

}


/* =========================================================
   CONTEXT BUILDER
========================================================= */

function createAgentContext(
  base
) {

  const context = {

    workflowId:
      base.workflow.workflowId,

    userId:
      base.userId,

    projectId:
      base.request.projectId,

    projectName:
      base.projectName,

    prompt:
      base.request.prompt,

    user:
      base.request.user,

    framework:
      base.request.framework,

    intent:
      base.intent,

    planning:
      base.planningData,

    memoryContext:
      base.memoryContext,

    workflow:
      base.workflow,

    previousResults:
      base.workflow.agentResults,

    operationState: {

      currentStage:
        base.workflow.currentStage,

      completedStages:
        base.workflow.completedStages,

      failedStages:
        base.workflow.failedStages,

      status:
        base.workflow.status

    }

  };


  /*
   * Keep large context bounded.
   *
   * Individual agent results remain available
   * in workflow state, but the serialized context
   * sent to an agent should not become infinite.
   */

  return context;

}


/* =========================================================
   RUN AGENT SAFELY
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
    typeof agent !==
    "function"
  ) {

    const failure = {

      success:
        false,

      message:
        `${stage} agent is unavailable`,

      error:
        `No callable agent registered for ${stage}`

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

    logger.info(
      `Master → ${stage} Agent`
    );


    const result =
      await agent(
        payload
      );


    if (
      isSuccessful(
        result
      )
    ) {

      recordStage(
        workflow,
        stage,
        result,
        "completed"
      );


      logger.success(
        `Master ← ${stage} Agent Completed`
      );

    }

    else {

      recordStage(
        workflow,
        stage,
        result,
        "failed"
      );


      logger.error(
        `Master ← ${stage} Agent Failed: ${getAgentError(result)}`
      );

    }


    return result;

  }

  catch (
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
        `${stage} Agent Failed`,

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


    logger.error(
      `Master ← ${stage} Agent Exception: ${normalized.message}`
    );


    return result;

  }

}


/* =========================================================
   BUILD OUTPUT VALIDATION
========================================================= */

function validateBuildResult(
  result
) {

  if (
    !isSuccessful(
      result
    )
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
    result
      ?.data
      ?.files;


  if (
    !Array.isArray(
      files
    )
  ) {

    return {

      valid:
        false,

      error:
        "Builder returned no files array."

    };

  }


  if (
    files.length ===
    0
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
   DEPLOYMENT GATE
   ---------------------------------------------------------
   Deployment MUST NEVER happen after a failed build.
========================================================= */

function canDeploy(
  workflow,
  buildResult
) {

  /*
   * Direct deployment of an already-existing
   * project is allowed when no build was requested.
   */

  if (
    !workflow.requiresBuild
  ) {

    return {

      allowed:
        true,

      reason:
        "Existing project deployment workflow."

    };

  }


  /*
   * Build was required.
   */

  if (
    !isSuccessful(
      buildResult
    )
  ) {

    return {

      allowed:
        false,

      reason:
        "Deployment blocked because build did not succeed."

    };

  }


  const validation =
    validateBuildResult(
      buildResult
    );


  if (
    !validation.valid
  ) {

    return {

      allowed:
        false,

      reason:
        validation.error

    };

  }


  return {

    allowed:
      true,

    reason:
      "Build completed and returned project files."

  };

}


/* =========================================================
   FINANCIAL GATE
   ---------------------------------------------------------
   Master never invents payment success.

   Subscription Agent remains responsible for
   entitlement state.

   Billing Agent remains responsible for billing
   operations/status.
========================================================= */

function getPaymentContext(
  request
) {

  return {

    paymentId:
      request?.paymentId ||
      null,

    paymentConfirmed:
      request?.paymentConfirmed ===
      true,

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


  /*
   * Subscription status checks do not necessarily
   * require a payment.
   */

  if (
    request?.operation ===
    "status"
  ) {

    return {

      allowed:
        true,

      reason:
        "Subscription status operation."

    };

  }


  /*
   * If the request explicitly says payment has
   * been confirmed, pass the authoritative payment
   * identifiers downstream.

   * The Subscription Agent must still verify
   * authoritative payment state before entitlement.
   */

  if (
    payment.paymentConfirmed
  ) {

    return {

      allowed:
        true,

      reason:
        "Payment confirmation supplied; downstream subscription agent must verify authoritative state."

    };

  }


  /*
   * Never manufacture an entitlement from a
   * missing payment confirmation.
   */

  return {

    allowed:
      true,

    reason:
      "Subscription agent may inspect current entitlement/payment state."

  };

}


/* =========================================================
   PROJECT FILES
========================================================= */

function getProjectFiles(
  request,
  buildResult
) {

  return (

    buildResult
      ?.data
      ?.files ||

    request?.files ||

    []

  );

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

  let fixResult =
    null;

  let fileResult =
    null;


  try {

    logger.info(
      "⚡ ZyrionOS Master Agent Started"
    );


    /* =====================================================
       REQUEST NORMALIZATION
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
      normalizedRequest.projectId ||
      null;


    const workflowState =
      createWorkflowState(
        normalizedRequest,
        userId
      );


    /* =====================================================
       MEMORY
    ===================================================== */

    currentStage =
      "memory-agent";


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
            workflowState.workflowId

        }

      );


    /*
     * Memory failure is non-fatal.
     *
     * Memory must never block a normal request.
     */

    if (
      !isSuccessful(
        memoryContext
      )
    ) {

      logger.warning(
        "Memory unavailable. Continuing without memory."
      );

    }


    /* =====================================================
       INTENT
    ===================================================== */

    currentStage =
      "intent-agent";


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
            workflowState.workflowId

        }

      );


    /*
     * Intent failure is NOT silently converted into
     * a successful arbitrary workflow.
     *
     * The Intent Agent itself has a deterministic
     * fallback in the replacement provided earlier.
     */

    if (
      !isSuccessful(
        intent
      )
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
       REQUEST TYPE OVERRIDE
       -----------------------------------------------------
       Explicit API-level request type has priority
       over AI classification.
    ===================================================== */

    if (
      normalizedRequest.type ===
      "code"
    ) {

      intent = {

        ...intent,

        success:
          true,

        type:
          "build",

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
      normalizedRequest.type ===
      "deploy"
    ) {

      intent = {

        ...intent,

        success:
          true,

        type:
          "deploy",

        data: {

          ...getIntentData(
            intent
          ),

          type:
            "deploy"

        }

      };

    }


    /* =====================================================
       WORKFLOW DECISION
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


    logger.info(

      `Master Workflow: ${workflow.type}` +
      ` | Planning=${workflow.requiresPlanning}` +
      ` | Build=${workflow.requiresBuild}` +
      ` | Deploy=${workflow.requiresDeploy}` +
      ` | Billing=${workflow.requiresBilling}` +
      ` | Subscription=${workflow.requiresSubscription}`

    );


    /* =====================================================
       PLANNING
       -----------------------------------------------------
       Planning is only executed when the workflow
       actually needs planning.
    ===================================================== */

    if (
      workflow.requiresPlanning
    ) {

      currentStage =
        "planning-agent";


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
              workflowState.workflowId

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
       BUILD
       -----------------------------------------------------
       Builder can only run after successful planning.
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
            "Builder requires a successful Planning Agent result.",

          stage:
            "build-gate",

          workflow:
            workflowState,

          planning

        };

      }


      currentStage =
        "builder-agent";


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
              planningData
                ?.frontend
                ?.framework ||
              "React",

            user:
              normalizedUser,

            userId,

            memoryContext,

            intent,

            projectId,

            workflowId:
              workflowState.workflowId

          }

        );


      const buildValidation =
        validateBuildResult(
          buildResult
        );


      if (
        !buildValidation.valid
      ) {

        workflowState.status =
          "failed";


        return {

          success:
            false,

          message:
            "Build failed",

          error:
            buildValidation.error,

          stage:
            currentStage,

          workflow:
            workflowState,

          intent,

          planning,

          buildResult

        };

      }


      logger.success(

        `Master Build Gate Passed: ` +
        `${buildValidation.files.length} files`

      );

    }


    /* =====================================================
       FIX
       -----------------------------------------------------
       Fix is independent unless the request also
       explicitly requires another workflow.
    ===================================================== */

    if (
      workflow.requiresFix
    ) {

      currentStage =
        "fix-agent";


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
        "file-agent";


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
       -----------------------------------------------------
       Billing does not automatically mean entitlement.
    ===================================================== */

    if (
      workflow.requiresBilling
    ) {

      currentStage =
        "billing-agent";


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
              normalizedRequest.plan ||
              normalizedRequest.subscriptionPlan ||
              planningData?.plan ||
              planningData?.subscriptionPlan ||
              null,

            billingCycle:
              normalizedRequest.billingCycle,

            paymentProvider:
              normalizedRequest.paymentProvider,

            paymentId:
              normalizedRequest.paymentId,

            providerCustomerId:
              normalizedRequest.providerCustomerId,

            providerSubscriptionId:
              normalizedRequest.providerSubscriptionId,

            workflowId:
              workflowState.workflowId,

            user:
              normalizedUser,

            planning:
              planningData

          }

        );

    }


    /* =====================================================
       SUBSCRIPTION
       -----------------------------------------------------
       Subscription agent owns entitlement state.
    ===================================================== */

    if (
      workflow.requiresSubscription
    ) {

      const subscriptionGate =
        canProcessSubscription(
          normalizedRequest
        );


      if (
        !subscriptionGate.allowed
      ) {

        workflowState.status =
          "failed";


        return {

          success:
            false,

          message:
            "Subscription operation blocked",

          error:
            subscriptionGate.reason,

          stage:
            "subscription-gate",

          workflow:
            workflowState

        };

      }


      currentStage =
        "subscription-agent";


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
              normalizedRequest.plan ||
              normalizedRequest.subscriptionPlan ||
              null,

            billingCycle:
              normalizedRequest.billingCycle,

            paymentProvider:
              normalizedRequest.paymentProvider,

            paymentConfirmed:
              normalizedRequest.paymentConfirmed ===
              true,

            paymentId:
              normalizedRequest.paymentId,

            providerCustomerId:
              normalizedRequest.providerCustomerId,

            providerSubscriptionId:
              normalizedRequest.providerSubscriptionId,

            workflowId:
              workflowState.workflowId,

            planning:
              planningData

          }

        );

    }


    /* =====================================================
       DEPLOYMENT
       -----------------------------------------------------
       CRITICAL GATE:
       If build was requested, build MUST succeed
       before deployment.
    ===================================================== */

    if (
      workflow.requiresDeploy
    ) {

      currentStage =
        "deployment-gate";


      const deploymentGate =
        canDeploy(
          workflow,
          buildResult
        );


      if (
        !deploymentGate.allowed
      ) {

        workflowState.status =
          "failed";


        logger.error(
          `Deployment blocked: ${deploymentGate.reason}`
        );


        return {

          success:
            false,

          message:
            "Deployment blocked",

          error:
            deploymentGate.reason,

          stage:
            currentStage,

          workflow:
            workflowState,

          intent,

          planning,

          buildResult,

          deploymentResult:
            null

        };

      }


      currentStage =
        "deploy-agent";


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
              planningData
                ?.frontend
                ?.framework,

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

            workflowId:
              workflowState.workflowId,

            paymentId:
              normalizedRequest.paymentId,

            paymentConfirmed:
              normalizedRequest.paymentConfirmed ===
              true,

            paymentProvider:
              normalizedRequest.paymentProvider,

            providerCustomerId:
              normalizedRequest.providerCustomerId,

            providerSubscriptionId:
              normalizedRequest.providerSubscriptionId,

            billingCycle:
              normalizedRequest.billingCycle,

            /*
             * Deploy Agent owns:
             *
             * Docker
             * AWS
             * Domain
             * SSL
             * deployment URL
             *
             * Master must not execute those agents
             * a second time.
             */

            infrastructureOwnership:
              "deployAgent"

          }

        );


      if (
        !isSuccessful(
          deploymentResult
        )
      ) {

        workflowState.status =
          "failed";


        return {

          success:
            false,

          message:
            "Deployment failed",

          error:
            getAgentError(
              deploymentResult
            ),

          stage:
            currentStage,

          workflow:
            workflowState,

          intent,

          planning,

          buildResult,

          deploymentResult

        };

      }


      /*
       * A deployment result must contain some
       * authoritative deployment identity.
       */

      const deploymentId =
        getDeploymentId(
          deploymentResult,
          projectId
        );


      logger.success(

        `Deployment Gate Passed` +
        ` | deploymentId=${deploymentId || "unknown"}`

      );

    }


    /* =====================================================
       MONITORING
       -----------------------------------------------------
       Monitoring is allowed after deployment or for
       an existing project.
    ===================================================== */

    if (
      workflow.requiresMonitoring
    ) {

      currentStage =
        "monitoring-agent";


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

          message:
            "Deployment or project ID required for monitoring",

          error:
            "No deployment identifier was available."

        };


        recordStage(
          workflowState,
          "monitoring",
          monitoringResult,
          "failed"
        );

      }

      else {

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
                workflowState.workflowId

            }

          );

      }

    }


    /* =====================================================
       SCALING
       -----------------------------------------------------
       Scaling only receives a known deployment/project
       identity.
    ===================================================== */

    if (
      workflow.requiresScaling
    ) {

      currentStage =
        "scaling-agent";


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

          message:
            "Deployment or project ID required for scaling",

          error:
            "No deployment identifier was available."

        };


        recordStage(
          workflowState,
          "scaling",
          scalingResult,
          "failed"
        );

      }

      else {

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
                workflowState.workflowId

            }

          );

      }

    }


    /* =====================================================
       WORKFLOW COMPLETION
    ===================================================== */

    workflowState.status =
      "completed";


    workflowState.currentStage =
      "completed";


    /* =====================================================
       ORCHESTRATION SNAPSHOT
    ===================================================== */

    const orchestration = {

      workflowId:
        workflowState.workflowId,

      status:
        workflowState.status,

      intent,

      planning,

      memoryContext,

      buildResult,

      deploymentResult,

      monitoringResult,

      scalingResult,

      billingResult,

      subscriptionResult,

      fixResult,

      fileResult,

      workflow,

      completedStages:
        workflowState.completedStages,

      failedStages:
        workflowState.failedStages,

      skippedStages:
        workflowState.skippedStages,

      infrastructureOwnership: {

        deployAgentOwns:

          [

            "docker",

            "aws",

            "domain",

            "ssl"

          ]

      },

      financialOwnership: {

        billingAgentOwns:

          [

            "billing_operations",

            "payment_information"

          ],

        subscriptionAgentOwns:

          [

            "subscription_state",

            "entitlements",

            "plan_access"

          ]

      }

    };


    /* =====================================================
       FINAL AI COMMUNICATION
       -----------------------------------------------------
       This AI call is ONLY for communication.

       It does NOT decide what already happened.

       Backend results are authoritative.
    ===================================================== */

    currentStage =
      "master-final-response";


    const completion =
      await generateText({

        messages: [

          {

            role:
              "system",

            content: `

You are the final communication layer of ZyrionOS.

The Master Agent has already completed orchestration.

Your job is ONLY to explain the actual backend results.

The backend is the source of truth.

STRICT RULES:

1. Never invent a result.

2. Never invent a deployment URL.

3. Never invent a payment success.

4. Never invent a subscription entitlement.

5. Never invent AWS infrastructure.

6. Never invent Docker results.

7. Never invent monitoring metrics.

8. Never invent scaling results.

9. Never claim a build succeeded unless
   buildResult.success === true.

10. Never claim deployment succeeded unless
    deploymentResult.success === true.

11. Never claim payment succeeded unless
    billingResult explicitly reports success.

12. Never claim features are unlocked unless
    subscriptionResult explicitly reports
    the entitlement/access state.

13. Never expose secrets, tokens, passwords,
    API keys, cookies or credentials.

14. If something failed, state that it failed.

15. If something is unavailable, state that it
    is unavailable.

16. If deployment URL is present in the backend
    result, report that exact URL.

17. Do not fabricate a branded URL from a
    provider URL.

18. Do not say an agent ran if the orchestration
    record shows it was skipped.

19. Keep the response concise but informative.

20. Never override backend truth with assumptions.

`

          },

          {

            role:
              "user",

            content: `

USER REQUEST:

${normalizedRequest.prompt}

WORKFLOW:

${safeJson(
  workflow
)}

INTENT:

${safeJson(
  intent
)}

PLANNING:

${safeJson(
  planning
)}

BUILD RESULT:

${safeJson(
  buildResult
)}

DEPLOYMENT RESULT:

${safeJson(
  deploymentResult
)}

BILLING RESULT:

${safeJson(
  billingResult
)}

SUBSCRIPTION RESULT:

${safeJson(
  subscriptionResult
)}

MONITORING RESULT:

${safeJson(
  monitoringResult
)}

SCALING RESULT:

${safeJson(
  scalingResult
)}

FIX RESULT:

${safeJson(
  fixResult
)}

FILE RESULT:

${safeJson(
  fileResult
)}

WORKFLOW STATE:

${safeJson(
  workflowState
)}

`

          }

        ],

        maxTokens:
          1800

      });


    /* =====================================================
       FINAL AI FAILURE
       -----------------------------------------------------
       The actual orchestration already happened.
       Therefore a communication-provider failure
       must NOT erase successful backend results.
    ===================================================== */

    let reply =
      "";


    if (
      completion &&
      completion.success ===
      true
    ) {

      reply =
        cleanString(
          completion.text,
          12000
        );

    }


    if (
      !reply
    ) {

      /*
       * Deterministic fallback response.
       */

      const successfulStages =
        workflowState
          .completedStages
          .join(
            ", "
          );


      const failedStages =
        workflowState
          .failedStages
          .join(
            ", "
          );


      reply =
        [

          `Workflow ${workflowState.status}.`,

          successfulStages
            ? `Completed: ${successfulStages}.`
            : "",

          failedStages
            ? `Failed: ${failedStages}.`
            : "",

          deploymentResult?.deployment?.url
            ? `Deployment URL: ${deploymentResult.deployment.url}`
            : "",

          deploymentResult?.data?.url
            ? `Deployment URL: ${deploymentResult.data.url}`
            : ""

        ]
          .filter(Boolean)
          .join(" ");

    }


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(

      `Master Agent Completed` +
      ` | Workflow=${workflow.type}` +
      ` | Status=${workflowState.status}` +
      ` | Duration=${Date.now() - startedAt}ms`

    );


    /* =====================================================
       FINAL RESPONSE
    ===================================================== */

    return {

      success:
        true,

      reply,

      workflow:
        workflowState,

      orchestration

    };

  }

  catch (
    error
  ) {

    const normalized =
      normalizeError(
        error
      );


    if (
      workflow
    ) {

      workflow.status =
        "failed";

      workflow.currentStage =
        currentStage;

    }


    logger.error(

      `Master Agent Failed at ${currentStage}: ` +
      `${normalized.message}`

    );


    return {

      success:
        false,

      message:
        "Master Agent Failed",

      error:
        normalized.message,

      stage:
        currentStage,

      workflow,

      orchestration: {

        intent,

        planning,

        buildResult,

        deploymentResult,

        monitoringResult,

        scalingResult,

        billingResult,

        subscriptionResult,

        fixResult,

        fileResult

      }

    };

  }

}


/* =========================================================
   MASTER AGENT METADATA
========================================================= */

masterAgent.agents =
  agentRegistry;


masterAgent.agentCount =
  Object.keys(
    agentRegistry
  ).length;


/* =========================================================
   WORKFLOW OWNERSHIP
========================================================= */

masterAgent.ownership = {

  master: [

    "routing",

    "workflow_orchestration",

    "execution_gates",

    "failure_propagation",

    "agent_sequencing"

  ],

  planning: [

    "implementation_blueprint",

    "module_decomposition",

    "dependency_planning",

    "implementation_phases"

  ],

  builder: [

    "project_file_generation"

  ],

  fix: [

    "bug_repair"

  ],

  file: [

    "file_operations"

  ],

  deploy: [

    "deployment_orchestration",

    "docker",

    "aws",

    "domain",

    "ssl",

    "deployment_url"

  ],

  billing: [

    "billing_operations",

    "payment_information"

  ],

  subscription: [

    "subscription_state",

    "entitlements",

    "plan_access"

  ],

  monitoring: [

    "runtime_monitoring",

    "health"

  ],

  scaling: [

    "capacity_changes",

    "scaling_operations"

  ],

  memory: [

    "context_memory"

  ]

};


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  masterAgent;
