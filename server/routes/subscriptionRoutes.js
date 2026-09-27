/* =========================================================
   ZyrionOS SUBSCRIPTION ROUTES
   Version: 4.0.0
   =========================================================

   Responsibilities:
   - Current authenticated subscription
   - Subscription history
   - Create subscription/payment request
   - Upgrade subscription/payment request
   - Cancel subscription request
   - Usage + entitlement information

   Security:
   - Authentication required on every endpoint
   - User identity comes from req.user
   - Client cannot establish payment success
   - Payment activation is controlled by provider webhooks
   - Controllers remain responsible for business rules

   Architecture:

      Client
        ↓
      Authentication
        ↓
      Rate Limiter
        ↓
      Subscription Controller
        ↓
      Billing / Payment Services
        ↓
      Provider
        ↓
      Webhook
        ↓
      Subscription Model
========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   CONTROLLER
========================================================= */

const subscriptionController =
  require("../controllers/subscriptionController");


/* =========================================================
   CONTROLLER CONTRACT VALIDATION
========================================================= */

const requiredControllers = [

  "createSubscriptionController",

  "getSubscriptionController",

  "getSubscriptionsController",

  "cancelSubscriptionController",

  "upgradeSubscriptionController",

  "usageController"

];


for (
  const controllerName of requiredControllers
) {

  if (
    typeof subscriptionController?.[
      controllerName
    ] !== "function"
  ) {

    throw new Error(
      `Subscription route controller missing: ${controllerName}`
    );

  }

}


/* =========================================================
   CONTROLLER HANDLERS
========================================================= */

const {

  createSubscriptionController,

  getSubscriptionController,

  getSubscriptionsController,

  cancelSubscriptionController,

  upgradeSubscriptionController,

  usageController

} = subscriptionController;


/* =========================================================
   MIDDLEWARE
========================================================= */

const {
  authMiddleware
} =
  require("../middleware/authMiddleware");


const {
  apiLimiter
} =
  require("../middleware/rateLimiter");


/* =========================================================
   MIDDLEWARE VALIDATION
========================================================= */

if (
  typeof authMiddleware !== "function"
) {

  throw new Error(
    "Subscription routes: authMiddleware is not available"
  );

}


if (
  typeof apiLimiter !== "function"
) {

  throw new Error(
    "Subscription routes: apiLimiter is not available"
  );

}


/* =========================================================
   PROTECTED MIDDLEWARE
========================================================= */

/*
 * Every subscription endpoint is private.
 *
 * Authentication determines which user is being operated on.
 *
 * Rate limiting protects:
 * - subscription creation
 * - upgrade requests
 * - cancellation requests
 * - repeated account queries
 */

const protectedSubscriptionMiddleware = [

  authMiddleware,

  apiLimiter

];


/* =========================================================
   CURRENT SUBSCRIPTION
=========================================================

   GET
   /api/subscription/me

   Returns the authenticated user's current subscription.

   IMPORTANT:
   Controller must derive user identity from req.user.

   Client-provided userId must never override ownership.
========================================================= */

router.get(

  "/me",

  ...protectedSubscriptionMiddleware,

  getSubscriptionController

);


/* =========================================================
   SUBSCRIPTION HISTORY
=========================================================

   GET
   /api/subscription

   Returns subscription records belonging to the
   authenticated user.

   The controller is responsible for applying ownership
   filtering and pagination if supported.
========================================================= */

router.get(

  "/",

  ...protectedSubscriptionMiddleware,

  getSubscriptionsController

);


/* =========================================================
   CREATE SUBSCRIPTION
=========================================================

   POST
   /api/subscription/create

   Creates a subscription/payment request.

   IMPORTANT:

   This endpoint MUST NOT directly activate a subscription.

   Payment lifecycle:

      Request
        ↓
      Payment Provider
        ↓
      Webhook
        ↓
      Signature Verification
        ↓
      Subscription Activation
========================================================= */

router.post(

  "/create",

  ...protectedSubscriptionMiddleware,

  createSubscriptionController

);


/* =========================================================
   UPGRADE SUBSCRIPTION
=========================================================

   POST
   /api/subscription/upgrade

   Creates/processes an upgrade request.

   The controller must:
   - verify current subscription
   - resolve target plan through Billing Agent
   - calculate authoritative pricing
   - create the required payment flow
   - avoid directly marking payment as successful

   Provider webhook remains authoritative.
========================================================= */

router.post(

  "/upgrade",

  ...protectedSubscriptionMiddleware,

  upgradeSubscriptionController

);


/* =========================================================
   CANCEL SUBSCRIPTION
=========================================================

   POST
   /api/subscription/cancel

   Creates/processes a cancellation request.

   IMPORTANT:

   Route does NOT directly modify subscription status.

   Actual cancellation state must be confirmed by the
   appropriate payment-provider operation/webhook.
========================================================= */

router.post(

  "/cancel",

  ...protectedSubscriptionMiddleware,

  cancelSubscriptionController

);


/* =========================================================
   USAGE + ENTITLEMENTS
=========================================================

   GET
   /api/subscription/usage

   Returns:
   - AI usage
   - AI limits
   - deployment usage
   - deployment limits
   - thumbnail usage
   - video usage
   - infrastructure entitlements
   - feature flags

   Controller remains authoritative for access decisions.
========================================================= */

router.get(

  "/usage",

  ...protectedSubscriptionMiddleware,

  usageController

);


/* =========================================================
   ROUTE CONTRACT
========================================================= */

router.subscriptionRouteContract = {

  version: "4.0.0",

  authenticationRequired: true,

  rateLimitRequired: true,

  paymentActivationFromClient: false,

  webhookActivationRequired: true,

  endpoints: {

    current: {

      method: "GET",

      path: "/me"

    },

    history: {

      method: "GET",

      path: "/"

    },

    create: {

      method: "POST",

      path: "/create"

    },

    upgrade: {

      method: "POST",

      path: "/upgrade"

    },

    cancel: {

      method: "POST",

      path: "/cancel"

    },

    usage: {

      method: "GET",

      path: "/usage"

    }

  }

};


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
