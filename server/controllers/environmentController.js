/**
 * ZyrionOS - Environment Controller
 * Version: 2.1.0
 *
 * Controller/service contract:
 *
 *   Controller                 Service
 *   ------------------------------------------------
 *   name                ->     environmentName
 *   sourceRef           ->     sourceReference
 *   currentKey          ->     key
 *   new variable key    ->     newKey
 *   sourceName          ->     sourceEnvironment
 *   targetName          ->     targetEnvironment
 *
 * SECURITY:
 * - Secret values are NEVER returned to the browser.
 * - Controllers never decrypt secrets.
 * - Deployment readiness NEVER resolves plaintext secrets.
 * - Plaintext deployment resolution requires trusted internal
 *   deployment context and workflowId.
 */

"use strict";

const environmentService =
  require("../services/environmentService");

const logger =
  require("../services/loggerService");

const formatResponse =
  require("../utils/formatResponse");


/* =========================================================
   CONSTANTS
========================================================= */

const SERVICE_VERSION =
  "2.1.0";

const ENVIRONMENT_NAMES =
  new Set([
    "development",
    "preview",
    "production",
  ]);

const VARIABLE_TYPES =
  new Set([
    "string",
    "number",
    "boolean",
    "json",
  ]);

const VARIABLE_SCOPES =
  new Set([
    "runtime",
    "build",
    "both",
  ]);

const MAX_DESCRIPTION_LENGTH =
  1000;

const MAX_VARIABLES_PER_REQUEST =
  500;

const MAX_KEY_LENGTH =
  256;


/* =========================================================
   REQUEST HELPERS
========================================================= */

function getUserId(req) {
  return (
    req?.user?._id ||
    req?.user?.id ||
    req?.auth?.userId ||
    req?.userId ||
    null
  );
}


function getProjectId(req) {
  return (
    req?.params?.projectId ||
    req?.body?.projectId ||
    req?.query?.projectId ||
    null
  );
}


function getEnvironmentName(req) {
  return (
    req?.params?.environmentName ||
    req?.params?.name ||
    req?.body?.environmentName ||
    req?.body?.environment ||
    req?.body?.name ||
    req?.query?.environmentName ||
    req?.query?.environment ||
    req?.query?.name ||
    null
  );
}


function getRequestId(req) {
  return (
    req?.requestId ||
    req?.headers?.["x-request-id"] ||
    req?.headers?.["x-correlation-id"] ||
    null
  );
}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeEnvironmentName(
  value
) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


function normalizeVariableKey(
  value
) {
  return String(value || "")
    .trim();
}


function normalizeVariableType(
  value
) {
  const type =
    String(
      value || "string"
    )
      .trim()
      .toLowerCase();

  return VARIABLE_TYPES.has(
    type
  )
    ? type
    : "string";
}


function normalizeVariableScope(
  value
) {
  const scope =
    String(
      value || "runtime"
    )
      .trim()
      .toLowerCase();

  return VARIABLE_SCOPES.has(
    scope
  )
    ? scope
    : "runtime";
}


function isValidEnvironmentName(
  value
) {
  return ENVIRONMENT_NAMES.has(
    normalizeEnvironmentName(
      value
    )
  );
}


function isValidVariableKey(
  value
) {
  const key =
    normalizeVariableKey(
      value
    );

  if (!key) {
    return false;
  }

  if (
    key.length >
    MAX_KEY_LENGTH
  ) {
    return false;
  }

  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(
    key
  );
}


function sanitizeDescription(
  value,
  maxLength =
    MAX_DESCRIPTION_LENGTH
) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}


function sanitizeBoolean(
  value,
  defaultValue = false
) {
  if (
    value === undefined ||
    value === null
  ) {
    return defaultValue;
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
    ].includes(normalized)
  ) {
    return false;
  }

  return defaultValue;
}


function normalizeVersion(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  const number =
    Number(value);

  if (
    !Number.isInteger(
      number
    ) ||
    number < 1
  ) {
    return undefined;
  }

  return number;
}


/* =========================================================
   SAFE LOGGING
========================================================= */

function safeStringify(
  value
) {
  try {
    return JSON.stringify(
      value,
      (key, currentValue) => {
        const sensitiveKeys =
          new Set([
            "value",
            "secret",
            "secretValue",
            "plaintext",
            "plainValue",
            "encryptedValue",
            "decryptedValue",
            "token",
            "accessToken",
            "refreshToken",
            "password",
            "apiKey",
            "authorization",
            "variables",
            "environmentVariables",
          ]);

        if (
          sensitiveKeys.has(
            String(key)
          )
        ) {
          return "[REDACTED]";
        }

        return currentValue;
      }
    );
  } catch {
    return "[metadata unavailable]";
  }
}


