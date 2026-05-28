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
   VALIDATION
========================= */

if(

  !projectData ||

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
  projectData.plan ||

  "Starter"

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
   DEPLOYMENT LIMIT
========================= */

if(

  subscription
  .subscription
  .deploymentsLimit === 0

){

  logger.warning(
    "Deployment Limit Reached"
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

  projectName:
  projectData.projectName,

  framework:
  projectData.framework ||

  "node",

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
   DOMAIN GENERATION
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
   SSL ACTIVATION
========================= */

const ssl =

await sslAgent({

  subdomain:
  domain.subdomain

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

const monitoring =

await monitoringAgent({

  deploymentId,

  appName:
  projectData.projectName

});

if(!monitoring.success){

  logger.warning(
    "Monitoring Failed"
  );

}

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

    cpuUsage:20,

    ramUsage:30

  });

  if(!scaling.success){

    logger.warning(
      "Scaling Failed"
    );

  }

}

logger.success(
  "Scaling Configured"
);

/* =========================
   LIVE URL
========================= */

const liveUrl =

ssl.ssl.securedUrl ||

domain.subdomain;

/* =========================
   FINAL RESPONSE
========================= */

return {

  success:true,

  deployment:{

    deploymentId,

    status:"deployed",

    provider:"AWS",

    projectName:
    projectData.projectName,

    framework:
    projectData.framework ||

    "Node.js",

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
