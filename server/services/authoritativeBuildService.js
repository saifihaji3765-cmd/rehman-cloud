"use strict";

/**
 * =========================================================
 * ZYRIONOS — AUTHORITATIVE BUILD SERVICE
 * =========================================================
 *
 * Version: 3.2.0
 *
 * PURPOSE
 * ---------------------------------------------------------
 * REAL authoritative production build execution boundary.
 *
 * Builder Agent
 *      ↓
 * BuildValidationService
 *      ↓
 * Master Agent
 *      ↓
 * AuthoritativeBuildService
 *      ↓
 * Docker
 *      ↓
 * Dependency Install
 *      ↓
 * REAL PRODUCTION BUILD
 *      ↓
 * ┌─────────────────────────────┐
 * │                             │
 * PASS                         FAIL
 * │                             │
 * ↓                             ↓
 * Verified Artifact          Fix Agent
 * │                             ↓
 * ↓                          Rebuild
 * Preview
 *
 * =========================================================
 *
 * IMPORTANT
 * ---------------------------------------------------------
 * Generated application code is NEVER executed directly
 * inside the ZyrionOS backend Node.js process.
 *
 * Generated application code is executed only inside Docker.
 *
 * This service:
 *
 * - validates source boundaries
 * - validates package.json
 * - validates build script semantics
 * - rejects runtime/dev/start commands
 * - creates isolated workspace
 * - materializes generated files
 * - detects package manager
 * - installs dependencies
 * - executes REAL production build
 * - captures stdout/stderr
 * - extracts compiler locations
 * - classifies failures
 * - creates deterministic repairContext
 * - creates verified artifact
 * - persists build metadata
 * - cleans temporary workspace
 *
 * This service DOES NOT:
 *
 * - call AI providers
 * - call Fix Agent
 * - modify source files
 * - start preview servers
 * - perform browser smoke tests
 * - deploy applications
 *
 * =========================================================
 */


/* =========================================================
   PACKAGES
========================================================= */

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ProjectBuild =
  require("../models/projectBuildModel");


/* =========================================================
   METADATA
========================================================= */

const SERVICE_VERSION =
  "3.2.0";

const VALIDATION_MODE =
  "authoritative";

const AUTHORITATIVE =
  true;


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILES =
  Number(
    process.env.AUTH_BUILD_MAX_FILES
  ) || 1000;

const MAX_FILE_SIZE =
  Number(
    process.env.AUTH_BUILD_MAX_FILE_SIZE
  ) || 2 * 1024 * 1024;

const MAX_SOURCE_SIZE =
  Number(
    process.env.AUTH_BUILD_MAX_SOURCE_SIZE
  ) || 25 * 1024 * 1024;

const MAX_ARTIFACT_SIZE =
  Number(
    process.env.AUTH_BUILD_MAX_ARTIFACT_SIZE
  ) || 500 * 1024 * 1024;

const INSTALL_TIMEOUT_MS =
  Number(
    process.env.AUTH_BUILD_INSTALL_TIMEOUT_MS
  ) || 5 * 60 * 1000;

const BUILD_TIMEOUT_MS =
  Number(
    process.env.AUTH_BUILD_TIMEOUT_MS
  ) || 5 * 60 * 1000;

const DOCKER_CHECK_TIMEOUT_MS =
  Number(
    process.env.AUTH_BUILD_DOCKER_CHECK_TIMEOUT_MS
  ) || 5000;

const CPU_LIMIT =
  process.env.AUTH_BUILD_CPU_LIMIT ||
  "2";

const MEMORY_LIMIT =
  process.env.AUTH_BUILD_MEMORY_LIMIT ||
  "2g";

const PIDS_LIMIT =
  Number(
    process.env.AUTH_BUILD_PIDS_LIMIT
  ) || 256;

const BUILD_NETWORK =
  process.env.AUTH_BUILD_NETWORK ||
  "none";

const INSTALL_NETWORK =
  process.env.AUTH_INSTALL_NETWORK ||
  process.env.AUTH_BUILD_INSTALL_NETWORK ||
  "bridge";

const MAX_OUTPUT_BYTES =
  Number(
    process.env.AUTH_BUILD_MAX_OUTPUT_BYTES
  ) || 5 * 1024 * 1024;

const MAX_ERROR_LOG_BYTES =
  Number(
    process.env.AUTH_BUILD_MAX_ERROR_LOG_BYTES
  ) || 20000;

const MAX_CONCURRENT_BUILDS =
  Number(
    process.env.AUTH_BUILD_MAX_CONCURRENCY
  ) || 2;

const ARTIFACT_ROOT =
  process.env.AUTH_ARTIFACT_ROOT ||
  path.join(
    os.tmpdir(),
    "zyrionos-build-artifacts"
  );

const ARTIFACT_STORAGE_PREFIX =
  String(
    process.env.AUTH_ARTIFACT_PREFIX ||
      "zyrionos/builds"
  )
    .replace(
      /^\/+|\/+$/g,
      ""
    );

const ARTIFACT_BUCKET =
  process.env.AUTH_ARTIFACT_BUCKET ||
  "";

const ARTIFACT_REGION =
  process.env.AWS_REGION ||
  "ap-south-1";


/* =========================================================
   NODE IMAGES
========================================================= */

const NODE_IMAGES =
  Object.freeze({
    "20":
      "node:20-bookworm-slim",

    "22":
      "node:22-bookworm-slim"
  });


/* =========================================================
   CONCURRENCY
========================================================= */

let activeBuilds = 0;

const buildQueue = [];


/* =========================================================
   BASIC UTILITIES
========================================================= */

function safeString(
  value,
  max = 10000
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).slice(
    0,
    max
  );
}


function generateBuildId() {
  return (
    `build_${Date.now()}_` +
    crypto
      .randomBytes(8)
      .toString("hex")
  );
}


function sha256String(
  value
) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}


function sha256Buffer(
  value
) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}


/* =========================================================
   LOGGING
========================================================= */

function logInfo(
  message
) {
  try {
    if (
      global.logger &&
      typeof global.logger.info ===
        "function"
    ) {
      global.logger.info(
        message
      );

      return;
    }

    console.log(
      message
    );
  } catch {
    console.log(
      message
    );
  }
}


function logWarn(
  message
) {
  try {
    if (
      global.logger &&
      typeof global.logger.warn ===
        "function"
    ) {
      global.logger.warn(
        message
      );

      return;
    }

    if (
      global.logger &&
      typeof global.logger.warning ===
        "function"
    ) {
      global.logger.warning(
        message
      );

      return;
    }

    console.warn(
      message
    );
  } catch {
    console.warn(
      message
    );
  }
}


function logError(
  message
) {
  try {
    if (
      global.logger &&
      typeof global.logger.error ===
        "function"
    ) {
      global.logger.error(
        message
      );

      return;
    }

    console.error(
      message
    );
  } catch {
    console.error(
      message
    );
  }
}


/* =========================================================
   PATH SAFETY
========================================================= */

function normalizeFilePath(
  filePath
) {
  const value =
    String(
      filePath || ""
    )
      .replace(
        /\\/g,
        "/"
      )
      .trim();

  if (!value) {
    throw new Error(
      "File path is required"
    );
  }

  return value.replace(
    /^\.\/+/,
    ""
  );
}


function sanitizeFilePath(
  filePath
) {
  const value =
    normalizeFilePath(
      filePath
    );

  if (
    value.startsWith("/")
  ) {
    throw new Error(
      `Unsafe absolute file path: ${value}`
    );
  }

  if (
    /^[A-Za-z]:/.test(
      value
    )
  ) {
    throw new Error(
      `Unsafe Windows file path: ${value}`
    );
  }

  if (
    value.includes("\0")
  ) {
    throw new Error(
      "File path contains null byte"
    );
  }

  const parts =
    value.split("/");

  if (
    parts.includes("..")
  ) {
    throw new Error(
      `Unsafe traversal path: ${value}`
    );
  }

  return value;
}


function ensureInside(
  root,
  target
) {
  const resolvedRoot =
    path.resolve(
      root
    ) + path.sep;

  const resolvedTarget =
    path.resolve(
      target
    );

  if (
    !resolvedTarget.startsWith(
      resolvedRoot
    )
  ) {
    throw new Error(
      "Path escapes build workspace"
    );
  }
}


/* =========================================================
   FILE ACCESS
========================================================= */

function getFilePath(
  file
) {
  if (
    !file ||
    typeof file !== "object"
  ) {
    return "";
  }

  return sanitizeFilePath(
    file.path ||
    file.filePath ||
    file.name ||
    ""
  );
}


function getFileContent(
  file
) {
  if (
    !file ||
    typeof file !== "object"
  ) {
    return "";
  }

  if (
    typeof file.content ===
      "string"
  ) {
    return file.content;
  }

  if (
    typeof file.source ===
      "string"
  ) {
    return file.source;
  }

  if (
    typeof file.code ===
      "string"
  ) {
    return file.code;
  }

  return "";
}


/* =========================================================
   SOURCE VALIDATION
========================================================= */

