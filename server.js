/**
 * =========================================================
 * ZYRIONOS SERVER
 * =========================================================
 *
 * Version: 5.2.0
 *
 * Responsibilities:
 *
 * - Application bootstrap
 * - Environment validation
 * - Security middleware
 * - CORS
 * - Request / correlation IDs
 * - Webhook raw-body isolation
 * - Body parsing
 * - Authentication initialization
 * - API route mounting
 * - Environment management
 * - Deployment Log System
 * - GitHub System
 * - Auto Fix trigger API
 * - Health/readiness endpoints
 * - Global error handling
 * - MongoDB startup
 * - Redis startup
 * - Graceful shutdown
 *
 *
 * IMPORTANT:
 *
 * webhookRoutes MUST be mounted before:
 *
 *   express.json()
 *   express.urlencoded()
 *
 * because payment/webhook signature verification may require
 * the original raw request body.
 *
 * =========================================================
 */

"use strict";


/* =========================================================
   ENVIRONMENT
========================================================= */

require("dotenv").config();


/* =========================================================
   PACKAGES
========================================================= */

const express =
  require("express");

const cors =
  require("cors");

const passport =
  require("passport");

const helmet =
  require("helmet");

const compression =
  require("compression");

const morgan =
  require("morgan");

const cookieParser =
  require("cookie-parser");

const mongoSanitize =
  require("express-mongo-sanitize");

const xssClean =
  require("xss-clean");

const mongoose =
  require("mongoose");


/* =========================================================
   CONFIGURATION
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
  connectRedis,
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
   ENVIRONMENT ROUTES
========================================================= */

/**
 * Environment System
 *
 * Flow:
 *
 * Routes
 *   ↓
 * Controller
 *   ↓
 * Agent
 *   ↓
 * Service
 *   ↓
 * Model
 *   ↓
 * MongoDB
 */

const environmentRoutes =
  require("./server/routes/environmentRoutes");


/* =========================================================
   DEPLOYMENT LOG ROUTES
========================================================= */

/**
 * Deployment Log System
 *
 * Flow:
 *
 * Deployment
 *      ↓
 * Deployment Log
 *      ↓
 * Error Recording
 *      ↓
 * Auto Fix Eligibility
 *      ↓
 * Auto Fix Trigger
 *      ↓
 * Fix Agent Handoff
 *
 *
 * Streaming is intentionally NOT mounted separately.
 */

const deploymentLogRoutes =
  require("./server/routes/deploymentLogRoutes");


/* =========================================================
   GITHUB ROUTES
========================================================= */

/**
 * GitHub System
 *
 * Flow:
 *
 * GitHub Routes
 *      ↓
 * Auth Middleware
 *      ↓
 * GitHub Controller
 *      ↓
 * GitHub Agent
 *      ↓
 * GitHub Service
 *      ↓
 * GitHub API
 *
 *
 * Current responsibilities:
 *
 * - GitHub connection management
 * - Repository listing
 * - Repository details
 * - Branch listing
 * - Repository contents
 * - File retrieval
 * - Default branch detection
 *
 *
 * GitHub OAuth LOGIN remains under:
 *
 * /api/auth/github
 *
 * GitHub WORKSPACE integration uses:
 *
 * /api/github
 */

const githubRoutes =
  require("./server/routes/githubRoutes");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("./server/services/loggerService");


/* =========================================================
   APPLICATION
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
    false,

  ready:
    false,

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

  "https://www.zyrionos.com",

]
  .filter(Boolean)
  .map(
    (origin) =>
      String(origin)
        .trim()
        .replace(
          /\/+$/,
          ""
        )
  );


app.use(
  cors({

    origin:
      function (
        origin,
        callback
      ) {

        /*
         * Allow requests without Origin.
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
            .replace(
              /\/+$/,
              ""
            );


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


        try {

          logger.warn(
            `CORS blocked origin: ${normalizedOrigin}`
          );

        } catch (
          loggerError
        ) {

          console.error(
            "CORS logger error:",
            loggerError.message
          );

        }


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

      "OPTIONS",

    ],


    allowedHeaders: [

      "Content-Type",

      "Authorization",

      "Accept",

      "X-Requested-With",

      "X-Request-ID",

      "X-Correlation-ID",

    ],


    exposedHeaders: [

      "X-Request-ID",

      "X-Correlation-ID",

    ],

  })
);


/* =========================================================
   REQUEST ID
========================================================= */

