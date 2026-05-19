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
   PLANNING AGENT
========================= */

async function planningAgent(projectIdea){

  try{

    /* =========================
       AI PLANNING
    ========================= */

    const completion =
    await openai.chat.completions.create({

      model:
      "gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are the Planning Agent of Rehman AI OS.

Your responsibilities:

- create production architecture
- decide scalable structure
- plan frontend/backend
- plan APIs
- plan database
- plan authentication
- plan deployment
- plan AI systems
- plan folders/files
- think like a senior software architect

Return ONLY valid JSON.

Format:

{
  "projectName":"",
  "description":"",
  "frontend":{
    "framework":"",
    "pages":[]
  },
  "backend":{
    "framework":"",
    "routes":[]
  },
  "database":{
    "type":"",
    "tables":[]
  },
  "aiSystems":[],
  "deployment":{
    "provider":"",
    "services":[]
  },
  "projectStructure":[]
}

          `

        },

        {

          role:"user",

          content:projectIdea

        }

      ],

      temperature:0.5

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
planningAgent;
