/* =========================================================
   ZyrionOS FIX AGENT
   Production Project Review + Debugging + Multi-File Repair

   VERSION: 8.0.0

   ARCHITECTURE

   Builder
      ↓
   BuildValidationService
      ↓
   AuthoritativeBuildService
      ↓
   Build Failure / Repair Context
      ↓
   Fix Agent
      ↓
   Project Review
      ↓
   Root Cause
      ↓
   Complete File Repair
      ↓
   Static Validation
      ↓
   AI Verification
      ↓
   Master Agent
      ↓
   Revalidation

   IMPORTANT

   Fix Agent does NOT:
   - execute authoritative builds
   - execute generated application code
   - deploy infrastructure
   - modify AWS
   - modify Docker infrastructure
   - modify DNS
   - modify SSL
   - resolve secrets
   - directly call external AI providers

   All AI generation goes through:

   services/ai/aiProviderService.js

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
   BUILD VALIDATION SERVICE
========================================================= */

let buildValidationService = null;

try {

  buildValidationService =
    require("../services/buildValidationService");

} catch {

  buildValidationService =
    null;

}


/* =========================================================
   VERSION
========================================================= */

const FIX_AGENT_VERSION =
  "8.0.0";


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILES =
  200;

const MAX_PATH_LENGTH =
  300;

const MAX_FILE_SIZE =
  250000;

const MAX_TOTAL_SOURCE_SIZE =
  25000000;

const MAX_PROMPT_LENGTH =
  12000;

const MAX_ERROR_LENGTH =
  16000;

const MAX_FILE_CONTEXT =
  14000;

const MAX_TOTAL_CONTEXT =
  70000;

const MAX_REVIEW_FILES_PER_BATCH =
  8;

const MAX_REVIEW_TOKENS =
  6500;

const MAX_REPAIR_TOKENS =
  14000;

const MAX_REPAIR_FILES =
  40;

const MAX_FIX_ROUNDS =
  2;


/* =========================================================
   LOGGER COMPATIBILITY
========================================================= */

function logInfo(message) {

  try {

    if (
      logger &&
      typeof logger.info ===
        "function"
    ) {

      return logger.info(message);

    }

  } catch {}

}


function logWarning(message) {

  try {

    if (
      logger &&
      typeof logger.warning ===
        "function"
    ) {

      return logger.warning(message);

    }

    if (
      logger &&
      typeof logger.warn ===
        "function"
    ) {

      return logger.warn(message);

    }

    if (
      logger &&
      typeof logger.info ===
        "function"
    ) {

      return logger.info(
        `[WARNING] ${message}`
      );

    }

  } catch {}

}


function logError(message) {

  try {

    if (
      logger &&
      typeof logger.error ===
        "function"
    ) {

      return logger.error(message);

    }

  } catch {}

}


/* =========================================================
   SAFE STRING
========================================================= */

function cleanString(
  value,
  maxLength = 4000
) {

  if (
    typeof value !==
    "string"
  ) {

    return "";

  }

  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);

}


/* =========================================================
   SECRET KEYS
========================================================= */

const SECRET_KEYS =
  new Set([

    "password",
    "passwd",
    "secret",
    "token",
    "accessToken",
    "refreshToken",
    "apiKey",
    "api_key",
    "authorization",
    "cookie",
    "privateKey",
    "private_key",
    "clientSecret",
    "client_secret",
    "webhookSecret",
    "webhook_secret",
    "secretValue",
    "secret_value",
    "plainValue",
    "encryptedValue",
    "credentials",
    "authorizationToken",
    "databaseUrl",
    "DATABASE_URL"

  ]);


/* =========================================================
   SANITIZE CONTEXT
========================================================= */

function sanitizeForContext(
  value,
  depth = 0
) {

  if (
    depth > 7
  ) {

    return "[truncated]";

  }

  if (
    value === null ||
    value === undefined
  ) {

    return value;

  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {

    return value;

  }

  if (
    Array.isArray(value)
  ) {

    return value
      .slice(0, 100)
      .map(
        item =>
          sanitizeForContext(
            item,
            depth + 1
          )
      );

  }

  if (
    typeof value === "object"
  ) {

    const output = {};

    for (
      const [
        key,
        item
      ] of Object.entries(value)
    ) {

      if (
        SECRET_KEYS.has(key)
      ) {

        output[key] =
          "[REDACTED]";

        continue;

      }

      output[key] =
        sanitizeForContext(
          item,
          depth + 1
        );

    }

    return output;

  }

  return "[unsupported]";

}


/* =========================================================
   SAFE JSON
========================================================= */

function safeJson(value) {

  try {

    return JSON.stringify(
      sanitizeForContext(value)
    );

  } catch {

    return "{}";

  }

}


/* =========================================================
   PATH NORMALIZATION
========================================================= */

function normalizeFilePath(value) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }

  let filePath =
    value
      .trim()
      .replace(/\\/g, "/");

  while (
    filePath.startsWith("./")
  ) {

    filePath =
      filePath.slice(2);

  }

  if (
    !filePath ||
    filePath.length >
      MAX_PATH_LENGTH
  ) {

    return null;

  }

  if (
    filePath.startsWith("/") ||
    /^[A-Za-z]:\//.test(filePath)
  ) {

    return null;

  }

  if (
    filePath.includes("\0")
  ) {

    return null;

  }

  const parts =
    filePath.split("/");

  if (
    parts.includes("..")
  ) {

    return null;

  }

  return filePath;

}


/* =========================================================
   FILE CONTENT
========================================================= */

