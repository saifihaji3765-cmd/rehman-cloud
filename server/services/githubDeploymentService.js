"use strict";

/**
 * =========================================================
 * ZyrionOS
 * GitHub Deployment Service
 * =========================================================
 *
 * Responsibility:
 *
 * GitHub Repository
 *        ↓
 * Repository Analysis
 *        ↓
 * Deployment Contract
 *        ↓
 * Docker Agent / AWS Agent
 *
 * IMPORTANT:
 * - No AI provider calls
 * - No direct Docker execution
 * - No direct AWS execution
 * - No secret exposure
 *
 * This service creates a normalized deployment plan.
 * =========================================================
 */

const {
  GithubAnalyzerError
} = require("./githubAnalyzer");

/* =========================================================
   CONSTANTS
========================================================= */

const SERVICE_NAME =
  "github-deployment-service";

const SERVICE_VERSION =
  "1.0.0";

const DEFAULT_PORT =
  3000;

const MAX_FILES =
  5000;

const MAX_ENV_VARIABLES =
  200;

const SUPPORTED_PACKAGE_MANAGERS =
  new Set([
    "npm",
    "yarn",
    "pnpm",
    "bun",
    "pip",
    "unknown"
  ]);

const SUPPORTED_DEPLOYMENT_TYPES =
  new Set([
    "node",
    "python",
    "static",
    "docker",
    "unknown"
  ]);

/* =========================================================
   ERROR
========================================================= */

class GithubDeploymentServiceError
  extends Error {
  constructor(
    message,
    code = "GITHUB_DEPLOYMENT_SERVICE_ERROR",
    status = 500,
    details = null
  ) {
    super(message);

    this.name =
      "GithubDeploymentServiceError";

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

function cleanString(
  value,
  maxLength = 500
) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

function uniqueStrings(
  values = [],
  max = 500
) {
  if (
    !Array.isArray(values)
  ) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(
          (value) =>
            cleanString(
              value,
              1000
            )
        )
        .filter(Boolean)
    )
  ].slice(0, max);
}

function normalizeFiles(
  files = []
) {
  if (
    !Array.isArray(files)
  ) {
    return [];
  }

  return files
    .slice(0, MAX_FILES)
    .map((file) => {
      if (
        typeof file ===
        "string"
      ) {
        return {
          path:
            cleanString(
              file,
              1000
            ),
          type:
            "file"
        };
      }

      return {
        path:
          cleanString(
            file?.path ||
              file?.name,
            1000
          ),
        type:
          cleanString(
            file?.type,
            50
          ) || "file"
      };
    })
    .filter(
      (file) =>
        Boolean(
          file.path
        )
    );
}

function hasFile(
  files,
  fileName
) {
  const normalized =
    fileName
      .replace(
        /^\/+/,
        ""
      )
      .toLowerCase();

  return files.some(
    (file) =>
      file.path
        .replace(
          /^\/+/,
          ""
        )
        .toLowerCase() ===
      normalized
  );
}

function hasAnyFile(
  files,
  names = []
) {
  return names.some(
    (name) =>
      hasFile(
        files,
        name
      )
  );
}

function inferDeploymentType(
  analysis = {}
) {
  if (
    analysis.deploymentType &&
    SUPPORTED_DEPLOYMENT_TYPES.has(
      analysis.deploymentType
    )
  ) {
    return analysis.deploymentType;
  }

  if (
    analysis.hasDockerfile
  ) {
    return "docker";
  }

  const framework =
    String(
      analysis.framework ||
        ""
    ).toLowerCase();

  if (
    framework.includes(
      "next"
    ) ||
    framework.includes(
      "react"
    ) ||
    framework.includes(
      "vite"
    ) ||
    framework.includes(
      "vue"
    ) ||
    framework.includes(
      "angular"
    )
  ) {
    return "node";
  }

  if (
    framework.includes(
      "django"
    ) ||
    framework.includes(
      "fastapi"
    ) ||
    framework.includes(
      "flask"
    )
  ) {
    return "python";
  }

  if (
    analysis.packageManager ===
      "npm" ||
    analysis.packageManager ===
      "yarn" ||
    analysis.packageManager ===
      "pnpm" ||
    analysis.packageManager ===
      "bun"
  ) {
    return "node";
  }

  return "unknown";
}

