/* =========================
   SERVICES
========================= */

 import {
  registerUser
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
   REGISTER PAGE
========================= */

function createRegisterPage(){

  return `

    <div class="auth-card">

      <!-- =========================
           HEADER
      ========================== -->

      <div class="auth-header">

        <h2>

          Create Account

        </h2>

        <p>

          Start building with
          VertexCloud AI

        </p>

      </div>

      <!-- =========================
           GOOGLE SIGNUP
      ========================== -->

      <button
        class="social-btn google-btn"
      >

        <span>🔵</span>

        Continue with Google

      </button>

      <!-- =========================
           GITHUB SIGNUP
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
        id="registerForm"
        class="auth-form"
      >

        <!-- NAME -->

        <div class="form-group">

          <label>

            Full Name

          </label>

          <input

            type="text"

            id="registerName"

            placeholder=
            "Enter your full name"

            required

          />

        </div>

        <!-- EMAIL -->

        <div class="form-group">

          <label>

            Email Address

          </label>

          <input

            type="email"

            id="registerEmail"

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

            id="registerPassword"

            placeholder=
            "Create password"

            required

          />

        </div>

        <!-- BUTTON -->

        <button
          type="submit"
          class="auth-submit-btn"
          id="registerBtn"
        >

          Create Account

        </button>

      </form>

      <!-- FOOTER -->

      <div class="auth-footer">

        <p>

          Already have an account?

          <span
            class="auth-link"
            id="goToLogin"
          >

            Login

          </span>

        </p>

      </div>

    </div>

  `;

}

/* =========================
   INIT REGISTER PAGE
========================= */

export function initRegisterPage(){

  /* =========================
     REGISTER FORM
  ========================= */

  const form =

  document.getElementById(
    "registerForm"
  );

  if(form){

    form.addEventListener(

      "submit",

      async (e)=>{

        e.preventDefault();

        const registerBtn =

        document.getElementById(
          "registerBtn"
        );

        /* =========================
           FORM DATA
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
           LOADING
        ========================= */

        setButtonLoading(
          registerBtn,
          "Creating Account..."
        );

        /* =========================
           API CALL
        ========================= */

        const result =

await registerUser({

          name,

          email,

          password

        });

        /* =========================
           RESET BUTTON
        ========================= */

        resetButton(
          registerBtn
        );

        /* =========================
           SUCCESS
        ========================= */

        if(result.success){

          showNotification(

            "Account Created Successfully"

          );

          window.location.hash =
          "#dashboard";

        }

        else{

          showNotification(

            result.message ||

            "Signup Failed",

            "error"

          );

        }

      }

    );

  }

  /* =========================
     LOGIN LINK
  ========================= */

  const loginLink =

  document.getElementById(
    "goToLogin"
  );

  if(loginLink){

    loginLink.addEventListener(

      "click",

      ()=>{

        window.location.hash =
        "#login";

      }

    );

  }

}

/* =========================
   EXPORT
========================= */

export default createRegisterPage;
