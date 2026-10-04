/* =========================================================
   ZyrionOS BUILDER AGENT
   Production Chunked Code Generation Engine
   Version: 5.0.0

   Architecture:

   Planning Agent
        ↓
   Builder Agent
        ↓
   Project Manifest
        ↓
   Dependency-aware File Batches
        ↓
   AI Generation
        ↓
   Strict Requested-Path Filtering
        ↓
   Package / Build Contract Validation
        ↓
   Controlled Repair
        ↓
   Final Manifest Coverage Validation
        ↓
   Complete Project
        ↓
   BuildValidationService
        ↓
   AuthoritativeBuildService

   IMPORTANT:

   - Builder NEVER executes the project.
   - Builder NEVER runs npm install.
   - Builder NEVER runs npm build.
   - Builder NEVER starts a server.
   - Builder NEVER calls an AI provider directly.
   - All AI calls go through aiProviderService.
   - Gemini is NOT used.
   - Extra AI-generated files are NEVER accepted.
   - Missing requested files trigger controlled repair.
   - Duplicate files are rejected.
   - Invalid paths/content are rejected.
   - package.json build scripts are semantically validated.
   - Runtime/dev/watch commands are NEVER accepted as
     authoritative build commands.
========================================================= */

"use strict";


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");

const {
  generateJSON,
} =
  require("../services/ai/aiProviderService");


/* =========================================================
   VERSION
========================================================= */

const BUILDER_AGENT_VERSION =
  "5.0.0";


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILES =
  100;

const MAX_PATH_LENGTH =
  300;

const MAX_FILE_SIZE =
  200000;

const MAX_PROMPT_LENGTH =
  12000;

const MAX_PLAN_SIZE =
  100000;

const FILES_PER_BATCH =
  3;

const FILE_BATCH_MAX_TOKENS =
  6500;

const MANIFEST_MAX_TOKENS =
  3500;

const MAX_BATCH_ATTEMPTS =
  3;

const MAX_RAW_BATCH_RESPONSE_FILES =
  20;

const MAX_MANIFEST_CONTEXT_SIZE =
  30000;

const MAX_GENERATED_INDEX_SIZE =
  12000;


/* =========================================================
   PACKAGE
========================================================= */

const PACKAGE_JSON_PATH =
  "package.json";


/* =========================================================
   LOGGER COMPATIBILITY
========================================================= */

function logInfo(message) {

  if (
    logger &&
    typeof logger.info === "function"
  ) {

    return logger.info(message);

  }

}


function logSuccess(message) {

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

}


function logWarning(message) {

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

}


function logError(message) {

  if (
    logger &&
    typeof logger.error === "function"
  ) {

    return logger.error(message);

  }

}


/* =========================================================
   SAFE STRING
========================================================= */

function safeString(
  value,
  maxLength = 10000
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
  value,
  maxLength = 100000
) {

  try {

    const output =
      JSON.stringify(
        value ?? null
      );


    return output.slice(
      0,
      maxLength
    );

  } catch {

    return "{}";

  }

}


/* =========================================================
   PROJECT NAME
========================================================= */

function normalizeProjectName(
  value
) {

  const name =
    safeString(
      value,
      120
    );


  if (!name) {

    return "zyrionos-project";

  }


  return name
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^[-_.]+|[-_.]+$/g,
      ""
    )
    .slice(
      0,
      100
    ) ||
    "zyrionos-project";

}


/* =========================================================
   FRAMEWORK
========================================================= */

function normalizeFramework(
  value
) {

  const framework =
    safeString(
      value,
      100
    );


  return framework ||
    "React";

}


/* =========================================================
   FRAMEWORK CLASSIFICATION
========================================================= */

function classifyFramework(
  framework,
  packageJson = null
) {

  const frameworkText =
    safeString(
      framework,
      200
    ).toLowerCase();


  const dependencies = {

    ...(packageJson?.dependencies || {}),

    ...(packageJson?.devDependencies || {})

  };


  const dependencyNames =
    Object.keys(
      dependencies
    ).map(
      item =>
        item.toLowerCase()
    );


  if (
    frameworkText.includes("next") ||
    dependencyNames.includes("next")
  ) {

    return "next";

  }


  if (
    frameworkText.includes("vue") ||
    dependencyNames.includes("vue")
  ) {

    return "vue";

  }


  if (
    frameworkText.includes("svelte") ||
    dependencyNames.includes("svelte")
  ) {

    return "svelte";

  }


  if (
    frameworkText.includes("react") ||
    dependencyNames.includes("react")
  ) {

    return "react";

  }


  if (
    frameworkText.includes("vite") ||
    dependencyNames.includes("vite")
  ) {

    return "vite";

  }


  if (
    frameworkText.includes("typescript") ||
    dependencyNames.includes("typescript")
  ) {

    return "typescript";

  }


  if (
    frameworkText.includes("node") ||
    dependencyNames.includes("express") ||
    dependencyNames.includes("fastify") ||
    dependencyNames.includes("koa")
  ) {

    return "node";

  }


  return "generic";

}


/* =========================================================
   FILE PATH SECURITY
========================================================= */

function normalizeFilePath(
  value
) {

  let filePath =
    safeString(
      value,
      MAX_PATH_LENGTH
    );


  if (!filePath) {

    return null;

  }


  filePath =
    filePath.replace(
      /\\/g,
      "/"
    );


  if (
    filePath.includes("\0")
  ) {

    return null;

  }


  if (
    filePath.includes(":")
  ) {

    return null;

  }


  if (
    filePath.startsWith("~")
  ) {

    return null;

  }


  filePath =
    filePath.replace(
      /^\/+/,
      ""
    );


  const segments =
    filePath.split("/");


  if (
    segments.some(
      segment =>
        segment === ".."
    )
  ) {

    return null;

  }


  filePath =
    filePath.replace(
      /\/+/g,
      "/"
    );


  if (
    filePath === "." ||
    filePath === ""
  ) {

    return null;

  }


  return filePath;

}


/* =========================================================
   FILE CONTENT
========================================================= */

function normalizeFileContent(
  value
) {

  if (
    typeof value !== "string"
  ) {

    return null;

  }


  if (
    value.length >
    MAX_FILE_SIZE
  ) {

    return null;

  }


  return value;

}


/* =========================================================
   FILE
========================================================= */

function normalizeFile(
  file
) {

  if (
    !file ||
    typeof file !== "object"
  ) {

    return null;

  }


  const path =
    normalizeFilePath(
      file.path
    );


  const content =
    normalizeFileContent(
      file.content
    );


  if (
    !path ||
    content === null
  ) {

    return null;

  }


  return {

    path,

    content

  };

}


/* =========================================================
   FILES
========================================================= */

function normalizeFiles(
  files
) {

  if (
    !Array.isArray(files)
  ) {

    return [];

  }


  const normalized = [];

  const seen =
    new Set();


  for (
    const file of files
  ) {

    if (
      normalized.length >=
      MAX_FILES
    ) {

      break;

    }


    const normalizedFile =
      normalizeFile(
        file
      );


    if (!normalizedFile) {

      continue;

    }


    const key =
      normalizedFile.path.toLowerCase();


    if (
      seen.has(key)
    ) {

      continue;

    }


    seen.add(key);

    normalized.push(
      normalizedFile
    );

  }


  return normalized;

}


/* =========================================================
   BUILD REQUEST
========================================================= */

