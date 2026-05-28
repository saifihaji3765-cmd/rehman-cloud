/* =========================
PACKAGES
========================= */

const { v4: uuidv4 } =
require("uuid");

/* =========================
SERVICES
========================= */

const logger =
require("../services/loggerService");

/* =========================
PLANS
========================= */

const plans = [

/* =========================
STARTER
========================= */

{
  name:"Starter",

  monthlyPrice:19,

  yearlyPrice:190,

  currency:"USD",

  ram:"2GB",

  cpu:"1 vCPU",

  storage:"25GB",

  bandwidth:"250GB",

  deploymentsLimit:3,

  aiCredits:2000,

  thumbnailCredits:500,

  videoCredits:100,

  customDomain:true,

  autoSSL:true,

  autoScaling:false,

  advancedMonitoring:false,

  dedicatedInfrastructure:false,

  support:"Community Support",

  features:[

    "Basic Deployments",

    "AI Assistant",

    "SSL",

    "Custom Domains"

  ]
},

/* =========================
PRO
========================= */

{
  name:"Pro",

  monthlyPrice:49,

  yearlyPrice:490,

  currency:"USD",

  ram:"8GB",

  cpu:"4 vCPU",

  storage:"100GB",

  bandwidth:"1TB",

  deploymentsLimit:15,

  aiCredits:10000,

  thumbnailCredits:5000,

  videoCredits:1000,

  customDomain:true,

  autoSSL:true,

  autoScaling:true,

  advancedMonitoring:true,

  dedicatedInfrastructure:false,

  support:"Priority Support",

  features:[

    "Advanced AI",

    "Priority Deployments",

    "AI Thumbnail Generator",

    "Advanced Monitoring"

  ]
},

/* =========================
BUSINESS
========================= */

{
  name:"Business",

  monthlyPrice:199,

  yearlyPrice:1990,

  currency:"USD",

  ram:"16GB",

  cpu:"8 vCPU",

  storage:"250GB",

  bandwidth:"Unlimited",

  deploymentsLimit:100,

  aiCredits:50000,

  thumbnailCredits:25000,

  videoCredits:10000,

  customDomain:true,

  autoSSL:true,

  autoScaling:true,

  advancedMonitoring:true,

  dedicatedInfrastructure:false,

  support:"24/7 Premium Support",

  features:[

    "Business AI Automation",

    "Auto Scaling",

    "Advanced Analytics",

    "Team Features"

  ]
},

/* =========================
ENTERPRISE
========================= */

{
  name:"Enterprise",

  monthlyPrice:299,

  yearlyPrice:2990,

  currency:"USD",

  ram:"64GB",

  cpu:"16 vCPU",

  storage:"1TB",

  bandwidth:"Unlimited",

  deploymentsLimit:-1,

  aiCredits:-1,

  thumbnailCredits:-1,

  videoCredits:-1,

  customDomain:true,

  autoSSL:true,

  autoScaling:true,

  advancedMonitoring:true,

  dedicatedInfrastructure:true,

  dedicatedSupport:true,

  support:"Dedicated Success Manager",

  features:[

    "Unlimited AI",

    "Unlimited Deployments",

    "Dedicated Infrastructure",

    "Enterprise Monitoring",

    "Priority AI Processing"

  ]
}

];

/* =========================
GET PLAN
========================= */

function getPlanByName(
planName
){

if(!planName){

  return null;

}

return plans.find(

(plan)=>

plan.name.toLowerCase()

===

planName.toLowerCase()

);

}

/* =========================
BILLING AGENT
========================= */

async function billingAgent(
userData = {}
){

try{

logger.info(
  "Billing Agent Started"
);

/* =========================
VALIDATION
========================= */

if(

  !userData ||

  typeof userData !== "object"

){

  return {

    success:false,

    message:
    "Invalid billing payload"

  };

}

/* =========================
PLAN
========================= */

const selectedPlan =

getPlanByName(

  userData.plan ||

  "Starter"

);

/* =========================
INVALID PLAN
========================= */

if(!selectedPlan){

  return {

    success:false,

    message:
    "Invalid plan selected"

  };

}

/* =========================
BILLING CYCLE
========================= */

const billingCycle =

userData.billingCycle ===
"yearly"

? "yearly"

: "monthly";

/* =========================
PRICE
========================= */

const finalPrice =

billingCycle === "yearly"

? selectedPlan.yearlyPrice

: selectedPlan.monthlyPrice;

/* =========================
BILLING DATES
========================= */

const now =
new Date();

const nextBillingDate =
new Date(

billingCycle === "yearly"

? now.getTime() +
365 * 24 * 60 * 60 * 1000

: now.getTime() +
30 * 24 * 60 * 60 * 1000

);

/* =========================
UNLIMITED HANDLER
========================= */

const normalizedDeployments =

selectedPlan.deploymentsLimit === -1

? "Unlimited"

: selectedPlan.deploymentsLimit;

/* =========================
BILLING OBJECT
========================= */

const billingData = {

  billingId:
  uuidv4(),

  userId:
  userData.userId ||

  "guest-user",

  selectedPlan:{

    ...selectedPlan,

    deploymentsLimit:
    normalizedDeployments

  },

  billingCycle,

  amount:
  finalPrice,

  currency:
  selectedPlan.currency,

  paymentStatus:
  "pending",

  invoiceStatus:
  "unpaid",

  subscriptionStatus:
  "inactive",

  nextBillingDate,

  createdAt:now,

  updatedAt:now

};

logger.success(
  "Billing Generated"
);

/* =========================
RETURN
========================= */

return {

  success:true,

  billing:billingData

};

}

catch(error){

logger.error(
  error.message
);

return {

  success:false,

  message:
  "Billing agent failed",

  error:error.message

};

}

}

/* =========================
EXPORTS
========================= */

module.exports =

billingAgent;
