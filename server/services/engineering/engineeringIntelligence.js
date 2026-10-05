/**
 * ================================================================
 * ZYRIONOS ENGINEERING INTELLIGENCE
 * ================================================================
 *
 * File:
 *   services/engineering/engineeringIntelligence.js
 *
 * Version:
 *   1.1.0
 *
 * Role:
 *   Engineering Diagnosis / Repair / Learning Intelligence
 *
 * IMPORTANT:
 *
 * This module can diagnose and propose/produce repairs.
 *
 * It NEVER declares an authoritative build successful.
 *
 * Only EngineeringExecutor can establish:
 *
 *   - real process execution
 *   - real exit code
 *   - authoritative build success
 *   - artifact creation
 *   - artifact checksum verification
 *
 * ================================================================
 */

"use strict";

/* ================================================================
   MODULE IDENTITY
================================================================ */

const INTELLIGENCE_VERSION =
  "1.1.0";

const ENGINEERING_SYSTEM_VERSION =
  "2.0.0";

/* ================================================================
   NODE MODULES
================================================================ */

const crypto =
  require("crypto");

/* ================================================================
   OPTIONAL DEPENDENCIES
================================================================ */

let engineeringState = null;
let aiProvider = null;

/* ================================================================
   SAFE REQUIRE
================================================================ */

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (_) {
    return null;
  }
}

/* ================================================================
   LOAD DEPENDENCIES
================================================================ */

function loadDependencies() {
  if (!engineeringState) {
    engineeringState =
      safeRequire("./engineeringState");
  }

  if (!aiProvider) {
    const candidates = [
      "../aiProviderService",
      "../services/aiProviderService",
      "../../services/aiProviderService",
      "../ai/providerService",
      "../../ai/providerService",
    ];

    for (const candidate of candidates) {
      const loaded =
        safeRequire(candidate);

      if (loaded) {
        aiProvider = loaded;
        break;
      }
    }
  }

  return {
    engineeringState,
    aiProvider,
  };
}

/* ================================================================
   FAILURE CATEGORIES
================================================================ */

const FAILURE_CATEGORIES =
  Object.freeze({
    SYNTAX: "syntax",
    DEPENDENCY: "dependency",
    MISSING_MODULE: "missing-module",
    CONFIGURATION: "configuration",
    PERMISSION: "permission",
    NETWORK: "network",
    TIMEOUT: "timeout",
    RESOURCE: "resource",
    PROCESS: "process-terminated",
    BUILD: "build",
    TEST: "test",
    RUNTIME: "runtime",
    ARTIFACT: "artifact",
    INVALID_COMMAND: "invalid-command",
    SECURITY: "security",
    UNKNOWN: "unknown",
  });

/* ================================================================
   REPAIR STRATEGIES
================================================================ */

const REPAIR_STRATEGIES =
  Object.freeze({
    SOURCE_FIX: "source-fix",
    DEPENDENCY_FIX: "dependency-fix",
    CONFIG_FIX: "configuration-fix",
    IMPORT_FIX: "import-fix",
    BUILD_SCRIPT_FIX: "build-script-fix",
    TEST_FIX: "test-fix",
    RUNTIME_FIX: "runtime-fix",
    ENVIRONMENT_FIX: "environment-fix",
    RESOURCE_ADJUSTMENT: "resource-adjustment",
    ARTIFACT_FIX: "artifact-fix",
    ROLLBACK: "rollback",
    NO_SAFE_REPAIR: "no-safe-repair",
  });

/* ================================================================
   DEFAULT INTELLIGENCE POLICY
================================================================ */

const DEFAULT_POLICY =
  Object.freeze({
    MAX_REPAIR_FILES: 25,

    MAX_DEPENDENCY_CHANGES: 15,

    MAX_SCOPE_EXPANSION: 1.5,

    MIN_REPAIR_CONFIDENCE: 0.70,

    MIN_HIGH_RISK_CONFIDENCE: 0.90,

    MAX_DIAGNOSIS_FILES: 100,

    MAX_ERROR_MESSAGES: 100,

    MAX_OUTPUT_CHARS: 50000,

    MAX_MEMORY_PATTERNS: 5000,

    MAX_REPAIR_PLAN_STEPS: 30,

    MAX_AI_REPAIR_ROUNDS: 2,

    MAX_PATCH_BYTES:
      2 * 1024 * 1024,

    MAX_FILE_BYTES:
      2 * 1024 * 1024,

    MAX_SECRET_SCAN_CHARS:
      200000,

    MAX_KNOWN_REPAIRS:
      10,
  });

/* ================================================================
   RETRYABLE CATEGORIES
================================================================ */

const RETRYABLE_CATEGORIES =
  new Set([
    FAILURE_CATEGORIES.NETWORK,
    FAILURE_CATEGORIES.TIMEOUT,
    FAILURE_CATEGORIES.RESOURCE,
    FAILURE_CATEGORIES.PROCESS,
  ]);

/* ================================================================
   HIGH-RISK REPAIR STRATEGIES
================================================================ */

const HIGH_RISK_STRATEGIES =
  new Set([
    REPAIR_STRATEGIES.DEPENDENCY_FIX,
    REPAIR_STRATEGIES.RESOURCE_ADJUSTMENT,
    REPAIR_STRATEGIES.ENVIRONMENT_FIX,
    REPAIR_STRATEGIES.ROLLBACK,
  ]);

/* ================================================================
   HASH
================================================================ */

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

/* ================================================================
   FILE HASH
================================================================ */

function calculateFilesHash(files) {
  const normalized =
    Array.isArray(files)
      ? files
          .map((file) => ({
            path: String(
              file?.path ||
              file?.name ||
              ""
            ),

            content: String(
              file?.content ||
              ""
            ),
          }))
          .sort((a, b) =>
            a.path.localeCompare(
              b.path
            )
          )
      : [];

  return sha256(
    JSON.stringify(
      normalized
    )
  );
}

/* ================================================================
   SAFE JSON
================================================================ */

function safeJsonParse(value) {
  if (
    typeof value !==
    "string"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

/* ================================================================
   CLONE
================================================================ */

function clone(value) {
  if (
    value ===
    undefined
  ) {
    return undefined;
  }

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch (_) {
    return null;
  }
}

/* ================================================================
   STRING LIMIT
================================================================ */

function limitString(
  value,
  max
) {
  const text =
    String(value || "");

  if (
    text.length <= max
  ) {
    return text;
  }

  return (
    text.slice(0, max) +
    "\n...[TRUNCATED]..."
  );
}

/* ================================================================
   NUMBER HELPERS
================================================================ */

function clampNumber(
  value,
  min,
  max,
  fallback
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, number)
  );
}

function clampConfidence(value) {
  return clampNumber(
    value,
    0,
    1,
    0
  );
}

/* ================================================================
   PATH NORMALIZATION
================================================================ */

function normalizeFilePath(
  filePath
) {
  return String(
    filePath || ""
  )
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

/* ================================================================
   PATH SAFETY
================================================================ */

function isSafeProjectPath(
  filePath
) {
  const normalized =
    normalizeFilePath(
      filePath
    );

  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("\0")
  ) {
    return false;
  }

  const parts =
    normalized.split("/");

  if (
    parts.includes("..")
  ) {
    return false;
  }

  if (
    normalized === ".git" ||
    normalized.startsWith(".git/")
  ) {
    return false;
  }

  if (
    normalized === ".env" ||
    normalized.startsWith(".env.")
  ) {
    return false;
  }

  return true;
}

