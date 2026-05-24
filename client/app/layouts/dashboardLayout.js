/* =========================
   DASHBOARD LAYOUT
========================= */

function dashboardLayout(content){

  return `

    <div class="dashboard-layout">

      <!-- =========================
           SIDEBAR
      ========================== -->

      <aside class="dashboard-sidebar">

        <!-- LOGO -->

        <div class="sidebar-logo">

          <h2>

            VertexCloud

          </h2>

        </div>

        <!-- NAVIGATION -->

        <nav class="sidebar-menu">

          <button
            class="sidebar-item active"
            data-page="dashboard"
          >

            🏠 Dashboard

          </button>

          <button
            class="sidebar-item"
            data-page="workspace"
          >

            🤖 AI Workspace

          </button>

          <button
            class="sidebar-item"
            data-page="deployments"
          >

            🚀 Deployments

          </button>

          <button
            class="sidebar-item"
            data-page="billing"
          >

            💳 Billing

          </button>

          <button
            class="sidebar-item"
            data-page="settings"
          >

            ⚙ Settings

          </button>

        </nav>

        <!-- USER -->

        <div class="sidebar-user">

          <div class="user-avatar">

            R

          </div>

          <div class="user-info">

            <h4>

              Rehman

            </h4>

            <p>

              Enterprise Plan

            </p>

          </div>

        </div>

      </aside>

      <!-- =========================
           MAIN CONTENT
      ========================== -->

      <main class="dashboard-main">

        <!-- TOPBAR -->

        <header class="dashboard-topbar">

          <div class="topbar-left">

            <h1>

              AI Cloud Workspace

            </h1>

          </div>

          <div class="topbar-right">

            <button
              class="deploy-btn"
            >

              🚀 New Deployment

            </button>

          </div>

        </header>

        <!-- PAGE CONTENT -->

        <section class="dashboard-content">

          ${content}

        </section>

      </main>

    </div>

  `;

}

/* =========================
   EXPORT
========================= */

export default dashboardLayout;
