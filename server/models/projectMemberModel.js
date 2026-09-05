const mongoose = require("mongoose");

/* =========================================================
   ZYRION OS — PROJECT MEMBER MODEL
   Enterprise Project Access / RBAC
   ========================================================= */

/* =========================================================
   PROJECT MEMBER SCHEMA
   ========================================================= */

const projectMemberSchema = new mongoose.Schema(
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
       USER
       ===================================================== */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    /* =====================================================
       ROLE
       ===================================================== */

    role: {
      type: String,
      enum: [
        "owner",
        "admin",
        "developer",
        "editor",
        "viewer"
      ],
      default: "viewer",
      index: true
    },

    /* =====================================================
       MEMBERSHIP STATUS
       ===================================================== */

    status: {
      type: String,
      enum: [
        "pending",
        "active",
        "suspended",
        "removed"
      ],
      default: "pending",
      index: true
    },

    /* =====================================================
       INVITATION
       ===================================================== */

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    invitedAt: {
      type: Date,
      default: null
    },

    acceptedAt: {
      type: Date,
      default: null
    },

    removedAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       PERMISSIONS
       ===================================================== */

    permissions: {
      projectRead: {
        type: Boolean,
        default: true
      },

      projectUpdate: {
        type: Boolean,
        default: false
      },

      projectDelete: {
        type: Boolean,
        default: false
      },

      filesRead: {
        type: Boolean,
        default: true
      },

      filesWrite: {
        type: Boolean,
        default: false
      },

      buildCreate: {
        type: Boolean,
        default: false
      },

      deploymentCreate: {
        type: Boolean,
        default: false
      },

      deploymentRead: {
        type: Boolean,
        default: true
      },

      environmentRead: {
        type: Boolean,
        default: false
      },

      environmentWrite: {
        type: Boolean,
        default: false
      },

      logsRead: {
        type: Boolean,
        default: true
      },

      membersRead: {
        type: Boolean,
        default: false
      },

      membersWrite: {
        type: Boolean,
        default: false
      },

      settingsRead: {
        type: Boolean,
        default: false
      },

      settingsWrite: {
        type: Boolean,
        default: false
      },

      versionsRead: {
        type: Boolean,
        default: true
      },

      versionsWrite: {
        type: Boolean,
        default: false
      }
    },

    /* =====================================================
       ACCESS CONTROL
       ===================================================== */

    accessExpiresAt: {
      type: Date,
      default: null,
      index: true
    },

    lastAccessAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       AUDIT INFORMATION
       ===================================================== */

    createdFrom: {
      type: String,
      enum: [
        "owner",
        "invitation",
        "system",
        "api"
      ],
      default: "owner"
    },

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
   UNIQUE MEMBERSHIP
   ========================================================= */

/*
 * A user can have only one membership record
 * for a particular project.
 */

projectMemberSchema.index(
  {
    projectId: 1,
    userId: 1
  },
  {
    unique: true
  }
);

/* =========================================================
   PROJECT MEMBER QUERIES
   ========================================================= */

projectMemberSchema.index({
  projectId: 1,
  status: 1,
  role: 1
});

projectMemberSchema.index({
  projectId: 1,
  createdAt: -1
});

projectMemberSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1
});

/* =========================================================
   ACTIVE MEMBERS
   ========================================================= */

projectMemberSchema.index({
  projectId: 1,
  status: 1,
  lastAccessAt: -1
});

/* =========================================================
   EXPIRING ACCESS
   ========================================================= */

projectMemberSchema.index({
  accessExpiresAt: 1
});

/* =========================================================
   MODEL
   ========================================================= */

const ProjectMember =
  mongoose.models.ProjectMember ||
  mongoose.model(
    "ProjectMember",
    projectMemberSchema
  );

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = ProjectMember;
