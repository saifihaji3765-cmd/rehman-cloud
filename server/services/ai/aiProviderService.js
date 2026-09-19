/* =========================================================
   ZYRIONOS AI PROVIDER SERVICE
   GEMINI ONLY - OPENAI TEMPORARILY DISABLED
   ---------------------------------------------------------
   Production AI chain:

   Gemini 3.8 Flash
        ↓ transient failure
   Gemini 3.7 Flash
        ↓ transient failure
   Gemini 3.6 Flash

   OpenAI:
   - NOT DELETED
   - NOT USED
   - NOT CALLED
   - TEMPORARILY DISABLED
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const {
  GoogleGenAI,
  ThinkingLevel
} = require("@google/genai");


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
   GEMINI CLIENT
========================================================= */

let geminiClient = null;


/* =========================================================
   OPENAI STATUS
   ---------------------------------------------------------
   OpenAI is intentionally disabled at provider-service level.

   We do NOT delete OpenAI from package.json or env.js.
   It simply cannot receive production AI requests.
========================================================= */

const OPENAI_TEMPORARILY_DISABLED =
  true;


/* =========================================================
   GEMINI INITIALIZATION
========================================================= */

if (
  env.GEMINI_API_KEY
) {

  geminiClient =
    new GoogleGenAI({

      apiKey:
        env.GEMINI_API_KEY

    });

}


/* =========================================================
   GEMINI MODEL FALLBACK CHAIN
   ---------------------------------------------------------
   Primary:
   1. Gemini 3.8 Flash

   Fallback:
   2. Gemini 3.7 Flash
   3. Gemini 3.6 Flash

   These are stable Gemini models according to
   Google's current model documentation.
========================================================= */

const GEMINI_MODEL_CHAIN = [

  "gemini-3.8-flash",

  "gemini-3.7-flash",

  "gemini-3.6-flash"

];


/* =========================================================
   RETRY CONFIGURATION
========================================================= */

const GEMINI_MAX_RETRIES =
  1;


/*
 * Small backoff between retry attempts.
 *
 * Attempt 1:
 * immediate
 *
 * Attempt 2:
 * short delay
 */

const GEMINI_RETRY_BASE_DELAY_MS =
  800;


/* =========================================================
   PROVIDER HELPERS
========================================================= */


/* =========================================================
   PROVIDER AVAILABLE
========================================================= */

function isProviderAvailable(
  provider
) {

  const normalized =
    String(
      provider || ""
    )
      .trim()
      .toLowerCase();


  if (
    normalized === "gemini"
  ) {

    return Boolean(
      geminiClient &&
      env.GEMINI_API_KEY
    );

  }


  /*
   * OpenAI intentionally unavailable.
   *
   * This does NOT mean OpenAI was deleted.
   * It only means ZyrionOS will not send
   * production requests to OpenAI.
   */

  if (
    normalized === "openai"
  ) {

    return false;

  }


  return false;

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
    value === "gemini"
  ) {

    return "gemini";

  }


  if (
    value === "openai"
  ) {

    return "openai";

  }


  return null;

}


/* =========================================================
   GET GEMINI MODEL ORDER
========================================================= */

function getGeminiModelOrder(
  options = {}
) {

  const requestedModel =
    typeof options.model === "string"
      ? options.model.trim()
      : "";


  const order = [];


  /*
   * If an agent explicitly requests a Gemini model,
   * try that model first.
   */

  if (
    requestedModel
  ) {

    order.push(
      requestedModel
    );

  }


  /*
   * Always keep the production fallback chain.
   */

  order.push(
    ...GEMINI_MODEL_CHAIN
  );


  /*
   * Remove duplicates while preserving order.
   */

  return [
    ...new Set(
      order
    )
  ];

}


/* =========================================================
   GET PROVIDER ORDER
   ---------------------------------------------------------
   IMPORTANT:
   OpenAI is intentionally NEVER returned here.
========================================================= */

