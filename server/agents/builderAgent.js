/* =========================================================
   ZyrionOS BUILDER AGENT
   Production Chunked Code Generation Engine
   =========================================================

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
   Batch Validation
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
   - Final output contains ONLY manifest-approved files.
   - Builder does NOT perform the authoritative build.
========================================================= */

const logger =
  require("../services/loggerService");

const {
  generateJSON,
} =
  require("../services/ai/aiProviderService");


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILES = 100;

const MAX_PATH_LENGTH = 300;

const MAX_FILE_SIZE = 200000;

const MAX_PROMPT_LENGTH = 12000;

const MAX_PLAN_SIZE = 100000;

const FILES_PER_BATCH = 3;

/*
 * Output budget.

 * 5000 was occasionally enough to generate a valid response,
 * but truncated JSON was observed in production.
 *
 * Keep the batch small while giving the model enough room
 * for complete source files.
 */
const FILE_BATCH_MAX_TOKENS = 6500;

const MANIFEST_MAX_TOKENS = 3500;

/*
 * More than two attempts are useful because structured JSON
 * generation can fail independently from source correctness.
 */
const MAX_BATCH_ATTEMPTS = 3;


/*
 * AI may accidentally return files belonging to another
 * nearby batch.
 *
 * We do NOT accept those files into the project.
 *
 * This is only an upper safety bound on the raw response.
 *
 * Example observed production failure:
 *
 * expected = 3
 * returned = 15
 *
 * The old Builder rejected this before filtering.
 *
 * This Builder accepts the response, extracts the 3
 * requested files, and discards the other 12.
 */
const MAX_RAW_BATCH_RESPONSE_FILES = 20;


/*
 * Maximum amount of manifest information included in one
 * batch prompt.
 */
const MAX_MANIFEST_CONTEXT_SIZE = 30000;


/*
 * Maximum amount of previously generated path metadata
 * included in one request.
 */
