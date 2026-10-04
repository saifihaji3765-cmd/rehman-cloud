/* =========================================================
   ZYRIONOS PLANNING AGENT
   ---------------------------------------------------------
   VERSION:
   3.0.0

   ROLE:
   Intent → Requirement Analysis → Proportional
   Implementation Blueprint → Builder Contract

   CORE PRINCIPLE:

       USER REQUEST
            ↓
       REQUIREMENT SCOPE
            ↓
       PROJECT SCALE
            ↓
       COMPLEXITY
            ↓
       ONLY REQUIRED MODULES
            ↓
       ONLY REQUIRED DEPENDENCIES
            ↓
       IMPLEMENTATION PLAN
            ↓
       BUILDER

   IMPORTANT:

   The Planning Agent MUST NOT inflate a simple request
   into an enterprise architecture.

   Example:

   "Build a counter app"

   MUST NOT automatically create:

   - authentication
   - database
   - payment
   - AI
   - queues
   - microservices
   - monitoring
   - scaling architecture
   - multiple implementation phases

   Unless the user explicitly requires them.

   DOES NOT:

   - Generate source code
   - Generate final file contents
   - Execute tools
   - Deploy infrastructure
   - Create credentials
   - Claim deployment success
   - Directly select an AI provider

   PROVIDER ARCHITECTURE:

       Planning Agent
             ↓
       aiProviderService
             ↓
       Central provider routing
             ↓
       Active configured providers

   No provider is hardcoded here.
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
   VERSION
========================================================= */

const PLANNING_AGENT_VERSION =
  "3.0.0";


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
   VALID COMPLEXITIES
========================================================= */

const VALID_COMPLEXITIES = [

  "low",
  "medium",
  "high"

];


/* =========================================================
   VALID PROJECT SCALES
========================================================= */

const VALID_PROJECT_SCALES = [

  "none",
  "task",
  "feature",
  "application",
  "large_project",
  "system"

];


/* =========================================================
   LIMITS
========================================================= */

const MAX_PROMPT_LENGTH =
  12000;

const MAX_MEMORY_LENGTH =
  4000;

const MAX_USER_CONTEXT_LENGTH =
  1500;

const MAX_PROJECT_NAME_LENGTH =
  200;

const MAX_DESCRIPTION_LENGTH =
  6000;

const MAX_FRAMEWORK_LENGTH =
  200;

const MAX_STRING_ITEM_LENGTH =
  1000;


/* =========================================================
   GLOBAL SAFETY LIMITS
========================================================= */

const MAX_MODULES =
  100;

const MAX_PHASES =
  100;

const MAX_DEPENDENCIES =
  300;

const MAX_ACCEPTANCE_CRITERIA =
  200;

const MAX_RISKS =
  100;


/* =========================================================
   SCOPE LIMITS
   ---------------------------------------------------------
   These are intentionally proportional.

   A simple task should NEVER receive the same
   architectural budget as a large system.
========================================================= */

const SCOPE_LIMITS = {

  none: {

    modules:
      0,

    phases:
      0,

    dependencies:
      0,

    acceptanceCriteria:
      10,

    projectStructure:
      30

  },


  task: {

    modules:
      3,

    phases:
      1,

    dependencies:
      5,

    acceptanceCriteria:
      10,

    projectStructure:
      30

  },


  feature: {

    modules:
      8,

    phases:
      2,

    dependencies:
      15,

    acceptanceCriteria:
      20,

    projectStructure:
      60

  },


  application: {

    modules:
      20,

    phases:
      6,

    dependencies:
      50,

    acceptanceCriteria:
      50,

    projectStructure:
      150

  },


  large_project: {

    modules:
      60,

    phases:
      20,

    dependencies:
      150,

    acceptanceCriteria:
      100,

    projectStructure:
      500

  },


  system: {

    modules:
      100,

    phases:
      100,

    dependencies:
      300,

    acceptanceCriteria:
      200,

    projectStructure:
      1000

  }

};


/* =========================================================
   COMPLEXITY WEIGHTS
========================================================= */

const COMPLEXITY_RANK = {

  low:
    1,

  medium:
    2,

  high:
    3

};


/* =========================================================
   SCALE RANK
========================================================= */

const SCALE_RANK = {

  none:
    0,

  task:
    1,

  feature:
    2,

  application:
    3,

  large_project:
    4,

  system:
    5

};


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

    .replace(
      /\u0000/g,
      ""
    )

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
        "Unable to serialize planning context"

    });

  }

}


/* =========================================================
   NORMALIZE STRING ARRAY
========================================================= */

