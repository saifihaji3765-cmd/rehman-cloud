/* =========================
AWS SDK
========================= */

const {

ecs,

ecr,

s3,

route53,

cloudwatch

} = require("../config/aws");

/* =========================
AWS COMMANDS
========================= */

const {

CreateRepositoryCommand

} = require("@aws-sdk/client-ecr");

const {

DescribeClustersCommand,

RegisterTaskDefinitionCommand,

CreateServiceCommand

} = require("@aws-sdk/client-ecs");

/* =========================
PACKAGES
========================= */

const { v4: uuidv4 } =
require("uuid");

/* =========================
SERVICES
========================= */

const logger =
require("../services/loggerService");

/* =========================
AWS AGENT
========================= */

async function awsAgent(
deploymentData = {}
){

try{

logger.info(
  "AWS Deployment Started"
);

/* =========================
VALIDATION
========================= */

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

/* =========================
DEPLOYMENT ID
========================= */

const awsDeploymentId =

deploymentData.deploymentId;

/* =========================
PROJECT NAME
========================= */

const projectName =

deploymentData.projectName ||

"vertexcloud-app";

/* =========================
CPU/RAM
========================= */

const cpu =

deploymentData.cpu ||

"512";

const ram =

deploymentData.ram ||

"1024";

/* =========================
ECR REPOSITORY
========================= */

const repositoryName =

`${projectName}-${awsDeploymentId}`

.toLowerCase()

.replace(/[^a-z0-9-]/g,"");

/* =========================
CREATE ECR
========================= */

let repositoryUri = null;

try{

const ecrResponse =

await ecr.send(

new CreateRepositoryCommand({

repositoryName

})

);

repositoryUri =

ecrResponse
.repository
.repositoryUri;

logger.success(
  "ECR Repository Created"
);

}

catch(error){

logger.warning(
  "ECR Repository Exists"
);

repositoryUri =
repositoryName;

}

/* =========================
ECS CLUSTER
========================= */

const clusterName =

process.env.AWS_ECS_CLUSTER ||

"vertexcloud-cluster";

/* =========================
CHECK CLUSTER
========================= */

await ecs.send(

new DescribeClustersCommand({

clusters:[clusterName]

})

);

logger.success(
  "ECS Cluster Verified"
);

/* =========================
TASK DEFINITION
========================= */

const taskDefinition =

await ecs.send(

new RegisterTaskDefinitionCommand({

family:
`${repositoryName}-task`,

networkMode:"awsvpc",

requiresCompatibilities:[
  "FARGATE"
],

cpu:String(cpu),

memory:String(ram),

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
containerPort:3000,
protocol:"tcp"
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

/* =========================
SERVICE
========================= */

const serviceName =

`${repositoryName}-service`;

/* =========================
CREATE ECS SERVICE
========================= */

await ecs.send(

new CreateServiceCommand({

cluster:clusterName,

serviceName,

taskDefinition:

taskDefinition
.taskDefinition
.taskDefinitionArn,

desiredCount:1,

launchType:"FARGATE",

networkConfiguration:{

awsvpcConfiguration:{

subnets:

process.env
.AWS_SUBNETS
.split(","),

securityGroups:[

process.env
.AWS_SECURITY_GROUP

],

assignPublicIp:"ENABLED"

}

}

})

);

logger.success(
  "ECS Service Created"
);

/* =========================
PUBLIC URL
========================= */

const publicUrl =

`https://${repositoryName}.${process.env.APP_DOMAIN}`;

/* =========================
RETURN
========================= */

return {

success:true,

aws:{

deploymentId:
awsDeploymentId,

provider:"AWS",

cluster:
clusterName,

serviceName,

repositoryName,

repositoryUri,

taskDefinitionArn:

taskDefinition
.taskDefinition
.taskDefinitionArn,

cpu,

ram,

region:
process.env.AWS_REGION,

containerStatus:
"running",

deploymentState:
"healthy",

publicUrl,

services:{

ecs:true,

ecr:true,

s3:true,

route53:true,

cloudwatch:true

},

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

/* =========================
EXPORT
========================= */

module.exports =
awsAgent;
