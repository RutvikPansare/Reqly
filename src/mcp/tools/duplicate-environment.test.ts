import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './duplicate-environment.js';

describe('duplicate_environment', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('duplicate_environment');
    expect(definition.inputSchema.required).toEqual(['name']);
  });

  it('should duplicate an environment and return the copy', async () => {
    const context = {
      environmentManager: {
        duplicateEnvironment: vi.fn().mockResolvedValue({ id: 'env-1', name: 'Copy of dev', variables: { host: 'localhost' } }),
      },
    };
    const res = await handler({ name: 'dev' }, context as any);
    expect(context.environmentManager.duplicateEnvironment).toHaveBeenCalledWith('dev');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ id: 'env-1', name: 'Copy of dev', variables: { host: 'localhost' } });
  });

  it('should return a structured error when the source environment is missing', async () => {
    const context = {
      environmentManager: {
        duplicateEnvironment: vi.fn().mockRejectedValue(new Error('Environment missing not found')),
      },
    };
    const res = await handler({ name: 'missing' }, context as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/);
  });
});
