/* =========================================================
   ZyrionOS AWS AGENT
   Production ECS Fargate Deployment

   FLOW:

   Builder
      ↓
   Docker Agent
      ↓
   ECR Image
      ↓
   AWS Agent
      ↓
   ECR Image Verification
      ↓
   ECS Cluster Verification
      ↓
   CloudWatch Logs
      ↓
   Task Definition
      ↓
   ECS Service Create / Update
      ↓
   Deployment Stabilization
      ↓
   Real Deployment State

   IMPORTANT:
   AWS Agent does NOT invent:
   - image URI
   - public URL
   - healthy state
   - ECR image
   - deployment success

   AWS Agent ONLY reports state verified
   from AWS APIs.
========================================================= */


/* =========================================================
   AWS CLIENTS
========================================================= */

const {
  ecs,
  ecr
} = require("../config/aws");


/* =========================================================
   AWS ECS COMMANDS
========================================================= */

const {
  DescribeClustersCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  UpdateServiceCommand,
  DescribeServicesCommand
} = require("@aws-sdk/client-ecs");


/* =========================================================
   AWS ECR COMMANDS
========================================================= */

const {
  DescribeImagesCommand
} = require("@aws-sdk/client-ecr");


/* =========================================================
   AWS CLOUDWATCH LOGS
========================================================= */

const {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateLogGroupCommand
} = require("@aws-sdk/client-cloudwatch-logs");


/* =========================================================
   PACKAGES
========================================================= */

const {
  v4: uuidv4
} = require("uuid");


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


const ECS_CLUSTER =
  process.env.AWS_ECS_CLUSTER ||
  process.env.AWS_ECS_CLUSTER_NAME ||
  "";


const EXECUTION_ROLE_ARN =
  process.env.AWS_ECS_EXECUTION_ROLE ||
  "";


const DEFAULT_TASK_ROLE_ARN =
  process.env.AWS_ECS_TASK_ROLE ||
  "";


const DEFAULT_LOG_GROUP =
  process.env.AWS_ECS_LOG_GROUP ||
  "/ecs/zyrionos";


const DEFAULT_DESIRED_COUNT =
  Number(
    process.env.AWS_ECS_DESIRED_COUNT ||
    1
  );


const DEFAULT_DEPLOYMENT_TIMEOUT_MS =
  Number(
    process.env.AWS_ECS_DEPLOYMENT_TIMEOUT_MS ||
    15 * 60 * 1000
  );


const DEFAULT_POLL_INTERVAL_MS =
  Number(
    process.env.AWS_ECS_DEPLOYMENT_POLL_INTERVAL_MS ||
    10000
  );


const DEFAULT_HEALTHY_PERCENT =
  Number(
    process.env.AWS_ECS_MIN_HEALTHY_PERCENT ||
    100
  );


const DEFAULT_MAX_PERCENT =
  Number(
    process.env.AWS_ECS_MAX_PERCENT ||
    200
  );


const cloudWatchLogs =
  new CloudWatchLogsClient({

    region:
      AWS_REGION

  });


/* =========================================================
   LIMITS
========================================================= */

const MAX_PROJECT_NAME_LENGTH =
  60;


const MAX_SERVICE_NAME_LENGTH =
  255;


const MAX_TASK_FAMILY_LENGTH =
  255;


const MAX_CONTAINER_NAME_LENGTH =
  255;


const MAX_LOG_GROUP_LENGTH =
  512;


const MAX_ENVIRONMENT_VARIABLES =
  100;


const MAX_DESIRED_COUNT =
  10;


/* =========================================================
   SUPPORTED FRAMEWORKS
========================================================= */

const FRAMEWORK_CONFIG = {

  node: {
    port: 3000
  },

  express: {
    port: 3000
  },

  javascript: {
    port: 3000
  },

  next: {
    port: 3000
  },

  nextjs: {
    port: 3000
  },

  react: {
    port: 80
  },

  vite: {
    port: 80
  },

  python: {
    port: 8000
  },

  fastapi: {
    port: 8000
  },

  flask: {
    port: 8000
  }

};


/* =========================================================
   FARGATE CPU / MEMORY MATRIX
========================================================= */

const FARGATE_MEMORY_BY_CPU = {

  "256": new Set([

    "512",
    "1024",
    "2048"

  ]),

  "512": new Set([

    "1024",
    "2048",
    "3072",
    "4096"

  ]),

  "1024": new Set([

    "2048",
    "3072",
    "4096",
    "5120",
    "6144",
    "7168",
    "8192"

  ]),

  "2048": new Set([

    "4096",
    "5120",
    "6144",
    "7168",
    "8192",
    "9216",
    "10240",
    "11264",
    "12288",
    "13312",
    "14336",
    "15360",
    "16384"

  ]),

  "4096": new Set([

    "8192",
    "9216",
    "10240",
    "11264",
    "12288",
    "13312",
    "14336",
    "15360",
    "16384",
    "17408",
    "18432",
    "19456",
    "20480",
    "21504",
    "22528",
    "23552",
    "24576",
    "25600",
    "26624",
    "27648",
    "28672",
    "29696",
    "30720"

  ]),

  "8192": new Set([

    "16384",
    "20480",
    "24576",
    "28672",
    "32768",
    "36864",
    "40960",
    "45056",
    "49152",
    "53248",
    "57344",
    "61440"

  ]),

  "16384": new Set([

    "32768",
    "40960",
    "49152",
    "57344",
    "65536",
    "73728",
    "81920",
    "90112",
    "98304",
    "106496",
    "114688",
    "122880"

  ])

};


