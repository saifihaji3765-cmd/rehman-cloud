"use strict";

/**
 * =========================================================
 * ZYRIONOS — BUILD VALIDATION SERVICE
 * =========================================================
 *
 * Version: 2.0.0
 *
 * PURPOSE
 * ---------------------------------------------------------
 * Static pre-build validation only.
 *
 * THIS SERVICE MUST NOT:
 *
 * - Execute generated application code
 * - Run Docker
 * - Install dependencies
 * - Run npm/yarn/pnpm/bun build
 * - Start servers
 * - Create deployment artifacts
 * - Deploy projects
 *
 * ARCHITECTURE
 * ---------------------------------------------------------
 *
 * Builder Agent
 *      ↓
 * BuildValidationService
 *      ↓
 * AuthoritativeBuildService
 *      ↓
 * Docker Install
 *      ↓
 * Real Build
 *      ↓
 * PASS ─────────────→ Artifact / Preview
 *      ↓
 * FAIL
 *      ↓
 * Fix Agent
 *      ↓
 * Rebuild
 *
 * IMPORTANT
 * ---------------------------------------------------------
 * Static validation is NEVER authoritative.
 *
 * authoritative: false
 * validationMode: "static"
 *
 * =========================================================
 */


/* =========================================================
   PACKAGES
========================================================= */

const crypto = require("crypto");


/* =========================================================
   METADATA
========================================================= */

const SERVICE_VERSION = "2.0.0";

const VALIDATION_MODE = "static";

const AUTHORITATIVE = false;


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILES =
  Number(
    process.env.BUILD_VALIDATION_MAX_FILES ||
    1000
  );

const MAX_FILE_SIZE =
  Number(
    process.env.BUILD_VALIDATION_MAX_FILE_SIZE ||
    2 * 1024 * 1024
  );

const MAX_SOURCE_SIZE =
  Number(
    process.env.BUILD_VALIDATION_MAX_SOURCE_SIZE ||
    25 * 1024 * 1024
  );

const MAX_PATH_LENGTH =
  Number(
    process.env.BUILD_VALIDATION_MAX_PATH_LENGTH ||
    500
  );

const MAX_ERRORS =
  Number(
    process.env.BUILD_VALIDATION_MAX_ERRORS ||
    100
  );

const MAX_WARNINGS =
  Number(
    process.env.BUILD_VALIDATION_MAX_WARNINGS ||
    100
  );

const MAX_IMPORTS_TO_CHECK =
  Number(
    process.env.BUILD_VALIDATION_MAX_IMPORTS ||
    500
  );


/* =========================================================
   BASIC HELPERS
========================================================= */

function toString(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}


function normalizeFilePath(
  filePath
) {
  let value =
    toString(filePath)
      .trim()
      .replace(/\\/g, "/");

  while (
    value.startsWith("./")
  ) {
    value = value.slice(2);
  }

  while (
    value.includes("//")
  ) {
    value =
      value.replace(
        /\/+/g,
        "/"
      );
  }

  return value;
}


function isSafeFilePath(
  filePath
) {
  const normalized =
    normalizeFilePath(filePath);

  if (!normalized) {
    return false;
  }

  if (
    normalized.length >
    MAX_PATH_LENGTH
  ) {
    return false;
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("\\")
  ) {
    return false;
  }

  if (
    /^[A-Za-z]:/.test(
      normalized
    )
  ) {
    return false;
  }

  if (
    normalized.includes("\0")
  ) {
    return false;
  }

  const segments =
    normalized.split("/");

  if (
    segments.includes("..")
  ) {
    return false;
  }

  return true;
}


function getFilePath(
  file
) {
  if (
    !file ||
    typeof file !== "object"
  ) {
    return "";
  }

  return normalizeFilePath(
    file.path ||
    file.filePath ||
    file.name ||
    file.relativePath ||
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
    typeof file.content === "string"
  ) {
    return file.content;
  }

  if (
    typeof file.source === "string"
  ) {
    return file.source;
  }

  if (
    typeof file.code === "string"
  ) {
    return file.code;
  }

  return "";
}


function getByteSize(
  content
) {
  return Buffer.byteLength(
    toString(content),
    "utf8"
  );
}


function getExtension(
  filePath
) {
  const value =
    normalizeFilePath(
      filePath
    );

  const index =
    value.lastIndexOf(".");

  if (
    index === -1
  ) {
    return "";
  }

  return value
    .slice(index)
    .toLowerCase();
}


function isSourceFile(
  filePath
) {
  return [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".vue",
    ".svelte",
    ".css",
    ".scss",
    ".less",
    ".html",
    ".json"
  ].includes(
    getExtension(filePath)
  );
}


function isCodeFile(
  filePath
) {
  return [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".vue",
    ".svelte"
  ].includes(
    getExtension(filePath)
  );
}


/* =========================================================
   SOURCE HASH
========================================================= */

function calculateSourceHash(
  files
) {
  const hash =
    crypto.createHash(
      "sha256"
    );

  const normalized =
    Array.isArray(files)
      ? files
          .map(file => ({
            path:
              getFilePath(file),

            content:
              getFileContent(file)
          }))
          .sort(
            (a, b) =>
              a.path.localeCompare(
                b.path
              )
          )
      : [];

  for (
    const file of normalized
  ) {
    hash.update(
      file.path
    );

    hash.update(
      "\n"
    );

    hash.update(
      file.content
    );

    hash.update(
      "\n---FILE---\n"
    );
  }

  return hash.digest(
    "hex"
  );
}


