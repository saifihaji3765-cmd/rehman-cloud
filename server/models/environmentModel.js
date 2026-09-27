/* =========================================================
   ZyrionOS ENVIRONMENT MODEL
   Version: 1.0.0
   =========================================================

   Responsibilities:
   - Store project environments
   - Development / Preview / Production separation
   - Store environment variables
   - Support encrypted secret values
   - Track required/optional variables
   - Track public/non-secret variables
   - Environment versioning
   - Deployment/runtime metadata
   - Environment validation state
   - Audit information
   - Safe lookup by user + project + environment

   IMPORTANT SECURITY RULES:

   1. Secret values MUST NOT be stored as plaintext.
   2. Encryption/decryption belongs to Environment Service.
   3. This model stores encrypted values only.
   4. Secret values must NEVER be returned by normal queries.
   5. Environment variables are NOT project source files.
   6. AI agents must not automatically receive secret values.
   7. Deployment services may explicitly request resolved
      runtime variables through the Environment Service.

========================================================= */

const mongoose = require("mongoose");


/* =========================================================
   ENUMS
========================================================= */

const ENVIRONMENT_NAMES = [
  "development",
  "preview",
  "production"
];


const ENVIRONMENT_STATUSES = [
  "active",
  "inactive",
  "validating",
  "invalid",
  "archived"
];


const VARIABLE_TYPES = [
  "string",
  "number",
  "boolean",
  "json"
];


const VARIABLE_SCOPES = [
  "runtime",
  "build",
  "both"
];


const VALIDATION_STATUSES = [
  "unknown",
  "valid",
  "invalid",
  "pending"
];


/* =========================================================
   ENVIRONMENT VARIABLE SCHEMA
========================================================= */

const environmentVariableSchema =
  new mongoose.Schema(
    {

      /* =====================================================
         VARIABLE KEY
      ===================================================== */

      key: {

        type: String,

        required: true,

        trim: true,

        uppercase: false,

        maxlength: 256

      },


      /* =====================================================
         VALUE STORAGE
      =====================================================

         Plaintext values MUST NOT be stored for secrets.

         The actual encrypted value is written by the
         Environment Service.
      ===================================================== */

      encryptedValue: {

        type: String,

        default: "",

        select: false

      },


      /*
       * Non-secret values may optionally be stored in a
       * separate field.

       * This allows normal public configuration to be
       * returned without decrypting anything.
       */

      plainValue: {

        type: String,

        default: "",

        select: false

      },


      /* =====================================================
         SECRET FLAG
      ===================================================== */

      isSecret: {

        type: Boolean,

        default: false,

        required: true

      },


      /* =====================================================
         REQUIRED VARIABLE
      ===================================================== */

      required: {

        type: Boolean,

        default: false

      },


      /* =====================================================
         VARIABLE TYPE
      ===================================================== */

      type: {

        type: String,

        enum: VARIABLE_TYPES,

        default: "string"

      },


      /* =====================================================
         VARIABLE SCOPE
      =====================================================

         runtime:
           Needed only when application is running.

         build:
           Needed while building.

         both:
           Needed during build and runtime.
      ===================================================== */

      scope: {

        type: String,

        enum: VARIABLE_SCOPES,

        default: "runtime"

      },


      /* =====================================================
         DESCRIPTION
      ===================================================== */

      description: {

        type: String,

        default: "",

        trim: true,

        maxlength: 1000

      },


      /* =====================================================
         VALIDATION
      ===================================================== */

      validationStatus: {

        type: String,

        enum: VALIDATION_STATUSES,

        default: "unknown"

      },


      validationMessage: {

        type: String,

        default: "",

        trim: true,

        maxlength: 2000

      },


      lastValidatedAt: {

        type: Date,

        default: null

      },


      /* =====================================================
         ENABLED STATE
      ===================================================== */

      enabled: {

        type: Boolean,

        default: true

      },


      /* =====================================================
         METADATA
      ===================================================== */

      metadata: {

        source: {

          type: String,

          default: "manual",

          trim: true,

          maxlength: 100

        },

        sourceReference: {

          type: String,

          default: "",

          trim: true,

          maxlength: 500

        }

      }

    },

    {

      _id: true,

      timestamps: true

    }

  );


