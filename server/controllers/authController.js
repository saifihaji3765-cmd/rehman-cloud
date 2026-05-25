const bcrypt =
require("bcryptjs");

const jwt =
require("jsonwebtoken");

/* =========================
   MODEL
========================= */

const User =
require(
  "../models/userModel"
);

/* =========================
   GOOGLE SERVICE
========================= */

const {

  generateGoogleToken,

  verifyGoogleUser

} = require(
  "../services/googleAuthService"
);

/* =========================
   GENERATE JWT
========================= */

function generateToken(user){

  return jwt.sign(

    {

      id:user._id,

      email:user.email,

      role:user.role

    },

    process.env.JWT_SECRET,

    {

      expiresIn:"7d"

    }

  );

}

/* =========================
   REGISTER USER
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

    await User.findOne({

      email

    });

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
       CREATE USER
    ========================= */

    const user =

    await User.create({

      name,

      email,

      password:
      hashedPassword,

      provider:"email"

    });

    /* =========================
       TOKEN
    ========================= */

    const token =
    generateToken(user);

    /* =========================
       RESPONSE
    ========================= */

    return res.status(201).json({

      success:true,

      token,

      user:{

        id:user._id,

        name:user.name,

        email:user.email,

        role:user.role,

        provider:user.provider

      }

    });

  }

  catch(error){

    console.error(error);

    return res.status(500).json({

      success:false,

      message:
      "Register failed"

    });

  }

}

/* =========================
   LOGIN USER
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

    await User.findOne({

      email

    });

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
       UPDATE LAST LOGIN
    ========================= */

    user.lastLogin =
    new Date();

    await user.save();

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

        id:user._id,

        name:user.name,

        email:user.email,

        role:user.role,

        provider:user.provider

      }

    });

  }

  catch(error){

    console.error(error);

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
       TEMP PROFILE
    ========================= */

    const googleProfile = {

      sub:"google123",

      name:"Google User",

      email:"googleuser@gmail.com",

      picture:""

    };

    /* =========================
       VERIFY USER
    ========================= */

    const profile =

    await verifyGoogleUser(
      googleProfile
    );

    /* =========================
       FIND USER
    ========================= */

    let user =

    await User.findOne({

      email:profile.email

    });

    /* =========================
       CREATE USER
    ========================= */

    if(!user){

      user =
      await User.create({

        name:profile.name,

        email:profile.email,

        avatar:profile.avatar,

        provider:"google",

        isVerified:true

      });

    }

    /* =========================
       TOKEN
    ========================= */

    const token =

    generateGoogleToken(
      user
    );

    /* =========================
       RESPONSE
    ========================= */

    return res.json({

      success:true,

      token,

      user

    });

  }

  catch(error){

    console.error(error);

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

    console.error(error);

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

module.exports = {

  registerUser,

  loginUser,

  googleLogin,

  githubLogin

};
