/* =========================================================
   ZYRIONOS INTENT AGENT
   ---------------------------------------------------------
   Production Semantic Intent Router
   Version: 5.0.0

   RESPONSIBILITY:
   - Understand the CURRENT user request
   - Classify primary intent
   - Estimate engineering complexity
   - Estimate project scale
   - Identify execution requirements
   - Select existing downstream agents
   - Produce structured routing intelligence

   DOES NOT:
   - Generate source code
   - Generate project files
   - Design the actual architecture
   - Create implementation plans
   - Execute tools
   - Deploy infrastructure
   - Modify files
   - Claim completion

   ARCHITECTURAL PRINCIPLE:
   Semantic classification is AI-driven.

   There are NO domain-specific keyword lists for:
   - calculators
   - SaaS
   - todo apps
   - dashboards
   - marketplaces
   - enterprise systems
   - etc.

   Deterministic logic is used ONLY for:
   - schema validation
   - safety limits
   - contract enforcement
   - consistency checks
   - routing invariants

   AI provider:
   - Centralized aiProviderService only.
========================================================= */

const logger = require("../services/loggerService");

const {
  generateJSON
} = require("../services/ai/aiProviderService");


/* =========================================================
   VERSION
========================================================= */

const INTENT_AGENT_VERSION = "5.0.0";


/* =========================================================
   CONTRACT ENUMS
   ---------------------------------------------------------
   These are system contracts, NOT semantic classification
   rules.
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

const VALID_REQUEST_KINDS = [
  "question",
  "creation",
  "modification",
  "repair",
  "operation",
  "planning",
  "inspection",
  "generation"
];

const VALID_ENGINEERING_LEVELS = [
  "none",
  "small",
  "moderate",
  "complex",
  "large",
  "system"
];


/* =========================================================
   KNOWN DOWNSTREAM AGENTS
   ---------------------------------------------------------
   These are architectural contracts.
========================================================= */

const KNOWN_AGENTS = [
  "intentAgent",
  "planningAgent",
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
   LIMITS
========================================================= */

const MAX_PROMPT_LENGTH = 12000;
const MAX_MEMORY_LENGTH = 3500;
const MAX_GOAL_LENGTH = 2000;
const MAX_REASON_LENGTH = 500;
const MAX_EVIDENCE_ITEMS = 12;
const MAX_SECONDARY_INTENTS = 6;
const MAX_REQUIRED_AGENTS = 10;
const MAX_CONSTRAINTS = 15;
const MAX_CAPABILITIES = 20;
const MAX_COMPONENTS = 30;
const MAX_INTEGRATIONS = 30;
const MAX_DATA_DOMAINS = 30;
const MAX_USER_ROLES = 20;
const MAX_DEPENDENCIES = 30;


/* =========================================================
   LOGGER COMPATIBILITY
========================================================= */

function logInfo(message) {
  try {
    if (
      logger &&
      typeof logger.info === "function"
    ) {
      return logger.info(message);
    }

    if (
      logger &&
      typeof logger.log === "function"
    ) {
      return logger.log(message);
    }
  } catch (_) {}
}


function logWarning(message) {
  try {
    if (
      logger &&
      typeof logger.warning === "function"
    ) {
      return logger.warning(message);
    }

    if (
      logger &&
      typeof logger.warn === "function"
    ) {
      return logger.warn(message);
    }

    if (
      logger &&
      typeof logger.info === "function"
    ) {
      return logger.info(
        `[WARNING] ${message}`
      );
    }
  } catch (_) {}
}


function logError(message) {
  try {
    if (
      logger &&
      typeof logger.error === "function"
    ) {
      return logger.error(message);
    }

    if (
      logger &&
      typeof logger.info === "function"
    ) {
      return logger.info(
        `[ERROR] ${message}`
      );
    }
  } catch (_) {}
}


function logSuccess(message) {
  try {
    if (
      logger &&
      typeof logger.success === "function"
    ) {
      return logger.success(message);
    }

    if (
      logger &&
      typeof logger.info === "function"
    ) {
      return logger.info(
        `[SUCCESS] ${message}`
      );
    }
  } catch (_) {}
}


/* =========================================================
   STRING HELPERS
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
    .slice(0, maxLength);
}


/* =========================================================
   ARRAY HELPERS
========================================================= */

function normalizeStringArray(
  value,
  maxItems = 20,
  maxItemLength = 300
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter(
          (item) =>
            typeof item === "string"
        )
        .map(
          (item) =>
            cleanString(
              item,
              maxItemLength
            )
        )
        .filter(Boolean)
        .slice(
          0,
          maxItems
        )
    )
  ];
}


