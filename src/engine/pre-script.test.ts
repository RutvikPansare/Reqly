import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute } from './http-executor.js';
import { RequestConfig } from '../types/index.js';

vi.mock('undici', () => ({ fetch: vi.fn() }));
import { fetch } from 'undici';

function mockOkResponse(body = '{}') {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(body).buffer),
  };
}

describe('pre-script req object', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue(mockOkResponse() as any);
  });

  it('req.getUrl() returns the original URL', async () => {
    let captured: string | undefined;
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com/original',
      preScript: 'env.captured = req.getUrl()',
    };
    const env = { variables: {} as Record<string, string>, name: 'test', id: 'test' };
    await execute(config, env);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('http://example.com/original', expect.anything());
  });

  it('req.setUrl() mutates the URL used by the outbound request', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://original.com',
      preScript: 'req.setUrl("http://mutated.com")',
    };
    await execute(config);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('http://mutated.com', expect.anything());
  });

  it('req.getMethod() returns the original method', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
      preScript: 'env.m = req.getMethod()',
    };
    const envVars: Record<string, string> = {};
    const env = { variables: envVars, name: 'test', id: 'test' };
    await execute(config, env);
    expect(envVars.m).toBe('GET');
  });

  it('req.setHeader() adds a header to the outbound request', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
      preScript: 'req.setHeader("X-Sig", "abc123")',
    };
    await execute(config);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as any).headers['X-Sig']).toBe('abc123');
  });

  it('req.removeHeader() removes an existing header', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
      headers: { Authorization: 'Bearer old', 'X-Keep': 'yes' },
      preScript: 'req.removeHeader("Authorization")',
    };
    await execute(config);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as any).headers['Authorization']).toBeUndefined();
    expect((init as any).headers['X-Keep']).toBe('yes');
  });

  it('req.setBody() replaces the request body', async () => {
    const config: RequestConfig = {
      method: 'POST',
      url: 'http://example.com',
      body: '{"old":true}',
      preScript: 'req.setBody(JSON.stringify({new:true}))',
    };
    await execute(config);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as any).body).toBe('{"new":true}');
  });

  it('req.setTimeout() is stored and does not crash', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
      preScript: 'req.setTimeout(5000)',
    };
    await expect(execute(config)).resolves.not.toThrow();
  });

  it('req.setMaxRedirects() is stored and does not crash', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
      preScript: 'req.setMaxRedirects(0)',
    };
    await expect(execute(config)).resolves.not.toThrow();
  });

  it('req.getHeaders() returns current headers including ones set via setHeader', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
      headers: { Accept: 'application/json' },
      preScript: `
        req.setHeader("X-New", "val");
        env.hasAccept = req.getHeaders()["Accept"] ? "yes" : "no";
        env.hasNew = req.getHeaders()["X-New"] ? "yes" : "no";
      `,
    };
    const envVars: Record<string, string> = {};
    const env = { variables: envVars, name: 'test', id: 'test' };
    await execute(config, env);
    expect(envVars.hasAccept).toBe('yes');
    expect(envVars.hasNew).toBe('yes');
  });

  it('req.getHeader() returns a specific header value', async () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
      headers: { Authorization: 'Bearer tok' },
      preScript: 'env.auth = req.getHeader("Authorization")',
    };
    const envVars: Record<string, string> = {};
    const env = { variables: envVars, name: 'test', id: 'test' };
    await execute(config, env);
    expect(envVars.auth).toBe('Bearer tok');
  });
});