/* =========================================================
   ENVIRONMENT SCHEMA
========================================================= */

const environmentSchema =
  new mongoose.Schema(
    {

      /* =====================================================
         USER OWNERSHIP
      ===================================================== */

      userId: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true

      },


      /* =====================================================
         PROJECT OWNERSHIP
      ===================================================== */

      projectId: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Project",

        required:
          true,

        index:
          true

      },


      /* =====================================================
         ENVIRONMENT NAME
      ===================================================== */

      name: {

        type: String,

        enum: ENVIRONMENT_NAMES,

        required: true,

        index: true

      },


      /* =====================================================
         DISPLAY NAME
      ===================================================== */

      displayName: {

        type: String,

        default: "",

        trim: true,

        maxlength: 200

      },


      /* =====================================================
         STATUS
      ===================================================== */

      status: {

        type: String,

        enum: ENVIRONMENT_STATUSES,

        default: "active",

        index: true

      },


      /* =====================================================
         ENVIRONMENT VARIABLES
      ===================================================== */

      variables: {

        type:
          [environmentVariableSchema],

        default:
          []

      },


      /* =====================================================
         ENVIRONMENT VERSION
      =====================================================

         Incremented whenever environment configuration
         changes.

         Useful for:
         - deployment tracking
         - cache invalidation
         - rollback
         - audit
      ===================================================== */

      version: {

        type: Number,

        default: 1,

        min: 1

      },


      /* =====================================================
         LAST DEPLOYMENT VERSION
      ===================================================== */

      deployedVersion: {

        type: Number,

        default: 0,

        min: 0

      },


      /* =====================================================
         LAST DEPLOYMENT
      ===================================================== */

      lastDeploymentId: {

        type: String,

        default: "",

        trim: true,

        maxlength: 300

      },


      lastDeployedAt: {

        type: Date,

        default: null

      },


      /* =====================================================
         VALIDATION SUMMARY
      ===================================================== */

      validation: {

        status: {

          type: String,

          enum: VALIDATION_STATUSES,

          default: "unknown"

        },

        requiredVariables:

          {

            type: Number,

            default: 0,

            min: 0

          },

        configuredVariables:

          {

            type: Number,

            default: 0,

            min: 0

          },

        missingVariables:

          {

            type: Number,

            default: 0,

            min: 0

          },

        invalidVariables:

          {

            type: Number,

            default: 0,

            min: 0

          },

        message: {

          type: String,

          default: "",

          trim: true,

          maxlength: 3000

        },

        validatedAt: {

          type: Date,

          default: null

        }

      },


      /* =====================================================
         DEPLOYMENT SETTINGS
      ===================================================== */

      deployment: {

        autoInject: {

          type: Boolean,

          default: true

        },

        allowBuildVariables: {

          type: Boolean,

          default: true

        },

        allowRuntimeVariables: {

          type: Boolean,

          default: true

        },

        lastInjectedVersion: {

          type: Number,

          default: 0,

          min: 0

        }

      },


      /* =====================================================
         RUNTIME CONFIGURATION
      ===================================================== */

      runtime: {

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

          maxlength: 50

        },

        port: {

          type: Number,

          default: null,

          min: 1,

          max: 65535

        }

      },


      /* =====================================================
         SOURCE
      ===================================================== */

      source: {

        type: {

          type: String,

          enum: [

            "manual",

            "github",

            "import",

            "generated",

            "system"

          ],

          default: "manual"

        },

        repositoryId: {

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

        commitSha: {

          type: String,

          default: "",

          trim: true,

          maxlength: 200

        }

      },


      /* =====================================================
         AUDIT
      ===================================================== */

      audit: {

        createdBy: {

          type:
            mongoose.Schema.Types.ObjectId,

          ref:
            "User",

          default:
            null

        },

        updatedBy: {

          type:
            mongoose.Schema.Types.ObjectId,

          ref:
            "User",

          default:
            null

        },

        lastAction: {

          type: String,

          default: "created",

          trim: true,

          maxlength: 200

        },

        lastActionAt: {

          type: Date,

          default: Date.now

        }

      },


      /* =====================================================
         ARCHIVE
      ===================================================== */

      archivedAt: {

        type: Date,

        default: null

      }

    },

    {

      timestamps: true,

      strict: true

    }

  );


