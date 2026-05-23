function createDashboardPage(){

  return `

    <section class="dashboard-page">

      <!-- TOP -->

      <div class="dashboard-top">

        <div>

          <h2>
            Dashboard
          </h2>

          <p>
            Manage your AI projects,
            deployments and billing.
          </p>

        </div>

        <button class="new-project-btn">

          + New Project

        </button>

      </div>

      <!-- STATS -->

      <div class="stats-grid">

        <div class="stat-card">

          <div class="stat-title">
            Active Projects
          </div>

          <div class="stat-value">
            12
          </div>

        </div>

        <div class="stat-card">

          <div class="stat-title">
            Deployments
          </div>

          <div class="stat-value">
            34
          </div>

        </div>

        <div class="stat-card">

          <div class="stat-title">
            Active Plan
          </div>

          <div class="stat-value">
            Ultra
          </div>

        </div>

        <div class="stat-card">

          <div class="stat-title">
            AI Requests
          </div>

          <div class="stat-value">
            2.4K
          </div>

        </div>

      </div>

      <!-- PROJECTS -->

      <div class="projects-section">

        <div class="section-title">

          Recent Projects

        </div>

        <div class="project-card">

          <div>

            <div class="project-name">

              AI SaaS Builder

            </div>

            <div class="project-desc">

              Fullstack AI platform

            </div>

          </div>

          <div class="project-status">

            Deployed

          </div>

        </div>

        <div class="project-card">

          <div>

            <div class="project-name">

              Automation CRM

            </div>

            <div class="project-desc">

              Workflow automation system

            </div>

          </div>

          <div class="project-status pending">

            Building

          </div>

        </div>

      </div>

    </section>

  `;

}

export default createDashboardPage;