app.use(
  (
    req,
    res,
    next
  ) => {

    const incomingRequestId =
      req.headers[
        "x-request-id"
      ];


    const incomingCorrelationId =
      req.headers[
        "x-correlation-id"
      ];


    const requestId =
      incomingRequestId ||
      incomingCorrelationId ||
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 12)}`;


    req.requestId =
      String(
        requestId
      );


    res.setHeader(
      "X-Request-ID",
      req.requestId
    );


    res.setHeader(
      "X-Correlation-ID",
      req.requestId
    );


    next();

  }
);


/* =========================================================
   HTTP LOGGER
========================================================= */

app.use(
  morgan(
    process.env.NODE_ENV ===
      "production"
      ? "combined"
      : "dev"
  )
);


/* =========================================================
   WEBHOOK ROUTES
========================================================= */

/**
 * CRITICAL ORDER:
 *
 * webhookRoutes
 *      ↓
 * raw-body handling
 *      ↓
 * signature verification
 *      ↓
 * webhook controller
 *      ↓
 * normal body parsers
 */

app.use(
  "/api/webhook",
  webhookRoutes
);


/* =========================================================
   BODY PARSERS
========================================================= */

app.use(
  express.json({

    limit:
      process.env.API_JSON_BODY_LIMIT ||
      "10mb",

  })
);


app.use(
  express.urlencoded({

    extended:
      true,

    limit:
      process.env.API_URLENCODED_BODY_LIMIT ||
      "10mb",

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


/* =========================================================
   AUTH
========================================================= */

app.use(
  "/api/auth",
  authRoutes
);


/* =========================================================
   AI
========================================================= */

app.use(
  "/api/ai",
  aiRoutes
);


/* =========================================================
   DEPLOYMENT
========================================================= */

app.use(
  "/api/deploy",
  deployRoutes
);


/* =========================================================
   PAYMENT
========================================================= */

app.use(
  "/api/payment",
  paymentRoutes
);


/* =========================================================
   SUBSCRIPTION
========================================================= */

app.use(
  "/api/subscription",
  subscriptionRoutes
);


/* =========================================================
   PROJECTS
========================================================= */

app.use(
  "/api/projects",
  projectRoutes
);


/* =========================================================
   FINANCIAL
========================================================= */

app.use(
  "/api/financial",
  financialRoutes
);


/* =========================================================
   ENVIRONMENT SYSTEM
========================================================= */

app.use(
  "/api/environments",
  environmentRoutes
);


/* =========================================================
   DEPLOYMENT LOG SYSTEM
========================================================= */

app.use(
  "/api/deployment-logs",
  deploymentLogRoutes
);


/* =========================================================
   GITHUB SYSTEM
========================================================= */

/**
 * GitHub Workspace API
 *
 * Examples:
 *
 * GET
 * /api/github/health
 *
 * GET
 * /api/github/connections
 *
 * POST
 * /api/github/connections
 *
 * GET
 * /api/github/repositories
 *
 * GET
 * /api/github/repositories/:owner/:repository
 *
 * GET
 * /api/github/repositories/:owner/:repository/branches
 *
 * GET
 * /api/github/repositories/:owner/:repository/contents
 *
 * GET
 * /api/github/repositories/:owner/:repository/file
 *
 * GET
 * /api/github/repositories/:owner/:repository/default-branch
 *
 *
 * NOTE:
 *
 * /api/auth/github
 * remains the GitHub authentication/login flow.
 *
 * /api/github
 * is the connected GitHub workspace API.
 */

app.use(
  "/api/github",
  githubRoutes
);


/* =========================================================
   ROOT
========================================================= */

app.get(
  "/",
  (
    req,
    res
  ) => {

    return res
      .status(200)
      .json({

        success:
          true,

        platform:
          "ZyrionOS",

        status:
          applicationState.shuttingDown
            ? "shutting_down"
            : "online",

        version:
          "5.2.0",

        requestId:
          req.requestId,

        timestamp:
          new Date()
            .toISOString(),

      });

  }
);


/* =========================================================
   LIVENESS
========================================================= */

app.get(
  "/api/health",
  (
    req,
    res
  ) => {

    return res
      .status(200)
      .json({

        success:
          true,

        status:
          applicationState.shuttingDown
            ? "shutting_down"
            : "healthy",

        server:
          "running",

        environment:
          process.env.NODE_ENV ||
          "development",

        version:
          "5.2.0",

        uptime:
          process.uptime(),

        startedAt:
          applicationState.startedAt,

        shuttingDown:
          applicationState.shuttingDown,

        requestId:
          req.requestId,

        timestamp:
          new Date()
            .toISOString(),

      });

  }
);


/* =========================================================
   READINESS
========================================================= */

app.get(
  "/api/health/ready",
  async (
    req,
    res
  ) => {

    const mongoReady =
      mongoose
        .connection
        .readyState === 1;


    const redisReady =
      applicationState.redis ===
      "connected";


    const ready =
      mongoReady &&
      !applicationState.shuttingDown;


    const status =
      ready
        ? (
            redisReady
              ? "ready"
              : "degraded"
          )
        : "not_ready";


    return res
      .status(
        ready
          ? 200
          : 503
      )
      .json({

        success:
          ready,

        status,

        server: {

          running:
            true,

          shuttingDown:
            applicationState.shuttingDown,

          uptime:
            process.uptime(),

        },

        dependencies: {

          mongodb:
            mongoReady
              ? "connected"
              : "disconnected",

          redis:
            redisReady
              ? "connected"
              : applicationState.redis,

        },

        requestId:
          req.requestId,

        timestamp:
          new Date()
            .toISOString(),

      });

  }
);


/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  (
    req,
    res
  ) => {

    return res
      .status(404)
      .json({

        success:
          false,

        message:
          "Route not found",

        path:
          req.originalUrl,

        method:
          req.method,

        requestId:
          req.requestId,

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
      req.requestId ||
      req.headers[
        "x-request-id"
      ] ||
      null;


    const isProduction =
      (
        process.env.NODE_ENV ||
        "development"
      ) ===
      "production";


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
            err?.stack,

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
            "CORS origin not allowed",

          requestId,

        });

    }


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
            "Invalid JSON request body",

          requestId,

        });

    }


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
            "Request payload is too large",

          requestId,

        });

    }


    if (
      err?.code ===
        "ECONNABORTED" ||
      err?.code ===
        "ECONNRESET"
    ) {

      return res
        .status(499)
        .json({

          success:
            false,

          message:
            "Request was terminated by the client",

          requestId,

        });

    }


    const safeStatus =
      statusCode >= 400 &&
      statusCode < 600
        ? statusCode
        : 500;


    const response = {

      success:
        false,

      message:
        safeStatus >= 500
          ? "Internal Server Error"
          : (
              err?.message ||
              "Request failed"
            ),

      requestId,

    };


    if (
      !isProduction
    ) {

      response.error =
        err?.message;

      response.stack =
        err?.stack;

    }


    return res
      .status(
        safeStatus
      )
      .json(
        response
      );

  }
);


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

  let server =
    null;


  try {

    logger.info(
      "Starting ZyrionOS..."
    );


    logger.info(
      `Environment: ${
        process.env.NODE_ENV ||
        "development"
      }`
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
        `Redis Failed: ${redisError.message}`
      );

    }


    /* =====================================================
       HTTP SERVER
    ===================================================== */

    server =
      app.listen(
        env.PORT,
        () => {

          applicationState.ready =
            true;


          console.log(
            `🚀 ZyrionOS running on port ${env.PORT}`
          );


          logger.success(
            `ZyrionOS Server Started on port ${env.PORT}`
          );

        }
      );


    /* =====================================================
       SERVER ERROR
    ===================================================== */

    server.on(
      "error",
      (
        error
      ) => {

        applicationState.ready =
          false;


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
      async (
        signal
      ) => {

        if (
          shutdownStarted
        ) {

          return;

        }


        shutdownStarted =
          true;


        applicationState.shuttingDown =
          true;


        applicationState.ready =
          false;


        console.log(
          `${signal} received. Shutting down...`
        );


        try {

          logger.info(
            `${signal} received. Graceful shutdown started.`
          );

        } catch (
          loggerError
        ) {

          console.error(
            "Logger shutdown error:",
            loggerError
          );

        }


        /* =================================================
           STOP HTTP SERVER
        ================================================= */

        if (
          server
        ) {

          await new Promise(
            (
              resolve
            ) => {

              server.close(
                () => {

                  console.log(
                    "HTTP server closed."
                  );

                  resolve();

                }
              );

            }
          );

        }


        /* =================================================
           CLOSE MONGODB
        ================================================= */

        try {

          if (
            mongoose
              .connection
              .readyState !==
            0
          ) {

            await mongoose
              .connection
              .close(
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


        /* =================================================
           FINAL SHUTDOWN
        ================================================= */

        try {

          logger.info(
            "ZyrionOS shutdown completed."
          );

        } catch (
          loggerError
        ) {

          console.error(
            "Final logger error:",
            loggerError
          );

        }


        process.exit(0);

      };


    /* =====================================================
       PROCESS SIGNALS
    ===================================================== */

    process.once(
      "SIGTERM",
      () =>
        shutdown(
          "SIGTERM"
        )
    );


    process.once(
      "SIGINT",
      () =>
        shutdown(
          "SIGINT"
        )
    );


    /* =====================================================
       UNHANDLED REJECTION
    ===================================================== */

    process.on(
      "unhandledRejection",
      (
        reason
      ) => {

        console.error(
          "UNHANDLED REJECTION:",
          reason
        );


        try {

          logger.error(
            `Unhandled rejection: ${
              reason?.message ||
              String(
                reason
              )
            }`
          );

        } catch (
          loggerError
        ) {

          console.error(
            "Logger error:",
            loggerError
          );

        }

      }
    );


    /* =====================================================
       UNCAUGHT EXCEPTION
    ===================================================== */

    process.on(
      "uncaughtException",
      async (
        error
      ) => {

        console.error(
          "UNCAUGHT EXCEPTION:",
          error
        );


        try {

          logger.error(
            error.stack ||
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


        try {

          await shutdown(
            "UNCAUGHT_EXCEPTION"
          );

        } catch (
          shutdownError
        ) {

          console.error(
            "Emergency shutdown failed:",
            shutdownError
          );

          process.exit(1);

        }

      }
    );

  } catch (
    error
  ) {

    applicationState.ready =
      false;


    console.error(
      "SERVER START ERROR:",
      error
    );


    try {

      logger.error(
        error.stack ||
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


    try {

      if (
        mongoose
          .connection
          .readyState !==
        0
      ) {

        await mongoose
          .connection
          .close(
            false
          );

      }

    } catch (
      cleanupError
    ) {

      console.error(
        "Startup MongoDB cleanup error:",
        cleanupError.message
      );

    }


    process.exit(1);

  }

}


/* =========================================================
   BOOT
========================================================= */

startServer();


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  app;
