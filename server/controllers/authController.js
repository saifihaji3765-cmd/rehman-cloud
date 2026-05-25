/* =========================
   IMPORTS
========================= */

import bcrypt from "bcryptjs";

import jwt from "jsonwebtoken";

import {

  generateGoogleToken,

  verifyGoogleUser

}

from "../services/googleAuthService.js";

/* =========================
   TEMP USER DATABASE
========================= */

const users = [];

/* =========================
   GENERATE TOKEN
========================= */

function generateToken(user){

  return jwt.sign(

    {

      id:user.id,

      email:user.email

    },

    process.env.JWT_SECRET,

    {

      expiresIn:"7d"

    }

  );

}

/* =========================
   REGISTER
========================= */

async function registerUser(

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

      return res.status(400).json({

        success:false,

        message:
        "All fields required"

      });

    }

    /* =========================
       EXISTING USER
    ========================= */

    const existingUser =

    users.find(

      user=>

      user.email === email

    );

    if(existingUser){

      return res.status(400).json({

        success:false,

        message:
        "User already exists"

      });

    }

    /* =========================
       HASH PASSWORD
    ========================= */

    const hashedPassword =

    await bcrypt.hash(
      password,
      10
    );

    /* =========================
       NEW USER
    ========================= */

    const newUser = {

      id:Date.now(),

      name,

      email,

      password:
      hashedPassword,

      provider:"email"

    };

    users.push(newUser);

    /* =========================
       TOKEN
    ========================= */

    const token =

    generateToken(newUser);

    /* =========================
       RESPONSE
    ========================= */

    return res.json({

      success:true,

      token,

      user:{

        id:newUser.id,

        name:newUser.name,

        email:newUser.email

      }

    });

  }

  catch(error){

    console.log(error);

    return res.status(500).json({

      success:false,

      message:
      "Register failed"

    });

  }

}

/* =========================
   LOGIN
========================= */

async function loginUser(

  req,
  res

){

  try{

    const {

      email,
      password

    } = req.body;

    /* =========================
       USER
    ========================= */

    const user =

    users.find(

      user=>

      user.email === email

    );

    if(!user){

      return res.status(400).json({

        success:false,

        message:
        "Invalid credentials"

      });

    }

    /* =========================
       PASSWORD CHECK
    ========================= */

    const validPassword =

    await bcrypt.compare(

      password,

      user.password

    );

    if(!validPassword){

      return res.status(400).json({

        success:false,

        message:
        "Invalid credentials"

      });

    }

    /* =========================
       TOKEN
    ========================= */

    const token =

    generateToken(user);

    /* =========================
       RESPONSE
    ========================= */

    return res.json({

      success:true,

      token,

      user:{

        id:user.id,

        name:user.name,

        email:user.email

      }

    });

  }

  catch(error){

    console.log(error);

    return res.status(500).json({

      success:false,

      message:
      "Login failed"

    });

  }

}

/* =========================
   GOOGLE LOGIN
========================= */

async function googleLogin(

  req,
  res

){

  try{

    /* =========================
       GOOGLE PROFILE
    ========================= */

    const googleProfile = {

      sub:"google123",

      name:"Google User",

      email:"googleuser@gmail.com",

      picture:""

    };

    /* =========================
       VERIFY
    ========================= */

    const user =

    await verifyGoogleUser(
      googleProfile
    );

    /* =========================
       TOKEN
    ========================= */

    const token =

    generateGoogleToken(
      user
    );

    /* =========================
       REDIRECT
    ========================= */

    return res.json({

      success:true,

      token,

      user

    });

  }

  catch(error){

    console.log(error);

    return res.status(500).json({

      success:false,

      message:
      "Google login failed"

    });

  }

}

/* =========================
   GITHUB LOGIN
========================= */

async function githubLogin(

  req,
  res

){

  try{

    return res.json({

      success:true,

      message:
      "GitHub login coming soon"

    });

  }

  catch(error){

    console.log(error);

    return res.status(500).json({

      success:false,

      message:
      "GitHub login failed"

    });

  }

}

/* =========================
   EXPORTS
========================= */

export {

  registerUser,

  loginUser,

  googleLogin,

  githubLogin

};
