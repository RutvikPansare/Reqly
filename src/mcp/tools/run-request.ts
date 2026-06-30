import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { checkContract } from './contract-helper.js';

export const definition: ToolDefinition = {
  name: 'run_request',
  description: "Fires a saved request and returns the response. When to use: to verify a request actually works after creating it, or to debug a failing endpoint. Preferred pattern: call list_collections first if you don't know the exact request name. If the response is a 401, use set_variable to set the auth token then retry. Return shape includes a testResults array: [{ name: string, passed: boolean, error?: string }] - one entry per test() call in the request's postScript; empty array if the request has no postScript or no test() calls. postScript supports two Chai plugins: expect(val).to.have.jsonSchema(schema) validates against a JSON Schema; expect(val).to.have.jsonBody(subset) does partial deep-match ignoring extra fields. Both produce entries in testResults.",
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
    const collectionVars = await context.collectionManager.getCollectionVariables(args.collectionName);
    const { resolveCollectionAuth } = await import('../../engine/collection-auth.js');
    const collectionAuth = await resolveCollectionAuth(
      await context.collectionManager.getCollectionAuth(args.collectionName),
      context.authManager,
    );
    const res = await context.executeRequest(req, env || undefined, auth, shouldTruncate, undefined, collectionVars, collectionAuth, args.collectionName);

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

    const contractResult = await checkContract(context, args.collectionName, req, res);
    const contractViolations = contractResult ? contractResult.violations : null;

    const testResults = agentResponse.testResults ?? [];
    return { content: [{ type: 'text', text: JSON.stringify({ response: agentResponse, assertions: assertionsResult, diff, contractViolations, testResults }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
