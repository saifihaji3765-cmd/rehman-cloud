require("dotenv").config();

const passport = require("passport");
const axios = require("axios");

const GoogleStrategy =
  require("passport-google-oauth20").Strategy;

const GitHubStrategy =
  require("passport-github2").Strategy;

const User =
  require("../models/userModel");

/* =========================================================
   GITHUB EMAIL RESOLVER
========================================================= */

async function resolveGithubEmail(
  accessToken,
  profile
) {
  /* =======================================================
     1. PROFILE EMAILS
  ======================================================= */

  const profileEmails =
    Array.isArray(profile?.emails)
      ? profile.emails
      : [];

  const profileVerifiedEmail =
    profileEmails.find(
      (item) =>
        item?.value &&
        item?.verified === true
    )?.value;

  if (profileVerifiedEmail) {
    return profileVerifiedEmail
      .trim()
      .toLowerCase();
  }

  const profileAnyEmail =
    profileEmails.find(
      (item) =>
        typeof item?.value === "string" &&
        item.value.trim()
    )?.value;

  if (profileAnyEmail) {
    return profileAnyEmail
      .trim()
      .toLowerCase();
  }

  /* =======================================================
     2. DIRECT GITHUB EMAIL API
  ======================================================= */

  if (!accessToken) {
    throw new Error(
      "GitHub access token unavailable"
    );
  }

  try {
    const response =
      await axios.get(
        "https://api.github.com/user/emails",
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            Accept:
              "application/vnd.github+json",

            "X-GitHub-Api-Version":
              "2022-11-28"
          },

          timeout: 10000
        }
      );

    const emails =
      Array.isArray(response.data)
        ? response.data
        : [];

    /* =====================================================
       VERIFIED PRIMARY EMAIL
    ===================================================== */

    const primaryVerified =
      emails.find(
        (item) =>
          item?.primary === true &&
          item?.verified === true &&
          typeof item?.email === "string" &&
          item.email.trim()
      );

    if (primaryVerified?.email) {
      return primaryVerified.email
        .trim()
        .toLowerCase();
    }

    /* =====================================================
       ANY VERIFIED EMAIL
    ===================================================== */

    const verifiedEmail =
      emails.find(
        (item) =>
          item?.verified === true &&
          typeof item?.email === "string" &&
          item.email.trim()
      );

    if (verifiedEmail?.email) {
      return verifiedEmail.email
        .trim()
        .toLowerCase();
    }

    /* =====================================================
       PRIMARY EMAIL FALLBACK
    ===================================================== */

    const primaryEmail =
      emails.find(
        (item) =>
          item?.primary === true &&
          typeof item?.email === "string" &&
          item.email.trim()
      );

    if (primaryEmail?.email) {
      return primaryEmail.email
        .trim()
        .toLowerCase();
    }

    /* =====================================================
       ANY EMAIL FALLBACK
    ===================================================== */

    const anyEmail =
      emails.find(
        (item) =>
          typeof item?.email === "string" &&
          item.email.trim()
      );

    if (anyEmail?.email) {
      return anyEmail.email
        .trim()
        .toLowerCase();
    }

    throw new Error(
      "GitHub account email unavailable"
    );

  } catch (error) {

    if (
      error?.response?.status === 401
    ) {
      throw new Error(
        "GitHub access token is invalid or expired"
      );
    }

    if (
      error?.response?.status === 403
    ) {
      throw new Error(
        "GitHub email permission was denied"
      );
    }

    if (
      error?.response?.status
    ) {
      throw new Error(
        `GitHub email API failed with status ${error.response.status}`
      );
    }

    throw error;
  }
}

/* =========================================================
   GOOGLE STRATEGY
========================================================= */

passport.use(
  new GoogleStrategy(
    {
      clientID:
        process.env.GOOGLE_CLIENT_ID,

      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET,

      callbackURL:
        process.env.GOOGLE_CALLBACK_URL
    },

    async (
      accessToken,
      refreshToken,
      profile,
      done
    ) => {
      try {

        /* =========================
           GOOGLE EMAIL
        ========================= */

        const email =
          profile.emails?.[0]?.value
            ?.trim()
            .toLowerCase();

        if (!email) {
          return done(
            new Error(
              "Google account email unavailable"
            ),
            null
          );
        }

        /* =========================
           GOOGLE USER DATA
        ========================= */

        const name =
          profile.displayName ||
          profile.name?.givenName ||
          "Google User";

        const avatar =
          profile.photos?.[0]?.value ||
          "";

        /* =========================
           FIND EXISTING USER
        ========================= */

        let user =
          await User.findOne({
            email
          });

        /* =========================
           CREATE USER
        ========================= */

        if (!user) {

          user =
            await User.create({

              name,

              email,

              avatar,

              googleId:
                profile.id,

              provider:
                "google",

              isVerified:
                true

            });

        }

        /* =========================
           LINK EXISTING USER
        ========================= */

        else {

          if (!user.googleId) {
            user.googleId =
              profile.id;
          }

          if (
            !user.avatar &&
            avatar
          ) {
            user.avatar =
              avatar;
          }

          user.isVerified =
            true;

          if (
            user.provider !== "google"
          ) {
            user.provider =
              "google";
          }
        }

        /* =========================
           UPDATE LAST LOGIN
        ========================= */

        user.lastLogin =
          new Date();

        await user.save();

        /* =========================
           PASSPORT USER
        ========================= */

        return done(
          null,
          user
        );

      } catch (error) {

        console.error(
          "Google Passport Error:",
          error
        );

        return done(
          error,
          null
        );
      }
    }
  )
);

/* =========================================================
   GITHUB STRATEGY
========================================================= */

passport.use(
  new GitHubStrategy(
    {
      clientID:
        process.env.GITHUB_CLIENT_ID,

      clientSecret:
        process.env.GITHUB_CLIENT_SECRET,

      callbackURL:
        process.env.GITHUB_CALLBACK_URL
    },

    async (
      accessToken,
      refreshToken,
      profile,
      done
    ) => {
      try {

        /* =========================
           GITHUB EMAIL
        ========================= */

        const email =
          await resolveGithubEmail(
            accessToken,
            profile
          );

        if (!email) {
          return done(
            new Error(
              "GitHub account email unavailable"
            ),
            null
          );
        }

        /* =========================
           GITHUB USER DATA
        ========================= */

        const name =
          profile.displayName ||
          profile.username ||
          "GitHub User";

        const avatar =
          profile.photos?.[0]?.value ||
          "";

        /* =========================
           FIND EXISTING USER
        ========================= */

        let user =
          await User.findOne({
            email
          });

        /* =========================
           CREATE USER
        ========================= */

        if (!user) {

          user =
            await User.create({

              name,

              email,

              avatar,

              githubId:
                profile.id,

              provider:
                "github",

              isVerified:
                true

            });

        }

        /* =========================
           LINK EXISTING USER
        ========================= */

        else {

          if (!user.githubId) {
            user.githubId =
              profile.id;
          }

          if (
            !user.avatar &&
            avatar
          ) {
            user.avatar =
              avatar;
          }

          user.isVerified =
            true;

          if (
            user.provider !== "github"
          ) {
            user.provider =
              "github";
          }
        }

        /* =========================
           UPDATE LAST LOGIN
        ========================= */

        user.lastLogin =
          new Date();

        await user.save();

        /* =========================
           PASSPORT USER
        ========================= */

        return done(
          null,
          user
        );

      } catch (error) {

        console.error(
          "GitHub Passport Error:",
          error?.message ||
          error
        );

        return done(
          error,
          null
        );
      }
    }
  )
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = passport;