/* =========================================================
   LOCATION HELPERS
========================================================= */

function getLineColumn(
  source,
  offset
) {
  if (
    !source ||
    !Number.isFinite(offset) ||
    offset < 0
  ) {
    return {
      line: null,
      column: null
    };
  }

  const before =
    source.slice(
      0,
      offset
    );

  const line =
    before.split("\n").length;

  const lastNewLine =
    before.lastIndexOf("\n");

  const column =
    lastNewLine === -1
      ? offset + 1
      : offset - lastNewLine;

  return {
    line,
    column
  };
}


/* =========================================================
   ISSUE FACTORIES
========================================================= */

function createError({
  code,
  message,
  file = "",
  line = null,
  column = null,
  details = null
}) {
  return {
    code,
    message,
    severity: "error",
    stage: "static-validation",
    file: file || "",
    line:
      Number.isFinite(line)
        ? line
        : null,
    column:
      Number.isFinite(column)
        ? column
        : null,
    details
  };
}


function createWarning({
  code,
  message,
  file = "",
  line = null,
  column = null,
  details = null
}) {
  return {
    code,
    message,
    severity: "warning",
    stage: "static-validation",
    file: file || "",
    line:
      Number.isFinite(line)
        ? line
        : null,
    column:
      Number.isFinite(column)
        ? column
        : null,
    details
  };
}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeFiles(
  files
) {
  if (
    !Array.isArray(files)
  ) {
    return [];
  }

  return files.map(
    file => ({
      ...file,

      path:
        getFilePath(file),

      content:
        getFileContent(file)
    })
  );
}


/* =========================================================
   FILE VALIDATION
========================================================= */

function validateFiles(
  files,
  errors,
  warnings
) {
  if (
    !Array.isArray(files)
  ) {
    errors.push(
      createError({
        code:
          "FILES_NOT_ARRAY",

        message:
          "Project files must be an array."
      })
    );

    return {
      fileCount: 0,
      totalSize: 0
    };
  }


  if (
    files.length === 0
  ) {
    errors.push(
      createError({
        code:
          "NO_PROJECT_FILES",

        message:
          "No generated project files were supplied."
      })
    );

    return {
      fileCount: 0,
      totalSize: 0
    };
  }


  if (
    files.length >
    MAX_FILES
  ) {
    errors.push(
      createError({
        code:
          "FILE_COUNT_LIMIT_EXCEEDED",

        message:
          `Project contains ${files.length} files. Maximum allowed is ${MAX_FILES}.`,

        details: {
          count:
            files.length,

          maximum:
            MAX_FILES
        }
      })
    );
  }


  const seen =
    new Set();

  let totalSize = 0;


  for (
    const file of files
  ) {
    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);


    if (!filePath) {
      errors.push(
        createError({
          code:
            "FILE_PATH_MISSING",

          message:
            "Generated file is missing a path."
        })
      );

      continue;
    }


    if (
      !isSafeFilePath(
        filePath
      )
    ) {
      errors.push(
        createError({
          code:
            "UNSAFE_FILE_PATH",

          message:
            `Unsafe project file path: ${filePath}`,

          file:
            filePath
        })
      );

      continue;
    }


    if (
      seen.has(
        filePath
      )
    ) {
      errors.push(
        createError({
          code:
            "DUPLICATE_FILE_PATH",

          message:
            `Duplicate project file detected: ${filePath}`,

          file:
            filePath
        })
      );
    }

    seen.add(
      filePath
    );


    const size =
      getByteSize(
        content
      );

    totalSize +=
      size;


    if (
      size >
      MAX_FILE_SIZE
    ) {
      errors.push(
        createError({
          code:
            "FILE_SIZE_LIMIT_EXCEEDED",

          message:
            `File exceeds the maximum allowed size of ${MAX_FILE_SIZE} bytes.`,

          file:
            filePath,

          details: {
            size,

            maximum:
              MAX_FILE_SIZE
          }
        })
      );
    }


    if (
      isSourceFile(filePath) &&
      content.trim().length === 0
    ) {
      errors.push(
        createError({
          code:
            "EMPTY_SOURCE_FILE",

          message:
            "Source file is empty.",

          file:
            filePath
        })
      );
    }


    if (
      content.includes("\0")
    ) {
      errors.push(
        createError({
          code:
            "NULL_BYTE_IN_SOURCE",

          message:
            "Source contains a null byte.",

          file:
            filePath
        })
      );
    }
  }


  if (
    totalSize >
    MAX_SOURCE_SIZE
  ) {
    errors.push(
      createError({
        code:
          "SOURCE_SIZE_LIMIT_EXCEEDED",

        message:
          `Project source exceeds the maximum allowed size of ${MAX_SOURCE_SIZE} bytes.`,

        details: {
          size:
            totalSize,

          maximum:
            MAX_SOURCE_SIZE
        }
      })
    );
  }


  return {
    fileCount:
      files.length,

    totalSize
  };
}


/* =========================================================
   PACKAGE.JSON
========================================================= */

function findPackageJson(
  files
) {
  return files.find(
    file =>
      getFilePath(file) ===
      "package.json"
  );
}


