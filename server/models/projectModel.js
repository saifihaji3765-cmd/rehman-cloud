const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT MODEL
   Enterprise Project Source of Truth
   ========================================================= */

/* =========================================================
   ENUMS
   ========================================================= */

const PROJECT_STATUSES = [
  "draft",
  "building",
  "deploying",
  "deployed",
  "failed",
  "stopped",
  "archived"
];

const DEPLOYMENT_PROVIDERS = [
  "AWS",
  "Docker",
  "Vercel",
  "Render",
  "Other"
];

const FRAMEWORKS = [
  "React",
  "Next.js",
  "Vue",
  "Node.js",
  "Express",
  "Other"
];

/* =========================================================
   PROJECT FILE
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
    },

    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   PROJECT SETTINGS
   ========================================================= */

const projectSettingsSchema = new mongoose.Schema(
  {
    visibility: {
      type: String,
      enum: [
        "private",
        "team"
      ],
      default: "private"
    },

    autoBuild: {
      type: Boolean,
      default: true
    },

    autoDeploy: {
      type: Boolean,
      default: false
    },

    previewEnabled: {
      type: Boolean,
      default: true
    },

    analyticsEnabled: {
      type: Boolean,
      default: true
    },

    notificationsEnabled: {
      type: Boolean,
      default: true
    },

    productionProtection: {
      type: Boolean,
      default: true
    },

    requireApprovalForDeployment: {
      type: Boolean,
      default: false
    },

    defaultBranch: {
      type: String,
      default: "main",
      trim: true,
      maxlength: 200
    },

    timezone: {
      type: String,
      default: "UTC",
      trim: true,
      maxlength: 100
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   ENVIRONMENT
   ========================================================= */

/*
 * IMPORTANT:
 * Actual secret values should NOT be stored here.
 * This schema stores configuration/metadata only.
 */

const environmentVariableSchema =
  new mongoose.Schema(
    {
      key: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
      },

      isSecret: {
        type: Boolean,
        default: true
      },

      isConfigured: {
        type: Boolean,
        default: false
      },

      secretReference: {
        type: String,
        default: "",
        trim: true,
        maxlength: 500
      }
    },
    {
      _id: false
    }
  );

const environmentSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        enum: [
          "development",
          "preview",
          "production"
        ],
        required: true
      },

      branch: {
        type: String,
        default: "",
        trim: true,
        maxlength: 200
      },

      variables: {
        type: [environmentVariableSchema],
        default: []
      },

      deploymentId: {
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

      status: {
        type: String,
        enum: [
          "inactive",
          "ready",
          "building",
          "deploying",
          "deployed",
          "failed"
        ],
        default: "inactive"
      },

      lastDeployedAt: {
        type: Date,
        default: null
      }
    },
    {
      _id: false
    }
  );

/* =========================================================
   BUILD HISTORY
   ========================================================= */

const buildHistorySchema =
  new mongoose.Schema(
    {
      buildId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300
      },

      status: {
        type: String,
        enum: [
          "queued",
          "building",
          "success",
          "failed",
          "cancelled"
        ],
        default: "queued"
      },

      trigger: {
        type: String,
        enum: [
          "manual",
          "ai",
          "commit",
          "deployment",
          "system"
        ],
        default: "manual"
      },

      prompt: {
        type: String,
        default: "",
        maxlength: 10000
      },

      commitHash: {
        type: String,
        default: "",
        maxlength: 200
      },

      framework: {
        type: String,
        default: ""
      },

      durationMs: {
        type: Number,
        default: 0,
        min: 0
      },

      errorMessage: {
        type: String,
        default: "",
        maxlength: 5000
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
      _id: true
    }
  );

/* =========================================================
   CURRENT BUILD
   ========================================================= */

const buildSchema =
  new mongoose.Schema(
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
   DEPLOYMENT HISTORY
   ========================================================= */

const deploymentSchema =
  new mongoose.Schema(
    {
      deploymentId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300
      },

      provider: {
        type: String,
        enum: DEPLOYMENT_PROVIDERS,
        default: "AWS"
      },

      environment: {
        type: String,
        enum: [
          "development",
          "preview",
          "production"
        ],
        default: "production"
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

      commitHash: {
        type: String,
        default: "",
        maxlength: 200
      },

      version: {
        type: Number,
        default: 1,
        min: 1
      },

      durationMs: {
        type: Number,
        default: 0,
        min: 0
      },

      errorMessage: {
        type: String,
        default: "",
        maxlength: 5000
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
      _id: true
    }
  );

/* =========================================================
   PROJECT MEMBERS
   ========================================================= */

const projectMemberSchema =
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },

      role: {
        type: String,
        enum: [
          "owner",
          "admin",
          "developer",
          "viewer"
        ],
        default: "viewer"
      },

      status: {
        type: String,
        enum: [
          "active",
          "invited",
          "suspended"
        ],
        default: "active"
      },

      invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      joinedAt: {
        type: Date,
        default: null
      },

      lastActiveAt: {
        type: Date,
        default: null
      }
    },
    {
      _id: true,
      timestamps: true
    }
  );

/* =========================================================
   PROJECT ACTIVITY
   ========================================================= */

