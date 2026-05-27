const mongoose =
require("mongoose");

/* =========================
PROJECT SCHEMA
========================= */

const projectSchema =

new mongoose.Schema(

{

/* =========================
USER
========================= */

userId:{

type:
mongoose.Schema.Types.ObjectId,

ref:"User",

required:true,

index:true

},

/* =========================
PROJECT
========================= */

projectName:{

type:String,

required:true,

trim:true

},

description:{

type:String,

default:""

},

/* =========================
STATUS
========================= */

status:{

type:String,

enum:[

  "draft",

  "building",

  "deploying",

  "deployed",

  "failed",

  "stopped"

],

default:"draft"

},

/* =========================
FRAMEWORK
========================= */

framework:{

type:String,

default:"Node.js"

},

/* =========================
DEPLOYMENT
========================= */

deploymentProvider:{

type:String,

enum:[

  "AWS",

  "Docker",

  "Vercel",

  "Render"

],

default:"AWS"

},

domain:{

type:String,

default:""

},

repositoryUrl:{

type:String,

default:""

},

deploymentUrl:{

type:String,

default:""

},

deploymentId:{

type:String,

default:""

},

/* =========================
AI SYSTEM
========================= */

aiGenerated:{

type:Boolean,

default:true

},

aiFrameworkSuggestion:{

type:String,

default:""

},

/* =========================
RESOURCE LIMITS
========================= */

ram:{

type:String,

default:"2GB"

},

cpu:{

type:String,

default:"1 vCPU"

},

storage:{

type:String,

default:"25GB"

}

},

{

timestamps:true

}

);

/* =========================
MODEL
========================= */

const Project =

mongoose.model(

"Project",

projectSchema

);

/* =========================
EXPORT
========================= */

module.exports =
Project;
