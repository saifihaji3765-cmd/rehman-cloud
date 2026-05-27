const { v4:uuidv4 } =
require("uuid");

/* =========================
SSL AGENT
========================= */

async function sslAgent(
domainData
){

try{

/* =========================
   VALIDATION
========================= */

if(

  !domainData ||

  !domainData.domain

){

  return {

    success:false,

    message:
    "Domain data required"

  };

}

/* =========================
   DOMAIN
========================= */

const domain =

  domainData
  .domain
  .fullDomain;

/* =========================
   CERTIFICATE ID
========================= */

const certificateId =

  uuidv4();

/* =========================
   SSL OBJECT
========================= */

const ssl = {

  certificateId,

  enabled:true,

  provider:"AWS ACM",

  https:true,

  autoRenew:true,

  tlsVersion:"TLS 1.3",

  sslStatus:"active",

  validationStatus:
  "validated",

  issuedAt:
  new Date(),

  expiresAt:

  new Date(

    Date.now() +

    365 * 24 * 60 * 60 * 1000

  ),

  securedUrl:
  domain

};

/* =========================
   SECURITY HEADERS
========================= */

const security = {

  hsts:true,

  xssProtection:true,

  contentTypeProtection:true

};

/* =========================
   RETURN
========================= */

return {

  success:true,

  ssl,

  security

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
sslAgent;
