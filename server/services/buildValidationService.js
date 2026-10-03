/* =========================================================
   ZYRIONOS — AUTHORITATIVE BUILD SERVICE
   ---------------------------------------------------------
   Version: 1.0.0

   PURPOSE
   ---------------------------------------------------------
   This service performs REAL project validation.

   Unlike BuildValidationService, this service:

   - Creates isolated build workspace
   - Writes generated project files
   - Detects package manager
   - Installs dependencies
   - Executes actual build command
   - Captures stdout
   - Captures stderr
   - Captures exit code
   - Enforces timeout
   - Detects install failures
   - Detects build failures
   - Produces structured repair context
   - Generates deterministic build ID
   - Produces source hash
   - Cleans temporary workspace
   - Never exposes host environment secrets
   - Never deploys
   - Never modifies production project files

   ARCHITECTURE

   Builder
      ↓
   BuildValidationService
      ↓
   AuthoritativeBuildService
      ↓
   INSTALL
      ↓
   BUILD
      ↓
   ┌───────────────┐
   │               │
   PASS           FAIL
   │               │
   ↓               ↓
 Preview        Fix Agent
                    ↓
                 Rebuild

   IMPORTANT

   This service uses Docker isolation.

   Generated code MUST NOT be executed directly
   inside the ZyrionOS backend Node.js process.

========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("./loggerService");


/* =========================================================
   METADATA
========================================================= */

const SERVICE_VERSION =
  "1.0.0";

const VALIDATION_MODE =
  "authoritative";

const AUTHORITATIVE =
  true;


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILES =
  Number(
    process.env.AUTH_BUILD_MAX_FILES ||
    1000
  );

const MAX_FILE_SIZE =
  Number(
    process.env.AUTH_BUILD_MAX_FILE_SIZE ||
    2 * 1024 * 1024
  );

const MAX_TOTAL_SIZE =
  Number(
    process.env.AUTH_BUILD_MAX_TOTAL_SIZE ||
    50 * 1024 * 1024
  );

const INSTALL_TIMEOUT_MS =
  Number(
    process.env.AUTH_BUILD_INSTALL_TIMEOUT_MS ||
    5 * 60 * 1000
  );

const BUILD_TIMEOUT_MS =
  Number(
    process.env.AUTH_BUILD_TIMEOUT_MS ||
    5 * 60 * 1000
  );

const TOTAL_TIMEOUT_MS =
  Number(
    process.env.AUTH_BUILD_TOTAL_TIMEOUT_MS ||
    10 * 60 * 1000
  );

const MAX_OUTPUT_BYTES =
  Number(
    process.env.AUTH_BUILD_MAX_OUTPUT_BYTES ||
    5 * 1024 * 1024
  );

const MAX_CONCURRENT_BUILDS =
  Number(
    process.env.AUTH_BUILD_MAX_CONCURRENT ||
    2
  );


/* =========================================================
   PACKAGE MANAGERS
========================================================= */

const PACKAGE_MANAGERS =
  Object.freeze({

    npm: {

      lockfiles: [
        "package-lock.json"
      ],

      installCommand: [
        "npm",
        "ci"
      ],

      fallbackInstallCommand: [
        "npm",
        "install"
      ],

      buildCommand: [
        "npm",
        "run",
        "build"
      ]

    },

    pnpm: {

      lockfiles: [
        "pnpm-lock.yaml"
      ],

      installCommand: [
        "pnpm",
        "install",
        "--frozen-lockfile"
      ],

      fallbackInstallCommand: [
        "pnpm",
        "install"
      ],

      buildCommand: [
        "pnpm",
        "run",
        "build"
      ]

    },

    yarn: {

      lockfiles: [
        "yarn.lock"
      ],

      installCommand: [
        "yarn",
        "install",
        "--frozen-lockfile"
      ],

      fallbackInstallCommand: [
        "yarn",
        "install"
      ],

      buildCommand: [
        "yarn",
        "build"
      ]

    },

    bun: {

      lockfiles: [
        "bun.lockb",
        "bun.lock"
      ],

      installCommand: [
        "bun",
        "install",
        "--frozen-lockfile"
      ],

      fallbackInstallCommand: [
        "bun",
        "install"
      ],

      buildCommand: [
        "bun",
        "run",
        "build"
      ]

    }

  });


