const env = require("./env");

/* =========================================================
   ZYRIONOS ENVIRONMENT VALIDATION

   Production AI Architecture:

     ┌──────────────────────────────┐
     │     ZYRIONOS AI SERVICE      │
     └──────────────┬───────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
     Bedrock     Sarvam      BharatRouter
        │           │           │
     IndieRouter ───┴────── Google Vertex AI

   IMPORTANT:

     - DeepSeek is completely removed.
     - Anthropic Claude is completely removed.
     - Gemini direct provider is not used.
     - OpenAI direct provider is not used.
     - Provider routing is handled by the centralized
       AI Provider Service.
     - At least one supported AI provider must be configured.
     - Individual providers may remain unconfigured.
     - Provider availability is checked without exposing
       secret values.
========================================================= */


/* =========================================================
   CONSTANTS
========================================================= */

const SUPPORTED_PROVIDERS = [
  "bedrock",
  "sarvam",
  "bharatrouter",
  "indierouter",
  "vertex"
];


/* =========================================================
   SMALL HELPERS
========================================================= */

function hasValue(value) {
  return Boolean(
    value !== undefined &&
    value !== null &&
    value.toString().trim() !== ""
  );
}


function normalizeProvider(value) {

  if (!hasValue(value)) {
    return "";
  }

  return value
    .toString()
    .trim()
    .toLowerCase();

}


/* =========================================================
   PROVIDER AVAILABILITY
========================================================= */

/*
 * Amazon Bedrock
 *
 * Bedrock can authenticate through:
 *
 *   1. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
 *   2. ECS task role / IAM role
 *
 * Therefore we consider it configured when:
 *
 *   - explicit AWS credentials exist
 *   OR
 *   - an AWS region exists and the application can rely
 *     on the AWS runtime credential chain.
 */

function isBedrockConfigured() {

  const explicitCredentials =
    hasValue(env.AWS_ACCESS_KEY_ID) &&
    hasValue(env.AWS_SECRET_ACCESS_KEY);

  const awsRuntimeAvailable =
    hasValue(env.BEDROCK_REGION) ||
    hasValue(env.AWS_REGION);

  return (
    explicitCredentials ||
    awsRuntimeAvailable
  );

}


/*
 * Sarvam
 */

function isSarvamConfigured() {

  return hasValue(
    env.SARVAM_API_KEY
  );

}


/*
 * BharatRouter
 *
 * API key + model + base URL are required because the
 * provider service uses an OpenAI-compatible HTTP route.
 */

function isBharatRouterConfigured() {

  return (
    hasValue(env.BHARATROUTER_API_KEY) &&
    hasValue(env.BHARATROUTER_MODEL) &&
    hasValue(env.BHARATROUTER_BASE_URL)
  );

}


/*
 * IndieRouter
 */

function isIndieRouterConfigured() {

  return (
    hasValue(env.INDIEROUTER_API_KEY) &&
    hasValue(env.INDIEROUTER_MODEL) &&
    hasValue(env.INDIEROUTER_BASE_URL)
  );

}


/*
 * Google Vertex AI
 *
 * Vertex can authenticate through:
 *
 *   - Application Default Credentials
 *   - service-account credentials
 *   - GOOGLE_APPLICATION_CREDENTIALS
 *   - GCP runtime identity
 */

function isVertexConfigured() {

  const hasProject =
    hasValue(env.VERTEX_PROJECT_ID) ||
    hasValue(env.GOOGLE_CLOUD_PROJECT);

  const hasCredentials =
    hasValue(env.GOOGLE_APPLICATION_CREDENTIALS);

  /*
   * In managed GCP environments credentials can come from
   * Application Default Credentials, so a project alone can
   * be sufficient.
   */

  return (
    hasProject ||
    hasCredentials
  );

}


/* =========================================================
   BUILD PROVIDER STATUS
========================================================= */

function getProviderStatus() {

  return {

    bedrock:
      isBedrockConfigured(),

    sarvam:
      isSarvamConfigured(),

    bharatrouter:
      isBharatRouterConfigured(),

    indierouter:
      isIndieRouterConfigured(),

    vertex:
      isVertexConfigured()

  };

}


/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

