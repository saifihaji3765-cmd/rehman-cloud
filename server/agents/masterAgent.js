/* =========================================================
   ZyrionOS MASTER AGENT
   Central AI Orchestrator
========================================================= */

/* =========================
   PACKAGES
========================= */

const OpenAI = require("openai");


/* =========================
   AGENTS
========================= */

const intentAgent =
  require("./intentAgent");

const plannerAgent =
  require("./planningAgent");

const builderAgent =
  require("./builderAgent");

const deployAgent =
  require("./deployAgent");

const monitoringAgent =
  require("./monitoringAgent");

const scalingAgent =
  require("./scalingAgent");

const billingAgent =
  require("./billingAgent");

const subscriptionAgent =
  require("./subscriptionAgent");

const memoryAgent =
  require("./memoryAgent");

const fixAgent =
  require("./fixAgent");

const fileAgent =
  require("./fileAgent");


/* =========================
   SERVICES
========================= */

const logger =
  require("../services/loggerService");


/* =========================
   OPENAI CLIENT
========================= */

const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY
  });


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
        error.message

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


/* =========================
   RESULT ERROR
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

       Supported:

       masterAgent("Build a website", user)

       OR

       masterAgent({
         type: "code",
         prompt: "Build a website",
         framework: "React",
         projectId: "...",
         user
       })
    ===================================================== */

    let userPrompt = "";

    let requestType = "";

    let framework = "";

    let projectId = "";


    if (
      typeof request === "string"
    ) {

      userPrompt =
        request;

    }

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

      user =
        request.user ||
        user ||
        {};

    }


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (
      typeof userPrompt !== "string" ||
      !userPrompt.trim()
    ) {

      return {

        success: false,

        message:
          "User prompt required",

        error:
          "Master Agent received an empty prompt.",

        stage:
          currentStage

      };

    }


    userPrompt =
      userPrompt.trim();


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
          currentStage

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

          user

        });


      if (
        isSuccessful(memoryContext)
      ) {

        logger.success(
          "Memory Agent Completed"
        );

      }

      else {

        logger.warning(
          `Memory Agent returned failure: ${getAgentError(memoryContext)}`
        );

      }

    }

    catch (error) {

      const normalized =
        normalizeError(error);

      logger.warning(
        `Memory Agent Failed: ${normalized.message}`
      );

      memoryContext = {

        success: false,

        error:
          normalized.message

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

          user,

          memoryContext

        });


      if (
        !isSuccessful(intent)
      ) {

        logger.warning(
          `Intent Agent returned failure: ${getAgentError(intent)}`
        );

      }

      else {

        logger.success(
          `Intent Agent Completed: ${intent.type || "unknown"}`
        );

      }

    }

    catch (error) {

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
          "chat"

      };

    }


    /* =====================================================
       REQUEST TYPE OVERRIDES

       Controller-level request types have priority
       where necessary.
    ===================================================== */

    if (
      requestType === "code"
    ) {

      intent = {

        ...(intent || {}),

        success: true,

        type:
          "build"

      };

    }


    if (
      requestType === "deploy"
    ) {

      intent = {

        ...(intent || {}),

        success: true,

        type:
          "deploy"

      };

    }


    if (
      requestType === "thumbnail"
    ) {

      /*
       * Thumbnail generation currently has no dedicated
       * thumbnail agent in this Master Agent dependency
       * list. We preserve the request as chat rather than
       * falsely claiming a thumbnail was generated.
       */

      intent = {

        ...(intent || {}),

        success: true,

        type:
          "chat"

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

          user,

          memoryContext

        });


      if (
        isSuccessful(planning)
      ) {

        logger.success(
          "Planning Agent Completed"
        );

      }

      else {

        logger.warning(
          `Planning Agent returned failure: ${getAgentError(planning)}`
        );

      }

    }

    catch (error) {

      const normalized =
        normalizeError(error);

      logger.error(
        `Planning Agent Failed: ${normalized.message}`
      );

      planning = {

        success: false,

        error:
          normalized.message

      };

    }


    /* =====================================================
       NORMALIZED PLANNING DATA

       Planner returns:

       {
         success: true,
         data: {...}
       }

       Agents downstream should receive the actual
       planning payload, not the wrapper.
    ===================================================== */

    const planningData =
      planning?.data ||
      planning ||
      null;


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
      intent?.type === "build"
    ) {

      currentStage =
        "builder-agent";


      try {

        /*
         * Builder receives the actual planner data.
         */

        buildResult =
          await builderAgent({

            prompt:
              userPrompt,

            plan:
              planningData,

            framework:
              framework ||
              planningData?.framework ||
              planningData?.frontend?.framework ||
              "React",

            user,

            memoryContext,

            intent

          });


        if (
          !isSuccessful(buildResult)
        ) {

          logger.error(
            `Builder Agent Failed: ${getAgentError(buildResult)}`
          );


          return {

            success: false,

            message:
              "Builder Agent Failed",

            error:
              getAgentError(buildResult),

            stage:
              currentStage,

            orchestration: {

              intent,

              planning,

              memoryContext,

              buildResult

            }

          };

        }


        logger.success(
          "Builder Agent Completed"
        );


        /* =================================================
           GENERATED FILE VALIDATION
        ================================================= */

        const generatedFiles =
          buildResult?.data?.files;


        if (
          !Array.isArray(
            generatedFiles
          ) ||
          generatedFiles.length === 0
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

              buildResult

            }

          };

        }


        logger.success(
          `Builder generated ${generatedFiles.length} project files`
        );

      }

      catch (error) {

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
              null

          }

        };

      }

    }


    /* =====================================================
       DEPLOY FLOW
    ===================================================== */

    if (
      intent?.type === "deploy"
    ) {

      currentStage =
        "deploy-agent";


      try {

        deploymentResult =
          await deployAgent({

            userId:
              user?.id ||
              user?._id,

            projectId,

            projectName:
              planningData?.projectName,

            framework:
              framework ||
              planningData?.framework ||
              planningData?.frontend?.framework,

            prompt:
              userPrompt,

            plan:
              planningData?.plan ||
              planningData,

            user,

            planning:
              planningData,

            /*
             * If deployment follows a build operation,
             * pass generated files through.
             */

            files:
              buildResult?.data?.files ||
              []

          });


        if (
          isSuccessful(deploymentResult)
        ) {

          logger.success(
            "Deploy Agent Completed"
          );

        }

        else {

          logger.error(
            `Deploy Agent returned failure: ${getAgentError(deploymentResult)}`
          );

        }

      }

      catch (error) {

        const normalized =
          normalizeError(error);

        logger.error(
          `Deploy Agent Failed: ${normalized.message}`
        );

        deploymentResult = {

          success: false,

          error:
            normalized.message

        };

      }

    }


    /* =====================================================
       MONITORING FLOW
    ===================================================== */

    if (
      intent?.type === "monitor"
    ) {

      currentStage =
        "monitoring-agent";


      try {

        const deploymentId =
          planningData?.deploymentId ||
          deploymentResult?.deploymentId ||
          deploymentResult?.data?.deploymentId ||
          projectId;


        monitoringResult =
          await monitoringAgent({

            deploymentId,

            appName:
              planningData?.projectName,

            projectId,

            user,

            planning:
              planningData

          });


        if (
          isSuccessful(monitoringResult)
        ) {

          logger.success(
            "Monitoring Agent Completed"
          );

        }

        else {

          logger.warning(
            `Monitoring Agent returned failure: ${getAgentError(monitoringResult)}`
          );

        }

      }

      catch (error) {

        const normalized =
          normalizeError(error);

        logger.error(
          `Monitoring Agent Failed: ${normalized.message}`
        );

        monitoringResult = {

          success: false,

          error:
            normalized.message

        };

      }

    }


    /* =====================================================
       SCALING FLOW
    ===================================================== */

    if (
      intent?.type === "scale"
    ) {

      currentStage =
        "scaling-agent";


      try {

        const deploymentId =
          planningData?.deploymentId ||
          deploymentResult?.deploymentId ||
          deploymentResult?.data?.deploymentId ||
          projectId;


        scalingResult =
          await scalingAgent({

            deploymentId,

            projectId,

            user,

            planning:
              planningData

          });


        if (
          isSuccessful(scalingResult)
        ) {

          logger.success(
            "Scaling Agent Completed"
          );

        }

        else {

          logger.warning(
            `Scaling Agent returned failure: ${getAgentError(scalingResult)}`
          );

        }

      }

      catch (error) {

        const normalized =
          normalizeError(error);

        logger.error(
          `Scaling Agent Failed: ${normalized.message}`
        );

        scalingResult = {

          success: false,

          error:
            normalized.message

        };

      }

    }


    /* =====================================================
       BILLING FLOW
    ===================================================== */

    if (
      intent?.type === "billing"
    ) {

      currentStage =
        "billing-agent";


      try {

        billingResult =
          await billingAgent({

            userId:
              user?.id ||
              user?._id,

            plan:
              planningData?.plan ||
              planningData?.subscriptionPlan,

            user,

            planning:
              planningData

          });


        if (
          isSuccessful(billingResult)
        ) {

          logger.success(
            "Billing Agent Completed"
          );

        }

        else {

          logger.warning(
            `Billing Agent returned failure: ${getAgentError(billingResult)}`
          );

        }

      }

      catch (error) {

        const normalized =
          normalizeError(error);

        logger.error(
          `Billing Agent Failed: ${normalized.message}`
        );

        billingResult = {

          success: false,

          error:
            normalized.message

        };

      }

    }


    /* =====================================================
       SUBSCRIPTION FLOW
    ===================================================== */

    if (
      intent?.type === "subscription"
    ) {

      currentStage =
        "subscription-agent";


      try {

        subscriptionResult =
          await subscriptionAgent({

            userId:
              user?.id ||
              user?._id,

            plan:
              planningData?.plan ||
              planningData?.subscriptionPlan,

            user,

            planning:
              planningData

          });


        if (
          isSuccessful(subscriptionResult)
        ) {

          logger.success(
            "Subscription Agent Completed"
          );

        }

        else {

          logger.warning(
            `Subscription Agent returned failure: ${getAgentError(subscriptionResult)}`
          );

        }

      }

      catch (error) {

        const normalized =
          normalizeError(error);

        logger.error(
          `Subscription Agent Failed: ${normalized.message}`
        );

        subscriptionResult = {

          success: false,

          error:
            normalized.message

        };

      }

    }


    /* =====================================================
       FIX FLOW
    ===================================================== */

    if (
      intent?.type === "fix"
    ) {

      currentStage =
        "fix-agent";


      try {

        fixResult =
          await fixAgent({

            prompt:
              userPrompt,

            user,

            intent,

            planning:
              planningData,

            memoryContext,

            projectId,

            /*
             * Provide files whenever they already exist
             * in the current orchestration.
             */

            files:
              buildResult?.data?.files ||
              []

          });


        if (
          isSuccessful(fixResult)
        ) {

          logger.success(
            "Fix Agent Completed"
          );

        }

        else {

          logger.warning(
            `Fix Agent returned failure: ${getAgentError(fixResult)}`
          );

        }

      }

      catch (error) {

        const normalized =
          normalizeError(error);

        logger.error(
          `Fix Agent Failed: ${normalized.message}`
        );

        fixResult = {

          success: false,

          error:
            normalized.message

        };

      }

    }


    /* =====================================================
       FILE FLOW
    ===================================================== */

    if (
      intent?.type === "file"
    ) {

      currentStage =
        "file-agent";


      try {

        fileResult =
          await fileAgent({

            prompt:
              userPrompt,

            user,

            intent,

            planning:
              planningData,

            memoryContext,

            projectId,

            files:
              buildResult?.data?.files ||
              []

          });


        if (
          isSuccessful(fileResult)
        ) {

          logger.success(
            "File Agent Completed"
          );

        }

        else {

          logger.warning(
            `File Agent returned failure: ${getAgentError(fileResult)}`
          );

        }

      }

      catch (error) {

        const normalized =
          normalizeError(error);

        logger.error(
          `File Agent Failed: ${normalized.message}`
        );

        fileResult = {

          success: false,

          error:
            normalized.message

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

      fileResult

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

Your job is to explain what the connected
agents actually did.

STRICT RULES:

1. Never invent project files.
2. Never invent deployment URLs.
3. Never invent AWS, Docker, database,
   billing, subscription, monitoring,
   or infrastructure results.
4. Never say an operation succeeded unless
   the corresponding backend agent returned
   success: true.
5. If an agent failed, clearly say that it failed.
6. If an agent returned no result, say that
   the result is unavailable.
7. Do not expose internal secrets,
   API keys, tokens, passwords, or cookies.
8. Keep the response useful and concise.
9. For generated projects, mention the actual
   number of generated files when available.
10. Do not claim that deployment is live unless
    deploymentResult explicitly confirms success.
11. Do not claim that files were saved unless
    fileResult explicitly confirms success.
12. Do not claim that code was fixed unless
    fixResult explicitly confirms success.

You are a truthful orchestration assistant.

`

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

`

            }

          ],

          temperature:
            0.5,

          max_tokens:
            1500

        });


    /* =====================================================
       FINAL RESPONSE VALIDATION
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

        orchestration

      };

    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    return {

      success: true,

      reply,

      orchestration

    };

  }

  catch (error) {

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
        normalized

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  masterAgent;
