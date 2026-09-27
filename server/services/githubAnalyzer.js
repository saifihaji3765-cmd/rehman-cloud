"use strict";

/**
 * =========================================================
 * ZyrionOS
 * GitHub Repository Analyzer
 * =========================================================
 *
 * Purpose:
 * - Analyze repository structure deterministically
 * - Detect language/framework/package manager
 * - Detect build/start commands
 * - Detect Docker support
 * - Detect environment variables
 * - Detect likely application port
 * - Produce deployment-readiness information
 *
 * IMPORTANT:
 * - No AI calls
 * - No provider calls
 * - No secrets are returned
 * - No repository mutation
 * - No deployment is performed
 * =========================================================
 */

const path = require("path");

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_FILES = 5000;

const DEFAULT_PORTS = {
  node: 3000,
  next: 3000,
  react: 3000,
  vite: 5173,
  express: 3000,
  python: 8000,
  django: 8000,
  flask: 5000,
  fastapi: 8000
};

const FRAMEWORK_FILES = {
  next: [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts"
  ],

  vite: [
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.ts"
  ],

  react: [
    "src/App.jsx",
    "src/App.js",
    "src/App.tsx",
    "src/App.ts"
  ],

  vue: [
    "vue.config.js",
    "vite.config.js"
  ],

  angular: [
    "angular.json"
  ],

  django: [
    "manage.py"
  ],

  flask: [
    "app.py"
  ],

  fastapi: [
    "main.py"
  ]
};

const SPECIAL_FILES = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "requirements.txt",
  "requirements-dev.txt",
  "pyproject.toml",
  "poetry.lock",
  "Pipfile",
  "Pipfile.lock",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  ".dockerignore",
  ".env",
  ".env.example",
  ".env.local",
  ".gitignore",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "angular.json",
  "manage.py"
];

/* =========================================================
   ERROR
========================================================= */

class GithubAnalyzerError extends Error {
  constructor(
    message,
    code = "GITHUB_ANALYZER_ERROR",
    details = {}
  ) {
    super(message);

    this.name =
      "GithubAnalyzerError";

    this.code =
      code;

    this.details =
      details;
  }
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  const result = [];
  const seen = new Set();

  for (const item of files) {
    let filePath = "";

    if (typeof item === "string") {
      filePath = item;
    } else if (item && typeof item === "object") {
      filePath =
        item.path ||
        item.name ||
        item.filename ||
        "";
    }

    filePath =
      normalizePath(filePath);

    if (!filePath) {
      continue;
    }

    if (seen.has(filePath)) {
      continue;
    }

    seen.add(filePath);

    result.push(filePath);

    if (result.length >= MAX_FILES) {
      break;
    }
  }

  return result;
}

function normalizeContentMap(contents) {
  if (!contents) {
    return {};
  }

  if (
    contents instanceof Map
  ) {
    return Object.fromEntries(
      contents.entries()
    );
  }

  if (
    typeof contents === "object" &&
    !Array.isArray(contents)
  ) {
    return contents;
  }

  return {};
}

function getFileName(filePath) {
  return path
    .posix
    .basename(filePath);
}

function hasFile(files, target) {
  const normalizedTarget =
    normalizePath(target);

  return files.some(
    (file) =>
      file === normalizedTarget
  );
}

function hasAnyFile(files, targets) {
  return targets.some(
    (target) =>
      hasFile(files, target)
  );
}

function findFiles(
  files,
  predicate
) {
  return files.filter(
    predicate
  );
}

/* =========================================================
   LANGUAGE DETECTION
========================================================= */

function detectLanguages(files) {
  const languages =
    new Set();

  for (const file of files) {
    const extension =
      path
        .posix
        .extname(file)
        .toLowerCase();

    switch (extension) {
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        languages.add(
          "JavaScript"
        );
        break;

      case ".ts":
      case ".tsx":
        languages.add(
          "TypeScript"
        );
        break;

      case ".py":
        languages.add(
          "Python"
        );
        break;

      case ".java":
        languages.add(
          "Java"
        );
        break;

      case ".go":
        languages.add(
          "Go"
        );
        break;

      case ".rs":
        languages.add(
          "Rust"
        );
        break;

      case ".php":
        languages.add(
          "PHP"
        );
        break;

      case ".rb":
        languages.add(
          "Ruby"
        );
        break;

      case ".cs":
        languages.add(
          "C#"
        );
        break;

      case ".cpp":
      case ".cc":
      case ".cxx":
        languages.add(
          "C++"
        );
        break;

      case ".c":
        languages.add(
          "C"
        );
        break;

      default:
        break;
    }
  }

  return Array.from(
    languages
  );
}

