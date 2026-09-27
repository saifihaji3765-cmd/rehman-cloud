/* =========================================================
   ZyrionOS ENVIRONMENT SERVICE
   Version: 1.0.0
   =========================================================

   Responsibilities:
   - Environment CRUD
   - Environment variable CRUD
   - Secret encryption/decryption
   - Secret masking
   - Required-variable validation
   - Build/runtime variable resolution
   - Deployment environment snapshots
   - Safe UI/API responses
   - Ownership validation
   - Environment version management
   - Audit metadata

   SECURITY:

   Secret values are encrypted using:

      AES-256-GCM

   Encryption key:

      ENVIRONMENT_ENCRYPTION_KEY

   The key MUST be provided through the server environment.

   NEVER:
   - log decrypted secrets
   - return decrypted secrets to normal UI endpoints
   - put secrets into AI prompts
   - write secrets to project source files
   - commit secrets to GitHub

========================================================= */

const crypto = require("crypto");

const Environment =
  require("../models/environmentModel");


/* =========================================================
   CONSTANTS
========================================================= */

const SERVICE_VERSION =
  "1.0.0";


const ENVIRONMENT_NAMES = [

  "development",

  "preview",

  "production"

];


const VARIABLE_TYPES = [

  "string",

  "number",

  "boolean",

  "json"

];


const VARIABLE_SCOPES = [

  "runtime",

  "build",

  "both"

];


const MAX_VARIABLES =
  500;


const MAX_KEY_LENGTH =
  256;


const MAX_VALUE_LENGTH =
  100000;


const MAX_DESCRIPTION_LENGTH =
  1000;


/*
 * AES-256-GCM:
 *
 * 32-byte key
 * 12-byte IV
 * 16-byte authentication tag
 */

const ENCRYPTION_ALGORITHM =
  "aes-256-gcm";


const IV_LENGTH =
  12;


const AUTH_TAG_LENGTH =
  16;


/* =========================================================
   ERROR CLASS
========================================================= */

class EnvironmentServiceError
  extends Error {

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
      details;

  }

}


/* =========================================================
   ENCRYPTION KEY
========================================================= */

/*
 * We intentionally do NOT generate a random fallback key.
 *
 * Why?
 *
 * If ECS restarts with a new random key, previously stored
 * secrets become impossible to decrypt.
 *
 * Production must therefore provide a stable key through
 * the deployment secret manager/environment.
 */

function getEncryptionKey() {

  const rawKey =
    process.env.ENVIRONMENT_ENCRYPTION_KEY;


  if (!rawKey) {

    throw new EnvironmentServiceError(

      "ENVIRONMENT_ENCRYPTION_KEY is not configured",

      "ENVIRONMENT_ENCRYPTION_KEY_MISSING",

      500

    );

  }


  /*
   * Supported format:
   *
   * 64 hexadecimal characters
   *
   * Example:
   * aabbcc...64 chars...
   */

  const normalized =
    String(rawKey)
      .trim();


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


  /*
   * Also support Base64 encoded 32-byte keys.
   */

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

  } catch (
    error
  ) {

    /*
     * Fall through to the clear error below.
     */

  }


  throw new EnvironmentServiceError(

    "ENVIRONMENT_ENCRYPTION_KEY must be a 32-byte hexadecimal or base64 key",

    "ENVIRONMENT_ENCRYPTION_KEY_INVALID",

    500

  );

}


/* =========================================================
   ENCRYPT
========================================================= */

function encryptSecret(
  plaintext
) {

  if (
    plaintext === null ||
    plaintext === undefined
  ) {

    return "";

  }


  const key =
    getEncryptionKey();


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


  const input =
    String(plaintext);


  const encrypted =
    Buffer.concat([

      cipher.update(
        input,
        "utf8"
      ),

      cipher.final()

    ]);


  const authTag =
    cipher.getAuthTag();


  /*
   * Store everything required for decryption
   * inside one versioned payload.
   *
   * Format:
   *
   * v1:iv:authTag:ciphertext
   */

  return [

    "v1",

    iv.toString("base64"),

    authTag.toString("base64"),

    encrypted.toString("base64")

  ].join(":");

}


