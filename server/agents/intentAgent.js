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

async function intentAgent(
userPrompt
){

try{

/* =========================
   AI ANALYSIS
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

You are the Intent Detection Agent of VertexCloud AI OS.

Your responsibilities:

- deeply understand user intent
- classify SaaS requests
- classify deployment requests
- classify AI generation requests
- classify cloud infrastructure requests
- classify automation requests
- classify monetization systems
- classify scaling systems
- classify thumbnail/image requests
- classify debugging/fixing requests

You MUST determine:

- main intent type
- user business goal
- required AI agents
- complexity level
- infrastructure requirements
- monetization model
- scaling requirements

Return ONLY valid JSON.

VALID TYPES:

- chat
- build
- deploy
- thumbnail
- infrastructure
- scaling
- billing
- debugging
- automation

JSON FORMAT:

{
"type":"",
"goal":"",
"appType":"",
"difficulty":"",
"confidence":0,
"features":[],
"frontendNeeds":[],
"backendNeeds":[],
"deploymentNeeds":[],
"aiFeatures":[],
"recommendedStack":[],
"requiredAgents":[],
"monetization":"",
"scalingNeeds":[],
"cloudProvider":"aws"
}

`

    },

    {

      role:"user",

      content:userPrompt

    }

  ],

  temperature:0.2,

  response_format:{

    type:"json_object"

  }

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
   PARSE JSON
========================= */

const parsed =
JSON.parse(raw);

/* =========================
   FALLBACK TYPE
========================= */

if(!parsed.type){

  parsed.type =
  "chat";

}

/* =========================
   FALLBACK CONFIDENCE
========================= */

if(!parsed.confidence){

  parsed.confidence =
  80;

}

/* =========================
   RESPONSE
========================= */

return {

  success:true,

  type:
  parsed.type,

  data:parsed

};

}

catch(error){

console.log(error);

return {

  success:false,

  type:"chat",

  error:error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
intentAgent;
