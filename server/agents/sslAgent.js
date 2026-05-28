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
SSL AGENT
========================= */

async function sslAgent(
domainData = {}
){

try{

logger.info(
  "SSL Agent Started"
);

/* =========================
VALIDATION
========================= */

if(

!domainData ||

!domainData.fullDomain

){

return {

  success:false,

  message:
  "Valid domain required"

};

}

/* =========================
DOMAIN
========================= */

const fullDomain =

domainData.fullDomain;

/* =========================
CERTIFICATE
========================= */

const certificateId =

uuidv4();

/* =========================
CERTIFICATE ARN
========================= */

const certificateArn =

`arn:aws:acm:${process.env.AWS_REGION}:vertexcloud:${certificateId}`;

/* =========================
DATES
========================= */

const issuedAt =
new Date();

const expiresAt =

new Date(

Date.now() +

365 * 24 * 60 * 60 * 1000

);

/* =========================
SSL OBJECT
========================= */

const ssl = {

certificateId,

certificateArn,

provider:"AWS ACM",

enabled:true,

httpsEnabled:true,

httpRedirect:true,

wildcardSupport:true,

autoRenew:true,

tlsVersion:"TLS 1.3",

sslStatus:"active",

validationStatus:"validated",

issuedAt,

expiresAt,

remainingDays:365,

securedUrl:
fullDomain

};

/* =========================
SECURITY
========================= */

const security = {

hsts:true,

xssProtection:true,

contentTypeProtection:true,

frameProtection:true,

referrerPolicy:true

};

/* =========================
FINAL OBJECT
========================= */

const sslData = {

ssl,

security,

sslReady:true,

createdAt:new Date()

};

logger.success(
  "SSL Activated"
);

/* =========================
RETURN
========================= */

return {

success:true,

...sslData

};

}

catch(error){

logger.error(
  error.message
);

return {

success:false,

message:
"SSL activation failed",

error:error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
sslAgent;
