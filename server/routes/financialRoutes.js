"use strict";

/**
 * =========================================================
 * ZyrionOS FINANCIAL CONTROL ROUTES
 * =========================================================
 *
 * Route architecture:
 *
 *   HTTP Request
 *        ↓
 *   Authentication
 *        ↓
 *   Owner Authorization
 *        ↓
 *   Optional Rate Limiter
 *        ↓
 *   Financial Controller
 *        ↓
 *   Financial Control Service
 *        ↓
 *   Real Provider Adapters
 *
 * IMPORTANT:
 * - No fake financial data.
 * - No provider credentials accepted.
 * - No card/CVV/OTP/password accepted.
 * - No payment execution from routes.
 * - No infrastructure execution from routes.
 * - Owner-only access.
 * - Provider data must come from real provider services.
 *
 * This file is deliberately defensive because Express requires
 * every route callback/middleware to be a function.
 */

const express = require("express");

const router = express.Router();

/* =========================================================
   CONTROLLER MODULE
========================================================= */

const financialControllerModule =
  require("../controllers/financialController");

/* =========================================================
   MIDDLEWARE MODULES
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

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function cleanString(
  value,
  maxLength = 200
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength
  );
}

/* =========================================================
   MODULE FUNCTION RESOLVER
========================================================= */

/**
 * Supports all common CommonJS export shapes:
 *
 * 1. module.exports = middleware
 *
 * 2. module.exports = {
 *      authMiddleware
 *    }
 *
 * 3. module.exports = {
 *      authenticate
 *    }
 *
 * 4. module.exports = {
 *      default: middleware
 *    }
 *
 * This prevents Express from receiving:
 *
 *   [object Object]
 *
 * as a callback.
 */
function resolveFunction(
  moduleValue,
  preferredNames = []
) {
  /*
   * Direct function export.
   */
  if (
    isFunction(moduleValue)
  ) {
    return moduleValue;
  }

  /*
   * ES/CommonJS default export.
   */
  if (
    isObject(moduleValue) &&
    isFunction(
      moduleValue.default
    )
  ) {
    return moduleValue.default;
  }

  /*
   * Named exports.
   */
  for (
    const name of preferredNames
  ) {
    if (
      isObject(moduleValue) &&
      isFunction(
        moduleValue[name]
      )
    ) {
      return moduleValue[name];
    }
  }

  return null;
}

/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

const authenticationMiddleware =
  resolveFunction(
    authMiddlewareModule,
    [
      "authMiddleware",
      "authenticate",
      "requireAuth",
      "authentication",
      "auth"
    ]
  );

/* =========================================================
   OWNER AUTHORIZATION MIDDLEWARE
========================================================= */

const ownerAuthorizationMiddleware =
  resolveFunction(
    ownerOnlyMiddlewareModule,
    [
      "ownerOnlyMiddleware",
      "requireOwner",
      "ownerOnly",
      "authorizeOwner",
      "ownerAuthorization"
    ]
  );

/* =========================================================
   STARTUP VALIDATION
========================================================= */

/**
 * Fail immediately with a clear error instead of allowing
 * Express to produce:
 *
 * Route.get() requires a callback function but got a [object Object]
 */
if (
  !isFunction(
    authenticationMiddleware
  )
) {
  const error =
    new Error(
      "FINANCIAL_AUTH_MIDDLEWARE_INVALID: authMiddleware must export a function."
    );

  error.code =
    "FINANCIAL_AUTH_MIDDLEWARE_INVALID";

  throw error;
}

if (
  !isFunction(
    ownerAuthorizationMiddleware
  )
) {
  const error =
    new Error(
      "FINANCIAL_OWNER_MIDDLEWARE_INVALID: ownerOnlyMiddleware must export a function."
    );

  error.code =
    "FINANCIAL_OWNER_MIDDLEWARE_INVALID";

  throw error;
}

