/* =========================================================
   ZyrionOS ENVIRONMENT SERVICE
   Version: 2.1.0
   =========================================================

   Responsibilities:
   - Environment CRUD
   - Environment variable CRUD
   - Secret encryption/decryption
   - Secret masking
   - Encryption-key rotation support
   - Required-variable validation
   - Build/runtime variable resolution
   - Deployment readiness
   - Deployment snapshots
   - Safe UI/API responses
   - Project/user ownership enforcement
   - Optimistic concurrency protection
   - Environment version management
   - Environment copying
   - Deployment metadata
   - GitHub/import metadata
   - Production environment protection

   SECURITY MODEL:

      User/API
        ↓
      Controller
        ↓
      Environment Service
        ↓
      Encrypted MongoDB value
        ↓
      Trusted Deployment Workflow
        ↓
      Docker/ECS runtime

   Secrets MUST NOT:
   - be logged
   - be returned to normal API responses
   - be sent to AI providers
   - be written into source files
   - be committed to GitHub
   - appear in error messages
   - be stored in plaintext

========================================================= */

"use strict";

const crypto = require("crypto");

const Environment =
  require("../models/environmentModel");


/* =========================================================
   SERVICE CONSTANTS
========================================================= */

const SERVICE_VERSION =
  "2.1.0";

const ENVIRONMENT_NAMES = [
  "development",
  "preview",
  "production",
];

const VARIABLE_TYPES = [
  "string",
  "number",
  "boolean",
  "json",
];

const VARIABLE_SCOPES = [
  "runtime",
  "build",
  "both",
];

const MAX_VARIABLES =
  500;

const MAX_KEY_LENGTH =
  256;

const MAX_VALUE_LENGTH =
  100000;

const MAX_DESCRIPTION_LENGTH =
  1000;

const MAX_SOURCE_REFERENCE_LENGTH =
  500;

const ENCRYPTION_ALGORITHM =
  "aes-256-gcm";

const ENCRYPTION_VERSION =
  "v2";

const LEGACY_ENCRYPTION_VERSION =
  "v1";

const IV_LENGTH =
  12;

const AUTH_TAG_LENGTH =
  16;


/* =========================================================
   ERROR CLASS
========================================================= */

class EnvironmentServiceError extends Error {
  constructor(
    message,
    code = "ENVIRONMENT_ERROR",
    statusCode = 400,
    details = null
  ) {
    super(message);

    this.name =
      "EnvironmentServiceError";

    this.code =
      code;

    this.statusCode =
      statusCode;

    this.details =
      details &&
      typeof details === "object"
        ? sanitizeErrorDetails(details)
        : details;
  }
}


/* =========================================================
   ERROR DETAIL SANITIZATION
========================================================= */

function sanitizeErrorDetails(details) {
  if (
    details === null ||
    details === undefined
  ) {
    return null;
  }

  if (Array.isArray(details)) {
    return details.map(
      (item) =>
        sanitizeErrorDetails(item)
    );
  }

  if (
    typeof details !== "object"
  ) {
    return details;
  }

  const blockedKeys =
    new Set([
      "value",
      "secret",
      "secretValue",
      "plaintext",
      "plainValue",
      "encryptedValue",
      "decryptedValue",
      "variables",
      "environmentVariables",
      "credentials",
      "token",
      "password",
      "apiKey",
      "accessToken",
      "refreshToken",
      "authorization",
    ]);

  const safe = {};

  for (
    const [key, value]
    of Object.entries(details)
  ) {
    if (
      blockedKeys.has(key)
    ) {
      continue;
    }

    safe[key] =
      sanitizeErrorDetails(
        value
      );
  }

  return safe;
}


/* =========================================================
   ENCRYPTION KEY MANAGEMENT
========================================================= */

function decodeEncryptionKey(
  rawKey,
  variableName
) {
  if (!rawKey) {
    throw new EnvironmentServiceError(
      `${variableName} is not configured`,
      "ENVIRONMENT_ENCRYPTION_KEY_MISSING",
      500
    );
  }

  const normalized =
    String(rawKey).trim();

  if (
    /^[0-9a-fA-F]{64}$/.test(
      normalized
    )
  ) {
    return Buffer.from(
      normalized,
      "hex"
    );
  }

  try {
    const decoded =
      Buffer.from(
        normalized,
        "base64"
      );

    if (
      decoded.length === 32
    ) {
      return decoded;
    }
  } catch {
    // Fall through.
  }

  throw new EnvironmentServiceError(
    `${variableName} must be a 32-byte hexadecimal or base64 key`,
    "ENVIRONMENT_ENCRYPTION_KEY_INVALID",
    500
  );
}


function getCurrentEncryptionKey() {
  return decodeEncryptionKey(
    process.env
      .ENVIRONMENT_ENCRYPTION_KEY,
    "ENVIRONMENT_ENCRYPTION_KEY"
  );
}


function getPreviousEncryptionKey() {
  const rawKey =
    process.env
      .ENVIRONMENT_ENCRYPTION_KEY_PREVIOUS;

  if (!rawKey) {
    return null;
  }

  return decodeEncryptionKey(
    rawKey,
    "ENVIRONMENT_ENCRYPTION_KEY_PREVIOUS"
  );
}


/* =========================================================
   ENCRYPTION CONTEXT
========================================================= */

function createEncryptionContext({
  userId,
  projectId,
  environmentName,
  variableKey,
}) {
  return [
    String(userId || ""),
    String(projectId || ""),
    normalizeEnvironmentName(
      environmentName
    ),
    normalizeVariableKey(
      variableKey
    ),
  ].join("|");
}


/* =========================================================
   ENCRYPT SECRET
========================================================= */

