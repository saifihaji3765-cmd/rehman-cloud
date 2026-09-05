const mongoose = require("mongoose");

const Project =
  require("../models/projectModel");

const formatResponse =
  require("../utils/formatResponse");

const deployAgent =
  require("../agents/deployAgent");

/* =========================================================
   HELPERS
   ========================================================= */

function getUserId(req) {
  return req?.user?.id || req?.user?._id;
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeFramework(framework) {
  const allowed = [
    "React",
    "Next.js",
    "Vue",
    "Node.js",
    "Express",
    "Other"
  ];

  return allowed.includes(framework)
    ? framework
    : "Node.js";
}

function publicProject(project) {
  if (!project) {
    return null;
  }

  const data =
    typeof project.toObject === "function"
      ? project.toObject()
      : project;

  return data;
}

/* =========================================================
   CREATE PROJECT
   ========================================================= */

async function createProjectController(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json(
        formatResponse({
          success: false,
          message: "Authentication required"
        })
      );
    }

    const {
      projectName,
      description = "",
      framework = "Node.js"
    } = req.body || {};

    const cleanName =
      String(projectName || "").trim();

    if (!cleanName) {
      return res.status(400).json(
        formatResponse({
          success: false,
          message: "Project name required"
        })
      );
    }

    if (cleanName.length > 120) {
      return res.status(400).json(
        formatResponse({
          success: false,
          message:
            "Project name must be 120 characters or less"
        })
      );
    }

    const normalizedFramework =
      normalizeFramework(framework);

    /* ============================================
       CREATE
       ============================================ */

    const project =
      await Project.create({
        userId,

        projectName: cleanName,

        description:
          String(description || "").trim(),

        framework:
          normalizedFramework,

        status: "draft",

        deploymentStatus:
          "not_deployed",

        build: {
          status: "idle"
        },

        files: [],

        aiGenerated: true
      });

    return res.status(201).json(
      formatResponse({
        success: true,
        message: "Project created",
        data: publicProject(project)
      })
    );
  } catch (error) {
    console.error(
      "CREATE PROJECT ERROR:",
      error
    );

    return res.status(500).json(
      formatResponse({
        success: false,
        message:
          "Project creation failed"
      })
    );
  }
}

/* =========================================================
   GET MY PROJECTS
   ========================================================= */

async function getProjectsController(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json(
        formatResponse({
          success: false,
          message: "Authentication required"
        })
      );
    }

    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        parseInt(req.query.limit, 10) || 20,
        1
      ),
      100
    );

    const skip =
      (page - 1) * limit;

    const filter = {
      userId,
      isArchived: false
    };

    const [
      projects,
      total
    ] = await Promise.all([
      Project.find(filter)
        .sort({
          lastActivityAt: -1,
          createdAt: -1
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Project.countDocuments(filter)
    ]);

    return res.json(
      formatResponse({
        success: true,

        data: {
          projects,

          pagination: {
            page,
            limit,
            total,
            pages:
              Math.ceil(total / limit)
          }
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECTS ERROR:",
      error
    );

    return res.status(500).json(
      formatResponse({
        success: false,
        message:
          "Failed to fetch projects"
      })
    );
  }
}

/* =========================================================
   GET SINGLE PROJECT
   ========================================================= */

async function getSingleProjectController(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    const { projectId } =
      req.params;

    if (!userId) {
      return res.status(401).json(
        formatResponse({
          success: false,
          message: "Authentication required"
        })
      );
    }

    if (!isValidObjectId(projectId)) {
      return res.status(400).json(
        formatResponse({
          success: false,
          message: "Invalid project ID"
        })
      );
    }

    const project =
      await Project.findOne({
        _id: projectId,
        userId,
        isArchived: false
      });

    if (!project) {
      return res.status(404).json(
        formatResponse({
          success: false,
          message: "Project not found"
        })
      );
    }

    return res.json(
      formatResponse({
        success: true,
        data: publicProject(project)
      })
    );
  } catch (error) {
    console.error(
      "GET SINGLE PROJECT ERROR:",
      error
    );

    return res.status(500).json(
      formatResponse({
        success: false,
        message:
          "Failed to fetch project"
      })
    );
  }
}

/* =========================================================
   UPDATE PROJECT
   ========================================================= */

async function updateProjectStatusController(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    const { projectId } =
      req.params;

    const {
      status,
      deploymentUrl,
      liveUrl
    } = req.body || {};

    if (!userId) {
      return res.status(401).json(
        formatResponse({
          success: false,
          message: "Authentication required"
        })
      );
    }

    if (!isValidObjectId(projectId)) {
      return res.status(400).json(
        formatResponse({
          success: false,
          message: "Invalid project ID"
        })
      );
    }

    const allowedStatuses = [
      "draft",
      "building",
      "deploying",
      "deployed",
      "failed",
      "stopped"
    ];

    if (
      status &&
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json(
        formatResponse({
          success: false,
          message: "Invalid project status"
        })
      );
    }

    const update = {
      lastActivityAt: new Date()
    };

    if (status) {
      update.status = status;
    }

    if (deploymentUrl !== undefined) {
      update.deploymentUrl =
        String(deploymentUrl || "").trim();
    }

    if (liveUrl !== undefined) {
      update.liveUrl =
        String(liveUrl || "").trim();
    }

    if (status === "deployed") {
      update.deploymentStatus =
        "deployed";
    }

    const updatedProject =
      await Project.findOneAndUpdate(
        {
          _id: projectId,
          userId,
          isArchived: false
        },

        {
          $set: update,

          $inc: {
            version: 1
          }
        },

        {
          new: true,
          runValidators: true
        }
      );

    if (!updatedProject) {
      return res.status(404).json(
        formatResponse({
          success: false,
          message: "Project not found"
        })
      );
    }

    return res.json(
      formatResponse({
        success: true,
        message: "Project updated",
        data: publicProject(
          updatedProject
        )
      })
    );
  } catch (error) {
    console.error(
      "UPDATE PROJECT ERROR:",
      error
    );

    return res.status(500).json(
      formatResponse({
        success: false,
        message:
          "Project update failed"
      })
    );
  }
}

/* =========================================================
   ARCHIVE PROJECT
   ========================================================= */

async function deleteProjectController(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    const { projectId } =
      req.params;

    if (!userId) {
      return res.status(401).json(
        formatResponse({
          success: false,
          message: "Authentication required"
        })
      );
    }

    if (!isValidObjectId(projectId)) {
      return res.status(400).json(
        formatResponse({
          success: false,
          message: "Invalid project ID"
        })
      );
    }

    const project =
      await Project.findOneAndUpdate(
        {
          _id: projectId,
          userId,
          isArchived: false
        },

        {
          $set: {
            isArchived: true,
            archivedAt: new Date(),
            status: "archived",
            lastActivityAt: new Date()
          }
        },

        {
          new: true,
          runValidators: true
        }
      );

    if (!project) {
      return res.status(404).json(
        formatResponse({
          success: false,
          message: "Project not found"
        })
      );
    }

    return res.json(
      formatResponse({
        success: true,
        message: "Project archived"
      })
    );
  } catch (error) {
    console.error(
      "DELETE PROJECT ERROR:",
      error
    );

    return res.status(500).json(
      formatResponse({
        success: false,
        message:
          "Project deletion failed"
      })
    );
  }
}