function normalizeStringArray(
  value,
  maxItems = 100,
  maxItemLength = MAX_STRING_ITEM_LENGTH
) {

  if (
    !Array.isArray(value)
  ) {

    return [];

  }


  const result = [];

  const seen =
    new Set();


  for (
    const item of value
  ) {

    if (
      typeof item !== "string"
    ) {

      continue;

    }


    const normalized =
      cleanString(
        item,
        maxItemLength
      );


    if (
      !normalized
    ) {

      continue;

    }


    const key =
      normalized.toLowerCase();


    if (
      seen.has(key)
    ) {

      continue;

    }


    seen.add(key);

    result.push(
      normalized
    );


    if (
      result.length >=
      maxItems
    ) {

      break;

    }

  }


  return result;

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
   NORMALIZE UNIQUE STRINGS
========================================================= */

function uniqueStrings(
  values,
  maxItems = 100
) {

  return normalizeStringArray(
    values,
    maxItems
  );

}


/* =========================================================
   NORMALIZE SIMPLE OBJECT LIST
========================================================= */

function normalizeObjectList(
  value,
  maxItems,
  normalizer
) {

  if (
    !Array.isArray(value)
  ) {

    return [];

  }


  const result = [];


  for (
    let index = 0;
    index < value.length;
    index++
  ) {

    const item =
      value[index];


    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {

      continue;

    }


    const normalized =
      normalizer(
        item,
        index
      );


    if (
      normalized
    ) {

      result.push(
        normalized
      );

    }


    if (
      result.length >=
      maxItems
    ) {

      break;

    }

  }


  return result;

}


/* =========================================================
   PROJECT SCALE NORMALIZATION
========================================================= */

function normalizeProjectScale(
  value
) {

  const scale =
    cleanString(
      value,
      100
    )
      .toLowerCase();


  if (
    VALID_PROJECT_SCALES.includes(
      scale
    )
  ) {

    return scale;

  }


  return "application";

}


/* =========================================================
   COMPLEXITY NORMALIZATION
========================================================= */

function normalizeComplexity(
  value
) {

  const complexity =
    cleanString(
      value,
      100
    )
      .toLowerCase();


  if (
    VALID_COMPLEXITIES.includes(
      complexity
    )
  ) {

    return complexity;

  }


  return "medium";

}


/* =========================================================
   CLAMP SCALE
========================================================= */

function clampScale(
  requestedScale,
  allowedScale
) {

  const requestedRank =
    SCALE_RANK[
      requestedScale
    ] ??
    SCALE_RANK.application;


  const allowedRank =
    SCALE_RANK[
      allowedScale
    ] ??
    SCALE_RANK.application;


  if (
    requestedRank >
    allowedRank
  ) {

    return allowedScale;

  }


  return requestedScale;

}


/* =========================================================
   SCOPE LIMIT
========================================================= */

function getScopeLimits(
  projectScale
) {

  return (
    SCOPE_LIMITS[
      projectScale
    ] ||
    SCOPE_LIMITS.application
  );

}


/* =========================================================
   DEFAULT PLAN
========================================================= */

function createDefaultPlan(
  prompt,
  intent
) {

  const intentType =
    intent?.type ||
    "build";


  return {

    planVersion:
      3,

    agentVersion:
      PLANNING_AGENT_VERSION,

    projectName:
      "ZyrionOS Project",

    description:
      cleanString(
        prompt,
        MAX_DESCRIPTION_LENGTH
      ),

    framework:
      "",

    projectScale:
      "application",

    complexity:
      "medium",

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

    modules:
      [],

    dependencies:
      [],

    implementationPhases:
      [],

    acceptanceCriteria:
      [],

    environmentRequirements:
      [],

    validationStrategy:
      [],

    risks:
      [],

    explicitNonGoals:
      [],

    assumptions:
      [],

    buildStrategy: {

      mode:
        "dependency-aware",

      batchSize:
        3,

      generateByDependency:
        true,

      validateAfterEachBatch:
        true,

      runFinalValidation:
        true

    },

    intent:
      intentType

  };

}


/* =========================================================
   NORMALIZE MODULE
========================================================= */

function normalizeModule(
  module
) {

  const value =
    normalizeObject(
      module
    );


  const id =
    cleanString(
      value.id,
      100
    );


  const name =
    cleanString(
      value.name,
      200
    );


  if (
    !id &&
    !name
  ) {

    return null;

  }


  const normalizedId =
    (
      id ||
      name
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          ""
        )
    )
      .slice(
        0,
        100
      );


  return {

    id:
      normalizedId,

    name:
      name ||
      id,

    purpose:
      cleanString(
        value.purpose,
        1200
      ),

    type:
      cleanString(
        value.type,
        100
      ),

    responsibilities:
      uniqueStrings(
        value.responsibilities,
        30
      ),

    files:
      uniqueStrings(
        value.files,
        100
      ),

    dependencies:
      uniqueStrings(
        value.dependencies,
        50
      ),

    exports:
      uniqueStrings(
        value.exports,
        100
      ),

    inputs:
      uniqueStrings(
        value.inputs,
        50
      ),

    outputs:
      uniqueStrings(
        value.outputs,
        50
      )

  };

}


/* =========================================================
   NORMALIZE DEPENDENCY
========================================================= */

function normalizeDependency(
  dependency
) {

  const value =
    normalizeObject(
      dependency
    );


  const from =
    cleanString(
      value.from,
      200
    );


  const to =
    cleanString(
      value.to,
      200
    );


  if (
    !from ||
    !to
  ) {

    return null;

  }


  if (
    from === to
  ) {

    return null;

  }


  return {

    from,

    to,

    type:
      cleanString(
        value.type,
        100
      ) ||
      "runtime",

    reason:
      cleanString(
        value.reason,
        1000
      )

  };

}


/* =========================================================
   NORMALIZE IMPLEMENTATION PHASE
========================================================= */

