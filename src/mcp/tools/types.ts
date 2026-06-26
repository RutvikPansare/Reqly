import { CollectionManager } from '../../engine/collection-manager.js';
import { EnvironmentManager } from '../../engine/environment-manager.js';
import { AuthManager } from '../../engine/auth-manager.js';
import { ProxyServer } from '../../engine/proxy.js';
import { ResponseStore } from '../../engine/response-store.js';
import { HistoryStore } from '../../engine/history-store.js';
import { TunnelManager } from '../../engine/tunnel-manager.js';
import { FlowManager } from '../../engine/flow-manager.js';
import { HttpResponse, CollectionRequest, Environment, AuthProfile } from '../../types/index.js';

export interface EngineContext {
  collectionManager: CollectionManager;
  environmentManager: EnvironmentManager;
  authManager: AuthManager;
  proxyServer: ProxyServer;
  tunnelManager: TunnelManager;
  responseStore: ResponseStore;
  historyStore: HistoryStore;
  flowManager: FlowManager;
  executeRequest: (req: CollectionRequest, env?: Environment, auth?: AuthProfile, truncate?: boolean, maxBodyBytes?: number, collectionVars?: Record<string, string>, collectionAuth?: AuthProfile) => Promise<HttpResponse>;
  execChildPid?: number;
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
