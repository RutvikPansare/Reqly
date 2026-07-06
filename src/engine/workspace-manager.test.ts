import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { load } from 'js-yaml';
import { WorkspaceManager, WorkspaceNotFoundError } from './workspace-manager.js';

let tmpRoot: string;
let workspacesDir: string;
let configPath: string;
let repoA: string;
let repoB: string;
let manager: WorkspaceManager;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-ws-'));
  workspacesDir = path.join(tmpRoot, 'workspaces');
  configPath = path.join(tmpRoot, 'config.json');
  repoA = path.join(tmpRoot, 'auth-service');
  repoB = path.join(tmpRoot, 'payments-service');
  await fs.mkdir(path.join(repoA, '.reqly'), { recursive: true });
  await fs.mkdir(path.join(repoB, '.reqly'), { recursive: true });
  manager = new WorkspaceManager(workspacesDir, configPath);
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('WorkspaceManager.createWorkspace', () => {
  it('scaffolds <name>/workspace.yaml with an empty repos list', async () => {
    const ws = await manager.createWorkspace('checkout-team');
    expect(ws).toEqual({ name: 'checkout-team', repos: [] });
    const file = path.join(workspacesDir, 'checkout-team', 'workspace.yaml');
    expect(existsSync(file)).toBe(true);
    const parsed = load(await fs.readFile(file, 'utf8')) as any;
    expect(parsed.name).toBe('checkout-team');
    expect(parsed.repos).toEqual([]);
  });

  it('rejects a duplicate workspace name', async () => {
    await manager.createWorkspace('team');
    await expect(manager.createWorkspace('team')).rejects.toThrow(/already exists/);
  });

  it('rejects names with path separators or empty names', async () => {
    await expect(manager.createWorkspace('../evil')).rejects.toThrow(/name/i);
    await expect(manager.createWorkspace('a/b')).rejects.toThrow(/name/i);
    await expect(manager.createWorkspace('')).rejects.toThrow(/name/i);
  });
});

describe('WorkspaceManager.linkRepo', () => {
  it('adds a repo entry with alias and absolute path', async () => {
    await manager.createWorkspace('team');
    const ws = await manager.linkRepo('team', 'auth', repoA);
    expect(ws.repos).toEqual([{ alias: 'auth', path: repoA }]);
  });

  it('upserts when the alias already exists', async () => {
    await manager.createWorkspace('team');
    await manager.linkRepo('team', 'auth', repoA);
    const ws = await manager.linkRepo('team', 'auth', repoB);
    expect(ws.repos).toEqual([{ alias: 'auth', path: repoB }]);
  });

  it('throws WorkspaceNotFoundError for an unknown workspace', async () => {
    await expect(manager.linkRepo('nope', 'auth', repoA)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  it('rejects a path that does not exist', async () => {
    await manager.createWorkspace('team');
    await expect(manager.linkRepo('team', 'auth', path.join(tmpRoot, 'missing'))).rejects.toThrow(/does not exist/);
  });
});

describe('WorkspaceManager.unlinkRepo', () => {
  it('removes the repo entry by alias', async () => {
    await manager.createWorkspace('team');
    await manager.linkRepo('team', 'auth', repoA);
    await manager.linkRepo('team', 'payments', repoB);
    const ws = await manager.unlinkRepo('team', 'auth');
    expect(ws.repos).toEqual([{ alias: 'payments', path: repoB }]);
  });
});

describe('WorkspaceManager.getWorkspace / listWorkspaces', () => {
  it('round-trips sharedEnv', async () => {
    await manager.createWorkspace('team');
    await manager.setSharedEnv('team', { STAGING_BASE_URL: 'https://staging.example.com' });
    const ws = await manager.getWorkspace('team');
    expect(ws.sharedEnv).toEqual({ STAGING_BASE_URL: 'https://staging.example.com' });
  });

  it('getWorkspace throws WorkspaceNotFoundError when missing', async () => {
    await expect(manager.getWorkspace('ghost')).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  it('listWorkspaces returns all workspaces, empty array when none', async () => {
    expect(await manager.listWorkspaces()).toEqual([]);
    await manager.createWorkspace('one');
    await manager.createWorkspace('two');
    const names = (await manager.listWorkspaces()).map(w => w.name).sort();
    expect(names).toEqual(['one', 'two']);
  });
});

describe('WorkspaceManager.useWorkspace / getActiveWorkspace', () => {
  it('persists activeWorkspace in the global config file', async () => {
    await manager.createWorkspace('team');
    await manager.useWorkspace('team');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(config.activeWorkspace).toBe('team');
  });

  it('preserves other config keys when setting activeWorkspace', async () => {
    await fs.writeFile(configPath, JSON.stringify({ activeProject: '/some/path' }));
    await manager.createWorkspace('team');
    await manager.useWorkspace('team');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(config.activeProject).toBe('/some/path');
    expect(config.activeWorkspace).toBe('team');
  });

  it('rejects using a workspace that does not exist', async () => {
    await expect(manager.useWorkspace('ghost')).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  it('getActiveWorkspace returns the active workspace config, or undefined', async () => {
    expect(await manager.getActiveWorkspace()).toBeUndefined();
    await manager.createWorkspace('team');
    await manager.useWorkspace('team');
    expect((await manager.getActiveWorkspace())?.name).toBe('team');
  });

  it('clearActiveWorkspace removes the pointer', async () => {
    await manager.createWorkspace('team');
    await manager.useWorkspace('team');
    await manager.clearActiveWorkspace();
    expect(await manager.getActiveWorkspace()).toBeUndefined();
  });
});

describe('WorkspaceManager.resolveRepoPath', () => {
  it('resolves an alias to its linked path in the named workspace', async () => {
    await manager.createWorkspace('team');
    await manager.linkRepo('team', 'auth', repoA);
    expect(await manager.resolveRepoPath('team', 'auth')).toBe(repoA);
  });

  it('throws for an unknown alias, listing available aliases', async () => {
    await manager.createWorkspace('team');
    await manager.linkRepo('team', 'auth', repoA);
    await expect(manager.resolveRepoPath('team', 'ghost')).rejects.toThrow(/auth/);
  });
});
