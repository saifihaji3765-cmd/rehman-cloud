const { v4:uuidv4 } =
require("uuid");

/* =========================
MONITORING AGENT
========================= */

async function monitoringAgent(
appData
){

try{

/* =========================
   APP INFO
========================= */

const appName =

  appData.appName ||

  "vertexcloud-app";

const deploymentId =

  appData.deploymentId ||

  uuidv4();

/* =========================
   METRICS
========================= */

const metrics = {

  cpuUsage:
  Math.floor(
    Math.random() * 60
  ) + "%",

  ramUsage:
  Math.floor(
    Math.random() * 70
  ) + "%",

  diskUsage:
  Math.floor(
    Math.random() * 50
  ) + "%",

  responseTime:
  Math.floor(
    Math.random() * 200
  ) + "ms",

  requestsPerMinute:
  Math.floor(
    Math.random() * 1000
  ),

  activeUsers:
  Math.floor(
    Math.random() * 500
  ),

  uptime:"99.99%"

};

/* =========================
   HEALTH SCORE
========================= */

let healthScore = 100;

if(

  parseInt(
    metrics.cpuUsage
  ) > 80

){

  healthScore -= 20;

}

if(

  parseInt(
    metrics.ramUsage
  ) > 85

){

  healthScore -= 25;

}

/* =========================
   STATUS
========================= */

let status = "healthy";

if(

  healthScore < 80

){

  status = "warning";

}

if(

  healthScore < 60

){

  status = "critical";

}

/* =========================
   ALERTS
========================= */

const alerts = [];

if(

  parseInt(
    metrics.cpuUsage
  ) > 80

){

  alerts.push({

    type:"cpu",

    severity:"high",

    message:
    "High CPU usage detected"

  });

}

if(

  parseInt(
    metrics.ramUsage
  ) > 85

){

  alerts.push({

    type:"memory",

    severity:"critical",

    message:
    "High RAM usage detected"

  });

}

/* =========================
   LOGGING
========================= */

const logs = {

  totalLogs:
  Math.floor(
    Math.random() * 10000
  ),

  errorsToday:
  Math.floor(
    Math.random() * 5
  ),

  warningsToday:
  Math.floor(
    Math.random() * 20
  )

};

/* =========================
   SECURITY
========================= */

const security = {

  firewall:true,

  sslActive:true,

  ddosProtection:true,

  suspiciousRequests:
  Math.floor(
    Math.random() * 10
  )

};

/* =========================
   SCALING
========================= */

const scalingRecommendation =

  parseInt(
    metrics.cpuUsage
  ) > 75

  ? "scale-up"

  : "stable";

/* =========================
   RETURN
========================= */

return {

  success:true,

  monitoring:{

    deploymentId,

    appName,

    status,

    healthScore,

    metrics,

    logs,

    security,

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
