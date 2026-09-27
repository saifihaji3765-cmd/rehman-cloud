"use strict";

/*
=========================================================
 ZYRION OS — GITHUB CONTROLLER
 Version: 2.0.0

 Responsibility:
 - HTTP request/response handling
 - Authenticated user extraction
 - Input validation
 - GitHub Agent orchestration
 - GitHub Deployment Agent orchestration
 - Safe response formatting

 IMPORTANT:
 - Controller does NOT call GitHub API directly
 - Controller does NOT decrypt GitHub tokens
 - Controller does NOT call AI providers
 - Controller does NOT execute Docker
 - Controller does NOT execute AWS
 - Business logic stays inside Agents/Services
=========================================================
*/

const mongoose = require("mongoose");

const githubAgent =
  require("../agents/githubAgent");

const githubDeploymentAgent =
  require("../agents/githubDeploymentAgent");


/* =========================================================
   HELPERS
========================================================= */

function getUserId(req) {
  return (
    req?.user?.id ||
    req?.user?._id ||
    null
  );
}


function isValidObjectId(id) {
  return Boolean(
    id &&
    mongoose.Types.ObjectId.isValid(id)
  );
}


function cleanString(
  value,
  maxLength = 500
) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}


function getConnectionId(req) {
  return cleanString(
    req.params?.connectionId ||
    req.params?.id ||
    req.body?.connectionId ||
    req.query?.connectionId ||
    "",
    200
  );
}


function getProjectId(req) {
  return cleanString(
    req.params?.projectId ||
    req.body?.projectId ||
    req.query?.projectId ||
    "",
    100
  );
}


function sendSuccess(
  res,
  data = {},
  status = 200
) {
  return res.status(status).json({
    success: true,
    ...data
  });
}


function sendError(
  res,
  error,
  fallbackMessage = "GitHub request failed"
) {
  const status =
    Number.isInteger(error?.statusCode)
      ? error.statusCode
      : Number.isInteger(error?.status)
        ? error.status
        : 500;

  const safeStatus =
    status >= 400 &&
    status <= 599
      ? status
      : 500;

  const message =
    error?.message ||
    fallbackMessage;

  return res.status(safeStatus).json({
    success: false,
    message,
    errorCode:
      error?.code ||
      "GITHUB_CONTROLLER_ERROR"
  });
}


function requireAuthenticatedUser(
  req,
  res
) {
  const userId =
    getUserId(req);

  if (!userId) {
    sendError(
      res,
      {
        statusCode: 401,
        message:
          "Authentication required",
        code:
          "AUTH_REQUIRED"
      }
    );

    return null;
  }

  return userId;
}


function getRepositoryInput(
  req
) {
  return {
    owner:
      cleanString(
        req.params?.owner ||
        req.query?.owner ||
        req.body?.owner,
        100
      ),

    repository:
      cleanString(
        req.params?.repository ||
        req.params?.repo ||
        req.query?.repository ||
        req.query?.repo ||
        req.body?.repository,
        200
      )
  };
}


/* =========================================================
   CREATE CONNECTION
========================================================= */

async function createConnection(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      projectId,
      connectionType,
      accessToken,
      refreshToken,
      githubUser,
      scopes,
      expiresAt,
      installation,
      metadata,
      permissions,
      defaultRepository
    } = req.body || {};

    if (
      projectId &&
      !isValidObjectId(projectId)
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Invalid projectId",
          code:
            "INVALID_PROJECT_ID"
        }
      );
    }

    if (!accessToken) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "GitHub access token is required",
          code:
            "GITHUB_ACCESS_TOKEN_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.createConnection({
        userId,

        projectId:
          projectId || null,

        connectionType:
          connectionType ||
          "oauth",

        accessToken,

        refreshToken:
          refreshToken || null,

        githubUser:
          githubUser || {},

        scopes:
          Array.isArray(scopes)
            ? scopes
            : [],

        expiresAt:
          expiresAt || null,

        installation:
          installation || {},

        metadata:
          metadata || {},

        permissions:
          permissions || {},

        defaultRepository:
          defaultRepository || {}
      });

    return sendSuccess(
      res,
      {
        connection:
          result?.connection ||
          result
      },
      201
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to create GitHub connection"
    );
  }
}


