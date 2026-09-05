const mongoose = require("mongoose");

const Project =
  require("../models/projectModel");

const formatResponse =
  require("../utils/formatResponse");

const deployAgent =
  require("../agents/deployAgent");

/* =========================================================
   ZYRION OS — ENTERPRISE PROJECT CONTROLLER
   =========================================================
   Core Project + Files + Settings + Activity + Environment
   Builds + Deployments + Members + Logs + Versions
   ========================================================= */

/* =========================================================
   HELPERS
   ========================================================= */

function getUserId(req) {
  return req?.user?.id || req?.user?._id;
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function objectId(id) {
  return new mongoose.Types.ObjectId(id);
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
  if (!project) return null;

  const data =
    typeof project.toObject === "function"
      ? project.toObject()
      : project;

  return data;
}

function cleanString(value, max = 5000) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function parsePagination(req) {
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

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function getResourceCollection() {
  return mongoose.connection.collection(
    "project_resources"
  );
}

async function getOwnedProject(
  projectId,
  userId
) {
  if (
    !isValidObjectId(projectId) ||
    !userId
  ) {
    return null;
  }

  return Project.findOne({
    _id: projectId,
    userId,
    isArchived: false
  });
}

function sendError(
  res,
  status,
  message
) {
  return res.status(status).json(
    formatResponse({
      success: false,
      message
    })
  );
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
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const {
      projectName,
      description = "",
      framework = "Node.js"
    } = req.body || {};

    const cleanName =
      cleanString(projectName, 120);

    if (!cleanName) {
      return sendError(
        res,
        400,
        "Project name required"
      );
    }

    if (cleanName.length > 120) {
      return sendError(
        res,
        400,
        "Project name must be 120 characters or less"
      );
    }

    const normalizedFramework =
      normalizeFramework(framework);

    const project =
      await Project.create({
        userId,

        projectName:
          cleanName,

        description:
          cleanString(
            description,
            5000
          ),

        framework:
          normalizedFramework,

        status:
          "draft",

        deploymentStatus:
          "not_deployed",

        build: {
          status: "idle"
        },

        files: [],

        aiGenerated: true
      });

    /* ============================================
       INITIAL ACTIVITY
       ============================================ */

    await getResourceCollection()
      .insertOne({
        projectId:
          project._id,

        userId:
          objectId(userId),

        type:
          "activity",

        action:
          "project.created",

        message:
          "Project created",

        metadata: {
          framework:
            normalizedFramework
        },

        createdAt:
          new Date()
      });

    return res.status(201).json(
      formatResponse({
        success: true,
        message:
          "Project created",

        data:
          publicProject(project)
      })
    );
  } catch (error) {
    console.error(
      "CREATE PROJECT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Project creation failed"
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
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const {
      page,
      limit,
      skip
    } = parsePagination(req);

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
              Math.ceil(
                total / limit
              )
          }
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECTS ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch projects"
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
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    if (
      !isValidObjectId(projectId)
    ) {
      return sendError(
        res,
        400,
        "Invalid project ID"
      );
    }

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,
        data:
          publicProject(project)
      })
    );
  } catch (error) {
    console.error(
      "GET SINGLE PROJECT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project"
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
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    if (
      !isValidObjectId(projectId)
    ) {
      return sendError(
        res,
        400,
        "Invalid project ID"
      );
    }

    const {
      status,
      deploymentUrl,
      liveUrl,
      projectName,
      description,
      framework
    } = req.body || {};

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
      !allowedStatuses.includes(
        status
      )
    ) {
      return sendError(
        res,
        400,
        "Invalid project status"
      );
    }

    const update = {
      lastActivityAt:
        new Date()
    };

    if (status) {
      update.status =
        status;
    }

    if (
      deploymentUrl !== undefined
    ) {
      update.deploymentUrl =
        cleanString(
          deploymentUrl,
          2000
        );
    }

    if (
      liveUrl !== undefined
    ) {
      update.liveUrl =
        cleanString(
          liveUrl,
          2000
        );
    }

    if (
      projectName !== undefined
    ) {
      update.projectName =
        cleanString(
          projectName,
          120
        );
    }

    if (
      description !== undefined
    ) {
      update.description =
        cleanString(
          description,
          5000
        );
    }

    if (
      framework !== undefined
    ) {
      update.framework =
        normalizeFramework(
          framework
        );
    }

    if (
      status === "deployed"
    ) {
      update.deploymentStatus =
        "deployed";
    }

    const updatedProject =
      await Project.findOneAndUpdate(
        {
          _id:
            projectId,

          userId,

          isArchived:
            false
        },

        {
          $set:
            update,

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
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    await getResourceCollection()
      .insertOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "activity",

        action:
          "project.updated",

        message:
          "Project updated",

        metadata: {
          status:
            status || null
        },

        createdAt:
          new Date()
      });

    return res.json(
      formatResponse({
        success: true,
        message:
          "Project updated",

        data:
          publicProject(
            updatedProject
          )
      })
    );
  } catch (error) {
    console.error(
      "UPDATE PROJECT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Project update failed"
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
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    if (
      !isValidObjectId(projectId)
    ) {
      return sendError(
        res,
        400,
        "Invalid project ID"
      );
    }

    const project =
      await Project.findOneAndUpdate(
        {
          _id:
            projectId,

          userId,

          isArchived:
            false
        },

        {
          $set: {
            isArchived:
              true,

            archivedAt:
              new Date(),

            status:
              "archived",

            lastActivityAt:
              new Date()
          }
        },

        {
          new: true,
          runValidators: true
        }
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    await getResourceCollection()
      .insertOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "activity",

        action:
          "project.archived",

        message:
          "Project archived",

        createdAt:
          new Date()
      });

    return res.json(
      formatResponse({
        success: true,
        message:
          "Project archived"
      })
    );
  } catch (error) {
    console.error(
      "ARCHIVE PROJECT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Project deletion failed"
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
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    if (
      !isValidObjectId(projectId)
    ) {
      return sendError(
        res,
        400,
        "Invalid project ID"
      );
    }

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    if (
      project.status ===
        "deploying" ||
      project.deploymentStatus ===
        "deploying"
    ) {
      return sendError(
        res,
        409,
        "Project deployment is already in progress"
      );
    }

    const startedAt =
      new Date();

    project.status =
      "deploying";

    project.deploymentStatus =
      "deploying";

    project.build = {
      status:
        "building",

      buildId:
        `build_${Date.now()}`,

      startedAt,

      completedAt:
        null,

      errorMessage:
        ""
    };

    await project.save();

    await getResourceCollection()
      .insertOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "build",

        status:
          "building",

        buildId:
          project.build.buildId,

        createdAt:
          new Date()
      });

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
    } catch (
      deploymentError
    ) {
      const completedAt =
        new Date();

      project.status =
        "failed";

      project.deploymentStatus =
        "failed";

      project.build.status =
        "failed";

      project.build.errorMessage =
        "Deployment failed";

      project.build.completedAt =
        completedAt;

      project.deploymentHistory.push({
        deploymentId:
          "",

        provider:
          project.deploymentProvider,

        status:
          "failed",

        errorMessage:
          "Deployment failed",

        startedAt,

        completedAt
      });

      await project.save();

      await getResourceCollection()
        .insertOne({
          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "deployment",

          status:
            "failed",

          errorMessage:
            "Deployment failed",

          createdAt:
            new Date()
        });

      console.error(
        "DEPLOY AGENT ERROR:",
        deploymentError
      );

      return sendError(
        res,
        500,
        "Project deployment failed"
      );
    }

    const liveUrl =
      deployment?.liveUrl ||
      deployment?.url ||
      "";

    const deploymentId =
      deployment?.deploymentId ||
      deployment?.id ||
      "";

    const completedAt =
      new Date();

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
      completedAt;

    project.deploymentHistory.push({
      deploymentId,

      provider:
        project.deploymentProvider,

      status:
        "deployed",

      url:
        liveUrl,

      startedAt,

      completedAt
    });

    await project.save();

    await getResourceCollection()
      .insertOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "deployment",

        status:
          "deployed",

        deploymentId,

        url:
          liveUrl,

        createdAt:
          new Date()
      });

    await getResourceCollection()
      .insertOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "activity",

        action:
          "deployment.completed",

        message:
          "Project deployed successfully",

        metadata: {
          deploymentId,
          liveUrl
        },

        createdAt:
          new Date()
      });

    return res.json(
      formatResponse({
        success: true,

        message:
          "Project deployed successfully",

        data: {
          project:
            publicProject(
              project
            ),

          deployment
        }
      })
    );
  } catch (error) {
    console.error(
      "DEPLOY PROJECT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Project deployment failed"
    );
  }
}

