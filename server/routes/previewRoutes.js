"use strict";

/**
 * =========================================================
 * ZYRION OS — ENTERPRISE PREVIEW ROUTES
 * =========================================================
 *
 * Preview API boundary
 *
 * Flow:
 *
 * Request
 *   ↓
 * Authentication
 *   ↓
 * Rate Limiting
 *   ↓
 * Controller
 *   ↓
 * Preview Service
 *   ↓
 * Authoritative Build Artifact
 *   ↓
 * Isolated Preview Runtime
 *
 * IMPORTANT:
 * - Routes contain no business logic.
 * - Routes never execute project code.
 * - Routes never build projects directly.
 * - Authentication is required for every endpoint.
 * - Project ownership is enforced inside controller/service.
 * =========================================================
 */

const express = require("express");

const router =
  express.Router();


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
  listPreviewsController
} =
  require("../controllers/previewController");


/* =========================================================
   MIDDLEWARE
   ========================================================= */

/*
 * IMPORTANT:
 *
 * ZyrionOS already has authentication middleware in the
 * existing backend. Because the exact middleware filename
 * should not be guessed, this route file intentionally
 * resolves it from the common project convention.
 *
 * If your backend already mounts authentication globally,
 * these guards can remain omitted at the mount level.
 */

let authenticate;

try {
  authenticate =
    require("../middleware/authMiddleware");
} catch (error) {
  try {
    authenticate =
      require("../middleware/auth");
  } catch (fallbackError) {
    /*
     * Authentication may already be applied globally
     * by server.js / route mounting.
     *
     * Do not silently create fake authentication.
     */
    authenticate =
      null;
  }
}


/* =========================================================
   RATE LIMITING
   ========================================================= */

let rateLimit;

try {
  rateLimit =
    require("express-rate-limit");
} catch (error) {
  rateLimit =
    null;
}


/*
 * Preview creation is expensive because it can:
 *
 * - extract artifacts
 * - install runtime dependencies
 * - create Docker containers
 * - perform health checks
 *
 * Therefore creation receives a stricter limiter.
 */

const previewCreateLimiter =
  rateLimit
    ? rateLimit({
        windowMs:
          60 * 1000,

        max: 10,

        standardHeaders:
          true,

        legacyHeaders:
          false,

        message: {
          success: false,

          message:
            "Too many preview creation requests. Please try again shortly."
        }
      })
    : null;


/*
 * Read/health endpoints can be called more frequently.
 */

const previewReadLimiter =
  rateLimit
    ? rateLimit({
        windowMs:
          60 * 1000,

        max: 120,

        standardHeaders:
          true,

        legacyHeaders:
          false,

        message: {
          success: false,

          message:
            "Too many preview requests. Please try again shortly."
        }
      })
    : null;


/* =========================================================
   AUTH WRAPPER
   ========================================================= */

function requireAuthentication(
  req,
  res,
  next
) {
  /*
   * If authentication middleware exists,
   * delegate to it.
   */

  if (authenticate) {
    return authenticate(
      req,
      res,
      next
    );
  }

  /*
   * Fallback protection:
   *
   * Do NOT trust arbitrary user IDs supplied in
   * query/body/headers.
   *
   * Only accept an already-populated req.user.
   *
   * This supports deployments where authentication
   * is applied globally before this router.
   */

  if (!req.user) {
    return res
      .status(401)
      .json({
        success: false,

        message:
          "Authentication required"
      });
  }

  return next();
}


/* =========================================================
   RATE LIMIT WRAPPER
   ========================================================= */

function optionalLimiter(
  limiter
) {
  return (
    limiter ||
    function noLimiter(
      req,
      res,
      next
    ) {
      next();
    }
  );
}


/* =========================================================
   ROUTER METADATA
   ========================================================= */

router.use(
  function previewRouteContext(
    req,
    res,
    next
  ) {
    /*
     * Request timestamp is useful for
     * observability without introducing
     * business logic into controllers.
     */

    req.previewRequestStartedAt =
      Date.now();

    next();
  }
);


/* =========================================================
   CREATE PREVIEW
   =========================================================
 *
 * POST
 * /api/projects/:projectId/preview
 *
 * Body:
 *
 * {
 *   "buildId": "build_xxx"
 * }
 *
 * Only an authoritative successful build may
 * be previewed.
 */

router.post(
  "/projects/:projectId/preview",

  requireAuthentication,

  optionalLimiter(
    previewCreateLimiter
  ),

  createPreviewController
);


/* =========================================================
   GET ACTIVE PREVIEW
   =========================================================
 *
 * GET
 * /api/projects/:projectId/preview
 */

router.get(
  "/projects/:projectId/preview",

  requireAuthentication,

  optionalLimiter(
    previewReadLimiter
  ),

  getPreviewController
);


/* =========================================================
   LIST PREVIEWS
   =========================================================
 *
 * GET
 * /api/projects/:projectId/previews
 */

router.get(
  "/projects/:projectId/previews",

  requireAuthentication,

  optionalLimiter(
    previewReadLimiter
  ),

  listPreviewsController
);


/* =========================================================
   GET SPECIFIC PREVIEW
   =========================================================
 *
 * GET
 * /api/projects/:projectId/preview/:previewId
 */

router.get(
  "/projects/:projectId/preview/:previewId",

  requireAuthentication,

  optionalLimiter(
    previewReadLimiter
  ),

  getPreviewByIdController
);


/* =========================================================
   PREVIEW HEALTH
   =========================================================
 *
 * GET
 * /api/projects/:projectId/preview/:previewId/health
 *
 * Used by Workspace to determine:
 *
 * starting
 * running
 * unhealthy
 * stopped
 * expired
 */

router.get(
  "/projects/:projectId/preview/:previewId/health",

  requireAuthentication,

  optionalLimiter(
    previewReadLimiter
  ),

  getPreviewHealthController
);


/* =========================================================
   STOP PREVIEW
   =========================================================
 *
 * POST
 * /api/projects/:projectId/preview/:previewId/stop
 */

router.post(
  "/projects/:projectId/preview/:previewId/stop",

  requireAuthentication,

  optionalLimiter(
    previewCreateLimiter
  ),

  stopPreviewController
);


/* =========================================================
   EXPIRE PREVIEW
   =========================================================
 *
 * POST
 * /api/projects/:projectId/preview/:previewId/expire
 */

router.post(
  "/projects/:projectId/preview/:previewId/expire",

  requireAuthentication,

  optionalLimiter(
    previewCreateLimiter
  ),

  expirePreviewController
);


/* =========================================================
   ROUTE NOT FOUND HANDLER
   =========================================================
 *
 * This router must not swallow requests silently.
 *
 * If an invalid preview endpoint reaches this router,
 * return a structured API response.
 */

router.use(
  function previewRouteNotFound(
    req,
    res
  ) {
    return res
      .status(404)
      .json({
        success: false,

        message:
          "Preview route not found",

        path:
          req.originalUrl
      });
  }
);


/* =========================================================
   ERROR HANDLER
   =========================================================
 *
 * Last-resort protection for unexpected synchronous
 * middleware errors.
 *
 * Business/service errors should normally already be
 * handled by previewController.
 */

router.use(
  function previewRouteErrorHandler(
    error,
    req,
    res,
    next
  ) {
    console.error(
      "PREVIEW ROUTE ERROR:",
      {
        message:
          error?.message,

        stack:
          error?.stack,

        path:
          req?.originalUrl,

        method:
          req?.method
      }
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Preview request failed"
      });
  }
);


/* =========================================================
   EXPORT
   ========================================================= */

module.exports =
  router;
