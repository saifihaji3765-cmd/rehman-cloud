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
   DEPLOY AGENT
========================= */

async function deployAgent(projectData){

  try{

    /* =========================
       AI DEPLOYMENT PLANNING
    ========================= */

    const completion =
    await openai.chat.completions.create({

      model:
      "gpt-4.1-mini",

      messages:[

        {

          role:"system",

          content:`

You are the Deploy Agent of Rehman AI OS.

Your responsibilities:

- prepare production deployment
- generate Docker configurations
- generate AWS deployment plans
- generate Vercel deployment plans
- generate Render deployment plans
- generate CI/CD workflows
- generate environment variable setup
- generate domain connection steps
- generate scalable hosting architecture
- think like a DevOps engineer

IMPORTANT:

Return ONLY valid JSON.

FORMAT:

{
  "deploymentProvider":"",
  "dockerFiles":[
    {
      "name":"",
      "content":""
    }
  ],
  "deploymentSteps":[],
  "environmentVariables":[],
  "recommendedDomains":[],
  "ciCd":[]
}

RULES:

- never explain outside JSON
- never use markdown
- never use triple backticks
- always return raw JSON
- always generate production-ready deployment systems

          `

        },

        {

          role:"user",

          content:JSON.stringify(projectData)

        }

      ],

      temperature:0.3

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
deployAgent;
