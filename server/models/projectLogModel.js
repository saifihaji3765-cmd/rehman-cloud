const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT LOG MODEL
   Enterprise Project Logging / Observability
   ========================================================= */

/* =========================================================
   PROJECT LOG SCHEMA
   ========================================================= */

const projectLogSchema = new mongoose.Schema(
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

    /* =====================================================
       ACTOR / USER
       ===================================================== */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    /* =====================================================
       LOG LEVEL
       ===================================================== */

    level: {
      type: String,
      enum: [
        "debug",
        "info",
        "notice",
        "warning",
        "error",
        "critical"
      ],
      default: "info",
      index: true
    },

    /* =====================================================
       LOG SOURCE
       ===================================================== */

    source: {
      type: String,
      enum: [
        "system",
        "project",
        "build",
        "deployment",
        "runtime",
        "agent",
        "ai",
        "api",
        "database",
        "security",
        "integration",
        "other"
      ],
      default: "system",
      index: true
    },

    /* =====================================================
       EVENT TYPE
       ===================================================== */

    eventType: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "system.event",
      index: true
    },

    /* =====================================================
       MESSAGE
       ===================================================== */

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000
    },

    /* =====================================================
       BUILD / DEPLOYMENT REFERENCES
       ===================================================== */

    buildId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
      index: true
    },

    deploymentId: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
      index: true
    },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectVersion",
      default: null,
      index: true
    },

    /* =====================================================
       AGENT INFORMATION
       ===================================================== */

    agentId: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    agentName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    /* =====================================================
       REQUEST / CORRELATION
       ===================================================== */

    requestId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
      index: true
    },

    correlationId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
      index: true
    },

    traceId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
      index: true
    },

    /* =====================================================
       ERROR INFORMATION
       ===================================================== */

    error: {
      name: {
        type: String,
        default: "",
        maxlength: 300
      },

      code: {
        type: String,
        default: "",
        maxlength: 150
      },

      message: {
        type: String,
        default: "",
        maxlength: 5000
      },

      stack: {
        type: String,
        default: "",
        maxlength: 20000
      }
    },

    /* =====================================================
       METADATA
       ===================================================== */

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    /* =====================================================
       REQUEST CONTEXT
       ===================================================== */

    request: {
      method: {
        type: String,
        default: "",
        maxlength: 20
      },

      path: {
        type: String,
        default: "",
        maxlength: 2000
      },

      statusCode: {
        type: Number,
        default: null
      },

      durationMs: {
        type: Number,
        default: null,
        min: 0
      }
    },

    /* =====================================================
       ENVIRONMENT
       ===================================================== */

    environment: {
      type: String,
      enum: [
        "development",
        "staging",
        "production",
        "test",
        "unknown"
      ],
      default: "unknown",
      index: true
    },

    /* =====================================================
       SERVICE / COMPONENT
       ===================================================== */

    service: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    component: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    /* =====================================================
       HOST / INSTANCE
       ===================================================== */

    host: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },

    instanceId: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },

    /* =====================================================
       LOG TIMESTAMP
       ===================================================== */

    occurredAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    /* =====================================================
       RETENTION
       ===================================================== */

    expiresAt: {
      type: Date,
      default: null,
      index: true
    }
  },

  {
    timestamps: true,
    versionKey: false
  }
);

/* =========================================================
   INDEXES
   ========================================================= */

/* Project logs newest first */
projectLogSchema.index({
  projectId: 1,
  occurredAt: -1
});

/* Project + level filtering */
projectLogSchema.index({
  projectId: 1,
  level: 1,
  occurredAt: -1
});

/* Project + source filtering */
projectLogSchema.index({
  projectId: 1,
  source: 1,
  occurredAt: -1
});

/* Build logs */
projectLogSchema.index({
  projectId: 1,
  buildId: 1,
  occurredAt: -1
});

/* Deployment logs */
projectLogSchema.index({
  projectId: 1,
  deploymentId: 1,
  occurredAt: -1
});

/* Correlation / tracing */
projectLogSchema.index({
  correlationId: 1,
  occurredAt: -1
});

projectLogSchema.index({
  traceId: 1,
  occurredAt: -1
});

/* =========================================================
   TTL INDEX
   ========================================================= */

/*
 * Logs can optionally expire automatically when
 * expiresAt is explicitly populated.
 *
 * expireAfterSeconds: 0 means MongoDB removes the
 * document once expiresAt is reached.
 */

projectLogSchema.index(
  {
    expiresAt: 1
  },
  {
    expireAfterSeconds: 0,
    sparse: true
  }
);

/* =========================================================
   MODEL
   ========================================================= */

const ProjectLog =
  mongoose.models.ProjectLog ||
  mongoose.model(
    "ProjectLog",
    projectLogSchema
  );

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = ProjectLog;
