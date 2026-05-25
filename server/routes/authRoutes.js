/* =========================
   IMPORTS
========================= */

import express from "express";

import {

  registerUser,

  loginUser,

  googleLogin,

  githubLogin

}

from "../controllers/authController.js";

/* =========================
   ROUTER
========================= */

const router =

express.Router();

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

export default router;
