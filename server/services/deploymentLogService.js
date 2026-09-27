'use strict';

/**
 * Deployment Log Service
 * Version: 1.0.0
 *
 * Responsibilities:
 * - Create deployment log records
 * - Append deployment events
 * - Track stages and progress
 * - Record errors/warnings
 * - Query deployment history
 * - Prepare data for streaming
 * - Maintain Auto Fix context
 *
 * Security:
 * - Never intentionally stores secrets, tokens or credentials.
 * - Sensitive fields are stripped before persistence.
 */

const DeploymentLog = require('../models/deploymentLogModel');

const SERVICE_VERSION = '1.0.0';

const MAX_MESSAGE_LENGTH = 5000;
const MAX_DETAILS_SIZE = 50000;
const MAX_METADATA_ITEMS = 100;

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ACTIVE_STATUSES = new Set([
  'pending',
  'queued',
  'running',
  'building',
  'deploying',
  'verifying',
]);

const TERMINAL_STATUSES = new Set([
  'success',
  'failed',
  'cancelled',
  'rolled_back',
]);

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'secrets',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'set-cookie',
  'credential',
  'credentials',
  'private_key',
  'privatekey',
  'client_secret',
  'clientsecret',
  'environmentVariables',
  'runtimeEnvironment',
  'buildEnvironment',
]);

/* -------------------------------------------------------------------------- */
/* Utility Functions                                                          */
/* -------------------------------------------------------------------------- */

function cleanString(value, maxLength = MAX_MESSAGE_LENGTH) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeId(value) {
  const result = cleanString(value, 200);

  return result || undefined;
}

function clampProgress(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, number));
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function isSensitiveKey(key) {
  if (!key) {
    return false;
  }

  const normalized = String(key).toLowerCase();

  for (const sensitiveKey of SENSITIVE_KEYS) {
    if (normalized === sensitiveKey.toLowerCase()) {
      return true;
    }
  }

  return (
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('access_token') ||
    normalized.includes('refresh_token') ||
    normalized.includes('api_key') ||
    normalized.includes('private_key')
  );
}

/**
 * Recursively removes sensitive fields before persistence.
 *
 * This is deliberately defensive because logs eventually become visible
 * to Workspace users and may also be streamed to clients.
 */
function sanitizeValue(value, depth = 0) {
  if (depth > 8) {
    return '[TRUNCATED]';
  }

  if (value === undefined || value === null) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const result = {};

    for (const [key, childValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
        continue;
      }

      result[key] = sanitizeValue(childValue, depth + 1);
    }

    return result;
  }

  return String(value).slice(0, 2000);
}

function sanitizeDetails(details) {
  const sanitized = sanitizeValue(details);

  try {
    const serialized = JSON.stringify(sanitized);

    if (serialized.length <= MAX_DETAILS_SIZE) {
      return sanitized;
    }

    return {
      truncated: true,
      preview: serialized.slice(0, MAX_DETAILS_SIZE),
    };
  } catch {
    return {
      truncated: true,
      value: '[UNSERIALIZABLE_DETAILS]',
    };
  }
}

function normalizeMetadata(metadata) {
  if (!metadata) {
    return [];
  }

  if (Array.isArray(metadata)) {
    return metadata
      .slice(0, MAX_METADATA_ITEMS)
      .filter((item) => item && item.key)
      .map((item) => ({
        key: cleanString(item.key, 120),
        value: sanitizeValue(item.value),
      }));
  }

  if (isPlainObject(metadata)) {
    return Object.entries(metadata)
      .slice(0, MAX_METADATA_ITEMS)
      .map(([key, value]) => ({
        key: cleanString(key, 120),
        value: sanitizeValue(value),
      }));
  }

  return [];
}

function normalizeError(error, context = {}) {
  if (!error) {
    return undefined;
  }

  const source =
    error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
        }
      : isPlainObject(error)
        ? error
        : {
            message: String(error),
          };

  return {
    code: cleanString(source.code, 120),
    message:
      cleanString(source.message || 'Unknown deployment error', 5000) ||
      'Unknown deployment error',
    type: cleanString(source.type, 120),
    retryable: source.retryable === true,
    stage: cleanString(
      source.stage || context.stage,
      120
    ),
    agent: cleanString(
      source.agent || context.agent,
      120
    ),
    stack: cleanString(source.stack, 15000),
    details: sanitizeDetails(
      source.details || source.metadata
    ),
  };
}

