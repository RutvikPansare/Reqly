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

- [ ] **T-169** GraphQL Headers + Auth Tab
  - UI: Add a "Headers" sub-tab next to Query and Variables using `KeyValueEditor` (same component REST requests use); rows are key/value pairs with per-row enable/disable toggles
  - Execution: custom headers merge with the default `Content-Type: application/json`; auth from collection/environment/profile injects via the same auth precedence chain as REST (so Bearer tokens, API keys all work automatically)
  - Introspection must carry these same custom headers so auth-gated introspection works (currently introspection fires with no headers)
  - Save/load: `RequestConfig.headers` persists to collection YAML; headers restore correctly when loading a saved GraphQL request from Collections
  - TDD: `http-executor.test.ts` - custom headers merged with Content-Type, auth header injected for `type: graphql`

- [ ] **T-170** Full Introspection Query + Schema Persistence
  - Replace the current truncated `INTROSPECTION_QUERY` constant with `getIntrospectionQuery()` from the `graphql` npm package (already installed) - this includes descriptions, deprecation, args, input types, and directives that the current query omits
  - Persist introspected schema to `.reqly/.schema-cache/<sha256-of-url>.json` via a new REST endpoint `POST /api/schema-cache` + `GET /api/schema-cache?url=<encoded>`; the server writes/reads from the project's `.reqly/` directory
  - On workspace open: if a cache file exists for the current URL, auto-load it; a small badge shows "schema (cached)" with a timestamp
  - "Refresh Schema" button re-runs introspection and overwrites the cache; button shows as "Refresh" when cached, "Introspect" when no cache exists
  - TDD: server route tests for schema-cache read/write; cache file named by URL hash so different endpoints don't collide

- [ ] **T-171** Schema / Docs Explorer Sidebar
  - Collapsible panel on the right side of the GraphQL workspace (toggle with a "Docs" button in the toolbar); defaults closed
  - Content: root types at the top (Query, Mutation, Subscription with field counts), then all named types grouped by kind (OBJECT, INPUT_OBJECT, ENUM, SCALAR, INTERFACE, UNION)
  - Each type row expands to show its fields with their return types and descriptions from the schema
  - Click a field name: inserts the field at the cursor in the query editor (smart insert - adds selection set braces for object types)
  - Deprecated fields shown with strikethrough and an amber warning icon; include the `deprecationReason` in a tooltip
  - Search bar filters types and fields by name in real time
  - Requires T-170's full introspection (descriptions come from the complete schema)

- [ ] **T-172** Rich Autocomplete, Linting + Hover Docs
  - Requires T-170 (full schema) to work correctly - current `cm6-graphql` integration is limited by the truncated introspection
  - Autocomplete: fields, arguments, fragment spreads, directives, input values, enum values - context-aware based on cursor position in the document
  - Linting: red squiggles for unknown fields, wrong argument types, missing required arguments, unused variables, undefined fragments
  - Hover tooltips: show the field's description and type signature from the schema on hover
  - Variable awareness: if the query declares `$id: ID!`, and the variables pane is missing `id`, show a warning indicator on the Variables tab

- [ ] **T-173** operationName Support (Type + Engine + UI)
  - Extend `GraphQLConfig` in `src/types/request.ts` to include `operationName?: string`
  - Engine (`http-executor.ts`): include `operationName` in the POST body when set - the GraphQL spec requires this when a document contains multiple operations
  - MCP: `run_request` for `type: graphql` passes `operationName` through transparently; documented in the tool description
  - UI: parse the query document in real time using `graphql`'s `parse()`; if multiple named operations exist (e.g., `query A {}` and `mutation B {}`), show a compact dropdown above the editor; the selected operation name is sent with the request and saved in `graphql.operationName`
  - TDD: `http-executor.test.ts` - operationName included in body when set, omitted when undefined; multi-operation document without a selection throws a clear error

