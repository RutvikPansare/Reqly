import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import request from 'supertest';
import { startExpressServer } from './express.js';
import { EngineContext } from '../mcp/tools/types.js';
import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { AuthManager } from '../engine/auth-manager.js';
import { ProxyServer } from '../engine/proxy.js';
import { ResponseStore } from '../engine/response-store.js';
import { HistoryStore } from '../engine/history-store.js';
import { TunnelManager } from '../engine/tunnel-manager.js';
import { FlowManager } from '../engine/flow-manager.js';
import { DotEnvLoader } from '../engine/dotenv-loader.js';
import { SpecLoader } from '../engine/spec-loader.js';
import { LOCK_PATH, writeLock, readLock, clearLock } from './lock.js';

function buildContext(projectDir: string): EngineContext {
  const collectionManager = new CollectionManager(projectDir);
  return {
    collectionManager,
    environmentManager: new EnvironmentManager(`${projectDir}/environments.yaml`),
    authManager: new AuthManager(`${projectDir}/config.json`),
    proxyServer: new ProxyServer(collectionManager),
    tunnelManager: new TunnelManager(),
    responseStore: new ResponseStore(),
    historyStore: new HistoryStore(),
    flowManager: new FlowManager(projectDir),
    dotEnvLoader: new DotEnvLoader(projectDir),
    specLoader: new SpecLoader(),
    executeRequest: async () => ({ status: 200, statusText: 'OK', headers: {}, body: '', latencyMs: 0 } as any),
  };
}

describe('GET /api/project', () => {
  let context: EngineContext;
  let server: ReturnType<typeof startExpressServer>;
  const projectDir = '/tmp/reqly-test-project-info';

  beforeEach(async () => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    fs.mkdirSync(projectDir, { recursive: true });
    context = buildContext(`${projectDir}/.reqly`);
    server = startExpressServer(context, 4998);
  });

  afterEach(async () => {
    await clearLock();
    server.close();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('returns name, framework, hasEverConnectedAgent, and lastMcpActivityAt alongside path', async () => {
    fs.writeFileSync(`${projectDir}/package.json`, JSON.stringify({ dependencies: { express: '4.0.0' } }));
    context.hasEverConnectedAgent = true;
    context.lastMcpActivityAt = 12345;

    const res = await request(server).get('/api/project');

    expect(res.body).toEqual({
      path: projectDir,
      name: 'reqly-test-project-info',
      framework: 'Express',
      hasEverConnectedAgent: true,
      lastMcpActivityAt: 12345,
    });
  });

  it('defaults hasEverConnectedAgent to false and lastMcpActivityAt/framework to null when unset', async () => {
    const res = await request(server).get('/api/project');

    expect(res.body).toEqual({
      path: projectDir,
      name: 'reqly-test-project-info',
      framework: null,
      hasEverConnectedAgent: false,
      lastMcpActivityAt: null,
    });
  });
});

describe('POST /api/switch-project', () => {
  let context: EngineContext;
  let server: ReturnType<typeof startExpressServer>;

  beforeEach(async () => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    context = buildContext('/tmp/reqly-test-old');
    await writeLock('/tmp/reqly-test-old', 4999);
    server = startExpressServer(context, 4999);
  });

  afterEach(async () => {
    await clearLock();
    server.close();
  });

  it('replaces collectionManager and environmentManager on the context, and updates the lock file', async () => {
    fs.mkdirSync('/tmp/reqly-test-new/.reqly', { recursive: true });
    const oldCollectionManager = context.collectionManager;
    const oldEnvironmentManager = context.environmentManager;

    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-new' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.projectDir).toBe('/tmp/reqly-test-new');

    expect(context.collectionManager).not.toBe(oldCollectionManager);
    expect(context.environmentManager).not.toBe(oldEnvironmentManager);

    const lock = await readLock();
    expect(lock!.projectDir).toBe('/tmp/reqly-test-new');

    fs.rmSync('/tmp/reqly-test-new', { recursive: true, force: true });
  });

  it('re-points dotEnvLoader to the new project dir and reloads it', async () => {
    fs.mkdirSync('/tmp/reqly-test-new/.reqly', { recursive: true });
    fs.writeFileSync('/tmp/reqly-test-new/.env', 'FOO=fromNewProject\n');
    const oldDotEnvLoader = context.dotEnvLoader;

    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-new' });

    expect(res.status).toBe(200);
    expect(context.dotEnvLoader).not.toBe(oldDotEnvLoader);
    expect(context.dotEnvLoader.getVariablesRecord()).toEqual({ FOO: 'fromNewProject' });

    fs.rmSync('/tmp/reqly-test-new', { recursive: true, force: true });
  });

  it('returns notFound when the path does not exist on disk', async () => {
    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-does-not-exist' });
    expect(res.status).toBe(404);
    expect(res.body.notFound).toBe(true);
  });

  it('returns needsReqlyDir without switching when the path exists but has no .reqly folder', async () => {
    fs.mkdirSync('/tmp/reqly-test-no-reqly-dir', { recursive: true });
    const oldCollectionManager = context.collectionManager;

    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-no-reqly-dir' });

    expect(res.status).toBe(200);
    expect(res.body.needsReqlyDir).toBe(true);
    expect(context.collectionManager).toBe(oldCollectionManager);

    fs.rmSync('/tmp/reqly-test-no-reqly-dir', { recursive: true, force: true });
  });

  it('does NOT emit a project SSE event when the switch is blocked by needsReqlyDir', async () => {
    fs.mkdirSync('/tmp/reqly-test-no-sse', { recursive: true });

    const events: string[] = [];
    const sseReq = http.get('http://localhost:4999/api/events', (sseRes) => {
      sseRes.on('data', (chunk) => events.push(chunk.toString()));
    });
    await new Promise((resolve) => sseReq.on('socket', () => setTimeout(resolve, 50)));

    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-no-sse' });
    expect(res.body.needsReqlyDir).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events.join('')).not.toContain('project');

    sseReq.destroy();
    fs.rmSync('/tmp/reqly-test-no-sse', { recursive: true, force: true });
  });

  it('emits a project SSE event when the switch actually succeeds', async () => {
    fs.mkdirSync('/tmp/reqly-test-sse/.reqly', { recursive: true });

    const events: string[] = [];
    const sseReq = http.get('http://localhost:4999/api/events', (sseRes) => {
      sseRes.on('data', (chunk) => events.push(chunk.toString()));
    });
    await new Promise((resolve) => sseReq.on('socket', () => setTimeout(resolve, 50)));

    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-sse' });
    expect(res.body.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events.join('')).toContain('project');

    sseReq.destroy();
    fs.rmSync('/tmp/reqly-test-sse', { recursive: true, force: true });
  });

  it('creates the .reqly folder and switches when createIfMissing is true', async () => {
    fs.mkdirSync('/tmp/reqly-test-create-if-missing', { recursive: true });

    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-create-if-missing', createIfMissing: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(fs.existsSync('/tmp/reqly-test-create-if-missing/.reqly')).toBe(true);

    fs.rmSync('/tmp/reqly-test-create-if-missing', { recursive: true, force: true });
  });
});
