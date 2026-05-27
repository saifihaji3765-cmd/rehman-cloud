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

getSingleProjectController,

updateProjectStatusController,

deleteProjectController,

deployProjectController

} = require(

"../controllers/projectController"

);

/* =========================
MIDDLEWARE
========================= */

const {

authMiddleware

} = require(

"../middleware/authMiddleware"

);

const {

apiLimiter

} = require(

"../middleware/rateLimiter"

);

/* =========================
CREATE PROJECT
========================= */

router.post(

"/create",

authMiddleware,

apiLimiter,

createProjectController

);

/* =========================
GET MY PROJECTS
========================= */

router.get(

"/me",

authMiddleware,

apiLimiter,

getProjectsController

);

/* =========================
GET SINGLE PROJECT
========================= */

router.get(

"/:projectId",

authMiddleware,

apiLimiter,

getSingleProjectController

);

/* =========================
UPDATE PROJECT
========================= */

router.put(

"/update/:projectId",

authMiddleware,

apiLimiter,

updateProjectStatusController

);

/* =========================
DELETE PROJECT
========================= */

router.delete(

"/delete/:projectId",

authMiddleware,

apiLimiter,

deleteProjectController

);

/* =========================
DEPLOY PROJECT
========================= */

router.post(

"/deploy/:projectId",

authMiddleware,

apiLimiter,

deployProjectController

);

/* =========================
EXPORT
========================= */

module.exports =
router;
