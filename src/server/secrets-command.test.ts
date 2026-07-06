import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleSecretsCommand } from './secrets-command.js';
import { SecretProviderRegistry } from '../engine/secret-providers/index.js';

function makeRegistry() {
  const registry = new SecretProviderRegistry();
  registry.register({ prefix: 'bw://', resolve: async (uri: string) => `plain(${uri})` });
  return registry;
}

describe('reqly secrets resolve', () => {
  let tmpDir: string;
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-secrets-cmd-'));
    logs = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: any[]) => { logs.push(args.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...args: any[]) => { errors.push(args.join(' ')); });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes resolved vault values to .env.local without touching .env', async () => {
    const envContent = 'STRIPE=bw://p/stripe\nPLAIN=keep\n';
    fs.writeFileSync(path.join(tmpDir, '.env'), envContent);

    const code = await handleSecretsCommand('resolve', tmpDir, ['.env'], makeRegistry());
    expect(code).toBe(0);

    expect(fs.readFileSync(path.join(tmpDir, '.env'), 'utf8')).toBe(envContent);
    const local = fs.readFileSync(path.join(tmpDir, '.env.local'), 'utf8');
    expect(local).toContain('STRIPE=plain(bw://p/stripe)');
    expect(local).not.toContain('PLAIN=');
  });

  it('preserves unrelated keys already present in .env.local', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'STRIPE=bw://p/stripe\n');
    fs.writeFileSync(path.join(tmpDir, '.env.local'), 'MY_OWN=untouched\nSTRIPE=stale\n');

    await handleSecretsCommand('resolve', tmpDir, ['.env'], makeRegistry());

    const local = fs.readFileSync(path.join(tmpDir, '.env.local'), 'utf8');
    expect(local).toContain('MY_OWN=untouched');
    expect(local).toContain('STRIPE=plain(bw://p/stripe)');
    expect(local).not.toContain('STRIPE=stale');
  });

  it('exits 1 and reports each failure when a provider is not configured', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'BAD=op://v/i/f\n');
    const code = await handleSecretsCommand('resolve', tmpDir, ['.env'], makeRegistry());
    expect(code).toBe(1);
    expect(errors.join('\n')).toMatch(/BAD/);
    expect(errors.join('\n')).toMatch(/not configured/i);
  });

  it('exits 0 with a message when .env has no vault URIs', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'PLAIN=x\n');
    const code = await handleSecretsCommand('resolve', tmpDir, ['.env'], makeRegistry());
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, '.env.local'))).toBe(false);
    expect(logs.join('\n')).toMatch(/no vault uris/i);
  });

  it('rejects unknown subcommands with usage help', async () => {
    const code = await handleSecretsCommand('frobnicate', tmpDir, ['.env'], makeRegistry());
    expect(code).toBe(1);
    expect(errors.join('\n')).toMatch(/usage: reqly secrets resolve/i);
  });
});
