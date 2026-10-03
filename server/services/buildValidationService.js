/* =========================================================
   ZYRIONOS — BUILD VALIDATION SERVICE
   ---------------------------------------------------------
   Responsibilities:

   - Validate generated project files
   - Validate file paths
   - Validate package.json
   - Detect malformed / HTML-escaped JSX
   - Validate JavaScript syntax where possible
   - Validate framework / entry-point structure
   - Detect missing build configuration
   - Produce structured build-validation results
   - Generate deterministic source hash
   - Never execute generated application code directly
   - Provide a stable contract for:
       Master Agent
       Builder Agent
       Fix Agent
       Build Validation Controller
       Workspace
       Deployment Gate

   IMPORTANT:

   This service is the validation layer.

   Builder Agent
        ↓
   BuildValidationService
        ↓
   FAILED → Fix Agent
        ↓
   BuildValidationService
        ↓
   PASSED
        ↓
   Preview / Deploy

========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const crypto =
  require("crypto");

const vm =
  require("vm");

const path =
  require("path");


/* =========================================================
   SERVICES
========================================================= */

const logger =
  require("./loggerService");


/* =========================================================
   CONSTANTS
========================================================= */

const SERVICE_VERSION =
  "1.0.0";


const MAX_FILES =
  Number(
    process.env.BUILD_VALIDATION_MAX_FILES ||
    1000
  );


const MAX_FILE_SIZE =
  Number(
    process.env.BUILD_VALIDATION_MAX_FILE_SIZE ||
    2 * 1024 * 1024
  );


const MAX_TOTAL_SIZE =
  Number(
    process.env.BUILD_VALIDATION_MAX_TOTAL_SIZE ||
    25 * 1024 * 1024
  );


const ALLOWED_FRAMEWORKS = [

  "React",

  "Next.js",

  "Vue",

  "Node.js",

  "Express",

  "Other"

];


/* =========================================================
   HELPERS
========================================================= */


/**
 * Safely convert a value to string.
 */
function toString(
  value,
  fallback = ""
){

  if(
    value === null ||
    value === undefined
  ){

    return fallback;

  }

  return String(value);

}


/**
 * Normalize framework name.
 */
function normalizeFramework(
  framework
){

  const value =
    toString(
      framework
    )
      .trim();


  if(
    !value
  ){

    return "Other";

  }


  const lower =
    value.toLowerCase();


  if(
    lower === "react"
  ){

    return "React";

  }


  if(
    lower === "next" ||
    lower === "next.js" ||
    lower === "nextjs"
  ){

    return "Next.js";

  }


  if(
    lower === "vue"
  ){

    return "Vue";

  }


  if(
    lower === "node" ||
    lower === "node.js" ||
    lower === "nodejs"
  ){

    return "Node.js";

  }


  if(
    lower === "express"
  ){

    return "Express";

  }


  return "Other";

}


/**
 * Normalize project file path.
 */
function normalizeFilePath(
  filePath
){

  let value =
    toString(
      filePath
    )
      .trim()
      .replace(/\\/g, "/");


  while(
    value.startsWith("./")
  ){

    value =
      value.slice(2);

  }


  return value;

}


/**
 * Check whether a path is safe.
 */
function isSafeFilePath(
  filePath
){

  const normalized =
    normalizeFilePath(
      filePath
    );


  if(
    !normalized
  ){

    return false;

  }


  if(
    normalized.startsWith("/") ||
    normalized.startsWith("\\")
  ){

    return false;

  }


  if(
    normalized.includes("\0")
  ){

    return false;

  }


  const segments =
    normalized.split("/");


  if(
    segments.includes("..")
  ){

    return false;

  }


  return true;

}


/**
 * Get file path from supported file shapes.
 */
function getFilePath(
  file
){

  if(
    !file ||
    typeof file !== "object"
  ){

    return "";

  }


  return normalizeFilePath(

    file.path ||

    file.name ||

    file.filePath ||

    ""

  );

}