/* ================================================================
   FILE MAP
================================================================ */

function createFileMap(files) {
  const map =
    new Map();

  if (
    !Array.isArray(files)
  ) {
    return map;
  }

  for (const file of files) {
    const filePath =
      normalizeFilePath(
        file?.path ||
        file?.name
      );

    if (
      !isSafeProjectPath(
        filePath
      )
    ) {
      continue;
    }

    map.set(
      filePath,
      String(
        file?.content ||
        ""
      )
    );
  }

  return map;
}

/* ================================================================
   ERROR EXTRACTION
================================================================ */

function extractErrors(
  failure
) {
  const errors = [];

  if (
    Array.isArray(
      failure?.errors
    )
  ) {
    errors.push(
      ...failure.errors
    );
  }

  if (
    failure?.stderr
  ) {
    errors.push(
      failure.stderr
    );
  }

  if (
    failure?.stdout
  ) {
    errors.push(
      failure.stdout
    );
  }

  if (
    failure?.message
  ) {
    errors.push(
      failure.message
    );
  }

  return errors
    .map((value) => {
      if (
        typeof value ===
        "string"
      ) {
        return limitString(
          value,
          DEFAULT_POLICY.MAX_OUTPUT_CHARS
        );
      }

      try {
        return limitString(
          JSON.stringify(
            value
          ),
          DEFAULT_POLICY.MAX_OUTPUT_CHARS
        );
      } catch (_) {
        return "";
      }
    })
    .filter(Boolean)
    .slice(
      0,
      DEFAULT_POLICY.MAX_ERROR_MESSAGES
    );
}

/* ================================================================
   FAILURE CATEGORY
================================================================ */

function detectFailureCategory(
  failure
) {
  if (
    failure?.failureCategory
  ) {
    return String(
      failure.failureCategory
    ).toLowerCase();
  }

  if (
    failure?.category
  ) {
    return String(
      failure.category
    ).toLowerCase();
  }

  const text =
    extractErrors(
      failure
    )
      .join("\n")
      .toLowerCase();

  if (
    failure?.timedOut ||
    text.includes("timeout") ||
    text.includes("timed out")
  ) {
    return FAILURE_CATEGORIES.TIMEOUT;
  }

  if (
    failure?.resourceViolation ||
    text.includes(
      "out of memory"
    ) ||
    text.includes(
      "heap out of memory"
    ) ||
    text.includes(
      "memory limit"
    ) ||
    text.includes(
      "cpu limit"
    ) ||
    text.includes(
      "pids-limit"
    ) ||
    text.includes(
      "no space left"
    )
  ) {
    return FAILURE_CATEGORIES.RESOURCE;
  }

  if (
    text.includes(
      "cannot find module"
    ) ||
    text.includes(
      "module not found"
    ) ||
    text.includes(
      "err_module_not_found"
    )
  ) {
    return FAILURE_CATEGORIES.MISSING_MODULE;
  }

  if (
    text.includes(
      "syntaxerror"
    ) ||
    text.includes(
      "unexpected token"
    ) ||
    text.includes(
      "unexpected identifier"
    )
  ) {
    return FAILURE_CATEGORIES.SYNTAX;
  }

  if (
    text.includes("eacces") ||
    text.includes(
      "permission denied"
    )
  ) {
    return FAILURE_CATEGORIES.PERMISSION;
  }

  if (
    text.includes("enotfound") ||
    text.includes("network") ||
    text.includes("fetch failed") ||
    text.includes("getaddrinfo")
  ) {
    return FAILURE_CATEGORIES.NETWORK;
  }

  if (
    text.includes(
      "command not found"
    ) ||
    text.includes(
      "invalid command"
    )
  ) {
    return FAILURE_CATEGORIES.INVALID_COMMAND;
  }

  if (
    text.includes(
      "artifact"
    ) ||
    text.includes(
      "checksum"
    )
  ) {
    return FAILURE_CATEGORIES.ARTIFACT;
  }

  if (
    text.includes("npm err") ||
    text.includes("yarn error") ||
    (
      text.includes("pnpm") &&
      text.includes("error")
    )
  ) {
    return FAILURE_CATEGORIES.DEPENDENCY;
  }

  return FAILURE_CATEGORIES.UNKNOWN;
}

/* ================================================================
   RETRYABILITY
================================================================ */

function determineRetryability(
  category,
  failure
) {
  if (
    typeof failure?.retryable ===
    "boolean"
  ) {
    return failure.retryable;
  }

  return RETRYABLE_CATEGORIES.has(
    category
  );
}

/* ================================================================
   FAILURE NORMALIZATION
================================================================ */

function normalizeFailure(
  failure
) {
  const category =
    detectFailureCategory(
      failure
    );

  return {
    category,

    message:
      limitString(
        failure?.message ||
        extractErrors(
          failure
        )[0] ||
        "Unknown engineering failure",
        10000
      ),

    retryable:
      determineRetryability(
        category,
        failure
      ),

    failureStage:
      failure?.failureStage ||
      failure?.stage ||
      null,

    affectedFiles:
      Array.isArray(
        failure?.affectedFiles
      )
        ? failure.affectedFiles
            .map(
              normalizeFilePath
            )
            .filter(
              isSafeProjectPath
            )
        : [],

    errors:
      extractErrors(
        failure
      ),

    stdout:
      limitString(
        failure?.stdout,
        DEFAULT_POLICY.MAX_OUTPUT_CHARS
      ),

    stderr:
      limitString(
        failure?.stderr,
        DEFAULT_POLICY.MAX_OUTPUT_CHARS
      ),

    exitCode:
      Number.isInteger(
        failure?.exitCode
      )
        ? failure.exitCode
        : null,

    signal:
      failure?.signal ||
      null,

    timedOut:
      Boolean(
        failure?.timedOut
      ),

    resourceViolation:
      failure?.resourceViolation ||
      null,

    buildId:
      failure?.buildId ||
      null,

    sourceHash:
      failure?.sourceHash ||
      null,

    buildCommand:
      failure?.buildCommand ||
      null,

    installCommand:
      failure?.installCommand ||
      null,

    authoritative:
      failure?.authoritative ===
      true,

    validationMode:
      failure?.validationMode ||
      null,
  };
}

/* ================================================================
   ERROR SIGNATURE NORMALIZATION
================================================================ */

