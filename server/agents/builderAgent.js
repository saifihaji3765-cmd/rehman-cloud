/* =========================================================
   ZyrionOS BUILDER AGENT
   Production Chunked Code Generation Engine
   Version: 5.2.0

   ARCHITECTURE

   Planning Agent
        ↓
   Builder Agent
        ↓
   AI Project Manifest
        ↓
   Manifest Contract
        ↓
   Dependency-aware File Batches
        ↓
   AI File Generation
        ↓
   Exact Manifest Path Validation
        ↓
   Controlled Repair
        ↓
   Final Manifest Coverage Validation
        ↓
   Complete Project
        ↓
   Engineering System

   IMPORTANT

   - No framework-specific file whitelist.
   - No project-specific hard-coded file paths.
   - No hard-coded application architecture.
   - No semantic keyword taxonomy.
   - AI-generated manifest is the project structure authority.
   - Builder validates contracts and invariants only.
   - Builder never executes generated code.
   - Builder never runs npm install.
   - Builder never runs npm build.
   - Builder never starts a server.
   - Builder never calls an AI provider directly.
   - All AI calls use aiProviderService.
   - Gemini is not used.
   - Extra files are never silently accepted.
   - Missing manifest files trigger controlled repair.
   - Duplicate paths are rejected.
   - Invalid paths/content are rejected.
   - Final project must exactly match the normalized manifest.
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

const BUILDER_AGENT_VERSION =
  "5.2.0";


/* =========================================================
   SAFETY / RESOURCE LIMITS
========================================================= */

/*
 * These are safety/resource invariants.
 *
 * They do NOT define:
 * - application architecture
 * - framework file structure
 * - component names
 * - routes
 * - pages
 * - services
 * - project-specific paths
 */

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

const MAX_PURPOSE_LENGTH =
  1000;


/* =========================================================
   PACKAGE
========================================================= */

const PACKAGE_JSON_PATH =
  "package.json";


/* =========================================================
   LOGGER
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
  value,
  maxLength = 100000
) {

  try {

    return JSON.stringify(
      value ?? null
    ).slice(
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


  return (
    name
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
    "zyrionos-project"
  );

}


/* =========================================================
   FRAMEWORK
========================================================= */

