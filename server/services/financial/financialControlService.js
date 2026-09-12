"use strict";

const costMonitorAgent = require("../../agents/financial/costMonitorAgent");
const usageMonitorAgent = require("../../agents/financial/usageMonitorAgent");
const forecastAgent = require("../../agents/financial/forecastAgent");
const emergencyAgent = require("../../agents/financial/emergencyAgent");
const paymentApprovalAgent = require("../../agents/financial/paymentApprovalAgent");
const financialAlertService = require("./financialAlertService");

const MAX_ITEMS = 500;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS);
  }

  if (isObject(value)) {
    return [value];
  }

  return [];
}

function getNested(result, keys = []) {
  let current = result;

  for (const key of keys) {
    if (!isObject(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function extractData(result) {
  if (!isObject(result)) {
    return {};
  }

  if (isObject(result.data)) {
    return result.data;
  }

  return result;
}

function extractCosts(result) {
  const data = extractData(result);

  return (
    asArray(data.costs).length
      ? asArray(data.costs)
      : asArray(data.observations).filter(
          (item) =>
            isObject(item) &&
            (item.valueType === "cost" ||
              item.cost !== undefined ||
              item.amount !== undefined)
        )
  );
}

function extractUsage(result) {
  const data = extractData(result);

  return (
    asArray(data.usage).length
      ? asArray(data.usage)
      : asArray(data.observations).filter(
          (item) =>
            isObject(item) &&
            (item.valueType === "usage" ||
              item.requests !== undefined ||
              item.tokens !== undefined ||
              item.units !== undefined)
        )
  );
}

function extractForecasts(result) {
  const data = extractData(result);

  if (Array.isArray(data.forecasts)) {
    return data.forecasts.slice(0, MAX_ITEMS);
  }

  if (isObject(data.forecast)) {
    return [data.forecast];
  }

  if (Array.isArray(result?.forecasts)) {
    return result.forecasts.slice(0, MAX_ITEMS);
  }

  if (isObject(result?.forecast)) {
    return [result.forecast];
  }

  return [];
}

function extractIncidents(result) {
  const data = extractData(result);

  if (Array.isArray(data.incidents)) {
    return data.incidents.slice(0, MAX_ITEMS);
  }

  if (isObject(data.incident)) {
    return [data.incident];
  }

  if (Array.isArray(result?.incidents)) {
    return result.incidents.slice(0, MAX_ITEMS);
  }

  if (isObject(result?.incident)) {
    return [result.incident];
  }

  return [];
}

function extractAlerts(result) {
  const data = extractData(result);

  if (Array.isArray(data.alerts)) {
    return data.alerts.slice(0, MAX_ITEMS);
  }

  if (isObject(data.alert)) {
    return [data.alert];
  }

  if (Array.isArray(result?.alerts)) {
    return result.alerts.slice(0, MAX_ITEMS);
  }

  return [];
}

function normalizeStatus(result) {
  if (!isObject(result)) {
    return "unavailable";
  }

  if (result.success === true) {
    return "ok";
  }

  if (result.status) {
    return String(result.status);
  }

  if (result.success === false) {
    return "error";
  }

  return "unavailable";
}

function safeError(error) {
  if (!error) {
    return {
      code: "UNKNOWN_ERROR",
      message: "Unknown financial control error."
    };
  }

  return {
    code: error.code || "FINANCIAL_CONTROL_ERROR",
    message:
      typeof error.message === "string"
        ? error.message.slice(0, 1000)
        : "Financial control operation failed."
  };
}

function buildProviderStatus(input = {}) {
  const providerHealth = isObject(input.providerHealth)
    ? input.providerHealth
    : {};

  const providers = {};

  for (const [provider, value] of Object.entries(providerHealth)) {
    if (!isObject(value)) {
      continue;
    }

    providers[provider] = {
      provider,
      status: value.status || "unknown",
      available:
        typeof value.available === "boolean"
          ? value.available
          : undefined,
      source: value.source || null,
      retrievedAt: value.retrievedAt || null
    };
  }

  return providers;
}

function buildAssessmentSummary({
  costs,
  usage,
  forecasts,
  incidents,
  alerts,
  providerStatus
}) {
  const availableCostCount = costs.filter(
    (item) =>
      isObject(item) &&
      item.status !== "unavailable" &&
      item.status !== "error" &&
      typeof item.cost === "number"
  ).length;

  const availableUsageCount = usage.filter(
    (item) =>
      isObject(item) &&
      item.status !== "unavailable" &&
      item.status !== "error"
  ).length;

  const criticalIncidents = incidents.filter(
    (item) =>
      isObject(item) &&
      String(item.severity || "").toLowerCase() === "critical"
  ).length;

  const highIncidents = incidents.filter(
    (item) =>
      isObject(item) &&
      String(item.severity || "").toLowerCase() === "high"
  ).length;

  const providerEntries = Object.values(providerStatus);

  const unavailableProviders = providerEntries.filter(
    (item) =>
      item.status === "unavailable" ||
      item.status === "not_configured" ||
      item.available === false
  ).length;

  return {
    costObservations: costs.length,
    verifiedCostObservations: availableCostCount,

    usageObservations: usage.length,
    verifiedUsageObservations: availableUsageCount,

    forecasts: forecasts.length,

    incidents: incidents.length,
    criticalIncidents,
    highIncidents,

    alertsPrepared: alerts.length,

    providers: providerEntries.length,
    unavailableProviders,

    financialDataQuality:
      costs.length === 0 && usage.length === 0
        ? "unavailable"
        : availableCostCount + availableUsageCount > 0
          ? "available"
          : "insufficient"
  };
}

/**
 * Run a complete financial-control assessment.
 *
 * IMPORTANT:
 * This service does not invent provider data and does not directly
 * execute payments, infrastructure changes, or WhatsApp messages.
 *
 * Provider adapters are responsible for supplying real data.
 */
async function runFinancialAssessment(input = {}) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code: "INVALID_INPUT",
        message: "Financial control input must be an object."
      }
    };
  }

  const startedAt = new Date().toISOString();

  const result = {
    success: true,
    status: "completed",
    operation: "financial_assessment",

    startedAt,
    completedAt: null,

    costs: {
      status: "unavailable",
      observations: [],
      raw: null
    },

    usage: {
      status: "unavailable",
      observations: [],
      raw: null
    },

    forecast: {
      status: "unavailable",
      observations: [],
      raw: null
    },

    emergency: {
      status: "unavailable",
      incidents: [],
      raw: null
    },

    alerts: {
      status: "unavailable",
      prepared: [],
      raw: null
    },

    paymentApproval: {
      status: "not_requested",
      raw: null
    },

    providerStatus: buildProviderStatus(input),

    summary: null,

    errors: []
  };

  /*
   * ---------------------------------------------------------
   * 1. COST MONITORING
   * ---------------------------------------------------------
   *
   * costMonitorAgent only works with actual supplied provider
   * data. No estimated or fabricated cost is inserted here.
   */
  try {
    const costResult = await costMonitorAgent({
      providers: input.providers,
      providerData: input.providerData,
      costs: input.costs,
      currentCosts: input.currentCosts,
      previousCosts: input.previousCosts,

      start: input.start,
      end: input.end,
      period: input.period,

      accountId: input.accountId,
      projectId: input.projectId,

      anomalyMultiplier: input.anomalyMultiplier
    });

    result.costs.raw = costResult;
    result.costs.status = normalizeStatus(costResult);
    result.costs.observations = extractCosts(costResult);
  } catch (error) {
    result.costs.status = "error";

    result.errors.push({
      stage: "cost_monitor",
      ...safeError(error)
    });
  }

  /*
   * ---------------------------------------------------------
   * 2. USAGE MONITORING
   * ---------------------------------------------------------
   */
  try {
    const usageResult = await usageMonitorAgent({
      providers: input.providers,
      providerData: input.providerData,
      usage: input.usage,
      usageData: input.usageData,

      start: input.start,
      end: input.end,
      period: input.period,

      accountId: input.accountId,
      projectId: input.projectId,

      model: input.model
    });

    result.usage.raw = usageResult;
    result.usage.status = normalizeStatus(usageResult);
    result.usage.observations = extractUsage(usageResult);
  } catch (error) {
    result.usage.status = "error";

    result.errors.push({
      stage: "usage_monitor",
      ...safeError(error)
    });
  }

  /*
   * ---------------------------------------------------------
   * 3. FORECAST
   * ---------------------------------------------------------
   *
   * Forecasting requires historical/incremental observations.
   * We never manufacture history from a single current value.
   */
  try {
    const forecastInput = {
      observations:
        asArray(input.forecastObservations).length > 0
          ? asArray(input.forecastObservations)
          : asArray(input.costHistory).length > 0
            ? asArray(input.costHistory)
            : result.costs.observations,

      usageObservations:
        asArray(input.usageHistory).length > 0
          ? asArray(input.usageHistory)
          : result.usage.observations,

      history: asArray(input.forecastHistory),

      providers: input.providers,

      horizonDays:
        Number.isFinite(Number(input.horizonDays))
          ? Number(input.horizonDays)
          : undefined,

      minObservations:
        Number.isFinite(Number(input.minObservations))
          ? Number(input.minObservations)
          : undefined,

      limit:
        Number.isFinite(Number(input.forecastLimit))
          ? Number(input.forecastLimit)
          : undefined
    };

    const forecastResult = await forecastAgent(forecastInput);

    result.forecast.raw = forecastResult;
    result.forecast.status = normalizeStatus(forecastResult);
    result.forecast.observations = extractForecasts(forecastResult);
  } catch (error) {
    result.forecast.status = "error";

    result.errors.push({
      stage: "forecast",
      ...safeError(error)
    });
  }

  /*
   * ---------------------------------------------------------
   * 4. EMERGENCY / RISK DETECTION
   * ---------------------------------------------------------
   */
  try {
    const emergencyResult = await emergencyAgent({
      costs: result.costs.observations,
      usage: result.usage.observations,
      forecasts: result.forecast.observations,

      infrastructure: input.infrastructure || null,

      payment: input.paymentStatus || input.payment || null,

      providerHealth:
        input.providerHealth || result.providerStatus || null,

      incidents: input.incidents,

      thresholds: input.thresholds,

      projectId: input.projectId,
      accountId: input.accountId
    });

    result.emergency.raw = emergencyResult;
    result.emergency.status = normalizeStatus(emergencyResult);
    result.emergency.incidents = extractIncidents(emergencyResult);
  } catch (error) {
    result.emergency.status = "error";

    result.errors.push({
      stage: "emergency",
      ...safeError(error)
    });
  }

  /*
   * ---------------------------------------------------------
   * 5. ALERT PREPARATION
   * ---------------------------------------------------------
   *
   * Alert service prepares a safe notification payload.
   * It does NOT send WhatsApp messages.
   */
  try {
    const incidents = result.emergency.incidents;

    if (incidents.length === 0) {
      result.alerts.status = "no_alerts";
      result.alerts.prepared = [];
    } else {
      const preparedAlerts = [];

      for (const incident of incidents.slice(0, MAX_ITEMS)) {
        try {
          const alertResult = await financialAlertService({
            incident,
            ownerId: input.ownerId,
            channel: "whatsapp",

            source: incident.source || "financial_control",

            metadata: {
              projectId: input.projectId || null,
              accountId: input.accountId || null
            }
          });

          const alertData = extractData(alertResult);

          if (alertResult?.success !== false) {
            preparedAlerts.push(
              isObject(alertData.alert)
                ? alertData.alert
                : isObject(alertResult.alert)
                  ? alertResult.alert
                  : alertResult
            );
          }
        } catch (error) {
          result.errors.push({
            stage: "alert_prepare",
            ...safeError(error)
          });
        }
      }

      result.alerts.status =
        preparedAlerts.length > 0 ? "ready" : "unavailable";

      result.alerts.prepared = preparedAlerts;
    }
  } catch (error) {
    result.alerts.status = "error";

    result.errors.push({
      stage: "alert_service",
      ...safeError(error)
    });
  }

  /*
   * ---------------------------------------------------------
   * 6. PAYMENT APPROVAL
   * ---------------------------------------------------------
   *
   * This section is deliberately approval-only.
   *
   * No card details.
   * No CVV.
   * No OTP.
   * No raw banking credentials.
   * No automatic payment execution.
   */
  if (isObject(input.paymentApproval)) {
    try {
      const approvalResult = await paymentApprovalAgent(
        input.paymentApproval
      );

      result.paymentApproval.raw = approvalResult;
      result.paymentApproval.status = normalizeStatus(approvalResult);
    } catch (error) {
      result.paymentApproval.status = "error";

      result.errors.push({
        stage: "payment_approval",
        ...safeError(error)
      });
    }
  }

  /*
   * ---------------------------------------------------------
   * 7. SUMMARY
   * ---------------------------------------------------------
   */
  result.summary = buildAssessmentSummary({
    costs: result.costs.observations,
    usage: result.usage.observations,
    forecasts: result.forecast.observations,
    incidents: result.emergency.incidents,
    alerts: result.alerts.prepared,
    providerStatus: result.providerStatus
  });

  result.completedAt = new Date().toISOString();

  if (result.errors.length > 0) {
    result.status = "completed_with_errors";
  }

  return result;
}