function normalizeErrorForSignature(
  error
) {
  return String(
    error || ""
  )
    .toLowerCase()

    .replace(
      /\b\d{4}-\d{2}-\d{2}[tT][^\s]+\b/g,
      "<timestamp>"
    )

    .replace(
      /\/(?:workspace|home|tmp)\/[^\s:'"]+/g,
      "<path>"
    )

    .replace(
      /[a-zA-Z]:\\[^\s:'"]+/g,
      "<path>"
    )

    .replace(
      /:\d+:\d+/g,
      ":<line>:<column>"
    )

    .replace(
      /\b[a-f0-9]{16,}\b/g,
      "<id>"
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}

/* ================================================================
   FAILURE SIGNATURE
================================================================ */

function createFailureSignature(
  failure
) {
  const normalized =
    normalizeFailure(
      failure
    );

  const signatureInput = {
    category:
      normalized.category,

    stage:
      normalized.failureStage,

    errors:
      normalized.errors
        .slice(0, 10)
        .map(
          normalizeErrorForSignature
        ),

    exitCode:
      normalized.exitCode,

    signal:
      normalized.signal,

    affectedFiles:
      normalized.affectedFiles
        .slice(0, 20)
        .sort(),

    buildCommand:
      normalized.buildCommand ||
      null,
  };

  return {
    signatureId:
      sha256(
        JSON.stringify(
          signatureInput
        )
      ),

    ...signatureInput,
  };
}

/* ================================================================
   SOURCE CONTEXT
================================================================ */

function extractSourceContext(
  files,
  affectedFiles
) {
  const map =
    createFileMap(
      files
    );

  const contexts = [];

  for (
    const target of (
      Array.isArray(
        affectedFiles
      )
        ? affectedFiles
        : []
    ).slice(
      0,
      DEFAULT_POLICY.MAX_DIAGNOSIS_FILES
    )
  ) {
    const filePath =
      normalizeFilePath(
        target
      );

    if (
      !map.has(
        filePath
      )
    ) {
      continue;
    }

    contexts.push({
      path:
        filePath,

      content:
        limitString(
          map.get(
            filePath
          ),
          30000
        ),
    });
  }

  return contexts;
}

/* ================================================================
   ERROR TARGET EXTRACTION
================================================================ */

function extractTargetsFromErrors(
  failure,
  files
) {
  const map =
    createFileMap(
      files
    );

  const targets =
    new Set();

  for (
    const filePath of (
      failure?.affectedFiles ||
      []
    )
  ) {
    const normalized =
      normalizeFilePath(
        filePath
      );

    if (
      map.has(
        normalized
      )
    ) {
      targets.add(
        normalized
      );
    }
  }

  const text =
    extractErrors(
      failure
    ).join("\n");

  for (
    const filePath of map.keys()
  ) {
    if (
      text.includes(
        filePath
      )
    ) {
      targets.add(
        filePath
      );
    }
  }

  return Array.from(
    targets
  ).slice(
    0,
    DEFAULT_POLICY.MAX_DIAGNOSIS_FILES
  );
}

/* ================================================================
   DETERMINISTIC DIAGNOSIS
================================================================ */

function deterministicDiagnosis(
  failure,
  files
) {
  const normalized =
    normalizeFailure(
      failure
    );

  const signature =
    createFailureSignature(
      normalized
    );

  const targets =
    extractTargetsFromErrors(
      normalized,
      files
    );

  const sourceContext =
    extractSourceContext(
      files,
      targets
    );

  let rootCause =
    "Unable to determine a deterministic root cause.";

  let strategy =
    REPAIR_STRATEGIES.NO_SAFE_REPAIR;

  let confidence =
    0.20;

  switch (
    normalized.category
  ) {
    case FAILURE_CATEGORIES.SYNTAX:
      rootCause =
        "Source syntax is invalid in one or more project files.";

      strategy =
        REPAIR_STRATEGIES.SOURCE_FIX;

      confidence =
        0.88;

      break;

    case FAILURE_CATEGORIES.MISSING_MODULE:
      rootCause =
        "A referenced module is unavailable or an import path is incorrect.";

      strategy =
        REPAIR_STRATEGIES.IMPORT_FIX;

      confidence =
        0.86;

      break;

    case FAILURE_CATEGORIES.DEPENDENCY:
      rootCause =
        "Dependency installation or dependency metadata is inconsistent with the generated project.";

      strategy =
        REPAIR_STRATEGIES.DEPENDENCY_FIX;

      confidence =
        0.80;

      break;

    case FAILURE_CATEGORIES.CONFIGURATION:
      rootCause =
        "Project configuration is incompatible with the requested execution.";

      strategy =
        REPAIR_STRATEGIES.CONFIG_FIX;

      confidence =
        0.82;

      break;

    case FAILURE_CATEGORIES.INVALID_COMMAND:
      rootCause =
        "The configured command is not a valid authoritative build command.";

      strategy =
        REPAIR_STRATEGIES.BUILD_SCRIPT_FIX;

      confidence =
        0.91;

      break;

    case FAILURE_CATEGORIES.TIMEOUT:
      rootCause =
        "Execution exceeded the configured time budget.";

      strategy =
        REPAIR_STRATEGIES.RESOURCE_ADJUSTMENT;

      confidence =
        0.82;

      break;

    case FAILURE_CATEGORIES.RESOURCE:
      rootCause =
        "Execution exceeded an available resource boundary.";

      strategy =
        REPAIR_STRATEGIES.RESOURCE_ADJUSTMENT;

      confidence =
        0.90;

      break;

    case FAILURE_CATEGORIES.NETWORK:
      rootCause =
        "The operation requires network access that was unavailable or failed.";

      strategy =
        REPAIR_STRATEGIES.ENVIRONMENT_FIX;

      confidence =
        0.78;

      break;

    case FAILURE_CATEGORIES.PERMISSION:
      rootCause =
        "The execution environment rejected a filesystem or process operation.";

      strategy =
        REPAIR_STRATEGIES.ENVIRONMENT_FIX;

      confidence =
        0.84;

      break;

    case FAILURE_CATEGORIES.TEST:
      rootCause =
        "One or more verification tests failed.";

      strategy =
        REPAIR_STRATEGIES.TEST_FIX;

      confidence =
        0.74;

      break;

    case FAILURE_CATEGORIES.RUNTIME:
      rootCause =
        "The generated application failed during runtime execution.";

      strategy =
        REPAIR_STRATEGIES.RUNTIME_FIX;

      confidence =
        0.72;

      break;

    case FAILURE_CATEGORIES.ARTIFACT:
      rootCause =
        "The build artifact could not be created or verified.";

      strategy =
        REPAIR_STRATEGIES.ARTIFACT_FIX;

      confidence =
        0.82;

      break;

    default:
      break;
  }

  return {
    success:
      true,

    deterministic:
      true,

    rootCause,

    category:
      normalized.category,

    strategy,

    confidence,

    affectedFiles:
      targets,

    sourceContext,

    signature,

    retryable:
      normalized.retryable,
  };
}

/* ================================================================
   SCOPE
================================================================ */

function normalizeScopeExpansion(
  value
) {
  return clampNumber(
    value,
    1,
    DEFAULT_POLICY.MAX_SCOPE_EXPANSION,
    1
  );
}

/* ================================================================
   FILE LIST SANITIZATION
================================================================ */

function sanitizeFileList(
  files,
  projectFiles
) {
  const available =
    createFileMap(
      projectFiles
    );

  const result = [];

  for (
    const file of (
      Array.isArray(files)
        ? files
        : []
    )
  ) {
    const normalized =
      normalizeFilePath(
        file
      );

    if (
      available.has(
        normalized
      ) &&
      !result.includes(
        normalized
      )
    ) {
      result.push(
        normalized
      );
    }
  }

  return result.slice(
    0,
    DEFAULT_POLICY.MAX_REPAIR_FILES
  );
}

/* ================================================================
   SECRET DETECTION
================================================================ */

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----/i,

  /\bAKIA[0-9A-Z]{16}\b/,

  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,

  /\bsk-[A-Za-z0-9]{20,}\b/,

  /\bAIza[0-9A-Za-z_-]{20,}\b/,

  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i,

  /\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"']{12,}["']/i,
];

function containsLikelySecret(
  content
) {
  const text =
    limitString(
      content,
      DEFAULT_POLICY.MAX_SECRET_SCAN_CHARS
    );

  return SECRET_PATTERNS.some(
    (pattern) =>
      pattern.test(
        text
      )
  );
}

/* ================================================================
   DEPENDENCY EXTRACTION
================================================================ */

function extractPackageDependencies(
  content
) {
  const parsed =
    safeJsonParse(
      content
    );

  if (
    !parsed ||
    typeof parsed !==
      "object"
  ) {
    return {};
  }

  return {
    ...(parsed.dependencies ||
      {}),

    ...(parsed.devDependencies ||
      {}),

    ...(parsed.peerDependencies ||
      {}),
  };
}

/* ================================================================
   ACTUAL DEPENDENCY DIFF
================================================================ */

function calculateDependencyChanges(
  originalFiles,
  repairedFiles
) {
  const beforeMap =
    createFileMap(
      originalFiles
    );

  const afterMap =
    createFileMap(
      repairedFiles
    );

  const before =
    extractPackageDependencies(
      beforeMap.get(
        "package.json"
      ) || ""
    );

  const after =
    extractPackageDependencies(
      afterMap.get(
        "package.json"
      ) || ""
    );

  const changes =
    [];

  const names =
    new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ]);

  for (
    const name of names
  ) {
    if (
      before[name] !==
      after[name]
    ) {
      changes.push({
        name,

        before:
          before[name] ||
          null,

        after:
          after[name] ||
          null,
      });
    }
  }

  return changes;
}

