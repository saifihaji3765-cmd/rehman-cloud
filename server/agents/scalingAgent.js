async function scalingAgent(
  appMetrics
){

  try{

    /* =========================
       DEFAULT METRICS
    ========================= */

    const cpuUsage =

      appMetrics.cpuUsage || 20;

    const ramUsage =

      appMetrics.ramUsage || 30;

    /* =========================
       SCALE DECISION
    ========================= */

    let action =

      "stable";

    let instances = 1;

    /* =========================
       AUTO SCALE LOGIC
    ========================= */

    if(

      cpuUsage > 70 ||

      ramUsage > 75

    ){

      action = "scale-up";

      instances = 3;

    }

    if(

      cpuUsage > 90 ||

      ramUsage > 90

    ){

      action = "high-scale";

      instances = 5;

    }

    /* =========================
       RETURN
    ========================= */

    return {

      success:true,

      autoScaling:true,

      action,

      instances,

      metrics:{

        cpuUsage,

        ramUsage

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
scalingAgent;
