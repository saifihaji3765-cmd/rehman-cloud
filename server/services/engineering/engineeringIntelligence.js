/**
 * ================================================================
 * ZYRIONOS ENGINEERING INTELLIGENCE
 * ================================================================
 *
 * File:
 *   services/engineering/engineeringIntelligence.js
 *
 * Version:
 *   1.0.0
 *
 * Role:
 *   Engineering Diagnosis / Repair / Learning Intelligence
 *
 * Responsibilities:
 *
 *   1. Failure normalization
 *   2. Root-cause analysis
 *   3. Failure signature generation
 *   4. Repair strategy generation
 *   5. Repair scope control
 *   6. Dependency-change control
 *   7. Static repair validation
 *   8. Repair confidence scoring
 *   9. Successful repair pattern recording
 *  10. Failure pattern recording
 *  11. Engineering memory
 *  12. Resource pressure analysis
 *  13. Auto-scale recommendations
 *  14. Regression detection
 *  15. Deterministic fallback reasoning
 *  16. Centralized AI provider integration
 *
 * IMPORTANT:
 *
 * This module NEVER declares an authoritative build successful.
 *
 * AI can:
 *
 *   diagnose
 *   propose
 *   repair
 *   explain
 *
 * But only the authoritative executor can prove:
 *
 *   build success
 *   artifact creation
 *   artifact validity
 *   runtime success
 *
 * ================================================================
 */

"use strict";


/* ================================================================
   MODULE IDENTITY
================================================================ */

const INTELLIGENCE_VERSION =
  "1.0.0";

const ENGINEERING_SYSTEM_VERSION =
  "1.0.0";


/* ================================================================
   NODE MODULES
================================================================ */

const crypto =
  require("crypto");

const fs =
  require("fs");

const path =
  require("path");


/* ================================================================
   DEPENDENCY LOADING
================================================================ */

let engineeringState = null;

let aiProvider = null;


/* ================================================================
   SAFE REQUIRE
================================================================ */