function logError(
  message,
  metadata = {}
) {
  try {
    const suffix =
      metadata &&
      Object.keys(metadata)
        .length
        ? ` ${safeStringify(
            metadata
          )}`
        : "";

    if (
      logger &&
      typeof logger.error ===
        "function"
    ) {
      logger.error(
        `${message}${suffix}`
      );

      return;
    }
  } catch (error) {
    console.error(
      "LOGGER ERROR:",
      error?.message ||
        error
    );
  }

  console.error(
    message,
    metadata
  );
}


function logInfo(
  message,
  metadata = {}
) {
  try {
    const suffix =
      metadata &&
      Object.keys(metadata)
        .length
        ? ` ${safeStringify(
            metadata
          )}`
        : "";

    if (
      logger &&
      typeof logger.info ===
        "function"
    ) {
      logger.info(
        `${message}${suffix}`
      );

      return;
    }
  } catch (error) {
    console.error(
      "LOGGER ERROR:",
      error?.message ||
        error
    );
  }

  console.log(
    message,
    metadata
  );
}


/* =========================================================
   RESPONSE HELPERS
========================================================= */

function respond(
  res,
  statusCode,
  successValue,
  message,
  data = null,
  meta = {}
) {
  try {
    if (
      typeof formatResponse ===
      "function"
    ) {
      const payload =
        formatResponse({
          success:
            successValue,

          message,

          data,

          meta,
        });

      /*
       * Existing formatResponse versions may not preserve
       * meta. The fallback below guarantees the controller
       * contract remains stable.
       */
      if (
        payload &&
        typeof payload ===
          "object"
      ) {
        if (
          meta &&
          Object.keys(meta)
            .length &&
          payload.meta ===
            undefined
        ) {
          payload.meta =
            meta;
        }

        return res
          .status(statusCode)
          .json(payload);
      }
    }
  } catch (formatterError) {
    logError(
      "Environment response formatter failed.",
      {
        error:
          formatterError?.message ||
          "Unknown formatter error",
      }
    );
  }

  return res
    .status(statusCode)
    .json({
      success:
        successValue,

      message,

      data,

      meta,
    });
}


function success(
  res,
  statusCode,
  message,
  data = null,
  meta = {}
) {
  return respond(
    res,
    statusCode,
    true,
    message,
    data,
    meta
  );
}


function failure(
  res,
  statusCode,
  message,
  code =
    "ENVIRONMENT_ERROR",
  details = null
) {
  return respond(
    res,
    statusCode,
    false,
    message,
    details
      ? {
          code,
          details,
        }
      : {
          code,
        }
  );
}


/* =========================================================
   ERROR HANDLING
========================================================= */

function sanitizeError(
  error
) {
  if (!error) {
    return {
      code:
        "ENVIRONMENT_ERROR",

      message:
        "Environment operation failed.",
    };
  }

  const internalCodes =
    new Set([
      "SECRET_DECRYPTION_FAILED",
      "INVALID_ENCRYPTED_VALUE",
      "INVALID_ENCRYPTION_IV",
      "INVALID_ENCRYPTION_TAG",
      "ENVIRONMENT_ENCRYPTION_KEY_MISSING",
      "ENVIRONMENT_ENCRYPTION_KEY_INVALID",
    ]);

  const code =
    error.code ||
    error.name ||
    "ENVIRONMENT_ERROR";

  return {
    code,

    message:
      internalCodes.has(code)
        ? "Environment security operation failed."
        : error.publicMessage ||
          error.message ||
          "Environment operation failed.",
  };
}