/* =========================================================
   OPTIONAL RATE LIMITER
========================================================= */

let apiLimiter = null;

try {
  const limiterModule =
    require("../middleware/apiLimiter");

  apiLimiter =
    resolveFunction(
      limiterModule,
      [
        "apiLimiter",
        "rateLimiter",
        "limiter",
        "financialLimiter"
      ]
    );
} catch (error) {
  /*
   * The financial API remains protected by:
   *
   * Authentication + Owner Authorization.
   *
   * We do not guess a missing limiter implementation.
   */
  apiLimiter = null;
}

/* =========================================================
   SECURITY STACK
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
   CONTROLLER RESOLVER
========================================================= */

function resolveControllerOperation(
  controller,
  operationNames = []
) {
  /*
   * A controller itself can be callable.
   */
  if (
    isFunction(controller)
  ) {
    return controller;
  }

  /*
   * Named controller method.
   */
  for (
    const name of operationNames
  ) {
    if (
      isObject(controller) &&
      isFunction(
        controller[name]
      )
    ) {
      return controller[name];
    }
  }

  return null;
}

/* =========================================================
   CONTROLLER HANDLER
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
    resolveControllerOperation(
      financialControllerModule,
      [
        "assessment",
        "runAssessment"
      ]
    ),
    "assessment"
  );

const status =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "status",
        "getStatus"
      ]
    ),
    "status"
  );

const costs =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "costs",
        "getCosts"
      ]
    ),
    "costs"
  );

const usage =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "usage",
        "getUsage"
      ]
    ),
    "usage"
  );

const forecast =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "forecast",
        "getForecast"
      ]
    ),
    "forecast"
  );

const emergency =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "emergency",
        "getEmergency"
      ]
    ),
    "emergency"
  );

const paymentApproval =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "paymentApproval",
        "requestPaymentApproval"
      ]
    ),
    "payment approval"
  );

const prepareAlerts =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "prepareAlerts",
        "alerts"
      ]
    ),
    "alert preparation"
  );

const execute =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "execute",
        "control"
      ]
    ),
    "execution"
  );

const controllerInfo =
  controllerHandler(
    resolveControllerOperation(
      financialControllerModule,
      [
        "controllerInfo",
        "info"
      ]
    ),
    "controller information"
  );

/* =========================================================
   ROUTE CALLBACK VALIDATION
========================================================= */

/**
 * Every callback passed to Express is already wrapped by
 * controllerHandler(), which always returns a function.
 *
 * Therefore Express will never receive null/object as the
 * controller callback.
 */
const routeCallbacks = {
  controllerInfo,
  assessment,
  status,
  costs,
  usage,
  forecast,
  emergency,
  paymentApproval,
  prepareAlerts,
  execute
};

for (
  const [
    name,
    callback
  ] of Object.entries(
    routeCallbacks
  )
) {
  if (
    !isFunction(callback)
  ) {
    const error =
      new Error(
        `FINANCIAL_ROUTE_CALLBACK_INVALID: ${name} is not a function.`
      );

    error.code =
      "FINANCIAL_ROUTE_CALLBACK_INVALID";

    throw error;
  }
}

/* =========================================================
   CONTROLLER INFO
========================================================= */

/**
 * GET /api/financial
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
 * This is ONLY an approval request.
 *
 * It does NOT:
 * - charge a card
 * - execute Stripe payment
 * - execute Razorpay payment
 * - accept CVV
 * - accept OTP
 * - accept card number
 * - accept banking password
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
 * Creates safe alert payloads.
 *
 * It does NOT directly send WhatsApp messages.
 */
router.post(
  "/alerts/prepare",
  ...securityMiddleware,
  prepareAlerts
);

/* =========================================================
   GENERIC CONTROL EXECUTION
========================================================= */

/**
 * POST /api/financial/execute
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
  function financialRouteErrorHandler(
    error,
    req,
    res,
    next
  ) {
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
