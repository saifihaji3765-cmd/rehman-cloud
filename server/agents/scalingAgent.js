/* =========================================================
   ZyrionOS SCALING AGENT
   Production AWS ECS Scaling Controller

   RESPONSIBILITY:

   Monitoring Agent
        ↓
   Real ECS State
        ↓
   Real CPU / Memory Metrics
        ↓
   Scaling Decision
        ↓
   Safety Validation
        ↓
   ECS Desired Count Update
        ↓
   AWS Response Verification
        ↓
   Scaling Result

   IMPORTANT:

   - Missing metrics NEVER become zero.
   - This agent NEVER invents ECS state.
   - Scale-down requires BOTH CPU and memory metrics.
   - Failed deployments are NOT blindly scaled.
   - Scaling is bounded by min/max task limits.
   - One scaling request changes capacity conservatively.
   - Existing deployment stabilization is respected.
========================================================= */


/* =========================================================
   AWS ECS
========================================================= */

const {
  UpdateServiceCommand,
  DescribeServicesCommand,
} =
  require("@aws-sdk/client-ecs");


/* =========================================================
   AWS CLIENT
========================================================= */

const {
  ecs,
} =
  require("../config/aws");


/* =========================================================
   LOGGER
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   ENVIRONMENT
========================================================= */

const AWS_REGION =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "ap-south-1";


/* =========================================================
   HELPERS
========================================================= */

function toFiniteNumber(
  value
) {

  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {

    return value;

  }


  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : null;

}


/* =========================================================
   INTEGER ENV
========================================================= */

function getEnvInteger(
  name,
  fallback
) {

  const value =
    Number(
      process.env[name]
    );


  if (
    !Number.isFinite(value)
  ) {

    return fallback;

  }


  return Math.floor(value);

}


/* =========================================================
   BOOLEAN ENV
========================================================= */

function getEnvBoolean(
  name,
  fallback
) {

  const value =
    process.env[name];


  if (
    value === undefined ||
    value === null
  ) {

    return fallback;

  }


  return [
    "true",
    "1",
    "yes",
    "on"
  ].includes(
    String(value)
      .trim()
      .toLowerCase()
  );

}


/* =========================================================
   CLAMP
========================================================= */

function clamp(
  value,
  min,
  max
) {

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
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
    .slice(
      0,
      maxLength
    );

}


/* =========================================================
   PROJECT NAME
========================================================= */

function normalizeProjectName(
  value
) {

  const project =
    cleanString(
      value,
      100
    );


  if (
    !project
  ) {

    return null;

  }


  const normalized =
    project
      .toLowerCase()
      .replace(
        /[^a-z0-9-]+/g,
        "-"
      )
      .replace(
        /-{2,}/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );


  return (
    normalized ||
    null
  );

}


/* =========================================================
   DEPLOYMENT ID
========================================================= */

function normalizeDeploymentId(
  value
) {

  const deploymentId =
    cleanString(
      value,
      100
    );


  if (
    !deploymentId
  ) {

    return null;

  }


  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      deploymentId
    )
  ) {

    return null;

  }


  return deploymentId;

}


/* =========================================================
   CONFIGURATION
========================================================= */

function getScalingConfig() {

  const minTasks =
    Math.max(
      1,
      getEnvInteger(
        "ECS_MIN_TASKS",
        1
      )
    );


  const configuredMax =
    getEnvInteger(
      "ECS_MAX_TASKS",
      10
    );


  const maxTasks =
    Math.max(
      minTasks,
      configuredMax
    );


  return {

    minTasks,

    maxTasks,


    /* =========================
       SCALE-UP
    ========================= */

    scaleUpCpu:
      getEnvInteger(
        "ECS_SCALE_UP_CPU",
        70
      ),

    scaleUpMemory:
      getEnvInteger(
        "ECS_SCALE_UP_MEMORY",
        75
      ),


    /* =========================
       HIGH LOAD
    ========================= */

    highCpu:
      getEnvInteger(
        "ECS_HIGH_CPU",
        85
      ),

    highMemory:
      getEnvInteger(
        "ECS_HIGH_MEMORY",
        85
      ),


    /* =========================
       EXTREME LOAD
    ========================= */

    extremeCpu:
      getEnvInteger(
        "ECS_EXTREME_CPU",
        95
      ),

    extremeMemory:
      getEnvInteger(
        "ECS_EXTREME_MEMORY",
        95
      ),


    /* =========================
       SCALE DOWN
    ========================= */

    scaleDownCpu:
      getEnvInteger(
        "ECS_SCALE_DOWN_CPU",
        25
      ),

    scaleDownMemory:
      getEnvInteger(
        "ECS_SCALE_DOWN_MEMORY",
        30
      ),


    /* =========================
       DEPLOYMENT SAFETY
    ========================= */

    allowScaleDuringDeployment:
      getEnvBoolean(
        "ECS_ALLOW_SCALE_DURING_DEPLOYMENT",
        false
      ),


    /* =========================
       SCALE-UP LIMIT
    ========================= */

    maxScaleUpStep:
      Math.max(
        1,
        getEnvInteger(
          "ECS_MAX_SCALE_UP_STEP",
          2
        )
      ),


    /* =========================
       SCALE-DOWN LIMIT
    ========================= */

    maxScaleDownStep:
      Math.max(
        1,
        getEnvInteger(
          "ECS_MAX_SCALE_DOWN_STEP",
          1
        )
      )

  };

}


