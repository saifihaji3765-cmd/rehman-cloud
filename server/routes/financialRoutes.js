"use strict";

/**
 * ZyrionOS Financial Control Routes
 *
 * All financial-control endpoints are owner-only.
 *
 * Security model:
 *   Request
 *      ↓
 *   Authentication
 *      ↓
 *   Owner Authorization
 *      ↓
 *   Rate Limiter (when available)
 *      ↓
 *   Financial Controller
 *      ↓
 *   Financial Control Service
 *
 * IMPORTANT:
 * - No payment execution happens here.
 * - No provider credentials are accepted here.
 * - No fake financial data is generated here.
 * - Financial provider data must come from the real provider layer.
 */

const express = require("express");

const router = express.Router();

const financialController = require("../controllers/financialController");
const authMiddleware = require("../middleware/authMiddleware");
const ownerOnlyMiddleware = require("../middleware/ownerOnlyMiddleware");

/*
 * Optional API limiter.
 *
 * The financial route must still work if the project currently
 * does not expose a financial-specific limiter.
 *
 * We intentionally do not silently import a guessed limiter path.
 */
let apiLimiter = null;

try {
  const limiterModule = require("../middleware/apiLimiter");

  if (typeof limiterModule === "function") {
    apiLimiter = limiterModule;
  } else if (
    limiterModule &&
    typeof limiterModule.apiLimiter === "function"
  ) {
    apiLimiter = limiterModule.apiLimiter;
  }
} catch (error) {
  /*
   * Rate limiting can be attached by the application's existing
   * middleware stack.
   *
   * Authentication and owner authorization remain mandatory.
   */
  apiLimiter = null;
}

/**
 * ---------------------------------------------------------
 * SECURITY MIDDLEWARE
 * ---------------------------------------------------------
 */

const securityMiddleware = [
  authMiddleware,
  ownerOnlyMiddleware
];

if (apiLimiter) {
  securityMiddleware.push(apiLimiter);
}

/**
 * ---------------------------------------------------------
 * CONTROLLER WRAPPERS
 * ---------------------------------------------------------
 *
 * Wrappers keep route registration clean and make sure errors
 * reaching the Express layer are handled consistently.
 */

function controllerHandler(handler) {
  return async function financialRouteHandler(req, res, next) {
    try {
      if (typeof handler !== "function") {
        return res.status(500).json({
          success: false,
          status: "error",
          error: {
            code: "FINANCIAL_CONTROLLER_UNAVAILABLE",
            message:
              "Financial controller operation is unavailable."
          }
        });
      }

      return await handler(req, res, next);
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * ---------------------------------------------------------
 * CONTROLLER REFERENCES
 * ---------------------------------------------------------
 */

const assessment =
  controllerHandler(
    financialController.assessment
  );

const status =
  controllerHandler(
    financialController.status
  );

const costs =
  controllerHandler(
    financialController.costs
  );

const usage =
  controllerHandler(
    financialController.usage
  );

const forecast =
  controllerHandler(
    financialController.forecast
  );

const emergency =
  controllerHandler(
    financialController.emergency
  );

const paymentApproval =
  controllerHandler(
    financialController.paymentApproval
  );

const prepareAlerts =
  controllerHandler(
    financialController.prepareAlerts
  );

const execute =
  controllerHandler(
    financialController.execute
  );

const controllerInfo =
  controllerHandler(
    financialController.controllerInfo
  );

/**
 * ---------------------------------------------------------
 * ROUTE: CONTROLLER INFO
 * ---------------------------------------------------------
 *
 * GET /api/financial
 *
 * This only reports the capability of the controller layer.
 * It does NOT claim that OpenAI/AWS/Stripe/etc. are healthy.
 */
router.get(
  "/",
  ...securityMiddleware,
  controllerInfo
);

/**
 * ---------------------------------------------------------
 * ROUTE: FULL ASSESSMENT
 * ---------------------------------------------------------
 *
 * GET  /api/financial/assessment
 * POST /api/financial/assessment
 *
 * Assessment can combine:
 * - costs
 * - usage
 * - forecast
 * - emergency/risk
 * - alert preparation
 * - optional payment approval request
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

/**
 * ---------------------------------------------------------
 * ROUTE: STATUS
 * ---------------------------------------------------------
 *
 * GET /api/financial/status
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

/**
 * ---------------------------------------------------------
 * ROUTE: COSTS
 * ---------------------------------------------------------
 *
 * GET /api/financial/costs
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

/**
 * ---------------------------------------------------------
 * ROUTE: USAGE
 * ---------------------------------------------------------
 *
 * GET /api/financial/usage
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

/**
 * ---------------------------------------------------------
 * ROUTE: FORECAST
 * ---------------------------------------------------------
 *
 * GET /api/financial/forecast
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

/**
 * ---------------------------------------------------------
 * ROUTE: EMERGENCY / RISK
 * ---------------------------------------------------------
 *
 * GET /api/financial/emergency
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

/**
 * ---------------------------------------------------------
 * ROUTE: PAYMENT APPROVAL
 * ---------------------------------------------------------
 *
 * POST /api/financial/payment-approval
 *
 * IMPORTANT:
 * This is an approval request only.
 *
 * It does NOT:
 * - charge a card
 * - execute a Stripe payment
 * - execute a Razorpay payment
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

/**
 * Compatibility aliases for clients using shorter names.
 */
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

/**
 * ---------------------------------------------------------
 * ROUTE: PREPARE ALERTS
 * ---------------------------------------------------------
 *
 * POST /api/financial/alerts/prepare
 *
 * This prepares safe owner-alert payloads.
 * It does NOT send WhatsApp messages directly.
 */
router.post(
  "/alerts/prepare",
  ...securityMiddleware,
  prepareAlerts
);

/**
 * ---------------------------------------------------------
 * ROUTE: GENERIC EXECUTION
 * ---------------------------------------------------------
 *
 * POST /api/financial/execute
 *
 * Supported operations are validated inside the controller.
 *
 * This endpoint is intentionally owner-only.
 */
router.post(
  "/execute",
  ...securityMiddleware,
  execute
);

/**
 * ---------------------------------------------------------
 * ROUTE: REPORT ALIAS
 * ---------------------------------------------------------
 *
 * POST /api/financial/report
 *
 * Uses the same generic controller operation handler.
 * The request can specify:
 *
 * {
 *   "operation": "assessment"
 * }
 *
 * No automatic payment or infrastructure execution occurs.
 */
router.post(
  "/report",
  ...securityMiddleware,
  execute
);

/**
 * ---------------------------------------------------------
 * ROUTE: FINANCIAL CONTROL ALIAS
 * ---------------------------------------------------------
 *
 * POST /api/financial/control
 */
router.post(
  "/control",
  ...securityMiddleware,
  execute
);

/**
 * ---------------------------------------------------------
 * ROUTE: ERROR HANDLER
 * ---------------------------------------------------------
 *
 * This route-level handler prevents financial errors from
 * leaking stack traces, provider credentials, or internal
 * implementation details.
 */
router.use(
  (error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const code =
      typeof error?.code === "string"
        ? error.code.slice(0, 200)
        : "FINANCIAL_ROUTE_ERROR";

    const message =
      typeof error?.message === "string"
        ? error.message.slice(0, 1000)
        : "Financial route request failed.";

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

/**
 * ---------------------------------------------------------
 * EXPORT
 * ---------------------------------------------------------
 */

module.exports = router;
