/* =========================================================
   ZYRIONOS AI PROVIDER SERVICE
   FULL REPLACEMENT — ROLE-BASED MULTI-PROVIDER ROUTING

   PROVIDERS RETAINED
   1. Sarvam AI
   2. IndieRouter
   3. BharatRouter
   4. Google Vertex AI
   5. Amazon Bedrock

   DEFAULT ROUTING
   Sarvam -> IndieRouter -> BharatRouter -> Vertex -> Bedrock

   CODING ROUTING
   IndieRouter -> BharatRouter -> Sarvam -> Vertex -> Bedrock

   Existing public exports preserved.
========================================================= */

'use strict';

const env = require('../../config/env');
const logger = require('../loggerService');

let BedrockRuntimeClient = null;
let ConverseCommand = null;
let GoogleGenAI = null;
let GoogleAuth = null;

try {
  const bedrock = require('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = bedrock.BedrockRuntimeClient;
  ConverseCommand = bedrock.ConverseCommand;
} catch (_) {
  // Bedrock remains unavailable if its SDK is missing.
}

try {
  const googleGenAI = require('@google/genai');
  GoogleGenAI = googleGenAI.GoogleGenAI;
} catch (_) {
  // Vertex remains unavailable if its SDK is missing.
}

try {
  const googleAuth = require('google-auth-library');
  GoogleAuth = googleAuth.GoogleAuth;
} catch (_) {
  // Vertex remains unavailable if its auth library is missing.
}

/* =========================================================
   PROVIDERS
========================================================= */

const PROVIDERS = Object.freeze({
  BEDROCK: 'bedrock',
  SARVAM: 'sarvam',
  BHARATROUTER: 'bharatrouter',
  INDIEROUTER: 'indierouter',
  VERTEX: 'vertex'
});

const DEFAULT_PROVIDER_ORDER = [
  PROVIDERS.SARVAM,
  PROVIDERS.INDIEROUTER,
  PROVIDERS.BHARATROUTER,
  PROVIDERS.VERTEX,
  PROVIDERS.BEDROCK
];

const CODING_PROVIDER_ORDER = [
  PROVIDERS.INDIEROUTER,
  PROVIDERS.BHARATROUTER,
  PROVIDERS.SARVAM,
  PROVIDERS.VERTEX,
  PROVIDERS.BEDROCK
];

const PLANNING_PROVIDER_ORDER = [
  PROVIDERS.SARVAM,
  PROVIDERS.INDIEROUTER,
  PROVIDERS.BHARATROUTER,
  PROVIDERS.VERTEX,
  PROVIDERS.BEDROCK
];

const MULTIMODAL_PROVIDER_ORDER = [
  PROVIDERS.VERTEX,
  PROVIDERS.INDIEROUTER,
  PROVIDERS.BHARATROUTER,
  PROVIDERS.BEDROCK,
  PROVIDERS.SARVAM
];

/* =========================================================
   TOKEN LIMITS
========================================================= */

const PROVIDER_MAX_OUTPUT_TOKENS = Object.freeze({
  [PROVIDERS.BEDROCK]: 12000,
  [PROVIDERS.SARVAM]: 12000,
  [PROVIDERS.BHARATROUTER]: 12000,
  [PROVIDERS.INDIEROUTER]: 12000,
  [PROVIDERS.VERTEX]: 12000
});

const DEFAULT_OUTPUT_TOKENS = 5000;

/* =========================================================
   MODEL CONFIGURATION
========================================================= */

const BEDROCK_MODEL =
  env.BEDROCK_MODEL_ID ||
  env.BEDROCK_MODEL ||
  '';

const SARVAM_MODEL =
  env.SARVAM_MODEL ||
  'sarvam-105b';

const BHARATROUTER_MODEL =
  env.BHARATROUTER_MODEL ||
  '';

const INDIEROUTER_MODEL =
  env.INDIEROUTER_MODEL ||
  '';

const VERTEX_MODEL =
  env.VERTEX_MODEL ||
  env.VERTEX_AI_MODEL ||
  'gemini-2.5-flash';

/* =========================================================
   BASE URL CONFIGURATION
========================================================= */

const SARVAM_BASE_URL =
  env.SARVAM_BASE_URL ||
  'https://api.sarvam.ai';

const BHARATROUTER_BASE_URL =
  env.BHARATROUTER_BASE_URL ||
  '';

const INDIEROUTER_BASE_URL =
  env.INDIEROUTER_BASE_URL ||
  '';

/* =========================================================
   AWS / GOOGLE CONFIGURATION
========================================================= */

const AWS_REGION =
  env.AWS_REGION ||
  env.BEDROCK_REGION ||
  'ap-south-1';

const VERTEX_PROJECT_ID =
  env.VERTEX_PROJECT_ID ||
  env.GOOGLE_CLOUD_PROJECT ||
  env.GCP_PROJECT_ID ||
  '';

const VERTEX_LOCATION =
  env.VERTEX_LOCATION ||
  env.GOOGLE_CLOUD_LOCATION ||
  'asia-south1';

const GOOGLE_WIF_CONFIG_JSON =
  env.GOOGLE_WIF_CONFIG_JSON ||
  process.env.GOOGLE_WIF_CONFIG_JSON ||
  '';

/* =========================================================
   RETRY / TIMEOUT CONFIGURATION
========================================================= */

function readNumber(value, fallback, minimum = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? Math.max(minimum, n)
    : fallback;
}

const AI_PROVIDER_QUOTA_COOLDOWN_MS = readNumber(
  process.env.AI_PROVIDER_QUOTA_COOLDOWN_MS,
  300000,
  10000
);

const AI_MAX_RETRIES = Math.floor(
  readNumber(env.AI_PROVIDER_MAX_RETRIES, 1, 0)
);

const AI_RETRY_BASE_DELAY_MS = readNumber(
  env.AI_PROVIDER_RETRY_BASE_DELAY_MS,
  1200,
  100
);

const AI_MAX_RETRY_DELAY_MS = Math.max(
  AI_RETRY_BASE_DELAY_MS,
  readNumber(env.AI_PROVIDER_MAX_RETRY_DELAY_MS, 5000, 100)
);

const AI_PROVIDER_TIMEOUT_MS = readNumber(
  env.AI_PROVIDER_TIMEOUT_MS,
  120000,
  1000
);

const providerCooldowns = new Map();

/* =========================================================
   SDK CLIENTS
========================================================= */

let bedrockClient = null;
let vertexClient = null;
let vertexAuth = null;
let vertexCredentialConfig = null;

/* =========================================================
   NORMALIZE TOKEN LIMIT
========================================================= */

function normalizeMaxTokens(provider, requestedTokens) {
  const cap =
    PROVIDER_MAX_OUTPUT_TOKENS[provider] ||
    DEFAULT_OUTPUT_TOKENS;

  const n = Number(requestedTokens);

  if (!Number.isFinite(n) || n <= 0) {
    return cap;
  }

  return Math.min(Math.floor(n), cap);
}

/* =========================================================
   GOOGLE WIF CONFIGURATION
========================================================= */

function loadGoogleWIFConfig() {
  if (
    !GOOGLE_WIF_CONFIG_JSON ||
    !String(GOOGLE_WIF_CONFIG_JSON).trim()
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(GOOGLE_WIF_CONFIG_JSON);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('must be a JSON object');
    }

    if (parsed.type !== 'external_account') {
      throw new Error('type must be external_account');
    }

    if (!parsed.audience) {
      throw new Error('audience is missing');
    }

    if (
      !parsed.credential_source ||
      typeof parsed.credential_source !== 'object'
    ) {
      throw new Error('credential_source is missing');
    }

    return parsed;
  } catch (error) {
    logger.warning(
      `Google WIF configuration invalid: ${error.message}`
    );

    return null;
  }
}

