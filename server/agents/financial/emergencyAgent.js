"use strict";

/**
 * Financial Emergency Agent
 *
 * Purpose:
 * - Detect serious financial/infrastructure conditions from REAL signals.
 * - Classify incidents by severity.
 * - Produce safe emergency recommendations.
 * - Prevent duplicate/invalid emergency actions.
 * - Never invent costs, usage, provider status, quotas, or recovery results.
 * - Never execute destructive infrastructure/payment actions directly.
 *
 * This agent is a CONTROL + DECISION layer.
 * Actual actions must be performed by dedicated services after authorization.
 */

const crypto = require("crypto");

const SEVERITY = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  HIGH: "high",
  CRITICAL: "critical",
});

const EMERGENCY_STATUS = Object.freeze({
  NORMAL: "normal",
  WARNING: "warning",
  ACTIVE: "active",
  BLOCKED: "blocked",
  UNAVAILABLE: "unavailable",
});

const ACTION_TYPE = Object.freeze({
  ALERT_OWNER: "alert_owner",
  REQUEST_APPROVAL: "request_owner_approval",
  REDUCE_SPENDING: "reduce_spending",
  PAUSE_NON_CRITICAL_WORK: "pause_non_critical_work",
  DISABLE_OPTIONAL_TASKS: "disable_optional_tasks",
  REVIEW_PROVIDER_USAGE: "review_provider_usage",
  REVIEW_INFRASTRUCTURE: "review_infrastructure",
  FAILOVER_PROVIDER: "failover_provider",
  SCALE_DOWN: "scale_down",
  SCALE_UP: "scale_up",
  STOP_DEPLOYMENT: "stop_deployment",
});

const ACTION_RISK = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

const INCIDENT_TYPE = Object.freeze({
  COST_SPIKE: "cost_spike",
  BUDGET_RISK: "budget_risk",
  FORECAST_OVER_LIMIT: "forecast_over_limit",
  QUOTA_RISK: "quota_risk",
  USAGE_SPIKE: "usage_spike",
  INFRASTRUCTURE_FAILURE: "infrastructure_failure",
  SERVICE_DEGRADATION: "service_degradation",
  PAYMENT_FAILURE: "payment_failure",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  DATA_UNAVAILABLE: "data_unavailable",
  UNKNOWN: "unknown",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  costSpikeMultiplier: 2,
  forecastRiskRatio: 0.8,
  forecastCriticalRatio: 1,
  usageSpikeMultiplier: 2,
  quotaWarningRatio: 0.8,
  quotaCriticalRatio: 0.95,
});

const SAFE_ACTIONS = new Set([
  ACTION_TYPE.ALERT_OWNER,
  ACTION_TYPE.REQUEST_APPROVAL,
  ACTION_TYPE.REVIEW_PROVIDER_USAGE,
  ACTION_TYPE.REVIEW_INFRASTRUCTURE,
]);

const APPROVAL_REQUIRED_ACTIONS = new Set([
  ACTION_TYPE.REDUCE_SPENDING,
  ACTION_TYPE.PAUSE_NON_CRITICAL_WORK,
  ACTION_TYPE.DISABLE_OPTIONAL_TASKS,
  ACTION_TYPE.FAILOVER_PROVIDER,
  ACTION_TYPE.SCALE_DOWN,
  ACTION_TYPE.SCALE_UP,
  ACTION_TYPE.STOP_DEPLOYMENT,
]);

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeProvider(provider) {
  const value = normalizeString(provider, 100);

  return value ? value.toLowerCase() : null;
}

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}

function createIncidentId() {
  return `fin_inc_${crypto.randomUUID()}`;
}

function createActionId() {
  return `fin_act_${crypto.randomUUID()}`;
}

function normalizeSeverity(value) {
  const severity =
    normalizeString(value, 30)?.toLowerCase();

  if (
    Object.values(SEVERITY).includes(
      severity
    )
  ) {
    return severity;
  }

  return null;
}

