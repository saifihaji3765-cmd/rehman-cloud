import {

  loginUser

} from "../../services/authService.js";

/* =========================
   LOGIN PAGE
========================= */

export default function loginPage(){

  return `

  <section class="auth-page">

    <div class="auth-card">

      <h1>
        Welcome Back
      </h1>

      <p>
        Login to continue building
        with Rehman AI Cloud
      </p>

      <!-- FORM -->

      <form id="loginForm">

        <input

          type="email"

          id="loginEmail"

          placeholder="Email"

          required

        />

        <input

          type="password"

          id="loginPassword"

          placeholder="Password"

          required

        />

        <button type="submit">

          Login

        </button>

      </form>

      <!-- MESSAGE -->

      <div
        id="loginMessage"
      ></div>

    </div>

  </section>

  `;

}

/* =========================
   INIT LOGIN
========================= */

export function initLoginPage(){

  const form =

    document.getElementById(
      "loginForm"
    );

  if(!form){

    return;

  }

  form.addEventListener(

    "submit",

    async (e) => {

      e.preventDefault();

      const email =

        document.getElementById(
          "loginEmail"
        ).value;

      const password =

        document.getElementById(
          "loginPassword"
        ).value;

      const messageBox =

        document.getElementById(
          "loginMessage"
        );

      /* =========================
         LOADING
      ========================= */

      messageBox.innerHTML =

      "⚡ Logging in...";

      /* =========================
         API
      ========================= */

      const result =

        await loginUser({

          email,

          password

        });

      /* =========================
         SUCCESS
      ========================= */

      if(result.success){

        messageBox.innerHTML =

        "✅ Login successful";

        setTimeout(() => {

          window.location.hash =
          "#dashboard";

        },1000);

      }

      /* =========================
         FAILED
      ========================= */

      else{

        messageBox.innerHTML =

        `❌ ${result.message}`;

      }

    }

  );

}
