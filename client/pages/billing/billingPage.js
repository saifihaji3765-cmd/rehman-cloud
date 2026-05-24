/* =========================
   BILLING PAGE
========================= */

function createBillingPage(){

  return `

    <div class="billing-page">

      <!-- =========================
           HERO
      ========================== -->

      <section class="billing-hero">

        <div class="hero-left">

          <span class="billing-badge">

            💳 VertexCloud Enterprise Billing

          </span>

          <h1>

            Billing & Infrastructure Plans

          </h1>

          <p>

            Scale your AI applications
            with enterprise cloud infrastructure,
            autonomous scaling,
            GPU servers,
            global deployments
            and premium AI systems.

          </p>

        </div>

        <!-- RIGHT -->

        <div class="hero-right">

          <div class="current-plan-card">

            <div class="plan-top">

              <h3>

                Enterprise Plan

              </h3>

              <span class="plan-status">

                ACTIVE

              </span>

            </div>

            <h2>

              $299/mo

            </h2>

            <p>

              Next billing:
              12 June 2026

            </p>

            <button>

              Manage Subscription

            </button>

          </div>

        </div>

      </section>

      <!-- =========================
           BILLING STATS
      ========================== -->

      <section class="billing-stats-grid">

        <!-- CARD -->

        <div class="billing-stat-card">

          <div class="billing-icon">

            💰

          </div>

          <h2>

            $12.4K

          </h2>

          <p>

            Monthly Revenue

          </p>

        </div>

        <!-- CARD -->

        <div class="billing-stat-card">

          <div class="billing-icon">

            ☁

          </div>

          <h2>

            248

          </h2>

          <p>

            Active Containers

          </p>

        </div>

        <!-- CARD -->

        <div class="billing-stat-card">

          <div class="billing-icon">

            🚀

          </div>

          <h2>

            24

          </h2>

          <p>

            Deployments

          </p>

        </div>

        <!-- CARD -->

        <div class="billing-stat-card">

          <div class="billing-icon">

            🌍

          </div>

          <h2>

            18

          </h2>

          <p>

            Global Regions

          </p>

        </div>

      </section>

      <!-- =========================
           PLANS
      ========================== -->

      <section class="pricing-section">

        <div class="section-header">

          <h2>

            🚀 Enterprise Pricing

          </h2>

          <p>

            Choose infrastructure
            that scales with your business

          </p>

        </div>

        <!-- GRID -->

        <div class="pricing-grid">

          <!-- STARTER -->

          <div class="pricing-card">

            <h3>

              Starter

            </h3>

            <h2>

              $19

              <span>

                /month

              </span>

            </h2>

            <p>

              Perfect for beginners

            </p>

            <ul>

              <li>

                ✔ 2GB RAM

              </li>

              <li>

                ✔ 1 vCPU

              </li>

              <li>

                ✔ 25GB Storage

              </li>

              <li>

                ✔ AI Assistant

              </li>

            </ul>

            <button>

              Choose Plan

            </button>

          </div>

          <!-- PRO -->

          <div class="pricing-card popular-card">

            <div class="popular-badge">

              MOST POPULAR

            </div>

            <h3>

              Pro

            </h3>

            <h2>

              $49

              <span>

                /month

              </span>

            </h2>

            <p>

              Best for SaaS founders

            </p>

            <ul>

              <li>

                ✔ 8GB RAM

              </li>

              <li>

                ✔ 4 vCPU

              </li>

              <li>

                ✔ 100GB Storage

              </li>

              <li>

                ✔ AI Automation

              </li>

              <li>

                ✔ Priority Support

              </li>

            </ul>

            <button>

              Upgrade Now

            </button>

          </div>

          <!-- BUSINESS -->

          <div class="pricing-card">

            <h3>

              Business

            </h3>

            <h2>

              $99

              <span>

                /month

              </span>

            </h2>

            <p>

              Advanced AI infrastructure

            </p>

            <ul>

              <li>

                ✔ 16GB RAM

              </li>

              <li>

                ✔ 8 vCPU

              </li>

              <li>

                ✔ 250GB Storage

              </li>

              <li>

                ✔ Global Deployments

              </li>

              <li>

                ✔ AI Scaling

              </li>

            </ul>

            <button>

              Upgrade Now

            </button>

          </div>

          <!-- ENTERPRISE -->

          <div class="pricing-card enterprise-card">

            <div class="enterprise-badge">

              ENTERPRISE

            </div>

            <h3>

              Enterprise

            </h3>

            <h2>

              $299

              <span>

                /month

              </span>

            </h2>

            <p>

              Ultimate AI cloud system

            </p>

            <ul>

              <li>

                ✔ 64GB RAM

              </li>

              <li>

                ✔ 16 vCPU

              </li>

              <li>

                ✔ 1TB Storage

              </li>

              <li>

                ✔ Dedicated Infrastructure

              </li>

              <li>

                ✔ Autonomous AI Agents

              </li>

              <li>

                ✔ 24/7 Enterprise Support

              </li>

            </ul>

            <button>

              Current Plan

            </button>

          </div>

        </div>

      </section>

      <!-- =========================
           BILLING HISTORY
      ========================== -->

      <section class="billing-history-section">

        <div class="panel-header">

          <div>

            <h2>

              🧾 Billing History

            </h2>

            <p>

              Recent invoices & transactions

            </p>

          </div>

          <button class="view-all-btn">

            Download Invoices

          </button>

        </div>

        <!-- TABLE -->

        <div class="billing-history-table">

          <!-- ROW -->

          <div class="billing-row">

            <div>

              Enterprise Subscription

            </div>

            <div>

              May 2026

            </div>

            <div>

              $299

            </div>

            <div class="status success">

              PAID

            </div>

          </div>

          <!-- ROW -->

          <div class="billing-row">

            <div>

              GPU Infrastructure

            </div>

            <div>

              April 2026

            </div>

            <div>

              $149

            </div>

            <div class="status success">

              PAID

            </div>

          </div>

          <!-- ROW -->

          <div class="billing-row">

            <div>

              AI Deployment Scaling

            </div>

            <div>

              March 2026

            </div>

            <div>

              $89

            </div>

            <div class="status success">

              PAID

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

export default createBillingPage;
