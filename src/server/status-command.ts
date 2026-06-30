import * as net from 'net';
import { AuthManager } from '../engine/auth-manager.js';
import { CollectionManager } from '../engine/collection-manager.js';
import { resolveProjectDir, ParsedArgs } from './cli-parser.js';

import type { ConfigSource } from './cli-parser.js';

function describeSource(opts: { flag?: string; env?: string; configActiveProject?: string; configSource?: ConfigSource }): string {
  switch (opts.configSource) {
    case 'flag': return '--project-dir flag';
    case 'env': return 'REQLY_PROJECT_DIR environment variable';
    case 'config': return '~/.reqly/config.json (set via `reqly use`)';
    default: return 'process.cwd() (no flag, env var, or active project set)';
  }
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(300);
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function handleStatusCommand(parsed: ParsedArgs, authManager: AuthManager): Promise<number> {
  const configActiveProject = await authManager.getActiveProject();
  const opts = {
    flag: parsed.flags.projectDir,
    env: process.env.REQLY_PROJECT_DIR,
    configActiveProject,
    cwd: process.cwd(),
  };

  const { dir: projectDir, configSource } = resolveProjectDir(opts);
  const source = describeSource({ ...opts, configSource });

  const collectionManager = new CollectionManager(projectDir);
  let collectionCount = 0;
  try {
    collectionCount = (await collectionManager.listCollections()).length;
  } catch {
    collectionCount = 0;
  }

  const running = await isPortOpen(4242);

  console.log('Reqly status');
  console.log(`Active project: ${projectDir}`);
  console.log(`Source: ${source}`);
  console.log(`Collections: .reqly/ (${collectionCount} collection${collectionCount === 1 ? '' : 's'} found)`);
  console.log(`Server: ${running ? 'running on port 4242' : 'not running'}`);

  return 0;
}
