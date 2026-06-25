import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { importFromFile } from '../../engine/importer.js';

export const definition: ToolDefinition = {
  name: 'import_collection',
  description: 'Imports an existing Postman v2.1 collection (JSON) or Bruno request file (.bru) or Bruno collection directory into Reqly. When to use: when a developer already has a Postman or Bruno collection and wants to switch to Reqly without re-creating requests manually. Preferred pattern: call list_collections first to check what already exists, then import. After import, call list_collections again to verify the requests landed correctly.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Absolute path to a Postman JSON file, a Bruno .bru file, or a directory of .bru files'
      },
      format: {
        type: 'string',
        description: 'Import format: "postman" for Postman v2.1 JSON, "bruno" for Bruno .bru files'
      }
    },
    required: ['source', 'format']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const format = args.format as 'postman' | 'bruno';
    if (format !== 'postman' && format !== 'bruno') {
      return { content: [{ type: 'text', text: 'format must be "postman" or "bruno"' }], isError: true };
    }
    const result = await importFromFile(args.source, format, context.collectionManager);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
