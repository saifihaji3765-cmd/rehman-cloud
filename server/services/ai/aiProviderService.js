/* =========================================================
   ZYRIONOS AI PROVIDER SERVICE
   MULTI-PROVIDER PRODUCTION AI ARCHITECTURE

   ACTIVE PROVIDER ROUTES

   1. Amazon Bedrock
   2. Sarvam AI
   3. BharatRouter
   4. IndieRouter
   5. Google Vertex AI

   IMPORTANT
   ---------------------------------------------------------
   - DeepSeek has been completely removed.
   - Claude / Anthropic has been completely removed.
   - Gemini is NOT a direct provider in this service.
   - OpenAI is NOT a provider.
   - Agents must call this service, never providers directly.
   - Provider-specific implementation stays inside this layer.
   - Existing agents can continue using generateText()
     and generateJSON().

   ARCHITECTURE

   Agent
     ↓
   AI Provider Service
     ↓
   Provider Router
     ↓
   Selected Provider
     ↓
   Normalized Response

   PROVIDERS

     Amazon Bedrock
     Sarvam AI
     BharatRouter
     IndieRouter
     Google Vertex AI

   FAILURE POLICY

   Temporary:
     controlled retry
     then alternate provider

   Quota / balance:
     no retry
     alternate provider immediately

   Authentication:
     no retry
     alternate provider

   Configuration:
     provider skipped

   Invalid request:
     no pointless provider rotation

   Timeout:
     temporary failure
========================================================= */


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
   OPTIONAL PROVIDER CLIENTS
========================================================= */

/*
 * These are loaded dynamically so the entire application
 * does not crash merely because an optional provider SDK
 * has not been installed/configured yet.
 */

let BedrockRuntimeClient = null;
let ConverseCommand = null;

let VertexAI = null;


/* =========================================================
   BEDROCK SDK
========================================================= */

try {

  const bedrock =
    require("@aws-sdk/client-bedrock-runtime");

  BedrockRuntimeClient =
    bedrock.BedrockRuntimeClient;

  ConverseCommand =
    bedrock.ConverseCommand;

}

catch (error) {

  /*
   * Bedrock remains unavailable until its SDK is installed.
   * Do not crash the whole server.
   */

  BedrockRuntimeClient =
    null;

  ConverseCommand =
    null;

}


/* =========================================================
   VERTEX AI SDK
========================================================= */

try {

  const vertex =
    require("@google-cloud/vertexai");

  VertexAI =
    vertex.VertexAI;

}

catch (error) {

  VertexAI =
    null;

}


/* =========================================================
   PROVIDER CLIENTS
========================================================= */

let bedrockClient =
  null;

let vertexClient =
  null;


/* =========================================================
   PROVIDER NAMES
========================================================= */

const PROVIDERS = {

  BEDROCK:
    "bedrock",

  SARVAM:
    "sarvam",

  BHARATROUTER:
    "bharatrouter",

  INDIEROUTER:
    "indierouter",

  VERTEX:
    "vertex"

};


/* =========================================================
   DEFAULT PROVIDER ORDER
========================================================= */

/*
 * This is NOT a blind "primary/fallback" chain.
 *
 * It is only the default candidate order.
 *
 * The router can later select providers based on:
 *
 * - task type
 * - capability
 * - availability
 * - requested provider
 * - model
 * - failure state
 *
 * No DeepSeek / Claude route exists.
 */

const DEFAULT_PROVIDER_ORDER = [

  PROVIDERS.BEDROCK,

  PROVIDERS.SARVAM,

  PROVIDERS.BHARATROUTER,

  PROVIDERS.INDIEROUTER,

  PROVIDERS.VERTEX

];


/* =========================================================
   MODEL CONFIGURATION
========================================================= */

const BEDROCK_MODEL =
  env.BEDROCK_MODEL_ID ||
  env.BEDROCK_MODEL ||
  "";


const SARVAM_MODEL =
  env.SARVAM_MODEL ||
  "sarvam-105b";


const BHARATROUTER_MODEL =
  env.BHARATROUTER_MODEL ||
  "";


