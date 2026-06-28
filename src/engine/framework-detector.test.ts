import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { detectFramework } from './framework-detector.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('detectFramework', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('detects Next.js from dependencies', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ dependencies: { next: '14.0.0' } }));
    expect(await detectFramework('/project')).toBe('Next.js');
  });

  it('detects NestJS from dependencies', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ dependencies: { '@nestjs/core': '10.0.0' } }));
    expect(await detectFramework('/project')).toBe('NestJS');
  });

  it('detects Fastify from devDependencies', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ devDependencies: { fastify: '4.0.0' } }));
    expect(await detectFramework('/project')).toBe('Fastify');
  });

  it('detects Express', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ dependencies: { express: '4.0.0' } }));
    expect(await detectFramework('/project')).toBe('Express');
  });

  it('detects Hapi', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ dependencies: { '@hapi/hapi': '21.0.0' } }));
    expect(await detectFramework('/project')).toBe('Hapi');
  });

  it('detects Koa', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ dependencies: { koa: '2.0.0' } }));
    expect(await detectFramework('/project')).toBe('Koa');
  });

  it('returns the first match in priority order when multiple frameworks present', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ dependencies: { express: '4.0.0', next: '14.0.0' } }));
    expect(await detectFramework('/project')).toBe('Next.js');
  });

  it('returns null for unknown deps', async () => {
    (fs.readFile as any).mockResolvedValue(JSON.stringify({ dependencies: { react: '18.0.0' } }));
    expect(await detectFramework('/project')).toBeNull();
  });

  it('returns null when package.json is missing', async () => {
    (fs.readFile as any).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await detectFramework('/project')).toBeNull();
  });

  it('returns null on malformed package.json instead of throwing', async () => {
    (fs.readFile as any).mockResolvedValue('not json');
    expect(await detectFramework('/project')).toBeNull();
  });
});
