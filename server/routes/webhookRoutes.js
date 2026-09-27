/* =========================================================
   ZyrionOS WEBHOOK ROUTES
   Version: 4.0.0
   =========================================================

   Responsibilities:
   - Stripe webhook endpoint
   - Razorpay webhook endpoint
   - WhatsApp Cloud API verification
   - WhatsApp Cloud API webhook receiver

   IMPORTANT:
   - NO authMiddleware
   - NO JWT authentication
   - NO user authentication

   External providers call these routes directly.

   Security is handled through:
   - Stripe webhook signature verification
   - Razorpay webhook signature verification
   - WhatsApp HMAC signature verification
   - WhatsApp verification token

   RAW BODY REQUIREMENT:

      Stripe
        ↓
      raw body
        ↓
      signature verification

      Razorpay
        ↓
      raw body
        ↓
      signature verification

      WhatsApp
        ↓
      raw body
        ↓
      HMAC verification

   IMPORTANT APPLICATION ORDER:

      webhookRoutes
           ↓
      express.json()

   The webhook router MUST be mounted before the global
   express.json() middleware.

========================================================= */

const express = require("express");

const router = express.Router();


/* =========================================================
   CONSTANTS
========================================================= */

const RAW_JSON_LIMIT =
  process.env.WEBHOOK_RAW_BODY_LIMIT ||
  "2mb";

const WHATSAPP_RAW_BODY_LIMIT =
  process.env.WHATSAPP_WEBHOOK_RAW_BODY_LIMIT ||
  "1mb";


/* =========================================================
   CONTROLLERS
========================================================= */

const webhookController =
  require("../controllers/webhookController");


const whatsappWebhookController =
  require("../controllers/whatsappWebhookController");


/* =========================================================
   CONTROLLER CONTRACT VALIDATION
========================================================= */

const requiredPaymentControllers = [

  "razorpayWebhookController",

  "stripeWebhookController"

];


for (
  const controllerName
  of requiredPaymentControllers
) {

  if (
    typeof webhookController?.[
      controllerName
    ] !== "function"
  ) {

    throw new Error(
      `Webhook route controller missing: ${controllerName}`
    );

  }

}


const requiredWhatsAppControllers = [

  "verify",

  "receive"

];


for (
  const controllerName
  of requiredWhatsAppControllers
) {

  if (
    typeof whatsappWebhookController?.[
      controllerName
    ] !== "function"
  ) {

    throw new Error(
      `WhatsApp webhook controller missing: ${controllerName}`
    );

  }

}


/* =========================================================
   HANDLERS
========================================================= */

const {
  razorpayWebhookController,
  stripeWebhookController
} = webhookController;


const {
  verify:
    whatsappWebhookVerifyController,

  receive:
    whatsappWebhookReceiveController

} = whatsappWebhookController;


/* =========================================================
   RAW BODY OPTIONS
========================================================= */

/*
 * Stripe:
 * Requires the exact raw request body for signature
 * verification.
 */

const stripeRawBody =
  express.raw({

    type: "application/json",

    limit:
      RAW_JSON_LIMIT

  });


/*
 * Razorpay:
 * Signature verification also requires the original
 * request payload.
 */

const razorpayRawBody =
  express.raw({

    type: "application/json",

    limit:
      RAW_JSON_LIMIT

  });


/*
 * WhatsApp:
 * HMAC verification requires the original body.
 */

const whatsappRawBody =
  express.raw({

    type: "application/json",

    limit:
      WHATSAPP_RAW_BODY_LIMIT

  });


/* =========================================================
   RAZORPAY WEBHOOK
=========================================================

   POST
   /api/webhook/razorpay

   Authentication:
   NONE

   Raw body:
   REQUIRED

   Signature verification:
   webhookController

   Supported events may include:

   - payment.captured
   - order.paid
   - payment.failed
   - subscription.activated
   - subscription.charged
   - subscription.halted
   - subscription.cancelled
   - subscription.completed

   IMPORTANT:
   Never trust a client-side payment response to activate
   a subscription.

   Provider webhook is authoritative.
========================================================= */

router.post(

  "/razorpay",

  razorpayRawBody,

  razorpayWebhookController

);


/* =========================================================
   STRIPE WEBHOOK
=========================================================

   POST
   /api/webhook/stripe

   Authentication:
   NONE

   Raw body:
   REQUIRED

   Signature verification:
   stripeWebhookController

   Stripe webhook events are processed only after
   signature verification.

========================================================= */

router.post(

  "/stripe",

  stripeRawBody,

  stripeWebhookController

);


/* =========================================================
   WHATSAPP WEBHOOK VERIFICATION
=========================================================

   GET
   /api/webhook/whatsapp

   Meta calls this endpoint when the webhook is initially
   verified.

   Authentication:
   NONE

   The controller validates:

   - hub.mode
   - hub.verify_token
   - hub.challenge

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

   Authentication:
   NONE

   Raw body:
   REQUIRED

   Signature verification:
   WhatsApp webhook controller/service

   Payload limit:
   1 MB by default.

========================================================= */

router.post(

  "/whatsapp",

  whatsappRawBody,

  whatsappWebhookReceiveController

);


/* =========================================================
   WEBHOOK ROUTE CONTRACT
========================================================= */

router.webhookRouteContract = {

  version: "4.0.0",

  authenticationRequired: false,

  rawBodyRequired: true,

  endpoints: {

    razorpay: {

      method: "POST",

      path: "/razorpay",

      rawBody: true,

      signatureVerification: true

    },

    stripe: {

      method: "POST",

      path: "/stripe",

      rawBody: true,

      signatureVerification: true

    },

    whatsappVerify: {

      method: "GET",

      path: "/whatsapp",

      authentication: false,

      verificationToken: true

    },

    whatsappReceive: {

      method: "POST",

      path: "/whatsapp",

      rawBody: true,

      signatureVerification: true

    }

  }

};


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