function normalizeBuildRequest(
  input = {}
) {

  const request =
    input &&
    typeof input === "object"
      ? input
      : {};


  const prompt =
    safeString(
      request.prompt,
      MAX_PROMPT_LENGTH
    );


  const plan =
    request.plan ??
    null;


  const planString =
    safeJson(
      plan,
      MAX_PLAN_SIZE
    );


  const framework =
    normalizeFramework(
      request.framework
    );


  const projectId =
    safeString(
      request.projectId,
      200
    );


  const userId =
    safeString(
      request.userId,
      200
    );


  return {

    prompt,

    plan,

    planString,

    framework,

    projectId,

    userId

  };

}


/* =========================================================
   PACKAGE JSON PARSER
========================================================= */

function parsePackageJson(
  content
) {

  if (
    typeof content !== "string"
  ) {

    return {

      valid:
        false,

      error:
        "package.json content is not a string."

    };

  }


  try {

    const parsed =
      JSON.parse(
        content
      );


    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {

      return {

        valid:
          false,

        error:
          "package.json must contain a JSON object."

      };

    }


    return {

      valid:
        true,

      data:
        parsed

    };

  } catch (error) {

    return {

      valid:
        false,

      error:
        `package.json contains invalid JSON: ${
          error?.message ||
          "parse error"
        }`

    };

  }

}


/* =========================================================
   BUILD SCRIPT
========================================================= */

function getBuildScript(
  packageJson
) {

  return safeString(
    packageJson?.scripts?.build,
    1000
  );

}


/* =========================================================
   COMMAND NORMALIZATION
========================================================= */

function normalizeCommand(
  command
) {

  return safeString(
    command,
    2000
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


/* =========================================================
   LONG-RUNNING COMMAND DETECTION
========================================================= */

/*
 * These commands are NEVER acceptable as scripts.build.
 *
 * The authoritative executor runs:
 *
 *     npm run build
 *
 * Therefore "build" must terminate.
 */

const FORBIDDEN_BUILD_COMMAND_PATTERNS = [

  /*
   * Node servers.
   */

  /\bnode(?:js)?\s+(?:\.\/)?(?:server|index|app|main)\.(?:js|cjs|mjs|ts)\b/i,

  /\bnode(?:js)?\s+.*(?:server|express|fastify|koa)\b/i,

  /*
   * Package-manager runtime commands.
   */

  /\bnpm\s+(?:start|run\s+start)\b/i,

  /\byarn\s+start\b/i,

  /\bpnpm\s+start\b/i,

  /\bbun\s+start\b/i,

  /*
   * Development commands.
   */

  /\bnpm\s+(?:run\s+dev|dev)\b/i,

  /\byarn\s+dev\b/i,

  /\bpnpm\s+dev\b/i,

  /\bbun\s+dev\b/i,

  /\bnext\s+dev\b/i,

  /\bvite\s+dev\b/i,

  /*
   * Dev servers.
   */

  /\bnodemon\b/i,

  /\bts-node-dev\b/i,

  /\bwebpack-dev-server\b/i,

  /\bhttp-server\b/i,

  /\bserve\s+-s\b/i,

  /*
   * Watch mode.
   */

  /\b--watch\b/i,

  /\bwatch\s+--/i,

  /*
   * Explicit preview servers.
   */

  /\bvite\s+preview\b/i,

  /\bnext\s+start\b/i

];


/* =========================================================
   KNOWN FINITE BUILD COMMANDS
========================================================= */

const KNOWN_BUILD_COMMAND_PATTERNS = [

  /\bvite\s+build\b/i,

  /\bnext\s+build\b/i,

  /\breact-scripts\s+build\b/i,

  /\bvue-cli-service\s+build\b/i,

  /\bsvelte-kit\s+build\b/i,

  /\bng\s+build\b/i,

  /\bwebpack\b/i,

  /\brollup\b/i,

  /\bparcel\s+build\b/i,

  /\besbuild\b/i,

  /\besbuild\s+.*--bundle\b/i,

  /\btsc\b/i,

  /\btsup\b/i,

  /\bswc\b/i,

  /\bbabel\b/i,

  /\bastro\s+build\b/i,

  /\bremix\s+build\b/i,

  /\bnuxt\s+build\b/i,

  /\bqwik\s+build\b/i

];


/* =========================================================
   RUNTIME COMMAND DETECTION
========================================================= */

function isLongRunningRuntimeCommand(
  command
) {

  const normalized =
    normalizeCommand(
      command
    );


  if (!normalized) {

    return false;

  }


  return FORBIDDEN_BUILD_COMMAND_PATTERNS
    .some(
      pattern =>
        pattern.test(
          normalized
        )
    );

}


/* =========================================================
   FINITE BUILD DETECTION
========================================================= */

function looksLikeFiniteBuildCommand(
  command
) {

  const normalized =
    normalizeCommand(
      command
    );


  if (!normalized) {

    return false;

  }


  if (
    isLongRunningRuntimeCommand(
      normalized
    )
  ) {

    return false;

  }


  return KNOWN_BUILD_COMMAND_PATTERNS
    .some(
      pattern =>
        pattern.test(
          normalized
        )
    );

}


/* =========================================================
   FRAMEWORK BUILD RULES
========================================================= */

const BUILD_COMMAND_RULES = {

  next: [

    /\bnext\s+build\b/i

  ],

  vite: [

    /\bvite\s+build\b/i

  ],

  react: [

    /\bvite\s+build\b/i,

    /\breact-scripts\s+build\b/i,

    /\bwebpack\b/i,

    /\btsc(?:\s|$)/i,

    /\besbuild\b/i,

    /\btsup\b/i

  ],

  vue: [

    /\bvite\s+build\b/i,

    /\bvue-cli-service\s+build\b/i

  ],

  svelte: [

    /\bvite\s+build\b/i,

    /\bsvelte-kit\s+build\b/i

  ],

  typescript: [

    /\btsc(?:\s|$)/i,

    /\besbuild\b/i,

    /\btsup\b/i,

    /\bswc\b/i

  ],

  node: [

    /\btsc(?:\s|$)/i,

    /\besbuild\b/i,

    /\btsup\b/i,

    /\bswc\b/i,

    /\bwebpack\b/i,

    /\brollup\b/i

  ]

};


/* =========================================================
   FRAMEWORK BUILD MATCH
========================================================= */

function matchesFrameworkBuildCommand(
  framework,
  packageJson,
  command
) {

  const classification =
    classifyFramework(
      framework,
      packageJson
    );


  const rules =
    BUILD_COMMAND_RULES[
      classification
    ];


  if (
    !Array.isArray(rules) ||
    rules.length === 0
  ) {

    return null;

  }


  const matched =
    rules.some(
      pattern =>
        pattern.test(
          command
        )
    );


  return {

    classification,

    matched

  };

}


/* =========================================================
   PACKAGE BUILD CONTRACT
========================================================= */

function validatePackageBuildContract({
  packageJson,
  framework
}) {

  if (
    !packageJson ||
    typeof packageJson !== "object" ||
    Array.isArray(packageJson)
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "PACKAGE_JSON_INVALID",

      error:
        "package.json must contain a valid JSON object."

    };

  }


  const scripts =
    packageJson.scripts;


  if (
    !scripts ||
    typeof scripts !== "object" ||
    Array.isArray(scripts)
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "PACKAGE_SCRIPTS_MISSING",

      error:
        "package.json is missing a valid scripts object."

    };

  }


  const buildCommand =
    getBuildScript(
      packageJson
    );


  if (!buildCommand) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "BUILD_SCRIPT_MISSING",

      error:
        "package.json is missing scripts.build.",

      buildCommand:
        null

    };

  }


  const normalizedCommand =
    normalizeCommand(
      buildCommand
    );


  /*
   * -------------------------------------------------------
   * HARD RULE #1
   *
   * A runtime/server/dev/watch command can NEVER be the
   * authoritative build command.
   * -------------------------------------------------------
   */

  if (
    isLongRunningRuntimeCommand(
      normalizedCommand
    )
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "INVALID_BUILD_RUNTIME_COMMAND",

      error:
        `scripts.build is a runtime/dev/watch command and cannot be used as the authoritative build command: ${normalizedCommand}`,

      buildCommand:
        normalizedCommand

    };

  }


  /*
   * -------------------------------------------------------
   * HARD RULE #2
   *
   * Build scripts must resemble a finite compiler,
   * bundler, framework build or packaging operation.
   * -------------------------------------------------------
   */

  const finiteBuild =
    looksLikeFiniteBuildCommand(
      normalizedCommand
    );


  const frameworkMatch =
    matchesFrameworkBuildCommand(
      framework,
      packageJson,
      normalizedCommand
    );


  /*
   * Known framework.
   */

  if (
    frameworkMatch &&
    !frameworkMatch.matched
  ) {

    /*
     * Allow clearly finite custom build commands only.
     *
     * Example:
     *
     *   node scripts/build.mjs
     *
     * can be a legitimate custom finite build script.
     *
     * But a plain:
     *
     *   node server.js
     *
     * has already been rejected above.
     */

    const customFiniteBuild =
      finiteBuild ||
      /\b(build|compile|bundle|pack|generate)\b/i
        .test(
          normalizedCommand
        );


    if (!customFiniteBuild) {

      return {

        valid:
          false,

        repairable:
          true,

        code:
          "FRAMEWORK_BUILD_COMMAND_MISMATCH",

        error:
          `scripts.build does not match a recognized finite build strategy for ${frameworkMatch.classification}: ${normalizedCommand}`,

        buildCommand:
          normalizedCommand,

        expectedFramework:
          frameworkMatch.classification

      };

    }

  }


  /*
   * Generic project.
   */

  if (
    !frameworkMatch &&
    !finiteBuild
  ) {

    /*
     * Generic custom build commands are accepted only if
     * they explicitly look like a build/compile/bundle
     * operation.
     */

    const customBuild =
      /\b(build|compile|bundle|pack|generate)\b/i
        .test(
          normalizedCommand
        );


    if (!customBuild) {

      return {

        valid:
          false,

        repairable:
          true,

        code:
          "BUILD_COMMAND_NOT_FINITE",

        error:
          `scripts.build does not appear to be a finite build/compile/package command: ${normalizedCommand}`,

        buildCommand:
          normalizedCommand

      };

    }

  }


  /*
   * -------------------------------------------------------
   * HARD RULE #3
   *
   * start/dev/preview may exist, but build may not alias
   * directly to them.
   * -------------------------------------------------------
   */

  const runtimeScriptNames = [
    "start",
    "dev",
    "preview",
    "serve"
  ];


  for (
    const scriptName of runtimeScriptNames
  ) {

    const scriptValue =
      safeString(
        scripts[scriptName],
        1000
      );


    if (
      !scriptValue
    ) {

      continue;

    }


    /*
     * This does NOT reject the runtime script.
     *
     * It only prevents build from directly becoming
     * the same runtime command.
     */

    if (
      normalizeCommand(
        scriptValue
      ) ===
      normalizedCommand &&
      isLongRunningRuntimeCommand(
        scriptValue
      )
    ) {

      return {

        valid:
          false,

        repairable:
          true,

        code:
          "BUILD_ALIASES_RUNTIME_SCRIPT",

        error:
          `scripts.build directly aliases runtime script "${scriptName}" and cannot be authoritative: ${normalizedCommand}`,

        buildCommand:
          normalizedCommand

      };

    }

  }


  return {

    valid:
      true,

    repairable:
      false,

    code:
      "BUILD_CONTRACT_VALID",

    error:
      null,

    buildCommand:
      normalizedCommand,

    framework:
      classifyFramework(
        framework,
        packageJson
      )

  };

}


