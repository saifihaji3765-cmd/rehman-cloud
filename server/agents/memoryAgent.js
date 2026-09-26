/* =========================================================
   ZyrionOS MEMORY AGENT v2.0.0
   Secure User + Project Scoped Memory Management

   Responsibilities:
   - authenticated user-scoped memory
   - project-scoped memory
   - conversations
   - preferences
   - Master Agent integration
   - bounded memory
   - schema normalization
   - atomic persistence
   - corruption protection
   - backup/recovery
   - concurrent-write protection
   - safe filesystem boundaries
   - deterministic helper API

   IMPORTANT:
   - Memory Agent never creates a global memory bucket.
   - User identity is mandatory.
   - Sensitive secret files are never handled here.
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   MEMORY ROOT
========================================================= */

const MEMORY_ROOT =
  path.resolve(
    process.env.ZYRION_MEMORY_DIR ||
      path.join(
        __dirname,
        "../memory"
      )
  );


/* =========================================================
   VERSION
========================================================= */

const MEMORY_VERSION = 2;


/* =========================================================
   LIMITS
========================================================= */

const MAX_CONVERSATIONS =
  100;

const MAX_PROJECTS =
  50;

const MAX_MESSAGE_LENGTH =
  4000;

const MAX_PROJECT_FIELD_LENGTH =
  2000;

const MAX_PREFERENCE_VALUE_LENGTH =
  1000;

const MAX_PREFERENCE_KEY_LENGTH =
  100;

const MAX_MEMORY_FILE_SIZE =
  500000;

const MAX_USER_ID_LENGTH =
  200;

const MAX_PROJECT_ID_LENGTH =
  200;

const MAX_FRAMEWORK_LENGTH =
  200;

const MAX_STATUS_LENGTH =
  100;

const MAX_BACKUP_FILES =
  10;

const MAX_MEMORY_CONTEXT_CONVERSATIONS =
  20;

const MAX_MEMORY_CONTEXT_PROJECTS =
  20;

const MAX_JSON_DEPTH =
  8;


/* =========================================================
   PROCESS LOCKS
========================================================= */

const memoryLocks =
  new Map();


/* =========================================================
   UTILITY: NOW
========================================================= */

function nowISO() {
  return new Date().toISOString();
}


/* =========================================================
   UTILITY: SAFE STRING
========================================================= */

function cleanString(
  value,
  maxLength
) {

  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      maxLength
    );
}


/* =========================================================
   UTILITY: SAFE NUMBER
========================================================= */

function positiveInteger(
  value,
  fallback,
  max
) {

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(parsed),
    max
  );
}


/* =========================================================
   USER ID
========================================================= */

function normalizeUserId(
  user
) {

  const rawId =
    user?.id ??
    user?._id ??
    user?.userId ??
    "";

  const userId =
    cleanString(
      String(rawId),
      MAX_USER_ID_LENGTH
    );

  if (
    !userId
  ) {

    throw new Error(
      "Authenticated user ID required for memory operations"
    );

  }

  /*
   * Filesystem-safe identifier.
   */

  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      userId
    )
  ) {

    throw new Error(
      "Invalid user ID"
    );

  }

  return userId;
}


/* =========================================================
   PROJECT ID
========================================================= */

function normalizeProjectId(
  projectId
) {

  const value =
    cleanString(
      projectId,
      MAX_PROJECT_ID_LENGTH
    );

  if (
    !value
  ) {

    return "";

  }

  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      value
    )
  ) {

    throw new Error(
      "Invalid project ID"
    );

  }

  return value;
}


/* =========================================================
   PREFERENCE KEY
========================================================= */

function normalizePreferenceKey(
  key
) {

  const cleanKey =
    cleanString(
      key,
      MAX_PREFERENCE_KEY_LENGTH
    );

  if (
    !cleanKey
  ) {

    throw new Error(
      "Preference key required"
    );

  }

  if (
    !/^[a-zA-Z0-9_.-]+$/.test(
      cleanKey
    )
  ) {

    throw new Error(
      "Invalid preference key"
    );

  }

  return cleanKey;
}