function getProviderOrder(
  options = {}
) {

  /*
   * Even if an old agent sends:

   provider: "openai"

   we intentionally route the work to Gemini.

   This prevents old agent configuration from
   accidentally sending a request to OpenAI.
   */

  if (
    normalizeProvider(
      options.provider
    ) === "openai"
  ) {

    logger.warning(
      "OpenAI provider request ignored: OpenAI is temporarily disabled. Routing to Gemini."
    );

  }


  if (
    isProviderAvailable(
      "gemini"
    )
  ) {

    return [

      "gemini"

    ];

  }


  return [];

}


/* =========================================================
   TIMEOUT
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


  let timer = null;


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
   RETRYABLE ERROR DETECTION
========================================================= */

function isRetryableGeminiError(
  error
) {

  if (
    !error
  ) {

    return false;

  }


  const status =
    Number(
      error.status ||
      error.statusCode ||
      error?.response?.status ||
      error?.error?.code
    );


  const code =
    String(
      error.code ||
      error?.error?.status ||
      ""
    )
      .toUpperCase();


  const message =
    String(
      error.message ||
      ""
    )
      .toLowerCase();


  /*
   * Temporary infrastructure / capacity errors.
   */

  if (
    [
      408,
      429,
      500,
      502,
      503,
      504
    ].includes(
      status
    )
  ) {

    return true;

  }


  if (
    code === "UNAVAILABLE" ||
    code === "RESOURCE_EXHAUSTED" ||
    code === "DEADLINE_EXCEEDED" ||
    code === "INTERNAL"
  ) {

    return true;

  }


  if (
    message.includes(
      "high demand"
    ) ||
    message.includes(
      "temporarily unavailable"
    ) ||
    message.includes(
      "temporarily unavailable"
    ) ||
    message.includes(
      "resource exhausted"
    ) ||
    message.includes(
      "rate limit"
    ) ||
    message.includes(
      "too many requests"
    ) ||
    message.includes(
      "service unavailable"
    ) ||
    message.includes(
      "deadline exceeded"
    )
  ) {

    return true;

  }


  return false;

}


/* =========================================================
   RETRY DELAY
========================================================= */

