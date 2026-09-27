/**
 * ZyrionOS - Environment Routes
 * Version: 2.1.0
 *
 * Environment API
 *
 * Flow:
 *
 * Client
 *   ↓
 * Authentication
 *   ↓
 * Rate Limiter
 *   ↓
 * Environment Routes
 *   ↓
 * Environment Controller
 *   ↓
 * Environment Service
 *   ↓
 * Environment Model
 *   ↓
 * MongoDB
 *
 * SECURITY:
 * - All environment routes require authentication.
 * - All environment routes are rate limited.
 * - Environment secrets are never intentionally returned by routes.
 * - Deployment secret resolution is NOT exposed as a public endpoint.
 * - Webhooks are NOT handled here.
 */

"use strict";

const express = require("express");

/* -------------------------------------------------------------------------- */
/* Controllers                                                                */
/* -------------------------------------------------------------------------- */

const environmentController = require(
  "../controllers/environmentController"
);

/* -------------------------------------------------------------------------- */
/* Middleware                                                                 */
/* -------------------------------------------------------------------------- */

const {
  authMiddleware,
} = require(
  "../middleware/authMiddleware"
);

const {
  apiLimiter,
} = require(
  "../middleware/rateLimiter"
);

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* Dependency Validation                                                      */
/* -------------------------------------------------------------------------- */

