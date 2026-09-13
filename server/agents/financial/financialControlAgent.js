/* =========================================================
   ZyrionOS FINANCIAL CONTROL AGENT
   Central Financial Control Orchestrator
   =========================================================

   Responsibilities:

   - Financial assessment
   - Cost monitoring
   - Usage monitoring
   - Forecasting
   - Emergency assessment
   - Payment approval requests
   - Alert preparation
   - Provider status reporting

   IMPORTANT:

   - Real provider data only
   - No fake/mock/demo financial data
   - No hardcoded costs
   - No hardcoded usage
   - No payment execution
   - No infrastructure execution
   - No WhatsApp message execution
   - Payment approval remains a separate controlled step
   - Backend/provider data remains the source of truth

   Architecture:

   Master Agent
        |
        v
   Financial Control Agent
        |
        v
   Financial Control Service
        |
        +-- Cost Monitor
        +-- Usage Monitor
        +-- Forecast
        +-- Emergency
        +-- Payment Approval
        +-- Financial Alerts
        |
        v
   Financial Provider Layer
        |
        +-- OpenAI
        +-- AWS
        +-- Stripe
        +-- Razorpay
        +-- WhatsApp

========================================================= */


/* =========================================================
   SERVICES
========================================================= */

const financialControlService =
  require(
    "../../services/financial/financialControlService"
  );


/* =========================================================
   CONSTANTS
========================================================= */

const MAX_ITEMS =
  500;


/* =========================================================
   SAFE ERROR
========================================================= */

function normalizeError(error) {
  if (!error) {
    return {
      message:
        "Unknown error",

      name:
        "Error",

      code:
        null,

      status:
        null,
    };
  }

  return {
    message:
      error.message ||
      "Unknown error",

    name:
      error.name ||
      "Error",

    code:
      error.code ||
      null,

    status:
      error.status ||
      error.statusCode ||
      null,
  };
}


/* =========================================================
   USER ID
========================================================= */

function getUserId(
  input = {}
) {
  const user =
    input.user || {};

  return (
    input.userId ||
    user.id ||
    user._id ||
    user.userId ||
    user.user_id ||
    null
  );
}


/* =========================================================
   SAFE STRING
========================================================= */

function cleanString(
  value,
  maxLength = 500
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(0, maxLength);
}


/* =========================================================
   ARRAY LIMIT
========================================================= */

function limitArray(
  value
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value.slice(
    0,
    MAX_ITEMS
  );
}


/* =========================================================
   INPUT NORMALIZER
========================================================= */

function normalizeInput(
  input = {}
) {
  if (
    !input ||
    typeof input !==
      "object" ||
    Array.isArray(input)
  ) {
    return {};
  }

  const normalized = {
    ...input,
  };


  /* =========================
     USER
  ========================= */

  const userId =
    getUserId(input);

  if (userId) {
    normalized.userId =
      String(userId);
  }


  /* =========================
     PROMPT
  ========================= */

  if (
    normalized.prompt !==
    undefined
  ) {
    normalized.prompt =
      cleanString(
        normalized.prompt,
        4000
      );
  }


  /* =========================
     PROVIDERS
  ========================= */

  if (
    normalized.providers !==
    undefined
  ) {
    normalized.providers =
      limitArray(
        normalized.providers
      );
  }


  /* =========================
     OBSERVATIONS
  ========================= */

  if (
    normalized.observations !==
    undefined
  ) {
    normalized.observations =
      limitArray(
        normalized.observations
      );
  }


  /* =========================
     FORECAST POINTS
  ========================= */

  if (
    normalized.points !==
    undefined
  ) {
    normalized.points =
      limitArray(
        normalized.points
      );
  }


  return normalized;
}


/* =========================================================
   SERVICE METHOD RESOLVER
========================================================= */

function resolveServiceMethod(
  operation
) {
  const normalizedOperation =
    cleanString(
      operation,
      100
    ).toLowerCase();

  const methods = {
    assessment:
      "runFinancialAssessment",

    assess:
      "runFinancialAssessment",

    run:
      "runFinancialAssessment",

    status:
      "getFinancialStatus",

    costs:
      "getFinancialCosts",

    cost:
      "getFinancialCosts",

    usage:
      "getFinancialUsage",

    forecast:
      "getFinancialForecast",

    emergency:
      "getFinancialEmergency",

    paymentapproval:
      "requestPaymentApproval",

    "payment-approval":
      "requestPaymentApproval",

    "payment_approval":
      "requestPaymentApproval",

    alerts:
      "prepareAlerts",

    "prepare-alerts":
      "prepareAlerts",

    "prepare_alerts":
      "prepareAlerts",
  };

  return (
    methods[
      normalizedOperation
    ] ||
    null
  );
}


