/* =========================================================
   ZyrionOS INTENT AGENT
   Intent Classification & Agent Routing
========================================================= */


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
   OPENAI CLIENT
========================= */

const openai =
  new OpenAI({

    apiKey:
      process.env.OPENAI_API_KEY

  });


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

   These names represent agents
   currently connected to the
   ZyrionOS Master Agent.
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

function safeJson(value) {

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
   SAFE JSON PARSE
========================= */

function safeJsonParse(value) {

  if (
    !value ||
    typeof value !== "string"
  ) {

    return null;

  }


  try {

    return JSON.parse(
      value.trim()
    );

  }

  catch (error) {

    try {

      const cleaned =
        value
          .replace(
            /```json/gi,
            ""
          )
          .replace(
            /```/g,
            ""
          )
          .trim();


      return JSON.parse(
        cleaned
      );

    }

    catch (secondError) {

      return null;

    }

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


    /*
     * There is currently no dedicated
     * automation agent imported by the
     * Master Agent.
     *
     * Planner can still understand and
     * structure the request.
     */

    case "automation":

      return [

        "plannerAgent"

      ];


    /*
     * Infrastructure requests can be
     * planned first.
     *
     * We do not falsely claim that a
     * dedicated infrastructureAgent exists.
     */

    case "infrastructure":

      return [

        "plannerAgent"

      ];


    /*
     * There is currently no dedicated
     * thumbnailAgent imported by Master.
     *
     * Therefore we intentionally return
     * no fake agent dependency.
     */

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
    Array.isArray(agents)
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


  /*
   * If AI did not return any
   * usable connected agents,
   * use deterministic routing.
   */

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
    Number(value);


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
    Array.isArray(parsed)
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


  if (!goal) {

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

    if (!prompt) {

      return {

        success: false,

        message:
          "Prompt required",

        type:
          "chat",

        data:
          createDefaultIntent()

      };

    }


    /* =====================================================
       OPENAI CONFIGURATION
    ===================================================== */

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return {

        success: false,

        message:
          "Intent Agent configuration error",

        type:
          "chat",

        data:
          createDefaultIntent(),

        error:
          "OPENAI_API_KEY is not configured on the backend."

      };

    }


    /* =====================================================
       MEMORY SUMMARY

       Memory is only contextual information.
       It must never override the current
       explicit user request.
    ===================================================== */

    let memorySummary =
      "";


    if (memoryContext) {

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
       AI INTENT ANALYSIS
    ===================================================== */

    const completion =
      await openai
        .chat
        .completions
        .create({

          model:
            "gpt-4.1-mini",

          temperature:
            0.1,

          response_format: {

            type:
              "json_object"

          },

          messages: [

            {

              role:
                "system",

              content: `

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

- Classify the CURRENT prompt.
- Current explicit instructions have
  priority over memory/context.
- Do not invent unsupported intents.
- If the user asks to build software,
  classify as "build".
- If the user asks to fix broken code,
  classify as "fix".
- If the user asks to deploy an existing
  project, classify as "deploy".
- If uncertain, use "chat".
- complexity must be:
  "low", "medium", or "high".
- confidence must be a number from 0-100.
- requiredAgents must be an array.
- Only use names from CONNECTED AGENTS.
- Do not invent agent names.
- Return JSON only.
- No markdown.
- No explanation outside JSON.

REQUIRED JSON FORMAT:

{
  "type": "",
  "goal": "",
  "complexity": "",
  "confidence": 0,
  "requiredAgents": []
}

`

            },

            {

              role:
                "user",

              content: `

CURRENT USER REQUEST:

${prompt}

OPTIONAL MEMORY CONTEXT:

${memorySummary || "No memory context provided."}

Classify only the current request.

`

            }

          ]

        });


    /* =====================================================
       RESPONSE EXTRACTION
    ===================================================== */

    const raw =
      completion
        ?.choices?.[0]
        ?.message
        ?.content;


    if (
      !raw ||
      typeof raw !== "string"
    ) {

      logger.warning(
        "Intent Agent received empty AI response"
      );


      const fallback =
        createDefaultIntent();


      return {

        success: false,

        message:
          "Intent AI returned an empty response",

        type:
          fallback.type,

        data:
          fallback

      };

    }


    /* =====================================================
       JSON PARSING
    ===================================================== */

    const parsed =
      safeJsonParse(
        raw
      );


    if (!parsed) {

      logger.warning(
        "Intent JSON Parse Failed"
      );


      const fallback =
        createDefaultIntent();


      return {

        success: false,

        message:
          "Intent response could not be parsed",

        type:
          fallback.type,

        data:
          fallback

      };

    }


    /* =====================================================
       NORMALIZATION
    ===================================================== */

    const normalized =
      normalizeIntent(
        parsed
      );


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(
      `Intent Detected: ${normalized.type} | Confidence: ${normalized.confidence}%`
    );


    /* =====================================================
       RESPONSE CONTRACT

       Master Agent uses:
       result.type

       Planning Agent can use:
       result.data
    ===================================================== */

    return {

      success: true,

      type:
        normalized.type,

      data:
        normalized

    };

  }

  catch (error) {

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

      success: false,

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
