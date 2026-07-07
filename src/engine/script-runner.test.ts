import { describe, it, expect } from 'vitest';
import { runScript, ScriptContext } from './script-runner.js';

describe('script-runner', () => {
  it('pre-script can set a new env variable', () => {
    const ctx: ScriptContext = { env: { existing: 'val' }, request: { method: 'GET', url: 'http://x.com' } };
    runScript('env.token = "abc123"', ctx);
    expect(ctx.env.token).toBe('abc123');
  });

  it('pre-script can read an existing env variable', () => {
    const ctx: ScriptContext = { env: { base: 'hello' }, request: { method: 'GET', url: 'http://x.com' } };
    let captured = '';
    // Use env.base in a computation and write result back
    runScript('env.result = env.base + "-world"', ctx);
    expect(ctx.env.result).toBe('hello-world');
  });

  it('pre-script can overwrite an existing env variable', () => {
    const ctx: ScriptContext = { env: { token: 'old' }, request: {} };
    runScript('env.token = "new"', ctx);
    expect(ctx.env.token).toBe('new');
  });

  it('pre-script receives request properties', () => {
    const ctx: ScriptContext = { env: {}, request: { method: 'POST', url: 'http://api.com/users' } };
    runScript('env.capturedMethod = request.method', ctx);
    expect(ctx.env.capturedMethod).toBe('POST');
  });

  it('post-script receives response body and can extract a value into env', () => {
    const ctx: ScriptContext = {
      env: {},
      request: {},
      response: { status: 200, body: { token: 'my-token-from-response' }, latency: 50, headers: {} },
    };
    runScript('env.authToken = response.body.token', ctx);
    expect(ctx.env.authToken).toBe('my-token-from-response');
  });

  it('post-script can read response status', () => {
    const ctx: ScriptContext = {
      env: {},
      request: {},
      response: { status: 201, body: null, latency: 30, headers: {} },
    };
    runScript('env.lastStatus = String(response.status)', ctx);
    expect(ctx.env.lastStatus).toBe('201');
  });

  it('a throwing script does not crash the caller', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    expect(() => runScript('throw new Error("intentional")', ctx)).not.toThrow();
  });

  it('a script with a syntax error does not crash the caller', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    expect(() => runScript('const = "broken syntax"', ctx)).not.toThrow();
  });

  it('mutations from a throwing script are partial - env keeps changes made before the throw', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    runScript('env.pre = "set"; throw new Error("mid-script")', ctx);
    expect(ctx.env.pre).toBe('set');
  });

  it('script has access to a console object that does not throw', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    expect(() => runScript('console.log("debug"); env.ok = "yes"', ctx)).not.toThrow();
    expect(ctx.env.ok).toBe('yes');
  });

  it('console.log output is captured in consoleLogs', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { consoleLogs } = runScript('console.log("hello world")', ctx);
    expect(consoleLogs).toHaveLength(1);
    expect(consoleLogs[0]).toBe('[log] hello world');
  });

  it('console.warn and console.error are captured with correct levels', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { consoleLogs } = runScript('console.warn("caution"); console.error("boom")', ctx);
    expect(consoleLogs[0]).toBe('[warn] caution');
    expect(consoleLogs[1]).toBe('[error] boom');
  });

  it('multiple console.log calls are all captured in order', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { consoleLogs } = runScript('console.log(1); console.log(2); console.log(3)', ctx);
    expect(consoleLogs).toEqual(['[log] 1', '[log] 2', '[log] 3']);
  });

  it('objects passed to console.log are serialized as JSON', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { consoleLogs } = runScript('console.log({a: 1})', ctx);
    expect(consoleLogs[0]).toBe('[log] {"a":1}');
  });

  // Regression: a circular object passed to console.log threw inside JSON.stringify,
  // which aborted the entire script - logging must never crash user code.
  it('console.log of a circular object does not abort the script', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { consoleLogs } = runScript(
      'const a = { name: "x" }; a.self = a; console.log(a); console.log("after");',
      ctx,
    );
    // Both logs present; the circular one is rendered, not a script-error abort.
    expect(consoleLogs).toHaveLength(2);
    expect(consoleLogs[0]).toContain('[log]');
    expect(consoleLogs[0]).not.toContain('Script error');
    expect(consoleLogs[1]).toBe('[log] after');
  });

  it('script error is captured as [error] log and does not throw', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { consoleLogs } = runScript('throw new Error("oops")', ctx);
    expect(consoleLogs[0]).toMatch(/^\[error\] Script error: oops/);
  });

  it('returns empty consoleLogs when script has no console calls', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { consoleLogs } = runScript('env.x = "1"', ctx);
    expect(consoleLogs).toEqual([]);
  });

  // test() / expect() - T-143
  it('test() passing produces a passed testResult', () => {
    const ctx: ScriptContext = { env: {}, request: {}, response: { status: 200, body: null, headers: {}, latency: 10 } };
    const { testResults } = runScript('test("status is 200", () => { expect(reqly.response.status).to.equal(200) })', ctx);
    expect(testResults).toHaveLength(1);
    expect(testResults![0]).toEqual({ name: 'status is 200', passed: true });
  });

  it('test() failing produces a failed testResult with error message', () => {
    const ctx: ScriptContext = { env: {}, request: {}, response: { status: 404, body: null, headers: {}, latency: 10 } };
    const { testResults } = runScript('test("status is 200", () => { expect(reqly.response.status).to.equal(200) })', ctx);
    expect(testResults).toHaveLength(1);
    expect(testResults![0].passed).toBe(false);
    expect(testResults![0].error).toBeTruthy();
  });

  it('expect() passing does not throw and produces a passed result', () => {
    const ctx: ScriptContext = { env: {}, request: {}, response: { status: 201, body: { id: 1 }, headers: {}, latency: 5 } };
    const { testResults } = runScript('test("has id", () => { expect(reqly.response.body).to.have.property("id") })', ctx);
    expect(testResults![0].passed).toBe(true);
  });

  it('expect() throws and is caught as a failed testResult', () => {
    const ctx: ScriptContext = { env: {}, request: {}, response: { status: 200, body: {}, headers: {}, latency: 5 } };
    const { testResults } = runScript('test("has id", () => { expect(reqly.response.body).to.have.property("id") })', ctx);
    expect(testResults![0].passed).toBe(false);
    expect(testResults![0].error).toContain('id');
  });

  it('multiple test() calls all produce individual results', () => {
    const ctx: ScriptContext = { env: {}, request: {}, response: { status: 200, body: 'ok', headers: {}, latency: 5 } };
    const { testResults } = runScript(`
      test("passes", () => { expect(reqly.response.status).to.equal(200) });
      test("fails", () => { expect(reqly.response.status).to.equal(999) });
    `, ctx);
    expect(testResults).toHaveLength(2);
    expect(testResults![0].passed).toBe(true);
    expect(testResults![1].passed).toBe(false);
  });

  it('test() can mix with reqly.setEnvVar and reqly.getEnvVar', () => {
    const ctx: ScriptContext = { env: { token: 'abc' }, request: {}, response: { status: 200, body: null, headers: {}, latency: 5 } };
    const { testResults } = runScript(`
      reqly.setEnvVar('result', reqly.getEnvVar('token') + '-extended');
      test("env var set", () => { expect(reqly.getEnvVar('result')).to.equal('abc-extended') });
    `, ctx);
    expect(ctx.env.result).toBe('abc-extended');
    expect(testResults![0].passed).toBe(true);
  });

  it('returns empty testResults when no test() calls are made', () => {
    const ctx: ScriptContext = { env: {}, request: {} };
    const { testResults } = runScript('env.x = "1"', ctx);
    expect(testResults).toEqual([]);
  });
});
