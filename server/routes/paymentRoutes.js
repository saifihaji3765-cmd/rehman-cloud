/* =========================================================
   ZyrionOS PAYMENT ROUTES
   Version: 4.0.0
   =========================================================

   Responsibilities:
   - Authenticated payment endpoints
   - Payment/order creation
   - Payment verification
   - Subscription request
   - Billing history
   - Credits

   IMPORTANT:
   Stripe/Razorpay webhooks are NOT mounted here.

   Webhooks MUST use:
      /routes/webhookRoutes.js

   Reason:
   Stripe signature verification requires the original
   raw request body before express.json() modifies it.

   Architecture:

      Client
        ↓
      Auth Middleware
        ↓
      Rate Limiter
        ↓
      Payment Controller
        ↓
      Billing Agent
        ↓
      Stripe / Razorpay Service


   Webhook architecture is separate:

      Stripe/Razorpay
        ↓
      Webhook Route
        ↓
      Raw Body
        ↓
      Signature Verification
        ↓
      Webhook Controller
        ↓
      Subscription Model
========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   CONTROLLERS
========================================================= */

const paymentController =
  require("../controllers/paymentController");


/* =========================================================
   CONTROLLER VALIDATION
========================================================= */

/*
 * Fail early if the controller contract is broken.
 *
 * This is preferable to silently mounting undefined
 * handlers and discovering the problem only when the
 * first customer attempts payment.
 */

const requiredControllers = [
  "createPaymentController",
  "verifyPaymentController",
  "createSubscriptionController",
  "billingHistoryController",
  "creditsController"
];


for (const controllerName of requiredControllers) {

  if (
    typeof paymentController?.[controllerName] !==
    "function"
  ) {

    throw new Error(
      `Payment route controller missing: ${controllerName}`
    );

  }

}


/* =========================================================
   CONTROLLER HANDLERS
========================================================= */

const {
  createPaymentController,
  verifyPaymentController,
  createSubscriptionController,
  billingHistoryController,
  creditsController
} = paymentController;


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
  typeof authMiddleware !==
  "function"
) {

  throw new Error(
    "Payment routes: authMiddleware is not available"
  );

}


if (
  typeof apiLimiter !==
  "function"
) {

  throw new Error(
    "Payment routes: apiLimiter is not available"
  );

}


/* =========================================================
   ROUTE HELPER
========================================================= */

/*
 * Payment endpoints all require:
 *
 * 1. Authentication
 * 2. API rate limiting
 *
 * Keeping this consistent prevents accidentally adding
 * an unprotected payment endpoint later.
 */

const protectedPaymentMiddleware = [
  authMiddleware,
  apiLimiter
];


/* =========================================================
   CREATE PAYMENT / ORDER
=========================================================

   POST
   /create-order

   Authentication:
   REQUIRED

   Supported providers:
   - stripe
   - razorpay

   IMPORTANT:
   Client-supplied price is NOT authoritative.

   Controller → Billing Agent → Payment Service
   determines the actual amount/currency.
========================================================= */

router.post(
  "/create-order",
  ...protectedPaymentMiddleware,
  createPaymentController
);


/* =========================================================
   VERIFY PAYMENT
=========================================================

   POST
   /verify-payment

   Authentication:
   REQUIRED

   Used for provider-side verification where applicable.

   IMPORTANT:
   Successful client-side verification does NOT itself
   activate a subscription.

   Webhook confirmation remains authoritative.
========================================================= */

router.post(
  "/verify-payment",
  ...protectedPaymentMiddleware,
  verifyPaymentController
);


/* =========================================================
   CREATE SUBSCRIPTION
=========================================================

   POST
   /subscription

   Authentication:
   REQUIRED

   This preserves the existing controller contract.

   Payment and subscription activation must still pass
   through the provider/webhook flow.
========================================================= */

router.post(
  "/subscription",
  ...protectedPaymentMiddleware,
  createSubscriptionController
);


/* =========================================================
   BILLING HISTORY
=========================================================

   GET
   /billing-history

   Authentication:
   REQUIRED

   Returns the authenticated user's billing/subscription
   history only.
========================================================= */

router.get(
  "/billing-history",
  ...protectedPaymentMiddleware,
  billingHistoryController
);


/* =========================================================
   USER CREDITS
=========================================================

   GET
   /credits

   Authentication:
   REQUIRED

   Returns the authenticated user's current credit/usage
   information.
========================================================= */

router.get(
  "/credits",
  ...protectedPaymentMiddleware,
  creditsController
);


/* =========================================================
   WEBHOOK PROTECTION
=========================================================

   DO NOT ADD:

      POST /stripe-webhook
      POST /razorpay-webhook

   HERE.

   Webhooks require special raw-body handling and must stay
   isolated from normal authenticated JSON APIs.

   Dedicated route:

      server/routes/webhookRoutes.js
========================================================= */


/* =========================================================
   ROUTE CONTRACT
========================================================= */

router.paymentRouteContract = {

  version: "4.0.0",

  authenticationRequired: true,

  rateLimitRequired: true,

  webhookRoutesIncluded: false,

  endpoints: {

    createOrder: {
      method: "POST",
      path: "/create-order"
    },

    verifyPayment: {
      method: "POST",
      path: "/verify-payment"
    },

    createSubscription: {
      method: "POST",
      path: "/subscription"
    },

    billingHistory: {
      method: "GET",
      path: "/billing-history"
    },

    credits: {
      method: "GET",
      path: "/credits"
    }

  }

};


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
