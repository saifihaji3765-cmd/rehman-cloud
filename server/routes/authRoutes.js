const express = require("express");
const passport = require("passport");

const router = express.Router();

/* =========================
CONTROLLERS
========================= */

const {
registerUser,
loginUser,
googleLogin,
githubLogin
} = require("../controllers/authController");

/* =========================
REGISTER
========================= */

router.post(
"/register",
registerUser
);

/* =========================
LOGIN
========================= */

router.post(
"/login",
loginUser
);

/* =========================
GOOGLE AUTH
========================= */

router.get(
"/google",
passport.authenticate(
"google",
{
scope:[
"profile",
"email"
]
}
)
);

/* =========================
GOOGLE CALLBACK
========================= */

router.get(
"/google/callback",
passport.authenticate(
"google",
{
session:false,
failureRedirect:"/login"
}
),
googleLogin
);

/* =========================
GITHUB AUTH
========================= */

router.get(
"/github",
passport.authenticate(
"github",
{
scope:[
"user:email"
]
}
)
);

/* =========================
GITHUB CALLBACK
========================= */

router.get(
"/github/callback",
passport.authenticate(
"github",
{
session:false,
failureRedirect:"/login"
}
),
githubLogin
);

/* =========================
EXPORT
========================= */

module.exports = router;
