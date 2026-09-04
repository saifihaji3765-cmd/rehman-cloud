const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/* =========================
MODEL
========================= */

const User = require("../models/userModel");

/* =========================
GENERATE APPLICATION JWT
========================= */

function generateToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

/* =========================
SET AUTH COOKIE
========================= */

function setAuthCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

/* =========================
USER RESPONSE
========================= */

function formatUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    provider: user.provider,
    subscriptionPlan: user.subscriptionPlan,
    credits: user.credits,
    deploymentsUsed: user.deploymentsUsed
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
      password
    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required"
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    /* =========================
       EXISTING USER
    ========================= */

    const existingUser =
      await User.findOne({
        email: normalizedEmail
      });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists"
      });
    }

    /* =========================
       HASH PASSWORD
    ========================= */

    const hashedPassword =
      await bcrypt.hash(password, 10);

    /* =========================
       CREATE USER
    ========================= */

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      provider: "email",
      isVerified: true
    });

    /* =========================
       GENERATE JWT
    ========================= */

    const token =
      generateToken(user);

    /* =========================
       AUTH COOKIE
    ========================= */

    setAuthCookie(res, token);

    /* =========================
       RESPONSE
    ========================= */

    return res.status(201).json({
      success: true,
      token,
      user: formatUser(user)
    });

  } catch (error) {
    console.error(
      "Register error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Register failed"
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
      password
    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password required"
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    /* =========================
       FIND USER
    ========================= */

    const user =
      await User.findOne({
        email: normalizedEmail
      });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    /* =========================
       PASSWORD USER CHECK
    ========================= */

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account uses social login"
      });
    }

    /* =========================
       PASSWORD CHECK
    ========================= */

    const validPassword =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    /* =========================
       EMAIL VERIFICATION
    ========================= */

    if (
      user.isVerified === false &&
      user.provider === "email"
    ) {
      return res.status(403).json({
        success: false,
        message: "Account not verified"
      });
    }

    /* =========================
       UPDATE LAST LOGIN
    ========================= */

    user.lastLogin = new Date();

    await user.save();

    /* =========================
       GENERATE JWT
    ========================= */

    const token =
      generateToken(user);

    /* =========================
       AUTH COOKIE
    ========================= */

    setAuthCookie(res, token);

    /* =========================
       RESPONSE
    ========================= */

    return res.status(200).json({
      success: true,
      token,
      user: formatUser(user)
    });

  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
}

/* =========================================================
   GOOGLE LOGIN
========================================================= */

async function googleLogin(req, res) {
  try {
    /* =========================
       PASSPORT USER
    ========================= */

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Google authentication failed"
      });
    }

    /* =========================
       UPDATE LAST LOGIN
    ========================= */

    user.lastLogin = new Date();

    await user.save();

    /* =========================
   APPLICATION JWT
========================= */

const token =
  generateToken(user);

/* =========================
   HTTP-ONLY COOKIE
========================= */

setAuthCookie(res, token);

/* =========================
   FRONTEND REDIRECT
========================= */

if (!process.env.FRONTEND_URL) {

  console.error(
    "FRONTEND_URL is missing"
  );

  return res.status(500).json({
    success: false,
    message:
      "Frontend URL configuration missing"
  });

}

return res.redirect(
  `${process.env.FRONTEND_URL}/dashboard`
);

  } catch (error) {
    console.error(
      "Google login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Google login failed"
    });
  }
}

/* =========================================================
   GITHUB LOGIN
========================================================= */

async function githubLogin(req, res) {
  try {
    /* =========================
       PASSPORT USER
    ========================= */

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "GitHub authentication failed"
      });
    }

    /* =========================
       UPDATE LAST LOGIN
    ========================= */

    user.lastLogin = new Date();

    await user.save();

    /* =========================
       APPLICATION JWT
    ========================= */

    const token =
      generateToken(user);

    /* =========================
       HTTP-ONLY COOKIE
    ========================= */

    setAuthCookie(res, token);

    /* =========================
       FRONTEND REDIRECT
    ========================= */

    if (!process.env.CLIENT_URL) {
      console.error(
        "CLIENT_URL is missing"
      );

      return res.status(500).json({
        success: false,
        message:
          "Frontend URL configuration missing"
      });
    }

    return res.redirect(
      `${process.env.CLIENT_URL}/dashboard`
    );

  } catch (error) {
    console.error(
      "GitHub login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "GitHub login failed"
    });
  }
}

/* =========================================================
   GET CURRENT USER
========================================================= */

async function getCurrentUser(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        role: req.user.role,
        provider: req.user.provider,
        subscriptionPlan:
          req.user.subscriptionPlan,
        credits:
          req.user.credits,
        deploymentsUsed:
          req.user.deploymentsUsed
      }
    });

  } catch (error) {
    console.error(
      "Get current user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get current user"
    });
  }
}

/* =========================================================
   LOGOUT USER
========================================================= */

async function logoutUser(req, res) {
  try {
    /* =========================
       CLEAR AUTH COOKIE
    ========================= */

    res.clearCookie(
      "access_token",
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/"
      }
    );

    /* =========================
       RESPONSE
    ========================= */

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (error) {
    console.error(
      "Logout error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Logout failed"
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
  logoutUser
};
