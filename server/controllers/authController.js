const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/userModel");

/* =========================================================
   CONFIG
========================================================= */

const AUTH_COOKIE_NAME = "access_token";

const AUTH_COOKIE_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;

/* =========================================================
   GENERATE APPLICATION JWT
========================================================= */

function generateToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  return jwt.sign(
    {
      id: String(user._id),
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

function getAuthCookieOptions() {
  const isProduction =
    process.env.NODE_ENV === "production";

  return {
    httpOnly: true,

    /*
     * Production API is HTTPS.
     * Secure cookies prevent transmission over HTTP.
     */
    secure: isProduction,

    /*
     * Frontend and API may be treated as
     * cross-origin by the browser.
     *
     * "none" requires Secure in production.
     */
    sameSite: "none",

    /*
     * Cookie is valid for the complete API path.
     */
    path: "/",

    maxAge: AUTH_COOKIE_MAX_AGE,
  };
}

function setAuthCookie(res, token) {
  res.cookie(
    AUTH_COOKIE_NAME,
    token,
    getAuthCookieOptions()
  );
}

/* =========================================================
   FORMAT USER
========================================================= */

function formatUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    provider: user.provider,
    subscriptionPlan:
      user.subscriptionPlan,
    credits: user.credits,
    deploymentsUsed:
      user.deploymentsUsed,
  };
}

/* =========================================================
   REGISTER USER
========================================================= */

async function registerUser(req, res) {
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
        message: "All fields required",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const existingUser =
      await User.findOne({
        email: normalizedEmail,
      });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10
      );

    const user =
      await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        provider: "email",
        isVerified: true,
      });

    const token =
      generateToken(user);

    setAuthCookie(
      res,
      token
    );

    return res.status(201).json({
      success: true,
      user: formatUser(user),
    });
  } catch (error) {
    console.error(
      "Register error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Register failed",
    });
  }
}

/* =========================================================
   LOGIN USER
========================================================= */

async function loginUser(req, res) {
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
      email.trim().toLowerCase();

    const user =
      await User.findOne({
        email: normalizedEmail,
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

    /*
     * IMPORTANT:
     *
     * JWT stays inside HttpOnly cookie.
     * It is NOT returned to frontend JavaScript.
     */
    setAuthCookie(
      res,
      token
    );

    return res.status(200).json({
      success: true,
      user: formatUser(user),
    });
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
}

/* =========================================================
   GOOGLE LOGIN
========================================================= */

async function googleLogin(req, res) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Google authentication failed",
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

    const frontendUrl =
      process.env.FRONTEND_URL;

    if (!frontendUrl) {
      console.error(
        "FRONTEND_URL is missing"
      );

      return res.status(500).json({
        success: false,
        message:
          "Frontend URL configuration missing",
      });
    }

    return res.redirect(
      `${frontendUrl}/dashboard`
    );
  } catch (error) {
    console.error(
      "Google login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Google login failed",
    });
  }
}

/* =========================================================
   GITHUB LOGIN
========================================================= */

async function githubLogin(req, res) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "GitHub authentication failed",
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

    const frontendUrl =
      process.env.FRONTEND_URL;

    if (!frontendUrl) {
      console.error(
        "FRONTEND_URL is missing"
      );

      return res.status(500).json({
        success: false,
        message:
          "Frontend URL configuration missing",
      });
    }

    return res.redirect(
      `${frontendUrl}/dashboard`
    );
  } catch (error) {
    console.error(
      "GitHub login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "GitHub login failed",
    });
  }
}

/* =========================================================
   GET CURRENT USER
========================================================= */

async function getCurrentUser(req, res) {
  try {
    /*
     * authMiddleware must populate req.user
     * after verifying the access_token cookie.
     */
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Not authenticated",
      });
    }

    return res.status(200).json({
      success: true,
      user: formatUser(req.user),
    });
  } catch (error) {
    console.error(
      "Get current user error:",
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

async function logoutUser(req, res) {
  try {
    /*
     * clearCookie must use the same important
     * cookie attributes used when setting it.
     */
    res.clearCookie(
      AUTH_COOKIE_NAME,
      getAuthCookieOptions()
    );

    return res.status(200).json({
      success: true,
      message:
        "Logged out successfully",
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
   EXPORTS
========================================================= */

module.exports = {
  registerUser,
  loginUser,
  googleLogin,
  githubLogin,
  getCurrentUser,
  logoutUser,
};
