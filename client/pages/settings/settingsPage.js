function createSettingsPage(){

  return `

    <section class="settings-page">

      <!-- TOP -->

      <div class="settings-top">

        <h2>

          Settings

        </h2>

        <p>

          Manage your account and cloud preferences

        </p>

      </div>

      <!-- SETTINGS GRID -->

      <div class="settings-grid">

        <!-- PROFILE -->

        <div class="settings-card">

          <div class="settings-card-title">

            Profile Information

          </div>

          <div class="settings-form">

            <div class="settings-group">

              <label>

                Full Name

              </label>

              <input
                type="text"
                placeholder="Rehman Saifi"
              />

            </div>

            <div class="settings-group">

              <label>

                Email Address

              </label>

              <input
                type="email"
                placeholder="rehman@example.com"
              />

            </div>

            <button class="settings-btn">

              Save Changes

            </button>

          </div>

        </div>

        <!-- SECURITY -->

        <div class="settings-card">

          <div class="settings-card-title">

            Security

          </div>

          <div class="settings-form">

            <div class="settings-group">

              <label>

                New Password

              </label>

              <input
                type="password"
                placeholder="Enter new password"
              />

            </div>

            <div class="settings-group">

              <label>

                Confirm Password

              </label>

              <input
                type="password"
                placeholder="Confirm password"
              />

            </div>

            <button class="settings-btn">

              Update Password

            </button>

          </div>

        </div>

        <!-- CLOUD -->

        <div class="settings-card">

          <div class="settings-card-title">

            Cloud Infrastructure

          </div>

          <div class="cloud-options">

            <div class="cloud-item">

              <span>

                AWS Auto Scaling

              </span>

              <input type="checkbox" checked />

            </div>

            <div class="cloud-item">

              <span>

                Docker Monitoring

              </span>

              <input type="checkbox" checked />

            </div>

            <div class="cloud-item">

              <span>

                AI Auto Deployments

              </span>

              <input type="checkbox" checked />

            </div>

          </div>

        </div>

      </div>

    </section>

  `;

}

export default createSettingsPage;
