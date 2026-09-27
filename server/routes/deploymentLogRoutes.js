'use strict';

/**
 * Deployment Log Routes
 * Version: 1.0.0
 *
 * Flow:
 * Route
 *   ↓
 * Controller
 *   ↓
 * Service
 *   ↓
 * Model
 *
 * These routes expose deployment-log operations without putting
 * business logic inside the router.
 */

const express = require('express');

const deploymentLogController =
  require('../controllers/deploymentLogController');

const router = express.Router();

const ROUTE_VERSION = '1.0.0';

/* -------------------------------------------------------------------------- */
/* Optional Authentication Middleware                                         */
/* -------------------------------------------------------------------------- */

/**
 * Authentication should normally be applied by the application's
 * global auth middleware.
 *
 * We intentionally do not invent an auth module here because the
 * existing project may use a different authentication implementation.
 *
 * If your main server already protects /api routes, these routes inherit
 * that protection.
 */

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

router.get(
  '/health',
  deploymentLogController.health
);

/* -------------------------------------------------------------------------- */
/* Deployment Creation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs
 *
 * Create a deployment log.
 */
router.post(
  '/',
  deploymentLogController.createDeploymentLog
);

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/deployment-logs/search
 *
 * Search deployment logs using query parameters.
 *
 * Example:
 * /api/deployment-logs/search?projectId=abc&status=failed
 */
router.get(
  '/search',
  deploymentLogController.search
);

/* -------------------------------------------------------------------------- */
/* Project History                                                            */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/deployment-logs/project/:projectId
 *
 * Get deployment history for a project.
 */
router.get(
  '/project/:projectId',
  deploymentLogController.getProjectHistory
);

/* -------------------------------------------------------------------------- */
/* Active Deployment                                                          */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/deployment-logs/project/:projectId/active
 *
 * Get the currently active deployment for a project.
 */
router.get(
  '/project/:projectId/active',
  deploymentLogController.getActiveDeployment
);

/* -------------------------------------------------------------------------- */
/* Deployment Specific Routes                                                 */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/deployment-logs/:deploymentId
 *
 * Get deployment log history.
 */
router.get(
  '/:deploymentId',
  deploymentLogController.getDeploymentLog
);

/**
 * GET /api/deployment-logs/:deploymentId/latest
 *
 * Get the latest deployment state.
 */
router.get(
  '/:deploymentId/latest',
  deploymentLogController.getLatestDeploymentLog
);

/**
 * GET /api/deployment-logs/:deploymentId/stream-snapshot
 *
 * Get an initial snapshot before live streaming starts.
 */
router.get(
  '/:deploymentId/stream-snapshot',
  deploymentLogController.getStreamSnapshot
);

/* -------------------------------------------------------------------------- */
/* Deployment Lifecycle                                                       */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/start
 *
 * Mark deployment as started.
 */
router.post(
  '/:deploymentId/start',
  deploymentLogController.markStarted
);

/**
 * POST /api/deployment-logs/:deploymentId/complete
 *
 * Mark deployment as completed.
 */
router.post(
  '/:deploymentId/complete',
  deploymentLogController.markCompleted
);

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/events
 *
 * Append a deployment event.
 */
router.post(
  '/:deploymentId/events',
  deploymentLogController.appendEvent
);

/**
 * PATCH /api/deployment-logs/:deploymentId/progress
 *
 * Update deployment progress.
 */
router.patch(
  '/:deploymentId/progress',
  deploymentLogController.updateProgress
);

/* -------------------------------------------------------------------------- */
/* Stage Management                                                           */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/stages/:stageName/start
 *
 * Start a deployment stage.
 */
router.post(
  '/:deploymentId/stages/:stageName/start',
  deploymentLogController.startStage
);

/**
 * POST /api/deployment-logs/:deploymentId/stages/:stageName/complete
 *
 * Complete a deployment stage.
 */
router.post(
  '/:deploymentId/stages/:stageName/complete',
  deploymentLogController.completeStage
);

/* -------------------------------------------------------------------------- */
/* Error / Warning                                                            */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/errors
 *
 * Record deployment error.
 */
router.post(
  '/:deploymentId/errors',
  deploymentLogController.recordError
);

/**
 * POST /api/deployment-logs/:deploymentId/warnings
 *
 * Record deployment warning.
 */
router.post(
  '/:deploymentId/warnings',
  deploymentLogController.recordWarning
);

/* -------------------------------------------------------------------------- */
/* Auto Fix                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/auto-fix/eligible
 *
 * Mark a deployment as eligible for Auto Fix.
 */
router.post(
  '/:deploymentId/auto-fix/eligible',
  deploymentLogController.markAutoFixEligible
);

/**
 * POST /api/deployment-logs/:deploymentId/auto-fix/triggered
 *
 * Mark that Auto Fix has been triggered.
 */
router.post(
  '/:deploymentId/auto-fix/triggered',
  deploymentLogController.markAutoFixTriggered
);

/* -------------------------------------------------------------------------- */
/* Archive                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/archive
 *
 * Archive deployment history.
 */
router.post(
  '/:deploymentId/archive',
  deploymentLogController.archiveDeployment
);

/* -------------------------------------------------------------------------- */
/* Router Metadata                                                            */
/* -------------------------------------------------------------------------- */

router.routeVersion = ROUTE_VERSION;
router.routeName = 'deploymentLogRoutes';

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

module.exports = router;