/* =========================================================
   EMPTY MEMORY
========================================================= */

function createEmptyMemory(
  userId
) {

  return {

    version:
      MEMORY_VERSION,

    userId,

    conversations:
      [],

    projects:
      [],

    preferences:
      {},

    createdAt:
      nowISO(),

    updatedAt:
      nowISO()

  };

}


/* =========================================================
   USER LOCK
========================================================= */

async function withUserLock(
  userId,
  operation
) {

  const previous =
    memoryLocks.get(
      userId
    ) ||
    Promise.resolve();


  let release;


  const current =
    new Promise(
      (resolve) => {

        release =
          resolve;

      }
    );


  const queued =
    previous.then(
      () => current
    );


  memoryLocks.set(
    userId,
    queued
  );


  try {

    await previous;

    return await operation();

  }

  finally {

    release();


    const active =
      memoryLocks.get(
        userId
      );


    if (
      active ===
      queued
    ) {

      memoryLocks.delete(
        userId
      );

    }

  }

}


/* =========================================================
   MEMORY ROOT
========================================================= */

function ensureMemoryRoot() {

  if (
    fs.existsSync(
      MEMORY_ROOT
    )
  ) {

    const stat =
      fs.lstatSync(
        MEMORY_ROOT
      );


    if (
      stat.isSymbolicLink()
    ) {

      throw new Error(
        "Memory root cannot be a symbolic link"
      );

    }


    if (
      !stat.isDirectory()
    ) {

      throw new Error(
        "Memory root is not a directory"
      );

    }


    return MEMORY_ROOT;

  }


  fs.mkdirSync(
    MEMORY_ROOT,
    {
      recursive:
        true
    }
  );


  return MEMORY_ROOT;

}


/* =========================================================
   USER MEMORY DIRECTORY
========================================================= */

function getUserMemoryDirectory(
  userId
) {

  const root =
    path.resolve(
      MEMORY_ROOT
    );

  const directory =
    path.resolve(
      root,
      userId
    );


  if (
    directory !== root &&
    !directory.startsWith(
      root +
      path.sep
    )
  ) {

    throw new Error(
      "Memory path escapes memory root"
    );

  }


  return directory;

}


/* =========================================================
   MEMORY FILE
========================================================= */

function getMemoryFile(
  userId
) {

  return path.join(
    getUserMemoryDirectory(
      userId
    ),
    "memory.json"
  );

}


/* =========================================================
   ENSURE USER DIRECTORY
========================================================= */

function ensureUserMemoryDirectory(
  userId
) {

  ensureMemoryRoot();


  const directory =
    getUserMemoryDirectory(
      userId
    );


  if (
    fs.existsSync(
      directory
    )
  ) {

    const stat =
      fs.lstatSync(
        directory
      );


    if (
      stat.isSymbolicLink()
    ) {

      throw new Error(
        "User memory directory cannot be a symbolic link"
      );

    }


    if (
      !stat.isDirectory()
    ) {

      throw new Error(
        "User memory path is not a directory"
      );

    }

  }

  else {

    fs.mkdirSync(
      directory,
      {
        recursive:
          true
      }
    );

  }


  return directory;

}


/* =========================================================
   SYMBOLIC LINK CHECK
========================================================= */

function ensureRegularFile(
  filePath
) {

  const stat =
    fs.lstatSync(
      filePath
    );


  if (
    stat.isSymbolicLink()
  ) {

    throw new Error(
      "Memory file cannot be a symbolic link"
    );

  }


  if (
    !stat.isFile()
  ) {

    throw new Error(
      "Memory path is not a regular file"
    );

  }


  return stat;

}


/* =========================================================
   JSON DEPTH
========================================================= */

