/* =========================================================
   ZyrionOS FILE AGENT
   Production Secure Project File Management

   RESPONSIBILITY:

   Project Workspace
        ↓
   Safe File Access
        ↓
   Read / Scan / Write / Replace / Delete
        ↓
   Builder / Fix Agent / Master Agent
        ↓
   Project Files

   IMPORTANT:

   - Workspace containment is mandatory.
   - Path traversal is rejected.
   - Absolute paths are rejected.
   - Symlinks are rejected.
   - Secret files are protected.
   - Binary files are not decoded as source.
   - Writes use temporary files + rename.
   - Fix Agent can safely apply complete
     replacement files.
   - No arbitrary filesystem access.
========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const fs =
  require("fs");

const path =
  require("path");

const crypto =
  require("crypto");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("../services/loggerService");


/* =========================================================
   WORKSPACE
========================================================= */

const WORKSPACE =
  path.resolve(
    __dirname,
    "../workspace"
  );


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILE_SIZE =
  250000;


const MAX_FILES =
  1000;


const MAX_PATH_LENGTH =
  300;


const MAX_SCAN_DEPTH =
  30;


const MAX_BATCH_FILES =
  100;


const MAX_TOTAL_BATCH_SIZE =
  10000000;


/* =========================================================
   PROTECTED DIRECTORIES
========================================================= */

const PROTECTED_DIRECTORIES =
  new Set([

    ".git",

    "node_modules",

    ".next",

    "dist",

    "build",

    "coverage",

    ".cache",

    ".turbo",

    ".vercel",

    ".amplify",

    ".aws",

    ".ssh",

    ".npm"

  ]);


/* =========================================================
   PROTECTED FILES
========================================================= */

const PROTECTED_FILES =
  new Set([

    ".env",

    ".env.local",

    ".env.production",

    ".env.development",

    ".env.test",

    ".env.staging",

    ".npmrc",

    ".pypirc",

    "id_rsa",

    "id_rsa.pub",

    "authorized_keys",

    "credentials",

    "credentials.json",

    "service-account.json",

    "firebase-adminsdk.json"

  ]);


/* =========================================================
   BINARY EXTENSIONS
========================================================= */

const BINARY_EXTENSIONS =
  new Set([

    ".png",

    ".jpg",

    ".jpeg",

    ".gif",

    ".webp",

    ".ico",

    ".bmp",

    ".tiff",

    ".pdf",

    ".zip",

    ".gz",

    ".tar",

    ".tgz",

    ".7z",

    ".rar",

    ".mp3",

    ".mp4",

    ".mov",

    ".avi",

    ".mkv",

    ".wav",

    ".flac",

    ".webm",

    ".woff",

    ".woff2",

    ".ttf",

    ".otf",

    ".eot",

    ".exe",

    ".dll",

    ".so",

    ".dylib",

    ".bin"

  ]);


/* =========================================================
   SECRET FILE EXTENSIONS
========================================================= */

const SECRET_EXTENSIONS =
  new Set([

    ".pem",

    ".key",

    ".p12",

    ".pfx",

    ".crt"

  ]);


/* =========================================================
   HELPERS
========================================================= */


/* =========================================================
   SAFE STRING
========================================================= */

function cleanString(
  value,
  maxLength = 4000
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
   SAFE JSON
========================================================= */

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      value ?? null
    );

  }

  catch (
    error
  ) {

    return "{}";

  }

}


/* =========================================================
   GET PROJECT ROOT
========================================================= */

function getProjectRoot(
  projectId
) {

  const cleanProjectId =
    cleanString(
      projectId,
      200
    );


  /*
   * Backwards compatibility:
   *
   * No projectId means root workspace.
   */

  if (
    !cleanProjectId
  ) {

    return WORKSPACE;

  }


  /*
   * Project IDs are identifiers,
   * not arbitrary filesystem paths.
   */

  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      cleanProjectId
    )
  ) {

    throw new Error(
      "Invalid project ID"
    );

  }


  const projectRoot =
    path.resolve(
      WORKSPACE,
      cleanProjectId
    );


  if (
    !isInsideWorkspace(
      projectRoot
    )
  ) {

    throw new Error(
      "Invalid project workspace"
    );

  }


  return projectRoot;

}


