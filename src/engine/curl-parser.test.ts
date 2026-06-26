import { describe, it, expect } from 'vitest';
import { parseCurl } from './curl-parser.js';

describe('parseCurl', () => {
  it('parses a simple GET with single-quoted URL', () => {
    const r = parseCurl("curl 'https://api.example.com/users'");
    expect(r.url).toBe('https://api.example.com/users');
    expect(r.method).toBe('GET');
    expect(r.headers).toEqual({});
    expect(r.body).toBeUndefined();
  });

  it('parses a simple GET with unquoted URL', () => {
    const r = parseCurl('curl https://api.example.com/users');
    expect(r.url).toBe('https://api.example.com/users');
    expect(r.method).toBe('GET');
  });

  it('parses explicit method via -X', () => {
    const r = parseCurl("curl -X DELETE 'https://api.example.com/users/1'");
    expect(r.method).toBe('DELETE');
  });

  it('parses explicit method via --request', () => {
    const r = parseCurl("curl --request PUT 'https://api.example.com/users/1'");
    expect(r.method).toBe('PUT');
  });

  it('parses a single header', () => {
    const r = parseCurl("curl -H 'Authorization: Bearer token123' 'https://api.example.com'");
    expect(r.headers['Authorization']).toBe('Bearer token123');
  });

  it('parses multiple headers', () => {
    const r = parseCurl(
      "curl -H 'Authorization: Bearer t' -H 'Content-Type: application/json' 'https://api.example.com'"
    );
    expect(r.headers['Authorization']).toBe('Bearer t');
    expect(r.headers['Content-Type']).toBe('application/json');
  });

  it('parses -d body and defaults method to POST', () => {
    const r = parseCurl(`curl -d '{"name":"John"}' 'https://api.example.com/users'`);
    expect(r.method).toBe('POST');
    expect(r.body).toBe('{"name":"John"}');
  });

  it('parses --data-raw body', () => {
    const r = parseCurl(`curl --data-raw 'hello=world' 'https://api.example.com'`);
    expect(r.body).toBe('hello=world');
    expect(r.method).toBe('POST');
  });

  it('does not override explicit method when body present', () => {
    const r = parseCurl(`curl -X PATCH -d '{}' 'https://api.example.com'`);
    expect(r.method).toBe('PATCH');
  });

  it('parses multiline curl with backslash continuation', () => {
    const cmd = [
      "curl -X POST 'https://api.example.com/users' \\",
      "  -H 'Content-Type: application/json' \\",
      "  -d '{\"name\":\"John\"}'",
    ].join('\n');
    const r = parseCurl(cmd);
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.example.com/users');
    expect(r.headers['Content-Type']).toBe('application/json');
    expect(r.body).toBe('{"name":"John"}');
  });

  it('parses -u basic auth into Authorization header', () => {
    const r = parseCurl("curl -u admin:secret 'https://api.example.com'");
    const expected = 'Basic ' + Buffer.from('admin:secret').toString('base64');
    expect(r.headers['Authorization']).toBe(expected);
  });

  it('ignores --compressed and other no-arg flags', () => {
    const r = parseCurl("curl --compressed -L -s 'https://api.example.com'");
    expect(r.url).toBe('https://api.example.com');
    expect(r.method).toBe('GET');
  });

  it('handles --url flag', () => {
    const r = parseCurl("curl --url 'https://api.example.com' -X GET");
    expect(r.url).toBe('https://api.example.com');
  });

  it('handles double-quoted strings', () => {
    const r = parseCurl('curl -H "Content-Type: application/json" "https://api.example.com"');
    expect(r.url).toBe('https://api.example.com');
    expect(r.headers['Content-Type']).toBe('application/json');
  });
});
