'use strict';

/**
 * Deployment Log Controller
 * Version: 1.1.0
 *
 * Responsibilities:
 * - Validate requests
 * - Enforce authenticated-user identity
 * - Verify project and deployment ownership
 * - Delegate persistence to deploymentLogService
 * - Return consistent API responses
 *
 * Security:
 * - Never trust userId supplied by the client.
 * - Verify project ownership before creating/querying project logs.
 * - Verify deployment ownership before reading or mutating deployment logs.
 */

const deploymentLogService = require('../services/deploymentLogService');
const DeploymentLog = require('../models/deploymentLogModel');
const Project = require('../models/projectModel');

const CONTROLLER_VERSION = '1.1.0';

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function cleanId(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const result = String(value).trim();
  return result || undefined;
}

function getAuthenticatedUserId(req) {
  return cleanId(
    req.user?.id ||
    req.user?._id ||
    req.auth?.userId
  );
}

function getProjectId(req) {
  return cleanId(
    req.params?.projectId ||
    req.body?.projectId ||
    req.query?.projectId
  );
}

function getDeploymentId(req) {
  return cleanId(
    req.params?.deploymentId ||
    req.body?.deploymentId ||
    req.query?.deploymentId
  );
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return undefined;
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function getLimit(value, fallback = DEFAULT_LIMIT) {
  const number = parseNumber(value, fallback);

  if (!Number.isInteger(number) || number < 1) {
    return fallback;
  }

  return Math.min(number, MAX_LIMIT);
}

function successResponse(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    controller: 'deploymentLogController',
    version: CONTROLLER_VERSION,
    timestamp: new Date().toISOString(),
  });
}

function errorResponse(res, error, fallbackStatus = 500) {
  const statusCode =
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
      ? error.statusCode
      : fallbackStatus;

  // Do not return internal database errors or stack traces.
  const message =
    statusCode >= 500
      ? 'Unable to process deployment log request'
      : error?.publicMessage ||
        error?.message ||
        'Invalid deployment log request';

  return res.status(statusCode).json({
    success: false,
    message,
    controller: 'deploymentLogController',
    version: CONTROLLER_VERSION,
    timestamp: new Date().toISOString(),
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function requireUserId(req) {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    throw httpError(401, 'Authentication is required');
  }

  return userId;
}

/**
 * Verify that a project belongs to the authenticated user.
 * Archived projects are not accepted for new deployment-log operations.
 */
async function requireOwnedProject(projectId, userId) {
  if (!projectId) {
    throw httpError(400, 'projectId is required');
  }

  const project = await Project.findOne({
    _id: projectId,
    userId,
    isArchived: false,
  })
    .select('_id userId projectName')
    .lean();

  if (!project) {
    // Use the same response for missing and non-owned projects.
    throw httpError(404, 'Project not found');
  }

  return project;
}

/**
 * Verify deployment ownership before any deployment-log operation.
 * The client cannot establish ownership by supplying userId in its payload.
 */
async function requireOwnedDeployment(deploymentId, userId) {
  if (!deploymentId) {
    throw httpError(400, 'deploymentId is required');
  }

  const log = await DeploymentLog.findOne({
    deploymentId,
    userId,
  })
    .select('deploymentId projectId userId')
    .lean();

  if (!log) {
    throw httpError(404, 'Deployment log not found');
  }

  return log;
}

/**
 * Apply one consistent response/error boundary to each handler.
 */
function handler(fn, fallbackStatus = 500) {
  return async function deploymentLogHandler(req, res) {
    try {
      return await fn(req, res);
    } catch (error) {
      return errorResponse(res, error, fallbackStatus);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

const createDeploymentLog = handler(async (req, res) => {
  const userId = requireUserId(req);
  const body = req.body || {};
  const projectId = cleanId(body.projectId || req.params?.projectId);

  await requireOwnedProject(projectId, userId);

  if (!cleanId(body.deploymentId)) {
    throw httpError(400, 'deploymentId is required');
  }

  const result = await deploymentLogService.createDeploymentLog({
    ...body,

    // Always override client-provided identity.
    userId,
    projectId,
    deploymentId: cleanId(body.deploymentId),
  });

  return successResponse(res, result, 201);
}, 400);

/* -------------------------------------------------------------------------- */
/* Read Deployment Logs                                                       */
/* -------------------------------------------------------------------------- */

const getDeploymentLog = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.getDeploymentLog(
    deploymentId,
    {
      limit: getLimit(req.query?.limit),
      sort: req.query?.sort === 'asc' ? 'asc' : 'desc',
    }
  );

  return successResponse(res, result);
});

const getLatestDeploymentLog = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result =
    await deploymentLogService.getLatestDeploymentLog(deploymentId);

  if (!result) {
    throw httpError(404, 'Deployment log not found');
  }

  return successResponse(res, result);
});

const getStreamSnapshot = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.getStreamSnapshot(
    deploymentId,
    {
      limit: getLimit(req.query?.limit, 100),
    }
  );

  return successResponse(res, result);
});