- [ ] **T-174** Prettify + Copy as cURL
  - Prettify: "Prettify" button in the Query toolbar; uses `graphql` package's `parse()` + `print()` to format the query - no additional deps needed; invalid queries that can't parse show a brief error toast instead of silently failing
  - Copy as cURL: "Copy as cURL" button generates the equivalent `curl -X POST` command for the current request (URL, all headers including auth, JSON body with query/variables/operationName) and copies to clipboard; useful for sharing and debugging
  - Both buttons live in the right side of the Query tab toolbar

- [ ] **T-175** GraphQL-Aware Response Viewer
  - When the response body is `{ data, errors, extensions }` (any combination), split the response pane into named sections instead of showing raw JSON:
    - "Errors" section: red highlighted panel at the top (above data) - shown only when `errors` array is non-empty; lists each error's `message`, `locations`, and `path` in a scannable format so errors are never buried
    - "Data" section: collapsible JSON tree, same viewer as REST responses; collapsed by default when errors are present, expanded by default when clean
    - "Extensions" section: collapsed by default; shows tracing, rate limit, or debug info that servers add here
  - Status indicator badge next to latency: green check (data, no errors), red X (errors only or errors + no data), yellow warning (partial data + errors)
  - Falls back to the standard JSON viewer for non-GraphQL responses (when the body doesn't match `{ data?, errors?, extensions? }`)
  - Component: `GraphQLResponseViewer.tsx` alongside `ResponseViewer.tsx`; `GraphQLWorkspace.tsx` switches between them based on response shape

- [ ] **T-176** Load Saved GraphQL Request from Collection
  - Clicking a `type: graphql` request in the Collections sidebar must switch to the GraphQL workspace and populate: URL, query, variables, headers, auth, and operationName - the full saved state
  - Currently clicking any request opens the REST workspace; this task adds routing so `type: graphql` requests route to the GraphQL workspace instead
  - Two-way round-trip guarantee: save a request then load it - all fields must be identical
  - If the GraphQL workspace has unsaved edits, show a confirmation before overwriting (same UX pattern as REST workspace switching)
  - MCP: `get_request` already returns the full request config including `graphql` block; no MCP changes needed, but update the tool description to document the `graphql` field

- [ ] **T-177** MCP `introspect_graphql` Tool
  - New MCP tool in `src/mcp/tools/introspect-graphql.ts`
  - Input: `{ url: string, headers?: Record<string, string> }`
  - Runs the full `getIntrospectionQuery()` against the endpoint with the provided headers, parses the result
  - Returns: `{ queryType, mutationType, subscriptionType, types: [{ name, kind, description, fields: [{ name, type, description, args }] }] }` - structured so agents can understand the API surface without reading raw introspection JSON
  - Also writes to the schema cache (reuses the same cache as T-170) so the UI benefits from introspection triggered by an agent
  - Agents use this to discover what operations a GraphQL API supports before writing queries with `run_request`
  - TDD: `introspect-graphql.test.ts` - success path returns structured types, custom auth header forwarded to the endpoint, invalid URL returns `isError: true` with a clear message, introspection disabled (403) returns a helpful error

- [ ] **T-178** GraphQL Subscriptions (WebSocket)
  - Support the `graphql-ws` protocol (RFC, used by Apollo 3+, Hasura, Strawberry); add `graphql-ws` as a dependency
  - New request type `type: graphql-subscription` in collection YAML; `graphql.subscriptionTransport: 'graphql-ws'` (default) or `'legacy'` for `subscriptions-transport-ws` (Apollo 2)
  - UI: "Connect" / "Disconnect" button replaces Send; live append-only message stream below the query editor with a timestamp and a direction indicator per message (received / error / complete)
  - Stream panel auto-scrolls to the latest message; "Clear" button wipes the log
  - MCP: `run_request` for `type: graphql-subscription` connects, buffers messages for `streamTimeout` seconds (default 5, configurable on the request), then disconnects and returns `{ messages: [{ data, timestamp }], truncated: boolean }` so agents can assert on streaming endpoints headlessly
  - TDD: mock WebSocket server - message buffering, `truncated: true` on timeout, clean disconnect on `complete`, error frame mapped to `isError: true`
  - **Use Sonnet for this task** - WebSocket lifecycle and streaming state in React require careful design