/* ================================================================
   ACTUAL SCOPE CALCULATION
================================================================ */

function calculateScopeExpansion(
  originalFiles,
  repairedFiles
) {
  const before =
    createFileMap(
      originalFiles
    );

  const after =
    createFileMap(
      repairedFiles
    );

  const changed =
    [];

  for (
    const [
      filePath,
      content
    ]
    of after.entries()
  ) {
    if (
      !before.has(
        filePath
      ) ||
      before.get(
        filePath
      ) !== content
    ) {
      changed.push(
        filePath
      );
    }
  }

  const deleted =
    [];

  for (
    const filePath
    of before.keys()
  ) {
    if (
      !after.has(
        filePath
      )
    ) {
      deleted.push(
        filePath
      );
    }
  }

  const originalCount =
    Math.max(
      1,
      before.size
    );

  const touchedCount =
    changed.length +
    deleted.length;

  return {
    changedFiles:
      changed,

    deletedFiles:
      deleted,

    touchedFiles:
      touchedCount,

    ratio:
      Math.max(
        1,
        touchedCount /
          originalCount
      ),
  };
}

/* ================================================================
   REPAIR PROMPT
================================================================ */

function buildRepairPrompt(
  context
) {
  return `
You are the autonomous Repair Intelligence of ZyrionOS.

You have a REAL authoritative execution failure.

Generate the smallest safe repair.

You MUST use only supplied evidence.

Do not:
- invent logs
- invent files
- claim build success
- bypass authoritative execution
- disable security controls
- remove tests
- weaken sandboxing
- introduce credentials
- add arbitrary network access
- replace build commands with runtime commands
- modify unrelated files

RUN:
${JSON.stringify(
  context.run,
  null,
  2
)}

AUTHORITATIVE FAILURE:
${JSON.stringify(
  context.failure,
  null,
  2
)}

DIAGNOSIS:
${JSON.stringify(
  context.diagnosis,
  null,
  2
)}

SOURCE FILES:
${JSON.stringify(
  context.files,
  null,
  2
)}

Return ONLY JSON:

{
  "success": true,
  "strategy": "...",
  "confidence": 0.0,
  "files": [
    {
      "path": "...",
      "content": "..."
    }
  ],
  "explanation": [],
  "verificationPlan": []
}

Rules:

1. Return complete content for every changed file.
2. Return only files required for this repair.
3. Existing files may only be changed when authorized.
4. New files may only be created when explicitly authorized.
5. Never modify .env or .git.
6. Never add secrets.
7. Never weaken security.
8. Never change dependencies without evidence.
9. Never increase resource requirements without evidence.
10. Never claim authoritative success.
`;
}

/* ================================================================
   AI PROVIDER
================================================================ */

async function callAI(
  prompt,
  options = {}
) {
  loadDependencies();

  if (
    !aiProvider
  ) {
    return null;
  }

  const methods = [
    "generateText",
    "generate",
    "complete",
    "chat",
  ];

  let method =
    null;

  let methodName =
    null;

  for (
    const name of methods
  ) {
    if (
      typeof aiProvider[name] ===
      "function"
    ) {
      method =
        aiProvider[name];

      methodName =
        name;

      break;
    }
  }

  if (!method) {
    return null;
  }

  const payload = {
    prompt,

    system:
      options.system ||
      undefined,

    temperature:
      options.temperature ??
      0.05,

    maxTokens:
      options.maxTokens ||
      12000,

    responseFormat:
      options.responseFormat ||
      "json",

    purpose:
      options.purpose ||
      "engineering-intelligence",
  };

  try {
    let result;

    /*
     * Preserve the centralized provider abstraction.
     * Different ZyrionOS provider versions can expose different
     * method contracts.
     */
    if (
      methodName ===
      "chat"
    ) {
      result =
        await method.call(
          aiProvider,
          {
            messages: [
              {
                role:
                  "system",

                content:
                  payload.system ||
                  "",
              },

              {
                role:
                  "user",

                content:
                  payload.prompt,
              },
            ],

            temperature:
              payload.temperature,

            maxTokens:
              payload.maxTokens,

            responseFormat:
              payload.responseFormat,

            purpose:
              payload.purpose,
          }
        );
    } else {
      result =
        await method.call(
          aiProvider,
          payload
        );
    }

    if (
      typeof result ===
      "string"
    ) {
      return (
        safeJsonParse(
          result
        ) || {
          text:
            result,
        }
      );
    }

    if (
      result?.data &&
      typeof result.data ===
        "object"
    ) {
      return result.data;
    }

    if (
      result?.text &&
      typeof result.text ===
        "string"
    ) {
      return (
        safeJsonParse(
          result.text
        ) || result
      );
    }

    if (
      result?.content &&
      typeof result.content ===
        "string"
    ) {
      return (
        safeJsonParse(
          result.content
        ) || result
      );
    }

    return result;
  } catch (error) {
    return {
      success:
        false,

      providerFailure:
        true,

      error:
        limitString(
          error?.message,
          2000
        ),
    };
  }
}

/* ================================================================
   MEMORY
================================================================ */

const failureMemory =
  new Map();

const repairMemory =
  new Map();

/* ================================================================
   MEMORY LIMIT
================================================================ */

function enforceMemoryLimit(
  memory
) {
  while (
    memory.size >
    DEFAULT_POLICY.MAX_MEMORY_PATTERNS
  ) {
    const first =
      memory.keys().next()
        .value;

    if (
      first ===
      undefined
    ) {
      break;
    }

    memory.delete(
      first
    );
  }
}

/* ================================================================
   PERSIST PATTERN
================================================================ */

function persistPattern(
  type,
  key,
  data
) {
  loadDependencies();

  if (
    !engineeringState
  ) {
    return;
  }

  const methods = [
    "recordPattern",
    "recordEngineeringPattern",
    "recordLearning",
    "savePattern",
  ];

  for (
    const methodName of methods
  ) {
    if (
      typeof engineeringState[
        methodName
      ] ===
      "function"
    ) {
      try {
        /*
         * State v1.1.0 accepts the canonical recordPattern
         * contract. Other names remain compatibility adapters.
         */
        engineeringState[
          methodName
        ]({
          type,

          key,

          data:
            clone(data),

          timestamp:
            new Date().toISOString(),
        });
      } catch (_) {}

      break;
    }
  }
}

