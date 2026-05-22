const deployAgent =
require("../agents/deployAgent");

const formatResponse =
require("../utils/formatResponse");

/* =========================
   DEPLOY CONTROLLER
========================= */

async function deployController(
  req,
  res
){

  try{

    /* =========================
       REQUEST DATA
    ========================= */

    const projectData =
    req.body;

    /* =========================
       DEPLOY
    ========================= */

    const result =

      await deployAgent(
        projectData
      );

    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success:true,

        message:
        "Deployment initialized",

        data:result

      })

    );

  }

  catch(error){

    return res.status(500)
    .json(

      formatResponse({

        success:false,

        message:
        "Deployment failed",

        error:error.message

      })

    );

  }

}

/* =========================
   EXPORT
========================= */

module.exports =
deployController;