function validateFiles(
  files
) {
  if (
    !Array.isArray(files)
  ) {
    throw new Error(
      "Build files must be an array"
    );
  }

  if (
    files.length === 0
  ) {
    throw new Error(
      "Cannot build project without files"
    );
  }

  if (
    files.length >
    MAX_FILES
  ) {
    throw new Error(
      `Project exceeds maximum file count of ${MAX_FILES}`
    );
  }

  const seen =
    new Set();

  let totalSize = 0;


  for (
    const file of files
  ) {
    const filePath =
      getFilePath(
        file
      );

    const content =
      getFileContent(
        file
      );


    if (!filePath) {
      throw new Error(
        "Every build file must contain a valid path"
      );
    }


    if (
      seen.has(
        filePath
      )
    ) {
      throw new Error(
        `Duplicate project file: ${filePath}`
      );
    }

    seen.add(
      filePath
    );


    const size =
      Buffer.byteLength(
        content,
        "utf8"
      );


    if (
      size >
      MAX_FILE_SIZE
    ) {
      throw new Error(
        `File exceeds maximum size: ${filePath}`
      );
    }


    totalSize +=
      size;
  }


  if (
    totalSize >
    MAX_SOURCE_SIZE
  ) {
    throw new Error(
      `Project source exceeds ${MAX_SOURCE_SIZE} bytes`
    );
  }


  return {
    fileCount:
      files.length,

    totalSize
  };
}


/* =========================================================
   SOURCE HASH
========================================================= */

function calculateSourceHash(
  files
) {
  const normalized =
    Array.isArray(files)
      ? files
          .map(
            file => ({
              path:
                getFilePath(
                  file
                ),

              content:
                getFileContent(
                  file
                )
            })
          )
          .sort(
            (a, b) =>
              a.path.localeCompare(
                b.path
              )
          )
      : [];

  return sha256String(
    JSON.stringify(
      normalized
    )
  );
}


/* =========================================================
   NODE VERSION
========================================================= */

function resolveNodeVersion(
  nodeVersion
) {
  const raw =
    String(
      nodeVersion ||
        "20"
    )
      .trim();

  const match =
    raw.match(
      /^(20|22)(?:\.\d+)?/
    );

  if (!match) {
    return "20";
  }

  return match[1];
}


/* =========================================================
   PACKAGE MANAGER
========================================================= */

function detectPackageManager(
  files,
  requested,
  packageJson = null
) {
  const valid = [
    "npm",
    "yarn",
    "pnpm",
    "bun"
  ];


  if (
    valid.includes(
      String(
        requested || ""
      )
        .trim()
        .toLowerCase()
    )
  ) {
    return String(
      requested
    )
      .trim()
      .toLowerCase();
  }


  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(
            file
          )
      )
    );


  if (
    paths.has(
      "pnpm-lock.yaml"
    )
  ) {
    return "pnpm";
  }


  if (
    paths.has(
      "yarn.lock"
    )
  ) {
    return "yarn";
  }


  if (
    paths.has(
      "bun.lock"
    ) ||
    paths.has(
      "bun.lockb"
    )
  ) {
    return "bun";
  }


  if (
    paths.has(
      "package-lock.json"
    )
  ) {
    return "npm";
  }


  const declared =
    String(
      packageJson?.packageManager ||
        ""
    )
      .trim()
      .toLowerCase();


  if (
    declared.startsWith(
      "pnpm@"
    )
  ) {
    return "pnpm";
  }


  if (
    declared.startsWith(
      "yarn@"
    )
  ) {
    return "yarn";
  }


  if (
    declared.startsWith(
      "bun@"
    )
  ) {
    return "bun";
  }


  if (
    declared.startsWith(
      "npm@"
    )
  ) {
    return "npm";
  }


  return "npm";
}


/* =========================================================
   PACKAGE JSON
========================================================= */

function getPackageJson(
  files
) {
  const packageFile =
    files.find(
      file =>
        getFilePath(
          file
        ) ===
        "package.json"
    );


  if (!packageFile) {
    throw new Error(
      "package.json is required for authoritative build"
    );
  }


  const raw =
    getFileContent(
      packageFile
    );


  try {
    const parsed =
      JSON.parse(
        raw
      );


    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(
        parsed
      )
    ) {
      throw new Error(
        "package.json root must be an object"
      );
    }


    return parsed;

  } catch (error) {
    throw new Error(
      `package.json contains invalid JSON: ${error.message}`
    );
  }
}


/* =========================================================
   LOCKFILE
========================================================= */

function hasLockfile(
  files,
  packageManager
) {
  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(
            file
          )
      )
    );


  const lockfiles = {
    npm: [
      "package-lock.json",
      "npm-shrinkwrap.json"
    ],

    pnpm: [
      "pnpm-lock.yaml"
    ],

    yarn: [
      "yarn.lock"
    ],

    bun: [
      "bun.lock",
      "bun.lockb"
    ]
  };


  return (
    lockfiles[
      packageManager
    ] || []
  ).some(
    file =>
      paths.has(
        file
      )
  );
}


/* =========================================================
   PACKAGE MANAGER COMMANDS
========================================================= */

function getInstallCommand(
  manager,
  locked
) {
  switch (
    manager
  ) {
    case "pnpm":
      return locked
        ? "corepack pnpm install --frozen-lockfile"
        : "corepack pnpm install";

    case "yarn":
      return locked
        ? "corepack yarn install --immutable"
        : "corepack yarn install";

    case "bun":
      return locked
        ? "bun install --frozen-lockfile"
        : "bun install";

    case "npm":
    default:
      return locked
        ? "npm ci"
        : "npm install";
  }
}


/* =========================================================
   BUILD SCRIPT VALIDATION
========================================================= */

function normalizeBuildScript(
  script
) {
  return String(
    script || ""
  )
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}


function detectForbiddenBuildScript(
  script
) {
  const normalized =
    normalizeBuildScript(
      script
    );

  const lower =
    normalized.toLowerCase();


  if (!normalized) {
    return {
      invalid:
        true,

      reason:
        "Build script is empty."
    };
  }


  if (
    /(^|[;&|])\s*(?:npm\s+run\s+build|pnpm\s+run\s+build|yarn\s+build|bun\s+run\s+build)\s*(?:$|[;&|])/i.test(
      normalized
    )
  ) {
    return {
      invalid:
        true,

      reason:
        "Build script recursively invokes itself."
    };
  }


  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?start\b/i.test(
      normalized
    )
  ) {
    return {
      invalid:
        true,

      reason:
        "Build script starts the application instead of building it."
    };
  }


  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?dev\b/i.test(
      normalized
    )
  ) {
    return {
      invalid:
        true,

      reason:
        "Build script starts a development server."
    };
  }


  if (
    /\b(?:node|nodejs)\s+(?:[^\s;&|]+\/)*(?:server|index|app)\.(?:js|mjs|cjs|ts|mts|cts)\b/i.test(
      normalized
    )
  ) {
    return {
      invalid:
        true,

      reason:
        "Build script executes a runtime server entrypoint."
    };
  }


  const forbiddenPatterns = [
    /\bnext\s+dev\b/i,
    /\bvite\s+preview\b/i,
    /(?:^|[;&|]\s*)vite(?:\s|$)/i,
    /\bwebpack-dev-server\b/i,
    /\breact-scripts\s+start\b/i,
    /\bvue-cli-service\s+serve\b/i,
    /\bng\s+serve\b/i,
    /\bng\s+start\b/i,
    /\bnodemon\b/i,
    /\bts-node-dev\b/i,
    /\btsx\s+watch\b/i,
    /\btsc\s+--watch\b/i,
    /\bwebpack\s+serve\b/i,
    /\bpython(?:3)?\s+-m\s+http\.server\b/i,
    /\bserve\s+-s\b/i
  ];


  for (
    const pattern of forbiddenPatterns
  ) {
    if (
      pattern.test(
        normalized
      )
    ) {
      return {
        invalid:
          true,

        reason:
          "Build script contains a development server/watch/preview command."
      };
    }
  }


  if (
    /^(?:start|serve|dev)$/i.test(
      lower
    )
  ) {
    return {
      invalid:
        true,

      reason:
        "Build script is a runtime/development command."
    };
  }


  return {
    invalid:
      false,

    reason:
      ""
  };
}


/* =========================================================
   FRAMEWORK BUILD VALIDATION
========================================================= */

