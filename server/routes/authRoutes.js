const express =
require("express");

const router =
express.Router();

/* =========================
CONTROLLERS
========================= */

const {

registerUser,

loginUser,

googleLogin,

githubLogin

} = require(
"../controllers/authController"
);

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
GOOGLE LOGIN
========================= */

router.get(
"/google",
googleLogin
);

/* =========================
GITHUB LOGIN
========================= */

router.get(
"/github",
githubLogin
);

/* =========================
EXPORT
========================= */

module.exports =
router;
