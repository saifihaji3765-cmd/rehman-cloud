const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT BUILD MODEL
   Enterprise Build History / CI Build Source of Truth
   ========================================================= */

/* =========================================================
   ARTIFACT SCHEMA
========================================================= */

const artifactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },

    type: {
      type: String,
      enum: [
        "build",
        "bundle",
        "source",
        "archive",
        "container",
        "other"
      ],
      default: "build"
    },

    storageKey: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    url: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    size: {
      type: Number,
      default: 0,
      min: 0
    },

    checksum: {
      type: String,
      default: "",
      trim: true,
      maxlength: 256
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   BUILD ERROR SCHEMA
========================================================= */

const buildErrorSchema = new mongoose.Schema(
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
      maxlength: 4000
    },

    step: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
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
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   PROJECT BUILD SCHEMA
========================================================= */

const projectBuildSchema = new mongoose.Schema(
  {
    /* =====================================================
       PROJECT
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
       BUILD IDENTITY
    ===================================================== */

    buildId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 300
    },

    buildNumber: {
      type: Number,
      required: true,
      min: 1
    },

    /* =====================================================
       BUILD STATUS
    ===================================================== */

    status: {
      type: String,
      enum: [
        "queued",
        "running",
        "success",
        "failed",
        "cancelled"
      ],
      default: "queued",
      index: true
    },

    /* =====================================================
       BUILD TRIGGER
    ===================================================== */

    trigger: {
      type: String,
      enum: [
        "manual",
        "project_create",
        "file_change",
        "version_restore",
        "deployment",
        "webhook",
        "automation",
        "agent",
        "system"
      ],
      default: "manual",
      index: true
    },

    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    /* =====================================================
       SOURCE
    ===================================================== */

    commitId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    branch: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    repositoryUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    sourceVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    /* =====================================================
       BUILD CONFIGURATION
    ===================================================== */

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

    buildCommand: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },

    outputDirectory: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
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
      default: 3,
      min: 1,
      max: 20
    },

    /* =====================================================
       TIMING
    ===================================================== */

    queuedAt: {
      type: Date,
      default: Date.now
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    durationMs: {
      type: Number,
      default: null,
      min: 0
    },

    /* =====================================================
       BUILD OUTPUT
    ===================================================== */

    artifacts: {
      type: [artifactSchema],
      default: []
    },

    artifactCount: {
      type: Number,
      default: 0,
      min: 0
    },

    outputSize: {
      type: Number,
      default: 0,
      min: 0
    },

    /* =====================================================
       ERRORS
    ===================================================== */

    errors: {
      type: [buildErrorSchema],
      default: []
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 4000
    },

    /* =====================================================
       LOG REFERENCE
    ===================================================== */

    logStreamId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    /* =====================================================
       AI BUILD CONTEXT
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

    /* =====================================================
       CANCELLATION
    ===================================================== */

    cancelledAt: {
      type: Date,
      default: null
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    cancellationReason: {
      type: String,
      default: "",
      maxlength: 2000
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

projectBuildSchema.index({
  projectId: 1,
  createdAt: -1
});

projectBuildSchema.index({
  projectId: 1,
  buildNumber: -1
});

projectBuildSchema.index({
  projectId: 1,
  status: 1,
  createdAt: -1
});

projectBuildSchema.index({
  projectId: 1,
  trigger: 1,
  createdAt: -1
});

projectBuildSchema.index({
  projectId: 1,
  commitId: 1
});

projectBuildSchema.index({
  projectId: 1,
  sourceVersionId: 1
});

/* =========================================================
   VALIDATION
========================================================= */

projectBuildSchema.pre(
  "validate",
  function (next) {

    if (
      this.status === "running" &&
      !this.startedAt
    ) {
      this.startedAt = new Date();
    }

    if (
      ["success", "failed", "cancelled"].includes(
        this.status
      ) &&
      !this.completedAt
    ) {
      this.completedAt = new Date();
    }

    if (
      this.status === "cancelled" &&
      !this.cancelledAt
    ) {
      this.cancelledAt = new Date();
    }

    if (
      this.status === "failed" &&
      !this.errorMessage &&
      this.errors.length === 0
    ) {
      return next(
        new Error(
          "Failed build requires error information"
        )
      );
    }

    next();
  }
);

/* =========================================================
   PRE SAVE
========================================================= */

projectBuildSchema.pre(
  "save",
  function (next) {

    this.artifactCount =
      Array.isArray(this.artifacts)
        ? this.artifacts.length
        : 0;

    if (
      this.startedAt &&
      this.completedAt
    ) {
      this.durationMs =
        Math.max(
          0,
          this.completedAt.getTime() -
          this.startedAt.getTime()
        );
    }

    next();
  }
);

/* =========================================================
   MODEL
========================================================= */

const ProjectBuild =
  mongoose.models.ProjectBuild ||
  mongoose.model(
    "ProjectBuild",
    projectBuildSchema
  );

/* =========================================================
   EXPORT
========================================================= */

module.exports = ProjectBuild;
