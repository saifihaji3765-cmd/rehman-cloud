/* =========================================================
   ZyrionOS BUILDER AGENT
   Planning → Production Code Generation
========================================================= */


/* =========================
   PACKAGES
========================= */

const OpenAI =
  require("openai");


/* =========================
   SERVICES
========================= */

const logger =
  require("../services/loggerService");


/* =========================
   OPENAI CLIENT
========================= */

const openai =
  new OpenAI({

    apiKey:
      process.env.OPENAI_API_KEY

  });


/* =========================================================
   CONSTANTS
========================================================= */


/* =========================
   MAXIMUM LIMITS
========================= */

const MAX_FILES =
  100;

const MAX_PATH_LENGTH =
  300;

const MAX_FILE_SIZE =
  200000;


/* =========================
   ALLOWED FRAMEWORK VALUES
========================= */

const COMMON_FRAMEWORKS = [

  "React",

  "Next.js",

  "Node.js",

  "Express",

  "NestJS",

  "Vue",

  "Nuxt",

  "Angular",

  "Svelte",

  "SvelteKit",

  "Python",

  "FastAPI",

  "Django",

  "Flask",

  "Java",

  "Spring Boot",

  "PHP",

  "Laravel",

  "Flutter",

  "React Native"

];


/* =========================================================
   HELPERS
========================================================= */


/* =========================
   SAFE JSON PARSER
========================= */

function safeJsonParse(
  value
) {

  if (
    !value ||
    typeof value !== "string"
  ) {

    return null;

  }


  try {

    return JSON.parse(
      value.trim()
    );

  }

  catch (error) {

    try {

      const cleaned =
        value
          .replace(
            /```json/gi,
            ""
          )
          .replace(
            /```/g,
            ""
          )
          .trim();


      return JSON.parse(
        cleaned
      );

    }

    catch (secondError) {

      return null;

    }

  }

}


/* =========================
   SAFE STRING
========================= */

function cleanString(
  value,
  maxLength = 4000
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


/* =========================
   SAFE JSON SERIALIZER
========================= */

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      value ?? null
    );

  }

  catch (error) {

    return "{}";

  }

}


/* =========================
   NORMALIZE FRAMEWORK
========================= */

function normalizeFramework(
  framework,
  plan
) {

  let value =
    cleanString(
      framework,
      200
    );


  if (!value) {

    value =
      cleanString(
        plan?.framework,
        200
      );

  }


  if (!value) {

    value =
      cleanString(
        plan?.frontend?.framework,
        200
      );

  }


  if (!value) {

    return "";

  }


  /*
   * Preserve unknown but valid-looking
   * framework values rather than silently
   * changing the user's architecture.
   */

  const known =
    COMMON_FRAMEWORKS.find(
      (item) =>
        item.toLowerCase() ===
        value.toLowerCase()
    );


  return known || value;

}


/* =========================
   NORMALIZE PROJECT NAME
========================= */

function normalizeProjectName(
  value
) {

  const projectName =
    cleanString(
      value,
      200
    );


  if (
    projectName
  ) {

    return projectName;

  }


  return "ZyrionOS Project";

}


/* =========================
   NORMALIZE FILE PATH
========================= */

function normalizeFilePath(
  value
) {

  if (
    typeof value !== "string"
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


  /*
   * Remove accidental leading "./"
   */

  while (
    filePath.startsWith("./")
  ) {

    filePath =
      filePath.slice(2);

  }


  /*
   * Reject absolute paths.
   */

  if (
    filePath.startsWith("/") ||
    /^[A-Za-z]:\//.test(
      filePath
    )
  ) {

    return null;

  }


  /*
   * Reject path traversal.
   */

  const segments =
    filePath.split("/");


  if (
    segments.includes("..")
  ) {

    return null;

  }


  /*
   * Reject empty or malformed paths.
   */

  if (
    !filePath ||
    filePath.length >
      MAX_PATH_LENGTH
  ) {

    return null;

  }


  /*
   * Reject null bytes.
   */

  if (
    filePath.includes("\0")
  ) {

    return null;

  }


  return filePath;

}


/* =========================
   NORMALIZE FILE CONTENT
========================= */

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


