"use strict";

/**
 * =========================================================
 * ZYRION OS — ENTERPRISE PREVIEW CONTROLLER
 * =========================================================
 *
 * Responsibility:
 * - Authenticate request
 * - Validate project ownership
 * - Validate authoritative build identity
 * - Create isolated preview runtime
 * - Return public-safe preview information
 * - Health monitoring
 * - Stop / expire preview
 * - Prevent cross-project / cross-user access
 *
 * Architecture:
 *
 * Workspace
 *    ↓
 * Preview Controller
 *    ↓
 * Preview Service
 *    ↓
 * Authoritative Artifact
 *    ↓
 * Isolated Runtime
 *    ↓
 * Preview URL
 *
 * IMPORTANT:
 * This controller NEVER builds source code itself.
 * It NEVER trusts frontend build status.
 * It NEVER executes project code directly.
 * =========================================================
 */

const mongoose = require("mongoose");

const Project =
  require("../models/projectModel");

const formatResponse =
  require("../utils/formatResponse");

const previewService =
  require("../services/previewService");


/* =========================================================
   CONSTANTS
   ========================================================= */

const SERVICE_NAME =
  "previewController";

const CONTROLLER_VERSION =
  "1.0.0";

const MAX_BUILD_ID_LENGTH =
  300;

const MAX_PREVIEW_ID_LENGTH =
  300;


/* =========================================================
   AUTHENTICATION
   ========================================================= */

function getUserId(req) {
  return (
    req?.user?.id ||
    req?.user?._id ||
    null
  );
}


/* =========================================================
   OBJECT ID VALIDATION
   ========================================================= */

function isValidObjectId(id) {
  return Boolean(
    id &&
    mongoose.Types.ObjectId.isValid(id)
  );
}


/* =========================================================
   STRING SANITIZATION
   ========================================================= */

function cleanString(
  value,
  max = 500
) {
  return String(
    value ?? ""
  )
    .trim()
    .slice(0, max);
}


/* =========================================================
   ERROR RESPONSE
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

  /*
   * Details are intentionally optional.
   *
   * Never expose:
   * - container IDs
   * - internal filesystem paths
   * - artifact storage keys
   * - credentials
   * - Docker commands
   * - infrastructure secrets
   */

  if (
    details &&
    typeof details === "object"
  ) {
    payload.error = sanitizeErrorDetails(
      details
    );
  }

  return res
    .status(status)
    .json(
      formatResponse(payload)
    );
}


/* =========================================================
   SAFE ERROR DETAILS
   ========================================================= */

function sanitizeErrorDetails(
  details = {}
) {
  const safe = {};

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

  for (
    const field of allowedFields
  ) {
    if (
      details[field] !== undefined
    ) {
      safe[field] =
        sanitizeValue(
          details[field]
        );
    }
  }

  return safe;
}


/* =========================================================
   SAFE VALUE SANITIZER
   ========================================================= */

function sanitizeValue(
  value,
  depth = 0
) {
  if (depth > 4) {
    return undefined;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    return value
      .replace(
        /\/(?:home|root|tmp|workspace|app|var|mnt)\/[^\s]*/gi,
        "[internal-path]"
      )
      .replace(
        /(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|DATABASE_URL)=\S+/gi,
        "[secret-redacted]"
      )
      .slice(0, 10000);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(0, 100)
      .map(item =>
        sanitizeValue(
          item,
          depth + 1
        )
      );
  }

  if (
    typeof value === "object"
  ) {
    const result = {};

    for (
      const [
        key,
        item
      ] of Object.entries(value)
    ) {
      if (
        [
          "containerId",
          "workerId",
          "workingDirectory",
          "storageKey",
          "hostPort",
          "internalPort",
          "environment",
          "env",
          "secrets"
        ].includes(key)
      ) {
        continue;
      }

      result[key] =
        sanitizeValue(
          item,
          depth + 1
        );
    }

    return result;
  }

  return undefined;
}


/* =========================================================
   PROJECT OWNERSHIP
   ========================================================= */

async function getOwnedProject(
  projectId,
  userId
) {
  if (
    !isValidObjectId(projectId) ||
    !userId
  ) {
    return null;
  }

  return Project.findOne({
    _id: projectId,
    userId,
    isArchived: false
  });
}


/* =========================================================
   VALIDATE PROJECT ACCESS
   ========================================================= */

