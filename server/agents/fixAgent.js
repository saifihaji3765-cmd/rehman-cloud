/* =========================================================
   ZyrionOS FIX AGENT
   Production Project Review + Debugging + Multi-File Repair

   MODES:

   1. AUTOMATIC REPAIR
      Builder/Test/Runtime
          ↓
      Error
          ↓
      Fix Agent
          ↓
      Project-wide analysis
          ↓
      Root-cause detection
          ↓
      Related-file analysis
          ↓
      Complete file replacement
          ↓
      Validation

   2. USER REVIEW & FIX
      User
        ↓
      Review/Fix button
        ↓
      User code + error/request
        ↓
      Full project analysis
        ↓
      Root-cause analysis
        ↓
      Complete corrected files
        ↓
      Replacement response

   IMPORTANT:

   - Never claims unseen files were reviewed.
   - Never treats one error line as the whole problem.
   - Reviews cross-file imports/exports.
   - Reviews function contracts.
   - Reviews frontend/backend interfaces.
   - Reviews package dependencies when package.json exists.
   - Returns COMPLETE corrected file content.
   - Never returns partial replacement files.
   - Never invents successful deployment/runtime state.
   - Never modifies infrastructure directly.
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

const MAX_FILES =
  200;


const MAX_PATH_LENGTH =
  300;


const MAX_FILE_SIZE =
  250000;


const MAX_PROMPT_LENGTH =
  12000;


const MAX_ERROR_LENGTH =
  12000;


const MAX_FILE_CONTEXT =
  14000;


const MAX_TOTAL_CONTEXT =
  60000;


const MAX_REVIEW_FILES_PER_BATCH =
  8;


const MAX_REVIEW_TOKENS =
  6000;


const MAX_REPAIR_TOKENS =
  12000;


const MAX_REPAIR_FILES =
  40;


const MAX_FIX_ROUNDS =
  2;


/* =========================================================
   HELPERS
========================================================= */


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

    return "{}";

  }

}


/* =========================================================
   NORMALIZE PATH
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
    /^[A-Za-z]:\//.test(
      filePath
    )
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
   NORMALIZE CONTENT
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
   NORMALIZE FILES
========================================================= */

function normalizeFiles(
  files
) {

  if (
    !Array.isArray(files)
  ) {

    return {

      files: [],

      invalidCount:
        0,

      duplicateCount:
        0

    };

  }


  const normalized =
    [];


  const seen =
    new Set();


  let invalidCount =
    0;


  let duplicateCount =
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
        file.name
      );


    const content =
      normalizeFileContent(
        file.content
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


    seen.add(
      filePath
    );


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

    duplicateCount

  };

}


/* =========================================================
   NORMALIZE REQUEST
========================================================= */

function normalizeFixRequest(
  input
) {

  if (
    typeof input ===
    "string"
  ) {

    return {

      prompt:
        cleanString(
          input,
          MAX_PROMPT_LENGTH
        ),

      error:
        "",

      errorLine:
        null,

      errorFile:
        "",

      mode:
        "automatic",

      files:
        [],

      projectId:
        "",

      framework:
        "",

      planning:
        null,

      architecture:
        null,

      intent:
        null,

      manifest:
        null,

      tests:
        null,

      review:
        null,

      memoryContext:
        null,

      user:
        {}

    };

  }


  if (
    !input ||
    typeof input !==
      "object"
  ) {

    return {

      prompt:
        "",

      error:
        "",

      errorLine:
        null,

      errorFile:
        "",

      mode:
        "automatic",

      files:
        [],

      projectId:
        "",

      framework:
        "",

      planning:
        null,

      architecture:
        null,

      intent:
        null,

      manifest:
        null,

      tests:
        null,

      review:
        null,

      memoryContext:
        null,

      user:
        {}

    };

  }


  const requestedMode =
    cleanString(
      input.mode,
      50
    )
      .toLowerCase();


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

    user:
      input.user ||
      {}

  };

}


