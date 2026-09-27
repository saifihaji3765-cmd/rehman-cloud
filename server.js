require("dotenv").config();

/* =========================================================
   ZyrionOS SERVER
   Version: 4.0.0
   =========================================================

   Responsibilities:
   - Application bootstrap
   - Environment validation
   - Security middleware
   - CORS
   - Webhook raw-body isolation
   - Body parsing
   - Authentication initialization
   - API route mounting
   - Health/readiness endpoints
   - Global error handling
   - Database startup
   - Redis startup
   - Graceful shutdown

   IMPORTANT WEBHOOK ARCHITECTURE:

      webhookRoutes
           ↓
      RAW BODY
           ↓
      Signature verification
           ↓
      Webhook controller

   webhookRoutes MUST be mounted before:
      express.json()
      express.urlencoded()

========================================================= */


/* =========================================================
   ENVIRONMENT
========================================================= */

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

const mongoSanitize =
  require("express-mongo-sanitize");

const xssClean =
  require("xss-clean");

const mongoose =
  require("mongoose");


/* =========================================================
   CONFIG
========================================================= */

require("./server/config/passport");

const env =
  require("./server/config/env");

const validateEnv =
  require("./server/config/validateEnv");


/* =========================================================
   DATABASE
========================================================= */

const connectMongo =
  require("./server/database/mongo");

const {
  connectRedis
} =
  require("./server/database/redis");


/* =========================================================
   ROUTES
========================================================= */

const authRoutes =
  require("./server/routes/authRoutes");

const aiRoutes =
  require("./server/routes/aiRoutes");

const deployRoutes =
  require("./server/routes/deployRoutes");

const paymentRoutes =
  require("./server/routes/paymentRoutes");

const webhookRoutes =
  require("./server/routes/webhookRoutes");

const subscriptionRoutes =
  require("./server/routes/subscriptionRoutes");

const projectRoutes =
  require("./server/routes/projectRoutes");

const financialRoutes =
  require("./server/routes/financialRoutes");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("./server/services/loggerService");


/* =========================================================
   APP
========================================================= */

const app =
  express();


/* =========================================================
   APPLICATION STATE
========================================================= */

const applicationState = {

  startedAt:
    new Date(),

  redis:

    "unknown",

  shuttingDown:
    false

};


/* =========================================================
   TRUST PROXY
========================================================= */

app.set(
  "trust proxy",
  1
);


/* =========================================================
   ENVIRONMENT VALIDATION
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

]
  .filter(Boolean)
  .map(
    origin =>
      String(origin)
        .trim()
        .replace(/\/+$/, "")
  );


app.use(
  cors({

    origin:
      function (
        origin,
        callback
      ) {

        /*
         * Requests without Origin are allowed.
         *
         * Examples:
         * - server-to-server requests
         * - provider webhooks
         * - health checks
         * - command-line requests
         */

        if (!origin) {

          return callback(
            null,
            true
          );

        }


        const normalizedOrigin =
          String(origin)
            .trim()
            .replace(/\/+$/, "");


        if (
          allowedOrigins.includes(
            normalizedOrigin
          )
        ) {

          return callback(
            null,
            true
          );

        }


        console.error(
          "CORS blocked origin:",
          normalizedOrigin
        );


        return callback(
          new Error(
            "CORS origin not allowed"
          )
        );

      },

    credentials:
      true,

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

      "Accept",

      "X-Requested-With"

    ]

  })
);


/* =========================================================
   HTTP LOGGER
=========================================================

   IMPORTANT:

   Morgan is intentionally mounted BEFORE API routes.

   If it is mounted after routes, requests that terminate
   inside route handlers may never reach Morgan.
========================================================= */

app.use(
  morgan("combined")
);


/* =========================================================
   WEBHOOK ROUTES
=========================================================

   CRITICAL:

   These routes MUST come before express.json().

   Stripe/Razorpay/WhatsApp signature verification may
   require the original raw request body.

========================================================= */

app.use(
  "/api/webhook",
  webhookRoutes
);