/* =========================================================
   WORKSPACE CONTAINMENT
========================================================= */

function isInsideWorkspace(
  targetPath
) {

  const workspaceRoot =
    path.resolve(
      WORKSPACE
    );


  const resolvedTarget =
    path.resolve(
      targetPath
    );


  return (

    resolvedTarget ===
      workspaceRoot ||

    resolvedTarget.startsWith(
      workspaceRoot +
      path.sep
    )

  );

}


/* =========================================================
   ROOT CONTAINMENT
========================================================= */

function isInsideRoot(
  root,
  targetPath
) {

  const resolvedRoot =
    path.resolve(
      root
    );


  const resolvedTarget =
    path.resolve(
      targetPath
    );


  return (

    resolvedTarget ===
      resolvedRoot ||

    resolvedTarget.startsWith(
      resolvedRoot +
      path.sep
    )

  );

}


/* =========================================================
   VALIDATE RELATIVE PATH
========================================================= */

function validateRelativePath(
  fileName
) {

  if (
    typeof fileName !==
    "string"
  ) {

    return {

      valid:
        false,

      error:
        "File path must be a string"

    };

  }


  let cleanPath =
    fileName
      .trim()
      .replace(
        /\\/g,
        "/"
      );


  while (
    cleanPath.startsWith(
      "./"
    )
  ) {

    cleanPath =
      cleanPath.slice(2);

  }


  if (
    !cleanPath
  ) {

    return {

      valid:
        false,

      error:
        "File path is required"

    };

  }


  if (
    cleanPath.length >
    MAX_PATH_LENGTH
  ) {

    return {

      valid:
        false,

      error:
        "File path is too long"

    };

  }


  /*
   * Unix absolute path.
   */

  if (
    cleanPath.startsWith("/")
  ) {

    return {

      valid:
        false,

      error:
        "Absolute paths are not allowed"

    };

  }


  /*
   * Windows absolute path.
   */

  if (
    /^[A-Za-z]:\//.test(
      cleanPath
    )
  ) {

    return {

      valid:
        false,

      error:
        "Absolute paths are not allowed"

    };

  }


  /*
   * Null byte.
   */

  if (
    cleanPath.includes(
      "\0"
    )
  ) {

    return {

      valid:
        false,

      error:
        "Invalid file path"

    };

  }


  /*
   * Normalize repeated separators.
   */

  cleanPath =
    cleanPath.replace(
      /\/+/g,
      "/"
    );


  const segments =
    cleanPath.split("/");


  /*
   * Path traversal.
   */

  if (
    segments.includes(
      ".."
    )
  ) {

    return {

      valid:
        false,

      error:
        "Path traversal is not allowed"

    };

  }


  /*
   * Empty path segments are harmless
   * after normalization except root.
   */

  if (
    segments.some(
      (segment) =>
        segment.length ===
        0
    )
  ) {

    return {

      valid:
        false,

      error:
        "Invalid file path"

    };

  }


  /*
   * Protected directories.
   */

  for (
    const segment of
      segments
  ) {

    if (
      PROTECTED_DIRECTORIES.has(
        segment
      )
    ) {

      return {

        valid:
          false,

        error:
          `Access to protected directory '${segment}' is not allowed`

      };

    }

  }


  const baseName =
    path.posix.basename(
      cleanPath
    );


  /*
   * Protected secret files.
   */

  if (
    PROTECTED_FILES.has(
      baseName
    )
  ) {

    return {

      valid:
        false,

      error:
        "Access to protected file is not allowed"

    };

  }


  /*
   * Secret extension.
   */

  const extension =
    path.posix.extname(
      baseName
    )
      .toLowerCase();


  if (
    SECRET_EXTENSIONS.has(
      extension
    )
  ) {

    return {

      valid:
        false,

      error:
        "Access to private credential files is not allowed"

    };

  }


  /*
   * Extra private-key naming protection.
   */

  if (
    /^id_(rsa|dsa|ecdsa|ed25519)$/i.test(
      baseName
    )
  ) {

    return {

      valid:
        false,

      error:
        "Private key files are protected"

    };

  }


  return {

    valid:
      true,

    path:
      cleanPath

  };

}


/* =========================================================
   RESOLVE SAFE PATH
========================================================= */

