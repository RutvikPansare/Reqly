# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-076** GraphQL - persist to YAML + run_request support (M4)
  - The UI already has a GraphQL workspace (T-053). This task makes GraphQL requests first-class in the engine
  - Extend `RequestConfig` type with optional `graphql?: { query: string; variables?: Record<string, unknown> }` and a `type?: 'rest' | 'graphql'` discriminator
  - `CollectionRequest` YAML files with `type: graphql` store `graphql.query` and `graphql.variables` alongside `method: POST` and `url`
  - `http-executor.ts`: when `config.type === 'graphql'`, build body as `JSON.stringify({ query, variables })` and set `Content-Type: application/json` automatically
  - `run_request` MCP tool: no schema change needed - it already accepts `collectionName` + `requestName`; just works transparently once the executor handles the type
  - UI GraphQL workspace: wire the "Save" button to call `POST /api/collections/:col/requests` with `type: graphql` payload (currently saves nothing)
  - Add `create_request` schema support for `graphql` type (optional `query` and `variables` fields)
  - TDD: `http-executor.test.ts` for graphql body construction; `collection-manager.test.ts` for YAML round-trip of graphql type

- [ ] **T-077** OAuth 2.0 Flow (M4)
  - Full authorization code flow - not just static token storage
  - New `AuthType.OAUTH2 = 'oauth2'` in `src/types/auth.ts`
  - `AuthProfile.credentials` for oauth2: `{ clientId, clientSecret, authUrl, tokenUrl, redirectUri, scope, accessToken?, refreshToken?, expiresAt? }`
  - `AuthManager` gains `refreshOAuth2Token(profileId)` - POSTs to `tokenUrl` with `grant_type: refresh_token`, updates stored credentials in `~/.reqly/config.json`
  - `http-executor.ts`: before firing, if auth type is oauth2, check `expiresAt` - if expired or within 60s, call `refreshOAuth2Token` automatically
  - Authorization code flow initiation: `POST /api/auth/oauth2/start` opens the authUrl in the system browser (`open` / `xdg-open`), starts a temporary local callback server on a free port, captures the code, exchanges it for tokens, stores in the profile
  - UI Settings panel: OAuth2 profile editor with fields for clientId, clientSecret, authUrl, tokenUrl, scope; "Authorize" button that triggers the flow via `POST /api/auth/oauth2/start`
  - TDD: `auth-manager.test.ts` for token refresh logic (mock fetch); no TDD required for the browser-open step

- [ ] **T-078** Pre/Post-run Scripts (M4)
  - Per-request scripts that run before (pre) and after (post) request execution, with access to environment variables
  - Extend `RequestConfig` with `preScript?: string` and `postScript?: string` (plain JS strings, executed in a sandboxed vm context)
  - Runtime: use Node's built-in `vm` module (`vm.runInNewContext`) - no external sandbox dependency. Expose a `env` object (read/write) and `request` (read-only) to pre-scripts; expose `env`, `request`, `response` to post-scripts
  - Any `env` mutations in the script are applied back to the active environment variables for the duration of the collection run (not persisted to disk)
  - `http-executor.ts` / `collection-runner.ts`: run preScript before firing, postScript after receiving response
  - UI: add "Pre-script" and "Post-script" tabs in the request editor (alongside Headers / Body / Auth / Params). Use a `<textarea>` with monospace font - no CodeMirror needed for now
  - `CollectionManager.addRequest` / `getRequest` already YAML round-trips the full `RequestConfig` shape - preScript/postScript fields are stored/loaded transparently
  - TDD: unit tests for the script runner in `src/engine/script-runner.ts`; test env mutation, response access, and error isolation (a throwing script should not crash the request)