/* =========================================================
   DEPLOY PROJECT
   ========================================================= */

async function deployProjectController(
  req,
  res
) {
  try {
    const userId = getUserId(req);

    const { projectId } =
      req.params;

    if (!userId) {
      return res.status(401).json(
        formatResponse({
          success: false,
          message: "Authentication required"
        })
      );
    }

    if (!isValidObjectId(projectId)) {
      return res.status(400).json(
        formatResponse({
          success: false,
          message: "Invalid project ID"
        })
      );
    }

    const project =
      await Project.findOne({
        _id: projectId,
        userId,
        isArchived: false
      });

    if (!project) {
      return res.status(404).json(
        formatResponse({
          success: false,
          message: "Project not found"
        })
      );
    }

    /* ============================================
       PREVENT DUPLICATE DEPLOYMENT
       ============================================ */

    if (
      project.status === "deploying" ||
      project.deploymentStatus ===
        "deploying"
    ) {
      return res.status(409).json(
        formatResponse({
          success: false,
          message:
            "Project deployment is already in progress"
        })
      );
    }

    /* ============================================
       MARK DEPLOYMENT START
       ============================================ */

    project.status =
      "deploying";

    project.deploymentStatus =
      "deploying";

    project.build = {
      ...project.build?.toObject?.(),
      status: "building",
      startedAt: new Date(),
      completedAt: null,
      errorMessage: ""
    };

    await project.save();

    /* ============================================
       DEPLOY AGENT
       ============================================ */

    let deployment;

    try {
      deployment =
        await deployAgent({
          projectId:
            project._id.toString(),

          projectName:
            project.projectName,

          framework:
            project.framework,

          files:
            project.files,

          deploymentProvider:
            project.deploymentProvider,

          repositoryUrl:
            project.repositoryUrl
        });
    } catch (deploymentError) {
      project.status =
        "failed";

      project.deploymentStatus =
        "failed";

      project.build.status =
        "failed";

      project.build.errorMessage =
        "Deployment failed";

      project.build.completedAt =
        new Date();

      project.deploymentHistory.push({
        deploymentId: "",
        provider:
          project.deploymentProvider,
        status: "failed",
        errorMessage:
          "Deployment failed",
        startedAt:
          project.build.startedAt,
        completedAt:
          new Date()
      });

      await project.save();

      console.error(
        "DEPLOY AGENT ERROR:",
        deploymentError
      );

      return res.status(500).json(
        formatResponse({
          success: false,
          message:
            "Project deployment failed"
        })
      );
    }

    /* ============================================
       EXTRACT DEPLOYMENT RESULT
       ============================================ */

    const liveUrl =
      deployment?.liveUrl ||
      deployment?.url ||
      "";

    const deploymentId =
      deployment?.deploymentId ||
      deployment?.id ||
      "";

    /* ============================================
       FINALIZE PROJECT
       ============================================ */

    project.status =
      "deployed";

    project.deploymentStatus =
      "deployed";

    project.deploymentUrl =
      liveUrl;

    project.liveUrl =
      liveUrl;

    project.deploymentId =
      deploymentId;

    project.build.status =
      "success";

    project.build.completedAt =
      new Date();

    project.deploymentHistory.push({
      deploymentId,

      provider:
        project.deploymentProvider,

      status: "deployed",

      url: liveUrl,

      startedAt:
        project.build.startedAt,

      completedAt:
        new Date()
    });

    await project.save();

    return res.json(
      formatResponse({
        success: true,
        message:
          "Project deployed successfully",

        data: {
          project:
            publicProject(project),

          deployment
        }
      })
    );
  } catch (error) {
    console.error(
      "DEPLOY PROJECT ERROR:",
      error
    );

    return res.status(500).json(
      formatResponse({
        success: false,
        message:
          "Project deployment failed"
      })
    );
  }
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  createProjectController,

  getProjectsController,

  getSingleProjectController,

  updateProjectStatusController,

  deleteProjectController,

  deployProjectController
};
