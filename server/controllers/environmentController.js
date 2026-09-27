/**
 * ZyrionOS - Environment Controller
 * Version: 2.0.1
 *
 * Responsibilities:
 * - Environment CRUD API
 * - Variable management
 * - Validation
 * - Deployment readiness
 * - Deployment snapshot
 * - Deployment state
 * - Archive / unarchive
 * - Environment copy
 * - Configuration summary
 * - Safe responses
 *
 * SECURITY:
 * - Secret values are NEVER returned to the client.
 * - Secret resolution is delegated to environmentService.
 * - Controllers never decrypt secrets directly.
 * - Client supplied deployment state is never trusted.
 */

"use strict";

const environmentService =
  require("../services/environmentService");

const logger =
  require("../services/loggerService");

const {
  formatResponse,
} = require("../utils/responseFormatter");

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const SERVICE_VERSION = "2.0.1";

const ENVIRONMENT_NAMES = new Set([
  "development",
  "preview",
  "production",
]);

const VARIABLE_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "json",
]);

const VARIABLE_SCOPES = new Set([
  "runtime",
  "build",
  "both",
]);

const MAX_DESCRIPTION_LENGTH = 2000;

const MAX_VARIABLE_DESCRIPTION_LENGTH =
  1000;

const MAX_KEY_LENGTH = 256;

const MAX_VARIABLES_PER_REQUEST = 500;

/* -------------------------------------------------------------------------- */
/* Generic Helpers                                                            */
/* -------------------------------------------------------------------------- */

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
    req?.body?.environment ||
    req?.body?.name ||
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

function normalizeEnvironmentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeVariableKey(value) {
  return String(value || "").trim();
}

function normalizeVariableType(value) {
  const type = String(value || "string")
    .trim()
    .toLowerCase();

  return VARIABLE_TYPES.has(type)
    ? type
    : "string";
}

function normalizeVariableScope(value) {
  const scope = String(value || "runtime")
    .trim()
    .toLowerCase();

  return VARIABLE_SCOPES.has(scope)
    ? scope
    : "runtime";
}

function isValidEnvironmentName(value) {
  return ENVIRONMENT_NAMES.has(
    normalizeEnvironmentName(value)
  );
}

function isValidVariableKey(value) {
  const key = normalizeVariableKey(value);

  if (!key) {
    return false;
  }

  if (key.length > MAX_KEY_LENGTH) {
    return false;
  }

  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(
    key
  );
}

function sanitizeDescription(
  value,
  maxLength
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

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no"
  ) {
    return false;
  }

  return defaultValue;
}

function sanitizeError(error) {
  if (!error) {
    return {
      code: "ENVIRONMENT_ERROR",
      message:
        "Environment operation failed.",
    };
  }

  return {
    code:
      error.code ||
      error.name ||
      "ENVIRONMENT_ERROR",

    message:
      error.publicMessage ||
      error.message ||
      "Environment operation failed.",
  };
}

/* -------------------------------------------------------------------------- */
/* Safe Logger Helpers                                                        */
/* -------------------------------------------------------------------------- */

function logError(message, metadata = {}) {
  try {
    const suffix =
      metadata &&
      Object.keys(metadata).length
        ? ` ${safeStringify(metadata)}`
        : "";

    if (
      logger &&
      typeof logger.error === "function"
    ) {
      logger.error(
        `${message}${suffix}`
      );

      return;
    }
  } catch (error) {
    console.error(
      "LOGGER ERROR:",
      error?.message || error
    );
  }

  console.error(
    message,
    metadata
  );
}

function logInfo(message, metadata = {}) {
  try {
    const suffix =
      metadata &&
      Object.keys(metadata).length
        ? ` ${safeStringify(metadata)}`
        : "";

    if (
      logger &&
      typeof logger.info === "function"
    ) {
      logger.info(
        `${message}${suffix}`
      );

      return;
    }
  } catch (error) {
    console.error(
      "LOGGER ERROR:",
      error?.message || error
    );
  }

  console.log(
    message,
    metadata
  );
}