/* =========================================================
   INDEXES
========================================================= */


/*
 * One environment of each type per project.
 *
 * Example:
 *
 * project A:
 *   development
 *   preview
 *   production
 *
 * project B:
 *   development
 *   preview
 *   production
 */
environmentSchema.index(
  {
    projectId: 1,
    name: 1
  },
  {
    unique: true
  }
);


/*
 * Fast user + project lookup.
 */
environmentSchema.index(
  {
    userId: 1,
    projectId: 1
  }
);


/*
 * Deployment lookup.
 */
environmentSchema.index(
  {
    projectId: 1,
    status: 1,
    updatedAt: -1
  }
);


/*
 * Deployment version lookup.
 */
environmentSchema.index(
  {
    projectId: 1,
    name: 1,
    version: -1
  }
);


/* =========================================================
   VARIABLE KEY VALIDATION
========================================================= */

/*
 * Standard environment variable names:
 *
 * DATABASE_URL
 * API_KEY
 * NODE_ENV
 * NEXT_PUBLIC_API_URL
 *
 * We allow letters, numbers and underscore.
 *
 * The first character must be a letter or underscore.
 */

environmentVariableSchema.path("key").validate(
  function (value) {

    if (!value) {

      return false;

    }

    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(
      value
    );

  },
  "Invalid environment variable name"
);


/* =========================================================
   ENVIRONMENT NORMALIZATION
========================================================= */

environmentSchema.pre(
  "validate",
  function (next) {

    try {

      if (
        this.name
      ) {

        this.name =
          String(
            this.name
          )
            .trim()
            .toLowerCase();

      }


      /*
       * Automatically generate a display name when absent.
       */

      if (
        !this.displayName &&
        this.name
      ) {

        const names = {

          development:
            "Development",

          preview:
            "Preview",

          production:
            "Production"

        };

        this.displayName =
          names[this.name] ||
          this.name;

      }


      /*
       * Ensure variable keys are unique inside an
       * environment.
       */

      if (
        Array.isArray(
          this.variables
        )
      ) {

        const seen =
          new Set();


        for (
          const variable
          of this.variables
        ) {

          if (
            !variable?.key
          ) {

            continue;

          }


          const normalizedKey =
            String(
              variable.key
            ).trim();


          variable.key =
            normalizedKey;


          const duplicate =
            seen.has(
              normalizedKey
            );


          if (
            duplicate
          ) {

            return next(
              new Error(
                `Duplicate environment variable: ${normalizedKey}`
              )
            );

          }


          seen.add(
            normalizedKey
          );


          /*
           * Secret variables must not retain plaintext.
           */

          if (
            variable.isSecret
          ) {

            variable.plainValue =
              "";

          }

        }

      }


      next();

    } catch (
      error
    ) {

      next(error);

    }

  }
);


/* =========================================================
   VERSION MANAGEMENT
========================================================= */

/*
 * Increment environment version whenever variables or
 * deployment configuration change.
 *
 * The service layer can explicitly control version changes,
 * therefore this hook only handles direct document saves
 * where modified paths indicate configuration changes.
 */

environmentSchema.pre(
  "save",
  function (next) {

    try {

      if (
        !this.isNew &&
        (
          this.isModified("variables") ||
          this.isModified("deployment") ||
          this.isModified("runtime")
        )
      ) {

        this.version =
          Math.max(
            1,
            Number(
              this.version || 1
            ) + 1
          );

      }


      if (
        this.isModified("status") &&
        this.status === "archived"
      ) {

        if (
          !this.archivedAt
        ) {

          this.archivedAt =
            new Date();

        }

      }


      if (
        this.isModified("status") &&
        this.status !== "archived"
      ) {

        this.archivedAt =
          null;

      }


      this.audit =
        this.audit ||
        {};


      this.audit.lastActionAt =
        new Date();


      next();

    } catch (
      error
    ) {

      next(error);

    }

  }
);


/* =========================================================
   INSTANCE METHOD
   ========================================================= */