/* =========================================================
   LIST CONNECTIONS
========================================================= */

async function listConnections(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const projectId =
      getProjectId(req);

    if (
      projectId &&
      !isValidObjectId(projectId)
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Invalid projectId",
          code:
            "INVALID_PROJECT_ID"
        }
      );
    }

    const result =
      await githubAgent.listConnections({
        userId,

        projectId:
          projectId || null
      });

    return sendSuccess(
      res,
      {
        connections:
          result?.connections ||
          result ||
          []
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to list GitHub connections"
    );
  }
}


/* =========================================================
   GET CONNECTION
========================================================= */

async function getConnection(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.getConnection({
        userId,
        connectionId
      });

    return sendSuccess(
      res,
      {
        connection:
          result?.connection ||
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to get GitHub connection"
    );
  }
}


/* =========================================================
   VALIDATE CONNECTION
========================================================= */

async function validateConnection(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.validateConnection({
        userId,
        connectionId
      });

    return sendSuccess(
      res,
      {
        validation:
          result?.validation ||
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to validate GitHub connection"
    );
  }
}


/* =========================================================
   DISCONNECT
========================================================= */

async function disconnectConnection(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.disconnectConnection({
        userId,
        connectionId
      });

    return sendSuccess(
      res,
      {
        disconnected: true,
        result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to disconnect GitHub"
    );
  }
}


/* =========================================================
   LIST REPOSITORIES
========================================================= */

async function listRepositories(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.listRepositories({
        userId,

        connectionId,

        page:
          Math.max(
            parseInt(
              req.query.page,
              10
            ) || 1,
            1
          ),

        perPage:
          Math.min(
            Math.max(
              parseInt(
                req.query.perPage,
                10
              ) || 30,
              1
            ),
            100
          ),

        visibility:
          cleanString(
            req.query.visibility,
            50
          ) || undefined,

        affiliation:
          cleanString(
            req.query.affiliation,
            200
          ) || undefined,

        sort:
          cleanString(
            req.query.sort,
            50
          ) || undefined,

        direction:
          cleanString(
            req.query.direction,
            10
          ) || undefined
      });

    return sendSuccess(
      res,
      {
        repositories:
          result?.repositories ||
          result ||
          [],

        pagination:
          result?.pagination ||
          null
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to list GitHub repositories"
    );
  }
}


/* =========================================================
   GET REPOSITORY
========================================================= */

async function getRepository(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    const {
      owner,
      repository
    } =
      getRepositoryInput(req);

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    if (!owner || !repository) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository owner and name are required",
          code:
            "REPOSITORY_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.getRepository({
        userId,

        connectionId,

        owner,

        repository
      });

    return sendSuccess(
      res,
      {
        repository:
          result?.repository ||
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to get GitHub repository"
    );
  }
}


/* =========================================================
   LIST BRANCHES
========================================================= */

async function listBranches(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    const {
      owner,
      repository
    } =
      getRepositoryInput(req);

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    if (!owner || !repository) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository owner and name are required",
          code:
            "REPOSITORY_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.listBranches({
        userId,

        connectionId,

        owner,

        repository,

        page:
          Math.max(
            parseInt(
              req.query.page,
              10
            ) || 1,
            1
          ),

        perPage:
          Math.min(
            Math.max(
              parseInt(
                req.query.perPage,
                10
              ) || 30,
              1
            ),
            100
          )
      });

    return sendSuccess(
      res,
      {
        branches:
          result?.branches ||
          result ||
          [],

        pagination:
          result?.pagination ||
          null
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to list GitHub branches"
    );
  }
}


/* =========================================================
   LIST CONTENTS
========================================================= */

async function listContents(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    const {
      owner,
      repository
    } =
      getRepositoryInput(req);

    const path =
      cleanString(
        req.query.path ||
        req.params.path ||
        "",
        1000
      );

    const ref =
      cleanString(
        req.query.ref ||
        req.query.branch ||
        "",
        200
      );

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    if (!owner || !repository) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository owner and name are required",
          code:
            "REPOSITORY_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.listContents({
        userId,

        connectionId,

        owner,

        repository,

        path,

        ref:
          ref || undefined
      });

    return sendSuccess(
      res,
      {
        contents:
          result?.contents ||
          result ||
          []
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to list GitHub repository contents"
    );
  }
}


