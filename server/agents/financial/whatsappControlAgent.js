"use strict";

/**
 * ZyrionOS WhatsApp Control Agent
 *
 * Responsibilities:
 * - Owner-only WhatsApp command/control layer.
 * - Parse and validate incoming WhatsApp messages.
 * - Prepare safe responses and control intents.
 * - Handle explicit payment approval/rejection intents.
 * - Prepare emergency/status/report messages.
 *
 * Security:
 * - Never stores or handles card numbers, CVV, OTP, passwords,
 *   access tokens, API keys, private keys, or provider secrets.
 * - Never executes payments directly.
 * - Never executes destructive infrastructure actions directly.
 * - Actual WhatsApp delivery belongs to a dedicated WhatsApp service/adapter.
 * - Owner authorization must be checked against a trusted identity
 *   supplied by the authenticated WhatsApp webhook/service.
 */

const crypto = require("crypto");

const COMMAND = Object.freeze({
  HELP: "help",
  STATUS: "status",
  COST: "cost",
  USAGE: "usage",
  FORECAST: "forecast",
  EMERGENCY: "emergency",
  PAYMENT_STATUS: "payment_status",
  APPROVE_PAYMENT: "approve_payment",
  REJECT_PAYMENT: "reject_payment",
  APPROVE_ACTION: "approve_action",
  REJECT_ACTION: "reject_action",
  REPORT: "report",
  UNKNOWN: "unknown",
});

const CONTROL_STATUS = Object.freeze({
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  UNAUTHORIZED: "unauthorized",
  INVALID: "invalid",
  UNKNOWN: "unknown",
});

const MAX_MESSAGE_LENGTH = 4000;
const MAX_COMMAND_ARGUMENT_LENGTH = 500;

const HELP_TEXT =
  [
    "ZyrionOS Financial Control",
    "",
    "Available commands:",
    "STATUS - financial/infrastructure status",
    "COST - latest verified cost information",
    "USAGE - latest verified usage information",
    "FORECAST - financial forecast",
    "EMERGENCY - active emergency conditions",
    "PAYMENT STATUS - payment status",
    "REPORT - emergency/financial report",
    "APPROVE PAYMENT <approval_id> - approve a pending payment",
    "REJECT PAYMENT <approval_id> - reject a pending payment",
    "APPROVE ACTION <action_id> - approve a pending emergency action",
    "REJECT ACTION <action_id> - reject a pending emergency action",
    "HELP - show this help",
  ].join("\n");

/*
 * These patterns are deliberately conservative.
 * The agent refuses messages containing obvious sensitive
 * credential/payment-secret fields.
 */
const SENSITIVE_PATTERNS = [
  /\b\d{12,19}\b/, // possible card/account number
  /\b(cvv|cvc|cid)\b/i,
  /\botp\b/i,
  /\b(one[-\s]?time[-\s]?password)\b/i,
  /\b(pin)\b/i,
  /\b(password|passwd)\b/i,
  /\b(secret|private\s*key)\b/i,
  /\b(api\s*key|access\s*key|secret\s*key)\b/i,
  /\bauthorization\b/i,
  /\bbearer\s+[a-z0-9._-]+\b/i,
];

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeString(
  value,
  maxLength = MAX_MESSAGE_LENGTH
) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizePhone(value) {
  const normalized =
    normalizeString(value, 100);

  if (!normalized) {
    return null;
  }

  /*
   * WhatsApp provider adapters may supply:
   * +919999999999
   * 919999999999
   * 919999999999@s.whatsapp.net
   */
  const cleaned = normalized
    .replace(
      /@s\.whatsapp\.net$/i,
      ""
    )
    .replace(/[^\d+]/g, "");

  if (!cleaned) {
    return null;
  }

  return cleaned;
}

