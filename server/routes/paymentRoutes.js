/* =========================================================
   ZyrionOS PAYMENT ROUTES
   =========================================================

   Responsibilities:
   - Authenticated payment endpoints
   - Payment verification
   - Billing history
   - User credits

   IMPORTANT:
   Stripe/Razorpay webhooks are NOT mounted here.

   Webhooks have their own:
      /routes/webhookRoutes.js

   This prevents duplicate webhook endpoints and keeps
   raw-body webhook handling isolated from normal JSON APIs.
========================================================= */

const express =
  require("express");


const router =
  express.Router();


/* =========================================================
   CONTROLLERS
========================================================= */

const {
  createPaymentController,
  verifyPaymentController,
  createSubscriptionController,
  billingHistoryController,
  creditsController
} =
  require(
    "../controllers/paymentController"
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
   CREATE PAYMENT / ORDER
=========================================================

   POST
   /create-order

   Authentication:
   REQUIRED

   Provider:
   stripe / razorpay

   Pricing is validated server-side by the controller
   and payment services.
========================================================= */

router.post(

  "/create-order",

  authMiddleware,

  apiLimiter,

  createPaymentController

);


/* =========================================================
   VERIFY PAYMENT
=========================================================

   POST
   /verify-payment

   Authentication:
   REQUIRED

   Used for provider-side payment verification where
   applicable.

   Webhook confirmation remains authoritative for
   subscription state.
========================================================= */

router.post(

  "/verify-payment",

  authMiddleware,

  apiLimiter,

  verifyPaymentController

);


/* =========================================================
   CREATE SUBSCRIPTION
=========================================================

   POST
   /subscription

   Authentication:
   REQUIRED

   This endpoint remains available for the existing
   controller contract.

   Actual payment/subscription state must be confirmed
   through the provider/webhook flow.
========================================================= */

router.post(

  "/subscription",

  authMiddleware,

  apiLimiter,

  createSubscriptionController

);


/* =========================================================
   BILLING HISTORY
=========================================================

   GET
   /billing-history

   Authentication:
   REQUIRED
========================================================= */

router.get(

  "/billing-history",

  authMiddleware,

  apiLimiter,

  billingHistoryController

);


/* =========================================================
   USER CREDITS
=========================================================

   GET
   /credits

   Authentication:
   REQUIRED
========================================================= */

router.get(

  "/credits",

  authMiddleware,

  apiLimiter,

  creditsController

);


/* =========================================================
   WEBHOOKS
=========================================================

   DO NOT ADD STRIPE OR RAZORPAY WEBHOOKS HERE.

   Dedicated webhook routes:

      /routes/webhookRoutes.js

   This separation is important because Stripe requires
   the original raw request body for signature verification.
========================================================= */


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
