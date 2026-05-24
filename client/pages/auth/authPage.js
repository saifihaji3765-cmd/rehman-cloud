import {

  signupUser,

  loginUser

}

from "../../services/authService.js";

/* =========================
   CSS
========================= */

import "./auth.css";

/* =========================
   AUTH PAGE
========================= */

export default function authPage(){

  return `

  <section class="auth-page">

    <div class="auth-card">

      <!-- =========================
           LEFT
      ========================== -->

      <div class="auth-left">

        <div class="auth-brand">

          ⚡ Rehman AI OS

        </div>

        <h1 class="auth-title">

          Build The Future
          <span>
            With AI
          </span>

        </h1>

        <p class="auth-text">

          Create SaaS apps, deploy AI systems,
          automate workflows and scale products
          using autonomous AI infrastructure.

        </p>

        <div class="auth-features">

          <div class="auth-feature">
            🚀 Build SaaS Apps With AI
          </div>

          <div class="auth-feature">
            ☁ Deploy Directly To AWS
          </div>

          <div class="auth-feature">
            🤖 AI Auto-Fixes Missing Files
          </div>

          <div class="auth-feature">
            💳 Pay Only When You Deploy
          </div>

        </div>

      </div>

      <!-- =========================
           RIGHT
      ========================== -->

      <div class="auth-right">

        <div class="auth-form-box">

          <h2 class="auth-form-title">

            Welcome Back

          </h2>

          <p class="auth-form-subtitle">

            Login or create your AI workspace

          </p>

          <!-- =========================
               OAUTH
          ========================== -->

          <div class="oauth-buttons">

            <button
              class="oauth-btn"
              id="googleBtn"
            >

              Continue With Google

            </button>

            <button
              class="oauth-btn"
              id="githubBtn"
            >

              Continue With GitHub

            </button>

          </div>

          <!-- =========================
               DIVIDER
          ========================== -->

          <div class="auth-divider">

            OR

          </div>

          <!-- =========================
               FORM
          ========================== -->

          <form
            class="auth-form"
            id="authForm"
          >

            <input

              type="text"

              class="auth-input"

              id="authName"

              placeholder="Full Name"

            />

            <input

              type="email"

              class="auth-input"

              id="authEmail"

              placeholder="Email"

              required

            />

            <input

              type="password"

              class="auth-input"

              id="authPassword"

              placeholder="Password"

              required

            />

            <button
              type="submit"
              class="auth-submit"
              id="authSubmit"
            >

              Login

            </button>

          </form>

          <!-- =========================
               MESSAGE
          ========================== -->

          <div
            id="authMessage"
            class="auth-switch"
          ></div>

          <!-- =========================
               SWITCH
          ========================== -->

          <div class="auth-switch">

            <span id="switchAuth">

              Create Account

            </span>

          </div>

        </div>

      </div>

    </div>

  </section>

  `;

}

/* =========================
   INIT AUTH
========================= */

export function initAuthPage(){

  let isLogin = true;

  const form =
  document.getElementById(
    "authForm"
  );

  const switchBtn =
  document.getElementById(
    "switchAuth"
  );

  const title =
  document.querySelector(
    ".auth-form-title"
  );

  const submitBtn =
  document.getElementById(
    "authSubmit"
  );

  const nameInput =
  document.getElementById(
    "authName"
  );

  const messageBox =
  document.getElementById(
    "authMessage"
  );

  /* =========================
     SWITCH MODE
  ========================= */

  switchBtn.addEventListener(

    "click",

    ()=>{

      isLogin = !isLogin;

      if(isLogin){

        title.innerHTML =
        "Welcome Back";

        submitBtn.innerHTML =
        "Login";

        switchBtn.innerHTML =
        "Create Account";

        nameInput.style.display =
        "none";

      }

      else{

        title.innerHTML =
        "Create Account";

        submitBtn.innerHTML =
        "Create Account";

        switchBtn.innerHTML =
        "Already Have Account";

        nameInput.style.display =
        "block";

      }

    }

  );

  /* =========================
     DEFAULT
  ========================= */

  nameInput.style.display =
  "none";

  /* =========================
     FORM SUBMIT
  ========================= */

  form.addEventListener(

    "submit",

    async (e)=>{

      e.preventDefault();

      const name =
      nameInput.value;

      const email =
      document.getElementById(
        "authEmail"
      ).value;

      const password =
      document.getElementById(
        "authPassword"
      ).value;

      /* =========================
         LOADING
      ========================= */

      messageBox.innerHTML =
      "⚡ Processing...";

      let result;

      /* =========================
         LOGIN
      ========================= */

      if(isLogin){

        result =

        await loginUser({

          email,

          password

        });

      }

      /* =========================
         SIGNUP
      ========================= */

      else{

        result =

        await signupUser({

          name,

          email,

          password

        });

      }

      /* =========================
         SUCCESS
      ========================= */

      if(result.success){

        messageBox.innerHTML =
        "✅ Success";

        setTimeout(()=>{

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

  /* =========================
     GOOGLE LOGIN
  ========================= */

  document
  .getElementById(
    "googleBtn"
  )

  .addEventListener(

    "click",

    ()=>{

      alert(
        "Google OAuth Coming Next 🚀"
      );

    }

  );

  /* =========================
     GITHUB LOGIN
  ========================= */

  document
  .getElementById(
    "githubBtn"
  )

  .addEventListener(

    "click",

    ()=>{

      alert(
        "GitHub OAuth Coming Next 🚀"
      );

    }

  );

}
