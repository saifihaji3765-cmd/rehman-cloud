/**
 * ZyrionOS - Environment Agent
 * Version: 1.0.0
 *
 * Responsibilities:
 * - Orchestrate environment operations
 * - Create/update/delete environments
 * - Manage environment variables
 * - Validate configuration
 * - Check deployment readiness
 * - Create deployment snapshots
 * - Mark deployments as completed
 * - Archive/unarchive environments
 * - Copy environments
 * - Coordinate deployment secret resolution
 * - Protect secret boundaries
 * - Provide a stable Agent API for Master/Deploy Agents
 *
 * IMPORTANT:
 *
 * This Agent:
 * - DOES NOT call an AI provider.
 * - DOES NOT decrypt secrets itself.
 * - DOES NOT expose secret values to users.
 * - DOES NOT modify MongoDB directly.
 * - DOES NOT deploy infrastructure.
 *
 * Architecture:
 *
 * Master Agent
 *      ↓
 * Environment Agent
 *      ↓
 * Environment Service
 *      ↓
 * Environment Model
 *      ↓
 * MongoDB
 *
 * Deployment:
 *
 * Deploy Agent
 *      ↓
 * Environment Agent
 *      ↓
 * Environment Service
 *      ↓
 * resolveForDeployment()
 *      ↓
 * Docker / AWS
 */

"use strict";


/* =========================================================
   DEPENDENCIES
========================================================= */

const environmentService =
  require("../services/environmentService");

const logger =
  require("../services/loggerService");


/* =========================================================
   CONSTANTS
========================================================= */

const AGENT_NAME =
  "environmentAgent";

const AGENT_VERSION =
  "1.0.0";


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


const MAX_VARIABLES =
  500;


/* =========================================================
   ERROR CLASS
========================================================= */

class EnvironmentAgentError
  extends Error {

  constructor(
    message,
    code = "ENVIRONMENT_AGENT_ERROR",
    statusCode = 500,
    details = null
  ) {

    super(message);

    this.name =
      "EnvironmentAgentError";

    this.code =
      code;

    this.statusCode =
      statusCode;

    this.details =
      sanitizeDetails(details);

    Error.captureStackTrace(
      this,
      EnvironmentAgentError
    );

  }

}


/* =========================================================
   SAFE LOGGING
========================================================= */

/**
 * Never log:
 *
 * - secret values
 * - encrypted values
 * - environment variable values
 * - authorization headers
 * - API keys
 * - passwords
 * - tokens
 */
const SECRET_FIELD_NAMES =
  new Set([
    "value",
    "secret",
    "password",
    "token",
    "apiKey",
    "api_key",
    "accessToken",
    "refreshToken",
    "privateKey",
    "encryptedValue",
    "plainValue",
    "credentials",
  ]);


function sanitizeDetails(
  value,
  depth = 0
) {

  if (depth > 5) {
    return "[truncated]";
  }


  if (
    value === null ||
    value === undefined
  ) {

    return value;

  }


  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {

    return value;

  }


  if (Array.isArray(value)) {

    return value.map(
      item =>
        sanitizeDetails(
          item,
          depth + 1
        )
    );

  }


  if (
    typeof value === "object"
  ) {

    const result = {};


    for (
      const [
        key,
        item
      ] of Object.entries(value)
    ) {

      if (
        SECRET_FIELD_NAMES.has(
          key
        )
      ) {

        result[key] =
          "[REDACTED]";

        continue;

      }


      result[key] =
        sanitizeDetails(
          item,
          depth + 1
        );

    }


    return result;

  }


  return "[unsupported]";

}


/* =========================================================
   LOG HELPERS
========================================================= */

function logInfo(
  message,
  metadata = {}
) {

  try {

    if (
      typeof logger?.info ===
      "function"
    ) {

      logger.info(
        message,
        sanitizeDetails(
          metadata
        )
      );

      return;

    }

  } catch (
    error
  ) {

    // Fall through to console.

  }


  console.log(
    `[${AGENT_NAME}] ${message}`,
    sanitizeDetails(
      metadata
    )
  );

}


function logWarn(
  message,
  metadata = {}
) {

  try {

    if (
      typeof logger?.warn ===
      "function"
    ) {

      logger.warn(
        message,
        sanitizeDetails(
          metadata
        )
      );

      return;

    }

  } catch (
    error
  ) {

    // Fall through.

  }


  console.warn(
    `[${AGENT_NAME}] ${message}`,
    sanitizeDetails(
      metadata
    )
  );

}


function logError(
  message,
  metadata = {}
) {

  const safe =
    sanitizeDetails(
      metadata
    );


  try {

    if (
      typeof logger?.error ===
      "function"
    ) {

      logger.error(
        message,
        safe
      );

      return;

    }

  } catch (
    error
  ) {

    // Fall through.

  }


  console.error(
    `[${AGENT_NAME}] ${message}`,
    safe
  );

}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function getUserId(
  input = {}
) {

  return (
    input.userId ||
    input.user?._id ||
    input.user?.id ||
    input.auth?.userId ||
    null
  );

}


function getProjectId(
  input = {}
) {

  return (
    input.projectId ||
    input.project?._id ||
    input.project?.id ||
    null
  );

}


function normalizeId(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  const normalized =
    String(value).trim();


  return normalized ||
    null;

}


