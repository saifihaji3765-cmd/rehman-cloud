"use strict";

/**
 * =========================================================
 * ZyrionOS
 * GitHub Deployment Agent
 * =========================================================
 *
 * Flow:
 *
 * GitHub Analyzer
 *       ↓
 * GitHub Deployment Agent
 *       ↓
 * Deployment Service
 *       ↓
 * Docker Agent
 *       ↓
 * AWS Agent
 *
 * This agent DOES NOT directly:
 * - call GitHub
 * - call Docker
 * - call AWS
 * - call AI providers
 *
 * It creates and validates the deployment handoff.
 * =========================================================
 */

const githubDeploymentService =
  require(
    "../services/githubDeploymentService"
  );

/* =========================================================
   METADATA
========================================================= */

const AGENT_NAME =
  "github-deployment-agent";

const AGENT_VERSION =
  "1.0.0";

const SUPPORTED_ACTIONS = [
  "deployment-contract",
  "deployment-readiness",
  "prepare-deployment",
  "docker-handoff",
  "aws-handoff",
  "sanitize-contract",
  "health"
];

/* =========================================================
   ERROR
========================================================= */

class GithubDeploymentAgentError
  extends Error {
  constructor(
    message,
    code = "GITHUB_DEPLOYMENT_AGENT_ERROR",
    status = 500,
    details = null
  ) {
    super(message);

    this.name =
      "GithubDeploymentAgentError";

    this.code =
      code;

    this.status =
      status;

    this.details =
      details;
  }
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeError(
  error
) {
  if (
    error instanceof
    GithubDeploymentAgentError
  ) {
    return error;
  }

  return new GithubDeploymentAgentError(
    error?.message ||
      "GitHub deployment agent operation failed",

    error?.code ||
      "GITHUB_DEPLOYMENT_AGENT_ERROR",

    error?.status ||
      error?.statusCode ||
      500,

    error?.details ||
      null
  );
}

function requireObject(
  value,
  name
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    throw new GithubDeploymentAgentError(
      `${name} is required`,
      `${name
        .toUpperCase()
        .replace(
          /[^A-Z0-9]+/g,
          "_"
        )}_REQUIRED`,
      400
    );
  }
}

/* =========================================================
   DEPLOYMENT CONTRACT
========================================================= */

