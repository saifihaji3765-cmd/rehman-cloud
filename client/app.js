import createNavbar
from "./components/navbar.js";

import createDashboardPage
from "./pages/dashboard/dashboardPage.js";

import createLoginPage
from "./pages/auth/loginPage.js";

import createRegisterPage
from "./pages/auth/registerPage.js";

import createBillingPage
from "./pages/billing/billingPage.js";

import createDeploymentPage
from "./pages/deployment/deploymentPage.js";

import createSettingsPage
from "./pages/settings/settingsPage.js";

import authService
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
   MENU ITEMS
========================= */

const menuItems =
document.querySelectorAll(
  ".menu-item"
);

/* =========================
   ROUTER
========================= */

function renderPage(page){

  switch(page){

    case "dashboard":

      mainContent.innerHTML =
      createDashboardPage();

    break;

    case "billing":

      mainContent.innerHTML =
      createBillingPage();

    break;

    case "deployments":

      mainContent.innerHTML =
      createDeploymentPage();

    break;

    case "settings":

      mainContent.innerHTML =
      createSettingsPage();

    break;

    case "login":

      mainContent.innerHTML =
      createLoginPage();

    break;

    case "register":

      mainContent.innerHTML =
      createRegisterPage();

    break;

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

menuItems.forEach(item => {

  item.addEventListener(
    "click",
    () => {

      /* REMOVE ACTIVE */

      menuItems.forEach(el => {

        el.classList.remove(
          "active"
        );

      });

      /* ACTIVE */

      item.classList.add(
        "active"
      );

      /* PAGE */

      const page =
      item.dataset.page;

      renderPage(page);

    }
  );

});

/* =========================
   AUTO LOGIN CHECK
========================= */

const user =
authService.getUser();

/* =========================
   DEFAULT ROUTE
========================= */

if(user){

  renderPage(
    "dashboard"
  );

}

else{

  renderPage(
    "login"
  );

}
