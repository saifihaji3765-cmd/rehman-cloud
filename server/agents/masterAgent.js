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
        "Unknown error"
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
   MASTER AGENT
========================= */

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


    /* =========================
       REQUEST NORMALIZATION

       Supports:

       masterAgent("prompt", user)

       OR

       masterAgent({
         type,
         prompt,
         framework,
         projectId,
         user
       })
    ========================= */

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
        request.user || user;

    }


    /* =========================
       VALIDATION
    ========================= */

    if (
      !userPrompt ||
      typeof userPrompt !== "string"
    ) {

      return {

        success: false,

        message:
          "User prompt required",

        error:
          "Master Agent received an empty prompt."

      };

    }


    userPrompt =
      userPrompt.trim();


    if (!userPrompt) {

      return {

        success: false,

        message:
          "User prompt required",

        error:
          "Prompt cannot be empty."

      };

    }


    /* =========================
       OPENAI CONFIG CHECK
    ========================= */

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return {

        success: false,

        message:
          "Master Agent configuration error",

        error:
          "OPENAI_API_KEY is not configured on the backend."

      };

    }


    /* =========================
       MEMORY
    ========================= */

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

      logger.success(
        "Memory Agent Completed"
      );

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


    /* =========================
       INTENT
    ========================= */

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

      logger.success(
        "Intent Detected"
      );

    }

    catch (error) {

      const normalized =
        normalizeError(error);

      logger.warning(
        `Intent Agent Failed: ${normalized.message}`
      );

      intent = null;

    }


    /* =========================
       CODE REQUEST OVERRIDE
    ========================= */

    if (
      requestType === "code"
    ) {

      if (
        !intent ||
        intent.type !== "build"
      ) {

        intent = {

          ...(intent || {}),

          type:
            "build"

        };

      }

    }


    /* =========================
       PLANNING
    ========================= */

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

      logger.success(
        "Planning Completed"
      );

    }

    catch (error) {

      const normalized =
        normalizeError(error);

      logger.warning(
        `Planner Agent Failed: ${normalized.message}`
      );

      planning = {

        success: false,

        error:
          normalized.message

      };

    }


    /* =========================
       RESULTS
    ========================= */

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


    /* =========================
       BUILD FLOW
    ========================= */

    if (
      intent?.type === "build"
    ) {

      currentStage =
        "builder-agent";

      try {

        buildResult =
          await builderAgent({

            prompt:
              userPrompt,

            plan:
              planning,

            framework:
              framework ||
              planning?.framework ||
              "React",

            user,

            memoryContext,

            intent

          });


        logger.success(
          "Builder Agent Completed"
        );


        /* =========================
           BUILDER SUCCESS VALIDATION
        ========================= */

        if (
          !buildResult ||
          buildResult.success !== true
        ) {

          return {

            success: false,

            message:
              "Builder Agent Failed",

            error:
              buildResult?.error ||
              buildResult?.message ||
              "Builder Agent returned an unsuccessful result.",

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
              "AI Builder completed but did not return any files.",

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


    /* =========================
       DEPLOY FLOW
    ========================= */

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
              planning?.projectName,

            framework:
              planning?.framework,

            prompt:
              userPrompt,

            plan:
              planning?.plan,

            user,

            planning

          });

        logger.success(
          "Deploy Agent Completed"
        );

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


    /* =========================
       MONITOR FLOW
    ========================= */

    if (
      intent?.type === "monitor"
    ) {

      currentStage =
        "monitoring-agent";

      try {

        monitoringResult =
          await monitoringAgent({

            deploymentId:
              planning?.deploymentId,

            appName:
              planning?.projectName,

            user,

            planning

          });

        logger.success(
          "Monitoring Agent Completed"
        );

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


    /* =========================
       SCALING FLOW
    ========================= */

    if (
      intent?.type === "scale"
    ) {

      currentStage =
        "scaling-agent";

      try {

        scalingResult =
          await scalingAgent({

            deploymentId:
              planning?.deploymentId,

            user,

            planning

          });

        logger.success(
          "Scaling Agent Completed"
        );

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


    /* =========================
       BILLING FLOW
    ========================= */

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
              planning?.plan,

            user,

            planning

          });

        logger.success(
          "Billing Agent Completed"
        );

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


    /* =========================
       SUBSCRIPTION FLOW
    ========================= */

    if (
      intent?.type ===
      "subscription"
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
              planning?.plan,

            user,

            planning

          });

        logger.success(
          "Subscription Agent Completed"
        );

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


    /* =========================
       FIX FLOW
    ========================= */

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

            planning,

            memoryContext

          });

        logger.success(
          "Fix Agent Completed"
        );

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


    /* =========================
       FILE FLOW
    ========================= */

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

            planning,

            memoryContext

          });

        logger.success(
          "File Agent Completed"
        );

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


    /* =========================
       ORCHESTRATION
    ========================= */

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


    /* =========================
       FINAL AI RESPONSE
    ========================= */

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

You are ZyrionOS Autonomous Master AI.

You coordinate the connected
ZyrionOS AI agents.

Your goals:

- understand the user's request
- summarize actual agent results
- never invent project files
- never invent deployment URLs
- never invent infrastructure data
- never claim an operation succeeded
  unless the backend returned success
- provide clear professional responses

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
            0.7,

          max_tokens:
            1500

        });


    /* =========================
       FINAL RESPONSE VALIDATION
    ========================= */

    const reply =

      completion
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim() || "";


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


    /* =========================
       SUCCESS
    ========================= */

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


/* =========================
   EXPORT
========================= */

module.exports =
  masterAgent;
