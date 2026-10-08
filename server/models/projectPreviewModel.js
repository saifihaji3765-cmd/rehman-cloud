"use strict";

/**
 * ZyrionOS Project Preview Model
 * Version: 4.0.0
 *
 * Represents a preview runtime created from an
 * authoritative Engineering Agent build.
 *
 * IMPORTANT:
 * - Preview != deployment
 * - Preview must originate from an authoritative build
 * - Production secrets are permanently blocked
 * - Runtime infrastructure details are internal
 */

const mongoose = require("mongoose");

const {
  Schema,
} = mongoose;

/* -------------------------------------------------------------------------- */
/* ENUMS                                                                      */
/* -------------------------------------------------------------------------- */

const PREVIEW_STATUSES = [
  "queued",
  "building",
  "starting",
  "ready",
  "failed",
  "stopped",
  "expired",
  "cancelled",
];

const RUNTIME_STATUSES = [
  "pending",
  "starting",
  "running",
  "stopped",
  "crashed",
  "unknown",
];

const HEALTH_STATUSES = [
  "unknown",
  "checking",
  "healthy",
  "unhealthy",
  "failed",
];

const NETWORK_MODES = [
  "restricted",
  "none",
  "internal",
];

const ERROR_CODES = [
  "BUILD_NOT_SUCCESSFUL",
  "ARTIFACT_NOT_FOUND",
  "ARTIFACT_INVALID",
  "ARTIFACT_CHECKSUM_MISMATCH",
  "DOCKER_UNAVAILABLE",
  "PREVIEW_RUNTIME_FAILED",
  "HEALTH_CHECK_FAILED",
  "PREVIEW_LIMIT_REACHED",
  "PREVIEW_NOT_FOUND",
  "PREVIEW_ERROR",
];

/* -------------------------------------------------------------------------- */
/* RUNTIME INFO                                                               */
/* -------------------------------------------------------------------------- */