function getObjectDepth(
  value,
  depth = 0
) {

  if (
    depth >
    MAX_JSON_DEPTH
  ) {

    return depth;

  }

  if (
    value === null ||
    typeof value !== "object"
  ) {

    return depth;

  }

  if (
    Array.isArray(value)
  ) {

    let max =
      depth;

    for (
      const item of value
    ) {

      max =
        Math.max(
          max,
          getObjectDepth(
            item,
            depth + 1
          )
        );

    }

    return max;

  }

  let max =
    depth;


  for (
    const key of Object.keys(
      value
    )
  ) {

    max =
      Math.max(
        max,
        getObjectDepth(
          value[key],
          depth + 1
        )
      );

  }

  return max;

}


/* =========================================================
   PREFERENCE SANITIZATION
========================================================= */

function sanitizePreferenceValue(
  value
) {

  if (
    typeof value ===
    "string"
  ) {

    return value.slice(
      0,
      MAX_PREFERENCE_VALUE_LENGTH
    );

  }


  if (
    typeof value ===
    "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : null;

  }


  if (
    typeof value ===
    "boolean"
  ) {

    return value;

  }


  if (
    value === null
  ) {

    return null;

  }


  try {

    if (
      getObjectDepth(value) >
      MAX_JSON_DEPTH
    ) {

      return "";

    }


    const serialized =
      JSON.stringify(
        value
      );


    return serialized
      .slice(
        0,
        MAX_PREFERENCE_VALUE_LENGTH
      );

  }

  catch {

    return "";

  }

}


/* =========================================================
   CONVERSATION SANITIZATION
========================================================= */

function sanitizeConversation(
  message
) {

  let role =
    "user";

  let content =
    "";


  if (
    message &&
    typeof message ===
      "object"
  ) {

    role =
      cleanString(
        message.role ||
          "user",
        30
      );


    content =
      cleanString(
        message.message ||
          message.content ||
          "",
        MAX_MESSAGE_LENGTH
      );

  }

  else {

    content =
      cleanString(
        String(
          message ??
            ""
        ),
        MAX_MESSAGE_LENGTH
      );

  }


  const allowedRoles =
    new Set([
      "user",
      "assistant",
      "system",
      "tool"
    ]);


  if (
    !allowedRoles.has(
      role
    )
  ) {

    role =
      "user";

  }


  return {

    role,

    message:
      content,

    timestamp:
      cleanString(
        message?.timestamp ||
          "",
        100
      ) ||
      nowISO()

  };

}


/* =========================================================
   PROJECT SANITIZATION
========================================================= */

function sanitizeProject(
  project
) {

  if (
    !project ||
    typeof project !==
      "object"
  ) {

    throw new Error(
      "Project memory object required"
    );

  }


  const projectId =
    normalizeProjectId(
      project.projectId ||
        project.id ||
        project._id ||
        ""
    );


  return {

    projectId:
      projectId ||
      null,

    projectName:
      cleanString(
        project.projectName ||
          project.name ||
          "",
        MAX_PROJECT_FIELD_LENGTH
      ),

    description:
      cleanString(
        project.description ||
          "",
        MAX_PROJECT_FIELD_LENGTH
      ),

    framework:
      cleanString(
        project.framework ||
          "",
        MAX_FRAMEWORK_LENGTH
      ),

    status:
      cleanString(
        project.status ||
          "",
        MAX_STATUS_LENGTH
      ),

    deploymentStatus:
      cleanString(
        project.deploymentStatus ||
          "",
        MAX_STATUS_LENGTH
      ),

    timestamp:
      nowISO(),

    updatedAt:
      nowISO()

  };

}


/* =========================================================
   NORMALIZE MEMORY
========================================================= */

