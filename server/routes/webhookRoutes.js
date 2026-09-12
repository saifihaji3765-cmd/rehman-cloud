/* =========================================================
   ZyrionOS WEBHOOK ROUTES
   =========================================================

   Responsibilities:
   - Stripe webhook endpoint
   - Razorpay webhook endpoint

   IMPORTANT:
   - Authentication middleware MUST NOT be used here.
   - Payment providers call these endpoints directly.
   - Signature verification happens inside
     webhookController.js.
   - These routes must be mounted before the global
     express.json() parser if the controllers require
     the original raw request body.
========================================================= */

const express =
  require("express");


const router =
  express.Router();


/* =========================================================
   CONTROLLERS
========================================================= */

const {

  razorpayWebhookController,

  stripeWebhookController

} =
  require(
    "../controllers/webhookController"
  );


/* =========================================================
   RAZORPAY WEBHOOK
=========================================================

   POST
   /api/webhooks/razorpay

   Razorpay sends payment/subscription events here.

   Do NOT add:
   - authMiddleware
   - JWT verification
   - user authentication

   Razorpay authentication is performed through the
   webhook signature inside the controller.
========================================================= */

router.post(

  "/razorpay",

  razorpayWebhookController

);


/* =========================================================
   STRIPE WEBHOOK
=========================================================

   POST
   /api/webhooks/stripe

   Stripe requires the original request body for
   webhook signature verification.

   Therefore this route must receive the raw body.

   IMPORTANT:
   The application entry point must ensure that this
   route is handled with express.raw({
     type: "application/json"
   }) BEFORE express.json() consumes the body.

   Signature verification itself remains inside
   stripeWebhookController().
========================================================= */

router.post(

  "/stripe",

  express.raw({

    type:
      "application/json"

  }),

  stripeWebhookController

);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
