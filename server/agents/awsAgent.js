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
   Running Task Verification
      ↓
   Real Deployment State

   IMPORTANT:
   AWS Agent does NOT invent:
   - image URI
   - public URL
   - healthy state
   - ECR image
========================================================= */


/* =========================================================
   AWS CLIENTS
========================================================= */

const {
  ecs,
  ecr
} =
  require("../config/aws");


/* =========================================================
   AWS ECS COMMANDS
========================================================= */

const {
  DescribeClustersCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  UpdateServiceCommand,
  DescribeServicesCommand
} =
  require("@aws-sdk/client-ecs");


/* =========================================================
   AWS ECR COMMANDS
========================================================= */

const {
  DescribeImagesCommand
} =
  require("@aws-sdk/client-ecr");


/* =========================================================
   AWS CLOUDWATCH LOGS
========================================================= */

const {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateLogGroupCommand
} =
  require("@aws-sdk/client-cloudwatch-logs");


/* =========================================================
   PACKAGES
========================================================= */

const {
  v4: uuidv4
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


const ECS_CLUSTER =
  process.env.AWS_ECS_CLUSTER ||
  process.env.AWS_ECS_CLUSTER_NAME ||
  "";


const EXECUTION_ROLE_ARN =
  process.env.AWS_ECS_EXECUTION_ROLE ||
  "";


const DEFAULT_LOG_GROUP =
  process.env.AWS_ECS_LOG_GROUP ||
  "/ecs/zyrionos";


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


/* =========================================================
   SUPPORTED FRAMEWORKS
========================================================= */

const FRAMEWORK_CONFIG =
  {

    node: {

      port:
        3000

    },

    express: {

      port:
        3000

    },

    javascript: {

      port:
        3000

    },

    next: {

      port:
        3000

    },

    nextjs: {

      port:
        3000

    },

    react: {

      port:
        80

    },

    vite: {

      port:
        80

    },

    python: {

      port:
        8000

    },

    fastapi: {

      port:
        8000

    },

    flask: {

      port:
        8000

    }

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
   CPU / MEMORY VALIDATION
========================================================= */

function normalizeCpu(
  value
) {

  const cpu =
    String(
      value ||
      "512"
    ).trim();


  const allowed =
    new Set([

      "256",
      "512",
      "1024",
      "2048",
      "4096",
      "8192",
      "16384"

    ]);


  if (
    !allowed.has(
      cpu
    )
  ) {

    throw new Error(
      `Unsupported Fargate CPU value: ${cpu}`
    );

  }


  return cpu;

}


function normalizeMemory(
  value
) {

  const memory =
    String(
      value ||
      "1024"
    ).trim();


  const allowed =
    new Set([

      "512",
      "1024",
      "2048",
      "3072",
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

    ]);


  if (
    !allowed.has(
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
    FRAMEWORK_CONFIG[
      value
    ]
  ) {

    return {

      name:
        value,

      port:
        FRAMEWORK_CONFIG[
          value
        ].port

    };

  }


  /*
   * Unknown framework is treated as
   * node only when explicitly supplied
   * by upstream architecture.
   */

  return {

    name:
      "node",

    port:
      3000

  };

}


/* =========================================================
   IMAGE URI VALIDATION
========================================================= */

/*
 * Expected:
 *
 * ACCOUNT.dkr.ecr.REGION.amazonaws.com/
 * repository:tag
 */

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

      /^([0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com)\/(.+):([^/:]+)$/

    );


  if (
    !match
  ) {

    throw new Error(
      "Invalid ECR image URI"
    );

  }


  const registry =
    match[1];


  const repositoryName =
    match[2];


  const imageTag =
    match[3];


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

    registry,

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
      2000
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


  return subnets;

}


function getSecurityGroups() {

  const raw =
    cleanString(
      process.env.AWS_SECURITY_GROUP,
      1000
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


  return securityGroups;

}


/* =========================================================
   VERIFY REQUIRED CONFIG
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
    !process.env.AWS_SECURITY_GROUP
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

        ]

      })

    );


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


  return details;

}


/* =========================================================
   ENSURE CLOUDWATCH LOG GROUP
========================================================= */

async function ensureLogGroup(
  logGroupName
) {

  try {

    const response =
      await cloudWatchLogs.send(

        new DescribeLogGroupsCommand({

          logGroupNamePrefix:
            logGroupName,

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
            logGroupName
        );


    if (
      exists
    ) {

      return {

        created:
          false,

        logGroupName

      };

    }

  }

  catch (error) {

    /*
     * Continue to create it.
     */

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

        logGroupName

      })

    );


    logger.success(
      `CloudWatch Log Group Created: ${logGroupName}`
    );


    return {

      created:
        true,

      logGroupName

    };

  }

  catch (error) {

    /*
     * Another deployment may have
     * created it between lookup/create.
     */

    if (
      error?.name ===
      "ResourceAlreadyExistsException"
    ) {

      return {

        created:
          false,

        logGroupName

      };

    }


    throw error;

  }

}


/* =========================================================
   BUILD TASK FAMILY
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


/* =========================================================
   BUILD SERVICE NAME
========================================================= */

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
   REGISTER TASK DEFINITION
========================================================= */

async function registerTaskDefinition(
  data
) {

  const response =
    await ecs.send(

      new RegisterTaskDefinitionCommand({

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

            environment: [

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
                    data.containerPort
                  )

              }

            ],

            logConfiguration: {

              logDriver:
                "awslogs",

              options: {

                "awslogs-group":
                  data.logGroupName,

                "awslogs-region":
                  AWS_REGION,

                "awslogs-stream-prefix":
                  "ecs"

              }

            }

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
            100,

          maximumPercent:
            200,

          deploymentCircuitBreaker: {

            enable:
              true,

            rollback:
              true

          }

        },

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
          true

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
   VERIFY DEPLOYMENT
========================================================= */

async function verifyDeployment(
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
    service.runningCount ||
    0;


  const desiredCount =
    service.desiredCount ||
    0;


  const pendingCount =
    service.pendingCount ||
    0;


  let deploymentStatus =
    "PROVISIONING";


  if (
    runningCount >=
      desiredCount &&
    desiredCount > 0 &&
    pendingCount === 0
  ) {

    deploymentStatus =
      "RUNNING";

  }


  if (
    service.deployments &&
    service.deployments.length >
      0
  ) {

    const primary =
      service.deployments.find(
        (deployment) =>
          deployment.status ===
          "PRIMARY"
      );


    if (
      primary &&
      primary.runningCount >=
        primary.desiredCount &&
      primary.desiredCount > 0
    ) {

      deploymentStatus =
        "RUNNING";

    }

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

    taskDefinition:
      service.taskDefinition,

    serviceArn:
      service.serviceArn

  };

}


/* =========================================================
   AWS AGENT
========================================================= */

async function awsAgent(
  deploymentData = {}
) {

  let currentStage =
    "request-validation";


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
        "object"
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
     * Docker Agent MUST provide the
     * actual pushed ECR image.
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


    const desiredCount =
      Number(
        deploymentData.desiredCount ||
        1
      );


    if (
      !Number.isInteger(
        desiredCount
      ) ||
      desiredCount < 1 ||
      desiredCount > 10
    ) {

      throw new Error(
        "Desired task count must be between 1 and 10"
      );

    }


    const assignPublicIp =
      (
        String(
          deploymentData.assignPublicIp ??
          process.env.AWS_ASSIGN_PUBLIC_IP ??
          "ENABLED"
        )
          .toUpperCase() ===
        "DISABLED"
      )
        ? "DISABLED"
        : "ENABLED";


    const enableExecuteCommand =
      deploymentData.enableExecuteCommand ===
      true;


    const subnets =
      getSubnets();


    const securityGroups =
      getSecurityGroups();


    /* =====================================================
       RESOURCE NAMES
    ===================================================== */

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
      `${projectName}-container`
        .slice(
          0,
          255
        );


    const logGroupName =
      cleanString(
        deploymentData.logGroup ||
        DEFAULT_LOG_GROUP,
        512
      );


    /* =====================================================
       VERIFY CLUSTER
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

        imageUri:
          image.imageUri,

        containerName,

        containerPort:
          framework.port,

        cpu,

        memory,

        logGroupName:
          logGroup.logGroupName,

        taskRoleArn:
          deploymentData.taskRoleArn ||
          process.env.AWS_ECS_TASK_ROLE

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


    let service;

    let serviceAction;


    /* =====================================================
       CREATE SERVICE
    ===================================================== */

    if (
      !existingService
    ) {

      currentStage =
        "ecs-service-create";


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

          enableExecuteCommand

        });


      serviceAction =
        "created";


      logger.success(
        `ECS Service Created: ${serviceName}`
      );

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

          desiredCount

        });


      serviceAction =
        "updated";


      logger.success(
        `ECS Service Updated: ${serviceName}`
      );

    }


    /* =====================================================
       VERIFY SERVICE
    ===================================================== */

    currentStage =
      "ecs-deployment-verification";


    const deployment =
      await verifyDeployment(

        ECS_CLUSTER,

        serviceName

      );


    /* =====================================================
       REAL DEPLOYMENT STATE
    ===================================================== */

    const deploymentReady =
      deployment.exists &&
      deployment.runningCount >=
        deployment.desiredCount &&
      deployment.desiredCount > 0;


    const deploymentState =
      deploymentReady
        ? "running"
        : "provisioning";


    /* =====================================================
       NO FAKE PUBLIC URL
    ===================================================== */

    /*
     * ECS/Fargate itself does NOT automatically
     * create:
     *
     * https://service.domain
     *
     * Domain + ALB + Route53 will be handled
     * by the later Domain/Networking layer.
     */


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
            deployment.status,

          desiredCount:
            deployment.desiredCount,

          runningCount:
            deployment.runningCount,

          pendingCount:
            deployment.pendingCount,

          deploymentStatus:
            deployment.deploymentStatus

        },

        infrastructure: {

          launchType:
            "FARGATE",

          cpu,

          memory,

          containerPort:
            framework.port,

          subnets,

          securityGroups,

          assignPublicIp,

          enableExecuteCommand

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

        publicUrl:
          null,

        deployedAt:
          new Date().toISOString()

      }

    };


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
        null

    };

  }

}


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  awsAgent;
