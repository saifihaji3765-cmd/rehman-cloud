const mongoose =
require("mongoose");

/* =========================
   SUBSCRIPTION SCHEMA
========================= */

const subscriptionSchema =

new mongoose.Schema({

  userId:{

    type:
    mongoose.Schema.Types.ObjectId,

    ref:"User",

    required:true

  },

  planName:{

    type:String,

    required:true

  },

  price:{

    type:Number,

    required:true

  },

  currency:{

    type:String,

    default:"USD"

  },

  paymentProvider:{

    type:String,

    enum:[

      "razorpay",

      "stripe"

    ],

    required:true

  },

  paymentId:{

    type:String

  },

  orderId:{

    type:String

  },

  status:{

    type:String,

    default:"active"

  },

  startDate:{

    type:Date,

    default:Date.now

  },

  expiryDate:{

    type:Date

  },

  autoRenew:{

    type:Boolean,

    default:true

  },

  createdAt:{

    type:Date,

    default:Date.now

  }

});

/* =========================
   MODEL
========================= */

const Subscription =

mongoose.model(

  "Subscription",

  subscriptionSchema

);

/* =========================
   EXPORT
========================= */

module.exports =
Subscription;
