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
){

try{

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
   AI RESPONSE
========================= */

const result =

await masterAgent({

  type:"chat",

  prompt

});

/* =========================
   RESPONSE
========================= */

return res.json(

  formatResponse({

    success:true,

    message:
    "AI chat generated",

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
    "AI chat failed",

    error:error.message

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
){

try{

const {

  prompt,

  framework

} = req.body;

if(!prompt){

  return res.status(400)
  .json(

    formatResponse({

      success:false,

      message:
      "Code prompt required"

    })

  );

}

const result =

await masterAgent({

  type:"code",

  prompt,

  framework

});

return res.json(

  formatResponse({

    success:true,

    message:
    "Code generated",

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
    "Code generation failed",

    error:error.message

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
){

try{

const {

  projectId

} = req.body;

if(!projectId){

  return res.status(400)
  .json(

    formatResponse({

      success:false,

      message:
      "Project ID required"

    })

  );

}

const result =

await masterAgent({

  type:"deploy",

  projectId

});

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
AI THUMBNAIL CONTROLLER
========================= */

async function aiThumbnailController(
req,
res
){

try{

const {

  prompt

} = req.body;

if(!prompt){

  return res.status(400)
  .json(

    formatResponse({

      success:false,

      message:
      "Thumbnail prompt required"

    })

  );

}

const result =

await masterAgent({

  type:"thumbnail",

  prompt

});

return res.json(

  formatResponse({

    success:true,

    message:
    "Thumbnail generated",

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
    "Thumbnail generation failed",

    error:error.message

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