function normalizeImplementationPhase(
  phase,
  index
) {

  const value =
    normalizeObject(
      phase
    );


  const id =
    cleanString(
      value.id,
      100
    ) ||
    `phase-${index + 1}`;


  const name =
    cleanString(
      value.name,
      200
    );


  if (
    !name
  ) {

    return null;

  }


  const order =
    Number(
      value.order
    );


  return {

    id,

    name,

    purpose:
      cleanString(
        value.purpose,
        1200
      ),

    order:
      Number.isFinite(
        order
      )
        ? order
        : index + 1,

    modules:
      uniqueStrings(
        value.modules,
        50
      ),

    dependencies:
      uniqueStrings(
        value.dependencies,
        50
      ),

    prerequisites:
      uniqueStrings(
        value.prerequisites,
        50
      ),

    validation:
      uniqueStrings(
        value.validation,
        50
      )

  };

}


/* =========================================================
   NORMALIZE ACCEPTANCE CRITERION
========================================================= */

function normalizeAcceptanceCriterion(
  criterion,
  index
) {

  if (
    typeof criterion ===
    "string"
  ) {

    const description =
      cleanString(
        criterion,
        1200
      );


    if (
      !description
    ) {

      return null;

    }


    return {

      id:
        `AC-${index + 1}`,

      description,

      priority:
        "required",

      verification:
        ""

    };

  }


  const value =
    normalizeObject(
      criterion
    );


  const description =
    cleanString(
      value.description,
      1200
    );


  if (
    !description
  ) {

    return null;

  }


  return {

    id:
      cleanString(
        value.id,
        100
      ) ||
      `AC-${index + 1}`,

    description,

    priority:
      cleanString(
        value.priority,
        50
      ) ||
      "required",

    verification:
      cleanString(
        value.verification,
        1000
      )

  };

}


/* =========================================================
   NORMALIZE RISK
========================================================= */

