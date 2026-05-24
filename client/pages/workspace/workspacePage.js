/* =========================
   WORKSPACE PAGE
========================= */

function createWorkspacePage(){

  return `

    <div class="workspace-page">

      <!-- =========================
           HERO SECTION
      ========================== -->

      <section class="workspace-hero advanced-hero">

        <div class="hero-left">

          <span class="workspace-badge">

            ⚡ VertexCloud Autonomous AI Lab

          </span>

          <h1>

            Build Anything With AI

          </h1>

          <p>

            Create SaaS apps,
            AI systems,
            APIs,
            cloud platforms,
            automation tools,
            dashboards,
            mobile apps
            and enterprise products
            with autonomous AI agents.

          </p>

          <!-- ACTIONS -->

          <div class="hero-actions">

            <button
              class="workspace-primary-btn"
            >

              🚀 Start New Project

            </button>

            <button
              class="workspace-secondary-btn"
            >

              📂 Import GitHub Repo

            </button>

            <button
              class="workspace-secondary-btn"
            >

              ☁ Deploy Existing App

            </button>

          </div>

        </div>

        <!-- RIGHT -->

        <div class="hero-right">

          <div class="ai-system-card">

            <div class="system-header">

              <h3>

                🤖 AI System Status

              </h3>

              <span class="system-live">

                ● ACTIVE

              </span>

            </div>

            <!-- STATS -->

            <div class="system-grid">

              <div class="system-box">

                <h2>

                  14

                </h2>

                <p>

                  AI Agents

                </p>

              </div>

              <div class="system-box">

                <h2>

                  248

                </h2>

                <p>

                  Containers

                </p>

              </div>

              <div class="system-box">

                <h2>

                  99.9%

                </h2>

                <p>

                  Uptime

                </p>

              </div>

              <div class="system-box">

                <h2>

                  18

                </h2>

                <p>

                  AWS Regions

                </p>

              </div>

            </div>

          </div>

        </div>

      </section>

      <!-- =========================
           QUICK AI TOOLS
      ========================== -->

      <section class="quick-tools-grid">

        <!-- TOOL -->

        <div class="tool-card">

          <div class="tool-icon">

            🤖

          </div>

          <h3>

            AI SaaS Generator

          </h3>

          <p>

            Generate complete SaaS apps
            with backend,
            frontend,
            auth and billing.

          </p>

          <button>

            Launch

          </button>

        </div>

        <!-- TOOL -->

        <div class="tool-card">

          <div class="tool-icon">

            ⚡

          </div>

          <h3>

            API Builder

          </h3>

          <p>

            Create production-ready APIs
            with databases and security.

          </p>

          <button>

            Launch

          </button>

        </div>

        <!-- TOOL -->

        <div class="tool-card">

          <div class="tool-icon">

            🎨

          </div>

          <h3>

            Frontend AI

          </h3>

          <p>

            Generate enterprise UI/UX
            dashboards and applications.

          </p>

          <button>

            Launch

          </button>

        </div>

        <!-- TOOL -->

        <div class="tool-card">

          <div class="tool-icon">

            ☁

          </div>

          <h3>

            Deployment AI

          </h3>

          <p>

            Deploy globally on cloud
            with scaling & monitoring.

          </p>

          <button>

            Launch

          </button>

        </div>

      </section>

      <!-- =========================
           MAIN GRID
      ========================== -->

      <section class="workspace-main-grid">

        <!-- =========================
             AI COMMAND CENTER
        ========================== -->

        <div class="workspace-panel ultra-panel">

          <div class="panel-header">

            <div>

              <h2>

                🧠 AI Command Center

              </h2>

              <p>

                GPT-4.1 + Autonomous Agents

              </p>

            </div>

            <span class="panel-live">

              ● ONLINE

            </span>

          </div>

          <!-- AI CHAT -->

          <div class="workspace-chat advanced-chat">

            <div class="workspace-message ai">

              👋 Welcome to VertexCloud.

            </div>

            <div class="workspace-message ai">

              🚀 AI agents are ready
              to generate full-stack apps,
              APIs,
              dashboards,
              cloud systems
              and deployment pipelines.

            </div>

            <div class="workspace-message ai">

              ⚡ You can also import
              GitHub repositories
              and deploy them globally.

            </div>

          </div>

          <!-- INPUT -->

          <div class="workspace-command-box">

            <textarea

              id="workspacePrompt"

              placeholder=
              "Describe your idea... Example: Build an AI SaaS platform with authentication, billing, deployment and admin dashboard."

            ></textarea>

            <!-- ACTIONS -->

            <div class="command-actions">

              <button
                class="attach-btn"
              >

                📎 Attach Files

              </button>

              <button
                class="voice-btn"
              >

                🎤 Voice Prompt

              </button>

              <button
                id="generateProjectBtn"
                class="generate-btn"
              >

                🚀 Generate Project

              </button>

            </div>

          </div>

        </div>

        <!-- =========================
             RIGHT SIDEBAR
        ========================== -->

        <div class="workspace-sidebar">

          <!-- STATUS -->

          <div class="workspace-panel">

            <div class="panel-header">

              <h2>

                📡 AI Systems

              </h2>

            </div>

            <div class="status-list">

              <div class="status-item">

                <span>

                  Master Agent

                </span>

                <span class="status-live">

                  Active

                </span>

              </div>

              <div class="status-item">

                <span>

                  Deployment AI

                </span>

                <span class="status-live">

                  Running

                </span>

              </div>

              <div class="status-item">

                <span>

                  Security Agent

                </span>

                <span class="status-live">

                  Protected

                </span>

              </div>

              <div class="status-item">

                <span>

                  Scaling Agent

                </span>

                <span class="status-live">

                  Optimized

                </span>

              </div>

            </div>

          </div>

          <!-- CLOUD -->

          <div class="workspace-panel">

            <div class="panel-header">

              <h2>

                ☁ Cloud Usage

              </h2>

            </div>

            <div class="cloud-usage">

              <div class="usage-item">

                <p>

                  CPU Usage

                </p>

                <div class="usage-bar">

                  <div
                    class="usage-fill"
                    style="width:72%"
                  ></div>

                </div>

              </div>

              <div class="usage-item">

                <p>

                  RAM Usage

                </p>

                <div class="usage-bar">

                  <div
                    class="usage-fill"
                    style="width:58%"
                  ></div>

                </div>

              </div>

              <div class="usage-item">

                <p>

                  GPU Usage

                </p>

                <div class="usage-bar">

                  <div
                    class="usage-fill"
                    style="width:84%"
                  ></div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      <!-- =========================
           RECENT PROJECTS
      ========================== -->

      <section class="workspace-projects-section">

        <div class="panel-header">

          <div>

            <h2>

              📂 Enterprise Projects

            </h2>

            <p>

              AI generated applications

            </p>

          </div>

          <button class="view-all-btn">

            View All

          </button>

        </div>

        <!-- GRID -->

        <div class="projects-grid advanced-projects">

          <!-- PROJECT -->

          <div class="project-card advanced-project-card">

            <div class="project-top">

              <span class="project-type">

                SaaS

              </span>

              <span class="project-status live">

                LIVE

              </span>

            </div>

            <h3>

              AI SaaS Platform

            </h3>

            <p>

              Full-stack SaaS platform
              with AI,
              auth,
              billing,
              deployments
              and analytics.

            </p>

            <div class="project-footer">

              <span>

                AWS Mumbai

              </span>

              <button>

                Open

              </button>

            </div>

          </div>

          <!-- PROJECT -->

          <div class="project-card advanced-project-card">

            <div class="project-top">

              <span class="project-type">

                AI

              </span>

              <span class="project-status building">

                BUILDING

              </span>

            </div>

            <h3>

              AI Video Generator

            </h3>

            <p>

              Enterprise GPU-based
              AI media generation platform.

            </p>

            <div class="project-footer">

              <span>

                AWS Frankfurt

              </span>

              <button>

                Open

              </button>

            </div>

          </div>

          <!-- PROJECT -->

          <div class="project-card advanced-project-card">

            <div class="project-top">

              <span class="project-type">

                Enterprise

              </span>

              <span class="project-status live">

                LIVE

              </span>

            </div>

            <h3>

              Rehman Business OS

            </h3>

            <p>

              Autonomous AI operating
              system for business automation.

            </p>

            <div class="project-footer">

              <span>

                Global Infrastructure

              </span>

              <button>

                Open

              </button>

            </div>

          </div>

        </div>

      </section>

    </div>

  `;

}

/* =========================
   EXPORT
========================= */

export default createWorkspacePage;