/* ================================================================
   RECORD FAILURE PATTERN
================================================================ */

function recordFailurePattern(
  failure,
  diagnosis
) {
  const signature =
    diagnosis?.signature
      ?.signatureId;

  if (!signature) {
    return null;
  }

  const existing =
    failureMemory.get(
      signature
    ) || {
      signatureId:
        signature,

      count:
        0,

      categories:
        new Set(),

      strategies:
        new Map(),

      lastSeen:
        null,
    };

  existing.count += 1;

  existing.categories.add(
    diagnosis.category
  );

  existing.strategies.set(
    diagnosis.strategy,
    (
      existing.strategies.get(
        diagnosis.strategy
      ) || 0
    ) + 1
  );

  existing.lastSeen =
    new Date().toISOString();

  failureMemory.set(
    signature,
    existing
  );

  enforceMemoryLimit(
    failureMemory
  );

  persistPattern(
    "failure",
    signature,
    {
      count:
        existing.count,

      category:
        diagnosis.category,

      strategy:
        diagnosis.strategy,

      lastSeen:
        existing.lastSeen,
    }
  );

  return existing;
}

/* ================================================================
   RECORD REPAIR PATTERN
================================================================ */

function recordRepairPattern(
  failure,
  diagnosis,
  repair
) {
  const signature =
    diagnosis?.signature
      ?.signatureId;

  if (!signature) {
    return null;
  }

  const key =
    `${signature}:${repair.strategy}`;

  const existing =
    repairMemory.get(
      key
    ) || {
      key,

      signatureId:
        signature,

      strategy:
        repair.strategy,

      attempts:
        0,

      successes:
        0,

      failures:
        0,

      lastSeen:
        null,
    };

  existing.attempts += 1;

  existing.lastSeen =
    new Date().toISOString();

  repairMemory.set(
    key,
    existing
  );

  enforceMemoryLimit(
    repairMemory
  );

  persistPattern(
    "repair",
    key,
    existing
  );

  return existing;
}

/* ================================================================
   MARK REPAIR SUCCESS
================================================================ */

function markRepairSuccess(
  signatureId,
  strategy
) {
  const key =
    `${signatureId}:${strategy}`;

  const pattern =
    repairMemory.get(
      key
    );

  if (!pattern) {
    return null;
  }

  pattern.successes += 1;

  pattern.lastSeen =
    new Date().toISOString();

  repairMemory.set(
    key,
    pattern
  );

  persistPattern(
    "repair-success",
    key,
    pattern
  );

  return pattern;
}

/* ================================================================
   MARK REPAIR FAILURE
================================================================ */

function markRepairFailure(
  signatureId,
  strategy
) {
  const key =
    `${signatureId}:${strategy}`;

  const pattern =
    repairMemory.get(
      key
    );

  if (!pattern) {
    return null;
  }

  pattern.failures += 1;

  pattern.lastSeen =
    new Date().toISOString();

  repairMemory.set(
    key,
    pattern
  );

  persistPattern(
    "repair-failure",
    key,
    pattern
  );

  return pattern;
}

/* ================================================================
   SUCCESS RATE
================================================================ */

function getRepairSuccessRate(
  signatureId,
  strategy
) {
  const key =
    `${signatureId}:${strategy}`;

  const pattern =
    repairMemory.get(
      key
    );

  if (
    !pattern ||
    pattern.attempts <= 0
  ) {
    return 0;
  }

  return (
    pattern.successes /
    pattern.attempts
  );
}

/* ================================================================
   KNOWN REPAIRS
================================================================ */

function findKnownRepair(
  failure
) {
  const signature =
    createFailureSignature(
      failure
    );

  const matches = [];

  for (
    const pattern of
      repairMemory.values()
  ) {
    if (
      pattern.signatureId !==
      signature.signatureId
    ) {
      continue;
    }

    const successRate =
      pattern.attempts > 0
        ? pattern.successes /
          pattern.attempts
        : 0;

    matches.push({
      ...clone(pattern),

      successRate,
    });
  }

  return matches
    .sort(
      (a, b) =>
        b.successRate -
        a.successRate
    )
    .slice(
      0,
      DEFAULT_POLICY.MAX_KNOWN_REPAIRS
    );
}

/* ================================================================
   RESOURCE ANALYSIS
================================================================ */

function analyzeResources(
  resourceUsage
) {
  if (
    !resourceUsage ||
    typeof resourceUsage !==
      "object"
  ) {
    return {
      pressure:
        "unknown",

      scaleRecommended:
        false,

      reasons: [],
    };
  }

  const cpu =
    Number(
      resourceUsage.cpuPercent
    );

  const memory =
    Number(
      resourceUsage.memoryPercent
    );

  const reasons = [];

  if (
    Number.isFinite(cpu) &&
    cpu >= 90
  ) {
    reasons.push(
      "CPU pressure is critical"
    );
  } else if (
    Number.isFinite(cpu) &&
    cpu >= 80
  ) {
    reasons.push(
      "CPU pressure is high"
    );
  }

  if (
    Number.isFinite(memory) &&
    memory >= 90
  ) {
    reasons.push(
      "Memory pressure is critical"
    );
  } else if (
    Number.isFinite(memory) &&
    memory >= 80
  ) {
    reasons.push(
      "Memory pressure is high"
    );
  }

  let pressure =
    "normal";

  if (
    reasons.some(
      (reason) =>
        reason.includes(
          "critical"
        )
    )
  ) {
    pressure =
      "critical";
  } else if (
    reasons.length
  ) {
    pressure =
      "high";
  }

  return {
    pressure,

    scaleRecommended:
      pressure === "high" ||
      pressure === "critical",

    reasons,

    cpuPercent:
      Number.isFinite(cpu)
        ? cpu
        : null,

    memoryPercent:
      Number.isFinite(memory)
        ? memory
        : null,
  };
}

/* ================================================================
   AUTO SCALE
================================================================ */

function recommendAutoScale(
  context
) {
  const resource =
    analyzeResources(
      context?.resourceUsage
    );

  if (
    !resource.scaleRecommended
  ) {
    return {
      scale:
        false,

      level:
        1,

      reason:
        "No significant resource pressure",

      resource,
    };
  }

  const current =
    Number(
      context?.currentScale ||
      1
    );

  const max =
    clampNumber(
      context?.maxAutoScale,
      1,
      4,
      4
    );

  if (
    current >= max
  ) {
    return {
      scale:
        false,

      level:
        current,

      reason:
        "Maximum auto-scale level reached",

      resource,
    };
  }

  return {
    scale:
      true,

    level:
      Math.min(
        max,
        current + 1
      ),

    reason:
      "Resource pressure justifies controlled scale increase",

    resource,
  };
}

/* ================================================================
   REGRESSION DETECTION
================================================================ */

