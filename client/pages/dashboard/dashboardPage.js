/* =========================
   AUTH SERVICE
========================= */

import {

  getUser

} from "../../app/services/authService.js";

/* =========================
   DASHBOARD PAGE
========================= */

function createDashboardPage(){

  /* =========================
     USER
  ========================= */

  const user = getUser();

  const userName =

  user?.name ||

  "Developer";

  return `

    <div class="dashboard-page">

      <!-- =========================
           ENTERPRISE HERO
      ========================== -->

      <section class="enterprise-hero">

        <!-- LEFT -->

        <div class="hero-left">

          <span class="dashboard-badge">

            ⚡ VertexCloud Enterprise AI OS

          </span>

          <h1>

            Welcome,
            ${userName} 🚀

          </h1>

          <p>

            Manage enterprise infrastructure,
            AI deployments,
            autonomous agents,
            cloud applications,
            scaling systems
            and production workloads globally.

          </p>

          <!-- BUTTONS -->

          <div class="hero-buttons">

            <button
              class="primary-dashboard-btn"
            >

              🚀 Deploy New App

            </button>

            <button
              class="secondary-dashboard-btn"
            >

              🤖 Launch AI Agent

            </button>

            <button
              class="secondary-dashboard-btn"
            >

              📂 Upload Project

            </button>

          </div>

        </div>

        <!-- RIGHT -->

        <div class="hero-right">

          <!-- CLOUD STATUS -->

          <div class="cloud-status-card">

            <div class="cloud-header">

              <h3>

                ☁ Cloud Infrastructure

              </h3>

              <span class="live-dot">

                ● LIVE

              </span>

            </div>

            <!-- GRID -->

            <div class="cloud-grid">

              <div class="cloud-box">

                <h2>

                  99.99%

                </h2>

                <p>

                  Uptime

                </p>

              </div>

              <div class="cloud-box">

                <h2>

                  14

                </h2>

                <p>

                  AI Agents

                </p>

              </div>

              <div class="cloud-box">

                <h2>

                  248

                </h2>

                <p>

                  Containers

                </p>

              </div>

              <div class="cloud-box">

                <h2>

                  2.4M

                </h2>

                <p>

                  Requests

                </p>

              </div>

            </div>

          </div>

        </div>

      </section>

      <!-- =========================
           ANALYTICS
      ========================== -->

      <section class="analytics-grid">

        <!-- CARD -->

        <div class="analytics-card">

          <div class="analytics-top">

            <span>

              🚀

            </span>

            <span class="growth">

              +12%

            </span>

          </div>

          <h2>

            24

          </h2>

          <p>

            Active Deployments

          </p>

        </div>

        <!-- CARD -->

        <div class="analytics-card">

          <div class="analytics-top">

            <span>

              🤖

            </span>

            <span class="growth">

              LIVE

            </span>

          </div>

          <h2>

            14

          </h2>

          <p>

            AI Agents Running

          </p>

        </div>

        <!-- CARD -->

        <div class="analytics-card">

          <div class="analytics-top">

            <span>

              💰

            </span>

            <span class="growth">

              +28%

            </span>

          </div>

          <h2>

            $12.4K

          </h2>

          <p>

            Monthly Revenue

          </p>

        </div>

        <!-- CARD -->

        <div class="analytics-card">

          <div class="analytics-top">

            <span>

              🌍

            </span>

            <span class="growth">

              GLOBAL

            </span>

          </div>

          <h2>

            18

          </h2>

          <p>

            AWS Regions

          </p>

        </div>

      </section>

      <!-- =========================
           MAIN GRID
      ========================== -->

      <section class="dashboard-grid">

        <!-- =========================
             AI COMMAND CENTER
        ========================== -->

        <div class="dashboard-panel large-panel">

          <div class="panel-header">

            <div>

              <h2>

                🤖 AI Command Center

              </h2>

              <p>

                GPT-4.1 + Autonomous Agents

              </p>

            </div>

            <span class="panel-live">

              ● ACTIVE

            </span>

          </div>

          <!-- CHAT -->

          <div class="ai-chat-container">

            <div class="ai-message">

              👋 Welcome ${userName},
              your infrastructure is online.

            </div>

            <div class="ai-message">

              🚀 3 deployments completed
              successfully in last 2 hours.

            </div>

            <div class="ai-message">

              🤖 AI agents are monitoring
              infrastructure security
              and scaling automatically.

            </div>

          </div>

          <!-- INPUT -->

          <div class="ai-command-box">

            <input

              type="text"

              placeholder=
              "Ask AI to deploy apps, generate APIs, fix missing files, optimize cloud..."

              id="dashboardAIInput"

            />

            <button
              id="sendAIBtn"
            >

              Execute

            </button>

          </div>

        </div>

        <!-- =========================
             LIVE SYSTEM STATUS
        ========================== -->

        <div class="dashboard-panel">

          <div class="panel-header">

            <h2>

              📡 Live System

            </h2>

          </div>

          <div class="system-status-list">

            <div class="status-item">

              <span>

                AWS Servers

              </span>

              <span class="status-live">

                Online

              </span>

            </div>

            <div class="status-item">

              <span>

                Auto Scaling

              </span>

              <span class="status-live">

                Enabled

              </span>

            </div>

            <div class="status-item">

              <span>

                Security Shield

              </span>

              <span class="status-live">

                Protected

              </span>

            </div>

            <div class="status-item">

              <span>

                AI Monitoring

              </span>

              <span class="status-live">

                Running

              </span>

            </div>

            <div class="status-item">

              <span>

                Database Cluster

              </span>

              <span class="status-live">

                Healthy

              </span>

            </div>

          </div>

        </div>

      </section>

      <!-- =========================
           DEPLOYMENTS
      ========================== -->

      <section class="dashboard-panel">

        <div class="panel-header">

          <div>

            <h2>

              🚀 Enterprise Deployments

            </h2>

            <p>

              Production infrastructure

            </p>

          </div>

          <button class="view-all-btn">

            View All

          </button>

        </div>

        <!-- TABLE -->

        <div class="deployments-table">

          <!-- ROW -->

          <div class="deployment-row">

            <div class="deployment-project">

              AI SaaS Platform

            </div>

            <div>

              Production

            </div>

            <div>

              AWS Mumbai

            </div>

            <div class="status success">

              Live

            </div>

          </div>

          <!-- ROW -->

          <div class="deployment-row">

            <div class="deployment-project">

              Rehman Business OS

            </div>

            <div>

              Enterprise

            </div>

            <div>

              AWS Frankfurt

            </div>

            <div class="status pending">

              Scaling

            </div>

          </div>

          <!-- ROW -->

          <div class="deployment-row">

            <div class="deployment-project">

              AI Video Generator

            </div>

            <div>

              Production

            </div>

            <div>

              AWS Singapore

            </div>

            <div class="status success">

              Live

            </div>

          </div>

        </div>

      </section>

      <!-- =========================
           AI AGENTS
      ========================== -->

      <section class="agents-grid">

        <!-- AGENT -->

        <div class="agent-card">

          <h3>

            🧠 Master Agent

          </h3>

          <p>

            Controls infrastructure,
            architecture & orchestration.

          </p>

          <span class="agent-status">

            ACTIVE

          </span>

        </div>

        <!-- AGENT -->

        <div class="agent-card">

          <h3>

            ⚡ Deployment Agent

          </h3>

          <p>

            Deploys projects globally
            across AWS clusters.

          </p>

          <span class="agent-status">

            RUNNING

          </span>

        </div>

        <!-- AGENT -->

        <div class="agent-card">

          <h3>

            🔒 Security Agent

          </h3>

          <p>

            Detects vulnerabilities,
            threats and attacks.

          </p>

          <span class="agent-status">

            PROTECTED

          </span>

        </div>

        <!-- AGENT -->

        <div class="agent-card">

          <h3>

            📈 Scaling Agent

          </h3>

          <p>

            Auto scaling & traffic
            balancing system.

          </p>

          <span class="agent-status">

            OPTIMIZED

          </span>

        </div>

      </section>

    </div>

  `;

}

/* =========================
   EXPORT
========================= */

export default createDashboardPage;
