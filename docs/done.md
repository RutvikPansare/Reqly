# Reqly - Done

## 2026-07-07

- [x] **T-254** Desktop + VS Code package audit: 2 bugs fixed (completes the full-codebase sweep)
  - **VS Code collection-run summary never rendered (`packages/vscode/src/commands.ts` + `api.ts`):** `reqly.runCollection` read `result.summary.{total,passed,failed}`, but the server returns those fields flat (`{ collection, total, passed, failed, results }`) - so the run output always dumped raw JSON and the "N request(s) failed" warning never fired. Now reads the flat fields; `CollectionRunResult` type corrected.
  - **Desktop setup flag wiped a corrupt config (`packages/desktop/src/agent-config.ts`):** `markSetupComplete` caught a JSON parse error and rewrote `~/.reqly/config.json` as just `{ setupComplete: true }`, wiping every auth profile / workspace / secret provider - the same data-loss class fixed in T-252 for the engine. Now distinguishes missing/empty (fine) from corrupt-but-present (refuse to overwrite); path made injectable and covered by a new `agent-config.test.ts` (vitest).
  - Audited clean: the rest of the VS Code extension (`api.ts` error/encoding handling, `codelens-detect.ts`, `codelens.ts`, `tree.ts`, `preview.ts`, `statusBar.ts`, `extension.ts`) and the Electron shell (`main.ts` crash/watchdog/quit lifecycle from T-244, `reqly-resolver.ts`, `logger.ts`, `SetupWizard.ts`). Full suite 1032 green; vscode + root `tsc --noEmit` clean.

## 2026-07-06

- [x] **T-253** UI component audit (React `src/ui/`): 6 logic/crash bugs fixed
  - **Realtime tab connection leak (`RealtimeWorkspace.tsx`):** the WS/SSE/Socket.IO/MQTT panels were rendered without a React `key`, keyed only by protocol. Switching between two same-protocol tabs (e.g. two WebSocket tabs) reused the panel instance, so the previous tab's live socket stayed open and its messages/status bled into the new tab. Now keyed by `activeTabId` so a tab switch remounts and the unmount cleanup closes the old connection.
  - **`deleteRequest` missing URL encoding (`api.ts`):** the only fetch wrapper that didn't `encodeURIComponent` its path segments - deleting a request whose name contained a space/`#`/`?`/`/` produced a broken/mis-routed URL. Now encoded like every sibling call. Covered by a new `api.test.ts` (stubs `fetch`, asserts the encoded URL).
  - **Rules-of-Hooks violation (`RequestEditor.tsx`):** an `if (!request) return <placeholder/>` sat between two groups of hook calls, so a null↔object toggle of `request` on one instance would change the hook count and crash the tree. All hooks are null-tolerant; the guard now runs after every hook, guarding only the output.
  - **Response viewer crash on header-less responses (`ResponseViewer.tsx`):** the raw tab called `Object.entries(headers)` guarded only by `response`, so an error/historical response with no `headers` field threw. `headers` now defaults to `{}`.
  - **GraphQL "Copy as cURL" shell escaping (`GraphQLWorkspace.tsx`):** used the invalid `\'` escape (same class as the engine code-generator bug) and left header values and the URL unescaped, so any quote in the query/variables/headers produced a broken command. Now POSIX `'\''` escaping on headers, body, and URL.
  - **Mock-tab collection list always empty (`CapturePanel.tsx`):** read `data.collections` off `fetchCollections()`, which returns a bare array, so the Mock tab's collection dropdown never populated and a mock could not be started from the UI. Now handles the array shape. Verified live: the dropdown lists all fixture collections.
  - Audited clean: `VariableInput`, `useWorkspaceTabs`, `useLocalStorage`, `useServerEvents`, `GraphQLSubscriptionStream` (lazy-close covers the missing explicit dispose), `TerminalPanel`, `HistoryPanel`, `CollectionRunnerPanel`, `SpotlightSearch`, `InteractiveJsonTree`, `EnvironmentSwitcher`, `SaveToCollectionModal`, `CodeGenModal`, `GraphQLResponseViewer`, `KeyValueEditor`, `MultipartEditor`, `FlowStepCard`. Verified: UI builds, full suite 1029 green, MCP e2e 17/17, 9/9 network-independent UI journeys; the 5 core UI fixes plus the mock-list fix reproduced their failure and confirmed the fix in a live browser.

- [x] **T-252** Second deep-audit pass (highest-risk engine modules): 8 more logic/correctness/data-loss bugs fixed TDD, 1 security finding escalated
  - **gRPC unary + streaming (`src/engine/grpc-runner.ts`, `grpc-streaming.ts`):** (1) no call deadline - a request to an unreachable/hung server waited forever; added a default 30s deadline (`timeoutMs`), verified live against an unreachable host (errors at 2s now, previously hung). (2) client-streaming had no timeout at all - a server that never sends its single response hung the promise; added the same timeout. (3) channels were never closed on any path (unary success/error, all three streaming variants) - socket/fd leak per call; now `closeClient` on every exit. (4) `protoFile` was `path.join`ed with no traversal guard - a `../` proto path escaped `.reqly/protos/`; new shared `resolveProtoPath` guard rejects it. Also wired the previously-ignored `tlsCertPath` into `createSsl`.
  - **Script sandbox (`src/engine/script-runner.ts`):** `console.log` of a circular object threw inside `JSON.stringify`, aborting the whole user script; logging now never crashes the script (safe stringify fallback). **Security (escalated, not silently fixed):** the pre/post-script `vm.runInNewContext` is not a real boundary - a script reaches the real `process` via `env.constructor.constructor('return process')()` (verified live), defeating the `require` allowlist. Swapping to `isolated-vm` is a native-dependency + architecture decision, so it was filed as a separate task rather than changed under a bug-fix pass.
  - **Config data-loss (`src/engine/auth-manager.ts` + `src/server/express.ts`):** a corrupt-but-present `~/.reqly/config.json` was loaded as `{}` and written back, silently wiping every auth profile, workspace, and secret-provider entry. AuthManager mutators now use `loadConfigForWrite` (throws on corrupt, tolerant on missing/empty); pure reads keep the lenient loader. `POST /api/config` and the login-item route use a new pure `mergeConfigPatch` helper that refuses (409) on a corrupt existing file.
  - **Read-path traversal (`src/engine/collection-manager.ts`):** `getRequest`/`getCollection` built filesystem paths from names with no guard (info disclosure of `.yaml` outside the project); both now run `assertSafeName`.
  - **Capture proxy binary corruption (`src/engine/proxy.ts`):** the capturing path concatenated response chunks into a JS string (`resBody += chunk`), corrupting any binary/gzipped body before re-sending it with the original `content-length`; now buffered as bytes (`Buffer.concat`) and forwarded intact. Verified with a non-UTF-8 payload round-trip.
  - **Importer data-loss (`src/engine/importer.ts`):** two imported requests with the same name silently overwrote each other (addRequest upsert) and the count over-reported; `persistRequests` now suffixes collisions. A name that sanitized to empty used to write `.yaml` and, after the T-250 path guard, would throw and abort the whole import; sanitizers now guarantee a non-empty name.
  - Regression tests added across grpc-runner, grpc-streaming, script-runner, auth-manager, collection-manager, proxy, importer, and a new `config-merge.test.ts`; full suite 1024 green, `tsc --noEmit` clean.
  - **Third batch (same audit pass, remaining backend modules):**
    - **Realtime capture hang (`src/engine/realtime-executor.ts`):** the capture timeout was armed only inside the `open`/`connect` handler, so a connection that never opened (unreachable host, stalled WS upgrade - `ws` sets no handshake timeout here) never resolved and hung the whole `run_realtime` call. All four transports (WebSocket/SSE/Socket.IO/MQTT) now arm a connect-deadline timer immediately and clear it on connect; a no-connect now returns `isError` within `captureTimeout`. `run_realtime` tool description updated.
    - **Exporter dropped query params (`src/engine/exporter.ts`):** query params live in `req.params` (agents are told to prefer it over inline URLs), but both Postman and OpenAPI export omitted them - the exported request would hit the endpoint with no query string, and a Reqly→Postman→Reqly round-trip lost them. Postman export now emits `url.query` and appends them to `raw`; OpenAPI export emits `in: query` parameters.
    - Audited clean (no changes needed): `dotenv-loader.ts` (per-URI secret dedup, loud error surfacing, masking), `spec-loader.ts`, `secret-providers/` registry + Vault/AWS/1Password/Bitwarden providers.
  - Final: full suite 1027 green, `tsc --noEmit` clean, MCP e2e 17/17, UI journeys green.

- [x] **T-251** Lift dark background palette across all UI pages
  - `--surface-0` through `--surface-4` shifted up ~8 units toward Hoppscotch's charcoal tone (`#17171c` app bg, was `#0f0f12`). Borders bumped from 0.05/0.08 to 0.07/0.10 opacity to maintain visual separation at the brighter base. Single change in `src/ui/src/index.css` - all components pick it up via CSS variables.

- [x] **T-248** HashiCorp Vault integration: `vault://` URIs in `.env`
  - `HashiCorpVaultProvider` in `src/engine/secret-providers/vault.ts`: direct HTTP to the KV v2 API, zero new dependencies. `vault://secret/data/myapp/db_password` maps to `GET {addr}/v1/secret/data/myapp` with the last URI segment selecting the field from the secret's data
  - Config: `VAULT_ADDR` + `VAULT_TOKEN` env vars (standard Vault conventions) win over `secretProviders.vault.{address,token}` in `~/.reqly/config.json`. Token auth only for V1 (AppRole/Kubernetes auth deferred per spec)
  - Errors: 403 -> "check your VAULT_TOKEN (expired, or missing read policy)", 404 -> missing path with the URI echoed, missing field -> lists available field names
  - Registered in `createDefaultSecretRegistry`; Settings -> Secrets gains a Vault section (address + masked token inputs). This completes the Team Secrets provider set: bw://, op://, aws://, vault:// all resolve
  - TDD: 12 new tests (URI parsing incl. nested paths, endpoint + token header shape, trailing-slash address, env-over-config precedence, 403/404/missing-field errors). Suite 1007 green
  - Verified live end to end: MCP stdio against a real local mock Vault server - `get_secret` returned `{ resolved: true, preview: "hunt..." }`, `get_secret_status` green, `run_request` fired with the full resolved value substituted into the URL, wrong token surfaced the 403 guidance. Chrome UI: all four provider sections render, console clean

- [x] **T-247** AWS Secrets Manager integration: `aws://` URIs in `.env`
  - `AwsSecretsProvider` in `src/engine/secret-providers/aws.ts` via `@aws-sdk/client-secrets-manager` (SDK v3, lazy-imported behind an injectable client abstraction)
  - URI formats: `aws://my-secret-name` and `aws://arn:aws:secretsmanager:...` - the ARN form's embedded region is used automatically
  - Credentials: standard AWS credential chain only (env vars, `~/.aws/credentials`, IAM role) - Reqly stores no AWS credentials. Region precedence: `AWS_REGION`/`AWS_DEFAULT_REGION` env > ARN region > `secretProviders.aws.region`; missing region gives a clear "Set AWS_REGION" error. `SecretBinary` payloads are decoded; AWS auth errors surface with the original message intact
  - Registered in `createDefaultSecretRegistry`: `.env` values, inline `{{secret:aws://...}}`, `get_secret`, `get_secret_status`, `reqly secrets resolve` all work. Settings -> Secrets shows an AWS section explaining the credential-chain model (no token form by design)
  - TDD: 12 new tests (name + ARN parsing/resolution, region precedence chain, missing-region error, auth error passthrough, SecretBinary decode, empty payload). Suite 995 green

