const env = require("./env");

/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

function validateEnv() {

  /* =======================================================
     REQUIRED VARIABLES
  ======================================================= */

  const requiredEnv = [

    "PORT",

    "MONGO_URI",

    "JWT_SECRET",

    "OPENAI_API_KEY",

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
     CHECK REQUIRED VARIABLES
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
     FAIL IF REQUIRED VARIABLE IS MISSING
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
     OPTIONAL VARIABLES
  ======================================================= */

  const optionalEnv = [

    "REDIS_URL",

    "STRIPE_SECRET_KEY",

    "RAZORPAY_KEY_ID",

    "RAZORPAY_KEY_SECRET"

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
     SUCCESS
  ======================================================= */

  console.log(
    "✅ Environment Validation Passed"
  );

}

/* =========================================================
   EXPORT
========================================================= */

module.exports = validateEnv;