const INDIEROUTER_MODEL =
  env.INDIEROUTER_MODEL ||
  "";


const VERTEX_MODEL =
  env.VERTEX_MODEL ||
  env.VERTEX_AI_MODEL ||
  "gemini-2.5-flash";


/* =========================================================
   BASE URL CONFIGURATION
========================================================= */

const SARVAM_BASE_URL =
  env.SARVAM_BASE_URL ||
  "https://api.sarvam.ai";


const BHARATROUTER_BASE_URL =
  env.BHARATROUTER_BASE_URL ||
  "";


const INDIEROUTER_BASE_URL =
  env.INDIEROUTER_BASE_URL ||
  "";


/* =========================================================
   AWS REGION
========================================================= */

const AWS_REGION =
  env.AWS_REGION ||
  env.BEDROCK_REGION ||
  "ap-south-1";


/* =========================================================
   VERTEX CONFIGURATION
========================================================= */

const VERTEX_PROJECT_ID =
  env.GOOGLE_CLOUD_PROJECT ||
  env.GCP_PROJECT_ID ||
  env.VERTEX_PROJECT_ID ||
  "";


const VERTEX_LOCATION =
  env.VERTEX_LOCATION ||
  env.GOOGLE_CLOUD_LOCATION ||
  "us-central1";


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
 * Amazon Bedrock
 *
 * AWS credentials should preferably come from:
 *
 * - ECS task role
 * - IAM role
 * - AWS credential provider chain
 *
 * Do not hard-code AWS credentials here.
 */

if (
  BedrockRuntimeClient
) {

  try {

    bedrockClient =
      new BedrockRuntimeClient({

        region:
          AWS_REGION

      });

  }

  catch (error) {

    bedrockClient =
      null;

    logger.warning(
      `Bedrock client initialization failed: ${error.message}`
    );

  }

}


/*
 * Google Vertex AI
 */

if (
  VertexAI &&
  VERTEX_PROJECT_ID
) {

  try {

    vertexClient =
      new VertexAI({

        project:
          VERTEX_PROJECT_ID,

        location:
          VERTEX_LOCATION

      });

  }

  catch (error) {

    vertexClient =
      null;

    logger.warning(
      `Vertex AI client initialization failed: ${error.message}`
    );

  }

}


/* =========================================================
   PROVIDER NORMALIZATION
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


  const aliases = {

    bedrock:
      PROVIDERS.BEDROCK,

    "amazon-bedrock":
      PROVIDERS.BEDROCK,

    aws:
      PROVIDERS.BEDROCK,

    sarvam:
      PROVIDERS.SARVAM,

    "sarvam-ai":
      PROVIDERS.SARVAM,

    bharatrouter:
      PROVIDERS.BHARATROUTER,

    "bharat-router":
      PROVIDERS.BHARATROUTER,

    "bharat router":
      PROVIDERS.BHARATROUTER,

    indierouter:
      PROVIDERS.INDIEROUTER,

    "indie-router":
      PROVIDERS.INDIEROUTER,

    "indie router":
      PROVIDERS.INDIEROUTER,

    vertex:
      PROVIDERS.VERTEX,

    "vertex-ai":
      PROVIDERS.VERTEX,

    "google-vertex":
      PROVIDERS.VERTEX

  };


  return (
    aliases[value] ||
    null
  );

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


  switch (
    normalized
  ) {

    case PROVIDERS.BEDROCK:

      return Boolean(
        bedrockClient &&
        ConverseCommand &&
        BEDROCK_MODEL
      );


    case PROVIDERS.SARVAM:

      return Boolean(
        env.SARVAM_API_KEY &&
        SARVAM_BASE_URL &&
        SARVAM_MODEL
      );


    case PROVIDERS.BHARATROUTER:

      return Boolean(
        env.BHARATROUTER_API_KEY &&
        BHARATROUTER_BASE_URL &&
        BHARATROUTER_MODEL
      );


    case PROVIDERS.INDIEROUTER:

      return Boolean(
        env.INDIEROUTER_API_KEY &&
        INDIEROUTER_BASE_URL &&
        INDIEROUTER_MODEL
      );


    case PROVIDERS.VERTEX:

      return Boolean(
        vertexClient &&
        VERTEX_PROJECT_ID &&
        VERTEX_MODEL
      );


    default:

      return false;

  }

}


/* =========================================================
   PROVIDER CAPABILITIES
========================================================= */

