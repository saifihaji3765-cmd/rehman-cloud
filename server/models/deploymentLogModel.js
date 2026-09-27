'use strict';

/**
 * Deployment Log Model
 * Version: 1.0.0
 *
 * Purpose:
 * - Store deployment lifecycle logs
 * - Support live deployment streaming
 * - Track agent/stage progress
 * - Store errors and warnings
 * - Provide Auto Fix context
 * - Support Workspace deployment history
 *
 * Important:
 * - Never store secrets, tokens, passwords or raw credentials here.
 * - This model stores deployment events, not environment values.
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEPLOYMENT_STATUSES = Object.freeze([
  'pending',
  'queued',
  'running',
  'building',
  'deploying',
  'verifying',
  'success',
  'failed',
  'cancelled',
  'rolled_back',
]);

const LOG_LEVELS = Object.freeze([
  'debug',
  'info',
  'success',
  'warning',
  'error',
]);

const LOG_TYPES = Object.freeze([
  'system',
  'agent',
  'stage',
  'build',
  'docker',
  'aws',
  'github',
  'environment',
  'domain',
  'ssl',
  'monitoring',
  'scaling',
  'validation',
  'runtime',
  'test',
  'review',
  'fix',
  'deployment',
  'verification',
  'user',
]);

const STAGE_STATUSES = Object.freeze([
  'pending',
  'running',
  'success',
  'failed',
  'skipped',
  'cancelled',
]);

/* -------------------------------------------------------------------------- */
/* Embedded Schemas                                                           */
/* -------------------------------------------------------------------------- */

const MetadataSchema = new Schema(
  {
    key: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    value: {
      type: Schema.Types.Mixed,
    },
  },
  {
    _id: false,
  }
);

const ErrorSchema = new Schema(
  {
    code: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    type: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    retryable: {
      type: Boolean,
      default: false,
    },

    stage: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    agent: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    stack: {
      type: String,
      maxlength: 15000,
    },

    details: {
      type: Schema.Types.Mixed,
    },
  },
  {
    _id: false,
  }
);

const StageSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    status: {
      type: String,
      enum: STAGE_STATUSES,
      default: 'pending',
      index: true,
    },

    agent: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    startedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    durationMs: {
      type: Number,
      min: 0,
    },

    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    message: {
      type: String,
      trim: true,
      maxlength: 3000,
    },

    error: {
      type: ErrorSchema,
      default: undefined,
    },

    metadata: {
      type: [MetadataSchema],
      default: [],
    },
  },
  {
    _id: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Main Schema                                                                */
/* -------------------------------------------------------------------------- */

const DeploymentLogSchema = new Schema(
  {
    /* ------------------------------ Identity ------------------------------ */

    deploymentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      maxlength: 200,
    },

    workflowId: {
      type: String,
      trim: true,
      index: true,
      maxlength: 200,
    },

    requestId: {
      type: String,
      trim: true,
      index: true,
      maxlength: 200,
    },

    projectId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      maxlength: 200,
    },

    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      maxlength: 200,
    },

    /* ---------------------------- Project Info ---------------------------- */

    projectName: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    environmentName: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      maxlength: 100,
    },

    environmentId: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    framework: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    branch: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    commitSha: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    /* --------------------------- Deployment State ------------------------- */

    status: {
      type: String,
      enum: DEPLOYMENT_STATUSES,
      default: 'pending',
      required: true,
      index: true,
    },

    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
      index: true,
    },

    currentStage: {
      type: String,
      trim: true,
      maxlength: 120,
      index: true,
    },

    currentAgent: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    message: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    /* ------------------------------ Logging ------------------------------- */

    level: {
      type: String,
      enum: LOG_LEVELS,
      default: 'info',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: LOG_TYPES,
      default: 'system',
      required: true,
      index: true,
    },

    source: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    event: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
    },

    /* ------------------------------ Stages -------------------------------- */

    stages: {
      type: [StageSchema],
      default: [],
    },

    /* ------------------------------ Error --------------------------------- */

    error: {
      type: ErrorSchema,
      default: undefined,
    },

    hasError: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* -------------------------- Auto Fix Context -------------------------- */

    autoFixEligible: {
      type: Boolean,
      default: false,
      index: true,
    },

    autoFixTriggered: {
      type: Boolean,
      default: false,
      index: true,
    },

    autoFixTriggerId: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    autoFixAttemptCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    /* ------------------------- Infrastructure ----------------------------- */

    dockerImage: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    imageDigest: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    awsRegion: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    clusterName: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    serviceName: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    taskDefinition: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    domain: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    liveUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    /* ------------------------------ Metrics ------------------------------- */

    startedAt: {
      type: Date,
      index: true,
    },

    completedAt: {
      type: Date,
      index: true,
    },

    lastEventAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    durationMs: {
      type: Number,
      min: 0,
    },

    logCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    errorCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    warningCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    /* ---------------------------- Extra Data ------------------------------ */

    metadata: {
      type: [MetadataSchema],
      default: [],
    },

    details: {
      type: Schema.Types.Mixed,
      default: {},
    },

    /* ----------------------------- Streaming ------------------------------ */

    streaming: {
      enabled: {
        type: Boolean,
        default: true,
      },

      streamId: {
        type: String,
        trim: true,
        maxlength: 200,
      },

      lastSequence: {
        type: Number,
        min: 0,
        default: 0,
      },
    },

    /* ---------------------------- Retention -------------------------------- */

    archived: {
      type: Boolean,
      default: false,
      index: true,
    },

    archivedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,

    versionKey: false,

    minimize: false,

    collection: 'deployment_logs',
  }
);

