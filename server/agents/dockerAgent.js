const fs =
require("fs");

const path =
require("path");

const { v4:uuidv4 } =
require("uuid");

/* =========================
DOCKER AGENT
========================= */

async function dockerAgent(
projectData
){

try{

/* =========================
   DEPLOYMENT ID
========================= */

const deploymentId =

uuidv4();

/* =========================
   PROJECT
========================= */

const projectName =

  projectData.projectName ||

  "vertexcloud-app";

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
   CREATE DIRECTORY
========================= */

if(

  !fs.existsSync(
    workspacePath
  )

){

  fs.mkdirSync(

    workspacePath,

    { recursive:true }

  );

}

/* =========================
   DOCKERFILE
========================= */

let dockerfile = "";

/* =========================
   NODE.JS
========================= */

if(

  framework === "node"

){

  dockerfile =

`
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm","start"]
`;

}

/* =========================
   NEXT.JS
========================= */

else if(

  framework === "next"

){

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

else if(

  framework === "python"

){

  dockerfile =

`
FROM python:3.11

WORKDIR /app

COPY . .

RUN pip install -r requirements.txt

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

RUN npm install

EXPOSE 3000

CMD ["npm","start"]
`;

}

/* =========================
   SAVE DOCKERFILE
========================= */

const dockerPath =

  path.join(

    workspacePath,

    "Dockerfile"

  );

fs.writeFileSync(

  dockerPath,

  dockerfile

);

/* =========================
   DOCKERIGNORE
========================= */

const dockerIgnore =

"node_modules .env .git npm-debug.log";

fs.writeFileSync(

  path.join(

    workspacePath,

    ".dockerignore"

  ),

  dockerIgnore

);

/* =========================
   IMAGE
========================= */

const imageName =

  `${projectName.toLowerCase()}-${deploymentId}:latest`;

/* =========================
   RETURN
========================= */

return {

  success:true,

  docker:{

    deploymentId,

    framework,

    runtime:
    framework,

    dockerfileCreated:true,

    dockerIgnoreCreated:true,

    workspacePath,

    imageName,

    containerPort:

      framework === "python"

      ? 8000

      : 3000,

    status:
    "containerized",

    createdAt:
    new Date()

  }

};

}

catch(error){

return {

  success:false,

  error:error.message

};

}

}

/* =========================
EXPORT
========================= */

module.exports =
dockerAgent;
