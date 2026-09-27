'use strict';

/**
 * Deployment Log Controller
 * Version: 1.0.0
 *
 * Responsibilities:
 * - HTTP/API layer for deployment logs
 * - Validate incoming request data
 * - Call deploymentLogService
 * - Return consistent API responses
 * - Never expose secrets or internal stack traces to clients
 *
 * Architecture:
 *
 * Routes
 *   ↓
 * Controller
 *   ↓
 * deploymentLogService
 *   ↓
 * deploymentLogModel
 */

const deploymentLogService = require('../services/deploymentLogService');

const CONTROLLER_VERSION = '1.0.0';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getUserId(req) {
  return (
    req.user?.id ||
    req.user?._id ||
    req.auth?.userId ||
    req.body?.userId ||
    req.query?.userId ||
    undefined
  );
}

function getProjectId(req) {
  return (
    req.params?.projectId ||
    req.body?.projectId ||
    req.query?.projectId ||
    undefined
  );
}

function getDeploymentId(req) {
  return (
    req.params?.deploymentId ||
    req.body?.deploymentId ||
    req.query?.deploymentId ||
    undefined
  );
}

function cleanId(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const result = String(value).trim();

  return result || undefined;
}

function parseBoolean(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }

  return (
    error.publicMessage ||
    error.message ||
    'Unable to process deployment log request'
  );
}

function getStatusCode(error) {
  if (!error) {
    return 500;
  }

  if (
    error.statusCode &&
    Number.isInteger(error.statusCode)
  ) {
    return error.statusCode;
  }

  const message = String(
    error.message || ''
  ).toLowerCase();

  if (
    message.includes('required') ||
    message.includes('invalid')
  ) {
    return 400;
  }

  if (
    message.includes('not found') ||
    message.includes('does not exist')
  ) {
    return 404;
  }

  return 500;
}

function successResponse(
  res,
  data,
  statusCode = 200
) {
  return res.status(statusCode).json({
    success: true,

    data,

    controller: 'deploymentLogController',

    version: CONTROLLER_VERSION,

    timestamp: new Date().toISOString(),
  });
}

function errorResponse(
  res,
  error,
  fallbackStatus = 500
) {
  const statusCode =
    getStatusCode(error) || fallbackStatus;

  return res.status(statusCode).json({
    success: false,

    message: safeErrorMessage(error),

    controller: 'deploymentLogController',

    version: CONTROLLER_VERSION,

    timestamp: new Date().toISOString(),
  });
}

/**
 * Prevent a client from supplying another user's identity
 * when authentication middleware has already populated req.user.
 */
