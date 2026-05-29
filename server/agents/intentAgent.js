/* =========================
   PACKAGES
========================= */

const OpenAI =
require("openai");

/* =========================
   SERVICES
========================= */

const logger =
require("../services/loggerService");

/* =========================
   OPENAI
========================= */

const openai =
new OpenAI({

  apiKey:
  process.env.OPENAI_API_KEY

});

/* =========================
   VALID INTENTS
========================= */

const VALID_INTENTS = [

  "chat",

  "build",

  "deploy",

  "monitor",

  "scale",

  "billing",

  "subscription",

  "fix",

  "file",

  "automation",

  "infrastructure",

  "thumbnail"

];

/* =========================
   INTENT AGENT
========================= */

async function intentAgent(
data = {}
){

try{

/* =========================
   INPUT
========================= */

const prompt =

  data.prompt ||

  "";

/* =========================
   VALIDATION
========================= */

if(

  !prompt ||

  typeof prompt !== "string"

){

  return {

    success:false,

    message:
    "Prompt required",

    type:"chat"

  };

}

/* =========================
   TRUNCATE
========================= */

const cleanPrompt =

  prompt
  .trim()
  .slice(0,4000);

/* =========================
   AI ANALYSIS
========================= */

const completion =

await openai
.chat.completions
.create({

model:
"gpt-4.1-mini",

temperature:0.1,

response_format:{

  type:"json_object"

},

messages:[

{

role:"system",

content:`

You are the Intent Detection Agent
of VertexCloud AI OS.

Your ONLY responsibility is
intent classification.

You must determine:

- main intent
- user goal
- complexity
- required AI agents

Return ONLY valid JSON.

VALID INTENTS:

- chat
- build
- deploy
- monitor
- scale
- billing
- subscription
- fix
- file
- automation
- infrastructure
- thumbnail

JSON FORMAT:

{
"type":"",
"goal":"",
"complexity":"",
"confidence":0,
"requiredAgents":[]
}

Rules:

- confidence must be 0-100
- requiredAgents must be array
- type must match valid intents
- no explanations
- no markdown
- no extra text

`

},

{

role:"user",

content:cleanPrompt

}

]

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

let parsed = {};

try{

parsed =
JSON.parse(raw);

}

catch(error){

logger.warning(
  "Intent JSON Parse Failed"
);

parsed = {

  type:"chat",

  goal:"general conversation",

  complexity:"low",

  confidence:50,

  requiredAgents:[]

};

}

/* =========================
   TYPE VALIDATION
========================= */

if(

!parsed.type ||

!VALID_INTENTS.includes(
parsed.type
)

){

parsed.type =
"chat";

}

/* =========================
   GOAL VALIDATION
========================= */

if(

!parsed.goal ||

typeof parsed.goal !==
"string"

){

parsed.goal =
"general interaction";

}

/* =========================
   COMPLEXITY VALIDATION
========================= */

if(

!parsed.complexity

){

parsed.complexity =
"medium";

}

/* =========================
   CONFIDENCE VALIDATION
========================= */

if(

parsed.confidence ===
undefined ||

typeof parsed.confidence
!== "number"

){

parsed.confidence = 70;

}

/* =========================
   CONFIDENCE LIMIT
========================= */

if(

parsed.confidence > 100

){

parsed.confidence = 100;

}

if(

parsed.confidence < 0

){

parsed.confidence = 0;

}

/* =========================
   REQUIRED AGENTS
========================= */

if(

!Array.isArray(
parsed.requiredAgents
)

){

parsed.requiredAgents =
[];

}

/* =========================
   FALLBACK AGENTS
========================= */

if(

parsed.requiredAgents
.length === 0

){

switch(parsed.type){

case "build":

parsed.requiredAgents = [

  "plannerAgent",

  "builderAgent"

];

break;

case "deploy":

parsed.requiredAgents = [

  "deployAgent"

];

break;

case "monitor":

parsed.requiredAgents = [

  "monitoringAgent"

];

break;

case "scale":

parsed.requiredAgents = [

  "scalingAgent"

];

break;

case "billing":

parsed.requiredAgents = [

  "billingAgent"

];

break;

case "subscription":

parsed.requiredAgents = [

  "subscriptionAgent"

];

break;

case "fix":

parsed.requiredAgents = [

  "fixAgent"

];

break;

case "file":

parsed.requiredAgents = [

  "fileAgent"

];

break;

default:

parsed.requiredAgents = [];

}

}

/* =========================
   SUCCESS LOG
========================= */

logger.success(

`Intent Detected: ${parsed.type}`

);

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

logger.error(
error.message
);

/* =========================
   SAFE FALLBACK
========================= */

return {

success:false,

type:"chat",

data:{

  type:"chat",

  goal:
  "general interaction",

  complexity:"low",

  confidence:40,

  requiredAgents:[]

},

error:error.message

};

}

}

/* =========================
   EXPORT
========================= */

module.exports =
intentAgent;