function normalizeMemory(
  memory,
  userId
) {

  const source =
    (
      memory &&
      typeof memory ===
        "object" &&
      !Array.isArray(memory)
    )
      ? memory
      : {};


  const rawConversations =
    Array.isArray(
      source.conversations
    )
      ? source.conversations
      : [];


  const conversations =
    rawConversations
      .map(
        sanitizeConversation
      )
      .filter(
        (item) =>
          Boolean(
            item.message
          )
      )
      .slice(
        -MAX_CONVERSATIONS
      );


  const rawProjects =
    Array.isArray(
      source.projects
    )
      ? source.projects
      : [];


  const projects =
    rawProjects
      .filter(
        (item) =>
          item &&
          typeof item ===
            "object"
      )
      .map(
        (item) => {

          try {

            return sanitizeProject(
              item
            );

          }

          catch {

            return null;

          }

        }
      )
      .filter(
        Boolean
      )
      .slice(
        -MAX_PROJECTS
      );


  const rawPreferences =
    (
      source.preferences &&
      typeof source.preferences ===
        "object" &&
      !Array.isArray(
        source.preferences
      )
    )
      ? source.preferences
      : {};


  const preferences = {};


  for (
    const [
      key,
      value
    ] of Object.entries(
      rawPreferences
    )
  ) {

    try {

      const normalizedKey =
        normalizePreferenceKey(
          key
        );


      preferences[
        normalizedKey
      ] =
        sanitizePreferenceValue(
          value
        );

    }

    catch {

      /*
       * Ignore malformed preference
       * keys instead of breaking the
       * entire memory file.
       */

    }

  }


  return {

    version:
      MEMORY_VERSION,

    userId,

    conversations,

    projects,

    preferences,

    createdAt:
      cleanString(
        source.createdAt ||
          "",
        100
      ) ||
      nowISO(),

    updatedAt:
      cleanString(
        source.updatedAt ||
          "",
        100
      ) ||
      nowISO()

  };

}


/* =========================================================
   BACKUP CORRUPTED MEMORY
========================================================= */

function backupCorruptedMemory(
  memoryFile
) {

  const directory =
    path.dirname(
      memoryFile
    );


  const baseName =
    path.basename(
      memoryFile
    );


  const backupPath =
    path.join(
      directory,
      `${baseName}.corrupt-${Date.now()}-${crypto
        .randomBytes(4)
        .toString("hex")}`
    );


  try {

    fs.renameSync(
      memoryFile,
      backupPath
    );


    logger.warning(
      `Corrupted memory backed up: ${backupPath}`
    );


    cleanupOldBackups(
      directory,
      baseName
    );


    return backupPath;

  }

  catch (error) {

    logger.error(
      `Corrupted memory backup failed: ${error.message}`
    );


    return null;

  }

}


/* =========================================================
   CLEAN OLD BACKUPS
========================================================= */

function cleanupOldBackups(
  directory,
  baseName
) {

  try {

    const files =
      fs.readdirSync(
        directory
      )
      .filter(
        (file) =>
          file.startsWith(
            `${baseName}.corrupt-`
          )
      )
      .map(
        (file) => {

          const fullPath =
            path.join(
              directory,
              file
            );


          let stat;

          try {

            stat =
              fs.statSync(
                fullPath
              );

          }

          catch {

            return null;

          }


          return {

            file,
            mtime:
              stat.mtimeMs

          };

        }
      )
      .filter(
        Boolean
      )
      .sort(
        (a, b) =>
          b.mtime -
          a.mtime
      );


    const stale =
      files.slice(
        MAX_BACKUP_FILES
      );


    for (
      const item of stale
    ) {

      try {

        fs.unlinkSync(
          path.join(
            directory,
            item.file
          )
        );

      }

      catch {

        /*
         * Cleanup failure must never
         * break memory operations.
         */

      }

    }

  }

  catch {

    /*
     * Best-effort cleanup.
     */

  }

}


/* =========================================================
   LOAD MEMORY
========================================================= */

