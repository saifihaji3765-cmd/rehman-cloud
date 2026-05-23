const express =
require("express");

const router =
express.Router();

/* =========================
   CONTROLLERS
========================= */

const {

  createProjectController,

  getProjectsController,

  updateProjectStatusController

} = require(

  "../controllers/projectController"

);

/* =========================
   MIDDLEWARE
========================= */

const authMiddleware =
require(

  "../middleware/authMiddleware"

);

const rateLimiter =
require(

  "../middleware/rateLimiter"

);

/* =========================
   CREATE PROJECT
========================= */

router.post(

  "/create",

  authMiddleware,

  rateLimiter,

  createProjectController

);

/* =========================
   GET USER PROJECTS
========================= */

router.get(

  "/:userId",

  authMiddleware,

  rateLimiter,

  getProjectsController

);

/* =========================
   UPDATE PROJECT
========================= */

router.put(

  "/update/:projectId",

  authMiddleware,

  rateLimiter,

  updateProjectStatusController

);

/* =========================
   EXPORT
========================= */

module.exports =
router;
