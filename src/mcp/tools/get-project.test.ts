import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './get-project.js';

describe('get_project', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('get_project');
  });

  it('should return the parent directory of the collection manager base dir', async () => {
    const context = {
      collectionManager: {
        getBaseDir: vi.fn().mockReturnValue('/Users/dev/myproject/.reqly'),
      },
    };
    const res = await handler({}, context as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ projectDir: '/Users/dev/myproject' });
  });
});