/* =========================================================
   SAFE STRING
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
   SAFE BOOLEAN
========================================================= */

function normalizeBoolean(
  value,
  fallback = false
) {

  if (
    typeof value ===
    "boolean"
  ) {

    return value;

  }


  if (
    typeof value !==
    "string"
  ) {

    return fallback;

  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    normalized ===
    "true"
  ) {

    return true;

  }


  if (
    normalized ===
    "false"
  ) {

    return false;

  }


  return fallback;

}


/* =========================================================
   SANITIZE AWS NAME
========================================================= */

function sanitizeName(
  name,
  maxLength = 60
) {

  const cleaned =
    cleanString(
      name,
      maxLength
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9-]+/g,
        "-"
      )
      .replace(
        /-+/g,
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
      "Invalid AWS resource name"
    );

  }


  return cleaned.slice(
    0,
    maxLength
  );

}


/* =========================================================
   DEPLOYMENT ID
========================================================= */

function normalizeDeploymentId(
  value
) {

  const deploymentId =
    cleanString(
      value,
      100
    );


  if (
    !deploymentId
  ) {

    return uuidv4();

  }


  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      deploymentId
    )
  ) {

    throw new Error(
      "Invalid deployment ID"
    );

  }


  return deploymentId;

}


/* =========================================================
   CPU NORMALIZATION
========================================================= */

function normalizeCpu(
  value
) {

  const cpu =
    String(
      value ||
      "512"
    ).trim();


  if (
    !FARGATE_MEMORY_BY_CPU[cpu]
  ) {

    throw new Error(
      `Unsupported Fargate CPU value: ${cpu}`
    );

  }


  return cpu;

}


/* =========================================================
   MEMORY NORMALIZATION
========================================================= */

function normalizeMemory(
  value
) {

  const memory =
    String(
      value ||
      "1024"
    ).trim();


  const allMemoryValues =
    new Set();


  for (
    const values
    of Object.values(
      FARGATE_MEMORY_BY_CPU
    )
  ) {

    for (
      const memoryValue
      of values
    ) {

      allMemoryValues.add(
        memoryValue
      );

    }

  }


  if (
    !allMemoryValues.has(
      memory
    )
  ) {

    throw new Error(
      `Unsupported Fargate memory value: ${memory}`
    );

  }


  return memory;

}


/* =========================================================
   CPU + MEMORY COMPATIBILITY
========================================================= */

function validateFargateResources(
  cpu,
  memory
) {

  const allowedMemory =
    FARGATE_MEMORY_BY_CPU[cpu];


  if (
    !allowedMemory
  ) {

    throw new Error(
      `Unsupported Fargate CPU value: ${cpu}`
    );

  }


  if (
    !allowedMemory.has(
      memory
    )
  ) {

    throw new Error(
      `Invalid Fargate CPU/memory combination: ${cpu} CPU with ${memory} MiB memory`
    );

  }


  return true;

}


/* =========================================================
   FRAMEWORK
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


  if (
    FRAMEWORK_CONFIG[value]
  ) {

    return {

      name:
        value,

      port:
        FRAMEWORK_CONFIG[value].port

    };

  }


  return {

    name:
      "node",

    port:
      3000

  };

}


/* =========================================================
   PORT
========================================================= */

function normalizePort(
  value,
  fallback
) {

  const port =
    Number(
      value ||
      fallback
    );


  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {

    throw new Error(
      `Invalid container port: ${value}`
    );

  }


  return port;

}


/* =========================================================
   IMAGE URI VALIDATION
========================================================= */

