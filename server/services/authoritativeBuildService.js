'use strict';

/**
 * ZyrionOS — Authoritative Build Service
 * Compatible replacement for server/services/authoritativeBuildService.js
 *
 * Contract:
 * - Builds generated source only inside an isolated Docker container.
 * - Persists a checksummed build.tar.gz artifact (local disk or S3).
 * - Records the artifact checksum and verification metadata in ProjectBuild.
 * - PreviewService consumes this artifact; it does not rebuild source.
 */

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ProjectBuild = require('../models/projectBuildModel');

const SERVICE_VERSION = '4.0.0';
const VALIDATION_MODE = 'authoritative';
const AUTHORITATIVE = true;

const MAX_FILES = positiveInt(process.env.AUTH_BUILD_MAX_FILES, 1000);
const MAX_FILE_SIZE = positiveInt(process.env.AUTH_BUILD_MAX_FILE_SIZE, 2 * 1024 * 1024);
const MAX_SOURCE_SIZE = positiveInt(process.env.AUTH_BUILD_MAX_SOURCE_SIZE, 25 * 1024 * 1024);
const MAX_ARTIFACT_SIZE = positiveInt(process.env.AUTH_BUILD_MAX_ARTIFACT_SIZE, 500 * 1024 * 1024);
const INSTALL_TIMEOUT_MS = positiveInt(process.env.AUTH_BUILD_INSTALL_TIMEOUT_MS, 5 * 60 * 1000);
const BUILD_TIMEOUT_MS = positiveInt(process.env.AUTH_BUILD_TIMEOUT_MS, 5 * 60 * 1000);
const DOCKER_CHECK_TIMEOUT_MS = positiveInt(process.env.AUTH_BUILD_DOCKER_CHECK_TIMEOUT_MS, 5000);
const CPU_LIMIT = String(process.env.AUTH_BUILD_CPU_LIMIT || '2');
const MEMORY_LIMIT = String(process.env.AUTH_BUILD_MEMORY_LIMIT || '2g');
const PIDS_LIMIT = positiveInt(process.env.AUTH_BUILD_PIDS_LIMIT, 256);
const BUILD_NETWORK = String(process.env.AUTH_BUILD_NETWORK || 'none');
const INSTALL_NETWORK = String(process.env.AUTH_INSTALL_NETWORK || process.env.AUTH_BUILD_INSTALL_NETWORK || 'bridge');
const MAX_OUTPUT_BYTES = positiveInt(process.env.AUTH_BUILD_MAX_OUTPUT_BYTES, 5 * 1024 * 1024);
const MAX_ERROR_LOG_BYTES = positiveInt(process.env.AUTH_BUILD_MAX_ERROR_LOG_BYTES, 20000);
const MAX_CONCURRENT_BUILDS = positiveInt(process.env.AUTH_BUILD_MAX_CONCURRENCY, 2);
const ARTIFACT_ROOT = path.resolve(process.env.AUTH_ARTIFACT_ROOT || path.join(os.tmpdir(), 'zyrionos-build-artifacts'));
const ARTIFACT_STORAGE_PREFIX = String(process.env.AUTH_ARTIFACT_PREFIX || 'zyrionos/builds').replace(/^\/+|\/+$/g, '');
const ARTIFACT_BUCKET = String(process.env.AUTH_ARTIFACT_BUCKET || '').trim();
const ARTIFACT_REGION = String(process.env.AWS_REGION || 'ap-south-1');
const DOCKER_COMMAND = String(process.env.DOCKER_COMMAND || 'docker');
const NODE_IMAGES = Object.freeze({ '20': 'node:20-bookworm-slim', '22': 'node:22-bookworm-slim' });