function normalizeRisk(
  risk,
  index
) {

  if (
    typeof risk ===
    "string"
  ) {

    const description =
      cleanString(
        risk,
        1200
      );


    if (
      !description
    ) {

      return null;

    }


    return {

      id:
        `RISK-${index + 1}`,

      description,

      mitigation:
        "",

      severity:
        "medium"

    };

  }


  const value =
    normalizeObject(
      risk
    );


  const description =
    cleanString(
      value.description,
      1200
    );


  if (
    !description
  ) {

    return null;

  }


  return {

    id:
      cleanString(
        value.id,
        100
      ) ||
      `RISK-${index + 1}`,

    description,

    mitigation:
      cleanString(
        value.mitigation,
        1200
      ),

    severity:
      cleanString(
        value.severity,
        50
      ) ||
      "medium"

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


  /*
   * -------------------------------------------------------
   * FIRST:
   * Determine the actual allowed project scope.
   * -------------------------------------------------------
   */

  const aiScale =
    normalizeProjectScale(
      parsed.projectScale
    );


  const intentScale =
    normalizeProjectScale(
      intent?.projectScale
    );


  /*
   * Intent is stronger than an arbitrary model guess.
   *
   * If Intent Agent has already classified a request
   * as task/feature/application/etc., Planning respects
   * that classification.
   */

  let projectScale =
    intentScale !==
      "application" ||
    !parsed.projectScale
      ? intentScale
      : aiScale;


  /*
   * If AI tried to inflate the project beyond the
   * request's known intent, clamp it.
   */

  if (
    intentScale &&
    SCALE_RANK[
      projectScale
    ] >
    SCALE_RANK[
      intentScale
    ]
  ) {

    projectScale =
      intentScale;

  }


  /*
   * Direct build requests without Intent Agent:
   *
   * application is the safe default.
   */

  if (
    !VALID_PROJECT_SCALES.includes(
      projectScale
    )
  ) {

    projectScale =
      "application";

  }


  const scope =
    getScopeLimits(
      projectScale
    );


  /* =====================================================
     BASIC OBJECTS
  ===================================================== */

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


  const buildStrategy =
    normalizeObject(
      parsed.buildStrategy
    );


  /* =====================================================
     COMPLEXITY
  ===================================================== */

  let complexity =
    normalizeComplexity(
      parsed.complexity
    );


  /*
   * Never allow a low-scope request to become high
   * complexity just because the AI wrote "high".
   */

  if (
    projectScale ===
    "none" ||
    projectScale ===
    "task"
  ) {

    complexity =
      "low";

  }


  else if (
    projectScale ===
    "feature"
  ) {

    if (
      COMPLEXITY_RANK[
        complexity
      ] >
      COMPLEXITY_RANK.medium
    ) {

      complexity =
        "medium";

    }

  }


  else if (
    projectScale ===
    "large_project" ||
    projectScale ===
    "system"
  ) {

    complexity =
      "high";

  }


  /* =====================================================
     BASIC PROJECT FIELDS
  ===================================================== */

  const projectName =
    cleanString(
      parsed.projectName,
      MAX_PROJECT_NAME_LENGTH
    );


  const description =
    cleanString(
      parsed.description,
      MAX_DESCRIPTION_LENGTH
    );


  const framework =
    cleanString(
      parsed.framework,
      MAX_FRAMEWORK_LENGTH
    );


  /* =====================================================
     NORMALIZE MODULES
  ===================================================== */

  const modules =
    normalizeObjectList(
      parsed.modules,
      Math.min(
        MAX_MODULES,
        scope.modules
      ),
      normalizeModule
    );


  /* =====================================================
     NORMALIZE DEPENDENCIES
  ===================================================== */

  const dependencies =
    normalizeObjectList(
      parsed.dependencies,
      Math.min(
        MAX_DEPENDENCIES,
        scope.dependencies
      ),
      normalizeDependency
    );


  /* =====================================================
     NORMALIZE PHASES
  ===================================================== */

  const implementationPhases =
    normalizeObjectList(
      parsed.implementationPhases,
      Math.min(
        MAX_PHASES,
        scope.phases
      ),
      normalizeImplementationPhase
    );


  /* =====================================================
     ACCEPTANCE CRITERIA
  ===================================================== */

  const rawAcceptance =
    Array.isArray(
      parsed.acceptanceCriteria
    )
      ? parsed.acceptanceCriteria
      : [];


  const acceptanceCriteria =
    rawAcceptance

      .map(
        (
          item,
          index
        ) =>
          normalizeAcceptanceCriterion(
            item,
            index
          )
      )

      .filter(Boolean)

      .slice(
        0,
        Math.min(
          MAX_ACCEPTANCE_CRITERIA,
          scope.acceptanceCriteria
        )
      );


  /* =====================================================
     RISKS
  ===================================================== */

  const rawRisks =
    Array.isArray(
      parsed.risks
    )
      ? parsed.risks
      : [];


  const risks =
    rawRisks

      .map(
        (
          item,
          index
        ) =>
          normalizeRisk(
            item,
            index
          )
      )

      .filter(Boolean)

      .slice(
        0,
        MAX_RISKS
      );


  /* =====================================================
     PROJECT STRUCTURE
  ===================================================== */

  const projectStructure =
    normalizeStringArray(
      parsed.projectStructure,
      Math.min(
        1000,
        scope.projectStructure
      )
    );


  /* =====================================================
     REQUIREMENTS
  ===================================================== */

  const requirements =
    normalizeStringArray(
      parsed.requirements,
      scope.acceptanceCriteria * 2
    );


  /* =====================================================
     BUILD STRATEGY
  ===================================================== */

  const requestedBatchSize =
    Number(
      buildStrategy.batchSize
    );


  const batchSize =
    Number.isFinite(
      requestedBatchSize
    )
      ? Math.max(
          1,
          Math.min(
            10,
            Math.floor(
              requestedBatchSize
            )
          )
        )
      : 3;


  /* =====================================================
     SIMPLE PROJECT RULE
     -----------------------------------------------------
     These fields must remain empty unless the user
     actually needs them.
  ===================================================== */

  const normalizedDatabaseType =
    cleanString(
      database.type,
      MAX_FRAMEWORK_LENGTH
    );


  const normalizedAuthProviders =
    normalizeStringArray(
      authentication.providers,
      10
    );


  const normalizedAiSystems =
    normalizeStringArray(
      parsed.aiSystems,
      10
    );


  const normalizedDeploymentProvider =
    cleanString(
      deployment.provider,
      MAX_FRAMEWORK_LENGTH
    );


  /*
   * If the request is a small task and AI hallucinated
   * infrastructure, remove it.
   */

  const isMinimalScope =
    projectScale ===
      "none" ||
    projectScale ===
      "task";


  const isFeatureScope =
    projectScale ===
    "feature";


  return {

    planVersion:
      3,

    agentVersion:
      PLANNING_AGENT_VERSION,

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
        MAX_FRAMEWORK_LENGTH
      ),

    projectScale,

    complexity,

    frontend: {

      framework:
        cleanString(
          frontend.framework,
          MAX_FRAMEWORK_LENGTH
        ),

      pages:
        normalizeStringArray(
          frontend.pages,
          100
        )

    },

    backend: {

      framework:
        cleanString(
          backend.framework,
          MAX_FRAMEWORK_LENGTH
        ),

      routes:
        normalizeStringArray(
          backend.routes,
          100
        )

    },

    database: {

      type:
        isMinimalScope
          ? ""
          : normalizedDatabaseType,

      collections:
        isMinimalScope
          ? []
          : normalizeStringArray(
              database.collections,
              100
            )

    },

    authentication: {

      providers:
        isMinimalScope
          ? []
          : normalizedAuthProviders

    },

    aiSystems:
      isMinimalScope
        ? []
        : normalizedAiSystems,

    deployment: {

      provider:
        isMinimalScope
          ? ""
          : normalizedDeploymentProvider,

      services:
        isMinimalScope
          ? []
          : normalizeStringArray(
              deployment.services,
              100
            )

    },

    projectStructure,

    requirements,

    security:
      normalizeStringArray(
        parsed.security,
        50
      ),

    scalability:
      isMinimalScope
        ? []
        : normalizeStringArray(
            parsed.scalability,
            50
          ),

    performance:
      normalizeStringArray(
        parsed.performance,
        50
      ),

    modules,

    dependencies,

    implementationPhases,

    acceptanceCriteria,

    environmentRequirements:
      normalizeStringArray(
        parsed.environmentRequirements,
        50
      ),

    validationStrategy:
      normalizeStringArray(
        parsed.validationStrategy,
        50
      ),

    risks,

    explicitNonGoals:
      normalizeStringArray(
        parsed.explicitNonGoals,
        50
      ),

    assumptions:
      normalizeStringArray(
        parsed.assumptions,
        50
      ),

    buildStrategy: {

      mode:
        cleanString(
          buildStrategy.mode,
          100
        ) ||
        "dependency-aware",

      batchSize,

      generateByDependency:
        buildStrategy.generateByDependency !==
        false,

      validateAfterEachBatch:
        buildStrategy.validateAfterEachBatch !==
        false,

      runFinalValidation:
        buildStrategy.runFinalValidation !==
        false

    },

    intent:
      intent?.type ||
      fallback.intent

  };

}


