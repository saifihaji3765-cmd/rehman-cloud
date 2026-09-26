/* =========================================================
   ZyrionOS MONITORING AGENT
   Production AWS ECS + CloudWatch Monitoring

   FLOW:

   ECS Service
       ↓
   Describe ECS Service
       ↓
   ECS Deployment Health
       ↓
   CloudWatch CPU
       ↓
   CloudWatch Memory
       ↓
   Health Analysis
       ↓
   Alerts
       ↓
   Scaling Recommendation
       ↓
   Monitoring Result

   IMPORTANT:

   AWS ECS / CloudWatch are the source of truth.

   Missing CloudWatch metrics are NEVER converted
   into fake 0% usage.

   This agent does NOT mutate infrastructure.

   It observes infrastructure and produces:
     - health state
     - metrics
     - alerts
     - deployment health
     - scaling recommendation
========================================================= */


/* =========================================================
   AWS CLOUDWATCH
========================================================= */

const {
  GetMetricStatisticsCommand
} = require("@aws-sdk/client-cloudwatch");


/* =========================================================
   AWS ECS
========================================================= */

const {
  DescribeServicesCommand
} = require("@aws-sdk/client-ecs");


/* =========================================================
   AWS CLIENTS
========================================================= */

const {
  cloudwatch,
  ecs
} = require("../config/aws");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   CONFIGURATION
========================================================= */

const AWS_REGION =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "ap-south-1";


const ECS_CLUSTER =
  process.env.AWS_ECS_CLUSTER ||
  process.env.AWS_ECS_CLUSTER_NAME ||
  "";


/* =========================================================
   MONITORING WINDOW
========================================================= */

const MONITORING_WINDOW_MINUTES =
  Number(
    process.env.MONITORING_WINDOW_MINUTES ||
    15
  );


const METRIC_PERIOD_SECONDS =
  Number(
    process.env.MONITORING_METRIC_PERIOD_SECONDS ||
    300
  );


/* =========================================================
   THRESHOLDS
========================================================= */

const CPU_WARNING =
  Number(
    process.env.MONITORING_CPU_WARNING ||
    75
  );


const CPU_HIGH =
  Number(
    process.env.MONITORING_CPU_HIGH ||
    85
  );


const CPU_CRITICAL =
  Number(
    process.env.MONITORING_CPU_CRITICAL ||
    95
  );


const MEMORY_WARNING =
  Number(
    process.env.MONITORING_MEMORY_WARNING ||
    75
  );


const MEMORY_HIGH =
  Number(
    process.env.MONITORING_MEMORY_HIGH ||
    85
  );


const MEMORY_CRITICAL =
  Number(
    process.env.MONITORING_MEMORY_CRITICAL ||
    95
  );


/* =========================================================
   SCALE-DOWN THRESHOLDS
========================================================= */

const CPU_SCALE_DOWN =
  Number(
    process.env.MONITORING_CPU_SCALE_DOWN ||
    25
  );


const MEMORY_SCALE_DOWN =
  Number(
    process.env.MONITORING_MEMORY_SCALE_DOWN ||
    35
  );


/* =========================================================
   HEALTH SCORE SETTINGS
========================================================= */

const HEALTH_SCORE_MIN =
  0;


const HEALTH_SCORE_MAX =
  100;


/* =========================================================
   SAFE STRING
========================================================= */

function cleanString(
  value,
  maxLength = 1000
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
   SAFE NUMBER
========================================================= */

function safeNumber(
  value,
  fallback = null
) {

  if (
    typeof value ===
    "number" &&
    Number.isFinite(value)
  ) {

    return value;

  }


  const parsed =
    Number(value);


  if (
    Number.isFinite(parsed)
  ) {

    return parsed;

  }


  return fallback;

}


/* =========================================================
   ROUND NUMBER
========================================================= */

function roundNumber(
  value,
  decimals = 2
) {

  if (
    typeof value !==
      "number" ||
    !Number.isFinite(value)
  ) {

    return null;

  }


  return Number(
    value.toFixed(decimals)
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

    throw new Error(
      "Deployment ID required"
    );

  }


  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      deploymentId
    )
  ) {

    throw new Error(
      "Invalid deployment ID"
    );

  }


  return deploymentId;

}


/* =========================================================
   PROJECT NAME
========================================================= */