/* =========================================================
   RESOLVE CLUSTER
========================================================= */

function resolveClusterName(
  appMetrics
) {

  const cluster =
    appMetrics.clusterName ||
    appMetrics.cluster ||
    appMetrics.aws?.ecs?.cluster ||
    appMetrics.aws?.ecs?.clusterName ||
    process.env.AWS_ECS_CLUSTER ||
    process.env.AWS_ECS_CLUSTER_NAME ||
    process.env.ECS_CLUSTER ||
    "";


  return cleanString(
    cluster,
    255
  );

}


/* =========================================================
   RESOLVE SERVICE
========================================================= */

function resolveServiceName(
  appMetrics
) {

  if (
    appMetrics.serviceName
  ) {

    return cleanString(
      appMetrics.serviceName,
      255
    );

  }


  if (
    typeof appMetrics.service ===
      "string"
  ) {

    return cleanString(
      appMetrics.service,
      255
    );

  }


  if (
    typeof appMetrics.aws?.ecs?.service ===
      "string"
  ) {

    return cleanString(
      appMetrics.aws.ecs.service,
      255
    );

  }


  if (
    typeof appMetrics.aws?.ecs?.serviceName ===
      "string"
  ) {

    return cleanString(
      appMetrics.aws.ecs.serviceName,
      255
    );

  }


  const deploymentId =
    normalizeDeploymentId(
      appMetrics.deploymentId
    );


  const projectName =
    normalizeProjectName(

      appMetrics.projectName ||
      appMetrics.appName ||
      appMetrics.planning?.projectName

    );


  if (
    projectName &&
    deploymentId
  ) {

    return `${projectName}-${deploymentId}-service`;

  }


  return "";

}


/* =========================================================
   EXTRACT METRICS
========================================================= */

function extractMetrics(
  appMetrics
) {

  const cpuUsage =
    toFiniteNumber(

      appMetrics.cpuUsage ??
      appMetrics.metrics?.cpuUsage

    );


  const memoryUsage =
    toFiniteNumber(

      appMetrics.memoryUsage ??
      appMetrics.ramUsage ??
      appMetrics.metrics?.memoryUsage ??
      appMetrics.metrics?.ramUsage

    );


  return {

    cpuUsage,

    memoryUsage,

    cpuAvailable:
      cpuUsage !== null,

    memoryAvailable:
      memoryUsage !== null

  };

}


/* =========================================================
   EXTRACT MONITORING RECOMMENDATION
========================================================= */

function extractMonitoringRecommendation(
  appMetrics
) {

  const recommendation =
    appMetrics.scalingRecommendation ||
    appMetrics.monitoring?.scalingRecommendation ||
    null;


  if (
    !recommendation ||
    typeof recommendation !==
      "object"
  ) {

    return null;

  }


  return {

    action:
      cleanString(
        recommendation.action,
        100
      ) ||
      null,

    priority:
      cleanString(
        recommendation.priority,
        50
      ) ||
      null,

    reason:
      cleanString(
        recommendation.reason,
        500
      ) ||
      null

  };

}


/* =========================================================
   DEPLOYMENT STATE
========================================================= */

