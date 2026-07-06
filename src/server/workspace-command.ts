import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';
import { AuthManager } from '../engine/auth-manager.js';
import { createDefaultWorkspaceManager } from '../engine/workspace-manager.js';

export type WorkspaceAction = 'add' | 'remove' | 'list' | 'create' | 'link' | 'use';

export const WORKSPACE_USAGE = [
  'Usage:',
  '  reqly workspace list                          List workspace projects and named workspaces',
  '  reqly workspace add <path>                    Add a project directory to the flat multi-project list',
  '  reqly workspace remove <path>                 Remove a project directory from the list',
  '  reqly workspace create <name>                 Create a named workspace (~/.reqly/workspaces/<name>/)',
  '  reqly workspace link <name> <alias> <path>    Link a repo into a workspace under a stable alias',
  '  reqly workspace use <name>                    Set the active workspace',
].join('\n');

export async function handleWorkspaceCommand(action: WorkspaceAction, args: string[]) {
  const globalConfigPath = path.join(os.homedir(), '.reqly', 'config.json');
  const authManager = new AuthManager(globalConfigPath);
  const workspaceManager = createDefaultWorkspaceManager();

  if (action === 'list') {
    const projects = await authManager.getWorkspaceProjects();
    if (projects.length === 0) {
      console.log('No workspace projects configured.');
    } else {
      console.log('Workspace Projects:');
      projects.forEach(p => console.log(`  - ${p}`));
    }

    const workspaces = await workspaceManager.listWorkspaces();
    const active = await workspaceManager.getActiveWorkspace();
    if (workspaces.length > 0) {
      console.log('\nNamed Workspaces:');
      for (const ws of workspaces) {
        const marker = ws.name === active?.name ? ' (active)' : '';
        console.log(`  ${ws.name}${marker}`);
        ws.repos.forEach(r => console.log(`    ${r.alias} -> ${r.path}`));
      }
    }
    return;
  }

  if (action === 'create') {
    const [name] = args;
    if (!name) {
      console.error('Error: "workspace create" requires a name.\n' + WORKSPACE_USAGE);
      process.exit(1);
    }
    const ws = await workspaceManager.createWorkspace(name);
    console.log(`Created workspace "${ws.name}".`);
    console.log(`Link repos with: reqly workspace link ${ws.name} <alias> <path>`);
    return;
  }

  if (action === 'link') {
    const [name, alias, repoPath] = args;
    if (!name || !alias || !repoPath) {
      console.error('Error: "workspace link" requires <name> <alias> <path>.\n' + WORKSPACE_USAGE);
      process.exit(1);
    }
    const absPath = path.resolve(process.cwd(), repoPath);
    if (!existsSync(path.join(absPath, '.reqly'))) {
      console.warn(`Warning: '${absPath}' has no .reqly/ directory yet. Run 'reqly init' there to use it in flows.`);
    }
    const ws = await workspaceManager.linkRepo(name, alias, absPath);
    console.log(`Linked ${alias} -> ${absPath} in workspace "${name}".`);
    console.log(`Repos: ${ws.repos.map(r => r.alias).join(', ')}`);
    return;
  }

  if (action === 'use') {
    const [name] = args;
    if (!name) {
      console.error('Error: "workspace use" requires a name.\n' + WORKSPACE_USAGE);
      process.exit(1);
    }
    await workspaceManager.useWorkspace(name);
    console.log(`Active workspace: ${name}`);
    return;
  }

  // add / remove operate on the flat multi-project path list (T-225)
  const [targetPath] = args;
  if (!targetPath) {
    console.error(`Error: 'workspace ${action}' requires a path argument.`);
    process.exit(1);
  }

  const absPath = path.resolve(process.cwd(), targetPath);

  if (action === 'add') {
    const reqlyDir = path.join(absPath, '.reqly');
    if (!existsSync(reqlyDir)) {
      console.error(`Error: Path '${absPath}' does not contain a .reqly/ directory.`);
      console.error(`Run 'reqly init' in that directory first.`);
      process.exit(1);
    }
    await authManager.addWorkspaceProject(absPath);
    console.log(`Added workspace project: ${absPath}`);
  } else if (action === 'remove') {
    await authManager.removeWorkspaceProject(absPath);
    console.log(`Removed workspace project: ${absPath}`);
  }
}
