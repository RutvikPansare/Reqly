import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'set_dotenv_files',
  description: 'Sets which .env-style files Reqly loads as the lowest-priority variable layer (below collection vars and environment vars). Persists the file list and reloads immediately - no restart needed. Later files in the list win on key collision (e.g. [".env", ".env.local"] means .env.local overrides .env). When to use: when a project keeps secrets across multiple env files and the agent needs requests to resolve {{SOME_SECRET}} from them without ever writing the value into a collection file.',
  inputSchema: {
    type: 'object',
    properties: {
      files: { type: 'array', items: { type: 'string' }, description: 'Ordered list of .env file paths, relative to the project root' }
    },
    required: ['files']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    await context.authManager.setDotenvFiles(args.files);
    context.dotEnvLoader.setFiles(args.files);
    await context.dotEnvLoader.load();

    const counts: Record<string, number> = {};
    for (const file of args.files) counts[file] = 0;
    for (const v of context.dotEnvLoader.getVariables()) {
      counts[v.source] = (counts[v.source] || 0) + 1;
    }

    return { content: [{ type: 'text', text: JSON.stringify({ files: args.files, variableCounts: counts }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