/**
 * Get file content.
 */
function getFileContent(
  file
){

  if(
    !file ||
    typeof file !== "object"
  ){

    return "";

  }


  if(
    typeof file.content === "string"
  ){

    return file.content;

  }


  if(
    typeof file.source === "string"
  ){

    return file.source;

  }


  return "";

}


/**
 * Calculate SHA-256 hash for source files.
 */
function calculateSourceHash(
  files
){

  const hash =
    crypto.createHash(
      "sha256"
    );


  const normalized =
    files
      .map(
        file => ({

          path:
            getFilePath(file),

          content:
            getFileContent(file)

        })
      )
      .sort(
        (a, b) =>
          a.path.localeCompare(
            b.path
          )
      );


  for(
    const file of normalized
  ){

    hash.update(
      file.path
    );

    hash.update(
      "\n"
    );

    hash.update(
      file.content
    );

    hash.update(
      "\n---FILE---\n"
    );

  }


  return hash.digest(
    "hex"
  );

}


/**
 * Find a file by exact path.
 */
function findFile(
  files,
  targetPath
){

  const normalizedTarget =
    normalizeFilePath(
      targetPath
    );


  return files.find(
    file =>
      getFilePath(file) ===
      normalizedTarget
  );

}


/**
 * Find files by extension.
 */
function getFilesByExtension(
  files,
  extensions
){

  const normalizedExtensions =
    extensions.map(
      extension =>
        extension.toLowerCase()
    );


  return files.filter(
    file => {

      const filePath =
        getFilePath(file)
          .toLowerCase();


      return normalizedExtensions
        .some(
          extension =>
            filePath.endsWith(
              extension
            )
        );

    }
  );

}


/* =========================================================
   ERROR FACTORY
========================================================= */

function createIssue({

  code,

  message,

  file = null,

  severity = "error",

  stage = "validation",

  details = null

}){

  return {

    code,

    message,

    file,

    severity,

    stage,

    details

  };

}


/* =========================================================
   FILE STRUCTURE VALIDATION
========================================================= */

function validateFileStructure(
  files
){

  const errors = [];

  const warnings = [];

  const seenPaths =
    new Set();


  if(
    !Array.isArray(files)
  ){

    errors.push(
      createIssue({

        code:
          "FILES_NOT_ARRAY",

        message:
          "Project files must be an array."

      })
    );


    return {

      errors,

      warnings

    };

  }


  if(
    files.length === 0
  ){

    errors.push(
      createIssue({

        code:
          "NO_PROJECT_FILES",

        message:
          "Project contains no generated files."

      })
    );

  }


  if(
    files.length >
    MAX_FILES
  ){

    errors.push(
      createIssue({

        code:
          "FILE_LIMIT_EXCEEDED",

        message:
          `Project contains ${files.length} files. Maximum allowed is ${MAX_FILES}.`

      })
    );

  }


  let totalSize = 0;


  for(
    const file of files
  ){

    const filePath =
      getFilePath(file);


    const content =
      getFileContent(file);


    if(
      !filePath
    ){

      errors.push(
        createIssue({

          code:
            "FILE_PATH_MISSING",

          message:
            "Generated file is missing a path."

        })
      );


      continue;

    }


    if(
      !isSafeFilePath(
        filePath
      )
    ){

      errors.push(
        createIssue({

          code:
            "UNSAFE_FILE_PATH",

          message:
            `Unsafe project file path: ${filePath}`,

          file:
            filePath

        })
      );

    }


    if(
      seenPaths.has(
        filePath
      )
    ){

      errors.push(
        createIssue({

          code:
            "DUPLICATE_FILE_PATH",

          message:
            `Duplicate project file: ${filePath}`,

          file:
            filePath

        })
      );

    }


    seenPaths.add(
      filePath
    );


    const byteSize =
      Buffer.byteLength(
        content,
        "utf8"
      );


    totalSize +=
      byteSize;


    if(
      byteSize >
      MAX_FILE_SIZE
    ){

      errors.push(
        createIssue({

          code:
            "FILE_SIZE_EXCEEDED",

          message:
            `File exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes.`,

          file:
            filePath,

          details: {

            size:
              byteSize,

            maximum:
              MAX_FILE_SIZE

          }

        })
      );

    }

  }


  if(
    totalSize >
    MAX_TOTAL_SIZE
  ){

    errors.push(
      createIssue({

        code:
          "PROJECT_SIZE_EXCEEDED",

        message:
          `Project source exceeds maximum allowed size of ${MAX_TOTAL_SIZE} bytes.`,

        details: {

          size:
            totalSize,

          maximum:
            MAX_TOTAL_SIZE

        }

      })
    );

  }


  return {

    errors,

    warnings,

    totalSize

  };

}


