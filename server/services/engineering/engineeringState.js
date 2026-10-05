"use strict";

/*
 * ============================================================
 * ZYRION OS — ENGINEERING STATE
 * ============================================================
 *
 * Enterprise Autonomous Engineering Control Plane
 *
 * Responsibilities:
 *   - Engineering Run
 *   - Engineering Attempt
 *   - Execution Record
 *   - Failure Record
 *   - Repair Record
 *   - Verification Record
 *   - Artifact Record
 *   - Resource Event
 *   - Checkpoint
 *   - Rollback Information
 *   - Failure Signatures
 *   - Successful Repair Patterns
 *   - Audit Events
 *   - State transitions
 *   - Safety / resource policies
 *
 * This file is STATE ONLY.
 *
 * It does NOT:
 *   - execute commands
 *   - call Docker
 *   - call an AI provider
 *   - modify project source files
 *   - claim that a build passed
 *
 * Execution belongs to engineeringExecutor.js.
 * Intelligence belongs to engineeringIntelligence.js.
 * Orchestration belongs to engineeringOrchestrator.js.
 *
 * ============================================================
 */

const mongoose = require("mongoose");

/* ============================================================
   VERSION
============================================================ */

const SERVICE_VERSION = "1.0.0";
const SCHEMA_VERSION = 1;

/* ============================================================
   ENGINEERING STATES
============================================================ */

const ENGINEERING_STATES = Object.freeze({
  CREATED: "CREATED",
  ANALYZING: "ANALYZING",
  EXECUTING: "EXECUTING",
  FAILED: "FAILED",
  DIAGNOSING: "DIAGNOSING",
  REPAIRING: "REPAIRING",
  VERIFYING: "VERIFYING",
  PASSED: "PASSED",
  ROLLBACK: "ROLLBACK",
  ESCALATED: "ESCALATED",
  PROMOTED: "PROMOTED"
});

const ENGINEERING_STATE_VALUES = Object.freeze(
  Object.values(ENGINEERING_STATES)
);

/* ============================================================
   TERMINAL STATES
============================================================ */

const TERMINAL_STATES = new Set([
  ENGINEERING_STATES.PROMOTED,
  ENGINEERING_STATES.ESCALATED
]);

/* ============================================================
   VALID STATE TRANSITIONS
 *
 * No arbitrary state jumping.
============================================================ */

const STATE_TRANSITIONS = Object.freeze({
  [ENGINEERING_STATES.CREATED]: [
    ENGINEERING_STATES.ANALYZING,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.ANALYZING]: [
    ENGINEERING_STATES.EXECUTING,
    ENGINEERING_STATES.FAILED,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.EXECUTING]: [
    ENGINEERING_STATES.PASSED,
    ENGINEERING_STATES.FAILED,
    ENGINEERING_STATES.VERIFYING,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.FAILED]: [
    ENGINEERING_STATES.DIAGNOSING,
    ENGINEERING_STATES.ROLLBACK,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.DIAGNOSING]: [
    ENGINEERING_STATES.REPAIRING,
    ENGINEERING_STATES.ROLLBACK,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.REPAIRING]: [
    ENGINEERING_STATES.VERIFYING,
    ENGINEERING_STATES.EXECUTING,
    ENGINEERING_STATES.FAILED,
    ENGINEERING_STATES.ROLLBACK,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.VERIFYING]: [
    ENGINEERING_STATES.PASSED,
    ENGINEERING_STATES.FAILED,
    ENGINEERING_STATES.REPAIRING,
    ENGINEERING_STATES.ROLLBACK,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.PASSED]: [
    ENGINEERING_STATES.PROMOTED,
    ENGINEERING_STATES.REPAIRING,
    ENGINEERING_STATES.ROLLBACK,
    ENGINEERING_STATES.ESCALATED
  ],

  [ENGINEERING_STATES.ROLLBACK]: [
    ENGINEERING_STATES.ESCALATED,
    ENGINEERING_STATES.ANALYZING
  ],

  [ENGINEERING_STATES.ESCALATED]: [],

  [ENGINEERING_STATES.PROMOTED]: []
});

/* ============================================================
   ENGINEERING LIMITS
============================================================ */

const ENGINEERING_LIMITS = Object.freeze({
  MAX_ATTEMPTS: 3,

  MAX_REPAIR_FILES: 20,

  MAX_DEPENDENCY_CHANGES: 10,

  MAX_EXECUTION_TIME: 15 * 60 * 1000,

  MAX_RESOURCE_LIMIT: Object.freeze({
    cpuCores: 4,
    memoryMB: 8192,
    pids: 512,
    diskMB: 10240
  }),

  MAX_SCOPE_EXPANSION: 20,

  MAX_AUTO_SCALE: 2
});

/* ============================================================
   ENUMS
============================================================ */

const FAILURE_CATEGORIES = [
  "syntax",
  "type",
  "dependency",
  "package_manager",
  "configuration",
  "environment",
  "filesystem",
  "permission",
  "network",
  "resource",
  "timeout",
  "process",
  "runtime",
  "framework",
  "build",
  "artifact",
  "integration",
  "test",
  "unknown"
];

const FAILURE_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical"
];

const EXECUTION_TYPES = [
  "static_validation",
  "install",
  "build",
  "runtime",
  "test",
  "preview",
  "smoke_test",
  "artifact"
];

const REPAIR_TYPES = [
  "source_patch",
  "dependency_repair",
  "configuration_repair",
  "environment_repair",
  "build_configuration",
  "resource_adjustment",
  "rollback",
  "other"
];

const VERIFICATION_TYPES = [
  "static",
  "build",
  "runtime",
  "smoke_test",
  "regression",
  "artifact",
  "full"
];

/* ============================================================
   HELPERS
============================================================ */

function assertObjectId(value, fieldName) {
  if (!value) {
    throw new Error(`${fieldName} is required`);
  }

  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return new mongoose.Types.ObjectId(value);
}

function normalizeString(value, maxLength = 4000) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).slice(0, maxLength);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values, max = 100) {
  return [
    ...new Set(
      normalizeArray(values)
        .map((value) => normalizeString(value, 1000).trim())
        .filter(Boolean)
    )
  ].slice(0, max);
}

