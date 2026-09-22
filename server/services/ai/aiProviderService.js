/* =========================================================
   ZYRIONOS AI PROVIDER SERVICE
   DEEPSEEK PRIMARY + CLAUDE FALLBACK

   PRODUCTION PROVIDER ARCHITECTURE

   Primary:
     DeepSeek

   Fallback:
     Anthropic Claude

   IMPORTANT:
     - Gemini is completely removed from the active provider layer.
     - OpenAI is NOT an active provider.
     - The "openai" npm package is used only as the
       OpenAI-compatible SDK client for DeepSeek.
     - Agents must call this service, never providers directly.

   Provider order:
     1. DeepSeek
     2. Claude

   Failure policy:
     - Temporary failures:
         controlled retry
         then provider fallback
     - Quota / balance:
         no retry
         fallback immediately
     - Authentication / configuration:
         no retry
         fallback immediately
     - Invalid request:
         no retry
         no pointless retry loop
     - Timeout:
         treated as temporary
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const OpenAI =
  require("openai");

const Anthropic =
  require("@anthropic-ai/sdk");


/* =========================================================
   CONFIG
========================================================= */

const env =
  require("../../config/env");


/* =========================================================
   LOGGER
========================================================= */

const logger =
  require("../loggerService");


/* =========================================================
   PROVIDER CLIENTS
========================================================= */

let deepseekClient = null;

let claudeClient = null;


/* =========================================================
   PROVIDER CONFIGURATION
========================================================= */

const PRIMARY_PROVIDER =
  "deepseek";

const FALLBACK_PROVIDER =
  "claude";


/* =========================================================
   MODEL CONFIGURATION
========================================================= */

/*
 * Current DeepSeek API model names:
 *
 * deepseek-flash
 * deepseek-v4-pro
 *
 * deepseek-flash currently maps to the current
 * DeepSeek V4.1 Flash API model.
 */

const PRIMARY_DEEPSEEK_MODEL =
  env.DEEPSEEK_MODEL ||
  "deepseek-flash";


/*
 * Claude fallback.
 *
 * Keep this configurable through environment variables
 * so the model can be changed without modifying source code.
 */

const PRIMARY_CLAUDE_MODEL =
  env.CLAUDE_MODEL ||
  "claude-sonnet-4-6";


/* =========================================================
   RETRY CONFIGURATION
========================================================= */

const AI_MAX_RETRIES =
  Number.isFinite(
    Number(
      env.AI_PROVIDER_MAX_RETRIES
    )
  )
    ? Math.max(
        0,
        Math.floor(
          Number(
            env.AI_PROVIDER_MAX_RETRIES
          )
        )
      )
    : 1;


const AI_RETRY_BASE_DELAY_MS =
  Number.isFinite(
    Number(
      env.AI_PROVIDER_RETRY_BASE_DELAY_MS
    )
  )
    ? Math.max(
        100,
        Number(
          env.AI_PROVIDER_RETRY_BASE_DELAY_MS
        )
      )
    : 1200;


const AI_MAX_RETRY_DELAY_MS =
  Number.isFinite(
    Number(
      env.AI_PROVIDER_MAX_RETRY_DELAY_MS
    )
  )
    ? Math.max(
        AI_RETRY_BASE_DELAY_MS,
        Number(
          env.AI_PROVIDER_MAX_RETRY_DELAY_MS
        )
      )
    : 5000;


/* =========================================================
   TIMEOUT
========================================================= */

const AI_PROVIDER_TIMEOUT_MS =
  Number.isFinite(
    Number(
      env.AI_PROVIDER_TIMEOUT_MS
    )
  )
    ? Math.max(
        1000,
        Number(
          env.AI_PROVIDER_TIMEOUT_MS
        )
      )
    : 120000;


/* =========================================================
   CLIENT INITIALIZATION
========================================================= */


