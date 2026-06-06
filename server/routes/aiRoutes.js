const express =
require("express");

const router =
express.Router();

/* =========================
CONTROLLERS
========================= */

const {

aiChatController,

aiCodeController,

aiDeployController,

aiThumbnailController

} = require(
"../controllers/aiController"
);

/* =========================
MIDDLEWARE
========================= */

const rateLimiter =
require(
"../middleware/rateLimiter"
);

const { authMiddleware } =
require("../middleware/authMiddleware");

/* =========================
AI CHAT
========================= */

router.post(

"/chat",

authMiddleware,

rateLimiter,

aiChatController

);

/* =========================
AI CODE GENERATION
========================= */

router.post(

"/generate-code",

authMiddleware,

rateLimiter,

aiCodeController

);

/* =========================
AI DEPLOYMENT
========================= */

router.post(

"/deploy-agent",

authMiddleware,

rateLimiter,

aiDeployController

);

/* =========================
AI THUMBNAIL
========================= */

router.post(

"/thumbnail",

authMiddleware,

rateLimiter,

aiThumbnailController

);

/* =========================
EXPORT
========================= */

module.exports =
router;
