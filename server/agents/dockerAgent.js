/* =========================================================
   ZyrionOS DOCKER AGENT
   ---------------------------------------------------------
   Production Container Build + ECR Push

   RESPONSIBILITY

   Project Files
        ↓
   Runtime Detection
        ↓
   Project Validation
        ↓
   Isolated Workspace
        ↓
   Dockerfile Generation
        ↓
   Docker Build
        ↓
   ECR Repository
        ↓
   ECR Authentication
        ↓
   Docker Push
        ↓
   Immutable Image
        ↓
   AWS Agent


   IMPORTANT

   Docker Agent does NOT:

   - generate application source code
   - call AI providers
   - deploy directly to ECS
   - create domains
   - configure SSL
   - invent image URIs
   - expose project secrets
   - trust unsafe file paths
   - silently build an empty project


   RUNTIME SUPPORT

   Node / Express
   Next.js
   React / Vite
   Python / FastAPI / Flask


   IMAGE CONTRACT

   Returns:

   docker.imageUri
   docker.repositoryUri
   docker.repositoryName
   docker.containerPort
   docker.hostPort
   docker.runtime
   docker.sourceFileCount
   docker.sourceSize
   docker.status
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const fs =
  require("fs");

const path =
  require("path");

const crypto =
  require("crypto");

const {
  spawn,
} =
  require("child_process");

const {
  ECRClient,
  DescribeRepositoriesCommand,
  CreateRepositoryCommand,
  GetAuthorizationTokenCommand,
} =
  require("@aws-sdk/client-ecr");

const {
  v4: uuidv4,
} =
  require("uuid");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   CONFIGURATION
========================================================= */

const AWS_REGION =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "ap-south-1";


const WORKSPACE_ROOT =
  path.resolve(
    process.env.ZYRION_DOCKER_WORKSPACE ||
      path.join(
        process.cwd(),
        "workspace"
      )
  );


const ECR_REPOSITORY_PREFIX =
  process.env.ECR_REPOSITORY_PREFIX ||
  "zyrionos";


const MAX_FILES =
  500;


const MAX_FILE_SIZE =
  200000;


const MAX_TOTAL_SOURCE_SIZE =
  20000000;


const MAX_PATH_LENGTH =
  300;


const COMMAND_TIMEOUT_MS =
  Number(
    process.env.ZYRION_DOCKER_COMMAND_TIMEOUT_MS ||
      15 * 60 * 1000
  );


const DOCKER_BUILD_TIMEOUT_MS =
  Number(
    process.env.ZYRION_DOCKER_BUILD_TIMEOUT_MS ||
      20 * 60 * 1000
  );


const DOCKER_NODE_IMAGE =
  process.env.ZYRION_NODE_IMAGE ||
  "node:20-alpine";


const DOCKER_NEXT_IMAGE =
  process.env.ZYRION_NEXT_IMAGE ||
  "node:20-alpine";


const DOCKER_NGINX_IMAGE =
  process.env.ZYRION_NGINX_IMAGE ||
  "nginx:1.27-alpine";


const DOCKER_PYTHON_IMAGE =
  process.env.ZYRION_PYTHON_IMAGE ||
  "python:3.11-slim";


/* =========================================================
   ECR CLIENT
========================================================= */

const ecrClient =
  new ECRClient({
    region:
      AWS_REGION,
  });


/* =========================================================
   SUPPORTED FRAMEWORKS
========================================================= */

const FRAMEWORKS = {
  node: {
    normalized:
      "node",

    port:
      3000,

    runtime:
      "node",
  },

  express: {
    normalized:
      "node",

    port:
      3000,

    runtime:
      "node",
  },

  javascript: {
    normalized:
      "node",

    port:
      3000,

    runtime:
      "node",
  },

  next: {
    normalized:
      "next",

    port:
      3000,

    runtime:
      "next",
  },

  nextjs: {
    normalized:
      "next",

    port:
      3000,

    runtime:
      "next",
  },

  react: {
    normalized:
      "react",

    port:
      80,

    runtime:
      "react",
  },

  vite: {
    normalized:
      "react",

    port:
      80,

    runtime:
      "react",
  },

  python: {
    normalized:
      "python",

    port:
      8000,

    runtime:
      "python",
  },

  fastapi: {
    normalized:
      "python",

    port:
      8000,

    runtime:
      "python",
  },

  flask: {
    normalized:
      "python",

    port:
      8000,

    runtime:
      "python",
  },
};


/* =========================================================
   PROTECTED PATHS
========================================================= */

const PROTECTED_SEGMENTS =
  new Set([
    ".git",
    ".github",
    "node_modules",
    ".next",
    "dist",
    "build",
    "coverage",
    ".cache",
    ".turbo",
    ".aws",
    ".ssh",
  ]);


const PROTECTED_FILES =
  new Set([
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.test",
    ".env.example",
    "id_rsa",
    "id_rsa.pub",
    "authorized_keys",
  ]);


/* =========================================================
   STRING HELPERS
========================================================= */

