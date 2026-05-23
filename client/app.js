import createNavbar
from "./components/navbar.js";

import createDashboardPage
from "./pages/dashboard/dashboardPage.js";

import createLoginPage,

{

  initLoginPage

}

from "./pages/auth/loginPage.js";

import createRegisterPage,

{

  initRegisterPage

}

from "./pages/auth/registerPage.js";

import createBillingPage
from "./pages/billing/billingPage.js";

import createDeploymentPage
from "./pages/deployment/deploymentPage.js";

import createSettingsPage
from "./pages/settings/settingsPage.js";

import * as authService
from "./services/authService.js";

/* =========================
   NAVBAR
========================= */

const navbarContainer =

document.getElementById(
  "navbarContainer"
);

navbarContainer.innerHTML =

createNavbar();

/* =========================
   MAIN CONTENT
========================= */

const mainContent =

document.getElementById(
  "mainContent"
);

/* =========================
   ROUTER
========================= */

function renderPage(page){

  switch(page){

    /* =========================
       DASHBOARD
    ========================= */

    case "dashboard":

      if(

        !authService.isAuthenticated()

      ){

        renderPage("login");

        return;

      }

      mainContent.innerHTML =

      createDashboardPage();

    break;

    /* =========================
       BILLING
    ========================= */

    case "billing":

      mainContent.innerHTML =

      createBillingPage();

    break;

    /* =========================
       DEPLOYMENTS
    ========================= */

    case "deployments":

      mainContent.innerHTML =

      createDeploymentPage();

    break;

    /* =========================
       SETTINGS
    ========================= */

    case "settings":

      mainContent.innerHTML =

      createSettingsPage();

    break;

    /* =========================
       LOGIN
    ========================= */

    case "login":

      mainContent.innerHTML =

      createLoginPage();

      initLoginPage();

    break;

    /* =========================
       REGISTER
    ========================= */

    case "register":

      mainContent.innerHTML =

      createRegisterPage();

      initRegisterPage();

    break;

    /* =========================
       DEFAULT
    ========================= */

    default:

      mainContent.innerHTML =

      createDashboardPage();

  }

}

/* =========================
   GLOBAL ROUTER
========================= */

window.renderPage =

renderPage;

/* =========================
   SIDEBAR EVENTS
========================= */

document.addEventListener(

  "click",

  (e) => {

    const item =

    e.target.closest(
      ".menu-item"
    );

    if(!item){

      return;

    }

    /* =========================
       ACTIVE MENU
    ========================= */

    document

    .querySelectorAll(
      ".menu-item"
    )

    .forEach(el => {

      el.classList.remove(
        "active"
      );

    });

    item.classList.add(
      "active"
    );

    /* =========================
       PAGE
    ========================= */

    const page =

    item.dataset.page;

    renderPage(page);

  }

);

/* =========================
   HASH ROUTER
========================= */

window.addEventListener(

  "hashchange",

  () => {

    const page =

    window.location.hash
    .replace("#","");

    renderPage(page);

  }

);

/* =========================
   AUTO ROUTE
========================= */

const currentPage =

window.location.hash
.replace("#","");

/* =========================
   AUTH CHECK
========================= */

if(currentPage){

  renderPage(currentPage);

}

else{

  if(

    authService.isAuthenticated()

  ){

    renderPage(
      "dashboard"
    );

  }

  else{

    renderPage(
      "login"
    );

  }

}
