const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — GITHUB CONNECTION MODEL
   Enterprise GitHub Integration / Connection Source of Truth
   ========================================================= */

/* =========================================================
   GITHUB USER PROFILE SCHEMA
========================================================= */

const githubUserSchema = new mongoose.Schema(
  {
    githubId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    login: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    name: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 500
    },

    avatarUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    profileUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    htmlUrl: {
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
   TOKEN SCHEMA
   IMPORTANT:
   Raw GitHub access tokens are NEVER exposed through normal
   queries. The encrypted token is select:false.
========================================================= */

const githubTokenSchema = new mongoose.Schema(
  {
    encryptedAccessToken: {
      type: String,
      default: "",
      select: false
    },

    encryptedRefreshToken: {
      type: String,
      default: "",
      select: false
    },

    accessTokenEncryption: {
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

    refreshTokenEncryption: {
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

    tokenType: {
      type: String,
      default: "bearer",
      trim: true,
      maxlength: 100
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true
    },

    refreshTokenExpiresAt: {
      type: Date,
      default: null,
      index: true
    },

    scopes: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 200
        }
      ],
      default: []
    },

    hasAccessToken: {
      type: Boolean,
      default: false,
      index: true
    },

    hasRefreshToken: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   GITHUB APP INSTALLATION SCHEMA
========================================================= */

const githubInstallationSchema = new mongoose.Schema(
  {
    installationId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    accountId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    accountLogin: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    accountType: {
      type: String,
      enum: [
        "",
        "User",
        "Organization"
      ],
      default: ""
    },

    repositorySelection: {
      type: String,
      enum: [
        "",
        "all",
        "selected"
      ],
      default: ""
    },

    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    installedAt: {
      type: Date,
      default: null
    },

    suspendedAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   CONNECTION METADATA SCHEMA
========================================================= */

const connectionMetadataSchema = new mongoose.Schema(
  {
    connectedFrom: {
      type: String,
      enum: [
        "oauth",
        "github_app",
        "personal_token",
        "system",
        "api"
      ],
      default: "oauth"
    },

    lastValidationMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },

    lastErrorCode: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },

    lastErrorMessage: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4000
    },

    repositoryCount: {
      type: Number,
      default: 0,
      min: 0
    },

    lastRepositorySyncAt: {
      type: Date,
      default: null
    },

    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
);

/* =========================================================
   GITHUB CONNECTION SCHEMA
========================================================= */

const githubConnectionSchema = new mongoose.Schema(
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
       OPTIONAL PROJECT ASSOCIATION
       One GitHub connection can be used across projects.
       Project-specific repository mapping belongs elsewhere.
    ===================================================== */

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true
    },

    /* =====================================================
       PROVIDER
    ===================================================== */

    provider: {
      type: String,
      enum: [
        "github"
      ],
      default: "github",
      required: true,
      index: true
    },

    /* =====================================================
       CONNECTION TYPE
    ===================================================== */

    connectionType: {
      type: String,
      enum: [
        "oauth",
        "github_app",
        "personal_token"
      ],
      default: "oauth",
      required: true,
      index: true
    },

    /* =====================================================
       CONNECTION STATUS
    ===================================================== */

    status: {
      type: String,
      enum: [
        "pending",
        "active",
        "expired",
        "revoked",
        "error",
        "disconnected"
      ],
      default: "pending",
      required: true,
      index: true
    },

    /* =====================================================
       GITHUB IDENTITY
    ===================================================== */

    githubUser: {
      type: githubUserSchema,
      required: true
    },

    /* =====================================================
       TOKENS
    ===================================================== */

    tokens: {
      type: githubTokenSchema,
      default: () => ({})
    },

    /* =====================================================
       GITHUB APP
    ===================================================== */

    installation: {
      type: githubInstallationSchema,
      default: () => ({})
    },

    /* =====================================================
       DEFAULT REPOSITORY
    ===================================================== */

    defaultRepository: {
      owner: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300
      },

      name: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300
      },

      fullName: {
        type: String,
        default: "",
        trim: true,
        maxlength: 600
      },

      repositoryId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300
      },

      defaultBranch: {
        type: String,
        default: "",
        trim: true,
        maxlength: 300
      },

      htmlUrl: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000
      },

      cloneUrl: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000
      }
    },

    /* =====================================================
       PERMISSIONS
    ===================================================== */

    permissions: {
      readRepositories: {
        type: Boolean,
        default: false
      },

      writeRepositories: {
        type: Boolean,
        default: false
      },

      readContents: {
        type: Boolean,
        default: false
      },

      writeContents: {
        type: Boolean,
        default: false
      },

      readBranches: {
        type: Boolean,
        default: false
      },

      writeBranches: {
        type: Boolean,
        default: false
      },

      createPullRequests: {
        type: Boolean,
        default: false
      },

      readPullRequests: {
        type: Boolean,
        default: false
      },

      readOrganizations: {
        type: Boolean,
        default: false
      }
    },

    /* =====================================================
       VALIDATION
    ===================================================== */

    lastValidatedAt: {
      type: Date,
      default: null,
      index: true
    },

    isValidated: {
      type: Boolean,
      default: false,
      index: true
    },

    /* =====================================================
       CONNECTION METADATA
    ===================================================== */

    metadata: {
      type: connectionMetadataSchema,
      default: () => ({})
    },

    /* =====================================================
       AUDIT
    ===================================================== */

    connectedAt: {
      type: Date,
      default: null,
      index: true
    },

    disconnectedAt: {
      type: Date,
      default: null
    },

    lastErrorAt: {
      type: Date,
      default: null
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
    versionKey: false,
    minimize: false
  }
);

/* =========================================================
   ENTERPRISE INDEXES
========================================================= */

githubConnectionSchema.index({
  userId: 1,
  provider: 1,
  status: 1
});

githubConnectionSchema.index({
  userId: 1,
  createdAt: -1
});

githubConnectionSchema.index({
  userId: 1,
  isArchived: 1,
  updatedAt: -1
});

githubConnectionSchema.index({
  "githubUser.githubId": 1
});

githubConnectionSchema.index({
  "githubUser.login": 1
});

githubConnectionSchema.index({
  "installation.installationId": 1
});

githubConnectionSchema.index({
  projectId: 1,
  status: 1
});

/* =========================================================
   VALIDATION
========================================================= */

githubConnectionSchema.pre(
  "validate",
  function (next) {

    if (
      !this.githubUser ||
      !this.githubUser.githubId ||
      !this.githubUser.login
    ) {
      return next(
        new Error(
          "GitHub user identity is required"
        )
      );
    }

    if (
      this.status === "active" &&
      !this.tokens.hasAccessToken &&
      this.connectionType !== "github_app"
    ) {
      return next(
        new Error(
          "Active GitHub connection requires an access token"
        )
      );
    }

    next();
  }
);

/* =========================================================
   PRE SAVE
========================================================= */

githubConnectionSchema.pre(
  "save",
  function (next) {

    if (
      this.status === "active" &&
      !this.connectedAt
    ) {
      this.connectedAt = new Date();
    }

    if (
      this.status === "disconnected" &&
      !this.disconnectedAt
    ) {
      this.disconnectedAt = new Date();
    }

    if (
      this.status === "error"
    ) {
      this.lastErrorAt =
        this.lastErrorAt ||
        new Date();
    }

    next();
  }
);

/* =========================================================
   MODEL
========================================================= */

const GithubConnection =
  mongoose.models.GithubConnection ||
  mongoose.model(
    "GithubConnection",
    githubConnectionSchema
  );

/* =========================================================
   EXPORT
========================================================= */

module.exports = GithubConnection;
