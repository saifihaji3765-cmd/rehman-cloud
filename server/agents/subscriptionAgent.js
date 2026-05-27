const billingAgent =
require("./billingAgent");

/* =========================
SUBSCRIPTION AGENT
========================= */

async function subscriptionAgent(
userData
){

try{

/* =========================
   USER PLAN
========================= */

const selectedPlan =

userData.plan ||

"Starter";

/* =========================
   GET BILLING
========================= */

const billingResult =

await billingAgent({

  userId:
  userData.userId,

  plan:
  selectedPlan

});

/* =========================
   BILLING FAILED
========================= */

if(

  !billingResult.success

){

  return {

    success:false,

    message:
    "Billing initialization failed"

  };

}

/* =========================
   PLAN DATA
========================= */

const plan =

billingResult
.billing
.selectedPlan;

/* =========================
   UNLIMITED CHECK
========================= */

const unlimitedAI =

  plan.aiCredits === -1;

const unlimitedDeployments =

  plan.deploymentsLimit === -1;

/* =========================
   SUBSCRIPTION OBJECT
========================= */

const subscription = {

  userId:
  userData.userId ||

  "guest-user",

  activePlan:
  plan.name,

  status:"active",

  billingCycle:"monthly",

  currency:
  plan.currency,

  monthlyPrice:
  plan.monthlyPrice,

  nextBillingDate:

  new Date(

    Date.now() +

    30 * 24 * 60 * 60 * 1000

  ),

  autoRenew:true,

  paymentProvider:

  userData.paymentProvider ||

  "stripe",

  /* =========================
     DEPLOYMENT LIMITS
  ========================= */

  deploymentsLimit:

  plan.deploymentsLimit,

  unlimitedDeployments,

  /* =========================
     AI CREDITS
  ========================= */

  aiCredits:
  plan.aiCredits,

  thumbnailCredits:
  plan.thumbnailCredits,

  videoCredits:
  plan.videoCredits,

  unlimitedAI,

  /* =========================
     INFRASTRUCTURE
  ========================= */

  ram:
  plan.ram,

  cpu:
  plan.cpu,

  storage:
  plan.storage,

  bandwidth:
  plan.bandwidth,

  /* =========================
     FEATURES
  ========================= */

  features:
  plan.features,

  autoScaling:

  plan.autoScaling ||

  false,

  advancedMonitoring:

  plan.advancedMonitoring ||

  false,

  dedicatedInfrastructure:

  plan.dedicatedInfrastructure ||

  false,

  priorityDeployments:

  plan.priorityDeployments ||

  false,

  support:
  plan.support

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
