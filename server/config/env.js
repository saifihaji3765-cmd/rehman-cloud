require("dotenv").config();

/* =========================
ENV CONFIG
========================= */

const env = {

/* =========================
SERVER
========================= */

PORT:
process.env.PORT || 5000,

NODE_ENV:
process.env.NODE_ENV || "production",

/* =========================
DATABASE
========================= */

MONGO_URI:
process.env.MONGO_URI || "",

REDIS_URL:
process.env.REDIS_URL || "",

/* =========================
JWT
========================= */

JWT_SECRET:
process.env.JWT_SECRET || "",

JWT_EXPIRE:
process.env.JWT_EXPIRE || "7d",

/* =========================
OPENAI
========================= */

OPENAI_API_KEY:
process.env.OPENAI_API_KEY || "",

/* =========================
AWS
========================= */

AWS_ACCESS_KEY_ID:
process.env.AWS_ACCESS_KEY_ID || "",

AWS_SECRET_ACCESS_KEY:
process.env.AWS_SECRET_ACCESS_KEY || "",

AWS_REGION:
process.env.AWS_REGION || "ap-south-1",

AWS_BUCKET_NAME:
process.env.AWS_BUCKET_NAME || "",

/* =========================
GOOGLE OAUTH
========================= */

GOOGLE_CLIENT_ID:
process.env.GOOGLE_CLIENT_ID || "",

GOOGLE_CLIENT_SECRET:
process.env.GOOGLE_CLIENT_SECRET || "",

/* =========================
GITHUB OAUTH
========================= */

GITHUB_CLIENT_ID:
process.env.GITHUB_CLIENT_ID || "",

GITHUB_CLIENT_SECRET:
process.env.GITHUB_CLIENT_SECRET || "",

/* =========================
STRIPE
========================= */

STRIPE_SECRET_KEY:
process.env.STRIPE_SECRET_KEY || "",

STRIPE_WEBHOOK_SECRET:
process.env.STRIPE_WEBHOOK_SECRET || "",

/* =========================
RAZORPAY
========================= */

RAZORPAY_KEY_ID:
process.env.RAZORPAY_KEY_ID || "",

RAZORPAY_KEY_SECRET:
process.env.RAZORPAY_KEY_SECRET || "",

RAZORPAY_WEBHOOK_SECRET:
process.env.RAZORPAY_WEBHOOK_SECRET || "",

/* =========================
DOMAINS
========================= */

APP_DOMAIN:
process.env.APP_DOMAIN ||
"zyrionos.com",

API_DOMAIN:
process.env.API_DOMAIN ||
"api.zyrionos.com",

CLIENT_URL:
process.env.CLIENT_URL ||
"https://zyrionos.com",

API_URL:
process.env.API_URL ||
"https://api.zyrionos.com"

};

/* =========================
EXPORT
========================= */

module.exports = env;
