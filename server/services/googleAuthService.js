require("dotenv").config();

const jwt = require("jsonwebtoken");

const {
  OAuth2Client
} = require("google-auth-library");

/* =========================================================
   GOOGLE CLIENT
========================================================= */

const client =
  new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID
  );

/* =========================================================
   GENERATE APPLICATION JWT
========================================================= */

function generateGoogleToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is missing"
    );
  }

  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

/* =========================================================
   VERIFY GOOGLE ID TOKEN
========================================================= */

async function verifyGoogleUser(token) {
  try {
    /* =========================
       TOKEN REQUIRED
    ========================= */

    if (!token) {
      throw new Error(
        "Google token required"
      );
    }

    /* =========================
       VERIFY TOKEN
    ========================= */

    const ticket =
      await client.verifyIdToken({
        idToken: token,

        audience:
          process.env.GOOGLE_CLIENT_ID
      });

    /* =========================
       GOOGLE PAYLOAD
    ========================= */

    const payload =
      ticket.getPayload();

    if (!payload) {
      throw new Error(
        "Google user data unavailable"
      );
    }

    /* =========================
       REQUIRED IDENTITY
    ========================= */

    if (!payload.sub) {
      throw new Error(
        "Google user ID unavailable"
      );
    }

    if (!payload.email) {
      throw new Error(
        "Google account email unavailable"
      );
    }

    /* =========================
       RETURN NORMALIZED USER
    ========================= */

    return {
      googleId:
        payload.sub,

      name:
        payload.name ||
        payload.given_name ||
        "Google User",

      email:
        payload.email
          .trim()
          .toLowerCase(),

      avatar:
        payload.picture || "",

      verified:
        payload.email_verified === true,

      provider:
        "google"
    };

  } catch (error) {

    console.error(
      "Google Verify Error:",
      error.message
    );

    throw new Error(
      "Invalid Google Token"
    );
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  generateGoogleToken,
  verifyGoogleUser
};