/* =========================================================
   PACKAGE.JSON VALIDATION
========================================================= */

function validatePackageJson(
  files
){

  const errors = [];

  const warnings = [];

  const packageFile =
    findFile(
      files,
      "package.json"
    );


  if(
    !packageFile
  ){

    warnings.push(
      createIssue({

        code:
          "PACKAGE_JSON_MISSING",

        message:
          "package.json is missing.",

        severity:
          "warning"

      })
    );


    return {

      packageJson:
        null,

      errors,

      warnings

    };

  }


  const content =
    getFileContent(
      packageFile
    );


  let packageJson;


  try{

    packageJson =
      JSON.parse(
        content
      );

  }

  catch(error){

    errors.push(
      createIssue({

        code:
          "INVALID_PACKAGE_JSON",

        message:
          `package.json is invalid JSON: ${error.message}`,

        file:
          "package.json",

        details: {

          originalError:
            error.message

        }

      })
    );


    return {

      packageJson:
        null,

      errors,

      warnings

    };

  }


  if(
    !packageJson ||
    typeof packageJson !== "object" ||
    Array.isArray(packageJson)
  ){

    errors.push(
      createIssue({

        code:
          "INVALID_PACKAGE_ROOT",

        message:
          "package.json must contain a JSON object.",

        file:
          "package.json"

      })
    );


    return {

      packageJson,
      errors,
      warnings

    };

  }


  if(
    packageJson.scripts &&
    typeof packageJson.scripts !== "object"
  ){

    errors.push(
      createIssue({

        code:
          "INVALID_NPM_SCRIPTS",

        message:
          "package.json scripts must be an object.",

        file:
          "package.json"

      })
    );

  }


  const hasBuildScript =
    Boolean(
      packageJson
        .scripts
        ?.build
    );


  const hasStartScript =
    Boolean(
      packageJson
        .scripts
        ?.start
    );


  if(
    !hasBuildScript &&
    !hasStartScript
  ){

    warnings.push(
      createIssue({

        code:
          "NO_BUILD_OR_START_SCRIPT",

        message:
          "package.json contains neither a build script nor a start script.",

        file:
          "package.json",

        severity:
          "warning"

      })
    );

  }


  return {

    packageJson,

    errors,

    warnings

  };

}


/* =========================================================
   ESCAPED HTML / JSX DETECTION
========================================================= */

function detectEscapedSource(
  files
){

  const errors = [];

  const warnings = [];


  const sourceFiles =
    getFilesByExtension(
      files,
      [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".vue"
      ]
    );


  for(
    const file of sourceFiles
  ){

    const filePath =
      getFilePath(file);


    const content =
      getFileContent(file);


    /*
     * Detect HTML entities commonly introduced
     * when JSX source has accidentally been HTML encoded.
     */

    const hasEscapedTag =
      /&lt;\/?[A-Za-z_$][^;]*&gt;/
        .test(
          content
        );


    const hasEscapedBrace =
      /&lbrace;|&rbrace;/
        .test(
          content
        );


    if(
      hasEscapedTag ||
      hasEscapedBrace
    ){

      errors.push(
        createIssue({

          code:
            "HTML_ESCAPED_SOURCE",

          message:
            "Source appears to contain HTML-escaped code. JSX/JavaScript source must contain real syntax instead of HTML entities.",

          file:
            filePath,

          stage:
            "syntax"

        })
      );

    }

  }


  return {

    errors,

    warnings

  };

}