function normalizeEnvironmentName(
  value
) {

  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();


  if (
    !ENVIRONMENT_NAMES.has(
      normalized
    )
  ) {

    throw new EnvironmentAgentError(
      `Invalid environment: ${normalized || "empty"}`,
      "INVALID_ENVIRONMENT",
      400
    );

  }


  return normalized;

}


function normalizeVariableKey(
  value
) {

  const key =
    String(value || "")
      .trim();


  if (!key) {

    throw new EnvironmentAgentError(
      "Environment variable key is required.",
      "VARIABLE_KEY_REQUIRED",
      400
    );

  }


  if (
    key.length > 256
  ) {

    throw new EnvironmentAgentError(
      "Environment variable key is too long.",
      "INVALID_VARIABLE_KEY",
      400
    );

  }


  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
      key
    )
  ) {

    throw new EnvironmentAgentError(
      `Invalid environment variable key: ${key}`,
      "INVALID_VARIABLE_KEY",
      400
    );

  }


  return key;

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


  if (
    !VARIABLE_TYPES.has(
      type
    )
  ) {

    throw new EnvironmentAgentError(
      `Invalid variable type: ${type}`,
      "INVALID_VARIABLE_TYPE",
      400
    );

  }


  return type;

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


  if (
    !VARIABLE_SCOPES.has(
      scope
    )
  ) {

    throw new EnvironmentAgentError(
      `Invalid variable scope: ${scope}`,
      "INVALID_VARIABLE_SCOPE",
      400
    );

  }


  return scope;

}


function normalizeBoolean(
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
    normalized ===
      "true" ||
    normalized ===
      "1" ||
    normalized ===
      "yes"
  ) {

    return true;

  }


  if (
    normalized ===
      "false" ||
    normalized ===
      "0" ||
    normalized ===
      "no"
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


  const version =
    Number(value);


  if (
    !Number.isInteger(
      version
    ) ||
    version < 1
  ) {

    throw new EnvironmentAgentError(
      "Invalid environment version.",
      "INVALID_VERSION",
      400
    );

  }


  return version;

}


/* =========================================================
   SERVICE VALIDATION
========================================================= */

function requireServiceMethod(
  methodName
) {

  if (
    !environmentService ||
    typeof environmentService[
      methodName
    ] !== "function"
  ) {

    throw new EnvironmentAgentError(
      `Environment service method '${methodName}' is unavailable.`,
      "ENVIRONMENT_SERVICE_METHOD_MISSING",
      500
    );

  }


  return environmentService[
    methodName
  ];

}


/* =========================================================
   SERVICE CALL
========================================================= */

async function callService(
  methodName,
  payload
) {

  const method =
    requireServiceMethod(
      methodName
    );


  const safePayload =
    sanitizeDetails(
      payload
    );


  logInfo(
    `Calling environment service: ${methodName}`,
    {
      method:
        methodName,

      userId:
        payload?.userId,

      projectId:
        payload?.projectId,

      environment:
        payload?.name ||
        payload?.environmentName,

      requestId:
        payload?.requestId,
    }
  );


  try {

    return await method(
      payload
    );

  } catch (
    error
  ) {

    logError(
      `Environment service failed: ${methodName}`,
      {
        method:
          methodName,

        userId:
          payload?.userId,

        projectId:
          payload?.projectId,

        environment:
          payload?.name ||
          payload?.environmentName,

        requestId:
          payload?.requestId,

        error: {
          code:
            error?.code,

          message:
            error?.message,

          details:
            error?.details,
        },

        payload:
          safePayload,
      }
    );


    throw normalizeServiceError(
      error
    );

  }

}


/* =========================================================
   SERVICE ERROR NORMALIZATION
========================================================= */

function normalizeServiceError(
  error
) {

  if (
    error instanceof
    EnvironmentAgentError
  ) {

    return error;

  }


  const message =
    error?.publicMessage ||
    error?.message ||
    "Environment operation failed.";


  const code =
    error?.code ||
    "ENVIRONMENT_SERVICE_ERROR";


  const statusCode =
    Number.isInteger(
      error?.statusCode
    )
      ? error.statusCode
      : Number.isInteger(
          error?.status
        )
        ? error.status
        : mapErrorCodeToStatus(
            code
          );


  return new EnvironmentAgentError(
    message,
    code,
    statusCode,
    error?.details
  );

}


function mapErrorCodeToStatus(
  code
) {

  const map = {

    UNAUTHORIZED:
      401,

    FORBIDDEN:
      403,

    ENVIRONMENT_NOT_FOUND:
      404,

    PROJECT_NOT_FOUND:
      404,

    INVALID_ENVIRONMENT:
      400,

    INVALID_VARIABLE:
      400,

    VARIABLE_KEY_REQUIRED:
      400,

    INVALID_VARIABLE_KEY:
      400,

    INVALID_VARIABLE_TYPE:
      400,

    INVALID_VARIABLE_SCOPE:
      400,

    VERSION_CONFLICT:
      409,

    CONCURRENCY_CONFLICT:
      409,

    ENVIRONMENT_LOCKED:
      409,

    ENVIRONMENT_ARCHIVED:
      409,

    ENVIRONMENT_NOT_READY:
      409,

    DEPLOYMENT_NOT_ALLOWED:
      409,

    ENVIRONMENT_EXISTS:
      409,

    DUPLICATE_ENVIRONMENT:
      409,

  };


  return (
    map[code] ||
    500
  );

}


