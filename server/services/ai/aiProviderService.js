/* =========================================================
   ZYRIONOS AI PROVIDER SERVICE
   Gemini Primary + OpenAI Fallback
========================================================= */


/* =========================
   PACKAGES
========================= */

const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");


/* =========================
   CONFIG
========================= */

const env = require("../../config/env");


/* =========================
   LOGGER
========================= */

const logger =
  require("../loggerService");


/* =========================================================
   PROVIDER CLIENTS
========================================================= */

let openaiClient = null;
let geminiClient = null;


/* =========================
   OPENAI CLIENT
========================= */

if (
  env.OPENAI_API_KEY
) {

  openaiClient =
    new OpenAI({

      apiKey:
        env.OPENAI_API_KEY,

      timeout:
        env.AI_PROVIDER_TIMEOUT_MS

    });

}


/* =========================
   GEMINI CLIENT
========================= */

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
   PROVIDER HELPERS
========================================================= */


/* =========================
   PROVIDER AVAILABLE
========================= */

function isProviderAvailable(
  provider
) {

  if (
    provider === "openai"
  ) {

    return Boolean(
      openaiClient &&
      env.OPENAI_API_KEY
    );

  }


  if (
    provider === "gemini"
  ) {

    return Boolean(
      geminiClient &&
      env.GEMINI_API_KEY
    );

  }


  return false;

}


/* =========================
   NORMALIZE PROVIDER
========================= */

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
    value === "openai" ||
    value === "gemini"
  ) {

    return value;

  }


  return null;

}


/* =========================
   GET PROVIDER ORDER
========================= */

function getProviderOrder(
  options = {}
) {

  const requested =
    normalizeProvider(
      options.provider
    );


  const primary =
    requested ||
    normalizeProvider(
      env.AI_PRIMARY_PROVIDER
    ) ||
    "gemini";


  const fallback =
    normalizeProvider(
      env.AI_FALLBACK_PROVIDER
    ) ||
    "openai";


  const order = [];


  if (
    isProviderAvailable(
      primary
    )
  ) {

    order.push(
      primary
    );

  }


  if (
    fallback !== primary &&
    isProviderAvailable(
      fallback
    )
  ) {

    order.push(
      fallback
    );

  }


  /*
   * If configuration points to an
   * unavailable provider, include
   * any available supported provider.
   */

  if (
    order.length === 0
  ) {

    if (
      isProviderAvailable(
        "gemini"
      )
    ) {

      order.push(
        "gemini"
      );

    }


    if (
      isProviderAvailable(
        "openai"
      )
    ) {

      order.push(
        "openai"
      );

    }

  }


  return [
    ...new Set(
      order
    )
  ];

}


/* =========================================================
   TIMEOUT
========================================================= */

function withTimeout(
  promise,
  timeoutMs,
  provider
) {

  const timeout =
    Number(timeoutMs);


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

      if (timer) {

        clearTimeout(
          timer
        );

      }

    }
  );

}


/* =========================================================
   OPENAI GENERATION
========================================================= */