/* =========================================================
   INITIALIZE BEDROCK
========================================================= */

if (BedrockRuntimeClient) {
  try {
    bedrockClient = new BedrockRuntimeClient({
      region: AWS_REGION
    });
  } catch (error) {
    bedrockClient = null;

    logger.warning(
      `Bedrock client initialization failed: ${error.message}`
    );
  }
}

/* =========================================================
   INITIALIZE VERTEX
========================================================= */

vertexCredentialConfig = loadGoogleWIFConfig();

if (
  GoogleGenAI &&
  GoogleAuth &&
  VERTEX_PROJECT_ID &&
  vertexCredentialConfig
) {
  try {
    vertexAuth = new GoogleAuth({
      credentials: vertexCredentialConfig,
      projectId: VERTEX_PROJECT_ID,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform'
      ]
    });

    vertexClient = new GoogleGenAI({
      vertexai: true,
      project: VERTEX_PROJECT_ID,
      location: VERTEX_LOCATION,
      googleAuthOptions: {
        credentials: vertexCredentialConfig,
        projectId: VERTEX_PROJECT_ID,
        scopes: [
          'https://www.googleapis.com/auth/cloud-platform'
        ],
        clientOptions: {
          transporterOptions: {
            fetchImplementation: globalThis.fetch
          }
        }
      }
    });

    logger.info(
      `Google Vertex AI WIF client initialized | project=${VERTEX_PROJECT_ID} | location=${VERTEX_LOCATION}`
    );
  } catch (error) {
    vertexAuth = null;
    vertexClient = null;

    logger.warning(
      `Google Vertex AI WIF initialization failed: ${error.message}`
    );
  }
} else {
  if (!VERTEX_PROJECT_ID) {
    logger.warning(
      'Google Vertex AI unavailable: VERTEX_PROJECT_ID is missing'
    );
  } else if (!vertexCredentialConfig) {
    logger.warning(
      'Google Vertex AI unavailable: GOOGLE_WIF_CONFIG_JSON is missing or invalid'
    );
  } else if (!GoogleGenAI) {
    logger.warning(
      '@google/genai is not installed'
    );
  } else if (!GoogleAuth) {
    logger.warning(
      'google-auth-library is not installed'
    );
  }
}

/* =========================================================
   NORMALIZE PROVIDER NAME
========================================================= */

function normalizeProvider(provider) {
  const value = String(provider || '')
    .trim()
    .toLowerCase();

  const aliases = {
    bedrock: PROVIDERS.BEDROCK,
    'amazon-bedrock': PROVIDERS.BEDROCK,
    amazon: PROVIDERS.BEDROCK,
    aws: PROVIDERS.BEDROCK,

    sarvam: PROVIDERS.SARVAM,
    'sarvam-ai': PROVIDERS.SARVAM,
    sarvamai: PROVIDERS.SARVAM,

    bharatrouter: PROVIDERS.BHARATROUTER,
    'bharat-router': PROVIDERS.BHARATROUTER,
    'bharat router': PROVIDERS.BHARATROUTER,
    bharat: PROVIDERS.BHARATROUTER,

    indierouter: PROVIDERS.INDIEROUTER,
    'indie-router': PROVIDERS.INDIEROUTER,
    'indie router': PROVIDERS.INDIEROUTER,
    indie: PROVIDERS.INDIEROUTER,

    vertex: PROVIDERS.VERTEX,
    'vertex-ai': PROVIDERS.VERTEX,
    'google-vertex': PROVIDERS.VERTEX,
    vertexai: PROVIDERS.VERTEX
  };

  return aliases[value] || null;
}

