const jwt =
require("jsonwebtoken");

const User =
require("../models/userModel");

/* =========================
AUTH MIDDLEWARE
========================= */

async function authMiddleware(

req,
res,
next

){

try{

/* =========================
   AUTH HEADER
========================= */

const authHeader =

  req.headers.authorization;

/* =========================
   TOKEN CHECK
========================= */

if(

  !authHeader ||

  !authHeader.startsWith(
    "Bearer "
  )

){

  return res.status(401)
  .json({

    success:false,

    message:
    "Access token required"

  });

}

/* =========================
   EXTRACT TOKEN
========================= */

const token =

  authHeader.split(" ")[1];

/* =========================
   VERIFY TOKEN
========================= */

const decoded =

  jwt.verify(

    token,

    process.env.JWT_SECRET

  );

/* =========================
   FIND USER
========================= */

const user =

  await User.findById(
    decoded.id
  ).select("-password");

/* =========================
   USER CHECK
========================= */

if(!user){

  return res.status(401)
  .json({

    success:false,

    message:
    "User not found"

  });

}

/* =========================
   VERIFIED CHECK
========================= */

if(

  user.isVerified === false &&

  user.provider === "email"

){

  return res.status(403)
  .json({

    success:false,

    message:
    "Account not verified"

  });

}

/* =========================
   ATTACH USER
========================= */

req.user = {

  id:user._id,

  name:user.name,

  email:user.email,

  role:user.role,

  provider:user.provider,

  subscriptionPlan:
  user.subscriptionPlan

};

/* =========================
   NEXT
========================= */

next();

}

catch(error){

/* =========================
   TOKEN EXPIRED
========================= */

if(

  error.name ===
  "TokenExpiredError"

){

  return res.status(401)
  .json({

    success:false,

    message:
    "Token expired"

  });

}

/* =========================
   INVALID TOKEN
========================= */

return res.status(401)
.json({

  success:false,

  message:
  "Invalid token"

});

}

}

/* =========================
ADMIN MIDDLEWARE
========================= */

function adminMiddleware(

req,
res,
next

){

try{

if(

  req.user.role !==
  "admin"

){

  return res.status(403)
  .json({

    success:false,

    message:
    "Admin access required"

  });

}

next();

}

catch(error){

return res.status(500)
.json({

  success:false,

  error:error.message

});

}

}

/* =========================
EXPORTS
========================= */

module.exports = {

authMiddleware,

adminMiddleware

};
