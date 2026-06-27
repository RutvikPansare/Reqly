import { describe, it, expect, vi, beforeEach } from 'vitest';
import { definition as startDef, handler as startHandler } from './start-mock.js';
import { definition as stopDef, handler as stopHandler } from './stop-mock.js';
import { definition as statusDef, handler as statusHandler } from './get-mock-status.js';
import type { EngineContext } from './types.js';

function makeContext(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    collectionManager: {} as any,
    environmentManager: {} as any,
    authManager: {} as any,
    proxyServer: {} as any,
    tunnelManager: {} as any,
    responseStore: {} as any,
    historyStore: {} as any,
    flowManager: {} as any,
    mockServer: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue({ running: false, routes: [] }),
    } as any,
    executeRequest: vi.fn() as any,
    ...overrides,
  };
}

// --- start_mock ---

describe('start_mock definition', () => {
  it('has correct name', () => {
    expect(startDef.name).toBe('start_mock');
  });

  it('has non-empty description', () => {
    expect(startDef.description.length).toBeGreaterThan(20);
  });

  it('requires collection param', () => {
    expect(startDef.inputSchema.required).toContain('collection');
  });

  it('has optional port param', () => {
    expect(startDef.inputSchema.properties.port).toBeDefined();
    expect(startDef.inputSchema.required ?? []).not.toContain('port');
  });
});

describe('start_mock handler', () => {
  it('calls mockServer.start with collection and port', async () => {
    const ctx = makeContext();
    const result = await startHandler({ collection: 'my-api', port: 4243 }, ctx);
    expect(ctx.mockServer!.start).toHaveBeenCalledWith('my-api', 4243);
    expect(result.isError).toBeFalsy();
  });

  it('defaults port to 4243 when not specified', async () => {
    const ctx = makeContext();
    await startHandler({ collection: 'my-api' }, ctx);
    expect(ctx.mockServer!.start).toHaveBeenCalledWith('my-api', 4243);
  });

  it('returns routes from getStatus after start', async () => {
    const ctx = makeContext();
    (ctx.mockServer!.getStatus as any).mockReturnValue({
      running: true, collection: 'my-api', port: 4243,
      routes: [{ method: 'GET', path: '/users', exampleCount: 2 }],
    });
    const result = await startHandler({ collection: 'my-api' }, ctx);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.port).toBe(4243);
    expect(parsed.routes).toHaveLength(1);
  });

  it('returns isError on failure', async () => {
    const ctx = makeContext();
    (ctx.mockServer!.start as any).mockRejectedValue(new Error('already running'));
    const result = await startHandler({ collection: 'my-api' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already running');
  });
});

// --- stop_mock ---

describe('stop_mock definition', () => {
  it('has correct name', () => {
    expect(stopDef.name).toBe('stop_mock');
  });

  it('has non-empty description', () => {
    expect(stopDef.description.length).toBeGreaterThan(10);
  });

  it('requires no params', () => {
    expect((stopDef.inputSchema.required ?? []).length).toBe(0);
  });
});

describe('stop_mock handler', () => {
  it('calls mockServer.stop', async () => {
    const ctx = makeContext();
    await stopHandler({}, ctx);
    expect(ctx.mockServer!.stop).toHaveBeenCalled();
  });

  it('returns success text', async () => {
    const ctx = makeContext();
    const result = await stopHandler({}, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text.toLowerCase()).toContain('stop');
  });

  it('returns isError on failure', async () => {
    const ctx = makeContext();
    (ctx.mockServer!.stop as any).mockRejectedValue(new Error('not running'));
    const result = await stopHandler({}, ctx);
    expect(result.isError).toBe(true);
  });
});

// --- get_mock_status ---

describe('get_mock_status definition', () => {
  it('has correct name', () => {
    expect(statusDef.name).toBe('get_mock_status');
  });

  it('has non-empty description', () => {
    expect(statusDef.description.length).toBeGreaterThan(10);
  });
});

describe('get_mock_status handler', () => {
  it('returns status from mockServer.getStatus', async () => {
    const ctx = makeContext();
    (ctx.mockServer!.getStatus as any).mockReturnValue({
      running: true, collection: 'my-api', port: 4243,
      routes: [{ method: 'POST', path: '/orders', exampleCount: 1 }],
    });
    const result = await statusHandler({}, ctx);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.running).toBe(true);
    expect(parsed.collection).toBe('my-api');
    expect(parsed.routes).toHaveLength(1);
  });

  it('returns running:false when stopped', async () => {
    const ctx = makeContext();
    const result = await statusHandler({}, ctx);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.running).toBe(false);
    expect(parsed.routes).toEqual([]);
  });
});
