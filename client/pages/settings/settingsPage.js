/* =========================
   SETTINGS PAGE
========================= */

function createSettingsPage(){

  return `

    <div class="settings-page">

      <!-- =========================
           HERO
      ========================== -->

      <section class="settings-hero">

        <div class="hero-left">

          <span class="settings-badge">

            ⚙ VertexCloud Enterprise Settings

          </span>

          <h1>

            Platform Settings & Controls

          </h1>

          <p>

            Manage your account,
            infrastructure,
            AI systems,
            deployments,
            security,
            API access
            and enterprise workspace.

          </p>

        </div>

        <!-- RIGHT -->

        <div class="hero-right">

          <div class="account-card">

            <div class="account-top">

              <div class="account-avatar">

                R

              </div>

              <div>

                <h3>

                  Rehman Saifi

                </h3>

                <p>

                  Enterprise Owner

                </p>

              </div>

            </div>

            <div class="account-status">

              <span>

                Enterprise Access

              </span>

              <span class="status-live">

                ACTIVE

              </span>

            </div>

          </div>

        </div>

      </section>

      <!-- =========================
           SETTINGS GRID
      ========================== -->

      <section class="settings-grid">

        <!-- =========================
             PROFILE SETTINGS
        ========================== -->

        <div class="settings-card large-card">

          <div class="card-header">

            <h2>

              👤 Profile Settings

            </h2>

          </div>

          <!-- FORM -->

          <div class="settings-form">

            <!-- NAME -->

            <div class="form-group">

              <label>

                Full Name

              </label>

              <input

                type="text"

                value="Rehman Saifi"

              />

            </div>

            <!-- EMAIL -->

            <div class="form-group">

              <label>

                Email Address

              </label>

              <input

                type="email"

                value="rehman@gmail.com"

              />

            </div>

            <!-- COMPANY -->

            <div class="form-group">

              <label>

                Company

              </label>

              <input

                type="text"

                value="VertexCloud"

              />

            </div>

            <!-- BUTTON -->

            <button
              class="save-btn"
            >

              Save Changes

            </button>

          </div>

        </div>

        <!-- =========================
             SECURITY
        ========================== -->

        <div class="settings-card">

          <div class="card-header">

            <h2>

              🔒 Security

            </h2>

          </div>

          <!-- LIST -->

          <div class="settings-list">

            <div class="setting-item">

              <span>

                Two-Factor Authentication

              </span>

              <button>

                Enable

              </button>

            </div>

            <div class="setting-item">

              <span>

                API Security

              </span>

              <button>

                Active

              </button>

            </div>

            <div class="setting-item">

              <span>

                Device Protection

              </span>

              <button>

                Protected

              </button>

            </div>

          </div>

        </div>

        <!-- =========================
             AI SETTINGS
        ========================== -->

        <div class="settings-card">

          <div class="card-header">

            <h2>

              🤖 AI Settings

            </h2>

          </div>

          <!-- AI OPTIONS -->

          <div class="settings-list">

            <div class="setting-item">

              <span>

                Autonomous Agents

              </span>

              <button>

                ON

              </button>

            </div>

            <div class="setting-item">

              <span>

                AI Auto-Fix

              </span>

              <button>

                Enabled

              </button>

            </div>

            <div class="setting-item">

              <span>

                Smart Deployment AI

              </span>

              <button>

                Running

              </button>

            </div>

          </div>

        </div>

        <!-- =========================
             DEPLOYMENT SETTINGS
        ========================== -->

        <div class="settings-card large-card">

          <div class="card-header">

            <h2>

              ☁ Deployment Settings

            </h2>

          </div>

          <!-- DEPLOY OPTIONS -->

          <div class="settings-form">

            <div class="form-group">

              <label>

                Default Region

              </label>

              <select>

                <option>

                  AWS Mumbai

                </option>

                <option>

                  AWS Frankfurt

                </option>

                <option>

                  AWS Singapore

                </option>

              </select>

            </div>

            <div class="form-group">

              <label>

                Deployment Mode

              </label>

              <select>

                <option>

                  Production

                </option>

                <option>

                  Development

                </option>

              </select>

            </div>

            <div class="form-group">

              <label>

                Auto Scaling

              </label>

              <select>

                <option>

                  Enabled

                </option>

                <option>

                  Disabled

                </option>

              </select>

            </div>

            <button
              class="save-btn"
            >

              Update Infrastructure

            </button>

          </div>

        </div>

      </section>

      <!-- =========================
           API KEYS
      ========================== -->

      <section class="settings-card">

        <div class="card-header">

          <div>

            <h2>

              🔑 API Access

            </h2>

            <p>

              Manage API keys & integrations

            </p>

          </div>

          <button class="generate-key-btn">

            Generate API Key

          </button>

        </div>

        <!-- TABLE -->

        <div class="api-table">

          <!-- ROW -->

          <div class="api-row">

            <div>

              Production API

            </div>

            <div>

              sk_live_xxxxxxxxx

            </div>

            <div class="status-live">

              ACTIVE

            </div>

          </div>

          <!-- ROW -->

          <div class="api-row">

            <div>

              Development API

            </div>

            <div>

              sk_dev_xxxxxxxxx

            </div>

            <div class="status-live">

              ACTIVE

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

export default createSettingsPage;
