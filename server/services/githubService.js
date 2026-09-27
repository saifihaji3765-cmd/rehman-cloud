const axios = require("axios");
const crypto = require("crypto");

const GithubConnection =
  require("../models/githubConnectionModel");

/* =========================================================
   ZYRION OS — GITHUB SERVICE
   Centralized GitHub API / Connection Service
   ========================================================= */

const GITHUB_API_URL =
  process.env.GITHUB_API_URL ||
  "https://api.github.com";

const GITHUB_API_VERSION =
  process.env.GITHUB_API_VERSION ||
  "2022-11-28";

const DEFAULT_TIMEOUT =
  Number(process.env.GITHUB_API_TIMEOUT_MS) ||
  15000;

/* =========================================================
   ERROR CLASS
========================================================= */

class GithubServiceError extends Error {

  constructor(
    message,
    options = {}
  ) {

    super(message);

    this.name =
      "GithubServiceError";

    this.code =
      options.code ||
      "GITHUB_SERVICE_ERROR";

    this.status =
      options.status ||
      500;

    this.githubStatus =
      options.githubStatus ||
      null;

    this.details =
      options.details ||
      null;

    this.retryable =
      options.retryable === true;

  }

}

/* =========================================================
   BASIC NORMALIZATION
========================================================= */

function normalizeString(
  value,
  fallback = ""
) {

  if (
    typeof value !== "string"
  ) {
    return fallback;
  }

  return value.trim();

}

function normalizeOwner(
  owner
) {

  const value =
    normalizeString(owner);

  if (!value) {
    throw new GithubServiceError(
      "GitHub repository owner is required",
      {
        code:
          "GITHUB_OWNER_REQUIRED",
        status: 400
      }
    );
  }

  return value;

}

function normalizeRepository(
  repository
) {

  const value =
    normalizeString(repository);

  if (!value) {
    throw new GithubServiceError(
      "GitHub repository name is required",
      {
        code:
          "GITHUB_REPOSITORY_REQUIRED",
        status: 400
      }
    );
  }

  return value;

}

/* =========================================================
   GITHUB API CLIENT
========================================================= */

function createGithubClient(
  accessToken
) {

  if (!accessToken) {

    throw new GithubServiceError(
      "GitHub access token is required",
      {
        code:
          "GITHUB_ACCESS_TOKEN_REQUIRED",
        status: 401
      }
    );

  }

  return axios.create({

    baseURL:
      GITHUB_API_URL,

    timeout:
      DEFAULT_TIMEOUT,

    headers: {

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        GITHUB_API_VERSION,

      Authorization:
        `Bearer ${accessToken}`

    }

  });

}

/* =========================================================
   API ERROR NORMALIZATION
========================================================= */

function normalizeGithubError(
  error,
  operation = "GitHub API request"
) {

  if (
    error instanceof
    GithubServiceError
  ) {
    return error;
  }

  const response =
    error?.response;

  const status =
    response?.status ||
    500;

  const data =
    response?.data ||
    {};

  const githubMessage =
    data?.message ||
    error?.message ||
    "Unknown GitHub error";

  let code =
    "GITHUB_API_ERROR";

  let retryable =
    false;

  if (
    status === 401
  ) {

    code =
      "GITHUB_AUTHENTICATION_FAILED";

  }

  else if (
    status === 403
  ) {

    code =
      "GITHUB_PERMISSION_OR_RATE_LIMIT";

    retryable =
      true;

  }

  else if (
    status === 404
  ) {

    code =
      "GITHUB_RESOURCE_NOT_FOUND";

  }

  else if (
    status === 409
  ) {

    code =
      "GITHUB_CONFLICT";

  }

  else if (
    status === 422
  ) {

    code =
      "GITHUB_VALIDATION_FAILED";

  }

  else if (
    status === 429
  ) {

    code =
      "GITHUB_RATE_LIMITED";

    retryable =
      true;

  }

  else if (
    status >= 500
  ) {

    code =
      "GITHUB_PROVIDER_ERROR";

    retryable =
      true;

  }

  else if (
    error?.code ===
      "ECONNABORTED" ||
    error?.code ===
      "ETIMEDOUT" ||
    error?.code ===
      "ECONNRESET"
  ) {

    code =
      "GITHUB_NETWORK_ERROR";

    retryable =
      true;

  }

  return new GithubServiceError(
    `${operation} failed: ${githubMessage}`,
    {
      code,
      status:
        status >= 500
          ? 502
          : status,
      githubStatus:
        response?.status ||
        null,
      retryable,
      details: {
        githubMessage,
        documentationUrl:
          data?.documentation_url ||
          "",
        errors:
          data?.errors ||
          []
      }
    }
  );

}

