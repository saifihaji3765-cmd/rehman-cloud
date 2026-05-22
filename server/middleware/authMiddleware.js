const jwt =
require("jsonwebtoken");

/* =========================
   AUTH MIDDLEWARE
========================= */

function authMiddleware(
  req,
  res,
  next
){

  try{

    /* =========================
       TOKEN
    ========================= */

    const token =

      req.headers.authorization;

    /* =========================
       CHECK TOKEN
    ========================= */

    if(!token){

      return res.status(401)
      .json({

        success:false,

        message:
        "Access denied"

      });

    }

    /* =========================
       VERIFY TOKEN
    ========================= */

    const decoded =

      jwt.verify(

        token,

        process.env.JWT_SECRET

      );

    /* =========================
       USER
    ========================= */

    req.user = decoded;

    next();

  }

  catch(error){

    return res.status(401)
    .json({

      success:false,

      message:
      "Invalid token"

    });

  }

}

/* =========================
   EXPORT
========================= */

module.exports =
authMiddleware;
