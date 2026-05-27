const redis =
require("redis");

/* =========================
REDIS CLIENT
========================= */

const redisClient =
redis.createClient({

url:
process.env.REDIS_URL

});

/* =========================
REDIS EVENTS
========================= */

redisClient.on(

"connect",

()=>{

console.log(
  "✅ Redis Connected"
);

}

);

redisClient.on(

"error",

(error)=>{

console.log(
  "⚠️ Redis Error"
);

console.log(
  error.message
);

}

);

redisClient.on(

"reconnecting",

()=>{

console.log(
  "🔄 Redis Reconnecting..."
);

}

);

/* =========================
CONNECT REDIS
========================= */

async function connectRedis(){

try{

/* =========================
   SKIP IF NO URL
========================= */

if(

  !process.env.REDIS_URL

){

  console.log(

    "⚠️ Redis Disabled"

  );

  return null;

}

/* =========================
   CONNECT
========================= */

await redisClient.connect();

return redisClient;

}

catch(error){

console.log(

  "⚠️ Redis Connection Failed"

);

console.log(
  error.message
);

/* =========================
   DO NOT CRASH SERVER
========================= */

return null;

}

}

/* =========================
EXPORTS
========================= */

module.exports = {

redisClient,

connectRedis

};
