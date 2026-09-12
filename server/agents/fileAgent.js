/* =========================================================
   ZyrionOS FILE AGENT
   Secure Project File Management
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
  200000;

const MAX_FILES =
  500;

const MAX_PATH_LENGTH =
  300;

const MAX_SCAN_DEPTH =
  20;


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

    ".cache"

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

    "id_rsa",

    "id_rsa.pub",

    "authorized_keys"

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

    ".7z",

    ".rar",

    ".mp3",

    ".mp4",

    ".mov",

    ".avi",

    ".mkv",

    ".wav",

    ".woff",

    ".woff2",

    ".ttf",

    ".otf",

    ".eot",

    ".exe",

    ".dll",

    ".so",

    ".dylib"

  ]);


/* =========================================================
   HELPERS
========================================================= */


/* =========================
   SAFE STRING
========================= */

function cleanString(
  value,
  maxLength = 4000
) {

  if (
    typeof value !== "string"
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


/* =========================
   SAFE JSON
========================= */

function safeJson(
  value
) {

  try {

    return JSON.stringify(
      value ?? null
    );

  }

  catch (error) {

    return "{}";

  }

}


/* =========================
   GET PROJECT ROOT
========================= */

function getProjectRoot(
  projectId
) {

  const cleanProjectId =
    cleanString(
      projectId,
      200
    );


  /*
   * Default workspace is retained for
   * backwards compatibility.
   */

  if (
    !cleanProjectId
  ) {

    return WORKSPACE;

  }


  /*
   * Project IDs should not contain
   * filesystem traversal characters.
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


/* =========================
   WORKSPACE CONTAINMENT
========================= */

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


/* =========================
   VALIDATE RELATIVE PATH
========================= */

function validateRelativePath(
  fileName
) {

  if (
    typeof fileName !==
    "string"
  ) {

    return {

      valid: false,

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
    cleanPath.startsWith("./")
  ) {

    cleanPath =
      cleanPath.slice(2);

  }


  if (
    !cleanPath
  ) {

    return {

      valid: false,

      error:
        "File path is required"

    };

  }


  if (
    cleanPath.length >
    MAX_PATH_LENGTH
  ) {

    return {

      valid: false,

      error:
        "File path is too long"

    };

  }


  /*
   * Reject absolute Unix paths.
   */

  if (
    cleanPath.startsWith("/")
  ) {

    return {

      valid: false,

      error:
        "Absolute paths are not allowed"

    };

  }


  /*
   * Reject Windows absolute paths.
   */

  if (
    /^[A-Za-z]:\//.test(
      cleanPath
    )
  ) {

    return {

      valid: false,

      error:
        "Absolute paths are not allowed"

    };

  }


  /*
   * Reject traversal.
   */

  const segments =
    cleanPath.split("/");


  if (
    segments.includes("..")
  ) {

    return {

      valid: false,

      error:
        "Path traversal is not allowed"

    };

  }


  /*
   * Reject null bytes.
   */

  if (
    cleanPath.includes("\0")
  ) {

    return {

      valid: false,

      error:
        "Invalid file path"

    };

  }


  /*
   * Reject protected directories.
   */

  for (
    const segment of segments
  ) {

    if (
      PROTECTED_DIRECTORIES.has(
        segment
      )
    ) {

      return {

        valid: false,

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
   * Never expose secret files.
   */

  if (
    PROTECTED_FILES.has(
      baseName
    )
  ) {

    return {

      valid: false,

      error:
        "Access to protected file is not allowed"

    };

  }


  /*
   * Reject common private-key files.
   */

  if (
    baseName.endsWith(
      ".pem"
    ) ||
    baseName.endsWith(
      ".key"
    ) ||
    baseName.endsWith(
      ".p12"
    ) ||
    baseName.endsWith(
      ".pfx"
    )
  ) {

    return {

      valid: false,

      error:
        "Access to private credential files is not allowed"

    };

  }


  return {

    valid: true,

    path:
      cleanPath

  };

}


/* =========================
   RESOLVE SAFE PATH
========================= */

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


  const targetPath =
    path.resolve(
      root,
      validation.path
    );


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
   * Also ensure the path remains
   * inside the selected project root.
   */

  const resolvedRoot =
    path.resolve(
      root
    );


  if (
    targetPath !==
      resolvedRoot &&

    !targetPath.startsWith(
      resolvedRoot +
      path.sep
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


/* =========================
   ENSURE DIRECTORY
========================= */

function ensureDirectory(
  directory
) {

  if (
    !fs.existsSync(
      directory
    )
  ) {

    fs.mkdirSync(
      directory,
      {
        recursive: true
      }
    );

  }

}


/* =========================
   IS BINARY FILE
========================= */

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


/* =========================
   IS PROTECTED ENTRY
========================= */

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


  if (
    name.endsWith(".pem") ||
    name.endsWith(".key") ||
    name.endsWith(".p12") ||
    name.endsWith(".pfx")
  ) {

    return true;

  }


  return false;

}


/* =========================================================
   READ DIRECTORY
========================================================= */

function readDirectory(
  root,
  currentDirectory,
  depth = 0,
  state = {
    files: 0
  }
) {

  if (
    depth >
    MAX_SCAN_DEPTH
  ) {

    return [];

  }


  let items = [];


  try {

    items =
      fs.readdirSync(
        currentDirectory,
        {
          withFileTypes: true
        }
      );

  }

  catch (error) {

    logger.warning(
      `Unable to read directory: ${currentDirectory}`
    );

    return [];

  }


  const results =
    [];


  for (
    const item of items
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
     * Prevent symlink traversal.
     */

    let stat;


    try {

      stat =
        fs.lstatSync(
          itemPath
        );

    }

    catch (error) {

      continue;

    }


    if (
      stat.isSymbolicLink()
    ) {

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


    /* =========================
       DIRECTORY
    ========================= */

    if (
      stat.isDirectory()
    ) {

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


    /* =========================
       FILE
    ========================= */

    if (
      !stat.isFile()
    ) {

      continue;

    }


    state.files++;


    /*
     * Do not attempt to decode binary
     * files as UTF-8 source code.
     */

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
          stat.size

      });

      continue;

    }


    /*
     * Avoid reading extremely large
     * files into memory.
     */

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
          stat.size

      });

      continue;

    }


    let content = "";


    try {

      content =
        fs.readFileSync(
          itemPath,
          "utf8"
        );

    }

    catch (error) {

      results.push({

        name:
          relative,

        type:
          "file",

        unreadable:
          true,

        size:
          stat.size

      });

      continue;

    }


    results.push({

      name:
        relative,

      type:
        "file",

      content

    });

  }


  return results;

}


/* =========================================================
   FILE AGENT
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
       INPUT CONTRACT

       Supported:

       fileAgent()

       fileAgent({
         prompt,
         projectId,
         user,
         intent,
         planning,
         files
       })

       The Master Agent uses the second
       form.
    ===================================================== */

    let prompt = "";

    let projectId = "";

    let requestedFiles = [];


    if (
      typeof input === "string"
    ) {

      prompt =
        cleanString(
          input,
          4000
        );

    }

    else if (
      input &&
      typeof input === "object"
    ) {

      prompt =
        cleanString(
          input.prompt,
          4000
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
       SCAN WORKSPACE
    ===================================================== */

    currentStage =
      "workspace-scan";


    const files =
      readDirectory(
        projectRoot,
        projectRoot
      );


    /* =====================================================
       REQUESTED FILE INFORMATION
    ===================================================== */

    const requested =
      [];


    for (
      const file of requestedFiles
    ) {

      if (
        !file ||
        typeof file !==
          "object"
      ) {

        continue;

      }


      const filePath =
        file.path ||
        file.name;


      if (
        typeof filePath !==
        "string"
      ) {

        continue;

      }


      try {

        const safePath =
          resolveSafePath(
            projectRoot,
            filePath
          );


        requested.push({

          path:
            safePath.relativePath,

          content:
            typeof file.content ===
              "string"
              ? file.content
              : ""

        });

      }

      catch (error) {

        /*
         * Invalid requested paths are
         * ignored rather than accessed.
         */

        logger.warning(
          `Rejected file path: ${filePath}`
        );

      }

    }


    /* =====================================================
       RESULT
    ===================================================== */

    const result = {

      success: true,

      files,

      requestedFiles:
        requested,

      projectId:
        projectId ||
        null,

      workspace:
        projectId
          ? `workspace/${projectId}`
          : "workspace",

      fileCount:
        files.filter(
          (item) =>
            item.type === "file"
        ).length,

      folderCount:
        files.filter(
          (item) =>
            item.type === "folder"
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

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown File Agent error";


    logger.error(
      `File Agent Failed at ${currentStage}: ${errorMessage}`
    );


    return {

      success: false,

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

        success: false,

        error:
          "File content must be a string"

      };

    }


    if (
      content.length >
      MAX_FILE_SIZE
    ) {

      return {

        success: false,

        error:
          "File content exceeds maximum allowed size"

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


    const directory =
      path.dirname(
        safePath.path
      );


    ensureDirectory(
      directory
    );


    /*
     * Never follow an existing symlink.
     */

    if (
      fs.existsSync(
        safePath.path
      )
    ) {

      const stat =
        fs.lstatSync(
          safePath.path
        );


      if (
        stat.isSymbolicLink()
      ) {

        return {

          success: false,

          error:
            "Refusing to overwrite a symbolic link"

        };

      }

    }


    fs.writeFileSync(
      safePath.path,
      content,
      {
        encoding: "utf8",
        flag: "w"
      }
    );


    logger.success(
      `File Saved: ${safePath.relativePath}`
    );


    return {

      success: true,

      path:
        safePath.relativePath,

      projectId:
        projectId ||
        null,

      size:
        Buffer.byteLength(
          content,
          "utf8"
        )

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown file save error";


    logger.error(
      `File Save Failed: ${errorMessage}`
    );


    return {

      success: false,

      error:
        errorMessage

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


    if (
      !fs.existsSync(
        safePath.path
      )
    ) {

      return {

        success: false,

        error:
          "File not found",

        path:
          safePath.relativePath

      };

    }


    const stat =
      fs.lstatSync(
        safePath.path
      );


    if (
      stat.isSymbolicLink()
    ) {

      return {

        success: false,

        error:
          "Refusing to delete symbolic link"

      };

    }


    if (
      !stat.isFile()
    ) {

      return {

        success: false,

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

      success: true,

      path:
        safePath.relativePath,

      projectId:
        projectId ||
        null

    };

  }

  catch (error) {

    const errorMessage =
      error?.message ||
      "Unknown file delete error";


    logger.error(
      `File Delete Failed: ${errorMessage}`
    );


    return {

      success: false,

      error:
        errorMessage

    };

  }

}


/* =========================================================
   ATTACH METHODS
========================================================= */

/*
 * IMPORTANT:
 *
 * Master Agent currently does:
 *
 * const fileAgent = require("./fileAgent");
 *
 * await fileAgent({...});
 *
 * Therefore the main export MUST itself
 * be callable.
 *
 * We attach saveFile/deleteFile as
 * properties so both styles work:
 *
 * fileAgent(...)
 * fileAgent.saveFile(...)
 * fileAgent.deleteFile(...)
 */

fileAgent.saveFile =
  saveFile;

fileAgent.deleteFile =
  deleteFile;


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  fileAgent;