/* =========================================================
   PACKAGE FILE VALIDATION
========================================================= */

function validatePackageJsonFile(
  file,
  framework
) {

  const parsed =
    parsePackageJson(
      file?.content
    );


  if (
    !parsed.valid
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "PACKAGE_JSON_PARSE_FAILED",

      error:
        parsed.error,

      file:
        PACKAGE_JSON_PATH,

      missingFiles: [],

      invalidFiles: [
        PACKAGE_JSON_PATH
      ],

      unexpectedFiles: []

    };

  }


  const buildContract =
    validatePackageBuildContract({

      packageJson:
        parsed.data,

      framework

    });


  if (
    !buildContract.valid
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        buildContract.code,

      error:
        buildContract.error,

      file:
        PACKAGE_JSON_PATH,

      buildCommand:
        buildContract.buildCommand ||
        null,

      expected:
        buildContract.expectedFramework ||
        null,

      packageJson:
        parsed.data,

      missingFiles: [],

      invalidFiles: [
        PACKAGE_JSON_PATH
      ],

      unexpectedFiles: []

    };

  }


  return {

    valid:
      true,

    repairable:
      false,

    code:
      "PACKAGE_JSON_VALID",

    error:
      null,

    file:
      PACKAGE_JSON_PATH,

    buildCommand:
      buildContract.buildCommand,

    framework:
      buildContract.framework,

    packageJson:
      parsed.data,

    missingFiles: [],

    invalidFiles: [],

    unexpectedFiles: []

  };

}


/* =========================================================
   MANIFEST VALIDATION
========================================================= */

function validateManifest(
  manifest
) {

  if (
    !manifest ||
    typeof manifest !== "object"
  ) {

    return {

      valid:
        false,

      error:
        "Manifest is not an object."

    };

  }


  const projectName =
    normalizeProjectName(
      manifest.projectName
    );


  const framework =
    normalizeFramework(
      manifest.framework
    );


  if (
    !Array.isArray(
      manifest.files
    )
  ) {

    return {

      valid:
        false,

      error:
        "Manifest files must be an array."

    };

  }


  if (
    manifest.files.length === 0
  ) {

    return {

      valid:
        false,

      error:
        "Manifest returned no files."

    };

  }


  if (
    manifest.files.length >
    MAX_FILES
  ) {

    return {

      valid:
        false,

      error:
        `Manifest exceeds maximum file count of ${MAX_FILES}.`

    };

  }


  const files = [];

  const seen =
    new Set();


  for (
    const item of manifest.files
  ) {

    if (
      !item ||
      typeof item !== "object"
    ) {

      return {

        valid:
          false,

        error:
          "Manifest contains an invalid file entry."

      };

    }


    const path =
      normalizeFilePath(
        item.path
      );


    if (!path) {

      return {

        valid:
          false,

        error:
          "Manifest contains an invalid file path."

      };

    }


    const key =
      path.toLowerCase();


    if (
      seen.has(key)
    ) {

      return {

        valid:
          false,

        error:
          `Duplicate manifest path: ${path}`

      };

    }


    seen.add(key);


    const purpose =
      safeString(
        item.purpose,
        500
      );


    files.push({

      path,

      purpose:
        purpose ||
        "Required project file"

    });

  }


  return {

    valid:
      true,

    data: {

      projectName,

      framework,

      files

    }

  };

}


