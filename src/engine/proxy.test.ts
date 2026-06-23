import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
