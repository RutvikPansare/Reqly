import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { importFromFile, ImportFormat } from '../../engine/importer.js';

const VALID_FORMATS: ImportFormat[] = ['postman', 'bruno', 'insomnia', 'openapi'];

export const definition: ToolDefinition = {
  name: 'import_collection',
  description: 'Imports a collection into Reqly from a file. Supported formats: "postman" (Postman v2.1 JSON), "bruno" (Bruno .bru file or directory), "insomnia" (Insomnia v4 JSON export), "openapi" (OpenAPI 3.0 or Swagger 2.0 JSON/YAML). When to use: when a developer already has an existing collection and wants to switch to Reqly without re-creating requests manually. Preferred pattern: call list_collections first to check what already exists, then import. After import, call list_collections again to verify the requests landed correctly.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Absolute path to the collection file (JSON/YAML for Postman/Insomnia/OpenAPI) or a directory of .bru files for Bruno'
      },
      format: {
        type: 'string',
        enum: VALID_FORMATS,
        description: 'Import format: "postman", "bruno", "insomnia", or "openapi"'
      }
    },
    required: ['source', 'format']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const format = args.format as ImportFormat;
    if (!VALID_FORMATS.includes(format)) {
      return { content: [{ type: 'text', text: `format must be one of: ${VALID_FORMATS.join(', ')}` }], isError: true };
    }
    const result = await importFromFile(args.source, format, context.collectionManager);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