function severityRank(severity) {
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

function highestSeverity(severities) {
  const valid = severities
    .map(normalizeSeverity)
    .filter(Boolean);

  if (!valid.length) {
    return SEVERITY.INFO;
  }

  return valid.reduce(
    (highest, current) =>
      severityRank(current) >
      severityRank(highest)
        ? current
        : highest,
    SEVERITY.INFO
  );
}

function normalizeThreshold(
  value,
  fallback,
  minimum = 0
) {
  const number = toFiniteNumber(value);

  if (
    number === null ||
    number < minimum
  ) {
    return fallback;
  }

  return number;
}

function getThresholds(input = {}) {
  const source = isObject(
    input.thresholds
  )
    ? input.thresholds
    : {};

  return {
    costSpikeMultiplier:
      normalizeThreshold(
        source.costSpikeMultiplier,
        DEFAULT_THRESHOLDS.costSpikeMultiplier,
        1
      ),

    forecastRiskRatio:
      normalizeThreshold(
        source.forecastRiskRatio,
        DEFAULT_THRESHOLDS.forecastRiskRatio,
        0
      ),

    forecastCriticalRatio:
      normalizeThreshold(
        source.forecastCriticalRatio,
        DEFAULT_THRESHOLDS.forecastCriticalRatio,
        0
      ),

    usageSpikeMultiplier:
      normalizeThreshold(
        source.usageSpikeMultiplier,
        DEFAULT_THRESHOLDS.usageSpikeMultiplier,
        1
      ),

    quotaWarningRatio:
      normalizeThreshold(
        source.quotaWarningRatio,
        DEFAULT_THRESHOLDS.quotaWarningRatio,
        0
      ),

    quotaCriticalRatio:
      normalizeThreshold(
        source.quotaCriticalRatio,
        DEFAULT_THRESHOLDS.quotaCriticalRatio,
        0
      ),
  };
}

function normalizeSignal(signal = {}) {
  if (!isObject(signal)) {
    return null;
  }

  const provider =
    normalizeProvider(
      signal.provider
    );

  const status =
    normalizeString(
      signal.status,
      100
    )?.toLowerCase() || null;

  const timestamp =
    signal.timestamp ||
    signal.retrievedAt ||
    null;

  return {
    provider,

    status,

    timestamp,

    source:
      normalizeString(
        signal.source,
        300
      ),

    current:
      toFiniteNumber(
        signal.current
      ),

    previous:
      toFiniteNumber(
        signal.previous
      ),

    value:
      toFiniteNumber(
        signal.value
      ),

    limit:
      toFiniteNumber(
        signal.limit
      ),

    forecast:
      toFiniteNumber(
        signal.forecast
      ),

    ratio:
      toFiniteNumber(
        signal.ratio
      ),

    currency:
      normalizeString(
        signal.currency,
        10
      )?.toUpperCase() || null,

    unit:
      normalizeString(
        signal.unit,
        50
      ),

    serviceName:
      normalizeString(
        signal.serviceName,
        300
      ),

    deploymentId:
      normalizeString(
        signal.deploymentId,
        300
      ),

    message:
      normalizeString(
        signal.message,
        1000
      ),

    metadata:
      isObject(signal.metadata)
        ? signal.metadata
        : {},
  };
}

function calculateRatio(
  value,
  limit
) {
  if (
    value === null ||
    limit === null ||
    limit <= 0
  ) {
    return null;
  }

  return value / limit;
}

function calculateSpikeMultiplier(
  current,
  previous
) {
  if (
    current === null ||
    previous === null ||
    previous <= 0
  ) {
    return null;
  }

  return current / previous;
}

function buildIncident({
  type,
  severity,
  provider = null,
  title,
  message,
  source = null,
  timestamp = null,
  evidence = {},
}) {
  return {
    incidentId: createIncidentId(),

    type,

    severity,

    provider,

    title,

    message,

    source,

    detectedAt:
      timestamp ||
      new Date().toISOString(),

    evidence,

    state: {
      status:
        severity === SEVERITY.INFO
          ? EMERGENCY_STATUS.NORMAL
          : EMERGENCY_STATUS.ACTIVE,

      acknowledged: false,

      resolved: false,

      resolvedAt: null,
    },
  };
}

/**
 * COST SPIKE
 */
function detectCostSpike(
  signal,
  thresholds
) {
  if (
    signal.current === null ||
    signal.previous === null
  ) {
    return null;
  }

  const multiplier =
    calculateSpikeMultiplier(
      signal.current,
      signal.previous
    );

  if (
    multiplier === null ||
    multiplier <
      thresholds.costSpikeMultiplier
  ) {
    return null;
  }

  const severity =
    multiplier >=
    thresholds.costSpikeMultiplier * 2
      ? SEVERITY.CRITICAL
      : SEVERITY.HIGH;

  return buildIncident({
    type: INCIDENT_TYPE.COST_SPIKE,
    severity,
    provider: signal.provider,
    title:
      "Financial cost spike detected",
    message:
      "Verified provider cost is materially higher than the previous observed value.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      currentCost: signal.current,
      previousCost: signal.previous,
      multiplier,
      currency: signal.currency,
    },
  });
}

