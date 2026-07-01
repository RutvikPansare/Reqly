// ---------------------------------------------------------------------------
// proto-scaffold.ts  (T-166)
//
// Generates a JSON scaffold (default-value object) from a proto field
// descriptor list. The descriptor format is the simplified representation
// we extract from @grpc/proto-loader output.
//
// Used by:
//   - create_request MCP tool: returns the scaffold in the response so agents
//     know the exact message shape without guessing.
//   - gRPC workspace UI: pre-populates the JSON editor on method select.
// ---------------------------------------------------------------------------

export interface ProtoField {
  name: string;
  /**
   * Scalar: 'string' | 'int32' | 'int64' | 'uint32' | 'uint64' | 'sint32' |
   *         'sint64' | 'fixed32' | 'fixed64' | 'sfixed32' | 'sfixed64' |
   *         'float' | 'double' | 'bool' | 'bytes'
   * Composite: 'message' | 'enum' | 'oneof'
   */
  type: string;
  /** For type: 'message' - fully qualified type name, e.g. 'google.protobuf.Timestamp' */
  typeName?: string;
  /** Whether the field is repeated (array in JSON) */
  repeated?: boolean;
  /** For type: 'message' - recursive field list */
  fields?: ProtoField[];
}

const NUMERIC_TYPES = new Set([
  'int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64',
  'fixed32', 'fixed64', 'sfixed32', 'sfixed64', 'float', 'double',
]);

/**
 * Generates a JSON scaffold from a list of proto field descriptors.
 * Each field receives a sensible default value:
 *   - string  -> ""
 *   - numeric -> 0
 *   - bool    -> false
 *   - bytes   -> ""
 *   - enum    -> 0
 *   - oneof   -> null
 *   - message -> recursively scaffolded object (or {} if no fields)
 *   - repeated -> [] (regardless of element type)
 */
export function scaffoldMessage(fields: ProtoField[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    // Repeated fields are always an array, regardless of element type.
    if (field.repeated) {
      result[field.name] = [];
      continue;
    }

    result[field.name] = defaultValueFor(field);
  }

  return result;
}

function defaultValueFor(field: ProtoField): unknown {
  if (field.type === 'string' || field.type === 'bytes') return '';
  if (NUMERIC_TYPES.has(field.type)) return 0;
  if (field.type === 'bool') return false;
  if (field.type === 'enum') return 0;
  if (field.type === 'oneof') return null;
  if (field.type === 'message') {
    return scaffoldMessage(field.fields ?? []);
  }
  // Unknown types fall back to null
  return null;
}
