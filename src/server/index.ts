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

import { parseArgs, resolveProjectDir } from './cli-parser.js';
import { handleRunCommand } from './run-command.js';
import { handleSetupCommand } from './setup-command.js';
import { handleUseCommand } from './use-command.js';
import { handleStatusCommand } from './status-command.js';
import { handleStopCommand } from './stop-command.js';
import { readLock, writeLock, clearLock, isProcessAlive } from './lock.js';

async function main() {
  const parsed = parseArgs(process.argv);

  const globalReqlyDir = path.join(os.homedir(), '.reqly');
  const globalConfigPath = path.join(globalReqlyDir, 'config.json');
  const authManager = new AuthManager(globalConfigPath);

  if (parsed.command === 'setup') {
    const exitCode = await handleSetupCommand(parsed);
    process.exit(exitCode);
  }

  if (parsed.command === 'use') {
    const exitCode = await handleUseCommand(parsed, authManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'status') {
    const exitCode = await handleStatusCommand(parsed, authManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'stop') {
    const exitCode = await handleStopCommand();
    process.exit(exitCode);
  }

  const cwd = resolveProjectDir({
    flag: parsed.flags.projectDir,
    env: process.env.REQLY_PROJECT_DIR,
    configActiveProject: await authManager.getActiveProject(),
    cwd: process.cwd(),
  });
  const projectReqlyDir = path.join(cwd, '.reqly');

  const collectionsDir = projectReqlyDir;
  const environmentsPath = path.join(projectReqlyDir, 'environments.yaml');

  const collectionManager = new CollectionManager(collectionsDir);
  const environmentManager = new EnvironmentManager(environmentsPath);

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
    executeRequest: async (req, env, auth, truncate) => {
      const config = await authManager.loadConfig();
      const maxBytes = config.maxBodyBytes || 50 * 1024;
      return executeRequest(req, env, auth, truncate, maxBytes);
    }
  };

  const port = 4242;
  let mcpOnly = false;

  const lock = await readLock();
  if (lock && isProcessAlive(lock.pid)) {
    try {
      const res = await fetch(`http://localhost:${lock.port}/api/switch-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: cwd })
      });
      if (res.ok) {
        console.error(`Switched active project to ${cwd}`);
        mcpOnly = true;
      }
    } catch (e) {
      // existing instance unreachable - fall through to a normal start
    }
  } else if (lock) {
    // stale lock left behind by a dead process
    await clearLock();
  }

  const expressServer = mcpOnly ? null : startExpressServer(context, port);
  if (!mcpOnly) {
    await writeLock(cwd, port);
  }
  await startServer(context);

  const shutdown = async () => {
    console.error('Shutting down Reqly gracefully...');
    try {
      await context.proxyServer.stop();
    } catch (e) {
      // ignore
    }

    if (!mcpOnly) {
      await clearLock();
    }

    if (expressServer) {
      expressServer.close(() => {
        console.error('Express server closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }

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
