require("dotenv").config();

/* =========================
   PACKAGES
========================= */

const express =
require("express");

const cors =
require("cors");

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
} = require("./server/database/redis");

/* =========================
   ROUTES
========================= */

const authRoutes =
require("./server/routes/authRoutes");
const aiRoutes =
require("./server/routes/aiRoutes");

const deployRoutes =
require("./server/routes/deployRoutes");
const paymentRoutes =
require("./server/routes/paymentRoutes");

/* =========================
   SERVICES
========================= */

const logger =
require("./server/services/loggerService");

/* =========================
   APP
========================= */

const app =
express();

/* =========================
   VALIDATE ENV
========================= */

validateEnv();

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({

  extended:true

})
   );

/* =========================
   API ROUTES
========================= */

app.use(

  "/api/ai",

  aiRoutes

);

app.use(

  "/api/deploy",

  deployRoutes

);
app.use(

  "/api/auth",

  authRoutes

);

app.use(

  "/api/payment",

  paymentRoutes

);

/* =========================
   HEALTH CHECK
========================= */

app.get(

  "/",

  (req,res)=>{

    res.json({

      success:true,

      message:
      "🚀 VertexCloud API Running"

    });

  }

);

/* =========================
   START SERVER
========================= */

async function startServer(){

  try{

    /* =========================
       DATABASES
    ========================= */

    await connectMongo();

    await connectRedis();

    /* =========================
       SERVER START
    ========================= */

    app.listen(

      env.PORT,

      ()=>{

        console.log(
`🚀 VertexCloud Running On Port ${env.PORT}`
        );

        logger.success(
          "VertexCloud Server Started"
        );

      }

    );

  }

  catch(error){

    console.log(error);

    logger.error(
      error.message
    );

  }

}

/* =========================
   START
========================= */

startServer();
