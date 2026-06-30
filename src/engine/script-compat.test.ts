import { describe, it, expect } from 'vitest';
import { runScript } from './script-runner.js';

describe('Bruno script compatibility layer', () => {
  it('res.getStatus() returns status', () => {
    const script = `reqly.setEnvVar('s', String(res.getStatus()));`;
    const context = {
      env: {} as Record<string, string>,
      request: {},
      response: { status: 201 }
    };
    runScript(script, context);
    expect(context.env.s).toBe('201');
  });

  it('res.getBody() returns body', () => {
    const script = `reqly.setEnvVar('b', res.getBody().foo);`;
    const context = {
      env: {} as Record<string, string>,
      request: {},
      response: { body: { foo: 'bar' } }
    };
    runScript(script, context);
    expect(context.env.b).toBe('bar');
  });

  it('res.getHeader(name) returns header case-insensitively', () => {
    const script = `
      reqly.setEnvVar('h1', res.getHeader('X-Test'));
      reqly.setEnvVar('h2', res.getHeader('x-test'));
    `;
    const context = {
      env: {} as Record<string, string>,
      request: {},
      response: { headers: { 'x-test': 'value' } }
    };
    runScript(script, context);
    expect(context.env.h1).toBe('value');
    expect(context.env.h2).toBe('value');
  });

  it('res.getResponseTime() returns latency', () => {
    const script = `reqly.setEnvVar('l', String(res.getResponseTime()));`;
    const context = {
      env: {} as Record<string, string>,
      request: {},
      response: { latency: 123 }
    };
    runScript(script, context);
    expect(context.env.l).toBe('123');
  });

  it('bru.setEnvVar() sets env var', () => {
    const script = `bru.setEnvVar('key', 'value');`;
    const context = {
      env: {} as Record<string, string>,
      request: {}
    };
    runScript(script, context);
    expect(context.env.key).toBe('value');
  });

  it('bru.getEnvVar() reads env var', () => {
    const script = `reqly.setEnvVar('copy', bru.getEnvVar('original'));`;
    const context = {
      env: { original: 'source' } as Record<string, string>,
      request: {}
    };
    runScript(script, context);
    expect(context.env.copy).toBe('source');
  });
});