function loadMemory(
  userId
) {

  const memoryFile =
    getMemoryFile(
      userId
    );


  ensureUserMemoryDirectory(
    userId
  );


  /*
   * Missing memory gets created.
   */

  if (
    !fs.existsSync(
      memoryFile
    )
  ) {

    const empty =
      createEmptyMemory(
        userId
      );


    const saved =
      saveMemory(
        userId,
        empty
      );


    if (
      !saved.success
    ) {

      throw new Error(
        saved.error ||
          "Unable to initialize memory"
      );

    }


    return empty;

  }


  const stat =
    ensureRegularFile(
      memoryFile
    );


  if (
    stat.size >
    MAX_MEMORY_FILE_SIZE
  ) {

    throw new Error(
      "Memory file exceeds maximum allowed size"
    );

  }


  let raw;


  try {

    raw =
      fs.readFileSync(
        memoryFile,
        "utf8"
      );

  }

  catch (error) {

    throw new Error(
      `Unable to read memory: ${error.message}`
    );

  }


  try {

    const parsed =
      JSON.parse(
        raw
      );


    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {

      throw new Error(
        "Invalid memory structure"
      );

    }


    /*
     * The stored userId must not silently
     * belong to another user.
     */

    if (
      parsed.userId &&
      String(
        parsed.userId
      ) !==
        String(userId)
    ) {

      throw new Error(
        "Memory user identity mismatch"
      );

    }


    return normalizeMemory(
      parsed,
      userId
    );

  }

  catch (error) {

    backupCorruptedMemory(
      memoryFile
    );


    throw new Error(
      `Memory data is corrupted and requires recovery: ${error.message}`
    );

  }

}


/* =========================================================
   ATOMIC SAVE
========================================================= */

function saveMemory(
  userId,
  data
) {

  try {

    const directory =
      ensureUserMemoryDirectory(
        userId
      );


    const memoryFile =
      getMemoryFile(
        userId
      );


    const normalized =
      normalizeMemory(
        data,
        userId
      );


    const serialized =
      JSON.stringify(
        normalized,
        null,
        2
      );


    const byteSize =
      Buffer.byteLength(
        serialized,
        "utf8"
      );


    if (
      byteSize >
      MAX_MEMORY_FILE_SIZE
    ) {

      return {

        success:
          false,

        error:
          "Memory size limit exceeded"

      };

    }


    const temporaryFile =
      path.join(
        directory,
        `.memory-${process.pid}-${Date.now()}-${crypto
          .randomBytes(4)
          .toString("hex")}.tmp`
      );


    try {

      fs.writeFileSync(
        temporaryFile,
        serialized,
        {
          encoding:
            "utf8",
          flag:
            "wx",
          mode:
            0o600
        }
      );


      /*
       * Verify temporary file before
       * replacing the live memory.
       */

      const written =
        fs.readFileSync(
          temporaryFile,
          "utf8"
        );


      if (
        written !==
        serialized
      ) {

        throw new Error(
          "Memory temporary file verification failed"
        );

      }


      /*
       * Rename within same filesystem.
       */

      fs.renameSync(
        temporaryFile,
        memoryFile
      );


      return {

        success:
          true,

        userId,

        version:
          MEMORY_VERSION,

        updatedAt:
          normalized.updatedAt

      };

    }

    catch (error) {

      try {

        if (
          fs.existsSync(
            temporaryFile
          )
        ) {

          fs.unlinkSync(
            temporaryFile
          );

        }

      }

      catch (cleanupError) {

        logger.warning(
          `Memory temporary file cleanup failed: ${cleanupError.message}`
        );

      }


      return {

        success:
          false,

        error:
          error.message

      };

    }

  }

  catch (error) {

    return {

      success:
        false,

      error:
        error.message

    };

  }

}


/* =========================================================
   ADD CONVERSATION
========================================================= */

async function addConversation(
  user,
  message
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    return await withUserLock(
      userId,
      async () => {

        const memory =
          loadMemory(
            userId
          );


        const conversation =
          sanitizeConversation(
            message
          );


        if (
          !conversation.message
        ) {

          return {

            success:
              false,

            error:
              "Conversation message required"

          };

        }


        memory.conversations.push(
          conversation
        );


        memory.conversations =
          memory.conversations.slice(
            -MAX_CONVERSATIONS
          );


        memory.updatedAt =
          nowISO();


        const saved =
          saveMemory(
            userId,
            memory
          );


        if (
          !saved.success
        ) {

          return saved;

        }


        return {

          success:
            true,

          userId,

          conversation

        };

      }
    );

  }

  catch (error) {

    logger.error(
      `Memory conversation save failed: ${error.message}`
    );


    return {

      success:
        false,

      error:
        error.message

    };

  }

}


