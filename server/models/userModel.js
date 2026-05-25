const mongoose =
require("mongoose");

/* =========================
   USER SCHEMA
========================= */

const userSchema =

new mongoose.Schema(

  {

    /* =========================
       NAME
    ========================= */

    name:{

      type:String,

      required:true,

      trim:true

    },

    /* =========================
       EMAIL
    ========================= */

    email:{

      type:String,

      required:true,

      unique:true,

      lowercase:true,

      trim:true

    },

    /* =========================
       PASSWORD
    ========================= */

    password:{

      type:String,

      default:null

    },

    /* =========================
       AVATAR
    ========================= */

    avatar:{

      type:String,

      default:""

    },

    /* =========================
       PROVIDER
    ========================= */

    provider:{

      type:String,

      enum:[

        "email",

        "google",

        "github"

      ],

      default:"email"

    },

    /* =========================
       ROLE
    ========================= */

    role:{

      type:String,

      enum:[

        "user",

        "admin"

      ],

      default:"user"

    },

    /* =========================
       PLAN
    ========================= */

    subscriptionPlan:{

      type:String,

      enum:[

        "free",

        "pro",

        "enterprise"

      ],

      default:"free"

    },

    /* =========================
       VERIFIED
    ========================= */

    isVerified:{

      type:Boolean,

      default:false

    },

    /* =========================
       LAST LOGIN
    ========================= */

    lastLogin:{

      type:Date,

      default:null

    }

  },

  {

    timestamps:true

  }

);

/* =========================
   MODEL
========================= */

const User =

mongoose.model(

  "User",

  userSchema

);

/* =========================
   EXPORT
========================= */

module.exports = User;