function cleanString(
  value,
  maxLength = 4000
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .replace(
      /\u0000/g,
      ""
    )
    .trim()
    .slice(
      0,
      maxLength
    );
}


/* =========================================================
   OBJECT HELPERS
========================================================= */

function safeObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


/* =========================================================
   SUCCESS
========================================================= */

function isSuccessful(
  result
) {
  return Boolean(
    result &&
      result.success === true
  );
}


/* =========================================================
   FRAMEWORK NORMALIZATION
========================================================= */

function normalizeFramework(
  framework
) {
  const value =
    cleanString(
      framework ||
        "node",
      50
    ).toLowerCase();

  return (
    FRAMEWORKS[value] ||
    FRAMEWORKS.node
  );
}


/* =========================================================
   PROJECT NAME
========================================================= */

function normalizeProjectName(
  value
) {
  const cleaned =
    cleanString(
      value,
      100
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  if (
    !cleaned
  ) {
    throw new Error(
      "Invalid project name"
    );
  }

  return cleaned.slice(
    0,
    60
  );
}


/* =========================================================
   DEPLOYMENT ID
========================================================= */

function normalizeDeploymentId(
  value
) {
  if (!value) {
    return uuidv4();
  }

  const cleaned =
    cleanString(
      value,
      100
    );

  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      cleaned
    )
  ) {
    throw new Error(
      "Invalid deployment ID"
    );
  }

  return cleaned;
}


/* =========================================================
   SAFE FILE PATH
========================================================= */

function validateFilePath(
  fileName
) {
  if (
    typeof fileName !==
    "string"
  ) {
    throw new Error(
      "File path must be a string"
    );
  }

  let normalized =
    fileName
      .trim()
      .replace(
        /\\/g,
        "/"
      );

  while (
    normalized.startsWith(
      "./"
    )
  ) {
    normalized =
      normalized.slice(2);
  }

  if (
    !normalized
  ) {
    throw new Error(
      "File path is required"
    );
  }

  if (
    normalized.length >
    MAX_PATH_LENGTH
  ) {
    throw new Error(
      "File path is too long"
    );
  }

  if (
    normalized.startsWith("/")
  ) {
    throw new Error(
      "Absolute paths are not allowed"
    );
  }

  if (
    /^[A-Za-z]:\//.test(
      normalized
    )
  ) {
    throw new Error(
      "Windows absolute paths are not allowed"
    );
  }

  if (
    normalized.includes(
      "\0"
    )
  ) {
    throw new Error(
      "Invalid null byte in file path"
    );
  }

  const segments =
    normalized.split("/");

  if (
    segments.includes(
      ".."
    )
  ) {
    throw new Error(
      "Path traversal is not allowed"
    );
  }

  for (
    const segment of segments
  ) {
    if (
      PROTECTED_SEGMENTS.has(
        segment
      )
    ) {
      throw new Error(
        `Protected directory '${segment}' is not allowed`
      );
    }
  }

  const baseName =
    path.posix.basename(
      normalized
    );

  if (
    PROTECTED_FILES.has(
      baseName
    )
  ) {
    throw new Error(
      "Protected file is not allowed"
    );
  }

  const lowerName =
    baseName.toLowerCase();

  if (
    lowerName.endsWith(
      ".pem"
    ) ||
    lowerName.endsWith(
      ".key"
    ) ||
    lowerName.endsWith(
      ".p12"
    ) ||
    lowerName.endsWith(
      ".pfx"
    )
  ) {
    throw new Error(
      "Private credential files are not allowed"
    );
  }

  return normalized;
}


/* =========================================================
   PATH CONTAINMENT
========================================================= */

function isInside(
  root,
  target
) {
  const resolvedRoot =
    path.resolve(
      root
    );

  const resolvedTarget =
    path.resolve(
      target
    );

  return (
    resolvedTarget ===
      resolvedRoot ||
    resolvedTarget.startsWith(
      resolvedRoot +
        path.sep
    )
  );
}


/* =========================================================
   FILE INDEX
========================================================= */

function createFileIndex(
  files
) {
  const index =
    new Map();

  for (
    const file of files
  ) {
    const normalized =
      normalizeProjectFile(
        file
      );

    if (
      index.has(
        normalized.path
      )
    ) {
      throw new Error(
        `Duplicate project file: ${normalized.path}`
      );
    }

    index.set(
      normalized.path,
      normalized
    );
  }

  return index;
}


/* =========================================================
   NORMALIZE PROJECT FILE
========================================================= */

function normalizeProjectFile(
  file
) {
  if (
    !file ||
    typeof file !==
      "object"
  ) {
    throw new Error(
      "Invalid project file"
    );
  }

  const rawPath =
    file.path ||
    file.name;

  const filePath =
    validateFilePath(
      rawPath
    );

  const content =
    typeof file.content ===
      "string"
      ? file.content
      : "";

  const byteSize =
    Buffer.byteLength(
      content,
      "utf8"
    );

  if (
    byteSize >
    MAX_FILE_SIZE
  ) {
    throw new Error(
      `File exceeds maximum size: ${filePath}`
    );
  }

  return {
    path:
      filePath,

    content,
  };
}