/* =========================================================
   BOOLEAN NORMALIZATION
========================================================= */

function normalizeBoolean(
  value,
  fallback = false
) {
  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  return fallback;
}


/* =========================================================
   NUMBER NORMALIZATION
========================================================= */

function normalizeNumber(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  return number;
}


/* =========================================================
   CONFIDENCE
========================================================= */

function normalizeConfidence(
  value
) {
  let confidence =
    normalizeNumber(
      value,
      0
    );

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
   ENUM NORMALIZATION
========================================================= */

function normalizeEnum(
  value,
  allowed,
  fallback
) {
  const normalized =
    cleanString(
      value,
      100
    ).toLowerCase();

  if (
    allowed.includes(
      normalized
    )
  ) {
    return normalized;
  }

  return fallback;
}


/* =========================================================
   DEFAULT RESULT
========================================================= */

function createDefaultIntent() {
  return {

    type: "chat",

    goal:
      "general interaction",

    complexity:
      "low",

    confidence:
      0,

    requiredAgents:
      [],

    secondaryIntents:
      [],

    projectScale:
      "none",

    requestKind:
      "question",

    requiresPlanning:
      false,

    requiresBuild:
      false,

    requiresExecution:
      false,

    engineering: {

      level:
        "none",

      dimensions: {

        requirements:
          0,

        functionality:
          0,

        components:
          0,

        data:
          0,

        integrations:
          0,

        users:
          0,

        infrastructure:
          0,

        security:
          0,

        deployment:
          0,

        operations:
          0,

        dependencies:
          0,

        coordination:
          0

      },

      explicitScope:
        "unknown",

      scopeEvidence:
        [],

      uncertainty:
        "high"

    },

    reasoning: {

      summary:
        "",

      evidence:
        [],

      assumptions:
        [],

      uncertainties:
        [],

      contradictions:
        []

    },

    scopeSignals:
      [],

    capabilities:
      [],

    components:
      [],

    integrations:
      [],

    dataDomains:
      [],

    userRoles:
      [],

    dependencies:
      [],

    constraints:
      []

  };
}


/* =========================================================
   SAFE JSON SERIALIZATION
========================================================= */

function safeJson(
  value
) {
  try {
    return JSON.stringify(
      value ?? null
    );
  } catch (_) {
    return JSON.stringify({
      error:
        "Unable to serialize context"
    });
  }
}


/* =========================================================
   EMPTY ENGINEERING DIMENSIONS
========================================================= */

function createEngineeringDimensions() {
  return {

    requirements: 0,
    functionality: 0,
    components: 0,
    data: 0,
    integrations: 0,
    users: 0,
    infrastructure: 0,
    security: 0,
    deployment: 0,
    operations: 0,
    dependencies: 0,
    coordination: 0

  };
}


/* =========================================================
   NORMALIZE ENGINEERING DIMENSIONS
========================================================= */

function normalizeEngineeringDimensions(
  value
) {

  const source =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value
      : {};

  const output =
    createEngineeringDimensions();

  for (
    const key of
    Object.keys(output)
  ) {

    const number =
      normalizeNumber(
        source[key],
        0
      );

    output[key] =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(number)
        )
      );
  }

  return output;
}


/* =========================================================
   NORMALIZE REASONING
========================================================= */

