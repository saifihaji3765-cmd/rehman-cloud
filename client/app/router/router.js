/* =========================
   LAYOUTS
========================= */

import authLayout
from "../layouts/authLayout.js";

import dashboardLayout
from "../layouts/dashboardLayout.js";

/* =========================
   PAGES
========================= */

import createLoginPage
from "../../pages/auth/loginPage.js";

import createRegisterPage
from "../../pages/auth/registerPage.js";

import createDashboardPage
from "../../pages/dashboard/dashboardPage.js";

import createWorkspacePage
from "../../pages/workspace/workspacePage.js";

import createDeploymentsPage
from "../../pages/deployments/deploymentsPage.js";

import createBillingPage
from "../../pages/billing/billingPage.js";

import createSettingsPage
from "../../pages/settings/settingsPage.js";

/* =========================
   SERVICES
========================= */

import {

  isAuthenticated

} from "../services/authService.js";

/* =========================
   ROOT
========================= */

const appRoot =

document.getElementById(
  "app"
);

/* =========================
   ROUTER
========================= */

function renderRoute(route){

  switch(route){

    /* =========================
       LOGIN
    ========================= */

    case "login":

      appRoot.innerHTML =

      authLayout(

        createLoginPage()

      );

    break;

    /* =========================
       REGISTER
    ========================= */

    case "register":

      appRoot.innerHTML =

      authLayout(

        createRegisterPage()

      );

    break;

    /* =========================
       DASHBOARD
    ========================= */

    case "dashboard":

      if(

        !isAuthenticated()

      ){

        window.location.hash =
        "#login";

        return;

      }

      appRoot.innerHTML =

      dashboardLayout(

        createDashboardPage()

      );

    break;

    /* =========================
       WORKSPACE
    ========================= */

    case "workspace":

      if(

        !isAuthenticated()

      ){

        window.location.hash =
        "#login";

        return;

      }

      appRoot.innerHTML =

      dashboardLayout(

        createWorkspacePage()

      );

    break;

    /* =========================
       DEPLOYMENTS
    ========================= */

    case "deployments":

      if(

        !isAuthenticated()

      ){

        window.location.hash =
        "#login";

        return;

      }

      appRoot.innerHTML =

      dashboardLayout(

        createDeploymentsPage()

      );

    break;

    /* =========================
       BILLING
    ========================= */

    case "billing":

      if(

        !isAuthenticated()

      ){

        window.location.hash =
        "#login";

        return;

      }

      appRoot.innerHTML =

      dashboardLayout(

        createBillingPage()

      );

    break;

    /* =========================
       SETTINGS
    ========================= */

    case "settings":

      if(

        !isAuthenticated()

      ){

        window.location.hash =
        "#login";

        return;

      }

      appRoot.innerHTML =

      dashboardLayout(

        createSettingsPage()

      );

    break;

    /* =========================
       DEFAULT
    ========================= */

    default:

      if(

        isAuthenticated()

      ){

        window.location.hash =
        "#dashboard";

      }

      else{

        window.location.hash =
        "#login";

      }

  }

}

/* =========================
   HASH CHANGE
========================= */

window.addEventListener(

  "hashchange",

  () => {

    const route =

    window.location.hash
    .replace("#","");

    renderRoute(route);

  }

);

/* =========================
   INITIAL ROUTE
========================= */

const initialRoute =

window.location.hash
.replace("#","");

renderRoute(initialRoute);

/* =========================
   EXPORT
========================= */

export default renderRoute;