function validateBuildScriptForFramework(
  script,
  framework
) {
  const normalized =
    normalizeBuildScript(
      script
    );

  const frameworkName =
    String(
      framework || ""
    )
      .trim()
      .toLowerCase();


  if (!frameworkName) {
    return {
      valid:
        true,

      reason:
        ""
    };
  }


  if (
    frameworkName.includes(
      "next"
    )
  ) {
    if (
      !/\bnext\s+build\b/i.test(
        normalized
      )
    ) {
      return {
        valid:
          false,

        reason:
          "Next.js authoritative builds must use `next build`."
      };
    }
  }


  if (
    frameworkName.includes(
      "vite"
    )
  ) {
    if (
      !/\bvite\s+build\b/i.test(
        normalized
      )
    ) {
      return {
        valid:
          false,

        reason:
          "Vite projects must use `vite build`."
      };
    }
  }


  if (
    frameworkName.includes(
      "angular"
    )
  ) {
    if (
      !/\bng\s+build\b/i.test(
        normalized
      )
    ) {
      return {
        valid:
          false,

        reason:
          "Angular projects must use `ng build`."
      };
    }
  }


  if (
    frameworkName.includes(
      "astro"
    )
  ) {
    if (
      !/\bastro\s+build\b/i.test(
        normalized
      )
    ) {
      return {
        valid:
          false,

        reason:
          "Astro projects must use `astro build`."
      };
    }
  }


  if (
    frameworkName.includes(
      "sveltekit"
    )
  ) {
    if (
      !/\b(?:svelte-kit\s+build|vite\s+build)\b/i.test(
        normalized
      )
    ) {
      return {
        valid:
          false,

        reason:
          "SvelteKit projects must use a finite SvelteKit/Vite production build."
      };
    }
  }


  if (
    frameworkName === "vue" ||
    (
      frameworkName.includes("vue") &&
      !frameworkName.includes("vue-native")
    )
  ) {
    const acceptable =
      /\bvite\s+build\b/i.test(
        normalized
      ) ||
      /\bvue-cli-service\s+build\b/i.test(
        normalized
      );

    if (
      !acceptable
    ) {
      return {
        valid:
          false,

        reason:
          "Vue projects must use Vite or Vue CLI production build."
      };
    }
  }


  if (
    frameworkName === "react" ||
    frameworkName.includes(
      "react"
    )
  ) {
    const acceptable =
      /\bvite\s+build\b/i.test(
        normalized
      ) ||
      /\breact-scripts\s+build\b/i.test(
        normalized
      ) ||
      /\bwebpack\b/i.test(
        normalized
      ) ||
      /\bparcel\b/i.test(
        normalized
      ) ||
      /\besbuild\b/i.test(
        normalized
      ) ||
      /\btsup\b/i.test(
        normalized
      );

    if (
      !acceptable
    ) {
      return {
        valid:
          false,

        reason:
          "React projects must use a finite production bundler such as Vite, react-scripts, webpack, Parcel, esbuild or tsup."
      };
    }
  }


  return {
    valid:
      true,

    reason:
      ""
  };
}


/* =========================================================
   BUILD COMMAND
========================================================= */

function getBuildCommand(
  packageManager,
  packageJson,
  framework = ""
) {
  const scripts =
    packageJson?.scripts || {};

  const script =
    scripts.build;


  if (
    typeof script !==
      "string" ||
    !script.trim()
  ) {
    throw new Error(
      "package.json must contain a non-empty build script"
    );
  }


  const forbidden =
    detectForbiddenBuildScript(
      script
    );


  if (
    forbidden.invalid
  ) {
    throw new Error(
      `Invalid authoritative build script: ${forbidden.reason} | script="${safeString(
        script,
        1000
      )}"`
    );
  }


  const frameworkValidation =
    validateBuildScriptForFramework(
      script,
      framework
    );


  if (
    !frameworkValidation.valid
  ) {
    throw new Error(
      `Invalid authoritative build script for framework "${framework}": ${frameworkValidation.reason} | script="${safeString(
        script,
        1000
      )}"`
    );
  }


  switch (
    packageManager
  ) {
    case "pnpm":
      return "pnpm run build";

    case "yarn":
      return "yarn build";

    case "bun":
      return "bun run build";

    case "npm":
    default:
      return "npm run build";
  }
}


/* =========================================================
   NODE IMAGE
========================================================= */

function getNodeImage(
  nodeVersion
) {
  const version =
    resolveNodeVersion(
      nodeVersion
    );

  return (
    NODE_IMAGES[
      version
    ] ||
    NODE_IMAGES["20"]
  );
}


/* =========================================================
   OUTPUT COLLECTOR
========================================================= */

function createOutputCollector() {
  let stdout = "";
  let stderr = "";

  let stdoutBytes = 0;
  let stderrBytes = 0;

  let truncated = false;


  function append(
    chunk
  ) {
    const text =
      Buffer.isBuffer(chunk)
        ? chunk.toString("utf8")
        : String(chunk);

    return {
      text,

      bytes:
        Buffer.byteLength(
          text,
          "utf8"
        )
    };
  }


  return {
    appendStdout(
      chunk
    ) {
      const result =
        append(
          chunk
        );

      stdoutBytes +=
        result.bytes;

      stdout +=
        result.text;


      if (
        Buffer.byteLength(
          stdout,
          "utf8"
        ) >
        MAX_OUTPUT_BYTES
      ) {
        stdout =
          stdout.slice(
            -MAX_OUTPUT_BYTES
          );

        truncated =
          true;
      }
    },


    appendStderr(
      chunk
    ) {
      const result =
        append(
          chunk
        );

      stderrBytes +=
        result.bytes;

      stderr +=
        result.text;


      if (
        Buffer.byteLength(
          stderr,
          "utf8"
        ) >
        MAX_OUTPUT_BYTES
      ) {
        stderr =
          stderr.slice(
            -MAX_OUTPUT_BYTES
          );

        truncated =
          true;
      }
    },


    getResult() {
      return {
        stdout,

        stderr,

        stdoutBytes,

        stderrBytes,

        truncated
      };
    }
  };
}


/* =========================================================
   OUTPUT SANITIZATION
========================================================= */

function sanitizeBuildOutput(
  value
) {
  let text =
    safeString(
      value,
      MAX_ERROR_LOG_BYTES
    );


  text =
    text.replace(
      /([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS)[A-Z0-9_]*)\s*=\s*[^\s]+/gi,
      "$1=[REDACTED]"
    );


  text =
    text.replace(
      /(Bearer\s+)[A-Za-z0-9._-]+/gi,
      "$1[REDACTED]"
    );


  return text;
}


/* =========================================================
   COMPILER LOCATION
========================================================= */

function normalizeCompilerFilePath(
  value
) {
  let file =
    String(
      value || ""
    )
      .trim()
      .replace(
        /\\/g,
        "/"
      );


  file =
    file.replace(
      /^file:\/+/,
      ""
    );


  file =
    file.replace(
      /^\/workspace\//,
      ""
    );


  file =
    file.replace(
      /^workspace\//,
      ""
    );


  file =
    file.replace(
      /^\.\//,
      ""
    );


  const workspaceIndex =
    file.indexOf(
      "/workspace/"
    );


  if (
    workspaceIndex >= 0
  ) {
    file =
      file.slice(
        workspaceIndex +
        "/workspace/".length
      );
  }


  return file;
}


function parseCompilerLocation(
  output
) {
  if (!output) {
    return null;
  }


  const text =
    String(
      output
    );


  const patterns = [

    /(?:^|\n)\s*(?:[A-Za-z]:)?([^\s():]+(?:\/[^\s():]+)*)\s*:\s*(\d+)\s*:\s*(\d+)/,

    /(?:^|\n)\s*(\.?\.?\/?[^\s():]+)\s*:\s*(\d+)\s*:\s*(\d+)/,

    /(?:^|\n)\s*(\.?\.?\/?[^\s()]+)\((\d+),\s*(\d+)\)/,

    /(?:^|\n)\s*(\.?\.?\/?[^\s():]+)\((\d+),\s*(\d+)\)\s*:/,

    /(?:^|\n)\s*(\.?\.?\/?[^\s]+)\s*\n\s*(\d+)\s*:\s*(\d+)/
  ];


  for (
    const pattern of patterns
  ) {
    const match =
      pattern.exec(
        text
      );


    if (!match) {
      continue;
    }


    const file =
      normalizeCompilerFilePath(
        match[1]
      );

    const line =
      Number(
        match[2]
      );

    const column =
      Number(
        match[3]
      );


    if (
      !file ||
      !Number.isFinite(line) ||
      !Number.isFinite(column)
    ) {
      continue;
    }


    return {
      file,
      line,
      column
    };
  }


  return null;
}


/* =========================================================
   BUILD ERROR
========================================================= */

function createBuildError({
  code,
  message,
  step,
  category,
  stdout = "",
  stderr = "",
  retryable = false
}) {
  const combined =
    `${stderr}\n${stdout}`;


  const location =
    parseCompilerLocation(
      combined
    );


  return {
    code:
      safeString(
        code,
        200
      ),

    message:
      safeString(
        message,
        4000
      ),

    step:
      safeString(
        step,
        300
      ),

    stage:
      safeString(
        step,
        300
      ),

    category:
      category ||
      "unknown",

    retryable:
      Boolean(
        retryable
      ),

    file:
      location?.file ||
      "",

    line:
      location?.line ||
      null,

    column:
      location?.column ||
      null,

    stdout:
      sanitizeBuildOutput(
        stdout
      ),

    stderr:
      sanitizeBuildOutput(
        stderr
      )
  };
}


/* =========================================================
   FAILURE CLASSIFICATION
========================================================= */

