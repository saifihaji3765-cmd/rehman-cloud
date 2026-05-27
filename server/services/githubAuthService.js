const jwt =
require("jsonwebtoken");

/* =========================
GENERATE GITHUB TOKEN
========================= */

function generateGithubToken(user){

return jwt.sign(

{

  id:user._id,

  name:user.name,

  email:user.email,

  provider:"github"

},

process.env.JWT_SECRET,

{

  expiresIn:"7d"

}

);

}

/* =========================
VERIFY GITHUB USER
========================= */

async function verifyGithubUser(
profile
){

try{

/* =========================
   USER OBJECT
========================= */

return {

  githubId:
  profile.id,

  name:
  profile.name ||
  profile.login,

  email:
  profile.email,

  avatar:
  profile.avatar_url,

  provider:
  "github"

};

}

catch(error){

console.error(

  "GitHub Verify Error:",

  error.message

);

throw new Error(

  "GitHub verification failed"

);

}

}

/* =========================
EXPORTS
========================= */

module.exports = {

generateGithubToken,

verifyGithubUser

};
