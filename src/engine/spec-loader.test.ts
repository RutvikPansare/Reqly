import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SpecLoader } from './spec-loader.js';

const SPEC_V3 = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0.0' },
  paths: {
    '/users/{id}': {
      get: {
        operationId: 'getUser',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
  components: {
    parameters: {
      IdParam: { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    },
  },
};

describe('SpecLoader', () => {
  let tmpDir: string;
  let loader: SpecLoader;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-spec-test-'));
    loader = new SpecLoader();
  });

  afterEach(() => {
    loader.stopWatching();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads and dereferences a local JSON spec file', async () => {
    const specPath = path.join(tmpDir, 'openapi.json');
    fs.writeFileSync(specPath, JSON.stringify(SPEC_V3));

    const spec = await loader.load(specPath);
    expect(spec.paths['/users/{id}'].get.operationId).toBe('getUser');
    // $ref should be resolved inline after dereferencing.
    expect(spec.paths['/users/{id}'].get.parameters[0].name).toBe('id');
  });

  it('caches the parsed spec by path', async () => {
    const specPath = path.join(tmpDir, 'openapi.json');
    fs.writeFileSync(specPath, JSON.stringify(SPEC_V3));

    const first = await loader.load(specPath);
    const second = await loader.load(specPath);
    expect(second).toBe(first);
  });

  it('reload() forces a re-parse and picks up file changes', async () => {
    const specPath = path.join(tmpDir, 'openapi.json');
    fs.writeFileSync(specPath, JSON.stringify(SPEC_V3));
    await loader.load(specPath);

    const changed = JSON.parse(JSON.stringify(SPEC_V3));
    changed.paths['/users/{id}'].get.operationId = 'fetchUser';
    fs.writeFileSync(specPath, JSON.stringify(changed));

    const reloaded = await loader.reload(specPath);
    expect(reloaded.paths['/users/{id}'].get.operationId).toBe('fetchUser');
  });

  it('throws a helpful error for a missing file', async () => {
    await expect(loader.load(path.join(tmpDir, 'nope.json'))).rejects.toThrow();
  });

  it('get() returns the cached spec without reloading, or undefined if not loaded', async () => {
    const specPath = path.join(tmpDir, 'openapi.json');
    fs.writeFileSync(specPath, JSON.stringify(SPEC_V3));
    expect(loader.get(specPath)).toBeUndefined();
    await loader.load(specPath);
    expect(loader.get(specPath)?.paths['/users/{id}'].get.operationId).toBe('getUser');
  });
});
