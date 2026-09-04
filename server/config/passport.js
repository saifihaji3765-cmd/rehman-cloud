require("dotenv").config();

const passport = require("passport");

const GoogleStrategy =
  require("passport-google-oauth20").Strategy;

const GitHubStrategy =
  require("passport-github2").Strategy;

const User =
  require("../models/userModel");

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

          /*
           * Google has verified
           * the account email.
           */
          user.isVerified =
            true;

          /*
           * Keep provider consistent
           * when Google is the linked
           * authentication provider.
           */
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
          profile.emails?.[0]?.value
            ?.trim()
            .toLowerCase();

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

          /*
           * GitHub authentication
           * supplied the verified
           * account identity.
           */
          user.isVerified =
            true;

          /*
           * Keep provider consistent.
           */
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
