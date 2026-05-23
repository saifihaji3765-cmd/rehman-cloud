import authService
from "../../services/authService.js";

function createRegisterPage(){

  setTimeout(() => {

    initializeRegister();

  },100);

  return `

    <section class="auth-page">

      <!-- AUTH CARD -->

      <div class="auth-card">

        <!-- TOP -->

        <div class="auth-top">

          <div class="auth-logo">

            ⚡ VertexCloud

          </div>

          <h2>

            Create Account

          </h2>

          <p>

            Start building with your
            AI cloud operating system

          </p>

        </div>

        <!-- FORM -->

        <form
          class="auth-form"
          id="registerForm"
        >

          <!-- NAME -->

          <div class="auth-group">

            <label>

              Full Name

            </label>

            <input
              type="text"
              id="registerName"
              placeholder="Enter your full name"
              required
            />

          </div>

          <!-- EMAIL -->

          <div class="auth-group">

            <label>

              Email Address

            </label>

            <input
              type="email"
              id="registerEmail"
              placeholder="Enter your email"
              required
            />

          </div>

          <!-- PASSWORD -->

          <div class="auth-group">

            <label>

              Password

            </label>

            <input
              type="password"
              id="registerPassword"
              placeholder="Create password"
              required
            />

          </div>

          <!-- BUTTON -->

          <button
            type="submit"
            class="auth-btn"
            id="registerBtn"
          >

            Create Account

          </button>

        </form>

        <!-- FOOTER -->

        <div class="auth-footer">

          Already have an account?

          <span id="openLogin">

            Login

          </span>

        </div>

      </div>

    </section>

  `;

}

/* =========================
   REGISTER INIT
========================= */

function initializeRegister(){

  const form =
  document.getElementById(
    "registerForm"
  );

  if(!form){

    return;

  }

  /* =========================
     LOGIN LINK
  ========================= */

  const loginLink =
  document.getElementById(
    "openLogin"
  );

  if(loginLink){

    loginLink.addEventListener(

      "click",

      () => {

        window.renderPage(
          "login"
        );

      }

    );

  }

  /* =========================
     REGISTER FORM
  ========================= */

  form.addEventListener(

    "submit",

    async (e) => {

      e.preventDefault();

      /* =========================
         VALUES
      ========================= */

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

      /* =========================
         BUTTON
      ========================= */

      const btn =
      document.getElementById(
        "registerBtn"
      );

      btn.innerText =
      "Creating Account...";

      btn.disabled = true;

      /* =========================
         API
      ========================= */

      const result =

      await authService
      .registerUser({

        name,
        email,
        password

      });

      /* =========================
         SUCCESS
      ========================= */

      if(result.success){

        authService.saveAuth(
          result
        );

        alert(
          "Account created successfully"
        );

        /* =========================
           REDIRECT
        ========================= */

        window.renderPage(
          "dashboard"
        );

      }

      /* =========================
         FAILED
      ========================= */

      else{

        alert(

          result.message ||

          "Registration failed"

        );

      }

      /* =========================
         RESET BUTTON
      ========================= */

      btn.innerText =
      "Create Account";

      btn.disabled = false;

    }

  );

}

export default
createRegisterPage;