function encryptSecret(
  plaintext,
  context
) {
  if (
    plaintext === null ||
    plaintext === undefined
  ) {
    return "";
  }

  const key =
    getCurrentEncryptionKey();

  const iv =
    crypto.randomBytes(
      IV_LENGTH
    );

  const cipher =
    crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      iv
    );

  if (context) {
    cipher.setAAD(
      Buffer.from(
        String(context),
        "utf8"
      )
    );
  }

  const encrypted =
    Buffer.concat([
      cipher.update(
        String(plaintext),
        "utf8"
      ),
      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}


/* =========================================================
   DECRYPT SECRET
========================================================= */

function decryptSecret(
  encryptedPayload,
  context
) {
  if (!encryptedPayload) {
    return "";
  }

  const parts =
    String(
      encryptedPayload
    ).split(":");

  if (
    parts.length !== 4
  ) {
    throw new EnvironmentServiceError(
      "Invalid encrypted environment value",
      "INVALID_ENCRYPTED_VALUE",
      500
    );
  }

  const [
    version,
    ivBase64,
    authTagBase64,
    encryptedBase64,
  ] = parts;

  if (
    version !== ENCRYPTION_VERSION &&
    version !== LEGACY_ENCRYPTION_VERSION
  ) {
    throw new EnvironmentServiceError(
      "Unsupported environment encryption version",
      "UNSUPPORTED_ENCRYPTION_VERSION",
      500
    );
  }

  const iv =
    Buffer.from(
      ivBase64,
      "base64"
    );

  const authTag =
    Buffer.from(
      authTagBase64,
      "base64"
    );

  const encrypted =
    Buffer.from(
      encryptedBase64,
      "base64"
    );

  if (
    iv.length !== IV_LENGTH
  ) {
    throw new EnvironmentServiceError(
      "Invalid environment encryption IV",
      "INVALID_ENCRYPTION_IV",
      500
    );
  }

  if (
    authTag.length !== AUTH_TAG_LENGTH
  ) {
    throw new EnvironmentServiceError(
      "Invalid environment encryption authentication tag",
      "INVALID_ENCRYPTION_TAG",
      500
    );
  }

  const keys = [];

  if (
    version === ENCRYPTION_VERSION
  ) {
    keys.push({
      key:
        getCurrentEncryptionKey(),
      isCurrent: true,
    });

    const previousKey =
      getPreviousEncryptionKey();

    if (previousKey) {
      keys.push({
        key: previousKey,
        isCurrent: false,
      });
    }
  } else {
    keys.push({
      key:
        getCurrentEncryptionKey(),
      isCurrent: true,
    });

    const previousKey =
      getPreviousEncryptionKey();

    if (previousKey) {
      keys.push({
        key: previousKey,
        isCurrent: false,
      });
    }
  }

  for (
    const keyEntry of keys
  ) {
    try {
      const decipher =
        crypto.createDecipheriv(
          ENCRYPTION_ALGORITHM,
          keyEntry.key,
          iv
        );

      if (
        version === ENCRYPTION_VERSION &&
        context
      ) {
        decipher.setAAD(
          Buffer.from(
            String(context),
            "utf8"
          )
        );
      }

      decipher.setAuthTag(
        authTag
      );

      const decrypted =
        Buffer.concat([
          decipher.update(
            encrypted
          ),
          decipher.final(),
        ]);

      return {
        value:
          decrypted.toString(
            "utf8"
          ),

        usedCurrentKey:
          keyEntry.isCurrent,

        version,
      };
    } catch {
      // Try next configured key.
    }
  }

  throw new EnvironmentServiceError(
    "Unable to decrypt environment secret",
    "SECRET_DECRYPTION_FAILED",
    500
  );
}


/* =========================================================
   MASK SECRET
========================================================= */

function maskSecret(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  const stringValue =
    String(value);

  if (
    stringValue.length <= 4
  ) {
    return "••••";
  }

  if (
    stringValue.length <= 8
  ) {
    return "••••••••";
  }

  return (
    stringValue.slice(0, 2) +
    "••••••••" +
    stringValue.slice(-2)
  );
}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeEnvironmentName(
  value
) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    !ENVIRONMENT_NAMES.includes(
      normalized
    )
  ) {
    throw new EnvironmentServiceError(
      `Invalid environment: ${normalized}`,
      "INVALID_ENVIRONMENT",
      400
    );
  }

  return normalized;
}


function normalizeVariableKey(key) {
  const normalized =
    String(key || "").trim();

  if (!normalized) {
    throw new EnvironmentServiceError(
      "Environment variable key is required",
      "ENVIRONMENT_VARIABLE_KEY_REQUIRED",
      400
    );
  }

  if (
    normalized.length >
    MAX_KEY_LENGTH
  ) {
    throw new EnvironmentServiceError(
      "Environment variable key is too long",
      "ENVIRONMENT_VARIABLE_KEY_TOO_LONG",
      400
    );
  }

  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
      normalized
    )
  ) {
    throw new EnvironmentServiceError(
      `Invalid environment variable name: ${normalized}`,
      "INVALID_ENVIRONMENT_VARIABLE_KEY",
      400
    );
  }

  return normalized;
}


function normalizeVariableType(value) {
  const normalized =
    String(
      value || "string"
    )
      .trim()
      .toLowerCase();

  if (
    !VARIABLE_TYPES.includes(
      normalized
    )
  ) {
    throw new EnvironmentServiceError(
      `Invalid environment variable type: ${normalized}`,
      "INVALID_VARIABLE_TYPE",
      400
    );
  }

  return normalized;
}


function normalizeVariableScope(value) {
  const normalized =
    String(
      value || "runtime"
    )
      .trim()
      .toLowerCase();

  if (
    !VARIABLE_SCOPES.includes(
      normalized
    )
  ) {
    throw new EnvironmentServiceError(
      `Invalid environment variable scope: ${normalized}`,
      "INVALID_VARIABLE_SCOPE",
      400
    );
  }

  return normalized;
}


function normalizeValue(
  value,
  type
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const stringValue =
    String(value);

  if (
    stringValue.length >
    MAX_VALUE_LENGTH
  ) {
    throw new EnvironmentServiceError(
      "Environment variable value is too large",
      "ENVIRONMENT_VARIABLE_VALUE_TOO_LARGE",
      400
    );
  }

  switch (type) {
    case "number":
      if (
        stringValue.trim() === "" ||
        !Number.isFinite(
          Number(stringValue)
        )
      ) {
        throw new EnvironmentServiceError(
          "Environment variable must contain a valid number",
          "INVALID_NUMBER_VARIABLE",
          400
        );
      }
      break;

    case "boolean":
      if (
        ![
          "true",
          "false",
        ].includes(
          stringValue
            .trim()
            .toLowerCase()
        )
      ) {
        throw new EnvironmentServiceError(
          "Boolean environment variable must be true or false",
          "INVALID_BOOLEAN_VARIABLE",
          400
        );
      }
      break;

    case "json":
      try {
        JSON.parse(
          stringValue
        );
      } catch {
        throw new EnvironmentServiceError(
          "Environment variable contains invalid JSON",
          "INVALID_JSON_VARIABLE",
          400
        );
      }
      break;

    case "string":
    default:
      break;
  }

  return stringValue;
}


/* =========================================================
   SOURCE NORMALIZATION
========================================================= */

function normalizeSource(
  source = {}
) {
  const type =
    String(
      source.type ||
        "manual"
    )
      .trim()
      .toLowerCase();

  const allowedTypes = [
    "manual",
    "github",
    "import",
    "generated",
    "system",
  ];

  return {
    type:
      allowedTypes.includes(
        type
      )
        ? type
        : "manual",

    repositoryId:
      safeLimitedString(
        source.repositoryId,
        300
      ),

    branch:
      safeLimitedString(
        source.branch,
        300
      ),

    commitSha:
      safeLimitedString(
        source.commitSha,
        200
      ),

    provider:
      safeLimitedString(
        source.provider,
        100
      ),

    repository:
      safeLimitedString(
        source.repository,
        500
      ),
  };
}


