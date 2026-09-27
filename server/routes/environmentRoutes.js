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
/* Middleware                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * authMiddleware.js exports an object containing authMiddleware.
 */
const {
  authMiddleware,
} = require(
  "../middleware/authMiddleware"
);

/*
 * rateLimiter.js exports:
 *
 * apiLimiter
 * authLimiter
 * aiLimiter
 * deployLimiter
 */
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

assertFunction(
  environmentController,
  "createEnvironment",
  "environmentController"
);

assertFunction(
  environmentController,
  "listEnvironments",
  "environmentController"
);

assertFunction(
  environmentController,
  "getEnvironment",
  "environmentController"
);

assertFunction(
  environmentController,
  "addVariable",
  "environmentController"
);

assertFunction(
  environmentController,
  "updateVariable",
  "environmentController"
);

assertFunction(
  environmentController,
  "deleteVariable",
  "environmentController"
);

assertFunction(
  environmentController,
  "validateEnvironment",
  "environmentController"
);

assertFunction(
  environmentController,
  "deploymentReadiness",
  "environmentController"
);

assertFunction(
  environmentController,
  "createDeploymentSnapshot",
  "environmentController"
);

assertFunction(
  environmentController,
  "markDeployed",
  "environmentController"
);

assertFunction(
  environmentController,
  "archiveEnvironment",
  "environmentController"
);

assertFunction(
  environmentController,
  "unarchiveEnvironment",
  "environmentController"
);

assertFunction(
  environmentController,
  "deleteEnvironment",
  "environmentController"
);

assertFunction(
  environmentController,
  "copyEnvironment",
  "environmentController"
);

assertFunction(
  environmentController,
  "getConfigurationSummary",
  "environmentController"
);

assertFunction(
  environmentController,
  "health",
  "environmentController"
);

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

/**
 * Every environment endpoint is private and rate limited.
 *
 * Environment configuration may contain:
 * - API keys
 * - infrastructure credentials
 * - deployment configuration
 * - secret metadata
 *
 * Authentication and rate limiting therefore apply consistently
 * to every environment endpoint.
 */
const protectedMiddleware = [
  authMiddleware,
  apiLimiter,
];

/* ========================================================================== */
/* HEALTH                                                                     */
/* ========================================================================== */

/**
 * GET /api/environments/health
 *
 * Authenticated environment service health check.
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
 *
 * Create environment.
 */
router.post(
  "/",
  ...protectedMiddleware,
  environmentController.createEnvironment
);

/**
 * GET /api/environments?projectId=<id>
 *
 * List environments for a project.
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
 * Example:
 *
 * {
 *   "projectId": "...",
 *   "sourceEnvironment": "development",
 *   "targetEnvironment": "preview",
 *   "copySecrets": false
 * }
 *
 * Secret copying remains controlled by the service/controller.
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
 * Creates an immutable deployment configuration snapshot.
 */
router.post(
  "/deployment-snapshot",
  ...protectedMiddleware,
  environmentController.createDeploymentSnapshot
);

/**
 * POST /api/environments/mark-deployed
 *
 * Marks an environment as deployed after trusted deployment workflow
 * completion.
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
 *
 * Example:
 *
 * /api/environments/PROJECT_ID/production
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
 *
 * Returns configuration metadata.
 *
 * Secret values must never be returned.
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
 *
 * Validates environment configuration.
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
 * Returns deployment readiness metadata.
 *
 * Resolved deployment secrets must never be exposed through this endpoint.
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
 *
 * Add environment variable.
 */
router.post(
  "/:projectId/:environmentName/variables",
  ...protectedMiddleware,
  environmentController.addVariable
);

/**
 * PATCH
 * /api/environments/:projectId/:environmentName/variables/:key
 *
 * Update environment variable.
 */
router.patch(
  "/:projectId/:environmentName/variables/:key",
  ...protectedMiddleware,
  environmentController.updateVariable
);

/**
 * DELETE
 * /api/environments/:projectId/:environmentName/variables/:key
 *
 * Delete environment variable.
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
 *
 * Production deletion should require explicit confirmation
 * inside the controller/service layer.
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