/**
 * FORECAST OVER LIMIT
 */
function detectForecastRisk(
  signal,
  thresholds
) {
  if (
    signal.forecast === null ||
    signal.limit === null ||
    signal.limit <= 0
  ) {
    return null;
  }

  const ratio =
    calculateRatio(
      signal.forecast,
      signal.limit
    );

  if (
    ratio === null ||
    ratio < thresholds.forecastRiskRatio
  ) {
    return null;
  }

  const severity =
    ratio >=
    thresholds.forecastCriticalRatio
      ? SEVERITY.CRITICAL
      : SEVERITY.HIGH;

  return buildIncident({
    type:
      INCIDENT_TYPE.FORECAST_OVER_LIMIT,
    severity,
    provider: signal.provider,
    title:
      "Financial forecast indicates limit risk",
    message:
      "The verified forecast indicates that the configured financial limit may be reached or exceeded.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      forecast: signal.forecast,
      limit: signal.limit,
      ratio,
      currency: signal.currency,
    },
  });
}

/**
 * QUOTA RISK
 */
function detectQuotaRisk(
  signal,
  thresholds
) {
  if (
    signal.current === null ||
    signal.limit === null ||
    signal.limit <= 0
  ) {
    return null;
  }

  const ratio =
    calculateRatio(
      signal.current,
      signal.limit
    );

  if (
    ratio === null ||
    ratio <
      thresholds.quotaWarningRatio
  ) {
    return null;
  }

  const severity =
    ratio >=
    thresholds.quotaCriticalRatio
      ? SEVERITY.CRITICAL
      : SEVERITY.WARNING;

  return buildIncident({
    type: INCIDENT_TYPE.QUOTA_RISK,
    severity,
    provider: signal.provider,
    title:
      "Provider quota risk detected",
    message:
      "Verified provider usage is approaching its reported quota or configured limit.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      usage: signal.current,
      limit: signal.limit,
      ratio,
      unit: signal.unit,
    },
  });
}

/**
 * USAGE SPIKE
 */
function detectUsageSpike(
  signal,
  thresholds
) {
  if (
    signal.current === null ||
    signal.previous === null
  ) {
    return null;
  }

  const multiplier =
    calculateSpikeMultiplier(
      signal.current,
      signal.previous
    );

  if (
    multiplier === null ||
    multiplier <
      thresholds.usageSpikeMultiplier
  ) {
    return null;
  }

  const severity =
    multiplier >=
    thresholds.usageSpikeMultiplier * 2
      ? SEVERITY.HIGH
      : SEVERITY.WARNING;

  return buildIncident({
    type: INCIDENT_TYPE.USAGE_SPIKE,
    severity,
    provider: signal.provider,
    title:
      "Provider usage spike detected",
    message:
      "Verified provider usage is materially higher than the previous observed value.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      currentUsage: signal.current,
      previousUsage: signal.previous,
      multiplier,
      unit: signal.unit,
      model: signal.metadata?.model || null,
    },
  });
}

/**
 * INFRASTRUCTURE FAILURE
 */
function detectInfrastructureFailure(
  signal
) {
  const status =
    signal.status;

  if (
    !status ||
    ![
      "failed",
      "failure",
      "unhealthy",
      "unavailable",
      "stopped",
      "error",
    ].includes(status)
  ) {
    return null;
  }

  return buildIncident({
    type:
      INCIDENT_TYPE.INFRASTRUCTURE_FAILURE,
    severity: SEVERITY.CRITICAL,
    provider: signal.provider,
    title:
      "Infrastructure failure detected",
    message:
      signal.message ||
      "A real infrastructure signal reports a failed or unavailable service.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      status,
      serviceName:
        signal.serviceName,
      deploymentId:
        signal.deploymentId,
    },
  });
}

/**
 * SERVICE DEGRADATION
 */