function parsePackageJson(
  files,
  errors
) {
  const packageFile =
    findPackageJson(
      files
    );

  if (!packageFile) {
    return {
      exists:
        false,

      value:
        null
    };
  }


  const content =
    getFileContent(
      packageFile
    );


  try {
    const parsed =
      JSON.parse(
        content
      );


    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      errors.push(
        createError({
          code:
            "PACKAGE_JSON_INVALID_ROOT",

          message:
            "package.json must contain a JSON object.",

          file:
            "package.json"
        })
      );

      return {
        exists:
          true,

        value:
          null
      };
    }


    return {
      exists:
        true,

      value:
        parsed
    };

  } catch (error) {

    const match =
      /position\s+(\d+)/i.exec(
        toString(
          error.message
        )
      );

    const position =
      match
        ? Number(match[1])
        : null;

    const location =
      position !== null
        ? getLineColumn(
            content,
            position
          )
        : {
            line:
              null,

            column:
              null
          };


    errors.push(
      createError({
        code:
          "PACKAGE_JSON_INVALID",

        message:
          `package.json contains invalid JSON: ${toString(
            error.message
          )}`,

        file:
          "package.json",

        line:
          location.line,

        column:
          location.column
      })
    );


    return {
      exists:
        true,

      value:
        null
    };
  }
}


/* =========================================================
   PACKAGE VALIDATION
========================================================= */

function validatePackageJson(
  packageJson,
  errors,
  warnings
) {
  if (
    !packageJson
  ) {
    return;
  }


  if (
    packageJson.name !== undefined &&
    typeof packageJson.name !== "string"
  ) {
    errors.push(
      createError({
        code:
          "PACKAGE_NAME_INVALID",

        message:
          "package.json name must be a string.",

        file:
          "package.json"
      })
    );
  }


  if (
    packageJson.scripts !== undefined &&
    (
      typeof packageJson.scripts !== "object" ||
      Array.isArray(packageJson.scripts) ||
      packageJson.scripts === null
    )
  ) {
    errors.push(
      createError({
        code:
          "PACKAGE_SCRIPTS_INVALID",

        message:
          "package.json scripts must be an object.",

        file:
          "package.json"
      })
    );
  }


  const dependencyGroups = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies"
  ];


  for (
    const group of dependencyGroups
  ) {
    if (
      packageJson[group] !== undefined &&
      (
        typeof packageJson[group] !== "object" ||
        Array.isArray(packageJson[group]) ||
        packageJson[group] === null
      )
    ) {
      errors.push(
        createError({
          code:
            "DEPENDENCY_SECTION_INVALID",

          message:
            `package.json ${group} must be an object.`,

          file:
            "package.json"
        })
      );
    }
  }


  if (
    packageJson.engines &&
    typeof packageJson.engines === "object" &&
    packageJson.engines.node &&
    typeof packageJson.engines.node !== "string"
  ) {
    errors.push(
      createError({
        code:
          "NODE_ENGINE_INVALID",

        message:
          "package.json engines.node must be a string.",

        file:
          "package.json"
      })
    );
  }


  if (
    packageJson.private !== undefined &&
    typeof packageJson.private !== "boolean"
  ) {
    errors.push(
      createError({
        code:
          "PACKAGE_PRIVATE_INVALID",

        message:
          "package.json private must be boolean.",

        file:
          "package.json"
      })
    );
  }


  if (
    !packageJson.scripts ||
    typeof packageJson.scripts !== "object"
  ) {
    warnings.push(
      createWarning({
        code:
          "NO_SCRIPTS_SECTION",

        message:
          "package.json does not define a scripts section.",

        file:
          "package.json"
      })
    );
  }
}


/* =========================================================
   PACKAGE MANAGER DETECTION
========================================================= */

function detectPackageManager(
  files,
  packageJson = null
) {
  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
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
      "bun.lockb"
    ) ||
    paths.has(
      "bun.lock"
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


  const packageManager =
    packageJson &&
    typeof packageJson.packageManager ===
      "string"
      ? packageJson.packageManager
      : "";


  const normalized =
    packageManager
      .trim()
      .toLowerCase();


  if (
    normalized.startsWith(
      "pnpm@"
    )
  ) {
    return "pnpm";
  }


  if (
    normalized.startsWith(
      "yarn@"
    )
  ) {
    return "yarn";
  }


  if (
    normalized.startsWith(
      "bun@"
    )
  ) {
    return "bun";
  }


  if (
    normalized.startsWith(
      "npm@"
    )
  ) {
    return "npm";
  }


  return "npm";
}


/* =========================================================
   FRAMEWORK DETECTION
========================================================= */

function detectFramework(
  packageJson,
  files
) {
  const dependencies = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
    ...(packageJson?.peerDependencies || {})
  };


  const paths =
    files.map(
      file =>
        getFilePath(file)
    );


  if (
    dependencies.next
  ) {
    return "next";
  }


  if (
    dependencies.vue
  ) {
    return "vue";
  }


  if (
    dependencies.svelte ||
    dependencies["@sveltejs/kit"]
  ) {
    return "svelte";
  }


  if (
    dependencies.react ||
    dependencies["react-dom"]
  ) {
    return "react";
  }


  if (
    dependencies.express ||
    dependencies.fastify ||
    dependencies.koa ||
    dependencies["@nestjs/core"]
  ) {
    return "node";
  }


  if (
    paths.some(
      file =>
        file === "index.html"
    ) &&
    paths.some(
      file =>
        file.startsWith("src/")
    )
  ) {
    return "web";
  }


  return "generic";
}


/* =========================================================
   REQUIRED FILE VALIDATION
========================================================= */

