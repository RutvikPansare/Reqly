# Reqly - Todo

## Queue

### M6 - Script Power + Developer UX

### M7 - Data & CI Power

### Protocol Expansion (Later)

- [ ] **T-151** WebSocket / SSE support ("Realtime" workspace)
  - `type: websocket` and `type: sse` request types stored in collection YAML alongside REST requests
  - UI: dedicated "Realtime" nav rail icon (shares one icon - WebSocket and SSE are both persistent-connection protocols with the same stream-view paradigm; protocol selected by a tab/picker inside the workspace)
  - Realtime workspace: URL bar, Connect/Disconnect button, live append-only message stream panel with timestamps and direction indicators (sent/received), message composer for WebSocket
  - Saved Realtime requests appear in the Collections panel like any other request; opening from Collections switches the editor to the Realtime view
  - MCP tool `run_request` handles both types; for agents it connects, buffers messages for a configurable timeout (default 5s), and returns `{ messages: [...], truncated: boolean }`
  - **Use Sonnet** for this task - streaming state management in UI and MCP buffering model require careful design

### gRPC Epic (replaces original T-150 stub - full BloomRPC-beating scope)

- [ ] **T-164** Core gRPC engine - unary RPCs + multi-file proto support (gRPC workspace)
  - gRPC gets a dedicated nav rail icon and workspace (same reasoning as GraphQL: fundamentally different paradigm - proto loading, service/method browsing, and streaming panels don't fit in the REST request editor)
  - Add `@grpc/grpc-js` and `@grpc/proto-loader` as dependencies
  - Proto files live in `.reqly/protos/` at the project root - users drop their entire proto directory there; configure `includeDirs` on the loader so `import "google/protobuf/timestamp.proto"` and cross-file imports resolve correctly
  - `type: grpc` in collection YAML with fields: `protoFile` (relative to `.reqly/protos/`), `service`, `method`, `message` (JSON object)
  - Engine: `src/engine/grpc-runner.ts` - load proto, create channel, execute unary RPC, return decoded response
  - gRPC status codes are not HTTP codes - response viewer must show gRPC status (OK, NOT_FOUND, UNIMPLEMENTED, UNAVAILABLE etc.) as a distinct field, not reuse the HTTP status badge
  - `run_request` MCP tool routes `type: grpc` to the new runner transparently; response shape: `{ grpcStatus, grpcStatusMessage, body, latency }`
  - TDD required: `grpc-runner.test.ts` - unary call success, gRPC error status returned cleanly, proto not found error, multi-file import resolves correctly

- [ ] **T-165** gRPC metadata + auth integration
  - Reqly's standard `headers` field on a gRPC request maps directly to gRPC Metadata - no separate "metadata" concept needed in the YAML; users set headers as usual
  - Existing auth profiles (Bearer token, API Key) automatically inject into gRPC Metadata (`authorization: Bearer <token>`, `x-api-key: <key>`) using the same auth precedence chain as REST - collection auth > request auth > nothing
  - This is what BloomRPC gets wrong: it requires manual metadata configuration for auth. Reqly does it automatically.
  - TDD required: `grpc-runner.test.ts` - Bearer token injected as `authorization` metadata, API key injected correctly, no auth = no metadata injected, explicit headers merged with auth metadata

- [ ] **T-166** Proto message auto-generation + MCP scaffold
  - When a user selects a gRPC method in the UI, parse the input message type from the loaded proto and auto-generate a JSON scaffold pre-populated with default values: `0` for numeric types, `""` for strings, `false` for bools, `[]` for repeated fields, nested objects for message types, `null` for oneof fields
  - Pre-populate the JSON editor on method select so users see the exact shape immediately
  - `create_request` MCP tool: when `type: grpc` and `service`/`method` are specified, return the auto-generated `message` scaffold in the response so agents don't have to guess the protobuf message structure
  - TDD required: `proto-scaffold.test.ts` - scalar types, nested messages, repeated fields, oneof fields, well-known types (Timestamp, Duration)

- [ ] **T-167** gRPC server reflection - connect without a .proto file
  - If a gRPC server has reflection enabled, Reqly can discover its schema without any `.proto` file
  - UI: "Load from server" button on the gRPC workspace alongside the proto file selector; user enters the server URL and Reqly queries the `grpc.reflection.v1alpha.ServerReflection` service
  - Implementation: call `ServerReflectionInfo` bidirectional streaming RPC, request `FILE_CONTAINING_SYMBOL` for each service, deserialise the returned `FileDescriptorProto` binary blobs, reconstruct service/method/message definitions fully in memory
  - Result populates the method picker and message scaffold identically to file-based loading; user can then save the discovered schema to `.reqly/protos/` with a "Save schema" button
  - **Use Sonnet for this task** - `FileDescriptorProto` deserialisation from binary and cross-reference resolution is non-trivial
  - TDD required: `grpc-reflection.test.ts` - reflection response parsed into service definition, method list correct, message scaffold generated from reflected schema

- [ ] **T-168** Full gRPC streaming support
  - Three streaming modes in addition to unary: server streaming (one request, N responses), client streaming (N requests, one response), bidirectional streaming (N requests, N responses interleaved)
  - YAML: `streaming: server | client | bidirectional` on a grpc request; `messages` array for client/bidirectional (each item is one outbound message)
  - UI: real-time append-only log panel showing each message as it arrives, with timestamp and direction indicator (sent/received); distinct from the standard response viewer
  - MCP / agents: buffer incoming stream messages for a configurable timeout (default 5s, configurable via `streamTimeout` on the request), return `{ messages: [...], truncated: boolean }` so agents can test streaming endpoints headlessly in a single tool call
  - **Use Sonnet for this task** - streaming state management in the UI and MCP buffering model require careful design
  - TDD required: `grpc-runner.test.ts` - server streaming collects all messages, client streaming sends all then receives response, bidirectional interleaves correctly, timeout truncation returns `truncated: true`

### World-Class GraphQL Epic

All tasks T-169 through T-178 completed 2026-06-30. See docs/done.md.