function normalizeProjectName(
  value
) {

  const projectName =
    cleanString(
      value,
      100
    );


  if (
    !projectName
  ) {

    return "";

  }


  return projectName
    .toLowerCase()
    .replace(
      /[^a-z0-9-]+/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );

}


/* =========================================================
   SERVICE NAME
========================================================= */

/*
 * Must match AWS Agent naming:
 *
 * ${projectName}-${deploymentId}-service
 */

function createServiceName(
  projectName,
  deploymentId
) {

  const cleanProject =
    normalizeProjectName(
      projectName
    );


  if (
    !cleanProject
  ) {

    return "";

  }


  const cleanDeployment =
    deploymentId
      .toLowerCase()
      .replace(
        /[^a-z0-9-]/g,
        "-"
      );


  return `${cleanProject}-${cleanDeployment}-service`
    .slice(
      0,
      255
    );

}


/* =========================================================
   RESOLVE SERVICE NAME
========================================================= */

function resolveServiceName(
  appData,
  deploymentId
) {

  /*
   * Preferred explicit value.
   */

  if (
    typeof appData.serviceName ===
      "string" &&
    appData.serviceName.trim()
  ) {

    return cleanString(
      appData.serviceName,
      255
    );

  }


  /*
   * AWS Agent output.
   */

  if (
    typeof appData.aws?.ecs?.service ===
      "string" &&
    appData.aws.ecs.service.trim()
  ) {

    return cleanString(
      appData.aws.ecs.service,
      255
    );

  }


  /*
   * Alternative AWS response shape.
   */

  if (
    typeof appData.aws?.ecs?.serviceName ===
      "string" &&
    appData.aws.ecs.serviceName.trim()
  ) {

    return cleanString(
      appData.aws.ecs.serviceName,
      255
    );

  }


  /*
   * Project information.
   */

  const projectName =
    appData.projectName ||
    appData.planning?.projectName ||
    appData.aws?.projectName ||
    "";


  return createServiceName(
    projectName,
    deploymentId
  );

}


/* =========================================================
   RESOLVE CLUSTER
========================================================= */

function resolveClusterName(
  appData
) {

  if (
    typeof appData.clusterName ===
      "string" &&
    appData.clusterName.trim()
  ) {

    return cleanString(
      appData.clusterName,
      255
    );

  }


  if (
    typeof appData.aws?.ecs?.cluster ===
      "string" &&
    appData.aws.ecs.cluster.trim()
  ) {

    return cleanString(
      appData.aws.ecs.cluster,
      255
    );

  }


  if (
    typeof appData.aws?.ecs?.clusterName ===
      "string" &&
    appData.aws.ecs.clusterName.trim()
  ) {

    return cleanString(
      appData.aws.ecs.clusterName,
      255
    );

  }


  if (
    ECS_CLUSTER
  ) {

    return ECS_CLUSTER;

  }


  throw new Error(
    "AWS ECS cluster is not configured"
  );

}


/* =========================================================
   GET LATEST DATAPOINT
========================================================= */

function getLatestDatapoint(
  datapoints
) {

  if (
    !Array.isArray(
      datapoints
    ) ||
    datapoints.length === 0
  ) {

    return null;

  }


  const valid =
    datapoints
      .filter(
        (point) => {

          return (
            point &&
            typeof point.Average ===
              "number" &&
            Number.isFinite(
              point.Average
            )
          );

        }
      )
      .sort(
        (a, b) => {

          const timeA =
            new Date(
              a.Timestamp || 0
            ).getTime();


          const timeB =
            new Date(
              b.Timestamp || 0
            ).getTime();


          return (
            timeB -
            timeA
          );

        }
      );


  return (
    valid[0] ||
    null
  );

}


/* =========================================================
   GET MAXIMUM DATAPOINT
========================================================= */

function getMaximumDatapoint(
  datapoints
) {

  if (
    !Array.isArray(
      datapoints
    ) ||
    datapoints.length === 0
  ) {

    return null;

  }


  const valid =
    datapoints
      .filter(
        (point) => {

          return (
            point &&
            typeof point.Maximum ===
              "number" &&
            Number.isFinite(
              point.Maximum
            )
          );

        }
      )
      .sort(
        (a, b) => {

          return (
            b.Maximum -
            a.Maximum
          );

        }
      );


  return (
    valid[0] ||
    null
  );

}


/* =========================================================
   GET CLOUDWATCH METRIC
========================================================= */

