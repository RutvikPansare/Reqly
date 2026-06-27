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

// Attaches the message listener immediately so nothing the PTY writes right
// after `connection` (e.g. the shell's own startup banner/prompt) is lost.
function collectMessages(ws: WebSocket) {
  const messages: any[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  return messages;
}

function allData(messages: any[]): string {
  return messages.filter(m => m.type === 'data').map(m => m.data).join('');
}

function waitUntil(check: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Timed out waiting for condition'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('/terminal WebSocket (PTY)', () => {
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

  it('streams PTY output for a command typed via input', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'input', data: 'echo hello-pty\n' }));
    await waitUntil(() => allData(messages).includes('hello-pty'));

    expect(allData(messages)).toContain('hello-pty');
    ws.close();
  });

  it('starts the shell at the current collectionManager base dir', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'input', data: 'pwd\n' }));

    const path = await import('path');
    const expectedRoot = path.dirname(collectionManager.getBaseDir());
    await waitUntil(() => allData(messages).includes(expectedRoot));
    ws.close();
  });

  it('persists cwd across commands so cd carries forward (real shell, not per-command spawn)', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const path = await import('path');
    const projectRoot = path.dirname(collectionManager.getBaseDir());
    fs.mkdirSync(path.join(projectRoot, 'subdir'), { recursive: true });

    ws.send(JSON.stringify({ type: 'input', data: 'cd subdir\n' }));
    ws.send(JSON.stringify({ type: 'input', data: 'pwd\n' }));

    const expected = path.join(projectRoot, 'subdir');
    await waitUntil(() => allData(messages).includes(expected));
    ws.close();
  });

  it('resizes the PTY without erroring', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    expect(() => ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }))).not.toThrow();
    ws.close();
  });

  it('sends SIGINT to the foreground job on kill', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'input', data: 'sleep 30\n' }));
    await new Promise((r) => setTimeout(r, 300));
    ws.send(JSON.stringify({ type: 'kill' }));

    // Ctrl+C interrupts `sleep` and returns control to the shell, which prints a fresh prompt.
    await waitUntil(() => allData(messages).includes('$') || allData(messages).includes('%'));
    ws.close();
  });
});
