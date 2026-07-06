import { describe, it, expect } from 'vitest';
import { generateCode } from './code-generator.js';

const base = { method: 'GET', url: 'https://api.example.com/users', headers: {} };

describe('generateCode - curl', () => {
  it('generates a simple GET', () => {
    const code = generateCode(base, 'curl');
    expect(code).toContain("curl 'https://api.example.com/users'");
    expect(code).not.toContain('-X GET');
  });

  it('includes -X for non-GET methods', () => {
    const code = generateCode({ ...base, method: 'POST' }, 'curl');
    expect(code).toContain('-X POST');
  });

  it('includes -H for each header', () => {
    const code = generateCode({ ...base, headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' } }, 'curl');
    expect(code).toContain("-H 'Authorization: Bearer tok'");
    expect(code).toContain("-H 'Content-Type: application/json'");
  });

  it('includes --data-raw for body string', () => {
    const code = generateCode({ ...base, method: 'POST', body: '{"name":"John"}' }, 'curl');
    expect(code).toContain("--data-raw '{\"name\":\"John\"}'");
  });

  it('serializes body object as JSON', () => {
    const code = generateCode({ ...base, method: 'POST', body: { name: 'John' } as any }, 'curl');
    expect(code).toContain('--data-raw');
    expect(code).toContain('"name"');
  });

  // Regression: values containing single quotes used to break out of the
  // shell quoting and produce an unrunnable (or dangerous) snippet.
  it('escapes single quotes in the body for the shell', () => {
    const code = generateCode({ ...base, method: 'POST', body: '{"name":"O\'Brien"}' }, 'curl');
    expect(code).toContain(String.raw`O'\''Brien`);
  });

  it('escapes single quotes in the url and headers for the shell', () => {
    const code = generateCode(
      { ...base, url: "https://api.example.com/o'brien", headers: { 'X-Note': "it's fine" } },
      'curl',
    );
    expect(code).toContain(String.raw`o'\''brien`);
    expect(code).toContain(String.raw`it'\''s fine`);
  });
});

describe('generateCode - fetch', () => {
  it('generates a basic fetch call', () => {
    const code = generateCode(base, 'fetch');
    expect(code).toContain("fetch('https://api.example.com/users'");
    expect(code).toContain('await response.json()');
  });

  it('includes method for non-GET', () => {
    const code = generateCode({ ...base, method: 'DELETE' }, 'fetch');
    expect(code).toContain("method: 'DELETE'");
  });

  it('omits method key for GET', () => {
    const code = generateCode(base, 'fetch');
    expect(code).not.toContain("method:");
  });

  it('includes headers object when headers present', () => {
    const code = generateCode({ ...base, headers: { 'X-Key': 'value' } }, 'fetch');
    expect(code).toContain("headers:");
    expect(code).toContain("'X-Key': 'value'");
  });

  it('includes body for POST', () => {
    const code = generateCode({ ...base, method: 'POST', body: '{}' }, 'fetch');
    expect(code).toContain("body:");
  });

  // Regression: quotes/backslashes/newlines in values used to produce
  // syntactically broken JS string literals.
  it('escapes single quotes and newlines in JS string literals', () => {
    const code = generateCode(
      { ...base, method: 'POST', headers: { 'X-Note': "it's" }, body: "line1\nit's raw" },
      'fetch',
    );
    expect(code).toContain(String.raw`'X-Note': 'it\'s'`);
    expect(code).toContain(String.raw`body: 'line1\nit\'s raw'`);
  });
});

describe('generateCode - axios', () => {
  it('generates an axios call', () => {
    const code = generateCode(base, 'axios');
    expect(code).toContain('axios(');
    expect(code).toContain("url: 'https://api.example.com/users'");
  });

  it('includes method', () => {
    const code = generateCode({ ...base, method: 'PATCH' }, 'axios');
    expect(code).toContain("method: 'PATCH'");
  });

  it('includes data for body', () => {
    const code = generateCode({ ...base, method: 'POST', body: '{"x":1}' }, 'axios');
    expect(code).toContain('data:');
  });

  it('includes headers', () => {
    const code = generateCode({ ...base, headers: { Accept: 'application/json' } }, 'axios');
    expect(code).toContain("headers:");
    expect(code).toContain("'Accept': 'application/json'");
  });

  it('escapes single quotes in string values', () => {
    const code = generateCode({ ...base, method: 'POST', body: "not'json" }, 'axios');
    expect(code).toContain(String.raw`data: 'not\'json'`);
  });
});