function resolveSafePath(
  root,
  fileName
) {

  const validation =
    validateRelativePath(
      fileName
    );


  if (
    !validation.valid
  ) {

    throw new Error(
      validation.error
    );

  }


  const resolvedRoot =
    path.resolve(
      root
    );


  const targetPath =
    path.resolve(
      resolvedRoot,
      validation.path
    );


  /*
   * Workspace containment.
   */

  if (
    !isInsideWorkspace(
      targetPath
    )
  ) {

    throw new Error(
      "File path escapes workspace"
    );

  }


  /*
   * Project containment.
   */

  if (
    !isInsideRoot(
      resolvedRoot,
      targetPath
    )
  ) {

    throw new Error(
      "File path escapes project workspace"
    );

  }


  return {

    path:
      targetPath,

    relativePath:
      validation.path

  };

}


/* =========================================================
   ENSURE DIRECTORY
========================================================= */

function ensureDirectory(
  directory
) {

  fs.mkdirSync(
    directory,
    {
      recursive:
        true
    }
  );

}


/* =========================================================
   IS BINARY
========================================================= */

function isBinaryFile(
  filePath
) {

  const extension =
    path.extname(
      filePath
    )
      .toLowerCase();


  return BINARY_EXTENSIONS.has(
    extension
  );

}


/* =========================================================
   IS PROTECTED ENTRY
========================================================= */

function isProtectedEntry(
  name
) {

  if (
    PROTECTED_DIRECTORIES.has(
      name
    )
  ) {

    return true;

  }


  if (
    PROTECTED_FILES.has(
      name
    )
  ) {

    return true;

  }


  const extension =
    path.extname(
      name
    )
      .toLowerCase();


  if (
    SECRET_EXTENSIONS.has(
      extension
    )
  ) {

    return true;

  }


  if (
    /^id_(rsa|dsa|ecdsa|ed25519)$/i.test(
      name
    )
  ) {

    return true;

  }


  return false;

}


/* =========================================================
   CHECK EXISTING ENTRY
========================================================= */

function getExistingEntry(
  filePath
) {

  try {

    const stat =
      fs.lstatSync(
        filePath
      );


    return {

      exists:
        true,

      isFile:
        stat.isFile(),

      isDirectory:
        stat.isDirectory(),

      isSymbolicLink:
        stat.isSymbolicLink(),

      size:
        stat.size,

      mode:
        stat.mode,

      modifiedAt:
        stat.mtime

    };

  }

  catch (
    error
  ) {

    if (
      error.code ===
      "ENOENT"
    ) {

      return {

        exists:
          false

      };

    }


    throw error;

  }

}


/* =========================================================
   PREVENT SYMLINK PARENT
========================================================= */

function ensureNoSymlinkParent(
  root,
  targetPath
) {

  const resolvedRoot =
    path.resolve(
      root
    );


  let current =
    path.dirname(
      targetPath
    );


  while (
    current !==
      resolvedRoot
  ) {

    if (
      !isInsideRoot(
        resolvedRoot,
        current
      )
    ) {

      throw new Error(
        "Parent directory escapes project workspace"
      );

    }


    const entry =
      getExistingEntry(
        current
      );


    if (
      entry.exists &&
      entry.isSymbolicLink
    ) {

      throw new Error(
        "Refusing to access a path through a symbolic-link directory"
      );

    }


    current =
      path.dirname(
        current
      );

  }

}


/* =========================================================
   READ TEXT FILE
========================================================= */

function readTextFile(
  filePath
) {

  const entry =
    getExistingEntry(
      filePath
    );


  if (
    !entry.exists
  ) {

    return {

      success:
        false,

      error:
        "File not found"

    };

  }


  if (
    entry.isSymbolicLink
  ) {

    return {

      success:
        false,

      error:
        "Symbolic links are not allowed"

    };

  }


  if (
    !entry.isFile
  ) {

    return {

      success:
        false,

      error:
        "Target is not a file"

    };

  }


  if (
    entry.size >
    MAX_FILE_SIZE
  ) {

    return {

      success:
        false,

      error:
        "File exceeds maximum readable size",

      size:
        entry.size

    };

  }


  if (
    isBinaryFile(
      filePath
    )
  ) {

    return {

      success:
        false,

      error:
        "Binary files cannot be read as text"

    };

  }


  try {

    const content =
      fs.readFileSync(
        filePath,
        "utf8"
      );


    return {

      success:
        true,

      content,

      size:
        Buffer.byteLength(
          content,
          "utf8"
        )

    };

  }

  catch (
    error
  ) {

    return {

      success:
        false,

      error:
        error?.message ||
        "Unable to read file"

    };

  }

}