const PROVIDER_CAPABILITIES = {

  [PROVIDERS.BEDROCK]: {

    coding:
      true,

    reasoning:
      true,

    planning:
      true,

    longContext:
      true,

    multimodal:
      true,

    structuredOutput:
      true

  },


  [PROVIDERS.SARVAM]: {

    coding:
      true,

    reasoning:
      true,

    planning:
      true,

    longContext:
      true,

    multimodal:
      false,

    structuredOutput:
      true

  },


  [PROVIDERS.BHARATROUTER]: {

    coding:
      true,

    reasoning:
      true,

    planning:
      true,

    longContext:
      true,

    multimodal:
      true,

    structuredOutput:
      true

  },


  [PROVIDERS.INDIEROUTER]: {

    coding:
      true,

    reasoning:
      true,

    planning:
      true,

    longContext:
      true,

    multimodal:
      true,

    structuredOutput:
      true

  },


  [PROVIDERS.VERTEX]: {

    coding:
      true,

    reasoning:
      true,

    planning:
      true,

    longContext:
      true,

    multimodal:
      true,

    structuredOutput:
      true

  }

};


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
   * Explicit provider request.
   *
   * Requested provider gets first chance.
   *
   * Other available providers remain possible
   * fallback routes.
   */

  if (
    requested
  ) {

    return [

      requested,

      ...DEFAULT_PROVIDER_ORDER.filter(
        (provider) =>
          provider !== requested
      )

    ];

  }


  /*
   * Capability-aware ordering.
   */

  const capability =
    String(
      options.capability ||
      options.taskType ||
      options.role ||
      ""
    )
      .trim()
      .toLowerCase();


  let ordered =
    [...DEFAULT_PROVIDER_ORDER];


  if (
    capability === "coding" ||
    capability === "builder" ||
    capability === "code"
  ) {

    ordered =
      [

        PROVIDERS.BEDROCK,

        PROVIDERS.INDIEROUTER,

        PROVIDERS.BHARATROUTER,

        PROVIDERS.SARVAM,

        PROVIDERS.VERTEX

      ];

  }


  if (
    capability === "planning" ||
    capability === "planner" ||
    capability === "reasoning"
  ) {

    ordered =
      [

        PROVIDERS.BEDROCK,

        PROVIDERS.VERTEX,

        PROVIDERS.SARVAM,

        PROVIDERS.BHARATROUTER,

        PROVIDERS.INDIEROUTER

      ];

  }


  if (
    capability === "multimodal" ||
    capability === "vision"
  ) {

    ordered =
      [

        PROVIDERS.VERTEX,

        PROVIDERS.BEDROCK,

        PROVIDERS.BHARATROUTER,

        PROVIDERS.INDIEROUTER,

        PROVIDERS.SARVAM

      ];

  }


  return ordered;

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

    error?.response?.statusCode,

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

    error?.response?.data?.error ||

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
   * TIMEOUT / NETWORK
   */

  if (
    error?.code ===
      "AI_PROVIDER_TIMEOUT" ||

    error?.code ===
      "ETIMEDOUT" ||

    error?.code ===
      "ECONNRESET" ||

    error?.code ===
      "ECONNREFUSED" ||

    error?.code ===
      "EAI_AGAIN"
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
   * QUOTA / BALANCE / RATE LIMIT
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

    "exceeded your current quota",

    "payment required",

    "credits exhausted",

    "credits exceeded",

    "capacity exceeded"

  ];


  if (
    status === 429 ||
    status === 402 ||
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
   * AUTHENTICATION / PERMISSION
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
      "INVALID_API_KEY",
      "INVALID_CREDENTIALS"
    ].includes(
      code
    ) ||

    message.includes(
      "invalid api key"
    ) ||

    message.includes(
      "authentication"
    ) ||

    message.includes(
      "unauthorized"
    ) ||

    message.includes(
      "permission denied"
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
   * CONFIGURATION
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
   * INVALID REQUEST
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
   * TEMPORARY SERVER FAILURE
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

    "server error",

    "network error",

    "connection reset"

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
   * UNKNOWN FAILURE
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
            message.content.trim()

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


  if (
    messages.length === 0 &&
    typeof options.prompt ===
      "string" &&
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


  if (
    messages.length === 0 &&
    typeof options.contents ===
      "string" &&
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
   REASONING NORMALIZATION
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
      "medium",
      "high",
      "max"
    ].includes(
      normalized
    )
  ) {

    return normalized;

  }


  return "high";

}