function inferPackageManager(
  analysis = {}
) {
  const manager =
    cleanString(
      analysis.packageManager,
      50
    ).toLowerCase();

  if (
    SUPPORTED_PACKAGE_MANAGERS.has(
      manager
    )
  ) {
    return manager;
  }

  return "unknown";
}

function normalizePort(
  value
) {
  const port =
    Number(value);

  if (
    Number.isInteger(
      port
    ) &&
    port > 0 &&
    port <= 65535
  ) {
    return port;
  }

  return DEFAULT_PORT;
}

function normalizeCommands(
  analysis = {}
) {
  const commands =
    analysis.commands || {};

  return {
    install:
      cleanString(
        commands.install,
        500
      ) || null,

    build:
      cleanString(
        commands.build,
        500
      ) || null,

    start:
      cleanString(
        commands.start,
        500
      ) || null,

    test:
      cleanString(
        commands.test,
        500
      ) || null
  };
}

function normalizeEnvironmentVariables(
  variables = []
) {
  if (
    Array.isArray(
      variables
    )
  ) {
    return uniqueStrings(
      variables,
      MAX_ENV_VARIABLES
    ).map(
      (name) => ({
        name,
        required: true,
        value:
          null
      })
    );
  }

  if (
    variables &&
    typeof variables ===
      "object"
  ) {
    return Object.keys(
      variables
    )
      .slice(
        0,
        MAX_ENV_VARIABLES
      )
      .map(
        (name) => ({
          name:
            cleanString(
              name,
              200
            ),
          required:
            variables[name]
              ?.required !==
            false,
          value:
            null
        })
      )
      .filter(
        (item) =>
          Boolean(
            item.name
          )
      );
  }

  return [];
}

/* =========================================================
   VALIDATION
========================================================= */

function validateAnalysis(
  analysis
) {
  if (
    !analysis ||
    typeof analysis !==
      "object"
  ) {
    throw new GithubDeploymentServiceError(
      "Repository analysis is required",
      "ANALYSIS_REQUIRED",
      400
    );
  }

  return true;
}

function validateFiles(
  files
) {
  if (
    !Array.isArray(files) ||
    files.length === 0
  ) {
    throw new GithubDeploymentServiceError(
      "Repository files are required",
      "FILES_REQUIRED",
      400
    );
  }

  if (
    files.length >
    MAX_FILES
  ) {
    throw new GithubDeploymentServiceError(
      `Repository exceeds maximum supported file count of ${MAX_FILES}`,
      "TOO_MANY_FILES",
      400
    );
  }

  return true;
}

/* =========================================================
   DEPLOYMENT TYPE
========================================================= */

function determineDeploymentType(
  analysis
) {
  validateAnalysis(
    analysis
  );

  return inferDeploymentType(
    analysis
  );
}

/* =========================================================
   BUILD DEPLOYMENT CONTRACT
========================================================= */

