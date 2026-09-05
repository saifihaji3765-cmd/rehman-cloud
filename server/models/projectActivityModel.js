const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT ACTIVITY MODEL
   Enterprise Project Activity / Audit Source
   ========================================================= */

/* =========================================================
   METADATA SCHEMA
========================================================= */

const metadataSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ""
    },

    correlationId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ""
    },

    ipAddress: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    source: {
      type: String,
      enum: [
        "web",
        "api",
        "agent",
        "system",
        "automation",
        "cli",
        "unknown"
      ],
      default: "unknown"
    },

    endpoint: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },

    method: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
      default: ""
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   CHANGE SCHEMA
========================================================= */

const changeSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      trim: true,
      maxlength: 300,
      required: true
    },

    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   PROJECT ACTIVITY SCHEMA
========================================================= */

const projectActivitySchema = new mongoose.Schema(
  {
    /* =====================================================
       PROJECT REFERENCE
    ===================================================== */

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true
    },

    /* =====================================================
       ACTOR
    ===================================================== */

    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    actorType: {
      type: String,
      enum: [
        "user",
        "agent",
        "system",
        "automation"
      ],
      default: "user",
      index: true
    },

    /* =====================================================
       ACTION
    ===================================================== */

    action: {
      type: String,
      enum: [
        "project_created",
        "project_updated",
        "project_archived",

        "file_created",
        "file_updated",
        "file_deleted",

        "settings_created",
        "settings_updated",

        "environment_created",
        "environment_updated",
        "environment_deleted",

        "build_queued",
        "build_started",
        "build_completed",
        "build_failed",

        "deployment_queued",
        "deployment_started",
        "deployment_completed",
        "deployment_failed",
        "deployment_cancelled",

        "member_added",
        "member_updated",
        "member_removed",

        "version_created",
        "version_restored",

        "security_event",
        "project_accessed",
        "other"
      ],
      default: "other",
      index: true
    },

    /* =====================================================
       RESOURCE
    ===================================================== */

    resourceType: {
      type: String,
      enum: [
        "project",
        "file",
        "settings",
        "environment",
        "build",
        "deployment",
        "member",
        "version",
        "system"
      ],
      default: "project",
      index: true
    },

    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },

    /* =====================================================
       ACTIVITY DESCRIPTION
    ===================================================== */

    message: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    /* =====================================================
       CHANGES
    ===================================================== */

    changes: {
      type: [changeSchema],
      default: []
    },

    /* =====================================================
       RELATED OPERATIONS
    ===================================================== */

    buildId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ""
    },

    deploymentId: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    /* =====================================================
       REQUEST / TRACE INFORMATION
    ===================================================== */

    metadata: {
      type: metadataSchema,
      default: () => ({})
    },

    /* =====================================================
       RESULT
    ===================================================== */

    status: {
      type: String,
      enum: [
        "success",
        "failed",
        "pending"
      ],
      default: "success",
      index: true
    },

    errorCode: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    errorMessage: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    /* =====================================================
       TIMESTAMP
    ===================================================== */

    occurredAt: {
      type: Date,
      default: Date.now,
      index: true
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

/* Project activity timeline */

projectActivitySchema.index({
  projectId: 1,
  occurredAt: -1
});

/* Actor activity */

projectActivitySchema.index({
  projectId: 1,
  actorId: 1,
  occurredAt: -1
});

/* Action filtering */

projectActivitySchema.index({
  projectId: 1,
  action: 1,
  occurredAt: -1
});

/* Resource history */

projectActivitySchema.index({
  projectId: 1,
  resourceType: 1,
  resourceId: 1,
  occurredAt: -1
});

/* Build/deployment tracing */

projectActivitySchema.index({
  projectId: 1,
  buildId: 1,
  occurredAt: -1
});

projectActivitySchema.index({
  projectId: 1,
  deploymentId: 1,
  occurredAt: -1
});

/* =========================================================
   DATA VALIDATION
========================================================= */

projectActivitySchema.pre(
  "validate",
  function (next) {

    if (
      this.actorType === "user" &&
      !this.actorId
    ) {
      return next(
        new Error(
          "actorId is required for user activity"
        )
      );
    }

    if (
      this.status === "failed" &&
      !this.errorMessage
    ) {
      return next(
        new Error(
          "errorMessage is required for failed activity"
        )
      );
    }

    next();
  }
);

/* =========================================================
   MODEL
========================================================= */

const ProjectActivity =
  mongoose.models.ProjectActivity ||
  mongoose.model(
    "ProjectActivity",
    projectActivitySchema
  );

/* =========================================================
   EXPORT
========================================================= */

module.exports = ProjectActivity;
