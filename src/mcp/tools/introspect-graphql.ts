import { fetch } from 'undici';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { getIntrospectionQuery } from 'graphql';
import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'introspect_graphql',
  description:
    'Runs a full GraphQL introspection query against an endpoint and returns a structured summary of the schema: ' +
    'queryType, mutationType, subscriptionType, and all named types (OBJECT, INPUT_OBJECT, ENUM, SCALAR, INTERFACE, UNION) ' +
    'with their fields, field types, field descriptions, and argument names/types. ' +
    'When to use: before writing a query with run_request against a GraphQL API you have not used before, ' +
    'or when you need to know what fields, arguments, or input types are available. ' +
    'Also persists the schema to the project schema cache (.reqly/.schema-cache/) so the UI loads it without re-introspecting. ' +
    'Returns: { queryType, mutationType, subscriptionType, types: [{ name, kind, description, fields: [{ name, type, description, args: [{ name, type }] }] }] }. ' +
    'On failure returns isError: true with a message explaining the problem (invalid URL, HTTP error, introspection disabled).',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The GraphQL endpoint URL' },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Optional HTTP headers (e.g. Authorization) to include with the introspection request',
      },
    },
    required: ['url'],
  },
};

function typeRefToString(type: any): string {
  if (!type) return 'unknown';
  if (type.kind === 'NON_NULL') return `${typeRefToString(type.ofType)}!`;
  if (type.kind === 'LIST') return `[${typeRefToString(type.ofType)}]`;
  return type.name ?? 'unknown';
}

function summariseField(f: any) {
  return {
    name: f.name,
    type: typeRefToString(f.type),
    description: f.description ?? null,
    args: (f.args ?? []).map((a: any) => ({ name: a.name, type: typeRefToString(a.type), description: a.description ?? null })),
  };
}

function summariseType(t: any) {
  const fields = (t.fields ?? t.inputFields ?? []).map(summariseField);
  const enumValues = (t.enumValues ?? []).map((v: any) => ({ name: v.name, description: v.description ?? null }));
  return {
    name: t.name,
    kind: t.kind,
    description: t.description ?? null,
    ...(fields.length > 0 ? { fields } : {}),
    ...(enumValues.length > 0 ? { enumValues } : {}),
  };
}

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  const url: string = args.url ?? '';
  if (!url.trim()) {
    return { content: [{ type: 'text', text: 'url is required' }], isError: true };
  }

  const customHeaders: Record<string, string> = args.headers ?? {};

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...customHeaders },
      body: JSON.stringify({ query: getIntrospectionQuery() }),
    }) as unknown as Response;
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Request failed: ${e.message}` }], isError: true };
  }

  if (!response.ok) {
    const hint =
      response.status === 403 || response.status === 401
        ? ' - Introspection may be disabled or the endpoint requires authentication. Provide an Authorization header.'
        : '';
    return {
      content: [{ type: 'text', text: `HTTP ${response.status} from introspection endpoint${hint}` }],
      isError: true,
    };
  }

  let json: any;
  try {
    json = await (response as any).json();
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Failed to parse introspection response as JSON: ${e.message}` }], isError: true };
  }

  const rawSchema = json?.data?.__schema ?? json?.__schema;
  if (!rawSchema) {
    return { content: [{ type: 'text', text: 'Introspection response did not contain __schema. The endpoint may not be a GraphQL API.' }], isError: true };
  }

  // Filter out internal __* types
  const types = (rawSchema.types ?? [])
    .filter((t: any) => !t.name.startsWith('__'))
    .map(summariseType);

  const result = {
    queryType: rawSchema.queryType?.name ?? null,
    mutationType: rawSchema.mutationType?.name ?? null,
    subscriptionType: rawSchema.subscriptionType?.name ?? null,
    types,
  };

  // Persist to schema cache so the UI benefits from agent introspection
  try {
    const projectRoot = path.dirname(context.collectionManager.getBaseDir());
    const cacheDir = path.join(projectRoot, '.reqly', '.schema-cache');
    await fs.mkdir(cacheDir, { recursive: true });
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    const cacheFile = path.join(cacheDir, `${hash}.json`);
    await fs.writeFile(
      cacheFile,
      JSON.stringify({ url, schema: rawSchema, cachedAt: new Date().toISOString() }),
      'utf8'
    );
  } catch {
    // Cache write failure is non-fatal
  }

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
