import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createSandbox, repoRoot, waitForServer } from './fixture.js';

const UI_PORT = Number(process.env.REQLY_E2E_UI_PORT) || 4242;
export const stateFile = path.join(repoRoot, 'tests', 'e2e', '.ui-server-state.json');

export default async function globalSetup() {
  // Fail fast if something else (e.g. a developer's live Reqly agent) already
  // answers on the port - otherwise the tests would silently run against the
  // wrong server and the wrong project.
  const occupied = await fetch(`http://localhost:${UI_PORT}/api/collections`).then(() => true).catch(() => false);
  if (occupied) {
    throw new Error(
      `Port ${UI_PORT} is already serving something. Stop the running Reqly instance (reqly stop) ` +
      `or set REQLY_E2E_UI_PORT to a free port and re-run.`,
    );
  }

  const sandbox = await createSandbox('ui', { REQLY_TEST_PORT: String(UI_PORT) });

  const child = spawn(
    process.execPath,
    [path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(repoRoot, 'src', 'server', 'index.ts'), 'start', '--project-dir', sandbox.projectDir],
    {
      cwd: repoRoot,
      env: sandbox.env,
      stdio: ['ignore', 'ignore', process.env.REQLY_E2E_DEBUG ? 'inherit' : 'ignore'],
      detached: false,
    },
  );

  try {
    await waitForServer(UI_PORT);
  } catch (e) {
    child.kill('SIGTERM');
    throw new Error(
      `${e}\nIs another Reqly instance already using port ${UI_PORT}? Stop it (reqly stop) and re-run.`,
    );
  }

  await fs.writeFile(
    stateFile,
    JSON.stringify({ pid: child.pid, projectDir: sandbox.projectDir, homeDir: sandbox.homeDir }),
    'utf8',
  );
  // Keep the sandbox alive for the test run; teardown removes it.
  (globalThis as any).__reqlyUiSandboxCleanup = sandbox.cleanup;
}
