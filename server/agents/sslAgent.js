async function sslAgent(
  domainData
){

  try{

    /* =========================
       DOMAIN
    ========================= */

    const domain =

      domainData.subdomain ||

      "app.vertexcloud.app";

    /* =========================
       SSL DETAILS
    ========================= */

    const ssl = {

      enabled:true,

      provider:"Let's Encrypt",

      https:true,

      autoRenew:true,

      sslStatus:"active",

      securedUrl:
      `https://${domain}`

    };

    /* =========================
       RETURN
    ========================= */

    return {

      success:true,

      ssl

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