/* =========================================================
   WRITE PROJECT FILES
========================================================= */

function writeProjectFiles(
  workspacePath,
  files
) {
  if (
    !Array.isArray(
      files
    )
  ) {
    throw new Error(
      "Project files must be an array"
    );
  }

  if (
    files.length === 0
  ) {
    throw new Error(
      "No project files provided"
    );
  }

  if (
    files.length >
    MAX_FILES
  ) {
    throw new Error(
      `Project contains too many files. Maximum: ${MAX_FILES}`
    );
  }

  const fileIndex =
    createFileIndex(
      files
    );

  let totalSize =
    0;

  const written =
    [];

  for (
    const normalized of fileIndex.values()
  ) {
    const fileSize =
      Buffer.byteLength(
        normalized.content,
        "utf8"
      );

    totalSize +=
      fileSize;

    if (
      totalSize >
      MAX_TOTAL_SOURCE_SIZE
    ) {
      throw new Error(
        "Total project source size exceeds maximum allowed size"
      );
    }

    const targetPath =
      path.resolve(
        workspacePath,
        normalized.path
      );

    if (
      !isInside(
        workspacePath,
        targetPath
      )
    ) {
      throw new Error(
        "Project file escapes isolated workspace"
      );
    }

    const directory =
      path.dirname(
        targetPath
      );

    fs.mkdirSync(
      directory,
      {
        recursive:
          true,
      }
    );

    fs.writeFileSync(
      targetPath,
      normalized.content,
      {
        encoding:
          "utf8",

        flag:
          "wx",
      }
    );

    written.push({
      path:
        normalized.path,

      size:
        fileSize,
    });
  }

  return {
    files:
      written,

    totalSize,
  };
}


/* =========================================================
   READ PROJECT FILE
========================================================= */

function getProjectFile(
  files,
  target
) {
  const normalizedTarget =
    target.replace(
      /\\/g,
      "/"
    );

  return files.find(
    (file) =>
      (
        file.path ||
        file.name ||
        ""
      ).replace(
        /\\/g,
        "/"
      ) ===
      normalizedTarget
  ) || null;
}


/* =========================================================
   PARSE PACKAGE.JSON
========================================================= */

function parsePackageJson(
  files
) {
  const packageFile =
    getProjectFile(
      files,
      "package.json"
    );

  if (
    !packageFile
  ) {
    return null;
  }

  try {
    return JSON.parse(
      packageFile.content
    );
  } catch {
    throw new Error(
      "package.json contains invalid JSON"
    );
  }
}


/* =========================================================
   NODE START SCRIPT
========================================================= */

function resolveNodeStartCommand(
  packageJson,
  framework
) {
  const scripts =
    safeObject(
      packageJson?.scripts
    );

  if (
    typeof scripts.start ===
    "string" &&
    scripts.start.trim()
  ) {
    return [
      "npm",
      "start",
    ];
  }

  if (
    framework.normalized ===
    "next"
  ) {
    return [
      "npm",
      "start",
    ];
  }

  if (
    typeof scripts.serve ===
    "string" &&
    scripts.serve.trim()
  ) {
    return [
      "npm",
      "run",
      "serve",
    ];
  }

  if (
    typeof scripts.preview ===
    "string" &&
    scripts.preview.trim()
  ) {
    return [
      "npm",
      "run",
      "preview",
      "--",
      "--host",
      "0.0.0.0",
    ];
  }

  const entryCandidates = [
    "server.js",
    "app.js",
    "index.js",
    "main.js",
  ];

  for (
    const candidate of entryCandidates
  ) {
    if (
      getProjectFile(
        global.__ZYRION_DOCKER_FILES__ || [],
        candidate
      )
    ) {
      return [
        "node",
        candidate,
      ];
    }
  }

  return null;
}


/* =========================================================
   PYTHON ENTRYPOINT
========================================================= */

