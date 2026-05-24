import createNavbar
from "./components/navbar.js";

import createDashboardPage
from "./pages/dashboard/dashboardPage.js";

import authPage,

{

  initAuthPage

}

from "./pages/auth/authPage.js";

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

        renderPage("auth");

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
       AUTH
    ========================= */

    case "auth":

      mainContent.innerHTML =

      authPage();

      initAuthPage();

    break;

    /* =========================
       DEFAULT
    ========================= */

    default:

      mainContent.innerHTML =

      authPage();

      initAuthPage();

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

  (e)=>{

    const item =

    e.target.closest(
      ".menu-item"
    );

    if(!item){

      return;

    }

    /* =========================
       REMOVE ACTIVE
    ========================= */

    document

    .querySelectorAll(
      ".menu-item"
    )

    .forEach(el=>{

      el.classList.remove(
        "active"
      );

    });

    /* =========================
       ACTIVE
    ========================= */

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

  ()=>{

    const page =

    window.location.hash
    .replace("#","");

    renderPage(page);

  }

);

/* =========================
   INITIAL PAGE
========================= */

const currentPage =

window.location.hash
.replace("#","");

/* =========================
   START APP
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
      "auth"
    );

  }

}
