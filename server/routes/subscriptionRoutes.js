/* =========================================================
   ZyrionOS SUBSCRIPTION ROUTES
   =========================================================

   Responsibilities:
   - Create subscription
   - Get authenticated user's subscriptions
   - Upgrade subscription
   - Cancel subscription
   - Usage / credits information

   Authentication:
   All subscription endpoints require an authenticated
   ZyrionOS user.

   Pricing catalog is controlled by the subscription /
   billing layer, not by this router.
========================================================= */

const express =
  require("express");


const router =
  express.Router();


/* =========================================================
   CONTROLLERS
========================================================= */

const {
  createSubscriptionController,
  getSubscriptionsController,
  cancelSubscriptionController,
  upgradeSubscriptionController,
  usageController
} =
  require(
    "../controllers/subscriptionController"
  );


/* =========================================================
   MIDDLEWARE
========================================================= */

const {
  authMiddleware
} =
  require(
    "../middleware/authMiddleware"
  );


const {
  apiLimiter
} =
  require(
    "../middleware/rateLimiter"
  );


/* =========================================================
   CREATE SUBSCRIPTION
=========================================================

   POST
   /create

   Authentication:
   REQUIRED

   The authenticated user's ID comes from req.user.

   Client must not be trusted for subscription ownership.
========================================================= */

router.post(

  "/create",

  authMiddleware,

  apiLimiter,

  createSubscriptionController

);


/* =========================================================
   GET MY SUBSCRIPTIONS
=========================================================

   GET
   /me

   Authentication:
   REQUIRED

   Only subscriptions belonging to the authenticated
   user should be returned by the controller.
========================================================= */

router.get(

  "/me",

  authMiddleware,

  apiLimiter,

  getSubscriptionsController

);


/* =========================================================
   UPGRADE SUBSCRIPTION
=========================================================

   POST
   /upgrade

   Authentication:
   REQUIRED

   Upgrade processing is delegated to the controller /
   billing layer.

   The router does not trust the client to establish
   payment success.
========================================================= */

router.post(

  "/upgrade",

  authMiddleware,

  apiLimiter,

  upgradeSubscriptionController

);


/* =========================================================
   CANCEL SUBSCRIPTION
=========================================================

   POST
   /cancel

   Authentication:
   REQUIRED

========================================================= */

router.post(

  "/cancel",

  authMiddleware,

  apiLimiter,

  cancelSubscriptionController

);


/* =========================================================
   USAGE + CREDITS
=========================================================

   GET
   /usage

   Authentication:
   REQUIRED
========================================================= */

router.get(

  "/usage",

  authMiddleware,

  apiLimiter,

  usageController

);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