/*
 * DeepSeek
 *
 * DeepSeek exposes an OpenAI-compatible API.
 *
 * IMPORTANT:
 * This is NOT OpenAI provider usage.
 *
 * The OpenAI SDK is simply being used as the compatible
 * HTTP client for DeepSeek.
 */

if (
  env.DEEPSEEK_API_KEY
) {

  deepseekClient =
    new OpenAI({

      apiKey:
        env.DEEPSEEK_API_KEY,

      baseURL:
        env.DEEPSEEK_BASE_URL ||
        "https://api.deepseek.com",

      timeout:
        AI_PROVIDER_TIMEOUT_MS,

      maxRetries:
        0

    });

}


/*
 * Anthropic Claude
 */

if (
  env.ANTHROPIC_API_KEY
) {

  claudeClient =
    new Anthropic({

      apiKey:
        env.ANTHROPIC_API_KEY,

      timeout:
        AI_PROVIDER_TIMEOUT_MS,

      maxRetries:
        0

    });

}


/* =========================================================
   NORMALIZE PROVIDER
========================================================= */

function normalizeProvider(
  provider
) {

  const value =
    String(
      provider || ""
    )
      .trim()
      .toLowerCase();


  if (
    [
      "deepseek",
      "deep-seek"
    ].includes(
      value
    )
  ) {

    return "deepseek";

  }


  if (
    [
      "claude",
      "anthropic"
    ].includes(
      value
    )
  ) {

    return "claude";

  }


  /*
   * Gemini is intentionally no longer supported.
   */

  if (
    value === "gemini"
  ) {

    return null;

  }


  /*
   * OpenAI is intentionally no longer supported
   * as a production provider.
   */

  if (
    value === "openai"
  ) {

    return null;

  }


  return null;

}


/* =========================================================
   PROVIDER AVAILABLE
========================================================= */

function isProviderAvailable(
  provider
) {

  const normalized =
    normalizeProvider(
      provider
    );


  if (
    normalized === "deepseek"
  ) {

    return Boolean(
      deepseekClient &&
      env.DEEPSEEK_API_KEY
    );

  }


  if (
    normalized === "claude"
  ) {

    return Boolean(
      claudeClient &&
      env.ANTHROPIC_API_KEY
    );

  }


  return false;

}


/* =========================================================
   PROVIDER ORDER
========================================================= */

function getProviderOrder(
  options = {}
) {

  const requested =
    normalizeProvider(
      options.provider
    );


  /*
   * Explicit valid provider request.
   *
   * If a caller specifically asks for Claude,
   * Claude is attempted first.
   *
   * Otherwise DeepSeek remains primary.
   */

  if (
    requested === "claude"
  ) {

    return [

      "claude",

      "deepseek"

    ];

  }


  /*
   * DeepSeek is always the production primary.
   */

  return [

    "deepseek",

    "claude"

  ];

}


/* =========================================================
   TIMEOUT WRAPPER
========================================================= */

function withTimeout(
  promise,
  timeoutMs,
  provider,
  model
) {

  const timeout =
    Number(
      timeoutMs
    );


  if (
    !Number.isFinite(
      timeout
    ) ||
    timeout <= 0
  ) {

    return promise;

  }


  let timer =
    null;


  const timeoutPromise =
    new Promise(
      (_, reject) => {

        timer =
          setTimeout(
            () => {

              const error =
                new Error(
                  `${provider} AI provider timed out after ${timeout}ms`
                );


              error.code =
                "AI_PROVIDER_TIMEOUT";


              error.provider =
                provider;


              error.model =
                model;


              reject(
                error
              );

            },
            timeout
          );

      }
    );


  return Promise.race(
    [

      promise,

      timeoutPromise

    ]
  ).finally(
    () => {

      if (
        timer
      ) {

        clearTimeout(
          timer
        );

      }

    }
  );

}


/* =========================================================
   ERROR STATUS
========================================================= */

