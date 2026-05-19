/* =========================
   IMPORT AGENTS
========================= */

const intentAgent =
require("../agents/intentAgent");

const planningAgent =
require("../agents/planningAgent");

const builderAgent =
require("../agents/builderAgent");

const fixAgent =
require("../agents/fixAgent");

const deployAgent =
require("../agents/deployAgent");

/* =========================
   AI ROUTER
========================= */

async function aiRouter(userPrompt){

  try{

    /* =========================
       STEP 1
       UNDERSTAND INTENT
    ========================= */

    const intent =
    await intentAgent(
      userPrompt
    );

    if(
      !intent.success
    ){

      return {

        success:false,

        error:
        "Intent Agent Failed"

      };

    }

    /* =========================
       INTENT TYPE
    ========================= */

    const intentType =
    intent.data.intentType;

    /* =========================
       BUILD PROJECT
    ========================= */

    if(
      intentType ===
      "build_project"
    ){

      /* =========================
         PLANNING
      ========================= */

      const plan =
      await planningAgent(
        userPrompt
      );

      if(
        !plan.success
      ){

        return {

          success:false,

          error:
          "Planning Failed"

        };

      }

      /* =========================
         BUILD
      ========================= */

      const build =
      await builderAgent(
        plan.data
      );

      return build;

    }

    /* =========================
       FIX CODE
    ========================= */

    if(
      intentType ===
      "fix_bug"
    ){

      const fixed =
      await fixAgent({

        prompt:userPrompt

      });

      return fixed;

    }

    /* =========================
       DEPLOY
    ========================= */

    if(
      intentType ===
      "deploy_project"
    ){

      const deployed =
      await deployAgent({

        prompt:userPrompt

      });

      return deployed;

    }

    /* =========================
       DEFAULT
    ========================= */

    return {

      success:true,

      data:{

        message:
`
Request analyzed successfully.
`

      }

    };

  }

  catch(error){

    console.log(error);

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
aiRouter;
