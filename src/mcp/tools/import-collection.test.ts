import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { definition, handler } from './import-collection.js';
import { CollectionManager } from '../../engine/collection-manager.js';
import { EnvironmentManager } from '../../engine/environment-manager.js';
import { AuthManager } from '../../engine/auth-manager.js';
import { ProxyServer } from '../../engine/proxy.js';
import { ResponseStore } from '../../engine/response-store.js';
import { HistoryStore } from '../../engine/history-store.js';
import { TunnelManager } from '../../engine/tunnel-manager.js';
import { EngineContext } from './types.js';

function makeContext(collectionManager: CollectionManager): EngineContext {
  return {
    collectionManager,
    environmentManager: {} as EnvironmentManager,
    authManager: {} as AuthManager,
    proxyServer: {} as ProxyServer,
    tunnelManager: {} as TunnelManager,
    responseStore: new ResponseStore(),
    historyStore: new HistoryStore(),
    executeRequest: async () => ({ status: 200, body: '', headers: {}, latency: 0 }),
  };
}

describe('import_collection tool definition', () => {
  it('has a name', () => {
    expect(definition.name).toBe('import_collection');
  });

  it('has a description', () => {
    expect(definition.description.length).toBeGreaterThan(10);
  });

  it('requires source in inputSchema', () => {
    expect(definition.inputSchema.required).toContain('source');
  });

  it('requires format in inputSchema', () => {
    expect(definition.inputSchema.required).toContain('format');
  });
});

describe('import_collection handler', () => {
  let tmpDir: string;
  let context: EngineContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-mcp-import-'));
    context = makeContext(new CollectionManager(tmpDir));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('imports a Postman file and returns structured result', async () => {
    const postman = {
      info: { name: 'MCP Test API' },
      item: [{ name: 'List Items', request: { method: 'GET', url: 'https://api.example.com/items', header: [] } }]
    };
    const filePath = path.join(tmpDir, 'api.json');
    await fs.writeFile(filePath, JSON.stringify(postman));

    const result = await handler({ source: filePath, format: 'postman' }, context);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.collectionName).toBe('MCP Test API');
    expect(parsed.requestsImported).toBe(1);
  });

  it('returns isError: true when the file does not exist', async () => {
    const result = await handler({ source: '/no/such/file.json', format: 'postman' }, context);
    expect(result.isError).toBe(true);
  });

  it('imports a Bruno .bru file', async () => {
    const bruDir = path.join(tmpDir, 'myapi');
    await fs.mkdir(bruDir);
    const bru = `meta { name: Get Users }\nget { url: https://api.example.com/users }`;
    const filePath = path.join(bruDir, 'get-users.bru');
    await fs.writeFile(filePath, bru);

    const result = await handler({ source: filePath, format: 'bruno' }, context);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.requestsImported).toBe(1);
  });
});