async function getMetric(
  metricName,
  clusterName,
  serviceName
) {

  const endTime =
    new Date();


  const startTime =
    new Date(

      endTime.getTime() -
      (
        MONITORING_WINDOW_MINUTES *
        60 *
        1000
      )

    );


  const response =
    await cloudwatch.send(

      new GetMetricStatisticsCommand({

        Namespace:
          "AWS/ECS",

        MetricName:
          metricName,

        Dimensions: [

          {

            Name:
              "ClusterName",

            Value:
              clusterName

          },

          {

            Name:
              "ServiceName",

            Value:
              serviceName

          }

        ],

        StartTime:
          startTime,

        EndTime:
          endTime,

        Period:
          METRIC_PERIOD_SECONDS,

        Statistics: [

          "Average",

          "Maximum"

        ]

      })

    );


  const datapoints =
    response?.Datapoints ||
    [];


  const latest =
    getLatestDatapoint(
      datapoints
    );


  const maximum =
    getMaximumDatapoint(
      datapoints
    );


  /*
   * IMPORTANT:
   *
   * No datapoint means unavailable.
   *
   * NEVER return 0.
   */

  if (
    !latest
  ) {

    return {

      available:
        false,

      value:
        null,

      maximum:
        null,

      timestamp:
        null,

      datapoints:
        datapoints.length,

      monitoredFrom:
        startTime.toISOString(),

      monitoredTo:
        endTime.toISOString()

    };

  }


  return {

    available:
      true,

    value:
      roundNumber(
        latest.Average
      ),

    maximum:
      roundNumber(
        maximum?.Maximum ??
        latest.Maximum ??
        latest.Average
      ),

    timestamp:
      latest.Timestamp ||
      null,

    datapoints:
      datapoints.length,

    monitoredFrom:
      startTime.toISOString(),

    monitoredTo:
      endTime.toISOString()

  };

}


/* =========================================================
   BUILD ALERT
========================================================= */

function createAlert(
  type,
  severity,
  message,
  value = null,
  metadata = {}
) {

  return {

    type,

    severity,

    message,

    value:

      typeof value ===
        "number"
        ? roundNumber(value)
        : null,

    metadata:
      metadata &&
      typeof metadata === "object"
        ? metadata
        : {},

    createdAt:
      new Date().toISOString()

  };

}


/* =========================================================
   ALERT PRIORITY
========================================================= */

function getAlertPriority(
  severity
) {

  switch (
    severity
  ) {

    case "critical":
      return 4;

    case "high":
      return 3;

    case "medium":
      return 2;

    case "low":
      return 1;

    default:
      return 0;

  }

}


/* =========================================================
   SORT ALERTS
========================================================= */

function sortAlerts(
  alerts
) {

  if (
    !Array.isArray(
      alerts
    )
  ) {

    return [];

  }


  return [
    ...alerts
  ].sort(
    (a, b) => {

      return (
        getAlertPriority(
          b?.severity
        ) -
        getAlertPriority(
          a?.severity
        )
      );

    }
  );

}


/* =========================================================
   DEPLOYMENT HEALTH
========================================================= */

function analyzeDeployments(
  service
) {

  const deployments =
    Array.isArray(
      service?.deployments
    )
      ? service.deployments
      : [];


  const primary =
    deployments.find(
      (deployment) =>
        deployment?.status ===
        "PRIMARY"
    ) ||
    null;


  const activeDeployments =
    deployments.filter(
      (deployment) =>
        deployment?.status ===
        "PRIMARY" ||
        deployment?.status ===
        "ACTIVE"
    );


  const rolloutState =
    service?.rolloutState ||
    null;


  const rolloutStateReason =
    service?.rolloutStateReason ||
    null;


  const rolloutFailed =
    rolloutState ===
      "FAILED" ||
    Boolean(
      rolloutStateReason &&
      /fail|rollback|circuit/i.test(
        rolloutStateReason
      )
    );


  const deploymentFailure =
    deployments.some(
      (deployment) => {

        const rollout =
          deployment?.rolloutState;


        const reason =
          deployment?.rolloutStateReason;


        return (
          rollout ===
            "FAILED" ||
          (
            reason &&
            /fail|rollback|circuit/i.test(
              reason
            )
          )
        );

      }
    );


  return {

    available:
      deployments.length > 0,

    count:
      deployments.length,

    activeCount:
      activeDeployments.length,

    primary: primary
      ? {

          id:
            primary.id ||
            null,

          status:
            primary.status ||
            null,

          desiredCount:
            safeNumber(
              primary.desiredCount,
              0
            ),

          runningCount:
            safeNumber(
              primary.runningCount,
              0
            ),

          pendingCount:
            safeNumber(
              primary.pendingCount,
              0
            ),

          rolloutState:
            primary.rolloutState ||
            null,

          rolloutStateReason:
            primary.rolloutStateReason ||
            null,

          taskDefinition:
            primary.taskDefinition ||
            null,

          createdAt:
            primary.createdAt ||
            null,

          updatedAt:
            primary.updatedAt ||
            null

        }
      : null,

    rolloutState,

    rolloutStateReason,

    rolloutFailed:
      rolloutFailed ||
      deploymentFailure,

    deploymentFailure

  };

}


