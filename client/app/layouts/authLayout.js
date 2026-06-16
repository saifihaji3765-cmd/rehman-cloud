/* =========================
   AUTH LAYOUT
========================= */

function authLayout(content){

  return `

    <div class="auth-page">

      <!-- =========================
           LEFT SIDE
      ========================== -->

      <div class="auth-left">

        <div class="auth-brand">

          <h1>

            VertexCloud

          </h1>

          <p>

            AI Cloud Operating System

          </p>

        </div>

        <div class="auth-content">

          ${content}

        </div>

      </div>

      <!-- =========================
           RIGHT SIDE
      ========================== -->

      <div class="auth-right">

        <div class="auth-hero">

          <span class="hero-badge">

            ⚡ AI Powered Infrastructure

          </span>

          <h2>

            Build & Deploy
            AI Apps Faster

          </h2>

          <p>

            Deploy full-stack AI products,
            automate infrastructure,
            manage deployments and scale
            globally with autonomous AI agents.

          </p>

          <!-- =========================
               STATS
          ========================== -->

          <div class="hero-stats">

            <div class="hero-stat-card">

              <h3>10K+</h3>

              <span>Deployments</span>

            </div>

            <div class="hero-stat-card">

              <h3>99.9%</h3>

              <span>Uptime</span>

            </div>

            <div class="hero-stat-card">

              <h3>24/7</h3>

              <span>AI Monitoring</span>

            </div>

          </div>

        </div>

      </div>

    </div>

  `;

}

/* =========================
   EXPORT
========================= */

export default authLayout;
