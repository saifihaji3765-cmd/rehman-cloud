function createNavbar(){

  return `

    <nav class="top-navbar">

      <!-- LEFT -->

      <div class="nav-left">

        <div class="nav-logo">

          ⚡ VertexCloud

        </div>

      </div>

      <!-- CENTER -->

      <div class="nav-center">

        <button class="nav-link active">

          Workspace

        </button>

        <button class="nav-link">

          Projects

        </button>

        <button class="nav-link">

          Deployments

        </button>

        <button class="nav-link">

          Billing

        </button>

      </div>

      <!-- RIGHT -->

      <div class="nav-right">

        <button class="upgrade-btn">

          Upgrade

        </button>

        <div class="user-avatar">

          R

        </div>

      </div>

    </nav>

  `;

}

/* =========================
   EXPORT
========================= */

export default createNavbar;
