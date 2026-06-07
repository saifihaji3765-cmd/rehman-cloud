const express =
require("express");

const router =
express.Router();

/* =========================
CONTROLLERS
========================= */

const {

createPaymentController,

verifyPaymentController,

createSubscriptionController,

billingHistoryController,

creditsController,

stripeWebhookController,

razorpayWebhookController

} = require(

"../controllers/paymentController"

);

/* =========================
MIDDLEWARE
========================= */

const {
  authMiddleware
} = require("../middleware/authMiddleware"

);


const {
  apiLimiter
} = require("../middleware/rateLimiter");

/* =========================
CREATE PAYMENT
========================= */

router.post(

"/create-order",

authMiddleware,

apiLimiter,

createPaymentController

);

/* =========================
VERIFY PAYMENT
========================= */

router.post(

"/verify-payment",

authMiddleware,

apiLimiter,

verifyPaymentController

);

/* =========================
CREATE SUBSCRIPTION
========================= */

router.post(

"/subscription",

authMiddleware,

apiLimiter,

createSubscriptionController

);

/* =========================
BILLING HISTORY
========================= */

router.get(

"/billing-history",

authMiddleware,

apiLimiter,

billingHistoryController

);

/* =========================
USER CREDITS
========================= */

router.get(

"/credits",

authMiddleware,

apiLimiter,

creditsController

);

/* =========================
STRIPE WEBHOOK
========================= */

router.post(

"/stripe/webhook",

express.raw({

type:"application/json"

}),

stripeWebhookController

);

/* =========================
RAZORPAY WEBHOOK
========================= */

router.post(

"/razorpay/webhook",

razorpayWebhookController

);

/* =========================
EXPORT
========================= */

module.exports =
router;
