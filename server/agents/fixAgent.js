/* =========================================================
   ZyrionOS FIX AGENT
   Project Debugging & Multi-File Repair
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

const MAX_FILES =
  100;

const MAX_PATH_LENGTH =
  300;

const MAX_FILE_SIZE =
  200000;

const MAX_PROMPT_LENGTH =
  4000;

const MAX_CONTEXT_LENGTH =
  12000;


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

  const parts =
    filePath.split("/");


  if (
    parts.includes("..")
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


  if (
    !filePath ||
    filePath.length >
      MAX_PATH_LENGTH
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
   NORMALIZE FILES
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
      seen.has(filePath)
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


/* =========================
   NORMALIZE FIX REQUEST
========================= */

function normalizeFixRequest(
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

      files:
        [],

      projectId:
        "",

      framework:
        "",

      planning:
        null,

      intent:
        null,

      memoryContext:
        null,

      user:
        {}

    };

  }


  if (
    !input ||
    typeof input !== "object"
  ) {

    return {

      prompt:
        "",

      files:
        [],

      projectId:
        "",

      framework:
        "",

      planning:
        null,

      intent:
        null,

      memoryContext:
        null,

      user:
        {}

    };

  }


  return {

    prompt:
      cleanString(
        input.prompt,
        MAX_PROMPT_LENGTH
      ),

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

    intent:
      input.intent ||
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
   FIX AGENT
========================================================= */

async function fixAgent(
  input = {}
) {

  let currentStage =
    "request-normalization";


  try {

    logger.info(
      "🔧 ZyrionOS Fix Agent Started"
    );


    /* =====================================================
       INPUT
    ===================================================== */

    const request =
      normalizeFixRequest(
        input
      );


    const prompt =
      request.prompt;


    const normalizedInputFiles =
      normalizeFiles(
        request.files
      );


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!prompt) {

      return {

        success: false,

        message:
          "Fix prompt required",

        error:
          "Fix Agent received an empty debugging request.",

        stage:
          currentStage

      };

    }


    if (
      !process.env.OPENAI_API_KEY
    ) {

      return {

        success: false,

        message:
          "Fix Agent configuration error",

        error:
          "OPENAI_API_KEY is not configured on the backend.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       PROJECT FILES
    ===================================================== */

    const projectFiles =
      normalizedInputFiles.files;


    /*
     * A Fix Agent can still analyze a
     * debugging request without files,
     * but it must not pretend that it
     * repaired unseen code.
     */

    const filesContext =
      projectFiles.length > 0
        ? projectFiles
        : [];


    /* =====================================================
       PLANNING CONTEXT
    ===================================================== */

    let planningContext =
      request.planning;


    if (
      planningContext &&
      typeof planningContext ===
        "object"
    ) {

      planningContext =
        safeJson(
          planningContext
        )
          .slice(
            0,
            5000
          );

    }

    else {

      planningContext =
        "No planning context provided.";

    }


    /* =====================================================
       MEMORY CONTEXT
    ===================================================== */

    let memoryContext =
      "No memory context provided.";


    if (
      request.memoryContext
    ) {

      memoryContext =
        safeJson(
          request.memoryContext
        )
          .slice(
            0,
            3000
          );

    }


    /* =====================================================
       BUILD AI CONTEXT
    ===================================================== */

    const fixContext = {

      userRequest:
        prompt,

      projectId:
        request.projectId ||
        "not specified",

      framework:
        request.framework ||
        "not specified",

      planning:
        planningContext,

      memory:
        memoryContext,

      files:
        filesContext

    };


    const serializedContext =
      safeJson(
        fixContext
      )
        .slice(
          0,
          MAX_CONTEXT_LENGTH
        );


    /* =====================================================
       OPENAI FIX
    ===================================================== */

    currentStage =
      "openai-fix";


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

You are the Fix Agent of ZyrionOS
Autonomous AI OS.

You are a senior software debugging
and repair engineer.

Your responsibility is to analyze the
provided user request and project files,
identify real problems, and produce
safe corrected files when enough source
code is available.

CORE RESPONSIBILITIES:

- detect bugs
- diagnose errors
- repair broken code
- improve API logic
- improve frontend logic
- improve backend logic
- improve error handling
- improve security
- improve performance
- improve maintainability
- improve scalability when appropriate
- preserve existing functionality
- avoid unnecessary rewrites

IMPORTANT:

You only have access to the files included
in the request.

NEVER claim that you inspected or fixed a
file that was not provided.

If no source files are provided, explain
the issue through the "issues" and "fixes"
arrays but return an empty "files" array.

Return ONLY valid JSON.

REQUIRED JSON FORMAT:

{
  "issues": [],
  "fixes": [],
  "optimizedCode": "",
  "files": []
}

FILES FORMAT:

[
  {
    "path": "src/example.js",
    "content": "complete corrected file content"
  }
]

STRICT RULES:

1. Return JSON only.
2. Never use markdown.
3. Never use triple backticks.
4. Never put explanations outside JSON.
5. "issues" must be an array.
6. "fixes" must be an array.
7. "optimizedCode" must be a string.
8. "files" must be an array.
9. Every returned file must have a valid
   relative path.
10. Never use absolute paths.
11. Never use "../" path traversal.
12. Never include API keys.
13. Never include passwords.
14. Never include authentication tokens.
15. Never include cookies.
16. Never include private credentials.
17. Use environment variables for secrets.
18. Do not invent files.
19. Do not invent errors.
20. Do not claim a fix was applied unless
    corrected content is returned.
21. Preserve unrelated working functionality.
22. Do not rewrite the entire project
    unnecessarily.
23. When fixing a file, return its COMPLETE
    corrected content.
24. Do not return partial snippets as files.
25. Keep imports consistent.
26. Keep file paths consistent.
27. Do not duplicate file paths.
28. Do not return empty file content for
    a corrected file.
29. If the source code is already correct,
    do not modify it unnecessarily.
30. Do not claim deployment, database,
    AWS, Docker, SSL, payment, or external
    infrastructure changes actually happened.
31. Only return code that can be reasonably
    derived from the supplied source files
    and the user's request.

MULTI-FILE REPAIR:

When multiple supplied files interact,
consider their interfaces together.

For example:

- controller → service
- service → API
- Master Agent → Intent Agent
- Intent Agent → Planning Agent
- Planning Agent → Builder Agent
- Builder Agent → project files

If an interface mismatch is identified,
return the affected complete files.

SECURITY:

Reject path traversal.

Never generate:

- ../../secret
- absolute filesystem paths
- hard-coded credentials
- private keys
- access tokens

OUTPUT:

issues:
Short descriptions of actual or strongly
supported problems.

fixes:
Short descriptions of the changes made.

optimizedCode:
Use this only for a single-code repair
when useful. Otherwise return an empty
string.

files:
Return complete corrected files when
source files were supplied and a repair
is appropriate.

`

            },

            {

              role:
                "user",

              content:
                serializedContext

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
          "Fix Agent received an empty AI response",

        error:
          "OpenAI returned no debugging or repair result.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       JSON PARSE
    ===================================================== */

    currentStage =
      "fix-json-parse";


    const parsed =
      safeJsonParse(
        raw
      );


    if (!parsed) {

      logger.warning(
        "Fix Agent JSON Parse Failed"
      );


      return {

        success: false,

        message:
          "Invalid AI JSON response",

        error:
          "Fix Agent could not parse the AI repair response.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       NORMALIZE ISSUES
    ===================================================== */

    const issues =
      Array.isArray(
        parsed.issues
      )
        ? parsed.issues
            .filter(Boolean)
            .map(
              (item) =>
                typeof item === "string"
                  ? item.trim()
                  : item
            )
            .filter(Boolean)
        : [];


    /* =====================================================
       NORMALIZE FIXES
    ===================================================== */

    const fixes =
      Array.isArray(
        parsed.fixes
      )
        ? parsed.fixes
            .filter(Boolean)
            .map(
              (item) =>
                typeof item === "string"
                  ? item.trim()
                  : item
            )
            .filter(Boolean)
        : [];


    /* =====================================================
       NORMALIZE OPTIMIZED CODE
    ===================================================== */

    const optimizedCode =
      typeof parsed.optimizedCode ===
        "string"
        ? parsed.optimizedCode
        : "";


    /* =====================================================
       NORMALIZE FIXED FILES
    ===================================================== */

    currentStage =
      "fixed-files-validation";


    const fixedFileResult =
      normalizeFiles(
        parsed.files
      );


    /* =====================================================
       NO FALSE SUCCESS
    ===================================================== */

    /*
     * If source files were provided and
     * the AI claims a repair but returns
     * no corrected files, we still return
     * the analysis, but clearly mark that
     * no file content was produced.
     */

    const hasSourceFiles =
      projectFiles.length > 0;


    const hasFixedFiles =
      fixedFileResult.files.length > 0;


    /* =====================================================
       RESULT
    ===================================================== */

    const result = {

      success: true,

      data: {

        issues,

        fixes,

        optimizedCode,

        files:
          fixedFileResult.files

      },

      metadata: {

        agent:
          "fixAgent",

        model:
          "gpt-4.1-mini",

        projectId:
          request.projectId ||
          null,

        framework:
          request.framework ||
          null,

        sourceFiles:
          projectFiles.length,

        fixedFiles:
          fixedFileResult.files.length,

        invalidFiles:
          fixedFileResult.invalidCount,

        duplicateFiles:
          fixedFileResult.duplicateCount,

        hasSourceFiles,

        hasFixedFiles,

        generatedAt:
          new Date()

      }

    };


    /* =====================================================
       LOG RESULT
    ===================================================== */

    logger.success(
      `Fix Agent Completed: ${issues.length} issues, ${fixedFileResult.files.length} corrected files`
    );


    /* =====================================================
       RETURN
    ===================================================== */

    return result;

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown Fix Agent error";


    logger.error(
      `Fix Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success: false,

      message:
        "Fix Agent Failed",

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
  fixAgent;
