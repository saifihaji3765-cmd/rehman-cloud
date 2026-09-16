const env = require("./env");

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

     ZYRIONOS supports multiple AI providers.

     OpenAI and Gemini are independent providers.

     At least ONE provider must be configured for the
     AI platform to operate.

     The provider router will handle fallback logic.
  ======================================================= */

  const hasOpenAI =
    Boolean(
      env.OPENAI_API_KEY &&
      env.OPENAI_API_KEY.toString().trim()
    );

  const hasGemini =
    Boolean(
      env.GEMINI_API_KEY &&
      env.GEMINI_API_KEY.toString().trim()
    );


  /* =======================================================
     FAIL ONLY WHEN BOTH AI PROVIDERS ARE UNAVAILABLE
  ======================================================= */

  if (
    !hasOpenAI &&
    !hasGemini
  ) {

    console.log("\n");

    console.log(
      "❌ No AI Provider Configured"
    );

    console.log(
      "Configure at least one of:"
    );

    console.log(
      "- OPENAI_API_KEY"
    );

    console.log(
      "- GEMINI_API_KEY"
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
    `- OpenAI: ${
      hasOpenAI
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );

  console.log(
    `- Gemini: ${
      hasGemini
        ? "AVAILABLE"
        : "NOT CONFIGURED"
    }`
  );


  /* =======================================================
     PRIMARY / FALLBACK PROVIDER VALIDATION
  ======================================================= */

  const primaryProvider =
    (
      env.AI_PRIMARY_PROVIDER ||
      "gemini"
    )
      .toString()
      .trim()
      .toLowerCase();

  const fallbackProvider =
    (
      env.AI_FALLBACK_PROVIDER ||
      "openai"
    )
      .toString()
      .trim()
      .toLowerCase();


  const supportedProviders = [
    "openai",
    "gemini"
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
      "Allowed: openai, gemini"
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
      "Allowed: openai, gemini"
    );

    console.log("\n");

    process.exit(1);

  }


  /* =======================================================
     PROVIDER AVAILABILITY CHECK
  =======================================================

     If the selected primary provider is not configured,
     we do NOT crash immediately.

     The future provider router can use the configured
     provider and apply fallback logic.
  ======================================================= */

  if (
    primaryProvider === "openai" &&
    !hasOpenAI
  ) {

    console.log(
      "⚠️ Primary AI provider OpenAI is not configured."
    );

  }


  if (
    primaryProvider === "gemini" &&
    !hasGemini
  ) {

    console.log(
      "⚠️ Primary AI provider Gemini is not configured."
    );

  }


  if (
    fallbackProvider === "openai" &&
    !hasOpenAI
  ) {

    console.log(
      "⚠️ Fallback AI provider OpenAI is not configured."
    );

  }


  if (
    fallbackProvider === "gemini" &&
    !hasGemini
  ) {

    console.log(
      "⚠️ Fallback AI provider Gemini is not configured."
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
