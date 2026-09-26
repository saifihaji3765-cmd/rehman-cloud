/* =========================================================
   ZYRIONOS INTENT AGENT
   ---------------------------------------------------------
   Production Intent Router

   RESPONSIBILITY:
   - Classify the CURRENT user request
   - Identify primary + secondary operations
   - Estimate request/project complexity
   - Identify project scale
   - Select existing downstream agents
   - Preserve compatibility with Master Agent

   DOES NOT:
   - Generate source code
   - Generate project files
   - Create architecture
   - Create requirements
   - Execute tools
   - Deploy infrastructure
   - Modify files
   - Claim task completion

   IMPORTANT:
   - No provider is hardcoded here.
   - All AI calls go through aiProviderService.
   - Provider fallback/cooldown is handled centrally.
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


/*
 * IMPORTANT
 * These names must match the actual agents
 * available in server/agents/.
 *
 * Current repository uses:
 *
 * planningAgent.js
 * builderAgent.js
 * deployAgent.js
 * monitoringAgent.js
 * scalingAgent.js
 * billingAgent.js
 * subscriptionAgent.js
 * memoryAgent.js
 * fixAgent.js
 * fileAgent.js
 */

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

const MAX_GOAL_LENGTH = 1500;

const MAX_SECONDARY_INTENTS = 4;

const MAX_REQUIRED_AGENTS = 8;

const MAX_SCOPE_SIGNALS = 20;


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
        "Unable to serialize context"

    });

  }

}


/* =========================================================
   NORMALIZE ARRAY
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
      [],

    secondaryIntents:
      [],

    projectScale:
      "none",

    requestKind:
      "question",

    scopeSignals:
      [],

    requiresPlanning:
      false,

    requiresBuild:
      false,

    requiresExecution:
      false

  };

}


/* =========================================================
   DETERMINISTIC INTENT DETECTION
   ---------------------------------------------------------
   This is NOT a replacement for AI.

   It is a safety fallback so that a temporary
   provider failure does not turn a build request
   into "chat".
========================================================= */

