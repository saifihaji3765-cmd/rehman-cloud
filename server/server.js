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

const fs =
require("fs");

const OpenAI =
require("openai");

/* =========================
   APP
========================= */

const app =
express();

const PORT =
process.env.PORT || 3000;

/* =========================
   OPENAI
========================= */

const openai =
new OpenAI({

  apiKey:
  process.env.OPENAI_API_KEY

});

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

app.use(
  express.json({
    limit:"50mb"
  })
);

/* =========================
   PATHS
========================= */

const ROOT =
path.join(__dirname,"..");

const WORKSPACE =
path.join(
  ROOT,
  "workspace"
);

const PROJECTS =
path.join(
  ROOT,
  "projects"
);

const LOGS =
path.join(
  ROOT,
  "logs"
);

/* =========================
   CREATE REQUIRED FOLDERS
========================= */

[
  WORKSPACE,
  PROJECTS,
  LOGS
].forEach(folder=>{

  if(
    !fs.existsSync(folder)
  ){

    fs.mkdirSync(
      folder,
      {
        recursive:true
      }
    );

  }

});

/* =========================
   HEALTH CHECK
========================= */

app.get(

  "/api/health",

  (req,res)=>{

    res.json({

      success:true,

      message:
      "Rehman AI OS Running 🚀"

    });

  }

);

/* =========================
   AI CHAT
========================= */

app.post(

  "/api/chat",

  async (req,res)=>{

    try{

      const {
        message
      } = req.body;

      if(!message){

        return res.status(400).json({

          success:false,

          error:
          "Message required"

        });

      }

      /* =========================
         OPENAI RESPONSE
      ========================= */

      const completion =
      await openai.chat.completions.create({

        model:
        "gpt-4.1-mini",

        messages:[

          {

            role:"system",

            content:`

You are Rehman AI OS.

You are an autonomous AI software engineer.

Your task:

- understand user goals
- ask smart questions
- plan apps
- generate production systems
- think like a CTO

Respond professionally.

            `

          },

          {

            role:"user",

            content:message

          }

        ],

        temperature:0.7

      });

      const reply =
      completion
      .choices[0]
      .message
      .content;

      /* =========================
         RESPONSE
      ========================= */

      res.json({

        success:true,

        reply

      });

    }

    catch(error){

      console.log(error);

      res.status(500).json({

        success:false,

        error:error.message

      });

    }

  }

);

/* =========================
   ROOT
========================= */

app.get(

  "/",

  (req,res)=>{

    res.json({

      success:true,

      platform:
      "Rehman AI OS"

    });

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
http://localhost:${PORT}

    `);

  }

);
