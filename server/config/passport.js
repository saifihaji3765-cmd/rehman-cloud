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
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "ZyrionOS",
  };
}

/* =========================================================
   GITHUB EMAIL RESOLVER
========================================================= */

async function resolveGithubEmail(accessToken, profile) {
  try {
    const profileEmails = Array.isArray(profile?.emails)
      ? profile.emails
      : [];

    const primaryProfileEmail = profileEmails.find(
      (item) =>
        item &&
        item.primary === true &&
        item.verified === true &&
        item.value
    );

    if (primaryProfileEmail?.value) {
      return normalizeEmail(primaryProfileEmail.value);
    }

    const verifiedProfileEmail = profileEmails.find(
      (item) =>
        item &&
        item.verified === true &&
        item.value
    );

    if (verifiedProfileEmail?.value) {
      return normalizeEmail(verifiedProfileEmail.value);
    }

    const anyProfileEmail = profileEmails.find(
      (item) => item && item.value
    );

    if (anyProfileEmail?.value) {
      return normalizeEmail(anyProfileEmail.value);
    }

    /* -------------------------------------------------------
       FALLBACK: GitHub API
    ------------------------------------------------------- */

    const response = await axios.get(
      `${GITHUB_API_BASE_URL}/user/emails`,
      {
        headers: getGithubHeaders(accessToken),
        timeout: 10000,
      }
    );

    const emails = Array.isArray(response.data)
      ? response.data
      : [];

    const primaryVerified = emails.find(
      (item) =>
        item &&
        item.primary === true &&
        item.verified === true &&
        item.email
    );

    if (primaryVerified?.email) {
      return normalizeEmail(primaryVerified.email);
    }

    const verified = emails.find(
      (item) =>
        item &&
        item.verified === true &&
        item.email
    );

    if (verified?.email) {
      return normalizeEmail(verified.email);
    }

    const primary = emails.find(
      (item) =>
        item &&
        item.primary === true &&
        item.email
    );

    if (primary?.email) {
      return normalizeEmail(primary.email);
    }

    const anyEmail = emails.find(
      (item) =>
        item &&
        item.email
    );

    if (anyEmail?.email) {
      return normalizeEmail(anyEmail.email);
    }

    return "";
  } catch (error) {
    console.error(
      "GitHub email resolution failed:",
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
          const email =
            normalizeEmail(
              profile?.emails?.[0]?.value
            );

          if (!email) {
            return done(
              null,
              false,
              {
                message:
                  "Google account email unavailable",
              }
            );
          }

          let user =
            await User.findOne({
              email,
            });

          /* ---------------------------------------------------
             CREATE USER
          --------------------------------------------------- */

          if (!user) {
            user = await User.create({
              name:
                profile.displayName ||
                profile.name?.givenName ||
                "Google User",

              email,

              googleId:
                profile.id,

              provider:
                "google",

              avatar:
                profile.photos?.[0]?.value ||
                null,

              isVerified:
                true,

              lastLogin:
                new Date(),
            });
          }

          /* ---------------------------------------------------
             UPDATE EXISTING USER
          --------------------------------------------------- */

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
              profile.photos?.[0]?.value
            ) {
              user.avatar =
                profile.photos[0].value;

              changed = true;
            }

            if (
              user.isVerified !== true
            ) {
              user.isVerified = true;
              changed = true;
            }

            user.lastLogin =
              new Date();

            changed = true;

            if (changed) {
              await user.save();
            }
          }

          return done(null, user);
        } catch (error) {
          console.error(
            "Google Passport error:",
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
          const githubId =
            profile?.id
              ? String(profile.id)
              : "";

          if (!githubId) {
            return done(
              null,
              false,
              {
                message:
                  "GitHub account ID unavailable",
              }
            );
          }

          const email =
            await resolveGithubEmail(
              accessToken,
              profile
            );

          if (!email) {
            return done(
              null,
              false,
              {
                message:
                  "GitHub account email unavailable",
              }
            );
          }

          const githubName =
            profile.displayName ||
            profile.username ||
            profile._json?.name ||
            "GitHub User";

          const githubAvatar =
            profile.photos?.[0]?.value ||
            profile._json?.avatar_url ||
            null;

          const scopes = [
            "user:email",
          ];

          /* ===================================================
             DETERMINE AUTH MODE
             
             req.user exists when the user started OAuth while
             already logged into ZyrionOS.
          =================================================== */

          const existingAuthUser =
            req?.user &&
            (
              req.user.id ||
              req.user._id
            )
              ? req.user
              : null;

          /* ===================================================
             CONNECT MODE
             
             Existing ZyrionOS user is connecting GitHub.
          =================================================== */

          if (existingAuthUser) {
            const zyrionUserId =
              String(
                existingAuthUser.id ||
                existingAuthUser._id
              );

            /* -------------------------------------------------
               VERIFY THAT GITHUB ACCOUNT IS NOT ALREADY
               LINKED TO ANOTHER ZYRIONOS USER
            ------------------------------------------------- */

            const githubLinkedUser =
              await User.findOne({
                githubId,
              });

            if (
              githubLinkedUser &&
              String(
                githubLinkedUser._id
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

            /* -------------------------------------------------
               LINK GITHUB ACCOUNT
            ------------------------------------------------- */

            user.githubId =
              githubId;

            if (
              !user.avatar &&
              githubAvatar
            ) {
              user.avatar =
                githubAvatar;
            }

            /*
             * Do NOT replace the user's existing provider.
             * A user who registered with email/Google should
             * continue retaining that primary login method.
             */

            await user.save();

            /* -------------------------------------------------
               SERVER-SIDE OAUTH DATA
               
               This never goes into URL/frontend response.
            ------------------------------------------------- */

            req.githubOAuth = {
              connectionMode:
                true,

              accessToken,

              refreshToken:
                refreshToken || null,

              scopes,

              githubUser: {
                githubId,
                username:
                  profile.username ||
                  null,

                name:
                  githubName,

                email,

                avatar:
                  githubAvatar,

                profileUrl:
                  profile.profileUrl ||
                  `https://github.com/${profile.username || ""}`,
              },
            };

            return done(
              null,
              user
            );
          }

          /* ===================================================
             NORMAL GITHUB LOGIN MODE
          =================================================== */

          let user =
            await User.findOne({
              email,
            });

          /* ---------------------------------------------------
             CREATE USER
          --------------------------------------------------- */

          if (!user) {
            user = await User.create({
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

          /* ---------------------------------------------------
             EXISTING USER
          --------------------------------------------------- */

          else {
            if (
              user.githubId &&
              String(user.githubId) !==
                githubId
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
              user.isVerified !== true
            ) {
              user.isVerified =
                true;
            }

            user.lastLogin =
              new Date();

            /*
             * Keep the original provider.
             * This avoids breaking email/password login.
             */

            await user.save();
          }

          return done(
            null,
            user
          );
        } catch (error) {
          console.error(
            "GitHub Passport error:",
            error?.response?.data ||
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
} else {
  console.warn(
    "[Passport] GitHub OAuth is not configured."
  );
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = passport;
