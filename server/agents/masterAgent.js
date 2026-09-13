/* =========================================================
   ZyrionOS MASTER AGENT
   Central AI Orchestrator
   =========================================================

   Architecture:

   Master
      |
      +-- Memory
      +-- Intent
      +-- Planning
      +-- Builder
      +-- Fix
      +-- File
      +-- Deploy
             |
             +-- Billing
             +-- Subscription
             +-- Docker
             +-- AWS
             +-- Domain
             +-- SSL
             +-- Monitoring
             +-- Scaling

   Total:
   1 Master Agent
   15 Specialized Agents

   IMPORTANT:
   Master does NOT require itself.
   ================================================= */


/* =========================
   PACKAGES
========================= */

const OpenAI =
  require("openai");


/* =========================================================
   SPECIALIZED AGENTS
========================================================= */


/* =========================
   LEVEL 1
========================= */

const intentAgent =
  require("./intentAgent");

const plannerAgent =
  require("./planningAgent");

const builderAgent =
  require("./builderAgent");

const fixAgent =
  require("./fixAgent");

const fileAgent =
  require("./fileAgent");

const memoryAgent =
  require("./memoryAgent");


/* =========================
   LEVEL 2
========================= */

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


/* =========================
   LEVEL 3
========================= */

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


/* =========================================================
   OPENAI CLIENT
========================================================= */

const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });


/* =========================================================
   AGENT REGISTRY
   =========================================================

   All 15 specialized agents are registered here.

   They are NOT independently executed by Master when
   another orchestrator already owns that responsibility.

   Example:

   Deploy Agent owns:

      Docker
      AWS
      Domain
      SSL
      Monitoring
      Scaling
      Billing
      Subscription

   This prevents duplicate deployment operations.
========================================================= */

const agentRegistry = {
  intent: intentAgent,

  planning: plannerAgent,

  builder: builderAgent,

  fix: fixAgent,

  file: fileAgent,

  memory: memoryAgent,

  docker: dockerAgent,

  aws: awsAgent,

  domain: domainAgent,

  ssl: sslAgent,

  monitoring: monitoringAgent,

  scaling: scalingAgent,

  billing: billingAgent,

  subscription: subscriptionAgent,

  deploy: deployAgent,


  /* =======================================================
     FINANCIAL CONTROL AGENTS
     =======================================================

     Registered only.

     They are NOT executed by Master yet.

     Financial orchestration will be integrated after
     the financial provider/service/route/middleware/
     worker validation phase.
  ======================================================= */

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
};


/* =========================================================
   HELPERS
========================================================= */


/* =========================
   SAFE JSON
========================= */

function safeJson(value) {
  try {
    return JSON.stringify(
      value ?? null
    );
  } catch (error) {
    return JSON.stringify({
      error:
        "Unable to serialize result",

      message:
        error?.message ||
        "Serialization failed",
    });
  }
}


/* =========================
   ERROR NORMALIZER
========================= */

function normalizeError(error) {
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
  };
}


/* =========================
   AGENT ERROR
========================= */

function getAgentError(result) {
  if (!result) {
    return "Agent returned no result.";
  }

  return (
    result.error ||
    result.message ||
    "Agent returned an unsuccessful result."
  );
}


/* =========================
   SUCCESS CHECK
========================= */

function isSuccessful(result) {
  return Boolean(
    result &&
    result.success === true
  );
}


/* =========================
   USER ID
========================= */

function getUserId(user = {}) {
  return (
    user?.id ||
    user?._id ||
    user?.userId ||
    null
  );
}


/* =========================
   PLANNING DATA
========================= */

function getPlanningData(
  planning
) {
  return (
    planning?.data ||
    planning ||
    null
  );
}


/* =========================
   DEPLOYMENT ID
========================= */

function getDeploymentId(
  planningData,
  deploymentResult,
  projectId
) {
  return (
    planningData?.deploymentId ||
    deploymentResult?.deployment?.deploymentId ||
    deploymentResult?.deploymentId ||
    deploymentResult?.data?.deploymentId ||
    projectId ||
    null
  );
}


