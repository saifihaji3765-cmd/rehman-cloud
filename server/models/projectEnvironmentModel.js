const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT ENVIRONMENT MODEL
   Enterprise Environment Variable / Secret Metadata
   ========================================================= */

/* =========================================================
   PROJECT ENVIRONMENT SCHEMA
========================================================= */

const projectEnvironmentSchema = new mongoose.Schema(
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
       OWNER
    ===================================================== */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /* =====================================================
       VARIABLE NAME
    ===================================================== */

    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 250,
      match: /^[A-Z_][A-Z0-9_]*$/
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
        "preview",
        "test"
      ],
      required: true,
      index: true
    },

    /* =====================================================
       SECRET CLASSIFICATION
    ===================================================== */

    type: {
      type: String,
      enum: [
        "variable",
        "secret"
      ],
      default: "variable",
      index: true
    },

    /* =====================================================
       ENCRYPTED VALUE
       
       NEVER store production secrets here as plaintext.
       Application encryption service must populate this.
    ===================================================== */

    encryptedValue: {
      type: String,
      default: "",
      select: false
    },

    /* =====================================================
       ENCRYPTION METADATA
    ===================================================== */

    encryption: {
      algorithm: {
        type: String,
        default: ""
      },

      keyVersion: {
        type: String,
        default: "",
        maxlength: 100
      },

      iv: {
        type: String,
        default: "",
        select: false
      },

      authTag: {
        type: String,
        default: "",
        select: false
      }
    },

    /* =====================================================
       VALUE METADATA
       
       Allows UI/API to know whether a value exists
       without exposing the actual secret.
    ===================================================== */

    hasValue: {
      type: Boolean,
      default: false,
      index: true
    },

    maskedValue: {
      type: String,
      default: "",
      maxlength: 500
    },

    /* =====================================================
       DESCRIPTION
    ===================================================== */

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },

    /* =====================================================
       SECRET FLAGS
    ===================================================== */

    isSecret: {
      type: Boolean,
      default: false,
      index: true
    },

    isRequired: {
      type: Boolean,
      default: false
    },

    /* =====================================================
       STATUS
    ===================================================== */

    status: {
      type: String,
      enum: [
        "active",
        "disabled",
        "revoked"
      ],
      default: "active",
      index: true
    },

    /* =====================================================
       EXPIRATION
    ===================================================== */

    expiresAt: {
      type: Date,
      default: null,
      index: true
    },

    /* =====================================================
       ROTATION
    ===================================================== */

    rotation: {
      enabled: {
        type: Boolean,
        default: false
      },

      lastRotatedAt: {
        type: Date,
        default: null
      },

      nextRotationAt: {
        type: Date,
        default: null
      }
    },

    /* =====================================================
       AUDIT
    ===================================================== */

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    revokedAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       SOFT DELETE
    ===================================================== */

    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },

    deletedAt: {
      type: Date,
      default: null
    },

    deletedBy: {
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
   UNIQUE VARIABLE PER PROJECT + ENVIRONMENT
========================================================= */

projectEnvironmentSchema.index(
  {
    projectId: 1,
    environment: 1,
    key: 1
  },
  {
    unique: true
  }
);

/* =========================================================
   QUERY INDEXES
========================================================= */

projectEnvironmentSchema.index({
  projectId: 1,
  environment: 1,
  status: 1
});

projectEnvironmentSchema.index({
  projectId: 1,
  isDeleted: 1,
  updatedAt: -1
});

projectEnvironmentSchema.index({
  projectId: 1,
  expiresAt: 1
});

/* =========================================================
   VALIDATION
========================================================= */

projectEnvironmentSchema.pre(
  "validate",
  function (next) {

    /*
     * Secret values must not be stored as plaintext.
     */

    if (
      this.isSecret &&
      this.hasValue &&
      !this.encryptedValue
    ) {
      return next(
        new Error(
          "Secret value must be encrypted before storage"
        )
      );
    }

    /*
     * Revoked variables require revocation metadata.
     */

    if (
      this.status === "revoked" &&
      !this.revokedAt
    ) {
      this.revokedAt = new Date();
    }

    /*
     * Deleted variables require deletion metadata.
     */

    if (
      this.isDeleted &&
      !this.deletedAt
    ) {
      this.deletedAt = new Date();
    }

    next();
  }
);

/* =========================================================
   JSON PROTECTION
========================================================= */

projectEnvironmentSchema.set(
  "toJSON",
  {
    transform: function (doc, ret) {

      /*
       * Never expose encrypted secret material
       * through normal API serialization.
       */

      delete ret.encryptedValue;

      if (ret.encryption) {
        delete ret.encryption.iv;
        delete ret.encryption.authTag;
      }

      /*
       * Never expose internal deletion metadata
       * unnecessarily.
       */

      delete ret.__v;

      return ret;
    }
  }
);

/* =========================================================
   MODEL
========================================================= */

const ProjectEnvironment =
  mongoose.models.ProjectEnvironment ||
  mongoose.model(
    "ProjectEnvironment",
    projectEnvironmentSchema
  );

/* =========================================================
   EXPORT
========================================================= */

module.exports = ProjectEnvironment;
