/* =========================================================
   ZyrionOS MONITORING AGENT
   Real AWS ECS + CloudWatch Monitoring

   FLOW:

   ECS Service
       ↓
   Describe ECS Service
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

   IMPORTANT:

   This agent NEVER converts missing metrics
   into fake 0% usage.

   AWS ECS / CloudWatch are the source of truth.
========================================================= */


/* =========================================================
   AWS CLOUDWATCH
========================================================= */

const {
  GetMetricStatisticsCommand
} =
  require("@aws-sdk/client-cloudwatch");


/* =========================================================
   AWS ECS
========================================================= */

const {
  DescribeServicesCommand
} =
  require("@aws-sdk/client-ecs");


/* =========================================================
   AWS CLIENTS
========================================================= */

const {
  cloudwatch,
  ecs
} =
  require("../config/aws");


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
  15;


const METRIC_PERIOD_SECONDS =
  300;


/* =========================================================
   THRESHOLDS
========================================================= */

const CPU_WARNING =
  75;


const CPU_HIGH =
  85;


const CPU_CRITICAL =
  95;


const MEMORY_WARNING =
  75;


const MEMORY_HIGH =
  85;


const MEMORY_CRITICAL =
  95;


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
 * Must match AWS Agent:
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
   * Preferred:
   *
   * appData.serviceName
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
   * Planning/project information.
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
        (point) =>
          point &&
          typeof point.Average ===
            "number"
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
        datapoints.length

    };

  }


  return {

    available:
      true,

    value:
      latest.Average,

    maximum:
      typeof latest.Maximum ===
        "number"
        ? latest.Maximum
        : latest.Average,

    timestamp:
      latest.Timestamp ||
      null,

    datapoints:
      datapoints.length

  };

}


/* =========================================================
   BUILD ALERT
========================================================= */

function createAlert(
  type,
  severity,
  message,
  value = null
) {

  return {

    type,

    severity,

    message,

    value:

      typeof value ===
        "number"
        ? Number(
            value.toFixed(2)
          )
        : null,

    createdAt:
      new Date().toISOString()

  };

}


/* =========================================================
   HEALTH SCORE
========================================================= */

function calculateHealthScore(
  data
) {

  let score =
    100;


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
    0,
    Math.min(
      100,
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
  desiredTasks
) {

  const cpuAvailable =
    typeof cpuUsage ===
      "number";


  const memoryAvailable =
    typeof memoryUsage ===
      "number";


  /*
   * If service has fewer running
   * tasks than desired, don't recommend
   * a scale-down.
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
   * Scale down only when BOTH
   * metrics are available and low.
   */

  if (
    cpuAvailable &&
    memoryAvailable &&
    cpuUsage <= 25 &&
    memoryUsage <= 35 &&
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
   MONITORING AGENT
========================================================= */

async function monitoringAgent(
  appData = {}
) {

  let currentStage =
    "request-validation";


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
        "object"
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


    const deploymentId =
      normalizeDeploymentId(
        appData.deploymentId
      );


    /* =====================================================
       RESOLVE CLUSTER
    ===================================================== */

    currentStage =
      "cluster-resolution";


    const clusterName =
      resolveClusterName(
        appData
      );


    /* =====================================================
       RESOLVE SERVICE
    ===================================================== */

    currentStage =
      "service-resolution";


    const serviceName =
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
          currentStage

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

          ]

        })

      );


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

        monitoring: {

          deploymentId,

          clusterName,

          serviceName,

          status:
            "not_found"

        }

      };

    }


    if (
      service.status ===
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
          currentStage

      };

    }


    /* =====================================================
       ECS COUNTS
    ===================================================== */

    const runningTasks =
      Number(
        service.runningCount ||
        0
      );


    const desiredTasks =
      Number(
        service.desiredCount ||
        0
      );


    const pendingTasks =
      Number(
        service.pendingCount ||
        0
      );


    const failedTasks =
      Math.max(

        0,

        desiredTasks -
        runningTasks

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
        ? Number(
            cpuMetric.value
          )
        : null;


    const memoryUsage =
      memoryMetric.available
        ? Number(
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


    /*
     * Service state.
     */

    if (
      service.status !==
      "ACTIVE"
    ) {

      alerts.push(

        createAlert(

          "service",

          "critical",

          `ECS service state is ${service.status || "unknown"}`

        )

      );

    }


    /*
     * Task availability.
     */

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

          failedTasks

        )

      );

    }


    /*
     * CPU alerts.
     */

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

            cpuUsage

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

            cpuUsage

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

            cpuUsage

          )

        );

      }

    }


    /*
     * Memory alerts.
     */

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

            memoryUsage

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

            memoryUsage

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

            memoryUsage

          )

        );

      }

    }


    /*
     * Missing metrics.
     */

    if (
      !cpuMetric.available
    ) {

      alerts.push(

        createAlert(

          "metric",

          "low",

          "CPU utilization metric is currently unavailable"

        )

      );

    }


    if (
      !memoryMetric.available
    ) {

      alerts.push(

        createAlert(

          "metric",

          "low",

          "Memory utilization metric is currently unavailable"

        )

      );

    }


    /* =====================================================
       HEALTH SCORE
    ===================================================== */

    const healthScore =
      calculateHealthScore({

        serviceStatus:
          service.status,

        runningTasks,

        desiredTasks,

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

        desiredTasks

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
          service.status,

        runningTasks,

        desiredTasks,

        pendingTasks,

        failedTasks,

        taskDefinition:
          service.taskDefinition ||
          null,

        serviceArn:
          service.serviceArn ||
          null

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

        windowMinutes:
          MONITORING_WINDOW_MINUTES,

        periodSeconds:
          METRIC_PERIOD_SECONDS

      },

      scalingRecommendation,

      monitoredFrom,

      monitoredAt

    };


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(

      `📊 Monitoring Completed: ${serviceName} | ${status} | ${healthScore}/100`

    );


    /* =====================================================
       RETURN
    ===================================================== */

    return {

      success:
        true,

      monitoring,

      alerts

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown monitoring error";


    logger.error(

      `Monitoring Agent Failed at ${currentStage}: ${errorMessage}`

    );


    return {

      success:
        false,

      message:
        "Monitoring Agent Failed",

      error:
        errorMessage,

      stage:
        currentStage,

      deploymentId:
        appData?.deploymentId ||
        null

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  monitoringAgent;