/* =========================================================
   DECRYPT
========================================================= */

function decryptSecret(
  encryptedPayload
) {

  if (
    !encryptedPayload
  ) {

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

    encryptedBase64

  ] = parts;


  if (
    version !== "v1"
  ) {

    throw new EnvironmentServiceError(

      `Unsupported environment encryption version: ${version}`,

      "UNSUPPORTED_ENCRYPTION_VERSION",

      500

    );

  }


  const key =
    getEncryptionKey();


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


  try {

    const decipher =
      crypto.createDecipheriv(
        ENCRYPTION_ALGORITHM,
        key,
        iv
      );


    decipher.setAuthTag(
      authTag
    );


    const decrypted =
      Buffer.concat([

        decipher.update(
          encrypted
        ),

        decipher.final()

      ]);


    return decrypted.toString(
      "utf8"
    );

  } catch (
    error
  ) {

    throw new EnvironmentServiceError(

      "Unable to decrypt environment secret",

      "SECRET_DECRYPTION_FAILED",

      500

    );

  }

}


/* =========================================================
   MASK SECRET
========================================================= */

function maskSecret(
  value
) {

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

    stringValue.slice(
      0,
      2
    ) +

    "••••••••" +

    stringValue.slice(
      -2
    )

  );

}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeEnvironmentName(
  value
) {

  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    !ENVIRONMENT_NAMES.includes(
      normalized
    )
  ) {

    throw new EnvironmentServiceError(

      `Invalid environment: ${value}`,

      "INVALID_ENVIRONMENT",

      400

    );

  }


  return normalized;

}


/* =========================================================
   VARIABLE KEY NORMALIZATION
========================================================= */

function normalizeVariableKey(
  key
) {

  const normalized =
    String(
      key || ""
    ).trim();


  if (
    !normalized
  ) {

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


/* =========================================================
   VARIABLE TYPE NORMALIZATION
========================================================= */

function normalizeVariableType(
  value
) {

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

      `Invalid environment variable type: ${value}`,

      "INVALID_VARIABLE_TYPE",

      400

    );

  }


  return normalized;

}


/* =========================================================
   VARIABLE SCOPE NORMALIZATION
========================================================= */

function normalizeVariableScope(
  value
) {

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

      `Invalid environment variable scope: ${value}`,

      "INVALID_VARIABLE_SCOPE",

      400

    );

  }


  return normalized;

}


/* =========================================================
   VALUE NORMALIZATION
========================================================= */

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


  /*
   * Validate typed values without changing their actual
   * stored representation.
   */

  if (
    type === "number"
  ) {

    if (
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

  }


  if (
    type === "boolean"
  ) {

    const valid =
      [
        "true",
        "false"
      ].includes(
        stringValue.toLowerCase()
      );


    if (
      !valid
    ) {

      throw new EnvironmentServiceError(

        "Boolean environment variable must be true or false",

        "INVALID_BOOLEAN_VARIABLE",

        400

      );

    }

  }


  if (
    type === "json"
  ) {

    try {

      JSON.parse(
        stringValue
      );

    } catch (
      error
    ) {

      throw new EnvironmentServiceError(

        "Environment variable contains invalid JSON",

        "INVALID_JSON_VARIABLE",

        400

      );

    }

  }


  return stringValue;

}


/* =========================================================
   OWNERSHIP QUERY
========================================================= */