/* =========================================================
   PLAN QUALITY VALIDATION
========================================================= */

function validatePlan(
  plan
) {

  const errors = [];


  if (
    !plan ||
    typeof plan !== "object"
  ) {

    errors.push(
      "Plan must be an object."
    );

    return errors;

  }


  if (
    !plan.projectName
  ) {

    errors.push(
      "projectName is required."
    );

  }


  if (
    !plan.description
  ) {

    errors.push(
      "description is required."
    );

  }


  if (
    !VALID_INTENTS.includes(
      plan.intent
    )
  ) {

    errors.push(
      `Invalid intent: ${plan.intent}`
    );

  }


  if (
    !VALID_COMPLEXITIES.includes(
      plan.complexity
    )
  ) {

    errors.push(
      `Invalid complexity: ${plan.complexity}`
    );

  }


  if (
    !VALID_PROJECT_SCALES.includes(
      plan.projectScale
    )
  ) {

    errors.push(
      `Invalid projectScale: ${plan.projectScale}`
    );

  }


  if (
    !Array.isArray(
      plan.projectStructure
    )
  ) {

    errors.push(
      "projectStructure must be an array."
    );

  }


  if (
    !Array.isArray(
      plan.requirements
    )
  ) {

    errors.push(
      "requirements must be an array."
    );

  }


  if (
    !Array.isArray(
      plan.modules
    )
  ) {

    errors.push(
      "modules must be an array."
    );

  }


  if (
    !Array.isArray(
      plan.dependencies
    )
  ) {

    errors.push(
      "dependencies must be an array."
    );

  }


  if (
    !Array.isArray(
      plan.implementationPhases
    )
  ) {

    errors.push(
      "implementationPhases must be an array."
    );

  }


  if (
    !Array.isArray(
      plan.acceptanceCriteria
    )
  ) {

    errors.push(
      "acceptanceCriteria must be an array."
    );

  }


  /* =====================================================
     SCOPE PROPORTIONALITY VALIDATION
  ===================================================== */

  const scope =
    getScopeLimits(
      plan.projectScale
    );


  if (
    plan.modules.length >
    scope.modules
  ) {

    errors.push(
      `Plan exceeds module budget for ${plan.projectScale}.`
    );

  }


  if (
    plan.dependencies.length >
    scope.dependencies
  ) {

    errors.push(
      `Plan exceeds dependency budget for ${plan.projectScale}.`
    );

  }


  if (
    plan.implementationPhases.length >
    scope.phases
  ) {

    errors.push(
      `Plan exceeds phase budget for ${plan.projectScale}.`
    );

  }


  /*
   * Small tasks should not contain architecture
   * that implies a distributed system.
   */

  if (
    (
      plan.projectScale ===
      "none" ||
      plan.projectScale ===
      "task"
    ) &&
    (
      plan.modules.length >
      3 ||
      plan.dependencies.length >
      5 ||
      plan.implementationPhases.length >
      1
    )
  ) {

    errors.push(
      "Minimal project contains disproportionate architecture."
    );

  }


  /*
   * Large projects require decomposition.
   */

  if (
    (
      plan.projectScale ===
      "large_project" ||
      plan.projectScale ===
      "system"
    ) &&
    plan.modules.length ===
    0
  ) {

    errors.push(
      "Large project requires module decomposition."
    );

  }


  if (
    (
      plan.projectScale ===
      "large_project" ||
      plan.projectScale ===
      "system"
    ) &&
    plan.implementationPhases.length ===
    0
  ) {

    errors.push(
      "Large project requires implementation phases."
    );

  }


  return errors;

}


/* =========================================================
   PLANNING SYSTEM PROMPT
========================================================= */