/* =========================================================
   PROVIDER AVAILABILITY
========================================================= */

function isProviderAvailable(provider) {
  switch (normalizeProvider(provider)) {
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

const PROVIDER_CAPABILITIES = Object.freeze({
  [PROVIDERS.BEDROCK]: {
    coding: true,
    reasoning: true,
    planning: true,
    longContext: true,
    multimodal: true,
    structuredOutput: true
  },

  [PROVIDERS.SARVAM]: {
    coding: true,
    reasoning: true,
    planning: true,
    longContext: true,
    multimodal: false,
    structuredOutput: true
  },

  [PROVIDERS.BHARATROUTER]: {
    coding: true,
    reasoning: true,
    planning: true,
    longContext: true,
    multimodal: true,
    structuredOutput: true
  },

  [PROVIDERS.INDIEROUTER]: {
    coding: true,
    reasoning: true,
    planning: true,
    longContext: true,
    multimodal: true,
    structuredOutput: true
  },

  [PROVIDERS.VERTEX]: {
    coding: true,
    reasoning: true,
    planning: true,
    longContext: true,
    multimodal: true,
    structuredOutput: true
  }
});

/* =========================================================
   GET PROVIDER ORDER
========================================================= */

function getProviderOrder(options = {}) {
  const requested = normalizeProvider(options.provider);

  if (requested) {
    return [
      requested,
      ...DEFAULT_PROVIDER_ORDER.filter(
        (provider) => provider !== requested
      )
    ];
  }

  const capability = String(
    options.capability ||
    options.taskType ||
    options.role ||
    ''
  )
    .trim()
    .toLowerCase();

  if (
    ['coding', 'builder', 'code'].includes(capability)
  ) {
    return [...CODING_PROVIDER_ORDER];
  }

  if (
    ['planning', 'planner', 'reasoning'].includes(capability)
  ) {
    return [...PLANNING_PROVIDER_ORDER];
  }

  if (
    ['multimodal', 'vision'].includes(capability)
  ) {
    return [...MULTIMODAL_PROVIDER_ORDER];
  }

  return [...DEFAULT_PROVIDER_ORDER];
}

/* =========================================================
   COOLDOWN
========================================================= */

function isProviderCoolingDown(provider) {
  const until = providerCooldowns.get(provider);

  if (!until) {
    return false;
  }

  if (Date.now() >= until) {
    providerCooldowns.delete(provider);
    return false;
  }

  return true;
}

function cooldownProvider(
  provider,
  duration = AI_PROVIDER_QUOTA_COOLDOWN_MS
) {
  const until = Date.now() + duration;

  providerCooldowns.set(provider, until);

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
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `${provider} AI provider timed out after ${timeoutMs}ms`
      );

      error.code = 'AI_PROVIDER_TIMEOUT';
      error.provider = provider;
      error.model = model;

      reject(error);
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timer);
  });
}

/* =========================================================
   ERROR HELPERS
========================================================= */

function getErrorStatus(error) {
  const candidates = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.response?.statusCode,
    error?.error?.status,
    error?.details?.status
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);

    if (
      Number.isFinite(n) &&
      n >= 100 &&
      n <= 599
    ) {
      return n;
    }
  }

  return null;
}

function getErrorCode(error) {
  return String(
    error?.code ||
    error?.error?.code ||
    error?.error?.status ||
    error?.statusText ||
    ''
  )
    .trim()
    .toUpperCase();
}

function getErrorMessage(error) {
  return String(
    error?.message ||
    error?.error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.details?.message ||
    ''
  ).trim();
}

/* =========================================================
   ERROR CLASSIFICATION
========================================================= */