/*
 * Check whether environment can be used for deployment.
 *
 * This does NOT decrypt secrets.
 */
environmentSchema.methods.isDeployable =
  function () {

    if (
      this.status !== "active"
    ) {

      return false;

    }


    if (
      this.validation?.status ===
      "invalid"
    ) {

      return false;

    }


    if (
      this.validation?.missingVariables >
      0
    ) {

      return false;

    }


    if (
      this.validation?.invalidVariables >
      0
    ) {

      return false;

    }


    return true;

  };


/*
 * Return only safe environment metadata.
 *
 * Secret values are intentionally excluded.
 */
environmentSchema.methods.toSafeJSON =
  function () {

    const variables =
      Array.isArray(
        this.variables
      )
        ? this.variables.map(
            variable => ({

              id:
                variable._id,

              key:
                variable.key,

              isSecret:
                Boolean(
                  variable.isSecret
                ),

              required:
                Boolean(
                  variable.required
                ),

              type:
                variable.type,

              scope:
                variable.scope,

              enabled:
                Boolean(
                  variable.enabled
                ),

              description:
                variable.description,

              validationStatus:
                variable.validationStatus,

              validationMessage:
                variable.validationMessage,

              hasValue:
                Boolean(
                  variable.isSecret
                    ? variable.encryptedValue
                    : variable.plainValue
                ),

              updatedAt:
                variable.updatedAt

            })
          )
        : [];


    return {

      id:
        this._id,

      userId:
        this.userId,

      projectId:
        this.projectId,

      name:
        this.name,

      displayName:
        this.displayName,

      status:
        this.status,

      version:
        this.version,

      deployedVersion:
        this.deployedVersion,

      lastDeploymentId:
        this.lastDeploymentId,

      lastDeployedAt:
        this.lastDeployedAt,

      validation:
        this.validation,

      deployment:
        this.deployment,

      runtime:
        this.runtime,

      source:
        this.source,

      variables,

      createdAt:
        this.createdAt,

      updatedAt:
        this.updatedAt

    };

  };


/* =========================================================
   STATIC METHODS
========================================================= */


/*
 * Find environment owned by a specific user/project.
 */
environmentSchema.statics.findForProject =
  function (
    userId,
    projectId,
    environmentName
  ) {

    const query = {

      userId,

      projectId

    };


    if (
      environmentName
    ) {

      query.name =
        String(
          environmentName
        )
          .trim()
          .toLowerCase();

    }


    return this.findOne(
      query
    );

  };


/*
 * Find all environments for a project.
 */
environmentSchema.statics.findProjectEnvironments =
  function (
    userId,
    projectId
  ) {

    return this.find({

      userId,

      projectId

    })
      .sort({
        name: 1
      });

  };


/*
 * Find production environment.
 */
environmentSchema.statics.findProduction =
  function (
    userId,
    projectId
  ) {

    return this.findOne({

      userId,

      projectId,

      name:
        "production"

    });

  };


/*
 * Find development environment.
 */
environmentSchema.statics.findDevelopment =
  function (
    userId,
    projectId
  ) {

    return this.findOne({

      userId,

      projectId,

      name:
        "development"

    });

  };


/*
 * Find preview environment.
 */
environmentSchema.statics.findPreview =
  function (
    userId,
    projectId
  ) {

    return this.findOne({

      userId,

      projectId,

      name:
        "preview"

    });

  };


/* =========================================================
   MODEL
========================================================= */

const Environment =
  mongoose.models.Environment ||
  mongoose.model(
    "Environment",
    environmentSchema
  );


/* =========================================================
   EXPORT MODEL
========================================================= */

module.exports =
  Environment;


/* =========================================================
   EXPORT ENUMS
========================================================= */

module.exports.ENVIRONMENT_NAMES =
  ENVIRONMENT_NAMES;


module.exports.ENVIRONMENT_STATUSES =
  ENVIRONMENT_STATUSES;


module.exports.VARIABLE_TYPES =
  VARIABLE_TYPES;


module.exports.VARIABLE_SCOPES =
  VARIABLE_SCOPES;


module.exports.VALIDATION_STATUSES =
  VALIDATION_STATUSES;