function validateRequiredFiles(
  files,
  packageJson,
  framework,
  errors,
  warnings
) {
  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );


  const hasPackageJson =
    paths.has(
      "package.json"
    );


  const requiresPackageJson =
    Boolean(packageJson) ||
    [
      "react",
      "next",
      "vue",
      "svelte",
      "node"
    ].includes(
      framework
    );


  if (
    requiresPackageJson &&
    !hasPackageJson
  ) {
    errors.push(
      createError({
        code:
          "PACKAGE_JSON_MISSING",

        message:
          `package.json is required for ${framework} projects.`,

        file:
          "package.json"
      })
    );
  }


  if (
    framework === "react" ||
    framework === "web"
  ) {
    const hasSource =
      files.some(
        file =>
          /^src\/.+\.(js|jsx|ts|tsx)$/.test(
            getFilePath(file)
          )
      );


    if (!hasSource) {
      warnings.push(
        createWarning({
          code:
            "SOURCE_ENTRY_NOT_DETECTED",

          message:
            "No conventional src JavaScript/TypeScript source file was detected."
        })
      );
    }
  }


  if (
    framework === "next"
  ) {
    const hasApp =
      files.some(
        file =>
          /^app\/.+\.(js|jsx|ts|tsx)$/.test(
            getFilePath(file)
          )
      );


    const hasPages =
      files.some(
        file =>
          /^pages\/.+\.(js|jsx|ts|tsx)$/.test(
            getFilePath(file)
          )
      );


    if (
      !hasApp &&
      !hasPages
    ) {
      errors.push(
        createError({
          code:
            "NEXT_ENTRY_MISSING",

          message:
            "Next.js project does not contain an app/ or pages/ source tree."
        })
      );
    }
  }


  if (
    framework === "vue"
  ) {
    const hasVue =
      files.some(
        file =>
          getExtension(
            getFilePath(file)
          ) === ".vue"
      );


    if (!hasVue) {
      errors.push(
        createError({
          code:
            "VUE_SOURCE_MISSING",

          message:
            "Vue project does not contain any .vue source files."
        })
      );
    }
  }


  if (
    framework === "node"
  ) {
    const conventionalEntries = [
      "server.js",
      "app.js",
      "index.js",
      "main.js",
      "src/server.js",
      "src/app.js",
      "src/index.js",
      "src/main.js"
    ];


    const hasEntry =
      conventionalEntries.some(
        entry =>
          paths.has(entry)
      );


    if (!hasEntry) {
      warnings.push(
        createWarning({
          code:
            "NODE_ENTRY_NOT_DETECTED",

          message:
            "No conventional Node.js server entry file was detected."
        })
      );
    }
  }
}


/* =========================================================
   BUILD SCRIPT VALIDATION
========================================================= */

function validateBuildScript(
  packageJson,
  errors,
  warnings
) {
  if (
    !packageJson
  ) {
    return;
  }


  const scripts =
    packageJson.scripts;


  if (
    !scripts ||
    typeof scripts !== "object"
  ) {
    warnings.push(
      createWarning({
        code:
          "BUILD_SCRIPT_MISSING",

        message:
          "No build script is defined. Authoritative build may not be possible.",

        file:
          "package.json"
      })
    );

    return;
  }


  if (
    scripts.build === undefined
  ) {
    warnings.push(
      createWarning({
        code:
          "BUILD_SCRIPT_MISSING",

        message:
          "package.json does not contain a build script. Authoritative build may not be possible.",

        file:
          "package.json"
      })
    );

    return;
  }


  if (
    typeof scripts.build !== "string" ||
    !scripts.build.trim()
  ) {
    errors.push(
      createError({
        code:
          "BUILD_SCRIPT_INVALID",

        message:
          "package.json scripts.build must be a non-empty string.",

        file:
          "package.json"
      })
    );
  }
}


/* =========================================================
   LOCKFILE VALIDATION
========================================================= */

function validateLockfiles(
  files,
  packageManager,
  warnings
) {
  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );


  const lockfiles = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb"
  ];


  const existing =
    lockfiles.filter(
      lockfile =>
        paths.has(lockfile)
    );


  if (
    existing.length > 1
  ) {
    warnings.push(
      createWarning({
        code:
          "MULTIPLE_LOCKFILES",

        message:
          `Multiple package-manager lockfiles detected: ${existing.join(
            ", "
          )}`,

        details: {
          detectedPackageManager:
            packageManager,

          lockfiles:
            existing
        }
      })
    );
  }
}


/* =========================================================
   FRAMEWORK DEPENDENCY VALIDATION
========================================================= */

function validateFrameworkDependencies(
  packageJson,
  framework,
  errors,
  warnings
) {
  if (
    !packageJson
  ) {
    return;
  }


  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {})
  };


  if (
    framework === "react" &&
    !dependencies.react
  ) {
    warnings.push(
      createWarning({
        code:
          "REACT_DEPENDENCY_NOT_FOUND",

        message:
          "React source/dependencies were detected, but react is not declared in package.json.",

        file:
          "package.json"
      })
    );
  }


  if (
    framework === "next" &&
    !dependencies.next
  ) {
    warnings.push(
      createWarning({
        code:
          "NEXT_DEPENDENCY_NOT_FOUND",

        message:
          "Next.js structure was detected, but next is not declared in package.json.",

        file:
          "package.json"
      })
    );
  }


  if (
    framework === "vue" &&
    !dependencies.vue
  ) {
    warnings.push(
      createWarning({
        code:
          "VUE_DEPENDENCY_NOT_FOUND",

        message:
          "Vue source was detected, but vue is not declared in package.json.",

        file:
          "package.json"
      })
    );
  }


  if (
    framework === "svelte" &&
    !(
      dependencies.svelte ||
      dependencies["@sveltejs/kit"]
    )
  ) {
    warnings.push(
      createWarning({
        code:
          "SVELTE_DEPENDENCY_NOT_FOUND",

        message:
          "Svelte source was detected, but no Svelte dependency is declared.",

        file:
          "package.json"
      })
    );
  }
}