function parseEcrImageUri(
  imageUri
) {

  const value =
    cleanString(
      imageUri,
      1000
    );


  if (
    !value
  ) {

    throw new Error(
      "Docker image URI required"
    );

  }


  const match =
    value.match(

      /^([0-9]{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com\/(.+):([^/:]+)$/

    );


  if (
    !match
  ) {

    throw new Error(
      "Invalid ECR image URI"
    );

  }


  const accountId =
    match[1];


  const region =
    match[2];


  const repositoryName =
    match[3];


  const imageTag =
    match[4];


  if (
    region !==
    AWS_REGION
  ) {

    throw new Error(
      `ECR image region ${region} does not match AWS region ${AWS_REGION}`
    );

  }


  if (
    !repositoryName ||
    !imageTag
  ) {

    throw new Error(
      "ECR image repository or tag missing"
    );

  }


  return {

    imageUri:
      value,

    accountId,

    region,

    registry:
      `${accountId}.dkr.ecr.${region}.amazonaws.com`,

    repositoryName,

    imageTag

  };

}


/* =========================================================
   NETWORK CONFIG
========================================================= */

function getSubnets() {

  const raw =
    cleanString(
      process.env.AWS_SUBNETS,
      4000
    );


  if (
    !raw
  ) {

    throw new Error(
      "AWS_SUBNETS is not configured"
    );

  }


  const subnets =
    raw
      .split(",")
      .map(
        (item) =>
          item.trim()
      )
      .filter(
        Boolean
      );


  if (
    subnets.length ===
    0
  ) {

    throw new Error(
      "No AWS subnets configured"
    );

  }


  const unique =
    [
      ...new Set(
        subnets
      )
    ];


  for (
    const subnet
    of unique
  ) {

    if (
      !/^subnet-[a-zA-Z0-9]+$/.test(
        subnet
      )
    ) {

      throw new Error(
        `Invalid subnet ID: ${subnet}`
      );

    }

  }


  return unique;

}


/* =========================================================
   SECURITY GROUPS
========================================================= */

function getSecurityGroups() {

  const raw =
    cleanString(
      process.env.AWS_SECURITY_GROUP ||
      process.env.AWS_SECURITY_GROUPS,
      2000
    );


  if (
    !raw
  ) {

    throw new Error(
      "AWS_SECURITY_GROUP is not configured"
    );

  }


  const securityGroups =
    raw
      .split(",")
      .map(
        (item) =>
          item.trim()
      )
      .filter(
        Boolean
      );


  if (
    securityGroups.length ===
    0
  ) {

    throw new Error(
      "No AWS security groups configured"
    );

  }


  const unique =
    [
      ...new Set(
        securityGroups
      )
    ];


  for (
    const securityGroup
    of unique
  ) {

    if (
      !/^sg-[a-zA-Z0-9]+$/.test(
        securityGroup
      )
    ) {

      throw new Error(
        `Invalid security group ID: ${securityGroup}`
      );

    }

  }


  return unique;

}


/* =========================================================
   CONFIGURATION VALIDATION
========================================================= */

function validateConfiguration() {

  const missing = [];


  if (
    !ECS_CLUSTER
  ) {

    missing.push(
      "AWS_ECS_CLUSTER"
    );

  }


  if (
    !EXECUTION_ROLE_ARN
  ) {

    missing.push(
      "AWS_ECS_EXECUTION_ROLE"
    );

  }


  if (
    !process.env.AWS_SUBNETS
  ) {

    missing.push(
      "AWS_SUBNETS"
    );

  }


  if (
    !(
      process.env.AWS_SECURITY_GROUP ||
      process.env.AWS_SECURITY_GROUPS
    )
  ) {

    missing.push(
      "AWS_SECURITY_GROUP"
    );

  }


  if (
    missing.length > 0
  ) {

    throw new Error(
      `Missing AWS configuration: ${missing.join(", ")}`
    );

  }


  if (
    !Number.isFinite(
      DEFAULT_DEPLOYMENT_TIMEOUT_MS
    ) ||
    DEFAULT_DEPLOYMENT_TIMEOUT_MS <
      30000
  ) {

    throw new Error(
      "AWS_ECS_DEPLOYMENT_TIMEOUT_MS must be at least 30000ms"
    );

  }

}


/* =========================================================
   VERIFY ECS CLUSTER
========================================================= */

async function verifyCluster(
  clusterName
) {

  const response =
    await ecs.send(

      new DescribeClustersCommand({

        clusters: [
          clusterName
        ],

        include: [
          "ATTACHMENTS",
          "CONFIGURATIONS",
          "SETTINGS",
          "STATISTICS",
          "TAGS"
        ]

      })

    );


  if (
    response?.failures?.length
  ) {

    const failure =
      response.failures[0];


    throw new Error(
      `ECS cluster lookup failed: ${failure.reason || failure.detail || "unknown error"}`
    );

  }


  const cluster =
    response
      ?.clusters?.[0];


  if (
    !cluster
  ) {

    throw new Error(
      `ECS cluster not found: ${clusterName}`
    );

  }


  if (
    cluster.status !==
    "ACTIVE"
  ) {

    throw new Error(
      `ECS cluster is not ACTIVE: ${cluster.status || "unknown"}`
    );

  }


  return cluster;

}


/* =========================================================
   VERIFY ECR IMAGE
========================================================= */

async function verifyEcrImage(
  image
) {

  const response =
    await ecr.send(

      new DescribeImagesCommand({

        repositoryName:
          image.repositoryName,

        imageIds: [

          {
            imageTag:
              image.imageTag
          }

        ]

      })

    );


  const details =
    response
      ?.imageDetails?.[0];


  if (
    !details
  ) {

    throw new Error(
      `ECR image not found: ${image.imageUri}`
    );

  }


  if (
    !details.imageDigest
  ) {

    throw new Error(
      `ECR image has no digest: ${image.imageUri}`
    );

  }


  return details;

}


/* =========================================================
   ENSURE CLOUDWATCH LOG GROUP
========================================================= */

async function ensureLogGroup(
  logGroupName
) {

  const name =
    cleanString(
      logGroupName,
      MAX_LOG_GROUP_LENGTH
    );


  if (
    !name
  ) {

    throw new Error(
      "CloudWatch log group name required"
    );

  }


  if (
    !name.startsWith("/")
  ) {

    throw new Error(
      "CloudWatch log group must start with /"
    );

  }


  try {

    const response =
      await cloudWatchLogs.send(

        new DescribeLogGroupsCommand({

          logGroupNamePrefix:
            name,

          limit:
            50

        })

      );


    const exists =
      response
        ?.logGroups
        ?.some(
          (group) =>
            group.logGroupName ===
            name
        );


    if (
      exists
    ) {

      return {

        created:
          false,

        logGroupName:
          name

      };

    }

  }

  catch (error) {

    if (
      error?.name !==
      "ResourceNotFoundException"
    ) {

      logger.warning(
        `CloudWatch log group lookup warning: ${error.message}`
      );

    }

  }


  try {

    await cloudWatchLogs.send(

      new CreateLogGroupCommand({

        logGroupName:
          name

      })

    );


    logger.success(
      `CloudWatch Log Group Created: ${name}`
    );


    return {

      created:
        true,

      logGroupName:
        name

    };

  }

  catch (error) {

    if (
      error?.name ===
      "ResourceAlreadyExistsException"
    ) {

      return {

        created:
          false,

        logGroupName:
          name

      };

    }


    throw error;

  }

}


/* =========================================================
   RESOURCE NAMES
========================================================= */

function createTaskFamily(
  projectName,
  deploymentId
) {

  const project =
    sanitizeName(
      projectName,
      MAX_PROJECT_NAME_LENGTH
    );


  const deployment =
    sanitizeName(
      deploymentId,
      80
    );


  return `${project}-${deployment}-task`
    .slice(
      0,
      MAX_TASK_FAMILY_LENGTH
    );

}


function createServiceName(
  projectName,
  deploymentId
) {

  const project =
    sanitizeName(
      projectName,
      60
    );


  const deployment =
    sanitizeName(
      deploymentId,
      80
    );


  return `${project}-${deployment}-service`
    .slice(
      0,
      MAX_SERVICE_NAME_LENGTH
    );

}


/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

function normalizeEnvironment(
  environment,
  containerPort
) {

  const result = [

    {
      name:
        "NODE_ENV",

      value:
        process.env.NODE_ENV ||
        "production"
    },

    {
      name:
        "PORT",

      value:
        String(
          containerPort
        )
    }

  ];


  if (
    !environment
  ) {

    return result;

  }


  if (
    !Array.isArray(
      environment
    )
  ) {

    throw new Error(
      "deploymentData.environment must be an array"
    );

  }


  if (
    environment.length >
    MAX_ENVIRONMENT_VARIABLES
  ) {

    throw new Error(
      `Environment variable count exceeds ${MAX_ENVIRONMENT_VARIABLES}`
    );

  }


  const reserved =
    new Set([

      "NODE_ENV",
      "PORT"

    ]);


  for (
    const item
    of environment
  ) {

    if (
      !item ||
      typeof item !==
        "object"
    ) {

      throw new Error(
        "Invalid environment variable entry"
      );

    }


    const name =
      cleanString(
        item.name,
        256
      );


    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
        name
      )
    ) {

      throw new Error(
        `Invalid environment variable name: ${name}`
      );

    }


    if (
      reserved.has(
        name
      )
    ) {

      continue;

    }


    const value =
      typeof item.value ===
      "string"
        ? item.value
        : String(
            item.value ??
            ""
          );


    result.push({

      name,

      value

    });

  }


  return result;

}


