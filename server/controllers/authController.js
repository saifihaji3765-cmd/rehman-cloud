require("dotenv").config();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/userModel");
const githubService = require("../services/githubService");

/* =========================================================
   CONFIG
========================================================= */

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  "https://zyrionos.com";

const AUTH_COOKIE_NAME =
  process.env.AUTH_COOKIE_NAME ||
  "access_token";

const JWT_EXPIRES_IN =
  process.env.JWT_EXPIRES_IN ||
  "7d";

const COOKIE_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;

/*
 * Production OAuth runs over HTTPS.
 *
 * SameSite=None is required when frontend and backend
 * are on different sites/origins and the browser must
 * send the authentication cookie.
 */
const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

const COOKIE_SAME_SITE =
  IS_PRODUCTION
    ? "none"
    : (
        process.env.COOKIE_SAME_SITE ||
        "lax"
      );

const COOKIE_SECURE =
  IS_PRODUCTION;

/* =========================================================
   JWT
========================================================= */

function generateToken(user) {
  const JWT_SECRET =
    process.env.JWT_SECRET;

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is missing"
    );
  }

  const userId =
    user?._id ||
    user?.id;

  if (!userId) {
    throw new Error(
      "User ID is missing"
    );
  }

  return jwt.sign(
    {
      id: String(userId),
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn:
        JWT_EXPIRES_IN,
    }
  );
}

/* =========================================================
   AUTH COOKIE
========================================================= */

function setAuthCookie(
  res,
  token
) {
  if (!token) {
    throw new Error(
      "Authentication token is missing"
    );
  }

  res.cookie(
    AUTH_COOKIE_NAME,
    token,
    {
      httpOnly: true,

      secure:
        COOKIE_SECURE,

      sameSite:
        COOKIE_SAME_SITE,

      maxAge:
        COOKIE_MAX_AGE,

      path: "/",
    }
  );
}

/* =========================================================
   CLEAR AUTH COOKIE
========================================================= */

function clearAuthCookie(res) {
  res.clearCookie(
    AUTH_COOKIE_NAME,
    {
      httpOnly: true,

      secure:
        COOKIE_SECURE,

      sameSite:
        COOKIE_SAME_SITE,

      path: "/",
    }
  );
}

/* =========================================================
   USER RESPONSE
========================================================= */

function formatUser(user) {
  return {
    id:
      user?._id ||
      user?.id ||
      null,

    name:
      user?.name ||
      null,

    email:
      user?.email ||
      null,

    avatar:
      user?.avatar ||
      null,

    role:
      user?.role ||
      "user",

    provider:
      user?.provider ||
      null,

    subscriptionPlan:
      user?.subscriptionPlan ||
      null,

    credits:
      user?.credits ?? 0,

    deploymentsUsed:
      user?.deploymentsUsed ?? 0,
  };
}

/* =========================================================
   REGISTER
========================================================= */

async function registerUser(
  req,
  res
) {
  try {
    const {
      name,
      email,
      password,
    } = req.body || {};

    if (
      !name ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All fields required",
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const existingUser =
      await User.findOne({
        email:
          normalizedEmail,
      });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "User already exists",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10
      );

    const user =
      await User.create({
        name:
          String(name).trim(),

        email:
          normalizedEmail,

        password:
          hashedPassword,

        provider:
          "email",

        isVerified:
          true,
      });

    const token =
      generateToken(user);

    setAuthCookie(
      res,
      token
    );

    return res.status(201).json({
      success: true,

      /*
       * Kept for backward compatibility.
       * Primary browser authentication is HttpOnly cookie.
       */
      token,

      user:
        formatUser(user),
    });

  } catch (error) {
    console.error(
      "[Register] Error:",
      error?.stack ||
        error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Register failed",
    });
  }
}

/* =========================================================
   EMAIL LOGIN
========================================================= */