/**
 * Simple status operation.
 */
async function getFinancialStatus(input = {}) {
  return runFinancialAssessment({
    ...input,
    operation: "status"
  });
}

/**
 * Cost-focused operation.
 */
async function getFinancialCosts(input = {}) {
  try {
    const result = await costMonitorAgent(input);

    return {
      success: result?.success !== false,
      status: normalizeStatus(result),
      operation: "costs",
      data: extractData(result),
      raw: result
    };
  } catch (error) {
    return {
      success: false,
      status: "error",
      operation: "costs",
      error: safeError(error)
    };
  }
}

/**
 * Usage-focused operation.
 */
async function getFinancialUsage(input = {}) {
  try {
    const result = await usageMonitorAgent(input);

    return {
      success: result?.success !== false,
      status: normalizeStatus(result),
      operation: "usage",
      data: extractData(result),
      raw: result
    };
  } catch (error) {
    return {
      success: false,
      status: "error",
      operation: "usage",
      error: safeError(error)
    };
  }
}

/**
 * Forecast-focused operation.
 */
async function getFinancialForecast(input = {}) {
  try {
    const result = await forecastAgent(input);

    return {
      success: result?.success !== false,
      status: normalizeStatus(result),
      operation: "forecast",
      data: extractData(result),
      raw: result
    };
  } catch (error) {
    return {
      success: false,
      status: "error",
      operation: "forecast",
      error: safeError(error)
    };
  }
}

