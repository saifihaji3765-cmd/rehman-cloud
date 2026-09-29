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
=========================================================

   Important:

   GitHub OAuth is used in TWO situations:

   1. Login
      User is not authenticated yet.

   2. Connect GitHub
      User is already logged into ZyrionOS.

   Normal authMiddleware would reject case #1.

   This middleware therefore tries authentication but does
   NOT reject unauthenticated users.
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
      req.cookies[
        AUTH_COOKIE_NAME
      ]
    ) {
      token =
        req.cookies[
          AUTH_COOKIE_NAME
        ];
    }

    /* -------------------------------------------------------
       Bearer fallback
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
       
       This is valid for normal GitHub login.
    ------------------------------------------------------- */

    if (!token) {
      return next();
    }

    if (!JWT_SECRET) {
      console.error(
        "JWT_SECRET is missing"
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

    /* -------------------------------------------------------
       Attach lightweight authenticated user
    ------------------------------------------------------- */

    req.user = {
      id:
        user._id,

      name:
        user.name,

      email:
        user.email,

      role:
        user.role,

      provider:
        user.provider,

      subscriptionPlan:
        user.subscriptionPlan,

      credits:
        user.credits,

      deploymentsUsed:
        user.deploymentsUsed,

      avatar:
        user.avatar,
    };

    return next();
  } catch (error) {
    /*
     * Optional authentication must never block normal
     * unauthenticated OAuth login.
     */

    return next();
  }
}

/* =========================================================
   GITHUB OAUTH STATE
========================================================= */

function createGithubOAuthState(
  req
) {
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
      purpose:
        "github_oauth",

      mode:
        userId
          ? "connect"
          : "login",

      userId:
        userId
          ? String(userId)
          : null,
    },
    JWT_SECRET,
    {
      expiresIn:
        "10m",
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

    /* -------------------------------------------------------
       CONNECT MODE
       
       If OAuth started while logged in, the same user must
       still be authenticated at callback time.
    ------------------------------------------------------- */

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
      "GitHub OAuth state verification failed:",
      error?.message ||
        error
    );

    return res.redirect(
      `${FRONTEND_URL}/login?error=github_state_invalid`
    );
  }
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

  passport.authenticate(
    "google",
    {
      session: false,

      failureRedirect:
        `${FRONTEND_URL}/login?error=google_auth_failed`,
    }
  ),

  googleCallback
);

/* =========================================================
   GITHUB AUTH START
=========================================================

   This route supports both:

   - GitHub login
   - GitHub connection from Settings

   optionalAuthMiddleware detects whether the user is
   already logged into ZyrionOS.
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
        "GitHub OAuth start error:",
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

  /*
   * Restore existing ZyrionOS authentication if the
   * GitHub OAuth was initiated from Settings.
   */
  optionalAuthMiddleware,

  /*
   * Verify signed OAuth state BEFORE accepting GitHub
   * identity.
   */
  verifyGithubOAuthState,

  /*
   * Passport performs GitHub OAuth verification.
   */
  passport.authenticate(
    "github",
    {
      session: false,

      failureRedirect:
        `${FRONTEND_URL}/login?error=github_auth_failed`,
    }
  ),

  /*
   * Controller handles:
   *
   * login mode
   * OR
   * existing-user connection mode
   */
  githubCallback
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
