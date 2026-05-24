/* =========================
   PACKAGES
========================= */

const OpenAI =
require("openai");

/* =========================
   OPTIONAL AGENTS
========================= */

const plannerAgent =
require("./plannerAgent");

const builderAgent =
require("./builderAgent");

const deployAgent =
require("./deployAgent");

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

  userPrompt

){

  try{

    console.log(
      "⚡ Master Agent Started"
    );

    /* =========================
       STEP 1
       PLANNING
    ========================= */

    let planningResult = null;

    try{

      planningResult =

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
       STEP 2
       BUILDING
    ========================= */

    let builderResult = null;

    try{

      builderResult =

      await builderAgent(
        userPrompt
      );

    }

    catch(error){

      console.log(
        "Builder Agent Failed"
      );

    }

    /* =========================
       STEP 3
       DEPLOYMENT ANALYSIS
    ========================= */

    let deploymentResult = null;

    try{

      deploymentResult =

      await deployAgent({

        projectName:
        "VertexCloud AI Project",

        prompt:
        userPrompt

      });

    }

    catch(error){

      console.log(
        "Deploy Agent Failed"
      );

    }

    /* =========================
       STEP 4
       MASTER AI RESPONSE
    ========================= */

    const completion =

    await openai
    .chat.completions
    .create({

      model:
      "gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are the Master Agent of VertexCloud AI OS.

You are an autonomous senior CTO AI.

Your responsibilities:

- understand user goals
- architect scalable systems
- coordinate AI agents
- plan frontend/backend
- plan databases
- plan APIs
- plan AI systems
- plan DevOps
- plan deployment infrastructure
- think like a Silicon Valley CTO

Always respond professionally.

Always optimize systems for:

- scalability
- security
- performance
- maintainability
- production deployment

          `

        },

        {

          role:"user",

          content:userPrompt

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

      agents:{

        planner:
        planningResult,

        builder:
        builderResult,

        deployment:
        deploymentResult

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
