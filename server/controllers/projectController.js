const Project =
require(

  "../models/projectModel"

);

const formatResponse =
require(

  "../utils/formatResponse"

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

      userId,

      projectName,

      description,

      framework

    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if(

      !userId ||

      !projectName

    ){

      return res.status(400)
      .json(

        formatResponse({

          success:false,

          message:
          "Missing required fields"

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

        framework

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
   GET USER PROJECTS
========================= */

async function getProjectsController(

  req,

  res

){

  try{

    const {

      userId

    } = req.params;

    const projects =

      await Project.find({

        userId

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

      await Project.findByIdAndUpdate(

        projectId,

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
   EXPORTS
========================= */

module.exports = {

  createProjectController,

  getProjectsController,

  updateProjectStatusController

};
