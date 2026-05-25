/* =========================
   AI WORKSPACE PAGE
========================= */

export default function createWorkspacePage(){

  return `

  <!-- =========================
       WORKSPACE PAGE
  ========================== -->

  <div class="workspace-page">

    <!-- =========================
         HERO
    ========================== -->

    <section class="workspace-hero">

      <div class="workspace-hero-left">

        <div class="workspace-badge">

          ⚡ AI AGENT SYSTEM ACTIVE

        </div>

        <h1>

          Build SaaS Apps,
          AI Agents,
          APIs &
          Full Systems
          With AI

        </h1>

        <p>

          Vertex AI can generate
          frontend,
          backend,
          databases,
          authentication,
          deployment logic,
          APIs,
          SaaS systems,
          and enterprise applications.

        </p>

      </div>

      <!-- RIGHT -->

      <div class="workspace-ai-card">

        <h3>

          AI SYSTEM STATUS

        </h3>

        <div class="workspace-status">

          <span>
            Master Agent
          </span>

          <strong class="online">
            Online
          </strong>

        </div>

        <div class="workspace-status">

          <span>
            Backend Agent
          </span>

          <strong class="online">
            Online
          </strong>

        </div>

        <div class="workspace-status">

          <span>
            Frontend Agent
          </span>

          <strong class="online">
            Online
          </strong>

        </div>

        <div class="workspace-status">

          <span>
            Deployment Agent
          </span>

          <strong class="online">
            Online
          </strong>

        </div>

      </div>

    </section>

    <!-- =========================
         AI CHAT AREA
    ========================== -->

    <section class="workspace-chat-section">

      <!-- HEADER -->

      <div class="workspace-chat-header">

        <div>

          <h2>

            Vertex AI Workspace

          </h2>

          <p>

            Generate apps,
            APIs,
            systems,
            UI,
            deployment
            and automation.

          </p>

        </div>

        <button
          class="workspace-new-btn"
        >

          + New Workspace

        </button>

      </div>

      <!-- CHAT -->

      <div
        class="workspace-chat-box"

        id="workspaceChatBox"
      >

        <!-- AI MESSAGE -->

        <div class="ai-message">

          <div class="message-avatar">

            🤖

          </div>

          <div class="message-content">

            <h4>
              Vertex AI
            </h4>

            <p>

              Welcome to Vertex AI Workspace.

              Describe what you want to build.

              Example:

              - SaaS app
              - AI chatbot
              - CRM
              - AI Agent
              - API
              - Landing page
              - Full startup

            </p>

          </div>

        </div>

      </div>

      <!-- INPUT -->

      <div class="workspace-input-area">

        <textarea

          id="workspacePrompt"

          placeholder=
          "Describe what you want to build with AI..."

        ></textarea>

        <div class="workspace-actions">

          <button
            class="workspace-attach-btn"
          >

            📎 Attach

          </button>

          <button
            id="sendPromptBtn"

            class="workspace-send-btn"
          >

            ⚡ Generate With AI

          </button>

        </div>

      </div>

    </section>

    <!-- =========================
         FEATURES
    ========================== -->

    <section class="workspace-features-grid">

      <!-- CARD -->

      <div class="workspace-feature-card">

        <div class="feature-icon">

          ⚡

        </div>

        <h3>

          AI Full Stack Generator

        </h3>

        <p>

          Generate frontend,
          backend,
          database,
          APIs,
          authentication
          and deployment.

        </p>

      </div>

      <!-- CARD -->

      <div class="workspace-feature-card">

        <div class="feature-icon">

          🚀

        </div>

        <h3>

          One Click Deploy

        </h3>

        <p>

          Deploy apps instantly
          using enterprise
          infrastructure
          and AI automation.

        </p>

      </div>

      <!-- CARD -->

      <div class="workspace-feature-card">

        <div class="feature-icon">

          🧠

        </div>

        <h3>

          Smart AI Agents

        </h3>

        <p>

          Multiple AI agents
          coordinate together
          like a real
          software company.

        </p>

      </div>

      <!-- CARD -->

      <div class="workspace-feature-card">

        <div class="feature-icon">

          🔥

        </div>

        <h3>

          Auto Missing File Repair

        </h3>

        <p>

          AI detects missing files,
          broken imports,
          deployment issues,
          and fixes them automatically.

        </p>

      </div>

    </section>

  </div>

  `;

}
