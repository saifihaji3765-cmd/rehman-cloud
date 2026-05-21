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
       CLEAN NAME
    ========================= */

    const cleanName =

      projectName
      .toLowerCase()
      .replace(/\s+/g,"-");

    /* =========================
       GENERATED DOMAIN
    ========================= */

    const domain =

`${cleanName}.vertexcloud.app`;

    /* =========================
       RETURN
    ========================= */

    return {

      success:true,

      subdomain:
      domain,

      customDomain:false,

      sslReady:true,

      dnsConfigured:true

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
