const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

/* =========================================================
   CONTROLLERS
========================================================= */

const {
  createProjectController,
  getProjectsController,
  getSingleProjectController,
  updateProjectStatusController,
  deleteProjectController,
  deployProjectController,

  /* Project Files */
  getProjectFilesController,
  getProjectFileController,
  createProjectFileController,
  updateProjectFileController,
  deleteProjectFileController,

  /* Project Settings */
  getProjectSettingsController,
  updateProjectSettingsController,

  /* Project Activity */
  getProjectActivityController,

  /* Project Environment */
  getProjectEnvironmentController,
  createProjectEnvironmentController,
  updateProjectEnvironmentController,
  deleteProjectEnvironmentController,

  /* Build History */
  getBuildHistoryController,

  /* Deployment History */
  getDeploymentHistoryController,

  /* Project Members */
  getProjectMembersController,
  addProjectMemberController,
  updateProjectMemberController,
  removeProjectMemberController,

  /* Project Logs */
  getProjectLogsController,

  /* Project Versions */
  getProjectVersionsController,
  getProjectVersionController,
  createProjectVersionController,
  restoreProjectVersionController

} = require("../controllers/projectController");

/* =========================================================
   MIDDLEWARE
========================================================= */

const {
  authMiddleware
} = require("../middleware/authMiddleware");

const {
  apiLimiter
} = require("../middleware/rateLimiter");

/* =========================================================
   PROJECT ID VALIDATION
========================================================= */

function validateProjectId(req, res, next) {

  const { projectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(projectId)) {

    return res.status(400).json({
      success: false,
      message: "Invalid project ID"
    });

  }

  next();

}

/* =========================================================
   PROJECT INPUT NORMALIZATION
========================================================= */

function normalizeProjectInput(req, res, next) {

  if (req.body && typeof req.body === "object") {

    if (
      typeof req.body.projectName === "string"
    ) {
      req.body.projectName =
        req.body.projectName.trim();
    }

    if (
      typeof req.body.description === "string"
    ) {
      req.body.description =
        req.body.description.trim();
    }

    if (
      typeof req.body.framework === "string"
    ) {
      req.body.framework =
        req.body.framework.trim();
    }

  }

  next();

}

/* =========================================================
   GLOBAL PROJECT API SECURITY
========================================================= */

router.use(
  authMiddleware
);

router.use(
  apiLimiter
);

/* =========================================================
   CORE PROJECT
========================================================= */

/* Create */

router.post(
  "/create",
  normalizeProjectInput,
  createProjectController
);

/* My Projects */

router.get(
  "/me",
  getProjectsController
);

/* Single Project */

router.get(
  "/:projectId",
  validateProjectId,
  getSingleProjectController
);

/* Update */

router.patch(
  "/update/:projectId",
  validateProjectId,
  normalizeProjectInput,
  updateProjectStatusController
);

/*
 * Backward compatibility
 */

router.put(
  "/update/:projectId",
  validateProjectId,
  normalizeProjectInput,
  updateProjectStatusController
);

/* Delete */

router.delete(
  "/delete/:projectId",
  validateProjectId,
  deleteProjectController
);

/* =========================================================
   PROJECT FILES
========================================================= */

/*
 * GET
 * /projects/:projectId/files
 */

router.get(
  "/:projectId/files",
  validateProjectId,
  getProjectFilesController
);

/*
 * GET SINGLE FILE
 */

router.get(
  "/:projectId/files/:fileId",
  validateProjectId,
  getProjectFileController
);

/*
 * CREATE FILE
 */

router.post(
  "/:projectId/files",
  validateProjectId,
  createProjectFileController
);

/*
 * UPDATE FILE
 */

router.patch(
  "/:projectId/files/:fileId",
  validateProjectId,
  updateProjectFileController
);

/*
 * DELETE FILE
 */

router.delete(
  "/:projectId/files/:fileId",
  validateProjectId,
  deleteProjectFileController
);

/* =========================================================
   PROJECT SETTINGS
========================================================= */

/*
 * GET SETTINGS
 */

router.get(
  "/:projectId/settings",
  validateProjectId,
  getProjectSettingsController
);

/*
 * UPDATE SETTINGS
 */

router.patch(
  "/:projectId/settings",
  validateProjectId,
  updateProjectSettingsController
);

/* =========================================================
   PROJECT ACTIVITY
========================================================= */

/*
 * Project activity feed
 */

router.get(
  "/:projectId/activity",
  validateProjectId,
  getProjectActivityController
);

/* =========================================================
   PROJECT ENVIRONMENT
========================================================= */

/*
 * GET ENVIRONMENT
 */

router.get(
  "/:projectId/environment",
  validateProjectId,
  getProjectEnvironmentController
);

/*
 * CREATE ENVIRONMENT VARIABLE
 */

router.post(
  "/:projectId/environment",
  validateProjectId,
  createProjectEnvironmentController
);

/*
 * UPDATE ENVIRONMENT VARIABLE
 */

router.patch(
  "/:projectId/environment/:variableId",
  validateProjectId,
  updateProjectEnvironmentController
);

/*
 * DELETE ENVIRONMENT VARIABLE
 */

router.delete(
  "/:projectId/environment/:variableId",
  validateProjectId,
  deleteProjectEnvironmentController
);

/* =========================================================
   BUILD HISTORY
========================================================= */

/*
 * GET BUILD HISTORY
 */

router.get(
  "/:projectId/builds",
  validateProjectId,
  getBuildHistoryController
);

/* =========================================================
   DEPLOYMENT
========================================================= */

/*
 * Deploy current project
 */

router.post(
  "/deploy/:projectId",
  validateProjectId,
  deployProjectController
);

/*
 * Deployment history
 */

router.get(
  "/:projectId/deployments",
  validateProjectId,
  getDeploymentHistoryController
);

/* =========================================================
   PROJECT MEMBERS
========================================================= */

/*
 * GET MEMBERS
 */

router.get(
  "/:projectId/members",
  validateProjectId,
  getProjectMembersController
);

/*
 * ADD MEMBER
 */

router.post(
  "/:projectId/members",
  validateProjectId,
  addProjectMemberController
);

/*
 * UPDATE MEMBER ROLE / STATUS
 */

router.patch(
  "/:projectId/members/:memberId",
  validateProjectId,
  updateProjectMemberController
);

/*
 * REMOVE MEMBER
 */

router.delete(
  "/:projectId/members/:memberId",
  validateProjectId,
  removeProjectMemberController
);

/* =========================================================
   PROJECT LOGS
========================================================= */

/*
 * GET PROJECT LOGS
 *
 * Later this can support:
 *
 * ?level=error
 * ?source=deployment
 * ?buildId=...
 * ?deploymentId=...
 * ?limit=100
 */

router.get(
  "/:projectId/logs",
  validateProjectId,
  getProjectLogsController
);

/* =========================================================
   PROJECT VERSIONS
========================================================= */

/*
 * GET VERSION HISTORY
 */

router.get(
  "/:projectId/versions",
  validateProjectId,
  getProjectVersionsController
);

/*
 * GET SINGLE VERSION
 */

router.get(
  "/:projectId/versions/:versionId",
  validateProjectId,
  getProjectVersionController
);

/*
 * CREATE VERSION
 */

router.post(
  "/:projectId/versions",
  validateProjectId,
  createProjectVersionController
);

/*
 * RESTORE VERSION
 */

router.post(
  "/:projectId/versions/:versionId/restore",
  validateProjectId,
  restoreProjectVersionController
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
