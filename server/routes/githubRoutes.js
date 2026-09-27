"use strict";

/*
=========================================================
 ZYRION OS — GITHUB ROUTES
 Version: 2.0.0

 GitHub System:
 - Connection management
 - Repository browser
 - Repository details
 - Branch management
 - File/content browsing
 - Default branch detection
 - Repository analysis
 - Deployment contract
 - Deployment readiness
 - Docker handoff
 - AWS handoff
 - Deployment preparation
 - Contract sanitization

 IMPORTANT:
 - Authentication required for all private GitHub operations
 - GitHub OAuth login remains under /api/auth/github
 - These routes are for connected GitHub workspace operations
 - Routes do NOT call GitHub API directly
 - Routes do NOT call Docker directly
 - Routes do NOT call AWS directly
 - Routes do NOT call AI providers
=========================================================
*/

const express =
  require("express");

const router =
  express.Router();


/* =========================================================
   CONTROLLER
========================================================= */

const {
  /* -------------------------
     CONNECTIONS
  ------------------------- */

  createConnection,
  listConnections,
  getConnection,
  validateConnection,
  disconnectConnection,

  /* -------------------------
     REPOSITORIES
  ------------------------- */

  listRepositories,
  getRepository,
  listBranches,
  listContents,
  getFile,
  getDefaultBranch,

  /* -------------------------
     ANALYZER
  ------------------------- */

  analyzeRepository,

  /* -------------------------
     DEPLOYMENT
  ------------------------- */

  createDeploymentContract,
  deploymentReadiness,
  prepareDeployment,
  dockerHandoff,
  awsHandoff,
  sanitizeDeploymentContract,

  /* -------------------------
     HEALTH
  ------------------------- */

  health,
  deploymentHealth

} = require(
  "../controllers/githubController"
);


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
  authMiddleware
} = require(
  "../middleware/authMiddleware"
);


/* =========================================================
   RATE LIMITER
========================================================= */

let apiLimiter = null;

try {
  const rateLimiter =
    require(
      "../middleware/rateLimiter"
    );

  apiLimiter =
    rateLimiter?.apiLimiter ||
    null;

} catch (error) {
  /*
   Rate limiter is optional here so an existing
   deployment is not broken if the middleware
   export is unavailable.

   Authentication remains mandatory.
  */

  apiLimiter = null;
}


/* =========================================================
   HELPER
========================================================= */

function authenticated(
  handler
) {
  if (apiLimiter) {
    return [
      authMiddleware,
      apiLimiter,
      handler
    ];
  }

  return [
    authMiddleware,
    handler
  ];
}


/* =========================================================
   PUBLIC HEALTH
========================================================= */

/*
GET /api/github/health

Public system health check.

Does NOT expose:
- GitHub tokens
- connection data
- repository data
- user information
*/

router.get(
  "/health",
  health
);


/* =========================================================
   DEPLOYMENT AGENT HEALTH
========================================================= */

/*
GET /api/github/deployment-health

Authenticated deployment-agent health check.
*/

router.get(
  "/deployment-health",
  ...authenticated(
    deploymentHealth
  )
);


/* =========================================================
   CONNECTIONS
========================================================= */

/*
POST /api/github/connections

Create a GitHub connection.

Body may contain:

{
  "projectId": "...",
  "connectionType": "oauth",
  "accessToken": "...",
  "refreshToken": "...",
  "githubUser": {},
  "scopes": [],
  "expiresAt": null,
  "installation": {},
  "metadata": {},
  "permissions": {},
  "defaultRepository": {}
}
*/

router.post(
  "/connections",
  ...authenticated(
    createConnection
  )
);


/*
GET /api/github/connections

List current user's GitHub connections.

Optional:
?projectId=...
*/

router.get(
  "/connections",
  ...authenticated(
    listConnections
  )
);


/*
GET /api/github/connections/:connectionId

Get one GitHub connection.
*/

router.get(
  "/connections/:connectionId",
  ...authenticated(
    getConnection
  )
);


/*
POST /api/github/connections/:connectionId/validate

Validate GitHub connection/token.
*/

router.post(
  "/connections/:connectionId/validate",
  ...authenticated(
    validateConnection
  )
);


/*
DELETE /api/github/connections/:connectionId

Disconnect GitHub connection.
*/

router.delete(
  "/connections/:connectionId",
  ...authenticated(
    disconnectConnection
  )
);


/* =========================================================
   REPOSITORIES
========================================================= */

