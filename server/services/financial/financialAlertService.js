"use strict";

/**
 * ZyrionOS Financial Alert Service
 *
 * Responsibilities:
 * - Convert verified financial/emergency incidents into alert records.
 * - Deduplicate repeated alerts.
 * - Apply cooldown rules.
 * - Prepare owner notification payloads.
 * - Keep alert state separate from actual WhatsApp delivery.
 *
 * IMPORTANT:
 * - No fake financial values.
 * - No fake delivery confirmation.
 * - No card/CVV/OTP/password/API-key data.
 * - This service does NOT send WhatsApp messages directly.
 * - This service does NOT execute payments or infrastructure actions.
 */

const crypto = require("crypto");

const SEVERITY = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  HIGH: "high",
  CRITICAL: "critical",
});

const ALERT_STATUS = Object.freeze({
  PENDING: "pending",
  READY: "ready",
  SENT: "sent",
  FAILED: "failed",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED: "resolved",
  SUPPRESSED: "suppressed",
  EXPIRED: "expired",
});

const CHANNEL = Object.freeze({
  WHATSAPP: "whatsapp",
  INTERNAL: "internal",
});

const DEFAULT_COOLDOWN_MINUTES = Object.freeze({
  info: 60,
  warning: 30,
  high: 15,
  critical: 5,
});

const MAX_MESSAGE_LENGTH = 3500;
const MAX_ALERTS_PER_BATCH = 500;

const SENSITIVE_KEY_PATTERN =
  /(card|cardnumber|card_number|cvv|cvc|cid|otp|pin|password|passwd|secret|private.?key|api.?key|access.?key|token|authorization)/i;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeString(
  value,
  maxLength = 500
) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

function normalizeProvider(
  provider
) {
  const value =
    normalizeString(
      provider,
      100
    );

  return value
    ? value.toLowerCase()
    : null;
}

function normalizeSeverity(
  severity
) {
  const value =
    normalizeString(
      severity,
      50
    )?.toLowerCase();

  if (
    Object.values(
      SEVERITY
    ).includes(value)
  ) {
    return value;
  }

  return null;
}

function severityRank(
  severity
) {
  switch (severity) {
    case SEVERITY.CRITICAL:
      return 4;

    case SEVERITY.HIGH:
      return 3;

    case SEVERITY.WARNING:
      return 2;

    case SEVERITY.INFO:
      return 1;

    default:
      return 0;
  }
}