/* =========================================================
   ATOMIC WRITE
========================================================= */

function atomicWrite(
  filePath,
  content
) {

  const directory =
    path.dirname(
      filePath
    );


  ensureDirectory(
    directory
  );


  const temporaryName =
    `.${path.basename(
      filePath
    )}.${process.pid}.${Date.now()}.${crypto.randomBytes(
      6
    ).toString("hex")}.tmp`;


  const temporaryPath =
    path.join(
      directory,
      temporaryName
    );


  try {

    fs.writeFileSync(
      temporaryPath,
      content,
      {
        encoding:
          "utf8",

        flag:
          "wx"

      }
    );


    /*
     * Rename is atomic on the same filesystem.
     */

    fs.renameSync(
      temporaryPath,
      filePath
    );


    return {

      success:
        true

    };

  }

  catch (
    error
  ) {

    try {

      if (
        fs.existsSync(
          temporaryPath
        )
      ) {

        fs.unlinkSync(
          temporaryPath
        );

      }

    }

    catch (
      cleanupError
    ) {

      logger.warning(
        `Temporary file cleanup failed: ${cleanupError.message}`
      );

    }


    return {

      success:
        false,

      error:
        error?.message ||
        "Atomic file write failed"

    };

  }

}


/* =========================================================
   VALIDATE CONTENT
========================================================= */

function validateContent(
  content
) {

  if (
    typeof content !==
    "string"
  ) {

    return {

      valid:
        false,

      error:
        "File content must be a string"

    };

  }


  const size =
    Buffer.byteLength(
      content,
      "utf8"
    );


  if (
    size >
    MAX_FILE_SIZE
  ) {

    return {

      valid:
        false,

      error:
        `File exceeds maximum size of ${MAX_FILE_SIZE} bytes`

    };

  }


  if (
    content.includes(
      "\0"
    )
  ) {

    return {

      valid:
        false,

      error:
        "File contains an invalid null byte"

    };

  }


  return {

    valid:
      true,

    size

  };

}


/* =========================================================
   READ DIRECTORY
========================================================= */

function readDirectory(
  root,
  currentDirectory,
  depth = 0,
  state = {
    files:
      0,

    folders:
      0
  }
) {

  if (
    depth >
    MAX_SCAN_DEPTH
  ) {

    return [];

  }


  if (
    state.files >=
    MAX_FILES
  ) {

    return [];

  }


  let items =
    [];


  try {

    items =
      fs.readdirSync(
        currentDirectory,
        {
          withFileTypes:
            true
        }
      );

  }

  catch (
    error
  ) {

    logger.warning(
      `Unable to read directory: ${currentDirectory}`
    );


    return [];

  }


  /*
   * Stable output.
   */

  items.sort(
    (a, b) =>
      a.name.localeCompare(
        b.name
      )
  );


  const results =
    [];


  for (
    const item of
      items
  ) {

    if (
      state.files >=
      MAX_FILES
    ) {

      break;

    }


    const name =
      item.name;


    if (
      isProtectedEntry(
        name
      )
    ) {

      continue;

    }


    const itemPath =
      path.join(
        currentDirectory,
        name
      );


    /*
     * Verify containment.
     */

    if (
      !isInsideRoot(
        root,
        itemPath
      )
    ) {

      continue;

    }


    let stat;


    try {

      stat =
        fs.lstatSync(
          itemPath
        );

    }

    catch (
      error
    ) {

      continue;

    }


    /*
     * Never follow symlinks.
     */

    if (
      stat.isSymbolicLink()
    ) {

      results.push({

        name:
          path.relative(
            root,
            itemPath
          )
            .replace(
              /\\/g,
              "/"
            ),

        type:
          "symlink",

        ignored:
          true

      });


      continue;

    }


    const relative =
      path
        .relative(
          root,
          itemPath
        )
        .replace(
          /\\/g,
          "/"
        );


    /* =====================================================
       DIRECTORY
    ===================================================== */

    if (
      stat.isDirectory()
    ) {

      state.folders++;


      results.push({

        name:
          relative,

        type:
          "folder"

      });


      const children =
        readDirectory(

          root,

          itemPath,

          depth + 1,

          state

        );


      results.push(
        ...children
      );


      continue;

    }


    /* =====================================================
       FILE
    ===================================================== */

    if (
      !stat.isFile()
    ) {

      continue;

    }


    state.files++;


    /* =====================================================
       BINARY
    ===================================================== */

    if (
      isBinaryFile(
        itemPath
      )
    ) {

      results.push({

        name:
          relative,

        type:
          "file",

        binary:
          true,

        size:
          stat.size,

        modifiedAt:
          stat.mtime

      });


      continue;

    }


    /* =====================================================
       LARGE FILE
    ===================================================== */

    if (
      stat.size >
      MAX_FILE_SIZE
    ) {

      results.push({

        name:
          relative,

        type:
          "file",

        truncated:
          true,

        size:
          stat.size,

        modifiedAt:
          stat.mtime

      });


      continue;

    }


    /* =====================================================
       TEXT FILE
    ===================================================== */

    let content =
      "";


    try {

      content =
        fs.readFileSync(
          itemPath,
          "utf8"
        );

    }

    catch (
      error
    ) {

      results.push({

        name:
          relative,

        type:
          "file",

        unreadable:
          true,

        size:
          stat.size,

        modifiedAt:
          stat.mtime

      });


      continue;

    }


    results.push({

      name:
        relative,

      type:
        "file",

      content,

      size:
        stat.size,

      modifiedAt:
        stat.mtime

    });

  }


  return results;

}


