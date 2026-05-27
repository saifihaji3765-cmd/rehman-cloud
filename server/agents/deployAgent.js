/* =========================
PACKAGES
========================= */

const { v4:uuidv4 } =
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
projectData
){

try{

logger.info(
  "🚀 Deployment Started"
);

/* =========================
   DEPLOYMENT ID
========================= */

const deploymentId =
uuidv4();

/* =========================
   VALIDATE PROJECT
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
   BILLING
========================= */

const billing =

await billingAgent({

  userId:
  projectData.userId,

  plan:
  projectData.plan ||

  "Starter"

});

if(!billing.success){

  return {

    success:false,

    message:
    "Billing failed"

  };

}

/* =========================
   SUBSCRIPTION
========================= */

const subscription =

await subscriptionAgent({

  userId:
  projectData.userId,

  plan:
  projectData.plan ||

  "Starter"

});

if(!subscription.success){

  return {

    success:false,

    message:
    "Subscription failed"

  };

}

/* =========================
   DEPLOY LIMIT CHECK
========================= */

if(

  subscription
  .subscription
  .deploymentsLimit === 0

){

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

  projectName:
  projectData.projectName,

  framework:
  projectData.framework,

  prompt:
  projectData.prompt

});

logger.success(
  "Docker Build Completed"
);

/* =========================
   AWS DEPLOY
========================= */

const aws =

await awsAgent({

  deploymentId,

  docker,

  cpu:
  subscription
  .subscription
  .cpu,

  ram:
  subscription
  .subscription
  .ram

});

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

logger.success(
  "SSL Activated"
);

/* =========================
   MONITORING
========================= */

const monitoring =

await monitoringAgent({

  deploymentId,

  projectName:
  projectData.projectName

});

logger.success(
  "Monitoring Enabled"
);

/* =========================
   AUTO SCALING
========================= */

let scaling = null;

if(

  subscription
  .subscription
  .autoScaling

){

  scaling =

  await scalingAgent({

    deploymentId,

    cpuThreshold:70,

    ramThreshold:80

  });

}

logger.success(
  "Scaling Configured"
);

/* =========================
   FINAL RESPONSE
========================= */

return {

  success:true,

  deployment:{

    deploymentId,

    status:"deployed",

    projectName:
    projectData.projectName,

    framework:
    projectData.framework ||

    "Node.js",

    liveUrl:

    ssl.securedUrl ||

    domain.domain,

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

      docker,

      aws,

      domain,

      ssl,

      monitoring,

      scaling

    },

    billing:
    billing.billing,

    subscription:
    subscription.subscription,

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

  error:error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
deployAgent;