function safeRequire(modulePath) {

  try {

    return require(modulePath);

  } catch (error) {

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


  /**
   * Centralized provider.
   *
   * This file NEVER calls Gemini/OpenAI/Claude/DeepSeek directly.
   *
   * It uses the existing centralized ZyrionOS provider abstraction.
   */

  if (!aiProvider) {

    const candidates = [

      "../aiProviderService",

      "../services/aiProviderService",

      "../../services/aiProviderService",

      "../ai/providerService",

      "../../ai/providerService",

    ];


    for (
      const candidate
      of candidates
    ) {

      const loaded =
        safeRequire(candidate);


      if (loaded) {

        aiProvider =
          loaded;

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

    SYNTAX:
      "syntax",

    DEPENDENCY:
      "dependency",

    MISSING_MODULE:
      "missing-module",

    CONFIGURATION:
      "configuration",

    PERMISSION:
      "permission",

    NETWORK:
      "network",

    TIMEOUT:
      "timeout",

    RESOURCE:
      "resource",

    PROCESS:
      "process-terminated",

    BUILD:
      "build",

    TEST:
      "test",

    RUNTIME:
      "runtime",

    ARTIFACT:
      "artifact",

    INVALID_COMMAND:
      "invalid-command",

    SECURITY:
      "security",

    UNKNOWN:
      "unknown",

  });


/* ================================================================
   REPAIR STRATEGIES
================================================================ */

const REPAIR_STRATEGIES =
  Object.freeze({

    SOURCE_FIX:
      "source-fix",

    DEPENDENCY_FIX:
      "dependency-fix",

    CONFIG_FIX:
      "configuration-fix",

    IMPORT_FIX:
      "import-fix",

    BUILD_SCRIPT_FIX:
      "build-script-fix",

    TEST_FIX:
      "test-fix",

    RUNTIME_FIX:
      "runtime-fix",

    ENVIRONMENT_FIX:
      "environment-fix",

    RESOURCE_ADJUSTMENT:
      "resource-adjustment",

    ROLLBACK:
      "rollback",

    NO_SAFE_REPAIR:
      "no-safe-repair",

  });


/* ================================================================
   DEFAULT INTELLIGENCE POLICY
================================================================ */

const DEFAULT_POLICY =
  Object.freeze({

    MAX_REPAIR_FILES:
      25,

    MAX_DEPENDENCY_CHANGES:
      15,

    MAX_SCOPE_EXPANSION:
      1.5,

    MIN_REPAIR_CONFIDENCE:
      0.70,

    MIN_HIGH_RISK_CONFIDENCE:
      0.90,

    MAX_DIAGNOSIS_FILES:
      100,

    MAX_ERROR_MESSAGES:
      100,

    MAX_OUTPUT_CHARS:
      50000,

    MAX_MEMORY_PATTERNS:
      5000,

    MAX_REPAIR_PLAN_STEPS:
      30,

    MAX_AI_REPAIR_ROUNDS:
      2,

  });


/* ================================================================
   FAILURE RETRYABILITY
================================================================ */

const RETRYABLE_CATEGORIES =
  new Set([

    FAILURE_CATEGORIES.NETWORK,

    FAILURE_CATEGORIES.TIMEOUT,

    FAILURE_CATEGORIES.RESOURCE,

    FAILURE_CATEGORIES.PROCESS,

  ]);


/* ================================================================
   HASH
================================================================ */

function sha256(
  value
) {

  return crypto
    .createHash("sha256")
    .update(
      String(value)
    )
    .digest("hex");

}


/* ================================================================
   FILE HASH
================================================================ */

function calculateFilesHash(
  files
) {

  const normalized =
    Array.isArray(files)

      ? files.map(
          file => ({

            path:
              String(
                file?.path ||
                file?.name ||
                ""
              ),

            content:
              String(
                file?.content ||
                ""
              ),

          })
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

function safeJsonParse(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return value;

  }


  try {

    return JSON.parse(
      value
    );

  } catch (error) {

    return null;

  }

}


/* ================================================================
   CLONE
================================================================ */

function clone(
  value
) {

  if (
    value ===
    undefined
  ) {

    return undefined;

  }


  return JSON.parse(
    JSON.stringify(value)
  );

}


/* ================================================================
   LIMIT STRING
================================================================ */

function limitString(
  value,
  max
) {

  const text =
    String(
      value ||
      ""
    );


  if (
    text.length <=
    max
  ) {

    return text;

  }


  return (

    text.slice(
      0,
      max
    ) +

    "\n...[TRUNCATED]..."

  );

}


/* ================================================================
   PATH NORMALIZATION
================================================================ */

function normalizeFilePath(
  filePath
) {

  return String(
    filePath ||
    ""
  )
    .replace(
      /\\/g,
      "/"
    )
    .replace(
      /^\/+/,
      ""
    );

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
    normalized.includes(
      "\0"
    )
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
    normalized.startsWith(
      ".git/"
    ) ||
    normalized ===
      ".git"
  ) {

    return false;

  }


  if (
    normalized.startsWith(
      ".env"
    )
  ) {

    return false;

  }


  return true;

}


/* ================================================================
   FILE MAP
================================================================ */

function createFileMap(
  files
) {

  const map =
    new Map();


  if (
    !Array.isArray(files)
  ) {

    return map;

  }


  for (
    const file
    of files
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
    .map(
      value =>
        limitString(
          typeof value ===
          "string"
            ? value
            : JSON.stringify(value),
          DEFAULT_POLICY.MAX_OUTPUT_CHARS
        )
    )
    .filter(Boolean)
    .slice(
      0,
      DEFAULT_POLICY.MAX_ERROR_MESSAGES
    );

}


/* ================================================================
   FAILURE CATEGORY DETECTION
================================================================ */

function detectFailureCategory(
  failure
) {

  if (
    failure?.category
  ) {

    return String(
      failure.category
    ).toLowerCase();

  }


  if (
    failure?.failureCategory
  ) {

    return String(
      failure.failureCategory
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
    text.includes(
      "eacces"
    ) ||
    text.includes(
      "permission denied"
    )
  ) {

    return FAILURE_CATEGORIES.PERMISSION;

  }


  if (
    text.includes(
      "enotfound"
    ) ||
    text.includes(
      "network"
    ) ||
    text.includes(
      "fetch failed"
    ) ||
    text.includes(
      "getaddrinfo"
    )
  ) {

    return FAILURE_CATEGORIES.NETWORK;

  }


  if (
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
    )
  ) {

    return FAILURE_CATEGORIES.RESOURCE;

  }


  if (
    text.includes(
      "npm err"
    ) ||
    text.includes(
      "yarn error"
    ) ||
    text.includes(
      "pnpm"
    ) &&
    text.includes(
      "error"
    )
  ) {

    return FAILURE_CATEGORIES.DEPENDENCY;

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

    buildId:
      failure?.buildId ||
      null,

    sourceHash:
      failure?.sourceHash ||
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
    error ||
    ""
  )

    .toLowerCase()

    /**
     * Remove timestamps.
     */
    .replace(
      /\b\d{4}-\d{2}-\d{2}[tT][^\s]+\b/g,
      "<timestamp>"
    )

    /**
     * Remove absolute paths.
     */
    .replace(
      /\/(?:workspace|home|tmp)\/[^\s:'"]+/g,
      "<path>"
    )

    /**
     * Remove Windows paths.
     */
    .replace(
      /[a-zA-Z]:\\[^\s:'"]+/g,
      "<path>"
    )

    /**
     * Remove line/column noise.
     */
    .replace(
      /:\d+:\d+/g,
      ":<line>:<column>"
    )

    /**
     * Remove hexadecimal IDs.
     */
    .replace(
      /\b[a-f0-9]{16,}\b/g,
      "<id>"
    )

    /**
     * Normalize whitespace.
     */
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
   SOURCE CONTEXT EXTRACTION
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


  const targets =
    Array.isArray(
      affectedFiles
    )
      ? affectedFiles
      : [];


  for (
    const target
    of targets.slice(
      0,
      DEFAULT_POLICY.MAX_DIAGNOSIS_FILES
    )
  ) {

    const filePath =
      normalizeFilePath(
        target
      );


    if (
      !map.has(filePath)
    ) {

      continue;

    }


    const content =
      map.get(
        filePath
      );


    contexts.push({

      path:
        filePath,

      content:
        limitString(
          content,
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
    const filePath
    of (
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
    )
      .join("\n");


  for (
    const filePath
    of map.keys()
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
  );

}


/* ================================================================
   DETERMINISTIC ROOT-CAUSE ANALYSIS
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
        "Execution exceeded an available CPU or memory resource boundary.";

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
        REPAIR_STRATEGIES.ARTIFACT;

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
   ARTIFACT STRATEGY NORMALIZATION
================================================================ */

function normalizeArtifactStrategy(
  strategy
) {

  if (
    strategy ===
    "artifact-fix"
  ) {

    return REPAIR_STRATEGIES.ENVIRONMENT_FIX;

  }


  return strategy;

}


/* ================================================================
   AI PROVIDER CALL
================================================================ */

/**
 * Central provider adapter.
 *
 * Supports the common generateText-style contracts already used by
 * ZyrionOS while avoiding direct provider selection here.
 */

async function callAI(
  prompt,
  options
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


  for (
    const name
    of methods
  ) {

    if (
      typeof aiProvider[name] ===
      "function"
    ) {

      method =
        aiProvider[name];

      break;

    }

  }


  if (!method) {

    return null;

  }


  const payload = {

    prompt,

    system:
      options?.system ||
      undefined,

    temperature:
      options?.temperature ??
      0.1,

    maxTokens:
      options?.maxTokens ||
      12000,

    responseFormat:
      options?.responseFormat ||
      "json",

    purpose:
      options?.purpose ||
      "engineering-intelligence",

  };


  try {

    const result =
      await method.call(
        aiProvider,
        payload
      );


    if (
      typeof result ===
      "string"
    ) {

      return safeJsonParse(
        result
      ) || {

        text:
          result,

      };

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


    return result;

  } catch (error) {

    return {

      success:
        false,

      error:
        error.message,

      providerFailure:
        true,

    };

  }

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

You must NOT claim the project is fixed.
You must NOT claim the build passed.
You must NOT invent logs.
You must use only the supplied evidence.

OBJECTIVE:
Determine the most probable root cause and the smallest safe repair.

ENGINEERING RUN:
${JSON.stringify(
  context.run,
  null,
  2
)}

FAILURE:
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

1. affectedFiles must reference supplied files.
2. Do not create imaginary files.
3. Prefer the smallest repair.
4. Do not change dependencies unless evidence requires it.
5. Do not modify unrelated files.
6. Never remove security boundaries to make a build pass.
7. Never disable authoritative verification.
8. Never replace a build command with a runtime command.
9. Never claim success.
10. If evidence is insufficient, set safeToRepair=false.
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


  const targets =
    deterministic.affectedFiles;


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

      },

      failure,

      deterministic,

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


  /**
   * Deterministic fallback remains authoritative for diagnosis
   * output when the AI provider is unavailable.
   */

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
      normalizeArtifactStrategy(
        ai?.strategy ||
        deterministic.strategy
      ),

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
        ? ai.dependencyChanges
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

    deterministicFallback:
      !ai ||
      ai?.providerFailure ===
      true,

  };


  /**
   * Confidence safety gate.
   */

  if (
    diagnosis.confidence <
    DEFAULT_POLICY.MIN_REPAIR_CONFIDENCE
  ) {

    diagnosis.safeToRepair =
      false;

  }


  /**
   * High-risk changes require stronger confidence.
   */

  if (
    diagnosis.dependencyChanges.length >
    0 &&
    diagnosis.confidence <
    DEFAULT_POLICY.MIN_HIGH_RISK_CONFIDENCE
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
   CONFIDENCE
================================================================ */

function clampConfidence(
  value
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number)
  ) {

    return 0;

  }


  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );

}


/* ================================================================
   SCOPE
================================================================ */

function normalizeScopeExpansion(
  value
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number) ||
    number < 1
  ) {

    return 1;

  }


  return number;

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
    const file
    of (
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


  return result;

}


/* ================================================================
   REPAIR PLAN PROMPT
================================================================ */

function buildRepairPrompt(
  context
) {

  return `
You are the autonomous Repair Intelligence of ZyrionOS.

You have a REAL authoritative failure.

Generate a MINIMAL and SAFE repair.

Do not invent evidence.
Do not claim success.
Do not modify unrelated files.
Do not remove security controls.
Do not disable tests.
Do not bypass the authoritative build.
Do not convert runtime commands into build commands.

RUN:
${JSON.stringify(
  context.run,
  null,
  2
)}

FAILURE:
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

FILES:
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
  "changedFiles": [],
  "dependencyChanges": 0,
  "scopeExpansion": 1.0,
  "files": [
    {
      "path": "...",
      "content": "..."
    }
  ],
  "explanation": [],
  "verificationPlan": []
}

STRICT RULES:

1. Return complete content for every changed file.
2. Return only files required for the repair.
3. Never modify .env files.
4. Never modify .git files.
5. Never introduce credentials.
6. Never add arbitrary network access.
7. Never weaken Docker/security constraints.
8. Never increase resource limits unless the diagnosis explicitly
   identifies resource pressure.
9. Never change package dependencies without evidence.
10. Never exceed the supplied repair limits.
11. Never return a fake successful build result.
`;

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


  const sanitized =
    [];


  const seen =
    new Set();


  for (
    const file
    of repairFiles
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


    sanitized.push({

      path:
        filePath,

      content:
        file.content,

    });

  }


  /**
   * Changed-file authorization.
   */

  const allowedTargets =
    new Set(

      (
        context?.diagnosis?.repairTargets ||
        context?.diagnosis?.affectedFiles ||
        []
      )
        .map(
          normalizeFilePath
        )
        .filter(
          isSafeProjectPath
        )

    );


  for (
    const file
    of sanitized
  ) {

    /**
     * Existing files must be explicitly targeted.
     *
     * New files are allowed only when diagnosis explicitly
     * authorized the path.
     */

    if (
      originalMap.has(
        file.path
      )
    ) {

      if (
        allowedTargets.size > 0 &&
        !allowedTargets.has(
          file.path
        )
      ) {

        return {

          success:
            false,

          reason:
            `Repair attempted unauthorized file: ${file.path}`,

        };

      }

    }

    else {

      if (
        !allowedTargets.has(
          file.path
        )
      ) {

        return {

          success:
            false,

          reason:
            `New file not authorized by diagnosis: ${file.path}`,

        };

      }

    }

  }


  const dependencyChanges =
    Number(
      repair.dependencyChanges ||
      0
    );


  if (
    !Number.isInteger(
      dependencyChanges
    ) ||
    dependencyChanges < 0
  ) {

    return {

      success:
        false,

      reason:
        "Invalid dependencyChanges",

    };

  }


  if (
    dependencyChanges >
    DEFAULT_POLICY.MAX_DEPENDENCY_CHANGES
  ) {

    return {

      success:
        false,

      reason:
        "Dependency change limit exceeded",

    };

  }


  const scopeExpansion =
    normalizeScopeExpansion(
      repair.scopeExpansion
    );


  if (
    scopeExpansion >
    DEFAULT_POLICY.MAX_SCOPE_EXPANSION
  ) {

    return {

      success:
        false,

      reason:
        "Scope expansion limit exceeded",

    };

  }


  return {

    success:
      true,

    files:
      sanitized,

    dependencyChanges,

    scopeExpansion,

  };

}


/* ================================================================
   MERGE REPAIR
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
    const file
    of repairedFiles
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

      diagnosis,

      files:
        files.map(
          file => ({

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

      diagnosis,

    };

  }


  const finalFiles =
    mergeRepairFiles(
      files,
      validation.files
    );


  const changedFiles =
    validation.files.map(
      file =>
        file.path
    );


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


  const repair = {

    success:
      true,

    intelligenceVersion:
      INTELLIGENCE_VERSION,

    strategy:
      ai.strategy ||
      diagnosis.strategy,

    confidence:
      clampConfidence(
        ai.confidence ??
        diagnosis.confidence
      ),

    files:
      finalFiles,

    changedFiles,

    dependencyChanges:
      validation.dependencyChanges,

    scopeExpansion:
      validation.scopeExpansion,

    beforeHash,

    afterHash,

    explanation:
      Array.isArray(
        ai.explanation
      )
        ? ai.explanation
        : [],

    verificationPlan:
      Array.isArray(
        ai.verificationPlan
      )
        ? ai.verificationPlan
        : [],

    diagnosis,

  };


  recordRepairPattern(
    failure,
    diagnosis,
    repair
  );


  return repair;

}


/* ================================================================
   FAILURE MEMORY
================================================================ */

const failureMemory =
  new Map();


const repairMemory =
  new Map();


/* ================================================================
   RECORD FAILURE PATTERN
================================================================ */

function recordFailurePattern(
  failure,
  diagnosis
) {

  const signature =
    diagnosis?.signature?.signatureId;


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


  existing.count +=
    1;


  existing.categories.add(
    diagnosis.category
  );


  const strategy =
    diagnosis.strategy;


  existing.strategies.set(

    strategy,

    (
      existing.strategies.get(
        strategy
      ) || 0
    ) + 1

  );


  existing.lastSeen =
    new Date().toISOString();


  failureMemory.set(
    signature,
    existing
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
    diagnosis?.signature?.signatureId;


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


  existing.attempts +=
    1;


  existing.lastSeen =
    new Date().toISOString();


  repairMemory.set(
    key,
    existing
  );


  persistPattern(
    "repair",
    key,
    existing
  );


  return existing;

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
    const methodName
    of methods
  ) {

    if (
      typeof engineeringState[
        methodName
      ] ===
      "function"
    ) {

      try {

        engineeringState[
          methodName
        ](
          {

            type,

            key,

            data:
              clone(data),

            timestamp:
              new Date().toISOString(),

          }
        );


      } catch (error) {

        /**
         * Learning persistence must never crash the engineering
         * pipeline.
         */

      }


      break;

    }

  }

}


/* ================================================================
   REPAIR PATTERN SUCCESS UPDATE
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


  pattern.successes +=
    1;


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
   REPAIR PATTERN FAILURE UPDATE
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


  pattern.failures +=
    1;


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
   REPAIR SUCCESS RATE
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
    pattern.attempts ===
    0
  ) {

    return 0;

  }


  return (
    pattern.successes /
    pattern.attempts
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

  }

  else if (
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

  }

  else if (
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
      reason =>
        reason.includes(
          "critical"
        )
    )
  ) {

    pressure =
      "critical";

  }

  else if (
    reasons.length
  ) {

    pressure =
      "high";

  }


  return {

    pressure,

    scaleRecommended:
      pressure ===
      "high" ||
      pressure ===
      "critical",

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
   AUTO SCALE RECOMMENDATION
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
    Number(
      context?.maxAutoScale ||
      4
    );


  if (
    current >=
    max
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
   LEARNING QUERY
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
    const [
      key,
      pattern
    ]
    of repairMemory.entries()
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


  return matches.sort(

    (
      a,
      b
    ) =>
      b.successRate -
      a.successRate

  );

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

  };

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

      "root-cause-analysis",

      "failure-signatures",

      "repair-planning",

      "repair-validation",

      "scope-control",

      "dependency-control",

      "regression-detection",

      "repair-learning",

      "resource-analysis",

      "auto-scale-recommendation",

      "deterministic-fallback",

      "centralized-ai-provider",

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

  deterministicDiagnosis,

  diagnoseFailure,

  repairFailure,

  validateRepair,

  mergeRepairFiles,

  analyzeResources,

  recommendAutoScale,

  detectRegression,

  findKnownRepair,

  markRepairSuccess,

  markRepairFailure,

  getRepairSuccessRate,

  buildEngineeringContext,

  getSummary,

  getHealth,

};
