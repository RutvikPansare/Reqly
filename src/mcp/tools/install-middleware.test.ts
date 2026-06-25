import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handler } from './install-middleware.js';
import { CollectionManager } from '../../engine/collection-manager.js';
import { EngineContext } from './types.js';

function buildContext(projectRoot: string): EngineContext {
  const collectionsDir = path.join(projectRoot, '.reqly');
  return {
    collectionManager: new CollectionManager(collectionsDir),
  } as EngineContext;
}

function writePackageJson(projectRoot: string, deps: Record<string, string>) {
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ dependencies: deps }));
}

describe('install_middleware', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-install-mw-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects Next.js and returns the next-specific snippet', async () => {
    writePackageJson(tmpDir, { next: '^14.0.0' });
    const result = await handler({}, buildContext(tmpDir));
    const body = JSON.parse(result.content[0].text);

    expect(body.framework).toBe('next');
    expect(body.installCommand).toBe('npm install reqly-middleware');
    expect(body.snippet).toContain('reqlyNextMiddleware');
    expect(body.file).toBe('middleware.ts');
  });

  it('detects Express', async () => {
    writePackageJson(tmpDir, { express: '^5.0.0' });
    const result = await handler({}, buildContext(tmpDir));
    const body = JSON.parse(result.content[0].text);

    expect(body.framework).toBe('express');
    expect(body.snippet).toContain('reqlyMiddleware');
    expect(body.snippet).not.toContain('reqlyNextMiddleware');
  });

  it('detects Fastify', async () => {
    writePackageJson(tmpDir, { fastify: '^4.0.0' });
    const result = await handler({}, buildContext(tmpDir));
    const body = JSON.parse(result.content[0].text);

    expect(body.framework).toBe('fastify');
    expect(body.snippet).toContain('reqlyMiddlewareHook');
  });

  it('returns an error when no supported framework is found', async () => {
    writePackageJson(tmpDir, { lodash: '^4.0.0' });
    const result = await handler({}, buildContext(tmpDir));

    expect(result.isError).toBe(true);
  });
});