/* =========================================================
   CONTEXT VALIDATION
========================================================= */

function requireContext(
  input
) {

  const userId =
    normalizeId(
      getUserId(
        input
      )
    );


  const projectId =
    normalizeId(
      getProjectId(
        input
      )
    );


  if (!userId) {

    throw new EnvironmentAgentError(
      "User ID is required.",
      "UNAUTHORIZED",
      401
    );

  }


  if (!projectId) {

    throw new EnvironmentAgentError(
      "Project ID is required.",
      "PROJECT_ID_REQUIRED",
      400
    );

  }


  return {
    userId,
    projectId,
  };

}


/* =========================================================
   CREATE ENVIRONMENT
========================================================= */

async function createEnvironment(
  input = {}
) {

  const startedAt =
    Date.now();


  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const variables =
    normalizeVariables(
      input.variables
    );


  if (
    variables.length >
    MAX_VARIABLES
  ) {

    throw new EnvironmentAgentError(
      `Maximum ${MAX_VARIABLES} environment variables are allowed.`,
      "TOO_MANY_VARIABLES",
      413
    );

  }


  logInfo(
    "Creating environment",
    {
      userId,
      projectId,
      name,
      variableCount:
        variables.length,
      requestId:
        input.requestId,
    }
  );


  const result =
    await callService(
      "createEnvironment",
      {
        ...input,

        userId,
        projectId,
        name,
        variables,

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment created successfully.",
    {
      operation:
        "create",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),

      durationMs:
        Date.now() -
        startedAt,
    }
  );

}


/* =========================================================
   LIST ENVIRONMENTS
========================================================= */

async function listEnvironments(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const result =
    await callService(
      "listEnvironments",
      {
        userId,
        projectId,

        includeArchived:
          normalizeBoolean(
            input.includeArchived,
            false
          ),

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environments retrieved successfully.",
    {
      operation:
        "list",

      environments:
        extractEnvironments(
          result
        ).map(
          sanitizeEnvironmentResult
        ),
    }
  );

}


/* =========================================================
   GET ENVIRONMENT
========================================================= */

async function getEnvironment(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const result =
    await callService(
      "getEnvironment",
      {
        userId,
        projectId,
        name,

        requestId:
          input.requestId ||
          null,
      }
    );


  const environment =
    extractEnvironment(
      result
    );


  if (!environment) {

    throw new EnvironmentAgentError(
      "Environment not found.",
      "ENVIRONMENT_NOT_FOUND",
      404
    );

  }


  return agentSuccess(
    "Environment retrieved successfully.",
    {
      operation:
        "get",

      environment:
        sanitizeEnvironmentResult(
          environment
        ),
    }
  );

}


/* =========================================================
   ADD VARIABLE
========================================================= */

async function addVariable(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const variable =
    normalizeVariableInput(
      input
    );


  validateVariable(
    variable,
    {
      requireValue:
        true,
    }
  );


  const result =
    await callService(
      "addVariable",
      {
        userId,
        projectId,
        name,

        key:
          variable.key,

        value:
          variable.value,

        isSecret:
          variable.isSecret,

        type:
          variable.type,

        scope:
          variable.scope,

        required:
          variable.required,

        description:
          variable.description,

        source:
          variable.source,

        sourceRef:
          variable.sourceRef,

        expectedVersion:
          normalizeVersion(
            input.expectedVersion
          ),

        updatedBy:
          userId,

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment variable added successfully.",
    {
      operation:
        "add_variable",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),
    }
  );

}


/* =========================================================
   UPDATE VARIABLE
========================================================= */

async function updateVariable(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const currentKey =
    normalizeVariableKey(
      input.currentKey ||
      input.key
    );


  const variable =
    normalizeVariableInput(
      input,
      {
        allowMissingValue:
          true,
      }
    );


  if (
    variable.key &&
    !variable.key.length
  ) {

    variable.key =
      currentKey;

  }


  if (
    variable.key
  ) {

    normalizeVariableKey(
      variable.key
    );

  }


  const payload = {

    userId,

    projectId,

    name,

    currentKey,

    key:
      variable.key ||
      currentKey,

    type:
      variable.type,

    scope:
      variable.scope,

    required:
      variable.required,

    description:
      variable.description,

    source:
      variable.source,

    sourceRef:
      variable.sourceRef,

    isSecret:
      variable.isSecret,

    expectedVersion:
      normalizeVersion(
        input.expectedVersion
      ),

    updatedBy:
      userId,

    requestId:
      input.requestId ||
      null,

  };


  /**
   * Critical:
   *
   * If `value` was not supplied, do NOT send an
   * undefined value to the service.
   *
   * This allows metadata-only updates.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "value"
    )
  ) {

    payload.value =
      input.value;

  }


  const result =
    await callService(
      "updateVariable",
      payload
    );


  return agentSuccess(
    "Environment variable updated successfully.",
    {
      operation:
        "update_variable",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),
    }
  );

}


/* =========================================================
   DELETE VARIABLE
========================================================= */

async function deleteVariable(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const key =
    normalizeVariableKey(
      input.key
    );


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
            input.expectedVersion
          ),

        updatedBy:
          userId,

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment variable deleted successfully.",
    {
      operation:
        "delete_variable",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),
    }
  );

}


