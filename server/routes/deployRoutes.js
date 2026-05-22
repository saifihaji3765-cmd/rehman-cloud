const express =
require("express");

const router =
express.Router();

/* =========================
   CONTROLLER
========================= */

const deployController =
require(
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
   DEPLOY ROUTE
========================= */

router.post(

  "/deploy",

  authMiddleware,

  rateLimiter,

  deployController

);

/* =========================
   EXPORT
========================= */

module.exports =
router;