function resolvePythonStartCommand(
  files,
  framework
) {
  if (
    framework.normalized ===
    "python"
  ) {
    const fastApiFiles = [
      "main.py",
      "app.py",
      "server.py",
    ];

    for (
      const candidate of fastApiFiles
    ) {
      if (
        getProjectFile(
          files,
          candidate
        )
      ) {
        const content =
          getProjectFile(
            files,
            candidate
          ).content;

        if (
          /fastapi/i.test(
            content
          ) &&
          /FastAPI\s*\(/i.test(
            content
          )
        ) {
          return [
            "uvicorn",
            `${candidate.replace(
              /\.py$/,
              ""
            )}:app`,
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
          ];
        }
      }
    }

    for (
      const candidate of [
        "app.py",
        "main.py",
        "server.py",
      ]
    ) {
      if (
        getProjectFile(
          files,
          candidate
        )
      ) {
        return [
          "python",
          candidate,
        ];
      }
    }
  }

  return null;
}


/* =========================================================
   PACKAGE REQUIREMENT VALIDATION
========================================================= */

function validateNodeProject(
  files,
  framework
) {
  const packageJson =
    parsePackageJson(
      files
    );

  if (
    !packageJson
  ) {
    throw new Error(
      "Node-based project requires package.json"
    );
  }

  if (
    !packageJson.name
  ) {
    logger.warning(
      "package.json has no package name"
    );
  }

  const dependencies = {
    ...safeObject(
      packageJson.dependencies
    ),
    ...safeObject(
      packageJson.devDependencies
    ),
  };

  if (
    framework.normalized ===
    "next" &&
    !(
      dependencies.next
    )
  ) {
    throw new Error(
      "Next.js project does not declare the 'next' dependency"
    );
  }

  if (
    framework.normalized ===
    "react" &&
    !(
      dependencies.react
    )
  ) {
    throw new Error(
      "React project does not declare the 'react' dependency"
    );
  }

  return {
    packageJson,
  };
}


/* =========================================================
   PYTHON PROJECT VALIDATION
========================================================= */

function validatePythonProject(
  files
) {
  const requirements =
    getProjectFile(
      files,
      "requirements.txt"
    );

  if (
    !requirements
  ) {
    throw new Error(
      "Python project requires requirements.txt"
    );
  }

  if (
    !requirements.content.trim()
  ) {
    throw new Error(
      "requirements.txt is empty"
    );
  }

  const startCommand =
    resolvePythonStartCommand(
      files,
      FRAMEWORKS.python
    );

  if (
    !startCommand
  ) {
    throw new Error(
      "Unable to determine Python application entrypoint"
    );
  }

  return {
    startCommand,
  };
}


/* =========================================================
   NODE DOCKERFILE
========================================================= */

function createNodeDockerfile(
  startCommand
) {
  const command =
    JSON.stringify(
      startCommand
    );

  return [
    `FROM ${DOCKER_NODE_IMAGE}`,
    "",
    "WORKDIR /app",
    "",
    "COPY package*.json ./",
    "",
    "RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi",
    "",
    "COPY . .",
    "",
    "ENV NODE_ENV=production",
    "ENV HOST=0.0.0.0",
    "ENV PORT=3000",
    "",
    "EXPOSE 3000",
    "",
    `CMD ${command}`,
    "",
  ].join("\n");
}


/* =========================================================
   NEXT DOCKERFILE
========================================================= */

function createNextDockerfile() {
  return [
    `FROM ${DOCKER_NEXT_IMAGE}`,
    "",
    "WORKDIR /app",
    "",
    "COPY package*.json ./",
    "",
    "RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi",
    "",
    "COPY . .",
    "",
    "RUN npm run build",
    "",
    "ENV NODE_ENV=production",
    "ENV HOSTNAME=0.0.0.0",
    "ENV PORT=3000",
    "",
    "EXPOSE 3000",
    "",
    "CMD [\"npm\", \"start\"]",
    "",
  ].join("\n");
}


/* =========================================================
   REACT / VITE DOCKERFILE
========================================================= */

function createReactDockerfile() {
  return [
    `FROM ${DOCKER_NODE_IMAGE} AS builder`,
    "",
    "WORKDIR /app",
    "",
    "COPY package*.json ./",
    "",
    "RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi",
    "",
    "COPY . .",
    "",
    "RUN npm run build",
    "",
    `FROM ${DOCKER_NGINX_IMAGE}`,
    "",
    "COPY --from=builder /app/dist /usr/share/nginx/html",
    "",
    "EXPOSE 80",
    "",
    "CMD [\"nginx\", \"-g\", \"daemon off;\"]",
    "",
  ].join("\n");
}


/* =========================================================
   PYTHON DOCKERFILE
========================================================= */

function createPythonDockerfile(
  startCommand
) {
  return [
    `FROM ${DOCKER_PYTHON_IMAGE}`,
    "",
    "WORKDIR /app",
    "",
    "ENV PYTHONDONTWRITEBYTECODE=1",
    "ENV PYTHONUNBUFFERED=1",
    "",
    "COPY requirements.txt ./",
    "",
    "RUN pip install --no-cache-dir -r requirements.txt",
    "",
    "COPY . .",
    "",
    "ENV HOST=0.0.0.0",
    "ENV PORT=8000",
    "",
    "EXPOSE 8000",
    "",
    `CMD ${JSON.stringify(
      startCommand
    )}`,
    "",
  ].join("\n");
}


/* =========================================================
   CREATE DOCKERFILE
========================================================= */

function createDockerfile(
  framework,
  context
) {
  switch (
    framework.normalized
  ) {
    case "next":
      return {
        content:
          createNextDockerfile(),

        containerPort:
          3000,

        startCommand: [
          "npm",
          "start",
        ],
      };

    case "react":
      return {
        content:
          createReactDockerfile(),

        containerPort:
          80,

        startCommand: [
          "nginx",
          "-g",
          "daemon off;",
        ],
      };

    case "python":
      return {
        content:
          createPythonDockerfile(
            context.startCommand
          ),

        containerPort:
          8000,

        startCommand:
          context.startCommand,
      };

    case "node":
    default:
      return {
        content:
          createNodeDockerfile(
            context.startCommand
          ),

        containerPort:
          3000,

        startCommand:
          context.startCommand,
      };
  }
}


/* =========================================================
   DOCKERIGNORE
========================================================= */

function createDockerignore() {
  return [
    "node_modules",
    ".next",
    "dist",
    "build",
    "coverage",
    ".cache",
    ".turbo",
    ".git",
    ".github",
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "npm-debug.log",
    "yarn-debug.log",
    "yarn-error.log",
    "Dockerfile",
    ".dockerignore",
    "",
  ].join("\n");
}


/* =========================================================
   WORKSPACE
========================================================= */

function createWorkspace(
  deploymentId
) {
  fs.mkdirSync(
    WORKSPACE_ROOT,
    {
      recursive:
        true,
    }
  );

  const workspacePath =
    path.resolve(
      WORKSPACE_ROOT,
      deploymentId
    );

  if (
    !isInside(
      WORKSPACE_ROOT,
      workspacePath
    )
  ) {
    throw new Error(
      "Workspace path escapes Docker workspace"
    );
  }

  fs.mkdirSync(
    workspacePath,
    {
      recursive:
        true,
    }
  );

  return workspacePath;
}


/* =========================================================
   PROCESS EXECUTION
========================================================= */

function runCommand(
  command,
  args,
  options = {}
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const timeoutMs =
        Number(
          options.timeoutMs ||
            COMMAND_TIMEOUT_MS
        );

      const child =
        spawn(
          command,
          args,
          {
            cwd:
              options.cwd,

            env:
              {
                ...process.env,
                ...(options.env || {}),
              },

            shell:
              false,

            stdio:
              [
                "pipe",
                "pipe",
                "pipe",
              ],
          }
        );

      let stdout =
        "";

      let stderr =
        "";

      let settled =
        false;

      const timer =
        setTimeout(
          () => {
            if (
              settled
            ) {
              return;
            }

            settled =
              true;

            try {
              child.kill(
                "SIGTERM"
              );
            } catch {}

            setTimeout(
              () => {
                try {
                  child.kill(
                    "SIGKILL"
                  );
                } catch {}
              },
              3000
            );

            reject(
              new Error(
                `${command} timed out after ${timeoutMs}ms`
              )
            );
          },
          timeoutMs
        );

      child.stdout.on(
        "data",
        (data) => {
          stdout +=
            data.toString();

          /*
           * Prevent unbounded process logs.
           */
          if (
            stdout.length >
            200000
          ) {
            stdout =
              stdout.slice(
                -200000
              );
          }
        }
      );

      child.stderr.on(
        "data",
        (data) => {
          stderr +=
            data.toString();

          if (
            stderr.length >
            200000
          ) {
            stderr =
              stderr.slice(
                -200000
              );
          }
        }
      );

      child.on(
        "error",
        (error) => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          clearTimeout(
            timer
          );

          reject(
            new Error(
              `${command} execution failed: ${error.message}`
            )
          );
        }
      );

      child.on(
        "close",
        (code) => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          clearTimeout(
            timer
          );

          if (
            code === 0
          ) {
            resolve({
              stdout,
              stderr,
              code,
            });

            return;
          }

          const output =
            stderr.trim() ||
            stdout.trim() ||
            `${command} exited with code ${code}`;

          reject(
            new Error(
              output
            )
          );
        }
      );
    }
  );
}


