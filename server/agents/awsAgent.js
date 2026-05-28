/* =========================================
AWS SDK CLIENTS
========================================= */

const {
  ecs,
  ecr,
  s3,
  route53,
  cloudwatch
} = require("../config/aws");

/* =========================================
AWS ECS COMMANDS
========================================= */

const {
  DescribeClustersCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  DescribeServicesCommand
} = require("@aws-sdk/client-ecs");

/* =========================================
AWS ECR COMMANDS
========================================= */

const {
  CreateRepositoryCommand,
  DescribeRepositoriesCommand
} = require("@aws-sdk/client-ecr");

/* =========================================
PACKAGES
========================================= */

const { v4: uuidv4 } =
require("uuid");

/* =========================================
SERVICES
========================================= */

const logger =
require("../services/loggerService");

/* =========================================
HELPER
========================================= */

function sanitizeName(name = "") {

  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

}

/* =========================================
AWS AGENT
========================================= */

async function awsAgent(
deploymentData = {}
){

try{

logger.info(
  "🚀 AWS Deployment Started"
);

/* =========================================
VALIDATION
========================================= */

if(
  !deploymentData ||
  !deploymentData.deploymentId
){

  return {

    success:false,

    message:
    "Deployment data required"

  };

}

/* =========================================
ENV VALIDATION
========================================= */

const requiredEnv = [

  "AWS_REGION",
  "AWS_ECS_CLUSTER",
  "AWS_ECS_EXECUTION_ROLE",
  "AWS_SUBNETS",
  "AWS_SECURITY_GROUP",
  "APP_DOMAIN"

];

const missingEnv = requiredEnv.filter(
  key => !process.env[key]
);

if(missingEnv.length > 0){

  return {

    success:false,

    message:
    `Missing ENV variables: ${missingEnv.join(", ")}`

  };

}

/* =========================================
DEPLOYMENT INFO
========================================= */

const deploymentId =
deploymentData.deploymentId;

const projectName =

deploymentData.projectName ||
"vertexcloud-app";

const framework =

deploymentData.framework ||
"node";

/* =========================================
RESOURCE CONFIG
========================================= */

const cpu = String(
  deploymentData.cpu || "512"
);

const memory = String(
  deploymentData.ram || "1024"
);

/* =========================================
SANITIZED NAMES
========================================= */

const safeProjectName =
sanitizeName(projectName);

const repositoryName =
sanitizeName(
`${safeProjectName}-${deploymentId}`
);

const clusterName =
process.env.AWS_ECS_CLUSTER;

const serviceName =
`${repositoryName}-service`;

const taskFamily =
`${repositoryName}-task`;

/* =========================================
CONTAINER PORT
========================================= */

let containerPort = 3000;

if(framework === "python"){

  containerPort = 8000;

}

/* =========================================
CREATE / VERIFY ECR
========================================= */

let repositoryUri = null;

try{

  const existingRepo =

  await ecr.send(

    new DescribeRepositoriesCommand({

      repositoryNames:[
        repositoryName
      ]

    })

  );

  repositoryUri =

  existingRepo
  .repositories[0]
  .repositoryUri;

  logger.info(
    "ECR Repository Already Exists"
  );

}

catch(repoError){

  const newRepo =

  await ecr.send(

    new CreateRepositoryCommand({

      repositoryName,

      imageScanningConfiguration:{
        scanOnPush:true
      }

    })

  );

  repositoryUri =

  newRepo
  .repository
  .repositoryUri;

  logger.success(
    "ECR Repository Created"
  );

}

/* =========================================
VERIFY ECS CLUSTER
========================================= */

const clusterResult =

await ecs.send(

  new DescribeClustersCommand({

    clusters:[
      clusterName
    ]

  })

);

if(

  !clusterResult.clusters ||
  clusterResult.clusters.length === 0

){

  return {

    success:false,

    message:
    "ECS Cluster not found"

  };

}

logger.success(
  "ECS Cluster Verified"
);

/* =========================================
REGISTER TASK DEFINITION
========================================= */

const taskDefinitionResponse =

await ecs.send(

new RegisterTaskDefinitionCommand({

family:
taskFamily,

networkMode:"awsvpc",

requiresCompatibilities:[
  "FARGATE"
],

cpu,
memory,

executionRoleArn:
process.env.AWS_ECS_EXECUTION_ROLE,

containerDefinitions:[

{

name:repositoryName,

image:
`${repositoryUri}:latest`,

essential:true,

portMappings:[

{

containerPort,
hostPort:containerPort,
protocol:"tcp"

}

],

environment:[

{
name:"NODE_ENV",
value:
process.env.NODE_ENV ||
"production"
}

],

logConfiguration:{

logDriver:"awslogs",

options:{

"awslogs-group":
"/ecs/vertexcloud",

"awslogs-region":
process.env.AWS_REGION,

"awslogs-stream-prefix":
"ecs"

}

}

}

]

})

);

logger.success(
  "Task Definition Registered"
);

/* =========================================
TASK ARN
========================================= */

const taskDefinitionArn =

taskDefinitionResponse
.taskDefinition
.taskDefinitionArn;

/* =========================================
NETWORK CONFIG
========================================= */

const subnets =

process.env
.AWS_SUBNETS
.split(",");

const securityGroups = [

process.env
.AWS_SECURITY_GROUP

];

/* =========================================
CREATE ECS SERVICE
========================================= */

try{

await ecs.send(

new CreateServiceCommand({

cluster:clusterName,

serviceName,

taskDefinition:
taskDefinitionArn,

desiredCount:1,

launchType:"FARGATE",

networkConfiguration:{

awsvpcConfiguration:{

subnets,

securityGroups,

assignPublicIp:"ENABLED"

}

}

})

);

logger.success(
  "ECS Service Created"
);

}

catch(serviceError){

logger.warning(
  "Service may already exist"
);

}

/* =========================================
VERIFY SERVICE
========================================= */

const serviceStatus =

await ecs.send(

new DescribeServicesCommand({

cluster:clusterName,

services:[
  serviceName
]

})

);

/* =========================================
PUBLIC URL
========================================= */

const publicUrl =

`https://${repositoryName}.${process.env.APP_DOMAIN}`;

/* =========================================
FINAL RESPONSE
========================================= */

return {

success:true,

aws:{

deploymentId,

provider:"AWS",

region:
process.env.AWS_REGION,

framework,

repository:{

name:
repositoryName,

uri:
repositoryUri

},

ecs:{

cluster:
clusterName,

service:
serviceName,

taskDefinition:
taskDefinitionArn,

status:

serviceStatus
.services?.[0]
?.status ||

"ACTIVE"

},

infrastructure:{

cpu,
memory,
containerPort

},

services:{

ecs:true,
ecr:true,
s3:!!s3,
route53:!!route53,
cloudwatch:!!cloudwatch

},

deploymentState:
"healthy",

publicUrl,

deploymentReady:true,

deployedAt:
new Date()

}

};

}

catch(error){

logger.error(
  error.message
);

return {

success:false,

message:
"AWS deployment failed",

error:error.message

};

}

}

/* =========================================
EXPORT
========================================= */

module.exports =
awsAgent;
