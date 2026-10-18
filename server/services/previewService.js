'use strict';

/**
 * ZyrionOS — Preview Service
 * Compatible replacement for server/services/previewService.js
 *
 * Preview consumes the exact successful authoritative build archive.
 * It never installs dependencies or rebuilds source. The archive checksum
 * is verified before safe extraction. Only static output containing
 * index.html is served by this runtime; SSR apps need a separate runtime.
 */

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const Project = require('../models/projectModel');
const ProjectBuild = require('../models/projectBuildModel');
const ProjectPreview = require('../models/projectPreviewModel');

let logger = null;
try { logger = require('./loggerService'); } catch (_) {}

const VERSION = '5.0.0';
const SERVICE_NAME = 'previewService';
const PREVIEW_BASE_URL = String(process.env.PREVIEW_BASE_URL || '').trim().replace(/\/+$/, '');
const PREVIEW_BIND_HOST = String(process.env.PREVIEW_BIND_HOST || '0.0.0.0').trim();
const PREVIEW_PUBLIC_HOST = String(process.env.PREVIEW_PUBLIC_HOST || (process.env.NODE_ENV === 'production' ? '' : 'localhost')).trim();
const PREVIEW_PORT = positiveInt(process.env.PREVIEW_PORT, 0);
const PREVIEW_TTL_MS = positiveInt(process.env.PREVIEW_TTL_MS, 30 * 60 * 1000);
const PREVIEW_MAX_ACTIVE = positiveInt(process.env.PREVIEW_MAX_ACTIVE, 3);
const PREVIEW_HEALTH_TIMEOUT_MS = positiveInt(process.env.PREVIEW_HEALTH_TIMEOUT_MS, 5000);
const PREVIEW_HEALTH_RETRIES = positiveInt(process.env.PREVIEW_HEALTH_RETRIES, 10);
const PREVIEW_HEALTH_RETRY_DELAY_MS = positiveInt(process.env.PREVIEW_HEALTH_RETRY_DELAY_MS, 1000);
const PREVIEW_CPU = String(process.env.PREVIEW_CPU || '1');
const PREVIEW_MEMORY = String(process.env.PREVIEW_MEMORY || '512m');
const PREVIEW_PIDS = positiveInt(process.env.PREVIEW_PIDS, 128);
const PREVIEW_RUNTIME_NETWORK = String(process.env.PREVIEW_RUNTIME_NETWORK || 'none');
const PREVIEW_NODE_IMAGE = String(process.env.PREVIEW_NODE_IMAGE || 'node:20-bookworm-slim');
const PREVIEW_WORK_ROOT = path.resolve(process.env.PREVIEW_WORK_ROOT || path.join(os.tmpdir(), 'zyrionos-previews'));
const AUTH_ARTIFACT_ROOT = path.resolve(process.env.AUTH_ARTIFACT_ROOT || path.join(os.tmpdir(), 'zyrionos-build-artifacts'));
const AUTH_ARTIFACT_BUCKET = String(process.env.AUTH_ARTIFACT_BUCKET || '').trim();
const AUTH_ARTIFACT_REGION = String(process.env.AUTH_ARTIFACT_REGION || process.env.AWS_REGION || 'ap-south-1').trim();
const MAX_ARTIFACT_FILE_SIZE = positiveInt(process.env.PREVIEW_MAX_ARTIFACT_FILE_SIZE, 500 * 1024 * 1024);
const MAX_ARTIFACT_TOTAL_SIZE = positiveInt(process.env.PREVIEW_MAX_ARTIFACT_TOTAL_SIZE, 500 * 1024 * 1024);
const MAX_ARTIFACT_FILES = positiveInt(process.env.PREVIEW_MAX_ARTIFACT_FILES, 20000);
const DOCKER_COMMAND = String(process.env.DOCKER_COMMAND || 'docker').trim();
const activeRuntimes = new Map();

