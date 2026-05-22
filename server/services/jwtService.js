const jwt =
require("jsonwebtoken");

/* =========================
   GENERATE TOKEN
========================= */

function generateToken(
  payload
){

  return jwt.sign(

    payload,

    process.env.JWT_SECRET,

    {

      expiresIn:"7d"

    }

  );

}

/* =========================
   VERIFY TOKEN
========================= */

function verifyToken(
  token
){

  return jwt.verify(

    token,

    process.env.JWT_SECRET

  );

}

/* =========================
   EXPORTS
========================= */

module.exports = {

  generateToken,

  verifyToken

};