/* =========================================================
   DOCKER AVAILABILITY
========================================================= */

async function ensureDockerAvailable() {
  await runCommand(
    "docker",
    [
      "--version",
    ],
    {
      timeoutMs:
        30000,
    }
  );
}


/* =========================================================
   ECR REPOSITORY NAME
========================================================= */

function createRepositoryName(
  projectName
) {
  const hash =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        projectName
      )
      .digest(
        "hex"
      )
      .slice(
        0,
        8
      );

  return `${ECR_REPOSITORY_PREFIX}/${projectName}-${hash}`;
}


/* =========================================================
   ECR REPOSITORY
========================================================= */

async function ensureEcrRepository(
  repositoryName
) {
  try {
    const existing =
      await ecrClient.send(
        new DescribeRepositoriesCommand(
          {
            repositoryNames: [
              repositoryName,
            ],
          }
        )
      );

    const repository =
      existing
        ?.repositories?.[0];

    if (
      !repository?.repositoryUri
    ) {
      throw new Error(
        "ECR repository URI was not returned"
      );
    }

    return {
      created:
        false,

      repositoryUri:
        repository.repositoryUri,
    };
  } catch (error) {
    const statusCode =
      error?.$metadata
        ?.httpStatusCode;

    const notFound =
      statusCode === 400 ||
      statusCode === 404 ||
      error?.name ===
        "RepositoryNotFoundException";

    if (
      !notFound
    ) {
      throw error;
    }
  }

  const created =
    await ecrClient.send(
      new CreateRepositoryCommand(
        {
          repositoryName,

          imageScanningConfiguration:
            {
              scanOnPush:
                true,
            },

          imageTagMutability:
            "IMMUTABLE",
        }
      )
    );

  const repository =
    created?.repository;

  if (
    !repository?.repositoryUri
  ) {
    throw new Error(
      "ECR repository creation did not return repository URI"
    );
  }

  return {
    created:
      true,

    repositoryUri:
      repository.repositoryUri,
  };
}


