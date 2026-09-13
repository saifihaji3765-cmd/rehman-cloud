"use strict";

/**
 * ZyrionOS Financial Controller
 *
 * HTTP/API boundary for the Financial Control Plane.
 *
 * Responsibilities:
 * - Validate incoming financial-control requests
 * - Resolve the authenticated user ID
 * - Pass only safe request data to financialControlService
 * - Return normalized API responses
 * - Never expose provider secrets
 * - Never execute payments directly
 * - Never invent financial/provider data
 *
 * Owner-only authorization should be enforced by the route/middleware
 * layer before these controller methods are reached.
 */

const financialControlService = require("../services/financial/financialControlService");

const MAX_STRING_LENGTH = 4000;
const MAX_ITEMS = 500;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function cleanString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") {
    return undefined;
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return undefined;
  }

  return cleaned.slice(0, maxLength);
}

function normalizeId(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const cleaned = value.trim();

    if (!cleaned) {
      return undefined;
    }

    return cleaned.slice(0, 200);
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (isObject(value) && value._id !== undefined) {
    return normalizeId(value._id);
  }

  if (
    isObject(value) &&
    typeof value.toString === "function"
  ) {
    const converted = value.toString();

    if (
      converted &&
      converted !== "[object Object]"
    ) {
      return converted.slice(0, 200);
    }
  }

  return undefined;
}

function getAuthenticatedUserId(req) {
  if (!req || !req.user) {
    return undefined;
  }

  return normalizeId(
    req.user._id ||
      req.user.id ||
      req.user.userId ||
      req.user.user_id
  );
}

function getOwnerId(req, body = {}) {
  /*
   * Owner identity must come from authenticated server-side
   * identity whenever possible.
   *
   * A client-supplied ownerId is NOT trusted as authentication.
   */
  return (
    getAuthenticatedUserId(req) ||
    normalizeId(body.ownerId)
  );
}

function asArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_ITEMS);
}

function sanitizePlainObject(value, depth = 0) {
  if (depth > 8) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value.slice
      ? value.slice(0, MAX_STRING_LENGTH)
      : value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ITEMS)
      .map((item) =>
        sanitizePlainObject(item, depth + 1)
      )
      .filter((item) => item !== undefined);
  }

  if (!isObject(value)) {
    return undefined;
  }

  const output = {};

  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = String(key)
      .trim()
      .slice(0, 100);

    if (!normalizedKey) {
      continue;
    }

    /*
     * Never pass credential material into the financial
     * control service from an HTTP request.
     */
    if (isSensitiveKey(normalizedKey)) {
      continue;
    }

    const cleanedValue = sanitizePlainObject(
      rawValue,
      depth + 1
    );

    if (cleanedValue !== undefined) {
      output[normalizedKey] = cleanedValue;
    }
  }

  return output;
}

function isSensitiveKey(key) {
  const normalized = String(key)
    .toLowerCase()
    .replace(/[\s_-]/g, "");

  const sensitiveTerms = [
    "password",
    "passwd",
    "secret",
    "apikey",
    "accesstoken",
    "refreshtoken",
    "authorization",
    "bearer",
    "privatekey",
    "clientsecret",
    "webhooksecret",
    "cvv",
    "cvc",
    "otp",
    "pin",
    "cardnumber",
    "cardno",
    "securitycode",
    "bankaccount",
    "bankaccountnumber",
    "accountnumber"
  ];

  return sensitiveTerms.some((term) =>
    normalized.includes(term)
  );
}

function getRequestBody(req) {
  if (!req || !isObject(req.body)) {
    return {};
  }

  return req.body;
}

function buildBaseInput(req, body = {}) {
  const input = sanitizePlainObject(body) || {};

  const userId = getAuthenticatedUserId(req);
  const ownerId = getOwnerId(req, body);

  /*
   * Server-derived identity takes precedence over anything
   * supplied by the client.
   */
  if (userId) {
    input.userId = userId;
  }

  if (ownerId) {
    input.ownerId = ownerId;
  }

  return input;
}

function normalizeServiceError(result) {
  if (
    result &&
    isObject(result.error)
  ) {
    return {
      code:
        cleanString(result.error.code, 200) ||
        "FINANCIAL_CONTROL_ERROR",
      message:
        cleanString(result.error.message, 1000) ||
        "Financial control operation failed."
    };
  }

  return {
    code: "FINANCIAL_CONTROL_ERROR",
    message: "Financial control operation failed."
  };
}

function sendResult(res, result, fallbackStatus = 200) {
  if (!res || typeof res.status !== "function") {
    return result;
  }

  const success = result?.success === true;

  let statusCode = fallbackStatus;

  if (!success) {
    if (result?.status === "invalid") {
      statusCode = 400;
    } else {
      statusCode = 500;
    }
  }

  return res.status(statusCode).json(result);
}

function sendException(res, error, operation) {
  const code =
    cleanString(error?.code, 200) ||
    "FINANCIAL_CONTROLLER_ERROR";

  const message =
    cleanString(error?.message, 1000) ||
    "Financial control request failed.";

  return res.status(500).json({
    success: false,
    status: "error",
    operation,
    error: {
      code,
      message
    }
  });
}

/**
 * ---------------------------------------------------------
 * FULL FINANCIAL ASSESSMENT
 * ---------------------------------------------------------
 *
 * GET/POST:
 * /api/financial/assessment
 */