function normalizeFramework(
  value
) {

  return (
    safeString(
      value,
      200
    ) ||
    "unspecified"
  );

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


  /*
   * Reject drive paths and URI-like paths.
   */

  if (
    /^[a-zA-Z]:/.test(
      filePath
    )
  ) {

    return null;

  }


  if (
    filePath.startsWith("~")
  ) {

    return null;

  }


  /*
   * Absolute filesystem paths
   * are never accepted.
   */

  if (
    filePath.startsWith("/")
  ) {

    return null;

  }


  /*
   * Normalize ./ prefix.
   */

  filePath =
    filePath.replace(
      /^\.\//,
      ""
    );


  /*
   * Reject traversal.
   */

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


  /*
   * Remove duplicate separators.
   */

  filePath =
    filePath.replace(
      /\/+/g,
      "/"
    );


  if (
    !filePath ||
    filePath === "."
  ) {

    return null;

  }


  /*
   * Prevent control characters.
   */

  if (
    /[\u0000-\u001F\u007F]/.test(
      filePath
    )
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


  const normalized =
    [];

  const seen =
    new Set();


  for (
    const rawFile of files
  ) {

    if (
      normalized.length >=
      MAX_FILES
    ) {

      break;

    }


    const file =
      normalizeFile(
        rawFile
      );


    if (!file) {

      continue;

    }


    const key =
      file.path.toLowerCase();


    if (
      seen.has(key)
    ) {

      continue;

    }


    seen.add(
      key
    );


    normalized.push(
      file
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


  return {

    prompt,

    plan,

    planString:
      safeJson(
        plan,
        MAX_PLAN_SIZE
      ),

    framework:
      normalizeFramework(
        request.framework
      ),

    projectId:
      safeString(
        request.projectId,
        200
      ),

    userId:
      safeString(
        request.userId,
        200
      )

  };

}


/* =========================================================
   PACKAGE JSON
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

    const data =
      JSON.parse(
        content
      );


    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
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

      data

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
   PACKAGE MANIFEST REQUIREMENT
========================================================= */

/*
 * No framework names are used here.
 *
 * package.json is required only when:
 *
 * 1. the manifest explicitly requests it, OR
 * 2. the planning/build contract explicitly indicates that
 *    package metadata/build tooling is part of the project.
 *
 * This prevents Builder from inventing project structure.
 */

function manifestRequiresPackageJson(
  manifestFiles,
  plan
) {

  const files =
    Array.isArray(
      manifestFiles
    )
      ? manifestFiles
      : [];


  const explicitlyRequested =
    files.some(
      file =>
        file &&
        typeof file.path === "string" &&
        file.path.toLowerCase() ===
          PACKAGE_JSON_PATH
    );


  if (
    explicitlyRequested
  ) {

    return true;

  }


  const planText =
    safeJson(
      plan,
      30000
    );


  /*
   * This is not used to create files.
   *
   * It only prevents an explicitly package-based plan
   * from accidentally passing without package metadata.
   */

  return /\bpackage\.json\b/i.test(
    planText
  );

}


/* =========================================================
   BUILD COMMAND SAFETY
========================================================= */

/*
 * The Builder does not decide which framework/build tool
 * should be used.
 *
 * It only rejects commands that are structurally unsafe as
 * an authoritative finite build.
 *
 * This is a safety contract, not project architecture.
 */

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


const FORBIDDEN_BUILD_COMMAND_PATTERNS = [

  /\bnpm\s+(?:start|run\s+start)\b/i,

  /\byarn\s+start\b/i,

  /\bpnpm\s+start\b/i,

  /\bbun\s+start\b/i,

  /\bnpm\s+(?:run\s+dev|dev)\b/i,

  /\byarn\s+dev\b/i,

  /\bpnpm\s+dev\b/i,

  /\bbun\s+dev\b/i,

  /\b--watch\b/i,

  /\bwatch\s+--/i,

  /\bnodemon\b/i,

  /\bts-node-dev\b/i,

  /\bwebpack-dev-server\b/i,

  /\bvite\s+preview\b/i,

  /\bnext\s+start\b/i

];


function isForbiddenBuildCommand(
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
   BUILD SCRIPT VALIDATION
========================================================= */

function validateBuildScript(
  packageJson
) {

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


  const build =
    normalizeCommand(
      scripts.build
    );


  if (!build) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "BUILD_SCRIPT_MISSING",

      error:
        "package.json is missing scripts.build."

    };

  }


  if (
    isForbiddenBuildCommand(
      build
    )
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "BUILD_SCRIPT_NOT_AUTHORITATIVE",

      error:
        `scripts.build is not a valid authoritative finite build command: ${build}`,

      buildCommand:
        build

    };

  }


  /*
   * The Builder deliberately does NOT maintain a list of
   * acceptable framework commands.
   *
   * The authoritative Engineering System will determine
   * whether the generated project can actually build.
   */

  return {

    valid:
      true,

    repairable:
      false,

    code:
      "BUILD_SCRIPT_STRUCTURALLY_VALID",

    error:
      null,

    buildCommand:
      build

  };

}


/* =========================================================
   PACKAGE FILE VALIDATION
========================================================= */

function validatePackageJsonFile(
  file
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

      invalidFiles: [
        PACKAGE_JSON_PATH
      ]

    };

  }


  const buildValidation =
    validateBuildScript(
      parsed.data
    );


  if (
    !buildValidation.valid
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        buildValidation.code,

      error:
        buildValidation.error,

      file:
        PACKAGE_JSON_PATH,

      buildCommand:
        buildValidation.buildCommand ||
        null,

      packageJson:
        parsed.data,

      invalidFiles: [
        PACKAGE_JSON_PATH
      ]

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
      buildValidation.buildCommand,

    packageJson:
      parsed.data,

    invalidFiles: []

  };

}


