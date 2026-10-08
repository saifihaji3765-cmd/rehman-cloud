/* =========================================================
   ZYRIONOS PLANNING AGENT
   ---------------------------------------------------------
   VERSION:
   4.1.0

   ROLE:
   Intent
      ↓
   Requirement Analysis
      ↓
   Project Scale
      ↓
   Architecture Depth
      ↓
   Modules / Dependencies
      ↓
   Implementation Phases
      ↓
   Builder Contract

   CORE PRINCIPLE:

       MINIMUM UNNECESSARY ARCHITECTURE
       +
       MAXIMUM NECESSARY ARCHITECTURE

   IMPORTANT:

   Small requests remain small.

   Large/system requests are NOT artificially reduced
   by arbitrary architecture budgets.

   Planning determines architecture from:

   - user requirements
   - project scale
   - dependencies
   - risks
   - implementation boundaries
   - validation requirements

   DOES NOT:

   - generate source code
   - generate final file contents
   - execute tools
   - deploy infrastructure
   - create credentials
   - claim deployment success
   - directly select AI providers

   PROVIDER ARCHITECTURE:

       Planning Agent
             ↓
       aiProviderService
             ↓
       Central provider routing
             ↓
       Configured providers
========================================================= */

"use strict";


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
  "4.1.0";


/* =========================================================
   VALID VALUES
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


const VALID_PROJECT_SCALES = [

  "none",
  "task",
  "feature",
  "application",
  "large_project",
  "system"

];


/* =========================================================
   HARD RUNTIME SAFETY LIMITS
   ---------------------------------------------------------
   These are parser/runtime protection limits.

   They are NOT architecture targets.

   They do NOT mean:

       system = 100 modules

   They only prevent one malformed AI response from
   consuming unbounded memory.
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
   RANKS
========================================================= */

const COMPLEXITY_RANK = {

  low: 1,
  medium: 2,
  high: 3

};


const SCALE_RANK = {

  none: 0,
  task: 1,
  feature: 2,
  application: 3,
  large_project: 4,
  system: 5

};


/* =========================================================
   SAFE STRING
========================================================= */