function normalizeDeploymentInput(input = {}) {
  return {
    deploymentId: normalizeId(input.deploymentId),
    workflowId: normalizeId(input.workflowId),
    requestId: normalizeId(input.requestId),

    projectId: normalizeId(input.projectId),
    userId: normalizeId(input.userId),

    projectName: cleanString(input.projectName, 300),

    environmentName: cleanString(
      input.environmentName,
      100
    )?.toLowerCase(),

    environmentId: normalizeId(input.environmentId),

    framework: cleanString(input.framework, 120),

    branch: cleanString(input.branch, 300),

    commitSha: cleanString(input.commitSha, 200),

    status: cleanString(input.status, 50) || 'pending',

    progress: clampProgress(input.progress),

    currentStage: cleanString(input.currentStage, 120),

    currentAgent: cleanString(input.currentAgent, 120),

    message: cleanString(input.message),

    level: cleanString(input.level, 50) || 'info',

    type: cleanString(input.type, 80) || 'system',

    source: cleanString(input.source, 200),

    event: cleanString(input.event, 200),

    metadata: normalizeMetadata(input.metadata),

    details: sanitizeDetails(input.details),
  };
}

function ensureRequiredIdentity(input) {
  if (!input.deploymentId) {
    throw new Error('deploymentId is required');
  }

  if (!input.projectId) {
    throw new Error('projectId is required');
  }

  if (!input.userId) {
    throw new Error('userId is required');
  }
}

function buildQueryFilters(filters = {}) {
  const query = {};

  if (filters.deploymentId) {
    query.deploymentId = normalizeId(filters.deploymentId);
  }

  if (filters.workflowId) {
    query.workflowId = normalizeId(filters.workflowId);
  }

  if (filters.requestId) {
    query.requestId = normalizeId(filters.requestId);
  }

  if (filters.projectId) {
    query.projectId = normalizeId(filters.projectId);
  }

  if (filters.userId) {
    query.userId = normalizeId(filters.userId);
  }

  if (filters.environmentName) {
    query.environmentName = cleanString(
      filters.environmentName,
      100
    )?.toLowerCase();
  }

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.level) {
    query.level = filters.level;
  }

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.currentStage) {
    query.currentStage = cleanString(
      filters.currentStage,
      120
    );
  }

  if (filters.hasError !== undefined) {
    query.hasError = Boolean(filters.hasError);
  }

  if (filters.autoFixEligible !== undefined) {
    query.autoFixEligible = Boolean(
      filters.autoFixEligible
    );
  }

  if (filters.archived !== undefined) {
    query.archived = Boolean(filters.archived);
  }

  if (filters.createdAfter) {
    query.createdAt = {
      ...(query.createdAt || {}),
      $gte: new Date(filters.createdAfter),
    };
  }

  if (filters.createdBefore) {
    query.createdAt = {
      ...(query.createdAt || {}),
      $lte: new Date(filters.createdBefore),
    };
  }

  return query;
}

/* -------------------------------------------------------------------------- */
/* Deployment Log Service                                                     */
/* -------------------------------------------------------------------------- */

class DeploymentLogService {
  constructor() {
    this.version = SERVICE_VERSION;
  }

  /* ------------------------------------------------------------------------ */
  /* Create                                                                   */
  /* ------------------------------------------------------------------------ */

  async createDeploymentLog(input = {}) {
    const data = normalizeDeploymentInput(input);

    ensureRequiredIdentity(data);

    const now = new Date();

    if (!data.startedAt && ACTIVE_STATUSES.has(data.status)) {
      data.startedAt = now;
    }

    const log = new DeploymentLog({
      ...data,

      lastEventAt: now,

      streaming: {
        enabled:
          input.streaming?.enabled !== false,

        streamId:
          normalizeId(input.streaming?.streamId) ||
          data.deploymentId,

        lastSequence: 0,
      },
    });

    await log.save();

    return this.toSafeObject(log);
  }

  /* ------------------------------------------------------------------------ */
  /* Get                                                                      */
  /* ------------------------------------------------------------------------ */

  async getDeploymentLog(deploymentId, options = {}) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    if (!normalizedDeploymentId) {
      throw new Error('deploymentId is required');
    }

