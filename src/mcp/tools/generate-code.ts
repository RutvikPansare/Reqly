import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { generateCode, CodeTarget } from '../../engine/code-generator.js';

const VALID_TARGETS: CodeTarget[] = ['curl', 'fetch', 'axios'];

export const definition: ToolDefinition = {
  name: 'generate_code',
  description: 'Generates a code snippet for a given HTTP request in the specified language/library. Use this when a developer needs to reproduce a request in their application code. Returns the snippet as a string. Supported targets: "curl" (shell), "fetch" (browser/Node.js), "axios" (Node.js).',
  inputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', description: 'HTTP method (GET, POST, PUT, PATCH, DELETE)' },
      url: { type: 'string', description: 'Full request URL including query string' },
      target: { type: 'string', enum: VALID_TARGETS, description: 'Output format: "curl", "fetch", or "axios"' },
      headers: { type: 'object', description: 'Optional headers as key-value pairs', additionalProperties: { type: 'string' } },
      body: { type: 'string', description: 'Optional request body as a string' },
    },
    required: ['method', 'url', 'target'],
  },
};

export async function handler(args: any, _context: EngineContext): Promise<ToolHandlerResult> {
  const { method, url, target, headers, body } = args;
  if (!VALID_TARGETS.includes(target)) {
    return { content: [{ type: 'text', text: `target must be one of: ${VALID_TARGETS.join(', ')}` }], isError: true };
  }
  try {
    const code = generateCode({ method: method ?? 'GET', url: url ?? '', headers, body }, target as CodeTarget);
    return { content: [{ type: 'text', text: JSON.stringify({ target, code }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
