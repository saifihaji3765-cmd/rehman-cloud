/* =========================
   NAVBAR
========================= */

import * as authService
from "../../services/authService.js";

/* =========================
   NAVBAR COMPONENT
========================= */

function createNavbar(){

  const user =

    authService.getUser();

  return `

    <aside class="sidebar">

      <!-- =========================
           LOGO
      ========================== -->

      <div class="sidebar-logo">

        <div class="logo-icon">

          ⚡

        </div>

        <div>

          <h2>

            VertexCloud

          </h2>

          <p>

            AI Cloud OS

          </p>

        </div>

      </div>

      <!-- =========================
           USER PROFILE
      ========================== -->

      <div class="sidebar-user">

        <div class="user-avatar">

          ${

            user?.name
            ? user.name.charAt(0)
            : "V"

          }

        </div>

        <div>

          <h3>

            ${

              user?.name
              || "Guest User"

            }

          </h3>

          <p>

            Enterprise Workspace

          </p>

        </div>

      </div>

      <!-- =========================
           MENU
      ========================== -->

      <nav class="sidebar-menu">

        <!-- DASHBOARD -->

        <button

          class="menu-item active"

          data-page="dashboard"

        >

          <span>

            🏠

          </span>

          <span>

            Dashboard

          </span>

        </button>

        <!-- WORKSPACE -->

        <button

          class="menu-item"

          data-page="workspace"

        >

          <span>

            🤖

          </span>

          <span>

            AI Workspace

          </span>

        </button>

        <!-- DEPLOYMENTS -->

        <button

          class="menu-item"

          data-page="deployments"

        >

          <span>

            ☁

          </span>

          <span>

            Deployments

          </span>

        </button>

        <!-- BILLING -->

        <button

          class="menu-item"

          data-page="billing"

        >

          <span>

            💳

          </span>

          <span>

            Billing

          </span>

        </button>

        <!-- SETTINGS -->

        <button

          class="menu-item"

          data-page="settings"

        >

          <span>

            ⚙

          </span>

          <span>

            Settings

          </span>

        </button>

      </nav>

      <!-- =========================
           AI STATUS
      ========================== -->

      <div class="sidebar-ai-status">

        <div class="ai-status-top">

          <h3>

            🤖 AI Systems

          </h3>

          <span class="status-live">

            ● ONLINE

          </span>

        </div>

        <!-- STATUS ITEMS -->

        <div class="ai-status-list">

          <div class="ai-status-item">

            <span>

              Master Agent

            </span>

            <span>

              Active

            </span>

          </div>

          <div class="ai-status-item">

            <span>

              Deployment AI

            </span>

            <span>

              Running

            </span>

          </div>

          <div class="ai-status-item">

            <span>

              Security AI

            </span>

            <span>

              Protected

            </span>

          </div>

        </div>

      </div>

      <!-- =========================
           STORAGE
      ========================== -->

      <div class="sidebar-storage">

        <div class="storage-top">

          <span>

            ☁ Cloud Storage

          </span>

          <span>

            74%

          </span>

        </div>

        <!-- BAR -->

        <div class="storage-bar">

          <div class="storage-fill">

          </div>

        </div>

      </div>

      <!-- =========================
           FOOTER
      ========================== -->

      <div class="sidebar-footer">

        <button
          id="logoutBtn"
          class="logout-btn"
        >

          🚪 Logout

        </button>

      </div>

    </aside>

  `;

}

/* =========================
   INIT NAVBAR
========================= */

export function initNavbar(){

  const logoutBtn =

    document.getElementById(
      "logoutBtn"
    );

  if(logoutBtn){

    logoutBtn.addEventListener(

      "click",

      ()=>{

        authService.logoutUser();

      }

    );

  }

}

/* =========================
   EXPORT
========================= */

export default createNavbar;
