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

const logger = require("../services/loggerService");

const {
  generateJSON
} = require("../services/ai/aiProviderService");


/* =========================================================
   CONSTANTS
========================================================= */

const INTENT_AGENT_VERSION = "4.0.0";

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

const MAX_PROMPT_LENGTH = 12000;
const MAX_MEMORY_LENGTH = 3500;
const MAX_GOAL_LENGTH = 1500;
const MAX_SECONDARY_INTENTS = 4;
const MAX_REQUIRED_AGENTS = 8;
const MAX_SCOPE_SIGNALS = 20;


/* =========================================================
   LOGGER COMPATIBILITY
   ---------------------------------------------------------
   Some logger implementations expose warning()
   while older versions expose warn().
========================================================= */

function logInfo(message) {
  try {
    if (logger && typeof logger.info === "function") {
      return logger.info(message);
    }

    if (logger && typeof logger.log === "function") {
      return logger.log(message);
    }
  } catch (_) {}
}

function logWarning(message) {
  try {
    if (logger && typeof logger.warning === "function") {
      return logger.warning(message);
    }

    if (logger && typeof logger.warn === "function") {
      return logger.warn(message);
    }

    if (logger && typeof logger.info === "function") {
      return logger.info(`[WARNING] ${message}`);
    }
  } catch (_) {}
}

function logError(message) {
  try {
    if (logger && typeof logger.error === "function") {
      return logger.error(message);
    }

    if (logger && typeof logger.info === "function") {
      return logger.info(`[ERROR] ${message}`);
    }
  } catch (_) {}
}

function logSuccess(message) {
  try {
    if (logger && typeof logger.success === "function") {
      return logger.success(message);
    }

    if (logger && typeof logger.info === "function") {
      return logger.info(`[SUCCESS] ${message}`);
    }
  } catch (_) {}
}


/* =========================================================
   HELPERS
========================================================= */

function cleanString(value, maxLength = 4000) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}