function classifyProviderError(error) {
  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();

  if (
    [
      'AI_INVALID_JSON',
      'AI_STRUCTURED_OUTPUT_INVALID',
      'AI_EMPTY_RESPONSE'
    ].includes(error?.code)
  ) {
    return {
      category:
        error.code === 'AI_EMPTY_RESPONSE'
          ? 'empty_response'
          : 'structured_output',
      retryable: true,
      fallback: true
    };
  }

  if (
    [
      'AI_PROVIDER_TIMEOUT',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'ENOTFOUND',
      'UND_ERR_CONNECT_TIMEOUT',
      'AI_NETWORK_ERROR'
    ].includes(code) ||
    message.includes('fetch failed') ||
    message.includes('socket hang up')
  ) {
    return {
      category: 'temporary',
      retryable: true,
      fallback: true
    };
  }

  const quotaPhrases = [
    'quota',
    'resource exhausted',
    'resource_exhausted',
    'rate limit',
    'too many requests',
    'too many tokens',
    'tokens per day',
    'daily token',
    'daily tokens',
    'daily quota',
    'insufficient balance',
    'insufficient funds',
    'billing',
    'credit balance',
    'usage limit',
    'usage quota',
    'exceeded your current quota',
    'payment required',
    'credits exhausted',
    'credits exceeded',
    'capacity exceeded',
    'resource has been exhausted',
    'insufficient_quota'
  ];

  if (
    status === 429 ||
    status === 402 ||
    code === 'RESOURCE_EXHAUSTED' ||
    code === 'INSUFFICIENT_QUOTA' ||
    quotaPhrases.some(
      (phrase) => message.includes(phrase)
    )
  ) {
    return {
      category: 'quota',
      retryable: false,
      fallback: true
    };
  }

  if (
    [401, 403].includes(status) ||
    [
      'UNAUTHORIZED',
      'AUTHENTICATION_ERROR',
      'PERMISSION_DENIED',
      'INVALID_API_KEY',
      'INVALID_CREDENTIALS',
      'UNAUTHENTICATED'
    ].includes(code) ||
    /invalid api key|authentication|unauthorized|permission denied|unauthenticated|access denied/.test(message)
  ) {
    return {
      category: 'authentication',
      retryable: false,
      fallback: true
    };
  }

  if (
    error?.code === 'AI_PROVIDER_NOT_CONFIGURED'
  ) {
    return {
      category: 'configuration',
      retryable: false,
      fallback: true
    };
  }

  if (
    status === 400 ||
    status === 422 ||
    error?.code === 'AI_INVALID_REQUEST'
  ) {
    return {
      category: 'invalid_request',
      retryable: false,
      fallback: false
    };
  }

  if (
    [408, 500, 502, 503, 504].includes(status) ||
    /temporarily unavailable|service unavailable|internal server error|bad gateway|gateway timeout|try again later|overloaded|high demand|deadline exceeded|server error|network error|connection reset/.test(message)
  ) {
    return {
      category: 'temporary',
      retryable: true,
      fallback: true
    };
  }

  return {
    category: 'provider_error',
    retryable: false,
    fallback: true
  };
}

/* =========================================================
   RETRY DELAY
========================================================= */

function getRetryDelay(attempt, error = null) {
  const headers = error?.response?.headers;

  const retryAfter =
    error?.retryAfterMs ??
    error?.retryAfter ??
    headers?.get?.('retry-after') ??
    headers?.['retry-after'] ??
    headers?.['Retry-After'];

  if (
    retryAfter !== undefined &&
    retryAfter !== null &&
    retryAfter !== ''
  ) {
    const numeric = Number(retryAfter);

    if (
      Number.isFinite(numeric) &&
      numeric > 0
    ) {
      const ms =
        error?.retryAfterMs != null
          ? numeric
          : numeric * 1000;

      return Math.min(
        ms,
        AI_MAX_RETRY_DELAY_MS
      );
    }
  }

  const exponential =
    AI_RETRY_BASE_DELAY_MS *
    (2 ** Math.max(0, attempt - 1));

  return Math.min(
    exponential + Math.floor(Math.random() * 300),
    AI_MAX_RETRY_DELAY_MS
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/* =========================================================
   MESSAGE NORMALIZATION
========================================================= */

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message) =>
        message &&
        typeof message.content === 'string' &&
        message.content.trim()
    )
    .map((message) => ({
      role: [
        'system',
        'user',
        'assistant'
      ].includes(message.role)
        ? message.role
        : 'user',

      content: message.content.trim()
    }));
}

function buildMessages(options = {}) {
  let messages = Array.isArray(options.messages)
    ? normalizeMessages(options.messages)
    : [];

  if (
    !messages.length &&
    typeof options.prompt === 'string' &&
    options.prompt.trim()
  ) {
    messages = [{
      role: 'user',
      content: options.prompt.trim()
    }];
  }

  if (
    !messages.length &&
    typeof options.contents === 'string' &&
    options.contents.trim()
  ) {
    messages = [{
      role: 'user',
      content: options.contents.trim()
    }];
  }

  if (
    typeof options.systemInstruction === 'string' &&
    options.systemInstruction.trim()
  ) {
    const index = messages.findIndex(
      (message) => message.role === 'system'
    );

    const systemMessage = {
      role: 'system',
      content: options.systemInstruction.trim()
    };

    if (index >= 0) {
      messages[index] = systemMessage;
    } else {
      messages.unshift(systemMessage);
    }
  }

  return messages;
}

