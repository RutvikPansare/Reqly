import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));
vi.mock('../../engine/collection-manager.js', () => ({
  CollectionManager: vi.fn(function (this: any, dir: string) { this.baseDir = dir; }),
}));
vi.mock('../../engine/environment-manager.js', () => ({
  EnvironmentManager: vi.fn(function (this: any, p: string) { this.envPath = p; }),
}));
vi.mock('../../engine/flow-manager.js', () => ({
  FlowManager: vi.fn(function (this: any, dir: string) { this.flowDir = dir; }),
}));
vi.mock('../../engine/dotenv-loader.js', () => ({
  DotEnvLoader: vi.fn(function (this: any, dir: string, files: string[]) {
    this.dir = dir;
    this.files = files;
    this.load = vi.fn();
    this.watch = vi.fn();
  }),
}));
vi.mock('../../server/lock.js', () => ({
  readLock: vi.fn().mockResolvedValue({ port: 4242 }),
  writeLock: vi.fn(),
}));

import * as fs from 'fs/promises';
import { readLock, writeLock } from '../../server/lock.js';
import { definition, handler } from './switch-project.js';

function makeContext(overrides: any = {}) {
  return {
    dotEnvLoader: {
      stopWatching: vi.fn(),
    },
    authManager: {
      getDotenvFiles: vi.fn().mockResolvedValue(['.env']),
    },
    ...overrides,
  };
}

describe('switch_project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readLock as any).mockResolvedValue({ port: 4242 });
  });

  it('should have correct definition', () => {
    expect(definition.name).toBe('switch_project');
  });

  it('should switch project and reinitialise managers', async () => {
    (fs.access as any).mockResolvedValue(undefined);
    const context = makeContext();
    const res = await handler({ projectDir: '/Users/dev/other-project' }, context as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ ok: true, projectDir: '/Users/dev/other-project' });
    expect(context.collectionManager).toBeDefined();
    expect(context.environmentManager).toBeDefined();
    expect(context.flowManager).toBeDefined();
    expect(writeLock).toHaveBeenCalledWith('/Users/dev/other-project', 4242);
  });

  it('should return structured error if path does not exist', async () => {
    (fs.access as any).mockRejectedValue(new Error('ENOENT'));
    const context = makeContext();
    const res = await handler({ projectDir: '/nonexistent' }, context as any);
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/does not exist/);
  });

  it('should return structured error if projectDir missing', async () => {
    const context = makeContext();
    const res = await handler({}, context as any);
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.ok).toBe(false);
  });
});
