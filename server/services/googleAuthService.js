/* =========================
   GOOGLE AUTH SERVICE
========================= */

import jwt from "jsonwebtoken";

/* =========================
   GENERATE JWT TOKEN
========================= */

function generateGoogleToken(user){

  return jwt.sign(

    {

      id:user.id,

      name:user.name,

      email:user.email,

      provider:"google"

    },

    process.env.JWT_SECRET,

    {

      expiresIn:"7d"

    }

  );

}

/* =========================
   VERIFY GOOGLE USER
========================= */

async function verifyGoogleUser(profile){

  /* =========================
     USER OBJECT
  ========================= */

  const user = {

    id:profile.sub,

    name:profile.name,

    email:profile.email,

    avatar:profile.picture,

    provider:"google"

  };

  return user;

}

/* =========================
   EXPORTS
========================= */

export {

  generateGoogleToken,

  verifyGoogleUser

};
