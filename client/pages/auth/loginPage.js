import authService
from "../../services/authService.js";

function createLoginPage(){

  setTimeout(() => {

    initializeLogin();

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

            Welcome Back

          </h2>

          <p>

            Login to your AI cloud workspace

          </p>

        </div>

        <!-- FORM -->

        <form
          class="auth-form"
          id="loginForm"
        >

          <!-- EMAIL -->

          <div class="auth-group">

            <label>

              Email Address

            </label>

            <input
              type="email"
              id="loginEmail"
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
              id="loginPassword"
              placeholder="Enter your password"
              required
            />

          </div>

          <!-- BUTTON -->

          <button
            type="submit"
            class="auth-btn"
            id="loginBtn"
          >

            Login

          </button>

        </form>

        <!-- FOOTER -->

        <div class="auth-footer">

          Don’t have an account?

          <span id="openRegister">

            Register

          </span>

        </div>

      </div>

    </section>

  `;

}

/* =========================
   LOGIN INIT
========================= */

function initializeLogin(){

  const form =
  document.getElementById(
    "loginForm"
  );

  if(!form){

    return;

  }

  /* =========================
     REGISTER LINK
  ========================= */

  const registerLink =
  document.getElementById(
    "openRegister"
  );

  if(registerLink){

    registerLink.addEventListener(

      "click",

      () => {

        window.renderPage(
          "register"
        );

      }

    );

  }

  /* =========================
     LOGIN FORM
  ========================= */

  form.addEventListener(

    "submit",

    async (e) => {

      e.preventDefault();

      /* =========================
         VALUES
      ========================= */

      const email =
      document.getElementById(
        "loginEmail"
      ).value;

      const password =
      document.getElementById(
        "loginPassword"
      ).value;

      /* =========================
         BUTTON
      ========================= */

      const btn =
      document.getElementById(
        "loginBtn"
      );

      btn.innerText =
      "Logging in...";

      btn.disabled = true;

      /* =========================
         API
      ========================= */

      const result =

      await authService
      .loginUser({

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
          "Login successful"
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

          "Login failed"

        );

      }

      /* =========================
         RESET BUTTON
      ========================= */

      btn.innerText =
      "Login";

      btn.disabled = false;

    }

  );

}

export default
createLoginPage;
