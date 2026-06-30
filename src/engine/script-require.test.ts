import { describe, it, expect } from 'vitest';
import { runScript } from './script-runner';

const ctx = () => ({ env: {}, request: {}, response: undefined });

describe('require() in scripts - T-155', () => {
  it('allows require("crypto") and can use createHmac', () => {
    const result = runScript(
      `const { createHmac } = require('crypto');
       const sig = createHmac('sha256', 'secret').update('data').digest('hex');
       reqly.setEnvVar('sig', sig);`,
      ctx()
    );
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
  });

  it('allows require("buffer")', () => {
    const result = runScript(
      `const { Buffer } = require('buffer');
       const b = Buffer.from('hello').toString('base64');
       reqly.setEnvVar('b64', b);`,
      ctx()
    );
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
  });

  it('allows require("path")', () => {
    const result = runScript(
      `const path = require('path');
       const joined = path.join('a', 'b');
       reqly.setEnvVar('p', joined);`,
      ctx()
    );
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
  });

  it('allows require("url")', () => {
    const result = runScript(
      `const { URL } = require('url');
       const u = new URL('https://example.com');
       reqly.setEnvVar('host', u.host);`,
      ctx()
    );
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
  });

  it('allows require("querystring")', () => {
    const result = runScript(
      `const qs = require('querystring');
       const s = qs.stringify({ a: '1' });
       reqly.setEnvVar('qs', s);`,
      ctx()
    );
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
  });

  it('allows require("util")', () => {
    const result = runScript(
      `const util = require('util');
       const s = util.format('%s=%d', 'x', 1);
       reqly.setEnvVar('u', s);`,
      ctx()
    );
    expect(result.consoleLogs.some(l => l.includes('[error]'))).toBe(false);
  });

  it('throws clear error for require("fs")', () => {
    const result = runScript(`require('fs');`, ctx());
    expect(result.consoleLogs.some(l =>
      l.includes("require('fs') is not allowed in Reqly scripts. Allowed modules: crypto, buffer, path, url, querystring, util")
    )).toBe(true);
  });

  it('throws clear error for require("axios")', () => {
    const result = runScript(`require('axios');`, ctx());
    expect(result.consoleLogs.some(l =>
      l.includes("require('axios') is not allowed in Reqly scripts. Allowed modules: crypto, buffer, path, url, querystring, util")
    )).toBe(true);
  });

  it('throws clear error for require("child_process")', () => {
    const result = runScript(`require('child_process');`, ctx());
    expect(result.consoleLogs.some(l =>
      l.includes("require('child_process') is not allowed in Reqly scripts.")
    )).toBe(true);
  });
});