/* =========================================================
   SAVE PROJECT MEMORY
========================================================= */

async function saveProjectMemory(
  user,
  project
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    const cleanProject =
      sanitizeProject(
        project
      );


    return await withUserLock(
      userId,
      async () => {

        const memory =
          loadMemory(
            userId
          );


        const projectId =
          cleanProject.projectId;


        const existingIndex =
          projectId
            ? memory.projects.findIndex(
                (item) =>
                  item &&
                  item.projectId ===
                    projectId
              )
            : -1;


        if (
          existingIndex >= 0
        ) {

          const previous =
            memory.projects[
              existingIndex
            ];


          memory.projects[
            existingIndex
          ] = {

            ...previous,

            ...cleanProject,

            createdAt:
              previous.createdAt ||
              cleanProject.timestamp,

            updatedAt:
              nowISO()

          };

        }

        else {

          memory.projects.push(
            cleanProject
          );

        }


        memory.projects =
          memory.projects.slice(
            -MAX_PROJECTS
          );


        memory.updatedAt =
          nowISO();


        const saved =
          saveMemory(
            userId,
            memory
          );


        if (
          !saved.success
        ) {

          return saved;

        }


        return {

          success:
            true,

          userId,

          project:
            cleanProject

        };

      }
    );

  }

  catch (error) {

    logger.error(
      `Project memory save failed: ${error.message}`
    );


    return {

      success:
        false,

      error:
        error.message

    };

  }

}


/* =========================================================
   SET PREFERENCE
========================================================= */

async function setPreference(
  user,
  key,
  value
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    const cleanKey =
      normalizePreferenceKey(
        key
      );


    const cleanValue =
      sanitizePreferenceValue(
        value
      );


    return await withUserLock(
      userId,
      async () => {

        const memory =
          loadMemory(
            userId
          );


        memory.preferences[
          cleanKey
        ] =
          cleanValue;


        memory.updatedAt =
          nowISO();


        const saved =
          saveMemory(
            userId,
            memory
          );


        if (
          !saved.success
        ) {

          return saved;

        }


        return {

          success:
            true,

          userId,

          key:
            cleanKey,

          value:
            cleanValue

        };

      }
    );

  }

  catch (error) {

    logger.error(
      `Preference save failed: ${error.message}`
    );


    return {

      success:
        false,

      error:
        error.message

    };

  }

}


/* =========================================================
   GET MEMORY
========================================================= */

async function getMemory(
  user
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    /*
     * Reads don't mutate memory.
     * They still use the same filesystem
     * validation path.
     */

    const memory =
      loadMemory(
        userId
      );


    return {

      success:
        true,

      userId,

      data:
        memory

    };

  }

  catch (error) {

    logger.error(
      `Memory load failed: ${error.message}`
    );


    return {

      success:
        false,

      error:
        error.message

    };

  }

}


/* =========================================================
   GET PROJECT MEMORY
========================================================= */

async function getProjectMemory(
  user,
  projectId
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    const cleanProjectId =
      normalizeProjectId(
        projectId
      );


    if (
      !cleanProjectId
    ) {

      return {

        success:
          false,

        error:
          "Project ID required"

      };

    }


    const memory =
      loadMemory(
        userId
      );


    const project =
      memory.projects.find(
        (item) =>
          item &&
          item.projectId ===
            cleanProjectId
      ) ||
      null;


    return {

      success:
        true,

      userId,

      projectId:
        cleanProjectId,

      project

    };

  }

  catch (error) {

    logger.error(
      `Project memory load failed: ${error.message}`
    );


    return {

      success:
        false,

      error:
        error.message,

      project:
        null

    };

  }

}


/* =========================================================
   GET MEMORY CONTEXT
========================================================= */

