import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { CollectionRunner } from '../../engine/collection-runner.js';

export const definition: ToolDefinition = {
  name: 'run_collection',
  description: 'Runs all requests in a collection sequentially and returns pass/fail per request. When to use: after building a collection with create_request, to verify every endpoint actually works end to end.',
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

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
