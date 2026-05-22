const express =
require("express");

const router =
express.Router();

/* =========================
   CONTROLLERS
========================= */

const {

  razorpayWebhookController,

  stripeWebhookController

} = require(

  "../controllers/webhookController"

);

/* =========================
   RAZORPAY WEBHOOK
========================= */

router.post(

  "/razorpay",

  razorpayWebhookController

);

/* =========================
   STRIPE WEBHOOK
========================= */

router.post(

  "/stripe",

  stripeWebhookController

);

/* =========================
   EXPORT
========================= */

module.exports =
router;
