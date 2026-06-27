import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'get_variables',
  description: 'Lists all variables in a named environment, or the active environment if no name is given. When to use: to check what baseUrl/tokens already exist before calling set_variable, or to debug why a {{variable}} in a request is not resolving.',
  inputSchema: {
    type: 'object',
    properties: {
      environment: { type: 'string' }
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
    return { content: [{ type: 'text', text: JSON.stringify([...vars, ...dotenvVars]) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
