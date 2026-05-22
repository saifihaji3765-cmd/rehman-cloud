const express =
require("express");

const router =
express.Router();

/* =========================
   CONTROLLERS
========================= */

const aiController =
require("../controllers/aiController");

/* =========================
   MIDDLEWARE
========================= */

const rateLimiter =
require("../middleware/rateLimiter");

/* =========================
   AI CHAT ROUTE
========================= */

router.post(

  "/chat",

  rateLimiter,

  aiController

);

/* =========================
   EXPORT
========================= */

module.exports =
router;
