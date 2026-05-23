function createDeploymentPage(){

  return `

    <section class="deployment-page">

      <!-- TOP -->

      <div class="deployment-top">

        <div>

          <h2>

            Deployments

          </h2>

          <p>

            Manage your live AI cloud infrastructure

          </p>

        </div>

        <button class="deploy-btn">

          + New Deployment

        </button>

      </div>

      <!-- DEPLOYMENT GRID -->

      <div class="deployment-grid">

        <!-- CARD 1 -->

        <div class="deployment-card">

          <div class="deploy-header">

            <div class="deploy-project">

              AI SaaS Builder

            </div>

            <div class="deploy-status live">

              LIVE

            </div>

          </div>

          <div class="deploy-info">

            <div class="deploy-item">

              <span>

                Domain

              </span>

              <strong>

                app.vertexcloud.ai

              </strong>

            </div>

            <div class="deploy-item">

              <span>

                Region

              </span>

              <strong>

                AWS Mumbai

              </strong>

            </div>

            <div class="deploy-item">

              <span>

                Container

              </span>

              <strong>

                Docker Active

              </strong>

            </div>

          </div>

          <div class="deploy-actions">

            <button>

              Open

            </button>

            <button>

              Logs

            </button>

            <button>

              Restart

            </button>

          </div>

        </div>

        <!-- CARD 2 -->

        <div class="deployment-card">

          <div class="deploy-header">

            <div class="deploy-project">

              Automation CRM

            </div>

            <div class="deploy-status building">

              BUILDING

            </div>

          </div>

          <div class="deploy-info">

            <div class="deploy-item">

              <span>

                Domain

              </span>

              <strong>

                crm.vertexcloud.ai

              </strong>

            </div>

            <div class="deploy-item">

              <span>

                Region

              </span>

              <strong>

                AWS Singapore

              </strong>

            </div>

            <div class="deploy-item">

              <span>

                Container

              </span>

              <strong>

                Initializing

              </strong>

            </div>

          </div>

          <div class="deploy-actions">

            <button>

              Details

            </button>

            <button>

              Logs

            </button>

          </div>

        </div>

      </div>

    </section>

  `;

}

export default createDeploymentPage;
