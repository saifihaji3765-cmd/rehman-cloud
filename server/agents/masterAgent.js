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

const awsAgent =
require("./awsAgent");

const dockerAgent =
require("./dockerAgent");

const domainAgent =
require("./domainAgent");

const sslAgent =
require("./sslAgent");

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
  user = null
){

  try{

    console.log(
      "⚡ VertexCloud Master Agent Started"
    );

    /* =========================
       MEMORY CONTEXT
    ========================= */

    let memoryContext = null;

    try{

      memoryContext =
      await memoryAgent(
        userPrompt,
        user
      );

    }

    catch(error){

      console.log(
        "Memory Agent Failed"
      );

    }

    /* =========================
       INTENT DETECTION
    ========================= */

    let intent = null;

    try{

      intent =
      await intentAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Intent Agent Failed"
      );

    }

    /* =========================
       PLANNING
    ========================= */

    let planning = null;

    try{

      planning =
      await plannerAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Planner Agent Failed"
      );

    }

    /* =========================
       BUILDING
    ========================= */

    let buildResult = null;

    if(

      intent &&
      intent.type === "build"

    ){

      try{

        buildResult =
        await builderAgent(
          userPrompt
        );

      }

      catch(error){

        console.log(
          "Builder Agent Failed"
        );

      }

    }

    /* =========================
       DEPLOYMENT
    ========================= */

    let deployment = null;

    if(

      intent &&
      intent.type === "deploy"

    ){

      try{

        deployment =
        await deployAgent({

          prompt:userPrompt,

          projectName:
          "VertexCloud App"

        });

      }

      catch(error){

        console.log(
          "Deploy Agent Failed"
        );

      }

    }

    /* =========================
       AWS
    ========================= */

    let awsResult = null;

    try{

      awsResult =
      await awsAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "AWS Agent Failed"
      );

    }

    /* =========================
       DOCKER
    ========================= */

    let dockerResult = null;

    try{

      dockerResult =
      await dockerAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Docker Agent Failed"
      );

    }

    /* =========================
       DOMAIN
    ========================= */

    let domainResult = null;

    try{

      domainResult =
      await domainAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Domain Agent Failed"
      );

    }

    /* =========================
       SSL
    ========================= */

    let sslResult = null;

    try{

      sslResult =
      await sslAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "SSL Agent Failed"
      );

    }

    /* =========================
       MONITORING
    ========================= */

    let monitoringResult = null;

    try{

      monitoringResult =
      await monitoringAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Monitoring Agent Failed"
      );

    }

    /* =========================
       SCALING
    ========================= */

    let scalingResult = null;

    try{

      scalingResult =
      await scalingAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Scaling Agent Failed"
      );

    }

    /* =========================
       BILLING
    ========================= */

    let billingResult = null;

    try{

      billingResult =
      await billingAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Billing Agent Failed"
      );

    }

    /* =========================
       SUBSCRIPTION
    ========================= */

    let subscriptionResult = null;

    try{

      subscriptionResult =
      await subscriptionAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Subscription Agent Failed"
      );

    }

    /* =========================
       FIX AGENT
    ========================= */

    let fixResult = null;

    try{

      fixResult =
      await fixAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Fix Agent Failed"
      );

    }

    /* =========================
       FILE AGENT
    ========================= */

    let fileResult = null;

    try{

      fileResult =
      await fileAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "File Agent Failed"
      );

    }

    /* =========================
       MASTER AI RESPONSE
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

You coordinate multiple AI agents.

You think like:

- CTO
- DevOps architect
- AI engineer
- SaaS founder
- Cloud architect

You optimize:

- scalability
- automation
- deployment
- monetization
- infrastructure
- production stability

`

        },

        {

          role:"user",

          content:`

USER PROMPT:
${userPrompt}

INTENT:
${JSON.stringify(intent)}

MEMORY:
${JSON.stringify(memoryContext)}

PLANNING:
${JSON.stringify(planning)}

`

        }

      ],

      temperature:0.7,

      max_tokens:2000

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

        memoryContext,

        planning,

        buildResult,

        deployment,

        awsResult,

        dockerResult,

        domainResult,

        sslResult,

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

    console.log(error);

    return {

      success:false,

      message:
      "Master Agent Failed",

      error:error.message

    };

  }

}

/* =========================
   EXPORT
========================= */

module.exports =
masterAgent;
