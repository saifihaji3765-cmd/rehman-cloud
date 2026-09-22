require("dotenv").config();

/* =========================================================
   ZYRIONOS ENV CONFIGURATION

   Production AI Architecture:

   Primary:
     DeepSeek

   Fallback:
     Anthropic Claude

   IMPORTANT:
     - Gemini is no longer an active AI provider.
     - OpenAI is no longer an active AI provider.
     - API keys are loaded only from environment variables.
     - Never expose provider keys to the frontend.
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
     AI — DEEPSEEK
  =======================================================

     DeepSeek is the PRIMARY production AI provider.

     The API key must be supplied through the backend
     environment only.

     Example environment variable:

       DEEPSEEK_API_KEY=...

     Never expose this value to the frontend.
  ======================================================= */

  DEEPSEEK_API_KEY:
    process.env.DEEPSEEK_API_KEY || "",

  DEEPSEEK_MODEL:
    process.env.DEEPSEEK_MODEL ||
    "deepseek-flash",

  DEEPSEEK_BASE_URL:
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com",


  /* =======================================================
     AI — ANTHROPIC CLAUDE
  =======================================================

     Claude is the FALLBACK production provider.

     The API key must be supplied through the backend
     environment only.

     Example environment variable:

       ANTHROPIC_API_KEY=...

     Never expose this value to the frontend.
  ======================================================= */

  ANTHROPIC_API_KEY:
    process.env.ANTHROPIC_API_KEY || "",

  CLAUDE_MODEL:
    process.env.CLAUDE_MODEL ||
    "claude-sonnet-4-6",


  /* =======================================================
     AI PROVIDER CONTROL
  =======================================================

     Central provider architecture:

       DeepSeek
          ↓
       Claude fallback

     Agents must NOT directly call DeepSeek or Claude.

     They should use the centralized AI Provider Service.

     Gemini:
       removed from active provider configuration.

     OpenAI:
       removed from active provider configuration.
  ======================================================= */

  AI_PRIMARY_PROVIDER:
    process.env.AI_PRIMARY_PROVIDER ||
    "deepseek",

  AI_FALLBACK_PROVIDER:
    process.env.AI_FALLBACK_PROVIDER ||
    "claude",


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