function detectServiceDegradation(
  signal
) {
  const status =
    signal.status;

  if (
    !status ||
    ![
      "degraded",
      "warning",
      "partial",
      "provisioning",
    ].includes(status)
  ) {
    return null;
  }

  return buildIncident({
    type:
      INCIDENT_TYPE.SERVICE_DEGRADATION,
    severity: SEVERITY.WARNING,
    provider: signal.provider,
    title:
      "Service degradation detected",
    message:
      signal.message ||
      "A real service signal indicates degraded or transitional service health.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      status,
      serviceName:
        signal.serviceName,
      deploymentId:
        signal.deploymentId,
    },
  });
}

/**
 * PAYMENT FAILURE
 */
function detectPaymentFailure(
  signal
) {
  const status =
    signal.status;

  if (
    !status ||
    ![
      "failed",
      "payment_failed",
      "declined",
      "cancelled",
    ].includes(status)
  ) {
    return null;
  }

  return buildIncident({
    type:
      INCIDENT_TYPE.PAYMENT_FAILURE,
    severity: SEVERITY.HIGH,
    provider: signal.provider,
    title:
      "Payment failure detected",
    message:
      signal.message ||
      "A real payment provider signal reports a failed payment.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      status,
      value: signal.value,
      currency: signal.currency,
      metadata: signal.metadata,
    },
  });
}

/**
 * PROVIDER UNAVAILABLE
 */
function detectProviderUnavailable(
  signal
) {
  const status =
    signal.status;

  if (
    !status ||
    ![
      "unavailable",
      "not_configured",
      "offline",
    ].includes(status)
  ) {
    return null;
  }

  return buildIncident({
    type:
      INCIDENT_TYPE.PROVIDER_UNAVAILABLE,
    severity: SEVERITY.HIGH,
    provider: signal.provider,
    title:
      "Provider unavailable",
    message:
      signal.message ||
      "The provider did not provide usable data or is currently unavailable.",
    source: signal.source,
    timestamp: signal.timestamp,
    evidence: {
      status,
    },
  });
}

function detectIncidents(
  signals,
  thresholds
) {
  const incidents = [];

  for (const rawSignal of signals) {
    const signal =
      normalizeSignal(rawSignal);

    if (!signal) {
      continue;
    }

    const detectors = [
      detectCostSpike,
      detectForecastRisk,
      detectQuotaRisk,
      detectUsageSpike,
    ];

    for (const detector of detectors) {
      const incident =
        detector(
          signal,
          thresholds
        );

      if (incident) {
        incidents.push(
          incident
        );
      }
    }

    const infrastructureIncident =
      detectInfrastructureFailure(
        signal
      );

    if (infrastructureIncident) {
      incidents.push(
        infrastructureIncident
      );
    }

    const degradationIncident =
      detectServiceDegradation(
        signal
      );

    if (degradationIncident) {
      incidents.push(
        degradationIncident
      );
    }

    const paymentIncident =
      detectPaymentFailure(
        signal
      );

    if (paymentIncident) {
      incidents.push(
        paymentIncident
      );
    }

    const unavailableIncident =
      detectProviderUnavailable(
        signal
      );

    if (unavailableIncident) {
      incidents.push(
        unavailableIncident
      );
    }
  }

  return incidents;
}

function deduplicateIncidents(
  incidents
) {
  const map = new Map();

  for (const incident of incidents) {
    const key = [
      incident.type,
      incident.provider || "",
      incident.evidence?.serviceName ||
        "",
      incident.evidence?.deploymentId ||
        "",
      incident.severity,
    ].join("|");

    /*
     * Keep the highest-severity/latest incident
     * for the same emergency condition.
     */
    const existing =
      map.get(key);

    if (!existing) {
      map.set(key, incident);
      continue;
    }

    const currentSeverity =
      severityRank(
        incident.severity
      );

    const existingSeverity =
      severityRank(
        existing.severity
      );

    if (
      currentSeverity >
        existingSeverity ||
      new Date(
        incident.detectedAt
      ).getTime() >
        new Date(
          existing.detectedAt
        ).getTime()
    ) {
      map.set(key, incident);
    }
  }

  return Array.from(
    map.values()
  ).sort(
    (a, b) =>
      severityRank(
        b.severity
      ) -
      severityRank(
        a.severity
      )
  );
}