/* =========================================================
   PACKAGE MANAGER
========================================================= */

function detectPackageManager(files) {
  if (
    hasFile(
      files,
      "pnpm-lock.yaml"
    )
  ) {
    return "pnpm";
  }

  if (
    hasFile(
      files,
      "yarn.lock"
    )
  ) {
    return "yarn";
  }

  if (
    hasAnyFile(
      files,
      [
        "bun.lockb",
        "bun.lock"
      ]
    )
  ) {
    return "bun";
  }

  if (
    hasAnyFile(
      files,
      [
        "package-lock.json",
        "npm-shrinkwrap.json"
      ]
    )
  ) {
    return "npm";
  }

  if (
    hasFile(
      files,
      "package.json"
    )
  ) {
    return "npm";
  }

  if (
    hasAnyFile(
      files,
      [
        "requirements.txt",
        "pyproject.toml",
        "Pipfile",
        "poetry.lock"
      ]
    )
  ) {
    return "pip";
  }

  return null;
}

/* =========================================================
   FRAMEWORK DETECTION
========================================================= */

function detectFramework(
  files,
  packageJson = {},
  contents = {}
) {
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };

  const dependencyNames =
    Object.keys(
      dependencies
    );

  if (
    dependencyNames.includes(
      "next"
    ) ||
    hasAnyFile(
      files,
      FRAMEWORK_FILES.next
    )
  ) {
    return {
      name: "Next.js",
      category: "fullstack-react",
      confidence: "high"
    };
  }

  if (
    dependencyNames.includes(
      "vite"
    ) ||
    hasAnyFile(
      files,
      FRAMEWORK_FILES.vite
    )
  ) {
    return {
      name: "Vite",
      category: "frontend-build-tool",
      confidence: "high"
    };
  }

  if (
    dependencyNames.includes(
      "@angular/core"
    ) ||
    hasFile(
      files,
      "angular.json"
    )
  ) {
    return {
      name: "Angular",
      category: "frontend",
      confidence: "high"
    };
  }

  if (
    dependencyNames.includes(
      "vue"
    )
  ) {
    return {
      name: "Vue",
      category: "frontend",
      confidence: "high"
    };
  }

  if (
    dependencyNames.includes(
      "react"
    )
  ) {
    return {
      name: "React",
      category: "frontend",
      confidence: "high"
    };
  }

  if (
    dependencyNames.includes(
      "express"
    )
  ) {
    return {
      name: "Express",
      category: "backend",
      confidence: "high"
    };
  }

  if (
    hasFile(
      files,
      "manage.py"
    )
  ) {
    return {
      name: "Django",
      category: "backend",
      confidence: "high"
    };
  }

  if (
    dependencyNames.includes(
      "fastapi"
    ) ||
    hasFile(
      files,
      "main.py"
    ) &&
    String(
      contents["main.py"] || ""
    ).includes("FastAPI")
  ) {
    return {
      name: "FastAPI",
      category: "backend",
      confidence: "medium"
    };
  }

  if (
    dependencyNames.includes(
      "flask"
    )
  ) {
    return {
      name: "Flask",
      category: "backend",
      confidence: "high"
    };
  }

  return {
    name: "Unknown",
    category: "unknown",
    confidence: "low"
  };
}

/* =========================================================
   PACKAGE JSON
========================================================= */

function getPackageJson(
  contents
) {
  const raw =
    contents[
      "package.json"
    ];

  if (!raw) {
    return {};
  }

  if (
    typeof raw === "object"
  ) {
    return raw;
  }

  try {
    return JSON.parse(
      String(raw)
    );
  } catch (error) {
    return {};
  }
}

