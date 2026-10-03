/* =========================================================
   ZYRIONOS — BUILD VALIDATION SERVICE
   ---------------------------------------------------------
   Version: 2.0.0

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Validate generated project files
   - Validate file paths
   - Validate package.json
   - Detect malformed / HTML-escaped JSX
   - Validate JavaScript syntax where safely possible
   - Validate framework / entry-point structure
   - Validate dependencies
   - Detect package manager
   - Detect build command
   - Validate build configuration
   - Generate deterministic source hash
   - Produce structured repair context
   - Never execute generated application code
   - Provide stable contract for:
       Master Agent
       Builder Agent
       Fix Agent
       Build Controller
       Workspace
       Deployment Gate

   ARCHITECTURE
   ---------------------------------------------------------

   Builder Agent
        ↓
   BuildValidationService
        ↓
      FAILED
        ↓
     Fix Agent
        ↓
   BuildValidationService
        ↓
      PASSED
        ↓
   Authoritative Build Executor
        ↓
   Preview / Deploy

   IMPORTANT
   ---------------------------------------------------------
   This service is STATIC validation only.

   authoritative === false

   It does NOT:
   - install dependencies
   - run npm/pnpm/yarn/bun
   - execute generated application code
   - start arbitrary servers
   - deploy containers
   - access project secrets

========================================================= */


/* =========================================================
   PACKAGES
========================================================= */

const crypto = require("crypto");
const vm = require("vm");


/* =========================================================
   SERVICES
========================================================= */

const logger = require("./loggerService");


/* =========================================================
   SERVICE METADATA
========================================================= */

const SERVICE_VERSION = "2.0.0";

const VALIDATION_MODE = "static";

const AUTHORITATIVE = false;


/* =========================================================
   LIMITS
========================================================= */

const MAX_FILES = Number(
  process.env.BUILD_VALIDATION_MAX_FILES ||
  1000
);

const MAX_FILE_SIZE = Number(
  process.env.BUILD_VALIDATION_MAX_FILE_SIZE ||
  2 * 1024 * 1024
);

const MAX_TOTAL_SIZE = Number(
  process.env.BUILD_VALIDATION_MAX_TOTAL_SIZE ||
  25 * 1024 * 1024
);


/* =========================================================
   FRAMEWORKS
========================================================= */

const ALLOWED_FRAMEWORKS = Object.freeze([
  "React",
  "Next.js",
  "Vue",
  "Node.js",
  "Express",
  "Other"
]);


/* =========================================================
   HELPERS
========================================================= */


/**
 * Safely convert a value to string.
 */
function toString(value, fallback = "") {

  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}


/**
 * Normalize framework name.
 */
function normalizeFramework(framework) {

  const value = toString(framework)
    .trim();

  if (!value) {
    return "Other";
  }

  const lower = value.toLowerCase();

  if (lower === "react") {
    return "React";
  }

  if (
    lower === "next" ||
    lower === "next.js" ||
    lower === "nextjs"
  ) {
    return "Next.js";
  }

  if (lower === "vue") {
    return "Vue";
  }

  if (
    lower === "node" ||
    lower === "node.js" ||
    lower === "nodejs"
  ) {
    return "Node.js";
  }

  if (lower === "express") {
    return "Express";
  }

  return "Other";
}


/**
 * Normalize project file path.
 */
function normalizeFilePath(filePath) {

  let value = toString(filePath)
    .trim()
    .replace(/\\/g, "/");

  while (value.startsWith("./")) {
    value = value.slice(2);
  }

  return value;
}


/**
 * Check safe relative project path.
 */
function isSafeFilePath(filePath) {

  const normalized = normalizeFilePath(filePath);

  if (!normalized) {
    return false;
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("\\")
  ) {
    return false;
  }

  if (normalized.includes("\0")) {
    return false;
  }

  const segments = normalized.split("/");

  if (segments.includes("..")) {
    return false;
  }

  return true;
}


/**
 * Extract file path from supported file shapes.
 */
