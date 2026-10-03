const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT PREVIEW MODEL
   Enterprise Preview Runtime / Ephemeral Preview Source of Truth

   Architecture:

   Project
      ↓
   ProjectBuild
      ↓
   ProjectPreview
      ↓
   Isolated Runtime
      ↓
   Health Check
      ↓
   Preview URL

   IMPORTANT:
   - Preview is NOT production deployment.
   - Preview must never contain production secrets.
   - Runtime/container identifiers are internal metadata.
   - Preview instances are temporary and expire automatically.
   ========================================================= */


/* =========================================================
   ENUMS
========================================================= */

const PREVIEW_STATUSES = [
  "queued",
  "building",
  "starting",
  "ready",
  "failed",
  "stopped",
  "expired",
  "cancelled"
];

const PREVIEW_TRIGGERS = [
  "manual",
  "file_change",
  "build",
  "deployment",
  "ai",
  "workspace",
  "system"
];

const RUNTIME_STATUSES = [
  "pending",
  "starting",
  "running",
  "stopped",
  "crashed",
  "unknown"
];

const HEALTH_STATUSES = [
  "pending",
  "checking",
  "healthy",
  "unhealthy",
  "timeout",
  "unknown"
];

const FAILURE_CATEGORIES = [
  "",
  "validation",
  "build",
  "runtime",
  "healthcheck",
  "timeout",
  "resource",
  "network",
  "permission",
  "port",
  "unknown"
];


/* =========================================================
   PREVIEW ERROR SCHEMA
========================================================= */

const previewErrorSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },

    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000
    },

    stage: {
      type: String,
      enum: [
        "",
        "validation",
        "build",
        "startup",
        "runtime",
        "healthcheck",
        "cleanup",
        "system"
      ],
      default: ""
    },

    category: {
      type: String,
      enum: FAILURE_CATEGORIES,
      default: ""
    },

    file: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },

    line: {
      type: Number,
      default: null,
      min: 1
    },

    column: {
      type: Number,
      default: null,
      min: 1
    },

    retryable: {
      type: Boolean,
      default: false
    },

    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);


/* =========================================================
   HEALTH CHECK SCHEMA
========================================================= */

const healthCheckSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: HEALTH_STATUSES,
      default: "pending"
    },

    url: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    method: {
      type: String,
      default: "GET",
      trim: true,
      uppercase: true,
      maxlength: 20
    },

    expectedStatus: {
      type: Number,
      default: 200,
      min: 100,
      max: 599
    },

    actualStatus: {
      type: Number,
      default: null,
      min: 100,
      max: 599
    },

    responseTimeMs: {
      type: Number,
      default: null,
      min: 0
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0
    },

    lastCheckedAt: {
      type: Date,
      default: null
    },

    healthyAt: {
      type: Date,
      default: null
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 3000
    }
  },
  {
    _id: false
  }
);


/* =========================================================
   RUNTIME SCHEMA
========================================================= */

const runtimeSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: RUNTIME_STATUSES,
      default: "pending"
    },

    runtime: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    nodeVersion: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    packageManager: {
      type: String,
      enum: [
        "",
        "npm",
        "yarn",
        "pnpm",
        "bun",
        "other"
      ],
      default: ""
    },

    command: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    workingDirectory: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },

    containerId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    workerId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    internalPort: {
      type: Number,
      default: null,
      min: 1,
      max: 65535
    },

    hostPort: {
      type: Number,
      default: null,
      min: 1,
      max: 65535
    },

    cpuLimit: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    memoryLimit: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    startedAt: {
      type: Date,
      default: null
    },

    stoppedAt: {
      type: Date,
      default: null
    },

    exitCode: {
      type: Number,
      default: null
    },

    signal: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    }
  },
  {
    _id: false
  }
);


/* =========================================================
   LOG REFERENCE SCHEMA
========================================================= */

const logReferenceSchema = new mongoose.Schema(
  {
    logStreamId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    stdoutAvailable: {
      type: Boolean,
      default: false
    },

    stderrAvailable: {
      type: Boolean,
      default: false
    },

    lastSequence: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    _id: false
  }
);


