import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { CollectionRunner } from '../../engine/collection-runner.js';

export const definition: ToolDefinition = {
  name: 'run_collection',
  description: 'Runs all requests in a collection sequentially and returns pass/fail per request. When to use: after building a collection with create_request, to verify every endpoint actually works end to end. Each result in the results array includes a testResults field: [{ name: string, passed: boolean, error?: string }] - one entry per test() call in that request\'s postScript; empty array if the request has no postScript or no test() calls. Scripts can control collection flow: reqly.runner.stop() halts the run immediately (stoppedEarly: true in response), reqly.setNextRequest(name) jumps to a named request (jumpedTo: string in response), reqly.sleep(ms) pauses before the next request. The response shape includes: stoppedEarly (boolean), jumpedTo (string or undefined).',
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string' }
    },
    required: ['collectionName']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const env = await context.environmentManager.getActiveEnvironment();
    const runner = new CollectionRunner(context);
    const result = await runner.run(args.collectionName, { environment: env || undefined });
    const normalized = {
      ...result,
      results: result.results.map(r => ({ ...r, testResults: r.response?.testResults ?? [] })),
    };

    return { content: [{ type: 'text', text: JSON.stringify(normalized, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
