/* =========================================================
   ZyrionOS MEMORY AGENT
   Secure User-Scoped Memory Management

   Responsibilities:
   - user-scoped conversations
   - user-scoped project memory
   - user-scoped preferences
   - Master Agent integration
   - bounded memory
   - atomic persistence
   - corruption protection
   - concurrent-write protection
========================================================= */


/* =========================
   PACKAGES
========================= */

const fs =
  require("fs");

const path =
  require("path");


/* =========================
   SERVICES
========================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   MEMORY ROOT
========================================================= */

/*
 * MEMORY_ROOT can be configured through
 * environment variables.

 * Default:
 * server/memory
 */

const MEMORY_ROOT =
  path.resolve(

    process.env.ZYRION_MEMORY_DIR ||
    path.join(
      __dirname,
      "../memory"
    )

  );


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

const MAX_MEMORY_FILE_SIZE =
  500000;

const MAX_PROJECT_ID_LENGTH =
  200;

const MAX_USER_ID_LENGTH =
  200;


/* =========================================================
   DEFAULT MEMORY
========================================================= */

function createEmptyMemory(
  userId
) {

  return {

    version:
      1,

    userId,

    conversations:
      [],

    projects:
      [],

    preferences:
      {},

    updatedAt:
      new Date().toISOString()

  };

}


/* =========================================================
   IN-PROCESS LOCKS
========================================================= */

/*
 * Prevent concurrent writes for the
 * same user inside this Node process.
 */

const memoryLocks =
  new Map();


async function withUserLock(
  userId,
  operation
) {

  const previous =
    memoryLocks.get(
      userId
    ) || Promise.resolve();


  let release;


  const current =
    new Promise(
      (resolve) => {

        release =
          resolve;

      }
    );


  memoryLocks.set(
    userId,
    previous.then(
      () => current
    )
  );


  try {

    await previous;

    return await operation();

  }

  finally {

    release();


    /*
     * Remove only if this is still
     * the active lock.
     */

    const active =
      memoryLocks.get(
        userId
      );


    if (
      active ===
      current
    ) {

      memoryLocks.delete(
        userId
      );

    }

  }

}


/* =========================================================
   SAFE STRING
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
   USER ID VALIDATION
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
   * Filesystem-safe user identifier.
   *
   * This prevents:
   * ../
   * absolute paths
   * slash traversal
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
   PROJECT ID VALIDATION
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
   MEMORY DIRECTORY
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


    return;

  }


  fs.mkdirSync(
    MEMORY_ROOT,
    {
      recursive:
        true
    }
  );

}


/* =========================================================
   USER MEMORY DIRECTORY
========================================================= */

function getUserMemoryDirectory(
  userId
) {

  const userDirectory =
    path.resolve(
      MEMORY_ROOT,
      userId
    );


  const memoryRoot =
    path.resolve(
      MEMORY_ROOT
    );


  if (
    userDirectory !==
      memoryRoot &&

    !userDirectory.startsWith(
      memoryRoot +
      path.sep
    )
  ) {

    throw new Error(
      "Memory path escapes memory root"
    );

  }


  return userDirectory;

}


/* =========================================================
   USER MEMORY FILE
========================================================= */

function getMemoryFile(
  userId
) {

  const userDirectory =
    getUserMemoryDirectory(
      userId
    );


  return path.join(
    userDirectory,
    "memory.json"
  );

}


/* =========================================================
   ENSURE USER MEMORY DIRECTORY
========================================================= */

function ensureUserMemoryDirectory(
  userId
) {

  ensureMemoryRoot();


  const userDirectory =
    getUserMemoryDirectory(
      userId
    );


  if (
    fs.existsSync(
      userDirectory
    )
  ) {

    const stat =
      fs.lstatSync(
        userDirectory
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
      userDirectory,
      {
        recursive:
          true
      }
    );

  }


  return userDirectory;

}


/* =========================================================
   NORMALIZE MEMORY
========================================================= */

