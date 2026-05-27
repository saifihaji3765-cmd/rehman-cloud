const Project =
require(

"../models/projectModel"

);

const formatResponse =
require(

"../utils/formatResponse"

);

const deployAgent =
require(

"../agents/deployAgent"

);

/* =========================
CREATE PROJECT
========================= */

async function createProjectController(

req,

res

){

try{

const {

  projectName,

  description,

  framework

} = req.body;

/* =========================
   USER
========================= */

const userId =
req.user.id;

/* =========================
   VALIDATION
========================= */

if(

  !projectName

){

  return res.status(400)
  .json(

    formatResponse({

      success:false,

      message:
      "Project name required"

    })

  );

}

/* =========================
   CREATE PROJECT
========================= */

const project =

  await Project.create({

    userId,

    projectName,

    description,

    framework,

    status:"draft"

  });

return res.json(

  formatResponse({

    success:true,

    message:
    "Project created",

    data:project

  })

);

}

catch(error){

return res.status(500)
.json(

  formatResponse({

    success:false,

    message:
    "Project creation failed",

    error:error.message

  })

);

}

}

/* =========================
GET MY PROJECTS
========================= */

async function getProjectsController(

req,

res

){

try{

const userId =
req.user.id;

const projects =

  await Project.find({

    userId

  }).sort({

    createdAt:-1

  });

return res.json(

  formatResponse({

    success:true,

    data:projects

  })

);

}

catch(error){

return res.status(500)
.json(

  formatResponse({

    success:false,

    message:
    "Failed to fetch projects",

    error:error.message

  })

);

}

}

/* =========================
GET SINGLE PROJECT
========================= */

async function getSingleProjectController(

req,

res

){

try{

const {

  projectId

} = req.params;

const project =

  await Project.findOne({

    _id:projectId,

    userId:req.user.id

  });

if(!project){

  return res.status(404)
  .json({

    success:false,

    message:
    "Project not found"

  });

}

return res.json({

  success:true,

  data:project

});

}

catch(error){

return res.status(500)
.json({

  success:false,

  error:error.message

});

}

}

/* =========================
UPDATE PROJECT STATUS
========================= */

async function updateProjectStatusController(

req,

res

){

try{

const {

  projectId

} = req.params;

const {

  status,

  deploymentUrl

} = req.body;

const updatedProject =

  await Project.findOneAndUpdate(

    {

      _id:projectId,

      userId:req.user.id

    },

    {

      status,

      deploymentUrl

    },

    {

      new:true

    }

  );

return res.json(

  formatResponse({

    success:true,

    message:
    "Project updated",

    data:updatedProject

  })

);

}

catch(error){

return res.status(500)
.json(

  formatResponse({

    success:false,

    message:
    "Project update failed",

    error:error.message

  })

);

}

}

/* =========================
DELETE PROJECT
========================= */

async function deleteProjectController(

req,

res

){

try{

const {

  projectId

} = req.params;

await Project.findOneAndDelete({

  _id:projectId,

  userId:req.user.id

});

return res.json({

  success:true,

  message:
  "Project deleted"

});

}

catch(error){

return res.status(500)
.json({

  success:false,

  error:error.message

});

}

}

/* =========================
DEPLOY PROJECT
========================= */

async function deployProjectController(

req,

res

){

try{

const {

  projectId

} = req.params;

const project =

  await Project.findOne({

    _id:projectId,

    userId:req.user.id

  });

if(!project){

  return res.status(404)
  .json({

    success:false,

    message:
    "Project not found"

  });

}

/* =========================
   DEPLOY
========================= */

const deployment =

  await deployAgent({

    projectName:
    project.projectName,

    framework:
    project.framework

  });

/* =========================
   UPDATE PROJECT
========================= */

project.status =
"deployed";

project.deploymentUrl =
deployment.liveUrl;

await project.save();

return res.json({

  success:true,

  deployment

});

}

catch(error){

return res.status(500)
.json({

  success:false,

  error:error.message

});

}

}

/* =========================
EXPORTS
========================= */

module.exports = {

createProjectController,

getProjectsController,

getSingleProjectController,

updateProjectStatusController,

deleteProjectController,

deployProjectController

};
