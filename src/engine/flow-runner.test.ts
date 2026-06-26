import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlowRunner } from './flow-runner.js';
import { ResponseStore } from './response-store.js';
import { FlowConfig, HttpResponse } from '../types/index.js';

// Build a minimal EngineContext with stubs. executeRequest is a mock so no
// real network calls happen.
function makeContext(opts: {
  requests?: Record<string, any>;
  collectionVars?: Record<string, Record<string, string>>;
  executeRequest?: any;
  activeEnv?: any;
  updateVariable?: any;
}) {
  const responseStore = new ResponseStore();
  const requests = opts.requests || {};
  const collectionVars = opts.collectionVars || {};

  return {
    responseStore,
    historyStore: { append: vi.fn() },
    collectionManager: {
      getRequest: vi.fn(async (col: string, req: string) => {
        const key = `${col}/${req}`;
        if (!requests[key]) throw new Error(`Request ${key} not found`);
        return requests[key];
      }),
      getCollection: vi.fn(async (col: string) => ({
        name: col,
        requests: [],
        variables: collectionVars[col] || {},
      })),
    },
    environmentManager: {
      getActiveEnvironment: vi.fn(async () => opts.activeEnv ?? null),
      updateVariable: opts.updateVariable || vi.fn(async () => {}),
    },
    authManager: {
      getProfile: vi.fn(async () => undefined),
    },
    executeRequest: opts.executeRequest,
  } as any;
}

function resp(body: any, status = 200): HttpResponse {
  return { status, body, headers: {}, latency: 5, timestamp: new Date().toISOString() };
}

