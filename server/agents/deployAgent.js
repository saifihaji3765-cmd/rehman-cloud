/* =========================
PACKAGES
========================= */

const { v4: uuidv4 } =
require("uuid");

/* =========================
AGENTS
========================= */

const dockerAgent =
require("./dockerAgent");

const awsAgent =
require("./awsAgent");

const domainAgent =
require("./domainAgent");

const sslAgent =
require("./sslAgent");

const billingAgent =
require("./billingAgent");

const subscriptionAgent =
require("./subscriptionAgent");

const monitoringAgent =
require("./monitoringAgent");

const scalingAgent =
require("./scalingAgent");

/* =========================
SERVICES
========================= */

const logger =
require("../services/loggerService");

/* =========================
DEPLOY AGENT
========================= */

async function deployAgent(
projectData = {}
){

try{

logger.info(
  "🚀 Deployment Started"
);

/* =========================
VALIDATION
========================= */

if(
!projectData.projectName
){

return {

  success:false,

  message:
  "Project name required"

};

}

/* =========================
DEPLOYMENT ID
========================= */

const deploymentId =
uuidv4();

/* =========================
DEFAULTS
========================= */

const framework =

projectData.framework ||
"node";

const selectedPlan =

projectData.plan ||
"Starter";

/* =========================
BILLING
========================= */

const billing =

await billingAgent({

userId:
projectData.userId,

plan:
selectedPlan

});

if(!billing.success){

logger.error(
"Billing Failed"
);

return {

success:false,

message:
"Billing failed",

error:
billing.error

};

}

logger.success(
"Billing Validated"
);

/* =========================
SUBSCRIPTION
========================= */

const subscription =

await subscriptionAgent({

userId:
projectData.userId,

plan:
selectedPlan

});

if(!subscription.success){

logger.error(
"Subscription Failed"
);

return {

success:false,

message:
"Subscription failed",

error:
subscription.error

};

}

/* =========================
DEPLOY LIMIT
========================= */

if(

subscription
.subscription
.deploymentsLimit === 0

){

logger.warning(
"Deployment limit reached"
);

return {

success:false,

message:
"Deployment limit reached"

};

}

logger.success(
"Subscription Validated"
);

/* =========================
DOCKER BUILD
========================= */

const docker =

await dockerAgent({

deploymentId,

projectName:
projectData.projectName,

framework,

files:
projectData.files || [],

prompt:
projectData.prompt

});

if(!docker.success){

logger.error(
"Docker Build Failed"
);

return {

success:false,

message:
"Docker build failed",

error:
docker.error

};

}

logger.success(
"Docker Build Completed"
);

/* =========================
AWS DEPLOYMENT
========================= */

const aws =

await awsAgent({

deploymentId,

projectName:
projectData.projectName,

docker:
docker.docker,

cpu:
subscription
.subscription
.cpu,

ram:
subscription
.subscription
.ram

});

if(!aws.success){

logger.error(
"AWS Deployment Failed"
);

return {

success:false,

message:
"AWS deployment failed",

error:
aws.error

};

}

logger.success(
"AWS Deployment Completed"
);

/* =========================
DOMAIN
========================= */

const domain =

await domainAgent({

projectName:
projectData.projectName

});

if(!domain.success){

logger.error(
"Domain Generation Failed"
);

return {

success:false,

message:
"Domain generation failed",

error:
domain.error

};

}

logger.success(
"Domain Generated"
);

/* =========================
SSL
========================= */

const ssl =

await sslAgent({

domain:
domain.domain

});

if(!ssl.success){

logger.error(
"SSL Activation Failed"
);

return {

success:false,

message:
"SSL activation failed",

error:
ssl.error

};

}

logger.success(
"SSL Activated"
);

/* =========================
MONITORING
========================= */

let monitoring = null;

try{

monitoring =

await monitoringAgent({

deploymentId,

appName:
projectData.projectName

});

logger.success(
"Monitoring Enabled"
);

}

catch(error){

logger.warning(
"Monitoring Failed"
);

}

/* =========================
AUTO SCALING
========================= */

let scaling = null;

if(

subscription
.subscription
.autoScaling

){

try{

scaling =

await scalingAgent({

deploymentId,

cpuUsage:20,

ramUsage:30,

activeUsers:0

});

logger.success(
"Scaling Configured"
);

}

catch(error){

logger.warning(
"Scaling Failed"
);

}

}

/* =========================
LIVE URL
========================= */

const liveUrl =

ssl.ssl?.securedUrl ||

domain.domain?.fullDomain ||

aws.aws?.publicUrl;

/* =========================
FINAL RESPONSE
========================= */

return {

success:true,

deployment:{

deploymentId,

status:"deployed",

health:"healthy",

provider:"AWS",

projectName:
projectData.projectName,

framework,

liveUrl,

infrastructure:{

cpu:
subscription
.subscription
.cpu,

ram:
subscription
.subscription
.ram,

storage:
subscription
.subscription
.storage,

bandwidth:
subscription
.subscription
.bandwidth

},

services:{

docker:
docker.docker,

aws:
aws.aws,

domain:
domain.domain,

ssl:
ssl.ssl,

monitoring:
monitoring?.monitoring ||

null,

scaling:
scaling?.scaling ||

null

},

billing:
billing.billing,

subscription:
subscription.subscription,

metadata:{

environment:
process.env.NODE_ENV,

region:
process.env.AWS_REGION,

version:"1.0.0"

},

deployedAt:
new Date()

}

};

}

catch(error){

logger.error(
error.message
);

return {

success:false,

message:
"Deployment failed",

error:
error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
deployAgent;