/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

async function validateEnvironment(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const result =
    await callService(
      "validateEnvironment",
      {
        userId,
        projectId,
        name,

        requestId:
          input.requestId ||
          null,
      }
    );


  const environment =
    extractEnvironment(
      result
    );


  return agentSuccess(
    "Environment validation completed.",
    {
      operation:
        "validate",

      environment:
        sanitizeEnvironmentResult(
          environment
        ),

      validation:
        sanitizeValidation(
          result?.validation ||
          environment?.validation
        ),
    }
  );

}


/* =========================================================
   DEPLOYMENT READINESS
========================================================= */

async function checkDeploymentReadiness(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  /**
   * The service owns the actual deployment-secret
   * boundary.
   *
   * We ask for metadata/readiness only.
   */
  const result =
    await callService(
      "resolveForDeployment",
      {
        userId,
        projectId,
        name,

        metadataOnly:
          true,

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment deployment readiness checked.",
    {
      operation:
        "deployment_readiness",

      readiness:
        sanitizeDeploymentReadiness(
          result
        ),
    }
  );

}


/* =========================================================
   RESOLVE FOR DEPLOYMENT
=========================================================

   This is the ONLY Agent-level operation that is allowed
   to receive resolved deployment configuration.

   IMPORTANT:
   - It must only be called by a trusted server-side
     deployment workflow.
   - It must NEVER be exposed directly to frontend routes.
   - It must NEVER log its returned values.
========================================================= */

async function resolveForDeployment(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  if (
    input.trustedContext !==
    true
  ) {

    throw new EnvironmentAgentError(
      "Deployment environment resolution requires a trusted server context.",
      "TRUSTED_CONTEXT_REQUIRED",
      403
    );

  }


  if (
    !input.workflowId
  ) {

    throw new EnvironmentAgentError(
      "Workflow ID is required for deployment environment resolution.",
      "WORKFLOW_ID_REQUIRED",
      400
    );

  }


  logInfo(
    "Resolving environment for trusted deployment workflow",
    {
      userId,
      projectId,
      name,
      workflowId:
        input.workflowId,
      requestId:
        input.requestId,
    }
  );


  /**
   * DO NOT log this result.
   *
   * It can contain plaintext deployment secrets.
   */
  const result =
    await callService(
      "resolveForDeployment",
      {
        userId,
        projectId,
        name,

        workflowId:
          input.workflowId,

        deploymentId:
          input.deploymentId ||
          null,

        metadataOnly:
          false,

        requestId:
          input.requestId ||
          null,
      }
    );


  /**
   * Return internally only.
   *
   * The caller is responsible for keeping this object
   * inside the trusted deployment pipeline.
   */
  return {
    success:
      true,

    operation:
      "resolve_for_deployment",

    environment:
      result?.environment ||
      null,

    variables:
      result?.variables ||
      result?.resolvedVariables ||
      result?.env ||
      {},

    deployment:
      sanitizeDeploymentMetadata(
        result?.deployment
      ),

    resolvedAt:
      new Date().toISOString(),
  };

}


/* =========================================================
   CREATE DEPLOYMENT SNAPSHOT
========================================================= */

async function createDeploymentSnapshot(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const deploymentId =
    String(
      input.deploymentId ||
      ""
    ).trim();


  if (!deploymentId) {

    throw new EnvironmentAgentError(
      "Deployment ID is required.",
      "DEPLOYMENT_ID_REQUIRED",
      400
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
          input.workflowId ||
          null,

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Deployment environment snapshot created.",
    {
      operation:
        "create_deployment_snapshot",

      snapshot:
        sanitizeDeploymentSnapshot(
          result?.snapshot ||
          result?.deployment ||
          result?.data ||
          result
        ),
    }
  );

}


/* =========================================================
   MARK DEPLOYED
========================================================= */

async function markDeployed(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const deploymentId =
    String(
      input.deploymentId ||
      ""
    ).trim();


  if (!deploymentId) {

    throw new EnvironmentAgentError(
      "Deployment ID is required.",
      "DEPLOYMENT_ID_REQUIRED",
      400
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
          input.workflowId ||
          null,

        version:
          normalizeVersion(
            input.version
          ),

        deployedAt:
          input.deployedAt
            ? new Date(
                input.deployedAt
              )
            : new Date(),

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment deployment state updated.",
    {
      operation:
        "mark_deployed",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),
    }
  );

}


/* =========================================================
   ARCHIVE ENVIRONMENT
========================================================= */

async function archiveEnvironment(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


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
            input.expectedVersion
          ),

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment archived successfully.",
    {
      operation:
        "archive",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),
    }
  );

}


/* =========================================================
   UNARCHIVE ENVIRONMENT
========================================================= */

async function unarchiveEnvironment(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


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
            input.expectedVersion
          ),

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment restored successfully.",
    {
      operation:
        "unarchive",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),
    }
  );

}


/* =========================================================
   DELETE ENVIRONMENT
========================================================= */