/* =========================================================
   NORMALIZE REQUESTED FILES
========================================================= */

function normalizeRequestedFiles(
  projectRoot,
  requestedFiles
) {

  if (
    !Array.isArray(
      requestedFiles
    )
  ) {

    return {

      files:
        [],

      rejected:
        []

    };

  }


  const files =
    [];


  const rejected =
    [];


  const seen =
    new Set();


  for (
    const item of
      requestedFiles
  ) {

    if (
      !item ||
      typeof item !==
        "object"
    ) {

      rejected.push({

        error:
          "Invalid file request"

      });


      continue;

    }


    const requestedPath =
      item.path ||
      item.name;


    try {

      const safe =
        resolveSafePath(

          projectRoot,

          requestedPath

        );


      if (
        seen.has(
          safe.relativePath
        )
      ) {

        rejected.push({

          path:
            safe.relativePath,

          error:
            "Duplicate file path"

        });


        continue;

      }


      seen.add(
        safe.relativePath
      );


      if (
        item.content !==
          undefined
      ) {

        const validation =
          validateContent(
            item.content
          );


        if (
          !validation.valid
        ) {

          rejected.push({

            path:
              safe.relativePath,

            error:
              validation.error

          });


          continue;

        }

      }


      files.push({

        path:
          safe.relativePath,

        content:
          typeof item.content ===
            "string"
            ? item.content
            : null

      });

    }

    catch (
      error
    ) {

      rejected.push({

        path:
          requestedPath ||
          null,

        error:
          error?.message ||
          "Invalid file path"

      });

    }

  }


  return {

    files,

    rejected

  };

}


/* =========================================================
   SAVE FILE
========================================================= */