function normalizeReasoning(
  value
) {

  const source =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value
      : {};

  return {

    summary:
      cleanString(
        source.summary,
        MAX_REASON_LENGTH
      ),

    evidence:
      normalizeStringArray(
        source.evidence,
        MAX_EVIDENCE_ITEMS,
        MAX_REASON_LENGTH
      ),

    assumptions:
      normalizeStringArray(
        source.assumptions,
        MAX_EVIDENCE_ITEMS,
        MAX_REASON_LENGTH
      ),

    uncertainties:
      normalizeStringArray(
        source.uncertainties,
        MAX_EVIDENCE_ITEMS,
        MAX_REASON_LENGTH
      ),

    contradictions:
      normalizeStringArray(
        source.contradictions,
        MAX_EVIDENCE_ITEMS,
        MAX_REASON_LENGTH
      )

  };
}


/* =========================================================
   NORMALIZE ENGINEERING
========================================================= */

function normalizeEngineering(
  value
) {

  const source =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value
      : {};

  return {

    level:
      normalizeEnum(
        source.level,
        VALID_ENGINEERING_LEVELS,
        "none"
      ),

    dimensions:
      normalizeEngineeringDimensions(
        source.dimensions
      ),

    explicitScope:
      cleanString(
        source.explicitScope,
        100
      ).toLowerCase() ||
      "unknown",

    scopeEvidence:
      normalizeStringArray(
        source.scopeEvidence,
        MAX_EVIDENCE_ITEMS,
        MAX_REASON_LENGTH
      ),

    uncertainty:
      cleanString(
        source.uncertainty,
        100
      ).toLowerCase() ||
      "high"

  };
}


/* =========================================================
   NORMALIZE AI OUTPUT
========================================================= */

function normalizeAIResult(
  parsed
) {

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  return parsed;
}


/* =========================================================
   AGENT NORMALIZATION
========================================================= */

function normalizeRequiredAgents(
  agents
) {

  const normalized =
    normalizeStringArray(
      agents,
      MAX_REQUIRED_AGENTS,
      100
    )
      .map(
        (agent) =>
          agent.trim()
      )
      .map(
        (agent) => {

          if (
            agent ===
            "plannerAgent"
          ) {
            return "planningAgent";
          }

          return agent;
        }
      )
      .filter(
        (agent) =>
          KNOWN_AGENTS.includes(
            agent
          )
      );

  return [
    ...new Set(
      normalized
    )
  ].slice(
    0,
    MAX_REQUIRED_AGENTS
  );
}


/* =========================================================
   SECONDARY INTENTS
========================================================= */

function normalizeSecondaryIntents(
  intents
) {

  return [
    ...new Set(
      normalizeStringArray(
        intents,
        MAX_SECONDARY_INTENTS,
        100
      )
        .map(
          (intent) =>
            intent.toLowerCase()
        )
        .filter(
          (intent) =>
            VALID_INTENTS.includes(
              intent
            )
        )
    )
  ];
}


/* =========================================================
   DIMENSION ANALYSIS
   ---------------------------------------------------------
   No domain keywords.
   Only structural consistency.
========================================================= */

function calculateDimensionProfile(
  intent
) {

  const dimensions =
    normalizeEngineeringDimensions(
      intent?.engineering?.dimensions
    );

  const values =
    Object.values(
      dimensions
    );

  const active =
    values.filter(
      (value) =>
        value > 0
    );

  const average =
    active.length
      ? active.reduce(
          (sum, value) =>
            sum + value,
          0
        ) /
        active.length
      : 0;

  const highDimensions =
    active.filter(
      (value) =>
        value >= 70
    ).length;

  const broadDimensions =
    active.filter(
      (value) =>
        value >= 40
    ).length;

  return {

    average:
      Math.round(
        average
      ),

    highDimensions,

    broadDimensions,

    activeDimensions:
      active.length

  };
}


/* =========================================================
   SCALE / COMPLEXITY CONSISTENCY
   ---------------------------------------------------------
   This does NOT determine the project type.
   It only catches obvious contradictions in AI output.
========================================================= */

