/* =========================================================
   ZyrionOS DOCKER AGENT
   Production Container Build + ECR Push

   Flow:

   Builder Agent
        ↓
   Docker Agent
        ↓
   Validate project files
        ↓
   Create isolated workspace
        ↓
   Generate Dockerfile
        ↓
   Docker Build
        ↓
   ECR Repository
        ↓
   ECR Authentication
        ↓
   Docker Push
        ↓
   imageUri
        ↓
   AWS Agent
========================================================= */


/* =========================
   PACKAGES
========================= */

const fs =
  require("fs");

const path =
  require("path");

const crypto =
  require("crypto");

const {
  spawn
} =
  require("child_process");

const {
  ECRClient,
  DescribeRepositoriesCommand,
  CreateRepositoryCommand,
  GetAuthorizationTokenCommand
} =
  require("@aws-sdk/client-ecr");

const {
  v4: uuidv4
} =
  require("uuid");


/* =========================
   SERVICES
========================= */

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


/* =========================================================
   ECR CLIENT
========================================================= */

const ecrClient =
  new ECRClient({

    region:
      AWS_REGION

  });


/* =========================================================
   SUPPORTED FRAMEWORKS
========================================================= */

const FRAMEWORKS = {

  node: {

    normalized:
      "node",

    port:
      3000

  },

  express: {

    normalized:
      "node",

    port:
      3000

  },

  javascript: {

    normalized:
      "node",

    port:
      3000

  },

  next: {

    normalized:
      "next",

    port:
      3000

  },

  nextjs: {

    normalized:
      "next",

    port:
      3000

  },

  react: {

    normalized:
      "react",

    port:
      3000

  },

  vite: {

    normalized:
      "react",

    port:
      3000

  },

  python: {

    normalized:
      "python",

    port:
      8000

  },

  fastapi: {

    normalized:
      "python",

    port:
      8000

  },

  flask: {

    normalized:
      "python",

    port:
      8000

  }

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

    ".ssh"

  ]);