/* -------------------------------------------------------------------------- */
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

// Main deployment lookup.
DeploymentLogSchema.index({
  deploymentId: 1,
  createdAt: -1,
});

// Project deployment history.
DeploymentLogSchema.index({
  projectId: 1,
  createdAt: -1,
});

// User deployment history.
DeploymentLogSchema.index({
  userId: 1,
  createdAt: -1,
});

// Workspace filtering.
DeploymentLogSchema.index({
  projectId: 1,
  environmentName: 1,
  createdAt: -1,
});

// Active deployment lookup.
DeploymentLogSchema.index({
  projectId: 1,
  status: 1,
  createdAt: -1,
});

// Error / Auto Fix lookup.
DeploymentLogSchema.index({
  projectId: 1,
  hasError: 1,
  autoFixEligible: 1,
  createdAt: -1,
});

// Streaming order.
DeploymentLogSchema.index({
  deploymentId: 1,
  lastEventAt: 1,
});

// Agent/stage filtering.
DeploymentLogSchema.index({
  deploymentId: 1,
  currentStage: 1,
  currentAgent: 1,
});

/* -------------------------------------------------------------------------- */
/* Instance Methods                                                           */
/* -------------------------------------------------------------------------- */

DeploymentLogSchema.methods.updateProgress = function updateProgress(
  progress,
  message = undefined
) {
  if (Number.isFinite(progress)) {
    this.progress = Math.max(0, Math.min(100, progress));
  }

  if (typeof message === 'string' && message.trim()) {
    this.message = message.trim();
  }

  this.lastEventAt = new Date();

  return this;
};

DeploymentLogSchema.methods.markStarted = function markStarted({
  stage,
  agent,
  message,
} = {}) {
  this.status = 'running';

  if (!this.startedAt) {
    this.startedAt = new Date();
  }

  if (stage) {
    this.currentStage = stage;
  }

  if (agent) {
    this.currentAgent = agent;
  }

  if (message) {
    this.message = message;
  }

  this.lastEventAt = new Date();

  return this;
};

DeploymentLogSchema.methods.markCompleted = function markCompleted({
  success = true,
  message,
} = {}) {
  this.status = success ? 'success' : 'failed';

  this.progress = success ? 100 : this.progress;

  this.completedAt = new Date();
  this.lastEventAt = new Date();

  if (this.startedAt) {
    this.durationMs =
      this.completedAt.getTime() - this.startedAt.getTime();
  }

  if (message) {
    this.message = message;
  }

  if (!success) {
    this.hasError = true;
  }

  return this;
};

