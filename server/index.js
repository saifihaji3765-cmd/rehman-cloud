/* =========================
   IMPORTS
========================= */

require("dotenv").config();

const express =
require("express");

const cors =
require("cors");

const path =
require("path");

/* =========================
   EXPRESS
========================= */

const app =
express();

/* =========================
   PORT
========================= */

const PORT =
process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

app.use(
  express.json({
    limit:"50mb"
  })
);

app.use(
  express.urlencoded({
    extended:true
  })
);

/* =========================
   PUBLIC FOLDER
========================= */

app.use(

  express.static(

    path.join(
      __dirname,
      "../client"
    )

  )

);

/* =========================
   AI ROUTES
========================= */

const aiRoutes =
require("./routes/aiRoutes");

app.use(
  "/api/ai",
  aiRoutes
);

/* =========================
   HEALTH ROUTE
========================= */

app.get(

  "/health",

  (req,res)=>{

    res.json({

      success:true,

      message:
      "Rehman AI OS Running",

      version:"1.0.0"

    });

  }

);

/* =========================
   FRONTEND
========================= */

app.get(

  "*",

  (req,res)=>{

    res.sendFile(

      path.join(

        __dirname,

        "../client/index.html"

      )

    );

  }

);

/* =========================
   START SERVER
========================= */

app.listen(

  PORT,

  ()=>{

    console.log(`

🚀 Rehman AI OS Running

🌍 Server:
http://localhost:${PORT}

🤖 AI API:
http://localhost:${PORT}/api/ai/chat

❤️ Health:
http://localhost:${PORT}/health

    `);

  }

);