function getErrorStatus(
  error
) {

  if (
    !error
  ) {

    return null;

  }


  const candidates = [

    error.status,

    error.statusCode,

    error?.response?.status,

    error?.error?.status,

    error?.error?.code

  ];


  for (
    const candidate of candidates
  ) {

    const numeric =
      Number(
        candidate
      );


    if (
      Number.isFinite(
        numeric
      )
    ) {

      return numeric;

    }

  }


  return null;

}


/* =========================================================
   ERROR CODE
========================================================= */

function getErrorCode(
  error
) {

  if (
    !error
  ) {

    return "";

  }


  return String(

    error.code ||

    error?.error?.code ||

    error?.error?.status ||

    error?.statusText ||

    ""

  )
    .trim()
    .toUpperCase();

}


/* =========================================================
   ERROR MESSAGE
========================================================= */

function getErrorMessage(
  error
) {

  return String(

    error?.message ||

    error?.error?.message ||

    error?.response?.data?.message ||

    ""

  )
    .trim();

}


/* =========================================================
   ERROR CLASSIFICATION
========================================================= */

function classifyProviderError(
  error
) {

  const status =
    getErrorStatus(
      error
    );


  const code =
    getErrorCode(
      error
    );


  const message =
    getErrorMessage(
      error
    ).toLowerCase();


  /*
   * =======================================================
   * TIMEOUT
   * =======================================================
   */

  if (
    error?.code ===
      "AI_PROVIDER_TIMEOUT" ||
    error?.code ===
      "ETIMEDOUT" ||
    error?.code ===
      "ECONNRESET"
  ) {

    return {

      category:
        "temporary",

      retryable:
        true,

      fallback:
        true

    };

  }


  /*
   * =======================================================
   * QUOTA / BALANCE / RATE LIMIT
   * =======================================================
   *
   * These are not blindly retried.
   *
   * The next provider gets a chance.
   */

  const quotaPhrases = [

    "quota",

    "resource exhausted",

    "rate limit",

    "too many requests",

    "insufficient balance",

    "insufficient funds",

    "billing",

    "credit balance",

    "usage limit",

    "exceeded your current quota"

  ];


  if (
    status === 429 ||
    quotaPhrases.some(
      (phrase) =>
        message.includes(
          phrase
        )
    )
  ) {

    return {

      category:
        "quota",

      retryable:
        false,

      fallback:
        true

    };

  }


  /*
   * =======================================================
   * AUTHENTICATION
   * =======================================================
   */

  if (
    [
      401,
      403
    ].includes(
      status
    ) ||
    [
      "UNAUTHORIZED",
      "AUTHENTICATION_ERROR",
      "PERMISSION_DENIED",
      "INVALID_API_KEY"
    ].includes(
      code
    ) ||
    message.includes(
      "invalid api key"
    ) ||
    message.includes(
      "authentication"
    )
  ) {

    return {

      category:
        "authentication",

      retryable:
        false,

      fallback:
        true

    };

  }


  /*
   * =======================================================
   * CONFIGURATION
   * =======================================================
   */

  if (
    error?.code ===
      "AI_PROVIDER_NOT_CONFIGURED"
  ) {

    return {

      category:
        "configuration",

      retryable:
        false,

      fallback:
        true

    };

  }


  /*
   * =======================================================
   * INVALID REQUEST
   * =======================================================
   */

  if (
    status === 400 ||
    status === 422
  ) {

    return {

      category:
        "invalid_request",

      retryable:
        false,

      fallback:
        false

    };

  }


  /*
   * =======================================================
   * TEMPORARY SERVER FAILURE
   * =======================================================
   */

  if (
    [
      408,
      500,
      502,
      503,
      504
    ].includes(
      status
    )
  ) {

    return {

      category:
        "temporary",

      retryable:
        true,

      fallback:
        true

    };

  }


  const temporaryPhrases = [

    "temporarily unavailable",

    "service unavailable",

    "internal server error",

    "bad gateway",

    "gateway timeout",

    "try again later",

    "overloaded",

    "high demand",

    "capacity",

    "deadline exceeded",

    "server error"

  ];


  if (
    temporaryPhrases.some(
      (phrase) =>
        message.includes(
          phrase
        )
    )
  ) {

    return {

      category:
        "temporary",

      retryable:
        true,

      fallback:
        true

    };

  }


  /*
   * =======================================================
   * UNKNOWN PROVIDER FAILURE
   * =======================================================
   *
   * Do not endlessly retry unknown failures.
   * Give the fallback provider a chance.
   */

  return {

    category:
      "provider_error",

    retryable:
      false,

    fallback:
      true

  };

}