let activeBuilds = 0;
const buildQueue = [];

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function safeString(value, max = 10000) { return value == null ? '' : String(value).slice(0, max); }
function generateBuildId() { return `build_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`; }
function sha256Buffer(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256String(value) { return sha256Buffer(String(value)); }
async function checksumFile(file) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}
function log(level, message, meta = {}) {
  const payload = { service: 'authoritativeBuildService', version: SERVICE_VERSION, message, ...meta };
  try {
    const logger = global.logger;
    if (logger && typeof logger[level] === 'function') return logger[level](payload);
  } catch (_) {}
  const line = `[AuthoritativeBuildService] ${safeString(message, 4000)} ${safeString(JSON.stringify(meta), 6000)}`;
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

function normalizeFilePath(filePath) {
  const value = String(filePath || '').replace(/\\/g, '/').trim().replace(/^\.\/+/, '');
  if (!value || value.includes('\0') || value.includes('\n') || value.includes('\r') || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').includes('..')) {
    throw new Error(`Unsafe or empty project file path: ${safeString(filePath, 300)}`);
  }
  return value;
}
function sanitizeFilePath(filePath) { return normalizeFilePath(filePath); }
function getFilePath(file) { return normalizeFilePath(file && (file.path || file.filePath || file.name)); }
function getFileContent(file) {
  if (!file || typeof file !== 'object') return '';
  if (typeof file.content === 'string') return file.content;
  if (typeof file.source === 'string') return file.source;
  if (typeof file.code === 'string') return file.code;
  return '';
}
function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('Build files must be a non-empty array');
  if (files.length > MAX_FILES) throw new Error(`Project exceeds maximum file count of ${MAX_FILES}`);
  const seen = new Set(); let totalSize = 0;
  for (const file of files) {
    const filePath = getFilePath(file);
    if (seen.has(filePath)) throw new Error(`Duplicate project file: ${filePath}`);
    seen.add(filePath);
    const size = Buffer.byteLength(getFileContent(file), 'utf8');
    if (size > MAX_FILE_SIZE) throw new Error(`File exceeds maximum size: ${filePath}`);
    totalSize += size;
    if (totalSize > MAX_SOURCE_SIZE) throw new Error(`Project source exceeds ${MAX_SOURCE_SIZE} bytes`);
  }
  return { fileCount: files.length, totalSize };
}
function calculateSourceHash(files) {
  const normalized = Array.isArray(files) ? files.map(file => ({ path: getFilePath(file), content: getFileContent(file) })).sort((a, b) => a.path.localeCompare(b.path)) : [];
  return sha256String(JSON.stringify(normalized));
}
function resolveNodeVersion(value) {
  const match = String(value || '20').trim().match(/^(20|22)(?:\.\d+)?/);
  return match ? match[1] : '20';
}
function getPackageJson(files) {
  const file = files.find(item => getFilePath(item) === 'package.json');
  if (!file) throw new Error('package.json is required for an authoritative build');
  let parsed;
  try { parsed = JSON.parse(getFileContent(file)); } catch (error) { throw new Error(`package.json contains invalid JSON: ${error.message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('package.json root must be an object');
  return parsed;
}
function detectPackageManager(files, requested, packageJson = null) {
  const allowed = ['npm', 'yarn', 'pnpm', 'bun'];
  const wanted = String(requested || '').trim().toLowerCase();
  if (allowed.includes(wanted)) return wanted;
  const paths = new Set(files.map(getFilePath));
  if (paths.has('pnpm-lock.yaml')) return 'pnpm';
  if (paths.has('yarn.lock')) return 'yarn';
  if (paths.has('bun.lock') || paths.has('bun.lockb')) return 'bun';
  const declared = String(packageJson && packageJson.packageManager || '').toLowerCase();
  for (const manager of ['pnpm', 'yarn', 'bun', 'npm']) if (declared.startsWith(`${manager}@`)) return manager;
  return 'npm';
}
function hasLockfile(files, manager) {
  const paths = new Set(files.map(getFilePath));
  const names = { npm: ['package-lock.json', 'npm-shrinkwrap.json'], yarn: ['yarn.lock'], pnpm: ['pnpm-lock.yaml'], bun: ['bun.lock', 'bun.lockb'] };
  return (names[manager] || []).some(name => paths.has(name));
}
function getInstallCommand(manager, locked) {
  if (manager === 'pnpm') return locked ? 'corepack pnpm install --frozen-lockfile' : 'corepack pnpm install';
  if (manager === 'yarn') return locked ? 'corepack yarn install --immutable' : 'corepack yarn install';
  if (manager === 'bun') return locked ? 'bun install --frozen-lockfile' : 'bun install';
  return locked ? 'npm ci' : 'npm install';
}
function detectForbiddenBuildScript(script) {
  const s = String(script || '').trim();
  if (!s) return { invalid: true, reason: 'Build script is empty.' };
  if (/(^|[;&|])\s*(?:npm\s+run\s+build|pnpm\s+run\s+build|yarn\s+build|bun\s+run\s+build)\s*(?:$|[;&|])/i.test(s)) return { invalid: true, reason: 'Build script recursively invokes itself.' };
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)\b|\b(?:next\s+dev|vite\s+preview|webpack-dev-server|nodemon|ng\s+serve|react-scripts\s+start)\b/i.test(s)) return { invalid: true, reason: 'Build script contains a runtime/development server command.' };
  return { invalid: false, reason: '' };
}
function validateBuildScriptForFramework(script, framework) {
  const f = String(framework || '').toLowerCase(); const s = String(script || '');
  const expected = f.includes('next') ? /\bnext\s+build\b/i : f.includes('vite') ? /\bvite\s+build\b/i : f.includes('angular') ? /\bng\s+build\b/i : f.includes('astro') ? /\bastro\s+build\b/i : null;
  return !expected || expected.test(s) ? { valid: true, reason: '' } : { valid: false, reason: `Build script does not match framework ${framework}.` };
}
function getBuildCommand(packageManager, packageJson, framework = '') {
  const script = packageJson && packageJson.scripts && packageJson.scripts.build;
  const check = detectForbiddenBuildScript(script);
  if (check.invalid) throw new Error(`Invalid authoritative build script: ${check.reason}`);
  const frameworkCheck = validateBuildScriptForFramework(script, framework);
  if (!frameworkCheck.valid) throw new Error(frameworkCheck.reason);
  if (packageManager === 'pnpm') return 'corepack pnpm run build';
  if (packageManager === 'yarn') return 'corepack yarn build';
  if (packageManager === 'bun') return 'bun run build';
  return 'npm run build';
}
function sanitizeBuildOutput(value) {
  return safeString(value, MAX_ERROR_LOG_BYTES)
    .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS)[A-Z0-9_]*)\s*=\s*[^\s]+/gi, '$1=[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
function ensureInside(root, target) {
  const r = path.resolve(root); const t = path.resolve(target);
  if (t !== r && !t.startsWith(`${r}${path.sep}`)) throw new Error('Resolved path escapes workspace');
  return t;
}
async function createWorkspace(buildId) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), `zyrionos-build-${buildId}-`));
  await fsp.chmod(root, 0o777);
  return root;
}
async function cleanupWorkspace(root) {
  if (!root) return;
  try { await fsp.rm(root, { recursive: true, force: true }); } catch (error) { log('warn', 'Workspace cleanup failed', { error: error.message }); }
}
async function materializeSource(files, workspace) {
  for (const file of files) {
    const relative = getFilePath(file);
    const destination = ensureInside(workspace, path.join(workspace, relative));
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, getFileContent(file), { encoding: 'utf8', mode: 0o666, flag: 'w' });
  }
}
function runProcess(command, args, { timeoutMs, maxOutput = MAX_OUTPUT_BYTES, cwd } = {}) {
  return new Promise(resolve => {
    let stdout = ''; let stderr = ''; let settled = false; let timedOut = false;
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const append = (current, chunk) => (current + String(chunk)).slice(-maxOutput);
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ...result, stdout, stderr, timedOut }); };
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGTERM'); } catch (_) {} setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 1500).unref?.(); }, timeoutMs || 60000);
    child.on('error', error => finish({ code: null, signal: null, error: error.message }));
    child.on('close', (code, signal) => finish({ code, signal: signal || null, error: null }));
  });
}
async function checkDockerAvailable() {
  const result = await runProcess(DOCKER_COMMAND, ['version', '--format', '{{.Server.Version}}'], { timeoutMs: DOCKER_CHECK_TIMEOUT_MS, maxOutput: 2000 });
  return result.code === 0 && !result.timedOut;
}
async function runDockerCommand({ image, workspace, command, network, timeoutMs, containerName }) {
  const args = ['run', '--rm', '--name', containerName, '--cpus', CPU_LIMIT, '--memory', MEMORY_LIMIT, '--pids-limit', String(PIDS_LIMIT), '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=512m', '--tmpfs', '/home/node:rw,nosuid,size=256m', '--network', network, '-v', `${workspace}:/workspace:rw`, '-w', '/workspace', '--user', 'node', image, 'sh', '-lc', command];
  const result = await runProcess(DOCKER_COMMAND, args, { timeoutMs, maxOutput: MAX_OUTPUT_BYTES });
  if (result.timedOut) {
    try { spawn(DOCKER_COMMAND, ['rm', '-f', containerName], { stdio: 'ignore' }); } catch (_) {}
  }
  return { success: result.code === 0 && !result.timedOut, exitCode: result.code, signal: result.signal, timedOut: result.timedOut, stdout: result.stdout, stderr: result.stderr, error: result.error, durationMs: null };
}
function shouldExcludeArtifact(relative) {
  const p = relative.replace(/\\/g, '/'); const parts = p.split('/');
  if (parts.includes('node_modules') || parts.includes('.git') || parts.includes('.zyrionos')) return true;
  if (parts.some(part => part === '.env' || part.startsWith('.env.'))) return true;
  return p.startsWith('.cache/') || p.startsWith('.tmp/');
}
async function createTarArtifact(workspace, destination) {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  // Archive contains built output and project files but excludes dependencies, secrets and VCS metadata.
  const result = await runProcess('tar', ['--exclude=./node_modules', '--exclude=./.git', '--exclude=./.zyrionos', '--exclude=./.env', '--exclude=./.env.*', '--exclude=*/.env', '--exclude=*/.env.*', '--exclude=./.npmrc', '--exclude=*/.npmrc', '--exclude=./.yarnrc.yml', '--exclude=*/.yarnrc.yml', '--exclude=./.netrc', '--exclude=*/.netrc', '--exclude=./.cache', '--exclude=./.tmp', '-czf', destination, '-C', workspace, '.'], { timeoutMs: BUILD_TIMEOUT_MS, maxOutput: 20000 });
  if (result.code !== 0 || result.timedOut) throw new Error(`Unable to create build archive: ${result.stderr || result.error || 'tar failed'}`);
  const stat = await fsp.stat(destination);
  if (!stat.size || stat.size > MAX_ARTIFACT_SIZE) throw new Error(`Build artifact size is invalid (${stat.size} bytes)`);
  return { size: stat.size, checksum: await checksumFile(destination) };
}
async function storeLocalArtifact({ buildId, artifactPath }) {
  const destinationDir = path.resolve(ARTIFACT_ROOT, ARTIFACT_STORAGE_PREFIX, buildId);
  ensureInside(ARTIFACT_ROOT, destinationDir);
  await fsp.mkdir(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, 'build.tar.gz');
  await fsp.copyFile(artifactPath, destination, fs.constants.COPYFILE_EXCL).catch(async error => {
    if (error.code !== 'EEXIST') throw error;
    await fsp.rm(destination, { force: true });
    await fsp.copyFile(artifactPath, destination);
  });
  const stat = await fsp.stat(destination); const checksum = await checksumFile(destination);
  return { storageKey: `${ARTIFACT_STORAGE_PREFIX}/${buildId}/build.tar.gz`, url: '', localPath: destination, size: stat.size, checksum, storageType: 'local' };
}
async function storeS3Artifact({ buildId, artifactPath }) {
  let S3Client, PutObjectCommand;
  try { ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')); } catch (_) { throw new Error('S3 artifact storage is configured but @aws-sdk/client-s3 is not installed'); }
  const key = `${ARTIFACT_STORAGE_PREFIX}/${buildId}/build.tar.gz`;
  const client = new S3Client({ region: ARTIFACT_REGION }); const stat = await fsp.stat(artifactPath);
  await client.send(new PutObjectCommand({ Bucket: ARTIFACT_BUCKET, Key: key, Body: fs.createReadStream(artifactPath), ContentLength: stat.size, ContentType: 'application/gzip', Metadata: { buildid: buildId, serviceversion: SERVICE_VERSION } }));
  const expected = await checksumFile(artifactPath);
  // Read the uploaded object back so the build is not marked verified merely
  // because the upload request returned successfully.
  let GetObjectCommand;
  try { ({ GetObjectCommand } = require('@aws-sdk/client-s3')); } catch (_) { throw new Error('S3 read-back verification requires @aws-sdk/client-s3'); }
  const response = await client.send(new GetObjectCommand({ Bucket: ARTIFACT_BUCKET, Key: key }));
  if (!response.Body) throw new Error('S3 artifact read-back returned an empty body');
  const hash = crypto.createHash('sha256');
  for await (const chunk of response.Body) hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const actual = hash.digest('hex');
  if (actual !== expected) throw new Error('S3 artifact checksum verification failed after upload');
  return { storageKey: key, url: `s3://${ARTIFACT_BUCKET}/${key}`, size: stat.size, checksum: actual, storageType: 's3' };
}
async function persistArtifact(args) { return ARTIFACT_BUCKET ? storeS3Artifact(args) : storeLocalArtifact(args); }
async function createBuildRecord({ projectId, userId, buildId, trigger, framework, runtime, nodeVersion, packageManager, buildCommand, outputDirectory, sourceHash, aiGenerated, aiModel, promptId }) {
  const latest = await ProjectBuild.findOne({ projectId }).sort({ buildNumber: -1 }).select({ buildNumber: 1 }).lean();
  return ProjectBuild.create({ projectId, userId, buildId, buildNumber: (latest && Number(latest.buildNumber) || 0) + 1, status: 'queued', trigger: trigger || 'manual', framework: framework || '', runtime: runtime || '', nodeVersion: nodeVersion || '', packageManager: packageManager || '', buildCommand: buildCommand || '', outputDirectory: outputDirectory || '', aiGenerated: Boolean(aiGenerated), aiModel: aiModel || '', promptId: promptId || '', metadata: { serviceVersion: SERVICE_VERSION, sourceHash, authoritative: true, validationMode: VALIDATION_MODE, artifactVerified: false, verified: false } });
}
function failureResult({ buildId, projectId, projectName, sourceHash, framework, runtime, nodeVersion, packageManager, buildCommand = '', installCommand = '', stage, message, stdout = '', stderr = '', retryable = false, buildNumber = null, fileCount = 0, totalSize = 0, startedAt = Date.now() }) {
  const error = { code: stage === 'build' ? 'AUTHORITATIVE_BUILD_FAILED' : stage === 'install' ? 'DEPENDENCY_INSTALL_FAILED' : 'AUTHORITATIVE_BUILD_ERROR', message: safeString(message || 'Authoritative build failed', 4000), step: stage || 'executor', file: '', line: null, column: null };
  return { success: false, status: 'failed', authoritative: true, validationMode: VALIDATION_MODE, serviceVersion: SERVICE_VERSION, buildId, buildNumber, projectId, projectName, sourceHash, framework, runtime, nodeVersion, packageManager, buildCommand, installCommand, failureStage: stage, failureCategory: stage === 'install' ? 'dependency-install' : stage === 'build' ? 'build' : 'executor', retryable: Boolean(retryable), errors: [error], warnings: [], stdout: sanitizeBuildOutput(stdout), stderr: sanitizeBuildOutput(stderr), exitCode: null, signal: null, timedOut: false, repairContext: { required: true, buildId, sourceHash, packageManager, buildCommand, installCommand, failureStage: stage, retryable: Boolean(retryable), affectedFiles: [], errors: [error], stdout: sanitizeBuildOutput(stdout), stderr: sanitizeBuildOutput(stderr), strategy: 'analyze-build-output-and-repair' }, summary: { durationMs: Date.now() - startedAt, fileCount, totalSize } };
}
async function executeBuild(options = {}) {
  const { projectId, userId, projectName = '', framework = '', runtime = 'node', files, nodeVersion: requestedNodeVersion = '20', packageManager: requestedPackageManager = '', trigger = 'manual', outputDirectory = '', aiGenerated = false, aiModel = '', promptId = '' } = options;
  const startedAt = Date.now(); const buildId = generateBuildId(); let workspace = null; let build = null; let temporaryArtifactPath = null;
  let sourceStats = { fileCount: 0, totalSize: 0 }; let sourceHash = ''; let nodeVersion = resolveNodeVersion(requestedNodeVersion); let manager = requestedPackageManager; let buildCommand = ''; let installCommand = '';
  try {
    if (!projectId || !userId) throw new Error('projectId and userId are required');
    sourceStats = validateFiles(files); sourceHash = calculateSourceHash(files);
    const packageJson = getPackageJson(files); manager = detectPackageManager(files, manager, packageJson);
    nodeVersion = resolveNodeVersion(requestedNodeVersion); buildCommand = getBuildCommand(manager, packageJson, framework);
    installCommand = getInstallCommand(manager, hasLockfile(files, manager));
  } catch (error) {
    return failureResult({ buildId, projectId, projectName, sourceHash, framework, runtime, nodeVersion, packageManager: manager, buildCommand, installCommand, stage: 'configuration', message: error.message, startedAt, fileCount: sourceStats.fileCount, totalSize: sourceStats.totalSize });
  }
  try {
    if (!(await checkDockerAvailable())) throw Object.assign(new Error('Docker daemon is unavailable; authoritative build execution requires Docker.'), { step: 'executor', retryable: true });
    build = await createBuildRecord({ projectId, userId, buildId, trigger, framework, runtime, nodeVersion, packageManager: manager, buildCommand, outputDirectory, sourceHash, aiGenerated, aiModel, promptId });
    build.status = 'running'; build.startedAt = new Date(); build.metadata = { ...(build.metadata || {}), serviceVersion: SERVICE_VERSION, sourceStats, installCommand, buildCommand, dockerImage: NODE_IMAGES[nodeVersion], authoritative: true, validationMode: VALIDATION_MODE, artifactVerified: false, verified: false }; await build.save();
    workspace = await createWorkspace(buildId); await materializeSource(files, workspace);
    const install = await runDockerCommand({ image: NODE_IMAGES[nodeVersion], workspace, command: installCommand, network: INSTALL_NETWORK, timeoutMs: INSTALL_TIMEOUT_MS, containerName: `zyrionos-install-${buildId}`.replace(/[^a-zA-Z0-9_.-]/g, '-') });
    if (!install.success) {
      const result = failureResult({ buildId, buildNumber: build.buildNumber, projectId, projectName, sourceHash, framework, runtime, nodeVersion, packageManager: manager, buildCommand, installCommand, stage: 'install', message: install.timedOut ? 'Dependency installation timed out.' : install.stderr || install.stdout || install.error || 'Dependency installation failed.', stdout: install.stdout, stderr: install.stderr, retryable: Boolean(install.timedOut), startedAt, fileCount: sourceStats.fileCount, totalSize: sourceStats.totalSize });
      build.status = 'failed'; build.completedAt = new Date(); build.errorMessage = result.errors[0].message; build.errors = result.errors; build.metadata = { ...(build.metadata || {}), retryable: result.retryable, installOutput: { stdout: sanitizeBuildOutput(install.stdout), stderr: sanitizeBuildOutput(install.stderr), timedOut: install.timedOut } }; await build.save(); return result;
    }
    const built = await runDockerCommand({ image: NODE_IMAGES[nodeVersion], workspace, command: buildCommand, network: BUILD_NETWORK, timeoutMs: BUILD_TIMEOUT_MS, containerName: `zyrionos-build-${buildId}`.replace(/[^a-zA-Z0-9_.-]/g, '-') });
    if (!built.success) {
      const result = failureResult({ buildId, buildNumber: build.buildNumber, projectId, projectName, sourceHash, framework, runtime, nodeVersion, packageManager: manager, buildCommand, installCommand, stage: 'build', message: built.timedOut ? 'Authoritative build timed out.' : built.stderr || built.stdout || built.error || 'Authoritative build failed.', stdout: built.stdout, stderr: built.stderr, retryable: Boolean(built.timedOut), startedAt, fileCount: sourceStats.fileCount, totalSize: sourceStats.totalSize });
      build.status = 'failed'; build.completedAt = new Date(); build.errorMessage = result.errors[0].message; build.errors = result.errors; build.metadata = { ...(build.metadata || {}), retryable: result.retryable, buildOutput: { stdout: sanitizeBuildOutput(built.stdout), stderr: sanitizeBuildOutput(built.stderr), timedOut: built.timedOut } }; await build.save(); return result;
    }
    // Reject symbolic links: the archive is later unpacked by PreviewService.
    async function rejectSymlinks(dir) {
      for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name); const stat = await fsp.lstat(full);
        if (stat.isSymbolicLink()) throw new Error(`Build output contains unsupported symbolic link: ${path.relative(dir, full)}`);
        if (stat.isDirectory()) await rejectSymlinks(full);
      }
    }
    await rejectSymlinks(workspace);
    const outputRel = String(outputDirectory || '').trim().replace(/\\/g, '/').replace(/^\.\/+|\/+$/g, '');
    if (outputRel) {
      const outputPath = ensureInside(workspace, path.join(workspace, outputRel));
      const outputStat = await fsp.stat(outputPath).catch(() => null);
      if (!outputStat || !outputStat.isDirectory()) throw new Error(`Configured outputDirectory does not exist after build: ${outputRel}`);
    }
    temporaryArtifactPath = path.join(os.tmpdir(), `${buildId}.tar.gz`);
    const archived = await createTarArtifact(workspace, temporaryArtifactPath);
    const artifact = await persistArtifact({ buildId, artifactPath: temporaryArtifactPath });
    // Verify the exact persisted bytes before setting any verification flags.
    let persistedChecksum = artifact.checksum;
    if (artifact.localPath) persistedChecksum = await checksumFile(artifact.localPath);
    if (!/^[a-f0-9]{64}$/i.test(persistedChecksum || '') || persistedChecksum !== archived.checksum) throw new Error('Persisted build artifact checksum verification failed');
    const artifactRecord = { name: 'build.tar.gz', type: 'build', storageKey: artifact.storageKey, url: artifact.url || '', size: artifact.size, checksum: persistedChecksum };
    build.status = 'success'; build.completedAt = new Date(); build.artifacts = [artifactRecord]; build.artifactCount = 1; build.outputSize = artifact.size; build.errorMessage = ''; build.errors = []; build.durationMs = Date.now() - startedAt;
    build.metadata = { ...(build.metadata || {}), authoritative: true, validationMode: VALIDATION_MODE, verified: true, artifactVerified: true, authoritativeVerified: true, artifact: { format: 'tar.gz', manifestVersion: 1, fileCount: sourceStats.fileCount, totalSourceSize: sourceStats.totalSize, artifactChecksum: persistedChecksum, storageType: artifact.storageType, outputDirectory: outputRel, verifiedAt: new Date().toISOString() }, buildOutput: { stdout: sanitizeBuildOutput(built.stdout), stderr: sanitizeBuildOutput(built.stderr), exitCode: built.exitCode, signal: built.signal } };
    await build.save();
    return { success: true, status: 'success', authoritative: true, validationMode: VALIDATION_MODE, serviceVersion: SERVICE_VERSION, buildId, buildNumber: build.buildNumber, projectId, projectName, sourceHash, framework, runtime, nodeVersion, packageManager: manager, buildCommand, installCommand, outputDirectory: outputRel, artifact: { ...artifactRecord, storageType: artifact.storageType, fileCount: sourceStats.fileCount }, repairContext: null, errors: [], warnings: [], durationMs: build.durationMs, metadata: { dependenciesInstalled: true, buildCommandExecuted: true, dockerIsolated: true, artifactCreated: true, artifactVerified: true, runtimeStarted: false, browserSmokeTested: false }, summary: 'Authoritative build completed; persisted archive checksum was verified.' };
  } catch (error) {
    log('error', 'Authoritative build failed', { buildId, error: error.message });
    const result = failureResult({ buildId, buildNumber: build && build.buildNumber, projectId, projectName, sourceHash, framework, runtime, nodeVersion, packageManager: manager, buildCommand, installCommand, stage: error.step || 'executor', message: error.message, retryable: Boolean(error.retryable), startedAt, fileCount: sourceStats.fileCount, totalSize: sourceStats.totalSize });
    if (build) {
      try { build.status = 'failed'; build.completedAt = new Date(); build.errorMessage = result.errors[0].message; build.errors = result.errors; build.metadata = { ...(build.metadata || {}), authoritative: true, validationMode: VALIDATION_MODE, verified: false, artifactVerified: false, failureCategory: result.failureCategory, retryable: result.retryable }; await build.save(); } catch (dbError) { log('error', 'Could not persist build failure', { buildId, error: dbError.message }); }
    }
    return result;
  } finally {
    if (temporaryArtifactPath) await fsp.rm(temporaryArtifactPath, { force: true }).catch(() => {});
    await cleanupWorkspace(workspace);
  }
}
function acquireBuildSlot() {
  if (activeBuilds < MAX_CONCURRENT_BUILDS) { activeBuilds++; return Promise.resolve(); }
  return new Promise(resolve => buildQueue.push(resolve));
}
function releaseBuildSlot() {
  activeBuilds = Math.max(0, activeBuilds - 1);
  const next = buildQueue.shift();
  if (next) { activeBuilds++; next(); }
}
async function buildProject(options) {
  await acquireBuildSlot();
  try { return await executeBuild(options); } finally { releaseBuildSlot(); }
}
async function verifyArtifactChecksum(artifactPath, expectedChecksum) {
  if (!artifactPath || !expectedChecksum || !/^[a-f0-9]{64}$/i.test(String(expectedChecksum))) return false;
  try { return (await checksumFile(artifactPath)) === String(expectedChecksum).toLowerCase(); } catch (_) { return false; }
}
function isAuthoritativeBuildReady(result) {
  return Boolean(result && result.success === true && result.status === 'success' && result.authoritative === true && result.validationMode === VALIDATION_MODE && result.buildId && result.artifact && result.artifact.storageKey && /^[a-f0-9]{64}$/i.test(result.artifact.checksum || ''));
}
async function getBuildArtifact({ projectId, userId, buildId }) {
  if (!projectId || !userId || !buildId) throw new Error('projectId, userId and buildId are required');
  const build = await ProjectBuild.findOne({ projectId, userId, buildId, status: 'success' }).lean();
  if (!build) throw new Error('Successful authoritative build not found');
  if (build.metadata?.authoritative !== true || build.metadata?.validationMode !== VALIDATION_MODE) throw new Error('Requested build is not authoritative');
  const artifact = Array.isArray(build.artifacts) ? (build.artifacts.find(item => item.type === 'build' && item.name === 'build.tar.gz') || build.artifacts[0]) : null;
  if (!artifact || !artifact.storageKey || !/^[a-f0-9]{64}$/i.test(artifact.checksum || '')) throw new Error('Build artifact metadata is incomplete');
  return { buildId: build.buildId, buildNumber: build.buildNumber, projectId: build.projectId, userId: build.userId, sourceHash: build.metadata?.sourceHash || '', outputDirectory: build.outputDirectory || build.metadata?.artifact?.outputDirectory || '', framework: build.framework || '', runtime: build.runtime || 'node', nodeVersion: build.nodeVersion || '20', packageManager: build.packageManager || 'npm', metadata: build.metadata || {}, artifact };
}

module.exports = { SERVICE_VERSION, VALIDATION_MODE, AUTHORITATIVE, buildProject, executeBuild, isAuthoritativeBuildReady, getBuildArtifact, verifyArtifactChecksum, calculateSourceHash, validateFiles, detectPackageManager, getBuildCommand, getInstallCommand, resolveNodeVersion, normalizeFilePath, sanitizeFilePath };
