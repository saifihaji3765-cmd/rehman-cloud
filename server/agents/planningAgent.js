/* =========================================================
   ZYRIONOS PLANNING AGENT
   Intent → Planning → Builder Contract

   AI PROVIDER ARCHITECTURE:

   Planning Agent
        ↓
   Central AI Provider Service
        ↓
   Gemini ONLY
        ↓
   Gemini 3.8 Flash
        ↓ transient failure
   Gemini 3.7 Flash
        ↓ transient failure
   Gemini 3.6 Flash

   OpenAI:
   - NOT USED
   - NOT CALLED
   - TEMPORARILY DISABLED
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
   VALID INTENTS
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


/* =========================================================
   SAFE STRING
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
    .slice(0, maxLength);

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
        "Unable to serialize planning context"

    });

  }

}


/* =========================================================
   NORMALIZE ARRAY
========================================================= */

function normalizeArray(
  value
) {

  if (
    !Array.isArray(value)
  ) {

    return [];

  }

  return value

    .filter(
      (item) =>
        item !== null &&
        item !== undefined
    )

    .map(
      (item) => {

        if (
          typeof item === "string"
        ) {

          return item
            .trim()
            .slice(0, 1000);

        }

        return item;

      }
    )

    .filter(
      Boolean
    );

}


/* =========================================================
   NORMALIZE OBJECT
========================================================= */

function normalizeObject(
  value
) {

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {

    return {};

  }

  return value;

}


/* =========================================================
   DEFAULT PLAN
========================================================= */

function createDefaultPlan(
  prompt,
  intent
) {

  return {

    projectName:
      "ZyrionOS Project",

    description:
      prompt,

    framework:
      "",

    frontend: {

      framework:
        "",

      pages:
        []

    },

    backend: {

      framework:
        "",

      routes:
        []

    },

    database: {

      type:
        "",

      collections:
        []

    },

    authentication: {

      providers:
        []

    },

    aiSystems:
      [],

    deployment: {

      provider:
        "",

      services:
        []

    },

    projectStructure:
      [],

    requirements:
      [],

    security:
      [],

    scalability:
      [],

    performance:
      [],

    intent:
      intent?.type ||
      "build"

  };

}


/* =========================================================
   NORMALIZE PLAN
========================================================= */

function normalizePlan(
  parsed,
  prompt,
  intent
) {

  const fallback =
    createDefaultPlan(
      prompt,
      intent
    );


  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {

    return fallback;

  }


  const frontend =
    normalizeObject(
      parsed.frontend
    );


  const backend =
    normalizeObject(
      parsed.backend
    );


  const database =
    normalizeObject(
      parsed.database
    );


  const authentication =
    normalizeObject(
      parsed.authentication
    );


  const deployment =
    normalizeObject(
      parsed.deployment
    );


  const projectName =
    cleanString(
      parsed.projectName,
      200
    );


  const description =
    cleanString(
      parsed.description,
      5000
    );


  const framework =
    cleanString(
      parsed.framework,
      200
    );


  return {

    projectName:
      projectName ||
      fallback.projectName,

    description:
      description ||
      fallback.description,

    framework:
      framework ||
      cleanString(
        frontend.framework,
        200
      ),

    frontend: {

      framework:
        cleanString(
          frontend.framework,
          200
        ),

      pages:
        normalizeArray(
          frontend.pages
        )

    },

    backend: {

      framework:
        cleanString(
          backend.framework,
          200
        ),

      routes:
        normalizeArray(
          backend.routes
        )

    },

    database: {

      type:
        cleanString(
          database.type,
          200
        ),

      collections:
        normalizeArray(
          database.collections
        )

    },

    authentication: {

      providers:
        normalizeArray(
          authentication.providers
        )

    },

    aiSystems:
      normalizeArray(
        parsed.aiSystems
      ),

    deployment: {

      provider:
        cleanString(
          deployment.provider,
          200
        ),

      services:
        normalizeArray(
          deployment.services
        )

    },

    projectStructure:
      normalizeArray(
        parsed.projectStructure
      ),

    requirements:
      normalizeArray(
        parsed.requirements
      ),

    security:
      normalizeArray(
        parsed.security
      ),

    scalability:
      normalizeArray(
        parsed.scalability
      ),

    performance:
      normalizeArray(
        parsed.performance
      ),

    intent:
      intent?.type ||
      "build"

  };

}


/* =========================================================
   PLANNING AGENT
========================================================= */