/* =========================================================
   BODY PARSERS
=========================================================

   Webhooks have already consumed their own raw body.

   All normal API routes use these parsers.
========================================================= */

app.use(
  express.json({

    limit:
      process.env.API_JSON_BODY_LIMIT ||
      "10mb"

  })
);


app.use(
  express.urlencoded({

    extended:
      true,

    limit:
      process.env.API_URLENCODED_BODY_LIMIT ||
      "10mb"

  })
);


/* =========================================================
   COOKIE PARSER
========================================================= */

app.use(
  cookieParser()
);


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
   FINANCIAL CONTROL PLANE
========================================================= */

app.use(
  "/api/financial",
  financialRoutes
);


/* =========================================================
   ROOT
========================================================= */

app.get(
  "/",
  (req, res) => {

    return res
      .status(200)
      .json({

        success:
          true,

        platform:
          "ZyrionOS",

        status:
          "online",

        version:
          "4.0.0"

      });

  }
);


/* =========================================================
   LIVENESS
=========================================================

   Liveness answers:

      "Is the Node process alive?"

   It intentionally does NOT require MongoDB or Redis.
========================================================= */

app.get(
  "/api/health",
  (req, res) => {

    return res
      .status(200)
      .json({

        success:
          true,

        status:
          "healthy",

        server:
          "running",

        environment:
          process.env.NODE_ENV ||
          "development",

        uptime:
          process.uptime(),

        startedAt:
          applicationState.startedAt,

        timestamp:
          new Date().toISOString()

      });

  }
);


/* =========================================================
   READINESS
=========================================================

   Readiness answers:

      "Can this instance actually serve the application?"

   MongoDB is considered mandatory.

   Redis is considered degraded rather than fatal because
   the current architecture intentionally allows the
   application to continue when Redis is unavailable.
========================================================= */