/* =========================================================
   ECR AUTH
========================================================= */

async function getEcrAuthentication() {
  const response =
    await ecrClient.send(
      new GetAuthorizationTokenCommand(
        {}
      )
    );

  const authorizationData =
    response
      ?.authorizationData?.[0];

  if (
    !authorizationData
  ) {
    throw new Error(
      "AWS ECR authorization data unavailable"
    );
  }

  const token =
    authorizationData
      .authorizationToken;

  const proxyEndpoint =
    authorizationData
      .proxyEndpoint;

  if (
    !token ||
    !proxyEndpoint
  ) {
    throw new Error(
      "Incomplete AWS ECR authorization response"
    );
  }

  const decoded =
    Buffer
      .from(
        token,
        "base64"
      )
      .toString(
        "utf8"
      );

  const separator =
    decoded.indexOf(
      ":"
    );

  if (
    separator <= 0
  ) {
    throw new Error(
      "Invalid AWS ECR authorization token"
    );
  }

  return {
    username:
      decoded.slice(
        0,
        separator
      ),

    password:
      decoded.slice(
        separator + 1
      ),

    registry:
      proxyEndpoint.replace(
        /^https?:\/\//,
        ""
      ),
  };
}


/* =========================================================
   DOCKER LOGIN
========================================================= */

async function dockerLogin(
  username,
  password,
  registry
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const child =
        spawn(
          "docker",
          [
            "login",
            "--username",
            username,
            "--password-stdin",
            registry,
          ],
          {
            shell:
              false,

            stdio:
              [
                "pipe",
                "pipe",
                "pipe",
              ],
          }
        );

      let stdout =
        "";

      let stderr =
        "";

      let settled =
        false;

      const timer =
        setTimeout(
          () => {
            if (
              settled
            ) {
              return;
            }

            settled =
              true;

            try {
              child.kill(
                "SIGTERM"
              );
            } catch {}

            reject(
              new Error(
                "Docker ECR login timed out"
              )
            );
          },
          60000
        );

      child.stdout.on(
        "data",
        (data) => {
          stdout +=
            data.toString();
        }
      );

      child.stderr.on(
        "data",
        (data) => {
          stderr +=
            data.toString();
        }
      );

      child.on(
        "error",
        (error) => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          clearTimeout(
            timer
          );

          reject(
            new Error(
              `Docker ECR login failed: ${error.message}`
            )
          );
        }
      );

      child.on(
        "close",
        (code) => {
          if (
            settled
          ) {
            return;
          }

          settled =
            true;

          clearTimeout(
            timer
          );

          if (
            code !== 0
          ) {
            reject(
              new Error(
                stderr.trim() ||
                  stdout.trim() ||
                  `Docker login failed with code ${code}`
              )
            );

            return;
          }

          resolve({
            success:
              true,
          });
        }
      );

      child.stdin.write(
        password
      );

      child.stdin.end();
    }
  );
}


/* =========================================================
   BUILD IMAGE
========================================================= */

async function buildImage(
  workspacePath,
  imageTag
) {
  logger.info(
    `Docker build started: ${imageTag}`
  );

  await runCommand(
    "docker",
    [
      "build",
      "--pull",
      "--tag",
      imageTag,
      ".",
    ],
    {
      cwd:
        workspacePath,

      timeoutMs:
        DOCKER_BUILD_TIMEOUT_MS,
    }
  );

  logger.success(
    "Docker image build completed"
  );
}


/* =========================================================
   PUSH IMAGE
========================================================= */

async function pushImage(
  imageTag
) {
  logger.info(
    `Docker image push started: ${imageTag}`
  );

  await runCommand(
    "docker",
    [
      "push",
      imageTag,
    ],
    {
      timeoutMs:
        DOCKER_BUILD_TIMEOUT_MS,
    }
  );

  logger.success(
    "Docker image pushed to ECR"
  );
}


/* =========================================================
   REMOVE LOCAL IMAGE
========================================================= */

async function removeLocalImage(
  imageTag
) {
  try {
    await runCommand(
      "docker",
      [
        "image",
        "rm",
        imageTag,
      ],
      {
        timeoutMs:
          60000,
      }
    );
  } catch (error) {
    logger.warning(
      `Local Docker image cleanup failed: ${error.message}`
    );
  }
}


/* =========================================================
   REMOVE WORKSPACE
========================================================= */

