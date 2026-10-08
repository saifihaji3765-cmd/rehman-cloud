/* =========================================================
   ZYRIONOS PLANNING AGENT
   ---------------------------------------------------------
   VERSION:
   4.0.0

   ROLE:
   Intent → Requirement Analysis → Architecture
   Decomposition → Implementation Blueprint → Builder Contract

   CORE PRINCIPLE:

       USER REQUEST
            ↓
       REQUIREMENT ANALYSIS
            ↓
       PROJECT SCALE
            ↓
       ARCHITECTURE DEPTH
            ↓
       NECESSARY MODULES
            ↓
       NECESSARY DEPENDENCIES
            ↓
       DYNAMIC IMPLEMENTATION PHASES
            ↓
       BUILDER CONTRACT
            ↓
       BUILDER

   DESIGN PRINCIPLE:

       MINIMUM UNNECESSARY ARCHITECTURE
       +
       MAXIMUM NECESSARY ARCHITECTURE

   IMPORTANT:

   Small requests MUST remain small.

   Large/system requests MUST NOT be artificially
   reduced because of arbitrary module/phase/file
   ceilings.

   Architecture is determined by actual requirements,
   dependencies, risks and boundaries.

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
  "4.0.0";


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
   HARD SAFETY LIMITS
   ---------------------------------------------------------
   These are NOT architecture ceilings.

   They are parser / memory / abuse protection limits.

   A large system is allowed to exceed normal planning
   budgets conceptually, but one single AI response still
   cannot be allowed to consume unbounded memory.
========================================================= */

const HARD_LIMITS = {

  maxPromptLength:
    12000,

  maxMemoryLength:
    5000,

  maxUserContextLength:
    2000,

  maxProjectNameLength:
    200,

  maxDescriptionLength:
    8000,

  maxFrameworkLength:
    200,

  maxStringItemLength:
    1500,

  maxModules:
    1000,

  maxPhases:
    500,

  maxDependencies:
    3000,

  maxAcceptanceCriteria:
    1000,

  maxRisks:
    500,

  maxProjectStructure:
    5000,

  maxRequirements:
    2000,

  maxSecurity:
    500,

  maxScalability:
    500,

  maxPerformance:
    500,

  maxEnvironmentRequirements:
    500,

  maxValidationStrategy:
    500,

  maxAssumptions:
    500,

  maxNonGoals:
    500,

  maxAiSystems:
    100,

  maxFrontendPages:
    500,

  maxBackendRoutes:
    1000,

  maxDatabaseCollections:
    1000,

  maxAuthProviders:
    100,

  maxDeploymentServices:
    500,

  maxModuleResponsibilities:
    100,

  maxModuleFiles:
    300,

  maxModuleDependencies:
    100,

  maxModuleExports:
    200,

  maxModuleInputs:
    100,

  maxModuleOutputs:
    100,

  maxPhaseModules:
    200,

  maxPhaseDependencies:
    200,

  maxPhasePrerequisites:
    200,

  maxPhaseValidation:
    200,

  maxDependencyReasonLength:
    1500,

  maxTokens:
    12000

};


/* =========================================================
   COMPLEXITY RANK
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
  maxLength = HARD_LIMITS.maxStringItemLength
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
  maxItemLength =
    HARD_LIMITS.maxStringItemLength
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
   UNIQUE STRINGS
========================================================= */

function uniqueStrings(
  values,
  maxItems = 100,
  maxItemLength =
    HARD_LIMITS.maxStringItemLength
) {

  return normalizeStringArray(
    values,
    maxItems,
    maxItemLength
  );

}


/* =========================================================
   NORMALIZE OBJECT LIST
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
  value,
  fallback = "application"
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


  return fallback;

}


/* =========================================================
   COMPLEXITY NORMALIZATION
========================================================= */

function normalizeComplexity(
  value,
  fallback = "medium"
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


  return fallback;

}


/* =========================================================
   GET SCALE RANK
========================================================= */

function getScaleRank(
  scale
) {

  return (
    SCALE_RANK[
      scale
    ] ??
    SCALE_RANK.application
  );

}


/* =========================================================
   GET SCALE FROM RANK
========================================================= */