/* =========================================================
   MASTER AGENT
========================================================= */

async function masterAgent(
  request,
  user = {}
) {
  let currentStage =
    "request-normalization";

  try {
    logger.info(
      "⚡ ZyrionOS Master Agent Started"
    );


    /* =====================================================
       REQUEST NORMALIZATION
    ===================================================== */

    let userPrompt = "";

    let requestType = "";

    let framework = "";

    let projectId = "";

    let normalizedUser = user || {};


    /* =========================
       STRING REQUEST
    ========================= */

    if (
      typeof request === "string"
    ) {
      userPrompt =
        request;
    }


    /* =========================
       OBJECT REQUEST
    ========================= */

    else if (
      request &&
      typeof request === "object"
    ) {
      userPrompt =
        request.prompt || "";

      requestType =
        request.type || "";

      framework =
        request.framework || "";

      projectId =
        request.projectId || "";

      normalizedUser =
        request.user ||
        user ||
        {};
    }


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (
      typeof userPrompt !==
        "string" ||
      !userPrompt.trim()
    ) {
      return {
        success: false,

        message:
          "User prompt required",

        error:
          "Master Agent received an empty prompt.",

        stage:
          currentStage,
      };
    }


    userPrompt =
      userPrompt.trim();


    /* =====================================================
       AUTHENTICATED USER
    ===================================================== */

    const userId =
      getUserId(
        normalizedUser
      );


    /* =====================================================
       OPENAI CONFIGURATION
    ===================================================== */

    if (
      !process.env.OPENAI_API_KEY
    ) {
      return {
        success: false,

        message:
          "Master Agent configuration error",

        error:
          "OPENAI_API_KEY is not configured on the backend.",

        stage:
          currentStage,
      };
    }


    /* =====================================================
       MEMORY AGENT
    ===================================================== */

    currentStage =
      "memory-agent";

    let memoryContext =
      null;

    try {
      memoryContext =
        await memoryAgent({
          prompt:
            userPrompt,

          user:
            normalizedUser,

          userId,

          projectId,
        });

      if (
        isSuccessful(
          memoryContext
        )
      ) {
        logger.success(
          "Memory Agent Completed"
        );
      } else {
        logger.warning(
          `Memory Agent returned failure: ${getAgentError(memoryContext)}`
        );
      }
    } catch (error) {
      const normalized =
        normalizeError(error);

      logger.warning(
        `Memory Agent Failed: ${normalized.message}`
      );

      memoryContext = {
        success: false,

        error:
          normalized.message,
      };
    }


    /* =====================================================
       INTENT AGENT
    ===================================================== */

    currentStage =
      "intent-agent";

    let intent =
      null;

    try {
      intent =
        await intentAgent({
          prompt:
            userPrompt,

          user:
            normalizedUser,

          userId,

          memoryContext,

          projectId,
        });

      if (
        isSuccessful(intent)
      ) {
        logger.success(
          `Intent Agent Completed: ${intent.type || "unknown"}`
        );
      } else {
        logger.warning(
          `Intent Agent returned failure: ${getAgentError(intent)}`
        );
      }
    } catch (error) {
      const normalized =
        normalizeError(error);

      logger.error(
        `Intent Agent Failed: ${normalized.message}`
      );

      intent = {
        success: false,

        error:
          normalized.message,

        type:
          "chat",
      };
    }


    /* =====================================================
       REQUEST TYPE OVERRIDES
    ===================================================== */

    if (
      requestType === "code"
    ) {
      intent = {
        ...(intent || {}),

        success:
          true,

        type:
          "build",
      };
    }


    if (
      requestType === "deploy"
    ) {
      intent = {
        ...(intent || {}),

        success:
          true,

        type:
          "deploy",
      };
    }


    /*
     * No fake thumbnail generation.
     *
     * There is no dedicated thumbnailAgent.js
     * in the current 16-file architecture.
     */

    if (
      requestType === "thumbnail"
    ) {
      intent = {
        ...(intent || {}),

        success:
          true,

        type:
          "chat",

        unsupportedCapability:
          "thumbnail-agent-not-installed",
      };
    }


    /* =====================================================
       PLANNING AGENT
    ===================================================== */

    currentStage =
      "planning-agent";

    let planning =
      null;

    try {
      planning =
        await plannerAgent({
          prompt:
            userPrompt,

          intent,

          user:
            normalizedUser,

          userId,

          memoryContext,

          projectId,
        });

      if (
        isSuccessful(planning)
      ) {
        logger.success(
          "Planning Agent Completed"
        );
      } else {
        logger.warning(
          `Planning Agent returned failure: ${getAgentError(planning)}`
        );
      }
    } catch (error) {
      const normalized =
        normalizeError(error);

      logger.error(
        `Planning Agent Failed: ${normalized.message}`
      );

      planning = {
        success: false,

        error:
          normalized.message,
      };
    }


    /* =====================================================
       NORMALIZED PLANNING DATA
    ===================================================== */

    const planningData =
      getPlanningData(
        planning
      );


    /* =====================================================
       RESULT CONTAINERS
    ===================================================== */

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


    /* =====================================================
       BUILD FLOW
    ===================================================== */

    if (
      intent?.type ===
      "build"
    ) {
      currentStage =
        "builder-agent";

      try {
        buildResult =
          await builderAgent({
            prompt:
              userPrompt,

            plan:
              planningData,

            framework:
              framework ||
              planningData?.framework ||
              planningData?.frontend
                ?.framework ||
              "React",

            user:
              normalizedUser,

            userId,

            memoryContext,

            intent,

            projectId,
          });

        if (
          !isSuccessful(
            buildResult
          )
        ) {
          logger.error(
            `Builder Agent Failed: ${getAgentError(buildResult)}`
          );

          return {
            success: false,

            message:
              "Builder Agent Failed",

            error:
              getAgentError(
                buildResult
              ),

            stage:
              currentStage,

            orchestration: {
              intent,

              planning,

              memoryContext,

              buildResult,
            },
          };
        }


        /* =========================
           FILE VALIDATION
        ========================= */

        const generatedFiles =
          buildResult
            ?.data
            ?.files;


        if (
          !Array.isArray(
            generatedFiles
          ) ||
          generatedFiles.length ===
            0
        ) {
          return {
            success: false,

            message:
              "Builder Agent returned no project files",

            error:
              "Builder completed but returned an empty files array.",

            stage:
              currentStage,

            orchestration: {
              intent,

              planning,

              memoryContext,

              buildResult,
            },
          };
        }


        logger.success(
          `Builder generated ${generatedFiles.length} project files`
        );
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `Builder Agent Failed: ${normalized.message}`
        );

        return {
          success: false,

          message:
            "Builder Agent Failed",

          error:
            normalized.message,

          stage:
            currentStage,

          details:
            normalized,

          orchestration: {
            intent,

            planning,

            memoryContext,

            buildResult:
              null,
          },
        };
      }
    }


    /* =====================================================
       DEPLOY FLOW
    ===================================================== */

    if (
      intent?.type ===
      "deploy"
    ) {
      currentStage =
        "deploy-agent";

      try {
        deploymentResult =
          await deployAgent({
            userId,

            projectId,

            projectName:
              planningData
                ?.projectName ||
              projectDataProjectName(
                request
              ),

            framework:
              framework ||
              planningData
                ?.framework ||
              planningData
                ?.frontend
                ?.framework,

            prompt:
              userPrompt,

            plan:
              planningData
                ?.plan ||
              planningData,

            user:
              normalizedUser,

            planning:
              planningData,

            billingCycle:
              request &&
              typeof request ===
                "object"
                ? request.billingCycle
                : undefined,

            paymentProvider:
              request &&
              typeof request ===
                "object"
                ? request.paymentProvider
                : undefined,

            paymentConfirmed:
              request &&
              typeof request ===
                "object"
                ? request.paymentConfirmed ===
                  true
                : false,

            providerCustomerId:
              request &&
              typeof request ===
                "object"
                ? request.providerCustomerId
                : undefined,

            providerSubscriptionId:
              request &&
              typeof request ===
                "object"
                ? request.providerSubscriptionId
                : undefined,

            paymentId:
              request &&
              typeof request ===
                "object"
                ? request.paymentId
                : undefined,

            files:
              buildResult
                ?.data
                ?.files ||
              request?.files ||
              [],
          });


        if (
          isSuccessful(
            deploymentResult
          )
        ) {
          logger.success(
            "Deploy Agent Completed"
          );
        } else {
          logger.error(
            `Deploy Agent returned failure: ${getAgentError(deploymentResult)}`
          );
        }
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `Deploy Agent Failed: ${normalized.message}`
        );

        deploymentResult = {
          success: false,

          error:
            normalized.message,
        };
      }
    }


    /* =====================================================
       MONITORING FLOW
    ===================================================== */

    if (
      intent?.type ===
      "monitor"
    ) {
      currentStage =
        "monitoring-agent";

      try {
        const deploymentId =
          getDeploymentId(
            planningData,

            deploymentResult,

            projectId
          );


        if (!deploymentId) {
          monitoringResult = {
            success: false,

            message:
              "Deployment ID required for monitoring",
          };
        } else {
          monitoringResult =
            await monitoringAgent({
              deploymentId,

              appName:
                planningData
                  ?.projectName,

              projectName:
                planningData
                  ?.projectName,

              projectId,

              user:
                normalizedUser,

              userId,

              planning:
                planningData,
            });
        }


        if (
          isSuccessful(
            monitoringResult
          )
        ) {
          logger.success(
            "Monitoring Agent Completed"
          );
        } else {
          logger.warning(
            `Monitoring Agent returned failure: ${getAgentError(monitoringResult)}`
          );
        }
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `Monitoring Agent Failed: ${normalized.message}`
        );

        monitoringResult = {
          success: false,

          error:
            normalized.message,
        };
      }
    }


    /* =====================================================
       SCALING FLOW
    ===================================================== */

    if (
      intent?.type ===
      "scale"
    ) {
      currentStage =
        "scaling-agent";

      try {
        const deploymentId =
          getDeploymentId(
            planningData,

            deploymentResult,

            projectId
          );


        if (!deploymentId) {
          scalingResult = {
            success: false,

            message:
              "Deployment ID required for scaling",
          };
        } else {
          scalingResult =
            await scalingAgent({
              deploymentId,

              projectId,

              projectName:
                planningData
                  ?.projectName,

              appName:
                planningData
                  ?.projectName,

              user:
                normalizedUser,

              userId,

              planning:
                planningData,
            });
        }


        if (
          isSuccessful(
            scalingResult
          )
        ) {
          logger.success(
            "Scaling Agent Completed"
          );
        } else {
          logger.warning(
            `Scaling Agent returned failure: ${getAgentError(scalingResult)}`
          );
        }
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `Scaling Agent Failed: ${normalized.message}`
        );

        scalingResult = {
          success: false,

          error:
            normalized.message,
        };
      }
    }


    /* =====================================================
       BILLING FLOW
    ===================================================== */

    if (
      intent?.type ===
      "billing"
    ) {
      currentStage =
        "billing-agent";

      try {
        billingResult =
          await billingAgent({
            userId,

            plan:
              planningData
                ?.plan ||
              planningData
                ?.subscriptionPlan ||
              "Starter",

            billingCycle:
              request &&
              typeof request ===
                "object"
                ? request.billingCycle
                : undefined,

            paymentProvider:
              request &&
              typeof request ===
                "object"
                ? request.paymentProvider
                : undefined,

            user:
              normalizedUser,

            planning:
              planningData,
          });


        if (
          isSuccessful(
            billingResult
          )
        ) {
          logger.success(
            "Billing Agent Completed"
          );
        } else {
          logger.warning(
            `Billing Agent returned failure: ${getAgentError(billingResult)}`
          );
        }
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `Billing Agent Failed: ${normalized.message}`
        );

        billingResult = {
          success: false,

          error:
            normalized.message,
        };
      }
    }


    /* =====================================================
       SUBSCRIPTION FLOW
    ===================================================== */

    if (
      intent?.type ===
      "subscription"
    ) {
      currentStage =
        "subscription-agent";

      try {
        subscriptionResult =
          await subscriptionAgent({
            userId,

            plan:
              planningData
                ?.plan ||
              planningData
                ?.subscriptionPlan ||
              "Starter",

            billingCycle:
              request &&
              typeof request ===
                "object"
                ? request.billingCycle
                : undefined,

            paymentProvider:
              request &&
              typeof request ===
                "object"
                ? request.paymentProvider
                : undefined,

            paymentConfirmed:
              request &&
              typeof request ===
                "object"
                ? request.paymentConfirmed ===
                  true
                : false,

            providerCustomerId:
              request &&
              typeof request ===
                "object"
                ? request.providerCustomerId
                : undefined,

            providerSubscriptionId:
              request &&
              typeof request ===
                "object"
                ? request.providerSubscriptionId
                : undefined,

            paymentId:
              request &&
              typeof request ===
                "object"
                ? request.paymentId
                : undefined,

            user:
              normalizedUser,

            planning:
              planningData,
          });


        if (
          isSuccessful(
            subscriptionResult
          )
        ) {
          logger.success(
            "Subscription Agent Completed"
          );
        } else {
          logger.warning(
            `Subscription Agent returned failure: ${getAgentError(subscriptionResult)}`
          );
        }
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `Subscription Agent Failed: ${normalized.message}`
        );

        subscriptionResult = {
          success: false,

          error:
            normalized.message,
        };
      }
    }


    /* =====================================================
       FIX FLOW
    ===================================================== */

    if (
      intent?.type ===
      "fix"
    ) {
      currentStage =
        "fix-agent";

      try {
        fixResult =
          await fixAgent({
            prompt:
              userPrompt,

            user:
              normalizedUser,

            userId,

            intent,

            planning:
              planningData,

            memoryContext,

            projectId,

            files:
              buildResult
                ?.data
                ?.files ||
              request?.files ||
              [],
          });


        if (
          isSuccessful(
            fixResult
          )
        ) {
          logger.success(
            "Fix Agent Completed"
          );
        } else {
          logger.warning(
            `Fix Agent returned failure: ${getAgentError(fixResult)}`
          );
        }
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `Fix Agent Failed: ${normalized.message}`
        );

        fixResult = {
          success: false,

          error:
            normalized.message,
        };
      }
    }


    /* =====================================================
       FILE FLOW
    ===================================================== */

    if (
      intent?.type ===
      "file"
    ) {
      currentStage =
        "file-agent";

      try {
        fileResult =
          await fileAgent({
            prompt:
              userPrompt,

            user:
              normalizedUser,

            userId,

            intent,

            planning:
              planningData,

            memoryContext,

            projectId,

            files:
              buildResult
                ?.data
                ?.files ||
              request?.files ||
              [],
          });


        if (
          isSuccessful(
            fileResult
          )
        ) {
          logger.success(
            "File Agent Completed"
          );
        } else {
          logger.warning(
            `File Agent returned failure: ${getAgentError(fileResult)}`
          );
        }
      } catch (error) {
        const normalized =
          normalizeError(error);

        logger.error(
          `File Agent Failed: ${normalized.message}`
        );

        fileResult = {
          success: false,

          error:
            normalized.message,
        };
      }
    }


    /* =====================================================
       ORCHESTRATION RESULT
    ===================================================== */

    const orchestration = {
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

      /*
       * These agents are owned by Deploy Agent
       * during a deployment workflow.
       *
       * We expose their availability without
       * executing them a second time.
       */

      infrastructureAgents: {
        docker:
          Boolean(
            agentRegistry.docker
          ),

        aws:
          Boolean(
            agentRegistry.aws
          ),

        domain:
          Boolean(
            agentRegistry.domain
          ),

        ssl:
          Boolean(
            agentRegistry.ssl
          ),
      },
    };


    /* =====================================================
       FINAL MASTER AI RESPONSE
    ===================================================== */

    currentStage =
      "master-ai-response";


    const completion =
      await openai
        .chat
        .completions
        .create({
          model:
            "gpt-4.1-mini",

          messages: [
            {
              role:
                "system",

              content: `
You are the ZyrionOS Autonomous Master AI.

You are the final communication layer of
a multi-agent AI operating system.

Your job is to explain only what the connected
backend agents actually did.

STRICT RULES:

1. Never invent project files.

2. Never invent deployment URLs.

3. Never invent AWS infrastructure.

4. Never invent Docker results.

5. Never invent billing results.

6. Never invent subscription status.

7. Never invent monitoring metrics.

8. Never invent scaling actions.

9. Never claim an operation succeeded unless
   its backend result has success: true.

10. Never claim a deployment is live unless
    the deployment result actually provides
    a real ready URL.

11. Never claim health is healthy unless the
    monitoring/deployment result explicitly
    supports it.

12. Never claim payment succeeded unless an
    authoritative payment result says so.

13. Never expose API keys, access tokens,
    JWTs, passwords, cookies or secrets.

14. If an operation is pending, say pending.

15. If an operation failed, say failed.

16. If information is unavailable, say that
    it is unavailable.

17. Do not convert null, missing or unavailable
    metrics into zero.

18. Do not claim that an infrastructure agent
    independently ran when it was orchestrated
    by another agent.

19. Keep the final response clear and useful.

20. The backend is the source of truth.
`,
            },

            {
              role:
                "user",

              content: `
USER PROMPT:
${userPrompt}

REQUEST TYPE:
${requestType || "general"}

FRAMEWORK:
${framework || "not specified"}

PROJECT ID:
${projectId || "not specified"}

USER ID:
${userId || "not available"}

INTENT:
${safeJson(intent)}

PLANNING:
${safeJson(planning)}

MEMORY:
${safeJson(memoryContext)}

BUILD RESULT:
${safeJson(buildResult)}

DEPLOYMENT RESULT:
${safeJson(deploymentResult)}

MONITORING RESULT:
${safeJson(monitoringResult)}

SCALING RESULT:
${safeJson(scalingResult)}

BILLING RESULT:
${safeJson(billingResult)}

SUBSCRIPTION RESULT:
${safeJson(subscriptionResult)}

FIX RESULT:
${safeJson(fixResult)}

FILE RESULT:
${safeJson(fileResult)}

INFRASTRUCTURE AGENTS:
${safeJson(
  orchestration.infrastructureAgents
)}
`,
            },
          ],

          temperature:
            0.4,

          max_tokens:
            1500,
        });


    /* =====================================================
       FINAL RESPONSE
    ===================================================== */

    const reply =
      completion
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim() ||
      "";


    if (!reply) {
      return {
        success: false,

        message:
          "Master AI returned an empty response",

        error:
          "OpenAI completed the request but returned no message.",

        stage:
          currentStage,

        orchestration,
      };
    }


    /* =====================================================
       FINAL SUCCESS
    ===================================================== */

    return {
      success: true,

      reply,

      orchestration,
    };
  } catch (error) {
    const normalized =
      normalizeError(error);

    logger.error(
      `Master Agent Failed at ${currentStage}: ${normalized.message}`
    );

    return {
      success: false,

      message:
        "Master Agent Failed",

      error:
        normalized.message,

      stage:
        currentStage,

      details:
        normalized,
    };
  }
}


/* =========================================================
   PROJECT NAME HELPER
========================================================= */

function projectDataProjectName(
  request
) {
  if (
    request &&
    typeof request === "object"
  ) {
    return (
      request.projectName ||
      request.name ||
      null
    );
  }

  return null;
}


/* =========================================================
   MASTER METADATA
========================================================= */

masterAgent.agents =
  agentRegistry;

masterAgent.agentCount =
  Object.keys(
    agentRegistry
  ).length;


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  masterAgent;