/* -------------------------------------------------------------------------- */
/* Event                                                                      */
/* -------------------------------------------------------------------------- */

const appendEvent = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.appendEvent({
    ...(req.body || {}),
    deploymentId,
  });

  return successResponse(res, result, 201);
}, 400);

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

const updateProgress = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);
  const progress = parseNumber(req.body?.progress, undefined);

  await requireOwnedDeployment(deploymentId, userId);

  if (
    progress === undefined ||
    progress < 0 ||
    progress > 100
  ) {
    throw httpError(
      400,
      'progress must be a number between 0 and 100'
    );
  }

  const result = await deploymentLogService.updateProgress(
    deploymentId,
    progress,
    {
      message: req.body?.message,
      stage: req.body?.stage,
      agent: req.body?.agent,
      status: req.body?.status,
    }
  );

  return successResponse(res, result);
}, 400);

/* -------------------------------------------------------------------------- */
/* Deployment Lifecycle                                                       */
/* -------------------------------------------------------------------------- */

const markStarted = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.markStarted(
    deploymentId,
    {
      stage: req.body?.stage,
      agent: req.body?.agent,
      progress: req.body?.progress,
      status: req.body?.status,
      message: req.body?.message,
      details: req.body?.details,
    }
  );

  return successResponse(res, result);
}, 400);

const markCompleted = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.markCompleted(
    deploymentId,
    {
      success: req.body?.success !== false,
      status: req.body?.status,
      message: req.body?.message,
      error: req.body?.error,
      liveUrl: req.body?.liveUrl,
    }
  );

  return successResponse(res, result);
}, 400);

/* -------------------------------------------------------------------------- */
/* Stages                                                                     */
/* -------------------------------------------------------------------------- */

const startStage = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);
  const stageName =
    req.params?.stageName ||
    req.body?.stageName ||
    req.body?.stage;

  await requireOwnedDeployment(deploymentId, userId);

  if (!stageName) {
    throw httpError(400, 'stageName is required');
  }

  const result = await deploymentLogService.startStage(
    deploymentId,
    stageName,
    {
      agent: req.body?.agent,
      progress: req.body?.progress,
      message: req.body?.message,
      metadata: req.body?.metadata,
      deploymentStatus: req.body?.deploymentStatus,
    }
  );

  return successResponse(res, result);
}, 400);

const completeStage = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);
  const stageName =
    req.params?.stageName ||
    req.body?.stageName ||
    req.body?.stage;

  await requireOwnedDeployment(deploymentId, userId);

  if (!stageName) {
    throw httpError(400, 'stageName is required');
  }

  const result = await deploymentLogService.completeStage(
    deploymentId,
    stageName,
    {
      success: req.body?.success !== false,
      status: req.body?.status,
      progress: req.body?.progress,
      message: req.body?.message,
      error: req.body?.error,
      agent: req.body?.agent,
    }
  );

  return successResponse(res, result);
}, 400);

/* -------------------------------------------------------------------------- */
/* Errors and Warnings                                                        */
/* -------------------------------------------------------------------------- */

const recordError = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const errorPayload =
    req.body?.error ||
    req.body?.message ||
    'Deployment error';

  const result = await deploymentLogService.recordError(
    deploymentId,
    errorPayload,
    {
      type: req.body?.type,
      event: req.body?.event,
      stage: req.body?.stage,
      agent: req.body?.agent,
      status: req.body?.status,
      message: req.body?.message,
      details: req.body?.details,
    }
  );

  return successResponse(res, result, 201);
}, 400);

const recordWarning = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.recordWarning(
    deploymentId,
    req.body?.message || 'Deployment warning',
    {
      type: req.body?.type,
      event: req.body?.event,
      stage: req.body?.stage,
      agent: req.body?.agent,
      progress: req.body?.progress,
      details: req.body?.details,
    }
  );

  return successResponse(res, result, 201);
}, 400);

