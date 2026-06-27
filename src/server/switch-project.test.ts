import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
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
    executeRequest: async () => ({ status: 200, statusText: 'OK', headers: {}, body: '', latencyMs: 0 } as any),
  };
}

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
  });

  it('re-points dotEnvLoader to the new project dir and reloads it', async () => {
    fs.mkdirSync('/tmp/reqly-test-new', { recursive: true });
    fs.writeFileSync('/tmp/reqly-test-new/.env', 'FOO=fromNewProject\n');
    const oldDotEnvLoader = context.dotEnvLoader;

    const res = await request(server).post('/api/switch-project').send({ projectDir: '/tmp/reqly-test-new' });

    expect(res.status).toBe(200);
    expect(context.dotEnvLoader).not.toBe(oldDotEnvLoader);
    expect(context.dotEnvLoader.getVariablesRecord()).toEqual({ FOO: 'fromNewProject' });

    fs.rmSync('/tmp/reqly-test-new', { recursive: true, force: true });
  });
});