function resolveHttpStatus(
  error
) {
  if (!error) {
    return 500;
  }

  if (
    Number.isInteger(
      error.statusCode
    ) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
  ) {
    return error.statusCode;
  }

  if (
    Number.isInteger(
      error.status
    ) &&
    error.status >= 400 &&
    error.status <= 599
  ) {
    return error.status;
  }

  const code =
    String(
      error.code || ""
    );

  const statusMap = {
    USER_ID_REQUIRED:
      400,

    PROJECT_ID_REQUIRED:
      400,

    ENVIRONMENT_NAME_REQUIRED:
      400,

    INVALID_ENVIRONMENT:
      400,

    INVALID_VARIABLE:
      400,

    INVALID_VARIABLE_KEY:
      400,

    INVALID_ENVIRONMENT_VARIABLE_KEY:
      400,

    ENVIRONMENT_VARIABLE_KEY_REQUIRED:
      400,

    ENVIRONMENT_VARIABLE_KEY_TOO_LONG:
      400,

    VARIABLE_KEY_REQUIRED:
      400,

    VARIABLE_VALUE_REQUIRED:
      400,

    INVALID_VARIABLE_TYPE:
      400,

    INVALID_VARIABLE_SCOPE:
      400,

    INVALID_JSON_VARIABLE:
      400,

    INVALID_NUMBER_VARIABLE:
      400,

    INVALID_BOOLEAN_VARIABLE:
      400,

    INVALID_EXPECTED_VERSION:
      400,

    DEPLOYMENT_ID_REQUIRED:
      400,

    DEPLOYMENT_WORKFLOW_ID_REQUIRED:
      400,

    INVALID_SOURCE_ENVIRONMENT:
      400,

    INVALID_TARGET_ENVIRONMENT:
      400,

    SAME_SOURCE_TARGET_ENVIRONMENT:
      400,

    ENVIRONMENT_NOT_FOUND:
      404,

    ENVIRONMENT_VARIABLE_NOT_FOUND:
      404,

    ENVIRONMENT_ALREADY_EXISTS:
      409,

    ENVIRONMENT_VARIABLE_EXISTS:
      409,

    ENVIRONMENT_VERSION_CONFLICT:
      409,

    ENVIRONMENT_CONCURRENT_UPDATE:
      409,

    ENVIRONMENT_CONFLICT:
      409,

    ENVIRONMENT_ARCHIVED:
      409,

    ENVIRONMENT_NOT_ACTIVE:
      409,

    ENVIRONMENT_VALIDATION_FAILED:
      409,

    ENVIRONMENT_NOT_DEPLOYABLE:
      409,

    FUTURE_ENVIRONMENT_VERSION:
      409,

    PRODUCTION_ENVIRONMENT_DELETE_BLOCKED:
      409,

    PRODUCTION_DELETE_CONFIRMATION_REQUIRED:
      400,

    ENVIRONMENT_DELETE_FAILED:
      500,

    ENVIRONMENT_SERVICE_METHOD_MISSING:
      500,

    TRUSTED_DEPLOYMENT_CONTEXT_REQUIRED:
      403,

    UNAUTHORIZED:
      401,

    FORBIDDEN:
      403,

    TOO_MANY_VARIABLES:
      413,

    ENVIRONMENT_VARIABLE_VALUE_TOO_LARGE:
      413,

    ENVIRONMENT_ENCRYPTION_KEY_MISSING:
      500,

    ENVIRONMENT_ENCRYPTION_KEY_INVALID:
      500,

    SECRET_DECRYPTION_FAILED:
      500,

    INVALID_ENCRYPTED_VALUE:
      500,
  };

  return (
    statusMap[code] ||
    500
  );
}


function handleControllerError(
  req,
  res,
  error,
  fallbackMessage =
    "Environment operation failed."
) {
  const requestId =
    getRequestId(req);

  const sanitized =
    sanitizeError(error);

  logError(
    "Environment controller error.",
    {
      requestId,

      code:
        sanitized.code,

      message:
        sanitized.message,

      stack:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error?.stack,
    }
  );

  return failure(
    res,
    resolveHttpStatus(
      error
    ),
    sanitized.message ||
      fallbackMessage,
    sanitized.code
  );
}


/* =========================================================
   REQUIRED REQUEST VALUES
========================================================= */

function requireUser(
  req,
  res
) {
  const userId =
    getUserId(req);

  if (!userId) {
    failure(
      res,
      401,
      "Authentication required.",
      "UNAUTHORIZED"
    );

    return null;
  }

  return String(userId);
}


function requireProjectId(
  req,
  res
) {
  const projectId =
    getProjectId(req);

  if (!projectId) {
    failure(
      res,
      400,
      "Project ID is required.",
      "PROJECT_ID_REQUIRED"
    );

    return null;
  }

  return String(projectId);
}


function requireEnvironmentName(
  req,
  res
) {
  const name =
    normalizeEnvironmentName(
      getEnvironmentName(req)
    );

  if (!name) {
    failure(
      res,
      400,
      "Environment name is required.",
      "ENVIRONMENT_NAME_REQUIRED"
    );

    return null;
  }

  if (
    !isValidEnvironmentName(
      name
    )
  ) {
    failure(
      res,
      400,
      "Invalid environment name.",
      "INVALID_ENVIRONMENT",
      {
        allowed: [
          "development",
          "preview",
          "production",
        ],
      }
    );

    return null;
  }

  return name;
}


/* =========================================================
   SERVICE DISPATCH
========================================================= */

function getServiceMethod(
  name
) {
  const method =
    environmentService?.[name];

  if (
    typeof method !==
    "function"
  ) {
    throw Object.assign(
      new Error(
        `Environment service method '${name}' is unavailable.`
      ),
      {
        code:
          "ENVIRONMENT_SERVICE_METHOD_MISSING",

        statusCode:
          500,
      }
    );
  }

  return method;
}


async function callService(
  methodName,
  payload
) {
  const method =
    getServiceMethod(
      methodName
    );

  return method(payload);
}


/* =========================================================
   RESULT EXTRACTION
========================================================= */

function extractEnvironment(
  result
) {
  if (!result) {
    return null;
  }

  if (
    result.environment
  ) {
    return result.environment;
  }

  if (
    result.environmentData
  ) {
    return result.environmentData;
  }

  if (
    result.data?.environment
  ) {
    return result.data.environment;
  }

  if (
    result.data
  ) {
    return result.data;
  }

  return result;
}


