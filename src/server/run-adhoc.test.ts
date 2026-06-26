import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { LOCK_PATH } from './lock.js';

const PROJECT_DIR = '/tmp/reqly-test-run-adhoc';

describe('POST /api/run/adhoc - collection variable resolution', () => {
  let context: EngineContext;
  let server: ReturnType<typeof startExpressServer>;
  let executeRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });

    const collectionManager = new CollectionManager(PROJECT_DIR);
    await collectionManager.createCollection('API');
    await collectionManager.setCollectionVariable('API', 'baseUrl', 'https://collection.example.com');

    executeRequest = vi.fn().mockResolvedValue({ status: 200, body: 'ok', headers: {}, latency: 1, timestamp: new Date().toISOString() });

    context = {
      collectionManager,
      environmentManager: new EnvironmentManager(`${PROJECT_DIR}/environments.yaml`),
      authManager: new AuthManager(`${PROJECT_DIR}/config.json`),
      proxyServer: new ProxyServer(collectionManager),
      tunnelManager: new TunnelManager(),
      responseStore: new ResponseStore(),
      historyStore: new HistoryStore(),
      flowManager: new FlowManager(PROJECT_DIR),
      executeRequest: executeRequest as unknown as EngineContext['executeRequest'],
    };
    server = startExpressServer(context, 5002);
  });

  afterEach(async () => {
    server.close();
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  });

  it('resolves the URL using the request\'s collection variables before executing', async () => {
    const res = await request(server).post('/api/run/adhoc').send({
      request: { name: 'Get', method: 'GET', url: '{{baseUrl}}/users', _collection: 'API' },
    });

    expect(res.status).toBe(200);
    const calledConfig = executeRequest.mock.calls[0][0];
    expect(calledConfig.url).toBe('https://collection.example.com/users');
  });

  it('leaves the placeholder unresolved when the request has no _collection', async () => {
    const res = await request(server).post('/api/run/adhoc').send({
      request: { name: 'Get', method: 'GET', url: '{{baseUrl}}/users' },
    });

    expect(res.status).toBe(200);
    const calledConfig = executeRequest.mock.calls[0][0];
    expect(calledConfig.url).toBe('{{baseUrl}}/users');
  });
});
