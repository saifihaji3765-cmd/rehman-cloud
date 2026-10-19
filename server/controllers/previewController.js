"use strict";

/**
 * =========================================================
 * ZYRION OS — ENTERPRISE PREVIEW CONTROLLER
 * Version: 1.1.0
 * =========================================================
 *
 * Responsibilities:
 * - Validate authenticated user and project access
 * - Validate authoritative build identity
 * - Delegate preview lifecycle operations to previewService
 * - Return sanitized API responses
 * - Handle active preview, individual preview and health
 * - Stop and expire previews
 * - Prevent cross-project and cross-user access
 *
 * Compatibility:
 * - server/routes/previewRoutes.js
 * - server/services/previewService.js v5.x
 * - projectModel.js
 * - projectPreviewModel.js
 *
 * This controller never builds source code or executes
 * project code directly.
 * =========================================================
 */

const mongoose = require("mongoose");

const Project = require("../models/projectModel");
const formatResponse = require("../utils/formatResponse");
const previewService = require("../services/previewService");

/* =========================================================
   CONSTANTS
   ========================================================= */

const SERVICE_NAME = "previewController";
const CONTROLLER_VERSION = "1.1.0";

const MAX_BUILD_ID_LENGTH = 300;
const MAX_PREVIEW_ID_LENGTH = 300;
const MAX_PROJECT_ID_LENGTH = 200;

/*
 * Never expose these fields in API responses.
 * Filtering is recursive to protect nested objects too.
 */
const PRIVATE_FIELDS = new Set([
  "containerId",
  "containerName",
  "workerId",
  "queueName",
  "workingDirectory",
  "runtimeWorkspace",
  "storageKey",
  "artifactStorageKey",
  "artifactPath",
  "hostPort",
  "internalPort",
  "environment",
  "env",
  "secrets",
  "credentials",
  "accessKey",
  "secretAccessKey",
  "authorization",
  "password",
  "token"
]);

/* =========================================================
   AUTHENTICATED USER
   ========================================================= */

function getUserId(req) {
  const userId = req?.user?.id || req?.user?._id;

  if (!userId) {
    return null;
  }

  return String(userId).trim() || null;
}

/* =========================================================
   VALIDATION HELPERS
   ========================================================= */

function isValidObjectId(value) {
  if (value === null || value === undefined) {
    return false;
  }

  return mongoose.Types.ObjectId.isValid(String(value));
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

function validateBuildId(buildId) {
  const value = cleanString(
    buildId,
    MAX_BUILD_ID_LENGTH
  );

  if (!value) {
    return {
      valid: false,
      message: "Authoritative build ID is required"
    };
  }

  if (
    /[\/\\\0]/.test(value) ||
    value.includes("..") ||
    /[\r\n\t]/.test(value)
  ) {
    return {
      valid: false,
      message: "Invalid build ID"
    };
  }

  return {
    valid: true,
    value
  };
}

function validatePreviewId(previewId) {
  const value = cleanString(
    previewId,
    MAX_PREVIEW_ID_LENGTH
  );

  if (!value) {
    return {
      valid: false,
      message: "Preview ID is required"
    };
  }

  if (
    /[\/\\\0]/.test(value) ||
    value.includes("..") ||
    /[\r\n\t]/.test(value)
  ) {
    return {
      valid: false,
      message: "Invalid preview ID"
    };
  }

  return {
    valid: true,
    value
  };
}

/* =========================================================
   RESPONSE SANITIZATION
   ========================================================= */

function sanitizeString(value) {
  return value
    .replace(
      /\/(?:home|root|tmp|workspace|app|var|mnt)\/[^\s"'`]*/gi,
      "[internal-path]"
    )
    .replace(
      /(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL)=\S+/gi,
      "[secret-redacted]"
    )
    .slice(0, 10000);
}

function sanitizeValue(value, depth = 0) {
  if (depth > 5) {
    return undefined;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const result = {};

    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_FIELDS.has(key)) {
        continue;
      }

      const sanitized = sanitizeValue(
        item,
        depth + 1
      );

      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }

    return result;
  }

  return undefined;
}

function serializePreview(preview) {
  if (!preview) {
    return null;
  }

  let source;

  if (typeof preview.toObject === "function") {
    source = preview.toObject({
      depopulate: true,
      getters: false,
      virtuals: false
    });
  } else {
    source = { ...preview };
  }

  /*
   * The service already sanitizes its preview result.
   * This second layer protects controller responses when
   * a Mongoose document or a different object is returned.
   */
  return sanitizeValue(source);
}

/* =========================================================
   STANDARD API RESPONSES
   ========================================================= */