async function planningAgent(
  data = {}
) {

  let currentStage =
    "input-normalization";


  try {

    logger.info(
      "📐 ZyrionOS Planning Agent Started"
    );


    /* =====================================================
       INPUT CONTRACT
    ===================================================== */

    let projectIdea = "";

    let intent = null;

    let user = {};

    let memoryContext = null;


    if (
      typeof data === "string"
    ) {

      projectIdea =
        cleanString(
          data,
          4000
        );

    }

    else if (
      data &&
      typeof data === "object"
    ) {

      projectIdea =
        cleanString(
          data.prompt,
          4000
        );

      intent =
        data.intent ||
        null;

      user =
        data.user ||
        {};

      memoryContext =
        data.memoryContext ||
        null;

    }


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (
      !projectIdea
    ) {

      return {

        success: false,

        message:
          "Project idea required",

        error:
          "Planning Agent received an empty project prompt.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       INTENT NORMALIZATION
    ===================================================== */

    let normalizedIntent =
      "build";


    if (
      intent &&
      typeof intent === "object"
    ) {

      if (
        typeof intent.type === "string"
      ) {

        const intentType =
          intent.type
            .trim()
            .toLowerCase();


        if (
          VALID_INTENTS.includes(
            intentType
          )
        ) {

          normalizedIntent =
            intentType;

        }

      }

      else if (
        intent.data &&
        typeof intent.data.type === "string"
      ) {

        const intentType =
          intent.data.type
            .trim()
            .toLowerCase();


        if (
          VALID_INTENTS.includes(
            intentType
          )
        ) {

          normalizedIntent =
            intentType;

        }

      }

    }


    /* =====================================================
       INTENT DATA
    ===================================================== */

    const intentData =
      intent?.data ||
      intent ||
      {

        type:
          normalizedIntent

      };


    /* =====================================================
       MEMORY CONTEXT
    ===================================================== */

    let memorySummary =
      "No memory context provided.";


    if (
      memoryContext
    ) {

      memorySummary =
        safeJson(
          memoryContext
        ).slice(
          0,
          4000
        );

    }


    /* =====================================================
       SAFE USER CONTEXT
    ===================================================== */

    let userSummary =
      "No user context provided.";


    if (
      user &&
      typeof user === "object"
    ) {

      const safeUser = {

        id:
          user.id ||
          user._id ||
          undefined,

        role:
          user.role ||
          undefined

      };


      userSummary =
        safeJson(
          safeUser
        ).slice(
          0,
          1500
        );

    }


    /* =====================================================
       AI PLANNING
       -----------------------------------------------------
       IMPORTANT:

       This agent NEVER calls OpenAI directly.

       The centralized provider service is responsible
       for Gemini model selection and Gemini failover.

       Current production chain:

       Gemini 3.8 Flash
            ↓
       Gemini 3.7 Flash
            ↓
       Gemini 3.6 Flash

       OpenAI is intentionally disabled.
    ===================================================== */

    currentStage =
      "ai-planning";


    const result =
      await generateJSON({

        /*
         * Explicitly request Gemini.
         *
         * aiProviderService still controls the actual
         * Gemini model fallback chain.
         */

        provider:
          "gemini",

        /*
         * Do not specify a model here.
         *
         * This allows aiProviderService to use its
         * complete Gemini model fallback chain.
         */

        thinkingLevel:
          "medium",

        maxTokens:
          3000,

        messages: [

          {

            role:
              "system",

            content: `

You are the Planning Agent of ZyrionOS,
an autonomous production AI software system.

Your responsibility is to transform the
user request into an implementation-ready
software architecture plan.

You DO NOT write final source code.

You DO NOT claim that code was created.

You DO NOT claim that deployment happened.

You DO NOT invent infrastructure,
credentials, API keys, URLs, secrets,
external resources, or successful operations.

Your output is consumed by the Builder Agent.

CURRENT INTENT:

${normalizedIntent}

PLANNING OBJECTIVE:

Create a practical production-ready plan
that another engineering agent can directly
use to build the requested system.

For BUILD:
Create the complete implementation plan.

For FIX:
Identify the relevant technical areas,
files/components likely involved, and
required verification steps.

For DEPLOY:
Describe deployment architecture and
requirements without claiming deployment
success.

For MONITOR:
Describe monitoring requirements.

For SCALE:
Describe scalability requirements.

For BILLING or SUBSCRIPTION:
Describe the required application and
financial integration architecture.

For AUTOMATION:
Describe triggers, workflows, workers,
and required integrations.

For INFRASTRUCTURE:
Describe the required infrastructure
architecture.

For THUMBNAIL:
Describe the required generation pipeline.

For FILE:
Describe required file operations.

Return ONLY valid JSON.

NO markdown.

NO explanation outside JSON.

REQUIRED JSON:

{
  "projectName": "",
  "description": "",
  "framework": "",
  "frontend": {
    "framework": "",
    "pages": []
  },
  "backend": {
    "framework": "",
    "routes": []
  },
  "database": {
    "type": "",
    "collections": []
  },
  "authentication": {
    "providers": []
  },
  "aiSystems": [],
  "deployment": {
    "provider": "",
    "services": []
  },
  "projectStructure": [],
  "requirements": [],
  "security": [],
  "scalability": [],
  "performance": []
}

RULES:

1. Keep projectName concise.

2. description must describe the actual
   requested objective.

3. Identify frameworks only when known
   or reasonably required.

4. frontend.pages must contain meaningful
   UI pages/routes when a frontend exists.

5. backend.routes must contain meaningful
   API routes when a backend exists.

6. database.collections must contain actual
   entities required by the project.

7. authentication.providers must contain
   only authentication methods actually
   relevant to the project.

8. aiSystems must contain actual AI components.

9. deployment.services must contain only
   relevant infrastructure services.

10. projectStructure must describe folders
    and important files that Builder should
    create.

11. security must contain concrete security
    requirements.

12. scalability must contain concrete
    scalability requirements.

13. performance must contain concrete
    performance requirements.

14. Do not generate source code.

15. Do not generate fake credentials.

16. Do not generate placeholder secrets.

17. Do not claim resources already exist.

18. Do not claim deployment succeeded.

19. Prefer production architecture over
    toy/demo architecture.

20. Keep every section internally consistent.

`

          },

          {

            role:
              "user",

            content: `

USER REQUEST:

${projectIdea}

DETECTED INTENT:

${safeJson(
  intentData
)}

MEMORY CONTEXT:

${memorySummary}

SAFE USER CONTEXT:

${userSummary}

Create the implementation plan now.

`

          }

        ]

      });


    /* =====================================================
       PROVIDER RESULT VALIDATION
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      const providerError =
        result?.error ||
        "Gemini provider returned an unsuccessful result.";


      logger.error(
        `Planning Agent Gemini Provider Failed: ${providerError}`
      );


      return {

        success: false,

        message:
          "Planning Agent Gemini provider failed",

        error:
          providerError,

        stage:
          currentStage,

        provider:
          result?.provider ||
          "gemini",

        model:
          result?.model ||
          null

      };

    }


    /* =====================================================
       RAW RESPONSE VALIDATION
    ===================================================== */

    const parsed =
      result.data;


    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {

      logger.warning(
        "Planning Agent received invalid structured Gemini response"
      );


      return {

        success: false,

        message:
          "Planning Agent received an invalid AI response",

        error:
          "Gemini returned an invalid planning object.",

        stage:
          currentStage,

        provider:
          result.provider ||
          "gemini",

        model:
          result.model ||
          null

      };

    }


    /* =====================================================
       NORMALIZE PLAN
    ===================================================== */

    currentStage =
      "planning-normalization";


    const normalizedPlan =
      normalizePlan(
        parsed,
        projectIdea,
        intentData
      );


    /* =====================================================
       FINAL VALIDATION
    ===================================================== */

    if (
      !normalizedPlan.projectName
    ) {

      return {

        success: false,

        message:
          "Planning Agent returned an invalid project plan",

        error:
          "projectName is required.",

        stage:
          currentStage,

        provider:
          result.provider ||
          "gemini",

        model:
          result.model ||
          null

      };

    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    logger.success(
      `Planning Agent Completed: ${normalizedPlan.projectName}`
    );


    logger.info(
      `Planning Agent Provider: ${result.provider || "gemini"}`
    );


    logger.info(
      `Planning Agent Model: ${result.model || "unknown"}`
    );


    /* =====================================================
       RESPONSE
    ===================================================== */

    return {

      success: true,

      data:
        normalizedPlan,

      metadata: {

        model:
          result.model ||
          null,

        provider:
          result.provider ||
          "gemini",

        agent:
          "planningAgent",

        intent:
          normalizedPlan.intent,

        generatedAt:
          new Date()

      }

    };

  }

  catch (
    error
  ) {

    const errorMessage =
      error?.message ||
      "Unknown Planning Agent error";


    logger.error(
      `Planning Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success: false,

      message:
        "Planning Agent Failed",

      error:
        errorMessage,

      stage:
        currentStage,

      provider:
        "gemini",

      model:
        error?.model ||
        null

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  planningAgent;