/* =========================================================
   LIMITED STRING
========================================================= */

function safeLimitedString(
  value,
  maxLength
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}


/* =========================================================
   OWNERSHIP QUERY
========================================================= */

function createOwnershipQuery(
  userId,
  projectId,
  environmentName
) {
  if (!userId) {
    throw new EnvironmentServiceError(
      "User ID is required",
      "USER_ID_REQUIRED",
      400
    );
  }

  if (!projectId) {
    throw new EnvironmentServiceError(
      "Project ID is required",
      "PROJECT_ID_REQUIRED",
      400
    );
  }

  const query = {
    userId,
    projectId,
  };

  if (
    environmentName
  ) {
    query.name =
      normalizeEnvironmentName(
        environmentName
      );
  }

  return query;
}


/* =========================================================
   SECRET PROJECTION
========================================================= */

function applySecretProjection(
  query
) {
  return query.select(
    "+variables.encryptedValue +variables.plainValue"
  );
}


/* =========================================================
   FIND ENVIRONMENT
========================================================= */

async function findEnvironment({
  userId,
  projectId,
  environmentName,
  includeSecrets = false,
}) {
  const query =
    createOwnershipQuery(
      userId,
      projectId,
      environmentName
    );

  let mongooseQuery =
    Environment.findOne(
      query
    );

  if (
    includeSecrets
  ) {
    mongooseQuery =
      applySecretProjection(
        mongooseQuery
      );
  }

  const environment =
    await mongooseQuery.exec();

  if (!environment) {
    throw new EnvironmentServiceError(
      "Environment not found",
      "ENVIRONMENT_NOT_FOUND",
      404
    );
  }

  return environment;
}


/* =========================================================
   EXPECTED VERSION
========================================================= */

function assertExpectedVersion(
  environment,
  expectedVersion
) {
  if (
    expectedVersion ===
      undefined ||
    expectedVersion === null ||
    expectedVersion === ""
  ) {
    return;
  }

  const expected =
    Number(
      expectedVersion
    );

  if (
    !Number.isInteger(expected) ||
    expected < 1
  ) {
    throw new EnvironmentServiceError(
      "Invalid expected environment version",
      "INVALID_EXPECTED_VERSION",
      400
    );
  }

  const actual =
    Number(
      environment.version
    );

  if (
    Number.isInteger(actual) &&
    actual !== expected
  ) {
    throw new EnvironmentServiceError(
      "Environment was modified by another request. Please retry with the latest version.",
      "ENVIRONMENT_VERSION_CONFLICT",
      409,
      {
        expectedVersion: expected,
        currentVersion: actual,
      }
    );
  }
}


/* =========================================================
   CREATE ENVIRONMENT
========================================================= */

