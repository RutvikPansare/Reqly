import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';
import { AuthManager } from '../engine/auth-manager.js';

export async function handleWorkspaceCommand(
  action: 'add' | 'remove' | 'list',
  targetPath?: string
) {
  const globalConfigPath = path.join(os.homedir(), '.reqly', 'config.json');
  const authManager = new AuthManager(globalConfigPath);

  if (action === 'list') {
    const projects = await authManager.getWorkspaceProjects();
    if (projects.length === 0) {
      console.log('No workspace projects configured.');
    } else {
      console.log('Workspace Projects:');
      projects.forEach(p => console.log(`  - ${p}`));
    }
    return;
  }

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