function saveFile(
  fileName,
  content,
  projectId = ""
) {

  try {

    if (
      typeof content !==
      "string"
    ) {

      return {

        success:
          false,

        error:
          "File content must be a string"

      };

    }


    const contentValidation =
      validateContent(
        content
      );


    if (
      !contentValidation.valid
    ) {

      return {

        success:
          false,

        error:
          contentValidation.error

      };

    }


    const projectRoot =
      getProjectRoot(
        projectId
      );


    ensureDirectory(
      projectRoot
    );


    const safePath =
      resolveSafePath(

        projectRoot,

        fileName

      );


    ensureNoSymlinkParent(

      projectRoot,

      safePath.path

    );


    const existing =
      getExistingEntry(
        safePath.path
      );


    /*
     * Never overwrite symlinks.
     */

    if (
      existing.exists &&
      existing.isSymbolicLink
    ) {

      return {

        success:
          false,

        error:
          "Refusing to overwrite a symbolic link"

      };

    }


    /*
     * Never replace directories.
     */

    if (
      existing.exists &&
      existing.isDirectory
    ) {

      return {

        success:
          false,

        error:
          "Target path is a directory"

      };

    }


    const result =
      atomicWrite(

        safePath.path,

        content

      );


    if (
      !result.success
    ) {

      return {

        success:
          false,

        error:
          result.error

      };

    }


    logger.success(
      `File Saved: ${safePath.relativePath}`
    );


    return {

      success:
        true,

      operation:
        existing.exists
          ? "updated"
          : "created",

      path:
        safePath.relativePath,

      projectId:
        projectId ||
        null,

      size:
        contentValidation.size

    };

  }

  catch (
    error
  ) {

    const errorMessage =
      error?.message ||
      "Unknown file save error";


    logger.error(
      `File Save Failed: ${errorMessage}`
    );


    return {

      success:
        false,

      error:
        errorMessage

    };

  }

}


/* =========================================================
   READ FILE
========================================================= */

function readFile(
  fileName,
  projectId = ""
) {

  try {

    const projectRoot =
      getProjectRoot(
        projectId
      );


    const safePath =
      resolveSafePath(

        projectRoot,

        fileName

      );


    ensureNoSymlinkParent(

      projectRoot,

      safePath.path

    );


    const result =
      readTextFile(
        safePath.path
      );


    if (
      !result.success
    ) {

      return {

        success:
          false,

        error:
          result.error,

        path:
          safePath.relativePath

      };

    }


    return {

      success:
        true,

      path:
        safePath.relativePath,

      content:
        result.content,

      size:
        result.size,

      projectId:
        projectId ||
        null

    };

  }

  catch (
    error
  ) {

    return {

      success:
        false,

      error:
        error?.message ||
        "Unable to read file"

    };

  }

}


/* =========================================================
   DELETE FILE
========================================================= */

function deleteFile(
  fileName,
  projectId = ""
) {

  try {

    const projectRoot =
      getProjectRoot(
        projectId
      );


    const safePath =
      resolveSafePath(

        projectRoot,

        fileName

      );


    ensureNoSymlinkParent(

      projectRoot,

      safePath.path

    );


    const existing =
      getExistingEntry(
        safePath.path
      );


    if (
      !existing.exists
    ) {

      return {

        success:
          false,

        error:
          "File not found",

        path:
          safePath.relativePath

      };

    }


    if (
      existing.isSymbolicLink
    ) {

      return {

        success:
          false,

        error:
          "Refusing to delete symbolic link"

      };

    }


    if (
      !existing.isFile
    ) {

      return {

        success:
          false,

        error:
          "Target is not a file"

      };

    }


    fs.unlinkSync(
      safePath.path
    );


    logger.success(
      `File Deleted: ${safePath.relativePath}`
    );


    return {

      success:
        true,

      operation:
        "deleted",

      path:
        safePath.relativePath,

      projectId:
        projectId ||
        null

    };

  }

  catch (
    error
  ) {

    const errorMessage =
      error?.message ||
      "Unknown file delete error";


    logger.error(
      `File Delete Failed: ${errorMessage}`
    );


    return {

      success:
        false,

      error:
        errorMessage

    };

  }

}


/* =========================================================
   APPLY FILE REPLACEMENTS
========================================================= */

/*
 * Used by Fix Agent / Builder / Master.
 *
 * IMPORTANT:
 *
 * Every file is treated as a COMPLETE
 * replacement.
 *
 * No partial patches.
 * No append operations.
 * No arbitrary paths.
 */