/* =========================================================
   JAVASCRIPT SYNTAX VALIDATION
========================================================= */


/**
 * Node's VM parser cannot understand JSX/TypeScript.
 *
 * Therefore:
 *
 * JS     → validate directly
 * JSX    → structural validation here
 * TS/TSX → structural validation here
 *
 * A real framework build remains the authoritative
 * compiler stage when an external build executor is used.
 */
function validateJavaScriptSyntax(
  files
){

  const errors = [];

  const warnings = [];


  const javascriptFiles =
    getFilesByExtension(
      files,
      [
        ".js",
        ".mjs",
        ".cjs"
      ]
    );


  for(
    const file of javascriptFiles
  ){

    const filePath =
      getFilePath(file);


    const content =
      getFileContent(file);


    /*
     * JSX detection.
     *
     * If JSX exists, vm.Script is intentionally skipped.
     */
    const containsJSX =
      /<\s*[A-Za-z][^>]*>/
        .test(
          content
        );


    if(
      containsJSX
    ){

      warnings.push(
        createIssue({

          code:
            "JSX_REQUIRES_FRAMEWORK_COMPILER",

          message:
            "JS/JSX file contains JSX syntax and requires the framework compiler for authoritative validation.",

          file:
            filePath,

          severity:
            "warning",

          stage:
            "syntax"

        })
      );


      continue;

    }


    try{

      new vm.Script(
        content,
        {

          filename:
            filePath,

          displayErrors:
            true

        }
      );

    }

    catch(error){

      errors.push(
        createIssue({

          code:
            "JAVASCRIPT_SYNTAX_ERROR",

          message:
            error.message,

          file:
            filePath,

          stage:
            "syntax",

          details: {

            name:
              error.name,

            stack:
              error.stack

          }

        })
      );

    }

  }


  return {

    errors,

    warnings

  };

}


/* =========================================================
   HTML VALIDATION
========================================================= */

function validateHtml(
  files
){

  const errors = [];

  const warnings = [];


  const htmlFiles =
    getFilesByExtension(
      files,
      [
        ".html",
        ".htm"
      ]
    );


  for(
    const file of htmlFiles
  ){

    const filePath =
      getFilePath(file);


    const content =
      getFileContent(file);


    if(
      !content.trim()
    ){

      errors.push(
        createIssue({

          code:
            "EMPTY_HTML_FILE",

          message:
            "HTML file is empty.",

          file:
            filePath

        })
      );


      continue;

    }


    const lower =
      content.toLowerCase();


    if(
      !lower.includes(
        "<html"
      ) &&
      !lower.includes(
        "<!doctype"
      )
    ){

      warnings.push(
        createIssue({

          code:
            "HTML_DOCUMENT_STRUCTURE_UNCLEAR",

          message:
            "HTML file does not appear to contain a normal HTML document root.",

          file:
            filePath,

          severity:
            "warning"

        })
      );

    }


    /*
     * Detect unclosed script/style tags.
     */
    const scriptOpen =
      (
        content.match(
          /<script\b/gi
        ) || []
      ).length;


    const scriptClose =
      (
        content.match(
          /<\/script>/gi
        ) || []
      ).length;


    if(
      scriptOpen !==
      scriptClose
    ){

      errors.push(
        createIssue({

          code:
            "HTML_SCRIPT_TAG_MISMATCH",

          message:
            "HTML contains an unmatched script tag.",

          file:
            filePath

        })
      );

    }

  }


  return {

    errors,

    warnings

  };

}


/* =========================================================
   CSS VALIDATION
========================================================= */

