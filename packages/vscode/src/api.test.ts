import { describe, it, expect, vi } from 'vitest';
import { ReqlyApi, ServerNotRunningError } from './api.js';

function fakeFetch(handler: (url: string, init?: RequestInit) => { status?: number; body?: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const { status = 200, body = {} } = handler(u, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('ReqlyApi', () => {
  it('getCollections fetches /api/collections and returns the array', async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: [{ name: 'users', projectDir: '/repo', requests: [{ id: '1', name: 'login', method: 'POST', url: '/login' }] }],
    }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    const cols = await api.getCollections();
    expect(calls[0].url).toBe('http://localhost:4242/api/collections');
    expect(cols).toHaveLength(1);
    expect(cols[0].requests[0].name).toBe('login');
  });

  it('getEnvironments returns environments plus active name', async () => {
    const { fn } = fakeFetch(() => ({
      body: { environments: [{ name: 'dev', variables: {} }, { name: 'prod', variables: {} }], active: 'dev' },
    }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    const envs = await api.getEnvironments();
    expect(envs.active).toBe('dev');
    expect(envs.environments.map(e => e.name)).toEqual(['dev', 'prod']);
  });

  it('setActiveEnvironment posts the name to /api/environments/active', async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { success: true } }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    await api.setActiveEnvironment('prod');
    expect(calls[0].url).toBe('http://localhost:4242/api/environments/active');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ name: 'prod' });
  });

  it('runRequest posts the request config with _collection to /api/run/adhoc', async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: { response: { status: 200, latency: 12, headers: {}, body: { ok: true } }, assertions: [] },
    }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    const result = await api.runRequest(
      { id: '1', name: 'login', method: 'POST', url: '{{baseUrl}}/login' },
      'users'
    );
    expect(calls[0].url).toBe('http://localhost:4242/api/run/adhoc');
    const sent = JSON.parse(calls[0].init?.body as string);
    expect(sent.request._collection).toBe('users');
    expect(sent.request.name).toBe('login');
    expect(result.response.status).toBe(200);
  });

  it('runCollection posts the collection name to /api/run/collection', async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: { results: [], summary: { total: 0, passed: 0, failed: 0 } },
    }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    await api.runCollection('users');
    const sent = JSON.parse(calls[0].init?.body as string);
    expect(calls[0].url).toBe('http://localhost:4242/api/run/collection');
    expect(sent.collectionName).toBe('users');
  });

  it('startProxy posts port and collectionName to /api/proxy/start', async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { success: true } }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    await api.startProxy(7474, 'captured');
    const sent = JSON.parse(calls[0].init?.body as string);
    expect(calls[0].url).toBe('http://localhost:4242/api/proxy/start');
    expect(sent).toEqual({ port: 7474, collectionName: 'captured' });
  });

  it('createRequest posts the config to the collection requests endpoint', async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { success: true } }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    await api.createRequest('users', { name: 'new-req', method: 'GET', url: 'https://x.dev/a' });
    expect(calls[0].url).toBe('http://localhost:4242/api/collections/users/requests');
    expect(JSON.parse(calls[0].init?.body as string).name).toBe('new-req');
  });

  it('throws the server error message on non-2xx responses', async () => {
    const { fn } = fakeFetch(() => ({ status: 500, body: { error: 'Collection not found' } }));
    const api = new ReqlyApi('http://localhost:4242', fn);
    await expect(api.runCollection('missing')).rejects.toThrow('Collection not found');
  });

  it('throws ServerNotRunningError when the connection is refused', async () => {
    const fn = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const api = new ReqlyApi('http://localhost:4242', fn);
    await expect(api.getCollections()).rejects.toBeInstanceOf(ServerNotRunningError);
  });

  it('isRunning returns false when the server is unreachable', async () => {
    const fn = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const api = new ReqlyApi('http://localhost:4242', fn);
    expect(await api.isRunning()).toBe(false);
  });
});