function ownershipQuery(
  userId,
  projectId,
  environmentName
) {

  if (
    !userId
  ) {

    throw new EnvironmentServiceError(

      "User ID is required",

      "USER_ID_REQUIRED",

      400

    );

  }


  if (
    !projectId
  ) {

    throw new EnvironmentServiceError(

      "Project ID is required",

      "PROJECT_ID_REQUIRED",

      400

    );

  }


  const query = {

    userId,

    projectId

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
   FIND ENVIRONMENT
========================================================= */

async function findEnvironment(
  userId,
  projectId,
  environmentName,
  options = {}
) {

  const query =
    ownershipQuery(
      userId,
      projectId,
      environmentName
    );


  let mongooseQuery =
    Environment.findOne(
      query
    );


  /*
   * Secret fields are excluded by the model by default.
   *
   * Explicitly include them only when the service genuinely
   * needs to decrypt them.
   */

  if (
    options.includeSecrets
  ) {

    mongooseQuery =
      mongooseQuery.select(
        "+variables.encryptedValue +variables.plainValue"
      );

  }


  const environment =
    await mongooseQuery.exec();


  if (
    !environment
  ) {

    throw new EnvironmentServiceError(

      "Environment not found",

      "ENVIRONMENT_NOT_FOUND",

      404

    );

  }


  return environment;

}


/* =========================================================
   CREATE ENVIRONMENT
========================================================= */

async function createEnvironment(
  {
    userId,
    projectId,
    name,
    displayName = "",
    variables = [],
    source = {},
    audit = {}
  }
) {

  const environmentName =
    normalizeEnvironmentName(
      name
    );


  if (
    !Array.isArray(
      variables
    )
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
        environmentName

    });


  if (
    existing
  ) {

    throw new EnvironmentServiceError(

      `Environment already exists: ${environmentName}`,

      "ENVIRONMENT_ALREADY_EXISTS",

      409

    );

  }


  const normalizedVariables =
    buildVariableDocuments(
      variables
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

      variables:
        normalizedVariables,

      source: {

        type:
          source.type ||
          "manual",

        repositoryId:
          source.repositoryId ||
          "",

        branch:
          source.branch ||
          "",

        commitSha:
          source.commitSha ||
          ""

      },

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
          new Date()

      }

    });


  recalculateValidation(
    environment
  );


  await environment.save();


  return environment;

}


/* =========================================================
   GET ENVIRONMENT
========================================================= */

async function getEnvironment(
  {
    userId,
    projectId,
    name
  }
) {

  return findEnvironment(
    userId,
    projectId,
    name
  );

}


/* =========================================================
   GET ALL ENVIRONMENTS
========================================================= */

async function listEnvironments(
  {
    userId,
    projectId
  }
) {

  if (
    !userId ||
    !projectId
  ) {

    throw new EnvironmentServiceError(

      "User ID and project ID are required",

      "ENVIRONMENT_CONTEXT_REQUIRED",

      400

    );

  }


  const environments =
    await Environment
      .find({

        userId,

        projectId

      })
      .sort({
        name: 1
      })
      .exec();


  return environments;

}


/* =========================================================
   ADD VARIABLE
========================================================= */

async function addVariable(
  {
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
    sourceReference = ""
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName,
      {
        includeSecrets: true
      }
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
    description.length >
    MAX_DESCRIPTION_LENGTH
  ) {

    throw new EnvironmentServiceError(

      "Environment variable description is too long",

      "DESCRIPTION_TOO_LONG",

      400

    );

  }


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
      variable =>
        variable.key ===
        normalizedKey
    );


  if (
    duplicate
  ) {

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
      String(
        description || ""
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
        source ||
        "manual",

      sourceReference:
        sourceReference ||
        ""

    }

  };


  if (
    isSecret
  ) {

    variableDocument.encryptedValue =
      encryptSecret(
        normalizedValue
      );

    variableDocument.plainValue =
      "";

  } else {

    variableDocument.plainValue =
      normalizedValue;

    variableDocument.encryptedValue =
      "";

  }


  environment.variables.push(
    variableDocument
  );


  environment.audit =
    environment.audit ||
    {};


  environment.audit.updatedBy =
    userId;


  environment.audit.lastAction =
    "variable_added";


  environment.audit.lastActionAt =
    new Date();


  environment.status =
    "active";


  recalculateValidation(
    environment
  );


  await environment.save();


  return getSafeEnvironment(
    environment
  );

}


/* =========================================================
   UPDATE VARIABLE
========================================================= */