/* =========================================================
   REQUEST WRAPPER
========================================================= */

async function githubRequest(
  client,
  config,
  operation
) {

  try {

    const response =
      await client.request(
        config
      );

    return response.data;

  }

  catch (error) {

    throw normalizeGithubError(
      error,
      operation
    );

  }

}

/* =========================================================
   TOKEN ENCRYPTION HELPERS
   Service is the only layer that handles plaintext tokens.
========================================================= */

function getEncryptionKey() {

  const rawKey =
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY ||
    process.env.ENVIRONMENT_ENCRYPTION_KEY;

  if (!rawKey) {

    throw new GithubServiceError(
      "GitHub token encryption key is not configured",
      {
        code:
          "GITHUB_TOKEN_ENCRYPTION_KEY_MISSING",
        status: 500
      }
    );

  }

  const keyBuffer =
    Buffer.from(
      rawKey,
      "base64"
    );

  if (
    keyBuffer.length === 32
  ) {
    return keyBuffer;
  }

  const hexBuffer =
    Buffer.from(
      rawKey,
      "hex"
    );

  if (
    hexBuffer.length === 32
  ) {
    return hexBuffer;
  }

  return crypto
    .createHash("sha256")
    .update(rawKey)
    .digest();

}

function encryptToken(
  token
) {

  const key =
    getEncryptionKey();

  const iv =
    crypto.randomBytes(12);

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      key,
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        token,
        "utf8"
      ),
      cipher.final()
    ]);

  const authTag =
    cipher.getAuthTag();

  return {

    encrypted:
      encrypted.toString("base64"),

    iv:
      iv.toString("base64"),

    authTag:
      authTag.toString("base64"),

    algorithm:
      "aes-256-gcm",

    keyVersion:
      process.env.GITHUB_TOKEN_ENCRYPTION_KEY_VERSION ||
      "v1"

  };

}

function decryptToken(
  encryptedToken,
  iv,
  authTag
) {

  const key =
    getEncryptionKey();

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(
        iv,
        "base64"
      )
    );

  decipher.setAuthTag(
    Buffer.from(
      authTag,
      "base64"
    )
  );

  const decrypted =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          encryptedToken,
          "base64"
        )
      ),
      decipher.final()
    ]);

  return decrypted.toString(
    "utf8"
  );

}

/* =========================================================
   TOKEN STORAGE
========================================================= */

async function storeAccessToken(
  connection,
  accessToken
) {

  if (!accessToken) {

    throw new GithubServiceError(
      "GitHub access token cannot be empty",
      {
        code:
          "GITHUB_ACCESS_TOKEN_EMPTY",
        status: 400
      }
    );

  }

  const encrypted =
    encryptToken(
      accessToken
    );

  connection.tokens =
    connection.tokens ||
    {};

  connection.tokens.encryptedAccessToken =
    encrypted.encrypted;

  connection.tokens.hasAccessToken =
    true;

  connection.tokens.accessTokenEncryption =
    {
      algorithm:
        encrypted.algorithm,

      keyVersion:
        encrypted.keyVersion,

      iv:
        encrypted.iv,

      authTag:
        encrypted.authTag
    };

}

