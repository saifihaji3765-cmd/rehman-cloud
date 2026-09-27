"use strict";

/**
 * =========================================================
 * ZyrionOS
 * GitHub Agent
 * =========================================================
 *
 * Responsibilities:
 *
 * GitHub Connection
 * Repository Browser
 * Branch Browser
 * File / Contents Browser
 * Repository Analyzer
 * Deployment Readiness
 *
 * Architecture:
 *
 * Controller
 *    ↓
 * GitHub Agent
 *    ↓
 * ├── GitHub Service
 * └── GitHub Analyzer
 *
 * IMPORTANT:
 * - No direct GitHub API calls
 * - No AI provider calls
 * - No OpenAI/Gemini/Claude/DeepSeek calls
 * - No deployment execution
 * - No secret exposure
 * =========================================================
 */

const githubService =
  require(
    "../services/githubService"
  );

const githubAnalyzer =
  require(
    "../services/githubAnalyzer"
  );

/* =========================================================
   AGENT METADATA
========================================================= */

const AGENT_NAME =
  "github-agent";

const AGENT_VERSION =
  "2.0.0";

/* =========================================================
   SUPPORTED ACTIONS
========================================================= */

const SUPPORTED_ACTIONS = [
  "connection-create",
  "connection-list",
  "connection-get",
  "connection-validate",
  "connection-disconnect",

  "repositories-list",
  "repository-get",

  "branches-list",

  "contents-list",
  "file-get",

  "default-branch",

  "repository-analysis",
  "analyze-repository",

  "deployment-readiness",

  "health"
];

/* =========================================================
   ERROR
========================================================= */

class GithubAgentError
  extends Error {

  constructor(
    message,
    code =
      "GITHUB_AGENT_ERROR",
    details = {}
  ) {
    super(message);

    this.name =
      "GithubAgentError";

    this.code =
      code;

    this.details =
      details;
  }
}

/* =========================================================
   VALIDATION
========================================================= */

function requireUserId(
  userId
) {
  if (
    !userId ||
    typeof userId !==
      "string"
  ) {
    throw new GithubAgentError(
      "User ID required",
      "USER_ID_REQUIRED"
    );
  }

  return userId;
}

function requireConnectionId(
  connectionId
) {
  if (
    !connectionId ||
    typeof connectionId !==
      "string"
  ) {
    throw new GithubAgentError(
      "GitHub connection ID required",
      "CONNECTION_ID_REQUIRED"
    );
  }

  return connectionId;
}

function requireRepository(
  owner,
  repository
) {
  if (
    !owner ||
    typeof owner !==
      "string"
  ) {
    throw new GithubAgentError(
      "GitHub repository owner required",
      "OWNER_REQUIRED"
    );
  }

  if (
    !repository ||
    typeof repository !==
      "string"
  ) {
    throw new GithubAgentError(
      "GitHub repository name required",
      "REPOSITORY_REQUIRED"
    );
  }

  return {
    owner,
    repository
  };
}

/* =========================================================
   CONNECTION CREATE
========================================================= */

async function createConnection(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    if (
      !input.accessToken ||
      typeof input.accessToken !==
        "string"
    ) {
      throw new GithubAgentError(
        "GitHub access token required",
        "ACCESS_TOKEN_REQUIRED"
      );
    }

    return await githubService
      .createConnection({
        userId,

        projectId:
          input.projectId ||
          null,

        connectionType:
          input.connectionType ||
          "personal_token",

        accessToken:
          input.accessToken,

        refreshToken:
          input.refreshToken ||
          null,

        scopes:
          input.scopes ||
          []
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to create GitHub connection"
    );
  }
}

/* =========================================================
   CONNECTION LIST
========================================================= */

async function listConnections(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    return await githubService
      .listConnections({
        userId,

        projectId:
          input.projectId ||
          null,

        includeArchived:
          Boolean(
            input.includeArchived
          )
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to list GitHub connections"
    );
  }
}

/* =========================================================
   CONNECTION GET
========================================================= */

async function getConnection(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    return await githubService
      .getConnection({
        userId,

        connectionId
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to get GitHub connection"
    );
  }
}

/* =========================================================
   CONNECTION VALIDATE
========================================================= */

async function validateConnection(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    return await githubService
      .validateConnection({
        userId,

        connectionId
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to validate GitHub connection"
    );
  }
}

/* =========================================================
   CONNECTION DISCONNECT
========================================================= */

async function disconnectConnection(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    return await githubService
      .disconnectConnection({
        userId,

        connectionId
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to disconnect GitHub connection"
    );
  }
}