/* =========================================================
   JSON VALIDATION
========================================================= */

function validateJsonFiles(
  files,
  errors
) {
  for (
    const file of files
  ) {
    const filePath =
      getFilePath(file);


    if (
      getExtension(
        filePath
      ) !== ".json" ||
      filePath === "package.json"
    ) {
      continue;
    }


    const content =
      getFileContent(file);


    try {
      JSON.parse(
        content
      );
    } catch (error) {

      const match =
        /position\s+(\d+)/i.exec(
          toString(
            error.message
          )
        );


      const position =
        match
          ? Number(match[1])
          : null;


      const location =
        position !== null
          ? getLineColumn(
              content,
              position
            )
          : {
              line:
                null,

              column:
                null
            };


      errors.push(
        createError({
          code:
            "INVALID_JSON",

          message:
            `Invalid JSON: ${toString(
              error.message
            )}`,

          file:
            filePath,

          line:
            location.line,

          column:
            location.column
        })
      );
    }
  }
}


/* =========================================================
   SOURCE QUALITY
========================================================= */

function validateSourceQuality(
  files,
  warnings
) {
  for (
    const file of files
  ) {
    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);


    if (
      !isCodeFile(
        filePath
      )
    ) {
      continue;
    }


    const trimmed =
      content.trim();


    const suspiciousPatterns = [
      /\.\.\.\s*$/m,
      /\/\/\s*rest of code/i,
      /\/\*\s*rest of code/i,
      /TODO:\s*IMPLEMENT/i,
      /IMPLEMENT\s+HERE/i,
      /YOUR_CODE_HERE/i,
      /INSERT_CODE_HERE/i
    ];


    for (
      const pattern of suspiciousPatterns
    ) {
      if (
        pattern.test(
          trimmed
        )
      ) {
        warnings.push(
          createWarning({
            code:
              "POSSIBLE_INCOMPLETE_SOURCE",

            message:
              "Source contains a possible placeholder or truncation marker.",

            file:
              filePath
          })
        );

        break;
      }
    }


    if (
      /&lt;[A-Za-z]/.test(
        content
      ) &&
      /&gt;/.test(
        content
      )
    ) {
      warnings.push(
        createWarning({
          code:
            "POSSIBLE_HTML_ESCAPED_SOURCE",

          message:
            "Source appears to contain HTML-escaped code.",

          file:
            filePath
        })
      );
    }
  }
}


/* =========================================================
   LOCAL IMPORT ANALYSIS
========================================================= */

function stripImportExtension(
  value
) {
  return value
    .replace(
      /[?#].*$/,
      ""
    )
    .replace(
      /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|json)$/,
      ""
    );
}


function possibleLocalPaths(
  importPath,
  importerPath
) {
  let base = "";


  const importerDirectory =
    importerPath.includes("/")
      ? importerPath.slice(
          0,
          importerPath.lastIndexOf("/")
        )
      : "";


  if (
    importPath.startsWith("@/")
  ) {
    base =
      importPath.slice(2);
  } else if (
    importPath.startsWith("./")
  ) {
    base =
      importerDirectory
        ? `${importerDirectory}/${importPath.slice(2)}`
        : importPath.slice(2);
  } else if (
    importPath.startsWith("../")
  ) {
    const parts =
      importerDirectory
        ? importerDirectory.split("/")
        : [];


    const importParts =
      importPath.split("/");


    while (
      importParts[0] === ".."
    ) {
      importParts.shift();

      if (
        parts.length
      ) {
        parts.pop();
      }
    }


    base =
      [
        ...parts,
        ...importParts
      ].join("/");
  } else {
    return [];
  }


  base =
    normalizeFilePath(
      stripImportExtension(
        base
      )
    );


  return [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.vue`,
    `${base}.svelte`,
    `${base}.json`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`
  ];
}


function extractImportPaths(
  content
) {
  const imports = [];


  const patterns = [
    /from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /import\s+["']([^"']+)["']/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g
  ];


  for (
    const regex of patterns
  ) {
    let match;


    while (
      (match =
        regex.exec(
          content
        )) !== null
    ) {
      imports.push({
        value:
          match[1],

        offset:
          match.index
      });


      if (
        imports.length >=
        MAX_IMPORTS_TO_CHECK
      ) {
        return imports;
      }
    }
  }


  return imports;
}


function validateLocalImports(
  files,
  warnings
) {
  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );


  for (
    const file of files
  ) {
    const importer =
      getFilePath(file);


    if (
      !isCodeFile(
        importer
      )
    ) {
      continue;
    }


    const content =
      getFileContent(file);


    const imports =
      extractImportPaths(
        content
      );


    for (
      const item of imports
    ) {
      const importPath =
        item.value;


      if (
        !importPath ||
        !(
          importPath.startsWith("./") ||
          importPath.startsWith("../") ||
          importPath.startsWith("@/")
        )
      ) {
        continue;
      }


      const candidates =
        possibleLocalPaths(
          importPath,
          importer
        );


      const exists =
        candidates.some(
          candidate =>
            paths.has(
              candidate
            )
        );


      if (
        !exists
      ) {
        const location =
          getLineColumn(
            content,
            item.offset
          );


        warnings.push(
          createWarning({
            code:
              "LOCAL_IMPORT_NOT_FOUND",

            message:
              `Local import "${importPath}" could not be matched to a generated file.`,

            file:
              importer,

            line:
              location.line,

            column:
              location.column,

            details: {
              importPath,

              candidates
            }
          })
        );
      }
    }
  }
}


