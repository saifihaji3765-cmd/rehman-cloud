/* =========================================================
   ZyrionOS FIX AGENT
   Production Project Review + Debugging + Multi-File Repair

   VERSION: 7.1.0

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Project-wide code review
   - Root-cause analysis
   - Build validation error analysis
   - Runtime error analysis
   - Cross-file dependency analysis
   - Import/export contract analysis
   - API contract analysis
   - Complete-file repair
   - Static post-repair validation
   - AI post-repair verification
   - Controlled multi-round repair

   ARCHITECTURE
   ---------------------------------------------------------

   Builder
      ↓
   Build Validation
      ↓
   Build Error
      ↓
   Fix Agent
      ↓
   Project Review
      ↓
   Root Cause
      ↓
   Repair
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
   - deploy infrastructure
   - modify AWS
   - modify Docker directly
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

} catch (error) {

  buildValidationService =
    null;

}


/* =========================================================
   VERSION
========================================================= */

const FIX_AGENT_VERSION =
  "7.1.0";


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
   ---------------------------------------------------------
   IMPORTANT:
   loggerService exposes warning(), not warn().
   These wrappers prevent the Fix Agent from crashing
   because of logger API differences.
========================================================= */

function logInfo(message) {

  if (
    logger &&
    typeof logger.info ===
      "function"
  ) {

    return logger.info(
      message
    );

  }

}


function logWarning(message) {

  if (
    logger &&
    typeof logger.warning ===
      "function"
  ) {

    return logger.warning(
      message
    );

  }

  /*
   * Backward compatibility for logger
   * implementations that still expose warn().
   */

  if (
    logger &&
    typeof logger.warn ===
      "function"
  ) {

    return logger.warn(
      message
    );

  }

  /*
   * Last-resort fallback.
   * Never allow logging itself to crash
   * the repair pipeline.
   */

  if (
    logger &&
    typeof logger.info ===
      "function"
  ) {

    return logger.info(
      `[WARNING] ${message}`
    );

  }

}


function logError(message) {

  if (
    logger &&
    typeof logger.error ===
      "function"
  ) {

    return logger.error(
      message
    );

  }

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
      .slice(
        0,
        100
      )
      .map(
        item =>
          sanitizeForContext(
            item,
            depth + 1
          )
      );

  }

  if (
    typeof value ===
    "object"
  ) {

    const output = {};

    for (
      const [
        key,
        item
      ] of Object.entries(
        value
      )
    ) {

      if (
        SECRET_KEYS.has(
          key
        )
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

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      sanitizeForContext(
        value
      )
    );

  } catch {

    return "{}";

  }

}


/* =========================================================
   PATH NORMALIZATION
========================================================= */

function normalizeFilePath(
  value
) {

  if (
    typeof value !==
    "string"
  ) {

    return null;

  }

  let filePath =
    value
      .trim()
      .replace(
        /\\/g,
        "/"
      );

  while (
    filePath.startsWith(
      "./"
    )
  ) {

    filePath =
      filePath.slice(
        2
      );

  }

  if (
    !filePath ||
    filePath.length >
      MAX_PATH_LENGTH
  ) {

    return null;

  }

  if (
    filePath.startsWith(
      "/"
    ) ||
    /^[A-Za-z]:\//.test(
      filePath
    )
  ) {

    return null;

  }

  if (
    filePath.includes(
      "\0"
    )
  ) {

    return null;

  }

  const parts =
    filePath.split(
      "/"
    );

  if (
    parts.includes(
      ".."
    )
  ) {

    return null;

  }

  return filePath;

}


/* =========================================================
   FILE CONTENT NORMALIZATION
========================================================= */