async function updateVariable(
  {
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
    enabled
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName,
      {
        includeSecrets: true
      }
    );


  const currentKey =
    normalizeVariableKey(
      key
    );


  const variable =
    environment.variables.find(
      item =>
        item.key ===
        currentKey
    );


  if (
    !variable
  ) {

    throw new EnvironmentServiceError(

      `Environment variable not found: ${currentKey}`,

      "ENVIRONMENT_VARIABLE_NOT_FOUND",

      404

    );

  }


  /*
   * Key update.
   */

  if (
    newKey !== undefined &&
    newKey !== null &&
    newKey !== ""
  ) {

    const normalizedNewKey =
      normalizeVariableKey(
        newKey
      );


    const duplicate =
      environment.variables.find(
        item =>
          item !== variable &&
          item.key ===
          normalizedNewKey
      );


    if (
      duplicate
    ) {

      throw new EnvironmentServiceError(

        `Environment variable already exists: ${normalizedNewKey}`,

        "ENVIRONMENT_VARIABLE_EXISTS",

        409

      );

    }


    variable.key =
      normalizedNewKey;

  }


  /*
   * Type update.
   */

  if (
    type !== undefined
  ) {

    variable.type =
      normalizeVariableType(
        type
      );

  }


  /*
   * Scope update.
   */

  if (
    scope !== undefined
  ) {

    variable.scope =
      normalizeVariableScope(
        scope
      );

  }


  /*
   * Secret state update.
   */

  if (
    isSecret !== undefined
  ) {

    const nextSecret =
      Boolean(
        isSecret
      );


    /*
     * If changing from secret → public,
     * decrypt the existing value once and store it
     * as plaintext configuration.
     */

    if (
      variable.isSecret &&
      !nextSecret &&
      variable.encryptedValue
    ) {

      const decrypted =
        decryptSecret(
          variable.encryptedValue
        );


      variable.plainValue =
        decrypted;

      variable.encryptedValue =
        "";

    }


    /*
     * If changing from public → secret,
     * encrypt the existing plaintext value.
     */

    if (
      !variable.isSecret &&
      nextSecret &&
      variable.plainValue
    ) {

      variable.encryptedValue =
        encryptSecret(
          variable.plainValue
        );

      variable.plainValue =
        "";

    }


    variable.isSecret =
      nextSecret;

  }


  /*
   * New value.
   *
   * If value is undefined, preserve the existing value.
   */

  if (
    value !== undefined
  ) {

    const normalizedValue =
      normalizeValue(
        value,
        variable.type
      );


    if (
      variable.isSecret
    ) {

      variable.encryptedValue =
        encryptSecret(
          normalizedValue
        );

      variable.plainValue =
        "";

    } else {

      variable.plainValue =
        normalizedValue;

      variable.encryptedValue =
        "";

    }

  }


  /*
   * Required.
   */

  if (
    required !== undefined
  ) {

    variable.required =
      Boolean(
        required
      );

  }


  /*
   * Description.
   */

  if (
    description !== undefined
  ) {

    const normalizedDescription =
      String(
        description
      );


    if (
      normalizedDescription.length >
      MAX_DESCRIPTION_LENGTH
    ) {

      throw new EnvironmentServiceError(

        "Environment variable description is too long",

        "DESCRIPTION_TOO_LONG",

        400

      );

    }


    variable.description =
      normalizedDescription;

  }


  /*
   * Enabled.
   */

  if (
    enabled !== undefined
  ) {

    variable.enabled =
      Boolean(
        enabled
      );

  }


  variable.validationStatus =
    "unknown";


  variable.validationMessage =
    "";


  variable.lastValidatedAt =
    null;


  environment.audit =
    environment.audit ||
    {};


  environment.audit.updatedBy =
    userId;


  environment.audit.lastAction =
    "variable_updated";


  environment.audit.lastActionAt =
    new Date();


  recalculateValidation(
    environment
  );


  await environment.save();


  return getSafeEnvironment(
    environment
  );

}


/* =========================================================
   DELETE VARIABLE
========================================================= */

