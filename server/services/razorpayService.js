const Razorpay =
require("razorpay");

/* =========================
   INSTANCE
========================= */

const razorpay =

new Razorpay({

  key_id:
  process.env.RAZORPAY_KEY_ID,

  key_secret:
  process.env.RAZORPAY_SECRET

});

/* =========================
   CREATE ORDER
========================= */

async function createOrder({

  amount,

  currency = "INR",

  receipt

}){

  try{

    const options = {

      amount:
      amount * 100,

      currency,

      receipt

    };

    const order =

      await razorpay.orders.create(
        options
      );

    return {

      success:true,

      order

    };

  }

  catch(error){

    return {

      success:false,

      error:error.message

    };

  }

}

/* =========================
   EXPORT
========================= */

module.exports = {

  createOrder

};