function normalizeFileContent(
  value
) {

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

function normalizeFiles(
  files
) {

  if (
    !Array.isArray(
      files
    )
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

  let invalidCount =
    0;

  let duplicateCount =
    0;

  let totalBytes =
    0;


  for (
    const file of files
  ) {

    if (
      !file ||
      typeof file !==
        "object"
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
        file.content !==
          undefined
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
      seen.has(
        filePath
      )
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

    seen.add(
      filePath
    );

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

function normalizeFixRequest(
  input
) {

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
    ].includes(
      requestedMode
    )
      ? "review_fix"
      : "automatic";


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
        Number(
          input.errorLine
        )
      )
        ? Number(
            input.errorLine
          )
        : null,

    errorFile:
      cleanString(
        input.errorFile ||
        input.file,
        MAX_PATH_LENGTH
      ),

    mode,

    files:
      Array.isArray(
        input.files
      )
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

    repairRound:
      Number.isFinite(
        Number(
          input.repairRound
        )
      )
        ? Number(
            input.repairRound
          )
        : 0,

    maxRepairRounds:
      Number.isFinite(
        Number(
          input.maxRepairRounds
        )
      )
        ? Math.min(
            Math.max(
              Number(
                input.maxRepairRounds
              ),
              1
            ),
            MAX_FIX_ROUNDS
          )
        : MAX_FIX_ROUNDS,

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

function createFileMap(
  files
) {

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

    if (
      exact
    ) {

      return exact;

    }

  }


  const errorText =
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
      )

    ]
      .join(
        "\n"
      )
      .toLowerCase();


  for (
    const file of files
  ) {

    if (
      errorText.includes(
        file.path.toLowerCase()
      )
    ) {

      return file;

    }

  }


  return null;

}


/* =========================================================
   FILE TYPE
========================================================= */

function getFileType(
  filePath
) {

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

function buildProjectInventory(
  files
) {

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
        !priority.includes(
          file
        )
      ) {

        priority.push(
          file
        );

      }

    };


  add(
    errorFile
  );


  for (
    const name of
      priorityNames
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

    add(
      file
    );

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

function buildFileContext(
  files
) {

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
   BUILD FAILURE CONTEXT
========================================================= */

function buildFailureContext(
  request
) {

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
   COMMON SYSTEM PROMPT
========================================================= */

function getCommonSystemPrompt() {

  return `

You are the Fix Agent of ZyrionOS.

You are a senior autonomous software debugging,
code-review and project-repair engineer.

Your responsibility is to identify the ROOT CAUSE
of a software failure and repair the smallest
coherent set of source files required to resolve it.

==================================================
CORE PRINCIPLE
==================================================

ERROR LINE != ROOT CAUSE.

A compiler/runtime/build error may originate from:

- incorrect import
- incorrect export
- default/named export mismatch
- wrong module path
- missing dependency
- incompatible dependency version
- circular dependency
- incorrect function contract
- incorrect component contract
- malformed generated source
- HTML-escaped JSX/TSX
- configuration mismatch
- incorrect framework structure
- wrong application entrypoint
- frontend/backend contract mismatch
- environment mismatch
- duplicate implementation
- incorrect build configuration

Always reason across related files.

==================================================
BUILD VALIDATION EVIDENCE
==================================================

If buildValidation is supplied:

Treat its errors as concrete validation evidence.

If validationErrors are supplied:

Treat them as concrete validation evidence.

If buildError is supplied:

Treat it as the immediate failure signal.

If runtimeError/runtimeLogs/testResult are supplied:

Use them as evidence only.

Never invent compiler output.

Never invent runtime output.

Never invent test results.

Never claim that code executed successfully
unless execution evidence is supplied.

==================================================
SOURCE REPAIR
==================================================

Preserve working functionality.

Make the smallest coherent repair.

Repair every directly affected file.

Keep imports and exports consistent.

Keep function signatures compatible.

Keep API contracts compatible.

Keep framework conventions consistent.

Do not introduce unnecessary dependencies.

Do not rewrite unrelated files.

Do not modify infrastructure.

Do not modify AWS.

Do not modify Docker deployment infrastructure.

Do not modify DNS.

Do not modify SSL.

==================================================
COMPLETE FILE CONTRACT
==================================================

Every repaired file MUST contain the COMPLETE file.

Never return:

- partial snippets
- diffs
- patch syntax
- "...rest of code..."
- omitted sections
- placeholder comments

If App.js is repaired, return complete App.js.

If a hook changes, return complete hook.

If an export changes, return complete exporting file.

If package.json changes, return complete package.json.

==================================================
SECURITY
==================================================

Never output:

- API keys
- passwords
- private keys
- access tokens
- cookies
- session secrets
- provider credentials

Use environment variables.

Never create:

- absolute filesystem paths
- ../ traversal
- arbitrary credential files

==================================================
HONESTY
==================================================

Only claim a file was reviewed if its content
was actually supplied.

Only claim a file was repaired if complete
corrected content is returned.

Never claim:

- deployment succeeded
- AWS changed
- Docker succeeded
- database migrated
- SSL activated
- production repaired

unless supplied evidence proves it.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Never return markdown.

Never use triple backticks.

Never put explanations outside JSON.

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

Analyze the supplied source files and
identify concrete or strongly supported
problems.

Pay special attention to:

- imports
- exports
- function contracts
- component contracts
- hooks
- services
- API calls
- dependencies
- entrypoints
- build configuration
- runtime configuration
- framework structure
- generated source
- malformed JSX/TSX
- HTML-escaped JSX/TSX
- package configuration

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
  "to": "src/hooks/todos.js",
  "relationship": "imports",
  "contract": "loadTodos"
}

repairTargets:

[
  "src/App.js",
  "src/hooks/todos.js"
]

Do not invent errors.

`

        },

        {

          role:
            "user",

          content:
            safeJson(
              context
            )

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

function mergeReviewResults(
  results
) {

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
      Array.isArray(
        data.issues
      )
    ) {

      issues.push(
        ...data.issues
      );

    }


    if (
      Array.isArray(
        data.relationships
      )
    ) {

      relationships.push(
        ...data.relationships
      );

    }


    if (
      Array.isArray(
        data.repairTargets
      )
    ) {

      for (
        const target of
          data.repairTargets
      ) {

        if (
          typeof target ===
          "string"
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

    }


    if (
      result.provider
    ) {

      providers.push(
        result.provider
      );

    }


    if (
      result.model
    ) {

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
        new Set(
          providers
        )
      ),

    models:
      Array.from(
        new Set(
          models
        )
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
    createFileMap(
      files
    );

  const selected = [];


  const add =
    file => {

      if (
        file &&
        !selected.includes(
          file
        )
      ) {

        selected.push(
          file
        );

      }

    };


  /*
   * 1. Direct error file.
   */

  add(
    findErrorFile(
      files,
      request
    )
  );


  /*
   * 2. Explicit AI targets.
   */

  for (
    const path of
      review.repairTargets ||
      []
  ) {

    add(
      map.get(
        normalizeFilePath(
          path
        )
      )
    );

  }


  /*
   * 3. Files named in issues.
   */

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


  /*
   * 4. Related files.
   */

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

    tests:
      sanitizeForContext(
        request.tests
      ),

    memoryContext:
      sanitizeForContext(
        request.memoryContext
      ),

    repairRound:
      request.repairRound,

    maxRepairRounds:
      request.maxRepairRounds,

    failureEvidence:
      buildFailureContext(
        request
      ),

    review:
      sanitizeForContext(
        review
      ),

    sourceFiles:
      buildFileContext(
        repairFiles
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
REPAIR PASS

The project was reviewed before this pass.

Use review findings and validation evidence
as debugging evidence.

Determine:

1. Root cause.
2. Directly affected files.
3. Smallest coherent repair.
4. Cross-file contract changes if required.
5. Complete corrected file contents.

Ensure:

- imports match exports
- named/default imports match
- function signatures match
- API contracts remain coherent
- generated source is valid
- package dependencies are consistent
- framework structure remains valid
- reported build/runtime failure is addressed

IMPORTANT:

If build validation specifically reports malformed
or HTML-escaped source, repair the source itself.
Do NOT merely describe the problem.

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

CRITICAL:

Do not return partial code.

Do not return diffs.

Do not return placeholders.

Do not return unchanged files unless explicitly
required to make the repair coherent.

`

        },

        {

          role:
            "user",

          content:
            safeJson(
              repairContext
            ).slice(
              0,
              MAX_TOTAL_CONTEXT
            )

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

function validateReturnedFiles(
  files
) {

  const normalized =
    normalizeFiles(
      files
    );


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
  repairFiles,
  returnedFiles,
  review
) {

  const returned =
    new Set(
      returnedFiles.map(
        file =>
          file.path
      )
    );


  const explicitTargets =
    new Set(
      (
        review.repairTargets ||
        []
      )
        .map(
          normalizeFilePath
        )
        .filter(Boolean)
    );


  const missing = [];


  for (
    const target of
      explicitTargets
  ) {

    if (
      !returned.has(
        target
      )
    ) {

      missing.push(
        target
      );

    }

  }


  return {

    complete:
      missing.length ===
      0,

    missing

  };

}


/* =========================================================
   APPLY REPAIRS
========================================================= */

function applyRepairs(
  originalFiles,
  repairedFiles
) {

  const result =
    originalFiles.map(
      file => ({
        ...file
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
      indexMap.has(
        path
      )
    ) {

      const index =
        indexMap.get(
          path
        );


      result[index] = {

        path,

        content

      };

    }

  }


  return result;

}


/* =========================================================
   STATIC REPAIR VALIDATION
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

    const result =
      await Promise.resolve(
        buildValidationService.validateProject({

          projectId:
            request.projectId,

          projectName:
            request.projectName,

          framework:
            request.framework,

          files

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


    const valid =
      result?.valid === true;


    return {

      available:
        true,

      valid,

      authoritative:
        result?.authoritative ===
        true,

      validationMode:
        result?.validationMode ||
        result?.mode ||
        "static",

      errors,

      warnings,

      sourceHash:
        result?.sourceHash ||
        null,

      result

    };

  } catch (
    error
  ) {

    return {

      available:
        true,

      valid:
        false,

      authoritative:
        false,

      validationMode:
        "static",

      errors: [

        {

          type:
            "validator_exception",

          message:
            cleanString(
              error.message,
              5000
            )

        }

      ],

      warnings: [],

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

  if (
    !validation
  ) {

    return "";

  }


  return safeJson({

    available:
      validation.available,

    valid:
      validation.valid,

    authoritative:
      validation.authoritative,

    validationMode:
      validation.validationMode,

    sourceHash:
      validation.sourceHash,

    errors:
      validation.errors,

    warnings:
      validation.warnings

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

      {

        ...review,

        repairTargets:
          review.repairTargets ||
          []

      },

      request

    );


  /*
   * First run static validation.
   */

  const staticValidation =
    await runStaticValidation(

      repairedFiles,

      request

    );


  /*
   * Static validation failure is a hard
   * verification failure.
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


  /*
   * If no files need AI verification,
   * static validation is enough for this layer.
   */

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

Inspect the repaired source and determine
whether the reported problem is resolved.

Check:

- import/export compatibility
- function signatures
- referenced symbols
- obvious syntax errors
- obvious runtime errors
- dependency usage
- framework conventions
- configuration consistency
- build-validation evidence

Return ONLY:

{
  "valid": true,
  "issues": [],
  "remainingProblems": []
}

Do not invent runtime results.

Only report problems supported by supplied
source or validation evidence.

`

        },

        {

          role:
            "user",

          content:
            safeJson(
              context
            ).slice(
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

          "AI verification did not return a valid verification result."

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


  const verificationData =
    result.data || {};


  return {

    success:
      true,

    data: {

      valid:
        verificationData.valid ===
        true,

      issues:
        Array.isArray(
          verificationData.issues
        )
          ? verificationData.issues
          : [],

      remainingProblems:
        Array.isArray(
          verificationData.remainingProblems
        )
          ? verificationData.remainingProblems
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
========================================================= */

function getChangedFiles(
  originalFiles,
  repairedFiles
) {

  const originalMap =
    createFileMap(
      originalFiles
    );


  return repairedFiles.filter(
    file => {

      const original =
        originalMap.get(
          file.path
        );


      return Boolean(
        original &&
        original.content !==
          file.content
      );

    }
  );

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
        "Reported by Master Agent build validation pipeline."

    });

  }


  /*
   * Validation errors.
   */

  for (
    const error of
      request.validationErrors ||
      []
  ) {

    if (
      !error
    ) {

      continue;

    }


    merged.issues.unshift({

      file:
        error.file ||
        error.path ||
        null,

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
          safeJson(
            error
          ),
          5000
        ),

      evidence:
        "Reported by build validation service."

    });


    const target =
      normalizeFilePath(
        error.file ||
        error.path
      );


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
   * Runtime error.
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
        "Reported by runtime execution evidence."

    });

  }


  /*
   * De-duplicate repair targets.
   */

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
      "ZyrionOS Fix Agent Started"
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
      !request.runtimeError &&
      !request.testResult
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
          true,

        data: {

          issues: [

            {

              severity:
                "high",

              type:
                "missing-source",

              problem:
                "Project source files were not provided, so a real code repair cannot be verified.",

              evidence:
                "No project files were supplied to the Fix Agent."

            }

          ],

          fixes: [

            "Provide the complete project files for project-level analysis and complete-file repair."

          ],

          rootCause:
            "Source code unavailable for inspection.",

          optimizedCode:
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

          sourceFiles:
            0,

          repairedFiles:
            0,

          repairApplied:
            false,

          verification:
            "not-run",

          authoritative:
            false

        }

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


    /*
     * Validation output becomes explicit debugging
     * evidence for the AI.
     */

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
          .join(
            "\n"
          )
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
      index <
        reviewBatches.length;
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
       ENRICH WITH MASTER VALIDATION EVIDENCE
    ===================================================== */

    mergedReview =
      enrichReviewWithValidation(

        mergedReview,

        request

      );


    /*
     * User-provided explicit error.
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


    /*
     * If no target was explicitly identified,
     * use highest-priority files as review context.
     *
     * This is NOT permission to rewrite every file.
     */

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
      mergedReview.repairTargets.length >
      0
        ? mergedReview.repairTargets
        : repairFiles.map(
            file =>
              file.path
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


    const repairedOutput =
      validateReturnedFiles(

        repairResult.data?.files

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


    /* =====================================================
       CHECK REPAIR COVERAGE
    ===================================================== */

    const coverage =
      checkRepairCoverage(

        repairFiles,

        repairedOutput.files,

        repairReview

      );


    if (
      !coverage.complete
    ) {

      logWarning(

        `Fix Agent repair output missing explicit targets: ${coverage.missing.join(", ")}`

      );

    }


    /* =====================================================
       NO REPAIR
    ===================================================== */

    if (
      repairedOutput.files.length ===
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
            "not-required",

          repairCoverage:
            coverage,

          provider:
            repairResult.provider ||
            null,

          model:
            repairResult.model ||
            null,

          staticValidation:
            initialStaticValidation,

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

        repairedOutput.files

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
            repairedOutput.files.map(
              file =>
                file.path
            )

        }

      );


    /* =====================================================
       CONTROLLED SECOND REPAIR ROUND
    ===================================================== */

    let fixRound =
      1;


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
                  : safeJson(
                      problem
                    ),

              evidence:
                "Detected during post-repair verification."

            })
          );


      const followUpReview = {

        ...repairReview,

        issues: [

          ...(repairReview.issues ||
            []),

          ...(verification.data.issues ||
            []),

          ...followUpProblems

        ],

        repairTargets:
          Array.from(
            new Set([
              ...(repairReview.repairTargets ||
                []),

              ...repairedOutput.files.map(
                file =>
                  file.path
              )

            ])
          )

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
            .join(
              "\n"
            )
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


      const secondOutput =
        validateReturnedFiles(

          secondRepair.data?.files

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
        secondOutput.files.length ===
        0
      ) {

        break;

      }


      repairedProject =
        applyRepairs(

          repairedProject,

          secondOutput.files

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


    /*
     * Hard static errors prevent verified=true.
     */

    if (
      finalStaticValidation.available &&
      !finalStaticValidation.valid
    ) {

      verification = {

        ...verification,

        success:
          true,

        data: {

          ...(verification.data ||
            {}),

          valid:
            false,

          issues: [

            ...(verification.data?.issues ||
              []),

            ...finalStaticValidation.errors

          ],

          remainingProblems: [

            ...(verification.data?.remainingProblems ||
              []),

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
      verification.success ===
        true &&
      verification.data?.valid ===
        true;


    const finalVerificationStatus =
      verificationValid
        ? "passed"
        : verification.success
          ? "remaining_issues"
          : "verification_failed";


    /* =====================================================
       FINAL LOG
    ===================================================== */

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
         * Master Agent expects data.files.
         *
         * Only files that actually changed
         * are returned.
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

        authoritative:
          finalStaticValidation
            ?.authoritative ===
          true,

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

  catch (
    error
  ) {

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

  "runtime_error_analysis",

  "cross_file_analysis",

  "import_export_analysis",

  "dependency_analysis",

  "api_contract_analysis",

  "complete_file_repair",

  "static_validation",

  "post_repair_verification",

  "multi_round_repair"

];


fixAgent.contract = {

  returnsCompleteFiles:
    true,

  returnsChangedFilesOnly:
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
