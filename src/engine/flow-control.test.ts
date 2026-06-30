import { describe, it, expect, vi } from 'vitest';
import { runScript } from './script-runner.js';
import { CollectionRunner } from './collection-runner.js';

// Helper to build a minimal EngineContext mock.
// The mock executeRequest runs postScript (if present) with runnerContext so flow
// control signals reach the CollectionRunner - mirroring what the real executor does.
function makeContext(requests: { name: string; postScript?: string }[], responseStatuses: number[] = []) {
  let callIndex = 0;
  return {
    collectionManager: {
      getCollection: vi.fn().mockResolvedValue({
        name: 'col',
        requests,
        variables: {},
      }),
    },
    authManager: { getProfile: vi.fn() },
    executeRequest: vi.fn().mockImplementation((req: any, _env: any, _auth: any, _trunc: any, _max: any, _cvars: any, _cauth: any, _cname: any, runnerContext: any) => {
      const status = responseStatuses[callIndex++] ?? 200;
      const response: any = { status, latency: 5, headers: {}, body: null };
      if (req.postScript && runnerContext) {
        const { flowControl } = runScript(req.postScript, {
          env: {},
          request: req,
          response,
          runnerContext,
        });
        response._flowControl = flowControl;
      }
      return Promise.resolve(response);
    }),
    responseStore: { set: () => {}, get: () => undefined },
    historyStore: { append: () => {} },
    environmentManager: { getActiveEnvironment: vi.fn().mockResolvedValue(null) },
  };
}

// ---- runScript no-op outside runner ----

describe('flow control - no-op outside collection runner', () => {
  it('reqly.runner.stop() is no-op in single-request context', () => {
    const result = runScript(`reqly.runner.stop();`, { env: {}, request: {} });
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
    expect(result.flowControl.stopRunner).toBeUndefined();
  });

  it('reqly.sleep(100) is no-op in single-request context', () => {
    const result = runScript(`reqly.sleep(100);`, { env: {}, request: {} });
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
    expect(result.flowControl.sleepMs).toBeUndefined();
  });

  it('reqly.setNextRequest("x") is no-op in single-request context', () => {
    const result = runScript(`reqly.setNextRequest('x');`, { env: {}, request: {} });
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
    expect(result.flowControl.nextRequest).toBeUndefined();
  });
});

// ---- runScript sets flow control flags when inside runner ----

describe('flow control - flags set inside runner context', () => {
  it('reqly.runner.stop() sets stopRunner flag', () => {
    const result = runScript(`reqly.runner.stop();`, {
      env: {}, request: {},
      runnerContext: { validRequestNames: ['a', 'b'] },
    });
    expect(result.flowControl.stopRunner).toBe(true);
  });

  it('reqly.sleep(500) sets sleepMs flag', () => {
    const result = runScript(`reqly.sleep(500);`, {
      env: {}, request: {},
      runnerContext: { validRequestNames: ['a'] },
    });
    expect(result.flowControl.sleepMs).toBe(500);
  });

  it('reqly.setNextRequest sets nextRequest flag', () => {
    const result = runScript(`reqly.setNextRequest('b');`, {
      env: {}, request: {},
      runnerContext: { validRequestNames: ['a', 'b'] },
    });
    expect(result.flowControl.nextRequest).toBe('b');
  });

  it('reqly.setNextRequest with unknown name throws with clear message', () => {
    const result = runScript(`reqly.setNextRequest('unknown');`, {
      env: {}, request: {},
      runnerContext: { validRequestNames: ['req1', 'req2'] },
    });
    expect(result.consoleLogs.some(l =>
      l.includes("setNextRequest: 'unknown' not found") &&
      l.includes('req1') &&
      l.includes('req2')
    )).toBe(true);
  });
});

// ---- CollectionRunner integration ----

describe('CollectionRunner flow control', () => {
  it('runner.stop() in postScript halts remaining requests', async () => {
    const requests = [
      { name: 'req1', postScript: `reqly.runner.stop();` },
      { name: 'req2' },
      { name: 'req3' },
    ];
    const ctx = makeContext(requests, [200, 200, 200]);
    const runner = new CollectionRunner(ctx as any);
    const result = await runner.run('col');

    expect(result.results).toHaveLength(1);
    expect(result.stoppedEarly).toBe(true);
    expect(result.results[0].requestName).toBe('req1');
  });

  it('setNextRequest skips to named request', async () => {
    const requests = [
      { name: 'req1', postScript: `reqly.setNextRequest('req3');` },
      { name: 'req2' },
      { name: 'req3' },
    ];
    const ctx = makeContext(requests, [200, 200]);
    const runner = new CollectionRunner(ctx as any);
    const result = await runner.run('col');

    const names = result.results.map(r => r.requestName);
    expect(names).toContain('req1');
    expect(names).not.toContain('req2');
    expect(names).toContain('req3');
    expect(result.jumpedTo).toBe('req3');
  });

  it('sleep(ms) delays between requests', async () => {
    const requests = [
      { name: 'req1', postScript: `reqly.sleep(50);` },
      { name: 'req2' },
    ];
    const ctx = makeContext(requests, [200, 200]);
    const runner = new CollectionRunner(ctx as any);
    const start = Date.now();
    await runner.run('col');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it('stoppedEarly is false when runner completes normally', async () => {
    const requests = [{ name: 'req1' }, { name: 'req2' }];
    const ctx = makeContext(requests, [200, 200]);
    const runner = new CollectionRunner(ctx as any);
    const result = await runner.run('col');
    expect(result.stoppedEarly).toBe(false);
    expect(result.jumpedTo).toBeUndefined();
  });
});
