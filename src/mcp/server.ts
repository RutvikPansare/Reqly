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

const tools = [
  runRequest,
  createRequest,
  createCollection,
  listCollections,
  setEnvironment,
  runCollection,
  getResponse,
  startProxy,
  stopProxy
];

export function createServer(context: EngineContext) {
  const server = new McpServer({
    name: 'Reqly',
    version: '1.0.0'
  });

  for (const t of tools) {
    server.tool(t.definition.name, t.definition.description, t.definition.inputSchema.properties, async (args: any) => {
      return await t.handler(args, context);
    });
  }

  return server;
}

export async function startServer(context: EngineContext) {
  const server = createServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