/* =========================================================
   TASK DEFINITION
========================================================= */

async function registerTaskDefinition(
  data
) {

  const response =
    await ecs.send(

      new RegisterTaskDefinition({

        family:
          data.taskFamily,

        networkMode:
          "awsvpc",

        requiresCompatibilities: [

          "FARGATE"

        ],

        cpu:
          data.cpu,

        memory:
          data.memory,

        executionRoleArn:
          EXECUTION_ROLE_ARN,

        ...(data.taskRoleArn
          ? {
              taskRoleArn:
                data.taskRoleArn
            }
          : {}),

        containerDefinitions: [

          {

            name:
              data.containerName,

            image:
              data.imageUri,

            essential:
              true,

            cpu:
              Number(
                data.cpu
              ),

            memory:
              Number(
                data.memory
              ),

            portMappings: [

              {

                containerPort:
                  data.containerPort,

                hostPort:
                  data.containerPort,

                protocol:
                  "tcp"

              }

            ],

            environment:
              data.environment,

            logConfiguration: {

              logDriver:
                "awslogs",

              options: {

                "awslogs-group":
                  data.logGroupName,

                "awslogs-region":
                  AWS_REGION,

                "awslogs-stream-prefix":
                  "zyrionos"

              }

            }

          }

        ],

        tags: [

          {

            key:
              "Project",

            value:
              data.projectName

          },

          {

            key:
              "DeploymentId",

            value:
              data.deploymentId

          },

          {

            key:
              "ManagedBy",

            value:
              "ZyrionOS"

          }

        ]

      })

    );


  const taskDefinition =
    response
      ?.taskDefinition;


  if (
    !taskDefinition?.taskDefinitionArn
  ) {

    throw new Error(
      "ECS task definition ARN was not returned"
    );

  }


  return taskDefinition;

}


/* =========================================================
   CREATE ECS SERVICE
========================================================= */

async function createEcsService(
  data
) {

  const response =
    await ecs.send(

      new CreateServiceCommand({

        cluster:
          data.clusterName,

        serviceName:
          data.serviceName,

        taskDefinition:
          data.taskDefinitionArn,

        desiredCount:
          data.desiredCount,

        launchType:
          "FARGATE",

        deploymentConfiguration: {

          minimumHealthyPercent:
            data.minimumHealthyPercent,

          maximumPercent:
            data.maximumPercent,

          deploymentCircuitBreaker: {

            enable:
              true,

            rollback:
              true

          }

        },

        healthCheckGracePeriodSeconds:
          data.healthCheckGracePeriodSeconds,

        networkConfiguration: {

          awsvpcConfiguration: {

            subnets:
              data.subnets,

            securityGroups:
              data.securityGroups,

            assignPublicIp:
              data.assignPublicIp

          }

        },

        enableExecuteCommand:
          data.enableExecuteCommand,

        tags: [

          {

            key:
              "Project",

            value:
              data.projectName

          },

          {

            key:
              "DeploymentId",

            value:
              data.deploymentId

          },

          {

            key:
              "ManagedBy",

            value:
              "ZyrionOS"

          }

        ]

      })

    );


  const service =
    response
      ?.service;


  if (
    !service?.serviceArn
  ) {

    throw new Error(
      "ECS service creation did not return service ARN"
    );

  }


  return service;

}


