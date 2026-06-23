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
    const mockResponse = { status: 200, headers: new Headers(), text: vi.fn().mockResolvedValue('') };
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
});
