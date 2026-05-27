const plans = [

/* =========================
STARTER
========================= */

{

name:"Starter",

monthlyPrice:19,

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

priorityDeployments:true,

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

return plans.find(

plan =>

plan.name
.toLowerCase()

===

planName
.toLowerCase()

);

}

/* =========================
BILLING AGENT
========================= */

async function billingAgent(
userData
){

try{

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
   RETURN
========================= */

return {

  success:true,

  billing:{

    userId:
    userData.userId ||

    "guest-user",

    selectedPlan,

    billingCycle:
    "monthly",

    nextBillingDate:

    new Date(

      Date.now() +

      30 * 24 * 60 * 60 * 1000

    ),

    paymentStatus:
    "pending"

  }

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
EXPORTS
========================= */

module.exports =

billingAgent;