/* =========================================================
   MANIFEST PACKAGE REQUIREMENT
========================================================= */

function manifestRequiresPackageJson(
  manifestFiles,
  framework,
  plan
) {

  const hasPackage =
    manifestFiles.some(
      file =>
        file.path.toLowerCase() ===
        PACKAGE_JSON_PATH
    );


  if (
    hasPackage
  ) {

    return true;

  }


  const frameworkText =
    safeString(
      framework,
      200
    ).toLowerCase();


  const planText =
    safeJson(
      plan,
      20000
    ).toLowerCase();


  /*
   * These project types fundamentally require package
   * metadata for the current Node-based build pipeline.
   */

  const frameworkRequiresPackage =
    [
      "react",
      "next",
      "vue",
      "svelte",
      "vite",
      "typescript",
      "node"
    ].some(
      value =>
        frameworkText.includes(
          value
        )
    );


  const planRequiresPackage =
    /\b(?:npm|pnpm|yarn|bun|dependencies|package\.json|build command|build script)\b/i
      .test(
        planText
      );


  return (
    frameworkRequiresPackage ||
    planRequiresPackage
  );

}


/* =========================================================
   MANIFEST CONTRACT
========================================================= */

function validateManifestContract({
  manifest,
  framework,
  plan
}) {

  const manifestFiles =
    manifest.files;


  const packageRequired =
    manifestRequiresPackageJson(
      manifestFiles,
      framework,
      plan
    );


  const hasPackage =
    manifestFiles.some(
      file =>
        file.path.toLowerCase() ===
        PACKAGE_JSON_PATH
    );


  if (
    packageRequired &&
    !hasPackage
  ) {

    return {

      valid:
        false,

      code:
        "MANIFEST_PACKAGE_JSON_REQUIRED",

      error:
        "The generated manifest requires package.json for the selected project/framework/build architecture."

    };

  }


  return {

    valid:
      true,

    code:
      "MANIFEST_CONTRACT_VALID",

    error:
      null

  };

}


/* =========================================================
   FILE BATCH VALIDATION
========================================================= */

function validateGeneratedBatch(
  generated,
  expectedFiles,
  framework
) {

  if (
    !generated ||
    typeof generated !== "object"
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "GENERATED_BATCH_INVALID",

      error:
        "Generated batch is not an object.",

      files: [],

      validFiles: [],

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

      invalidFiles: []

    };

  }


  if (
    !Array.isArray(
      generated.files
    )
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "GENERATED_FILES_ARRAY_MISSING",

      error:
        "Generated batch does not contain a files array.",

      files: [],

      validFiles: [],

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

      invalidFiles: []

    };

  }


  if (
    generated.files.length === 0
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "GENERATED_FILES_EMPTY",

      error:
        "Generated batch returned no files.",

      files: [],

      validFiles: [],

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

      invalidFiles: []

    };

  }


  if (
    generated.files.length >
    MAX_RAW_BATCH_RESPONSE_FILES
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "RAW_BATCH_FILE_LIMIT_EXCEEDED",

      error:
        `AI response exceeded the raw batch safety limit of ${MAX_RAW_BATCH_RESPONSE_FILES} files.`,

      files: [],

      validFiles: [],

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

      invalidFiles: []

    };

  }


  const expected =
    new Map();


  for (
    const item of expectedFiles
  ) {

    const normalizedPath =
      normalizeFilePath(
        item.path
      );


    if (!normalizedPath) {

      continue;

    }


    expected.set(
      normalizedPath.toLowerCase(),
      normalizedPath
    );

  }


  const received =
    new Map();

  const unexpectedFiles =
    [];

  const invalidFiles =
    [];


  for (
    const rawFile of generated.files
  ) {

    const file =
      normalizeFile(
        rawFile
      );


    if (!file) {

      if (
        rawFile &&
        typeof rawFile === "object"
      ) {

        invalidFiles.push(
          safeString(
            rawFile.path,
            MAX_PATH_LENGTH
          ) ||
          "unknown"
        );

      }

      continue;

    }


    const key =
      file.path.toLowerCase();


    if (
      !expected.has(key)
    ) {

      unexpectedFiles.push(
        file.path
      );

      continue;

    }


    if (
      received.has(key)
    ) {

      return {

        valid:
          false,

        repairable:
          true,

        code:
          "DUPLICATE_REQUESTED_FILE",

        error:
          `Duplicate requested file generated: ${file.path}`,

        files:
          Array.from(
            received.values()
          ),

        validFiles:
          Array.from(
            received.values()
          ),

        missingFiles: [],

        unexpectedFiles,

        invalidFiles

      };

    }


    received.set(
      key,
      file
    );

  }


  const missingFiles = [];


  for (
    const expectedFile of expectedFiles
  ) {

    const key =
      expectedFile.path.toLowerCase();


    if (
      !received.has(key)
    ) {

      missingFiles.push(
        expectedFile
      );

    }

  }


  /*
   * -------------------------------------------------------
   * package.json contract
   *
   * It is checked only AFTER requested-path filtering.
   * -------------------------------------------------------
   */

  const packageFile =
    received.get(
      PACKAGE_JSON_PATH
    );


  let packageValidation =
    null;


  if (
    packageFile
  ) {

    packageValidation =
      validatePackageJsonFile(
        packageFile,
        framework
      );


    if (
      !packageValidation.valid
    ) {

      return {

        valid:
          false,

        repairable:
          true,

        code:
          packageValidation.code,

        error:
          packageValidation.error,

        files:
          Array.from(
            received.values()
          ),

        validFiles:
          Array.from(
            received.values()
          ),

        missingFiles,

        unexpectedFiles,

        invalidFiles,

        packageValidation

      };

    }

  }


  /*
   * -------------------------------------------------------
   * Invalid files are never silently accepted.
   * -------------------------------------------------------
   */

  if (
    invalidFiles.length > 0
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "INVALID_GENERATED_FILES",

      error:
        `One or more generated files are invalid: ${invalidFiles.join(", ")}`,

      files:
        Array.from(
          received.values()
        ),

      validFiles:
        Array.from(
          received.values()
        ),

      missingFiles,

      unexpectedFiles,

      invalidFiles,

      packageValidation

    };

  }


  /*
   * -------------------------------------------------------
   * Missing requested files.
   * -------------------------------------------------------
   */

  if (
    missingFiles.length > 0
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "MISSING_REQUESTED_FILES",

      error:
        `Missing generated file(s): ${missingFiles
          .map(
            file =>
              file.path
          )
          .join(", ")}`,

      files:
        Array.from(
          received.values()
        ),

      validFiles:
        Array.from(
          received.values()
        ),

      missingFiles,

      unexpectedFiles,

      invalidFiles,

      packageValidation

    };

  }


  return {

    valid:
      true,

    repairable:
      false,

    code:
      "BATCH_VALID",

    error:
      null,

    files:
      Array.from(
        received.values()
      ),

    validFiles:
      Array.from(
        received.values()
      ),

    missingFiles: [],

    unexpectedFiles,

    invalidFiles,

    packageValidation

  };

}


/* =========================================================
   BATCHING
========================================================= */

function createBatches(
  files
) {

  const batches = [];


  for (
    let index = 0;
    index < files.length;
    index += FILES_PER_BATCH
  ) {

    batches.push(
      files.slice(
        index,
        index +
          FILES_PER_BATCH
      )
    );

  }


  return batches;

}


