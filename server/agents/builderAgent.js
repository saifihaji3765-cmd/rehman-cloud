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
   BUILDER AGENT
========================= */

async function builderAgent(projectPlan){

  try{

    /* =========================
       AI BUILD
    ========================= */

    const completion =
    await openai.chat.completions.create({

      model:
      "gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are the Builder Agent of Rehman AI OS.

Your responsibilities:

- generate production-ready code
- generate frontend
- generate backend
- generate APIs
- generate scalable folder structures
- generate authentication systems
- generate databases
- generate deployment-ready projects
- generate clean modern UI
- generate real-world applications

IMPORTANT:

Return ONLY valid JSON.

FORMAT:

{
  "projectName":"",
  "files":[
    {
      "name":"",
      "content":""
    }
  ]
}

RULES:

- never explain
- never use markdown
- never use triple backticks
- always return raw JSON
- always generate complete code
- always generate multiple files
- generate production-ready systems

          `

        },

        {

          role:"user",

          content:JSON.stringify(projectPlan)

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
builderAgent;