function sendError(
  res,
  status,
  message,
  details = undefined
) {
  const payload = {
    success: false,
    message
  };

  if (
    details &&
    typeof details === "object"
  ) {
    const safeDetails = sanitizeErrorDetails(details);

    if (Object.keys(safeDetails).length > 0) {
      payload.error = safeDetails;
    }
  }

  return res
    .status(status)
    .json(formatResponse(payload));
}

function sanitizeErrorDetails(details = {}) {
  const allowedFields = [
    "code",
    "category",
    "stage",
    "status",
    "errors",
    "warnings",
    "summary",
    "buildId",
    "previewId",
    "sourceHash",
    "authoritative",
    "validationMode"
  ];

  const safe = {};

  for (const field of allowedFields) {
    if (details[field] !== undefined) {
      safe[field] = sanitizeValue(details[field]);
    }
  }

  return safe;
}

/* =========================================================
   PROJECT ACCESS
   ========================================================= */

/**
 * Access policy aligned with previewService.validateProjectAccess:
 * - Project owner is allowed.
 * - An active project member is allowed.
 * - Suspended members are denied.
 * - Archived projects are denied.
 *
 * The service still performs its own access validation.
 */
async function getOwnedProject(projectId, userId) {
  if (
    !isValidObjectId(projectId) ||
    !isValidObjectId(userId)
  ) {
    return null;
  }

  const project = await Project.findOne({
    _id: projectId,
    isArchived: false
  });

  if (!project) {
    return null;
  }

  const authenticatedId = String(userId);
  const ownerId = String(
    project.userId || project.ownerId || ""
  );

  if (ownerId === authenticatedId) {
    return project;
  }

  const members = Array.isArray(project.members)
    ? project.members
    : [];

  const isActiveMember = members.some((member) => {
    const memberId = String(
      member?.userId || member?.user || ""
    );

    return (
      memberId === authenticatedId &&
      member?.status !== "suspended"
    );
  });

  return isActiveMember ? project : null;
}

async function validateProjectAccess(projectId, userId) {
  if (!projectId) {
    return {
      valid: false,
      status: 400,
      message: "Project ID is required"
    };
  }

  if (!isValidObjectId(projectId)) {
    return {
      valid: false,
      status: 400,
      message: "Invalid project ID"
    };
  }

  if (!isValidObjectId(userId)) {
    return {
      valid: false,
      status: 401,
      message: "Authentication required"
    };
  }

  const project = await getOwnedProject(
    projectId,
    userId
  );

  if (!project) {
    return {
      valid: false,
      status: 404,
      message: "Project not found"
    };
  }

  return {
    valid: true,
    project
  };
}

/* =========================================================
   ERROR → HTTP STATUS MAPPING
   ========================================================= */

function mapPreviewError(error) {
  const code = String(
    error?.code || error?.name || ""
  ).toUpperCase();

  const message = String(
    error?.message || ""
  );

  if (
    code === "PROJECT_NOT_FOUND" ||
    /project not found/i.test(message)
  ) {
    return {
      status: 404,
      message: "Project not found"
    };
  }

  if (
    code === "BUILD_NOT_FOUND" ||
    /build.*not found/i.test(message)
  ) {
    return {
      status: 404,
      message: "Authoritative build not found"
    };
  }

  if (
    code === "BUILD_NOT_SUCCESSFUL" ||
    /build.*successful/i.test(message)
  ) {
    return {
      status: 409,
      message: "Authoritative build is not successful"
    };
  }

  if (code === "ARTIFACT_NOT_FOUND") {
    return {
      status: 409,
      message: "Build artifact is unavailable"
    };
  }

  if (code === "ARTIFACT_INVALID") {
    return {
      status: 422,
      message: "Build artifact is invalid"
    };
  }

  if (code === "ARTIFACT_CHECKSUM_MISMATCH") {
    return {
      status: 422,
      message: "Build artifact verification failed"
    };
  }

  if (code === "DOCKER_UNAVAILABLE") {
    return {
      status: 503,
      message: "Preview infrastructure is temporarily unavailable"
    };
  }

  if (code === "PREVIEW_LIMIT_REACHED") {
    return {
      status: 429,
      message: "Preview capacity limit reached"
    };
  }

  if (
    code === "PREVIEW_NOT_FOUND" ||
    /preview.*not found/i.test(message)
  ) {
    return {
      status: 404,
      message: "Preview not found"
    };
  }

  if (code === "PREVIEW_ALREADY_STOPPED") {
    return {
      status: 409,
      message: "Preview is already stopped"
    };
  }

  if (code === "HEALTH_CHECK_FAILED") {
    return {
      status: 503,
      message: "Preview health check failed"
    };
  }

  if (code === "PREVIEW_RUNTIME_FAILED") {
    return {
      status: 503,
      message: "Preview runtime could not be started"
    };
  }

  if (code === "ARTIFACT_CHECKSUM_MISMATCH") {
    return {
      status: 422,
      message: "Build artifact verification failed"
    };
  }

  return {
    status: 500,
    message: "Preview operation failed"
  };
}

