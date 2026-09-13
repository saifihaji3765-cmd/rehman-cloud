/* =========================================================
   ZyrionOS WEBHOOK ROUTES
   =========================================================

   Responsibilities:
   - Stripe webhook endpoint
   - Razorpay webhook endpoint
   - WhatsApp Cloud API webhook endpoint

   IMPORTANT:
   - Authentication middleware MUST NOT be used here.
   - Payment/WhatsApp providers call these endpoints directly.
   - Signature verification happens inside the respective
     controllers/services.
   - These routes must be mounted before the global
     express.json() parser when the controller requires
     the original raw request body.
========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   PAYMENT WEBHOOK CONTROLLERS
========================================================= */

const {
  razorpayWebhookController,
  stripeWebhookController
} = require("../controllers/webhookController");


/* =========================================================
   WHATSAPP WEBHOOK CONTROLLER
========================================================= */

const {
  verify: whatsappWebhookVerifyController,
  receive: whatsappWebhookReceiveController
} = require("../controllers/whatsappWebhookController");


/* =========================================================
   RAZORPAY WEBHOOK
=========================================================

   POST
   /api/webhook/razorpay

   Razorpay sends payment/subscription events here.

   DO NOT add:
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
   /api/webhook/stripe

   Stripe requires the original request body for
   webhook signature verification.

   Therefore this route receives the raw request body.

   IMPORTANT:
   The application entry point must mount this router
   BEFORE the global express.json() parser.

   Signature verification remains inside
   stripeWebhookController().
========================================================= */

router.post(
  "/stripe",

  express.raw({
    type: "application/json"
  }),

  stripeWebhookController
);


/* =========================================================
   WHATSAPP WEBHOOK VERIFICATION
=========================================================

   GET
   /api/webhook/whatsapp

   Meta/WhatsApp uses this endpoint during webhook
   verification.

   No authentication middleware is used.

   The controller validates:
   - mode
   - verify token
   - challenge
========================================================= */

router.get(
  "/whatsapp",
  whatsappWebhookVerifyController
);


/* =========================================================
   WHATSAPP WEBHOOK RECEIVER
=========================================================

   POST
   /api/webhook/whatsapp

   WhatsApp Cloud API sends incoming webhook events here.

   The original raw request body is required for
   HMAC-SHA256 signature verification.

   IMPORTANT:
   - No authMiddleware
   - No JWT middleware
   - No user authentication
   - Signature verification happens inside the
     WhatsApp webhook controller/service.
   - Raw body must be available before express.json()
     processes the request.

   Limit:
   1 MB

   This matches the WhatsApp webhook service's maximum
   accepted payload size.
========================================================= */

router.post(
  "/whatsapp",

  express.raw({
    type: "application/json",
    limit: "1mb"
  }),

  whatsappWebhookReceiveController
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
