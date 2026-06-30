import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execute, RequestError } from './http-executor.js';
import { RequestConfig, Environment, AuthProfile, AuthType } from '../types/index.js';

// Mock undici fetch and Agent
vi.mock('undici', () => ({
  fetch: vi.fn(),
  Agent: vi.fn(),
}));

import { fetch, Agent } from 'undici';

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

  it('should substitute a {{variable}} inside an existing query string, not percent-encode the braces', async () => {
    const mockResponse = { status: 200, headers: new Headers(), arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('').buffer), text: vi.fn().mockResolvedValue('') };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const config: RequestConfig = {
      method: 'GET',
      url: 'https://example.com?client={{client}}',
    };
    const env: Environment = {
      id: '1',
      name: 'dev',
      variables: { client: 'abc' },
    };

    await execute(config, env);
    expect(fetch).toHaveBeenCalledWith('https://example.com?client=abc', expect.objectContaining({
      method: 'GET',
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

  it('should surface the underlying error code (e.g. ECONNREFUSED) in the RequestError message', async () => {
    // undici's fetch wraps connection failures in a generic "fetch failed" TypeError,
    // with the actual cause (ECONNREFUSED/ENOTFOUND/ETIMEDOUT) nested in err.cause.code.
    // The UI's contextual error hints match against the message string, so the code
    // needs to be surfaced there rather than left buried in the cause.
    const err: any = new Error('fetch failed');
    err.cause = { code: 'ECONNREFUSED' };
    vi.mocked(fetch).mockRejectedValue(err);

    const config: RequestConfig = { method: 'GET', url: 'http://localhost:59999' };
    await expect(execute(config)).rejects.toThrow('fetch failed (ECONNREFUSED)');
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

    it('falls back to dotenv variables when neither collection nor env define the key', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'https://{{host}}/{{key}}' };
      const env: Environment = { id: '1', name: 'dev', variables: { host: 'env.example.com' } };
      await execute(config, env, undefined, true, 50 * 1024, {}, undefined, { key: 'from-dotenv' });
      expect(fetch).toHaveBeenCalledWith('https://env.example.com/from-dotenv', expect.anything());
    });

    it('collection and env variables both win over dotenv on collision', async () => {
      mockOkResponse();
      const config: RequestConfig = { method: 'GET', url: 'https://{{host}}/ping' };
      const env: Environment = { id: '1', name: 'dev', variables: { host: 'env.example.com' } };
      await execute(config, env, undefined, true, 50 * 1024, {}, undefined, { host: 'dotenv.example.com' });
      expect(fetch).toHaveBeenCalledWith('https://env.example.com/ping', expect.anything());
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

  describe('multipart body', () => {
    let tmpDir: string;

    beforeEach(() => {
      vi.clearAllMocks();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-multipart-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const mockOkResponse = () => {
      vi.mocked(fetch).mockResolvedValue({
        status: 200,
        headers: new Headers(),
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('ok').buffer),
      } as any);
    };

    const bodyOf = () => (vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length - 1][1] as any).body;
    const headersOf = () => (vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length - 1][1] as any).headers;

    it('builds a FormData with text parts', async () => {
      mockOkResponse();
      const config: RequestConfig = {
        method: 'POST',
        url: 'http://example.com',
        body: { type: 'multipart', parts: [{ name: 'username', type: 'text', value: 'alice' }] },
      };
      await execute(config);
      const body = bodyOf();
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('username')).toBe('alice');
    });

    it('reads a file part from disk and appends it as a Blob with filename and content type', async () => {
      mockOkResponse();
      const filePath = path.join(tmpDir, 'avatar.jpg');
      fs.writeFileSync(filePath, 'fake-image-bytes');
      const config: RequestConfig = {
        method: 'POST',
        url: 'http://example.com',
        body: { type: 'multipart', parts: [{ name: 'avatar', type: 'file', filePath, contentType: 'image/jpeg' }] },
      };
      await execute(config, undefined, undefined, true, undefined, undefined, undefined, undefined, tmpDir);
      const body = bodyOf();
      const file = body.get('avatar') as File;
      expect(file.name).toBe('avatar.jpg');
      expect(file.type).toBe('image/jpeg');
      expect(await file.text()).toBe('fake-image-bytes');
    });

    it('resolves a relative filePath against the given project root', async () => {
      mockOkResponse();
      fs.writeFileSync(path.join(tmpDir, 'avatar.jpg'), 'bytes');
      const config: RequestConfig = {
        method: 'POST',
        url: 'http://example.com',
        body: { type: 'multipart', parts: [{ name: 'avatar', type: 'file', filePath: 'avatar.jpg' }] },
      };
      await execute(config, undefined, undefined, true, undefined, undefined, undefined, undefined, tmpDir);
      const body = bodyOf();
      expect((body.get('avatar') as File).name).toBe('avatar.jpg');
    });

    it('returns a structured error without throwing when a file part does not exist', async () => {
      const config: RequestConfig = {
        method: 'POST',
        url: 'http://example.com',
        body: { type: 'multipart', parts: [{ name: 'avatar', type: 'file', filePath: 'nope.jpg' }] },
      };
      const result = await execute(config, undefined, undefined, true, undefined, undefined, undefined, undefined, tmpDir);
      expect(result.body).toEqual({ error: 'File not found: nope.jpg' });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('handles mixed text and file parts together', async () => {
      mockOkResponse();
      fs.writeFileSync(path.join(tmpDir, 'avatar.jpg'), 'bytes');
      const config: RequestConfig = {
        method: 'POST',
        url: 'http://example.com',
        body: {
          type: 'multipart',
          parts: [
            { name: 'username', type: 'text', value: 'alice' },
            { name: 'avatar', type: 'file', filePath: 'avatar.jpg' },
          ],
        },
      };
      await execute(config, undefined, undefined, true, undefined, undefined, undefined, undefined, tmpDir);
      const body = bodyOf();
      expect(body.get('username')).toBe('alice');
      expect((body.get('avatar') as File).name).toBe('avatar.jpg');
    });

    it('does not manually set a Content-Type header, letting fetch set the multipart boundary', async () => {
      mockOkResponse();
      const config: RequestConfig = {
        method: 'POST',
        url: 'http://example.com',
        body: { type: 'multipart', parts: [{ name: 'username', type: 'text', value: 'alice' }] },
      };
      await execute(config);
      const headers = headersOf();
      expect(headers['Content-Type']).toBeUndefined();
      expect(headers['content-type']).toBeUndefined();
    });
  });

  describe('mTLS auth', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-mtls-test-'));
      vi.mocked(Agent).mockClear();
      vi.mocked(fetch).mockClear();
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function mockOk() {
      vi.mocked(fetch).mockResolvedValue({
        status: 200,
        headers: new Headers({}),
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        text: vi.fn().mockResolvedValue(''),
      } as any);
    }

    it('creates an Agent with cert and key buffers when auth type is mtls', async () => {
      const certFile = path.join(tmpDir, 'client.crt');
      const keyFile  = path.join(tmpDir, 'client.key');
      fs.writeFileSync(certFile, 'CERT');
      fs.writeFileSync(keyFile, 'KEY');
      mockOk();

      const auth: AuthProfile = {
        id: 'mtls1', name: 'mTLS', type: AuthType.MTLS,
        credentials: { certPath: certFile, keyPath: keyFile },
      };

      await execute({ method: 'GET', url: 'https://example.com' }, undefined, auth);

      expect(Agent).toHaveBeenCalledOnce();
      const agentArgs = vi.mocked(Agent).mock.calls[0][0] as any;
      expect(agentArgs.connect.cert).toBeInstanceOf(Buffer);
      expect(agentArgs.connect.key).toBeInstanceOf(Buffer);
      expect(agentArgs.connect.cert.toString()).toBe('CERT');
      expect(agentArgs.connect.key.toString()).toBe('KEY');
    });

    it('creates an Agent with pfx, passphrase, and ca when provided', async () => {
      const pfxFile = path.join(tmpDir, 'client.pfx');
      const caFile  = path.join(tmpDir, 'ca.crt');
      fs.writeFileSync(pfxFile, 'PFX');
      fs.writeFileSync(caFile, 'CA');
      mockOk();

      const auth: AuthProfile = {
        id: 'mtls2', name: 'mTLS', type: AuthType.MTLS,
        credentials: { pfxPath: pfxFile, passphrase: 'test', caPath: caFile },
      };

      await execute({ method: 'GET', url: 'https://example.com' }, undefined, auth);

      expect(Agent).toHaveBeenCalledOnce();
      const agentArgs = vi.mocked(Agent).mock.calls[0][0] as any;
      expect(agentArgs.connect.pfx.toString()).toBe('PFX');
      expect(agentArgs.connect.passphrase).toBe('test');
      expect(agentArgs.connect.ca[0].toString()).toBe('CA');
    });

    it('resolves variables in paths and passphrase', async () => {
      const pfxFile = path.join(tmpDir, 'client.pfx');
      fs.writeFileSync(pfxFile, 'PFX_VAR');
      mockOk();

      const auth: AuthProfile = {
        id: 'mtls3', name: 'mTLS', type: AuthType.MTLS,
        credentials: { pfxPath: '{{dir}}/client.pfx', passphrase: '{{pass}}' },
      };
      
      const env: Environment = {
        id: 'e1', name: 'dev', variables: { dir: tmpDir, pass: 'secret' }
      };

      await execute({ method: 'GET', url: 'https://example.com' }, env, auth);

      expect(Agent).toHaveBeenCalledOnce();
      const agentArgs = vi.mocked(Agent).mock.calls[0][0] as any;
      expect(agentArgs.connect.pfx.toString()).toBe('PFX_VAR');
      expect(agentArgs.connect.passphrase).toBe('secret');
    });

    it('throws RequestError when neither pfxPath nor certPath+keyPath is provided', async () => {
      const auth: AuthProfile = {
        id: 'mtls4', name: 'mTLS', type: AuthType.MTLS,
        credentials: { keyPath: '/some/key.pem' },
      };

      await expect(
        execute({ method: 'GET', url: 'https://example.com' }, undefined, auth)
      ).rejects.toThrow(/mTLS auth requires either pfxPath, or both/);
    });

    it('throws RequestError when cert file does not exist', async () => {
      const auth: AuthProfile = {
        id: 'mtls5', name: 'mTLS', type: AuthType.MTLS,
        credentials: { certPath: '/no/such/cert.pem', keyPath: '/no/such/key.pem' },
      };

      await expect(
        execute({ method: 'GET', url: 'https://example.com' }, undefined, auth)
      ).rejects.toThrow(RequestError);
    });
  });
});
