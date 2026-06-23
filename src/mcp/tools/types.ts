import { CollectionManager } from '../../engine/collection-manager.js';
import { EnvironmentManager } from '../../engine/environment-manager.js';
import { AuthManager } from '../../engine/auth-manager.js';
import { ProxyServer } from '../../engine/proxy.js';
import { HttpResponse, CollectionRequest, Environment, AuthProfile } from '../../types/index.js';

export interface EngineContext {
  collectionManager: CollectionManager;
  environmentManager: EnvironmentManager;
  authManager: AuthManager;
  proxyServer: ProxyServer;
  lastResponseCache: Map<string, HttpResponse>;
  executeRequest: (req: CollectionRequest, env?: Environment, auth?: AuthProfile) => Promise<HttpResponse>;
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