/* =========================================================
   RETRY DELAY
========================================================= */

function getRetryDelay(
  attempt,
  error = null
) {

  const retryAfterCandidates = [

    error?.retryAfterMs,

    error?.retryAfter,

    error?.response?.headers?.["retry-after"],

    error?.response?.headers?.["Retry-After"]

  ];


  for (
    const candidate of retryAfterCandidates
  ) {

    const numeric =
      Number(
        candidate
      );


    if (
      Number.isFinite(
        numeric
      ) &&
      numeric > 0
    ) {

      if (
        candidate ===
        error?.retryAfterMs
      ) {

        return Math.min(
          numeric,
          AI_MAX_RETRY_DELAY_MS
        );

      }


      return Math.min(
        numeric * 1000,
        AI_MAX_RETRY_DELAY_MS
      );

    }

  }


  const exponent =
    Math.max(
      0,
      attempt - 1
    );


  const base =
    AI_RETRY_BASE_DELAY_MS *
    Math.pow(
      2,
      exponent
    );


  const jitter =
    Math.floor(
      Math.random() *
      300
    );


  return Math.min(
    base + jitter,
    AI_MAX_RETRY_DELAY_MS
  );

}


/* =========================================================
   SLEEP
========================================================= */

function sleep(
  ms
) {

  return new Promise(
    (resolve) => {

      setTimeout(
        resolve,
        ms
      );

    }
  );

}


/* =========================================================
   NORMALIZE MESSAGES
========================================================= */

function normalizeMessages(
  messages = []
) {

  if (
    !Array.isArray(
      messages
    )
  ) {

    return [];

  }


  return messages

    .filter(
      (message) =>
        message &&
        typeof message.content ===
          "string" &&
        message.content.trim()
    )

    .map(
      (message) => {

        const role =
          [

            "system",

            "user",

            "assistant"

          ].includes(
            message.role
          )
            ? message.role
            : "user";


        return {

          role,

          content:
            message.content

        };

      }
    );

}


/* =========================================================
   BUILD MESSAGES
========================================================= */

function buildMessages(
  options = {}
) {

  let messages = [];


  /*
   * Existing OpenAI-style messages.
   *
   * This format is intentionally kept because it makes
   * migration easier for existing ZyrionOS agents.
   */

  if (
    Array.isArray(
      options.messages
    )
  ) {

    messages =
      normalizeMessages(
        options.messages
      );

  }


  /*
   * Plain prompt.
   */

  if (
    messages.length === 0 &&
    typeof options.prompt === "string" &&
    options.prompt.trim()
  ) {

    messages = [

      {

        role:
          "user",

        content:
          options.prompt.trim()

      }

    ];

  }


  /*
   * Contents compatibility.
   */

  if (
    messages.length === 0 &&
    typeof options.contents === "string" &&
    options.contents.trim()
  ) {

    messages = [

      {

        role:
          "user",

        content:
          options.contents.trim()

      }

    ];

  }


  /*
   * System instruction.
   */

  if (
    typeof options.systemInstruction ===
      "string" &&
    options.systemInstruction.trim()
  ) {

    const existingSystemIndex =
      messages.findIndex(
        (message) =>
          message.role ===
          "system"
      );


    if (
      existingSystemIndex >= 0
    ) {

      messages[
        existingSystemIndex
      ] = {

        role:
          "system",

        content:
          options.systemInstruction.trim()

      };

    }

    else {

      messages.unshift({

        role:
          "system",

        content:
          options.systemInstruction.trim()

      });

    }

  }


  return messages;

}


