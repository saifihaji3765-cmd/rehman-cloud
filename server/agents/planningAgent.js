/* =========================================================
   ZYRIONOS PLANNING AGENT
   ---------------------------------------------------------
   ROLE:
   Intent → Implementation Blueprint → Builder Contract

   RESPONSIBILITY:
   - Convert the user's request into an implementation plan
   - Decompose large projects into manageable modules
   - Define implementation phases
   - Identify technical dependencies
   - Define frontend/backend/data/auth/deployment needs
   - Define acceptance criteria
   - Define validation strategy
   - Provide Builder with a deterministic blueprint

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

   The Planning Agent MUST NOT hardcode
   Gemini, OpenAI, Sarvam, Bedrock, etc.
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
   ---------------------------------------------------------
   These limits prevent a planning response from becoming
   an uncontrolled giant object.
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

const MAX_ARRAY_ITEMS =
  300;

const MAX_SHORT_ARRAY_ITEMS =
  100;

const MAX_STRING_ITEM_LENGTH =
  1000;

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
    .replace(/\u0000/g, "")
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
  maxItems = MAX_ARRAY_ITEMS,
  maxItemLength = MAX_STRING_ITEM_LENGTH
) {

  if (
    !Array.isArray(value)
  ) {

    return [];

  }


  const result = [];


  for (
    const item of value
  ) {

    if (
      typeof item === "string"
    ) {

      const normalized =
        cleanString(
          item,
          maxItemLength
        );


      if (
        normalized
      ) {

        result.push(
          normalized
        );

      }

    }

    else if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item)
    ) {

      /*
       * Preserve structured planning objects.
       * These are normalized separately where needed.
       */

      result.push(
        item
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
    const item of value
  ) {

    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {

      continue;

    }


    const normalized =
      normalizer(
        item
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
   NORMALIZE UNIQUE STRING
========================================================= */

function uniqueStrings(
  values,
  maxItems = MAX_ARRAY_ITEMS
) {

  const normalized =
    normalizeStringArray(
      values,
      maxItems
    );


  return [

    ...new Set(
      normalized
    )

  ];

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
      2,

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

    explicitNonGoals:
      [],

    assumptions:
      [],

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


  return {

    id:
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
        .slice(
          0,
          100
        ),

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
        Number(
          value.order
        )
      )
        ? Number(
            value.order
          )
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

  const value =
    normalizeObject(
      criterion
    );


  if (
    typeof criterion ===
    "string"
  ) {

    const text =
      cleanString(
        criterion,
        1200
      );


    if (
      !text
    ) {

      return null;

    }


    return {

      id:
        `AC-${index + 1}`,

      description:
        text,

      priority:
        "required"

    };

  }


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

  const value =
    normalizeObject(
      risk
    );


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


  let projectScale =
    cleanString(
      parsed.projectScale,
      100
    )
      .toLowerCase();


  if (
    !VALID_PROJECT_SCALES.includes(
      projectScale
    )
  ) {

    projectScale =
      fallback.projectScale;

  }


  let complexity =
    cleanString(
      parsed.complexity,
      100
    )
      .toLowerCase();


  if (
    !VALID_COMPLEXITIES.includes(
      complexity
    )
  ) {

    complexity =
      fallback.complexity;

  }


  /*
   * Preserve the Intent Agent's decision.
   *
   * Planning may refine implementation details,
   * but it must not turn a large request into
   * a small one.
   */

  const intentScale =
    cleanString(
      intent?.projectScale,
      100
    )
      .toLowerCase();


  if (
    intentScale ===
    "large_project" ||
    intentScale ===
    "system"
  ) {

    projectScale =
      intentScale;

    complexity =
      "high";

  }


  const modules =
    normalizeObjectList(
      parsed.modules,
      MAX_MODULES,
      normalizeModule
    );


  const dependencies =
    normalizeObjectList(
      parsed.dependencies,
      MAX_DEPENDENCIES,
      normalizeDependency
    );


  const implementationPhases =
    normalizeObjectList(
      parsed.implementationPhases,
      MAX_PHASES,
      (
        item
      ) =>
        normalizeImplementationPhase(
          item,
          0
        )
    );


  const acceptanceCriteria =
    normalizeObjectList(
      parsed.acceptanceCriteria,
      MAX_ACCEPTANCE_CRITERIA,
      (
        item
      ) =>
        normalizeAcceptanceCriterion(
          item,
          0
        )
    );


  /*
   * Object-list normalization above does not
   * support primitive strings for every section,
   * so normalize acceptance strings separately.
   */

  const rawAcceptance =
    Array.isArray(
      parsed.acceptanceCriteria
    )
      ? parsed.acceptanceCriteria
      : [];


  const normalizedAcceptanceCriteria =
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
        MAX_ACCEPTANCE_CRITERIA
      );


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


  const normalizedPhases =
    (
      Array.isArray(
        parsed.implementationPhases
      )
        ? parsed.implementationPhases
        : []
    )
      .map(
        (
          item,
          index
        ) =>
          normalizeImplementationPhase(
            item,
            index
          )
      )
      .filter(Boolean)
      .slice(
        0,
        MAX_PHASES
      );


  const normalizedModules =
    modules;


  const normalizedDependencies =
    dependencies;


  /*
   * Build strategy.
   */

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


  return {

    planVersion:
      Number(
        parsed.planVersion
      ) || 2,

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
          MAX_SHORT_ARRAY_ITEMS
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
          MAX_SHORT_ARRAY_ITEMS
        )

    },

    database: {

      type:
        cleanString(
          database.type,
          MAX_FRAMEWORK_LENGTH
        ),

      collections:
        normalizeStringArray(
          database.collections,
          MAX_SHORT_ARRAY_ITEMS
        )

    },

    authentication: {

      providers:
        normalizeStringArray(
          authentication.providers,
          MAX_SHORT_ARRAY_ITEMS
        )

    },

    aiSystems:
      normalizeStringArray(
        parsed.aiSystems,
        MAX_SHORT_ARRAY_ITEMS
      ),

    deployment: {

      provider:
        cleanString(
          deployment.provider,
          MAX_FRAMEWORK_LENGTH
        ),

      services:
        normalizeStringArray(
          deployment.services,
          MAX_SHORT_ARRAY_ITEMS
        )

    },

    /*
     * BACKWARD-COMPATIBLE BUILDER CONTRACT
     */

    projectStructure:
      normalizeStringArray(
        parsed.projectStructure,
        MAX_ARRAY_ITEMS
      ),

    requirements:
      normalizeStringArray(
        parsed.requirements,
        MAX_ARRAY_ITEMS
      ),

    security:
      normalizeStringArray(
        parsed.security,
        MAX_SHORT_ARRAY_ITEMS
      ),

    scalability:
      normalizeStringArray(
        parsed.scalability,
        MAX_SHORT_ARRAY_ITEMS
      ),

    performance:
      normalizeStringArray(
        parsed.performance,
        MAX_SHORT_ARRAY_ITEMS
      ),

    /*
     * NEW ENGINEERING PLAN
     */

    modules:
      normalizedModules,

    dependencies:
      normalizedDependencies,

    implementationPhases:
      normalizedPhases,

    acceptanceCriteria:
      normalizedAcceptanceCriteria,

    environmentRequirements:
      normalizeStringArray(
        parsed.environmentRequirements,
        MAX_SHORT_ARRAY_ITEMS
      ),

    validationStrategy:
      normalizeStringArray(
        parsed.validationStrategy,
        MAX_SHORT_ARRAY_ITEMS
      ),

    risks,

    explicitNonGoals:
      normalizeStringArray(
        parsed.explicitNonGoals,
        MAX_SHORT_ARRAY_ITEMS
      ),

    assumptions:
      normalizeStringArray(
        parsed.assumptions,
        MAX_SHORT_ARRAY_ITEMS
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


  /*
   * Large project safety:
   *
   * A large project without modules is not
   * considered a useful implementation plan.
   */

  if (
    (
      plan.projectScale ===
      "large_project" ||
      plan.projectScale ===
      "system"
    ) &&
    plan.modules.length === 0
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
    plan.implementationPhases.length === 0
  ) {

    errors.push(
      "Large project requires implementation phases."
    );

  }


  return errors;

}


/* =========================================================
   SYSTEM PROMPT
========================================================= */

const PLANNING_SYSTEM_PROMPT = `

You are the Planning Agent of ZyrionOS,
an autonomous production AI software system.

Your job is to transform the CURRENT USER REQUEST
into a structured implementation blueprint that
downstream engineering agents can execute.

You are NOT the Builder.

You DO NOT write source code.

You DO NOT generate final file contents.

You DO NOT deploy anything.

You DO NOT claim that anything succeeded.

You DO NOT create credentials or secrets.

You DO NOT invent resources that the user did not request.

=========================================================
CORE PRINCIPLE
=========================================================

The user's request is the source of truth.

The plan must describe WHAT needs to be built
and HOW the project should be decomposed.

The Builder later decides exact source-code
implementation using this plan and the approved
project manifest.

Do not turn Planning into code generation.

=========================================================
CURRENT INTENT
=========================================================

The current intent will be provided separately.

Respect it.

For BUILD:
create an implementation blueprint.

For FIX:
identify affected modules, likely technical
areas, dependencies and verification strategy.

For DEPLOY:
describe deployment requirements only.

For MONITOR:
describe monitoring requirements only.

For SCALE:
describe scalability architecture.

For BILLING/SUBSCRIPTION:
describe the required application/payment
architecture without performing transactions.

For AUTOMATION:
describe triggers, workflows, workers and
integrations.

For INFRASTRUCTURE:
describe infrastructure components and
relationships.

For FILE:
describe the requested file operation.

For THUMBNAIL:
describe the generation pipeline.

=========================================================
LARGE PROJECT RULE
=========================================================

Never attempt to describe a large software system
as one giant undivided task.

Decompose large projects into:

1. Modules
2. Dependencies
3. Implementation phases
4. Acceptance criteria
5. Validation strategy

Example:

Authentication
    ↓
User/Data Layer
    ↓
Core Services
    ↓
Feature Modules
    ↓
API Layer
    ↓
Frontend
    ↓
Integration
    ↓
Testing
    ↓
Deployment

The exact decomposition must depend on the
actual user request.

=========================================================
MODULE RULES
=========================================================

Each module should have:

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

Do NOT invent unnecessary modules.

Every module must have a reason to exist.

=========================================================
DEPENDENCY RULES
=========================================================

Dependencies must describe real relationships.

Examples:

frontend → api
api → service
service → database
feature → authentication

Do not create circular dependencies unless
the user explicitly requires them and the
architecture genuinely needs them.

Prefer dependency direction:

foundation
    ↓
core
    ↓
features
    ↓
integration
    ↓
entrypoints

=========================================================
IMPLEMENTATION PHASE RULES
=========================================================

Large projects must be divided into phases.

A phase should contain:

- id
- name
- purpose
- order
- modules
- dependencies
- prerequisites
- validation

Generation should happen in dependency-aware order.

Do not generate a file before the modules it
depends on are understood.

=========================================================
FILE RULE
=========================================================

projectStructure must describe ONLY files/folders
that are justified by the request and architecture.

Do not add:

- random demo files
- unnecessary libraries
- fake configuration
- unused components
- speculative services
- duplicate modules

The final Builder output should contain only
approved manifest files.

=========================================================
REQUIREMENTS RULE
=========================================================

requirements should contain concise implementation
requirements required by the user request.

Do not invent unrelated features.

=========================================================
ACCEPTANCE CRITERIA
=========================================================

Acceptance criteria must describe observable
conditions that can later be tested.

Examples:

"Authenticated users can create projects."

"Project data persists after reload."

"Unauthorized users cannot access private routes."

Avoid vague criteria such as:

"Application should be good."

=========================================================
SECURITY
=========================================================

Identify concrete requirements such as:

- authentication
- authorization
- input validation
- secret handling
- access control
- API protection
- data protection

Only include requirements relevant to the project.

Never create real credentials.

=========================================================
SCALABILITY
=========================================================

For large applications identify relevant
scalability concerns such as:

- modular services
- stateless APIs
- caching
- queue workers
- database indexing
- pagination
- asynchronous jobs
- horizontal scaling

Only include what the actual system needs.

=========================================================
PERFORMANCE
=========================================================

Identify meaningful performance requirements.

Do not invent arbitrary benchmarks unless
the user supplied them.

=========================================================
ENVIRONMENT REQUIREMENTS
=========================================================

List required environment/configuration variables
by PURPOSE only.

Never output real secrets.

Example:

"DATABASE_URL"
"AUTH_SECRET"
"PAYMENT_PROVIDER_KEY"

Do not provide actual values.

=========================================================
NON-GOALS
=========================================================

explicitNonGoals should prevent downstream agents
from adding unrelated functionality.

Example:

"Do not add social login unless requested."

=========================================================
ASSUMPTIONS
=========================================================

If a minor ambiguity exists, make the smallest
reasonable assumption and record it.

Do not silently invent major product requirements.

=========================================================
PROVIDER INDEPENDENCE
=========================================================

Do not mention or require a specific AI provider
unless the USER explicitly requested one.

The central aiProviderService controls which
AI provider executes this planning request.

=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

No markdown.

No explanation.

Use this exact top-level structure:

{
  "planVersion": 2,
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
IMPORTANT
=========================================================

Do not generate source code.

Do not generate file contents.

Do not claim execution.

Do not claim deployment.

Do not create credentials.

Do not add features not justified by the request.

For large projects, decomposition is more important
than producing a giant response.

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
       VALIDATION
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


    /*
     * If Planning is called directly without
     * Intent Agent output, BUILD remains the
     * safe default because this agent historically
     * served the Builder pipeline.
     */


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
       -----------------------------------------------------
       Do not send unnecessary user information
       to the AI provider.
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
       PROJECT SCALE HINT
    ===================================================== */

    const requestedScale =
      cleanString(
        intentData.projectScale,
        100
      )
        .toLowerCase();


    const requestedComplexity =
      cleanString(
        intentData.complexity,
        100
      )
        .toLowerCase();


    /* =====================================================
       AI PLANNING
       -----------------------------------------------------
       IMPORTANT:

       No provider is hardcoded.

       aiProviderService controls:
       - provider selection
       - provider fallback
       - retries
       - cooldowns
       - structured JSON validation
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

${requestedScale ||
  "not specified"}

REQUESTED COMPLEXITY:

${requestedComplexity ||
  "not specified"}

MEMORY CONTEXT:

${memorySummary}

SAFE USER CONTEXT:

${userSummary}

Create the implementation blueprint.

Remember:

- The current request is the source of truth.
- Do not invent unrelated features.
- Do not generate source code.
- Large projects must be decomposed.
- Dependencies must be explicit.
- Builder must be able to use this plan.
- Final files must later come from the approved
  project manifest, not from arbitrary model output.

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


      /*
       * IMPORTANT:
       *
       * Do NOT return success with a fake plan.
       *
       * A fake plan would reach Builder and create
       * a project that does not actually represent
       * the user's request.
       */

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
        {

          ...intentData,

          type:
            normalizedIntent

        }
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
        normalizedPlan.implementationPhases
          .length ===
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
       SUCCESS LOGGING
    ===================================================== */

    logger.success(

      `Planning Agent Completed: ` +
      `${normalizedPlan.projectName}` +
      ` | Scale: ${normalizedPlan.projectScale}` +
      ` | Complexity: ${normalizedPlan.complexity}` +
      ` | Modules: ${normalizedPlan.modules.length}` +
      ` | Phases: ${normalizedPlan.implementationPhases.length}` +
      ` | Dependencies: ${normalizedPlan.dependencies.length}`

    );


    logger.info(

      `Planning Agent Provider: ` +
      `${result.provider || "unknown"}`

    );


    logger.info(

      `Planning Agent Model: ` +
      `${result.model || "unknown"}`

    );


    /* =====================================================
       RESPONSE
       -----------------------------------------------------
       Existing fields are preserved so the current
       Builder can continue consuming the plan.

       New engineering fields are added for the
       next pipeline stages.
    ===================================================== */

    return {

      success:
        true,

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
     * Do not manufacture a successful plan.
     *
     * If all configured providers fail,
     * Builder must not receive fake architecture.
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
