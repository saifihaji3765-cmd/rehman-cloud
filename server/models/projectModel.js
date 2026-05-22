const mongoose =
require("mongoose");

/* =========================
   PROJECT SCHEMA
========================= */

const projectSchema =

new mongoose.Schema({

  userId:{

    type:
    mongoose.Schema.Types.ObjectId,

    ref:"User",

    required:true

  },

  projectName:{

    type:String,

    required:true

  },

  description:{

    type:String,

    default:""

  },

  status:{

    type:String,

    default:"pending"

  },

  framework:{

    type:String,

    default:"Node.js"

  },

  deploymentProvider:{

    type:String,

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

  createdAt:{

    type:Date,

    default:Date.now

  }

});

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