function applyFileReplacements(
  files,
  projectId = "",
  options = {}
) {

  const dryRun =
    options.dryRun ===
    true;


  const projectRoot =
    getProjectRoot(
      projectId
    );


  if (
    !Array.isArray(
      files
    )
  ) {

    return {

      success:
        false,

      error:
        "Files must be an array",

      results:
        []

    };

  }


  if (
    files.length >
    MAX_BATCH_FILES
  ) {

    return {

      success:
        false,

      error:
        `Maximum ${MAX_BATCH_FILES} files allowed per batch`,

      results:
        []

    };

  }


  const normalized =
    normalizeRequestedFiles(

      projectRoot,

      files

    );


  if (
    normalized.rejected.length >
    0
  ) {

    return {

      success:
        false,

      error:
        "One or more files failed validation",

      rejected:
        normalized.rejected,

      results:
        []

    };

  }


  const writable =
    normalized.files.filter(
      (file) =>
        typeof file.content ===
        "string"
    );


  let totalBytes =
    0;


  for (
    const file of
      writable
  ) {

    totalBytes +=
      Buffer.byteLength(
        file.content,
        "utf8"
      );

  }


  if (
    totalBytes >
    MAX_TOTAL_BATCH_SIZE
  ) {

    return {

      success:
        false,

      error:
        `Batch exceeds maximum size of ${MAX_TOTAL_BATCH_SIZE} bytes`,

      results:
        []

    };

  }


  const results =
    [];


  /*
   * Preflight every file before writing
   * anything.
   *
   * This prevents half-valid batches.
   */

  for (
    const file of
      writable
  ) {

    try {

      const safePath =
        resolveSafePath(

          projectRoot,

          file.path

        );


      ensureNoSymlinkParent(

        projectRoot,

        safePath.path

      );


      const existing =
        getExistingEntry(
          safePath.path
        );


      if (
        existing.exists &&
        existing.isSymbolicLink
      ) {

        throw new Error(
          "Refusing to overwrite symbolic link"
        );

      }


      if (
        existing.exists &&
        existing.isDirectory
      ) {

        throw new Error(
          "Target path is a directory"
        );

      }


      results.push({

        path:
          file.path,

        absolutePath:
          safePath.path,

        operation:
          existing.exists
            ? "updated"
            : "created",

        size:
          Buffer.byteLength(
            file.content,
            "utf8"
          )

      });

    }

    catch (
      error
    ) {

      return {

        success:
          false,

        error:
          `Preflight failed for '${file.path}': ${error.message}`,

        results:
          []

      };

    }

  }


  /*
   * Dry run ends after preflight.
   */

  if (
    dryRun
  ) {

    return {

      success:
        true,

      dryRun:
        true,

      files:
        results.map(
          (item) => ({

            path:
              item.path,

            operation:
              item.operation,

            size:
              item.size

          })
        ),

      count:
        results.length

    };

  }


  /*
   * Actual write.
   *
   * Atomic write protects individual
   * files from partial content.
   */

  const completed =
    [];


  for (
    const file of
      writable
  ) {

    const safePath =
      resolveSafePath(

        projectRoot,

        file.path

      );


    const writeResult =
      atomicWrite(

        safePath.path,

        file.content

      );


    if (
      !writeResult.success
    ) {

      logger.error(

        `Batch file write failed: ${file.path}`

      );


      return {

        success:
          false,

        error:
          `Failed to write '${file.path}': ${writeResult.error}`,

        partial:
          true,

        completed,

        failed:
          file.path

      };

    }


    completed.push({

      path:
        file.path,

      operation:
        results.find(
          (item) =>
            item.path ===
            file.path
        )?.operation ||
        "updated",

      size:
        Buffer.byteLength(
          file.content,
          "utf8"
        )

    });

  }


  logger.success(

    `File replacements applied: ${completed.length} files`

  );


  return {

    success:
      true,

    dryRun:
      false,

    files:
      completed,

    count:
      completed.length,

    projectId:
      projectId ||
      null

  };

}


/* =========================================================
   PROJECT SNAPSHOT
========================================================= */

function createProjectSnapshot(
  projectId = ""
) {

  try {

    const projectRoot =
      getProjectRoot(
        projectId
      );


    ensureDirectory(
      projectRoot
    );


    const files =
      readDirectory(
        projectRoot,
        projectRoot
      );


    const sourceFiles =
      files
        .filter(
          (item) =>
            item.type ===
            "file" &&
            !item.binary &&
            !item.truncated &&
            !item.unreadable
        )
        .map(
          (item) => ({

            path:
              item.name,

            content:
              item.content

          })
        );


    return {

      success:
        true,

      projectId:
        projectId ||
        null,

      files:
        sourceFiles,

      inventory:
        files.map(
          (item) => ({

            path:
              item.name,

            type:
              item.type,

            size:
              item.size ||
              null,

            binary:
              item.binary ||
              false,

            truncated:
              item.truncated ||
              false,

            unreadable:
              item.unreadable ||
              false

          })
        ),

      fileCount:
        sourceFiles.length

    };

  }

  catch (
    error
  ) {

    return {

      success:
        false,

      error:
        error?.message ||
        "Unable to create project snapshot"

    };

  }

}


