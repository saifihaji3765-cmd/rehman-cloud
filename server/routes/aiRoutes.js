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

const {

aiLimiter,

deployLimiter

} = require(
"../middleware/rateLimiter"
);

const {

authMiddleware

} = require(
"../middleware/authMiddleware"
);

/* =========================
AI CHAT
========================= */

router.post(

"/chat",

authMiddleware,

aiLimiter,

aiChatController

);

/* =========================
AI CODE GENERATION
========================= */

router.post(

"/generate-code",

authMiddleware,

aiLimiter,

aiCodeController

);

/* =========================
AI DEPLOYMENT
========================= */

router.post(

"/deploy-agent",

authMiddleware,

deployLimiter,

aiDeployController

);

/* =========================
AI THUMBNAIL
========================= */

router.post(

"/thumbnail",

authMiddleware,

aiLimiter,

aiThumbnailController

);

/* =========================
EXPORT
========================= */

module.exports =
router;
