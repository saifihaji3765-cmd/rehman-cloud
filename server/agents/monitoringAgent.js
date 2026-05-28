const {
GetMetricStatisticsCommand
} = require(
"@aws-sdk/client-cloudwatch"
);

const {
DescribeServicesCommand
} = require(
"@aws-sdk/client-ecs"
);

const {
cloudwatch,
ecs
} = require(
"../config/aws"
);

/* =========================
MONITORING AGENT
========================= */

async function monitoringAgent(
appData
){

try{

/* =========================
VALIDATION
========================= */

if(
  !appData.deploymentId
){

  return {

    success:false,

    message:
    "Deployment ID required"

  };

}

/* =========================
APP INFO
========================= */

const deploymentId =
appData.deploymentId;

const clusterName =
process.env.ECS_CLUSTER ||
"vertexcloud-cluster";

const serviceName =
`service-${deploymentId}`;

/* =========================
ECS STATUS
========================= */

const ecsResult =

await ecs.send(

new DescribeServicesCommand({

  cluster:
  clusterName,

  services:[
    serviceName
  ]

})

);

const service =
ecsResult.services?.[0];

/* =========================
SERVICE CHECK
========================= */

if(!service){

  return {

    success:false,

    message:
    "ECS service not found"

  };

}

/* =========================
CPU METRIC
========================= */

const cpuMetric =

await cloudwatch.send(

new GetMetricStatisticsCommand({

  Namespace:"AWS/ECS",

  MetricName:"CPUUtilization",

  Dimensions:[

    {
      Name:"ClusterName",
      Value:clusterName
    },

    {
      Name:"ServiceName",
      Value:serviceName
    }

  ],

  StartTime:
  new Date(Date.now() - 15 * 60 * 1000),

  EndTime:
  new Date(),

  Period:300,

  Statistics:["Average"]

})

);

/* =========================
MEMORY METRIC
========================= */

const memoryMetric =

await cloudwatch.send(

new GetMetricStatisticsCommand({

  Namespace:"AWS/ECS",

  MetricName:"MemoryUtilization",

  Dimensions:[

    {
      Name:"ClusterName",
      Value:clusterName
    },

    {
      Name:"ServiceName",
      Value:serviceName
    }

  ],

  StartTime:
  new Date(Date.now() - 15 * 60 * 1000),

  EndTime:
  new Date(),

  Period:300,

  Statistics:["Average"]

})

);

/* =========================
CPU VALUE
========================= */

const cpuUsage =

cpuMetric.Datapoints?.[0]
?.Average || 0;

/* =========================
RAM VALUE
========================= */

const ramUsage =

memoryMetric.Datapoints?.[0]
?.Average || 0;

/* =========================
HEALTH SCORE
========================= */

let healthScore = 100;

if(cpuUsage > 80){

  healthScore -= 20;

}

if(ramUsage > 85){

  healthScore -= 25;

}

/* =========================
STATUS
========================= */

let status = "healthy";

if(healthScore < 80){

  status = "warning";

}

if(healthScore < 60){

  status = "critical";

}

/* =========================
ALERTS
========================= */

const alerts = [];

if(cpuUsage > 80){

  alerts.push({

    type:"cpu",

    severity:"high",

    message:
    "High CPU usage detected"

  });

}

if(ramUsage > 85){

  alerts.push({

    type:"memory",

    severity:"critical",

    message:
    "High RAM usage detected"

  });

}

/* =========================
SCALING
========================= */

const scalingRecommendation =

cpuUsage > 75

? "scale-up"

: "stable";

/* =========================
RETURN
========================= */

return {

  success:true,

  monitoring:{

    deploymentId,

    status,

    healthScore,

    metrics:{

      cpuUsage:
      `${cpuUsage.toFixed(2)}%`,

      ramUsage:
      `${ramUsage.toFixed(2)}%`,

      runningTasks:
      service.runningCount,

      desiredTasks:
      service.desiredCount

    },

    scalingRecommendation,

    monitoredAt:
    new Date()

  },

  alerts

};

}

catch(error){

return {

  success:false,

  error:error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
monitoringAgent;
