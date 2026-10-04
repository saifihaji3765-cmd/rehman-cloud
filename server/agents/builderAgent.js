/* =========================================================
   ZyrionOS BUILDER AGENT
   Production Chunked Code Generation Engine
   Version: 4.0.0

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

   - Builder NEVER calls an AI provider directly.
   - All AI calls go through aiProviderService.
   - No Gemini dependency.
   - Extra AI-generated files are NEVER allowed into
     the final project unless they exist in the manifest.
   - Missing requested files trigger repair.
   - Duplicate requested files are rejected.
   - Invalid paths/content are rejected.
   - package.json build scripts are contract-validated.
   - Long-running server/dev commands are NOT accepted
     as authoritative build commands.
   - Builder does NOT perform the authoritative build.
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
  "4.0.0";


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
   PACKAGE / BUILD CONTRACT
========================================================= */

const PACKAGE_JSON_PATH =
  "package.json";


/*
 * Commands that are fundamentally runtime/dev-server
 * commands and therefore must never be accepted as the
 * package.json "build" script.
 *
 * These are checked by executable tokens rather than
 * exact full-string equality so variants such as:
 *
 *   node ./server.js
 *   node server.js
 *   npm start
 *   next dev
 *   vite --host
 *
 * are rejected.
 */
const FORBIDDEN_BUILD_COMMAND_PATTERNS = [

  /\bnode(?:js)?\s+(?:\.\/)?(?:server|index|app|main)\.(?:js|cjs|mjs|ts)\b/i,

  /\bnode(?:js)?\s+.*\bserver\b/i,

  /\bnpm\s+(?:start|run\s+start)\b/i,

  /\byarn\s+start\b/i,

  /\bpnpm\s+start\b/i,

  /\bbun\s+start\b/i,

  /\bnpm\s+(?:run\s+dev|dev)\b/i,

  /\byarn\s+(?:dev|start)\b/i,

  /\bpnpm\s+(?:dev|start)\b/i,

  /\bbun\s+(?:dev|start)\b/i,

  /\bnext\s+dev\b/i,

  /\bvite(?:\s+.*)?\s+--host\b/i,

  /\bvite(?:\s+.*)?\s+--port\b/i,

  /\bnodemon\b/i,

  /\bts-node-dev\b/i,

  /\btsx\s+.*\bserver\b/i,

  /\bts-node\s+.*\bserver\b/i,

  /\bwebpack-dev-server\b/i,

  /\bserve\s+-s\b/i

];


/*
 * Framework/runtime build expectations.
 *
 * These are intentionally conservative.
 *
 * We do NOT force one exact command for every project,
 * because some projects legitimately use custom build
 * tooling.
 */
