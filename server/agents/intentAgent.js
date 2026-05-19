/* =========================
   IMPORTS
========================= */

const OpenAI =
require("openai");

/* =========================
   OPENAI
========================= */

const openai =
new OpenAI({

  apiKey:
  process.env.OPENAI_API_KEY

});

/* =========================
   INTENT AGENT
========================= */

async function intentAgent(userPrompt){

  try{

    /* =========================
       AI ANALYSIS
    ========================= */

    const completion =
    await openai.chat.completions.create({

      model:
      "gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are the Intent Agent of Rehman AI OS.

Your responsibilities:

- deeply understand user goals
- detect startup ideas
- detect SaaS ideas
- detect app requirements
- detect frontend/backend needs
- detect monetization intent
- detect deployment intent
- understand messy prompts
- convert rough ideas into clear plans

Return ONLY valid JSON.

Format:

{
  "appType":"",
  "goal":"",
  "features":[],
  "frontendNeeds":[],
  "backendNeeds":[],
  "deploymentNeeds":[],
  "aiFeatures":[],
  "difficulty":"",
  "recommendedStack":[]
}

          `

        },

        {

          role:"user",

          content:userPrompt

        }

      ],

      temperature:0.4

    });

    /* =========================
       CLEAN RESPONSE
    ========================= */

    const raw =
    completion
    .choices[0]
    .message
    .content;

    const cleaned =
    raw
    .replace(/```json/g,"")
    .replace(/```/g,"")
    .trim();

    const parsed =
    JSON.parse(cleaned);

    return {

      success:true,

      data:parsed

    };

  }

  catch(error){

    console.log(error);

    return {

      success:false,

      error:error.message

    };

  }

}

/* =========================
   EXPORT
========================= */

module.exports =
intentAgent;