async function validateProjectAccess(
  projectId,
  userId
) {
  if (
    !projectId
  ) {
    return {
      valid: false,
      status: 400,
      message:
        "Project ID is required"
    };
  }

  if (
    !isValidObjectId(
      projectId
    )
  ) {
    return {
      valid: false,
      status: 400,
      message:
        "Invalid project ID"
    };
  }

  const project =
    await getOwnedProject(
      projectId,
      userId
    );

  if (!project) {
    return {
      valid: false,
      status: 404,
      message:
        "Project not found"
    };
  }

  return {
    valid: true,
    project
  };
}


/* =========================================================
   VALIDATE BUILD ID
   ========================================================= */

function validateBuildId(
  buildId
) {
  const value =
    cleanString(
      buildId,
      MAX_BUILD_ID_LENGTH
    );

  if (!value) {
    return {
      valid: false,
      message:
        "Authoritative build ID is required"
    };
  }

  /*
   * Prevent path-like / injection-style IDs.
   */

  if (
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("..") ||
    /[\r\n\t]/.test(value)
  ) {
    return {
      valid: false,
      message:
        "Invalid build ID"
    };
  }

  return {
    valid: true,
    value
  };
}


/* =========================================================
   VALIDATE PREVIEW ID
   ========================================================= */

function validatePreviewId(
  previewId
) {
  const value =
    cleanString(
      previewId,
      MAX_PREVIEW_ID_LENGTH
    );

  if (!value) {
    return {
      valid: false,
      message:
        "Preview ID is required"
    };
  }

  if (
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("..") ||
    /[\r\n\t]/.test(value)
  ) {
    return {
      valid: false,
      message:
        "Invalid preview ID"
    };
  }

  return {
    valid: true,
    value
  };
}


/* =========================================================
   STATUS → HTTP MAPPING
   ========================================================= */

function mapPreviewError(
  error
) {
  const code =
    String(
      error?.code ||
      error?.name ||
      ""
    ).toUpperCase();

  const message =
    String(
      error?.message ||
      ""
    );

  if (
    code ===
      "PROJECT_NOT_FOUND" ||
    /project not found/i.test(
      message
    )
  ) {
    return {
      status: 404,
      message:
        "Project not found"
    };
  }

  if (
    code ===
      "BUILD_NOT_FOUND" ||
    /build.*not found/i.test(
      message
    )
  ) {
    return {
      status: 404,
      message:
        "Authoritative build not found"
    };
  }

  if (
    code ===
      "BUILD_NOT_SUCCESSFUL" ||
    /build.*successful/i.test(
      message
    )
  ) {
    return {
      status: 409,
      message:
        "Authoritative build is not successful"
    };
  }

  if (
    code ===
      "ARTIFACT_NOT_FOUND" ||
    /artifact.*not found/i.test(
      message
    )
  ) {
    return {
      status: 409,
      message:
        "Build artifact is unavailable"
    };
  }

  if (
    code ===
      "ARTIFACT_INVALID" ||
    /artifact.*invalid/i.test(
      message
    )
  ) {
    return {
      status: 422,
      message:
        "Build artifact is invalid"
    };
  }

  if (
    code ===
      "ARTIFACT_CHECKSUM_MISMATCH" ||
    /checksum/i.test(
      message
    )
  ) {
    return {
      status: 422,
      message:
        "Build artifact verification failed"
    };
  }

  if (
    code ===
      "DOCKER_UNAVAILABLE" ||
    /docker.*unavailable/i.test(
      message
    )
  ) {
    return {
      status: 503,
      message:
        "Preview infrastructure is temporarily unavailable"
    };
  }

  if (
    code ===
      "PREVIEW_LIMIT_REACHED" ||
    /preview.*limit/i.test(
      message
    )
  ) {
    return {
      status: 429,
      message:
        "Preview capacity limit reached"
    };
  }

  if (
    code ===
      "PREVIEW_NOT_FOUND" ||
    /preview.*not found/i.test(
      message
    )
  ) {
    return {
      status: 404,
      message:
        "Preview not found"
    };
  }

  if (
    code ===
      "PREVIEW_ALREADY_STOPPED" ||
    /already.*stopped/i.test(
      message
    )
  ) {
    return {
      status: 409,
      message:
        "Preview is already stopped"
    };
  }

  if (
    code ===
      "PREVIEW_RUNTIME_FAILED" ||
    /runtime.*failed/i.test(
      message
    )
  ) {
    return {
      status: 422,
      message:
        "Preview runtime failed"
    };
  }

  if (
    code ===
      "HEALTH_CHECK_FAILED" ||
    /health.*check.*failed/i.test(
      message
    )
  ) {
    return {
      status: 503,
      message:
        "Preview health check failed"
    };
  }

  return {
    status: 500,
    message:
      "Preview operation failed"
  };
}


