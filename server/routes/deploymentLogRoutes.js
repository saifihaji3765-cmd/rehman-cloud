'use strict';

/**
 * Deployment Log Routes
 * Version: 1.1.0
 *
 * Flow:
 * Route
 *   ↓
 * Authentication
 *   ↓
 * Controller
 *   ↓
 * Service
 *   ↓
 * Model
 *
 * Security:
 * - Health endpoint remains public.
 * - All deployment-log operations require authentication.
 * - Per-user deployment/project ownership must also be enforced
 *   inside the controller before reading or modifying records.
 */

const express = require('express');

const deploymentLogController =
  require('../controllers/deploymentLogController');

const {
  authMiddleware,
} = require('../middleware/authMiddleware');

const router = express.Router();

const ROUTE_VERSION = '1.1.0';

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/deployment-logs/health
 *
 * Public health check. Must not return deployment records,
 * credentials, or other sensitive information.
 */
router.get(
  '/health',
  deploymentLogController.health
);

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

/**
 * All routes registered below this middleware require an authenticated user.
 *
 * IMPORTANT:
 * Authentication identifies the caller. It does not, by itself, prove that
 * the caller owns a requested project or deployment.
 *
 * The controller must enforce ownership for every read/write operation.
 */
router.use(authMiddleware);

/* -------------------------------------------------------------------------- */
/* Deployment Creation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs
 *
 * Create a deployment log for an authenticated user's authorized project.
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
 * Search only records the authenticated user is authorized to access.
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
 */
router.get(
  '/project/:projectId',
  deploymentLogController.getProjectHistory
);

/**
 * GET /api/deployment-logs/project/:projectId/active
 */
router.get(
  '/project/:projectId/active',
  deploymentLogController.getActiveDeployment
);

/* -------------------------------------------------------------------------- */
/* Deployment Queries                                                         */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/deployment-logs/:deploymentId
 */
router.get(
  '/:deploymentId',
  deploymentLogController.getDeploymentLog
);

/**
 * GET /api/deployment-logs/:deploymentId/latest
 */
router.get(
  '/:deploymentId/latest',
  deploymentLogController.getLatestDeploymentLog
);

/**
 * GET /api/deployment-logs/:deploymentId/stream-snapshot
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
 */
router.post(
  '/:deploymentId/start',
  deploymentLogController.markStarted
);

/**
 * POST /api/deployment-logs/:deploymentId/complete
 */
router.post(
  '/:deploymentId/complete',
  deploymentLogController.markCompleted
);

/* -------------------------------------------------------------------------- */
/* Events and Progress                                                        */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/events
 */
router.post(
  '/:deploymentId/events',
  deploymentLogController.appendEvent
);

/**
 * PATCH /api/deployment-logs/:deploymentId/progress
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
 */
router.post(
  '/:deploymentId/stages/:stageName/start',
  deploymentLogController.startStage
);

/**
 * POST /api/deployment-logs/:deploymentId/stages/:stageName/complete
 */
router.post(
  '/:deploymentId/stages/:stageName/complete',
  deploymentLogController.completeStage
);

/* -------------------------------------------------------------------------- */
/* Errors and Warnings                                                        */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/deployment-logs/:deploymentId/errors
 */
router.post(
  '/:deploymentId/errors',
  deploymentLogController.recordError
);

/**
 * POST /api/deployment-logs/:deploymentId/warnings
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
 */
router.post(
  '/:deploymentId/auto-fix/eligible',
  deploymentLogController.markAutoFixEligible
);

/**
 * POST /api/deployment-logs/:deploymentId/auto-fix/triggered
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
