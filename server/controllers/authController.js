require("dotenv").config();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/userModel");

/* =========================================================
   CONFIG
========================================================= */

const JWT_SECRET = process.env.JWT_SECRET;

const TOKEN_EXPIRES_IN = "7d";

const COOKIE_NAME = "access_token";

const COOKIE_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://zyrionos.com";

/* =========================================================
   ENV VALIDATION
========================================================= */

if (!JWT_SECRET) {
  console.warn(
    "WARNING: JWT_SECRET is not configured."
  );
}

/* =========================================================
   SAFE USER
========================================================= */

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const source =
    typeof user.toObject === "function"
      ? user.toObject()
      : { ...user };

  /*
   * Never expose password/hash fields.
   */

  delete source.password;
  delete source.passwordHash;

  /*
   * Never expose sensitive OAuth tokens.
   */

  delete source.accessToken;
  delete source.refreshToken;

  return source;
}

/* =========================================================
   GENERATE JWT
========================================================= */

function generateToken(user) {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is not configured."
    );
  }

  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role || "user",
    },
    JWT_SECRET,
    {
      expiresIn:
        TOKEN_EXPIRES_IN,
    }
  );
}

/* =========================================================
   SET AUTH COOKIE
========================================================= */

function setAuthCookie(
  res,
  token
) {
  /*
   * ZyrionOS frontend:
   *
   * https://zyrionos.com
   *
   * ZyrionOS API:
   *
   * https://api.zyrionos.com
   *
   * These are same-site subdomains.
   *
   * HttpOnly:
   * JavaScript cannot read the JWT.
   *
   * Secure:
   * Cookie is sent only over HTTPS.
   *
   * SameSite=lax:
   * Suitable for the production
   * zyrionos.com / api.zyrionos.com
   * authentication flow.
   */

  res.cookie(
    COOKIE_NAME,
    token,
    {
      httpOnly: true,

      secure: true,

      sameSite: "lax",

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
  /*
   * Cookie attributes must match
   * the attributes used when setting it.
   */

  res.clearCookie(
    COOKIE_NAME,
    {
      httpOnly: true,

      secure: true,

      sameSite: "lax",

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
    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if (
      !name ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, email and password are required.",
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    if (
      password.length < 6
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters.",
      });
    }

    /* =========================
       EXISTING USER
    ========================= */

    const existingUser =
      await User.findOne({
        email:
          normalizedEmail,
      });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          existingUser.provider &&
          existingUser.provider !==
            "email"
            ? "This account uses social login."
            : "An account with this email already exists.",
      });
    }

    /* =========================
       HASH PASSWORD
    ========================= */

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    /* =========================
       CREATE USER
    ========================= */

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

        lastLogin:
          new Date(),
      });

    /* =========================
       SESSION
    ========================= */

    const token =
      generateToken(user);

    setAuthCookie(
      res,
      token
    );

    /* =========================
       RESPONSE
    ========================= */

    return res.status(201).json({
      success: true,

      user:
        sanitizeUser(user),
    });

  } catch (error) {
    console.error(
      "Register Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create account.",
    });
  }
}

/* =========================================================
   EMAIL / PASSWORD LOGIN
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

    /* =========================
       VALIDATION
    ========================= */

    if (
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required.",
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    /* =========================
       FIND USER
    ========================= */

    const user =
      await User.findOne({
        email:
          normalizedEmail,
      });

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password.",
      });
    }

    /* =========================
       SOCIAL LOGIN ACCOUNT
    ========================= */

    if (
      user.provider &&
      user.provider !==
        "email"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This account uses social login.",
      });
    }

    /* =========================
       PASSWORD
    ========================= */

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account does not have a password login.",
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
          "Invalid email or password.",
      });
    }

    /* =========================
       VERIFIED
    ========================= */

    if (
      user.isVerified === false
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your account before signing in.",
      });
    }

    /* =========================
       LAST LOGIN
    ========================= */

    user.lastLogin =
      new Date();

    await user.save();

    /* =========================
       CREATE SESSION
    ========================= */

    const token =
      generateToken(user);

    setAuthCookie(
      res,
      token
    );

    /* =========================
       RESPONSE
    ========================= */

    /*
     * IMPORTANT:
     *
     * JWT is NOT returned in JSON.
     *
     * It stays inside the
     * HttpOnly access_token cookie.
     */

    return res.status(200).json({
      success: true,

      user:
        sanitizeUser(user),
    });

  } catch (error) {
    console.error(
      "Login Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to sign in.",
    });
  }
}

/* =========================================================
   GOOGLE CALLBACK
========================================================= */

function googleCallback(
  req,
  res
) {
  try {
    if (!req.user) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=google_auth_failed`
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

    /*
     * IMPORTANT:
     *
     * Never put JWT in the URL.
     *
     * BAD:
     *
     * /dashboard?token=...
     *
     * GOOD:
     *
     * HttpOnly cookie
     * +
     * /dashboard
     */

    return res.redirect(
      `${FRONTEND_URL}/dashboard`
    );

  } catch (error) {
    console.error(
      "Google Callback Error:",
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

function githubCallback(
  req,
  res
) {
  try {
    if (!req.user) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=github_auth_failed`
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

    /*
     * JWT stays inside
     * HttpOnly cookie.
     */

    return res.redirect(
      `${FRONTEND_URL}/dashboard`
    );

  } catch (error) {
    console.error(
      "GitHub Callback Error:",
      error
    );

    return res.redirect(
      `${FRONTEND_URL}/login?error=github_auth_failed`
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
    /*
     * authMiddleware already verified
     * the HttpOnly JWT and attached
     * the user to req.user.
     */

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }

    return res.status(200).json({
      success: true,

      user:
        sanitizeUser(
          req.user
        ),
    });

  } catch (error) {
    console.error(
      "Get Current User Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve current user.",
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
        "Logged out successfully.",
    });

  } catch (error) {
    console.error(
      "Logout Error:",
      error
    );

    /*
     * Even if another operation fails,
     * make sure the cookie is cleared.
     */

    clearAuthCookie(
      res
    );

    return res.status(200).json({
      success: true,
      message:
        "Logged out successfully.",
    });
  }
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  registerUser,
  loginUser,
  googleCallback,
  githubCallback,
  getCurrentUser,
  logoutUser,
};