function validateEnv() {

  /* =======================================================
     REQUIRED CORE VARIABLES
  ======================================================= */

  const requiredEnv = [

    "PORT",

    "MONGO_URI",

    "JWT_SECRET",

    "AWS_ACCESS_KEY_ID",

    "AWS_SECRET_ACCESS_KEY",

    "AWS_REGION",

    "FRONTEND_URL",

    "GOOGLE_CLIENT_ID",

    "GOOGLE_CLIENT_SECRET",

    "GOOGLE_CALLBACK_URL",

    "GITHUB_CLIENT_ID",

    "GITHUB_CLIENT_SECRET",

    "GITHUB_CALLBACK_URL"

  ];


  /* =======================================================
     CHECK CORE REQUIRED VARIABLES
  ======================================================= */

  const missingEnv = [];

  requiredEnv.forEach((key) => {

    if (!hasValue(env[key])) {

      missingEnv.push(key);

    }

  });


  /* =======================================================
     FAIL IF CORE VARIABLE IS MISSING
  ======================================================= */

  if (missingEnv.length > 0) {

    console.log("\n");

    console.log(
      "❌ Missing Required Environment Variables"
    );

    missingEnv.forEach((item) => {

      console.log(
        `- ${item}`
      );

    });

    console.log("\n");

    process.exit(1);

  }


  /* =======================================================
     AI PROVIDER STATUS
  ======================================================= */

  const providerStatus =
    getProviderStatus();


  const availableProviders =
    SUPPORTED_PROVIDERS.filter(
      (provider) =>
        providerStatus[provider] === true
    );


  /* =======================================================
     FAIL ONLY WHEN NO AI PROVIDER IS AVAILABLE
  ======================================================= */

  if (
    availableProviders.length === 0
  ) {

    console.log("\n");

    console.log(
      "❌ No ZyrionOS AI Provider Configured"
    );

    console.log(
      "Configure at least one supported provider:"
    );

    console.log(
      "- Amazon Bedrock"
    );

    console.log(
      "- Sarvam AI"
    );

    console.log(
      "- BharatRouter"
    );

    console.log(
      "- IndieRouter"
    );

    console.log(
      "- Google Vertex AI"
    );

    console.log("\n");

    process.exit(1);

  }


  /* =======================================================
     AI PROVIDER CONFIGURATION DISPLAY
  ======================================================= */

  console.log("\n");

  console.log(
    "🤖 ZyrionOS AI Provider Configuration"
  );

  console.log(
    `- Amazon Bedrock: ${
      providerStatus.bedrock
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );

  console.log(
    `- Sarvam AI: ${
      providerStatus.sarvam
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );

  console.log(
    `- BharatRouter: ${
      providerStatus.bharatrouter
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );

  console.log(
    `- IndieRouter: ${
      providerStatus.indierouter
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );

  console.log(
    `- Google Vertex AI: ${
      providerStatus.vertex
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );


  /* =======================================================
     PROVIDER AVAILABILITY WARNINGS
  ======================================================= */

  SUPPORTED_PROVIDERS.forEach(
    (provider) => {

      if (
        !providerStatus[provider]
      ) {

        console.log(
          `⚠️ AI Provider not configured: ${provider}`
        );

      }

    }
  );


  /* =======================================================
     LEGACY PROVIDER PROTECTION
  ======================================================= */

  /*
   * These providers are intentionally removed from the
   * active architecture.
   *
   * We do NOT use them for routing.
   *
   * We also do not print their secret values.
   */

  if (hasValue(env.DEEPSEEK_API_KEY)) {

    console.log(
      "⚠️ Legacy DeepSeek configuration detected. It is ignored by ZyrionOS."
    );

  }


  if (hasValue(env.ANTHROPIC_API_KEY)) {

    console.log(
      "⚠️ Legacy Anthropic configuration detected. It is ignored by ZyrionOS."
    );

  }


  /* =======================================================
     LEGACY PROVIDER SETTINGS PROTECTION
  ======================================================= */

  if (
    hasValue(env.AI_PRIMARY_PROVIDER)
  ) {

    console.log(
      "⚠️ Legacy AI_PRIMARY_PROVIDER detected. Centralized provider routing is now active."
    );

  }


  if (
    hasValue(env.AI_FALLBACK_PROVIDER)
  ) {

    console.log(
      "⚠️ Legacy AI_FALLBACK_PROVIDER detected. Centralized provider routing is now active."
    );

  }


  /* =======================================================
     ACTIVE DEFAULT PROVIDER
  ======================================================= */

  const configuredDefaultProvider =
    normalizeProvider(
      env.AI_DEFAULT_PROVIDER
    );


  if (
    configuredDefaultProvider &&
    !SUPPORTED_PROVIDERS.includes(
      configuredDefaultProvider
    )
  ) {

    console.log("\n");

    console.log(
      "❌ Invalid AI_DEFAULT_PROVIDER"
    );

    console.log(
      `Received: ${configuredDefaultProvider}`
    );

    console.log(
      `Allowed: ${SUPPORTED_PROVIDERS.join(", ")}`
    );

    console.log("\n");

    process.exit(1);

  }


  /*
   * If a default provider is explicitly selected but
   * not configured, warn instead of killing the server.
   *
   * The centralized provider service can still route to
   * another available provider.
   */

  if (
    configuredDefaultProvider &&
    !providerStatus[
      configuredDefaultProvider
    ]
  ) {

    console.log(
      `⚠️ AI_DEFAULT_PROVIDER "${configuredDefaultProvider}" is not currently configured.`
    );

    console.log(
      "⚠️ Centralized AI routing will use available providers."
    );

  }


  /* =======================================================
     OPTIONAL VARIABLES
  ======================================================= */

  const optionalEnv = [

    "REDIS_URL",

    "STRIPE_SECRET_KEY",

    "STRIPE_WEBHOOK_SECRET",

    "RAZORPAY_KEY_ID",

    "RAZORPAY_KEY_SECRET",

    "RAZORPAY_WEBHOOK_SECRET"

  ];


  /* =======================================================
     OPTIONAL WARNINGS
  ======================================================= */

  optionalEnv.forEach((key) => {

    if (!hasValue(env[key])) {

      console.log(
        `⚠️ Optional ENV Missing: ${key}`
      );

    }

  });


  /* =======================================================
     AI ROUTING SUMMARY
  ======================================================= */

  console.log(
    `- Configured AI Providers: ${
      availableProviders.length
    }`
  );

  console.log(
    `- Active Providers: ${
      availableProviders.join(", ")
    }`
  );


  if (
    configuredDefaultProvider
  ) {

    console.log(
      `- AI Default Provider: ${
        configuredDefaultProvider
      }`
    );

  } else {

    console.log(
      "- AI Default Provider: centralized capability-based routing"
    );

  }


  /* =======================================================
     SUCCESS
  ======================================================= */

  console.log(
    "✅ Environment Validation Passed"
  );

  console.log("\n");

}


/* =========================================================
   EXPORT
========================================================= */

module.exports = validateEnv;
