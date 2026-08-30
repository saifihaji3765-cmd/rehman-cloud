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

  provider:"email",

  isVerified:true

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
   VALIDATION
========================= */

if(

  !email ||
  !password

){

  return res.status(400).json({

    success:false,

    message:
    "Email and password required"

  });

}

/* =========================
   FIND USER
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

async function googleLogin(req, res) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Google authentication failed"
      });
    }

    // Generate application JWT
    const token = generateToken(user);

    // Store JWT in secure HTTP-only cookie
    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/"
    });

    // Redirect user to frontend dashboard
    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard`
    );

  } catch (error) {
    console.error("Google login error:", error);

    return res.status(500).json({
      success: false,
      message: "Google login failed"
    });
  }
}

 /* =========================================================
   GITHUB LOGIN
========================================================= */

async function githubLogin(req, res) {

  try {

    /* =========================
       AUTHENTICATED USER
    ========================= */

    const user = req.user;

    if (!user) {

      return res.status(401).json({

        success: false,

        message: "GitHub authentication failed"

      });

    }

    /* =========================
       UPDATE LAST LOGIN
    ========================= */

    user.lastLogin = new Date();

    await user.save();

    /* =========================
       GENERATE APPLICATION JWT
    ========================= */

    const token =
      generateToken(user);

    /* =========================
       RESPONSE
    ========================= */

    return res.status(200).json({

      success: true,

      token,

      user: {

        id: user._id,

        name: user.name,

        email: user.email,

        avatar: user.avatar,

        role: user.role,

        provider: user.provider,

        subscriptionPlan:
          user.subscriptionPlan,

        credits:
          user.credits,

        deploymentsUsed:
          user.deploymentsUsed

      }

    });

  }

  catch (error) {

    console.error(
      "GitHub login error:",
      error
    );

    return res.status(500).json({

      success: false,

      message: "GitHub login failed"

    });

  }

}

/* =========================
GET CURRENT USER
========================= */

async function getCurrentUser(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    return res.json({
      success: true,

      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        provider: req.user.provider,
        subscriptionPlan:
          req.user.subscriptionPlan
      }
    });

  } catch (error) {
    console.error(
      "Get current user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get current user"
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

githubLogin,

getCurrentUser,

};
