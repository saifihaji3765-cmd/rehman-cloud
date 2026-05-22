const formatResponse =
require(

  "../utils/formatResponse"

);

const logger =
require(

  "../services/loggerService"

);

/* =========================
   RAZORPAY WEBHOOK
========================= */

async function razorpayWebhookController(

  req,

  res

){

  try{

    const event =
    req.body;

    logger.info(
      "Razorpay Webhook Received"
    );

    /* =========================
       PAYMENT SUCCESS
    ========================= */

    if(

      event.event ===
      "payment.captured"

    ){

      logger.success(
        "Razorpay Payment Captured"
      );

      /*
        ✅ Activate Subscription
        ✅ Save Billing
        ✅ Trigger Deployment
        ✅ Send Invoice
      */

    }

    return res.json(

      formatResponse({

        success:true,

        provider:"Razorpay",

        message:
        "Webhook received"

      })

    );

  }

  catch(error){

    logger.error(
      error.message
    );

    return res.status(500)
    .json(

      formatResponse({

        success:false,

        provider:"Razorpay",

        message:
        "Webhook failed",

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

    const event =
    req.body;

    logger.info(
      "Stripe Webhook Received"
    );

    /* =========================
       CHECKOUT SUCCESS
    ========================= */

    if(

      event.type ===
      "checkout.session.completed"

    ){

      logger.success(
        "Stripe Checkout Completed"
      );

      /*
        ✅ Activate Subscription
        ✅ Save Billing
        ✅ Trigger Deployment
        ✅ Send Invoice
      */

    }

    return res.json(

      formatResponse({

        success:true,

        provider:"Stripe",

        message:
        "Webhook received"

      })

    );

  }

  catch(error){

    logger.error(
      error.message
    );

    return res.status(500)
    .json(

      formatResponse({

        success:false,

        provider:"Stripe",

        message:
        "Webhook failed",

        error:error.message

      })

    );

  }

}

/* =========================
   EXPORTS
========================= */

module.exports = {

  razorpayWebhookController,

  stripeWebhookController

};
