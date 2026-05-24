/* =========================
   GLOBAL STORE
========================= */

const store = {

  /* =========================
     USER
  ========================= */

  user:null,

  /* =========================
     TOKEN
  ========================= */

  token:null,

  /* =========================
     ACTIVE PAGE
  ========================= */

  activePage:"dashboard",

  /* =========================
     DEPLOYMENTS
  ========================= */

  deployments:[],

  /* =========================
     PROJECTS
  ========================= */

  projects:[],

  /* =========================
     AI CHAT
  ========================= */

  aiMessages:[],

  /* =========================
     BILLING
  ========================= */

  billing:null

};

/* =========================
   SET USER
========================= */

export function setUser(user){

  store.user = user;

}

/* =========================
   GET USER
========================= */

export function getUser(){

  return store.user;

}

/* =========================
   SET TOKEN
========================= */

export function setToken(token){

  store.token = token;

}

/* =========================
   GET TOKEN
========================= */

export function getToken(){

  return store.token;

}

/* =========================
   SET ACTIVE PAGE
========================= */

export function setActivePage(page){

  store.activePage = page;

}

/* =========================
   GET ACTIVE PAGE
========================= */

export function getActivePage(){

  return store.activePage;

}

/* =========================
   SET PROJECTS
========================= */

export function setProjects(projects){

  store.projects = projects;

}

/* =========================
   GET PROJECTS
========================= */

export function getProjects(){

  return store.projects;

}

/* =========================
   SET DEPLOYMENTS
========================= */

export function setDeployments(

  deployments

){

  store.deployments =
  deployments;

}

/* =========================
   GET DEPLOYMENTS
========================= */

export function getDeployments(){

  return store.deployments;

}

/* =========================
   ADD AI MESSAGE
========================= */

export function addAIMessage(

  message

){

  store.aiMessages.push(
    message
  );

}

/* =========================
   GET AI MESSAGES
========================= */

export function getAIMessages(){

  return store.aiMessages;

}

/* =========================
   EXPORT STORE
========================= */

export default store;
