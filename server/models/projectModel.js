const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT MODEL
   Enterprise Project Source of Truth
   ========================================================= */

/* =========================================================
   PROJECT FILE SCHEMA
   ========================================================= */

const projectFileSchema = new mongoose.Schema(
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
   DEPLOYMENT HISTORY
   ========================================================= */

const deploymentSchema = new mongoose.Schema(
  {
    deploymentId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    provider: {
      type: String,
      enum: [
        "AWS",
        "Docker",
        "Vercel",
        "Render",
        "Other"
      ],
      default: "AWS"
    },

    status: {
      type: String,
      enum: [
        "queued",
        "building",
        "deploying",
        "deployed",
        "failed",
        "cancelled"
      ],
      default: "queued"
    },

    url: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 2000
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   BUILD INFORMATION
   ========================================================= */

const buildSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "idle",
        "queued",
        "building",
        "success",
        "failed"
      ],
      default: "idle"
    },

    buildId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 2000
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   PROJECT SCHEMA
   ========================================================= */

const projectSchema = new mongoose.Schema(
  {
    /* =====================================================
       OWNER
       ===================================================== */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /* =====================================================
       BASIC PROJECT INFORMATION
       ===================================================== */

    projectName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 160,
      default: ""
    },

    description: {
      type: String,
      default: "",
      maxlength: 5000
    },

    /* =====================================================
       PROJECT STATUS
       ===================================================== */

    status: {
      type: String,
      enum: [
        "draft",
        "building",
        "deploying",
        "deployed",
        "failed",
        "stopped",
        "archived"
      ],
      default: "draft",
      index: true
    },

    /* =====================================================
       FRAMEWORK
       ===================================================== */

    framework: {
      type: String,
      enum: [
        "React",
        "Next.js",
        "Vue",
        "Node.js",
        "Express",
        "Other"
      ],
      default: "Node.js"
    },

    version: {
      type: Number,
      default: 1,
      min: 1
    },

    /* =====================================================
       AI BUILD INFORMATION
       ===================================================== */

    aiGenerated: {
      type: Boolean,
      default: true
    },

    aiFrameworkSuggestion: {
      type: String,
      default: "",
      maxlength: 100
    },

    lastBuildPrompt: {
      type: String,
      default: "",
      maxlength: 10000
    },

    aiModel: {
      type: String,
      default: "",
      maxlength: 150
    },

    /* =====================================================
       PROJECT FILES
       ===================================================== */

    files: {
      type: [projectFileSchema],
      default: []
    },

    fileCount: {
      type: Number,
      default: 0,
      min: 0
    },

    /* =====================================================
       BUILD
       ===================================================== */

    build: {
      type: buildSchema,
      default: () => ({})
    },

    /* =====================================================
       DEPLOYMENT
       ===================================================== */

    deploymentProvider: {
      type: String,
      enum: [
        "AWS",
        "Docker",
        "Vercel",
        "Render",
        "Other"
      ],
      default: "AWS"
    },

    deploymentStatus: {
      type: String,
      enum: [
        "not_deployed",
        "queued",
        "building",
        "deploying",
        "deployed",
        "failed",
        "cancelled"
      ],
      default: "not_deployed",
      index: true
    },

    domain: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    repositoryUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    deploymentUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    liveUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    deploymentId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    deploymentHistory: {
      type: [deploymentSchema],
      default: []
    },

    /* =====================================================
       RESOURCE CONFIGURATION
       ===================================================== */

    resources: {
      ram: {
        type: String,
        default: "2GB"
      },

      cpu: {
        type: String,
        default: "1 vCPU"
      },

      storage: {
        type: String,
        default: "25GB"
      }
    },

    /* =====================================================
       LEGACY COMPATIBILITY
       ===================================================== */

    ram: {
      type: String,
      default: "2GB"
    },

    cpu: {
      type: String,
      default: "1 vCPU"
    },

    storage: {
      type: String,
      default: "25GB"
    },

    /* =====================================================
       ACTIVITY
       ===================================================== */

    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    /* =====================================================
       SOFT DELETE
       ===================================================== */

    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },

    archivedAt: {
      type: Date,
      default: null
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

projectSchema.index({
  userId: 1,
  createdAt: -1
});

projectSchema.index({
  userId: 1,
  isArchived: 1,
  updatedAt: -1
});

projectSchema.index({
  userId: 1,
  projectName: 1
});

/* =========================================================
   PRE SAVE
   ========================================================= */

projectSchema.pre("save", function (next) {
  this.fileCount = Array.isArray(this.files)
    ? this.files.length
    : 0;

  this.lastActivityAt = new Date();

  next();
});

/* =========================================================
   MODEL
   ========================================================= */

const Project =
  mongoose.models.Project ||
  mongoose.model("Project", projectSchema);

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = Project;
