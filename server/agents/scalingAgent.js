const {
UpdateServiceCommand,
DescribeServicesCommand
} = require(
"@aws-sdk/client-ecs"
);

const {
ecs
} = require(
"../config/aws"
);

/* =========================
SCALING AGENT
========================= */

async function scalingAgent(
appMetrics
){

try{

/* =========================
VALIDATION
========================= */

if(
  !appMetrics.deploymentId
){

  return {

    success:false,

    message:
    "Deployment ID required"

  };

}

/* =========================
DEPLOYMENT
========================= */

const deploymentId =
appMetrics.deploymentId;

const clusterName =
process.env.ECS_CLUSTER ||
"vertexcloud-cluster";

const serviceName =
`service-${deploymentId}`;

/* =========================
GET SERVICE
========================= */

const serviceResult =

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
serviceResult.services?.[0];

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
METRICS
========================= */

const cpuUsage =

Number(
appMetrics.cpuUsage || 0
);

const ramUsage =

Number(
appMetrics.ramUsage || 0
);

const activeUsers =

Number(
appMetrics.activeUsers || 0
);

/* =========================
LIMITS
========================= */

const minInstances = 1;

const maxInstances = 10;

/* =========================
CURRENT INSTANCES
========================= */

let instances =
service.desiredCount || 1;

let action = "stable";

let scalingReason =
"System stable";

/* =========================
SCALE UP
========================= */

if(

cpuUsage >= 70 ||

ramUsage >= 75 ||

activeUsers >= 500

){

action = "scale-up";

instances = 3;

scalingReason =
"Medium traffic spike detected";

}

/* =========================
HIGH SCALE
========================= */

if(

cpuUsage >= 90 ||

ramUsage >= 90 ||

activeUsers >= 2000

){

action = "high-scale";

instances = 6;

scalingReason =
"High traffic load detected";

}

/* =========================
EXTREME SCALE
========================= */

if(

cpuUsage >= 95 ||

ramUsage >= 95 ||

activeUsers >= 5000

){

action = "extreme-scale";

instances = 10;

scalingReason =
"Extreme production traffic";

}

/* =========================
SCALE DOWN
========================= */

if(

cpuUsage <= 20 &&

ramUsage <= 25 &&

activeUsers <= 50

){

action = "scale-down";

instances = 1;

scalingReason =
"Low resource usage";

}

/* =========================
SAFETY
========================= */

if(instances > maxInstances){

instances = maxInstances;

}

if(instances < minInstances){

instances = minInstances;

}

/* =========================
UPDATE ECS SERVICE
========================= */

await ecs.send(

new UpdateServiceCommand({

  cluster:
  clusterName,

  service:
  serviceName,

  desiredCount:
  instances

})

);

/* =========================
RETURN
========================= */

return {

success:true,

scaling:{

  deploymentId,

  autoScaling:true,

  action,

  instances,

  minInstances,

  maxInstances,

  scalingReason,

  metrics:{

    cpuUsage,

    ramUsage,

    activeUsers

  },

  orchestration:{

    platform:
    "AWS ECS",

    realScaling:true

  },

  updatedAt:
  new Date()

}

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
scalingAgent;