function validateMessages(messages) {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.some(
      (message) =>
        message &&
        typeof message.content === 'string' &&
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
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    AI_PROVIDER_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const rawText = await response.text();

    let data = null;

    try {
      data = rawText
        ? JSON.parse(rawText)
        : null;
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      const error = new Error(
        data?.error?.message ||
        data?.message ||
        rawText ||
        `${provider} returned HTTP ${response.status}`
      );

      error.status = response.status;
      error.provider = provider;
      error.model = model;

      error.response = {
        status: response.status,
        data,
        headers: response.headers
      };

      throw error;
    }

    return {
      data,
      status: response.status,
      headers: response.headers
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(
        `${provider} AI provider timed out after ${AI_PROVIDER_TIMEOUT_MS}ms`
      );

      timeoutError.code = 'AI_PROVIDER_TIMEOUT';
      timeoutError.provider = provider;
      timeoutError.model = model;

      throw timeoutError;
    }

    if (
      !error.status &&
      !error.code &&
      error instanceof TypeError
    ) {
      error.code = 'AI_NETWORK_ERROR';
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   OPENAI-COMPATIBLE RESPONSE TEXT
========================================================= */

function extractChatCompletionText(data) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (typeof item?.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join('')
      .trim();
  }

  if (Array.isArray(message?.content_blocks)) {
    return message.content_blocks
      .map((item) =>
        typeof item?.text === 'string'
          ? item.text
          : ''
      )
      .join('')
      .trim();
  }

  if (
    typeof message?.reasoning_content === 'string' &&
    message.reasoning_content.trim()
  ) {
    return message.reasoning_content.trim();
  }

  return '';
}

function getSafeResponseDiagnostics(data) {
  const choice = data?.choices?.[0] || null;
  const message = choice?.message || null;

  return {
    object: data?.object || null,
    model: data?.model || null,

    choices: Array.isArray(data?.choices)
      ? data.choices.length
      : 0,

    finishReason: choice?.finish_reason || null,
    messageRole: message?.role || null,
    hasContent: Boolean(message?.content),

    contentType: Array.isArray(message?.content)
      ? 'array'
      : typeof message?.content,

    hasReasoningContent: Boolean(
      message?.reasoning_content
    ),

    hasToolCalls:
      Array.isArray(message?.tool_calls) &&
      message.tool_calls.length > 0,

    usage: data?.usage
      ? {
          promptTokens:
            data.usage.prompt_tokens ?? null,

          completionTokens:
            data.usage.completion_tokens ?? null,

          totalTokens:
            data.usage.total_tokens ?? null
        }
      : null
  };
}

/* =========================================================
   JSON CLEANING AND PARSING
========================================================= */

function cleanJSONText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function extractJSONCandidate(value) {
  const cleaned = cleanJSONText(value);

  if (!cleaned) {
    return '';
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (_) {
    // Attempt to extract a JSON object or array.
  }

  for (
    let start = 0;
    start < cleaned.length;
    start += 1
  ) {
    const opening = cleaned[start];

    if (
      opening !== '{' &&
      opening !== '['
    ) {
      continue;
    }

    const stack = [];
    let inString = false;
    let escaped = false;

    for (
      let i = start;
      i < cleaned.length;
      i += 1
    ) {
      const ch = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }

        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}' || ch === ']') {
        const last = stack.pop();

        if (
          (ch === '}' && last !== '{') ||
          (ch === ']' && last !== '[')
        ) {
          break;
        }

        if (stack.length === 0) {
          const candidate = cleaned.slice(
            start,
            i + 1
          );

          try {
            JSON.parse(candidate);
            return candidate;
          } catch (_) {
            break;
          }
        }
      }
    }
  }

  return cleaned;
}

function parseJSONResponse(text) {
  if (
    typeof text !== 'string' ||
    !text.trim()
  ) {
    const error = new Error(
      'AI provider returned empty JSON content'
    );

    error.code = 'AI_EMPTY_RESPONSE';
    throw error;
  }

  const candidate = extractJSONCandidate(text);

  try {
    return JSON.parse(candidate);
  } catch (cause) {
    const error = new Error(
      `Invalid JSON: ${cause.message}`
    );

    error.code = 'AI_INVALID_JSON';
    error.parseMessage = cause.message;
    error.rawLength = text.length;

    throw error;
  }
}

/* =========================================================
   OPENAI-COMPATIBLE PROVIDERS
========================================================= */

async function generateWithOpenAICompatibleProvider(
  provider,
  options = {}
) {
  const configs = {
    [PROVIDERS.SARVAM]: {
      apiKey: env.SARVAM_API_KEY,
      baseURL: SARVAM_BASE_URL,
      model: SARVAM_MODEL
    },

    [PROVIDERS.BHARATROUTER]: {
      apiKey: env.BHARATROUTER_API_KEY,
      baseURL: BHARATROUTER_BASE_URL,
      model: BHARATROUTER_MODEL
    },

    [PROVIDERS.INDIEROUTER]: {
      apiKey: env.INDIEROUTER_API_KEY,
      baseURL: INDIEROUTER_BASE_URL,
      model: INDIEROUTER_MODEL
    }
  };

  const config = configs[provider];

  if (
    !config ||
    !config.apiKey ||
    !config.baseURL ||
    !config.model
  ) {
    const error = new Error(
      `${provider} provider is not configured: API key, base URL, or model missing`
    );

    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    error.provider = provider;

    throw error;
  }

  const messages = buildMessages(options);

  if (!validateMessages(messages)) {
    const error = new Error(
      'AI messages are required'
    );

    error.code = 'AI_INVALID_REQUEST';
    error.provider = provider;

    throw error;
  }

  const model =
    options.model && String(options.model).trim()
      ? String(options.model).trim()
      : config.model;

  const maxTokens = normalizeMaxTokens(
    provider,
    options.maxTokens
  );

  const body = {
    model,
    messages,
    stream: false,
    max_tokens: maxTokens
  };

  if (Number.isFinite(options.temperature)) {
    body.temperature = Number(options.temperature);
  }

  if (provider === PROVIDERS.SARVAM) {
    body.reasoning_effort = null;
  }

  if (options.json === true) {
    body.response_format = {
      type: 'json_object'
    };
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  if (provider === PROVIDERS.SARVAM) {
    headers['api-subscription-key'] = config.apiKey;
  } else {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  logger.info(
    `${provider} token policy: requested=${options.maxTokens || 'default'} | effective=${maxTokens}`
  );

  const baseURL = config.baseURL.replace(/\/+$/, '');

  const endpoint = /\/v1$/i.test(baseURL)
    ? `${baseURL}/chat/completions`
    : `${baseURL}/v1/chat/completions`;

  const response = await fetchJSON(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    },
    provider,
    model
  );

  const diagnostics = getSafeResponseDiagnostics(
    response.data
  );

  const text = extractChatCompletionText(
    response.data
  );

  if (!text) {
    logger.warning(
      `${provider} returned empty visible content | model=${model} | finishReason=${diagnostics.finishReason || 'unknown'} | choices=${diagnostics.choices} | hasReasoningContent=${diagnostics.hasReasoningContent} | hasToolCalls=${diagnostics.hasToolCalls} | totalTokens=${diagnostics.usage?.totalTokens ?? 'unknown'}`
    );

    const error = new Error(
      `${provider} returned an empty response`
    );

    error.code = 'AI_EMPTY_RESPONSE';
    error.provider = provider;
    error.model = model;
    error.responseDiagnostics = diagnostics;

    throw error;
  }

  return {
    success: true,
    provider,
    model,
    text,
    raw: response.data,
    usage: response.data?.usage || null,
    finishReason: diagnostics.finishReason || null
  };
}

/* =========================================================
   BEDROCK MESSAGE CONVERSION
========================================================= */

function buildBedrockMessages(messages) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role:
        message.role === 'assistant'
          ? 'assistant'
          : 'user',

      content: [
        {
          text: message.content
        }
      ]
    }));
}

