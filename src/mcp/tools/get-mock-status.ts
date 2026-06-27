import type { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_mock_status',
  description:
    'Returns the current status of the mock server: whether it is running, which collection it is serving, the port, and the list of active routes with example counts.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const status = context.mockServer!.getStatus();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
