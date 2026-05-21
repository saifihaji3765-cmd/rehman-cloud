const fs =
require("fs");

const path =
require("path");

/* =========================
   DOCKER AGENT
========================= */

async function dockerAgent(
  projectData
){

  try{

    /* =========================
       PROJECT NAME
    ========================= */

    const projectName =

      projectData.projectName ||

      "vertexcloud-app";

    /* =========================
       DOCKERFILE
    ========================= */

    const dockerfile =

`
FROM node:20

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 3000

CMD ["npm","start"]
`;

    /* =========================
       SAVE DOCKERFILE
    ========================= */

    const dockerPath =

      path.join(
        process.cwd(),
        "workspace",
        "Dockerfile"
      );

    fs.writeFileSync(

      dockerPath,
      dockerfile

    );

    /* =========================
       RETURN
    ========================= */

    return {

      success:true,

      containerized:true,

      dockerfileCreated:true,

      runtime:"Node.js",

      port:3000,

      imageName:
      `${projectName}:latest`

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
