/**
 * ZyrionOS - Environment Model
 * Version: 2.0.0
 *
 * Responsibilities:
 * - Store project environments
 * - Store encrypted/non-secret variables
 * - Track validation state
 * - Track deployment state
 * - Track source metadata
 * - Support optimistic concurrency
 * - Keep secret values excluded by default
 * - Maintain audit metadata
 */

const mongoose = require("mongoose");

const { Schema } = mongoose;

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ENVIRONMENT_NAMES = [
  "development",
  "preview",
  "production",
];

const VARIABLE_TYPES = [
  "string",
  "number",
  "boolean",
  "json",
];

const VARIABLE_SCOPES = [
  "runtime",
  "build",
  "both",
];

const VARIABLE_SOURCES = [
  "manual",
  "github",
  "import",
  "generated",
  "system",
];

const ENVIRONMENT_STATUSES = [
  "draft",
  "ready",
  "invalid",
  "deploying",
  "deployed",
  "archived",
];

const DEPLOYMENT_STATUSES = [
  "never",
  "pending",
  "deploying",
  "deployed",
  "failed",
];

const VALIDATION_STATUSES = [
  "unknown",
  "valid",
  "invalid",
];

const VARIABLE_VALIDATION_STATUSES = [
  "unknown",
  "valid",
  "invalid",
];

/* -------------------------------------------------------------------------- */
/* Variable Schema                                                            */
/* -------------------------------------------------------------------------- */

const environmentVariableSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },

    /**
     * Actual secret value.
     *
     * IMPORTANT:
     * This is encrypted by environmentService.js.
     * It is excluded from normal Mongo queries.
     */
    encryptedValue: {
      type: String,
      default: null,
      select: false,
    },

    /**
     * Non-secret value.
     *
     * This field intentionally remains available for normal reads.
     */
    plainValue: {
      type: String,
      default: null,
    },

    /**
     * Whether this variable should be treated as secret.
     */
    isSecret: {
      type: Boolean,
      default: false,
    },

    type: {
      type: String,
      enum: VARIABLE_TYPES,
      default: "string",
    },

    scope: {
      type: String,
      enum: VARIABLE_SCOPES,
      default: "runtime",
    },

    required: {
      type: Boolean,
      default: false,
    },

    description: {
      type: String,
      default: "",
      maxlength: 1000,
      trim: true,
    },

    source: {
      type: String,
      enum: VARIABLE_SOURCES,
      default: "manual",
    },

    sourceRef: {
      type: String,
      default: "",
      maxlength: 500,
      trim: true,
    },

    validation: {
      status: {
        type: String,
        enum: VARIABLE_VALIDATION_STATUSES,
        default: "unknown",
      },

      message: {
        type: String,
        default: "",
        maxlength: 1000,
      },

      checkedAt: {
        type: Date,
        default: null,
      },
    },

    /**
     * Indicates that the variable has a configured value.
     *
     * This avoids exposing the actual secret while still allowing
     * the frontend to know whether configuration exists.
     */
    hasValue: {
      type: Boolean,
      default: false,
    },

    /**
     * Tracks whether the value is encrypted using the current
     * environment encryption version.
     */
    encryptionVersion: {
      type: String,
      default: null,
    },

    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },

    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    _id: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Deployment Snapshot Schema                                                 */
/* -------------------------------------------------------------------------- */