/* =========================
   NORMALIZE GENERATED FILES
========================= */

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


  const normalizedFiles =
    [];

  const seenPaths =
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
      typeof file !== "object"
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


    const normalizedPath =
      filePath;


    if (
      seenPaths.has(
        normalizedPath
      )
    ) {

      duplicateCount++;

      continue;

    }


    seenPaths.add(
      normalizedPath
    );


    normalizedFiles.push({

      path:
        normalizedPath,

      content

    });


    if (
      normalizedFiles.length >=
      MAX_FILES
    ) {

      break;

    }

  }


  return {

    files:
      normalizedFiles,

    invalidCount,

    duplicateCount

  };

}


/* =========================
   EXTRACT BUILD REQUEST
========================= */

function normalizeBuildRequest(
  input
) {

  /*
   * Master Agent sends an object:

   {
     prompt,
     plan,
     framework,
     user,
     memoryContext,
     intent
   }

   We extract the actual plan.
   */

  if (
    typeof input === "string"
  ) {

    return {

      prompt:
        cleanString(
          input,
          4000
        ),

      plan:
        null,

      framework:
        "",

      user:
        {},

      memoryContext:
        null,

      intent:
        null

    };

  }


  if (
    !input ||
    typeof input !== "object"
  ) {

    return {

      prompt:
        "",

      plan:
        null,

      framework:
        "",

      user:
        {},

      memoryContext:
        null,

      intent:
        null

    };

  }


  return {

    prompt:
      cleanString(
        input.prompt,
        4000
      ),

    plan:
      input.plan ||
      input.projectPlan ||
      null,

    framework:
      cleanString(
        input.framework,
        200
      ),

    user:
      input.user ||
      {},

    memoryContext:
      input.memoryContext ||
      null,

    intent:
      input.intent ||
      null

  };

}


/* =========================================================
   BUILDER AGENT
========================================================= */