/* =========================================================
   SERVICE EXECUTOR
========================================================= */

async function executeService(
  operation,
  input
) {
  const methodName =
    resolveServiceMethod(
      operation
    );


  if (
    !methodName
  ) {
    return {
      success: false,

      message:
        "Unsupported financial control operation",

      error:
        `Unsupported operation: ${operation || "not specified"}`,
    };
  }


  const method =
    financialControlService?.[
      methodName
    ];


  if (
    typeof method !==
    "function"
  ) {
    return {
      success: false,

      message:
        "Financial Control Service method unavailable",

      error:
        `Service method ${methodName} is not available.`,
    };
  }


  return method(
    input
  );
}


/* =========================================================
   FINANCIAL CONTROL AGENT
========================================================= */

async function financialControlAgent(
  input = {}
) {
  const startedAt =
    new Date();


  try {
    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    const normalizedInput =
      normalizeInput(
        input
      );


    const userId =
      getUserId(
        normalizedInput
      );


    if (!userId) {
      return {
        success: false,

        message:
          "Authenticated user ID required",

        error:
          "Financial Control Agent requires a userId.",

        status:
          "invalid_request",
      };
    }


    normalizedInput.userId =
      String(userId);


    /* =====================================================
       OPERATION
    ===================================================== */

    const operation =
      cleanString(
        normalizedInput.operation ||
        normalizedInput.action ||
        "assessment",
        100
      ).toLowerCase();


    /* =====================================================
       SECURITY
    ===================================================== */

    /*
     * Financial Control Agent is an orchestration layer.
     *
     * It does NOT accept or process:
     * - API keys
     * - access tokens
     * - passwords
     * - OTPs
     * - PINs
     * - CVV/CVC
     * - card numbers
     * - JWTs
     *
     * Provider credentials remain inside their
     * provider adapters/services.
     */


    /* =====================================================
       EXECUTE CONTROL SERVICE
    ===================================================== */

    const result =
      await executeService(
        operation,
        normalizedInput
      );


    /* =====================================================
       RESULT VALIDATION
    ===================================================== */

    if (!result) {
      return {
        success: false,

        message:
          "Financial Control Service returned no result",

        error:
          "No result was returned by the financial control service.",

        status:
          "empty_result",
      };
    }


    /* =====================================================
       SAFE RESULT
    ===================================================== */

    return {
      ...result,

      agent:
        "financialControlAgent",

      operation,

      userId:
        String(userId),

      startedAt:
        startedAt.toISOString(),

      completedAt:
        new Date().toISOString(),
    };
  } catch (error) {
    const normalized =
      normalizeError(
        error
      );


    return {
      success: false,

      message:
        "Financial Control Agent failed",

      error:
        normalized.message,

      status:
        "agent_error",

      details: {
        name:
          normalized.name,

        code:
          normalized.code,

        status:
          normalized.status,
      },

      agent:
        "financialControlAgent",

      completedAt:
        new Date().toISOString(),
    };
  }
}


/* =========================================================
   CONVENIENCE METHODS
========================================================= */

financialControlAgent.assess =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "assessment",
    });
  };


financialControlAgent.status =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "status",
    });
  };


financialControlAgent.costs =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "costs",
    });
  };


financialControlAgent.usage =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "usage",
    });
  };


financialControlAgent.forecast =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "forecast",
    });
  };


financialControlAgent.emergency =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "emergency",
    });
  };


financialControlAgent.requestPaymentApproval =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "payment-approval",
    });
  };


financialControlAgent.prepareAlerts =
  async function (
    input = {}
  ) {
    return financialControlAgent({
      ...input,

      operation:
        "alerts",
    });
  };


/* =========================================================
   METADATA
========================================================= */

financialControlAgent.agentName =
  "Financial Control Agent";

financialControlAgent.version =
  "1.0.0";

financialControlAgent.operations = [
  "assessment",
  "status",
  "costs",
  "usage",
  "forecast",
  "emergency",
  "payment-approval",
  "alerts",
];


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  financialControlAgent;
