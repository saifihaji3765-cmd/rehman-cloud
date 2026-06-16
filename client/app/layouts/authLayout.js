/* =========================
   AUTH LAYOUT
========================= */

function authLayout(content){

  return `

    <div class="auth-page">

      <!-- =========================
           LEFT SIDE
      ========================== -->

      function authLayout(content){

  return `

    <div class="auth-page">

      <!-- LEFT HERO -->

      <div class="auth-left">

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

      <!-- RIGHT LOGIN -->

      <div class="auth-right">

        ${content}

      </div>

    </div>

  `;

}

export default authLayout;