function detectDeterministicIntent(
  prompt
) {

  const text =
    cleanString(
      prompt,
      MAX_PROMPT_LENGTH
    )
      .toLowerCase();


  const result =
    createDefaultIntent();


  if (
    !text
  ) {

    return result;

  }


  /*
   * BUILD
   */

  const buildSignals = [

    "build",
    "create app",
    "create application",
    "create website",
    "create web app",
    "create saas",
    "build app",
    "build website",
    "build saas",
    "develop",
    "generate code",
    "generate application",
    "make an app",
    "make a website",
    "make a platform",
    "make a system",
    "implement feature",
    "add feature",
    "create frontend",
    "create backend",
    "create api"

  ];


  /*
   * FIX
   */

  const fixSignals = [

    "fix",
    "debug",
    "bug",
    "broken",
    "error",
    "crash",
    "not working",
    "doesn't work",
    "does not work",
    "repair",
    "resolve issue",
    "runtime error",
    "build error",
    "compile error"

  ];


  /*
   * DEPLOY
   */

  const deploySignals = [

    "deploy",
    "deployment",
    "publish",
    "put live",
    "go live",
    "host",
    "release"

  ];


  /*
   * MONITOR
   */

  const monitorSignals = [

    "monitor",
    "health",
    "cpu",
    "ram",
    "memory usage",
    "uptime",
    "availability",
    "logs",
    "service health"

  ];


  /*
   * SCALE
   */

  const scaleSignals = [

    "scale",
    "scaling",
    "increase capacity",
    "decrease capacity",
    "more instances",
    "autoscale",
    "auto scale"

  ];


  /*
   * BILLING
   */

  const billingSignals = [

    "billing",
    "invoice",
    "charge",
    "charged",
    "payment charge",
    "pricing",
    "cost"

  ];


  /*
   * SUBSCRIPTION
   */

  const subscriptionSignals = [

    "subscription",
    "plan",
    "upgrade plan",
    "downgrade plan",
    "cancel subscription",
    "subscription limit"

  ];


  /*
   * FILE
   */

  const fileSignals = [

    "file",
    "files",
    "folder",
    "directory",
    "read file",
    "modify file",
    "delete file",
    "rename file"

  ];


  /*
   * AUTOMATION
   */

  const automationSignals = [

    "automation",
    "automate",
    "workflow",
    "automated workflow",
    "scheduled workflow",
    "repeated process"

  ];


  /*
   * INFRASTRUCTURE
   */

  const infrastructureSignals = [

    "aws",
    "ecs",
    "ec2",
    "s3",
    "load balancer",
    "database",
    "redis",
    "docker",
    "container",
    "network",
    "vpc",
    "cloud architecture",
    "infrastructure"

  ];


  /*
   * THUMBNAIL
   */

  const thumbnailSignals = [

    "thumbnail",
    "video thumbnail",
    "youtube thumbnail"

  ];


  function hasSignal(
    signals
  ) {

    return signals.some(
      (signal) =>
        text.includes(
          signal
        )
    );

  }


  const hasBuild =
    hasSignal(
      buildSignals
    );


  const hasFix =
    hasSignal(
      fixSignals
    );


  const hasDeploy =
    hasSignal(
      deploySignals
    );


  const hasMonitor =
    hasSignal(
      monitorSignals
    );


  const hasScale =
    hasSignal(
      scaleSignals
    );


  const hasBilling =
    hasSignal(
      billingSignals
    );


  const hasSubscription =
    hasSignal(
      subscriptionSignals
    );


  const hasFile =
    hasSignal(
      fileSignals
    );


  const hasAutomation =
    hasSignal(
      automationSignals
    );


  const hasInfrastructure =
    hasSignal(
      infrastructureSignals
    );


  const hasThumbnail =
    hasSignal(
      thumbnailSignals
    );


  /*
   * Priority:
   *
   * Fix > Build > Deploy > Scale >
   * Monitor > Infrastructure >
   * Billing > Subscription >
   * File > Automation > Thumbnail
   *
   * This is only a fallback.
   */

  if (
    hasFix
  ) {

    result.type =
      "fix";

    result.requestKind =
      "repair";

  }

  else if (
    hasBuild
  ) {

    result.type =
      "build";

    result.requestKind =
      "creation";

  }

  else if (
    hasDeploy
  ) {

    result.type =
      "deploy";

    result.requestKind =
      "operation";

  }

  else if (
    hasScale
  ) {

    result.type =
      "scale";

    result.requestKind =
      "operation";

  }

  else if (
    hasMonitor
  ) {

    result.type =
      "monitor";

    result.requestKind =
      "inspection";

  }

  else if (
    hasInfrastructure
  ) {

    result.type =
      "infrastructure";

    result.requestKind =
      "planning";

  }

  else if (
    hasBilling
  ) {

    result.type =
      "billing";

    result.requestKind =
      "question";

  }

  else if (
    hasSubscription
  ) {

    result.type =
      "subscription";

    result.requestKind =
      "question";

  }

  else if (
    hasFile
  ) {

    result.type =
      "file";

    result.requestKind =
      "operation";

  }

  else if (
    hasAutomation
  ) {

    result.type =
      "automation";

    result.requestKind =
      "creation";

  }

  else if (
    hasThumbnail
  ) {

    result.type =
      "thumbnail";

    result.requestKind =
      "generation";

  }


  /*
   * Secondary intents
   */

  const secondary =
    [];


  if (
    hasBuild &&
    result.type !== "build"
  ) {

    secondary.push(
      "build"
    );

  }


  if (
    hasDeploy &&
    result.type !== "deploy"
  ) {

    secondary.push(
      "deploy"
    );

  }


  if (
    hasInfrastructure &&
    result.type !== "infrastructure"
  ) {

    secondary.push(
      "infrastructure"
    );

  }


  if (
    hasAutomation &&
    result.type !== "automation"
  ) {

    secondary.push(
      "automation"
    );

  }


  result.secondaryIntents =
    secondary.slice(
      0,
      MAX_SECONDARY_INTENTS
    );


  /*
   * Large project detection.
   */

  const projectSignals = [

    "saas",
    "platform",
    "enterprise",
    "full stack",
    "full-stack",
    "marketplace",
    "dashboard",
    "admin panel",
    "authentication",
    "authorization",
    "database",
    "payment",
    "subscription",
    "api",
    "backend",
    "frontend",
    "microservice",
    "multi tenant",
    "multi-tenant",
    "real time",
    "realtime",
    "production",
    "production ready",
    "scalable",
    "scalable system",
    "complete system",
    "complete application"

  ];


  const matchedProjectSignals =
    projectSignals.filter(
      (signal) =>
        text.includes(
          signal
        )
    );


  /*
   * Explicitly large language.
   */

  const largeSignals = [

    "large project",
    "huge project",
    "big project",
    "enterprise application",
    "enterprise platform",
    "complete platform",
    "complete saas",
    "full platform",
    "production platform",
    "entire system",
    "whole system"

  ];


  const explicitlyLarge =
    largeSignals.some(
      (signal) =>
        text.includes(
          signal
        )
    );


  if (
    explicitlyLarge ||
    matchedProjectSignals.length >= 5
  ) {

    result.projectScale =
      "large_project";

  }

  else if (
    matchedProjectSignals.length >= 2
  ) {

    result.projectScale =
      "application";

  }

  else if (
    result.type === "build" ||
    result.type === "fix"
  ) {

    result.projectScale =
      "feature";

  }

  else if (
    result.type !== "chat"
  ) {

    result.projectScale =
      "task";

  }


  result.scopeSignals =
    matchedProjectSignals.slice(
      0,
      MAX_SCOPE_SIGNALS
    );


  /*
   * Complexity.
   */

  if (
    result.projectScale === "large_project"
  ) {

    result.complexity =
      "high";

  }

  else if (
    result.projectScale === "application"
  ) {

    result.complexity =
      "high";

  }

  else if (
    result.type === "build" ||
    result.type === "fix" ||
    result.type === "infrastructure"
  ) {

    result.complexity =
      "medium";

  }

  else {

    result.complexity =
      "low";

  }


  /*
   * Agent routing.
   */

  result.requiredAgents =
    getFallbackAgents(
      result.type,
      result.projectScale
    );


  result.requiresPlanning =
    [

      "build",
      "fix",
      "automation",
      "infrastructure",
      "scale"

    ].includes(
      result.type
    );


  result.requiresBuild =
    result.type === "build";


  result.requiresExecution =
    [

      "deploy",
      "monitor",
      "scale",
      "billing",
      "subscription",
      "file"

    ].includes(
      result.type
    );


  result.confidence =
    65;


  return result;

}


