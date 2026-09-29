require("dotenv").config();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/userModel");
const githubService = require("../services/githubService");

/* =========================================================
   CONFIG
========================================================= */

const JWT_SECRET =
  process.env.JWT_SECRET;

const JWT_EXPIRES_IN =
  process.env.JWT_EXPIRES_IN ||
  "7d";

const COOKIE_NAME =
  process.env.AUTH_COOKIE_NAME ||
  "access_token";

const COOKIE_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://zyrionos.com";

/* =========================================================
   SANITIZE USER
========================================================= */

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const source =
    typeof user.toObject === "function"
      ? user.toObject()
      : { ...user };

  delete source.password;
  delete source.passwordHash;
  delete source.accessToken;
  delete source.refreshToken;

  return source;
}

/* =========================================================
   GENERATE JWT
========================================================= */

function generateToken(user) {
  const userId =
    user?._id ||
    user?.id;

  const email =
    user?.email || "";

  const role =
    user?.role || "user";

  if (!userId) {
    throw new Error(
      "Cannot generate token: user ID missing"
    );
  }

  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is not configured"
    );
  }

  return jwt.sign(
    {
      id: String(userId),
      email,
      role,
    },
    JWT_SECRET,
    {
      expiresIn:
        JWT_EXPIRES_IN,
    }
  );
}

/* =========================================================
   COOKIE OPTIONS
========================================================= */

function getCookieOptions() {
  return {
    httpOnly: true,

    secure:
      process.env.NODE_ENV ===
      "production",

    sameSite:
      process.env.COOKIE_SAME_SITE ||
      "lax",

    maxAge:
      COOKIE_MAX_AGE,

    path: "/",
  };
}

/* =========================================================
   SET AUTH COOKIE
========================================================= */

function setAuthCookie(
  res,
  token
) {
  res.cookie(
    COOKIE_NAME,
    token,
    getCookieOptions()
  );
}

/* =========================================================
   CLEAR AUTH COOKIE
========================================================= */

function clearAuthCookie(res) {
  res.clearCookie(
    COOKIE_NAME,
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        process.env.COOKIE_SAME_SITE ||
        "lax",

      path: "/",
    }
  );
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
          "Name, email and password are required",
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
      return res.status(409).json({
        success: false,
        message:
          "An account with this email already exists",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
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
          false,

        lastLogin:
          new Date(),
      });

    const token =
      generateToken(user);

    setAuthCookie(
      res,
      token
    );

    return res.status(201).json({
      success: true,
      message:
        "Registration successful",
      data: {
        user:
          sanitizeUser(user),
      },
    });
  } catch (error) {
    console.error(
      "Register error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Registration failed",
    });
  }
}

/* =========================================================
   LOGIN
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
          "Email and password are required",
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
      }).select(
        "+password"
      );

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    if (
      !user.password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This account does not use email/password login",
      });
    }

    const passwordValid =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    if (
      user.isVerified === false
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
      message:
        "Login successful",
      data: {
        user:
          sanitizeUser(user),
      },
    });
  } catch (error) {
    console.error(
      "Login error:",
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
    if (!req.user) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=google_user_missing`
      );
    }

    const token =
      generateToken(
        req.user
      );

    setAuthCookie(
      res,
      token
    );

    return res.redirect(
      `${FRONTEND_URL}/dashboard`
    );
  } catch (error) {
    console.error(
      "Google callback error:",
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
    if (!req.user) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=github_user_missing`
      );
    }

    /* =======================================================
       GITHUB CONNECTION MODE
       
       passport.js places OAuth credentials in req.githubOAuth.
       They are NEVER returned to the frontend.
    ======================================================= */

    const githubOAuth =
      req.githubOAuth;

    if (
      githubOAuth &&
      githubOAuth.connectionMode === true
    ) {
      const userId =
        req.user?._id ||
        req.user?.id;

      if (!userId) {
        console.error(
          "GitHub connection failed: user ID missing"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      if (
        !githubOAuth.accessToken ||
        !githubOAuth.githubUser?.githubId
      ) {
        console.error(
          "GitHub connection failed: OAuth credentials missing"
        );

        return res.redirect(
          `${FRONTEND_URL}/settings?section=integrations&github=error`
        );
      }

      /* -----------------------------------------------------
         CREATE / UPDATE ENCRYPTED GITHUB CONNECTION
      ----------------------------------------------------- */

      await githubService.createConnection({
        userId,

        projectId:
          null,

        accessToken:
          githubOAuth.accessToken,

        connectionType:
          "oauth",

        githubUser:
          githubOAuth.githubUser,

        scopes:
          githubOAuth.scopes || [
            "user:email",
          ],
      });

      /*
       * Refresh the normal ZyrionOS JWT.
       * This does not contain the GitHub token.
       */

      const token =
        generateToken(
          req.user
        );

      setAuthCookie(
        res,
        token
      );

      return res.redirect(
        `${FRONTEND_URL}/settings?section=integrations&github=connected`
      );
    }

    /* =======================================================
       NORMAL GITHUB LOGIN
    ======================================================= */

    const token =
      generateToken(
        req.user
      );

    setAuthCookie(
      res,
      token
    );

    return res.redirect(
      `${FRONTEND_URL}/dashboard`
    );
  } catch (error) {
    console.error(
      "GitHub callback error:",
      error?.response?.data ||
        error?.message ||
        error
    );

    return res.redirect(
      `${FRONTEND_URL}/settings?section=integrations&github=error`
    );
  }
}

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
          "Authentication required",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Current user retrieved",
      data: {
        user:
          sanitizeUser(
            req.user
          ),
      },
    });
  } catch (error) {
    console.error(
      "Get current user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve current user",
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
    clearAuthCookie(
      res
    );

    return res.status(200).json({
      success: true,
      message:
        "Logout successful",
    });
  } catch (error) {
    console.error(
      "Logout error:",
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
   BACKWARD-COMPATIBILITY ALIASES
========================================================= */

const googleLogin =
  googleCallback;

const githubLogin =
  githubCallback;

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  registerUser,
  loginUser,

  googleCallback,
  googleLogin,

  githubCallback,
  githubLogin,

  getCurrentUser,
  logoutUser,
};
