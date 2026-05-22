const env = require("./env");

function validateEnv(){

  const requiredEnv = [

    "AWS_ACCESS_KEY",

    "AWS_SECRET_KEY",

    "JWT_SECRET"

  ];

  const missingEnv = [];

  requiredEnv.forEach((key)=>{

    if(

      !env[key] ||

      env[key].trim() === ""

    ){

      missingEnv.push(key);

    }

  });

  if(missingEnv.length > 0){

    console.log("\n");

    console.log(
      "❌ Missing Environment Variables:"
    );

    missingEnv.forEach((item)=>{

      console.log(
        `- ${item}`
      );

    });

    console.log("\n");

    process.exit(1);

  }

  console.log(
    "✅ Environment Validation Passed"
  );

}

module.exports = validateEnv;
