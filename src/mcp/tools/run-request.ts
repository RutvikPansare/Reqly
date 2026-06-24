import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'run_request',
  description: 'Fire a saved request by name.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
      requestName: { type: 'string' }
    },
    required: ['collectionName', 'requestName']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const req = await context.collectionManager.getRequest(args.collectionName, args.requestName);
    const env = await context.environmentManager.getActiveEnvironment();
    
    let auth;
    if (req.authProfileId) {
      auth = await context.authManager.getProfile(req.authProfileId);
    }

    const res = await context.executeRequest(req, env || undefined, auth);

    let assertionsResult = undefined;
    if (req.assertions && req.assertions.length > 0) {
      const { runAssertions } = await import('../../engine/assertion-runner.js');
      assertionsResult = runAssertions(res, req.assertions);
    }

    // Store in cache
    context.responseStore.set(req.name, res);
    context.historyStore.append(req, res, { collectionName: args.collectionName });

    return { content: [{ type: 'text', text: JSON.stringify({ response: res, assertions: assertionsResult }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