function normalizeDate(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function normalizeNumber(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function createAlertId() {
  return `fin_alert_${crypto.randomUUID()}`;
}

function createDeduplicationKey(
  alert
) {
  const incident =
    alert.incident || {};

  return [
    incident.type || "",
    alert.provider || "",
    incident.serviceName ||
      incident.evidence
        ?.serviceName ||
      "",
    incident.deploymentId ||
      incident.evidence
        ?.deploymentId ||
      "",
  ]
    .join("|")
    .toLowerCase();
}

function containsSensitiveKey(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  if (
    Array.isArray(value)
  ) {
    return value.some(
      containsSensitiveKey
    );
  }

  if (
    isObject(value)
  ) {
    for (
      const [
        key,
        child,
      ] of Object.entries(
        value
      )
    ) {
      if (
        SENSITIVE_KEY_PATTERN.test(
          key
        )
      ) {
        return true;
      }

      if (
        containsSensitiveKey(
          child
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function sanitizeObject(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        sanitizeObject
      )
      .filter(
        (item) =>
          item !== undefined
      );
  }

  if (
    !isObject(value)
  ) {
    return undefined;
  }

  const result = {};

  for (
    const [
      key,
      child,
    ] of Object.entries(
      value
    )
  ) {
    if (
      SENSITIVE_KEY_PATTERN.test(
        key
      )
    ) {
      continue;
    }

    const sanitized =
      sanitizeObject(
        child
      );

    if (
      sanitized !==
      undefined
    ) {
      result[key] =
        sanitized;
    }
  }

  return result;
}

function normalizeCooldownMinutes(
  severity,
  customCooldown
) {
  const custom =
    normalizeNumber(
      customCooldown
    );

  if (
    custom !== null &&
    custom >= 0
  ) {
    return Math.min(
      Math.floor(custom),
      24 * 60
    );
  }

  return (
    DEFAULT_COOLDOWN_MINUTES[
      severity
    ] ??
    DEFAULT_COOLDOWN_MINUTES.info
  );
}

function getPriority(
  severity
) {
  switch (severity) {
    case SEVERITY.CRITICAL:
      return "urgent";

    case SEVERITY.HIGH:
      return "high";

    case SEVERITY.WARNING:
      return "normal";

    default:
      return "low";
  }
}

function buildAlertMessage(
  incident
) {
  if (!isObject(incident)) {
    return null;
  }

  const severity =
    normalizeSeverity(
      incident.severity
    );

  const title =
    normalizeString(
      incident.title,
      300
    );

  const message =
    normalizeString(
      incident.message,
      1500
    );

  const provider =
    normalizeProvider(
      incident.provider
    );

  const lines = [];

  if (severity) {
    lines.push(
      `[${severity.toUpperCase()}]`
    );
  }

  if (title) {
    lines.push(
      title
    );
  }

  if (provider) {
    lines.push(
      `Provider: ${provider}`
    );
  }

  if (message) {
    lines.push(
      message
    );
  }

  lines.push(
    "",
    "ZyrionOS Financial Control"
  );

  return lines
    .join("\n")
    .slice(
      0,
      MAX_MESSAGE_LENGTH
    );
}

function validateIncident(
  incident
) {
  if (
    !isObject(incident)
  ) {
    return {
      valid: false,
      reason:
        "Incident must be an object.",
    };
  }

  if (
    containsSensitiveKey(
      incident
    )
  ) {
    return {
      valid: false,
      reason:
        "Incident contains prohibited sensitive information.",
    };
  }

  const severity =
    normalizeSeverity(
      incident.severity
    );

  if (!severity) {
    return {
      valid: false,
      reason:
        "Incident severity is required.",
    };
  }

  const type =
    normalizeString(
      incident.type,
      100
    );

  if (!type) {
    return {
      valid: false,
      reason:
        "Incident type is required.",
    };
  }

  const message =
    buildAlertMessage(
      incident
    );

  if (!message) {
    return {
      valid: false,
      reason:
        "Incident does not contain enough information to build an alert.",
    };
  }

  return {
    valid: true,
    severity,
    type,
    message,
  };
}

function buildAlert(
  incident,
  options = {}
) {
  const validation =
    validateIncident(
      incident
    );

  if (!validation.valid) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        validation.reason,
      data: null,
    };
  }

  const severity =
    validation.severity;

  const createdAt =
    new Date();

  const cooldownMinutes =
    normalizeCooldownMinutes(
      severity,
      options.cooldownMinutes
    );

  const cooldownUntil =
    new Date(
      createdAt.getTime() +
        cooldownMinutes *
          60 *
          1000
    );

  const sanitizedIncident =
    sanitizeObject(
      incident
    );

  const alert = {
    alertId:
      createAlertId(),

    deduplicationKey:
      createDeduplicationKey(
        {
          incident:
            sanitizedIncident,
          provider:
            sanitizedIncident
              ?.provider,
        }
      ),

    severity,

    priority:
      getPriority(
        severity
      ),

    type:
      validation.type,

    provider:
      normalizeProvider(
        incident.provider
      ),

    title:
      normalizeString(
        incident.title,
        300
      ),

    message:
      validation.message,

    incident:
      sanitizedIncident,

    status:
      ALERT_STATUS.READY,

    channels: [
      CHANNEL.WHATSAPP,
    ],

    createdAt:
      createdAt.toISOString(),

    cooldown: {
      minutes:
        cooldownMinutes,

      until:
        cooldownUntil.toISOString(),

      suppressed:
        false,
    },

    delivery: {
      whatsapp: {
        status:
          "not_sent",
        sentAt: null,
        providerMessageId:
          null,
        error: null,
      },
    },

    acknowledgement: {
      acknowledged: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
    },

    resolution: {
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
    },

    execution: {
      sent: false,
      performedBy:
        "financialAlertService",
    },
  };

  return {
    success: true,
    status:
      ALERT_STATUS.READY,
    message:
      "Financial alert prepared.",
    data: {
      alert,
    },
  };
}

function isWithinCooldown(
  alert,
  now = new Date()
) {
  if (
    !isObject(alert)
  ) {
    return false;
  }

  const cooldownUntil =
    normalizeDate(
      alert.cooldown
        ?.until
    );

  if (!cooldownUntil) {
    return false;
  }

  return (
    now.getTime() <
    cooldownUntil.getTime()
  );
}

function shouldSuppressDuplicate(
  alert,
  previousAlert,
  now = new Date()
) {
  if (
    !alert ||
    !previousAlert
  ) {
    return false;
  }

  if (
    alert.deduplicationKey !==
    previousAlert.deduplicationKey
  ) {
    return false;
  }

  /*
   * A new CRITICAL alert should not be silently
   * suppressed by an older lower-severity alert.
   */
  if (
    severityRank(
      alert.severity
    ) >
    severityRank(
      previousAlert.severity
    )
  ) {
    return false;
  }

  return isWithinCooldown(
    previousAlert,
    now
  );
}

function suppressAlert(
  alert,
  reason
) {
  if (
    !isObject(alert)
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Alert is invalid.",
      data: null,
    };
  }

  return {
    success: true,
    status:
      ALERT_STATUS.SUPPRESSED,
    message:
      "Duplicate alert suppressed.",
    data: {
      alertId:
        alert.alertId ||
        null,

      status:
        ALERT_STATUS.SUPPRESSED,

      reason:
        normalizeString(
          reason,
          500
        ) ||
        "Alert is within cooldown period.",

      suppressedAt:
        new Date().toISOString(),
    },
  };
}

function buildWhatsAppPayload(
  alert,
  ownerPhone
) {
  if (
    !isObject(alert)
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Alert is invalid.",
      data: null,
    };
  }

  const phone =
    normalizeString(
      ownerPhone,
      100
    );

  if (!phone) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Owner WhatsApp destination is required.",
      data: null,
    };
  }

  const message =
    normalizeString(
      alert.message,
      MAX_MESSAGE_LENGTH
    );

  if (!message) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Alert message is empty.",
      data: null,
    };
  }

  return {
    success: true,
    status:
      ALERT_STATUS.READY,
    message:
      "WhatsApp alert payload prepared.",
    data: {
      channel:
        CHANNEL.WHATSAPP,

      to:
        phone,

      type:
        "text",

      text: {
        body:
          message,
      },

      alertId:
        alert.alertId,

      priority:
        alert.priority,

      metadata: {
        severity:
          alert.severity,

        type:
          alert.type,

        provider:
          alert.provider,

        createdAt:
          alert.createdAt,
      },

      delivery: {
        sent: false,
        sentAt: null,
        providerMessageId:
          null,
      },
    },
  };
}

