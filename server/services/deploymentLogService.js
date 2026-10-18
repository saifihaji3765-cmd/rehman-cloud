
'use strict';

/**
 * Deployment Log Service
 * Version: 1.1.0
 *
 * Security fixes:
 * - Enforce user ownership in database queries and updates.
 * - Reject unscoped searches.
 * - Never persist raw error stack traces.
 * - Validate status, level, type, and stage status values.
 * - Archive exactly one owner's deployment record.
 *
 * IMPORTANT:
 * Protected methods require an authenticated userId supplied by the
 * trusted server-side controller. Never trust a client-provided userId.
 */

const DeploymentLog = require('../models/deploymentLogModel');

const SERVICE_VERSION = '1.1.0';

const MAX_MESSAGE_LENGTH = 5000;
const MAX_DETAILS_SIZE = 50000;
const MAX_METADATA_ITEMS = 100;

const DEPLOYMENT_STATUSES = new Set([
  'pending', 'queued', 'running', 'building', 'deploying',
  'verifying', 'success', 'failed', 'cancelled', 'rolled_back',
]);

const ACTIVE_STATUSES = new Set([
  'pending', 'queued', 'running', 'building', 'deploying',
  'verifying',
]);

const TERMINAL_STATUSES = new Set([
  'success', 'failed', 'cancelled', 'rolled_back',
]);

const LOG_LEVELS = new Set([
  'debug', 'info', 'success', 'warning', 'error',
]);

const LOG_TYPES = new Set([
  'system', 'agent', 'stage', 'build', 'docker', 'aws',
  'github', 'environment', 'domain', 'ssl', 'monitoring',
  'scaling', 'validation', 'runtime', 'test', 'review', 'fix',
  'deployment', 'verification', 'user',
]);

const STAGE_STATUSES = new Set([
  'pending', 'running', 'success', 'failed', 'skipped', 'cancelled',
]);

const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'secret', 'secrets', 'token',
  'access_token', 'refresh_token', 'api_key', 'apikey',
  'authorization', 'cookie', 'set-cookie', 'credential',
  'credentials', 'private_key', 'privatekey', 'client_secret',
  'clientsecret', 'environmentvariables', 'runtimeenvironment',
  'buildenvironment',
]);

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function cleanString(value, maxLength = MAX_MESSAGE_LENGTH) {
  if (value === undefined || value === null) return undefined;

  return String(value)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeId(value) {
  const result = cleanString(value, 200);
  return result || undefined;
}

function requireId(value, name) {
  const id = normalizeId(value);
  if (!id) throw new Error(`${name} is required`);
  return id;
}

function requireUserId(value) {
  const userId = normalizeId(value);
  if (!userId) {
    throw new Error('Authenticated userId is required');
  }
  return userId;
}

function clampProgress(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    return undefined;
  }

  return number;
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date);
}

function isSensitiveKey(key) {
  const normalized = String(key || '').toLowerCase();

  if (SENSITIVE_KEYS.has(normalized)) return true;

  return normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('access_token') ||
    normalized.includes('refresh_token') ||
    normalized.includes('api_key') ||
    normalized.includes('private_key');
}

