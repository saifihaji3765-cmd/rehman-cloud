const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT VERSION MODEL
   Enterprise Project Versioning / Snapshots / Restore
   ========================================================= */

/* =========================================================
   VERSION FILE SNAPSHOT
   ========================================================= */

const versionFileSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    type: {
      type: String,
      default: "file",
      trim: true,
      maxlength: 100
    },

    language: {
      type: String,
      default: "",
      trim: true,
      maxlength: 50
    },

    content: {
      type: String,
      default: ""
    },

    size: {
      type: Number,
      default: 0,
      min: 0
    },

    hash: {
      type: String,
      default: "",
      maxlength: 128
    },

    isEntryPoint: {
      type: Boolean,
      default: false
    },

    isGenerated: {
      type: Boolean,
      default: true
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   PROJECT VERSION SCHEMA
   ========================================================= */

const projectVersionSchema = new mongoose.Schema(
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
       VERSION NUMBER
       ===================================================== */

    versionNumber: {
      type: Number,
      required: true,
      min: 1,
      index: true
    },

    /* =====================================================
       VERSION LABEL
       ===================================================== */

    name: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: ""
    },

    /* =====================================================
       VERSION TYPE
       ===================================================== */

    type: {
      type: String,
      enum: [
        "manual",
        "auto",
        "build",
        "deployment",
        "restore",
        "ai"
      ],
      default: "manual",
      index: true
    },

    /* =====================================================
       CREATOR
       ===================================================== */

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    /* =====================================================
       PROJECT SNAPSHOT
       ===================================================== */

    projectName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ""
    },

    projectDescription: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: ""
    },

    framework: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },

    /* =====================================================
       FILE SNAPSHOT
       ===================================================== */

    files: {
      type: [versionFileSchema],
      default: []
    },

    fileCount: {
      type: Number,
      default: 0,
      min: 0
    },

    totalSize: {
      type: Number,
      default: 0,
      min: 0
    },

    /* =====================================================
       SOURCE INFORMATION
       ===================================================== */

    sourceVersion: {
      type: Number,
      default: null,
      min: 1
    },

    parentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectVersion",
      default: null,
      index: true
    },

    /* =====================================================
       BUILD REFERENCE
       ===================================================== */

    buildId: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
      index: true
    },

    buildStatus: {
      type: String,
      enum: [
        "unknown",
        "idle",
        "queued",
        "building",
        "success",
        "failed"
      ],
      default: "unknown"
    },

    /* =====================================================
       DEPLOYMENT REFERENCE
       ===================================================== */

    deploymentId: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
      index: true
    },

    deploymentStatus: {
      type: String,
      enum: [
        "unknown",
        "queued",
        "building",
        "deploying",
        "deployed",
        "failed",
        "cancelled"
      ],
      default: "unknown"
    },

    /* =====================================================
       AI INFORMATION
       ===================================================== */

    aiGenerated: {
      type: Boolean,
      default: false
    },

    aiModel: {
      type: String,
      trim: true,
      maxlength: 150,
      default: ""
    },

    aiPrompt: {
      type: String,
      maxlength: 10000,
      default: ""
    },

    /* =====================================================
       CHANGE SUMMARY
       ===================================================== */

    changeSummary: {
      addedFiles: {
        type: Number,
        default: 0,
        min: 0
      },

      modifiedFiles: {
        type: Number,
        default: 0,
        min: 0
      },

      deletedFiles: {
        type: Number,
        default: 0,
        min: 0
      },

      unchangedFiles: {
        type: Number,
        default: 0,
        min: 0
      }
    },

    /* =====================================================
       RESTORE INFORMATION
       ===================================================== */

    isRestored: {
      type: Boolean,
      default: false,
      index: true
    },

    restoredFromVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectVersion",
      default: null
    },

    restoredAt: {
      type: Date,
      default: null
    },

    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    /* =====================================================
       VERSION STATE
       ===================================================== */

    status: {
      type: String,
      enum: [
        "active",
        "superseded",
        "archived"
      ],
      default: "active",
      index: true
    },

    /* =====================================================
       IMMUTABILITY
       ===================================================== */

    immutable: {
      type: Boolean,
      default: true
    },

    /* =====================================================
       INTEGRITY
       ===================================================== */

    snapshotHash: {
      type: String,
      trim: true,
      maxlength: 128,
      default: "",
      index: true
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
    versionKey: false
  }
);

/* =========================================================
   INDEXES
   ========================================================= */

/*
 * Fast version history lookup.
 */

projectVersionSchema.index({
  projectId: 1,
  versionNumber: -1
});

/*
 * Project + status.
 */

projectVersionSchema.index({
  projectId: 1,
  status: 1,
  createdAt: -1
});

/*
 * Project + creator.
 */

projectVersionSchema.index({
  projectId: 1,
  createdBy: 1,
  createdAt: -1
});

/*
 * Build-linked versions.
 */

projectVersionSchema.index({
  projectId: 1,
  buildId: 1
});

/*
 * Deployment-linked versions.
 */

projectVersionSchema.index({
  projectId: 1,
  deploymentId: 1
});

/*
 * Parent/child version chain.
 */

projectVersionSchema.index({
 parentVersionId: 1
});

/* =========================================================
   UNIQUE VERSION NUMBER
   ========================================================= */

projectVersionSchema.index(
  {
    projectId: 1,
    versionNumber: 1
  },
  {
    unique: true
  }
);

/* =========================================================
   PRE VALIDATION
   ========================================================= */

projectVersionSchema.pre(
  "validate",
  function (next) {
    this.fileCount = Array.isArray(this.files)
      ? this.files.length
      : 0;

    this.totalSize = Array.isArray(this.files)
      ? this.files.reduce(
          (total, file) =>
            total +
            (Number(file.size) || 0),
          0
        )
      : 0;

    next();
  }
);

/* =========================================================
   MODEL
   ========================================================= */

const ProjectVersion =
  mongoose.models.ProjectVersion ||
  mongoose.model(
    "ProjectVersion",
    projectVersionSchema
  );

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = ProjectVersion;