function now() {
  return new Date();
}

/* ============================================================
   SECRET / CREDENTIAL REDACTION
 *
 * Evidence may contain environment variables or tokens.
 * State must never intentionally persist raw credentials.
============================================================ */

const SECRET_PATTERNS = [
  /bearer\s+[a-z0-9._-]+/gi,
  /authorization\s*[:=]\s*[^\s]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s]+/gi,
  /secret\s*[:=]\s*[^\s]+/gi,
  /token\s*[:=]\s*[^\s]+/gi,
  /password\s*[:=]\s*[^\s]+/gi,
  /access[_-]?token\s*[:=]\s*[^\s]+/gi,
  /refresh[_-]?token\s*[:=]\s*[^\s]+/gi
];

function redactSecrets(value) {
  let text = normalizeString(value, 20000);

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }

  return text;
}

function normalizeEvidence(value, maxLength = 20000) {
  return redactSecrets(
    normalizeString(value, maxLength)
  );
}

/* ============================================================
   JSON-SAFE SNAPSHOT
============================================================ */

function safeSnapshot(value, maxDepth = 4, depth = 0) {
  if (depth > maxDepth) {
    return "[MAX_DEPTH]";
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "string") {
      return redactSecrets(value);
    }

    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => safeSnapshot(item, maxDepth, depth + 1));
  }

  if (typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      if (
        /password|secret|token|api[-_]?key|authorization/i.test(key)
      ) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = safeSnapshot(
          item,
          maxDepth,
          depth + 1
        );
      }
    }

    return output;
  }

  return String(value);
}

/* ============================================================
   FAILURE SIGNATURE
============================================================ */

function buildFailureSignature({
  category,
  code,
  message,
  command,
  framework,
  packageManager
}) {
  const raw = [
    normalizeString(category, 100),
    normalizeString(code, 200),
    normalizeString(message, 1000)
      .toLowerCase()
      .replace(/\d+/g, "#")
      .replace(/\s+/g, " ")
      .trim(),
    normalizeString(command, 500),
    normalizeString(framework, 100),
    normalizeString(packageManager, 100)
  ].join("|");

  return raw.slice(0, 3000);
}

/* ============================================================
   SUB-SCHEMAS
============================================================ */

/* ---------------- Engineering Attempt ---------------- */

const attemptSchema = new mongoose.Schema(
  {
    attemptNumber: {
      type: Number,
      required: true,
      min: 1
    },

    status: {
      type: String,
      enum: [
        "created",
        "executing",
        "failed",
        "repairing",
        "verifying",
        "passed",
        "rolled_back",
        "escalated"
      ],
      default: "created",
      index: true
    },

    strategy: {
      type: String,
      default: "",
      maxlength: 500
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    durationMs: {
      type: Number,
      default: 0,
      min: 0
    },

    changedFiles: {
      type: [String],
      default: []
    },

    dependencyChanges: {
      type: [String],
      default: []
    },

    scopeExpansionPercent: {
      type: Number,
      default: 0,
      min: 0
    },

    success: {
      type: Boolean,
      default: false
    },

    failureRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    repairRecordIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: []
    },

    verificationRecordIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: []
    }
  },
  {
    _id: true,
    timestamps: true
  }
);

/* ---------------- Execution Record ---------------- */

