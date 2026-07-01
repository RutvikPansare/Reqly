import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

// ---------------------------------------------------------------------------
// list_grpc_services.ts  (T-167)
//
// MCP tool: discover gRPC services via server reflection.
// Returns the list of service names and their raw FileDescriptorProto blobs.
// Agents use this when a gRPC server has reflection enabled and no .proto
// file is available locally.
// ---------------------------------------------------------------------------

export const definition: ToolDefinition = {
  name: 'list_grpc_services',
  description: "Discovers gRPC services and methods from a running server using gRPC server reflection. Use this when no .proto file is available - the server must have grpc.reflection.v1alpha.ServerReflection enabled. Returns: { services: [{ name }], rawFileDescriptors: Buffer[] }. After calling this, use the service names with create_request (type: grpc) to save requests. The server must be running and accessible.",
  inputSchema: {
    type: 'object',
    properties: {
      serverUrl: {
        type: 'string',
        description: 'gRPC server address, e.g. "localhost:50051"',
      },
      insecure: {
        type: 'boolean',
        description: 'Use insecure (plaintext) channel. Default: true.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 10000)',
      },
    },
    required: ['serverUrl'],
  },
};

export async function handler(args: any, _context: EngineContext): Promise<ToolHandlerResult> {
  try {
    const { discoverServicesViaReflection } = await import('../../engine/grpc-reflection.js');
    const result = await discoverServicesViaReflection(args.serverUrl, {
      insecure: args.insecure !== false,
      timeoutMs: args.timeoutMs,
    });

    if (result.isError) {
      return { content: [{ type: 'text', text: result.errorMessage ?? 'Reflection failed' }], isError: true };
    }

    // Don't send raw binary blobs to the agent - just the service names and count
    const summary = {
      services: result.services,
      fileDescriptorCount: result.rawFileDescriptors.length,
    };

    return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}
