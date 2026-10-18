"use strict";

/**
 * =========================================================
 * ZYRION OS — ENTERPRISE PREVIEW ROUTES
 * Version: 2.0.0
 * =========================================================
 *
 * Responsibilities:
 * - Authenticate every preview endpoint.
 * - Apply endpoint-specific rate limits.
 * - Delegate business logic to previewController.
 * - Preserve structured API responses.
 * - Prevent unauthenticated fallback access.
 *
 * IMPORTANT:
 * - Mount this router at /api in server.js.
 * - Project ownership must be validated by controller/service.
 * - Never trust user IDs supplied by the client.
 * - This router does not execute project code directly.
 * =========================================================
 */

const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

/* =========================================================
   CONTROLLERS
   ========================================================= */

const {
  createPreviewController,
  getPreviewController,
  getPreviewByIdController,
  getPreviewHealthController,
  stopPreviewController,
  expirePreviewController,
  listPreviewsController,
} = require("../controllers/previewController");

/* =========================================================
   AUTHENTICATION
   ========================================================= */

/**
 * authMiddleware.js exports:
 *
 * {
 *   authMiddleware,
 *   adminMiddleware
 * }
 *
 * Import the actual authentication function.
 * Never treat the complete exports object as middleware.
 */

const authModule = require("../middleware/authMiddleware");

const authenticate = authModule.authMiddleware;

if (typeof authenticate !== "function") {
  throw new Error(
    "Preview routes require a valid authMiddleware.authMiddleware function."
  );
}

/**
 * Authentication is mandatory.
 *
 * The existing middleware validates the user's credentials
 * and attaches the authenticated user to req.user.
 *
 * No fallback accepts client-supplied user IDs.
 */

function requireAuthentication(req, res, next) {
  return authenticate(req, res, next);
}

/* =========================================================
   RATE LIMITING
   ========================================================= */

/**
 * express-rate-limit is a declared backend dependency.
 *
 * If the dependency is missing or misconfigured, startup
 * should fail instead of silently disabling rate limiting.
 */

const previewCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many preview creation requests. Please try again shortly.",
  },
});

const previewReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many preview requests. Please try again shortly.",
  },
});

/* =========================================================
   REQUEST CONTEXT
   ========================================================= */

router.use(function previewRouteContext(req, res, next) {
  req.previewRequestStartedAt = Date.now();

  next();
});

/* =========================================================
   CREATE PREVIEW
   =========================================================
   POST /api/projects/:projectId/preview

   Expected body:
   {
     "buildId": "build_xxx"
   }
   ========================================================= */

router.post(
  "/projects/:projectId/preview",
  requireAuthentication,
  previewCreateLimiter,
  createPreviewController
);

/* =========================================================
   GET ACTIVE PREVIEW
   =========================================================
   GET /api/projects/:projectId/preview
   ========================================================= */

router.get(
  "/projects/:projectId/preview",
  requireAuthentication,
  previewReadLimiter,
  getPreviewController
);

/* =========================================================
   LIST PROJECT PREVIEWS
   =========================================================
   GET /api/projects/:projectId/previews
   ========================================================= */

router.get(
  "/projects/:projectId/previews",
  requireAuthentication,
  previewReadLimiter,
  listPreviewsController
);

/* =========================================================
   GET PREVIEW BY ID
   =========================================================
   GET /api/projects/:projectId/preview/:previewId
   ========================================================= */

router.get(
  "/projects/:projectId/preview/:previewId",
  requireAuthentication,
  previewReadLimiter,
  getPreviewByIdController
);

/* =========================================================
   PREVIEW HEALTH
   =========================================================
   GET /api/projects/:projectId/preview/:previewId/health
   ========================================================= */

router.get(
  "/projects/:projectId/preview/:previewId/health",
  requireAuthentication,
  previewReadLimiter,
  getPreviewHealthController
);

/* =========================================================
   STOP PREVIEW
   =========================================================
   POST /api/projects/:projectId/preview/:previewId/stop
   ========================================================= */

router.post(
  "/projects/:projectId/preview/:previewId/stop",
  requireAuthentication,
  previewCreateLimiter,
  stopPreviewController
);

/* =========================================================
   EXPIRE PREVIEW
   =========================================================
   POST /api/projects/:projectId/preview/:previewId/expire
   ========================================================= */

router.post(
  "/projects/:projectId/preview/:previewId/expire",
  requireAuthentication,
  previewCreateLimiter,
  expirePreviewController
);

/* =========================================================
   PREVIEW ROUTE NOT FOUND
   ========================================================= */

/**
 * This handler belongs at the end of this router.
 *
 * server.js must mount previewRoutes after the other API
 * routers because this handler returns a router-level 404.
 */

router.use(function previewRouteNotFound(req, res) {
  return res.status(404).json({
    success: false,
    message: "Preview route not found",
    path: req.originalUrl,
  });
});

/* =========================================================
   PREVIEW ROUTE ERROR HANDLER
   ========================================================= */

router.use(function previewRouteErrorHandler(
  error,
  req,
  res,
  next
) {
  console.error("PREVIEW ROUTE ERROR:", {
    message: error?.message || "Unknown preview route error",
    stack: error?.stack,
    path: req?.originalUrl,
    method: req?.method,
  });

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    message: "Preview request failed",
  });
});

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = router;