function normalizeCommand(
  command
) {
  const value =
    normalizeString(command, 100)
      ?.toLowerCase();

  if (!value) {
    return COMMAND.UNKNOWN;
  }

  const aliases = {
    h: COMMAND.HELP,
    help: COMMAND.HELP,

    s: COMMAND.STATUS,
    status: COMMAND.STATUS,

    cost: COMMAND.COST,
    costs: COMMAND.COST,

    usage: COMMAND.USAGE,

    forecast: COMMAND.FORECAST,
    forecasted: COMMAND.FORECAST,

    emergency: COMMAND.EMERGENCY,
    emergencies: COMMAND.EMERGENCY,
    alert: COMMAND.EMERGENCY,
    alerts: COMMAND.EMERGENCY,

    "payment status":
      COMMAND.PAYMENT_STATUS,
    payment_status:
      COMMAND.PAYMENT_STATUS,

    "approve payment":
      COMMAND.APPROVE_PAYMENT,
    approve_payment:
      COMMAND.APPROVE_PAYMENT,

    "reject payment":
      COMMAND.REJECT_PAYMENT,
    reject_payment:
      COMMAND.REJECT_PAYMENT,

    "approve action":
      COMMAND.APPROVE_ACTION,
    approve_action:
      COMMAND.APPROVE_ACTION,

    "reject action":
      COMMAND.REJECT_ACTION,
    reject_action:
      COMMAND.REJECT_ACTION,

    report: COMMAND.REPORT,
  };

  return (
    aliases[value] ||
    COMMAND.UNKNOWN
  );
}

function containsSensitiveContent(
  message
) {
  if (
    typeof message !== "string" ||
    !message.trim()
  ) {
    return false;
  }

  return SENSITIVE_PATTERNS.some(
    (pattern) =>
      pattern.test(message)
  );
}

