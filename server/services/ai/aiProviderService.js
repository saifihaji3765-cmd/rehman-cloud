/* =========================================================
   ZYRIONOS AI PROVIDER SERVICE
   MULTI-PROVIDER PRODUCTION AI ARCHITECTURE

   ACTIVE PROVIDERS

   1. Amazon Bedrock
   2. Sarvam AI
   3. BharatRouter
   4. IndieRouter
   5. Google Vertex AI / Gemini Enterprise Agent Platform

   ARCHITECTURE

   Agent
      ↓
   AI Provider Service
      ↓
   Capability Router
      ↓
   Selected Provider
      ↓
   Normalized Response

   IMPORTANT

   - DeepSeek removed
   - Anthropic / Claude removed
   - OpenAI is not an active provider
   - Agents never call providers directly
   - Provider-specific logic remains here
   - Vertex uses AWS → Google Workload Identity Federation
   - No Google service-account private key is required
   - Sarvam reasoning is explicitly disabled for short-budget
     production requests to prevent empty visible responses
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
   OPTIONAL SDK CLIENTS
========================================================= */

let BedrockRuntimeClient =
  null;

let ConverseCommand =
  null;

let GoogleGenAI =
  null;

let GoogleAuth =
  null;


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

catch (
  error
) {

  BedrockRuntimeClient =
    null;

  ConverseCommand =
    null;

}


/* =========================================================
   GOOGLE GEN AI SDK
========================================================= */

try {

  const googleGenAI =
    require("@google/genai");

  GoogleGenAI =
    googleGenAI.GoogleGenAI;

}

catch (
  error
) {

  GoogleGenAI =
    null;

}


/* =========================================================
   GOOGLE AUTH LIBRARY
========================================================= */

try {

  const googleAuth =
    require("google-auth-library");

  GoogleAuth =
    googleAuth.GoogleAuth;

}

catch (
  error
) {

  GoogleAuth =
    null;

}


/* =========================================================
   PROVIDER CLIENTS
========================================================= */

let bedrockClient =
  null;

let vertexClient =
  null;

let vertexAuth =
  null;

let vertexCredentialConfig =
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

const DEFAULT_PROVIDER_ORDER = [

  PROVIDERS.BEDROCK,

  PROVIDERS.SARVAM,

  PROVIDERS.BHARATROUTER,

  PROVIDERS.INDIEROUTER,

  PROVIDERS.VERTEX

];


/* =========================================================
   PROVIDER TOKEN LIMITS
========================================================= */

const PROVIDER_MAX_OUTPUT_TOKENS = {

  [PROVIDERS.BEDROCK]:
    5000,

  [PROVIDERS.SARVAM]:
    5000,

  [PROVIDERS.BHARATROUTER]:
    5000,

  [PROVIDERS.INDIEROUTER]:
    5000,

  [PROVIDERS.VERTEX]:
    5000

};


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
   GOOGLE VERTEX CONFIGURATION
========================================================= */

const VERTEX_PROJECT_ID =
  env.VERTEX_PROJECT_ID ||
  env.GOOGLE_CLOUD_PROJECT ||
  env.GCP_PROJECT_ID ||
  "";


const VERTEX_LOCATION =
  env.VERTEX_LOCATION ||
  env.GOOGLE_CLOUD_LOCATION ||
  "asia-south1";


/* =========================================================
   GOOGLE WIF CONFIGURATION
========================================================= */

const GOOGLE_WIF_CONFIG_JSON =
  env.GOOGLE_WIF_CONFIG_JSON ||
  process.env.GOOGLE_WIF_CONFIG_JSON ||
  "";


/* =========================================================
   PROVIDER QUOTA COOLDOWN
========================================================= */

const AI_PROVIDER_QUOTA_COOLDOWN_MS =
  Number.isFinite(
    Number(
      process.env.AI_PROVIDER_QUOTA_COOLDOWN_MS
    )
  )
    ? Math.max(
        10000,
        Number(
          process.env.AI_PROVIDER_QUOTA_COOLDOWN_MS
        )
      )
    : 300000;