function classifyFailure({
  stage,
  stdout = "",
  stderr = "",
  timedOut = false,
  signal = null
}) {
  if (
    timedOut
  ) {
    return {
      category:
        "timeout",

      retryable:
        true
    };
  }


  const text =
    `${stdout}\n${stderr}`
      .toLowerCase();


  if (
    text.includes(
      "eacces"
    ) ||
    text.includes(
      "permission denied"
    )
  ) {
    return {
      category:
        "permission",

      retryable:
        false
    };
  }


  if (
    text.includes(
      "network"
    ) ||
    text.includes(
      "getaddrinfo"
    ) ||
    text.includes(
      "fetch failed"
    ) ||
    text.includes(
      "eai_again"
    )
  ) {
    return {
      category:
        "network",

      retryable:
        true
    };
  }


  if (
    text.includes(
      "cannot find module"
    ) ||
    text.includes(
      "module not found"
    )
  ) {
    return {
      category:
        "missing-module",

      retryable:
        false
    };
  }


  if (
    text.includes(
      "syntaxerror"
    ) ||
    text.includes(
      "unexpected token"
    ) ||
    text.includes(
      "parse error"
    ) ||
    text.includes(
      "parsing error"
    )
  ) {
    return {
      category:
        "syntax",

      retryable:
        false
    };
  }


  if (
    signal ===
      "SIGTERM"
  ) {
    return {
      category:
        "process-terminated",

      retryable:
        false
    };
  }


  if (
    stage ===
    "install"
  ) {
    return {
      category:
        "dependency-install",

      retryable:
        false
    };
  }


  if (
    stage ===
    "build"
  ) {
    return {
      category:
        "build",

      retryable:
        false
    };
  }


  return {
    category:
      "unknown",

    retryable:
      false
  };
}


/* =========================================================
   DOCKER PREFLIGHT
========================================================= */

async function checkDockerAvailable() {
  return new Promise(
    resolve => {
      let finished =
        false;


      const child =
        spawn(
          "docker",
          [
            "version",
            "--format",
            "{{.Server.Version}}"
          ],
          {
            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ]
          }
        );


      const finish =
        value => {
          if (
            finished
          ) {
            return;
          }

          finished =
            true;

          resolve(
            value
          );
        };


      const timer =
        setTimeout(
          () => {
            try {
              child.kill(
                "SIGKILL"
              );
            } catch {}

            finish(
              false
            );
          },
          DOCKER_CHECK_TIMEOUT_MS
        );


      child.once(
        "error",
        () => {
          clearTimeout(
            timer
          );

          finish(
            false
          );
        }
      );


      child.once(
        "close",
        code => {
          clearTimeout(
            timer
          );

          finish(
            code === 0
          );
        }
      );
    }
  );
}


/* =========================================================
   WORKSPACE
========================================================= */

async function createWorkspace(
  buildId
) {
  const workspace =
    await fsp.mkdtemp(
      path.join(
        os.tmpdir(),
        `zyrionos-build-${buildId}-`
      )
    );


  /*
   * IMPORTANT:
   * Docker runs the generated project as the non-root
   * `node` user. The host-created temporary directory can
   * otherwise be owned by the backend process and become
   * unwritable from inside Docker.
   *
   * The directory is temporary, isolated and removed after
   * the build.
   */
  await fsp.chmod(
    workspace,
    0o777
  );


  return workspace;
}


async function cleanupWorkspace(
  workspace
) {
  if (!workspace) {
    return;
  }


  try {
    await fsp.rm(
      workspace,
      {
        recursive:
          true,

        force:
          true
      }
    );
  } catch (error) {
    logWarn(
      `[AuthoritativeBuildService] Workspace cleanup failed: ${error.message}`
    );
  }
}


/* =========================================================
   MATERIALIZE SOURCE
========================================================= */

async function materializeSource(
  files,
  workspace
) {
  for (
    const file of files
  ) {
    const relativePath =
      getFilePath(
        file
      );


    const destination =
      path.resolve(
        workspace,
        relativePath
      );


    ensureInside(
      workspace,
      destination
    );


    await fsp.mkdir(
      path.dirname(
        destination
      ),
      {
        recursive:
          true
      }
    );


    await fsp.writeFile(
      destination,
      getFileContent(
        file
      ),
      {
        encoding:
          "utf8",

        mode:
          0o666
      }
    );
  }
}


/* =========================================================
   DOCKER COMMAND
========================================================= */

function runDockerCommand({
  image,
  workspace,
  command,
  network,
  timeoutMs,
  containerName
}) {
  return new Promise(
    resolve => {
      const collector =
        createOutputCollector();


      const args = [
        "run",

        "--rm",

        "--name",
        containerName,

        "--cpus",
        CPU_LIMIT,

        "--memory",
        MEMORY_LIMIT,

        "--pids-limit",
        String(
          PIDS_LIMIT
        ),

        "--cap-drop",
        "ALL",

        "--security-opt",
        "no-new-privileges",

        "--read-only",

        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=512m",

        "--tmpfs",
        "/home/node:rw,nosuid,size=256m",

        "--network",
        network,

        "-v",
        `${workspace}:/workspace:rw`,

        "-w",
        "/workspace",

        "--user",
        "node",

        image,

        "sh",
        "-lc",
        command
      ];


      const startedAt =
        Date.now();


      let settled =
        false;

      let timedOut =
        false;


      const child =
        spawn(
          "docker",
          args,
          {
            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ]
          }
        );


      const finish =
        result => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          resolve(
            result
          );
        };


      child.stdout.on(
        "data",
        chunk =>
          collector.appendStdout(
            chunk
          )
      );


      child.stderr.on(
        "data",
        chunk =>
          collector.appendStderr(
            chunk
          )
      );


      child.once(
        "error",
        error => {
          finish({
            success:
              false,

            timedOut:
              false,

            exitCode:
              null,

            signal:
              null,

            durationMs:
              Date.now() -
              startedAt,

            ...collector.getResult(),

            error:
              error.message
          });
        }
      );


      const timer =
        setTimeout(
          () => {
            if (
              settled
            ) {
              return;
            }


            timedOut =
              true;


            try {
              child.kill(
                "SIGKILL"
              );
            } catch {}


            setTimeout(
              () => {
                try {
                  spawn(
                    "docker",
                    [
                      "rm",
                      "-f",
                      containerName
                    ],
                    {
                      stdio:
                        "ignore"
                    }
                  );
                } catch {}
              },
              100
            );
          },
          timeoutMs
        );


      child.once(
        "close",
        (
          code,
          signal
        ) => {
          clearTimeout(
            timer
          );


          finish({
            success:
              code === 0 &&
              !timedOut,

            timedOut,

            exitCode:
              code,

            signal:
              signal ||
              null,

            durationMs:
              Date.now() -
              startedAt,

            ...collector.getResult(),

            error:
              null
          });
        }
      );
    }
  );
}


/* =========================================================
   ARTIFACT FILTER
========================================================= */

function shouldExcludeArtifact(
  relativePath
) {
  const normalized =
    relativePath.replace(
      /\\/g,
      "/"
    );


  const parts =
    normalized.split("/");


  if (
    parts.includes(
      "node_modules"
    )
  ) {
    return true;
  }


  if (
    parts.includes(
      ".git"
    )
  ) {
    return true;
  }


  if (
    parts.includes(
      ".zyrionos"
    )
  ) {
    return true;
  }


  if (
    [
      ".env",
      ".env.local",
      ".env.production",
      ".env.development",
      ".env.preview"
    ].includes(
      normalized
    )
  ) {
    return true;
  }


  if (
    normalized.startsWith(
      ".cache/"
    ) ||
    normalized.startsWith(
      ".tmp/"
    )
  ) {
    return true;
  }


  return false;
}


/* =========================================================
   ARTIFACT FILE COLLECTION
========================================================= */

async function collectArtifactFiles(
  workspace
) {
  const result = [];


  async function walk(
    directory
  ) {
    const entries =
      await fsp.readdir(
        directory,
        {
          withFileTypes:
            true
        }
      );


    for (
      const entry of entries
    ) {
      const absolute =
        path.join(
          directory,
          entry.name
        );


      const relative =
        path
          .relative(
            workspace,
            absolute
          )
          .replace(
            /\\/g,
            "/"
          );


      if (
        shouldExcludeArtifact(
          relative
        )
      ) {
        continue;
      }


      if (
        entry.isDirectory()
      ) {
        await walk(
          absolute
        );

        continue;
      }


      if (
        !entry.isFile()
      ) {
        continue;
      }


      const stat =
        await fsp.stat(
          absolute
        );


      result.push({
        absolute,

        relative,

        size:
          stat.size
      });
    }
  }


  await walk(
    workspace
  );


  return result;
}


/* =========================================================
   ARTIFACT MANIFEST
========================================================= */

async function createArtifactManifest(
  workspace
) {
  const files =
    await collectArtifactFiles(
      workspace
    );


  let totalSize =
    0;

  const entries = [];


  for (
    const file of files
  ) {
    totalSize +=
      file.size;


    if (
      totalSize >
      MAX_ARTIFACT_SIZE
    ) {
      throw new Error(
        `Build artifact exceeds maximum size of ${MAX_ARTIFACT_SIZE} bytes`
      );
    }


    const content =
      await fsp.readFile(
        file.absolute
      );


    entries.push({
      path:
        file.relative,

      size:
        file.size,

      checksum:
        sha256Buffer(
          content
        )
    });
  }


  entries.sort(
    (a, b) =>
      a.path.localeCompare(
        b.path
      )
  );


  const manifest = {
    version:
      1,

    createdAt:
      new Date().toISOString(),

    fileCount:
      entries.length,

    totalSize,

    files:
      entries
  };


  return {
    manifest,

    fileCount:
      entries.length,

    totalSize
  };
}


