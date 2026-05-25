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
   VALIDATE ENV
========================= */

validateEnv();

/* =========================
   SECURITY / MIDDLEWARE
========================= */

app.use(

  cors({

    origin:"*",

    credentials:true

  })

);

app.use(

  express.json({

    limit:"10mb"

  })

);

app.use(

  express.urlencoded({

    extended:true

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
   ROOT HEALTH CHECK
========================= */

app.get(

  "/",

  (req,res)=>{

    res.json({

      success:true,

      message:
      "🚀 VertexCloud API Running",

      version:"1.0.0",

      status:"online"

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

      mongodb:"connected",

      redis:"connected",

      server:"running"

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

      message:"Route not found"

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
      "Server Error:",
      err
    );

    res.status(500).json({

      success:false,

      message:
      "Internal Server Error",

      error:err.message

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

          `🚀 Server running on port ${env.PORT}`

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

  }

}

/* =========================
   BOOT SERVER
========================= */

startServer();