/* -------------------------------------------------------------------------- */
/* Auto Fix                                                                   */
/* -------------------------------------------------------------------------- */

const markAutoFixEligible = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.markAutoFixEligible(
    deploymentId,
    {
      reason: req.body?.reason,
      stage: req.body?.stage,
    }
  );

  return successResponse(res, result);
}, 400);

const markAutoFixTriggered = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result = await deploymentLogService.markAutoFixTriggered(
    deploymentId,
    {
      autoFixTriggerId: req.body?.autoFixTriggerId,
      reason: req.body?.reason,
    }
  );

  return successResponse(res, result);
}, 400);

/* -------------------------------------------------------------------------- */
/* Project History                                                            */
/* -------------------------------------------------------------------------- */

const getProjectHistory = handler(async (req, res) => {
  const userId = requireUserId(req);
  const projectId = getProjectId(req);

  await requireOwnedProject(projectId, userId);

  const result = await deploymentLogService.getProjectHistory(
    projectId,
    {
      limit: getLimit(req.query?.limit),
      archived: parseBoolean(req.query?.archived),
      environmentName: req.query?.environmentName,
      status: req.query?.status,
    }
  );

  return successResponse(res, result);
});

const getActiveDeployment = handler(async (req, res) => {
  const userId = requireUserId(req);
  const projectId = getProjectId(req);

  await requireOwnedProject(projectId, userId);

  const result =
    await deploymentLogService.getActiveDeployment(projectId);

  return successResponse(res, result);
});

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const search = handler(async (req, res) => {
  const userId = requireUserId(req);

  const filters = {
    deploymentId: req.query?.deploymentId,
    workflowId: req.query?.workflowId,
    requestId: req.query?.requestId,
    projectId: req.query?.projectId,
    environmentName: req.query?.environmentName,
    status: req.query?.status,
    level: req.query?.level,
    type: req.query?.type,
    currentStage: req.query?.currentStage,
    hasError: parseBoolean(req.query?.hasError),
    autoFixEligible: parseBoolean(req.query?.autoFixEligible),
    archived: parseBoolean(req.query?.archived),
    createdAfter: req.query?.createdAfter,
    createdBefore: req.query?.createdBefore,

    // Never accept userId from query parameters.
    userId,
  };

  // If filtering by project, verify ownership before querying.
  if (filters.projectId) {
    await requireOwnedProject(filters.projectId, userId);
  }

  // If filtering by deployment, verify ownership too.
  if (filters.deploymentId) {
    await requireOwnedDeployment(filters.deploymentId, userId);
  }

  const result = await deploymentLogService.search(
    filters,
    {
      limit: getLimit(req.query?.limit),
      skip: Math.max(
        0,
        parseNumber(req.query?.skip, 0)
      ),
      sort: req.query?.sort,
    }
  );

  return successResponse(res, result);
});

/* -------------------------------------------------------------------------- */
/* Archive                                                                    */
/* -------------------------------------------------------------------------- */

const archiveDeployment = handler(async (req, res) => {
  const userId = requireUserId(req);
  const deploymentId = getDeploymentId(req);

  await requireOwnedDeployment(deploymentId, userId);

  const result =
    await deploymentLogService.archiveDeployment(deploymentId);

  return successResponse(res, result);
});

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

async function health(req, res) {
  try {
    const result = await deploymentLogService.health();

    return res.status(result.success ? 200 : 503).json({
      ...result,
      controller: 'deploymentLogController',
      version: CONTROLLER_VERSION,
    });
  } catch {
    return res.status(503).json({
      success: false,
      message: 'Deployment log service health check failed',
      controller: 'deploymentLogController',
      version: CONTROLLER_VERSION,
      timestamp: new Date().toISOString(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

const deploymentLogController = {
  createDeploymentLog,
  getDeploymentLog,
  getLatestDeploymentLog,
  appendEvent,
  updateProgress,
  markStarted,
  markCompleted,
  startStage,
  completeStage,
  recordError,
  recordWarning,
  markAutoFixEligible,
  markAutoFixTriggered,
  getProjectHistory,
  getActiveDeployment,
  search,
  archiveDeployment,
  getStreamSnapshot,
  health,
  version: CONTROLLER_VERSION,
};

module.exports = deploymentLogController;
module.exports.CONTROLLER_VERSION = CONTROLLER_VERSION;
