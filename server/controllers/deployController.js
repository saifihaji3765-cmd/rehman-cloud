"use strict";

const crypto = require("crypto");

const deployAgent = require("../agents/deployAgent");
const monitoringAgent = require("../agents/monitoringAgent");
const scalingAgent = require("../agents/scalingAgent");
const formatResponse = require("../utils/formatResponse");

const DeploymentLog = require("../models/deploymentLogModel");
const deploymentLogService = require("../services/deploymentLogService");

/* =========================================================
HELPERS
========================================================= */

function getAuthenticatedUserId(req) {
const value =
req.user?.id ||
req.user?._id ||
req.auth?.userId;

return value ? String(value) : null;
}

function getDeploymentId(req) {
return String(req.params?.deploymentId || "").trim();
}

async function findOwnedDeployment(deploymentId, userId) {
if (!deploymentId || !userId) {
return null;
}

return DeploymentLog.findOne({
deploymentId,
userId,
})
.sort({ createdAt: -1 })
.lean();
}

function sendError(res, statusCode, message, error = null) {
return res.status(statusCode).json(
formatResponse({
success: false,
message,
...(error ? { error } : {}),
})
);
}

/* =========================================================
DEPLOY PROJECT
========================================================= */

async function deployProject(req, res) {
let deploymentId = null;
let userId = null;
let logCreated = false;

try {
const projectData = req.body || {};

userId = getAuthenticatedUserId(req);

if (!userId) {
  return sendError(
    res,
    401,
    "Authentication required"
  );
}

const projectName =
  typeof projectData.projectName === "string"
    ? projectData.projectName.trim()
    : "";

const projectId =
  projectData.projectId ||
  projectData.project?._id ||
  projectData.project?.id;

if (!projectName) {
  return sendError(
    res,
    400,
    "Project name required"
  );
}

if (!projectId) {
  return sendError(
    res,
    400,
    "Project ID required for deployment tracking"
  );
}

/*
 * Use one stable ID for the deployment agent and
 * its corresponding deployment-log record.
 */
deploymentId =
  String(projectData.deploymentId || "").trim() ||
  String(projectData.requestId || "").trim() ||
  String(projectData.workflowId || "").trim() ||
  crypto.randomUUID();

/*
 * Prevent another user from reusing an existing
 * deployment ID.
 */
const existingDeployment = await DeploymentLog.findOne({
  deploymentId,
})
  .select("userId")
  .lean();

if (
  existingDeployment &&
  String(existingDeployment.userId) !== userId
) {
  return sendError(
    res,
    409,
    "Deployment ID is already in use"
  );
}

if (existingDeployment) {
  return sendError(
    res,
    409,
    "This deployment ID already exists. Use a new deployment request."
  );
}

/*
 * Create a real database record before starting
 * the deployment process.
 */
await deploymentLogService.createDeploymentLog({
  deploymentId,
  projectId: String(projectId),
  userId,
  projectName,
  workflowId: projectData.workflowId || undefined,
  requestId: projectData.requestId || undefined,
  environmentName:
    projectData.environmentName ||
    projectData.environment ||
    projectData.deployEnvironment ||
    "production",
  framework: projectData.framework || undefined,
  branch: projectData.branch || undefined,
  commitSha: projectData.commitSha || undefined,
  status: "pending",
  progress: 0,
  currentStage: "initializing",
  currentAgent: "deployAgent",
  level: "info",
  type: "system",
  source: "deployController",
  event: "deployment.created",
  message: "Deployment request accepted",
});

logCreated = true;

await deploymentLogService.appendEvent({
  deploymentId,
  level: "info",
  type: "system",
  source: "deployController",
  event: "deployment.started",
  stage: "deployment",
  agent: "deployAgent",
  status: "running",
  progress: 1,
  message: "Deployment process started",
});

const result = await deployAgent({
  ...projectData,
  projectId: String(projectId),
  projectName,
  deploymentId,
  userId,
});

if (!result || result.success !== true) {
  const failureMessage =
    result?.message || "Deployment failed";

  await deploymentLogService.appendEvent({
    deploymentId,
    level: "error",
    type: "system",
    source: "deployController",
    event: "deployment.failed",
    stage: result?.stage || "deployment",
    agent: "deployAgent",
    status: "failed",
    message: failureMessage,
    details: result?.error
      ? { error: String(result.error) }
      : undefined,
  });

  return res.status(500).json(
    formatResponse({
      success: false,
      message: failureMessage,
      error: result?.error || null,
      data: result?.deployment || {
        deploymentId,
        projectId: String(projectId),
        projectName,
        status: "failed",
      },
    })
  );
}

await deploymentLogService.appendEvent({
  deploymentId,
  level: "success",
  type: "system",
  source: "deployController",
  event: "deployment.completed",
  stage: "completed",
  agent: "deployAgent",
  status: "success",
  progress: 100,
  message: "Deployment completed successfully",
});

return res.status(200).json(
  formatResponse({
    success: true,
    message: "Deployment successful",
    data: {
      ...result.deployment,
      deploymentId,
      projectId: String(projectId),
      projectName,
      status: "success",
    },
  })
);

} catch (error) {
/*
* Preserve the original deployment error even if
* recording the failure event also encounters an error.
*/
if (logCreated && deploymentId && userId) {
try {
await deploymentLogService.appendEvent({
deploymentId,
level: "error",
type: "system",
source: "deployController",
event: "deployment.exception",
stage: "deployment",
agent: "deployAgent",
status: "failed",
message: "Deployment failed due to a server error",
details: {
error: error.message || "Unknown error",
},
});
} catch (loggingError) {
console.error(
"[deployController] Could not record deployment failure:",
loggingError.message
);
}
}

console.error(
  "[deployController] Deployment request failed:",
  error.message
);

return sendError(
  res,
  500,
  "Deployment failed",
  error.message || "Unknown server error"
);

}
}