function logControllerError(label, error, req) {
  /*
   * Detailed stack traces stay in server logs only.
   * They are never included in the API response.
   */
  console.error(`${label}:`, {
    message: error?.message || "Unknown error",
    stack: error?.stack,
    projectId: req?.params?.projectId,
    previewId: req?.params?.previewId,
    requestId:
      req?.id ||
      req?.requestId ||
      req?.headers?.["x-request-id"] ||
      undefined
  });
}

function sendMappedError(res, error, label, req) {
  logControllerError(label, error, req);

  const mapped = mapPreviewError(error);

  return sendError(
    res,
    mapped.status,
    mapped.message,
    {
      code: error?.code,
      category: error?.category,
      stage: error?.stage,
      errors: error?.errors,
      warnings: error?.warnings,
      buildId: error?.buildId,
      previewId: error?.previewId
    }
  );
}

/* =========================================================
   REQUEST CONTEXT
   ========================================================= */

function createRequestContext(req, projectId, userId) {
  return {
    requestId: cleanString(
      req?.id ||
        req?.requestId ||
        req?.headers?.["x-request-id"] ||
        "",
      200
    ),

    projectId: String(projectId),
    userId: String(userId),
    source: SERVICE_NAME,
    controllerVersion: CONTROLLER_VERSION,

    userAgent: cleanString(
      req?.headers?.["user-agent"] || "",
      500
    )
  };
}

/* =========================================================
   CREATE PREVIEW
   POST /projects/:projectId/preview
   ========================================================= */

async function createPreviewController(req, res) {
  const startedAt = Date.now();

  try {
    const userId = getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId = cleanString(
      req.params?.projectId,
      MAX_PROJECT_ID_LENGTH
    );

    const access = await validateProjectAccess(
      projectId,
      userId
    );

    if (!access.valid) {
      return sendError(
        res,
        access.status,
        access.message
      );
    }

    const buildValidation = validateBuildId(
      req.body?.buildId
    );

    if (!buildValidation.valid) {
      return sendError(
        res,
        400,
        buildValidation.message
      );
    }

    const requestContext = createRequestContext(
      req,
      projectId,
      userId
    );

    /*
     * The service independently verifies project access,
     * successful authoritative build identity and artifact.
     * The controller never trusts frontend build status.
     */
    const preview = await previewService.createPreview({
      projectId,
      userId,
      buildId: buildValidation.value,
      project: access.project,
      requestContext
    });

    if (!preview) {
      return sendError(
        res,
        500,
        "Preview creation returned no result"
      );
    }

    return res.status(201).json(
      formatResponse({
        success: true,
        message: "Preview created successfully",
        data: {
          preview: serializePreview(preview),
          requestId: requestContext.requestId || undefined,
          durationMs: Date.now() - startedAt
        }
      })
    );
  } catch (error) {
    return sendMappedError(
      res,
      error,
      "CREATE PREVIEW ERROR",
      req
    );
  }
}

/* =========================================================
   GET ACTIVE PREVIEW
   GET /projects/:projectId/preview
   ========================================================= */

async function getPreviewController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId = cleanString(
      req.params?.projectId,
      MAX_PROJECT_ID_LENGTH
    );

    const access = await validateProjectAccess(
      projectId,
      userId
    );

    if (!access.valid) {
      return sendError(
        res,
        access.status,
        access.message
      );
    }

    /*
     * IMPORTANT:
     * previewService exports getActivePreview().
     * getPreview() requires a specific previewId.
     */
    const preview = await previewService.getActivePreview({
      projectId,
      userId
    });

    return res.json(
      formatResponse({
        success: true,
        data: {
          preview: serializePreview(preview)
        }
      })
    );
  } catch (error) {
    return sendMappedError(
      res,
      error,
      "GET ACTIVE PREVIEW ERROR",
      req
    );
  }
}

/* =========================================================
   GET PREVIEW BY ID
   GET /projects/:projectId/preview/:previewId
   ========================================================= */

async function getPreviewByIdController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId = cleanString(
      req.params?.projectId,
      MAX_PROJECT_ID_LENGTH
    );

    const previewValidation = validatePreviewId(
      req.params?.previewId
    );

    if (!previewValidation.valid) {
      return sendError(
        res,
        400,
        previewValidation.message
      );
    }

    const access = await validateProjectAccess(
      projectId,
      userId
    );

    if (!access.valid) {
      return sendError(
        res,
        access.status,
        access.message
      );
    }

    const preview = await previewService.getPreview({
      projectId,
      userId,
      previewId: previewValidation.value
    });

    return res.json(
      formatResponse({
        success: true,
        data: {
          preview: serializePreview(preview)
        }
      })
    );
  } catch (error) {
    return sendMappedError(
      res,
      error,
      "GET PREVIEW BY ID ERROR",
      req
    );
  }
}

