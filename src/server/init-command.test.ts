import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { handleInitCommand } from './init-command.js';
import { ParsedArgs } from './cli-parser.js';

describe('handleInitCommand', () => {
  let tmpDir: string;
  let starterDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-init-test-'));
    starterDir = path.join(tmpDir, 'starter', '.reqly');
    await fs.mkdir(path.join(starterDir, 'collections', 'jsonplaceholder'), { recursive: true });
    await fs.mkdir(path.join(starterDir, 'flows'), { recursive: true });
    await fs.writeFile(path.join(starterDir, 'collections', 'jsonplaceholder', 'collection.yaml'), 'description: test\n');
    await fs.writeFile(path.join(starterDir, 'collections', 'jsonplaceholder', 'get-todo.yaml'), 'name: get-todo\n');
    await fs.writeFile(path.join(starterDir, 'flows', 'starter-flow.yaml'), 'name: starter-flow\n');
    await fs.writeFile(path.join(starterDir, 'environments.yaml'), 'environments: []\n');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function buildParsed(): ParsedArgs {
    return { command: 'init', args: [], flags: {} };
  }

  it('copies the starter .reqly directory into the target project when none exists', async () => {
    const targetDir = path.join(tmpDir, 'project');
    const exitCode = await handleInitCommand(buildParsed(), targetDir, starterDir);

    expect(exitCode).toBe(0);
    const collectionYaml = await fs.readFile(path.join(targetDir, '.reqly', 'collections', 'jsonplaceholder', 'collection.yaml'), 'utf8');
    expect(collectionYaml).toBe('description: test\n');
    const flowYaml = await fs.readFile(path.join(targetDir, '.reqly', 'flows', 'starter-flow.yaml'), 'utf8');
    expect(flowYaml).toBe('name: starter-flow\n');
    const envYaml = await fs.readFile(path.join(targetDir, '.reqly', 'environments.yaml'), 'utf8');
    expect(envYaml).toBe('environments: []\n');
  });

  it('does not overwrite existing files in the target project', async () => {
    const targetDir = path.join(tmpDir, 'project-existing');
    await fs.mkdir(path.join(targetDir, '.reqly', 'collections', 'jsonplaceholder'), { recursive: true });
    await fs.writeFile(path.join(targetDir, '.reqly', 'collections', 'jsonplaceholder', 'collection.yaml'), 'description: mine\n');

    const exitCode = await handleInitCommand(buildParsed(), targetDir, starterDir);

    expect(exitCode).toBe(0);
    const collectionYaml = await fs.readFile(path.join(targetDir, '.reqly', 'collections', 'jsonplaceholder', 'collection.yaml'), 'utf8');
    expect(collectionYaml).toBe('description: mine\n');
    // sibling file not present before should still be copied
    const getTodoYaml = await fs.readFile(path.join(targetDir, '.reqly', 'collections', 'jsonplaceholder', 'get-todo.yaml'), 'utf8');
    expect(getTodoYaml).toBe('name: get-todo\n');
  });

  it('creates .reqly if missing and reports an error if the starter directory cannot be found', async () => {
    const targetDir = path.join(tmpDir, 'project-missing-starter');
    const missingStarter = path.join(tmpDir, 'does-not-exist');
    const exitCode = await handleInitCommand(buildParsed(), targetDir, missingStarter);
    expect(exitCode).toBe(1);
  });
});
