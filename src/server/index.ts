#!/usr/bin/env node
import * as path from 'path';
import * as os from 'os';
import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { AuthManager } from '../engine/auth-manager.js';
import { ProxyServer } from '../engine/proxy.js';
import { ResponseStore } from '../engine/response-store.js';
import { HistoryStore } from '../engine/history-store.js';
import { FlowManager } from '../engine/flow-manager.js';
import { MockServer } from '../engine/mock-server.js';
import { DotEnvLoader } from '../engine/dotenv-loader.js';
import { SpecLoader } from '../engine/spec-loader.js';
import { ScriptVariableStore } from '../engine/script-variables.js';
import { execute as executeRequest } from '../engine/http-executor.js';
import { TunnelManager } from '../engine/tunnel-manager.js';
import { startServer } from '../mcp/server.js';
import { EngineContext } from '../mcp/tools/types.js';

import { startExpressServer } from './express.js';

import { parseArgs, resolveProjectDir } from './cli-parser.js';
import { handleRunCommand } from './run-command.js';
import { handleRunFlowCommand } from './run-flow-command.js';
import { handleMockCommand } from './mock-command.js';
import { handleExportFlowCommand } from './export-flow-command.js';
import { handleSetupCommand } from './setup-command.js';
import { handleUseCommand } from './use-command.js';
import { handleStatusCommand } from './status-command.js';
import { handleStopCommand } from './stop-command.js';
import { handleAppCommand } from './app-command.js';
import { handleExecCommand } from './exec-command.js';
import { handleImportCommand } from './import-command.js';
import { handleInitCommand } from './init-command.js';
import { writeLock, clearLock } from './lock.js';

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

  if (parsed.command === 'app') {
    const exitCode = await handleAppCommand();
    process.exit(exitCode);
  }

  const resolved = resolveProjectDir({
    flag: parsed.flags.projectDir,
    env: process.env.REQLY_PROJECT_DIR,
    configActiveProject: await authManager.getActiveProject(),
    cwd: process.cwd(),
  });
  const cwd = resolved.dir;
  // Stash for get_project MCP tool
  (globalThis as any).__reqlyProjectResolution = resolved;
  const projectReqlyDir = path.join(cwd, '.reqly');

  if (parsed.command === 'init') {
    const exitCode = await handleInitCommand(parsed, cwd);
    process.exit(exitCode);
  }

  const collectionsDir = projectReqlyDir;
  const environmentsPath = path.join(projectReqlyDir, 'environments.yaml');

  const collectionManager = new CollectionManager(collectionsDir);
  const environmentManager = new EnvironmentManager(environmentsPath);
  const flowManager = new FlowManager(collectionsDir);

  if (parsed.command === 'run') {
    const exitCode = await handleRunCommand(parsed, collectionManager, environmentManager, authManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'run-flow') {
    const exitCode = await handleRunFlowCommand(parsed, collectionManager, environmentManager, authManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'mock') {
    const exitCode = await handleMockCommand(parsed, collectionManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'export-flow') {
    const exitCode = await handleExportFlowCommand(parsed, collectionManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'import') {
    const exitCode = await handleImportCommand(parsed, collectionManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'export') {
    const { handleExportCommand } = await import('./export-command.js');
    const exitCode = await handleExportCommand(parsed, collectionManager);
    process.exit(exitCode);
  }

  if (parsed.command === 'exec') {
    const execProxyServer = new ProxyServer(collectionManager);
    const exitCode = await handleExecCommand(parsed, execProxyServer);
    process.exit(exitCode);
  }

  // start command (default)
  const proxyServer = new ProxyServer(collectionManager);
  const tunnelManager = new TunnelManager();
  const responseStore = new ResponseStore(cwd);
  const historyStore = new HistoryStore(cwd);
  const mockServer = new MockServer(collectionManager);
  const scriptVariableStore = new ScriptVariableStore();

  // --env-file overrides the persisted file list for this session only (not saved to config).
  const dotenvFiles = parsed.flags.envFiles || await authManager.getDotenvFiles();
  const dotEnvLoader = new DotEnvLoader(cwd, dotenvFiles);
  await dotEnvLoader.load();
  dotEnvLoader.watch();

  const context: EngineContext = {
    collectionManager,
    environmentManager,
    authManager,
    proxyServer,
    tunnelManager,
    responseStore,
    historyStore,
    flowManager,
    mockServer,
    dotEnvLoader,
    specLoader: new SpecLoader(),
    scriptVariableStore,
    executeRequest: async (req, env, auth, truncate, _maxBodyBytes, collectionVars, collectionAuth, collectionName, runnerContext) => {
      const config = await authManager.loadConfig();
      const maxBytes = config.maxBodyBytes || 50 * 1024;
      // Read context.dotEnvLoader (not the closed-over local) - switch-project
      // reassigns it to a new instance scoped to the new project dir.
      const scriptVars = collectionName && context.scriptVariableStore ? context.scriptVariableStore.getAll(collectionName) : {};
      const onScriptVarSet = collectionName && context.scriptVariableStore ? (k: string, v: string) => context.scriptVariableStore!.set(collectionName, k, v) : undefined;
      // baseDir for scriptFile resolution: collection folder when in a collection context, else project root
      const scriptBaseDir = collectionName
        ? path.join(context.collectionManager.getBaseDir(), collectionName)
        : cwd;
      return executeRequest(req, env, auth, truncate, maxBytes, collectionVars, collectionAuth, context.dotEnvLoader.getVariablesRecord(), scriptBaseDir, undefined, scriptVars, onScriptVarSet, runnerContext);
    }
  };

  const port = Number(process.env.REQLY_TEST_PORT) || 4242;

  // Each process always runs its own full engine + Express.
  // Lock file is written for process registry (reqly stop/status/app) only,
  // not for inter-process state coordination.
  const expressServer = startExpressServer(context, port);
  let expressAvailable = true;
  expressServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[reqly] Port ${port} already in use - MCP available, UI unavailable on this process.`);
      expressAvailable = false;
    } else {
      throw err;
    }
  });
  // Wait one tick so the error event fires before we write the lock
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (expressAvailable) {
    await writeLock(cwd, port);
  }
  await startServer(context);

  const shutdown = async () => {
    console.error('Shutting down Reqly gracefully...');
    try {
      await context.proxyServer.stop();
      context.tunnelManager.stop();
      await context.mockServer?.stop().catch(() => {});
    } catch (e) {
      // ignore
    }

    if (expressAvailable) {
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
