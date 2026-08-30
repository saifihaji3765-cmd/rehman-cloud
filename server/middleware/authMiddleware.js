const jwt = require("jsonwebtoken");

const User = require("../models/userModel");

/* =========================
AUTH MIDDLEWARE
========================= */

async function authMiddleware(req, res, next) {
  try {
    /* =========================
       GET TOKEN
    ========================= */

    let token = null;

    /*
     * PRIMARY:
     * HttpOnly cookie authentication
     */
    if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    /*
     * FALLBACK:
     * Bearer token authentication
     */
    if (
      !token &&
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    /* =========================
       TOKEN CHECK
    ========================= */

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required"
      });
    }

    /* =========================
       JWT SECRET CHECK
    ========================= */

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration error"
      });
    }

    /* =========================
       VERIFY TOKEN
    ========================= */

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    /* =========================
       FIND USER
    ========================= */

    const user = await User.findById(
      decoded.id
    ).select("-password");

    /* =========================
       USER CHECK
    ========================= */

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    /* =========================
       VERIFIED CHECK
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
       ATTACH USER
    ========================= */

    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      provider: user.provider,
      subscriptionPlan: user.subscriptionPlan,
      credits: user.credits,
      deploymentsUsed: user.deploymentsUsed,
      avatar: user.avatar
    };

    /* =========================
       NEXT
    ========================= */

    next();

  } catch (error) {

    /* =========================
       TOKEN EXPIRED
    ========================= */

    if (
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Token expired"
      });
    }

    /* =========================
       INVALID TOKEN
    ========================= */

    if (
      error.name === "JsonWebTokenError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid token"
      });
    }

    /* =========================
       SERVER ERROR
    ========================= */

    console.error(
      "Auth middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Authentication failed"
    });
  }
}

/* =========================
ADMIN MIDDLEWARE
========================= */

function adminMiddleware(req, res, next) {
  try {

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required"
      });
    }

    next();

  } catch (error) {

    console.error(
      "Admin middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Authorization failed"
    });
  }
}

/* =========================
EXPORTS
========================= */

module.exports = {
  authMiddleware,
  adminMiddleware
};
