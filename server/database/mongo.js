const mongoose =
require("mongoose");

/* =========================
MONGOOSE CONFIG
========================= */

mongoose.set(

"strictQuery",

true

);

/* =========================
CONNECT MONGO
========================= */

async function connectMongo(){

try{

/* =========================
   CONNECTION
========================= */

const connection =

await mongoose.connect(

  process.env.MONGO_URI,

  {

    autoIndex:true,

    serverSelectionTimeoutMS:5000,

    socketTimeoutMS:45000,

    maxPoolSize:20

  }

);

/* =========================
   SUCCESS
========================= */

console.log(

  `✅ MongoDB Connected: ${connection.connection.host}`

);

/* =========================
   EVENTS
========================= */

mongoose.connection.on(

  "disconnected",

  ()=>{

    console.log(

      "⚠️ MongoDB Disconnected"

    );

  }

);

mongoose.connection.on(

  "reconnected",

  ()=>{

    console.log(

      "🔄 MongoDB Reconnected"

    );

  }

);

mongoose.connection.on(

  "error",

  (error)=>{

    console.log(

      "❌ MongoDB Error"

    );

    console.log(
      error.message
    );

  }

);

}

catch(error){

console.log(

  "❌ MongoDB Connection Failed"

);

console.log(
  error.message
);

process.exit(1);

}

}

/* =========================
GRACEFUL SHUTDOWN
========================= */

process.on(

"SIGINT",

async ()=>{

await mongoose.connection.close();

console.log(

  "🛑 MongoDB Connection Closed"

);

process.exit(0);

}

);

/* =========================
EXPORT
========================= */

module.exports =
connectMongo;
