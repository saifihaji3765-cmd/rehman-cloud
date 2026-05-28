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
   BUILDER AGENT
========================= */

async function builderAgent(projectPlan){

  try{

    /* =========================
       VALIDATION
    ========================= */

    if(!projectPlan){

      return {

        success:false,

        error:
        "Project plan required"

      };

    }

    /* =========================
       AI BUILD
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

You are the Builder Agent of VertexCloud AI OS.

Your responsibilities:

- generate production-ready code
- generate frontend/backend
- generate APIs
- generate scalable architectures
- generate databases
- generate authentication systems
- generate deployment-ready applications
- generate clean maintainable code
- generate modern SaaS systems

IMPORTANT RULES:

- ALWAYS return valid JSON
- NEVER explain anything
- NEVER use markdown
- NEVER use triple backticks
- ALWAYS return raw JSON
- ALWAYS generate complete files
- ALWAYS generate production-grade systems

JSON FORMAT:

{
  "projectName":"",
  "framework":"",
  "files":[
    {
      "path":"",
      "content":""
    }
  ]
}

          `

        },

        {

          role:"user",

          content:
          JSON.stringify(projectPlan)

        }

      ],

      temperature:0.3,

      max_tokens:4000

    });

    /* =========================
       RAW RESPONSE
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
       PARSE RESPONSE
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
       FILE VALIDATION
    ========================= */

    if(

      !parsed.files ||

      !Array.isArray(
        parsed.files
      )

    ){

      return {

        success:false,

        error:
        "Invalid files structure"

      };

    }

    /* =========================
       FINAL RESPONSE
    ========================= */

    return {

      success:true,

      data:parsed,

      metadata:{

        agent:
        "builderAgent",

        model:
        "gpt-4.1-mini",

        totalFiles:
        parsed.files.length,

        generatedAt:
        new Date()

      }

    };

  }

  catch(error){

    console.log(
      "Builder Agent Error:",
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
builderAgent;