/* =========================================================
   GET FILE
========================================================= */

async function getFile(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    const {
      owner,
      repository
    } =
      getRepositoryInput(req);

    const path =
      cleanString(
        req.query.path ||
        req.params[0] ||
        req.params.path ||
        "",
        2000
      );

    const ref =
      cleanString(
        req.query.ref ||
        req.query.branch ||
        "",
        200
      );

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    if (!owner || !repository || !path) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository owner, name and file path are required",
          code:
            "FILE_PATH_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.getFile({
        userId,

        connectionId,

        owner,

        repository,

        path,

        ref:
          ref || undefined
      });

    return sendSuccess(
      res,
      {
        file:
          result?.file ||
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to get GitHub file"
    );
  }
}


/* =========================================================
   DEFAULT BRANCH
========================================================= */

async function getDefaultBranch(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const connectionId =
      getConnectionId(req);

    const {
      owner,
      repository
    } =
      getRepositoryInput(req);

    if (!connectionId) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Connection ID is required",
          code:
            "CONNECTION_ID_REQUIRED"
        }
      );
    }

    if (!owner || !repository) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository owner and name are required",
          code:
            "REPOSITORY_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.getDefaultBranch({
        userId,

        connectionId,

        owner,

        repository
      });

    return sendSuccess(
      res,
      {
        branch:
          result?.branch ||
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to get default branch"
    );
  }
}


/* =========================================================
   REPOSITORY ANALYSIS
========================================================= */

async function analyzeRepository(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      files,
      contents,
      repository
    } =
      req.body || {};

    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository files are required for analysis",
          code:
            "ANALYSIS_FILES_REQUIRED"
        }
      );
    }

    const result =
      await githubAgent.analyzeRepository({
        userId,

        files,

        contents:
          contents || {},

        repository:
          repository || {}
      });

    return sendSuccess(
      res,
      {
        analysis:
          result?.analysis ||
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "GitHub repository analysis failed"
    );
  }
}


/* =========================================================
   DEPLOYMENT CONTRACT
========================================================= */

/*
POST /api/github/deployment-contract

Purpose:
Convert GitHub Analyzer output into
a normalized deployment contract.

This controller only orchestrates.
Actual logic stays inside
githubDeploymentAgent.
*/

async function createDeploymentContract(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      analysis,
      files,
      repository
    } =
      req.body || {};

    if (
      !analysis ||
      typeof analysis !==
        "object"
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository analysis is required",
          code:
            "ANALYSIS_REQUIRED"
        }
      );
    }

    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository files are required",
          code:
            "FILES_REQUIRED"
        }
      );
    }

    const result =
      await githubDeploymentAgent
        .createDeploymentContract({
          userId,

          analysis,

          files,

          repository:
            repository || {}
        });

    return sendSuccess(
      res,
      {
        deploymentContract:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to create GitHub deployment contract"
    );
  }
}


/* =========================================================
   DEPLOYMENT READINESS
========================================================= */

/*
POST /api/github/deployment-readiness
*/

async function deploymentReadiness(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      analysis,
      files
    } =
      req.body || {};

    if (
      !analysis ||
      typeof analysis !==
        "object"
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository analysis is required",
          code:
            "ANALYSIS_REQUIRED"
        }
      );
    }

    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository files are required",
          code:
            "FILES_REQUIRED"
        }
      );
    }

    const result =
      await githubDeploymentAgent
        .checkDeploymentReadiness({
          userId,

          analysis,

          files
        });

    return sendSuccess(
      res,
      {
        readiness:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to determine deployment readiness"
    );
  }
}


/* =========================================================
   PREPARE DEPLOYMENT
========================================================= */

