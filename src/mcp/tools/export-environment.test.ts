import { describe, it, expect, vi } from 'vitest';
import { handler } from './export-environment.js';
import type { EngineContext } from './types.js';

const postmanJson = JSON.stringify({
  id: 'env-1',
  name: 'Production',
  values: [
    { key: 'host', value: 'prod.api.com', enabled: true, type: 'default' },
  ],
  _postman_variable_scope: 'environment',
  _exporter_id: 'reqly',
}, null, 2);

function makeContext(exportFn = vi.fn().mockResolvedValue(postmanJson)): EngineContext {
  return {
    environmentManager: {
      exportEnvironmentToPostman: exportFn,
    },
  } as unknown as EngineContext;
}

describe('export_environment tool', () => {
  it('exports the named environment and returns the JSON content', async () => {
    const ctx = makeContext();
    const result = await handler({ name: 'Production' }, ctx);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.name).toBe('Production');
    const parsed = JSON.parse(data.content);
    expect(parsed.name).toBe('Production');
    expect(parsed._postman_variable_scope).toBe('environment');
  });

  it('returns error when environment not found', async () => {
    const ctx = makeContext(vi.fn().mockRejectedValue(new Error('not found')));
    const result = await handler({ name: 'Missing' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
