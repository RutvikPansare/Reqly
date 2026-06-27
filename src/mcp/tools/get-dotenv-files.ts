import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_dotenv_files',
  description: 'Returns which .env-style files Reqly is currently loading and which keys they define. Values are omitted for security - use get_variables to resolve a specific key at runtime. When to use: to check whether a .env file is actually being picked up before debugging why a {{VAR}} is not resolving.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handler(_args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const files = context.dotEnvLoader.getFiles();
    const variables = context.dotEnvLoader.getVariables().map(v => ({ key: v.key, source: v.source }));
    return { content: [{ type: 'text', text: JSON.stringify({ files, variables }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