function readAccessToken(
  connection
) {

  if (
    !connection?.tokens?.hasAccessToken
  ) {

    throw new GithubServiceError(
      "GitHub connection has no access token",
      {
        code:
          "GITHUB_CONNECTION_TOKEN_MISSING",
        status: 401
      }
    );

  }

  const encrypted =
    connection
      .tokens
      .encryptedAccessToken;

  const encryption =
    connection
      .tokens
      .accessTokenEncryption;

  if (
    !encrypted ||
    !encryption?.iv ||
    !encryption?.authTag
  ) {

    throw new GithubServiceError(
      "GitHub access token encryption data is incomplete",
      {
        code:
          "GITHUB_TOKEN_ENCRYPTION_INVALID",
        status: 500
      }
    );

  }

  return decryptToken(
    encrypted,
    encryption.iv,
    encryption.authTag
  );

}

/* =========================================================
   CREATE CONNECTION
========================================================= */

async function createConnection({
  userId,
  projectId = null,
  accessToken,
  connectionType = "oauth",
  githubUser,
  scopes = []
}) {

  if (!userId) {

    throw new GithubServiceError(
      "User ID is required",
      {
        code:
          "USER_ID_REQUIRED",
        status: 400
      }
    );

  }

  if (!githubUser?.githubId) {

    throw new GithubServiceError(
      "GitHub user identity is required",
      {
        code:
          "GITHUB_USER_REQUIRED",
        status: 400
      }
    );

  }

  const existing =
    await GithubConnection.findOne({
      userId,
      "githubUser.githubId":
        String(
          githubUser.githubId
        ),
      isArchived: false
    });

  let connection =
    existing;

  if (!connection) {

    connection =
      new GithubConnection({

        userId,

        projectId,

        provider:
          "github",

        connectionType,

        status:
          "pending",

        githubUser: {

          githubId:
            String(
              githubUser.githubId
            ),

          login:
            normalizeString(
              githubUser.login
            ),

          name:
            normalizeString(
              githubUser.name
            ),

          email:
            normalizeString(
              githubUser.email
            ).toLowerCase(),

          avatarUrl:
            normalizeString(
              githubUser.avatarUrl
            ),

          profileUrl:
            normalizeString(
              githubUser.profileUrl
            ),

          htmlUrl:
            normalizeString(
              githubUser.htmlUrl
            )

        },

        tokens: {

          scopes:
            Array.isArray(scopes)
              ? scopes
              : []

        }

      });

  }

  if (accessToken) {

    await storeAccessToken(
      connection,
      accessToken
    );

  }

  connection.tokens.scopes =
    Array.isArray(scopes)
      ? scopes
      : connection.tokens.scopes || [];

  connection.status =
    "active";

  connection.isValidated =
    false;

  connection.lastValidatedAt =
    null;

  connection.metadata.connectedFrom =
    connectionType;

  await connection.save();

  return sanitizeConnection(
    connection
  );

}

/* =========================================================
   GET CONNECTION
========================================================= */

async function getConnectionById(
  connectionId,
  userId
) {

  const query = {
    _id:
      connectionId,
    isArchived:
      false
  };

  if (userId) {
    query.userId =
      userId;
  }

  const connection =
    await GithubConnection
      .findOne(query)
      .select("+tokens.encryptedAccessToken +tokens.accessTokenEncryption.iv +tokens.accessTokenEncryption.authTag");

  if (!connection) {

    throw new GithubServiceError(
      "GitHub connection not found",
      {
        code:
          "GITHUB_CONNECTION_NOT_FOUND",
        status: 404
      }
    );

  }

  return connection;

}

/* =========================================================
   LIST CONNECTIONS
========================================================= */