async function deleteEnvironment(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  /**
   * Production deletion requires explicit confirmation.
   */
  if (
    name === "production" &&
    input.confirmProduction !==
      true
  ) {

    throw new EnvironmentAgentError(
      "Production environment deletion requires explicit confirmation.",
      "PRODUCTION_DELETE_CONFIRMATION_REQUIRED",
      400
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
            input.expectedVersion
          ),

        confirmProduction:
          input.confirmProduction ===
          true,

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment deleted successfully.",
    {
      operation:
        "delete",

      deleted:
        true,

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),
    }
  );

}


/* =========================================================
   COPY ENVIRONMENT
========================================================= */

async function copyEnvironment(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const sourceName =
    normalizeEnvironmentName(
      input.sourceName ||
      input.sourceEnvironment
    );


  const targetName =
    normalizeEnvironmentName(
      input.targetName ||
      input.targetEnvironment
    );


  if (
    sourceName ===
    targetName
  ) {

    throw new EnvironmentAgentError(
      "Source and target environments must be different.",
      "SAME_SOURCE_TARGET_ENVIRONMENT",
      400
    );

  }


  /**
   * Secret copying is deliberately disabled unless explicitly
   * requested by a trusted server-side workflow.
   */
  const copySecrets =
    input.trustedContext ===
      true &&
    input.copySecrets ===
      true;


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

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment copied successfully.",
    {
      operation:
        "copy",

      environment:
        sanitizeEnvironmentResult(
          extractEnvironment(
            result
          )
        ),

      secretsCopied:
        copySecrets,
    }
  );

}


/* =========================================================
   CONFIGURATION SUMMARY
========================================================= */

async function getConfigurationSummary(
  input = {}
) {

  const {
    userId,
    projectId,
  } =
    requireContext(
      input
    );


  const name =
    normalizeEnvironmentName(
      input.name ||
      input.environmentName ||
      input.environment
    );


  const result =
    await callService(
      "getConfigurationSummary",
      {
        userId,
        projectId,
        name,

        requestId:
          input.requestId ||
          null,
      }
    );


  return agentSuccess(
    "Environment configuration summary retrieved.",
    {
      operation:
        "configuration_summary",

      summary:
        sanitizeConfigurationSummary(
          result
        ),
    }
  );

}


/* =========================================================
   SERVICE HEALTH
========================================================= */

async function healthCheck(
  input = {}
) {

  const result =
    await callService(
      "healthCheck",
      {}
    );


  return agentSuccess(
    "Environment service health check completed.",
    {
      operation:
        "health",

      health:
        sanitizeHealth(
          result
        ),
    }
  );

}


/* =========================================================
   VARIABLE NORMALIZATION
========================================================= */

function normalizeVariableInput(
  input = {},
  options = {}
) {

  const hasValue =
    Object.prototype.hasOwnProperty.call(
      input,
      "value"
    );


  const variable = {

    key:
      input.key
        ? normalizeVariableKey(
            input.key
          )
        : "",

    type:
      normalizeVariableType(
        input.type
      ),

    scope:
      normalizeVariableScope(
        input.scope
      ),

    isSecret:
      normalizeBoolean(
        input.isSecret,
        false
      ),

    required:
      normalizeBoolean(
        input.required,
        false
      ),

    description:
      String(
        input.description ||
        ""
      )
        .trim()
        .slice(
          0,
          1000
        ),

    source:
      normalizeSource(
        input.source
      ),

    sourceRef:
      String(
        input.sourceRef ||
        ""
      )
        .trim()
        .slice(
          0,
          500
        ),

  };


  if (
    hasValue
  ) {

    variable.value =
      input.value;

  } else if (
    options.allowMissingValue !==
    true
  ) {

    variable.value =
      undefined;

  }


  return variable;

}


function normalizeVariables(
  variables
) {

  if (
    variables ===
      undefined ||
    variables ===
      null
  ) {

    return [];

  }


  if (
    !Array.isArray(
      variables
    )
  ) {

    throw new EnvironmentAgentError(
      "Environment variables must be an array.",
      "INVALID_VARIABLES",
      400
    );

  }


  return variables.map(
    variable =>
      normalizeVariableInput(
        variable || {}
      )
  );

}


function normalizeSource(
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


/* =========================================================
   VARIABLE VALIDATION
========================================================= */

function validateVariable(
  variable,
  {
    requireValue = false,
  } = {}
) {

  if (
    !variable.key
  ) {

    throw new EnvironmentAgentError(
      "Environment variable key is required.",
      "VARIABLE_KEY_REQUIRED",
      400
    );

  }


  if (
    !variable.type ||
    !VARIABLE_TYPES.has(
      variable.type
    )
  ) {

    throw new EnvironmentAgentError(
      "Invalid environment variable type.",
      "INVALID_VARIABLE_TYPE",
      400
    );

  }


  if (
    !variable.scope ||
    !VARIABLE_SCOPES.has(
      variable.scope
    )
  ) {

    throw new EnvironmentAgentError(
      "Invalid environment variable scope.",
      "INVALID_VARIABLE_SCOPE",
      400
    );

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

    throw new EnvironmentAgentError(
      "Environment variable value is required.",
      "VARIABLE_VALUE_REQUIRED",
      400
    );

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

    } catch (
      error
    ) {

      throw new EnvironmentAgentError(
        "Environment variable contains invalid JSON.",
        "INVALID_JSON_VARIABLE",
        400
      );

    }

  }


  return true;

}