const PROTECTED_FILES =
  new Set([

    ".env",

    ".env.local",

    ".env.production",

    ".env.development",

    ".env.test",

    "id_rsa",

    "id_rsa.pub",

    "authorized_keys"

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
    .trim()
    .slice(
      0,
      maxLength
    );

}


/* =========================================================
   SAFE PROJECT NAME
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
   SAFE DEPLOYMENT ID
========================================================= */

function normalizeDeploymentId(
  value
) {

  if (
    !value
  ) {

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
   SAFE RELATIVE FILE PATH
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
    normalized.includes("\0")
  ) {

    throw new Error(
      "Invalid null byte in file path"
    );

  }


  const segments =
    normalized.split("/");


  if (
    segments.includes("..")
  ) {

    throw new Error(
      "Path traversal is not allowed"
    );

  }


  for (
    const segment
    of segments
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


  if (
    baseName.endsWith(
      ".pem"
    ) ||

    baseName.endsWith(
      ".key"
    ) ||

    baseName.endsWith(
      ".p12"
    ) ||

    baseName.endsWith(
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
   NORMALIZE FRAMEWORK
========================================================= */

function normalizeFramework(
  framework
) {

  const value =
    cleanString(
      framework ||
      "node",
      50
    )
      .toLowerCase();


  return (
    FRAMEWORKS[value] ||
    FRAMEWORKS.node
  );

}


/* =========================================================
   EXECUTE PROCESS
========================================================= */

/*
 * No shell command strings.
 *
 * This avoids shell injection through
 * project names, deployment IDs or paths.
 */

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

      const child =
        spawn(
          command,
          args,
          {

            cwd:
              options.cwd,

            env:
              process.env,

            shell:
              false,

            stdio:
              [
                "pipe",
                "pipe",
                "pipe"
              ]

          }
        );


      let stdout = "";

      let stderr = "";


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
            code === 0
          ) {

            resolve({

              stdout,
              stderr,
              code

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
   ENSURE DOCKER AVAILABLE
========================================================= */

async function ensureDockerAvailable() {

  await runCommand(
    "docker",
    [
      "--version"
    ]
  );

}


/* =========================================================
   CREATE ISOLATED WORKSPACE
========================================================= */

function createWorkspace(
  deploymentId
) {

  if (
    !isInside(
      WORKSPACE_ROOT,
      WORKSPACE_ROOT
    )
  ) {

    throw new Error(
      "Invalid Docker workspace root"
    );

  }


  fs.mkdirSync(
    WORKSPACE_ROOT,
    {
      recursive:
        true
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


  /*
   * Deployment IDs are unique, therefore
   * every build receives an isolated folder.
   */

  fs.mkdirSync(
    workspacePath,
    {
      recursive:
        true
    }
  );


  return workspacePath;

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


  /*
   * Builder Agent uses `path`.
   *
   * Older code may use `name`.
   *
   * Support both.
   */

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

    content

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


  let totalSize =
    0;


  const written =
    [];


  for (
    const file
    of files
  ) {

    const normalized =
      normalizeProjectFile(
        file
      );


    totalSize +=
      Buffer.byteLength(
        normalized.content,
        "utf8"
      );


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
          true
      }
    );


    fs.writeFileSync(
      targetPath,
      normalized.content,
      {
        encoding:
          "utf8",
        flag:
          "wx"
      }
    );


    written.push({

      path:
        normalized.path,

      size:
        Buffer.byteLength(
          normalized.content,
          "utf8"
        )

    });

  }


  return {

    files:
      written,

    totalSize

  };

}


/* =========================================================
   GENERATE NODE DOCKERFILE
========================================================= */

function createNodeDockerfile() {

  return [
    "FROM node:20-alpine",
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
    "ENV PORT=3000",
    "",
    "EXPOSE 3000",
    "",
    "CMD [\"npm\", \"start\"]",
    ""
  ].join("\n");

}


/* =========================================================
   GENERATE NEXT.JS DOCKERFILE
========================================================= */

function createNextDockerfile() {

  return [
    "FROM node:20-alpine",
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
    "ENV PORT=3000",
    "",
    "EXPOSE 3000",
    "",
    "CMD [\"npm\", \"start\"]",
    ""
  ].join("\n");

}


/* =========================================================
   GENERATE REACT/VITE DOCKERFILE
========================================================= */

function createReactDockerfile() {

  return [
    "FROM node:20-alpine AS builder",
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
    "FROM nginx:1.27-alpine",
    "",
    "COPY --from=builder /app/dist /usr/share/nginx/html",
    "",
    "EXPOSE 80",
    "",
    "CMD [\"nginx\", \"-g\", \"daemon off;\"]",
    ""
  ].join("\n");

}


/* =========================================================
   GENERATE PYTHON DOCKERFILE
========================================================= */

function createPythonDockerfile() {

  return [
    "FROM python:3.11-slim",
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
    "EXPOSE 8000",
    "",
    "CMD [\"python\", \"app.py\"]",
    ""
  ].join("\n");

}


/* =========================================================
   CREATE DOCKERFILE
========================================================= */

function createDockerfile(
  framework
) {

  switch (
    framework.normalized
  ) {

    case "next":

      return createNextDockerfile();


    case "react":

      return createReactDockerfile();


    case "python":

      return createPythonDockerfile();


    case "node":

    default:

      return createNodeDockerfile();

  }

}


/* =========================================================
   CREATE DOCKERIGNORE
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
    ""
  ].join("\n");

}


/* =========================================================
   CREATE ECR REPOSITORY NAME
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
   ENSURE ECR REPOSITORY
========================================================= */

async function ensureEcrRepository(
  repositoryName
) {

  try {

    const existing =
      await ecrClient.send(

        new DescribeRepositoriesCommand({

          repositoryNames: [
            repositoryName
          ]

        })

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
        repository.repositoryUri

    };

  }

  catch (error) {

    const statusCode =
      error?.$metadata?.httpStatusCode;


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

      new CreateRepositoryCommand({

        repositoryName,

        imageScanningConfiguration: {

          scanOnPush:
            true

        },

        imageTagMutability:
          "IMMUTABLE"

      })

    );


  const repository =
    created
      ?.repository;


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
      repository.repositoryUri

  };

}


/* =========================================================
   GET ECR AUTHENTICATION
========================================================= */

async function getEcrAuthentication() {

  const response =
    await ecrClient.send(

      new GetAuthorizationTokenCommand({})

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
    authorizationData.authorizationToken;


  const proxyEndpoint =
    authorizationData.proxyEndpoint;


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
      )

  };

}


/* =========================================================
   DOCKER LOGIN TO ECR
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
            registry
          ],

          {

            shell:
              false,

            stdio:
              [
                "pipe",
                "pipe",
                "pipe"
              ]

          }

        );


      let stdout =
        "";

      let stderr =
        "";


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
              true

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
    `Building Docker image: ${imageTag}`
  );


  await runCommand(

    "docker",

    [
      "build",
      "--pull",
      "--tag",
      imageTag,
      "."
    ],

    {
      cwd:
        workspacePath
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
    `Pushing Docker image: ${imageTag}`
  );


  await runCommand(

    "docker",

    [
      "push",
      imageTag
    ]

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
        imageTag
      ]

    );

  }

  catch (error) {

    /*
     * Cleanup failure should not
     * invalidate a successfully pushed
     * production image.
     */

    logger.warning(
      `Local Docker image cleanup failed: ${error.message}`
    );

  }

}


/* =========================================================
   CLEAN WORKSPACE
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
            true
        }
      );

    }

  }

  catch (error) {

    logger.warning(
      `Docker workspace cleanup failed: ${error.message}`
    );

  }

}


/* =========================================================
   DOCKER AGENT
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
      "🐳 ZyrionOS Docker Agent Started"
    );


    /* =====================================================
       VALIDATION
    ===================================================== */

    if (
      !projectData ||
      typeof projectData !==
        "object"
    ) {

      return {

        success:
          false,

        message:
          "Project data required",

        stage:
          currentStage

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
          currentStage

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


    if (
      !Array.isArray(
        projectData.files
      ) ||
      projectData.files.length ===
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
          currentStage

      };

    }


    /* =====================================================
       DOCKER CHECK
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
       PROJECT FILES
    ===================================================== */

    currentStage =
      "project-files";


    const written =
      writeProjectFiles(

        workspacePath,

        projectData.files

      );


    /* =====================================================
       DOCKERFILE
    ===================================================== */

    currentStage =
      "dockerfile-generation";


    const dockerfile =
      createDockerfile(
        framework
      );


    fs.writeFileSync(

      path.join(
        workspacePath,
        "Dockerfile"
      ),

      dockerfile,

      {
        encoding:
          "utf8",
        flag:
          "wx"
      }

    );


    /* =====================================================
       DOCKERIGNORE
    ===================================================== */

    const dockerignore =
      createDockerignore();


    fs.writeFileSync(

      path.join(
        workspacePath,
        ".dockerignore"
      ),

      dockerignore,

      {
        encoding:
          "utf8",
        flag:
          "wx"
      }

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


    imageTag =
      `${repositoryUri}:${deploymentId}`;


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
       ECR LOGIN
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


    const result = {

      success:
        true,

      docker: {

        deploymentId,

        projectName,

        framework:
          framework.normalized,

        runtime:
          framework.normalized,

        imageName:
          imageTag,

        imageUri:
          imageTag,

        repositoryName,

        repositoryUri,

        ecrRepositoryCreated:
          ecrRepository.created,

        containerPort:
          framework.port,

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

        createdAt:
          new Date().toISOString()

      }

    };


    logger.success(
      `🐳 Docker Agent Completed: ${imageTag}`
    );


    return result;

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown Docker Agent error";


    logger.error(
      `Docker Agent Failed at ${currentStage}: ${errorMessage}`
    );


    /*
     * Always attempt workspace cleanup
     * after failure.
     */

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
        null

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  dockerAgent;
