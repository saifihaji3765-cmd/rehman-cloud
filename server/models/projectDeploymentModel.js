const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT DEPLOYMENT MODEL
   Enterprise Deployment / Release Source of Truth
   ========================================================= */

/* =========================================================
   PROVIDER RESPONSE SCHEMA
========================================================= */

const providerResponseSchema = new mongoose.Schema(
  {
    providerDeploymentId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    providerStatus: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },

    providerRegion: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },

    providerProjectId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    providerUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   DEPLOYMENT ERROR SCHEMA
========================================================= */

const deploymentErrorSchema = new mongoose.Schema(
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
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   PROJECT DEPLOYMENT SCHEMA
========================================================= */

const projectDeploymentSchema = new mongoose.Schema(
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
       DEPLOYMENT IDENTITY
    ===================================================== */

    deploymentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 500
    },

    deploymentNumber: {
      type: Number,
      required: true,
      min: 1
    },

    /* =====================================================
       PROVIDER
    ===================================================== */

    provider: {
      type: String,
      enum: [
        "AWS",
        "Docker",
        "Vercel",
        "Render",
        "Other"
      ],
      required: true,
      index: true
    },

    providerAccountId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    region: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },

    /* =====================================================
       DEPLOYMENT STATUS
    ===================================================== */

    status: {
      type: String,
      enum: [
        "queued",
        "building",
        "deploying",
        "deployed",
        "failed",
        "cancelled",
        "rolled_back"
      ],
      default: "queued",
      index: true
    },

    /* =====================================================
       TRIGGER
    ===================================================== */

    trigger: {
      type: String,
      enum: [
        "manual",
        "build",
        "project_create",
        "version_restore",
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

    buildId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
      index: true
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },

    commitId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
      index: true
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

    /* =====================================================
       TARGET
    ===================================================== */

    target: {
      type: String,
      enum: [
        "production",
        "staging",
        "preview",
        "development",
        "custom"
      ],
      default: "production",
      index: true
    },

    domain: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    deploymentUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    /* =====================================================
       RUNTIME
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

    containerImage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
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
       PROVIDER RESULT
    ===================================================== */

    providerResponse: {
      type: providerResponseSchema,
      default: () => ({})
    },

    /* =====================================================
       ERROR INFORMATION
    ===================================================== */

    errors: {
      type: [deploymentErrorSchema],
      default: []
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 4000
    },

    /* =====================================================
       ROLLBACK
    ===================================================== */

    rollback: {
      isRollback: {
        type: Boolean,
        default: false
      },

      sourceDeploymentId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 500
      },

      reason: {
        type: String,
        default: "",
        maxlength: 2000
      },

      rolledBackAt: {
        type: Date,
        default: null
      },

      rolledBackBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      }
    },

    /* =====================================================
       LOGGING
    ===================================================== */

    logStreamId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    /* =====================================================
       AI / AUTOMATION
    ===================================================== */

    initiatedByAgent: {
      type: Boolean,
      default: false
    },

    agentId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
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

projectDeploymentSchema.index({
  projectId: 1,
  createdAt: -1
});

projectDeploymentSchema.index({
  projectId: 1,
  deploymentNumber: -1
});

projectDeploymentSchema.index({
  projectId: 1,
  status: 1,
  createdAt: -1
});

projectDeploymentSchema.index({
  projectId: 1,
  provider: 1,
  createdAt: -1
});

projectDeploymentSchema.index({
  projectId: 1,
  target: 1,
  createdAt: -1
});

projectDeploymentSchema.index({
  projectId: 1,
  buildId: 1
});

projectDeploymentSchema.index({
  projectId: 1,
  commitId: 1
});

projectDeploymentSchema.index({
  projectId: 1,
  versionId: 1
});

/* =========================================================
   VALIDATION
========================================================= */

projectDeploymentSchema.pre(
  "validate",
  function (next) {

    if (
      this.status === "deploying" &&
      !this.startedAt
    ) {
      this.startedAt = new Date();
    }

    if (
      [
        "deployed",
        "failed",
        "cancelled",
        "rolled_back"
      ].includes(this.status) &&
      !this.completedAt
    ) {
      this.completedAt = new Date();
    }

    if (
      this.status === "failed" &&
      !this.errorMessage &&
      this.errors.length === 0
    ) {
      return next(
        new Error(
          "Failed deployment requires error information"
        )
      );
    }

    if (
      this.rollback?.isRollback &&
      !this.rollback.sourceDeploymentId
    ) {
      return next(
        new Error(
          "Rollback deployment requires source deployment ID"
        )
      );
    }

    next();
  }
);

/* =========================================================
   PRE SAVE
========================================================= */

projectDeploymentSchema.pre(
  "save",
  function (next) {

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

const ProjectDeployment =
  mongoose.models.ProjectDeployment ||
  mongoose.model(
    "ProjectDeployment",
    projectDeploymentSchema
  );

/* =========================================================
   EXPORT
========================================================= */

module.exports = ProjectDeployment;