/* =========================================================
   VALIDATE MESSAGES
========================================================= */

function validateMessages(
  messages
) {

  return (

    Array.isArray(
      messages
    ) &&

    messages.length > 0 &&

    messages.some(
      (message) =>
        message &&
        typeof message.content ===
          "string" &&
        message.content.trim()
    )

  );

}


/* =========================================================
   THINKING / REASONING EFFORT
========================================================= */

function normalizeReasoningEffort(
  value
) {

  const normalized =
    String(
      value ||
      "high"
    )
      .trim()
      .toLowerCase();


  if (
    [
      "low",
      "high",
      "max"
    ].includes(
      normalized
    )
  ) {

    return normalized;

  }


  /*
   * Backwards compatibility:
   * "medium" previously existed in the Gemini service.
   *
   * DeepSeek's current V4 reasoning levels are
   * low / high / max.
   */

  if (
    normalized ===
    "medium"
  ) {

    return "high";

  }


  return "high";

}


/* =========================================================
   DEEPSEEK GENERATION
========================================================= */

async function generateWithDeepSeek(
  options = {}
) {

  if (
    !deepseekClient ||
    !env.DEEPSEEK_API_KEY
  ) {

    const error =
      new Error(
        "DeepSeek provider is not configured"
      );


    error.code =
      "AI_PROVIDER_NOT_CONFIGURED";


    error.provider =
      "deepseek";


    throw error;

  }


  const messages =
    buildMessages(
      options
    );


  if (
    !validateMessages(
      messages
    )
  ) {

    const error =
      new Error(
        "AI messages are required"
      );


    error.code =
      "AI_INVALID_REQUEST";


    error.provider =
      "deepseek";


    throw error;

  }


  const model =
    options.model &&
    String(
      options.model
    ).startsWith(
      "deepseek-"
    )
      ? options.model
      : PRIMARY_DEEPSEEK_MODEL;


  const request = {

    model,

    messages,

    stream:
      false

  };


  /*
   * Maximum output tokens.
   */

  if (
    Number.isFinite(
      options.maxTokens
    )
  ) {

    request.max_tokens =
      Math.max(
        1,
        Math.floor(
          options.maxTokens
        )
      );

  }


  /*
   * JSON output.
   */

  if (
    options.json === true
  ) {

    request.response_format = {

      type:
        "json_object"

    };

  }


  /*
   * Current DeepSeek thinking configuration.
   *
   * "low" / "high" / "max".
   */

  if (
    options.thinking !== false
  ) {

    request.thinking = {

      type:
        "enabled"

    };


    request.reasoning_effort =
      normalizeReasoningEffort(
        options.thinkingLevel ||
        options.reasoningEffort
      );

  }


  /*
   * Optional temperature.
   *
   * Only pass it when explicitly supplied.
   */

  if (
    Number.isFinite(
      options.temperature
    )
  ) {

    request.temperature =
      Number(
        options.temperature
      );

  }


  try {

    const response =
      await withTimeout(

        deepseekClient.chat.completions.create(
          request
        ),

        AI_PROVIDER_TIMEOUT_MS,

        "deepseek",

        model

      );


    const choice =
      response?.choices?.[0];


    const text =
      typeof choice?.message?.content ===
        "string"
        ? choice.message.content
        : "";


    if (
      !text.trim()
    ) {

      const error =
        new Error(
          "DeepSeek returned an empty response"
        );


      error.code =
        "AI_EMPTY_RESPONSE";


      error.provider =
        "deepseek";


      error.model =
        model;


      throw error;

    }


    return {

      success:
        true,

      provider:
        "deepseek",

      model,

      text:
        text.trim(),

      raw:
        response,

      usage:
        response?.usage ||
        null

    };

  }

  catch (
    error
  ) {

    error.provider =
      error.provider ||
      "deepseek";


    error.model =
      error.model ||
      model;


    throw error;

  }

}