/* =========================================================
   PYTHON CONFIG
========================================================= */

function detectPythonMetadata(
  files,
  contents
) {
  const result = {
    requirementsFile:
      null,

    pyproject:
      false,

    managePy:
      false
  };

  if (
    hasFile(
      files,
      "requirements.txt"
    )
  ) {
    result.requirementsFile =
      "requirements.txt";
  } else if (
    hasFile(
      files,
      "requirements-dev.txt"
    )
  ) {
    result.requirementsFile =
      "requirements-dev.txt";
  }

  result.pyproject =
    hasFile(
      files,
      "pyproject.toml"
    );

  result.managePy =
    hasFile(
      files,
      "manage.py"
    );

  return result;
}

/* =========================================================
   COMMAND DETECTION
========================================================= */

function detectCommands(
  packageJson,
  framework
) {
  const scripts =
    packageJson.scripts ||
    {};

  let buildCommand =
    scripts.build ||
    null;

  let startCommand =
    scripts.start ||
    null;

  let devCommand =
    scripts.dev ||
    scripts.develop ||
    null;

  if (
    !buildCommand &&
    framework.name ===
      "Vite"
  ) {
    buildCommand =
      "npm run build";
  }

  if (
    !buildCommand &&
    framework.name ===
      "Next.js"
  ) {
    buildCommand =
      "npm run build";
  }

  if (
    !startCommand &&
    framework.name ===
      "Next.js"
  ) {
    startCommand =
      "npm run start";
  }

  return {
    buildCommand,
    startCommand,
    devCommand,
    scripts
  };
}

/* =========================================================
   DOCKER DETECTION
========================================================= */

function detectDocker(
  files,
  contents
) {
  const dockerfile =
    files.find(
      (file) =>
        getFileName(file)
          .toLowerCase() ===
        "dockerfile"
    ) || null;

  const composeFile =
    files.find(
      (file) =>
        [
          "docker-compose.yml",
          "docker-compose.yaml",
          "compose.yml",
          "compose.yaml"
        ].includes(
          getFileName(file)
            .toLowerCase()
        )
    ) || null;

  let exposedPorts = [];

  if (dockerfile) {
    const raw =
      contents[
        dockerfile
      ];

    const text =
      typeof raw ===
      "string"
        ? raw
        : "";

    const matches =
      text.match(
        /EXPOSE\s+([0-9]+)/gi
      ) || [];

    exposedPorts =
      matches.map(
        (item) => {
          const match =
            item.match(
              /([0-9]+)/
            );

          return match
            ? Number(
                match[1]
              )
            : null;
        }
      )
      .filter(
        Boolean
      );
  }

  return {
    detected:
      Boolean(dockerfile),

    dockerfile,

    composeFile,

    exposedPorts
  };
}

/* =========================================================
   PORT DETECTION
========================================================= */

function detectPort(
  files,
  contents,
  packageJson,
  framework,
  docker
) {
  if (
    docker.exposedPorts
      .length > 0
  ) {
    return {
      port:
        docker
          .exposedPorts[0],

      source:
        "Dockerfile"
    };
  }

  const envCandidates = [
    "PORT",
    "SERVER_PORT"
  ];

  for (const file of files) {
    const raw =
      contents[file];

    if (
      typeof raw !==
      "string"
    ) {
      continue;
    }

    for (
      const envName
      of envCandidates
    ) {
      const regex =
        new RegExp(
          `${envName}\\s*[=:]\\s*["']?([0-9]{2,5})`,
          "i"
        );

      const match =
        raw.match(
          regex
        );

      if (match) {
        return {
          port:
            Number(
              match[1]
            ),

          source:
            file
        };
      }
    }
  }

  const key =
    String(
      framework.name ||
      ""
    ).toLowerCase();

  if (
    key.includes("next")
  ) {
    return {
      port:
        DEFAULT_PORTS.next,

      source:
        "framework-default"
    };
  }

  if (
    key.includes("vite")
  ) {
    return {
      port:
        DEFAULT_PORTS.vite,

      source:
        "framework-default"
    };
  }

  if (
    key.includes("express")
  ) {
    return {
      port:
        DEFAULT_PORTS.express,

      source:
        "framework-default"
    };
  }

  if (
    key.includes("django")
  ) {
    return {
      port:
        DEFAULT_PORTS.django,

      source:
        "framework-default"
    };
  }

  if (
    key.includes("fastapi")
  ) {
    return {
      port:
        DEFAULT_PORTS.fastapi,

      source:
        "framework-default"
    };
  }

  if (
    key.includes("flask")
  ) {
    return {
      port:
        DEFAULT_PORTS.flask,

      source:
        "framework-default"
    };
  }

  return {
    port: null,
    source: null
  };
}

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