function normalizeMemory(
  memory,
  userId
) {

  const normalized =
    (
      memory &&
      typeof memory ===
        "object"
    )
      ? memory
      : {};


  const conversations =
    Array.isArray(
      normalized.conversations
    )
      ? normalized.conversations
      : [];


  const projects =
    Array.isArray(
      normalized.projects
    )
      ? normalized.projects
      : [];


  const preferences =
    (
      normalized.preferences &&
      typeof normalized.preferences ===
        "object" &&
      !Array.isArray(
        normalized.preferences
      )
    )
      ? normalized.preferences
      : {};


  return {

    version:
      1,

    userId,

    conversations:
      conversations.slice(
        -MAX_CONVERSATIONS
      ),

    projects:
      projects.slice(
        -MAX_PROJECTS
      ),

    preferences,

    updatedAt:
      normalized.updatedAt ||
      new Date().toISOString()

  };

}


/* =========================================================
   SAFE LOAD MEMORY
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
   * Create memory file if missing.
   */

  if (
    !fs.existsSync(
      memoryFile
    )
  ) {

    const emptyMemory =
      createEmptyMemory(
        userId
      );


    saveMemory(
      userId,
      emptyMemory
    );


    return emptyMemory;

  }


  const stat =
    fs.lstatSync(
      memoryFile
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


    return normalizeMemory(
      parsed,
      userId
    );

  }

  catch (error) {

    /*
     * Do NOT silently destroy/reset
     * corrupted user memory.
     */

    const backupPath =
      `${memoryFile}.corrupt-${Date.now()}`;


    try {

      fs.renameSync(
        memoryFile,
        backupPath
      );

      logger.warning(
        `Corrupted memory moved to backup for user ${userId}`
      );

    }

    catch (backupError) {

      logger.error(
        `Memory corruption backup failed: ${backupError.message}`
      );

    }


    throw new Error(
      "Memory data is corrupted and requires recovery"
    );

  }

}


/* =========================================================
   ATOMIC SAVE MEMORY
========================================================= */

