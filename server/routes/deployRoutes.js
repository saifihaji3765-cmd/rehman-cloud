const express =
require("express");

const router =
express.Router();

/* =========================
CONTROLLERS
========================= */

const {

deployProject,

getDeploymentStatus,

getDeploymentLogs,

getDeploymentMonitoring,

triggerScaling

} = require(

"../controllers/deployController"

);

/* =========================
MIDDLEWARE
========================= */

const rateLimiter =
require(

"../middleware/rateLimiter"

);

const authMiddleware =
require(

"../middleware/authMiddleware"

);

/* =========================
DEPLOY PROJECT
========================= */

router.post(

"/deploy",

authMiddleware,

rateLimiter,

deployProject

);

/* =========================
DEPLOYMENT STATUS
========================= */

router.get(

"/status/:deploymentId",

authMiddleware,

getDeploymentStatus

);

/* =========================
DEPLOYMENT LOGS
========================= */

router.get(

"/logs/:deploymentId",

authMiddleware,

getDeploymentLogs

);

/* =========================
MONITORING
========================= */

router.get(

"/monitoring/:deploymentId",

authMiddleware,

getDeploymentMonitoring

);

/* =========================
SCALING
========================= */

router.post(

"/scale/:deploymentId",

authMiddleware,

triggerScaling

);

/* =========================
EXPORT
========================= */

module.exports =
router;
