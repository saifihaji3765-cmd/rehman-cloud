/* =========================================================
   ZyrionOS BUILDER AGENT
   Planning → Production Code Generation

   AI PROVIDER ARCHITECTURE:

   Builder Agent
        ↓
   aiProviderService
        ↓
   Primary Provider
        ↓
   Fallback Provider

   No direct provider SDK is used here.
========================================================= */


/* =========================
   SERVICES
========================= */

const logger =
  require("../services/loggerService");

const {
  generateJSON
} =
  require("../services/ai/aiProviderService");


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
   * Preserve known framework casing.
   *
   * Unknown but valid-looking values
   * are preserved instead of silently
   * changing the requested architecture.
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
   * Reject absolute Unix paths.
   */

  if (
    filePath.startsWith("/")
  ) {

    return null;

  }


  /*
   * Reject Windows absolute paths.
   */

  if (
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
   * Reject empty or oversized paths.
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
   * Master Agent sends:

   {
     prompt,
     plan,
     framework,
     user,
     memoryContext,
     intent
   }

   We extract the actual build context.
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
       BUILD CONTEXT
    ===================================================== */

    const buildContext = {

      userRequest:
        prompt,

      framework:
        framework ||
        "Use the framework specified by the plan.",

      plan,

      intent:
        request.intent ||
        null,

      memoryContext:
        request.memoryContext ||
        null

    };


    /* =====================================================
       AI BUILD
    ===================================================== */

    currentStage =
      "ai-build";


    /*
     * IMPORTANT:
     *
     * Builder Agent does NOT create an
     * OpenAI or Gemini client.
     *
     * Provider routing is centralized
     * inside aiProviderService.
     *
     * The provider service decides:
     *
     * Primary Provider
     *        ↓
     * Fallback Provider
     *
     * according to environment configuration.
     */

    const result =
      await generateJSON({

        messages: [

          {

            role:
              "system",

            content: `

You are the Builder Agent of ZyrionOS
Autonomous AI OS.

Your responsibility is to transform an
implementation plan into a coherent set
of production-ready source files.

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
   secrets, tokens, cookies, private
   credentials, payment secrets, or
   authentication secrets.

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

14. Generate appropriate application
    entry points.

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

26. Do not place source code outside the
    "content" property.

27. Do not omit content for any generated file.

28. Do not generate placeholder files whose
    only purpose is to make the file count
    larger.

29. Do not invent external APIs, services,
    URLs, credentials, infrastructure,
    databases, or integrations.

30. If a required external resource is not
    available, represent the integration using
    environment-based configuration rather
    than inventing credentials or endpoints.

31. Prefer real implementation over pseudo-code.

32. Do not return explanations, comments outside
    the JSON structure, or markdown.

33. Ensure generated source files are compatible
    with the framework identified in the plan.

34. Preserve the architectural intent of the
    Planning Agent.

35. Return JSON only.

IMPORTANT:

The output will be consumed directly by
the ZyrionOS backend.

Therefore:

- "files" MUST be an array.
- "path" MUST be a string.
- "content" MUST be a string.
- Every file MUST contain complete content.
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

        maxTokens:
          12000

      });


    /* =====================================================
       PROVIDER RESULT VALIDATION
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      const providerError =
        result?.error ||
        "AI provider returned an unsuccessful result.";


      logger.error(
        `Builder Agent AI Provider Failed: ${providerError}`
      );


      return {

        success: false,

        message:
          "Builder Agent AI provider failed",

        error:
          providerError,

        stage:
          currentStage,

        provider:
          result?.provider ||
          null,

        model:
          result?.model ||
          null

      };

    }


    /* =====================================================
       STRUCTURED RESPONSE
    ===================================================== */

    const parsed =
      result.data;


    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {

      return {

        success: false,

        message:
          "Builder Agent received an invalid AI response",

        error:
          "AI provider returned an invalid project object.",

        stage:
          currentStage,

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null

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
          currentStage,

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null

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
          currentStage,

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null

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

        },

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null

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


    logger.info(
      `Builder Agent Provider: ${result.provider || "unknown"}`
    );


    logger.info(
      `Builder Agent Model: ${result.model || "unknown"}`
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

        provider:
          result.provider ||
          null,

        model:
          result.model ||
          null,

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
