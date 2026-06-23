# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue



- [ ] **T-021** Collection Runner (`src/engine/collection-runner.ts`)
  - Follow TDD: write `src/engine/collection-runner.test.ts` first
  - `CollectionRunner` class: takes `CollectionManager`, `HttpExecutor`, `ResponseStore`, `AssertionRunner` as constructor deps
  - `run(collectionName: string, options?: RunOptions): Promise<CollectionRunResult>`
  - `RunOptions`: `{ environment?: Environment, auth?: AuthProfile, stopOnFailure?: boolean }`
  - `CollectionRunResult`: `{ collection: string, total: number, passed: number, failed: number, results: RequestRunResult[] }`
  - `RequestRunResult`: `{ requestName: string, response: HttpResponse, assertions: AssertionResult[], passed: boolean, duration: number }`
  - Executes requests sequentially in the order they appear in the collection YAML
  - Stores each response in `ResponseStore` after execution so downstream requests can chain off it
  - Runs assertions after each response, marks the request as failed if any assertion fails
  - If `stopOnFailure: true`, halts on first failed request and returns partial results
  - Update MCP `run_collection` tool to use this runner and return the full `CollectionRunResult` shape
  - Update REST `POST /api/run/collection` to use this runner

- [ ] **T-022** UI: Proxy capture panel
  - New sidebar section below collections: "Capture" with a toggle switch (on/off)
  - When toggled on: calls `POST /api/proxy/start`, shows port number and "Listening..." status
  - When toggled off: calls `POST /api/proxy/stop`
  - Live feed of captured requests: polls `GET /api/proxy/captured` every 2 seconds while active, shows method + URL + status in a scrollable list
  - Click a captured request to open it in the Request Editor (read-only preview with "Save to collection" button)
  - "Save to collection" button: dropdown to pick target collection, then calls `POST /api/collections/:name/requests`
  - "Clear" button: clears the captured list from memory (does not delete from any collection)
  - Instructions callout: "Set your app's HTTP proxy to `localhost:7474`"

- [ ] **T-023** UI: Assertions editor
  - New tab in the Request Editor: "Assertions" (after Headers/Body/Auth/Params)
  - List of assertion rows: each row has field dropdown (`status` / `body.<path>` / `latency`) + operator dropdown (`equals` / `not equals` / `contains` / `less than` / `greater than`) + value input
  - "Add assertion" button appends a new empty row
  - Delete button (trash icon) on each row
  - Saved as part of the request via `PUT /api/collections/:name/requests/:requestName`
  - After a request is sent, assertion results appear inline in the Response Viewer below the status badge: green tick or red cross per assertion with the actual vs expected message

- [ ] **T-024** UI: Collection Runner panel
  - "Run collection" button in the sidebar next to each collection name (play icon)
  - Clicking opens a full-width overlay panel sliding up from the bottom
  - Panel header: collection name + "Run" button + "Stop on failure" toggle + environment selector
  - Run button calls `POST /api/run/collection { collectionName, stopOnFailure, environmentName }`
  - Progress view: list of requests with a spinner on the currently running one, green tick / red cross as each completes
  - Summary bar at top when complete: "5 passed / 1 failed" with colour coding
  - Failed requests show assertion failure messages inline
  - "Re-run" button to run again, "Close" to dismiss the panel
  - No polling needed - use a single POST that waits for the full result (M3 collections are small enough)

## Backlog

- [ ] **T-025** Request Chaining - response context store
  - Follow TDD: write `src/engine/response-store.test.ts` first
  - `ResponseStore` class: in-memory map of `requestName -> HttpResponse`
  - Extend `variable-substitutor.ts` to resolve `{{requestName.response.status}}`, `{{requestName.response.body.field}}`