function extractEnvironments(
  result
) {
  if (!result) {
    return [];
  }

  if (
    Array.isArray(
      result.environments
    )
  ) {
    return result.environments;
  }

  if (
    Array.isArray(
      result.data?.environments
    )
  ) {
    return result.data.environments;
  }

  if (
    Array.isArray(
      result.data
    )
  ) {
    return result.data;
  }

  if (
    Array.isArray(result)
  ) {
    return result;
  }

  return [];
}


/* =========================================================
   CREATE ENVIRONMENT
========================================================= */

async function createEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const name =
      normalizeEnvironmentName(
        req.body?.name ||
          req.body?.environmentName ||
          req.body?.environment ||
          "development"
      );

    if (
      !isValidEnvironmentName(
        name
      )
    ) {
      return failure(
        res,
        400,
        "Invalid environment name.",
        "INVALID_ENVIRONMENT",
        {
          allowed: [
            "development",
            "preview",
            "production",
          ],
        }
      );
    }

    const variables =
      Array.isArray(
        req.body?.variables
      )
        ? req.body.variables
        : [];

    if (
      variables.length >
      MAX_VARIABLES_PER_REQUEST
    ) {
      return failure(
        res,
        413,
        `Maximum ${MAX_VARIABLES_PER_REQUEST} variables are allowed.`,
        "TOO_MANY_VARIABLES"
      );
    }

    const normalizedVariables =
      normalizeVariablesInput(
        variables
      );

    const payload = {
      userId,

      projectId,

      name,

      displayName:
        req.body?.displayName
          ? String(
              req.body.displayName
            )
              .trim()
              .slice(0, 200)
          : "",

      description:
        sanitizeDescription(
          req.body?.description
        ),

      variables:
        normalizedVariables,

      source:
        normalizeSourceInput(
          req.body?.source
        ),

      audit: {
        createdBy:
          userId,

        updatedBy:
          userId,

        lastAction:
          "environment_created",

        lastActionAt:
          new Date(),

        lastActionBy:
          userId,
      },

      requestId:
        getRequestId(req),
    };

    const result =
      await callService(
        "createEnvironment",
        payload
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      201,
      "Environment created successfully.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to create environment."
    );
  }
}


/* =========================================================
   LIST ENVIRONMENTS
========================================================= */

async function listEnvironmentsController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const result =
      await callService(
        "listEnvironments",
        {
          userId,
          projectId,

          includeArchived:
            sanitizeBoolean(
              req.query?.includeArchived,
              false
            ),
        }
      );

    const environments =
      extractEnvironments(
        result
      );

    return success(
      res,
      200,
      "Environments retrieved successfully.",
      {
        environments,

        count:
          environments.length,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to retrieve environments."
    );
  }
}


/* =========================================================
   GET ENVIRONMENT
========================================================= */

async function getEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const result =
      await callService(
        "getEnvironment",
        {
          userId,
          projectId,
          environmentName,
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    if (!environment) {
      return failure(
        res,
        404,
        "Environment not found.",
        "ENVIRONMENT_NOT_FOUND"
      );
    }

    return success(
      res,
      200,
      "Environment retrieved successfully.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to retrieve environment."
    );
  }
}


/* =========================================================
   ADD VARIABLE
========================================================= */

async function addVariableController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const normalized =
      normalizeVariableInput(
        req.body
      );

    const validation =
      validateVariableInput(
        normalized,
        {
          requireValue: true,
        }
      );

    if (
      !validation.valid
    ) {
      return failure(
        res,
        400,
        validation.message,
        validation.code
      );
    }

    const result =
      await callService(
        "addVariable",
        {
          userId,

          projectId,

          environmentName,

          key:
            normalized.key,

          value:
            normalized.value,

          isSecret:
            normalized.isSecret,

          type:
            normalized.type,

          scope:
            normalized.scope,

          required:
            normalized.required,

          description:
            normalized.description,

          source:
            normalized.source,

          sourceReference:
            normalized.sourceReference,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),

          updatedBy:
            userId,
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      201,
      "Environment variable added successfully.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to add environment variable."
    );
  }
}


/* =========================================================
   UPDATE VARIABLE
========================================================= */

