const fs =
require("fs");

const path =
require("path");

const util =
require("util");

const exec =
util.promisify(
require("child_process").exec
);

const { v4: uuidv4 } =
require("uuid");

/* =========================
SERVICES
========================= */

const logger =
require("../services/loggerService");

/* =========================
DOCKER AGENT
========================= */

async function dockerAgent(
projectData = {}
){

try{

logger.info(
  "Docker Agent Started"
);

/* =========================
VALIDATION
========================= */

if(
  !projectData.projectName
){

  return {

    success:false,

    message:
    "Project name required"

  };

}

/* =========================
DEPLOYMENT ID
========================= */

const deploymentId =

projectData.deploymentId ||

uuidv4();

/* =========================
PROJECT
========================= */

const projectName =

projectData.projectName
.toLowerCase()
.replace(/[^a-z0-9-]/g,"-");

const framework =

projectData.framework ||
"node";

/* =========================
WORKSPACE
========================= */

const workspacePath =

path.join(

process.cwd(),

"workspace",

deploymentId

);

/* =========================
CREATE WORKSPACE
========================= */

fs.mkdirSync(

workspacePath,

{ recursive:true }

);

/* =========================
SAVE PROJECT FILES
========================= */

if(

Array.isArray(
projectData.files
)

){

for(const file of projectData.files){

const filePath =

path.join(
workspacePath,
file.name
);

const dir =

path.dirname(
filePath
);

fs.mkdirSync(

dir,

{ recursive:true }

);

fs.writeFileSync(

filePath,

file.content || ""

);

}

}

/* =========================
DOCKERFILE
========================= */

let dockerfile = "";

/* =========================
NODE
========================= */

if(framework === "node"){

dockerfile =

`
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

CMD ["npm","start"]
`;

}

/* =========================
NEXT.JS
========================= */

else if(framework === "next"){

dockerfile =

`
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm","start"]
`;

}

/* =========================
PYTHON
========================= */

else if(framework === "python"){

dockerfile =

`
FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

CMD ["python","app.py"]
`;

}

/* =========================
DEFAULT
========================= */

else{

dockerfile =

`
FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install --production

EXPOSE 3000

CMD ["npm","start"]
`;

}

/* =========================
SAVE DOCKERFILE
========================= */

fs.writeFileSync(

path.join(
workspacePath,
"Dockerfile"
),

dockerfile

);

/* =========================
DOCKERIGNORE
========================= */

const dockerIgnore =

`
node_modules
.env
.git
npm-debug.log
Dockerfile
.dockerignore
`;

fs.writeFileSync(

path.join(
workspacePath,
".dockerignore"
),

dockerIgnore

);

/* =========================
IMAGE NAME
========================= */

const imageName =

`${projectName}:${deploymentId}`;

/* =========================
BUILD DOCKER IMAGE
========================= */

logger.info(
  "Building Docker Image"
);

await exec(

`docker build -t ${imageName} .`,

{
cwd:workspacePath
}

);

logger.success(
  "Docker Image Built"
);

/* =========================
RETURN
========================= */

return {

success:true,

docker:{

deploymentId,

projectName,

framework,

runtime:
framework,

workspacePath,

dockerfileCreated:true,

dockerIgnoreCreated:true,

imageName,

containerPort:

framework === "python"
? 8000
: 3000,

dockerBuild:true,

status:
"containerized",

createdAt:
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
"Docker build failed",

error:error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
dockerAgent;