async function loginUser(
  req,
  res
) {
  try {
    const {
      email,
      password,
    } = req.body || {};

    if (
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password required",
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const user =
      await User.findOne({
        email:
          normalizedEmail,
      });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid credentials",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account uses social login",
      });
    }

    const validPassword =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid credentials",
      });
    }

    if (
      user.isVerified === false &&
      user.provider === "email"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Account not verified",
      });
    }

    user.lastLogin =
      new Date();

    await user.save();

    const token =
      generateToken(user);

    setAuthCookie(
      res,
      token
    );

    return res.status(200).json({
      success: true,

      /*
       * Backward compatibility.
       * Browser authentication uses HttpOnly cookie.
       */
      token,

      user:
        formatUser(user),
    });

  } catch (error) {
    console.error(
      "[Login] Error:",
      error?.stack ||
        error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Login failed",
    });
  }
}

/* =========================================================
   GOOGLE CALLBACK
========================================================= */

async function googleCallback(
  req,
  res
) {
  try {
    const user =
      req.user;

    if (!user) {
      console.error(
        "[Google Callback] Passport user missing"
      );

      return res.redirect(
        `${FRONTEND_URL}/login?error=google_user_missing`
      );
    }

    /* -------------------------------------------------------
       UPDATE LAST LOGIN
    ------------------------------------------------------- */

    user.lastLogin =
      new Date();

    await user.save();

    /* -------------------------------------------------------
       GENERATE APPLICATION JWT
    ------------------------------------------------------- */

    const token =
      generateToken(user);

    /* -------------------------------------------------------
       SET AUTH COOKIE
    ------------------------------------------------------- */

    setAuthCookie(
      res,
      token
    );

    console.log(
      "[Google Callback] Authentication successful",
      {
        userId:
          String(
            user._id ||
              user.id
          ),
        cookie:
          AUTH_COOKIE_NAME,
        sameSite:
          COOKIE_SAME_SITE,
        secure:
          COOKIE_SECURE,
      }
    );

    /* -------------------------------------------------------
       REDIRECT
    ------------------------------------------------------- */

    return res.redirect(
      `${FRONTEND_URL}/dashboard`
    );

  } catch (error) {
    console.error(
      "[Google Callback] Error:",
      error?.stack ||
        error?.message ||
        error
    );

    return res.redirect(
      `${FRONTEND_URL}/login?error=google_auth_failed`
    );
  }
}

/* =========================================================
   GITHUB CALLBACK
========================================================= */

