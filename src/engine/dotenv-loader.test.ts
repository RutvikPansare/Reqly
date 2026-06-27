import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DotEnvLoader } from './dotenv-loader.js';

describe('DotEnvLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-dotenv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads variables from a single .env file', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'API_KEY=secret123\nBASE_URL=https://api.x.com\n');
    const loader = new DotEnvLoader(tmpDir, ['.env']);
    await loader.load();

    const vars = loader.getVariables();
    expect(vars).toEqual(
      expect.arrayContaining([
        { key: 'API_KEY', value: 'secret123', source: '.env' },
        { key: 'BASE_URL', value: 'https://api.x.com', source: '.env' },
      ])
    );
  });

  it('silently skips a missing file with no error', async () => {
    const loader = new DotEnvLoader(tmpDir, ['.env']);
    await expect(loader.load()).resolves.not.toThrow();
    expect(loader.getVariables()).toEqual([]);
  });

  it('later files win on key collision', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'API_KEY=base\nSHARED=fromBase\n');
    fs.writeFileSync(path.join(tmpDir, '.env.local'), 'SHARED=fromLocal\n');
    const loader = new DotEnvLoader(tmpDir, ['.env', '.env.local']);
    await loader.load();

    const record = loader.getVariablesRecord();
    expect(record).toEqual({ API_KEY: 'base', SHARED: 'fromLocal' });

    const shared = loader.getVariables().find(v => v.key === 'SHARED');
    expect(shared?.source).toBe('.env.local');
  });

  it('re-running load() picks up file changes (hot-reload semantics)', async () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'TOKEN=old\n');
    const loader = new DotEnvLoader(tmpDir, ['.env']);
    await loader.load();
    expect(loader.getVariablesRecord().TOKEN).toBe('old');

    fs.writeFileSync(envPath, 'TOKEN=new\n');
    await loader.load();
    expect(loader.getVariablesRecord().TOKEN).toBe('new');
  });

  it('getVariablesRecord returns an empty object when no files exist', async () => {
    const loader = new DotEnvLoader(tmpDir, ['.env', '.env.local']);
    await loader.load();
    expect(loader.getVariablesRecord()).toEqual({});
  });

  it('defaults to loading .env when no files are specified', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'X=1\n');
    const loader = new DotEnvLoader(tmpDir);
    await loader.load();
    expect(loader.getVariablesRecord()).toEqual({ X: '1' });
  });

  it('setFiles changes the active file list for the next load()', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'A=1\n');
    fs.writeFileSync(path.join(tmpDir, '.env.local'), 'B=2\n');
    const loader = new DotEnvLoader(tmpDir, ['.env']);
    await loader.load();
    expect(loader.getVariablesRecord()).toEqual({ A: '1' });

    loader.setFiles(['.env', '.env.local']);
    await loader.load();
    expect(loader.getVariablesRecord()).toEqual({ A: '1', B: '2' });
  });

  it('getFiles returns the current active file list', () => {
    const loader = new DotEnvLoader(tmpDir, ['.env', '.env.local']);
    expect(loader.getFiles()).toEqual(['.env', '.env.local']);
  });
});
