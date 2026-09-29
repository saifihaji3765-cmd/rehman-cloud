require("dotenv").config();

const passport = require("passport");
const axios = require("axios");

const {
  Strategy: GoogleStrategy,
} = require("passport-google-oauth20");

const {
  Strategy: GitHubStrategy,
} = require("passport-github2");

const User = require("../models/userModel");

/* =========================================================
   CONFIG
========================================================= */

const GITHUB_API_BASE_URL =
  process.env.GITHUB_API_BASE_URL ||
  "https://api.github.com";

const GITHUB_API_VERSION =
  process.env.GITHUB_API_VERSION ||
  "2022-11-28";

/* =========================================================
   HELPERS
========================================================= */

function normalizeEmail(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function getGithubHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version":
      GITHUB_API_VERSION,
    "User-Agent": "ZyrionOS",
  };
}

/* =========================================================
   GITHUB EMAIL RESOLVER
========================================================= */

async function resolveGithubEmail(
  accessToken,
  profile
) {
  try {
    const profileEmails =
      Array.isArray(profile?.emails)
        ? profile.emails
        : [];

    /* -------------------------------------------------------
       PRIMARY + VERIFIED PROFILE EMAIL
    ------------------------------------------------------- */

    const primaryVerified =
      profileEmails.find(
        (item) =>
          item &&
          item.primary === true &&
          item.verified === true &&
          item.value
      );

    if (primaryVerified?.value) {
      return normalizeEmail(
        primaryVerified.value
      );
    }

    /* -------------------------------------------------------
       ANY VERIFIED PROFILE EMAIL
    ------------------------------------------------------- */

    const verified =
      profileEmails.find(
        (item) =>
          item &&
          item.verified === true &&
          item.value
      );

    if (verified?.value) {
      return normalizeEmail(
        verified.value
      );
    }

    /* -------------------------------------------------------
       ANY PROFILE EMAIL
    ------------------------------------------------------- */

    const anyProfileEmail =
      profileEmails.find(
        (item) =>
          item &&
          item.value
      );

    if (anyProfileEmail?.value) {
      return normalizeEmail(
        anyProfileEmail.value
      );
    }

    /* -------------------------------------------------------
       FALLBACK: GITHUB API
    ------------------------------------------------------- */

    if (!accessToken) {
      return "";
    }

    const response =
      await axios.get(
        `${GITHUB_API_BASE_URL}/user/emails`,
        {
          headers:
            getGithubHeaders(
              accessToken
            ),
          timeout: 10000,
        }
      );

    const emails =
      Array.isArray(response.data)
        ? response.data
        : [];

    /* -------------------------------------------------------
       PRIMARY + VERIFIED API EMAIL
    ------------------------------------------------------- */

    const apiPrimaryVerified =
      emails.find(
        (item) =>
          item &&
          item.primary === true &&
          item.verified === true &&
          item.email
      );

    if (apiPrimaryVerified?.email) {
      return normalizeEmail(
        apiPrimaryVerified.email
      );
    }

    /* -------------------------------------------------------
       VERIFIED API EMAIL
    ------------------------------------------------------- */

    const apiVerified =
      emails.find(
        (item) =>
          item &&
          item.verified === true &&
          item.email
      );

    if (apiVerified?.email) {
      return normalizeEmail(
        apiVerified.email
      );
    }

    /* -------------------------------------------------------
       PRIMARY API EMAIL
    ------------------------------------------------------- */

    const apiPrimary =
      emails.find(
        (item) =>
          item &&
          item.primary === true &&
          item.email
      );

    if (apiPrimary?.email) {
      return normalizeEmail(
        apiPrimary.email
      );
    }

    /* -------------------------------------------------------
       ANY API EMAIL
    ------------------------------------------------------- */

    const apiAny =
      emails.find(
        (item) =>
          item &&
          item.email
      );

    if (apiAny?.email) {
      return normalizeEmail(
        apiAny.email
      );
    }

    return "";
  } catch (error) {
    console.error(
      "[GitHub] Email resolution failed:",
      error?.response?.data ||
        error?.message ||
        error
    );

    return "";
  }
}

/* =========================================================
   GOOGLE STRATEGY
========================================================= */

