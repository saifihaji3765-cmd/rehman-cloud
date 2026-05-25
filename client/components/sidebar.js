/* =========================
   SIDEBAR COMPONENT
========================= */

function createSidebar(){

  return `

    <aside class="sidebar">

      <!-- =========================
           SIDEBAR TOP
      ========================== -->

      <div>

        <!-- LOGO -->

        <div class="sidebar-logo">

          <div class="logo-icon">

            ⚡

          </div>

          <div class="logo-text">

            <h2>

              VertexCloud

            </h2>

            <p>

              Enterprise AI OS

            </p>

          </div>

        </div>

        <!-- =========================
             MENU
        ========================== -->

        <div class="sidebar-menu">

          <!-- DASHBOARD -->

          <button
            class="menu-item active"
            data-page="dashboard"
          >

            <span class="menu-icon">

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

            <span class="menu-icon">

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

            <span class="menu-icon">

              🚀

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

            <span class="menu-icon">

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

            <span class="menu-icon">

              ⚙

            </span>

            <span>

              Settings

            </span>

          </button>

        </div>

      </div>

      <!-- =========================
           SIDEBAR FOOTER
      ========================== -->

      <div class="sidebar-footer">

        <!-- UPGRADE -->

        <div class="upgrade-card">

          <h3>

            VertexCloud Pro

          </h3>

          <p>

            Unlock enterprise AI,
            autonomous agents,
            global deployments
            and advanced infrastructure.

          </p>

          <button class="upgrade-btn">

            Upgrade Plan

          </button>

        </div>

      </div>

    </aside>

  `;

}

/* =========================
   EXPORT
========================= */

export default createSidebar;
