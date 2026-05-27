/* =========================
AWS SDK IMPORTS
========================= */

const {

EC2Client

} = require(

"@aws-sdk/client-ec2"

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
EXPORTS
========================= */

module.exports = {

ec2,

s3,

route53

};
