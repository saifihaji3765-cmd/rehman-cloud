/* =========================
   ROUTER
========================= */

import renderRoute
from "./app/router/router.js";

/* =========================
   STORE
========================= */

import {

  setUser,

  setToken

} from "./app/store/appStore.js";

/* =========================
   AUTH SERVICE
========================= */

import {

  getUser,

  getToken,

  isAuthenticated

} from "./app/services/authService.js";

/* =========================
   GLOBAL STYLES
========================= */

// import "./styles.css";

/* =========================
   INIT APP
========================= */

function initializeApp(){

  /* =========================
     AUTH SESSION
  ========================= */

  if(

    isAuthenticated()

  ){

    const user =

    getUser();

    const token =

    getToken();

    /* =========================
       SAVE TO STORE
    ========================= */

    setUser(user);

    setToken(token);

  }

  /* =========================
     INITIAL ROUTE
  ========================= */

  const currentRoute =

  window.location.hash
  .replace("#","");

  if(currentRoute){

    renderRoute(
      currentRoute
    );

  }

  else{

    if(

      isAuthenticated()

    ){

      window.location.hash =
      "#dashboard";

    }

    else{

      window.location.hash =
      "#login";

    }

  }

}

/* =========================
   START APPLICATION
========================= */

document.addEventListener(

  "DOMContentLoaded",

  ()=>{

    initializeApp();

  }

);
