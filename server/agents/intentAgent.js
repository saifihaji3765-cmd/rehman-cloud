/* =========================================================
   ZyrionOS INTENT AGENT
   Intent Classification & Agent Routing

   AI Provider Chain:
   Gemini → OpenAI fallback
========================================================= */


/* =========================
   SERVICES
========================= */

const logger =
  require("../services/loggerService");


const {
  generateJSON
} =
  require("../services/ai/aiProviderService");


/* =========================================================
   CONSTANTS
========================================================= */


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
   VALID COMPLEXITIES
========================= */

const VALID_COMPLEXITIES = [

  "low",

  "medium",

  "high"

];


/* =========================
   KNOWN AGENTS
========================= */

const KNOWN_AGENTS = [

  "intentAgent",

  "plannerAgent",

  "builderAgent",

  "deployAgent",

  "monitoringAgent",

  "scalingAgent",

  "billingAgent",

  "subscriptionAgent",

  "memoryAgent",

  "fixAgent",

  "fileAgent"

];


/* =========================================================
   HELPERS
========================================================= */


/* =========================
   SAFE STRING
========================= */

function cleanString(
  value,
  maxLength = 4000
) {

  if (
    typeof value !== "string"
  ) {

    return "";

  }


  return value
    .trim()
    .slice(
      0,
      maxLength
    );

}


/* =========================
   SAFE JSON
========================= */

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      value ?? null
    );

  }

  catch (error) {

    return JSON.stringify({

      error:
        "Unable to serialize context"

    });

  }

}


/* =========================
   DEFAULT INTENT
========================= */

function createDefaultIntent() {

  return {

    type:
      "chat",

    goal:
      "general interaction",

    complexity:
      "low",

    confidence:
      50,

    requiredAgents:
      []

  };

}


/* =========================
   FALLBACK AGENTS
========================= */

function getFallbackAgents(
  type
) {

  switch (type) {

    case "build":

      return [

        "plannerAgent",

        "builderAgent"

      ];


    case "deploy":

      return [

        "deployAgent"

      ];


    case "monitor":

      return [

        "monitoringAgent"

      ];


    case "scale":

      return [

        "scalingAgent"

      ];


    case "billing":

      return [

        "billingAgent"

      ];


    case "subscription":

      return [

        "subscriptionAgent"

      ];


    case "fix":

      return [

        "fixAgent"

      ];


    case "file":

      return [

        "fileAgent"

      ];


    case "automation":

      return [

        "plannerAgent"

      ];


    case "infrastructure":

      return [

        "plannerAgent"

      ];


    case "thumbnail":

      return [];


    case "chat":

    default:

      return [];

  }

}


/* =========================
   NORMALIZE REQUIRED AGENTS
========================= */

function normalizeRequiredAgents(
  agents,
  type
) {

  let normalized = [];


  if (
    Array.isArray(
      agents
    )
  ) {

    normalized =
      agents

        .filter(
          (agent) =>
            typeof agent ===
            "string"
        )

        .map(
          (agent) =>
            agent.trim()
        )

        .filter(Boolean)

        .filter(
          (agent) =>
            KNOWN_AGENTS.includes(
              agent
            )
        );

  }


  normalized = [
    ...new Set(
      normalized
    )
  ];


  if (
    normalized.length === 0
  ) {

    normalized =
      getFallbackAgents(
        type
      );

  }


  return normalized;

}


/* =========================
   NORMALIZE CONFIDENCE
========================= */

function normalizeConfidence(
  value
) {

  let confidence =
    Number(
      value
    );


  if (
    !Number.isFinite(
      confidence
    )
  ) {

    confidence =
      70;

  }


  confidence =
    Math.round(
      confidence
    );


  if (
    confidence > 100
  ) {

    confidence =
      100;

  }


  if (
    confidence < 0
  ) {

    confidence =
      0;

  }


  return confidence;

}


/* =========================
   NORMALIZE INTENT
========================= */

function normalizeIntent(
  parsed
) {

  const fallback =
    createDefaultIntent();


  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(
      parsed
    )
  ) {

    return fallback;

  }


  let type =
    cleanString(
      parsed.type,
      50
    )
      .toLowerCase();


  if (
    !VALID_INTENTS.includes(
      type
    )
  ) {

    type =
      "chat";

  }


  let goal =
    cleanString(
      parsed.goal,
      1000
    );


  if (
    !goal
  ) {

    goal =
      "general interaction";

  }


  let complexity =
    cleanString(
      parsed.complexity,
      50
    )
      .toLowerCase();


  if (
    !VALID_COMPLEXITIES.includes(
      complexity
    )
  ) {

    complexity =
      "medium";

  }


  const confidence =
    normalizeConfidence(
      parsed.confidence
    );


  const requiredAgents =
    normalizeRequiredAgents(
      parsed.requiredAgents,
      type
    );


  return {

    type,

    goal,

    complexity,

    confidence,

    requiredAgents

  };

}


/* =========================================================
   SYSTEM PROMPT
========================================================= */