async function updateVariableController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    /*
     * `key` is the current/existing key.
     *
     * `newKey` is the optional replacement key.
     */
    const currentKey =
      normalizeVariableKey(
        req.params?.key ||
          req.body?.currentKey ||
          req.body?.key
      );

    if (
      !isValidVariableKey(
        currentKey
      )
    ) {
      return failure(
        res,
        400,
        "Invalid environment variable key.",
        "INVALID_VARIABLE_KEY"
      );
    }

    const normalized =
      normalizeVariableInput(
        req.body,
        {
          allowMissingValue:
            true,
        }
      );

    /*
     * If request explicitly supplies `newKey`, use it.
     *
     * Otherwise preserve current key.
     */
    const requestedNewKey =
      Object.prototype
        .hasOwnProperty.call(
          req.body || {},
          "newKey"
        )
        ? req.body.newKey
        : undefined;

    const newKey =
      requestedNewKey ===
        undefined ||
      requestedNewKey ===
        null ||
      String(
        requestedNewKey
      ).trim() === ""
        ? currentKey
        : normalizeVariableKey(
            requestedNewKey
          );

    if (
      !isValidVariableKey(
        newKey
      )
    ) {
      return failure(
        res,
        400,
        "Invalid new environment variable key.",
        "INVALID_VARIABLE_KEY"
      );
    }

    const payload = {
      userId,

      projectId,

      environmentName,

      key:
        currentKey,

      newKey,

      type:
        normalized.type,

      scope:
        normalized.scope,

      required:
        normalized.required,

      description:
        normalized.description,

      source:
        normalized.source,

      sourceReference:
        normalized.sourceReference,

      isSecret:
        normalized.isSecret,

      updatedBy:
        userId,

      expectedVersion:
        normalizeVersion(
          req.body?.expectedVersion
        ),
    };

    if (
      Object.prototype
        .hasOwnProperty.call(
          req.body || {},
          "value"
        )
    ) {
      payload.value =
        normalized.value;
    }

    const result =
      await callService(
        "updateVariable",
        payload
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      200,
      "Environment variable updated successfully.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to update environment variable."
    );
  }
}


/* =========================================================
   DELETE VARIABLE
========================================================= */

async function deleteVariableController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const key =
      normalizeVariableKey(
        req.params?.key ||
          req.body?.key ||
          req.query?.key
      );

    if (
      !isValidVariableKey(key)
    ) {
      return failure(
        res,
        400,
        "Invalid environment variable key.",
        "INVALID_VARIABLE_KEY"
      );
    }

    const result =
      await callService(
        "deleteVariable",
        {
          userId,

          projectId,

          environmentName,

          key,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion ||
                req.query?.expectedVersion
            ),

          updatedBy:
            userId,
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      200,
      "Environment variable deleted successfully.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to delete environment variable."
    );
  }
}


/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

async function validateEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const result =
      await callService(
        "validateEnvironment",
        {
          userId,

          projectId,

          environmentName,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),

          updatedBy:
            userId,
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      200,
      "Environment validation completed.",
      {
        environment,

        validation:
          result?.validation ||
          environment?.validation ||
          null,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to validate environment."
    );
  }
}


/* =========================================================
   DEPLOYMENT READINESS
=========================================================

   IMPORTANT:

   This endpoint does NOT call resolveForDeployment().

   Therefore no plaintext secret resolution happens through
   this browser-facing API route.

========================================================= */

async function deploymentReadinessController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const result =
      await callService(
        "getDeploymentReadiness",
        {
          userId,

          projectId,

          environmentName,
        }
      );

    return success(
      res,
      200,
      "Environment deployment readiness checked.",
      {
        readiness:
          sanitizeDeploymentReadiness(
            result
          ),
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to check environment deployment readiness."
    );
  }
}


/* =========================================================
   DEPLOYMENT SNAPSHOT
=========================================================

   Browser/API callers receive metadata only.

   Plaintext snapshot resolution requires trusted internal
   service usage and is NOT accepted from request bodies.

========================================================= */

async function createDeploymentSnapshotController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const deploymentId =
      String(
        req.body?.deploymentId ||
          ""
      ).trim();

    if (!deploymentId) {
      return failure(
        res,
        400,
        "Deployment ID is required.",
        "DEPLOYMENT_ID_REQUIRED"
      );
    }

    /*
     * Never trust:
     *
     * req.body.trustedContext
     * req.body.workflowId
     *
     * from a browser request.
     *
     * This controller deliberately asks the service for a
     * metadata-only snapshot.
     */
    const result =
      await callService(
        "createDeploymentSnapshot",
        {
          userId,

          projectId,

          environmentName,

          deploymentId,

          trustedContext:
            false,
        }
      );

    const snapshot =
      result?.snapshot ||
      result;

    return success(
      res,
      200,
      "Deployment snapshot metadata created.",
      {
        snapshot:
          sanitizeDeploymentSnapshot(
            snapshot
          ),
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to create deployment snapshot."
    );
  }
}


/* =========================================================
   MARK DEPLOYED
========================================================= */

async function markDeployedController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const deploymentId =
      String(
        req.body?.deploymentId ||
          ""
      ).trim();

    if (!deploymentId) {
      return failure(
        res,
        400,
        "Deployment ID is required.",
        "DEPLOYMENT_ID_REQUIRED"
      );
    }

    const result =
      await callService(
        "markDeployed",
        {
          userId,

          projectId,

          environmentName,

          deploymentId,

          version:
            normalizeVersion(
              req.body?.version
            ),

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),

          updatedBy:
            userId,
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      200,
      "Environment deployment state updated.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to update deployment state."
    );
  }
}