/* =========================================================
   HEALTH SCORE
========================================================= */

function calculateHealthScore(
  data
) {

  let score =
    HEALTH_SCORE_MAX;


  /*
   * Service state.
   */

  if (
    data.serviceStatus !==
    "ACTIVE"
  ) {

    score -=
      40;

  }


  /*
   * Deployment failure.
   */

  if (
    data.deploymentFailed ===
    true
  ) {

    score -=
      35;

  }


  /*
   * Desired tasks not running.
   */

  if (
    data.desiredTasks > 0 &&
    data.runningTasks <
      data.desiredTasks
  ) {

    const missingTasks =
      data.desiredTasks -
      data.runningTasks;


    score -=
      Math.min(
        35,
        missingTasks * 15
      );

  }


  /*
   * Pending tasks.
   *
   * Pending tasks alone are not treated
   * as failure because deployments can
   * legitimately have pending tasks.
   */

  if (
    data.pendingTasks >
    0 &&
    data.runningTasks >=
      data.desiredTasks
  ) {

    score -=
      Math.min(
        10,
        data.pendingTasks * 2
      );

  }


  /*
   * CPU.
   */

  if (
    typeof data.cpuUsage ===
      "number"
  ) {

    if (
      data.cpuUsage >=
      CPU_CRITICAL
    ) {

      score -=
        30;

    }

    else if (
      data.cpuUsage >=
      CPU_HIGH
    ) {

      score -=
        20;

    }

    else if (
      data.cpuUsage >=
      CPU_WARNING
    ) {

      score -=
        10;

    }

  }


  /*
   * Memory.
   */

  if (
    typeof data.memoryUsage ===
      "number"
  ) {

    if (
      data.memoryUsage >=
      MEMORY_CRITICAL
    ) {

      score -=
        30;

    }

    else if (
      data.memoryUsage >=
      MEMORY_HIGH
    ) {

      score -=
        20;

    }

    else if (
      data.memoryUsage >=
      MEMORY_WARNING
    ) {

      score -=
        10;

    }

  }


  return Math.max(
    HEALTH_SCORE_MIN,
    Math.min(
      HEALTH_SCORE_MAX,
      score
    )
  );

}


/* =========================================================
   HEALTH STATUS
========================================================= */

function getHealthStatus(
  score
) {

  if (
    score >=
    80
  ) {

    return "healthy";

  }


  if (
    score >=
    60
  ) {

    return "warning";

  }


  return "critical";

}


/* =========================================================
   SCALING RECOMMENDATION
========================================================= */

