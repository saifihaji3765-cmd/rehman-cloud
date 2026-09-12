/* =========================================================
   ZyrionOS USER MODEL
   =========================================================

   Responsibility:
   - User identity
   - Authentication provider information
   - Role
   - Verification
   - Login metadata
   - Current subscription-plan label

   IMPORTANT:
   ---------------------------------------------------------
   Credits, RAM, CPU, storage, bandwidth, deployment limits,
   feature entitlements and usage are NOT stored here.

   Those values belong to the Subscription model and are
   populated from the official Billing Agent catalog after
   verified payment-provider confirmation.

========================================================= */

const mongoose = require("mongoose");


/* =========================================================
   USER SCHEMA
========================================================= */

const userSchema = new mongoose.Schema(
  {

    /* =====================================================
       NAME
    ===================================================== */

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },


    /* =====================================================
       EMAIL
    ===================================================== */

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 320
    },


    /* =====================================================
       PASSWORD
    =====================================================

       OAuth users may not have a password.

    ===================================================== */

    password: {
      type: String,
      default: null
    },


    /* =====================================================
       AVATAR
    ===================================================== */

    avatar: {
      type: String,
      default: "",
      trim: true
    },


    /* =====================================================
       AUTH PROVIDER
    ===================================================== */

    provider: {
      type: String,
      enum: [
        "email",
        "google",
        "github"
      ],
      default: "email"
    },


    /* =====================================================
       GOOGLE ID
    ===================================================== */

    googleId: {
      type: String,
      default: null,
      sparse: true
    },


    /* =====================================================
       GITHUB ID
    ===================================================== */

    githubId: {
      type: String,
      default: null,
      sparse: true
    },


    /* =====================================================
       ROLE
    ===================================================== */

    role: {
      type: String,
      enum: [
        "user",
        "admin"
      ],
      default: "user"
    },


    /* =====================================================
       CURRENT SUBSCRIPTION PLAN
    =====================================================

       This is only a lightweight account-level mirror.

       SOURCE OF TRUTH:
       Subscription model

       Possible values:
       free / starter / pro / business / scale / enterprise

       Actual:
       - credits
       - limits
       - infrastructure
       - features
       - usage
       - payment status
       - expiry
       
       are stored in Subscription.

    ===================================================== */

    subscriptionPlan: {
      type: String,
      enum: [
        "free",
        "starter",
        "pro",
        "business",
        "scale",
        "enterprise"
      ],
      default: "free"
    },


    /* =====================================================
       VERIFIED
    ===================================================== */

    isVerified: {
      type: Boolean,
      default: false
    },


    /* =====================================================
       LAST LOGIN
    ===================================================== */

    lastLogin: {
      type: Date,
      default: null
    }

  },
  {
    timestamps: true
  }
);


/* =========================================================
   INDEXES
========================================================= */

userSchema.index({
  email: 1
});

userSchema.index({
  googleId: 1
});

userSchema.index({
  githubId: 1
});

userSchema.index({
  subscriptionPlan: 1
});


/* =========================================================
   NORMALIZATION
========================================================= */

userSchema.pre(
  "save",
  function (next) {

    if (
      typeof this.email === "string"
    ) {
      this.email =
        this.email
          .trim()
          .toLowerCase();
    }

    if (
      typeof this.name === "string"
    ) {
      this.name =
        this.name.trim();
    }

    if (
      typeof this.subscriptionPlan ===
      "string"
    ) {
      this.subscriptionPlan =
        this.subscriptionPlan
          .trim()
          .toLowerCase();
    }

    next();
  }
);


/* =========================================================
   MODEL
========================================================= */

const User =
  mongoose.models.User ||
  mongoose.model(
    "User",
    userSchema
  );


/* =========================================================
   EXPORT
========================================================= */

module.exports = User;