    const query = DeploymentLog.find({
      deploymentId: normalizedDeploymentId,
    }).sort({
      createdAt: options.sort === 'asc' ? 1 : -1,
    });

    if (options.limit) {
      query.limit(
        Math.min(
          Math.max(Number(options.limit) || 50, 1),
          500
        )
      );
    }

    const logs = await query.lean();

    return logs.map((log) =>
      this.toSafeObject(log)
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Latest                                                                    */
  /* ------------------------------------------------------------------------ */

  async getLatestDeploymentLog(deploymentId) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    if (!normalizedDeploymentId) {
      throw new Error('deploymentId is required');
    }

    const result =
      await DeploymentLog.findLatestByDeployment(
        normalizedDeploymentId
      );

    return result
      ? this.toSafeObject(result)
      : null;
  }

  /* ------------------------------------------------------------------------ */
  /* Append Event                                                             */
  /* ------------------------------------------------------------------------ */

  async appendEvent(input = {}) {
    const deploymentId =
      normalizeId(input.deploymentId);

    if (!deploymentId) {
      throw new Error('deploymentId is required');
    }

    const existing =
      await DeploymentLog.findOne({
        deploymentId,
      }).sort({
        createdAt: -1,
      });

    if (!existing) {
      throw new Error(
        `Deployment log not found: ${deploymentId}`
      );
    }

    const level =
      cleanString(input.level, 50) || 'info';

    const type =
      cleanString(input.type, 80) || 'system';

    const message =
      cleanString(input.message) ||
      'Deployment event';

    const now = new Date();

    existing.level = level;
    existing.type = type;

    if (input.source) {
      existing.source = cleanString(
        input.source,
        200
      );
    }

    if (input.event) {
      existing.event = cleanString(
        input.event,
        200
      );
    }

    if (input.stage) {
      existing.currentStage = cleanString(
        input.stage,
        120
      );
    }

    if (input.agent) {
      existing.currentAgent = cleanString(
        input.agent,
        120
      );
    }

    existing.message = message;

    const progress = clampProgress(
      input.progress
    );

    if (progress !== undefined) {
      existing.progress = progress;
    }

    if (input.status) {
      existing.status = cleanString(
        input.status,
        50
      );
    }

    if (input.details !== undefined) {
      existing.details = sanitizeDetails(
        input.details
      );
    }

    const metadata =
      normalizeMetadata(input.metadata);

    if (metadata.length > 0) {
      existing.metadata = metadata;
    }

    existing.lastEventAt = now;
    existing.logCount =
      (existing.logCount || 0) + 1;

    if (level === 'warning') {
      existing.warningCount =
        (existing.warningCount || 0) + 1;
    }

    if (level === 'error') {
      existing.errorCount =
        (existing.errorCount || 0) + 1;

      existing.hasError = true;
    }

    if (input.error) {
      existing.error = normalizeError(
        input.error,
        {
          stage: input.stage,
          agent: input.agent,
        }
      );

      existing.hasError = true;
    }

    await existing.save();

    return this.toSafeObject(existing);
  }

  /* ------------------------------------------------------------------------ */
  /* Progress                                                                 */
  /* ------------------------------------------------------------------------ */

  async updateProgress(
    deploymentId,
    progress,
    options = {}
  ) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    if (!normalizedDeploymentId) {
      throw new Error('deploymentId is required');
    }

    const value = clampProgress(progress);

    if (value === undefined) {
      throw new Error(
        'progress must be a number between 0 and 100'
      );
    }

    const update = {
      progress: value,
      lastEventAt: new Date(),
    };

    if (options.message) {
      update.message = cleanString(
        options.message
      );
    }

    if (options.stage) {
      update.currentStage = cleanString(
        options.stage,
        120
      );
    }

    if (options.agent) {
      update.currentAgent = cleanString(
        options.agent,
        120
      );
    }

    if (options.status) {
      update.status = cleanString(
        options.status,
        50
      );
    }

    const result =
      await DeploymentLog.findOneAndUpdate(
        {
          deploymentId:
            normalizedDeploymentId,
        },
        {
          $set: update,
          $inc: {
            logCount: 1,
          },
        },
        {
          new: true,
          sort: {
            createdAt: -1,
          },
        }
      ).lean();