function getFilePath(file) {

  if (
    !file ||
    typeof file !== "object"
  ) {
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
 * Extract file content.
 */
function getFileContent(file) {

  if (
    !file ||
    typeof file !== "object"
  ) {
    return "";
  }

  if (
    typeof file.content === "string"
  ) {
    return file.content;
  }

  if (
    typeof file.source === "string"
  ) {
    return file.source;
  }

  return "";
}


/**
 * Return lowercase extension.
 */
function getExtension(filePath) {

  const value = normalizeFilePath(filePath)
    .toLowerCase();

  const index = value.lastIndexOf(".");

  if (index === -1) {
    return "";
  }

  return value.slice(index);
}


/**
 * Determine whether a path is a source file.
 */
function isSourceFile(filePath) {

  return [
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".vue"
  ].includes(
    getExtension(filePath)
  );
}


/**
 * Find file by exact normalized path.
 */
function findFile(files, targetPath) {

  const normalizedTarget =
    normalizeFilePath(targetPath);

  return files.find(
    file =>
      getFilePath(file) === normalizedTarget
  );
}


/**
 * Find files by extension.
 */
function getFilesByExtension(
  files,
  extensions
) {

  const normalizedExtensions =
    extensions.map(
      extension =>
        extension.toLowerCase()
    );

  return files.filter(file => {

    const filePath =
      getFilePath(file)
        .toLowerCase();

    return normalizedExtensions.some(
      extension =>
        filePath.endsWith(extension)
    );
  });
}


/**
 * Calculate UTF-8 byte size.
 */
function getByteSize(content) {

  return Buffer.byteLength(
    toString(content),
    "utf8"
  );
}


/**
 * Create deterministic SHA-256 source hash.
 */
function calculateSourceHash(files) {

  const hash =
    crypto.createHash("sha256");

  const normalized =
    Array.isArray(files)
      ? files
          .map(file => ({
            path: getFilePath(file),
            content: getFileContent(file)
          }))
          .sort((a, b) =>
            a.path.localeCompare(b.path)
          )
      : [];

  for (const file of normalized) {

    hash.update(file.path);
    hash.update("\n");

    hash.update(file.content);
    hash.update("\n---FILE---\n");
  }

  return hash.digest("hex");
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
}) {

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

function validateFileStructure(files) {

  const errors = [];
  const warnings = [];

  const seenPaths = new Set();

  if (!Array.isArray(files)) {

    errors.push(
      createIssue({
        code: "FILES_NOT_ARRAY",
        message: "Project files must be an array."
      })
    );

    return {
      errors,
      warnings,
      totalSize: 0
    };
  }

  if (files.length === 0) {

    errors.push(
      createIssue({
        code: "NO_PROJECT_FILES",
        message: "Project contains no generated files."
      })
    );
  }

  if (files.length > MAX_FILES) {

    errors.push(
      createIssue({
        code: "FILE_LIMIT_EXCEEDED",
        message:
          `Project contains ${files.length} files. ` +
          `Maximum allowed is ${MAX_FILES}.`,
        details: {
          count: files.length,
          maximum: MAX_FILES
        }
      })
    );
  }

  let totalSize = 0;

  for (const file of files) {

    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);

    if (!filePath) {

      errors.push(
        createIssue({
          code: "FILE_PATH_MISSING",
          message:
            "Generated file is missing a path."
        })
      );

      continue;
    }

    if (!isSafeFilePath(filePath)) {

      errors.push(
        createIssue({
          code: "UNSAFE_FILE_PATH",
          message:
            `Unsafe project file path: ${filePath}`,
          file: filePath
        })
      );

      continue;
    }

    if (seenPaths.has(filePath)) {

      errors.push(
        createIssue({
          code: "DUPLICATE_FILE_PATH",
          message:
            `Duplicate project file: ${filePath}`,
          file: filePath
        })
      );
    }

    seenPaths.add(filePath);

    const byteSize =
      getByteSize(content);

    totalSize += byteSize;

    if (byteSize > MAX_FILE_SIZE) {

      errors.push(
        createIssue({
          code: "FILE_SIZE_EXCEEDED",
          message:
            `File exceeds maximum allowed size of ` +
            `${MAX_FILE_SIZE} bytes.`,
          file: filePath,
          details: {
            size: byteSize,
            maximum: MAX_FILE_SIZE
          }
        })
      );
    }
  }

  if (totalSize > MAX_TOTAL_SIZE) {

    errors.push(
      createIssue({
        code: "PROJECT_SIZE_EXCEEDED",
        message:
          `Project source exceeds maximum allowed size ` +
          `of ${MAX_TOTAL_SIZE} bytes.`,
        details: {
          size: totalSize,
          maximum: MAX_TOTAL_SIZE
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

function validatePackageJson(files) {

  const errors = [];
  const warnings = [];

  const packageFile =
    findFile(files, "package.json");

  if (!packageFile) {

    warnings.push(
      createIssue({
        code: "PACKAGE_JSON_MISSING",
        message: "package.json is missing.",
        severity: "warning"
      })
    );

    return {
      packageJson: null,
      errors,
      warnings
    };
  }

  const content =
    getFileContent(packageFile);

  let packageJson;

  try {

    packageJson =
      JSON.parse(content);

  } catch (error) {

    errors.push(
      createIssue({
        code: "INVALID_PACKAGE_JSON",
        message:
          `package.json is invalid JSON: ${error.message}`,
        file: "package.json",
        stage: "package",
        details: {
          name: error.name,
          originalError: error.message
        }
      })
    );

    return {
      packageJson: null,
      errors,
      warnings
    };
  }

  if (
    !packageJson ||
    typeof packageJson !== "object" ||
    Array.isArray(packageJson)
  ) {

    errors.push(
      createIssue({
        code: "INVALID_PACKAGE_ROOT",
        message:
          "package.json must contain a JSON object.",
        file: "package.json",
        stage: "package"
      })
    );

    return {
      packageJson,
      errors,
      warnings
    };
  }

  if (
    packageJson.scripts !== undefined &&
    (
      !packageJson.scripts ||
      typeof packageJson.scripts !== "object" ||
      Array.isArray(packageJson.scripts)
    )
  ) {

    errors.push(
      createIssue({
        code: "INVALID_NPM_SCRIPTS",
        message:
          "package.json scripts must be an object.",
        file: "package.json",
        stage: "package"
      })
    );
  }

  const scripts =
    packageJson.scripts &&
    typeof packageJson.scripts === "object"
      ? packageJson.scripts
      : {};

  const hasBuildScript =
    typeof scripts.build === "string" &&
    scripts.build.trim().length > 0;

  const hasStartScript =
    typeof scripts.start === "string" &&
    scripts.start.trim().length > 0;

  if (
    !hasBuildScript &&
    !hasStartScript
  ) {

    warnings.push(
      createIssue({
        code: "NO_BUILD_OR_START_SCRIPT",
        message:
          "package.json contains neither a build script nor a start script.",
        file: "package.json",
        severity: "warning",
        stage: "package"
      })
    );
  }

  if (
    packageJson.dependencies !== undefined &&
    (
      !packageJson.dependencies ||
      typeof packageJson.dependencies !== "object" ||
      Array.isArray(packageJson.dependencies)
    )
  ) {

    errors.push(
      createIssue({
        code: "INVALID_DEPENDENCIES_OBJECT",
        message:
          "package.json dependencies must be an object.",
        file: "package.json",
        stage: "package"
      })
    );
  }

  if (
    packageJson.devDependencies !== undefined &&
    (
      !packageJson.devDependencies ||
      typeof packageJson.devDependencies !== "object" ||
      Array.isArray(packageJson.devDependencies)
    )
  ) {

    errors.push(
      createIssue({
        code: "INVALID_DEV_DEPENDENCIES_OBJECT",
        message:
          "package.json devDependencies must be an object.",
        file: "package.json",
        stage: "package"
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
   ESCAPED SOURCE DETECTION
========================================================= */

function detectEscapedSource(files) {

  const errors = [];
  const warnings = [];

  const sourceFiles =
    getFilesByExtension(
      files,
      [
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".ts",
        ".tsx",
        ".vue"
      ]
    );

  for (const file of sourceFiles) {

    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);

    /*
     * Important:
     * Do not decode source automatically.
     * We only detect the corruption and let Fix Agent repair it.
     */

    const hasEscapedTag =
      /&lt;\/?[A-Za-z_$][^;]*&gt;/
        .test(content);

    const hasEscapedBrace =
      /&lbrace;|&rbrace;/
        .test(content);

    const hasEscapedQuote =
      /&quot;/
        .test(content);

    if (
      hasEscapedTag ||
      hasEscapedBrace ||
      hasEscapedQuote
    ) {

      errors.push(
        createIssue({
          code: "HTML_ESCAPED_SOURCE",
          message:
            "Source appears to contain HTML-escaped code. " +
            "JSX/JavaScript source must contain real syntax " +
            "instead of HTML entities.",
          file: filePath,
          stage: "syntax",
          details: {
            escapedTag: hasEscapedTag,
            escapedBrace: hasEscapedBrace,
            escapedQuote: hasEscapedQuote
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
   JAVASCRIPT SYNTAX VALIDATION
========================================================= */


/**
 * Detect JSX-like syntax.
 */
function containsJSX(content) {

  return /<\s*[A-Za-z_$][^>]*>/.test(
    content
  );
}


/**
 * Detect TypeScript syntax which vm.Script cannot parse.
 */
function containsTypeScript(content) {

  return (
    /\binterface\s+[A-Za-z_$]/.test(content) ||
    /\btype\s+[A-Za-z_$][\w$]*\s*=/.test(content) ||
    /\benum\s+[A-Za-z_$]/.test(content) ||
    /\b(?:public|private|protected|readonly)\s+[A-Za-z_$]/.test(content) ||
    /:\s*(?:string|number|boolean|unknown|any|never|void|ReactNode)\b/.test(content) ||
    /<\s*[A-Za-z_$][\w$]*\s*>/.test(content)
  );
}


/**
 * Detect ESM syntax.
 */
function containsESModuleSyntax(content) {

  return (
    /^\s*import\s+/m.test(content) ||
    /^\s*export\s+/m.test(content)
  );
}


/**
 * Validate JavaScript where Node VM can safely parse it.
 *
 * JSX / TS / TSX / ESM are delegated to the
 * authoritative framework/compiler layer.
 */
function validateJavaScriptSyntax(files) {

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

  for (const file of javascriptFiles) {

    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);

    if (!content.trim()) {

      warnings.push(
        createIssue({
          code: "EMPTY_SOURCE_FILE",
          message:
            "JavaScript source file is empty.",
          file: filePath,
          severity: "warning",
          stage: "syntax"
        })
      );

      continue;
    }

    /*
     * JSX cannot be parsed by vm.Script.
     */
    if (containsJSX(content)) {

      warnings.push(
        createIssue({
          code:
            "JSX_REQUIRES_FRAMEWORK_COMPILER",
          message:
            "JavaScript file contains JSX syntax and requires " +
            "the framework compiler for authoritative validation.",
          file: filePath,
          severity: "warning",
          stage: "syntax"
        })
      );

      continue;
    }

    /*
     * ESM is valid JavaScript but vm.Script is not an
     * appropriate validator for it.
     */
    if (containsESModuleSyntax(content)) {

      warnings.push(
        createIssue({
          code:
            "ES_MODULE_REQUIRES_MODULE_PARSER",
          message:
            "ES module syntax detected. Static VM parsing is skipped; " +
            "authoritative compiler validation is required.",
          file: filePath,
          severity: "warning",
          stage: "syntax"
        })
      );

      continue;
    }

    try {

      new vm.Script(
        content,
        {
          filename: filePath,
          displayErrors: true
        }
      );

    } catch (error) {

      errors.push(
        createIssue({
          code:
            "JAVASCRIPT_SYNTAX_ERROR",
          message:
            error.message,
          file: filePath,
          stage: "syntax",
          details: {
            name: error.name,
            stack: error.stack
          }
        })
      );
    }
  }

  /*
   * TS/TSX structural warning.
   */
  const typescriptFiles =
    getFilesByExtension(
      files,
      [
        ".ts",
        ".tsx"
      ]
    );

  for (const file of typescriptFiles) {

    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);

    if (!content.trim()) {

      warnings.push(
        createIssue({
          code:
            "EMPTY_TYPESCRIPT_SOURCE_FILE",
          message:
            "TypeScript source file is empty.",
          file: filePath,
          severity: "warning",
          stage: "syntax"
        })
      );

      continue;
    }

    warnings.push(
      createIssue({
        code:
          "TYPESCRIPT_REQUIRES_COMPILER",
        message:
          "TypeScript source requires the framework/build compiler " +
          "for authoritative syntax and type validation.",
        file: filePath,
        severity: "warning",
        stage: "syntax"
      })
    );

    /*
     * Keep helper invocation explicit so this detector remains
     * available for future compiler adapters.
     */
    containsTypeScript(content);
  }

  return {
    errors,
    warnings
  };
}


/* =========================================================
   HTML VALIDATION
========================================================= */

function validateHtml(files) {

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

  for (const file of htmlFiles) {

    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);

    if (!content.trim()) {

      errors.push(
        createIssue({
          code: "EMPTY_HTML_FILE",
          message: "HTML file is empty.",
          file: filePath,
          stage: "html"
        })
      );

      continue;
    }

    const lower =
      content.toLowerCase();

    if (
      !lower.includes("<html") &&
      !lower.includes("<!doctype")
    ) {

      warnings.push(
        createIssue({
          code:
            "HTML_DOCUMENT_STRUCTURE_UNCLEAR",
          message:
            "HTML file does not appear to contain a normal HTML document root.",
          file: filePath,
          severity: "warning",
          stage: "html"
        })
      );
    }

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

    if (scriptOpen !== scriptClose) {

      errors.push(
        createIssue({
          code:
            "HTML_SCRIPT_TAG_MISMATCH",
          message:
            "HTML contains an unmatched script tag.",
          file: filePath,
          stage: "html"
        })
      );
    }

    const styleOpen =
      (
        content.match(
          /<style\b/gi
        ) || []
      ).length;

    const styleClose =
      (
        content.match(
          /<\/style>/gi
        ) || []
      ).length;

    if (styleOpen !== styleClose) {

      errors.push(
        createIssue({
          code:
            "HTML_STYLE_TAG_MISMATCH",
          message:
            "HTML contains an unmatched style tag.",
          file: filePath,
          stage: "html"
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

function validateCss(files) {

  const errors = [];
  const warnings = [];

  const cssFiles =
    getFilesByExtension(
      files,
      [".css"]
    );

  for (const file of cssFiles) {

    const filePath =
      getFilePath(file);

    const content =
      getFileContent(file);

    let braces = 0;
    let parentheses = 0;
    let brackets = 0;

    for (const character of content) {

      if (character === "{") {
        braces++;
      }

      if (character === "}") {
        braces--;
      }

      if (character === "(") {
        parentheses++;
      }

      if (character === ")") {
        parentheses--;
      }

      if (character === "[") {
        brackets++;
      }

      if (character === "]") {
        brackets--;
      }

      if (
        braces < 0 ||
        parentheses < 0 ||
        brackets < 0
      ) {
        break;
      }
    }

    if (braces !== 0) {

      errors.push(
        createIssue({
          code: "CSS_BRACE_MISMATCH",
          message:
            "CSS contains unmatched braces.",
          file: filePath,
          stage: "css"
        })
      );
    }

    if (parentheses !== 0) {

      errors.push(
        createIssue({
          code:
            "CSS_PARENTHESES_MISMATCH",
          message:
            "CSS contains unmatched parentheses.",
          file: filePath,
          stage: "css"
        })
      );
    }

    if (brackets !== 0) {

      errors.push(
        createIssue({
          code:
            "CSS_BRACKETS_MISMATCH",
          message:
            "CSS contains unmatched brackets.",
          file: filePath,
          stage: "css"
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
) {

  const errors = [];
  const warnings = [];

  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );

  if (framework === "React") {

    const reactEntries = [

      "src/main.jsx",
      "src/main.js",
      "src/main.tsx",
      "src/main.ts",

      "src/index.jsx",
      "src/index.js",
      "src/index.tsx",
      "src/index.ts",

      "main.jsx",
      "main.js",
      "main.tsx",
      "main.ts",

      "index.jsx",
      "index.js"

    ];

    const hasEntry =
      reactEntries.some(
        filePath =>
          paths.has(filePath)
      );

    if (!hasEntry) {

      warnings.push(
        createIssue({
          code:
            "REACT_ENTRYPOINT_NOT_FOUND",
          message:
            "A standard React entry point could not be found.",
          severity: "warning",
          stage: "entrypoint"
        })
      );
    }
  }

  if (framework === "Next.js") {

    const nextEntries = [

      "app/page.js",
      "app/page.jsx",
      "app/page.ts",
      "app/page.tsx",

      "pages/index.js",
      "pages/index.jsx",
      "pages/index.ts",
      "pages/index.tsx",

      "src/app/page.js",
      "src/app/page.jsx",
      "src/app/page.ts",
      "src/app/page.tsx",

      "src/pages/index.js",
      "src/pages/index.jsx",
      "src/pages/index.ts",
      "src/pages/index.tsx"

    ];

    const hasNextEntry =
      nextEntries.some(
        filePath =>
          paths.has(filePath)
      );

    if (!hasNextEntry) {

      errors.push(
        createIssue({
          code:
            "NEXT_ENTRYPOINT_NOT_FOUND",
          message:
            "No supported Next.js application entry point was found.",
          stage: "entrypoint"
        })
      );
    }
  }

  if (
    framework === "Node.js" ||
    framework === "Express"
  ) {

    if (!packageJson) {

      warnings.push(
        createIssue({
          code:
            "NODE_PACKAGE_JSON_UNAVAILABLE",
          message:
            "Node/Express entrypoint validation is limited because package.json is unavailable.",
          severity: "warning",
          stage: "entrypoint"
        })
      );

    } else {

      const startScript =
        packageJson
          .scripts
          ?.start;

      if (!startScript) {

        warnings.push(
          createIssue({
            code:
              "NODE_START_SCRIPT_MISSING",
            message:
              "Node/Express project does not define npm start.",
            severity: "warning",
            stage: "entrypoint"
          })
        );
      }
    }
  }

  return {
    errors,
    warnings
  };
}


/* =========================================================
   DEPENDENCY VALIDATION
========================================================= */

function validateDependencies(packageJson) {

  const errors = [];
  const warnings = [];

  if (!packageJson) {

    return {
      errors,
      warnings
    };
  }

  const dependencies =
    packageJson.dependencies &&
    typeof packageJson.dependencies === "object"
      ? packageJson.dependencies
      : {};

  const devDependencies =
    packageJson.devDependencies &&
    typeof packageJson.devDependencies === "object"
      ? packageJson.devDependencies
      : {};

  const peerDependencies =
    packageJson.peerDependencies &&
    typeof packageJson.peerDependencies === "object"
      ? packageJson.peerDependencies
      : {};

  const dependencyNames =
    new Set([
      ...Object.keys(dependencies),
      ...Object.keys(devDependencies),
      ...Object.keys(peerDependencies)
    ]);

  for (
    const [name, version]
    of Object.entries({
      ...dependencies,
      ...devDependencies,
      ...peerDependencies
    })
  ) {

    if (
      !version ||
      typeof version !== "string" ||
      !version.trim()
    ) {

      errors.push(
        createIssue({
          code:
            "INVALID_DEPENDENCY_VERSION",
          message:
            `Dependency "${name}" has an invalid version declaration.`,
          file: "package.json",
          stage: "dependency"
        })
      );
    }
  }

  if (
    dependencyNames.has("react") &&
    dependencyNames.has("vue")
  ) {

    warnings.push(
      createIssue({
        code:
          "MULTIPLE_FRONTEND_FRAMEWORKS",
        message:
          "package.json contains both React and Vue dependencies.",
        file: "package.json",
        severity: "warning",
        stage: "dependency"
      })
    );
  }

  if (
    dependencyNames.has("next") &&
    !dependencyNames.has("react")
  ) {

    warnings.push(
      createIssue({
        code:
          "NEXT_WITHOUT_REACT",
        message:
          "Next.js is declared without an explicit React dependency.",
        file: "package.json",
        severity: "warning",
        stage: "dependency"
      })
    );
  }

  return {
    errors,
    warnings
  };
}


/* =========================================================
   PACKAGE MANAGER DETECTION
========================================================= */

function detectPackageManager(
  files,
  packageJson
) {

  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );

  /*
   * Lockfiles take priority because they are concrete
   * evidence of the project's package manager.
   */

  if (
    paths.has("pnpm-lock.yaml")
  ) {
    return "pnpm";
  }

  if (
    paths.has("yarn.lock")
  ) {
    return "yarn";
  }

  if (
    paths.has("bun.lockb") ||
    paths.has("bun.lock")
  ) {
    return "bun";
  }

  if (
    paths.has("package-lock.json")
  ) {
    return "npm";
  }

  if (
    packageJson &&
    typeof packageJson.packageManager === "string"
  ) {

    const value =
      packageJson.packageManager
        .trim()
        .toLowerCase();

    if (value.startsWith("pnpm")) {
      return "pnpm";
    }

    if (value.startsWith("yarn")) {
      return "yarn";
    }

    if (value.startsWith("bun")) {
      return "bun";
    }

    if (value.startsWith("npm")) {
      return "npm";
    }
  }

  return "npm";
}


/* =========================================================
   BUILD COMMAND
========================================================= */

function detectBuildCommand(
  packageJson,
  packageManager
) {

  if (!packageJson) {
    return null;
  }

  const buildScript =
    packageJson
      .scripts
      ?.build;

  if (
    typeof buildScript === "string" &&
    buildScript.trim()
  ) {

    return `${packageManager} run build`;
  }

  return null;
}


/* =========================================================
   START COMMAND
========================================================= */

function detectStartCommand(
  packageJson,
  packageManager
) {

  if (!packageJson) {
    return null;
  }

  const startScript =
    packageJson
      .scripts
      ?.start;

  if (
    typeof startScript === "string" &&
    startScript.trim()
  ) {

    return `${packageManager} run start`;
  }

  return null;
}


/* =========================================================
   BUILD CONFIGURATION
========================================================= */

function validateBuildConfiguration(
  framework,
  packageJson
) {

  const errors = [];
  const warnings = [];

  if (!packageJson) {

    warnings.push(
      createIssue({
        code:
          "BUILD_CONFIGURATION_UNAVAILABLE",
        message:
          "Build configuration cannot be fully determined without package.json.",
        severity: "warning",
        stage: "build"
      })
    );

    return {
      errors,
      warnings
    };
  }

  const scripts =
    packageJson.scripts &&
    typeof packageJson.scripts === "object"
      ? packageJson.scripts
      : {};

  const buildScript =
    typeof scripts.build === "string"
      ? scripts.build.trim()
      : "";

  if (
    (
      framework === "React" ||
      framework === "Next.js" ||
      framework === "Vue"
    ) &&
    !buildScript
  ) {

    warnings.push(
      createIssue({
        code:
          "FRONTEND_BUILD_SCRIPT_MISSING",
        message:
          `${framework} project does not define an npm build script.`,
        file: "package.json",
        severity: "warning",
        stage: "build"
      })
    );
  }

  if (framework === "Next.js") {

    const nextDependency =
      packageJson.dependencies
        ?.next ||
      packageJson.devDependencies
        ?.next;

    if (!nextDependency) {

      errors.push(
        createIssue({
          code:
            "NEXT_DEPENDENCY_MISSING",
          message:
            "Next.js project is missing the next dependency.",
          file: "package.json",
          stage: "build"
        })
      );
    }
  }

  if (framework === "React") {

    const reactDependency =
      packageJson.dependencies
        ?.react ||
      packageJson.devDependencies
        ?.react;

    if (!reactDependency) {

      warnings.push(
        createIssue({
          code:
            "REACT_DEPENDENCY_MISSING",
          message:
            "React project does not declare the react dependency.",
          file: "package.json",
          severity: "warning",
          stage: "build"
        })
      );
    }
  }

  if (framework === "Vue") {

    const vueDependency =
      packageJson.dependencies
        ?.vue ||
      packageJson.devDependencies
        ?.vue;

    if (!vueDependency) {

      errors.push(
        createIssue({
          code:
            "VUE_DEPENDENCY_MISSING",
          message:
            "Vue project is missing the vue dependency.",
          file: "package.json",
          stage: "build"
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
   FRAMEWORK CONSISTENCY
========================================================= */

function validateFrameworkConsistency(
  framework,
  packageJson
) {

  const errors = [];
  const warnings = [];

  if (!packageJson) {
    return {
      errors,
      warnings
    };
  }

  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.peerDependencies || {})
  };

  const hasReact =
    Boolean(dependencies.react);

  const hasNext =
    Boolean(dependencies.next);

  const hasVue =
    Boolean(dependencies.vue);

  if (
    framework === "React" &&
    hasNext
  ) {

    warnings.push(
      createIssue({
        code:
          "REACT_FRAMEWORK_WITH_NEXT_DEPENDENCY",
        message:
          "Project is classified as React but package.json also contains Next.js.",
        file: "package.json",
        severity: "warning",
        stage: "framework"
      })
    );
  }

  if (
    framework === "Next.js" &&
    !hasNext
  ) {

    errors.push(
      createIssue({
        code:
          "FRAMEWORK_NEXT_DEPENDENCY_MISSING",
        message:
          "Project is classified as Next.js but next is not declared.",
        file: "package.json",
        stage: "framework"
      })
    );
  }

  if (
    framework === "Vue" &&
    !hasVue
  ) {

    errors.push(
      createIssue({
        code:
          "FRAMEWORK_VUE_DEPENDENCY_MISSING",
        message:
          "Project is classified as Vue but vue is not declared.",
        file: "package.json",
        stage: "framework"
      })
    );
  }

  if (
    framework === "React" &&
    !hasReact
  ) {

    warnings.push(
      createIssue({
        code:
          "FRAMEWORK_REACT_DEPENDENCY_MISSING",
        message:
          "Project is classified as React but react is not declared.",
        file: "package.json",
        severity: "warning",
        stage: "framework"
      })
    );
  }

  return {
    errors,
    warnings
  };
}


/* =========================================================
   LOCKFILE CONSISTENCY
========================================================= */

function validateLockfileConsistency(
  files,
  packageManager
) {

  const errors = [];
  const warnings = [];

  const paths =
    new Set(
      files.map(
        file =>
          getFilePath(file)
      )
    );

  const lockfiles = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb"
  ];

  const presentLockfiles =
    lockfiles.filter(
      file =>
        paths.has(file)
    );

  if (
    presentLockfiles.length > 1
  ) {

    warnings.push(
      createIssue({
        code:
          "MULTIPLE_LOCKFILES",
        message:
          `Multiple package-manager lockfiles detected: ${presentLockfiles.join(", ")}.`,
        severity: "warning",
        stage: "package-manager",
        details: {
          lockfiles: presentLockfiles
        }
      })
    );
  }

  if (
    packageManager === "npm" &&
    paths.has("pnpm-lock.yaml")
  ) {

    warnings.push(
      createIssue({
        code:
          "PACKAGE_MANAGER_LOCKFILE_MISMATCH",
        message:
          "Detected npm as package manager while pnpm-lock.yaml is present.",
        severity: "warning",
        stage: "package-manager"
      })
    );
  }

  if (
    packageManager === "pnpm" &&
    paths.has("package-lock.json")
  ) {

    warnings.push(
      createIssue({
        code:
          "PACKAGE_MANAGER_LOCKFILE_MISMATCH",
        message:
          "Detected pnpm as package manager while package-lock.json is present.",
        severity: "warning",
        stage: "package-manager"
      })
    );
  }

  return {
    errors,
    warnings
  };
}


/* =========================================================
   PROJECT FILE NORMALIZATION
========================================================= */

function normalizeFiles(files) {

  if (!Array.isArray(files)) {
    return [];
  }

  return files.map(file => ({
    ...file,
    path: getFilePath(file),
    content: getFileContent(file)
  }));
}


/* =========================================================
   MASTER VALIDATION
========================================================= */

async function validateProject(
  projectData = {}
) {

  const startedAt =
    Date.now();

  try {

    logger.info(
      "[BuildValidationService] Validation started"
    );

    const rawFiles =
      Array.isArray(projectData.files)
        ? projectData.files
        : [];

    const files =
      normalizeFiles(rawFiles);

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
      validateFileStructure(files);

    /*
     * -------------------------------------------------------
     * 2. PACKAGE.JSON
     * -------------------------------------------------------
     */

    const packageResult =
      validatePackageJson(files);

    /*
     * -------------------------------------------------------
     * 3. SOURCE ENCODING
     * -------------------------------------------------------
     */

    const escapedSource =
      detectEscapedSource(files);

    /*
     * -------------------------------------------------------
     * 4. JAVASCRIPT / TYPESCRIPT
     * -------------------------------------------------------
     */

    const javascript =
      validateJavaScriptSyntax(files);

    /*
     * -------------------------------------------------------
     * 5. HTML
     * -------------------------------------------------------
     */

    const html =
      validateHtml(files);

    /*
     * -------------------------------------------------------
     * 6. CSS
     * -------------------------------------------------------
     */

    const css =
      validateCss(files);

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
     * 9. BUILD CONFIGURATION
     * -------------------------------------------------------
     */

    const buildConfiguration =
      validateBuildConfiguration(
        framework,
        packageResult.packageJson
      );

    /*
     * -------------------------------------------------------
     * 10. FRAMEWORK CONSISTENCY
     * -------------------------------------------------------
     */

    const frameworkConsistency =
      validateFrameworkConsistency(
        framework,
        packageResult.packageJson
      );

    /*
     * -------------------------------------------------------
     * 11. PACKAGE MANAGER
     * -------------------------------------------------------
     */

    const packageManager =
      detectPackageManager(
        files,
        packageResult.packageJson
      );

    /*
     * -------------------------------------------------------
     * 12. LOCKFILE CONSISTENCY
     * -------------------------------------------------------
     */

    const lockfileConsistency =
      validateLockfileConsistency(
        files,
        packageManager
      );

    /*
     * -------------------------------------------------------
     * 13. BUILD COMMAND
     * -------------------------------------------------------
     */

    const buildCommand =
      detectBuildCommand(
        packageResult.packageJson,
        packageManager
      );

    /*
     * -------------------------------------------------------
     * 14. START COMMAND
     * -------------------------------------------------------
     */

    const startCommand =
      detectStartCommand(
        packageResult.packageJson,
        packageManager
      );

    /*
     * -------------------------------------------------------
     * 15. SOURCE HASH
     * -------------------------------------------------------
     */

    const sourceHash =
      calculateSourceHash(files);

    /*
     * -------------------------------------------------------
     * 16. MERGE ERRORS
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

      ...buildConfiguration.errors,

      ...frameworkConsistency.errors,

      ...lockfileConsistency.errors

    ];

    /*
     * -------------------------------------------------------
     * 17. MERGE WARNINGS
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

      ...buildConfiguration.warnings,

      ...frameworkConsistency.warnings,

      ...lockfileConsistency.warnings

    ];

    /*
     * -------------------------------------------------------
     * 18. RESULT
     * -------------------------------------------------------
     */

    const success =
      errors.length === 0;

    const duration =
      Date.now() - startedAt;

    const result = {

      success,

      status:
        success
          ? "passed"
          : "failed",

      authoritative:
        AUTHORITATIVE,

      validationMode:
        VALIDATION_MODE,

      serviceVersion:
        SERVICE_VERSION,

      projectId:
        projectData.projectId ||
        null,

      projectName:
        projectData.projectName ||
        null,

      framework,

      supportedFramework:
        ALLOWED_FRAMEWORKS.includes(
          framework
        ),

      packageManager,

      buildCommand,

      startCommand,

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
        new Date(),

      /*
       * Useful for Master/Fix/Workspace.
       */
      metadata: {

        staticValidation:
          true,

        generatedCodeExecuted:
          false,

        dependenciesInstalled:
          false,

        buildCommandExecuted:
          false,

        runtimeStarted:
          false,

        browserSmokeTested:
          false

      }

    };

    if (success) {

      logger.info(
        `[BuildValidationService] Validation passed ` +
        `(${duration}ms)`
      );

    } else {

      logger.error(
        `[BuildValidationService] Validation failed: ` +
        `${errors.length} error(s)`
      );
    }

    return result;

  } catch (error) {

    logger.error(
      `[BuildValidationService] Service error: ${error.message}`
    );

    return {

      success: false,

      status: "failed",

      authoritative:
        AUTHORITATIVE,

      validationMode:
        VALIDATION_MODE,

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

      packageManager:
        "npm",

      buildCommand:
        null,

      startCommand:
        null,

      sourceHash:
        null,

      errors: [

        createIssue({
          code:
            "VALIDATION_SERVICE_ERROR",
          message:
            error.message,
          stage:
            "service",
          details: {
            name:
              error.name
          }
        })

      ],

      warnings: [],

      summary: {

        errorCount:
          1,

        warningCount:
          0

      },

      metadata: {

        staticValidation:
          true,

        generatedCodeExecuted:
          false,

        dependenciesInstalled:
          false,

        buildCommandExecuted:
          false,

        runtimeStarted:
          false,

        browserSmokeTested:
          false

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
) {

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
) {

  if (
    !validationResult ||
    typeof validationResult !== "object"
  ) {
    return false;
  }

  if (
    validationResult.success !== true
  ) {
    return false;
  }

  if (
    Array.isArray(validationResult.errors) &&
    validationResult.errors.length > 0
  ) {
    return false;
  }

  return true;
}


/**
 * Static validation passed, but this does NOT mean
 * authoritative build success.
 */
function isStaticallyValid(
  validationResult
) {

  return (
    Boolean(validationResult) &&
    validationResult.success === true &&
    Array.isArray(validationResult.errors) &&
    validationResult.errors.length === 0
  );
}


/**
 * Authoritative build readiness.
 *
 * This intentionally requires authoritative === true.
 *
 * Therefore static validation alone cannot unlock
 * production deployment.
 */
function isAuthoritativeBuildReady(
  validationResult
) {

  return (
    Boolean(validationResult) &&
    validationResult.success === true &&
    validationResult.authoritative === true &&
    Array.isArray(validationResult.errors) &&
    validationResult.errors.length === 0
  );
}


/* =========================================================
   REPAIR CONTEXT
========================================================= */

function createRepairContext(
  validationResult
) {

  if (!validationResult) {

    return {

      success: false,

      sourceHash: null,

      framework: "Other",

      packageManager: "npm",

      buildCommand: null,

      affectedFiles: [],

      errors: [

        {
          code:
            "VALIDATION_RESULT_MISSING",

          message:
            "Build validation result is missing."
        }

      ],

      warnings: []

    };
  }

  const errors =
    Array.isArray(
      validationResult.errors
    )
      ? validationResult.errors
      : [];

  const warnings =
    Array.isArray(
      validationResult.warnings
    )
      ? validationResult.warnings
      : [];

  const affectedFiles =
    [
      ...new Set(

        errors

          .map(
            error =>
              error &&
              error.file
          )

          .filter(
            Boolean
          )

      )
    ];

  return {

    success:
      validationResult.success === true,

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

    startCommand:
      validationResult.startCommand ||
      null,

    affectedFiles,

    errors,

    warnings,

    validationMode:
      validationResult.validationMode ||
      VALIDATION_MODE,

    authoritative:
      validationResult.authoritative === true

  };
}


/* =========================================================
   VALIDATION SUMMARY
========================================================= */

function getValidationSummary(
  validationResult
) {

  if (
    !validationResult ||
    typeof validationResult !== "object"
  ) {

    return {

      status:
        "unknown",

      success:
        false,

      authoritative:
        false,

      errorCount:
        1,

      warningCount:
        0

    };
  }

  return {

    status:
      validationResult.status ||
      (
        validationResult.success
          ? "passed"
          : "failed"
      ),

    success:
      validationResult.success === true,

    authoritative:
      validationResult.authoritative === true,

    validationMode:
      validationResult.validationMode ||
      VALIDATION_MODE,

    errorCount:
      Array.isArray(
        validationResult.errors
      )
        ? validationResult.errors.length
        : 0,

    warningCount:
      Array.isArray(
        validationResult.warnings
      )
        ? validationResult.warnings.length
        : 0,

    sourceHash:
      validationResult.sourceHash ||
      null

  };
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  SERVICE_VERSION,

  VALIDATION_MODE,

  AUTHORITATIVE,

  ALLOWED_FRAMEWORKS,

  validateProject,

  validateFiles,

  isBuildReady,

  isStaticallyValid,

  isAuthoritativeBuildReady,

  createRepairContext,

  getValidationSummary,

  calculateSourceHash,

  normalizeFramework,

  normalizeFilePath,

  isSafeFilePath,

  getFilePath,

  getFileContent,

  getFilesByExtension,

  detectPackageManager,

  detectBuildCommand,

  detectStartCommand

};