/*
GET /api/github/repositories

List repositories available to the connected GitHub account.

Required:
?connectionId=...

Optional:
?page=1
?perPage=30
?visibility=all
?affiliation=owner,collaborator,organization_member
?sort=updated
?direction=desc
*/

router.get(
  "/repositories",
  ...authenticated(
    listRepositories
  )
);


/*
GET /api/github/repositories/:owner/:repository

Get repository information.
*/

router.get(
  "/repositories/:owner/:repository",
  ...authenticated(
    getRepository
  )
);


/* =========================================================
   BRANCHES
========================================================= */

/*
GET /api/github/repositories/:owner/:repository/branches

List repository branches.

Optional:
?page=1
?perPage=30
*/

router.get(
  "/repositories/:owner/:repository/branches",
  ...authenticated(
    listBranches
  )
);


/* =========================================================
   DEFAULT BRANCH
========================================================= */

/*
GET /api/github/repositories/:owner/:repository/default-branch

Get repository default branch.
*/

router.get(
  "/repositories/:owner/:repository/default-branch",
  ...authenticated(
    getDefaultBranch
  )
);


/* =========================================================
   REPOSITORY CONTENTS
========================================================= */

/*
GET /api/github/repositories/:owner/:repository/contents

List repository contents.

Optional:
?path=src
?ref=main
*/

router.get(
  "/repositories/:owner/:repository/contents",
  ...authenticated(
    listContents
  )
);


/* =========================================================
   FILE
========================================================= */

/*
GET /api/github/repositories/:owner/:repository/file

Get a single file.

Required:
?path=src/index.js

Optional:
?ref=main
*/

router.get(
  "/repositories/:owner/:repository/file",
  ...authenticated(
    getFile
  )
);


/* =========================================================
   REPOSITORY ANALYZER
========================================================= */

/*
POST /api/github/analyze

Analyze repository structure.

Body:

{
  "files": [],
  "contents": {},
  "repository": {}
}

Flow:

GitHub Controller
      ↓
GitHub Agent
      ↓
GitHub Analyzer
      ↓
Analysis
*/

router.post(
  "/analyze",
  ...authenticated(
    analyzeRepository
  )
);


/* =========================================================
   DEPLOYMENT CONTRACT
========================================================= */

/*
POST /api/github/deployment-contract

Convert repository analysis into
a normalized deployment contract.

Flow:

Analyzer
   ↓
GitHub Deployment Agent
   ↓
Deployment Contract
*/

router.post(
  "/deployment-contract",
  ...authenticated(
    createDeploymentContract
  )
);


/* =========================================================
   DEPLOYMENT READINESS
========================================================= */

/*
POST /api/github/deployment-readiness

Check whether repository analysis
is ready for deployment.

Body:

{
  "analysis": {},
  "files": []
}
*/

router.post(
  "/deployment-readiness",
  ...authenticated(
    deploymentReadiness
  )
);


/* =========================================================
   PREPARE DEPLOYMENT
========================================================= */

/*
POST /api/github/prepare-deployment

Create complete deployment package.

Flow:

GitHub
   ↓
Analyzer
   ↓
Deployment Contract
   ↓
Readiness
   ↓
Docker Handoff
   ↓
AWS Handoff
*/

router.post(
  "/prepare-deployment",
  ...authenticated(
    prepareDeployment
  )
);


/* =========================================================
   DOCKER HANDOFF
========================================================= */

/*
POST /api/github/docker-handoff

Prepare the normalized contract
for Docker Agent.

IMPORTANT:

This endpoint does NOT execute Docker.

It only creates the handoff payload.
*/

router.post(
  "/docker-handoff",
  ...authenticated(
    dockerHandoff
  )
);


/* =========================================================
   AWS HANDOFF
========================================================= */

/*
POST /api/github/aws-handoff

Prepare the normalized contract
for AWS Agent.

IMPORTANT:

This endpoint does NOT execute AWS.

It only creates the handoff payload.
*/

router.post(
  "/aws-handoff",
  ...authenticated(
    awsHandoff
  )
);


/* =========================================================
   SANITIZE DEPLOYMENT CONTRACT
========================================================= */

/*
POST /api/github/sanitize-contract

Remove sensitive deployment values
before cross-agent communication.

Secrets are never returned as
plaintext deployment values.
*/

router.post(
  "/sanitize-contract",
  ...authenticated(
    sanitizeDeploymentContract
  )
);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