function removeWorkspace(
  workspacePath
) {
  try {
    if (
      !isInside(
        WORKSPACE_ROOT,
        workspacePath
      )
    ) {
      return;
    }

    if (
      fs.existsSync(
        workspacePath
      )
    ) {
      fs.rmSync(
        workspacePath,
        {
          recursive:
            true,

          force:
            true,
        }
      );
    }
  } catch (error) {
    logger.warning(
      `Docker workspace cleanup failed: ${error.message}`
    );
  }
}


/* =========================================================
   RUNTIME CONTRACT
========================================================= */

function analyzeRuntimeContract(
  files,
  framework
) {
  const context = {
    startCommand:
      null,

    packageJson:
      null,

    runtime:
      framework.normalized,

    containerPort:
      framework.port,
  };

  if (
    framework.normalized ===
    "node" ||
    framework.normalized ===
    "next" ||
    framework.normalized ===
    "react"
  ) {
    const packageJson =
      parsePackageJson(
        files
      );

    context.packageJson =
      packageJson;

    if (
      framework.normalized ===
      "react"
    ) {
      validateNodeProject(
        files,
        framework
      );

      const scripts =
        safeObject(
          packageJson?.scripts
        );

      if (
        typeof scripts.build !==
        "string"
      ) {
        throw new Error(
          "React/Vite project requires a build script"
        );
      }

      context.startCommand = [
        "nginx",
        "-g",
        "daemon off;",
      ];

      return context;
    }

    if (
      framework.normalized ===
      "next"
    ) {
      validateNodeProject(
        files,
        framework
      );

      const scripts =
        safeObject(
          packageJson?.scripts
        );

      if (
        typeof scripts.build !==
        "string"
      ) {
        throw new Error(
          "Next.js project requires a build script"
        );
      }

      if (
        typeof scripts.start !==
        "string"
      ) {
        throw new Error(
          "Next.js project requires a start script"
        );
      }

      context.startCommand = [
        "npm",
        "start",
      ];

      return context;
    }

    validateNodeProject(
      files,
      framework
    );

    const startCommand =
      resolveNodeStartCommand(
        packageJson,
        framework
      );

    if (
      !startCommand
    ) {
      throw new Error(
        "Unable to determine Node.js application start command"
      );
    }

    context.startCommand =
      startCommand;

    return context;
  }

  if (
    framework.normalized ===
    "python"
  ) {
    const python =
      validatePythonProject(
        files
      );

    context.startCommand =
      python.startCommand;

    return context;
  }

  throw new Error(
    `Unsupported runtime: ${framework.normalized}`
  );
}


/* =========================================================
   DOCKERFILE WRITE
========================================================= */

function writeGeneratedDockerFiles(
  workspacePath,
  dockerfileData
) {
  const dockerfilePath =
    path.join(
      workspacePath,
      "Dockerfile"
    );

  const dockerignorePath =
    path.join(
      workspacePath,
      ".dockerignore"
    );

  fs.writeFileSync(
    dockerfilePath,
    dockerfileData.content,
    {
      encoding:
        "utf8",

      flag:
        "wx",
    }
  );

  fs.writeFileSync(
    dockerignorePath,
    createDockerignore(),
    {
      encoding:
        "utf8",

      flag:
        "wx",
    }
  );
}


/* =========================================================
   MAIN DOCKER AGENT
========================================================= */

