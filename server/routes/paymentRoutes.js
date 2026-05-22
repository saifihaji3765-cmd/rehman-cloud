const express =
require("express");

const router =
express.Router();

/* =========================
   CONTROLLER
========================= */

const {

  createPaymentController

} = require(

  "../controllers/paymentController"

);

/* =========================
   MIDDLEWARE
========================= */

const authMiddleware =
require(

  "../middleware/authMiddleware"

);

const rateLimiter =
require(

  "../middleware/rateLimiter"

);

/* =========================
   CREATE PAYMENT
========================= */

router.post(

  "/create-order",

  authMiddleware,

  rateLimiter,

  createPaymentController

);

/* =========================
   EXPORT
========================= */

module.exports =
router;