function actionRisk(
  actionType
) {
  if (
    SAFE_ACTIONS.has(
      actionType
    )
  ) {
    return ACTION_RISK.LOW;
  }

  if (
    APPROVAL_REQUIRED_ACTIONS.has(
      actionType
    )
  ) {
    return ACTION_RISK.HIGH;
  }

  return ACTION_RISK.MEDIUM;
}

function createAction({
  incident,
  type,
  reason,
}) {
  const requiresApproval =
    APPROVAL_REQUIRED_ACTIONS.has(
      type
    );

  return {
    actionId:
      createActionId(),

    type,

    risk:
      actionRisk(type),

    requiresOwnerApproval:
      requiresApproval,

    autoExecutable: false,

    status:
      requiresApproval
        ? "approval_required"
        : "recommended",

    incidentId:
      incident.incidentId,

    provider:
      incident.provider,

    reason,

    createdAt:
      new Date().toISOString(),

    execution: {
      started: false,
      completed: false,
      result: null,
    },
  };
}

function buildActionsForIncident(
  incident
) {
  const actions = [];

  /*
   * Every non-normal emergency gets an owner alert.
   */
  actions.push(
    createAction({
      incident,
      type:
        ACTION_TYPE.ALERT_OWNER,
      reason:
        "Owner should be informed of the detected financial or infrastructure condition.",
    })
  );

  switch (incident.type) {
    case INCIDENT_TYPE.COST_SPIKE:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REVIEW_PROVIDER_USAGE,
          reason:
            "Review the real provider usage and cost source before changing infrastructure.",
        })
      );

      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REDUCE_SPENDING,
          reason:
            "Potential spending reduction may be required if the cost spike is confirmed.",
        })
      );
      break;

    case INCIDENT_TYPE.FORECAST_OVER_LIMIT:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REQUEST_APPROVAL,
          reason:
            "Owner approval should be obtained before making a financial-control change.",
        })
      );

      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REDUCE_SPENDING,
          reason:
            "Reduce optional spending only after the owner approves the proposed action.",
        })
      );
      break;

    case INCIDENT_TYPE.QUOTA_RISK:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REVIEW_PROVIDER_USAGE,
          reason:
            "Verify actual provider quota and current usage.",
        })
      );

      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.PAUSE_NON_CRITICAL_WORK,
          reason:
            "Non-critical workloads may need to be paused after owner approval.",
        })
      );
      break;

    case INCIDENT_TYPE.USAGE_SPIKE:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REVIEW_PROVIDER_USAGE,
          reason:
            "Investigate the verified usage increase before changing services.",
        })
      );

      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.DISABLE_OPTIONAL_TASKS,
          reason:
            "Optional workloads may be disabled after owner approval.",
        })
      );
      break;

    case INCIDENT_TYPE.INFRASTRUCTURE_FAILURE:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REVIEW_INFRASTRUCTURE,
          reason:
            "Inspect the real infrastructure status and deployment logs.",
        })
      );

      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.FAILOVER_PROVIDER,
          reason:
            "Provider failover may be considered only after confirming the failure and obtaining required approval.",
        })
      );
      break;

    case INCIDENT_TYPE.SERVICE_DEGRADATION:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REVIEW_INFRASTRUCTURE,
          reason:
            "Inspect service health before taking disruptive action.",
        })
      );
      break;

    case INCIDENT_TYPE.PAYMENT_FAILURE:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.ALERT_OWNER,
          reason:
            "Owner should review the real payment-provider status.",
        })
      );
      break;

    case INCIDENT_TYPE.PROVIDER_UNAVAILABLE:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.FAILOVER_PROVIDER,
          reason:
            "Failover may be considered only if an independently verified alternate provider is configured.",
        })
      );
      break;

    default:
      actions.push(
        createAction({
          incident,
          type:
            ACTION_TYPE.REVIEW_INFRASTRUCTURE,
          reason:
            "The emergency condition requires investigation before any action.",
        })
      );
  }

  return actions;
}

function buildEmergencyLevel(
  incidents
) {
  if (!incidents.length) {
    return SEVERITY.INFO;
  }

  return highestSeverity(
    incidents.map(
      (incident) =>
        incident.severity
    )
  );
}