/* =========================================================
   UPDATE ECS SERVICE
========================================================= */

async function updateEcsService(
  data
) {

  const response =
    await ecs.send(

      new UpdateServiceCommand({

        cluster:
          data.clusterName,

        service:
          data.serviceName,

        taskDefinition:
          data.taskDefinitionArn,

        desiredCount:
          data.desiredCount,

        forceNewDeployment:
          true,

        deploymentConfiguration: {

          minimumHealthyPercent:
            data.minimumHealthyPercent,

          maximumPercent:
            data.maximumPercent,

          deploymentCircuitBreaker: {

            enable:
              true,

            rollback:
              true

          }

        },

        healthCheckGracePeriodSeconds:
          data.healthCheckGracePeriodSeconds,

        enableExecuteCommand:
          data.enableExecuteCommand

      })

    );


  const service =
    response
      ?.service;


  if (
    !service?.serviceArn
  ) {

    throw new Error(
      "ECS service update did not return service ARN"
    );

  }


  return service;

}


/* =========================================================
   FIND EXISTING SERVICE
========================================================= */

async function findService(
  clusterName,
  serviceName
) {

  const response =
    await ecs.send(

      new DescribeServicesCommand({

        cluster:
          clusterName,

        services: [

          serviceName

        ]

      })

    );


  if (
    response?.failures?.length
  ) {

    const failure =
      response.failures[0];


    if (
      failure.reason ===
      "MISSING"
    ) {

      return null;

    }


    throw new Error(
      `ECS service lookup failed: ${failure.reason || failure.detail || "unknown error"}`
    );

  }


  const service =
    response
      ?.services?.[0];


  if (
    !service
  ) {

    return null;

  }


  if (
    service.status ===
    "INACTIVE"
  ) {

    return null;

  }


  return service;

}


/* =========================================================
   DESCRIBE DEPLOYMENT STATE
========================================================= */

async function describeDeployment(
  clusterName,
  serviceName
) {

  const response =
    await ecs.send(

      new DescribeServicesCommand({

        cluster:
          clusterName,

        services: [

          serviceName

        ]

      })

    );


  if (
    response?.failures?.length
  ) {

    const failure =
      response.failures[0];


    return {

      exists:
        false,

      status:
        "NOT_FOUND",

      failure:
        failure.reason ||
        failure.detail ||
        "unknown",

      runningCount:
        0,

      desiredCount:
        0,

      pendingCount:
        0,

      deploymentStatus:
        "UNKNOWN"

    };

  }


  const service =
    response
      ?.services?.[0];


  if (
    !service
  ) {

    return {

      exists:
        false,

      status:
        "NOT_FOUND",

      runningCount:
        0,

      desiredCount:
        0,

      pendingCount:
        0,

      deploymentStatus:
        "UNKNOWN"

    };

  }


  const runningCount =
    Number(
      service.runningCount ||
      0
    );


  const desiredCount =
    Number(
      service.desiredCount ||
      0
    );


  const pendingCount =
    Number(
      service.pendingCount ||
      0
    );


  const failedDeployments =
    (
      service.deployments ||
      []
    )
      .filter(
        (deployment) =>
          deployment.rolloutState ===
            "FAILED" ||
          deployment.rolloutStateReason
      );


  const primary =
    (
      service.deployments ||
      []
    )
      .find(
        (deployment) =>
          deployment.status ===
          "PRIMARY"
      );


  let deploymentStatus =
    "PROVISIONING";


  if (
    primary?.rolloutState ===
    "FAILED"
  ) {

    deploymentStatus =
      "FAILED";

  }

  else if (
    primary?.rolloutState ===
    "COMPLETED"
  ) {

    deploymentStatus =
      "RUNNING";

  }

  else if (
    runningCount >=
      desiredCount &&
    desiredCount > 0 &&
    pendingCount === 0
  ) {

    deploymentStatus =
      "RUNNING";

  }

  else if (
    runningCount > 0
  ) {

    deploymentStatus =
      "STARTING";

  }


  return {

    exists:
      true,

    status:
      service.status,

    runningCount,

    desiredCount,

    pendingCount,

    deploymentStatus,

    rolloutState:
      primary?.rolloutState ||
      null,

    rolloutStateReason:
      primary?.rolloutStateReason ||
      null,

    taskDefinition:
      service.taskDefinition,

    serviceArn:
      service.serviceArn,

    serviceName:
      service.serviceName,

    createdAt:
      service.createdAt ||
      null,

    deployments:
      service.deployments ||
      [],

    failedDeployments

  };

}


/* =========================================================
   WAIT FOR DEPLOYMENT
========================================================= */

async function waitForDeployment(
  clusterName,
  serviceName,
  options = {}
) {

  const timeoutMs =
    Number(
      options.timeoutMs ||
      DEFAULT_DEPLOYMENT_TIMEOUT_MS
    );


  const pollIntervalMs =
    Number(
      options.pollIntervalMs ||
      DEFAULT_POLL_INTERVAL_MS
    );


  const startedAt =
    Date.now();


  let lastState =
    null;


  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {

    const state =
      await describeDeployment(
        clusterName,
        serviceName
      );


    lastState =
      state;


    logger.info(
      `AWS deployment state: ${state.deploymentStatus} | running=${state.runningCount}/${state.desiredCount} | pending=${state.pendingCount}`
    );


    if (
      state.deploymentStatus ===
      "FAILED"
    ) {

      return {

        success:
          false,

        stable:
          false,

        timedOut:
          false,

        state

      };

    }


    if (
      state.deploymentStatus ===
      "RUNNING"
    ) {

      return {

        success:
          true,

        stable:
          true,

        timedOut:
          false,

        state

      };

    }


    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          pollIntervalMs
        )
    );

  }


  return {

    success:
      false,

    stable:
      false,

    timedOut:
      true,

    state:
      lastState

  };

}


