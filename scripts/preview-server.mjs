// Boots the Reqly server (UI + API) against a writable copy of the e2e fixture
// project with an isolated $HOME, on a fixed port, for browser-based verification.
// Foreground process - used by .claude/launch.json "preview".
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4266;

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-preview-'));
const projectDir = path.join(root, 'fixture-project');
const homeDir = path.join(root, 'home');
await fs.cp(path.join(repoRoot, 'tests/e2e/fixture-project'), projectDir, { recursive: true });
await fs.mkdir(homeDir, { recursive: true });

const child = spawn(
  process.execPath,
  [path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'), path.join(repoRoot, 'src/server/index.ts'), 'start', '--project-dir', projectDir],
  { cwd: repoRoot, env: { ...process.env, HOME: homeDir, REQLY_PROJECT_DIR: '', REQLY_TEST_PORT: String(PORT) }, stdio: 'inherit' },
);

const cleanup = () => { try { child.kill('SIGTERM'); } catch {} fs.rm(root, { recursive: true, force: true }).catch(() => {}); };
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });
child.on('exit', code => { cleanup(); process.exit(code ?? 0); });
