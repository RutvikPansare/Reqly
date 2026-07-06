import { describe, it, expect, vi } from 'vitest';
import * as createWorkspace from './create-workspace.js';
import * as linkWorkspaceRepo from './link-workspace-repo.js';
import * as useWorkspace from './use-workspace.js';
import * as listWorkspaces from './list-workspaces.js';

function contextWith(workspaceManager: Record<string, unknown>) {
  return { workspaceManager } as any;
}

describe('create_workspace', () => {
  it('has the correct definition', () => {
    expect(createWorkspace.definition.name).toBe('create_workspace');
    expect(createWorkspace.definition.inputSchema.required).toEqual(['name']);
    expect(createWorkspace.definition.description.length).toBeGreaterThan(20);
  });

  it('creates a workspace and returns its config', async () => {
    const ctx = contextWith({
      createWorkspace: vi.fn().mockResolvedValue({ name: 'team', repos: [] }),
    });
    const res = await createWorkspace.handler({ name: 'team' }, ctx);
    expect(ctx.workspaceManager.createWorkspace).toHaveBeenCalledWith('team');
    expect(JSON.parse(res.content[0].text)).toEqual({ name: 'team', repos: [] });
  });

  it('returns isError on duplicate names', async () => {
    const ctx = contextWith({
      createWorkspace: vi.fn().mockRejectedValue(new Error('Workspace "team" already exists')),
    });
    const res = await createWorkspace.handler({ name: 'team' }, ctx);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/already exists/);
  });
});

describe('link_workspace_repo', () => {
  it('has the correct definition', () => {
    expect(linkWorkspaceRepo.definition.name).toBe('link_workspace_repo');
    expect(linkWorkspaceRepo.definition.inputSchema.required).toEqual(['workspace', 'alias', 'path']);
  });

  it('links a repo and returns the updated workspace', async () => {
    const updated = { name: 'team', repos: [{ alias: 'auth', path: '/repos/auth' }] };
    const ctx = contextWith({ linkRepo: vi.fn().mockResolvedValue(updated) });
    const res = await linkWorkspaceRepo.handler(
      { workspace: 'team', alias: 'auth', path: '/repos/auth' },
      ctx
    );
    expect(ctx.workspaceManager.linkRepo).toHaveBeenCalledWith('team', 'auth', '/repos/auth');
    expect(JSON.parse(res.content[0].text)).toEqual(updated);
  });
});

describe('use_workspace', () => {
  it('has the correct definition', () => {
    expect(useWorkspace.definition.name).toBe('use_workspace');
    expect(useWorkspace.definition.inputSchema.required).toEqual(['name']);
  });

  it('activates the workspace and returns it', async () => {
    const ws = { name: 'team', repos: [] };
    const ctx = contextWith({ useWorkspace: vi.fn().mockResolvedValue(ws) });
    const res = await useWorkspace.handler({ name: 'team' }, ctx);
    expect(ctx.workspaceManager.useWorkspace).toHaveBeenCalledWith('team');
    expect(JSON.parse(res.content[0].text)).toEqual({ active: 'team', workspace: ws });
  });

  it('returns isError for an unknown workspace', async () => {
    const ctx = contextWith({ useWorkspace: vi.fn().mockRejectedValue(new Error('Workspace "ghost" not found')) });
    const res = await useWorkspace.handler({ name: 'ghost' }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('list_workspaces', () => {
  it('has the correct definition with no required params', () => {
    expect(listWorkspaces.definition.name).toBe('list_workspaces');
    expect(listWorkspaces.definition.inputSchema.required ?? []).toEqual([]);
  });

  it('returns all workspaces plus the active one', async () => {
    const all = [{ name: 'team', repos: [] }, { name: 'other', repos: [] }];
    const ctx = contextWith({
      listWorkspaces: vi.fn().mockResolvedValue(all),
      getActiveWorkspace: vi.fn().mockResolvedValue(all[0]),
    });
    const res = await listWorkspaces.handler({}, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.workspaces).toEqual(all);
    expect(parsed.active).toBe('team');
  });
});