function buildEmergencyStatus(
  incidents
) {
  if (!incidents.length) {
    return EMERGENCY_STATUS.NORMAL;
  }

  const severity =
    buildEmergencyLevel(
      incidents
    );

  if (
    severity ===
    SEVERITY.INFO
  ) {
    return EMERGENCY_STATUS.NORMAL;
  }

  return EMERGENCY_STATUS.ACTIVE;
}

function buildOwnerAlert(
  incidents,
  emergencyLevel
) {
  if (!incidents.length) {
    return null;
  }

  const criticalCount =
    incidents.filter(
      (incident) =>
        incident.severity ===
        SEVERITY.CRITICAL
    ).length;

  const highCount =
    incidents.filter(
      (incident) =>
        incident.severity ===
        SEVERITY.HIGH
    ).length;

  return {
    required: true,

    priority:
      emergencyLevel ===
      SEVERITY.CRITICAL
        ? "urgent"
        : emergencyLevel ===
          SEVERITY.HIGH
        ? "high"
        : "normal",

    channel:
      "owner_control_channel",

    message:
      `ZyrionOS Financial Control detected ${incidents.length} emergency condition(s). Critical: ${criticalCount}, High: ${highCount}. Review the verified incident details before approving any action.`,

    incidentIds:
      incidents.map(
        (incident) =>
          incident.incidentId
      ),

    generatedAt:
      new Date().toISOString(),
  };
}

function summarizeDataQuality(
  signals,
  incidents
) {
  const normalizedSignals =
    signals
      .map(normalizeSignal)
      .filter(Boolean);

  const available =
    normalizedSignals.filter(
      (signal) =>
        signal.status !==
          "unavailable" &&
        signal.status !==
          "not_configured"
    );

  return {
    inputSignalCount:
      signals.length,

    usableSignalCount:
      normalizedSignals.length,

    availableSignalCount:
      available.length,

    incidentCount:
      incidents.length,

    warning:
      available.length === 0
        ? "No usable provider signals were available. No financial condition should be inferred."
        : null,
  };
}

/**
 * Evaluate real financial/infrastructure signals.
 *
 * Input:
 *
 * {
 *   signals: [
 *     {
 *       provider: "aws",
 *       current: 120,
 *       previous: 50,
 *       currency: "USD",
 *       source: "aws-cost-explorer",
 *       status: "verified",
 *       timestamp: "..."
 *     }
 *   ],
 *   thresholds: {},
 *   ownerId: "..."
 * }
 */
