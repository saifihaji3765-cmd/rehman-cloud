/* =========================
AWS SDK IMPORTS
========================= */

const {

EC2Client

} = require(

"@aws-sdk/client-ec2"

);

const {

ECSClient

} = require(

"@aws-sdk/client-ecs"

);

const {

ECRClient

} = require(

"@aws-sdk/client-ecr"

);

const {

S3Client

} = require(

"@aws-sdk/client-s3"

);

const {

Route53Client

} = require(

"@aws-sdk/client-route-53"

);

const {

ACMClient

} = require(

"@aws-sdk/client-acm"

);

const {

CloudWatchClient

} = require(

"@aws-sdk/client-cloudwatch"

);

/* =========================
ENV VALIDATION
========================= */

if(

!process.env.AWS_ACCESS_KEY_ID ||

!process.env.AWS_SECRET_ACCESS_KEY ||

!process.env.AWS_REGION

){

console.log(
"❌ AWS environment variables missing"
);

}

/* =========================
AWS CONFIG
========================= */

const awsConfig = {

region:
process.env.AWS_REGION,

credentials:{

accessKeyId:

  process.env
  .AWS_ACCESS_KEY_ID,

secretAccessKey:

  process.env
  .AWS_SECRET_ACCESS_KEY

}

};

/* =========================
EC2
========================= */

const ec2 =

new EC2Client(
awsConfig
);

/* =========================
ECS
========================= */

const ecs =

new ECSClient(
awsConfig
);

/* =========================
ECR
========================= */

const ecr =

new ECRClient(
awsConfig
);

/* =========================
S3
========================= */

const s3 =

new S3Client(
awsConfig
);

/* =========================
ROUTE53
========================= */

const route53 =

new Route53Client(
awsConfig
);

/* =========================
ACM SSL
========================= */

const acm =

new ACMClient(
awsConfig
);

/* =========================
CLOUDWATCH
========================= */

const cloudwatch =

new CloudWatchClient(
awsConfig
);

/* =========================
EXPORTS
========================= */

module.exports = {

ec2,

ecs,

ecr,

s3,

route53,

acm,

cloudwatch

};
