"use strict";

/*
=========================================================
 ZYRION OS — GITHUB ROUTES
 Version: 1.0.0

 GitHub System:
 - Connection management
 - Repository browser
 - Repository details
 - Branch management
 - File/content browsing
 - Default branch detection

 IMPORTANT:
 - Authentication required for all private GitHub operations
 - GitHub OAuth login remains under /api/auth/github
 - These routes are for connected GitHub workspace operations
=========================================================
*/

const express = require("express");

const router =
  express.Router();


/* =========================================================
   CONTROLLER
========================================================= */

const {
  createConnection,
  listConnections,
  getConnection,
  validateConnection,
  disconnectConnection,
  listRepositories,
  getRepository,
  listBranches,
  listContents,
  getFile,
  getDefaultBranch,
  health
} = require("../controllers/githubController");


/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const {
  authMiddleware
} = require("../middleware/authMiddleware");


/* =========================================================
   HEALTH
========================================================= */

router.get(
  "/health",
  health
);


/* =========================================================
   CONNECTIONS
========================================================= */

/*
POST /api/github/connections

Create a GitHub connection.
*/

router.post(
  "/connections",
  authMiddleware,
  createConnection
);


/*
GET /api/github/connections

List current user's GitHub connections.

Optional:
?projectId=...
*/

router.get(
  "/connections",
  authMiddleware,
  listConnections
);


/*
GET /api/github/connections/:connectionId

Get one GitHub connection.
*/

router.get(
  "/connections/:connectionId",
  authMiddleware,
  getConnection
);


/*
POST /api/github/connections/:connectionId/validate

Validate GitHub connection/token.
*/

router.post(
  "/connections/:connectionId/validate",
  authMiddleware,
  validateConnection
);


/*
DELETE /api/github/connections/:connectionId

Disconnect GitHub connection.
*/

router.delete(
  "/connections/:connectionId",
  authMiddleware,
  disconnectConnection
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
  authMiddleware,
  listRepositories
);


/*
GET /api/github/repositories/:owner/:repository

Get repository information.
*/

router.get(
  "/repositories/:owner/:repository",
  authMiddleware,
  getRepository
);


/* =========================================================
   BRANCHES
========================================================= */

/*
GET /api/github/repositories/:owner/:repository/branches

List repository branches.
*/

router.get(
  "/repositories/:owner/:repository/branches",
  authMiddleware,
  listBranches
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
  authMiddleware,
  getDefaultBranch
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
  authMiddleware,
  listContents
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
  authMiddleware,
  getFile
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
