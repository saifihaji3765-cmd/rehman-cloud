const rateLimit =
require("express-rate-limit");

/* =========================
   RATE LIMITER
========================= */

const rateLimiter =

rateLimit({

  windowMs:
  15 * 60 * 1000,

  max:100,

  message:{

    success:false,

    message:
    "Too many requests. Please try again later."

  },

  standardHeaders:true,

  legacyHeaders:false

});

/* =========================
   EXPORT
========================= */

module.exports =
rateLimiter;
