import { describe, it, expect, vi } from 'vitest';
import { handler } from './import-environment.js';
import type { EngineContext } from './types.js';

const postmanEnv = JSON.stringify({
  name: 'Dev',
  _postman_variable_scope: 'environment',
  values: [
    { key: 'baseUrl', value: 'https://dev.api.com', enabled: true },
    { key: 'token', value: 'dev-token', enabled: true },
  ],
});

function makeContext(): EngineContext {
  return {
    environmentManager: {
      importEnvironmentFromPostman: vi.fn().mockResolvedValue({
        id: 'env-1',
        name: 'Dev',
        variables: { baseUrl: 'https://dev.api.com', token: 'dev-token' },
      }),
    },
  } as unknown as EngineContext;
}

describe('import_environment tool', () => {
  it('imports a Postman environment and returns name + variable count', async () => {
    const ctx = makeContext();
    const result = await handler({ content: postmanEnv }, ctx);
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.name).toBe('Dev');
    expect(data.variableCount).toBe(2);
  });

  it('supports an optional nameOverride', async () => {
    const ctx = makeContext();
    await handler({ content: postmanEnv, nameOverride: 'Renamed' }, ctx);
    expect(ctx.environmentManager.importEnvironmentFromPostman).toHaveBeenCalledWith(postmanEnv, 'Renamed');
  });

  it('returns an error when import fails', async () => {
    const ctx = makeContext();
    (ctx.environmentManager.importEnvironmentFromPostman as any).mockRejectedValue(new Error('bad JSON'));
    const result = await handler({ content: 'bad' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('bad JSON');
  });
});