async function assessment(req, res) {
  const operation = "assessment";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    input.operation = "assessment";

    const result =
      await financialControlService.runFinancialAssessment(
        input
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * FINANCIAL STATUS
 * ---------------------------------------------------------
 *
 * GET:
 * /api/financial/status
 */
async function status(req, res) {
  const operation = "status";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    input.operation = "status";

    const result =
      await financialControlService.getFinancialStatus(
        input
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * COSTS
 * ---------------------------------------------------------
 *
 * GET/POST:
 * /api/financial/costs
 */
async function costs(req, res) {
  const operation = "costs";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    input.operation = "costs";

    const result =
      await financialControlService.getFinancialCosts(
        input
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------
 *
 * GET/POST:
 * /api/financial/usage
 */
async function usage(req, res) {
  const operation = "usage";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    input.operation = "usage";

    const result =
      await financialControlService.getFinancialUsage(
        input
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * FORECAST
 * ---------------------------------------------------------
 *
 * GET/POST:
 * /api/financial/forecast
 */
async function forecast(req, res) {
  const operation = "forecast";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    input.operation = "forecast";

    const result =
      await financialControlService.getFinancialForecast(
        input
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * EMERGENCY / RISK
 * ---------------------------------------------------------
 *
 * GET/POST:
 * /api/financial/emergency
 */
async function emergency(req, res) {
  const operation = "emergency";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    input.operation = "emergency";

    const result =
      await financialControlService.getFinancialEmergency(
        input
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * PAYMENT APPROVAL
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 * This controller only requests/records approval.
 *
 * It does NOT:
 * - execute a payment
 * - receive card data
 * - receive CVV
 * - receive OTP
 * - receive banking credentials
 */
async function paymentApproval(req, res) {
  const operation = "payment_approval";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    const requestedApproval =
      isObject(body.paymentApproval)
        ? body.paymentApproval
        : isObject(body.payment)
          ? body.payment
          : body;

    const sanitizedApproval =
      sanitizePlainObject(
        requestedApproval
      ) || {};

    /*
     * Re-attach server-derived identity.
     */
    const userId =
      getAuthenticatedUserId(req);

    const ownerId =
      getOwnerId(req, body);

    if (userId) {
      sanitizedApproval.userId = userId;
    }

    if (ownerId) {
      sanitizedApproval.ownerId = ownerId;
    }

    const result =
      await financialControlService.requestPaymentApproval(
        sanitizedApproval
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * PREPARE ALERTS
 * ---------------------------------------------------------
 *
 * This prepares safe alert payloads.
 *
 * It does NOT send WhatsApp messages.
 */
async function prepareAlerts(req, res) {
  const operation = "prepare_alerts";

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(req, body);

    input.operation = "prepare_alerts";

    if (Array.isArray(body.incidents)) {
      input.incidents = asArray(
        body.incidents
      );
    } else {
      input.incidents = [];
    }

    const result =
      await financialControlService.prepareAlerts(
        input
      );

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * GENERIC OPERATION HANDLER
 * ---------------------------------------------------------
 *
 * Useful for routes that expose one endpoint and pass
 * operation in the request.
 */
async function execute(req, res) {
  const operation =
    cleanString(
      getRequestBody(req).operation,
      100
    )?.toLowerCase() || "assessment";

  const allowedOperations = new Set([
    "status",
    "assessment",
    "full",
    "report",
    "cost",
    "costs",
    "usage",
    "forecast",
    "emergency",
    "risk",
    "payment",
    "payment_approval",
    "approve_payment",
    "prepare_alerts",
    "alerts"
  ]);

  if (!allowedOperations.has(operation)) {
    return res.status(400).json({
      success: false,
      status: "invalid",
      operation,
      error: {
        code: "UNSUPPORTED_FINANCIAL_OPERATION",
        message:
          `Unsupported financial operation: ${operation}`
      }
    });
  }

  try {
    const body = getRequestBody(req);

    const input = buildBaseInput(
      req,
      body
    );

    input.operation = operation;

    /*
     * Payment input is explicitly isolated.
     */
    if (
      operation === "payment" ||
      operation === "payment_approval" ||
      operation === "approve_payment"
    ) {
      const requestedApproval =
        isObject(body.paymentApproval)
          ? body.paymentApproval
          : isObject(body.payment)
            ? body.payment
            : body;

      input.paymentApproval =
        sanitizePlainObject(
          requestedApproval
        ) || {};

      const userId =
        getAuthenticatedUserId(req);

      const ownerId =
        getOwnerId(req, body);

      if (userId) {
        input.paymentApproval.userId =
          userId;
      }

      if (ownerId) {
        input.paymentApproval.ownerId =
          ownerId;
      }
    }

    const result =
      await financialControlService(input);

    return sendResult(res, result);
  } catch (error) {
    return sendException(
      res,
      error,
      operation
    );
  }
}

/**
 * ---------------------------------------------------------
 * HEALTH / CAPABILITY INFO
 * ---------------------------------------------------------
 *
 * This intentionally does NOT claim providers are healthy.
 * It only confirms that the controller/service layer is
 * reachable.
 */
function controllerInfo(req, res) {
  return res.status(200).json({
    success: true,
    status: "available",
    service: "financial-control",
    controller: "financialController",
    capabilities: [
      "assessment",
      "status",
      "costs",
      "usage",
      "forecast",
      "emergency",
      "payment_approval",
      "prepare_alerts"
    ],
    paymentExecution:
      "not_executed_by_controller",
    providerData:
      "real_provider_data_only",
    generatedData:
      false
  });
}

module.exports = {
  assessment,
  runAssessment: assessment,

  status,
  getStatus: status,

  costs,
  getCosts: costs,

  usage,
  getUsage: usage,

  forecast,
  getForecast: forecast,

  emergency,
  getEmergency: emergency,

  paymentApproval,
  requestPaymentApproval:
    paymentApproval,

  prepareAlerts,
  prepareFinancialAlerts:
    prepareAlerts,

  execute,

  controllerInfo
};