/* =========================================================
   FILE LOOKUP
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
   FIND ERROR FILE
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
        (file) =>
          file.path ===
          request.errorFile
      );


    if (
      exact
    ) {

      return exact;

    }

  }


  const error =
    request.error
      .toLowerCase();


  for (
    const file of files
  ) {

    const fileName =
      file.path
        .toLowerCase();


    if (
      error.includes(
        fileName
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
    lower.endsWith(
      ".tsx"
    ) ||
    lower.endsWith(
      ".ts"
    )
  ) {

    return "typescript";

  }


  if (
    lower.endsWith(
      ".jsx"
    ) ||
    lower.endsWith(
      ".js"
    )
  ) {

    return "javascript";

  }


  if (
    lower.endsWith(
      ".json"
    )
  ) {

    return "json";

  }


  if (
    lower.endsWith(
      ".css"
    ) ||
    lower.endsWith(
      ".scss"
    )
  ) {

    return "style";

  }


  if (
    lower.endsWith(
      ".html"
    )
  ) {

    return "html";

  }


  if (
    lower.endsWith(
      ".py"
    )
  ) {

    return "python";

  }


  return "other";

}


/* =========================================================
   PROJECT FILE SUMMARY
========================================================= */

function buildProjectInventory(
  files
) {

  const inventory =
    files.map(
      (file) => ({

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


  return inventory;

}


/* =========================================================
   IMPORTANT PROJECT FILES
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

    "vite.config.js",

    "vite.config.ts",

    "next.config.js",

    "next.config.mjs",

    "tsconfig.json",

    "src/main.jsx",

    "src/main.js",

    "src/index.jsx",

    "src/index.js",

    "src/App.jsx",

    "src/App.js",

    "app/layout.tsx",

    "app/page.tsx"

  ];


  const priority =
    [];


  if (
    errorFile
  ) {

    priority.push(
      errorFile
    );

  }


  for (
    const name of
      priorityNames
  ) {

    const found =
      files.find(
        (file) =>
          file.path ===
          name
      );


    if (
      found &&
      !priority.includes(
        found
      )
    ) {

      priority.push(
        found
      );

    }

  }


  for (
    const file of files
  ) {

    if (
      !priority.includes(
        file
      )
    ) {

      priority.push(
        file
      );

    }

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

  const chunks =
    [];


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

  return files
    .map(
      (file) => {

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
   BUILD PROJECT CONTEXT
========================================================= */

function buildProjectContext(
  files
) {

  return {

    fileCount:
      files.length,

    inventory:
      buildProjectInventory(
        files
      ),

    files:
      buildFileContext(
        files
      )

  };

}


/* =========================================================
   BUILD COMMON SYSTEM PROMPT
========================================================= */

function getCommonSystemPrompt() {

  return `

You are the Fix Agent of ZyrionOS.

You are a senior autonomous software
debugging, code-review and repair engineer.

Your job is NOT merely to answer an error.

Your job is to determine the ROOT CAUSE.

A runtime error such as:

"loadTodos is not a function"

may originate from:

- incorrect export
- incorrect import
- default/named export mismatch
- wrong module path
- circular dependency
- stale generated file
- incompatible function contract
- duplicate implementation
- wrong hook/service interface
- incorrect project bootstrap
- incompatible framework structure

Therefore ALWAYS reason across related files.

CORE RULE:

ERROR LINE != ROOT CAUSE.

You must inspect the project structure
and interfaces before proposing a repair.

==================================================
PROJECT-WIDE REVIEW
==================================================

When project files are provided:

1. Review the project inventory.
2. Review package/runtime configuration.
3. Review entrypoints.
4. Review the reported error location.
5. Trace imports and exports.
6. Trace function contracts.
7. Trace component/service/hook relationships.
8. Check frontend/backend API contracts when relevant.
9. Check package dependencies when package.json
   is provided.
10. Check generated code consistency.
11. Check duplicate implementations.
12. Check obvious syntax/runtime problems.
13. Check configuration mismatches.
14. Check whether the reported error is caused
    by another file.

Never assume the error line is the root cause.

==================================================
REPAIR RULES
==================================================

When source code is provided:

- preserve working functionality
- make the smallest coherent repair
- repair every directly affected file
- keep imports and exports consistent
- keep function signatures compatible
- keep routes/API contracts compatible
- keep framework conventions consistent
- do not introduce unnecessary dependencies
- do not rewrite unrelated files
- do not invent infrastructure state

IMPORTANT:

Every returned repaired file MUST contain
the COMPLETE file.

Never return:

- partial snippets
- diff blocks
- "...rest of code..."
- placeholder comments
- omitted sections

If App.js is repaired, return the complete App.js.

If a hook must also change, return the complete hook.

If an export must change, return the complete exporting file.

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

Use environment variables for secrets.

Never create:

- absolute filesystem paths
- ../ path traversal
- arbitrary credential files

==================================================
HONESTY
==================================================

Only claim that a file was analyzed if its
content was actually provided.

Only claim that a file was repaired if the
complete corrected file is returned.

Never claim:

- deployed successfully
- AWS updated
- database migrated
- SSL active
- production fixed

unless that operation actually happened
outside this AI response.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Never use markdown.

Never use triple backticks.

Use the requested schema exactly.

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

    errorFile:
      request.errorFile,

    errorLine:
      request.errorLine,

    framework:
      request.framework,

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

You are currently performing PROJECT REVIEW.

Do NOT generate repaired files yet.

Analyze the supplied project files and
identify concrete or strongly supported
problems.

Pay special attention to:

- imports
- exports
- function contracts
- component contracts
- hook contracts
- service contracts
- API calls
- package dependencies
- entrypoints
- runtime configuration
- frontend errors
- backend errors
- generated-code inconsistencies

Return:

{
  "issues": [],
  "relationships": [],
  "repairTargets": []
}

issues format:

{
  "file": "src/example.js",
  "line": 18,
  "severity": "critical|high|medium|low",
  "type": "import|export|runtime|syntax|dependency|api|logic|config|other",
  "problem": "short concrete explanation",
  "evidence": "specific evidence from supplied code"
}

relationships format:

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
      result.data || {},

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

  const issues =
    [];


  const relationships =
    [];


  const repairTargets =
    new Set();


  const providers =
    [];


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

          repairTargets.add(
            target
          );

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


  const selected =
    [];


  const add =
    (file) => {

      if (
        !file ||
        selected.includes(
          file
        )
      ) {

        return;

      }


      selected.push(
        file
      );

    };


  /*
   * Explicit error file first.
   */

  add(
    findErrorFile(
      files,
      request
    )
  );


  /*
   * AI-detected repair targets.
   */

  for (
    const path of
      review.repairTargets ||
      []
  ) {

    add(
      map.get(
        path
      )
    );

  }


  /*
   * Files named in issues.
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
          issue.file
        )
      );

    }

  }


  /*
   * Related files from relationships.
   */

  for (
    const relationship of
      review.relationships ||
      []
  ) {

    add(
      map.get(
        relationship.from
      )
    );


    add(
      map.get(
        relationship.to
      )
    );

  }


  return selected
    .slice(
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
          review.issues,

        fixes: [],

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

    errorFile:
      request.errorFile,

    errorLine:
      request.errorLine,

    framework:
      request.framework,

    planning:
      request.planning,

    architecture:
      request.architecture,

    intent:
      request.intent,

    manifest:
      request.manifest,

    tests:
      request.tests,

    review:
      review,

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

You are now performing the REPAIR PASS.

The project was reviewed before this pass.

Use the review findings as evidence.

Your task:

1. Determine the root cause.
2. Determine every file directly affected.
3. Repair the smallest coherent set of files.
4. Preserve unrelated functionality.
5. Ensure imports/exports match.
6. Ensure function contracts match.
7. Ensure generated files work together.
8. Ensure the reported error is addressed.
9. Return COMPLETE corrected files.

If the user's request is a REVIEW & FIX request,
the returned files are intended to be complete
replacement files for the affected files.

For each repaired file return its COMPLETE content.

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

Do not return unchanged files unless needed
to make the repair explicit.

`

        },

        {

          role:
            "user",

          content:
            safeJson(
              repairContext
            )
              .slice(
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
      result.data || {},

    provider:
      result.provider ||
      null,

    model:
      result.model ||
      null

  };

}


/* =========================================================
   VALIDATE AI FILE OUTPUT
========================================================= */

function validateReturnedFiles(
  files
) {

  const normalized =
    normalizeFiles(
      files
    );


  const invalid =
    normalized.invalidCount;


  const duplicates =
    normalized.duplicateCount;


  return {

    files:
      normalized.files,

    invalid,

    duplicates

  };

}


/* =========================================================
   CHECK FILE COVERAGE
========================================================= */

function checkRepairCoverage(
  repairFiles,
  returnedFiles,
  review
) {

  const returned =
    new Set(
      returnedFiles.map(
        (file) =>
          file.path
      )
    );


  const targets =
    new Set();


  for (
    const file of
      repairFiles
  ) {

    targets.add(
      file.path
    );

  }


  for (
    const path of
      review.repairTargets ||
      []
  ) {

    targets.add(
      path
    );

  }


  const missing =
    [];


  for (
    const path of
      targets
  ) {

    if (
      !returned.has(
        path
      )
    ) {

      /*
       * Only report a missing file if
       * the AI explicitly targeted it.
       */

      if (
        review.repairTargets?.includes(
          path
        )
      ) {

        missing.push(
          path
        );

      }

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
   APPLY REPAIRS TO PROJECT COPY
========================================================= */

function applyRepairs(
  originalFiles,
  repairedFiles
) {

  const result =
    originalFiles.map(
      (file) => ({
        ...file
      })
    );


  const indexMap =
    new Map();


  result.forEach(
    (file, index) => {

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

    if (
      indexMap.has(
        repaired.path
      )
    ) {

      const index =
        indexMap.get(
          repaired.path
        );


      result[index] = {

        path:
          repaired.path,

        content:
          repaired.content

      };

    }

  }


  return result;

}


/* =========================================================
   SECOND REVIEW
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

        issues: []

      },

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

    errorFile:
      request.errorFile,

    errorLine:
      request.errorLine,

    framework:
      request.framework,

    originalReview:
      review,

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

This is the FINAL REPAIR VERIFICATION PASS.

Do NOT generate replacement files.

Inspect the repaired files and determine
whether the original problem is resolved.

Check:

- import/export compatibility
- function signatures
- referenced symbols
- obvious runtime errors
- obvious syntax errors
- obvious dependency issues
- consistency with the reported error

Return ONLY:

{
  "valid": true,
  "issues": [],
  "remainingProblems": []
}

Do not invent runtime results.

Only report problems supported by the
provided code.

`

        },

        {

          role:
            "user",

          content:
            safeJson(
              context
            )
              .slice(
                0,
                MAX_TOTAL_CONTEXT
              )

        }

      ],

      temperature:
        0.1,

      maxTokens:
        4000

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

        remainingProblems:
          []

      },

      provider:
        result?.provider ||
        null,

      model:
        result?.model ||
        null

    };

  }


  return {

    success:
      true,

    data:
      result.data || {

        valid:
          false,

        issues:
          [],

        remainingProblems:
          []

      },

    provider:
      result.provider ||
      null,

    model:
      result.model ||
      null

  };

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

    logger.info(
      "🔧 ZyrionOS Fix Agent Started"
    );


    /* =====================================================
       NORMALIZE REQUEST
    ===================================================== */

    request =
      normalizeFixRequest(
        input
      );


    /* =====================================================
       NORMALIZE SOURCE FILES
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
       VALIDATION
    ===================================================== */

    if (
      !request.prompt &&
      !request.error
    ) {

      return {

        success:
          false,

        message:
          "Fix request or error required",

        error:
          "Fix Agent received neither a debugging request nor an error.",

        stage:
          currentStage

      };

    }


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

          mode:
            request.mode,

          sourceFiles:
            0,

          repairedFiles:
            0,

          repairApplied:
            false,

          verification:
            "not-run"

        }

      };

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
       REVIEW PHASE
    ===================================================== */

    currentStage =
      "project-review";


    /*
     * Large projects are reviewed in batches.
     *
     * This prevents the entire repository
     * from being stuffed into one huge AI prompt.
     */

    const reviewBatches =
      chunkFiles(

        prioritizedFiles,

        MAX_REVIEW_FILES_PER_BATCH

      );


    const reviewResults =
      [];


    for (
      let index = 0;
      index <
        reviewBatches.length;
      index++
    ) {

      const batch =
        reviewBatches[index];


      logger.info(

        `🔍 Fix Agent reviewing project batch ${index + 1}/${reviewBatches.length} (${batch.length} files)`

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


    const mergedReview =
      mergeReviewResults(
        reviewResults
      );


    /* =====================================================
       ADD DIRECT ERROR INFORMATION
    ===================================================== */

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
          "Reported directly by runtime/user."

      });

    }


    /* =====================================================
       SELECT REPAIR TARGETS
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
     * If AI did not identify explicit targets,
     * use the error file first and then the
     * highest-priority project files.
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


    /* =====================================================
       REPAIR PASS
    ===================================================== */

    currentStage =
      "repair-pass";


    const repairResult =
      await repairProject(

        projectFiles,

        request,

        {

          ...mergedReview,

          repairTargets:
            repairFiles.map(
              (file) =>
                file.path
            )

        }

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
       NORMALIZE REPAIRED FILES
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

      logger.warn(

        `Fix Agent rejected ${repairedOutput.invalid} invalid repaired file(s)`

      );

    }


    /* =====================================================
       NO REPAIR
    ===================================================== */

    if (
      repairedOutput.files.length ===
      0
    ) {

      logger.info(
        "🔧 Fix Agent found no safe complete-file repair to apply"
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

          files:
            []

        },

        metadata: {

          agent:
            "fixAgent",

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

          provider:
            repairResult.provider ||
            null,

          model:
            repairResult.model ||
            null,

          inventory

        }

      };

    }


    /* =====================================================
       APPLY REPAIRS TO IN-MEMORY PROJECT
    ===================================================== */

    currentStage =
      "repair-application";


    let repairedProject =
      applyRepairs(

        projectFiles,

        repairedOutput.files

      );


    /* =====================================================
       REPAIR VERIFICATION
    ===================================================== */

    currentStage =
      "repair-verification";


    let verification =
      await verifyRepair(

        repairedProject,

        request,

        {

          ...mergedReview,

          repairTargets:
            repairedOutput.files.map(
              (file) =>
                file.path
            )

        }

      );


    /* =====================================================
       OPTIONAL SECOND REPAIR ROUND
    ===================================================== */

    let fixRound =
      1;


    while (

      fixRound <
        MAX_FIX_ROUNDS &&

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


      logger.warn(

        `🔧 Fix Agent starting repair round ${fixRound}/${MAX_FIX_ROUNDS}`

      );


      const followUpReview = {

        ...mergedReview,

        issues: [

          ...(mergedReview.issues || []),

          ...(verification.data.issues || []),

          ...(verification.data.remainingProblems || [])
            .map(
              (problem) => ({

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
            )

        ],

        repairTargets:
          repairedOutput.files.map(
            (file) =>
              file.path
          )

      };


      const secondRepair =
        await repairProject(

          repairedProject,

          request,

          followUpReview

        );


      const secondOutput =
        validateReturnedFiles(

          secondRepair.data?.files

        );


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

          request,

          followUpReview

        );

    }


    /* =====================================================
       FINAL REPAIRED FILES
    ===================================================== */

    const finalChangedFiles =
      repairedProject.filter(
        (file) => {

          const original =
            projectFiles.find(
              (source) =>
                source.path ===
                file.path
            );


          return (
            original &&
            original.content !==
              file.content
          );

        }
      );


    /* =====================================================
       FINAL RESULT
    ===================================================== */

    const finalIssues =
      Array.isArray(
        mergedReview.issues
      )
        ? mergedReview.issues
        : [];


    const finalFixes =
      Array.isArray(
        repairResult.data?.fixes
      )
        ? repairResult.data.fixes
        : [];


    const verificationValid =
      verification.success &&
      verification.data?.valid ===
        true;


    logger.success(

      `🔧 Fix Agent Completed: reviewed=${projectFiles.length} files | changed=${finalChangedFiles.length} files | verified=${verificationValid}`

    );


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        true,

      data: {

        issues:
          finalIssues,

        fixes:
          finalFixes,

        rootCause:
          repairResult.data?.rootCause ||
          "",

        optimizedCode:
          repairResult.data?.optimizedCode ||
          "",

        files:
          finalChangedFiles

      },

      metadata: {

        agent:
          "fixAgent",

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

        reviewBatches:
          reviewBatches.length,

        repairTargets:
          repairFiles.map(
            (file) =>
              file.path
          ),

        repairedFiles:
          finalChangedFiles.length,

        repairApplied:
          finalChangedFiles.length >
          0,

        fixRounds:
          fixRound,

        verification:
          verificationValid
            ? "passed"
            : verification.success
              ? "remaining_issues"
              : "verification_failed",

        remainingProblems:
          verification.data?.remainingProblems ||
          [],

        providers:
          mergedReview.providers,

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


    logger.error(

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
        null

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  fixAgent;