function detectRegression(
  context
) {
  const before =
    context?.previousFailure;

  const current =
    context?.currentFailure;

  if (
    !before ||
    !current
  ) {
    return {
      regression:
        false,

      reason:
        "Insufficient comparison evidence",
    };
  }

  const previous =
    createFailureSignature(
      before
    );

  const currentSignature =
    createFailureSignature(
      current
    );

  if (
    previous.signatureId ===
    currentSignature.signatureId
  ) {
    return {
      regression:
        false,

      recurringFailure:
        true,

      reason:
        "Same failure signature recurred",

      signatureId:
        currentSignature.signatureId,
    };
  }

  return {
    regression:
      false,

    recurringFailure:
      false,

    reason:
      "Failure signature changed",

    previousSignature:
      previous.signatureId,

    currentSignature:
      currentSignature.signatureId,
  };
}

/* ================================================================
   DIAGNOSIS PROMPT
================================================================ */

function buildDiagnosisPrompt(
  context
) {
  return `
You are the Engineering Intelligence layer of ZyrionOS.

You are diagnosing a REAL authoritative execution failure.

The authoritative executor is the source of truth.

You must NOT claim:
- build success
- artifact success
- deployment success
- runtime success

Use only supplied evidence.

RUN:
${JSON.stringify(
  context.run,
  null,
  2
)}

AUTHORITATIVE FAILURE:
${JSON.stringify(
  context.failure,
  null,
  2
)}

DETERMINISTIC ANALYSIS:
${JSON.stringify(
  context.deterministic,
  null,
  2
)}

KNOWN REPAIR HISTORY:
${JSON.stringify(
  context.knownRepairs,
  null,
  2
)}

SOURCE CONTEXT:
${JSON.stringify(
  context.sourceContext,
  null,
  2
)}

Return ONLY JSON:

{
  "success": true,
  "rootCause": "...",
  "category": "...",
  "strategy": "...",
  "confidence": 0.0,
  "affectedFiles": [],
  "repairTargets": [],
  "reasoning": [],
  "requiredChanges": [],
  "dependencyChanges": [],
  "scopeExpansion": 1.0,
  "safeToRepair": true,
  "requiresRollback": false
}

Rules:

1. Use authoritative failure evidence first.
2. affectedFiles must reference supplied files.
3. Do not invent files.
4. Prefer the smallest repair.
5. Do not change dependencies without evidence.
6. Do not weaken security.
7. Do not bypass authoritative verification.
8. Do not replace a build command with a runtime command.
9. If evidence is insufficient, safeToRepair=false.
10. High-risk repairs require confidence >= 0.90.
`;
}

/* ================================================================
   DIAGNOSIS
================================================================ */

async function diagnoseFailure(
  context
) {
  const failure =
    normalizeFailure(
      context?.failure
    );

  const files =
    Array.isArray(
      context?.files
    )
      ? context.files
      : [];

  const deterministic =
    deterministicDiagnosis(
      failure,
      files
    );

  const knownRepairs =
    findKnownRepair(
      failure
    );

  const sourceContext =
    deterministic.sourceContext;

  const prompt =
    buildDiagnosisPrompt({
      run: {
        runId:
          context?.runId ||
          null,

        projectId:
          context?.projectId ||
          null,

        attempt:
          context?.attempt ||
          null,

        repairAttempt:
          context?.repairAttempt ||
          null,
      },

      failure,

      deterministic,

      knownRepairs,

      sourceContext,
    });

  const ai =
    await callAI(
      prompt,
      {
        purpose:
          "engineering-diagnosis",

        temperature:
          0.05,

        maxTokens:
          12000,
      }
    );

  const diagnosis = {
    success:
      true,

    intelligenceVersion:
      INTELLIGENCE_VERSION,

    category:
      ai?.category ||
      deterministic.category,

    rootCause:
      ai?.rootCause ||
      deterministic.rootCause,

    strategy:
      ai?.strategy ||
      deterministic.strategy,

    confidence:
      clampConfidence(
        ai?.confidence ??
        deterministic.confidence
      ),

    affectedFiles:
      sanitizeFileList(
        ai?.affectedFiles ||
        deterministic.affectedFiles,
        files
      ),

    repairTargets:
      sanitizeFileList(
        ai?.repairTargets ||
        ai?.affectedFiles ||
        deterministic.affectedFiles,
        files
      ),

    reasoning:
      Array.isArray(
        ai?.reasoning
      )
        ? ai.reasoning.slice(
            0,
            DEFAULT_POLICY.MAX_REPAIR_PLAN_STEPS
          )
        : [],

    requiredChanges:
      Array.isArray(
        ai?.requiredChanges
      )
        ? ai.requiredChanges.slice(
            0,
            DEFAULT_POLICY.MAX_REPAIR_PLAN_STEPS
          )
        : [],

    dependencyChanges:
      Array.isArray(
        ai?.dependencyChanges
      )
        ? ai.dependencyChanges.slice(
            0,
            DEFAULT_POLICY.MAX_DEPENDENCY_CHANGES
          )
        : [],

    scopeExpansion:
      normalizeScopeExpansion(
        ai?.scopeExpansion
      ),

    safeToRepair:
      ai?.safeToRepair !==
      false,

    requiresRollback:
      ai?.requiresRollback ===
      true,

    retryable:
      failure.retryable,

    signature:
      deterministic.signature,

    knownRepairs,

    deterministicFallback:
      !ai ||
      ai?.providerFailure ===
      true,

    authoritativeEvidence:
      {
        authoritative:
          failure.authoritative,

        validationMode:
          failure.validationMode,

        buildId:
          failure.buildId,

        sourceHash:
          failure.sourceHash,

        exitCode:
          failure.exitCode,

        failureStage:
          failure.failureStage,

        buildCommand:
          failure.buildCommand,

        installCommand:
          failure.installCommand,
      },
  };

  /*
   * Strategy must be one of our controlled strategies.
   */
  if (
    !Object.values(
      REPAIR_STRATEGIES
    ).includes(
      diagnosis.strategy
    )
  ) {
    diagnosis.strategy =
      deterministic.strategy;
  }

  /*
   * Confidence gate.
   */
  if (
    diagnosis.confidence <
    DEFAULT_POLICY.MIN_REPAIR_CONFIDENCE
  ) {
    diagnosis.safeToRepair =
      false;
  }

  /*
   * High-risk strategy gate.
   */
  if (
    HIGH_RISK_STRATEGIES.has(
      diagnosis.strategy
    ) &&
    diagnosis.confidence <
    DEFAULT_POLICY.MIN_HIGH_RISK_CONFIDENCE
  ) {
    diagnosis.safeToRepair =
      false;
  }

  /*
   * Dependency declaration gate.
   */
  if (
    diagnosis.dependencyChanges
      .length >
    DEFAULT_POLICY.MAX_DEPENDENCY_CHANGES
  ) {
    diagnosis.safeToRepair =
      false;
  }

  /*
   * Scope gate.
   */
  if (
    diagnosis.scopeExpansion >
    DEFAULT_POLICY.MAX_SCOPE_EXPANSION
  ) {
    diagnosis.safeToRepair =
      false;
  }

  recordFailurePattern(
    failure,
    diagnosis
  );

  return diagnosis;
}

/* ================================================================
   REPAIR VALIDATION
================================================================ */

