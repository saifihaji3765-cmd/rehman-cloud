const Stripe =
require("stripe");

const Razorpay =
require("razorpay");

const crypto =
require("crypto");

const formatResponse =
require("../utils/formatResponse");

const Subscription =
require("../models/subscriptionModel");

/* =========================
STRIPE
========================= */

let stripe = null;

if (
process.env.STRIPE_SECRET_KEY &&
process.env.STRIPE_SECRET_KEY.trim() !== ""
){

stripe = new Stripe(
process.env.STRIPE_SECRET_KEY
);

}

/* =========================
RAZORPAY
============================

let razorpay = null;

if (

process.env.RAZORPAY_KEY_ID &&
process.env.RAZORPAY_KEY_SECRET &&

process.env.RAZORPAY_KEY_ID.trim() !== "" &&
process.env.RAZORPAY_KEY_SECRET.trim() !== ""

){

razorpay = new Razorpay({

key_id:
process.env.RAZORPAY_KEY_ID,

key_secret:
process.env.RAZORPAY_KEY_SECRET

});

}

/* =========================
CREATE PAYMENT
========================= */
if (!razorpay) {
  return res.status(503).json({
    success:false,
    message:"Razorpay not configured"
  });
}
async function createPaymentController(
req,
res
){

try{

const {

  amount,

  currency,

  plan,

  provider

} = req.body;

/* =========================
   VALIDATION
========================= */

if(

  !amount ||

  !plan ||

  !provider

){

  return res.status(400)
  .json(

    formatResponse({

      success:false,

      message:
      "Amount, plan and provider required"

    })

  );

}

/* =========================
   STRIPE
========================= */
if (!stripe) {
  return res.status(503).json({
    success:false,
    message:"Stripe not configured"
  });
}
if(provider === "stripe"){

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

  return res.json(

    formatResponse({

      success:true,

      provider:"stripe",

      data:{

        clientSecret:
        paymentIntent.client_secret

      }

    })

  );

}

/* =========================
   RAZORPAY
========================= */

if(provider === "razorpay"){

  const order =

  await razorpay.orders.create({

    amount:
    amount * 100,

    currency:
    currency || "INR",

    receipt:
    `receipt_${Date.now()}`

  });

  return res.json(

    formatResponse({

      success:true,

      provider:"razorpay",

      data:order

    })

  );

}

/* =========================
   INVALID PROVIDER
========================= */

return res.status(400)
.json(

  formatResponse({

    success:false,

    message:
    "Invalid payment provider"

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

const {

  razorpay_order_id,

  razorpay_payment_id,

  razorpay_signature

} = req.body;

const generatedSignature =

crypto

.createHmac(

  "sha256",

  process.env
  .RAZORPAY_KEY_SECRET

)

.update(

  razorpay_order_id +

  "|" +

  razorpay_payment_id

)

.digest("hex");

if(

  generatedSignature !==
  razorpay_signature

){

  return res.status(400)
  .json({

    success:false,

    message:
    "Payment verification failed"

  });

}

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

  planName,

  price,

  currency,

  paymentProvider,

  paymentId,

  orderId

} = req.body;

const expiryDate =
new Date();

expiryDate.setMonth(
  expiryDate.getMonth() + 1
);

const subscription =

await Subscription.create({

  userId:
  req.user.id,

  planName,

  price,

  currency,

  paymentProvider,

  paymentId,

  orderId,

  expiryDate

});

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

const history =

await Subscription.find({

  userId:req.user.id

})

.sort({

  createdAt:-1

});

return res.json(

  formatResponse({

    success:true,

    data:history

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

    used:320,

    remaining:1680

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

const sig =

req.headers[
  "stripe-signature"
];

const event =

stripe.webhooks.constructEvent(

  req.body,

  sig,

  process.env
  .STRIPE_WEBHOOK_SECRET

);

if(

  event.type ===
  "payment_intent.succeeded"

){

  console.log(
    "Stripe Payment Success"
  );

}

res.status(200).json({

  received:true

});

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