/* =========================================================
   HTTP JSON REQUEST
========================================================= */

async function fetchJSON(
  url,
  options = {},
  provider,
  model
) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {

        controller.abort();

      },
      AI_PROVIDER_TIMEOUT_MS
    );


  try {

    const response =
      await fetch(
        url,
        {

          ...options,

          signal:
            controller.signal

        }
      );


    const rawText =
      await response.text();


    let data =
      null;


    try {

      data =
        rawText
          ? JSON.parse(
              rawText
            )
          : null;

    }

    catch (
      error
    ) {

      data =
        null;

    }


    if (
      !response.ok
    ) {

      const error =
        new Error(

          data?.error?.message ||

          data?.message ||

          rawText ||

          `${provider} returned HTTP ${response.status}`

        );


      error.status =
        response.status;


      error.provider =
        provider;


      error.model =
        model;


      error.response =
        {

          status:
            response.status,

          data,

          headers:
            response.headers

        };


      throw error;

    }


    return {

      data,

      status:
        response.status,

      headers:
        response.headers

    };

  }

  catch (
    error
  ) {

    if (
      error?.name ===
      "AbortError"
    ) {

      const timeoutError =
        new Error(
          `${provider} AI provider timed out after ${AI_PROVIDER_TIMEOUT_MS}ms`
        );


      timeoutError.code =
        "AI_PROVIDER_TIMEOUT";


      timeoutError.provider =
        provider;


      timeoutError.model =
        model;


      throw timeoutError;

    }


    throw error;

  }

  finally {

    clearTimeout(
      timeout
    );

  }

}


/* =========================================================
   EXTRACT OPENAI-COMPATIBLE TEXT
========================================================= */

function extractChatCompletionText(
  data
) {

  const content =
    data?.choices?.[0]?.message?.content;


  if (
    typeof content ===
    "string"
  ) {

    return content.trim();

  }


  if (
    Array.isArray(
      content
    )
  ) {

    return content

      .map(
        (item) =>
          typeof item ===
            "string"
            ? item
            : item?.text || ""
      )

      .join(
        ""
      )

      .trim();

  }


  return "";

}


/* =========================================================
   GENERIC OPENAI-COMPATIBLE PROVIDER
========================================================= */