/* =========================================================
   PLAN VALIDATION
========================================================= */

function extractPlannedPaths(
  plan
) {
  const result =
    new Set();


  if (
    !plan ||
    typeof plan !== "object"
  ) {
    return result;
  }


  const structure =
    Array.isArray(
      plan.projectStructure
    )
      ? plan.projectStructure
      : [];


  for (
    const item of structure
  ) {
    if (
      typeof item === "string"
    ) {
      const value =
        normalizeFilePath(
          item
        );


      if (
        value &&
        !value.endsWith("/")
      ) {
        result.add(
          value
        );
      }


      continue;
    }


    if (
      item &&
      typeof item === "object"
    ) {
      const value =
        normalizeFilePath(
          item.path ||
          item.file ||
          item.filePath ||
          ""
        );


      if (
        value &&
        !value.endsWith("/") &&
        !value.includes("*")
      ) {
        result.add(
          value
        );
      }
    }
  }


  return result;
}


function validateAgainstPlan(
  files,
  plan,
  errors,
  warnings
) {
  if (
    !plan ||
    typeof plan !== "object"
  ) {
    return;
  }


  const plannedPaths =
    extractPlannedPaths(
      plan
    );


  if (
    plannedPaths.size === 0
  ) {
    return;
  }


  const actualPaths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );


  for (
    const plannedPath of plannedPaths
  ) {
    if (
      !actualPaths.has(
        plannedPath
      )
    ) {
      warnings.push(
        createWarning({
          code:
            "PLANNED_FILE_MISSING",

          message:
            `Planned file was not generated: ${plannedPath}`,

          file:
            plannedPath
        })
      );
    }
  }


  const unplannedFiles =
    files.filter(
      file =>
        !plannedPaths.has(
          getFilePath(file)
        )
    );


  const allowedExtraFiles =
    Math.max(
      10,
      Math.ceil(
        plannedPaths.size *
        0.5
      )
    );


  if (
    unplannedFiles.length >
    allowedExtraFiles
  ) {
    errors.push(
      createError({
        code:
          "EXCESSIVE_UNPLANNED_FILES",

        message:
          "Builder generated too many files outside the planning blueprint.",

        details: {
          plannedFiles:
            plannedPaths.size,

          actualFiles:
            files.length,

          unplannedFiles:
            unplannedFiles.length,

          allowedExtraFiles
        }
      })
    );
  }
}


/* =========================================================
   MANIFEST VALIDATION
========================================================= */

function validateManifest(
  files,
  manifest,
  errors,
  warnings
) {
  if (
    !manifest ||
    typeof manifest !== "object"
  ) {
    return;
  }


  const actualPaths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );


  const manifestFiles =
    Array.isArray(
      manifest.files
    )
      ? manifest.files
      : [];


  const manifestPaths =
    new Set();


  for (
    const item of manifestFiles
  ) {
    const filePath =
      typeof item === "string"
        ? normalizeFilePath(
            item
          )
        : normalizeFilePath(
            item?.path ||
            item?.file ||
            item?.filePath ||
            ""
          );


    if (
      !filePath
    ) {
      continue;
    }


    if (
      manifestPaths.has(
        filePath
      )
    ) {
      errors.push(
        createError({
          code:
            "MANIFEST_DUPLICATE_PATH",

          message:
            `Manifest contains duplicate path: ${filePath}`,

          file:
            filePath
        })
      );
    }


    manifestPaths.add(
      filePath
    );


    if (
      !actualPaths.has(
        filePath
      )
    ) {
      errors.push(
        createError({
          code:
            "MANIFEST_FILE_MISSING",

          message:
            `Manifest references a file that does not exist: ${filePath}`,

          file:
            filePath
        })
      );
    }
  }


  for (
    const actualPath of actualPaths
  ) {
    if (
      !manifestPaths.has(
        actualPath
      )
    ) {
      warnings.push(
        createWarning({
          code:
            "FILE_NOT_IN_MANIFEST",

          message:
            `Generated file is not present in the builder manifest: ${actualPath}`,

          file:
            actualPath
        })
      );
    }
  }
}


/* =========================================================
   SCOPE VALIDATION
========================================================= */

function validateScope(
  files,
  plan,
  projectData,
  errors,
  warnings
) {
  const scale =
    plan?.projectScale ||
    plan?.scale ||
    projectData?.projectScale ||
    projectData?.scale ||
    "";


  if (
    !scale
  ) {
    return;
  }


  const limits = {
    none:
      10,

    task:
      30,

    feature:
      100,

    application:
      300,

    large_project:
      700,

    system:
      1000
  };


  const allowed =
    limits[scale];


  if (
    !allowed
  ) {
    return;
  }


  if (
    files.length >
    allowed
  ) {
    errors.push(
      createError({
        code:
          "SCOPE_FILE_LIMIT_EXCEEDED",

        message:
          `Generated file count (${files.length}) is disproportionate to project scale "${scale}".`,

        details: {
          scale,

          fileCount:
            files.length,

          allowedFiles:
            allowed
        }
      })
    );
  }


  if (
    scale === "task" &&
    files.length > 20
  ) {
    warnings.push(
      createWarning({
        code:
          "TASK_SCOPE_EXPANSION",

        message:
          "Task-level project contains more files than normally expected.",

        details: {
          fileCount:
            files.length
        }
      })
    );
  }
}


