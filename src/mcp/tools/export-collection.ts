import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';
import { exportToPostman, exportToOpenApi, exportToDocs } from '../../engine/exporter.js';

export const definition: ToolDefinition = {
  name: 'export_collection',
  description: "Exports a collection to a portable format. Use 'postman' to generate a Postman v2.1 JSON file that can be imported into Postman or Insomnia. Use 'openapi' to generate an OpenAPI 3.0 JSON spec. Use 'docs' to generate a Markdown API reference. Returns the exported content as a string.",
  inputSchema: {
    type: 'object',
    properties: {
      collectionName: { type: 'string', description: 'Name of the collection to export' },
      format: { type: 'string', description: "Export format: 'postman', 'openapi', or 'docs'" },
    },
    required: ['collectionName', 'format'],
  },
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const { collectionName, format } = args as { collectionName: string; format: 'postman' | 'openapi' | 'docs' };
    if (!['postman', 'openapi', 'docs'].includes(format)) {
      return { content: [{ type: 'text', text: `Unknown format "${format}". Use "postman", "openapi", or "docs".` }], isError: true };
    }

    const collection = await context.collectionManager.getCollection(collectionName);
    const exported = format === 'docs' ? exportToDocs(collection) : format === 'postman' ? exportToPostman(collection) : exportToOpenApi(collection);

    return { content: [{ type: 'text', text: JSON.stringify({ format, collectionName, content: exported }) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
