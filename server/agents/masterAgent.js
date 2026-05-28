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
require("./plannerAgent");

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
  userPrompt,
  user = {}
){

  try{

    logger.info(
      "⚡ VertexCloud Master Agent Started"
    );

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

    /* =========================
       MEMORY
    ========================= */

    let memoryContext = null;

    try{

      memoryContext =

      await memoryAgent({

        prompt:userPrompt,

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

        prompt:userPrompt,

        user

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
       PLANNING
    ========================= */

    let planning = null;

    try{

      planning =

      await plannerAgent({

        prompt:userPrompt,

        intent,

        user

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

          prompt:userPrompt,

          plan:planning,

          user

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

          "guest-user",

          projectName:

          planning?.projectName ||

          "vertexcloud-app",

          framework:

          planning?.framework ||

          "node",

          prompt:userPrompt,

          plan:

          planning?.plan ||

          "Starter"

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

          planning?.projectName ||

          "VertexCloud App"

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

          cpuUsage:70,

          ramUsage:60,

          activeUsers:500

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

          "guest-user",

          plan:

          planning?.plan ||

          "Starter"

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

      intent?.type === "subscription"

    ){

      try{

        subscriptionResult =

        await subscriptionAgent({

          userId:
          user?.id ||

          "guest-user",

          plan:

          planning?.plan ||

          "Starter"

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

          prompt:userPrompt,

          user

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

          prompt:userPrompt,

          user

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
       AI RESPONSE
    ========================= */

    const completion =

    await openai
    .chat.completions
    .create({

      model:"gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are VertexCloud Autonomous Master AI.

You coordinate AI agents.

You think like:

- CTO
- Cloud Architect
- DevOps Engineer
- SaaS Founder
- AI Infrastructure Engineer

Your goals:

- automation
- scalability
- production safety
- deployment optimization
- infrastructure reliability
- monetization
- performance

Always return clean,
professional,
production-ready responses.

`

        },

        {

          role:"user",

          content:`

USER PROMPT:
${userPrompt}

INTENT:
${JSON.stringify(intent)}

PLANNING:
${JSON.stringify(planning)}

MEMORY:
${JSON.stringify(memoryContext)}

`

        }

      ],

      temperature:0.7,

      max_tokens:1500

    });

    /* =========================
       FINAL RESPONSE
    ========================= */

    return {

      success:true,

      reply:

      completion
      .choices[0]
      .message
      .content,

      orchestration:{

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

      }

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