function scaleFromRank(
  rank
) {

  for (
    const scale of
    VALID_PROJECT_SCALES
  ) {

    if (
      SCALE_RANK[scale] ===
      rank
    ) {

      return scale;

    }

  }


  return "application";

}


/* =========================================================
   CREATE DEFAULT PLAN
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
      4,

    agentVersion:
      PLANNING_AGENT_VERSION,

    projectName:
      "ZyrionOS Project",

    description:
      cleanString(
        prompt,
        HARD_LIMITS.maxDescriptionLength
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
      150
    );


  const name =
    cleanString(
      value.name,
      250
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
        150
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
        2000
      ),

    type:
      cleanString(
        value.type,
        150
      ),

    responsibilities:
      uniqueStrings(
        value.responsibilities,
        HARD_LIMITS.maxModuleResponsibilities
      ),

    files:
      uniqueStrings(
        value.files,
        HARD_LIMITS.maxModuleFiles,
        500
      ),

    dependencies:
      uniqueStrings(
        value.dependencies,
        HARD_LIMITS.maxModuleDependencies,
        250
      ),

    exports:
      uniqueStrings(
        value.exports,
        HARD_LIMITS.maxModuleExports,
        250
      ),

    inputs:
      uniqueStrings(
        value.inputs,
        HARD_LIMITS.maxModuleInputs,
        250
      ),

    outputs:
      uniqueStrings(
        value.outputs,
        HARD_LIMITS.maxModuleOutputs,
        250
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
      250
    );


  const to =
    cleanString(
      value.to,
      250
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
        150
      ) ||
      "runtime",

    reason:
      cleanString(
        value.reason,
        HARD_LIMITS.maxDependencyReasonLength
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
      150
    ) ||
    `phase-${index + 1}`;


  const name =
    cleanString(
      value.name,
      300
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
        2000
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
        HARD_LIMITS.maxPhaseModules,
        250
      ),

    dependencies:
      uniqueStrings(
        value.dependencies,
        HARD_LIMITS.maxPhaseDependencies,
        250
      ),

    prerequisites:
      uniqueStrings(
        value.prerequisites,
        HARD_LIMITS.maxPhasePrerequisites,
        250
      ),

    validation:
      uniqueStrings(
        value.validation,
        HARD_LIMITS.maxPhaseValidation,
        1500
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
        1500
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
      1500
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
        150
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
        1500
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
        1500
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
      1500
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
        150
      ) ||
      `RISK-${index + 1}`,

    description,

    mitigation:
      cleanString(
        value.mitigation,
        1500
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


  /* =====================================================
     SCALE AUTHORITY
     -----------------------------------------------------
     Intent provides an initial classification.

     Planning performs the actual requirement analysis.

     Planning MAY increase scope when the user request
     objectively requires it.

     Planning MUST NOT inflate scope without evidence.
  ===================================================== */

  const aiScale =
    normalizeProjectScale(
      parsed.projectScale,
      "application"
    );


  const intentScale =
    normalizeProjectScale(
      intent?.projectScale,
      "application"
    );


  const promptText =
    cleanString(
      prompt,
      HARD_LIMITS.maxPromptLength
    )
      .toLowerCase();


  const architectureSignals = [

    "platform",
    "saas",
    "enterprise",
    "ecosystem",
    "operating system",
    "company os",
    "autonomous",
    "multi-agent",
    "orchestration",
    "microservices",
    "distributed system",
    "infrastructure",
    "billing",
    "teams",
    "organizations",
    "marketplace",
    "workflow engine",
    "deployment platform",
    "developer platform",
    "ai platform"

  ];


  const explicitLargeSignal =
    architectureSignals.some(
      signal =>
        promptText.includes(
          signal
        )
    );


  let projectScale =
    aiScale;


  /*
   * If Intent has a stronger classification,
   * respect it as the minimum known scope.
   */

  if (
    getScaleRank(intentScale) >
    getScaleRank(projectScale)
  ) {

    projectScale =
      intentScale;

  }


  /*
   * Explicit large/system language is allowed to
   * promote architecture.
   */

  if (
    explicitLargeSignal &&
    getScaleRank(projectScale) <
    SCALE_RANK.large_project
  ) {

    projectScale =
      "large_project";

  }


  /*
   * A system classification from Intent or Planning
   * is never downgraded by a lower AI guess.
   */

  if (
    getScaleRank(intentScale) >=
    SCALE_RANK.system ||
    getScaleRank(aiScale) >=
    SCALE_RANK.system
  ) {

    projectScale =
      "system";

  }


  if (
    !VALID_PROJECT_SCALES.includes(
      projectScale
    )
  ) {

    projectScale =
      "application";

  }


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
      parsed.complexity,
      "medium"
    );


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

    complexity =
      COMPLEXITY_RANK[
        complexity
      ] >
      COMPLEXITY_RANK.medium
        ? "medium"
        : complexity;

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
      HARD_LIMITS.maxProjectNameLength
    );


  const description =
    cleanString(
      parsed.description,
      HARD_LIMITS.maxDescriptionLength
    );


  const framework =
    cleanString(
      parsed.framework,
      HARD_LIMITS.maxFrameworkLength
    );


  /* =====================================================
     DYNAMIC ARCHITECTURE NORMALIZATION
  ===================================================== */

  const modules =
    normalizeObjectList(
      parsed.modules,
      HARD_LIMITS.maxModules,
      normalizeModule
    );


  const dependencies =
    normalizeObjectList(
      parsed.dependencies,
      HARD_LIMITS.maxDependencies,
      normalizeDependency
    );


  const implementationPhases =
    normalizeObjectList(
      parsed.implementationPhases,
      HARD_LIMITS.maxPhases,
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
        HARD_LIMITS.maxAcceptanceCriteria
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
        HARD_LIMITS.maxRisks
      );


  /* =====================================================
     PROJECT STRUCTURE
  ===================================================== */

  const projectStructure =
    normalizeStringArray(
      parsed.projectStructure,
      HARD_LIMITS.maxProjectStructure,
      500
    );


  /* =====================================================
     REQUIREMENTS
  ===================================================== */

  const requirements =
    normalizeStringArray(
      parsed.requirements,
      HARD_LIMITS.maxRequirements,
      1500
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
            20,
            Math.floor(
              requestedBatchSize
            )
          )
        )
      : 3;


  /* =====================================================
     MINIMAL-SCOPE FEATURE REMOVAL
     -----------------------------------------------------
     Only small projects get automatic infrastructure
     suppression.

     Large/system plans retain what their requirements
     justify.
  ===================================================== */

  const isMinimalScope =
    projectScale ===
      "none" ||
    projectScale ===
      "task";


  const normalizedDatabaseType =
    cleanString(
      database.type,
      HARD_LIMITS.maxFrameworkLength
    );


  const normalizedAuthProviders =
    normalizeStringArray(
      authentication.providers,
      HARD_LIMITS.maxAuthProviders
    );


  const normalizedAiSystems =
    normalizeStringArray(
      parsed.aiSystems,
      HARD_LIMITS.maxAiSystems
    );


  const normalizedDeploymentProvider =
    cleanString(
      deployment.provider,
      HARD_LIMITS.maxFrameworkLength
    );


  return {

    planVersion:
      4,

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
        HARD_LIMITS.maxFrameworkLength
      ),

    projectScale,

    complexity,

    frontend: {

      framework:
        cleanString(
          frontend.framework,
          HARD_LIMITS.maxFrameworkLength
        ),

      pages:
        normalizeStringArray(
          frontend.pages,
          HARD_LIMITS.maxFrontendPages,
          500
        )

    },

    backend: {

      framework:
        cleanString(
          backend.framework,
          HARD_LIMITS.maxFrameworkLength
        ),

      routes:
        normalizeStringArray(
          backend.routes,
          HARD_LIMITS.maxBackendRoutes,
          500
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
              HARD_LIMITS.maxDatabaseCollections,
              500
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
              HARD_LIMITS.maxDeploymentServices,
              500
            )

    },

    projectStructure,

    requirements,

    security:
      normalizeStringArray(
        parsed.security,
        HARD_LIMITS.maxSecurity,
        1500
      ),

    scalability:
      isMinimalScope
        ? []
        : normalizeStringArray(
            parsed.scalability,
            HARD_LIMITS.maxScalability,
            1500
          ),

    performance:
      normalizeStringArray(
        parsed.performance,
        HARD_LIMITS.maxPerformance,
        1500
      ),

    modules,

    dependencies,

    implementationPhases,

    acceptanceCriteria,

    environmentRequirements:
      normalizeStringArray(
        parsed.environmentRequirements,
        HARD_LIMITS.maxEnvironmentRequirements,
        1500
      ),

    validationStrategy:
      normalizeStringArray(
        parsed.validationStrategy,
        HARD_LIMITS.maxValidationStrategy,
        1500
      ),

    risks,

    explicitNonGoals:
      normalizeStringArray(
        parsed.explicitNonGoals,
        HARD_LIMITS.maxNonGoals,
        1500
      ),

    assumptions:
      normalizeStringArray(
        parsed.assumptions,
        HARD_LIMITS.maxAssumptions,
        1500
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


  const requiredArrays = [

    [
      "projectStructure",
      plan.projectStructure
    ],

    [
      "requirements",
      plan.requirements
    ],

    [
      "modules",
      plan.modules
    ],

    [
      "dependencies",
      plan.dependencies
    ],

    [
      "implementationPhases",
      plan.implementationPhases
    ],

    [
      "acceptanceCriteria",
      plan.acceptanceCriteria
    ]

  ];


  for (
    const [
      field,
      value
    ] of requiredArrays
  ) {

    if (
      !Array.isArray(
        value
      )
    ) {

      errors.push(
        `${field} must be an array.`
      );

    }

  }


  /* =====================================================
     HARD SAFETY LIMITS
     -----------------------------------------------------
     These protect the runtime, NOT project architecture.
  ===================================================== */

  if (
    Array.isArray(
      plan.modules
    ) &&
    plan.modules.length >
    HARD_LIMITS.maxModules
  ) {

    errors.push(
      `Plan exceeds runtime module safety limit of ${HARD_LIMITS.maxModules}.`
    );

  }


  if (
    Array.isArray(
      plan.dependencies
    ) &&
    plan.dependencies.length >
    HARD_LIMITS.maxDependencies
  ) {

    errors.push(
      `Plan exceeds runtime dependency safety limit of ${HARD_LIMITS.maxDependencies}.`
    );

  }


  if (
    Array.isArray(
      plan.implementationPhases
    ) &&
    plan.implementationPhases.length >
    HARD_LIMITS.maxPhases
  ) {

    errors.push(
      `Plan exceeds runtime phase safety limit of ${HARD_LIMITS.maxPhases}.`
    );

  }


  if (
    Array.isArray(
      plan.projectStructure
    ) &&
    plan.projectStructure.length >
    HARD_LIMITS.maxProjectStructure
  ) {

    errors.push(
      `Plan exceeds runtime project structure safety limit of ${HARD_LIMITS.maxProjectStructure}.`
    );

  }


  /* =====================================================
     SMALL PROJECT PROTECTION
  ===================================================== */

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


  /* =====================================================
     FEATURE PROTECTION
  ===================================================== */

  if (
    plan.projectScale ===
    "feature"
  ) {

    if (
      plan.modules.length >
      8
    ) {

      errors.push(
        "Feature project contains disproportionate module count."
      );

    }


    if (
      plan.implementationPhases.length >
      4
    ) {

      errors.push(
        "Feature project contains disproportionate phase count."
      );

    }

  }


  /* =====================================================
     LARGE/SYSTEM VALIDATION
     -----------------------------------------------------
     NO ARTIFICIAL LOWER/UPPER ARCHITECTURAL BUDGET.

     A large project may legitimately have:
       1 phase
       10 phases
       100 phases

     depending on its actual requirements.

     We only require enough decomposition to make the
     architecture executable.
  ===================================================== */

  const isLarge =
    plan.projectScale ===
      "large_project" ||
    plan.projectScale ===
      "system";


  if (
    isLarge
  ) {

    if (
      plan.modules.length ===
      0
    ) {

      errors.push(
        "Large/system project requires module decomposition."
      );

    }


    if (
      plan.requirements.length ===
      0
    ) {

      errors.push(
        "Large/system project requires explicit requirements."
      );

    }


    if (
      plan.acceptanceCriteria.length ===
      0
    ) {

      errors.push(
        "Large/system project requires testable acceptance criteria."
      );

    }


    /*
     * Phase requirement remains, but only when the
     * project actually needs staged implementation.

     * If there are multiple independent modules, phases
     * are expected.

     * For a genuinely compact large request, one phase
     * is valid.
     */

    if (
      plan.modules.length > 1 &&
      plan.implementationPhases.length ===
      0
    ) {

      errors.push(
        "Large/system project with multiple modules requires at least one implementation phase."
      );

    }

  }


  return errors;

}


