const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT SETTINGS MODEL
   Enterprise Project Configuration Source
   ========================================================= */

/* =========================================================
   BUILD SETTINGS
========================================================= */

const buildSettingsSchema = new mongoose.Schema(
  {
    command: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },

    installCommand: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },

    outputDirectory: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },

    nodeVersion: {
      type: String,
      trim: true,
      maxlength: 50,
      default: ""
    },

    packageManager: {
      type: String,
      enum: [
        "npm",
        "yarn",
        "pnpm",
        "bun",
        "other"
      ],
      default: "npm"
    },

    autoBuild: {
      type: Boolean,
      default: true
    },

    autoDeploy: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   DEPLOYMENT SETTINGS
========================================================= */

const deploymentSettingsSchema =
  new mongoose.Schema(
    {
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

      region: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },

      environment: {
        type: String,
        enum: [
          "development",
          "staging",
          "production"
        ],
        default: "development"
      },

      branch: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      },

      rootDirectory: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
      },

      healthCheckPath: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
      },

      customDomain: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ""
      },

      automaticDeployments: {
        type: Boolean,
        default: false
      }
    },
    {
      _id: false
    }
  );

/* =========================================================
   RESOURCE SETTINGS
========================================================= */

const resourceSettingsSchema =
  new mongoose.Schema(
    {
      cpu: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },

      memory: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },

      storage: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ""
      },

      replicas: {
        type: Number,
        min: 0,
        max: 1000,
        default: 1
      },

      autoScaling: {
        enabled: {
          type: Boolean,
          default: false
        },

        minReplicas: {
          type: Number,
          min: 0,
          max: 1000,
          default: 1
        },

        maxReplicas: {
          type: Number,
          min: 1,
          max: 1000,
          default: 1
        }
      }
    },
    {
      _id: false
    }
  );

/* =========================================================
   SECURITY SETTINGS
========================================================= */

const securitySettingsSchema =
  new mongoose.Schema(
    {
      publicAccess: {
        type: Boolean,
        default: false
      },

      requireAuthentication: {
        type: Boolean,
        default: true
      },

      allowIndexing: {
        type: Boolean,
        default: false
      },

      enforceHttps: {
        type: Boolean,
        default: true
      },

      ipAllowlistEnabled: {
        type: Boolean,
        default: false
      },

      allowedIps: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 100
          }
        ],
        default: []
      }
    },
    {
      _id: false
    }
  );

/* =========================================================
   GIT SETTINGS
========================================================= */

const gitSettingsSchema =
  new mongoose.Schema(
    {
      repositoryUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ""
      },

      provider: {
        type: String,
        enum: [
          "github",
          "gitlab",
          "bitbucket",
          "other"
        ],
        default: "github"
      },

      branch: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ""
      },

      autoSync: {
        type: Boolean,
        default: false
      }
    },
    {
      _id: false
    }
  );

/* =========================================================
   AI SETTINGS
========================================================= */

const aiSettingsSchema =
  new mongoose.Schema(
    {
      enabled: {
        type: Boolean,
        default: true
      },

      model: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ""
      },

      autoCodeGeneration: {
        type: Boolean,
        default: true
      },

      autoBugFixing: {
        type: Boolean,
        default: true
      },

      autoTesting: {
        type: Boolean,
        default: true
      },

      autoOptimization: {
        type: Boolean,
        default: true
      }
    },
    {
      _id: false
    }
  );

/* =========================================================
   NOTIFICATION SETTINGS
========================================================= */

const notificationSettingsSchema =
  new mongoose.Schema(
    {
      buildFailures: {
        type: Boolean,
        default: true
      },

      deploymentFailures: {
        type: Boolean,
        default: true
      },

      deploymentSuccess: {
        type: Boolean,
        default: true
      },

      securityEvents: {
        type: Boolean,
        default: true
      },

      projectActivity: {
        type: Boolean,
        default: true
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
    /* =====================================================
       PROJECT REFERENCE
    ===================================================== */

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true
    },

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
       BUILD
    ===================================================== */

    build: {
      type: buildSettingsSchema,
      default: () => ({})
    },

    /* =====================================================
       DEPLOYMENT
    ===================================================== */

    deployment: {
      type: deploymentSettingsSchema,
      default: () => ({})
    },

    /* =====================================================
       RESOURCES
    ===================================================== */

    resources: {
      type: resourceSettingsSchema,
      default: () => ({})
    },

    /* =====================================================
       SECURITY
    ===================================================== */

    security: {
      type: securitySettingsSchema,
      default: () => ({})
    },

    /* =====================================================
       GIT
    ===================================================== */

    git: {
      type: gitSettingsSchema,
      default: () => ({})
    },

    /* =====================================================
       AI
    ===================================================== */

    ai: {
      type: aiSettingsSchema,
      default: () => ({})
    },

    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    notifications: {
      type: notificationSettingsSchema,
      default: () => ({})
    },

    /* =====================================================
       VERSIONING
    ===================================================== */

    settingsVersion: {
      type: Number,
      min: 1,
      default: 1
    },

    /* =====================================================
       AUDIT
    ===================================================== */

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false
  }
);

/* =========================================================
   INDEXES
========================================================= */

projectSettingsSchema.index({
  projectId: 1
});

projectSettingsSchema.index({
  userId: 1,
  updatedAt: -1
});

/* =========================================================
   VALIDATION
========================================================= */

projectSettingsSchema.pre(
  "validate",
  function (next) {

    if (
      this.resources?.autoScaling
    ) {
      const {
        minReplicas,
        maxReplicas
      } = this.resources.autoScaling;

      if (
        minReplicas > maxReplicas
      ) {
        return next(
          new Error(
            "Minimum replicas cannot exceed maximum replicas"
          )
        );
      }
    }

    next();
  }
);

/* =========================================================
   MODEL
========================================================= */

const ProjectSettings =
  mongoose.models.ProjectSettings ||
  mongoose.model(
    "ProjectSettings",
    projectSettingsSchema
  );

/* =========================================================
   EXPORT
========================================================= */

module.exports = ProjectSettings;