/* =========================================================
   PROJECT FILES
   ========================================================= */

async function getProjectFilesController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,

        data: {
          files:
            project.files || [],

          fileCount:
            project.fileCount ||
            0
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT FILES ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project files"
    );
  }
}

/* =========================================================
   GET SINGLE FILE
   ========================================================= */

async function getProjectFileController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      fileId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const file =
      project.files.id(fileId);

    if (!file) {
      return sendError(
        res,
        404,
        "Project file not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,
        data: file
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT FILE ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project file"
    );
  }
}

/* =========================================================
   CREATE FILE
   ========================================================= */

async function createProjectFileController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const {
      path,
      name,
      type = "file",
      language = "",
      content = "",
      isEntryPoint = false,
      isGenerated = true
    } = req.body || {};

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const cleanPath =
      cleanString(path, 500);

    const cleanName =
      cleanString(name, 200);

    if (
      !cleanPath ||
      !cleanName
    ) {
      return sendError(
        res,
        400,
        "File path and name are required"
      );
    }

    const duplicate =
      project.files.some(
        file =>
          file.path ===
          cleanPath
      );

    if (duplicate) {
      return sendError(
        res,
        409,
        "File already exists"
      );
    }

    project.files.push({
      path:
        cleanPath,

      name:
        cleanName,

      type:
        cleanString(type, 100),

      language:
        cleanString(language, 50),

      content:
        String(content || ""),

      size:
        Buffer.byteLength(
          String(content || ""),
          "utf8"
        ),

      hash:
        "",

      isEntryPoint:
        Boolean(isEntryPoint),

      isGenerated:
        Boolean(isGenerated)
    });

    project.version += 1;

    await project.save();

    await getResourceCollection()
      .insertOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "activity",

        action:
          "file.created",

        message:
          `File created: ${cleanPath}`,

        metadata: {
          path:
            cleanPath
        },

        createdAt:
          new Date()
      });

    return res.status(201).json(
      formatResponse({
        success: true,

        message:
          "Project file created",

        data:
          project.files[
            project.files.length - 1
          ]
      })
    );
  } catch (error) {
    console.error(
      "CREATE PROJECT FILE ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to create project file"
    );
  }
}