/* =========================================================
   ARCHIVE ENVIRONMENT
========================================================= */

async function archiveEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const result =
      await callService(
        "archiveEnvironment",
        {
          userId,

          projectId,

          environmentName,

          updatedBy:
            userId,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      200,
      "Environment archived successfully.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to archive environment."
    );
  }
}


/* =========================================================
   UNARCHIVE ENVIRONMENT
========================================================= */

async function unarchiveEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const result =
      await callService(
        "unarchiveEnvironment",
        {
          userId,

          projectId,

          environmentName,

          updatedBy:
            userId,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      200,
      "Environment restored successfully.",
      {
        environment,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to restore environment."
    );
  }
}


/* =========================================================
   DELETE ENVIRONMENT
========================================================= */

async function deleteEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    if (
      environmentName ===
        "production" &&
      req.body?.confirm !==
        true
    ) {
      return failure(
        res,
        400,
        "Production environment deletion requires explicit confirmation.",
        "PRODUCTION_DELETE_CONFIRMATION_REQUIRED"
      );
    }

    const result =
      await callService(
        "deleteEnvironment",
        {
          userId,

          projectId,

          environmentName,

          updatedBy:
            userId,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),

          confirmProduction:
            req.body?.confirm ===
            true,
        }
      );

    return success(
      res,
      200,
      "Environment deleted successfully.",
      {
        deleted:
          result?.deleted ===
          true,

        environment:
          result?.environment ||
          environmentName,

        environmentId:
          result?.environmentId ||
          null,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to delete environment."
    );
  }
}


/* =========================================================
   COPY ENVIRONMENT
========================================================= */

async function copyEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const sourceEnvironment =
      normalizeEnvironmentName(
        req.body?.sourceEnvironment ||
          req.body?.sourceName
      );

    const targetEnvironment =
      normalizeEnvironmentName(
        req.body?.targetEnvironment ||
          req.body?.targetName
      );

    if (
      !isValidEnvironmentName(
        sourceEnvironment
      )
    ) {
      return failure(
        res,
        400,
        "Invalid source environment.",
        "INVALID_SOURCE_ENVIRONMENT"
      );
    }

    if (
      !isValidEnvironmentName(
        targetEnvironment
      )
    ) {
      return failure(
        res,
        400,
        "Invalid target environment.",
        "INVALID_TARGET_ENVIRONMENT"
      );
    }

    if (
      sourceEnvironment ===
      targetEnvironment
    ) {
      return failure(
        res,
        400,
        "Source and target environments must be different.",
        "SAME_SOURCE_TARGET_ENVIRONMENT"
      );
    }

    const copySecrets =
      req.body?.copySecrets ===
      true;

    const result =
      await callService(
        "copyEnvironment",
        {
          userId,

          projectId,

          sourceEnvironment,

          targetEnvironment,

          copySecrets,

          updatedBy:
            userId,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),
        }
      );

    const environment =
      extractEnvironment(
        result
      );

    return success(
      res,
      201,
      "Environment copied successfully.",
      {
        environment,

        secretsCopied:
          copySecrets,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to copy environment."
    );
  }
}


/* =========================================================
   CONFIGURATION SUMMARY
========================================================= */

