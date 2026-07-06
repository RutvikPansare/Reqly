import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { load, dump } from 'js-yaml';
import { WorkspaceConfig } from '../types/index.js';

export class WorkspaceNotFoundError extends Error {
  constructor(name: string) {
    super(`Workspace "${name}" not found. Create it with "reqly workspace create ${name}".`);
    this.name = 'WorkspaceNotFoundError';
  }
}

/** Standard locations: ~/.reqly/workspaces/ and ~/.reqly/config.json */
export function createDefaultWorkspaceManager(): WorkspaceManager {
  const base = path.join(os.homedir(), '.reqly');
  return new WorkspaceManager(path.join(base, 'workspaces'), path.join(base, 'config.json'));
}

const WORKSPACE_FILE = 'workspace.yaml';
// Alias/workspace names travel into file paths - restrict to a safe slug.
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * T-226: named, shareable workspace definitions. Each workspace lives at
 * <workspacesDir>/<name>/workspace.yaml and maps stable repo aliases to
 * machine-local paths. The active workspace name is stored in the global
 * config JSON (~/.reqly/config.json) under `activeWorkspace`.
 */
export class WorkspaceManager {
  constructor(
    private readonly workspacesDir: string,
    private readonly globalConfigPath: string
  ) {}

  private workspaceFile(name: string): string {
    return path.join(this.workspacesDir, name, WORKSPACE_FILE);
  }

  private validateName(name: string, kind: 'workspace' | 'alias'): void {
    if (!name || !NAME_RE.test(name)) {
      throw new Error(
        `Invalid ${kind} name "${name}": use letters, digits, dots, dashes, and underscores only.`
      );
    }
  }

  private async save(config: WorkspaceConfig): Promise<void> {
    const dir = path.join(this.workspacesDir, config.name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, WORKSPACE_FILE), dump(config), 'utf8');
  }

  async createWorkspace(name: string): Promise<WorkspaceConfig> {
    this.validateName(name, 'workspace');
    if (existsSync(this.workspaceFile(name))) {
      throw new Error(`Workspace "${name}" already exists at ${this.workspaceFile(name)}.`);
    }
    const config: WorkspaceConfig = { name, repos: [] };
    await this.save(config);
    return config;
  }

  async getWorkspace(name: string): Promise<WorkspaceConfig> {
    const file = this.workspaceFile(name);
    if (!existsSync(file)) throw new WorkspaceNotFoundError(name);
    const parsed = load(await fs.readFile(file, 'utf8')) as Partial<WorkspaceConfig> | undefined;
    return {
      name: parsed?.name ?? name,
      repos: parsed?.repos ?? [],
      ...(parsed?.sharedEnv ? { sharedEnv: parsed.sharedEnv } : {}),
    };
  }

  async listWorkspaces(): Promise<WorkspaceConfig[]> {
    if (!existsSync(this.workspacesDir)) return [];
    const entries = await fs.readdir(this.workspacesDir, { withFileTypes: true });
    const workspaces: WorkspaceConfig[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!existsSync(this.workspaceFile(entry.name))) continue;
      workspaces.push(await this.getWorkspace(entry.name));
    }
    return workspaces;
  }

  async linkRepo(name: string, alias: string, repoPath: string): Promise<WorkspaceConfig> {
    this.validateName(alias, 'alias');
    const absPath = path.resolve(repoPath);
    if (!existsSync(absPath)) {
      throw new Error(`Path "${absPath}" does not exist.`);
    }
    const config = await this.getWorkspace(name);
    const existing = config.repos.find(r => r.alias === alias);
    if (existing) {
      existing.path = absPath;
    } else {
      config.repos.push({ alias, path: absPath });
    }
    await this.save(config);
    return config;
  }

  async unlinkRepo(name: string, alias: string): Promise<WorkspaceConfig> {
    const config = await this.getWorkspace(name);
    config.repos = config.repos.filter(r => r.alias !== alias);
    await this.save(config);
    return config;
  }

  async setSharedEnv(name: string, sharedEnv: Record<string, string>): Promise<WorkspaceConfig> {
    const config = await this.getWorkspace(name);
    config.sharedEnv = sharedEnv;
    await this.save(config);
    return config;
  }

  async resolveRepoPath(workspaceName: string, alias: string): Promise<string> {
    const config = await this.getWorkspace(workspaceName);
    const repo = config.repos.find(r => r.alias === alias);
    if (!repo) {
      const available = config.repos.map(r => r.alias).join(', ') || '(none)';
      throw new Error(
        `Alias "${alias}" is not linked in workspace "${workspaceName}". Available aliases: ${available}.`
      );
    }
    return repo.path;
  }

  private async loadGlobalConfig(): Promise<Record<string, unknown>> {
    if (!existsSync(this.globalConfigPath)) return {};
    try {
      return JSON.parse(await fs.readFile(this.globalConfigPath, 'utf8'));
    } catch {
      return {};
    }
  }

  private async saveGlobalConfig(config: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.globalConfigPath), { recursive: true });
    await fs.writeFile(this.globalConfigPath, JSON.stringify(config, null, 2), 'utf8');
  }

  async useWorkspace(name: string): Promise<WorkspaceConfig> {
    const workspace = await this.getWorkspace(name);
    const config = await this.loadGlobalConfig();
    config.activeWorkspace = name;
    await this.saveGlobalConfig(config);
    return workspace;
  }

  async clearActiveWorkspace(): Promise<void> {
    const config = await this.loadGlobalConfig();
    delete config.activeWorkspace;
    await this.saveGlobalConfig(config);
  }

  async getActiveWorkspace(): Promise<WorkspaceConfig | undefined> {
    const config = await this.loadGlobalConfig();
    const name = config.activeWorkspace;
    if (typeof name !== 'string' || !name) return undefined;
    try {
      return await this.getWorkspace(name);
    } catch {
      return undefined;
    }
  }
}
