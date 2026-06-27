import { describe, it, expect, vi } from 'vitest';
import { definition as setDef, handler as setHandler } from './set-dotenv-files.js';
import { definition as getDef, handler as getHandler } from './get-dotenv-files.js';

function makeContext(overrides: any = {}) {
  return {
    authManager: { setDotenvFiles: vi.fn().mockResolvedValue(undefined) },
    dotEnvLoader: {
      setFiles: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
      getFiles: vi.fn().mockReturnValue(['.env']),
      getVariables: vi.fn().mockReturnValue([]),
    },
    ...overrides,
  };
}

describe('set_dotenv_files', () => {
  it('should have correct definition', () => {
    expect(setDef.name).toBe('set_dotenv_files');
    expect(setDef.inputSchema.required).toEqual(['files']);
  });

  it('persists the file list, reloads, and returns per-file variable counts', async () => {
    const ctx = makeContext({
      dotEnvLoader: {
        setFiles: vi.fn(),
        load: vi.fn().mockResolvedValue(undefined),
        getFiles: vi.fn(),
        getVariables: vi.fn().mockReturnValue([
          { key: 'A', value: '1', source: '.env' },
          { key: 'B', value: '2', source: '.env.local' },
        ]),
      },
    });

    const res = await setHandler({ files: ['.env', '.env.local'] }, ctx as any);
    expect(ctx.authManager.setDotenvFiles).toHaveBeenCalledWith(['.env', '.env.local']);
    expect(ctx.dotEnvLoader.setFiles).toHaveBeenCalledWith(['.env', '.env.local']);
    expect(ctx.dotEnvLoader.load).toHaveBeenCalled();

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({ files: ['.env', '.env.local'], variableCounts: { '.env': 1, '.env.local': 1 } });
    expect(res.isError).toBeFalsy();
  });

  it('reports zero for a file with no resolved variables', async () => {
    const ctx = makeContext({
      dotEnvLoader: {
        setFiles: vi.fn(),
        load: vi.fn().mockResolvedValue(undefined),
        getFiles: vi.fn(),
        getVariables: vi.fn().mockReturnValue([]),
      },
    });
    const res = await setHandler({ files: ['.env'] }, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.variableCounts).toEqual({ '.env': 0 });
  });
});

describe('get_dotenv_files', () => {
  it('should have correct definition', () => {
    expect(getDef.name).toBe('get_dotenv_files');
  });

  it('returns the active file list and keys with source, omitting values', async () => {
    const ctx = makeContext({
      dotEnvLoader: {
        setFiles: vi.fn(),
        load: vi.fn(),
        getFiles: vi.fn().mockReturnValue(['.env', '.env.local']),
        getVariables: vi.fn().mockReturnValue([
          { key: 'API_SECRET', value: 'shh', source: '.env' },
          { key: 'TOKEN', value: 'topsecret', source: '.env.local' },
        ]),
      },
    });

    const res = await getHandler({}, ctx as any);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toEqual({
      files: ['.env', '.env.local'],
      variables: [{ key: 'API_SECRET', source: '.env' }, { key: 'TOKEN', source: '.env.local' }],
    });
    expect(JSON.stringify(parsed)).not.toContain('shh');
    expect(JSON.stringify(parsed)).not.toContain('topsecret');
  });
});
