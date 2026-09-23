require("dotenv").config();

/* =========================================================
   ZYRIONOS ENV CONFIGURATION

   PRODUCTION AI ARCHITECTURE

   Active AI Providers:

     1. Amazon Bedrock
     2. Sarvam AI
     3. BharatRouter
     4. IndieRouter
     5. Google Vertex AI

   IMPORTANT
   ---------------------------------------------------------
   - DeepSeek has been completely removed.
   - Claude / Anthropic has been completely removed.
   - Gemini is NOT configured as a direct provider here.
   - OpenAI is NOT configured as a provider.
   - Provider credentials remain backend-only.
   - Never expose provider API keys to the frontend.
   - Agents must use the centralized AI Provider Service.
========================================================= */


/* =========================================================
   ENV CONFIG
========================================================= */

const env = {

  /* =======================================================
     SERVER
  ======================================================= */

  PORT:
    process.env.PORT || 5000,

  NODE_ENV:
    process.env.NODE_ENV || "production",


  /* =======================================================
     FRONTEND / API
  ======================================================= */

  FRONTEND_URL:
    process.env.FRONTEND_URL ||
    "https://zyrionos.com",

  API_URL:
    process.env.API_URL ||
    "https://api.zyrionos.com",


  /* =======================================================
     DATABASE
  ======================================================= */

  MONGO_URI:
    process.env.MONGO_URI || "",

  REDIS_URL:
    process.env.REDIS_URL || "",


  /* =======================================================
     JWT
  ======================================================= */

  JWT_SECRET:
    process.env.JWT_SECRET || "",

  JWT_EXPIRE:
    process.env.JWT_EXPIRE || "7d",


  /* =======================================================
     AI — AMAZON BEDROCK
  =======================================================

     Amazon Bedrock is one of the primary AI routes.

     AWS credentials should preferably be provided through
     the ECS task IAM role / AWS credential provider chain.

     Explicit AWS credentials are supported for compatibility
     with the existing deployment configuration.

     Never expose these values to the frontend.
  ======================================================= */

  BEDROCK_MODEL_ID:
    process.env.BEDROCK_MODEL_ID ||
    process.env.BEDROCK_MODEL ||
    "",

  BEDROCK_MODEL:
    process.env.BEDROCK_MODEL ||
    process.env.BEDROCK_MODEL_ID ||
    "",

  BEDROCK_REGION:
    process.env.BEDROCK_REGION ||
    process.env.AWS_REGION ||
    "ap-south-1",


  /* =======================================================
     AI — SARVAM AI
  =======================================================

     Sarvam is an active ZyrionOS AI provider route.

     API credentials remain backend-only.

     The model can be changed through environment
     configuration without changing application code.
  ======================================================= */

  SARVAM_API_KEY:
    process.env.SARVAM_API_KEY || "",

  SARVAM_MODEL:
    process.env.SARVAM_MODEL ||
    "sarvam-105b",

  SARVAM_BASE_URL:
    process.env.SARVAM_BASE_URL ||
    "https://api.sarvam.ai",


  /* =======================================================
     AI — BHARATROUTER
  =======================================================

     BharatRouter is treated as an AI routing/gateway
     provider route.

     API credentials remain backend-only.

     The endpoint and model are configurable because the
     gateway may expose different routes/models over time.
  ======================================================= */

  BHARATROUTER_API_KEY:
    process.env.BHARATROUTER_API_KEY || "",

  BHARATROUTER_MODEL:
    process.env.BHARATROUTER_MODEL || "",

  BHARATROUTER_BASE_URL:
    process.env.BHARATROUTER_BASE_URL || "",


  /* =======================================================
     AI — INDIEROUTER
  =======================================================

     IndieRouter is treated as an AI routing/provider route.

     API credentials remain backend-only.

     Endpoint and model remain environment configurable.
  ======================================================= */

  INDIEROUTER_API_KEY:
    process.env.INDIEROUTER_API_KEY || "",

  INDIEROUTER_MODEL:
    process.env.INDIEROUTER_MODEL || "",

  INDIEROUTER_BASE_URL:
    process.env.INDIEROUTER_BASE_URL || "",


  /* =======================================================
     AI — GOOGLE VERTEX AI
  =======================================================

     Google Vertex AI is an active ZyrionOS AI route.

     Prefer Google Application Default Credentials,
     workload identity, or another secure server-side
     Google credential mechanism.

     Do NOT expose Google service credentials to the frontend.
  ======================================================= */

  VERTEX_PROJECT_ID:
    process.env.VERTEX_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT_ID ||
    "",

  VERTEX_LOCATION:
    process.env.VERTEX_LOCATION ||
    process.env.GOOGLE_CLOUD_LOCATION ||
    "us-central1",

  VERTEX_MODEL:
    process.env.VERTEX_MODEL ||
    process.env.VERTEX_AI_MODEL ||
    "gemini-2.5-flash",


  /* =======================================================
     GOOGLE CLOUD CREDENTIALS
  =======================================================

     Optional compatibility values.

     Prefer a secure credential mechanism rather than
     storing long-lived service-account secrets directly
     inside application source code.
  ======================================================= */

  GOOGLE_APPLICATION_CREDENTIALS:
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "",

  GOOGLE_CLOUD_PROJECT:
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.VERTEX_PROJECT_ID ||
    "",

  GOOGLE_CLOUD_LOCATION:
    process.env.GOOGLE_CLOUD_LOCATION ||
    process.env.VERTEX_LOCATION ||
    "us-central1",


  /* =======================================================
     AI PROVIDER CONTROL
  =======================================================

     There is intentionally NO fixed DeepSeek/Claude
     primary/fallback configuration anymore.

     The centralized AI Provider Service performs:

       capability detection
          ↓
       provider availability
          ↓
       provider routing
          ↓
       retry
          ↓
       alternate provider

     Supported provider identifiers:

       bedrock
       sarvam
       bharatrouter
       indierouter
       vertex
  ======================================================= */

  AI_PROVIDER:
    process.env.AI_PROVIDER ||
    "",

  AI_DEFAULT_PROVIDER:
    process.env.AI_DEFAULT_PROVIDER ||
    "",


  /* =======================================================
     AI PROVIDER TIMEOUT
  ======================================================= */

  AI_PROVIDER_TIMEOUT_MS:
    Number(
      process.env.AI_PROVIDER_TIMEOUT_MS ||
      120000
    ),


  /* =======================================================
     AI PROVIDER RETRY
  ======================================================= */

  AI_PROVIDER_MAX_RETRIES:
    Number(
      process.env.AI_PROVIDER_MAX_RETRIES ||
      1
    ),

  AI_PROVIDER_RETRY_BASE_DELAY_MS:
    Number(
      process.env.AI_PROVIDER_RETRY_BASE_DELAY_MS ||
      1200
    ),

  AI_PROVIDER_MAX_RETRY_DELAY_MS:
    Number(
      process.env.AI_PROVIDER_MAX_RETRY_DELAY_MS ||
      5000
    ),


  /* =======================================================
     AWS
  ======================================================= */

  AWS_ACCESS_KEY_ID:
    process.env.AWS_ACCESS_KEY_ID || "",

  AWS_SECRET_ACCESS_KEY:
    process.env.AWS_SECRET_ACCESS_KEY || "",

  AWS_SESSION_TOKEN:
    process.env.AWS_SESSION_TOKEN || "",

  AWS_REGION:
    process.env.AWS_REGION ||
    "ap-south-1",

  AWS_BUCKET_NAME:
    process.env.AWS_BUCKET_NAME || "",


  /* =======================================================
     GOOGLE OAUTH
  ======================================================= */

  GOOGLE_CLIENT_ID:
    process.env.GOOGLE_CLIENT_ID || "",

  GOOGLE_CLIENT_SECRET:
    process.env.GOOGLE_CLIENT_SECRET || "",

  GOOGLE_CALLBACK_URL:
    process.env.GOOGLE_CALLBACK_URL ||
    "https://api.zyrionos.com/api/auth/google/callback",


  /* =======================================================
     GITHUB OAUTH
  ======================================================= */

  GITHUB_CLIENT_ID:
    process.env.GITHUB_CLIENT_ID || "",

  GITHUB_CLIENT_SECRET:
    process.env.GITHUB_CLIENT_SECRET || "",

  GITHUB_CALLBACK_URL:
    process.env.GITHUB_CALLBACK_URL ||
    "https://api.zyrionos.com/api/auth/github/callback",


  /* =======================================================
     STRIPE
  ======================================================= */

  STRIPE_SECRET_KEY:
    process.env.STRIPE_SECRET_KEY || "",

  STRIPE_WEBHOOK_SECRET:
    process.env.STRIPE_WEBHOOK_SECRET || "",


  /* =======================================================
     RAZORPAY
  ======================================================= */

  RAZORPAY_KEY_ID:
    process.env.RAZORPAY_KEY_ID || "",

  RAZORPAY_KEY_SECRET:
    process.env.RAZORPAY_KEY_SECRET || "",

  RAZORPAY_WEBHOOK_SECRET:
    process.env.RAZORPAY_WEBHOOK_SECRET || "",


  /* =======================================================
     DOMAINS
  ======================================================= */

  APP_DOMAIN:
    process.env.APP_DOMAIN ||
    "zyrionos.com",

  API_DOMAIN:
    process.env.API_DOMAIN ||
    "api.zyrionos.com"

};


/* =========================================================
   EXPORT
========================================================= */

module.exports = env;