async function listConnections(
  userId
) {

  if (!userId) {

    throw new GithubServiceError(
      "User ID is required",
      {
        code:
          "USER_ID_REQUIRED",
        status: 400
      }
    );

  }

  const connections =
    await GithubConnection
      .find({
        userId,
        isArchived: false
      })
      .sort({
        createdAt: -1
      });

  return connections.map(
    sanitizeConnection
  );

}

/* =========================================================
   VALIDATE CONNECTION
========================================================= */

async function validateConnection(
  connectionId,
  userId
) {

  const connection =
    await getConnectionById(
      connectionId,
      userId
    );

  const accessToken =
    readAccessToken(
      connection
    );

  const client =
    createGithubClient(
      accessToken
    );

  try {

    const profile =
      await githubRequest(
        client,
        {
          method:
            "GET",
          url:
            "/user"
        },
        "GitHub connection validation"
      );

    connection.status =
      "active";

    connection.isValidated =
      true;

    connection.lastValidatedAt =
      new Date();

    connection.metadata.lastValidationMessage =
      "GitHub connection validated successfully";

    connection.metadata.lastErrorCode =
      "";

    connection.metadata.lastErrorMessage =
      "";

    connection.lastErrorAt =
      null;

    if (profile?.id) {

      connection.githubUser.githubId =
        String(profile.id);

    }

    if (profile?.login) {

      connection.githubUser.login =
        profile.login;

    }

    if (profile?.name) {

      connection.githubUser.name =
        profile.name;

    }

    if (profile?.avatar_url) {

      connection.githubUser.avatarUrl =
        profile.avatar_url;

    }

    if (profile?.html_url) {

      connection.githubUser.htmlUrl =
        profile.html_url;

    }

    connection.metadata.lastUsedAt =
      new Date();

    await connection.save();

    return sanitizeConnection(
      connection
    );

  }

  catch (error) {

    connection.isValidated =
      false;

    connection.lastValidatedAt =
      new Date();

    connection.status =
      error.code ===
      "GITHUB_AUTHENTICATION_FAILED"
        ? "revoked"
        : "error";

    connection.metadata.lastErrorCode =
      error.code;

    connection.metadata.lastErrorMessage =
      error.message;

    connection.lastErrorAt =
      new Date();

    await connection.save();

    throw error;

  }

}

/* =========================================================
   DISCONNECT CONNECTION
========================================================= */

async function disconnectConnection(
  connectionId,
  userId
) {

  const connection =
    await getConnectionById(
      connectionId,
      userId
    );

  connection.status =
    "disconnected";

  connection.isValidated =
    false;

  connection.disconnectedAt =
    new Date();

  connection.tokens =
    {};

  connection.metadata.lastUsedAt =
    new Date();

  await connection.save();

  return sanitizeConnection(
    connection
  );

}

/* =========================================================
   REPOSITORY LIST
========================================================= */

async function listRepositories(
  connectionId,
  userId,
  options = {}
) {

  const connection =
    await getConnectionById(
      connectionId,
      userId
    );

  const accessToken =
    readAccessToken(
      connection
    );

  const client =
    createGithubClient(
      accessToken
    );

  const params = {

    per_page:
      Math.min(
        Math.max(
          Number(
            options.perPage
          ) || 30,
          1
        ),
        100
      ),

    page:
      Math.max(
        Number(
          options.page
        ) || 1,
        1
      ),

    sort:
      options.sort ||
      "updated",

    direction:
      options.direction ||
      "desc"

  };

  const repositories =
    await githubRequest(
      client,
      {
        method:
          "GET",
        url:
          "/user/repos",
        params
      },
      "GitHub repository listing"
    );

  connection.metadata.repositoryCount =
    Array.isArray(repositories)
      ? repositories.length
      : 0;

  connection.metadata.lastRepositorySyncAt =
    new Date();

  connection.metadata.lastUsedAt =
    new Date();

  await connection.save();

  return (
    Array.isArray(
      repositories
    )
      ? repositories.map(
          normalizeRepositoryResponse
        )
      : []
  );

}