async function deleteVariable(
  {
    userId,
    projectId,
    environmentName,
    key
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  const normalizedKey =
    normalizeVariableKey(
      key
    );


  const initialLength =
    environment.variables.length;


  environment.variables =
    environment.variables.filter(
      variable =>
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


  environment.audit =
    environment.audit ||
    {};


  environment.audit.updatedBy =
    userId;


  environment.audit.lastAction =
    "variable_deleted";


  environment.audit.lastActionAt =
    new Date();


  recalculateValidation(
    environment
  );


  await environment.save();


  return getSafeEnvironment(
    environment
  );

}


/* =========================================================
   VALIDATE ENVIRONMENT
========================================================= */

async function validateEnvironment(
  {
    userId,
    projectId,
    environmentName
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName,
      {
        includeSecrets: true
      }
    );


  const result =
    recalculateValidation(
      environment
    );


  environment.validation =
    result;


  environment.audit =
    environment.audit ||
    {};


  environment.audit.updatedBy =
    userId;


  environment.audit.lastAction =
    "validated";


  environment.audit.lastActionAt =
    new Date();


  await environment.save();


  return {

    environmentId:
      environment._id,

    projectId:
      environment.projectId,

    environment:
      environment.name,

    ...result

  };

}


/* =========================================================
   RESOLVE VARIABLES FOR DEPLOYMENT
=========================================================

   IMPORTANT:

   This is the ONLY service method intended to provide
   decrypted runtime/build secrets to deployment code.

   It must NOT be used by:
   - AI prompts
   - normal frontend API responses
   - logs
   - analytics
   - error messages
========================================================= */

async function resolveForDeployment(
  {
    userId,
    projectId,
    environmentName,
    scope = "both"
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName,
      {
        includeSecrets: true
      }
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

      validation

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
      variable.scope !==
      normalizedScope &&
      variable.scope !==
      "both" &&
      normalizedScope !==
      "both"
    ) {

      continue;

    }


    let value = "";


    if (
      variable.isSecret
    ) {

      value =
        decryptSecret(
          variable.encryptedValue
        );

    } else {

      value =
        variable.plainValue ||
        "";

    }


    resolved[
      variable.key
    ] =
      value;

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

    variables:
      resolved

  };

}


/* =========================================================
   SAFE ENVIRONMENT RESPONSE
========================================================= */

function getSafeEnvironment(
  environment
) {

  if (
    !environment
  ) {

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

    ...plain,

    variables:
      Array.isArray(
        plain.variables
      )
        ? plain.variables.map(
            variable => ({

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

              hasValue:
                Boolean(
                  variable.isSecret
                    ? variable.encryptedValue
                    : variable.plainValue
                )

            })
          )
        : []

  };

}


/* =========================================================
   BUILD VARIABLE DOCUMENTS
========================================================= */

function buildVariableDocuments(
  variables
) {

  const seen =
    new Set();


  return variables.map(
    variable => {

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
          String(
            variable.description ||
            ""
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
            variable.source ||
            "manual",

          sourceReference:
            variable.sourceReference ||
            ""

        }

      };


      if (
        isSecret
      ) {

        document.encryptedValue =
          encryptSecret(
            value
          );

        document.plainValue =
          "";

      } else {

        document.plainValue =
          value;

        document.encryptedValue =
          "";

      }


      return document;

    }
  );

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


  let requiredVariables =
    0;


  let configuredVariables =
    0;


  let missingVariables =
    0;


  let invalidVariables =
    0;


  const invalidKeys = [];


  for (
    const variable
    of variables
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


    if (
      hasValue
    ) {

      configuredVariables +=
        1;

    }


    if (
      variable.required
    ) {

      requiredVariables +=
        1;


      if (
        !hasValue
      ) {

        missingVariables +=
          1;

        invalidKeys.push(
          variable.key
        );

        continue;

      }

    }


    /*
     * Validate non-secret values directly.
     *
     * Secret values are validated by decrypting only
     * inside this service.
     */

    let value = "";


    try {

      if (
        variable.isSecret
      ) {

        if (
          !variable.encryptedValue
        ) {

          if (
            variable.required
          ) {

            invalidVariables +=
              1;

          }

          continue;

        }


        value =
          decryptSecret(
            variable.encryptedValue
          );

      } else {

        value =
          variable.plainValue ||
          "";

      }


      normalizeValue(
        value,
        variable.type
      );

    } catch (
      error
    ) {

      invalidVariables +=
        1;


      invalidKeys.push(
        variable.key
      );

    }

  }


  let status =
    "valid";


  if (
    missingVariables >
    0 ||
    invalidVariables >
    0
  ) {

    status =
      "invalid";

  }


  const message =
    status === "valid"
      ? "Environment is valid"
      : [
          missingVariables >
          0
            ? `${missingVariables} required variable(s) missing`
            : null,

          invalidVariables >
          0
            ? `${invalidVariables} variable(s) invalid`
            : null
        ]
          .filter(Boolean)
          .join("; ");


  const result = {

    status,

    requiredVariables,

    configuredVariables,

    missingVariables,

    invalidVariables,

    message:
      message ||
      "Environment is valid",

    invalidKeys,

    validatedAt:
      new Date()

  };


  /*
   * Do not call save() here.
   *
   * This function is also used during pre-save operations.
   */

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
      result.validatedAt

  };


  return result;

}