/* =========================================================
   UPDATE FILE
   ========================================================= */

async function updateProjectFileController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      fileId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const file =
      project.files.id(fileId);

    if (!file) {
      return sendError(
        res,
        404,
        "Project file not found"
      );
    }

    const {
      path,
      name,
      language,
      content,
      isEntryPoint,
      isGenerated
    } = req.body || {};

    if (path !== undefined)
      file.path =
        cleanString(path, 500);

    if (name !== undefined)
      file.name =
        cleanString(name, 200);

    if (language !== undefined)
      file.language =
        cleanString(
          language,
          50
        );

    if (content !== undefined) {
      file.content =
        String(content);

      file.size =
        Buffer.byteLength(
          String(content),
          "utf8"
        );
    }

    if (
      isEntryPoint !== undefined
    )
      file.isEntryPoint =
        Boolean(isEntryPoint);

    if (
      isGenerated !== undefined
    )
      file.isGenerated =
        Boolean(isGenerated);

    project.version += 1;

    await project.save();

    return res.json(
      formatResponse({
        success: true,

        message:
          "Project file updated",

        data: file
      })
    );
  } catch (error) {
    console.error(
      "UPDATE PROJECT FILE ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to update project file"
    );
  }
}

/* =========================================================
   DELETE FILE
   ========================================================= */