function validateScaleConsistency(
  intent
) {

  const issues = [];

  const profile =
    calculateDimensionProfile(
      intent
    );

  const scale =
    intent.projectScale;

  const complexity =
    intent.complexity;

  const engineeringLevel =
    intent.engineering.level;


  /*
   * None means no engineering scope.
   */

  if (
    scale === "none" &&
    (
      intent.requiresBuild ||
      intent.requiresPlanning ||
      engineeringLevel !== "none"
    )
  ) {

    issues.push(
      "Engineering requirements conflict with projectScale=none."
    );
  }


  /*
   * System should represent genuinely broad
   * engineering scope.
   */

  if (
    scale === "system" &&
    profile.activeDimensions < 3 &&
    engineeringLevel !== "system"
  ) {

    issues.push(
      "System scope has insufficient structural evidence."
    );
  }


  /*
   * High complexity requires meaningful
   * engineering evidence.
   */

  if (
    complexity === "high" &&
    profile.activeDimensions === 0 &&
    engineeringLevel === "none"
  ) {

    issues.push(
      "High complexity has no engineering evidence."
    );
  }


  /*
   * Low complexity should not claim a highly
   * distributed engineering level.
   */

  if (
    complexity === "low" &&
    (
      engineeringLevel === "system" ||
      engineeringLevel === "large"
    )
  ) {

    issues.push(
      "Low complexity conflicts with large engineering level."
    );
  }


  return issues;
}


/* =========================================================
   REQUIRED ROUTING CONTRACT
========================================================= */

function applyRoutingContract(
  intent
) {

  const result =
    {
      ...intent
    };


  /*
   * Build always requires planning and builder.
   */

  if (
    result.type === "build"
  ) {

    const agents =
      new Set(
        result.requiredAgents
      );

    agents.add(
      "planningAgent"
    );

    agents.add(
      "builderAgent"
    );

    result.requiredAgents =
      [
        ...agents
      ].filter(
        (agent) =>
          KNOWN_AGENTS.includes(
            agent
          )
      );

    result.requiresPlanning =
      true;

    result.requiresBuild =
      true;

  }


  /*
   * Fix requires repair capability.
   */

  if (
    result.type === "fix"
  ) {

    const agents =
      new Set(
        result.requiredAgents
      );

    agents.add(
      "fixAgent"
    );

    result.requiredAgents =
      [
        ...agents
      ].filter(
        (agent) =>
          KNOWN_AGENTS.includes(
            agent
          )
      );

    result.requiresPlanning =
      true;

  }


  /*
   * Deployment is an execution operation.
   */

  if (
    result.type === "deploy"
  ) {

    const agents =
      new Set(
        result.requiredAgents
      );

    agents.add(
      "deployAgent"
    );

    result.requiredAgents =
      [
        ...agents
      ].filter(
        (agent) =>
          KNOWN_AGENTS.includes(
            agent
          )
      );

    result.requiresExecution =
      true;

  }


  return result;
}


/* =========================================================
   FINAL CONTRACT VALIDATION
========================================================= */

function validateIntentContract(
  intent
) {

  const errors = [];

  if (
    !VALID_INTENTS.includes(
      intent.type
    )
  ) {
    errors.push(
      "Invalid primary intent."
    );
  }

  if (
    !VALID_COMPLEXITIES.includes(
      intent.complexity
    )
  ) {
    errors.push(
      "Invalid complexity."
    );
  }

  if (
    !VALID_PROJECT_SCALES.includes(
      intent.projectScale
    )
  ) {
    errors.push(
      "Invalid project scale."
    );
  }

  if (
    !VALID_REQUEST_KINDS.includes(
      intent.requestKind
    )
  ) {
    errors.push(
      "Invalid request kind."
    );
  }

  if (
    !Number.isFinite(
      intent.confidence
    )
  ) {
    errors.push(
      "Invalid confidence."
    );
  }

  if (
    !Array.isArray(
      intent.requiredAgents
    )
  ) {
    errors.push(
      "requiredAgents must be an array."
    );
  }

  if (
    intent.requiredAgents.some(
      (agent) =>
        !KNOWN_AGENTS.includes(
          agent
        )
    )
  ) {
    errors.push(
      "Unknown downstream agent detected."
    );
  }

  errors.push(
    ...validateScaleConsistency(
      intent
    )
  );

  return [
    ...new Set(
      errors
    )
  ];
}


/* =========================================================
   NORMALIZE COMPLETE INTENT
========================================================= */

