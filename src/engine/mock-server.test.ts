import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { MockServer } from './mock-server.js';
import { CollectionManager } from './collection-manager.js';
import { CollectionRequest } from '../types/index.js';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

const withExample = (over: Partial<CollectionRequest>): CollectionRequest => ({
  id: over.id || 'r1',
  name: over.name || 'Req',
  method: over.method || 'GET',
  url: over.url || 'https://api.x.com/v1/thing',
  examples: over.examples,
  ...over,
});

describe('MockServer', () => {
  let tmpDir: string;
  let manager: CollectionManager;
  let server: MockServer;
  let port: number;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-mock-test-'));
    manager = new CollectionManager(tmpDir);
    server = new MockServer(manager);
    port = await getFreePort();
  });

  afterEach(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function seed(requests: CollectionRequest[]) {
    await manager.createCollection('api');
    for (const r of requests) await manager.addRequest('api', r);
  }

  it('serves a saved example for a matched route', async () => {
    await seed([
      withExample({
        name: 'Get Charge', method: 'GET', url: 'https://api.stripe.com/v1/charges',
        examples: [{ id: 'e1', name: 'ok', status: 201, headers: { 'Content-Type': 'application/json' }, body: { id: 'ch_1' }, latency: 5, savedAt: '' }],
      }),
    ]);
    await server.start('api', port);

    const res = await fetch(`http://localhost:${port}/v1/charges`);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'ch_1' });
  });

  it('matches a path-variable route', async () => {
    await seed([
      withExample({
        name: 'Get User', method: 'GET', url: '{{baseUrl}}/users/{{userId}}',
        examples: [{ id: 'e1', name: 'ok', status: 200, headers: {}, body: { name: 'alice' }, latency: 1, savedAt: '' }],
      }),
    ]);
    await server.start('api', port);

    const res = await fetch(`http://localhost:${port}/users/42`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'alice' });
  });

  it('selects an example by the X-Reqly-Example header, falling back to the first', async () => {
    await seed([
      withExample({
        name: 'Get User', method: 'GET', url: 'https://api.x.com/users',
        examples: [
          { id: 'e1', name: 'default', status: 200, headers: {}, body: { who: 'default' }, latency: 1, savedAt: '' },
          { id: 'e2', name: 'empty', status: 404, headers: {}, body: { who: 'empty' }, latency: 1, savedAt: '' },
        ],
      }),
    ]);
    await server.start('api', port);

    const first = await fetch(`http://localhost:${port}/users`);
    expect(await first.json()).toEqual({ who: 'default' });

    const named = await fetch(`http://localhost:${port}/users`, { headers: { 'X-Reqly-Example': 'empty' } });
    expect(named.status).toBe(404);
    expect(await named.json()).toEqual({ who: 'empty' });
  });

  it('sets permissive CORS headers', async () => {
    await seed([
      withExample({
        name: 'Get', method: 'GET', url: 'https://api.x.com/ping',
        examples: [{ id: 'e1', name: 'ok', status: 200, headers: {}, body: { ok: true }, latency: 1, savedAt: '' }],
      }),
    ]);
    await server.start('api', port);

    const res = await fetch(`http://localhost:${port}/ping`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns a 404 with availableRoutes for an unmatched path', async () => {
    await seed([
      withExample({
        name: 'Get', method: 'GET', url: 'https://api.x.com/ping',
        examples: [{ id: 'e1', name: 'ok', status: 200, headers: {}, body: { ok: true }, latency: 1, savedAt: '' }],
      }),
    ]);
    await server.start('api', port);

    const res = await fetch(`http://localhost:${port}/nope`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("in collection 'api'");
    expect(body.availableRoutes).toContain('GET /ping');
  });

  it('only registers routes for requests that have at least one example', async () => {
    await seed([
      withExample({ name: 'HasEx', method: 'GET', url: 'https://api.x.com/a', examples: [{ id: 'e1', name: 'ok', status: 200, headers: {}, body: null, latency: 1, savedAt: '' }] }),
      withExample({ id: 'r2', name: 'NoEx', method: 'GET', url: 'https://api.x.com/b' }),
    ]);
    await server.start('api', port);

    const status = server.getStatus();
    expect(status.routes.map(r => r.path)).toEqual(['/a']);
    expect(status.routes[0].exampleCount).toBe(1);
  });

  it('reports running status and clears it after stop', async () => {
    await seed([
      withExample({ name: 'Get', method: 'GET', url: 'https://api.x.com/ping', examples: [{ id: 'e1', name: 'ok', status: 200, headers: {}, body: null, latency: 1, savedAt: '' }] }),
    ]);
    await server.start('api', port);
    expect(server.getStatus()).toMatchObject({ running: true, collection: 'api', port });

    await server.stop();
    expect(server.getStatus().running).toBe(false);
  });

  it('throws if started while already running', async () => {
    await seed([
      withExample({ name: 'Get', method: 'GET', url: 'https://api.x.com/ping', examples: [{ id: 'e1', name: 'ok', status: 200, headers: {}, body: null, latency: 1, savedAt: '' }] }),
    ]);
    await server.start('api', port);
    await expect(server.start('api', port)).rejects.toThrow('already running');
  });
});