function buildDeploymentContract(
  input = {}
) {
  const {
    analysis = {},
    repository = {},
    files = []
  } = input;

  validateAnalysis(
    analysis
  );

  validateFiles(
    files
  );

  const normalizedFiles =
    normalizeFiles(
      files
    );

  const deploymentType =
    determineDeploymentType(
      analysis
    );

  const packageManager =
    inferPackageManager(
      analysis
    );

  const commands =
    normalizeCommands(
      analysis
    );

  const environmentVariables =
    normalizeEnvironmentVariables(
      analysis.environmentVariables ||
        analysis.envVariables ||
        []
    );

  const port =
    normalizePort(
      analysis.port ||
        analysis.exposedPort ||
        analysis.defaultPort
    );

  const dockerRequired =
    deploymentType ===
      "docker" ||
    Boolean(
      analysis.hasDockerfile
    );

  const dockerfile =
    hasFile(
      normalizedFiles,
      "Dockerfile"
    );

  const dockerCompose =
    hasAnyFile(
      normalizedFiles,
      [
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml"
      ]
    );

  const repositoryOwner =
    cleanString(
      repository.owner ||
        repository.ownerLogin,
      200
    );

  const repositoryName =
    cleanString(
      repository.name ||
        repository.repository,
      200
    );

  const branch =
    cleanString(
      repository.branch ||
        repository.defaultBranch ||
        "main",
      200
    );

  const contract = {
    contractVersion:
      "1.0",

    generatedBy:
      SERVICE_NAME,

    generatedAt:
      new Date().toISOString(),

    repository: {
      owner:
        repositoryOwner ||
        null,

      name:
        repositoryName ||
        null,

      fullName:
        cleanString(
          repository.fullName,
          500
        ) ||
        (
          repositoryOwner &&
          repositoryName
            ? `${repositoryOwner}/${repositoryName}`
            : null
        ),

      branch,

      sha:
        cleanString(
          repository.sha ||
            repository.commitSha,
          200
        ) || null
    },

    deployment: {
      type:
        deploymentType,

      packageManager,

      dockerRequired,

      dockerfilePresent:
        dockerfile,

      dockerComposePresent:
        dockerCompose,

      port,

      architecture:
        deploymentType ===
        "static"
          ? "static"
          : "container"
    },

    commands,

    environment: {
      variables:
        environmentVariables.map(
          (variable) => ({
            name:
              variable.name,

            required:
              variable.required,

            value:
              null
          })
        ),

      count:
        environmentVariables.length
    },

    source: {
      fileCount:
        normalizedFiles.length,

      files:
        normalizedFiles.map(
          (file) =>
            file.path
        )
    },

    handoff: {
      dockerAgent:
        deploymentType !==
        "static",

      awsAgent:
        true,

      deploymentLog:
        true,

      autoFix:
        true
    },

    security: {
      secretsIncluded:
        false,

      plaintextTokensIncluded:
        false,

      plaintextEnvironmentValuesIncluded:
        false
    }
  };

  return contract;
}

/* =========================================================
   DEPLOYMENT READINESS
========================================================= */

function checkDeploymentReadiness(
  input = {}
) {
  const {
    analysis = {},
    files = []
  } = input;

  validateAnalysis(
    analysis
  );

  validateFiles(
    files
  );

  const normalizedFiles =
    normalizeFiles(
      files
    );

  const deploymentType =
    determineDeploymentType(
      analysis
    );

  const reasons = [];

  const warnings = [];

  if (
    deploymentType ===
    "unknown"
  ) {
    reasons.push(
      "Unable to determine a supported deployment type"
    );
  }

  if (
    normalizedFiles.length ===
    0
  ) {
    reasons.push(
      "Repository contains no deployable files"
    );
  }

  if (
    deploymentType ===
    "docker" &&
    !hasFile(
      normalizedFiles,
      "Dockerfile"
    )
  ) {
    warnings.push(
      "Docker deployment type was detected but Dockerfile was not found"
    );
  }

  const commands =
    normalizeCommands(
      analysis
    );

  if (
    deploymentType ===
      "node" &&
    !commands.start
  ) {
    warnings.push(
      "Node deployment does not expose a start command"
    );
  }

  if (
    deploymentType ===
      "python" &&
    !commands.start
  ) {
    warnings.push(
      "Python deployment does not expose a start command"
    );
  }

  const ready =
    reasons.length ===
    0;

  return {
    ready,

    deploymentType,

    reasons,

    warnings,

    checks: {
      filesDetected:
        normalizedFiles.length >
        0,

      deploymentTypeDetected:
        deploymentType !==
        "unknown",

      commandsDetected:
        Boolean(
          commands.start ||
            commands.build
        ),

      dockerfileDetected:
        hasFile(
          normalizedFiles,
          "Dockerfile"
        )
    }
  };
}