const PLANNING_SYSTEM_PROMPT = `

You are the ZyrionOS Planning Agent.

Your job is to convert the CURRENT USER REQUEST into
a precise, proportional implementation blueprint.

You are NOT the Builder.

You DO NOT write source code.

You DO NOT generate final file contents.

You DO NOT deploy anything.

You DO NOT claim that anything succeeded.

You DO NOT create credentials or secrets.

=========================================================
MOST IMPORTANT RULE
=========================================================

ARCHITECTURE MUST BE PROPORTIONAL TO THE USER REQUEST.

Do NOT make a simple request complex.

The requested scope is the source of truth.

=========================================================
SCOPE LEVELS
=========================================================

Use these levels:

none
task
feature
application
large_project
system

Use the SMALLEST level that completely satisfies
the request.

Examples:

"Create a calculator"
→ task

"Add dark mode to my dashboard"
→ feature

"Build a task management web application"
→ application

"Build a complete SaaS platform with teams,
billing, analytics and admin"
→ large_project

"Build an autonomous AI company operating system
with agents, orchestration, deployments, billing,
memory and infrastructure"
→ system

=========================================================
ANTI-INFLATION RULE
=========================================================

Never increase scope just because a technology
could theoretically be useful.

Do NOT add:

- database
- authentication
- AI
- payments
- queues
- microservices
- Redis
- monitoring
- analytics
- deployment infrastructure
- admin dashboards
- background workers

unless:

1. the user explicitly requests it, OR
2. it is objectively required for the requested
   functionality to work.

=========================================================
SIMPLE TASK RULE
=========================================================

For task-level requests:

- Prefer 1–3 modules.
- Prefer 0–5 dependencies.
- Prefer 0–1 implementation phase.
- Keep project structure small.
- Do not create unnecessary architecture.
- Do not create a database unless required.
- Do not create authentication unless required.
- Do not create backend services unless required.

Example:

USER:
"Build a counter app."

GOOD:

projectScale:
"task"

complexity:
"low"

modules:
[
  "counter-ui"
]

phases:
[
  "implementation"
]

BAD:

modules:
[
  "authentication",
  "database",
  "api",
  "analytics",
  "monitoring",
  "deployment",
  "notification-service"
]

=========================================================
FEATURE RULE
=========================================================

For feature-level requests:

- Focus only on the requested feature.
- Reuse the existing architecture when possible.
- Do not redesign unrelated systems.
- Prefer 1–8 modules.
- Prefer 0–2 implementation phases.

=========================================================
APPLICATION RULE
=========================================================

For application-level requests:

Create a proper but practical architecture.

Identify only the layers actually needed:

- frontend
- backend
- data
- authentication
- integrations

Do not automatically create microservices.

=========================================================
LARGE PROJECT RULE
=========================================================

Large projects must be decomposed.

Use:

1. Modules
2. Dependencies
3. Implementation phases
4. Acceptance criteria
5. Validation strategy

Each module needs a concrete reason to exist.

=========================================================
SYSTEM RULE
=========================================================

System-level requests may use deep architecture.

Examples:

- orchestration
- agents
- queues
- workers
- persistence
- authentication
- observability
- deployment
- infrastructure

BUT only when the user actually requests a system
of that scope.

=========================================================
MODULE RULE
=========================================================

Each module should contain:

- id
- name
- purpose
- type
- responsibilities
- files
- dependencies
- exports
- inputs
- outputs

Do NOT create modules merely to make the plan
look sophisticated.

Every module must have a real responsibility.

=========================================================
DEPENDENCY RULE
=========================================================

Dependencies must represent actual relationships.

Good:

frontend → api
api → service
service → database

Bad:

frontend → analytics
analytics → notifications
notifications → queue
queue → redis

when none of these were requested.

Avoid circular dependencies.

=========================================================
PHASE RULE
=========================================================

Do not create phases for a task that can be
implemented directly.

Use multiple phases only when dependencies,
size or risk justify them.

=========================================================
PROJECT STRUCTURE RULE
=========================================================

projectStructure describes approved files/folders
needed by the project.

Do not generate speculative files.

Do not generate:

- demo files
- duplicate components
- unused services
- unused configs
- fake APIs
- placeholder infrastructure

=========================================================
REQUIREMENTS RULE
=========================================================

requirements must be directly traceable to
the user request.

Every requirement should answer:

"What does the application actually need to do?"

=========================================================
DATABASE RULE
=========================================================

Use a database ONLY when:

- the user requests persistent data, OR
- persistent server-side state is objectively
  required.

A static frontend does NOT need a database.

=========================================================
AUTHENTICATION RULE
=========================================================

Use authentication ONLY when:

- the user requests accounts/login, OR
- private user-specific resources require it.

=========================================================
AI RULE
=========================================================

Use AI systems ONLY when:

- the user requests AI functionality, OR
- AI is objectively required by the requested feature.

Never add AI just because ZyrionOS itself uses AI.

=========================================================
DEPLOYMENT RULE
=========================================================

Do not add deployment architecture unless:

- the user requests deployment, OR
- deployment configuration is explicitly part of
  the requested application.

=========================================================
SECURITY RULE
=========================================================

Security requirements must be relevant.

Examples:

- input validation
- authorization
- secret handling

Do not generate an enormous security architecture
for a static calculator.

=========================================================
PERFORMANCE RULE
=========================================================

Only include meaningful performance considerations.

Do not invent arbitrary benchmarks.

=========================================================
ACCEPTANCE CRITERIA
=========================================================

Acceptance criteria must be observable and testable.

GOOD:

"User can add a task."

"Task remains after page reload."

BAD:

"Application should be high quality."

=========================================================
NON-GOALS
=========================================================

Use explicitNonGoals to prevent scope creep.

Example:

"Do not add authentication."

"Do not add payment processing."

=========================================================
ASSUMPTIONS
=========================================================

Make only small assumptions.

Record them explicitly.

Never silently invent major product requirements.

=========================================================
PROVIDER INDEPENDENCE
=========================================================

Never mention a specific AI provider unless
the USER explicitly requests one.

The aiProviderService handles provider selection.

=========================================================
BUILDER CONTRACT
=========================================================

The Builder will use this plan to create the
project manifest and source files.

Therefore:

- keep file structure deterministic
- keep dependencies explicit
- keep modules meaningful
- keep architecture proportional
- do not generate source code

=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

Use this exact top-level structure:

{
  "planVersion": 3,
  "projectName": "",
  "description": "",
  "framework": "",
  "projectScale": "",
  "complexity": "",

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
  "performance": [],

  "modules": [],

  "dependencies": [],

  "implementationPhases": [],

  "acceptanceCriteria": [],

  "environmentRequirements": [],

  "validationStrategy": [],

  "risks": [],

  "explicitNonGoals": [],

  "assumptions": [],

  "buildStrategy": {
    "mode": "dependency-aware",
    "batchSize": 3,
    "generateByDependency": true,
    "validateAfterEachBatch": true,
    "runFinalValidation": true
  }
}

=========================================================
FINAL CHECK BEFORE RESPONSE
=========================================================

Before returning JSON, ask internally:

1. Did I add anything the user did not request?
2. Can any module be removed without breaking the request?
3. Can any phase be removed?
4. Does this require a database?
5. Does this require authentication?
6. Does this require AI?
7. Does this require deployment infrastructure?
8. Is complexity proportional to the request?
9. Is projectScale the smallest valid scope?
10. Can Builder directly use this plan?

If the answer to 1 is YES,
remove the unnecessary feature.

`;