/* =========================================================
   PROVIDER COOLDOWN STATE
========================================================= */

const providerCooldowns =
  new Map();


/* =========================================================
   RETRY CONFIGURATION
========================================================= */

const configuredMaxRetries =
  Number(
    env.AI_PROVIDER_MAX_RETRIES
  );


const AI_MAX_RETRIES =
  Number.isFinite(
    configuredMaxRetries
  )
    ? Math.max(
        0,
        Math.floor(
          configuredMaxRetries
        )
      )
    : 1;


const configuredRetryBaseDelay =
  Number(
    env.AI_PROVIDER_RETRY_BASE_DELAY_MS
  );


const AI_RETRY_BASE_DELAY_MS =
  Number.isFinite(
    configuredRetryBaseDelay
  )
    ? Math.max(
        100,
        configuredRetryBaseDelay
      )
    : 1200;


const configuredMaxRetryDelay =
  Number(
    env.AI_PROVIDER_MAX_RETRY_DELAY_MS
  );


const AI_MAX_RETRY_DELAY_MS =
  Number.isFinite(
    configuredMaxRetryDelay
  )
    ? Math.max(
        AI_RETRY_BASE_DELAY_MS,
        configuredMaxRetryDelay
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
   NORMALIZE MAX TOKENS
========================================================= */

function normalizeMaxTokens(
  provider,
  requestedTokens
) {

  const providerLimit =
    PROVIDER_MAX_OUTPUT_TOKENS[
      provider
    ] ||
    5000;


  const numeric =
    Number(
      requestedTokens
    );


  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric <= 0
  ) {

    return providerLimit;

  }


  return Math.min(
    Math.floor(
      numeric
    ),
    providerLimit
  );

}


/* =========================================================
   LOAD GOOGLE WIF CONFIGURATION
========================================================= */

function loadGoogleWIFConfig() {

  if (
    !GOOGLE_WIF_CONFIG_JSON ||
    !String(
      GOOGLE_WIF_CONFIG_JSON
    ).trim()
  ) {

    return null;

  }


  try {

    const parsed =
      JSON.parse(
        GOOGLE_WIF_CONFIG_JSON
      );


    if (
      !parsed ||
      typeof parsed !== "object"
    ) {

      throw new Error(
        "Google WIF configuration must be a JSON object"
      );

    }


    if (
      parsed.type !==
      "external_account"
    ) {

      throw new Error(
        "Google WIF configuration must use type=external_account"
      );

    }


    if (
      !parsed.audience
    ) {

      throw new Error(
        "Google WIF configuration is missing audience"
      );

    }


    if (
      !parsed.credential_source ||
      typeof parsed.credential_source !==
      "object"
    ) {

      throw new Error(
        "Google WIF configuration is missing credential_source"
      );

    }


    return parsed;

  }

  catch (
    error
  ) {

    logger.warning(
      `Google WIF configuration invalid: ${error.message}`
    );


    return null;

  }

}


/* =========================================================
   INITIALIZE BEDROCK
========================================================= */

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

  catch (
    error
  ) {

    bedrockClient =
      null;

    logger.warning(
      `Bedrock client initialization failed: ${error.message}`
    );

  }

}


/* =========================================================
   INITIALIZE GOOGLE VERTEX
========================================================= */

vertexCredentialConfig =
  loadGoogleWIFConfig();