async function deleteProjectFileController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      fileId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const file =
      project.files.id(fileId);

    if (!file) {
      return sendError(
        res,
        404,
        "Project file not found"
      );
    }

    const path =
      file.path;

    file.deleteOne();

    project.version += 1;

    await project.save();

    return res.json(
      formatResponse({
        success: true,

        message:
          "Project file deleted",

        data: {
          path
        }
      })
    );
  } catch (error) {
    console.error(
      "DELETE PROJECT FILE ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to delete project file"
    );
  }
}

/* =========================================================
   PROJECT SETTINGS
   ========================================================= */

async function getProjectSettingsController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const collection =
      getResourceCollection();

    const settings =
      await collection.findOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "settings"
      });

    return res.json(
      formatResponse({
        success: true,

        data:
          settings?.data || {}
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT SETTINGS ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project settings"
    );
  }
}

/* =========================================================
   UPDATE SETTINGS
   ========================================================= */

async function updateProjectSettingsController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const collection =
      getResourceCollection();

    await collection.updateOne(
      {
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "settings"
      },

      {
        $set: {
          data:
            req.body || {},

          updatedAt:
            new Date()
        },

        $setOnInsert: {
          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "settings",

          createdAt:
            new Date()
        }
      },

      {
        upsert: true
      }
    );

    return res.json(
      formatResponse({
        success: true,

        message:
          "Project settings updated",

        data:
          req.body || {}
      })
    );
  } catch (error) {
    console.error(
      "UPDATE PROJECT SETTINGS ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to update project settings"
    );
  }
}

/* =========================================================
   PROJECT ACTIVITY
   ========================================================= */

async function getProjectActivityController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const {
      page,
      limit,
      skip
    } = parsePagination(req);

    const collection =
      getResourceCollection();

    const filter = {
      projectId:
        objectId(projectId),

      userId:
        objectId(userId),

      type:
        "activity"
    };

    const [
      activities,
      total
    ] = await Promise.all([
      collection
        .find(filter)
        .sort({
          createdAt: -1
        })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(
        filter
      )
    ]);

    return res.json(
      formatResponse({
        success: true,

        data: {
          activities,

          pagination: {
            page,
            limit,
            total,
            pages:
              Math.ceil(
                total / limit
              )
          }
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT ACTIVITY ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project activity"
    );
  }
}

/* =========================================================
   ENVIRONMENT
   ========================================================= */

async function getProjectEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const variables =
      await getResourceCollection()
        .find({
          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "environment"
        })
        .project({
          value: 0
        })
        .sort({
          key: 1
        })
        .toArray();

    return res.json(
      formatResponse({
        success: true,

        data: {
          variables
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT ENVIRONMENT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project environment"
    );
  }
}

/* =========================================================
   CREATE ENVIRONMENT VARIABLE
   ========================================================= */

async function createProjectEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const {
      key,
      value,
      environment = "production"
    } = req.body || {};

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const cleanKey =
      cleanString(key, 200);

    if (!cleanKey) {
      return sendError(
        res,
        400,
        "Environment key required"
      );
    }

    const collection =
      getResourceCollection();

    const existing =
      await collection.findOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "environment",

        key:
          cleanKey,

        environment
      });

    if (existing) {
      return sendError(
        res,
        409,
        "Environment variable already exists"
      );
    }

    await collection.insertOne({
      projectId:
        objectId(projectId),

      userId:
        objectId(userId),

      type:
        "environment",

      key:
        cleanKey,

      value:
        String(value || ""),

      environment:
        cleanString(
          environment,
          50
        ),

      createdAt:
        new Date(),

      updatedAt:
        new Date()
    });

    return res.status(201).json(
      formatResponse({
        success: true,

        message:
          "Environment variable created",

        data: {
          key:
            cleanKey,

          environment
        }
      })
    );
  } catch (error) {
    console.error(
      "CREATE PROJECT ENV ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to create environment variable"
    );
  }
}