/* =========================================================
   HEALTH CHECK GRACE PERIOD
========================================================= */

function normalizeHealthGracePeriod(
  value
) {

  const gracePeriod =
    Number(
      value ??
      process.env.AWS_ECS_HEALTH_CHECK_GRACE_PERIOD ||
      60
    );


  if (
    !Number.isInteger(
      gracePeriod
    ) ||
    gracePeriod < 0 ||
    gracePeriod > 3600
  ) {

    throw new Error(
      "Health check grace period must be between 0 and 3600 seconds"
    );

  }


  return gracePeriod;

}


/* =========================================================
   DEPLOYMENT PERCENTAGES
========================================================= */

function normalizeDeploymentPercentages(
  deploymentData
) {

  const minimumHealthyPercent =
    Number(
      deploymentData.minimumHealthyPercent ??
      DEFAULT_HEALTHY_PERCENT
    );


  const maximumPercent =
    Number(
      deploymentData.maximumPercent ??
      DEFAULT_MAX_PERCENT
    );


  if (
    !Number.isInteger(
      minimumHealthyPercent
    ) ||
    minimumHealthyPercent < 0 ||
    minimumHealthyPercent > 100
  ) {

    throw new Error(
      "minimumHealthyPercent must be between 0 and 100"
    );

  }


  if (
    !Number.isInteger(
      maximumPercent
    ) ||
    maximumPercent < 100 ||
    maximumPercent > 200
  ) {

    throw new Error(
      "maximumPercent must be between 100 and 200"
    );

  }


  return {

    minimumHealthyPercent,

    maximumPercent

  };

}


/* =========================================================
   DESIRED COUNT
========================================================= */

function normalizeDesiredCount(
  value
) {

  const desiredCount =
    Number(
      value ??
      DEFAULT_DESIRED_COUNT
    );


  if (
    !Number.isInteger(
      desiredCount
    ) ||
    desiredCount < 1 ||
    desiredCount > MAX_DESIRED_COUNT
  ) {

    throw new Error(
      `Desired task count must be between 1 and ${MAX_DESIRED_COUNT}`
    );

  }


  return desiredCount;

}


/* =========================================================
   PUBLIC URL
========================================================= */

function getVerifiedPublicUrl(
  deploymentData
) {

  /*
   * AWS Agent intentionally does not
   * manufacture a URL.
   *
   * Only an authoritative URL supplied
   * by a later networking/domain layer
   * may be returned.
   */

  const candidate =
    deploymentData.verifiedPublicUrl ||
    deploymentData.publicUrl ||
    deploymentData.domain?.verifiedUrl ||
    null;


  if (
    typeof candidate !==
    "string"
  ) {

    return null;

  }


  const value =
    candidate.trim();


  if (
    !/^https?:\/\//i.test(
      value
    )
  ) {

    return null;

  }


  return value;

}


/* =========================================================
   AWS AGENT
========================================================= */