function buildIdentity(req, body = {}) {
  const authenticatedUserId =
    cleanId(
      req.user?.id ||
        req.user?._id ||
        req.auth?.userId
    );

  const requestedUserId =
    cleanId(body.userId);

  return {
    userId:
      authenticatedUserId ||
      requestedUserId,

    projectId:
      cleanId(
        req.params?.projectId ||
          body.projectId ||
          req.query?.projectId
      ),
  };
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

async function createDeploymentLog(
  req,
  res
) {
  try {
    const body = req.body || {};

    const identity =
      buildIdentity(req, body);

    const result =
      await deploymentLogService.createDeploymentLog({
        ...body,

        userId: identity.userId,

        projectId: identity.projectId,
      });

    return successResponse(
      res,
      result,
      201
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Get Deployment Logs                                                        */
/* -------------------------------------------------------------------------- */

async function getDeploymentLog(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const limit =
      parseNumber(
        req.query?.limit,
        undefined
      );

    const sort =
      req.query?.sort === 'asc'
        ? 'asc'
        : 'desc';

    const result =
      await deploymentLogService.getDeploymentLog(
        deploymentId,
        {
          limit,
          sort,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Latest                                                                     */
/* -------------------------------------------------------------------------- */

async function getLatestDeploymentLog(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.getLatestDeploymentLog(
        deploymentId
      );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Deployment log not found',
      });
    }

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Append Event                                                               */
/* -------------------------------------------------------------------------- */

async function appendEvent(
  req,
  res
) {
  try {
    const body = req.body || {};

    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.appendEvent({
        ...body,

        deploymentId,
      });

    return successResponse(
      res,
      result,
      201
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

async function updateProgress(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    const progress =
      parseNumber(
        req.body?.progress ??
          req.params?.progress ??
          req.query?.progress,
        undefined
      );

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    if (
      progress === undefined ||
      progress < 0 ||
      progress > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          'progress must be a number between 0 and 100',
      });
    }

    const result =
      await deploymentLogService.updateProgress(
        deploymentId,
        progress,
        {
          message:
            req.body?.message,

          stage:
            req.body?.stage,

          agent:
            req.body?.agent,

          status:
            req.body?.status,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Start Deployment                                                           */
/* -------------------------------------------------------------------------- */

async function markStarted(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.markStarted(
        deploymentId,
        {
          stage:
            req.body?.stage,

          agent:
            req.body?.agent,

          progress:
            req.body?.progress,

          status:
            req.body?.status,

          message:
            req.body?.message,

          details:
            req.body?.details,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Complete Deployment                                                        */
/* -------------------------------------------------------------------------- */

async function markCompleted(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.markCompleted(
        deploymentId,
        {
          success:
            req.body?.success !== false,

          status:
            req.body?.status,

          message:
            req.body?.message,

          error:
            req.body?.error,

          liveUrl:
            req.body?.liveUrl,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Stage: Start                                                               */
/* -------------------------------------------------------------------------- */

async function startStage(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    const stageName =
      req.params?.stageName ||
      req.body?.stageName ||
      req.body?.stage;

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    if (!stageName) {
      return res.status(400).json({
        success: false,
        message: 'stageName is required',
      });
    }

    const result =
      await deploymentLogService.startStage(
        deploymentId,
        stageName,
        {
          agent:
            req.body?.agent,

          progress:
            req.body?.progress,

          message:
            req.body?.message,

          metadata:
            req.body?.metadata,

          deploymentStatus:
            req.body?.deploymentStatus,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Stage: Complete                                                            */
/* -------------------------------------------------------------------------- */

async function completeStage(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    const stageName =
      req.params?.stageName ||
      req.body?.stageName ||
      req.body?.stage;

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    if (!stageName) {
      return res.status(400).json({
        success: false,
        message: 'stageName is required',
      });
    }

    const result =
      await deploymentLogService.completeStage(
        deploymentId,
        stageName,
        {
          success:
            req.body?.success !== false,

          status:
            req.body?.status,

          progress:
            req.body?.progress,

          message:
            req.body?.message,

          error:
            req.body?.error,

          agent:
            req.body?.agent,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Error                                                                      */
/* -------------------------------------------------------------------------- */

async function recordError(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const errorPayload =
      req.body?.error ||
      req.body?.message ||
      'Deployment error';

    const result =
      await deploymentLogService.recordError(
        deploymentId,
        errorPayload,
        {
          type:
            req.body?.type,

          event:
            req.body?.event,

          stage:
            req.body?.stage,

          agent:
            req.body?.agent,

          status:
            req.body?.status,

          message:
            req.body?.message,

          details:
            req.body?.details,
        }
      );

    return successResponse(
      res,
      result,
      201
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Warning                                                                    */
/* -------------------------------------------------------------------------- */

async function recordWarning(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const message =
      req.body?.message ||
      'Deployment warning';

    const result =
      await deploymentLogService.recordWarning(
        deploymentId,
        message,
        {
          type:
            req.body?.type,

          event:
            req.body?.event,

          stage:
            req.body?.stage,

          agent:
            req.body?.agent,

          progress:
            req.body?.progress,

          details:
            req.body?.details,
        }
      );

    return successResponse(
      res,
      result,
      201
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Auto Fix: Eligible                                                         */
/* -------------------------------------------------------------------------- */

async function markAutoFixEligible(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.markAutoFixEligible(
        deploymentId,
        {
          reason:
            req.body?.reason,

          stage:
            req.body?.stage,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Auto Fix: Triggered                                                         */
/* -------------------------------------------------------------------------- */

async function markAutoFixTriggered(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.markAutoFixTriggered(
        deploymentId,
        {
          autoFixTriggerId:
            req.body?.autoFixTriggerId,

          reason:
            req.body?.reason,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error, 400);
  }
}

/* -------------------------------------------------------------------------- */
/* Project History                                                            */
/* -------------------------------------------------------------------------- */

async function getProjectHistory(
  req,
  res
) {
  try {
    const projectId =
      getProjectId(req);

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'projectId is required',
      });
    }

    const result =
      await deploymentLogService.getProjectHistory(
        projectId,
        {
          limit:
            parseNumber(
              req.query?.limit,
              50
            ),

          archived:
            parseBoolean(
              req.query?.archived
            ),

          environmentName:
            req.query?.environmentName,

          status:
            req.query?.status,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Active Deployment                                                          */
/* -------------------------------------------------------------------------- */

async function getActiveDeployment(
  req,
  res
) {
  try {
    const projectId =
      getProjectId(req);

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'projectId is required',
      });
    }

    const result =
      await deploymentLogService.getActiveDeployment(
        projectId
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

async function search(
  req,
  res
) {
  try {
    const filters = {
      deploymentId:
        req.query?.deploymentId,

      workflowId:
        req.query?.workflowId,

      requestId:
        req.query?.requestId,

      projectId:
        req.query?.projectId ||
        req.params?.projectId,

      userId:
        req.query?.userId,

      environmentName:
        req.query?.environmentName,

      status:
        req.query?.status,

      level:
        req.query?.level,

      type:
        req.query?.type,

      currentStage:
        req.query?.currentStage,

      hasError:
        parseBoolean(
          req.query?.hasError
        ),

      autoFixEligible:
        parseBoolean(
          req.query?.autoFixEligible
        ),

      archived:
        parseBoolean(
          req.query?.archived
        ),

      createdAfter:
        req.query?.createdAfter,

      createdBefore:
        req.query?.createdBefore,
    };

    const result =
      await deploymentLogService.search(
        filters,
        {
          limit:
            parseNumber(
              req.query?.limit,
              50
            ),

          skip:
            parseNumber(
              req.query?.skip,
              0
            ),

          sort:
            req.query?.sort,
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Archive                                                                    */
/* -------------------------------------------------------------------------- */

async function archiveDeployment(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.archiveDeployment(
        deploymentId
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Stream Snapshot                                                            */
/* -------------------------------------------------------------------------- */

async function getStreamSnapshot(
  req,
  res
) {
  try {
    const deploymentId =
      getDeploymentId(req);

    if (!deploymentId) {
      return res.status(400).json({
        success: false,
        message: 'deploymentId is required',
      });
    }

    const result =
      await deploymentLogService.getStreamSnapshot(
        deploymentId,
        {
          limit:
            parseNumber(
              req.query?.limit,
              100
            ),
        }
      );

    return successResponse(
      res,
      result
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

async function health(
  req,
  res
) {
  try {
    const result =
      await deploymentLogService.health();

    return res.status(
      result.success ? 200 : 503
    ).json({
      ...result,

      controller:
        'deploymentLogController',

      version:
        CONTROLLER_VERSION,
    });
  } catch (error) {
    return res.status(503).json({
      success: false,

      message:
        'Deployment log service health check failed',

      controller:
        'deploymentLogController',

      version:
        CONTROLLER_VERSION,

      timestamp:
        new Date().toISOString(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Controller Object                                                          */
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

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports =
  deploymentLogController;

module.exports.createDeploymentLog =
  createDeploymentLog;

module.exports.getDeploymentLog =
  getDeploymentLog;

module.exports.getLatestDeploymentLog =
  getLatestDeploymentLog;

module.exports.appendEvent =
  appendEvent;

module.exports.updateProgress =
  updateProgress;

module.exports.markStarted =
  markStarted;

module.exports.markCompleted =
  markCompleted;

module.exports.startStage =
  startStage;

module.exports.completeStage =
  completeStage;

module.exports.recordError =
  recordError;

module.exports.recordWarning =
  recordWarning;

module.exports.markAutoFixEligible =
  markAutoFixEligible;

module.exports.markAutoFixTriggered =
  markAutoFixTriggered;

module.exports.getProjectHistory =
  getProjectHistory;

module.exports.getActiveDeployment =
  getActiveDeployment;

module.exports.search =
  search;

module.exports.archiveDeployment =
  archiveDeployment;

module.exports.getStreamSnapshot =
  getStreamSnapshot;

module.exports.health =
  health;

module.exports.CONTROLLER_VERSION =
  CONTROLLER_VERSION;