app.get(
  "/api/health/ready",
  async (req, res) => {

    const mongoReady =
      mongoose.connection.readyState === 1;


    const redisReady =
      applicationState.redis ===
      "connected";


    const ready =
      mongoReady;


    return res
      .status(
        ready
          ? 200
          : 503
      )
      .json({

        success:
          ready,

        status:
          ready
            ? (
                redisReady
                  ? "ready"
                  : "degraded"
              )
            : "not_ready",

        dependencies: {

          mongodb:
            mongoReady
              ? "connected"
              : "disconnected",

          redis:
            redisReady
              ? "connected"
              : applicationState.redis

        },

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

    return res
      .status(404)
      .json({

        success:
          false,

        message:
          "Route not found",

        path:
          req.originalUrl

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

    /*
     * Express requires the fourth argument for an
     * error-handling middleware.
     *
     * next is intentionally unused.
     */

    const statusCode =
      Number.isInteger(
        err?.status
      )
        ? err.status
        : Number.isInteger(
            err?.statusCode
          )
          ? err.statusCode
          : 500;


    const requestId =
      req.headers[
        "x-request-id"
      ] ||
      null;


    console.error(
      "GLOBAL ERROR:",
      err
    );


    try {

      logger.error(
        JSON.stringify({

          message:
            err?.message ||
            "Unknown error",

          status:
            statusCode,

          method:
            req.method,

          path:
            req.originalUrl,

          requestId,

          stack:
            err?.stack

        })
      );

    } catch (
      loggerError
    ) {

      console.error(
        "Logger error:",
        loggerError
      );

    }


    /* =====================================================
       CORS ERROR
    ===================================================== */

    if (
      err?.message ===
      "CORS origin not allowed"
    ) {

      return res
        .status(403)
        .json({

          success:
            false,

          message:
            "CORS origin not allowed"

        });

    }


    /* =====================================================
       JSON PARSER ERROR
    ===================================================== */

    if (
      err instanceof SyntaxError &&
      err.status === 400 &&
      (
        "body" in err ||
        err.type ===
          "entity.parse.failed"
      )
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          message:
            "Invalid JSON request body"

        });

    }


    /* =====================================================
       PAYLOAD TOO LARGE
    ===================================================== */

    if (
      err?.type ===
      "entity.too.large" ||
      statusCode === 413
    ) {

      return res
        .status(413)
        .json({

          success:
            false,

          message:
            "Request payload is too large"

        });

    }


    /* =====================================================
       DEFAULT ERROR
    ===================================================== */

    const isDevelopment =
      (
        process.env.NODE_ENV ||
        "development"
      ) === "development";


    return res
      .status(
        statusCode >= 400 &&
        statusCode < 600
          ? statusCode
          : 500
      )
      .json({

        success:
          false,

        message:
          statusCode === 500
            ? "Internal Server Error"
            : (
                err?.message ||
                "Request failed"
              ),

        ...(isDevelopment
          ? {
              error:
                err?.message,

              stack:
                err?.stack
            }
          : {})

      });

  }
);


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

  let server = null;


  try {

    /* =====================================================
       ENVIRONMENT
    ===================================================== */

    logger.info(
      "Starting ZyrionOS..."
    );


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

      applicationState.redis =
        "connected";


      logger.success(
        "Redis Connected"
      );

    } catch (
      redisError
    ) {

      applicationState.redis =
        "degraded";


      logger.error(
        "Redis Failed: " +
        redisError.message
      );

      /*
       * Current architecture allows the application to
       * continue without Redis.
       *
       * Readiness will report degraded state.
       */

    }


    /* =====================================================
       HTTP SERVER
    ===================================================== */

    server =
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
      error => {

        console.error(
          "HTTP SERVER ERROR:",
          error
        );


        try {

          logger.error(
            error.message
          );

        } catch (
          loggerError
        ) {

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

    let shutdownStarted =
      false;


    const shutdown =
      async signal => {

        if (
          shutdownStarted
        ) {

          return;

        }


        shutdownStarted =
          true;


        applicationState.shuttingDown =
          true;


        console.log(
          `${signal} received. Shutting down...`
        );


        /*
         * Stop accepting new HTTP requests.
         */

        if (server) {

          server.close(
            () => {

              console.log(
                "HTTP server closed."
              );

            }
          );

        }


        /*
         * Close MongoDB connection when possible.
         */

        try {

          if (
            mongoose.connection.readyState !==
            0
          ) {

            await mongoose.connection.close(
              false
            );

            console.log(
              "MongoDB connection closed."
            );

          }

        } catch (
          mongoShutdownError
        ) {

          console.error(
            "MongoDB shutdown error:",
            mongoShutdownError.message
          );

        }


        /*
         * Give in-flight work a short period to finish.
         */

        setTimeout(
          () => {

            console.error(
              "Forced shutdown after timeout."
            );

            process.exit(1);

          },
          10000
        ).unref();


        /*
         * Exit successfully after MongoDB closes.
         *
         * The Redis module may own its own lifecycle,
         * therefore this server does not invent a Redis
         * disconnect API that may not exist.
         */

        setTimeout(
          () => {

            process.exit(0);

          },
          500
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


  } catch (
    error
  ) {

    console.error(
      "SERVER START ERROR:",
      error
    );


    try {

      logger.error(
        error.message
      );

    } catch (
      loggerError
    ) {

      console.error(
        "Logger error:",
        loggerError
      );

    }


    /*
     * Attempt MongoDB cleanup if startup failed after
     * establishing a connection.
     */

    try {

      if (
        mongoose.connection.readyState !==
        0
      ) {

        await mongoose.connection.close(
          false
        );

      }

    } catch (
      cleanupError
    ) {

      console.error(
        "Startup cleanup error:",
        cleanupError.message
      );

    }


    process.exit(1);

  }

}


/* =========================================================
   BOOT SERVER
========================================================= */

startServer();


/* =========================================================
   EXPORT APP
=========================================================

   Exporting the app makes it possible to use this entry
   point with integration/smoke tests without starting
   another HTTP server manually.

   The actual production process still starts through
   startServer() above.
========================================================= */

module.exports = app;
