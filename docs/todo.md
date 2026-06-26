# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-089** Collection-level variables - UI
  - Prerequisite: T-088 must be done first
  - Add a "Variables" section in the collection right-click context menu (or a "Collection Settings" modal triggered from the context menu) - same pattern as the existing environment variable editor
  - Show collection variables as an editable key-value table (same `KeyValueEditor` component used elsewhere)
  - Frame them as "Collection Variables - always available to requests in this collection, regardless of active environment" (not "env overrides")
  - The inherited headers / Variables tab in the request editor already shows active env vars - extend it to also show collection vars with source column = collection name so the developer sees exactly where each resolved value comes from

- [ ] **T-090** Collection-level auth - engine + MCP
  - Prerequisite: T-088 (collection YAML metadata store) should be done first so auth can share the same `collection.yaml` top-level file
  - Add optional `auth` field to collection metadata YAML: same shape as `RequestConfig.auth` (type, profileId or inline credentials)
  - Auth precedence at execution time: request-level auth (including explicit `type: none`) > collection auth > nothing. Explicit `type: none` on a request suppresses collection auth entirely
  - Update `http-executor.ts` to accept and apply collection auth as a fallback when the request has no auth configured
  - Update `run_request` and `run_collection` MCP tools to pass collection auth context through to the executor
  - Add MCP tools: `get_collection_auth`, `set_collection_auth`, `delete_collection_auth` - agents must be able to configure collection auth without touching the UI
  - Add Express routes: `GET /api/collections/:name/auth`, `PUT /api/collections/:name/auth`, `DELETE /api/collections/:name/auth`
  - TDD: failing tests first for the precedence logic (request none suppresses, request unset inherits, collection auth injects correct header)
  - Do NOT build UI in this task - that is T-091

- [ ] **T-091** Collection-level auth - UI
  - Prerequisite: T-090 must be done first
  - Add auth config to the "Collection Settings" modal introduced in T-089 (same modal, new "Auth" tab alongside "Variables")
  - Auth editor mirrors the request-level Auth tab: type selector (None / Bearer / API Key / Basic / OAuth2), inline credential fields or profile picker
  - Distinguish clearly in copy: "Auth set here applies to all requests in this collection unless a request overrides it"
  - Inherited headers panel (already built) reads collection auth as a source - extend it to show collection-auth-injected headers with source = "collection" instead of "profile"