/* =========================================================
   REPAIR CONTEXT
========================================================= */

function createRepairContext({
  errors,
  warnings,
  sourceHash,
  framework,
  packageManager
}) {
  const affectedFiles =
    new Set();


  for (
    const error of errors
  ) {
    if (
      error &&
      typeof error.file === "string" &&
      error.file
    ) {
      affectedFiles.add(
        normalizeFilePath(
          error.file
        )
      );
    }
  }


  /*
   * Warnings are included only when they
   * clearly point to a source file.
   */
  for (
    const warning of warnings
  ) {
    if (
      warning &&
      typeof warning.file === "string" &&
      warning.file &&
      (
        warning.code ===
          "LOCAL_IMPORT_NOT_FOUND" ||
        warning.code ===
          "POSSIBLE_INCOMPLETE_SOURCE" ||
        warning.code ===
          "POSSIBLE_HTML_ESCAPED_SOURCE"
      )
    ) {
      affectedFiles.add(
        normalizeFilePath(
          warning.file
        )
      );
    }
  }


  return {
    required:
      errors.length > 0,

    sourceHash:
      sourceHash || null,

    framework:
      framework || "generic",

    packageManager:
      packageManager || "npm",

    affectedFiles:
      Array.from(
        affectedFiles
      ),

    errors:
      errors.map(
        error => ({
          code:
            error.code,

          message:
            error.message,

          file:
            error.file || "",

          line:
            error.line ?? null,

          column:
            error.column ?? null,

          stage:
            error.stage,

          details:
            error.details || null
        })
      ),

    warnings:
      warnings.map(
        warning => ({
          code:
            warning.code,

          message:
            warning.message,

          file:
            warning.file || "",

          line:
            warning.line ?? null,

          column:
            warning.column ?? null
        })
      ),

    strategy:
      errors.length > 0
        ? "repair-static-validation-errors"
        : "no-repair-required"
  };
}


/* =========================================================
   RESULT FACTORY
========================================================= */

function createValidationResult({
  files,
  errors,
  warnings,
  sourceHash,
  framework,
  packageManager,
  startedAt,
  totalSize,
  extraMetadata = {}
}) {
  const finalErrors =
    errors.slice(
      0,
      MAX_ERRORS
    );


  const finalWarnings =
    warnings.slice(
      0,
      MAX_WARNINGS
    );


  const passed =
    finalErrors.length === 0;


  return {
    success:
      passed,

    status:
      passed
        ? "passed"
        : "failed",

    /*
     * CRITICAL CONTRACT
     *
     * Static validation is never authoritative.
     */
    authoritative:
      AUTHORITATIVE,

    validationMode:
      VALIDATION_MODE,

    serviceVersion:
      SERVICE_VERSION,

    sourceHash,

    errors:
      finalErrors,

    warnings:
      finalWarnings,

    repairContext:
      createRepairContext({
        errors:
          finalErrors,

        warnings:
          finalWarnings,

        sourceHash,

        framework,

        packageManager
      }),

    summary: {
      passed,

      errorCount:
        finalErrors.length,

      warningCount:
        finalWarnings.length,

      fileCount:
        files.length,

      sourceSize:
        totalSize,

      framework,

      packageManager,

      durationMs:
        Date.now() -
        startedAt
    },

    metadata: {
      validatedAt:
        new Date().toISOString(),

      durationMs:
        Date.now() -
        startedAt,

      framework,

      packageManager,

      limits: {
        maxFiles:
          MAX_FILES,

        maxFileSize:
          MAX_FILE_SIZE,

        maxSourceSize:
          MAX_SOURCE_SIZE
      },

      ...extraMetadata
    }
  };
}


/* =========================================================
   MAIN STATIC VALIDATION
========================================================= */