async function builderAgent(
  input = {}
) {

  let currentStage =
    "request-normalization";


  try {

    logger.info(
      "🏗️ ZyrionOS Builder Agent Started"
    );


    /* =====================================================
       NORMALIZE INPUT
    ===================================================== */

    const request =
      normalizeBuildRequest(
        input
      );


    const prompt =
      request.prompt;


    const plan =
      request.plan;


    const framework =
      normalizeFramework(
        request.framework,
        plan
      );


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!prompt) {

      return {

        success: false,

        message:
          "Build prompt required",

        error:
          "Builder Agent received an empty build prompt."

      };

    }


    if (
      !plan ||
      typeof plan !== "object"
    ) {

      return {

        success: false,

        message:
          "Project plan required",

        error:
          "Builder Agent did not receive a valid Planning Agent output."

      };

    }


    /* =====================================================
       OPENAI CONFIGURATION
    ===================================================== */

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return {

        success: false,

        message:
          "Builder Agent configuration error",

        error:
          "OPENAI_API_KEY is not configured on the backend."

      };

    }


    /* =====================================================
       BUILD CONTEXT
    ===================================================== */

    const buildContext = {

      userRequest:
        prompt,

      framework:
        framework ||
        "Use the framework specified by the plan.",

      plan

    };


    /* =====================================================
       AI BUILD
    ===================================================== */

    currentStage =
      "openai-build";


    const completion =
      await openai
        .chat
        .completions
        .create({

          model:
            "gpt-4.1-mini",

          response_format: {

            type:
              "json_object"

          },

          messages: [

            {

              role:
                "system",

              content: `

You are the Builder Agent of ZyrionOS
Autonomous AI OS.

Your responsibility is to transform an
implementation plan into a coherent set
of source files.

The Planning Agent has already produced
the architecture.

You must follow that architecture.

You generate source files only.

Do not explain the implementation.

Do not return markdown.

Do not return triple backticks.

Return ONLY valid JSON.

REQUIRED OUTPUT:

{
  "projectName": "",
  "framework": "",
  "files": [
    {
      "path": "",
      "content": ""
    }
  ]
}

STRICT RULES:

1. Generate complete file contents.
2. Every file must have a unique relative
   path.
3. Every file path must use forward slashes.
4. Never use absolute file paths.
5. Never use "../" path traversal.
6. Never include API keys, passwords,
   secrets, tokens, cookies, or private
   credentials.
7. Never hard-code credentials.
8. Use environment variables for secrets.
9. Keep frontend/backend architecture
   consistent with the planning document.
10. Keep imports and file paths internally
    consistent.
11. Do not reference files that you did not
    generate unless they are clearly external
    dependencies.
12. Generate configuration files when they
    are required for the project to run.
13. Generate package.json when a Node.js
    application requires it.
14. Generate appropriate entry points.
15. Generate required API routes when they
    are part of the plan.
16. Generate database models/schemas when
    they are part of the plan.
17. Generate authentication code only when
    authentication is part of the plan.
18. Do not claim that deployment has happened.
19. Do not claim that AWS, Docker, databases,
    domains, SSL, payments, or external
    services are configured unless represented
    only as application configuration/code.
20. Do not generate fake success responses
    for infrastructure operations.
21. Do not create unnecessary files.
22. Do not duplicate the same path.
23. Make the generated project internally
    coherent.
24. Follow the requested framework.
25. Return JSON only.

IMPORTANT:

The output will be consumed directly by
the ZyrionOS backend.

Therefore:

- "files" MUST be an array.
- "path" MUST be a string.
- "content" MUST be a string.
- Do not omit file content.
- Do not put code outside "content".
- Do not wrap JSON in markdown.

`

            },

            {

              role:
                "user",

              content:
                safeJson(
                  buildContext
                )

            }

          ],

          temperature:
            0.2,

          max_tokens:
            12000

        });


    /* =====================================================
       RAW RESPONSE
    ===================================================== */

    const raw =
      completion
        ?.choices?.[0]
        ?.message
        ?.content;


    if (
      !raw ||
      typeof raw !== "string"
    ) {

      return {

        success: false,

        message:
          "Builder Agent received an empty AI response",

        error:
          "OpenAI returned no generated project data.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       PARSE RESPONSE
    ===================================================== */

    currentStage =
      "builder-json-parse";


    const parsed =
      safeJsonParse(
        raw
      );


    if (!parsed) {

      logger.warning(
        "Builder Agent JSON Parse Failed"
      );


      return {

        success: false,

        message:
          "Invalid AI JSON response",

        error:
          "Builder Agent could not parse the generated project JSON.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       BASIC FILE VALIDATION
    ===================================================== */

    if (
      !Array.isArray(
        parsed.files
      )
    ) {

      return {

        success: false,

        message:
          "Invalid files structure",

        error:
          "Builder Agent response does not contain a valid files array.",

        stage:
          currentStage

      };

    }


    if (
      parsed.files.length === 0
    ) {

      return {

        success: false,

        message:
          "Builder Agent returned no project files",

        error:
          "The AI Builder completed but generated zero files.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       NORMALIZE FILES
    ===================================================== */

    currentStage =
      "file-validation";


    const fileResult =
      normalizeFiles(
        parsed.files
      );


    if (
      fileResult.files.length === 0
    ) {

      return {

        success: false,

        message:
          "Builder Agent returned no valid project files",

        error:
          "All generated files failed path/content validation.",

        stage:
          currentStage,

        metadata: {

          invalidFiles:
            fileResult.invalidCount,

          duplicateFiles:
            fileResult.duplicateCount

        }

      };

    }


    /* =====================================================
       PROJECT NAME
    ===================================================== */

    const projectName =
      normalizeProjectName(
        parsed.projectName ||
        plan.projectName
      );


    /* =====================================================
       FINAL FRAMEWORK
    ===================================================== */

    const finalFramework =
      normalizeFramework(
        parsed.framework ||
        framework,
        plan
      );


    /* =====================================================
       FINAL BUILD RESULT
    ===================================================== */

    const normalizedBuild = {

      projectName,

      framework:
        finalFramework,

      files:
        fileResult.files

    };


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(
      `Builder Agent Completed: ${fileResult.files.length} files generated`
    );


    /* =====================================================
       RESPONSE
    ===================================================== */

    return {

      success: true,

      data:
        normalizedBuild,

      metadata: {

        agent:
          "builderAgent",

        model:
          "gpt-4.1-mini",

        totalFiles:
          fileResult.files.length,

        invalidFiles:
          fileResult.invalidCount,

        duplicateFiles:
          fileResult.duplicateCount,

        framework:
          finalFramework,

        projectName,

        generatedAt:
          new Date()

      }

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown Builder Agent error";


    logger.error(
      `Builder Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success: false,

      message:
        "Builder Agent Failed",

      error:
        errorMessage,

      stage:
        currentStage

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  builderAgent;