async function getMemoryContext(
  user,
  options = {}
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    const memory =
      loadMemory(
        userId
      );


    const conversationLimit =
      positiveInteger(
        options.conversationLimit,
        10,
        MAX_MEMORY_CONTEXT_CONVERSATIONS
      );


    const projectLimit =
      positiveInteger(
        options.projectLimit,
        10,
        MAX_MEMORY_CONTEXT_PROJECTS
      );


    const projectId =
      normalizeProjectId(
        options.projectId ||
          ""
      );


    let projects =
      memory.projects.slice(
        -projectLimit
      );


    /*
     * When Master Agent is working on a
     * specific project, put that project
     * first in context.
     */

    if (
      projectId
    ) {

      const selectedIndex =
        projects.findIndex(
          (item) =>
            item &&
            item.projectId ===
              projectId
        );


      if (
        selectedIndex > 0
      ) {

        const [
          selected
        ] =
          projects.splice(
            selectedIndex,
            1
          );


        projects.unshift(
          selected
        );

      }

    }


    return {

      success:
        true,

      userId,

      conversations:
        memory.conversations.slice(
          -conversationLimit
        ),

      projects,

      preferences:
        memory.preferences,

      updatedAt:
        memory.updatedAt,

      version:
        memory.version

    };

  }

  catch (error) {

    logger.error(
      `Memory context failed: ${error.message}`
    );


    return {

      success:
        false,

      error:
        error.message,

      conversations:
        [],

      projects:
        [],

      preferences:
        {}

    };

  }

}


/* =========================================================
   MASTER AGENT MEMORY ENTRY
========================================================= */

async function memoryAgent(
  input = {}
) {

  let user = {};

  let prompt = "";

  let project = null;

  let projectId = "";


  try {

    /*
     * Supported:
     *
     * memoryAgent({
     *   prompt,
     *   user,
     *   project,
     *   projectId
     * })
     *
     * OR:
     *
     * memoryAgent("hello")
     *
     * The string form still requires
     * authenticated user information,
     * so it is mainly compatibility support.
     */

    if (
      typeof input ===
      "string"
    ) {

      prompt =
        cleanString(
          input,
          MAX_MESSAGE_LENGTH
        );

    }

    else if (
      input &&
      typeof input ===
      "object"
    ) {

      user =
        input.user ||
        {};

      prompt =
        cleanString(
          input.prompt ||
            input.message ||
            "",
          MAX_MESSAGE_LENGTH
        );

      project =
        input.project ||
        null;

      projectId =
        normalizeProjectId(
          input.projectId ||
            project?.projectId ||
            project?.id ||
            project?._id ||
            ""
        );

    }


    /*
     * User identity is mandatory.
     */

    const userId =
      normalizeUserId(
        user
      );


    /*
     * Save conversation.
     */

    if (
      prompt
    ) {

      const conversationResult =
        await addConversation(
          user,
          {
            role:
              "user",
            message:
              prompt
          }
        );


      if (
        !conversationResult.success
      ) {

        return {

          success:
            false,

          userId,

          message:
            "Unable to save conversation",

          error:
            conversationResult.error,

          data: {

            conversations:
              [],

            projects:
              [],

            preferences:
              {}

          }

        };

      }

    }


    /*
     * Save project context.
     */

    if (
      project &&
      typeof project ===
        "object"
    ) {

      const projectResult =
        await saveProjectMemory(
          user,
          {
            ...project,

            projectId:
              projectId ||
              project.projectId ||
              project.id ||
              project._id
          }
        );


      if (
        !projectResult.success
      ) {

        return {

          success:
            false,

          userId,

          message:
            "Unable to save project memory",

          error:
            projectResult.error,

          data: {

            conversations:
              [],

            projects:
              [],

            preferences:
              {}

          }

        };

      }

    }


    /*
     * Compact memory context for Master.
     */

    const context =
      await getMemoryContext(
        user,
        {

          conversationLimit:
            10,

          projectLimit:
            10,

          projectId

        }
      );


    if (
      !context.success
    ) {

      return {

        success:
          false,

        userId,

        message:
          "Unable to build memory context",

        error:
          context.error,

        data: {

          conversations:
            [],

          projects:
            [],

          preferences:
            {}

        }

      };

    }


    logger.success(
      `Memory Agent Completed for user ${userId}`
    );


    return {

      success:
        true,

      userId,

      data:
        context,

      context

    };

  }

  catch (error) {

    logger.error(
      `Memory Agent Failed: ${error.message}`
    );


    return {

      success:
        false,

      message:
        "Memory Agent Failed",

      error:
        error.message,

      data: {

        conversations:
          [],

        projects:
          [],

        preferences:
          {}

      }

    };

  }

}


