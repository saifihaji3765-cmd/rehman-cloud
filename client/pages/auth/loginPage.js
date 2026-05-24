/* =========================
   SERVICES
========================= */

import {

  loginUser

} from "../../app/services/authService.js";

/* =========================
   HELPERS
========================= */

import {

  showNotification,

  setButtonLoading,

  resetButton

} from "../../app/utils/helpers.js";

/* =========================
   LOGIN PAGE
========================= */

function createLoginPage(){

  return `

    <div class="auth-card">

      <!-- =========================
           HEADER
      ========================== -->

      <div class="auth-header">

        <h2>

          Welcome Back

        </h2>

        <p>

          Login to continue
          into VertexCloud

        </p>

      </div>

      <!-- =========================
           GOOGLE LOGIN
      ========================== -->

      <button
        class="social-btn google-btn"
      >

        <span>🔵</span>

        Continue with Google

      </button>

      <!-- =========================
           GITHUB LOGIN
      ========================== -->

      <button
        class="social-btn github-btn"
      >

        <span>⚫</span>

        Continue with GitHub

      </button>

      <!-- DIVIDER -->

      <div class="auth-divider">

        <span>

          OR

        </span>

      </div>

      <!-- =========================
           FORM
      ========================== -->

      <form
        id="loginForm"
        class="auth-form"
      >

        <!-- EMAIL -->

        <div class="form-group">

          <label>

            Email Address

          </label>

          <input

            type="email"

            id="loginEmail"

            placeholder=
            "Enter your email"

            required

          />

        </div>

        <!-- PASSWORD -->

        <div class="form-group">

          <label>

            Password

          </label>

          <input

            type="password"

            id="loginPassword"

            placeholder=
            "Enter your password"

            required

          />

        </div>

        <!-- BUTTON -->

        <button
          type="submit"
          class="auth-submit-btn"
          id="loginBtn"
        >

          Login

        </button>

      </form>

      <!-- FOOTER -->

      <div class="auth-footer">

        <p>

          Don't have an account?

          <span
            class="auth-link"
            id="goToRegister"
          >

            Create Account

          </span>

        </p>

      </div>

    </div>

  `;

}

/* =========================
   INIT LOGIN PAGE
========================= */

export function initLoginPage(){

  /* =========================
     LOGIN FORM
  ========================= */

  const form =

  document.getElementById(
    "loginForm"
  );

  if(form){

    form.addEventListener(

      "submit",

      async (e)=>{

        e.preventDefault();

        const loginBtn =

        document.getElementById(
          "loginBtn"
        );

        /* =========================
           FORM DATA
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
           LOADING
        ========================= */

        setButtonLoading(
          loginBtn,
          "Logging In..."
        );

        /* =========================
           API CALL
        ========================= */

        const result =

        await loginUser({

          email,

          password

        });

        /* =========================
           RESET BUTTON
        ========================= */

        resetButton(
          loginBtn
        );

        /* =========================
           SUCCESS
        ========================= */

        if(result.success){

          showNotification(

            "Login Successful"

          );

          window.location.hash =
          "#dashboard";

        }

        else{

          showNotification(

            result.message ||

            "Login Failed",

            "error"

          );

        }

      }

    );

  }

  /* =========================
     REGISTER LINK
  ========================= */

  const registerLink =

  document.getElementById(
    "goToRegister"
  );

  if(registerLink){

    registerLink.addEventListener(

      "click",

      ()=>{

        window.location.hash =
        "#register";

      }

    );

  }

}

/* =========================
   EXPORT
========================= */

export default createLoginPage;