function positiveInt(value, fallback) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback; }
class PreviewServiceError extends Error {
  constructor(message, code = 'PREVIEW_ERROR', details = {}) { super(message); this.name = 'PreviewServiceError'; this.code = code; this.details = details; }
}
function log(level, message, meta = {}) {
  const payload = { service: SERVICE_NAME, version: VERSION, message, ...meta };
  try { if (logger) { const fn = logger[level] || logger.info; if (typeof fn === 'function') return fn.call(logger, payload); } } catch (_) {}
  const line = `[${SERVICE_NAME}] ${safeJson(payload)}`;
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}
function safeJson(value) { try { return JSON.stringify(value); } catch (_) { return '{"serializationError":true}'; } }
function now() { return new Date(); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function randomId(prefix = '') { return `${prefix}${crypto.randomBytes(12).toString('hex')}`; }
function sha256Buffer(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => { const stream = fs.createReadStream(filePath); stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); });
  return hash.digest('hex');
}
function normalizeRelativePath(value) {
  if (typeof value !== 'string') throw new PreviewServiceError('Invalid artifact path.', 'ARTIFACT_INVALID');
  let normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').includes('..')) throw new PreviewServiceError(`Unsafe artifact path: ${value}`, 'ARTIFACT_INVALID');
  return normalized;
}
function ensureInside(parent, child) {
  const p = path.resolve(parent); const c = path.resolve(child);
  if (c !== p && !c.startsWith(`${p}${path.sep}`)) throw new PreviewServiceError('Artifact path escapes allowed workspace.', 'ARTIFACT_INVALID');
  return c;
}
function normalizeBuildId(value) {
  const v = String(value || '').trim();
  if (!v || /[\/\\\0]/.test(v) || v.includes('..')) throw new PreviewServiceError('Valid buildId is required.', 'BUILD_NOT_SUCCESSFUL');
  return v;
}
function normalizeProjectId(value) { const v = String(value || '').trim(); if (!v) throw new PreviewServiceError('projectId is required.', 'BUILD_NOT_SUCCESSFUL'); return v; }
function normalizeUserId(value) { const v = String(value || '').trim(); if (!v) throw new PreviewServiceError('userId is required.', 'BUILD_NOT_SUCCESSFUL'); return v; }
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim()); }
async function pathExists(target) { try { await fsp.access(target); return true; } catch (_) { return false; } }

