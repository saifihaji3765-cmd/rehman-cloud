const fs =
require("fs");

const path =
require("path");

/* =========================
   LOG DIRECTORY
========================= */

const logsDir =

path.join(

  process.cwd(),

  "server",

  "logs"

);

/* =========================
   CREATE LOG DIR
========================= */

if(

  !fs.existsSync(logsDir)

){

  fs.mkdirSync(

    logsDir,

    { recursive:true }

  );

}

/* =========================
   LOG FILE
========================= */

const logPath =

path.join(

  logsDir,

  "vertexcloud.log"

);

/* =========================
   WRITE LOG
========================= */

function writeLog(
  type,
  message
){

  try{

    const timestamp =

    new Date()
    .toISOString();

    const logMessage =

`[${timestamp}] [${type}] ${message}\n`;

    /* =========================
       CONSOLE OUTPUT
    ========================= */

    console.log(logMessage);

    /* =========================
       FILE LOG
    ========================= */

    fs.appendFile(

      logPath,

      logMessage,

      (error)=>{

        if(error){

          console.error(

            "Log Write Error:",

            error.message

          );

        }

      }

    );

  }

  catch(error){

    console.error(
      "Logger Failure:",
      error.message
    );

  }

}

/* =========================
   LOGGER METHODS
========================= */

const logger = {

  info:(message)=>{

    writeLog(
      "INFO",
      message
    );

  },

  success:(message)=>{

    writeLog(
      "SUCCESS",
      message
    );

  },

  error:(message)=>{

    writeLog(
      "ERROR",
      message
    );

  },

  warning:(message)=>{

    writeLog(
      "WARNING",
      message
    );

  },

  debug:(message)=>{

    if(

      process.env.NODE_ENV ===
      "development"

    ){

      writeLog(
        "DEBUG",
        message
      );

    }

  }

};

/* =========================
   EXPORT
========================= */

module.exports =
logger;
