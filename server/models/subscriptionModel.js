const mongoose =
require("mongoose");

/* =========================
SUBSCRIPTION SCHEMA
========================= */

const subscriptionSchema =

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
PLAN
========================= */

planName:{

type:String,

required:true

},

/* =========================
PRICE
========================= */

price:{

type:Number,

required:true

},

currency:{

type:String,

default:"USD"

},

/* =========================
PAYMENT
========================= */

paymentProvider:{

type:String,

enum:[

  "razorpay",

  "stripe"

],

required:true

},

paymentId:{

type:String,

default:""

},

orderId:{

type:String,

default:""

},

/* =========================
STATUS
========================= */

status:{

type:String,

enum:[

  "active",

  "cancelled",

  "expired",

  "upgraded"

],

default:"active"

},

/* =========================
DATES
========================= */

startDate:{

type:Date,

default:Date.now

},

expiryDate:{

type:Date,

required:true

},

autoRenew:{

type:Boolean,

default:true

},

/* =========================
USAGE
========================= */

aiRequestsUsed:{

type:Number,

default:0

},

deploymentsUsed:{

type:Number,

default:0

},

thumbnailsGenerated:{

type:Number,

default:0

},

creditsRemaining:{

type:Number,

default:2000

}

},

{

timestamps:true

}

);

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