/**
 * Emergency-focused operation.
 */
async function getFinancialEmergency(input = {}) {
  try {
    const result = await emergencyAgent(input);

    return {
      success: result?.success !== false,
      status: normalizeStatus(result),
      operation: "emergency",
      incidents: extractIncidents(result),
      data: extractData(result),
      raw: result
    };
  } catch (error) {
    return {
      success: false,
      status: "error",
      operation: "emergency",
      incidents: [],
      error: safeError(error)
    };
  }
}

/**
 * Payment approval operation.
 *
 * This function never performs the payment itself.
 */
async function requestPaymentApproval(input = {}) {
  if (!isObject(input)) {
    return {
      success: false,
      status: "invalid",
      error: {
        code: "INVALID_PAYMENT_APPROVAL_INPUT",
        message: "Payment approval input must be an object."
      }
    };
  }

  try {
    const result = await paymentApprovalAgent(input);

    return {
      success: result?.success !== false,
      status: normalizeStatus(result),
      operation: "payment_approval",
      data: extractData(result),
      raw: result
    };
  } catch (error) {
    return {
      success: false,
      status: "error",
      operation: "payment_approval",
      error: safeError(error)
    };
  }
}

/**
 * Prepare WhatsApp-safe alerts from supplied incidents.
 *
 * No message is sent from this service.
 */