    if (!result) {
      throw new Error(
        `Deployment log not found: ${normalizedDeploymentId}`
      );
    }

    return this.toSafeObject(result);
  }

  /* ------------------------------------------------------------------------ */
  /* Start Deployment                                                         */
  /* ------------------------------------------------------------------------ */

  async markStarted(
    deploymentId,
    options = {}
  ) {
    return this.appendEvent({
      deploymentId,

      status: options.status || 'running',

      level: 'info',

      type: 'deployment',

      event: 'deployment_started',

      stage: options.stage || 'initialization',

      agent: options.agent,

      progress:
        options.progress !== undefined
          ? options.progress
          : 0,

      message:
        options.message ||
        'Deployment started',

      details: options.details,
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Complete Deployment                                                      */
  /* ------------------------------------------------------------------------ */

  async markCompleted(
    deploymentId,
    options = {}
  ) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    if (!normalizedDeploymentId) {
      throw new Error('deploymentId is required');
    }

    const success =
      options.success !== false;

    const now = new Date();

    const existing =
      await DeploymentLog.findOne({
        deploymentId:
          normalizedDeploymentId,
      }).sort({
        createdAt: -1,
      });

    if (!existing) {
      throw new Error(
        `Deployment log not found: ${normalizedDeploymentId}`
      );
    }

    existing.status =
      options.status ||
      (success ? 'success' : 'failed');

    if (success) {
      existing.progress = 100;
    }

    existing.completedAt = now;
    existing.lastEventAt = now;

    if (existing.startedAt) {
      existing.durationMs =
        now.getTime() -
        existing.startedAt.getTime();
    }

    if (options.message) {
      existing.message = cleanString(
        options.message
      );
    }

    if (!success) {
      existing.hasError = true;
    }

    if (options.error) {
      existing.error =
        normalizeError(options.error);

      existing.hasError = true;

      existing.errorCount =
        (existing.errorCount || 0) + 1;
    }

    if (options.liveUrl) {
      existing.liveUrl = cleanString(
        options.liveUrl,
        2000
      );
    }

    await existing.save();

    return this.toSafeObject(existing);
  }

  /* ------------------------------------------------------------------------ */
  /* Stage Management                                                         */
  /* ------------------------------------------------------------------------ */

  async startStage(
    deploymentId,
    stageName,
    options = {}
  ) {
    const stage = cleanString(
      stageName,
      120
    );

    if (!stage) {
      throw new Error('stageName is required');
    }

    const existing =
      await DeploymentLog.findOne({
        deploymentId:
          normalizeId(deploymentId),
      }).sort({
        createdAt: -1,
      });

    if (!existing) {
      throw new Error(
        `Deployment log not found: ${deploymentId}`
      );
    }

    const now = new Date();

    const stageIndex =
      existing.stages.findIndex(
        (item) => item.name === stage
      );

    const stageData = {
      name: stage,

      status: 'running',

      agent: cleanString(
        options.agent,
        120
      ),

      startedAt: now,

      completedAt: undefined,

      durationMs: undefined,

      progress:
        clampProgress(options.progress) ??
        0,

      message:
        cleanString(options.message, 3000) ||
        `Started ${stage}`,

      metadata: normalizeMetadata(
        options.metadata
      ),
    };

    if (stageIndex >= 0) {
      existing.stages[stageIndex] =
        stageData;
    } else {
      existing.stages.push(stageData);
    }

    existing.currentStage = stage;
    existing.currentAgent =
      stageData.agent;

    existing.status =
      options.deploymentStatus ||
      'running';

    existing.lastEventAt = now;

    await existing.save();

    return this.toSafeObject(existing);
  }

  async completeStage(
    deploymentId,
    stageName,
    options = {}
  ) {
    const stage = cleanString(
      stageName,
      120
    );

    const existing =
      await DeploymentLog.findOne({
        deploymentId:
          normalizeId(deploymentId),
      }).sort({
        createdAt: -1,
      });

    if (!existing) {
      throw new Error(
        `Deployment log not found: ${deploymentId}`
      );
    }

    const now = new Date();

    const stageIndex =
      existing.stages.findIndex(
        (item) => item.name === stage
      );

    if (stageIndex < 0) {
      throw new Error(
        `Deployment stage not found: ${stage}`
      );
    }

    const currentStage =
      existing.stages[stageIndex];

    const success =
      options.success !== false;

    currentStage.status =
      options.status ||
      (success ? 'success' : 'failed');

    currentStage.completedAt = now;

    if (currentStage.startedAt) {
      currentStage.durationMs =
        now.getTime() -
        new Date(
          currentStage.startedAt
        ).getTime();
    }

    const progress =
      clampProgress(options.progress);

    if (progress !== undefined) {
      currentStage.progress = progress;
    } else if (success) {
      currentStage.progress = 100;
    }

    if (options.message) {
      currentStage.message =
        cleanString(
          options.message,
          3000
        );
    }

    if (options.error) {
      currentStage.error =
        normalizeError(options.error, {
          stage,
          agent: options.agent,
        });
    }

    existing.lastEventAt = now;

    if (!success) {
      existing.hasError = true;

      existing.errorCount =
        (existing.errorCount || 0) + 1;
    }

    await existing.save();

    return this.toSafeObject(existing);
  }

  /* ------------------------------------------------------------------------ */
  /* Error / Warning                                                          */
  /* ------------------------------------------------------------------------ */

  async recordError(
    deploymentId,
    error,
    options = {}
  ) {
    const normalizedError =
      normalizeError(error, options);

    return this.appendEvent({
      deploymentId,

      level: 'error',

      type:
        options.type ||
        'deployment',

      event:
        options.event ||
        'deployment_error',

      stage: options.stage,

      agent: options.agent,

      status:
        options.status ||
        'failed',

      message:
        options.message ||
        normalizedError.message,

      error: normalizedError,

      details: options.details,
    });
  }

  async recordWarning(
    deploymentId,
    message,
    options = {}
  ) {
    return this.appendEvent({
      deploymentId,

      level: 'warning',

      type:
        options.type ||
        'deployment',

      event:
        options.event ||
        'deployment_warning',

      stage: options.stage,

      agent: options.agent,

      progress: options.progress,

      message:
        cleanString(message) ||
        'Deployment warning',

      details: options.details,
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Auto Fix                                                                 */
  /* ------------------------------------------------------------------------ */

  async markAutoFixEligible(
    deploymentId,
    options = {}
  ) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    const result =
      await DeploymentLog.findOneAndUpdate(
        {
          deploymentId:
            normalizedDeploymentId,
        },
        {
          $set: {
            autoFixEligible: true,
            lastEventAt: new Date(),
          },
        },
        {
          new: true,
          sort: {
            createdAt: -1,
          },
        }
      ).lean();

    if (!result) {
      throw new Error(
        `Deployment log not found: ${normalizedDeploymentId}`
      );
    }

    return this.toSafeObject(result);
  }

  async markAutoFixTriggered(
    deploymentId,
    options = {}
  ) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    const update = {
      autoFixTriggered: true,
      autoFixAttemptCount: {
        $inc: 1,
      },
      lastEventAt: new Date(),
    };

    if (options.autoFixTriggerId) {
      update.autoFixTriggerId =
        normalizeId(
          options.autoFixTriggerId
        );
    }

    const result =
      await DeploymentLog.findOneAndUpdate(
        {
          deploymentId:
            normalizedDeploymentId,
        },
        {
          $set: {
            autoFixTriggered: true,

            ...(options.autoFixTriggerId
              ? {
                  autoFixTriggerId:
                    normalizeId(
                      options.autoFixTriggerId
                    ),
                }
              : {}),

            lastEventAt: new Date(),
          },

          $inc: {
            autoFixAttemptCount: 1,
          },
        },
        {
          new: true,
          sort: {
            createdAt: -1,
          },
        }
      ).lean();

    if (!result) {
      throw new Error(
        `Deployment log not found: ${normalizedDeploymentId}`
      );
    }

    return this.toSafeObject(result);
  }

  /* ------------------------------------------------------------------------ */
  /* Deployment History                                                       */
  /* ------------------------------------------------------------------------ */

  async getProjectHistory(
    projectId,
    options = {}
  ) {
    const normalizedProjectId =
      normalizeId(projectId);

    if (!normalizedProjectId) {
      throw new Error('projectId is required');
    }

    const limit = Math.min(
      Math.max(Number(options.limit) || 50, 1),
      200
    );

    const query = {
      projectId: normalizedProjectId,
      archived:
        options.archived === true,
    };

    if (options.environmentName) {
      query.environmentName =
        cleanString(
          options.environmentName,
          100
        )?.toLowerCase();
    }

    if (options.status) {
      query.status = options.status;
    }

    const logs =
      await DeploymentLog.find(query)
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean();

    return logs.map((log) =>
      this.toSafeObject(log)
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Active Deployment                                                        */
  /* ------------------------------------------------------------------------ */

  async getActiveDeployment(projectId) {
    const normalizedProjectId =
      normalizeId(projectId);

    if (!normalizedProjectId) {
      throw new Error('projectId is required');
    }

    const result =
      await DeploymentLog.findActiveDeployment(
        normalizedProjectId
      );

    return result
      ? this.toSafeObject(result)
      : null;
  }

  /* ------------------------------------------------------------------------ */
  /* Search                                                                   */
  /* ------------------------------------------------------------------------ */

  async search(filters = {}, options = {}) {
    const query =
      buildQueryFilters(filters);

    const limit = Math.min(
      Math.max(Number(options.limit) || 50, 1),
      500
    );

    const skip = Math.max(
      Number(options.skip) || 0,
      0
    );

    const logs =
      await DeploymentLog.find(query)
        .sort({
          createdAt:
            options.sort === 'asc'
              ? 1
              : -1,
        })
        .skip(skip)
        .limit(limit)
        .lean();

    return {
      items: logs.map((log) =>
        this.toSafeObject(log)
      ),

      count: logs.length,

      limit,

      skip,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Archive                                                                  */
  /* ------------------------------------------------------------------------ */

  async archiveDeployment(deploymentId) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    const result =
      await DeploymentLog.updateMany(
        {
          deploymentId:
            normalizedDeploymentId,
        },
        {
          $set: {
            archived: true,
            archivedAt: new Date(),
          },
        }
      );

    return {
      success: true,

      deploymentId:
        normalizedDeploymentId,

      modifiedCount:
        result.modifiedCount || 0,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Streaming Cursor Data                                                    */
  /* ------------------------------------------------------------------------ */

  async getStreamSnapshot(
    deploymentId,
    options = {}
  ) {
    const normalizedDeploymentId =
      normalizeId(deploymentId);

    if (!normalizedDeploymentId) {
      throw new Error('deploymentId is required');
    }

    const limit = Math.min(
      Math.max(Number(options.limit) || 100, 1),
      500
    );

    const logs =
      await DeploymentLog.find({
        deploymentId:
          normalizedDeploymentId,
      })
        .sort({
          createdAt: 1,
        })
        .limit(limit)
        .lean();

    return {
      deploymentId:
        normalizedDeploymentId,

      items: logs.map((log) =>
        this.toSafeObject(log)
      ),

      lastEventAt:
        logs.length > 0
          ? logs[logs.length - 1].lastEventAt
          : null,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Health                                                                   */
  /* ------------------------------------------------------------------------ */

  async health() {
    const startedAt = Date.now();

    try {
      await DeploymentLog.findOne()
        .select({
          _id: 1,
        })
        .lean();

      return {
        success: true,

        service: 'deploymentLogService',

        version: this.version,

        database: 'available',

        latencyMs:
          Date.now() - startedAt,

        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,

        service: 'deploymentLogService',

        version: this.version,

        database: 'unavailable',

        latencyMs:
          Date.now() - startedAt,

        error: cleanString(
          error?.message ||
            'Database unavailable',
          1000
        ),

        timestamp: new Date().toISOString(),
      };
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Safe Output                                                              */
  /* ------------------------------------------------------------------------ */

  toSafeObject(value) {
    if (!value) {
      return null;
    }

    let object;

    if (typeof value.toObject === 'function') {
      object = value.toObject();
    } else {
      object = {
        ...value,
      };
    }

    return sanitizeValue(object);
  }
}

/* -------------------------------------------------------------------------- */
/* Singleton                                                                  */
/* -------------------------------------------------------------------------- */

const deploymentLogService =
  new DeploymentLogService();

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports =
  deploymentLogService;

module.exports.DeploymentLogService =
  DeploymentLogService;

module.exports.SERVICE_VERSION =
  SERVICE_VERSION;
