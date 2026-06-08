/* =========================
   API CONFIG
========================= */

const API_CONFIG = {

  /* =========================
     DEVELOPMENT
  ========================= */

  development:{

    API_BASE_URL:
    "http://localhost:3000/api"

  },

  /* =========================
     PRODUCTION
  ========================= */

  production:{

API_BASE_URL:
"http://13.235.27.76:5000/api"

},

};

/* =========================
   ENVIRONMENT
========================= */

const ENVIRONMENT =

window.location.hostname ===
"localhost"

? "development"

: "production";

/* =========================
   EXPORT API URL
========================= */

export const API_BASE_URL =

API_CONFIG[
  ENVIRONMENT
].API_BASE_URL;

/* =========================
   ENDPOINTS
========================= */

export const API_ENDPOINTS = {

  /* AUTH */

  LOGIN:
  `${API_BASE_URL}/auth/login`,

  SIGNUP:
`${API_BASE_URL}/auth/register`,

  GOOGLE_AUTH:
  `${API_BASE_URL}/auth/google`,

  GITHUB_AUTH:
  `${API_BASE_URL}/auth/github`,

  /* AI */

  AI_CHAT:
  `${API_BASE_URL}/ai/chat`,

  /* PROJECTS */

  PROJECTS:
  `${API_BASE_URL}/projects`,

  /* DEPLOYMENTS */

  DEPLOYMENTS:
  `${API_BASE_URL}/deploy`,

  /* BILLING */

  BILLING:
  `${API_BASE_URL}/billing`

};
