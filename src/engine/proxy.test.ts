import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as http from 'http';
import * as net from 'net';
import { ProxyServer } from './proxy.js';
import { CollectionManager } from './collection-manager.js';

describe('ProxyServer', () => {
  let mockCollectionManager: Partial<CollectionManager>;
  let proxyServer: ProxyServer;

  beforeEach(() => {
    mockCollectionManager = {
      getCollection: vi.fn().mockResolvedValue({ requests: [] }),
      createCollection: vi.fn().mockResolvedValue(undefined),
      addRequest: vi.fn().mockResolvedValue(undefined)
    };
    proxyServer = new ProxyServer(mockCollectionManager as CollectionManager);
  });

  it('should start and stop successfully', async () => {
    await proxyServer.start({ port: 7474, collectionName: 'captured' });
    // Test that double start throws
    await expect(proxyServer.start({ port: 7474, collectionName: 'captured' })).rejects.toThrow('Proxy server is already running');
    await proxyServer.stop();
  });

  // The UI toggle and MCP agents both need to read the live proxy state -
  // without it a page reload shows the proxy as stopped while it keeps running.
  it('reports its status via getStatus()', async () => {
    expect(proxyServer.getStatus()).toEqual({ running: false });

    await proxyServer.start({ port: 0, collectionName: 'captured' });
    const status = proxyServer.getStatus();
    expect(status.running).toBe(true);
    expect(status.collectionName).toBe('captured');
    expect(typeof status.port).toBe('number');
    expect(status.port).toBeGreaterThan(0);

    await proxyServer.stop();
    expect(proxyServer.getStatus()).toEqual({ running: false });
  });

  it('forwards a binary response body through the capture path without corrupting bytes', async () => {
    // Bytes that are NOT valid UTF-8: coercing them through a JS string
    // (resBody += chunk) mangles them. Regression guard for that bug.
    const payload = Buffer.from([0x00, 0x80, 0x81, 0xff, 0xfe, 0x10, 0x42, 0x00]);

    const origin = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(payload);
    });
    await new Promise<void>(r => origin.listen(0, r));
    const originPort = (origin.address() as net.AddressInfo).port;

    // ignoreHosts excludes 127.0.0.1 so the request goes through the capturing
    // path (the passthrough path pipes and was never in question).
    await proxyServer.start({ port: 0, collectionName: 'captured', ignoreHosts: ['example.invalid'] });
    const proxyPort = (proxyServer as any).server.address().port as number;

    const received: Buffer = await new Promise((resolve, reject) => {
      const r = http.request(
        { host: '127.0.0.1', port: proxyPort, method: 'GET',
          path: `http://127.0.0.1:${originPort}/bin`, headers: { host: `127.0.0.1:${originPort}` } },
        (resp) => {
          const chunks: Buffer[] = [];
          resp.on('data', c => chunks.push(c as Buffer));
          resp.on('end', () => resolve(Buffer.concat(chunks)));
        },
      );
      r.on('error', reject);
      r.end();
    });

    await proxyServer.stop();
    await new Promise<void>(r => origin.close(() => r()));

    expect(received.equals(payload)).toBe(true);
  });
});
