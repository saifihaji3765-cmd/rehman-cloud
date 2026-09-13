"use strict";

/**
 * ZyrionOS Owner-Only Middleware
 *
 * Purpose:
 * - Protect highly sensitive financial/control endpoints.
 * - Allow access only to the configured ZyrionOS owner.
 * - Never trust a client-supplied ownerId as proof of ownership.
 * - Never expose secrets or authentication material.
 *
 * Expected authentication:
 * authMiddleware must run BEFORE this middleware.
 *
 * Supported owner configuration:
 *   OWNER_USER_ID
 *   FINANCIAL_OWNER_USER_ID
 *   ZYRIONOS_OWNER_USER_ID
 *
 * Optional phone-based ownership:
 *   WHATSAPP_OWNER_PHONE
 *
 * IMPORTANT:
 * For HTTP financial APIs, user-ID ownership is preferred.
 * WhatsApp phone ownership should be handled by the WhatsApp
 * owner-security layer rather than used as a replacement for
 * authenticated web identity.
 */

const crypto = require("crypto");

const OWNER_ID_ENV_NAMES = Object.freeze([
  "OWNER_USER_ID",
  "FINANCIAL_OWNER_USER_ID",
  "ZYRIONOS_OWNER_USER_ID"
]);

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeId(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  let normalized;

  if (typeof value === "string") {
    normalized = value.trim();
  } else if (
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    normalized = String(value);
  } else if (
    isObject(value) &&
    value._id !== undefined
  ) {
    return normalizeId(value._id);
  } else if (
    isObject(value) &&
    typeof value.toString === "function"
  ) {
    normalized = value.toString();
  }

  if (!normalized) {
    return null;
  }

  if (
    normalized === "[object Object]" ||
    normalized.length > 200
  ) {
    return null;
  }

  return normalized;
}

function getConfiguredOwnerId() {
  for (const envName of OWNER_ID_ENV_NAMES) {
    const value = normalizeId(
      process.env[envName]
    );

    if (value) {
      return value;
    }
  }

  return null;
}

function getAuthenticatedUserId(req) {
  if (!req || !isObject(req.user)) {
    return null;
  }

  return normalizeId(
    req.user._id ||
      req.user.id ||
      req.user.userId ||
      req.user.user_id
  );
}

/**
 * Constant-time comparison.
 *
 * IDs are not secrets, but constant-time comparison avoids
 * creating an unnecessary ordinary string-comparison oracle.
 */
function safeEqual(left, right) {
  const a = normalizeId(left);
  const b = normalizeId(right);

  if (!a || !b) {
    return false;
  }

  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
}

function getRequestIp(req) {
  if (!req) {
    return null;
  }

  const ip =
    req.ip ||
    req.socket?.remoteAddress ||
    null;

  if (typeof ip !== "string") {
    return null;
  }

  return ip.slice(0, 100);
}

function buildSecurityContext(req) {
  const userId =
    getAuthenticatedUserId(req);

  return {
    authenticated: Boolean(userId),
    userId: userId || null,
    method: req?.method || null,
    path:
      typeof req?.originalUrl === "string"
        ? req.originalUrl.slice(0, 500)
        : null,
    ip: getRequestIp(req)
  };
}

function deny(res, {
  status = 403,
  code = "OWNER_ACCESS_REQUIRED",
  message = "Owner authorization is required."
} = {}) {
  return res.status(status).json({
    success: false,
    status: "forbidden",
    error: {
      code,
      message
    }
  });
}

/**
 * Main middleware.
 */
function ownerOnlyMiddleware(req, res, next) {
  const ownerId =
    getConfiguredOwnerId();

  /*
   * Never allow financial control endpoints to become
   * accidentally public because the owner identity was not
   * configured.
   */
  if (!ownerId) {
    return deny(res, {
      status: 503,
      code: "OWNER_AUTH_NOT_CONFIGURED",
      message:
        "Owner authorization is not configured."
    });
  }

  const authenticatedUserId =
    getAuthenticatedUserId(req);

  /*
   * authMiddleware should normally catch this first, but this
   * middleware remains defensive in case route ordering changes.
   */
  if (!authenticatedUserId) {
    return deny(res, {
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      message:
        "Authentication is required."
    });
  }

  if (
    !safeEqual(
      authenticatedUserId,
      ownerId
    )
  ) {
    return deny(res, {
      status: 403,
      code: "OWNER_ACCESS_REQUIRED",
      message:
        "This financial control endpoint is owner-only."
    });
  }

  /*
   * Attach a minimal server-derived authorization context.
   *
   * Do not attach credentials, cookies, tokens, or secrets.
   */
  req.ownerAuthorization = Object.freeze({
    authorized: true,
    userId: authenticatedUserId,
    ownerId
  });

  return next();
}

/**
 * ---------------------------------------------------------
 * HELPER FUNCTIONS
 * ---------------------------------------------------------
 */

ownerOnlyMiddleware.isOwner = function isOwner(req) {
  const ownerId =
    getConfiguredOwnerId();

  const userId =
    getAuthenticatedUserId(req);

  if (!ownerId || !userId) {
    return false;
  }

  return safeEqual(
    userId,
    ownerId
  );
};

ownerOnlyMiddleware.getOwnerId =
  function getOwnerId() {
    return getConfiguredOwnerId();
  };

ownerOnlyMiddleware.getAuthenticatedUserId =
  function getAuthenticatedUserId(req) {
    return getAuthenticatedUserId(req);
  };

ownerOnlyMiddleware.buildSecurityContext =
  function buildSecurityContext(req) {
    return buildSecurityContext(req);
  };

ownerOnlyMiddleware.safeEqual =
  safeEqual;

/**
 * ---------------------------------------------------------
 * EXPRESS ERROR-SAFE WRAPPER
 * ---------------------------------------------------------
 *
 * Useful when the application wants an async-compatible
 * middleware reference.
 */
ownerOnlyMiddleware.requireOwner =
  function requireOwner(req, res, next) {
    try {
      return ownerOnlyMiddleware(
        req,
        res,
        next
      );
    } catch (error) {
      return res.status(500).json({
        success: false,
        status: "error",
        error: {
          code:
            typeof error?.code === "string"
              ? error.code.slice(0, 200)
              : "OWNER_AUTH_ERROR",
          message:
            typeof error?.message === "string"
              ? error.message.slice(0, 500)
              : "Owner authorization failed."
        }
      });
    }
  };

/**
 * ---------------------------------------------------------
 * CONFIGURATION STATUS
 * ---------------------------------------------------------
 *
 * This intentionally does not return the actual owner ID.
 */
ownerOnlyMiddleware.getStatus =
  function getStatus() {
    return {
      configured:
        Boolean(getConfiguredOwnerId()),
      authenticationRequired: true,
      ownerOnly: true,
      clientOwnerIdTrusted: false
    };
  };

module.exports = ownerOnlyMiddleware;
