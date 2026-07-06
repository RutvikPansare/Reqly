import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (tests/e2e/helpers -> three levels up). */
export const repoRoot = path.resolve(__dirname, '..', '..', '..');

/** The committed, read-only fixture project. Never run the server against this directly. */
export const fixtureProjectSrc = path.join(repoRoot, 'tests', 'e2e', 'fixture-project');

export interface E2eSandbox {
  /** Writable copy of the fixture project the server runs against. */
  projectDir: string;
  /** Isolated $HOME so global config, lock file, and workspaces never touch the real one. */
  homeDir: string;
  /** Env vars to spawn the Reqly server with. */
  env: Record<string, string>;
  cleanup: () => Promise<void>;
}

/**
 * Copies the committed fixture project into a temp dir and fabricates an
 * isolated $HOME. The suites mutate their copy freely (create_request,
 * responses.json, schema cache) while the committed fixture stays pristine,
 * and workspace tools write to the fake home instead of ~/.reqly.
 */
export async function createSandbox(prefix: string, extraEnv: Record<string, string> = {}): Promise<E2eSandbox> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `reqly-${prefix}-`));
  const projectDir = path.join(root, 'fixture-project');
  const homeDir = path.join(root, 'home');
  await fs.cp(fixtureProjectSrc, projectDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    HOME: homeDir,
    // Never inherit a project override from the invoking shell.
    REQLY_PROJECT_DIR: '',
    ...extraEnv,
  };
  delete (env as Record<string, unknown>).REQLY_ELECTRON;

  return {
    projectDir,
    homeDir,
    env,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

/** Polls until the Reqly HTTP server answers on the given port. */
export async function waitForServer(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/collections`);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Reqly server on port ${port} did not become ready within ${timeoutMs}ms: ${lastError}`);
}