function safeStringify(value) {
  try {
    return JSON.stringify(
      value,
      (key, currentValue) => {
        const sensitiveKeys = [
          "value",
          "secret",
          "token",
          "accessToken",
          "refreshToken",
          "password",
          "apiKey",
          "authorization",
          "encryptedAccessToken",
          "encryptedRefreshToken",
        ];

        if (
          sensitiveKeys.includes(
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

/* -------------------------------------------------------------------------- */
/* Response Helpers                                                           */
/* -------------------------------------------------------------------------- */

function respond(
  res,
  statusCode,
  success,
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
          success,
          message,
          data,
          meta,
        });

      return res
        .status(statusCode)
        .json(payload);
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
      success,
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
  code = "ENVIRONMENT_ERROR",
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
      code: sanitized.code,
      message: sanitized.message,
      stack:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error?.stack,
    }
  );

  const statusCode =
    resolveHttpStatus(error);

  return failure(
    res,
    statusCode,
    sanitized.message ||
      fallbackMessage,
    sanitized.code
  );
}

function resolveHttpStatus(error) {
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

  const code = String(
    error.code || ""
  );

  const statusMap = {
    VALIDATION_ERROR: 400,
    INVALID_REQUEST: 400,
    INVALID_ENVIRONMENT: 400,
    INVALID_VARIABLE: 400,
    INVALID_VARIABLE_KEY: 400,

    PROJECT_ID_REQUIRED: 400,
    ENVIRONMENT_NAME_REQUIRED: 400,
    DEPLOYMENT_ID_REQUIRED: 400,

    VARIABLE_KEY_REQUIRED: 400,
    VARIABLE_VALUE_REQUIRED: 400,
    INVALID_VARIABLE_TYPE: 400,
    INVALID_VARIABLE_SCOPE: 400,
    INVALID_JSON_VARIABLE: 400,

    INVALID_SOURCE_ENVIRONMENT: 400,
    INVALID_TARGET_ENVIRONMENT: 400,
    SAME_SOURCE_TARGET_ENVIRONMENT: 400,

    PRODUCTION_DELETE_CONFIRMATION_REQUIRED: 400,

    ENVIRONMENT_NOT_FOUND: 404,
    PROJECT_NOT_FOUND: 404,

    ENVIRONMENT_EXISTS: 409,
    DUPLICATE_ENVIRONMENT: 409,
    VERSION_CONFLICT: 409,
    CONCURRENCY_CONFLICT: 409,

    ENVIRONMENT_ARCHIVED: 409,
    ENVIRONMENT_LOCKED: 409,

    DEPLOYMENT_NOT_ALLOWED: 409,
    ENVIRONMENT_NOT_READY: 409,

    FORBIDDEN: 403,
    UNAUTHORIZED: 401,

    TOO_MANY_VARIABLES: 413,

    ENCRYPTION_ERROR: 500,
    STORAGE_ERROR: 500,

    ENVIRONMENT_SERVICE_METHOD_MISSING: 500,
  };

  return (
    statusMap[code] ||
    500
  );
}

function requireUser(req, res) {
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
    !isValidEnvironmentName(name)
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

/* -------------------------------------------------------------------------- */
/* Service Compatibility Helpers                                              */
/* -------------------------------------------------------------------------- */

function getServiceMethod(name) {
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

        statusCode: 500,
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

function extractEnvironment(
  result
) {
  if (!result) {
    return null;
  }

  if (result.environment) {
    return result.environment;
  }

  if (
    result.data?.environment
  ) {
    return result.data.environment;
  }

  if (result.data) {
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
    Array.isArray(result.data)
  ) {
    return result.data;
  }

  if (Array.isArray(result)) {
    return result;
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* Create Environment                                                         */
/* -------------------------------------------------------------------------- */

async function createEnvironmentController(
  req,
  res
) {
  const requestId =
    getRequestId(req);

  try {
    const userId =
      requireUser(req, res);

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
          : null,

      description:
        sanitizeDescription(
          req.body?.description,
          MAX_DESCRIPTION_LENGTH
        ),

      variables:
        normalizedVariables,

      source:
        normalizeSourceInput(
          req.body?.source
        ),

      audit: {
        createdBy: userId,
        updatedBy: userId,
        lastAction:
          "environment_created",
        lastActionAt:
          new Date(),
        lastActionBy: userId,
      },

      requestId,
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

/* -------------------------------------------------------------------------- */
/* List Environments                                                          */
/* -------------------------------------------------------------------------- */

async function listEnvironmentsController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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

/* -------------------------------------------------------------------------- */
/* Get Environment                                                            */
/* -------------------------------------------------------------------------- */

async function getEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    const result =
      await callService(
        "getEnvironment",
        {
          userId,
          projectId,
          name,
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

/* -------------------------------------------------------------------------- */
/* Add Variable                                                               */
/* -------------------------------------------------------------------------- */

async function addVariableController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
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

    if (!validation.valid) {
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
          name,

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

          sourceRef:
            normalized.sourceRef,

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

/* -------------------------------------------------------------------------- */
/* Update Variable                                                            */
/* -------------------------------------------------------------------------- */

async function updateVariableController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
          allowMissingValue: true,
        }
      );

    const payload = {
      userId,

      projectId,

      name:
        environmentName,

      currentKey,

      key:
        normalized.key ||
        currentKey,

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

      sourceRef:
        normalized.sourceRef,

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
      Object.prototype.hasOwnProperty.call(
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

/* -------------------------------------------------------------------------- */
/* Delete Variable                                                            */
/* -------------------------------------------------------------------------- */

async function deleteVariableController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
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
          name,
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

/* -------------------------------------------------------------------------- */
/* Validate Environment                                                       */
/* -------------------------------------------------------------------------- */

async function validateEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    const result =
      await callService(
        "validateEnvironment",
        {
          userId,
          projectId,
          name,
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
          environment?.validation ||
          result?.validation ||
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

/* -------------------------------------------------------------------------- */
/* Deployment Readiness                                                       */
/* -------------------------------------------------------------------------- */

async function deploymentReadinessController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    const result =
      await callService(
        "resolveForDeployment",
        {
          userId,
          projectId,
          name,

          metadataOnly: true,
        }
      );

    const readiness =
      extractDeploymentReadiness(
        result
      );

    return success(
      res,
      200,
      "Environment deployment readiness checked.",
      {
        readiness,
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

/* -------------------------------------------------------------------------- */
/* Deployment Snapshot                                                        */
/* -------------------------------------------------------------------------- */

async function createDeploymentSnapshotController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    const deploymentId =
      String(
        req.body?.deploymentId ||
          ""
      ).trim();

    const workflowId =
      String(
        req.body?.workflowId ||
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
        "createDeploymentSnapshot",
        {
          userId,
          projectId,
          name,
          deploymentId,
          workflowId:
            workflowId || null,
        }
      );

    const snapshot =
      result?.snapshot ||
      result?.deployment ||
      result?.data ||
      result;

    return success(
      res,
      200,
      "Deployment snapshot created.",
      {
        snapshot,
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

/* -------------------------------------------------------------------------- */
/* Mark Deployed                                                              */
/* -------------------------------------------------------------------------- */

async function markDeployedController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
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
          name,
          deploymentId,

          workflowId:
            req.body?.workflowId ||
            null,

          version:
            normalizeVersion(
              req.body?.version
            ),

          deployedAt:
            req.body?.deployedAt
              ? new Date(
                  req.body.deployedAt
                )
              : new Date(),
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

/* -------------------------------------------------------------------------- */
/* Archive Environment                                                        */
/* -------------------------------------------------------------------------- */

async function archiveEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    const result =
      await callService(
        "archiveEnvironment",
        {
          userId,
          projectId,
          name,

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

/* -------------------------------------------------------------------------- */
/* Unarchive Environment                                                      */
/* -------------------------------------------------------------------------- */

async function unarchiveEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    const result =
      await callService(
        "unarchiveEnvironment",
        {
          userId,
          projectId,
          name,

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

/* -------------------------------------------------------------------------- */
/* Delete Environment                                                         */
/* -------------------------------------------------------------------------- */

async function deleteEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    if (
      name === "production" &&
      req.body?.confirm !== true
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
          name,

          updatedBy:
            userId,

          expectedVersion:
            normalizeVersion(
              req.body?.expectedVersion
            ),

          confirmProduction:
            req.body?.confirm === true,
        }
      );

    return success(
      res,
      200,
      "Environment deleted successfully.",
      {
        deleted: true,

        environment:
          extractEnvironment(
            result
          ),
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

/* -------------------------------------------------------------------------- */
/* Copy Environment                                                           */
/* -------------------------------------------------------------------------- */

async function copyEnvironmentController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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

    const sourceName =
      normalizeEnvironmentName(
        req.body?.sourceEnvironment ||
          req.body?.sourceName
      );

    const targetName =
      normalizeEnvironmentName(
        req.body?.targetEnvironment ||
          req.body?.targetName
      );

    if (
      !isValidEnvironmentName(
        sourceName
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
        targetName
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
      sourceName === targetName
    ) {
      return failure(
        res,
        400,
        "Source and target environments must be different.",
        "SAME_SOURCE_TARGET_ENVIRONMENT"
      );
    }

    const copySecrets =
      req.body?.copySecrets === true;

    const result =
      await callService(
        "copyEnvironment",
        {
          userId,
          projectId,

          sourceName,
          targetName,

          copySecrets,

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

/* -------------------------------------------------------------------------- */
/* Configuration Summary                                                      */
/* -------------------------------------------------------------------------- */

async function getConfigurationSummaryController(
  req,
  res
) {
  try {
    const userId =
      requireUser(req, res);

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
      requireEnvironmentName(
        req,
        res
      );

    if (!name) {
      return;
    }

    const result =
      await callService(
        "getConfigurationSummary",
        {
          userId,
          projectId,
          name,
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

/* -------------------------------------------------------------------------- */
/* Health Check                                                               */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Input Normalization                                                        */
/* -------------------------------------------------------------------------- */

function normalizeVariableInput(
  body = {},
  options = {}
) {
  const hasValue =
    Object.prototype.hasOwnProperty.call(
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
        body.description,
        MAX_VARIABLE_DESCRIPTION_LENGTH
      ),

    source:
      normalizeSourceType(
        body.source
      ),

    sourceRef:
      body.sourceRef
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
  const source = String(
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

  return allowed.has(source)
    ? source
    : "manual";
}

function normalizeSourceInput(
  source
) {
  if (
    !source ||
    typeof source !== "object"
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
            .slice(0, 100)
        : null,
  };
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
    !Number.isInteger(number) ||
    number < 1
  ) {
    return undefined;
  }

  return number;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function validateVariableInput(
  variable,
  {
    requireValue = false,
  } = {}
) {
  if (!variable.key) {
    return {
      valid: false,
      code: "VARIABLE_KEY_REQUIRED",
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
      code: "INVALID_VARIABLE_KEY",
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
      code: "INVALID_VARIABLE_TYPE",
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
      code: "INVALID_VARIABLE_SCOPE",
      message:
        "Invalid environment variable scope.",
    };
  }

  if (
    requireValue &&
    (
      variable.value ===
        undefined ||
      variable.value === null ||
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
    variable.type === "json" &&
    variable.value !==
      undefined &&
    variable.value !== null
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

/* -------------------------------------------------------------------------- */
/* Safe Result Filters                                                        */
/* -------------------------------------------------------------------------- */

function extractDeploymentReadiness(
  result
) {
  if (!result) {
    return {
      ready: false,
      status: "unknown",
    };
  }

  const source =
    result.readiness ||
    result.data?.readiness ||
    result;

  return {
    ready:
      source.ready === true ||
      source.deployable === true,

    deployable:
      source.deployable === true,

    status:
      source.status ||
      null,

    validation:
      source.validation
        ? sanitizeValidation(
            source.validation
          )
        : null,

    environment:
      source.environment
        ? sanitizeEnvironment(
            source.environment
          )
        : null,

    reason:
      source.reason ||
      source.message ||
      null,
  };
}

function sanitizeEnvironment(
  environment
) {
  if (!environment) {
    return null;
  }

  return {
    id:
      environment.id ||
      environment._id ||
      null,

    projectId:
      environment.projectId ||
      null,

    name:
      environment.name ||
      null,

    status:
      environment.status ||
      null,

    version:
      environment.version ||
      null,

    validation:
      environment.validation
        ? sanitizeValidation(
            environment.validation
          )
        : null,
  };
}

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

    checkedAt:
      validation.checkedAt ||
      null,

    totalVariables:
      Number(
        validation.totalVariables ||
          0
      ),

    configuredVariables:
      Number(
        validation.configuredVariables ||
          0
      ),

    missingRequiredVariables:
      Number(
        validation.missingRequiredVariables ||
          0
      ),

    invalidVariables:
      Number(
        validation.invalidVariables ||
          0
      ),

    errors:
      Array.isArray(
        validation.errors
      )
        ? validation.errors.map(
            (item) => ({
              key:
                item?.key ||
                null,

              message:
                item?.message ||
                "Validation error.",
            })
          )
        : [],
  };
}

function sanitizeConfigurationSummary(
  result
) {
  const source =
    result?.summary ||
    result?.data?.summary ||
    result ||
    {};

  return {
    totalVariables:
      Number(
        source.totalVariables ||
          0
      ),

    configuredVariables:
      Number(
        source.configuredVariables ||
          0
      ),

    secretVariables:
      Number(
        source.secretVariables ||
          0
      ),

    requiredVariables:
      Number(
        source.requiredVariables ||
          0
      ),

    missingRequiredVariables:
      Number(
        source.missingRequiredVariables ||
          0
      ),

    invalidVariables:
      Number(
        source.invalidVariables ||
          0
      ),

    validationStatus:
      source.validationStatus ||
      source.status ||
      "unknown",

    variables:
      Array.isArray(
        source.variables
      )
        ? source.variables.map(
            (variable) => ({
              key:
                variable?.key ||
                null,

              isSecret:
                variable?.isSecret ===
                true,

              hasValue:
                variable?.hasValue ===
                true,

              required:
                variable?.required ===
                true,

              type:
                variable?.type ||
                "string",

              scope:
                variable?.scope ||
                "runtime",

              validation:
                variable?.validation
                  ?.status ||
                "unknown",
            })
          )
        : [],
  };
}

function sanitizeHealthResult(
  result
) {
  const source =
    result?.health ||
    result?.data ||
    result ||
    {};

  return {
    status:
      source.status ||
      "unknown",

    service:
      source.service ||
      "environment",

    version:
      source.version ||
      SERVICE_VERSION,

    encryption:
      source.encryption
        ? {
            configured:
              source.encryption
                .configured ===
              true,

            version:
              source.encryption
                .version ||
              null,
          }
        : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Controller Metadata                                                        */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

module.exports =
  controller;
