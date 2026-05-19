/* =========================
   IMPORTS
========================= */

const fs =
require("fs");

const path =
require("path");

/* =========================
   WORKSPACE
========================= */

const WORKSPACE =
path.join(

  __dirname,

  "../workspace"

);

/* =========================
   FILE AGENT
========================= */

function fileAgent(){

  try{

    /* =========================
       READ DIRECTORY
    ========================= */

    function readDir(dir){

      const items =
      fs.readdirSync(dir);

      let results = [];

      for(
        const item
        of items
      ){

        const itemPath =
        path.join(
          dir,
          item
        );

        const stat =
        fs.statSync(
          itemPath
        );

        const relative =
        path.relative(
          WORKSPACE,
          itemPath
        );

        /* =========================
           FOLDER
        ========================= */

        if(
          stat.isDirectory()
        ){

          results.push({

            name:relative,

            type:"folder"

          });

          results =
          results.concat(
            readDir(itemPath)
          );

        }

        /* =========================
           FILE
        ========================= */

        else{

          const content =
          fs.readFileSync(
            itemPath,
            "utf-8"
          );

          results.push({

            name:relative,

            type:"file",

            content

          });

        }

      }

      return results;

    }

    /* =========================
       CREATE WORKSPACE
    ========================= */

    if(
      !fs.existsSync(
        WORKSPACE
      )
    ){

      fs.mkdirSync(
        WORKSPACE,
        {
          recursive:true
        }
      );

    }

    /* =========================
       SCAN FILES
    ========================= */

    const files =
    readDir(WORKSPACE);

    /* =========================
       RETURN
    ========================= */

    return {

      success:true,

      files

    };

  }

  catch(error){

    console.log(error);

    return {

      success:false,

      error:error.message

    };

  }

}

/* =========================
   SAVE FILE
========================= */

function saveFile(
  fileName,
  content
){

  try{

    const filePath =
    path.join(
      WORKSPACE,
      fileName
    );

    const dir =
    path.dirname(
      filePath
    );

    /* =========================
       CREATE DIR
    ========================= */

    if(
      !fs.existsSync(dir)
    ){

      fs.mkdirSync(
        dir,
        {
          recursive:true
        }
      );

    }

    /* =========================
       WRITE FILE
    ========================= */

    fs.writeFileSync(
      filePath,
      content
    );

    return {

      success:true

    };

  }

  catch(error){

    console.log(error);

    return {

      success:false,

      error:error.message

    };

  }

}

/* =========================
   DELETE FILE
========================= */

function deleteFile(
  fileName
){

  try{

    const filePath =
    path.join(
      WORKSPACE,
      fileName
    );

    if(
      fs.existsSync(
        filePath
      )
    ){

      fs.unlinkSync(
        filePath
      );

    }

    return {

      success:true

    };

  }

  catch(error){

    console.log(error);

    return {

      success:false,

      error:error.message

    };

  }

}

/* =========================
   EXPORTS
========================= */

module.exports = {

  fileAgent,

  saveFile,

  deleteFile

};