function runProcess(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs || 60000; const maxOutput = options.maxOutput || 50000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...(options.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let settled = false; let timedOut = false;
    const append = (value, chunk) => (value + String(chunk)).slice(-maxOutput);
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ...result, stdout, stderr, timedOut }); };
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGTERM'); } catch (_) {} setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 1500).unref?.(); }, timeoutMs);
    child.once('error', error => { if (settled) return; settled = true; clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => finish({ code, signal: signal || null }));
  });
}
async function docker(args, options = {}) {
  let result;
  try { result = await runProcess(DOCKER_COMMAND, args, { timeoutMs: options.timeoutMs || 60000, maxOutput: options.maxOutput || 50000 }); }
  catch (error) { throw new PreviewServiceError(`Docker command could not start: ${error.message}`, 'DOCKER_UNAVAILABLE'); }
  if (result.timedOut) throw new PreviewServiceError('Docker command timed out.', 'DOCKER_UNAVAILABLE', { args });
  return result;
}
async function assertDockerAvailable() {
  const result = await docker(['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 10000 });
  if (result.code !== 0) throw new PreviewServiceError(`Docker is unavailable: ${String(result.stderr || '').trim()}`, 'DOCKER_UNAVAILABLE');
  return String(result.stdout || '').trim();
}

async function validateProjectAccess(projectId, userId, suppliedProject) {
  const project = suppliedProject || await Project.findById(projectId);
  if (!project) throw new PreviewServiceError('Project not found.', 'PREVIEW_NOT_FOUND');
  const ownerId = String(project.userId || project.ownerId || '');
  const members = Array.isArray(project.members) ? project.members : [];
  const isMember = members.some(member => String(member.userId || member.user || '') === String(userId) && member.status !== 'suspended');
  if (ownerId !== String(userId) && !isMember) throw new PreviewServiceError('You do not have access to this project.', 'PREVIEW_NOT_FOUND');
  return project;
}
async function getAuthoritativeBuild({ projectId, userId, buildId }) {
  const build = await ProjectBuild.findOne({ projectId, userId, buildId, status: 'success' }).lean();
  if (!build) throw new PreviewServiceError('Successful authoritative build not found.', 'BUILD_NOT_SUCCESSFUL');
  if (build.metadata?.authoritative !== true || build.metadata?.validationMode !== 'authoritative') throw new PreviewServiceError('Requested build is not marked authoritative.', 'BUILD_NOT_SUCCESSFUL');
  const artifact = selectPreviewArtifact(build);
  if (!artifact || !artifact.storageKey || !isSha256(artifact.checksum)) throw new PreviewServiceError('Authoritative build artifact metadata is incomplete.', 'ARTIFACT_INVALID');
  return build;
}
function selectPreviewArtifact(build) {
  const artifacts = Array.isArray(build && build.artifacts) ? build.artifacts : [];
  return artifacts.find(item => item && (item.name === 'build.tar.gz' || /\.(?:tar\.gz|tgz)$/i.test(item.storageKey || '')) && item.type === 'build') || artifacts.find(item => item && item.type === 'build') || null;
}

function resolveLocalStorageKey(storageKey) {
  const normalized = normalizeRelativePath(storageKey);
  return ensureInside(AUTH_ARTIFACT_ROOT, path.resolve(AUTH_ARTIFACT_ROOT, normalized));
}
async function getS3ObjectBuffer(key) {
  if (!AUTH_ARTIFACT_BUCKET) return null;
  let S3Client, GetObjectCommand;
  try { ({ S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')); }
  catch (_) { throw new PreviewServiceError('S3 is configured but @aws-sdk/client-s3 is not installed.', 'ARTIFACT_NOT_FOUND'); }
  const client = new S3Client({ region: AUTH_ARTIFACT_REGION });
  let response;
  try { response = await client.send(new GetObjectCommand({ Bucket: AUTH_ARTIFACT_BUCKET, Key: normalizeRelativePath(key) })); }
  catch (error) {
    if (error && (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) return null;
    throw new PreviewServiceError(`Unable to read build artifact from S3: ${error.message}`, 'ARTIFACT_NOT_FOUND');
  }
  if (!response.Body) return null;
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function materializeArchive({ build, artifact }) {
  const key = String(artifact.storageKey || '').trim();
  if (!key) throw new PreviewServiceError('Authoritative artifact has no storageKey.', 'ARTIFACT_NOT_FOUND');
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'zyrionos-authoritative-artifact-'));
  const archivePath = path.join(tempRoot, 'build.tar.gz');
  try {
    const localPath = resolveLocalStorageKey(key);
    if (await pathExists(localPath)) {
      const stat = await fsp.stat(localPath);
      if (!stat.isFile()) throw new PreviewServiceError('Artifact storage key does not resolve to a file.', 'ARTIFACT_INVALID');
      if (stat.size > MAX_ARTIFACT_TOTAL_SIZE) throw new PreviewServiceError('Artifact exceeds maximum size.', 'ARTIFACT_INVALID');
      await fsp.copyFile(localPath, archivePath);
    } else {
      const buffer = await getS3ObjectBuffer(key);
      if (!buffer) throw new PreviewServiceError('Authoritative artifact was not found in local storage or S3.', 'ARTIFACT_NOT_FOUND', { storageKey: key });
      if (buffer.length > MAX_ARTIFACT_TOTAL_SIZE) throw new PreviewServiceError('Artifact exceeds maximum size.', 'ARTIFACT_INVALID');
      await fsp.writeFile(archivePath, buffer, { flag: 'wx', mode: 0o600 });
    }
    const actualChecksum = await sha256File(archivePath);
    if (!isSha256(artifact.checksum) || actualChecksum.toLowerCase() !== String(artifact.checksum).toLowerCase()) throw new PreviewServiceError('Authoritative build archive checksum mismatch.', 'ARTIFACT_CHECKSUM_MISMATCH', { expected: artifact.checksum, actual: actualChecksum });
    // Reject path traversal and links before extraction. GNU tar verbose listing uses
    // the first character for entry type: '-' file, 'd' directory, 'l' symlink, 'h' hardlink.
    const listing = await runProcess('tar', ['-tzf', archivePath], { timeoutMs: 30000, maxOutput: 2 * 1024 * 1024 });
    if (listing.code !== 0 || listing.timedOut) throw new PreviewServiceError('Build archive is corrupt or cannot be listed.', 'ARTIFACT_INVALID');
    const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
    if (!entries.length || entries.length > MAX_ARTIFACT_FILES) throw new PreviewServiceError('Build archive contains no files or exceeds the file-count limit.', 'ARTIFACT_INVALID');
    for (const entry of entries) {
      const normalized = entry.replace(/^\.\//, '');
      if (!normalized || normalized === '.') continue;
      normalizeRelativePath(normalized);
    }
    const verbose = await runProcess('tar', ['-tvzf', archivePath], { timeoutMs: 30000, maxOutput: 2 * 1024 * 1024 });
    if (verbose.code !== 0 || verbose.timedOut) throw new PreviewServiceError('Unable to validate build archive entries.', 'ARTIFACT_INVALID');
    for (const line of verbose.stdout.split(/\r?\n/).filter(Boolean)) {
      const kind = line.charAt(0);
      if (kind !== '-' && kind !== 'd') throw new PreviewServiceError('Build archive contains a link or unsupported special file.', 'ARTIFACT_INVALID', { entryType: kind });
    }
    const extractedRoot = path.join(tempRoot, 'extracted');
    await fsp.mkdir(extractedRoot, { recursive: true });
    const extracted = await runProcess('tar', ['--no-same-owner', '--no-same-permissions', '-xzf', archivePath, '-C', extractedRoot], { timeoutMs: 60000, maxOutput: 50000 });
    if (extracted.code !== 0 || extracted.timedOut) throw new PreviewServiceError('Unable to safely extract authoritative build archive.', 'ARTIFACT_INVALID', { stderr: extracted.stderr });
    const buildOutput = String(build.outputDirectory || build.metadata?.artifact?.outputDirectory || '').trim().replace(/\\/g, '/').replace(/^\.\/+|\/+$/g, '');
    const candidates = [];
    if (buildOutput) candidates.push(ensureInside(extractedRoot, path.join(extractedRoot, normalizeRelativePath(buildOutput))));
    candidates.push(path.join(extractedRoot, 'dist'), path.join(extractedRoot, 'build'), path.join(extractedRoot, 'out'), extractedRoot);
    let outputDir = null;
    for (const candidate of candidates) {
      const indexPath = path.join(candidate, 'index.html');
      if (await pathExists(indexPath)) { const stat = await fsp.stat(indexPath); if (stat.isFile()) { outputDir = candidate; break; } }
    }
    if (!outputDir) throw new PreviewServiceError('Authoritative build archive has no index.html in outputDirectory, dist, build, out or archive root. This preview runtime supports static frontends only.', 'ARTIFACT_INVALID');
    const files = await collectFiles(outputDir);
    return { tempRoot, outputDir, integrity: { fileCount: files.length, totalSize: files.reduce((sum, item) => sum + item.size, 0) }, storageKey: key, checksum: actualChecksum };
  } catch (error) {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    if (error instanceof PreviewServiceError) throw error;
    throw new PreviewServiceError(`Artifact materialization failed: ${error.message}`, 'ARTIFACT_INVALID');
  }
}
async function collectFiles(rootDir) {
  const result = [];
  async function walk(current, relativeBase = '') {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = relativeBase ? path.posix.join(relativeBase, entry.name) : entry.name;
      normalizeRelativePath(relative);
      const stat = await fsp.lstat(absolute);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new PreviewServiceError('Extracted artifact contains an unsupported file type.', 'ARTIFACT_INVALID');
      if (stat.isDirectory()) await walk(absolute, relative);
      else {
        if (stat.size > MAX_ARTIFACT_FILE_SIZE) throw new PreviewServiceError(`Artifact file exceeds size limit: ${relative}`, 'ARTIFACT_INVALID');
        result.push({ path: relative, size: stat.size });
        if (result.length > MAX_ARTIFACT_FILES) throw new PreviewServiceError('Artifact contains too many files.', 'ARTIFACT_INVALID');
      }
    }
  }
  await walk(rootDir);
  const totalSize = result.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_ARTIFACT_TOTAL_SIZE) throw new PreviewServiceError('Artifact exceeds total size limit.', 'ARTIFACT_INVALID');
  return result;
}
async function createRuntimeWorkspace(previewId) {
  await fsp.mkdir(PREVIEW_WORK_ROOT, { recursive: true });
  return fsp.mkdtemp(path.join(PREVIEW_WORK_ROOT, `${previewId}-`));
}
async function copyDirectorySafe(sourceDir, destinationDir) {
  await fsp.mkdir(destinationDir, { recursive: true });
  for (const entry of await fsp.readdir(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const destination = ensureInside(destinationDir, path.join(destinationDir, entry.name));
    const stat = await fsp.lstat(source);
    if (stat.isSymbolicLink()) throw new PreviewServiceError('Symbolic links are not permitted in preview output.', 'ARTIFACT_INVALID');
    if (entry.isDirectory()) await copyDirectorySafe(source, destination);
    else if (entry.isFile()) {
      if (stat.size > MAX_ARTIFACT_FILE_SIZE) throw new PreviewServiceError(`Artifact file exceeds preview limit: ${entry.name}`, 'ARTIFACT_INVALID');
      await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    }
  }
}
function createStaticServerScript() {
  return `'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const ROOT = '/workspace/site';
const PORT = 3000;
const MIME = { '.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.map':'application/json; charset=utf-8' };
function safeResolve(raw) { let decoded; try { decoded = decodeURIComponent(raw); } catch (_) { return null; } if (decoded.includes('\\0') || decoded.includes('\\\\')) return null; const relative = decoded.replace(/^\\/+/, ''); if (relative.split('/').includes('..')) return null; const target = path.resolve(ROOT, relative); if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null; return target; }
function sendFile(res, file) { res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'); res.setHeader('Cache-Control','no-cache'); fs.createReadStream(file).on('error', () => { if (!res.headersSent) res.statusCode=500; res.end('Preview read error'); }).pipe(res); }
const server = http.createServer(async (req,res) => { try { const parsed = new URL(req.url || '/', 'http://preview.local'); let target = safeResolve(parsed.pathname); if (!target) { res.statusCode=400; res.end('Bad Request'); return; } let stat = null; try { stat = await fs.promises.stat(target); } catch (_) {} if (stat && stat.isDirectory()) { target = path.join(target,'index.html'); try { stat = await fs.promises.stat(target); } catch (_) { stat=null; } } if (!stat && !path.extname(parsed.pathname)) { const fallback=path.join(ROOT,'index.html'); try { const s=await fs.promises.stat(fallback); if (s.isFile()) { target=fallback; stat=s; } } catch (_) {} } if (!stat || !stat.isFile()) { res.statusCode=404; res.end('Not Found'); return; } sendFile(res,target); } catch (_) { res.statusCode=500; res.end('Preview runtime error'); } });
server.listen(PORT,'0.0.0.0',()=>console.log('ZYRIONOS_PREVIEW_READY'));
function shutdown(){ server.close(()=>process.exit(0)); } process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
`;
}
async function prepareRuntimeWorkspace({ previewId, artifact }) {
  const workspace = await createRuntimeWorkspace(previewId);
  try {
    const site = path.join(workspace, 'site');
    await copyDirectorySafe(artifact.outputDir, site);
    if (!(await pathExists(path.join(site, 'index.html')))) throw new PreviewServiceError('Preview output is missing index.html.', 'ARTIFACT_INVALID');
    const serverPath = path.join(workspace, '__zyrionos_preview_server.cjs');
    await fsp.writeFile(serverPath, createStaticServerScript(), { encoding: 'utf8', mode: 0o444, flag: 'wx' });
    return { workspace, site, serverPath };
  } catch (error) { await cleanupRuntimeWorkspace(workspace); throw error; }
}
function parsePublishedPort(output) {
  const text = String(output || '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  const matches = text.match(/:(\d+)/g);
  return matches && matches.length ? Number(matches[matches.length - 1].slice(1)) : null;
}
async function stopRuntimeContainer(containerId) {
  if (!containerId) return;
  await docker(['rm', '-f', String(containerId)], { timeoutMs: 20000 }).catch(() => {});
}
async function startRuntime({ previewId, runtimeWorkspace }) {
  const containerName = `zyrionos-preview-${previewId}`;
  await docker(['rm', '-f', containerName], { timeoutMs: 10000 }).catch(() => {});
  const portMapping = PREVIEW_PORT > 0 ? `${PREVIEW_BIND_HOST}:${PREVIEW_PORT}:3000` : `${PREVIEW_BIND_HOST}::3000`;
  const args = ['run','-d','--name',containerName,'--cpus',PREVIEW_CPU,'--memory',PREVIEW_MEMORY,'--pids-limit',String(PREVIEW_PIDS),'--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--tmpfs','/run:rw,noexec,nosuid,size=16m','--cap-drop','ALL','--security-opt','no-new-privileges','--restart','no','--network',PREVIEW_RUNTIME_NETWORK,'-p',portMapping,'-v',`${runtimeWorkspace}:/workspace:ro`,PREVIEW_NODE_IMAGE,'node','/workspace/__zyrionos_preview_server.cjs'];
  const result = await docker(args, { timeoutMs: 120000 });
  if (result.code !== 0 || !String(result.stdout || '').trim()) throw new PreviewServiceError(`Preview container failed to start: ${String(result.stderr || '').trim()}`, 'PREVIEW_RUNTIME_FAILED');
  const containerId = String(result.stdout).trim().split(/\s+/)[0];
  let hostPort = PREVIEW_PORT || null;
  if (!hostPort) { const portResult = await docker(['port', containerId, '3000/tcp'], { timeoutMs: 10000 }); if (portResult.code === 0) hostPort = parsePublishedPort(portResult.stdout); }
  if (!hostPort || hostPort < 1 || hostPort > 65535) { await stopRuntimeContainer(containerId); throw new PreviewServiceError('Docker did not assign a valid preview host port.', 'PREVIEW_RUNTIME_FAILED'); }
  return { containerId, containerName, hostPort, internalPort: 3000, image: PREVIEW_NODE_IMAGE };
}
async function httpHealthCheck(host, port) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), PREVIEW_HEALTH_TIMEOUT_MS);
  try { const response = await fetch(`http://${host}:${port}/`, { method: 'GET', signal: controller.signal, redirect: 'manual' }); return { ok: response.status >= 200 && response.status < 500, status: response.status }; }
  catch (error) { return { ok: false, status: null, error: error.message }; }
  finally { clearTimeout(timer); }
}
async function waitForRuntimeHealth(port) {
  let last = null;
  for (let attempt = 1; attempt <= PREVIEW_HEALTH_RETRIES; attempt++) {
    last = await httpHealthCheck('127.0.0.1', port);
    if (last.ok) return { ...last, attempt };
    if (attempt < PREVIEW_HEALTH_RETRIES) await sleep(PREVIEW_HEALTH_RETRY_DELAY_MS);
  }
  throw new PreviewServiceError('Preview runtime health check failed.', 'HEALTH_CHECK_FAILED', { hostPort: port, lastResult: last });
}
function buildPreviewUrls({ previewId, hostPort }) {
  if (PREVIEW_BASE_URL) {
    const url = `${PREVIEW_BASE_URL}/preview/${encodeURIComponent(previewId)}`;
    let hostname = null; try { hostname = new URL(url).hostname; } catch (_) {}
    return { url, publicUrl: url, hostname, directUrl: PREVIEW_PUBLIC_HOST ? `http://${PREVIEW_PUBLIC_HOST}:${hostPort}` : null };
  }
  if (!PREVIEW_PUBLIC_HOST) throw new PreviewServiceError('Public preview URL is not configured. Set PREVIEW_BASE_URL to a working preview gateway or PREVIEW_PUBLIC_HOST to a reachable host.', 'PREVIEW_RUNTIME_FAILED');
  const url = `http://${PREVIEW_PUBLIC_HOST}:${hostPort}`;
  return { url, publicUrl: url, hostname: PREVIEW_PUBLIC_HOST, directUrl: url };
}
async function cleanupRuntimeWorkspace(workspace) {
  if (!workspace) return;
  const resolved = path.resolve(workspace);
  if (resolved !== PREVIEW_WORK_ROOT && !resolved.startsWith(`${PREVIEW_WORK_ROOT}${path.sep}`)) { log('warn', 'Refusing to remove workspace outside preview root', { workspace }); return; }
  await fsp.rm(resolved, { recursive: true, force: true }).catch(error => log('warn', 'Workspace cleanup failed', { error: error.message }));
}
async function getNextPreviewNumber(projectId) {
  const latest = await ProjectPreview.findOne({ projectId }).sort({ previewNumber: -1 }).select({ previewNumber: 1 }).lean();
  return Number(latest?.previewNumber || 0) + 1;
}
function resolveSourceHash({ build, artifact }) { return String(build.metadata?.sourceHash || build.metadata?.sourceChecksum || artifact.checksum || build.buildId); }
async function assertPreviewCapacity(projectId, userId) {
  const count = await ProjectPreview.countDocuments({ projectId, userId, status: { $in: ['queued', 'building', 'starting', 'ready'] } });
  if (count >= PREVIEW_MAX_ACTIVE) throw new PreviewServiceError(`Preview limit reached. Maximum active previews: ${PREVIEW_MAX_ACTIVE}.`, 'PREVIEW_LIMIT_REACHED', { count, limit: PREVIEW_MAX_ACTIVE });
}
function serializePreview(preview) {
  if (!preview) return null;
  const source = typeof preview.toObject === 'function' ? preview.toObject() : { ...preview };
  const runtimeInfo = source.runtimeInfo || {};
  delete source.containerId; delete source.workerId; delete source.queueName;
  delete source.runtimeInfo?.hostPort; delete source.runtimeInfo?.internalPort; delete source.runtimeInfo?.image;
  delete source.metadata?.artifactPath; delete source.metadata?.artifactStorageKey; delete source.metadata?.runtimeWorkspace;
  source.runtimeInfo = { status: runtimeInfo.status || 'unknown' };
  return source;
}

async function createPreview({ projectId, userId, buildId, project, requestContext = {} }) {
  const pId = normalizeProjectId(projectId); const uId = normalizeUserId(userId); const bId = normalizeBuildId(buildId);
  const access = await validateProjectAccess(pId, uId, project);
  await assertPreviewCapacity(pId, uId);
  await assertDockerAvailable();
  const build = await getAuthoritativeBuild({ projectId: pId, userId: uId, buildId: bId });
  const artifactRecord = selectPreviewArtifact(build);
  if (!artifactRecord) throw new PreviewServiceError('Authoritative build has no previewable artifact.', 'ARTIFACT_NOT_FOUND');
  const previewId = randomId('preview_'); const previewNumber = await getNextPreviewNumber(pId); const sourceHash = resolveSourceHash({ build, artifact: artifactRecord });
  let materialized = null; let runtimeWorkspace = null; let runtime = null; let preview = null;
  try {
    materialized = await materializeArchive({ build, artifact: artifactRecord });
    runtimeWorkspace = await prepareRuntimeWorkspace({ previewId, artifact: materialized });
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
    preview = await ProjectPreview.create({ projectId: pId, userId: uId, previewId, previewNumber, buildId: bId, sourceVersionId: build.sourceVersionId || build.sourceId || null, sourceHash, framework: String(build.framework || access.framework || 'static'), runtime: String(build.runtime || 'node'), nodeVersion: String(build.nodeVersion || '20'), packageManager: String(build.packageManager || 'npm'), status: 'starting', startedAt: now(), expiresAt, runtimeInfo: { status: 'starting' }, healthCheck: { status: 'checking' }, secretsInjected: false, productionSecretsBlocked: true, networkAccess: PREVIEW_RUNTIME_NETWORK === 'none' ? 'none' : 'restricted', metadata: { serviceVersion: VERSION, artifactType: artifactRecord.type || 'build', artifactChecksum: artifactRecord.checksum, artifactFileCount: materialized.integrity.fileCount, artifactSize: materialized.integrity.totalSize, trigger: requestContext.trigger || 'manual' } });
    runtime = await startRuntime({ previewId, runtimeWorkspace: runtimeWorkspace.workspace });
    activeRuntimes.set(previewId, { previewId, containerId: runtime.containerId, containerName: runtime.containerName, hostPort: runtime.hostPort, internalPort: runtime.internalPort, image: runtime.image, workspace: runtimeWorkspace.workspace, artifactRoot: materialized.tempRoot, startedAt: Date.now() });
    const health = await waitForRuntimeHealth(runtime.hostPort);
    const urls = buildPreviewUrls({ previewId, hostPort: runtime.hostPort });
    await ProjectPreview.updateOne({ _id: preview._id }, { $set: { status: 'ready', url: urls.url, publicUrl: urls.publicUrl, hostname: urls.hostname, readyAt: now(), runtimeInfo: { status: 'running', hostPort: runtime.hostPort, internalPort: runtime.internalPort, image: runtime.image, startedAt: now() }, healthCheck: { status: 'healthy', lastCheckedAt: now(), lastStatusCode: health.status, responseTimeMs: null, consecutiveSuccesses: 1, consecutiveFailures: 0, message: 'Preview runtime healthy' } } });
    const ready = await ProjectPreview.findById(preview._id);
    log('info', 'Authoritative preview is ready', { previewId, buildId: bId, url: urls.url, artifactFileCount: materialized.integrity.fileCount });
    return serializePreview(ready);
  } catch (error) {
    if (runtime?.containerId) await stopRuntimeContainer(runtime.containerId);
    activeRuntimes.delete(previewId);
    if (runtimeWorkspace?.workspace) await cleanupRuntimeWorkspace(runtimeWorkspace.workspace);
    if (materialized?.tempRoot) await fsp.rm(materialized.tempRoot, { recursive: true, force: true }).catch(() => {});
    if (preview) {
      await ProjectPreview.updateOne({ _id: preview._id }, { $set: { status: 'failed', failedAt: now(), runtimeInfo: { status: 'crashed' }, healthCheck: { status: 'failed', lastCheckedAt: now(), message: safeErrorMessage(error) }, errors: [{ code: allowedErrorCode(error.code), message: safeErrorMessage(error), at: now(), details: error.details || null }] } }).catch(() => {});
    }
    throw error instanceof PreviewServiceError ? error : new PreviewServiceError(error.message || 'Preview creation failed.', 'PREVIEW_ERROR');
  }
}
function safeErrorMessage(error) { return String(error && error.message || error || 'Preview failed').slice(0, 4000); }
function allowedErrorCode(code) {
  const allowed = new Set(['BUILD_NOT_SUCCESSFUL','ARTIFACT_NOT_FOUND','ARTIFACT_INVALID','ARTIFACT_CHECKSUM_MISMATCH','DOCKER_UNAVAILABLE','PREVIEW_RUNTIME_FAILED','HEALTH_CHECK_FAILED','PREVIEW_LIMIT_REACHED','PREVIEW_NOT_FOUND','PREVIEW_ERROR']);
  return allowed.has(code) ? code : 'PREVIEW_ERROR';
}
async function getActivePreview({ projectId, userId }) {
  const preview = await ProjectPreview.findOne({ projectId: normalizeProjectId(projectId), userId: normalizeUserId(userId), status: 'ready' }).sort({ createdAt: -1 }).lean();
  return preview ? serializePreview(preview) : null;
}
async function getPreview({ projectId, userId, previewId }) {
  const preview = await ProjectPreview.findOne({ projectId: normalizeProjectId(projectId), userId: normalizeUserId(userId), previewId: String(previewId || '').trim() }).lean();
  if (!preview) throw new PreviewServiceError('Preview not found.', 'PREVIEW_NOT_FOUND');
  return serializePreview(preview);
}
async function listPreviews({ projectId, userId, limit = 20 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const previews = await ProjectPreview.find({ projectId: normalizeProjectId(projectId), userId: normalizeUserId(userId) }).sort({ createdAt: -1 }).limit(safeLimit).lean();
  return previews.map(serializePreview);
}
async function getPreviewHealth({ projectId, userId, previewId }) {
  const pId = normalizeProjectId(projectId); const uId = normalizeUserId(userId); const id = String(previewId || '').trim();
  const preview = await ProjectPreview.findOne({ projectId: pId, userId: uId, previewId: id });
  if (!preview) throw new PreviewServiceError('Preview not found.', 'PREVIEW_NOT_FOUND');
  const runtime = activeRuntimes.get(id);
  if (!runtime) return { previewId: id, status: preview.runtimeInfo?.status || 'unknown', healthy: preview.healthCheck?.status === 'healthy', runtimeRegistered: false, url: preview.publicUrl || preview.url || null };
  const health = await httpHealthCheck('127.0.0.1', runtime.hostPort);
  await ProjectPreview.updateOne({ _id: preview._id }, { $set: { 'healthCheck.status': health.ok ? 'healthy' : 'unhealthy', 'healthCheck.lastCheckedAt': now(), 'healthCheck.lastStatusCode': health.status, 'healthCheck.message': health.ok ? 'Preview runtime healthy' : safeErrorMessage(health.error || 'Health check failed'), 'runtimeInfo.status': health.ok ? 'running' : 'unknown' } });
  return { previewId: id, status: health.ok ? 'running' : 'unknown', healthy: health.ok, statusCode: health.status, url: preview.publicUrl || preview.url || null, runtimeRegistered: true };
}
async function stopLifecycle({ projectId, userId, previewId, status }) {
  const pId = normalizeProjectId(projectId); const uId = normalizeUserId(userId); const id = String(previewId || '').trim();
  const preview = await ProjectPreview.findOne({ projectId: pId, userId: uId, previewId: id });
  if (!preview) throw new PreviewServiceError('Preview not found.', 'PREVIEW_NOT_FOUND');
  const runtime = activeRuntimes.get(id);
  if (runtime) {
    await stopRuntimeContainer(runtime.containerId);
    await cleanupRuntimeWorkspace(runtime.workspace);
    if (runtime.artifactRoot) await fsp.rm(runtime.artifactRoot, { recursive: true, force: true }).catch(() => {});
    activeRuntimes.delete(id);
  }
  const patch = { status, runtimeInfo: { status: 'stopped' } };
  if (status === 'stopped') patch.stoppedAt = now();
  if (status === 'expired') patch.expiredAt = now();
  await ProjectPreview.updateOne({ _id: preview._id }, { $set: patch });
  return serializePreview(await ProjectPreview.findById(preview._id).lean());
}
async function stopPreview(args) { return stopLifecycle({ ...args, status: 'stopped' }); }
async function expirePreview(args) { return stopLifecycle({ ...args, status: 'expired' }); }
async function cleanupExpiredPreviews() {
  const candidates = await ProjectPreview.find({ status: { $in: ['ready','starting','building'] }, expiresAt: { $lte: now() } }).limit(100);
  let cleaned = 0;
  for (const preview of candidates) {
    try {
      const runtime = activeRuntimes.get(preview.previewId);
      if (runtime) {
        await stopRuntimeContainer(runtime.containerId); await cleanupRuntimeWorkspace(runtime.workspace);
        if (runtime.artifactRoot) await fsp.rm(runtime.artifactRoot, { recursive: true, force: true }).catch(() => {});
        activeRuntimes.delete(preview.previewId);
      }
      await ProjectPreview.updateOne({ _id: preview._id }, { $set: { status: 'expired', expiredAt: now(), runtimeInfo: { status: 'stopped' } } }); cleaned++;
    } catch (error) { log('warn', 'Failed to cleanup expired preview', { previewId: preview.previewId, error: error.message }); }
  }
  return { cleaned };
}
async function shutdownAllPreviews() {
  for (const runtime of Array.from(activeRuntimes.values())) {
    await stopRuntimeContainer(runtime.containerId);
    await cleanupRuntimeWorkspace(runtime.workspace);
    if (runtime.artifactRoot) await fsp.rm(runtime.artifactRoot, { recursive: true, force: true }).catch(() => {});
  }
  activeRuntimes.clear();
}
function getServiceInfo() {
  return { name: SERVICE_NAME, version: VERSION, architecture: 'verified-authoritative-archive-static-preview', authoritativeBuildRequired: true, rebuildsProject: false, productionDeployment: false, dependencyInstall: false, runtime: 'isolated-docker', runtimeNetwork: PREVIEW_RUNTIME_NETWORK, activeRuntimeCount: activeRuntimes.size, maxActivePreviews: PREVIEW_MAX_ACTIVE, artifactRootConfigured: Boolean(AUTH_ARTIFACT_ROOT), artifactBucketConfigured: Boolean(AUTH_ARTIFACT_BUCKET), publicBaseUrlConfigured: Boolean(PREVIEW_BASE_URL), publicHostConfigured: Boolean(PREVIEW_PUBLIC_HOST) };
}

module.exports = { VERSION, SERVICE_NAME, PreviewServiceError, createPreview, getActivePreview, getPreview, listPreviews, getPreviewHealth, stopPreview, expirePreview, cleanupExpiredPreviews, shutdownAllPreviews, getServiceInfo, assertDockerAvailable };