/* =========================================================
   UPDATE ENVIRONMENT VARIABLE
   ========================================================= */

async function updateProjectEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      variableId
    } = req.params;

    const {
      key,
      value,
      environment
    } = req.body || {};

    const collection =
      getResourceCollection();

    const update = {
      updatedAt:
        new Date()
    };

    if (key !== undefined)
      update.key =
        cleanString(key, 200);

    if (value !== undefined)
      update.value =
        String(value);

    if (
      environment !== undefined
    )
      update.environment =
        cleanString(
          environment,
          50
        );

    const result =
      await collection.updateOne(
        {
          _id:
            objectId(variableId),

          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "environment"
        },

        {
          $set:
            update
        }
      );

    if (!result.matchedCount) {
      return sendError(
        res,
        404,
        "Environment variable not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,

        message:
          "Environment variable updated"
      })
    );
  } catch (error) {
    console.error(
      "UPDATE PROJECT ENV ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to update environment variable"
    );
  }
}

/* =========================================================
   DELETE ENVIRONMENT VARIABLE
   ========================================================= */

async function deleteProjectEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      variableId
    } = req.params;

    const result =
      await getResourceCollection()
        .deleteOne({
          _id:
            objectId(variableId),

          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "environment"
        });

    if (!result.deletedCount) {
      return sendError(
        res,
        404,
        "Environment variable not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,

        message:
          "Environment variable deleted"
      })
    );
  } catch (error) {
    console.error(
      "DELETE PROJECT ENV ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to delete environment variable"
    );
  }
}

/* =========================================================
   BUILD HISTORY
   ========================================================= */

async function getBuildHistoryController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const builds =
      await getResourceCollection()
        .find({
          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "build"
        })
        .sort({
          createdAt: -1
        })
        .limit(100)
        .toArray();

    return res.json(
      formatResponse({
        success: true,
        data: {
          builds
        }
      })
    );
  } catch (error) {
    console.error(
      "GET BUILD HISTORY ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch build history"
    );
  }
}

/* =========================================================
   DEPLOYMENT HISTORY
   ========================================================= */

async function getDeploymentHistoryController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const deployments =
      await getResourceCollection()
        .find({
          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "deployment"
        })
        .sort({
          createdAt: -1
        })
        .limit(100)
        .toArray();

    return res.json(
      formatResponse({
        success: true,

        data: {
          deployments
        }
      })
    );
  } catch (error) {
    console.error(
      "GET DEPLOYMENT HISTORY ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch deployment history"
    );
  }
}

/* =========================================================
   PROJECT MEMBERS
   ========================================================= */

async function getProjectMembersController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const members =
      await getResourceCollection()
        .find({
          projectId:
            objectId(projectId),

          type:
            "member"
        })
        .project({
          email: 1,
          role: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1
        })
        .sort({
          createdAt: 1
        })
        .toArray();

    return res.json(
      formatResponse({
        success: true,
        data: {
          members
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT MEMBERS ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project members"
    );
  }
}

/* =========================================================
   ADD MEMBER
   ========================================================= */

async function addProjectMemberController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const {
      email,
      role = "member"
    } = req.body || {};

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const cleanEmail =
      cleanString(
        email,
        320
      ).toLowerCase();

    if (!cleanEmail) {
      return sendError(
        res,
        400,
        "Member email required"
      );
    }

    const allowedRoles = [
      "owner",
      "admin",
      "developer",
      "viewer",
      "member"
    ];

    if (
      !allowedRoles.includes(role)
    ) {
      return sendError(
        res,
        400,
        "Invalid member role"
      );
    }

    const collection =
      getResourceCollection();

    const existing =
      await collection.findOne({
        projectId:
          objectId(projectId),

        type:
          "member",

        email:
          cleanEmail
      });

    if (existing) {
      return sendError(
        res,
        409,
        "Project member already exists"
      );
    }

    const member = {
      projectId:
        objectId(projectId),

      userId:
        objectId(userId),

      type:
        "member",

      email:
        cleanEmail,

      role,

      status:
        "active",

      createdAt:
        new Date(),

      updatedAt:
        new Date()
    };

    await collection.insertOne(
      member
    );

    return res.status(201).json(
      formatResponse({
        success: true,

        message:
          "Project member added",

        data: {
          email:
            cleanEmail,

          role
        }
      })
    );
  } catch (error) {
    console.error(
      "ADD PROJECT MEMBER ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to add project member"
    );
  }
}