/* =========================================================
   SAFE JSON
========================================================= */

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (_) {
    return JSON.stringify({
      error: "Unable to serialize context"
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
  if (!Array.isArray(value)) {
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
        .slice(0, maxItems)
    )
  ];
}


/* =========================================================
   DEFAULT INTENT
========================================================= */

function createDefaultIntent() {
  return {
    type: "chat",
    goal: "general interaction",
    complexity: "low",
    confidence: 50,
    requiredAgents: [],
    secondaryIntents: [],
    projectScale: "none",
    requestKind: "question",
    scopeSignals: [],
    requiresPlanning: false,
    requiresBuild: false,
    requiresExecution: false
  };
}


/* =========================================================
   SIGNAL MATCHING
========================================================= */

function hasAnySignal(text, signals) {
  return signals.some(
    (signal) =>
      text.includes(signal)
  );
}

function countSignals(text, signals) {
  return signals.filter(
    (signal) =>
      text.includes(signal)
  ).length;
}


/* =========================================================
   SIMPLE BUILD DETECTION
   ---------------------------------------------------------
   CRITICAL:
   Small software requests must NOT automatically become
   feature/application projects.
========================================================= */

function detectSimpleBuildRequest(text) {

  const simpleBuildSignals = [
    "calculator",
    "simple calculator",
    "basic calculator",
    "todo",
    "todo app",
    "to-do",
    "to-do app",
    "counter",
    "counter app",
    "timer",
    "stopwatch",
    "simple form",
    "contact form",
    "login form",
    "signup form",
    "landing page",
    "simple landing page",
    "portfolio page",
    "simple portfolio",
    "button",
    "component",
    "ui component",
    "simple ui",
    "small ui",
    "simple website",
    "simple web page",
    "simple webpage",
    "small website",
    "small web app",
    "small app",
    "simple app",
    "basic app",
    "basic website",
    "basic web app",
    "converter",
    "unit converter",
    "age calculator",
    "percentage calculator",
    "interest calculator",
    "bmi calculator",
    "quiz",
    "simple quiz",
    "digital clock",
    "clock app",
    "notes app",
    "simple notes",
    "password generator",
    "random number generator",
    "text generator"
  ];

  return hasAnySignal(
    text,
    simpleBuildSignals
  );
}


/* =========================================================
   COMPLEX BUILD DETECTION
========================================================= */

function detectComplexBuildRequest(text) {

  const complexSignals = [
    "saas",
    "platform",
    "enterprise",
    "marketplace",
    "multi tenant",
    "multi-tenant",
    "microservice",
    "microservices",
    "authentication",
    "authorization",
    "database",
    "payment",
    "payments",
    "subscription",
    "billing system",
    "admin dashboard",
    "admin panel",
    "real time",
    "realtime",
    "websocket",
    "backend",
    "api",
    "multiple users",
    "user management",
    "role based access",
    "role-based access",
    "cloud infrastructure",
    "production infrastructure",
    "scalable",
    "scalable system",
    "complete system",
    "complete application",
    "full stack",
    "full-stack"
  ];

  return countSignals(
    text,
    complexSignals
  );
}


/* =========================================================
   DETERMINISTIC INTENT DETECTION
========================================================= */

function detectDeterministicIntent(prompt) {

  const text =
    cleanString(
      prompt,
      MAX_PROMPT_LENGTH
    ).toLowerCase();

  const result =
    createDefaultIntent();

  if (!text) {
    return result;
  }


  /* =======================================================
     SIGNALS
  ======================================================= */

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
    "create api",
    "create calculator",
    "build calculator",
    "make calculator",
    "create todo",
    "build todo",
    "make todo"
  ];

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

  const deploySignals = [
    "deploy",
    "deployment",
    "publish",
    "put live",
    "go live",
    "host",
    "release"
  ];

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

  const scaleSignals = [
    "scale",
    "scaling",
    "increase capacity",
    "decrease capacity",
    "more instances",
    "autoscale",
    "auto scale"
  ];

  const billingSignals = [
    "billing",
    "invoice",
    "charge",
    "charged",
    "payment charge",
    "pricing",
    "cost"
  ];

  const subscriptionSignals = [
    "subscription",
    "plan",
    "upgrade plan",
    "downgrade plan",
    "cancel subscription",
    "subscription limit"
  ];

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

  const automationSignals = [
    "automation",
    "automate",
    "workflow",
    "automated workflow",
    "scheduled workflow",
    "repeated process"
  ];

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

  const thumbnailSignals = [
    "thumbnail",
    "video thumbnail",
    "youtube thumbnail"
  ];


  /* =======================================================
     DETECTION
  ======================================================= */

  const hasBuild =
    hasAnySignal(
      text,
      buildSignals
    );

  const hasFix =
    hasAnySignal(
      text,
      fixSignals
    );

  const hasDeploy =
    hasAnySignal(
      text,
      deploySignals
    );

  const hasMonitor =
    hasAnySignal(
      text,
      monitorSignals
    );

  const hasScale =
    hasAnySignal(
      text,
      scaleSignals
    );

  const hasBilling =
    hasAnySignal(
      text,
      billingSignals
    );

  const hasSubscription =
    hasAnySignal(
      text,
      subscriptionSignals
    );

  const hasFile =
    hasAnySignal(
      text,
      fileSignals
    );

  const hasAutomation =
    hasAnySignal(
      text,
      automationSignals
    );

  const hasInfrastructure =
    hasAnySignal(
      text,
      infrastructureSignals
    );

  const hasThumbnail =
    hasAnySignal(
      text,
      thumbnailSignals
    );


  /* =======================================================
     PRIMARY INTENT
  ======================================================= */

  if (hasFix) {

    result.type = "fix";
    result.requestKind = "repair";

  } else if (hasBuild) {

    result.type = "build";
    result.requestKind = "creation";

  } else if (hasDeploy) {

    result.type = "deploy";
    result.requestKind = "operation";

  } else if (hasScale) {

    result.type = "scale";
    result.requestKind = "operation";

  } else if (hasMonitor) {

    result.type = "monitor";
    result.requestKind = "inspection";

  } else if (hasInfrastructure) {

    result.type = "infrastructure";
    result.requestKind = "planning";

  } else if (hasBilling) {

    result.type = "billing";
    result.requestKind = "question";

  } else if (hasSubscription) {

    result.type = "subscription";
    result.requestKind = "question";

  } else if (hasFile) {

    result.type = "file";
    result.requestKind = "operation";

  } else if (hasAutomation) {

    result.type = "automation";
    result.requestKind = "creation";

  } else if (hasThumbnail) {

    result.type = "thumbnail";
    result.requestKind = "generation";
  }


  /* =======================================================
     SECONDARY INTENTS
  ======================================================= */

  const secondary = [];

  if (
    hasBuild &&
    result.type !== "build"
  ) {
    secondary.push("build");
  }

  if (
    hasDeploy &&
    result.type !== "deploy"
  ) {
    secondary.push("deploy");
  }

  if (
    hasInfrastructure &&
    result.type !== "infrastructure"
  ) {
    secondary.push("infrastructure");
  }

  if (
    hasAutomation &&
    result.type !== "automation"
  ) {
    secondary.push("automation");
  }

  result.secondaryIntents =
    secondary.slice(
      0,
      MAX_SECONDARY_INTENTS
    );


  /* =======================================================
     PROJECT SCALE
  ======================================================= */

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
    hasAnySignal(
      text,
      largeSignals
    );

  const complexSignalCount =
    detectComplexBuildRequest(
      text
    );

  const simpleBuild =
    detectSimpleBuildRequest(
      text
    );


  /*
   * HIGHEST PRIORITY:
   * Explicitly large request.
   */

  if (
    explicitlyLarge ||
    complexSignalCount >= 6
  ) {

    result.projectScale =
      "large_project";

    result.complexity =
      "high";

  }

  /*
   * Normal multi-feature application.
   */

  else if (
    complexSignalCount >= 2
  ) {

    result.projectScale =
      "application";

    result.complexity =
      "high";

  }

  /*
   * SIMPLE SOFTWARE REQUEST.
   *
   * This is the critical calculator fix.
   */

  else if (
    result.type === "build" &&
    simpleBuild
  ) {

    result.projectScale =
      "task";

    result.complexity =
      "low";

  }

  /*
   * Small generic build.
   */

  else if (
    result.type === "build"
  ) {

    result.projectScale =
      "feature";

    result.complexity =
      "medium";

  }

  else if (
    result.type === "fix"
  ) {

    result.projectScale =
      "task";

    result.complexity =
      "low";

  }

  else if (
    result.type !== "chat"
  ) {

    result.projectScale =
      "task";

    result.complexity =
      "low";
  }


  /* =======================================================
     SCOPE SIGNALS
  ======================================================= */

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
        text.includes(signal)
    );

  result.scopeSignals =
    matchedProjectSignals.slice(
      0,
      MAX_SCOPE_SIGNALS
    );


  /* =======================================================
     AGENT ROUTING
  ======================================================= */

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

  result.confidence = 90;

  return result;
}


