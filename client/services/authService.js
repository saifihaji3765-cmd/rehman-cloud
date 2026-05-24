/* =========================
   API URL
========================= */

const API_BASE_URL =

"http://localhost:3000/api/auth";

/* =========================
   SAVE SESSION
========================= */

function saveSession(data){

  localStorage.setItem(

    "token",

    data.token

  );

  localStorage.setItem(

    "user",

    JSON.stringify(
      data.user
    )

  );

}

/* =========================
   SIGNUP
========================= */

export async function signupUser(

  userData

){

  try{

    const response =

      await fetch(

        `${API_BASE_URL}/signup`,

        {

          method:"POST",

          headers:{
            "Content-Type":
            "application/json"
          },

          body:JSON.stringify(
            userData
          )

        }

      );

    const data =
    await response.json();

    /* =========================
       SAVE SESSION
    ========================= */

    if(

      data.success &&

      data.data?.token

    ){

      saveSession(
        data.data
      );

    }

    return data;

  }

  catch(error){

    console.log(error);

    return {

      success:false,

      message:
      "Signup failed"

    };

  }

}

/* =========================
   LOGIN
========================= */

export async function loginUser(

  userData

){

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

          body:JSON.stringify(
            userData
          )

        }

      );

    const data =
    await response.json();

    /* =========================
       SAVE SESSION
    ========================= */

    if(

      data.success &&

      data.data?.token

    ){

      saveSession(
        data.data
      );

    }

    return data;

  }

  catch(error){

    console.log(error);

    return {

      success:false,

      message:
      "Login failed"

    };

  }

}

/* =========================
   LOGOUT
========================= */

export function logoutUser(){

  localStorage.removeItem(
    "token"
  );

  localStorage.removeItem(
    "user"
  );

  window.location.hash =
  "#auth";

}

/* =========================
   GET TOKEN
========================= */

export function getToken(){

  return localStorage.getItem(
    "token"
  );

}

/* =========================
   GET USER
========================= */

export function getUser(){

  const user =

    localStorage.getItem(
      "user"
    );

  return user
    ? JSON.parse(user)
    : null;

}

/* =========================
   AUTH CHECK
========================= */

export function isAuthenticated(){

  return !!localStorage.getItem(
    "token"
  );

}