async function emergencyAgent(
  input = {}
) {
  try {
    if (!isObject(input)) {
      return {
        success: false,
        status:
          EMERGENCY_STATUS.BLOCKED,
        message:
          "Emergency agent input must be an object.",
        data: null,
      };
    }

    const signals = Array.isArray(
      input.signals
    )
      ? input.signals
      : [];

    const thresholds =
      getThresholds(input);

    if (!signals.length) {
      return {
        success: true,
        status:
          EMERGENCY_STATUS.UNAVAILABLE,
        message:
          "No real financial or infrastructure signals were supplied. Emergency state cannot be inferred.",
        data: {
          emergencyLevel:
            null,
          incidents: [],
          actions: [],
          ownerAlert: null,
          dataQuality:
            summarizeDataQuality(
              [],
              []
            ),
          generatedAt:
            new Date().toISOString(),
        },
      };
    }

    const detected =
      detectIncidents(
        signals,
        thresholds
      );

    const incidents =
      deduplicateIncidents(
        detected
      );

    const emergencyLevel =
      buildEmergencyLevel(
        incidents
      );

    const status =
      buildEmergencyStatus(
        incidents
      );

    const actions =
      incidents.flatMap(
        buildActionsForIncident
      );

    return {
      success: true,

      status,

      message:
        incidents.length
          ? "Emergency evaluation completed from verified signals."
          : "No emergency condition was detected in the supplied verified signals.",

      data: {
        emergencyId:
          `fin_emg_${crypto.randomUUID()}`,

        emergencyLevel,

        incidents,

        actions,

        ownerAlert:
          buildOwnerAlert(
            incidents,
            emergencyLevel
          ),

        controls: {
          destructiveActionsAutomaticallyExecuted:
            false,

          paymentAutomaticallyExecuted:
            false,

          ownerApprovalRequiredForHighRiskActions:
            true,

          providerFailoverRequiresApproval:
            true,

          infrastructureStopRequiresApproval:
            true,

          scaleChangeRequiresApproval:
            true,
        },

        thresholds,

        dataQuality:
          summarizeDataQuality(
            signals,
            incidents
          ),

        generatedAt:
          new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(
      "[EmergencyAgent] Error:",
      error.message
    );

    return {
      success: false,
      status:
        EMERGENCY_STATUS.BLOCKED,
      message:
        "Emergency agent failed to evaluate the supplied signals.",
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
 * Check whether a specific action requires owner approval.
 */
function requiresOwnerApproval(
  actionType
) {
  return APPROVAL_REQUIRED_ACTIONS.has(
    actionType
  );
}

/**
 * Check whether an action is considered safe
 * for recommendation without execution.
 */
function isSafeAction(
  actionType
) {
  return SAFE_ACTIONS.has(
    actionType
  );
}

/**
 * Validate an action before it is passed to another
 * execution service.
 */
function validateAction(
  action = {}
) {
  if (!isObject(action)) {
    return {
      valid: false,
      reason:
        "Action must be an object.",
    };
  }

  const type =
    normalizeString(
      action.type,
      100
    )?.toLowerCase();

  if (
    !Object.values(
      ACTION_TYPE
    ).includes(type)
  ) {
    return {
      valid: false,
      reason:
        "Unsupported emergency action.",
    };
  }

  if (
    action.autoExecutable === true
  ) {
    return {
      valid: false,
      reason:
        "Emergency actions cannot be marked auto-executable.",
    };
  }

  if (
    requiresOwnerApproval(type) &&
    action.requiresOwnerApproval !==
      true
  ) {
    return {
      valid: false,
      reason:
        "High-risk emergency actions require explicit owner approval.",
    };
  }

  return {
    valid: true,
    type,
    requiresOwnerApproval:
      requiresOwnerApproval(type),
  };
}

/**
 * Prepare an approved action for a downstream executor.
 *
 * This still does NOT execute the action.
 */
function authorizeAction(
  action = {},
  ownerId
) {
  const validation =
    validateAction(action);

  if (!validation.valid) {
    return {
      success: false,
      status: "invalid",
      message:
        validation.reason,
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
      status: "unauthorized",
      message:
        "Authenticated owner identity is required.",
      data: null,
    };
  }

  if (
    validation.requiresOwnerApproval !==
    true
  ) {
    return {
      success: true,
      status: "authorized",
      message:
        "Action is safe to recommend but must still be executed by its dedicated service.",
      data: {
        actionId:
          action.actionId || null,
        ownerId:
          normalizedOwner,
        authorized:
          true,
        execute:
          false,
      },
    };
  }

  if (
    action.approvedBy !==
    normalizedOwner
  ) {
    return {
      success: false,
      status: "unauthorized",
      message:
        "Only the authenticated owner can authorize this emergency action.",
      data: null,
    };
  }

  if (
    action.approvalStatus !==
    "approved"
  ) {
    return {
      success: false,
      status: "approval_required",
      message:
        "Explicit owner approval is required before this action can be executed.",
      data: null,
    };
  }

  return {
    success: true,
    status: "authorized",
    message:
      "Owner-approved emergency action may be passed to the dedicated executor.",
    data: {
      actionId:
        action.actionId || null,

      ownerId:
        normalizedOwner,

      actionType:
        validation.type,

      authorized:
        true,

      execute:
        false,

      nextStep:
        "Pass this authorization to the dedicated infrastructure/payment execution service.",
    },
  };
}

emergencyAgent.SEVERITY =
  SEVERITY;

emergencyAgent.EMERGENCY_STATUS =
  EMERGENCY_STATUS;

emergencyAgent.ACTION_TYPE =
  ACTION_TYPE;

emergencyAgent.ACTION_RISK =
  ACTION_RISK;

emergencyAgent.INCIDENT_TYPE =
  INCIDENT_TYPE;

emergencyAgent.detectIncidents =
  detectIncidents;

emergencyAgent.buildActionsForIncident =
  buildActionsForIncident;

emergencyAgent.requiresOwnerApproval =
  requiresOwnerApproval;

emergencyAgent.isSafeAction =
  isSafeAction;

emergencyAgent.validateAction =
  validateAction;

emergencyAgent.authorizeAction =
  authorizeAction;

module.exports =
  emergencyAgent;