const runtimeInfoSchema = new Schema(
  {
    status: {
      type: String,
      enum: RUNTIME_STATUSES,
      default: "pending",
      required: true,
    },

    /*
     * Internal infrastructure fields.
     * They are never exposed by previewService serialization.
     */
    hostPort: {
      type: Number,
      min: 1,
      max: 65535,
      default: null,
    },

    internalPort: {
      type: Number,
      min: 1,
      max: 65535,
      default: 3000,
    },

    image: {
      type: String,
      default: null,
      maxlength: 300,
    },

    containerId: {
      type: String,
      default: null,
      maxlength: 300,
      select: false,
    },

    containerName: {
      type: String,
      default: null,
      maxlength: 300,
      select: false,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    stoppedAt: {
      type: Date,
      default: null,
    },

    restartCount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    _id: false,
    minimize: false,
  }
);

/* -------------------------------------------------------------------------- */
/* HEALTH CHECK                                                               */
/* -------------------------------------------------------------------------- */

const healthCheckSchema = new Schema(
  {
    status: {
      type: String,
      enum: HEALTH_STATUSES,
      default: "unknown",
      required: true,
    },

    lastCheckedAt: {
      type: Date,
      default: null,
    },

    lastStatusCode: {
      type: Number,
      min: 100,
      max: 599,
      default: null,
    },

    responseTimeMs: {
      type: Number,
      min: 0,
      default: null,
    },

    consecutiveFailures: {
      type: Number,
      min: 0,
      default: 0,
    },

    consecutiveSuccesses: {
      type: Number,
      min: 0,
      default: 0,
    },

    message: {
      type: String,
      default: null,
      maxlength: 2000,
    },
  },
  {
    _id: false,
    minimize: false,
  }
);

/* -------------------------------------------------------------------------- */
/* ERROR                                                                      */
/* -------------------------------------------------------------------------- */

const previewErrorSchema = new Schema(
  {
    code: {
      type: String,
      enum: ERROR_CODES,
      default: "PREVIEW_ERROR",
    },

    message: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    at: {
      type: Date,
      default: Date.now,
    },

    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    _id: false,
  }
);

/* -------------------------------------------------------------------------- */
/* PROJECT PREVIEW                                                            */
/* -------------------------------------------------------------------------- */

const projectPreviewSchema = new Schema(
  {
    /* ---------------------------------------------------------------------- */
    /* OWNERSHIP                                                              */
    /* ---------------------------------------------------------------------- */

    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* ---------------------------------------------------------------------- */
    /* PREVIEW IDENTITY                                                       */
    /* ---------------------------------------------------------------------- */

    previewId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      immutable: true,
      maxlength: 150,
    },

    previewNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    /* ---------------------------------------------------------------------- */
    /* BUILD SOURCE                                                           */
    /* ---------------------------------------------------------------------- */

    buildId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },

    sourceVersionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },

    /*
     * Represents the exact source/build identity used for this preview.
     *
     * The current Preview Service falls back to the authoritative
     * artifact checksum or buildId if a dedicated sourceHash is unavailable.
     */
    sourceHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 256,
    },

    /* ---------------------------------------------------------------------- */
    /* BUILD RUNTIME METADATA                                                 */
    /* ---------------------------------------------------------------------- */

    framework: {
      type: String,
      default: "static",
      trim: true,
      maxlength: 100,
    },

    runtime: {
      type: String,
      default: "node",
      trim: true,
      maxlength: 100,
    },

    nodeVersion: {
      type: String,
      default: "20",
      trim: true,
      maxlength: 50,
    },

    packageManager: {
      type: String,
      default: "npm",
      trim: true,
      maxlength: 50,
    },

    /* ---------------------------------------------------------------------- */
    /* STATE                                                                   */
    /* ---------------------------------------------------------------------- */

    status: {
      type: String,
      enum: PREVIEW_STATUSES,
      required: true,
      default: "queued",
      index: true,
    },

    /* ---------------------------------------------------------------------- */
    /* URL                                                                     */
    /* ---------------------------------------------------------------------- */

    url: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },

    publicUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },

    hostname: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    /* ---------------------------------------------------------------------- */
    /* RUNTIME                                                                 */
    /* ---------------------------------------------------------------------- */

    runtimeInfo: {
      type: runtimeInfoSchema,
      default: () => ({
        status: "pending",
      }),
    },

    /* ---------------------------------------------------------------------- */
    /* HEALTH                                                                  */
    /* ---------------------------------------------------------------------- */

    healthCheck: {
      type: healthCheckSchema,
      default: () => ({
        status: "unknown",
      }),
    },

    /* ---------------------------------------------------------------------- */
    /* LIFECYCLE                                                              */
    /* ---------------------------------------------------------------------- */

    startedAt: {
      type: Date,
      default: null,
    },

    readyAt: {
      type: Date,
      default: null,
    },

    stoppedAt: {
      type: Date,
      default: null,
    },

    expiredAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    /* ---------------------------------------------------------------------- */
    /* TIMING                                                                  */
    /* ---------------------------------------------------------------------- */

    startupDurationMs: {
      type: Number,
      min: 0,
      default: null,
    },

    totalRuntimeMs: {
      type: Number,
      min: 0,
      default: null,
    },

    /* ---------------------------------------------------------------------- */
    /* WORKER / EXECUTION                                                      */
    /* ---------------------------------------------------------------------- */

    workerId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },

    queueName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
      select: false,
    },

    attempt: {
      type: Number,
      min: 0,
      default: 0,
    },

    maxAttempts: {
      type: Number,
      min: 1,
      default: 3,
    },

    /* ---------------------------------------------------------------------- */
    /* LOGGING                                                                 */
    /* ---------------------------------------------------------------------- */

    logs: {
      type: [
        {
          timestamp: {
            type: Date,
            default: Date.now,
          },

          level: {
            type: String,
            enum: [
              "debug",
              "info",
              "warn",
              "error",
            ],
            default: "info",
          },

          message: {
            type: String,
            maxlength: 5000,
          },
        },
      ],
      default: [],
    },

    /* ---------------------------------------------------------------------- */
    /* ERRORS                                                                  */
    /* ---------------------------------------------------------------------- */

    errors: {
      type: [previewErrorSchema],
      default: [],
    },

    /* ---------------------------------------------------------------------- */
    /* SECURITY                                                                */
    /* ---------------------------------------------------------------------- */

    /*
     * These are hard security invariants.
     *
     * Preview must NEVER receive production secrets.
     */
    secretsInjected: {
      type: Boolean,
      default: false,
      immutable: true,
    },

    productionSecretsBlocked: {
      type: Boolean,
      default: true,
      required: true,
    },

    networkAccess: {
      type: String,
      enum: NETWORK_MODES,
      default: "restricted",
      required: true,
    },

    /* ---------------------------------------------------------------------- */
    /* METADATA                                                                */
    /* ---------------------------------------------------------------------- */

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,

    minimize: false,

    strict: true,

    versionKey: false,
  }
);