function normalizeIntent(
  parsed
) {

  const result =
    createDefaultIntent();


  result.type =
    normalizeEnum(
      parsed.type,
      VALID_INTENTS,
      "chat"
    );


  result.goal =
    cleanString(
      parsed.goal,
      MAX_GOAL_LENGTH
    ) ||
    "general interaction";


  result.complexity =
    normalizeEnum(
      parsed.complexity,
      VALID_COMPLEXITIES,
      "medium"
    );


  result.confidence =
    normalizeConfidence(
      parsed.confidence
    );


  result.projectScale =
    normalizeEnum(
      parsed.projectScale,
      VALID_PROJECT_SCALES,
      "none"
    );


  result.requestKind =
    normalizeEnum(
      parsed.requestKind,
      VALID_REQUEST_KINDS,
      "question"
    );


  result.requiredAgents =
    normalizeRequiredAgents(
      parsed.requiredAgents
    );


  result.secondaryIntents =
    normalizeSecondaryIntents(
      parsed.secondaryIntents
    );


  result.requiresPlanning =
    normalizeBoolean(
      parsed.requiresPlanning
    );


  result.requiresBuild =
    normalizeBoolean(
      parsed.requiresBuild
    );


  result.requiresExecution =
    normalizeBoolean(
      parsed.requiresExecution
    );


  result.engineering =
    normalizeEngineering(
      parsed.engineering
    );


  result.reasoning =
    normalizeReasoning(
      parsed.reasoning
    );


  result.scopeSignals =
    normalizeStringArray(
      parsed.scopeSignals,
      MAX_EVIDENCE_ITEMS,
      MAX_REASON_LENGTH
    );


  result.capabilities =
    normalizeStringArray(
      parsed.capabilities,
      MAX_CAPABILITIES,
      200
    );


  result.components =
    normalizeStringArray(
      parsed.components,
      MAX_COMPONENTS,
      200
    );


  result.integrations =
    normalizeStringArray(
      parsed.integrations,
      MAX_INTEGRATIONS,
      200
    );


  result.dataDomains =
    normalizeStringArray(
      parsed.dataDomains,
      MAX_DATA_DOMAINS,
      200
    );


  result.userRoles =
    normalizeStringArray(
      parsed.userRoles,
      MAX_USER_ROLES,
      150
    );


  result.dependencies =
    normalizeStringArray(
      parsed.dependencies,
      MAX_DEPENDENCIES,
      200
    );


  result.constraints =
    normalizeStringArray(
      parsed.constraints,
      MAX_CONSTRAINTS,
      300
    );


  return result;
}


/* =========================================================
   SYSTEM PROMPT
   ---------------------------------------------------------
   Semantic classification is intentionally delegated
   to the model. No application-domain keyword taxonomy.
========================================================= */

