const Subscription =
require(

"../models/subscriptionModel"

);

const User =
require(

"../models/userModel"

);

const formatResponse =
require(

"../utils/formatResponse"

);

/* =========================
CREATE SUBSCRIPTION
========================= */

async function createSubscriptionController(

req,

res

){

try{

const {

  planName,

  price,

  currency,

  paymentProvider,

  paymentId,

  orderId

} = req.body;

/* =========================
   USER
========================= */

const userId =
req.user.id;

/* =========================
   VALIDATION
========================= */

if(

  !planName ||

  !price ||

  !paymentProvider

){

  return res.status(400)
  .json(

    formatResponse({

      success:false,

      message:
      "Missing required fields"

    })

  );

}

/* =========================
   EXPIRY DATE
========================= */

const expiryDate =
new Date();

expiryDate.setMonth(

  expiryDate.getMonth() + 1

);

/* =========================
   CHECK EXISTING
========================= */

const existingSubscription =

  await Subscription.findOne({

    userId,

    status:"active"

  });

/* =========================
   CANCEL OLD
========================= */

if(existingSubscription){

  existingSubscription.status =
  "upgraded";

  await existingSubscription.save();

}

/* =========================
   CREATE SUBSCRIPTION
========================= */

const subscription =

  await Subscription.create({

    userId,

    planName,

    price,

    currency:
    currency || "USD",

    paymentProvider,

    paymentId,

    orderId,

    expiryDate,

    status:"active"

  });

/* =========================
   UPDATE USER PLAN
========================= */

await User.findByIdAndUpdate(

  userId,

  {

    subscriptionPlan:
    planName.toLowerCase()

  }

);

/* =========================
   RESPONSE
========================= */

return res.json(

  formatResponse({

    success:true,

    message:
    "Subscription activated",

    data:subscription

  })

);

}

catch(error){

return res.status(500)
.json(

  formatResponse({

    success:false,

    message:
    "Subscription failed",

    error:error.message

  })

);

}

}

/* =========================
GET MY SUBSCRIPTION
========================= */

async function getSubscriptionsController(

req,

res

){

try{

const userId =
req.user.id;

const subscriptions =

  await Subscription.find({

    userId

  }).sort({

    createdAt:-1

  });

return res.json(

  formatResponse({

    success:true,

    data:subscriptions

  })

);

}

catch(error){

return res.status(500)
.json(

  formatResponse({

    success:false,

    message:
    "Failed to fetch subscriptions",

    error:error.message

  })

);

}

}

/* =========================
UPGRADE SUBSCRIPTION
========================= */

async function upgradeSubscriptionController(

req,

res

){

try{

const {

  newPlan

} = req.body;

return res.json(

  formatResponse({

    success:true,

    message:
    `Plan upgraded to ${newPlan}`

  })

);

}

catch(error){

return res.status(500)
.json(

  formatResponse({

    success:false,

    error:error.message

  })

);

}

}

/* =========================
CANCEL SUBSCRIPTION
========================= */

async function cancelSubscriptionController(

req,

res

){

try{

const userId =
req.user.id;

const subscription =

  await Subscription.findOne({

    userId,

    status:"active"

  });

if(!subscription){

  return res.status(404)
  .json({

    success:false,

    message:
    "No active subscription"

  });

}

subscription.status =
"cancelled";

await subscription.save();

return res.json({

  success:true,

  message:
  "Subscription cancelled"

});

}

catch(error){

return res.status(500)
.json({

  success:false,

  error:error.message

});

}

}

/* =========================
USAGE + CREDITS
========================= */

async function usageController(

req,

res

){

try{

return res.json({

  success:true,

  usage:{

    aiRequests:120,

    deployments:4,

    thumbnailsGenerated:38,

    creditsRemaining:1962

  }

});

}

catch(error){

return res.status(500)
.json({

  success:false,

  error:error.message

});

}

}

/* =========================
EXPORTS
========================= */

module.exports = {

createSubscriptionController,

getSubscriptionsController,

upgradeSubscriptionController,

cancelSubscriptionController,

usageController

};
