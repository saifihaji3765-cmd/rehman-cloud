const express =
require("express");

const router =
express.Router();

/* =========================
   AGENTS
========================= */

const intentAgent =
require("../agents/intentAgent");

const planningAgent =
require("../agents/planningAgent");

const builderAgent =
require("../agents/builderAgent");

const masterAgent =
require("../agents/masterAgent");

const deployAgent =
require("../agents/deployAgent");

/* =========================
   MAIN AI ROUTE
========================= */

router.post(

  "/ai",

  async (req,res) => {

    try{

      const {
        prompt
      } = req.body;

      /* =========================
         STEP 1
         INTENT ANALYSIS
      ========================= */

      const intent =
      await intentAgent(
        prompt
      );

      /* =========================
         STEP 2
         PROJECT PLANNING
      ========================= */

      const plan =
      await planningAgent(
        intent
      );

      /* =========================
         STEP 3
         BUILD PROJECT
      ========================= */

      const build =
      await builderAgent(
        plan
      );

      /* =========================
         STEP 4
         DEPLOY PREPARATION
      ========================= */

      const deploy =
      await deployAgent(
        build
      );

      /* =========================
         STEP 5
         MASTER RESPONSE
      ========================= */

      const finalResponse =
      await masterAgent({

        prompt,
        intent,
        plan,
        build,
        deploy
      });

      /* =========================
         SUCCESS RESPONSE
      ========================= */

      res.json({

        success:true,

        reply:

finalResponse.reply ||

`
✅ Idea understood

🧠 AI planning completed

⚡ Fullstack architecture generated

🚀 Deployment pipeline prepared

🌐 Ready for cloud deployment
`

      });

    }

    catch(error){

      console.log(error);

      res.status(500).json({

        success:false,

        reply:
`
❌ AI system failed
`

      });

    }

  }

);

module.exports =
router;
