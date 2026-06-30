import { describe, it, expect } from 'vitest';
import { runScript } from './script-runner.js';

function ctx(body: unknown) {
  return {
    env: {},
    request: {},
    response: { status: 200, body, headers: {}, latency: 10 },
  };
}

describe('jsonSchema Chai plugin - T-157', () => {
  it('passes when body matches schema', () => {
    const result = runScript(
      `test('valid', () => { expect(res.getBody()).to.have.jsonSchema({ type: 'object', required: ['id'], properties: { id: { type: 'number' } } }); });`,
      ctx({ id: 1, name: 'Alice' })
    );
    expect(result.testResults[0].passed).toBe(true);
  });

  it('fails when required property missing', () => {
    const result = runScript(
      `test('missing id', () => { expect(res.getBody()).to.have.jsonSchema({ type: 'object', required: ['id'] }); });`,
      ctx({ name: 'Alice' })
    );
    expect(result.testResults[0].passed).toBe(false);
    expect(result.testResults[0].error).toMatch(/id/);
  });

  it('fails when type is wrong', () => {
    const result = runScript(
      `test('wrong type', () => { expect(res.getBody()).to.have.jsonSchema({ type: 'object' }); });`,
      ctx('not an object')
    );
    expect(result.testResults[0].passed).toBe(false);
    expect(result.testResults[0].error).toMatch(/object/);
  });

  it('passes for array schema', () => {
    const result = runScript(
      `test('array', () => { expect(res.getBody()).to.have.jsonSchema({ type: 'array', items: { type: 'number' } }); });`,
      ctx([1, 2, 3])
    );
    expect(result.testResults[0].passed).toBe(true);
  });

  it('error message includes actual body excerpt', () => {
    const result = runScript(
      `test('err msg', () => { expect(res.getBody()).to.have.jsonSchema({ type: 'object', required: ['id'] }); });`,
      ctx({ name: 'Alice' })
    );
    expect(result.testResults[0].error).toContain('name');
  });
});

describe('jsonBody Chai plugin - T-157', () => {
  it('passes when body contains all expected keys', () => {
    const result = runScript(
      `test('partial match', () => { expect(res.getBody()).to.have.jsonBody({ id: 1 }); });`,
      ctx({ id: 1, name: 'Alice' })
    );
    expect(result.testResults[0].passed).toBe(true);
  });

  it('fails when expected key has wrong value', () => {
    const result = runScript(
      `test('wrong value', () => { expect(res.getBody()).to.have.jsonBody({ id: 2 }); });`,
      ctx({ id: 1 })
    );
    expect(result.testResults[0].passed).toBe(false);
    expect(result.testResults[0].error).toMatch(/id/);
  });

  it('passes with extra fields in actual body', () => {
    const result = runScript(
      `test('extra fields', () => { expect(res.getBody()).to.have.jsonBody({ status: 'ok' }); });`,
      ctx({ status: 'ok', ts: 1234, extra: true })
    );
    expect(result.testResults[0].passed).toBe(true);
  });

  it('fails when expected key is missing', () => {
    const result = runScript(
      `test('missing key', () => { expect(res.getBody()).to.have.jsonBody({ id: 1, role: 'admin' }); });`,
      ctx({ id: 1 })
    );
    expect(result.testResults[0].passed).toBe(false);
    expect(result.testResults[0].error).toMatch(/role/);
  });

  it('error message includes expected subset and actual body', () => {
    const result = runScript(
      `test('err msg', () => { expect(res.getBody()).to.have.jsonBody({ id: 99 }); });`,
      ctx({ id: 1 })
    );
    expect(result.testResults[0].error).toContain('99');
    expect(result.testResults[0].error).toContain('1');
  });
});
