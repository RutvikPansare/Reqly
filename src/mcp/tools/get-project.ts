import path from 'path';
import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_project',
  description: 'Returns the absolute path of the project directory Reqly is currently pointed at (the parent of its .reqly collections folder). When to use: to confirm which project Reqly is operating on before reading or writing collections, especially after a switch_project call.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const projectDir = path.dirname(context.collectionManager.getBaseDir());
    return { content: [{ type: 'text', text: JSON.stringify({ projectDir }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
