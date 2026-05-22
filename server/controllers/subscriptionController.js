const Subscription =
require(

  "../models/subscriptionModel"

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

      userId,

      planName,

      price,

      currency,

      paymentProvider,

      paymentId,

      orderId

    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if(

      !userId ||

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
       CREATE SUBSCRIPTION
    ========================= */

    const subscription =

      await Subscription.create({

        userId,

        planName,

        price,

        currency,

        paymentProvider,

        paymentId,

        orderId,

        expiryDate

      });

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
   GET USER SUBSCRIPTIONS
========================= */

async function getSubscriptionsController(

  req,

  res

){

  try{

    const {

      userId

    } = req.params;

    const subscriptions =

      await Subscription.find({

        userId

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
   EXPORTS
========================= */

module.exports = {

  createSubscriptionController,

  getSubscriptionsController

};
