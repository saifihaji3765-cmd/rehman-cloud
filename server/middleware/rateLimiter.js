const rateLimit =
require("express-rate-limit");

/* =========================
DEFAULT API LIMITER
========================= */

const apiLimiter =

rateLimit({

windowMs:
15 * 60 * 1000,

max:100,

standardHeaders:true,

legacyHeaders:false,

message:{

success:false,

message:
"Too many API requests"

}

});

/* =========================
AUTH LIMITER
========================= */

const authLimiter =

rateLimit({

windowMs:
15 * 60 * 1000,

max:10,

standardHeaders:true,

legacyHeaders:false,

message:{

success:false,

message:
"Too many login attempts"

}

});

/* =========================
AI LIMITER
========================= */

const aiLimiter =

rateLimit({

windowMs:
60 * 1000,

max:20,

standardHeaders:true,

legacyHeaders:false,

message:{

success:false,

message:
"AI request limit reached"

}

});

/* =========================
DEPLOY LIMITER
========================= */

const deployLimiter =

rateLimit({

windowMs:
60 * 60 * 1000,

max:5,

standardHeaders:true,

legacyHeaders:false,

message:{

success:false,

message:
"Deployment limit reached"

}

});

/* =========================
EXPORTS
========================= */

module.exports = {

apiLimiter,

authLimiter,

aiLimiter,

deployLimiter

};