/* =========================================================
   GENERATED FILE INDEX
========================================================= */

function createGeneratedFileIndex(
  files
) {

  return files.map(
    file => ({

      path:
        file.path,

      size:
        file.content.length

    })
  );

}


/* =========================================================
   MANIFEST CONTEXT
========================================================= */

function createManifestContext(
  manifestFiles
) {

  return safeJson(
    manifestFiles.map(
      file => ({

        path:
          file.path,

        purpose:
          file.purpose

      })
    ),
    MAX_MANIFEST_CONTEXT_SIZE
  );

}


/* =========================================================
   BATCH USER MESSAGE
========================================================= */

function createBatchUserMessage({
  request,
  projectName,
  manifestFramework,
  manifestFiles,
  batch,
  generatedFiles,
  repairContext = null
}) {

  const generatedIndex =
    createGeneratedFileIndex(
      generatedFiles
    );


  const batchDescription =
    batch.map(
      file => ({

        path:
          file.path,

        purpose:
          file.purpose

      })
    );


  const manifestContext =
    createManifestContext(
      manifestFiles
    );


  let repairSection =
    "";


  if (
    repairContext
  ) {

    const packageValidation =
      repairContext.packageValidation ||
      {};


    repairSection = `

=========================================================
REPAIR MODE
=========================================================

The previous generation attempt failed the Builder
contract.

PREVIOUS VALIDATION CODE:

${safeString(
  repairContext.code || "",
  500
)}

PREVIOUS VALIDATION ERROR:

${safeString(
  repairContext.error || "",
  4000
)}

MISSING REQUESTED FILES:

${safeJson(
  repairContext.missingFiles || [],
  8000
)}

INVALID FILES:

${safeJson(
  repairContext.invalidFiles || [],
  5000
)}

UNEXPECTED FILES:

${safeJson(
  repairContext.unexpectedFiles || [],
  5000
)}

PACKAGE VALIDATION:

${safeJson(
  packageValidation,
  12000
)}

CURRENT REQUESTED BATCH:

${safeJson(
  batchDescription,
  10000
)}

IMPORTANT:

If package.json is in the current batch and the previous
failure concerns scripts.build, repair package.json.

The authoritative executor runs:

    npm run build

Therefore scripts.build MUST terminate after performing
a finite compilation/bundling/build/package operation.

NEVER use as scripts.build:

- node server.js
- node ./server.js
- node index.js
- node ./index.js
- npm start
- npm run start
- npm run dev
- yarn start
- pnpm start
- bun start
- next dev
- next start
- vite
- vite dev
- vite preview
- nodemon
- ts-node-dev
- webpack-dev-server
- any watcher
- any long-running server

For Vite:

    "build": "vite build"

For Next.js:

    "build": "next build"

For Vue/Vite:

    "build": "vite build"

For Svelte/Vite:

    "build": "vite build"

For TypeScript:

    "build": "tsc"

or the configured finite compiler/build command.

Keep:

    build
    dev
    start
    preview

as separate concerns.

Do NOT create unnecessary files.

Do NOT change architecture.

Generate ONLY the requested current batch.
`;

  }


  return `
=========================================================
ZYRIONOS BUILDER
=========================================================

USER REQUEST:

${request.prompt}

PROJECT NAME:

${projectName}

FRAMEWORK:

${manifestFramework}

PLANNING RESULT:

${request.planString}

PROJECT FILE MANIFEST:

${manifestContext}

CURRENT FILE BATCH:

${safeJson(
  batchDescription,
  10000
)}

ALREADY GENERATED FILE INDEX:

${safeJson(
  generatedIndex,
  MAX_GENERATED_INDEX_SIZE
)}

=========================================================
CURRENT BATCH CONTRACT
=========================================================

The CURRENT FILE BATCH is the ONLY generation target.

Generate EVERY file listed in CURRENT FILE BATCH.

Each requested path must appear exactly once.

Do NOT generate files from another batch.

Do NOT invent additional architecture.

Do NOT return files merely because you believe they
might be useful.

Complete source code is required.

Return ONLY valid JSON.

=========================================================
PACKAGE.JSON BUILD CONTRACT
=========================================================

If package.json is included:

1. scripts.build MUST exist when the project requires
   an authoritative build.

2. scripts.build MUST be finite.

3. scripts.build MUST compile, bundle, package or otherwise
   produce the project's build output.

4. scripts.build MUST terminate.

5. scripts.build MUST NOT start a server.

6. scripts.build MUST NOT run a development server.

7. scripts.build MUST NOT run a watcher.

8. scripts.build MUST NOT be a preview command.

9. NEVER use:

   node server.js
   node ./server.js
   node index.js
   npm start
   npm run start
   npm run dev
   next dev
   next start
   vite
   vite dev
   vite preview
   nodemon
   ts-node-dev
   webpack-dev-server

   as scripts.build.

10. Vite applications should normally use:

    "build": "vite build"

11. Next.js applications should normally use:

    "build": "next build"

12. Vue/Vite applications should normally use:

    "build": "vite build"

13. Svelte/Vite applications should normally use:

    "build": "vite build"

14. TypeScript applications should use an appropriate
    finite compiler/build command.

15. Runtime commands belong under start.

16. Development commands belong under dev.

17. Preview commands belong under preview.

18. Do NOT add a server merely to satisfy the build
    contract.

19. Do NOT add unnecessary dependencies.

${repairSection}
`;

}


/* =========================================================
   MANIFEST SYSTEM PROMPT
========================================================= */

function createManifestSystemPrompt() {

  return `
You are the ZyrionOS Project Architect.

Convert the user's software request and planning result
into a precise, minimal project file manifest.

You are NOT generating source code yet.

Return ONLY valid JSON.

FORMAT:

{
  "projectName": "string",
  "framework": "string",
  "files": [
    {
      "path": "string",
      "purpose": "string"
    }
  ]
}

STRICT RULES:

1. JSON only.
2. No Markdown.
3. No code fences.
4. No explanations.
5. Every file must have a unique path.
6. Paths must be relative project paths.
7. Never use ../.
8. Never use absolute paths.
9. Never use Windows drive paths.
10. Include all files required by the planned application.
11. Include package.json when the selected framework/build
    architecture requires it.
12. Include required configuration files.
13. Include real application entry points.
14. Include required components/pages/services/utilities.
15. Do not create duplicate files.
16. Do not create binary files.
17. Never create secrets.
18. Never create credentials.
19. Do not invent external services.
20. Keep the project inside the user's requested scope.
21. Prefer the smallest complete architecture.
22. Do not inflate a simple project into enterprise
    architecture.
23. Maximum files: ${MAX_FILES}.

BUILD CONTRACT:

24. If package.json is required, it MUST support a finite
    authoritative build.

25. scripts.build MUST compile, bundle, package or generate
    build output.

26. scripts.build MUST terminate.

27. scripts.build MUST NEVER start a server.

28. scripts.build MUST NEVER be a development command.

29. scripts.build MUST NEVER be a watcher.

30. scripts.build MUST NEVER be a preview server.

31. NEVER use:

    node server.js
    node index.js
    npm start
    npm run dev
    next dev
    vite
    nodemon
    ts-node-dev

    as the authoritative build command.

32. Vite normally uses:

    vite build

33. Next.js normally uses:

    next build

34. Vue/Vite normally uses:

    vite build

35. Svelte/Vite normally uses:

    vite build

36. TypeScript normally uses:

    tsc

37. Runtime commands belong under start.

38. Development commands belong under dev.

39. Preview commands belong under preview.

40. Do not create a runtime server solely to satisfy
    the build contract.
`;

}