- [x] **T-246** 1Password integration: `op://` URIs in `.env`
  - `OnePasswordProvider` in `src/engine/secret-providers/onepassword.ts` via `@1password/sdk` (official service-account SDK, no CLI dependency). The SDK's `client.secrets.resolve()` accepts the full `op://vault/item/field` URI directly; `parseOpUri` validates the shape first (section segment `op://vault/item/section/field` accepted) for clear errors
  - Token: `OP_SERVICE_ACCOUNT_TOKEN` env var wins over `secretProviders.onepassword.serviceAccountToken` in `~/.reqly/config.json`; missing token gives the documented "Set OP_SERVICE_ACCOUNT_TOKEN or configure in Settings -> Secrets" error
  - Registered in `createDefaultSecretRegistry`, so `.env` `op://` values, inline `{{secret:op://...}}` refs, `get_secret`, `get_secret_status`, `configure_secret_provider` (provider name `onepassword`), and `reqly secrets resolve` all work with no further wiring
  - UI: 1Password section in Settings -> Secrets with masked token input; saving re-resolves `.env` live, doubling as the connection test
  - TDD: 9 new tests (URI parse incl. section + invalid shapes, env-over-config precedence, missing-token message, SDK resolve pass-through, SDK error surfaced). Suite 983 green
  - Verified live: MCP stdio (status shows op:// error, get_secret paths, configure -> real SDK rejects fake token with 1Password's own message), Chrome UI (op:// row + 1Password form render, console clean)

- [x] **T-245** Secret provider infrastructure: vault URI resolution in `.env`, inline `{{secret:...}}` refs, `reqly secrets resolve` CLI, Settings -> Secrets UI
  - `.env` loader (`dotenv-loader.ts`) takes the `SecretProviderRegistry`; values matching known vault prefixes resolve at load time (each distinct URI once per load). Failed resolutions are excluded from the variable record (never an empty string), surfaced via `getSecretErrors()`/`getSecretStatus()`, re-checked on every reload. Resolved secrets are masked (4 chars + "...") in `getVariables()` listings; full values only flow into request execution
  - Loud failure at request time: `execute()` gained a `secrets` context param; a request referencing a `.env` key whose vault resolution failed throws with the provider's error, and inline `{{secret:<vault-uri>}}` refs (URL, headers, params, body, GraphQL) resolve through the registry pre-substitution and throw clearly when unresolvable. Requests not touching broken keys are unaffected
  - `reqly secrets resolve` CLI: resolves vault URIs from the configured .env files into `.env.local` (merges, preserves unrelated keys), exit 1 with per-key errors when any resolution fails, never modifies `.env`
  - New MCP tools: `get_secret_status` (detected URIs + resolution state, values never included) and `configure_secret_provider` (persists `secretProviders.<name>` in `~/.reqly/config.json`, re-resolves .env live, never echoes config values back)
  - Express `GET /api/secrets/status` + `PUT /api/secrets/providers/:provider`; Settings -> Secrets tab lists detected URIs (green tick / red error with message) and a Bitwarden config form (masked token input)
  - Wired through every entry point: server start, `reqly run`, `reqly run-flow`, `switch_project` MCP tool, express project switch
  - TDD: 30 new tests (loader resolution/masking/exclusion/status/dedupe, executor inline + loud-failure paths, CLI command, both MCP tools, auth-manager provider config). Full suite 974 green
  - Verified live: MCP stdio (URI detection, configure -> instant re-resolve through the real Bitwarden SDK, loud run_request failures for both broken .env keys and inline refs, plain requests unaffected), CLI (failure/usage/no-URIs paths), Chrome UI (Secrets tab rows with exact provider errors, config form, zero console errors)

## 2026-07-05

- [x] **T-249** Bitwarden Secrets Manager integration: `bw://` URIs
  - `BitwardenSecretsProvider` in `src/engine/secret-providers/bitwarden.ts`: resolves `bw://project-name/secret-name` via `@bitwarden/sdk-napi` (the specced `@bitwarden/sdk-secrets-manager` package does not exist on npm - see decision log). Token from `BITWARDENSM_ACCESS_TOKEN` env var (wins) or `secretProviders.bitwarden.accessToken` in `~/.reqly/config.json`; missing token gives a clear "Set BITWARDENSM_ACCESS_TOKEN or configure..." error. SDK is lazy-imported and injectable, so tests mock it and the native binding only loads when a `bw://` URI is actually resolved
  - Shipped the T-245 registry core as a dependency: `SecretProvider` interface + `SecretProviderRegistry` in `src/engine/secret-providers/index.ts` (known prefixes `op://`, `vault://`, `aws://`, `bw://`; known-but-unregistered prefix fails loudly with a "provider not configured" error). Registry wired into `EngineContext` as `secretRegistry`. Remaining T-245 scope (.env loader hook, inline `{{secret:...}}`, CLI, Settings UI) noted in todo.md
  - New `get_secret` MCP tool: resolves any vault URI, returns `{ resolved: true, preview }` with only the first 4 chars of the value - full secret never appears in tool output
  - TDD: 21 new tests across `secret-provider.test.ts` (registry routing, unregistered prefix error), `bitwarden.test.ts` (URI parsing, env-over-config token precedence, project/secret matching, not-found errors), `get-secret.test.ts` (preview truncation, error paths). Full suite 944 green
  - Verified live over MCP stdio: `get_secret` registered, `bw://` no-token error, `op://` unregistered-provider error, unknown-URI error all correct; UI at localhost:4242 regression-checked clean in Chrome

- [x] **T-250** Exploratory hardening pass: six logic/security bugs found by driving the live app + code audit, all fixed TDD
  - **Assertions compared with strict `===` (`src/engine/assertion-runner.ts`):** `status`/`latency` actuals are numbers, but the UI and YAML persist assertion values as strings, so `status eq 200` compared `200 === "200"` and every string-valued eq/neq assertion silently failed (or passed, for neq). Now compares by string form, matching the flow runner's expression evaluator. Verified live: `status eq "200"` now passes against a real 200
  - **Mock server EADDRINUSE state corruption (`src/engine/mock-server.ts`):** `app.listen` had no `error` handler - a failed start (port already taken) left `running: true` but nothing serving, then `stop()` threw Node's `ERR_SERVER_NOT_RUNNING` ("Server is not running.") and every retry was rejected as "already running", wedging the mock until process restart. `start()` now rejects cleanly on the `error` event and resets state, so stop/retry work
  - **Path traversal in collection and request names (`src/engine/collection-manager.ts`):** `POST /api/collections` with `{"name":"../evilcol"}` created a directory outside `.reqly/`, and a request named `../escaped` wrote `escaped.yaml` outside its collection. New `assertSafeName` guard on `createCollection`, `addRequest`, and `renameCollection` rejects path separators, `..`, `.`, empty, and NUL; routes surface 400 instead of 500
  - **`duplicateRequest` silently overwrote an existing request** with the same target name (unlike `moveRequest`/`duplicateCollection`, which auto-suffix). Now appends a numeric suffix and returns the final name; the duplicate route returns it
  - **`renameCollection` weak validation (`src/engine/collection-manager.ts` + route):** a missing body threw a cryptic "path argument must be a string", and renaming onto an existing collection leaked a raw `ENOTEMPTY`. Route now validates the body (400) and the manager rejects a rename onto an existing name with a clear message
  - **PUT request rename could destroy data:** the route deleted the old file before validating the new name, so an invalid rename target lost the request. New name is now validated before the delete
  - Regression tests added to `assertion-runner.test.ts`, `mock-server.test.ts`, `collection-manager.test.ts`; full suite 911 green; MCP e2e 17/17; UI e2e journeys green (the 2 httpbin-dependent journeys were blocked by an httpbin.org outage during the run, verified separately)
  - **Second batch (same day):** three more audit findings fixed TDD:
    - **GraphQL bodies skipped variable substitution (`src/engine/http-executor.ts`):** the graphql branch serialized `{ query, variables }` without calling `resolveVariables`, so `{{env vars}}` in the query text or GraphQL variables were sent literally (REST string/object bodies were substituted). Now resolved on the serialized body; `run_request` description and `llms.txt` updated per the MCP coverage rule
    - **Code generator had no quote escaping (`src/engine/code-generator.ts`):** a body/header/URL containing `'` broke out of the shell quoting in cURL snippets and the string literals in fetch/axios snippets. New `shq` (POSIX `'\''`) and `jsq` (JS literal) escapers applied to all interpolated values
    - **Reserved directory names accepted as collection names (`src/engine/collection-manager.ts`):** `create_collection`/rename with `flows`, `protos`, or `.schema-cache` succeeded but produced a collection invisible to `listCollections` (those dirs are excluded as belonging to other managers). `assertSafeName` now rejects them; route returns 400
  - **Two new permanent Playwright journeys** in `tests/e2e/ui-regression.spec.ts` (now 11): code generation modal (resolved cURL/fetch/axios snippets from a saved request) and environments panel listing. Full suite after batch two: 918 unit tests green, 9/9 network-independent UI journeys green

## 2026-07-04

- [x] **T-243** End-to-end regression suite: MCP tool verification + Playwright UI tests (renumbered from a stale "T-238")
  - **Layer 1 (`tests/e2e/mcp-regression.ts`, `npm run test:e2e:mcp`):** boots a live server (MCP stdio + Express in one process) against a writable copy of the committed `tests/e2e/fixture-project/`, connects as a real MCP client, and exercises the full T-243 tool list - 17 named assertions, pass/fail table, exit 1 on failure. Workspace tools run against an isolated fake `$HOME`
  - **Layer 2 (`tests/e2e/ui-regression.spec.ts`, `npm run test:e2e:ui`):** Playwright chromium journeys on port 4242 (override with `REQLY_E2E_UI_PORT`; fails fast if a live agent owns the port) - app load, REST send with 200 response, environment switch, GraphQL workspace with schema docs (from a committed `.schema-cache` fixture), gRPC/Realtime workspaces, history restore, request context menu, workspace create + repo link. 9 tests, serial, screenshots on failure gitignored
  - `npm run test:e2e` runs both; optional non-blocking `e2e` job added to CI; `tests/e2e/README.md` documents how to run and extend
  - **Found and fixed two production bugs (TDD):** (1) `convertSchemaToZodShape` treated a missing `required` array as "all params required", breaking every optional-only tool call like `get_variables {}`; (2) `list_grpc_services` never worked outside unit tests - the reflection stub was built from an empty package definition and the inline reflection proto had wrong field numbers vs `grpc.reflection.v1alpha` (`list_services` 6 vs 7, `file_descriptor_response` 7 vs 4, `error_response` 9 vs 7). The proto is now materialised to a temp file, loaded with `proto-loader`, and verified against the real spec

- [x] **T-244** Desktop blank-window fix: crash logging + auto-recovery in the Electron shell and UI
  - Root cause of the reported blank window: the desktop shell had no handlers for `render-process-gone` / `did-fail-load`, so a crashed renderer left the window showing only its background color forever, with no log trail
  - New `packages/desktop/src/logger.ts`: all shell events (server spawn, crashes, load failures, watchdog actions) now land in `~/.reqly/desktop.log` (1 MB rotation)
  - `render-process-gone`: logged and auto-reloaded (max 3 reloads/min, then a visible error page); `did-fail-load`: logged and re-enters the reconnect loop; `unresponsive`/`child-process-gone` logged; renderer `console.error` output forwarded to the desktop log
  - Server wait loop never gives up: the old 10s deadline left a permanent dead-end page; now it polls forever and loads the UI the moment the server answers
  - Server watchdog: probes :4242 every 5s; after 3 consecutive failures it respawns the server (budget: 5 respawns/10 min) and reconnects the window; spawned-server `exit` is logged
  - UI: new `ErrorBoundary` around `App` (an uncaught React render error previously unmounted the whole tree = blank page); shows the error + Reload button; `window.onerror`/`unhandledrejection` hooks log with stack traces
  - Close-button UX: hiding the window now also calls `app.hide()` on macOS so focus returns to the previous app instead of leaving dock-less Reqly frontmost over a black desktop

- [x] **T-240** VS Code extension foundation: collection tree + status bar + command palette + marketplace publish (queued as "T-235"; renumbered - that id was taken by the landing page redesign)
  - New workspace package `packages/vscode/` (publisher `reqly`, extension id `reqly.reqly`), CommonJS build via `tsc`, packaged with `vsce` (VSIX builds clean)
  - `src/api.ts`: vscode-free client over `localhost:4242/api/*` (collections, environments, adhoc run, collection run, proxy start, create request); unit-tested with the repo vitest suite (10 tests); `reqly.serverUrl` setting overrides the base URL
  - Collection tree in the activity bar: projects (only when multiple) -> collections -> requests; click previews the request's actual on-disk YAML (`.reqly/<col>/<req>.yaml`) in a read-only virtual document; inline play buttons run a request or a whole collection
  - Status bar `Reqly: <env>` item; click opens a QuickPick backed by `POST /api/environments/active`; shows `Reqly: offline` with a start hint when the server is down (tree shows a viewsWelcome hint too)
  - Command palette: `Reqly: Run Request / Run Collection / Switch Environment / Start Proxy / Open UI / Refresh Collections`; responses, assertion results, and `test()` results print to the Reqly output channel
  - CI: `.github/workflows/vsce-publish.yml` publishes to the Marketplace on `v*` tags (needs `VSCE_PAT` secret); works in Cursor/Windsurf automatically

- [x] **T-241** VS Code CodeLens: "▶ Run with Reqly" on HTTP calls (queued as "T-236"; renumbered - that id was taken by the multipart auth bug fix)
  - `ReqlyCodeLensProvider` for js/ts/jsx/tsx; pure detection logic in `codelens-detect.ts` (vitest-covered, TDD): finds `fetch(` / `axios(` / `axios.<method>(` / `got(` / `request(` with string-literal URLs, infers method from `axios.post` or a `method:` option, flags template-literal URLs as dynamic
  - Click: matches a saved request (exact URL first, then method + path with `{{var}}` segments stripped) and fires it via `/api/run/adhoc`; no match offers "Save as new request" into a chosen collection via `POST /api/collections/:name/requests`

- [x] **T-242** VS Code YAML schema validation for `.reqly` files (queued as "T-237"; renumbered - that id was taken by the JUnit reporter bug fix)
  - `scripts/generate-schemas.mjs` generates four JSON schemas from the TypeScript types in `src/types/` via `ts-json-schema-generator` (runs on every extension build; never hand-edited). Note: the task spec said "from the existing Zod schemas" but `src/types/` is plain TS interfaces - generating from the TS types achieves the same always-in-sync goal (decision-log)
  - Schemas: request files (`.reqly/*/*.yaml`, `CollectionRequest` with `id` optional on disk), collection meta (`collection.yaml`), environment store (`environments.yaml`), flows (`flows/*.yaml` with the full step-type discriminated union)
  - Contributed via `contributes.yamlValidation` with `redhat.vscode-yaml` as an extensionDependency (VS Code's built-in `jsonValidation` does not cover YAML); typos like `methd` and bad enum values get red squiggles, JSDoc comments surface as hover docs
  - vitest suite validates the generated schemas against hand-written good/bad fixtures and every request YAML in `example/reqly-starter/`

- [x] **T-226** Multi-Project Workspace Phase 2: named workspace model with aliases
  - **Engine (TDD, 18 tests):** `src/engine/workspace-manager.ts` - `WorkspaceConfig { name, repos: [{ alias, path }], sharedEnv? }` stored at `~/.reqly/workspaces/<name>/workspace.yaml`; create/get/list/link (upsert)/unlink/setSharedEnv/resolveRepoPath; active workspace persisted as `activeWorkspace` in `~/.reqly/config.json`; name/alias slug validation keeps names path-safe; `WorkspaceRepo`/`WorkspaceConfig` types exported from `src/types/` (so the VS Code schema generator picks them up automatically)
  - **CLI:** `reqly workspace create <name>`, `reqly workspace link <name> <alias> <path>` (warns when the target has no `.reqly/`), `reqly workspace use <name>`; `reqly workspace list` now also prints named workspaces with their aliases and the active marker; add/remove/list for the flat T-225 path list unchanged
  - **MCP (TDD, 10 tests):** `create_workspace`, `link_workspace_repo`, `use_workspace`, plus `list_workspaces` (added beyond the spec - agents need read access for "full agent control"); `workspaceManager` added to `EngineContext`
  - **HTTP:** `GET/POST /api/workspaces`, `POST/DELETE /api/workspaces/active`, `POST /api/workspaces/:name/repos`, `DELETE /api/workspaces/:name/repos/:alias`
  - **UI:** `WorkspaceSwitcher` dropdown above the project list in the collections sidebar (create inline, activate, "No workspace" opt-out) + workspace settings modal (linked repos with unlink, alias+path link form, read-only sharedEnv display)
  - Verified end-to-end on an isolated server (fake `$HOME`, test port): REST flow, CLI flow, and the UI dropdown/settings modal in the browser; YAML and config.json contents confirmed on disk

## 2026-07-03

- [x] **T-239** Bundle server binary + 1-click AI agent setup wizard (queued in todo.md as "T-233"; renumbered - T-233 was already used by the landing page task)
  - **Bundled server:** the Electron app now ships a full copy of the server. `scripts/build-desktop-resources.sh` stages root `dist/` + production-only `node_modules` (native modules rebuilt for Electron's ABI by electron-builder's @electron/rebuild step) into `packages/desktop/resources/server/` (gitignored); `electron-builder.yml` packs it via `extraResources` along with `resources/bin/` shims. The shims (`bin/reqly`, `bin/reqly.cmd`) run the bundled server through the app's own Electron executable in `ELECTRON_RUN_AS_NODE` mode - no pkg/ncc compile step, no system Node required, and the bundled server is always version-matched to the app. Electron bumped 33 -> 37 (Node 22.21) to satisfy the server's `engines: >=22.19` (undici 8 requires it).
  - **PATH detection** (`src/reqly-resolver.ts`): Homebrew CLI (`/opt/homebrew/bin/reqly`, `/usr/local/bin/reqly`) > npm CLI via `which`/`where` > bundled shim. Used at launch (spawn) and at Connect time (agent configs). Developers with a CLI keep it; DMG-only users transparently get the bundled server.
  - **Setup wizard** (`src/SetupWizard.ts` + `assets/wizard.html` + `wizard-preload.ts`): shown on first launch (suppressed by `setupComplete: true` in `~/.reqly/config.json`), reachable from tray ("AI Agent Connections..."). One-click MCP config injection (`src/agent-config.ts`) for Claude Desktop, Cursor, Windsurf, VS Code - merges into existing configs, never clobbers other entries, same shapes as `reqly setup` (`--project-dir ${workspaceFolder}` for macro editors, plain `start` for Claude Desktop). Implemented as plain Electron HTML+preload rather than the spec's React `.tsx` (desktop package has no React toolchain; not worth adding one for one screen).
  - **"Install CLI" button:** symlinks the bundled shim to `/usr/local/bin/reqly`; plain symlink first, macOS admin prompt (osascript) on permission failure; only offered when the bundled server is the active source.
  - **Smoke-tested:** desktop tsc build green; config injection verified against a fake `$HOME` (merge preserves existing servers; per-agent args correct; `setupComplete` round-trips); staged bundle boots under Electron-as-Node; full electron-builder package built and `Reqly.app/Contents/Resources/bin/reqly status` runs the bundled server end to end. DMG imaging step itself failed only on this machine's broken `python` shim (`xcode-select` error in dmgbuild) - the .app and .zip artifacts built fine; CI/another machine will produce the DMG.
  - **Docs:** README installation section (3 install paths + wizard), stale "CLI not found" FAQ replaced, llms.txt "Desktop App and Server Resolution" section (two-server model, PATH priority, `responses.json` bridge), knowledge.md desktop entries rewritten.

## 2026-07-02

- [x] **T-238** Persist MCP-executed responses to `responses.json` synchronously
  - After every `run_request` and `run_collection` call handled by the MCP server, we now write the response(s) to `.reqly/responses.json` synchronously.
  - This ensures that the Electron UI (which runs on a separate ephemeral port and relies on file watchers) instantly picks up MCP-executed responses.
  - Added `saveSync()` method to `ResponseStore`.
  - Updated `express.ts` watcher to listen for `responses.json` changes.
  - Added TDD tests in `response-store.test.ts`.


- [x] **T-237** Bug: JUnit reporter reported errored requests as passing (false green in CI)
  - `toTestCases` in `reporters/junit.ts`: a request that threw (network failure, script error) arrives with `assertions: []` and `response: null`, so it hit the implicit-testcase branch where `status 0 >= 500` is false and was emitted as a *passing* testcase. `result.error` was ignored. CI would go green on a connection failure.
  - Fix: if `result.error` is set, emit a single failing testcase carrying the error message. TDD test added to `junit.test.ts`.

- [x] **T-236** Bug: multipart requests dropped auth headers
  - `http-executor.ts`: the multipart branch fires `fetch` before the auth-injection block (Bearer/Basic/API Key/OAuth2/AWS SigV4), which lived after the multipart early-return. Multipart uploads to authenticated endpoints silently sent no `Authorization` / `x-api-key` (mTLS was unaffected - its dispatcher is resolved earlier).
  - Fix: extracted auth injection into `applyAuthHeaders()` and call it in both the multipart path (before its fetch) and the generic path; deduped the generic path to reuse the already-resolved `effectiveAuthEarly`. Two TDD tests added (request-level Bearer, collection-level API key on multipart).

- [x] **T-235** Landing page redesign: blue-only flat palette + interactive graphics
  - Removed all color gradients (blue-purple text/button/logo gradients gone); palette is now shades of blue on dark, flat 1px-border design. Green/red/amber retained only as pass/fail/status semantics.
  - Replaced emoji feature icons with inline SVG line icons.
  - New graphics: animated architecture SVG (agent -> MCP -> engine -> API, moving dots + dashed flows), animated flow-engine diagram (run/extract/assert/branch/poll).
  - New interactivity: terminal types the agent prompt and streams tool calls on scroll-into-view (with replay button), tabbed code showcase (request YAML / flow YAML / exported CI workflow), count-up stats. Respects prefers-reduced-motion.

- [x] **T-234** Deploy landing page to GitHub Pages
  - Added `.github/workflows/pages.yml`: deploys `website/` via actions/deploy-pages on push to main (path-filtered) or manual dispatch.
  - Enabled Pages on the repo with `build_type: workflow`. Live at https://rutvikpansare.github.io/Reqly/.

- [x] **T-233** Marketing landing page (`website/index.html`)
  - Single self-contained static page: dark theme, hero with install command + copy buttons, feature grid (9 capabilities), zero-human pipeline steps, YAML collection/flow code showcase, Postman/Insomnia/Bruno comparison table, time-savings stats, download section (npm, Homebrew CLI, Homebrew cask + GitHub releases link for desktop app), GitHub buttons throughout.
  - No build step, no dependencies beyond Google Fonts. Deployable to any static host (GitHub Pages, Netlify, Vercel).

- [x] **T-232** Disable 'Switch Project' button when agent is connected
  - Modified `useCollectionState.ts` to fetch `hasEverConnectedAgent` from `/api/project`.
  - Added `isAgentActive` logic to `ProjectPathWidget.tsx` using `hasEverConnectedAgent || window.location.port === '4242'`.
  - If agent is active, the project path widget is disabled with a helpful tooltip to prevent humans from pulling the rug out from under the agent's active session.

- [x] **T-231** Fix WebSocket server crash on EADDRINUSE when port is taken
  - Added `wss.on('error', ...)` handler in `attachTerminal` (terminal.ts) that swallows `EADDRINUSE` and re-throws everything else.
  - Without this, the ws library propagates the http server bind failure to the WS server as a second unhandled `error` event, crashing the process.
  - Test added to `terminal.test.ts` verifying `wss.emit('error', { code: 'EADDRINUSE' })` does not throw.

- [x] **T-230** Agent-vs-Electron port strategy: Electron ephemeral, agents compete for 4242
  - Added `type: 'electron' | 'agent'` field to `RunningLock` in `lock.ts`.
  - `writeLock()` now takes an optional `type` parameter (default `'agent'`).
  - `index.ts` startup now pre-checks the lock before starting Express:
    - **Electron** (`REQLY_ELECTRON=1`): uses port 0 (OS-assigned), writes `type: 'electron'` to lock.
    - **Agent** (default): tries port 4242. If a live agent owns it, sends SIGTERM, waits 600ms, then takes 4242. If a live Electron process owns it, uses port 0 instead. Never kills Electron.
  - Replaced the `setImmediate` hack with proper `Promise` that resolves on `'listening'` or `'error'`, and reads `server.address().port` for the actual port after `listen(0)`.
  - 3 new lock tests. All 840 tests pass.

- [x] **T-228** Modularize CollectionsPanel - fix JSX brace error and split 885-line file
  - Root cause: Gemini's T-225 work introduced a broken IIFE closing sequence (missing `</div>` and `)` tokens), causing a Vite/rolldown build failure.
  - Resolution: replaced the monolithic `CollectionsPanel.tsx` with a `CollectionsPanel/` directory of 10 focused files, each under 200 lines:
    - `types.ts` - shared TypeScript interfaces
    - `useCollectionState.ts` - all state + async handlers as a custom hook
    - `SidebarEmptyHint.tsx` - empty-state hint component
    - `ProjectPathWidget.tsx` - project path button and switch modal
    - `SearchResults.tsx` - sidebar search results list
    - `RequestRow.tsx` - single request item with rename and examples
    - `CollectionRow.tsx` - single collection header + requests list with drag-drop
    - `ContextMenu.tsx` - right-click context menu
    - `BrunoMigrationModal.tsx` - Bruno script migration reference table
    - `MoveToModal.tsx` - move-request-to-collection modal
    - `index.tsx` - orchestrating shell (200 lines)
  - TSC clean, Vite build clean.

- [x] **T-229** Bug fixes and regression verification post v2 arch
  - Fixed GraphQL executor bug: requests with `type: 'graphql'` and no explicit `method` were defaulting to GET, causing `Request with GET/HEAD method cannot have body` error. Executor now auto-sets POST for graphql type.
  - Fixed `SettingsPanel.tsx` unused imports (`fetchDotenvFiles`, `fetchLoginItem`) that blocked the UI build.
  - Fixed workspace MCP tools (`add_workspace_project`, `list_workspace_projects`, `remove_workspace_project`): wrong `EngineContext` import path + missing `ToolHandlerResult` return type causing TS2769 build error.
  - Added `scripts/mcp-regression.ts`: live MCP regression suite covering REST, GraphQL, SigV4 auth, disk-persisted history, response store, `switch_project`, and `get_project`.
  - 836/836 tests pass. Known pre-existing build error logged as T-228.

- [x] **T-225** Multi-project path list + grouped sidebar
  - **Config/Engine:** Added `workspaceProjects: string[]` to `~/.reqly/config.json` via global `AuthManager`.
  - **Engine:** `CollectionManager.loadAll()` loads from multiple project dirs.
  - **CLI:** `reqly workspace add/remove/list`
  - **MCP:** Added `add_workspace_project`, `remove_workspace_project`, and `list_workspace_projects`.
  - **Server:** Added `/api/workspace` endpoints. Edit routes (POST/PUT/DELETE collections) now correctly resolve the collection manager dynamically from all workspace projects.
  - **UI:** 
    - Settings modal gains a Workspace tab to add/remove workspace projects.
    - CollectionsPanel sidebar now visually groups collections by their project directory with a folder icon header.
- [x] **T-224** Update `reqly init` to auto-gitignore runtime state files
  - **CLI:** `reqly init` (completed in T-220/T-221) appends `.reqly/history.ndjson` and `.reqly/responses.json` to `.gitignore`.
  - **UI:** Added an API endpoint `GET /api/project/gitignore` to check the current status of `.gitignore`.
  - **UI:** Added an API endpoint `POST /api/project/gitignore` to fix the `.gitignore` automatically.
  - **UI:** Added a section in the Settings panel in the UI to display the gitignore status with a green tick if clean, or a warning and a fix button if missing.
  - Updated `README.md` and `llms.txt` to note the automatic gitignoring behavior of `reqly init`.

- [x] **T-223** Update `switch_project` MCP tool to local context swap
  - **Engine/MCP:** Ensured `switch_project` MCP tool operates purely locally on the current process's `EngineContext` (no inter-process `fetch` to `/api/switch-project`).
  - Added `HistoryStore` and `ResponseStore` to the context re-instantiation in `switch-project.ts`.
  - Updated tool descriptions in `switch-project.ts` and `llms.txt` to explicitly document that the tool operates locally without affecting other running agents.
  - Added test assertions in `switch-project.test.ts` to verify `historyStore` and `responseStore` swap.

- [x] **T-222** Remove singleton lock as state coordinator - each process runs a full engine
  - Removed MCP-only mode from `index.ts` startup. Every `reqly mcp` spawn now runs its own full `EngineContext` + Express regardless of whether another process holds the lock.
  - Removed inter-process `fetch` to `/api/switch-project` and all `mcpOnly` branching.
  - Retained lock file write for process registry only (`reqly stop`, `reqly status`, `reqly app`). Lock is written only when Express binds successfully; EADDRINUSE logs a warning and the process continues with MCP only (no deliberate MCP-only mode).
  - Deleted `startup-mode.ts` and `startup-mode.test.ts` (dead code).
  - `POST /api/switch-project` endpoint retained for UI project-switching. All 833 tests pass.

- [x] **T-221** Persist `ResponseStore` to `.reqly/responses.json`
  - Updated `ResponseStore` to read/write `.reqly/responses.json` so that `{{requestName.response.field}}` chaining works across process restarts.
  - Initial load from disk happens synchronously on instantiation.
  - Saving is debounced by 100ms.
  - Passed `projectDir`/`cwd` into `ResponseStore` instantiation in `index.ts`, `run-command.ts`, and `run-flow-command.ts`.
  - Updated `reqly init` in `init-command.ts` to automatically add `.reqly/responses.json` to `.gitignore`.
  - Added TDD tests for file persistence to `response-store.test.ts`. All 838 tests pass.

- [x] **T-220** Persist `HistoryStore` to `.reqly/history.ndjson` (append-only NDJSON)
  - Updated `HistoryStore` to read/write `.reqly/history.ndjson` synchronously on startup and on `append()`.
  - Wired `HistoryStore` instantiation to accept `cwd`/`projectDir` in `index.ts`, `run-command.ts`, and `run-flow-command.ts`.
  - Updated `reqlyDirWatcher` in `express.ts` to watch `.reqly/history.ndjson`, trigger `context.historyStore.reloadFromDisk()`, and emit SSE event.
  - Updated `init-command.ts` to automatically append `.reqly/history.ndjson` to `.gitignore`.
  - Added TDD tests for file persistence, initialization from file, and cross-process reloading to `history-store.test.ts`. All 837 tests pass.

- [x] **T-219** Remove BYOK and prompt bar references from all documentation
  - Cleaned up `README.md`, `CLAUDE.md`, `GEMINI.md`, `knowledge.md`, and `roadmap.md` to remove outdated references to the built-in UI prompt bar and BYOK API key config.
  - Confirmed the core architectural identity: Reqly is an execution engine and MCP server, and all AI intelligence lives entirely outside of it.

- [x] **T-218** Implement AWS Signature v4 (SigV4) authentication
  - Added `AuthType.AWS_V4 = 'awsv4'` to `src/types/auth.ts`.
  - `http-executor.ts`: uses `aws4.sign()` to compute and inject `Authorization`, `X-Amz-Date` (and `X-Amz-Security-Token` when `sessionToken` is set) headers. Works for REST GET/POST and GraphQL. Body is included in the signature for POST/PUT.
  - `realtime-executor.ts`: added `signRealtimeUrlForAws()` (exported) that presigns a WebSocket URL via `signQuery: true` - appends `X-Amz-Algorithm`, `X-Amz-Date`, `X-Amz-Credential`, `X-Amz-Signature` (and `X-Amz-Security-Token` when sessionToken provided) as query params. `runRealtimeCapture()` accepts `awsAuth` and presigns the URL before connecting (WebSocket only).
  - `run_realtime` MCP tool: updated description and added `awsAuth` input schema parameter.
  - `run_request` MCP tool: description updated to document AWS SigV4 header injection.
  - UI `RequestEditor.tsx`: added `awsv4` to auth type selector, AWS SigV4 credential form (Access Key, Secret Key masked, Region, Service, Session Token masked), Inherited tab shows computed header names.
  - UI `CollectionSettingsModal.tsx`: same credential form at collection level.
  - 9 new TDD tests; 834/834 tests pass.
  - E2E validated via `scripts/e2e-sigv4-test.ts` (28/28 checks pass): GET header signing, POST body signing with custom region/service, session token injection (X-Amz-Security-Token echoed by httpbin.org), WebSocket URL presigning (key ID, region, service, signature all correct), WebSocket presigning with session token.

- [x] **T-218** Build GitHub clone integration into Open Workspace modal
  - Replaced the inline "Switch project" input with a new `OpenWorkspaceModal`.
  - Added two paths: "Open Local Folder" and "Clone from GitHub".
  - Created POST `/api/clone-repo` in express backend to handle `git clone` natively.
  - Allowed user to customize the destination folder when cloning, using the native `/api/open-folder-picker`.

- [x] **T-217** Add "Git is your RBAC" selling point to README
  - Added a bullet point highlighting that Reqly inherits Git security policies and CODEOWNERS for free.

- [x] **T-216** Add PM/QA democratization point to README
  - Added a new bullet point explaining how AI-driven API testing lowers the barrier for non-technical users.

- [x] **T-215** Add Contributing section to README
  - Outlined how users can contribute (Engine, MCP, UI).
  - Explicitly stated the Core Architectural Principle (Tool-First).
  - Added Local Setup instructions and Testing Standards.

- [x] **T-213** Add gRPC unary support to flow runner
  - `flow-runner.ts` now detects `type: grpc` run steps and routes them through `runGrpcRequest` instead of the HTTP executor.
  - `GrpcResponse` is adapted to `HttpResponse` (status 200 = gRPC OK, status 500 = any non-zero gRPC code; body and grpc-status/grpc-message headers set accordingly).
  - Auth (bearer, API key, basic) and explicit headers are injected as gRPC Metadata with the same precedence as REST (collection auth < request auth < explicit headers).
  - MCP `run_flow` tool description updated to document gRPC support, response shape, and auth behaviour.
  - 3 new TDD tests in `flow-runner.test.ts`; all 825 tests pass.
  - E2E validated with a public flow: JSONPlaceholder (REST) + countries.trevorblades.com (GraphQL) + grpcb.in:9000 (gRPC) - all steps passed.

- [x] **T-212** Add centered ASCII header and taglines to README
  - Added a `div align="center"` header block with `REQLY` ASCII art.
  - Added a feature tagline and quick navigation links.

- [x] **T-211** Add variable detection and workspace filtering improvements
  - Added `{{` variable autocomplete trigger for gRPC proto inputs, GraphQL query variables, and Realtime URL bars.
  - Refined `CollectionsPanel` filtering logic to hide empty collections or collections without matching request types in GraphQL, gRPC, and Realtime workspaces.

## 2026-07-01

- [x] **T-201** Fix tab jumping on save in workspace tabs
  - Updated `useWorkspaceTabs` hook to correctly update `activeTabId` when a tab's ID changes upon first save, preventing the workspace from switching to the first tab.


- [x] **T-200** Fix UI issues across Workspaces
  - Fixed drag-and-drop bug for GQL/gRPC requests in CollectionsPanel
  - Refined Proto File section UI in GrpcWorkspace (padding, font size)
  - Ensured gRPC response area consumes full available height via h-full
  - Integrated dirty state checking to trigger Save button styling in GraphQL and gRPC Workspaces
  - Updated backend to emit 409 Conflict when saving requests with duplicate names, surfacing errors in UI

- [x] **T-199** Refactor GraphQL and gRPC workspaces to use tab layout
  - Extracted `WorkspaceTabBar` and `useWorkspaceTabs` from Realtime components for generic tab management
  - Reused `CollectionsPanel` in GraphQL and gRPC workspaces with their respective `typeFilter`s
  - Removed outdated bookmark button and saved request sidebar
  - Ensured state persistence across tabs using `key` props and `-Inner` wrapper components
  - Fixed TypeScript errors and verified all 822 backend/unit tests pass

- [x] **T-198** Realtime workspace UI polish + collections sidebar unification
  - Replaced `RealtimeCollectionsPanel` with filtered `CollectionsPanel` so realtime tabs inherit project switching, search, drag-drop, context menus, rename, and delete
  - Added `typeFilter` support to `CollectionsPanel` and hid REST-only sidebar actions in realtime mode
  - Restyled WebSocket, SSE, Socket.IO, and MQTT panels to match the gRPC/REST URL bar and toolbar pattern
  - Tightened the realtime tab bar add button and added shared `btn-danger` styling for disconnect actions
  - Built `src/ui`, copied `dist/*` to `dist/ui/`, and verified all 822 tests pass

- [x] **T-197** End-to-end realtime feature verification + 3 bug fixes
  - Fixed `eventsource` ESM import: `* as EventSourceLib` → named import `{ EventSource }` 
  - Fixed SSE `EsLike` interface to use W3C API (`addEventListener`/`onopen`/`onerror`) instead of `.on()`
  - Fixed SSE graceful close: `onerror` after successful connect no longer marks `isError: true`
  - Fixed test mocks to match new `EsLike` interface (`_emitOpen`, `_emitEvent`, `_emitError`)
  - Verified all 4 protocols end-to-end via `POST /api/run/realtime`:
    - WebSocket: connected to `wss://echo.websocket.org`, sent 2 messages, received echoes
    - SSE: connected to local test server, captured 5 events
    - Socket.IO: connected to local test server, sent `ping` event, received `pong` echo
    - MQTT: connected to `wss://test.mosquitto.org:8081`, subscribed + published + received own message
  - Verified collection save: created `realtime-demo` collection with WS/SSE/MQTT requests
  - Verified MCP `run_realtime` tool registered in `src/mcp/server.ts`
  - All 820 tests pass


- [x] **T-193** UI: `RealtimeWorkspace` shell + save/load + state persistence
  - EDITED `src/ui/src/components/RealtimeWorkspace.tsx`
  - Added save modal logic and tab management


- [x] **T-192** UI: SocketIOPanel + MQTTPanel
  - NEW `src/ui/src/components/SocketIOPanel.tsx`
  - NEW `src/ui/src/components/MQTTPanel.tsx`
  - Installed `socket.io-client` and `mqtt` in `src/ui/package.json`


- [x] **T-191** UI: WebSocketPanel + SSEPanel
  - NEW `src/ui/src/components/WebSocketPanel.tsx`
  - NEW `src/ui/src/components/SSEPanel.tsx`


- [x] **T-190** UI: `RealtimeCollectionsPanel`
  - NEW `src/ui/src/components/RealtimeCollectionsPanel.tsx`


- [x] **T-189** UI: shared display component + tab system
  - NEW `src/ui/src/components/RealtimeMessageLog.tsx`
  - NEW `src/ui/src/hooks/useRealtimeTabs.ts`
  - NEW `src/ui/src/components/RealtimeTabBar.tsx`


- [x] **T-188** UI: `api.ts` additions + NavRail + App.tsx routing
  - Added `runRealtimeCapture` to `api.ts`
  - Added realtime panel to `NavRail`
  - Added routing for realtime workspace to `App.tsx`

- [x] **T-187** MCP tool: `run_realtime` + Express route
  - NEW `src/mcp/tools/run-realtime.ts`: `run_realtime` tool - calls `runRealtimeCapture`, returns JSON result
  - Registered in `src/mcp/server.ts`
  - NEW `src/mcp/tools/run-realtime.test.ts`: 11 tests covering definition shape, handler routing, defaults, error passthrough
  - EDIT `src/server/express.ts`: added `POST /api/run/realtime` route mirroring the MCP tool
  - 820 tests total, all pass

- [x] **T-186** Engine: `realtime-executor.ts` - buffered capture for MCP/agent use
  - NEW `src/engine/realtime-executor.ts`: `runRealtimeCapture()` supports websocket, sse, socketio, mqtt
  - Uses injectable adapters pattern (`RealtimeAdapters`) for clean TDD without constructor mocking issues
  - Exported types: `RealtimeMessage`, `RealtimeCaptureResult`, `RealtimeCaptureRequest`
  - Ring buffer capped at 500 messages; sets `truncated: true` when hit
  - Always returns a result (never throws) - safe for MCP tool handlers
  - Installed npm packages: `eventsource`, `socket.io-client`, `mqtt` (root `package.json` only)
  - `ws` was already present; `socket.io-client` browser build excluded from UI package.json
  - NEW `src/engine/realtime-executor.test.ts`: 16 tests, all pass

- [x] **T-185** Types + badge colors
  - **File: `src/types/request.ts`**
    - Extended `RequestConfig.type` union: added `'websocket' | 'sse' | 'socketio' | 'mqtt'`
    - Added `RealtimeConfig` interface next to `GrpcConfig`
    - Added `realtime?: RealtimeConfig` to `RequestConfig`
  - **File: `src/ui/src/lib/colors.ts`**
    - Added four new cases to `requestBadgeInfo()`
  - **TDD**: Unit test `requestBadgeInfo` returns correct label + style for all four in `colors.test.ts`.

- [x] **T-196** Scoped Realtime workspace epic (T-185 through T-195) in `docs/todo.md`
  - Researched Hoppscotch `example/hoppscotch/src/components/realtime/` and `src/helpers/realtime/` for WebSocket, SSE, Socket.IO, and MQTT patterns
  - Superseded T-151 with 11 detailed, dependency-ordered tasks (T-185 to T-195)
  - Each task specifies: exact file paths, TypeScript interfaces, CSS conventions, state persistence approach, npm packages needed, and manual test instructions
  - Component size limit (200 lines) enforced by splitting MQTT into 3 files
  - Covered: types/config, badge colors, nav rail, app routing, filtered collections sidebar, tab system with localStorage persistence, shared MessageLog + LogEntry, WebSocket panel, SSE panel, Socket.IO panel, MQTT panel, save/load integration

- [x] **T-184** gRPC UI workspace
  - New `GrpcWorkspace.tsx` component with full gRPC panel: streaming type selector (Unary/Server/Client/Bidi), proto/service/method inputs, TLS toggle, CodeMirror JSON message editor, metadata key-value editor, saved requests sidebar
  - Response panel: gRPC status badge with colour coding (green OK / red error), latency, stream message timeline with RECV/SENT direction indicators and timestamps, copy to clipboard
  - `NavRail.tsx`: added `Server` icon + `grpc` nav panel; `NavPanel` type extended
  - `App.tsx`: gRPC request routing - clicking a `type: grpc` request in the sidebar routes to `GrpcWorkspace`; sidebar hidden when `grpc` panel active (same pattern as GraphQL); `gRPC` badge on tabs
  - Fixed two pre-existing TypeScript strictness errors in `grpc-reflection.ts` and `grpc-streaming.ts` that blocked `npm run build`
  - Non-breaking: REST and GraphQL workspaces unchanged

- [x] **T-164** Core gRPC engine - unary RPCs + multi-file proto support
  - `src/engine/grpc-runner.ts`: `runGrpcRequest()` loads `.proto` files from `.reqly/protos/` via `@grpc/proto-loader` with `includeDirs` so cross-file imports resolve; executes unary RPC; returns `{ grpcStatus, grpcStatusCode, body, latency }` - gRPC status is a distinct field (not HTTP status)
  - `RequestConfig.type: 'grpc'` added; `GrpcConfig` interface in `src/types/request.ts`
  - `run_request` MCP tool routes `type: grpc` requests to `grpc-runner` transparently; REST requests unaffected
  - 10 TDD tests in `grpc-runner.test.ts`
- [x] **T-165** gRPC metadata + auth integration
  - `headers` on a gRPC request map directly to gRPC Metadata; no separate concept needed
  - Bearer, API Key, and Basic auth profiles auto-inject into Metadata via `injectAuthToMetadata()` in `run-request.ts` - same precedence chain as REST (collection auth < request auth < explicit headers)
  - 4 TDD tests in `grpc-runner.test.ts` (T-165 suite)
- [x] **T-166** Proto message auto-generation + MCP scaffold
  - `src/engine/proto-scaffold.ts`: `scaffoldMessage(fields)` generates a typed JSON default-value object from proto field descriptors; supports all scalar types, nested messages, repeated fields, oneof, enum, well-known types (Timestamp, Duration)
  - `create_request` MCP tool: when `type: grpc` with `service`/`method` provided, best-effort proto load returns `grpcMessageScaffold` in the response
  - 14 TDD tests in `proto-scaffold.test.ts`
- [x] **T-167** gRPC server reflection - discover schema without a .proto file
  - `src/engine/grpc-reflection.ts`: `discoverServicesViaReflection()` connects via `grpc.reflection.v1alpha.ServerReflection`, lists services, fetches `FileDescriptorProto` blobs; returns `{ services, rawFileDescriptors, isError?, errorMessage? }`
  - `src/mcp/tools/list-grpc-services.ts`: new `list_grpc_services` MCP tool - call with `serverUrl` to get service list from any reflection-enabled gRPC server
  - 5 TDD tests in `grpc-reflection.test.ts`
- [x] **T-168** Full gRPC streaming support
  - `src/engine/grpc-streaming.ts`: `runGrpcServerStream()`, `runGrpcClientStream()`, `runGrpcBidiStream()` - each returns a plain JSON-serialisable result with `{ messages, truncated }` for MCP agent use; timeout defaults to 5s
  - `run_request` MCP tool routes `grpc.streaming: 'server' | 'client' | 'bidirectional'` to the correct streaming function
  - All stream messages include `timestamp` and `direction` ('sent'/'received') for UI rendering
  - 8 TDD tests in `grpc-streaming.test.ts`

## 2026-06-30

- [x] **T-180** GraphQL workspace: saved request browser
- [x] **T-181** `graphql.queryFile` - reference external `.graphql` files
- [x] **T-182** GraphQL multi-operation picker
- [x] **T-179** Variable recognition in GraphQL Workspace
  - Added `VariableInput` to URL field (pill display, `{{}}` autocomplete, tooltip on hover)
  - Passed `variables` prop to `KeyValueEditor` in the Headers tab
  - Added state + `useEffect` hooks to load `activeEnvVars`, `collectionVars`, `dotenvVars` (same pattern as `RequestEditor`)
  - Query/Variables CodeMirror editors intentionally excluded: GraphQL uses native `$variable` syntax
  - Fixed TypeScript build errors from prior session: missing `runIntrospection` function declaration, unused `ResponseViewer` import, implicit `any` on `prev`, `unknown` JSX children in `GraphQLResponseViewer`
- [x] **T-169** GraphQL Headers + Auth Tab
- [x] **T-170** Full Introspection Query + Schema Persistence
- [x] **T-171** Schema / Docs Explorer Sidebar
- [x] **T-172** Rich Autocomplete, Linting + Hover Docs (variable warning indicator)
- [x] **T-173** operationName Support (type, engine, UI dropdown, MCP)
- [x] **T-174** Prettify + Copy as cURL
- [x] **T-175** GraphQL-Aware Response Viewer
- [x] **T-176** Load Saved GraphQL Request from Collection (routing + round-trip)
- [x] **T-177** MCP `introspect_graphql` Tool
- [x] **T-178** GraphQL Subscriptions (WebSocket via graphql-ws)
  - `graphql-subscription-runner.ts` - buffers messages for configurable timeout; `truncated` flag
  - `GraphQLSubscriptionStream.tsx` - Connect/Disconnect UI, append-only log, auto-scroll, Clear button
  - `GraphQLWorkspace.tsx` auto-detects `subscription` keyword and swaps Send for stream panel
  - `RequestConfig.type` extended with `'graphql-subscription'`; `GraphQLConfig.streamTimeout` added
  - 751/751 tests pass (96 test files)

- [x] **T-148** Client certificates / mTLS
  - New `AuthType.MTLS = 'mtls'` in `src/types/auth.ts`
  - New `src/engine/cert-loader.ts` (`loadCert`, `CertLoadError`) reads PEM cert + key from absolute paths
  - HTTP executor resolves effective auth early, builds undici `Agent` with `connect: { cert, key }` dispatcher for both regular and multipart fetch paths
  - `set_collection_auth` MCP tool description updated with `type: mtls` and `credentials.certPath` + `credentials.keyPath` docs
  - UI: mTLS option added to collection auth tab (CollectionSettingsModal) and request auth tab (RequestEditor); path inputs with ~/.reqly/certs/ guidance; effective auth preview shows cert/key paths
  - `cert-loader.test.ts`: 5 tests; `http-executor.test.ts`: 3 new mTLS tests
  - 732/732 tests pass

- [x] **T-165** Fix Windows CI failure in `cli-parser.test.ts`
  - **Bug:** `resolveProjectDir` test hardcoded the expected path as `'/some/project'`, which failed on Windows where `path.resolve` normalizes it to a Windows drive letter (e.g. `D:\some\project`).
  - **Fix:** Swapped the expectation string to use `path.resolve('/', '/some/project')` so the test adapts dynamically to the platform running it.
  - CI now passes successfully across all operating systems.

- [x] **T-164** Fix literal `\n` characters in Markdown API documentation export
  - **Bug:** `exportToDocs` in `src/engine/exporter.ts` joined lines with the string literal `'\\n'` instead of actual newline `'\n'`, causing the exported `.md` file to output single line strings with literal `\n` visible in the content.
  - **Fix:** Swapped `\\n` to `\n` in the `lines.join('\n')` statement at the end of the exporter.
  - Tested via `npx vitest run src/engine/exporter.test.ts` and `src/mcp/tools/export-collection.test.ts` - all tests pass.

- [x] **T-163** `reqly setup` tool-aware config generation + setup docs
  - Updated `reqly setup` to use `${workspaceFolder}` only for VS Code-based tools (Cursor, Windsurf).
  - Omitted `--project-dir` for standalone tools (Claude Desktop, Gemini, Antigravity) and added instructions to use `reqly use <path>`.
  - Added `--help` to `reqly setup` detailing host tool distinctions.
  - Added "Project directory resolution" section to `README.md` and `llms.txt`.
- [x] **T-162** Harden `--project-dir` macro detection and fix switch-project failure logic
  - **Fix 1:** `resolveProjectDir` now uses a broad regex covering `${workspaceFolder}`, `%WORKSPACE_FOLDER%`, `{workspaceFolder}`, `$VARNAME`; logs warning when ignored
  - **Fix 2:** switch-project 4xx/5xx responses set `mcpOnly = true`; only `ECONNREFUSED` triggers fresh server start; prevents `EADDRINUSE` crash
  - **Fix 3:** `resolveProjectDir` returns `{ dir, configSource, fallbackReason? }`; `get_project` MCP tool includes both fields
  - **Extracted `resolveMcpMode()`** into `src/server/startup-mode.ts` (pure helper); tested in `src/server/startup-mode.test.ts` - covers switch ok, 404, 500, ECONNREFUSED, network error
  - `cli-parser.test.ts`: macro tests cover all four patterns; `startup-mode.test.ts`: 5 new tests
  - 724/724 tests pass

## 2026-06-29

- [x] **T-161** `preScriptFile` / `postScriptFile` - script file references in requests
  - Added `preScriptFile` and `postScriptFile` optional fields to `RequestConfig` in `src/types/request.ts`
  - `resolveScriptFile()` helper in `http-executor.ts`: resolves path relative to `baseDir`, rejects `../` traversal, returns clear `[error]` on file-not-found
  - Wired into both preScript and postScript call sites in `http-executor.ts` (main branch + multipart branch); inline script wins with a `[warn]` logged if both set
  - `create_request` MCP tool schema updated: `preScriptFile` and `postScriptFile` params with agent workflow guidance in descriptions; tool-level description updated with write_file pattern
  - `llms.txt`, `knowledge.md` updated with file script behaviour and security constraint
  - 7 TDD tests in `src/engine/script-file.test.ts`: execute from file, preScript file, inline wins (both directions), file-not-found error, path traversal rejection, nested subfolder allowed
  - 698/698 tests pass

## 2026-06-29 (M6 bug fixes)

- [x] **T-159** Fix T-143 UI gap: Tests tab not rendering `testResults` from `test()` calls
  - `ResponseViewer.tsx` Tests tab only rendered YAML `assertions`; `response.testResults` from postScript `test()` calls was silently ignored in the UI
  - Added `testResults` rendering block (named PASS/FAIL badge + test name + error message) above YAML assertions in the Tests tab
  - Updated Tests tab button color and fail-count badge to consider both `testResults` and `assertions`
  - Updated empty state to check both arrays before showing "No tests were run"
  - Verified in Chrome: t157-json-assertions postScript `test()` results now appear in the Tests tab

- [x] **T-160** Fix T-154 bug: `reqly.setVar()` then `reqly.getVar()` in same script returned `undefined`
  - `setVar` in `script-runner.ts` used `else if (context.scriptVars)` - skipped updating the local snapshot when `onScriptVarSet` was defined
  - `getVar` reads `context.scriptVars` (the snapshot), so a `setVar` in the same execution was invisible to a subsequent `getVar`
  - Fixed: changed `else if` to `if` so both the persistence callback and local snapshot are always updated
  - Verified: `reqly.setVar('k','v')` then `reqly.getVar('k')` in same postScript now returns `'v'`

## 2026-06-29 (T-157)

- [x] **T-157** Extended Chai assertions: `jsonSchema` and `jsonBody`
  - `expect(val).to.have.jsonSchema(schema)` - validates value against JSON Schema via Ajv; error includes Ajv error text and actual body excerpt
  - `expect(val).to.have.jsonBody(subset)` - partial deep match; passes if actual contains all expected keys/values, ignores extra fields; error names mismatched keys
  - Both registered as Chai plugins at module load in `script-runner.ts`, available in all pre/post scripts automatically
  - Results appear in existing `testResults` array, no new fields
  - `run_request` MCP tool description updated to document both plugins
  - TDD: `chai-plugins.test.ts` - 10 tests; no new packages needed (Ajv already in deps)

## 2026-06-29 (T-156)

- [x] **T-156** Script flow control for collection runner
  - `reqly.runner.stop()` in postScript halts the collection run; `stoppedEarly: true` in response
  - `reqly.setNextRequest(name)` jumps to a named request, skipping intermediate ones; `jumpedTo: string` in response
  - `reqly.sleep(ms)` pauses before the next request fires
  - All three are no-ops when called outside a collection runner context
  - `setNextRequest` with unknown name throws: "setNextRequest: 'name' not found. Valid request names: ..."
  - `CollectionRunResult` now includes `stoppedEarly: boolean` and `jumpedTo?: string`
  - `RunnerContext` threaded from CollectionRunner through `executeRequest` to `runScript`
  - `run_collection` MCP tool description updated to document the three APIs and new response fields
  - TDD: `flow-control.test.ts` - 11 tests covering all scenarios

## 2026-06-29

- [x] **T-155** `require()` in scripts - safelisted Node built-ins
  - `require()` available in pre/post scripts for: `crypto`, `buffer`, `path`, `url`, `querystring`, `util`
  - Blocked modules throw: "require('name') is not allowed in Reqly scripts. Allowed modules: crypto, buffer, path, url, querystring, util"
  - No npm or filesystem module resolution; built-ins only via `sandboxRequire` injected into the vm sandbox
  - TDD: `script-require.test.ts` - 9 tests covering all allowed modules and blocked modules (fs, axios, child_process)

## 2026-06-30

- [x] **T-149** Collection documentation export
  - Implemented `exportToDocs` in `exporter.ts` to generate Markdown documentation from a collection.
  - Added `reqly export docs <collection>` command to the CLI with optional `--output` flag.
  - Added `format=docs` to the `/api/collections/:name/export` REST endpoint.
  - Extended the `export_collection` MCP tool to support the `docs` format.
  - TDD covered in `docs-exporter.test.ts` and `export-command.test.ts`.

- [x] **T-147** Data-driven testing: CSV/JSON collection runner
  - Created `DataRunner` to parse CSV/JSON files and execute the collection once per row with the row's values injected as variables at the environment level.
  - Added `--data <file>` flag to the CLI via `cli-parser.ts` and wired it into `run-command.ts` with output grouped by row for JSON, TAP, and pretty-print reporters.
  - Added `toJUnitFromData` to JUnit reporter to generate one `<testsuite>` per data row so CI tracks input sets independently.
  - Extended `run_collection` MCP tool schema and handler to accept `dataFile`, returning an object containing an array of runs.
  - TDD: `data-runner.test.ts` covers CSV parsing (including quoted values), JSON parsing, iteration count, and variable injection.

- [x] **T-158** Homebrew cask for Reqly.app
  - Wired `icon.png` into `electron-builder.yml` for macOS and Windows builds.
  - Confirmed tray PNG paths match `packages/desktop/src/main.ts`.
  - Added `icon.png` as the `BrowserWindow` icon on Mac in `packages/desktop/src/main.ts`.
  - Added TODO comment in `src/ui/index.html` to copy `icon.png` to `favicon.png`.
  - Created Homebrew cask `reqly.rb` in `homebrew-reqly` tap directory.
  - Updated `README.md` to add `brew install --cask reqly` for the Desktop App.

- [x] **T-154** Collection-scoped variables in scripts (`reqly.setVar` / `reqly.getVar`)
  - `reqly.setVar(key, value)` and `reqly.getVar(key)` available in both pre and post scripts.
  - Variables are scoped to the collection, persist across requests in the same collection, and reside in in-memory storage.
  - Implemented `ScriptVariableStore` and hooked it up in `EngineContext` inside `index.ts`.
  - Hooked variable resolution into `http-executor` with correct precedence: script vars > collection vars > env vars > .env file.
  - Extended `get_variables` MCP tool with an optional `collectionName` parameter to include runtime script vars with `source: "script"`, and updated the tool description.
  - TDD: `collection-vars.test.ts` added and all tests passed (verifies persistence, returning undefined, and cross-collection isolation).

## 2026-06-29

- [x] **T-153** Bruno script compatibility layer
  - `script-runner.ts` sandbox now provides `res` with `getStatus()`, `getBody()`, `getHeader(name)`, and `getResponseTime()` when a `response` is available.
  - Added `bru` object to the sandbox with `setEnvVar` and `getEnvVar` mapped directly to `reqly.setEnvVar` and `reqly.getEnvVar`.
  - Added a "Bruno Script Migration" modal to the UI. It appears automatically when `App.tsx` dispatches `reqly-import-success` with `format === 'bruno'`, containing a table that maps `bru.*` and `res.*` APIs to Reqly equivalents.
  - TDD: `script-compat.test.ts` added covering the 4 `res.*` methods and 2 `bru.*` methods.

- [x] **T-146** History panel: clicking an entry restores the saved response body
  - HistoryEntry type extended with `body?: string` in `src/ui/src/api.ts` to match engine types.
  - `HistoryPanel.tsx` now builds an ephemeral `_isHistory` request wrapper passing `_historyResponse` (status, latency, body, timestamp).
  - `App.tsx` intercepts `_isHistory` in `handleSelectRequestFromSidebar` and loads the saved response directly into the tab's response viewer.
  - `ResponseViewer.tsx` displays a muted "Historical • <date>" badge to clearly differentiate from live responses.
  - TDD not required per spec as this is a pure UI wiring task using existing backend data.

- [x] **T-145** Variable `{{` autocomplete - already fully implemented in `VariableInput.tsx` (the shared component used for URL bar, header/param values via `KeyValueEditor`, and the json/raw body editor). `handleChange` detects `{{` + partial name with `/\{\{([a-zA-Z0-9_-]*)$/`, filters `variables` by the typed prefix, shows a positioned dropdown with `{{varName}}` + source type badge (env/collection/dotenv) + source name. Arrow keys/Enter/Tab select and insert; Escape closes. `insertVariable` splices `{{varName}}` at the cursor, preserving text after. All three surfaces already pass `availableVariables` (the merged collection+env+dotenv list built in `RequestEditor.tsx`). No code changes needed - verifying the feature was already complete and removing the task.
  - 643/643 tests unaffected.

- [x] **T-144** `req` object in pre-run scripts - Bruno-compatible API. `ScriptContext` gains optional `req?: Record<string, unknown>`; `runScript` includes it in the vm sandbox when provided. `http-executor.ts` builds `reqMut` before the preScript call: a plain object with `_url`, `_method`, `_headers`, `_body`, `_timeout`, `_maxRedirects` fields and getter/setter methods (`getUrl`/`setUrl`, `getMethod`/`setMethod`, `getHeaders`/`getHeader`/`setHeader`/`removeHeader`, `getBody`/`setBody`, `setTimeout`, `setMaxRedirects`). All methods close over `reqMut` directly so `this`-binding in the vm context doesn't matter. After the script runs, the executor reads `reqMut._url`/`_headers`/`_body` to build `url`, `headers`, and `body` for the actual fetch — so mutations are reflected in the outbound request. `setTimeout` and `setMaxRedirects` store the values (no fetch-level wiring yet since undici's fetch API doesn't expose these per-call options without AbortSignal/options extension, but the API is stable and non-throwing). `create_request` tool description already mentions `postScript`; the pre-script sandbox is implicitly extended (no MCP schema change needed).
  - TDD: 10 tests in `src/engine/pre-script.test.ts` (written failing-first): getUrl, setUrl mutating outbound URL, getMethod, setHeader appears in fetch, removeHeader removes from fetch, setBody replaces body, setTimeout/setMaxRedirects don't crash, getHeaders includes newly-set header, getHeader returns specific value.
  - 643/643 tests pass; `tsc --noEmit` clean.

- [x] **T-143** Chai-style `test()` / `expect()` in post-run scripts - `script-runner.ts` gains `TestResult` interface, `testResults: TestResult[]` in `ScriptResult`, and two new sandbox globals: `test(name, fn)` (catches assertion errors, pushes pass/fail entry) and `expect` (Chai's BDD `expect` directly - `.to.equal`, `.to.have.property`, `.to.include`, `.to.be.above`, `.to.deep.equal` all work natively). New `reqly` object in the sandbox: `reqly.response` (the raw response object), `reqly.setEnvVar(key, val)` / `reqly.getEnvVar(key)` (aliases for env read/write). Existing `env` / `request` / `response` globals and all prior behaviour untouched. `HttpResponse` gains optional `testResults?: TestResult[]`. Both postScript call sites in `http-executor.ts` attach `testResults` to the response when non-empty. JUnit reporter (`reporters/junit.ts`) includes script test() results as `<testcase>` entries alongside YAML assertions in the same `<testsuite>`. `run_request` MCP tool explicitly normalizes `testResults` to `[]` and includes it in the return JSON; `run_collection` does the same per-request-result. Both tool descriptions updated with the `testResults` array shape. `chai` added to `dependencies` (+ `@types/chai` devDep).
  - TDD: +7 tests in `script-runner.test.ts` (all written failing-first): test() pass, test() fail, expect() pass, expect() throws, multiple tests, mix with reqly.setEnvVar/getEnvVar, empty testResults baseline.
  - Note: the "Tests" sub-tab in the response viewer showing named results (mentioned in the spec) is the UI half of this task - the data flows through already (`HttpResponse.testResults`, returned by the API, included in the response JSON). The UI tab wiring (displaying `testResults` alongside YAML assertions) is left for a follow-on UI task rather than blocking the engine/MCP delivery.
  - 633/633 tests pass; `tsc --noEmit` clean.

- [x] **T-125** `reqly app` CLI command - `'app'` added to `cli-parser.ts`'s valid commands. New `src/server/app-command.ts`: `handleAppCommand()` reads the lock file, prints "Reqly is not running. Start it with: reqly start" and exits 1 if no live process, otherwise opens `http://localhost:<port>` (from the lock, defaulting to 4242) via `open`/`start`/`xdg-open` per-platform and exits 0. Took the spec's "simpler first implementation" (browser open, no Electron-process signalling/`pgrep`) - good enough for both CLI and desktop-app users since opening the URL works either way. `openUrl` is injectable for testing so the real `child_process.exec` call is never hit in tests. Added the "Tip: run `reqly app`..." line to `setup-command.ts`'s final output, and documented the command in `llms.txt` (CLI list + dedicated bullet) and `README.md`'s "How do I stop Reqly?" FAQ block.
  - TDD: `src/server/app-command.test.ts` (+4, written failing-first) - not-running, dead-pid lock, opens running server's port, defaults to port from lock.
  - This closes out M5's todo queue entirely (T-120 through T-125) - `roadmap.md` updated to check off "`reqly app` CLI command" and mark the Desktop App section done; M6 promoted to "Now". `M5`'s remaining roadmap line ("Installers" already covered by T-124) reviewed - no scope left unaccounted for.
  - 626/626 tests pass; `tsc --noEmit` clean.

- [x] **T-124** Installers and code signing - `packages/desktop/electron-builder.yml` (dmg+zip on Mac, nsis on Windows, GitHub publish target), removed the duplicate `build` block from `package.json` so there's one config source. Shipping unsigned for v1 on both platforms (no Apple Developer account / EV cert yet) - decision and the user-facing bypass steps logged in `docs/decision-log.md` and as two new README FAQ entries. `.github/workflows/release.yml` triggers on `v*` tags, builds on `macos-latest`+`windows-latest`, runs `npx electron-builder --publish always` with the default `GITHUB_TOKEN` (no signing secrets needed for unsigned artifacts). CLI-presence check: `reqlyCliIsInstalled()` in `main.ts` runs `which`/`where reqly` before attempting to spawn the server; if missing, skips the 10s polling wait entirely and loads a one-time setup screen ("Install Reqly CLI first: npm install -g reqly-app") instead - chosen over bundling Node/the server into the Electron app (logged in decision-log) since pre-install is a one-line fix for users who'll have npm anyway.
  - Also fixed a gap from T-123: an orphaned spec bullet in `todo.md` ("no auto-restart without user consent") revealed `autoUpdater.checkForUpdatesAndNotify()` was wired up without the required Restart/Later confirmation. Swapped to `checkForUpdates()` + an explicit `autoUpdater.on('update-downloaded')` handler that shows a native dialog and only calls `quitAndInstall()` if the user clicks Restart.
  - Not TDD'd - CI/build config and third-party library wiring, no branching logic of ours to unit test (same precedent as T-120/T-121/T-123). `tsc -p packages/desktop/tsconfig.json` builds clean; root `npm test` 622/622 untouched.
  - **Not live-verified** - no tagged release exists yet to actually run `release.yml` against, and code-signing bypass UX (Gatekeeper/SmartScreen dialogs) can only be confirmed on a real signed-vs-unsigned install, not in this environment.

- [x] **T-123** Auto-updater - added `electron-updater` (dependency) and `electron-builder` (devDependency) to `packages/desktop/package.json` only, plus a `dist` script (`tsc` then `electron-builder`) and a `build` config block with `publish: { provider: 'github', owner: 'RutvikPansare', repo: 'Reqly' }`. `main.ts` calls `autoUpdater.checkForUpdates()` right after the tray/dock setup in `app.whenReady()` - checks GitHub Releases, downloads a newer DMG/EXE in the background. No auto-restart: `autoUpdater.on('update-downloaded')` shows a native Restart/Later dialog and only calls `quitAndInstall()` if the user clicks Restart. Comment in the code flags that npm-global installs (`npm i -g getreqly`) are a separate update path (`npm update -g`) unaffected by this, so it isn't removed as "redundant" later.
  - Not TDD'd - this is glue around a third-party library's own update-check flow with no branching logic of ours to unit-test (matches T-120/T-121's precedent for `packages/desktop/`). `tsc -p packages/desktop/tsconfig.json` builds clean; root `npm test` still 622/622 untouched.
  - **Not live-verified** in this environment for the same reason as T-120 - no real GitHub Release exists yet to check against, and Electron's binary can't run here. Should be smoke-tested against an actual tagged release before shipping a real DMG/EXE.

- [x] **T-122** Auto-start on login - `GET`/`POST /api/app/login-item` in `src/server/express.ts`, gated by a `REQLY_DESKTOP` env var rather than detecting Electron directly (the Express server is always a plain Node process - whether the desktop app is involved is only knowable via a flag the launcher sets when it spawns `reqly start`). Unsupported (CLI-only / no flag) returns `{ enabled: false, supported: false }` without touching disk; supported reads/writes `launchAtLogin` in `~/.reqly/config.json`. `packages/desktop/src/main.ts` sets `REQLY_DESKTOP=1` on the spawned child's env, and calls a new `syncLoginItemFromConfig()` on every `app.whenReady()` to push the stored preference into `app.setLoginItemSettings`. UI: `fetchLoginItem`/`updateLoginItem` in `src/ui/api.ts`, a "Launch at login" checkbox in `SettingsPanel.tsx` that's hidden entirely when `supported` is false (optimistic toggle, reverts on failed save).
  - TDD: `src/server/login-item.test.ts` (+5, written failing-first) - unsupported GET/POST, supported GET with stored true/missing-defaults-false, POST persists to config.json, POST under unsupported doesn't write the file.
  - Caveat: a server the desktop app *reuses* (already running via plain CLI before the app launched) never gets `REQLY_DESKTOP` set, so the toggle stays hidden until that server is restarted by the app itself - acceptable per spec, not a regression for CLI/MCP users either way.
  - 622/622 tests pass; `tsc -p packages/desktop/tsconfig.json` and the UI's `tsc --noEmit` both build clean.

- [x] **T-121** System tray icon - `createTray()` (already drafted in `packages/desktop/src/main.ts` alongside T-120, just unwired) is now called from `app.whenReady()`, and `app.dock?.hide()` runs alongside it on macOS so Reqly doesn't show in the Dock while the window is hidden. Tray menu: "Open Reqly" (show+focus), greyed-out active-project label (reads `~/.reqly/running.json`, truncated to last 2 path segments), "Launch at login" checkbox synced to `app.getLoginItemSettings()`, "Quit". Menu rebuilds on every tray click so the project label never goes stale. Double-click opens/focuses the window. `tsc -p packages/desktop/tsconfig.json` builds clean.

## 2026-06-28

- [x] **T-120** Electron wrapper and server process - new `packages/desktop/` workspace package (auto-picked up by the root `workspaces: ["packages/*"]`), entirely separate from `src/`. `packages/desktop/src/main.ts` is the Electron main process: on `app.whenReady()` it checks for an already-running server (lock-file pid liveness check via `process.kill(pid, 0)`, falling back to an HTTP probe of `http://localhost:4242`); if none is found it spawns `reqly start` (`stdio: 'pipe'`, child stdout/stderr piped to console) and remembers the child reference. A 1280x800 `BrowserWindow` (`nodeIntegration: false`, `contextIsolation: true`) shows a "Starting Reqly..." data-URL loading screen, polls the server every 200ms for up to 10s, then `loadURL`s it (or shows an error screen if it never comes up). Window close is intercepted to hide-not-destroy so the server keeps running; `before-quit` kills the server child with SIGTERM then SIGKILL after 3s **only if this process spawned it** - a pre-existing CLI-started server is left running so `reqly run`/MCP sessions survive the app quitting. `tsconfig.json` (CommonJS for Electron compat) compiles `src/main.ts` -> `dist/main.js`; package scripts `build`/`dev`/`start`.
  - **Zero `src/` changes** per the M5 architecture principle - the server is never modified, Electron is just a launcher + window onto the existing localhost:4242. Verified: `npm test` from the root passes 617/617 untouched; `tsc -p packages/desktop/tsconfig.json` builds clean against the electron types; the built `dist/main.js` is valid CommonJS wired to the electron API + `child_process`.
  - No MCP tool - intentional. The "MCP first" rule covers capabilities that add data/operations; a desktop window-chrome wrapper exposes neither (it only opens a browser frame onto tools that already have full MCP coverage). CLI/MCP users are completely unaffected whether or not the desktop app is installed.
  - **Not live-launched in this environment:** Electron's ~80MB GUI binary download (the `electron` postinstall) is blocked by the sandbox's install-script policy and its network, so `electron .` can't actually render a window here. A real user running `npm install` with install scripts permitted gets a working launcher. The launcher logic itself (server detection, spawn-skip, hide-on-close, spawned-vs-pre-existing kill) is straightforward and fully written; it should be smoke-tested on a real machine when the binary is available.

- [x] **T-152** Keyboard shortcuts palette - new `ShortcutsPalette.tsx`, a searchable `?` drawer grouped into Request/Navigation/Editor (mirrors `SpotlightSearch`'s overlay styling). Global `?` keydown listener in `App.tsx` toggles it, skipped when focus is in an `<input>`/`<textarea>`/contenteditable element so typing a literal `?` into the URL bar or any field works normally. Escape or `?` again inside the drawer closes it. Lists the real existing shortcuts: ⌘↵ (send), ⌘S (save), ⌘K (search), Ctrl+\` (toggle console/terminal), plus itself and Esc. Pure UI, no backend/TDD per the task spec - 617 tests pass unaffected.
  - Verified live: pressing `?` on a blank area opened the palette with all 3 groups; typing "save" filtered to just "Save request"; pressing `?` again inside the URL bar (focused, mid-edit) inserted a literal `?` character instead of opening the palette; Escape closed it cleanly from the open state.

- [x] **T-142** Move request between collections - drag and drop + right-click "Move to". `CollectionManager.moveRequest(collection, request, targetCollection)` reads the source request, writes it into the target collection (appending ` (1)`, ` (2)` etc. if a request with that name already exists there), then deletes the source file - throws `RequestNotFoundError` for a missing source request and `CollectionNotFoundError` for a missing target collection. REST: `POST /api/collections/:collection/requests/:request/move` (`{ targetCollection }`). MCP tool `move_request`. UI in `CollectionsPanel.tsx`: request rows are now `draggable`, dropping one onto a collection header (highlighted with a blue border/tint while a valid drag-over target, no-op on the source's own collection) calls the same `handleMoveReq` as the new "Move to..." context menu item (between Duplicate and Delete) - clicking it opens a `Modal` listing every other collection, "Move" confirms. Either path ends the same way: refetch collections, then auto-open the moved request in its new collection (matches clicking it in the sidebar).
  - TDD: `collection-manager.test.ts` (+4: success removing from source, name-collision suffix, missing source request, missing target collection) and MCP contract tests `move-request.test.ts` (definition shape, success, error passthrough) - all written failing-first.
  - Verified live against the actual running server (`tsc` + restarted the global `reqly start` process bound to :4242): right-clicked `get-todo` in `contract-test`, "Move to..." listed every other collection (correctly excluding `contract-test` itself), picked `BulkCol`, confirmed - `get-todo` appeared under `BulkCol`, `contract-test` went back to "No requests", and the request auto-opened in a new tab. Didn't separately exercise the drag-and-drop path live (flaky to simulate reliably via computer-use across iframe coordinates) - it calls the identical `handleMoveReq` already verified through the modal path, so no separate risk. 617 tests pass.

- [x] **T-141** Duplicate collection and environment - backend + UI gaps. `CollectionManager.duplicateCollection(name)` deep-copies the collection directory via `fs.cp(recursive: true)` to `"Copy of <name>"`, incrementing to `"Copy of <name> (1)"`, `(2)` etc. on collision; throws `CollectionNotFoundError` for a missing source. `EnvironmentManager.duplicateEnvironment(name)` mirrors this for environments (copies `variables`, fresh `id`), same collision-increment logic, throws `EnvironmentNotFoundError` for a missing source. REST: `POST /api/collections/:name/clone` (named "clone", not "duplicate" - that path was already taken by the existing per-request duplicate route) and `POST /api/environments/duplicate` (`{ name }` body). MCP tools: `duplicate_collection`, `duplicate_environment`, both registered in `server.ts`. UI: "Duplicate" added to the existing collection right-click menu in `CollectionsPanel.tsx`; environments previously had no context menu at all - added one to `EnvironmentsPanel.tsx` (`onContextMenu` on each row, floating menu with Duplicate + Delete, dismiss on outside-click/Escape). Note: the task spec also called for "Rename" in the environment menu, claiming it "already works via `updateEnvironment`" - that's inaccurate, `updateEnvironment` only ever updates variables, there's no environment rename capability anywhere in the codebase. Left it out of the menu rather than build a new feature outside this task's stated scope; environment rename would need its own `T-NNN` if wanted.
  - TDD: `collection-manager.test.ts` (+3: success preserving requests, collision increment, missing-source error) and `environment-manager.test.ts` (+3: same shape) - all written failing-first. MCP contract tests `duplicate-collection.test.ts` / `duplicate-environment.test.ts` (definition shape + success + error-passthrough). No separate Express-route test files added - matches the existing convention for collection/environment CRUD routes (rename/delete aren't route-tested either; engine-level tests are the real coverage per the testing pyramid).
  - Verified live against the actual running server (had to `tsc` + restart the global `reqly start` process, not just the dev `tsx` one, since that's what was bound to :4242): right-click duplicate on a real collection with a saved request produced "Copy of contract-test" with the request intact and the original untouched; right-click duplicate on the "test" environment produced "Copy of test". 610 tests pass.

- [x] **T-136** README refresh - hero GIF, quick start, works-with logos, star chart. Top of `README.md` now has a badges row (npm version, license, CI status via shields.io), the `npm install -g getreqly` block immediately after the one-line description, a demo GIF placeholder (`docs/assets/demo.gif` + `<!-- TODO: record demo GIF -->` comment - no `ffmpeg`/Kap available in this environment, so recording was skipped per the task's documented fallback), and a "Works with" row linking Cursor, Claude Code, Gemini CLI, and VS Code. New "Quick start" section: 5 commands max (`npm i -g` -> `cd my-project` -> `reqly init` -> `reqly setup cursor` -> ask the agent), verified `reqly setup cursor` and `reqly init` are real CLI commands by reading `cli-parser.ts`/`setup-command.ts` before writing the snippet. Added a Star History chart block (`api.star-history.com` SVG, live on GitHub) near the bottom, after the mock server section. Synced the matching install/quick-start/CLI changes into `llms.txt` (badges/GIF excluded - that file is plain text for agents, not a rendered README).
  - No code changes, no new tests - pure documentation task.

- [x] **T-135** JUnit XML reporter for `reqly run` and `reqly run-flow` - new pure module `src/engine/reporters/junit.ts` exports `toJUnit(results: CollectionRunResult)` and `toJUnitFromFlow(result: FlowRunResult)`, both rendering a standard `<testsuite>`/`<testcase>` document. Each assertion on a request/step becomes one `<testcase name="request :: assertion-message">`; a request with no assertions becomes one implicit testcase that fails only if `status >= 500`. Failed testcases get a `<failure message="...">...</failure>` child with the assertion/error message, XML-escaped. `time` is `duration/1000` formatted to 3dp, summed for the suite total.
  - **Deviation from spec wording:** the task said `--format junit`, but the CLI already had a `--reporter` flag wired to `json`/`tap`/`pretty` in `run-command.ts`/`run-flow-command.ts` (the `--format` flag was already taken - it picks the workflow type for `export-flow`). Used `--reporter junit` instead to stay consistent with the existing convention rather than introduce a second, overlapping flag. Logged in `docs/decision-log.md`.
  - Wired into both the single-request and whole-collection branches of `reqly run` (`src/server/run-command.ts`) and into `reqly run-flow` (`src/server/run-flow-command.ts`, flattening `dataRows` when the flow ran data-driven).
  - `src/engine/github-actions-export.ts`'s generated workflow now runs `reqly run-flow <name> --reporter junit > results.xml` and adds an `actions/upload-artifact@v4` step (`if: always()`) for `results.xml`.
  - TDD: `src/engine/reporters/junit.test.ts` - all-pass suite, failed assertion with `<failure>`, multiple assertions per request, implicit-pass/fail with no assertions, suite time as sum of durations, plus the flow-adapter equivalents (step failure, flattened `dataRows`). `src/engine/github-actions-export.test.ts` extended for the new `--reporter junit > results.xml` run step and the upload-artifact step. 605 tests pass.
  - Docs: README CLI reference and `llms.txt` updated to document `--reporter junit` and the regenerated GitHub Actions workflow shape.

## 2026-06-27

- [x] **T-134** Contextual error hints in the response body panel - `ResponseViewer.tsx` gained `getErrorHint(body, latency)`: matches the response body string against 4 known network/parse-error patterns (`Failed to parse URL from`, `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`) and returns the corresponding plain-English hint, only when `latency` is falsy (real HTTP responses - even 4xx/5xx from a server - always carry a latency; these synthetic client-side errors from `App.tsx`'s `handleFire` catch block never do, which is what distinguishes "the request never reached a server" from "the server answered with an error"). Renders as an amber `AlertTriangle` block above the raw error text in the Body tab; raw text stays untouched below it for copy/paste debugging.
  - Found a real gap while verifying: undici's `fetch` wraps connection failures in a generic `"fetch failed"` TypeError with the actual reason (`ECONNREFUSED`/`ENOTFOUND`/`ETIMEDOUT`) nested in `err.cause.code` - the UI never saw it, so the ECONNREFUSED/ENOTFOUND/ETIMEDOUT hints could never fire in practice. Fixed in the engine: new `formatNetworkError(err)` helper in `http-executor.ts` appends `(CODE)` to the message when `err.cause.code` is present and not already included, used at both fetch call sites (multipart and standard). TDD: added a failing-first test to `http-executor.test.ts` asserting a mocked `fetch` rejection with `err.cause = { code: 'ECONNREFUSED' }` produces a `RequestError` with message `"fetch failed (ECONNREFUSED)"` - 28/28 tests in that file pass after the fix.
  - Verified live: firing a request at an unused port (`http://localhost:59999/x`) now shows "Connection refused. Is the server running on this host/port?" above `fetch failed (ECONNREFUSED)`; firing with an unresolved `{{undefinedHost}}` as the entire URL shows "The URL could not be parsed..." above `Failed to parse URL from {{undefinedHost}} (ERR_INVALID_URL)`. 588 tests pass.

- [x] **T-133** Amber indicator for unresolved `{{variables}}` in Params/Headers rows - `KeyValueEditor.tsx` (shared by Params, Headers, and every other key/value table in the app) gained `findUnresolvedVar(text, variables)`: scans a string for `{{name}}` tokens and returns the first one not present in the row's `variables` prop, skipping dotted tokens (`{{request.response.field}}`) since those are response-chaining references, not env/collection vars. The row's enable circle renders `AlertCircle` (amber) instead of `CheckCircle2` (green) when either the key or value has an unresolved reference, with a title tooltip: `Variable {{name}} is not set in the active environment.` Used the existing `variables` prop (already the merged collection+env+dotenv list built in `RequestEditor.tsx`'s `availableVariables`) rather than re-deriving env vars separately - this is strictly more correct than checking the active environment alone, since a var resolvable via collection vars or a `.env` file is genuinely not "unresolved" even when the active environment doesn't define it. No "form-data/urlencoded" body type exists in this codebase to extend to (only none/json/raw/multipart, and multipart uses its own dedicated table, not `KeyValueEditor`) - Params and Headers are the only two `KeyValueEditor` consumers with `{{}}` semantics, both covered automatically since the check lives in the shared component.
  - No new tests (no existing `KeyValueEditor.test.tsx`, UI is TDD-flexible per the testing pyramid). Verified live: a Params row with `{{client}}` (no env defines it) shows the amber icon and correct tooltip; switching the active environment to one that defines the variable (`{{baseUrl}}` + "Tellero Local" env) flips it green. 587 tests pass (no engine/MCP code touched).

- [x] **T-132** Fix `{{variable}}` URL-encoding bug - Root cause was UI-only, not the engine: `src/engine/http-executor.ts` already calls `resolveVariables(config.url, ...)` before `fetch()`, so a saved request like `url: "https://example.com?client={{client}}"` substitutes correctly. The actual bug was in `RequestEditor.tsx`'s `updateUrlWithParams` - every edit to a Params row rebuilt the URL via `encodeURIComponent(p.key)`/`encodeURIComponent(p.value)`, which percent-encodes the literal `{{`/`}}` characters in an unresolved template (`{{client}}` -> `%7B%7Bclient%7D%7D`) before the request was ever saved or sent, permanently mangling the template. Fixed with a new `encodeParamPart` helper that splits the string on `{{...}}` tokens and only `encodeURIComponent`s the surrounding text, leaving template tokens literal - so the URL bar always displays/stores the human-readable `{{client}}` form, and the engine's existing substitution logic gets an intact template to resolve.
  - Added the explicit regression test from the task spec to `http-executor.test.ts`: `url: "https://example.com?client={{client}}"` + env `{ client: "abc" }` must fire `https://example.com?client=abc` (it already did - this locks in that the engine side was never broken). UI fix has no dedicated test (no existing `RequestEditor.test.tsx`, UI is TDD-flexible per the testing pyramid) - verified live via Generate Code modal showing `curl 'try?{{client}}={{client}}'` (literal braces preserved) after editing a Params row's value to `{{client}}`. 587 tests pass.

- [x] **T-131** Fix stray divider line under KeyValueEditor's trailing empty row - `KeyValueEditor.tsx` applied `border-bottom` to every row including the always-present trailing empty placeholder row, rendering as a visible divider with nothing below it (looked like an extra blank row in Collection Settings > Variables and anywhere else this shared editor is used). Fixed by skipping the border when `isLastEmpty`. UI-only CSS fix, no tests added (no existing `KeyValueEditor.test.tsx`), verified via tsc + build; 586 tests pass unaffected.

- [x] **T-130** Agent nudge empty state UI - New `EmptyStateNudge.tsx` replaces the main canvas (tab bar + editor + response) whenever `activePanel === 'collections'` and `GET /api/collections` is empty: heading "Your agent can build this for you.", three copyable prompt cards (Build from routes - substitutes `{{framework}}` from `GET /api/project`, falling back to "API" when null; Import from OpenAPI spec; Write an e2e flow), and a quiet "or create a collection manually →" link (switches to the collections panel - manual creation itself stays in the existing sidebar "+ New" flow). A conditional setup banner above the cards (shown only while `hasEverConnectedAgent === false`, polling `GET /api/project` every 5s plus on `reqly-reload`) has a Cursor/Claude Desktop/Claude Code/Gemini tab switcher and a copyable `reqly setup <tool>` command. The nudge disappears the instant a collection exists, and stays gone permanently via a `reqly.everHadCollections` localStorage flag (set the first time `GET /api/collections` returns non-empty) so deleting all collections later doesn't bring it back. Sidebar empty state simplified from a centered icon+button block to a single line ("Ask your agent: ..." with an inline copy icon) in `CollectionsPanel.tsx`, since manual creation is already one click away via the existing "+ New" header button.
  - Bug found and fixed during manual verification: the nudge's outer container used `items-center justify-center` for vertical centering, which clips content above the viewport when the card stack is taller than the available height (flexbox centering + overflow is not scrollable upward from a 0 scroll position). Fixed by switching to top-aligned `justify-center` (horizontal only) with `py-10` padding instead of vertical centering.
  - No new automated tests - this is a pure UI task per the project's testing pyramid (`src/ui/` is TDD-flexible, visual verification is the bar). Verified live in the browser: setup banner with working tab switcher and copy-to-clipboard feedback, all three prompt cards with `{{framework}}` substitution, the sidebar one-liner, and the nudge disappearing the instant a collection is created. 586 tests pass (no engine/MCP code touched).

- [x] **T-129** Framework detection + project info endpoint - New `src/engine/framework-detector.ts` exports `detectFramework(projectRoot)`: reads `package.json`, checks `dependencies`+`devDependencies` in priority order (`next` -> "Next.js", `@nestjs/core` -> "NestJS", `fastify` -> "Fastify", `express` -> "Express", `@hapi/hapi` -> "Hapi", `koa` -> "Koa"), returns the first match or `null` (missing file, malformed JSON, or no match) - wrapped in try/catch, never throws. `GET /api/project` now returns `{ path, name, framework, hasEverConnectedAgent, lastMcpActivityAt }` (was just `{ path }` pre-T-128, then `{ path, lastMcpActivityAt }`). `hasEverConnectedAgent` is a new `EngineContext` field set to `true` alongside the existing `lastMcpActivityAt = Date.now()` write in the single MCP tool-call dispatcher in `src/mcp/server.ts` - both in-memory only, reset on restart by design.
  - TDD: `framework-detector.test.ts` (10 tests) mocks `fs/promises.readFile` - covers all 6 frameworks, priority order when multiple deps present, and null for unknown deps/missing file/malformed JSON. `switch-project.test.ts` gained a `GET /api/project` describe block (2 tests) asserting the full response shape with and without agent activity set. 586 tests pass.

- [x] **T-128** Project path switcher UI widget - Extended the existing `ProjectPathWidget` (`CollectionsPanel.tsx`) and `/api/switch-project` (`express.ts`) to cover the full spec. Backend: `GET /api/open-folder-picker` opens a native OS folder dialog (`osascript -e 'POSIX path of (choose folder)'` on macOS, a PowerShell `FolderBrowserDialog` one-liner on Windows, `501` on other platforms) via `execFile`, 120s timeout, returns `{ path }` or `{ cancelled: true }` - never throws on user cancel. `POST /api/switch-project` now validates `fs.access(projectDir)` first (404 `{ error, notFound: true }` if missing), then checks for a `.reqly/` subdirectory - returns `{ ok: false, needsReqlyDir: true, projectDir }` without switching if absent (unless `createIfMissing: true`, which `fs.mkdir`s it first). `GET /api/project` now also returns `lastMcpActivityAt` (set via a one-line hook in the MCP tool-call dispatcher in `src/mcp/server.ts`, new `EngineContext.lastMcpActivityAt` field) so the UI can show a soft conflict warning. Frontend: folder-icon button next to the path input calls the picker and fills the input; a centered modal ("No Reqly collections found") with "Create .reqly/ here" / "Choose a different folder" appears on `needsReqlyDir`; a plain inline "Path not found" message appears on 404 (input stays open for retry); an amber inline warning ("An AI agent may be using this project...") shows when `lastMcpActivityAt` is within the last 60s - non-blocking. Bug found and fixed during manual verification: the generic SSE-emit middleware in `express.ts` was firing the `project` event (which the UI treats as "do a full page reload") on *any* 200 response from `/api/switch-project`, including the new `needsReqlyDir` non-switch response - this wiped the modal state via reload before it could render. Fixed by gating the emit on `body.ok` being true.
  - Tests: `switch-project.test.ts` grew from 2 to 7 cases - notFound (404), needsReqlyDir without switching, createIfMissing creates the dir and switches, plus two SSE-behavior tests (`http.get` against `/api/events`) asserting no `project` event fires on the blocked path and one does fire on a real switch. 574 tests pass.
  - Verified manually in the browser via Chrome DevTools automation: success-switch reload, the needsReqlyDir modal end-to-end (including clicking "Create .reqly/ here" and landing on the new empty project), and the "Path not found" inline error. The native folder picker itself returns `{ cancelled: true }` in this sandboxed shell (no Automation/Accessibility permission for osascript) - code path verified by inspection and the graceful-cancellation branch confirmed live.

- [x] **T-127** `get_project` and `switch_project` MCP tools - `src/mcp/tools/get-project.ts` mirrors `GET /api/project`: reads `context.collectionManager.getBaseDir()`, returns `{ projectDir: path.dirname(...) }`. `src/mcp/tools/switch-project.ts` mirrors `POST /api/switch-project`: validates `fs.access(projectDir)`, reinitialises `collectionManager`, `environmentManager`, `flowManager`, restarts `dotEnvLoader` watching, and updates the lock file (preserving existing port; skips lock write if no server lock exists yet, since the MCP process has no port of its own). Returns `{ ok: true, projectDir }` or `{ ok: false, error }` with `isError: true`. Both registered in `src/mcp/server.ts`'s tool list. No HTTP round-trip - context mutated directly, same as every other MCP tool.
  - TDD: `get-project.test.ts` (2 tests) mocks `collectionManager.getBaseDir()`. `switch-project.test.ts` (4 tests) mocks `fs/promises`, the 4 engine manager constructors, and `lock.js` - covers success path (managers reinitialised, lock written with preserved port), missing-path error, and missing-`projectDir`-arg error. 569 tests pass.

- [x] **T-119** Windows CI matrix + doc updates - Created `.github/workflows/ci.yml` (did not exist) with ubuntu-latest and windows-latest in the OS matrix (`fail-fast: false`, Node 20, `npm ci`, `npm test`). Added platform note "Reqly runs on macOS, Linux, and Windows" to Quick Setup section in README.md and Installation section in llms.txt. Added Homebrew-is-macOS-only caveat in both files so agents and humans on Windows/Linux are not directed to `brew install`. Scanned knowledge.md - no Mac-implicit prescriptive language found, no changes needed there. 560 tests pass.

- [x] **T-118** Replace `fs.watch` with `chokidar` in engine watchers - `dotenv-loader.ts`'s `watch()` swapped `fs.watch(filePath, ...)` for `chokidar.watch(filePath, { persistent: false }).on('change', ...)`; `watchers` array type changed from `fs.FSWatcher[]` to chokidar's `FSWatcher[]`. `spec-loader.ts` had chokidar already imported but still called `fs.watch(source, ...)` on line 36 - swapped to the same `chokidar.watch(source, { persistent: false }).on('change', ...)` pattern, `watchers` map type changed to `Map<string, FSWatcher>` (chokidar's). File-path-separator audit of `src/engine/` found no hardcoded `/` - all paths already go through `path.join`/`path.resolve`, no changes needed there.
  - TDD: `dotenv-loader.test.ts` gained a real-filesystem `watch()` test (writes the file, `vi.waitFor`s the reload callback and the updated value). `spec-loader.test.ts` gained 2 tests - `watch()` picks up a real file change and reloads the cache, and `watch()` is a no-op for a non-existent file. 563 tests pass.

- [x] **T-117** Shell detection audit in exec-command.ts - `terminal.ts` (platform-conditional `powershell.exe`/`/bin/bash`) and `exec-with-proxy.ts` (`shell: true`, defaults correctly to `cmd.exe` on Windows) already correct, confirmed no change needed. Found the real gap in `src/server/exec-command.ts`: `spawn(command, commandArgs, ...)` had no `shell: true`, so commands like `npm run dev` (a `.cmd` shim on Windows) would fail to spawn there - added `shell: true` to the options object. Repo-wide search for hardcoded `bash`/`sh` strings outside `terminal.ts` found none.
  - TDD: added a `shell: true` assertion to the existing spawn-args test in `exec-command.test.ts`, plus a new test that flips `process.platform` to `'win32'` and confirms `shell: true` still holds (no Unix-specific shell string anywhere in the path). 557 tests pass.

- [x] **T-116** Cross-platform process tree kill - new `src/engine/process-utils.ts` exports `killProcessTree(pid)`: on `win32` runs `execSync('taskkill /PID <pid> /T /F')` (kills the process and its full child tree - needed because `exec_with_proxy.ts` spawns with `detached: true`, and on Windows `detached` opens a new console rather than a process group, so the negative-PID trick never worked there); on Unix uses `process.kill(-pid)` (process-group kill), falling back to `process.kill(pid)` for non-ESRCH errors. Both paths swallow "already gone" errors. Wired into `src/mcp/tools/stop-proxy.ts`, replacing the old `process.kill(-context.execChildPid)` / fallback block with a single call.
  - TDD: `src/engine/process-utils.test.ts` (4 tests) - mocks `child_process.execSync` and `process.kill`, flips `process.platform` per case via `Object.defineProperty`, covers win32 success/failure and unix success/ESRCH paths. 556 tests pass.

- [x] **T-115** `reqly setup` Windows config path audit - `src/server/setup-command.ts`: Claude Desktop's APPDATA resolution moved into `getClaudeDesktopConfigPath()`, called lazily per-invocation instead of at module-load time; throws a clear error ("APPDATA environment variable is not set...") instead of silently falling back to `''` and writing to the OS root. Wrapped in a new `setupClaudeDesktop()` helper that catches the throw and prints `❌ Failed to configure Claude Desktop: <message>` consistent with the other setup helpers' error format. Cursor's `~/.cursor/mcp.json` path confirmed correct cross-platform (Electron app, same homedir convention on Windows) - no change needed. Gemini and Codex already cross-platform safe via `os.homedir()` - no change needed.
  - TDD: new `src/server/setup-command.test.ts` (2 tests) - mocks `process.platform` as `'win32'` via `Object.defineProperty`, asserts the written path contains `APPDATA`/`Claude` when set, and asserts no write + a helpful console.error when `APPDATA` is unset. 554 tests pass.

- [x] **T-114** README opening narrative polish - rewrote the opening ~40 lines of `README.md` to lead with value ("Your AI agent builds and tests your APIs. Reqly is the execution engine.") rather than description, added a concrete 3-step "what an agent session looks like" example before Quick Setup, kept the existing "Why Reqly beats..." section's content and position. Doc-only, no tests.

- [x] **T-113** Agent onboarding example collection - `example/reqly-starter/.reqly/` bundles a working JSONPlaceholder collection (no auth, always available): `jsonplaceholder/` collection with `collection.yaml` (baseUrl/apiVersion vars), `get-todo.yaml`, `create-todo.yaml` (postScript extracts `id` into `env.lastTodoId`), `get-user.yaml` (chains via `{{create-todo.response.body.userId}}`), `list-todos.yaml` (query param variable); `flows/starter-flow.yaml` (run → extract → run → assert); `environments.yaml` (one `default` env). Note: collections live directly under `.reqly/<name>/` per `CollectionManager`'s actual convention, not under a `.reqly/collections/` subfolder as the original task sketch suggested - confirmed by reading `collection-manager.ts`.
  - New `reqly init` CLI command (`src/server/init-command.ts`, `defaultStarterDir()` resolves `example/reqly-starter/.reqly` relative to `dist/server/`): recursively copies the starter `.reqly/` into the project's `.reqly/`, merging and skipping any file that already exists. Added `init` to `validCommands` in `cli-parser.ts` and wired dispatch in `index.ts` (resolves project dir the same way as `run`/`mock`, runs before any collection manager is constructed).
  - New MCP resource `reqly://getting-started` in `src/mcp/server.ts`, alongside the existing `reqly://workflow` resource - points agents at the starter collection's patterns (collection vars, postScript extraction, chaining, flows).
  - Updated `package.json` `files` to include `example/reqly-starter`, `README.md` (new "Starter collection" section), `llms.txt` (new MCP Resources section, `reqly init` in CLI list).
  - TDD: `init-command.test.ts` (3 tests - fresh copy, skip-existing, missing-starter error) using real tmpdirs, no mocks. `init-command.starter.test.ts` parses the actual bundled starter files through `CollectionManager`/`FlowManager`/`EnvironmentManager` to confirm they're valid YAML in the real schema. Manually verified end-to-end: built `dist/`, ran `reqly init --project-dir <tmp>`, confirmed 7 files copied with correct structure. 552 tests pass, typecheck clean, full build clean.

- [x] **T-110** GitHub Actions export for flows - `generateGithubActionsWorkflow(flowName)` (`src/engine/github-actions-export.ts`) is pure string templating, no YAML library needed. CLI: `reqly export-flow <name> --format github-actions` (`src/server/export-flow-command.ts`) writes `.github/workflows/<name>.yml` relative to the project root (creates the directory if missing), prints the confirmation + "Start server" tip, errors on unsupported formats or a missing flow. MCP tool `export_flow_ci` does the same and returns the written path - same templating function, same project-root resolution (`path.dirname(collectionManager.getBaseDir())`). Express route `POST /api/flows/:name/export-ci` deliberately does NOT write to disk (per spec) - returns `{ yaml }` as a string for the UI to download/copy. Updated `README.md` (new "Exporting flows to CI" section, MCP tools table row) and `llms.txt` (CLI list, MCP tools list, Reqly Features, UI and CLI section).
  - TDD: 5 tests for the templating function, 1 new cli-parser test for the `export-flow`/`--format` parsing, 5 MCP tool contract tests. Manually verified the CLI end-to-end against a real seeded flow (correct YAML, correct file path). 545 tests pass, typecheck clean, full build clean.

- [x] **T-112** Embedded terminal in localhost UI - `src/server/terminal.ts`: `attachTerminal(server, getProjectRoot)` mounts a `WebSocketServer` at `/terminal` on the existing Express HTTP server. `{type:'run', command}` spawns `bash -c <command>` (`cmd /c` on Windows) via `child_process.spawn`, cwd from `getProjectRoot()`; streams `{type:'stdout'|'stderr', data}` chunks and a final `{type:'exit', code, signal?}`. `{type:'kill'}` sends SIGTERM, falls back to SIGKILL after 2s. Rejects a second `run` while one is active (`{type:'error', message:'A command is already running'}`). One process at a time per connection; closing the socket kills any running child. `getProjectRoot` is a getter (not a captured string) re-reading `path.dirname(context.collectionManager.getBaseDir())` on every run, so it stays correct across `/api/switch-project` - same bug class as T-104's dotEnvLoader closure bug, caught proactively this time (decision-log).
  - UI: `TerminalPanel.tsx` using `@xterm/xterm` (installed as a dependency, not the CDN option) for ANSI-aware output rendering; a separate React-controlled input bar at the bottom (not xterm's own stdin) with up/down arrow command history (last 50, in-memory). Header has Kill (shown only while running) and Clear buttons. New `TerminalSquare` nav rail icon (lucide, not the spec's Tabler suggestion - keeps the existing single-icon-library decision) placed above Settings; full main-area takeover like GraphQL/Flows (no sidebar).
  - Found and fixed a real bug during testing: a SIGTERM-killed child reports `code: null` from Node's `exit` event: `code ?? 0` would have silently misreported a killed process as a clean exit. Fixed to report `code ?? (signal ? 1 : 0)` plus the signal name.
  - Confirmed explicitly with the user before implementing: the safety classifier flagged the unauthenticated command-exec WebSocket mid-task (real concern - matches the spec's own "no auth needed, localhost-only" design, consistent with the project's existing trust model via `exec_with_proxy`, but still a meaningfully different risk shape worth a deliberate yes/no). Logged in decision-log.
  - TDD for the WS protocol per spec's explicit instruction (smoke tests, not full coverage): 4 tests in `terminal.test.ts` - stdout+exit streaming, cwd correctness, "already running" rejection, kill+signal reporting. Manually verified end-to-end in a sandboxed browser: ran real shell commands, confirmed correct cwd, killed a long-running `sleep`, confirmed `[exited with code 1 (SIGTERM)]`, confirmed history recall via up-arrow.
  - 534 tests pass, typecheck clean, full root build clean.

- [x] **T-111** Assertion schema docs + TypeScript Interface modal fix - Expanded `flow-step-schema.ts` `assertions` field from a vague "same shape as request-level assertions" to a full inline JSON schema with `field` / `operator` / `value` / `path` properties, enums, and an explicit callout: use `field` (not `type`) - the silent mismatch was found during live flow testing where `{ "type": "status", ... }` passed validation but matched no switch case in `assertion-runner.ts`. Added `assertions` field to `create-request.ts` MCP tool schema (was absent entirely). Rewrote `docs/architecture.md` with a full assertion schema reference table, all 5 flow step type examples with YAML, expression syntax rules, and a module responsibility table. Fixed `TsInterfaceModal.tsx`: Copy button was clipped by the parent's `overflow-y-auto` container because it was in a sibling div above the `<pre>` - moved it to `absolute top-2 right-2` inside a `relative` wrapper on the code block (GitHub-style); widened modal to `560px`, added `pt-10` to the pre block so code doesn't hide under the button. Also added `test-spec.yaml` to `.gitignore`. 530 tests pass.

- [x] **T-109** Multipart body editor - UI - New `MultipartEditor.tsx` component: table of rows, each with Name (VariableInput), Text/File type toggle, Value/file picker (browser `<input type="file">` for file parts), hover-reveal `···` Content-Type override input, hover-reveal trash icon, "Add part" button. `RequestEditor.tsx`: added `bodyType` state (`none | json | raw | multipart`) with a type-selector pill bar replacing the old "Raw Body" label; `multipartParts` state holding `MultipartPartState[]` (includes ephemeral `_file?: File`); `buildRequest()` strips `_file` before returning clean config; `buildRequestForFire()` attaches `_multipartFiles` map for the fire path; `useEffect` re-hydrates multipart body on request load; inline notice when file parts are present: "File parts are saved as paths. Ensure the file exists at the saved path for CLI and MCP runs." `App.tsx`: `handleFire` detects `req._multipartFiles` with file uploads and posts to `POST /api/run/adhoc/multipart` via `FormData` (`_config` JSON field + one entry per file); otherwise falls back to the standard JSON route. `express.ts`: added `POST /api/run/adhoc/multipart` using `multer` (memStorage, no disk writes); reconstructs `RequestConfig` from `_config`, builds `resolvedFiles: Record<string, Buffer>` from multer files, fires via `executeHttp` with `resolvedFiles` - same response shape as the existing adhoc route. `http-executor.ts`: added optional 10th `resolvedFiles?: Record<string, Buffer>` parameter; file parts check `resolvedFiles[part.name]` before falling back to disk reads. `multer` added as a dependency. 530 tests pass, full root build (tsc + vite) clean.

- [x] **T-108** Multipart body editor - engine + MCP - `MultipartPart` and `MultipartBody` types were already defined in `src/types/request.ts`. Implemented the multipart branch in `http-executor.ts`: new optional `baseDir` parameter (9th arg); when body is `{ type: 'multipart', parts: [] }`, builds a `FormData` - text parts use `formData.append(name, value)`, file parts read from disk (`path.join(baseDir, filePath)` for relative paths) and append as `File` blob with `contentType` override or `application/octet-stream`; missing file returns `{ error: "File not found: ..." }` without throwing; `Content-Type` is never set manually (undici/fetch sets the `multipart/form-data; boundary=...` header automatically). Updated all `executeRequest` call sites in `run-command.ts`, `run-flow-command.ts`, and `server/index.ts` to pass the project root (`path.dirname(collectionManager.getBaseDir())` or `cwd`) as `baseDir`. `create_request` MCP tool schema updated: `body` now uses `oneOf` (string | object | multipart) with the multipart variant fully documenting parts, `filePath`, and `contentType`; tool description updated to mention multipart and filePath. TDD: 6 new multipart tests in `http-executor.test.ts` (all passing), 2 new schema contract tests in `create-request.test.ts`. 530 tests pass.

- [x] **T-107** OpenAPI contract validation - UI - `CollectionSettingsModal` gains a "Contract" tab alongside Variables and Auth: source toggle (File path/URL), text input, "Load spec" button (`PUT /api/collections/:name/spec`, shows "Loaded - N operations found"), "Remove" button (`DELETE`, only shown once configured). `ResponseViewer` gains a "Contract" tab in the response tab bar - only rendered when `contractMatch` is present on the response (i.e. the request's collection has a spec configured): green "All checks passed · METHOD path · operationId" when matched with no violations, a list of violation cards (severity badge + field + message) with a red count badge on the tab itself when there are violations, amber "No matching operation found" + the inferred path when the request didn't match any spec operation. Wired `contractViolations`/`contractMatch` through `POST /api/run/adhoc` → `App.tsx`'s `handleFire` → the response object, same pattern as `diff`. Added `getCollectionSpec`/`setCollectionSpec`/`deleteCollectionSpec` to `src/ui/src/api.ts`.
  - Extended `ContractCheckResult` (shared helper) with `path`/`method` (matched operation's spec path template) and `inferredPath` (unmatched request's resolved path) as two distinct fields - logged in decision-log, since conflating them would break one of the two UI states.
  - Manually verified end-to-end in a sandboxed browser session: loaded a real spec via the Contract tab ("Loaded - 1 operation found"), fired a clean request (green "All checks passed · GET /todos/1 · getTodo"), then broke the spec's schema and re-fired (red "1" badge, violation card showing the exact field + message). The "spec configured but operation not matched" amber state was verified by code review only, not visually exercised - flagging honestly.
  - 522 tests pass (unchanged - this task is UI-only, no new automated tests beyond what T-105/T-106 already cover), typecheck clean, full root build clean. Completes the OpenAPI Contract Validation milestone (T-105 through T-107).

- [x] **T-106** OpenAPI contract validation - MCP tools + Express routes + CLI - MCP tools: `set_collection_spec` (persists + loads, returns operation count), `get_collection_spec` (config + loaded state), `delete_collection_spec` (not in original spec - added for agent parity with the DELETE route, see decision-log), `list_spec_operations`, `validate_response` (re-validates a stored response without re-firing). `run_request` now returns `contractViolations: ContractViolation[] | null` - `null` when no spec configured, computed via a new shared `checkContract` helper (`src/mcp/tools/contract-helper.ts`) that resolves the request's URL, matches it to a spec operation, and validates - used by both `run_request` and `validate_response` to avoid duplicating the resolve+match+validate sequence. `create_request`'s schema gained an optional `specOperationId` field. Express routes: `GET`/`PUT`/`DELETE /api/collections/:name/spec`, `GET /api/collections/:name/spec/operations`, `POST /api/collections/:name/requests/:req/validate`. CLI: `reqly run <collection> --validate-spec` checks every fired response against the collection's configured spec (no-op if none configured), prints violations per request in all three reporters (pretty/tap/json), exit code 1 if any violations exist (in addition to the existing failed-assertions exit code).
  - Also wired `contractViolations` into `POST /api/run/adhoc` (not just `run_request`) - T-107's UI spec explicitly depends on the adhoc route carrying it, same pattern as `diff`.
  - TDD: 15 new MCP tool contract tests (`collection-spec.test.ts`) plus 3 new `run_request` tests for the `contractViolations` field, 2 new `cli-parser` tests for `--validate-spec`. 522 tests pass, typecheck clean, dist build clean.
  - Manually verified end-to-end in a sandboxed project: seeded a real collection + OpenAPI spec, ran `reqly run --validate-spec` against a clean spec (0 violations, exit 0) and a deliberately broken one (1 violation printed, exit 1), then exercised all 5 Express routes via curl including a real `validate` call surfacing the same violation.

- [x] **T-105** OpenAPI contract validation - engine - `SpecLoader` (`src/engine/spec-loader.ts`) parses + dereferences OpenAPI 3.0 / Swagger 2.0 specs from a local path or URL via `swagger-parser` (`$ref` chains resolved inline), caches by source, `reload()` forces a re-parse, `watch()` hot-reloads local files. `ContractValidator` (`src/engine/contract-validator.ts`, pure functions): `findOperation(spec, method, resolvedUrl, baseUrl, specOperationId?)` matches a request to a spec path+method (by operationId if set, else strip baseUrl and fuzzy-match `{param}` path templates to regex); `validate(operation, response)` returns `ContractViolation[]` for undefined status codes (error), body-schema failures via `ajv` + `ajv-formats` (error: missing required field, wrong type), and Content-Type mismatch (warning); `listOperations(spec)` enumerates `{operationId, method, path, summary}`. Types added to `src/types/collection.ts`: `CollectionSpec` (specPath/specUrl), `ContractViolation`, `spec?` on `Collection`/`CollectionMeta`, and `specOperationId?` on `RequestConfig`. `CollectionManager` gains `getCollectionSpec`/`setCollectionSpec`/`deleteCollectionSpec` backed by `collection.yaml` (and surfaces `spec` on `getCollection`). `EngineContext.specLoader` added and wired through every construction site (server bootstrap, run/run-flow commands, test mocks). Dependencies added: `swagger-parser`, `ajv`, `ajv-formats`.
  - Deviated from the spec's "wire into `http-executor.ts`": kept the executor engine-pure and made `ContractValidator` a standalone post-execute step (same pattern as assertions/diff). T-106 composes loader+findOperation+validate at each call site. Logged in decision-log.
  - `ajv-formats`/`ajv` CJS-under-NodeNext import interop normalized so `tsc --noEmit`, `tsc -p .` build, and runtime all agree. Logged in decision-log.
  - TDD throughout: 40 CollectionManager tests (6 new for spec CRUD), 12 ContractValidator tests (operationId/path/param/no-match lookup, status/missing-field/wrong-type/content-type/clean validation, listOperations), 5 SpecLoader tests (load+dereference, cache, reload, missing-file, get). 501 tests pass, typecheck clean, dist build + runtime import verified. No MCP/CLI (T-106) or UI (T-107) in this task.

## 2026-06-26

- [x] **T-104** .env file integration - `DotEnvLoader` (`src/engine/dotenv-loader.ts`) parses `.env`-style files via the `dotenv` package (added as a dependency), in order with later files winning on collision; missing files silently skipped; `getVariables()`/`getVariablesRecord()` for sourced/flat access; `setFiles`/`getFiles` for in-place file-list changes; `watch()` hot-reloads on file change with no restart. Resolver chain: `http-executor.ts`'s `execute()` gains an 8th `dotEnvVars` param, layered as `[collectionVars, envVars, dotEnvVars]` - lowest priority, never overrides collection or env vars. `AuthManager.getDotenvFiles`/`setDotenvFiles` persist the file list to `~/.reqly/config.json` (default `['.env']`). Server bootstrap (`index.ts`) constructs one `DotEnvLoader` per project, watches it, and the `executeRequest` closure reads `context.dotEnvLoader` (not a captured local) so `switch-project` re-pointing it to the new project dir actually takes effect. CLI: repeatable `--env-file <path>` flag overrides the persisted list for that session only (`run`, `run-flow`, and `start` all wired). MCP tools `set_dotenv_files` / `get_dotenv_files` (values omitted from `get_dotenv_files` for security). `get_variables` now tags every entry with `source` and appends dotenv keys. Express routes `GET`/`PUT /api/dotenv`. UI: Settings panel gets an "Environment files" section (ordered list, up/down reorder, add/remove, Save); `RequestEditor`'s Variables tab and autocomplete now include dotenv keys tagged with their filename as source, value shown as "hidden" (never rendered, matching the API's security stance).
  - Found and fixed a real bug while wiring switch-project: the `executeRequest` wrapper closure captured the dotEnvLoader local by value, so after a project switch it kept reading the OLD project's dotenv vars. Fixed by reading `context.dotEnvLoader` inside the closure; added a regression test.
  - Deviated from the spec's literal "relative to `CollectionManager.getBaseDir()`" - that resolves to `.reqly/`, not the project root where `.env` actually lives. Used the project root instead (matches the roadmap's own wording). Logged in decision-log.
  - "Drag-to-reorder" in the Settings panel implemented as up/down arrow buttons (no DnD library in the project) - logged in decision-log.
  - TDD throughout the engine/MCP layer (DotEnvLoader, AuthManager additions, cli-parser flag, http-executor 8th param, get_variables, set/get_dotenv_files contract tests, switch-project re-pointing regression). 478 tests pass, typecheck clean, full root build clean.
  - UI changes are typecheck-clean and follow established patterns (SettingsPanel mirrors other modal sections, Variables tab mirrors the existing collection/env rows) but were **not visually verified in a browser this session** - the Chrome extension was unreachable when attempted. Flagging this honestly rather than claiming verification that didn't happen.

- [x] **T-103** Mock server - UI - Added a "Mock" tab to `CapturePanel` alongside Outbound/Webhooks. Stopped state: collection picker (populated from `/api/collections`), port input (default 4243), Start button. Running state: green status dot + "Running on :PORT", collection name, read-only route table with method badge / path / example count per row. Clicking a route row navigates to the Collections panel so the user can add/edit examples. Polls `GET /api/mock/status` every 3s while the tab is visible. `CapturePanel` gains optional `onOpenCollection` prop; `App.tsx` wires it to `setActivePanel('collections')`. Build clean, 457 tests pass. Completes the Mock Server milestone (T-101 through T-103).

 - `reqly mock <collection> [--port <n>]` CLI sub-command in `src/server/mock-command.ts`: starts MockServer, prints a route table (method, path, example count), blocks until Ctrl+C, stops gracefully on SIGINT/SIGTERM. `cli-parser.ts` extended: `mock` added to `validCommands`/`ParsedArgs.command`, first positional after `mock`/`run`/`run-flow` captured as `result.collection`. Three MCP tools: `start_mock` (requires `collection`, optional `port` default 4243; returns `{ port, routes[] }`), `stop_mock` (no args), `get_mock_status` (returns full `MockStatus`). Express routes on port 4242: `POST /api/mock/start`, `POST /api/mock/stop`, `GET /api/mock/status`. `MockServer` added to `EngineContext` and wired in `src/server/index.ts` (instantiated alongside proxyServer, stopped on shutdown). TDD: 18 MCP tool contract tests written first (red), then green. README and llms.txt updated with `reqly mock` usage, X-Reqly-Example pattern, and MCP tool list. 457 tests pass.

 - `MockPathResolver` in `src/engine/mock-path-resolver.ts`: infers Express-style route paths from request URLs - strips protocol + host, converts `{{varName}}` segments to `:varName` params. If `mockPath` is explicitly set on the request, returns it as-is. `MockServer` class in `src/engine/mock-server.ts`: `start(collection, port)` loads the collection, builds a route table (one route per request that has at least one saved example), and starts an Express instance. Route handler checks `X-Reqly-Example` header to pick a named example; falls back to the first example. CORS headers (`Access-Control-Allow-Origin: *`) added to every response so browser apps can call the mock directly. 404 handler returns `{ error, availableRoutes[] }`. `stop()` / `getStatus()` complete the interface. `mockPath?: string` added to `RequestConfig` in `src/types/collection.ts`. TDD: path inference, mockPath override, route table building, example selection, CORS header presence, 404 shape all tested first (red), then green. 439 tests pass.

- [x] **T-100** Flows - UI - pixel-matched `docs/tasks/T-100-flows-ui-reference.html`. New nav rail icon (`GitBranch`, lucide - not the reference's Tabler webfont, to keep the single-icon-library decision) between GraphQL and Capture. `FlowsPanel.tsx` (sidebar, flat flow list, +New inline create, right-click delete, pass/fail badge from the last run). `FlowWorkspace.tsx` (main: top bar with Data/Settings/Run flow buttons, steps panel, data rows panel, results bar). `FlowStepCard.tsx` (status circle, type badge pill, expandable body with per-type fields and a response snippet). `FlowSettingsModal.tsx` (name, description, data rows via stacked `KeyValueEditor` instances - one per row, "+ Add row"). Extracted `AssertionEditor.tsx` out of `RequestEditor.tsx`'s inline assertions block so both the request editor and the flow assert-step picker share one implementation. Added the reference's semantic CSS vars (`--bg-success`, `--text-danger`, etc.) and `.flow-badge`/`.badge-pass`/`.badge-fail`/`.dot-pass`/`.dot-fail`/`.dot-pending` to `index.css`.
  - Found and fixed a real bug while wiring this up: `CollectionManager.listCollections()` was listing `.reqly/flows/` as a fake collection (since both collections and flows live under the same base dir) - added a `RESERVED_DIRS` exclusion, TDD (1 test, red then green).
  - Found and fixed a gap in `FlowRunner`: assert-step failures only recorded `passed: false` with no detail, so the UI couldn't show "received" values. `execAssert` now returns the failing assertion's message as `StepResult.error`, TDD (1 test, red then green).
  - Added `FlowManager.updateFlowMeta` (rename + description) and two Express routes not in T-098's original list - `PUT /api/flows/:name/meta` and `PUT /api/flows/:name/data` - needed for the Settings modal to actually persist; TDD (3 engine tests, red then green).
  - Manually verified end to end in a sandboxed browser session: flow CRUD, run (pass and fail states matching the reference exactly), step expand/collapse with real response data, add-step picker for all 5 types (tested poll concretely), Settings modal data-row editing and persistence, data panel + "row N of M". One real build gotcha caught along the way: root `npm run build` copies `src/ui/dist` into `dist/ui` (which is what Express actually serves) - a server-only `tsc` build left a stale UI bundle being served until the full build ran.
  - 423 tests pass, typecheck clean. This completes the Test Flows milestone (T-095 through T-100).

- [x] **T-099** Flows - CLI runner - `reqly run-flow <name>` in `src/server/run-flow-command.ts`. Loads the flow via `FlowManager`, runs it with `FlowRunner`, supports `pretty`/`json`/`tap` reporters extended for `FlowRunResult`'s shape (per-step results, and data-row iterations printed as "Row N: {data}" groups in pretty/grouped flat in tap). `--data-row '<json>'` flag injects a single ad-hoc row override (bypasses `flow.data` iteration). Exit code 0 if every step passes, 1 otherwise (or on a parse/lookup error). `cli-parser.ts`: added `run-flow` to `validCommands`/`ParsedArgs.command` and a `--data-row` flag, TDD (2 new tests, red then green). Manually smoke-tested all three reporters, missing-flow error+exit-1, plain run, and both data-driven iteration and `--data-row` override against a sandboxed project - all correct. Updated `README.md` (CLI Runner section) and `llms.txt` (MCP tools list, Reqly Features, UI and CLI section) with `reqly run-flow` usage. 419 tests pass, typecheck clean.

- [x] **T-098** Flows - MCP tools + Express routes - 8 MCP tools with full UI parity: `create_flow`, `get_flow`, `list_flows`, `delete_flow`, `add_flow_step`, `update_flow_step`, `delete_flow_step`, `run_flow` (one file per tool in `src/mcp/tools/`, registered in `src/mcp/server.ts`). `add_flow_step`/`update_flow_step` share a `flowStepSchema` fragment describing the full `FlowStep` union shape. `run_flow` accepts `name` + optional `dataRow`, constructs a `FlowRunner` and returns the `FlowRunResult` JSON. Express routes: `GET/POST /api/flows`, `GET/DELETE /api/flows/:name`, `POST /api/flows/:name/steps`, `PUT/DELETE /api/flows/:name/steps/:stepId`, `POST /api/flows/:name/run`. Added `flowManager: FlowManager` to `EngineContext` (constructed alongside `collectionManager` in `src/server/index.ts` and `src/server/run-command.ts`, hot-swapped in `/api/switch-project` alongside the other managers). TDD: 24 MCP tool contract tests written first (red), then green. Manually smoke-tested every route end to end against a sandboxed server (create collection+request, create flow, add run+assert steps, run the flow against a real HTTP call, delete a step, delete the flow) - all passed. 417 tests pass, typecheck clean.

- [x] **T-097** Flow Runner - conditional branching + poll - engine - rewrote `runSteps` from a `for-of` to an index-based loop so `goto` can jump. `conditional` step evaluates its `if` via a safe expression evaluator (NO `eval`): a single `A === B`/`A !== B` comparison or a bare truthiness/existence check; operands resolve to quoted-string/number/bool literals, `response.*` / `body.*` paths (via `readPath`), or flow-scope vars. Branch action (`then`/`else`): `skip` continues to next step, `abort` stops the flow and marks it failed, any other value is a `goto` to that stepId. Circular goto detection: each `conditionalId->target` edge may be taken once; a repeat throws "Circular goto loop detected" and aborts (bounds infinite backward loops). `poll` step fires repeatedly (no delay before first attempt, `delay` ms between) up to `maxAttempts`, evaluating `until` against the response (`pollMode` resolves bare operands against `response.body`); passes on first truthy result, fails on exhaustion. Per spec, a poll's response is committed to `responseStore`/`lastResponse`/history only on the successful attempt, so downstream `extract` sees the final body. Factored a `fireRequest` helper (load+substitute+execute, no retry/store) shared by `execRun` and `execPoll`. TDD: 7 new tests (goto forward, circular-goto abort, skip, abort, poll success, poll timeout, poll-then-extract) written first (red), then green. 393 tests pass, typecheck clean.

- [x] **T-096** Flow Runner - core execution - engine - `FlowRunner` in `src/engine/flow-runner.ts`. `run(flow, { dataRow? })` executes steps sequentially, returns `FlowRunResult` (`{ flowName, passed, steps[], dataRows?, duration }`). Flow-local scope is a `Map<string,string>` seeded with the data row, converted to a plain object and slotted as the top layer of `substituteConfig`'s `[flowLocal, collectionVars, envVars]` chain (no resolver change needed, per the T-088 design). `run` step loads request+collection, mirrors `CollectionRunner`'s auth/var resolution (`resolveCollectionAuth`, profile lookup), fires via `context.executeRequest`, applies `retry` (re-fire while status in `retry.on` up to `retry.times` with `delay` ms; exhausted retries fail the step). `extract` reads a `response.body.*`/`response.status`/`response.headers.*` path via the existing `extractBodyValue` and writes to flow scope, or to the active env when `into` is prefixed `env.` (`environmentManager.updateVariable`). `assert` reuses `runAssertions`. Data-driven: when `flow.data` present and no `dataRow` override, the step sequence runs once per row, aggregated into `dataRows` (top-level `steps` is `[]` in that case); a `dataRow` override runs once and skips iteration. `conditional`/`poll` intentionally throw "not supported in the core runner" - they land in T-097. New types in `src/types/flow.ts`: `StepResult`, `RowResult`, `FlowRunResult`. TDD: 9 tests written first (confirmed red), then green. 386 tests pass, typecheck clean.

- [x] **T-095** Flow types + FlowManager - engine - new `src/types/flow.ts`: `FlowConfig` (name, description?, data?, steps[]), `FlowStep` union of `RunStep | ExtractStep | AssertStep | PollStep | ConditionalStep`, `StepType`. `FlowManager` in `src/engine/flow-manager.ts` stores each flow as `.reqly/flows/<name>.yaml` (mirrors `CollectionManager`'s YAML-folder pattern). CRUD: `createFlow`, `getFlow`, `listFlows`, `deleteFlow`, `addFlowStep`, `updateFlowStep`, `deleteFlowStep`, plus `setFlowData` for the data-row table. TDD: 13 tests written first against the not-yet-existing module (confirmed red), then implemented to green. No runner, no MCP tools, no UI in this task - those are T-096 through T-100. 377 tests pass, typecheck clean.

- [x] **T-094** Fix codegen not resolving variables (ad-hoc) - `/api/codegen` route now runs `substituteConfig` (same as `/api/run`) before generating curl/fetch/axios code. Variables from active env and collection vars are resolved so generated snippets contain real values, not `{{placeholder}}` strings. 364 tests pass.

 - The `VariableInput` autocomplete dropdown now shows the source of each variable (e.g. collection name, active env name) as a badge on the right side of each suggestion row. `VariableInput.variables` prop changed from `string[]` to `VariableItem[]` (`{ name: string; source: string }`). `availableVariables` in `RequestEditor` now builds `VariableItem[]` with collection vars tagged with the collection name and env vars tagged with the active env name (deduped: collection wins). `KeyValueEditor` updated to pass `VariableItem[]` through. Build clean, 364 tests pass.

- [x] **T-092** Example responses in sidebar (ad-hoc) - Saved examples now appear as collapsible sub-items under their parent request in the Collections panel. Each request with examples shows a chevron toggle; expanding it reveals example rows with: `BookMarked` icon (purple), name, status code (color-coded green/yellow/red), and an inline `Trash2` delete button (visible on hover). Right-click on an example opens a context menu with Delete. Clicking an example opens the parent request tab and injects the saved response directly into the response viewer so the user sees the full body/headers/status. `CollectionManager.deleteExample` + `DELETE /api/collections/:col/requests/:req/examples/:exampleId` Express route + `deleteExample` API helper added. `handleSelectRequestFromSidebar` in `App.tsx` handles `_isExample` marker by opening/focusing the parent request tab and setting `tab.response = exampleResponse`. Build clean, 364 tests pass.

 - UI (M4) - Added Auth tab to `CollectionSettingsModal` alongside Variables: profile picker (reuses saved auth profiles), type selector (None/Bearer/API Key/Basic/OAuth 2.0), inline credential fields per type, load on mount from `GET /api/collections/:name/auth`, Save calls `setCollectionAuth` or `deleteCollectionAuth` when type:none with no profile. Extended the Inherited headers panel in `RequestEditor` to apply the full auth precedence chain in the UI: request-level auth wins, explicit request type:none shows "opted out" empty state with a distinct message, otherwise falls back to collection auth with `source = "collection"` shown in purple to distinguish it from request-level sources. `getCollectionAuth` loaded alongside collection variables on mount and on `reqly-reload`. Added 3 API helpers to `src/ui/src/api.ts` (getCollectionAuth, setCollectionAuth, deleteCollectionAuth). Build clean, 364 tests pass. Marks the collection-level variables+auth milestone (T-088 through T-091) complete.

 - engine + MCP (M4) - `CollectionAuth` type + `CollectionMeta.auth` field added to `src/types/collection.ts`. `CollectionManager` gains `getCollectionAuth`/`setCollectionAuth`/`deleteCollectionAuth` backed by the existing `collection.yaml` metadata file. `resolveCollectionAuth` helper in `src/engine/collection-auth.ts` resolves a `CollectionAuth` config into a concrete `AuthProfile` the executor can inject: profileId lookup with inline-credential fallback, returns undefined for type:none. `http-executor.execute` accepts `collectionAuth?: AuthProfile` and applies it as the lowest-precedence auth fallback (request type:none suppresses it entirely, request-level auth wins, collection auth fills the gap). `run_request` MCP tool + `CollectionRunner` thread collection auth through to the executor. New MCP tools `get_collection_auth`/`set_collection_auth`/`delete_collection_auth` registered in server.ts. Express routes `GET/PUT/DELETE /api/collections/:name/auth`. 18 new tests (engine helper + tool contracts) + 5 http-executor precedence tests already written. 364 tests pass.


- [x] **T-089** Collection-level variables - UI (M4) - New `CollectionSettingsModal.tsx` (Variables tab now, designed for T-091's Auth tab to slot in alongside), opened via "Settings" in the collection right-click context menu (`CollectionsPanel.tsx`), backed by a local draft + explicit Save button (mirrors `EnvironmentsPanel`'s pattern, not per-keystroke API calls). The request editor's "Variables" tab now shows a 3-column table (Key/Value/Source) merging collection vars (source = collection name, shown first since they win on collision) and active env vars, and the URL/header/body autocomplete (`availableVariables`) includes collection var keys. Added `getCollectionVariables`/`setCollectionVariable`/`deleteCollectionVariable` to `src/ui/src/api.ts` (T-088 added the backend routes but no frontend helpers). **Found and fixed a real gap while testing manually:** `POST /api/run/adhoc` (the route the UI's Send button actually calls) never threaded collection variables at all - it was missed in T-088 because that task's scope was `run_request`/`CollectionRunner`, not the UI-facing adhoc route. Fixed with a new regression test (`src/server/run-adhoc.test.ts`). Verified end-to-end in a real browser against a sandboxed test server: created a collection, set a variable via the new modal, saved a request using `{{baseUrl}}`, confirmed the Variables tab displays it correctly, and confirmed firing the request actually resolves the placeholder (verified via httpbin echo, then with a real endpoint). 335 tests pass.

- [x] **T-088** Collection-level variables - engine + MCP (M4) - Collection metadata now lives in a reserved `collection.yaml` file inside each collection folder (`CollectionManager` skips it when reading requests, and `addRequest` rejects a request literally named "collection" to protect the metadata file). New `CollectionManager` methods: `getCollectionVariables`/`setCollectionVariable`/`deleteCollectionVariable`; `getCollection` now surfaces `variables` on the returned `Collection`. Rewrote the variable resolver as a layered scope chain - `resolveVariables(template, layers: Record<string,string>[], responseStore?)` where the first layer to define a plain var wins, while dotted `{{x.response.y}}` chaining resolves separately via the ResponseStore so the two coexist. `substitute`/`substituteConfig` now accept either a single vars object (back-compat) or a layer array. `http-executor.execute` takes an optional `collectionVars` param and builds `[collectionVars, envVars]` so collection vars win over env vars on collision; threaded through `EngineContext.executeRequest`, the index.ts wrapper, MCP `run_request`, and `CollectionRunner` (run_collection). New MCP tools `get_collection_variables`/`set_collection_variable`/`delete_collection_variable` (distinct from the env-scoped `get_variables`/`set_variable`/`delete_variable`). Express routes `GET/PUT/DELETE /api/collections/:name/variables[/:key]`. TDD throughout: 6 resolver tests, 8 CollectionManager tests, 3 http-executor precedence tests, 8 MCP tool-contract tests. 333 tests pass. UI deferred to T-089.

- [x] **T-087** Homebrew tap for `brew install reqly` (M4) - Created public repo `RutvikPansare/homebrew-reqly` with `Formula/reqly.rb`. Fixed two stale assumptions from the task spec: the formula's `url`/`homepage` had to use the real published scoped package name (`getreqly`, not unscoped `reqly`), and `license` had to be `ISC` (matching `package.json`, not the spec's `MIT` placeholder). Also fixed stale `repository`/`homepage`/`bugs` URLs in root `package.json` (pointed at the old `AgentMan` repo name instead of `Reqly`). Tested locally via `brew tap-new` + a local tap before touching anything public, then verified end-to-end against the real pushed repo: `brew tap RutvikPansare/reqly && brew install reqly`, `brew test`, `reqly --version`, `reqly setup` all pass. Found that Homebrew now requires `brew trust <tap>` before installing from a third-party tap for the first time - documented this in the README alongside the install command. Updated `README.md` and `llms.txt` with the Homebrew install option; also fixed `llms.txt`'s npm install line which still referenced the unscoped package name.

- [x] **T-086** Publish Reqly to npm (M4) - Pre-publish: ran full checklist (tests, build, smoke test). Found and fixed a packaging bug - `.npmignore`'s `src/` rule wasn't excluding `src/ui/node_modules` (8516 files, 149.7MB unpacked); replaced with an explicit `files` allowlist in `package.json` (`dist`, `packages/reqly-middleware/src/*.ts`, `README.md`, `llms.txt`), fixed `main` to point at `dist/server/index.js`, moved `tsx`/`typescript`/`vitest` from `dependencies` to `devDependencies`. Tarball: 368.7kB/155 files. `packages/reqly-middleware` had no compiled output at all (`main`/`exports` pointed at raw `.ts` source, unusable by plain Node) - added `tsconfig.json` + a `build` script, repointed at `dist/`. Published: `getreqly@1.0.5` and `reqly-middleware@0.1.0` both live on npm (Rutvik ran `npm login`/`npm publish` for the OTP step). Post-publish: cold-install verified in a sandboxed npm prefix (`npm install -g getreqly` - the scoped name, not the unscoped `reqly` the original checklist text assumed), tagged `v1.0.5` on the exact published commit.

- [x] **T-085** Insomnia + OpenAPI import (M4) - Extended `src/engine/importer.ts` with `parseInsomnia` (Insomnia v4 JSON export: reads workspace name, flattens all `request` resources from folders) and `parseOpenApi` (OAS 3.0 + Swagger 2.0 JSON/YAML: extracts title, iterates paths x methods, prepends base URL from `servers[0].url` or `host+basePath`). Includes a minimal YAML parser (`parseSimpleYaml`) with no external dependencies for OAS YAML files. `ImportFormat` type updated to `'postman' | 'bruno' | 'insomnia' | 'openapi'`. `importFromFile` and `importFromContent` handle all 4 formats. MCP `import_collection` tool schema updated with `enum` on format field and improved description. Express `/api/import` accepts all 4 formats. UI `importCollection` API helper updated; file picker now accepts `.yaml`/`.yml`; JSON files are auto-detected (Insomnia vs OpenAPI vs Postman) by peeking at content. 14 new tests (294 total, 45 files, all passing).

- [x] **T-084** Collection example responses (M4) - `ExampleResponse` type added to `src/types/collection.ts` (id, name, status, headers, body, latency, savedAt). `CollectionManager.saveExample()` appends an example to a request's YAML file and returns the saved record; `CollectionManager.listExamples()` retrieves them. MCP tools `save_example` + `list_examples` registered. Express routes `POST /api/collections/:col/requests/:req/examples` + `GET`. UI: `ResponseViewer` gets a "Save Example" button in the header (prompt for name, fires the API, shows green confirmation for 3s); "Examples" tab in the tab bar (lazy-loads on first click, shows each example with status badge + latency + timestamp + syntax-highlighted body; empty state with BookMarked SVG). `request` prop added to `ResponseViewer`, passed from `App.tsx`; button and tab only shown when `_collection` + `name` are set on the active tab's request. 11 new tests (280 total, 45 test files, all passing).

 (M4) - New "Inherited" tab in the request editor between Auth and Assertions. Client-side computed read-only table showing which headers `http-executor.ts` will inject before firing. Mirrors executor logic exactly: Bearer (`Authorization: Bearer ****`), Basic (`Authorization: Basic ****` + username note), API Key (header or query param note), OAuth2 (`Authorization: Bearer ****` + expiry/expired status). Values are partially masked (last 4 chars visible). Source column shows "profile" or "inline". Empty state shows a lock SVG + "No auth configured" message. No engine changes needed; no new tests (pure UI component).

 (M4) - `importEnvironmentFromPostman(json, nameOverride?)` and `exportEnvironmentToPostman(name)` on `EnvironmentManager`; handles Postman format (values array, enabled flag, skips disabled vars); upserts on import (creates or replaces). MCP tools `import_environment` + `export_environment` registered. Express routes `POST /api/environments/import` + `GET /api/environments/:name/export` (sets Content-Disposition for browser download). UI env switcher dropdown: hover-reveal download icon on each env row, "Import Postman environment" button with hidden file input. `api.ts`: `exportEnvironment()` (Blob download) + `importEnvironmentFromJson()`. 12 new tests (15 engine + 5 MCP tool); 269 total passing (43 test files).

 OAuth 2.0 PKCE Flow (M4) - `AuthType.OAUTH2` added to `src/types/auth.ts`. `AuthManager` gains `updateProfile()` and `refreshOAuth2Token(profileId, fetchFn?)` - POSTs `grant_type: refresh_token` to tokenUrl, persists new `accessToken`/`refreshToken`/`expiresAt` back to `~/.reqly/config.json`. `http-executor.ts` injects `Authorization: Bearer <accessToken>` for OAuth2 profiles. Server: `POST /api/auth-profiles/:id/refresh` (manual refresh), `POST /api/auth-profiles/:id/authorize` (PKCE flow: generates code_verifier/challenge, opens system browser, starts temporary local HTTP callback server, exchanges code for tokens, persists). Auto-refresh wired into `POST /api/run/adhoc`: if OAuth2 profile has a refreshToken and token is expired or within 60s of expiry, it auto-refreshes before execute. UI: auth tab gains "OAuth 2.0" type button; OAuth2 form has clientId, clientSecret, authUrl, tokenUrl, redirectUri, scope fields; when a profile is selected it shows token status (valid/expired), "Authorize" button (opens browser flow + polls for token update) and "Refresh Token" button; status messages shown inline. 8 new engine tests (257 total, all passing).

- [x] **T-078** Pre/Post-run Scripts (M4) - New `src/engine/script-runner.ts` using Node's built-in `vm.runInNewContext` with a 2s timeout. `runScript(script, context)` exposes `env` (read/write - mutations reflect back to caller), `request`, and optionally `response` to the script; errors and syntax failures are caught and logged without crashing the request. `RequestConfig` extended with `preScript?: string` and `postScript?: string`; the HTTP executor runs preScript after resolving vars (before substitution) and postScript after building the response. Scripts stored transparently in collection YAML via existing `addRequest`/`getRequest`. `create_request` MCP tool schema updated with `preScript`/`postScript` fields. UI `RequestEditor` gains "Pre-script" and "Post-script" tabs with monospace `<textarea>`, contextual help text, and usage examples. 10 new tests - all 201 tests pass.
- [x] **T-076** GraphQL - persist to YAML + run_request support (M4) - `RequestConfig` extended with `type?: 'rest' | 'graphql'` and `graphql?: { query, variables? }`. `http-executor.ts` auto-builds the JSON body `{ query, variables }` and sets `Content-Type: application/json` when `type === 'graphql'`; existing body path unchanged. `create_request` MCP tool schema updated with optional `type` and `graphql` fields. UI `GraphQLWorkspace` gains a "Save" button that toggles an inline form (collection picker + request name); saved requests carry `type: graphql` + `graphql.query` + optional `graphql.variables`. `run_request` MCP tool works transparently. 6 new tests - all 191 tests pass.
- [x] **T-075** Response Diffing (M4) - `src/engine/response-differ.ts` with `diffResponses(prev, curr): ResponseDiff` comparing status, latency delta, and body changes. JSON object bodies get top-level key diff (added +, removed -, changed ~); non-JSON falls back to set-based line diff. `HistoryEntry` extended with `body?: string` (truncated to 10 KB); `HistoryStore.getLastTwo(requestName)` returns the two most recent entries for a request. `run_request` MCP tool computes and returns `diff` when a prior run exists. `POST /api/run/adhoc` likewise returns `diff`. UI `ResponseViewer` shows a yellow "Diff" tab when changes are detected; green lines for additions, red for removals, yellow for changes. 24 new tests - all 185 tests pass.
- [x] **T-074** Import from Postman/Bruno (M4) - `src/engine/importer.ts` with `parsePostman`, `parseBruno` (brace-depth parser handles nested JSON in `body:json` blocks), `importFromFile` (CLI/MCP - file path), and `importFromContent` (UI - raw string). `import_collection` MCP tool (`src/mcp/tools/import-collection.ts`) registered in `src/mcp/server.ts`. `reqly import <file>` CLI sub-command (`src/server/import-command.ts`) auto-detects format from extension. `POST /api/import` Express route. UI `CollectionsPanel` gains an Upload icon button that opens a file picker (`<input type="file" accept=".json,.bru">`), reads the file with `FileReader`, posts to `/api/import`, and reloads the sidebar on success. 30 new tests across engine and MCP tool - all 166 tests pass.

## 2026-06-24

- [x] **T-073** Webhook Testing (M4) - `localtunnel` integration with `TunnelManager` tracking the active proxy. Added endpoints `POST /api/tunnel/start` and `/stop` to expose `localhost:4242` publicly (`xxxx.loca.lt`). `ALL /webhooks/*` catcher endpoint intercepts incoming external requests (like Stripe webhooks) and automatically saves them as timestamped entries in the "Webhooks" collection. `CapturePanel` UI updated to feature a tabbed interface ("Outbound" and "Webhooks") offering immediate copy-paste public webhook URLs for external service configs.
- [x] **T-072** Variable Autocomplete in UI inputs - A generic `<VariableInput>` component replaces text inputs and textareas in `RequestEditor` and `KeyValueEditor`, providing a `{{` triggered autocomplete dropdown that filters available environment variables.
- [x] **T-071** Fix "Save" for new requests - "Save to collection" picker replaced the alert with a small modal, handles default request names, and updates tab.id seamlessly upon saving to avoid duplicates on sidebar clicks.
- [x] **T-070** Middleware SDK shipped in three parts. (1) `packages/reqly-middleware/` - new npm package exporting `reqlyMiddleware()` (Express), `reqlyMiddlewareHook()` (Fastify), and `reqlyNextMiddleware()` (Next.js, `reqly-middleware/next`); fires non-blocking `POST {endpoint}/inbound` with `{method, url, headers, body, collection, timestamp}`, swallows all fetch errors, filters `ignoreRoutes`. Backend: `POST /capture/inbound` added to `src/server/express.ts`, dedupes by method+url and saves into the named collection via `CollectionManager` (same shape as proxy captures). Root `package.json` gained `"workspaces": ["packages/*"]`; root `vitest.config.ts` include extended to `packages/**/*.test.ts`. (2) `install_middleware` MCP tool (`src/mcp/tools/install-middleware.ts`) - reads the project's `package.json` deps (via new `CollectionManager.getBaseDir()`), detects Next/Fastify/Express, returns `{framework, installCommand, snippet, file, note}`; registered in `src/mcp/server.ts`. (3) MCP server top-level `description` (read by every agent at connect, before any tool call) now lists all Reqly capabilities and proactive-suggestion rules; `reqly://workflow` resource rewritten to combine a REQLY FEATURES list with PRIMARY/SECONDARY/TERTIARY workflows and proactive-suggestion triggers; README and llms.txt updated with the inbound-middleware install steps and tool tables.
- [x] **T-069** Rewrote `description` on every MCP tool definition (`src/mcp/tools/*.ts`) to state what the tool does, a "When to use" line, and a "Preferred pattern" line where relevant - so agents read the correct workflow at connect time instead of guessing (most default to traffic capture first). Added a new `reqly://workflow` resource (`src/mcp/server.ts`) returning a plain-text guide ranking codebase-read as PRIMARY and proxy capture as SECONDARY. New test `src/mcp/server.test.ts` asserts the resource is registered and returns the guide text.
- [x] **T-067** `reqly exec <command>` CLI sub-command (`src/server/exec-command.ts`) and `exec_with_proxy` MCP tool (`src/mcp/tools/exec-with-proxy.ts`) - both start the auto-capture proxy and run the dev command with `HTTP_PROXY`/`HTTPS_PROXY` injected, eliminating the manual env-var step. CLI version runs in the foreground (`stdio: 'inherit'`, forwards SIGINT, stops proxy + prints capture summary on exit). MCP version spawns detached (logs to `~/.reqly/exec.log`), always tries to spawn itself first and only returns a `fallbackCommand` if spawning fails. `stop_proxy` now also kills the tracked exec child (process-group kill via negative pid, falls back to direct pid). Deviation from spec: the child pid is tracked in-memory on `EngineContext.execChildPid` rather than written into the shared `~/.reqly/running.json` lock file - the lock file is the *single* Express-owning process, but `exec_with_proxy` can run from an MCP-only stdio session too (T-066), so writing the child pid into the shared lock would corrupt the owning instance's state for an unrelated session. Also added `vitest.config.ts` `fileParallelism: false` - lock/switch-project/stop-command tests all read/write the real `~/.reqly/running.json` and raced under parallel file execution.
- [x] **T-068 (part 1)** README.md and llms.txt now headline the AI-writes-collection workflow ("Read my Express routes and build a Reqly collection for every endpoint") right after Quick Setup/Install, ahead of the proxy/capture flow. Also synced both docs' MCP tool tables with `create_environment`, `set_variable`, `get_variables`, `delete_variable`, `get_response_full` (previously undocumented). Middleware SDK section remains queued in todo.md, blocked on M5.
- [x] **T-066** Single-instance enforcement with live project switching - `src/server/lock.ts` (lock file at `~/.reqly/running.json`: pid/projectDir/port/startedAt), `POST /api/switch-project` hot-swaps `context.collectionManager`/`environmentManager` on the running instance, `POST /api/shutdown` for graceful remote stop, startup detect-and-delegate logic in `src/server/index.ts` (switches the running instance then starts its own MCP-only stdio server instead of exiting or fighting for port 4242), stale-lock cleanup via `isProcessAlive`, new `reqly stop` CLI command (`src/server/stop-command.ts`)
- [x] **T-065** `reqly use <path>` + `reqly status` commands - `activeProject` field in `~/.reqly/config.json` as final fallback in the project-dir resolution chain (flag > env var > config > cwd), for hosts like Claude Desktop with no per-project launch context
- [x] **T-064** Add `REQLY_PROJECT_DIR` env var fallback for project root resolution (fixes ENOENT when MCP host launches reqly with wrong cwd)
- [x] **T-062** Response truncation for large payloads (MCP + engine)
- [x] **T-063** MCP tools for environment and variable management
- [x] **T-061** AI-readable README and llms.txt
- [x] **T-060** `reqly setup` - one-command MCP configuration
- [x] **T-059** npm package publishing setup
- [x] **T-058** CI-friendly output reporters
- [x] **T-057** `reqly run` - CLI collection runner with output and exit codes
- [x] **T-056** CLI sub-command routing
- [x] **T-055** UI icon and styling refresh - Lucide React throughout, pill method badges, nav rail active chip
- [x] **T-054** Widen search bar in top bar, reposition left-of-center
- [x] **T-053** Move GraphQL to dedicated nav rail section (full workspace)
- [x] **T-052** Remove prompt bar and strip BYOK from settings
- [x] **T-051** GraphQL IDE Autocomplete (CodeMirror + cm6-graphql)
- [x] **T-050** Fix URL input field flickering by updating React useEffect dependencies
- [x] **T-049** UI state persistence across page refreshes (M4 UI)
- [x] **T-048** Visual polish pass - match Hoppscotch aesthetic (M4 UI)
- [x] **T-047** GraphQL mode in request editor (M4 UI)
- [x] **T-046** Variables tab in request editor (M4 UI)
- [x] **T-045** Request tabs - polish and closeable (M4 UI)
- [x] **T-044** Search / command palette (M4 UI)
- [x] **T-049** Fix and update Anthropic API key in settings
- [x] **T-043** Request history panel + backend (M4 UI)
- [x] **T-042** Collection manager UI - full CRUD from sidebar (M4 UI)
- [x] **T-041** Environment editor - full CRUD in UI (M4 UI)
- [x] **T-040** Left icon navigation rail (M4 UI)
- [x] **T-034** Add graceful shutdown handlers for Express and proxy servers

## 2026-06-23

- [x] **T-033** Add multiple tabs feature to the UI
- [x] **T-032** Fix server hang by cleaning up dangling Node processes on port 4242
- [x] **T-031** Fix CLI collection path and UI static asset resolution
- [x] **T-025** Request Chaining - response context store
- [x] **T-024** UI: Collection Runner panel
- [x] **T-023** UI: Assertions editor
- [x] **T-022** UI: Proxy capture panel
- [x] **T-021** Collection Runner (`src/engine/collection-runner.ts`)
- [x] **T-020** Auto-Capture Proxy (`src/engine/proxy.ts`)
- [x] **T-019** Test Assertions engine (`src/engine/assertion-runner.ts`)
- [x] **T-018** Prompt Bar Component
- [x] **T-017** Settings Panel Component
- [x] **T-016** Environment Switcher Component
- [x] **T-015** Response Viewer Component
- [x] **T-014** Request Editor Component
- [x] **T-013** Sidebar Component
- [x] **T-012** Express Server & UI Serving (`src/server/express.ts`)
- [x] **T-011** Setup UI Project Scaffold (React + Tailwind CSS) (`src/ui/`)
- [x] **T-010** CLI entry point (`src/server/index.ts`)
- [x] **T-009** MCP Server (`src/mcp/server.ts` + `src/mcp/tools/`)
- [x] **T-008** Auth Manager (`src/engine/auth-manager.ts`)
- [x] **T-007** Environment Manager (`src/engine/environment-manager.ts`)
- [x] **T-006** Collection Manager (`src/engine/collection-manager.ts`)
- [x] **T-005** Variable Substitutor (`src/engine/variable-substitutor.ts`)
- [x] **T-004** HTTP Executor (`src/engine/http-executor.ts`)
- [x] **T-003** Shared TypeScript types (`src/types/`)
- [x] **T-002** Project scaffold
- [x] **T-001** Rename: AgentMan -> Reqly (all doc references updated)
- [x] **T-000** Initial project setup and roadmap definition.

### 2026-06-23

- [x] **T-026** Sidebar - functional collection tree
- [x] **T-027** Top bar - environment switcher + settings icon
- [x] **T-028** Auth tab - complete editor
- [x] **T-029** Response Viewer - complete implementation
- [x] **T-030** Prompt bar - wire up and make visible
- [x] **T-135** Fix terminal collapse when loading TUI applications (like `agy`) inside the Reqly app's embedded terminal panel. We added an xterm.js parser handler in `TerminalPanel.tsx` to explicitly intercept and ignore alternate screen buffer escape sequences (`\x1b[?1049h`, `\x1b[?1047h`, `\x1b[?47h`, etc.). This forces TUI apps to render inline in the main buffer, completely preventing the visual wipe on load and page refresh.
- [x] **T-136** Center the Response Viewer panel by default on load. Changed `autoSplit={tab.response ? 50 : 75}` to `defaultSplit={50}` in `App.tsx` so the request and response sections are evenly split (50/50) vertically when opening a new tab, rather than squeezing the response to the bottom 25%.
- [x] **T-137** Fix response tab persisting on reload and correct SplitPane styling to center empty state vertically. Ensured panel-header height is strictly 34px to prevent visual jumps when responses arrive.
- [x] **T-138** Allow explicit dismissal of EmptyStateNudge via an X button (saves to localStorage) and fix sidebar empty state hint text wrapping.
- [x] **T-139** Added 'Tests' tab to ResponseViewer to display assertion results for individual requests.
- [x] **T-140** Toggling headers and parameters persistently via checkboxes and MCP tools (using disabledParams/disabledHeaders in RequestConfig).

### 2026-06-30

- [x] **T-183** GraphQL and REST response viewer UI polish
  - Added interactive JSON tree with collapsible brackets
  - Added filter option to quickly search inside JSON payloads
  - Added inline copy button and sticky headers for JSON sections
  - Fixed GraphQL workspace layout so scroll behaviour is properly isolated
  - Fixed 'Save Example' bug for GraphQL workspace by correctly tracking active request state
  - Replaced POST badge with GQL badge in the collections panel for GraphQL requests
- [x] **T-183** Electron title bar styling & response code font weight adjustments
  - Updated `packages/desktop/src/main.ts` with `titleBarStyle: hiddenInset`
  - Made `App.tsx` header draggable in Electron and added padding for traffic lights
  - Removed `font-bold` from `ResponseViewer` and `GraphQLResponseViewer` to match latency styling

### 2026-07-02

- [x] **T-204** Validate duplicate collection names across all workspaces when creating a new collection
- [x] **T-205** Live sync collection deletions from filesystem to UI via `fs.watch` and SSE
- [x] **T-206** UI tweaks: Flush black background for vent/messages bars, blue VS Code style drag handle for SplitPane
- [x] **T-207** Draggable NavRail icons with state persistence in `localStorage`
- [x] **T-208** Fix variable autocomplete dropdown clipping using React portal (`useVarCompletion`)
- [x] **T-209** Expand global variable auto-detection (`{{`) to GraphQL CodeMirrors, gRPC inputs/CodeMirrors, and Realtime URL/Event/Topic inputs
- [x] **T-210** Reduce padding and font size for gRPC Proto File section

- [x] **T-252** (UI Polish) Lock icon + improved tooltip on agent-locked project widget
  - Replaced the "change" span with a lock icon when an agent is active.
  - Implemented a custom tooltip for locked projects providing clear information.
  - Updated button cursors to accurately reflect locked status.