function getRetryDelay(
  attempt
) {

  const exponent =
    Math.max(
      0,
      attempt - 1
    );


  const base =
    GEMINI_RETRY_BASE_DELAY_MS *
    Math.pow(
      2,
      exponent
    );


  /*
   * Small jitter prevents many requests from
   * retrying at exactly the same moment.
   */

  const jitter =
    Math.floor(
      Math.random() * 300
    );


  return (
    base +
    jitter
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
   VALIDATE GEMINI CONTENTS
========================================================= */

function validateGeminiContents(
  contents
) {

  if (
    typeof contents === "string"
  ) {

    if (
      contents.trim()
    ) {

      return true;

    }

    return false;

  }


  if (
    Array.isArray(
      contents
    )
  ) {

    return (
      contents.length >
      0
    );

  }


  return Boolean(
    contents
  );

}


/* =========================================================
   GEMINI GENERATION
========================================================= */

async function generateWithGemini(
  options = {}
) {

  if (
    !geminiClient
  ) {

    const error =
      new Error(
        "Gemini provider is not configured"
      );


    error.code =
      "AI_PROVIDER_NOT_CONFIGURED";


    error.provider =
      "gemini";


    throw error;

  }


  /*
   * Convert messages to Gemini contents
   * when caller uses OpenAI-style messages.
   */

  let contents =
    options.contents;


  if (
    !contents &&
    Array.isArray(
      options.messages
    )
  ) {

    contents =
      messagesToGeminiContents(
        options.messages
      );

  }


  if (
    !contents &&
    typeof options.prompt === "string"
  ) {

    contents =
      options.prompt;

  }


  if (
    !validateGeminiContents(
      contents
    )
  ) {

    const error =
      new Error(
        "Gemini contents are required"
      );


    error.code =
      "AI_INVALID_REQUEST";


    error.provider =
      "gemini";


    throw error;

  }


  /*
   * Resolve model.
   */

  const model =
    options.model ||
    env.GEMINI_MODEL ||
    "gemini-3.8-flash";


  /*
   * Gemini 3.8 migration:
   *
   * Do NOT send deprecated:
   * - temperature
   * - top_p
   * - top_k
   *
   * Use thinkingLevel instead.
   */

  const config = {};


  /*
   * Structured JSON output.
   */

  if (
    options.json === true
  ) {

    config.responseMimeType =
      "application/json";

  }


  /*
   * Maximum output tokens.
   */

  if (
    Number.isFinite(
      options.maxTokens
    )
  ) {

    config.maxOutputTokens =
      Math.max(
        1,
        Math.floor(
          options.maxTokens
        )
      );

  }


  /*
   * Thinking level.
   *
   * Default:
   * medium
   *
   * User can explicitly pass:
   * low
   * medium
   * high
   */

  const thinkingLevel =
    String(
      options.thinkingLevel ||
      "medium"
    )
      .trim()
      .toLowerCase();


  const allowedThinkingLevels = [

    "low",

    "medium",

    "high"

  ];


  if (
    allowedThinkingLevels.includes(
      thinkingLevel
    )
  ) {

    config.thinkingConfig = {

      thinkingLevel

    };

  }


  /*
   * Optional system instruction.
   */

  if (
    typeof options.systemInstruction === "string" &&
    options.systemInstruction.trim()
  ) {

    config.systemInstruction =
      options.systemInstruction.trim();

  }


  const response =
    await withTimeout(

      geminiClient.models.generateContent({

        model,

        contents,

        config

      }),

      env.AI_PROVIDER_TIMEOUT_MS,

      "gemini",

      model

    );


  const text =
    typeof response?.text === "string"
      ? response.text
      : "";


  if (
    !text.trim()
  ) {

    const error =
      new Error(
        "Gemini returned an empty response"
      );


    error.code =
      "AI_EMPTY_RESPONSE";


    error.provider =
      "gemini";


    error.model =
      model;


    throw error;

  }


  return {

    provider:
      "gemini",

    model,

    text:
      text.trim(),

    raw:
      response

  };

}


/* =========================================================
   NORMALIZE GEMINI MESSAGES
========================================================= */

function messagesToGeminiContents(
  messages = []
) {

  return messages

    .filter(
      (message) => {

        return (
          message &&
          typeof message.content === "string" &&
          message.content.trim()
        );

      }
    )

    .map(
      (message) => {

        /*
         * Gemini accepts:
         *
         * user
         * model
         */

        const role =
          message.role === "assistant" ||
          message.role === "model"
            ? "model"
            : "user";


        return {

          role,

          parts: [

            {

              text:
                message.content

            }

          ]

        };

      }
    );

}


/* =========================================================
   GENERATE GEMINI WITH MODEL FAILOVER
========================================================= */

async function generateGeminiWithFailover(
  options = {}
) {

  const modelOrder =
    getGeminiModelOrder(
      options
    );


  if (
    modelOrder.length === 0
  ) {

    const error =
      new Error(
        "No Gemini models are configured"
      );


    error.code =
      "AI_NO_GEMINI_MODEL";


    error.provider =
      "gemini";


    throw error;

  }


  const errors = [];


  for (
    const model of modelOrder
  ) {

    let attempt =
      0;


    while (
      attempt <=
      GEMINI_MAX_RETRIES
    ) {

      try {

        /*
         * Do not retry immediately after
         * the first failed transient request.
         */

        if (
          attempt > 0
        ) {

          const delay =
            getRetryDelay(
              attempt
            );


          logger.warning(
            `Gemini retry: ${model} | attempt=${attempt + 1} | delay=${delay}ms`
          );


          await sleep(
            delay
          );

        }


        logger.info(
          `Gemini Request: ${model} | attempt=${attempt + 1}`
        );


        const result =
          await generateWithGemini({

            ...options,

            model

          });


        logger.success(
          `Gemini Success: ${model}`
        );


        return result;

      }

      catch (error) {

        const message =
          error?.message ||
          "Unknown Gemini error";


        const retryable =
          isRetryableGeminiError(
            error
          );


        logger.warning(
          `Gemini Failed: ${model} | attempt=${attempt + 1} | retryable=${retryable} | ${message}`
        );


        errors.push({

          provider:
            "gemini",

          model,

          attempt:
            attempt + 1,

          retryable,

          message,

          code:
            error?.code ||
            "AI_PROVIDER_ERROR"

        });


        /*
         * Non-retryable error:
         * immediately move to next model.
         */

        if (
          !retryable
        ) {

          break;

        }


        attempt += 1;

      }

    }

  }


  const error =
    new Error(
      "All Gemini AI models failed"
    );


  error.code =
    "AI_ALL_GEMINI_MODELS_FAILED";


  error.provider =
    "gemini";


  error.providers =
    errors;


  throw error;

}


/* =========================================================
   GENERATE TEXT
========================================================= */

async function generateText(
  options = {}
) {

  /*
   * OpenAI is intentionally ignored.
   *
   * No matter what an older agent sends:
   *
   * provider: "openai"
   *
   * ZyrionOS still uses Gemini.
   */

  if (
    normalizeProvider(
      options.provider
    ) === "openai"
  ) {

    logger.warning(
      "OpenAI request blocked. Gemini-only mode is active."
    );

  }


  const providerOrder =
    getProviderOrder(
      options
    );


  if (
    providerOrder.length === 0
  ) {

    const error =
      new Error(
        "Gemini AI provider is not configured"
      );


    error.code =
      "AI_NO_PROVIDER";


    error.provider =
      "gemini";


    throw error;

  }


  try {

    const result =
      await generateGeminiWithFailover(
        options
      );


    return {

      success:
        true,

      provider:
        result.provider,

      model:
        result.model,

      text:
        result.text,

      raw:
        result.raw

    };

  }

  catch (error) {

    const providerErrors =
      Array.isArray(
        error.providers
      )
        ? error.providers
        : [

            {

              provider:
                "gemini",

              model:
                error.model ||
                null,

              message:
                error.message ||
                "Unknown Gemini error",

              code:
                error.code ||
                "AI_PROVIDER_ERROR"

            }

          ];


    logger.error(
      `Gemini AI Chain Failed: ${providerErrors
        .map(
          (item) => {

            const model =
              item.model
                ? `/${item.model}`
                : "";


            return (
              `${item.provider}${model}: ${item.message}`
            );

          }
        )
        .join(" | ")}`
    );


    const finalError =
      new Error(
        "All Gemini AI providers/models failed"
      );


    finalError.code =
      "AI_ALL_PROVIDERS_FAILED";


    finalError.provider =
      "gemini";


    finalError.providers =
      providerErrors;


    throw finalError;

  }

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

    /*
     * Remove markdown JSON fences.
     */

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
          `Gemini returned invalid JSON: ${secondParseError.message}`
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

  return {

    mode:
      "gemini-only",

    primary:
      "gemini",

    fallback:
      null,

    openai: {

      configured:
        false,

      enabled:
        false,

      temporarilyDisabled:
        OPENAI_TEMPORARILY_DISABLED,

      reason:
        "OpenAI is intentionally disabled. Gemini handles all production AI requests."

    },

    providers: {

      gemini: {

        configured:
          isProviderAvailable(
            "gemini"
          ),

        enabled:
          true,

        primary:
          true,

        model:
          env.GEMINI_MODEL ||
          "gemini-3.8-flash",

        fallbackModels:
          GEMINI_MODEL_CHAIN

      },

      openai: {

        configured:
          false,

        enabled:
          false,

        model:
          env.OPENAI_MODEL ||
          "gpt-4.1-mini"

      }

    },

    geminiModelChain:
      GEMINI_MODEL_CHAIN,

    retry: {

      maxRetries:
        GEMINI_MAX_RETRIES,

      baseDelayMs:
        GEMINI_RETRY_BASE_DELAY_MS

    },

    timeoutMs:
      env.AI_PROVIDER_TIMEOUT_MS

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