async function createDeploymentContract(
  input = {}
) {
  try {
    requireObject(
      input,
      "input"
    );

    requireObject(
      input.analysis,
      "analysis"
    );

    if (
      !Array.isArray(
        input.files
      ) ||
      input.files.length ===
        0
    ) {
      throw new GithubDeploymentAgentError(
        "Repository files are required",
        "FILES_REQUIRED",
        400
      );
    }

    return githubDeploymentService
      .buildDeploymentContract({
        analysis:
          input.analysis,

        repository:
          input.repository ||
          {},

        files:
          input.files
      });

  } catch (error) {
    throw normalizeError(
      error
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
    requireObject(
      input,
      "input"
    );

    requireObject(
      input.analysis,
      "analysis"
    );

    if (
      !Array.isArray(
        input.files
      ) ||
      input.files.length ===
        0
    ) {
      throw new GithubDeploymentAgentError(
        "Repository files are required",
        "FILES_REQUIRED",
        400
      );
    }

    return githubDeploymentService
      .checkDeploymentReadiness({
        analysis:
          input.analysis,

        files:
          input.files
      });

  } catch (error) {
    throw normalizeError(
      error
    );
  }
}

/* =========================================================
   PREPARE DEPLOYMENT
========================================================= */

async function prepareDeployment(
  input = {}
) {
  try {
    requireObject(
      input,
      "input"
    );

    requireObject(
      input.analysis,
      "analysis"
    );

    if (
      !Array.isArray(
        input.files
      ) ||
      input.files.length ===
        0
    ) {
      throw new GithubDeploymentAgentError(
        "Repository files are required",
        "FILES_REQUIRED",
        400
      );
    }

    return githubDeploymentService
      .prepareDeployment({
        analysis:
          input.analysis,

        repository:
          input.repository ||
          {},

        files:
          input.files
      });

  } catch (error) {
    throw normalizeError(
      error
    );
  }
}

/* =========================================================
   DOCKER HANDOFF
========================================================= */

async function prepareDockerHandoff(
  input = {}
) {
  try {
    requireObject(
      input,
      "input"
    );

    requireObject(
      input.contract,
      "contract"
    );

    return githubDeploymentService
      .prepareDockerHandoff({
        contract:
          input.contract
      });

  } catch (error) {
    throw normalizeError(
      error
    );
  }
}

/* =========================================================
   AWS HANDOFF
========================================================= */

async function prepareAwsHandoff(
  input = {}
) {
  try {
    requireObject(
      input,
      "input"
    );

    requireObject(
      input.contract,
      "contract"
    );

    return githubDeploymentService
      .prepareAwsHandoff({
        contract:
          input.contract
      });

  } catch (error) {
    throw normalizeError(
      error
    );
  }
}

/* =========================================================
   SANITIZE
========================================================= */

async function sanitizeContract(
  input = {}
) {
  try {
    requireObject(
      input,
      "input"
    );

    requireObject(
      input.contract,
      "contract"
    );

    return githubDeploymentService
      .sanitizeDeploymentContract(
        input.contract
      );

  } catch (error) {
    throw normalizeError(
      error
    );
  }
}

/* =========================================================
   DISPATCHER
========================================================= */

async function execute(
  action,
  input = {}
) {
  const normalizedAction =
    String(
      action || ""
    )
      .trim()
      .toLowerCase();

  switch (
    normalizedAction
  ) {
    case "deployment-contract":
      return createDeploymentContract(
        input
      );

    case "deployment-readiness":
      return checkDeploymentReadiness(
        input
      );

    case "prepare-deployment":
      return prepareDeployment(
        input
      );

    case "docker-handoff":
      return prepareDockerHandoff(
        input
      );

    case "aws-handoff":
      return prepareAwsHandoff(
        input
      );

    case "sanitize-contract":
      return sanitizeContract(
        input
      );

    case "health":
      return health();

    default:
      throw new GithubDeploymentAgentError(
        `Unsupported GitHub deployment action: ${normalizedAction || "empty"}`,
        "UNSUPPORTED_ACTION",
        400
      );
  }
}

/* =========================================================
   HEALTH
========================================================= */

function health() {
  return githubDeploymentService
    .health
    ? githubDeploymentService
        .health()
    : {
        agent:
          AGENT_NAME,

        version:
          AGENT_VERSION,

        status:
          "healthy",

        timestamp:
          new Date().toISOString()
      };
}

/* =========================================================
   METADATA
========================================================= */

function metadata() {
  return {
    name:
      AGENT_NAME,

    version:
      AGENT_VERSION,

    layer:
      "agent",

    responsibilities: [
      "convert GitHub analysis into deployment contract",
      "check deployment readiness",
      "prepare Docker handoff",
      "prepare AWS handoff",
      "sanitize deployment contracts"
    ],

    supportedActions:
      SUPPORTED_ACTIONS,

    aiProvider:
      "none",

    directInfrastructureAccess:
      false
  };
}

/* =========================================================
   CONVENIENCE API
========================================================= */

const api = {
  createDeploymentContract,

  checkDeploymentReadiness,

  prepareDeployment,

  prepareDockerHandoff,

  prepareAwsHandoff,

  sanitizeContract,

  execute,

  health,

  metadata,

  AGENT_NAME,

  AGENT_VERSION,

  SUPPORTED_ACTIONS,

  GithubDeploymentAgentError
};

/* =========================================================
   EXPORT
========================================================= */

module.exports =
  api;