/* =========================================================
   CLEAR USER MEMORY
========================================================= */

async function clearMemory(
  user
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    return await withUserLock(
      userId,
      async () => {

        const memoryFile =
          getMemoryFile(
            userId
          );


        /*
         * Backup current memory before
         * destructive operation.
         */

        if (
          fs.existsSync(
            memoryFile
          )
        ) {

          ensureRegularFile(
            memoryFile
          );


          const directory =
            path.dirname(
              memoryFile
            );


          const backupPath =
            path.join(
              directory,
              `memory.clear-backup-${Date.now()}-${crypto
                .randomBytes(4)
                .toString("hex")}.json`
            );


          fs.copyFileSync(
            memoryFile,
            backupPath
          );


          /*
           * Remove only after successful
           * backup.
           */

          fs.unlinkSync(
            memoryFile
          );

        }


        const freshMemory =
          createEmptyMemory(
            userId
          );


        const saved =
          saveMemory(
            userId,
            freshMemory
          );


        if (
          !saved.success
        ) {

          return saved;

        }


        logger.success(
          `Memory Cleared for user ${userId}`
        );


        return {

          success:
            true,

          userId

        };

      }
    );

  }

  catch (error) {

    logger.error(
      `Memory clear failed: ${error.message}`
    );


    return {

      success:
        false,

      error:
        error.message

    };

  }

}


/* =========================================================
   MEMORY HEALTH
========================================================= */

async function getMemoryHealth(
  user
) {

  try {

    const userId =
      normalizeUserId(
        user
      );


    const memoryFile =
      getMemoryFile(
        userId
      );


    if (
      !fs.existsSync(
        memoryFile
      )
    ) {

      return {

        success:
          true,

        healthy:
          true,

        exists:
          false,

        userId

      };

    }


    const stat =
      ensureRegularFile(
        memoryFile
      );


    if (
      stat.size >
      MAX_MEMORY_FILE_SIZE
    ) {

      return {

        success:
          true,

        healthy:
          false,

        exists:
          true,

        userId,

        size:
          stat.size,

        error:
          "Memory file exceeds maximum allowed size"

      };

    }


    const memory =
      loadMemory(
        userId
      );


    return {

      success:
        true,

      healthy:
        true,

      exists:
        true,

      userId,

      version:
        memory.version,

      conversations:
        memory.conversations.length,

      projects:
        memory.projects.length,

      preferences:
        Object.keys(
          memory.preferences
        ).length,

      size:
        stat.size,

      updatedAt:
        memory.updatedAt

    };

  }

  catch (error) {

    return {

      success:
        false,

      healthy:
        false,

      error:
        error.message

    };

  }

}


/* =========================================================
   EXPORT COMPATIBILITY
========================================================= */

memoryAgent.addConversation =
  addConversation;


memoryAgent.saveProjectMemory =
  saveProjectMemory;


memoryAgent.setPreference =
  setPreference;


memoryAgent.getMemory =
  getMemory;


memoryAgent.getProjectMemory =
  getProjectMemory;


memoryAgent.getMemoryContext =
  getMemoryContext;


memoryAgent.clearMemory =
  clearMemory;


memoryAgent.getMemoryHealth =
  getMemoryHealth;


memoryAgent.loadMemory =
  loadMemory;


memoryAgent.saveMemory =
  saveMemory;


/* =========================================================
   INTERNAL HELPERS EXPORT
========================================================= */

memoryAgent.normalizeUserId =
  normalizeUserId;


memoryAgent.normalizeProjectId =
  normalizeProjectId;


memoryAgent.createEmptyMemory =
  createEmptyMemory;


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  memoryAgent;