async function prepareAlerts(input = {}) {
  const incidents = asArray(input.incidents);

  const alerts = [];
  const errors = [];

  for (const incident of incidents) {
    try {
      const result = await financialAlertService({
        incident,
        ownerId: input.ownerId,
        channel: "whatsapp",
        source: input.source || incident.source || "financial_control"
      });

      if (result?.success !== false) {
        const data = extractData(result);

        alerts.push(
          isObject(data.alert)
            ? data.alert
            : isObject(result.alert)
              ? result.alert
              : result
        );
      }
    } catch (error) {
      errors.push(safeError(error));
    }
  }

  return {
    success: errors.length === 0,
    status:
      alerts.length > 0
        ? errors.length > 0
          ? "partial"
          : "ready"
        : "no_alerts",
    operation: "prepare_alerts",
    alerts,
    errors
  };
}

/**
 * Main callable interface.
 */
async function financialControlService(input = {}) {
  const operation = String(input?.operation || "assessment")
    .trim()
    .toLowerCase();

  switch (operation) {
    case "status":
      return getFinancialStatus(input);

    case "assessment":
    case "full":
    case "report":
      return runFinancialAssessment(input);

    case "cost":
    case "costs":
      return getFinancialCosts(input);

    case "usage":
      return getFinancialUsage(input);

    case "forecast":
      return getFinancialForecast(input);

    case "emergency":
    case "risk":
      return getFinancialEmergency(input);

    case "payment":
    case "payment_approval":
    case "approve_payment":
      return requestPaymentApproval(
        input.paymentApproval || input.payment || input
      );

    case "prepare_alerts":
    case "alerts":
      return prepareAlerts(input);

    default:
      return {
        success: false,
        status: "invalid",
        operation,
        error: {
          code: "UNSUPPORTED_FINANCIAL_OPERATION",
          message: `Unsupported financial operation: ${operation}`
        }
      };
  }
}

financialControlService.runFinancialAssessment = runFinancialAssessment;
financialControlService.getFinancialStatus = getFinancialStatus;
financialControlService.getFinancialCosts = getFinancialCosts;
financialControlService.getFinancialUsage = getFinancialUsage;
financialControlService.getFinancialForecast = getFinancialForecast;
financialControlService.getFinancialEmergency = getFinancialEmergency;
financialControlService.requestPaymentApproval =
  requestPaymentApproval;
financialControlService.prepareAlerts = prepareAlerts;

module.exports = financialControlService;
