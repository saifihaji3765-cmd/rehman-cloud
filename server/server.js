require("dotenv").config();

/* =========================
PACKAGES
========================= */

const express =
require("express");

const cors =
require("cors");

const helmet =
require("helmet");

const compression =
require("compression");

const morgan =
require("morgan");

/* =========================
CONFIG
========================= */

const env =
require("./server/config/env");

const validateEnv =
require("./server/config/validateEnv");

/* =========================
DATABASE
========================= */

const connectMongo =
require("./server/database/mongo");

const {

connectRedis

} = require(
"./server/database/redis"
);

/* =========================
ROUTES
========================= */

const authRoutes =
require(
"./server/routes/authRoutes"
);

const aiRoutes =
require(
"./server/routes/aiRoutes"
);

const deployRoutes =
require(
"./server/routes/deployRoutes"
);

const paymentRoutes =
require(
"./server/routes/paymentRoutes"
);

const webhookRoutes =
require(
"./server/routes/webhookRoutes"
);

const subscriptionRoutes =
require(
"./server/routes/subscriptionRoutes"
);

const projectRoutes =
require(
"./server/routes/projectRoutes"
);

/* =========================
SERVICES
========================= */

const logger =
require(
"./server/services/loggerService"
);

/* =========================
APP INIT
========================= */

const app =
express();

/* =========================
TRUST PROXY
========================= */

app.set(
"trust proxy",
1
);

/* =========================
VALIDATE ENV
========================= */

validateEnv();

/* =========================
SECURITY
========================= */

app.use(
helmet()
);

/* =========================
CORS
========================= */

app.use(

cors({

origin:true,

credentials:true

})

);

/* =========================
COMPRESSION
========================= */

app.use(
compression()
);

/* =========================
LOGGER
========================= */

app.use(
morgan("dev")
);

/* =========================
BODY PARSER
========================= */

app.use(

express.json({

limit:"10mb"

})

);

app.use(

express.urlencoded({

extended:true,

limit:"10mb"

})

);

/* =========================
API ROUTES
========================= */

app.use(
"/api/auth",
authRoutes
);

app.use(
"/api/ai",
aiRoutes
);

app.use(
"/api/deploy",
deployRoutes
);

app.use(
"/api/payment",
paymentRoutes
);

app.use(
"/api/webhook",
webhookRoutes
);

app.use(
"/api/subscription",
subscriptionRoutes
);

app.use(
"/api/projects",
projectRoutes
);

/* =========================
ROOT HEALTH
========================= */

app.get(

"/",

(req,res)=>{

res.json({

  success:true,

  platform:
  "VertexCloud",

  status:
  "online",

  version:
  "1.0.0"

});

}

);

/* =========================
API HEALTH
========================= */

app.get(

"/api/health",

(req,res)=>{

res.json({

  success:true,

  server:"running",

  mongodb:"connected",

  redis:"optional",

  environment:
  process.env.NODE_ENV

});

}

);

/* =========================
404 HANDLER
========================= */

app.use(

(req,res)=>{

res.status(404).json({

  success:false,

  message:
  "Route not found"

});

}

);

/* =========================
GLOBAL ERROR HANDLER
========================= */

app.use(

(

err,
req,
res,
next

)=>{

console.error(
  err
);

logger.error(
  err.message
);

res.status(500).json({

  success:false,

  message:
  "Internal Server Error",

  error:
  process.env.NODE_ENV ===
  "development"

  ? err.message

  : "Server Error"

});

}

);

/* =========================
START SERVER
========================= */

async function startServer(){

try{

/* =========================
   MONGODB
========================= */

await connectMongo();

/* =========================
   REDIS OPTIONAL
========================= */

try{

  await connectRedis();

  logger.success(
    "Redis Connected"
  );

}

catch(redisError){

  logger.error(

    "Redis Failed: " +

    redisError.message

  );

}

/* =========================
   START APP
========================= */

app.listen(

  env.PORT,

  ()=>{

    console.log(

      `🚀 VertexCloud running on ${env.PORT}`

    );

    logger.success(

      "VertexCloud Server Started"

    );

  }

);

}

catch(error){

console.error(error);

logger.error(
  error.message
);

process.exit(1);

}

}

/* =========================
BOOT SERVER
========================= */

startServer();