const projectActivitySchema =
  new mongoose.Schema(
    {
      actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      type: {
        type: String,
        enum: [
          "project_created",
          "project_updated",
          "project_archived",
          "project_restored",
          "file_created",
          "file_updated",
          "file_deleted",
          "build_started",
          "build_completed",
          "deployment_started",
          "deployment_completed",
          "deployment_failed",
          "member_added",
          "member_removed",
          "settings_updated",
          "environment_updated",
          "version_created",
          "system"
        ],
        default: "system"
      },

      message: {
        type: String,
        required: true,
        maxlength: 2000
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      },

      ipAddress: {
        type: String,
        default: "",
        maxlength: 100
      },

      userAgent: {
        type: String,
        default: "",
        maxlength: 1000
      }
    },
    {
      _id: true,
      timestamps: true
    }
  );

/* =========================================================
   PROJECT LOGS
   ========================================================= */

const projectLogSchema =
  new mongoose.Schema(
    {
      level: {
        type: String,
        enum: [
          "debug",
          "info",
          "warn",
          "error"
        ],
        default: "info"
      },

      source: {
        type: String,
        enum: [
          "system",
          "build",
          "deployment",
          "runtime",
          "api",
          "ai"
        ],
        default: "system"
      },

      message: {
        type: String,
        required: true,
        maxlength: 10000
      },

      buildId: {
        type: String,
        default: "",
        maxlength: 300
      },

      deploymentId: {
        type: String,
        default: "",
        maxlength: 300
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      },

      timestamp: {
        type: Date,
        default: Date.now,
        index: true
      }
    },
    {
      _id: true
    }
  );

/* =========================================================
   PROJECT VERSIONS
   ========================================================= */

const projectVersionSchema =
  new mongoose.Schema(
    {
      version: {
        type: Number,
        required: true,
        min: 1
      },

      label: {
        type: String,
        default: "",
        trim: true,
        maxlength: 200
      },

      description: {
        type: String,
        default: "",
        maxlength: 5000
      },

      source: {
        type: String,
        enum: [
          "ai",
          "manual",
          "deployment",
          "restore",
          "system"
        ],
        default: "manual"
      },

      buildId: {
        type: String,
        default: "",
        maxlength: 300
      },

      commitHash: {
        type: String,
        default: "",
        maxlength: 200
      },

      fileCount: {
        type: Number,
        default: 0,
        min: 0
      },

      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      createdAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );

/* =========================================================
   RESOURCE CONFIGURATION
   ========================================================= */

const resourceSchema =
  new mongoose.Schema(
    {
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
    {
      _id: false
    }
  );

/* =========================================================
   PROJECT SCHEMA
   ========================================================= */

const projectSchema =
  new mongoose.Schema(
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
         BASIC INFORMATION
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
         STATUS
         ===================================================== */

      status: {
        type: String,
        enum: PROJECT_STATUSES,
        default: "draft",
        index: true
      },

      /* =====================================================
         FRAMEWORK
         ===================================================== */

      framework: {
        type: String,
        enum: FRAMEWORKS,
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
         FILES
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
         SETTINGS
         ===================================================== */

      settings: {
        type: projectSettingsSchema,
        default: () => ({})
      },

      /* =====================================================
         ENVIRONMENTS
         ===================================================== */

      environments: {
        type: [environmentSchema],
        default: () => [
          {
            name: "development",
            status: "ready"
          },
          {
            name: "preview",
            status: "inactive"
          },
          {
            name: "production",
            status: "inactive"
          }
        ]
      },

      /* =====================================================
         CURRENT BUILD
         ===================================================== */

      build: {
        type: buildSchema,
        default: () => ({})
      },

      /* =====================================================
         BUILD HISTORY
         ===================================================== */

      buildHistory: {
        type: [buildHistorySchema],
        default: []
      },

      /* =====================================================
         DEPLOYMENT
         ===================================================== */

      deploymentProvider: {
        type: String,
        enum: DEPLOYMENT_PROVIDERS,
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
         MEMBERS
         ===================================================== */

      members: {
        type: [projectMemberSchema],
        default: []
      },

      /* =====================================================
         ACTIVITY
         ===================================================== */

      activity: {
        type: [projectActivitySchema],
        default: []
      },

      /* =====================================================
         LOGS
         ===================================================== */

      logs: {
        type: [projectLogSchema],
        default: []
      },

      /* =====================================================
         VERSIONS
         ===================================================== */

      versions: {
        type: [projectVersionSchema],
        default: []
      },

      /* =====================================================
         RESOURCES
         ===================================================== */

      resources: {
        type: resourceSchema,
        default: () => ({})
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
         ACTIVITY TRACKING
         ===================================================== */

      lastActivityAt: {
        type: Date,
        default: Date.now,
        index: true
      },

      /* =====================================================
         ARCHIVE
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

projectSchema.index({
  userId: 1,
  status: 1,
  lastActivityAt: -1
});

projectSchema.index({
  "members.userId": 1
});

projectSchema.index({
  "activity.createdAt": -1
});

projectSchema.index({
  "logs.timestamp": -1
});

projectSchema.index({
  "versions.version": -1
});

/* =========================================================
   PRE SAVE
   ========================================================= */

projectSchema.pre("save", function (next) {
  this.fileCount = Array.isArray(this.files)
    ? this.files.filter(
        (file) => !file.isDeleted
      ).length
    : 0;

  this.lastActivityAt = new Date();

  next();
});

/* =========================================================
   MODEL
   ========================================================= */

const Project =
  mongoose.models.Project ||
  mongoose.model(
    "Project",
    projectSchema
  );

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = Project;
