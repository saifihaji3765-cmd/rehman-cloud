/* =========================
   GOOGLE AUTH SERVICE
========================= */

const GOOGLE_CLIENT_ID =
"YOUR_GOOGLE_CLIENT_ID";

/* =========================
   LOAD GOOGLE SCRIPT
========================= */

function loadGoogleScript(){

  return new Promise((resolve)=>{

    /* =========================
       ALREADY LOADED
    ========================= */

    if(window.google){

      resolve();

      return;

    }

    /* =========================
       SCRIPT
    ========================= */

    const script =
    document.createElement(
      "script"
    );

    script.src =
    "https://accounts.google.com/gsi/client";

    script.async = true;

    script.defer = true;

    script.onload = ()=>{

      resolve();

    };

    document.body.appendChild(
      script
    );

  });

}

/* =========================
   INIT GOOGLE LOGIN
========================= */

async function initGoogleLogin(){

  await loadGoogleScript();

  /* =========================
     GOOGLE INIT
  ========================= */

  google.accounts.id.initialize({

    client_id:
    GOOGLE_CLIENT_ID,

    callback:
    handleGoogleResponse

  });

  /* =========================
     BUTTON
  ========================= */

  const buttonContainer =
  document.getElementById(
    "googleLoginBtn"
  );

  if(!buttonContainer){

    return;

  }

  buttonContainer.innerHTML = "";

  google.accounts.id.renderButton(

    buttonContainer,

    {

      theme:"outline",

      size:"large",

      width:320,

      shape:"pill",

      text:"continue_with"

    }

  );

}

/* =========================
   HANDLE RESPONSE
========================= */

function handleGoogleResponse(
  response
){

  /* =========================
     TOKEN
  ========================= */

  const credential =
  response.credential;

  /* =========================
     SAVE TOKEN
  ========================= */

  localStorage.setItem(

    "google_token",

    credential

  );

  /* =========================
     USER DATA
  ========================= */

  const userData = {

    name:"Google User",

    email:"googleuser@gmail.com",

    provider:"google"

  };

  localStorage.setItem(

    "vertex_user",

    JSON.stringify(userData)

  );

  /* =========================
     LOGIN STATE
  ========================= */

  localStorage.setItem(

    "vertex_auth",

    "true"

  );

  /* =========================
     REDIRECT
  ========================= */

  window.location.hash =
  "#dashboard";

  if(window.renderPage){

    window.renderPage(
      "dashboard"
    );

  }

}

/* =========================
   EXPORTS
========================= */

export {

  initGoogleLogin

};
