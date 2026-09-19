const masterAgent =
  require("../agents/masterAgent");

const formatResponse =
  require("../utils/formatResponse");


/* =========================================================
   COMMON HELPERS
========================================================= */

function sendError(
  res,
  status,
  message,
  error = null,
  data = null
) {
  return res
    .status(status)
    .json(
      formatResponse({
        success: false,
        message,
        error,
        data
      })
    );
}


function getCleanString(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}


/* =========================================================
   AI CHAT
========================================================= */

async function aiChatController(
  req,
  res
) {

  try {

    const prompt =
      getCleanString(
        req.body?.prompt
      );


    if (!prompt) {

      return sendError(
        res,
        400,
        "Prompt is required"
      );

    }


    const result =
      await masterAgent({

        type: "chat",

        prompt,

        user:
          req.user || {}

      });


    if (
      result?.success === false
    ) {

      return sendError(

        res,

        500,

        result?.message ||
          "AI chat failed",

        result?.error ||
          null,

        result

      );

    }


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


    return sendError(

      res,

      500,

      "AI chat failed",

      error?.message ||
        "Unknown AI chat error"

    );

  }

}


/* =========================================================
   AI CODE GENERATION
========================================================= */

async function aiCodeController(
  req,
  res
) {

  try {

    const prompt =
      getCleanString(
        req.body?.prompt
      );


    const framework =
      getCleanString(
        req.body?.framework
      ) ||
      "React";


    if (!prompt) {

      return sendError(

        res,

        400,

        "Code prompt required"

      );

    }


    const result =
      await masterAgent({

        type: "code",

        prompt,

        framework,

        user:
          req.user || {}

      });


    if (
      result?.success === false
    ) {

      return sendError(

        res,

        500,

        result?.message ||
          "Code generation failed",

        result?.error ||
          null,

        result

      );

    }


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


    return sendError(

      res,

      500,

      "Code generation failed",

      error?.message ||
        "Unknown AI code generation error"

    );

  }

}


/* =========================================================
   AI DEPLOYMENT
========================================================= */

async function aiDeployController(
  req,
  res
) {

  try {

    const projectId =
      getCleanString(
        req.body?.projectId
      );


    if (!projectId) {

      return sendError(

        res,

        400,

        "Project ID required"

      );

    }


    const result =
      await masterAgent({

        type: "deploy",

        projectId,

        prompt:
          `Deploy project ${projectId}`,

        user:
          req.user || {}

      });


    if (
      result?.success === false
    ) {

      return sendError(

        res,

        500,

        result?.message ||
          "Deployment failed",

        result?.error ||
          null,

        result

      );

    }


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


    return sendError(

      res,

      500,

      "Deployment failed",

      error?.message ||
        "Unknown deployment error"

    );

  }

}


/* =========================================================
   AI THUMBNAIL
========================================================= */

async function aiThumbnailController(
  req,
  res
) {

  try {

    const prompt =
      getCleanString(
        req.body?.prompt
      );


    if (!prompt) {

      return sendError(

        res,

        400,

        "Thumbnail prompt required"

      );

    }


    const result =
      await masterAgent({

        type: "thumbnail",

        prompt,

        user:
          req.user || {}

      });


    if (
      result?.success === false
    ) {

      return sendError(

        res,

        500,

        result?.message ||
          "Thumbnail generation failed",

        result?.error ||
          null,

        result

      );

    }


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


    return sendError(

      res,

      500,

      "Thumbnail generation failed",

      error?.message ||
        "Unknown thumbnail generation error"

    );

  }

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  aiChatController,

  aiCodeController,

  aiDeployController,

  aiThumbnailController

};
