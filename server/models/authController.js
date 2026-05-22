const User =
require("../models/userModel");

const {

  hashPassword,

  comparePassword

} = require(
  "../services/hashService"
);

const {

  generateToken

} = require(
  "../services/jwtService"
);

const formatResponse =
require(
  "../utils/formatResponse"
);

/* =========================
   SIGNUP
========================= */

async function signupController(
  req,
  res
){

  try{

    const {

      name,

      email,

      password

    } = req.body;

    /* =========================
       VALIDATION
    ========================= */

    if(

      !name ||

      !email ||

      !password

    ){

      return res.status(400)
      .json(

        formatResponse({

          success:false,

          message:
          "All fields are required"

        })

      );

    }

    /* =========================
       CHECK USER
    ========================= */

    const existingUser =

      await User.findOne({

        email

      });

    if(existingUser){

      return res.status(400)
      .json(

        formatResponse({

          success:false,

          message:
          "User already exists"

        })

      );

    }

    /* =========================
       HASH PASSWORD
    ========================= */

    const hashedPassword =

      await hashPassword(
        password
      );

    /* =========================
       CREATE USER
    ========================= */

    const user =

      await User.create({

        name,

        email,

        password:
        hashedPassword

      });

    /* =========================
       TOKEN
    ========================= */

    const token =

      generateToken({

        id:user._id,

        email:user.email

      });

    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success:true,

        message:
        "Signup successful",

        data:{

          token,

          user

        }

      })

    );

  }

  catch(error){

    return res.status(500)
    .json(

      formatResponse({

        success:false,

        message:
        "Signup failed",

        error:error.message

      })

    );

  }

}

/* =========================
   LOGIN
========================= */

async function loginController(
  req,
  res
){

  try{

    const {

      email,

      password

    } = req.body;

    /* =========================
       CHECK USER
    ========================= */

    const user =

      await User.findOne({

        email

      });

    if(!user){

      return res.status(404)
      .json(

        formatResponse({

          success:false,

          message:
          "User not found"

        })

      );

    }

    /* =========================
       PASSWORD CHECK
    ========================= */

    const isMatch =

      await comparePassword(

        password,

        user.password

      );

    if(!isMatch){

      return res.status(401)
      .json(

        formatResponse({

          success:false,

          message:
          "Invalid password"

        })

      );

    }

    /* =========================
       TOKEN
    ========================= */

    const token =

      generateToken({

        id:user._id,

        email:user.email

      });

    /* =========================
       RESPONSE
    ========================= */

    return res.json(

      formatResponse({

        success:true,

        message:
        "Login successful",

        data:{

          token,

          user

        }

      })

    );

  }

  catch(error){

    return res.status(500)
    .json(

      formatResponse({

        success:false,

        message:
        "Login failed",

        error:error.message

      })

    );

  }

}

/* =========================
   EXPORTS
========================= */

module.exports = {

  signupController,

  loginController

};
