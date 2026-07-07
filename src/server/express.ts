import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as http from 'http';
import * as crypto from 'crypto';
import multer from 'multer';
import { EngineContext } from '../mcp/tools/types.js';
import { CollectionManager, CollectionNotFoundError, RequestNotFoundError } from '../engine/collection-manager.js';
import { EnvironmentManager, EnvironmentNotFoundError } from '../engine/environment-manager.js';
import { FlowManager } from '../engine/flow-manager.js';
import { DotEnvLoader } from '../engine/dotenv-loader.js';
import chokidar, { FSWatcher } from 'chokidar';
import { writeLock, readLock } from './lock.js';
import { fileURLToPath } from 'url';
import { parseCurl } from '../engine/curl-parser.js';
import { generateCode } from '../engine/code-generator.js';
import { exportToPostman, exportToOpenApi, exportToDocs } from '../engine/exporter.js';
import { execute as executeHttp } from '../engine/http-executor.js';
import { detectFramework } from '../engine/framework-detector.js';
import { attachTerminal } from './terminal.js';

function injectGrpcAuth(auth: any, metadata: Record<string, string>) {
  const creds = auth.credentials ?? {};
  switch (auth.type) {
    case 'bearer':
      if (creds.token) metadata['authorization'] = `Bearer ${creds.token}`;
      break;
    case 'apiKey':
      if (creds.key && creds.value) metadata[creds.key.toLowerCase()] = creds.value;
      break;
    case 'basic':
      if (creds.username && creds.password) {
        const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
        metadata['authorization'] = `Basic ${encoded}`;
      }
      break;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Shallow-merges a config patch onto the existing config file contents.
 * A missing file (existingRaw === null) starts fresh. A file that exists but
 * fails to parse must NOT be silently treated as empty - that would wipe the
 * user's auth profiles, workspaces, and secret provider config. In that case
 * we refuse and let the caller surface an error.
 */
export function mergeConfigPatch(
  existingRaw: string | null,
  patch: Record<string, unknown>,
): { next: Record<string, unknown> } | { error: string } {
  let current: Record<string, unknown> = {};
  if (existingRaw !== null) {
    try {
      current = JSON.parse(existingRaw);
    } catch {
      return { error: 'Existing config file is not valid JSON; refusing to overwrite it.' };
    }
  }
  return { next: { ...current, ...patch } };
}
export function startExpressServer(context: EngineContext, port: number = 4242) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    console.error(`[Express] Received request: ${req.method} ${req.path}`);
    next();
  });

  // ---------------------------------------------------------------------------
  // SSE - server-sent events for real-time UI updates
  // ---------------------------------------------------------------------------
  const sseClients = new Set<express.Response>();

  const emit = (type: string) => {
    if (sseClients.size === 0) return;
    const payload = `data: ${JSON.stringify({ type })}\n\n`;
    for (const client of sseClients) {
      try { client.write(payload); } catch { sseClients.delete(client); }
    }
  };

  let reqlyDirWatcher: FSWatcher | null = null;
  let watcherPendingEvents = new Set<string>();
  let watcherDebounceTimer: NodeJS.Timeout | null = null;

  const triggerWatcherEmit = () => {
    for (const e of watcherPendingEvents) {
      emit(e);
    }
    watcherPendingEvents.clear();
    watcherDebounceTimer = null;
  };

  const startReqlyWatcher = (projectDir: string) => {
    if (reqlyDirWatcher) {
      reqlyDirWatcher.close();
    }
    const reqlyDir = path.join(projectDir, '.reqly');
    reqlyDirWatcher = chokidar.watch(reqlyDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 3
    });

    reqlyDirWatcher.on('all', (event, filePath) => {
      const p = filePath.replace(/\\/g, '/');
      if (p.includes('.schema-cache')) return;

      if (p.includes('/collections/') || p.endsWith('/collections')) {
        watcherPendingEvents.add('collections');
      } else if (p.endsWith('environments.yaml')) {
        watcherPendingEvents.add('environments');
      } else if (p.includes('/flows/') || p.endsWith('/flows')) {
        watcherPendingEvents.add('flows');
      } else if (p.endsWith('history.ndjson')) {
        context.historyStore.reloadFromDisk();
        watcherPendingEvents.add('history');
      } else if (p.endsWith('responses.json')) {
        context.responseStore.reloadFromDisk();
        watcherPendingEvents.add('responses');
      } else if (p.endsWith('.reqly')) {
        watcherPendingEvents.add('collections');
      }

      if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
      watcherDebounceTimer = setTimeout(triggerWatcherEmit, 300);
    });
  };

  startReqlyWatcher(path.dirname(context.collectionManager.getBaseDir()));

  // Intercept res.json on mutating requests to emit the right event type.
  // One middleware covers all routes - no need to add emit() calls per route.
  app.use((req, res, next) => {
    if (req.method === 'GET') return next();
    const orig = res.json.bind(res);
    (res as any).json = function (body: unknown) {
      const result = orig(body);
      if (res.statusCode < 400) {
        const p = req.path;
        if (p.startsWith('/api/collections') || p === '/capture/inbound' || p === '/api/import') {
          emit('collections');
        } else if (p.startsWith('/api/flows')) {
          emit('flows');
        } else if (p.startsWith('/api/environments') || p === '/api/dotenv') {
          emit('environments');
        } else if (p.startsWith('/api/run/') || p === '/api/history') {
          emit('history');
        } else if (p === '/api/switch-project' && (body as any)?.ok) {
          emit('project');
        }
      }
      return result;
    };
    next();
  });

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    // Heartbeat every 25s to prevent proxy/nginx idle timeouts
    const heartbeat = setInterval(() => {
      try { res.write(':heartbeat\n\n'); } catch { sseClients.delete(res); clearInterval(heartbeat); }
    }, 25000);
    req.on('close', () => { sseClients.delete(res); clearInterval(heartbeat); });
  });

  // Engine API Routes
  app.post('/api/proxy/start', async (req, res) => {
    try {
      await context.proxyServer.start({ 
        port: req.body.port || 7474, 
        collectionName: req.body.collectionName || 'captured' 
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/proxy/stop', async (req, res) => {
    try {
      await context.proxyServer.stop();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/proxy/captured', (req, res) => {
    res.json(context.proxyServer.capturedRequests);
  });

  app.delete('/api/proxy/captured', (req, res) => {
    context.proxyServer.capturedRequests = [];
    res.json({ success: true });
  });

  app.post('/api/tunnel/start', async (req, res) => {
    try {
      const url = await context.tunnelManager.start(port);
      res.json({ success: true, url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/tunnel/stop', (req, res) => {
    context.tunnelManager.stop();
    res.json({ success: true });
  });

  app.get('/api/tunnel/status', (req, res) => {
    res.json(context.tunnelManager.getStatus());
  });

  async function resolveColMgr(colName: string): Promise<CollectionManager> {
    const activeRoot = path.dirname(context.collectionManager.getBaseDir());
    const configured = await context.authManager.getWorkspaceProjects();
    const allRoots = Array.from(new Set([activeRoot, ...configured]));
    for (const root of allRoots) {
      const mgr = new CollectionManager(path.join(root, '.reqly'));
      try {
        await mgr.getCollection(colName);
        return mgr;
      } catch {}
    }
    return context.collectionManager;
  }

  app.use('/webhooks', async (req, res) => {
    try {
      const collectionName = 'Webhooks';
      try {
        await context.collectionManager.getCollection(collectionName);
      } catch {
        await context.collectionManager.createCollection(collectionName);
      }

      // Add /webhooks to the saved path since it's stripped by app.use mount
      const fullPath = '/webhooks' + req.url;
      const name = `${req.method} ${fullPath}`.replace(/[^a-zA-Z0-9- /]/g, '').trim().substring(0, 30);
      await context.collectionManager.addRequest(collectionName, {
        id: Date.now().toString(),
        name: `${name} ${Date.now()}`,
        method: req.method as any,
        url: fullPath,
        headers: req.headers as Record<string, string>,
        body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '')
      });

      res.json({ ok: true, message: "Webhook captured by Reqly" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/capture/inbound', async (req, res) => {
    try {
      const { method, url, headers, body, collection } = req.body;
      const collectionName = collection || 'Captured';

      try {
        await context.collectionManager.getCollection(collectionName);
      } catch {
        await context.collectionManager.createCollection(collectionName);
      }

      const existingCollection = await context.collectionManager.getCollection(collectionName);
      const alreadyCaptured = existingCollection.requests.some(
        (r) => r.method === method && r.url === url
      );

      if (!alreadyCaptured) {
        const name = `${method} ${url}`.replace(/[^a-zA-Z0-9- ]/g, '').trim().substring(0, 30);
        await context.collectionManager.addRequest(collectionName, {
          id: Date.now().toString(),
          name: `${name} ${Date.now()}`,
          method,
          url,
          headers,
          body: typeof body === 'string' ? body : JSON.stringify(body ?? '')
        });
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/workspace', async (_req, res) => {
    try {
      const activeProjectRoot = path.dirname(context.collectionManager.getBaseDir());
      const configuredProjects = await context.authManager.getWorkspaceProjects();
      const projectsSet = new Set([activeProjectRoot, ...configuredProjects]);
      const projects = Array.from(projectsSet).map(p => ({
        path: p,
        name: path.basename(p),
      }));
      res.json({ projects });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/workspace/projects', express.json(), async (req, res) => {
    try {
      if (!req.body.path) throw new Error('Path is required');
      await context.authManager.addWorkspaceProject(req.body.path);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/workspace/projects', express.json(), async (req, res) => {
    try {
      if (!req.body.path) throw new Error('Path is required');
      await context.authManager.removeWorkspaceProject(req.body.path);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // T-226: named workspace model (aliases -> local repo paths)
  app.get('/api/workspaces', async (_req, res) => {
    try {
      const workspaces = await context.workspaceManager.listWorkspaces();
      const active = await context.workspaceManager.getActiveWorkspace();
      res.json({ workspaces, active: active?.name ?? null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/workspaces', express.json(), async (req, res) => {
    try {
      if (!req.body.name) throw new Error('name is required');
      const workspace = await context.workspaceManager.createWorkspace(req.body.name);
      res.json(workspace);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/workspaces/active', express.json(), async (req, res) => {
    try {
      if (!req.body.name) throw new Error('name is required');
      const workspace = await context.workspaceManager.useWorkspace(req.body.name);
      res.json({ active: req.body.name, workspace });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/workspaces/active', async (_req, res) => {
    try {
      await context.workspaceManager.clearActiveWorkspace();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/workspaces/:name/repos', express.json(), async (req, res) => {
    try {
      if (!req.body.alias || !req.body.path) throw new Error('alias and path are required');
      const workspace = await context.workspaceManager.linkRepo(req.params.name, req.body.alias, req.body.path);
      res.json(workspace);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/workspaces/:name/repos/:alias', async (req, res) => {
    try {
      const workspace = await context.workspaceManager.unlinkRepo(req.params.name, req.params.alias);
      res.json(workspace);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/project', async (_req, res) => {
    const projectRoot = path.dirname(context.collectionManager.getBaseDir());
    const framework = await detectFramework(projectRoot);
    res.json({
      path: projectRoot,
      name: path.basename(projectRoot),
      framework,
      hasEverConnectedAgent: context.hasEverConnectedAgent ?? false,
      lastMcpActivityAt: context.lastMcpActivityAt ?? null,
    });
  });

  app.get('/api/project/gitignore', async (_req, res) => {
    const projectRoot = path.dirname(context.collectionManager.getBaseDir());
    const gitignorePath = path.join(projectRoot, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      const lines = content.split('\n');
      const hasHistory = lines.includes('.reqly/history.ndjson');
      const hasResponses = lines.includes('.reqly/responses.json');
      res.json({
        ok: true,
        missing: [
          ...(hasHistory ? [] : ['.reqly/history.ndjson']),
          ...(hasResponses ? [] : ['.reqly/responses.json'])
        ]
      });
    } catch {
      // .gitignore doesn't exist
      res.json({
        ok: true,
        missing: ['.reqly/history.ndjson', '.reqly/responses.json']
      });
    }
  });

  app.post('/api/project/gitignore', async (_req, res) => {
    const projectRoot = path.dirname(context.collectionManager.getBaseDir());
    const gitignorePath = path.join(projectRoot, '.gitignore');
    try {
      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf8');
      } catch {
        // doesn't exist
      }
      const lines = content.split('\n');
      let changed = false;
      
      if (!lines.includes('.reqly/history.ndjson')) {
        content += (content.endsWith('\n') || content === '' ? '' : '\n') + '.reqly/history.ndjson\n';
        changed = true;
      }
      if (!lines.includes('.reqly/responses.json')) {
        content += (content.endsWith('\n') || content === '' ? '' : '\n') + '.reqly/responses.json\n';
        changed = true;
      }

      if (changed) {
        await fs.writeFile(gitignorePath, content, 'utf8');
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Schema cache - persists GraphQL introspection results per URL in
  // .reqly/.schema-cache/<sha256-of-url>.json so the UI can restore the schema
  // across sessions without re-introspecting on every load.
  // ---------------------------------------------------------------------------
  app.get('/api/schema-cache', async (req, res) => {
    const url = req.query.url as string | undefined;
    if (!url) { res.status(400).json({ error: 'url query param required' }); return; }
    try {
      const projectRoot = path.dirname(context.collectionManager.getBaseDir());
      const cacheDir = path.join(projectRoot, '.reqly', '.schema-cache');
      const hash = crypto.createHash('sha256').update(url).digest('hex');
      const cacheFile = path.join(cacheDir, `${hash}.json`);
      const raw = await fs.readFile(cacheFile, 'utf8');
      res.json(JSON.parse(raw));
    } catch {
      res.status(404).json({ error: 'not found' });
    }
  });

  app.post('/api/schema-cache', async (req, res) => {
    const { url, schema } = req.body as { url?: string; schema?: unknown };
    if (!url || !schema) { res.status(400).json({ error: 'url and schema are required' }); return; }
    try {
      const projectRoot = path.dirname(context.collectionManager.getBaseDir());
      const cacheDir = path.join(projectRoot, '.reqly', '.schema-cache');
      await fs.mkdir(cacheDir, { recursive: true });
      const hash = crypto.createHash('sha256').update(url).digest('hex');
      const cacheFile = path.join(cacheDir, `${hash}.json`);
      const payload = { url, schema, cachedAt: new Date().toISOString() };
      await fs.writeFile(cacheFile, JSON.stringify(payload), 'utf8');
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/open-folder-picker', async (_req, res) => {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      if (process.platform === 'darwin') {
        try {
          const { stdout } = await execFileAsync(
            'osascript',
            ['-e', 'POSIX path of (choose folder)'],
            { timeout: 120000 }
          );
          res.json({ path: stdout.trim() });
        } catch {
          res.json({ cancelled: true });
        }
      } else if (process.platform === 'win32') {
        try {
          const psScript = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }";
          const { stdout } = await execFileAsync('powershell', ['-Command', psScript], { timeout: 120000 });
          const selected = stdout.trim();
          if (selected) {
            res.json({ path: selected });
          } else {
            res.json({ cancelled: true });
          }
        } catch {
          res.json({ cancelled: true });
        }
      } else {
        res.status(501).json({ error: 'Native folder picker is not supported on this platform' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/clone-repo', async (req, res) => {
    try {
      const { url, destination } = req.body;
      if (!url || !destination) {
        res.status(400).json({ error: 'url and destination are required' });
        return;
      }
      
      let destPath = destination;
      if (destPath.startsWith('~/')) {
        destPath = path.join(os.homedir(), destPath.slice(2));
      }
      
      const repoName = url.split('/').pop()?.replace('.git', '') || 'repo';
      const targetPath = path.join(destPath, repoName);
      
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        await fs.mkdir(destPath, { recursive: true });
        
        await execAsync(`git clone ${url} "${targetPath}"`);
        
        res.json({ path: targetPath });
      } catch (e: any) {
        let errorMessage = 'Failed to clone repository.';
        
        // child_process.exec attaches the raw command output to e.stderr
        const stderr = e.stderr || e.message || '';
        
        if (stderr.includes('already exists and is not an empty directory')) {
          errorMessage = `The folder "${repoName}" already exists in that destination. Please choose a different folder or delete the existing one.`;
        } else if (stderr.includes('Repository not found') || stderr.includes('not found')) {
          errorMessage = 'Repository not found. Please check the URL and ensure the repository is public or you have the correct access rights.';
        } else if (stderr.includes('Permission denied') || stderr.includes('Authentication failed')) {
          errorMessage = 'Authentication failed. Please ensure you have access to this repository.';
        } else if (stderr.includes('could not resolve host') || stderr.includes('Could not resolve host')) {
          errorMessage = 'Network error. Could not connect to the repository host.';
        } else if (e.code === 'ENOENT') {
          errorMessage = 'Git is not installed or not available in the system PATH.';
        } else {
          // Fallback: extract just the fatal git error line if possible, avoiding the ugly Node.js command stack trace
          const fatalMatch = stderr.match(/fatal: (.*)/i);
          if (fatalMatch) {
            errorMessage = `Git error: ${fatalMatch[1]}`;
          }
        }
        
        res.status(500).json({ error: errorMessage });
      }
    } catch (e: any) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' });
    }
  });

  app.get('/api/collections', async (req, res) => {
    try {
      const activeProjectRoot = path.dirname(context.collectionManager.getBaseDir());
      const configuredProjects = await context.authManager.getWorkspaceProjects();
      const projectsSet = new Set([activeProjectRoot, ...configuredProjects]);
      const cols = await context.collectionManager.loadAll(Array.from(projectsSet));
      res.json(cols);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/import', async (req, res) => {
    try {
      const { content, format, collectionName } = req.body as {
        content: string;
        format: 'postman' | 'bruno' | 'insomnia' | 'openapi';
        collectionName?: string;
      };
      if (!content) return res.status(400).json({ error: 'content is required' });
      const validFormats = ['postman', 'bruno', 'insomnia', 'openapi'];
      if (!validFormats.includes(format)) {
        return res.status(400).json({ error: `format must be one of: ${validFormats.join(', ')}` });
      }
      const { importFromContent } = await import('../engine/importer.js');
      const result = await importFromContent(content, format, context.collectionManager, collectionName);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/collections', async (req, res) => {
    try {
      const col = await context.collectionManager.createCollection(req.body.name);
      res.json(col);
    } catch (e: any) {
      // Invalid/reserved-name errors are client errors, not server faults.
      const status = /^invalid collection name|is a reserved directory name/i.test(e.message) ? 400 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  app.put('/api/collections/:name', async (req, res) => {
    try {
      if (typeof req.body?.name !== 'string' || req.body.name.trim() === '') {
        return res.status(400).json({ error: 'A new collection name is required.' });
      }
      await context.collectionManager.renameCollection(req.params.name, req.body.name);
      res.json({ success: true });
    } catch (e: any) {
      const status = e instanceof CollectionNotFoundError ? 404 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:name', async (req, res) => {
    try {
      await context.collectionManager.deleteCollection(req.params.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/collections/:name/duplicate', async (req, res) => {
    try {
      const finalName = await context.collectionManager.duplicateRequest(
        req.params.name,
        req.body.requestName,
        req.body.newName
      );
      res.json({ success: true, name: finalName });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Duplicates the whole collection folder. Named "clone" (not "duplicate") to
  // avoid colliding with the existing /duplicate route above, which duplicates
  // a single request inside a collection.
  app.post('/api/collections/:name/clone', async (req, res) => {
    try {
      const copy = await context.collectionManager.duplicateCollection(req.params.name);
      res.json(copy);
    } catch (e: any) {
      const status = e instanceof CollectionNotFoundError ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  app.post('/api/collections/:collection/requests/:request/move', async (req, res) => {
    try {
      const result = await context.collectionManager.moveRequest(
        req.params.collection,
        req.params.request,
        req.body.targetCollection
      );
      res.json(result);
    } catch (e: any) {
      const status = (e instanceof CollectionNotFoundError || e instanceof RequestNotFoundError) ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  app.post('/api/collections/:name/requests', async (req, res) => {
    try {
      const exists = fsSync.existsSync(path.join(context.collectionManager.getBaseDir(), req.params.name, `${req.body.name}.yaml`));
      if (exists) {
        return res.status(409).json({ error: `A request named "${req.body.name}" already exists. Please choose a different name.` });
      }
      await context.collectionManager.addRequest(req.params.name, req.body);
      res.json({ success: true });
    } catch (e: any) {
      const status = /^invalid request name/i.test(e.message) ? 400 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  app.put('/api/collections/:name/requests/:requestName', async (req, res) => {
    try {
      if (req.params.requestName !== req.body.name) {
        // Handle rename: delete old, add new. Validate the new name BEFORE
        // deleting the old file, or an invalid name would destroy the request.
        if (typeof req.body?.name !== 'string' || req.body.name.trim() === '' ||
            req.body.name === '.' || req.body.name === '..' ||
            req.body.name.includes('/') || req.body.name.includes('\\') || req.body.name.includes('\0')) {
          return res.status(400).json({ error: `invalid request name "${req.body?.name}": names cannot contain path separators or "..".` });
        }
        const exists = fsSync.existsSync(path.join(context.collectionManager.getBaseDir(), req.params.name, `${req.body.name}.yaml`));
        if (exists) {
           return res.status(409).json({ error: `A request named "${req.body.name}" already exists. Please choose a different name.` });
        }
        await context.collectionManager.deleteRequest(req.params.name, req.params.requestName);
      }
      await context.collectionManager.addRequest(req.params.name, req.body);
      res.json({ success: true });
    } catch (e: any) {
      const status = /^invalid request name/i.test(e.message) ? 400 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:name/requests/:requestName', async (req, res) => {
    try {
      await context.collectionManager.deleteRequest(req.params.name, req.params.requestName);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections/:name/variables', async (req, res) => {
    try {
      const vars = await context.collectionManager.getCollectionVariables(req.params.name);
      res.json(vars);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/collections/:name/variables/:key', async (req, res) => {
    try {
      await context.collectionManager.setCollectionVariable(req.params.name, req.params.key, req.body.value);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:name/variables/:key', async (req, res) => {
    try {
      await context.collectionManager.deleteCollectionVariable(req.params.name, req.params.key);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections/:name/auth', async (req, res) => {
    try {
      const auth = await context.collectionManager.getCollectionAuth(req.params.name);
      res.json(auth ?? null);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/collections/:name/auth', async (req, res) => {
    try {
      await context.collectionManager.setCollectionAuth(req.params.name, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:name/auth', async (req, res) => {
    try {
      await context.collectionManager.deleteCollectionAuth(req.params.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections/:name/spec', async (req, res) => {
    try {
      const spec = await context.collectionManager.getCollectionSpec(req.params.name);
      if (!spec) {
        res.json({ loaded: false, operationCount: 0 });
        return;
      }
      const source = spec.specPath || spec.specUrl;
      const cached = source ? context.specLoader.get(source) : undefined;
      const { listOperations } = await import('../engine/contract-validator.js');
      res.json({
        specPath: spec.specPath,
        specUrl: spec.specUrl,
        operationCount: cached ? listOperations(cached).length : 0,
        loaded: !!cached,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/collections/:name/spec', async (req, res) => {
    try {
      const spec = { ...(req.body.specPath ? { specPath: req.body.specPath } : {}), ...(req.body.specUrl ? { specUrl: req.body.specUrl } : {}) };
      await context.collectionManager.setCollectionSpec(req.params.name, spec);
      const source = spec.specPath || spec.specUrl;
      const loaded = await context.specLoader.load(source);
      const { listOperations } = await import('../engine/contract-validator.js');
      res.json({ ...spec, operationCount: listOperations(loaded).length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:name/spec', async (req, res) => {
    try {
      const spec = await context.collectionManager.getCollectionSpec(req.params.name);
      await context.collectionManager.deleteCollectionSpec(req.params.name);
      const source = spec?.specPath || spec?.specUrl;
      if (source) context.specLoader.clear(source);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections/:name/spec/operations', async (req, res) => {
    try {
      const spec = await context.collectionManager.getCollectionSpec(req.params.name);
      if (!spec) {
        res.status(400).json({ error: 'No spec configured on this collection.' });
        return;
      }
      const source = spec.specPath || spec.specUrl;
      const loaded = await context.specLoader.load(source!);
      const { listOperations } = await import('../engine/contract-validator.js');
      res.json(listOperations(loaded));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/collections/:name/requests/:req/validate', async (req, res) => {
    try {
      const spec = await context.collectionManager.getCollectionSpec(req.params.name);
      if (!spec) {
        res.status(400).json({ error: 'No spec configured on this collection.' });
        return;
      }
      const response = context.responseStore.get(req.params.req);
      if (!response) {
        res.status(400).json({ error: `No stored response for "${req.params.req}". Run it first.` });
        return;
      }
      const reqDef = await context.collectionManager.getRequest(req.params.name, req.params.req);
      const { findOperation, validate } = await import('../engine/contract-validator.js');
      const { resolveVariables } = await import('../engine/variable-substitutor.js');
      const collectionVars = await context.collectionManager.getCollectionVariables(req.params.name);
      const resolvedUrl = resolveVariables(reqDef.url, [collectionVars]);
      const baseUrl = collectionVars.baseUrl || '';
      const source = spec.specPath || spec.specUrl;
      const loadedSpec = await context.specLoader.load(source!);
      const matched = findOperation(loadedSpec, reqDef.method, resolvedUrl, baseUrl, reqDef.specOperationId);
      if (!matched) {
        res.json({ violations: [], matched: false });
        return;
      }
      res.json({ violations: validate(matched.operation, response), operation: matched.operationId, matched: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/flows', async (req, res) => {
    try {
      const flows = await context.flowManager.listFlows();
      res.json(flows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/flows', async (req, res) => {
    try {
      const flow = await context.flowManager.createFlow(req.body.name, req.body.description);
      res.json(flow);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/flows/:name', async (req, res) => {
    try {
      const flow = await context.flowManager.getFlow(req.params.name);
      res.json(flow);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  app.delete('/api/flows/:name', async (req, res) => {
    try {
      await context.flowManager.deleteFlow(req.params.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/flows/:name/meta', async (req, res) => {
    try {
      const flow = await context.flowManager.updateFlowMeta(req.params.name, req.body);
      res.json(flow);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/flows/:name/data', async (req, res) => {
    try {
      await context.flowManager.setFlowData(req.params.name, req.body.data || []);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/flows/:name/steps', async (req, res) => {
    try {
      await context.flowManager.addFlowStep(req.params.name, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/flows/:name/steps/:stepId', async (req, res) => {
    try {
      await context.flowManager.updateFlowStep(req.params.name, req.params.stepId, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/flows/:name/steps/:stepId', async (req, res) => {
    try {
      await context.flowManager.deleteFlowStep(req.params.name, req.params.stepId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/flows/:name/run', async (req, res) => {
    try {
      const flow = await context.flowManager.getFlow(req.params.name);
      const { FlowRunner } = await import('../engine/flow-runner.js');
      const runner = new FlowRunner(context);
      const result = await runner.run(flow, req.body?.dataRow ? { dataRow: req.body.dataRow } : {});
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/flows/:name/export-ci', async (req, res) => {
    try {
      await context.flowManager.getFlow(req.params.name); // throws if the flow doesn't exist
      const format = req.body?.format || 'github-actions';
      if (format !== 'github-actions') {
        res.status(400).json({ error: `Unsupported format "${format}". Supported formats: github-actions` });
        return;
      }
      const { generateGithubActionsWorkflow } = await import('../engine/github-actions-export.js');
      const yaml = generateGithubActionsWorkflow(req.params.name);
      res.json({ yaml });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/auth-profiles', async (req, res) => {
    try {
      const profiles = await context.authManager.listProfiles();
      res.json(profiles);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth-profiles', async (req, res) => {
    try {
      const profile = await context.authManager.createProfile(req.body);
      res.json(profile);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/auth-profiles/:id', async (req, res) => {
    try {
      await context.authManager.deleteProfile(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // OAuth2: manual token refresh
  app.post('/api/auth-profiles/:id/refresh', async (req, res) => {
    try {
      const updated = await context.authManager.refreshOAuth2Token(req.params.id);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // OAuth2: initiate authorization code + PKCE flow
  // Opens the system browser at the provider's authUrl, starts a temporary
  // local HTTP callback server, exchanges the code for tokens, stores them.
  app.post('/api/auth-profiles/:id/authorize', async (req, res) => {
    try {
      const profile = await context.authManager.getProfile(req.params.id);
      const { clientId, authUrl, tokenUrl, redirectUri, scope, clientSecret } = profile.credentials;

      if (!authUrl) return res.status(400).json({ error: 'No authUrl configured on profile' }) as any;
      if (!tokenUrl) return res.status(400).json({ error: 'No tokenUrl configured on profile' }) as any;
      if (!clientId) return res.status(400).json({ error: 'No clientId configured on profile' }) as any;

      // PKCE
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const state = crypto.randomBytes(16).toString('hex');

      // Parse the redirect URI to get the callback port
      const callbackUri = redirectUri || 'http://localhost:9876/callback';
      const callbackUrl = new URL(callbackUri);
      const callbackPort = parseInt(callbackUrl.port || '9876', 10);

      // Build authorization URL
      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: callbackUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...(scope ? { scope } : {}),
      });
      const fullAuthUrl = `${authUrl}?${authParams.toString()}`;

      // Start local callback server
      const codePromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.close();
          reject(new Error('OAuth2 authorization timed out after 5 minutes'));
        }, 5 * 60 * 1000);

        const server = http.createServer((cbReq, cbRes) => {
          const cbUrl = new URL(cbReq.url || '/', `http://localhost:${callbackPort}`);
          const returnedState = cbUrl.searchParams.get('state');
          const code = cbUrl.searchParams.get('code');
          const error = cbUrl.searchParams.get('error');

          cbRes.writeHead(200, { 'Content-Type': 'text/html' });
          if (error || returnedState !== state || !code) {
            cbRes.end('<html><body><h2>Authorization failed</h2><p>You can close this tab.</p></body></html>');
            clearTimeout(timeout);
            server.close();
            reject(new Error(error || 'Authorization failed: invalid state or missing code'));
            return;
          }
          cbRes.end('<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to Reqly.</p></body></html>');
          clearTimeout(timeout);
          server.close();
          resolve(code);
        });

        server.listen(callbackPort);
      });

      // Open browser
      const { exec } = await import('child_process');
      const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${openCmd} "${fullAuthUrl}"`);

      // Notify caller that flow has started
      res.json({ status: 'browser_opened', authUrl: fullAuthUrl });

      // Exchange code for tokens in background; update profile when done
      codePromise.then(async (code) => {
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUri,
          client_id: clientId,
          code_verifier: codeVerifier,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
        });

        const { fetch: undiciFetch } = await import('undici');
        const tokenRes = await undiciFetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (!tokenRes.ok) {
          console.error(`[OAuth2] Token exchange failed: ${tokenRes.status}`);
          return;
        }

        const data: any = await tokenRes.json();
        const expiresAt = data.expires_in ? String(Date.now() + Number(data.expires_in) * 1000) : undefined;

        await context.authManager.updateProfile(profile.id, {
          credentials: {
            ...profile.credentials,
            accessToken: data.access_token,
            ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
            ...(expiresAt ? { expiresAt } : {}),
          },
        });
        console.error(`[OAuth2] Tokens stored for profile "${profile.name}"`);
      }).catch(e => {
        console.error(`[OAuth2] Authorization failed: ${e.message}`);
      });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/environments', async (req, res) => {
    try {
      const envs = await context.environmentManager.listEnvironments();
      const active = await context.environmentManager.getActiveEnvironment();
      res.json({ environments: envs, active: active?.name });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/environments/active', async (req, res) => {
    try {
      await context.environmentManager.setActiveEnvironment(req.body.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/environments', async (req, res) => {
    try {
      await context.environmentManager.createEnvironment(req.body.name, req.body.variables || {});
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/environments/duplicate', async (req, res) => {
    try {
      const copy = await context.environmentManager.duplicateEnvironment(req.body.name);
      res.json(copy);
    } catch (e: any) {
      const status = e instanceof EnvironmentNotFoundError ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  app.put('/api/environments/:name', async (req, res) => {
    try {
      await context.environmentManager.updateEnvironment(req.params.name, req.body.variables || {});
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/environments/:name', async (req, res) => {
    try {
      await context.environmentManager.deleteEnvironment(req.params.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Export environment as Postman JSON (triggers download in browser)
  app.get('/api/environments/:name/export', async (req, res) => {
    try {
      const json = await context.environmentManager.exportEnvironmentToPostman(req.params.name);
      const filename = `${req.params.name}.postman_environment.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(json);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Import environment from Postman JSON
  app.post('/api/environments/import', async (req, res) => {
    try {
      const { content, nameOverride } = req.body as { content: string; nameOverride?: string };
      if (!content) return res.status(400).json({ error: 'content is required' }) as any;
      const env = await context.environmentManager.importEnvironmentFromPostman(content, nameOverride);
      res.json({ success: true, name: env.name, variableCount: Object.keys(env.variables).length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Collection example responses
  app.post('/api/collections/:col/requests/:req/examples', async (req, res) => {
    try {
      const { exampleName, status, body, headers, latency } = req.body;
      const saved = await context.collectionManager.saveExample(req.params.col, req.params.req, {
        name: exampleName,
        status,
        body: body ?? null,
        headers: headers || {},
        latency: latency || 0,
      });
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections/:col/requests/:req/examples', async (req, res) => {
    try {
      const examples = await context.collectionManager.listExamples(req.params.col, req.params.req);
      res.json(examples);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:col/requests/:req/examples/:exampleId', async (req, res) => {
    try {
      await context.collectionManager.deleteExample(req.params.col, req.params.req, req.params.exampleId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/switch-project', async (req, res) => {
    try {
      const projectDir: string = req.body.projectDir;
      const createIfMissing: boolean = !!req.body.createIfMissing;
      if (!projectDir) {
        res.status(400).json({ error: 'projectDir is required' });
        return;
      }

      try {
        await fs.access(projectDir);
      } catch {
        res.status(404).json({ error: 'Path not found', notFound: true });
        return;
      }

      const collectionsDir = path.join(projectDir, '.reqly');
      let hasReqlyDir = true;
      try {
        await fs.access(collectionsDir);
      } catch {
        hasReqlyDir = false;
      }

      if (!hasReqlyDir && !createIfMissing) {
        res.json({ ok: false, needsReqlyDir: true, projectDir });
        return;
      }

      if (!hasReqlyDir && createIfMissing) {
        await fs.mkdir(collectionsDir, { recursive: true });
      }

      const environmentsPath = path.join(collectionsDir, 'environments.yaml');

      context.collectionManager = new CollectionManager(collectionsDir);
      context.environmentManager = new EnvironmentManager(environmentsPath);
      context.flowManager = new FlowManager(collectionsDir);

      context.dotEnvLoader.stopWatching();
      const dotenvFiles = await context.authManager.getDotenvFiles();
      context.dotEnvLoader = new DotEnvLoader(projectDir, dotenvFiles, context.secretRegistry);
      await context.dotEnvLoader.load();
      context.dotEnvLoader.watch();
      startReqlyWatcher(projectDir);

      const lock = await readLock();
      await writeLock(projectDir, lock?.port || port);

      res.json({ ok: true, projectDir });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/shutdown', async (req, res) => {
    res.json({ ok: true });
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);
  });

  app.get('/api/history', (req, res) => {
    res.json(context.historyStore.list());
  });

  app.delete('/api/history', (req, res) => {
    context.historyStore.clear();
    res.json({ success: true });
  });

  const globalConfigPath = path.join(os.homedir(), '.reqly', 'config.json');

  app.post('/api/run/collection', async (req, res) => {
    try {
      let env = undefined;
      if (req.body.environmentName) {
        const envs = await context.environmentManager.listEnvironments();
        env = envs.find((e: any) => e.name === req.body.environmentName);
      } else {
        env = await context.environmentManager.getActiveEnvironment() || undefined;
      }
      
      const { CollectionRunner } = await import('../engine/collection-runner.js');
      const runner = new CollectionRunner(context);
      const result = await runner.run(req.body.collectionName, { 
        stopOnFailure: req.body.stopOnFailure,
        environment: env
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/run/adhoc', async (req, res) => {
    try {
      let env = undefined;
      if (req.body.environmentName) {
        const envs = await context.environmentManager.listEnvironments();
        env = envs.find((e: any) => e.name === req.body.environmentName);
      } else {
        env = await context.environmentManager.getActiveEnvironment() || undefined;
      }

      // Normalise: some callers send the request at the top level (legacy), others
      // wrap it in { request: {...} }. Support both.
      const requestBody = req.body.request ?? req.body;

      // Route gRPC requests to the dedicated runner (T-164/T-168).
      if (requestBody.type === 'grpc') {
        const { runGrpcAdhoc } = await import('../engine/grpc-adhoc.js');
        const collectionName = requestBody._collection;
        const collectionVars = collectionName
          ? await context.collectionManager.getCollectionVariables(collectionName).catch(() => ({}))
          : {};
        const envVars = env?.variables ?? {};

        const { resolveVariables } = await import('../engine/variable-substitutor.js');
        const resolvedUrl = resolveVariables(requestBody.url, [collectionVars, envVars]);

        // Build metadata from headers + auth
        const metadata: Record<string, string> = {};
        if (collectionName) {
          const { resolveCollectionAuth } = await import('../engine/collection-auth.js');
          const colAuthCfg = await context.collectionManager.getCollectionAuth(collectionName).catch(() => undefined);
          const colAuth = await resolveCollectionAuth(colAuthCfg, context.authManager);
          if (colAuth) injectGrpcAuth(colAuth, metadata);
        }
        if (requestBody.authProfileId) {
          try {
            const reqAuth = await context.authManager.getProfile(requestBody.authProfileId);
            if (reqAuth) injectGrpcAuth(reqAuth, metadata);
          } catch { /* no auth profile */ }
        }
        if (requestBody.headers) Object.assign(metadata, requestBody.headers);

        const grpcCfg = requestBody.grpc;
        const protosDir = context.collectionManager.getBaseDir() + '/protos';

        const result = await runGrpcAdhoc({
          serverUrl: resolvedUrl,
          protoFile: grpcCfg.protoFile,
          service: grpcCfg.service,
          method: grpcCfg.method,
          message: grpcCfg.message ?? {},
          messages: grpcCfg.messages,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          insecure: grpcCfg.insecure !== false,
          streaming: grpcCfg.streaming,
          streamTimeout: grpcCfg.streamTimeout,
        }, protosDir);

        return res.json({ response: result });
      }

      let auth = undefined;
      if (requestBody.authProfileId) {
        auth = await context.authManager.getProfile(requestBody.authProfileId);
        // Auto-refresh OAuth2 token if expired or expiring within 60 seconds
        if (auth.type === 'oauth2' && auth.credentials.refreshToken) {
          const expiresAt = Number(auth.credentials.expiresAt || 0);
          if (!expiresAt || Date.now() > expiresAt - 60_000) {
            try {
              auth = await context.authManager.refreshOAuth2Token(auth.id);
            } catch (e: any) {
              console.error(`[OAuth2] Auto-refresh failed: ${e.message}`);
            }
          }
        }
      }

      const { substituteConfig } = await import('../engine/variable-substitutor.js');
      const envVars = env ? env.variables : {};
      const collectionName = requestBody._collection;
      const collectionVars = collectionName
        ? await context.collectionManager.getCollectionVariables(collectionName).catch(() => ({}))
        : {};
      let collectionAuth = undefined;
      if (collectionName) {
        const { resolveCollectionAuth } = await import('../engine/collection-auth.js');
        const colAuthCfg = await context.collectionManager.getCollectionAuth(collectionName).catch(() => undefined);
        collectionAuth = await resolveCollectionAuth(colAuthCfg, context.authManager);
      }
      // Layered scope: collection vars win over env vars on collision.
      const config = substituteConfig(requestBody, [collectionVars, envVars], context.responseStore);

      const response = await context.executeRequest(config, env, auth, undefined, undefined, collectionVars, collectionAuth, collectionName);
      context.responseStore.set(requestBody.name, response);
      context.historyStore.append(requestBody, response);

      // Compute diff against previous run
      let diff = undefined;
      const lastTwo = context.historyStore.getLastTwo(requestBody.name);
      if (lastTwo.length === 2) {
        const { diffResponses } = await import('../engine/response-differ.js');
        diff = diffResponses(lastTwo[1], lastTwo[0]);
      }
      
      const { runAssertions } = await import('../engine/assertion-runner.js');
      let assertions: any[] = [];
      if (requestBody.assertions) {
        assertions = runAssertions(response, requestBody.assertions);
      }

      let contractViolations = null;
      let contractMatch = null;
      if (collectionName) {
        const { checkContract } = await import('../mcp/tools/contract-helper.js');
        const contractResult = await checkContract(context, collectionName, requestBody, response);
        if (contractResult) {
          contractViolations = contractResult.violations;
          contractMatch = {
            matched: contractResult.matched,
            operationId: contractResult.operationId,
            path: contractResult.path,
            method: contractResult.method,
            inferredPath: contractResult.inferredPath,
          };
        }
      }

      res.json({ response, assertions, diff, contractViolations, contractMatch });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Dedicated multipart ad-hoc run route. Uses multer (memStorage) so the browser
  // can upload real File objects for file parts. The _config field carries the full
  // RequestConfig as a JSON string; uploaded files are passed as resolvedFiles to
  // the executor so it skips disk reads for those parts.
  const multerUpload = multer({ storage: multer.memoryStorage() });
  app.post('/api/run/adhoc/multipart', multerUpload.any(), async (req, res) => {
    try {
      const configJson = (req.body as any)._config;
      if (!configJson) {
        res.status(400).json({ error: 'Missing _config field' });
        return;
      }
      const { request: requestConfig } = JSON.parse(configJson);

      let env = undefined;
      if (requestConfig.environmentName) {
        const envs = await context.environmentManager.listEnvironments();
        env = envs.find((e: any) => e.name === requestConfig.environmentName);
      } else {
        env = await context.environmentManager.getActiveEnvironment() || undefined;
      }

      let auth = undefined;
      if (requestConfig.authProfileId) {
        auth = await context.authManager.getProfile(requestConfig.authProfileId);
        if (auth.type === 'oauth2' && auth.credentials.refreshToken) {
          const expiresAt = Number(auth.credentials.expiresAt || 0);
          if (!expiresAt || Date.now() > expiresAt - 60_000) {
            try { auth = await context.authManager.refreshOAuth2Token(auth.id); } catch { /* ignore */ }
          }
        }
      }

      const { substituteConfig } = await import('../engine/variable-substitutor.js');
      const envVars = env ? env.variables : {};
      const collectionName = requestConfig._collection;
      const collectionVars = collectionName
        ? await context.collectionManager.getCollectionVariables(collectionName).catch(() => ({}))
        : {};
      let collectionAuth = undefined;
      if (collectionName) {
        const { resolveCollectionAuth } = await import('../engine/collection-auth.js');
        const colAuthCfg = await context.collectionManager.getCollectionAuth(collectionName).catch(() => undefined);
        collectionAuth = await resolveCollectionAuth(colAuthCfg, context.authManager);
      }
      const config = substituteConfig(requestConfig, [collectionVars, envVars], context.responseStore);

      // Build resolvedFiles map from multer uploads (keyed by part name field).
      const resolvedFiles: Record<string, Buffer> = {};
      if (Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          resolvedFiles[file.fieldname] = file.buffer;
        }
      }

      const dotEnvVars = context.dotEnvLoader.getVariablesRecord();
      // scriptFile resolution: use collection folder so preScriptFile/postScriptFile paths resolve correctly
      const scriptBaseDir = collectionName
        ? path.join(context.collectionManager.getBaseDir(), collectionName)
        : path.dirname(context.collectionManager.getBaseDir());
      let maxBodyBytes = 50 * 1024;
      try {
        const cfg = JSON.parse(await fs.readFile(globalConfigPath, 'utf-8'));
        if (cfg.maxBodyBytes) maxBodyBytes = cfg.maxBodyBytes;
      } catch { /* use default */ }

      const dotEnvSecretErrors: Record<string, string> = {};
      for (const secretErr of context.dotEnvLoader.getSecretErrors()) dotEnvSecretErrors[secretErr.key] = secretErr.error;
      const response = await executeHttp(
        config, env, auth, undefined, maxBodyBytes,
        collectionVars, collectionAuth, dotEnvVars, scriptBaseDir, resolvedFiles,
        {}, undefined, undefined, { registry: context.secretRegistry, dotEnvErrors: dotEnvSecretErrors }
      );
      context.responseStore.set(requestConfig.name, response);
      context.historyStore.append(requestConfig, response);

      let diff = undefined;
      const lastTwo = context.historyStore.getLastTwo(requestConfig.name);
      if (lastTwo.length === 2) {
        const { diffResponses } = await import('../engine/response-differ.js');
        diff = diffResponses(lastTwo[1], lastTwo[0]);
      }

      const { runAssertions } = await import('../engine/assertion-runner.js');
      let assertions: any[] = [];
      if (requestConfig.assertions) {
        assertions = runAssertions(response, requestConfig.assertions);
      }

      let contractViolations = null;
      let contractMatch = null;
      if (collectionName) {
        const { checkContract } = await import('../mcp/tools/contract-helper.js');
        const contractResult = await checkContract(context, collectionName, requestConfig, response);
        if (contractResult) {
          contractViolations = contractResult.violations;
          contractMatch = {
            matched: contractResult.matched,
            operationId: contractResult.operationId,
            path: contractResult.path,
            method: contractResult.method,
            inferredPath: contractResult.inferredPath,
          };
        }
      }

      res.json({ response, assertions, diff, contractViolations, contractMatch });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/run/realtime', async (req, res) => {
    try {
      const { type, url, captureTimeout, sendMessages, config } = req.body;
      const { runRealtimeCapture } = await import('../engine/realtime-executor.js');
      const result = await runRealtimeCapture(
        { type, url, config: config ?? {}, sendMessages: sendMessages ?? [] },
        { captureTimeout: captureTimeout ?? 5 },
      );
      res.json({ response: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/config', async (req, res) => {
    try {
      const data = await fs.readFile(globalConfigPath, 'utf-8');
      res.json(JSON.parse(data));
    } catch (e: any) {
      if (e.code === 'ENOENT') res.json({});
      else res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/config', async (req, res) => {
    try {
      let existingRaw: string | null = null;
      try {
        existingRaw = await fs.readFile(globalConfigPath, 'utf-8');
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e; // real read error, not "no file yet"
      }

      const merged = mergeConfigPatch(existingRaw, req.body || {});
      if ('error' in merged) {
        return res.status(409).json({ error: merged.error });
      }
      await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
      await fs.writeFile(globalConfigPath, JSON.stringify(merged.next, null, 2));
      res.json(merged.next);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Settings -> Secrets tab: vault URIs detected in .env with resolution
  // status, plus which providers have config (key names only, never values).
  app.get('/api/secrets/status', async (req, res) => {
    try {
      const secrets = typeof (context.dotEnvLoader as any).getSecretStatus === 'function'
        ? context.dotEnvLoader.getSecretStatus()
        : [];
      const providers = await context.authManager.getSecretProviders();
      res.json({ secrets, providers });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/secrets/providers/:provider', async (req, res) => {
    try {
      const { KNOWN_PROVIDER_NAMES } = await import('../mcp/tools/configure-secret-provider.js');
      const provider = req.params.provider;
      if (!KNOWN_PROVIDER_NAMES.includes(provider)) {
        return res.status(400).json({ error: `Unknown provider "${provider}". Supported: ${KNOWN_PROVIDER_NAMES.join(', ')}` });
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Body must be an object of provider config keys' });
      }
      await context.authManager.setSecretProviderConfig(provider, req.body);
      await context.dotEnvLoader.load();
      const secrets = typeof (context.dotEnvLoader as any).getSecretStatus === 'function'
        ? context.dotEnvLoader.getSecretStatus()
        : [];
      res.json({ provider, configured: true, secrets });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/app/login-item', async (req, res) => {
    const supported = !!process.env.REQLY_DESKTOP;
    if (!supported) return res.json({ enabled: false, supported: false });
    try {
      const data = await fs.readFile(globalConfigPath, 'utf-8');
      const cfg = JSON.parse(data);
      res.json({ enabled: !!cfg.launchAtLogin, supported: true });
    } catch {
      res.json({ enabled: false, supported: true });
    }
  });

  app.post('/api/app/login-item', async (req, res) => {
    const supported = !!process.env.REQLY_DESKTOP;
    if (!supported) return res.json({ enabled: false, supported: false });
    const enabled = !!req.body.enabled;
    let existingRaw: string | null = null;
    try {
      existingRaw = await fs.readFile(globalConfigPath, 'utf-8');
    } catch (e: any) {
      if (e.code !== 'ENOENT') return res.status(500).json({ error: e.message });
    }
    const merged = mergeConfigPatch(existingRaw, { launchAtLogin: enabled });
    if ('error' in merged) {
      return res.status(409).json({ error: merged.error });
    }
    await fs.mkdir(path.dirname(globalConfigPath), { recursive: true });
    await fs.writeFile(globalConfigPath, JSON.stringify(merged.next, null, 2));
    res.json({ enabled, supported: true });
  });

  app.get('/api/collections/:name/export', async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const format = (req.query.format as string) || 'postman';
      if (!['postman', 'openapi', 'docs'].includes(format)) {
        return res.status(400).json({ error: 'format must be "postman", "openapi", or "docs"' });
      }
      const collection = await context.collectionManager.getCollection(name);
      const content = format === 'docs' ? exportToDocs(collection) : format === 'openapi' ? exportToOpenApi(collection) : exportToPostman(collection);
      const ext = format === 'docs' ? 'md' : 'json';
      const filename = `${name.replace(/[^a-zA-Z0-9-_]/g, '_')}_${format}.${ext}`;
      res.setHeader('Content-Type', format === 'docs' ? 'text/markdown' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/import/curl', (req, res) => {
    try {
      const { curl } = req.body as { curl: string };
      if (!curl) return res.status(400).json({ error: 'curl field required' });
      const parsed = parseCurl(curl);
      res.json({ request: parsed });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // --- Mock server routes ---

  app.post('/api/mock/start', async (req, res) => {
    try {
      const { collection, port } = req.body as { collection: string; port?: number };
      if (!collection) return res.status(400).json({ error: 'collection is required' });
      await context.mockServer!.start(collection, port ?? 4243);
      res.json(context.mockServer!.getStatus());
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/mock/stop', async (_req, res) => {
    try {
      await context.mockServer!.stop();
      res.json({ stopped: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/mock/status', (_req, res) => {
    res.json(context.mockServer!.getStatus());
  });

  app.get('/api/dotenv', (_req, res) => {
    res.json({
      files: context.dotEnvLoader.getFiles(),
      variables: context.dotEnvLoader.getVariables().map(v => ({ key: v.key, source: v.source })),
    });
  });

  app.put('/api/dotenv', async (req, res) => {
    try {
      const files: string[] = req.body.files || [];
      await context.authManager.setDotenvFiles(files);
      context.dotEnvLoader.setFiles(files);
      await context.dotEnvLoader.load();
      res.json({
        files: context.dotEnvLoader.getFiles(),
        variables: context.dotEnvLoader.getVariables().map(v => ({ key: v.key, source: v.source })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/codegen', async (req, res) => {
    try {
      const { request, target } = req.body as { request: any; target: 'curl' | 'fetch' | 'axios' };
      if (!request || !target) return res.status(400).json({ error: 'request and target fields required' });

      // Resolve variables before generating code (same logic as /api/run)
      const { substituteConfig } = await import('../engine/variable-substitutor.js');
      const env = await context.environmentManager.getActiveEnvironment().catch(() => undefined);
      const envVars = env ? env.variables : {};
      const collectionName = request._collection;
      const collectionVars = collectionName
        ? await context.collectionManager.getCollectionVariables(collectionName).catch(() => ({}))
        : {};
      const resolved = substituteConfig(request, [collectionVars, envVars], context.responseStore);

      const code = generateCode(resolved, target);
      res.json({ code });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  const packageRoot = path.resolve(__dirname, '..', '..');
  let uiBuildPath = path.join(packageRoot, 'dist', 'ui');
  if (!fsSync.existsSync(uiBuildPath)) {
    uiBuildPath = path.join(packageRoot, 'src', 'ui', 'dist');
  }
  app.use(express.static(uiBuildPath));

  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(uiBuildPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  const server = app.listen(port, () => {
    console.error(`Reqly Express server listening on http://localhost:${port}`);
  });

  // path.dirname of getBaseDir() (.reqly/) always reflects the *current*
  // project root, including after /api/switch-project reassigns
  // context.collectionManager - no separate mutable state needed.
  attachTerminal(server, () => path.dirname(context.collectionManager.getBaseDir()));

  return server;
}
