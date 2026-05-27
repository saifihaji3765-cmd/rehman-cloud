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
   GOOGLE ID
========================= */

googleId:{

  type:String,

  default:null

},

/* =========================
   GITHUB ID
========================= */

githubId:{

  type:String,

  default:null

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
   SUBSCRIPTION PLAN
========================= */

subscriptionPlan:{

  type:String,

  enum:[

    "free",

    "starter",

    "pro",

    "business",

    "enterprise"

  ],

  default:"free"

},

/* =========================
   AI CREDITS
========================= */

credits:{

  type:Number,

  default:2000

},

/* =========================
   DEPLOYMENTS
========================= */

deploymentsUsed:{

  type:Number,

  default:0

},

/* =========================
   RAM PLAN
========================= */

ramPlan:{

  type:String,

  default:"256MB"

},

/* =========================
   CPU PLAN
========================= */

cpuPlan:{

  type:String,

  default:"0.1 CPU"

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