/* -------------------------------------------------------------------------- */
/* INDEXES                                                                    */
/* -------------------------------------------------------------------------- */

projectPreviewSchema.index({
  projectId: 1,
  userId: 1,
  createdAt: -1,
});

projectPreviewSchema.index({
  projectId: 1,
  userId: 1,
  status: 1,
});

projectPreviewSchema.index({
  projectId: 1,
  buildId: 1,
  createdAt: -1,
});

projectPreviewSchema.index({
  expiresAt: 1,
  status: 1,
});

projectPreviewSchema.index({
  previewId: 1,
});

/* -------------------------------------------------------------------------- */
/* VALIDATION                                                                 */
/* -------------------------------------------------------------------------- */

projectPreviewSchema.pre(
  "validate",
  function validatePreview(next) {
    try {
      /*
       * Security invariant.
       */
      if (this.secretsInjected !== false) {
        this.invalidate(
          "secretsInjected",
          "Preview runtimes cannot receive secrets."
        );
      }

      /*
       * Production secrets must ALWAYS remain blocked.
       */
      if (
        this.productionSecretsBlocked !== true
      ) {
        this.invalidate(
          "productionSecretsBlocked",
          "Production secrets must remain blocked."
        );
      }

      /*
       * A ready preview must have a reachable URL.
       */
      if (
        this.status === "ready"
      ) {
        if (
          !this.url &&
          !this.publicUrl
        ) {
          this.invalidate(
            "url",
            "Ready preview requires a preview URL."
          );
        }

        if (
          !this.runtimeInfo ||
          this.runtimeInfo.status !==
            "running"
        ) {
          this.invalidate(
            "runtimeInfo.status",
            "Ready preview requires a running runtime."
          );
        }

        if (
          !this.readyAt
        ) {
          this.readyAt =
            new Date();
        }
      }

      /*
       * Failed previews must contain an error.
       */
      if (
        this.status === "failed"
      ) {
        if (
          !Array.isArray(
            this.errors
          ) ||
          this.errors.length === 0
        ) {
          this.invalidate(
            "errors",
            "Failed preview requires error information."
          );
        }

        if (!this.failedAt) {
          this.failedAt =
            new Date();
        }
      }

      /*
       * Stopped previews should have stoppedAt.
       */
      if (
        this.status === "stopped" ||
        this.status === "cancelled"
      ) {
        if (!this.stoppedAt) {
          this.stoppedAt =
            new Date();
        }
      }

      /*
       * Expired previews should have expiredAt.
       */
      if (
        this.status === "expired"
      ) {
        if (!this.expiredAt) {
          this.expiredAt =
            new Date();
        }
      }

      /*
       * Runtime state consistency.
       */
      if (
        this.runtimeInfo?.status ===
          "running" &&
        this.status !== "ready"
      ) {
        /*
         * During the create flow the service may update runtimeInfo
         * before status becomes ready through findOneAndUpdate().
         *
         * Therefore this is intentionally NOT an invalidate.
         */
      }

      next();
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* SAVE HOOK                                                                  */
/* -------------------------------------------------------------------------- */

projectPreviewSchema.pre(
  "save",
  function calculateDurations(next) {
    try {
      const currentTime =
        Date.now();

      if (
        this.startedAt &&
        this.readyAt &&
        this.startupDurationMs ===
          null
      ) {
        this.startupDurationMs =
          Math.max(
            0,
            this.readyAt.getTime() -
              this.startedAt.getTime()
          );
      }

      if (
        this.startedAt &&
        (
          this.stoppedAt ||
          this.expiredAt ||
          this.failedAt
        )
      ) {
        const end =
          this.stoppedAt ||
          this.expiredAt ||
          this.failedAt;

        this.totalRuntimeMs =
          Math.max(
            0,
            end.getTime() -
              this.startedAt.getTime()
          );
      }

      /*
       * Security invariant on every save.
       */
      this.secretsInjected =
        false;

      this.productionSecretsBlocked =
        true;

      /*
       * Prevent a stale runtime from remaining "running"
       * after a terminal preview state.
       */
      if (
        (
          this.status === "stopped" ||
          this.status === "expired" ||
          this.status === "cancelled" ||
          this.status === "failed"
        ) &&
        this.runtimeInfo
      ) {
        if (
          this.runtimeInfo.status ===
            "running" ||
          this.runtimeInfo.status ===
            "starting"
        ) {
          this.runtimeInfo.status =
            this.status ===
              "failed"
              ? "crashed"
              : "stopped";
        }
      }

      /*
       * Avoid unused variable lint issues while retaining
       * current-time access for future lifecycle extensions.
       */
      void currentTime;

      next();
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* QUERY HELPERS                                                              */
/* -------------------------------------------------------------------------- */

projectPreviewSchema.statics.findOwned =
  function findOwned(
    previewId,
    projectId,
    userId
  ) {
    return this.findOne({
      previewId,
      projectId,
      userId,
    });
  };

projectPreviewSchema.statics.findActive =
  function findActive(
    projectId,
    userId
  ) {
    return this.findOne({
      projectId,
      userId,
      status: {
        $in: [
          "queued",
          "building",
          "starting",
          "ready",
        ],
      },
    }).sort({
      createdAt: -1,
    });
  };

/* -------------------------------------------------------------------------- */
/* INSTANCE HELPERS                                                           */
/* -------------------------------------------------------------------------- */

projectPreviewSchema.methods.isActive =
  function isActive() {
    return [
      "queued",
      "building",
      "starting",
      "ready",
    ].includes(
      this.status
    );
  };

projectPreviewSchema.methods.isTerminal =
  function isTerminal() {
    return [
      "failed",
      "stopped",
      "expired",
      "cancelled",
    ].includes(
      this.status
    );
  };

projectPreviewSchema.methods.isReady =
  function isReady() {
    return (
      this.status === "ready" &&
      this.runtimeInfo?.status ===
        "running" &&
      Boolean(
        this.url ||
        this.publicUrl
      )
    );
  };

projectPreviewSchema.methods.isExpired =
  function isExpired() {
    if (!this.expiresAt) {
      return false;
    }

    return (
      this.expiresAt.getTime() <=
      Date.now()
    );
  };

projectPreviewSchema.methods.markFailed =
  function markFailed(
    code,
    message,
    details = null
  ) {
    this.status = "failed";

    this.runtimeInfo.status =
      "crashed";

    this.failedAt =
      new Date();

    this.errors.push({
      code:
        ERROR_CODES.includes(code)
          ? code
          : "PREVIEW_ERROR",

      message,

      details,

      at: new Date(),
    });

    return this;
  };

projectPreviewSchema.methods.markStopped =
  function markStopped() {
    this.status = "stopped";

    this.stoppedAt =
      new Date();

    if (
      this.runtimeInfo
    ) {
      this.runtimeInfo.status =
        "stopped";

      this.runtimeInfo.stoppedAt =
        new Date();
    }

    return this;
  };

projectPreviewSchema.methods.markExpired =
  function markExpired() {
    this.status = "expired";

    this.expiredAt =
      new Date();

    if (
      this.runtimeInfo
    ) {
      this.runtimeInfo.status =
        "stopped";

      this.runtimeInfo.stoppedAt =
        new Date();
    }

    return this;
  };

/* -------------------------------------------------------------------------- */
/* JSON SAFETY                                                                */
/* -------------------------------------------------------------------------- */

projectPreviewSchema.methods.toSafeJSON =
  function toSafeJSON() {
    const value =
      this.toObject({
        getters: false,
        virtuals: false,
      });

    /*
     * Infrastructure internals must never be exposed.
     */
    if (value.runtimeInfo) {
      delete value.runtimeInfo.hostPort;
      delete value.runtimeInfo.internalPort;
      delete value.runtimeInfo.image;
      delete value.runtimeInfo.containerId;
      delete value.runtimeInfo.containerName;
    }

    delete value.workerId;
    delete value.queueName;

    if (value.metadata) {
      delete value.metadata.artifactPath;
      delete value.metadata.artifactStorageKey;
      delete value.metadata.runtimeWorkspace;
      delete value.metadata.containerId;
      delete value.metadata.containerName;
    }

    return value;
  };

/* -------------------------------------------------------------------------- */
/* MODEL                                                                      */
/* -------------------------------------------------------------------------- */

const ProjectPreview =
  mongoose.models.ProjectPreview ||
  mongoose.model(
    "ProjectPreview",
    projectPreviewSchema
  );

module.exports =
  ProjectPreview;
