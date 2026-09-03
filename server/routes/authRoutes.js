const express = require("express");
const passport = require("passport");

const {
  authMiddleware
} = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   CONTROLLERS
========================= */

const {
  registerUser,
  loginUser,
  googleLogin,
  githubLogin,
  getCurrentUser,
} = require("../controllers/authController");

/* =========================
   REGISTER
========================= */

router.post(
  "/register",
  registerUser
);

/* =========================
   LOGIN
========================= */

router.post(
  "/login",
  loginUser
);

/* =========================
   CURRENT USER
========================= */

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

/* =========================
   GOOGLE AUTH
========================= */

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false
  })
);

/* =========================
   GOOGLE CALLBACK
========================= */

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login"
  }),
  googleLogin
);

/* =========================
   GITHUB AUTH
========================= */

router.get(
  "/github",
  passport.authenticate("github", {
    scope: ["user:email"],
    session: false
  })
);

/* =========================
   GITHUB CALLBACK
========================= */

router.get(
  "/github/callback",
  passport.authenticate("github", {
    session: false,
    failureRedirect: "/login"
  }),
  githubLogin
);

/* =========================
   EXPORT
========================= */

module.exports = router;
