/* =========================
   API BASE URL
========================= */

const API_BASE_URL =

"http://localhost:5000/api/auth";

/* =========================
   SAVE TOKEN
========================= */

function saveToken(token){

  localStorage.setItem(
    "vertex_token",
    token
  );

}

/* =========================
   SAVE USER
========================= */

function saveUser(user){

  localStorage.setItem(
    "vertex_user",
    JSON.stringify(user)
  );

}

/* =========================
   GET USER
========================= */

export function getUser(){

  const user =

  localStorage.getItem(
    "vertex_user"
  );

  return user
    ? JSON.parse(user)
    : null;

}

/* =========================
   GET TOKEN
========================= */

export function getToken(){

  return localStorage.getItem(
    "vertex_token"
  );

}

/* =========================
   AUTH CHECK
========================= */

export function isAuthenticated(){

  return !!getToken();

}

/* =========================
   LOGOUT
========================= */

export function logout(){

  localStorage.removeItem(
    "vertex_token"
  );

  localStorage.removeItem(
    "vertex_user"
  );

  window.location.hash =

  "#login";

  window.location.reload();

}

/* =========================
   REGISTER USER
========================= */

export async function registerUser(data){

  try{

    const response =

    await fetch(

      `${API_BASE_URL}/register`,

      {

        method:"POST",

        headers:{
          "Content-Type":
          "application/json"
        },

        body:JSON.stringify(data)

      }

    );

    const result =

    await response.json();

    if(!response.ok){

      throw new Error(
        result.message
      );

    }

    saveToken(result.token);

    saveUser(result.user);

    return result;

  }

  catch(error){

    throw error;

  }

}

/* =========================
   LOGIN USER
========================= */

export async function loginUser(data){

  try{

    const response =

    await fetch(

      `${API_BASE_URL}/login`,

      {

        method:"POST",

        headers:{
          "Content-Type":
          "application/json"
        },

        body:JSON.stringify(data)

      }

    );

    const result =

    await response.json();

    if(!response.ok){

      throw new Error(
        result.message
      );

    }

    saveToken(result.token);

    saveUser(result.user);

    return result;

  }

  catch(error){

    throw error;

  }

}

/* =========================
   GOOGLE LOGIN
========================= */

export function loginWithGoogle(){

  window.location.href =

  `${API_BASE_URL}/google`;

}

/* =========================
   GITHUB LOGIN
========================= */

export function loginWithGithub(){

  window.location.href =

  `${API_BASE_URL}/github`;

}
