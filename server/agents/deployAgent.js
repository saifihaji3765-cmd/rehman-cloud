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
      "Deployment Started"
    );

    /* =========================
       STEP 1
       DOCKER BUILD
    ========================= */

    const docker =

      await dockerAgent(
        projectData
      );

    logger.success(
      "Docker Build Completed"
    );

    /* =========================
       STEP 2
       AWS DEPLOY
    ========================= */

    const aws =

      await awsAgent(
        docker
      );

    logger.success(
      "AWS Deployment Completed"
    );

    /* =========================
       STEP 3
       DOMAIN SETUP
    ========================= */

    const domain =

      await domainAgent(
        projectData
      );

    logger.success(
      "Domain Generated"
    );

    /* =========================
       STEP 4
       SSL SETUP
    ========================= */

    const ssl =

      await sslAgent(
        domain
      );

    logger.success(
      "SSL Activated"
    );

    /* =========================
       STEP 5
       BILLING
    ========================= */

    const billing =

      await billingAgent(
        projectData
      );

    logger.success(
      "Billing Initialized"
    );

    /* =========================
       STEP 6
       SUBSCRIPTION
    ========================= */

    const subscription =

      await subscriptionAgent(
        billing
      );

    logger.success(
      "Subscription Activated"
    );

    /* =========================
       STEP 7
       MONITORING
    ========================= */

    const monitoring =

      await monitoringAgent({

        appName:
        projectData.projectName

      });

    logger.success(
      "Monitoring Started"
    );

    /* =========================
       STEP 8
       SCALING
    ========================= */

    const scaling =

      await scalingAgent({

        cpuUsage:20,

        ramUsage:30

      });

    logger.success(
      "Scaling Initialized"
    );

    /* =========================
       FINAL RESPONSE
    ========================= */

    return {

      success:true,

      message:
      "🚀 Deployment Successful",

      project:

        projectData.projectName,

      deployment:{

        docker,

        aws,

        domain,

        ssl,

        billing,

        subscription,

        monitoring,

        scaling

      },

      liveUrl:

        ssl.ssl.securedUrl

    };

  }

  catch(error){

    logger.error(
      error.message
    );

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
deployAgent;