async function generateWithOpenAI(
  options = {}
) {

  if (
    !openaiClient
  ) {

    const error =
      new Error(
        "OpenAI provider is not configured"
      );


    error.code =
      "AI_PROVIDER_NOT_CONFIGURED";

    error.provider =
      "openai";


    throw error;

  }


  const messages =
    Array.isArray(
      options.messages
    )
      ? options.messages
      : [];


  if (
    messages.length === 0
  ) {

    const error =
      new Error(
        "OpenAI messages are required"
      );


    error.code =
      "AI_INVALID_REQUEST";

    error.provider =
      "openai";


    throw error;

  }


  const request = {

    model:
      options.model ||
      env.OPENAI_MODEL ||
      "gpt-4.1-mini",

    temperature:
      typeof options.temperature === "number"
        ? options.temperature
        : 0.1,

    messages

  };


  if (
    options.json === true
  ) {

    request.response_format = {

      type:
        "json_object"

    };

  }


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


  const response =
    await withTimeout(
      openaiClient.chat.completions.create(
        request
      ),
      env.AI_PROVIDER_TIMEOUT_MS,
      "openai"
    );


  const content =
    response
      ?.choices?.[0]
      ?.message
      ?.content;


  if (
    typeof content !== "string" ||
    !content.trim()
  ) {

    const error =
      new Error(
        "OpenAI returned an empty response"
      );


    error.code =
      "AI_EMPTY_RESPONSE";

    error.provider =
      "openai";


    throw error;

  }


  return {

    provider:
      "openai",

    model:
      request.model,

    text:
      content.trim(),

    raw:
      response

  };

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


  const contents =
    Array.isArray(
      options.contents
    )
      ? options.contents
      : typeof options.prompt === "string"
        ? options.prompt
        : "";


  if (
    !contents ||
    (
      Array.isArray(contents) &&
      contents.length === 0
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


  const config = {

    temperature:
      typeof options.temperature === "number"
        ? options.temperature
        : 0.1

  };


  if (
    options.json === true
  ) {

    config.responseMimeType =
      "application/json";

  }


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


  const model =
    options.model ||
    env.GEMINI_MODEL ||
    "gemini-3.8-flash";


  const response =
    await withTimeout(
      geminiClient.models.generateContent({

        model,

        contents,

        config

      }),
      env.AI_PROVIDER_TIMEOUT_MS,
      "gemini"
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
      (message) =>
        message &&
        typeof message.content === "string"
    )
    .map(
      (message) => {

        const role =
          message.role === "assistant"
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
   GENERATE TEXT
========================================================= */

async function generateText(
  options = {}
) {

  const providerOrder =
    getProviderOrder(
      options
    );


  if (
    providerOrder.length === 0
  ) {

    const error =
      new Error(
        "No AI provider is configured"
      );


    error.code =
      "AI_NO_PROVIDER";

    throw error;

  }


  const errors = [];


  for (
    const provider of providerOrder
  ) {

    try {

      logger.info(
        `AI Provider Request: ${provider}`
      );


      let result;


      if (
        provider === "openai"
      ) {

        result =
          await generateWithOpenAI(
            options
          );

      }

      else if (
        provider === "gemini"
      ) {

        let geminiOptions =
          {
            ...options
          };


        if (
          Array.isArray(
            options.messages
          )
        ) {

          geminiOptions.contents =
            messagesToGeminiContents(
              options.messages
            );

        }


        result =
          await generateWithGemini(
            geminiOptions
          );

      }


      logger.success(
        `AI Provider Success: ${provider}`
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

      const message =
        error?.message ||
        "Unknown provider error";


      logger.warning(
        `AI Provider Failed: ${provider} | ${message}`
      );


      errors.push({

        provider,

        message,

        code:
          error?.code ||
          "AI_PROVIDER_ERROR"

      });

    }

  }


  const error =
    new Error(
      "All configured AI providers failed"
    );


  error.code =
    "AI_ALL_PROVIDERS_FAILED";

  error.providers =
    errors;


  logger.error(
    `AI Provider Chain Failed: ${errors
      .map(
        (item) =>
          `${item.provider}: ${item.message}`
      )
      .join(" | ")}`
  );


  throw error;

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

  catch (error) {

    /*
     * Some provider responses may
     * contain fenced JSON even when
     * JSON output was requested.
     */

    try {

      const cleaned =
        result.text
          .replace(
            /^```json\s*/i,
            ""
          )
          .replace(
            /^```\s*/i,
            ""
          )
          .replace(
            /\s*```$/i,
            ""
          )
          .trim();


      parsed =
        JSON.parse(
          cleaned
        );

    }

    catch (secondError) {

      const parseError =
        new Error(
          `AI provider returned invalid JSON: ${secondError.message}`
        );


      parseError.code =
        "AI_INVALID_JSON";

      parseError.provider =
        result.provider;

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

    primary:
      normalizeProvider(
        env.AI_PRIMARY_PROVIDER
      ),

    fallback:
      normalizeProvider(
        env.AI_FALLBACK_PROVIDER
      ),

    providers: {

      gemini: {

        configured:
          isProviderAvailable(
            "gemini"
          ),

        model:
          env.GEMINI_MODEL

      },

      openai: {

        configured:
          isProviderAvailable(
            "openai"
          ),

        model:
          env.OPENAI_MODEL

      }

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
