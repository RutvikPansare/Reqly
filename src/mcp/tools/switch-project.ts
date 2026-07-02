import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { CollectionManager } from '../../engine/collection-manager.js';
import { EnvironmentManager } from '../../engine/environment-manager.js';
import { FlowManager } from '../../engine/flow-manager.js';
import { DotEnvLoader } from '../../engine/dotenv-loader.js';
import { writeLock, readLock } from '../../server/lock.js';

export const definition: ToolDefinition = {
  name: 'switch_project',
  description: 'Points Reqly at a different project directory, reinitialising collections, environments, flows, and dotenv loading to read from that project\'s .reqly folder locally without affecting other running instances. When to use: when the agent needs to operate on a different project than the one Reqly currently has open. Returns the new projectDir on success, or a structured error if the path does not exist.',
  inputSchema: {
    type: 'object',
    properties: {
      projectDir: { type: 'string', description: 'Absolute path to the project directory to switch to' }
    },
    required: ['projectDir']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const projectDir: string = args.projectDir;
    if (!projectDir) {
      throw new Error('projectDir is required');
    }

    try {
      await fs.access(projectDir);
    } catch {
      throw new Error(`Project directory does not exist: ${projectDir}`);
    }

    const collectionsDir = path.join(projectDir, '.reqly');
    const environmentsPath = path.join(collectionsDir, 'environments.yaml');

    context.collectionManager = new CollectionManager(collectionsDir);
    context.environmentManager = new EnvironmentManager(environmentsPath);
    context.flowManager = new FlowManager(collectionsDir);
    
    // Lazy-load so we don't need top-level imports that might cause circular deps if not needed
    const { HistoryStore } = await import('../../engine/history-store.js');
    const { ResponseStore } = await import('../../engine/response-store.js');
    context.historyStore = new HistoryStore(projectDir);
    context.responseStore = new ResponseStore(projectDir);

    context.dotEnvLoader.stopWatching();
    const dotenvFiles = await context.authManager.getDotenvFiles();
    context.dotEnvLoader = new DotEnvLoader(projectDir, dotenvFiles);
    await context.dotEnvLoader.load();
    context.dotEnvLoader.watch();

    const lock = await readLock();
    if (lock) {
      await writeLock(projectDir, lock.port);
    }

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, projectDir }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: e.message }) }], isError: true };
  }
}
