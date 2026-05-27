const Stripe =
require("stripe");

const crypto =
require("crypto");

const formatResponse =
require("../utils/formatResponse");

/* =========================
STRIPE
========================= */

const stripe =
new Stripe(

process.env.STRIPE_SECRET_KEY

);

/* =========================
CREATE PAYMENT
========================= */

async function createPaymentController(
req,
res
){

try{

const {

  amount,

  currency,

  plan

} = req.body;

/* =========================
   VALIDATION
========================= */

if(

  !amount ||

  !plan

){

  return res.status(400)
  .json(

    formatResponse({

      success:false,

      message:
      "Amount and plan required"

    })

  );

}

/* =========================
   PAYMENT INTENT
========================= */

const paymentIntent =

  await stripe
  .paymentIntents
  .create({

    amount:
    amount * 100,

    currency:
    currency || "usd",

    metadata:{

      userId:
      req.user.id,

      plan

    }

  });

/* =========================
   RESPONSE
========================= */

return res.json(

  formatResponse({

    success:true,

    message:
    "Payment intent created",

    data:{

      clientSecret:
      paymentIntent.client_secret

    }

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
VERIFY PAYMENT
========================= */

async function verifyPaymentController(
req,
res
){

try{

return res.json(

  formatResponse({

    success:true,

    message:
    "Payment verified"

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
CREATE SUBSCRIPTION
========================= */

async function createSubscriptionController(
req,
res
){

try{

const {

  plan

} = req.body;

return res.json(

  formatResponse({

    success:true,

    message:
    "Subscription activated",

    plan

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
BILLING HISTORY
========================= */

async function billingHistoryController(
req,
res
){

try{

return res.json(

  formatResponse({

    success:true,

    data:[]

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
USER CREDITS
========================= */

async function creditsController(
req,
res
){

try{

return res.json(

  formatResponse({

    success:true,

    credits:2000,

    used:0,

    remaining:2000

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
STRIPE WEBHOOK
========================= */

async function stripeWebhookController(
req,
res
){

try{

res.status(200).send(
  "Stripe webhook received"
);

}

catch(error){

res.status(400).send(
  `Webhook Error: ${error.message}`
);

}

}

/* =========================
RAZORPAY WEBHOOK
========================= */

async function razorpayWebhookController(
req,
res
){

try{

const signature =

  req.headers[
    "x-razorpay-signature"
  ];

const body =

  JSON.stringify(req.body);

const expectedSignature =

  crypto
  .createHmac(

    "sha256",

    process.env
    .RAZORPAY_WEBHOOK_SECRET

  )

  .update(body)

  .digest("hex");

if(

  signature !==
  expectedSignature

){

  return res.status(400)
  .json({

    success:false,

    message:
    "Invalid webhook signature"

  });

}

return res.json({

  success:true,

  message:
  "Webhook verified"

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

createPaymentController,

verifyPaymentController,

createSubscriptionController,

billingHistoryController,

creditsController,

stripeWebhookController,

razorpayWebhookController

};
