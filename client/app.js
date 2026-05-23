import createNavbar
from "./components/navbar.js";

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
   ELEMENTS
========================= */

const sendBtn =
document.getElementById(
  "sendBtn"
);

const promptInput =
document.getElementById(
  "promptInput"
);

const chatArea =
document.getElementById(
  "chatArea"
);

/* =========================
   AUTO HEIGHT
========================= */

promptInput.addEventListener(
  "input",
  () => {

    promptInput.style.height =
    "auto";

    promptInput.style.height =
    promptInput.scrollHeight +
    "px";

  }
);

/* =========================
   QUICK BUTTONS
========================= */

document
.querySelectorAll(".quick-btn")
.forEach(btn => {

  btn.addEventListener(
    "click",
    () => {

      promptInput.value =
      btn.innerText;

      promptInput.focus();

    }
  );

});

/* =========================
   SEND MESSAGE
========================= */

sendBtn.addEventListener(
  "click",
  async () => {

    const prompt =
    promptInput.value.trim();

    if(!prompt){

      return;

    }

    /* =========================
       USER MESSAGE
    ========================= */

    addUserMessage(prompt);

    /* =========================
       CLEAR
    ========================= */

    promptInput.value = "";

    promptInput.style.height =
    "90px";

    /* =========================
       AI THINKING
    ========================= */

    const thinkingId =
    addThinkingMessage();

    try{

      /* =========================
         API
      ========================= */

      const response =
      await fetch(

        "http://localhost:5000/api/ai",

        {

          method:"POST",

          headers:{
            "Content-Type":
            "application/json"
          },

          body:JSON.stringify({
            prompt
          })

        }

      );

      const data =
      await response.json();

      /* =========================
         REMOVE THINKING
      ========================= */

      removeThinkingMessage(
        thinkingId
      );

      /* =========================
         AI RESPONSE
      ========================= */

      addAIMessage(

        data.reply ||

        "AI completed your request."

      );

    }

    catch(error){

      console.log(error);

      removeThinkingMessage(
        thinkingId
      );

      addAIMessage(

        "AI server connection failed."

      );

    }

  }
);

/* =========================
   USER MESSAGE
========================= */

function addUserMessage(text){

  const wrapper =
  document.createElement("div");

  wrapper.className =
  "user-message-wrapper";

  wrapper.innerHTML = `

    <div class="user-message">

      <div class="message-label">
        YOU
      </div>

      <div class="message-text">
        ${text}
      </div>

    </div>

  `;

  chatArea.appendChild(
    wrapper
  );

  scrollBottom();

}

/* =========================
   AI MESSAGE
========================= */

function addAIMessage(text){

  const wrapper =
  document.createElement("div");

  wrapper.className =
  "ai-message-wrapper";

  wrapper.innerHTML = `

    <div class="ai-message">

      <div class="message-label">
        AI ARCHITECT
      </div>

      <div class="message-text">
        ${text}
      </div>

    </div>

  `;

  chatArea.appendChild(
    wrapper
  );

  scrollBottom();

}

/* =========================
   THINKING MESSAGE
========================= */

function addThinkingMessage(){

  const id =
  Date.now();

  const wrapper =
  document.createElement("div");

  wrapper.className =
  "ai-message-wrapper";

  wrapper.id =
  "thinking-" + id;

  wrapper.innerHTML = `

    <div class="ai-message">

      <div class="message-label">
        AI THINKING
      </div>

      <div class="message-text">
        ⚡ Understanding your idea...
        <br /><br />
        🧠 Planning architecture...
        <br /><br />
        🚀 Preparing AI agents...
      </div>

    </div>

  `;

  chatArea.appendChild(
    wrapper
  );

  scrollBottom();

  return id;

}

/* =========================
   REMOVE THINKING
========================= */

function removeThinkingMessage(id){

  const el =
  document.getElementById(
    "thinking-" + id
  );

  if(el){

    el.remove();

  }

}

/* =========================
   SCROLL
========================= */

function scrollBottom(){

  chatArea.scrollTop =
  chatArea.scrollHeight;

}

/* =========================
   ENTER SEND
========================= */

promptInput.addEventListener(
  "keydown",
  (e) => {

    if(
      e.key === "Enter" &&
      !e.shiftKey
    ){

      e.preventDefault();

      sendBtn.click();

    }

  }
);