/* =========================================================
   FALLBACK AGENT ROUTING
========================================================= */

function getFallbackAgents(
  type,
  projectScale = "none"
) {

  switch (type) {

    case "build":
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

  if (Array.isArray(agents)) {

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
    ...new Set(normalized)
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

  return normalized.slice(
    0,
    MAX_REQUIRED_AGENTS
  );
}


/* =========================================================
   NORMALIZE CONFIDENCE
========================================================= */

function normalizeConfidence(value) {

  let confidence =
    Number(value);

  if (
    !Number.isFinite(
      confidence
    )
  ) {
    confidence = 70;
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

function normalizeComplexity(value) {

  const complexity =
    cleanString(
      value,
      50
    ).toLowerCase();

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

function normalizeProjectScale(value) {

  const scale =
    cleanString(
      value,
      50
    ).toLowerCase();

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

function normalizeRequestKind(value) {

  const kind =
    cleanString(
      value,
      50
    ).toLowerCase();

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

function normalizeSecondaryIntents(value) {

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
    Array.isArray(parsed)
  ) {
    return fallback;
  }


  let type =
    cleanString(
      parsed.type,
      50
    ).toLowerCase();

  if (
    !VALID_INTENTS.includes(type)
  ) {
    type =
      fallback.type;
  }


  let goal =
    cleanString(
      parsed.goal,
      MAX_GOAL_LENGTH
    );

  if (!goal) {
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


  /* =======================================================
     DETERMINISTIC OVERRIDES
  ======================================================= */

  /*
   * Explicitly large request can never become
   * a small task.
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


  /*
   * Application-level request cannot be
   * silently downgraded to none/task.
   */

  else if (
    fallback.projectScale ===
    "application"
  ) {

    if (
      projectScale === "none" ||
      projectScale === "task" ||
      projectScale === "feature"
    ) {

      projectScale =
        "application";
    }

    complexity =
      "high";
  }


  /*
   * CRITICAL SIMPLE-BUILD OVERRIDE.
   *
   * If deterministic analysis says this is
   * a simple calculator / todo / timer etc.,
   * AI cannot inflate it to feature/application.
   */

  else if (
    fallback.type === "build" &&
    fallback.projectScale === "task"
  ) {

    projectScale =
      "task";

    complexity =
      "low";
  }


  /*
   * Generic build without explicit scale.
   */

  else if (
    type === "build" &&
    projectScale === "none"
  ) {

    projectScale =
      fallback.projectScale === "none"
        ? "feature"
        : fallback.projectScale;
  }


  /*
   * Fix requests are normally tasks unless
   * deterministic analysis proves otherwise.
   */

  if (
    type === "fix" &&
    fallback.projectScale === "task" &&
    projectScale === "none"
  ) {

    projectScale =
      "task";

    complexity =
      "low";
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


  /*
   * For simple deterministic tasks, trust
   * deterministic confidence more than an
   * obviously wrong AI confidence.
   */

  let confidence =
    normalizeConfidence(
      parsed.confidence
    );

  if (
    fallback.projectScale === "task" &&
    fallback.type === type
  ) {

    confidence =
      Math.max(
        confidence,
        90
      );
  }


  return {

    type,

    goal,

    complexity,

    confidence,

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

Your ONLY job is to classify and route
the CURRENT user request.

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
Do not claim completion.

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

Never invent an agent.

=========================================================
PROJECT SCALE
=========================================================

none:
No software project.

task:
A small, self-contained task.

Examples:
- calculator
- timer
- counter
- simple todo
- simple form
- simple landing page
- small UI component
- basic converter
- simple utility

feature:
A meaningful feature or limited software modification
that is larger than a simple task.

application:
A normal multi-feature application.

Examples:
- SaaS dashboard
- application with authentication/database
- marketplace
- multi-feature web application

large_project:
Large production platform, enterprise application,
large SaaS, multi-module system.

system:
Large interconnected system with multiple
major subsystems.

=========================================================
CRITICAL SCALE RULE
=========================================================

DO NOT classify every build request as "feature".

A simple calculator is:

projectScale = "task"
complexity = "low"

A simple todo app is normally:

projectScale = "task"
complexity = "low"

A simple timer is normally:

projectScale = "task"
complexity = "low"

A simple landing page is normally:

projectScale = "task"
complexity = "low"

Only classify as "feature" when the request
actually requires more than a small self-contained task.

=========================================================
COMPLEXITY
=========================================================

low:
Small self-contained task.

medium:
Meaningful feature or moderately complex software.

high:
Application, large project, enterprise system,
or multiple major subsystems.

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
ROUTING
=========================================================

Build software:
type = build.

Repair broken software:
type = fix.

Deploy existing project:
type = deploy.

Runtime/service inspection:
type = monitor.

Capacity changes:
type = scale.

Billing:
type = billing.

Subscription lifecycle:
type = subscription.

Direct file operation:
type = file.

Automation:
type = automation.

Cloud/infrastructure:
type = infrastructure.

Thumbnail generation:
type = thumbnail.

General conversation:
type = chat.

For build requests:

requiredAgents MUST include:
planningAgent
builderAgent

Do not invent requirementAgent
or architectureAgent.

=========================================================
IMPORTANT
=========================================================

Classify ONLY the current request.

Do not let memory override the current request.

Do not inflate project scope merely because
the user owns a large platform.

A request to build a small calculator remains
a small task even if the surrounding platform
is ZyrionOS.

Return ONLY valid JSON.

Required structure:

{
  "type": "build",
  "goal": "build a simple calculator",
  "complexity": "low",
  "confidence": 95,
  "requiredAgents": [
    "planningAgent",
    "builderAgent"
  ],
  "secondaryIntents": [],
  "projectScale": "task",
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
   BUILD ROUTING SAFETY
========================================================= */

function enforceBuildRouting(intent, prompt = "") {

  const deterministic =
    detectDeterministicIntent(
      prompt
    );


  /*
   * Always guarantee build agents.
   */

  if (
    intent.type === "build"
  ) {

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
  }


  /*
   * SIMPLE BUILD HARD CLAMP.
   *
   * This is the final safety gate.
   */

  if (
    deterministic.type === "build" &&
    deterministic.projectScale === "task"
  ) {

    intent.type =
      "build";

    intent.projectScale =
      "task";

    intent.complexity =
      "low";

    intent.requiresPlanning =
      true;

    intent.requiresBuild =
      true;

    intent.requiredAgents =
      [
        "planningAgent",
        "builderAgent"
      ];

    intent.scopeSignals =
      [];

    intent.confidence =
      Math.max(
        normalizeConfidence(
          intent.confidence
        ),
        90
      );
  }


  /*
   * Large projects cannot be downgraded.
   */

  if (
    deterministic.projectScale ===
    "large_project"
  ) {

    intent.projectScale =
      "large_project";

    intent.complexity =
      "high";
  }


  /*
   * Application-level requests cannot
   * be reduced to a task.
   */

  if (
    deterministic.projectScale ===
    "application" &&
    intent.projectScale !==
      "large_project"
  ) {

    intent.projectScale =
      "application";

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
       VALIDATION
    ===================================================== */

    if (!prompt) {

      return {
        success: false,
        message: "Prompt required",
        type: "chat",
        data: createDefaultIntent(),
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
       DETERMINISTIC BASELINE
    ===================================================== */

    const deterministicIntent =
      detectDeterministicIntent(
        prompt
      );


    /* =====================================================
       MEMORY
    ===================================================== */

    let memorySummary =
      "No memory context provided.";

    if (memoryContext) {

      memorySummary =
        safeJson(
          memoryContext
        ).slice(
          0,
          MAX_MEMORY_LENGTH
        );
    }


    /* =====================================================
       AI REQUEST
    ===================================================== */

    const result =
      await generateJSON({

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

DETERMINISTIC SAFETY HINT:

Primary intent:
${deterministicIntent.type}

Project scale:
${deterministicIntent.projectScale}

Complexity:
${deterministicIntent.complexity}

This is only a safety hint.

Classify the CURRENT REQUEST.
Do not inflate a simple request into
a larger project.

`

          }

        ],

        maxTokens: 1400,

        thinkingLevel: "low"
      });


    /* =====================================================
       AI FAILURE
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      logWarning(
        "Intent AI provider unavailable. Using deterministic routing fallback."
      );


      const fallback =
        enforceBuildRouting(
          deterministicIntent,
          prompt
        );


      return {

        success: true,

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
            true,

          version:
            INTENT_AGENT_VERSION
        }
      };
    }


    /* =====================================================
       STRUCTURED RESPONSE VALIDATION
    ===================================================== */

    if (
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(
        result.data
      )
    ) {

      logWarning(
        "Intent AI returned invalid structured data. Using deterministic routing fallback."
      );


      const fallback =
        enforceBuildRouting(
          deterministicIntent,
          prompt
        );


      return {

        success: true,

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
            true,

          version:
            INTENT_AGENT_VERSION
        }
      };
    }


    /* =====================================================
       NORMALIZE
    ===================================================== */

    const normalized =
      normalizeIntent(
        result.data,
        prompt
      );


    /* =====================================================
       FINAL SAFETY ROUTING
    ===================================================== */

    const finalIntent =
      enforceBuildRouting(
        normalized,
        prompt
      );


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logSuccess(

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

      success: true,

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
          false,

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
     * FINAL DETERMINISTIC FALLBACK
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
        ),
        prompt
      );


    return {

      success: true,

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
          true,

        version:
          INTENT_AGENT_VERSION
      }

    };
  }
}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  intentAgent;