const deploymentSnapshotSchema = new Schema(
  {
    version: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: DEPLOYMENT_STATUSES,
      default: "never",
    },

    deploymentId: {
      type: String,
      default: null,
      maxlength: 200,
    },

    workflowId: {
      type: String,
      default: null,
      maxlength: 200,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    variableCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Hash of the environment configuration.
     *
     * This is NOT the secret value.
     * It can be used to determine whether the environment
     * changed between deployments.
     */
    configurationHash: {
      type: String,
      default: null,
      maxlength: 256,
    },
  },
  {
    _id: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Validation Schema                                                          */
/* -------------------------------------------------------------------------- */

const validationSchema = new Schema(
  {
    status: {
      type: String,
      enum: VALIDATION_STATUSES,
      default: "unknown",
    },

    checkedAt: {
      type: Date,
      default: null,
    },

    totalVariables: {
      type: Number,
      default: 0,
      min: 0,
    },

    configuredVariables: {
      type: Number,
      default: 0,
      min: 0,
    },

    missingRequiredVariables: {
      type: Number,
      default: 0,
      min: 0,
    },

    invalidVariables: {
      type: Number,
      default: 0,
      min: 0,
    },

    errors: {
      type: [
        {
          key: {
            type: String,
            maxlength: 256,
          },

          message: {
            type: String,
            maxlength: 1000,
          },
        },
      ],
      default: [],
    },
  },
  {
    _id: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Source Schema                                                              */
/* -------------------------------------------------------------------------- */

const sourceSchema = new Schema(
  {
    type: {
      type: String,
      enum: VARIABLE_SOURCES,
      default: "manual",
    },

    provider: {
      type: String,
      default: null,
      maxlength: 100,
    },

    repository: {
      type: String,
      default: null,
      maxlength: 500,
    },

    branch: {
      type: String,
      default: null,
      maxlength: 300,
    },

    commitSha: {
      type: String,
      default: null,
      maxlength: 100,
    },

    importedAt: {
      type: Date,
      default: null,
    },

    importedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    _id: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Audit Schema                                                               */
/* -------------------------------------------------------------------------- */

const auditSchema = new Schema(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    lastAction: {
      type: String,
      default: null,
      maxlength: 200,
    },

    lastActionAt: {
      type: Date,
      default: null,
    },

    lastActionBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    _id: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Main Environment Schema                                                    */
/* -------------------------------------------------------------------------- */

const environmentSchema = new Schema(
  {
    /* ----------------------------- Ownership ----------------------------- */

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    /* ----------------------------- Identity ------------------------------ */

    name: {
      type: String,
      required: true,
      enum: ENVIRONMENT_NAMES,
      lowercase: true,
      trim: true,
    },

    displayName: {
      type: String,
      default: null,
      maxlength: 200,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      maxlength: 2000,
      trim: true,
    },

    /* ------------------------------ State -------------------------------- */

    status: {
      type: String,
      enum: ENVIRONMENT_STATUSES,
      default: "draft",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* --------------------------- Variables ------------------------------- */

    variables: {
      type: [environmentVariableSchema],
      default: [],
    },

    /* --------------------------- Validation ------------------------------- */

    validation: {
      type: validationSchema,
      default: () => ({}),
    },

    /* --------------------------- Deployment ------------------------------- */

    deployment: {
      type: deploymentSnapshotSchema,
      default: () => ({}),
    },

    /* ------------------------------ Source -------------------------------- */

    source: {
      type: sourceSchema,
      default: () => ({}),
    },

    /* -------------------------------- Audit ------------------------------- */

    audit: {
      type: auditSchema,
      default: () => ({}),
    },

    /* -------------------------- Configuration ---------------------------- */

    /**
     * Incremented whenever the environment configuration changes.
     *
     * environmentService.js uses this for optimistic concurrency.
     */
    version: {
      type: Number,
      default: 1,
      min: 1,
    },

    /**
     * Hash of the current configuration.
     * Useful for deployment comparison and cache invalidation.
     */
    configurationHash: {
      type: String,
      default: null,
      maxlength: 256,
      index: true,
    },

    /**
     * Optional deployment lock.
     *
     * Prevents multiple deployment workflows from mutating
     * the same environment simultaneously.
     */
    deploymentLock: {
      locked: {
        type: Boolean,
        default: false,
      },

      workflowId: {
        type: String,
        default: null,
        maxlength: 200,
      },

      lockedAt: {
        type: Date,
        default: null,
      },

      lockedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
  },
  {
    timestamps: true,

    /**
     * Do not allow Mongoose to silently add an `__v` field.
     * We use our explicit `version` field for concurrency control.
     */
    versionKey: false,

    minimize: false,
  }
);

/* -------------------------------------------------------------------------- */
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One development/preview/production environment per project/user.
 */
environmentSchema.index(
  {
    userId: 1,
    projectId: 1,
    name: 1,
  },
  {
    unique: true,
    name: "unique_user_project_environment",
  }
);

/**
 * Fast lookup of active environments.
 */
environmentSchema.index(
  {
    projectId: 1,
    isActive: 1,
    isArchived: 1,
  },
  {
    name: "project_active_environments",
  }
);

/**
 * Deployment-related queries.
 */
environmentSchema.index(
  {
    projectId: 1,
    "deployment.status": 1,
  },
  {
    name: "project_deployment_status",
  }
);

/**
 * Validation-related queries.
 */
environmentSchema.index(
  {
    projectId: 1,
    "validation.status": 1,
  },
  {
    name: "project_validation_status",
  }
);

/* -------------------------------------------------------------------------- */
/* Normalization Helpers                                                      */
/* -------------------------------------------------------------------------- */

function normalizeEnvironmentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeVariableKey(value) {
  return String(value || "").trim();
}

function normalizeVariableType(value) {
  const normalized = String(value || "string")
    .trim()
    .toLowerCase();

  return VARIABLE_TYPES.includes(normalized)
    ? normalized
    : "string";
}

function normalizeVariableScope(value) {
  const normalized = String(value || "runtime")
    .trim()
    .toLowerCase();

  return VARIABLE_SCOPES.includes(normalized)
    ? normalized
    : "runtime";
}

/* -------------------------------------------------------------------------- */
/* Instance Methods                                                           */
/* -------------------------------------------------------------------------- */

environmentSchema.methods.getVariable = function getVariable(key) {
  const normalizedKey = normalizeVariableKey(key);

  return (
    this.variables.find(
      (variable) => variable.key === normalizedKey
    ) || null
  );
};

environmentSchema.methods.hasVariable = function hasVariable(key) {
  return Boolean(this.getVariable(key));
};

environmentSchema.methods.hasConfiguredVariable =
  function hasConfiguredVariable(key) {
    const variable = this.getVariable(key);

    return Boolean(variable && variable.hasValue);
  };

environmentSchema.methods.getVariableCount =
  function getVariableCount() {
    return this.variables.length;
  };

environmentSchema.methods.getRequiredVariables =
  function getRequiredVariables() {
    return this.variables.filter(
      (variable) => variable.required === true
    );
  };

environmentSchema.methods.getMissingRequiredVariables =
  function getMissingRequiredVariables() {
    return this.variables.filter(
      (variable) =>
        variable.required === true &&
        variable.hasValue !== true
    );
  };

environmentSchema.methods.getInvalidVariables =
  function getInvalidVariables() {
    return this.variables.filter(
      (variable) =>
        variable.validation?.status === "invalid"
    );
  };

environmentSchema.methods.isValidForDeployment =
  function isValidForDeployment() {
    return (
      this.isArchived !== true &&
      this.isActive !== false &&
      this.validation?.status === "valid" &&
      this.getMissingRequiredVariables().length === 0 &&
      this.getInvalidVariables().length === 0
    );
  };

environmentSchema.methods.isDeploying =
  function isDeploying() {
    return (
      this.status === "deploying" ||
      this.deployment?.status === "deploying"
    );
  };

environmentSchema.methods.isDeployed =
  function isDeployed() {
    return (
      this.status === "deployed" &&
      this.deployment?.status === "deployed"
    );
  };

environmentSchema.methods.isLocked =
  function isLocked() {
    return this.deploymentLock?.locked === true;
  };

environmentSchema.methods.lockDeployment =
  function lockDeployment({
    workflowId,
    userId,
  } = {}) {
    if (this.deploymentLock?.locked) {
      return false;
    }

    this.deploymentLock = {
      locked: true,
      workflowId: workflowId || null,
      lockedAt: new Date(),
      lockedBy: userId || null,
    };

    return true;
  };

environmentSchema.methods.unlockDeployment =
  function unlockDeployment() {
    this.deploymentLock = {
      locked: false,
      workflowId: null,
      lockedAt: null,
      lockedBy: null,
    };

    return true;
  };

/* -------------------------------------------------------------------------- */
/* Safe Serialization                                                         */
/* -------------------------------------------------------------------------- */

environmentSchema.methods.toSafeObject =
  function toSafeObject() {
    return {
      id: String(this._id),
      userId: this.userId ? String(this.userId) : null,
      projectId: this.projectId
        ? String(this.projectId)
        : null,

      name: this.name,
      displayName: this.displayName,
      description: this.description,

      status: this.status,
      isActive: this.isActive,
      isArchived: this.isArchived,

      version: this.version,

      variables: this.variables.map((variable) => ({
        key: variable.key,
        type: variable.type,
        scope: variable.scope,
        isSecret: variable.isSecret,
        required: variable.required,
        description: variable.description,
        source: variable.source,
        sourceRef: variable.sourceRef,

        /**
         * Never expose encryptedValue/plainValue here.
         */
        hasValue:
          variable.hasValue === true,

        maskedValue: variable.isSecret
          ? "••••••••"
          : variable.hasValue
            ? variable.plainValue
            : "",

        validation: {
          status:
            variable.validation?.status ||
            "unknown",

          message:
            variable.validation?.message ||
            "",

          checkedAt:
            variable.validation?.checkedAt ||
            null,
        },

        lastUpdatedAt:
          variable.lastUpdatedAt || null,
      })),

      validation: {
        status:
          this.validation?.status ||
          "unknown",

        checkedAt:
          this.validation?.checkedAt ||
          null,

        totalVariables:
          this.validation?.totalVariables || 0,

        configuredVariables:
          this.validation?.configuredVariables || 0,

        missingRequiredVariables:
          this.validation?.missingRequiredVariables || 0,

        invalidVariables:
          this.validation?.invalidVariables || 0,

        errors:
          this.validation?.errors || [],
      },

      deployment: {
        version:
          this.deployment?.version || 0,

        status:
          this.deployment?.status || "never",

        deploymentId:
          this.deployment?.deploymentId || null,

        workflowId:
          this.deployment?.workflowId || null,

        startedAt:
          this.deployment?.startedAt || null,

        completedAt:
          this.deployment?.completedAt || null,

        lastError:
          this.deployment?.lastError || "",

        variableCount:
          this.deployment?.variableCount || 0,

        configurationHash:
          this.deployment?.configurationHash ||
          null,
      },

      source: {
        type:
          this.source?.type || "manual",

        provider:
          this.source?.provider || null,

        repository:
          this.source?.repository || null,

        branch:
          this.source?.branch || null,

        commitSha:
          this.source?.commitSha || null,

        importedAt:
          this.source?.importedAt || null,
      },

      audit: {
        createdBy:
          this.audit?.createdBy
            ? String(this.audit.createdBy)
            : null,

        updatedBy:
          this.audit?.updatedBy
            ? String(this.audit.updatedBy)
            : null,

        lastAction:
          this.audit?.lastAction || null,

        lastActionAt:
          this.audit?.lastActionAt || null,
      },

      configurationHash:
        this.configurationHash || null,

      deploymentLock: {
        locked:
          this.deploymentLock?.locked === true,

        workflowId:
          this.deploymentLock?.workflowId || null,

        lockedAt:
          this.deploymentLock?.lockedAt || null,
      },

      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  };

/* -------------------------------------------------------------------------- */
/* Query Helpers                                                              */
/* -------------------------------------------------------------------------- */

environmentSchema.statics.findForProject =
  function findForProject(projectId, userId) {
    return this.find({
      projectId,
      userId,
      isArchived: false,
    }).sort({
      name: 1,
    });
  };

environmentSchema.statics.findEnvironment =
  function findEnvironment({
    projectId,
    userId,
    name,
    includeSecrets = false,
  } = {}) {
    const query = this.findOne({
      projectId,
      userId,
      name: normalizeEnvironmentName(name),
      isArchived: false,
    });

    if (includeSecrets) {
      query.select(
        "+variables.encryptedValue +variables.plainValue"
      );
    }

    return query;
  };

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

environmentSchema.pre("validate", function environmentValidate(next) {
  this.name = normalizeEnvironmentName(this.name);

  if (this.displayName) {
    this.displayName = String(
      this.displayName
    ).trim();
  }

  if (Array.isArray(this.variables)) {
    const seen = new Set();

    for (const variable of this.variables) {
      variable.key = normalizeVariableKey(
        variable.key
      );

      variable.type =
        normalizeVariableType(
          variable.type
        );

      variable.scope =
        normalizeVariableScope(
          variable.scope
        );

      if (seen.has(variable.key)) {
        return next(
          new Error(
            `Duplicate environment variable key: ${variable.key}`
          )
        );
      }

      seen.add(variable.key);

      /**
       * Keep hasValue synchronized with the actual
       * stored representation.
       */
      if (variable.isSecret) {
        variable.hasValue = Boolean(
          variable.encryptedValue
        );
      } else {
        variable.hasValue =
          variable.plainValue !== null &&
          variable.plainValue !== undefined &&
          String(variable.plainValue).length > 0;
      }

      if (!variable.lastUpdatedAt) {
        variable.lastUpdatedAt = new Date();
      }
    }
  }

  next();
});

/* -------------------------------------------------------------------------- */
/* Update Hooks                                                               */
/* -------------------------------------------------------------------------- */

environmentSchema.pre(
  "save",
  function environmentBeforeSave(next) {
    /**
     * Do not manually increment `version` here.
     *
     * environmentService.js controls configuration versioning
     * so service-level concurrency checks remain deterministic.
     */

    if (!this.audit) {
      this.audit = {};
    }

    if (this.isModified()) {
      this.audit.lastActionAt =
        new Date();
    }

    next();
  }
);

/* -------------------------------------------------------------------------- */
/* Static Constants                                                           */
/* -------------------------------------------------------------------------- */

environmentSchema.statics.ENVIRONMENT_NAMES =
  ENVIRONMENT_NAMES;

environmentSchema.statics.VARIABLE_TYPES =
  VARIABLE_TYPES;

environmentSchema.statics.VARIABLE_SCOPES =
  VARIABLE_SCOPES;

environmentSchema.statics.VARIABLE_SOURCES =
  VARIABLE_SOURCES;

environmentSchema.statics.ENVIRONMENT_STATUSES =
  ENVIRONMENT_STATUSES;

environmentSchema.statics.DEPLOYMENT_STATUSES =
  DEPLOYMENT_STATUSES;

environmentSchema.statics.VALIDATION_STATUSES =
  VALIDATION_STATUSES;

/* -------------------------------------------------------------------------- */
/* Model Export                                                               */
/* -------------------------------------------------------------------------- */

const Environment =
  mongoose.models.Environment ||
  mongoose.model(
    "Environment",
    environmentSchema
  );

module.exports = Environment;