function getScalingRecommendation(
  cpuUsage,
  memoryUsage,
  runningTasks,
  desiredTasks,
  deploymentFailed = false
) {

  const cpuAvailable =
    typeof cpuUsage ===
      "number";


  const memoryAvailable =
    typeof memoryUsage ===
      "number";


  /*
   * Failed deployment.
   *
   * Do not blindly scale.
   *
   * A failed rollout should be investigated
   * by deployment/fix infrastructure.
   */

  if (
    deploymentFailed
  ) {

    return {

      action:
        "investigate",

      reason:
        "ECS deployment or rollout failure detected",

      priority:
        "critical"

    };

  }


  /*
   * Desired tasks are not running.
   */

  if (
    desiredTasks > 0 &&
    runningTasks <
      desiredTasks
  ) {

    return {

      action:
        "stabilize",

      reason:
        "Desired task count is not currently running",

      priority:
        "high"

    };

  }


  /*
   * High CPU or memory.
   */

  if (
    (
      cpuAvailable &&
      cpuUsage >=
        CPU_HIGH
    ) ||
    (
      memoryAvailable &&
      memoryUsage >=
        MEMORY_HIGH
    )
  ) {

    return {

      action:
        "scale-up",

      reason:
        "High resource utilization detected",

      priority:
        "high"

    };

  }


  /*
   * Moderate resource pressure.
   */

  if (
    (
      cpuAvailable &&
      cpuUsage >=
        CPU_WARNING
    ) ||
    (
      memoryAvailable &&
      memoryUsage >=
        MEMORY_WARNING
    )
  ) {

    return {

      action:
        "scale-up",

      reason:
        "Resource utilization is elevated",

      priority:
        "medium"

    };

  }


  /*
   * Scale down ONLY when:
   *
   * - both metrics exist
   * - both are genuinely low
   * - more than one desired task exists
   */

  if (
    cpuAvailable &&
    memoryAvailable &&
    cpuUsage <=
      CPU_SCALE_DOWN &&
    memoryUsage <=
      MEMORY_SCALE_DOWN &&
    desiredTasks > 1
  ) {

    return {

      action:
        "scale-down",

      reason:
        "Both CPU and memory utilization are low",

      priority:
        "low"

    };

  }


  return {

    action:
      "stable",

    reason:
      "Resource utilization is within expected range",

    priority:
      "low"

  };

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


  if (
    /AccessDenied|Unauthorized|UnrecognizedClient|InvalidClientToken/i
      .test(
        name + " " + message
      )
  ) {

    return "AUTHORIZATION";

  }


  if (
    /ResourceNotFound|ClusterNotFound|ServiceNotFound/i
      .test(
        name + " " + message
      )
  ) {

    return "RESOURCE_NOT_FOUND";

  }


  if (
    /Throttl|TooManyRequests/i
      .test(
        name + " " + message
      )
  ) {

    return "THROTTLED";

  }


  if (
    statusCode >= 500 ||
    /Timeout|timed out|NetworkingError|ECONNRESET|socket/i
      .test(
        name + " " + message
      )
  ) {

    return "TEMPORARY";

  }


  return "UNKNOWN";

}


/* =========================================================
   BUILD ERROR RESPONSE
========================================================= */

function buildMonitoringError(
  error,
  stage,
  deploymentId,
  clusterName = null,
  serviceName = null
) {

  const classification =
    classifyAwsError(
      error
    );


  return {

    success:
      false,

    message:
      "Monitoring Agent Failed",

    error:
      error?.message ||
      "Unknown monitoring error",

    errorType:
      classification,

    stage,

    deploymentId:
      deploymentId ||
      null,

    monitoring: {

      clusterName:
        clusterName ||
        null,

      serviceName:
        serviceName ||
        null

    }

  };

}


/* =========================================================
   MONITORING AGENT
========================================================= */