const executionSchema = new mongoose.Schema(
  {
    executionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: EXECUTION_TYPES,
      required: true
    },

    command: {
      type: String,
      default: "",
      maxlength: 2000
    },

    workingDirectory: {
      type: String,
      default: "",
      maxlength: 1000
    },

    status: {
      type: String,
      enum: [
        "queued",
        "running",
        "success",
        "failed",
        "cancelled",
        "timeout"
      ],
      default: "queued",
      index: true
    },

    exitCode: {
      type: Number,
      default: null
    },

    signal: {
      type: String,
      default: "",
      maxlength: 100
    },

    timedOut: {
      type: Boolean,
      default: false
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    durationMs: {
      type: Number,
      default: 0,
      min: 0
    },

    stdout: {
      type: String,
      default: "",
      maxlength: 20000
    },

    stderr: {
      type: String,
      default: "",
      maxlength: 20000
    },

    resourceSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Failure Record ---------------- */

const failureSchema = new mongoose.Schema(
  {
    failureId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    stage: {
      type: String,
      required: true,
      maxlength: 200
    },

    category: {
      type: String,
      enum: FAILURE_CATEGORIES,
      default: "unknown",
      index: true
    },

    severity: {
      type: String,
      enum: FAILURE_SEVERITIES,
      default: "medium"
    },

    code: {
      type: String,
      default: "",
      maxlength: 300
    },

    message: {
      type: String,
      default: "",
      maxlength: 4000
    },

    rootCause: {
      type: String,
      default: "",
      maxlength: 4000
    },

    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },

    retryable: {
      type: Boolean,
      default: false
    },

    repairable: {
      type: Boolean,
      default: false
    },

    affectedFiles: {
      type: [String],
      default: []
    },

    affectedDependencies: {
      type: [String],
      default: []
    },

    command: {
      type: String,
      default: "",
      maxlength: 2000
    },

    exitCode: {
      type: Number,
      default: null
    },

    signal: {
      type: String,
      default: "",
      maxlength: 100
    },

    timedOut: {
      type: Boolean,
      default: false
    },

    stdout: {
      type: String,
      default: "",
      maxlength: 20000
    },

    stderr: {
      type: String,
      default: "",
      maxlength: 20000
    },

    signature: {
      type: String,
      default: "",
      maxlength: 3000,
      index: true
    },

    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Repair Record ---------------- */

const repairSchema = new mongoose.Schema(
  {
    repairId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: REPAIR_TYPES,
      required: true
    },

    strategy: {
      type: String,
      required: true,
      maxlength: 1000
    },

    reason: {
      type: String,
      default: "",
      maxlength: 4000
    },

    affectedFiles: {
      type: [String],
      default: []
    },

    dependencyChanges: {
      type: [String],
      default: []
    },

    changedFilesCount: {
      type: Number,
      default: 0,
      min: 0
    },

    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },

    risk: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium"
    },

    status: {
      type: String,
      enum: [
        "planned",
        "approved",
        "applied",
        "verified",
        "rejected",
        "rolled_back"
      ],
      default: "planned"
    },

    aiGenerated: {
      type: Boolean,
      default: false
    },

    verificationRequired: {
      type: Boolean,
      default: true
    },

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Verification Record ---------------- */

const verificationSchema = new mongoose.Schema(
  {
    verificationId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: VERIFICATION_TYPES,
      required: true
    },

    status: {
      type: String,
      enum: [
        "pending",
        "running",
        "passed",
        "failed",
        "skipped"
      ],
      default: "pending"
    },

    success: {
      type: Boolean,
      default: false
    },

    authoritative: {
      type: Boolean,
      default: false
    },

    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    errors: {
      type: [String],
      default: []
    },

    warnings: {
      type: [String],
      default: []
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    durationMs: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Artifact Record ---------------- */

const artifactSchema = new mongoose.Schema(
  {
    artifactId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      maxlength: 500
    },

    type: {
      type: String,
      enum: [
        "build",
        "bundle",
        "source",
        "archive",
        "container",
        "preview",
        "other"
      ],
      default: "build"
    },

    storageKey: {
      type: String,
      default: "",
      maxlength: 2000
    },

    url: {
      type: String,
      default: "",
      maxlength: 2000
    },

    size: {
      type: Number,
      default: 0,
      min: 0
    },

    checksum: {
      type: String,
      default: "",
      maxlength: 256
    },

    verified: {
      type: Boolean,
      default: false
    },

    createdAt: {
      type: Date,
      default: now
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Resource Event ---------------- */

const resourceEventSchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: [
        "allocation",
        "usage",
        "limit",
        "scale",
        "throttle",
        "oom",
        "timeout",
        "process_limit",
        "disk_limit"
      ],
      required: true
    },

    cpuCores: {
      type: Number,
      default: 0,
      min: 0
    },

    memoryMB: {
      type: Number,
      default: 0,
      min: 0
    },

    pids: {
      type: Number,
      default: 0,
      min: 0
    },

    diskMB: {
      type: Number,
      default: 0,
      min: 0
    },

    durationMs: {
      type: Number,
      default: 0,
      min: 0
    },

    action: {
      type: String,
      default: "",
      maxlength: 500
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Checkpoint ---------------- */

const checkpointSchema = new mongoose.Schema(
  {
    checkpointId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    sourceHash: {
      type: String,
      default: "",
      maxlength: 256
    },

    files: {
      type: [String],
      default: []
    },

    artifactId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    reason: {
      type: String,
      default: "",
      maxlength: 1000
    },

    restorable: {
      type: Boolean,
      default: true
    },

    restoredAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Rollback Information ---------------- */

const rollbackSchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    checkpointId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    reason: {
      type: String,
      required: true,
      maxlength: 4000
    },

    status: {
      type: String,
      enum: [
        "requested",
        "running",
        "completed",
        "failed"
      ],
      default: "requested"
    },

    restoredSourceHash: {
      type: String,
      default: "",
      maxlength: 256
    },

    restoredFiles: {
      type: [String],
      default: []
    },

    error: {
      type: String,
      default: "",
      maxlength: 4000
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Failure Signature ---------------- */

const failureSignatureSchema = new mongoose.Schema(
  {
    signature: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: 3000
    },

    category: {
      type: String,
      enum: FAILURE_CATEGORIES,
      default: "unknown"
    },

    occurrences: {
      type: Number,
      default: 1,
      min: 1
    },

    firstSeenAt: {
      type: Date,
      default: now
    },

    lastSeenAt: {
      type: Date,
      default: now
    },

    successfulRepairCount: {
      type: Number,
      default: 0,
      min: 0
    },

    failedRepairCount: {
      type: Number,
      default: 0,
      min: 0
    },

    lastSuccessfulRepairStrategy: {
      type: String,
      default: "",
      maxlength: 1000
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Successful Repair Pattern ---------------- */

const repairPatternSchema = new mongoose.Schema(
  {
    patternKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: 3000
    },

    failureSignature: {
      type: String,
      required: true,
      index: true,
      maxlength: 3000
    },

    strategy: {
      type: String,
      required: true,
      maxlength: 1000
    },

    repairType: {
      type: String,
      enum: REPAIR_TYPES,
      required: true
    },

    affectedFiles: {
      type: [String],
      default: []
    },

    dependencyChanges: {
      type: [String],
      default: []
    },

    successCount: {
      type: Number,
      default: 1,
      min: 1
    },

    failureCount: {
      type: Number,
      default: 0,
      min: 0
    },

    confidence: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1
    },

    lastSuccessfulAt: {
      type: Date,
      default: now
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ---------------- Audit Event ---------------- */

const auditEventSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },

    actorType: {
      type: String,
      enum: [
        "user",
        "master_agent",
        "engineering",
        "builder",
        "fix_agent",
        "system"
      ],
      default: "engineering"
    },

    action: {
      type: String,
      required: true,
      maxlength: 300
    },

    fromState: {
      type: String,
      enum: ENGINEERING_STATE_VALUES,
      default: null
    },

    toState: {
      type: String,
      enum: ENGINEERING_STATE_VALUES,
      default: null
    },

    message: {
      type: String,
      default: "",
      maxlength: 4000
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ============================================================
   ENGINEERING RUN
============================================================ */

const engineeringRunSchema = new mongoose.Schema(
  {
    schemaVersion: {
      type: Number,
      required: true,
      default: SCHEMA_VERSION
    },

    serviceVersion: {
      type: String,
      required: true,
      default: SERVICE_VERSION
    },

    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 300
    },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    workflowId: {
      type: String,
      default: "",
      index: true,
      maxlength: 300
    },

    requestId: {
      type: String,
      default: "",
      index: true,
      maxlength: 300
    },

    projectName: {
      type: String,
      default: "",
      maxlength: 500
    },

    framework: {
      type: String,
      default: "",
      maxlength: 200
    },

    packageManager: {
      type: String,
      default: "",
      maxlength: 100
    },

    currentState: {
      type: String,
      enum: ENGINEERING_STATE_VALUES,
      default: ENGINEERING_STATES.CREATED,
      index: true
    },

    previousState: {
      type: String,
      enum: ENGINEERING_STATE_VALUES,
      default: null
    },

    attemptCount: {
      type: Number,
      default: 0,
      min: 0
    },

    currentAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    sourceHash: {
      type: String,
      default: "",
      maxlength: 256
    },

    scope: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    policy: {
      maxAttempts: {
        type: Number,
        default: ENGINEERING_LIMITS.MAX_ATTEMPTS
      },

      maxRepairFiles: {
        type: Number,
        default: ENGINEERING_LIMITS.MAX_REPAIR_FILES
      },

      maxDependencyChanges: {
        type: Number,
        default: ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
      },

      maxExecutionTime: {
        type: Number,
        default: ENGINEERING_LIMITS.MAX_EXECUTION_TIME
      },

      maxScopeExpansion: {
        type: Number,
        default: ENGINEERING_LIMITS.MAX_SCOPE_EXPANSION
      },

      maxAutoScale: {
        type: Number,
        default: ENGINEERING_LIMITS.MAX_AUTO_SCALE
      },

      maxResourceLimit: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({
          ...ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT
        })
      }
    },

    success: {
      type: Boolean,
      default: false
    },

    promoted: {
      type: Boolean,
      default: false
    },

    escalated: {
      type: Boolean,
      default: false
    },

    rollbackRequired: {
      type: Boolean,
      default: false
    },

    finalArtifactId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    lastError: {
      type: String,
      default: "",
      maxlength: 4000
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/* ============================================================
   INDEXES
============================================================ */

engineeringRunSchema.index({
  projectId: 1,
  createdAt: -1
});

engineeringRunSchema.index({
  userId: 1,
  createdAt: -1
});

engineeringRunSchema.index({
  currentState: 1,
  createdAt: -1
});

failureSchema.index({
  attemptId: 1,
  createdAt: -1
});

executionSchema.index({
  attemptId: 1,
  createdAt: -1
});

repairSchema.index({
  attemptId: 1,
  createdAt: -1
});

verificationSchema.index({
  attemptId: 1,
  createdAt: -1
});

resourceEventSchema.index({
  attemptId: 1,
  createdAt: -1
});

auditEventSchema.index({
  runId: 1,
  createdAt: -1
});

/* ============================================================
   MODEL REGISTRATION
 *
 * Safe for hot reload / repeated require().
============================================================ */

const EngineeringRun =
  mongoose.models.EngineeringRun ||
  mongoose.model("EngineeringRun", engineeringRunSchema);

const EngineeringAttempt =
  mongoose.models.EngineeringAttempt ||
  mongoose.model("EngineeringAttempt", attemptSchema);

const EngineeringExecution =
  mongoose.models.EngineeringExecution ||
  mongoose.model("EngineeringExecution", executionSchema);

const EngineeringFailure =
  mongoose.models.EngineeringFailure ||
  mongoose.model("EngineeringFailure", failureSchema);

const EngineeringRepair =
  mongoose.models.EngineeringRepair ||
  mongoose.model("EngineeringRepair", repairSchema);

const EngineeringVerification =
  mongoose.models.EngineeringVerification ||
  mongoose.model(
    "EngineeringVerification",
    verificationSchema
  );

const EngineeringArtifact =
  mongoose.models.EngineeringArtifact ||
  mongoose.model(
    "EngineeringArtifact",
    artifactSchema
  );

const EngineeringResourceEvent =
  mongoose.models.EngineeringResourceEvent ||
  mongoose.model(
    "EngineeringResourceEvent",
    resourceEventSchema
  );

const EngineeringCheckpoint =
  mongoose.models.EngineeringCheckpoint ||
  mongoose.model(
    "EngineeringCheckpoint",
    checkpointSchema
  );

const EngineeringRollback =
  mongoose.models.EngineeringRollback ||
  mongoose.model(
    "EngineeringRollback",
    rollbackSchema
  );

const EngineeringFailureSignature =
  mongoose.models.EngineeringFailureSignature ||
  mongoose.model(
    "EngineeringFailureSignature",
    failureSignatureSchema
  );

const EngineeringRepairPattern =
  mongoose.models.EngineeringRepairPattern ||
  mongoose.model(
    "EngineeringRepairPattern",
    repairPatternSchema
  );

const EngineeringAuditEvent =
  mongoose.models.EngineeringAuditEvent ||
  mongoose.model(
    "EngineeringAuditEvent",
    auditEventSchema
  );

/* ============================================================
   RUN OPERATIONS
============================================================ */

/**
 * Create a new engineering run.
 */
async function createEngineeringRun({
  projectId,
  userId,
  projectName = "",
  framework = "",
  packageManager = "",
  workflowId = "",
  requestId = "",
  sourceHash = "",
  scope = {},
  metadata = {}
}) {
  const safeProjectId = assertObjectId(projectId, "projectId");
  const safeUserId = assertObjectId(userId, "userId");

  const runId =
    `eng-${Date.now()}-${new mongoose.Types.ObjectId().toString()}`;

  const run = await EngineeringRun.create({
    runId,
    projectId: safeProjectId,
    userId: safeUserId,
    projectName: normalizeString(projectName, 500),
    framework: normalizeString(framework, 200),
    packageManager: normalizeString(packageManager, 100),
    workflowId: normalizeString(workflowId, 300),
    requestId: normalizeString(requestId, 300),
    sourceHash: normalizeString(sourceHash, 256),
    scope: safeSnapshot(scope),
    metadata: safeSnapshot(metadata),
    currentState: ENGINEERING_STATES.CREATED
  });

  await createAuditEvent({
    runId: run._id,
    actorType: "engineering",
    action: "engineering_run_created",
    message: "Engineering run created."
  });

  return run;
}

/**
 * Read a run by public runId.
 */
async function getEngineeringRun(runId) {
  const safeRunId = normalizeString(runId, 300);

  if (!safeRunId) {
    throw new Error("runId is required");
  }

  return EngineeringRun.findOne({
    runId: safeRunId
  }).exec();
}

/**
 * Transition the engineering state.
 *
 * Every transition is validated.
 */
async function transitionEngineeringState({
  runId,
  toState,
  actorType = "engineering",
  message = "",
  metadata = {}
}) {
  if (!ENGINEERING_STATE_VALUES.includes(toState)) {
    throw new Error(`Invalid engineering state: ${toState}`);
  }

  const run = await EngineeringRun.findOne({
    runId: normalizeString(runId, 300)
  });

  if (!run) {
    throw new Error(`Engineering run not found: ${runId}`);
  }

  const fromState = run.currentState;

  if (fromState === toState) {
    return run;
  }

  const allowed =
    STATE_TRANSITIONS[fromState] || [];

  if (!allowed.includes(toState)) {
    throw new Error(
      `Invalid engineering state transition: ${fromState} → ${toState}`
    );
  }

  const update = {
    previousState: fromState,
    currentState: toState
  };

  if (toState === ENGINEERING_STATES.EXECUTING) {
    update.startedAt = run.startedAt || now();
  }

  if (
    toState === ENGINEERING_STATES.PROMOTED ||
    toState === ENGINEERING_STATES.ESCALATED
  ) {
    update.completedAt = now();
  }

  if (toState === ENGINEERING_STATES.PASSED) {
    update.success = true;
  }

  if (toState === ENGINEERING_STATES.PROMOTED) {
    update.success = true;
    update.promoted = true;
  }

  if (toState === ENGINEERING_STATES.ESCALATED) {
    update.escalated = true;
  }

  if (toState === ENGINEERING_STATES.ROLLBACK) {
    update.rollbackRequired = true;
  }

  const updated = await EngineeringRun.findByIdAndUpdate(
    run._id,
    {
      $set: update
    },
    {
      new: true,
      runValidators: true
    }
  ).exec();

  await createAuditEvent({
    runId: run._id,
    actorType,
    action: "engineering_state_transition",
    fromState,
    toState,
    message,
    metadata
  });

  return updated;
}

/* ============================================================
   ATTEMPT OPERATIONS
============================================================ */

async function createEngineeringAttempt({
  runId,
  strategy = "",
  changedFiles = [],
  dependencyChanges = [],
  scopeExpansionPercent = 0
}) {
  const run = await getEngineeringRun(runId);

  if (!run) {
    throw new Error(`Engineering run not found: ${runId}`);
  }

  const attemptNumber = run.attemptCount + 1;

  const maxAttempts =
    run.policy?.maxAttempts ??
    ENGINEERING_LIMITS.MAX_ATTEMPTS;

  if (attemptNumber > maxAttempts) {
    throw new Error(
      `Engineering attempt limit exceeded: ${maxAttempts}`
    );
  }

  const safeChangedFiles = uniqueStrings(
    changedFiles,
    maxAttempts * ENGINEERING_LIMITS.MAX_REPAIR_FILES
  );

  const safeDependencyChanges = uniqueStrings(
    dependencyChanges,
    ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
  );

  if (
    safeChangedFiles.length >
    ENGINEERING_LIMITS.MAX_REPAIR_FILES
  ) {
    throw new Error(
      `MAX_REPAIR_FILES exceeded: ${ENGINEERING_LIMITS.MAX_REPAIR_FILES}`
    );
  }

  if (
    safeDependencyChanges.length >
    ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
  ) {
    throw new Error(
      `MAX_DEPENDENCY_CHANGES exceeded: ${ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES}`
    );
  }

  if (
    Number(scopeExpansionPercent) >
    (run.policy?.maxScopeExpansion ??
      ENGINEERING_LIMITS.MAX_SCOPE_EXPANSION)
  ) {
    throw new Error(
      `MAX_SCOPE_EXPANSION exceeded`
    );
  }

  const attempt = await EngineeringAttempt.create({
    attemptNumber,
    strategy: normalizeString(strategy, 500),
    changedFiles: safeChangedFiles,
    dependencyChanges: safeDependencyChanges,
    scopeExpansionPercent: Math.max(
      0,
      Number(scopeExpansionPercent) || 0
    )
  });

  await EngineeringRun.findByIdAndUpdate(
    run._id,
    {
      $set: {
        attemptCount: attemptNumber,
        currentAttemptId: attempt._id
      }
    },
    {
      runValidators: true
    }
  ).exec();

  await createAuditEvent({
    runId: run._id,
    attemptId: attempt._id,
    actorType: "engineering",
    action: "engineering_attempt_created",
    message: `Engineering attempt ${attemptNumber} created.`
  });

  return attempt;
}

async function updateEngineeringAttempt(
  attemptId,
  updates = {}
) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  const allowed = {};

  if (updates.status !== undefined) {
    allowed.status = updates.status;
  }

  if (updates.strategy !== undefined) {
    allowed.strategy = normalizeString(
      updates.strategy,
      500
    );
  }

  if (updates.changedFiles !== undefined) {
    allowed.changedFiles = uniqueStrings(
      updates.changedFiles,
      ENGINEERING_LIMITS.MAX_REPAIR_FILES
    );
  }

  if (updates.dependencyChanges !== undefined) {
    allowed.dependencyChanges = uniqueStrings(
      updates.dependencyChanges,
      ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
    );
  }

  if (updates.success !== undefined) {
    allowed.success = Boolean(updates.success);
  }

  if (updates.startedAt !== undefined) {
    allowed.startedAt = updates.startedAt;
  }

  if (updates.completedAt !== undefined) {
    allowed.completedAt = updates.completedAt;
  }

  if (
    updates.durationMs !== undefined
  ) {
    if (
      Number(updates.durationMs) >
      ENGINEERING_LIMITS.MAX_EXECUTION_TIME
    ) {
      throw new Error(
        "MAX_EXECUTION_TIME exceeded"
      );
    }

    allowed.durationMs = Math.max(
      0,
      Number(updates.durationMs)
    );
  }

  return EngineeringAttempt.findByIdAndUpdate(
    attemptId,
    {
      $set: allowed
    },
    {
      new: true,
      runValidators: true
    }
  ).exec();
}

/* ============================================================
   EXECUTION RECORD
============================================================ */

async function createExecutionRecord({
  attemptId,
  type,
  command = "",
  workingDirectory = ""
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  if (!EXECUTION_TYPES.includes(type)) {
    throw new Error(`Invalid execution type: ${type}`);
  }

  const executionId =
    `exec-${Date.now()}-${new mongoose.Types.ObjectId().toString()}`;

  return EngineeringExecution.create({
    executionId,
    attemptId,
    type,
    command: normalizeString(command, 2000),
    workingDirectory: normalizeString(
      workingDirectory,
      1000
    )
  });
}

async function completeExecutionRecord({
  executionId,
  status,
  exitCode = null,
  signal = "",
  timedOut = false,
  startedAt = null,
  completedAt = null,
  stdout = "",
  stderr = "",
  resourceSnapshot = {}
}) {
  const execution =
    await EngineeringExecution.findOne({
      executionId
    });

  if (!execution) {
    throw new Error(
      `Execution not found: ${executionId}`
    );
  }

  if (
    ![
      "success",
      "failed",
      "cancelled",
      "timeout"
    ].includes(status)
  ) {
    throw new Error(
      `Invalid execution completion status: ${status}`
    );
  }

  let durationMs = 0;

  if (startedAt && completedAt) {
    durationMs =
      new Date(completedAt).getTime() -
      new Date(startedAt).getTime();
  }

  if (
    durationMs >
    ENGINEERING_LIMITS.MAX_EXECUTION_TIME
  ) {
    throw new Error(
      "MAX_EXECUTION_TIME exceeded"
    );
  }

  return EngineeringExecution.findByIdAndUpdate(
    execution._id,
    {
      $set: {
        status,
        exitCode,
        signal: normalizeString(signal, 100),
        timedOut: Boolean(timedOut),
        startedAt,
        completedAt,
        durationMs: Math.max(0, durationMs),
        stdout: normalizeEvidence(stdout),
        stderr: normalizeEvidence(stderr),
        resourceSnapshot: safeSnapshot(
          resourceSnapshot
        )
      }
    },
    {
      new: true,
      runValidators: true
    }
  ).exec();
}

/* ============================================================
   FAILURE RECORD
============================================================ */

async function createFailureRecord({
  attemptId,
  stage,
  category = "unknown",
  severity = "medium",
  code = "",
  message = "",
  rootCause = "",
  confidence = 0,
  retryable = false,
  repairable = false,
  affectedFiles = [],
  affectedDependencies = [],
  command = "",
  exitCode = null,
  signal = "",
  timedOut = false,
  stdout = "",
  stderr = "",
  evidence = {}
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  if (!FAILURE_CATEGORIES.includes(category)) {
    throw new Error(
      `Invalid failure category: ${category}`
    );
  }

  if (!FAILURE_SEVERITIES.includes(severity)) {
    throw new Error(
      `Invalid failure severity: ${severity}`
    );
  }

  const safeMessage = normalizeString(
    message,
    4000
  );

  const signature = buildFailureSignature({
    category,
    code,
    message: safeMessage,
    command,
    framework: "",
    packageManager: ""
  });

  const failureId =
    `failure-${Date.now()}-${new mongoose.Types.ObjectId().toString()}`;

  const failure =
    await EngineeringFailure.create({
      failureId,
      attemptId,
      stage: normalizeString(stage, 200),
      category,
      severity,
      code: normalizeString(code, 300),
      message: safeMessage,
      rootCause: normalizeString(rootCause, 4000),
      confidence: Math.min(
        1,
        Math.max(0, Number(confidence) || 0)
      ),
      retryable: Boolean(retryable),
      repairable: Boolean(repairable),
      affectedFiles: uniqueStrings(
        affectedFiles,
        ENGINEERING_LIMITS.MAX_REPAIR_FILES
      ),
      affectedDependencies: uniqueStrings(
        affectedDependencies,
        ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
      ),
      command: normalizeString(command, 2000),
      exitCode,
      signal: normalizeString(signal, 100),
      timedOut: Boolean(timedOut),
      stdout: normalizeEvidence(stdout),
      stderr: normalizeEvidence(stderr),
      signature,
      evidence: safeSnapshot(evidence)
    });

  await registerFailureSignature({
    signature,
    category
  });

  return failure;
}

/* ============================================================
   REPAIR RECORD
============================================================ */

async function createRepairRecord({
  attemptId,
  type,
  strategy,
  reason = "",
  affectedFiles = [],
  dependencyChanges = [],
  confidence = 0,
  risk = "medium",
  aiGenerated = false
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  if (!REPAIR_TYPES.includes(type)) {
    throw new Error(
      `Invalid repair type: ${type}`
    );
  }

  const safeFiles = uniqueStrings(
    affectedFiles,
    ENGINEERING_LIMITS.MAX_REPAIR_FILES
  );

  const safeDependencies = uniqueStrings(
    dependencyChanges,
    ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
  );

  if (
    safeFiles.length >
    ENGINEERING_LIMITS.MAX_REPAIR_FILES
  ) {
    throw new Error(
      "MAX_REPAIR_FILES exceeded"
    );
  }

  if (
    safeDependencies.length >
    ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
  ) {
    throw new Error(
      "MAX_DEPENDENCY_CHANGES exceeded"
    );
  }

  const repairId =
    `repair-${Date.now()}-${new mongoose.Types.ObjectId().toString()}`;

  return EngineeringRepair.create({
    repairId,
    attemptId,
    type,
    strategy: normalizeString(strategy, 1000),
    reason: normalizeString(reason, 4000),
    affectedFiles: safeFiles,
    dependencyChanges: safeDependencies,
    changedFilesCount: safeFiles.length,
    confidence: Math.min(
      1,
      Math.max(0, Number(confidence) || 0)
    ),
    risk,
    aiGenerated: Boolean(aiGenerated)
  });
}

/* ============================================================
   VERIFICATION RECORD
============================================================ */

async function createVerificationRecord({
  attemptId,
  type,
  authoritative = false
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  if (!VERIFICATION_TYPES.includes(type)) {
    throw new Error(
      `Invalid verification type: ${type}`
    );
  }

  const verificationId =
    `verify-${Date.now()}-${new mongoose.Types.ObjectId().toString()}`;

  return EngineeringVerification.create({
    verificationId,
    attemptId,
    type,
    authoritative: Boolean(authoritative)
  });
}

async function completeVerificationRecord({
  verificationId,
  success,
  status,
  evidence = {},
  errors = [],
  warnings = [],
  startedAt = null,
  completedAt = null
}) {
  const verification =
    await EngineeringVerification.findOne({
      verificationId
    });

  if (!verification) {
    throw new Error(
      `Verification not found: ${verificationId}`
    );
  }

  const durationMs =
    startedAt && completedAt
      ? Math.max(
          0,
          new Date(completedAt).getTime() -
            new Date(startedAt).getTime()
        )
      : 0;

  return EngineeringVerification.findByIdAndUpdate(
    verification._id,
    {
      $set: {
        success: Boolean(success),
        status,
        evidence: safeSnapshot(evidence),
        errors: uniqueStrings(errors, 100),
        warnings: uniqueStrings(warnings, 100),
        startedAt,
        completedAt,
        durationMs
      }
    },
    {
      new: true,
      runValidators: true
    }
  ).exec();
}

/* ============================================================
   ARTIFACT RECORD
============================================================ */

async function createArtifactRecord({
  attemptId,
  artifactId,
  name,
  type = "build",
  storageKey = "",
  url = "",
  size = 0,
  checksum = "",
  verified = false
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  if (!artifactId) {
    throw new Error("artifactId is required");
  }

  return EngineeringArtifact.create({
    artifactId,
    attemptId,
    name: normalizeString(name, 500),
    type,
    storageKey: normalizeString(storageKey, 2000),
    url: normalizeString(url, 2000),
    size: Math.max(0, Number(size) || 0),
    checksum: normalizeString(checksum, 256),
    verified: Boolean(verified)
  });
}

/* ============================================================
   RESOURCE EVENT
============================================================ */

async function createResourceEvent({
  attemptId,
  type,
  cpuCores = 0,
  memoryMB = 0,
  pids = 0,
  diskMB = 0,
  durationMs = 0,
  action = "",
  metadata = {}
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  const limits =
    ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT;

  if (
    Number(cpuCores) > limits.cpuCores ||
    Number(memoryMB) > limits.memoryMB ||
    Number(pids) > limits.pids ||
    Number(diskMB) > limits.diskMB
  ) {
    throw new Error(
      "MAX_RESOURCE_LIMIT exceeded"
    );
  }

  return EngineeringResourceEvent.create({
    attemptId,
    type,
    cpuCores: Math.max(0, Number(cpuCores) || 0),
    memoryMB: Math.max(0, Number(memoryMB) || 0),
    pids: Math.max(0, Number(pids) || 0),
    diskMB: Math.max(0, Number(diskMB) || 0),
    durationMs: Math.max(0, Number(durationMs) || 0),
    action: normalizeString(action, 500),
    metadata: safeSnapshot(metadata)
  });
}

/* ============================================================
   CHECKPOINT
============================================================ */

async function createCheckpoint({
  attemptId,
  checkpointId,
  sourceHash = "",
  files = [],
  artifactId = null,
  reason = ""
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  if (
    artifactId &&
    !mongoose.Types.ObjectId.isValid(artifactId)
  ) {
    throw new Error("Invalid artifactId");
  }

  return EngineeringCheckpoint.create({
    checkpointId,
    attemptId,
    sourceHash: normalizeString(sourceHash, 256),
    files: uniqueStrings(files, 1000),
    artifactId,
    reason: normalizeString(reason, 1000)
  });
}

/* ============================================================
   ROLLBACK
============================================================ */

async function createRollbackRecord({
  attemptId,
  checkpointId = null,
  reason
}) {
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    throw new Error("Invalid attemptId");
  }

  if (
    checkpointId &&
    !mongoose.Types.ObjectId.isValid(checkpointId)
  ) {
    throw new Error("Invalid checkpointId");
  }

  if (!reason) {
    throw new Error(
      "Rollback reason is required"
    );
  }

  return EngineeringRollback.create({
    attemptId,
    checkpointId,
    reason: normalizeString(reason, 4000)
  });
}

async function completeRollbackRecord({
  rollbackId,
  status,
  restoredSourceHash = "",
  restoredFiles = [],
  error = ""
}) {
  if (!mongoose.Types.ObjectId.isValid(rollbackId)) {
    throw new Error("Invalid rollbackId");
  }

  return EngineeringRollback.findByIdAndUpdate(
    rollbackId,
    {
      $set: {
        status,
        restoredSourceHash:
          normalizeString(
            restoredSourceHash,
            256
          ),
        restoredFiles: uniqueStrings(
          restoredFiles,
          1000
        ),
        error: normalizeString(
          error,
          4000
        ),
        completedAt:
          status === "completed" ||
          status === "failed"
            ? now()
            : null
      }
    },
    {
      new: true,
      runValidators: true
    }
  ).exec();
}

/* ============================================================
   FAILURE SIGNATURE MEMORY
============================================================ */

async function registerFailureSignature({
  signature,
  category = "unknown"
}) {
  if (!signature) {
    throw new Error(
      "Failure signature is required"
    );
  }

  return EngineeringFailureSignature.findOneAndUpdate(
    { signature },
    {
      $set: {
        category,
        lastSeenAt: now()
      },
      $inc: {
        occurrences: 1
      },
      $setOnInsert: {
        firstSeenAt: now()
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).exec();
}

/* ============================================================
   SUCCESSFUL REPAIR PATTERN MEMORY
============================================================ */

async function registerSuccessfulRepairPattern({
  patternKey,
  failureSignature,
  strategy,
  repairType,
  affectedFiles = [],
  dependencyChanges = [],
  confidence = 0.5,
  metadata = {}
}) {
  if (!patternKey) {
    throw new Error(
      "patternKey is required"
    );
  }

  if (!failureSignature) {
    throw new Error(
      "failureSignature is required"
    );
  }

  if (!REPAIR_TYPES.includes(repairType)) {
    throw new Error(
      `Invalid repair type: ${repairType}`
    );
  }

  const pattern =
    await EngineeringRepairPattern.findOneAndUpdate(
      { patternKey },
      {
        $set: {
          failureSignature,
          strategy: normalizeString(
            strategy,
            1000
          ),
          repairType,
          affectedFiles: uniqueStrings(
            affectedFiles,
            ENGINEERING_LIMITS.MAX_REPAIR_FILES
          ),
          dependencyChanges: uniqueStrings(
            dependencyChanges,
            ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES
          ),
          confidence: Math.min(
            1,
            Math.max(
              0,
              Number(confidence) || 0
            )
          ),
          lastSuccessfulAt: now(),
          metadata: safeSnapshot(metadata)
        },
        $inc: {
          successCount: 1
        },
        $setOnInsert: {
          failureCount: 0
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    ).exec();

  await EngineeringFailureSignature.findOneAndUpdate(
    {
      signature: failureSignature
    },
    {
      $inc: {
        successfulRepairCount: 1
      },
      $set: {
        lastSuccessfulRepairStrategy:
          normalizeString(
            strategy,
            1000
          ),
        lastSeenAt: now()
      }
    },
    {
      upsert: true
    }
  ).exec();

  return pattern;
}

/**
 * Find previously successful strategies.
 *
 * This does not automatically execute them.
 * Intelligence/orchestrator decides whether they are safe.
 */
async function findSuccessfulRepairPatterns(
  failureSignature,
  limit = 5
) {
  if (!failureSignature) {
    return [];
  }

  return EngineeringRepairPattern.find({
    failureSignature,
    successCount: {
      $gt: 0
    }
  })
    .sort({
      confidence: -1,
      successCount: -1,
      lastSuccessfulAt: -1
    })
    .limit(Math.min(20, Math.max(1, limit)))
    .lean()
    .exec();
}

/* ============================================================
   AUDIT EVENT
============================================================ */

async function createAuditEvent({
  runId,
  attemptId = null,
  actorType = "engineering",
  action,
  fromState = null,
  toState = null,
  message = "",
  metadata = {}
}) {
  if (!runId) {
    throw new Error("runId is required");
  }

  return EngineeringAuditEvent.create({
    runId,
    attemptId,
    actorType,
    action: normalizeString(action, 300),
    fromState,
    toState,
    message: normalizeString(message, 4000),
    metadata: safeSnapshot(metadata)
  });
}

/* ============================================================
   LIMIT CHECKS
============================================================ */

async function getRunSafetyStatus(runId) {
  const run = await getEngineeringRun(runId);

  if (!run) {
    throw new Error(
      `Engineering run not found: ${runId}`
    );
  }

  const attemptsRemaining = Math.max(
    0,
    (run.policy?.maxAttempts ??
      ENGINEERING_LIMITS.MAX_ATTEMPTS) -
      run.attemptCount
  );

  return {
    safe: attemptsRemaining > 0,
    attemptsUsed: run.attemptCount,
    attemptsRemaining,
    maxAttempts:
      run.policy?.maxAttempts ??
      ENGINEERING_LIMITS.MAX_ATTEMPTS,
    maxRepairFiles:
      run.policy?.maxRepairFiles ??
      ENGINEERING_LIMITS.MAX_REPAIR_FILES,
    maxDependencyChanges:
      run.policy?.maxDependencyChanges ??
      ENGINEERING_LIMITS.MAX_DEPENDENCY_CHANGES,
    maxExecutionTime:
      run.policy?.maxExecutionTime ??
      ENGINEERING_LIMITS.MAX_EXECUTION_TIME,
    maxScopeExpansion:
      run.policy?.maxScopeExpansion ??
      ENGINEERING_LIMITS.MAX_SCOPE_EXPANSION,
    maxAutoScale:
      run.policy?.maxAutoScale ??
      ENGINEERING_LIMITS.MAX_AUTO_SCALE,
    maxResourceLimit:
      run.policy?.maxResourceLimit ??
      ENGINEERING_LIMITS.MAX_RESOURCE_LIMIT,
    terminal: TERMINAL_STATES.has(
      run.currentState
    )
  };
}

/* ============================================================
   RUN SNAPSHOT
 *
 * One controlled read of the engineering state.
 * No execution occurs here.
============================================================ */

async function getEngineeringSnapshot(runId) {
  const run = await getEngineeringRun(runId);

  if (!run) {
    throw new Error(
      `Engineering run not found: ${runId}`
    );
  }

  const attempts =
    await EngineeringAttempt.find({
      _id: {
        $exists: true
      }
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();

  const runAttempts = run.currentAttemptId
    ? attempts.filter(
        (attempt) =>
          String(attempt._id) ===
          String(run.currentAttemptId)
      )
    : [];

  return {
    run,
    currentAttempt:
      runAttempts[0] || null,
    safety: await getRunSafetyStatus(
      runId
    )
  };
}

/* ============================================================
   PUBLIC CONTRACT
============================================================ */

module.exports = {
  SERVICE_VERSION,
  SCHEMA_VERSION,

  ENGINEERING_STATES,
  ENGINEERING_STATE_VALUES,
  STATE_TRANSITIONS,
  TERMINAL_STATES,

  ENGINEERING_LIMITS,

  FAILURE_CATEGORIES,
  FAILURE_SEVERITIES,
  EXECUTION_TYPES,
  REPAIR_TYPES,
  VERIFICATION_TYPES,

  models: {
    EngineeringRun,
    EngineeringAttempt,
    EngineeringExecution,
    EngineeringFailure,
    EngineeringRepair,
    EngineeringVerification,
    EngineeringArtifact,
    EngineeringResourceEvent,
    EngineeringCheckpoint,
    EngineeringRollback,
    EngineeringFailureSignature,
    EngineeringRepairPattern,
    EngineeringAuditEvent
  },

  createEngineeringRun,
  getEngineeringRun,
  transitionEngineeringState,

  createEngineeringAttempt,
  updateEngineeringAttempt,

  createExecutionRecord,
  completeExecutionRecord,

  createFailureRecord,

  createRepairRecord,

  createVerificationRecord,
  completeVerificationRecord,

  createArtifactRecord,

  createResourceEvent,

  createCheckpoint,

  createRollbackRecord,
  completeRollbackRecord,

  registerFailureSignature,
  registerSuccessfulRepairPattern,
  findSuccessfulRepairPatterns,

  createAuditEvent,

  getRunSafetyStatus,
  getEngineeringSnapshot
};
