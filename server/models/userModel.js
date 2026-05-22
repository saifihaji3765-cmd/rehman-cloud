const mongoose =
require("mongoose");

/* =========================
   USER SCHEMA
========================= */

const userSchema =

new mongoose.Schema({

  name:{

    type:String,

    required:true

  },

  email:{

    type:String,

    required:true,

    unique:true

  },

  password:{

    type:String,

    required:true

  },

  subscriptionPlan:{

    type:String,

    default:"free"

  },

  projects:[{

    type:String

  }],

  createdAt:{

    type:Date,

    default:Date.now

  }

});

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

module.exports =
User;