const MAX_GENERATED_INDEX_SIZE = 12000;


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

  } catch (error) {

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


  /*
   * Normalize Windows separators.
   */
  filePath =
    filePath.replace(
      /\\/g,
      "/"
    );


  /*
   * Remove leading slash.
   */
  filePath =
    filePath.replace(
      /^\/+/,
      ""
    );


  /*
   * Reject null bytes.
   */
  if (
    filePath.includes("\0")
  ) {

    return null;

  }


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
   * Reject dangerous filesystem paths.
   */
  if (
    filePath.includes(":") ||
    filePath.startsWith("~")
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


  return filePath || null;

}


/* =========================================================
   FILE CONTENT
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
   NORMALIZE FILE
========================================================= */

function normalizeFile(
  file
) {

  if (
    !file ||
    typeof file !==
      "object"
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

    content,

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

    userId,

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
      request.plan,

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
10. Include package.json when dependencies are required.
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
    typeof manifest !==
      "object"
  ) {

    return {

      valid:
        false,

      error:
        "Manifest is not an object.",

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
        "Manifest files must be an array.",

    };

  }


  if (
    manifest.files.length ===
    0
  ) {

    return {

      valid:
        false,

      error:
        "Manifest returned no files.",

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
        `Manifest exceeds maximum file count of ${MAX_FILES}.`,

    };

  }


  const files = [];

  const seen =
    new Set();


  for (
    const item of
      manifest.files
  ) {

    if (
      !item ||
      typeof item !==
        "object"
    ) {

      return {

        valid:
          false,

        error:
          "Manifest contains an invalid file entry.",

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
          "Manifest contains an invalid file path.",

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
          `Duplicate manifest path: ${path}`,

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
        "Required project file",

    });

  }


  return {

    valid:
      true,

    data: {

      projectName,

      framework,

      files,

    },

  };

}


/* =========================================================
   BATCH VALIDATION
========================================================= */

/*
 * CORE FIX:
 *
 * We validate against the requested-path whitelist.
 *
 * Example:
 *
 * Requested:
 *   App.jsx
 *   main.jsx
 *   App.css
 *
 * AI returns:
 *   App.jsx
 *   main.jsx
 *   App.css
 *   Todo.jsx
 *   Header.jsx
 *   Footer.jsx
 *
 * Result:
 *
 *   App.jsx   → accepted
 *   main.jsx  → accepted
 *   App.css   → accepted
 *
 *   Todo.jsx  → discarded
 *   Header.jsx → discarded
 *   Footer.jsx → discarded
 *
 * The batch succeeds because every requested file exists.
 *
 * The old implementation rejected the response before this
 * filtering because 6 > MAX_BATCH_RESPONSE_FILES.
 */

function validateGeneratedBatch(
  generated,
  expectedFiles
) {

  if (
    !generated ||
    typeof generated !==
      "object"
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      error:
        "Generated batch is not an object.",

      files: [],

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

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

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

    };

  }


  if (
    generated.files.length ===
    0
  ) {

    return {

      valid:
        false,

      repairable:
        true,

      error:
        "Generated batch returned no files.",

      files: [],

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

    };

  }


  /*
   * Hard safety ceiling only.
   *
   * This is deliberately larger than the expected batch size.
   */
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

      missingFiles:
        expectedFiles,

      unexpectedFiles: [],

    };

  }


  /*
   * Requested-path whitelist.
   */
  const expected =
    new Map();


  for (
    const item of
      expectedFiles
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
    const rawFile of
      generated.files
  ) {

    const file =
      normalizeFile(
        rawFile
      );


    /*
     * Invalid file:
     *
     * Do not allow it into the project.
     *
     * If it was requested, it will appear as missing
     * and trigger repair.
     */
    if (!file) {

      if (
        rawFile &&
        typeof rawFile ===
          "object"
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
      file.path
        .toLowerCase();


    /*
     * EXTRA FILE:
     *
     * Never add it.
     *
     * Never fail the batch solely because of it.
     */
    if (
      !expected.has(key)
    ) {

      unexpectedFiles.push(
        file.path
      );

      continue;

    }


    /*
     * Duplicate requested file.
     */
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

        missingFiles: [],

        unexpectedFiles,

      };

    }


    received.set(
      key,
      file
    );

  }


  /*
   * Find missing requested files.
   */
  const missingFiles = [];


  for (
    const expectedFile of
      expectedFiles
  ) {

    const key =
      expectedFile.path
        .toLowerCase();


    if (
      !received.has(key)
    ) {

      missingFiles.push(
        expectedFile
      );

    }

  }


  /*
   * SUCCESS:
   *
   * Every requested file exists.
   *
   * Extra files are simply discarded.
   */
  if (
    missingFiles.length ===
    0
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

      unexpectedFiles,

      missingFiles: [],

      invalidFiles,

    };

  }


  /*
   * REPAIRABLE:
   *
   * At least one requested file is missing/invalid.
   */
  return {

    valid:
      false,

    repairable:
      true,

    error:
      `Missing generated file(s): ${missingFiles
        .map(file => file.path)
        .join(", ")}`,

    files:
      Array.from(
        received.values()
      ),

    unexpectedFiles,

    missingFiles,

    invalidFiles,

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
        file.content.length,

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
          file.purpose,

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
          file.purpose,

      })
    );


  const manifestContext =
    createManifestContext(
      manifestFiles
    );


  let repairSection =
    "";


  if (repairContext) {

    /*
     * FIX:
     *
     * The previous Builder used
     * repairContext.validFiles,
     * but validation actually returned `files`.
     *
     * We now explicitly normalize this.
     */
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

The previous attempt did not satisfy the current batch.

VALID FILES ALREADY RECEIVED:

${safeJson(
  validFiles.map(
    file => ({
      path:
        file.path,
      size:
        typeof file.content === "string"
          ? file.content.length
          : undefined,
    })
  ),
  12000
)}

MISSING REQUESTED FILES:

${safeJson(
  repairContext.missingFiles || [],
  8000
)}

UNEXPECTED FILES THAT MUST BE IGNORED:

${safeJson(
  repairContext.unexpectedFiles || [],
  8000
)}

INVALID FILE PATHS:

${safeJson(
  repairContext.invalidFiles || [],
  5000
)}

PREVIOUS VALIDATION ERROR:

${safeString(
  repairContext.error || "",
  2000
)}

Generate the missing/corrected requested files only.
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
            : createFileBatchSystemPrompt(),

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

            repairContext,

          }),

      },

    ],

    temperature:
      repairContext
        ? 0.1
        : 0.2,

    maxTokens:
      FILE_BATCH_MAX_TOKENS,

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
  startedAt,
}) {

  return {

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
      startedAt,

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
      "Builder Agent Started"
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
          currentStage,

      };

    }


    if (!request.plan) {

      return {

        success:
          false,

        error:
          "Builder Agent requires a planning result.",

        stage:
          currentStage,

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
          currentStage,

      };

    }


    /* =====================================================
       BUILD CONTEXT
    ===================================================== */

    const buildContext =
      createBuildContext(
        request
      );


    /*
     * Keep available for future telemetry.
     */
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
              createManifestSystemPrompt(),

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
`,
          },

        ],

        temperature:
          0.1,

        maxTokens:
          MANIFEST_MAX_TOKENS,

      });


    if (
      !manifestResult ||
      manifestResult.success !==
        true
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

          durationMs:
            Date.now() -
            startedAt,

        },

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

          durationMs:
            Date.now() -
            startedAt,

        },

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

              repairContext,

            });

        } catch (error) {

          batchResult = {

            success:
              false,

            error:
              error?.message ||
              "Batch AI request failed.",

          };

        }


        /* =================================================
           AI REQUEST FAILURE
        ================================================= */

        if (
          !batchResult ||
          batchResult.success !==
            true
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

            files: [],

            validFiles: [],

            missingFiles:
              batch,

            unexpectedFiles: [],

            invalidFiles: [],

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

                startedAt,

              }),

          };

        }


        /* =================================================
           BATCH VALIDATION
        ================================================= */

        const batchValidation =
          validateGeneratedBatch(

            batchResult.data,

            batch

          );


        lastValidation = {

          ...batchValidation,

          validFiles:
            batchValidation.files || [],

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


          /*
           * ONLY manifest-requested files can enter
           * generatedFiles.
           */
          for (
            const file of
              batchValidation.files
          ) {

            const key =
              file.path
                .toLowerCase();


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

                    startedAt,

                  }),

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
           REPAIRABLE VALIDATION FAILURE
        ================================================= */

        if (
          batchValidation.repairable &&
          attempt <
            MAX_BATCH_ATTEMPTS
        ) {

          logger.warning(
            `Builder batch ${batchNumber}: validation requires repair | ${
              batchValidation.error
            }`
          );


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

              startedAt,

            }),

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

              startedAt,

            }),

        };

      }

    }


    /* =====================================================
       FINAL PROJECT VALIDATION
    ===================================================== */

    currentStage =
      "final-project-validation";


    /*
     * The Builder must produce exactly the manifest
     * coverage.
     */
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

          projectName,

          framework:
            manifestFramework,

          manifestFiles:
            manifestFiles.length,

          generatedFiles:
            generatedFiles.length,

          durationMs:
            Date.now() -
            startedAt,

        },

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

          projectName,

          framework:
            manifestFramework,

          manifestFiles:
            manifestFiles.length,

          generatedFiles:
            finalFiles.length,

          durationMs:
            Date.now() -
            startedAt,

        },

      };

    }


    /* =====================================================
       FINAL MANIFEST COVERAGE
    ===================================================== */

    const finalPathSet =
      new Set(
        finalFiles.map(
          file =>
            file.path
              .toLowerCase()
        )
      );


    for (
      const manifestFile of
        manifestFiles
    ) {

      const key =
        manifestFile.path
          .toLowerCase();


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

            projectName,

            framework:
              manifestFramework,

            durationMs:
              Date.now() -
              startedAt,

          },

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
            file.path
              .toLowerCase()
        )
      );


    for (
      const finalFile of
        finalFiles
    ) {

      const key =
        finalFile.path
          .toLowerCase();


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

            projectName,

            framework:
              manifestFramework,

            durationMs:
              Date.now() -
              startedAt,

          },

        };

      }

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

      },

      metadata: {

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

        finalManifestCoverage:
          true,

        durationMs,

      },

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

        durationMs:
          Date.now() -
          startedAt,

      },

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  builderAgent;