/* =========================================================
   PROJECT PREVIEW SCHEMA
========================================================= */

const projectPreviewSchema = new mongoose.Schema(
  {
    /* =====================================================
       PROJECT OWNERSHIP
    ===================================================== */

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },


    /* =====================================================
       PREVIEW IDENTITY
    ===================================================== */

    previewId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 300,
      index: true
    },

    previewNumber: {
      type: Number,
      required: true,
      min: 1
    },


    /* =====================================================
       SOURCE BUILD
    ===================================================== */

    buildId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
      index: true
    },

    buildNumber: {
      type: Number,
      default: null,
      min: 1
    },

    sourceVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    sourceHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true
    },

    framework: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },

    runtime: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },


    /* =====================================================
       PREVIEW STATUS
    ===================================================== */

    status: {
      type: String,
      enum: PREVIEW_STATUSES,
      default: "queued",
      index: true
    },

    trigger: {
      type: String,
      enum: PREVIEW_TRIGGERS,
      default: "manual",
      index: true
    },

    isEphemeral: {
      type: Boolean,
      default: true
    },


    /* =====================================================
       URL
    ===================================================== */

    url: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    publicUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    hostname: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },


    /* =====================================================
       RUNTIME
    ===================================================== */

    runtimeInfo: {
      type: runtimeSchema,
      default: () => ({})
    },


    /* =====================================================
       HEALTH CHECK
    ===================================================== */

    healthCheck: {
      type: healthCheckSchema,
      default: () => ({})
    },


    /* =====================================================
       LOGGING
    ===================================================== */

    logs: {
      type: logReferenceSchema,
      default: () => ({})
    },


    /* =====================================================
       EXECUTION
    ===================================================== */

    workerId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    queueName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    attempt: {
      type: Number,
      default: 1,
      min: 1
    },

    maxAttempts: {
      type: Number,
      default: 2,
      min: 1,
      max: 10
    },


    /* =====================================================
       TIMING
    ===================================================== */

    queuedAt: {
      type: Date,
      default: Date.now
    },

    buildStartedAt: {
      type: Date,
      default: null
    },

    buildCompletedAt: {
      type: Date,
      default: null
    },

    startedAt: {
      type: Date,
      default: null
    },

    readyAt: {
      type: Date,
      default: null
    },

    stoppedAt: {
      type: Date,
      default: null
    },

    expiredAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true
    },

    buildDurationMs: {
      type: Number,
      default: null,
      min: 0
    },

    startupDurationMs: {
      type: Number,
      default: null,
      min: 0
    },

    totalDurationMs: {
      type: Number,
      default: null,
      min: 0
    },


    /* =====================================================
       ERRORS
    ===================================================== */

    errors: {
      type: [previewErrorSchema],
      default: []
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 5000
    },

    failureCategory: {
      type: String,
      enum: FAILURE_CATEGORIES,
      default: ""
    },


    /* =====================================================
       STOP / EXPIRATION
    ===================================================== */

    stoppedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    stopReason: {
      type: String,
      default: "",
      maxlength: 2000
    },

    expirationReason: {
      type: String,
      default: "",
      maxlength: 1000
    },


    /* =====================================================
       AI / WORKSPACE CONTEXT
    ===================================================== */

    aiGenerated: {
      type: Boolean,
      default: false
    },

    aiModel: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },

    promptId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    workspaceSessionId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },


    /* =====================================================
       SECURITY
    ===================================================== */

    secretsInjected: {
      type: Boolean,
      default: false
    },

    productionSecretsBlocked: {
      type: Boolean,
      default: true
    },

    networkAccess: {
      type: String,
      enum: [
        "none",
        "restricted",
        "internet"
      ],
      default: "restricted"
    },


    /* =====================================================
       METADATA
    ===================================================== */

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false
  }
);


/* =========================================================
   ENTERPRISE INDEXES
========================================================= */

/*
 * Latest previews for a project
 */
projectPreviewSchema.index({
  projectId: 1,
  createdAt: -1
});


/*
 * Active previews for a project
 */
