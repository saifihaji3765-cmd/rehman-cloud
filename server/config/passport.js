const passport =
require("passport");

const GoogleStrategy =
require("passport-google-oauth20").Strategy;

const GitHubStrategy =
require("passport-github2").Strategy;

const User =
require("../models/userModel");

/* =========================
GOOGLE STRATEGY
========================= */

passport.use(

new GoogleStrategy(

{

clientID:
process.env.GOOGLE_CLIENT_ID,

clientSecret:
process.env.GOOGLE_CLIENT_SECRET,

callbackURL:
process.env.GOOGLE_CALLBACK_URL

},

async (

accessToken,
refreshToken,
profile,
done

)=>{

try{

let user =

await User.findOne({

email:
profile.emails[0].value

});

/* =========================
CREATE USER
========================= */

if(!user){

user =

await User.create({

name:
profile.displayName,

email:
profile.emails[0].value,

avatar:
profile.photos[0].value,

googleId:
profile.id,

provider:
"google",

isVerified:true

});

}

/* =========================
UPDATE LOGIN
========================= */

user.lastLogin =
new Date();

await user.save();

return done(
null,
user
);

}

catch(error){

return done(
error,
null
);

}

}

)

);

/* =========================
GITHUB STRATEGY
========================= */

passport.use(

new GitHubStrategy(

{

clientID:
process.env.GITHUB_CLIENT_ID,

clientSecret:
process.env.GITHUB_CLIENT_SECRET,

callbackURL:
process.env.GITHUB_CALLBACK_URL,

scope:[
"user:email"
]

},

async (

accessToken,
refreshToken,
profile,
done

)=>{

try{

const email =

profile.emails &&
profile.emails[0]

? profile.emails[0].value

: `${profile.username}@github.com`;

let user =

await User.findOne({

email

});

/* =========================
CREATE USER
========================= */

if(!user){

user =

await User.create({

name:
profile.displayName ||
profile.username,

email,

avatar:
profile.photos[0].value,

githubId:
profile.id,

provider:
"github",

isVerified:true

});

}

/* =========================
UPDATE LOGIN
========================= */

user.lastLogin =
new Date();

await user.save();

return done(
null,
user
);

}

catch(error){

return done(
error,
null
);

}

}

)

);

/* =========================
SERIALIZE
========================= */

passport.serializeUser(

(user,done)=>{

done(
null,
user.id
);

}

);

/* =========================
DESERIALIZE
========================= */

passport.deserializeUser(

async(id,done)=>{

try{

const user =

await User.findById(id);

done(
null,
user
);

}

catch(error){

done(
error,
null
);

}

}

);

module.exports =
passport;