function validateCss(
  files
){

  const errors = [];

  const warnings = [];


  const cssFiles =
    getFilesByExtension(
      files,
      [
        ".css"
      ]
    );


  for(
    const file of cssFiles
  ){

    const filePath =
      getFilePath(file);


    const content =
      getFileContent(file);


    let braces = 0;


    for(
      const character of content
    ){

      if(
        character === "{"
      ){

        braces++;

      }


      if(
        character === "}"
      ){

        braces--;

      }


      if(
        braces < 0
      ){

        break;

      }

    }


    if(
      braces !== 0
    ){

      errors.push(
        createIssue({

          code:
            "CSS_BRACE_MISMATCH",

          message:
            "CSS contains unmatched braces.",

          file:
            filePath

        })
      );

    }

  }


  return {

    errors,

    warnings

  };

}


/* =========================================================
   ENTRYPOINT VALIDATION
========================================================= */

function validateEntrypoints(
  files,
  framework,
  packageJson
){

  const errors = [];

  const warnings = [];


  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );


  if(
    framework === "React"
  ){

    const reactEntries = [

      "src/main.jsx",
      "src/main.js",
      "src/index.jsx",
      "src/index.js",
      "main.jsx",
      "main.js",
      "index.jsx",
      "index.js"

    ];


    const hasEntry =
      reactEntries.some(
        filePath =>
          paths.has(
            filePath
          )
      );


    if(
      !hasEntry
    ){

      warnings.push(
        createIssue({

          code:
            "REACT_ENTRYPOINT_NOT_FOUND",

          message:
            "A standard React entry point could not be found.",

          severity:
            "warning"

        })
      );

    }

  }


  if(
    framework === "Next.js"
  ){

    const nextEntries = [

      "app/page.js",
      "app/page.jsx",
      "app/page.tsx",
      "pages/index.js",
      "pages/index.jsx",
      "pages/index.tsx",
      "src/app/page.js",
      "src/app/page.jsx",
      "src/app/page.tsx",
      "src/pages/index.js",
      "src/pages/index.jsx",
      "src/pages/index.tsx"

    ];


    const hasNextEntry =
      nextEntries.some(
        filePath =>
          paths.has(
            filePath
          )
      );


    if(
      !hasNextEntry
    ){

      errors.push(
        createIssue({

          code:
            "NEXT_ENTRYPOINT_NOT_FOUND",

          message:
            "No supported Next.js application entry point was found."

        })
      );

    }

  }


  if(
    (
      framework === "Node.js" ||
      framework === "Express"
    ) &&
    packageJson
  ){

    const startScript =
      packageJson
        .scripts
        ?.start;


    if(
      !startScript
    ){

      warnings.push(
        createIssue({

          code:
            "NODE_START_SCRIPT_MISSING",

          message:
            "Node/Express project does not define npm start.",

          severity:
            "warning"

        })
      );

    }

  }


  return {

    errors,

    warnings

  };

}


/* =========================================================
   DEPENDENCY CONSISTENCY
========================================================= */

function validateDependencies(
  packageJson
){

  const errors = [];

  const warnings = [];


  if(
    !packageJson
  ){

    return {

      errors,

      warnings

    };

  }


  const dependencies =
    packageJson.dependencies || {};


  const devDependencies =
    packageJson.devDependencies || {};


  const peerDependencies =
    packageJson.peerDependencies || {};


  const dependencyNames =
    new Set([

      ...Object.keys(
        dependencies
      ),

      ...Object.keys(
        devDependencies
      ),

      ...Object.keys(
        peerDependencies
      )

    ]);


  /*
   * Detect obvious empty dependency versions.
   */
  for(
    const [name, version]
    of Object.entries(
      {

        ...dependencies,

        ...devDependencies

      }
    )
  ){

    if(
      !version ||
      typeof version !== "string"
    ){

      errors.push(
        createIssue({

          code:
            "INVALID_DEPENDENCY_VERSION",

          message:
            `Dependency "${name}" has an invalid version declaration.`,

          file:
            "package.json"

        })
      );

    }

  }


  /*
   * Basic framework consistency checks.
   */

  const frameworkPackages = {

    react:
      dependencyNames.has(
        "react"
      ),

    next:
      dependencyNames.has(
        "next"
      ),

    vue:
      dependencyNames.has(
        "vue"
      )

  };


  if(
    frameworkPackages.react &&
    frameworkPackages.vue
  ){

    warnings.push(
      createIssue({

        code:
          "MULTIPLE_FRONTEND_FRAMEWORKS",

        message:
          "package.json contains both React and Vue dependencies.",

        file:
          "package.json",

        severity:
          "warning"

      })
    );

  }


  return {

    errors,

    warnings

  };

}