async function dockerAgent(
  projectData = {}
) {
  let currentStage =
    "request-validation";

  let workspacePath =
    null;

  let imageTag =
    null;

  try {
    logger.info(
      "ZyrionOS Docker Agent Started"
    );


    /* =====================================================
       INPUT
    ===================================================== */

    if (
      !projectData ||
      typeof projectData !==
        "object" ||
      Array.isArray(projectData)
    ) {
      return {
        success:
          false,

        message:
          "Project data required",

        stage:
          currentStage,
      };
    }


    if (
      !projectData.projectName
    ) {
      return {
        success:
          false,

        message:
          "Project name required",

        stage:
          currentStage,
      };
    }


    const projectName =
      normalizeProjectName(
        projectData.projectName
      );


    const deploymentId =
      normalizeDeploymentId(
        projectData.deploymentId
      );


    const framework =
      normalizeFramework(
        projectData.framework
      );


    const files =
      Array.isArray(
        projectData.files
      )
        ? projectData.files
        : [];


    if (
      files.length ===
      0
    ) {
      return {
        success:
          false,

        message:
          "Project files required",

        error:
          "Docker Agent cannot build an empty project.",

        stage:
          currentStage,
      };
    }


    if (
      files.length >
      MAX_FILES
    ) {
      return {
        success:
          false,

        message:
          "Project contains too many files",

        error:
          `Maximum allowed files: ${MAX_FILES}`,

        stage:
          currentStage,
      };
    }


    /* =====================================================
       RUNTIME CONTRACT
    ===================================================== */

    currentStage =
      "runtime-contract";


    const runtime =
      analyzeRuntimeContract(
        files,
        framework
      );


    logger.info(
      `Runtime detected: ${runtime.runtime} | port=${runtime.containerPort}`
    );


    /* =====================================================
       DOCKER AVAILABILITY
    ===================================================== */

    currentStage =
      "docker-availability";


    await ensureDockerAvailable();


    /* =====================================================
       WORKSPACE
    ===================================================== */

    currentStage =
      "workspace-creation";


    workspacePath =
      createWorkspace(
        deploymentId
      );


    /* =====================================================
       SOURCE FILES
    ===================================================== */

    currentStage =
      "project-files";


    const written =
      writeProjectFiles(
        workspacePath,
        files
      );


    /* =====================================================
       DOCKERFILE
    ===================================================== */

    currentStage =
      "dockerfile-generation";


    const dockerfile =
      createDockerfile(
        framework,
        runtime
      );


    writeGeneratedDockerFiles(
      workspacePath,
      dockerfile
    );


    /* =====================================================
       ECR REPOSITORY
    ===================================================== */

    currentStage =
      "ecr-repository";


    const repositoryName =
      createRepositoryName(
        projectName
      );


    const ecrRepository =
      await ensureEcrRepository(
        repositoryName
      );


    const repositoryUri =
      ecrRepository.repositoryUri;


    /* =====================================================
       IMAGE TAG
    ===================================================== */

    currentStage =
      "image-tagging";


    /*
     * Deployment ID is unique, therefore each
     * deployment gets an immutable image tag.
     */

    imageTag =
      `${repositoryUri}:${deploymentId}`;


    /* =====================================================
       ECR AUTH
    ===================================================== */

    currentStage =
      "ecr-login";


    const authentication =
      await getEcrAuthentication();


    await dockerLogin(
      authentication.username,
      authentication.password,
      authentication.registry
    );


    /* =====================================================
       BUILD
    ===================================================== */

    currentStage =
      "docker-build";


    await buildImage(
      workspacePath,
      imageTag
    );


    /* =====================================================
       PUSH
    ===================================================== */

    currentStage =
      "ecr-push";


    await pushImage(
      imageTag
    );


    /* =====================================================
       LOCAL CLEANUP
    ===================================================== */

    currentStage =
      "cleanup";


    await removeLocalImage(
      imageTag
    );


    removeWorkspace(
      workspacePath
    );


    workspacePath =
      null;


    /* =====================================================
       RESULT
    ===================================================== */

    const result = {
      success:
        true,

      docker: {
        deploymentId,

        projectName,

        framework:
          framework.normalized,

        runtime:
          runtime.runtime,

        imageName:
          imageTag,

        imageUri:
          imageTag,

        repositoryName,

        repositoryUri,

        ecrRepositoryCreated:
          ecrRepository.created,

        containerPort:
          dockerfile.containerPort,

        hostPort:
          dockerfile.containerPort,

        startCommand:
          dockerfile.startCommand,

        workspacePath:
          null,

        dockerfileCreated:
          true,

        dockerIgnoreCreated:
          true,

        sourceFileCount:
          written.files.length,

        sourceSize:
          written.totalSize,

        dockerBuild:
          true,

        ecrPush:
          true,

        status:
          "image-pushed",

        immutable:
          true,

        createdAt:
          new Date().toISOString(),
      },

      metadata: {
        agent:
          "dockerAgent",

        version:
          "3.0.0",

        region:
          AWS_REGION,

        stage:
          "completed",
      },
    };


    logger.success(
      `Docker Agent Completed | image=${imageTag}`
    );


    return result;

  } catch (error) {
    const errorMessage =
      error?.message ||
      "Unknown Docker Agent error";


    logger.error(
      `Docker Agent Failed at ${currentStage}: ${errorMessage}`
    );


    if (
      imageTag
    ) {
      await removeLocalImage(
        imageTag
      );
    }


    if (
      workspacePath
    ) {
      removeWorkspace(
        workspacePath
      );
    }


    return {
      success:
        false,

      message:
        "Docker Agent Failed",

      error:
        errorMessage,

      stage:
        currentStage,

      deploymentId:
        projectData?.deploymentId ||
        null,

      metadata: {
        agent:
          "dockerAgent",

        version:
          "3.0.0",
      },
    };
  }
}


/* =========================================================
   AGENT METADATA
========================================================= */

dockerAgent.version =
  "3.0.0";


dockerAgent.owns = [
  "runtime-containerization",
  "docker-build",
  "docker-image",
  "ecr-repository",
  "ecr-authentication",
  "ecr-push",
  "image-artifact",
];


dockerAgent.dependencies = [
  "docker-runtime",
  "aws-ecr",
];


dockerAgent.contract = {
  input: {
    required: [
      "projectName",
      "deploymentId",
      "framework",
      "files",
    ],
  },

  output: {
    required: [
      "docker.imageUri",
      "docker.repositoryUri",
      "docker.containerPort",
      "docker.runtime",
      "docker.status",
    ],
  },
};


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  dockerAgent;
