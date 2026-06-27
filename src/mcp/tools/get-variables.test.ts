import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './get-variables.js';

function makeContext(overrides: any = {}) {
  return {
    environmentManager: {
      getEnvironment: vi.fn(),
      getActiveEnvironment: vi.fn(),
    },
    dotEnvLoader: {
      getVariables: vi.fn().mockReturnValue([]),
    },
    ...overrides,
  };
}

describe('get_variables', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('get_variables');
  });

  it('should get variables from named env, tagged with the env name as source', async () => {
    const mockContext = makeContext({
      environmentManager: {
        getEnvironment: vi.fn().mockResolvedValue({ name: 'dev', variables: { key1: 'val1', key2: 'val2' } }),
        getActiveEnvironment: vi.fn(),
      },
    });
    const res = await handler({ environment: 'dev' }, mockContext as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([
      { key: 'key1', value: 'val1', source: 'dev' },
      { key: 'key2', value: 'val2', source: 'dev' },
    ]);
    expect(mockContext.environmentManager.getEnvironment).toHaveBeenCalledWith('dev');
  });

  it('should get variables from active env if none specified', async () => {
    const mockContext = makeContext({
      environmentManager: {
        getActiveEnvironment: vi.fn().mockResolvedValue({ name: 'prod', variables: { key3: 'val3' } }),
        getEnvironment: vi.fn(),
      },
    });
    const res = await handler({}, mockContext as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([{ key: 'key3', value: 'val3', source: 'prod' }]);
    expect(mockContext.environmentManager.getActiveEnvironment).toHaveBeenCalled();
  });

  it('appends dotenv-sourced keys with the filename as source', async () => {
    const mockContext = makeContext({
      environmentManager: {
        getActiveEnvironment: vi.fn().mockResolvedValue({ name: 'prod', variables: { key3: 'val3' } }),
        getEnvironment: vi.fn(),
      },
      dotEnvLoader: {
        getVariables: vi.fn().mockReturnValue([{ key: 'API_SECRET', value: 'shh', source: '.env' }]),
      },
    });
    const res = await handler({}, mockContext as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual([
      { key: 'key3', value: 'val3', source: 'prod' },
      { key: 'API_SECRET', value: 'shh', source: '.env' },
    ]);
  });
});
