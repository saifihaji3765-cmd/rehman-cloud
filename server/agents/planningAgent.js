/* =========================================================
   ZyrionOS PLANNING AGENT
   Intent → Planning → Builder Contract
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
   SAFE JSON PARSER
========================= */

function safeJsonParse(
  value
) {

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
            .slice(0, 1000);

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
       blindly to OpenAI.
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
       OPENAI CONFIGURATION
    ===================================================== */

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return {

        success: false,

        message:
          "Planning Agent configuration error",

        error:
          "OPENAI_API_KEY is not configured on the backend."

      };

    }


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
       * should be forwarded.
       *
       * Do not expose tokens, cookies,
       * passwords, or credentials.
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
      "openai-planning";


    const completion =
      await openai
        .chat
        .completions
        .create({

          model:
            "gpt-4.1-mini",

          response_format: {

            type:
              "json_object"

          },

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
tokens, passwords, or deployment results.

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

          max_tokens:
            3000

        });


    /* =====================================================
       RAW RESPONSE
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

      return {

        success: false,

        message:
          "Planning Agent received an empty AI response",

        error:
          "OpenAI returned no planning content.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       PARSE JSON
    ===================================================== */

    currentStage =
      "planning-json-parse";


    const parsed =
      safeJsonParse(
        raw
      );


    if (!parsed) {

      logger.warning(
        "Planning Agent JSON Parse Failed"
      );


      return {

        success: false,

        message:
          "Invalid AI JSON response",

        error:
          "Planning Agent could not parse the AI planning response.",

        stage:
          currentStage

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
          currentStage

      };

    }


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(
      `Planning Agent Completed: ${normalizedPlan.projectName}`
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
          "gpt-4.1-mini",

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