/* =========================================================
   CLAUDE GENERATION
========================================================= */

async function generateWithClaude(
  options = {}
) {

  if (
    !claudeClient ||
    !env.ANTHROPIC_API_KEY
  ) {

    const error =
      new Error(
        "Claude provider is not configured"
      );


    error.code =
      "AI_PROVIDER_NOT_CONFIGURED";


    error.provider =
      "claude";


    throw error;

  }


  const messages =
    buildMessages(
      options
    );


  if (
    !validateMessages(
      messages
    )
  ) {

    const error =
      new Error(
        "AI messages are required"
      );


    error.code =
      "AI_INVALID_REQUEST";


    error.provider =
      "claude";


    throw error;

  }


  const model =
    options.model &&
    String(
      options.model
    ).startsWith(
      "claude-"
    )
      ? options.model
      : PRIMARY_CLAUDE_MODEL;


  /*
   * Anthropic Messages API keeps system
   * outside the messages array.
   */

  const systemMessages =
    messages.filter(
      (message) =>
        message.role ===
        "system"
    );


  const conversationMessages =
    messages

      .filter(
        (message) =>
          message.role !==
          "system"
      )

      .map(
        (message) => ({

          role:
            message.role ===
            "assistant"
              ? "assistant"
              : "user",

          content:
            message.content

        })
      );


  if (
    conversationMessages.length === 0
  ) {

    const error =
      new Error(
        "Claude requires at least one user or assistant message"
      );


    error.code =
      "AI_INVALID_REQUEST";


    error.provider =
      "claude";


    throw error;

  }


  const request = {

    model,

    max_tokens:
      Number.isFinite(
        options.maxTokens
      )
        ? Math.max(
            1,
            Math.floor(
              options.maxTokens
            )
          )
        : 8192,

    messages:
      conversationMessages

  };


  if (
    systemMessages.length > 0
  ) {

    request.system =
      systemMessages
        .map(
          (message) =>
            message.content
        )
        .join(
          "\n\n"
        );

  }


  /*
   * JSON output is handled through prompting
   * plus parser validation below.
   *
   * Do not pass unsupported provider-specific
   * parameters blindly.
   */

  /*
   * Extended thinking can be enabled when requested.
   *
   * Keep it opt-in for Claude because thinking budgets
   * affect output-token requirements.
   */

  if (
    options.thinking === true &&
    Number.isFinite(
      options.thinkingBudget
    )
  ) {

    request.thinking = {

      type:
        "enabled",

      budget_tokens:
        Math.max(
          1024,
          Math.floor(
            options.thinkingBudget
          )
        )

    };

  }


  try {

    const response =
      await withTimeout(

        claudeClient.messages.create(
          request
        ),

        AI_PROVIDER_TIMEOUT_MS,

        "claude",

        model

      );


    const text =
      Array.isArray(
        response?.content
      )
        ? response.content

            .filter(
              (block) =>
                block?.type ===
                "text"
            )

            .map(
              (block) =>
                block.text
            )

            .join(
              ""
            )
        : "";


    if (
      !text.trim()
    ) {

      const error =
        new Error(
          "Claude returned an empty response"
        );


      error.code =
        "AI_EMPTY_RESPONSE";


      error.provider =
        "claude";


      error.model =
        model;


      throw error;

    }


    return {

      success:
        true,

      provider:
        "claude",

      model,

      text:
        text.trim(),

      raw:
        response,

      usage:
        response?.usage ||
        null

    };

  }

  catch (
    error
  ) {

    error.provider =
      error.provider ||
      "claude";


    error.model =
      error.model ||
      model;


    throw error;

  }

}


