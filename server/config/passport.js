require("dotenv").config();

const passport = require("passport");
const GoogleStrategy =
  require("passport-google-oauth20").Strategy;
const GitHubStrategy =
  require("passport-github2").Strategy;

const User = require("../models/userModel");

/* =========================================================
   GOOGLE STRATEGY
========================================================= */

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL
    },

    async (
      accessToken,
      refreshToken,
      profile,
      done
    ) => {
      try {
        const email =
          profile.emails?.[0]?.value?.toLowerCase();

        if (!email) {
          return done(
            new Error("Google account email unavailable"),
            null
          );
        }

        const name =
          profile.displayName ||
          profile.name?.givenName ||
          "Google User";

        const avatar =
          profile.photos?.[0]?.value || "";

        let user = await User.findOne({ email });

        /* =================================================
           CREATE USER
        ================================================= */

        if (!user) {
          user = await User.create({
            name,
            email,
            avatar,
            googleId: profile.id,
            provider: "google",
            isVerified: true
          });
        } else {
          /* ===============================================
             LINK GOOGLE ACCOUNT
          =============================================== */

          if (!user.googleId) {
            user.googleId = profile.id;
          }

          if (!user.avatar && avatar) {
            user.avatar = avatar;
          }

          user.isVerified = true;
        }

        /* =================================================
           UPDATE LOGIN
        ================================================= */

        user.lastLogin = new Date();

        await user.save();

        return done(null, user);
      } catch (error) {
        console.error(
          "Google Passport Error:",
          error
        );

        return done(error, null);
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
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL
    },

    async (
      accessToken,
      refreshToken,
      profile,
      done
    ) => {
      try {
        const email =
          profile.emails?.[0]?.value?.toLowerCase();

        /* =================================================
           REAL EMAIL REQUIRED
        ================================================= */

        if (!email) {
          return done(
            new Error(
              "GitHub account email unavailable"
            ),
            null
          );
        }

        const name =
          profile.displayName ||
          profile.username ||
          "GitHub User";

        const avatar =
          profile.photos?.[0]?.value || "";

        let user = await User.findOne({ email });

        /* =================================================
           CREATE USER
        ================================================= */

        if (!user) {
          user = await User.create({
            name,
            email,
            avatar,
            githubId: profile.id,
            provider: "github",
            isVerified: true
          });
        } else {
          /* ===============================================
             LINK GITHUB ACCOUNT
          =============================================== */

          if (!user.githubId) {
            user.githubId = profile.id;
          }

          if (!user.avatar && avatar) {
            user.avatar = avatar;
          }

          user.isVerified = true;
        }

        /* =================================================
           UPDATE LOGIN
        ================================================= */

        user.lastLogin = new Date();

        await user.save();

        return done(null, user);
      } catch (error) {
        console.error(
          "GitHub Passport Error:",
          error
        );

        return done(error, null);
      }
    }
  )
);

/* =========================================================
   SESSION SERIALIZATION
========================================================= */

passport.serializeUser(
  (user, done) => {
    done(null, user.id);
  }
);

/* =========================================================
   SESSION DESERIALIZATION
========================================================= */

passport.deserializeUser(
  async (id, done) => {
    try {
      const user =
        await User.findById(id);

      if (!user) {
        return done(
          new Error("User not found"),
          null
        );
      }

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = passport;