/* =========================================================
   DEFAULT AGENT ROUTING
========================================================= */

function getFallbackAgents(
  type,
  projectScale = "none"
) {

  switch (
    type
  ) {

    case "build":

      /*
       * Requirement/architecture agents are
       * deliberately NOT added here yet.
       *
       * We first audit planningAgent.
       *
       * This prevents duplicate architecture logic.
       */

      return [

        "planningAgent",
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

        "planningAgent"

      ];


    case "infrastructure":

      return [

        "planningAgent"

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
  type,
  projectScale
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

        /*
         * Backward compatibility:
         *
         * Old Intent Agent used "plannerAgent".
         * Actual repository uses planningAgent.js.
         */

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
        type,
        projectScale
      );

  }


  /*
   * Never let the Intent Agent
   * create an impossible route.
   */

  return normalized
    .slice(
      0,
      MAX_REQUIRED_AGENTS
    );

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
   NORMALIZE COMPLEXITY
========================================================= */

function normalizeComplexity(
  value
) {

  const complexity =
    cleanString(
      value,
      50
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
   NORMALIZE PROJECT SCALE
========================================================= */

function normalizeProjectScale(
  value
) {

  const scale =
    cleanString(
      value,
      50
    )
      .toLowerCase();


  if (
    VALID_PROJECT_SCALES.includes(
      scale
    )
  ) {

    return scale;

  }


  return "none";

}


/* =========================================================
   NORMALIZE REQUEST KIND
========================================================= */

function normalizeRequestKind(
  value
) {

  const kind =
    cleanString(
      value,
      50
    )
      .toLowerCase();


  if (
    VALID_REQUEST_KINDS.includes(
      kind
    )
  ) {

    return kind;

  }


  return "question";

}


/* =========================================================
   NORMALIZE SECONDARY INTENTS
========================================================= */

function normalizeSecondaryIntents(
  value
) {

  return normalizeStringArray(
    value,
    MAX_SECONDARY_INTENTS,
    50
  )
    .map(
      (item) =>
        item.toLowerCase()
    )
    .filter(
      (item) =>
        VALID_INTENTS.includes(
          item
        )
    );

}


/* =========================================================
   NORMALIZE INTENT
========================================================= */

function normalizeIntent(
  parsed,
  prompt
) {

  const fallback =
    detectDeterministicIntent(
      prompt
    );


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
      fallback.type;

  }


  let goal =
    cleanString(
      parsed.goal,
      MAX_GOAL_LENGTH
    );


  if (
    !goal
  ) {

    goal =
      fallback.goal ||
      "general interaction";

  }


  let complexity =
    normalizeComplexity(
      parsed.complexity
    );


  let projectScale =
    normalizeProjectScale(
      parsed.projectScale
    );


  let requestKind =
    normalizeRequestKind(
      parsed.requestKind
    );


  /*
   * Deterministic safety overrides.
   *
   * If the user clearly asked for a huge
   * project, the AI cannot downgrade it
   * to a tiny task.
   */

  if (
    fallback.projectScale ===
    "large_project"
  ) {

    projectScale =
      "large_project";

    complexity =
      "high";

  }

  else if (
    fallback.projectScale ===
    "application" &&
    projectScale ===
    "none"
  ) {

    projectScale =
      "application";

  }


  /*
   * Build requests always require
   * planning before Builder.
   */

  if (
    type === "build"
  ) {

    complexity =
      complexity === "low"
        ? "medium"
        : complexity;

    projectScale =
      projectScale === "none"
        ? fallback.projectScale === "none"
          ? "feature"
          : fallback.projectScale
        : projectScale;

  }


  const secondaryIntents =
    normalizeSecondaryIntents(
      parsed.secondaryIntents
    );


  const scopeSignals =
    normalizeStringArray(
      parsed.scopeSignals,
      MAX_SCOPE_SIGNALS,
      150
    );


  const requiredAgents =
    normalizeRequiredAgents(
      parsed.requiredAgents,
      type,
      projectScale
    );


  const requiresPlanning =
    Boolean(
      parsed.requiresPlanning
    ) ||
    [

      "build",
      "fix",
      "automation",
      "infrastructure",
      "scale"

    ].includes(
      type
    );


  const requiresBuild =
    Boolean(
      parsed.requiresBuild
    ) ||
    type === "build";


  const requiresExecution =
    Boolean(
      parsed.requiresExecution
    ) ||
    [

      "deploy",
      "monitor",
      "scale",
      "billing",
      "subscription",
      "file"

    ].includes(
      type
    );


  return {

    type,

    goal,

    complexity,

    confidence:
      normalizeConfidence(
        parsed.confidence
      ),

    requiredAgents,

    secondaryIntents,

    projectScale,

    requestKind,

    scopeSignals,

    requiresPlanning,

    requiresBuild,

    requiresExecution

  };

}


/* =========================================================
   SYSTEM PROMPT
========================================================= */

const INTENT_SYSTEM_PROMPT = `

You are the Intent Detection Agent
of ZyrionOS Autonomous AI OS.

YOUR ROLE:
Classify and route the CURRENT user request.

You are a ROUTER.

You are NOT a builder.
You are NOT a planner.
You are NOT an architect.
You are NOT a requirement analyst.
You are NOT a deployment executor.

Do not generate source code.

Do not generate project files.

Do not create architecture.

Do not create detailed requirements.

Do not execute actions.

Do not claim success.

Your output will be consumed by downstream agents.

=========================================================
VALID PRIMARY INTENTS
=========================================================

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
VALID AGENTS
=========================================================

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

Never invent an agent name.

=========================================================
INTENT DEFINITIONS
=========================================================

chat:
General conversation, explanation,
question, advice, or discussion.

build:
Create, develop, generate, implement,
or modify software, applications,
websites, APIs, frontend, backend,
features, platforms, or SaaS systems.

deploy:
Deploy, publish, host, release,
or make an existing project live.

monitor:
Inspect runtime health, deployment health,
service health, CPU, RAM, logs,
availability, or infrastructure metrics.

scale:
Increase or decrease infrastructure
or application capacity.

billing:
Pricing, invoices, charges,
payment charges, or billing information.

subscription:
Subscription plans, limits,
upgrades, downgrades, cancellation,
or subscription lifecycle.

fix:
Debug, diagnose, repair, correct,
or resolve broken software/code.

file:
Direct file or folder operations.

automation:
Automated workflows, repeated processes,
scheduled workflows, or automation logic.

infrastructure:
Cloud architecture, AWS, containers,
servers, networking, databases,
or infrastructure planning.

thumbnail:
Thumbnail generation specifically.

=========================================================
PROJECT SCALE
=========================================================

none:
No software project is involved.

task:
Small operational task.

feature:
A single feature or limited modification.

application:
A normal application or multi-feature project.

large_project:
Large SaaS, platform, enterprise application,
full-stack system, multi-module application,
or complex production project.

system:
Large interconnected software system
with multiple major subsystems.

=========================================================
REQUEST KIND
=========================================================

question
creation
modification
repair
operation
planning
inspection
generation

=========================================================
COMPLEXITY
=========================================================

low
medium
high

A large software project MUST be high complexity.

=========================================================
ROUTING RULES
=========================================================

1. Classify ONLY the CURRENT request.

2. Memory is context only.
   Never let memory override the current request.

3. Build software:
   type = build.

4. Repair broken software:
   type = fix.

5. Deploy an existing project:
   type = deploy.

6. Runtime/service inspection:
   type = monitor.

7. Capacity changes:
   type = scale.

8. Billing charges/invoices/pricing:
   type = billing.

9. Subscription lifecycle:
   type = subscription.

10. Direct file operations:
    type = file.

11. Cloud architecture/resources:
    type = infrastructure.

12. Automated workflows:
    type = automation.

13. Thumbnail creation:
    type = thumbnail.

14. General conversation:
    type = chat.

15. If a request contains multiple operations,
    choose the PRIMARY operation as "type"
    and put other clearly relevant operations
    inside "secondaryIntents".

16. Never put an agent in requiredAgents
    unless that agent exists in VALID AGENTS.

17. For build requests:
    planningAgent must be included.

18. For build requests:
    builderAgent must be included.

19. Do NOT invent requirementAgent or
    architectureAgent yet. Those agents will
    only be added after the existing planning
    architecture is audited and intentionally
    introduced.

20. The Intent Agent must NOT decide exact files.

21. The Intent Agent must NOT decide exact
    architecture.

22. The Intent Agent must NOT decide detailed
    dependencies.

23. The Intent Agent only identifies the request
    and routes it.

24. Large project size does NOT mean generating
    a giant Intent response.

25. Keep output compact and machine-readable.

=========================================================
OUTPUT
=========================================================

Return ONLY valid JSON.

Required structure:

{
  "type": "build",
  "goal": "short description of current request",
  "complexity": "high",
  "confidence": 0,
  "requiredAgents": [
    "planningAgent",
    "builderAgent"
  ],
  "secondaryIntents": [],
  "projectScale": "large_project",
  "requestKind": "creation",
  "scopeSignals": [],
  "requiresPlanning": true,
  "requiresBuild": true,
  "requiresExecution": false
}

No markdown.
No explanation.
No code.
`;


/* =========================================================
   BUILD REQUEST SAFETY
========================================================= */

function enforceBuildRouting(
  intent
) {

  if (
    intent.type !== "build"
  ) {

    return intent;

  }


  const required =
    new Set(
      intent.requiredAgents
    );


  required.add(
    "planningAgent"
  );


  required.add(
    "builderAgent"
  );


  intent.requiredAgents =
    [

      ...required

    ].filter(
      (agent) =>
        KNOWN_AGENTS.includes(
          agent
        )
    );


  intent.requiresPlanning =
    true;


  intent.requiresBuild =
    true;


  if (
    intent.projectScale ===
    "large_project"
  ) {

    intent.complexity =
      "high";

  }


  return intent;

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

    logger.info(
      "🧠 ZyrionOS Intent Agent Started"
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
          createDefaultIntent(),

        metadata: {

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       DETERMINISTIC BASELINE
       -----------------------------------------------------
       This gives us a safe route even when
       the AI provider is unavailable.
    ===================================================== */

    const deterministicIntent =
      detectDeterministicIntent(
        prompt
      );


    /* =====================================================
       MEMORY SUMMARY
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
       AI REQUEST
       -----------------------------------------------------
       IMPORTANT:
       No provider is specified here.

       aiProviderService is responsible for:
       - provider routing
       - fallback
       - retry
       - cooldown
       - structured JSON validation
    ===================================================== */

    const result =
      await generateJSON({

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

${memorySummary}

DETERMINISTIC ROUTING HINT:

Primary intent:
${deterministicIntent.type}

Project scale:
${deterministicIntent.projectScale}

Complexity:
${deterministicIntent.complexity}

These hints are safety signals.
Use the CURRENT USER REQUEST as the
actual source of truth.

Classify ONLY the current request.

`

          }

        ],

        maxTokens:
          1400,

        thinkingLevel:
          "low"

      });


    /* =====================================================
       PROVIDER FAILURE
       -----------------------------------------------------
       Do NOT convert a clear build request
       into chat merely because AI failed.
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      logger.warn(
        "Intent AI provider unavailable. Using deterministic routing fallback."
      );


      const fallback =
        enforceBuildRouting(
          deterministicIntent
        );


      return {

        success:
          true,

        type:
          fallback.type,

        data:
          fallback,

        provider:
          "deterministic-fallback",

        model:
          "local-routing",

        warning:
          "AI intent classification unavailable; deterministic routing used.",

        metadata: {

          durationMs:
            Date.now() -
            startedAt,

          fallback:
            true

        }

      };

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

      logger.warn(
        "Intent AI returned invalid structured data. Using deterministic routing fallback."
      );


      const fallback =
        enforceBuildRouting(
          deterministicIntent
        );


      return {

        success:
          true,

        type:
          fallback.type,

        data:
          fallback,

        provider:
          "deterministic-fallback",

        model:
          "local-routing",

        warning:
          "Invalid AI intent response; deterministic routing used.",

        metadata: {

          durationMs:
            Date.now() -
            startedAt,

          fallback:
            true

        }

      };

    }


    /* =====================================================
       NORMALIZATION
    ===================================================== */

    const normalized =
      normalizeIntent(
        result.data,
        prompt
      );


    /* =====================================================
       SAFETY ROUTING
    ===================================================== */

    const finalIntent =
      enforceBuildRouting(
        normalized
      );


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(

      `Intent Detected: ${finalIntent.type}` +
      ` | Complexity: ${finalIntent.complexity}` +
      ` | Scale: ${finalIntent.projectScale}` +
      ` | Confidence: ${finalIntent.confidence}%` +
      ` | Agents: ${finalIntent.requiredAgents.join(", ") || "none"}` +
      ` | Provider: ${result.provider || "unknown"}` +
      ` | Model: ${result.model || "unknown"}`

    );


    /* =====================================================
       RESPONSE
    ===================================================== */

    return {

      success:
        true,

      type:
        finalIntent.type,

      data:
        finalIntent,

      provider:
        result.provider,

      model:
        result.model,

      metadata: {

        durationMs:
          Date.now() -
          startedAt,

        fallback:
          false

      }

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


    /*
     * CRITICAL:
     *
     * Even if the AI provider completely fails,
     * do not destroy the routing decision.
     *
     * We run the deterministic classifier again.
     */

    const prompt =
      cleanString(
        data?.prompt,
        MAX_PROMPT_LENGTH
      );


    const fallback =
      enforceBuildRouting(
        detectDeterministicIntent(
          prompt
        )
      );


    return {

      success:
        true,

      type:
        fallback.type,

      data:
        fallback,

      provider:
        "deterministic-fallback",

      model:
        "local-routing",

      warning:
        errorMessage,

      metadata: {

        durationMs:
          Date.now() -
          startedAt,

        fallback:
          true

      }

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  intentAgent;