function getDeploymentState(
  service,
  appMetrics
) {

  const monitoringDeployment =
    appMetrics.deployment ||
    appMetrics.monitoring?.deployment ||
    {};


  const rolloutState =
    service.rolloutState ||
    monitoringDeployment.rolloutState ||
    null;


  const rolloutStateReason =
    service.rolloutStateReason ||
    monitoringDeployment.rolloutStateReason ||
    null;


  const deploymentFailed =
    Boolean(

      service.rolloutState ===
        "FAILED" ||

      monitoringDeployment.deploymentFailure ===
        true ||

      monitoringDeployment.deploymentFailed ===
        true ||

      monitoringDeployment.rolloutFailed ===
        true ||

      (
        rolloutStateReason &&
        /fail|rollback|circuit/i.test(
          rolloutStateReason
        )
      )

    );


  const deploymentInProgress =
    Boolean(

      rolloutState ===
        "IN_PROGRESS" ||

      rolloutState ===
        "PENDING" ||

      monitoringDeployment.inProgress ===
        true

    );


  return {

    rolloutState,

    rolloutStateReason,

    deploymentFailed,

    deploymentInProgress

  };

}


/* =========================================================
   ECS FAILED TASK DETECTION
========================================================= */

function countFailedTaskEvents(
  service
) {

  if (
    !Array.isArray(
      service?.events
    )
  ) {

    return 0;

  }


  return service.events.filter(
    (event) => {

      const message =
        String(
          event?.message ||
          ""
        )
          .toLowerCase();


      return (
        /failed|failure|unable|cannot|rollback|circuit breaker/
          .test(
            message
          )
      );

    }
  ).length;

}


/* =========================================================
   SCALING DECISION
========================================================= */