/* =========================================================
   LIST REPOSITORIES
========================================================= */

async function listRepositories(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    return await githubService
      .listRepositories({
        userId,

        connectionId,

        page:
          input.page,

        perPage:
          input.perPage,

        visibility:
          input.visibility,

        affiliation:
          input.affiliation,

        sort:
          input.sort,

        direction:
          input.direction
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to list GitHub repositories"
    );
  }
}

/* =========================================================
   GET REPOSITORY
========================================================= */

async function getRepository(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    const {
      owner,
      repository
    } =
      requireRepository(
        input.owner,
        input.repository
      );

    return await githubService
      .getRepository({
        userId,

        connectionId,

        owner,

        repository
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to get GitHub repository"
    );
  }
}

/* =========================================================
   LIST BRANCHES
========================================================= */

async function listBranches(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    const {
      owner,
      repository
    } =
      requireRepository(
        input.owner,
        input.repository
      );

    return await githubService
      .listBranches({
        userId,

        connectionId,

        owner,

        repository,

        page:
          input.page,

        perPage:
          input.perPage
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to list GitHub branches"
    );
  }
}

/* =========================================================
   LIST CONTENTS
========================================================= */

async function listContents(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    const {
      owner,
      repository
    } =
      requireRepository(
        input.owner,
        input.repository
      );

    return await githubService
      .getRepositoryContents({
        userId,

        connectionId,

        owner,

        repository,

        path:
          input.path || "",

        ref:
          input.ref || null
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to list GitHub repository contents"
    );
  }
}

/* =========================================================
   GET FILE
========================================================= */

async function getFile(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    const {
      owner,
      repository
    } =
      requireRepository(
        input.owner,
        input.repository
      );

    if (
      !input.path ||
      typeof input.path !==
        "string"
    ) {
      throw new GithubAgentError(
        "Repository file path required",
        "FILE_PATH_REQUIRED"
      );
    }

    return await githubService
      .getFileContent({
        userId,

        connectionId,

        owner,

        repository,

        path:
          input.path,

        ref:
          input.ref || null
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to get GitHub file"
    );
  }
}

/* =========================================================
   DEFAULT BRANCH
========================================================= */

async function getDefaultBranch(
  input = {}
) {
  try {
    const userId =
      requireUserId(
        input.userId
      );

    const connectionId =
      requireConnectionId(
        input.connectionId
      );

    const {
      owner,
      repository
    } =
      requireRepository(
        input.owner,
        input.repository
      );

    return await githubService
      .getDefaultBranch({
        userId,

        connectionId,

        owner,

        repository
      });

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to get GitHub default branch"
    );
  }
}

/* =========================================================
   REPOSITORY ANALYSIS
========================================================= */

/**
 * The analyzer receives repository data already fetched
 * through githubService.
 *
 * This keeps responsibilities separated:
 *
 * GitHub Service
 * → GitHub API
 *
 * GitHub Agent
 * → orchestration
 *
 * GitHub Analyzer
 * → deterministic analysis
 *
 * AI Provider
 * → not involved
 */

async function analyzeRepository(
  input = {}
) {
  try {
    const files =
      Array.isArray(
        input.files
      )
        ? input.files
        : [];

    const contents =
      input.contents &&
      typeof input.contents ===
        "object"
        ? input.contents
        : {};

    if (
      files.length ===
      0
    ) {
      throw new GithubAgentError(
        "Repository files required for analysis",
        "ANALYSIS_FILES_REQUIRED"
      );
    }

    const result =
      await githubAnalyzer
        .analyzeRepository({
          files,

          contents,

          repository:
            input.repository ||
            {}
        });

    return {
      success:
        true,

      agent:
        AGENT_NAME,

      version:
        AGENT_VERSION,

      action:
        "repository-analysis",

      ...result
    };

  } catch (error) {
    throw normalizeError(
      error,
      "GitHub repository analysis failed"
    );
  }
}

/* =========================================================
   DEPLOYMENT READINESS
========================================================= */

async function checkDeploymentReadiness(
  input = {}
) {
  try {
    const result =
      await analyzeRepository(
        input
      );

    const readiness =
      result
        ?.analysis
        ?.deploymentReadiness ||
      {};

    return {
      success:
        true,

      agent:
        AGENT_NAME,

      version:
        AGENT_VERSION,

      action:
        "deployment-readiness",

      ready:
        Boolean(
          readiness.ready
        ),

      status:
        readiness.status ||
        "unknown",

      errors:
        Array.isArray(
          readiness.errors
        )
          ? readiness.errors
          : [],

      warnings:
        Array.isArray(
          readiness.warnings
        )
          ? readiness.warnings
          : [],

      analysis:
        result.analysis
    };

  } catch (error) {
    throw normalizeError(
      error,
      "Failed to determine deployment readiness"
    );
  }
}