/* =========================================================
   SAFE PREVIEW RESPONSE
   ========================================================= */

function serializePreview(
  preview
) {
  if (!preview) {
    return null;
  }

  let data;

  if (
    typeof preview.toObject ===
    "function"
  ) {
    data =
      preview.toObject();
  } else {
    data = {
      ...preview
    };
  }

  /*
   * Never return infrastructure internals.
   */

  delete data.containerId;
  delete data.workerId;
  delete data.workingDirectory;
  delete data.hostPort;
  delete data.internalPort;
  delete data.environment;
  delete data.env;
  delete data.secrets;
  delete data.storageKey;

  return data;
}


/* =========================================================
   REQUEST CONTEXT
   ========================================================= */

function createRequestContext(
  req,
  projectId,
  userId
) {
  return {
    requestId:
      cleanString(
        req?.id ||
        req?.requestId ||
        req?.headers?.["x-request-id"] ||
        "",
        200
      ),

    projectId:
      String(projectId),

    userId:
      String(userId),

    source:
      SERVICE_NAME,

    controllerVersion:
      CONTROLLER_VERSION,

    userAgent:
      cleanString(
        req?.headers?.["user-agent"] ||
        "",
        500
      )
  };
}


/* =========================================================
   CREATE PREVIEW
   ========================================================= */

async function createPreviewController(
  req,
  res
) {
  const startedAt =
    Date.now();

  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId =
      cleanString(
        req.params?.projectId,
        200
      );

    const access =
      await validateProjectAccess(
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

    const buildValidation =
      validateBuildId(
        req.body?.buildId
      );

    if (!buildValidation.valid) {
      return sendError(
        res,
        400,
        buildValidation.message
      );
    }

    const buildId =
      buildValidation.value;

    const requestContext =
      createRequestContext(
        req,
        projectId,
        userId
      );

    const preview =
      await previewService.createPreview({
        projectId,
        userId,
        buildId,

        /*
         * Explicitly pass project context.
         * The service must still independently
         * verify ownership/build identity.
         */

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

    const safePreview =
      serializePreview(
        preview
      );

    return res.status(201).json(
      formatResponse({
        success: true,

        message:
          "Preview created successfully",

        data: {
          preview:
            safePreview,

          requestId:
            requestContext.requestId ||
            undefined,

          durationMs:
            Date.now() -
            startedAt
        }
      })
    );
  } catch (error) {
    console.error(
      "CREATE PREVIEW ERROR:",
      {
        error:
          error?.message,
        stack:
          error?.stack,
        projectId:
          req?.params?.projectId
      }
    );

    const mapped =
      mapPreviewError(
        error
      );

    return sendError(
      res,
      mapped.status,
      mapped.message,
      {
        code:
          error?.code,
        category:
          error?.category,
        stage:
          error?.stage,
        errors:
          error?.errors,
        warnings:
          error?.warnings,
        buildId:
          error?.buildId
      }
    );
  }
}


/* =========================================================
   GET ACTIVE PREVIEW
   ========================================================= */

async function getPreviewController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId =
      cleanString(
        req.params?.projectId,
        200
      );

    const access =
      await validateProjectAccess(
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

    const preview =
      await previewService.getPreview({
        projectId,
        userId
      });

    if (!preview) {
      return res.json(
        formatResponse({
          success: true,

          data: {
            preview: null
          }
        })
      );
    }

    return res.json(
      formatResponse({
        success: true,

        data: {
          preview:
            serializePreview(
              preview
            )
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PREVIEW ERROR:",
      error
    );

    const mapped =
      mapPreviewError(
        error
      );

    return sendError(
      res,
      mapped.status,
      mapped.message,
      error
    );
  }
}


/* =========================================================
   GET PREVIEW BY ID
   ========================================================= */

async function getPreviewByIdController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId =
      cleanString(
        req.params?.projectId,
        200
      );

    const previewIdValidation =
      validatePreviewId(
        req.params?.previewId
      );

    if (
      !previewIdValidation.valid
    ) {
      return sendError(
        res,
        400,
        previewIdValidation.message
      );
    }

    const access =
      await validateProjectAccess(
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

    const preview =
      await previewService.getPreview({
        projectId,
        userId,
        previewId:
          previewIdValidation.value
      });

    if (!preview) {
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
          preview:
            serializePreview(
              preview
            )
        }
      })
    );
  } catch (error) {
    console.error(
      "GET PREVIEW BY ID ERROR:",
      error
    );

    const mapped =
      mapPreviewError(
        error
      );

    return sendError(
      res,
      mapped.status,
      mapped.message,
      error
    );
  }
}


