const {
  UpdateServiceCommand,
  DescribeServicesCommand,
} = require("@aws-sdk/client-ecs");

const { ecs } = require("../config/aws");

/* =========================================================
   SCALING AGENT
   =========================================================
   Responsibility:
   - Read real ECS service state
   - Consume real monitoring metrics
   - Calculate safe desired task count
   - Update ECS only when required
   - Never treat missing metrics as zero
   - Never invent infrastructure state
   ========================================================= */

/* =========================
   HELPERS
========================= */

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getEnvInteger(name, fallback) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.floor(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProjectName(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || null;
}

/* =========================
   CONFIGURATION
========================= */

function getScalingConfig() {
  const minTasks = Math.max(
    1,
    getEnvInteger("ECS_MIN_TASKS", 1)
  );

  const maxTasks = Math.max(
    minTasks,
    getEnvInteger("ECS_MAX_TASKS", 10)
  );

  return {
    minTasks,
    maxTasks,

    /* Resource thresholds */

    scaleUpCpu: getEnvInteger(
      "ECS_SCALE_UP_CPU",
      70
    ),

    scaleUpMemory: getEnvInteger(
      "ECS_SCALE_UP_MEMORY",
      75
    ),

    highCpu: getEnvInteger(
      "ECS_HIGH_CPU",
      85
    ),

    highMemory: getEnvInteger(
      "ECS_HIGH_MEMORY",
      85
    ),

    extremeCpu: getEnvInteger(
      "ECS_EXTREME_CPU",
      95
    ),

    extremeMemory: getEnvInteger(
      "ECS_EXTREME_MEMORY",
      95
    ),

    scaleDownCpu: getEnvInteger(
      "ECS_SCALE_DOWN_CPU",
      25
    ),

    scaleDownMemory: getEnvInteger(
      "ECS_SCALE_DOWN_MEMORY",
      30
    ),
  };
}

/* =========================
   CLUSTER RESOLUTION
========================= */

function resolveClusterName(appMetrics) {
  return (
    appMetrics.clusterName ||
    appMetrics.cluster ||
    appMetrics.aws?.ecs?.cluster ||
    process.env.AWS_ECS_CLUSTER ||
    process.env.AWS_ECS_CLUSTER_NAME ||
    process.env.ECS_CLUSTER ||
    null
  );
}

/* =========================
   SERVICE RESOLUTION
========================= */

function resolveServiceName(appMetrics) {
  if (appMetrics.serviceName) {
    return String(appMetrics.serviceName).trim();
  }

  if (appMetrics.service) {
    return String(appMetrics.service).trim();
  }

  if (appMetrics.aws?.ecs?.service) {
    return String(
      appMetrics.aws.ecs.service
    ).trim();
  }

  const deploymentId =
    appMetrics.deploymentId;

  const projectName =
    normalizeProjectName(
      appMetrics.projectName ||
      appMetrics.appName ||
      appMetrics.planning?.projectName
    );

  /*
   * New AWS Agent contract:
   * ${projectName}-${deploymentId}-service
   */

  if (projectName && deploymentId) {
    return `${projectName}-${deploymentId}-service`;
  }

  return null;
}

/* =========================
   METRIC EXTRACTION
========================= */

function extractMetrics(appMetrics) {
  const cpuUsage = toFiniteNumber(
    appMetrics.cpuUsage ??
    appMetrics.metrics?.cpuUsage
  );

  const memoryUsage = toFiniteNumber(
    appMetrics.memoryUsage ??
    appMetrics.ramUsage ??
    appMetrics.metrics?.memoryUsage ??
    appMetrics.metrics?.ramUsage
  );

  return {
    cpuUsage,
    memoryUsage,
  };
}

/* =========================
   SCALING DECISION
========================= */

function calculateScalingDecision({
  currentDesired,
  runningCount,
  pendingCount,
  failedCount,
  cpuUsage,
  memoryUsage,
  config,
}) {
  const result = {
    action: "stable",
    desiredCount: currentDesired,
    reason: "System stable",
    metricState: "available",
  };

  /*
   * Missing metrics must NEVER become zero.
   */

  if (
    cpuUsage === null &&
    memoryUsage === null
  ) {
    return {
      ...result,
      metricState: "unavailable",
      reason:
        "CloudWatch CPU and memory metrics are unavailable",
    };
  }

  /*
   * If ECS is already struggling to reach the
   * desired number of tasks, prioritize recovery.
   */

  if (
    runningCount < currentDesired &&
    pendingCount > 0
  ) {
    const desiredCount = clamp(
      currentDesired + 1,
      config.minTasks,
      config.maxTasks
    );

    return {
      ...result,
      action:
        desiredCount > currentDesired
          ? "scale-up"
          : "stable",
      desiredCount,
      reason:
        "ECS has pending tasks and is below desired capacity",
    };
  }

  /*
   * Failed tasks indicate instability.
   * Increase capacity conservatively rather than
   * aggressively jumping to the maximum.
   */

  if (failedCount > 0) {
    const desiredCount = clamp(
      currentDesired + 1,
      config.minTasks,
      config.maxTasks
    );

    return {
      ...result,
      action:
        desiredCount > currentDesired
          ? "scale-up"
          : "stable",
      desiredCount,
      reason:
        "ECS reports failed tasks",
    };
  }

  /*
   * EXTREME LOAD
   */

  if (
    (cpuUsage !== null &&
      cpuUsage >= config.extremeCpu) ||
    (memoryUsage !== null &&
      memoryUsage >= config.extremeMemory)
  ) {
    const desiredCount = clamp(
      Math.max(
        currentDesired + 2,
        Math.ceil(currentDesired * 1.5)
      ),
      config.minTasks,
      config.maxTasks
    );

    return {
      ...result,
      action:
        desiredCount > currentDesired
          ? "extreme-scale"
          : "stable",
      desiredCount,
      reason:
        "Extreme ECS resource utilization detected",
    };
  }

  /*
   * HIGH LOAD
   */

  if (
    (cpuUsage !== null &&
      cpuUsage >= config.highCpu) ||
    (memoryUsage !== null &&
      memoryUsage >= config.highMemory)
  ) {
    const desiredCount = clamp(
      Math.max(
        currentDesired + 1,
        Math.ceil(currentDesired * 1.25)
      ),
      config.minTasks,
      config.maxTasks
    );

    return {
      ...result,
      action:
        desiredCount > currentDesired
          ? "high-scale"
          : "stable",
      desiredCount,
      reason:
        "High ECS resource utilization detected",
    };
  }

  /*
   * NORMAL SCALE-UP
   */

  if (
    (cpuUsage !== null &&
      cpuUsage >= config.scaleUpCpu) ||
    (memoryUsage !== null &&
      memoryUsage >= config.scaleUpMemory)
  ) {
    const desiredCount = clamp(
      currentDesired + 1,
      config.minTasks,
      config.maxTasks
    );

    return {
      ...result,
      action:
        desiredCount > currentDesired
          ? "scale-up"
          : "stable",
      desiredCount,
      reason:
        "ECS resource utilization is above scale-up threshold",
    };
  }

  /*
   * SCALE-DOWN
   *
   * Only scale down when BOTH metrics are available
   * and comfortably below thresholds.
   */

  const canScaleDown =
    cpuUsage !== null &&
    memoryUsage !== null &&
    cpuUsage <= config.scaleDownCpu &&
    memoryUsage <= config.scaleDownMemory;

  if (
    canScaleDown &&
    currentDesired > config.minTasks
  ) {
    /*
     * Reduce only one task at a time.
     * This avoids sudden capacity loss.
     */

    const desiredCount = Math.max(
      config.minTasks,
      currentDesired - 1
    );

    return {
      ...result,
      action:
        desiredCount < currentDesired
          ? "scale-down"
          : "stable",
      desiredCount,
      reason:
        "Sustained low ECS resource utilization detected",
    };
  }

  return result;
}

/* =========================================================
   MAIN SCALING AGENT
========================================================= */

async function scalingAgent(appMetrics = {}) {
  try {
    /* =========================
       VALIDATION
    ========================= */

    if (
      !appMetrics ||
      typeof appMetrics !== "object"
    ) {
      return {
        success: false,
        message:
          "Scaling input must be an object",
      };
    }

    const deploymentId =
      String(
        appMetrics.deploymentId || ""
      ).trim();

    if (!deploymentId) {
      return {
        success: false,
        message:
          "Deployment ID required",
      };
    }

    const clusterName =
      resolveClusterName(appMetrics);

    if (!clusterName) {
      return {
        success: false,
        message:
          "ECS cluster name is required",
      };
    }

    const serviceName =
      resolveServiceName(appMetrics);

    if (!serviceName) {
      return {
        success: false,
        message:
          "ECS service name or project name is required",
      };
    }

    /* =========================
       CONFIG
    ========================= */

    const config =
      getScalingConfig();

    /* =========================
       REAL ECS SERVICE STATE
    ========================= */

    const serviceResult =
      await ecs.send(
        new DescribeServicesCommand({
          cluster: clusterName,
          services: [serviceName],
        })
      );

    if (
      serviceResult.failures &&
      serviceResult.failures.length > 0
    ) {
      return {
        success: false,
        message:
          "ECS service lookup failed",
        failures:
          serviceResult.failures,
      };
    }

    const service =
      serviceResult.services?.[0];

    if (!service) {
      return {
        success: false,
        message:
          "ECS service not found",
        deploymentId,
        clusterName,
        serviceName,
      };
    }

    /* =========================
       SERVICE STATUS
    ========================= */

    if (
      service.status &&
      service.status !== "ACTIVE"
    ) {
      return {
        success: false,
        message:
          "ECS service is not active",
        deploymentId,
        clusterName,
        serviceName,
        serviceStatus:
          service.status,
      };
    }

    const currentDesired =
      Math.max(
        0,
        Number(service.desiredCount || 0)
      );

    const runningCount =
      Math.max(
        0,
        Number(service.runningCount || 0)
      );

    const pendingCount =
      Math.max(
        0,
        Number(service.pendingCount || 0)
      );

    const failedCount =
      Array.isArray(
        service.events
      )
        ? service.events.filter(
            (event) =>
              String(
                event.message || ""
              )
                .toLowerCase()
                .includes("fail")
          ).length
        : 0;

    /* =========================
       REAL METRICS
    ========================= */

    const {
      cpuUsage,
      memoryUsage,
    } = extractMetrics(appMetrics);

    /* =========================
       DECISION
    ========================= */

    const decision =
      calculateScalingDecision({
        currentDesired,
        runningCount,
        pendingCount,
        failedCount,
        cpuUsage,
        memoryUsage,
        config,
      });

    /* =========================
       MISSING METRICS SAFETY
    ========================= */

    if (
      decision.metricState ===
      "unavailable"
    ) {
      return {
        success: true,

        scaling: {
          deploymentId,

          autoScaling: false,

          action: "no-action",

          currentDesired,

          desiredCount: currentDesired,

          minTasks:
            config.minTasks,

          maxTasks:
            config.maxTasks,

          scalingReason:
            decision.reason,

          metrics: {
            cpuUsage,
            memoryUsage,
          },

          ecs: {
            clusterName,
            serviceName,
            status: service.status,
            desiredCount: currentDesired,
            runningCount,
            pendingCount,
          },

          orchestration: {
            platform: "AWS ECS",
            realScaling: false,
            actionTaken: false,
          },

          updatedAt: new Date(),
        },
      };
    }

    /* =========================
       NO CHANGE REQUIRED
    ========================= */

    if (
      decision.desiredCount ===
      currentDesired
    ) {
      return {
        success: true,

        scaling: {
          deploymentId,

          autoScaling: true,

          action: "stable",

          currentDesired,

          desiredCount:
            currentDesired,

          minTasks:
            config.minTasks,

          maxTasks:
            config.maxTasks,

          scalingReason:
            decision.reason,

          metrics: {
            cpuUsage,
            memoryUsage,
          },

          ecs: {
            clusterName,
            serviceName,
            status: service.status,
            desiredCount:
              currentDesired,
            runningCount,
            pendingCount,
          },

          orchestration: {
            platform: "AWS ECS",
            realScaling: true,
            actionTaken: false,
          },

          updatedAt: new Date(),
        },
      };
    }

    /* =========================
       FINAL SAFETY CLAMP
    ========================= */

    const finalDesiredCount =
      clamp(
        decision.desiredCount,
        config.minTasks,
        config.maxTasks
      );

    /* =========================
       REAL ECS UPDATE
    ========================= */

    const updateResult =
      await ecs.send(
        new UpdateServiceCommand({
          cluster: clusterName,

          service: serviceName,

          desiredCount:
            finalDesiredCount,
        })
      );

    const updatedService =
      updateResult.service;

    /* =========================
       VERIFY RESPONSE
    ========================= */

    const actualDesiredCount =
      Number(
        updatedService?.desiredCount ??
        finalDesiredCount
      );

    /* =========================
       RETURN
    ========================= */

    return {
      success: true,

      scaling: {
        deploymentId,

        autoScaling: true,

        action: decision.action,

        previousDesired:
          currentDesired,

        desiredCount:
          actualDesiredCount,

        minTasks:
          config.minTasks,

        maxTasks:
          config.maxTasks,

        scalingReason:
          decision.reason,

        metrics: {
          cpuUsage,
          memoryUsage,
        },

        ecs: {
          clusterName,
          serviceName,

          status:
            updatedService?.status ||
            service.status,

          desiredCount:
            actualDesiredCount,

          runningCount: Number(
            updatedService?.runningCount ??
            runningCount
          ),

          pendingCount: Number(
            updatedService?.pendingCount ??
            pendingCount
          ),

          serviceArn:
            updatedService?.serviceArn ||
            service.serviceArn ||
            null,

          taskDefinition:
            updatedService?.taskDefinition ||
            service.taskDefinition ||
            null,
        },

        orchestration: {
          platform: "AWS ECS",

          realScaling: true,

          actionTaken: true,

          updateRequested: true,
        },

        updatedAt: new Date(),
      },
    };
  } catch (error) {
    /* =========================
       REAL ERROR
    ========================= */

    return {
      success: false,

      message:
        "ECS scaling operation failed",

      error:
        error?.message ||
        "Unknown AWS ECS scaling error",
    };
  }
}

/* =========================
   EXPORT
========================= */

module.exports =
  scalingAgent;