const BUILD_COMMAND_RULES = [

  {
    name:
      "next",

    matches:
      [
        /next/i
      ],

    allowed:
      [
        /\bnext\s+build\b/i
      ]

  },

  {
    name:
      "vite",

    matches:
      [
        /vite/i,
        /react/i,
        /vue/i,
        /svelte/i
      ],

    allowed:
      [
        /\bvite\s+build\b/i
      ]

  },

  {
    name:
      "react",

    matches:
      [
        /react/i
      ],

    allowed:
      [
        /\bvite\s+build\b/i,
        /\breact-scripts\s+build\b/i,
        /\bwebpack\b.*\bbuild\b/i,
        /\btsc\b/i,
        /\btsc\s+--build\b/i
      ]

  },

  {
    name:
      "vue",

    matches:
      [
        /vue/i
      ],

    allowed:
      [
        /\bvite\s+build\b/i,
        /\bvue-cli-service\s+build\b/i
      ]

  },

  {
    name:
      "svelte",

    matches:
      [
        /svelte/i
      ],

    allowed:
      [
        /\bvite\s+build\b/i,
        /\bsvelte-kit\s+build\b/i
      ]

  },

  {
    name:
      "typescript",

    matches:
      [
        /typescript/i,
        /\bnode\b.*typescript/i
      ],

    allowed:
      [
        /\btsc\b/i,
        /\btsc\s+--build\b/i,
        /\besbuild\b/i,
        /\btsup\b/i,
        /\bswc\b/i
      ]

  }

];


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
   SAFE JSON STRINGIFY
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
    )
      .map(
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


  filePath =
    filePath.replace(
      /^\/+/,
      ""
    );


  if (
    filePath.includes("\0")
  ) {

    return null;

  }


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


  if (
    filePath.includes(":") ||
    filePath.startsWith("~")
  ) {

    return null;

  }


  filePath =
    filePath.replace(
      /\/+/g,
      "/"
    );


  return filePath || null;

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
   NORMALIZE FILE
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
   NORMALIZE FILES
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
      normalizedFile.path
        .toLowerCase();


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
   BUILD REQUEST NORMALIZATION
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
   BUILD CONTEXT
========================================================= */

function createBuildContext(
  request
) {

  return {

    userPrompt:
      request.prompt,

    framework:
      request.framework,

    projectId:
      request.projectId ||
      "not specified",

    plan:
      request.plan

  };

}


/* =========================================================
   MANIFEST SYSTEM PROMPT
========================================================= */

function createManifestSystemPrompt() {

  return `
You are the ZyrionOS Project Architect.

Convert the user's software request and planning result
into a precise, minimal, runnable project file manifest.

You are NOT generating source code yet.

Return ONLY valid JSON.

Required format:

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
7. Never use ../ or absolute paths.
8. Never use Windows drive paths.
9. Include all files required for the application to run.
10. Include package.json when the project uses npm/pnpm/yarn/bun
    or has dependencies/build requirements.
11. Include required configuration files.
12. Include real application entry points.
13. Include required components, pages, services and utilities.
14. Do not create unnecessary duplicate files.
15. Do not create binary files.
16. Never create secrets or credentials.
17. Do not invent unnecessary external services.
18. Keep the project within the user's requested scope.
19. Prefer the smallest complete architecture that satisfies
    the request.
20. Do not inflate a simple application into an enterprise
    architecture without a requirement for it.
21. Maximum files: ${MAX_FILES}.
22. If package.json is included, it MUST contain a finite
    authoritative build strategy appropriate to the framework.
23. A build command must compile/package the application.
24. A build command MUST NOT start a development server,
    production server, watcher, or long-running process.
25. NEVER use "node server.js", "npm start", "next dev",
    "vite", "nodemon", or equivalent runtime commands
    as the build command.
`;

}


/* =========================================================
   FILE BATCH SYSTEM PROMPT
========================================================= */

function createFileBatchSystemPrompt() {

  return `
You are the ZyrionOS Code Builder.

The project architecture has already been planned.

You are generating ONLY a small batch of requested files.

Return ONLY valid JSON.

Required format:

{
  "files": [
    {
      "path": "string",
      "content": "complete file content"
    }
  ]
}

STRICT RULES:

1. Return valid JSON only.
2. No Markdown.
3. No code fences.
4. No explanations.
5. Generate EVERY requested file.
6. Each requested path must appear exactly once.
7. Paths must exactly match the requested paths.
8. Each file must contain complete usable code.
9. Never use TODO placeholders.
10. Never use "rest of code".
11. Never omit code.
12. Never truncate code.
13. Never generate fake imports.
14. Respect the selected framework.
15. Respect dependency requirements.
16. Keep files internally consistent.
17. Never generate secrets.
18. Use environment variables for secrets.
19. Do not invent backend endpoints.
20. Do not rewrite files outside the current batch.
21. Do not return files from another batch.
22. Never return an empty files array.
23. The CURRENT FILE BATCH is authoritative.
24. Return complete content for every requested file.
25. Extra files are unnecessary and will be discarded.
26. Maximum requested files in this response: ${FILES_PER_BATCH}.

PACKAGE.JSON BUILD CONTRACT:

If package.json is in the current batch:

27. The "scripts.build" field MUST exist when this project
    requires an authoritative build.
28. "scripts.build" MUST be a finite build/compile/package
    command.
29. "scripts.build" MUST NOT start a server.
30. "scripts.build" MUST NOT be a dev/watch command.
31. NEVER use:
      node server.js
      node index.js
      npm start
      npm run dev
      next dev
      vite
      nodemon
      ts-node-dev
    as the build script.
32. For Vite applications use "vite build".
33. For Next.js applications use "next build".
34. For Vue/Vite applications use "vite build".
35. For TypeScript applications use an appropriate compiler
    such as "tsc" when the project is configured for it.
36. Keep "start", "dev", and "preview" separate from "build".
37. Do not invent a server just to satisfy the build contract.
38. Do not add unnecessary dependencies merely to create
    a build command.
`;

}


/* =========================================================
   BATCH REPAIR SYSTEM PROMPT
========================================================= */

function createBatchRepairSystemPrompt() {

  return `
You are the ZyrionOS Builder Repair Agent.

A previous generation attempt for the current file batch
failed validation.

Repair ONLY the current requested batch.

Return ONLY valid JSON.

Required format:

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
4. Generate every missing requested file.
5. Every requested path must exactly match.
6. Never return files outside the current batch.
7. Never return duplicate paths.
8. Return complete source code.
9. Never use placeholders.
10. Never truncate code.
11. Preserve project architecture.
12. Preserve framework requirements.
13. Preserve dependency requirements.
14. Fix the validation failure directly.
15. Never generate secrets.
16. Do not invent unrelated files.
17. The requested batch is authoritative.
18. Return only files required to complete this batch.

PACKAGE.JSON REPAIR RULES:

19. If package.json is invalid because of its build script,
    replace the build script with a real finite build command.
20. NEVER use node server.js as the build command.
21. NEVER use npm start as the build command.
22. NEVER use a development/watch/server command as the build
    command.
23. For Vite applications use "vite build".
24. For Next.js applications use "next build".
25. For Vue/Vite applications use "vite build".
26. For TypeScript applications use "tsc" or the appropriate
    configured compiler.
27. Keep runtime commands under "start" or "dev".
28. Do not introduce unnecessary dependencies.
29. Do not remove required dependencies merely to make
    validation pass.
`;

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
   RUNTIME COMMAND DETECTION
========================================================= */

function isLongRunningRuntimeCommand(
  command
) {

  const normalized =
    safeString(
      command,
      2000
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
   BUILD COMMAND RULE MATCH
========================================================= */

function getBuildRule(
  framework,
  packageJson
) {

  const classification =
    classifyFramework(
      framework,
      packageJson
    );


  const matchingRules =
    BUILD_COMMAND_RULES.filter(
      rule =>
        rule.matches.some(
          pattern =>
            pattern.test(
              framework || ""
            ) ||
            rule.matches.some(
              pattern =>
                pattern.test(
                  classification
                )
            )
        )
    );


  /*
   * Prefer the classified framework.
   */
  const exact =
    BUILD_COMMAND_RULES.find(
      rule =>
        rule.name ===
        classification
    );


  return exact ||
    matchingRules[0] ||
    null;

}


/* =========================================================
   BUILD CONTRACT VALIDATION
========================================================= */

function validatePackageBuildContract({
  packageJson,
  framework
}) {

  if (
    !packageJson ||
    typeof packageJson !== "object"
  ) {

    return {

      valid:
        false,

      code:
        "PACKAGE_JSON_INVALID",

      error:
        "package.json is not a valid object."

    };

  }


  const scripts =
    packageJson.scripts;


  if (
    !scripts ||
    typeof scripts !== "object"
  ) {

    return {

      valid:
        false,

      code:
        "PACKAGE_SCRIPTS_MISSING",

      error:
        "package.json is missing a scripts object."

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

      code:
        "BUILD_SCRIPT_MISSING",

      error:
        "package.json is missing scripts.build."

    };

  }


  /*
   * Primary production safety rule.
   */
  if (
    isLongRunningRuntimeCommand(
      buildCommand
    )
  ) {

    return {

      valid:
        false,

      code:
        "INVALID_BUILD_RUNTIME_COMMAND",

      error:
        `scripts.build contains a runtime/dev-server command and cannot be used as an authoritative build: ${buildCommand}`,

      buildCommand

    };

  }


  /*
   * Watch-mode detection.
   */
  if (
    /\b--watch\b/i.test(
      buildCommand
    ) ||
    /\bwatch\b/i.test(
      buildCommand
    ) &&
    !/\bwatchman\b/i.test(
      buildCommand
    )
  ) {

    return {

      valid:
        false,

      code:
        "BUILD_WATCH_MODE_FORBIDDEN",

      error:
        `scripts.build must be finite and cannot run in watch mode: ${buildCommand}`,

      buildCommand

    };

  }


  const rule =
    getBuildRule(
      framework,
      packageJson
    );


  /*
   * If we know the framework, make sure the build
   * command resembles an actual build operation.
   */
  if (rule) {

    const allowed =
      rule.allowed.some(
        pattern =>
          pattern.test(
            buildCommand
          )
      );


    if (!allowed) {

      /*
       * A custom build command can still be legitimate.
       *
       * Accept commands that clearly invoke a compiler/
       * bundler/build tool rather than a runtime server.
       */
      const looksLikeCompiler =
        /\b(build|compile|tsc|esbuild|tsup|swc|webpack|rollup|parcel)\b/i
          .test(
            buildCommand
          );


      if (!looksLikeCompiler) {

        return {

          valid:
            false,

          code:
            "FRAMEWORK_BUILD_COMMAND_MISMATCH",

          error:
            `Build command does not match the detected ${rule.name} build contract: ${buildCommand}`,

          buildCommand,

          expected:
            rule.name

        };

      }

    }

  }


  /*
   * Runtime commands are allowed to exist under start/dev.
   * They simply cannot be the build command.
   */
  return {

    valid:
      true,

    code:
      "BUILD_CONTRACT_VALID",

    buildCommand,

    framework:
      classifyFramework(
        framework,
        packageJson
      )

  };

}


/* =========================================================
   PACKAGE FILE CONTRACT
========================================================= */

function validatePackageJsonFile(
  file,
  framework
) {

  const parsed =
    parsePackageJson(
      file?.content
    );


  if (!parsed.valid) {

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
        buildContract.expected ||
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
   BATCH VALIDATION
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

        missingFiles:
          [],

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
   * Package contract is checked AFTER requested-path
   * filtering, so unrelated package.json files cannot
   * influence the result.
   */
  const packageFile =
    received.get(
      PACKAGE_JSON_PATH
    );


  let packageValidation =
    null;


  if (packageFile) {

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

        error:
          packageValidation.error,

        code:
          packageValidation.code,

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


  if (
    missingFiles.length === 0
  ) {

    return {

      valid:
        true,

      repairable:
        false,

      files:
        Array.from(
          received.values()
        ),

      validFiles:
        Array.from(
          received.values()
        ),

      unexpectedFiles,

      missingFiles: [],

      invalidFiles,

      packageValidation

    };

  }


  return {

    valid:
      false,

    repairable:
      true,

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

    unexpectedFiles,

    missingFiles,

    invalidFiles,

    packageValidation

  };

}


/* =========================================================
   FILE BATCHING
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
   COMPACT MANIFEST CONTEXT
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
   BUILD BATCH REQUEST
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


  if (repairContext) {

    const validFiles =
      Array.isArray(
        repairContext.validFiles
      )
        ? repairContext.validFiles
        : Array.isArray(
            repairContext.files
          )
          ? repairContext.files
          : [];


    repairSection = `

REPAIR MODE

The previous attempt failed the Builder contract.

VALID FILES ALREADY RECEIVED:

${safeJson(
  validFiles.map(
    file => ({
      path:
        file.path,

      size:
        typeof file.content === "string"
          ? file.content.length
          : undefined
    })
  ),
  12000
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

UNEXPECTED FILES THAT MUST BE IGNORED:

${safeJson(
  repairContext.unexpectedFiles || [],
  8000
)}

PACKAGE / BUILD CONTRACT:

${safeJson(
  repairContext.packageValidation || {},
  10000
)}

PREVIOUS VALIDATION ERROR:

${safeString(
  repairContext.error || "",
  3000
)}

CURRENT REQUESTED BATCH:

${safeJson(
  batchDescription,
  10000
)}

If package.json is listed in the current batch,
repair its build contract directly.

The build script must be a finite compile/build/package
operation.

NEVER use:

- node server.js
- node index.js
- npm start
- npm run dev
- next dev
- vite as a dev server
- nodemon
- ts-node-dev
- any watcher
- any long-running server

as scripts.build.

Generate ONLY the current requested files.
`;

  }


  return `
USER REQUEST:

${request.prompt}

PROJECT NAME:

${projectName}

FRAMEWORK:

${manifestFramework}

PLANNING CONTEXT:

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

IMPORTANT BATCH CONTRACT:

The CURRENT FILE BATCH is the ONLY authoritative
generation target.

Generate every file listed under CURRENT FILE BATCH.

Each requested path must appear exactly once.

Do NOT generate files from another batch.

If you accidentally think another file is required,
do NOT return it unless it is listed in CURRENT FILE BATCH.

Return complete source code.

Return ONLY JSON.

If package.json is in this batch:

- scripts.build must exist when an authoritative build
  is required.
- scripts.build must be finite.
- scripts.build must compile/package the application.
- scripts.build must NEVER start a server.
- scripts.build must NEVER be a dev/watch command.
- keep start/dev/preview separate from build.

${repairSection}
`;

}


/* =========================================================
   REQUEST ONE BATCH
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
   CREATE FAILURE METADATA
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
  framework
) {

  const packageFile =
    files.find(
      file =>
        file.path.toLowerCase() ===
        PACKAGE_JSON_PATH
    );


  /*
   * If there is no package.json, do not invent one.
   *
   * Static validation remains responsible for deciding
   * whether the project requires it.
   */
  if (!packageFile) {

    return {

      valid:
        true,

      skipped:
        true,

      reason:
        "package.json not present in manifest."

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

    logger.info(
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
       BUILD CONTEXT
    ===================================================== */

    const buildContext =
      createBuildContext(
        request
      );


    void buildContext;


    /* =====================================================
       MANIFEST GENERATION
    ===================================================== */

    currentStage =
      "project-manifest";


    logger.info(
      "Builder generating project manifest"
    );


    const manifestResult =
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

If package.json is required, the project must have
a finite authoritative build strategy.
`
          }

        ],

        temperature:
          0.1,

        maxTokens:
          MANIFEST_MAX_TOKENS

      });


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


    logger.success(
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


    logger.info(
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


      logger.info(
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


        if (isRepairAttempt) {

          logger.warning(
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

          logger.warning(
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

            error:
              batchResult?.error ||
              "AI batch generation failed.",

            code:
              "AI_BATCH_GENERATION_FAILED",

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


          logger.error(
            `Builder batch ${batchNumber}/${batches.length} failed after ${attempt} attempts`
          );


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
            batchValidation.files || []

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

            logger.warning(
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

            logger.warning(
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

              logger.error(
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


          logger.success(
            `Builder batch ${batchNumber}/${batches.length} completed: ${batchValidation.files.length} requested files accepted`
          );


          batchCompleted =
            true;


          break;

        }


        /* =================================================
           CONTRACT FAILURE
        ================================================= */

        logger.warning(
          `Builder batch ${batchNumber}: validation requires repair | code=${
            batchValidation.code ||
            "VALIDATION_FAILED"
          } | ${
            batchValidation.error
          }`
        );


        /*
         * IMPORTANT:
         *
         * We intentionally DO NOT add invalid package.json
         * or incomplete files to generatedFiles.
         *
         * The repair attempt receives the validation context
         * and regenerates the requested batch.
         */
        if (
          batchValidation.repairable &&
          attempt < MAX_BATCH_ATTEMPTS
        ) {

          continue;

        }


        /* =================================================
           FINAL BATCH FAILURE
        ================================================= */

        logger.error(
          `Builder batch validation failed: ${
            batchValidation.error
          }`
        );


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
                null

            }

          }

        };

      }


      if (!batchCompleted) {

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
        manifestFramework
      );


    if (
      !finalPackageValidation.valid
    ) {

      logger.error(
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


    logger.success(
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

        finalManifestCoverage:
          true,

        durationMs

      }

    };

  } catch (error) {

    logger.error(
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
  "package-json-build-script-enforced";

builderAgent.providerArchitecture =
  "centralized-ai-provider-service";


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  builderAgent;
