# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

### Hardening (pick up immediately - ahead of M7)

- [x] **T-162** Harden `--project-dir` macro detection and fix switch-project failure logic
  - **Context:** Antigravity passed the literal string `${workspaceFolder}` to `--project-dir`. Gemini's fix caught that exact string. Two deeper issues remain:
    1. The macro detection is too narrow - other tools could send `$WORKSPACE_FOLDER`, `%WORKSPACE_FOLDER%`, `{workspaceFolder}` or any other uninterpolated pattern
    2. The switch-project failure logic has a dangerous assumption: when `POST /api/switch-project` returns a 4xx, the new MCP process currently treats it as "no server running" and tries to start its own Express on port 4242 - causing EADDRINUSE crash. Gemini's macro fix prevents the chain from starting, but the logic flaw is still live for any future legitimate switch failure

  **Fix 1 - Broad macro regex in `cli-parser.ts`:**
  - Replace the exact string check with a regex that rejects any flag value matching an unresolved macro pattern: `/^\$\{.+\}$|^\%.+\%$|^\{.+\}$/`
  - Covers `${workspaceFolder}`, `%WORKSPACE_FOLDER%`, `{workspaceFolder}` and similar
  - Log a warning when a macro is detected and ignored: "Ignoring --project-dir value that looks like an unresolved macro: <value>. Falling back to next source."

  **Fix 2 - Distinguish switch-project rejection from server-not-running in the MCP startup path:**
  - Currently: any failure from `POST /api/switch-project` → attempt to start new Express server
  - Correct behaviour:
    - `ECONNREFUSED` (server not running) → start new Express + MCP server as normal
    - `4xx` from switch-project (server running but rejected the path, e.g. path doesn't exist) → start in MCP-only mode using the running server's current project; log a warning that the requested path was rejected
    - `5xx` or network error → log error, start in MCP-only mode, do not attempt to bind port 4242
  - The rule: only bind port 4242 when ECONNREFUSED proves no server is listening. Never bind on a 4xx or 5xx.

  **Fix 3 - `configSource` in `get_project` MCP response:**
  - Extend `GET /api/project` and the `get_project` MCP tool response with two new fields:
    - `configSource: "flag" | "env" | "config" | "cwd"` - which priority level won
    - `fallbackReason?: string` - present only when a higher-priority source was detected but ignored (e.g. "flag was an unresolved macro: ${workspaceFolder}")
  - Agents can call `get_project` on startup to verify they are working in the expected directory

  - TDD required: `cli-parser.test.ts` - macro regex catches all patterns, valid paths pass through; `startup.test.ts` - 4xx switch response triggers mcp-only mode not EADDRINUSE, ECONNREFUSED triggers full server start

### M6 - Script Power + Developer UX



- [x] **T-161** `preScriptFile` / `postScriptFile` - script file references in requests

### M7 - Data & CI Power





### Protocol Expansion (Later)

- [ ] **T-151** WebSocket / SSE support
  - `type: websocket` and `type: sse` request types stored in collection YAML alongside REST requests
  - UI: persistent connection panel with live message stream; send messages (WebSocket); read event stream (SSE)
  - MCP tool `run_request` handles both types; response is the first message or first N events for MCP consumers

- [ ] **T-150** gRPC support
  - `type: grpc` in collection YAML with `protoFile`, `service`, `method`, `message` fields
  - `.proto` file stored at `.reqly/collections/<name>/service.proto`
  - UI: method picker dropdown populated from proto service definition; JSON-form input for request message; response viewer shows decoded message
  - Unary RPCs for v1; streaming in v2
  - MCP tool `run_request` handles `type: grpc` transparently

- [ ] **T-148** Client certificates / mTLS
  - Per-collection or per-request client certificate (PEM cert + key pair)
  - Cert paths referenced in collection YAML; actual files stored in `~/.reqly/certs/` (never committed)
  - UI: "Certificate" tab in collection settings modal and request Auth tab; file picker for cert + key
  - HTTP executor passes cert to `undici` dispatcher at request time
  - `set_collection_auth` MCP tool extended with `type: mtls` and cert path params
  - TDD required: `cert-loader.test.ts` - cert file read, invalid path error, cert passed through to executor options
