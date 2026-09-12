/* =========================================================
   ZyrionOS SUBSCRIPTION ROUTES
   =========================================================

   Responsibilities:
   - Get current authenticated subscription
   - Get authenticated user's subscription history
   - Create subscription/payment request
   - Upgrade subscription/payment request
   - Cancel subscription
   - Usage + credits information

   Security:
   - Every endpoint requires authentication
   - User ownership comes from req.user
   - Client cannot establish payment success
========================================================= */

const express = require("express");

const router = express.Router();

/* =========================================================
   CONTROLLERS
========================================================= */

const {
  createSubscriptionController,
  getSubscriptionController,
  getSubscriptionsController,
  cancelSubscriptionController,
  upgradeSubscriptionController,
  usageController
} = require("../controllers/subscriptionController");

/* =========================================================
   MIDDLEWARE
========================================================= */

const { authMiddleware } = require("../middleware/authMiddleware");

const { apiLimiter } = require("../middleware/rateLimiter");

/* =========================================================
   CURRENT SUBSCRIPTION
=========================================================

   GET /api/subscription/me

   Returns the authenticated user's current subscription.

   This endpoint is intentionally separate from the
   subscription history endpoint.

========================================================= */

router.get(
  "/me",
  authMiddleware,
  apiLimiter,
  getSubscriptionController
);

/* =========================================================
   SUBSCRIPTION HISTORY
=========================================================

   GET /api/subscription

   Returns subscriptions belonging only to the
   authenticated user.

========================================================= */

router.get(
  "/",
  authMiddleware,
  apiLimiter,
  getSubscriptionsController
);

/* =========================================================
   CREATE SUBSCRIPTION
=========================================================

   POST /api/subscription/create

   This endpoint creates/request a subscription flow.

   Payment success must come from the payment provider
   webhook. The client cannot activate a subscription.

========================================================= */

router.post(
  "/create",
  authMiddleware,
  apiLimiter,
  createSubscriptionController
);

/* =========================================================
   UPGRADE SUBSCRIPTION
=========================================================

   POST /api/subscription/upgrade

   Payment confirmation is handled by the provider/webhook
   layer, not by this router.

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

   POST /api/subscription/cancel

========================================================= */

router.post(
  "/cancel",
  authMiddleware,
  apiLimiter,
  cancelSubscriptionController
);

/* =========================================================
   USAGE
=========================================================

   GET /api/subscription/usage

   Returns actual usage and remaining subscription
   entitlements for the authenticated user.

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

module.exports = router;
