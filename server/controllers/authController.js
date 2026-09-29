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

const COOKIE_SAME_SITE =
  process.env.COOKIE_SAME_SITE ||
  "none";

/* =========================================================
   HELPERS
========================================================= */

function generateToken(user) {
  if (!process.env.JWT_SECRET) {
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
      id: userId,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
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
  res.cookie(
    AUTH_COOKIE_NAME,
    token,
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        COOKIE_SAME_SITE,

      maxAge:
        7 *
        24 *
        60 *
        60 *
        1000,

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
      user?.id,

    name:
      user?.name,

    email:
      user?.email,

    avatar:
      user?.avatar ||
      null,

    role:
      user?.role,

    provider:
      user?.provider,

    subscriptionPlan:
      user?.subscriptionPlan,

    credits:
      user?.credits,

    deploymentsUsed:
      user?.deploymentsUsed,
  };
}

/* =========================================================
   REGISTER USER
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
    } = req.body;

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
      email
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
          name.trim(),

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
      token,
      user:
        formatUser(user),
    });
  } catch (error) {
    console.error(
      "Register error:",
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
   LOGIN USER
========================================================= */

async function loginUser(
  req,
  res
) {
  try {
    const {
      email,
      password,
    } = req.body;

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
      email
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
      user.isVerified ===
        false &&
      user.provider ===
        "email"
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
      token,
      user:
        formatUser(user),
    });
  } catch (error) {
    console.error(
      "Login error:",
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
       APPLICATION JWT
    ------------------------------------------------------- */

    const token =
      generateToken(user);

    /* -------------------------------------------------------
       AUTH COOKIE
    ------------------------------------------------------- */

    setAuthCookie(
      res,
      token
    );

    /* -------------------------------------------------------
       REDIRECT
    ------------------------------------------------------- */

    console.log(
      "[Google Callback] Authentication successful"
    );

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
       CHECK WHETHER THIS WAS A GITHUB CONNECTION
    ===================================================== */

    const githubOAuth =
      req.githubOAuth;

    const connectionMode =
      githubOAuth?.connectionMode ===
        true ||
      req.githubOAuthMode ===
        "connect";

    /* =====================================================
       CONNECT GITHUB TO EXISTING ZYRIONOS USER
    ===================================================== */

    if (connectionMode) {
      /* ---------------------------------------------------
         OAUTH HANDOFF MUST EXIST
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

      if (
        !githubOAuth.githubUser
      ) {
        console.error(
          "[GitHub Callback] GitHub user identity missing"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      const githubUser =
        githubOAuth.githubUser;

      /* ---------------------------------------------------
         FINAL IDENTITY VALIDATION
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

      if (
        !githubUser.username &&
        !githubUser.name
      ) {
        console.error(
          "[GitHub Callback] GitHub user identity is incomplete"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      /* ---------------------------------------------------
         PERSIST GITHUB CONNECTION
         
         githubService encrypts the access token.
         Token itself is never sent to frontend.
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

      /* ---------------------------------------------------
         SUCCESS
      --------------------------------------------------- */

      console.log(
        "[GitHub Callback] GitHub connection created successfully:",
        String(
          connection?._id ||
            connection?.id ||
            ""
        )
      );

      /*
       * We do not need to replace the user's primary
       * provider. The GitHub account is simply connected.
       */

      user.lastLogin =
        new Date();

      await user.save();

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
      "[GitHub Callback] Login successful"
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

    /*
     * Never expose:
     * - access token
     * - refresh token
     * - encryption key
     * - raw OAuth credentials
     */

    const connectionMode =
      req.githubOAuthMode ===
        "connect" ||
      req.githubOAuth?.connectionMode ===
        true;

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
   ALIASES
=========================================================

   Keep compatibility with older authRoutes files.
========================================================= */

const googleLogin =
  googleCallback;

const githubLogin =
  githubCallback;

/* =========================================================
   GET CURRENT USER
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
          req.user.avatar,

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
      "Get current user error:",
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
    res.clearCookie(
      AUTH_COOKIE_NAME,
      {
        httpOnly: true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite:
          COOKIE_SAME_SITE,

        path: "/",
      }
    );

    return res.status(200).json({
      success: true,
      message:
        "Logged out successfully",
    });
  } catch (error) {
    console.error(
      "Logout error:",
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

  /*
   * Backward compatibility.
   */
  googleLogin,
  githubLogin,

  getCurrentUser,
  logoutUser,
};
