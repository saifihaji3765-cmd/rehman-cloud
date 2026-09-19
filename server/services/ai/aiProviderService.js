/* =========================================================
   ZYRIONOS AI PROVIDER SERVICE
   GEMINI ONLY - OPENAI TEMPORARILY DISABLED

   PRODUCTION PROVIDER ARCHITECTURE

   Primary:
     Gemini 3.8 Flash

   Temporary-failure fallback:
     Gemini 3.7 Flash
     Gemini 3.6 Flash

   IMPORTANT:
     429 QUOTA EXHAUSTED
       -> NO RETRY
       -> NO MODEL HOPPING
       -> IMMEDIATE QUOTA ERROR

     503 / 502 / 504 / temporary capacity failure
       -> controlled retry/fallback

   OpenAI:
     - NOT DELETED
     - NOT CALLED
     - NOT USED
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
   OPENAI TEMPORARILY DISABLED
========================================================= */

const OPENAI_TEMPORARILY_DISABLED =
  true;


/* =========================================================
   GEMINI MODEL CONFIGURATION
========================================================= */

const PRIMARY_GEMINI_MODEL =
  env.GEMINI_MODEL ||
  "gemini-3.8-flash";


const GEMINI_MODEL_CHAIN = [

  PRIMARY_GEMINI_MODEL,

  "gemini-3.7-flash",

  "gemini-3.6-flash"

].filter(
  Boolean
);


/* =========================================================
   RETRY CONFIGURATION
========================================================= */

/*
 * IMPORTANT:
 *
 * Retries are ONLY for genuine transient failures.
 *
 * 429 quota exhaustion is NEVER retried.
 */

const GEMINI_MAX_RETRIES =
  1;


const GEMINI_RETRY_BASE_DELAY_MS =
  1200;


const GEMINI_MAX_RETRY_DELAY_MS =
  5000;


/* =========================================================
   QUOTA COOLDOWN
========================================================= */

/*
 * When Gemini explicitly reports quota exhaustion,
 * temporarily mark the provider as quota-exhausted.
 *
 * This prevents multiple agents from repeatedly hammering
 * the same exhausted project quota.
 *
 * Default:
 * 60 seconds.
 *
 * This does NOT reset Google's quota.
 * It only protects our application.
 */

const GEMINI_QUOTA_COOLDOWN_MS =
  Number.isFinite(
    Number(
      env.GEMINI_QUOTA_COOLDOWN_MS
    )
  )
    ? Math.max(
        1000,
        Number(
          env.GEMINI_QUOTA_COOLDOWN_MS
        )
      )
    : 60000;


let geminiQuotaBlockedUntil =
  0;


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
    normalized === "gemini"
  ) {

    return Boolean(
      geminiClient &&
      env.GEMINI_API_KEY
    );

  }


  /*
   * OpenAI intentionally disabled.
   */

  if (
    normalized === "openai"
  ) {

    return false;

  }


  return false;

}


/* =========================================================
   GEMINI QUOTA STATUS
========================================================= */

function isGeminiQuotaBlocked() {

  return (
    Date.now() <
    geminiQuotaBlockedUntil
  );

}


/* =========================================================
   MARK GEMINI QUOTA EXHAUSTED
========================================================= */

function markGeminiQuotaExhausted(
  error
) {

  geminiQuotaBlockedUntil =
    Date.now() +
    GEMINI_QUOTA_COOLDOWN_MS;


  logger.warning(
    `Gemini quota protection activated for ${GEMINI_QUOTA_COOLDOWN_MS}ms`
  );


  if (
    error
  ) {

    error.quotaBlockedUntil =
      geminiQuotaBlockedUntil;

  }

}


/* =========================================================
   CLEAR GEMINI QUOTA PROTECTION
========================================================= */