/* =========================================================
   BATCH GENERATION SYSTEM PROMPT
========================================================= */

function createFileBatchSystemPrompt() {

  return `
You are the ZyrionOS Code Builder.

The architecture has already been planned.

Generate ONLY the requested file batch.

Return ONLY valid JSON.

FORMAT:

{
  "files": [
    {
      "path": "string",
      "content": "complete file content"
    }
  ]
}

STRICT RULES:

1. JSON only.
2. No Markdown.
3. No code fences.
4. No explanations.
5. Generate EVERY requested file.
6. Every requested path exactly once.
7. Paths must exactly match requested paths.
8. Complete usable code.
9. No TODO placeholders.
10. No "rest of code".
11. No truncation.
12. No fake imports.
13. Respect framework.
14. Respect dependencies.
15. Keep files internally consistent.
16. Never generate secrets.
17. Use environment variables for secrets.
18. Do not invent backend endpoints.
19. Do not rewrite unrelated files.
20. Do not generate another batch.
21. Do not return an empty files array.
22. Extra files are discarded.
23. Maximum requested files: ${FILES_PER_BATCH}.

PACKAGE.JSON:

If package.json is included:

24. scripts.build MUST exist when authoritative build is
    required.

25. scripts.build MUST be finite.

26. scripts.build MUST compile/build/package.

27. scripts.build MUST terminate.

28. scripts.build MUST NOT start a server.

29. scripts.build MUST NOT be dev/watch/preview.

30. NEVER use:

    node server.js
    node index.js
    npm start
    npm run dev
    next dev
    next start
    vite
    vite dev
    vite preview
    nodemon
    ts-node-dev
    webpack-dev-server

    as scripts.build.

31. Vite -> vite build.

32. Next.js -> next build.

33. Vue/Vite -> vite build.

34. Svelte/Vite -> vite build.

35. TypeScript -> tsc or the configured finite compiler.

36. Keep start/dev/preview separate from build.

37. Do not add unnecessary dependencies.
`;

}


/* =========================================================
   REPAIR SYSTEM PROMPT
========================================================= */

function createBatchRepairSystemPrompt() {

  return `
You are the ZyrionOS Builder Repair Agent.

A previous generation attempt failed the Builder contract.

Repair ONLY the current requested file batch.

Return ONLY valid JSON.

FORMAT:

{
  "files": [
    {
      "path": "string",
      "content": "complete file content"
    }
  ]
}

STRICT RULES:

1. JSON only.
2. No Markdown.
3. No explanations.
4. Generate every requested file.
5. Every requested path exactly matches.
6. Never return unrelated files.
7. Never return duplicate paths.
8. Complete source code only.
9. Never use placeholders.
10. Never truncate.
11. Preserve architecture.
12. Preserve framework.
13. Preserve dependencies unless correction is required.
14. Fix the reported validation failure directly.
15. Never generate secrets.
16. Never invent unrelated files.
17. Current batch is authoritative.

PACKAGE.JSON:

18. If package.json failed because of scripts.build,
    replace scripts.build with a finite build command.

19. NEVER use node server.js as scripts.build.

20. NEVER use node index.js as scripts.build.

21. NEVER use npm start as scripts.build.

22. NEVER use npm run dev as scripts.build.

23. NEVER use next dev as scripts.build.

24. NEVER use vite as a dev server as scripts.build.

25. NEVER use nodemon as scripts.build.

26. NEVER use ts-node-dev as scripts.build.

27. NEVER use any watcher as scripts.build.

28. Vite -> vite build.

29. Next.js -> next build.

30. Vue/Vite -> vite build.

31. Svelte/Vite -> vite build.

32. TypeScript -> tsc or the configured finite compiler.

33. Keep start/dev/preview separate.

34. Do not introduce unnecessary dependencies.

35. Do not remove required dependencies merely to bypass
    validation.
`;

}


/* =========================================================
   AI BATCH REQUEST
========================================================= */

async function requestBatchGeneration({
  request,
  projectName,
  manifestFramework,
  manifestFiles,
  batch,
  generatedFiles,
  repairContext = null
}) {

  return generateJSON({

    messages: [

      {

        role:
          "system",

        content:
          repairContext
            ? createBatchRepairSystemPrompt()
            : createFileBatchSystemPrompt()

      },

      {

        role:
          "user",

        content:
          createBatchUserMessage({

            request,

            projectName,

            manifestFramework,

            manifestFiles,

            batch,

            generatedFiles,

            repairContext

          })

      }

    ],

    temperature:
      repairContext
        ? 0.1
        : 0.2,

    maxTokens:
      FILE_BATCH_MAX_TOKENS

  });

}


/* =========================================================
   FAILURE METADATA
========================================================= */

function createFailureMetadata({
  projectName,
  framework,
  manifestFiles,
  generatedFiles,
  failedBatch,
  totalBatches,
  attempts,
  startedAt
}) {

  return {

    builderVersion:
      BUILDER_AGENT_VERSION,

    projectName,

    framework,

    totalManifestFiles:
      manifestFiles,

    generatedFiles,

    failedBatch,

    totalBatches,

    attempts,

    durationMs:
      Date.now() -
      startedAt

  };

}


/* =========================================================
   FINAL PACKAGE CONTRACT
========================================================= */

function validateFinalPackageContract(
  files,
  framework,
  plan
) {

  const packageFile =
    files.find(
      file =>
        file.path.toLowerCase() ===
        PACKAGE_JSON_PATH
    );


  if (
    !packageFile
  ) {

    const packageRequired =
      manifestRequiresPackageJson(
        files,
        framework,
        plan
      );


    if (
      packageRequired
    ) {

      return {

        valid:
          false,

        skipped:
          false,

        repairable:
          false,

        code:
          "FINAL_PACKAGE_JSON_MISSING",

        error:
          "Final project is missing package.json although the selected framework/build architecture requires it."

      };

    }


    return {

      valid:
        true,

      skipped:
        true,

      reason:
        "package.json not required by the final project."

    };

  }


  const validation =
    validatePackageJsonFile(
      packageFile,
      framework
    );


  return {

    ...validation,

    skipped:
      false

  };

}


/* =========================================================
   FINAL DUPLICATE CHECK
========================================================= */

function hasDuplicatePaths(
  files
) {

  const seen =
    new Set();


  for (
    const file of files
  ) {

    const key =
      file.path.toLowerCase();


    if (
      seen.has(key)
    ) {

      return {

        duplicate:
          true,

        path:
          file.path

      };

    }


    seen.add(key);

  }


  return {

    duplicate:
      false,

    path:
      null

  };

}


/* =========================================================
   BUILDER AGENT
========================================================= */

