import { CollectionManager } from '../../engine/collection-manager.js';
import { EnvironmentManager } from '../../engine/environment-manager.js';
import { AuthManager } from '../../engine/auth-manager.js';
import { ProxyServer } from '../../engine/proxy.js';
import { ResponseStore } from '../../engine/response-store.js';
import { HistoryStore } from '../../engine/history-store.js';
import { TunnelManager } from '../../engine/tunnel-manager.js';
import { FlowManager } from '../../engine/flow-manager.js';
import { MockServer } from '../../engine/mock-server.js';
import { DotEnvLoader } from '../../engine/dotenv-loader.js';
import { SpecLoader } from '../../engine/spec-loader.js';
import { ScriptVariableStore } from '../../engine/script-variables.js';
import { WorkspaceManager } from '../../engine/workspace-manager.js';
import { SecretProviderRegistry } from '../../engine/secret-providers/index.js';
import { HttpResponse, CollectionRequest, Environment, AuthProfile } from '../../types/index.js';
import { RunnerContext } from '../../engine/script-runner.js';

export interface EngineContext {
  collectionManager: CollectionManager;
  environmentManager: EnvironmentManager;
  authManager: AuthManager;
  proxyServer: ProxyServer;
  tunnelManager: TunnelManager;
  responseStore: ResponseStore;
  historyStore: HistoryStore;
  flowManager: FlowManager;
  mockServer?: MockServer;
  dotEnvLoader: DotEnvLoader;
  workspaceManager: WorkspaceManager;
  specLoader: SpecLoader;
  scriptVariableStore?: ScriptVariableStore;
  secretRegistry?: SecretProviderRegistry;
  executeRequest: (req: CollectionRequest, env?: Environment, auth?: AuthProfile, truncate?: boolean, maxBodyBytes?: number, collectionVars?: Record<string, string>, collectionAuth?: AuthProfile, collectionName?: string, runnerContext?: RunnerContext) => Promise<HttpResponse>;
  execChildPid?: number;
  lastMcpActivityAt?: number | null;
  hasEverConnectedAgent?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface ToolHandlerResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