describe('FlowRunner', () => {
  it('runs steps sequentially and reports per-step results', async () => {
    const executeRequest = vi.fn(async () => resp({ ok: true }));
    const ctx = makeContext({
      requests: { 'Auth/Login': { name: 'Login', method: 'POST', url: 'http://x/login' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F1',
      steps: [
        { type: 'run', id: 's1', collection: 'Auth', request: 'Login' },
        { type: 'assert', id: 's2', assertions: [{ field: 'status', operator: 'eq', value: 200 }] },
      ],
    };

    const runner = new FlowRunner(ctx);
    const result = await runner.run(flow);

    expect(result.flowName).toBe('F1');
    expect(result.passed).toBe(true);
    expect(result.steps.map(s => s.stepId)).toEqual(['s1', 's2']);
    expect(result.steps.every(s => s.passed)).toBe(true);
    expect(executeRequest).toHaveBeenCalledTimes(1);
  });

  it('extracts a response value into flow-local scope and uses it downstream', async () => {
    const seen: string[] = [];
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      if (config.url.includes('login')) return resp({ token: 'abc123' });
      return resp({ ok: true });
    });
    const ctx = makeContext({
      requests: {
        'Auth/Login': { name: 'Login', method: 'POST', url: 'http://x/login' },
        'Auth/Me': { name: 'Me', method: 'GET', url: 'http://x/me?t={{token}}' },
      },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F2',
      steps: [
        { type: 'run', id: 's1', collection: 'Auth', request: 'Login' },
        { type: 'extract', id: 's2', from: 'response.body.token', into: 'token' },
        { type: 'run', id: 's3', collection: 'Auth', request: 'Me' },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(true);
    expect(seen[1]).toBe('http://x/me?t=abc123');
  });

  it('extract with into: env.* writes to the active environment', async () => {
    const updateVariable = vi.fn(async () => {});
    const executeRequest = vi.fn(async () => resp({ token: 'xyz' }));
    const ctx = makeContext({
      requests: { 'Auth/Login': { name: 'Login', method: 'POST', url: 'http://x/login' } },
      executeRequest,
      activeEnv: { name: 'dev', variables: {} },
      updateVariable,
    });
    const flow: FlowConfig = {
      name: 'F3',
      steps: [
        { type: 'run', id: 's1', collection: 'Auth', request: 'Login' },
        { type: 'extract', id: 's2', from: 'response.body.token', into: 'env.authToken' },
      ],
    };

    await new FlowRunner(ctx).run(flow);
    expect(updateVariable).toHaveBeenCalledWith('dev', 'authToken', 'xyz');
  });

  it('retries a run step on matching status codes', async () => {
    let calls = 0;
    const executeRequest = vi.fn(async () => {
      calls++;
      return calls < 3 ? resp({}, 503) : resp({ ok: true }, 200);
    });
    const ctx = makeContext({
      requests: { 'C/R': { name: 'R', method: 'GET', url: 'http://x/r' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F4',
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'R', retry: { times: 5, on: [503], delay: 0 } },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(calls).toBe(3);
    expect(result.steps[0].passed).toBe(true);
  });

  it('marks a run step failed when retries are exhausted', async () => {
    const executeRequest = vi.fn(async () => resp({}, 503));
    const ctx = makeContext({
      requests: { 'C/R': { name: 'R', method: 'GET', url: 'http://x/r' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F5',
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'R', retry: { times: 2, on: [503], delay: 0 } },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(false);
    expect(result.steps[0].passed).toBe(false);
  });

  it('fails the flow when an assert step fails', async () => {
    const executeRequest = vi.fn(async () => resp({ ok: true }, 500));
    const ctx = makeContext({
      requests: { 'C/R': { name: 'R', method: 'GET', url: 'http://x/r' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F6',
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'R' },
        { type: 'assert', id: 's2', assertions: [{ field: 'status', operator: 'eq', value: 200 }] },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(false);
    expect(result.steps.find(s => s.stepId === 's2')!.passed).toBe(false);
  });

  it('runs the step sequence once per data row and aggregates results', async () => {
    const seen: string[] = [];
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      return resp({ ok: true });
    });
    const ctx = makeContext({
      requests: { 'C/R': { name: 'R', method: 'GET', url: 'http://x/u/{{userId}}' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F7',
      data: [{ userId: '1' }, { userId: '2' }],
      steps: [{ type: 'run', id: 's1', collection: 'C', request: 'R' }],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.dataRows).toHaveLength(2);
    expect(result.dataRows!.map(r => r.data)).toEqual([{ userId: '1' }, { userId: '2' }]);
    expect(seen).toEqual(['http://x/u/1', 'http://x/u/2']);
    expect(result.passed).toBe(true);
  });

  it('marks the flow failed if any data row fails', async () => {
    let calls = 0;
    const executeRequest = vi.fn(async () => {
      calls++;
      return resp({ ok: true }, calls === 2 ? 500 : 200);
    });
    const ctx = makeContext({
      requests: { 'C/R': { name: 'R', method: 'GET', url: 'http://x/r' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F8',
      data: [{ x: '1' }, { x: '2' }],
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'R' },
        { type: 'assert', id: 's2', assertions: [{ field: 'status', operator: 'eq', value: 200 }] },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(false);
    expect(result.dataRows![0].passed).toBe(true);
    expect(result.dataRows![1].passed).toBe(false);
  });

  it('applies a dataRow override and does not iterate flow.data', async () => {
    const seen: string[] = [];
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      return resp({ ok: true });
    });
    const ctx = makeContext({
      requests: { 'C/R': { name: 'R', method: 'GET', url: 'http://x/u/{{userId}}' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'F9',
      data: [{ userId: '1' }, { userId: '2' }],
      steps: [{ type: 'run', id: 's1', collection: 'C', request: 'R' }],
    };

    const result = await new FlowRunner(ctx).run(flow, { dataRow: { userId: '99' } });
    expect(seen).toEqual(['http://x/u/99']);
    expect(result.dataRows).toBeUndefined();
  });

  // ---- T-097: conditional + poll ----

  it('conditional goto forward skips intermediate steps', async () => {
    const seen: string[] = [];
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      return resp({ role: 'admin' });
    });
    const ctx = makeContext({
      requests: {
        'C/A': { name: 'A', method: 'GET', url: 'http://x/a' },
        'C/Cc': { name: 'Cc', method: 'GET', url: 'http://x/c' },
        'C/D': { name: 'D', method: 'GET', url: 'http://x/d' },
      },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'G1',
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'A' },
        { type: 'conditional', id: 's2', if: "response.body.role === 'admin'", then: 's4' },
        { type: 'run', id: 's3', collection: 'C', request: 'Cc' },
        { type: 'run', id: 's4', collection: 'C', request: 'D' },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(true);
    expect(seen).toEqual(['http://x/a', 'http://x/d']);
  });

  it('detects a circular goto loop and aborts', async () => {
    const seen: string[] = [];
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      return resp({ ok: true });
    });
    const ctx = makeContext({
      requests: { 'C/A': { name: 'A', method: 'GET', url: 'http://x/a' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'G2',
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'A' },
        { type: 'conditional', id: 's2', if: 'response.body.ok', then: 's1' },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(false);
    const condStep = result.steps.filter(s => s.stepId === 's2').pop()!;
    expect(condStep.error).toMatch(/circular|loop/i);
    // s1 fired at most a bounded number of times, not infinitely.
    expect(seen.length).toBeLessThanOrEqual(3);
  });

  it('conditional then: skip continues to the next step', async () => {
    const seen: string[] = [];
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      return resp({ ok: true });
    });
    const ctx = makeContext({
      requests: {
        'C/A': { name: 'A', method: 'GET', url: 'http://x/a' },
        'C/B': { name: 'B', method: 'GET', url: 'http://x/b' },
      },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'G3',
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'A' },
        { type: 'conditional', id: 's2', if: 'response.body.ok', then: 'skip' },
        { type: 'run', id: 's3', collection: 'C', request: 'B' },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(true);
    expect(seen).toEqual(['http://x/a', 'http://x/b']);
  });

  it('conditional then: abort stops the flow and marks it failed', async () => {
    const seen: string[] = [];
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      return resp({ blocked: true });
    });
    const ctx = makeContext({
      requests: {
        'C/A': { name: 'A', method: 'GET', url: 'http://x/a' },
        'C/B': { name: 'B', method: 'GET', url: 'http://x/b' },
      },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'G4',
      steps: [
        { type: 'run', id: 's1', collection: 'C', request: 'A' },
        { type: 'conditional', id: 's2', if: 'response.body.blocked', then: 'abort' },
        { type: 'run', id: 's3', collection: 'C', request: 'B' },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(false);
    expect(seen).toEqual(['http://x/a']);
  });

  it('poll succeeds once the until expression is truthy', async () => {
    let calls = 0;
    const executeRequest = vi.fn(async () => {
      calls++;
      return resp({ status: calls >= 3 ? 'done' : 'pending' });
    });
    const ctx = makeContext({
      requests: { 'C/Job': { name: 'Job', method: 'GET', url: 'http://x/job' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'P1',
      steps: [
        { type: 'poll', id: 's1', collection: 'C', request: 'Job', until: "response.body.status === 'done'", maxAttempts: 5, delay: 0 },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(true);
    expect(calls).toBe(3);
  });

  it('poll fails when maxAttempts is exhausted', async () => {
    let calls = 0;
    const executeRequest = vi.fn(async () => {
      calls++;
      return resp({ status: 'pending' });
    });
    const ctx = makeContext({
      requests: { 'C/Job': { name: 'Job', method: 'GET', url: 'http://x/job' } },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'P2',
      steps: [
        { type: 'poll', id: 's1', collection: 'C', request: 'Job', until: "response.body.status === 'done'", maxAttempts: 3, delay: 0 },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(false);
    expect(calls).toBe(3);
  });

  it('poll exposes its final response to a downstream extract', async () => {
    const seen: string[] = [];
    let calls = 0;
    const executeRequest = vi.fn(async (config: any) => {
      seen.push(config.url);
      if (config.url.includes('job')) {
        calls++;
        return resp(calls >= 2 ? { ready: 'yes', token: 'tok9' } : { ready: 'no' });
      }
      return resp({ ok: true });
    });
    const ctx = makeContext({
      requests: {
        'C/Job': { name: 'Job', method: 'GET', url: 'http://x/job' },
        'C/Use': { name: 'Use', method: 'GET', url: 'http://x/use?t={{tok}}' },
      },
      executeRequest,
    });
    const flow: FlowConfig = {
      name: 'P3',
      steps: [
        { type: 'poll', id: 's1', collection: 'C', request: 'Job', until: "response.body.ready === 'yes'", maxAttempts: 5, delay: 0 },
        { type: 'extract', id: 's2', from: 'response.body.token', into: 'tok' },
        { type: 'run', id: 's3', collection: 'C', request: 'Use' },
      ],
    };

    const result = await new FlowRunner(ctx).run(flow);
    expect(result.passed).toBe(true);
    expect(seen[seen.length - 1]).toBe('http://x/use?t=tok9');
  });
});
