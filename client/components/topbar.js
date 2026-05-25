/* =========================
   AUTH SERVICE
========================= */

import {

  getUser,
  logoutUser

} from "../services/authService.js";

/* =========================
   TOPBAR
========================= */

export default function createTopbar(){

  /* =========================
     USER
  ========================== */

  const user =

    getUser() || {

      name:"Vertex User"

    };

  /* =========================
     USERNAME
  ========================== */

  const userName =

    user.name ||

    user.fullName ||

    "Vertex User";

  /* =========================
     EMAIL
  ========================== */

  const userEmail =

    user.email ||

    "vertex@ai.com";

  /* =========================
     AVATAR
  ========================== */

  const userInitial =

    userName
    .charAt(0)
    .toUpperCase();

  /* =========================
     HTML
  ========================== */

  return `

  <!-- =========================
       TOPBAR
  ========================== -->

  <header class="topbar">

    <!-- LEFT -->

    <div class="topbar-left">

      <!-- SEARCH -->

      <div class="topbar-search">

        <span>

          🔍

        </span>

        <input

          type="text"

          placeholder=
          "Search projects, AI agents, deployments..."

        />

      </div>

    </div>

    <!-- RIGHT -->

    <div class="topbar-right">

      <!-- AI STATUS -->

      <div class="topbar-status">

        <span class="status-dot"></span>

        AI Systems Active

      </div>

      <!-- ACTION -->

      <button
        class="topbar-icon-btn"
      >

        🔔

      </button>

      <!-- ACTION -->

      <button
        class="topbar-icon-btn"
      >

        ⚡

      </button>

      <!-- USER -->

      <div
        class="topbar-user"

        id="topbarUser"
      >

        <!-- AVATAR -->

        <div
          class="topbar-avatar"

          id="userAvatar"
        >

          ${userInitial}

        </div>

        <!-- INFO -->

        <div class="topbar-user-info">

          <h4
            id="topbarUserName"
          >

            ${userName}

          </h4>

          <p>

            ${userEmail}

          </p>

        </div>

        <!-- DROPDOWN -->

        <div class="topbar-dropdown">

          <button
            class="dropdown-item"
            id="openWorkspaceBtn"
          >

            🚀 Workspace

          </button>

          <button
            class="dropdown-item"
            id="openSettingsBtn"
          >

            ⚙ Settings

          </button>

          <button
            class="dropdown-item logout"
            id="logoutBtn"
          >

            🚪 Logout

          </button>

        </div>

      </div>

    </div>

  </header>

  `;

}

/* =========================
   INIT TOPBAR
========================= */

export function initTopbar(){

  /* =========================
     LOGOUT
  ========================== */

  const logoutBtn =

    document.getElementById(
      "logoutBtn"
    );

  if(logoutBtn){

    logoutBtn.addEventListener(

      "click",

      ()=>{

        logoutUser();

      }

    );

  }

  /* =========================
     SETTINGS
  ========================== */

  const settingsBtn =

    document.getElementById(
      "openSettingsBtn"
    );

  if(settingsBtn){

    settingsBtn.addEventListener(

      "click",

      ()=>{

        window.location.hash =
        "settings";

      }

    );

  }

  /* =========================
     WORKSPACE
  ========================== */

  const workspaceBtn =

    document.getElementById(
      "openWorkspaceBtn"
    );

  if(workspaceBtn){

    workspaceBtn.addEventListener(

      "click",

      ()=>{

        window.location.hash =
        "workspace";

      }

    );

  }

}