function assertFunction(
  object,
  name,
  source
) {
  if (
    !object ||
    typeof object[name] !== "function"
  ) {
    throw new Error(
      `${source}.${name} must be a function.`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Controller Contract Validation                                             */
/* -------------------------------------------------------------------------- */

const requiredControllerMethods = [
  "createEnvironment",
  "listEnvironments",
  "getEnvironment",
  "addVariable",
  "updateVariable",
  "deleteVariable",
  "validateEnvironment",
  "deploymentReadiness",
  "createDeploymentSnapshot",
  "markDeployed",
  "archiveEnvironment",
  "unarchiveEnvironment",
  "deleteEnvironment",
  "copyEnvironment",
  "getConfigurationSummary",
  "health",
];

for (
  const methodName
  of requiredControllerMethods
) {
  assertFunction(
    environmentController,
    methodName,
    "environmentController"
  );
}

/* -------------------------------------------------------------------------- */
/* Middleware Contract Validation                                             */
/* -------------------------------------------------------------------------- */

if (
  typeof authMiddleware !== "function"
) {
  throw new Error(
    "authMiddleware must be a function."
  );
}

if (
  typeof apiLimiter !== "function"
) {
  throw new Error(
    "apiLimiter must be a function."
  );
}

/* -------------------------------------------------------------------------- */
/* Common Protected Middleware                                                */
/* -------------------------------------------------------------------------- */

const protectedMiddleware = [
  authMiddleware,
  apiLimiter,
];

/* ========================================================================== */
/* HEALTH                                                                     */
/* ========================================================================== */

/**
 * GET /api/environments/health
 */
router.get(
  "/health",
  ...protectedMiddleware,
  environmentController.health
);

/* ========================================================================== */
/* ENVIRONMENT COLLECTION                                                     */
/* ========================================================================== */

/**
 * POST /api/environments
 */
router.post(
  "/",
  ...protectedMiddleware,
  environmentController.createEnvironment
);

/**
 * GET /api/environments?projectId=<id>
 */
router.get(
  "/",
  ...protectedMiddleware,
  environmentController.listEnvironments
);

/* ========================================================================== */
/* COPY ENVIRONMENT                                                           */
/* ========================================================================== */

/**
 * POST /api/environments/copy
 *
 * Body:
 *
 * {
 *   "projectId": "...",
 *   "sourceEnvironment": "development",
 *   "targetEnvironment": "preview",
 *   "copySecrets": false
 * }
 *
 * Secret copying is restricted to trusted internal deployment context.
 */
router.post(
  "/copy",
  ...protectedMiddleware,
  environmentController.copyEnvironment
);

/* ========================================================================== */
/* DEPLOYMENT OPERATIONS                                                      */
/* ========================================================================== */

/**
 * POST /api/environments/deployment-snapshot
 *
 * Browser/API route returns SAFE snapshot metadata only.
 *
 * Plaintext deployment variables are never returned by this route.
 */
router.post(
  "/deployment-snapshot",
  ...protectedMiddleware,
  environmentController.createDeploymentSnapshot
);

/**
 * POST /api/environments/mark-deployed
 */
router.post(
  "/mark-deployed",
  ...protectedMiddleware,
  environmentController.markDeployed
);

/* ========================================================================== */
/* PROJECT ENVIRONMENT                                                        */
/* ========================================================================== */

/**
 * GET /api/environments/:projectId/:environmentName
 */
router.get(
  "/:projectId/:environmentName",
  ...protectedMiddleware,
  environmentController.getEnvironment
);

/* ========================================================================== */
/* CONFIGURATION SUMMARY                                                      */
/* ========================================================================== */

/**
 * GET
 * /api/environments/:projectId/:environmentName/summary
 */
router.get(
  "/:projectId/:environmentName/summary",
  ...protectedMiddleware,
  environmentController.getConfigurationSummary
);

/* ========================================================================== */
/* VALIDATION                                                                 */
/* ========================================================================== */

/**
 * POST
 * /api/environments/:projectId/:environmentName/validate
 */
router.post(
  "/:projectId/:environmentName/validate",
  ...protectedMiddleware,
  environmentController.validateEnvironment
);

/* ========================================================================== */
/* DEPLOYMENT READINESS                                                       */
/* ========================================================================== */

/**
 * GET
 * /api/environments/:projectId/:environmentName/deployment-readiness
 *
 * Metadata-only.
 *
 * This route NEVER resolves plaintext deployment secrets.
 */
router.get(
  "/:projectId/:environmentName/deployment-readiness",
  ...protectedMiddleware,
  environmentController.deploymentReadiness
);

/* ========================================================================== */
/* ENVIRONMENT VARIABLES                                                      */
/* ========================================================================== */

/**
 * POST
 * /api/environments/:projectId/:environmentName/variables
 */
router.post(
  "/:projectId/:environmentName/variables",
  ...protectedMiddleware,
  environmentController.addVariable
);

/**
 * PATCH
 * /api/environments/:projectId/:environmentName/variables/:key
 */
router.patch(
  "/:projectId/:environmentName/variables/:key",
  ...protectedMiddleware,
  environmentController.updateVariable
);

/**
 * DELETE
 * /api/environments/:projectId/:environmentName/variables/:key
 */
router.delete(
  "/:projectId/:environmentName/variables/:key",
  ...protectedMiddleware,
  environmentController.deleteVariable
);

/* ========================================================================== */
/* ARCHIVE / RESTORE                                                          */
/* ========================================================================== */

/**
 * POST
 * /api/environments/:projectId/:environmentName/archive
 */
router.post(
  "/:projectId/:environmentName/archive",
  ...protectedMiddleware,
  environmentController.archiveEnvironment
);

/**
 * POST
 * /api/environments/:projectId/:environmentName/unarchive
 */
router.post(
  "/:projectId/:environmentName/unarchive",
  ...protectedMiddleware,
  environmentController.unarchiveEnvironment
);

/* ========================================================================== */
/* DELETE                                                                     */
/* ========================================================================== */

/**
 * DELETE
 * /api/environments/:projectId/:environmentName
 */
router.delete(
  "/:projectId/:environmentName",
  ...protectedMiddleware,
  environmentController.deleteEnvironment
);

/* ========================================================================== */
/* ROUTE CONTRACT                                                             */
/* ========================================================================== */

router.environmentRouteContract = {
  version: "2.1.0",

  basePath: "/api/environments",

  authentication: true,

  rateLimited: true,

  routes: [
    {
      method: "GET",
      path: "/health",
      controller: "health",
      sensitive: false,
    },

    {
      method: "POST",
      path: "/",
      controller: "createEnvironment",
      sensitive: true,
    },

    {
      method: "GET",
      path: "/",
      controller: "listEnvironments",
      sensitive: true,
    },

    {
      method: "POST",
      path: "/copy",
      controller: "copyEnvironment",
      sensitive: true,
    },

    {
      method: "POST",
      path: "/deployment-snapshot",
      controller: "createDeploymentSnapshot",
      sensitive: true,
    },

    {
      method: "POST",
      path: "/mark-deployed",
      controller: "markDeployed",
      sensitive: true,
    },

    {
      method: "GET",
      path: "/:projectId/:environmentName",
      controller: "getEnvironment",
      sensitive: true,
    },

    {
      method: "GET",
      path: "/:projectId/:environmentName/summary",
      controller: "getConfigurationSummary",
      sensitive: true,
    },

    {
      method: "POST",
      path: "/:projectId/:environmentName/validate",
      controller: "validateEnvironment",
      sensitive: true,
    },

    {
      method: "GET",
      path: "/:projectId/:environmentName/deployment-readiness",
      controller: "deploymentReadiness",
      sensitive: true,
    },

    {
      method: "POST",
      path: "/:projectId/:environmentName/variables",
      controller: "addVariable",
      sensitive: true,
    },

    {
      method: "PATCH",
      path: "/:projectId/:environmentName/variables/:key",
      controller: "updateVariable",
      sensitive: true,
    },

    {
      method: "DELETE",
      path: "/:projectId/:environmentName/variables/:key",
      controller: "deleteVariable",
      sensitive: true,
    },

    {
      method: "POST",
      path: "/:projectId/:environmentName/archive",
      controller: "archiveEnvironment",
      sensitive: true,
    },

    {
      method: "POST",
      path: "/:projectId/:environmentName/unarchive",
      controller: "unarchiveEnvironment",
      sensitive: true,
    },

    {
      method: "DELETE",
      path: "/:projectId/:environmentName",
      controller: "deleteEnvironment",
      sensitive: true,
    },
  ],
};

/* ========================================================================== */
/* ROUTER METADATA                                                            */
/* ========================================================================== */

router.version = "2.1.0";

router.service = "environment";

router.security = {
  authenticationRequired: true,
  rateLimitRequired: true,

  secretsExposedToClient: false,

  deploymentSecretResolutionExposed: false,

  webhookRoutesIncluded: false,
};

/* ========================================================================== */
/* EXPORT                                                                     */
/* ========================================================================== */

module.exports = router;