function calculateScalingDecision({
  currentDesired,
  runningCount,
  pendingCount,
  failedCount,
  cpuUsage,
  memoryUsage,
  deploymentState,
  monitoringRecommendation,
  config
}) {

  const baseResult = {

    action:
      "stable",

    desiredCount:
      currentDesired,

    reason:
      "System stable",

    metricState:
      "available",

    priority:
      "low"

  };


  /* =======================================================
     NO METRICS
  ======================================================= */

  if (
    cpuUsage === null &&
    memoryUsage === null
  ) {

    return {

      ...baseResult,

      action:
        "no-action",

      metricState:
        "unavailable",

      reason:
        "CloudWatch CPU and memory metrics are unavailable",

      priority:
        "low"

    };

  }


  /* =======================================================
     FAILED DEPLOYMENT
  ======================================================= */

  if (
    deploymentState.deploymentFailed
  ) {

    return {

      ...baseResult,

      action:
        "investigate",

      reason:
        "ECS deployment or rollout failure detected",

      priority:
        "critical"

    };

  }


  /* =======================================================
     DEPLOYMENT IN PROGRESS
  ======================================================= */

  if (
    deploymentState.deploymentInProgress &&
    !config.allowScaleDuringDeployment
  ) {

    return {

      ...baseResult,

      action:
        "stabilize",

      reason:
        "ECS deployment is in progress; scaling is temporarily protected",

      priority:
        "medium"

    };

  }


  /* =======================================================
     ECS BELOW DESIRED CAPACITY
  ======================================================= */

  if (
    runningCount <
      currentDesired &&
    pendingCount > 0
  ) {

    const desiredCount =
      clamp(

        currentDesired + 1,

        config.minTasks,

        config.maxTasks

      );


    return {

      ...baseResult,

      action:
        desiredCount >
        currentDesired
          ? "scale-up"
          : "stable",

      desiredCount,

      reason:
        "ECS has pending tasks and is below desired capacity",

      priority:
        "high"

    };

  }


  /* =======================================================
     FAILED TASKS
  ======================================================= */

  if (
    failedCount > 0
  ) {

    const desiredCount =
      clamp(

        currentDesired + 1,

        config.minTasks,

        config.maxTasks

      );


    return {

      ...baseResult,

      action:
        desiredCount >
        currentDesired
          ? "scale-up"
          : "stable",

      desiredCount,

      reason:
        "Recent ECS task failure events detected",

      priority:
        "high"

    };

  }


  /* =======================================================
     EXTREME LOAD
  ======================================================= */

  if (

    (
      cpuUsage !== null &&
      cpuUsage >=
        config.extremeCpu
    ) ||

    (
      memoryUsage !== null &&
      memoryUsage >=
        config.extremeMemory
    )

  ) {

    const calculated =
      Math.max(

        currentDesired + 2,

        Math.ceil(
          currentDesired * 1.5
        )

      );


    const desiredCount =
      clamp(

        Math.min(

          calculated,

          currentDesired +
            config.maxScaleUpStep

        ),

        config.minTasks,

        config.maxTasks

      );


    return {

      ...baseResult,

      action:
        desiredCount >
        currentDesired
          ? "extreme-scale"
          : "stable",

      desiredCount,

      reason:
        "Extreme ECS resource utilization detected",

      priority:
        "critical"

    };

  }


  /* =======================================================
     HIGH LOAD
  ======================================================= */

  if (

    (
      cpuUsage !== null &&
      cpuUsage >=
        config.highCpu
    ) ||

    (
      memoryUsage !== null &&
      memoryUsage >=
        config.highMemory
    )

  ) {

    const calculated =
      Math.max(

        currentDesired + 1,

        Math.ceil(
          currentDesired * 1.25
        )

      );


    const desiredCount =
      clamp(

        Math.min(

          calculated,

          currentDesired +
            config.maxScaleUpStep

        ),

        config.minTasks,

        config.maxTasks

      );


    return {

      ...baseResult,

      action:
        desiredCount >
        currentDesired
          ? "high-scale"
          : "stable",

      desiredCount,

      reason:
        "High ECS resource utilization detected",

      priority:
        "high"

    };

  }


  /* =======================================================
     NORMAL SCALE-UP
  ======================================================= */

  if (

    (
      cpuUsage !== null &&
      cpuUsage >=
        config.scaleUpCpu
    ) ||

    (
      memoryUsage !== null &&
      memoryUsage >=
        config.scaleUpMemory
    )

  ) {

    const desiredCount =
      clamp(

        currentDesired + 1,

        config.minTasks,

        Math.min(

          config.maxTasks,

          currentDesired +
            config.maxScaleUpStep

        )

      );


    return {

      ...baseResult,

      action:
        desiredCount >
        currentDesired
          ? "scale-up"
          : "stable",

      desiredCount,

      reason:
        "ECS resource utilization is above scale-up threshold",

      priority:
        "medium"

    };

  }


  /* =======================================================
     SCALE-DOWN
  ======================================================= */

  const canScaleDown =

    cpuUsage !== null &&

    memoryUsage !== null &&

    cpuUsage <=
      config.scaleDownCpu &&

    memoryUsage <=
      config.scaleDownMemory;


  if (
    canScaleDown &&
    currentDesired >
      config.minTasks
  ) {

    const desiredCount =
      Math.max(

        config.minTasks,

        currentDesired -
          config.maxScaleDownStep

      );


    return {

      ...baseResult,

      action:
        desiredCount <
        currentDesired
          ? "scale-down"
          : "stable",

      desiredCount,

      reason:
        "Both CPU and memory utilization are comfortably low",

      priority:
        "low"

    };

  }


  /* =======================================================
     MONITORING RECOMMENDATION
  ======================================================= */

  if (
    monitoringRecommendation
  ) {

    const action =
      monitoringRecommendation.action;


    if (
      action ===
        "investigate"
    ) {

      return {

        ...baseResult,

        action:
          "investigate",

        reason:
          monitoringRecommendation.reason ||
          "Monitoring Agent requested investigation",

        priority:
          monitoringRecommendation.priority ||
          "medium"

      };

    }


    if (
      action ===
        "stabilize"
    ) {

      return {

        ...baseResult,

        action:
          "stabilize",

        reason:
          monitoringRecommendation.reason ||
          "Monitoring Agent requested stabilization",

        priority:
          monitoringRecommendation.priority ||
          "medium"

      };

    }

  }


  return baseResult;

}


/* =========================================================
   AWS ERROR CLASSIFICATION
========================================================= */

function classifyAwsError(
  error
) {

  const name =
    String(
      error?.name ||
      ""
    );


  const message =
    String(
      error?.message ||
      ""
    );


  const statusCode =
    error?.$metadata?.httpStatusCode ||
    null;


  const combined =
    `${name} ${message}`;


  if (
    /AccessDenied|Unauthorized|UnrecognizedClient|InvalidClientToken/
      .test(
        combined
      )
  ) {

    return "AUTHORIZATION";

  }


  if (
    /ResourceNotFound|ClusterNotFound|ServiceNotFound/
      .test(
        combined
      )
  ) {

    return "RESOURCE_NOT_FOUND";

  }


  if (
    /Throttl|TooManyRequests/
      .test(
        combined
      )
  ) {

    return "THROTTLED";

  }


  if (
    statusCode >= 500 ||
    /Timeout|timed out|NetworkingError|ECONNRESET|socket/
      .test(
        combined
      )
  ) {

    return "TEMPORARY";

  }


  if (
    /InvalidParameter|ValidationException|ValidationError/
      .test(
        combined
      )
  ) {

    return "INVALID_REQUEST";

  }


  return "UNKNOWN";

}