function cleanString(
  value,
  maxLength =
    HARD_LIMITS.maxStringItemLength
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
   PARSE AI OBJECT
   ---------------------------------------------------------
   Supports:

   1. normal object
   2. JSON string
   3. fenced JSON
========================================================= */

function parseAIObject(
  value
) {

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {

    return value;

  }


  if (
    typeof value !== "string"
  ) {

    return null;

  }


  let text =
    value.trim();


  if (
    !text
  ) {

    return null;

  }


  if (
    text.startsWith("```")
  ) {

    text =
      text

        .replace(
          /^```(?:json)?\s*/i,
          ""
        )

        .replace(
          /\s*```$/,
          ""
        )

        .trim();

  }


  try {

    const parsed =
      JSON.parse(
        text
      );


    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {

      return parsed;

    }

  }

  catch (
    error
  ) {

    return null;

  }


  return null;

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


    seen.add(
      key
    );


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
   PROJECT SCALE
========================================================= */

function normalizeProjectScale(
  value,
  fallback = "application"
) {

  const scale =
    cleanString(
      value,
      100
    ).toLowerCase();


  return VALID_PROJECT_SCALES.includes(
    scale
  )
    ? scale
    : fallback;

}


/* =========================================================
   COMPLEXITY
========================================================= */

function normalizeComplexity(
  value,
  fallback = "medium"
) {

  const complexity =
    cleanString(
      value,
      100
    ).toLowerCase();


  return VALID_COMPLEXITIES.includes(
    complexity
  )
    ? complexity
    : fallback;

}


/* =========================================================
   SCALE RANK
========================================================= */

function getScaleRank(
  scale
) {

  return (
    SCALE_RANK[scale] ??
    SCALE_RANK.application
  );

}


/* =========================================================
   DEFAULT PLAN
========================================================= */

function createDefaultPlan(
  prompt,
  intent
) {

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
      intent?.type ||
      "build"

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


  const generatedId =
    name

      .toLowerCase()

      .replace(
        /[^a-z0-9]+/g,
        "-"
      )

      .replace(
        /^-+|-+$/g,
        ""
      );


  return {

    id:
      (
        id ||
        generatedId ||
        `module-${Date.now()}`
      ).slice(
        0,
        150
      ),

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
      normalizeStringArray(
        value.responsibilities,
        HARD_LIMITS.maxModuleResponsibilities
      ),

    files:
      normalizeStringArray(
        value.files,
        HARD_LIMITS.maxModuleFiles,
        500
      ),

    dependencies:
      normalizeStringArray(
        value.dependencies,
        HARD_LIMITS.maxModuleDependencies,
        250
      ),

    exports:
      normalizeStringArray(
        value.exports,
        HARD_LIMITS.maxModuleExports,
        250
      ),

    inputs:
      normalizeStringArray(
        value.inputs,
        HARD_LIMITS.maxModuleInputs,
        250
      ),

    outputs:
      normalizeStringArray(
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
    !to ||
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
   NORMALIZE PHASE
========================================================= */

function normalizeImplementationPhase(
  phase,
  index
) {

  const value =
    normalizeObject(
      phase
    );


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

    id:
      cleanString(
        value.id,
        150
      ) ||
      `phase-${index + 1}`,

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
      normalizeStringArray(
        value.modules,
        HARD_LIMITS.maxPhaseModules,
        250
      ),

    dependencies:
      normalizeStringArray(
        value.dependencies,
        HARD_LIMITS.maxPhaseDependencies,
        250
      ),

    prerequisites:
      normalizeStringArray(
        value.prerequisites,
        HARD_LIMITS.maxPhasePrerequisites,
        250
      ),

    validation:
      normalizeStringArray(
        value.validation,
        HARD_LIMITS.maxPhaseValidation,
        1500
      )

  };

}


/* =========================================================
   ACCEPTANCE CRITERION
========================================================= */

function normalizeAcceptanceCriterion(
  criterion,
  index
) {

  if (
    typeof criterion === "string"
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
   RISK
========================================================= */

function normalizeRisk(
  risk,
  index
) {

  if (
    typeof risk === "string"
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
     SCALE ANALYSIS
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
    ).toLowerCase();


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


  if (
    getScaleRank(
      intentScale
    ) >
    getScaleRank(
      projectScale
    )
  ) {

    projectScale =
      intentScale;

  }


  if (
    explicitLargeSignal &&
    getScaleRank(
      projectScale
    ) <
    SCALE_RANK.large_project
  ) {

    projectScale =
      "large_project";

  }


  if (
    getScaleRank(
      intentScale
    ) >=
    SCALE_RANK.system ||
    getScaleRank(
      aiScale
    ) >=
    SCALE_RANK.system
  ) {

    projectScale =
      "system";

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
    projectScale === "none" ||
    projectScale === "task"
  ) {

    complexity =
      "low";

  }

  else if (
    projectScale === "feature"
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
    projectScale === "large_project" ||
    projectScale === "system"
  ) {

    complexity =
      "high";

  }


  /* =====================================================
     MINIMAL SCOPE
  ===================================================== */

  const isMinimalScope =
    projectScale === "none" ||
    projectScale === "task";


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
     COLLECTIONS
  ===================================================== */

  const modules =
    Array.isArray(
      parsed.modules
    )
      ? parsed.modules
          .map(
            normalizeModule
          )
          .filter(Boolean)
          .slice(
            0,
            HARD_LIMITS.maxModules
          )
      : [];


  const dependencies =
    Array.isArray(
      parsed.dependencies
    )
      ? parsed.dependencies
          .map(
            normalizeDependency
          )
          .filter(Boolean)
          .slice(
            0,
            HARD_LIMITS.maxDependencies
          )
      : [];


  const implementationPhases =
    Array.isArray(
      parsed.implementationPhases
    )
      ? parsed.implementationPhases
          .map(
            normalizeImplementationPhase
          )
          .filter(Boolean)
          .slice(
            0,
            HARD_LIMITS.maxPhases
          )
      : [];


  const acceptanceCriteria =
    (
      Array.isArray(
        parsed.acceptanceCriteria
      )
        ? parsed.acceptanceCriteria
        : []
    )

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


  const risks =
    (
      Array.isArray(
        parsed.risks
      )
        ? parsed.risks
        : []
    )

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
     RETURN NORMALIZED PLAN
  ===================================================== */

  return {

    planVersion:
      4,

    agentVersion:
      PLANNING_AGENT_VERSION,

    projectName:
      cleanString(
        parsed.projectName,
        HARD_LIMITS.maxProjectNameLength
      ) ||
      fallback.projectName,

    description:
      cleanString(
        parsed.description,
        HARD_LIMITS.maxDescriptionLength
      ) ||
      fallback.description,

    framework:
      cleanString(
        parsed.framework,
        HARD_LIMITS.maxFrameworkLength
      ) ||
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
          : cleanString(
              database.type,
              HARD_LIMITS.maxFrameworkLength
            ),

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
          : normalizeStringArray(
              authentication.providers,
              HARD_LIMITS.maxAuthProviders,
              250
            )

    },

    aiSystems:
      isMinimalScope
        ? []
        : normalizeStringArray(
            parsed.aiSystems,
            HARD_LIMITS.maxAiSystems,
            500
          ),

    deployment: {

      provider:
        isMinimalScope
          ? ""
          : cleanString(
              deployment.provider,
              HARD_LIMITS.maxFrameworkLength
            ),

      services:
        isMinimalScope
          ? []
          : normalizeStringArray(
              deployment.services,
              HARD_LIMITS.maxDeploymentServices,
              500
            )

    },

    projectStructure:
      normalizeStringArray(
        parsed.projectStructure,
        HARD_LIMITS.maxProjectStructure,
        500
      ),

    requirements:
      normalizeStringArray(
        parsed.requirements,
        HARD_LIMITS.maxRequirements,
        1500
      ),

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
        buildStrategy.generateByDependency !== false,

      validateAfterEachBatch:
        buildStrategy.validateAfterEachBatch !== false,

      runFinalValidation:
        buildStrategy.runFinalValidation !== false

    },

    intent:
      intent?.type ||
      fallback.intent

  };

}


/* =========================================================
   ARCHITECTURE CONSISTENCY VALIDATION
========================================================= */

function validateArchitectureConsistency(
  plan
) {

  const errors = [];


  const modules =
    Array.isArray(
      plan.modules
    )
      ? plan.modules
      : [];


  const moduleIds =
    new Set();


  for (
    const module of modules
  ) {

    if (
      moduleIds.has(
        module.id
      )
    ) {

      errors.push(
        `Duplicate module id: ${module.id}`
      );

    }


    moduleIds.add(
      module.id
    );

  }


  /* =====================================================
     DEPENDENCY VALIDATION
  ===================================================== */

  const graph =
    new Map();


  for (
    const dependency of plan.dependencies
  ) {

    const from =
      dependency.from;


    const to =
      dependency.to;


    if (
      !graph.has(
        from
      )
    ) {

      graph.set(
        from,
        []
      );

    }


    graph
      .get(from)
      .push(to);


    const knownFrom =
      moduleIds.has(
        from
      );


    const knownTo =
      moduleIds.has(
        to
      );


    /*
     * Unknown endpoints are allowed for infrastructure
     * or external dependency references.

     * But completely empty endpoints were already removed
     * during normalization.
     */

    if (
      !knownFrom &&
      !knownTo
    ) {

      errors.push(
        `Dependency references unknown nodes: ${from} -> ${to}`
      );

    }

  }


  /* =====================================================
     CYCLE DETECTION
  ===================================================== */

  const visiting =
    new Set();


  const visited =
    new Set();


  function visit(
    node,
    stack = []
  ) {

    if (
      visiting.has(
        node
      )
    ) {

      errors.push(
        `Circular dependency detected: ${[
          ...stack,
          node
        ].join(" -> ")}`
      );

      return;

    }


    if (
      visited.has(
        node
      )
    ) {

      return;

    }


    visiting.add(
      node
    );


    const nextNodes =
      graph.get(
        node
      ) ||
      [];


    for (
      const next of nextNodes
    ) {

      visit(
        next,
        [
          ...stack,
          node
        ]
      );

    }


    visiting.delete(
      node
    );


    visited.add(
      node
    );

  }


  for (
    const node of graph.keys()
  ) {

    visit(
      node
    );

  }


  /* =====================================================
     PHASE VALIDATION
  ===================================================== */

  const phaseIds =
    new Set();


  for (
    const phase of plan.implementationPhases
  ) {

    if (
      phaseIds.has(
        phase.id
      )
    ) {

      errors.push(
        `Duplicate phase id: ${phase.id}`
      );

    }


    phaseIds.add(
      phase.id
    );


    for (
      const moduleId of phase.modules
    ) {

      if (
        !moduleIds.has(
          moduleId
        )
      ) {

        errors.push(
          `Phase ${phase.id} references unknown module: ${moduleId}`
        );

      }

    }

  }


  return errors;

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

    return [
      "Plan must be an object."
    ];

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
     RUNTIME SAFETY
  ===================================================== */

  if (
    plan.modules.length >
    HARD_LIMITS.maxModules
  ) {

    errors.push(
      `Module safety limit exceeded: ${HARD_LIMITS.maxModules}`
    );

  }


  if (
    plan.dependencies.length >
    HARD_LIMITS.maxDependencies
  ) {

    errors.push(
      `Dependency safety limit exceeded: ${HARD_LIMITS.maxDependencies}`
    );

  }


  if (
    plan.implementationPhases.length >
    HARD_LIMITS.maxPhases
  ) {

    errors.push(
      `Phase safety limit exceeded: ${HARD_LIMITS.maxPhases}`
    );

  }


  /* =====================================================
     SMALL PROJECT PROTECTION
  ===================================================== */

  if (
    (
      plan.projectScale === "none" ||
      plan.projectScale === "task"
    ) &&
    (
      plan.modules.length > 3 ||
      plan.dependencies.length > 5 ||
      plan.implementationPhases.length > 1
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
    plan.projectScale === "feature"
  ) {

    if (
      plan.modules.length > 8
    ) {

      errors.push(
        "Feature project contains disproportionate module count."
      );

    }


    if (
      plan.implementationPhases.length > 4
    ) {

      errors.push(
        "Feature project contains disproportionate phase count."
      );

    }

  }


  /* =====================================================
     LARGE/SYSTEM REQUIREMENTS
  ===================================================== */

  const isLarge =
    plan.projectScale === "large_project" ||
    plan.projectScale === "system";


  if (
    isLarge
  ) {

    if (
      plan.modules.length === 0
    ) {

      errors.push(
        "Large/system project requires module decomposition."
      );

    }


    if (
      plan.requirements.length === 0
    ) {

      errors.push(
        "Large/system project requires explicit requirements."
      );

    }


    if (
      plan.acceptanceCriteria.length === 0
    ) {

      errors.push(
        "Large/system project requires testable acceptance criteria."
      );

    }


    if (
      plan.modules.length > 1 &&
      plan.implementationPhases.length === 0
    ) {

      errors.push(
        "Large/system project with multiple modules requires implementation phases."
      );

    }

  }


  /* =====================================================
     ARCHITECTURE CONSISTENCY
  ===================================================== */

  errors.push(
    ...validateArchitectureConsistency(
      plan
    )
  );


  return errors;

}


/* =========================================================
   PLANNING SYSTEM PROMPT
========================================================= */

const PLANNING_SYSTEM_PROMPT = `

You are the ZyrionOS Planning Agent v4.1.

Your job is to convert the CURRENT USER REQUEST into a
complete, deterministic, builder-ready architecture plan.

You are NOT the Builder.

You DO NOT write source code.

You DO NOT generate final file contents.

You DO NOT execute tools.

You DO NOT deploy anything.

You DO NOT create credentials or secrets.

You DO NOT directly select an AI provider.

=========================================================
ARCHITECTURE PRINCIPLE
=========================================================

Use:

MINIMUM UNNECESSARY ARCHITECTURE
+
MAXIMUM NECESSARY ARCHITECTURE

Never underbuild a genuinely large request.

Never overbuild a small request.

=========================================================
PROJECT SCALE
=========================================================

Allowed:

none
task
feature
application
large_project
system

Choose the smallest scale that fully satisfies the
request.

If the request objectively requires a platform,
ecosystem, operating system, autonomous organization,
distributed architecture, orchestration system or deep
infrastructure system, use system.

=========================================================
NO ARTIFICIAL ARCHITECTURE TARGETS
=========================================================

There is NO rule such as:

system = 100 modules

large_project = 50 modules

Do not create architecture merely to hit a number.

A system can legitimately require:

10 modules
50 modules
150 modules
300 modules

if the requirements justify them.

Every module must have a real responsibility.

=========================================================
RECURSIVE DECOMPOSITION
=========================================================

For large/system requests think:

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
PHASES

Do not collapse a complex platform into a few vague
modules.

=========================================================
INTENT
=========================================================

Intent is an initial classification.

Planning is the architectural authority.

If Intent says application but the request clearly
requires a system, promote it to system.

=========================================================
ANTI-INFLATION
=========================================================

Do not add unrelated functionality.

Do not add authentication, database, payments, AI,
queues, Redis, microservices, monitoring, analytics,
workers or infrastructure unless:

1. explicitly requested, OR
2. objectively required.

=========================================================
SMALL REQUESTS
=========================================================

Keep task-level requests extremely small.

Example:

"Build a counter."

Use:

projectScale: task
complexity: low

Do not add authentication, database, queues or workers.

=========================================================
FEATURE REQUESTS
=========================================================

Reuse existing architecture when possible.

Create only the modules required for the feature.

=========================================================
APPLICATION REQUESTS
=========================================================

Create a practical application architecture.

Use only the layers actually required:

frontend
backend
data
authentication
integrations
background processing

Do not automatically create microservices.

=========================================================
LARGE/SYSTEM REQUESTS
=========================================================

Use serious decomposition where justified.

Consider:

domains
subsystems
modules
dependencies
phases
security
scalability
performance
validation
operations
recovery

Only include what the request requires.

=========================================================
MODULE CONTRACT
=========================================================

Every module must contain:

id
name
purpose
type
responsibilities
files
dependencies
exports
inputs
outputs

=========================================================
DEPENDENCY CONTRACT
=========================================================

Dependencies must represent real relationships.

Examples:

frontend -> api
api -> service
service -> database
builder -> engineering
engineering -> artifact

Avoid unnecessary relationships and circular dependencies.

=========================================================
PHASE CONTRACT
=========================================================

Phases represent actual implementation boundaries.

Do not create phases just to make the plan look larger.

Large systems may legitimately require many phases.

=========================================================
REQUIREMENTS
=========================================================

Every requirement must trace back to the user's request.

=========================================================
DATABASE
=========================================================

Use a database only when persistent state is requested
or objectively required.

=========================================================
AUTHENTICATION
=========================================================

Use authentication only when accounts/private resources
require it.

=========================================================
AI
=========================================================

Use AI only when requested or objectively required.

Never add AI merely because ZyrionOS itself is AI-based.

=========================================================
DEPLOYMENT
=========================================================

Include deployment architecture only when requested or
required by the requested behavior.

=========================================================
SECURITY
=========================================================

Security must be proportional.

For large/system projects consider:

authentication
authorization
secret handling
input validation
isolation
auditability
abuse prevention

when applicable.

=========================================================
SCALABILITY
=========================================================

For large/system projects identify genuine scaling needs.

Examples:

horizontal workers
queues
caching
stateless services
partitioning
asynchronous processing

Only when justified.

=========================================================
ACCEPTANCE CRITERIA
=========================================================

Acceptance criteria must be observable and testable.

Good:

"User can create a project."

"Build artifact is verified before promotion."

Bad:

"System should be excellent."

=========================================================
VALIDATION
=========================================================

Validation should explain how the architecture will be
verified.

Use appropriate layers:

unit
integration
contract
build
security
runtime

when relevant.

=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

Use this top-level structure:

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
FINAL CHECK
=========================================================

Before returning:

1. What exactly did the user request?
2. Is the scale sufficient?
3. Did I downgrade a genuinely large request?
4. Did I inflate a small request?
5. Does every module have a real responsibility?
6. Are dependencies real?
7. Are there circular dependencies?
8. Are phases useful?
9. Are requirements represented?
10. Are acceptance criteria testable?
11. Can Builder deterministically execute this plan?
12. Is the architecture internally consistent?

Remove unnecessary architecture.

Add necessary architecture.

Never reduce necessary architecture merely to satisfy an
arbitrary numeric target.

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
       INPUT
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
        typeof intentData.type === "string"
      ) {

        const candidate =
          intentData.type
            .trim()
            .toLowerCase();


        if (
          VALID_INTENTS.includes(
            candidate
          )
        ) {

          normalizedIntent =
            candidate;

        }

      }

    }


    intentData = {

      ...intentData,

      type:
        normalizedIntent

    };


    /* =====================================================
       CONTEXT
    ===================================================== */

    const memorySummary =
      memoryContext

        ? safeJson(
            memoryContext
          ).slice(
            0,
            HARD_LIMITS.maxMemoryLength
          )

        : "No memory context provided.";


    let userSummary =
      "No user context provided.";


    if (
      user &&
      typeof user === "object"
    ) {

      userSummary =
        safeJson({

          role:
            cleanString(
              user.role,
              100
            )

        }).slice(
          0,
          HARD_LIMITS.maxUserContextLength
        );

    }


    /* =====================================================
       INTENT HINTS
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

INITIAL PROJECT SCALE:

${requestedScale}

INITIAL COMPLEXITY:

${requestedComplexity}

MEMORY CONTEXT:

${memorySummary}

SAFE USER CONTEXT:

${userSummary}

=========================================================
TASK
=========================================================

Perform complete requirement and architecture analysis.

Planning is the architectural authority.

If the request objectively requires a larger architecture,
promote the project scale.

If the request is genuinely small, keep it small.

For large/system requests:

- identify domains
- identify subsystems
- identify modules
- identify real dependencies
- define implementation phases
- define acceptance criteria
- define validation strategy
- identify risks
- identify project structure

Do not invent unrelated functionality.

Do not generate source code.

Do not generate final file contents.

Return only the requested JSON object.

`

          }

        ]

      });


    /* =====================================================
       PROVIDER RESULT
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
       RESPONSE PARSING
    ===================================================== */

    currentStage =
      "response-validation";


    const parsed =
      parseAIObject(
        result.data
      );


    if (
      !parsed
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
       NORMALIZATION
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
       VALIDATION
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
       BUILD CONTRACT
    ===================================================== */

    if (
      normalizedIntent === "build"
    ) {

      normalizedPlan.buildStrategy = {

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
       FINAL CONSISTENCY
    ===================================================== */

    currentStage =
      "architecture-consistency";


    if (
      normalizedPlan.projectScale === "large_project" ||
      normalizedPlan.projectScale === "system"
    ) {

      normalizedPlan.complexity =
        "high";

    }


    /*
     * Deterministic phase ordering.
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
       TELEMETRY
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
       SUCCESS
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
