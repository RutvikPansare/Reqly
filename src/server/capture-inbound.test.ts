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
import { LOCK_PATH } from './lock.js';

const PROJECT_DIR = '/tmp/reqly-test-capture-inbound';

function buildContext(): EngineContext {
  const collectionManager = new CollectionManager(PROJECT_DIR);
  return {
    collectionManager,
    environmentManager: new EnvironmentManager(`${PROJECT_DIR}/environments.yaml`),
    authManager: new AuthManager(`${PROJECT_DIR}/config.json`),
    proxyServer: new ProxyServer(collectionManager),
    tunnelManager: new TunnelManager(),
    responseStore: new ResponseStore(),
    historyStore: new HistoryStore(),
    flowManager: new FlowManager(PROJECT_DIR),
    dotEnvLoader: new DotEnvLoader(PROJECT_DIR),
    executeRequest: async () => ({ status: 200, statusText: 'OK', headers: {}, body: '', latencyMs: 0 } as any),
  };
}

describe('POST /capture/inbound', () => {
  let context: EngineContext;
  let server: ReturnType<typeof startExpressServer>;

  beforeEach(async () => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
    context = buildContext();
    server = startExpressServer(context, 5001);
  });

  afterEach(async () => {
    server.close();
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  });

  it('creates the collection if missing and saves the inbound request', async () => {
    const res = await request(server).post('/capture/inbound').send({
      method: 'GET',
      url: '/users/1',
      headers: { host: 'localhost' },
      body: undefined,
      collection: 'Captured',
      timestamp: new Date().toISOString()
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const collection = await context.collectionManager.getCollection('Captured');
    expect(collection.requests).toHaveLength(1);
    expect(collection.requests[0].method).toBe('GET');
    expect(collection.requests[0].url).toBe('/users/1');
  });

  it('dedupes identical method+url pairs', async () => {
    const payload = { method: 'POST', url: '/orders', headers: {}, collection: 'Captured' };
    await request(server).post('/capture/inbound').send(payload);
    await request(server).post('/capture/inbound').send(payload);

    const collection = await context.collectionManager.getCollection('Captured');
    expect(collection.requests).toHaveLength(1);
  });

  it('defaults to the "Captured" collection when none is given', async () => {
    await request(server).post('/capture/inbound').send({ method: 'GET', url: '/ping', headers: {} });

    const collection = await context.collectionManager.getCollection('Captured');
    expect(collection.requests).toHaveLength(1);
  });
});
