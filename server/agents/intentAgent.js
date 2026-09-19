/* =========================================================
   ZYRIONOS INTENT AGENT
   ---------------------------------------------------------
   Purpose:
   - Classify the CURRENT user request
   - Gemini-only production AI
   - No OpenAI routing
   - No execution
   - No code generation
   - No deployment claims
   ========================================================= */


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");

const {
  generateJSON
} =
  require("../services/ai/aiProviderService");


/* =========================================================
   CONSTANTS
========================================================= */

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


const VALID_COMPLEXITIES = [

  "low",
  "medium",
  "high"

];


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


/* =========================================================
   SAFE JSON
========================================================= */

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      value ?? null
    );

  }

  catch (
    error
  ) {

    return JSON.stringify({

      error:
        "Unable to serialize context"

    });

  }

}


/* =========================================================
   DEFAULT INTENT
========================================================= */

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


/* =========================================================
   FALLBACK AGENTS
========================================================= */

function getFallbackAgents(
  type
) {

  switch (
    type
  ) {

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


/* =========================================================
   NORMALIZE REQUIRED AGENTS
========================================================= */

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
            typeof agent === "string"
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


/* =========================================================
   NORMALIZE CONFIDENCE
========================================================= */

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


  return Math.max(
    0,
    Math.min(
      100,
      confidence
    )
  );

}


/* =========================================================
   NORMALIZE INTENT
========================================================= */

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
the CURRENT user request.

You do NOT execute actions.

You do NOT generate project code.

You do NOT deploy infrastructure.

You do NOT claim that anything succeeded.

You must classify ONLY the current request.

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

- intentAgent
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
conversation, or advice.

build:
Create, generate, develop, or modify
software, applications, websites,
frontend, backend, APIs, features,
or source code.

deploy:
Deploy, publish, host, release,
or make an existing project live.

monitor:
Inspect deployment health, runtime
health, CPU, RAM, availability,
service health, or infrastructure metrics.

scale:
Increase or decrease infrastructure
or application capacity.

billing:
Pricing, charges, invoices,
billing information, or payment charges.

subscription:
Plans, limits, subscription status,
subscription features, upgrades,
downgrades, cancellation, or lifecycle.

fix:
Debug, repair, diagnose, optimize,
or correct broken code or software.

file:
Read, inspect, create, modify, save,
delete, or manage project files.

automation:
Create or reason about automated
workflows or repeated software processes.

infrastructure:
Cloud architecture, containers,
networking, servers, databases,
AWS resources, or infrastructure planning.

thumbnail:
Specifically create or generate a thumbnail.

CLASSIFICATION RULES:

1. Classify ONLY the CURRENT request.

2. Current explicit instructions have
   priority over memory/context.

3. Memory is contextual information only.

4. If the user asks to build software,
   use "build".

5. If the user asks to fix broken code,
   use "fix".

6. If the user asks to deploy an existing
   project, use "deploy".

7. If the user asks about runtime health,
   use "monitor".

8. If the user asks to increase or decrease
   capacity, use "scale".

9. Pricing, charges and invoices:
   use "billing".

10. Subscription plans, limits and lifecycle:
    use "subscription".

11. Direct file operations:
    use "file".

12. Cloud architecture or cloud resources:
    use "infrastructure".

13. Automated workflows:
    use "automation".

14. Thumbnail generation:
    use "thumbnail".

15. If uncertain:
    use "chat".

complexity MUST be one of:

"low"
"medium"
"high"

confidence MUST be a number from 0 to 100.

requiredAgents MUST be an array.

Only use names from CONNECTED AGENTS.

Do not invent agent names.

Return JSON only.

No markdown.

No explanation outside JSON.

REQUIRED JSON:

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
       INPUT
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
       GEMINI REQUEST
       -----------------------------------------------------
       IMPORTANT:
       Do NOT send temperature.
       Gemini 3.x provider service handles
       its own thinking configuration.
    ===================================================== */

    const result =
      await generateJSON({

        provider:
          "gemini",

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

Classify ONLY the current request.

`

          }

        ],

        maxTokens:
          1000,

        thinkingLevel:
          "low"

      });


    /* =====================================================
       PROVIDER VALIDATION
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      throw new Error(
        "Gemini provider returned an unsuccessful result"
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
        "Gemini Intent Agent returned invalid structured data"
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
       RESPONSE
    ===================================================== */

    return {

      success:
        true,

      type:
        normalized.type,

      data:
        normalized,

      provider:
        result.provider,

      model:
        result.model

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
