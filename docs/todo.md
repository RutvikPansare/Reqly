# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

### M6 - Script Power + Developer UX



- [ ] **T-156** Script flow control for collection runner
  - `reqly.setNextRequest(name)` - jumps to the named request in the collection run, skipping everything between; name must match a request in the same collection
  - `reqly.runner.stop()` - halts the collection run immediately; remaining requests are skipped, not failed
  - `reqly.sleep(ms)` - pauses execution for `ms` milliseconds before the next request fires; useful for rate-limited APIs
  - All three are no-ops when running a single request outside the collection runner (no error thrown)
  - `setNextRequest` with an unknown name throws immediately with a clear message listing valid request names
  - **MCP:** `run_collection` response gains a `stoppedEarly: boolean` field and a `jumpedTo?: string` field so agents know if a script halted or redirected the run; update `run_collection` tool description
  - TDD required: `flow-control.test.ts` - setNextRequest skips to correct request, runner.stop() halts remaining, sleep() delays by expected duration, no-op outside runner

- [ ] **T-157** Extended Chai assertions: `jsonSchema` and `jsonBody`
  - `jsonSchema` Chai plugin: `expect(res.getBody()).to.have.jsonSchema({ type: 'object', required: ['id'] })` - validates response body against a JSON Schema; Ajv is already a project dependency so no new packages needed
  - `jsonBody` Chai plugin: `expect(res.getBody()).to.have.jsonBody({ id: 1 })` - partial deep match; passes if the response contains all the specified keys/values, ignores extra fields
  - Both registered as Chai plugins in the sandbox setup before any script runs
  - On failure, error message shows: expected schema / actual body excerpt for jsonSchema; expected subset / actual body for jsonBody
  - **MCP:** results from `jsonSchema` and `jsonBody` assertions appear in the same `testResults` array introduced in T-143 - no separate field needed; update `run_request` tool description to note Chai plugin assertions are included
  - TDD required: `chai-plugins.test.ts` - jsonSchema pass, jsonSchema fail (wrong type), jsonSchema fail (missing required), jsonBody pass with extra fields, jsonBody fail

### M7 - Data & CI Power

- [ ] **T-147** Data-driven testing: CSV/JSON collection runner
  - `reqly run <collection> --data data.csv` (or `data.json`) runs the collection once per row
  - Each row's keys become variables for that run at env-var precedence level
  - CSV: first row is header (variable names), subsequent rows are data sets
  - JSON: array of objects, each object is one data set
  - Console output: one labeled result block per row ("Row 1 / Row 2...")
  - JUnit XML: one `<testsuite>` per row so CI can distinguish failures by input set
  - MCP tool `run_collection` gets an optional `dataFile` param
  - TDD required: `data-runner.test.ts` - CSV parse, JSON parse, variable injection per row, multi-row output shape, JUnit shape

- [ ] **T-149** Collection documentation export
  - `reqly export docs <collection>` generates a clean markdown API reference from the collection YAML
  - Structure: H1 = collection name, H2 per request, table for headers/params, fenced code block for body + example responses
  - Default output path: `docs/api/<collection>.md`; `--output <path>` to override
  - Also available as `POST /api/collections/:name/export?format=docs`
  - Extend existing `export_collection` MCP tool with `format: "docs"` option alongside existing `postman` and `openapi`
  - No external deps - pure string templating from existing collection YAML
  - TDD required: `docs-exporter.test.ts` - collection with no requests, collection with headers/body/examples, output path resolution

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