/* =========================================================
   MANIFEST PATH NORMALIZATION
========================================================= */

function normalizeManifestFileEntry(
  item
) {

  if (
    !item ||
    typeof item !== "object"
  ) {

    return null;

  }


  const path =
    normalizeFilePath(
      item.path
    );


  if (!path) {

    return null;

  }


  const purpose =
    safeString(
      item.purpose,
      MAX_PURPOSE_LENGTH
    );


  return {

    path,

    purpose:
      purpose ||
      "Required project file"

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
    typeof manifest !== "object" ||
    Array.isArray(manifest)
  ) {

    return {

      valid:
        false,

      error:
        "Manifest is not a valid object."

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


  const files =
    [];

  const seen =
    new Set();


  for (
    const item of manifest.files
  ) {

    const normalized =
      normalizeManifestFileEntry(
        item
      );


    if (!normalized) {

      return {

        valid:
          false,

        error:
          "Manifest contains an invalid file path or file entry."

      };

    }


    const key =
      normalized.path.toLowerCase();


    if (
      seen.has(key)
    ) {

      return {

        valid:
          false,

        error:
          `Duplicate manifest path: ${normalized.path}`

      };

    }


    seen.add(
      key
    );


    files.push(
      normalized
    );

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
   MANIFEST CONTRACT
========================================================= */

function validateManifestContract({
  manifest,
  plan
}) {

  if (
    !manifest ||
    !Array.isArray(
      manifest.files
    ) ||
    manifest.files.length === 0
  ) {

    return {

      valid:
        false,

      code:
        "MANIFEST_EMPTY",

      error:
        "Manifest must contain at least one requested file."

    };

  }


  /*
   * The Builder does not inject framework files.
   *
   * It only verifies that package metadata is present when
   * the manifest/planning contract explicitly requires it.
   */

  const packageRequired =
    manifestRequiresPackageJson(
      manifest.files,
      plan
    );


  const hasPackage =
    manifest.files.some(
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
        "The planning/build contract requires package.json, but the manifest does not contain it."

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
   MANIFEST CONSISTENCY
========================================================= */

/*
 * This is the important fix.
 *
 * We never create a second hidden file list.
 *
 * The exact normalized manifest becomes the single source
 * of truth for all subsequent batches.
 */

function createManifestAuthority(
  manifest
) {

  const files =
    manifest.files.map(
      file => ({
        path:
          file.path,

        purpose:
          file.purpose
      })
    );


  const pathSet =
    new Set(
      files.map(
        file =>
          file.path.toLowerCase()
      )
    );


  return {

    projectName:
      manifest.projectName,

    framework:
      manifest.framework,

    files,

    pathSet,

    fileCount:
      files.length

  };

}


/* =========================================================
   MANIFEST CONTEXT
========================================================= */

function createManifestContext(
  manifestAuthority
) {

  return safeJson(
    manifestAuthority.files,
    MAX_MANIFEST_CONTEXT_SIZE
  );

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
   BATCH CREATION
========================================================= */

function createBatches(
  files
) {

  const batches =
    [];


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
   BATCH USER MESSAGE
========================================================= */

function createBatchUserMessage({
  request,
  projectName,
  manifestAuthority,
  batch,
  generatedFiles,
  repairContext
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


  let repairSection =
    "";


  if (
    repairContext
  ) {

    repairSection = `

=========================================================
REPAIR MODE
=========================================================

The previous generation attempt failed validation.

VALIDATION CODE:

${safeString(
  repairContext.code || "",
  500
)}

VALIDATION ERROR:

${safeString(
  repairContext.error || "",
  5000
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
  repairContext.packageValidation || {},
  10000
)}

IMPORTANT:

Repair ONLY the current requested batch.

Do not invent another file path.

Do not rename a requested file.

Do not remove a requested file.

Return every requested file exactly once.

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

${manifestAuthority.framework}

PLANNING RESULT:

${request.planString}

=========================================================
MANIFEST AUTHORITY
=========================================================

The following manifest is the ONLY project structure
authority for this Builder run.

MANIFEST:

${createManifestContext(
  manifestAuthority
)}

=========================================================
CURRENT BATCH
=========================================================

Generate EVERY file in this batch:

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
STRICT OUTPUT CONTRACT
=========================================================

Return ONLY valid JSON.

FORMAT:

{
  "files": [
    {
      "path": "exact requested path",
      "content": "complete file content"
    }
  ]
}

RULES:

1. Generate every requested file.
2. Generate each requested path exactly once.
3. Paths must exactly match the manifest.
4. Do not generate files from another batch.
5. Do not invent files.
6. Do not rename files.
7. Do not omit files.
8. Do not return Markdown.
9. Do not return code fences.
10. Do not return explanations.
11. Do not return placeholders.
12. Do not return truncated code.
13. Keep generated files internally consistent.
14. Never generate secrets.
15. Never invent credentials.
16. Never invent external services.
17. Respect the planning result.
18. Preserve the requested architecture.
19. Do not modify files outside this batch.

PACKAGE.JSON:

If package.json is part of the requested batch:

- It must contain valid JSON.
- It must contain a valid scripts object.
- If an authoritative build is required by the plan, scripts.build
  must exist.
- scripts.build must represent a finite build operation.
- scripts.build must not be a runtime server.
- scripts.build must not be a development server.
- scripts.build must not be a watcher.
- scripts.build must not be a preview server.

The actual authoritative build is performed later by the
Engineering System.

${repairSection}
`;

}


/* =========================================================
   MANIFEST SYSTEM PROMPT
========================================================= */

function createManifestSystemPrompt() {

  return `
You are the ZyrionOS Project Manifest Architect.

Your job is to convert the user's software request and the
planning result into the exact project file manifest that the
Builder will use as its sole file-structure authority.

You are NOT generating source code.

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

=========================================================
MANIFEST RULES
=========================================================

1. JSON only.
2. No Markdown.
3. No code fences.
4. No explanations.
5. Every file path must be unique.
6. Every path must be relative.
7. Never use ../.
8. Never use absolute filesystem paths.
9. Never use drive-letter paths.
10. Never create binary files.
11. Never create secrets.
12. Never create credentials.
13. Never invent external services.
14. Include every file required for the requested application.
15. Include required source entry points.
16. Include required configuration.
17. Include required dependency metadata when the chosen
    build architecture needs it.
18. Include files required to produce a real production build.
19. Do not add unnecessary files.
20. Do not inflate a simple project.
21. Do not omit required files merely to reduce file count.
22. Stay inside the user's requested scope.
23. Maximum files: ${MAX_FILES}.

=========================================================
IMPORTANT ARCHITECTURE RULE
=========================================================

There is NO hard-coded framework file list.

Do not assume a particular file path merely because a framework
usually uses it.

Derive the complete project structure from:

- the user's requirements
- the planning result
- the selected framework/toolchain
- dependency requirements
- build requirements
- runtime architecture

The manifest you return becomes authoritative.

The Builder will NOT silently add framework files later.

Therefore the manifest must already be complete.

=========================================================
PACKAGE / BUILD RULE
=========================================================

If the project requires package metadata for its build system,
include the package metadata file.

If an authoritative build is required, the manifest must include
whatever configuration and source files are required to make that
build possible.

Do not invent a server merely to satisfy the build requirement.

=========================================================
OUTPUT
=========================================================

Return only the JSON object.
`;

}


/* =========================================================
   BATCH SYSTEM PROMPT
========================================================= */

function createFileBatchSystemPrompt() {

  return `
You are the ZyrionOS Code Builder.

The project manifest has already been created.

The manifest is authoritative.

Generate ONLY the current requested file batch.

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

=========================================================
RULES
=========================================================

1. JSON only.
2. No Markdown.
3. No code fences.
4. Generate every requested file.
5. Every requested path exactly once.
6. Path spelling must exactly match.
7. Path casing must exactly match.
8. Do not rename requested files.
9. Do not omit requested files.
10. Do not generate unrelated files.
11. Do not generate another batch.
12. Do not create placeholders.
13. Do not truncate code.
14. Do not use fake imports.
15. Keep imports and exports internally consistent.
16. Respect the planning result.
17. Respect the project manifest.
18. Never generate secrets.
19. Never generate credentials.
20. Never invent external APIs.
21. Never return an empty files array.
22. Maximum files in this response: ${FILES_PER_BATCH}.

=========================================================
PACKAGE.JSON
=========================================================

If package.json is requested:

- Return valid JSON.
- Include required dependencies.
- Include required scripts.
- If the project requires an authoritative build, include
  scripts.build.
- scripts.build must be finite.
- Do not use runtime servers as the build command.
- Do not use development servers as the build command.
- Do not use watchers as the build command.
- Do not use preview servers as the build command.

The Engineering System performs the authoritative build later.
`;
}


/* =========================================================
   REPAIR SYSTEM PROMPT
========================================================= */

function createBatchRepairSystemPrompt() {

  return `
You are the ZyrionOS Builder Repair Agent.

A previous file-generation attempt failed the Builder contract.

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

=========================================================
REPAIR RULES
=========================================================

1. JSON only.
2. No Markdown.
3. No explanations.
4. Generate every requested file.
5. Every requested path exactly once.
6. Preserve exact requested paths.
7. Never return unrelated files.
8. Never rename files.
9. Never omit files.
10. Never return duplicate paths.
11. Never return placeholders.
12. Never truncate.
13. Preserve architecture.
14. Preserve framework/toolchain.
15. Preserve required dependencies unless the failure requires
    correction.
16. Fix the reported validation failure directly.
17. Never generate secrets.
18. Never invent unrelated services.
19. The current batch is authoritative.
20. The manifest is authoritative.

=========================================================
PACKAGE.JSON REPAIR
=========================================================

If package.json failed validation:

- preserve valid metadata
- preserve required dependencies
- repair invalid JSON
- repair invalid scripts
- provide a finite build command when required
- do not convert build into start/dev/watch/preview
- do not add a server solely to satisfy build validation

=========================================================
OUTPUT
=========================================================

Return only valid JSON.
`;
}


/* =========================================================
   AI BATCH REQUEST
========================================================= */

async function requestBatchGeneration({
  request,
  projectName,
  manifestAuthority,
  batch,
  generatedFiles,
  repairContext
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

            manifestAuthority,

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
   BATCH VALIDATION
========================================================= */

function validateGeneratedBatch(
  generated,
  expectedFiles
) {

  if (
    !generated ||
    typeof generated !== "object" ||
    Array.isArray(generated)
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      code:
        "GENERATED_BATCH_INVALID",

      error:
        "Generated batch is not a valid object.",

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


  /*
   * Requested paths are the only accepted paths.
   */

  const expected =
    new Map();


  for (
    const expectedFile of expectedFiles
  ) {

    const path =
      normalizeFilePath(
        expectedFile.path
      );


    if (!path) {

      continue;

    }


    expected.set(
      path.toLowerCase(),
      path
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

      invalidFiles.push(

        safeString(
          rawFile?.path,
          MAX_PATH_LENGTH
        ) ||
        "unknown"

      );

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

        missingFiles:
          expectedFiles.filter(
            item =>
              !received.has(
                item.path.toLowerCase()
              )
          ),

        unexpectedFiles,

        invalidFiles

      };

    }


    received.set(
      key,
      file
    );

  }


  /*
   * Missing files are calculated independently from
   * unexpected files.
   *
   * This prevents the old silent-success class of bug.
   */

  const missingFiles =
    [];


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
   * package.json is validated only when it is actually
   * requested by the manifest.
   */

  let packageValidation =
    null;


  const packageFile =
    received.get(
      PACKAGE_JSON_PATH
    );


  if (
    packageFile
  ) {

    packageValidation =
      validatePackageJsonFile(
        packageFile
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
   * Invalid response entries are never silently converted
   * into success.
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
   * IMPORTANT:
   *
   * Unexpected files alone do not become project files.
   *
   * If required files are missing, the batch is invalid.
   *
   * If all required files are present but extras were returned,
   * extras are discarded and explicitly logged.
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
        `Missing requested file(s): ${missingFiles
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
   FINAL PACKAGE CONTRACT
========================================================= */

function validateFinalPackageContract(
  files,
  plan
) {

  const packageFile =
    files.find(
      file =>
        file.path.toLowerCase() ===
        PACKAGE_JSON_PATH
    );


  const packageRequired =
    manifestRequiresPackageJson(
      files,
      plan
    );


  if (
    !packageFile
  ) {

    if (
      packageRequired
    ) {

      return {

        valid:
          false,

        repairable:
          false,

        code:
          "FINAL_PACKAGE_JSON_MISSING",

        error:
          "Final project is missing package.json although the planning/build contract requires it."

      };

    }


    return {

      valid:
        true,

      skipped:
        true,

      reason:
        "package.json is not required by the manifest contract."

    };

  }


  return {

    ...validatePackageJsonFile(
      packageFile
    ),

    skipped:
      false

  };

}


/* =========================================================
   EXACT MANIFEST COVERAGE
========================================================= */

function validateExactManifestCoverage(
  manifestFiles,
  generatedFiles
) {

  const manifestSet =
    new Set(
      manifestFiles.map(
        file =>
          file.path.toLowerCase()
      )
    );


  const generatedSet =
    new Set(
      generatedFiles.map(
        file =>
          file.path.toLowerCase()
      )
    );


  const missing =
    [];


  const unexpected =
    [];


  for (
    const file of manifestFiles
  ) {

    const key =
      file.path.toLowerCase();


    if (
      !generatedSet.has(key)
    ) {

      missing.push(
        file.path
      );

    }

  }


  for (
    const file of generatedFiles
  ) {

    const key =
      file.path.toLowerCase();


    if (
      !manifestSet.has(key)
    ) {

      unexpected.push(
        file.path
      );

    }

  }


  return {

    valid:
      missing.length === 0 &&
      unexpected.length === 0 &&
      manifestFiles.length ===
        generatedFiles.length,

    missing,

    unexpected

  };

}


/* =========================================================
   DUPLICATE CHECK
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


    seen.add(
      key
    );

  }


  return {

    duplicate:
      false,

    path:
      null

  };

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


    if (
      !request.prompt
    ) {

      return {

        success:
          false,

        error:
          "Builder Agent requires a user prompt.",

        stage:
          currentStage

      };

    }


    if (
      !request.plan
    ) {

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

FRAMEWORK CONTEXT:

${request.framework}

PLANNING RESULT:

${request.planString}

PROJECT ID:

${request.projectId || "not specified"}

Generate the complete minimal file manifest.

The manifest will become the ONLY file-structure authority
for the rest of this Builder run.

Do not generate source code.

Return only JSON.
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


    /* =====================================================
       MANIFEST CONTRACT
    ===================================================== */

    const manifestContract =
      validateManifestContract({

        manifest:
          manifestValidation.data,

        plan:
          request.plan

      });


    if (
      !manifestContract.valid
    ) {

      logError(
        `Builder manifest contract failed: ${
          manifestContract.error
        }`
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

          validationCode:
            manifestContract.code,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       MANIFEST AUTHORITY
    ===================================================== */

    const manifestAuthority =
      createManifestAuthority(
        manifestValidation.data
      );


    logSuccess(
      `Builder manifest created: ${
        manifestAuthority.fileCount
      } files`
    );


    /*
     * Log the exact authoritative paths.
     *
     * This is extremely important for debugging future
     * manifest/generation mismatches.
     */

    logInfo(
      `Builder manifest authority: ${
        manifestAuthority.files
          .map(
            file =>
              file.path
          )
          .join(", ")
      }`
    );


    /* =====================================================
       BATCH GENERATION
    ===================================================== */

    currentStage =
      "file-generation";


    const batches =
      createBatches(
        manifestAuthority.files
      );


    const generatedFiles =
      [];


    const generatedPaths =
      new Set();


    logInfo(
      `Builder will generate ${
        batches.length
      } file batches`
    );


    /* =====================================================
       BATCH LOOP
    ===================================================== */

    for (
      let batchIndex = 0;
      batchIndex <
        batches.length;
      batchIndex++
    ) {

      const batch =
        batches[batchIndex];


      const batchNumber =
        batchIndex + 1;


      currentStage =
        `file-generation-batch-${batchNumber}`;


      logInfo(
        `Builder generating batch ${
          batchNumber
        }/${batches.length} (${
          batch.length
        } files)`
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
        attempt <=
          MAX_BATCH_ATTEMPTS;
        attempt++
      ) {

        const isRepairAttempt =
          attempt > 1;


        if (
          isRepairAttempt
        ) {

          logWarning(
            `Builder repairing batch ${
              batchNumber
            }/${batches.length} | attempt=${
              attempt
            }`
          );

        }


        let batchResult;


        try {

          batchResult =
            await requestBatchGeneration({

              request,

              projectName:
                manifestAuthority.projectName,

              manifestAuthority,

              batch,

              generatedFiles,

              repairContext:
                isRepairAttempt
                  ? lastValidation
                  : null

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
           AI FAILURE
        ================================================= */

        if (
          !batchResult ||
          batchResult.success !== true
        ) {

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


          logWarning(
            `Builder batch ${
              batchNumber
            }/${
              batches.length
            } AI request failed | attempt=${
              attempt
            } | error=${
              lastValidation.error
            }`
          );


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
              lastValidation.error,

            stage:
              currentStage,

            metadata:
              createFailureMetadata({

                projectName:
                  manifestAuthority.projectName,

                framework:
                  manifestAuthority.framework,

                manifestFiles:
                  manifestAuthority.fileCount,

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
           VALIDATE BATCH
        ================================================= */

        const batchValidation =
          validateGeneratedBatch(

            batchResult.data,

            batch

          );


        lastValidation =
          batchValidation;


        /* =================================================
           VALID BATCH
        ================================================= */

        if (
          batchValidation.valid
        ) {

          /*
           * Extra AI files are deliberately not committed.
           */

          if (
            batchValidation
              .unexpectedFiles
              .length > 0
          ) {

            logWarning(
              `Builder batch ${
                batchNumber
              }: discarded unexpected files: ${
                batchValidation
                  .unexpectedFiles
                  .join(", ")
              }`
            );

          }


          /*
           * Every accepted file must be in the manifest.
           */

          for (
            const file of
              batchValidation.files
          ) {

            const key =
              file.path.toLowerCase();


            if (
              !manifestAuthority
                .pathSet
                .has(key)
            ) {

              logError(
                `Builder invariant violation: accepted file is outside manifest: ${file.path}`
              );


              return {

                success:
                  false,

                error:
                  `Builder invariant violation: file outside manifest: ${file.path}`,

                stage:
                  currentStage,

                metadata:
                  createFailureMetadata({

                    projectName:
                      manifestAuthority
                        .projectName,

                    framework:
                      manifestAuthority
                        .framework,

                    manifestFiles:
                      manifestAuthority
                        .fileCount,

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


            if (
              generatedPaths.has(
                key
              )
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

                    projectName:
                      manifestAuthority
                        .projectName,

                    framework:
                      manifestAuthority
                        .framework,

                    manifestFiles:
                      manifestAuthority
                        .fileCount,

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
            `Builder batch ${
              batchNumber
            }/${
              batches.length
            } completed: ${
              batchValidation.files.length
            } requested files accepted`
          );


          batchCompleted =
            true;


          break;

        }


        /* =================================================
           REPAIR REQUIRED
        ================================================= */

        logWarning(
          `Builder batch ${
            batchNumber
          }: validation requires repair | code=${
            batchValidation.code
          } | ${
            batchValidation.error
          }`
        );


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

              projectName:
                manifestAuthority.projectName,

              framework:
                manifestAuthority.framework,

              manifestFiles:
                manifestAuthority.fileCount,

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
                batchValidation
                  .missingFiles ||
                [],

              invalidFiles:
                batchValidation
                  .invalidFiles ||
                [],

              unexpectedFiles:
                batchValidation
                  .unexpectedFiles ||
                [],

              packageValidation:
                batchValidation
                  .packageValidation ||
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
            `Builder could not complete batch ${
              batchNumber
            }.`,

          stage:
            currentStage,

          metadata:
            createFailureMetadata({

              projectName:
                manifestAuthority.projectName,

              framework:
                manifestAuthority.framework,

              manifestFiles:
                manifestAuthority.fileCount,

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


    const finalFiles =
      normalizeFiles(
        generatedFiles
      );


    /*
     * First exact coverage gate.
     */

    const coverage =
      validateExactManifestCoverage(

        manifestAuthority.files,

        finalFiles

      );


    if (
      !coverage.valid
    ) {

      return {

        success:
          false,

        error:
          `Final manifest coverage failed. Missing: ${
            coverage.missing.join(", ") ||
            "none"
          }. Unexpected: ${
            coverage.unexpected.join(", ") ||
            "none"
          }.`,

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          projectName:
            manifestAuthority.projectName,

          framework:
            manifestAuthority.framework,

          manifestFiles:
            manifestAuthority.fileCount,

          generatedFiles:
            finalFiles.length,

          missingFiles:
            coverage.missing,

          unexpectedFiles:
            coverage.unexpected,

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
          `Final project contains duplicate path: ${
            duplicateCheck.path
          }`,

        stage:
          currentStage,

        metadata: {

          builderVersion:
            BUILDER_AGENT_VERSION,

          projectName:
            manifestAuthority.projectName,

          framework:
            manifestAuthority.framework,

          durationMs:
            Date.now() -
            startedAt

        }

      };

    }


    /* =====================================================
       FINAL PACKAGE CONTRACT
    ===================================================== */

    currentStage =
      "final-build-contract-validation";


    const finalPackageValidation =
      validateFinalPackageContract(

        finalFiles,

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

          projectName:
            manifestAuthority.projectName,

          framework:
            manifestAuthority.framework,

          validationCode:
            finalPackageValidation
              .code ||
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
      `Builder Agent Completed: ${
        finalFiles.length
      } files generated in ${
        durationMs
      }ms`
    );


    return {

      success:
        true,

      data: {

        projectName:
          manifestAuthority
            .projectName,

        framework:
          manifestAuthority
            .framework,

        files:
          finalFiles,

        manifest: {

          projectName:
            manifestAuthority
              .projectName,

          framework:
            manifestAuthority
              .framework,

          files:
            manifestAuthority
              .files

        }

      },

      metadata: {

        builderVersion:
          BUILDER_AGENT_VERSION,

        architecture:
          "chunked-builder",

        manifestAuthority:
          "ai-generated-normalized-manifest",

        manifestFiles:
          manifestAuthority
            .fileCount,

        generatedFiles:
          finalFiles.length,

        batches:
          batches.length,

        filesPerBatch:
          FILES_PER_BATCH,

        maxBatchAttempts:
          MAX_BATCH_ATTEMPTS,

        extraFilesPolicy:
          "discard-and-repair-if-required-files-missing",

        hardcodedProjectStructure:
          false,

        hardcodedFrameworkFileList:
          false,

        semanticKeywordTaxonomy:
          false,

        packageBuildContract:
          "structural-only",

        authoritativeBuild:
          false,

        buildExecution:
          "delegated-to-engineering-system",

        finalManifestCoverage:
          true,

        durationMs

      }

    };

  } catch (error) {

    logError(
      `Builder Agent Failed at ${
        currentStage
      }: ${
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
  "structural-finite-build";


builderAgent.providerArchitecture =
  "centralized-ai-provider-service";


builderAgent.hardcodedProjectStructure =
  false;


builderAgent.hardcodedFrameworkFileList =
  false;


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  builderAgent;
