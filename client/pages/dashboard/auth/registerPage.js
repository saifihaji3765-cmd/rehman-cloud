function createRegisterPage(){

  return `

    <section class="auth-page">

      <!-- AUTH CARD -->

      <div class="auth-card">

        <!-- TOP -->

        <div class="auth-top">

          <div class="auth-logo">

            ⚡ VertexCloud

          </div>

          <h2>

            Create Account

          </h2>

          <p>

            Start building with your
            AI cloud operating system

          </p>

        </div>

        <!-- FORM -->

        <form class="auth-form">

          <!-- NAME -->

          <div class="auth-group">

            <label>

              Full Name

            </label>

            <input
              type="text"
              placeholder="Enter your full name"
            />

          </div>

          <!-- EMAIL -->

          <div class="auth-group">

            <label>

              Email Address

            </label>

            <input
              type="email"
              placeholder="Enter your email"
            />

          </div>

          <!-- PASSWORD -->

          <div class="auth-group">

            <label>

              Password

            </label>

            <input
              type="password"
              placeholder="Create password"
            />

          </div>

          <!-- CONFIRM PASSWORD -->

          <div class="auth-group">

            <label>

              Confirm Password

            </label>

            <input
              type="password"
              placeholder="Confirm password"
            />

          </div>

          <!-- BUTTON -->

          <button
            type="submit"
            class="auth-btn"
          >

            Create Account

          </button>

        </form>

        <!-- FOOTER -->

        <div class="auth-footer">

          Already have an account?

          <span>

            Login

          </span>

        </div>

      </div>

    </section>

  `;

}

export default createRegisterPage;