const INTENT_SYSTEM_PROMPT = `

You are the Intent Intelligence Engine of ZyrionOS.

Your responsibility is to understand the CURRENT USER REQUEST
and produce an accurate engineering/workflow classification.

You are NOT the builder.
You are NOT the planner.
You are NOT the architect.
You are NOT the executor.

Do not generate source code.
Do not generate implementation plans.
Do not execute anything.
Do not claim completion.

=========================================================
PRIMARY OBJECTIVE
=========================================================

Determine WHAT the user is asking for.

Then determine:

1. primary intent
2. request kind
3. engineering complexity
4. project scale
5. required downstream agents
6. whether planning is required
7. whether building is required
8. whether execution is required

=========================================================
IMPORTANT PRINCIPLE
=========================================================

DO NOT classify by memorized application names.

Do NOT use a fixed list of:
- simple applications
- complex applications
- industries
- product names
- technology names

Instead understand the actual requested scope.

For example, two requests using the same technology can have
completely different engineering complexity.

Likewise, a request without technical vocabulary can still
describe a very large system.

Classify based on the actual requirements expressed or strongly
implied by the current request.

=========================================================
PROJECT SCALE
=========================================================

none:
No meaningful software engineering scope.

task:
A narrowly bounded engineering task with limited independent
capabilities and limited coordination.

feature:
A coherent capability larger than a single bounded task but
still limited in scope.

application:
A multi-capability application requiring meaningful coordination
between multiple parts.

large_project:
A broad production-grade project containing multiple substantial
capabilities, integrations, data/security concerns, or operational
requirements.

system:
A highly interconnected engineering system containing multiple
major subsystems, substantial coordination, infrastructure,
operations, or cross-system dependencies.

IMPORTANT:

Do not use projectScale merely because the user says
"production", "professional", "advanced", or similar words.

Evaluate actual scope.

=========================================================
COMPLEXITY
=========================================================

low:
Small and bounded engineering scope.

medium:
Meaningful engineering coordination but limited overall
complexity.

high:
Substantial architecture, coordination, integration, data,
security, infrastructure, operational, or multi-subsystem
complexity.

=========================================================
ENGINEERING DIMENSIONS
=========================================================

Evaluate each dimension independently from 0 to 100:

requirements
functionality
components
data
integrations
users
infrastructure
security
deployment
operations
dependencies
coordination

Do NOT add arbitrary numbers.

The numbers should represent the relative complexity implied
by the CURRENT REQUEST.

=========================================================
EXPLICIT SCOPE
=========================================================

Determine whether scope is:

explicit
partially_explicit
inferred
unknown

Never invent detailed requirements that the user did not provide.

=========================================================
UNCERTAINTY
=========================================================

Return:

low
medium
high

based on how clearly the user described the requested scope.

If the request is ambiguous, preserve uncertainty instead of
pretending certainty.

=========================================================
REASONING
=========================================================

Provide concise evidence explaining the classification.

Evidence must come from the user's actual request.

Do not invent facts.

Separate:

evidence
assumptions
uncertainties
contradictions

=========================================================
PRIMARY INTENTS
=========================================================

Valid values:

chat
build
deploy
monitor
scale
billing
subscription
fix
file
automation
infrastructure
thumbnail

=========================================================
REQUEST KINDS
=========================================================

Valid values:

question
creation
modification
repair
operation
planning
inspection
generation

=========================================================
DOWNSTREAM AGENTS
=========================================================

Only use:

intentAgent
planningAgent
builderAgent
deployAgent
monitoringAgent
scalingAgent
billingAgent
subscriptionAgent
memoryAgent
fixAgent
fileAgent

Never invent an agent.

For a build request, planningAgent and builderAgent are required.

=========================================================
IMPORTANT BUILD RULE
=========================================================

If the user requests software creation:

type = build

requiresBuild = true

requiresPlanning = true

requiredAgents must contain:

planningAgent
builderAgent

Do not determine build complexity from the word "build".

Determine it from the actual requested scope.

=========================================================
LARGE PROJECT RULE
=========================================================

A large request must NOT be rejected merely because it is large.

The purpose of this classification is to allow downstream
Planning, Builder and Engineering systems to handle the appropriate
scope.

Never artificially downgrade a large project to make planning easier.

Never artificially upgrade a small request because the surrounding
platform is sophisticated.

=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

Schema:

{
  "type": "build",
  "goal": "concise description of the user's actual goal",
  "complexity": "low",
  "confidence": 0,
  "requiredAgents": [
    "planningAgent",
    "builderAgent"
  ],
  "secondaryIntents": [],
  "projectScale": "task",
  "requestKind": "creation",

  "requiresPlanning": true,
  "requiresBuild": true,
  "requiresExecution": false,

  "engineering": {
    "level": "small",

    "dimensions": {
      "requirements": 0,
      "functionality": 0,
      "components": 0,
      "data": 0,
      "integrations": 0,
      "users": 0,
      "infrastructure": 0,
      "security": 0,
      "deployment": 0,
      "operations": 0,
      "dependencies": 0,
      "coordination": 0
    },

    "explicitScope": "explicit",
    "scopeEvidence": [],
    "uncertainty": "low"
  },

  "reasoning": {
    "summary": "",
    "evidence": [],
    "assumptions": [],
    "uncertainties": [],
    "contradictions": []
  },

  "scopeSignals": [],
  "capabilities": [],
  "components": [],
  "integrations": [],
  "dataDomains": [],
  "userRoles": [],
  "dependencies": [],
  "constraints": []
}

=========================================================
FINAL RULE
=========================================================

Understand the request semantically.

Do not classify using a hard-coded application dictionary.
`;


