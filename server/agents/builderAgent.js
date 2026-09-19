/* =========================================================
   ZYRIONOS BUILDER AGENT
   ---------------------------------------------------------
   Planning → Production Code Generation

   AI ROUTING:

   Builder Agent
        ↓
   aiProviderService
        ↓
   Gemini 3.8 Flash
        ↓
   Gemini 3.7 Flash
        ↓
   Gemini 3.6 Flash

   OpenAI is NOT called by this agent.
   Provider logic remains centralized.
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
  100;

const MAX_PATH_LENGTH =
  300;

const MAX_FILE_SIZE =
  200000;

const MAX_PROMPT_LENGTH =
  12000;

const MAX_PLAN_SIZE =
  100000;


/* =========================================================
   COMMON FRAMEWORKS
========================================================= */

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
   SAFE STRING
========================================================= */

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
    .slice(0, maxLength);

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

  catch (error) {

    return "{}";

  }

}


/* =========================================================
   SAFE JSON PARSER
========================================================= */

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
            /^\s*```json\s*/i,
            ""
          )
          .replace(
            /^\s*```\s*/i,
            ""
          )
          .replace(
            /\s*```\s*$/i,
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


/* =========================================================
   NORMALIZE FRAMEWORK
========================================================= */

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

  const knownFramework =
    COMMON_FRAMEWORKS.find(
      (item) =>
        item.toLowerCase() ===
        value.toLowerCase()
    );

  return (
    knownFramework ||
    value
  );

}


/* =========================================================
   NORMALIZE PROJECT NAME
========================================================= */

function normalizeProjectName(
  value
) {

  const projectName =
    cleanString(
      value,
      200
    );

  return (
    projectName ||
    "ZyrionOS Project"
  );

}


/* =========================================================
   NORMALIZE FILE PATH
========================================================= */

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

  while (
    filePath.startsWith("./")
  ) {

    filePath =
      filePath.slice(2);

  }

  if (
    !filePath
  ) {

    return null;

  }

  if (
    filePath.startsWith("/")
  ) {

    return null;

  }

  if (
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

  const segments =
    filePath.split("/");

  if (
    segments.includes("..")
  ) {

    return null;

  }

  if (
    filePath.length >
    MAX_PATH_LENGTH
  ) {

    return null;

  }

  return filePath;

}


/* =========================================================
   NORMALIZE FILE CONTENT
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

      invalidCount: 0,

      duplicateCount: 0

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

    if (
      seenPaths.has(
        filePath
      )
    ) {

      duplicateCount++;

      continue;

    }

    seenPaths.add(
      filePath
    );

    normalizedFiles.push({

      path:
        filePath,

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


/* =========================================================
   NORMALIZE BUILD REQUEST
========================================================= */

function normalizeBuildRequest(
  input
) {

  if (
    typeof input === "string"
  ) {

    return {

      prompt:
        cleanString(
          input,
          MAX_PROMPT_LENGTH
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

      prompt: "",

      plan: null,

      framework: "",

      user: {},

      memoryContext: null,

      intent: null

    };

  }

  return {

    prompt:
      cleanString(
        input.prompt,
        MAX_PROMPT_LENGTH
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
      input.user &&
      typeof input.user === "object"
        ? input.user
        : {},

    memoryContext:
      input.memoryContext ||
      null,

    intent:
      input.intent ||
      null

  };

}


/* =========================================================
   BUILD SYSTEM PROMPT
========================================================= */

function createBuilderSystemPrompt() {

  return `You are the Builder Agent of ZyrionOS.

Your job is to transform a validated Planning Agent output into a REAL, coherent, production-ready source-code project.

The Planning Agent already decided the architecture.

You MUST follow the plan.

Your response is consumed directly by backend code.

RETURN ONLY VALID JSON.

NO markdown.
NO triple backticks.
NO explanations outside JSON.
NO fake implementation.
NO demo implementation.
NO placeholder-only files.

REQUIRED JSON:

{
  "projectName": "string",
  "framework": "string",
  "files": [
    {
      "path": "string",
      "content": "string"
    }
  ]
}

STRICT REQUIREMENTS:

1. Generate complete source files.

2. Every generated file must contain real implementation.

3. Every file must have a unique relative path.

4. Use forward slashes in paths.

5. Never use absolute paths.

6. Never use ../ path traversal.

7. Never include secrets.

8. Never include API keys.

9. Never include passwords.

10. Never include private credentials.

11. Never include real payment secrets.

12. Use environment variables for external secrets.

13. Follow the Planning Agent architecture.

14. Keep frontend and backend architecture consistent.

15. Keep imports internally consistent.

16. Generated files must reference only:
   - generated files,
   - declared project dependencies,
   - legitimate external packages,
   - legitimate standard-library modules.

17. Generate package.json whenever required.

18. Generate the correct application entry point.

19. Generate required configuration files.

20. Generate required API routes when the plan requires them.

21. Generate database models when required by the plan.

22. Generate authentication only when required by the plan.

23. Generate real error handling.

24. Generate real validation.

25. Do not claim that deployment happened.

26. Do not claim that AWS is configured.

27. Do not claim that a database is configured.

28. Do not claim that a domain is configured.

29. Do not claim that SSL is configured.

30. Do not claim that payments are configured.

31. Infrastructure integrations must be represented as real application configuration/code only.

32. Never invent credentials.

33. Never invent unavailable infrastructure.

34. Never invent external APIs.

35. Never invent external URLs.

36. Do not generate unnecessary files.

37. Do not duplicate files.

38. Do not create files merely to increase file count.

39. Preserve the exact architectural intent of the Planning Agent.

40. Follow the requested framework.

41. If the plan specifies a technology, use that technology.

42. If the plan specifies a file, generate that file.

43. If the plan does not require a technology, do not randomly introduce it.

44. Ensure generated imports match generated paths.

45. Ensure package dependencies match imported packages.

46. Ensure configuration names match code usage.

47. Ensure environment variable names are consistent.

48. Ensure API route paths are consistent.

49. Ensure exported functions match their imports.

50. Do not output pseudo-code.

51. Do not output TODO-only implementations.

52. Do not output "coming soon" implementations.

53. Do not output fake success responses.

54. Do not omit file content.

55. The "files" property MUST be an array.

56. "path" MUST be a string.

57. "content" MUST be a string.

58. Return JSON only.

QUALITY REQUIREMENTS:

- Think through the complete dependency graph before generating files.
- Make the generated project internally coherent.
- Prefer fewer complete files over many incomplete files.
- Do not sacrifice correctness to increase file count.
- Preserve existing architecture when the plan references an existing project.
- Do not silently replace the framework.
- Do not silently change database technology.
- Do not silently change authentication architecture.
- Do not silently change API architecture.

SECURITY:

Never generate:
- secrets
- access tokens
- private keys
- passwords
- payment credentials
- authentication cookies
- production API keys

Use environment variables instead.

FINAL RULE:

The output is parsed automatically.

Therefore the entire response MUST be valid JSON and nothing else.`;

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
       REQUEST NORMALIZATION
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

    if (
      !prompt
    ) {

      return {

        success: false,

        message:
          "Build prompt required",

        error:
          "Builder Agent received an empty build prompt.",

        stage:
          currentStage

      };

    }

    if (
      !plan ||
      typeof plan !== "object" ||
      Array.isArray(plan)
    ) {

      return {

        success: false,

        message:
          "Project plan required",

        error:
          "Builder Agent did not receive a valid Planning Agent output.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       PLAN SIZE SAFETY
    ===================================================== */

    let planForAI =
      plan;

    try {

      const serializedPlan =
        JSON.stringify(
          plan
        );

      if (
        serializedPlan.length >
        MAX_PLAN_SIZE
      ) {

        planForAI = {

          ...plan,

          _builderNotice:
            "Planning output exceeded builder context limit. Preserve the essential architecture and implementation requirements from the supplied plan."

        };

      }

    }

    catch (error) {

      planForAI =
        plan;

    }


    /* =====================================================
       BUILD CONTEXT
    ===================================================== */

    const buildContext = {

      userRequest:
        prompt,

      framework:
        framework ||
        "Use the framework specified by the Planning Agent.",

      plan:
        planForAI,

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

    logger.info(
      "Builder Agent requesting structured code generation from centralized AI provider."
    );


    const result =
      await generateJSON({

        messages: [

          {

            role:
              "system",

            content:
              createBuilderSystemPrompt()

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

        /*
         * IMPORTANT:
         *
         * Do NOT specify:
         *
         * provider: "openai"
         * provider: "gemini"
         * model: ...
         *
         * here.
         *
         * Provider service owns the Gemini
         * model failover chain.
         */

        json:
          true,

        maxTokens:
          12000,

        thinkingLevel:
          "high"

      });


    /* =====================================================
       PROVIDER VALIDATION
    ===================================================== */

    if (
      !result ||
      result.success !== true
    ) {

      const providerError =
        result?.error ||
        "Centralized AI provider returned an unsuccessful result.";

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
       STRUCTURED RESPONSE VALIDATION
    ===================================================== */

    let parsed =
      result.data;


    /*
     * Normally generateJSON already parses
     * the provider response.
     *
     * This additional safety layer handles
     * accidental stringified JSON.
     */

    if (
      typeof parsed === "string"
    ) {

      parsed =
        safeJsonParse(
          parsed
        );

    }


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
       FILE ARRAY VALIDATION
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
       FILE NORMALIZATION
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
        currentStage,

      provider:
        error?.provider ||
        null,

      model:
        error?.model ||
        null

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  builderAgent;
