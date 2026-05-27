const jwt =
require("jsonwebtoken");

const {
OAuth2Client
} = require(
"google-auth-library"
);

/* =========================
GOOGLE CLIENT
========================= */

const client =
new OAuth2Client(
process.env.GOOGLE_CLIENT_ID
);

/* =========================
GENERATE JWT TOKEN
========================= */

function generateGoogleToken(user){

return jwt.sign(

{
  id:user._id,
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

async function verifyGoogleUser(
token
){

try{

/* =========================
   VERIFY TOKEN
========================= */

const ticket =

await client.verifyIdToken({

  idToken:token,

  audience:
  process.env.GOOGLE_CLIENT_ID

});

/* =========================
   PAYLOAD
========================= */

const payload =
ticket.getPayload();

/* =========================
   USER OBJECT
========================= */

return {

  googleId:
  payload.sub,

  name:
  payload.name,

  email:
  payload.email,

  avatar:
  payload.picture,

  verified:
  payload.email_verified,

  provider:
  "google"

};

}

catch(error){

console.error(
  "Google Verify Error:",
  error.message
);

throw new Error(
  "Invalid Google Token"
);

}

}

/* =========================
EXPORTS
========================= */

module.exports = {

generateGoogleToken,

verifyGoogleUser

};
