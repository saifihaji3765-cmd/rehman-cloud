const express = require("express");
const passport = require("passport");

const router = express.Router();

/* =========================================================
   CONTROLLERS
========================================================= */

const {
  registerUser,
  loginUser,
  googleLogin,
  githubLogin,
  getCurrentUser,
  logoutUser
} = require("../controllers/authController");

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
  authMiddleware
} = require("../middleware/authMiddleware");

/* =========================================================
   FRONTEND URL
========================================================= */

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://zyrionos.com";

/* =========================================================
   REGISTER
========================================================= */

router.post(
  "/register",
  registerUser
);

/* =========================================================
   LOGIN
========================================================= */

router.post(
  "/login",
  loginUser
);

/* =========================================================
   CURRENT USER
========================================================= */

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

/* =========================================================
   LOGOUT
========================================================= */

router.post(
  "/logout",
  logoutUser
);

/* =========================================================
   GOOGLE AUTH
========================================================= */

router.get(
  "/google",
  passport.authenticate(
    "google",
    {
      scope: [
        "profile",
        "email"
      ],
      session: false
    }
  )
);

/* =========================================================
   GOOGLE CALLBACK
========================================================= */

router.get(
  "/google/callback",
  passport.authenticate(
    "google",
    {
      session: false,
      failureRedirect:
        `${FRONTEND_URL}/login`
    }
  ),
  googleLogin
);

/* =========================================================
   GITHUB AUTH
========================================================= */

router.get(
  "/github",
  passport.authenticate(
    "github",
    {
      scope: [
        "user:email"
      ],
      session: false
    }
  )
);

/* =========================================================
   GITHUB CALLBACK
========================================================= */

router.get(
  "/github/callback",
  passport.authenticate(
    "github",
    {
      session: false,
      failureRedirect:
        `${FRONTEND_URL}/login`
    }
  ),
  githubLogin
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
