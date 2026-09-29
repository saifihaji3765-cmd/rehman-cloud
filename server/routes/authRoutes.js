require("dotenv").config();

const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");

const User = require("../models/userModel");

const router = express.Router();

/* =========================================================
   CONTROLLERS
========================================================= */

const {
  registerUser,
  loginUser,
  googleCallback,
  githubCallback,
  getCurrentUser,
  logoutUser,
} = require("../controllers/authController");

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
  authMiddleware,
} = require("../middleware/authMiddleware");

/* =========================================================
   FRONTEND
========================================================= */

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://zyrionos.com";

/* =========================================================
   JWT CONFIG
========================================================= */

const JWT_SECRET =
  process.env.JWT_SECRET;

const AUTH_COOKIE_NAME =
  process.env.AUTH_COOKIE_NAME ||
  "access_token";

/* =========================================================
   OPTIONAL AUTH MIDDLEWARE
========================================================= */

async function optionalAuthMiddleware(
  req,
  res,
  next
) {
  try {
    let token = null;

    /* -------------------------------------------------------
       HttpOnly cookie
    ------------------------------------------------------- */

    if (
      req.cookies &&
      req.cookies[AUTH_COOKIE_NAME]
    ) {
      token =
        req.cookies[AUTH_COOKIE_NAME];
    }

    /* -------------------------------------------------------
       Bearer token fallback
    ------------------------------------------------------- */

    if (
      !token &&
      req.headers.authorization &&
      req.headers.authorization.startsWith(
        "Bearer "
      )
    ) {
      token =
        req.headers.authorization
          .split(" ")[1];
    }

    /* -------------------------------------------------------
       No authentication
    ------------------------------------------------------- */

    if (!token) {
      return next();
    }

    if (!JWT_SECRET) {
      console.error(
        "[Auth] JWT_SECRET is missing"
      );

      return next();
    }

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const user =
      await User.findById(
        decoded.id
      ).select("-password");

    if (!user) {
      return next();
    }

    if (
      user.isVerified === false &&
      user.provider === "email"
    ) {
      return next();
    }

    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      provider: user.provider,
      subscriptionPlan:
        user.subscriptionPlan,
      credits: user.credits,
      deploymentsUsed:
        user.deploymentsUsed,
      avatar: user.avatar,
    };

    return next();
  } catch (error) {
    /*
     * Optional authentication must never block
     * unauthenticated OAuth login.
     */

    return next();
  }
}

/* =========================================================
   GITHUB OAUTH STATE
========================================================= */

function createGithubOAuthState(req) {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is missing"
    );
  }

  const userId =
    req.user?.id ||
    req.user?._id ||
    null;

  return jwt.sign(
    {
      purpose: "github_oauth",

      mode: userId
        ? "connect"
        : "login",

      userId: userId
        ? String(userId)
        : null,
    },
    JWT_SECRET,
    {
      expiresIn: "10m",
    }
  );
}

/* =========================================================
   VERIFY GITHUB OAUTH STATE
========================================================= */

function verifyGithubOAuthState(
  req,
  res,
  next
) {
  try {
    const state =
      req.query?.state;

    if (!state) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=github_state_missing`
      );
    }

    if (!JWT_SECRET) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=github_state_config`
      );
    }

    const decoded =
      jwt.verify(
        state,
        JWT_SECRET
      );

    if (
      decoded.purpose !==
      "github_oauth"
    ) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=github_state_invalid`
      );
    }

    if (
      decoded.mode ===
      "connect"
    ) {
      const currentUserId =
        req.user?.id ||
        req.user?._id;

      if (!currentUserId) {
        return res.redirect(
          `${FRONTEND_URL}/login?error=github_session_expired`
        );
      }

      if (
        String(currentUserId) !==
        String(decoded.userId)
      ) {
        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      req.githubOAuthMode =
        "connect";
    } else {
      req.githubOAuthMode =
        "login";
    }

    return next();
  } catch (error) {
    console.error(
      "[GitHub OAuth] State verification failed:",
      error?.message ||
        error
    );

    return res.redirect(
      `${FRONTEND_URL}/login?error=github_state_invalid`
    );
  }
}

/* =========================================================
   GOOGLE PASSPORT HANDLER
=========================================================

   IMPORTANT:

   We intentionally do NOT use failureRedirect here.

   Passport errors were previously being hidden behind a
   generic redirect to /login.

   This handler logs the REAL failure so ECS logs tell us
   exactly what is wrong.
========================================================= */

function handleGoogleAuthentication(
  req,
  res,
  next
) {
  passport.authenticate(
    "google",
    {
      session: false,
    },
    (error, user, info) => {
      /* -----------------------------------------------------
         PASSPORT / STRATEGY ERROR
      ----------------------------------------------------- */

      if (error) {
        console.error(
          "[Google OAuth] Passport error:",
          error?.stack ||
            error?.message ||
            error
        );

        return res.redirect(
          `${FRONTEND_URL}/login?error=google_auth_failed`
        );
      }

      /* -----------------------------------------------------
         GOOGLE AUTHENTICATION FAILED
      ----------------------------------------------------- */

      if (!user) {
        console.error(
          "[Google OAuth] Authentication failed:",
          info?.message ||
            info ||
            "Unknown Google authentication failure"
        );

        return res.redirect(
          `${FRONTEND_URL}/login?error=google_auth_failed`
        );
      }

      /* -----------------------------------------------------
         AUTHENTICATION SUCCESS
      ----------------------------------------------------- */

      req.user = user;

      return next();
    }
  )(req, res, next);
}

/* =========================================================
   REGISTER
========================================================= */

router.post(
  "/register",
  registerUser
);

/* =========================================================
   EMAIL / PASSWORD LOGIN
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
   GOOGLE AUTH START
========================================================= */

router.get(
  "/google",

  passport.authenticate(
    "google",
    {
      scope: [
        "profile",
        "email",
      ],

      session: false,
    }
  )
);

/* =========================================================
   GOOGLE AUTH CALLBACK
========================================================= */

router.get(
  "/google/callback",

  handleGoogleAuthentication,

  googleCallback
);

/* =========================================================
   GITHUB AUTH START
========================================================= */

router.get(
  "/github",

  optionalAuthMiddleware,

  (req, res, next) => {
    try {
      const state =
        createGithubOAuthState(
          req
        );

      return passport.authenticate(
        "github",
        {
          scope: [
            "user:email",
          ],

          session: false,

          state,
        }
      )(req, res, next);
    } catch (error) {
      console.error(
        "[GitHub OAuth] Start error:",
        error?.stack ||
          error?.message ||
          error
      );

      return res.redirect(
        `${FRONTEND_URL}/login?error=github_auth_config`
      );
    }
  }
);

/* =========================================================
   GITHUB AUTH CALLBACK
========================================================= */

router.get(
  "/github/callback",

  optionalAuthMiddleware,

  verifyGithubOAuthState,

  passport.authenticate(
    "github",
    {
      session: false,

      failureRedirect:
        `${FRONTEND_URL}/login?error=github_auth_failed`,
    }
  ),

  githubCallback
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