/* =========================================================
   AI REQUEST
========================================================= */

async function requestSemanticClassification(
  prompt,
  memoryContext
) {

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
        MAX_MEMORY_LENGTH
      );
  }


  return generateJSON({

    messages: [

      {
        role: "system",
        content:
          INTENT_SYSTEM_PROMPT
      },

      {
        role: "user",

        content: `

CURRENT USER REQUEST:

${prompt}

OPTIONAL MEMORY CONTEXT:

${memorySummary}

IMPORTANT:

Classify ONLY the current request.

Memory may provide context but must not override
the actual current request.

Do not invent requirements.

Return only the required JSON object.

`

      }

    ],

    maxTokens: 2200,

    thinkingLevel: "medium"

  });
}


/* =========================================================
   SAFE FALLBACK
   ---------------------------------------------------------
   No semantic keyword fallback.
   If AI classification is unavailable, do not pretend
   that semantic classification succeeded.
========================================================= */

function createUnavailableClassification(
  reason
) {

  const result =
    createDefaultIntent();

  result.confidence =
    0;

  result.reasoning = {

    summary:
      "Semantic intent classification was unavailable.",

    evidence:
      [],

    assumptions:
      [],

    uncertainties:
      [
        cleanString(
          reason,
          MAX_REASON_LENGTH
        ) ||
        "AI classification unavailable."
      ],

    contradictions:
      []

  };

  return result;
}


/* =========================================================
   MAIN INTENT AGENT
========================================================= */

