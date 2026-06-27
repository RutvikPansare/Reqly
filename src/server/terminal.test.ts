import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import WebSocket from 'ws';
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
import { MockServer } from '../engine/mock-server.js';
import { LOCK_PATH } from './lock.js';

const PROJECT_DIR = '/tmp/reqly-test-terminal';
const PORT = 5003;

function waitForMessages(ws: WebSocket, count: number, timeoutMs = 3000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = [];
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${count} messages, got ${messages.length}`)), timeoutMs);
    ws.on('message', (raw) => {
      messages.push(JSON.parse(raw.toString()));
      if (messages.length >= count) {
        clearTimeout(timer);
        resolve(messages);
      }
    });
  });
}

describe('/terminal WebSocket', () => {
  let server: ReturnType<typeof startExpressServer>;
  let collectionManager: CollectionManager;

  beforeEach(async () => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
    collectionManager = new CollectionManager(PROJECT_DIR);
    await collectionManager.createCollection('seed');

    const context: EngineContext = {
      collectionManager,
      environmentManager: new EnvironmentManager(`${PROJECT_DIR}/environments.yaml`),
      authManager: new AuthManager(`${PROJECT_DIR}/config.json`),
      proxyServer: new ProxyServer(collectionManager),
      tunnelManager: new TunnelManager(),
      responseStore: new ResponseStore(),
      historyStore: new HistoryStore(),
      flowManager: new FlowManager(PROJECT_DIR),
      dotEnvLoader: new DotEnvLoader(PROJECT_DIR),
      specLoader: new SpecLoader(),
      mockServer: new MockServer(collectionManager),
      executeRequest: async () => ({ status: 200, body: '', headers: {}, latency: 0, timestamp: new Date().toISOString() }),
    };
    server = startExpressServer(context, PORT);
  });

  afterEach(async () => {
    server.close();
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  });

  it('accepts a connection and streams stdout + exit for a simple command', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const messagesPromise = waitForMessages(ws, 2);
    ws.send(JSON.stringify({ type: 'run', command: 'echo hello-terminal' }));
    const messages = await messagesPromise;

    expect(messages.find(m => m.type === 'stdout')?.data).toContain('hello-terminal');
    expect(messages.find(m => m.type === 'exit')?.code).toBe(0);
    ws.close();
  });

  it('runs the command with cwd derived from the current collectionManager base dir', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const messagesPromise = waitForMessages(ws, 2);
    ws.send(JSON.stringify({ type: 'run', command: 'pwd' }));
    const messages = await messagesPromise;

    const path = await import('path');
    const expectedRoot = fs.realpathSync(path.dirname(collectionManager.getBaseDir()));
    expect(messages.find(m => m.type === 'stdout')?.data.trim()).toBe(expectedRoot);
    ws.close();
  });

  it('rejects a second run while one is already in progress', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'run', command: 'sleep 0.3' }));
    const errorPromise = waitForMessages(ws, 1);
    ws.send(JSON.stringify({ type: 'run', command: 'echo too-fast' }));
    const messages = await errorPromise;

    expect(messages[0].type).toBe('error');
    expect(messages[0].message).toMatch(/already running/i);
    ws.close();
  });

  it('kills a running command on kill message', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const exitPromise = waitForMessages(ws, 1);
    ws.send(JSON.stringify({ type: 'run', command: 'sleep 5' }));
    ws.send(JSON.stringify({ type: 'kill' }));
    const messages = await exitPromise;

    expect(messages[0].type).toBe('exit');
    expect(messages[0].code).not.toBe(0);
    ws.close();
  });
});