function markWhatsAppSent(
  alert,
  providerMessageId,
  sentAt
) {
  if (
    !isObject(alert)
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Alert is invalid.",
      data: null,
    };
  }

  const messageId =
    normalizeString(
      providerMessageId,
      300
    );

  /*
   * A real provider message ID is required before
   * marking the message as sent.
   */
  if (!messageId) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "A real WhatsApp provider message ID is required.",
      data: null,
    };
  }

  const actualSentAt =
    normalizeDate(
      sentAt
    ) || new Date();

  return {
    success: true,
    status:
      ALERT_STATUS.SENT,
    message:
      "WhatsApp delivery result recorded.",
    data: {
      alertId:
        alert.alertId,

      delivery: {
        status:
          ALERT_STATUS.SENT,

        sentAt:
          actualSentAt.toISOString(),

        providerMessageId:
          messageId,
      },
    },
  };
}

function markWhatsAppFailed(
  alert,
  errorMessage
) {
  if (
    !isObject(alert)
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Alert is invalid.",
      data: null,
    };
  }

  return {
    success: true,
    status:
      ALERT_STATUS.FAILED,
    message:
      "WhatsApp delivery failure recorded.",
    data: {
      alertId:
        alert.alertId,

      delivery: {
        status:
          ALERT_STATUS.FAILED,

        sentAt: null,

        providerMessageId:
          null,

        error:
          normalizeString(
            errorMessage,
            1000
          ) ||
          "WhatsApp provider delivery failed.",
      },
    },
  };
}