function clearGeminiQuotaProtection() {

  if (
    geminiQuotaBlockedUntil !== 0
  ) {

    geminiQuotaBlockedUntil =
      0;

  }

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
   * Explicit Gemini model request first.
   *
   * OpenAI model names are ignored.
   */

  if (
    requestedModel &&
    requestedModel.startsWith(
      "gemini-"
    )
  ) {

    order.push(
      requestedModel
    );

  }


  /*
   * Production fallback chain.
   */

  order.push(
    ...GEMINI_MODEL_CHAIN
  );


  return [
    ...new Set(
      order
    )
  ];

}


/* =========================================================
   GET PROVIDER ORDER
========================================================= */

function getProviderOrder(
  options = {}
) {

  const requested =
    normalizeProvider(
      options.provider
    );


  /*
   * Older agents may still send:
   *
   * provider: "openai"
   *
   * Never allow it to reach OpenAI.
   */

  if (
    requested === "openai"
  ) {

    logger.warning(
      "OpenAI provider request blocked: Gemini-only mode is active."
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
   EXTRACT ERROR STATUS
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
   EXTRACT ERROR CODE
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

    error?.error?.status ||

    error?.statusText ||

    ""

  )
    .trim()
    .toUpperCase();

}


/* =========================================================
   EXTRACT ERROR MESSAGE
========================================================= */

function getErrorMessage(
  error
) {

  return String(
    error?.message ||
    error?.error?.message ||
    ""
  )
    .trim();

}


/* =========================================================
   QUOTA EXHAUSTION DETECTION
========================================================= */

function isGeminiQuotaExhausted(
  error
) {

  if (
    !error
  ) {

    return false;

  }


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
   * Gemini quota errors are generally 429
   * with RESOURCE_EXHAUSTED.
   */

  if (
    status === 429
  ) {

    return true;

  }


  if (
    code === "RESOURCE_EXHAUSTED"
  ) {

    return true;

  }


  const quotaPhrases = [

    "quota exceeded",

    "quotaexceeded",

    "resource exhausted",

    "current quota",

    "free tier",

    "generaterequestsperdaypermodel",

    "quotaid",

    "rate limit exceeded",

    "too many requests"

  ];


  return quotaPhrases.some(
    (phrase) =>
      message.includes(
        phrase
      )
  );

}


/* =========================================================
   TEMPORARY GEMINI FAILURE DETECTION
========================================================= */

function isTemporaryGeminiFailure(
  error
) {

  if (
    !error
  ) {

    return false;

  }


  /*
   * QUOTA IS NOT A TEMPORARY FAILURE
   * for our application retry logic.
   */

  if (
    isGeminiQuotaExhausted(
      error
    )
  ) {

    return false;

  }


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
   * Genuine transient HTTP failures.
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

    return true;

  }


  /*
   * Gemini transient statuses.
   */

  if (
    [
      "UNAVAILABLE",
      "DEADLINE_EXCEEDED",
      "INTERNAL",
      "ABORTED"
    ].includes(
      code
    )
  ) {

    return true;

  }


  const temporaryMessages = [

    "high demand",

    "temporarily unavailable",

    "service unavailable",

    "deadline exceeded",

    "try again later",

    "overloaded",

    "temporarily overloaded",

    "internal server error",

    "bad gateway",

    "gateway timeout"

  ];


  return temporaryMessages.some(
    (phrase) =>
      message.includes(
        phrase
      )
  );

}


/* =========================================================
   RETRYABLE GEMINI ERROR
========================================================= */

function isRetryableGeminiError(
  error
) {

  /*
   * Explicit quota errors NEVER retry.
   */

  if (
    isGeminiQuotaExhausted(
      error
    )
  ) {

    return false;

  }


  return isTemporaryGeminiFailure(
    error
  );

}


/* =========================================================
   RETRY DELAY
========================================================= */

