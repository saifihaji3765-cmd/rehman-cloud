/* =========================
   IMPORTS
========================= */

const fs =
require("fs");

const path =
require("path");

/* =========================
   MEMORY FILE
========================= */

const MEMORY_FILE =
path.join(

  __dirname,

  "../memory/memory.json"

);

/* =========================
   CREATE MEMORY DIR
========================= */

const memoryDir =
path.dirname(
  MEMORY_FILE
);

if(
  !fs.existsSync(
    memoryDir
  )
){

  fs.mkdirSync(
    memoryDir,
    {
      recursive:true
    }
  );

}

/* =========================
   CREATE MEMORY FILE
========================= */

if(
  !fs.existsSync(
    MEMORY_FILE
  )
){

  fs.writeFileSync(

    MEMORY_FILE,

    JSON.stringify({

      conversations:[],

      projects:[],

      preferences:{}

    })

  );

}

/* =========================
   LOAD MEMORY
========================= */

function loadMemory(){

  try{

    const raw =
    fs.readFileSync(
      MEMORY_FILE,
      "utf-8"
    );

    return JSON.parse(raw);

  }

  catch(error){

    console.log(error);

    return {

      conversations:[],

      projects:[],

      preferences:{}

    };

  }

}

/* =========================
   SAVE MEMORY
========================= */

function saveMemory(data){

  try{

    fs.writeFileSync(

      MEMORY_FILE,

      JSON.stringify(
        data,
        null,
        2
      )

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
   ADD CONVERSATION
========================= */

function addConversation(message){

  try{

    const memory =
    loadMemory();

    memory.conversations.push({

      message,

      timestamp:
      new Date()
      .toISOString()

    });

    saveMemory(memory);

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
   SAVE PROJECT MEMORY
========================= */

function saveProjectMemory(
  project
){

  try{

    const memory =
    loadMemory();

    memory.projects.push({

      ...project,

      timestamp:
      new Date()
      .toISOString()

    });

    saveMemory(memory);

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
   GET MEMORY
========================= */

function getMemory(){

  return loadMemory();

}

/* =========================
   CLEAR MEMORY
========================= */

function clearMemory(){

  try{

    saveMemory({

      conversations:[],

      projects:[],

      preferences:{}

    });

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

  addConversation,

  saveProjectMemory,

  getMemory,

  clearMemory

};