/* =========================================================
   MAIN FILE AGENT
========================================================= */

async function fileAgent(
  input = {}
) {

  let currentStage =
    "request-normalization";


  try {

    logger.info(
      "📁 ZyrionOS File Agent Started"
    );


    /* =====================================================
       INPUT
    ===================================================== */

    let prompt =
      "";

    let projectId =
      "";

    let requestedFiles =
      [];


    if (
      typeof input ===
      "string"
    ) {

      prompt =
        cleanString(
          input,
          12000
        );

    }

    else if (
      input &&
      typeof input ===
        "object"
    ) {

      prompt =
        cleanString(
          input.prompt,
          12000
        );


      projectId =
        cleanString(
          input.projectId,
          200
        );


      requestedFiles =
        Array.isArray(
          input.files
        )
          ? input.files
          : [];

    }


    /* =====================================================
       PROJECT ROOT
    ===================================================== */

    currentStage =
      "project-workspace";


    const projectRoot =
      getProjectRoot(
        projectId
      );


    ensureDirectory(
      projectRoot
    );


    /* =====================================================
       REQUESTED FILES
    ===================================================== */

    currentStage =
      "requested-file-validation";


    const requested =
      normalizeRequestedFiles(

        projectRoot,

        requestedFiles

      );


    /* =====================================================
       WORKSPACE SCAN
    ===================================================== */

    currentStage =
      "workspace-scan";


    const files =
      readDirectory(

        projectRoot,

        projectRoot

      );


    const fileEntries =
      files.filter(
        (item) =>
          item.type ===
          "file"
      );


    const folderEntries =
      files.filter(
        (item) =>
          item.type ===
          "folder"
      );


    /* =====================================================
       RESULT
    ===================================================== */

    const result = {

      success:
        true,

      files,

      requestedFiles:
        requested.files,

      rejectedFiles:
        requested.rejected,

      projectId:
        projectId ||
        null,

      workspace:
        projectId
          ? `workspace/${projectId}`
          : "workspace",

      workspaceRoot:
        projectRoot,

      fileCount:
        fileEntries.length,

      folderCount:
        folderEntries.length,

      binaryFiles:
        fileEntries.filter(
          (item) =>
            item.binary ===
            true
        ).length,

      truncatedFiles:
        fileEntries.filter(
          (item) =>
            item.truncated ===
            true
        ).length

    };


    /* =====================================================
       SUCCESS LOG
    ===================================================== */

    logger.success(

      `File Agent Completed: ${result.fileCount} files, ${result.folderCount} folders`

    );


    return result;

  }

  catch (
    error
  ) {

    const errorMessage =
      error?.message ||
      "Unknown File Agent error";


    logger.error(

      `File Agent Failed at ${currentStage}: ${errorMessage}`

    );


    return {

      success:
        false,

      message:
        "File Agent Failed",

      error:
        errorMessage,

      stage:
        currentStage

    };

  }

}


/* =========================================================
   ATTACH METHODS
========================================================= */


/*
 * Main compatibility:
 *
 * const fileAgent =
 *   require("./fileAgent");
 *
 * await fileAgent({...});
 */


/* =========================================================
   SAVE
========================================================= */

fileAgent.saveFile =
  saveFile;


/* =========================================================
   READ
========================================================= */

fileAgent.readFile =
  readFile;


/* =========================================================
   DELETE
========================================================= */

fileAgent.deleteFile =
  deleteFile;


/* =========================================================
   BATCH REPLACEMENT
========================================================= */

fileAgent.applyFileReplacements =
  applyFileReplacements;


/* =========================================================
   SNAPSHOT
========================================================= */

fileAgent.createProjectSnapshot =
  createProjectSnapshot;


/* =========================================================
   PATH HELPERS
========================================================= */

fileAgent.validateRelativePath =
  validateRelativePath;


fileAgent.resolveSafePath =
  resolveSafePath;


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  fileAgent;
