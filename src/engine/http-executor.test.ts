import { describe, it, expect, vi } from 'vitest';
import { execute, RequestError } from './http-executor.js';
import { RequestConfig, Environment, AuthProfile, AuthType } from '../types/index.js';

// Mock undici fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';

describe('http-executor', () => {
  it('should execute a simple GET request', async () => {
    const mockResponse = {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('{"hello":"world"}').buffer),
      text: vi.fn().mockResolvedValue('{"hello":"world"}'),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const config: RequestConfig = {
      method: 'GET',
      url: 'http://example.com',
    };

    const result = await execute(config);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ hello: 'world' });
    expect(fetch).toHaveBeenCalledWith('http://example.com', expect.objectContaining({
      method: 'GET',
    }));
  });

  it('should substitute environment variables', async () => {
    const mockResponse = {
      status: 200,
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('ok').buffer),
      text: vi.fn().mockResolvedValue('ok'),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const config: RequestConfig = {
      method: 'POST',
      url: 'http://{{domain}}/api/{{path}}',
      headers: { 'X-Custom': '{{customHeader}}' },
      body: '{"val": "{{val}}"}',
    };
    const env: Environment = {
      id: '1',
      name: 'dev',
      variables: {
        domain: 'example.com',
        path: 'test',
        customHeader: 'foo',
        val: 'bar',
      },
    };

    await execute(config, env);
    expect(fetch).toHaveBeenCalledWith('http://example.com/api/test', expect.objectContaining({
      headers: expect.objectContaining({ 'X-Custom': 'foo' }),
      body: '{"val": "bar"}',
    }));
  });

  it('should inject bearer auth', async () => {
    const mockResponse = { status: 200, headers: new Headers(), arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('').buffer), text: vi.fn().mockResolvedValue('') };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const config: RequestConfig = { method: 'GET', url: 'http://example.com' };
    const auth: AuthProfile = {
      id: 'a1',
      name: 'Test Auth',
      type: AuthType.BEARER,
      credentials: { token: 'my-token' },
    };

    await execute(config, undefined, auth);
    expect(fetch).toHaveBeenCalledWith('http://example.com', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
    }));
  });

  it('should handle network errors by throwing RequestError', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network Error'));

    const config: RequestConfig = { method: 'GET', url: 'http://example.com' };
    await expect(execute(config)).rejects.toThrow(RequestError);
  });

  it('should truncate large responses by default', async () => {
    const largeBody = 'a'.repeat(60 * 1024); // 60KB
    const arrayBuffer = new TextEncoder().encode(largeBody).buffer;
    const mockResponse = {
      status: 200,
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer)
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const config: RequestConfig = { method: 'GET', url: 'http://example.com' };
    const result = await execute(config);
    
    expect(typeof result.body).toBe('string');
    expect((result.body as string).length).toBeLessThan(60 * 1024);
    expect((result.body as string)).toContain('[Response truncated: 0.06MB received, showing first 50KB. Use --full to retrieve complete response.]');
  });

  it('should not truncate large responses if truncate is false', async () => {
    const largeBody = 'a'.repeat(60 * 1024); // 60KB
    const arrayBuffer = new TextEncoder().encode(largeBody).buffer;
    const mockResponse = {
      status: 200,
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer)
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const config: RequestConfig = { method: 'GET', url: 'http://example.com' };
    const result = await execute(config, undefined, undefined, false);
    
    expect(typeof result.body).toBe('string');
    expect((result.body as string).length).toBe(60 * 1024);
    expect((result.body as string)).not.toContain('[Response truncated');
  });

  describe('graphql type', () => {
    const mockOkResponse = () => {
      const mockResponse = {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('{"data":{"users":[]}}').buffer),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);
    };

    it('should build graphql body from config.graphql with variables', async () => {
      mockOkResponse();
      const config: RequestConfig = {
        method: 'POST',
        url: 'https://api.example.com/graphql',
        type: 'graphql',
        graphql: { query: 'query { users { id } }', variables: { limit: 10 } },
      };
      await execute(config);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.com/graphql',
        expect.objectContaining({
          body: JSON.stringify({ query: 'query { users { id } }', variables: { limit: 10 } }),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('should build graphql body without variables key when variables is not provided', async () => {
      mockOkResponse();
      const config: RequestConfig = {
        method: 'POST',
        url: 'https://api.example.com/graphql',
        type: 'graphql',
        graphql: { query: 'query { health }' },
      };
      await execute(config);
      const calledBody = JSON.parse((vi.mocked(fetch).mock.lastCall![1] as any).body);
      expect(calledBody).toEqual({ query: 'query { health }' });
      expect(calledBody.variables).toBeUndefined();
    });

    it('should set Content-Type application/json automatically for graphql requests', async () => {
      mockOkResponse();
      const config: RequestConfig = {
        method: 'POST',
        url: 'https://api.example.com/graphql',
        type: 'graphql',
        graphql: { query: 'mutation { noop }' },
      };
      await execute(config);
      const calledHeaders = (vi.mocked(fetch).mock.lastCall![1] as any).headers;
      expect(calledHeaders['Content-Type']).toBe('application/json');
    });

    it('should not override an explicitly provided Content-Type for graphql', async () => {
      mockOkResponse();
      const config: RequestConfig = {
        method: 'POST',
        url: 'https://api.example.com/graphql',
        type: 'graphql',
        headers: { 'Content-Type': 'application/graphql' },
        graphql: { query: 'query { users { id } }' },
      };
      await execute(config);
      const calledHeaders = (vi.mocked(fetch).mock.lastCall![1] as any).headers;
      expect(calledHeaders['Content-Type']).toBe('application/graphql');
    });
  });

  describe('collection variables', () => {
    const mockOkResponse = () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 200,
        headers: new Headers(),
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('ok').buffer),
      } as any);
    };

    it('substitutes collection variables when no env is given', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'https://{{host}}/ping' };
      await execute(config, undefined, undefined, true, 50 * 1024, { host: 'collection.example.com' });
      expect(fetch).toHaveBeenCalledWith('https://collection.example.com/ping', expect.anything());
    });

    it('collection variables win over env variables on collision', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'https://{{host}}/ping' };
      const env: Environment = { id: '1', name: 'dev', variables: { host: 'env.example.com' } };
      await execute(config, env, undefined, true, 50 * 1024, { host: 'collection.example.com' });
      expect(fetch).toHaveBeenCalledWith('https://collection.example.com/ping', expect.anything());
    });

    it('falls back to env variables when collection lacks the key', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'https://{{host}}/{{path}}' };
      const env: Environment = { id: '1', name: 'dev', variables: { host: 'env.example.com', path: 'users' } };
      await execute(config, env, undefined, true, 50 * 1024, { host: 'collection.example.com' });
      expect(fetch).toHaveBeenCalledWith('https://collection.example.com/users', expect.anything());
    });
  });

  describe('collection auth precedence', () => {
    const mockOkResponse = () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 200,
        headers: new Headers(),
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('ok').buffer),
      } as any);
    };

    const collAuth: AuthProfile = { id: 'c1', name: 'col', type: AuthType.BEARER, credentials: { token: 'collection-token' } };

    const headersOf = () => (vi.mocked(fetch).mock.lastCall![1] as any).headers;

    it('inherits collection auth when the request has no auth configured', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'http://example.com' };
      await execute(config, undefined, undefined, true, 50 * 1024, {}, collAuth);
      expect(headersOf().Authorization).toBe('Bearer collection-token');
    });

    it('request-level auth wins over collection auth', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'http://example.com' };
      const reqAuth: AuthProfile = { id: 'r1', name: 'req', type: AuthType.BEARER, credentials: { token: 'request-token' } };
      await execute(config, undefined, reqAuth, true, 50 * 1024, {}, collAuth);
      expect(headersOf().Authorization).toBe('Bearer request-token');
    });

    it('explicit request type:none suppresses collection auth', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'http://example.com', auth: { type: 'none' } };
      await execute(config, undefined, undefined, true, 50 * 1024, {}, collAuth);
      expect(headersOf().Authorization).toBeUndefined();
    });

    it('applies inline request auth and does not inherit collection auth', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'http://example.com', auth: { type: 'bearer', credentials: { token: 'inline-token' } } };
      await execute(config, undefined, undefined, true, 50 * 1024, {}, collAuth);
      expect(headersOf().Authorization).toBe('Bearer inline-token');
    });

    it('does not inherit a collection auth whose type is none', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'http://example.com' };
      const noneAuth: AuthProfile = { id: 'c2', name: 'col', type: 'none' as AuthType, credentials: {} };
      await execute(config, undefined, undefined, true, 50 * 1024, {}, noneAuth);
      expect(headersOf().Authorization).toBeUndefined();
    });
  });
});