/* =========================================================
   MARK DEPLOYMENT
========================================================= */

async function markDeployed(
  {
    userId,
    projectId,
    environmentName,
    deploymentId,
    version
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  const deploymentVersion =
    Number(
      version ||
      environment.version
    );


  environment.deployedVersion =
    deploymentVersion;


  environment.lastDeploymentId =
    String(
      deploymentId ||
      ""
    );


  environment.lastDeployedAt =
    new Date();


  environment.deployment =
    environment.deployment ||
    {};


  environment.deployment.lastInjectedVersion =
    deploymentVersion;


  environment.audit =
    environment.audit ||
    {};


  environment.audit.updatedBy =
    userId;


  environment.audit.lastAction =
    "deployed";


  environment.audit.lastActionAt =
    new Date();


  await environment.save();


  return getSafeEnvironment(
    environment
  );

}


/* =========================================================
   ARCHIVE ENVIRONMENT
========================================================= */

async function archiveEnvironment(
  {
    userId,
    projectId,
    environmentName
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  environment.status =
    "archived";


  environment.archivedAt =
    new Date();


  environment.audit =
    environment.audit ||
    {};


  environment.audit.updatedBy =
    userId;


  environment.audit.lastAction =
    "archived";


  environment.audit.lastActionAt =
    new Date();


  await environment.save();


  return getSafeEnvironment(
    environment
  );

}


/* =========================================================
   UNARCHIVE ENVIRONMENT
========================================================= */

async function unarchiveEnvironment(
  {
    userId,
    projectId,
    environmentName
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  environment.status =
    "active";


  environment.archivedAt =
    null;


  environment.audit =
    environment.audit ||
    {};


  environment.audit.updatedBy =
    userId;


  environment.audit.lastAction =
    "unarchived";


  environment.audit.lastActionAt =
    new Date();


  recalculateValidation(
    environment
  );


  await environment.save();


  return getSafeEnvironment(
    environment
  );

}


/* =========================================================
   DELETE ENVIRONMENT
========================================================= */

async function deleteEnvironment(
  {
    userId,
    projectId,
    environmentName
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  /*
   * Production is intentionally not silently deleted.
   *
   * Archive it instead.
   */

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


  await Environment.deleteOne({

    _id:
      environment._id,

    userId,

    projectId

  });


  return {

    success:
      true,

    environmentId:
      environment._id,

    environment:
      environment.name,

    deleted:
      true

  };

}


/* =========================================================
   DEPLOYMENT SNAPSHOT
=========================================================

   Creates a controlled snapshot of the environment for
   deployment.

   IMPORTANT:
   This object contains decrypted secrets.

   It MUST:
   - stay in server memory
   - never be logged
   - never be returned to the frontend
   - never be sent to an AI provider
   - never be persisted as normal project data
========================================================= */

async function createDeploymentSnapshot(
  {
    userId,
    projectId,
    environmentName
  }
) {

  const resolved =
    await resolveForDeployment({

      userId,

      projectId,

      environmentName,

      scope:
        "both"

    });


  return {

    environmentId:
      resolved.environmentId,

    projectId:
      resolved.projectId,

    environment:
      resolved.environment,

    version:
      resolved.version,

    variables:
      resolved.variables,

    createdAt:
      new Date()

  };

}


/* =========================================================
   EXPORT ENVIRONMENT AS ENV FILE
=========================================================

   This method intentionally defaults to masked output.

   A caller must explicitly set includeSecrets=true to
   receive actual values.

   This should ONLY be used by trusted server-side
   workflows.
========================================================= */

async function exportEnvironment(
  {
    userId,
    projectId,
    environmentName,
    includeSecrets = false,
    scope = "both"
  }
) {

  if (
    includeSecrets
  ) {

    const deployment =
      await resolveForDeployment({

        userId,

        projectId,

        environmentName,

        scope

      });


    const lines =
      Object.entries(
        deployment.variables
      )
        .map(
          ([key, value]) =>
            `${key}=${formatEnvValue(value)}`
        );


    return {

      environment:
        deployment.environment,

      version:
        deployment.version,

      content:
        lines.join("\n"),

      includesSecrets:
        true

    };

  }


  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  const lines =
    environment.variables
      .filter(
        variable =>
          variable.enabled
      )
      .filter(
        variable =>
          variable.scope === scope ||
          variable.scope === "both" ||
          scope === "both"
      )
      .map(
        variable => {

          const value =
            variable.isSecret
              ? "********"
              : (
                  variable.plainValue ||
                  ""
                );


          return (
            `${variable.key}=` +
            `${formatEnvValue(value)}`
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
      false

  };

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


  /*
   * Quote values containing characters that could alter
   * shell/env parsing.
   */

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
   GET MASKED VARIABLE
========================================================= */

async function getVariable(
  {
    userId,
    projectId,
    environmentName,
    key
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  const normalizedKey =
    normalizeVariableKey(
      key
    );


  const variable =
    environment.variables.find(
      item =>
        item.key ===
        normalizedKey
    );


  if (
    !variable
  ) {

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
        ? false
        : Boolean(
            variable.plainValue
          ),

    value:
      variable.isSecret
        ? maskSecret(
            "secret"
          )
        : (
            variable.plainValue ||
            ""
          )

  };

}


/* =========================================================
   GET SECRET VALUE
=========================================================

   Extremely restricted service-level operation.

   Controllers should NOT expose this directly to normal
   frontend requests.

   Intended consumers:
   - deployment service
   - runtime injection
   - controlled infrastructure workers
========================================================= */

async function getSecretValue(
  {
    userId,
    projectId,
    environmentName,
    key
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName,
      {
        includeSecrets: true
      }
    );


  const normalizedKey =
    normalizeVariableKey(
      key
    );


  const variable =
    environment.variables.find(
      item =>
        item.key ===
        normalizedKey
    );


  if (
    !variable
  ) {

    throw new EnvironmentServiceError(

      `Environment variable not found: ${normalizedKey}`,

      "ENVIRONMENT_VARIABLE_NOT_FOUND",

      404

    );

  }


  if (
    !variable.isSecret
  ) {

    return (
      variable.plainValue ||
      ""
    );

  }


  return decryptSecret(
    variable.encryptedValue
  );

}


/* =========================================================
   SAFE CONFIGURATION SUMMARY
========================================================= */

async function getConfigurationSummary(
  {
    userId,
    projectId,
    environmentName
  }
) {

  const environment =
    await findEnvironment(
      userId,
      projectId,
      environmentName
    );


  const variables =
    environment.variables
      .filter(
        variable =>
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

    variableCount:
      variables.length,

    secretCount:
      variables.filter(
        variable =>
          variable.isSecret
      ).length,

    requiredCount:
      variables.filter(
        variable =>
          variable.required
      ).length,

    buildVariableCount:
      variables.filter(
        variable =>
          variable.scope ===
            "build" ||
          variable.scope ===
            "both"
      ).length,

    runtimeVariableCount:
      variables.filter(
        variable =>
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
      environment.lastDeployedAt

  };

}


/* =========================================================
   COPY ENVIRONMENT
=========================================================

   Useful for:

   Development → Preview
   Preview → Production

   IMPORTANT:
   Secrets are decrypted and immediately re-encrypted
   using a fresh IV. They are never returned to caller.
========================================================= */

async function copyEnvironment(
  {
    userId,
    projectId,
    sourceEnvironment,
    targetEnvironment,
    updatedBy
  }
) {

  const sourceName =
    normalizeEnvironmentName(
      sourceEnvironment
    );


  const targetName =
    normalizeEnvironmentName(
      targetEnvironment
    );


  if (
    sourceName ===
    targetName
  ) {

    throw new EnvironmentServiceError(

      "Source and target environments must be different",

      "SAME_ENVIRONMENT_COPY",

      400

    );

  }


  const source =
    await findEnvironment(
      userId,
      projectId,
      sourceName,
      {
        includeSecrets: true
      }
    );


  let target =
    await Environment.findOne({

      userId,

      projectId,

      name:
        targetName

    })
      .select(
        "+variables.encryptedValue +variables.plainValue"
      )
      .exec();


  const copiedVariables =
    [];


  for (
    const variable
    of source.variables
  ) {

    let value = "";


    if (
      variable.isSecret
    ) {

      value =
        decryptSecret(
          variable.encryptedValue
        );

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
          `${sourceName}->${targetName}`

      }

    };


    if (
      variable.isSecret
    ) {

      copied.encryptedValue =
        encryptSecret(
          value
        );

      copied.plainValue =
        "";

    } else {

      copied.plainValue =
        value;

      copied.encryptedValue =
        "";

    }


    copiedVariables.push(
      copied
    );

  }


  if (
    !target
  ) {

    target =
      new Environment({

        userId,

        projectId,

        name:
          targetName,

        displayName:
          capitalizeEnvironmentName(
            targetName
          )

      });

  }


  target.variables =
    copiedVariables;


  target.status =
    "active";


  target.source =
    target.source ||
    {};


  target.source.type =
    "import";


  target.version =
    Math.max(
      1,
      Number(
        target.version ||
        0
      ) + 1
    );


  target.audit =
    target.audit ||
    {};


  target.audit.updatedBy =
    updatedBy ||
    userId;


  target.audit.lastAction =
    "copied_from_environment";


  target.audit.lastActionAt =
    new Date();


  recalculateValidation(
    target
  );


  await target.save();


  return getSafeEnvironment(
    target
  );

}


/* =========================================================
   CAPITALIZE ENVIRONMENT NAME
========================================================= */

function capitalizeEnvironmentName(
  name
) {

  if (
    !name
  ) {

    return "";

  }


  return (
    String(name)
      .charAt(0)
      .toUpperCase() +
    String(name)
      .slice(1)
  );

}


/* =========================================================
   HEALTH CHECK
========================================================= */

function healthCheck() {

  let encryptionConfigured =
    false;


  try {

    getEncryptionKey();

    encryptionConfigured =
      true;

  } catch (
    error
  ) {

    encryptionConfigured =
      false;

  }


  return {

    success:
      true,

    service:
      "environmentService",

    version:
      SERVICE_VERSION,

    encryption:

      {

        algorithm:
          ENCRYPTION_ALGORITHM,

        configured:
          encryptionConfigured

      },

    supportedEnvironments:
      [
        ...ENVIRONMENT_NAMES
      ],

    supportedVariableTypes:
      [
        ...VARIABLE_TYPES
      ],

    supportedScopes:
      [
        ...VARIABLE_SCOPES
      ]

  };

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  /* Environment CRUD */

  createEnvironment,

  getEnvironment,

  listEnvironments,

  deleteEnvironment,

  archiveEnvironment,

  unarchiveEnvironment,


  /* Variable CRUD */

  addVariable,

  updateVariable,

  deleteVariable,

  getVariable,


  /* Validation */

  validateEnvironment,

  getConfigurationSummary,


  /* Deployment */

  resolveForDeployment,

  createDeploymentSnapshot,

  markDeployed,


  /* Environment operations */

  copyEnvironment,

  exportEnvironment,


  /* Security */

  getSecretValue,

  maskSecret,

  encryptSecret,

  decryptSecret,


  /* Helpers */

  normalizeEnvironmentName,

  normalizeVariableKey,

  normalizeVariableType,

  normalizeVariableScope,

  getSafeEnvironment,

  recalculateValidation,


  /* Diagnostics */

  healthCheck,


  /* Constants */

  SERVICE_VERSION,

  ENVIRONMENT_NAMES,

  VARIABLE_TYPES,

  VARIABLE_SCOPES

};


/* =========================================================
   SERVICE ERROR EXPORT
========================================================= */

module.exports.EnvironmentServiceError =
  EnvironmentServiceError;
