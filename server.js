require("dotenv").config();

/* =========================================================
   PACKAGES
========================================================= */

const express = require("express");
const cors = require("cors");
const passport = require("passport");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const xssClean = require("xss-clean");

/* =========================================================
   CONFIG
========================================================= */

require("./server/config/passport");

const env = require("./server/config/env");
const validateEnv = require("./server/config/validateEnv");

/* =========================================================
   DATABASE
========================================================= */

const connectMongo = require("./server/database/mongo");
const { connectRedis } = require("./server/database/redis");

/* =========================================================
   ROUTES
========================================================= */

const authRoutes = require("./server/routes/authRoutes");
const aiRoutes = require("./server/routes/aiRoutes");
const deployRoutes = require("./server/routes/deployRoutes");
const paymentRoutes = require("./server/routes/paymentRoutes");
const webhookRoutes = require("./server/routes/webhookRoutes");
const subscriptionRoutes = require("./server/routes/subscriptionRoutes");
const projectRoutes = require("./server/routes/projectRoutes");

/* =========================================================
   SERVICES
========================================================= */

const logger = require("./server/services/loggerService");

/* =========================================================
   APP INIT
========================================================= */

const app = express();

/* =========================================================
   TRUST PROXY
========================================================= */

app.set("trust proxy", 1);

/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

validateEnv();

/* =========================================================
   SECURITY HEADERS
========================================================= */

app.use(
  helmet()
);

/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://zyrionos.com",
  "https://www.zyrionos.com"
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {

      /*
       * Allow server-to-server / webhook requests
       * that do not contain an Origin header.
       */
      if (!origin) {
        return callback(null, true);
      }

      /*
       * Allow only explicitly configured frontend origins.
       */
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(
        "CORS blocked origin:",
        origin
      );

      return callback(
        new Error(
          "CORS origin not allowed"
        )
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

/* =========================================================
   WEBHOOK ROUTES — MUST COME BEFORE JSON PARSER
=========================================================

   Stripe/Razorpay webhook signature verification can require
   access to the original request body.

   webhookRoutes.js is responsible for applying the correct
   raw-body handling to the provider endpoints.

   IMPORTANT:
   Do NOT move this below express.json().
========================================================= */

app.use(
  "/api/webhook",
  webhookRoutes
);

/* =========================================================
   BODY PARSERS
========================================================= */

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

/* =========================================================
   COOKIE PARSER
========================================================= */

app.use(
  cookieParser()
);

/*
 * Authentication uses JWT stored in an HttpOnly cookie.
 *
 * express-session is intentionally NOT used.
 */

/* =========================================================
   PASSPORT
========================================================= */

app.use(
  passport.initialize()
);

/* =========================================================
   DATABASE INPUT SANITIZATION
========================================================= */

app.use(
  mongoSanitize()
);

/* =========================================================
   XSS PROTECTION
========================================================= */

app.use(
  xssClean()
);

/* =========================================================
   COMPRESSION
========================================================= */

app.use(
  compression()
);

/* =========================================================
   HTTP LOGGER
========================================================= */

app.use(
  morgan("dev")
);

/* =========================================================
   API ROUTES
========================================================= */

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
  "/api/subscription",
  subscriptionRoutes
);

app.use(
  "/api/projects",
  projectRoutes
);

/* =========================================================
   ROOT
========================================================= */

app.get(
  "/",
  (req, res) => {

    return res.status(200).json({
      success: true,
      platform: "ZyrionOS",
      status: "online",
      version: "1.0.0"
    });
  }
);

/* =========================================================
   API HEALTH
========================================================= */

app.get(
  "/api/health",
  async (req, res) => {

    /*
     * Health endpoint intentionally reports application
     * availability here. Database-specific health should
     * come from the actual connection state if exposed
     * by the database modules.
     */

    return res.status(200).json({
      success: true,

      server: "running",

      environment:
        process.env.NODE_ENV ||
        "development",

      uptime:
        process.uptime(),

      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  (req, res) => {

    return res.status(404).json({
      success: false,
      message: "Route not found"
    });
  }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

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

    /* ---------------------------------------------
       CORS ERROR
    --------------------------------------------- */

    if (
      err.message ===
      "CORS origin not allowed"
    ) {

      return res.status(403).json({
        success: false,
        message:
          "CORS origin not allowed"
      });
    }

    /* ---------------------------------------------
       BODY PARSER ERROR
    --------------------------------------------- */

    if (
      err instanceof SyntaxError &&
      err.status === 400 &&
      "body" in err
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid JSON request body"
      });
    }

    /* ---------------------------------------------
       DEFAULT SERVER ERROR
    --------------------------------------------- */

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

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

  try {

    /* =====================================================
       MONGODB
    ===================================================== */

    await connectMongo();

    logger.success(
      "MongoDB Connected"
    );

    /* =====================================================
       REDIS
    ===================================================== */

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
       * Redis failure does not stop the complete
       * application.
       */
    }

    /* =====================================================
       START HTTP SERVER
    ===================================================== */

    const server =
      app.listen(
        env.PORT,
        () => {

          console.log(
            `🚀 ZyrionOS running on port ${env.PORT}`
          );

          logger.success(
            "ZyrionOS Server Started"
          );
        }
      );

    /* =====================================================
       SERVER ERROR
    ===================================================== */

    server.on(
      "error",
      (error) => {

        console.error(
          "HTTP SERVER ERROR:",
          error
        );

        try {

          logger.error(
            error.message
          );

        } catch (loggerError) {

          console.error(
            "Logger error:",
            loggerError
          );
        }

        process.exit(1);
      }
    );

    /* =====================================================
       GRACEFUL SHUTDOWN
    ===================================================== */

    const shutdown =
      async (signal) => {

        console.log(
          `${signal} received. Shutting down...`
        );

        server.close(
          () => {

            console.log(
              "HTTP server closed."
            );

            process.exit(0);
          }
        );

        /*
         * Safety timeout so the process does not remain
         * alive forever during shutdown.
         */
        setTimeout(
          () => {
            process.exit(1);
          },
          10000
        ).unref();
      };

    process.once(
      "SIGTERM",
      () => shutdown("SIGTERM")
    );

    process.once(
      "SIGINT",
      () => shutdown("SIGINT")
    );

  } catch (error) {

    console.error(
      "SERVER START ERROR:",
      error
    );

    try {

      logger.error(
        error.message
      );

    } catch (loggerError) {

      console.error(
        "Logger error:",
        loggerError
      );
    }

    process.exit(1);
  }
}

/* =========================================================
   BOOT SERVER
========================================================= */

startServer();
