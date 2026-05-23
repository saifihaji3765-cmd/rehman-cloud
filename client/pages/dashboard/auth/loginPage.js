function createLoginPage(){

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

            Welcome Back

          </h2>

          <p>

            Login to your AI cloud workspace

          </p>

        </div>

        <!-- FORM -->

        <form class="auth-form">

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
              placeholder="Enter your password"
            />

          </div>

          <!-- BUTTON -->

          <button
            type="submit"
            class="auth-btn"
          >

            Login

          </button>

        </form>

        <!-- FOOTER -->

        <div class="auth-footer">

          Don’t have an account?

          <span>

            Register

          </span>

        </div>

      </div>

    </section>

  `;

}

export default createLoginPage;
