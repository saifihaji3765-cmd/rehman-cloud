const env = require("./env");

/* =========================================================
   VALIDATE ENVIRONMENT

   Production AI Architecture:

     Primary:
       DeepSeek

     Fallback:
       Anthropic Claude

   IMPORTANT:

     - Gemini is removed from active AI architecture.
     - OpenAI is removed from active AI architecture.
     - At least one supported AI provider must be configured.
     - Provider routing is handled by the centralized
       AI Provider Service.
========================================================= */


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

    if (
      !env[key] ||
      env[key].toString().trim() === ""
    ) {

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
     AI PROVIDER AVAILABILITY
  =======================================================

     ZYRIONOS production AI architecture:

       DeepSeek
          ↓
       Claude fallback

     Gemini:
       Removed.

     OpenAI:
       Removed.

     At least one supported provider must be configured.
  ======================================================= */

  const hasDeepSeek =
    Boolean(
      env.DEEPSEEK_API_KEY &&
      env.DEEPSEEK_API_KEY.toString().trim()
    );


  const hasClaude =
    Boolean(
      env.ANTHROPIC_API_KEY &&
      env.ANTHROPIC_API_KEY.toString().trim()
    );


  /* =======================================================
     FAIL ONLY WHEN BOTH AI PROVIDERS ARE UNAVAILABLE
  ======================================================= */

  if (
    !hasDeepSeek &&
    !hasClaude
  ) {

    console.log("\n");

    console.log(
      "❌ No AI Provider Configured"
    );

    console.log(
      "Configure at least one of:"
    );

    console.log(
      "- DEEPSEEK_API_KEY"
    );

    console.log(
      "- ANTHROPIC_API_KEY"
    );

    console.log("\n");

    process.exit(1);

  }


  /* =======================================================
     AI PROVIDER STATUS
  ======================================================= */

  console.log("\n");

  console.log(
    "🤖 AI Provider Configuration"
  );

  console.log(
    `- DeepSeek: ${
      hasDeepSeek
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );

  console.log(
    `- Claude: ${
      hasClaude
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );


  /* =======================================================
     PRIMARY / FALLBACK PROVIDER
========================================================= */

  const primaryProvider =
    (
      env.AI_PRIMARY_PROVIDER ||
      "deepseek"
    )
      .toString()
      .trim()
      .toLowerCase();


  const fallbackProvider =
    (
      env.AI_FALLBACK_PROVIDER ||
      "claude"
    )
      .toString()
      .trim()
      .toLowerCase();


  /* =======================================================
     SUPPORTED PROVIDERS
  ======================================================= */

  const supportedProviders = [
    "deepseek",
    "claude"
  ];


  /* =======================================================
     VALIDATE PRIMARY PROVIDER NAME
  ======================================================= */

  if (
    !supportedProviders.includes(
      primaryProvider
    )
  ) {

    console.log("\n");

    console.log(
      "❌ Invalid AI_PRIMARY_PROVIDER"
    );

    console.log(
      `Received: ${primaryProvider}`
    );

    console.log(
      "Allowed: deepseek, claude"
    );

    console.log("\n");

    process.exit(1);

  }


  /* =======================================================
     VALIDATE FALLBACK PROVIDER NAME
  ======================================================= */

  if (
    !supportedProviders.includes(
      fallbackProvider
    )
  ) {

    console.log("\n");

    console.log(
      "❌ Invalid AI_FALLBACK_PROVIDER"
    );

    console.log(
      `Received: ${fallbackProvider}`
    );

    console.log(
      "Allowed: deepseek, claude"
    );

    console.log("\n");

    process.exit(1);

  }


  /* =======================================================
     PRIMARY PROVIDER AVAILABILITY
  ======================================================= */

  if (
    primaryProvider === "deepseek" &&
    !hasDeepSeek
  ) {

    console.log(
      "⚠️ Primary AI provider DeepSeek is not configured."
    );

  }


  if (
    primaryProvider === "claude" &&
    !hasClaude
  ) {

    console.log(
      "⚠️ Primary AI provider Claude is not configured."
    );

  }


  /* =======================================================
     FALLBACK PROVIDER AVAILABILITY
  ======================================================= */

  if (
    fallbackProvider === "deepseek" &&
    !hasDeepSeek
  ) {

    console.log(
      "⚠️ Fallback AI provider DeepSeek is not configured."
    );

  }


  if (
    fallbackProvider === "claude" &&
    !hasClaude
  ) {

    console.log(
      "⚠️ Fallback AI provider Claude is not configured."
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

    if (
      !env[key] ||
      env[key].toString().trim() === ""
    ) {

      console.log(
        `⚠️ Optional ENV Missing: ${key}`
      );

    }

  });


  /* =======================================================
     AI CONFIGURATION SUMMARY
  ======================================================= */

  console.log(
    `- Primary AI Provider: ${primaryProvider}`
  );

  console.log(
    `- Fallback AI Provider: ${fallbackProvider}`
  );


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
