require("dotenv").config();

const env = {

  PORT:
    process.env.PORT || 5000,

  NODE_ENV:
    process.env.NODE_ENV || "development",

  AWS_ACCESS_KEY:
    process.env.AWS_ACCESS_KEY || "",

  AWS_SECRET_KEY:
    process.env.AWS_SECRET_KEY || "",

  AWS_REGION:
    process.env.AWS_REGION || "ap-south-1",

  DOMAIN:
    process.env.DOMAIN || "vertexcloud.app",

  JWT_SECRET:
    process.env.JWT_SECRET || "vertexcloud-secret",

};

module.exports = env;
