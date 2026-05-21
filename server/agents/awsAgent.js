const {
  ec2,
  s3,
  route53
} = require(
  "../config/aws"
);

/* =========================
   AWS AGENT
========================= */

async function awsAgent(){

  try{

    /* =========================
       AWS STATUS
    ========================= */

    const status = {

      success:true,

      cloudProvider:
      "AWS",

      services:{

        ec2:true,

        s3:true,

        route53:true

      },

      region:
      process.env.AWS_REGION,

      deploymentReady:true,

      timestamp:
      new Date()

    };

    /* =========================
       RETURN
    ========================= */

    return status;

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
awsAgent;