/* =========================================================
   LOCKFILE / PACKAGE MANAGER DETECTION
========================================================= */

function detectPackageManager(
  files,
  packageJson
){

  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );


  if(
    paths.has(
      "pnpm-lock.yaml"
    )
  ){

    return "pnpm";

  }


  if(
    paths.has(
      "yarn.lock"
    )
  ){

    return "yarn";

  }


  if(
    paths.has(
      "bun.lockb"
    ) ||
    paths.has(
      "bun.lock"
    )
  ){

    return "bun";

  }


  if(
    paths.has(
      "package-lock.json"
    )
  ){

    return "npm";

  }


  if(
    packageJson
      ?.packageManager
  ){

    const value =
      String(
        packageJson.packageManager
      );


    if(
      value.startsWith(
        "pnpm"
      )
    ){

      return "pnpm";

    }


    if(
      value.startsWith(
        "yarn"
      )
    ){

      return "yarn";

    }


    if(
      value.startsWith(
        "bun"
      )
    ){

      return "bun";

    }


    if(
      value.startsWith(
        "npm"
      )
    ){

      return "npm";

    }

  }


  return "npm";

}


/* =========================================================
   BUILD COMMAND DETECTION
========================================================= */

function detectBuildCommand(
  packageJson,
  packageManager
){

  if(
    !packageJson
  ){

    return null;

  }


  if(
    packageJson.scripts &&
    typeof packageJson.scripts.build ===
      "string" &&
    packageJson.scripts.build.trim()
  ){

    return `${packageManager} run build`;

  }


  return null;

}


/* =========================================================
   BUILD CONFIGURATION
========================================================= */

function validateBuildConfiguration(
  framework,
  packageJson
){

  const errors = [];

  const warnings = [];


  if(
    !packageJson
  ){

    warnings.push(
      createIssue({

        code:
          "BUILD_CONFIGURATION_UNAVAILABLE",

        message:
          "Build configuration cannot be fully determined without package.json.",

        severity:
          "warning"

      })
    );


    return {

      errors,

      warnings

    };

  }


  const buildScript =
    packageJson
      .scripts
      ?.build;


  if(
    (
      framework === "React" ||
      framework === "Next.js" ||
      framework === "Vue"
    ) &&
    !buildScript
  ){

    warnings.push(
      createIssue({

        code:
          "FRONTEND_BUILD_SCRIPT_MISSING",

        message:
          `${framework} project does not define an npm build script.`,

        file:
          "package.json",

        severity:
          "warning"

      })
    );

  }


  if(
    framework === "Next.js"
  ){

    const nextDependency =
      packageJson.dependencies
        ?.next ||
      packageJson.devDependencies
        ?.next;


    if(
      !nextDependency
    ){

      errors.push(
        createIssue({

          code:
            "NEXT_DEPENDENCY_MISSING",

          message:
            "Next.js project is missing the next dependency.",

          file:
            "package.json"

        })
      );

    }

  }


  if(
    framework === "React"
  ){

    const reactDependency =
      packageJson.dependencies
        ?.react ||
      packageJson.devDependencies
        ?.react;


    if(
      !reactDependency
    ){

      warnings.push(
        createIssue({

          code:
            "REACT_DEPENDENCY_MISSING",

          message:
            "React project does not declare the react dependency.",

          file:
            "package.json",

          severity:
            "warning"

        })
      );

    }

  }


  if(
    framework === "Vue"
  ){

    const vueDependency =
      packageJson.dependencies
        ?.vue ||
      packageJson.devDependencies
        ?.vue;


    if(
      !vueDependency
    ){

      errors.push(
        createIssue({

          code:
            "VUE_DEPENDENCY_MISSING",

          message:
            "Vue project is missing the vue dependency.",

          file:
            "package.json"

        })
      );

    }

  }


  return {

    errors,

    warnings

  };

}


