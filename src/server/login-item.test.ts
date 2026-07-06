import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
import { LOCK_PATH, clearLock } from './lock.js';

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
    workspaceManager: {} as any,
    specLoader: new SpecLoader(),
    executeRequest: async () => ({ status: 200, statusText: 'OK', headers: {}, body: '', latencyMs: 0 } as any),
  };
}

describe('GET/POST /api/app/login-item', () => {
  let context: EngineContext;
  let server: ReturnType<typeof startExpressServer>;
  const projectDir = '/tmp/reqly-test-login-item';
  const globalConfigPath = path.join(os.homedir(), '.reqly', 'config.json');
  let originalConfig: string | null = null;
  let originalDesktopEnv: string | undefined;

  beforeEach(async () => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    fs.mkdirSync(projectDir, { recursive: true });
    originalConfig = fs.existsSync(globalConfigPath) ? fs.readFileSync(globalConfigPath, 'utf-8') : null;
    originalDesktopEnv = process.env.REQLY_DESKTOP;
    context = buildContext(`${projectDir}/.reqly`);
    server = startExpressServer(context, 4997);
  });

  afterEach(async () => {
    await clearLock();
    server.close();
    fs.rmSync(projectDir, { recursive: true, force: true });
    if (originalConfig !== null) fs.writeFileSync(globalConfigPath, originalConfig);
    else if (fs.existsSync(globalConfigPath)) fs.unlinkSync(globalConfigPath);
    if (originalDesktopEnv === undefined) delete process.env.REQLY_DESKTOP;
    else process.env.REQLY_DESKTOP = originalDesktopEnv;
  });

  it('reports supported: false when not running under the desktop app', async () => {
    delete process.env.REQLY_DESKTOP;
    const res = await request(server).get('/api/app/login-item');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, supported: false });
  });

  it('reports supported: true and the stored preference when running under the desktop app', async () => {
    process.env.REQLY_DESKTOP = '1';
    fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });
    fs.writeFileSync(globalConfigPath, JSON.stringify({ launchAtLogin: true }));

    const res = await request(server).get('/api/app/login-item');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, supported: true });
  });

  it('defaults enabled to false under the desktop app when no preference is stored', async () => {
    process.env.REQLY_DESKTOP = '1';
    if (fs.existsSync(globalConfigPath)) fs.unlinkSync(globalConfigPath);

    const res = await request(server).get('/api/app/login-item');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, supported: true });
  });

  it('persists the preference to config.json on POST', async () => {
    process.env.REQLY_DESKTOP = '1';
    const res = await request(server).post('/api/app/login-item').send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, supported: true });

    const stored = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
    expect(stored.launchAtLogin).toBe(true);
  });

  it('returns supported: false on POST when not running under the desktop app, without writing the flag', async () => {
    delete process.env.REQLY_DESKTOP;
    if (fs.existsSync(globalConfigPath)) fs.unlinkSync(globalConfigPath);

    const res = await request(server).post('/api/app/login-item').send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, supported: false });
    expect(fs.existsSync(globalConfigPath)).toBe(false);
  });
});