async function intentAgent(
  data = {}
) {

  const startedAt =
    Date.now();


  try {

    logInfo(
      `🧠 ZyrionOS Intent Agent ${INTENT_AGENT_VERSION} Started`
    );


    /* =====================================================
       INPUT
    ===================================================== */

    const prompt =
      cleanString(
        data?.prompt,
        MAX_PROMPT_LENGTH
      );


    const memoryContext =
      data?.memoryContext ||
      null;


    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    if (!prompt) {

      return {

        success: false,

        message:
          "Prompt required",

        type:
          "chat",

        data:
          createDefaultIntent(),

        metadata: {

          durationMs:
            Date.now() -
            startedAt,

          version:
            INTENT_AGENT_VERSION

        }

      };
    }


    /* =====================================================
       SEMANTIC AI CLASSIFICATION
    ===================================================== */

    const result =
      await requestSemanticClassification(
        prompt,
        memoryContext
      );


    /* =====================================================
       PROVIDER FAILURE
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      const reason =
        result?.message ||
        result?.error ||
        "AI intent classification unavailable.";

      logError(
        `Intent classification unavailable: ${reason}`
      );


      /*
       * IMPORTANT:
       * Do not make up a semantic classification.
       */

      return {

        success: false,

        message:
          "Intent classification unavailable.",

        error:
          reason,

        type:
          "chat",

        data:
          createUnavailableClassification(
            reason
          ),

        provider:
          result?.provider ||
          null,

        model:
          result?.model ||
          null,

        metadata: {

          durationMs:
            Date.now() -
            startedAt,

          fallback:
            false,

          semanticClassification:
            false,

          version:
            INTENT_AGENT_VERSION

        }

      };
    }


    /* =====================================================
       STRUCTURED RESPONSE
    ===================================================== */

    const parsed =
      normalizeAIResult(
        result.data
      );


    if (!parsed) {

      logError(
        "Intent Agent received invalid structured output."
      );


      return {

        success: false,

        message:
          "Invalid semantic intent response.",

        type:
          "chat",

        data:
          createUnavailableClassification(
            "Invalid AI structured response."
          ),

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null,

        metadata: {

          durationMs:
            Date.now() -
            startedAt,

          fallback:
            false,

          semanticClassification:
            false,

          version:
            INTENT_AGENT_VERSION

        }

      };
    }


    /* =====================================================
       NORMALIZATION
    ===================================================== */

    let intent =
      normalizeIntent(
        parsed
      );


    /* =====================================================
       ROUTING CONTRACT
    ===================================================== */

    intent =
      applyRoutingContract(
        intent
      );


    /* =====================================================
       CONTRACT VALIDATION
    ===================================================== */

    const validationErrors =
      validateIntentContract(
        intent
      );


    /* =====================================================
       CONTRADICTION HANDLING
    ===================================================== */

    if (
      validationErrors.length
    ) {

      intent.reasoning =
        intent.reasoning ||
        {};

      intent.reasoning.contradictions =
        [
          ...new Set([
            ...(intent.reasoning.contradictions || []),
            ...validationErrors
          ])
        ];


      /*
       * If the semantic result is structurally
       * contradictory, do not silently pretend
       * it is trustworthy.
       */

      if (
        intent.confidence < 70 ||
        validationErrors.length >= 2
      ) {

        logWarning(
          `Intent classification rejected: ${validationErrors.join(
            " | "
          )}`
        );


        return {

          success: false,

          message:
            "Intent classification failed contract validation.",

          type:
            intent.type,

          data:
            intent,

          provider:
            result.provider ||
            null,

          model:
            result.model ||
            null,

          metadata: {

            durationMs:
              Date.now() -
              startedAt,

            fallback:
              false,

            semanticClassification:
              true,

            contractValid:
              false,

            validationErrors,

            version:
              INTENT_AGENT_VERSION

          }

        };
      }
    }


    /* =====================================================
       BUILD CONTRACT
    ===================================================== */

    if (
      intent.type === "build"
    ) {

      /*
       * These are architectural invariants,
       * not domain-specific classification.
       */

      intent.requiresPlanning =
        true;

      intent.requiresBuild =
        true;

      const agents =
        new Set(
          intent.requiredAgents
        );

      agents.add(
        "planningAgent"
      );

      agents.add(
        "builderAgent"
      );

      intent.requiredAgents =
        [
          ...agents
        ].filter(
          (agent) =>
            KNOWN_AGENTS.includes(
              agent
            )
        );
    }


    /* =====================================================
       FINAL LOG
    ===================================================== */

    logSuccess(

      `Intent Detected: ${intent.type}` +
      ` | Complexity: ${intent.complexity}` +
      ` | Scale: ${intent.projectScale}` +
      ` | Confidence: ${intent.confidence}%` +
      ` | Engineering: ${intent.engineering.level}` +
      ` | Agents: ${intent.requiredAgents.join(", ") || "none"}` +
      ` | Provider: ${result.provider || "unknown"}` +
      ` | Model: ${result.model || "unknown"}`

    );


    /* =====================================================
       RESPONSE
    ===================================================== */

    return {

      success: true,

      type:
        intent.type,

      data:
        intent,

      provider:
        result.provider,

      model:
        result.model,

      metadata: {

        durationMs:
          Date.now() -
          startedAt,

        fallback:
          false,

        semanticClassification:
          true,

        contractValid:
          validationErrors.length === 0,

        validationErrors,

        version:
          INTENT_AGENT_VERSION

      }

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown Intent Agent error";


    logError(
      `Intent Agent Failed: ${errorMessage}`
    );


    /*
     * No hard-coded semantic fallback.
     *
     * We deliberately fail instead of incorrectly
     * classifying an unknown request.
     */

    return {

      success: false,

      message:
        "Intent Agent failed.",

      error:
        errorMessage,

      type:
        "chat",

      data:
        createUnavailableClassification(
          errorMessage
        ),

      provider:
        null,

      model:
        null,

      metadata: {

        durationMs:
          Date.now() -
          startedAt,

        fallback:
          false,

        semanticClassification:
          false,

        version:
          INTENT_AGENT_VERSION

      }

    };
  }
}


/* =========================================================
   OPTIONAL PUBLIC HELPERS
   ---------------------------------------------------------
   Useful for testing without exposing internal
   classification dictionaries.
========================================================= */

intentAgent.VERSION =
  INTENT_AGENT_VERSION;

intentAgent.validateIntent =
  validateIntentContract;

intentAgent.normalizeIntent =
  normalizeIntent;


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  intentAgent;