if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
) {
  passport.use(
    new GoogleStrategy(
      {
        clientID:
          process.env.GOOGLE_CLIENT_ID,

        clientSecret:
          process.env.GOOGLE_CLIENT_SECRET,

        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          "https://api.zyrionos.com/api/auth/google/callback",
      },

      async (
        accessToken,
        refreshToken,
        profile,
        done
      ) => {
        try {
          /* -------------------------------------------------
             EMAIL
          ------------------------------------------------- */

          const email =
            normalizeEmail(
              profile?.emails?.[0]?.value
            );

          if (!email) {
            console.error(
              "[Google] No email returned by Google"
            );

            return done(
              null,
              false,
              {
                message:
                  "Google account email unavailable",
              }
            );
          }

          /* -------------------------------------------------
             USER DATA
          ------------------------------------------------- */

          const name =
            profile?.displayName ||
            profile?.name?.givenName ||
            "Google User";

          const avatar =
            profile?.photos?.[0]?.value ||
            null;

          /* -------------------------------------------------
             FIND USER
          ------------------------------------------------- */

          let user =
            await User.findOne({
              email,
            });

          /* -------------------------------------------------
             CREATE USER
          ------------------------------------------------- */

          if (!user) {
            user =
              await User.create({
                name,
                email,
                googleId:
                  profile.id,
                provider:
                  "google",
                avatar,
                isVerified:
                  true,
                lastLogin:
                  new Date(),
              });
          }

          /* -------------------------------------------------
             EXISTING USER
          ------------------------------------------------- */

          else {
            let changed = false;

            if (
              !user.googleId ||
              String(user.googleId) !==
                String(profile.id)
            ) {
              user.googleId =
                profile.id;

              changed = true;
            }

            if (
              !user.avatar &&
              avatar
            ) {
              user.avatar =
                avatar;

              changed = true;
            }

            if (
              user.isVerified !== true
            ) {
              user.isVerified =
                true;

              changed = true;
            }

            user.lastLogin =
              new Date();

            changed = true;

            /*
             * Do not overwrite the user's existing
             * primary provider. A user can have
             * email/Google/GitHub linked.
             */

            if (changed) {
              await user.save();
            }
          }

          /* -------------------------------------------------
             SUCCESS
          ------------------------------------------------- */

          return done(
            null,
            user
          );
        } catch (error) {
          console.error(
            "[Google] Passport strategy error:",
            error?.stack ||
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

  console.log(
    "[Passport] Google OAuth strategy registered"
  );
} else {
  console.warn(
    "[Passport] Google OAuth is not configured."
  );
}

/* =========================================================
   GITHUB STRATEGY
========================================================= */

if (
  process.env.GITHUB_CLIENT_ID &&
  process.env.GITHUB_CLIENT_SECRET
) {
  passport.use(
    new GitHubStrategy(
      {
        clientID:
          process.env.GITHUB_CLIENT_ID,

        clientSecret:
          process.env.GITHUB_CLIENT_SECRET,

        callbackURL:
          process.env.GITHUB_CALLBACK_URL ||
          "https://api.zyrionos.com/api/auth/github/callback",

        /*
         * We need req so connect mode can explicitly
         * identify the currently authenticated
         * ZyrionOS user.
         */
        passReqToCallback:
          true,
      },

      async (
        req,
        accessToken,
        refreshToken,
        profile,
        done
      ) => {
        try {
          /* -------------------------------------------------
             GITHUB ID
          ------------------------------------------------- */

          const githubId =
            profile?.id
              ? String(profile.id)
              : "";

          if (!githubId) {
            console.error(
              "[GitHub] GitHub user ID unavailable"
            );

            return done(
              null,
              false,
              {
                message:
                  "GitHub account ID unavailable",
              }
            );
          }

          /* -------------------------------------------------
             EMAIL
          ------------------------------------------------- */

          const email =
            await resolveGithubEmail(
              accessToken,
              profile
            );

          if (!email) {
            console.error(
              "[GitHub] GitHub email unavailable"
            );

            return done(
              null,
              false,
              {
                message:
                  "GitHub account email unavailable",
              }
            );
          }

          /* -------------------------------------------------
             GITHUB PROFILE
          ------------------------------------------------- */

          const githubName =
            profile?.displayName ||
            profile?.username ||
            profile?._json?.name ||
            "GitHub User";

          const githubAvatar =
            profile?.photos?.[0]?.value ||
            profile?._json?.avatar_url ||
            null;

          const profileUrl =
            profile?.profileUrl ||
            (
              profile?.username
                ? `https://github.com/${profile.username}`
                : null
            );

          const scopes = [
            "user:email",
          ];

          /* =================================================
             IMPORTANT:
             AUTH MODE COMES FROM VERIFIED STATE
          ================================================= */

          const connectionMode =
            req?.githubOAuthMode ===
            "connect";

          /* =================================================
             CONNECT MODE
          ================================================= */

          if (connectionMode) {
            /* -----------------------------------------------
               CURRENT ZYRIONOS USER
            ----------------------------------------------- */

            const currentUserId =
              req?.user?.id ||
              req?.user?._id;

            if (!currentUserId) {
              console.error(
                "[GitHub] Connect mode but ZyrionOS user is missing"
              );

              return done(
                null,
                false,
                {
                  message:
                    "ZyrionOS user authentication required",
                }
              );
            }

            const zyrionUserId =
              String(
                currentUserId
              );

            /* -----------------------------------------------
               CHECK GITHUB ACCOUNT OWNERSHIP
            ----------------------------------------------- */

            const linkedUser =
              await User.findOne({
                githubId,
              });

            if (
              linkedUser &&
              String(
                linkedUser._id
              ) !== zyrionUserId
            ) {
              return done(
                null,
                false,
                {
                  message:
                    "This GitHub account is already connected to another ZyrionOS account",
                }
              );
            }

            /* -----------------------------------------------
               LOAD CURRENT USER
            ----------------------------------------------- */

            const user =
              await User.findById(
                zyrionUserId
              );

            if (!user) {
              return done(
                null,
                false,
                {
                  message:
                    "ZyrionOS user not found",
                }
              );
            }

            /* -----------------------------------------------
               LINK GITHUB ID
            ----------------------------------------------- */

            user.githubId =
              githubId;

            if (
              !user.avatar &&
              githubAvatar
            ) {
              user.avatar =
                githubAvatar;
            }

            await user.save();

            /* -----------------------------------------------
               SERVER-SIDE OAUTH HANDOFF

               IMPORTANT:
               Access token is NEVER put into the URL.
            ----------------------------------------------- */

            req.githubOAuth = {
              connectionMode:
                true,

              accessToken,

              refreshToken:
                refreshToken ||
                null,

              scopes,

              githubUser: {
                githubId,

                username:
                  profile?.username ||
                  null,

                name:
                  githubName,

                email,

                avatar:
                  githubAvatar,

                profileUrl,
              },
            };

            /*
             * Keep a clear internal marker.
             */
            req.githubOAuthMode =
              "connect";

            return done(
              null,
              user
            );
          }

          /* =================================================
             NORMAL GITHUB LOGIN
          ================================================= */

          let user =
            await User.findOne({
              email,
            });

          /* -------------------------------------------------
             CREATE USER
          ------------------------------------------------- */

          if (!user) {
            user =
              await User.create({
                name:
                  githubName,

                email,

                githubId,

                provider:
                  "github",

                avatar:
                  githubAvatar,

                isVerified:
                  true,

                lastLogin:
                  new Date(),
              });
          }

          /* -------------------------------------------------
             EXISTING USER
          ------------------------------------------------- */

          else {
            if (
              user.githubId &&
              String(
                user.githubId
              ) !== githubId
            ) {
              return done(
                null,
                false,
                {
                  message:
                    "This email is already linked to another GitHub account",
                }
              );
            }

            user.githubId =
              githubId;

            if (
              !user.avatar &&
              githubAvatar
            ) {
              user.avatar =
                githubAvatar;
            }

            if (
              user.isVerified !==
              true
            ) {
              user.isVerified =
                true;
            }

            user.lastLogin =
              new Date();

            /*
             * Preserve the original provider.
             */
            await user.save();
          }

          /* -------------------------------------------------
             NORMAL LOGIN DOES NOT NEED TO CREATE A
             GITHUB CONNECTION RECORD.
          ------------------------------------------------- */

          return done(
            null,
            user
          );
        } catch (error) {
          console.error(
            "[GitHub] Passport strategy error:",
            error?.response?.data ||
              error?.stack ||
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

  console.log(
    "[Passport] GitHub OAuth strategy registered"
  );
} else {
  console.warn(
    "[Passport] GitHub OAuth is not configured."
  );
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = passport;