/* =========================================================
   WRITE ARTIFACT MANIFEST
========================================================= */

async function writeArtifactManifest(
  workspace,
  manifest
) {
  const metadataDirectory =
    path.join(
      workspace,
      ".zyrionos"
    );


  await fsp.mkdir(
    metadataDirectory,
    {
      recursive:
        true
    }
  );


  const manifestPath =
    path.join(
      metadataDirectory,
      "artifact-manifest.json"
    );


  const raw =
    JSON.stringify(
      manifest,
      null,
      2
    );


  await fsp.writeFile(
    manifestPath,
    raw,
    "utf8"
  );


  return {
    manifestPath,

    checksum:
      sha256String(
        raw
      )
  };
}


/* =========================================================
   TAR ARTIFACT
========================================================= */

async function createTarArtifact(
  workspace,
  destination
) {
  await fsp.mkdir(
    path.dirname(
      destination
    ),
    {
      recursive:
        true
    }
  );


  return new Promise(
    (resolve, reject) => {
      const child =
        spawn(
          "tar",
          [
            "--exclude=node_modules",
            "--exclude=.git",
            "--exclude=.zyrionos",
            "--exclude=.env",
            "--exclude=.env.local",
            "--exclude=.env.production",
            "--exclude=.env.development",
            "--exclude=.env.preview",

            "-czf",
            destination,

            "-C",
            workspace,

            "."
          ],
          {
            stdio: [
              "ignore",
              "pipe",
              "pipe"
            ]
          }
        );


      let stderr =
        "";


      child.stderr.on(
        "data",
        chunk => {
          stderr +=
            chunk.toString();

          if (
            stderr.length >
            10000
          ) {
            stderr =
              stderr.slice(
                -10000
              );
          }
        }
      );


      child.once(
        "error",
        reject
      );


      child.once(
        "close",
        code => {
          if (
            code !== 0
          ) {
            reject(
              new Error(
                stderr ||
                `tar exited with code ${code}`
              )
            );

            return;
          }


          resolve();
        }
      );
    }
  );
}


/* =========================================================
   CHECKSUM
========================================================= */

async function checksumFile(
  filePath
) {
  const hash =
    crypto.createHash(
      "sha256"
    );


  return new Promise(
    (resolve, reject) => {
      const stream =
        fs.createReadStream(
          filePath
        );


      stream.on(
        "data",
        chunk =>
          hash.update(
            chunk
          )
      );


      stream.on(
        "error",
        reject
      );


      stream.on(
        "end",
        () =>
          resolve(
            hash.digest(
              "hex"
            )
          )
      );
    }
  );
}


/* =========================================================
   LOCAL ARTIFACT STORAGE
========================================================= */

async function storeLocalArtifact({
  buildId,
  artifactPath
}) {
  const directory =
    path.join(
      ARTIFACT_ROOT,
      buildId
    );


  await fsp.mkdir(
    directory,
    {
      recursive:
        true
    }
  );


  const destination =
    path.join(
      directory,
      "build.tar.gz"
    );


  await fsp.copyFile(
    artifactPath,
    destination
  );


  const stat =
    await fsp.stat(
      destination
    );


  const checksum =
    await checksumFile(
      destination
    );


  return {
    storageKey:
      `${ARTIFACT_STORAGE_PREFIX}/${buildId}/build.tar.gz`,

    url:
      "",

    localPath:
      destination,

    size:
      stat.size,

    checksum,

    storageType:
      "local"
  };
}


/* =========================================================
   S3 ARTIFACT STORAGE
========================================================= */

async function storeS3Artifact({
  buildId,
  artifactPath
}) {
  if (
    !ARTIFACT_BUCKET
  ) {
    return null;
  }


  let S3Client;
  let PutObjectCommand;


  try {
    const s3 =
      require(
        "@aws-sdk/client-s3"
      );


    S3Client =
      s3.S3Client;

    PutObjectCommand =
      s3.PutObjectCommand;

  } catch {
    throw new Error(
      "S3 artifact storage is configured but @aws-sdk/client-s3 is not installed"
    );
  }


  const client =
    new S3Client({
      region:
        ARTIFACT_REGION
    });


  const key =
    `${ARTIFACT_STORAGE_PREFIX}/${buildId}/build.tar.gz`;


  const body =
    fs.createReadStream(
      artifactPath
    );


  const stat =
    await fsp.stat(
      artifactPath
    );


  await client.send(
    new PutObjectCommand({
      Bucket:
        ARTIFACT_BUCKET,

      Key:
        key,

      Body:
        body,

      ContentLength:
        stat.size,

      ContentType:
        "application/gzip",

      Metadata: {
        buildId,

        serviceVersion:
          SERVICE_VERSION
      }
    })
  );


  const checksum =
    await checksumFile(
      artifactPath
    );


  return {
    storageKey:
      key,

    url:
      `s3://${ARTIFACT_BUCKET}/${key}`,

    size:
      stat.size,

    checksum,

    storageType:
      "s3"
  };
}


/* =========================================================
   ARTIFACT PERSISTENCE
========================================================= */

async function persistArtifact({
  buildId,
  artifactPath
}) {
  if (
    ARTIFACT_BUCKET
  ) {
    return storeS3Artifact({
      buildId,
      artifactPath
    });
  }


  return storeLocalArtifact({
    buildId,
    artifactPath
  });
}


/* =========================================================
   BUILD RECORD
========================================================= */

async function createBuildRecord({
  projectId,
  userId,
  buildId,
  trigger,
  framework,
  runtime,
  nodeVersion,
  packageManager,
  buildCommand,
  outputDirectory,
  sourceHash,
  aiGenerated,
  aiModel,
  promptId
}) {
  const latest =
    await ProjectBuild
      .findOne({
        projectId
      })
      .sort({
        buildNumber:
          -1
      })
      .select({
        buildNumber:
          1
      })
      .lean();


  const buildNumber =
    latest &&
    Number.isFinite(
      latest.buildNumber
    )
      ? latest.buildNumber + 1
      : 1;


  return ProjectBuild.create({
    projectId,

    userId,

    buildId,

    buildNumber,

    status:
      "queued",

    trigger:
      trigger ||
      "manual",

    framework:
      framework ||
      "",

    runtime:
      runtime ||
      "",

    nodeVersion:
      nodeVersion ||
      "",

    packageManager:
      packageManager ||
      "",

    buildCommand:
      buildCommand ||
      "",

    outputDirectory:
      outputDirectory ||
      "",

    aiGenerated:
      Boolean(
        aiGenerated
      ),

    aiModel:
      aiModel ||
      "",

    promptId:
      promptId ||
      "",

    metadata: {
      serviceVersion:
        SERVICE_VERSION,

      sourceHash,

      authoritative:
        true,

      validationMode:
        VALIDATION_MODE
    }
  });
}


/* =========================================================
   BUILD UPDATE
========================================================= */

async function updateBuild(
  build,
  patch
) {
  Object.assign(
    build,
    patch
  );

  await build.save();

  return build;
}


/* =========================================================
   REPAIR CONTEXT
========================================================= */

function createRepairContext({
  buildId,
  sourceHash,
  packageManager,
  failureStage,
  failureCategory,
  retryable,
  errors,
  stdout,
  stderr,
  exitCode,
  signal,
  timedOut,
  buildCommand,
  installCommand
}) {
  const normalizedErrors =
    Array.isArray(
      errors
    )
      ? errors
      : [];


  const affectedFiles =
    [
      ...new Set(
        normalizedErrors
          .map(
            error =>
              error?.file
          )
          .filter(
            Boolean
          )
      )
    ];


  return {
    required:
      true,

    buildId:
      buildId ||
      null,

    sourceHash:
      sourceHash ||
      null,

    packageManager:
      packageManager ||
      "npm",

    buildCommand:
      buildCommand ||
      "",

    installCommand:
      installCommand ||
      "",

    failureStage:
      failureStage ||
      null,

    failureCategory:
      failureCategory ||
      null,

    retryable:
      Boolean(
        retryable
      ),

    timedOut:
      Boolean(
        timedOut
      ),

    exitCode:
      exitCode ??
      null,

    signal:
      signal ||
      null,

    affectedFiles,

    errors:
      normalizedErrors,

    stdout:
      sanitizeBuildOutput(
        stdout
      ),

    stderr:
      sanitizeBuildOutput(
        stderr
      ),

    strategy:
      affectedFiles.length > 0
        ? "repair-affected-files"
        : "analyze-build-output-and-repair"
  };
}


/* =========================================================
   BUILD FAILURE RESULT
========================================================= */