/* =========================================================
   PREVIEW HEALTH
   ========================================================= */

async function getPreviewHealthController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId =
      cleanString(
        req.params?.projectId,
        200
      );

    const previewIdValidation =
      validatePreviewId(
        req.params?.previewId
      );

    if (
      !previewIdValidation.valid
    ) {
      return sendError(
        res,
        400,
        previewIdValidation.message
      );
    }

    const access =
      await validateProjectAccess(
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

    const health =
      await previewService.refreshPreviewHealth({
        projectId,
        userId,
        previewId:
          previewIdValidation.value
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
          health:
            sanitizeValue(
              health
            )
        }
      })
    );
  } catch (error) {
    console.error(
      "PREVIEW HEALTH ERROR:",
      error
    );

    const mapped =
      mapPreviewError(
        error
      );

    return sendError(
      res,
      mapped.status,
      mapped.message,
      error
    );
  }
}


/* =========================================================
   STOP PREVIEW
   ========================================================= */

async function stopPreviewController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId =
      cleanString(
        req.params?.projectId,
        200
      );

    const previewIdValidation =
      validatePreviewId(
        req.params?.previewId
      );

    if (
      !previewIdValidation.valid
    ) {
      return sendError(
        res,
        400,
        previewIdValidation.message
      );
    }

    const access =
      await validateProjectAccess(
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

    const result =
      await previewService.stopPreview({
        projectId,
        userId,
        previewId:
          previewIdValidation.value
      });

    return res.json(
      formatResponse({
        success: true,

        message:
          "Preview stopped successfully",

        data: {
          preview:
            serializePreview(
              result
            )
        }
      })
    );
  } catch (error) {
    console.error(
      "STOP PREVIEW ERROR:",
      error
    );

    const mapped =
      mapPreviewError(
        error
      );

    return sendError(
      res,
      mapped.status,
      mapped.message,
      error
    );
  }
}


/* =========================================================
   EXPIRE PREVIEW
   ========================================================= */

async function expirePreviewController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId =
      cleanString(
        req.params?.projectId,
        200
      );

    const previewIdValidation =
      validatePreviewId(
        req.params?.previewId
      );

    if (
      !previewIdValidation.valid
    ) {
      return sendError(
        res,
        400,
        previewIdValidation.message
      );
    }

    const access =
      await validateProjectAccess(
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

    const result =
      await previewService.expirePreview({
        projectId,
        userId,
        previewId:
          previewIdValidation.value
      });

    return res.json(
      formatResponse({
        success: true,

        message:
          "Preview expired successfully",

        data: {
          preview:
            serializePreview(
              result
            )
        }
      })
    );
  } catch (error) {
    console.error(
      "EXPIRE PREVIEW ERROR:",
      error
    );

    const mapped =
      mapPreviewError(
        error
      );

    return sendError(
      res,
      mapped.status,
      mapped.message,
      error
    );
  }
}


/* =========================================================
   LIST PREVIEWS
   ========================================================= */

async function listPreviewsController(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return sendError(
        res,
        401,
        "Authentication required"
      );
    }

    const projectId =
      cleanString(
        req.params?.projectId,
        200
      );

    const access =
      await validateProjectAccess(
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

    const previews =
      await previewService.listPreviews({
        projectId,
        userId
      });

    return res.json(
      formatResponse({
        success: true,

        data: {
          previews:
            Array.isArray(
              previews
            )
              ? previews.map(
                  serializePreview
                )
              : []
        }
      })
    );
  } catch (error) {
    console.error(
      "LIST PREVIEWS ERROR:",
      error
    );

    const mapped =
      mapPreviewError(
        error
      );

    return sendError(
      res,
      mapped.status,
      mapped.message,
      error
    );
  }
}


/* =========================================================
   EXPORTS
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