/* =========================================================
   UPDATE MEMBER
   ========================================================= */

async function updateProjectMemberController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      memberId
    } = req.params;

    const {
      role,
      status
    } = req.body || {};

    const allowedRoles = [
      "owner",
      "admin",
      "developer",
      "viewer",
      "member"
    ];

    const allowedStatuses = [
      "active",
      "invited",
      "suspended"
    ];

    if (
      role &&
      !allowedRoles.includes(role)
    ) {
      return sendError(
        res,
        400,
        "Invalid member role"
      );
    }

    if (
      status &&
      !allowedStatuses.includes(status)
    ) {
      return sendError(
        res,
        400,
        "Invalid member status"
      );
    }

    const update = {
      updatedAt:
        new Date()
    };

    if (role)
      update.role =
        role;

    if (status)
      update.status =
        status;

    const result =
      await getResourceCollection()
        .updateOne(
          {
            _id:
              objectId(memberId),

            projectId:
              objectId(projectId),

            type:
              "member"
          },

          {
            $set:
              update
          }
        );

    if (!result.matchedCount) {
      return sendError(
        res,
        404,
        "Project member not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,

        message:
          "Project member updated"
      })
    );
  } catch (error) {
    console.error(
      "UPDATE PROJECT MEMBER ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to update project member"
    );
  }
}

/* =========================================================
   REMOVE MEMBER
   ========================================================= */

async function removeProjectMemberController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      memberId
    } = req.params;

    const result =
      await getResourceCollection()
        .deleteOne({
          _id:
            objectId(memberId),

          projectId:
            objectId(projectId),

          type:
            "member"
        });

    if (!result.deletedCount) {
      return sendError(
        res,
        404,
        "Project member not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,

        message:
          "Project member removed"
      })
    );
  } catch (error) {
    console.error(
      "REMOVE PROJECT MEMBER ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to remove project member"
    );
  }
}

/* =========================================================
   PROJECT LOGS
   ========================================================= */

async function getProjectLogsController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const {
      page,
      limit,
      skip
    } = parsePagination(req);

    const filter = {
      projectId:
        objectId(projectId),

      userId:
        objectId(userId),

      type:
        "log"
    };

    if (req.query.level) {
      filter.level =
        cleanString(
          req.query.level,
          30
        );
    }

    if (req.query.source) {
      filter.source =
        cleanString(
          req.query.source,
          100
        );
    }

    if (req.query.buildId) {
      filter.buildId =
        cleanString(
          req.query.buildId,
          300
        );
    }

    if (req.query.deploymentId) {
      filter.deploymentId =
        cleanString(
          req.query.deploymentId,
          300
        );
    }

    const collection =
      getResourceCollection();

    const [
      logs,
      total
    ] = await Promise.all([
      collection
        .find(filter)
        .sort({
          createdAt: -1
        })
        .skip(skip)
        .limit(limit)
        .toArray(),

      collection.countDocuments(
        filter
      )
    ]);

    return res.json(
      formatResponse({
        success: true,

        data: {
          logs,

          pagination: {
            page,
            limit,
            total,
            pages:
              Math.ceil(
                total / limit
              )
          }
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT LOGS ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project logs"
    );
  }
}

/* =========================================================
   PROJECT VERSIONS
   ========================================================= */

async function getProjectVersionsController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const versions =
      await getResourceCollection()
        .find({
          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "version"
        })
        .sort({
          versionNumber: -1
        })
        .limit(100)
        .toArray();

    return res.json(
      formatResponse({
        success: true,

        data: {
          versions
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT VERSIONS ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project versions"
    );
  }
}

/* =========================================================
   GET SINGLE VERSION
   ========================================================= */

async function getProjectVersionController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      versionId
    } = req.params;

    const version =
      await getResourceCollection()
        .findOne({
          _id:
            objectId(versionId),

          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "version"
        });

    if (!version) {
      return sendError(
        res,
        404,
        "Project version not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,
        data: version
      })
    );
  } catch (error) {
    console.error(
      "GET PROJECT VERSION ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to fetch project version"
    );
  }
}