projectPreviewSchema.index({
  projectId: 1,
  status: 1,
  createdAt: -1
});


/*
 * Build → preview lookup
 */
projectPreviewSchema.index({
  projectId: 1,
  buildId: 1,
  createdAt: -1
});


/*
 * Source version lookup
 */
projectPreviewSchema.index({
  projectId: 1,
  sourceVersionId: 1,
  createdAt: -1
});


/*
 * Source hash lookup.

 * Useful for detecting whether an existing preview
 * corresponds to the current project source.
 */
projectPreviewSchema.index({
  projectId: 1,
  sourceHash: 1,
  createdAt: -1
});


/*
 * Active runtime lookup.
 */
projectPreviewSchema.index({
  projectId: 1,
  status: 1,
  "runtimeInfo.status": 1
});


/*
 * Expiration worker lookup.
 */
projectPreviewSchema.index({
  expiresAt: 1,
  status: 1
});


/*
 * User preview history.
 */
projectPreviewSchema.index({
  userId: 1,
  createdAt: -1
});


/* =========================================================
   VALIDATION
========================================================= */

projectPreviewSchema.pre(
  "validate",
  function (next) {

    /*
     * Ready preview must have a URL.
     */
    if (
      this.status === "ready" &&
      !this.url
    ) {
      return next(
        new Error(
          "Ready preview requires a preview URL"
        )
      );
    }


    /*
     * Ready preview must have a healthy runtime.
     */
    if (
      this.status === "ready" &&
      this.runtimeInfo &&
      this.runtimeInfo.status !== "running"
    ) {
      return next(
        new Error(
          "Ready preview requires a running runtime"
        )
      );
    }


    /*
     * Failed preview must contain error information.
     */
    if (
      this.status === "failed" &&
      !this.errorMessage &&
      (!Array.isArray(this.errors) ||
        this.errors.length === 0)
    ) {
      return next(
        new Error(
          "Failed preview requires error information"
        )
      );
    }


    /*
     * Expired preview should have expiration time.
     */
    if (
      this.status === "expired" &&
      !this.expiredAt
    ) {
      this.expiredAt = new Date();
    }


    /*
     * Stopped preview should have stopped time.
     */
    if (
      this.status === "stopped" &&
      !this.stoppedAt
    ) {
      this.stoppedAt = new Date();
    }


    /*
     * Cancelled preview is considered completed.
     */
    if (
      this.status === "cancelled" &&
      !this.completedAt
    ) {
      this.completedAt = new Date();
    }


    next();
  }
);


/* =========================================================
   PRE SAVE
========================================================= */

projectPreviewSchema.pre(
  "save",
  function (next) {

    /*
     * Build duration.
     */
    if (
      this.buildStartedAt &&
      this.buildCompletedAt
    ) {
      this.buildDurationMs =
        Math.max(
          0,
          this.buildCompletedAt.getTime() -
          this.buildStartedAt.getTime()
        );
    }


    /*
     * Runtime startup duration.
     */
    if (
      this.startedAt &&
      this.readyAt
    ) {
      this.startupDurationMs =
        Math.max(
          0,
          this.readyAt.getTime() -
          this.startedAt.getTime()
        );
    }


    /*
     * Total preview duration.
     *
     * For completed states we use completedAt.
     * For active previews the value remains null.
     */
    if (
      this.queuedAt &&
      this.completedAt
    ) {
      this.totalDurationMs =
        Math.max(
          0,
          this.completedAt.getTime() -
          this.queuedAt.getTime()
        );
    }


    /*
     * Security invariant:
     *
     * Production secrets must never be injected
     * into a preview runtime.
     */
    if (this.productionSecretsBlocked !== true) {
      this.productionSecretsBlocked = true;
    }


    next();
  }
);


/* =========================================================
   MODEL
========================================================= */

const ProjectPreview =
  mongoose.models.ProjectPreview ||
  mongoose.model(
    "ProjectPreview",
    projectPreviewSchema
  );


/* =========================================================
   EXPORT
========================================================= */

module.exports = ProjectPreview;
