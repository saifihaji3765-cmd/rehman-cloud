/* =========================
   PACKAGES
========================= */

const OpenAI =
  require("openai");


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
   MASTER AGENT
========================= */

async function masterAgent(
  request,
  user = {}
){

  try{

    logger.info(
      "⚡ ZyrionOS Master Agent Started"
    );


    /* =========================
       REQUEST NORMALIZATION

       Supports both:

       masterAgent("prompt", user)

       and:

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

    if(
      typeof request === "string"
    ){

      userPrompt =
        request;

    }

    else if(
      request &&
      typeof request === "object"
    ){

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

    if(

      !userPrompt ||

      typeof userPrompt !== "string"

    ){

      return {

        success:false,

        message:
          "User prompt required"

      };

    }


    userPrompt =
      userPrompt.trim();


    /* =========================
       MEMORY
    ========================= */

    let memoryContext = null;

    try{

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

    catch(error){

      logger.warning(
        "Memory Agent Failed"
      );

    }


    /* =========================
       INTENT
    ========================= */

    let intent = null;

    try{

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

    catch(error){

      logger.warning(
        "Intent Agent Failed"
      );

    }


    /* =========================
       CODE REQUEST OVERRIDE

       /api/ai/generate-code
       explicitly requests a build.

       If Intent Agent returns
       another type, the explicit
       code request remains authoritative.
    ========================= */

    if(
      requestType === "code"
    ){

      if(
        !intent ||
        intent.type !== "build"
      ){

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

    let planning = null;

    try{

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

    catch(error){

      logger.warning(
        "Planner Agent Failed"
      );

    }


    /* =========================
       RESULTS
    ========================= */

    let buildResult = null;

    let deploymentResult = null;

    let monitoringResult = null;

    let scalingResult = null;

    let billingResult = null;

    let subscriptionResult = null;

    let fixResult = null;

    let fileResult = null;


    /* =========================
       BUILD FLOW
    ========================= */

    if(

      intent?.type === "build"

    ){

      try{

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

      }

      catch(error){

        logger.warning(
          "Builder Agent Failed"
        );

      }

    }


    /* =========================
       DEPLOY FLOW
    ========================= */

    if(

      intent?.type === "deploy"

    ){

      try{

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

      catch(error){

        logger.warning(
          "Deploy Agent Failed"
        );

      }

    }


    /* =========================
       MONITOR FLOW
    ========================= */

    if(

      intent?.type === "monitor"

    ){

      try{

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

      catch(error){

        logger.warning(
          "Monitoring Agent Failed"
        );

      }

    }


    /* =========================
       SCALING FLOW
    ========================= */

    if(

      intent?.type === "scale"

    ){

      try{

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

      catch(error){

        logger.warning(
          "Scaling Agent Failed"
        );

      }

    }


    /* =========================
       BILLING FLOW
    ========================= */

    if(

      intent?.type === "billing"

    ){

      try{

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

      catch(error){

        logger.warning(
          "Billing Agent Failed"
        );

      }

    }


    /* =========================
       SUBSCRIPTION FLOW
    ========================= */

    if(

      intent?.type ===
      "subscription"

    ){

      try{

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

      catch(error){

        logger.warning(
          "Subscription Agent Failed"
        );

      }

    }


    /* =========================
       FIX FLOW
    ========================= */

    if(

      intent?.type === "fix"

    ){

      try{

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

      catch(error){

        logger.warning(
          "Fix Agent Failed"
        );

      }

    }


    /* =========================
       FILE FLOW
    ========================= */

    if(

      intent?.type === "file"

    ){

      try{

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

      catch(error){

        logger.warning(
          "File Agent Failed"
        );

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
       AI RESPONSE
    ========================= */

    const completion =

      await openai
        .chat
        .completions
        .create({

          model:
            "gpt-4.1-mini",

          messages:[

            {

              role:
                "system",

              content:`

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

              content:`

USER PROMPT:

${userPrompt}

REQUEST TYPE:

${requestType || "general"}

FRAMEWORK:

${framework || "not specified"}

PROJECT ID:

${projectId || "not specified"}

INTENT:

${JSON.stringify(intent)}

PLANNING:

${JSON.stringify(planning)}

MEMORY:

${JSON.stringify(memoryContext)}

BUILD RESULT:

${JSON.stringify(buildResult)}

DEPLOYMENT RESULT:

${JSON.stringify(deploymentResult)}

MONITORING RESULT:

${JSON.stringify(monitoringResult)}

SCALING RESULT:

${JSON.stringify(scalingResult)}

BILLING RESULT:

${JSON.stringify(billingResult)}

SUBSCRIPTION RESULT:

${JSON.stringify(subscriptionResult)}

FIX RESULT:

${JSON.stringify(fixResult)}

FILE RESULT:

${JSON.stringify(fileResult)}

`

            }

          ],

          temperature:
            0.7,

          max_tokens:
            1500

        });


    /* =========================
       FINAL RESPONSE
    ========================= */

    return {

      success:true,

      reply:

        completion
          .choices?.[0]
          ?.message
          ?.content || "",

      orchestration

    };

  }

  catch(error){

    logger.error(
      error.message
    );

    return {

      success:false,

      message:
        "Master Agent Failed",

      error:
        error.message

    };

  }

}


/* =========================
   EXPORT
========================= */

module.exports =
  masterAgent;