function createFailureResult({
  buildId,
  buildNumber,
  projectId,
  projectName,
  sourceHash,
  framework,
  runtime,
  nodeVersion,
  packageManager,
  buildCommand = "",
  installCommand = "",
  failureStage,
  failureCategory,
  retryable,
  errors,
  stdout,
  stderr,
  exitCode,
  signal,
  timedOut,
  startedAt,
  fileCount,
  totalSize
}) {
  const normalizedErrors =
    Array.isArray(
      errors
    )
      ? errors
      : [];


  return {
    success:
      false,

    status:
      "failed",

    authoritative:
      AUTHORITATIVE,

    validationMode:
      VALIDATION_MODE,

    serviceVersion:
      SERVICE_VERSION,

    buildId,

    buildNumber:
      buildNumber ||
      null,

    projectId,

    projectName,

    sourceHash,

    framework,

    runtime,

    nodeVersion,

    packageManager,

    buildCommand,

    installCommand,

    failureStage,

    failureCategory,

    retryable:
      Boolean(
        retryable
      ),

    errors:
      normalizedErrors,

    warnings: [],

    stdout:
      sanitizeBuildOutput(
        stdout
      ),

    stderr:
      sanitizeBuildOutput(
        stderr
      ),

    exitCode:
      exitCode ??
      null,

    signal:
      signal ||
      null,

    timedOut:
      Boolean(
        timedOut
      ),

    repairContext:
      createRepairContext({
        buildId,

        sourceHash,

        packageManager,

        failureStage,

        failureCategory,

        retryable,

        errors:
          normalizedErrors,

        stdout,

        stderr,

        exitCode,

        signal,

        timedOut,

        buildCommand,

        installCommand
      }),

    summary: {
      durationMs:
        Date.now() -
        startedAt,

      fileCount,

      totalSize
    }
  };
}


/* =========================================================
   FAILURE LOGGING
========================================================= */

function logBuildFailure({
  buildId,
  stage,
  category,
  retryable,
  command,
  installCommand,
  exitCode,
  signal,
  timedOut,
  error,
  stdout,
  stderr
}) {
  logError(
    [
      `[AuthoritativeBuildService] AUTHORITATIVE BUILD FAILURE`,
      `buildId=${buildId}`,
      `stage=${stage || "unknown"}`,
      `category=${category || "unknown"}`,
      `retryable=${Boolean(retryable)}`,
      `timedOut=${Boolean(timedOut)}`,
      `exitCode=${exitCode ?? "null"}`,
      `signal=${signal || "null"}`,
      `installCommand=${safeString(installCommand, 1000)}`,
      `buildCommand=${safeString(command, 1000)}`,
      `error=${safeString(error?.message || "", 4000)}`,
      `stderr=${sanitizeBuildOutput(stderr)}`,
      `stdout=${sanitizeBuildOutput(stdout)}`
    ].join(" | ")
  );
}


/* =========================================================
   TEMP ARTIFACT CLEANUP
========================================================= */

async function cleanupTemporaryArtifact(
  artifactPath
) {
  if (!artifactPath) {
    return;
  }


  try {
    await fsp.rm(
      artifactPath,
      {
        force:
          true
      }
    );
  } catch (error) {
    logWarn(
      `[AuthoritativeBuildService] Temporary artifact cleanup failed: ${error.message}`
    );
  }
}


/* =========================================================
   MAIN EXECUTOR
========================================================= */