/* =========================================================
   BEDROCK GENERATION
========================================================= */

async function generateWithBedrock(options = {}) {
  if (
    !bedrockClient ||
    !ConverseCommand ||
    !BEDROCK_MODEL
  ) {
    const error = new Error(
      'Amazon Bedrock provider is not configured'
    );

    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    error.provider = PROVIDERS.BEDROCK;

    throw error;
  }

  const messages = buildMessages(options);

  if (!validateMessages(messages)) {
    const error = new Error(
      'AI messages are required'
    );

    error.code = 'AI_INVALID_REQUEST';
    error.provider = PROVIDERS.BEDROCK;

    throw error;
  }

  const model =
    options.model && String(options.model).trim()
      ? String(options.model).trim()
      : BEDROCK_MODEL;

  const systemMessages = messages.filter(
    (message) => message.role === 'system'
  );

  const conversationMessages = buildBedrockMessages(
    messages
  );

  if (!conversationMessages.length) {
    const error = new Error(
      'Bedrock requires at least one user or assistant message'
    );

    error.code = 'AI_INVALID_REQUEST';
    error.provider = PROVIDERS.BEDROCK;

    throw error;
  }

  const maxTokens = normalizeMaxTokens(
    PROVIDERS.BEDROCK,
    options.maxTokens
  );

  const request = {
    modelId: model,
    messages: conversationMessages,
    inferenceConfig: {
      maxTokens
    }
  };

  if (systemMessages.length) {
    request.system = systemMessages.map(
      (message) => ({
        text: message.content
      })
    );
  }

  if (Number.isFinite(options.temperature)) {
    request.inferenceConfig.temperature =
      Number(options.temperature);
  }

  logger.info(
    `Bedrock token policy: requested=${options.maxTokens || 'default'} | effective=${maxTokens}`
  );

  try {
    const response = await withTimeout(
      bedrockClient.send(
        new ConverseCommand(request)
      ),
      AI_PROVIDER_TIMEOUT_MS,
      PROVIDERS.BEDROCK,
      model
    );

    const output = response?.output?.message;

    const text = Array.isArray(output?.content)
      ? output.content
          .filter(
            (block) => typeof block?.text === 'string'
          )
          .map((block) => block.text)
          .join('')
      : '';

    if (!text.trim()) {
      const error = new Error(
        'Amazon Bedrock returned an empty response'
      );

      error.code = 'AI_EMPTY_RESPONSE';
      error.provider = PROVIDERS.BEDROCK;
      error.model = model;

      throw error;
    }

    return {
      success: true,
      provider: PROVIDERS.BEDROCK,
      model,
      text: text.trim(),
      raw: response,
      usage: response?.usage || null,
      finishReason: response?.stopReason || null
    };
  } catch (error) {
    error.provider =
      error.provider || PROVIDERS.BEDROCK;

    error.model = error.model || model;

    throw error;
  }
}

/* =========================================================
   VERTEX CONTENT CONVERSION
========================================================= */

function buildVertexContents(messages) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role:
        message.role === 'assistant'
          ? 'model'
          : 'user',

      parts: [
        {
          text: message.content
        }
      ]
    }));
}