/* =========================================================
   PLANNING SYSTEM PROMPT
========================================================= */

const PLANNING_SYSTEM_PROMPT = `

You are the ZyrionOS Planning Agent v4.

Your responsibility is to convert the CURRENT USER
REQUEST into a complete, deterministic, builder-ready
architecture blueprint.

You are NOT the Builder.

You DO NOT write source code.

You DO NOT generate final file contents.

You DO NOT deploy anything.

You DO NOT claim success.

You DO NOT create credentials or secrets.

You DO NOT directly select an AI provider.

=========================================================
CORE ARCHITECTURAL PRINCIPLE
=========================================================

Architecture must be:

    MINIMUM UNNECESSARY ARCHITECTURE
    +
    MAXIMUM NECESSARY ARCHITECTURE

Do NOT underbuild a large system.

Do NOT overbuild a small feature.

The USER REQUEST is the ultimate source of truth.

=========================================================
PROJECT SCALE
=========================================================

Available scales:

none
task
feature
application
large_project
system

Use the smallest scale that fully satisfies the
request.

HOWEVER:

If the request objectively requires a large project,
use large_project.

If the request objectively describes a platform,
ecosystem, operating system, autonomous organization,
distributed architecture, orchestration system or
deep infrastructure system, use system.

Never downgrade a genuinely large request merely
because a smaller blueprint is easier to generate.

=========================================================
LARGE PROJECT CAPABILITY
=========================================================

IMPORTANT:

There is NO arbitrary architectural budget.

Do NOT think:

"large_project means exactly 60 modules."

Do NOT think:

"system means exactly 100 modules."

Those are not rules.

Determine the actual architecture from the request.

A large system may require:

- 10 modules
- 50 modules
- 150 modules
- 300 modules
- hundreds of dependencies
- many implementation phases

if the requirements objectively justify them.

Do not artificially reduce the architecture.

At the same time, do not invent modules simply to
make the architecture look enterprise-grade.

Every module must have a real responsibility.

=========================================================
RECURSIVE DECOMPOSITION
=========================================================

For large/system requests, think hierarchically:

SYSTEM
 ↓
DOMAINS
 ↓
SUBSYSTEMS
 ↓
MODULES
 ↓
FILES
 ↓
DEPENDENCIES
 ↓
IMPLEMENTATION PHASES

Use module IDs and dependency relationships to make
this decomposition deterministic.

If a domain is complex, represent its subsystems as
separate modules.

Do not collapse an entire large platform into
three vague modules.

=========================================================
INTENT VS PLANNING AUTHORITY
=========================================================

Intent Agent provides an initial classification.

Planning Agent performs requirement analysis.

Therefore:

Intent is a strong signal.

Planning is the architectural authority.

If the user request objectively requires a larger
system than Intent initially classified, promote the
project scale.

Example:

Intent:
application

User:
"Build an autonomous AI company operating system
with agents, memory, orchestration, billing,
deployment and infrastructure."

Planning:
system

Do NOT downgrade the request just because Intent
initially selected application.

=========================================================
ANTI-INFLATION RULE
=========================================================

Do NOT add unrelated functionality.

Do NOT add:

- authentication
- database
- payments
- AI
- queues
- Redis
- microservices
- monitoring
- analytics
- admin dashboards
- workers
- deployment infrastructure

unless:

1. explicitly requested, OR
2. objectively required for the requested behavior.

=========================================================
SMALL REQUESTS
=========================================================

For task-level requests:

- keep architecture small
- 1–3 modules is normally enough
- normally 0–1 phase
- avoid unnecessary backend
- avoid unnecessary database
- avoid unnecessary authentication

Example:

"Build a counter."

Use:

projectScale:
task

complexity:
low

Do NOT create:

authentication
database
analytics
queues
workers
monitoring

=========================================================
FEATURE REQUESTS
=========================================================

For feature requests:

Reuse existing architecture where possible.

Do not redesign unrelated systems.

Only create the modules needed for the feature.

=========================================================
APPLICATION REQUESTS
=========================================================

Create a complete practical application architecture.

Consider only the layers actually required:

- frontend
- backend
- data
- authentication
- integrations
- background processing

Do not automatically create microservices.

=========================================================
LARGE PROJECTS
=========================================================

Large projects require serious decomposition.

Consider:

- domains
- subsystems
- modules
- dependencies
- implementation phases
- acceptance criteria
- validation
- security
- scalability
- performance
- operational requirements

Do not collapse a large product into a tiny plan.

=========================================================
SYSTEM PROJECTS
=========================================================

System projects may require deep architecture.

Examples:

- orchestration
- agents
- workflows
- queues
- workers
- persistence
- authentication
- authorization
- observability
- deployment
- infrastructure
- APIs
- event processing
- integrations
- artifact systems
- validation
- recovery
- scaling

Only include what the user actually requires.

=========================================================
MODULE CONTRACT
=========================================================

Every module MUST contain:

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

Each module must represent a real architectural
responsibility.

Do not create decorative modules.

=========================================================
DEPENDENCY CONTRACT
=========================================================

Dependencies represent real relationships.

Good:

frontend → api

api → service

service → database

builder → engineering

engineering → artifact

Bad:

frontend → analytics

analytics → notifications

notifications → queue

queue → redis

when none are required.

Avoid circular dependencies.

=========================================================
PHASE CONTRACT
=========================================================

Implementation phases represent actual dependency
or delivery boundaries.

For large systems, phases can be numerous.

Possible structure:

Phase 1:
foundation

Phase 2:
identity

Phase 3:
core domain

Phase 4:
AI orchestration

Phase 5:
execution

Phase 6:
validation

Phase 7:
deployment

Phase 8:
observability

Phase N:
hardening

Do NOT create phases merely for appearance.

Do NOT limit the number of phases artificially.

=========================================================
PROJECT STRUCTURE
=========================================================

projectStructure must contain only files/folders
actually required by the blueprint.

Do not generate:

- demo files
- fake APIs
- unused services
- duplicate components
- speculative infrastructure

=========================================================
REQUIREMENTS
=========================================================

Every requirement must be traceable to the user's
request.

For large projects, requirements should cover all
major requested capabilities.

=========================================================
DATABASE
=========================================================

Use a database only when:

- persistent data is requested, OR
- server-side persistent state is objectively required.

=========================================================
AUTHENTICATION
=========================================================

Use authentication only when:

- accounts/login are requested, OR
- private user-specific resources require it.

=========================================================
AI
=========================================================

Use AI systems only when:

- AI is requested, OR
- AI is objectively required.

Never add AI simply because ZyrionOS itself uses AI.

=========================================================
DEPLOYMENT
=========================================================

Include deployment architecture only when:

- requested, OR
- required by the requested application behavior.

=========================================================
SECURITY
=========================================================

Security must be proportional but meaningful.

Large/system projects should identify relevant:

- authentication
- authorization
- secret handling
- input validation
- isolation
- auditability
- abuse prevention

when applicable.

=========================================================
SCALABILITY
=========================================================

For large/system projects, identify real scaling
requirements.

Examples:

- horizontal workers
- queues
- caching
- stateless services
- partitioning
- asynchronous processing

Only when justified.

=========================================================
ACCEPTANCE CRITERIA
=========================================================

Acceptance criteria must be observable and testable.

GOOD:

"User can create a project."

"Build artifact is verified before promotion."

"Preview health endpoint reports runtime status."

BAD:

"System should be excellent."

=========================================================
VALIDATION STRATEGY
=========================================================

Validation must explain how the resulting system
can be verified.

For large systems include appropriate layers such as:

- unit validation
- integration validation
- contract validation
- build validation
- security validation
- runtime validation

only where relevant.

=========================================================
RISKS
=========================================================

Identify real implementation risks.

Do not invent meaningless risks.

=========================================================
ASSUMPTIONS
=========================================================

Make only reasonable assumptions.

Record them explicitly.

Never silently invent major requirements.

=========================================================
NON-GOALS
=========================================================

Use explicitNonGoals to prevent scope creep.

=========================================================
BUILDER CONTRACT
=========================================================

The Builder will consume this plan.

Therefore:

- IDs must be deterministic.
- Dependencies must be explicit.
- Modules must have real boundaries.
- Files must be intentional.
- Phases must be ordered.
- Validation must be testable.
- Architecture must be internally consistent.

=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

Use exactly this top-level structure:

{
  "planVersion": 4,
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
FINAL INTERNAL CHECK
=========================================================

Before returning JSON:

1. What exactly did the user ask for?
2. Is the project scale sufficient?
3. Did I accidentally downgrade a large request?
4. Did I accidentally inflate a small request?
5. Does every module have a real responsibility?
6. Does every dependency represent a real relationship?
7. Are phases actually useful?
8. Are all major requirements represented?
9. Can Builder deterministically execute this blueprint?
10. Is the architecture internally consistent?

If something is unnecessary, remove it.

If something is necessary, include it.

Never reduce necessary architecture merely to satisfy
an arbitrary numeric budget.

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
          HARD_LIMITS.maxPromptLength
        );

    }

    else if (
      data &&
      typeof data === "object"
    ) {

      projectIdea =
        cleanString(
          data.prompt,
          HARD_LIMITS.maxPromptLength
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
            HARD_LIMITS.maxMemoryLength
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
            HARD_LIMITS.maxUserContextLength
          );

    }


    /* =====================================================
       REQUESTED SCALE / COMPLEXITY HINTS
    ===================================================== */

    const requestedScale =
      normalizeProjectScale(
        intentData.projectScale,
        "application"
      );


    const requestedComplexity =
      normalizeComplexity(
        intentData.complexity,
        "medium"
      );


    /* =====================================================
       AI PLANNING
    ===================================================== */

    currentStage =
      "ai-planning";


    const result =
      await generateJSON({

        maxTokens:
          HARD_LIMITS.maxTokens,

        thinkingLevel:
          "high",

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

INITIAL PROJECT SCALE FROM INTENT:

${requestedScale}

INITIAL COMPLEXITY FROM INTENT:

${requestedComplexity}

MEMORY CONTEXT:

${memorySummary}

SAFE USER CONTEXT:

${userSummary}

=========================================================
PLANNING TASK
=========================================================

Perform full requirement and architecture analysis.

The Intent Agent classification is an initial signal,
not an artificial ceiling.

If the request requires a larger architecture,
promote the project scale.

If the request is genuinely small,
keep the architecture small.

For large/system requests:

- decompose the system
- identify meaningful modules
- identify real dependencies
- define implementation phases
- define acceptance criteria
- define validation strategy
- identify risks
- identify required project structure

Do not artificially reduce a large architecture to
fit a fixed number of modules or phases.

Do not invent unrelated features.

Do not generate source code.

Do not generate final file contents.

Return only the requested JSON object.

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
       FINAL ARCHITECTURE CONSISTENCY
    ===================================================== */

    currentStage =
      "architecture-consistency";


    /*
     * Ensure large/system projects cannot accidentally
     * return a low-complexity plan.
     */

    if (
      normalizedPlan.projectScale ===
        "large_project" ||
      normalizedPlan.projectScale ===
        "system"
    ) {

      normalizedPlan.complexity =
        "high";

    }


    /*
     * Ensure phase ordering is deterministic.
     */

    normalizedPlan.implementationPhases =
      normalizedPlan
        .implementationPhases
        .map(
          (
            phase,
            index
          ) => ({

            ...phase,

            order:
              index + 1

          })
        );


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

        architectureMode:
          "requirement-driven-dynamic",

        artificialArchitectureBudget:
          false,

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
