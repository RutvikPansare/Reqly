import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'run_request',
  description: "Fires a saved request and returns the response. When to use: to verify a request actually works after creating it, or to debug a failing endpoint. Preferred pattern: call list_collections first if you don't know the exact request name. If the response is a 401, use set_variable to set the auth token then retry.",
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' },
      requestName: { type: 'string' },
      truncate: { type: 'boolean', description: 'Whether to truncate large responses (default: true)' }
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

    const shouldTruncate = args.truncate !== undefined ? args.truncate : true;
    const res = await context.executeRequest(req, env || undefined, auth, shouldTruncate);

    let assertionsResult = undefined;
    if (req.assertions && req.assertions.length > 0) {
      const { runAssertions } = await import('../../engine/assertion-runner.js');
      assertionsResult = runAssertions(res, req.assertions);
    }

    // Store in cache and history
    context.responseStore.set(req.name, res);
    context.historyStore.append(req, res, { collectionName: args.collectionName });

    // Compute diff against the previous run (the entry we just appended is [0],
    // the prior run is [1] if it exists)
    let diff = undefined;
    const lastTwo = context.historyStore.getLastTwo(req.name);
    if (lastTwo.length === 2) {
      const { diffResponses } = await import('../../engine/response-differ.js');
      diff = diffResponses(lastTwo[1], lastTwo[0]);
    }

    // Strip fullBody so we don't blow up the agent's context window
    const agentResponse = { ...res };
    delete agentResponse.fullBody;

    return { content: [{ type: 'text', text: JSON.stringify({ response: agentResponse, assertions: assertionsResult, diff }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
