const masterAgent =
  require("../agents/masterAgent");

const formatResponse =
  require("../utils/formatResponse");


/* =========================
   AI CHAT CONTROLLER
========================= */

async function aiChatController(
  req,
  res
) {

  try {

    const {
      prompt
    } = req.body || {};


    /* =========================
       VALIDATION
    ========================= */

    if (
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {

      return res
        .status(400)
        .json(

          formatResponse({

            success: false,

            message:
              "Prompt is required"

          })

        );

    }


    /* =========================
       AI RESPONSE
    ========================= */

    const result =

      await masterAgent({

        type: "chat",

        prompt:
          prompt.trim(),

        user:
          req.user || {}

      });


    /* =========================
       MASTER AGENT FAILURE
    ========================= */

    if (
      result?.success === false
    ) {

      return res
        .status(500)
        .json(

          formatResponse({

            success: false,

            message:
              result?.message ||
              "AI chat failed",

            error:
              result?.error || null

          })

        );

    }


    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success: true,

        message:
          "AI chat generated",

        data:
          result

      })

    );

  }

  catch (error) {

    console.error(
      "AI chat controller error:",
      error
    );

    return res
      .status(500)
      .json(

        formatResponse({

          success: false,

          message:
            "AI chat failed",

          error:
            error.message

        })

      );

  }

}


/* =========================
   AI CODE CONTROLLER
========================= */

async function aiCodeController(
  req,
  res
) {

  try {

    const {

      prompt,

      framework

    } = req.body || {};


    /* =========================
       VALIDATION
    ========================= */

    if (
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {

      return res
        .status(400)
        .json(

          formatResponse({

            success: false,

            message:
              "Code prompt required"

          })

        );

    }


    /* =========================
       AI CODE GENERATION
    ========================= */

    const result =

      await masterAgent({

        type: "code",

        prompt:
          prompt.trim(),

        framework:

          typeof framework === "string" &&
          framework.trim()
            ? framework.trim()
            : "React",

        user:
          req.user || {}

      });


    /* =========================
       MASTER AGENT FAILURE
    ========================= */

    if (
      result?.success === false
    ) {

      return res
        .status(500)
        .json(

          formatResponse({

            success: false,

            message:
              result?.message ||
              "Code generation failed",

            error:
              result?.error || null,

            data:
              result

          })

        );

    }


    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success: true,

        message:
          "Code generated",

        data:
          result

      })

    );

  }

  catch (error) {

    console.error(
      "AI code controller error:",
      error
    );

    return res
      .status(500)
      .json(

        formatResponse({

          success: false,

          message:
            "Code generation failed",

          error:
            error.message

        })

      );

  }

}


/* =========================
   AI DEPLOY CONTROLLER
========================= */

async function aiDeployController(
  req,
  res
) {

  try {

    const {

      projectId

    } = req.body || {};


    /* =========================
       VALIDATION
    ========================= */

    if (
      projectId === undefined ||
      projectId === null ||
      String(projectId).trim() === ""
    ) {

      return res
        .status(400)
        .json(

          formatResponse({

            success: false,

            message:
              "Project ID required"

          })

        );

    }


    /* =========================
       DEPLOYMENT
    ========================= */

    const result =

      await masterAgent({

        type: "deploy",

        projectId:
          String(projectId).trim(),

        prompt:
          `Deploy project ${String(projectId).trim()}`,

        user:
          req.user || {}

      });


    /* =========================
       MASTER AGENT FAILURE
    ========================= */

    if (
      result?.success === false
    ) {

      return res
        .status(500)
        .json(

          formatResponse({

            success: false,

            message:
              result?.message ||
              "Deployment failed",

            error:
              result?.error || null,

            data:
              result

          })

        );

    }


    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success: true,

        message:
          "Deployment initialized",

        data:
          result

      })

    );

  }

  catch (error) {

    console.error(
      "AI deployment controller error:",
      error
    );

    return res
      .status(500)
      .json(

        formatResponse({

          success: false,

          message:
            "Deployment failed",

          error:
            error.message

        })

      );

  }

}


/* =========================
   AI THUMBNAIL CONTROLLER
========================= */

async function aiThumbnailController(
  req,
  res
) {

  try {

    const {

      prompt

    } = req.body || {};


    /* =========================
       VALIDATION
    ========================= */

    if (
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {

      return res
        .status(400)
        .json(

          formatResponse({

            success: false,

            message:
              "Thumbnail prompt required"

          })

        );

    }


    /* =========================
       THUMBNAIL GENERATION
    ========================= */

    const result =

      await masterAgent({

        type: "thumbnail",

        prompt:
          prompt.trim(),

        user:
          req.user || {}

      });


    /* =========================
       MASTER AGENT FAILURE
    ========================= */

    if (
      result?.success === false
    ) {

      return res
        .status(500)
        .json(

          formatResponse({

            success: false,

            message:
              result?.message ||
              "Thumbnail generation failed",

            error:
              result?.error || null,

            data:
              result

          })

        );

    }


    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success: true,

        message:
          "Thumbnail generated",

        data:
          result

      })

    );

  }

  catch (error) {

    console.error(
      "AI thumbnail controller error:",
      error
    );

    return res
      .status(500)
      .json(

        formatResponse({

          success: false,

          message:
            "Thumbnail generation failed",

          error:
            error.message

        })

      );

  }

}


/* =========================
   EXPORTS
========================= */

module.exports = {

  aiChatController,

  aiCodeController,

  aiDeployController,

  aiThumbnailController

};