async function executeBuild(
  options = {}
) {
  const {
    projectId,

    userId,

    projectName =
      "",

    framework =
      "",

    runtime =
      "",

    files,

    nodeVersion:
      requestedNodeVersion =
        "20",

    packageManager:
      requestedPackageManager =
        "",

    trigger =
      "manual",

    outputDirectory =
      "",

    aiGenerated =
      false,

    aiModel =
      "",

    promptId =
      ""
  } = options;


  const startedAt =
    Date.now();


  const buildId =
    generateBuildId();


  let workspace =
    null;

  let build =
    null;

  let temporaryArtifactPath =
    null;

  let sourceStats = {
    fileCount:
      0,

    totalSize:
      0
  };

  let sourceHash =
    "";

  let packageJson =
    null;

  let nodeVersion =
    resolveNodeVersion(
      requestedNodeVersion
    );

  let packageManager =
    requestedPackageManager;

  let buildCommand =
    "";

  let installCommand =
    "";

  let image =
    "";


  /* =======================================================
     INPUT
  ======================================================= */

  if (!projectId) {
    return createFailureResult({
      buildId,

      projectId:
        null,

      projectName,

      sourceHash:
        calculateSourceHash(
          Array.isArray(files)
            ? files
            : []
        ),

      framework,

      runtime,

      nodeVersion:
        requestedNodeVersion,

      packageManager:
        requestedPackageManager,

      failureStage:
        "input",

      failureCategory:
        "invalid-input",

      retryable:
        false,

      errors: [
        {
          code:
            "PROJECT_ID_REQUIRED",

          message:
            "projectId is required",

          step:
            "input",

          file:
            "",

          line:
            null,

          column:
            null
        }
      ],

      stdout:
        "",

      stderr:
        "",

      startedAt,

      fileCount:
        0,

      totalSize:
        0
    });
  }


  if (!userId) {
    return createFailureResult({
      buildId,

      projectId,

      projectName,

      sourceHash:
        calculateSourceHash(
          Array.isArray(files)
            ? files
            : []
        ),

      framework,

      runtime,

      nodeVersion:
        requestedNodeVersion,

      packageManager:
        requestedPackageManager,

      failureStage:
        "input",

      failureCategory:
        "invalid-input",

      retryable:
        false,

      errors: [
        {
          code:
            "USER_ID_REQUIRED",

          message:
            "userId is required",

          step:
            "input",

          file:
            "",

          line:
            null,

          column:
            null
        }
      ],

      stdout:
        "",

      stderr:
        "",

      startedAt,

      fileCount:
        0,

      totalSize:
        0
    });
  }


  try {
    sourceStats =
      validateFiles(
        files
      );

  } catch (error) {
    return createFailureResult({
      buildId,

      projectId,

      projectName,

      sourceHash:
        calculateSourceHash(
          Array.isArray(files)
            ? files
            : []
        ),

      framework,

      runtime,

      nodeVersion:
        requestedNodeVersion,

      packageManager:
        requestedPackageManager,

      failureStage:
        "input",

      failureCategory:
        "invalid-input",

      retryable:
        false,

      errors: [
        {
          code:
            "INVALID_BUILD_SOURCE",

          message:
            error.message,

          step:
            "input",

          file:
            "",

          line:
            null,

          column:
            null
        }
      ],

      stdout:
        "",

      stderr:
        "",

      startedAt,

      fileCount:
        Array.isArray(files)
          ? files.length
          : 0,

      totalSize:
        0
    });
  }


  sourceHash =
    calculateSourceHash(
      files
    );


  /* =======================================================
     PACKAGE CONFIGURATION
  ======================================================= */

  try {
    packageJson =
      getPackageJson(
        files
      );


    nodeVersion =
      resolveNodeVersion(
        requestedNodeVersion
      );


    packageManager =
      detectPackageManager(
        files,

        requestedPackageManager,

        packageJson
      );


    buildCommand =
      getBuildCommand(
        packageManager,

        packageJson,

        framework
      );


    const locked =
      hasLockfile(
        files,
        packageManager
      );


    installCommand =
      getInstallCommand(
        packageManager,

        locked
      );


    image =
      getNodeImage(
        nodeVersion
      );

  } catch (error) {
    return createFailureResult({
      buildId,

      projectId,

      projectName,

      sourceHash,

      framework,

      runtime,

      nodeVersion,

      packageManager,

      buildCommand,

      installCommand,

      failureStage:
        "configuration",

      failureCategory:
        "configuration",

      retryable:
        false,

      errors: [
        {
          code:
            "BUILD_CONFIGURATION_INVALID",

          message:
            error.message,

          step:
            "configuration",

          file:
            "package.json",

          line:
            null,

          column:
            null
        }
      ],

      stdout:
        "",

      stderr:
        "",

      startedAt,

      fileCount:
        sourceStats.fileCount,

      totalSize:
        sourceStats.totalSize
    });
  }


  /* =======================================================
     EXECUTION
  ======================================================= */

  try {

    /* -------------------------------------------------------
       DOCKER PREFLIGHT
    ------------------------------------------------------- */

    const dockerReady =
      await checkDockerAvailable();


    if (!dockerReady) {
      return createFailureResult({
        buildId,

        projectId,

        projectName,

        sourceHash,

        framework,

        runtime,

        nodeVersion,

        packageManager,

        buildCommand,

        installCommand,

        failureStage:
          "executor",

        failureCategory:
          "runtime",

        retryable:
          true,

        errors: [
          {
            code:
              "DOCKER_UNAVAILABLE",

            message:
              "Docker daemon is unavailable. Authoritative build execution requires Docker.",

            step:
              "executor",

            file:
              "",

            line:
              null,

            column:
              null
          }
        ],

        stdout:
          "",

        stderr:
          "",

        startedAt,

        fileCount:
          sourceStats.fileCount,

        totalSize:
          sourceStats.totalSize
      });
    }


    /* -------------------------------------------------------
       BUILD RECORD
    ------------------------------------------------------- */

    build =
      await createBuildRecord({
        projectId,

        userId,

        buildId,

        trigger,

        framework,

        runtime,

        nodeVersion,

        packageManager,

        buildCommand,

        outputDirectory,

        sourceHash,

        aiGenerated,

        aiModel,

        promptId
      });


    await updateBuild(
      build,
      {
        status:
          "running",

        startedAt:
          new Date(),

        metadata: {
          ...(build.metadata ||
            {}),

          serviceVersion:
            SERVICE_VERSION,

          sourceStats,

          installCommand,

          buildCommand,

          dockerImage:
            image,

          authoritative:
            true,

          validationMode:
            VALIDATION_MODE
        }
      }
    );


    logInfo(
      [
        `[AuthoritativeBuildService] Build started`,
        `buildId=${buildId}`,
        `framework=${framework || "unknown"}`,
        `packageManager=${packageManager}`,
        `nodeVersion=${nodeVersion}`,
        `installCommand=${installCommand}`,
        `buildCommand=${buildCommand}`
      ].join(" | ")
    );


    /* -------------------------------------------------------
       WORKSPACE
    ------------------------------------------------------- */

    workspace =
      await createWorkspace(
        buildId
      );


    await materializeSource(
      files,
      workspace
    );


    /* -------------------------------------------------------
       INSTALL
    ------------------------------------------------------- */

    const installContainerName =
      `zyrionos-install-${buildId}`
        .replace(
          /[^a-zA-Z0-9_.-]/g,
          "-"
        );


    const installResult =
      await runDockerCommand({
        image,

        workspace,

        command:
          installCommand,

        network:
          INSTALL_NETWORK,

        timeoutMs:
          INSTALL_TIMEOUT_MS,

        containerName:
          installContainerName
      });


    if (
      !installResult.success
    ) {
      const failure =
        classifyFailure({
          stage:
            "install",

          stdout:
            installResult.stdout,

          stderr:
            installResult.stderr,

          timedOut:
            installResult.timedOut,

          signal:
            installResult.signal
        });


      const message =
        installResult.timedOut
          ? "Dependency installation timed out."
          : (
              installResult.stderr ||
              installResult.stdout ||
              installResult.error ||
              "Dependency installation failed."
            );


      const error =
        createBuildError({
          code:
            installResult.timedOut
              ? "DEPENDENCY_INSTALL_TIMEOUT"
              : "DEPENDENCY_INSTALL_FAILED",

          message,

          step:
            "dependency-install",

          category:
            failure.category,

          stdout:
            installResult.stdout,

          stderr:
            installResult.stderr,

          retryable:
            failure.retryable
        });


      const result =
        createFailureResult({
          buildId,

          buildNumber:
            build.buildNumber,

          projectId,

          projectName,

          sourceHash,

          framework,

          runtime,

          nodeVersion,

          packageManager,

          buildCommand,

          installCommand,

          failureStage:
            "dependency-install",

          failureCategory:
            failure.category,

          retryable:
            failure.retryable,

          errors: [
            error
          ],

          stdout:
            installResult.stdout,

          stderr:
            installResult.stderr,

          exitCode:
            installResult.exitCode,

          signal:
            installResult.signal,

          timedOut:
            installResult.timedOut,

          startedAt,

          fileCount:
            sourceStats.fileCount,

          totalSize:
            sourceStats.totalSize
        });


      await updateBuild(
        build,
        {
          status:
            "failed",

          completedAt:
            new Date(),

          durationMs:
            result.summary.durationMs,

          errorMessage:
            safeString(
              error.message,
              4000
            ),

          errors: [
            error
          ],

          metadata: {
            ...(build.metadata ||
              {}),

            failureCategory:
              failure.category,

            retryable:
              failure.retryable,

            installOutput: {
              stdout:
                sanitizeBuildOutput(
                  installResult.stdout
                ),

              stderr:
                sanitizeBuildOutput(
                  installResult.stderr
                ),

              exitCode:
                installResult.exitCode,

              signal:
                installResult.signal,

              timedOut:
                installResult.timedOut
            }
          }
        }
      );


      logBuildFailure({
        buildId,

        stage:
          "dependency-install",

        category:
          failure.category,

        retryable:
          failure.retryable,

        command:
          buildCommand,

        installCommand,

        exitCode:
          installResult.exitCode,

        signal:
          installResult.signal,

        timedOut:
          installResult.timedOut,

        error,

        stdout:
          installResult.stdout,

        stderr:
          installResult.stderr
      });


      return result;
    }


    /* -------------------------------------------------------
       AUTHORITATIVE BUILD
    ------------------------------------------------------- */

    const buildContainerName =
      `zyrionos-build-${buildId}`
        .replace(
          /[^a-zA-Z0-9_.-]/g,
          "-"
        );


    const authoritativeResult =
      await runDockerCommand({
        image,

        workspace,

        command:
          buildCommand,

        network:
          BUILD_NETWORK,

        timeoutMs:
          BUILD_TIMEOUT_MS,

        containerName:
          buildContainerName
      });


    if (
      !authoritativeResult.success
    ) {
      const failure =
        classifyFailure({
          stage:
            "build",

          stdout:
            authoritativeResult.stdout,

          stderr:
            authoritativeResult.stderr,

          timedOut:
            authoritativeResult.timedOut,

          signal:
            authoritativeResult.signal
        });


      const message =
        authoritativeResult.timedOut
          ? "Authoritative project build timed out."
          : (
              authoritativeResult.stderr ||
              authoritativeResult.stdout ||
              authoritativeResult.error ||
              "Authoritative project build failed."
            );


      const error =
        createBuildError({
          code:
            authoritativeResult.timedOut
              ? "AUTHORITATIVE_BUILD_TIMEOUT"
              : "AUTHORITATIVE_BUILD_FAILED",

          message,

          step:
            "build",

          category:
            failure.category,

          stdout:
            authoritativeResult.stdout,

          stderr:
            authoritativeResult.stderr,

          retryable:
            failure.retryable
        });


      const result =
        createFailureResult({
          buildId,

          buildNumber:
            build.buildNumber,

          projectId,

          projectName,

          sourceHash,

          framework,

          runtime,

          nodeVersion,

          packageManager,

          buildCommand,

          installCommand,

          failureStage:
            "build",

          failureCategory:
            failure.category,

          retryable:
            failure.retryable,

          errors: [
            error
          ],

          stdout:
            authoritativeResult.stdout,

          stderr:
            authoritativeResult.stderr,

          exitCode:
            authoritativeResult.exitCode,

          signal:
            authoritativeResult.signal,

          timedOut:
            authoritativeResult.timedOut,

          startedAt,

          fileCount:
            sourceStats.fileCount,

          totalSize:
            sourceStats.totalSize
        });


      await updateBuild(
        build,
        {
          status:
            "failed",

          completedAt:
            new Date(),

          durationMs:
            result.summary.durationMs,

          errorMessage:
            safeString(
              error.message,
              4000
            ),

          errors: [
            error
          ],

          metadata: {
            ...(build.metadata ||
              {}),

            failureCategory:
              failure.category,

            retryable:
              failure.retryable,

            buildOutput: {
              stdout:
                sanitizeBuildOutput(
                  authoritativeResult.stdout
                ),

              stderr:
                sanitizeBuildOutput(
                  authoritativeResult.stderr
                ),

              exitCode:
                authoritativeResult.exitCode,

              signal:
                authoritativeResult.signal,

              timedOut:
                authoritativeResult.timedOut,

              file:
                error.file,

              line:
                error.line,

              column:
                error.column
            }
          }
        }
      );


      logBuildFailure({
        buildId,

        stage:
          "build",

        category:
          failure.category,

        retryable:
          failure.retryable,

        command:
          buildCommand,

        installCommand,

        exitCode:
          authoritativeResult.exitCode,

        signal:
          authoritativeResult.signal,

        timedOut:
          authoritativeResult.timedOut,

        error,

        stdout:
          authoritativeResult.stdout,

        stderr:
          authoritativeResult.stderr
      });


      return result;
    }


    /* -------------------------------------------------------
       ARTIFACT MANIFEST
    ------------------------------------------------------- */

    const manifestResult =
      await createArtifactManifest(
        workspace
      );


    const manifestFile =
      await writeArtifactManifest(
        workspace,

        {
          ...manifestResult.manifest,

          buildId,

          sourceHash,

          framework,

          nodeVersion,

          packageManager,

          outputDirectory:
            outputDirectory ||
            "",

          serviceVersion:
            SERVICE_VERSION
        }
      );


    /* -------------------------------------------------------
       CREATE TARBALL
    ------------------------------------------------------- */

    temporaryArtifactPath =
      path.join(
        os.tmpdir(),
        `${buildId}.tar.gz`
      );


    await createTarArtifact(
      workspace,
      temporaryArtifactPath
    );


    const artifactStat =
      await fsp.stat(
        temporaryArtifactPath
      );


    if (
      artifactStat.size >
      MAX_ARTIFACT_SIZE
    ) {
      throw new Error(
        `Build artifact exceeds maximum allowed size of ${MAX_ARTIFACT_SIZE} bytes`
      );
    }


    const artifact =
      await persistArtifact({
        buildId,

        artifactPath:
          temporaryArtifactPath
      });


    const artifactRecord = {
      name:
        "build.tar.gz",

      type:
        "build",

      storageKey:
        artifact.storageKey,

      url:
        artifact.url ||
        "",

      size:
        artifact.size,

      checksum:
        artifact.checksum
    };


    /* -------------------------------------------------------
       SUCCESS
    ------------------------------------------------------- */

    const durationMs =
      Date.now() -
      startedAt;


    await updateBuild(
      build,
      {
        status:
          "success",

        completedAt:
          new Date(),

        artifacts: [
          artifactRecord
        ],

        artifactCount:
          1,

        outputSize:
          artifact.size,

        errorMessage:
          "",

        errors: [],

        durationMs,

        metadata: {
          ...(build.metadata ||
            {}),

          authoritative:
            true,

          validationMode:
            VALIDATION_MODE,

          artifact: {
            manifestVersion:
              manifestResult
                .manifest
                .version,

            fileCount:
              manifestResult
                .fileCount,

            totalSourceSize:
              manifestResult
                .totalSize,

            manifestChecksum:
              manifestFile
                .checksum,

            artifactChecksum:
              artifact.checksum,

            storageType:
              artifact.storageType,

            outputDirectory:
              outputDirectory ||
              ""
          },

          buildOutput: {
            stdout:
              sanitizeBuildOutput(
                authoritativeResult.stdout
              ),

            stderr:
              sanitizeBuildOutput(
                authoritativeResult.stderr
              ),

            exitCode:
              authoritativeResult.exitCode,

            signal:
              authoritativeResult.signal
          }
        }
      }
    );


    await cleanupTemporaryArtifact(
      temporaryArtifactPath
    );

    temporaryArtifactPath =
      null;


    logInfo(
      [
        `[AuthoritativeBuildService] Build passed`,
        `buildId=${buildId}`,
        `buildCommand=${buildCommand}`,
        `durationMs=${durationMs}`,
        `artifact=${artifact.storageKey}`
      ].join(" | ")
    );


    return {
      success:
        true,

      status:
        "success",

      authoritative:
        true,

      validationMode:
        "authoritative",

      serviceVersion:
        SERVICE_VERSION,

      buildId,

      buildNumber:
        build.buildNumber,

      projectId,

      projectName,

      sourceHash,

      framework,

      runtime,

      nodeVersion,

      packageManager,

      buildCommand,

      installCommand,

      outputDirectory:
        outputDirectory ||
        "",

      artifact: {
        name:
          artifactRecord.name,

        type:
          artifactRecord.type,

        storageKey:
          artifactRecord.storageKey,

        url:
          artifactRecord.url,

        size:
          artifactRecord.size,

        checksum:
          artifactRecord.checksum,

        storageType:
          artifact.storageType,

        fileCount:
          manifestResult.fileCount
      },

      repairContext:
        null,

      errors: [],

      warnings: [],

      durationMs,

      metadata: {
        dependenciesInstalled:
          true,

        buildCommandExecuted:
          true,

        generatedCodeExecuted:
          true,

        dockerIsolated:
          true,

        artifactCreated:
          true,

        runtimeStarted:
          false,

        browserSmokeTested:
          false
      },

      summary:
        "Authoritative build completed successfully and a verified artifact was created."
    };

  } catch (error) {

    /* -------------------------------------------------------
       FATAL EXECUTOR ERROR
    ------------------------------------------------------- */

    logError(
      [
        `[AuthoritativeBuildService] Fatal error`,
        `buildId=${buildId}`,
        `message=${safeString(error.message, 4000)}`
      ].join(" | ")
    );


    const category =
      error.category ||
      "service";


    const fatalError =
      createBuildError({
        code:
          error.code ||
          "AUTHORITATIVE_BUILD_SERVICE_ERROR",

        message:
          error.message ||
          "Authoritative build service failed.",

        step:
          error.step ||
          "executor",

        category,

        stdout:
          error.stdout ||
          "",

        stderr:
          error.stderr ||
          "",

        retryable:
          Boolean(
            error.retryable
          )
      });


    if (
      error.file
    ) {
      fatalError.file =
        error.file;
    }

    if (
      Number.isFinite(
        error.line
      )
    ) {
      fatalError.line =
        error.line;
    }

    if (
      Number.isFinite(
        error.column
      )
    ) {
      fatalError.column =
        error.column;
    }


    const result =
      createFailureResult({
        buildId,

        buildNumber:
          build?.buildNumber,

        projectId,

        projectName,

        sourceHash,

        framework,

        runtime,

        nodeVersion,

        packageManager,

        buildCommand,

        installCommand,

        failureStage:
          error.step ||
          "executor",

        failureCategory:
          category,

        retryable:
          Boolean(
            error.retryable
          ),

        errors: [
          fatalError
        ],

        stdout:
          error.stdout ||
          "",

        stderr:
          error.stderr ||
          "",

        exitCode:
          error.exitCode,

        signal:
          error.signal,

        timedOut:
          error.timedOut,

        startedAt,

        fileCount:
          sourceStats.fileCount,

        totalSize:
          sourceStats.totalSize
      });


    if (build) {
      try {
        await updateBuild(
          build,
          {
            status:
              "failed",

            completedAt:
              new Date(),

            durationMs:
              result.summary
                .durationMs,

            errorMessage:
              safeString(
                fatalError.message,
                4000
              ),

            errors: [
              fatalError
            ],

            metadata: {
              ...(build.metadata ||
                {}),

              failureCategory:
                category,

              retryable:
                Boolean(
                  error.retryable
                ),

              buildCommand:
                buildCommand ||
                "",

              installCommand:
                installCommand ||
                ""
            }
          }
        );
      } catch (dbError) {
        logError(
          `[AuthoritativeBuildService] Failed to persist build failure: ${dbError.message}`
        );
      }
    }


    return result;

  } finally {

    await cleanupTemporaryArtifact(
      temporaryArtifactPath
    );

    await cleanupWorkspace(
      workspace
    );
  }
}