function validateRepair(
  repair,
  context
) {
  if (
    !repair ||
    repair.success !==
    true
  ) {
    return {
      success:
        false,

      reason:
        "Repair response is not successful",
    };
  }

  const originalFiles =
    Array.isArray(
      context?.files
    )
      ? context.files
      : [];

  const originalMap =
    createFileMap(
      originalFiles
    );

  const repairFiles =
    Array.isArray(
      repair.files
    )
      ? repair.files
      : [];

  if (
    repairFiles.length ===
    0
  ) {
    return {
      success:
        false,

      reason:
        "Repair returned no files",
    };
  }

  if (
    repairFiles.length >
    DEFAULT_POLICY.MAX_REPAIR_FILES
  ) {
    return {
      success:
        false,

      reason:
        "Repair file count exceeds safety limit",
    };
  }

  const allowedTargets =
    new Set(
      (
        context?.diagnosis
          ?.repairTargets ||
        context?.diagnosis
          ?.affectedFiles ||
        []
      )
        .map(
          normalizeFilePath
        )
        .filter(
          isSafeProjectPath
        )
    );

  const sanitized =
    [];

  const seen =
    new Set();

  for (
    const file of repairFiles
  ) {
    const filePath =
      normalizeFilePath(
        file?.path ||
        file?.name
      );

    if (
      !isSafeProjectPath(
        filePath
      )
    ) {
      return {
        success:
          false,

        reason:
          `Unsafe repair path: ${filePath}`,
      };
    }

    if (
      seen.has(
        filePath
      )
    ) {
      return {
        success:
          false,

        reason:
          `Duplicate repair path: ${filePath}`,
      };
    }

    seen.add(
      filePath
    );

    if (
      typeof file.content !==
      "string"
    ) {
      return {
        success:
          false,

        reason:
          `Repair content missing for ${filePath}`,
      };
    }

    if (
      Buffer.byteLength(
        file.content,
        "utf8"
      ) >
      DEFAULT_POLICY.MAX_FILE_BYTES
    ) {
      return {
        success:
          false,

        reason:
          `Repair file exceeds maximum size: ${filePath}`,
      };
    }

    /*
     * Security gate.
     */
    if (
      containsLikelySecret(
        file.content
      )
    ) {
      return {
        success:
          false,

        reason:
          `Potential secret detected in repair: ${filePath}`,
      };
    }

    /*
     * Existing files require explicit authorization.
     */
    if (
      originalMap.has(
        filePath
      )
    ) {
      if (
        allowedTargets.size > 0 &&
        !allowedTargets.has(
          filePath
        )
      ) {
        return {
          success:
            false,

          reason:
            `Unauthorized repair file: ${filePath}`,
        };
      }
    } else {
      /*
       * New files also require explicit authorization.
       */
      if (
        !allowedTargets.has(
          filePath
        )
      ) {
        return {
          success:
            false,

          reason:
            `New file not authorized by diagnosis: ${filePath}`,
        };
      }
    }

    sanitized.push({
      path:
        filePath,

      content:
        file.content,
    });
  }

  /*
   * Merge temporarily so dependency/scope changes can be
   * calculated from the actual source state rather than trusting
   * AI-declared numbers.
   */
  const merged =
    mergeRepairFiles(
      originalFiles,
      sanitized
    );

  const dependencyChanges =
    calculateDependencyChanges(
      originalFiles,
      merged
    );

  if (
    dependencyChanges.length >
    DEFAULT_POLICY.MAX_DEPENDENCY_CHANGES
  ) {
    return {
      success:
        false,

      reason:
        "Actual dependency change limit exceeded",

      dependencyChanges,
    };
  }

  /*
   * If AI claims no dependency change but package.json actually
   * changes dependencies, treat the actual diff as authoritative.
   */
  const declaredDependencyChanges =
    Number(
      repair.dependencyChanges ||
      0
    );

  if (
    !Number.isFinite(
      declaredDependencyChanges
    ) ||
    declaredDependencyChanges < 0
  ) {
    return {
      success:
        false,

      reason:
        "Invalid dependencyChanges declaration",
    };
  }

  const scope =
    calculateScopeExpansion(
      originalFiles,
      merged
    );

  if (
    scope.ratio >
    DEFAULT_POLICY.MAX_SCOPE_EXPANSION
  ) {
    return {
      success:
        false,

      reason:
        "Actual scope expansion limit exceeded",

      scope,
    };
  }

  const patchBytes =
    sanitized.reduce(
      (
        total,
        file
      ) =>
        total +
        Buffer.byteLength(
          file.content,
          "utf8"
        ),
      0
    );

  if (
    patchBytes >
    DEFAULT_POLICY.MAX_PATCH_BYTES
  ) {
    return {
      success:
        false,

      reason:
        "Total repair patch exceeds safety limit",
    };
  }

  return {
    success:
      true,

    files:
      sanitized,

    dependencyChanges:
      dependencyChanges.length,

    dependencyDiff:
      dependencyChanges,

    scopeExpansion:
      scope.ratio,

    scope,

    patchBytes,
  };
}

/* ================================================================
   MERGE REPAIR FILES
================================================================ */

function mergeRepairFiles(
  originalFiles,
  repairedFiles
) {
  const map =
    createFileMap(
      originalFiles
    );

  for (
    const file of repairedFiles
  ) {
    map.set(
      normalizeFilePath(
        file.path
      ),
      file.content
    );
  }

  return Array.from(
    map.entries()
  )
    .map(
      ([filePath, content]) => ({
        path:
          filePath,

        content,
      })
    );
}

/* ================================================================
   REPAIR
================================================================ */

async function repairFailure(
  context
) {
  const failure =
    normalizeFailure(
      context?.failure
    );

  const files =
    Array.isArray(
      context?.files
    )
      ? context.files
      : [];

  const diagnosis =
    context?.diagnosis ||
    await diagnoseFailure({
      ...context,

      failure,

      files,
    });

  if (
    !diagnosis.safeToRepair
  ) {
    return {
      success:
        false,

      reason:
        "Diagnosis did not reach the repair safety threshold",

      diagnosis,
    };
  }

  /*
   * First inspect known successful patterns.
   *
   * We do NOT blindly replay them. They are intelligence,
   * not authoritative truth.
   */
  const knownRepairs =
    findKnownRepair(
      failure
    );

  const prompt =
    buildRepairPrompt({
      run: {
        runId:
          context?.runId ||
          null,

        projectId:
          context?.projectId ||
          null,

        attempt:
          context?.attempt ||
          null,

        repairAttempt:
          context?.repairAttempt ||
          null,
      },

      failure,

      diagnosis: {
        ...diagnosis,

        knownRepairs,
      },

      files:
        files.map(
          (file) => ({
            path:
              file.path ||
              file.name,

            content:
              limitString(
                file.content,
                30000
              ),
          })
        ),
    });

  const ai =
    await callAI(
      prompt,
      {
        purpose:
          "engineering-repair",

        temperature:
          0.05,

        maxTokens:
          14000,
      }
    );

  if (
    !ai ||
    ai.providerFailure
  ) {
    return {
      success:
        false,

      reason:
        "Repair intelligence provider unavailable",

      diagnosis,

      deterministicRepairAvailable:
        false,
    };
  }

  const validation =
    validateRepair(
      {
        ...ai,

        files:
          Array.isArray(
            ai.files
          )
            ? ai.files
            : [],
      },
      {
        files,

        diagnosis,
      }
    );

  if (
    !validation.success
  ) {
    return {
      success:
        false,

      reason:
        validation.reason,

      validation,

      diagnosis,
    };
  }

  const finalFiles =
    mergeRepairFiles(
      files,
      validation.files
    );

  const changedFiles =
    validation.scope.changedFiles;

  const beforeHash =
    calculateFilesHash(
      files
    );

  const afterHash =
    calculateFilesHash(
      finalFiles
    );

  if (
    beforeHash ===
    afterHash
  ) {
    return {
      success:
        false,

      reason:
        "Repair produced no effective source change",

      diagnosis,
    };
  }

  const confidence =
    clampConfidence(
      ai.confidence ??
      diagnosis.confidence
    );

  /*
   * High-risk repair cannot downgrade its safety requirement
   * simply because AI returned a higher confidence value without
   * deterministic evidence.
   */
  if (
    HIGH_RISK_STRATEGIES.has(
      ai.strategy ||
      diagnosis.strategy
    ) &&
    confidence <
    DEFAULT_POLICY.MIN_HIGH_RISK_CONFIDENCE
  ) {
    return {
      success:
        false,

      reason:
        "High-risk repair confidence is below safety threshold",

      diagnosis,
    };
  }

  const repair = {
    success:
      true,

    intelligenceVersion:
      INTELLIGENCE_VERSION,

    strategy:
      Object.values(
        REPAIR_STRATEGIES
      ).includes(
        ai.strategy
      )
        ? ai.strategy
        : diagnosis.strategy,

    confidence,

    files:
      finalFiles,

    changedFiles,

    dependencyChanges:
      validation.dependencyChanges,

    dependencyDiff:
      validation.dependencyDiff,

    scopeExpansion:
      validation.scopeExpansion,

    scope:
      validation.scope,

    patchBytes:
      validation.patchBytes,

    beforeHash,

    afterHash,

    explanation:
      Array.isArray(
        ai.explanation
      )
        ? ai.explanation.slice(
            0,
            DEFAULT_POLICY.MAX_REPAIR_PLAN_STEPS
          )
        : [],

    verificationPlan:
      Array.isArray(
        ai.verificationPlan
      )
        ? ai.verificationPlan.slice(
            0,
            DEFAULT_POLICY.MAX_REPAIR_PLAN_STEPS
          )
        : [],

    diagnosis,

    authoritativeSuccess:
      false,
  };

  recordRepairPattern(
    failure,
    diagnosis,
    repair
  );

  return repair;
}