/* =========================================================
   REPOSITORY DETAILS
========================================================= */

async function getRepository(
  connectionId,
  userId,
  owner,
  repository
) {

  owner =
    normalizeOwner(owner);

  repository =
    normalizeRepository(
      repository
    );

  const connection =
    await getConnectionById(
      connectionId,
      userId
    );

  const accessToken =
    readAccessToken(
      connection
    );

  const client =
    createGithubClient(
      accessToken
    );

  const result =
    await githubRequest(
      client,
      {
        method:
          "GET",
        url:
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
      },
      "GitHub repository details"
    );

  return normalizeRepositoryResponse(
    result
  );

}

/* =========================================================
   BRANCH LIST
========================================================= */

async function listBranches(
  connectionId,
  userId,
  owner,
  repository,
  options = {}
) {

  owner =
    normalizeOwner(owner);

  repository =
    normalizeRepository(
      repository
    );

  const connection =
    await getConnectionById(
      connectionId,
      userId
    );

  const accessToken =
    readAccessToken(
      connection
    );

  const client =
    createGithubClient(
      accessToken
    );

  const branches =
    await githubRequest(
      client,
      {
        method:
          "GET",
        url:
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches`,
        params: {
          per_page:
            Math.min(
              Math.max(
                Number(
                  options.perPage
                ) || 50,
                1
              ),
              100
            ),

          page:
            Math.max(
              Number(
                options.page
              ) || 1,
              1
            )
        }
      },
      "GitHub branch listing"
    );

  return (
    Array.isArray(branches)
      ? branches.map(
          (branch) => ({
            name:
              branch.name || "",

            protected:
              branch.protected === true,

            sha:
              branch.commit?.sha ||
              ""
          })
        )
      : []
  );

}

/* =========================================================
   REPOSITORY CONTENTS
========================================================= */

async function getRepositoryContents(
  connectionId,
  userId,
  owner,
  repository,
  path = "",
  branch = ""
) {

  owner =
    normalizeOwner(owner);

  repository =
    normalizeRepository(
      repository
    );

  const connection =
    await getConnectionById(
      connectionId,
      userId
    );

  const accessToken =
    readAccessToken(
      connection
    );

  const client =
    createGithubClient(
      accessToken
    );

  const params =
    branch
      ? {
          ref:
            branch
        }
      : {};

  const cleanPath =
    normalizeString(
      path
    );

  const url =
    cleanPath
      ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${cleanPath
          .split("/")
          .map(
            encodeURIComponent
          )
          .join("/")}`
      : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents`;

  const result =
    await githubRequest(
      client,
      {
        method:
          "GET",
        url,
        params
      },
      "GitHub repository contents"
    );

  if (
    Array.isArray(result)
  ) {

    return result.map(
      normalizeContentItem
    );

  }

  return normalizeContentItem(
    result
  );

}

/* =========================================================
   FILE CONTENT
========================================================= */

async function getFileContent(
  connectionId,
  userId,
  owner,
  repository,
  path,
  branch = ""
) {

  if (
    !normalizeString(path)
  ) {

    throw new GithubServiceError(
      "Repository file path is required",
      {
        code:
          "GITHUB_FILE_PATH_REQUIRED",
        status: 400
      }
    );

  }

  const result =
    await getRepositoryContents(
      connectionId,
      userId,
      owner,
      repository,
      path,
      branch
    );

  if (
    Array.isArray(result)
  ) {

    throw new GithubServiceError(
      "Requested GitHub path is a directory, not a file",
      {
        code:
          "GITHUB_PATH_IS_DIRECTORY",
        status: 400
      }
    );

  }

  let content =
    "";

  if (
    result.encoding ===
      "base64" &&
    result.content
  ) {

    content =
      Buffer.from(
        result.content.replace(
          /\s/g,
          ""
        ),
        "base64"
      ).toString(
        "utf8"
      );

  }

  return {

    path:
      result.path || path,

    name:
      result.name || "",

    sha:
      result.sha || "",

    size:
      result.size || 0,

    encoding:
      result.encoding || "",

    content,

    htmlUrl:
      result.html_url || "",

    downloadUrl:
      result.download_url || ""

  };

}

/* =========================================================
   DEFAULT BRANCH
========================================================= */

async function getDefaultBranch(
  connectionId,
  userId,
  owner,
  repository
) {

  const repo =
    await getRepository(
      connectionId,
      userId,
      owner,
      repository
    );

  return {

    branch:
      repo.defaultBranch ||
      "",

    repository:
      repo

  };

}

/* =========================================================
   SANITIZE CONNECTION
========================================================= */

function sanitizeConnection(
  connection
) {

  if (!connection) {
    return null;
  }

  const object =
    typeof connection.toObject ===
    "function"
      ? connection.toObject()
      : {
          ...connection
        };

  if (object.tokens) {

    delete object.tokens
      .encryptedAccessToken;

    delete object.tokens
      .encryptedRefreshToken;

    if (
      object.tokens
        .accessTokenEncryption
    ) {

      delete object.tokens
        .accessTokenEncryption.iv;

      delete object.tokens
        .accessTokenEncryption.authTag;

    }

    if (
      object.tokens
        .refreshTokenEncryption
    ) {

      delete object.tokens
        .refreshTokenEncryption.iv;

      delete object.tokens
        .refreshTokenEncryption.authTag;

    }

  }

  return object;

}

/* =========================================================
   NORMALIZE REPOSITORY
========================================================= */

function normalizeRepositoryResponse(
  repository
) {

  return {

    id:
      repository?.id || null,

    nodeId:
      repository?.node_id || "",

    name:
      repository?.name || "",

    fullName:
      repository?.full_name || "",

    owner: {

      login:
        repository?.owner?.login ||
        "",

      id:
        repository?.owner?.id ||
        null

    },

    private:
      repository?.private === true,

    description:
      repository?.description ||
      "",

    defaultBranch:
      repository?.default_branch ||
      "",

    htmlUrl:
      repository?.html_url ||
      "",

    cloneUrl:
      repository?.clone_url ||
      "",

    sshUrl:
      repository?.ssh_url ||
      "",

    language:
      repository?.language ||
      "",

    fork:
      repository?.fork === true,

    archived:
      repository?.archived === true,

    disabled:
      repository?.disabled === true,

    visibility:
      repository?.visibility ||
      "",

    size:
      repository?.size ||
      0,

    stargazersCount:
      repository?.stargazers_count ||
      0,

    forksCount:
      repository?.forks_count ||
      0,

    openIssuesCount:
      repository?.open_issues_count ||
      0,

    createdAt:
      repository?.created_at ||
      null,

    updatedAt:
      repository?.updated_at ||
      null,

    pushedAt:
      repository?.pushed_at ||
      null

  };

}

/* =========================================================
   NORMALIZE CONTENT ITEM
========================================================= */

function normalizeContentItem(
  item
) {

  return {

    name:
      item?.name ||
      "",

    path:
      item?.path ||
      "",

    sha:
      item?.sha ||
      "",

    size:
      item?.size ||
      0,

    type:
      item?.type ||
      "file",

    htmlUrl:
      item?.html_url ||
      "",

    downloadUrl:
      item?.download_url ||
      "",

    gitUrl:
      item?.git_url ||
      "",

    url:
      item?.url ||
      "",

    encoding:
      item?.encoding ||
      "",

    content:
      item?.content ||
      ""

  };

}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {

  GithubServiceError,

  createConnection,

  getConnectionById,

  listConnections,

  validateConnection,

  disconnectConnection,

  listRepositories,

  getRepository,

  listBranches,

  getRepositoryContents,

  getFileContent,

  getDefaultBranch,

  sanitizeConnection,

  encryptToken,

  decryptToken

};
