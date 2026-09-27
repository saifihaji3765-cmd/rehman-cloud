/**
 * ZyrionOS - Environment Routes
 * Version: 2.0.0
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
 * - Environment secrets are never returned by routes.
 * - Deployment secret resolution is NOT exposed as a public
 *   endpoint.
 * - Webhooks are NOT handled here.
 */

"use strict";

const express = require("express");

const environmentController = require(
  "../controllers/environmentController"
);

const authMiddleware = require(
  "../middleware/authMiddleware"
);

const apiLimiter = require(
  "../middleware/apiLimiter"
);

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

if (typeof authMiddleware !== "function") {
  throw new Error(
    "authMiddleware must be a function."
  );
}

if (typeof apiLimiter !== "function") {
  throw new Error(
    "apiLimiter must be a function."
  );
}

/* -------------------------------------------------------------------------- */
/* Common Middleware                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every environment endpoint is private.
 *
 * Environment configuration can contain infrastructure secrets,
 * API keys and deployment credentials. Public access here would
 * be spectacularly bad engineering.
 */
const protectedMiddleware = [
  authMiddleware,
  apiLimiter,
];

/* -------------------------------------------------------------------------- */
/* Health                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/environments/health
 *
 * Authenticated service health check.
 *
 * We intentionally keep this behind authentication because the
 * environment service contains information about encryption
 * configuration and deployment infrastructure.
 */
router.get(
  "/health",
  ...protectedMiddleware,
  environmentController.health
);

/* -------------------------------------------------------------------------- */
/* Environment Collection                                                     */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/environments
 *
 * Create:
 * development
 * preview
 * production
 */
router.post(
  "/",
  ...protectedMiddleware,
  environmentController.createEnvironment
);

/**
 * GET /api/environments?projectId=<id>
 *
 * List project environments.
 */
router.get(
  "/",
  ...protectedMiddleware,
  environmentController.listEnvironments
);

/* -------------------------------------------------------------------------- */
/* Copy Environment                                                           */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/environments/copy
 *
 * Example body:
 *
 * {
 *   "projectId": "...",
 *   "sourceEnvironment": "development",
 *   "targetEnvironment": "preview",
 *   "copySecrets": false
 * }
 *
 * copySecrets defaults to false inside the controller/service.
 */
router.post(
  "/copy",
  ...protectedMiddleware,
  environmentController.copyEnvironment
);

/* -------------------------------------------------------------------------- */
/* Deployment Operations                                                      */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/environments/deployment-snapshot
 *
 * Creates an immutable deployment configuration snapshot.
 *
 * This is useful for the deployment pipeline:
 *
 * Environment
 *      ↓
 * Snapshot
 *      ↓
 * Docker
 *      ↓
 * AWS
 */
router.post(
  "/deployment-snapshot",
  ...protectedMiddleware,
  environmentController.createDeploymentSnapshot
);

/**
 * POST /api/environments/mark-deployed
 *
 * Called by trusted deployment workflow after deployment succeeds.
 */
router.post(
  "/mark-deployed",
  ...protectedMiddleware,
  environmentController.markDeployed
);

/* -------------------------------------------------------------------------- */
/* Project Environment                                                        */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Configuration Summary                                                      */
/* -------------------------------------------------------------------------- */

/**
 * GET
 * /api/environments/:projectId/:environmentName/summary
 *
 * Returns metadata only.
 *
 * NEVER returns actual secret values.
 */
router.get(
  "/:projectId/:environmentName/summary",
  ...protectedMiddleware,
  environmentController.getConfigurationSummary
);

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * POST
 * /api/environments/:projectId/:environmentName/validate
 *
 * Runs environment validation.
 */
router.post(
  "/:projectId/:environmentName/validate",
  ...protectedMiddleware,
  environmentController.validateEnvironment
);

/* -------------------------------------------------------------------------- */
/* Deployment Readiness                                                       */
/* -------------------------------------------------------------------------- */

/**
 * GET
 * /api/environments/:projectId/:environmentName/deployment-readiness
 *
 * Returns whether the environment is ready for deployment.
 *
 * IMPORTANT:
 * This endpoint must NEVER expose resolved secrets.
 */
router.get(
  "/:projectId/:environmentName/deployment-readiness",
  ...protectedMiddleware,
  environmentController.deploymentReadiness
);

/* -------------------------------------------------------------------------- */
/* Variable Operations                                                        */
/* -------------------------------------------------------------------------- */

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
 * Update variable.
 *
 * Supports:
 * - value
 * - type
 * - scope
 * - required
 * - description
 * - secret status
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
 * Delete variable.
 */
router.delete(
  "/:projectId/:environmentName/variables/:key",
  ...protectedMiddleware,
  environmentController.deleteVariable
);

/* -------------------------------------------------------------------------- */
/* Archive / Restore                                                          */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Delete Environment                                                         */
/* -------------------------------------------------------------------------- */

/**
 * DELETE
 * /api/environments/:projectId/:environmentName
 *
 * Production deletion requires:
 *
 * {
 *   "confirm": true
 * }
 */
router.delete(
  "/:projectId/:environmentName",
  ...protectedMiddleware,
  environmentController.deleteEnvironment
);

/* -------------------------------------------------------------------------- */
/* Route Contract                                                             */
/* -------------------------------------------------------------------------- */

router.environmentRouteContract = {
  version: "2.0.0",

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

/* -------------------------------------------------------------------------- */
/* Router Metadata                                                            */
/* -------------------------------------------------------------------------- */

router.version = "2.0.0";

router.service = "environment";

router.security = {
  authenticationRequired: true,
  rateLimitRequired: true,
  secretsExposedToClient: false,
  deploymentSecretResolutionExposed: false,
  webhookRoutesIncluded: false,
};

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

module.exports = router;
