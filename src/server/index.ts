#!/usr/bin/env node
import * as path from 'path';
import * as os from 'os';
import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { AuthManager } from '../engine/auth-manager.js';
import { ProxyServer } from '../engine/proxy.js';
import { ResponseStore } from '../engine/response-store.js';
import { HistoryStore } from '../engine/history-store.js';
import { execute as executeRequest } from '../engine/http-executor.js';
import { startServer } from '../mcp/server.js';
import { EngineContext } from '../mcp/tools/types.js';

import { startExpressServer } from './express.js';

import { parseArgs } from './cli-parser.js';
import { handleRunCommand } from './run-command.js';
import { handleSetupCommand } from './setup-command.js';

async function main() {
  const parsed = parseArgs(process.argv);
  
  if (parsed.command === 'setup') {
    const exitCode = await handleSetupCommand(parsed);
    process.exit(exitCode);
  }

  const globalReqlyDir = path.join(os.homedir(), '.reqly');
  const cwd = parsed.flags.projectDir ? path.resolve(process.cwd(), parsed.flags.projectDir) : process.cwd();
  const projectReqlyDir = path.join(cwd, '.reqly');

  const collectionsDir = projectReqlyDir;
  const environmentsPath = path.join(projectReqlyDir, 'environments.yaml');
  
  const globalConfigPath = path.join(globalReqlyDir, 'config.json');

  const collectionManager = new CollectionManager(collectionsDir);
  const environmentManager = new EnvironmentManager(environmentsPath);
  const authManager = new AuthManager(globalConfigPath);

  if (parsed.command === 'run') {
    const exitCode = await handleRunCommand(parsed, collectionManager, environmentManager, authManager);
    process.exit(exitCode);
  }

  // start command (default)
  const proxyServer = new ProxyServer(collectionManager);
  const responseStore = new ResponseStore();
  const historyStore = new HistoryStore();

  const context: EngineContext = {
    collectionManager,
    environmentManager,
    authManager,
    proxyServer,
    responseStore,
    historyStore,
    executeRequest
  };

  const expressServer = startExpressServer(context);
  await startServer(context);

  const shutdown = async () => {
    console.error('Shutting down Reqly gracefully...');
    try {
      await context.proxyServer.stop();
    } catch (e) {
      // ignore
    }
    
    expressServer.close(() => {
      console.error('Express server closed.');
      process.exit(0);
    });

    // Fallback to force exit if connections are hanging
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 3000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal error starting Reqly MCP server:', err);
  process.exit(1);
});
