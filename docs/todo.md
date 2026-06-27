# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-106** OpenAPI contract validation - MCP tools + Express routes + CLI
  - Prerequisite: T-105
  - **MCP tools:**
    - `set_collection_spec`: `{ collection: string, specPath?: string, specUrl?: string }` - sets spec config on the collection, persists to `collection.yaml`, loads the spec immediately. Returns operation count from the loaded spec.
    - `get_collection_spec`: `{ collection: string }` - returns `{ specPath?, specUrl?, operationCount, loaded: boolean }`.
    - `list_spec_operations`: `{ collection: string }` - returns `{ operationId, method, path, summary? }[]` so agents can pick the right operationId to wire up via `specOperationId` on a request.
    - `validate_response`: `{ collection: string, request: string }` - validates the last stored response for the request against the collection's spec. Returns `{ violations: ContractViolation[], operation?: string, matched: boolean }`. Useful for re-validating without re-running.
  - **Update `run_request` MCP tool:** include `contractViolations: ContractViolation[] | null` in its response shape when a spec is configured on the collection. `null` means no spec configured; `[]` means spec configured and response is valid. Agents get violations in one call with no extra round-trip.
  - **Express routes:** `GET /api/collections/:name/spec`, `PUT /api/collections/:name/spec`, `DELETE /api/collections/:name/spec`, `GET /api/collections/:name/spec/operations`, `POST /api/collections/:name/requests/:req/validate`
  - **CLI:** `reqly run <collection> --validate-spec` flag - uses the spec already configured on the collection (no path arg needed since it's stored in `collection.yaml`). Prints violations per request after each run. Exit code 1 if any violations exist.
  - **TDD:** MCP tool contract tests for all four tools asserting input/output schema.

- [ ] **T-107** OpenAPI contract validation - UI
  - Prerequisite: T-106
  - **CollectionSettingsModal:** add a "Contract" tab alongside Variables and Auth. Contains: spec source toggle (File path / URL), text input for the path or URL, a "Load spec" button that calls `PUT /api/collections/:name/spec` and shows operation count on success, a "Remove" button to clear it.
  - **Response viewer:** add a "Contract" tab in the tab bar (alongside Headers, Assertions, Console, Examples). Only rendered when the active request's collection has a spec configured. Shows:
    - If no violations: green "All checks passed" with operation name matched (e.g. `GET /users/{id} · getUser`)
    - If violations: red count badge on the tab, list of violations with field path, message, and severity badge (error = red, warning = amber)
    - If spec configured but operation not matched: amber "No matching operation found" with the inferred path shown so the developer knows to set `specOperationId`
  - Contract tab data comes from `contractViolations` already returned by `POST /api/run/adhoc` (wire it through - same pattern as `diff` was added). No extra API call needed.