function acknowledgeAlert(
  alert,
  ownerId
) {
  if (
    !isObject(alert)
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Alert is invalid.",
      data: null,
    };
  }

  const normalizedOwner =
    normalizeString(
      ownerId,
      200
    );

  if (!normalizedOwner) {
    return {
      success: false,
      status:
        "unauthorized",
      message:
        "Owner identity is required.",
      data: null,
    };
  }

  return {
    success: true,
    status:
      ALERT_STATUS.ACKNOWLEDGED,
    message:
      "Alert acknowledgement prepared.",
    data: {
      alertId:
        alert.alertId,

      acknowledgement: {
        acknowledged:
          true,

        acknowledgedAt:
          new Date().toISOString(),

        acknowledgedBy:
          normalizedOwner,
      },
    },
  };
}

function resolveAlert(
  alert,
  ownerId
) {
  if (
    !isObject(alert)
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Alert is invalid.",
      data: null,
    };
  }

  const normalizedOwner =
    normalizeString(
      ownerId,
      200
    );

  if (!normalizedOwner) {
    return {
      success: false,
      status:
        "unauthorized",
      message:
        "Owner identity is required.",
      data: null,
    };
  }

  return {
    success: true,
    status:
      ALERT_STATUS.RESOLVED,
    message:
      "Alert resolution prepared.",
    data: {
      alertId:
        alert.alertId,

      resolution: {
        resolved:
          true,

        resolvedAt:
          new Date().toISOString(),

        resolvedBy:
          normalizedOwner,
      },
    },
  };
}

function prepareAlertBatch(
  incidents = [],
  options = {}
) {
  if (
    !Array.isArray(
      incidents
    )
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Incidents must be an array.",
      data: null,
    };
  }

  if (
    incidents.length >
    MAX_ALERTS_PER_BATCH
  ) {
    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        `Maximum ${MAX_ALERTS_PER_BATCH} incidents are allowed per batch.`,
      data: null,
    };
  }

  const alerts = [];
  const rejected = [];

  for (
    const incident of incidents
  ) {
    const result =
      buildAlert(
        incident,
        options
      );

    if (
      result.success
    ) {
      alerts.push(
        result.data.alert
      );
    } else {
      rejected.push({
        reason:
          result.message,
      });
    }
  }

  return {
    success: true,
    status:
      alerts.length
        ? ALERT_STATUS.READY
        : ALERT_STATUS.FAILED,

    message:
      alerts.length
        ? "Financial alert batch prepared."
        : "No valid alerts could be prepared.",

    data: {
      alerts,

      count:
        alerts.length,

      rejected,

      generatedAt:
        new Date().toISOString(),
    },
  };
}

async function financialAlertService(
  input = {}
) {
  try {
    if (
      !isObject(input)
    ) {
      return {
        success: false,
        status:
          ALERT_STATUS.FAILED,
        message:
          "Alert service input must be an object.",
        data: null,
      };
    }

    if (
      Array.isArray(
        input.incidents
      )
    ) {
      return prepareAlertBatch(
        input.incidents,
        input
      );
    }

    if (
      input.incident
    ) {
      return buildAlert(
        input.incident,
        input
      );
    }

    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "incident or incidents are required.",
      data: null,
    };
  } catch (error) {
    console.error(
      "[FinancialAlertService] Error:",
      error.message
    );

    return {
      success: false,
      status:
        ALERT_STATUS.FAILED,
      message:
        "Financial alert service failed.",
      error:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message,
      data: null,
    };
  }
}

financialAlertService.SEVERITY =
  SEVERITY;

financialAlertService.ALERT_STATUS =
  ALERT_STATUS;

financialAlertService.CHANNEL =
  CHANNEL;

financialAlertService.buildAlert =
  buildAlert;

financialAlertService.prepareAlertBatch =
  prepareAlertBatch;

financialAlertService.buildWhatsAppPayload =
  buildWhatsAppPayload;

financialAlertService.markWhatsAppSent =
  markWhatsAppSent;

financialAlertService.markWhatsAppFailed =
  markWhatsAppFailed;

financialAlertService.acknowledgeAlert =
  acknowledgeAlert;

financialAlertService.resolveAlert =
  resolveAlert;

financialAlertService.isWithinCooldown =
  isWithinCooldown;

financialAlertService.shouldSuppressDuplicate =
  shouldSuppressDuplicate;

financialAlertService.suppressAlert =
  suppressAlert;

financialAlertService.validateIncident =
  validateIncident;

module.exports =
  financialAlertService;
