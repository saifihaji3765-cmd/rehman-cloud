const bcrypt =
require("bcrypt");

/* =========================
   HASH PASSWORD
========================= */

async function hashPassword(
  password
){

  const saltRounds = 10;

  const hashedPassword =

    await bcrypt.hash(

      password,

      saltRounds

    );

  return hashedPassword;

}

/* =========================
   COMPARE PASSWORD
========================= */

async function comparePassword(

  password,

  hashedPassword

){

  return await bcrypt.compare(

    password,

    hashedPassword

  );

}

/* =========================
   EXPORTS
========================= */

module.exports = {

  hashPassword,

  comparePassword

};