async function githubCallback(
  req,
  res
) {
  try {
    const user =
      req.user;

    if (!user) {
      console.error(
        "[GitHub Callback] Passport user missing"
      );

      return res.redirect(
        `${FRONTEND_URL}/login?error=github_user_missing`
      );
    }

    /* =====================================================
       DETERMINE CONNECTION MODE
    ===================================================== */

    const githubOAuth =
      req.githubOAuth;

    const connectionMode =
      githubOAuth?.connectionMode === true ||
      req.githubOAuthMode === "connect";

    /* =====================================================
       CONNECT GITHUB TO EXISTING ACCOUNT
    ===================================================== */

    if (connectionMode) {

      /* ---------------------------------------------------
         OAUTH HANDOFF
      --------------------------------------------------- */

      if (
        !githubOAuth ||
        !githubOAuth.accessToken
      ) {
        console.error(
          "[GitHub Callback] OAuth token handoff missing"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      /* ---------------------------------------------------
         GITHUB IDENTITY
      --------------------------------------------------- */

      if (
        !githubOAuth.githubUser
      ) {
        console.error(
          "[GitHub Callback] GitHub identity missing"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      const githubUser =
        githubOAuth.githubUser;

      /* ---------------------------------------------------
         VALIDATE GITHUB ID
      --------------------------------------------------- */

      if (
        !githubUser.githubId
      ) {
        console.error(
          "[GitHub Callback] GitHub ID missing"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      /* ---------------------------------------------------
         VALIDATE IDENTITY
      --------------------------------------------------- */

      if (
        !githubUser.username &&
        !githubUser.name
      ) {
        console.error(
          "[GitHub Callback] GitHub identity incomplete"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      /* ---------------------------------------------------
         CREATE GITHUB CONNECTION
      --------------------------------------------------- */

      const connection =
        await githubService.createConnection(
          {
            userId:
              user._id ||
              user.id,

            projectId:
              null,

            accessToken:
              githubOAuth.accessToken,

            connectionType:
              "oauth",

            githubUser: {
              githubId:
                String(
                  githubUser.githubId
                ),

              username:
                githubUser.username ||
                null,

              name:
                githubUser.name ||
                "GitHub User",

              email:
                githubUser.email ||
                null,

              avatar:
                githubUser.avatar ||
                null,

              profileUrl:
                githubUser.profileUrl ||
                null,
            },

            scopes:
              Array.isArray(
                githubOAuth.scopes
              )
                ? githubOAuth.scopes
                : [
                    "user:email",
                  ],
          }
        );

      user.lastLogin =
        new Date();

      await user.save();

      console.log(
        "[GitHub Callback] Connection created:",
        String(
          connection?._id ||
            connection?.id ||
            ""
        )
      );

      return res.redirect(
        `${FRONTEND_URL}/settings?section=integrations&github=connected`
      );
    }

    /* =====================================================
       NORMAL GITHUB LOGIN
    ===================================================== */

    user.lastLogin =
      new Date();

    await user.save();

    const token =
      generateToken(user);

    setAuthCookie(
      res,
      token
    );

    console.log(
      "[GitHub Callback] Authentication successful",
      {
        userId:
          String(
            user._id ||
              user.id
          ),
        cookie:
          AUTH_COOKIE_NAME,
        sameSite:
          COOKIE_SAME_SITE,
        secure:
          COOKIE_SECURE,
      }
    );

    return res.redirect(
      `${FRONTEND_URL}/dashboard`
    );

  } catch (error) {
    console.error(
      "[GitHub Callback] Error:",
      error?.response?.data ||
        error?.stack ||
        error?.message ||
        error
    );

    const connectionMode =
      req.githubOAuthMode === "connect" ||
      req.githubOAuth?.connectionMode === true;

    if (connectionMode) {
      return res.redirect(
        `${FRONTEND_URL}/settings?section=integrations&github=error`
      );
    }

    return res.redirect(
      `${FRONTEND_URL}/login?error=github_auth_failed`
    );
  }
}

/* =========================================================
   BACKWARD COMPATIBILITY
========================================================= */

const googleLogin =
  googleCallback;

const githubLogin =
  githubCallback;

/* =========================================================
   CURRENT USER
========================================================= */

async function getCurrentUser(
  req,
  res
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Not authenticated",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id:
          req.user.id,

        name:
          req.user.name,

        email:
          req.user.email,

        avatar:
          req.user.avatar ||
          null,

        role:
          req.user.role,

        provider:
          req.user.provider,

        subscriptionPlan:
          req.user.subscriptionPlan,

        credits:
          req.user.credits,

        deploymentsUsed:
          req.user.deploymentsUsed,
      },
    });

  } catch (error) {
    console.error(
      "[Current User] Error:",
      error?.stack ||
        error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get current user",
    });
  }
}

/* =========================================================
   LOGOUT
========================================================= */

async function logoutUser(
  req,
  res
) {
  try {
    clearAuthCookie(res);

    return res.status(200).json({
      success: true,
      message:
        "Logged out successfully",
    });

  } catch (error) {
    console.error(
      "[Logout] Error:",
      error?.stack ||
        error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Logout failed",
    });
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  registerUser,
  loginUser,

  googleCallback,
  githubCallback,

  googleLogin,
  githubLogin,

  getCurrentUser,
  logoutUser,
};