/* =========================================================
   PROVIDER GENERATOR
========================================================= */

async function generateWithProvider(
  provider,
  options
) {

  if (
    provider ===
    "deepseek"
  ) {

    return generateWithDeepSeek(
      options
    );

  }


  if (
    provider ===
    "claude"
  ) {

    return generateWithClaude(
      options
    );

  }


  const error =
    new Error(
      `Unsupported AI provider: ${provider}`
    );


  error.code =
    "AI_UNSUPPORTED_PROVIDER";


  error.provider =
    provider;


  throw error;

}


/* =========================================================
   GENERATE TEXT
========================================================= */

async function generateText(
  options = {}
) {

  const providerOrder =
    getProviderOrder(
      options
    );


  const configuredProviders =
    providerOrder.filter(
      isProviderAvailable
    );


  if (
    configuredProviders.length === 0
  ) {

    const error =
      new Error(
        "No AI provider is configured. Configure DEEPSEEK_API_KEY and/or ANTHROPIC_API_KEY."
      );


    error.code =
      "AI_NO_PROVIDER";


    error.provider =
      null;


    throw error;

  }


  const providerErrors = [];


  for (
    const provider of configuredProviders
  ) {

    let attempt =
      0;


    while (
      attempt <=
      AI_MAX_RETRIES
    ) {

      try {

        if (
          attempt > 0
        ) {

          const previousError =
            providerErrors[
              providerErrors.length - 1
            ]?.error;


          const delay =
            getRetryDelay(
              attempt,
              previousError
            );


          logger.warning(
            `${provider} transient retry | attempt=${attempt + 1} | delay=${delay}ms`
          );


          await sleep(
            delay
          );

        }


        const model =
          provider ===
          "deepseek"
            ? (
                options.model &&
                String(
                  options.model
                ).startsWith(
                  "deepseek-"
                )
                  ? options.model
                  : PRIMARY_DEEPSEEK_MODEL
              )
            : (
                options.model &&
                String(
                  options.model
                ).startsWith(
                  "claude-"
                )
                  ? options.model
                  : PRIMARY_CLAUDE_MODEL
              );


        logger.info(
          `AI Request: ${provider}/${model} | attempt=${attempt + 1}`
        );


        const result =
          await generateWithProvider(
            provider,
            options
          );


        logger.success(
          `AI Success: ${provider}/${result.model}`
        );


        return result;

      }

      catch (
        error
      ) {

        const classification =
          classifyProviderError(
            error
          );


        const message =
          getErrorMessage(
            error
          ) ||
          "Unknown provider error";


        providerErrors.push({

          provider,

          model:
            error?.model ||
            null,

          attempt:
            attempt + 1,

          category:
            classification.category,

          retryable:
            classification.retryable,

          fallback:
            classification.fallback,

          message,

          code:
            error?.code ||
            "AI_PROVIDER_ERROR",

          status:
            getErrorStatus(
              error
            ),

          error

        });


        logger.warning(
          `AI Provider Failed: ${provider} | attempt=${attempt + 1} | category=${classification.category} | retryable=${classification.retryable} | ${message}`
        );


        /*
         * Invalid request:
         * do not switch provider.
         *
         * The request itself is the problem.
         */

        if (
          classification.category ===
          "invalid_request"
        ) {

          throw error;

        }


        /*
         * Retry only genuine temporary failures.
         */

        if (
          classification.retryable &&
          attempt <
            AI_MAX_RETRIES
        ) {

          attempt += 1;

          continue;

        }


        /*
         * Provider exhausted.
         *
         * Move to next provider.
         */

        break;

      }

    }

  }


  /*
   * =======================================================
   * ALL PROVIDERS FAILED
   * =======================================================
   */

  const finalError =
    new Error(
      "All configured AI providers failed."
    );


  finalError.code =
    "AI_ALL_PROVIDERS_FAILED";


  finalError.provider =
    null;


  /*
   * Do not expose raw SDK errors as the main
   * application message.
   *
   * Keep structured diagnostics for logging/debugging.
   */

  finalError.providers =
    providerErrors.map(
      (item) => ({

        provider:
          item.provider,

        model:
          item.model,

        attempt:
          item.attempt,

        category:
          item.category,

        retryable:
          item.retryable,

        fallback:
          item.fallback,

        message:
          item.message,

        code:
          item.code,

        status:
          item.status

      })
    );


  logger.error(
    `AI Provider Chain Failed: ${finalError.providers
      .map(
        (item) => {

          const model =
            item.model
              ? `/${item.model}`
              : "";


          return (

            `${item.provider}${model}: ` +

            `${item.category}: ` +

            `${item.message}`

          );

        }
      )
      .join(
        " | "
      )}`
  );


  throw finalError;

}