/* =========================================================
   PREVIEW HEALTH
   GET /projects/:projectId/preview/:previewId/health
   ========================================================= */

async function getPreviewHealthController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId = cleanString(
      req.params?.projectId,
      MAX_PROJECT_ID_LENGTH
    );

    const previewValidation = validatePreviewId(
      req.params?.previewId
    );

    if (!previewValidation.valid) {
      return sendError(
        res,
        400,
        previewValidation.message
      );
    }

    const access = await validateProjectAccess(
      projectId,
      userId
    );

    if (!access.valid) {
      return sendError(
        res,
        access.status,
        access.message
      );
    }

    /*
     * IMPORTANT:
     * The actual service export is getPreviewHealth().
     * refreshPreviewHealth() does not exist in v5.x.
     */
    const health = await previewService.getPreviewHealth({
      projectId,
      userId,
      previewId: previewValidation.value
    });

    if (!health) {
      return sendError(
        res,
        404,
        "Preview not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,
        data: {
          health: sanitizeValue(health)
        }
      })
    );
  } catch (error) {
    return sendMappedError(
      res,
      error,
      "PREVIEW HEALTH ERROR",
      req
    );
  }
}

/* =========================================================
   STOP PREVIEW
   POST /projects/:projectId/preview/:previewId/stop
   ========================================================= */

async function stopPreviewController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId = cleanString(
      req.params?.projectId,
      MAX_PROJECT_ID_LENGTH
    );

    const previewValidation = validatePreviewId(
      req.params?.previewId
    );

    if (!previewValidation.valid) {
      return sendError(
        res,
        400,
        previewValidation.message
      );
    }

    const access = await validateProjectAccess(
      projectId,
      userId
    );

    if (!access.valid) {
      return sendError(
        res,
        access.status,
        access.message
      );
    }

    const result = await previewService.stopPreview({
      projectId,
      userId,
      previewId: previewValidation.value
    });

    if (!result) {
      return sendError(
        res,
        404,
        "Preview not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,
        message: "Preview stopped successfully",
        data: {
          preview: serializePreview(result)
        }
      })
    );
  } catch (error) {
    return sendMappedError(
      res,
      error,
      "STOP PREVIEW ERROR",
      req
    );
  }
}

/* =========================================================
   EXPIRE PREVIEW
   POST /projects/:projectId/preview/:previewId/expire
   ========================================================= */

async function expirePreviewController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId = cleanString(
      req.params?.projectId,
      MAX_PROJECT_ID_LENGTH
    );

    const previewValidation = validatePreviewId(
      req.params?.previewId
    );

    if (!previewValidation.valid) {
      return sendError(
        res,
        400,
        previewValidation.message
      );
    }

    const access = await validateProjectAccess(
      projectId,
      userId
    );

    if (!access.valid) {
      return sendError(
        res,
        access.status,
        access.message
      );
    }

    const result = await previewService.expirePreview({
      projectId,
      userId,
      previewId: previewValidation.value
    });

    if (!result) {
      return sendError(
        res,
        404,
        "Preview not found"
      );
    }

    return res.json(
      formatResponse({
        success: true,
        message: "Preview expired successfully",
        data: {
          preview: serializePreview(result)
        }
      })
    );
  } catch (error) {
    return sendMappedError(
      res,
      error,
      "EXPIRE PREVIEW ERROR",
      req
    );
  }
}

/* =========================================================
   LIST PROJECT PREVIEWS
   GET /projects/:projectId/previews
   ========================================================= */

async function listPreviewsController(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId = cleanString(
      req.params?.projectId,
      MAX_PROJECT_ID_LENGTH
    );

    const access = await validateProjectAccess(
      projectId,
      userId
    );

    if (!access.valid) {
      return sendError(
        res,
        access.status,
        access.message
      );
    }

    const previews = await previewService.listPreviews({
      projectId,
      userId
    });

    return res.json(
      formatResponse({
        success: true,
        data: {
          previews: Array.isArray(previews)
            ? previews.map(serializePreview)
            : []
        }
      })
    );
  } catch (error) {
    return sendMappedError(
      res,
      error,
      "LIST PREVIEWS ERROR",
      req
    );
  }
}

/* =========================================================
   EXPORTS — KEEP IN SYNC WITH previewRoutes.js
   ========================================================= */

module.exports = {
  createPreviewController,
  getPreviewController,
  getPreviewByIdController,
  getPreviewHealthController,
  stopPreviewController,
  expirePreviewController,
  listPreviewsController
};
