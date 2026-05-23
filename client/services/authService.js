import api
from "./api.js";

/* =========================
   REGISTER
========================= */

async function registerUser(data){

  return await api.post(

    "/auth/register",

    data

  );

}

/* =========================
   LOGIN
========================= */

async function loginUser(data){

  return await api.post(

    "/auth/login",

    data

  );

}

/* =========================
   LOGOUT
========================= */

function logoutUser(){

  localStorage.removeItem(
    "token"
  );

  localStorage.removeItem(
    "user"
  );

}

/* =========================
   SAVE AUTH
========================= */

function saveAuth(data){

  if(data.token){

    localStorage.setItem(

      "token",

      data.token

    );

  }

  if(data.user){

    localStorage.setItem(

      "user",

      JSON.stringify(data.user)

    );

  }

}

/* =========================
   GET USER
========================= */

function getUser(){

  const user =

  localStorage.getItem(
    "user"
  );

  return user
  ?
  JSON.parse(user)
  :
  null;

}

/* =========================
   EXPORT
========================= */

export default {

  registerUser,

  loginUser,

  logoutUser,

  saveAuth,

  getUser

};
