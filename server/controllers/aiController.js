const masterAgent =
require("../agents/masterAgent");

const formatResponse =
require("../utils/formatResponse");

/* =========================
   AI CONTROLLER
========================= */

async function aiController(
  req,
  res
){

  try{

    /* =========================
       USER PROMPT
    ========================= */

    const {

      prompt

    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if(!prompt){

      return res.status(400)
      .json(

        formatResponse({

          success:false,

          message:
          "Prompt is required"

        })

      );

    }

    /* =========================
       AI PROCESSING
    ========================= */

    const result =

      await masterAgent(
        prompt
      );

    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success:true,

        message:
        "AI response generated",

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
        "AI processing failed",

        error:error.message

      })

    );

  }

}

/* =========================
   EXPORT
========================= */

module.exports =
aiController;
