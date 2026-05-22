const redis = require("redis");

/* =========================
   REDIS CLIENT
========================= */

const redisClient = redis.createClient({

  url:
  process.env.REDIS_URL

});

/* =========================
   CONNECT REDIS
========================= */

async function connectRedis(){

  try{

    await redisClient.connect();

    console.log(
      "✅ Redis Connected"
    );

  }

  catch(error){

    console.log(
      "❌ Redis Connection Failed"
    );

    console.log(
      error.message
    );

    process.exit(1);

  }

}

/* =========================
   EXPORTS
========================= */

module.exports = {

  redisClient,

  connectRedis

};
