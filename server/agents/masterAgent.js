/* =========================
   MASTER AGENT
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
   MASTER AGENT
========================= */

async function masterAgent(userPrompt){

  try{

    /* =========================
       AI RESPONSE
    ========================= */

    const completion =
    await openai.chat.completions.create({

      model:
      "gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are the Master Agent of Rehman AI OS.

You coordinate all AI agents.

Your responsibilities:

- understand user intent
- decide app architecture
- decide frontend/backend
- decide APIs
- decide deployment flow
- plan production systems
- think like a senior CTO

Always think deeply.

Respond professionally.

          `

        },

        {

          role:"user",

          content:userPrompt

        }

      ],

      temperature:0.7

    });

    /* =========================
       FINAL REPLY
    ========================= */

    return {

      success:true,

      reply:
      completion
      .choices[0]
      .message
      .content

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
masterAgent;
