import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'export_environment',
  description:
    "Exports a named Reqly environment as a Postman environment JSON string. " +
    "The returned content can be saved as a .postman_environment.json file and imported directly into Postman or Insomnia. " +
    "Returns the environment name and the full JSON content as a string.",
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the environment to export',
      },
    },
    required: ['name'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const { name } = args as { name: string };
    const content = await context.environmentManager.exportEnvironmentToPostman(name);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ name, content }),
      }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