function detectEnvironmentVariables(
  files,
  contents
) {
  const variables =
    new Set();

  const ignored =
    new Set([
      "NODE_ENV",
      "PORT"
    ]);

  const patterns = [
    /process\.env\.([A-Z0-9_]+)/g,

    /process\.env\[['"]([^'"]+)['"]\]/g,

    /process\.env\[['"]([^'"]+)['"]\]/g,

    /os\.environ\.get\(\s*['"]([^'"]+)['"]/g,

    /os\.getenv\(\s*['"]([^'"]+)['"]/g,

    /import\.meta\.env\.([A-Z0-9_]+)/g
  ];

  for (const file of files) {
    if (
      file.includes(
        "node_modules/"
      ) ||
      file.includes(
        ".git/"
      )
    ) {
      continue;
    }

    const raw =
      contents[file];

    if (
      typeof raw !==
      "string"
    ) {
      continue;
    }

    for (
      const pattern
      of patterns
    ) {
      pattern.lastIndex =
        0;

      let match;

      while (
        (match =
          pattern.exec(raw))
      ) {
        const name =
          String(
            match[1] || ""
          ).trim();

        if (
          !name ||
          ignored.has(name)
        ) {
          continue;
        }

        variables.add(
          name
        );
      }
    }
  }

  return Array.from(
    variables
  ).sort();
}

/* =========================================================
   ENTRY POINT DETECTION
========================================================= */

function detectEntryPoints(
  files,
  packageJson,
  framework
) {
  const entryPoints =
    [];

  if (
    packageJson.main &&
    typeof packageJson.main ===
      "string"
  ) {
    entryPoints.push(
      packageJson.main
    );
  }

  const candidates = [
    "server.js",
    "server.ts",
    "app.js",
    "app.ts",
    "index.js",
    "index.ts",
    "main.js",
    "main.ts",
    "main.py",
    "manage.py"
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      hasFile(
        files,
        candidate
      )
    ) {
      entryPoints.push(
        candidate
      );
    }
  }

  if (
    framework.name ===
      "Next.js"
  ) {
    entryPoints.push(
      "Next.js application"
    );
  }

  return Array.from(
    new Set(
      entryPoints
    )
  );
}

/* =========================================================
   DEPLOYMENT READINESS
========================================================= */

function calculateReadiness(
  analysis
) {
  const errors = [];
  const warnings = [];

  if (
    analysis.fileCount ===
    0
  ) {
    errors.push(
      "Repository contains no analyzable files"
    );
  }

  if (
    analysis.framework.name ===
    "Unknown"
  ) {
    warnings.push(
      "Framework could not be determined automatically"
    );
  }

  if (
    !analysis.packageManager
  ) {
    warnings.push(
      "Package manager could not be determined"
    );
  }

  if (
    !analysis.commands.buildCommand &&
    analysis.framework.category ===
      "frontend-build-tool"
  ) {
    warnings.push(
      "Frontend build command could not be determined"
    );
  }

  if (
    !analysis.commands.startCommand &&
    analysis.framework.category ===
      "backend"
  ) {
    warnings.push(
      "Backend start command could not be determined"
    );
  }

  if (
    analysis.requiresEnvironmentVariables
  ) {
    warnings.push(
      "Repository requires environment variables"
    );
  }

  if (
    !analysis.port.port &&
    analysis.framework.category !==
      "frontend"
  ) {
    warnings.push(
      "Application port could not be determined"
    );
  }

  const ready =
    errors.length ===
      0 &&
    !(
      analysis.framework.name ===
        "Unknown" &&
      analysis.fileCount ===
        0
    );

  return {
    ready,

    status:
      errors.length > 0
        ? "blocked"
        : warnings.length > 0
        ? "ready_with_warnings"
        : "ready",

    errors,

    warnings
  };
}

/* =========================================================
   MAIN ANALYZER
========================================================= */

async function analyzeRepository(
  options = {}
) {
  const {
    files = [],
    contents = {},
    repository = {}
  } = options;

  const normalizedFiles =
    normalizeFiles(
      files
    );

  const normalizedContents =
    normalizeContentMap(
      contents
    );

  if (
    normalizedFiles.length ===
    0
  ) {
    throw new GithubAnalyzerError(
      "Repository files are required",
      "FILES_REQUIRED"
    );
  }

  const packageJson =
    getPackageJson(
      normalizedContents
    );

  const languages =
    detectLanguages(
      normalizedFiles
    );

  const packageManager =
    detectPackageManager(
      normalizedFiles
    );

  const framework =
    detectFramework(
      normalizedFiles,
      packageJson,
      normalizedContents
    );

  const commands =
    detectCommands(
      packageJson,
      framework
    );

  const docker =
    detectDocker(
      normalizedFiles,
      normalizedContents
    );

  const port =
    detectPort(
      normalizedFiles,
      normalizedContents,
      packageJson,
      framework,
      docker
    );

  const environmentVariables =
    detectEnvironmentVariables(
      normalizedFiles,
      normalizedContents
    );

  const entryPoints =
    detectEntryPoints(
      normalizedFiles,
      packageJson,
      framework
    );

  const python =
    detectPythonMetadata(
      normalizedFiles,
      normalizedContents
    );

  const specialFiles =
    SPECIAL_FILES.filter(
      (file) =>
        hasFile(
          normalizedFiles,
          file
        )
    );

  const analysis = {
    analyzer: {
      name:
        "github-repository-analyzer",

      version:
        "1.0.0"
    },

    repository: {
      id:
        repository.id ||
        null,

      name:
        repository.name ||
        null,

      fullName:
        repository.fullName ||
        repository.full_name ||
        null,

      defaultBranch:
        repository.defaultBranch ||
        repository.default_branch ||
        null
    },

    fileCount:
      normalizedFiles.length,

    languages,

    primaryLanguage:
      languages[0] ||
      null,

    packageManager,

    framework,

    commands,

    docker,

    port,

    entryPoints,

    python,

    specialFiles,

    environmentVariables,

    requiresEnvironmentVariables:
      environmentVariables.length >
      0
  };

  const readiness =
    calculateReadiness(
      analysis
    );

  return {
    success: true,

    analysis: {
      ...analysis,

      deploymentReadiness:
        readiness
    }
  };
}

/* =========================================================
   QUICK FILE ANALYSIS
========================================================= */

function analyzeFileList(
  files = []
) {
  const normalized =
    normalizeFiles(
      files
    );

  return {
    success: true,

    fileCount:
      normalized.length,

    files:
      normalized,

    languages:
      detectLanguages(
        normalized
      ),

    packageManager:
      detectPackageManager(
        normalized
      ),

    detectedFiles:
      SPECIAL_FILES.filter(
        (file) =>
          hasFile(
            normalized,
            file
          )
      )
  };
}

/* =========================================================
   HEALTH
========================================================= */

function health() {
  return {
    success: true,

    service:
      "github-analyzer",

    version:
      "1.0.0",

    status:
      "healthy",

    capabilities: [
      "language-detection",
      "framework-detection",
      "package-manager-detection",
      "command-detection",
      "docker-detection",
      "port-detection",
      "environment-variable-detection",
      "entry-point-detection",
      "deployment-readiness"
    ]
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  analyzeRepository,

  analyzeFileList,

  detectLanguages,

  detectPackageManager,

  detectFramework,

  detectCommands,

  detectDocker,

  detectPort,

  detectEnvironmentVariables,

  detectEntryPoints,

  calculateReadiness,

  health,

  GithubAnalyzerError
};