/* =========================================================
   MASTER VALIDATION
========================================================= */

async function validateProject(
projectData = {}
){

  const startedAt =
    Date.now();


  try{

    logger.info(
      "Build Validation Started"
    );


    const files =
      Array.isArray(
        projectData.files
      )
        ? projectData.files
        : [];


    const framework =
      normalizeFramework(
        projectData.framework
      );


    /*
     * -------------------------------------------------------
     * 1. FILE STRUCTURE
     * -------------------------------------------------------
     */

    const structure =
      validateFileStructure(
        files
      );


    /*
     * -------------------------------------------------------
     * 2. PACKAGE.JSON
     * -------------------------------------------------------
     */

    const packageResult =
      validatePackageJson(
        files
      );


    /*
     * -------------------------------------------------------
     * 3. SOURCE ENCODING
     * -------------------------------------------------------
     */

    const escapedSource =
      detectEscapedSource(
        files
      );


    /*
     * -------------------------------------------------------
     * 4. JAVASCRIPT SYNTAX
     * -------------------------------------------------------
     */

    const javascript =
      validateJavaScriptSyntax(
        files
      );


    /*
     * -------------------------------------------------------
     * 5. HTML
     * -------------------------------------------------------
     */

    const html =
      validateHtml(
        files
      );


    /*
     * -------------------------------------------------------
     * 6. CSS
     * -------------------------------------------------------
     */

    const css =
      validateCss(
        files
      );


    /*
     * -------------------------------------------------------
     * 7. ENTRYPOINTS
     * -------------------------------------------------------
     */

    const entrypoints =
      validateEntrypoints(

        files,

        framework,

        packageResult.packageJson

      );


    /*
     * -------------------------------------------------------
     * 8. DEPENDENCIES
     * -------------------------------------------------------
     */

    const dependencies =
      validateDependencies(
        packageResult.packageJson
      );


    /*
     * -------------------------------------------------------
     * 9. BUILD CONFIG
     * -------------------------------------------------------
     */

    const buildConfiguration =
      validateBuildConfiguration(

        framework,

        packageResult.packageJson

      );


    /*
     * -------------------------------------------------------
     * 10. PACKAGE MANAGER
     * -------------------------------------------------------
     */

    const packageManager =
      detectPackageManager(

        files,

        packageResult.packageJson

      );


    /*
     * -------------------------------------------------------
     * BUILD COMMAND
     * -------------------------------------------------------
     */

    const buildCommand =
      detectBuildCommand(

        packageResult.packageJson,

        packageManager

      );


    /*
     * -------------------------------------------------------
     * SOURCE HASH
     * -------------------------------------------------------
     */

    const sourceHash =
      calculateSourceHash(
        files
      );


    /*
     * -------------------------------------------------------
     * MERGE ERRORS
     * -------------------------------------------------------
     */

    const errors = [

      ...structure.errors,

      ...packageResult.errors,

      ...escapedSource.errors,

      ...javascript.errors,

      ...html.errors,

      ...css.errors,

      ...entrypoints.errors,

      ...dependencies.errors,

      ...buildConfiguration.errors

    ];


    /*
     * -------------------------------------------------------
     * MERGE WARNINGS
     * -------------------------------------------------------
     */

    const warnings = [

      ...structure.warnings,

      ...packageResult.warnings,

      ...escapedSource.warnings,

      ...javascript.warnings,

      ...html.warnings,

      ...css.warnings,

      ...entrypoints.warnings,

      ...dependencies.warnings,

      ...buildConfiguration.warnings

    ];


    /*
     * -------------------------------------------------------
     * RESULT
     * -------------------------------------------------------
     */

    const success =
      errors.length === 0;


    const duration =
      Date.now() -
      startedAt;


    if(
      success
    ){

      logger.success(
        "Build Validation Passed"
      );

    }

    else{

      logger.error(
        `Build Validation Failed: ${errors.length} error(s)`
      );

    }


    return {

      success,

      status:
        success
          ? "passed"
          : "failed",

      authoritative:
        false,

      validationMode:
        "static",

      serviceVersion:
        SERVICE_VERSION,

      projectId:
        projectData.projectId ||
        null,

      projectName:
        projectData.projectName ||
        null,

      framework,

      packageManager,

      buildCommand,

      sourceHash,

      files: {

        count:
          files.length,

        totalSize:
          structure.totalSize || 0

      },

      errors,

      warnings,

      summary: {

        errorCount:
          errors.length,

        warningCount:
          warnings.length,

        fileCount:
          files.length,

        durationMs:
          duration

      },

      validatedAt:
        new Date()

    };

  }

  catch(error){

    logger.error(
      `Build Validation Service Error: ${error.message}`
    );


    return {

      success:
        false,

      status:
        "failed",

      authoritative:
        false,

      validationMode:
        "static",

      serviceVersion:
        SERVICE_VERSION,

      projectId:
        projectData.projectId ||
        null,

      projectName:
        projectData.projectName ||
        null,

      framework:
        normalizeFramework(
          projectData.framework
        ),

      errors: [

        createIssue({

          code:
            "VALIDATION_SERVICE_ERROR",

          message:
            error.message,

          stage:
            "service"

        })

      ],

      warnings: [],

      summary: {

        errorCount:
          1,

        warningCount:
          0

      },

      validatedAt:
        new Date()

    };

  }

}


