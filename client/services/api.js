const API_BASE_URL =

"http://localhost:3000/api";

/* =========================
   API REQUEST
========================= */

async function apiRequest(

  endpoint,

  method = "GET",

  body = null

){

  try{

    /* =========================
       TOKEN
    ========================= */

    const token =
    localStorage.getItem(
      "token"
    );

    /* =========================
       HEADERS
    ========================= */

    const headers = {

      "Content-Type":
      "application/json"

    };

    if(token){

      headers.Authorization =
      `Bearer ${token}`;

    }

    /* =========================
       FETCH
    ========================= */

    const response =
    await fetch(

      API_BASE_URL + endpoint,

      {

        method,

        headers,

        body:

        body
        ?

        JSON.stringify(body)
        :

        null

      }

    );

    /* =========================
       JSON
    ========================= */

    const data =
    await response.json();

    return data;

  }

  catch(error){

    console.log(error);

    return {

      success:false,

      message:
      "API connection failed"

    };

  }

}

/* =========================
   EXPORTS
========================= */

export default {

  get:(endpoint) =>

    apiRequest(endpoint),

  post:(endpoint,body) =>

    apiRequest(
      endpoint,
      "POST",
      body
    ),

  put:(endpoint,body) =>

    apiRequest(
      endpoint,
      "PUT",
      body
    ),

  delete:(endpoint) =>

    apiRequest(
      endpoint,
      "DELETE"
    )

};