/* =========================================================
   HELPERS
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

    value =
      value.slice(2);

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
    normalized.startsWith("/") ||
    normalized.startsWith("\\")
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

    file.name ||

    file.filePath ||

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
   BUILD ID
========================================================= */

function createBuildId() {

  return (

    "build_" +

    Date.now().toString(36) +

    "_" +

    crypto
      .randomBytes(8)
      .toString("hex")

  );

}


/* =========================================================
   ISSUE FACTORY
========================================================= */

function createIssue({

  code,

  message,

  stage = "build",

  severity = "error",

  file = null,

  details = null

}) {

  return {

    code,

    message,

    stage,

    severity,

    file,

    details

  };

}


/* =========================================================
   FILE VALIDATION
========================================================= */

function validateFiles(
  files
) {

  const errors = [];

  let totalSize = 0;

  if (
    !Array.isArray(files)
  ) {

    errors.push(

      createIssue({

        code:
          "FILES_NOT_ARRAY",

        message:
          "Project files must be an array.",

        stage:
          "input"

      })

    );

    return {

      errors,

      totalSize: 0

    };

  }


  if (
    files.length === 0
  ) {

    errors.push(

      createIssue({

        code:
          "NO_PROJECT_FILES",

        message:
          "No project files were supplied.",

        stage:
          "input"

      })

    );

  }


  if (
    files.length >
    MAX_FILES
  ) {

    errors.push(

      createIssue({

        code:
          "FILE_LIMIT_EXCEEDED",

        message:
          `Project contains ${files.length} files. ` +
          `Maximum allowed is ${MAX_FILES}.`,

        stage:
          "input",

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


  for (
    const file of files
  ) {

    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);


    if (!filePath) {

      errors.push(

        createIssue({

          code:
            "FILE_PATH_MISSING",

          message:
            "Generated file is missing a path.",

          stage:
            "input"

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

        createIssue({

          code:
            "UNSAFE_FILE_PATH",

          message:
            `Unsafe project file path: ${filePath}`,

          file:
            filePath,

          stage:
            "input"

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

        createIssue({

          code:
            "DUPLICATE_FILE_PATH",

          message:
            `Duplicate project file: ${filePath}`,

          file:
            filePath,

          stage:
            "input"

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

        createIssue({

          code:
            "FILE_SIZE_EXCEEDED",

          message:
            `File exceeds maximum allowed size of ` +
            `${MAX_FILE_SIZE} bytes.`,

          file:
            filePath,

          stage:
            "input",

          details: {

            size,

            maximum:
              MAX_FILE_SIZE

          }

        })

      );

    }

  }


  if (
    totalSize >
    MAX_TOTAL_SIZE
  ) {

    errors.push(

      createIssue({

        code:
          "PROJECT_SIZE_EXCEEDED",

        message:
          `Project exceeds maximum allowed source size ` +
          `of ${MAX_TOTAL_SIZE} bytes.`,

        stage:
          "input",

        details: {

          size:
            totalSize,

          maximum:
            MAX_TOTAL_SIZE

        }

      })

    );

  }


  return {

    errors,

    totalSize

  };

}


/* =========================================================
   PACKAGE JSON
========================================================= */

function readPackageJson(
files
) {

  const packageFile =
    files.find(
      file =>
        getFilePath(file) ===
        "package.json"
    );


  if (!packageFile) {

    return {

      packageJson:
        null,

      error:

        createIssue({

          code:
            "PACKAGE_JSON_MISSING",

          message:
            "package.json is required for authoritative Node build execution.",

          file:
            "package.json",

          stage:
            "package"

        })

    };

  }


  try {

    const packageJson =
      JSON.parse(
        getFileContent(
          packageFile
        )
      );


    if (
      !packageJson ||
      typeof packageJson !== "object" ||
      Array.isArray(packageJson)
    ) {

      return {

        packageJson:
          null,

        error:

          createIssue({

            code:
              "INVALID_PACKAGE_JSON",

            message:
              "package.json must contain a JSON object.",

            file:
              "package.json",

            stage:
              "package"

          })

      };

    }


    return {

      packageJson,

      error:
        null

    };

  }

  catch (error) {

    return {

      packageJson:
        null,

      error:

        createIssue({

          code:
            "INVALID_PACKAGE_JSON",

          message:
            `package.json cannot be parsed: ${error.message}`,

          file:
            "package.json",

          stage:
            "package",

          details: {

            name:
              error.name

          }

        })

    };

  }

}


/* =========================================================
   PACKAGE MANAGER DETECTION
========================================================= */

function detectPackageManager(
  files,
  packageJson
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


  if (
    packageJson &&
    typeof packageJson.packageManager ===
      "string"
  ) {

    const value =
      packageJson.packageManager
        .trim()
        .toLowerCase();


    if (
      value.startsWith(
        "pnpm"
      )
    ) {

      return "pnpm";

    }


    if (
      value.startsWith(
        "yarn"
      )
    ) {

      return "yarn";

    }


    if (
      value.startsWith(
        "bun"
      )
    ) {

      return "bun";

    }


    if (
      value.startsWith(
        "npm"
      )
    ) {

      return "npm";

    }

  }


  return "npm";

}


/* =========================================================
   BUILD SCRIPT
========================================================= */

function hasBuildScript(
  packageJson
) {

  return Boolean(

    packageJson &&

    packageJson.scripts &&

    typeof packageJson.scripts.build ===
      "string" &&

    packageJson.scripts.build.trim()

  );

}


/* =========================================================
   COMMAND CONFIGURATION
========================================================= */

function getPackageManagerConfig(
  packageManager
) {

  return (
    PACKAGE_MANAGERS[
      packageManager
    ] ||
    PACKAGE_MANAGERS.npm
  );

}


/* =========================================================
   NODE IMAGE
========================================================= */

function getNodeImage(
  projectData = {}
) {

  const requested =
    toString(
      projectData.nodeVersion
    )
      .trim();


  /*
   * Only allow simple Node major versions.
   * Never allow arbitrary Docker image names.
   */

  if (
    /^20(?:\.\d+)?$/.test(
      requested
    )
  ) {

    return "node:20-bookworm-slim";

  }


  if (
    /^22(?:\.\d+)?$/.test(
      requested
    )
  ) {

    return "node:22-bookworm-slim";

  }


  /*
   * Current production default.
   */
  return "node:20-bookworm-slim";

}


/* =========================================================
   DOCKER AVAILABILITY
========================================================= */

function checkDockerAvailable() {

  return new Promise(
    resolve => {

      const child =
        spawn(
          "docker",
          [
            "--version"
          ],
          {
            stdio:
              [
                "ignore",
                "pipe",
                "pipe"
              ]
          }
        );


      let settled =
        false;


      const finish =
        value => {

          if (
            settled
          ) {

            return;

          }

          settled =
            true;

          resolve(
            value
          );

        };


      child.once(
        "error",
        () =>
          finish(false)
      );


      child.once(
        "close",
        code =>
          finish(
            code === 0
          )
      );

    }
  );

}


/* =========================================================
   TEMP DIRECTORY
========================================================= */

async function createWorkspace(
  buildId
) {

  const root =
    await fsp.mkdtemp(

      path.join(
        os.tmpdir(),
        `zyrionos-build-${buildId}-`
      )

    );


  return root;

}


/* =========================================================
   WRITE PROJECT
========================================================= */

async function writeProjectFiles(
  workspace,
  files
) {

  for (
    const file of files
  ) {

    const relativePath =
      normalizeFilePath(
        getFilePath(file)
      );


    if (
      !isSafeFilePath(
        relativePath
      )
    ) {

      throw new Error(
        `Unsafe project path: ${relativePath}`
      );

    }


    const destination =
      path.join(
        workspace,
        ...relativePath.split("/")
      );


    const relative =
      path.relative(
        workspace,
        destination
      );


    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {

      throw new Error(
        `Path escapes build workspace: ${relativePath}`
      );

    }


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
      getFileContent(file),
      "utf8"
    );

  }

}


/* =========================================================
   OUTPUT BUFFER
========================================================= */

function createOutputCollector() {

  let stdout =
    "";

  let stderr =
    "";

  let stdoutBytes =
    0;

  let stderrBytes =
    0;

  let truncated =
    false;


  function append(
    current,
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

    appendStdout(chunk) {

      const result =
        append(
          stdout,
          chunk
        );


      stdoutBytes +=
        result.bytes;


      if (
        stdout.length <
        MAX_OUTPUT_BYTES
      ) {

        const remaining =
          MAX_OUTPUT_BYTES -
          stdout.length;


        stdout +=
          result.text.slice(
            0,
            remaining
          );

      }


      if (
        stdoutBytes >
        MAX_OUTPUT_BYTES
      ) {

        truncated =
          true;

      }

    },


    appendStderr(chunk) {

      const result =
        append(
          stderr,
          chunk
        );


      stderrBytes +=
        result.bytes;


      if (
        stderr.length <
        MAX_OUTPUT_BYTES
      ) {

        const remaining =
          MAX_OUTPUT_BYTES -
          stderr.length;


        stderr +=
          result.text.slice(
            0,
            remaining
          );

      }


      if (
        stderrBytes >
        MAX_OUTPUT_BYTES
      ) {

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
   DOCKER COMMAND
========================================================= */

function runDockerCommand({

  args,

  timeoutMs,

  stage,

  workspace

}) {

  return new Promise(
    resolve => {

      const collector =
        createOutputCollector();


      const startedAt =
        Date.now();


      let timedOut =
        false;

      let settled =
        false;


      const child =
        spawn(
          "docker",
          args,
          {
            cwd:
              workspace,

            stdio:
              [
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

            stage,

            exitCode:
              null,

            signal:
              null,

            timedOut:
              false,

            durationMs:
              Date.now() -
              startedAt,

            ...collector.getResult(),

            error:
              error.message

          });

        }
      );


      const timeout =
        setTimeout(
          () => {

            timedOut =
              true;


            try {

              child.kill(
                "SIGKILL"
              );

            } catch (_) {}


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
            timeout
          );


          const output =
            collector.getResult();


          finish({

            success:
              !timedOut &&
              code === 0,

            stage,

            exitCode:
              code,

            signal,

            timedOut,

            durationMs:
              Date.now() -
              startedAt,

            ...output,

            error:
              null

          });

        }
      );

    }
  );

}


/* =========================================================
   DOCKER ARGUMENTS
========================================================= */

function createDockerRunArgs({

  image,

  workspace,

  command,

  network

}) {

  /*
   * Security model:
   *
   * --rm
   *     Remove container after execution.
   *
   * --network
   *     Network explicitly controlled.
   *
   * --cpus
   *     CPU limit.
   *
   * --memory
   *     Memory limit.
   *
   * --pids-limit
   *     Process limit.
   *
   * --read-only
   *     Read-only container root.
   *
   * --tmpfs
   *     Writable temporary runtime areas.
   *
   * --cap-drop ALL
   *     Drop Linux capabilities.
   *
   * --security-opt no-new-privileges
   *     Prevent privilege escalation.
   *
   * --user
   *     Non-root execution.
   */

  return [

    "run",

    "--rm",

    "--network",
    network,

    "--cpus",
    process.env.AUTH_BUILD_CPU_LIMIT ||
      "2",

    "--memory",
    process.env.AUTH_BUILD_MEMORY_LIMIT ||
      "2g",

    "--pids-limit",
    process.env.AUTH_BUILD_PIDS_LIMIT ||
      "256",

    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    "--read-only",

    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=512m",

    "--tmpfs",
    "/home/node:rw,nosuid,size=512m",

    "-v",

    `${workspace}:/workspace:rw`,

    "-w",
    "/workspace",

    "--user",
    "node",

    image,

    ...command

  ];

}


/* =========================================================
   INSTALL
========================================================= */

async function installDependencies({

  workspace,

  packageManager,

  image

}) {

  const config =
    getPackageManagerConfig(
      packageManager
    );


  /*
   * First attempt:
   * frozen/CI install.
   */

  let args =
    createDockerRunArgs({

      image,

      workspace,

      command:
        config.installCommand,

      /*
       * Installation requires network.
       */
      network:
        process.env.AUTH_BUILD_INSTALL_NETWORK ||
        "bridge"

    });


  let result =
    await runDockerCommand({

      args,

      timeoutMs:
        INSTALL_TIMEOUT_MS,

      stage:
        "dependency-install",

      workspace

    });


  if (
    result.success
  ) {

    return {

      ...result,

      usedFallback:
        false

    };

  }


  /*
   * Fallback is only attempted for lockfile-related
   * installation failures.
   */

  const combined =
    `${result.stdout}\n${result.stderr}`
      .toLowerCase();


  const fallbackAllowed =
    combined.includes(
      "frozen-lockfile"
    ) ||
    combined.includes(
      "package-lock"
    ) ||
    combined.includes(
      "lockfile"
    );


  if (
    !fallbackAllowed
  ) {

    return {

      ...result,

      usedFallback:
        false

    };

  }


  args =
    createDockerRunArgs({

      image,

      workspace,

      command:
        config.fallbackInstallCommand,

      network:
        process.env.AUTH_BUILD_INSTALL_NETWORK ||
        "bridge"

    });


  result =
    await runDockerCommand({

      args,

      timeoutMs:
        INSTALL_TIMEOUT_MS,

      stage:
        "dependency-install-fallback",

      workspace

    });


  return {

    ...result,

    usedFallback:
      true

  };

}


/* =========================================================
   BUILD
========================================================= */

async function executeBuild({

  workspace,

  packageManager,

  image

}) {

  const config =
    getPackageManagerConfig(
      packageManager
    );


  const args =
    createDockerRunArgs({

      image,

      workspace,

      command:
        config.buildCommand,

      /*
       * Build runs without network by default.
       *
       * Dependencies should already exist from install stage.
       */
      network:
        process.env.AUTH_BUILD_NETWORK ||
        "none"

    });


  return runDockerCommand({

    args,

    timeoutMs:
      BUILD_TIMEOUT_MS,

    stage:
      "build",

    workspace

  });

}


/* =========================================================
   PACKAGE SCRIPT VALIDATION
========================================================= */

function validateBuildScript(
packageJson
) {

  if (
    !packageJson ||
    !packageJson.scripts
  ) {

    return {

      valid:
        false,

      issue:

        createIssue({

          code:
            "BUILD_SCRIPT_MISSING",

          message:
            "package.json does not define a build script.",

          file:
            "package.json",

          stage:
            "build"

        })

    };

  }


  if (
    typeof packageJson.scripts.build !==
      "string" ||
    !packageJson.scripts.build.trim()
  ) {

    return {

      valid:
        false,

      issue:

        createIssue({

          code:
            "BUILD_SCRIPT_INVALID",

          message:
            "package.json build script is missing or invalid.",

          file:
            "package.json",

          stage:
            "build"

        })

    };

  }


  return {

    valid:
      true,

    issue:
      null

  };

}


/* =========================================================
   ERROR CLASSIFICATION
========================================================= */

function classifyFailure({

  stage,

  result

}) {

  if (
    !result
  ) {

    return {

      category:
        "unknown",

      retryable:
        false

    };

  }


  if (
    result.timedOut
  ) {

    return {

      category:
        "timeout",

      retryable:
        false

    };

  }


  const text =
    `${result.stdout || ""}\n${result.stderr || ""}`
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
      "enotfound"
    ) ||
    text.includes(
      "network"
    ) ||
    text.includes(
      "getaddrinfo"
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
      "module not found"
    ) ||
    text.includes(
      "cannot find module"
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
      "parse error"
    ) ||
    text.includes(
      "unexpected token"
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
    stage.includes(
      "dependency-install"
    )
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
   REPAIR CONTEXT
========================================================= */

function createRepairContext({

  buildResult,

  sourceHash,

  packageManager

}) {

  const errors =
    Array.isArray(
      buildResult?.errors
    )
      ? buildResult.errors
      : [];


  const affectedFiles =
    [
      ...new Set(

        errors

          .map(
            error =>
              error &&
              error.file
          )

          .filter(
            Boolean
          )

      )
    ];


  return {

    success:
      false,

    sourceHash:
      sourceHash ||
      null,

    packageManager:
      packageManager ||
      "npm",

    buildId:
      buildResult?.buildId ||
      null,

    failureStage:
      buildResult?.failureStage ||
      null,

    failureCategory:
      buildResult?.failureCategory ||
      null,

    affectedFiles,

    errors,

    stdout:
      buildResult?.stdout ||
      "",

    stderr:
      buildResult?.stderr ||
      "",

    exitCode:
      buildResult?.exitCode ??
      null

  };

}


/* =========================================================
   CONCURRENCY
========================================================= */

let activeBuilds =
  0;


/**
 * Acquire build slot.
 */
async function acquireBuildSlot() {

  if (
    activeBuilds <
    MAX_CONCURRENT_BUILDS
  ) {

    activeBuilds++;

    return;

  }


  const started =
    Date.now();


  while (
    activeBuilds >=
    MAX_CONCURRENT_BUILDS
  ) {

    if (
      Date.now() -
      started >
      TOTAL_TIMEOUT_MS
    ) {

      throw new Error(
        "Timed out waiting for an available build slot."
      );

    }

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          250
        )
    );

  }


  activeBuilds++;

}


/**
 * Release build slot.
 */
function releaseBuildSlot() {

  activeBuilds =
    Math.max(
      0,
      activeBuilds - 1
    );

}


/* =========================================================
   MAIN BUILD
========================================================= */

async function buildProject(
  projectData = {}
) {

  const startedAt =
    Date.now();

  const buildId =
    createBuildId();

  let workspace =
    null;

  let dockerAvailable =
    false;


  try {

    logger.info(
      `[AuthoritativeBuildService] Build started: ${buildId}`
    );


    /* -----------------------------------------------------
       1. INPUT
    ----------------------------------------------------- */

    const files =
      Array.isArray(
        projectData.files
      )
        ? projectData.files
        : [];


    const fileValidation =
      validateFiles(
        files
      );


    if (
      fileValidation.errors.length >
      0
    ) {

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

        sourceHash:
          calculateSourceHash(
            files
          ),

        failureStage:
          "input",

        failureCategory:
          "invalid-input",

        errors:
          fileValidation.errors,

        warnings: [],

        stdout:
          "",

        stderr:
          "",

        exitCode:
          null,

        summary: {

          durationMs:
            Date.now() -
            startedAt,

          fileCount:
            files.length,

          totalSize:
            fileValidation.totalSize

        },

        repairContext:
          createRepairContext({

            buildResult: {

              buildId,

              failureStage:
                "input",

              failureCategory:
                "invalid-input",

              errors:
                fileValidation.errors

            },

            sourceHash:
              calculateSourceHash(
                files
              )

          })

      };

    }


    /* -----------------------------------------------------
       2. PACKAGE.JSON
    ----------------------------------------------------- */

    const packageResult =
      readPackageJson(
        files
      );


    if (
      packageResult.error
    ) {

      const sourceHash =
        calculateSourceHash(
          files
        );


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

        sourceHash,

        failureStage:
          "package",

        failureCategory:
          "package",

        errors: [
          packageResult.error
        ],

        warnings: [],

        stdout:
          "",

        stderr:
          "",

        exitCode:
          null,

        summary: {

          durationMs:
            Date.now() -
            startedAt,

          fileCount:
            files.length,

          totalSize:
            fileValidation.totalSize

        },

        repairContext:
          createRepairContext({

            buildResult: {

              buildId,

              failureStage:
                "package",

              failureCategory:
                "package",

              errors: [
                packageResult.error
              ]

            },

            sourceHash

          })

      };

    }


    const packageJson =
      packageResult.packageJson;


    /* -----------------------------------------------------
       3. BUILD SCRIPT
    ----------------------------------------------------- */

    const buildScript =
      validateBuildScript(
        packageJson
      );


    if (
      !buildScript.valid
    ) {

      const sourceHash =
        calculateSourceHash(
          files
        );


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

        sourceHash,

        failureStage:
          "build",

        failureCategory:
          "configuration",

        errors: [
          buildScript.issue
        ],

        warnings: [],

        stdout:
          "",

        stderr:
          "",

        exitCode:
          null,

        summary: {

          durationMs:
            Date.now() -
            startedAt,

          fileCount:
            files.length,

          totalSize:
            fileValidation.totalSize

        },

        repairContext:
          createRepairContext({

            buildResult: {

              buildId,

              failureStage:
                "build",

              failureCategory:
                "configuration",

              errors: [
                buildScript.issue
              ]

            },

            sourceHash

          })

      };

    }


    /* -----------------------------------------------------
       4. PACKAGE MANAGER
    ----------------------------------------------------- */

    const packageManager =
      detectPackageManager(
        files,
        packageJson
      );


    /* -----------------------------------------------------
       5. NODE IMAGE
    ----------------------------------------------------- */

    const image =
      getNodeImage(
        projectData
      );


    /* -----------------------------------------------------
       6. BUILD SLOT
    ----------------------------------------------------- */

    await acquireBuildSlot();


    try {

      /* ---------------------------------------------------
         7. DOCKER
      --------------------------------------------------- */

      dockerAvailable =
        await checkDockerAvailable();


      if (
        !dockerAvailable
      ) {

        const error =
          createIssue({

            code:
              "DOCKER_UNAVAILABLE",

            message:
              "Docker is unavailable. Authoritative build execution requires the isolated Docker runtime.",

            stage:
              "executor"

          });


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

          sourceHash:
            calculateSourceHash(
              files
            ),

          packageManager,

          failureStage:
            "executor",

          failureCategory:
            "runtime",

          errors: [
            error
          ],

          warnings: [],

          stdout:
            "",

          stderr:
            "",

          exitCode:
            null,

          summary: {

            durationMs:
              Date.now() -
              startedAt,

            fileCount:
              files.length,

            totalSize:
              fileValidation.totalSize

          },

          repairContext:
            createRepairContext({

              buildResult: {

                buildId,

                failureStage:
                  "executor",

                failureCategory:
                  "runtime",

                errors: [
                  error
                ]

              },

              sourceHash:
                calculateSourceHash(
                  files
                ),

              packageManager

            })

        };

      }


      /* ---------------------------------------------------
         8. WORKSPACE
      --------------------------------------------------- */

      workspace =
        await createWorkspace(
          buildId
        );


      await writeProjectFiles(
        workspace,
        files
      );


      /* ---------------------------------------------------
         9. INSTALL
      --------------------------------------------------- */

      const installResult =
        await installDependencies({

          workspace,

          packageManager,

          image

        });


      if (
        !installResult.success
      ) {

        const classification =
          classifyFailure({

            stage:
              installResult.stage,

            result:
              installResult

          });


        const error =
          createIssue({

            code:
              "DEPENDENCY_INSTALL_FAILED",

            message:
              installResult.timedOut

                ? "Dependency installation timed out."

                : "Dependency installation failed.",

            stage:
              "dependency-install",

            details: {

              category:
                classification.category,

              retryable:
                classification.retryable,

              exitCode:
                installResult.exitCode,

              signal:
                installResult.signal,

              durationMs:
                installResult.durationMs,

              usedFallback:
                installResult.usedFallback

            }

          });


        const sourceHash =
          calculateSourceHash(
            files
          );


        const buildResult = {

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

          sourceHash,

          packageManager,

          failureStage:
            "dependency-install",

          failureCategory:
            classification.category,

          errors: [
            error
          ],

          warnings: [],

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

          summary: {

            durationMs:
              Date.now() -
              startedAt,

            installDurationMs:
              installResult.durationMs,

            fileCount:
              files.length,

            totalSize:
              fileValidation.totalSize

          }

        };


        buildResult.repairContext =
          createRepairContext({

            buildResult,

            sourceHash,

            packageManager

          });


        return buildResult;

      }


      /* ---------------------------------------------------
         10. BUILD
      --------------------------------------------------- */

      const buildResult =
        await executeBuild({

          workspace,

          packageManager,

          image

        });


      if (
        !buildResult.success
      ) {

        const classification =
          classifyFailure({

            stage:
              "build",

            result:
              buildResult

          });


        const error =
          createIssue({

            code:
              buildResult.timedOut
                ? "BUILD_TIMEOUT"
                : "BUILD_FAILED",

            message:
              buildResult.timedOut

                ? "Project build timed out."

                : "Project build failed.",

            stage:
              "build",

            details: {

              category:
                classification.category,

              retryable:
                classification.retryable,

              exitCode:
                buildResult.exitCode,

              signal:
                buildResult.signal,

              durationMs:
                buildResult.durationMs

            }

          });


        const sourceHash =
          calculateSourceHash(
            files
          );


        const finalResult = {

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

          sourceHash,

          packageManager,

          failureStage:
            "build",

          failureCategory:
            classification.category,

          errors: [
            error
          ],

          warnings: [],

          stdout:
            buildResult.stdout,

          stderr:
            buildResult.stderr,

          exitCode:
            buildResult.exitCode,

          signal:
            buildResult.signal,

          timedOut:
            buildResult.timedOut,

          outputTruncated:
            buildResult.truncated,

          summary: {

            durationMs:
              Date.now() -
              startedAt,

            buildDurationMs:
              buildResult.durationMs,

            fileCount:
              files.length,

            totalSize:
              fileValidation.totalSize

          }

        };


        finalResult.repairContext =
          createRepairContext({

            buildResult:
              finalResult,

            sourceHash,

            packageManager

          });


        return finalResult;

      }


      /* ---------------------------------------------------
         11. SUCCESS
      --------------------------------------------------- */

      const sourceHash =
        calculateSourceHash(
          files
        );


      logger.info(
        `[AuthoritativeBuildService] Build passed: ${buildId}`
      );


      return {

        success:
          true,

        status:
          "passed",

        authoritative:
          AUTHORITATIVE,

        validationMode:
          VALIDATION_MODE,

        serviceVersion:
          SERVICE_VERSION,

        buildId,

        sourceHash,

        packageManager,

        failureStage:
          null,

        failureCategory:
          null,

        errors: [],

        warnings: [],

        stdout:
          buildResult.stdout,

        stderr:
          buildResult.stderr,

        exitCode:
          buildResult.exitCode,

        signal:
          buildResult.signal,

        timedOut:
          false,

        outputTruncated:
          buildResult.truncated,

        summary: {

          durationMs:
            Date.now() -
            startedAt,

          buildDurationMs:
            buildResult.durationMs,

          fileCount:
            files.length,

          totalSize:
            fileValidation.totalSize

        },

        metadata: {

          dependenciesInstalled:
            true,

          buildCommandExecuted:
            true,

          generatedCodeExecuted:
            true,

          runtimeStarted:
            false,

          browserSmokeTested:
            false,

          dockerIsolated:
            true

        },

        validatedAt:
          new Date()

      };

    } finally {

      releaseBuildSlot();

    }

  } catch (error) {

    logger.error(
      `[AuthoritativeBuildService] Fatal build error: ${error.message}`
    );


    const sourceHash =
      calculateSourceHash(
        Array.isArray(
          projectData.files
        )
          ? projectData.files
          : []
      );


    const fatalIssue =
      createIssue({

        code:
          "AUTHORITATIVE_BUILD_SERVICE_ERROR",

        message:
          error.message,

        stage:
          "executor",

        details: {

          name:
            error.name

        }

      });


    const buildResult = {

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

      sourceHash,

      failureStage:
        "executor",

      failureCategory:
        "service",

      errors: [
        fatalIssue
      ],

      warnings: [],

      stdout:
        "",

      stderr:
        "",

      exitCode:
        null,

      summary: {

        durationMs:
          Date.now() -
          startedAt

      }

    };


    buildResult.repairContext =
      createRepairContext({

        buildResult,

        sourceHash

      });


    return buildResult;

  } finally {

    /* -----------------------------------------------------
       CLEANUP
    ----------------------------------------------------- */

    if (
      workspace
    ) {

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

      } catch (cleanupError) {

        logger.error(
          `[AuthoritativeBuildService] Workspace cleanup failed: ` +
          cleanupError.message
        );

      }

    }

  }

}


/* =========================================================
   QUICK API
========================================================= */

async function validateAndBuild(
  files = [],
  options = {}
) {

  return buildProject({

    files,

    projectId:
      options.projectId,

    projectName:
      options.projectName,

    framework:
      options.framework,

    nodeVersion:
      options.nodeVersion

  });

}


/* =========================================================
   BUILD READINESS
========================================================= */

function isAuthoritativeBuildReady(
  result
) {

  return (

    Boolean(result) &&

    result.success === true &&

    result.authoritative === true &&

    result.validationMode ===
      "authoritative" &&

    result.exitCode === 0 &&

    Array.isArray(
      result.errors
    ) &&

    result.errors.length === 0

  );

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  SERVICE_VERSION,

  VALIDATION_MODE,

  AUTHORITATIVE,

  buildProject,

  validateAndBuild,

  isAuthoritativeBuildReady,

  calculateSourceHash,

  detectPackageManager,

  normalizeFilePath,

  isSafeFilePath,

  getFilePath,

  getFileContent

};