function extractVertexText(response) {
  if (typeof response?.text === 'string') {
    return response.text.trim();
  }

  return (response?.candidates || [])
    .flatMap(
      (candidate) => candidate?.content?.parts || []
    )
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

/* =========================================================
   VERTEX GENERATION
========================================================= */

async function generateWithVertex(options = {}) {
  if (
    !vertexClient ||
    !vertexCredentialConfig ||
    !VERTEX_PROJECT_ID ||
    !VERTEX_MODEL
  ) {
    const error = new Error(
      'Google Vertex AI provider is not configured'
    );

    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    error.provider = PROVIDERS.VERTEX;

    throw error;
  }

  const messages = buildMessages(options);

  if (!validateMessages(messages)) {
    const error = new Error(
      'AI messages are required'
    );

    error.code = 'AI_INVALID_REQUEST';
    error.provider = PROVIDERS.VERTEX;

    throw error;
  }

  const model =
    options.model && String(options.model).trim()
      ? String(options.model).trim()
      : VERTEX_MODEL;

  const systemMessages = messages.filter(
    (message) => message.role === 'system'
  );

  const contents = buildVertexContents(messages);

  if (!contents.length) {
    const error = new Error(
      'Vertex AI requires at least one user or assistant message'
    );

    error.code = 'AI_INVALID_REQUEST';
    error.provider = PROVIDERS.VERTEX;

    throw error;
  }

  const config = {
    maxOutputTokens: normalizeMaxTokens(
      PROVIDERS.VERTEX,
      options.maxTokens
    )
  };

  if (Number.isFinite(options.temperature)) {
    config.temperature = Number(options.temperature);
  }

  if (options.json === true) {
    config.responseMimeType = 'application/json';
  }

  if (systemMessages.length) {
    config.systemInstruction = {
      role: 'system',
      parts: systemMessages.map((message) => ({
        text: message.content
      }))
    };
  }

  try {
    const response = await withTimeout(
      vertexClient.models.generateContent({
        model,
        contents,
        config
      }),
      AI_PROVIDER_TIMEOUT_MS,
      PROVIDERS.VERTEX,
      model
    );

    const text = extractVertexText(response);

    if (!text) {
      const error = new Error(
        'Google Vertex AI returned an empty response'
      );

      error.code = 'AI_EMPTY_RESPONSE';
      error.provider = PROVIDERS.VERTEX;
      error.model = model;

      throw error;
    }

    return {
      success: true,
      provider: PROVIDERS.VERTEX,
      model,
      text,
      raw: response,
      usage: response?.usageMetadata || null,
      finishReason:
        response?.candidates?.[0]?.finishReason || null
    };
  } catch (error) {
    error.provider = error.provider || PROVIDERS.VERTEX;
    error.model = error.model || model;

    throw error;
  }
}

/* =========================================================
   GENERATE WITH SELECTED PROVIDER
========================================================= */

async function generateWithProvider(provider, options) {
  switch (provider) {
    case PROVIDERS.BEDROCK:
      return generateWithBedrock(options);

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
      return generateWithVertex(options);

    default: {
      const error = new Error(
        `Unsupported AI provider: ${provider}`
      );

      error.code = 'AI_UNSUPPORTED_PROVIDER';
      error.provider = provider;

      throw error;
    }
  }
}

/* =========================================================
   STRUCTURED JSON VALIDATION
========================================================= */

function validateStructuredJSON(result) {
  if (
    !result ||
    typeof result.text !== 'string' ||
    !result.text.trim()
  ) {
    const error = new Error(
      'AI provider returned empty structured output'
    );

    error.code = 'AI_STRUCTURED_OUTPUT_INVALID';
    error.provider = result?.provider || null;
    error.model = result?.model || null;

    throw error;
  }

  try {
    return {
      ...result,
      data: parseJSONResponse(result.text)
    };
  } catch (error) {
    error.provider = result.provider || null;
    error.model = result.model || null;
    error.finishReason = result.finishReason || null;
    error.responseDiagnostics = getSafeResponseDiagnostics(
      result.raw
    );

    const finishReason = String(
      result.finishReason || ''
    ).toLowerCase();

    if (
      finishReason === 'length' ||
      finishReason === 'max_tokens'
    ) {
      error.message =
        `${result.provider} returned truncated JSON because the output reached the token limit`;
    }

    throw error;
  }
}

/* =========================================================
   GENERATE TEXT
========================================================= */

async function generateText(options = {}) {
  const providerOrder = getProviderOrder(options);

  const configuredProviders = providerOrder.filter(
    isProviderAvailable
  );

  if (!configuredProviders.length) {
    const error = new Error(
      'No AI provider is configured. Check provider API keys, base URLs, model IDs, and SDK/WIF configuration.'
    );

    error.code = 'AI_NO_PROVIDER';
    error.provider = null;

    throw error;
  }

  const providerErrors = [];

  for (const provider of configuredProviders) {
    if (isProviderCoolingDown(provider)) {
      logger.warning(
        `AI Provider skipped due to active cooldown: ${provider}`
      );

      continue;
    }

    let attempt = 0;

    while (attempt <= AI_MAX_RETRIES) {
      if (attempt > 0) {
        const previousError =
          providerErrors[providerErrors.length - 1]?.error;

        const delay = getRetryDelay(
          attempt,
          previousError
        );

        logger.warning(
          `${provider} retry | attempt=${attempt + 1}/${AI_MAX_RETRIES + 1} | delay=${delay}ms`
        );

        await sleep(delay);
      }

      const model = getProviderModel(provider, options);
      const startedAt = Date.now();

      logger.info(
        `AI Request: ${provider}/${model || 'default'} | attempt=${attempt + 1}/${AI_MAX_RETRIES + 1}`
      );

      try {
        const result = await generateWithProvider(
          provider,
          options
        );

        if (options.json === true) {
          const structured = validateStructuredJSON(result);

          logger.success(
            `AI Success: ${provider}/${structured.model} | structured JSON valid | duration=${Date.now() - startedAt}ms`
          );

          return structured;
        }

        logger.success(
          `AI Success: ${provider}/${result.model} | duration=${Date.now() - startedAt}ms`
        );

        return result;
      } catch (error) {
        const classification = classifyProviderError(error);

        const message =
          getErrorMessage(error) ||
          'Unknown provider error';

        const item = {
          provider,
          model: error?.model || model || null,
          attempt: attempt + 1,
          category: classification.category,
          retryable: classification.retryable,
          fallback: classification.fallback,
          message,
          code: error?.code || 'AI_PROVIDER_ERROR',
          status: getErrorStatus(error),
          error
        };

        providerErrors.push(item);

        logger.warning(
          `AI Provider Failed: ${provider} | attempt=${attempt + 1} | category=${classification.category} | retryable=${classification.retryable} | status=${item.status || 'n/a'} | code=${item.code} | ${message}`
        );

        if (classification.category === 'quota') {
          cooldownProvider(provider);
          break;
        }

        if (
          classification.category === 'invalid_request' ||
          error?.code === 'AI_INVALID_REQUEST'
        ) {
          throw error;
        }

        if (
          classification.retryable &&
          attempt < AI_MAX_RETRIES
        ) {
          attempt += 1;
          continue;
        }

        // Move to the next eligible provider.
        break;
      }
    }
  }

  const finalError = new Error(
    'All configured AI providers failed or were cooling down.'
  );

  finalError.code = 'AI_ALL_PROVIDERS_FAILED';
  finalError.provider = null;

  finalError.providers = providerErrors.map(
    ({
      provider,
      model,
      attempt,
      category,
      retryable,
      fallback,
      message,
      code,
      status
    }) => ({
      provider,
      model,
      attempt,
      category,
      retryable,
      fallback,
      message,
      code,
      status
    })
  );

  logger.error(
    `AI Provider Chain Failed: ${
      finalError.providers
        .map((item) =>
          `${item.provider}${item.model ? `/${item.model}` : ''}: ${item.category}: ${item.message}`
        )
        .join(' | ') ||
      'No provider attempts completed; all providers may be cooling down.'
    }`
  );

  throw finalError;
}

/* =========================================================
   PROVIDER MODEL
========================================================= */

function getProviderModel(provider, options = {}) {
  if (
    options.model &&
    String(options.model).trim()
  ) {
    return String(options.model).trim();
  }

  switch (provider) {
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
      return '';
  }
}

/* =========================================================
   GENERATE JSON
========================================================= */

async function generateJSON(options = {}) {
  const result = await generateText({
    ...options,
    json: true
  });

  if (
    !result ||
    result.success !== true ||
    result.data === undefined ||
    result.data === null
  ) {
    const error = new Error(
      'AI provider returned an invalid structured response'
    );

    error.code = 'AI_STRUCTURED_OUTPUT_INVALID';
    error.provider = result?.provider || null;
    error.model = result?.model || null;

    throw error;
  }

  return result;
}

/* =========================================================
   PROVIDER STATUS
========================================================= */

function getProviderStatus() {
  const providers = {};

  for (const provider of DEFAULT_PROVIDER_ORDER) {
    const configured = isProviderAvailable(provider);
    const coolingDown = isProviderCoolingDown(provider);

    providers[provider] = {
      configured,
      enabled: true,
      available: configured && !coolingDown,
      coolingDown,

      primary: provider === PROVIDERS.SARVAM,
      fallback: provider !== PROVIDERS.SARVAM,

      model: getProviderModel(provider),

      capabilities:
        PROVIDER_CAPABILITIES[provider] || {},

      maxOutputTokens:
        PROVIDER_MAX_OUTPUT_TOKENS[provider] || null
    };

    if (provider === PROVIDERS.BEDROCK) {
      providers[provider].region = AWS_REGION;
    }

    if (provider === PROVIDERS.SARVAM) {
      providers[provider].baseURL = SARVAM_BASE_URL;
    }

    if (provider === PROVIDERS.BHARATROUTER) {
      providers[provider].baseURL =
        BHARATROUTER_BASE_URL;
    }

    if (provider === PROVIDERS.INDIEROUTER) {
      providers[provider].baseURL =
        INDIEROUTER_BASE_URL;
    }

    if (provider === PROVIDERS.VERTEX) {
      providers[provider].projectConfigured =
        Boolean(VERTEX_PROJECT_ID);

      providers[provider].wifConfigured =
        Boolean(vertexCredentialConfig);

      providers[provider].location = VERTEX_LOCATION;
    }
  }

  return {
    mode: 'multi-provider-role-based-routing',

    primary: PROVIDERS.SARVAM,

    fallbackOrder: DEFAULT_PROVIDER_ORDER.filter(
      (provider) => provider !== PROVIDERS.SARVAM
    ),

    providers,

    order: [...DEFAULT_PROVIDER_ORDER],

    capabilityOrders: {
      coding: [...CODING_PROVIDER_ORDER],
      planning: [...PLANNING_PROVIDER_ORDER],
      multimodal: [...MULTIMODAL_PROVIDER_ORDER]
    },

    capabilities: PROVIDER_CAPABILITIES,

    tokenPolicy: {
      providerMaxOutputTokens:
        PROVIDER_MAX_OUTPUT_TOKENS
    },

    cooldown: {
      quotaCooldownMs:
        AI_PROVIDER_QUOTA_COOLDOWN_MS
    },

    retry: {
      maxRetries: AI_MAX_RETRIES,
      baseDelayMs: AI_RETRY_BASE_DELAY_MS,
      maxDelayMs: AI_MAX_RETRY_DELAY_MS
    },

    timeoutMs: AI_PROVIDER_TIMEOUT_MS
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