async function getConfigurationSummaryController(
  req,
  res
) {
  try {
    const userId =
      requireUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      requireProjectId(
        req,
        res
      );

    if (!projectId) {
      return;
    }

    const environmentName =
      requireEnvironmentName(
        req,
        res
      );

    if (!environmentName) {
      return;
    }

    const result =
      await callService(
        "getConfigurationSummary",
        {
          userId,

          projectId,

          environmentName,
        }
      );

    const summary =
      sanitizeConfigurationSummary(
        result
      );

    return success(
      res,
      200,
      "Environment configuration summary retrieved.",
      {
        summary,
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Failed to retrieve configuration summary."
    );
  }
}


/* =========================================================
   HEALTH
========================================================= */

async function environmentHealthController(
  req,
  res
) {
  try {
    const result =
      await callService(
        "healthCheck",
        {}
      );

    return success(
      res,
      200,
      "Environment service is healthy.",
      {
        service:
          "environment",

        version:
          SERVICE_VERSION,

        health:
          sanitizeHealthResult(
            result
          ),
      }
    );
  } catch (error) {
    return handleControllerError(
      req,
      res,
      error,
      "Environment service health check failed."
    );
  }
}


/* =========================================================
   INPUT NORMALIZATION
========================================================= */

function normalizeVariableInput(
  body = {}
) {
  const hasValue =
    Object.prototype
      .hasOwnProperty.call(
        body,
        "value"
      );

  return {
    key:
      normalizeVariableKey(
        body.key
      ),

    value:
      hasValue
        ? body.value
        : undefined,

    isSecret:
      sanitizeBoolean(
        body.isSecret,
        false
      ),

    type:
      normalizeVariableType(
        body.type
      ),

    scope:
      normalizeVariableScope(
        body.scope
      ),

    required:
      sanitizeBoolean(
        body.required,
        false
      ),

    description:
      sanitizeDescription(
        body.description
      ),

    source:
      normalizeSourceType(
        body.source
      ),

    sourceReference:
      body.sourceReference !==
        undefined
        ? String(
            body.sourceReference
          )
            .trim()
            .slice(0, 500)
        : body.sourceRef !==
            undefined
          ? String(
              body.sourceRef
            )
              .trim()
              .slice(0, 500)
          : "",
  };
}


function normalizeVariablesInput(
  variables
) {
  return variables.map(
    (variable) =>
      normalizeVariableInput(
        variable || {}
      )
  );
}


function normalizeSourceType(
  value
) {
  const source =
    String(
      value || "manual"
    )
      .trim()
      .toLowerCase();

  const allowed =
    new Set([
      "manual",
      "github",
      "import",
      "generated",
      "system",
    ]);

  return allowed.has(
    source
  )
    ? source
    : "manual";
}


function normalizeSourceInput(
  source
) {
  if (
    !source ||
    typeof source !==
      "object"
  ) {
    return {
      type: "manual",
    };
  }

  return {
    type:
      normalizeSourceType(
        source.type
      ),

    provider:
      source.provider
        ? String(
            source.provider
          )
            .trim()
            .slice(0, 100)
        : null,

    repository:
      source.repository
        ? String(
            source.repository
          )
            .trim()
            .slice(0, 500)
        : null,

    repositoryId:
      source.repositoryId
        ? String(
            source.repositoryId
          )
            .trim()
            .slice(0, 300)
        : null,

    branch:
      source.branch
        ? String(
            source.branch
          )
            .trim()
            .slice(0, 300)
        : null,

    commitSha:
      source.commitSha
        ? String(
            source.commitSha
          )
            .trim()
            .slice(0, 200)
        : null,
  };
}


/* =========================================================
   VARIABLE VALIDATION
========================================================= */

function validateVariableInput(
  variable,
  {
    requireValue = false,
  } = {}
) {
  if (!variable.key) {
    return {
      valid: false,

      code:
        "VARIABLE_KEY_REQUIRED",

      message:
        "Environment variable key is required.",
    };
  }

  if (
    !isValidVariableKey(
      variable.key
    )
  ) {
    return {
      valid: false,

      code:
        "INVALID_VARIABLE_KEY",

      message:
        "Environment variable key is invalid.",
    };
  }

  if (
    !VARIABLE_TYPES.has(
      variable.type
    )
  ) {
    return {
      valid: false,

      code:
        "INVALID_VARIABLE_TYPE",

      message:
        "Invalid environment variable type.",
    };
  }

  if (
    !VARIABLE_SCOPES.has(
      variable.scope
    )
  ) {
    return {
      valid: false,

      code:
        "INVALID_VARIABLE_SCOPE",

      message:
        "Invalid environment variable scope.",
    };
  }

  if (
    requireValue &&
    (
      variable.value ===
        undefined ||
      variable.value ===
        null ||
      String(
        variable.value
      ).length === 0
    )
  ) {
    return {
      valid: false,

      code:
        "VARIABLE_VALUE_REQUIRED",

      message:
        "Environment variable value is required.",
    };
  }

  if (
    variable.type ===
      "json" &&
    variable.value !==
      undefined &&
    variable.value !==
      null
  ) {
    try {
      if (
        typeof variable.value ===
        "string"
      ) {
        JSON.parse(
          variable.value
        );
      }
    } catch {
      return {
        valid: false,

        code:
          "INVALID_JSON_VARIABLE",

        message:
          "Environment variable contains invalid JSON.",
      };
    }
  }

  return {
    valid: true,
  };
}


/* =========================================================
   SAFE DEPLOYMENT READINESS
========================================================= */

function sanitizeDeploymentReadiness(
  result
) {
  if (!result) {
    return {
      ready: false,

      deployable: false,

      status:
        "unknown",
    };
  }

  const source =
    result.readiness ||
    result.data?.readiness ||
    result;

  return {
    ready:
      source.ready ===
      true,

    deployable:
      source.deployable ===
      true,

    status:
      source.status ||
      "unknown",

    environment:
      source.environment
        ? {
            id:
              source.environment.id ||
              source.environment
                ._id ||
              null,

            projectId:
              source.environment
                .projectId ||
              null,

            name:
              source.environment
                .name ||
              null,

            status:
              source.environment
                .status ||
              null,

            version:
              source.environment
                .version ||
              null,

            deployedVersion:
              source.environment
                .deployedVersion ||
              null,
          }
        : null,

    validation:
      source.validation
        ? sanitizeValidation(
            source.validation
          )
        : null,

    reason:
      source.reason ||
      null,
  };
}


/* =========================================================
   SAFE SNAPSHOT
========================================================= */

function sanitizeDeploymentSnapshot(
  snapshot
) {
  if (!snapshot) {
    return {
      includesSecrets:
        false,
    };
  }

  return {
    environmentId:
      snapshot.environmentId ||
      null,

    projectId:
      snapshot.projectId ||
      null,

    environment:
      snapshot.environment ||
      null,

    version:
      snapshot.version ||
      null,

    deploymentId:
      snapshot.deploymentId ||
      null,

    readiness:
      snapshot.readiness
        ? {
            ready:
              snapshot.readiness
                .ready === true,

            deployable:
              snapshot.readiness
                .deployable ===
              true,

            status:
              snapshot.readiness
                .status ||
              "unknown",
          }
        : null,

    includesSecrets:
      false,
  };
}


/* =========================================================
   SAFE VALIDATION
========================================================= */

function sanitizeValidation(
  validation
) {
  if (!validation) {
    return null;
  }

  return {
    status:
      validation.status ||
      "unknown",

    validatedAt:
      validation.validatedAt ||
      validation.checkedAt ||
      null,

    requiredVariables:
      Number(
        validation.requiredVariables ||
          validation.totalRequiredVariables ||
          0
      ),

    configuredVariables:
      Number(
        validation.configuredVariables ||
          0
      ),

    missingVariables:
      Number(
        validation.missingVariables ||
          validation.missingRequiredVariables ||
          0
      ),

    invalidVariables:
      Number(
        validation.invalidVariables ||
          0
      ),

    message:
      validation.message ||
      null,

    invalidKeys:
      Array.isArray(
        validation.invalidKeys
      )
        ? validation.invalidKeys
        : [],
  };
}


/* =========================================================
   CONFIGURATION SUMMARY SANITIZATION
========================================================= */

function sanitizeConfigurationSummary(
  result
) {
  const source =
    result?.summary ||
    result?.data?.summary ||
    result ||
    {};

  return {
    environmentId:
      source.environmentId ||
      null,

    projectId:
      source.projectId ||
      null,

    environment:
      source.environment ||
      null,

    status:
      source.status ||
      "unknown",

    version:
      source.version ||
      null,

    deployedVersion:
      source.deployedVersion ||
      null,

    totalVariables:
      Number(
        source.variableCount ||
          source.totalVariables ||
          0
      ),

    configuredVariables:
      Number(
        source.configuredCount ||
          source.configuredVariables ||
          0
      ),

    secretVariables:
      Number(
        source.secretCount ||
          source.secretVariables ||
          0
      ),

    requiredVariables:
      Number(
        source.requiredCount ||
          source.requiredVariables ||
          0
      ),

    buildVariableCount:
      Number(
        source.buildVariableCount ||
          0
      ),

    runtimeVariableCount:
      Number(
        source.runtimeVariableCount ||
          0
      ),

    validation:
      source.validation
        ? sanitizeValidation(
            source.validation
          )
        : null,

    deployment:
      source.deployment ||
      null,

    lastDeploymentId:
      source.lastDeploymentId ||
      null,

    lastDeployedAt:
      source.lastDeployedAt ||
      null,
  };
}


/* =========================================================
   HEALTH SANITIZATION
========================================================= */

function sanitizeHealthResult(
  result
) {
  const source =
    result?.health ||
    result?.data ||
    result ||
    {};

  return {
    success:
      source.success !==
      false,

    status:
      source.status ||
      "healthy",

    service:
      source.service ||
      "environmentService",

    version:
      source.version ||
      SERVICE_VERSION,

    encryption:
      source.encryption
        ? {
            algorithm:
              source.encryption
                .algorithm ||
              null,

            currentKeyConfigured:
              source.encryption
                .currentKeyConfigured ===
              true,

            previousKeyConfigured:
              source.encryption
                .previousKeyConfigured ===
              true,

            rotationSupported:
              source.encryption
                .rotationSupported !==
              false,

            healthy:
              source.encryption
                .healthy === true,
          }
        : null,
  };
}


/* =========================================================
   CONTROLLER METADATA
========================================================= */

const controller = {
  version:
    SERVICE_VERSION,

  createEnvironment:
    createEnvironmentController,

  listEnvironments:
    listEnvironmentsController,

  getEnvironment:
    getEnvironmentController,

  addVariable:
    addVariableController,

  updateVariable:
    updateVariableController,

  deleteVariable:
    deleteVariableController,

  validateEnvironment:
    validateEnvironmentController,

  deploymentReadiness:
    deploymentReadinessController,

  createDeploymentSnapshot:
    createDeploymentSnapshotController,

  markDeployed:
    markDeployedController,

  archiveEnvironment:
    archiveEnvironmentController,

  unarchiveEnvironment:
    unarchiveEnvironmentController,

  deleteEnvironment:
    deleteEnvironmentController,

  copyEnvironment:
    copyEnvironmentController,

  getConfigurationSummary:
    getConfigurationSummaryController,

  health:
    environmentHealthController,
};


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  controller;