/* ================================================================
   RESOURCE RECOMMENDATION
================================================================ */

function buildResourceContext(
  executionResult
) {
  if (
    !executionResult
  ) {
    return null;
  }

  const snapshot =
    executionResult
      .finalResourceSnapshot ||
    null;

  if (!snapshot) {
    return null;
  }

  return {
    cpuPercent:
      snapshot.cpuPercent ??
      null,

    memoryMB:
      snapshot.memoryMB ??
      null,

    pids:
      snapshot.pids ??
      null,

    memoryPercent:
      snapshot.memoryPercent ??
      null,
  };
}

/* ================================================================
   ENGINEERING CONTEXT
================================================================ */

function buildEngineeringContext(
  context
) {
  const failure =
    normalizeFailure(
      context?.failure
    );

  const signature =
    createFailureSignature(
      failure
    );

  const files =
    Array.isArray(
      context?.files
    )
      ? context.files
      : [];

  const targets =
    extractTargetsFromErrors(
      failure,
      files
    );

  return {
    runId:
      context?.runId ||
      null,

    projectId:
      context?.projectId ||
      null,

    attempt:
      context?.attempt ||
      null,

    repairAttempt:
      context?.repairAttempt ||
      null,

    failure,

    signature,

    sourceHash:
      calculateFilesHash(
        files
      ),

    affectedFiles:
      targets,

    sourceContext:
      extractSourceContext(
        files,
        targets
      ),

    knownRepairs:
      findKnownRepair(
        failure
      ),

    resourceUsage:
      buildResourceContext(
        context?.executionResult
      ),
  };
}

/* ================================================================
   LEARNING AFTER AUTHORITATIVE RESULT
================================================================ */

/**
 * Call this ONLY after EngineeringExecutor has produced a real
 * authoritative result.
 *
 * success=true means:
 *   authoritative build passed
 *
 * success=false means:
 *   authoritative verification failed
 */
function recordAuthoritativeRepairOutcome(
  context
) {
  const diagnosis =
    context?.diagnosis;

  const repair =
    context?.repair;

  const failure =
    context?.failure;

  if (
    !diagnosis ||
    !repair
  ) {
    return null;
  }

  const signatureId =
    diagnosis?.signature
      ?.signatureId;

  const strategy =
    repair.strategy ||
    diagnosis.strategy;

  if (
    !signatureId ||
    !strategy
  ) {
    return null;
  }

  if (
    context?.success ===
    true
  ) {
    return markRepairSuccess(
      signatureId,
      strategy
    );
  }

  return markRepairFailure(
    signatureId,
    strategy
  );
}

/* ================================================================
   ENGINEERING SUMMARY
================================================================ */

function getSummary() {
  return {
    version:
      INTELLIGENCE_VERSION,

    systemVersion:
      ENGINEERING_SYSTEM_VERSION,

    failurePatterns:
      failureMemory.size,

    repairPatterns:
      repairMemory.size,

    capabilities: [
      "failure-normalization",
      "authoritative-failure-analysis",
      "root-cause-analysis",
      "failure-signatures",
      "repair-planning",
      "repair-validation",
      "scope-control",
      "dependency-control",
      "secret-detection",
      "regression-detection",
      "repair-learning",
      "known-repair-analysis",
      "resource-analysis",
      "auto-scale-recommendation",
      "deterministic-fallback",
      "centralized-ai-provider",
      "authoritative-outcome-learning",
    ],
  };
}

/* ================================================================
   HEALTH
================================================================ */

function getHealth() {
  loadDependencies();

  return {
    success:
      true,

    service:
      "engineeringIntelligence",

    version:
      INTELLIGENCE_VERSION,

    providerAvailable:
      Boolean(
        aiProvider
      ),

    stateAvailable:
      Boolean(
        engineeringState
      ),

    authoritativeBuildClaim:
      false,

    fakeSuccessAllowed:
      false,

    memory: {
      failurePatterns:
        failureMemory.size,

      repairPatterns:
        repairMemory.size,
    },

    safety: {
      secretDetection:
        true,

      dependencyDiff:
        true,

      scopeDiff:
        true,

      repairFileLimit:
        DEFAULT_POLICY.MAX_REPAIR_FILES,

      maxDependencyChanges:
        DEFAULT_POLICY.MAX_DEPENDENCY_CHANGES,

      maxScopeExpansion:
        DEFAULT_POLICY.MAX_SCOPE_EXPANSION,
    },
  };
}

/* ================================================================
   PUBLIC CONTRACT
================================================================ */

module.exports = {
  INTELLIGENCE_VERSION,

  ENGINEERING_SYSTEM_VERSION,

  FAILURE_CATEGORIES,

  REPAIR_STRATEGIES,

  DEFAULT_POLICY,

  normalizeFailure,

  detectFailureCategory,

  determineRetryability,

  createFailureSignature,

  calculateFilesHash,

  extractSourceContext,

  extractTargetsFromErrors,

  deterministicDiagnosis,

  diagnoseFailure,

  validateRepair,

  mergeRepairFiles,

  repairFailure,

  calculateDependencyChanges,

  calculateScopeExpansion,

  containsLikelySecret,

  analyzeResources,

  recommendAutoScale,

  detectRegression,

  findKnownRepair,

  markRepairSuccess,

  markRepairFailure,

  getRepairSuccessRate,

  recordAuthoritativeRepairOutcome,

  buildEngineeringContext,

  buildResourceContext,

  getSummary,

  getHealth,
};