/* =========================================================
   HEALTH
========================================================= */

function health() {
  let analyzerHealth =
    null;

  try {
    analyzerHealth =
      githubAnalyzer.health();
  } catch (error) {
    analyzerHealth = {
      success:
        false,

      status:
        "unhealthy",

      message:
        error.message
    };
  }

  return {
    success:
      Boolean(
        analyzerHealth?.success
      ),

    agent:
      AGENT_NAME,

    version:
      AGENT_VERSION,

    status:
      analyzerHealth?.success
        ? "healthy"
        : "degraded",

    analyzer:
      analyzerHealth
  };
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeError(
  error,
  fallbackMessage
) {
  if (
    error instanceof
    GithubAgentError
  ) {
    return error;
  }

  const normalized =
    new GithubAgentError(
      error?.message ||
        fallbackMessage,

      error?.code ||
        "GITHUB_OPERATION_FAILED",

      {
        service:
          error?.name ||
          "GithubServiceError",

        status:
          error?.status ||
          error?.statusCode ||
          null,

        details:
          error?.details ||
          null
      }
    );

  return normalized;
}

/* =========================================================
   MAIN DISPATCHER
========================================================= */

async function githubAgent(
  input = {}
) {
  const action =
    String(
      input.action ||
        ""
    )
      .trim()
      .toLowerCase();

  if (
    !action
  ) {
    throw new GithubAgentError(
      "GitHub agent action required",
      "ACTION_REQUIRED",
      {
        supportedActions:
          SUPPORTED_ACTIONS
      }
    );
  }

  switch (action) {

    /* =====================================
       CONNECTION
    ===================================== */

    case "connection-create":
      return createConnection(
        input
      );

    case "connection-list":
      return listConnections(
        input
      );

    case "connection-get":
      return getConnection(
        input
      );

    case "connection-validate":
      return validateConnection(
        input
      );

    case "connection-disconnect":
      return disconnectConnection(
        input
      );

    /* =====================================
       REPOSITORY
    ===================================== */

    case "repositories-list":
      return listRepositories(
        input
      );

    case "repository-get":
      return getRepository(
        input
      );

    /* =====================================
       BRANCHES
    ===================================== */

    case "branches-list":
      return listBranches(
        input
      );

    /* =====================================
       CONTENTS
    ===================================== */

    case "contents-list":
      return listContents(
        input
      );

    case "file-get":
      return getFile(
        input
      );

    case "default-branch":
      return getDefaultBranch(
        input
      );

    /* =====================================
       ANALYZER
    ===================================== */

    case "repository-analysis":
    case "analyze-repository":
      return analyzeRepository(
        input
      );

    case "deployment-readiness":
      return checkDeploymentReadiness(
        input
      );

    /* =====================================
       HEALTH
    ===================================== */

    case "health":
      return health();

    default:
      throw new GithubAgentError(
        `Unsupported GitHub agent action: ${action}`,
        "UNSUPPORTED_ACTION",
        {
          action,

          supportedActions:
            SUPPORTED_ACTIONS
        }
      );
  }
}

/* =========================================================
   CONVENIENCE METHODS
========================================================= */

githubAgent.createConnection =
  createConnection;

githubAgent.listConnections =
  listConnections;

githubAgent.getConnection =
  getConnection;

githubAgent.validateConnection =
  validateConnection;

githubAgent.disconnectConnection =
  disconnectConnection;

githubAgent.listRepositories =
  listRepositories;

githubAgent.getRepository =
  getRepository;

githubAgent.listBranches =
  listBranches;

githubAgent.listContents =
  listContents;

githubAgent.getFile =
  getFile;

githubAgent.getDefaultBranch =
  getDefaultBranch;

githubAgent.analyzeRepository =
  analyzeRepository;

githubAgent.checkDeploymentReadiness =
  checkDeploymentReadiness;

githubAgent.health =
  health;

/* =========================================================
   METADATA
========================================================= */

githubAgent.agentName =
  AGENT_NAME;

githubAgent.version =
  AGENT_VERSION;

githubAgent.supportedActions =
  SUPPORTED_ACTIONS;

/* =========================================================
   EXPORT
========================================================= */

module.exports =
  githubAgent;