function sanitizeMessage(
  message
) {
  const normalized =
    normalizeString(
      message
    );

  if (!normalized) {
    return null;
  }

  /*
   * Never forward a message containing obvious credentials
   * or payment secrets to another agent.
   */
  if (
    containsSensitiveContent(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

function normalizeApprovalId(
  value
) {
  const normalized =
    normalizeString(
      value,
      MAX_COMMAND_ARGUMENT_LENGTH
    );

  if (!normalized) {
    return null;
  }

  /*
   * Approval IDs generated by our system are expected to use
   * a restricted character set.
   */
  if (
    !/^pay_[a-z0-9-]+$/i.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

function normalizeActionId(
  value
) {
  const normalized =
    normalizeString(
      value,
      MAX_COMMAND_ARGUMENT_LENGTH
    );

  if (!normalized) {
    return null;
  }

  if (
    !/^fin_act_[a-z0-9-]+$/i.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

function parseCommand(
  message
) {
  const sanitized =
    sanitizeMessage(message);

  if (!sanitized) {
    return {
      valid: false,
      status:
        CONTROL_STATUS.INVALID,
      command:
        COMMAND.UNKNOWN,
      arguments: [],
      message: null,
      reason:
        "Message is empty or contains prohibited sensitive information.",
    };
  }

  const normalized =
    sanitized
      .replace(/^\/+/, "")
      .trim();

  if (!normalized) {
    return {
      valid: false,
      status:
        CONTROL_STATUS.INVALID,
      command:
        COMMAND.UNKNOWN,
      arguments: [],
      message: sanitized,
      reason:
        "Command is empty.",
    };
  }

  const upper =
    normalized.toUpperCase();

  if (upper === "HELP") {
    return {
      valid: true,
      status:
        CONTROL_STATUS.ACCEPTED,
      command:
        COMMAND.HELP,
      arguments: [],
      message: sanitized,
    };
  }

  /*
   * Match multi-word commands first.
   */
  const multiWordCommands = [
    {
      prefix:
        "APPROVE PAYMENT",
      command:
        COMMAND.APPROVE_PAYMENT,
    },
    {
      prefix:
        "REJECT PAYMENT",
      command:
        COMMAND.REJECT_PAYMENT,
    },
    {
      prefix:
        "APPROVE ACTION",
      command:
        COMMAND.APPROVE_ACTION,
    },
    {
      prefix:
        "REJECT ACTION",
      command:
        COMMAND.REJECT_ACTION,
    },
    {
      prefix:
        "PAYMENT STATUS",
      command:
        COMMAND.PAYMENT_STATUS,
    },
  ];

  const upperNormalized =
    upper;

  for (const entry of multiWordCommands) {
    if (
      upperNormalized ===
      entry.prefix
    ) {
      return {
        valid: true,
        status:
          CONTROL_STATUS.ACCEPTED,
        command:
          entry.command,
        arguments: [],
        message: sanitized,
      };
    }

    if (
      upperNormalized.startsWith(
        `${entry.prefix} `
      )
    ) {
      const argumentText =
        normalized
          .slice(
            entry.prefix.length
          )
          .trim();

      const args =
        argumentText
          ? argumentText
              .split(/\s+/)
              .filter(Boolean)
          : [];

      return {
        valid: true,
        status:
          CONTROL_STATUS.ACCEPTED,
        command:
          entry.command,
        arguments: args,
        message: sanitized,
      };
    }
  }

  const parts =
    normalized
      .split(/\s+/)
      .filter(Boolean);

  const command =
    normalizeCommand(
      parts[0]
    );

  return {
    valid:
      command !==
      COMMAND.UNKNOWN,

    status:
      command !==
      COMMAND.UNKNOWN
        ? CONTROL_STATUS.ACCEPTED
        : CONTROL_STATUS.UNKNOWN,

    command,

    arguments:
      parts.slice(1),

    message:
      sanitized,
  };
}

function verifyOwnerIdentity(
  incomingPhone,
  configuredOwnerPhone
) {
  const incoming =
    normalizePhone(
      incomingPhone
    );

  const owner =
    normalizePhone(
      configuredOwnerPhone
    );

  if (!incoming || !owner) {
    return {
      authorized: false,
      reason:
        "Owner identity is unavailable.",
    };
  }

  return {
    authorized:
      incoming === owner,

    reason:
      incoming === owner
        ? "Owner identity verified."
        : "Incoming WhatsApp identity does not match the configured owner.",
  };
}

function createControlRequest({
  ownerId,
  command,
  argumentsList,
  source = "whatsapp",
}) {
  return {
    controlRequestId:
      `wa_${crypto.randomUUID()}`,

    ownerId:
      normalizeString(
        ownerId,
        200
      ),

    source,

    command,

    arguments:
      Array.isArray(
        argumentsList
      )
        ? argumentsList
            .map((item) =>
              normalizeString(
                item,
                MAX_COMMAND_ARGUMENT_LENGTH
              )
            )
            .filter(Boolean)
        : [],

    receivedAt:
      new Date().toISOString(),

    execution: {
      executed: false,
      result: null,
    },
  };
}

function commandToIntent(
  parsed
) {
  switch (
    parsed.command
  ) {
    case COMMAND.HELP:
      return {
        type: "read",
        target: "help",
      };

    case COMMAND.STATUS:
      return {
        type: "read",
        target: "status",
      };

    case COMMAND.COST:
      return {
        type: "read",
        target: "cost",
      };

    case COMMAND.USAGE:
      return {
        type: "read",
        target: "usage",
      };

    case COMMAND.FORECAST:
      return {
        type: "read",
        target: "forecast",
      };

    case COMMAND.EMERGENCY:
      return {
        type: "read",
        target: "emergency",
      };

    case COMMAND.PAYMENT_STATUS:
      return {
        type: "read",
        target: "payment_status",
      };

    case COMMAND.REPORT:
      return {
        type: "read",
        target: "report",
      };

    case COMMAND.APPROVE_PAYMENT:
      return {
        type: "approval",
        target: "payment",
        action: "approve",
        approvalId:
          normalizeApprovalId(
            parsed.arguments[0]
          ),
      };

    case COMMAND.REJECT_PAYMENT:
      return {
        type: "approval",
        target: "payment",
        action: "reject",
        approvalId:
          normalizeApprovalId(
            parsed.arguments[0]
          ),
      };

    case COMMAND.APPROVE_ACTION:
      return {
        type: "approval",
        target: "emergency_action",
        action: "approve",
        actionId:
          normalizeActionId(
            parsed.arguments[0]
          ),
      };

    case COMMAND.REJECT_ACTION:
      return {
        type: "approval",
        target: "emergency_action",
        action: "reject",
        actionId:
          normalizeActionId(
            parsed.arguments[0]
          ),
      };

    default:
      return {
        type: "unknown",
        target: null,
      };
  }
}

function validateIntent(
  intent
) {
  if (!isObject(intent)) {
    return {
      valid: false,
      reason:
        "Control intent is invalid.",
    };
  }

  if (
    intent.type ===
      "approval" &&
    intent.target ===
      "payment"
  ) {
    if (!intent.approvalId) {
      return {
        valid: false,
        reason:
          "A valid payment approval ID is required.",
      };
    }
  }

  if (
    intent.type ===
      "approval" &&
    intent.target ===
      "emergency_action"
  ) {
    if (!intent.actionId) {
      return {
        valid: false,
        reason:
          "A valid emergency action ID is required.",
      };
    }
  }

  return {
    valid: true,
  };
}

function buildResponse(
  message,
  options = {}
) {
  const safeMessage =
    normalizeString(
      message,
      3500
    );

  if (!safeMessage) {
    return null;
  }

  return {
    responseId:
      `wa_resp_${crypto.randomUUID()}`,

    channel: "whatsapp",

    message:
      safeMessage,

    priority:
      options.priority ||
      "normal",

    createdAt:
      new Date().toISOString(),

    delivery: {
      sent: false,
      sentAt: null,
      providerMessageId: null,
    },
  };
}

function buildHelpResponse() {
  return buildResponse(
    HELP_TEXT
  );
}

function buildUnauthorizedResponse() {
  return buildResponse(
    "Access denied. This WhatsApp control channel is restricted to the authorized owner."
  );
}

function buildInvalidCommandResponse() {
  return buildResponse(
    [
      "I could not safely understand that command.",
      "",
      "Send HELP to see available commands.",
    ].join("\n")
  );
}

function buildSensitiveDataResponse() {
  return buildResponse(
    [
      "I cannot process payment credentials, OTPs, passwords, API keys, or similar secrets through WhatsApp.",
      "",
      "Use the secure provider flow instead.",
    ].join("\n")
  );
}

/**
 * Build a status response from REAL data.
 *
 * The function intentionally does not create values when data is missing.
 */
function buildStatusResponse(
  statusData = {}
) {
  if (!isObject(statusData)) {
    return buildResponse(
      "Financial status is currently unavailable."
    );
  }

  const lines = [
    "ZyrionOS Financial Status",
    "",
  ];

  const status =
    normalizeString(
      statusData.status,
      100
    );

  if (status) {
    lines.push(
      `Status: ${status}`
    );
  } else {
    lines.push(
      "Status: unavailable"
    );
  }

  if (
    statusData.emergencyLevel
  ) {
    lines.push(
      `Emergency: ${normalizeString(
        statusData.emergencyLevel,
        100
      )}`
    );
  }

  if (
    statusData.incidentCount !==
    undefined
  ) {
    const count =
      Number(
        statusData.incidentCount
      );

    if (
      Number.isFinite(count) &&
      count >= 0
    ) {
      lines.push(
        `Active incidents: ${count}`
      );
    }
  }

  if (
    statusData.dataRetrievedAt
  ) {
    lines.push(
      `Data retrieved: ${normalizeString(
        statusData.dataRetrievedAt,
        100
      )}`
    );
  }

  lines.push(
    "",
    "Only verified provider data is displayed."
  );

  return buildResponse(
    lines.join("\n")
  );
}

/**
 * Build a cost response only from supplied REAL data.
 */
function buildCostResponse(
  costData = {}
) {
  if (!isObject(costData)) {
    return buildResponse(
      "Verified cost data is currently unavailable."
    );
  }

  const lines = [
    "ZyrionOS Cost Report",
    "",
  ];

  if (
    Array.isArray(
      costData.providers
    ) &&
    costData.providers.length
  ) {
    for (const provider of costData.providers) {
      if (!isObject(provider)) {
        continue;
      }

      const name =
        normalizeProvider(
          provider.provider
        );

      const value =
        Number(
          provider.cost
        );

      if (
        !name ||
        !Number.isFinite(value)
      ) {
        continue;
      }

      const currency =
        normalizeString(
          provider.currency,
          10
        )?.toUpperCase();

      lines.push(
        `${name}: ${value}${
          currency
            ? ` ${currency}`
            : ""
        }`
      );
    }
  }

  if (
    lines.length === 2
  ) {
    lines.push(
      "Verified cost data is unavailable."
    );
  }

  if (
    costData.period
  ) {
    lines.push(
      "",
      `Period: ${normalizeString(
        costData.period,
        200
      )}`
    );
  }

  if (
    costData.retrievedAt
  ) {
    lines.push(
      `Retrieved: ${normalizeString(
        costData.retrievedAt,
        100
      )}`
    );
  }

  lines.push(
    "",
    "Source: provider data only."
  );

  return buildResponse(
    lines.join("\n")
  );
}

/**
 * Build usage response from REAL provider data.
 */
function buildUsageResponse(
  usageData = {}
) {
  if (!isObject(usageData)) {
    return buildResponse(
      "Verified usage data is currently unavailable."
    );
  }

  const lines = [
    "ZyrionOS Usage Report",
    "",
  ];

  if (
    Array.isArray(
      usageData.providers
    ) &&
    usageData.providers.length
  ) {
    for (const provider of usageData.providers) {
      if (!isObject(provider)) {
        continue;
      }

      const name =
        normalizeProvider(
          provider.provider
        );

      const value =
        Number(
          provider.usage
        );

      if (
        !name ||
        !Number.isFinite(value)
      ) {
        continue;
      }

      const unit =
        normalizeString(
          provider.unit,
          50
        );

      lines.push(
        `${name}: ${value}${
          unit
            ? ` ${unit}`
            : ""
        }`
      );
    }
  }

  if (
    lines.length === 2
  ) {
    lines.push(
      "Verified usage data is unavailable."
    );
  }

  if (
    usageData.retrievedAt
  ) {
    lines.push(
      "",
      `Retrieved: ${normalizeString(
        usageData.retrievedAt,
        100
      )}`
    );
  }

  return buildResponse(
    lines.join("\n")
  );
}

/**
 * Build forecast response from REAL forecast-agent output.
 */
function buildForecastResponse(
  forecastData = {}
) {
  if (!isObject(forecastData)) {
    return buildResponse(
      "Verified forecast data is currently unavailable."
    );
  }

  const lines = [
    "ZyrionOS Financial Forecast",
    "",
  ];

  const status =
    normalizeString(
      forecastData.status,
      100
    );

  if (status) {
    lines.push(
      `Forecast status: ${status}`
    );
  }

  if (
    forecastData.forecast
  ) {
    const forecast =
      forecastData.forecast;

    if (
      Number.isFinite(
        Number(
          forecast.projectedValue
        )
      )
    ) {
      lines.push(
        `Projected value: ${forecast.projectedValue}`
      );
    }

    if (
      Number.isFinite(
        Number(
          forecast.burnRatePerDay
        )
      )
    ) {
      lines.push(
        `Daily burn rate: ${forecast.burnRatePerDay}`
      );
    }

    if (
      forecast.horizonDays
    ) {
      lines.push(
        `Horizon: ${forecast.horizonDays} days`
      );
    }
  } else {
    lines.push(
      "A reliable forecast is not currently available."
    );
  }

  lines.push(
    "",
    "Forecasts are estimates based on verified historical observations."
  );

  return buildResponse(
    lines.join("\n")
  );
}

/**
 * Build emergency response from REAL Emergency Agent output.
 */
function buildEmergencyResponse(
  emergencyData = {}
) {
  if (!isObject(emergencyData)) {
    return buildResponse(
      "Emergency data is currently unavailable."
    );
  }

  const level =
    normalizeString(
      emergencyData.emergencyLevel,
      100
    );

  const incidents =
    Array.isArray(
      emergencyData.incidents
    )
      ? emergencyData.incidents
      : [];

  const lines = [
    "ZyrionOS Emergency Report",
    "",
    `Emergency level: ${
      level || "unavailable"
    }`,
    `Incidents: ${incidents.length}`,
    "",
  ];

  for (
    const incident of incidents.slice(
      0,
      10
    )
  ) {
    if (!isObject(incident)) {
      continue;
    }

    const severity =
      normalizeString(
        incident.severity,
        50
      );

    const title =
      normalizeString(
        incident.title,
        300
      );

    if (title) {
      lines.push(
        `- [${
          severity || "unknown"
        }] ${title}`
      );
    }
  }

  if (!incidents.length) {
    lines.push(
      "No verified active emergency condition was supplied."
    );
  }

  lines.push(
    "",
    "High-risk actions require owner approval."
  );

  return buildResponse(
    lines.join("\n"),
    {
      priority:
        level === "critical"
          ? "urgent"
          : level === "high"
          ? "high"
          : "normal",
    }
  );
}

/**
 * Build payment status response.
 */
function buildPaymentStatusResponse(
  paymentData = {}
) {
  if (!isObject(paymentData)) {
    return buildResponse(
      "Verified payment status is currently unavailable."
    );
  }

  const lines = [
    "ZyrionOS Payment Status",
    "",
  ];

  if (
    paymentData.status
  ) {
    lines.push(
      `Status: ${normalizeString(
        paymentData.status,
        100
      )}`
    );
  } else {
    lines.push(
      "Status: unavailable"
    );
  }

  if (
    paymentData.provider
  ) {
    lines.push(
      `Provider: ${normalizeString(
        paymentData.provider,
        100
      )}`
    );
  }

  if (
    paymentData.approvalId
  ) {
    lines.push(
      `Approval: ${normalizeString(
        paymentData.approvalId,
        200
      )}`
    );
  }

  lines.push(
    "",
    "Payment success is reported only from real provider confirmation."
  );

  return buildResponse(
    lines.join("\n")
  );
}

function buildGenericReportResponse(
  reportData = {}
) {
  if (!isObject(reportData)) {
    return buildResponse(
      "Financial report data is currently unavailable."
    );
  }

  const lines = [
    "ZyrionOS Financial Control Report",
    "",
  ];

  if (
    reportData.emergencyLevel
  ) {
    lines.push(
      `Emergency: ${normalizeString(
        reportData.emergencyLevel,
        100
      )}`
    );
  }

  if (
    reportData.costStatus
  ) {
    lines.push(
      `Cost: ${normalizeString(
        reportData.costStatus,
        200
      )}`
    );
  }

  if (
    reportData.usageStatus
  ) {
    lines.push(
      `Usage: ${normalizeString(
        reportData.usageStatus,
        200
      )}`
    );
  }

  if (
    reportData.forecastStatus
  ) {
    lines.push(
      `Forecast: ${normalizeString(
        reportData.forecastStatus,
        200
      )}`
    );
  }

  if (
    reportData.paymentStatus
  ) {
    lines.push(
      `Payment: ${normalizeString(
        reportData.paymentStatus,
        200
      )}`
    );
  }

  lines.push(
    "",
    "Report contains only supplied verified information."
  );

  return buildResponse(
    lines.join("\n")
  );
}

/**
 * Main WhatsApp control agent.
 *
 * Expected input:
 *
 * {
 *   ownerId: "...",
 *   incomingPhone: "+91...",
 *   configuredOwnerPhone: "+91...",
 *   message: "STATUS"
 * }
 *
 * The trusted webhook/controller should supply the verified
 * sender identity. Do not trust a phone number typed inside
 * the WhatsApp message itself.
 */
async function whatsappControlAgent(
  input = {}
) {
  try {
    if (!isObject(input)) {
      return {
        success: false,
        status:
          CONTROL_STATUS.INVALID,
        message:
          "WhatsApp control input must be an object.",
        data: null,
      };
    }

    const message =
      normalizeString(
        input.message
      );

    if (!message) {
      return {
        success: false,
        status:
          CONTROL_STATUS.INVALID,
        message:
          "WhatsApp message is required.",
        data: null,
      };
    }

    if (
      containsSensitiveContent(
        message
      )
    ) {
      return {
        success: false,
        status:
          CONTROL_STATUS.REJECTED,
        message:
          "Sensitive credentials and payment secrets are not accepted through WhatsApp control.",
        data: {
          response:
            buildSensitiveDataResponse(),
        },
      };
    }

    /*
     * Owner verification happens before command acceptance.
     */
    const ownerVerification =
      verifyOwnerIdentity(
        input.incomingPhone,
        input.configuredOwnerPhone
      );

    if (
      !ownerVerification.authorized
    ) {
      return {
        success: false,
        status:
          CONTROL_STATUS.UNAUTHORIZED,
        message:
          ownerVerification.reason,
        data: {
          response:
            buildUnauthorizedResponse(),
        },
      };
    }

    const parsed =
      parseCommand(
        message
      );

    if (!parsed.valid) {
      return {
        success: false,
        status:
          parsed.status ||
          CONTROL_STATUS.INVALID,
        message:
          parsed.reason ||
          "Invalid WhatsApp command.",
        data: {
          response:
            containsSensitiveContent(
              message
            )
              ? buildSensitiveDataResponse()
              : buildInvalidCommandResponse(),
        },
      };
    }

    const intent =
      commandToIntent(
        parsed
      );

    const intentValidation =
      validateIntent(
        intent
      );

    if (!intentValidation.valid) {
      return {
        success: false,
        status:
          CONTROL_STATUS.INVALID,
        message:
          intentValidation.reason,
        data: {
          response:
            buildInvalidCommandResponse(),
        },
      };
    }

    const controlRequest =
      createControlRequest({
        ownerId:
          input.ownerId,
        command:
          parsed.command,
        argumentsList:
          parsed.arguments,
      });

    /*
     * HELP can be completed immediately because it contains
     * no provider-sensitive information.
     */
    if (
      parsed.command ===
      COMMAND.HELP
    ) {
      return {
        success: true,
        status:
          CONTROL_STATUS.ACCEPTED,
        message:
          "WhatsApp help request accepted.",
        data: {
          controlRequest,
          intent,
          response:
            buildHelpResponse(),
        },
      };
    }

    /*
     * Approval commands must never be treated as direct
     * payment/infrastructure execution.
     */
    if (
      intent.type ===
      "approval"
    ) {
      return {
        success: true,
        status:
          CONTROL_STATUS.ACCEPTED,
        message:
          "Owner approval command accepted for secure authorization processing.",
        data: {
          controlRequest,

          intent,

          security: {
            ownerVerified: true,
            paymentExecuted: false,
            infrastructureActionExecuted:
              false,
            providerSecretsAccepted:
              false,
            nextStep:
              "Pass the approval intent to the corresponding approval service after loading and validating the persisted request.",
          },
        },
      };
    }

    /*
     * Read-only commands become control intents.
     * The controller/orchestrator will obtain the actual data
     * from financial agents/services.
     */
    return {
      success: true,
      status:
        CONTROL_STATUS.ACCEPTED,
      message:
        "WhatsApp control command accepted.",
      data: {
        controlRequest,

        intent,

        security: {
          ownerVerified: true,
          readOnly:
            intent.type ===
            "read",
          paymentExecuted:
            false,
          infrastructureActionExecuted:
            false,
          providerSecretsAccepted:
            false,
        },
      },
    };
  } catch (error) {
    console.error(
      "[WhatsAppControlAgent] Error:",
      error.message
    );

    return {
      success: false,
      status:
        CONTROL_STATUS.INVALID,
      message:
        "WhatsApp control agent failed.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

/**
 * Build the correct response for a resolved control intent.
 *
 * This is deliberately separate from command parsing so that
 * real provider/agent data can be injected later.
 */
function buildIntentResponse(
  intent,
  data = {}
) {
  if (!isObject(intent)) {
    return buildInvalidCommandResponse();
  }

  switch (
    intent.target
  ) {
    case "help":
      return buildHelpResponse();

    case "status":
      return buildStatusResponse(
        data
      );

    case "cost":
      return buildCostResponse(
        data
      );

    case "usage":
      return buildUsageResponse(
        data
      );

    case "forecast":
      return buildForecastResponse(
        data
      );

    case "emergency":
      return buildEmergencyResponse(
        data
      );

    case "payment_status":
      return buildPaymentStatusResponse(
        data
      );

    case "report":
      return buildGenericReportResponse(
        data
      );

    default:
      return buildInvalidCommandResponse();
  }
}

whatsappControlAgent.COMMAND =
  COMMAND;

whatsappControlAgent.CONTROL_STATUS =
  CONTROL_STATUS;

whatsappControlAgent.parseCommand =
  parseCommand;

whatsappControlAgent.verifyOwnerIdentity =
  verifyOwnerIdentity;

whatsappControlAgent.containsSensitiveContent =
  containsSensitiveContent;

whatsappControlAgent.commandToIntent =
  commandToIntent;

whatsappControlAgent.validateIntent =
  validateIntent;

whatsappControlAgent.buildResponse =
  buildResponse;

whatsappControlAgent.buildIntentResponse =
  buildIntentResponse;

whatsappControlAgent.buildStatusResponse =
  buildStatusResponse;

whatsappControlAgent.buildCostResponse =
  buildCostResponse;

whatsappControlAgent.buildUsageResponse =
  buildUsageResponse;

whatsappControlAgent.buildForecastResponse =
  buildForecastResponse;

whatsappControlAgent.buildEmergencyResponse =
  buildEmergencyResponse;

whatsappControlAgent.buildPaymentStatusResponse =
  buildPaymentStatusResponse;

module.exports =
  whatsappControlAgent;
