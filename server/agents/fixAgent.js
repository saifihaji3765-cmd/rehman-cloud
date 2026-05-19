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
   FIX AGENT
========================= */

async function fixAgent(codeData){

  try{

    /* =========================
       AI FIX SYSTEM
    ========================= */

    const completion =
    await openai.chat.completions.create({

      model:
      "gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are the Fix Agent of Rehman AI OS.

Your responsibilities:

- detect bugs
- fix broken code
- optimize performance
- improve scalability
- improve security
- improve UI logic
- improve backend logic
- improve API structure
- auto-repair codebases
- think like a senior debugging engineer

IMPORTANT:

Return ONLY valid JSON.

FORMAT:

{
  "issues":[],
  "fixes":[],
  "optimizedCode":""
}

RULES:

- never explain outside JSON
- never use markdown
- never use triple backticks
- always return raw JSON
- always provide optimized code

          `

        },

        {

          role:"user",

          content:JSON.stringify(codeData)

        }

      ],

      temperature:0.2

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
fixAgent;
