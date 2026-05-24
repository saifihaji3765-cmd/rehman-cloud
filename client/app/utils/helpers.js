/* =========================
   FORMAT DATE
========================= */

export function formatDate(date){

  return new Date(date)
  .toLocaleDateString(

    "en-US",

    {

      year:"numeric",

      month:"short",

      day:"numeric"

    }

  );

}

/* =========================
   FORMAT CURRENCY
========================= */

export function formatCurrency(

  amount

){

  return new Intl.NumberFormat(

    "en-US",

    {

      style:"currency",

      currency:"USD"

    }

  )

  .format(amount);

}

/* =========================
   GENERATE ID
========================= */

export function generateId(){

  return Math.random()

  .toString(36)

  .substring(2,12);

}

/* =========================
   COPY TO CLIPBOARD
========================= */

export async function copyToClipboard(

  text

){

  try{

    await navigator.clipboard
    .writeText(text);

    return true;

  }

  catch(error){

    console.log(error);

    return false;

  }

}

/* =========================
   SHOW NOTIFICATION
========================= */

export function showNotification(

  message,

  type="success"

){

  const notification =

  document.createElement("div");

  notification.className =

  `notification ${type}`;

  notification.innerHTML =

  message;

  document.body.appendChild(
    notification
  );

  /* =========================
     AUTO REMOVE
  ========================= */

  setTimeout(()=>{

    notification.classList.add(
      "show"
    );

  },100);

  setTimeout(()=>{

    notification.remove();

  },3000);

}

/* =========================
   DEBOUNCE
========================= */

export function debounce(

  callback,

  delay=500

){

  let timeout;

  return (...args)=>{

    clearTimeout(timeout);

    timeout = setTimeout(()=>{

      callback(...args);

    },delay);

  };

}

/* =========================
   LOADING BUTTON
========================= */

export function setButtonLoading(

  button,

  loadingText="Loading..."

){

  button.dataset.originalText =

  button.innerHTML;

  button.innerHTML =
  loadingText;

  button.disabled = true;

}

/* =========================
   RESET BUTTON
========================= */

export function resetButton(

  button

){

  button.innerHTML =

  button.dataset.originalText;

  button.disabled = false;

}