async function generateWithOpenAICompatibleProvider(
  provider,
  options = {}
) {

  const config = {

    [PROVIDERS.SARVAM]: {

      apiKey:
        env.SARVAM_API_KEY,

      baseURL:
        SARVAM_BASE_URL,

      model:
        SARVAM_MODEL

    },


    [PROVIDERS.BHARATROUTER]: {

      apiKey:
        env.BHARATROUTER_API_KEY,

      baseURL:
        BHARATROUTER_BASE_URL,

      model:
        BHARATROUTER_MODEL

    },


    [PROVIDERS.INDIEROUTER]: {

      apiKey:
        env.INDIEROUTER_API_KEY,

      baseURL:
        INDIEROUTER_BASE_URL,

      model:
        INDIEROUTER_MODEL

    }

  }[provider];


  if (
    !config ||
    !config.apiKey ||
    !config.baseURL ||
    !config.model
  ) {

    const error =
      new Error(
        `${provider} provider is not configured`
      );


    error.code =
      "AI_PROVIDER_NOT_CONFIGURED";


    error.provider =
      provider;


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
      provider;


    throw error;

  }


  const model =
    options.model &&
    String(
      options.model
    ).trim()
      ? String(
          options.model
        ).trim()
      : config.model;


  const body = {

    model,

    messages,

    stream:
      false

  };


  if (
    Number.isFinite(
      options.maxTokens
    )
  ) {

    body.max_tokens =
      Math.max(
        1,
        Math.floor(
          options.maxTokens
        )
      );

  }


  if (
    Number.isFinite(
      options.temperature
    )
  ) {

    body.temperature =
      Number(
        options.temperature
      );

  }


  if (
    options.json === true
  ) {

    body.response_format = {

      type:
        "json_object"

    };

  }


  /*
   * Keep reasoning provider-neutral.
   *
   * Provider-specific unsupported parameters are not
   * blindly injected into gateway requests.
   */

  const response =
    await fetchJSON(

      `${config.baseURL.replace(/\/+$/, "")}/v1/chat/completions`,

      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${config.apiKey}`

        },

        body:
          JSON.stringify(
            body
          )

      },

      provider,

      model

    );


  const text =
    extractChatCompletionText(
      response.data
    );


  if (
    !text
  ) {

    const error =
      new Error(
        `${provider} returned an empty response`
      );


    error.code =
      "AI_EMPTY_RESPONSE";


    error.provider =
      provider;


    error.model =
      model;


    throw error;

  }


  return {

    success:
      true,

    provider,

    model,

    text,

    raw:
      response.data,

    usage:
      response.data?.usage ||
      null

  };

}


/* =========================================================
   BEDROCK MESSAGE CONVERSION
========================================================= */

function buildBedrockMessages(
  messages
) {

  return messages

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

        content: [

          {

            text:
              message.content

          }

        ]

      })
    );

}


/* =========================================================
   BEDROCK GENERATION
========================================================= */

async function generateWithBedrock(
  options = {}
) {

  if (
    !bedrockClient ||
    !ConverseCommand ||
    !BEDROCK_MODEL
  ) {

    const error =
      new Error(
        "Amazon Bedrock provider is not configured"
      );


    error.code =
      "AI_PROVIDER_NOT_CONFIGURED";


    error.provider =
      PROVIDERS.BEDROCK;


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
      PROVIDERS.BEDROCK;


    throw error;

  }


  const model =
    options.model &&
    String(
      options.model
    ).trim()
      ? String(
          options.model
        ).trim()
      : BEDROCK_MODEL;


  const systemMessages =
    messages.filter(
      (message) =>
        message.role ===
        "system"
    );


  const conversationMessages =
    buildBedrockMessages(
      messages
    );


  if (
    conversationMessages.length ===
    0
  ) {

    const error =
      new Error(
        "Bedrock requires at least one user or assistant message"
      );


    error.code =
      "AI_INVALID_REQUEST";


    error.provider =
      PROVIDERS.BEDROCK;


    throw error;

  }


  const request = {

    modelId:
      model,

    messages:
      conversationMessages

  };


  if (
    systemMessages.length > 0
  ) {

    request.system =
      systemMessages.map(
        (message) => ({

          text:
            message.content

        })
      );

  }


  const maxTokens =
    Number.isFinite(
      options.maxTokens
    )
      ? Math.max(
          1,
          Math.floor(
            options.maxTokens
          )
        )
      : 8192;


  const inferenceConfig = {

    maxTokens

  };


  if (
    Number.isFinite(
      options.temperature
    )
  ) {

    inferenceConfig.temperature =
      Number(
        options.temperature
      );

  }


  request.inferenceConfig =
    inferenceConfig;


  try {

    const response =
      await withTimeout(

        bedrockClient.send(
          new ConverseCommand(
            request
          )
        ),

        AI_PROVIDER_TIMEOUT_MS,

        PROVIDERS.BEDROCK,

        model

      );


    const output =
      response?.output?.message;


    const text =
      Array.isArray(
        output?.content
      )
        ? output.content

            .filter(
              (block) =>
                typeof block?.text ===
                "string"
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
          "Amazon Bedrock returned an empty response"
        );


      error.code =
        "AI_EMPTY_RESPONSE";


      error.provider =
        PROVIDERS.BEDROCK;


      error.model =
        model;


      throw error;

    }


    return {

      success:
        true,

      provider:
        PROVIDERS.BEDROCK,

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
      PROVIDERS.BEDROCK;


    error.model =
      error.model ||
      model;


    throw error;

  }

}


/* =========================================================
   VERTEX MESSAGE CONVERSION
========================================================= */

function buildVertexContents(
  messages
) {

  return messages

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
            ? "model"
            : "user",

        parts: [

          {

            text:
              message.content

          }

        ]

      })
    );

}


/* =========================================================
   VERTEX GENERATION
========================================================= */

async function generateWithVertex(
  options = {}
) {

  if (
    !vertexClient ||
    !VERTEX_PROJECT_ID
  ) {

    const error =
      new Error(
        "Google Vertex AI provider is not configured"
      );


    error.code =
      "AI_PROVIDER_NOT_CONFIGURED";


    error.provider =
      PROVIDERS.VERTEX;


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
      PROVIDERS.VERTEX;


    throw error;

  }


  const model =
    options.model &&
    String(
      options.model
    ).trim()
      ? String(
          options.model
        ).trim()
      : VERTEX_MODEL;


  const systemMessages =
    messages.filter(
      (message) =>
        message.role ===
        "system"
    );


  const contents =
    buildVertexContents(
      messages
    );


  if (
    contents.length ===
    0
  ) {

    const error =
      new Error(
        "Vertex AI requires at least one user or assistant message"
      );


    error.code =
      "AI_INVALID_REQUEST";


    error.provider =
      PROVIDERS.VERTEX;


    throw error;

  }


  try {

    const generativeModel =
      vertexClient.getGenerativeModel({

        model,

        systemInstruction:
          systemMessages.length > 0
            ? {

                parts:
                  systemMessages.map(
                    (message) => ({

                      text:
                        message.content

                    })
                  )

              }
            : undefined

      });


    const generationConfig = {

      maxOutputTokens:
        Number.isFinite(
          options.maxTokens
        )
          ? Math.max(
              1,
              Math.floor(
                options.maxTokens
              )
            )
          : 8192

    };


    if (
      Number.isFinite(
        options.temperature
      )
    ) {

      generationConfig.temperature =
        Number(
          options.temperature
        );

    }


    if (
      options.json === true
    ) {

      generationConfig.responseMimeType =
        "application/json";

    }


    const response =
      await withTimeout(

        generativeModel.generateContent({

          contents,

          generationConfig

        }),

        AI_PROVIDER_TIMEOUT_MS,

        PROVIDERS.VERTEX,

        model

      );


    const candidates =
      response?.response?.candidates ||
      [];


    const text =
      candidates

        .flatMap(
          (candidate) =>
            candidate?.content?.parts ||
            []
        )

        .filter(
          (part) =>
            typeof part?.text ===
            "string"
        )

        .map(
          (part) =>
            part.text
        )

        .join(
          ""
        );


    if (
      !text.trim()
    ) {

      const error =
        new Error(
          "Google Vertex AI returned an empty response"
        );


      error.code =
        "AI_EMPTY_RESPONSE";


      error.provider =
        PROVIDERS.VERTEX;


      error.model =
        model;


      throw error;

    }


    return {

      success:
        true,

      provider:
        PROVIDERS.VERTEX,

      model,

      text:
        text.trim(),

      raw:
        response?.response ||
        response,

      usage:
        response?.response?.usageMetadata ||
        null

    };

  }

  catch (
    error
  ) {

    error.provider =
      error.provider ||
      PROVIDERS.VERTEX;


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

  switch (
    provider
  ) {

    case PROVIDERS.BEDROCK:

      return generateWithBedrock(
        options
      );


    case PROVIDERS.SARVAM:

      return generateWithOpenAICompatibleProvider(
        PROVIDERS.SARVAM,
        options
      );


    case PROVIDERS.BHARATROUTER:

      return generateWithOpenAICompatibleProvider(
        PROVIDERS.BHARATROUTER,
        options
      );


    case PROVIDERS.INDIEROUTER:

      return generateWithOpenAICompatibleProvider(
        PROVIDERS.INDIEROUTER,
        options
      );


    case PROVIDERS.VERTEX:

      return generateWithVertex(
        options
      );


    default: {

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

  }

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
    configuredProviders.length ===
    0
  ) {

    const error =
      new Error(
        "No AI provider is configured. Configure at least one of Bedrock, Sarvam, BharatRouter, IndieRouter, or Vertex AI."
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
          getProviderModel(
            provider,
            options
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
         *
         * The request itself is invalid.
         * Switching providers cannot magically
         * turn malformed input into valid input.
         */

        if (
          classification.category ===
          "invalid_request"
        ) {

          throw error;

        }


        /*
         * Retry only temporary failures.
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
         * Continue with next configured provider.
         */

        break;

      }

    }

  }


  /* =======================================================
     ALL PROVIDERS FAILED
  ======================================================= */

  const finalError =
    new Error(
      "All configured AI providers failed."
    );


  finalError.code =
    "AI_ALL_PROVIDERS_FAILED";


  finalError.provider =
    null;


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
   PROVIDER MODEL
========================================================= */

function getProviderModel(
  provider,
  options = {}
) {

  if (
    options.model &&
    String(
      options.model
    ).trim()
  ) {

    return String(
      options.model
    ).trim();

  }


  switch (
    provider
  ) {

    case PROVIDERS.BEDROCK:

      return BEDROCK_MODEL;


    case PROVIDERS.SARVAM:

      return SARVAM_MODEL;


    case PROVIDERS.BHARATROUTER:

      return BHARATROUTER_MODEL;


    case PROVIDERS.INDIEROUTER:

      return INDIEROUTER_MODEL;


    case PROVIDERS.VERTEX:

      return VERTEX_MODEL;


    default:

      return "";

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

  const status = {};


  for (
    const provider of
    DEFAULT_PROVIDER_ORDER
  ) {

    const configured =
      isProviderAvailable(
        provider
      );


    status[
      provider
    ] = {

      configured,

      enabled:
        true,

      available:
        configured,

      primary:
        false,

      fallback:
        true,

      model:
        getProviderModel(
          provider
        ),

      capabilities:
        PROVIDER_CAPABILITIES[
          provider
        ] || {}

    };


    if (
      provider ===
      PROVIDERS.BEDROCK
    ) {

      status[
        provider
      ].region =
        AWS_REGION;

    }


    if (
      provider ===
      PROVIDERS.SARVAM
    ) {

      status[
        provider
      ].baseURL =
        SARVAM_BASE_URL;

    }


    if (
      provider ===
      PROVIDERS.BHARATROUTER
    ) {

      status[
        provider
      ].baseURL =
        BHARATROUTER_BASE_URL;

    }


    if (
      provider ===
      PROVIDERS.INDIEROUTER
    ) {

      status[
        provider
      ].baseURL =
        INDIEROUTER_BASE_URL;

    }


    if (
      provider ===
      PROVIDERS.VERTEX
    ) {

      status[
        provider
      ].projectConfigured =
        Boolean(
          VERTEX_PROJECT_ID
        );

      status[
        provider
      ].location =
        VERTEX_LOCATION;

    }

  }


  return {

    mode:
      "multi-provider-role-based-routing",

    primary:
      null,

    fallback:
      null,

    providers:
      status,

    order:
      DEFAULT_PROVIDER_ORDER,

    capabilities:
      PROVIDER_CAPABILITIES,

    retry: {

      maxRetries:
        AI_MAX_RETRIES,

      baseDelayMs:
        AI_RETRY_BASE_DELAY_MS,

      maxDelayMs:
        AI_MAX_RETRY_DELAY_MS

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

  isProviderAvailable,

  normalizeProvider,

  getProviderOrder

};