/* =========================================================
   RESULT HELPERS
========================================================= */

function agentSuccess(
  message,
  data = {}
) {

  return {

    success:
      true,

    agent:
      AGENT_NAME,

    version:
      AGENT_VERSION,

    message,

    timestamp:
      new Date().toISOString(),

    ...data,

  };

}


function extractEnvironment(
  result
) {

  if (
    !result
  ) {

    return null;

  }


  if (
    result.environment
  ) {

    return result.environment;

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

  if (
    !result
  ) {

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
    Array.isArray(
      result
    )
  ) {

    return result;

  }


  return [];

}


/* =========================================================
   SAFE ENVIRONMENT RESULT
========================================================= */

function sanitizeEnvironmentResult(
  environment
) {

  if (
    !environment
  ) {

    return null;

  }


  /**
   * Prefer the Model/Service safe representation if
   * available.
   */
  if (
    typeof environment.toSafeObject ===
    "function"
  ) {

    return environment.toSafeObject();

  }


  const variables =
    Array.isArray(
      environment.variables
    )
      ? environment.variables.map(
          variable => {

            const isSecret =
              variable?.isSecret ===
              true;


            return {

              key:
                variable?.key ||
                null,

              type:
                variable?.type ||
                "string",

              scope:
                variable?.scope ||
                "runtime",

              isSecret,

              required:
                variable?.required ===
                true,

              description:
                variable?.description ||
                "",

              source:
                variable?.source ||
                "manual",

              sourceRef:
                variable?.sourceRef ||
                "",

              hasValue:
                variable?.hasValue ===
                true,

              maskedValue:
                isSecret
                  ? "••••••••"
                  : (
                      variable?.hasValue
                        ? variable?.plainValue ||
                          ""
                        : ""
                    ),

              validation:
                sanitizeVariableValidation(
                  variable?.validation
                ),

            };

          }
        )
      : [];


  return {

    id:
      environment.id ||
      environment._id ||
      null,

    userId:
      environment.userId ||
      null,

    projectId:
      environment.projectId ||
      null,

    name:
      environment.name ||
      null,

    displayName:
      environment.displayName ||
      null,

    description:
      environment.description ||
      "",

    status:
      environment.status ||
      "draft",

    isActive:
      environment.isActive !==
      false,

    isArchived:
      environment.isArchived ===
      true,

    version:
      environment.version ||
      1,

    variables,

    validation:
      sanitizeValidation(
        environment.validation
      ),

    deployment:
      sanitizeDeploymentMetadata(
        environment.deployment
      ),

    source:
      sanitizeSourceMetadata(
        environment.source
      ),

    audit:
      sanitizeAudit(
        environment.audit
      ),

    configurationHash:
      environment.configurationHash ||
      null,

    deploymentLock:
      sanitizeDeploymentLock(
        environment.deploymentLock
      ),

    createdAt:
      environment.createdAt ||
      null,

    updatedAt:
      environment.updatedAt ||
      null,

  };

}


/* =========================================================
   VALIDATION SANITIZER
========================================================= */

function sanitizeValidation(
  validation
) {

  if (
    !validation
  ) {

    return {

      status:
        "unknown",

      checkedAt:
        null,

      totalVariables:
        0,

      configuredVariables:
        0,

      missingRequiredVariables:
        0,

      invalidVariables:
        0,

      errors:
        [],

    };

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
            error => ({

              key:
                error?.key ||
                null,

              message:
                error?.message ||
                "Validation error.",

            })
          )
        : [],

  };

}


function sanitizeVariableValidation(
  validation
) {

  if (
    !validation
  ) {

    return {

      status:
        "unknown",

      message:
        "",

      checkedAt:
        null,

    };

  }


  return {

    status:
      validation.status ||
      "unknown",

    message:
      validation.message ||
      "",

    checkedAt:
      validation.checkedAt ||
      null,

  };

}


/* =========================================================
   DEPLOYMENT SANITIZER
========================================================= */

function sanitizeDeploymentMetadata(
  deployment
) {

  if (
    !deployment
  ) {

    return {

      version:
        0,

      status:
        "never",

      deploymentId:
        null,

      workflowId:
        null,

      startedAt:
        null,

      completedAt:
        null,

      lastError:
        "",

      variableCount:
        0,

      configurationHash:
        null,

    };

  }


  return {

    version:
      deployment.version ||
      0,

    status:
      deployment.status ||
      "never",

    deploymentId:
      deployment.deploymentId ||
      null,

    workflowId:
      deployment.workflowId ||
      null,

    startedAt:
      deployment.startedAt ||
      null,

    completedAt:
      deployment.completedAt ||
      null,

    lastError:
      deployment.lastError ||
      "",

    variableCount:
      Number(
        deployment.variableCount ||
        0
      ),

    configurationHash:
      deployment.configurationHash ||
      null,

  };

}


function sanitizeDeploymentSnapshot(
  snapshot
) {

  return sanitizeDeploymentMetadata(
    snapshot
  );

}


/* =========================================================
   DEPLOYMENT READINESS SANITIZER
========================================================= */