/* =========================================================
   CONCURRENCY QUEUE
========================================================= */

function acquireBuildSlot() {
  if (
    activeBuilds <
    MAX_CONCURRENT_BUILDS
  ) {
    activeBuilds++;

    return Promise.resolve();
  }


  return new Promise(
    resolve => {
      buildQueue.push(
        resolve
      );
    }
  );
}


function releaseBuildSlot() {
  activeBuilds =
    Math.max(
      0,
      activeBuilds - 1
    );


  const next =
    buildQueue.shift();


  if (next) {
    activeBuilds++;
    next();
  }
}


/* =========================================================
   PUBLIC BUILD API
========================================================= */

async function buildProject(
  options
) {
  await acquireBuildSlot();


  try {
    return await executeBuild(
      options
    );
  } finally {
    releaseBuildSlot();
  }
}


/* =========================================================
   ARTIFACT CHECKSUM VERIFICATION
========================================================= */

async function verifyArtifactChecksum(
  artifactPath,
  expectedChecksum
) {
  if (
    !artifactPath ||
    !expectedChecksum
  ) {
    return false;
  }


  try {
    await fsp.access(
      artifactPath,
      fs.constants.F_OK
    );
  } catch {
    return false;
  }


  const actual =
    await checksumFile(
      artifactPath
    );


  return (
    actual ===
    expectedChecksum
  );
}


/* =========================================================
   AUTHORITATIVE BUILD READY
========================================================= */

function isAuthoritativeBuildReady(
  result
) {
  return Boolean(
    result &&

    result.success ===
      true &&

    result.status ===
      "success" &&

    result.authoritative ===
      true &&

    result.validationMode ===
      "authoritative" &&

    result.buildId &&

    result.artifact &&

    result.artifact.storageKey &&

    result.artifact.checksum
  );
}


/* =========================================================
   ARTIFACT LOOKUP
========================================================= */

async function getBuildArtifact({
  projectId,
  userId,
  buildId
}) {
  if (
    !projectId ||
    !userId ||
    !buildId
  ) {
    throw new Error(
      "projectId, userId and buildId are required"
    );
  }


  const build =
    await ProjectBuild
      .findOne({
        projectId,

        userId,

        buildId,

        status:
          "success"
      })
      .lean();


  if (!build) {
    throw new Error(
      "Successful authoritative build not found"
    );
  }


  if (
    build.metadata?.authoritative !==
      true
  ) {
    throw new Error(
      "Requested build is not authoritative"
    );
  }


  if (
    build.metadata?.validationMode !==
      "authoritative"
  ) {
    throw new Error(
      "Requested build is not authoritative"
    );
  }


  if (
    !Array.isArray(
      build.artifacts
    ) ||
    build.artifacts.length ===
      0
  ) {
    throw new Error(
      "Authoritative build has no artifact"
    );
  }


  const artifact =
    build.artifacts.find(
      item =>
        item.type ===
        "build"
    ) ||
    build.artifacts[0];


  if (
    !artifact.storageKey ||
    !artifact.checksum
  ) {
    throw new Error(
      "Build artifact metadata is incomplete"
    );
  }


  return {
    buildId:
      build.buildId,

    buildNumber:
      build.buildNumber,

    projectId:
      build.projectId,

    userId:
      build.userId,

    sourceHash:
      build.metadata?.sourceHash ||
      "",

    outputDirectory:
      build.outputDirectory ||
      "",

    framework:
      build.framework ||
      "",

    packageManager:
      build.packageManager ||
      "",

    artifact
  };
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  SERVICE_VERSION,

  VALIDATION_MODE,

  AUTHORITATIVE,

  buildProject,

  executeBuild,

  isAuthoritativeBuildReady,

  getBuildArtifact,

  verifyArtifactChecksum,

  calculateSourceHash,

  validateFiles,

  detectPackageManager,

  getBuildCommand,

  getInstallCommand,

  resolveNodeVersion,

  normalizeFilePath,

  sanitizeFilePath
};
