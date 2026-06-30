import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_variables',
  description: 'Lists all variables in a named environment (or active environment), plus any variables set during the last script run if collectionName is provided. When to use: to check what baseUrl/tokens already exist before calling set_variable, or to debug why a {{variable}} in a request is not resolving. Script variables have source: "script".',
  inputSchema: {
    type: 'object',
    properties: {
      environment: { type: 'string' },
      collectionName: { type: 'string', description: 'Include runtime variables set by scripts in this collection' }
    }
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    let env;
    if (args.environment) {
      env = await context.environmentManager.getEnvironment(args.environment);
    } else {
      env = await context.environmentManager.getActiveEnvironment();
      if (!env) {
        throw new Error('No active environment is set.');
      }
    }
    
    const vars = Object.entries(env.variables).map(([key, value]) => ({ key, value, source: env.name }));
    const dotenvVars = (context.dotEnvLoader?.getVariables() || []).map(v => ({ key: v.key, value: v.value, source: v.source }));
    
    let scriptVars: { key: string, value: string, source: string }[] = [];
    if (args.collectionName && context.scriptVariableStore) {
      const storeVars = context.scriptVariableStore.getAll(args.collectionName);
      scriptVars = Object.entries(storeVars).map(([key, value]) => ({ key, value, source: 'script' }));
    }

    return { content: [{ type: 'text', text: JSON.stringify([...vars, ...dotenvVars, ...scriptVars]) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
