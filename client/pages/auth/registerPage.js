import {

  signupUser

} from "../../services/authService.js";

/* =========================
   REGISTER PAGE
========================= */

export default function registerPage(){

  return `

  <section class="auth-page">

    <div class="auth-card">

      <h1>
        Create Account
      </h1>

      <p>
        Start building AI apps
        with Rehman AI Cloud
      </p>

      <!-- FORM -->

      <form id="registerForm">

        <input

          type="text"

          id="registerName"

          placeholder="Full Name"

          required

        />

        <input

          type="email"

          id="registerEmail"

          placeholder="Email"

          required

        />

        <input

          type="password"

          id="registerPassword"

          placeholder="Password"

          required

        />

        <button type="submit">

          Create Account

        </button>

      </form>

      <!-- MESSAGE -->

      <div
        id="registerMessage"
      ></div>

    </div>

  </section>

  `;

}

/* =========================
   INIT REGISTER
========================= */

export function initRegisterPage(){

  const form =

    document.getElementById(
      "registerForm"
    );

  if(!form){

    return;

  }

  form.addEventListener(

    "submit",

    async (e) => {

      e.preventDefault();

      const name =

        document.getElementById(
          "registerName"
        ).value;

      const email =

        document.getElementById(
          "registerEmail"
        ).value;

      const password =

        document.getElementById(
          "registerPassword"
        ).value;

      const messageBox =

        document.getElementById(
          "registerMessage"
        );

      /* =========================
         LOADING
      ========================= */

      messageBox.innerHTML =

      "⚡ Creating account...";

      /* =========================
         API
      ========================= */

      const result =

        await signupUser({

          name,

          email,

          password

        });

      /* =========================
         SUCCESS
      ========================= */

      if(result.success){

        messageBox.innerHTML =

        "✅ Account created";

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
