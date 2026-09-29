const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

/* =========================================================
   CONFIG
========================================================= */

const AUTH_COOKIE_NAME =
  process.env.AUTH_COOKIE_NAME ||
  "access_token";

/* =========================================================
   GET AUTH TOKEN
========================================================= */

function getAuthToken(req) {
  /* -------------------------------------------------------
     PRIMARY:
     HttpOnly authentication cookie
  ------------------------------------------------------- */

  if (
    req.cookies &&
    req.cookies[AUTH_COOKIE_NAME]
  ) {
    return req.cookies[AUTH_COOKIE_NAME];
  }

  /* -------------------------------------------------------
     FALLBACK:
     Bearer token
  ------------------------------------------------------- */

  const authorization =
    req.headers.authorization;

  if (
    authorization &&
    authorization.startsWith("Bearer ")
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  return null;
}

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

async function authMiddleware(
  req,
  res,
  next
) {
  try {
    /* -------------------------------------------------------
       JWT SECRET
    ------------------------------------------------------- */

    const JWT_SECRET =
      process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      console.error(
        "[Auth] JWT_SECRET is missing"
      );

      return res.status(500).json({
        success: false,
        message:
          "Authentication configuration error",
      });
    }

    /* -------------------------------------------------------
       GET TOKEN
    ------------------------------------------------------- */

    const token =
      getAuthToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message:
          "Access token required",
      });
    }

    /* -------------------------------------------------------
       VERIFY JWT
    ------------------------------------------------------- */

    let decoded;

    try {
      decoded =
        jwt.verify(
          token,
          JWT_SECRET
        );
    } catch (error) {
      if (
        error?.name ===
        "TokenExpiredError"
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Token expired",
        });
      }

      if (
        error?.name ===
        "JsonWebTokenError"
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid token",
        });
      }

      console.error(
        "[Auth] JWT verification error:",
        error?.stack ||
          error?.message ||
          error
      );

      return res.status(401).json({
        success: false,
        message:
          "Authentication failed",
      });
    }

    /* -------------------------------------------------------
       TOKEN PAYLOAD VALIDATION
    ------------------------------------------------------- */

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid authentication token",
      });
    }

    /* -------------------------------------------------------
       FIND USER
    ------------------------------------------------------- */

    const user =
      await User.findById(
        decoded.id
      ).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "User not found",
      });
    }

    /* -------------------------------------------------------
       EMAIL VERIFICATION
    ------------------------------------------------------- */

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

    /* -------------------------------------------------------
       ATTACH AUTHENTICATED USER
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

    /* -------------------------------------------------------
       CONTINUE
    ------------------------------------------------------- */

    return next();

  } catch (error) {
    console.error(
      "[Auth] Middleware error:",
      error?.stack ||
        error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Authentication failed",
    });
  }
}

/* =========================================================
   ADMIN MIDDLEWARE
========================================================= */

function adminMiddleware(
  req,
  res,
  next
) {
  try {
    /* -------------------------------------------------------
       AUTHENTICATION CHECK
    ------------------------------------------------------- */

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    /* -------------------------------------------------------
       ADMIN ROLE CHECK
    ------------------------------------------------------- */

    if (
      req.user.role !==
      "admin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Admin access required",
      });
    }

    return next();

  } catch (error) {
    console.error(
      "[Admin] Middleware error:",
      error?.stack ||
        error?.message ||
        error
    );

    return res.status(500).json({
      success: false,
      message:
        "Authorization failed",
    });
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  authMiddleware,
  adminMiddleware,
};