if (
  GoogleGenAI &&
  GoogleAuth &&
  VERTEX_PROJECT_ID &&
  vertexCredentialConfig
) {

  try {

    vertexAuth =
      new GoogleAuth({

        credentials:
          vertexCredentialConfig,

        projectId:
          VERTEX_PROJECT_ID,

        scopes: [

          "https://www.googleapis.com/auth/cloud-platform"

        ]

      });


    vertexClient =
      new GoogleGenAI({

        vertexai:
          true,

        project:
          VERTEX_PROJECT_ID,

        location:
          VERTEX_LOCATION,

        googleAuthOptions: {

          credentials:
            vertexCredentialConfig,

          projectId:
            VERTEX_PROJECT_ID,

          scopes: [

            "https://www.googleapis.com/auth/cloud-platform"

          ],

          clientOptions: {

            transporterOptions: {

              fetchImplementation:
                globalThis.fetch

            }

          }

        }

      });


    logger.info(
      `Google Vertex AI WIF client initialized | project=${VERTEX_PROJECT_ID} | location=${VERTEX_LOCATION}`
    );

  }

  catch (
    error
  ) {

    vertexAuth =
      null;

    vertexClient =
      null;

    logger.warning(
      `Google Vertex AI WIF initialization failed: ${error.message}`
    );

  }

}

