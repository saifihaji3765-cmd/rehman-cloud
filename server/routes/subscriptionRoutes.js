const express =
require("express");

const router =
express.Router();

/* =========================
   CONTROLLERS
========================= */

const {

  createSubscriptionController,

  getSubscriptionsController

} = require(

  "../controllers/subscriptionController"

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
   CREATE SUBSCRIPTION
========================= */

router.post(

  "/create",

  authMiddleware,

  rateLimiter,

  createSubscriptionController

);

/* =========================
   GET USER SUBSCRIPTIONS
========================= */

router.get(

  "/:userId",

  authMiddleware,

  rateLimiter,

  getSubscriptionsController

);

/* =========================
   EXPORT
========================= */

module.exports =
router;
