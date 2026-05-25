const jwt =
require("jsonwebtoken");

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
       TOKEN
    ========================= */

    const authHeader =

    req.headers.authorization;

    /* =========================
       CHECK TOKEN
    ========================= */

    if(

      !authHeader ||

      !authHeader.startsWith(
        "Bearer "
      )

    ){

      return res.status(401).json({

        success:false,

        message:
        "Unauthorized"

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
       SAVE USER
    ========================= */

    req.user = decoded;

    /* =========================
       NEXT
    ========================= */

    next();

  }

  catch(error){

    console.error(error);

    return res.status(401).json({

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
