const { v4: uuidv4 } =
require("uuid");

/* =========================
BILLING AGENT
========================= */

const billingAgent =
require("./billingAgent");

/* =========================
SERVICES
========================= */

const logger =
require("../services/loggerService");

/* =========================
SUBSCRIPTION AGENT
========================= */

async function subscriptionAgent(
userData = {}
){

try{

logger.info(
  "Subscription Agent Started"
);

/* =========================
PLAN
========================= */

const selectedPlan =

userData.plan ||
"Starter";

/* =========================
USER ID
========================= */

const userId =

userData.userId ||
"guest-user";

/* =========================
BILLING
========================= */

const billingResult =

await billingAgent({

userId,

plan:
selectedPlan

});

/* =========================
BILLING FAILED
========================= */

if(!billingResult.success){

logger.error(
"Billing initialization failed"
);

return {

success:false,

message:
"Billing initialization failed",

error:
billingResult.error

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
PLAN VALIDATION
========================= */

if(!plan){

return {

success:false,

message:
"Invalid subscription plan"

};

}

/* =========================
UNLIMITED
========================= */

const unlimitedAI =

plan.aiCredits === -1;

const unlimitedDeployments =

plan.deploymentsLimit === -1;

/* =========================
DATES
========================= */

const startedAt =
new Date();

const nextBillingDate =

new Date(

Date.now() +

30 * 24 * 60 * 60 * 1000

);

/* =========================
SUBSCRIPTION ID
========================= */

const subscriptionId =
uuidv4();

/* =========================
USAGE TRACKING
========================= */

const usage = {

deploymentsUsed:0,

aiCreditsUsed:0,

thumbnailCreditsUsed:0,

videoCreditsUsed:0

};

/* =========================
LIMITS
========================= */

const limits = {

deployments:
plan.deploymentsLimit,

aiCredits:
plan.aiCredits,

thumbnailCredits:
plan.thumbnailCredits,

videoCredits:
plan.videoCredits

};

/* =========================
FEATURE FLAGS
========================= */

const featureFlags = {

customDomain:
plan.customDomain || false,

autoSSL:
plan.autoSSL || false,

autoScaling:
plan.autoScaling || false,

advancedMonitoring:
plan.advancedMonitoring || false,

priorityDeployments:
plan.priorityDeployments || false,

dedicatedInfrastructure:
plan.dedicatedInfrastructure || false,

dedicatedSupport:
plan.dedicatedSupport || false

};

/* =========================
INFRASTRUCTURE
========================= */

const infrastructure = {

ram:
plan.ram,

cpu:
plan.cpu,

storage:
plan.storage,

bandwidth:
plan.bandwidth

};

/* =========================
SUBSCRIPTION OBJECT
========================= */

const subscription = {

subscriptionId,

userId,

activePlan:
plan.name,

status:"active",

billingCycle:"monthly",

currency:
plan.currency,

monthlyPrice:
plan.monthlyPrice,

paymentProvider:

userData.paymentProvider ||
"stripe",

paymentStatus:"active",

startedAt,

nextBillingDate,

autoRenew:true,

/* =========================
LIMITS
========================= */

deploymentsLimit:
plan.deploymentsLimit,

unlimitedDeployments,

unlimitedAI,

limits,

usage,

/* =========================
INFRASTRUCTURE
========================= */

infrastructure,

/* =========================
FEATURES
========================= */

features:
plan.features,

featureFlags,

support:
plan.support,

/* =========================
METADATA
========================= */

metadata:{

environment:
process.env.NODE_ENV,

version:"1.0.0"

},

createdAt:
startedAt,

updatedAt:
startedAt

};

logger.success(
  "Subscription Activated"
);

/* =========================
RETURN
========================= */

return {

success:true,

subscription

};

}

catch(error){

logger.error(
error.message
);

return {

success:false,

message:
"Subscription initialization failed",

error:
error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
subscriptionAgent;