/* =========================================================
   BUILD RESULT
========================================================= */

function buildScalingResult({
  deploymentId,
  clusterName,
  serviceName,
  service,
  config,
  decision,
  metrics,
  actionTaken,
  previousDesired,
  actualDesired,
  error = null
}) {

  return {

    deploymentId,

    clusterName,

    serviceName,

    region:
      AWS_REGION,

    action:
      decision.action,

    actionTaken,

    previousDesired,

    desiredCount:
      actualDesired,

    minTasks:
      config.minTasks,

    maxTasks:
      config.maxTasks,

    reason:
      decision.reason,

    priority:
      decision.priority,

    metrics,

    ecs: {

      status:
        service?.status ||
        null,

      desiredCount:
        actualDesired,

      runningCount:
        toFiniteNumber(
          service?.runningCount
        ) ?? 0,

      pendingCount:
        toFiniteNumber(
          service?.pendingCount
        ) ?? 0,

      serviceArn:
        service?.serviceArn ||
        null,

      taskDefinition:
        service?.taskDefinition ||
        null

    },

    orchestration: {

      platform:
        "AWS ECS",

      realScaling:
        actionTaken,

      updateRequested:
        actionTaken,

      verified:
        Boolean(
          actionTaken &&
          actualDesired ===
            decision.desiredCount
        )

    },

    error:
      error || null,

    updatedAt:
      new Date().toISOString()

  };

}


/* =========================================================
   MAIN SCALING AGENT
========================================================= */

