async function subscriptionAgent(
  userData
){

  try{

    /* =========================
       DEFAULT SUBSCRIPTION
    ========================= */

    const subscription = {

      userId:
      userData.userId ||

      "guest-user",

      activePlan:
      "Starter",

      billingCycle:
      "monthly",

      currency:
      "USD",

      nextBillingDate:
      new Date(

        Date.now() +

        30 * 24 * 60 * 60 * 1000

      ),

      autoRenew:true,

      status:"active"

    };

    /* =========================
       RETURN
    ========================= */

    return {

      success:true,

      subscription

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

module.exports =
subscriptionAgent;