async function awsAgent(
  deploymentData = {}
) {

  let currentStage =
    "request-validation";


  const startedAt =
    Date.now();


  try {

    logger.info(
      "☁️ ZyrionOS AWS Agent Started"
    );


    /* =====================================================
       INPUT VALIDATION
    ===================================================== */

    if (
      !deploymentData ||
      typeof deploymentData !==
        "object" ||
      Array.isArray(
        deploymentData
      )
    ) {

      return {

        success:
          false,

        message:
          "Deployment data required",

        stage:
          currentStage

      };

    }


    if (
      !deploymentData.projectName
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


    /*
     * Docker Agent MUST provide
     * the real ECR image.
     */

    const imageUri =
      deploymentData.imageUri ||
      deploymentData.image ||
      deploymentData.docker?.imageUri ||
      deploymentData.docker?.imageName;


    if (
      !imageUri
    ) {

      return {

        success:
          false,

        message:
          "ECR image URI required",

        error:
          "AWS Agent requires the real imageUri returned by Docker Agent.",

        stage:
          currentStage

      };

    }


    /* =====================================================
       CONFIGURATION
    ===================================================== */

    currentStage =
      "configuration-validation";


    validateConfiguration();


    const deploymentId =
      normalizeDeploymentId(
        deploymentData.deploymentId
      );


    const projectName =
      sanitizeName(
        deploymentData.projectName,
        MAX_PROJECT_NAME_LENGTH
      );


    const framework =
      normalizeFramework(
        deploymentData.framework
      );


    const containerPort =
      normalizePort(
        deploymentData.containerPort,
        framework.port
      );


    const image =
      parseEcrImageUri(
        imageUri
      );


    const cpu =
      normalizeCpu(
        deploymentData.cpu
      );


    const memory =
      normalizeMemory(
        deploymentData.ram ||
        deploymentData.memory
      );


    validateFargateResources(
      cpu,
      memory
    );


    const desiredCount =
      normalizeDesiredCount(
        deploymentData.desiredCount
      );


    const deploymentPercentages =
      normalizeDeploymentPercentages(
        deploymentData
      );


    const healthCheckGracePeriodSeconds =
      normalizeHealthGracePeriod(
        deploymentData.healthCheckGracePeriodSeconds
      );


    const assignPublicIp =
      String(
        deploymentData.assignPublicIp ??
        process.env.AWS_ASSIGN_PUBLIC_IP ??
        "ENABLED"
      )
        .toUpperCase() ===
      "DISABLED"
        ? "DISABLED"
        : "ENABLED";


    const enableExecuteCommand =
      normalizeBoolean(
        deploymentData.enableExecuteCommand,
        false
      );


    const subnets =
      getSubnets();


    const securityGroups =
      getSecurityGroups();


    const environment =
      normalizeEnvironment(
        deploymentData.environment,
        containerPort
      );


    /* =====================================================
       RESOURCE NAMES
    ===================================================== */

    currentStage =
      "resource-name-generation";


    const taskFamily =
      createTaskFamily(
        projectName,
        deploymentId
      );


    const serviceName =
      createServiceName(
        projectName,
        deploymentId
      );


    const containerName =
      sanitizeName(
        `${projectName}-container`,
        MAX_CONTAINER_NAME_LENGTH
      );


    const logGroupName =
      cleanString(
        deploymentData.logGroup ||
        DEFAULT_LOG_GROUP,
        MAX_LOG_GROUP_LENGTH
      );


    const taskRoleArn =
      cleanString(
        deploymentData.taskRoleArn ||
        DEFAULT_TASK_ROLE_ARN,
        1000
      );


    /* =====================================================
       VERIFY ECS CLUSTER
    ===================================================== */

    currentStage =
      "ecs-cluster-verification";


    const cluster =
      await verifyCluster(
        ECS_CLUSTER
      );


    logger.success(
      `ECS Cluster Verified: ${cluster.clusterName}`
    );


    /* =====================================================
       VERIFY ECR IMAGE
    ===================================================== */

    currentStage =
      "ecr-image-verification";


    const imageDetails =
      await verifyEcrImage(
        image
      );


    logger.success(
      `ECR Image Verified: ${image.imageUri}`
    );


    /* =====================================================
       CLOUDWATCH LOG GROUP
    ===================================================== */

    currentStage =
      "cloudwatch-log-group";


    const logGroup =
      await ensureLogGroup(
        logGroupName
      );


    /* =====================================================
       TASK DEFINITION
    ===================================================== */

    currentStage =
      "ecs-task-definition";


    const taskDefinition =
      await registerTaskDefinition({

        taskFamily,

        deploymentId,

        projectName,

        imageUri:
          image.imageUri,

        containerName,

        containerPort,

        cpu,

        memory,

        environment,

        logGroupName:
          logGroup.logGroupName,

        taskRoleArn:
          taskRoleArn ||
          undefined

      });


    logger.success(
      `ECS Task Definition Registered: ${taskDefinition.revision}`
    );


    /* =====================================================
       EXISTING SERVICE CHECK
    ===================================================== */

    currentStage =
      "ecs-service-check";


    const existingService =
      await findService(
        ECS_CLUSTER,
        serviceName
      );


    let service =
      null;


    let serviceAction =
      null;


    /* =====================================================
       CREATE SERVICE
    ===================================================== */

    if (
      !existingService
    ) {

      currentStage =
        "ecs-service-create";


      try {

        service =
          await createEcsService({

            clusterName:
              ECS_CLUSTER,

            serviceName,

            taskDefinitionArn:
              taskDefinition.taskDefinitionArn,

            desiredCount,

            subnets,

            securityGroups,

            assignPublicIp,

            enableExecuteCommand,

            projectName,

            deploymentId,

            minimumHealthyPercent:
              deploymentPercentages.minimumHealthyPercent,

            maximumPercent:
              deploymentPercentages.maximumPercent,

            healthCheckGracePeriodSeconds

          });


        serviceAction =
          "created";


        logger.success(
          `ECS Service Created: ${serviceName}`
        );

      }

      catch (error) {

        /*
         * Race condition protection:
         *
         * Another deployment may have created
         * the same service between our lookup
         * and CreateService call.
         */

        if (
          error?.name ===
          "ServiceAlreadyExistsException"
        ) {

          logger.warning(
            `ECS Service already exists. Switching to update: ${serviceName}`
          );


          currentStage =
            "ecs-service-update";


          service =
            await updateEcsService({

              clusterName:
                ECS_CLUSTER,

              serviceName,

              taskDefinitionArn:
                taskDefinition.taskDefinitionArn,

              desiredCount,

              enableExecuteCommand,

              minimumHealthyPercent:
                deploymentPercentages.minimumHealthyPercent,

              maximumPercent:
                deploymentPercentages.maximumPercent,

              healthCheckGracePeriodSeconds

            });


          serviceAction =
            "updated";

        }

        else {

          throw error;

        }

      }

    }

    /* =====================================================
       UPDATE SERVICE
    ===================================================== */

    else {

      currentStage =
        "ecs-service-update";


      service =
        await updateEcsService({

          clusterName:
            ECS_CLUSTER,

          serviceName,

          taskDefinitionArn:
            taskDefinition.taskDefinitionArn,

          desiredCount,

          enableExecuteCommand,

          minimumHealthyPercent:
            deploymentPercentages.minimumHealthyPercent,

          maximumPercent:
            deploymentPercentages.maximumPercent,

          healthCheckGracePeriodSeconds

        });


      serviceAction =
        "updated";


      logger.success(
        `ECS Service Updated: ${serviceName}`
      );

    }


    /* =====================================================
       DEPLOYMENT VERIFICATION
    ===================================================== */

    currentStage =
      "ecs-deployment-verification";


    const initialDeployment =
      await describeDeployment(

        ECS_CLUSTER,

        serviceName

      );


    if (
      !initialDeployment.exists
    ) {

      throw new Error(
        "ECS service disappeared immediately after deployment"
      );

    }


    /* =====================================================
       WAIT FOR ECS ROLLOUT
    ===================================================== */

    currentStage =
      "ecs-deployment-stabilization";


    const stabilization =
      await waitForDeployment(

        ECS_CLUSTER,

        serviceName,

        {

          timeoutMs:
            deploymentData.deploymentTimeoutMs ||
            DEFAULT_DEPLOYMENT_TIMEOUT_MS,

          pollIntervalMs:
            deploymentData.deploymentPollIntervalMs ||
            DEFAULT_POLL_INTERVAL_MS

        }

      );


    const finalDeployment =
      stabilization.state ||
      await describeDeployment(

        ECS_CLUSTER,

        serviceName

      );


    /* =====================================================
       REAL DEPLOYMENT STATE
    ===================================================== */

    const deploymentReady =
      stabilization.success &&
      finalDeployment.exists &&
      finalDeployment.runningCount >=
        finalDeployment.desiredCount &&
      finalDeployment.desiredCount > 0 &&
      finalDeployment.pendingCount === 0;


    let deploymentState =
      "provisioning";


    if (
      deploymentReady
    ) {

      deploymentState =
        "running";

    }

    else if (
      stabilization.timedOut
    ) {

      deploymentState =
        "timeout";

    }

    else if (
      finalDeployment.deploymentStatus ===
      "FAILED"
    ) {

      deploymentState =
        "failed";

    }


    /* =====================================================
       AUTHORITATIVE PUBLIC URL
    ===================================================== */

    const publicUrl =
      getVerifiedPublicUrl(
        deploymentData
      );


    /* =====================================================
       FINAL RESPONSE
    ===================================================== */

    const result = {

      success:
        true,

      aws: {

        deploymentId,

        provider:
          "AWS",

        region:
          AWS_REGION,

        projectName,

        framework:
          framework.name,

        image: {

          uri:
            image.imageUri,

          registry:
            image.registry,

          accountId:
            image.accountId,

          repository:
            image.repositoryName,

          tag:
            image.imageTag,

          digest:
            imageDetails.imageDigest ||
            null,

          pushedAt:
            imageDetails.imagePushedAt ||
            null,

          size:
            imageDetails.imageSizeInBytes ||
            null

        },

        ecs: {

          cluster:
            ECS_CLUSTER,

          clusterArn:
            cluster.clusterArn ||
            null,

          service:
            serviceName,

          serviceArn:
            service.serviceArn ||
            null,

          serviceAction,

          taskDefinition:
            taskDefinition.taskDefinitionArn,

          taskDefinitionRevision:
            taskDefinition.revision,

          status:
            finalDeployment.status,

          desiredCount:
            finalDeployment.desiredCount,

          runningCount:
            finalDeployment.runningCount,

          pendingCount:
            finalDeployment.pendingCount,

          deploymentStatus:
            finalDeployment.deploymentStatus,

          rolloutState:
            finalDeployment.rolloutState,

          rolloutStateReason:
            finalDeployment.rolloutStateReason

        },

        infrastructure: {

          launchType:
            "FARGATE",

          cpu,

          memory,

          containerPort,

          subnets,

          securityGroups,

          assignPublicIp,

          enableExecuteCommand,

          taskRoleConfigured:
            Boolean(
              taskRoleArn
            )

        },

        logging: {

          provider:
            "CloudWatch Logs",

          logGroup:
            logGroup.logGroupName,

          created:
            logGroup.created

        },

        deploymentState,

        deploymentReady,

        stabilization: {

          success:
            stabilization.success,

          stable:
            stabilization.stable,

          timedOut:
            stabilization.timedOut,

          timeoutMs:
            deploymentData.deploymentTimeoutMs ||
            DEFAULT_DEPLOYMENT_TIMEOUT_MS,

          pollIntervalMs:
            deploymentData.deploymentPollIntervalMs ||
            DEFAULT_POLL_INTERVAL_MS

        },

        publicUrl,

        deployedAt:
          new Date().toISOString(),

        durationMs:
          Date.now() -
          startedAt

      }

    };


    /*
     * A deployment may still be provisioning.
     * That is NOT the same as healthy.
     *
     * We therefore preserve success=true for
     * an accepted ECS deployment operation while
     * exposing deploymentReady/deploymentState
     * truthfully.
     */

    if (
      deploymentState ===
      "failed"
    ) {

      result.success =
        false;

      result.message =
        "ECS deployment rollout failed";

    }

    else if (
      deploymentState ===
      "timeout"
    ) {

      result.success =
        false;

      result.message =
        "ECS deployment did not stabilize within the configured timeout";

    }


    logger.success(
      `☁️ AWS Agent Completed: ${deploymentState}`
    );


    return result;

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown AWS deployment error";


    logger.error(
      `AWS Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success:
        false,

      message:
        "AWS deployment failed",

      error:
        errorMessage,

      stage:
        currentStage,

      deploymentId:
        deploymentData?.deploymentId ||
        null,

      durationMs:
        Date.now() -
        startedAt

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  awsAgent;