function validateEnum(value, allowed, name, fallback) {
  const normalized = cleanString(value, 80);

  if (!normalized) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required`);
  }

  if (!allowed.has(normalized)) {
    throw new Error(`Invalid ${name}`);
  }

  return normalized;
}

function validateOptionalEnum(value, allowed, name) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return validateEnum(value, allowed, name);
}

function sanitizeValue(value, depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (value === undefined || value === null) return value;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const result = {};

    for (const [key, child] of Object.entries(value)) {
      result[key] = isSensitiveKey(key)
        ? '[REDACTED]'
        : sanitizeValue(child, depth + 1);
    }

    return result;
  }

  return String(value).slice(0, 2000);
}

function sanitizeDetails(details) {
  const sanitized = sanitizeValue(details);

  try {
    const serialized = JSON.stringify(sanitized);

    if (serialized.length <= MAX_DETAILS_SIZE) return sanitized;

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
  if (!metadata) return [];

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

/**
 * Do not persist stack traces. They can expose filesystem paths, internal
 * implementation details, query data, and other operational information.
 */
function normalizeError(error, context = {}) {
  if (!error) return undefined;

  const source = error instanceof Error
    ? { message: error.message, code: error.code, name: error.name }
    : isPlainObject(error)
      ? error
      : { message: String(error) };

  return {
    code: cleanString(source.code, 120),
    message: cleanString(
      source.message || 'Unknown deployment error',
      MAX_MESSAGE_LENGTH
    ) || 'Unknown deployment error',
    type: cleanString(source.type || source.name, 120),
    retryable: source.retryable === true,
    stage: cleanString(source.stage || context.stage, 120),
    agent: cleanString(source.agent || context.agent, 120),
    // Intentionally omit stack.
    details: sanitizeDetails(source.details || source.metadata),
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
    environmentName: cleanString(input.environmentName, 100)?.toLowerCase(),
    environmentId: normalizeId(input.environmentId),
    framework: cleanString(input.framework, 120),
    branch: cleanString(input.branch, 300),
    commitSha: cleanString(input.commitSha, 200),
    status: validateEnum(
      input.status,
      DEPLOYMENT_STATUSES,
      'deployment status',
      'pending'
    ),
    progress: clampProgress(input.progress) ?? 0,
    currentStage: cleanString(input.currentStage, 120),
    currentAgent: cleanString(input.currentAgent, 120),
    message: cleanString(input.message),
    level: validateEnum(input.level, LOG_LEVELS, 'log level', 'info'),
    type: validateEnum(input.type, LOG_TYPES, 'log type', 'system'),
    source: cleanString(input.source, 200),
    event: cleanString(input.event, 200),
    metadata: normalizeMetadata(input.metadata),
    details: sanitizeDetails(input.details),
  };
}

function ensureRequiredIdentity(input) {
  requireId(input.deploymentId, 'deploymentId');
  requireId(input.projectId, 'projectId');
  requireUserId(input.userId);
}

/**
 * All deployment reads and writes use this scoped filter.
 * User identity must come from trusted server-side authentication.
 */
function deploymentFilter(deploymentId, userId) {
  return {
    deploymentId: requireId(deploymentId, 'deploymentId'),
    userId: requireUserId(userId),
  };
}

function buildQueryFilters(filters = {}) {
  const userId = requireUserId(filters.userId);
  const query = { userId };

  for (const field of [
    'deploymentId', 'workflowId', 'requestId', 'projectId',
  ]) {
    if (filters[field]) query[field] = normalizeId(filters[field]);
  }

  if (filters.environmentName) {
    query.environmentName = cleanString(filters.environmentName, 100)
      ?.toLowerCase();
  }

  if (filters.status) {
    query.status = validateEnum(
      filters.status, DEPLOYMENT_STATUSES, 'deployment status'
    );
  }

  if (filters.level) {
    query.level = validateEnum(filters.level, LOG_LEVELS, 'log level');
  }

  if (filters.type) {
    query.type = validateEnum(filters.type, LOG_TYPES, 'log type');
  }

  if (filters.currentStage) {
    query.currentStage = cleanString(filters.currentStage, 120);
  }

  if (filters.hasError !== undefined) {
    query.hasError = Boolean(filters.hasError);
  }

  if (filters.autoFixEligible !== undefined) {
    query.autoFixEligible = Boolean(filters.autoFixEligible);
  }

  if (filters.archived !== undefined) {
    query.archived = Boolean(filters.archived);
  }

  if (filters.createdAfter || filters.createdBefore) {
    query.createdAt = {};

    if (filters.createdAfter) {
      const date = new Date(filters.createdAfter);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid createdAfter');
      query.createdAt.$gte = date;
    }

    if (filters.createdBefore) {
      const date = new Date(filters.createdBefore);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid createdBefore');
      query.createdAt.$lte = date;
    }
  }

  return query;
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

class DeploymentLogService {
  constructor() {
    this.version = SERVICE_VERSION;
  }

  async createDeploymentLog(input = {}) {
    const data = normalizeDeploymentInput(input);
    ensureRequiredIdentity(data);

    const now = new Date();

    if (ACTIVE_STATUSES.has(data.status)) data.startedAt = now;

    const log = new DeploymentLog({
      ...data,
      lastEventAt: now,
      streaming: {
        enabled: input.streaming?.enabled !== false,
        streamId: normalizeId(input.streaming?.streamId) || data.deploymentId,
        lastSequence: 0,
      },
    });

    await log.save();
    return this.toSafeObject(log);
  }

  async getDeploymentLog(deploymentId, options = {}) {
    const filter = deploymentFilter(deploymentId, options.userId);

    const query = DeploymentLog.find(filter).sort({
      createdAt: options.sort === 'asc' ? 1 : -1,
    });

    if (options.limit) {
      query.limit(Math.min(Math.max(Number(options.limit) || 50, 1), 500));
    }

    return (await query.lean()).map((item) => this.toSafeObject(item));
  }

  async getLatestDeploymentLog(deploymentId, options = {}) {
    const result = await DeploymentLog.findOne(
      deploymentFilter(deploymentId, options.userId)
    ).sort({ createdAt: -1 }).lean();

    return result ? this.toSafeObject(result) : null;
  }

  async appendEvent(input = {}) {
    const filter = deploymentFilter(input.deploymentId, input.userId);

    const existing = await DeploymentLog.findOne(filter).sort({
      createdAt: -1,
    });

    if (!existing) throw new Error('Deployment log not found');

    const level = validateEnum(input.level, LOG_LEVELS, 'log level', 'info');
    const type = validateEnum(input.type, LOG_TYPES, 'log type', 'system');
    const now = new Date();

    existing.level = level;
    existing.type = type;
    existing.message = cleanString(input.message) || 'Deployment event';

    if (input.source !== undefined) existing.source = cleanString(input.source, 200);
    if (input.event !== undefined) existing.event = cleanString(input.event, 200);
    if (input.stage !== undefined) existing.currentStage = cleanString(input.stage, 120);
    if (input.agent !== undefined) existing.currentAgent = cleanString(input.agent, 120);

    const progress = clampProgress(input.progress);
    if (input.progress !== undefined && progress === undefined) {
      throw new Error('progress must be a number between 0 and 100');
    }
    if (progress !== undefined) existing.progress = progress;

    if (input.status !== undefined) {
      existing.status = validateEnum(
        input.status, DEPLOYMENT_STATUSES, 'deployment status'
      );
    }

    if (input.details !== undefined) {
      existing.details = sanitizeDetails(input.details);
    }

    const metadata = normalizeMetadata(input.metadata);
    if (metadata.length) existing.metadata = metadata;

    existing.lastEventAt = now;
    existing.logCount = (existing.logCount || 0) + 1;

    if (level === 'warning') {
      existing.warningCount = (existing.warningCount || 0) + 1;
    }

    if (level === 'error') {
      existing.errorCount = (existing.errorCount || 0) + 1;
      existing.hasError = true;
    }

    if (input.error) {
      existing.error = normalizeError(input.error, {
        stage: input.stage,
        agent: input.agent,
      });
      existing.hasError = true;
    }

    await existing.save();
    return this.toSafeObject(existing);
  }

  async updateProgress(deploymentId, progress, options = {}) {
    const value = clampProgress(progress);

    if (value === undefined) {
      throw new Error('progress must be a number between 0 and 100');
    }

    const update = {
      progress: value,
      lastEventAt: new Date(),
    };

    if (options.message !== undefined) update.message = cleanString(options.message);
    if (options.stage !== undefined) update.currentStage = cleanString(options.stage, 120);
    if (options.agent !== undefined) update.currentAgent = cleanString(options.agent, 120);

    if (options.status !== undefined) {
      update.status = validateEnum(
        options.status, DEPLOYMENT_STATUSES, 'deployment status'
      );
    }

    const result = await DeploymentLog.findOneAndUpdate(
      deploymentFilter(deploymentId, options.userId),
      { $set: update, $inc: { logCount: 1 } },
      { new: true, sort: { createdAt: -1 }, runValidators: true }
    ).lean();

    if (!result) throw new Error('Deployment log not found');
    return this.toSafeObject(result);
  }

  async markStarted(deploymentId, options = {}) {
    return this.appendEvent({
      deploymentId,
      userId: options.userId,
      status: options.status || 'running',
      level: 'info',
      type: 'deployment',
      event: 'deployment_started',
      stage: options.stage || 'initialization',
      agent: options.agent,
      progress: options.progress ?? 0,
      message: options.message || 'Deployment started',
      details: options.details,
    });
  }

  async markCompleted(deploymentId, options = {}) {
    const filter = deploymentFilter(deploymentId, options.userId);
    const existing = await DeploymentLog.findOne(filter).sort({ createdAt: -1 });

    if (!existing) throw new Error('Deployment log not found');

    const success = options.success !== false;
    const status = validateEnum(
      options.status || (success ? 'success' : 'failed'),
      DEPLOYMENT_STATUSES,
      'deployment status'
    );

    const now = new Date();
    existing.status = status;

    if (success) existing.progress = 100;

    existing.completedAt = now;
    existing.lastEventAt = now;

    if (existing.startedAt) {
      existing.durationMs = now.getTime() - new Date(existing.startedAt).getTime();
    }

    if (options.message !== undefined) existing.message = cleanString(options.message);

    if (!success || status === 'failed') existing.hasError = true;

    if (options.error) {
      existing.error = normalizeError(options.error);
      existing.hasError = true;
      existing.errorCount = (existing.errorCount || 0) + 1;
    }

    if (options.liveUrl !== undefined) existing.liveUrl = cleanString(options.liveUrl, 2000);

    await existing.save();
    return this.toSafeObject(existing);
  }

  async startStage(deploymentId, stageName, options = {}) {
    const stage = cleanString(stageName, 120);
    if (!stage) throw new Error('stageName is required');

    const existing = await DeploymentLog.findOne(
      deploymentFilter(deploymentId, options.userId)
    ).sort({ createdAt: -1 });

    if (!existing) throw new Error('Deployment log not found');

    const now = new Date();
    const stageData = {
      name: stage,
      status: 'running',
      agent: cleanString(options.agent, 120),
      startedAt: now,
      progress: clampProgress(options.progress) ?? 0,
      message: cleanString(options.message, 3000) || `Started ${stage}`,
      metadata: normalizeMetadata(options.metadata),
    };

    const index = existing.stages.findIndex((item) => item.name === stage);
    if (index >= 0) existing.stages[index] = stageData;
    else existing.stages.push(stageData);

    existing.currentStage = stage;
    existing.currentAgent = stageData.agent;
    existing.status = validateEnum(
      options.deploymentStatus || 'running',
      DEPLOYMENT_STATUSES,
      'deployment status'
    );
    existing.lastEventAt = now;

    await existing.save();
    return this.toSafeObject(existing);
  }

  async completeStage(deploymentId, stageName, options = {}) {
    const stage = cleanString(stageName, 120);
    if (!stage) throw new Error('stageName is required');

    const existing = await DeploymentLog.findOne(
      deploymentFilter(deploymentId, options.userId)
    ).sort({ createdAt: -1 });

    if (!existing) throw new Error('Deployment log not found');

    const index = existing.stages.findIndex((item) => item.name === stage);
    if (index < 0) throw new Error('Deployment stage not found');

    const currentStage = existing.stages[index];
    const success = options.success !== false;
    const stageStatus = validateEnum(
      options.status || (success ? 'success' : 'failed'),
      STAGE_STATUSES,
      'stage status'
    );

    const now = new Date();
    currentStage.status = stageStatus;
    currentStage.completedAt = now;

    if (currentStage.startedAt) {
      currentStage.durationMs =
        now.getTime() - new Date(currentStage.startedAt).getTime();
    }

    const progress = clampProgress(options.progress);
    if (options.progress !== undefined && progress === undefined) {
      throw new Error('progress must be a number between 0 and 100');
    }

    if (progress !== undefined) currentStage.progress = progress;
    else if (success) currentStage.progress = 100;

    if (options.message !== undefined) {
      currentStage.message = cleanString(options.message, 3000);
    }

    if (options.error) {
      currentStage.error = normalizeError(options.error, {
        stage,
        agent: options.agent,
      });
    }

    existing.lastEventAt = now;

    if (!success) {
      existing.hasError = true;
      existing.errorCount = (existing.errorCount || 0) + 1;
    }

    await existing.save();
    return this.toSafeObject(existing);
  }

  async recordError(deploymentId, error, options = {}) {
    const normalizedError = normalizeError(error, options);

    return this.appendEvent({
      deploymentId,
      userId: options.userId,
      level: 'error',
      type: options.type || 'deployment',
      event: options.event || 'deployment_error',
      stage: options.stage,
      agent: options.agent,
      status: options.status || 'failed',
      message: options.message || normalizedError?.message || 'Deployment error',
      error: normalizedError,
      details: options.details,
    });
  }

  async recordWarning(deploymentId, message, options = {}) {
    return this.appendEvent({
      deploymentId,
      userId: options.userId,
      level: 'warning',
      type: options.type || 'deployment',
      event: options.event || 'deployment_warning',
      stage: options.stage,
      agent: options.agent,
      progress: options.progress,
      message: cleanString(message) || 'Deployment warning',
      details: options.details,
    });
  }

  async markAutoFixEligible(deploymentId, options = {}) {
    const result = await DeploymentLog.findOneAndUpdate(
      deploymentFilter(deploymentId, options.userId),
      { $set: { autoFixEligible: true, lastEventAt: new Date() } },
      { new: true, sort: { createdAt: -1 }, runValidators: true }
    ).lean();

    if (!result) throw new Error('Deployment log not found');
    return this.toSafeObject(result);
  }

  async markAutoFixTriggered(deploymentId, options = {}) {
    const update = {
      autoFixTriggered: true,
      lastEventAt: new Date(),
    };

    if (options.autoFixTriggerId) {
      update.autoFixTriggerId = normalizeId(options.autoFixTriggerId);
    }

    const result = await DeploymentLog.findOneAndUpdate(
      deploymentFilter(deploymentId, options.userId),
      { $set: update, $inc: { autoFixAttemptCount: 1 } },
      { new: true, sort: { createdAt: -1 }, runValidators: true }
    ).lean();

    if (!result) throw new Error('Deployment log not found');
    return this.toSafeObject(result);
  }

  async getProjectHistory(projectId, options = {}) {
    const normalizedProjectId = requireId(projectId, 'projectId');
    const userId = requireUserId(options.userId);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);

    const query = {
      projectId: normalizedProjectId,
      userId,
      archived: options.archived === true,
    };

    if (options.environmentName) {
      query.environmentName = cleanString(options.environmentName, 100)?.toLowerCase();
    }

    if (options.status) {
      query.status = validateEnum(
        options.status, DEPLOYMENT_STATUSES, 'deployment status'
      );
    }

    const logs = await DeploymentLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return logs.map((item) => this.toSafeObject(item));
  }

  async getActiveDeployment(projectId, options = {}) {
    const result = await DeploymentLog.findOne({
      projectId: requireId(projectId, 'projectId'),
      userId: requireUserId(options.userId),
      status: { $in: [...ACTIVE_STATUSES] },
      archived: false,
    }).sort({ createdAt: -1 }).lean();

    return result ? this.toSafeObject(result) : null;
  }

  async search(filters = {}, options = {}) {
    const query = buildQueryFilters(filters);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);
    const skip = Math.max(Number(options.skip) || 0, 0);

    const logs = await DeploymentLog.find(query)
      .sort({ createdAt: options.sort === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      items: logs.map((item) => this.toSafeObject(item)),
      count: logs.length,
      limit,
      skip,
    };
  }

  /**
   * Archives one record, not every record sharing the deploymentId.
   * The authenticated owner is part of the database filter.
   */
  async archiveDeployment(deploymentId, options = {}) {
    const filter = deploymentFilter(deploymentId, options.userId);
    const target = await DeploymentLog.findOne(filter)
      .sort({ createdAt: -1 })
      .select('_id deploymentId userId')
      .lean();

    if (!target) throw new Error('Deployment log not found');

    const result = await DeploymentLog.updateOne(
      { _id: target._id, userId: filter.userId },
      { $set: { archived: true, archivedAt: new Date() } },
      { runValidators: true }
    );

    return {
      success: true,
      deploymentId: filter.deploymentId,
      modifiedCount: result.modifiedCount || 0,
    };
  }

  async getStreamSnapshot(deploymentId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);

    const logs = await DeploymentLog.find(
      deploymentFilter(deploymentId, options.userId)
    )
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return {
      deploymentId: normalizeId(deploymentId),
      items: logs.map((item) => this.toSafeObject(item)),
      lastEventAt: logs.length ? logs[logs.length - 1].lastEventAt : null,
    };
  }

  async health() {
    const startedAt = Date.now();

    try {
      await DeploymentLog.findOne().select({ _id: 1 }).lean();

      return {
        success: true,
        service: 'deploymentLogService',
        version: this.version,
        database: 'available',
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    } catch {
      // Do not return raw database errors or stack traces.
      return {
        success: false,
        service: 'deploymentLogService',
        version: this.version,
        database: 'unavailable',
        latencyMs: Date.now() - startedAt,
        error: 'Database unavailable',
        timestamp: new Date().toISOString(),
      };
    }
  }

  toSafeObject(value) {
    if (!value) return null;

    const object = typeof value.toObject === 'function'
      ? value.toObject()
      : { ...value };

    return sanitizeValue(object);
  }
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

const deploymentLogService = new DeploymentLogService();

module.exports = deploymentLogService;
module.exports.DeploymentLogService = DeploymentLogService;
module.exports.SERVICE_VERSION = SERVICE_VERSION;