function getRetryDelay(
  attempt,
  error = null
) {

  /*
   * If SDK exposes retry-after information,
   * respect it where possible.
   */

  const retryAfterCandidates = [

    error?.retryAfter,

    error?.retryAfterMs,

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

      /*
       * Retry-After may be seconds.
       * Large values are treated as milliseconds
       * only when explicitly named retryAfterMs.
       */

      if (
        candidate ===
        error?.retryAfterMs
      ) {

        return Math.min(
          numeric,
          GEMINI_MAX_RETRY_DELAY_MS
        );

      }


      return Math.min(
        numeric * 1000,
        GEMINI_MAX_RETRY_DELAY_MS
      );

    }

  }


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


  const jitter =
    Math.floor(
      Math.random() * 300
    );


  return Math.min(
    base + jitter,
    GEMINI_MAX_RETRY_DELAY_MS
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

    return Boolean(
      contents.trim()
    );

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
   THINKING LEVEL
========================================================= */

function getThinkingLevel(
  value,
  model
) {

  const normalized =
    String(
      value ||
      "medium"
    )
      .trim()
      .toLowerCase();


  switch (
    normalized
  ) {

    case "low":

      return ThinkingLevel.LOW;


    case "high":

      return ThinkingLevel.HIGH;


    case "medium":

    default:

      return ThinkingLevel.MEDIUM;

  }

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
   * Application-level quota protection.
   *
   * This prevents multiple agents from repeatedly
   * calling a project whose quota was just exhausted.
   */

  if (
    isGeminiQuotaBlocked()
  ) {

    const error =
      new Error(
        "Gemini quota is temporarily blocked because the project quota was exhausted."
      );


    error.code =
      "AI_QUOTA_EXHAUSTED";


    error.provider =
      "gemini";


    error.quotaBlockedUntil =
      geminiQuotaBlockedUntil;


    throw error;

  }


  let contents =
    options.contents;


  /*
   * Convert OpenAI-style messages if necessary.
   */

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


  /*
   * Plain prompt fallback.
   */

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


  const model =
    options.model ||
    PRIMARY_GEMINI_MODEL;


  const config = {};


  /*
   * JSON response.
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
   * Thinking configuration.
   */

  config.thinkingConfig = {

    thinkingLevel:
      getThinkingLevel(
        options.thinkingLevel,
        model
      )

  };


  /*
   * System instruction.
   */

  if (
    typeof options.systemInstruction === "string" &&
    options.systemInstruction.trim()
  ) {

    config.systemInstruction =
      options.systemInstruction.trim();

  }


  try {

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


    /*
     * Successful Gemini request.
     *
     * Clear local quota protection if an actual
     * successful request reaches Gemini.
     */

    clearGeminiQuotaProtection();


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

  catch (
    error
  ) {

    /*
     * Convert Gemini quota errors into a stable
     * application-level error.
     */

    if (
      isGeminiQuotaExhausted(
        error
      )
    ) {

      markGeminiQuotaExhausted(
        error
      );


      const quotaError =
        new Error(
          "Gemini API quota exhausted. No retry or model fallback will be attempted until the quota becomes available."
        );


      quotaError.code =
        "AI_QUOTA_EXHAUSTED";


      quotaError.provider =
        "gemini";


      quotaError.model =
        model;


      quotaError.status =
        getErrorStatus(
          error
        ) ||
        429;


      quotaError.originalCode =
        getErrorCode(
          error
        );


      quotaError.originalMessage =
        getErrorMessage(
          error
        );


      quotaError.quotaBlockedUntil =
        geminiQuotaBlockedUntil;


      throw quotaError;

    }


    throw error;

  }

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
   GEMINI MODEL FAILOVER
========================================================= */

async function generateGeminiWithFailover(
  options = {}
) {

  /*
   * If project quota was recently exhausted,
   * do not even start the model chain.
   */

  if (
    isGeminiQuotaBlocked()
  ) {

    const error =
      new Error(
        "Gemini quota is currently exhausted. Model fallback is intentionally skipped."
      );


    error.code =
      "AI_QUOTA_EXHAUSTED";


    error.provider =
      "gemini";


    error.quotaBlockedUntil =
      geminiQuotaBlockedUntil;


    throw error;

  }


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
         * Retry delay only happens after a
         * genuine transient failure.
         */

        if (
          attempt > 0
        ) {

          const delay =
            getRetryDelay(
              attempt,
              errors.length > 0
                ? errors[
                    errors.length - 1
                  ]
                : null
            );


          logger.warning(
            `Gemini transient retry: ${model} | attempt=${attempt + 1} | delay=${delay}ms`
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

      catch (
        error
      ) {

        const message =
          getErrorMessage(
            error
          ) ||
          "Unknown Gemini error";


        /*
         * =================================================
         * QUOTA ERROR
         * =================================================
         *
         * NEVER retry.
         * NEVER move to another Gemini model.
         */

        if (
          error?.code ===
            "AI_QUOTA_EXHAUSTED" ||
          isGeminiQuotaExhausted(
            error
          )
        ) {

          logger.error(
            `Gemini QUOTA EXHAUSTED: ${model} | fallback stopped immediately | ${message}`
          );


          errors.push({

            provider:
              "gemini",

            model,

            attempt:
              attempt + 1,

            retryable:
              false,

            quotaExhausted:
              true,

            message,

            code:
              "AI_QUOTA_EXHAUSTED"

          });


          const quotaError =
            new Error(
              "Gemini API quota exhausted. All Gemini retries and model fallback have been stopped."
            );


          quotaError.code =
            "AI_QUOTA_EXHAUSTED";


          quotaError.provider =
            "gemini";


          quotaError.model =
            model;


          quotaError.providers =
            errors;


          quotaError.quotaBlockedUntil =
            geminiQuotaBlockedUntil;


          throw quotaError;

        }


        const retryable =
          isRetryableGeminiError(
            error
          );


        logger.warning(
          `Gemini Failed: ${model} | attempt=${attempt + 1} | temporary=${retryable} | ${message}`
        );


        errors.push({

          provider:
            "gemini",

          model,

          attempt:
            attempt + 1,

          retryable,

          quotaExhausted:
            false,

          message,

          code:
            error?.code ||
            "AI_PROVIDER_ERROR"

        });


        /*
         * Non-temporary error:
         * move to next model.
         */

        if (
          !retryable
        ) {

          break;

        }


        /*
         * Temporary failure:
         * retry same model once.
         */

        attempt += 1;

      }

    }

  }


  const error =
    new Error(
      "All Gemini AI models failed due to temporary/provider errors."
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
   * Explicit OpenAI request is blocked.
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


  /*
   * If local quota protection is active,
   * return a precise error immediately.
   */

  if (
    isGeminiQuotaBlocked()
  ) {

    const error =
      new Error(
        "Gemini API quota is temporarily exhausted."
      );


    error.code =
      "AI_QUOTA_EXHAUSTED";


    error.provider =
      "gemini";


    error.quotaBlockedUntil =
      geminiQuotaBlockedUntil;


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

  catch (
    error
  ) {

    /*
     * Preserve exact quota error.
     *
     * DO NOT convert it into the generic
     * AI_ALL_PROVIDERS_FAILED error.
     */

    if (
      error?.code ===
      "AI_QUOTA_EXHAUSTED"
    ) {

      logger.error(
        "Gemini AI request stopped: quota exhausted."
      );


      throw error;

    }


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
        "All Gemini AI models failed due to temporary/provider errors."
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
          PRIMARY_GEMINI_MODEL,

        fallbackModels:
          GEMINI_MODEL_CHAIN.filter(
            (model) =>
              model !==
              PRIMARY_GEMINI_MODEL
          ),

        quotaBlocked:
          isGeminiQuotaBlocked(),

        quotaBlockedUntil:
          isGeminiQuotaBlocked()
            ? geminiQuotaBlockedUntil
            : null

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
        GEMINI_RETRY_BASE_DELAY_MS,

      maxDelayMs:
        GEMINI_MAX_RETRY_DELAY_MS,

      quotaRetries:
        0,

      quotaFallback:
        false

    },

    quotaProtection: {

      enabled:
        true,

      cooldownMs:
        GEMINI_QUOTA_COOLDOWN_MS,

      blocked:
        isGeminiQuotaBlocked(),

      blockedUntil:
        isGeminiQuotaBlocked()
          ? geminiQuotaBlockedUntil
          : null

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
