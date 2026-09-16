require("dotenv").config();

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
     AI — OPENAI
  ======================================================= */

  OPENAI_API_KEY:
    process.env.OPENAI_API_KEY || "",

  OPENAI_MODEL:
    process.env.OPENAI_MODEL ||
    "gpt-4.1-mini",


  /* =======================================================
     AI — GOOGLE GEMINI
  ======================================================= */

  GEMINI_API_KEY:
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "",

  GEMINI_MODEL:
    process.env.GEMINI_MODEL ||
    "gemini-3.8-flash",


  /* =======================================================
     AI PROVIDER CONTROL
  =======================================================

     OpenAI and Gemini are BOTH supported.

     The provider router that we build next will decide
     which provider should handle a request.

     No API key is exposed to the frontend.
  ======================================================= */

  AI_PRIMARY_PROVIDER:
    process.env.AI_PRIMARY_PROVIDER ||
    "gemini",

  AI_FALLBACK_PROVIDER:
    process.env.AI_FALLBACK_PROVIDER ||
    "openai",

  AI_PROVIDER_TIMEOUT_MS:
    Number(
      process.env.AI_PROVIDER_TIMEOUT_MS ||
      30000
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
