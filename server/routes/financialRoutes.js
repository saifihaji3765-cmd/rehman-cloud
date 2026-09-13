"use strict";

/**
 * =========================================================
 * ZyrionOS FINANCIAL CONTROL ROUTES
 * =========================================================
 *
 * Security:
 *
 *   Request
 *      ↓
 *   Authentication
 *      ↓
 *   Owner Authorization
 *      ↓
 *   Rate Limiter
 *      ↓
 *   Financial Controller
 *      ↓
 *   Financial Control Service
 *
 * IMPORTANT:
 * - No payment execution here.
 * - No infrastructure execution here.
 * - No provider credentials accepted here.
 * - No fake financial data.
 * - Owner-only access.
 * - Provider data must come from real provider adapters.
 */

const express = require("express");

const router = express.Router();

/* =========================================================
   CONTROLLERS
========================================================= */

const financialController =
  require("../controllers/financialController");

/* =========================================================
   RAW MIDDLEWARE MODULES
========================================================= */

const authMiddlewareModule =
  require("../middleware/authMiddleware");

const ownerOnlyMiddlewareModule =
  require("../middleware/ownerOnlyMiddleware");

/* =========================================================
   HELPERS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function cleanString(value, maxLength = 200) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

/**
 * Resolve middleware exports safely.
 *
 * Supports projects where middleware is exported as:
 *
 * module.exports = middleware
 *
 * OR:
 *
 * module.exports = {
 *   middleware
 * }
 *
 * OR:
 *
 * module.exports = {
 *   authMiddleware
 * }
 *
 * OR owner middleware exposing:
 *
 * requireOwner
 *
 * This prevents Express from receiving an object as
 * a route callback.
 */
function resolveMiddleware(
  moduleValue,
  preferredNames = []
) {
  if (isFunction(moduleValue)) {
    return moduleValue;
  }

  if (
    moduleValue &&
    isFunction(moduleValue.default)
  ) {
    return moduleValue.default;
  }

  for (
    const name of preferredNames
  ) {
    if (
      moduleValue &&
      isFunction(moduleValue[name])
    ) {
      return moduleValue[name];
    }
  }

  return null;
}

/**
 * Resolve controller operation safely.
 *
 * Every returned route handler is guaranteed to be
 * a function or null.
 */
function resolveController(
  controller,
  names = []
) {
  if (!controller) {
    return null;
  }

  if (isFunction(controller)) {
    return controller;
  }

  for (
    const name of names
  ) {
    if (
      controller &&
      isFunction(controller[name])
    ) {
      return controller[name];
    }
  }

  return null;
}

/* =========================================================
   AUTHENTICATION
========================================================= */

const authenticationMiddleware =
  resolveMiddleware(
    authMiddlewareModule,
    [
      "authMiddleware",
      "authenticate",
      "requireAuth"
    ]
  );

/* =========================================================
   OWNER AUTHORIZATION
========================================================= */

const ownerAuthorizationMiddleware =
  resolveMiddleware(
    ownerOnlyMiddlewareModule,
    [
      "ownerOnlyMiddleware",
      "requireOwner",
      "ownerOnly",
      "authorizeOwner"
    ]
  );

/**
 * Fail closed during startup instead of allowing Express
 * to receive an object and crash with:
 *
 * Route.get() requires a callback function
 */
if (
  !isFunction(
    authenticationMiddleware
  )
) {
  throw new Error(
    "FINANCIAL_AUTH_MIDDLEWARE_INVALID: authMiddleware must export a function."
  );
}

if (
  !isFunction(
    ownerAuthorizationMiddleware
  )
) {
  throw new Error(
    "FINANCIAL_OWNER_MIDDLEWARE_INVALID: ownerOnlyMiddleware must export a function."
  );
}

/* =========================================================
   OPTIONAL API RATE LIMITER
========================================================= */

let apiLimiter = null;

try {
  const limiterModule =
    require("../middleware/apiLimiter");

  apiLimiter =
    resolveMiddleware(
      limiterModule,
      [
        "apiLimiter",
        "limiter",
        "rateLimiter"
      ]
    );
} catch (error) {
  apiLimiter = null;
}

/* =========================================================
   SECURITY MIDDLEWARE STACK
========================================================= */

const securityMiddleware = [
  authenticationMiddleware,
  ownerAuthorizationMiddleware
];

if (
  isFunction(apiLimiter)
) {
  securityMiddleware.push(
    apiLimiter
  );
}

/* =========================================================
   CONTROLLER WRAPPER
========================================================= */

function controllerHandler(
  handler,
  operationName
) {
  return async function financialRouteHandler(
    req,
    res,
    next
  ) {
    try {
      if (
        !isFunction(handler)
      ) {
        return res.status(500).json({
          success: false,
          status: "error",
          error: {
            code:
              "FINANCIAL_CONTROLLER_OPERATION_UNAVAILABLE",
            message:
              `${operationName || "Financial"} controller operation is unavailable.`
          }
        });
      }

      return await handler(
        req,
        res,
        next
      );
    } catch (error) {
      return next(error);
    }
  };
}

/* =========================================================
   CONTROLLER OPERATIONS
========================================================= */

const assessment =
  controllerHandler(
    resolveController(
      financialController,
      [
        "assessment",
        "runAssessment"
      ]
    ),
    "assessment"
  );

const status =
  controllerHandler(
    resolveController(
      financialController,
      [
        "status",
        "getStatus"
      ]
    ),
    "status"
  );

const costs =
  controllerHandler(
    resolveController(
      financialController,
      [
        "costs",
        "getCosts"
      ]
    ),
    "costs"
  );