else {

  if (
    !VERTEX_PROJECT_ID
  ) {

    logger.warning(
      "Google Vertex AI unavailable: VERTEX_PROJECT_ID is missing"
    );

  }

  else if (
    !vertexCredentialConfig
  ) {

    logger.warning(
      "Google Vertex AI unavailable: GOOGLE_WIF_CONFIG_JSON is missing or invalid"
    );

  }

  else if (
    !GoogleGenAI
  ) {

    logger.warning(
      "Google Vertex AI unavailable: @google/genai is not installed"
    );

  }

  else if (
    !GoogleAuth
  ) {

    logger.warning(
      "Google Vertex AI unavailable: google-auth-library is not installed"
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

    amazon:
      PROVIDERS.BEDROCK,

    aws:
      PROVIDERS.BEDROCK,

    sarvam:
      PROVIDERS.SARVAM,

    "sarvam-ai":
      PROVIDERS.SARVAM,

    sarvamai:
      PROVIDERS.SARVAM,

    bharatrouter:
      PROVIDERS.BHARATROUTER,

    "bharat-router":
      PROVIDERS.BHARATROUTER,

    "bharat router":
      PROVIDERS.BHARATROUTER,

    bharat:
      PROVIDERS.BHARATROUTER,

    indierouter:
      PROVIDERS.INDIEROUTER,

    "indie-router":
      PROVIDERS.INDIEROUTER,

    "indie router":
      PROVIDERS.INDIEROUTER,

    indie:
      PROVIDERS.INDIEROUTER,

    vertex:
      PROVIDERS.VERTEX,

    "vertex-ai":
      PROVIDERS.VERTEX,

    "google-vertex":
      PROVIDERS.VERTEX,

    vertexai:
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

        vertexCredentialConfig &&

        VERTEX_PROJECT_ID &&

        VERTEX_LOCATION &&

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

    ordered = [

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

    ordered = [

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

    ordered = [

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
   PROVIDER COOLDOWN
========================================================= */

function isProviderCoolingDown(
  provider
) {

  const until =
    providerCooldowns.get(
      provider
    );


  if (
    !until
  ) {

    return false;

  }


  if (
    Date.now() >=
    until
  ) {

    providerCooldowns.delete(
      provider
    );

    return false;

  }


  return true;

}


/* =========================================================
   SET PROVIDER COOLDOWN
========================================================= */

function cooldownProvider(
  provider,
  duration =
    AI_PROVIDER_QUOTA_COOLDOWN_MS
) {

  const until =
    Date.now() +
    duration;


  providerCooldowns.set(
    provider,
    until
  );


  logger.warning(
    `AI provider cooldown enabled: ${provider} | duration=${duration}ms`
  );

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

    error?.error?.code,

    error?.details?.status

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

    error?.details?.message ||

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
      "EAI_AGAIN" ||

    message.includes(
      "fetch failed"
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


  const quotaPhrases = [

    "quota",

    "resource exhausted",

    "resource_exhausted",

    "rate limit",

    "too many requests",

    "too many tokens",

    "tokens per day",

    "daily token",

    "daily tokens",

    "daily quota",

    "insufficient balance",

    "insufficient funds",

    "billing",

    "credit balance",

    "usage limit",

    "usage quota",

    "exceeded your current quota",

    "payment required",

    "credits exhausted",

    "credits exceeded",

    "capacity exceeded",

    "resource has been exhausted"

  ];


  if (
    status === 429 ||
    status === 402 ||
    code ===
      "RESOURCE_EXHAUSTED" ||
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
      "INVALID_CREDENTIALS",
      "UNAUTHENTICATED"
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
    ) ||

    message.includes(
      "unauthenticated"
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

  const message =
    data?.choices?.[0]?.message;


  const content =
    message?.content;


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
        (item) => {

          if (
            typeof item ===
            "string"
          ) {

            return item;

          }


          if (
            typeof item?.text ===
            "string"
          ) {

            return item.text;

          }


          return "";

        }
      )

      .join(
        ""
      )

      .trim();

  }


  /*
   * Some compatible providers can return
   * an array of content blocks.
   */

  if (
    Array.isArray(
      message?.content_blocks
    )
  ) {

    return message.content_blocks

      .map(
        (item) =>
          typeof item?.text ===
          "string"
            ? item.text
            : ""
      )

      .join(
        ""
      )

      .trim();

  }


  return "";

}


/* =========================================================
   SAFE RESPONSE DIAGNOSTICS
========================================================= */

function getSafeResponseDiagnostics(
  data
) {

  const choice =
    data?.choices?.[0] ||
    null;


  const message =
    choice?.message ||
    null;


  return {

    object:
      data?.object ||
      null,

    model:
      data?.model ||
      null,

    choices:
      Array.isArray(
        data?.choices
      )
        ? data.choices.length
        : 0,

    finishReason:
      choice?.finish_reason ||
      null,

    messageRole:
      message?.role ||
      null,

    hasContent:
      Boolean(
        message?.content
      ),

    contentType:
      Array.isArray(
        message?.content
      )
        ? "array"
        : typeof message?.content,

    hasReasoningContent:
      Boolean(
        message?.reasoning_content
      ),

    hasToolCalls:
      Array.isArray(
        message?.tool_calls
      ) &&
      message.tool_calls.length > 0,

    usage:
      data?.usage
        ? {

            promptTokens:
              data.usage.prompt_tokens ??
              null,

            completionTokens:
              data.usage.completion_tokens ??
              null,

            totalTokens:
              data.usage.total_tokens ??
              null

          }
        : null

  };

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


  const maxTokens =
    normalizeMaxTokens(
      provider,
      options.maxTokens
    );


  const body = {

    model,

    messages,

    stream:
      false,

    max_tokens:
      maxTokens

  };


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


  /*
   * Sarvam-105B uses reasoning by default.
   *
   * Reasoning tokens count against max_tokens.
   * When the caller gives a small budget such as 1000,
   * reasoning can consume the entire budget and leave
   * message.content empty.
   *
   * Explicitly disabling reasoning makes the provider
   * reliable for short production generation calls.
   *
   * Sarvam documents reasoning_effort=null as the
   * supported way to disable reasoning.
   */

  if (
    provider ===
    PROVIDERS.SARVAM
  ) {

    body.reasoning_effort =
      null;

  }


  if (
    options.json === true
  ) {

    body.response_format = {

      type:
        "json_object"

    };

  }


  const headers = {

    "Content-Type":
      "application/json"

  };


  /*
   * Sarvam officially supports api-subscription-key.
   * Bearer is also accepted, but use the native header
   * for Sarvam to match its documented API contract.
   */

  if (
    provider ===
    PROVIDERS.SARVAM
  ) {

    headers[
      "api-subscription-key"
    ] =
      config.apiKey;

  }

  else {

    headers.Authorization =
      `Bearer ${config.apiKey}`;

  }


  const response =
    await fetchJSON(

      `${config.baseURL.replace(/\/+$/, "")}/v1/chat/completions`,

      {

        method:
          "POST",

        headers,

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

    const diagnostics =
      getSafeResponseDiagnostics(
        response.data
      );


    logger.warning(
      `${provider} returned empty visible content | ` +
      `model=${model} | ` +
      `finishReason=${diagnostics.finishReason || "unknown"} | ` +
      `choices=${diagnostics.choices} | ` +
      `hasReasoningContent=${diagnostics.hasReasoningContent} | ` +
      `hasToolCalls=${diagnostics.hasToolCalls} | ` +
      `totalTokens=${diagnostics.usage?.totalTokens ?? "unknown"}`
    );


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


    error.responseDiagnostics =
      diagnostics;


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


  const requestedMaxTokens =
    Number.isFinite(
      options.maxTokens
    )
      ? options.maxTokens
      : 5000;


  const maxTokens =
    normalizeMaxTokens(
      PROVIDERS.BEDROCK,
      requestedMaxTokens
    );


  logger.info(
    `Bedrock token policy: requested=${requestedMaxTokens} | effective=${maxTokens} | providerLimit=${PROVIDER_MAX_OUTPUT_TOKENS[PROVIDERS.BEDROCK]}`
  );


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
   VERTEX CONTENT CONVERSION
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
   VERTEX RESPONSE TEXT
========================================================= */

function extractVertexText(
  response
) {

  if (
    typeof response?.text ===
    "string"
  ) {

    return response.text.trim();

  }


  const candidates =
    response?.candidates ||
    [];


  return candidates

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
    )
    .trim();

}


/* =========================================================
   VERTEX GENERATION
========================================================= */

async function generateWithVertex(
  options = {}
) {

  if (
    !vertexClient ||
    !vertexCredentialConfig ||
    !VERTEX_PROJECT_ID ||
    !VERTEX_MODEL
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


  const generationConfig = {

    maxOutputTokens:
      normalizeMaxTokens(
        PROVIDERS.VERTEX,
        options.maxTokens
      )

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


  const config = {

    ...generationConfig

  };


  if (
    systemMessages.length > 0
  ) {

    config.systemInstruction = {

      role:
        "system",

      parts:
        systemMessages.map(
          (message) => ({

            text:
              message.content

          })
        )

    };

  }


  try {

    const response =
      await withTimeout(

        vertexClient.models.generateContent({

          model,

          contents,

          config

        }),

        AI_PROVIDER_TIMEOUT_MS,

        PROVIDERS.VERTEX,

        model

      );


    const text =
      extractVertexText(
        response
      );


    if (
      !text
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

      text,

      raw:
        response,

      usage:
        response?.usageMetadata ||
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

    if (
      isProviderCoolingDown(
        provider
      )
    ) {

      logger.warning(
        `AI Provider skipped due to active cooldown: ${provider}`
      );


      continue;

    }


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


        if (
          classification.category ===
          "quota"
        ) {

          cooldownProvider(
            provider
          );


          break;

        }


        if (
          classification.category ===
          "invalid_request"
        ) {

          throw error;

        }


        if (
          classification.retryable &&
          attempt <
            AI_MAX_RETRIES
        ) {

          attempt += 1;

          continue;

        }


        break;

      }

    }

  }


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
        configured &&
        !isProviderCoolingDown(
          provider
        ),

      coolingDown:
        isProviderCoolingDown(
          provider
        ),

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
        ] || {},

      maxOutputTokens:
        PROVIDER_MAX_OUTPUT_TOKENS[
          provider
        ] || null

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
      ].wifConfigured =
        Boolean(
          vertexCredentialConfig
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

    tokenPolicy: {

      providerMaxOutputTokens:
        PROVIDER_MAX_OUTPUT_TOKENS

    },

    cooldown: {

      quotaCooldownMs:
        AI_PROVIDER_QUOTA_COOLDOWN_MS

    },

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