async function monitoringAgent(
  appData = {}
) {

  let currentStage =
    "request-validation";


  let deploymentId =
    null;


  let clusterName =
    null;


  let serviceName =
    null;


  try {

    logger.info(
      "📊 ZyrionOS Monitoring Agent Started"
    );


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (
      !appData ||
      typeof appData !==
        "object" ||
      Array.isArray(appData)
    ) {

      return {

        success:
          false,

        message:
          "Monitoring data required",

        stage:
          currentStage

      };

    }


    deploymentId =
      normalizeDeploymentId(
        appData.deploymentId
      );


    /* =====================================================
       RESOLVE CLUSTER
    ===================================================== */

    currentStage =
      "cluster-resolution";


    clusterName =
      resolveClusterName(
        appData
      );


    /* =====================================================
       RESOLVE SERVICE
    ===================================================== */

    currentStage =
      "service-resolution";


    serviceName =
      resolveServiceName(
        appData,
        deploymentId
      );


    if (
      !serviceName
    ) {

      return {

        success:
          false,

        message:
          "ECS service name could not be resolved",

        error:
          "Provide serviceName or projectName with deploymentId.",

        stage:
          currentStage,

        deploymentId,

        clusterName

      };

    }


    /* =====================================================
       ECS SERVICE
    ===================================================== */

    currentStage =
      "ecs-service-check";


    const ecsResult =
      await ecs.send(

        new DescribeServicesCommand({

          cluster:
            clusterName,

          services: [

            serviceName

          ],

          include: [

            "TAGS"

          ]

        })

      );


    /*
     * ECS can return failures separately
     * even when the API request itself succeeds.
     */

    const serviceFailures =
      Array.isArray(
        ecsResult?.failures
      )
        ? ecsResult.failures
        : [];


    if (
      serviceFailures.length > 0
    ) {

      const failure =
        serviceFailures[0];


      return {

        success:
          false,

        message:
          "ECS service lookup failed",

        error:
          failure?.reason ||
          failure?.detail ||
          "ECS DescribeServices returned a failure",

        errorType:
          "RESOURCE_NOT_FOUND",

        stage:
          currentStage,

        deploymentId,

        monitoring: {

          clusterName,

          serviceName,

          status:
            "not_found"

        }

      };

    }


    const service =
      ecsResult
        ?.services?.[0];


    if (
      !service
    ) {

      return {

        success:
          false,

        message:
          "ECS service not found",

        error:
          `Service '${serviceName}' was not found in cluster '${clusterName}'.`,

        stage:
          currentStage,

        deploymentId,

        monitoring: {

          clusterName,

          serviceName,

          status:
            "not_found"

        }

      };

    }


    /* =====================================================
       SERVICE STATUS
    ===================================================== */

    const serviceStatus =
      service.status ||
      "UNKNOWN";


    if (
      serviceStatus ===
      "INACTIVE"
    ) {

      return {

        success:
          false,

        message:
          "ECS service is inactive",

        error:
          `ECS service '${serviceName}' is inactive.`,

        stage:
          currentStage,

        deploymentId,

        monitoring: {

          clusterName,

          serviceName,

          status:
            "inactive",

          service: {

            status:
              serviceStatus,

            serviceArn:
              service.serviceArn ||
              null

          }

        }

      };

    }


    /* =====================================================
       ECS COUNTS
    ===================================================== */

    const runningTasks =
      safeNumber(
        service.runningCount,
        0
      );


    const desiredTasks =
      safeNumber(
        service.desiredCount,
        0
      );


    const pendingTasks =
      safeNumber(
        service.pendingCount,
        0
      );


    const failedTasks =
      Math.max(

        0,

        desiredTasks -
        runningTasks

      );


    /* =====================================================
       DEPLOYMENT HEALTH
    ===================================================== */

    currentStage =
      "ecs-deployment-analysis";


    const deploymentHealth =
      analyzeDeployments(
        service
      );


    /* =====================================================
       CPU METRIC
    ===================================================== */

    currentStage =
      "cloudwatch-cpu";


    const cpuMetric =
      await getMetric(

        "CPUUtilization",

        clusterName,

        serviceName

      );


    /* =====================================================
       MEMORY METRIC
    ===================================================== */

    currentStage =
      "cloudwatch-memory";


    const memoryMetric =
      await getMetric(

        "MemoryUtilization",

        clusterName,

        serviceName

      );


    /* =====================================================
       RESOURCE VALUES
    ===================================================== */

    const cpuUsage =
      cpuMetric.available
        ? safeNumber(
            cpuMetric.value
          )
        : null;


    const memoryUsage =
      memoryMetric.available
        ? safeNumber(
            memoryMetric.value
          )
        : null;


    /* =====================================================
       ALERTS
    ===================================================== */

    currentStage =
      "health-analysis";


    const alerts =
      [];


    /* =====================================================
       SERVICE STATE ALERT
    ===================================================== */

    if (
      serviceStatus !==
      "ACTIVE"
    ) {

      alerts.push(

        createAlert(

          "service",

          "critical",

          `ECS service state is ${serviceStatus}`,

          null,

          {

            serviceStatus

          }

        )

      );

    }


    /* =====================================================
       TASK AVAILABILITY ALERT
    ===================================================== */

    if (
      desiredTasks > 0 &&
      runningTasks <
        desiredTasks
    ) {

      alerts.push(

        createAlert(

          "tasks",

          "high",

          `${failedTasks} desired task(s) are not currently running`,

          failedTasks,

          {

            runningTasks,

            desiredTasks,

            pendingTasks

          }

        )

      );

    }


    /* =====================================================
       DEPLOYMENT FAILURE ALERT
    ===================================================== */

    if (
      deploymentHealth.deploymentFailure
    ) {

      alerts.push(

        createAlert(

          "deployment",

          "critical",

          "ECS deployment or rollout failure detected",

          null,

          {

            rolloutState:
              deploymentHealth.rolloutState,

            rolloutStateReason:
              deploymentHealth.rolloutStateReason,

            deploymentCount:
              deploymentHealth.count

          }

        )

      );

    }


    /* =====================================================
       ROLLOUT STATE ALERT
    ===================================================== */

    if (
      deploymentHealth.rolloutState ===
      "IN_PROGRESS"
    ) {

      alerts.push(

        createAlert(

          "deployment",

          "low",

          "ECS deployment rollout is currently in progress",

          null,

          {

            rolloutState:
              deploymentHealth.rolloutState

          }

        )

      );

    }


    /* =====================================================
       CPU ALERTS
    ===================================================== */

    if (
      typeof cpuUsage ===
        "number"
    ) {

      if (
        cpuUsage >=
        CPU_CRITICAL
      ) {

        alerts.push(

          createAlert(

            "cpu",

            "critical",

            "Critical CPU utilization detected",

            cpuUsage,

            {

              warning:
                CPU_WARNING,

              high:
                CPU_HIGH,

              critical:
                CPU_CRITICAL

            }

          )

        );

      }

      else if (
        cpuUsage >=
        CPU_HIGH
      ) {

        alerts.push(

          createAlert(

            "cpu",

            "high",

            "High CPU utilization detected",

            cpuUsage,

            {

              warning:
                CPU_WARNING,

              high:
                CPU_HIGH,

              critical:
                CPU_CRITICAL

            }

          )

        );

      }

      else if (
        cpuUsage >=
        CPU_WARNING
      ) {

        alerts.push(

          createAlert(

            "cpu",

            "medium",

            "Elevated CPU utilization detected",

            cpuUsage,

            {

              warning:
                CPU_WARNING,

              high:
                CPU_HIGH,

              critical:
                CPU_CRITICAL

            }

          )

        );

      }

    }


    /* =====================================================
       MEMORY ALERTS
    ===================================================== */

    if (
      typeof memoryUsage ===
        "number"
    ) {

      if (
        memoryUsage >=
        MEMORY_CRITICAL
      ) {

        alerts.push(

          createAlert(

            "memory",

            "critical",

            "Critical memory utilization detected",

            memoryUsage,

            {

              warning:
                MEMORY_WARNING,

              high:
                MEMORY_HIGH,

              critical:
                MEMORY_CRITICAL

            }

          )

        );

      }

      else if (
        memoryUsage >=
        MEMORY_HIGH
      ) {

        alerts.push(

          createAlert(

            "memory",

            "high",

            "High memory utilization detected",

            memoryUsage,

            {

              warning:
                MEMORY_WARNING,

              high:
                MEMORY_HIGH,

              critical:
                MEMORY_CRITICAL

            }

          )

        );

      }

      else if (
        memoryUsage >=
        MEMORY_WARNING
      ) {

        alerts.push(

          createAlert(

            "memory",

            "medium",

            "Elevated memory utilization detected",

            memoryUsage,

            {

              warning:
                MEMORY_WARNING,

              high:
                MEMORY_HIGH,

              critical:
                MEMORY_CRITICAL

            }

          )

        );

      }

    }


    /* =====================================================
       MISSING CPU METRIC
    ===================================================== */

    if (
      !cpuMetric.available
    ) {

      alerts.push(

        createAlert(

          "metric",

          "low",

          "CPU utilization metric is currently unavailable",

          null,

          {

            metric:
              "CPUUtilization",

            datapoints:
              cpuMetric.datapoints,

            windowMinutes:
              MONITORING_WINDOW_MINUTES

          }

        )

      );

    }


    /* =====================================================
       MISSING MEMORY METRIC
    ===================================================== */

    if (
      !memoryMetric.available
    ) {

      alerts.push(

        createAlert(

          "metric",

          "low",

          "Memory utilization metric is currently unavailable",

          null,

          {

            metric:
              "MemoryUtilization",

            datapoints:
              memoryMetric.datapoints,

            windowMinutes:
              MONITORING_WINDOW_MINUTES

          }

        )

      );

    }


    /* =====================================================
       HEALTH SCORE
    ===================================================== */

    const healthScore =
      calculateHealthScore({

        serviceStatus,

        runningTasks,

        desiredTasks,

        pendingTasks,

        deploymentFailed:
          deploymentHealth.deploymentFailure,

        cpuUsage,

        memoryUsage

      });


    const status =
      getHealthStatus(
        healthScore
      );


    /* =====================================================
       SCALING RECOMMENDATION
    ===================================================== */

    const scalingRecommendation =
      getScalingRecommendation(

        cpuUsage,

        memoryUsage,

        runningTasks,

        desiredTasks,

        deploymentHealth.deploymentFailure

      );


    /* =====================================================
       METRIC WINDOW
    ===================================================== */

    const monitoredFrom =
      new Date(

        Date.now() -
        (
          MONITORING_WINDOW_MINUTES *
          60 *
          1000
        )

      ).toISOString();


    const monitoredAt =
      new Date()
        .toISOString();


    /* =====================================================
       MONITORING RESULT
    ===================================================== */

    const monitoring = {

      deploymentId,

      clusterName,

      serviceName,

      region:
        AWS_REGION,

      status,

      healthScore,

      service: {

        status:
          serviceStatus,

        runningTasks,

        desiredTasks,

        pendingTasks,

        failedTasks,

        taskDefinition:
          service.taskDefinition ||
          null,

        serviceArn:
          service.serviceArn ||
          null,

        deploymentConfiguration:
          service.deploymentConfiguration ||
          null,

        schedulingStrategy:
          service.schedulingStrategy ||
          null,

        launchType:
          service.launchType ||
          null,

        platformVersion:
          service.platformVersion ||
          null,

        createdAt:
          service.createdAt ||
          null,

        updatedAt:
          service.updatedAt ||
          null

      },

      deployment: {

        available:
          deploymentHealth.available,

        count:
          deploymentHealth.count,

        activeCount:
          deploymentHealth.activeCount,

        rolloutState:
          deploymentHealth.rolloutState,

        rolloutStateReason:
          deploymentHealth.rolloutStateReason,

        rolloutFailed:
          deploymentHealth.rolloutFailed,

        deploymentFailure:
          deploymentHealth.deploymentFailure,

        primary:
          deploymentHealth.primary

      },

      metrics: {

        cpuUsage,

        memoryUsage,

        cpuAvailable:
          cpuMetric.available,

        memoryAvailable:
          memoryMetric.available,

        cpuMaximum:
          cpuMetric.maximum,

        memoryMaximum:
          memoryMetric.maximum,

        cpuDatapoints:
          cpuMetric.datapoints,

        memoryDatapoints:
          memoryMetric.datapoints,

        cpuTimestamp:
          cpuMetric.timestamp,

        memoryTimestamp:
          memoryMetric.timestamp,

        windowMinutes:
          MONITORING_WINDOW_MINUTES,

        periodSeconds:
          METRIC_PERIOD_SECONDS,

        monitoredFrom,

        monitoredAt

      },

      thresholds: {

        cpu: {

          warning:
            CPU_WARNING,

          high:
            CPU_HIGH,

          critical:
            CPU_CRITICAL,

          scaleDown:
            CPU_SCALE_DOWN

        },

        memory: {

          warning:
            MEMORY_WARNING,

          high:
            MEMORY_HIGH,

          critical:
            MEMORY_CRITICAL,

          scaleDown:
            MEMORY_SCALE_DOWN

        }

      },

      scalingRecommendation,

      monitoredFrom,

      monitoredAt

    };


    /* =====================================================
       SORT ALERTS
    ===================================================== */

    const sortedAlerts =
      sortAlerts(
        alerts
      );


    /* =====================================================
       SUMMARY
    ===================================================== */

    const criticalAlerts =
      sortedAlerts.filter(
        (alert) =>
          alert.severity ===
          "critical"
      ).length;


    const highAlerts =
      sortedAlerts.filter(
        (alert) =>
          alert.severity ===
          "high"
      ).length;


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(

      `📊 Monitoring Completed: ${serviceName} | ${status} | ${healthScore}/100 | alerts=${sortedAlerts.length}`

    );


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        true,

      monitoring,

      alerts:
        sortedAlerts,

      summary: {

        status,

        healthScore,

        criticalAlerts,

        highAlerts,

        totalAlerts:
          sortedAlerts.length,

        cpuUsage,

        memoryUsage,

        runningTasks,

        desiredTasks,

        pendingTasks,

        deploymentFailed:
          deploymentHealth.deploymentFailure,

        scalingAction:
          scalingRecommendation.action

      }

    };

  }

  catch (error) {

    const result =
      buildMonitoringError(

        error,

        currentStage,

        deploymentId,

        clusterName,

        serviceName

      );


    logger.error(

      `Monitoring Agent Failed at ${currentStage}: ${error?.message || "Unknown monitoring error"}`

    );


    return result;

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  monitoringAgent;