const INTENT_SYSTEM_PROMPT = `

You are the Intent Detection Agent
of ZyrionOS Autonomous AI OS.

Your ONLY responsibility is to classify
the user's CURRENT request.

You do NOT execute actions.
You do NOT generate project code.
You do NOT deploy infrastructure.
You do NOT claim that anything succeeded.

Determine:

1. the primary intent
2. the user's concrete goal
3. request complexity
4. which connected agents are relevant

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

CONNECTED AGENTS:

- plannerAgent
- builderAgent
- deployAgent
- monitoringAgent
- scalingAgent
- billingAgent
- subscriptionAgent
- memoryAgent
- fixAgent
- fileAgent

INTENT DEFINITIONS:

chat:
General questions, explanations,
conversation, advice, or requests that
do not require a specialized operation.

build:
Create, generate, develop, or modify
an application, website, backend,
frontend, API, feature, software project,
or source code.

deploy:
Deploy, publish, host, release, or make
an existing project live.

monitor:
Inspect deployment health, CPU, RAM,
service health, availability, or runtime
infrastructure metrics.

scale:
Increase or decrease infrastructure
capacity or application instances.

billing:
Questions or operations involving
pricing, billing information, charges,
or plan billing.

subscription:
Subscription plan, limits, status,
features, or subscription lifecycle.

fix:
Debug, repair, diagnose, optimize,
or correct broken code or a project.

file:
Read, inspect, manage, save, delete,
or work directly with project files.

automation:
Create or reason about an automated
workflow or repeated software process.

infrastructure:
Infrastructure architecture,
cloud resources, containers,
networking, or infrastructure planning.

thumbnail:
Requests specifically asking to create
or generate a thumbnail.

CLASSIFICATION RULES:

- Classify ONLY the CURRENT prompt.
- Current explicit instructions have
  priority over memory/context.
- Memory is contextual information only.
- Do not let memory override the current
  explicit user request.
- Do not invent unsupported intents.
- If the user asks to build software,
  classify as "build".
- If the user asks to fix broken code,
  classify as "fix".
- If the user asks to deploy an existing
  project, classify as "deploy".
- If the user asks about deployment health
  or runtime metrics, classify as "monitor".
- If the user asks to increase or decrease
  capacity, classify as "scale".
- If the request concerns prices, charges,
  invoices, or billing, classify as "billing".
- If the request concerns plans, limits,
  subscription status, or subscription
  lifecycle, classify as "subscription".
- If the request concerns files directly,
  classify as "file".
- If the request concerns infrastructure
  architecture or cloud resources, classify
  as "infrastructure".
- If the request concerns automated
  workflows, classify as "automation".
- If the request specifically asks for a
  thumbnail, classify as "thumbnail".
- If uncertain, use "chat".

complexity must be:

"low"
"medium"
"high"

confidence must be a number from 0-100.

requiredAgents must be an array.

Only use names from CONNECTED AGENTS.

Do not invent agent names.

Return JSON only.

No markdown.

No explanation outside JSON.

REQUIRED JSON FORMAT:

{
  "type": "",
  "goal": "",
  "complexity": "",
  "confidence": 0,
  "requiredAgents": []
}

`;


/* =========================================================
   INTENT AGENT
========================================================= */

async function intentAgent(
  data = {}
) {

  try {

    logger.info(
      "🧠 ZyrionOS Intent Agent Started"
    );


    /* =====================================================
       INPUT NORMALIZATION
    ===================================================== */

    const prompt =
      cleanString(
        data?.prompt,
        4000
      );


    const memoryContext =
      data?.memoryContext ||
      null;


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (
      !prompt
    ) {

      return {

        success:
          false,

        message:
          "Prompt required",

        type:
          "chat",

        data:
          createDefaultIntent()

      };

    }


    /* =====================================================
       MEMORY SUMMARY
    ===================================================== */

    let memorySummary =
      "";


    if (
      memoryContext
    ) {

      memorySummary =
        safeJson(
          memoryContext
        )
          .slice(
            0,
            2500
          );

    }


    /* =====================================================
       AI REQUEST
    ===================================================== */

    const result =
      await generateJSON({

        /*
         * No provider is forced here.
         *
         * aiProviderService uses:
         *
         * Gemini → OpenAI fallback
         *
         * according to env.js.
         */

        messages: [

          {

            role:
              "system",

            content:
              INTENT_SYSTEM_PROMPT

          },

          {

            role:
              "user",

            content: `

CURRENT USER REQUEST:

${prompt}

OPTIONAL MEMORY CONTEXT:

${memorySummary ||
  "No memory context provided."}

Classify only the current request.

`

          }

        ],

        temperature:
          0.1,

        maxTokens:
          1000

      });


    /* =====================================================
       PROVIDER VALIDATION
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      throw new Error(
        "AI provider returned an unsuccessful result"
      );

    }


    /* =====================================================
       RESPONSE VALIDATION
    ===================================================== */

    if (
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(
        result.data
      )
    ) {

      throw new Error(
        "Intent AI returned invalid structured data"
      );

    }


    /* =====================================================
       NORMALIZATION
    ===================================================== */

    const normalized =
      normalizeIntent(
        result.data
      );


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(
      `Intent Detected: ${normalized.type} | Confidence: ${normalized.confidence}% | Provider: ${result.provider} | Model: ${result.model}`
    );


    /* =====================================================
       RESPONSE CONTRACT
    ===================================================== */

    return {

      success:
        true,

      type:
        normalized.type,

      data:
        normalized

    };

  }

  catch (
    error
  ) {

    const errorMessage =
      error?.message ||
      "Unknown Intent Agent error";


    logger.error(
      `Intent Agent Failed: ${errorMessage}`
    );


    /* =====================================================
       SAFE FALLBACK
    ===================================================== */

    const fallback =
      createDefaultIntent();


    return {

      success:
        false,

      type:
        fallback.type,

      data:
        fallback,

      error:
        errorMessage

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  intentAgent;
