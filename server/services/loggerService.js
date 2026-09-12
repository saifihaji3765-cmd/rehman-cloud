"use strict";

const fs = require("fs");
const path = require("path");

/* =========================================================
   ZYRIONOS LOGGER SERVICE
   =========================================================

   Production:
   - Console / stdout only
   - ECS automatically sends container logs to CloudWatch
   - No local file writes
   - Prevents ENOTDIR / filesystem logging failures

   Development:
   - Console logging
   - Optional file logging with LOG_TO_FILE=true
========================================================= */

/* =========================================================
   ENVIRONMENT
========================================================= */

const NODE_ENV = String(
  process.env.NODE_ENV || "production"
)
  .trim()
  .toLowerCase();

const IS_PRODUCTION =
  NODE_ENV === "production";

/* =========================================================
   FILE LOGGING
========================================================= */

const ENABLE_FILE_LOGGING =
  !IS_PRODUCTION &&
  String(process.env.LOG_TO_FILE || "")
    .trim()
    .toLowerCase() === "true";

/* =========================================================
   LOG DIRECTORY
========================================================= */

const logsDir = path.resolve(
  process.env.LOG_DIR ||
    path.join(
      process.cwd(),
      "server",
      "logs"
    )
);

/* =========================================================
   LOG FILE
========================================================= */

const logFileName =
  String(
    process.env.LOG_FILE_NAME ||
      "vertexcloud.log"
  )
    .trim()
    .replace(/[\/\\]/g, "_");

const logPath = path.join(
  logsDir,
  logFileName
);

/* =========================================================
   PREPARE FILE LOGGER
========================================================= */

function prepareFileLogger() {

  if (!ENABLE_FILE_LOGGING) {
    return false;
  }

  try {

    /*
     * If the configured log path already exists
     * as a file, do not attempt to treat it as a
     * directory.
     */

    if (fs.existsSync(logsDir)) {

      const stats =
        fs.statSync(logsDir);

      if (!stats.isDirectory()) {

        console.error(
          `[LOGGER] Log directory path is not a directory: ${logsDir}`
        );

        return false;
      }

    } else {

      fs.mkdirSync(
        logsDir,
        {
          recursive: true
        }
      );

    }

    /*
     * Verify the final log path is usable.
     */

    if (fs.existsSync(logPath)) {

      const stats =
        fs.statSync(logPath);

      if (!stats.isFile()) {

        console.error(
          `[LOGGER] Log file path is not a file: ${logPath}`
        );

        return false;
      }

    }

    return true;

  } catch (error) {

    console.error(
      `[LOGGER] File logging disabled: ${error.message}`
    );

    return false;
  }
}

const FILE_LOGGING_READY =
  prepareFileLogger();

/* =========================================================
   MESSAGE NORMALIZATION
========================================================= */

function normalizeMessage(message) {

  if (
    message === null ||
    message === undefined
  ) {
    return "";
  }

  if (
    typeof message === "string"
  ) {
    return message;
  }

  if (
    message instanceof Error
  ) {

    return message.stack ||
      message.message ||
      String(message);
  }

  try {

    return JSON.stringify(
      message
    );

  } catch {

    return String(message);
  }
}

/* =========================================================
   CONSOLE OUTPUT
========================================================= */

function writeConsole(
  type,
  message
) {

  const timestamp =
    new Date().toISOString();

  const logMessage =
    `[${timestamp}] [${type}] ${message}`;

  /*
   * Keep production logs on stdout/stderr.
   * ECS/CloudWatch captures these automatically.
   */

  if (type === "ERROR") {

    console.error(
      logMessage
    );

  } else if (
    type === "WARNING"
  ) {

    console.warn(
      logMessage
    );

  } else {

    console.log(
      logMessage
    );
  }

  return logMessage;
}

/* =========================================================
   FILE OUTPUT
========================================================= */

function writeFile(
  logMessage
) {

  if (
    !FILE_LOGGING_READY
  ) {
    return;
  }

  try {

    fs.appendFile(
      logPath,
      `${logMessage}\n`,
      (error) => {

        if (error) {

          /*
           * Never allow logging failure to
           * crash or interfere with the app.
           */

          console.error(
            `[LOGGER] File write failed: ${error.message}`
          );
        }
      }
    );

  } catch (error) {

    console.error(
      `[LOGGER] File logger failure: ${error.message}`
    );
  }
}

/* =========================================================
   MAIN LOGGER
========================================================= */

function writeLog(
  type,
  message
) {

  try {

    const normalizedMessage =
      normalizeMessage(
        message
      );

    const logMessage =
      writeConsole(
        type,
        normalizedMessage
      );

    /*
     * File logging is intentionally disabled
     * in production.
     */

    if (
      FILE_LOGGING_READY
    ) {

      writeFile(
        logMessage
      );
    }

  } catch (error) {

    /*
     * Logger must never become
     * the reason the application crashes.
     */

    console.error(
      `[LOGGER] Logger failure: ${error.message}`
    );
  }
}

/* =========================================================
   LOGGER METHODS
========================================================= */

const logger = {

  info(message) {

    writeLog(
      "INFO",
      message
    );
  },

  success(message) {

    writeLog(
      "SUCCESS",
      message
    );
  },

  warning(message) {

    writeLog(
      "WARNING",
      message
    );
  },

  error(message) {

    writeLog(
      "ERROR",
      message
    );
  },

  debug(message) {

    if (
      NODE_ENV ===
      "development"
    ) {

      writeLog(
        "DEBUG",
        message
      );
    }
  }

};

/* =========================================================
   LOGGER METADATA
========================================================= */

logger.environment =
  NODE_ENV;

logger.fileLogging =
  FILE_LOGGING_READY;

logger.logPath =
  FILE_LOGGING_READY
    ? logPath
    : null;

/* =========================================================
   EXPORT
========================================================= */

module.exports =
  logger;
