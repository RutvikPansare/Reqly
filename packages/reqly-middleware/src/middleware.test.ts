import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reqlyMiddleware } from './index.js';
import { reqlyMiddlewareHook } from './index.js';

function fakeExpressReqRes(overrides: Partial<{ method: string; originalUrl: string; headers: any; body: any }> = {}) {
  const req = {
    method: 'GET',
    originalUrl: '/users',
    headers: { 'content-type': 'application/json' },
    body: undefined,
    ...overrides
  };
  const res = {};
  return { req, res };
}

describe('reqlyMiddleware (Express)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('fires a POST to the default endpoint with the request payload', async () => {
    const mw = reqlyMiddleware();
    const { req, res } = fakeExpressReqRes({ method: 'POST', originalUrl: '/users/1', body: { name: 'a' } });
    const next = vi.fn();

    mw(req as any, res as any, next);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(next).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4242/capture/inbound');
    const payload = JSON.parse(init.body);
    expect(payload.method).toBe('POST');
    expect(payload.url).toBe('/users/1');
    expect(payload.body).toEqual({ name: 'a' });
    expect(payload.collection).toBe('Captured');
    expect(typeof payload.timestamp).toBe('string');
  });

  it('uses a custom endpoint and collection', async () => {
    const mw = reqlyMiddleware({ endpoint: 'http://localhost:9999/capture', collection: 'MyApi' });
    const { req, res } = fakeExpressReqRes();
    mw(req as any, res as any, vi.fn());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:9999/capture/inbound');
    expect(JSON.parse(init.body).collection).toBe('MyApi');
  });

  it('skips ignored routes', async () => {
    const mw = reqlyMiddleware();
    const { req, res } = fakeExpressReqRes({ originalUrl: '/_next/static/chunk.js' });
    const next = vi.fn();
    mw(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects custom ignoreRoutes', async () => {
    const mw = reqlyMiddleware({ ignoreRoutes: ['/health'] });
    const { req, res } = fakeExpressReqRes({ originalUrl: '/health/check' });
    mw(req as any, res as any, vi.fn());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows fetch errors silently', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const mw = reqlyMiddleware();
    const { req, res } = fakeExpressReqRes();
    const next = vi.fn();

    expect(() => mw(req as any, res as any, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});

describe('reqlyMiddlewareHook (Fastify)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('fires capture and calls done', async () => {
    const hook = reqlyMiddlewareHook();
    const request = { method: 'GET', url: '/orders', headers: {}, body: undefined };
    const done = vi.fn();

    hook(request as any, {} as any, done);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(done).toHaveBeenCalled();
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.url).toBe('/orders');
  });
});