async function scalingAgent(
  appMetrics = {}
) {

  let deploymentId =
    null;


  let clusterName =
    null;


  let serviceName =
    null;


  let currentStage =
    "request-validation";


  try {

    logger.info(
      "📈 ZyrionOS Scaling Agent Started"
    );


    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    if (
      !appMetrics ||
      typeof appMetrics !==
        "object" ||
      Array.isArray(
        appMetrics
      )
    ) {

      return {

        success:
          false,

        message:
          "Scaling input must be an object",

        stage:
          currentStage

      };

    }


    deploymentId =
      normalizeDeploymentId(
        appMetrics.deploymentId
      );


    if (
      !deploymentId
    ) {

      return {

        success:
          false,

        message:
          "Valid deployment ID required",

        stage:
          currentStage

      };

    }


    /* =====================================================
       CLUSTER
    ===================================================== */

    currentStage =
      "cluster-resolution";


    clusterName =
      resolveClusterName(
        appMetrics
      );


    if (
      !clusterName
    ) {

      return {

        success:
          false,

        message:
          "ECS cluster name is required",

        stage:
          currentStage,

        deploymentId

      };

    }


    /* =====================================================
       SERVICE
    ===================================================== */

    currentStage =
      "service-resolution";


    serviceName =
      resolveServiceName(
        appMetrics
      );


    if (
      !serviceName
    ) {

      return {

        success:
          false,

        message:
          "ECS service name or project name is required",

        stage:
          currentStage,

        deploymentId,

        clusterName

      };

    }


    /* =====================================================
       CONFIG
    ===================================================== */

    currentStage =
      "configuration";


    const config =
      getScalingConfig();


    /* =====================================================
       REAL ECS STATE
    ===================================================== */

    currentStage =
      "ecs-service-state";


    const serviceResult =
      await ecs.send(

        new DescribeServicesCommand({

          cluster:
            clusterName,

          services: [

            serviceName

          ]

        })

      );


    /* =====================================================
       ECS FAILURES
    ===================================================== */

    if (
      Array.isArray(
        serviceResult?.failures
      ) &&
      serviceResult.failures.length >
        0
    ) {

      return {

        success:
          false,

        message:
          "ECS service lookup failed",

        errorType:
          "RESOURCE_NOT_FOUND",

        failures:
          serviceResult.failures,

        stage:
          currentStage,

        deploymentId,

        clusterName,

        serviceName

      };

    }


    /* =====================================================
       SERVICE
    ===================================================== */

    const service =
      serviceResult
        ?.services?.[0];


    if (
      !service
    ) {

      return {

        success:
          false,

        message:
          "ECS service not found",

        errorType:
          "RESOURCE_NOT_FOUND",

        stage:
          currentStage,

        deploymentId,

        clusterName,

        serviceName

      };

    }


    /* =====================================================
       SERVICE STATUS
    ===================================================== */

    if (
      service.status &&
      service.status !==
        "ACTIVE"
    ) {

      return {

        success:
          false,

        message:
          "ECS service is not active",

        stage:
          currentStage,

        deploymentId,

        clusterName,

        serviceName,

        serviceStatus:
          service.status

      };

    }


    /* =====================================================
       CURRENT CAPACITY
    ===================================================== */

    const currentDesired =
      Math.max(

        0,

        toFiniteNumber(
          service.desiredCount
        ) ?? 0

      );


    const runningCount =
      Math.max(

        0,

        toFiniteNumber(
          service.runningCount
        ) ?? 0

      );


    const pendingCount =
      Math.max(

        0,

        toFiniteNumber(
          service.pendingCount
        ) ?? 0

      );


    const failedCount =
      countFailedTaskEvents(
        service
      );


    /* =====================================================
       METRICS
    ===================================================== */

    currentStage =
      "metric-analysis";


    const metrics =
      extractMetrics(
        appMetrics
      );


    /* =====================================================
       MONITORING RECOMMENDATION
    ===================================================== */

    const monitoringRecommendation =
      extractMonitoringRecommendation(
        appMetrics
      );


    /* =====================================================
       DEPLOYMENT STATE
    ===================================================== */

    currentStage =
      "deployment-safety";


    const deploymentState =
      getDeploymentState(

        service,

        appMetrics

      );


    /* =====================================================
       SCALING DECISION
    ===================================================== */

    currentStage =
      "scaling-decision";


    const decision =
      calculateScalingDecision({

        currentDesired,

        runningCount,

        pendingCount,

        failedCount,

        cpuUsage:
          metrics.cpuUsage,

        memoryUsage:
          metrics.memoryUsage,

        deploymentState,

        monitoringRecommendation,

        config

      });


    /* =====================================================
       METRIC UNAVAILABLE
    ===================================================== */

    if (
      decision.metricState ===
      "unavailable"
    ) {

      logger.warn(
        `📈 Scaling skipped: CloudWatch metrics unavailable for ${serviceName}`
      );


      const scaling =
        buildScalingResult({

          deploymentId,

          clusterName,

          serviceName,

          service,

          config,

          decision,

          metrics,

          actionTaken:
            false,

          previousDesired:
            currentDesired,

          actualDesired:
            currentDesired

        });


      return {

        success:
          true,

        scaling,

        reason:
          decision.reason

      };

    }


    /* =====================================================
       INVESTIGATION REQUIRED
    ===================================================== */

    if (
      decision.action ===
      "investigate"
    ) {

      logger.warn(
        `📈 Scaling blocked: ${decision.reason}`
      );


      const scaling =
        buildScalingResult({

          deploymentId,

          clusterName,

          serviceName,

          service,

          config,

          decision,

          metrics,

          actionTaken:
            false,

          previousDesired:
            currentDesired,

          actualDesired:
            currentDesired

        });


      return {

        success:
          true,

        scaling,

        reason:
          decision.reason

      };

    }


    /* =====================================================
       STABILIZATION
    ===================================================== */

    if (
      decision.action ===
      "stabilize"
    ) {

      logger.info(
        `📈 Scaling stabilization: ${decision.reason}`
      );


      const scaling =
        buildScalingResult({

          deploymentId,

          clusterName,

          serviceName,

          service,

          config,

          decision,

          metrics,

          actionTaken:
            false,

          previousDesired:
            currentDesired,

          actualDesired:
            currentDesired

        });


      return {

        success:
          true,

        scaling,

        reason:
          decision.reason

      };

    }


    /* =====================================================
       NO CHANGE
    ===================================================== */

    if (
      decision.desiredCount ===
      currentDesired
    ) {

      logger.info(
        `📈 Scaling stable: ${serviceName} | desired=${currentDesired}`
      );


      const scaling =
        buildScalingResult({

          deploymentId,

          clusterName,

          serviceName,

          service,

          config,

          decision,

          metrics,

          actionTaken:
            false,

          previousDesired:
            currentDesired,

          actualDesired:
            currentDesired

        });


      return {

        success:
          true,

        scaling,

        reason:
          decision.reason

      };

    }


    /* =====================================================
       FINAL SAFETY VALIDATION
    ===================================================== */

    currentStage =
      "scaling-safety-check";


    const finalDesiredCount =
      clamp(

        decision.desiredCount,

        config.minTasks,

        config.maxTasks

      );


    if (
      finalDesiredCount ===
      currentDesired
    ) {

      const scaling =
        buildScalingResult({

          deploymentId,

          clusterName,

          serviceName,

          service,

          config,

          decision,

          metrics,

          actionTaken:
            false,

          previousDesired:
            currentDesired,

          actualDesired:
            currentDesired

        });


      return {

        success:
          true,

        scaling,

        reason:
          "Safety limits prevented a capacity change"

      };

    }


    /* =====================================================
       PREVENT SCALE-DOWN DURING UNSTABLE SERVICE
    ===================================================== */

    if (
      finalDesiredCount <
        currentDesired &&
      (
        runningCount <
          currentDesired ||
        pendingCount > 0 ||
        failedCount > 0
      )
    ) {

      const blockedDecision = {

        ...decision,

        action:
          "stabilize",

        desiredCount:
          currentDesired,

        reason:
          "Scale-down blocked because ECS service is not stable",

        priority:
          "high"

      };


      const scaling =
        buildScalingResult({

          deploymentId,

          clusterName,

          serviceName,

          service,

          config,

          decision:
            blockedDecision,

          metrics,

          actionTaken:
            false,

          previousDesired:
            currentDesired,

          actualDesired:
            currentDesired

        });


      return {

        success:
          true,

        scaling,

        reason:
          blockedDecision.reason

      };

    }


    /* =====================================================
       REAL ECS UPDATE
    ===================================================== */

    currentStage =
      "ecs-scale-update";


    logger.info(

      `📈 ECS scaling request: ${serviceName} ${currentDesired} → ${finalDesiredCount}`

    );


    const updateResult =
      await ecs.send(

        new UpdateServiceCommand({

          cluster:
            clusterName,

          service:
            serviceName,

          desiredCount:
            finalDesiredCount

        })

      );


    /* =====================================================
       AWS RESPONSE VERIFICATION
    ===================================================== */

    const updatedService =
      updateResult?.service;


    if (
      !updatedService
    ) {

      return {

        success:
          false,

        message:
          "ECS scaling request returned no service state",

        errorType:
          "UNKNOWN",

        stage:
          currentStage,

        deploymentId,

        clusterName,

        serviceName

      };

    }


    const actualDesired =
      toFiniteNumber(
        updatedService.desiredCount
      );


    if (
      actualDesired === null
    ) {

      return {

        success:
          false,

        message:
          "ECS scaling response did not contain desired task count",

        errorType:
          "UNKNOWN",

        stage:
          currentStage,

        deploymentId,

        clusterName,

        serviceName

      };

    }


    /* =====================================================
       VERIFY DESIRED COUNT
    ===================================================== */

    if (
      actualDesired !==
      finalDesiredCount
    ) {

      logger.warn(

        `📈 ECS scaling response differs: requested=${finalDesiredCount}, returned=${actualDesired}`

      );

    }


    /* =====================================================
       BUILD RESULT
    ===================================================== */

    const scaling =
      buildScalingResult({

        deploymentId,

        clusterName,

        serviceName,

        service:
          updatedService,

        config,

        decision: {

          ...decision,

          desiredCount:
            finalDesiredCount

        },

        metrics,

        actionTaken:
          true,

        previousDesired:
          currentDesired,

        actualDesired

      });


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(

      `📈 Scaling Completed: ${serviceName} | ${currentDesired} → ${actualDesired}`

    );


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        true,

      scaling,

      reason:
        decision.reason

    };

  }

  catch (error) {

    const errorType =
      classifyAwsError(
        error
      );


    logger.error(

      `Scaling Agent Failed at ${currentStage}: ${error?.message || "Unknown AWS scaling error"}`

    );


    return {

      success:
        false,

      message:
        "ECS scaling operation failed",

      error:
        error?.message ||
        "Unknown AWS ECS scaling error",

      errorType,

      stage:
        currentStage,

      deploymentId,

      clusterName,

      serviceName

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  scalingAgent;
