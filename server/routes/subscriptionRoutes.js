const express =
require("express");

const router =
express.Router();

/* =========================
CONTROLLERS
========================= */

const {

createSubscriptionController,

getSubscriptionsController,

cancelSubscriptionController,

upgradeSubscriptionController,

usageController

} = require(

"../controllers/subscriptionController"

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
CREATE SUBSCRIPTION
========================= */

router.post(

"/create",

authMiddleware,

apiLimiter,

createSubscriptionController

);

/* =========================
GET MY SUBSCRIPTION
========================= */

router.get(

"/me",

authMiddleware,

apiLimiter,

getSubscriptionsController

);

/* =========================
UPGRADE PLAN
========================= */

router.post(

"/upgrade",

authMiddleware,

apiLimiter,

upgradeSubscriptionController

);

/* =========================
CANCEL SUBSCRIPTION
========================= */

router.post(

"/cancel",

authMiddleware,

apiLimiter,

cancelSubscriptionController

);

/* =========================
USAGE + CREDITS
========================= */

router.get(

"/usage",

authMiddleware,

apiLimiter,

usageController

);

/* =========================
EXPORT
========================= */

module.exports =
router;