function saveMemory(
  userId,
  data
) {

  const userDirectory =
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

      userDirectory,

      `.memory-${process.pid}-${Date.now()}.tmp`

    );


  try {

    fs.writeFileSync(

      temporaryFile,

      serialized,

      {

        encoding:
          "utf8",

        flag:
          "wx"

      }

    );


    /*
     * Rename is atomic on the same
     * filesystem in normal Node.js
     * deployments.
     */

    fs.renameSync(
      temporaryFile,
      memoryFile
    );


    return {

      success:
        true

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


/* =========================================================
   SANITIZE CONVERSATION
========================================================= */

function sanitizeConversation(
  message
) {

  if (
    typeof message ===
    "object" &&
    message !== null
  ) {

    return {

      role:
        cleanString(
          message.role ||
          "user",
          30
        ),

      message:
        cleanString(
          message.message ||
          message.content ||
          "",
          MAX_MESSAGE_LENGTH
        ),

      timestamp:
        message.timestamp ||
        new Date().toISOString()

    };

  }


  return {

    role:
      "user",

    message:
      cleanString(
        message,
        MAX_MESSAGE_LENGTH
      ),

    timestamp:
      new Date().toISOString()

  };

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


        if (
          memory.conversations.length >
          MAX_CONVERSATIONS
        ) {

          memory.conversations =
            memory.conversations.slice(
              -MAX_CONVERSATIONS
            );

        }


        memory.updatedAt =
          new Date().toISOString();


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


    if (
      !project ||
      typeof project !==
        "object"
    ) {

      return {

        success:
          false,

        error:
          "Project memory object required"

      };

    }


    return await withUserLock(
      userId,
      async () => {

        const memory =
          loadMemory(
            userId
          );


        const projectId =
          normalizeProjectId(
            project.projectId ||
            project.id ||
            project._id ||
            ""
          );


        const cleanProject = {

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
              200
            ),

          status:
            cleanString(
              project.status ||
              "",
              100
            ),

          deploymentStatus:
            cleanString(
              project.deploymentStatus ||
              "",
              100
            ),

          timestamp:
            new Date().toISOString()

        };


        /*
         * If projectId exists, update the
         * existing project memory instead
         * of creating endless duplicates.
         */

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

          memory.projects[
            existingIndex
          ] = {

            ...memory.projects[
              existingIndex
            ],

            ...cleanProject,

            updatedAt:
              new Date().toISOString()

          };

        }

        else {

          memory.projects.push(
            cleanProject
          );

        }


        if (
          memory.projects.length >
          MAX_PROJECTS
        ) {

          memory.projects =
            memory.projects.slice(
              -MAX_PROJECTS
            );

        }


        memory.updatedAt =
          new Date().toISOString();


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
      cleanString(
        key,
        100
      );


    if (
      !cleanKey
    ) {

      return {

        success:
          false,

        error:
          "Preference key required"

      };

    }


    if (
      !/^[a-zA-Z0-9_.-]+$/.test(
        cleanKey
      )
    ) {

      return {

        success:
          false,

        error:
          "Invalid preference key"

      };

    }


    let cleanValue =
      value;


    if (
      typeof value ===
        "string"
    ) {

      cleanValue =
        value.slice(
          0,
          MAX_PREFERENCE_VALUE_LENGTH
        );

    }

    else if (
      typeof value !==
        "number" &&

      typeof value !==
        "boolean" &&

      value !==
        null
    ) {

      /*
       * Keep preferences simple and
       * predictable.
       */

      cleanValue =
        JSON.stringify(
          value
        )
          .slice(
            0,
            MAX_PREFERENCE_VALUE_LENGTH
          );

    }


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
          new Date().toISOString();


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
   GET MEMORY CONTEXT
========================================================= */

/*
 * Smaller context for Master Agent.
 *
 * We don't need to send unlimited
 * historical memory into OpenAI.
 */

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
      Math.min(

        Number(
          options.conversationLimit
        ) || 10,

        20

      );


    const projectLimit =
      Math.min(

        Number(
          options.projectLimit
        ) || 10,

        20

      );


    return {

      success:
        true,

      userId,

      conversations:
        memory.conversations.slice(
          -conversationLimit
        ),

      projects:
        memory.projects.slice(
          -projectLimit
        ),

      preferences:
        memory.preferences,

      updatedAt:
        memory.updatedAt

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


  try {

    /*
     * Master Agent contract:
     *
     * memoryAgent({
     *   prompt,
     *   user,
     *   project,
     *   projectId
     * })
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
        input.user || {};

      prompt =
        cleanString(
          input.prompt ||
          "",
          MAX_MESSAGE_LENGTH
        );

      project =
        input.project ||
        null;

    }


    /*
     * Require user identity.
     * Never fall back to one global
     * memory bucket.
     */

    const userId =
      normalizeUserId(
        user
      );


    /*
     * Save current conversation only
     * when an actual prompt exists.
     */

    if (
      prompt
    ) {

      await addConversation(
        user,
        {

          role:
            "user",

          message:
            prompt

        }
      );

    }


    /*
     * Save project context if supplied.
     */

    if (
      project &&
      typeof project ===
        "object"
    ) {

      await saveProjectMemory(
        user,
        project
      );

    }


    /*
     * Return compact context for the
     * downstream Master AI response.
     */

    const context =
      await getMemoryContext(
        user,
        {

          conversationLimit:
            10,

          projectLimit:
            10

        }
      );


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


        if (
          fs.existsSync(
            memoryFile
          )
        ) {

          const stat =
            fs.lstatSync(
              memoryFile
            );


          if (
            stat.isSymbolicLink()
          ) {

            return {

              success:
                false,

              error:
                "Memory file cannot be a symbolic link"

            };

          }


          fs.unlinkSync(
            memoryFile
          );

        }


        /*
         * Recreate clean user memory.
         */

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
   EXPORT COMPATIBILITY
========================================================= */

/*
 * CRITICAL:
 *
 * Master Agent currently does:
 *
 * const memoryAgent =
 *   require("./memoryAgent");
 *
 * await memoryAgent({...});
 *
 * Therefore memoryAgent itself must be
 * callable.
 *
 * Helper methods are attached to the
 * function for direct usage.
 */

memoryAgent.addConversation =
  addConversation;


memoryAgent.saveProjectMemory =
  saveProjectMemory;


memoryAgent.setPreference =
  setPreference;


memoryAgent.getMemory =
  getMemory;


memoryAgent.getMemoryContext =
  getMemoryContext;


memoryAgent.clearMemory =
  clearMemory;


memoryAgent.loadMemory =
  loadMemory;


memoryAgent.saveMemory =
  saveMemory;


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  memoryAgent;
