const { v4:uuidv4 } =
require("uuid");

/* =========================
SCALING AGENT
========================= */

async function scalingAgent(
appMetrics
){

try{

/* =========================
   DEPLOYMENT ID
========================= */

const deploymentId =

  appMetrics.deploymentId ||

  uuidv4();

/* =========================
   METRICS
========================= */

const cpuUsage =

  Number(
    appMetrics.cpuUsage || 20
  );

const ramUsage =

  Number(
    appMetrics.ramUsage || 30
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
   DEFAULT STATE
========================= */

let action = "stable";

let instances = 1;

let loadBalancer = false;

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

  loadBalancer = true;

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

  loadBalancer = true;

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

  loadBalancer = true;

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
   INSTANCE SAFETY
========================= */

if(

  instances > maxInstances

){

  instances = maxInstances;

}

if(

  instances < minInstances

){

  instances = minInstances;

}

/* =========================
   COST OPTIMIZATION
========================= */

const estimatedMonthlyCost =

  instances * 15;

/* =========================
   ORCHESTRATION
========================= */

const orchestration = {

  containerEngine:"Docker",

  orchestrationPlatform:
  "AWS ECS",

  kubernetesReady:true

};

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

    loadBalancer,

    scalingReason,

    estimatedMonthlyCost,

    metrics:{

      cpuUsage,

      ramUsage,

      activeUsers

    },

    orchestration,

    checkedAt:
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
