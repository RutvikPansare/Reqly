import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { EngineContext } from './tools/types.js';

import * as runRequest from './tools/run-request.js';
import * as createRequest from './tools/create-request.js';
import * as createCollection from './tools/create-collection.js';
import * as listCollections from './tools/list-collections.js';
import * as setEnvironment from './tools/set-environment.js';
import * as runCollection from './tools/run-collection.js';
import * as getResponse from './tools/get-response.js';

import * as startProxy from './tools/start-proxy.js';
import * as stopProxy from './tools/stop-proxy.js';

import * as createEnvironment from './tools/create-environment.js';
import * as setVariable from './tools/set-variable.js';
import * as getVariables from './tools/get-variables.js';
import * as deleteVariable from './tools/delete-variable.js';

import * as getResponseFull from './tools/get-response-full.js';
import * as execWithProxy from './tools/exec-with-proxy.js';
import * as installMiddleware from './tools/install-middleware.js';
import * as importCollection from './tools/import-collection.js';
import * as exportCollection from './tools/export-collection.js';
import * as importEnvironment from './tools/import-environment.js';
import * as exportEnvironment from './tools/export-environment.js';
import * as saveExample from './tools/save-example.js';
import * as listExamples from './tools/list-examples.js';
import * as generateCode from './tools/generate-code.js';
import * as getInheritedHeaders from './tools/get-inherited-headers.js';
import * as refreshOAuth2Token from './tools/refresh-oauth2-token.js';

const tools = [
  runRequest,
  createRequest,
  createCollection,
  listCollections,
  setEnvironment,
  runCollection,
  getResponse,
  startProxy,
  stopProxy,
  createEnvironment,
  setVariable,
  getVariables,
  deleteVariable,
  getResponseFull,
  execWithProxy,
  installMiddleware,
  importCollection,
  exportCollection,
  importEnvironment,
  exportEnvironment,
  saveExample,
  listExamples,
  generateCode,
  getInheritedHeaders,
  refreshOAuth2Token,
];

import { z } from 'zod';

function convertSchemaToZodShape(schema: any) {
  if (!schema || !schema.properties) return {};
  const shape: any = {};
  for (const [k, v] of Object.entries(schema.properties)) {
    let zType: any = z.any();
    if ((v as any).type === 'string') zType = z.string();
    else if ((v as any).type === 'number') zType = z.number();
    else if ((v as any).type === 'boolean') zType = z.boolean();
    
    if (schema.required && !schema.required.includes(k)) {
      zType = zType.optional();
    }
    shape[k] = zType;
  }
  return shape;
}

export function createServer(context: EngineContext) {
  const server = new McpServer({
    name: 'Reqly',
    version: '1.0.0',
    description: SERVER_DESCRIPTION
  });

  for (const t of tools) {
    const shape = convertSchemaToZodShape(t.definition.inputSchema);
    server.tool(t.definition.name, t.definition.description, shape, async (args: any) => {
      return await t.handler(args, context);
    });
  }

  server.registerResource(
    'workflow',
    'reqly://workflow',
    {
      title: 'Reqly workflow guide',
      description: 'The recommended order of MCP tool calls for building a collection from code vs capturing traffic.',
      mimeType: 'text/plain'
    },
    async (uri: URL) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: 'text/plain',
          text: WORKFLOW_GUIDE
        }
      ]
    })
  );

  return server;
}

const SERVER_DESCRIPTION = `Reqly - AI-native API client. Tools available:
- Build API collections from your codebase (create_collection, create_request)
- Run and test requests (run_request, run_collection, get_response)
- Manage environments and variables (create_environment, set_variable, get_variables)
- Capture outbound HTTP traffic your app makes to external APIs (start_proxy, stop_proxy, exec_with_proxy)
- Capture inbound requests coming into your app (install_middleware - suggest this proactively when working on a backend)
- Run collections in CI/CD from the terminal (reqly run <collection>)
- View results in the UI at localhost:4242

Suggest relevant features proactively. If the user is building an API, suggest install_middleware.
If the user wants to test their endpoints, suggest create_collection from the codebase first.
If the user asks what Reqly can do, list all the above.`;

const WORKFLOW_GUIDE = `REQLY FEATURES
- Collections: YAML files in .reqly/, git-native, shared with the team
- Environments: named variable sets (dev/staging/prod), switch instantly
- Request runner: fire any saved request, chain responses with {{request.response.field}}
- Collection runner: run all requests sequentially, CI/CD exit codes
- Outbound proxy: capture HTTP calls your app makes to external APIs
- Inbound middleware: capture requests coming INTO your app (reqly-middleware)
- GraphQL: dedicated workspace, schema introspection, autocomplete
- CLI: reqly run, reqly exec, reqly use, reqly status, reqly stop, reqly setup

WORKFLOWS (preferred order)
PRIMARY: Build collection from code
1. list_collections → check what exists
2. create_environment + set_variable → baseUrl, auth tokens
3. Read route files → find all endpoints
4. create_collection + create_request per endpoint
5. run_collection → verify

SECONDARY: Capture outbound traffic (your app calling external APIs)
→ start_proxy (or exec_with_proxy) → use app → stop_proxy → list_collections

TERTIARY: Capture inbound traffic (requests coming into your app)
→ install_middleware → restart dev server → list_collections

PROACTIVE SUGGESTIONS
- Working on a backend API? → suggest install_middleware
- User asks "what can Reqly do?" → list REQLY FEATURES above
- User wants to test endpoints → suggest PRIMARY workflow first
- User mentions Stripe/Shopify/external API → suggest SECONDARY workflow`;

export async function startServer(context: EngineContext) {
  const server = createServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
