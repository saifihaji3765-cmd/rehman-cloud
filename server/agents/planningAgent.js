/* =========================================================
   ZyrionOS PLANNING AGENT
   Intent → Planning → Builder Contract

   AI PROVIDER ARCHITECTURE:
   Planning Agent
        ↓
   aiProviderService
        ↓
   Primary Provider (Gemini)
        ↓
   Fallback Provider (OpenAI)
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
   SAFE JSON SERIALIZER
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
        "Unable to serialize planning context"

    });

  }

}


/* =========================
   NORMALIZE ARRAY
========================= */

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
            .slice(
              0,
              1000
            );

        }


        return item;

      }
    )

    .filter(Boolean);

}


/* =========================
   NORMALIZE OBJECT
========================= */

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


/* =========================
   DEFAULT PLAN
========================= */

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
      "chat"

  };

}


/* =========================
   NORMALIZE PLAN
========================= */

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

    /*
     * Top-level framework is deliberately
     * preserved because downstream agents
     * such as Builder and Deploy can use it.
     */

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
      "chat"

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

       Master sends:

       {
         prompt,
         intent,
         user,
         memoryContext
       }

       We extract the actual user prompt
       instead of passing the entire wrapper
       blindly to the AI provider.
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

    if (!projectIdea) {

      return {

        success: false,

        message:
          "Project idea required",

        error:
          "Planning Agent received an empty project prompt."

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
        typeof intent.type ===
        "string"
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
        typeof intent.data.type ===
        "string"
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


    if (memoryContext) {

      memorySummary =
        safeJson(
          memoryContext
        )
          .slice(
            0,
            4000
          );

    }


    /* =====================================================
       USER CONTEXT
    ===================================================== */

    let userSummary =
      "No user context provided.";


    if (
      user &&
      typeof user === "object"
    ) {

      /*
       * Only non-sensitive planning context
       * is forwarded.
       *
       * Never expose:
       * - passwords
       * - API keys
       * - access tokens
       * - refresh tokens
       * - cookies
       * - payment secrets
       * - credentials
       */

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
        )
          .slice(
            0,
            1500
          );

    }


    /* =====================================================
       AI PLANNING
    ===================================================== */

    currentStage =
      "ai-planning";


    /*
     * IMPORTANT:
     *
     * No direct OpenAI client.
     * No direct Gemini client.
     *
     * Provider selection is centralized inside:
     *
     * server/services/ai/aiProviderService.js
     *
     * Expected flow:
     *
     * Gemini primary
     *      ↓
     * OpenAI fallback
     *
     * according to environment configuration.
     */

    const result =
      await generateJSON({

        messages: [

          {

            role:
              "system",

            content: `

You are the Planning Agent of ZyrionOS
Autonomous AI OS.

Your responsibility is to transform a
user request and detected intent into a
clear, implementation-ready project plan.

You DO NOT write the final source code.

You DO NOT claim that a project was built.

You DO NOT claim that deployment happened.

You create the structured plan that the
Builder Agent will consume next.

Your plan must be practical, internally
consistent, secure, scalable, and suitable
for a real software project.

CURRENT INTENT:

${normalizedIntent}

IMPORTANT:

The current intent is the primary signal.

For a BUILD request, create an implementation
plan for the Builder Agent.

For a DEPLOY request, describe the project
and deployment requirements but do not claim
deployment success.

For a FIX request, describe the likely
technical areas that need investigation.

For MONITOR/SCALE/BILLING/SUBSCRIPTION/
FILE/AUTOMATION/INFRASTRUCTURE/THUMBNAIL
requests, create only the planning context
needed by downstream systems.

Do not invent credentials, API keys,
tokens, passwords, deployment results,
URLs, infrastructure resources, or external
services that were not requested or provided.

Return ONLY valid JSON.

REQUIRED JSON STRUCTURE:

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

1. projectName must be concise.

2. description must explain the actual goal.

3. framework should identify the primary
   application framework when known.

4. frontend.framework should contain the
   frontend technology when applicable.

5. backend.framework should contain the
   backend technology when applicable.

6. pages must contain meaningful page/route
   planning information.

7. routes must contain meaningful API route
   planning information.

8. database.collections must contain the
   required data entities when a database
   is needed.

9. authentication.providers must contain
   only authentication methods relevant to
   the request.

10. aiSystems must contain actual AI
    components required by the project.

11. deployment.services must contain
    infrastructure services that are actually
    relevant.

12. projectStructure must describe folders
    and important files the Builder should
    create.

13. security must describe concrete security
    requirements.

14. scalability must describe concrete
    scalability requirements.

15. performance must describe concrete
    performance requirements.

16. Do not generate source code in this plan.

17. Do not invent unavailable external
    resources.

18. Keep the plan internally consistent.

19. Return JSON only.

20. No markdown.

21. No explanation outside JSON.

22. Do not claim that any resource has
    already been created.

23. Do not claim that any deployment has
    already succeeded.

24. Prefer production-ready architecture
    over toy/demo architecture.

25. Do not include placeholder credentials
    or fake secrets.

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

        ],

        temperature:
          0.3,

        maxTokens:
          3000

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
        "AI provider returned an unsuccessful result.";


      logger.error(
        `Planning Agent AI Provider Failed: ${providerError}`
      );


      return {

        success: false,

        message:
          "Planning Agent AI provider failed",

        error:
          providerError,

        stage:
          currentStage,

        provider:
          result?.provider ||
          null,

        model:
          result?.model ||
          null

      };

    }


    /* =====================================================
       RAW RESPONSE
    ===================================================== */

    const parsed =
      result.data;


    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {

      logger.warning(
        "Planning Agent received invalid structured AI response"
      );


      return {

        success: false,

        message:
          "Planning Agent received an invalid AI response",

        error:
          "AI provider returned an invalid planning object.",

        stage:
          currentStage,

        provider:
          result.provider ||
          null,

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
          null,

        model:
          result.model ||
          null

      };

    }


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(
      `Planning Agent Completed: ${normalizedPlan.projectName}`
    );


    logger.info(
      `Planning Agent Provider: ${result.provider || "unknown"}`
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
          null,

        agent:
          "planningAgent",

        intent:
          normalizedPlan.intent,

        generatedAt:
          new Date()

      }

    };

  }

  catch (error) {

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
        currentStage

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  planningAgent;