async function createEnvironment({
  userId,
  projectId,
  name,
  displayName = "",
  description = "",
  variables = [],
  source = {},
  audit = {},
}) {
  const environmentName =
    normalizeEnvironmentName(
      name
    );

  if (
    !Array.isArray(variables)
  ) {
    throw new EnvironmentServiceError(
      "Variables must be an array",
      "INVALID_VARIABLES",
      400
    );
  }

  if (
    variables.length >
    MAX_VARIABLES
  ) {
    throw new EnvironmentServiceError(
      `Maximum ${MAX_VARIABLES} environment variables are allowed`,
      "TOO_MANY_VARIABLES",
      400
    );
  }

  const existing =
    await Environment.findOne({
      userId,
      projectId,
      name:
        environmentName,
    });

  if (existing) {
    throw new EnvironmentServiceError(
      `Environment already exists: ${environmentName}`,
      "ENVIRONMENT_ALREADY_EXISTS",
      409
    );
  }

  const normalizedVariables =
    buildVariableDocuments(
      variables,
      {
        userId,
        projectId,
        environmentName,
      }
    );

  const environment =
    new Environment({
      userId,
      projectId,

      name:
        environmentName,

      displayName:
        displayName ||
        capitalizeEnvironmentName(
          environmentName
        ),

      description:
        safeLimitedString(
          description,
          MAX_DESCRIPTION_LENGTH
        ),

      variables:
        normalizedVariables,

      source:
        normalizeSource(
          source
        ),

      audit: {
        createdBy:
          audit.createdBy ||
          userId,

        updatedBy:
          audit.updatedBy ||
          userId,

        lastAction:
          "created",

        lastActionAt:
          new Date(),
      },
    });

  recalculateValidation(
    environment
  );

  try {
    await environment.save();
  } catch (error) {
    if (
      error?.code === 11000
    ) {
      throw new EnvironmentServiceError(
        "Environment already exists",
        "ENVIRONMENT_ALREADY_EXISTS",
        409
      );
    }

    throw error;
  }

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   GET ENVIRONMENT
========================================================= */

async function getEnvironment({
  userId,
  projectId,
  environmentName,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   LIST ENVIRONMENTS
========================================================= */

async function listEnvironments({
  userId,
  projectId,
  includeArchived = false,
}) {
  createOwnershipQuery(
    userId,
    projectId
  );

  const filter = {
    userId,
    projectId,
  };

  if (
    !includeArchived
  ) {
    filter.status = {
      $ne: "archived",
    };
  }

  const environments =
    await Environment
      .find(filter)
      .sort({
        name: 1,
      })
      .exec();

  return environments.map(
    (environment) =>
      getSafeEnvironment(
        environment
      )
  );
}


/* =========================================================
   ADD VARIABLE
========================================================= */

async function addVariable({
  userId,
  projectId,
  environmentName,
  key,
  value,
  isSecret = false,
  required = false,
  type = "string",
  scope = "runtime",
  description = "",
  enabled = true,
  source = "manual",
  sourceReference = "",
  expectedVersion,
  updatedBy,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
      includeSecrets: true,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  assertMutableEnvironment(
    environment
  );

  const normalizedKey =
    normalizeVariableKey(
      key
    );

  const normalizedType =
    normalizeVariableType(
      type
    );

  const normalizedScope =
    normalizeVariableScope(
      scope
    );

  const normalizedValue =
    normalizeValue(
      value,
      normalizedType
    );

  if (
    environment.variables.length >=
    MAX_VARIABLES
  ) {
    throw new EnvironmentServiceError(
      `Maximum ${MAX_VARIABLES} environment variables are allowed`,
      "TOO_MANY_VARIABLES",
      400
    );
  }

  const duplicate =
    environment.variables.find(
      (variable) =>
        variable.key ===
        normalizedKey
    );

  if (duplicate) {
    throw new EnvironmentServiceError(
      `Environment variable already exists: ${normalizedKey}`,
      "ENVIRONMENT_VARIABLE_EXISTS",
      409
    );
  }

  const variableDocument = {
    key:
      normalizedKey,

    isSecret:
      Boolean(isSecret),

    required:
      Boolean(required),

    type:
      normalizedType,

    scope:
      normalizedScope,

    description:
      safeLimitedString(
        description,
        MAX_DESCRIPTION_LENGTH
      ),

    validationStatus:
      "unknown",

    validationMessage:
      "",

    lastValidatedAt:
      null,

    enabled:
      Boolean(enabled),

    metadata: {
      source:
        safeLimitedString(
          source || "manual",
          100
        ),

      sourceReference:
        safeLimitedString(
          sourceReference,
          MAX_SOURCE_REFERENCE_LENGTH
        ),
    },
  };

  writeVariableValue(
    variableDocument,
    normalizedValue,
    {
      userId,
      projectId,
      environmentName,
      variableKey:
        normalizedKey,
    }
  );

  environment.variables.push(
    variableDocument
  );

  touchEnvironment(
    environment,
    updatedBy || userId,
    "variable_added"
  );

  recalculateValidation(
    environment
  );

  await saveWithConcurrencyProtection(
    environment
  );

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   UPDATE VARIABLE
========================================================= */

async function updateVariable({
  userId,
  projectId,
  environmentName,
  key,
  newKey,
  value,
  isSecret,
  required,
  type,
  scope,
  description,
  enabled,
  source,
  sourceReference,
  expectedVersion,
  updatedBy,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
      includeSecrets: true,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  assertMutableEnvironment(
    environment
  );

  const currentKey =
    normalizeVariableKey(
      key
    );

  const variable =
    environment.variables.find(
      (item) =>
        item.key ===
        currentKey
    );

  if (!variable) {
    throw new EnvironmentServiceError(
      `Environment variable not found: ${currentKey}`,
      "ENVIRONMENT_VARIABLE_NOT_FOUND",
      404
    );
  }

  let finalKey =
    variable.key;

  if (
    newKey !== undefined &&
    newKey !== null &&
    String(newKey).trim() !== ""
  ) {
    finalKey =
      normalizeVariableKey(
        newKey
      );

    const duplicate =
      environment.variables.find(
        (item) =>
          item !== variable &&
          item.key ===
            finalKey
      );

    if (duplicate) {
      throw new EnvironmentServiceError(
        `Environment variable already exists: ${finalKey}`,
        "ENVIRONMENT_VARIABLE_EXISTS",
        409
      );
    }
  }

  const previousSecret =
    Boolean(
      variable.isSecret
    );

  const nextSecret =
    isSecret === undefined
      ? previousSecret
      : Boolean(isSecret);

  const nextType =
    type === undefined
      ? variable.type
      : normalizeVariableType(
          type
        );

  const nextScope =
    scope === undefined
      ? variable.scope
      : normalizeVariableScope(
          scope
        );

  let finalValue = "";

  if (
    value !== undefined
  ) {
    finalValue =
      normalizeValue(
        value,
        nextType
      );
  } else if (
    previousSecret
  ) {
    const decrypted =
      decryptSecret(
        variable.encryptedValue,
        createEncryptionContext({
          userId,
          projectId,
          environmentName,
          variableKey:
            variable.key,
        })
      );

    finalValue =
      normalizeValue(
        decrypted.value,
        nextType
      );
  } else {
    finalValue =
      normalizeValue(
        variable.plainValue || "",
        nextType
      );
  }

  /*
   * If a secret is being renamed, its encrypted value
   * MUST be re-encrypted using the new variable key.
   */
  variable.key =
    finalKey;

  variable.type =
    nextType;

  variable.scope =
    nextScope;

  variable.isSecret =
    nextSecret;

  variable.required =
    required === undefined
      ? Boolean(
          variable.required
        )
      : Boolean(required);

  variable.enabled =
    enabled === undefined
      ? Boolean(
          variable.enabled
        )
      : Boolean(enabled);

  if (
    description !== undefined
  ) {
    variable.description =
      safeLimitedString(
        description,
        MAX_DESCRIPTION_LENGTH
      );
  }

  if (
    source !== undefined
  ) {
    variable.metadata =
      variable.metadata || {};

    variable.metadata.source =
      safeLimitedString(
        source,
        100
      );
  }

  if (
    sourceReference !==
    undefined
  ) {
    variable.metadata =
      variable.metadata || {};

    variable.metadata.sourceReference =
      safeLimitedString(
        sourceReference,
        MAX_SOURCE_REFERENCE_LENGTH
      );
  }

  writeVariableValue(
    variable,
    finalValue,
    {
      userId,
      projectId,
      environmentName,
      variableKey:
        finalKey,
    }
  );

  variable.validationStatus =
    "unknown";

  variable.validationMessage =
    "";

  variable.lastValidatedAt =
    null;

  touchEnvironment(
    environment,
    updatedBy || userId,
    "variable_updated"
  );

  recalculateValidation(
    environment
  );

  await saveWithConcurrencyProtection(
    environment
  );

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   DELETE VARIABLE
========================================================= */

async function deleteVariable({
  userId,
  projectId,
  environmentName,
  key,
  expectedVersion,
  updatedBy,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  assertMutableEnvironment(
    environment
  );

  const normalizedKey =
    normalizeVariableKey(
      key
    );

  const initialLength =
    environment.variables.length;

  environment.variables =
    environment.variables.filter(
      (variable) =>
        variable.key !==
        normalizedKey
    );

  if (
    environment.variables.length ===
    initialLength
  ) {
    throw new EnvironmentServiceError(
      `Environment variable not found: ${normalizedKey}`,
      "ENVIRONMENT_VARIABLE_NOT_FOUND",
      404
    );
  }

  touchEnvironment(
    environment,
    updatedBy || userId,
    "variable_deleted"
  );

  recalculateValidation(
    environment
  );

  await saveWithConcurrencyProtection(
    environment
  );

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

async function validateEnvironment({
  userId,
  projectId,
  environmentName,
  expectedVersion,
  updatedBy,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
      includeSecrets: true,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  const result =
    recalculateValidation(
      environment
    );

  touchEnvironment(
    environment,
    updatedBy || userId,
    "validated"
  );

  await saveWithConcurrencyProtection(
    environment
  );

  return {
    environmentId:
      environment._id,

    projectId:
      environment.projectId,

    environment:
      environment.name,

    validation:
      result,

    environmentData:
      getSafeEnvironment(
        environment
      ),
  };
}


/* =========================================================
   DEPLOYMENT READINESS
=========================================================

   IMPORTANT:

   This method NEVER resolves or returns plaintext secrets.

   It is safe for authenticated API/controller usage.

========================================================= */

async function getDeploymentReadiness({
  userId,
  projectId,
  environmentName,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
      includeSecrets: true,
    });

  const validation =
    recalculateValidation(
      environment
    );

  const active =
    environment.status ===
    "active";

  const valid =
    validation.status ===
    "valid";

  const deployable =
    active &&
    valid;

  return {
    ready:
      deployable,

    deployable,

    status:
      deployable
        ? "ready"
        : "not_ready",

    environment: {
      id:
        environment._id,

      projectId:
        environment.projectId,

      name:
        environment.name,

      status:
        environment.status,

      version:
        environment.version,

      deployedVersion:
        environment.deployedVersion,
    },

    validation,

    reason:
      !active
        ? "Environment is not active"
        : !valid
          ? validation.message
          : "Environment is ready for deployment",
  };
}


/* =========================================================
   RESOLVE FOR DEPLOYMENT
=========================================================

   THIS METHOD IS TRUSTED INTERNAL BOUNDARY ONLY.

   Required:

      trustedContext === true
      workflowId

   Returned variables contain plaintext secrets.

========================================================= */

async function resolveForDeployment({
  userId,
  projectId,
  environmentName,
  scope = "both",
  deploymentId = "",
  workflowId,
  trustedContext = false,
}) {
  if (
    trustedContext !== true
  ) {
    throw new EnvironmentServiceError(
      "Deployment secret resolution requires trusted deployment context",
      "TRUSTED_DEPLOYMENT_CONTEXT_REQUIRED",
      403
    );
  }

  if (
    !workflowId ||
    String(workflowId).trim() === ""
  ) {
    throw new EnvironmentServiceError(
      "Deployment workflow ID is required for secret resolution",
      "DEPLOYMENT_WORKFLOW_ID_REQUIRED",
      400
    );
  }

  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
      includeSecrets: true,
    });

  assertDeployableEnvironment(
    environment
  );

  const normalizedScope =
    normalizeVariableScope(
      scope
    );

  const validation =
    recalculateValidation(
      environment
    );

  if (
    validation.status !==
    "valid"
  ) {
    throw new EnvironmentServiceError(
      "Environment is not valid for deployment",
      "ENVIRONMENT_NOT_DEPLOYABLE",
      409,
      {
        environment:
          environment.name,

        validation,
      }
    );
  }

  const resolved = {};

  for (
    const variable
    of environment.variables
  ) {
    if (
      !variable.enabled
    ) {
      continue;
    }

    if (
      !scopeMatches(
        variable.scope,
        normalizedScope
      )
    ) {
      continue;
    }

    let value = "";

    const context =
      createEncryptionContext({
        userId,
        projectId,
        environmentName:
          environment.name,
        variableKey:
          variable.key,
      });

    if (
      variable.isSecret
    ) {
      const decrypted =
        decryptSecret(
          variable.encryptedValue,
          context
        );

      value =
        decrypted.value;
    } else {
      value =
        variable.plainValue ||
        "";
    }

    resolved[
      variable.key
    ] = value;
  }

  return {
    environmentId:
      environment._id,

    projectId:
      environment.projectId,

    environment:
      environment.name,

    version:
      environment.version,

    deploymentId:
      String(
        deploymentId || ""
      ),

    workflowId:
      String(
        workflowId
      ),

    variables:
      resolved,
  };
}


/* =========================================================
   CREATE DEPLOYMENT SNAPSHOT
=========================================================

   Trusted deployment callers receive variables.

   Non-trusted callers receive metadata only.

========================================================= */

async function createDeploymentSnapshot({
  userId,
  projectId,
  environmentName,
  deploymentId = "",
  workflowId = "",
  trustedContext = false,
}) {
  if (
    trustedContext !== true
  ) {
    const readiness =
      await getDeploymentReadiness({
        userId,
        projectId,
        environmentName,
      });

    return {
      snapshot: {
        environmentId:
          readiness.environment.id,

        projectId:
          readiness.environment.projectId,

        environment:
          readiness.environment.name,

        version:
          readiness.environment.version,

        deploymentId:
          String(
            deploymentId || ""
          ),

        readiness: {
          ready:
            readiness.ready,

          deployable:
            readiness.deployable,

          status:
            readiness.status,
        },

        includesSecrets:
          false,
      },
    };
  }

  const resolved =
    await resolveForDeployment({
      userId,
      projectId,
      environmentName,
      scope: "both",
      deploymentId,
      workflowId,
      trustedContext: true,
    });

  return {
    snapshot: {
      ...resolved,
      includesSecrets:
        true,
    },
  };
}


/* =========================================================
   MARK DEPLOYED
========================================================= */

async function markDeployed({
  userId,
  projectId,
  environmentName,
  deploymentId,
  version,
  expectedVersion,
  updatedBy,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  const deploymentVersion =
    Number(
      version ||
        environment.version
    );

  if (
    !Number.isInteger(
      deploymentVersion
    ) ||
    deploymentVersion < 1
  ) {
    throw new EnvironmentServiceError(
      "Invalid deployment environment version",
      "INVALID_DEPLOYMENT_VERSION",
      400
    );
  }

  if (
    deploymentVersion >
    environment.version
  ) {
    throw new EnvironmentServiceError(
      "Cannot mark a future environment version as deployed",
      "FUTURE_ENVIRONMENT_VERSION",
      409
    );
  }

  environment.deployedVersion =
    deploymentVersion;

  environment.lastDeploymentId =
    safeLimitedString(
      deploymentId,
      300
    );

  environment.lastDeployedAt =
    new Date();

  environment.deployment =
    environment.deployment ||
    {};

  environment.deployment
    .lastInjectedVersion =
    deploymentVersion;

  touchEnvironment(
    environment,
    updatedBy || userId,
    "deployed"
  );

  await saveWithConcurrencyProtection(
    environment
  );

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   ARCHIVE ENVIRONMENT
========================================================= */

async function archiveEnvironment({
  userId,
  projectId,
  environmentName,
  expectedVersion,
  updatedBy,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  environment.status =
    "archived";

  environment.archivedAt =
    new Date();

  touchEnvironment(
    environment,
    updatedBy || userId,
    "archived"
  );

  await saveWithConcurrencyProtection(
    environment
  );

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   UNARCHIVE ENVIRONMENT
========================================================= */

async function unarchiveEnvironment({
  userId,
  projectId,
  environmentName,
  expectedVersion,
  updatedBy,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  environment.status =
    "active";

  environment.archivedAt =
    null;

  touchEnvironment(
    environment,
    updatedBy || userId,
    "unarchived"
  );

  recalculateValidation(
    environment
  );

  await saveWithConcurrencyProtection(
    environment
  );

  return getSafeEnvironment(
    environment
  );
}


/* =========================================================
   DELETE ENVIRONMENT
========================================================= */

async function deleteEnvironment({
  userId,
  projectId,
  environmentName,
  expectedVersion,
  updatedBy,
  confirmProduction = false,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  assertExpectedVersion(
    environment,
    expectedVersion
  );

  if (
    environment.name ===
    "production"
  ) {
    throw new EnvironmentServiceError(
      "Production environment cannot be permanently deleted. Archive it instead.",
      "PRODUCTION_ENVIRONMENT_DELETE_BLOCKED",
      409
    );
  }

  const result =
    await Environment.deleteOne({
      _id:
        environment._id,

      userId,
      projectId,
    });

  if (
    result.deletedCount !== 1
  ) {
    throw new EnvironmentServiceError(
      "Environment could not be deleted",
      "ENVIRONMENT_DELETE_FAILED",
      500
    );
  }

  return {
    success: true,

    environmentId:
      environment._id,

    environment:
      environment.name,

    deleted: true,
  };
}


/* =========================================================
   COPY ENVIRONMENT
========================================================= */

async function copyEnvironment({
  userId,
  projectId,
  sourceEnvironment,
  targetEnvironment,
  updatedBy,
  copySecrets = false,
  expectedVersion,
}) {
  const sourceName =
    normalizeEnvironmentName(
      sourceEnvironment
    );

  const targetName =
    normalizeEnvironmentName(
      targetEnvironment
    );

  if (
    sourceName === targetName
  ) {
    throw new EnvironmentServiceError(
      "Source and target environments must be different",
      "SAME_ENVIRONMENT_COPY",
      400
    );
  }

  const source =
    await findEnvironment({
      userId,
      projectId,
      environmentName:
        sourceName,
      includeSecrets:
        copySecrets === true,
    });

  let target =
    await Environment
      .findOne({
        userId,
        projectId,
        name:
          targetName,
      })
      .select(
        "+variables.encryptedValue +variables.plainValue"
      )
      .exec();

  if (!target) {
    target =
      new Environment({
        userId,
        projectId,

        name:
          targetName,

        displayName:
          capitalizeEnvironmentName(
            targetName
          ),
      });
  } else {
    assertExpectedVersion(
      target,
      expectedVersion
    );
  }

  assertMutableEnvironment(
    target
  );

  const copiedVariables =
    [];

  for (
    const variable
    of source.variables
  ) {
    if (
      variable.isSecret &&
      !copySecrets
    ) {
      copiedVariables.push({
        key:
          variable.key,

        isSecret:
          true,

        required:
          variable.required,

        type:
          variable.type,

        scope:
          variable.scope,

        description:
          variable.description,

        encryptedValue:
          "",

        plainValue:
          "",

        validationStatus:
          "unknown",

        validationMessage:
          "Secret must be configured separately",

        lastValidatedAt:
          null,

        enabled:
          variable.enabled,

        metadata: {
          source:
            "environment_copy",

          sourceReference:
            `${sourceName}->${targetName}`,
        },
      });

      continue;
    }

    let value = "";

    if (
      variable.isSecret
    ) {
      const context =
        createEncryptionContext({
          userId,
          projectId,
          environmentName:
            sourceName,
          variableKey:
            variable.key,
        });

      const decrypted =
        decryptSecret(
          variable.encryptedValue,
          context
        );

      value =
        decrypted.value;
    } else {
      value =
        variable.plainValue ||
        "";
    }

    const copied = {
      key:
        variable.key,

      isSecret:
        variable.isSecret,

      required:
        variable.required,

      type:
        variable.type,

      scope:
        variable.scope,

      description:
        variable.description,

      validationStatus:
        "unknown",

      validationMessage:
        "",

      lastValidatedAt:
        null,

      enabled:
        variable.enabled,

      metadata: {
        source:
          "environment_copy",

        sourceReference:
          `${sourceName}->${targetName}`,
      },
    };

    writeVariableValue(
      copied,
      value,
      {
        userId,
        projectId,
        environmentName:
          targetName,
        variableKey:
          variable.key,
      }
    );

    copiedVariables.push(
      copied
    );
  }

  target.variables =
    copiedVariables;

  target.status =
    "active";

  target.source =
    normalizeSource({
      type:
        "import",

      repositoryId:
        source.source?.repositoryId,

      branch:
        source.source?.branch,

      commitSha:
        source.source?.commitSha,

      provider:
        source.source?.provider,

      repository:
        source.source?.repository,
    });

  touchEnvironment(
    target,
    updatedBy || userId,
    "copied_from_environment"
  );

  recalculateValidation(
    target
  );

  await saveWithConcurrencyProtection(
    target
  );

  return getSafeEnvironment(
    target
  );
}


/* =========================================================
   GET VARIABLE
========================================================= */

async function getVariable({
  userId,
  projectId,
  environmentName,
  key,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  const normalizedKey =
    normalizeVariableKey(
      key
    );

  const variable =
    environment.variables.find(
      (item) =>
        item.key ===
        normalizedKey
    );

  if (!variable) {
    throw new EnvironmentServiceError(
      `Environment variable not found: ${normalizedKey}`,
      "ENVIRONMENT_VARIABLE_NOT_FOUND",
      404
    );
  }

  return {
    key:
      variable.key,

    isSecret:
      Boolean(
        variable.isSecret
      ),

    required:
      Boolean(
        variable.required
      ),

    type:
      variable.type,

    scope:
      variable.scope,

    enabled:
      Boolean(
        variable.enabled
      ),

    description:
      variable.description,

    validationStatus:
      variable.validationStatus,

    hasValue:
      variable.isSecret
        ? Boolean(
            variable.encryptedValue
          )
        : Boolean(
            variable.plainValue
          ),

    masked:
      variable.isSecret
        ? "••••••••"
        : variable.plainValue ||
          "",
  };
}


/* =========================================================
   CONFIGURATION SUMMARY
========================================================= */

async function getConfigurationSummary({
  userId,
  projectId,
  environmentName,
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  const variables =
    environment.variables.filter(
      (variable) =>
        variable.enabled
    );

  return {
    environmentId:
      environment._id,

    projectId:
      environment.projectId,

    environment:
      environment.name,

    status:
      environment.status,

    version:
      environment.version,

    deployedVersion:
      environment.deployedVersion,

    variableCount:
      variables.length,

    secretCount:
      variables.filter(
        (variable) =>
          variable.isSecret
      ).length,

    requiredCount:
      variables.filter(
        (variable) =>
          variable.required
      ).length,

    configuredCount:
      variables.filter(
        (variable) =>
          variable.isSecret
            ? Boolean(
                variable.encryptedValue
              )
            : Boolean(
                variable.plainValue
              )
      ).length,

    buildVariableCount:
      variables.filter(
        (variable) =>
          variable.scope ===
            "build" ||
          variable.scope ===
            "both"
      ).length,

    runtimeVariableCount:
      variables.filter(
        (variable) =>
          variable.scope ===
            "runtime" ||
          variable.scope ===
            "both"
      ).length,

    validation:
      environment.validation,

    deployment:
      environment.deployment,

    lastDeploymentId:
      environment.lastDeploymentId,

    lastDeployedAt:
      environment.lastDeployedAt,
  };
}


/* =========================================================
   SAFE ENVIRONMENT
========================================================= */

function getSafeEnvironment(
  environment
) {
  if (!environment) {
    return null;
  }

  if (
    typeof environment.toSafeJSON ===
    "function"
  ) {
    return environment.toSafeJSON();
  }

  const plain =
    typeof environment.toObject ===
    "function"
      ? environment.toObject()
      : environment;

  return {
    id:
      plain._id,

    userId:
      plain.userId,

    projectId:
      plain.projectId,

    name:
      plain.name,

    displayName:
      plain.displayName,

    description:
      plain.description,

    status:
      plain.status,

    version:
      plain.version,

    deployedVersion:
      plain.deployedVersion,

    lastDeploymentId:
      plain.lastDeploymentId,

    lastDeployedAt:
      plain.lastDeployedAt,

    archivedAt:
      plain.archivedAt,

    validation:
      plain.validation,

    deployment:
      plain.deployment,

    runtime:
      plain.runtime,

    source:
      plain.source,

    variables:
      Array.isArray(
        plain.variables
      )
        ? plain.variables.map(
            (variable) => ({
              id:
                variable._id,

              key:
                variable.key,

              isSecret:
                Boolean(
                  variable.isSecret
                ),

              required:
                Boolean(
                  variable.required
                ),

              type:
                variable.type,

              scope:
                variable.scope,

              enabled:
                Boolean(
                  variable.enabled
                ),

              description:
                variable.description,

              validationStatus:
                variable.validationStatus,

              validationMessage:
                variable.validationMessage,

              hasValue:
                variable.isSecret
                  ? Boolean(
                      variable.encryptedValue
                    )
                  : Boolean(
                      variable.plainValue
                    ),

              updatedAt:
                variable.updatedAt,
            })
          )
        : [],

    createdAt:
      plain.createdAt,

    updatedAt:
      plain.updatedAt,
  };
}


/* =========================================================
   BUILD VARIABLE DOCUMENTS
========================================================= */

function buildVariableDocuments(
  variables,
  context
) {
  const seen =
    new Set();

  return variables.map(
    (variable) => {
      if (
        !variable ||
        typeof variable !==
          "object"
      ) {
        throw new EnvironmentServiceError(
          "Invalid environment variable",
          "INVALID_VARIABLE",
          400
        );
      }

      const key =
        normalizeVariableKey(
          variable.key
        );

      if (
        seen.has(key)
      ) {
        throw new EnvironmentServiceError(
          `Duplicate environment variable: ${key}`,
          "ENVIRONMENT_VARIABLE_EXISTS",
          409
        );
      }

      seen.add(key);

      const type =
        normalizeVariableType(
          variable.type
        );

      const scope =
        normalizeVariableScope(
          variable.scope
        );

      const value =
        normalizeValue(
          variable.value,
          type
        );

      const isSecret =
        Boolean(
          variable.isSecret
        );

      const document = {
        key,

        isSecret,

        required:
          Boolean(
            variable.required
          ),

        type,

        scope,

        description:
          safeLimitedString(
            variable.description,
            MAX_DESCRIPTION_LENGTH
          ),

        validationStatus:
          "unknown",

        validationMessage:
          "",

        lastValidatedAt:
          null,

        enabled:
          variable.enabled !==
          false,

        metadata: {
          source:
            safeLimitedString(
              variable.source ||
                "manual",
              100
            ),

          sourceReference:
            safeLimitedString(
              variable.sourceReference,
              MAX_SOURCE_REFERENCE_LENGTH
            ),
        },
      };

      writeVariableValue(
        document,
        value,
        {
          ...context,
          variableKey:
            key,
        }
      );

      return document;
    }
  );
}


/* =========================================================
   WRITE VARIABLE VALUE
========================================================= */

function writeVariableValue(
  variable,
  value,
  context
) {
  if (
    variable.isSecret
  ) {
    variable.encryptedValue =
      encryptSecret(
        value,
        createEncryptionContext(
          context
        )
      );

    variable.plainValue =
      "";
  } else {
    variable.plainValue =
      value;

    variable.encryptedValue =
      "";
  }
}


/* =========================================================
   VALIDATION ENGINE
========================================================= */

function recalculateValidation(
  environment
) {
  const variables =
    Array.isArray(
      environment.variables
    )
      ? environment.variables
      : [];

  let requiredVariables = 0;
  let configuredVariables = 0;
  let missingVariables = 0;
  let invalidVariables = 0;

  const invalidKeys = [];

  for (
    const variable of variables
  ) {
    if (
      !variable.enabled
    ) {
      continue;
    }

    const hasValue =
      variable.isSecret
        ? Boolean(
            variable.encryptedValue
          )
        : Boolean(
            variable.plainValue
          );

    if (hasValue) {
      configuredVariables += 1;
    }

    if (
      variable.required
    ) {
      requiredVariables += 1;

      if (!hasValue) {
        missingVariables += 1;

        invalidKeys.push(
          variable.key
        );

        continue;
      }
    }

    if (!hasValue) {
      continue;
    }

    try {
      let value = "";

      if (
        variable.isSecret
      ) {
        const context =
          createEncryptionContext({
            userId:
              environment.userId,

            projectId:
              environment.projectId,

            environmentName:
              environment.name,

            variableKey:
              variable.key,
          });

        const decrypted =
          decryptSecret(
            variable.encryptedValue,
            context
          );

        value =
          decrypted.value;
      } else {
        value =
          variable.plainValue ||
          "";
      }

      normalizeValue(
        value,
        variable.type
      );

      variable.validationStatus =
        "valid";

      variable.validationMessage =
        "";

    } catch {
      invalidVariables += 1;

      invalidKeys.push(
        variable.key
      );

      variable.validationStatus =
        "invalid";

      variable.validationMessage =
        "Variable validation failed";
    }
  }

  const status =
    missingVariables > 0 ||
    invalidVariables > 0
      ? "invalid"
      : "valid";

  let message =
    "Environment is valid";

  if (
    status === "invalid"
  ) {
    message = [
      missingVariables > 0
        ? `${missingVariables} required variable(s) missing`
        : null,

      invalidVariables > 0
        ? `${invalidVariables} variable(s) invalid`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  const result = {
    status,

    requiredVariables,

    configuredVariables,

    missingVariables,

    invalidVariables,

    message,

    invalidKeys,

    validatedAt:
      new Date(),
  };

  environment.validation = {
    status:
      result.status,

    requiredVariables:
      result.requiredVariables,

    configuredVariables:
      result.configuredVariables,

    missingVariables:
      result.missingVariables,

    invalidVariables:
      result.invalidVariables,

    message:
      result.message,

    validatedAt:
      result.validatedAt,
  };

  return result;
}


/* =========================================================
   ENVIRONMENT MUTABILITY
========================================================= */

function assertMutableEnvironment(
  environment
) {
  if (
    environment.status ===
    "archived"
  ) {
    throw new EnvironmentServiceError(
      "Archived environment cannot be modified",
      "ENVIRONMENT_ARCHIVED",
      409
    );
  }
}


/* =========================================================
   DEPLOYABILITY
========================================================= */

function assertDeployableEnvironment(
  environment
) {
  if (
    environment.status !==
    "active"
  ) {
    throw new EnvironmentServiceError(
      "Environment is not active",
      "ENVIRONMENT_NOT_ACTIVE",
      409
    );
  }

  if (
    environment.validation?.status !==
    "valid"
  ) {
    throw new EnvironmentServiceError(
      "Environment validation failed",
      "ENVIRONMENT_VALIDATION_FAILED",
      409,
      environment.validation
    );
  }
}


/* =========================================================
   SCOPE MATCHING
========================================================= */

function scopeMatches(
  variableScope,
  requestedScope
) {
  if (
    requestedScope ===
    "both"
  ) {
    return true;
  }

  return (
    variableScope ===
      requestedScope ||
    variableScope ===
      "both"
  );
}


/* =========================================================
   TOUCH ENVIRONMENT
========================================================= */

function touchEnvironment(
  environment,
  userId,
  action
) {
  environment.audit =
    environment.audit ||
    {};

  environment.audit.updatedBy =
    userId;

  environment.audit.lastAction =
    safeLimitedString(
      action,
      200
    );

  environment.audit.lastActionAt =
    new Date();
}


/* =========================================================
   SAVE WITH CONCURRENCY PROTECTION
========================================================= */

async function saveWithConcurrencyProtection(
  environment
) {
  try {
    await environment.save();
  } catch (error) {
    if (
      error?.name ===
      "VersionError"
    ) {
      throw new EnvironmentServiceError(
        "Environment was modified by another request. Please retry with the latest version.",
        "ENVIRONMENT_CONCURRENT_UPDATE",
        409
      );
    }

    if (
      error?.code === 11000
    ) {
      throw new EnvironmentServiceError(
        "Environment configuration conflicts with an existing record",
        "ENVIRONMENT_CONFLICT",
        409
      );
    }

    throw error;
  }
}


/* =========================================================
   FORMAT ENV VALUE
========================================================= */

function formatEnvValue(
  value
) {
  const stringValue =
    String(
      value ?? ""
    );

  if (
    /[\s"'#\n\r]/.test(
      stringValue
    )
  ) {
    return (
      '"' +
      stringValue
        .replace(
          /\\/g,
          "\\\\"
        )
        .replace(
          /"/g,
          '\\"'
        )
        .replace(
          /\r/g,
          "\\r"
        )
        .replace(
          /\n/g,
          "\\n"
        ) +
      '"'
    );
  }

  return stringValue;
}


/* =========================================================
   MASKED ENV EXPORT
========================================================= */

async function exportMaskedEnvironment({
  userId,
  projectId,
  environmentName,
  scope = "both",
}) {
  const environment =
    await findEnvironment({
      userId,
      projectId,
      environmentName,
    });

  const normalizedScope =
    normalizeVariableScope(
      scope
    );

  const lines =
    environment.variables
      .filter(
        (variable) =>
          variable.enabled
      )
      .filter(
        (variable) =>
          scopeMatches(
            variable.scope,
            normalizedScope
          )
      )
      .map(
        (variable) => {
          const value =
            variable.isSecret
              ? "********"
              : variable.plainValue ||
                "";

          return (
            `${variable.key}=` +
            formatEnvValue(
              value
            )
          );
        }
      );

  return {
    environment:
      environment.name,

    version:
      environment.version,

    content:
      lines.join("\n"),

    includesSecrets:
      false,
  };
}


/* =========================================================
   HEALTH CHECK
========================================================= */

function healthCheck() {
  let currentConfigured =
    false;

  let previousConfigured =
    false;

  let encryptionHealthy =
    false;

  try {
    getCurrentEncryptionKey();
    currentConfigured =
      true;
  } catch {
    currentConfigured =
      false;
  }

  try {
    previousConfigured =
      Boolean(
        getPreviousEncryptionKey()
      );
  } catch {
    previousConfigured =
      false;
  }

  encryptionHealthy =
    currentConfigured;

  return {
    success:
      true,

    service:
      "environmentService",

    version:
      SERVICE_VERSION,

    encryption: {
      algorithm:
        ENCRYPTION_ALGORITHM,

      currentKeyConfigured:
        currentConfigured,

      previousKeyConfigured:
        previousConfigured,

      rotationSupported:
        true,

      healthy:
        encryptionHealthy,
    },

    supportedEnvironments:
      [...ENVIRONMENT_NAMES],

    supportedVariableTypes:
      [...VARIABLE_TYPES],

    supportedScopes:
      [...VARIABLE_SCOPES],

    limits: {
      maxVariables:
        MAX_VARIABLES,

      maxKeyLength:
        MAX_KEY_LENGTH,

      maxValueLength:
        MAX_VALUE_LENGTH,

      maxDescriptionLength:
        MAX_DESCRIPTION_LENGTH,
    },
  };
}


/* =========================================================
   CAPITALIZE ENVIRONMENT NAME
========================================================= */

function capitalizeEnvironmentName(
  name
) {
  return String(name)
    .charAt(0)
    .toUpperCase() +
    String(name)
      .slice(1);
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  /* Environment */
  createEnvironment,
  getEnvironment,
  listEnvironments,
  deleteEnvironment,
  archiveEnvironment,
  unarchiveEnvironment,

  /* Variables */
  addVariable,
  updateVariable,
  deleteVariable,
  getVariable,

  /* Validation */
  validateEnvironment,
  getDeploymentReadiness,
  getConfigurationSummary,
  recalculateValidation,

  /* Deployment */
  resolveForDeployment,
  createDeploymentSnapshot,
  markDeployed,

  /* Environment copy */
  copyEnvironment,

  /* Safe export */
  exportMaskedEnvironment,

  /* Security helpers */
  maskSecret,
  encryptSecret,
  decryptSecret,

  /* Normalization */
  normalizeEnvironmentName,
  normalizeVariableKey,
  normalizeVariableType,
  normalizeVariableScope,

  /* Safe response */
  getSafeEnvironment,

  /* Diagnostics */
  healthCheck,

  /* Constants */
  SERVICE_VERSION,
  ENVIRONMENT_NAMES,
  VARIABLE_TYPES,
  VARIABLE_SCOPES,

  /* Error */
  EnvironmentServiceError,
};
