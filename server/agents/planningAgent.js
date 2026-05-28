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
   SAFE JSON PARSER
========================= */

function safeJsonParse(data){

  try{

    return JSON.parse(data);

  }

  catch(error){

    return null;

  }

}

/* =========================
   PLANNING AGENT
========================= */

async function planningAgent(projectIdea){

  try{

    /* =========================
       VALIDATION
    ========================= */

    if(!projectIdea){

      return {

        success:false,

        error:
        "Project idea required"

      };

    }

    /* =========================
       AI PLANNING
    ========================= */

    const completion =

    await openai.chat.completions.create({

      model:
      "gpt-4.1-mini",

      response_format:{
        type:"json_object"
      },

      messages:[

        {

          role:"system",

          content:`

You are the Planning Agent of VertexCloud AI OS.

Your responsibilities:

- create production-grade architecture
- create scalable SaaS structures
- plan frontend/backend systems
- design APIs
- design database systems
- plan authentication
- plan deployment infrastructure
- plan AI orchestration
- generate folder/file structures
- optimize for scalability/security/performance

Always return valid JSON.

Required JSON format:

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
    "collections":[]
  },
  "authentication":{
    "providers":[]
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

      temperature:0.4,

      max_tokens:2000

    });

    /* =========================
       RESPONSE
    ========================= */

    const raw =

    completion
    .choices[0]
    .message
    .content;

    /* =========================
       CLEAN RESPONSE
    ========================= */

    const cleaned =

    raw
    .replace(/```json/g,"")
    .replace(/```/g,"")
    .trim();

    /* =========================
       PARSE JSON
    ========================= */

    const parsed =
    safeJsonParse(cleaned);

    if(!parsed){

      return {

        success:false,

        error:
        "Invalid AI JSON response"

      };

    }

    /* =========================
       FINAL RESPONSE
    ========================= */

    return {

      success:true,

      data:parsed,

      metadata:{

        model:
        "gpt-4.1-mini",

        agent:
        "planningAgent",

        generatedAt:
        new Date()

      }

    };

  }

  catch(error){

    console.log(
      "Planning Agent Error:",
      error.message
    );

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