const usage =
  controllerHandler(
    resolveController(
      financialController,
      [
        "usage",
        "getUsage"
      ]
    ),
    "usage"
  );

const forecast =
  controllerHandler(
    resolveController(
      financialController,
      [
        "forecast",
        "getForecast"
      ]
    ),
    "forecast"
  );

const emergency =
  controllerHandler(
    resolveController(
      financialController,
      [
        "emergency",
        "getEmergency"
      ]
    ),
    "emergency"
  );

const paymentApproval =
  controllerHandler(
    resolveController(
      financialController,
      [
        "paymentApproval",
        "requestPaymentApproval"
      ]
    ),
    "payment approval"
  );

const prepareAlerts =
  controllerHandler(
    resolveController(
      financialController,
      [
        "prepareAlerts",
        "alerts"
      ]
    ),
    "alert preparation"
  );

const execute =
  controllerHandler(
    resolveController(
      financialController,
      [
        "execute",
        "control"
      ]
    ),
    "execution"
  );

const controllerInfo =
  controllerHandler(
    resolveController(
      financialController,
      [
        "controllerInfo",
        "info"
      ]
    ),
    "controller information"
  );

/* =========================================================
   CONTROLLER INFO
========================================================= */

/**
 * GET /api/financial
 *
 * Reports the financial-control capability.
 *
 * It does NOT claim:
 * - AWS is healthy
 * - OpenAI is healthy
 * - Stripe is healthy
 * - Razorpay is healthy
 * - WhatsApp is healthy
 */
router.get(
  "/",
  ...securityMiddleware,
  controllerInfo
);

/* =========================================================
   FULL ASSESSMENT
========================================================= */

/**
 * GET  /api/financial/assessment
 * POST /api/financial/assessment
 */
router.get(
  "/assessment",
  ...securityMiddleware,
  assessment
);

router.post(
  "/assessment",
  ...securityMiddleware,
  assessment
);

/* =========================================================
   STATUS
========================================================= */

/**
 * GET  /api/financial/status
 * POST /api/financial/status
 */
router.get(
  "/status",
  ...securityMiddleware,
  status
);

router.post(
  "/status",
  ...securityMiddleware,
  status
);

/* =========================================================
   COSTS
========================================================= */

/**
 * GET  /api/financial/costs
 * POST /api/financial/costs
 */
router.get(
  "/costs",
  ...securityMiddleware,
  costs
);

router.post(
  "/costs",
  ...securityMiddleware,
  costs
);

/* =========================================================
   USAGE
========================================================= */

/**
 * GET  /api/financial/usage
 * POST /api/financial/usage
 */
router.get(
  "/usage",
  ...securityMiddleware,
  usage
);

router.post(
  "/usage",
  ...securityMiddleware,
  usage
);

/* =========================================================
   FORECAST
========================================================= */

/**
 * GET  /api/financial/forecast
 * POST /api/financial/forecast
 */
router.get(
  "/forecast",
  ...securityMiddleware,
  forecast
);

router.post(
  "/forecast",
  ...securityMiddleware,
  forecast
);

/* =========================================================
   EMERGENCY / RISK
========================================================= */

/**
 * GET  /api/financial/emergency
 * POST /api/financial/emergency
 */
router.get(
  "/emergency",
  ...securityMiddleware,
  emergency
);

router.post(
  "/emergency",
  ...securityMiddleware,
  emergency
);

/* =========================================================
   PAYMENT APPROVAL
========================================================= */

/**
 * POST /api/financial/payment-approval
 *
 * Approval request ONLY.
 *
 * Does NOT:
 * - charge cards
 * - execute Stripe payments
 * - execute Razorpay payments
 * - accept CVV
 * - accept OTP
 * - accept card numbers
 * - accept banking passwords
 */
router.post(
  "/payment-approval",
  ...securityMiddleware,
  paymentApproval
);

/* =========================================================
   PAYMENT COMPATIBILITY ALIASES
========================================================= */

router.post(
  "/payment",
  ...securityMiddleware,
  paymentApproval
);

router.post(
  "/payments/approval",
  ...securityMiddleware,
  paymentApproval
);

/* =========================================================
   ALERT PREPARATION
========================================================= */

/**
 * POST /api/financial/alerts/prepare
 *
 * Prepares safe owner-alert payloads.
 *
 * Does NOT directly send WhatsApp messages.
 */
router.post(
  "/alerts/prepare",
  ...securityMiddleware,
  prepareAlerts
);

/* =========================================================
   GENERIC EXECUTION
========================================================= */

/**
 * POST /api/financial/execute
 *
 * Generic financial-control operation endpoint.
 *
 * Actual operation validation remains inside the controller
 * and financial control service.
 */
router.post(
  "/execute",
  ...securityMiddleware,
  execute
);

/* =========================================================
   REPORT ALIAS
========================================================= */

/**
 * POST /api/financial/report
 */
router.post(
  "/report",
  ...securityMiddleware,
  execute
);

/* =========================================================
   CONTROL ALIAS
========================================================= */

/**
 * POST /api/financial/control
 */
router.post(
  "/control",
  ...securityMiddleware,
  execute
);

/* =========================================================
   ROUTE ERROR HANDLER
========================================================= */

router.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      res.headersSent
    ) {
      return next(error);
    }

    const code =
      cleanString(
        error?.code,
        200
      ) ||
      "FINANCIAL_ROUTE_ERROR";

    const message =
      cleanString(
        error?.message,
        1000
      ) ||
      "Financial route request failed.";

    return res.status(500).json({
      success: false,
      status: "error",
      error: {
        code,
        message
      }
    });
  }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