/* =========================================================
   QUICK VALIDATION
========================================================= */

async function validateFiles(
files = [],
options = {}
){

  return validateProject({

    files,

    framework:
      options.framework,

    projectId:
      options.projectId,

    projectName:
      options.projectName

  });

}


/* =========================================================
   BUILD READINESS
========================================================= */

function isBuildReady(
validationResult
){

  if(
    !validationResult ||
    typeof validationResult !==
      "object"
  ){

    return false;

  }


  if(
    validationResult.success !==
    true
  ){

    return false;

  }


  if(
    Array.isArray(
      validationResult.errors
    ) &&
    validationResult.errors.length >
      0
  ){

    return false;

  }


  return true;

}


/* =========================================================
   REPAIR CONTEXT
========================================================= */

function createRepairContext(
validationResult
){

  if(
    !validationResult
  ){

    return {

      success:
        false,

      errors: [

        {

          code:
            "VALIDATION_RESULT_MISSING",

          message:
            "Build validation result is missing."

        }

      ]

    };

  }


  const errors =
    Array.isArray(
      validationResult.errors
    )
      ? validationResult.errors
      : [];


  const affectedFiles =
    [
      ...new Set(

        errors

          .map(
            error =>
              error.file
          )

          .filter(
            Boolean
          )

      )
    ];


  return {

    success:
      true,

    sourceHash:
      validationResult.sourceHash ||
      null,

    framework:
      validationResult.framework ||
      "Other",

    packageManager:
      validationResult.packageManager ||
      "npm",

    buildCommand:
      validationResult.buildCommand ||
      null,

    affectedFiles,

    errors,

    warnings:
      validationResult.warnings ||
      []

  };

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  SERVICE_VERSION,

  validateProject,

  validateFiles,

  isBuildReady,

  createRepairContext,

  calculateSourceHash,

  normalizeFramework,

  normalizeFilePath,

  isSafeFilePath

};