/* =========================================================
   GENERATE JSON
========================================================= */

async function generateJSON(
  options = {}
) {

  const result =
    await generateText({

      ...options,

      json:
        true

    });


  let parsed;


  try {

    parsed =
      JSON.parse(
        result.text
      );

  }

  catch (
    firstParseError
  ) {

    try {

      const cleaned =
        result.text

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


      parsed =
        JSON.parse(
          cleaned
        );

    }

    catch (
      secondParseError
    ) {

      const parseError =
        new Error(
          `${result.provider} returned invalid JSON: ${secondParseError.message}`
        );


      parseError.code =
        "AI_INVALID_JSON";


      parseError.provider =
        result.provider;


      parseError.model =
        result.model;


      parseError.rawText =
        result.text;


      throw parseError;

    }

  }


  return {

    ...result,

    data:
      parsed

  };

}


/* =========================================================
   PROVIDER STATUS
========================================================= */

function getProviderStatus() {

  const deepseekConfigured =
    isProviderAvailable(
      "deepseek"
    );


  const claudeConfigured =
    isProviderAvailable(
      "claude"
    );


  return {

    mode:
      "deepseek-primary-claude-fallback",

    primary:
      PRIMARY_PROVIDER,

    fallback:
      FALLBACK_PROVIDER,

    providers: {

      deepseek: {

        configured:
          deepseekConfigured,

        enabled:
          true,

        primary:
          true,

        model:
          PRIMARY_DEEPSEEK_MODEL,

        baseURL:
          env.DEEPSEEK_BASE_URL ||
          "https://api.deepseek.com"

      },

      claude: {

        configured:
          claudeConfigured,

        enabled:
          true,

        primary:
          false,

        fallback:
          true,

        model:
          PRIMARY_CLAUDE_MODEL

      },

      /*
       * Gemini intentionally appears only as
       * a disabled legacy status entry.
       *
       * No Gemini client, SDK, model or API call
       * exists in this service.
       */

      gemini: {

        configured:
          false,

        enabled:
          false,

        removed:
          true

      },

      /*
       * OpenAI is NOT a production provider.
       *
       * The openai package may exist solely because
       * DeepSeek exposes an OpenAI-compatible API.
       */

      openai: {

        configured:
          false,

        enabled:
          false,

        productionProvider:
          false,

        reason:
          "OpenAI is not configured or called as a provider. The OpenAI-compatible SDK is used only as the DeepSeek client."

      }

    },

    retry: {

      maxRetries:
        AI_MAX_RETRIES,

      baseDelayMs:
        AI_RETRY_BASE_DELAY_MS,

      maxDelayMs:
        AI_MAX_RETRY_DELAY_MS

    },

    fallback: {

      enabled:
        true,

      order: [

        "deepseek",

        "claude"

      ]

    },

    timeoutMs:
      AI_PROVIDER_TIMEOUT_MS

  };

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  generateText,

  generateJSON,

  getProviderStatus,

  isProviderAvailable

};