async function validateProject({
  files,
  plan = null,
  projectData = null,
  manifest = null
} = {}) {
  const startedAt =
    Date.now();


  const errors = [];

  const warnings = [];


  /*
   * Normalize input without mutating
   * caller-owned objects.
   */
  const normalizedFiles =
    normalizeFiles(
      files
    );


  /*
   * Validate fundamental input first.
   */
  const fileStats =
    validateFiles(
      Array.isArray(files)
        ? normalizedFiles
        : files,

      errors,

      warnings
    );


  /*
   * If files itself is not an array,
   * return a proper structured result.
   */
  if (
    !Array.isArray(files)
  ) {
    const sourceHash =
      calculateSourceHash(
        []
      );


    return createValidationResult({
      files:
        [],

      errors,

      warnings,

      sourceHash,

      framework:
        "generic",

      packageManager:
        "npm",

      startedAt,

      totalSize:
        0
    });
  }


  /*
   * No files means there is no useful
   * deeper validation to perform.
   */
  if (
    normalizedFiles.length === 0
  ) {
    const sourceHash =
      calculateSourceHash(
        normalizedFiles
      );


    return createValidationResult({
      files:
        normalizedFiles,

      errors,

      warnings,

      sourceHash,

      framework:
        "generic",

      packageManager:
        "npm",

      startedAt,

      totalSize:
        fileStats.totalSize
    });
  }


  /* -------------------------------------------------------
     PACKAGE.JSON
  ------------------------------------------------------- */

  const packageInfo =
    parsePackageJson(
      normalizedFiles,
      errors
    );


  const packageJson =
    packageInfo.value;


  /* -------------------------------------------------------
     FRAMEWORK
  ------------------------------------------------------- */

  const framework =
    detectFramework(
      packageJson,
      normalizedFiles
    );


  /* -------------------------------------------------------
     PACKAGE MANAGER
  ------------------------------------------------------- */

  const packageManager =
    detectPackageManager(
      normalizedFiles,
      packageJson
    );


  /* -------------------------------------------------------
     PACKAGE VALIDATION
  ------------------------------------------------------- */

  validatePackageJson(
    packageJson,
    errors,
    warnings
  );


  /* -------------------------------------------------------
     JSON VALIDATION
  ------------------------------------------------------- */

  validateJsonFiles(
    normalizedFiles,
    errors
  );


  /* -------------------------------------------------------
     REQUIRED FILES
  ------------------------------------------------------- */

  validateRequiredFiles(
    normalizedFiles,
    packageJson,
    framework,
    errors,
    warnings
  );


  /* -------------------------------------------------------
     BUILD SCRIPT
  ------------------------------------------------------- */

  validateBuildScript(
    packageJson,
    errors,
    warnings
  );


  /* -------------------------------------------------------
     LOCKFILES
  ------------------------------------------------------- */

  validateLockfiles(
    normalizedFiles,
    packageManager,
    warnings
  );


  /* -------------------------------------------------------
     FRAMEWORK DEPENDENCIES
  ------------------------------------------------------- */

  validateFrameworkDependencies(
    packageJson,
    framework,
    errors,
    warnings
  );


  /* -------------------------------------------------------
     SOURCE QUALITY
  ------------------------------------------------------- */

  validateSourceQuality(
    normalizedFiles,
    warnings
  );


  /* -------------------------------------------------------
     LOCAL IMPORTS
  ------------------------------------------------------- */

  validateLocalImports(
    normalizedFiles,
    warnings
  );


  /* -------------------------------------------------------
     PLANNING BLUEPRINT
  ------------------------------------------------------- */

  validateAgainstPlan(
    normalizedFiles,
    plan,
    errors,
    warnings
  );


  /* -------------------------------------------------------
     PROJECT SCOPE
  ------------------------------------------------------- */

  validateScope(
    normalizedFiles,
    plan,
    projectData,
    errors,
    warnings
  );


  /* -------------------------------------------------------
     BUILDER MANIFEST
  ------------------------------------------------------- */

  if (
    manifest &&
    typeof manifest === "object"
  ) {
    validateManifest(
      normalizedFiles,
      manifest,
      errors,
      warnings
    );
  }


  /* -------------------------------------------------------
     FINAL RESULT
  ------------------------------------------------------- */

  const sourceHash =
    calculateSourceHash(
      normalizedFiles
    );


  return createValidationResult({
    files:
      normalizedFiles,

    errors,

    warnings,

    sourceHash,

    framework,

    packageManager,

    startedAt,

    totalSize:
      fileStats.totalSize,

    extraMetadata: {
      staticOnly:
        true,

      dockerExecuted:
        false,

      dependenciesInstalled:
        false,

      buildCommandExecuted:
        false,

      generatedCodeExecuted:
        false,

      artifactCreated:
        false,

      deploymentPerformed:
        false
    }
  });
}


/* =========================================================
   LIGHTWEIGHT FILE VALIDATION
========================================================= */

function validateFileSet(
  files
) {
  const errors = [];

  const warnings = [];


  const normalizedFiles =
    normalizeFiles(
      files
    );


  const stats =
    validateFiles(
      Array.isArray(files)
        ? normalizedFiles
        : files,

      errors,

      warnings
    );


  return {
    success:
      errors.length === 0,

    errors,

    warnings,

    fileCount:
      stats.fileCount,

    sourceSize:
      stats.totalSize
  };
}


/* =========================================================
   QUICK VALIDATION
========================================================= */

function quickValidate(
  files
) {
  const startedAt =
    Date.now();


  const result =
    validateFileSet(
      files
    );


  const normalizedFiles =
    normalizeFiles(
      files
    );


  const sourceHash =
    calculateSourceHash(
      normalizedFiles
    );


  return {
    success:
      result.success,

    status:
      result.success
        ? "passed"
        : "failed",

    authoritative:
      AUTHORITATIVE,

    validationMode:
      VALIDATION_MODE,

    serviceVersion:
      SERVICE_VERSION,

    sourceHash,

    errors:
      result.errors,

    warnings:
      result.warnings,

    summary: {
      fileCount:
        result.fileCount,

      sourceSize:
        result.sourceSize,

      errorCount:
        result.errors.length,

      warningCount:
        result.warnings.length,

      durationMs:
        Date.now() -
        startedAt
    }
  };
}


/* =========================================================
   STATIC READINESS
========================================================= */

function isStaticValidationReady(
  result
) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return false;
  }


  return (
    result.success === true &&

    result.status ===
      "passed" &&

    result.authoritative ===
      false &&

    result.validationMode ===
      "static" &&

    Array.isArray(
      result.errors
    ) &&

    result.errors.length === 0 &&

    typeof result.sourceHash ===
      "string" &&

    result.sourceHash.length > 0
  );
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  SERVICE_VERSION,

  VALIDATION_MODE,

  AUTHORITATIVE,

  MAX_FILES,

  MAX_FILE_SIZE,

  MAX_SOURCE_SIZE,

  validateProject,

  validateFiles:
    validateFileSet,

  quickValidate,

  isStaticValidationReady,

  calculateSourceHash,

  detectFramework,

  detectPackageManager,

  normalizeFilePath,

  isSafeFilePath,

  getFilePath,

  getFileContent

};
