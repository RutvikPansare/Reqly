import { describe, it, expect } from 'vitest';
import { handler, definition } from './generate-code.js';

describe('generate_code tool', () => {
  it('has a name and description', () => {
    expect(definition.name).toBe('generate_code');
    expect(definition.description.length).toBeGreaterThan(20);
  });

  it('generates a cURL snippet', async () => {
    const result = await handler({ method: 'GET', url: 'https://api.example.com/users', target: 'curl' }, {} as any);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toContain('curl');
    expect(parsed.code).toContain('https://api.example.com/users');
  });

  it('generates a fetch snippet', async () => {
    const result = await handler({ method: 'POST', url: 'https://api.example.com/users', target: 'fetch', body: '{"name":"Alice"}' }, {} as any);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toContain('fetch');
    expect(parsed.code).toContain('POST');
  });

  it('generates an axios snippet', async () => {
    const result = await handler({ method: 'GET', url: 'https://api.example.com', target: 'axios' }, {} as any);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toContain('axios');
  });

  it('returns an error for an invalid target', async () => {
    const result = await handler({ method: 'GET', url: 'https://api.example.com', target: 'invalid' }, {} as any);
    expect(result.isError).toBe(true);
  });
});
