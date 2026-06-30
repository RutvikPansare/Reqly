import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execute } from './http-executor.js';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';

function mockFetch(status = 200, body = { ok: true }) {
  vi.mocked(fetch).mockResolvedValue({
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: vi.fn().mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(body)).buffer
    ),
  } as any);
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-test-'));
  mockFetch();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const baseReq = { name: 'test', method: 'GET' as const, url: 'http://localhost/test' };

describe('postScriptFile - T-161', () => {
  it('executes script from file', async () => {
    const script = `reqly.setEnvVar('fileScriptRan', 'yes');`;
    fs.writeFileSync(path.join(tmpDir, 'post.js'), script);

    const env = { variables: {} as Record<string, string> };
    await execute({ ...baseReq, postScriptFile: 'post.js' }, env, undefined, true, 50000, {}, undefined, {}, tmpDir);
    expect(env.variables.fileScriptRan).toBe('yes');
  });

  it('executes preScriptFile before request fires', async () => {
    const script = `reqly.setEnvVar('preRan', 'yes');`;
    fs.writeFileSync(path.join(tmpDir, 'pre.js'), script);

    const env = { variables: {} as Record<string, string> };
    await execute({ ...baseReq, preScriptFile: 'pre.js' }, env, undefined, true, 50000, {}, undefined, {}, tmpDir);
    expect(env.variables.preRan).toBe('yes');
  });

  it('inline postScript wins over postScriptFile when both set', async () => {
    fs.writeFileSync(path.join(tmpDir, 'post.js'), `reqly.setEnvVar('source', 'file');`);

    const env = { variables: {} as Record<string, string> };
    const result = await execute(
      { ...baseReq, postScript: `reqly.setEnvVar('source', 'inline');`, postScriptFile: 'post.js' },
      env, undefined, true, 50000, {}, undefined, {}, tmpDir
    );
    expect(env.variables.source).toBe('inline');
    // Warning should be logged
    expect(result.consoleLogs?.some(l => l.includes('[warn]') && l.includes('postScript'))).toBe(true);
  });

  it('inline preScript wins over preScriptFile when both set', async () => {
    fs.writeFileSync(path.join(tmpDir, 'pre.js'), `reqly.setEnvVar('source', 'file');`);

    const env = { variables: {} as Record<string, string> };
    const result = await execute(
      { ...baseReq, preScript: `reqly.setEnvVar('source', 'inline');`, preScriptFile: 'pre.js' },
      env, undefined, true, 50000, {}, undefined, {}, tmpDir
    );
    expect(env.variables.source).toBe('inline');
    expect(result.consoleLogs?.some(l => l.includes('[warn]') && l.includes('preScript'))).toBe(true);
  });

  it('file not found returns clear error in consoleLogs', async () => {
    const env = { variables: {} as Record<string, string> };
    const result = await execute(
      { ...baseReq, postScriptFile: 'nonexistent.js' },
      env, undefined, true, 50000, {}, undefined, {}, tmpDir
    );
    expect(result.consoleLogs?.some(l => l.includes('[error]') && l.includes('nonexistent.js'))).toBe(true);
  });

  it('rejects path traversal outside collection folder', async () => {
    // Create a real file outside tmpDir to confirm it is NOT executed
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'evil.js'), `reqly.setEnvVar('pwned', 'yes');`);

    const env = { variables: {} as Record<string, string> };
    const result = await execute(
      { ...baseReq, postScriptFile: '../evil.js' },
      env, undefined, true, 50000, {}, undefined, {}, tmpDir
    );
    expect(env.variables.pwned).toBeUndefined();
    expect(result.consoleLogs?.some(l => l.includes('[error]') && l.includes('outside'))).toBe(true);

    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('nested path within collection folder is allowed', async () => {
    fs.mkdirSync(path.join(tmpDir, 'scripts'));
    fs.writeFileSync(path.join(tmpDir, 'scripts', 'post.js'), `reqly.setEnvVar('nested', 'ok');`);

    const env = { variables: {} as Record<string, string> };
    await execute(
      { ...baseReq, postScriptFile: 'scripts/post.js' },
      env, undefined, true, 50000, {}, undefined, {}, tmpDir
    );
    expect(env.variables.nested).toBe('ok');
  });
});