/* =========================================================
DEPLOYMENT STATUS
========================================================= */

async function getDeploymentStatus(req, res) {
try {
const deploymentId = getDeploymentId(req);
const userId = getAuthenticatedUserId(req);

if (!userId) {
  return sendError(
    res,
    401,
    "Authentication required"
  );
}

if (!deploymentId) {
  return sendError(
    res,
    400,
    "Deployment ID required"
  );
}

const deployment = await findOwnedDeployment(
  deploymentId,
  userId
);

if (!deployment) {
  return sendError(
    res,
    404,
    "Deployment not found"
  );
}

return res.status(200).json(
  formatResponse({
    success: true,
    data: {
      deploymentId: deployment.deploymentId,
      projectId: deployment.projectId,
      projectName: deployment.projectName || null,
      status: deployment.status,
      progress: deployment.progress,
      currentStage: deployment.currentStage || null,
      currentAgent: deployment.currentAgent || null,
      message: deployment.message || null,
      startedAt: deployment.startedAt || null,
      completedAt: deployment.completedAt || null,
      createdAt: deployment.createdAt || null,
      updatedAt: deployment.updatedAt || null,
      errorCount: deployment.errorCount || 0,
      warningCount: deployment.warningCount || 0,
    },
  })
);

} catch (error) {
console.error(
"[deployController] Status lookup failed:",
error.message
);

return sendError(
  res,
  500,
  "Unable to retrieve deployment status",
  error.message
);

}
}

/* =========================================================
DEPLOYMENT LOGS
========================================================= */

async function getDeploymentLogs(req, res) {
try {
const deploymentId = getDeploymentId(req);
const userId = getAuthenticatedUserId(req);

if (!userId) {
  return sendError(
    res,
    401,
    "Authentication required"
  );
}

if (!deploymentId) {
  return sendError(
    res,
    400,
    "Deployment ID required"
  );
}

const ownedDeployment = await findOwnedDeployment(
  deploymentId,
  userId
);

if (!ownedDeployment) {
  return sendError(
    res,
    404,
    "Deployment not found"
  );
}

const requestedLimit = Number(req.query?.limit);
const limit =
  Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 500)
    : 100;

const sort =
  req.query?.sort === "asc" ? "asc" : "desc";

const logs =
  await deploymentLogService.getDeploymentLog(
    deploymentId,
    {
      limit,
      sort,
    }
  );

return res.status(200).json(
  formatResponse({
    success: true,
    logs,
  })
);

} catch (error) {
console.error(
"[deployController] Log retrieval failed:",
error.message
);

return sendError(
  res,
  500,
  "Unable to retrieve deployment logs",
  error.message
);

}
}

/* =========================================================
MONITORING
========================================================= */

async function getDeploymentMonitoring(req, res) {
try {
const deploymentId = getDeploymentId(req);
const userId = getAuthenticatedUserId(req);

if (!userId) {
  return sendError(
    res,
    401,
    "Authentication required"
  );
}

if (!deploymentId) {
  return sendError(
    res,
    400,
    "Deployment ID required"
  );
}

const deployment = await findOwnedDeployment(
  deploymentId,
  userId
);

if (!deployment) {
  return sendError(
    res,
    404,
    "Deployment not found"
  );
}

const monitoring = await monitoringAgent({
  deploymentId,
  projectId: deployment.projectId,
  userId,
});

return res.status(200).json(
  formatResponse({
    success: true,
    data: monitoring,
  })
);

} catch (error) {
console.error(
"[deployController] Monitoring request failed:",
error.message
);

return sendError(
  res,
  500,
  "Unable to retrieve deployment monitoring",
  error.message
);

}
}

/* =========================================================
SCALING
========================================================= */

async function triggerScaling(req, res) {
try {
const deploymentId = getDeploymentId(req);
const userId = getAuthenticatedUserId(req);

if (!userId) {
  return sendError(
    res,
    401,
    "Authentication required"
  );
}

if (!deploymentId) {
  return sendError(
    res,
    400,
    "Deployment ID required"
  );
}

const deployment = await findOwnedDeployment(
  deploymentId,
  userId
);

if (!deployment) {
  return sendError(
    res,
    404,
    "Deployment not found"
  );
}

if (deployment.status !== "success") {
  return sendError(
    res,
    409,
    "Only successfully deployed projects can be scaled"
  );
}

const scaling = await scalingAgent({
  deploymentId,
  projectId: deployment.projectId,
  userId,
});

return res.status(200).json(
  formatResponse({
    success: true,
    data: scaling,
  })
);

} catch (error) {
console.error(
"[deployController] Scaling request failed:",
error.message
);

return sendError(
  res,
  500,
  "Unable to scale deployment",
  error.message
);

}
}

/* =========================================================
EXPORTS
========================================================= */

module.exports = {
deployProject,
getDeploymentStatus,
getDeploymentLogs,
getDeploymentMonitoring,
triggerScaling,
};
