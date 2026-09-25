/* =========================================================
   ZyrionOS BUILDER AGENT
   Chunked Project Code Generation
   Production-Safe Batch Validation + Repair
   =========================================================

   Architecture:

   Planning Agent
        ↓
   Builder Agent
        ↓
   Project Manifest
        ↓
   File Generation Batches
        ↓
   Batch Validation
        ↓
   Batch Repair if required
        ↓
   Final Project Validation
        ↓
   Complete Project
        ↓
   Master Agent

   IMPORTANT:

   - Builder NEVER calls an AI provider directly.
   - All AI calls go through aiProviderService.
   - No Gemini dependency.
   - Large projects are generated in controlled batches.
   - Unexpected extra files do NOT automatically fail a batch.
   - Missing requested files trigger controlled repair attempts.
   - Final return contract remains:

       {
         success: true,
         data: {
           projectName,
           framework,
           files: [...]
         }
       }

========================================================= */

const logger =
  require("../services/loggerService");

const {
  generateJSON
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

const FILE_BATCH_MAX_TOKENS = 5000;

const MANIFEST_MAX_TOKENS = 3500;

/*
 * Maximum number of attempts for one file batch.

 * Attempt 1:
 * normal generation.

 * Attempt 2+:
 * repair / correction request.
 */
const MAX_BATCH_ATTEMPTS = 2;


/*
 * Maximum number of files that can be returned
 * by one AI response.

 * We allow a small amount of over-generation because
 * some models occasionally return files belonging to
 * another nearby batch.
 */
const MAX_BATCH_RESPONSE_FILES =
  FILES_PER_BATCH + 3;


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
    filePath.includes("\0") ||
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


    /*
     * Prevent duplicate paths.
     */
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
   BUILD PLAN SUMMARY
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

Your job is to convert a user's software request and
planning result into a precise project file manifest.

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

1. Return valid JSON only.

2. Do not use Markdown.

3. Do not use code fences.

4. Do not include explanations outside JSON.

5. Every file must have a unique path.

6. Paths must be relative project paths.

7. Never use:
   ../
   absolute filesystem paths
   Windows drive paths

8. Keep the project practical and complete.

9. Include all files required for the requested
   application to actually run.

10. Include package.json when dependencies are required.

11. Include configuration files when required.

12. Include application entry points.

13. Include required components, pages, services,
    API routes and utilities.

14. Do not generate unnecessary duplicate files.

15. Do not generate binary files.

16. Do not generate secrets, API keys or credentials.

17. Do not invent external services unless required
    by the user's request or planning.

18. The manifest should contain file paths and concise
    purposes only.

19. Keep the number of files within the requested scope.

20. Maximum project files: ${MAX_FILES}.
`;

}


/* =========================================================
   FILE BATCH SYSTEM PROMPT
========================================================= */

function createFileBatchSystemPrompt() {

  return `
You are the ZyrionOS Code Builder.

You generate production-quality source files for a
software project.

The project architecture has already been planned.

You will receive a small batch of requested files.

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

2. Do not use Markdown.

3. Do not use code fences.

4. Do not explain your answer outside JSON.

5. Generate EVERY requested file.

6. Never omit a requested file.

7. Each path must exactly match the requested path.

8. Each file must contain COMPLETE usable code.

9. Never use placeholder comments such as:
   TODO
   implement later
   add code here
   rest of code
   omitted
   same as above

10. Do not truncate code.

11. Do not generate fake imports.

12. Imports must match the project architecture.

13. Respect the specified framework.

14. Respect package/dependency requirements.

15. Keep the generated files internally consistent.

16. Do not generate API keys, passwords, tokens,
    private credentials or secrets.

17. Use environment variables for secrets.

18. Do not change the requested file paths.

19. Do not generate binary data.

20. If a requested file depends on another file,
    use the exact path from the project manifest.

21. The final application must be structurally runnable.

22. Do not invent backend endpoints that were not
    specified by the planning information.

23. Existing generated files are provided only as
    architectural context. Do not rewrite them unless
    explicitly requested.

24. Never return an empty files array.

25. Maximum requested files in this response:
    ${FILES_PER_BATCH}.

26. If you accidentally generate a file that belongs
    to another project batch, still prioritize returning
    every requested file correctly.

27. Never replace a requested file with another file.

28. Make sure every requested path appears exactly once.
`;

}


/* =========================================================
   BATCH REPAIR SYSTEM PROMPT
========================================================= */

function createBatchRepairSystemPrompt() {

  return `
You are the ZyrionOS Builder Repair Agent.

A previous file-generation attempt for a small project
batch failed validation.

Your job is to repair ONLY the current batch.

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

2. Do not use Markdown.

3. Do not use code fences.

4. Generate every missing requested file.

5. Every requested path must exactly match.

6. Do not return files outside the requested batch.

7. Do not omit any requested file.

8. Do not return duplicate paths.

9. Return complete source code.

10. Do not use placeholders.

11. Do not truncate code.

12. Preserve the project architecture.

13. Preserve framework requirements.

14. Preserve dependency requirements.

15. Fix missing or invalid files instead of explaining
    the previous error.

16. Never generate secrets.

17. If an existing valid file from the previous attempt
    is supplied, preserve its content unless it must be
    corrected for consistency.

18. The final response must contain ONLY the repaired files.
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
 * Important behavior:
 *
 * The old validator treated ANY extra file as a fatal
 * error.
 *
 * Example:
 *
 * Expected:
 *   App.js
 *   index.js
 *   App.css
 *
 * AI returns:
 *   App.js
 *   index.js
 *   App.css
 *   TodoList.js
 *
 * The old Builder failed the entire build.
 *
 * The new Builder:
 *
 *   - ignores extra files
 *   - keeps only requested files
 *   - fails only when a requested file is missing
 *
 * This prevents one accidental cross-batch file from
 * destroying an otherwise valid generation.
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

      error:
        "Generated batch is not an object.",

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

      error:
        "Generated batch does not contain files.",

    };

  }


  if (
    generated.files.length ===
    0
  ) {

    return {

      valid:
        false,

      error:
        "Generated batch returned no files.",

    };

  }


  if (
    generated.files.length >
    MAX_BATCH_RESPONSE_FILES
  ) {

    return {

      valid:
        false,

      error:
        `Generated batch returned too many files: ${generated.files.length}.`,

    };

  }


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


  for (
    const rawFile of
      generated.files
  ) {

    const file =
      normalizeFile(
        rawFile
      );


    if (!file) {

      /*
       * Invalid files are ignored here.
       *
       * If that causes a requested file to remain
       * missing, the repair pass will regenerate it.
       */
      continue;

    }


    const key =
      file.path
        .toLowerCase();


    /*
     * Extra file:
     *
     * Do NOT kill the whole batch.
     *
     * It may be a file the model accidentally generated
     * from the next batch.
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

        error:
          `Duplicate file generated: ${file.path}`,

        repairable:
          false,

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
   * All requested files are present.
   *
   * Extra files are discarded safely.
   */
  if (
    missingFiles.length ===
    0
  ) {

    return {

      valid:
        true,

      files:
        Array.from(
          received.values()
        ),

      unexpectedFiles,

      missingFiles: [],

    };

  }


  /*
   * Requested files are missing.
   *
   * Caller can perform a repair attempt.
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


  let repairSection =
    "";


  if (repairContext) {

    repairSection = `

REPAIR MODE:

The previous generation attempt did not satisfy
the batch contract.

VALID FILES ALREADY RECEIVED:

${safeJson(
  repairContext.validFiles || [],
  30000
)}

MISSING REQUESTED FILES:

${safeJson(
  repairContext.missingFiles || [],
  10000
)}

UNEXPECTED FILES FROM PREVIOUS ATTEMPT:

${safeJson(
  repairContext.unexpectedFiles || [],
  10000
)}

PREVIOUS VALIDATION ERROR:

${safeString(
  repairContext.error || "",
  2000
)}

Generate the missing/corrected requested files now.

Do not repeat the previous validation mistake.
`;

  }


  return `
USER REQUEST:

${request.prompt}

PROJECT:

${projectName}

FRAMEWORK:

${manifestFramework}

PLANNING RESULT:

${request.planString}

COMPLETE PROJECT MANIFEST:

${safeJson(
  manifestFiles,
  50000
)}

CURRENT FILE BATCH:

${safeJson(
  batchDescription,
  10000
)}

ALREADY GENERATED FILE INDEX:

${safeJson(
  generatedIndex,
  20000
)}

Generate ONLY the files in CURRENT FILE BATCH.

Every requested path must be returned.

Return complete source code.

Do not return explanations.
Do not return Markdown.
Do not return files from another batch.

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
     * Keep this reference intentionally available for
     * future builder telemetry without changing the
     * Master Agent contract.
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

Create the complete project file manifest.
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


    for (
      let batchIndex = 0;
      batchIndex < batches.length;
      batchIndex++
    ) {

      const batch =
        batches[batchIndex];


      currentStage =
        `file-generation-batch-${batchIndex + 1}`;


      const batchNumber =
        batchIndex + 1;


      logger.info(
        `Builder generating batch ${batchNumber}/${batches.length} (${batch.length} files)`
      );


      let batchCompleted =
        false;


      let lastValidation =
        null;


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


        const batchResult =
          await requestBatchGeneration({

            request,

            projectName,

            manifestFramework,

            manifestFiles,

            batch,

            generatedFiles,

            repairContext,

          });


        if (
          !batchResult ||
          batchResult.success !==
            true
        ) {

          logger.warning(
            `Builder batch ${batchNumber}/${batches.length} AI request failed | attempt=${attempt}`
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

            missingFiles:
              batch,

            unexpectedFiles: [],

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

            metadata: {

              projectName,

              framework:
                manifestFramework,

              totalManifestFiles:
                manifestFiles.length,

              generatedFiles:
                generatedFiles.length,

              failedBatch:
                batchNumber,

              totalBatches:
                batches.length,

              attempts:
                attempt,

              durationMs:
                Date.now() -
                startedAt,

            },

          };

        }


        const batchValidation =
          validateGeneratedBatch(

            batchResult.data,

            batch

          );


        lastValidation =
          batchValidation;


        /*
         * SUCCESS:
         *
         * All requested files exist.
         *
         * Any accidental extra files are ignored.
         */
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
              `Builder batch ${batchNumber}: ignored unexpected files: ${batchValidation.unexpectedFiles.join(", ")}`
            );

          }


          /*
           * Add only files belonging to the current
           * manifest batch.
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

              return {

                success:
                  false,

                error:
                  `Duplicate project file detected: ${file.path}`,

                stage:
                  currentStage,

                metadata: {

                  projectName,

                  framework:
                    manifestFramework,

                  failedBatch:
                    batchNumber,

                  durationMs:
                    Date.now() -
                    startedAt,

                },

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
            `Builder batch ${batchNumber}/${batches.length} completed: ${batchValidation.files.length} files`
          );


          batchCompleted =
            true;


          break;

        }


        /*
         * REPAIRABLE FAILURE:
         *
         * Some requested files are missing.
         */
        if (
          batchValidation.repairable &&
          attempt <
            MAX_BATCH_ATTEMPTS
        ) {

          logger.warning(
            `Builder batch ${batchNumber}: missing requested files, starting repair`
          );


          continue;

        }


        /*
         * Final failed validation.
         */
        logger.error(
          `Builder batch validation failed: ${batchValidation.error}`
        );


        return {

          success:
            false,

          error:
            batchValidation.error,

          stage:
            currentStage,

          metadata: {

            projectName,

            framework:
              manifestFramework,

            totalManifestFiles:
              manifestFiles.length,

            generatedFiles:
              generatedFiles.length,

            failedBatch:
              batchNumber,

            totalBatches:
              batches.length,

            attempts:
              attempt,

            durationMs:
              Date.now() -
              startedAt,

          },

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

          metadata: {

            projectName,

            framework:
              manifestFramework,

            failedBatch:
              batchNumber,

            totalBatches:
              batches.length,

            durationMs:
              Date.now() -
              startedAt,

          },

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


    /*
     * Final normalization pass.
     */
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
       FINAL PATH VERIFICATION
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
