import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DotEnvLoader } from './dotenv-loader.js';
import { SecretProviderRegistry } from './secret-providers/index.js';

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

  describe('vault secret resolution (T-245)', () => {
    function makeRegistry() {
      const registry = new SecretProviderRegistry();
      registry.register({ prefix: 'bw://', resolve: async (uri: string) => `resolved(${uri})` });
      return registry;
    }

    it('plain values pass through untouched when a registry is attached', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'BASE_URL=https://api.x.com\nTOKEN=plain123\n');
      const loader = new DotEnvLoader(tmpDir, ['.env'], makeRegistry());
      await loader.load();
      expect(loader.getVariablesRecord()).toEqual({ BASE_URL: 'https://api.x.com', TOKEN: 'plain123' });
      expect(loader.getSecretErrors()).toEqual([]);
    });

    it('resolves a known vault URI through the registry into the variables record', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'STRIPE_KEY=bw://proj/stripe\nPLAIN=x\n');
      const loader = new DotEnvLoader(tmpDir, ['.env'], makeRegistry());
      await loader.load();
      expect(loader.getVariablesRecord()).toEqual({ STRIPE_KEY: 'resolved(bw://proj/stripe)', PLAIN: 'x' });
    });

    it('masks resolved secret values in getVariables() but keeps the full value in the record', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'STRIPE_KEY=bw://proj/stripe\n');
      const loader = new DotEnvLoader(tmpDir, ['.env'], makeRegistry());
      await loader.load();
      const entry = loader.getVariables().find(v => v.key === 'STRIPE_KEY');
      expect(entry?.value).toBe('reso...');
      expect(entry?.secret).toBe(true);
      expect(loader.getVariablesRecord().STRIPE_KEY).toBe('resolved(bw://proj/stripe)');
    });

    it('records an error and excludes the key from the record when the provider is not configured', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'OP_KEY=op://vault/item/field\nPLAIN=x\n');
      const loader = new DotEnvLoader(tmpDir, ['.env'], makeRegistry());
      await loader.load();
      expect(loader.getVariablesRecord()).toEqual({ PLAIN: 'x' });
      const errors = loader.getSecretErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].key).toBe('OP_KEY');
      expect(errors[0].uri).toBe('op://vault/item/field');
      expect(errors[0].error).toMatch(/not configured/i);
    });

    it('getSecretStatus lists every vault URI with its resolution state', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'GOOD=bw://p/s\nBAD=op://v/i/f\nPLAIN=x\n');
      const loader = new DotEnvLoader(tmpDir, ['.env'], makeRegistry());
      await loader.load();
      const status = loader.getSecretStatus();
      expect(status).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'GOOD', uri: 'bw://p/s', status: 'resolved', source: '.env' }),
          expect.objectContaining({ key: 'BAD', uri: 'op://v/i/f', status: 'error', error: expect.stringMatching(/not configured/i) }),
        ])
      );
      expect(status).toHaveLength(2);
    });

    it('resolves each distinct URI only once per load', async () => {
      const resolve = vi.fn().mockResolvedValue('val');
      const registry = new SecretProviderRegistry();
      registry.register({ prefix: 'bw://', resolve });
      fs.writeFileSync(path.join(tmpDir, '.env'), 'A=bw://p/same\nB=bw://p/same\nC=bw://p/other\n');
      const loader = new DotEnvLoader(tmpDir, ['.env'], registry);
      await loader.load();
      expect(resolve).toHaveBeenCalledTimes(2);
    });

    it('works exactly as before when no registry is attached (vault URIs stay literal)', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'STRIPE_KEY=bw://proj/stripe\n');
      const loader = new DotEnvLoader(tmpDir, ['.env']);
      await loader.load();
      expect(loader.getVariablesRecord()).toEqual({ STRIPE_KEY: 'bw://proj/stripe' });
      expect(loader.getSecretErrors()).toEqual([]);
    });
  });

  it('watch() picks up file changes via chokidar and reloads', async () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'TOKEN=old\n');
    const loader = new DotEnvLoader(tmpDir, ['.env']);
    await loader.load();

    let changeCount = 0;
    loader.watch(() => { changeCount++; });

    try {
      await vi.waitFor(() => {
        fs.writeFileSync(envPath, 'TOKEN=new\n');
        if (changeCount === 0) throw new Error('not yet');
      }, { timeout: 5000, interval: 100 });

      await vi.waitFor(() => {
        if (loader.getVariablesRecord().TOKEN !== 'new') throw new Error('not yet');
      }, { timeout: 2000, interval: 50 });
    } finally {
      loader.stopWatching();
    }
  });
});
