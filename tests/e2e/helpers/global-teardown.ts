import * as fs from 'fs/promises';
import * as path from 'path';
import { repoRoot } from './fixture.js';

const stateFile = path.join(repoRoot, 'tests', 'e2e', '.ui-server-state.json');

export default async function globalTeardown() {
  try {
    const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    if (state.pid) {
      try { process.kill(state.pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    if (state.projectDir) {
      // Sandbox root is the parent of the project dir copy.
      await fs.rm(path.dirname(state.projectDir), { recursive: true, force: true });
    }
    await fs.rm(stateFile, { force: true });
  } catch {
    // Nothing to tear down.
  }
}