/* =========================================================
   CREATE VERSION
   ========================================================= */

async function createProjectVersionController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const collection =
      getResourceCollection();

    const latest =
      await collection
        .find({
          projectId:
            objectId(projectId),

          type:
            "version"
        })
        .sort({
          versionNumber: -1
        })
        .limit(1)
        .toArray();

    const versionNumber =
      latest.length
        ? latest[0].versionNumber + 1
        : 1;

    const version = {
      projectId:
        objectId(projectId),

      userId:
        objectId(userId),

      type:
        "version",

      versionNumber,

      projectVersion:
        project.version,

      projectName:
        project.projectName,

      framework:
        project.framework,

      files:
        project.files || [],

      status:
        project.status,

      createdAt:
        new Date()
    };

    const result =
      await collection.insertOne(
        version
      );

    return res.status(201).json(
      formatResponse({
        success: true,

        message:
          "Project version created",

        data: {
          ...version,
          _id:
            result.insertedId
        }
      })
    );
  } catch (error) {
    console.error(
      "CREATE PROJECT VERSION ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to create project version"
    );
  }
}

/* =========================================================
   RESTORE VERSION
   ========================================================= */

async function restoreProjectVersionController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const {
      projectId,
      versionId
    } = req.params;

    const project =
      await getOwnedProject(
        projectId,
        userId
      );

    if (!project) {
      return sendError(
        res,
        404,
        "Project not found"
      );
    }

    const version =
      await getResourceCollection()
        .findOne({
          _id:
            objectId(versionId),

          projectId:
            objectId(projectId),

          userId:
            objectId(userId),

          type:
            "version"
        });

    if (!version) {
      return sendError(
        res,
        404,
        "Project version not found"
      );
    }

    project.files =
      version.files || [];

    project.framework =
      version.framework ||
      project.framework;

    project.projectName =
      version.projectName ||
      project.projectName;

    project.version += 1;

    await project.save();

    await getResourceCollection()
      .insertOne({
        projectId:
          objectId(projectId),

        userId:
          objectId(userId),

        type:
          "activity",

        action:
          "version.restored",

        message:
          `Project version ${version.versionNumber} restored`,

        metadata: {
          versionId,
          versionNumber:
            version.versionNumber
        },

        createdAt:
          new Date()
      });

    return res.json(
      formatResponse({
        success: true,

        message:
          "Project version restored",

        data:
          publicProject(project)
      })
    );
  } catch (error) {
    console.error(
      "RESTORE PROJECT VERSION ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to restore project version"
    );
  }
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {

  /* Core */
  createProjectController,
  getProjectsController,
  getSingleProjectController,
  updateProjectStatusController,
  deleteProjectController,
  deployProjectController,

  /* Files */
  getProjectFilesController,
  getProjectFileController,
  createProjectFileController,
  updateProjectFileController,
  deleteProjectFileController,

  /* Settings */
  getProjectSettingsController,
  updateProjectSettingsController,

  /* Activity */
  getProjectActivityController,

  /* Environment */
  getProjectEnvironmentController,
  createProjectEnvironmentController,
  updateProjectEnvironmentController,
  deleteProjectEnvironmentController,

  /* Builds */
  getBuildHistoryController,

  /* Deployments */
  getDeploymentHistoryController,

  /* Members */
  getProjectMembersController,
  addProjectMemberController,
  updateProjectMemberController,
  removeProjectMemberController,

  /* Logs */
  getProjectLogsController,

  /* Versions */
  getProjectVersionsController,
  getProjectVersionController,
  createProjectVersionController,
  restoreProjectVersionController
};
