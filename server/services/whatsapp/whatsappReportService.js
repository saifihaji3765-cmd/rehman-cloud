"use strict";

const whatsappMessageService = require("./whatsappMessageService");
const whatsappSecurityService = require("./whatsappSecurityService");

const MAX_REPORT_LENGTH = 3800;

function clean(value, maxLength = 1000) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value, currency) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  const code = clean(currency, 10).toUpperCase();

  if (!code) {
    return formatNumber(value);
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${formatNumber(value)}`;
  }
}

function formatDate(value) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return date.toISOString();
}

function statusLabel(status) {
  const value = clean(status, 50);

  return value || "Unavailable";
}

function buildHeader(title) {
  const safeTitle = clean(title, 120) || "ZyrionOS Report";

  return `ZYRIONOS\n${safeTitle}`;
}

function buildSourceLine({
  provider,
  source,
  retrievedAt,
  confidence,
} = {}) {
  const parts = [];

  if (provider) {
    parts.push(`Provider: ${clean(provider, 80)}`);
  }

  if (source) {
    parts.push(`Source: ${clean(source, 120)}`);
  }

  if (retrievedAt) {
    parts.push(`Retrieved: ${formatDate(retrievedAt)}`);
  }

  if (confidence) {
    parts.push(`Confidence: ${clean(confidence, 40)}`);
  }

  return parts.length ? parts.join("\n") : "Source: Unavailable";
}

function buildStatusReport(data = {}) {
  const serviceStatus = statusLabel(
    data.status ||
      data.serviceStatus ||
      data.health?.status
  );

  const lines = [
    buildHeader("Financial Control Status"),
    "",
    `Overall status: ${serviceStatus}`,
  ];

  if (data.providers) {
    lines.push(
      `Providers available: ${formatNumber(
        data.providers.available
      )}`,
      `Providers unavailable: ${formatNumber(
        data.providers.unavailable
      )}`
    );
  }

  if (data.cost) {
    lines.push(
      "",
      `Current cost: ${formatCurrency(
        data.cost.value,
        data.cost.currency
      )}`
    );
  }

  if (data.usage) {
    lines.push(
      `Usage: ${formatNumber(data.usage.value)} ${
        clean(data.usage.unit, 40) || ""
      }`.trim()
    );
  }

  if (data.forecast) {
    lines.push(
      "",
      `Forecast status: ${statusLabel(
        data.forecast.status
      )}`,
      `Forecast: ${
        typeof data.forecast.value === "number"
          ? formatCurrency(
              data.forecast.value,
              data.forecast.currency
            )
          : "Unavailable"
      }`
    );
  }

  if (data.source) {
    lines.push(
      "",
      buildSourceLine(data.source)
    );
  }

  return truncateReport(lines.join("\n"));
}

function buildCostReport({
  provider,
  cost,
  previousCost,
  currency,
  period,
  source,
  retrievedAt,
} = {}) {
  const lines = [
    buildHeader("Cost Report"),
    "",
    `Provider: ${clean(provider, 80) || "Unavailable"}`,
    `Period: ${clean(period, 100) || "Unavailable"}`,
    `Current cost: ${formatCurrency(cost, currency)}`,
  ];

  if (
    typeof cost === "number" &&
    typeof previousCost === "number" &&
    Number.isFinite(cost) &&
    Number.isFinite(previousCost) &&
    previousCost !== 0
  ) {
    const change =
      ((cost - previousCost) / Math.abs(previousCost)) * 100;

    lines.push(
      `Change vs previous: ${
        Number.isFinite(change)
          ? `${change.toFixed(2)}%`
          : "Unavailable"
      }`
    );
  }

  lines.push(
    "",
    buildSourceLine({
      provider,
      source,
      retrievedAt,
    })
  );

  return truncateReport(lines.join("\n"));
}

function buildUsageReport({
  provider,
  requests,
  tokens,
  units,
  unit,
  model,
  period,
  source,
  retrievedAt,
} = {}) {
  const lines = [
    buildHeader("Usage Report"),
    "",
    `Provider: ${clean(provider, 80) || "Unavailable"}`,
    `Model: ${clean(model, 120) || "All / Unavailable"}`,
    `Period: ${clean(period, 100) || "Unavailable"}`,
  ];

  if (typeof requests === "number") {
    lines.push(`Requests: ${formatNumber(requests)}`);
  }

  if (typeof tokens === "number") {
    lines.push(`Tokens: ${formatNumber(tokens)}`);
  }

  if (typeof units === "number") {
    lines.push(
      `Units: ${formatNumber(units)} ${
        clean(unit, 40)
      }`.trim()
    );
  }

  if (
    typeof requests !== "number" &&
    typeof tokens !== "number" &&
    typeof units !== "number"
  ) {
    lines.push("Usage: Unavailable");
  }

  lines.push(
    "",
    buildSourceLine({
      provider,
      source,
      retrievedAt,
    })
  );

  return truncateReport(lines.join("\n"));
}

function buildForecastReport({
  provider,
  status,
  forecast,
  currency,
  unit,
  horizonDays,
  dailyBurn,
  confidence,
  source,
  retrievedAt,
} = {}) {
  const lines = [
    buildHeader("Forecast Report"),
    "",
    `Provider: ${clean(provider, 80) || "Aggregate"}`,
    `Status: ${statusLabel(status)}`,
  ];

  if (typeof forecast === "number") {
    lines.push(
      `Forecast: ${
        currency
          ? formatCurrency(forecast, currency)
          : `${formatNumber(forecast)} ${
              clean(unit, 40)
            }`.trim()
      }`
    );
  } else {
    lines.push("Forecast: Unavailable");
  }

  if (typeof horizonDays === "number") {
    lines.push(`Horizon: ${formatNumber(horizonDays)} days`);
  }

  if (typeof dailyBurn === "number") {
    lines.push(
      `Daily burn: ${
        currency
          ? formatCurrency(dailyBurn, currency)
          : `${formatNumber(dailyBurn)} ${
              clean(unit, 40)
            }`.trim()
      }`
    );
  }

  lines.push(
    `Confidence: ${clean(confidence, 40) || "Unavailable"}`,
    "",
    buildSourceLine({
      provider,
      source,
      retrievedAt,
    })
  );

  return truncateReport(lines.join("\n"));
}

function buildEmergencyReport({
  severity,
  incidentType,
  title,
  message,
  recommendedActions = [],
  provider,
  source,
  retrievedAt,
} = {}) {
  const lines = [
    buildHeader("🚨 Financial Emergency"),
    "",
    `Severity: ${statusLabel(severity)}`,
    `Type: ${clean(incidentType, 100) || "Unavailable"}`,
    `Title: ${clean(title, 180) || "Financial incident"}`,
    "",
    clean(message, 1200) || "Incident details unavailable.",
  ];

  if (Array.isArray(recommendedActions)) {
    const actions = recommendedActions
      .map((action) => clean(action, 300))
      .filter(Boolean)
      .slice(0, 5);

    if (actions.length) {
      lines.push(
        "",
        "Recommended actions:"
      );

      actions.forEach((action, index) => {
        lines.push(`${index + 1}. ${action}`);
      });
    }
  }

  lines.push(
    "",
    buildSourceLine({
      provider,
      source,
      retrievedAt,
    })
  );

  return truncateReport(lines.join("\n"));
}

function buildPaymentStatusReport({
  status,
  provider,
  amount,
  currency,
  approvalReference,
  requestedAt,
  expiresAt,
  providerStatus,
  reason,
} = {}) {
  const lines = [
    buildHeader("Payment Approval Status"),
    "",
    `Approval: ${statusLabel(status)}`,
    `Provider: ${clean(provider, 80) || "Unavailable"}`,
    `Amount: ${formatCurrency(amount, currency)}`,
  ];

  if (approvalReference) {
    lines.push(
      `Approval reference: ${clean(
        approvalReference,
        120
      )}`
    );
  }

  if (providerStatus) {
    lines.push(
      `Provider status: ${clean(
        providerStatus,
        100
      )}`
    );
  }

  if (requestedAt) {
    lines.push(
      `Requested: ${formatDate(requestedAt)}`
    );
  }

  if (expiresAt) {
    lines.push(
      `Expires: ${formatDate(expiresAt)}`
    );
  }

  if (reason) {
    lines.push(
      `Reason: ${clean(reason, 300)}`
    );
  }

  return truncateReport(lines.join("\n"));
}

function truncateReport(text) {
  const safe = clean(text, MAX_REPORT_LENGTH);

  if (safe.length <= MAX_REPORT_LENGTH) {
    return safe;
  }

  return `${safe.slice(0, MAX_REPORT_LENGTH - 20)}\n[TRUNCATED]`;
}

function validateReport(report) {
  const result =
    whatsappSecurityService.validateOutboundMessage(
      report
    );

  if (!result.valid || !result.safe) {
    return {
      valid: false,
      report: null,
      reason:
        result.reason ||
        "UNSAFE_WHATSAPP_REPORT",
    };
  }

  return {
    valid: true,
    report: result.text,
    reason: null,
  };
}

async function sendReport({
  report,
  ownerPhone,
  previewUrl = false,
} = {}) {
  const validation = validateReport(report);

  if (!validation.valid) {
    return {
      success: false,
      status: "blocked",
      error: validation.reason,
    };
  }

  if (!ownerPhone) {
    return {
      success: false,
      status: "invalid",
      error: "OWNER_PHONE_REQUIRED",
    };
  }

  return whatsappMessageService.sendOwnerText({
    ownerPhone,
    text: validation.report,
    previewUrl,
  });
}

module.exports = {
  MAX_REPORT_LENGTH,
  clean,
  formatNumber,
  formatCurrency,
  formatDate,
  buildStatusReport,
  buildCostReport,
  buildUsageReport,
  buildForecastReport,
  buildEmergencyReport,
  buildPaymentStatusReport,
  truncateReport,
  validateReport,
  sendReport,
};
