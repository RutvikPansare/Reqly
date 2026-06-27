import type { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'stop_mock',
  description: 'Stops the running mock server. No-op if the mock is not currently running.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.mockServer!.stop();
    return { content: [{ type: 'text', text: 'Mock server stopped.' }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