async function builderAgent(
  input = {}
) {

  const startedAt =
    Date.now();


  let currentStage =
    "normalization";


  try {

    logInfo(
      `Builder Agent Started | version=${BUILDER_AGENT_VERSION}`
    );


    /* =====================================================
       NORMALIZATION
    ===================================================== */

    const request =
      normalizeBuildRequest(
        input
      );


    if (!request.prompt) {

      return {

        success:
          false,

        error:
          "Builder Agent requires a user prompt.",

        stage:
          currentStage

      };

    }


    if (!request.plan) {

      return {

        success:
          false,

        error:
          "Builder Agent requires a planning result.",

        stage:
          currentStage

      };

    }


    if (
      request.planString.length >
      MAX_PLAN_SIZE
    ) {

      return {

        success:
          false,

        error:
          "Planning data is too large.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       MANIFEST GENERATION
    ===================================================== */

    currentStage =
      "project-manifest";


    logInfo(
      "Builder generating project manifest"
    );


    let manifestResult;


    try {

      manifestResult =
        await generateJSON({

          messages: [

            {

              role:
                "system",

              content:
                createManifestSystemPrompt()

            },

            {

              role:
                "user",

              content: `
USER REQUEST:

${request.prompt}

FRAMEWORK:

${request.framework}

PLANNING RESULT:

${request.planString}

PROJECT ID:

${request.projectId || "not specified"}

Create the smallest complete project manifest
that satisfies the request.

Do not generate source code yet.

If package.json is required, include it.

The package.json must eventually contain a finite
authoritative build strategy.
`

            }

          ],

          temperature:
            0.1,

          maxTokens:
            MANIFEST_MAX_TOKENS

        });

    } catch (error) {

      return {

        success:
          false,

        error:
          error?.message ||
          "Project manifest generation failed.",

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    if (
      !manifestResult ||
      manifestResult.success !== true
    ) {

      return {

        success:
          false,

        error:
          manifestResult?.error ||
          "Project manifest generation failed.",

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       MANIFEST VALIDATION
    ===================================================== */

    const manifestValidation =
      validateManifest(
        manifestResult.data
      );


    if (
      !manifestValidation.valid
    ) {

      return {

        success:
          false,

        error:
          manifestValidation.error,

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    const projectName =
      manifestValidation
        .data
        .projectName;


    const manifestFramework =
      manifestValidation
        .data
        .framework ||
      request.framework;


    const manifestFiles =
      manifestValidation
        .data
        .files;


    /* =====================================================
       MANIFEST CONTRACT
    ===================================================== */

    const manifestContract =
      validateManifestContract({

        manifest:
          manifestValidation.data,

        framework:
          manifestFramework,

        plan:
          request.plan

      });


    if (
      !manifestContract.valid
    ) {

      logError(
        `Builder manifest contract failed: ${manifestContract.error}`
      );


      return {

        success:
          false,

        error:
          manifestContract.error,

        stage:
          "project-manifest-contract",

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          projectName,

          framework:
            manifestFramework,

          validationCode:
            manifestContract.code,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    logSuccess(
      `Builder manifest created: ${manifestFiles.length} files`
    );


    /* =====================================================
       FILE BATCH GENERATION
    ===================================================== */

    currentStage =
      "file-generation";


    const batches =
      createBatches(
        manifestFiles
      );


    const generatedFiles =
      [];


    const generatedPaths =
      new Set();


    logInfo(
      `Builder will generate ${batches.length} file batches`
    );


    /* =====================================================
       BATCH LOOP
    ===================================================== */

    for (
      let batchIndex = 0;
      batchIndex < batches.length;
      batchIndex++
    ) {

      const batch =
        batches[batchIndex];


      const batchNumber =
        batchIndex + 1;


      currentStage =
        `file-generation-batch-${batchNumber}`;


      logInfo(
        `Builder generating batch ${batchNumber}/${batches.length} (${batch.length} files)`
      );


      let batchCompleted =
        false;


      let lastValidation =
        null;


      /* ===================================================
         ATTEMPT LOOP
      =================================================== */

      for (
        let attempt = 1;
        attempt <= MAX_BATCH_ATTEMPTS;
        attempt++
      ) {

        const isRepairAttempt =
          attempt > 1;


        if (
          isRepairAttempt
        ) {

          logWarning(
            `Builder repairing batch ${batchNumber}/${batches.length} | attempt=${attempt}`
          );

        }


        const repairContext =
          isRepairAttempt
            ? lastValidation
            : null;


        let batchResult;


        try {

          batchResult =
            await requestBatchGeneration({

              request,

              projectName,

              manifestFramework,

              manifestFiles,

              batch,

              generatedFiles,

              repairContext

            });

        } catch (error) {

          batchResult = {

            success:
              false,

            error:
              error?.message ||
              "Batch AI request failed."

          };

        }


        /* =================================================
           AI REQUEST FAILURE
        ================================================= */

        if (
          !batchResult ||
          batchResult.success !== true
        ) {

          logWarning(
            `Builder batch ${batchNumber}/${batches.length} AI request failed | attempt=${attempt} | error=${
              batchResult?.error ||
              "unknown"
            }`
          );


          lastValidation = {

            valid:
              false,

            repairable:
              true,

            code:
              "AI_BATCH_GENERATION_FAILED",

            error:
              batchResult?.error ||
              "AI batch generation failed.",

            files: [],

            validFiles: [],

            missingFiles:
              batch,

            unexpectedFiles: [],

            invalidFiles: [],

            packageValidation:
              null

          };


          if (
            attempt <
            MAX_BATCH_ATTEMPTS
          ) {

            continue;

          }


          return {

            success:
              false,

            error:
              batchResult?.error ||
              `File generation batch ${batchNumber} failed.`,

            stage:
              currentStage,

            metadata:
              createFailureMetadata({

                projectName,

                framework:
                  manifestFramework,

                manifestFiles:
                  manifestFiles.length,

                generatedFiles:
                  generatedFiles.length,

                failedBatch:
                  batchNumber,

                totalBatches:
                  batches.length,

                attempts:
                  attempt,

                startedAt

              })

          };

        }


        /* =================================================
           BATCH VALIDATION
        ================================================= */

        const batchValidation =
          validateGeneratedBatch(

            batchResult.data,

            batch,

            manifestFramework

          );


        lastValidation = {

          ...batchValidation,

          validFiles:
            batchValidation.files ||
            []

        };


        /* =================================================
           VALID BATCH
        ================================================= */

        if (
          batchValidation.valid
        ) {

          if (
            Array.isArray(
              batchValidation.unexpectedFiles
            ) &&
            batchValidation
              .unexpectedFiles
              .length > 0
          ) {

            logWarning(
              `Builder batch ${batchNumber}: discarded unexpected files: ${batchValidation.unexpectedFiles.join(", ")}`
            );

          }


          if (
            Array.isArray(
              batchValidation.invalidFiles
            ) &&
            batchValidation
              .invalidFiles
              .length > 0
          ) {

            logWarning(
              `Builder batch ${batchNumber}: discarded invalid files: ${batchValidation.invalidFiles.join(", ")}`
            );

          }


          for (
            const file of
              batchValidation.files
          ) {

            const key =
              file.path.toLowerCase();


            if (
              generatedPaths.has(key)
            ) {

              logError(
                `Builder duplicate project file detected: ${file.path}`
              );


              return {

                success:
                  false,

                error:
                  `Duplicate project file detected: ${file.path}`,

                stage:
                  currentStage,

                metadata:
                  createFailureMetadata({

                    projectName,

                    framework:
                      manifestFramework,

                    manifestFiles:
                      manifestFiles.length,

                    generatedFiles:
                      generatedFiles.length,

                    failedBatch:
                      batchNumber,

                    totalBatches:
                      batches.length,

                    attempts:
                      attempt,

                    startedAt

                  })

              };

            }


            generatedPaths.add(
              key
            );


            generatedFiles.push(
              file
            );

          }


          logSuccess(
            `Builder batch ${batchNumber}/${batches.length} completed: ${batchValidation.files.length} requested files accepted`
          );


          batchCompleted =
            true;


          break;

        }


        /* =================================================
           CONTRACT FAILURE
        ================================================= */

        logWarning(
          `Builder batch ${batchNumber}: validation requires repair | code=${
            batchValidation.code ||
            "VALIDATION_FAILED"
          } | ${
            batchValidation.error
          }`
        );


        /*
         * Important:
         *
         * Invalid package.json is NOT added to the final
         * project.
         *
         * The next repair attempt receives the exact
         * contract failure.
         */

        if (
          batchValidation.repairable &&
          attempt <
            MAX_BATCH_ATTEMPTS
        ) {

          continue;

        }


        return {

          success:
            false,

          error:
            batchValidation.error,

          stage:
            currentStage,

          metadata: {

            ...createFailureMetadata({

              projectName,

              framework:
                manifestFramework,

              manifestFiles:
                manifestFiles.length,

              generatedFiles:
                generatedFiles.length,

              failedBatch:
                batchNumber,

              totalBatches:
                batches.length,

              attempts:
                attempt,

              startedAt

            }),

            validationCode:
              batchValidation.code ||
              null,

            repairContext: {

              missingFiles:
                batchValidation.missingFiles ||
                [],

              invalidFiles:
                batchValidation.invalidFiles ||
                [],

              unexpectedFiles:
                batchValidation.unexpectedFiles ||
                [],

              packageValidation:
                batchValidation.packageValidation ||
                null,

              error:
                batchValidation.error ||
                null

            }

          }

        };

      }


      if (
        !batchCompleted
      ) {

        return {

          success:
            false,

          error:
            `Builder could not complete batch ${batchNumber}.`,

          stage:
            currentStage,

          metadata:
            createFailureMetadata({

              projectName,

              framework:
                manifestFramework,

              manifestFiles:
                manifestFiles.length,

              generatedFiles:
                generatedFiles.length,

              failedBatch:
                batchNumber,

              totalBatches:
                batches.length,

              attempts:
                MAX_BATCH_ATTEMPTS,

              startedAt

            })

        };

      }

    }


    /* =====================================================
       FINAL PROJECT VALIDATION
    ===================================================== */

    currentStage =
      "final-project-validation";


    if (
      generatedFiles.length !==
      manifestFiles.length
    ) {

      return {

        success:
          false,

        error:
          `Builder generated ${generatedFiles.length} files but manifest required ${manifestFiles.length}.`,

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          projectName,

          framework:
            manifestFramework,

          manifestFiles:
            manifestFiles.length,

          generatedFiles:
            generatedFiles.length,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       FINAL NORMALIZATION
    ===================================================== */

    const finalFiles =
      normalizeFiles(
        generatedFiles
      );


    if (
      finalFiles.length !==
      manifestFiles.length
    ) {

      return {

        success:
          false,

        error:
          "Final project validation rejected one or more generated files.",

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          projectName,

          framework:
            manifestFramework,

          manifestFiles:
            manifestFiles.length,

          generatedFiles:
            finalFiles.length,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       DUPLICATE CHECK
    ===================================================== */

    const duplicateCheck =
      hasDuplicatePaths(
        finalFiles
      );


    if (
      duplicateCheck.duplicate
    ) {

      return {

        success:
          false,

        error:
          `Final project contains duplicate path: ${duplicateCheck.path}`,

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          projectName,

          framework:
            manifestFramework,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       FINAL MANIFEST COVERAGE
    ===================================================== */

    const finalPathSet =
      new Set(
        finalFiles.map(
          file =>
            file.path.toLowerCase()
        )
      );


    for (
      const manifestFile of manifestFiles
    ) {

      const key =
        manifestFile.path.toLowerCase();


      if (
        !finalPathSet.has(key)
      ) {

        return {

          success:
            false,

          error:
            `Final project is missing: ${manifestFile.path}`,

          stage:
            currentStage,

          metadata: {

            builderVersion:
              BUILDER_AGENT_VERSION,

            projectName,

            framework:
              manifestFramework,

            durationMs:
              Date.now() -
              startedAt

          }

        };

      }

    }


    /* =====================================================
       FINAL EXACT PATH CHECK
    ===================================================== */

    const manifestPathSet =
      new Set(
        manifestFiles.map(
          file =>
            file.path.toLowerCase()
        )
      );


    for (
      const finalFile of finalFiles
    ) {

      const key =
        finalFile.path.toLowerCase();


      if (
        !manifestPathSet.has(key)
      ) {

        return {

          success:
            false,

          error:
            `Final project contains a file outside the manifest: ${finalFile.path}`,

          stage:
            currentStage,

          metadata: {

            builderVersion:
              BUILDER_AGENT_VERSION,

            projectName,

            framework:
              manifestFramework,

            durationMs:
              Date.now() -
              startedAt

          }

        };

      }

    }


    /* =====================================================
       FINAL PACKAGE BUILD CONTRACT
    ===================================================== */

    currentStage =
      "final-build-contract-validation";


    const finalPackageValidation =
      validateFinalPackageContract(
        finalFiles,
        manifestFramework,
        request.plan
      );


    if (
      !finalPackageValidation.valid
    ) {

      logError(
        `Builder final package contract failed: ${
          finalPackageValidation.error
        }`
      );


      return {

        success:
          false,

        error:
          finalPackageValidation.error ||
          "Final package build contract validation failed.",

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          projectName,

          framework:
            manifestFramework,

          validationCode:
            finalPackageValidation.code ||
            null,

          packageValidation:
            finalPackageValidation,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       FINAL SUCCESS
    ===================================================== */

    const durationMs =
      Date.now() -
      startedAt;


    logSuccess(
      `Builder Agent Completed: ${finalFiles.length} files generated in ${durationMs}ms`
    );


    return {

      success:
        true,

      data: {

        projectName,

        framework:
          manifestFramework,

        files:
          finalFiles,

        manifest: {

          projectName,

          framework:
            manifestFramework,

          files:
            manifestFiles

        }

      },

      metadata: {

        builderVersion:
          BUILDER_AGENT_VERSION,

        architecture:
          "chunked-builder",

        manifestFiles:
          manifestFiles.length,

        generatedFiles:
          finalFiles.length,

        batches:
          batches.length,

        filesPerBatch:
          FILES_PER_BATCH,

        maxBatchAttempts:
          MAX_BATCH_ATTEMPTS,

        extraFilesPolicy:
          "discard-unrequested",

        packageBuildContract:
          "enforced",

        authoritativeBuild:
          false,

        buildExecution:
          "delegated-to-authoritative-build-service",

        finalManifestCoverage:
          true,

        durationMs

      }

    };

  } catch (error) {

    logError(
      `Builder Agent Failed at ${currentStage}: ${
        error?.message ||
        "Unknown error"
      }`
    );


    return {

      success:
        false,

      error:
        error?.message ||
        "Builder Agent failed.",

      stage:
        currentStage,

      metadata: {

        builderVersion:
          BUILDER_AGENT_VERSION,

        durationMs:
          Date.now() -
          startedAt

      }

    };

  }

}


/* =========================================================
   METADATA
========================================================= */

builderAgent.version =
  BUILDER_AGENT_VERSION;

builderAgent.agentName =
  "builderAgent";

builderAgent.authoritativeBuild =
  false;

builderAgent.buildContract =
  "finite-package-json-build-required";

builderAgent.providerArchitecture =
  "centralized-ai-provider-service";


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  builderAgent;