/* =========================================================
   MAIN PLANNING AGENT
========================================================= */

async function planningAgent(
  data = {}
) {

  const startedAt =
    Date.now();


  let currentStage =
    "input-normalization";


  try {

    logger.info(
      `📐 ZyrionOS Planning Agent ${PLANNING_AGENT_VERSION} Started`
    );


    /* =====================================================
       INPUT CONTRACT
    ===================================================== */

    let projectIdea =
      "";

    let intent =
      null;

    let user =
      {};

    let memoryContext =
      null;


    if (
      typeof data === "string"
    ) {

      projectIdea =
        cleanString(
          data,
          MAX_PROMPT_LENGTH
        );

    }

    else if (
      data &&
      typeof data === "object"
    ) {

      projectIdea =
        cleanString(
          data.prompt,
          MAX_PROMPT_LENGTH
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
       REQUEST VALIDATION
    ===================================================== */

    if (
      !projectIdea
    ) {

      return {

        success:
          false,

        message:
          "Project idea required",

        error:
          "Planning Agent received an empty project prompt.",

        stage:
          currentStage,

        metadata: {

          agentVersion:
            PLANNING_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       INTENT NORMALIZATION
    ===================================================== */

    let normalizedIntent =
      "build";


    let intentData =
      {};


    if (
      intent &&
      typeof intent === "object"
    ) {

      intentData =
        intent?.data &&
        typeof intent.data === "object"
          ? intent.data
          : intent;


      if (
        typeof intentData.type ===
        "string"
      ) {

        const intentType =
          intentData.type
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


    intentData = {

      ...intentData,

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
        )
          .slice(
            0,
            MAX_MEMORY_LENGTH
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

        role:
          cleanString(
            user.role,
            100
          )

      };


      userSummary =
        safeJson(
          safeUser
        )
          .slice(
            0,
            MAX_USER_CONTEXT_LENGTH
          );

    }


    /* =====================================================
       REQUESTED SCALE / COMPLEXITY HINTS
    ===================================================== */

    const requestedScale =
      normalizeProjectScale(
        intentData.projectScale
      );


    const requestedComplexity =
      normalizeComplexity(
        intentData.complexity
      );


    /* =====================================================
       AI PLANNING
    ===================================================== */

    currentStage =
      "ai-planning";


    const result =
      await generateJSON({

        maxTokens:
          6500,

        thinkingLevel:
          "medium",

        messages: [

          {

            role:
              "system",

            content:
              PLANNING_SYSTEM_PROMPT

          },

          {

            role:
              "user",

            content: `

CURRENT USER REQUEST:

${projectIdea}

DETECTED INTENT:

${safeJson(
  intentData
)}

REQUESTED PROJECT SCALE:

${requestedScale}

REQUESTED COMPLEXITY:

${requestedComplexity}

MEMORY CONTEXT:

${memorySummary}

SAFE USER CONTEXT:

${userSummary}

Create the smallest complete implementation
blueprint that satisfies the request.

Do not add unrelated features.

Do not generate source code.

Do not generate final file contents.

Do not inflate project complexity.

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
        result?.message ||
        "Central AI provider service returned an unsuccessful result.";


      logger.error(
        `Planning Agent Provider Failed: ${providerError}`
      );


      return {

        success:
          false,

        message:
          "Planning Agent provider failed",

        error:
          providerError,

        stage:
          currentStage,

        provider:
          result?.provider ||
          null,

        model:
          result?.model ||
          null,

        metadata: {

          agentVersion:
            PLANNING_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       RAW RESPONSE VALIDATION
    ===================================================== */

    currentStage =
      "response-validation";


    const parsed =
      result.data;


    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(
        parsed
      )
    ) {

      logger.error(
        "Planning Agent received invalid structured AI response"
      );


      return {

        success:
          false,

        message:
          "Planning Agent received an invalid AI response",

        error:
          "AI returned an invalid planning object.",

        stage:
          currentStage,

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null,

        metadata: {

          agentVersion:
            PLANNING_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

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
       PLAN VALIDATION
    ===================================================== */

    currentStage =
      "plan-validation";


    const validationErrors =
      validatePlan(
        normalizedPlan
      );


    if (
      validationErrors.length > 0
    ) {

      logger.error(
        `Planning Agent Plan Validation Failed: ${validationErrors.join(" | ")}`
      );


      return {

        success:
          false,

        message:
          "Planning Agent generated an invalid plan",

        error:
          validationErrors.join(
            " | "
          ),

        stage:
          currentStage,

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null,

        data:
          normalizedPlan,

        metadata: {

          agentVersion:
            PLANNING_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt,

          validationErrors

        }

      };

    }


    /* =====================================================
       BUILD STRATEGY SAFETY
    ===================================================== */

    if (
      normalizedIntent ===
      "build"
    ) {

      normalizedPlan.buildStrategy =
        {

          ...normalizedPlan.buildStrategy,

          mode:
            "dependency-aware",

          generateByDependency:
            true,

          validateAfterEachBatch:
            true,

          runFinalValidation:
            true

        };

    }


    /* =====================================================
       SCOPE SAFETY CHECK
    ===================================================== */

    currentStage =
      "scope-validation";


    const scope =
      getScopeLimits(
        normalizedPlan.projectScale
      );


    /*
     * Hard final safety check.
     *
     * Even if normalization changes later,
     * the returned plan cannot exceed its scope budget.
     */

    if (
      normalizedPlan.modules.length >
      scope.modules
    ) {

      return {

        success:
          false,

        message:
          "Planning scope exceeded",

        error:
          `Module count exceeds ${normalizedPlan.projectScale} scope limit.`,

        stage:
          currentStage,

        metadata: {

          agentVersion:
            PLANNING_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    if (
      normalizedPlan.dependencies.length >
      scope.dependencies
    ) {

      return {

        success:
          false,

        message:
          "Planning scope exceeded",

        error:
          `Dependency count exceeds ${normalizedPlan.projectScale} scope limit.`,

        stage:
          currentStage,

        metadata: {

          agentVersion:
            PLANNING_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    if (
      normalizedPlan.implementationPhases.length >
      scope.phases
    ) {

      return {

        success:
          false,

        message:
          "Planning scope exceeded",

        error:
          `Phase count exceeds ${normalizedPlan.projectScale} scope limit.`,

        stage:
          currentStage,

        metadata: {

          agentVersion:
            PLANNING_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       LARGE PROJECT SAFETY
    ===================================================== */

    if (
      normalizedPlan.projectScale ===
        "large_project" ||
      normalizedPlan.projectScale ===
        "system"
    ) {

      normalizedPlan.complexity =
        "high";


      if (
        normalizedPlan.modules.length ===
        0
      ) {

        return {

          success:
            false,

          message:
            "Large project decomposition missing",

          error:
            "Large projects require explicit modules before Builder execution.",

          stage:
            "large-project-validation",

          provider:
            result.provider ||
            null,

          model:
            result.model ||
            null

        };

      }


      if (
        normalizedPlan.implementationPhases.length ===
        0
      ) {

        return {

          success:
            false,

          message:
            "Large project phases missing",

          error:
            "Large projects require dependency-aware implementation phases.",

          stage:
            "large-project-validation",

          provider:
            result.provider ||
            null,

          model:
            result.model ||
            null

        };

      }

    }


    /* =====================================================
       FINAL TELEMETRY
    ===================================================== */

    logger.success(

      `Planning Agent ${PLANNING_AGENT_VERSION} Completed: ` +
      `${normalizedPlan.projectName}` +
      ` | Intent=${normalizedPlan.intent}` +
      ` | Scale=${normalizedPlan.projectScale}` +
      ` | Complexity=${normalizedPlan.complexity}` +
      ` | Modules=${normalizedPlan.modules.length}` +
      ` | Phases=${normalizedPlan.implementationPhases.length}` +
      ` | Dependencies=${normalizedPlan.dependencies.length}`

    );


    logger.info(

      `Planning Agent Provider: ${
        result.provider ||
        "unknown"
      }`

    );


    logger.info(

      `Planning Agent Model: ${
        result.model ||
        "unknown"
      }`

    );


    /* =====================================================
       SUCCESS RESPONSE
    ===================================================== */

    return {

      success:
        true,

      data:
        normalizedPlan,

      metadata: {

        agent:
          "planningAgent",

        agentVersion:
          PLANNING_AGENT_VERSION,

        model:
          result.model ||
          null,

        provider:
          result.provider ||
          null,

        intent:
          normalizedPlan.intent,

        projectScale:
          normalizedPlan.projectScale,

        complexity:
          normalizedPlan.complexity,

        modules:
          normalizedPlan.modules.length,

        dependencies:
          normalizedPlan.dependencies.length,

        implementationPhases:
          normalizedPlan
            .implementationPhases
            .length,

        acceptanceCriteria:
          normalizedPlan
            .acceptanceCriteria
            .length,

        scopeLimits:
          scope,

        generatedAt:
          new Date(),

        durationMs:
          Date.now() -
          startedAt

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


    /*
     * NEVER convert an AI/provider failure into
     * a fake successful plan.
     */

    return {

      success:
        false,

      message:
        "Planning Agent Failed",

      error:
        errorMessage,

      stage:
        currentStage,

      provider:
        null,

      model:
        error?.model ||
        null,

      metadata: {

        agentVersion:
          PLANNING_AGENT_VERSION,

        durationMs:
          Date.now() -
          startedAt

      }

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  planningAgent;
