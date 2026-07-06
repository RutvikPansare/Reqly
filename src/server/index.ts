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
import { createDefaultWorkspaceManager } from '../engine/workspace-manager.js';
import { SpecLoader } from '../engine/spec-loader.js';
import { ScriptVariableStore } from '../engine/script-variables.js';
import { createDefaultSecretRegistry } from '../engine/secret-providers/index.js';
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
import { handleWorkspaceCommand } from './workspace-command.js';
import { writeLock, readLock, clearLock, isProcessAlive } from './lock.js';

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

  if (parsed.command === 'workspace') {
    const action = parsed.args[0] as import('./workspace-command.js').WorkspaceAction;
    if (!['add', 'remove', 'list', 'create', 'link', 'use'].includes(action)) {
      const { WORKSPACE_USAGE } = await import('./workspace-command.js');
      console.error(WORKSPACE_USAGE);
      process.exit(1);
    }
    await handleWorkspaceCommand(action, parsed.args.slice(1));
    process.exit(0);
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

  if (parsed.command === 'secrets') {
    const { handleSecretsCommand } = await import('./secrets-command.js');
    const registry = await createDefaultSecretRegistry(() => authManager.loadConfig());
    const files = parsed.flags.envFiles || await authManager.getDotenvFiles();
    const exitCode = await handleSecretsCommand(parsed.args[0], cwd, files, registry);
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

  // Vault secret resolution (bw:// today; op://, vault://, aws:// as their
  // integrations land). Registry is shared engine-wide via EngineContext and
  // attached to the .env loader so vault URIs resolve into the variable chain.
  const secretRegistry = await createDefaultSecretRegistry(() => authManager.loadConfig());

  // --env-file overrides the persisted file list for this session only (not saved to config).
  const dotenvFiles = parsed.flags.envFiles || await authManager.getDotenvFiles();
  const dotEnvLoader = new DotEnvLoader(cwd, dotenvFiles, secretRegistry);
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
    workspaceManager: createDefaultWorkspaceManager(),
    specLoader: new SpecLoader(),
    scriptVariableStore,
    secretRegistry,
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
      const dotEnvErrors: Record<string, string> = {};
      for (const err of context.dotEnvLoader.getSecretErrors()) dotEnvErrors[err.key] = err.error;
      return executeRequest(req, env, auth, truncate, maxBytes, collectionVars, collectionAuth, context.dotEnvLoader.getVariablesRecord(), scriptBaseDir, undefined, scriptVars, onScriptVarSet, runnerContext, { registry: context.secretRegistry, dotEnvErrors });
    }
  };

  const isElectron = !!process.env.REQLY_ELECTRON;
  const testPort = Number(process.env.REQLY_TEST_PORT) || 0;

  // Determine which port to use before starting the server.
  // Electron: always use port 0 (OS-assigned ephemeral port, never 4242).
  // Agent: try 4242. If an existing agent owns it, kill it and take over.
  //        If an Electron process owns it, fall back to an OS-assigned port.
  let targetPort: number;
  let lockType: 'electron' | 'agent';

  if (isElectron) {
    targetPort = testPort || 0;
    lockType = 'electron';
  } else {
    targetPort = testPort || 4242;
    lockType = 'agent';

    if (!testPort) {
      const existing = await readLock().catch(() => null);
      if (existing && isProcessAlive(existing.pid)) {
        const existingType = (existing as any).type ?? 'agent';
        if (existingType === 'agent') {
          // Kill the old agent so we can take over port 4242.
          try {
            process.kill(existing.pid, 'SIGTERM');
            await new Promise(r => setTimeout(r, 600));
          } catch {
            // Kill failed - fall through and let EADDRINUSE handle it.
          }
        } else if (existingType === 'electron') {
          // Electron owns 4242. Don't kill it - use an OS-assigned port instead.
          targetPort = 0;
        }
      }
    }
  }

  const expressServer = startExpressServer(context, targetPort);
  let expressAvailable = false;
  let actualPort = targetPort;

  await new Promise<void>((resolve, reject) => {
    expressServer.once('listening', () => {
      const addr = expressServer.address();
      actualPort = (typeof addr === 'object' && addr) ? addr.port : targetPort;
      expressAvailable = true;
      resolve();
    });
    expressServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[reqly] Port ${targetPort} already in use - MCP available, UI unavailable on this process.`);
        expressAvailable = false;
        resolve();
      } else {
        reject(err);
      }
    });
  });

  if (expressAvailable) {
    await writeLock(cwd, actualPort, lockType);
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
