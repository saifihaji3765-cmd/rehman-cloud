function createBillingPage(){

  return `

    <section class="billing-page">

      <!-- TOP -->

      <div class="billing-top">

        <h2>

          Billing & Plans

        </h2>

        <p>

          Upgrade your AI cloud infrastructure

        </p>

      </div>

      <!-- PLANS -->

      <div class="plans-grid">

        <!-- STARTER -->

        <div class="plan-card">

          <div class="plan-name">

            Starter

          </div>

          <div class="plan-price">

            $19

            <span>

              /month

            </span>

          </div>

          <ul class="plan-features">

            <li>2 GB RAM</li>

            <li>1 vCPU</li>

            <li>25 GB Storage</li>

            <li>250 GB Bandwidth</li>

            <li>Basic AI</li>

            <li>Community Support</li>

          </ul>

          <button class="plan-btn">

            Choose Plan

          </button>

        </div>

        <!-- PRO -->

        <div class="plan-card featured-plan">

          <div class="plan-badge">

            MOST POPULAR

          </div>

          <div class="plan-name">

            Pro

          </div>

          <div class="plan-price">

            $49

            <span>

              /month

            </span>

          </div>

          <ul class="plan-features">

            <li>8 GB RAM</li>

            <li>4 vCPU</li>

            <li>100 GB Storage</li>

            <li>1 TB Bandwidth</li>

            <li>Advanced AI</li>

            <li>Priority Support</li>

          </ul>

          <button class="plan-btn">

            Upgrade Now

          </button>

        </div>

        <!-- BUSINESS -->

        <div class="plan-card">

          <div class="plan-name">

            Business

          </div>

          <div class="plan-price">

            $99

            <span>

              /month

            </span>

          </div>

          <ul class="plan-features">

            <li>16 GB RAM</li>

            <li>8 vCPU</li>

            <li>250 GB Storage</li>

            <li>Unlimited Bandwidth</li>

            <li>Business AI Automation</li>

            <li>24/7 Premium Support</li>

          </ul>

          <button class="plan-btn">

            Go Business

          </button>

        </div>

        <!-- ENTERPRISE -->

        <div class="plan-card ultra-plan">

          <div class="plan-name">

            Enterprise

          </div>

          <div class="plan-price">

            $299

            <span>

              /month

            </span>

          </div>

          <ul class="plan-features">

            <li>64 GB RAM</li>

            <li>16 vCPU</li>

            <li>1 TB Storage</li>

            <li>Unlimited Bandwidth</li>

            <li>Enterprise AI Infrastructure</li>

            <li>Dedicated Success Manager</li>

            <li>Auto Scaling</li>

            <li>Advanced Monitoring</li>

            <li>Dedicated Infrastructure</li>

          </ul>

          <button class="plan-btn">

            Contact Sales

          </button>

        </div>

      </div>

    </section>

  `;

}

export default createBillingPage;
