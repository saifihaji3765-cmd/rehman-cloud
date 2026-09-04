require("dotenv").config();

/* =========================
   PACKAGES
========================= */

const express = require("express");
const cors = require("cors");
const passport = require("passport");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const xssClean = require("xss-clean");

/* =========================
   CONFIG
========================= */

require("./server/config/passport");

const env = require("./server/config/env");
const validateEnv = require("./server/config/validateEnv");

/* =========================
   DATABASE
========================= */

const connectMongo = require("./server/database/mongo");

const { connectRedis } = require("./server/database/redis");

/* =========================
   ROUTES
========================= */

const authRoutes = require("./server/routes/authRoutes");
const aiRoutes = require("./server/routes/aiRoutes");
const deployRoutes = require("./server/routes/deployRoutes");
const paymentRoutes = require("./server/routes/paymentRoutes");
const webhookRoutes = require("./server/routes/webhookRoutes");
const subscriptionRoutes = require("./server/routes/subscriptionRoutes");
const projectRoutes = require("./server/routes/projectRoutes");

/* =========================
   SERVICES
========================= */

const logger = require("./server/services/loggerService");

/* =========================
   APP INIT
========================= */

const app = express();

/* =========================
   TRUST PROXY
========================= */

app.set("trust proxy", 1);

/* =========================
   VALIDATE ENV
========================= */

validateEnv();

/* =========================
   SECURITY
========================= */

app.use(helmet());

/* =========================
   CORS
========================= */

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://zyrionos.com",
  "https://www.zyrionos.com"
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      /*
       * Allow server-to-server / non-browser requests
       */
      if (!origin) {
        return callback(null, true);
      }

      /*
       * Allow configured frontend origins
       */
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(
        "CORS blocked origin:",
        origin
      );

      return callback(
        new Error("CORS origin not allowed")
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept"
    ]
  })
);

/* =========================
   BODY PARSER
========================= */

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb"
  })
);

/* =========================
   COOKIE PARSER
========================= */

app.use(cookieParser());

/*
 * IMPORTANT:
 * Authentication uses JWT stored inside
 * an HttpOnly cookie.
 *
 * express-session is intentionally NOT used.
 */

/* =========================
   PASSPORT
========================= */

app.use(passport.initialize());

/* =========================
   SECURITY SANITIZATION
========================= */

app.use(mongoSanitize());

app.use(xssClean());

/* =========================
   COMPRESSION
========================= */

app.use(compression());

/* =========================
   LOGGER
========================= */

app.use(morgan("dev"));

/* =========================
   API ROUTES
========================= */

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/ai",
  aiRoutes
);

app.use(
  "/api/deploy",
  deployRoutes
);

app.use(
  "/api/payment",
  paymentRoutes
);

app.use(
  "/api/webhook",
  webhookRoutes
);

app.use(
  "/api/subscription",
  subscriptionRoutes
);

app.use(
  "/api/projects",
  projectRoutes
);

/* =========================
   ROOT
========================= */

app.get(
  "/",
  (req, res) => {
    return res.status(200).json({
      success: true,
      platform: "VertexCloud",
      status: "online",
      version: "1.0.0"
    });
  }
);

/* =========================
   API HEALTH
========================= */

app.get(
  "/api/health",
  async (req, res) => {
    return res.status(200).json({
      success: true,
      server: "running",
      mongodb: "connected",
      redis: "connected",
      environment:
        process.env.NODE_ENV || "development",
      uptime: process.uptime()
    });
  }
);

/* =========================
   404 HANDLER
========================= */

app.use(
  (req, res) => {
    return res.status(404).json({
      success: false,
      message: "Route not found"
    });
  }
);

/* =========================
   GLOBAL ERROR HANDLER
========================= */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "GLOBAL ERROR:",
      err
    );

    try {
      logger.error(
        err.message
      );
    } catch (loggerError) {
      console.error(
        "Logger error:",
        loggerError
      );
    }

    /*
     * CORS error
     */
    if (
      err.message ===
      "CORS origin not allowed"
    ) {
      return res.status(403).json({
        success: false,
        message: "CORS origin not allowed"
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Internal Server Error",

      error:
        process.env.NODE_ENV ===
        "development"
          ? err.message
          : "Server Error"
    });
  }
);

/* =========================
   START SERVER
========================= */

async function startServer() {
  try {
    /* =========================
       MONGODB
    ========================= */

    await connectMongo();

    logger.success(
      "MongoDB Connected"
    );

    /* =========================
       REDIS
    ========================= */

    try {
      await connectRedis();

      logger.success(
        "Redis Connected"
      );
    } catch (redisError) {
      logger.error(
        "Redis Failed: " +
        redisError.message
      );

      /*
       * Redis failure should not stop
       * the complete application.
       */
    }

    /* =========================
       START APP
    ========================= */

    app.listen(
      env.PORT,
      () => {
        console.log(
          `🚀 VertexCloud running on ${env.PORT}`
        );

        logger.success(
          "VertexCloud Server Started"
        );
      }
    );
  } catch (error) {
    console.error(
      "SERVER START ERROR:",
      error
    );

    logger.error(
      error.message
    );

    process.exit(1);
  }
}

/* =========================
   BOOT SERVER
========================= */

startServer();
