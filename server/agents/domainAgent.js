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
RESERVED SUBDOMAINS
========================= */

const reservedSubdomains = [

"admin",

"api",

"dashboard",

"root",

"vertexcloud",

"support",

"billing",

"mail",

"ftp",

"app",

"www"

];

/* =========================
CLEAN DOMAIN NAME
========================= */

function cleanDomainName(
name = ""
){

return name

.toLowerCase()

.replace(/[^a-z0-9-]/g,"-")

.replace(/-+/g,"-")

.replace(/^-|-$/g,"")

.substring(0,40);

}

/* =========================
DOMAIN AGENT
========================= */

async function domainAgent(
projectData = {}
){

try{

logger.info(
  "Domain Agent Started"
);

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

cleanDomainName(
  projectName
);

/* =========================
FALLBACK
========================= */

if(!cleanName){

cleanName = "vertex-app";

}

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
SUBDOMAIN
========================= */

const subdomain =

`${cleanName}-${deploymentId}`;

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

`https://${subdomain}.${rootDomain}`;

/* =========================
CUSTOM DOMAIN
========================= */

const customDomain =

projectData.customDomain ||

null;

/* =========================
DNS CONFIG
========================= */

const dns = {

provider:"AWS Route53",

dnsConfigured:true,

recordType:"A",

propagationStatus:"pending",

verificationRequired:false

};

/* =========================
SSL CONFIG
========================= */

const ssl = {

enabled:true,

provider:"AWS ACM",

sslStatus:"provisioning",

httpsEnabled:true

};

/* =========================
DOMAIN OBJECT
========================= */

const domainData = {

deploymentId,

projectName,

subdomain,

rootDomain,

fullDomain,

customDomain,

ssl,

dns,

domainReady:true,

createdAt:new Date()

};

logger.success(
  "Domain Generated"
);

/* =========================
RETURN
========================= */

return {

success:true,

domain:domainData

};

}

catch(error){

logger.error(
  error.message
);

return {

success:false,

message:
"Domain generation failed",

error:error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
domainAgent;
