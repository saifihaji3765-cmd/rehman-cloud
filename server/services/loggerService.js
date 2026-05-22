const fs =
require("fs");

const path =
require("path");

/* =========================
   LOG FILE PATH
========================= */

const logPath =

path.join(

  process.cwd(),

  "server",

  "logs",

  "vertexcloud.log"

);

/* =========================
   WRITE LOG
========================= */

function writeLog(
  type,
  message
){

  const timestamp =

    new Date().toISOString();

  const logMessage =

`[${timestamp}] [${type}] ${message}\n`;

  fs.appendFileSync(

    logPath,

    logMessage

  );

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

  }

};

/* =========================
   EXPORT
========================= */

module.exports =
logger;
