/* =========================
   AUTH SERVICE
========================= */

import {

  getUser

} from "../../services/authService.js";

/* =========================
   DASHBOARD PAGE
========================= */

export default function createDashboardPage(){

  /* =========================
     USER
  ========================== */

  const user =

    getUser() || {

      name:"Vertex User"

    };

  /* =========================
     USER NAME
  ========================== */

  const userName =

    user.name ||

    user.fullName ||

    "Vertex User";

  /* =========================
     USER INITIAL
  ========================== */

  const userInitial =

    userName
    .charAt(0)
    .toUpperCase();

  /* =========================
     TOPBAR UPDATE
  ========================== */

  setTimeout(()=>{

    const topbarName =

    document.getElementById(
      "topbarUserName"
    );

    const avatar =

    document.getElementById(
      "userAvatar"
    );

    if(topbarName){

      topbarName.innerText =
      userName;

    }

    if(avatar){

      avatar.innerText =
      userInitial;

    }

  },100);

  /* =========================
     HTML
  ========================== */

  return `

  <!-- =========================
       DASHBOARD PAGE
  ========================== -->

  <div class="dashboard-page">

    <!-- =========================
         HERO
    ========================== -->

    <section class="dashboard-hero">

      <!-- LEFT -->

      <div class="dashboard-hero-left">

        <div class="dashboard-badge">

          ⚡ Enterprise AI OS Active

        </div>

        <h1>

          Welcome back,
          ${userName}

        </h1>

        <p>

          Vertex AI Cloud is running
          successfully.

          Your AI agents,
          deployments,
          automation systems,
          cloud infrastructure
          and enterprise workspace
          are ready.

        </p>

        <!-- ACTIONS -->

        <div class="dashboard-actions">

          <button
            class=
            "dashboard-primary-btn"
          >

            🚀 Create Project

          </button>

          <button
            class=
            "dashboard-secondary-btn"
          >

            🤖 Open AI Workspace

          </button>

        </div>

      </div>

      <!-- RIGHT -->

      <div
        class=
        "dashboard-hero-right"
      >

        <div
          class=
          "dashboard-ai-status"
        >

          <h3>

            AI System Status

          </h3>

          <!-- ITEM -->

          <div
            class=
            "ai-status-item"
          >

            <span>

              Master Agent

            </span>

            <span
              class=
              "ai-status-live"
            >

              ● Online

            </span>

          </div>

          <!-- ITEM -->

          <div
            class=
            "ai-status-item"
          >

            <span>

              Frontend Agent

            </span>

            <span
              class=
              "ai-status-live"
            >

              ● Running

            </span>

          </div>

          <!-- ITEM -->

          <div
            class=
            "ai-status-item"
          >

            <span>

              Backend Agent

            </span>

            <span
              class=
              "ai-status-live"
            >

              ● Running

            </span>

          </div>

          <!-- ITEM -->

          <div
            class=
            "ai-status-item"
          >

            <span>

              Deployment Agent

            </span>

            <span
              class=
              "ai-status-live"
            >

              ● Ready

            </span>

          </div>

        </div>

      </div>

    </section>

    <!-- =========================
         STATS
    ========================== -->

    <section
      class=
      "dashboard-stats-grid"
    >

      <!-- CARD -->

      <div
        class=
        "dashboard-stat-card"
      >

        <div class="stat-top">

          <div class="stat-icon">

            🚀

          </div>

          <div class="stat-growth">

            +28%

          </div>

        </div>

        <h2>

          14

        </h2>

        <p>

          Active Projects

        </p>

      </div>

      <!-- CARD -->

      <div
        class=
        "dashboard-stat-card"
      >

        <div class="stat-top">

          <div class="stat-icon">

            🤖

          </div>

          <div class="stat-growth">

            +64%

          </div>

        </div>

        <h2>

          28

        </h2>

        <p>

          AI Agents Running

        </p>

      </div>

      <!-- CARD -->

      <div
        class=
        "dashboard-stat-card"
      >

        <div class="stat-top">

          <div class="stat-icon">

            ☁️

          </div>

          <div class="stat-growth">

            +18%

          </div>

        </div>

        <h2>

          128GB

        </h2>

        <p>

          Cloud Resources

        </p>

      </div>

      <!-- CARD -->

      <div
        class=
        "dashboard-stat-card"
      >

        <div class="stat-top">

          <div class="stat-icon">

            ⚡

          </div>

          <div class="stat-growth">

            +99.9%

          </div>

        </div>

        <h2>

          Stable

        </h2>

        <p>

          Infrastructure Health

        </p>

      </div>

    </section>

    <!-- =========================
         MAIN GRID
    ========================== -->

    <section
      class=
      "dashboard-main-grid"
    >

      <!-- =========================
           PROJECTS
      ========================== -->

      <div
        class=
        "dashboard-panel"
      >

        <!-- HEADER -->

        <div class="panel-header">

          <div>

            <h2>

              Enterprise Projects

            </h2>

            <p>

              Your latest AI projects

            </p>

          </div>

        </div>

        <!-- PROJECTS -->

        <div
          class=
          "dashboard-projects"
        >

          <!-- ITEM -->

          <div class="project-item">

            <div
              class=
              "project-left"
            >

              <div
                class=
                "project-icon"
              >

                🤖

              </div>

              <div
                class=
                "project-info"
              >

                <h3>

                  AI SaaS Platform

                </h3>

                <p>

                  Full stack AI SaaS app

                </p>

              </div>

            </div>

            <div
              class=
              "project-status live"
            >

              LIVE

            </div>

          </div>

          <!-- ITEM -->

          <div class="project-item">

            <div
              class=
              "project-left"
            >

              <div
                class=
                "project-icon"
              >

                🚀

              </div>

              <div
                class=
                "project-info"
              >

                <h3>

                  Deployment System

                </h3>

                <p>

                  AWS multi region deploy

                </p>

              </div>

            </div>

            <div
              class=
              "project-status building"
            >

              BUILDING

            </div>

          </div>

          <!-- ITEM -->

          <div class="project-item">

            <div
              class=
              "project-left"
            >

              <div
                class=
                "project-icon"
              >

                ⚡

              </div>

              <div
                class=
                "project-info"
              >

                <h3>

                  Rehman Business OS

                </h3>

                <p>

                  Enterprise AI automation

                </p>

              </div>

            </div>

            <div
              class=
              "project-status live"
            >

              LIVE

            </div>

          </div>

        </div>

      </div>

      <!-- =========================
           ACTIVITY
      ========================== -->

      <div
        class=
        "dashboard-panel"
      >

        <!-- HEADER -->

        <div class="panel-header">

          <div>

            <h2>

              Activity Feed

            </h2>

            <p>

              AI system activities

            </p>

          </div>

        </div>

        <!-- LIST -->

        <div class="activity-list">

          <!-- ITEM -->

          <div class="activity-item">

            <div
              class=
              "activity-dot"
            ></div>

            <div
              class=
              "activity-content"
            >

              <h4>

                AI generated new API

              </h4>

              <p>

                Backend agent created
                authentication routes.

              </p>

            </div>

          </div>

          <!-- ITEM -->

          <div class="activity-item">

            <div
              class=
              "activity-dot"
            ></div>

            <div
              class=
              "activity-content"
            >

              <h4>

                Deployment completed

              </h4>

              <p>

                AWS deployment finished
                successfully.

              </p>

            </div>

          </div>

          <!-- ITEM -->

          <div class="activity-item">

            <div
              class=
              "activity-dot"
            ></div>

            <div
              class=
              "activity-content"
            >

              <h4>

                AI repaired missing files

              </h4>

              <p>

                System automatically fixed
                broken imports and configs.

              </p>

            </div>

          </div>

        </div>

      </div>

    </section>

  </div>

  `;

}