/* =========================================================
   PREPARE DOCKER HANDOFF
========================================================= */

function prepareDockerHandoff(
  input = {}
) {
  const {
    contract
  } = input;

  if (
    !contract ||
    typeof contract !==
      "object"
  ) {
    throw new GithubDeploymentServiceError(
      "Deployment contract is required",
      "DEPLOYMENT_CONTRACT_REQUIRED",
      400
    );
  }

  if (
    !contract.handoff
      ?.dockerAgent
  ) {
    return {
      required:
        false,

      reason:
        "Docker handoff is not required for this deployment type"
    };
  }

  return {
    required:
      true,

    deploymentType:
      contract.deployment.type,

    repository:
      contract.repository,

    commands:
      contract.commands,

    port:
      contract.deployment
        .port,

    docker: {
      dockerfile:
        contract.deployment
          .dockerfilePresent,

      compose:
        contract.deployment
          .dockerComposePresent
    },

    environment:
      contract.environment
        .variables.map(
          (item) => ({
            name:
              item.name,

            required:
              item.required
          })
        ),

    security:
      contract.security
  };
}

/* =========================================================
   PREPARE AWS HANDOFF
========================================================= */

function prepareAwsHandoff(
  input = {}
) {
  const {
    contract
  } = input;

  if (
    !contract ||
    typeof contract !==
      "object"
  ) {
    throw new GithubDeploymentServiceError(
      "Deployment contract is required",
      "DEPLOYMENT_CONTRACT_REQUIRED",
      400
    );
  }

  return {
    required:
      true,

    source:
      "github",

    repository:
      contract.repository,

    deployment:
      contract.deployment,

    commands:
      contract.commands,

    environment:
      contract.environment
        .variables.map(
          (item) => ({
            name:
              item.name,

            required:
              item.required
          })
        ),

    security:
      contract.security
  };
}

/* =========================================================
   FULL PREPARATION
========================================================= */

function prepareDeployment(
  input = {}
) {
  const {
    analysis = {},
    repository = {},
    files = []
  } = input;

  const contract =
    buildDeploymentContract({
      analysis,
      repository,
      files
    });

  const readiness =
    checkDeploymentReadiness({
      analysis,
      files
    });

  return {
    success:
      true,

    contract,

    readiness,

    dockerHandoff:
      prepareDockerHandoff({
        contract
      }),

    awsHandoff:
      prepareAwsHandoff({
        contract
      })
  };
}

/* =========================================================
   SANITIZE HANDOFF
========================================================= */

function sanitizeDeploymentContract(
  contract
) {
  if (
    !contract ||
    typeof contract !==
      "object"
  ) {
    return null;
  }

  const clone =
    JSON.parse(
      JSON.stringify(
        contract
      )
    );

  if (
    clone.security
  ) {
    clone.security =
      {
        secretsIncluded:
          false,

        plaintextTokensIncluded:
          false,

        plaintextEnvironmentValuesIncluded:
          false
      };
  }

  if (
    clone.environment &&
    Array.isArray(
      clone.environment
        .variables
    )
  ) {
    clone.environment
      .variables =
      clone.environment
        .variables.map(
          (item) => ({
            name:
              item.name,

            required:
              item.required,

            value:
              null
          })
        );
  }

  return clone;
}

/* =========================================================
   HEALTH
========================================================= */

function health() {
  return {
    service:
      SERVICE_NAME,

    version:
      SERVICE_VERSION,

    status:
      "healthy",

    capabilities: [
      "deployment-contract",
      "deployment-readiness",
      "docker-handoff",
      "aws-handoff",
      "secret-safe-handoff"
    ],

    aiProvider:
      "none",

    timestamp:
      new Date().toISOString()
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  SERVICE_NAME,

  SERVICE_VERSION,

  GithubDeploymentServiceError,

  determineDeploymentType,

  buildDeploymentContract,

  checkDeploymentReadiness,

  prepareDockerHandoff,

  prepareAwsHandoff,

  prepareDeployment,

  sanitizeDeploymentContract,

  health
};