/*
POST /api/github/prepare-deployment

This creates the complete deployment
package for the next agents.

GitHub
  ↓
Analyzer
  ↓
Deployment Agent
  ↓
Docker Handoff
  ↓
AWS Handoff
*/

async function prepareDeployment(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      analysis,
      files,
      repository
    } =
      req.body || {};

    if (
      !analysis ||
      typeof analysis !==
        "object"
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository analysis is required",
          code:
            "ANALYSIS_REQUIRED"
        }
      );
    }

    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Repository files are required",
          code:
            "FILES_REQUIRED"
        }
      );
    }

    const result =
      await githubDeploymentAgent
        .prepareDeployment({
          userId,

          analysis,

          files,

          repository:
            repository || {}
        });

    return sendSuccess(
      res,
      {
        deployment:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to prepare GitHub deployment"
    );
  }
}


/* =========================================================
   DOCKER HANDOFF
========================================================= */

/*
POST /api/github/docker-handoff
*/

async function dockerHandoff(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      contract
    } =
      req.body || {};

    if (
      !contract ||
      typeof contract !==
        "object"
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Deployment contract is required",
          code:
            "DEPLOYMENT_CONTRACT_REQUIRED"
        }
      );
    }

    const result =
      await githubDeploymentAgent
        .prepareDockerHandoff({
          userId,

          contract
        });

    return sendSuccess(
      res,
      {
        dockerHandoff:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to prepare Docker handoff"
    );
  }
}


/* =========================================================
   AWS HANDOFF
========================================================= */

/*
POST /api/github/aws-handoff
*/

async function awsHandoff(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      contract
    } =
      req.body || {};

    if (
      !contract ||
      typeof contract !==
        "object"
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Deployment contract is required",
          code:
            "DEPLOYMENT_CONTRACT_REQUIRED"
        }
      );
    }

    const result =
      await githubDeploymentAgent
        .prepareAwsHandoff({
          userId,

          contract
        });

    return sendSuccess(
      res,
      {
        awsHandoff:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to prepare AWS handoff"
    );
  }
}


/* =========================================================
   SANITIZE DEPLOYMENT CONTRACT
========================================================= */

/*
POST /api/github/sanitize-contract

Useful before passing deployment
information between agents.
*/

async function sanitizeDeploymentContract(
  req,
  res
) {
  try {
    const userId =
      requireAuthenticatedUser(
        req,
        res
      );

    if (!userId) {
      return;
    }

    const {
      contract
    } =
      req.body || {};

    if (
      !contract ||
      typeof contract !==
        "object"
    ) {
      return sendError(
        res,
        {
          statusCode: 400,
          message:
            "Deployment contract is required",
          code:
            "DEPLOYMENT_CONTRACT_REQUIRED"
        }
      );
    }

    const result =
      await githubDeploymentAgent
        .sanitizeContract({
          userId,

          contract
        });

    return sendSuccess(
      res,
      {
        contract:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to sanitize deployment contract"
    );
  }
}


/* =========================================================
   GITHUB DEPLOYMENT AGENT HEALTH
========================================================= */

async function deploymentHealth(
  req,
  res
) {
  try {
    const result =
      await githubDeploymentAgent
        .health();

    return sendSuccess(
      res,
      {
        githubDeployment:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "GitHub deployment agent health check failed"
    );
  }
}


/* =========================================================
   GITHUB CONTROLLER HEALTH
========================================================= */

async function health(
  req,
  res
) {
  try {
    const result =
      await githubAgent.health();

    return sendSuccess(
      res,
      {
        github:
          result
      }
    );

  } catch (error) {
    return sendError(
      res,
      error,
      "GitHub service health check failed"
    );
  }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  /* Connections */
  createConnection,
  listConnections,
  getConnection,
  validateConnection,
  disconnectConnection,

  /* Repository */
  listRepositories,
  getRepository,
  listBranches,
  listContents,
  getFile,
  getDefaultBranch,

  /* Analyzer */
  analyzeRepository,

  /* Deployment */
  createDeploymentContract,
  deploymentReadiness,
  prepareDeployment,
  dockerHandoff,
  awsHandoff,
  sanitizeDeploymentContract,

  /* Health */
  health,
  deploymentHealth
};
