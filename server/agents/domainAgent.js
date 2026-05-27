const { v4:uuidv4 } =
require("uuid");

/* =========================
RESERVED SUBDOMAINS
========================= */

const reservedSubdomains = [

"admin",

"api",

"dashboard",

"root",

"vertexcloud",

"support",

"billing"

];

/* =========================
DOMAIN AGENT
========================= */

async function domainAgent(
projectData
){

try{

/* =========================
   PROJECT NAME
========================= */

const projectName =

  projectData.projectName ||

  "vertex-app";

/* =========================
   DEPLOYMENT ID
========================= */

const deploymentId =

  uuidv4()
  .split("-")[0];

/* =========================
   CLEAN NAME
========================= */

let cleanName =

  projectName

  .toLowerCase()

  .replace(/[^a-z0-9\s-]/g,"")

  .replace(/\s+/g,"-")

  .trim();

/* =========================
   RESERVED CHECK
========================= */

if(

  reservedSubdomains.includes(
    cleanName
  )

){

  cleanName =
  `${cleanName}-${deploymentId}`;

}

/* =========================
   UNIQUE SUBDOMAIN
========================= */

const subdomain =

"${cleanName}-${deploymentId}";

/* =========================
   ROOT DOMAIN
========================= */

const rootDomain =

  process.env.APP_DOMAIN ||

  "vertexcloud.ai";

/* =========================
   FULL DOMAIN
========================= */

const fullDomain =

"https://${subdomain}.${rootDomain}";

/* =========================
   DNS
========================= */

const dns = {

  provider:"Route53",

  dnsConfigured:true,

  propagationStatus:
  "pending"

};

/* =========================
   SSL
========================= */

const ssl = {

  enabled:true,

  provider:"AWS ACM",

  sslStatus:"provisioning"

};

/* =========================
   RETURN
========================= */

return {

  success:true,

  domain:{

    deploymentId,

    projectName,

    subdomain,

    rootDomain,

    fullDomain,

    customDomain:false,

    ssl,

    dns,

    createdAt:
    new Date()

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
EXPORT
========================= */

module.exports =
domainAgent;