function normalizeFileContent(value) {

  if (
    typeof value !==
    "string"
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
   FILE NORMALIZATION
========================================================= */

function normalizeFiles(files) {

  if (
    !Array.isArray(files)
  ) {

    return {

      files: [],
      invalidCount: 0,
      duplicateCount: 0,
      totalBytes: 0

    };

  }

  const normalized = [];

  const seen =
    new Set();

  let invalidCount = 0;
  let duplicateCount = 0;
  let totalBytes = 0;


  for (
    const file of files
  ) {

    if (
      !file ||
      typeof file !== "object"
    ) {

      invalidCount++;
      continue;

    }

    const filePath =
      normalizeFilePath(
        file.path ||
        file.name ||
        file.filePath
      );

    const content =
      normalizeFileContent(
        file.content !== undefined
          ? file.content
          : file.source
      );

    if (
      !filePath ||
      content === null
    ) {

      invalidCount++;
      continue;

    }

    if (
      seen.has(filePath)
    ) {

      duplicateCount++;
      continue;

    }

    if (
      totalBytes +
        content.length >
      MAX_TOTAL_SOURCE_SIZE
    ) {

      invalidCount++;
      continue;

    }

    seen.add(filePath);

    totalBytes +=
      content.length;

    normalized.push({

      path:
        filePath,

      content

    });

    if (
      normalized.length >=
      MAX_FILES
    ) {

      break;

    }

  }

  return {

    files:
      normalized,

    invalidCount,

    duplicateCount,

    totalBytes

  };

}


/* =========================================================
   REQUEST NORMALIZATION
========================================================= */

function normalizeFixRequest(input) {

  const defaults = {

    prompt: "",
    error: "",
    errorLine: null,
    errorFile: "",
    mode: "automatic",

    files: [],

    projectId: "",
    projectName: "",
    framework: "",
    packageManager: "",

    planning: null,
    architecture: null,
    intent: null,
    manifest: null,
    tests: null,
    review: null,
    memoryContext: null,

    buildResult: null,
    buildValidation: null,
    buildError: "",

    validationErrors: [],
    validationWarnings: [],

    repairContext: null,

    repairRound: 0,

    maxRepairRounds:
      MAX_FIX_ROUNDS,

    runtimeError: null,
    runtimeLogs: null,
    testResult: null,

    user: {}

  };


  if (
    typeof input ===
    "string"
  ) {

    return {

      ...defaults,

      prompt:
        cleanString(
          input,
          MAX_PROMPT_LENGTH
        )

    };

  }


  if (
    !input ||
    typeof input !==
      "object"
  ) {

    return defaults;

  }


  const requestedMode =
    cleanString(
      input.mode,
      50
    ).toLowerCase();


  const mode =
    [
      "review",
      "review_fix",
      "user_review",
      "user-review"
    ].includes(requestedMode)
      ? "review_fix"
      : "automatic";


  const repairRound =
    Number.isFinite(
      Number(input.repairRound)
    )
      ? Math.max(
          0,
          Number(input.repairRound)
        )
      : 0;


  const maxRepairRounds =
    Number.isFinite(
      Number(input.maxRepairRounds)
    )
      ? Math.min(
          Math.max(
            Number(input.maxRepairRounds),
            1
          ),
          MAX_FIX_ROUNDS
        )
      : MAX_FIX_ROUNDS;


  return {

    ...defaults,

    prompt:
      cleanString(
        input.prompt,
        MAX_PROMPT_LENGTH
      ),

    error:
      cleanString(
        input.error ||
        input.errorMessage,
        MAX_ERROR_LENGTH
      ),

    errorLine:
      Number.isFinite(
        Number(input.errorLine)
      )
        ? Number(input.errorLine)
        : null,

    errorFile:
      cleanString(
        input.errorFile ||
        input.file,
        MAX_PATH_LENGTH
      ),

    mode,

    files:
      Array.isArray(input.files)
        ? input.files
        : [],

    projectId:
      cleanString(
        input.projectId,
        200
      ),

    projectName:
      cleanString(
        input.projectName,
        200
      ),

    framework:
      cleanString(
        input.framework,
        200
      ),

    packageManager:
      cleanString(
        input.packageManager,
        100
      ),

    planning:
      input.planning ||
      null,

    architecture:
      input.architecture ||
      null,

    intent:
      input.intent ||
      null,

    manifest:
      input.manifest ||
      null,

    tests:
      input.tests ||
      null,

    review:
      input.review ||
      null,

    memoryContext:
      input.memoryContext ||
      null,

    buildResult:
      input.buildResult ||
      null,

    buildValidation:
      input.buildValidation ||
      null,

    buildError:
      cleanString(
        input.buildError,
        MAX_ERROR_LENGTH
      ),

    validationErrors:
      Array.isArray(
        input.validationErrors
      )
        ? input.validationErrors
        : [],

    validationWarnings:
      Array.isArray(
        input.validationWarnings
      )
        ? input.validationWarnings
        : [],

    repairContext:
      input.repairContext ||
      null,

    repairRound,

    maxRepairRounds,

    runtimeError:
      input.runtimeError ||
      null,

    runtimeLogs:
      input.runtimeLogs ||
      null,

    testResult:
      input.testResult ||
      null,

    user:
      input.user ||
      {}

  };

}


/* =========================================================
   FILE MAP
========================================================= */

function createFileMap(files) {

  const map =
    new Map();

  for (
    const file of files
  ) {

    map.set(
      file.path,
      file
    );

  }

  return map;

}


/* =========================================================
   FILE TYPE
========================================================= */

function getFileType(filePath) {

  const lower =
    filePath.toLowerCase();

  if (
    lower.endsWith(".tsx") ||
    lower.endsWith(".ts")
  ) {

    return "typescript";

  }

  if (
    lower.endsWith(".jsx") ||
    lower.endsWith(".js") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {

    return "javascript";

  }

  if (
    lower.endsWith(".json")
  ) {

    return "json";

  }

  if (
    lower.endsWith(".css") ||
    lower.endsWith(".scss") ||
    lower.endsWith(".sass") ||
    lower.endsWith(".less")
  ) {

    return "style";

  }

  if (
    lower.endsWith(".html")
  ) {

    return "html";

  }

  if (
    lower.endsWith(".py")
  ) {

    return "python";

  }

  if (
    lower.endsWith(".vue")
  ) {

    return "vue";

  }

  return "other";

}


/* =========================================================
   PROJECT INVENTORY
========================================================= */

function buildProjectInventory(files) {

  return files.map(
    file => ({

      path:
        file.path,

      type:
        getFileType(
          file.path
        ),

      size:
        file.content.length

    })
  );

}


/* =========================================================
   ERROR FILE FINDER
========================================================= */

function findErrorFile(
  files,
  request
) {

  if (
    request.errorFile
  ) {

    const exact =
      files.find(
        file =>
          file.path ===
          request.errorFile
      );

    if (exact) {

      return exact;

    }

  }


  const evidence =
    [

      request.error,

      request.buildError,

      typeof request.runtimeError ===
        "string"
        ? request.runtimeError
        : safeJson(
            request.runtimeError
          ),

      safeJson(
        request.buildValidation
      ),

      safeJson(
        request.validationErrors
      ),

      safeJson(
        request.repairContext
      )

    ]
      .join("\n")
      .toLowerCase();


  for (
    const file of files
  ) {

    if (
      evidence.includes(
        file.path.toLowerCase()
      )
    ) {

      return file;

    }

  }


  return null;

}


/* =========================================================
   PRIORITY FILES
========================================================= */

function prioritizeFiles(
  files,
  request
) {

  const errorFile =
    findErrorFile(
      files,
      request
    );


  const priorityNames = [

    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "bun.lock",

    "vite.config.js",
    "vite.config.ts",
    "vite.config.mjs",

    "next.config.js",
    "next.config.mjs",
    "next.config.ts",

    "tsconfig.json",
    "jsconfig.json",

    "src/main.jsx",
    "src/main.js",
    "src/index.jsx",
    "src/index.js",

    "src/App.jsx",
    "src/App.js",

    "app/layout.tsx",
    "app/layout.jsx",
    "app/page.tsx",
    "app/page.jsx",

    "pages/index.js",
    "pages/index.tsx",

    "server.js",
    "src/server.js",
    "src/app.js",
    "src/index.ts",
    "src/index.tsx"

  ];


  const priority = [];


  const add =
    file => {

      if (
        file &&
        !priority.includes(file)
      ) {

        priority.push(file);

      }

    };


  add(errorFile);


  for (
    const name of priorityNames
  ) {

    add(
      files.find(
        file =>
          file.path ===
          name
      )
    );

  }


  for (
    const file of files
  ) {

    add(file);

  }


  return priority;

}


/* =========================================================
   CHUNK FILES
========================================================= */

function chunkFiles(
  files,
  size
) {

  const chunks = [];

  for (
    let i = 0;
    i < files.length;
    i += size
  ) {

    chunks.push(
      files.slice(
        i,
        i + size
      )
    );

  }

  return chunks;

}


/* =========================================================
   BUILD FILE CONTEXT
========================================================= */

function buildFileContext(files) {

  return files.map(
    file => {

      const content =
        file.content.length >
        MAX_FILE_CONTEXT
          ? file.content.slice(
              0,
              MAX_FILE_CONTEXT
            ) +
            "\n/* FILE CONTENT TRUNCATED FOR REVIEW */"
          : file.content;


      return {

        path:
          file.path,

        type:
          getFileType(
            file.path
          ),

        content

      };

    }
  );

}


/* =========================================================
   AUTHORITATIVE FAILURE EXTRACTION
========================================================= */

function extractAuthoritativeFailure(
  request
) {

  const result =
    request.buildResult &&
    typeof request.buildResult ===
      "object"
      ? request.buildResult
      : {};


  const nestedResult =
    result.result &&
    typeof result.result ===
      "object"
      ? result.result
      : {};


  const context =
    request.repairContext &&
    typeof request.repairContext ===
      "object"
      ? request.repairContext
      : (
          result.repairContext ||
          nestedResult.repairContext ||
          {}
        );


  const errors =
    Array.isArray(
      context.errors
    )
      ? context.errors
      : (
          Array.isArray(
            nestedResult.errors
          )
            ? nestedResult.errors
            : (
                Array.isArray(result.errors)
                  ? result.errors
                  : []
              )
        );


  const affectedFiles =
    Array.isArray(
      context.affectedFiles
    )
      ? context.affectedFiles
      : [];


  const normalizedAffectedFiles =
    affectedFiles
      .map(
        item =>
          typeof item === "string"
            ? item
            : item?.file ||
              item?.path ||
              item?.filePath ||
              null
      )
      .map(
        normalizeFilePath
      )
      .filter(Boolean);


  const buildCommand =
    context.buildCommand ||
    nestedResult.buildCommand ||
    result.buildCommand ||
    null;


  const installCommand =
    context.installCommand ||
    nestedResult.installCommand ||
    result.installCommand ||
    null;


  const failureStage =
    context.failureStage ||
    nestedResult.failureStage ||
    result.failureStage ||
    null;


  const failureCategory =
    context.failureCategory ||
    nestedResult.failureCategory ||
    result.failureCategory ||
    null;


  const retryable =
    typeof context.retryable ===
      "boolean"
      ? context.retryable
      : (
          typeof nestedResult.retryable ===
            "boolean"
            ? nestedResult.retryable
            : (
                typeof result.retryable ===
                  "boolean"
                  ? result.retryable
                  : false
              )
        );


  const stdout =
    context.stdout ||
    nestedResult.stdout ||
    result.stdout ||
    "";


  const stderr =
    context.stderr ||
    nestedResult.stderr ||
    result.stderr ||
    "";


  const exitCode =
    context.exitCode ??
    nestedResult.exitCode ??
    result.exitCode ??
    null;


  const signal =
    context.signal ||
    nestedResult.signal ||
    result.signal ||
    null;


  const timedOut =
    Boolean(
      context.timedOut ??
      nestedResult.timedOut ??
      result.timedOut
    );


  return {

    available:
      Boolean(
        request.repairContext ||
        result.repairContext ||
        nestedResult.repairContext ||
        request.buildResult
      ),

    buildId:
      context.buildId ||
      nestedResult.buildId ||
      result.buildId ||
      null,

    sourceHash:
      context.sourceHash ||
      nestedResult.sourceHash ||
      result.sourceHash ||
      null,

    buildCommand,

    installCommand,

    failureStage,

    failureCategory,

    retryable,

    affectedFiles:
      normalizedAffectedFiles,

    errors,

    stdout:
      cleanString(
        stdout,
        12000
      ),

    stderr:
      cleanString(
        stderr,
        16000
      ),

    exitCode,

    signal,

    timedOut

  };

}


/* =========================================================
   BUILD FAILURE CONTEXT
========================================================= */

function buildFailureContext(request) {

  const authoritative =
    extractAuthoritativeFailure(
      request
    );


  return {

    buildResult:
      sanitizeForContext(
        request.buildResult
      ),

    buildValidation:
      sanitizeForContext(
        request.buildValidation
      ),

    buildError:
      request.buildError,

    validationErrors:
      sanitizeForContext(
        request.validationErrors
      ),

    validationWarnings:
      sanitizeForContext(
        request.validationWarnings
      ),

    repairContext:
      sanitizeForContext(
        request.repairContext
      ),

    authoritativeFailure:
      sanitizeForContext(
        authoritative
      ),

    runtimeError:
      sanitizeForContext(
        request.runtimeError
      ),

    runtimeLogs:
      sanitizeForContext(
        request.runtimeLogs
      ),

    testResult:
      sanitizeForContext(
        request.testResult
      )

  };

}


/* =========================================================
   ADD AUTHORITATIVE TARGETS
========================================================= */

function addAuthoritativeTargets(
  review,
  request,
  files
) {

  const merged = {

    ...review,

    repairTargets:
      Array.isArray(
        review.repairTargets
      )
        ? [
            ...review.repairTargets
          ]
        : []

  };


  const availablePaths =
    new Set(
      files.map(
        file =>
          file.path
      )
    );


  const authoritative =
    extractAuthoritativeFailure(
      request
    );


  for (
    const target of
      authoritative.affectedFiles
  ) {

    if (
      availablePaths.has(target) &&
      !merged.repairTargets.includes(target)
    ) {

      merged.repairTargets.push(
        target
      );

    }

  }


  for (
    const error of
      authoritative.errors
  ) {

    const target =
      normalizeFilePath(
        error?.file ||
        error?.path ||
        error?.filePath
      );


    if (
      target &&
      availablePaths.has(target) &&
      !merged.repairTargets.includes(target)
    ) {

      merged.repairTargets.push(
        target
      );

    }

  }


  return merged;

}


/* =========================================================
   COMMON SYSTEM PROMPT
========================================================= */

function getCommonSystemPrompt() {

  return `

You are the Fix Agent of ZyrionOS.

You are a senior autonomous software debugging,
code-review and project-repair engineer.

Your job is to identify the ROOT CAUSE of a
reported software failure and repair the smallest
coherent set of source files required to resolve it.

==================================================
PIPELINE CONTRACT
==================================================

Builder generates source.
BuildValidationService performs STATIC validation.
AuthoritativeBuildService performs the REAL
isolated production build.

If AuthoritativeBuildService fails:

YOU MUST USE THE AUTHORITATIVE FAILURE EVIDENCE.

Important evidence can include:

- buildCommand
- installCommand
- failureStage
- failureCategory
- retryable
- affectedFiles
- errors
- stdout
- stderr
- exitCode
- signal
- timedOut
- sourceHash
- buildId

Do NOT invent missing evidence.

==================================================
ROOT CAUSE
==================================================

ERROR LINE != ROOT CAUSE.

A reported failure may originate from:

- incorrect import
- incorrect export
- default/named export mismatch
- wrong module path
- missing dependency
- incompatible dependency version
- malformed source
- HTML-escaped JSX/TSX
- invalid package.json
- invalid build script
- wrong entrypoint
- wrong framework structure
- incorrect configuration
- API contract mismatch
- duplicate implementation
- incorrect function signature
- dependency/build mismatch

Reason across related files.

==================================================
AUTHORITATIVE BUILD RULE
==================================================

If the authoritative build failed because the
build command is invalid:

Repair package.json/build configuration.

Examples:

BAD:
node server.js
npm start
npm run dev
vite
vite preview
next dev
watch commands
runtime server commands

GOOD:
vite build
next build
react-scripts build
appropriate finite production compiler

Do NOT convert a build failure into a runtime
server workaround.

The build command must remain a FINITE production
build command.

==================================================
SOURCE REPAIR
==================================================

Preserve working functionality.

Make the smallest coherent repair.

Repair all directly affected files.

Keep imports and exports consistent.

Keep function signatures compatible.

Keep API contracts compatible.

Do not introduce unnecessary dependencies.

Do not rewrite unrelated files.

==================================================
NEW FILES
==================================================

A repair MAY add a missing source file if the
authoritative/static evidence proves that the file
is required.

If adding a file:

- use a safe relative path
- return COMPLETE content
- update imports/contracts coherently
- do not invent unnecessary architecture

==================================================
COMPLETE FILE CONTRACT
==================================================

Every returned file MUST contain its COMPLETE content.

Never return:

- partial snippets
- diffs
- patch syntax
- "...rest of code..."
- placeholders
- omitted sections

==================================================
SECURITY
==================================================

Never output:

- API keys
- passwords
- private keys
- access tokens
- cookies
- provider credentials

Use environment variables.

Never create:

- absolute filesystem paths
- ../ traversal
- credential files

==================================================
HONESTY
==================================================

Never claim:

- build succeeded
- runtime succeeded
- deployment succeeded
- AWS changed
- Docker succeeded

unless supplied evidence proves it.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

No markdown.
No code fences.
No explanations outside JSON.

`;

}


/* =========================================================
   REVIEW BATCH
========================================================= */

async function reviewBatch(
  batch,
  request,
  batchNumber,
  totalBatches
) {

  const context = {

    batch:
      batchNumber,

    totalBatches,

    userRequest:
      request.prompt,

    error:
      request.error,

    buildError:
      request.buildError,

    errorFile:
      request.errorFile,

    errorLine:
      request.errorLine,

    framework:
      request.framework,

    packageManager:
      request.packageManager,

    projectId:
      request.projectId,

    projectName:
      request.projectName,

    failureEvidence:
      buildFailureContext(
        request
      ),

    files:
      buildFileContext(
        batch
      )

  };


  const serialized =
    safeJson(context)
      .slice(
        0,
        MAX_TOTAL_CONTEXT
      );


  const result =
    await generateJSON({

      messages: [

        {

          role:
            "system",

          content:
            getCommonSystemPrompt() +

            `

CURRENT TASK:
PROJECT REVIEW

Do NOT generate repaired files yet.

Identify concrete or strongly supported
problems in the supplied files.

Pay special attention to:

- authoritative build failure
- build command
- package.json
- dependencies
- imports
- exports
- entrypoints
- configuration
- framework structure
- source syntax
- cross-file contracts

Return:

{
  "issues": [],
  "relationships": [],
  "repairTargets": []
}

issues:

{
  "file": "src/example.js",
  "line": 18,
  "severity": "critical|high|medium|low",
  "type": "import|export|runtime|syntax|dependency|api|logic|config|build|other",
  "problem": "short concrete explanation",
  "evidence": "specific evidence from supplied source"
}

relationships:

{
  "from": "src/App.js",
  "to": "src/hooks/useApp.js",
  "relationship": "imports",
  "contract": "useApp"
}

repairTargets:
[
  "src/App.js"
]

Do not invent errors.

`

        },

        {

          role:
            "user",

          content:
            serialized

        }

      ],

      temperature:
        0.1,

      maxTokens:
        MAX_REVIEW_TOKENS

    });


  if (
    !result ||
    result.success !== true
  ) {

    throw new Error(
      result?.error ||
      `Project review batch ${batchNumber} failed`
    );

  }


  return {

    data:
      result.data ||
      {},

    provider:
      result.provider ||
      null,

    model:
      result.model ||
      null

  };

}


/* =========================================================
   MERGE REVIEW RESULTS
========================================================= */

function mergeReviewResults(results) {

  const issues = [];
  const relationships = [];

  const repairTargets =
    new Set();

  const providers = [];
  const models = [];


  for (
    const result of results
  ) {

    const data =
      result.data ||
      {};


    if (
      Array.isArray(data.issues)
    ) {

      issues.push(
        ...data.issues
      );

    }


    if (
      Array.isArray(data.relationships)
    ) {

      relationships.push(
        ...data.relationships
      );

    }


    if (
      Array.isArray(data.repairTargets)
    ) {

      for (
        const target of
          data.repairTargets
      ) {

        const normalized =
          normalizeFilePath(
            target
          );

        if (
          normalized
        ) {

          repairTargets.add(
            normalized
          );

        }

      }

    }


    if (result.provider) {

      providers.push(
        result.provider
      );

    }


    if (result.model) {

      models.push(
        result.model
      );

    }

  }


  return {

    issues,

    relationships,

    repairTargets:
      Array.from(
        repairTargets
      ),

    providers:
      Array.from(
        new Set(providers)
      ),

    models:
      Array.from(
        new Set(models)
      )

  };

}


/* =========================================================
   SELECT REPAIR FILES
========================================================= */

function selectRepairFiles(
  files,
  review,
  request
) {

  const map =
    createFileMap(files);

  const selected = [];


  const add =
    file => {

      if (
        file &&
        !selected.includes(file)
      ) {

        selected.push(file);

      }

    };


  add(
    findErrorFile(
      files,
      request
    )
  );


  for (
    const path of
      review.repairTargets ||
      []
  ) {

    add(
      map.get(
        normalizeFilePath(path)
      )
    );

  }


  for (
    const issue of
      review.issues ||
      []
  ) {

    if (
      typeof issue?.file ===
      "string"
    ) {

      add(
        map.get(
          normalizeFilePath(
            issue.file
          )
        )
      );

    }

  }


  for (
    const relationship of
      review.relationships ||
      []
  ) {

    if (
      typeof relationship?.from ===
      "string"
    ) {

      add(
        map.get(
          normalizeFilePath(
            relationship.from
          )
        )
      );

    }

    if (
      typeof relationship?.to ===
      "string"
    ) {

      add(
        map.get(
          normalizeFilePath(
            relationship.to
          )
        )
      );

    }

  }


  return selected.slice(
    0,
    MAX_REPAIR_FILES
  );

}


/* =========================================================
   REPAIR PROJECT
========================================================= */

async function repairProject(
  files,
  request,
  review
) {

  const repairFiles =
    selectRepairFiles(
      files,
      review,
      request
    );


  if (
    repairFiles.length ===
    0
  ) {

    return {

      success:
        true,

      data: {

        issues:
          review.issues ||
          [],

        fixes: [],

        rootCause:
          "",

        optimizedCode:
          "",

        files: []

      },

      provider:
        null,

      model:
        null

    };

  }


  const repairContext = {

    userRequest:
      request.prompt,

    mode:
      request.mode,

    error:
      request.error,

    buildError:
      request.buildError,

    errorFile:
      request.errorFile,

    errorLine:
      request.errorLine,

    framework:
      request.framework,

    packageManager:
      request.packageManager,

    projectId:
      request.projectId,

    projectName:
      request.projectName,

    planning:
      sanitizeForContext(
        request.planning
      ),

    architecture:
      sanitizeForContext(
        request.architecture
      ),

    intent:
      sanitizeForContext(
        request.intent
      ),

    manifest:
      sanitizeForContext(
        request.manifest
      ),

    failureEvidence:
      buildFailureContext(
        request
      ),

    review:
      sanitizeForContext(
        review
      ),

    repairRound:
      request.repairRound,

    maxRepairRounds:
      request.maxRepairRounds,

    sourceFiles:
      buildFileContext(
        repairFiles
      )

  };


  const serialized =
    safeJson(
      repairContext
    ).slice(
      0,
      MAX_TOTAL_CONTEXT
    );


  const result =
    await generateJSON({

      messages: [

        {

          role:
            "system",

          content:
            getCommonSystemPrompt() +

            `

CURRENT TASK:
REPAIR PASS

Determine:

1. Root cause.
2. Directly affected files.
3. Smallest coherent repair.
4. Cross-file contract changes if required.
5. Complete corrected file contents.

AUTHORITATIVE FAILURE HAS PRIORITY.

If an authoritative build error identifies a
specific command, file, compiler error, dependency,
or failure category, use that evidence directly.

If package.json contains an invalid production
build script, repair package.json rather than
creating a runtime workaround.

Required JSON:

{
  "issues": [],
  "fixes": [],
  "rootCause": "",
  "optimizedCode": "",
  "files": []
}

files:

[
  {
    "path": "src/App.js",
    "content": "COMPLETE corrected file"
  }
]

A missing file MAY be added only when evidence
shows it is required.

Never return partial files.

Never return diffs.

Never return placeholders.

Never rewrite unrelated files.

`

        },

        {

          role:
            "user",

          content:
            serialized

        }

      ],

      temperature:
        0.15,

      maxTokens:
        MAX_REPAIR_TOKENS

    });


  if (
    !result ||
    result.success !== true
  ) {

    throw new Error(
      result?.error ||
      "AI repair pass failed"
    );

  }


  return {

    success:
      true,

    data:
      result.data ||
      {},

    provider:
      result.provider ||
      null,

    model:
      result.model ||
      null

  };

}


/* =========================================================
   VALIDATE RETURNED FILES
========================================================= */

function validateReturnedFiles(files) {

  const normalized =
    normalizeFiles(files);


  return {

    files:
      normalized.files,

    invalid:
      normalized.invalidCount,

    duplicates:
      normalized.duplicateCount,

    totalBytes:
      normalized.totalBytes

  };

}


/* =========================================================
   CHECK REPAIR COVERAGE
========================================================= */

function checkRepairCoverage(
  repairTargets,
  returnedFiles
) {

  const returned =
    new Set(
      returnedFiles.map(
        file =>
          file.path
      )
    );


  const explicitTargets =
    Array.from(
      new Set(
        repairTargets
          .map(
            normalizeFilePath
          )
          .filter(Boolean)
      )
    );


  const missing = [];


  for (
    const target of
      explicitTargets
  ) {

    if (
      !returned.has(target)
    ) {

      missing.push(target);

    }

  }


  return {

    complete:
      missing.length ===
      0,

    missing,

    requested:
      explicitTargets,

    returned:
      Array.from(returned)

  };

}


/* =========================================================
   FILTER SAFE REPAIR OUTPUT
========================================================= */

function filterRepairOutput(
  originalFiles,
  returnedFiles,
  allowedTargets
) {

  const originalMap =
    createFileMap(
      originalFiles
    );


  const allowed =
    new Set(
      allowedTargets
        .map(
          normalizeFilePath
        )
        .filter(Boolean)
    );


  const safe = [];

  const rejected = [];


  for (
    const file of returnedFiles
  ) {

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

      rejected.push({

        path:
          file?.path ||
          null,

        reason:
          "invalid-path-or-content"

      });

      continue;

    }


    /*
     * Existing file must be a known repair target.
     */

    if (
      originalMap.has(path)
    ) {

      if (
        !allowed.has(path)
      ) {

        rejected.push({

          path,

          reason:
            "existing-file-not-authorized-for-repair"

        });

        continue;

      }

    }


    /*
     * New files are allowed only when they
     * were explicitly identified as repair
     * targets.
     */

    if (
      !originalMap.has(path) &&
      !allowed.has(path)
    ) {

      rejected.push({

        path,

        reason:
          "new-file-not-authorized-for-repair"

      });

      continue;

    }


    safe.push({

      path,

      content

    });

  }


  return {

    files:
      safe,

    rejected

  };

}


/* =========================================================
   APPLY REPAIRS
   ---------------------------------------------------------
   Supports BOTH:
   - modified existing files
   - newly created files
========================================================= */

function applyRepairs(
  originalFiles,
  repairedFiles
) {

  const result =
    originalFiles.map(
      file => ({
        path:
          file.path,
        content:
          file.content
      })
    );


  const indexMap =
    new Map();


  result.forEach(
    (
      file,
      index
    ) => {

      indexMap.set(
        file.path,
        index
      );

    }
  );


  for (
    const repaired of
      repairedFiles
  ) {

    const path =
      normalizeFilePath(
        repaired.path
      );


    const content =
      normalizeFileContent(
        repaired.content
      );


    if (
      !path ||
      content === null
    ) {

      continue;

    }


    if (
      indexMap.has(path)
    ) {

      const index =
        indexMap.get(path);


      result[index] = {

        path,

        content

      };

      continue;

    }


    /*
     * IMPORTANT:
     * Missing files are allowed to be added.
     */

    indexMap.set(
      path,
      result.length
    );


    result.push({

      path,

      content

    });

  }


  return result;

}


/* =========================================================
   STATIC VALIDATION
   ---------------------------------------------------------
   IMPORTANT:
   Match Master Agent / BuildValidationService
   contract.
========================================================= */

async function runStaticValidation(
  files,
  request
) {

  if (
    !buildValidationService ||
    typeof buildValidationService.validateProject !==
      "function"
  ) {

    return {

      available:
        false,

      valid:
        true,

      authoritative:
        false,

      validationMode:
        "unavailable",

      errors: [],

      warnings: [],

      message:
        "Build validation service unavailable."

    };

  }


  try {

    const projectData = {

      projectId:
        request.projectId ||
        null,

      projectName:
        request.projectName ||
        null,

      framework:
        request.framework ||
        null,

      packageManager:
        request.packageManager ||
        null

    };


    /*
     * EXACTLY align with Master validation
     * context where possible.
     */

    const result =
      await Promise.resolve(
        buildValidationService.validateProject({

          files,

          plan:
            request.planning ||
            null,

          projectData,

          manifest:
            request.manifest ||
            null

        })
      );


    const errors =
      Array.isArray(
        result?.errors
      )
        ? result.errors
        : [];


    const warnings =
      Array.isArray(
        result?.warnings
      )
        ? result.warnings
        : [];


    /*
     * BuildValidationService v2 returns
     * success/status rather than relying only
     * on `valid`.
     */

    const valid =
      result?.success === true ||
      result?.valid === true ||
      (
        result?.status === "passed" &&
        errors.length === 0
      );


    return {

      available:
        true,

      valid,

      success:
        result?.success === true,

      status:
        result?.status ||
        null,

      authoritative:
        result?.authoritative === true,

      validationMode:
        result?.validationMode ||
        result?.mode ||
        "static",

      errors,

      warnings,

      sourceHash:
        result?.sourceHash ||
        null,

      repairContext:
        result?.repairContext ||
        null,

      summary:
        result?.summary ||
        null,

      result

    };

  } catch (error) {

    return {

      available:
        true,

      valid:
        false,

      success:
        false,

      authoritative:
        false,

      validationMode:
        "static",

      errors: [

        {

          code:
            "VALIDATOR_EXCEPTION",

          type:
            "validator_exception",

          message:
            cleanString(
              error?.message ||
              "Static validation failed.",
              5000
            )

        }

      ],

      warnings: [],

      repairContext:
        null,

      result:
        null

    };

  }

}


/* =========================================================
   VALIDATION SUMMARY
========================================================= */

function getValidationSummary(
  validation
) {

  if (!validation) {

    return "";

  }


  return safeJson({

    available:
      validation.available,

    valid:
      validation.valid,

    success:
      validation.success,

    status:
      validation.status,

    authoritative:
      validation.authoritative,

    validationMode:
      validation.validationMode,

    sourceHash:
      validation.sourceHash,

    errors:
      validation.errors,

    warnings:
      validation.warnings,

    repairContext:
      validation.repairContext

  });

}


/* =========================================================
   REPAIR VERIFICATION
========================================================= */

async function verifyRepair(
  repairedFiles,
  request,
  review
) {

  const verificationFiles =
    selectRepairFiles(

      repairedFiles,

      review,

      request

    );


  const staticValidation =
    await runStaticValidation(

      repairedFiles,

      request

    );


  /*
   * Static validation is authoritative for
   * static errors only.
   *
   * It does NOT prove runtime/build success.
   */

  if (
    staticValidation.available &&
    !staticValidation.valid
  ) {

    return {

      success:
        true,

      data: {

        valid:
          false,

        issues:
          staticValidation.errors,

        remainingProblems:
          staticValidation.errors

      },

      staticValidation,

      provider:
        null,

      model:
        null

    };

  }


  if (
    verificationFiles.length ===
    0
  ) {

    return {

      success:
        true,

      data: {

        valid:
          true,

        issues: [],

        remainingProblems: []

      },

      staticValidation,

      provider:
        null,

      model:
        null

    };

  }


  const context = {

    userRequest:
      request.prompt,

    error:
      request.error,

    buildError:
      request.buildError,

    errorFile:
      request.errorFile,

    errorLine:
      request.errorLine,

    framework:
      request.framework,

    packageManager:
      request.packageManager,

    originalReview:
      sanitizeForContext(
        review
      ),

    failureEvidence:
      buildFailureContext(
        request
      ),

    staticValidation:
      getValidationSummary(
        staticValidation
      ),

    repairedFiles:
      buildFileContext(
        verificationFiles
      )

  };


  const result =
    await generateJSON({

      messages: [

        {

          role:
            "system",

          content:
            getCommonSystemPrompt() +

            `

CURRENT TASK:
FINAL REPAIR VERIFICATION

Do NOT generate replacement files.

Determine whether the repaired source is
coherent with the supplied failure evidence.

Check:

- imports
- exports
- referenced symbols
- obvious syntax errors
- dependency usage
- package configuration
- build configuration
- framework structure
- API contracts
- authoritative failure evidence

IMPORTANT:

Passing this AI verification does NOT mean the
authoritative production build succeeded.

Only determine whether the supplied repair appears
to address the supplied failure.

Return ONLY:

{
  "valid": true,
  "issues": [],
  "remainingProblems": []
}

Do not invent runtime results.

`

        },

        {

          role:
            "user",

          content:
            safeJson(context)
              .slice(
                0,
                MAX_TOTAL_CONTEXT
              )

        }

      ],

      temperature:
        0.1,

      maxTokens:
        4500

    });


  if (
    !result ||
    result.success !== true
  ) {

    return {

      success:
        false,

      data: {

        valid:
          false,

        issues: [

          "Repair verification could not be completed."

        ],

        remainingProblems: [

          "AI verification did not return a valid result."

        ]

      },

      staticValidation,

      provider:
        result?.provider ||
        null,

      model:
        result?.model ||
        null

    };

  }


  const data =
    result.data ||
    {};


  return {

    success:
      true,

    data: {

      valid:
        data.valid === true,

      issues:
        Array.isArray(data.issues)
          ? data.issues
          : [],

      remainingProblems:
        Array.isArray(
          data.remainingProblems
        )
          ? data.remainingProblems
          : []

    },

    staticValidation,

    provider:
      result.provider ||
      null,

    model:
      result.model ||
      null

  };

}


/* =========================================================
   CHANGE DETECTION
   ---------------------------------------------------------
   Includes:
   - modified files
   - newly added files
========================================================= */

function getChangedFiles(
  originalFiles,
  repairedFiles
) {

  const originalMap =
    createFileMap(
      originalFiles
    );


  const changed = [];


  for (
    const file of
      repairedFiles
  ) {

    const original =
      originalMap.get(
        file.path
      );


    /*
     * New file.
     */

    if (!original) {

      changed.push({

        path:
          file.path,

        content:
          file.content

      });

      continue;

    }


    /*
     * Modified file.
     */

    if (
      original.content !==
      file.content
    ) {

      changed.push({

        path:
          file.path,

        content:
          file.content

      });

    }

  }


  return changed;

}


/* =========================================================
   BUILD FAILURE EVIDENCE MERGER
========================================================= */

function enrichReviewWithValidation(
  review,
  request
) {

  const merged = {

    ...review,

    issues: [
      ...(review.issues || [])
    ],

    repairTargets: [
      ...(review.repairTargets || [])
    ],

    relationships: [
      ...(review.relationships || [])
    ]

  };


  /*
   * Authoritative failure evidence.
   */

  const authoritative =
    extractAuthoritativeFailure(
      request
    );


  if (
    authoritative.available
  ) {

    merged.issues.unshift({

      file:
        authoritative.affectedFiles[0] ||
        request.errorFile ||
        null,

      line:
        null,

      severity:
        "critical",

      type:
        authoritative.failureCategory ||
        "build",

      problem:
        [
          authoritative.failureStage,
          authoritative.failureCategory,
          authoritative.buildCommand
            ? `build=${authoritative.buildCommand}`
            : "",
          authoritative.stderr
            ? `stderr=${authoritative.stderr}`
            : "",
          authoritative.errors.length
            ? safeJson(
                authoritative.errors
              )
            : ""
        ]
          .filter(Boolean)
          .join(" | "),

      evidence:
        "AuthoritativeBuildService failure context."

    });

  }


  /*
   * Direct build error.
   */

  if (
    request.buildError
  ) {

    merged.issues.unshift({

      file:
        request.errorFile ||
        null,

      line:
        request.errorLine,

      severity:
        "critical",

      type:
        "build",

      problem:
        request.buildError,

      evidence:
        "Reported by Master Agent build pipeline."

    });

  }


  /*
   * Static validation errors.
   */

  for (
    const error of
      request.validationErrors ||
      []
  ) {

    if (!error) {

      continue;

    }


    const target =
      normalizeFilePath(
        error.file ||
        error.path ||
        error.filePath
      );


    merged.issues.unshift({

      file:
        target,

      line:
        error.line ||
        null,

      severity:
        error.severity ||
        "critical",

      type:
        error.type ||
        "build",

      problem:
        cleanString(
          error.message ||
          error.problem ||
          safeJson(error),
          5000
        ),

      evidence:
        "Reported by BuildValidationService."

    });


    if (
      target &&
      !merged.repairTargets.includes(
        target
      )
    ) {

      merged.repairTargets.push(
        target
      );

    }

  }


  /*
   * Runtime evidence.
   */

  if (
    request.runtimeError
  ) {

    merged.issues.unshift({

      file:
        request.errorFile ||
        null,

      line:
        request.errorLine,

      severity:
        "critical",

      type:
        "runtime",

      problem:
        typeof request.runtimeError ===
          "string"
          ? request.runtimeError
          : safeJson(
              request.runtimeError
            ),

      evidence:
        "Reported runtime evidence."

    });

  }


  /*
   * Authoritative affected files are
   * first-class repair targets.
   */

  for (
    const target of
      authoritative.affectedFiles
  ) {

    if (
      !merged.repairTargets.includes(
        target
      )
    ) {

      merged.repairTargets.push(
        target
      );

    }

  }


  merged.repairTargets =
    Array.from(
      new Set(
        merged.repairTargets
          .map(
            normalizeFilePath
          )
          .filter(Boolean)
      )
    );


  return merged;

}


/* =========================================================
   MAIN FIX AGENT
========================================================= */

async function fixAgent(
  input = {}
) {

  let currentStage =
    "request-normalization";

  let request =
    null;


  try {

    logInfo(
      `ZyrionOS Fix Agent Started | version=${FIX_AGENT_VERSION}`
    );


    /* =====================================================
       NORMALIZE REQUEST
    ===================================================== */

    request =
      normalizeFixRequest(
        input
      );


    /* =====================================================
       NORMALIZE SOURCE
    ===================================================== */

    currentStage =
      "source-files-normalization";


    const normalizedInput =
      normalizeFiles(
        request.files
      );


    const projectFiles =
      normalizedInput.files;


    /* =====================================================
       REQUEST VALIDATION
    ===================================================== */

    if (
      !request.prompt &&
      !request.error &&
      !request.buildError &&
      !request.buildValidation &&
      !request.repairContext &&
      !request.runtimeError &&
      !request.testResult &&
      !request.buildResult
    ) {

      return {

        success:
          false,

        message:
          "Fix request or validation error required",

        error:
          "Fix Agent received no debugging request or validation evidence.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       SOURCE VALIDATION
    ===================================================== */

    if (
      projectFiles.length ===
      0
    ) {

      return {

        success:
          false,

        message:
          "Source files required",

        error:
          "Fix Agent cannot perform project-level repair without source files.",

        stage:
          "source-files-normalization"

      };

    }


    /* =====================================================
       INITIAL STATIC VALIDATION
    ===================================================== */

    currentStage =
      "source-structure-validation";


    const initialStaticValidation =
      await runStaticValidation(
        projectFiles,
        request
      );


    if (
      initialStaticValidation.available &&
      !initialStaticValidation.valid
    ) {

      request.error =
        [

          request.error,

          safeJson(
            initialStaticValidation.errors
          )

        ]
          .filter(Boolean)
          .join("\n")
          .slice(
            0,
            MAX_ERROR_LENGTH
          );

    }


    /* =====================================================
       PROJECT INVENTORY
    ===================================================== */

    currentStage =
      "project-inventory";


    const inventory =
      buildProjectInventory(
        projectFiles
      );


    const prioritizedFiles =
      prioritizeFiles(
        projectFiles,
        request
      );


    /* =====================================================
       PROJECT REVIEW
    ===================================================== */

    currentStage =
      "project-review";


    const reviewBatches =
      chunkFiles(
        prioritizedFiles,
        MAX_REVIEW_FILES_PER_BATCH
      );


    const reviewResults = [];


    for (
      let index = 0;
      index < reviewBatches.length;
      index++
    ) {

      const batch =
        reviewBatches[index];


      logInfo(
        `Fix Agent reviewing project batch ${index + 1}/${reviewBatches.length} (${batch.length} files)`
      );


      const batchResult =
        await reviewBatch(
          batch,
          request,
          index + 1,
          reviewBatches.length
        );


      reviewResults.push(
        batchResult
      );

    }


    let mergedReview =
      mergeReviewResults(
        reviewResults
      );


    /* =====================================================
       ENRICH WITH ALL FAILURE EVIDENCE
    ===================================================== */

    mergedReview =
      enrichReviewWithValidation(
        mergedReview,
        request
      );


    mergedReview =
      addAuthoritativeTargets(
        mergedReview,
        request,
        projectFiles
      );


    /*
     * User/direct error.
     */

    if (
      request.error
    ) {

      mergedReview.issues.unshift({

        file:
          request.errorFile ||
          null,

        line:
          request.errorLine,

        severity:
          "critical",

        type:
          "runtime",

        problem:
          request.error,

        evidence:
          "Reported by user or upstream validation."

      });

    }


    /* =====================================================
       REPAIR TARGET SELECTION
    ===================================================== */

    currentStage =
      "repair-target-selection";


    let repairFiles =
      selectRepairFiles(
        projectFiles,
        mergedReview,
        request
      );


    if (
      repairFiles.length ===
      0
    ) {

      repairFiles =
        prioritizedFiles.slice(
          0,
          Math.min(
            MAX_REPAIR_FILES,
            prioritizedFiles.length
          )
        );

    }


    const repairTargets =
      Array.from(
        new Set([
          ...(mergedReview.repairTargets || []),
          ...repairFiles.map(
            file =>
              file.path
          )
        ])
      )
      .filter(
        path =>
          normalizeFilePath(path)
      );


    const repairReview = {

      ...mergedReview,

      repairTargets

    };


    /* =====================================================
       REPAIR PASS
    ===================================================== */

    currentStage =
      "repair-pass";


    const repairResult =
      await repairProject(
        projectFiles,
        request,
        repairReview
      );


    if (
      !repairResult.success
    ) {

      return {

        success:
          false,

        message:
          "Fix Agent repair pass failed",

        error:
          "AI repair pass did not complete.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       VALIDATE AI OUTPUT
    ===================================================== */

    currentStage =
      "repair-output-validation";


    const rawReturnedFiles =
      repairResult.data?.files;


    const repairedOutput =
      validateReturnedFiles(
        rawReturnedFiles
      );


    if (
      repairedOutput.invalid >
      0
    ) {

      logWarning(
        `Fix Agent rejected ${repairedOutput.invalid} invalid repaired file(s)`
      );

    }


    if (
      repairedOutput.duplicates >
      0
    ) {

      logWarning(
        `Fix Agent rejected ${repairedOutput.duplicates} duplicate repaired file(s)`
      );

    }


    /*
     * Hard authorization boundary.
     */

    const filteredRepair =
      filterRepairOutput(
        projectFiles,
        repairedOutput.files,
        repairTargets
      );


    if (
      filteredRepair.rejected.length >
      0
    ) {

      logWarning(
        `Fix Agent rejected ${filteredRepair.rejected.length} unauthorized repaired file(s)`
      );

    }


    const safeRepairFiles =
      filteredRepair.files;


    /* =====================================================
       COVERAGE
    ===================================================== */

    const coverage =
      checkRepairCoverage(
        repairTargets,
        safeRepairFiles
      );


    if (
      !coverage.complete
    ) {

      logWarning(
        `Fix Agent repair output missing targets: ${coverage.missing.join(", ")}`
      );

    }


    /* =====================================================
       NO SAFE REPAIR
    ===================================================== */

    if (
      safeRepairFiles.length ===
      0
    ) {

      logInfo(
        "Fix Agent produced no safe complete-file repair."
      );


      return {

        success:
          true,

        data: {

          issues:
            mergedReview.issues,

          fixes:
            repairResult.data?.fixes ||
            [],

          rootCause:
            repairResult.data?.rootCause ||
            "",

          optimizedCode:
            repairResult.data?.optimizedCode ||
            "",

          files: []

        },

        metadata: {

          agent:
            "fixAgent",

          version:
            FIX_AGENT_VERSION,

          mode:
            request.mode,

          projectId:
            request.projectId ||
            null,

          projectName:
            request.projectName ||
            null,

          framework:
            request.framework ||
            null,

          sourceFiles:
            projectFiles.length,

          reviewedFiles:
            projectFiles.length,

          repairedFiles:
            0,

          repairApplied:
            false,

          verification:
            "not-run",

          repairCoverage:
            coverage,

          rejectedRepairs:
            filteredRepair.rejected,

          provider:
            repairResult.provider ||
            null,

          model:
            repairResult.model ||
            null,

          staticValidation:
            initialStaticValidation,

          authoritativeFailure:
            extractAuthoritativeFailure(
              request
            ),

          inventory

        }

      };

    }


    /* =====================================================
       APPLY FIRST REPAIR
    ===================================================== */

    currentStage =
      "repair-application";


    let repairedProject =
      applyRepairs(
        projectFiles,
        safeRepairFiles
      );


    /* =====================================================
       VERIFY FIRST REPAIR
    ===================================================== */

    currentStage =
      "repair-verification";


    let verification =
      await verifyRepair(
        repairedProject,
        request,
        {
          ...repairReview,

          repairTargets:
            safeRepairFiles.map(
              file =>
                file.path
            )
        }
      );


    /* =====================================================
       CONTROLLED SECOND REPAIR
    ===================================================== */

    let fixRound = 1;


    while (

      fixRound <
        Math.min(
          request.maxRepairRounds,
          MAX_FIX_ROUNDS
        ) &&

      verification.success &&

      verification.data?.valid ===
        false &&

      Array.isArray(
        verification.data?.remainingProblems
      ) &&

      verification.data.remainingProblems.length >
        0

    ) {

      fixRound++;


      logWarning(
        `Fix Agent starting repair round ${fixRound}/${request.maxRepairRounds}`
      );


      const followUpProblems =
        verification.data
          .remainingProblems
          .map(
            problem => ({

              severity:
                "high",

              type:
                "verification",

              problem:
                typeof problem ===
                  "string"
                  ? problem
                  : safeJson(problem),

              evidence:
                "Detected during post-repair verification."

            })
          );


      const followUpTargets =
        Array.from(
          new Set([
            ...(repairReview.repairTargets || []),

            ...safeRepairFiles.map(
              file =>
                file.path
            )
          ])
        );


      const followUpReview = {

        ...repairReview,

        issues: [

          ...(repairReview.issues || []),

          ...(verification.data?.issues || []),

          ...followUpProblems

        ],

        repairTargets:
          followUpTargets

      };


      const followUpRequest = {

        ...request,

        repairRound:
          fixRound,

        error:
          [

            request.error,

            safeJson(
              verification.data
            )

          ]
            .filter(Boolean)
            .join("\n")
            .slice(
              0,
              MAX_ERROR_LENGTH
            )

      };


      const secondRepair =
        await repairProject(
          repairedProject,
          followUpRequest,
          followUpReview
        );


      if (
        !secondRepair.success
      ) {

        verification = {

          success:
            false,

          data: {

            valid:
              false,

            issues: [
              "Second repair pass failed."
            ],

            remainingProblems: [
              "AI repair pass did not complete."
            ]

          },

          staticValidation:
            verification.staticValidation ||
            null

        };

        break;

      }


      const secondOutput =
        validateReturnedFiles(
          secondRepair.data?.files
        );


      const secondFiltered =
        filterRepairOutput(
          repairedProject,
          secondOutput.files,
          followUpTargets
        );


      if (
        secondOutput.invalid >
        0
      ) {

        logWarning(
          `Fix Agent rejected ${secondOutput.invalid} invalid file(s) during repair round ${fixRound}`
        );

      }


      if (
        secondOutput.duplicates >
        0
      ) {

        logWarning(
          `Fix Agent rejected ${secondOutput.duplicates} duplicate file(s) during repair round ${fixRound}`
        );

      }


      if (
        secondFiltered.rejected.length >
        0
      ) {

        logWarning(
          `Fix Agent rejected ${secondFiltered.rejected.length} unauthorized file(s) during repair round ${fixRound}`
        );

      }


      if (
        secondFiltered.files.length ===
        0
      ) {

        break;

      }


      repairedProject =
        applyRepairs(
          repairedProject,
          secondFiltered.files
        );


      verification =
        await verifyRepair(
          repairedProject,
          followUpRequest,
          followUpReview
        );

    }


    /* =====================================================
       FINAL STATIC VALIDATION
    ===================================================== */

    currentStage =
      "final-static-validation";


    const finalStaticValidation =
      await runStaticValidation(
        repairedProject,
        request
      );


    if (
      finalStaticValidation.available &&
      !finalStaticValidation.valid
    ) {

      verification = {

        ...verification,

        success:
          true,

        data: {

          ...(verification.data || {}),

          valid:
            false,

          issues: [

            ...(verification.data?.issues || []),

            ...finalStaticValidation.errors

          ],

          remainingProblems: [

            ...(verification.data?.remainingProblems || []),

            ...finalStaticValidation.errors

          ]

        },

        staticValidation:
          finalStaticValidation

      };

    }


    /* =====================================================
       FINAL CHANGED FILES
    ===================================================== */

    const finalChangedFiles =
      getChangedFiles(
        projectFiles,
        repairedProject
      );


    /* =====================================================
       FINAL VERIFICATION STATE
    ===================================================== */

    const verificationValid =
      verification.success === true &&
      verification.data?.valid === true;


    const finalVerificationStatus =
      verificationValid
        ? "passed"
        : verification.success
          ? "remaining_issues"
          : "verification_failed";


    /* =====================================================
       AUTHORITATIVE CONTRACT
       -----------------------------------------------------
       Fix Agent NEVER claims authoritative success.
    ===================================================== */

    const authoritativeFailure =
      extractAuthoritativeFailure(
        request
      );


    logInfo(
      `Fix Agent Completed: reviewed=${projectFiles.length} changed=${finalChangedFiles.length} verified=${verificationValid} rounds=${fixRound}`
    );


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        true,

      data: {

        issues:
          mergedReview.issues,

        fixes:
          repairResult.data?.fixes ||
          [],

        rootCause:
          repairResult.data?.rootCause ||
          "",

        optimizedCode:
          repairResult.data?.optimizedCode ||
          "",

        /*
         * Master receives ONLY files that actually
         * changed or were newly created.
         */

        files:
          finalChangedFiles

      },

      metadata: {

        agent:
          "fixAgent",

        version:
          FIX_AGENT_VERSION,

        mode:
          request.mode,

        projectId:
          request.projectId ||
          null,

        projectName:
          request.projectName ||
          null,

        framework:
          request.framework ||
          null,

        packageManager:
          request.packageManager ||
          null,

        sourceFiles:
          projectFiles.length,

        reviewedFiles:
          projectFiles.length,

        reviewBatches:
          reviewBatches.length,

        repairTargets,

        repairedFiles:
          finalChangedFiles.length,

        repairApplied:
          finalChangedFiles.length >
          0,

        repairCoverage:
          coverage,

        fixRounds:
          fixRound,

        verification:
          finalVerificationStatus,

        remainingProblems:
          verification.data
            ?.remainingProblems ||
          [],

        staticValidation:
          finalStaticValidation,

        initialStaticValidation,

        /*
         * Important:
         * Static validation may be authoritative
         * only if an external authoritative service
         * was supplied, but Fix Agent itself does
         * NOT execute it.
         */

        authoritative:
          false,

        authoritativeFailure,

        providers:
          mergedReview.providers,

        models:
          mergedReview.models,

        repairProvider:
          repairResult.provider ||
          null,

        repairModel:
          repairResult.model ||
          null,

        inventory

      }

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown Fix Agent error";


    logError(
      `Fix Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success:
        false,

      message:
        "Fix Agent Failed",

      error:
        errorMessage,

      stage:
        currentStage,

      projectId:
        request?.projectId ||
        null,

      metadata: {

        agent:
          "fixAgent",

        version:
          FIX_AGENT_VERSION,

        failureStage:
          currentStage

      }

    };

  }

}


/* =========================================================
   AGENT METADATA
========================================================= */

fixAgent.version =
  FIX_AGENT_VERSION;


fixAgent.agentName =
  "fixAgent";


fixAgent.capabilities = [

  "project_review",

  "root_cause_analysis",

  "build_error_analysis",

  "authoritative_build_failure_analysis",

  "runtime_error_analysis",

  "cross_file_analysis",

  "import_export_analysis",

  "dependency_analysis",

  "api_contract_analysis",

  "complete_file_repair",

  "new_file_repair",

  "static_validation",

  "post_repair_verification",

  "multi_round_repair"

];


fixAgent.contract = {

  returnsCompleteFiles:
    true,

  returnsChangedFilesOnly:
    true,

  supportsAddedFiles:
    true,

  directProviderAccess:
    false,

  directInfrastructureAccess:
    false,

  directDatabaseAccess:
    false,

  directSecretAccess:
    false,

  deploymentOwnership:
    false,

  authoritativeBuildExecution:
    false,

  validationService:
    "services/buildValidationService"

};


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  fixAgent;
