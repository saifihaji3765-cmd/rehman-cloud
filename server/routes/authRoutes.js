const express =
require("express");

const router =
express.Router();

/* =========================
   CONTROLLERS
========================= */

const {

  signupController,

  loginController

} = require(
  "../controllers/authController"
);

/* =========================
   MIDDLEWARE
========================= */

const rateLimiter =
require(
  "../middleware/rateLimiter"
);

/* =========================
   SIGNUP ROUTE
========================= */

router.post(

  "/signup",

  rateLimiter,

  signupController

);

/* =========================
   LOGIN ROUTE
========================= */

router.post(

  "/login",

  rateLimiter,

  loginController

);

/* =========================
   EXPORT
========================= */

module.exports =
router;
