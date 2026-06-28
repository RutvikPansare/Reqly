import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import WebSocket from 'ws';
import { startExpressServer } from './express.js';
import { clearSessions } from './terminal.js';
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

// Performs the mandatory `attach` handshake and waits for `ready`.
async function attach(ws: WebSocket, messages: any[], sessionId: string, cols = 80, rows = 24): Promise<any> {
  ws.send(JSON.stringify({ type: 'attach', sessionId, cols, rows }));
  await waitUntil(() => messages.some(m => m.type === 'ready'));
  return messages.find(m => m.type === 'ready');
}

// node-pty's conpty backend calls AttachConsole, which throws on GitHub Actions'
// windows-latest runner because the test process has no attached console window
// (no TTY in headless CI). Real Windows dev machines and self-hosted runners with
// a console are unaffected - this only skips the CI job that can't physically pass.
describe.skipIf(process.platform === 'win32' && !!process.env.CI)('/terminal WebSocket (PTY + session registry)', () => {
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
    clearSessions();
    server.close();
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  });

  it('rejects a connection that does not send attach first', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.send(JSON.stringify({ type: 'input', data: 'echo hello\n' }));
    await waitUntil(() => messages.some(m => m.type === 'error'));

    expect(messages.find(m => m.type === 'error')?.message).toMatch(/attach/);
    ws.close();
  });

  it('streams PTY output for a command typed via input', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    await attach(ws, messages, 'session-input-test');

    ws.send(JSON.stringify({ type: 'input', data: 'echo hello-pty\n' }));
    await waitUntil(() => allData(messages).includes('hello-pty'));

    expect(allData(messages)).toContain('hello-pty');
    ws.close();
  });

  it('starts the shell at the current collectionManager base dir', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    await attach(ws, messages, 'session-cwd-test');

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
    await attach(ws, messages, 'session-cd-test');

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
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    await attach(ws, messages, 'session-resize-test');

    expect(() => ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }))).not.toThrow();
    ws.close();
  });

  it('sends SIGINT to the foreground job on kill', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    await attach(ws, messages, 'session-kill-test');

    ws.send(JSON.stringify({ type: 'input', data: 'sleep 30\n' }));
    await new Promise((r) => setTimeout(r, 300));
    ws.send(JSON.stringify({ type: 'kill' }));

    await waitUntil(() => allData(messages).includes('$') || allData(messages).includes('%'));
    ws.close();
  });

  it('re-attaches to an existing session and replays buffered output', async () => {
    const sid = 'session-reattach-test';

    // First connection: run a command, let it complete.
    const ws1 = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const msgs1 = collectMessages(ws1);
    await new Promise<void>((resolve) => ws1.on('open', resolve));
    const ready1 = await attach(ws1, msgs1, sid);
    expect(ready1.isNew).toBe(true);

    ws1.send(JSON.stringify({ type: 'input', data: 'echo session-marker-xyz\n' }));
    await waitUntil(() => allData(msgs1).includes('session-marker-xyz'));

    // Close first WS (simulates browser refresh - PTY stays alive).
    ws1.close();
    await new Promise((r) => setTimeout(r, 100));

    // Second connection with same session ID.
    const ws2 = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const msgs2 = collectMessages(ws2);
    await new Promise<void>((resolve) => ws2.on('open', resolve));
    const ready2 = await attach(ws2, msgs2, sid);

    expect(ready2.isNew).toBe(false);
    expect(ready2.replay).toContain('session-marker-xyz');
    ws2.close();
  });

  it('returns isNew:true for an unknown session ID', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/terminal`);
    const messages = collectMessages(ws);
    await new Promise<void>((resolve) => ws.on('open', resolve));
    const ready = await attach(ws, messages, 'brand-new-session-id');

    expect(ready.isNew).toBe(true);
    expect(ready.replay).toBe('');
    ws.close();
  });
});
