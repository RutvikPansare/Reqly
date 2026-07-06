# End-to-end regression suite (T-243)

Two complementary layers verify the full Reqly surface. Run them after feature work is complete or whenever a regression is suspected. Both suites must be green before T-227 (cross-repo flows) begins.

| Command | What it runs |
|---------|--------------|
| `npm run test:e2e:mcp` | Layer 1: MCP tool regression (`mcp-regression.ts`) |
| `npm run test:e2e:ui` | Layer 2: Playwright UI regression (`ui-regression.spec.ts`) |
| `npm run test:e2e` | Both layers sequentially |

Both layers need network access: `httpbin.org`, `countries.trevorblades.com`, `grpcb.in:9000`, and `echo.websocket.org`.

## How it works

- `fixture-project/` is a committed, read-only Reqly project (`.reqly/` with collections, environments, a flow, saved mock examples, a GraphQL schema cache, plus `openapi.json` for contract validation). **Never run a server against it directly.**
- `helpers/fixture.ts` copies the fixture into a temp dir and fabricates an isolated `$HOME` per run, so suites mutate their copy freely and workspace tools never touch your real `~/.reqly`.
- Each layer boots a real server (`src/server/index.ts start --project-dir <copy>`) via tsx - the same process serves MCP over stdio and the UI over HTTP.

## Layer 1: MCP regression

`mcp-regression.ts` connects as a real MCP client over stdio and exercises every tool in the T-243 list (`list_collections`, `create_request`, `run_request`, `get_response`, `set_environment`, `get_variables`, `run_collection`, `run_flow`, `introspect_graphql`, `list_grpc_services`, `run_realtime`, `start_mock`/`stop_mock`, `export_collection`, `generate_code`, `set_collection_spec`/`validate_response`, and the workspace model tools). Each call is a named assertion; output is a pass/fail table; the process exits 1 on any failure.

Debug server-side logs with `REQLY_E2E_DEBUG=1 npm run test:e2e:mcp`.

## Layer 2: Playwright UI regression

`ui-regression.spec.ts` covers key user journeys (app load, fire a REST request, switch environment, GraphQL/gRPC/Realtime workspaces, history restore, request context menu, workspace switcher create/link). Journeys run serially in one worker because they share server state.

- The server runs on port **4242** by default. If your own Reqly agent already owns 4242, the suite fails fast - either `reqly stop` it or run on another port: `REQLY_E2E_UI_PORT=4321 npm run test:e2e:ui`.
- Headed mode for debugging: `npm run test:e2e:ui -- --headed`.
- Screenshots of failures land in `tests/e2e/screenshots/` (gitignored), together with an `error-context.md` accessibility snapshot per failure.
- One-time setup: `npx playwright install chromium`.

## Adding assertions when a new feature ships

1. **New MCP tool or new return field:** add a `check(...)` block to `mcp-regression.ts` calling the tool and asserting its response shape. If it needs saved state, extend `fixture-project/.reqly/` (keep it deterministic - no generated ids, fixed timestamps).
2. **New UI surface or journey:** add a `test(...)` to `ui-regression.spec.ts`. Prefer role/label/text selectors. Note that variable-aware fields (URL bars, gRPC config) render as styled text, not `<input>` elements - assert on visible text.
3. Keep both suites green; they are the regression baseline for the whole app surface.

## Known deviations from the original task spec

- The request context menu shows Rename / Duplicate / Move to... / Delete (no "Run" item in the current UI) - the test asserts what the UI actually ships.
- History stores the templated URL (`{{baseUrl}}/get`), not the resolved one.
