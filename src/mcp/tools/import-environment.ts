import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'import_environment',
  description:
    "Imports a Postman environment JSON string and creates (or replaces) the environment in Reqly. " +
    "Pass the raw JSON content of the Postman .postman_environment.json file. " +
    "Returns the environment name and variable count on success. " +
    "Use nameOverride to import under a different name than the one stored in the JSON.",
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Raw Postman environment JSON content (the full .postman_environment.json file contents)',
      },
      nameOverride: {
        type: 'string',
        description: 'Optional: import under this name instead of the name in the JSON',
      },
    },
    required: ['content'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const { content, nameOverride } = args as { content: string; nameOverride?: string };
    const env = await context.environmentManager.importEnvironmentFromPostman(content, nameOverride);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: env.name,
          variableCount: Object.keys(env.variables).length,
          variables: Object.keys(env.variables),
        }),
      }],
    };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