DeploymentLogSchema.methods.addStage = function addStage(stage) {
  if (!stage || !stage.name) {
    return this;
  }

  const existingIndex = this.stages.findIndex(
    (item) => item.name === stage.name
  );

  if (existingIndex >= 0) {
    this.stages[existingIndex] = {
      ...this.stages[existingIndex].toObject?.(),
      ...stage,
    };
  } else {
    this.stages.push(stage);
  }

  this.lastEventAt = new Date();

  return this;
};

DeploymentLogSchema.methods.recordError = function recordError(error) {
  const normalizedError =
    error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
        }
      : {
          message:
            typeof error === 'string'
              ? error
              : error?.message || 'Unknown deployment error',
          ...error,
        };

  this.error = normalizedError;
  this.hasError = true;
  this.errorCount = (this.errorCount || 0) + 1;
  this.level = 'error';
  this.lastEventAt = new Date();

  return this;
};

/* -------------------------------------------------------------------------- */
/* Static Methods                                                             */
/* -------------------------------------------------------------------------- */

DeploymentLogSchema.statics.findByDeploymentId =
  function findByDeploymentId(deploymentId) {
    return this.find({ deploymentId })
      .sort({ createdAt: 1 })
      .lean();
  };

DeploymentLogSchema.statics.findLatestByDeployment =
  function findLatestByDeployment(deploymentId) {
    return this.findOne({ deploymentId })
      .sort({ createdAt: -1 })
      .lean();
  };

DeploymentLogSchema.statics.findProjectHistory =
  function findProjectHistory(projectId, options = {}) {
    const limit = Math.min(
      Math.max(Number(options.limit) || 50, 1),
      200
    );

    return this.find({
      projectId,
      archived: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  };

DeploymentLogSchema.statics.findActiveDeployment =
  function findActiveDeployment(projectId) {
    return this.findOne({
      projectId,
      status: {
        $in: [
          'pending',
          'queued',
          'running',
          'building',
          'deploying',
          'verifying',
        ],
      },
      archived: false,
    }).sort({ createdAt: -1 });
  };

/* -------------------------------------------------------------------------- */
/* Query Helpers                                                              */
/* -------------------------------------------------------------------------- */

DeploymentLogSchema.query.active = function active() {
  return this.where({
    status: {
      $in: [
        'pending',
        'queued',
        'running',
        'building',
        'deploying',
        'verifying',
      ],
    },
    archived: false,
  });
};

DeploymentLogSchema.query.failed = function failed() {
  return this.where({
    status: 'failed',
    archived: false,
  });
};

DeploymentLogSchema.query.withErrors = function withErrors() {
  return this.where({
    hasError: true,
    archived: false,
  });
};

/* -------------------------------------------------------------------------- */
/* JSON Protection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Never expose internal deployment secrets through JSON serialization.
 *
 * This is a defensive layer only.
 * Secrets should never be written to this model in the first place.
 */
DeploymentLogSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;

    if (ret.details && typeof ret.details === 'object') {
      delete ret.details.secrets;
      delete ret.details.credentials;
      delete ret.details.environmentVariables;
      delete ret.details.runtimeEnvironment;
      delete ret.details.buildEnvironment;
    }

    return ret;
  },
});

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

const DeploymentLog =
  mongoose.models.DeploymentLog ||
  mongoose.model('DeploymentLog', DeploymentLogSchema);

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = DeploymentLog;

module.exports.DeploymentLog = DeploymentLog;

module.exports.DEPLOYMENT_STATUSES = DEPLOYMENT_STATUSES;
module.exports.LOG_LEVELS = LOG_LEVELS;
module.exports.LOG_TYPES = LOG_TYPES;
module.exports.STAGE_STATUSES = STAGE_STATUSES;