function sanitizeDeploymentReadiness(
  result
) {

  if (
    !result
  ) {

    return {

      ready:
        false,

      deployable:
        false,

      status:
        "unknown",

      validation:
        null,

      reason:
        "No readiness information returned.",

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
      null,

    validation:
      sanitizeValidation(
        source.validation
      ),

    reason:
      source.reason ||
      source.message ||
      null,

  };

}


/* =========================================================
   CONFIGURATION SUMMARY
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
            variable => ({

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
                variable?.validation?.status ||
                "unknown",

            })
          )
        : [],

  };

}


/* =========================================================
   SOURCE SANITIZER
========================================================= */

function sanitizeSourceMetadata(
  source
) {

  if (
    !source
  ) {

    return {

      type:
        "manual",

      provider:
        null,

      repository:
        null,

      branch:
        null,

      commitSha:
        null,

      importedAt:
        null,

    };

  }


  return {

    type:
      source.type ||
      "manual",

    provider:
      source.provider ||
      null,

    repository:
      source.repository ||
      null,

    branch:
      source.branch ||
      null,

    commitSha:
      source.commitSha ||
      null,

    importedAt:
      source.importedAt ||
      null,

  };

}


/* =========================================================
   AUDIT SANITIZER
========================================================= */

function sanitizeAudit(
  audit
) {

  if (
    !audit
  ) {

    return {

      createdBy:
        null,

      updatedBy:
        null,

      lastAction:
        null,

      lastActionAt:
        null,

    };

  }


  return {

    createdBy:
      audit.createdBy ||
      null,

    updatedBy:
      audit.updatedBy ||
      null,

    lastAction:
      audit.lastAction ||
      null,

    lastActionAt:
      audit.lastActionAt ||
      null,

  };

}


/* =========================================================
   DEPLOYMENT LOCK SANITIZER
========================================================= */

function sanitizeDeploymentLock(
  lock
) {

  if (
    !lock
  ) {

    return {

      locked:
        false,

      workflowId:
        null,

      lockedAt:
        null,

    };

  }


  return {

    locked:
      lock.locked ===
      true,

    workflowId:
      lock.workflowId ||
      null,

    lockedAt:
      lock.lockedAt ||
      null,

  };

}


/* =========================================================
   HEALTH SANITIZER
========================================================= */

function sanitizeHealth(
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
      AGENT_VERSION,

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


/* =========================================================
   AGENT STATUS
========================================================= */

function getStatus() {

  return {

    success:
      true,

    agent:
      AGENT_NAME,

    version:
      AGENT_VERSION,

    status:
      "ready",

    capabilities: [

      "create_environment",

      "list_environments",

      "get_environment",

      "add_variable",

      "update_variable",

      "delete_variable",

      "validate_environment",

      "deployment_readiness",

      "resolve_for_deployment",

      "create_deployment_snapshot",

      "mark_deployed",

      "archive_environment",

      "unarchive_environment",

      "delete_environment",

      "copy_environment",

      "configuration_summary",

      "health_check",

    ],

    security: {

      aiProviderAccess:
        false,

      directDatabaseAccess:
        false,

      clientSecretExposure:
        false,

      deploymentSecretResolution:
        true,

      trustedContextRequired:
        true,

    },

    timestamp:
      new Date().toISOString(),

  };

}


/* =========================================================
   MAIN AGENT DISPATCHER
========================================================= */

/**
 * Main callable Agent.
 *
 * Supported actions:
 *
 * create
 * list
 * get
 * add_variable
 * update_variable
 * delete_variable
 * validate
 * deployment_readiness
 * resolve_for_deployment
 * create_deployment_snapshot
 * mark_deployed
 * archive
 * unarchive
 * delete
 * copy
 * configuration_summary
 * health
 * status
 */
async function environmentAgent(
  input = {}
) {

  if (
    !input ||
    typeof input !==
      "object"
  ) {

    throw new EnvironmentAgentError(
      "Environment Agent input must be an object.",
      "INVALID_AGENT_INPUT",
      400
    );

  }


  const action =
    String(
      input.action ||
      input.operation ||
      ""
    )
      .trim()
      .toLowerCase();


  if (!action) {

    throw new EnvironmentAgentError(
      "Environment Agent action is required.",
      "ACTION_REQUIRED",
      400
    );

  }


  const startedAt =
    Date.now();


  logInfo(
    "Environment Agent started",
    {
      action,

      userId:
        getUserId(
          input
        ),

      projectId:
        getProjectId(
          input
        ),

      environment:
        input.name ||
        input.environmentName ||
        input.environment ||
        null,

      requestId:
        input.requestId ||
        null,
    }
  );


  try {

    let result;


    switch (
      action
    ) {

      case "create":

      case "create_environment":

        result =
          await createEnvironment(
            input
          );

        break;


      case "list":

      case "list_environments":

        result =
          await listEnvironments(
            input
          );

        break;


      case "get":

      case "get_environment":

        result =
          await getEnvironment(
            input
          );

        break;


      case "add_variable":

      case "add":

        result =
          await addVariable(
            input
          );

        break;


      case "update_variable":

      case "update":

        result =
          await updateVariable(
            input
          );

        break;


      case "delete_variable":

      case "remove_variable":

        result =
          await deleteVariable(
            input
          );

        break;


      case "validate":

      case "validate_environment":

        result =
          await validateEnvironment(
            input
          );

        break;


      case "deployment_readiness":

      case "check_deployment_readiness":

      case "ready":

        result =
          await checkDeploymentReadiness(
            input
          );

        break;


      case "resolve_for_deployment":

      case "resolve_deployment":

        result =
          await resolveForDeployment(
            input
          );

        break;


      case "create_deployment_snapshot":

      case "deployment_snapshot":

        result =
          await createDeploymentSnapshot(
            input
          );

        break;


      case "mark_deployed":

      case "deployment_completed":

        result =
          await markDeployed(
            input
          );

        break;


      case "archive":

      case "archive_environment":

        result =
          await archiveEnvironment(
            input
          );

        break;


      case "unarchive":

      case "unarchive_environment":

      case "restore":

        result =
          await unarchiveEnvironment(
            input
          );

        break;


      case "delete":

      case "delete_environment":

        result =
          await deleteEnvironment(
            input
          );

        break;


      case "copy":

      case "copy_environment":

        result =
          await copyEnvironment(
            input
          );

        break;


      case "configuration_summary":

      case "summary":

        result =
          await getConfigurationSummary(
            input
          );

        break;


      case "health":

      case "health_check":

        result =
          await healthCheck(
            input
          );

        break;


      case "status":

        result =
          getStatus();

        break;


      default:

        throw new EnvironmentAgentError(
          `Unsupported Environment Agent action: ${action}`,
          "UNSUPPORTED_ACTION",
          400,
          {
            action,

            supportedActions: [
              "create",
              "list",
              "get",
              "add_variable",
              "update_variable",
              "delete_variable",
              "validate",
              "deployment_readiness",
              "resolve_for_deployment",
              "create_deployment_snapshot",
              "mark_deployed",
              "archive",
              "unarchive",
              "delete",
              "copy",
              "configuration_summary",
              "health",
              "status",
            ],
          }
        );

    }


    logInfo(
      "Environment Agent completed",
      {
        action,

        userId:
          getUserId(
            input
          ),

        projectId:
          getProjectId(
            input
          ),

        environment:
          input.name ||
          input.environmentName ||
          input.environment ||
          null,

        durationMs:
          Date.now() -
          startedAt,

        requestId:
          input.requestId ||
          null,
      }
    );


    return result;

  } catch (
    error
  ) {

    const normalizedError =
      normalizeServiceError(
        error
      );


    logError(
      "Environment Agent failed",
      {
        action,

        userId:
          getUserId(
            input
          ),

        projectId:
          getProjectId(
            input
          ),

        environment:
          input.name ||
          input.environmentName ||
          input.environment ||
          null,

        requestId:
          input.requestId ||
          null,

        durationMs:
          Date.now() -
          startedAt,

        error: {
          code:
            normalizedError.code,

          message:
            normalizedError.message,

          statusCode:
            normalizedError.statusCode,

          details:
            normalizedError.details,
        },
      }
    );


    throw normalizedError;

  }

}


/* =========================================================
   ATTACHED METHODS
========================================================= */

environmentAgent.createEnvironment =
  createEnvironment;

environmentAgent.listEnvironments =
  listEnvironments;

environmentAgent.getEnvironment =
  getEnvironment;

environmentAgent.addVariable =
  addVariable;

environmentAgent.updateVariable =
  updateVariable;

environmentAgent.deleteVariable =
  deleteVariable;

environmentAgent.validateEnvironment =
  validateEnvironment;

environmentAgent.checkDeploymentReadiness =
  checkDeploymentReadiness;

environmentAgent.resolveForDeployment =
  resolveForDeployment;

environmentAgent.createDeploymentSnapshot =
  createDeploymentSnapshot;

environmentAgent.markDeployed =
  markDeployed;

environmentAgent.archiveEnvironment =
  archiveEnvironment;

environmentAgent.unarchiveEnvironment =
  unarchiveEnvironment;

environmentAgent.deleteEnvironment =
  deleteEnvironment;

environmentAgent.copyEnvironment =
  copyEnvironment;

environmentAgent.getConfigurationSummary =
  getConfigurationSummary;

environmentAgent.healthCheck =
  healthCheck;

environmentAgent.getStatus =
  getStatus;


/* =========================================================
   METADATA
========================================================= */

environmentAgent.agentName =
  AGENT_NAME;

environmentAgent.version =
  AGENT_VERSION;

environmentAgent.capabilities = [
  "create_environment",
  "list_environments",
  "get_environment",
  "add_variable",
  "update_variable",
  "delete_variable",
  "validate_environment",
  "deployment_readiness",
  "resolve_for_deployment",
  "create_deployment_snapshot",
  "mark_deployed",
  "archive_environment",
  "unarchive_environment",
  "delete_environment",
  "copy_environment",
  "configuration_summary",
  "health_check",
];


/* =========================================================
   ERROR EXPORT
========================================================= */

environmentAgent.EnvironmentAgentError =
  EnvironmentAgentError;


/* =========================================================
   CONSTANTS EXPORT
========================================================= */

environmentAgent.ENVIRONMENT_NAMES =
  Array.from(
    ENVIRONMENT_NAMES
  );

environmentAgent.VARIABLE_TYPES =
  Array.from(
    VARIABLE_TYPES
  );

environmentAgent.VARIABLE_SCOPES =
  Array.from(
    VARIABLE_SCOPES
  );


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  environmentAgent;
