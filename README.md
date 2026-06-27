# Reqly

Your AI agent builds and tests your APIs. Reqly is the execution engine.

Tell your agent in Cursor or Claude Code:

> "Read my Express routes and build a Reqly collection for every endpoint. Add assertions and run them."

The agent reads your codebase, calls Reqly's MCP tools to create requests, fires them, and reports results - no UI required, no manual collection writing.

Reqly runs locally as a background service with two interfaces from the same engine:
- **MCP server (stdio)** - AI agents call tools directly to fire requests, chain responses, run flows, validate contracts, and serve mocks. Zero UI, zero LLM cost on our side.
- **Localhost web UI** - open `localhost:4242` to browse collections, fire requests visually, and watch your agent's work in real time.

Collections are plain YAML in `.reqly/` in your repo. Git-native, human-readable, directly writable by agents.

## Why Reqly beats Postman, Insomnia, and Bruno for AI-native developers

**Collections are plain YAML in your repo.** Every other tool stores collections in a proprietary format or database (Insomnia uses NeDB binary files, Postman locks them behind a cloud account). Reqly's `.reqly/` folder travels with your code via git - readable, diffable, committable. AI agents can read and write collection files directly without any tool calls.

**Reqly is an MCP server, not an MCP client.** Insomnia recently added an MCP client so it can call external tools. Reqly goes further: it *is* the MCP server. Your AI agent in Cursor or Claude Code connects once and gets a full set of tools to fire requests, chain responses, run collections, and verify assertions - no UI required, no extra configuration.

**Auto-capture, zero manual work.** Reqly can capture outbound traffic from your dev server via a proxy (`reqly exec npm run dev`), inbound traffic via a one-line middleware, and inbound webhooks via a public tunnel - then save everything into collections automatically. No other tool does all three.

**BYOK, no cloud dependency.** There is no Reqly cloud. Collections stay in your repo. Secrets stay in `~/.reqly/config.json` on your machine. The prompt bar in the UI uses your own API key. Nothing is sent to Reqly's servers.

## What an agent session looks like

```
1. "Read my routes and build a collection" → agent calls create_collection + create_request for each endpoint
2. "Run the collection and check for failures" → agent calls run_collection, assertions pass/fail
3. "Write an e2e flow for the login → checkout path" → agent calls create_flow + add_flow_step, runs it
```

## Quick Setup

Run these two commands anywhere to install Reqly globally and configure your AI tool (Cursor, Claude Desktop, Claude Code, Gemini, or Codex) to use it:

```bash
npm install -g @rutvikpansare123/reqly
reqly setup
```

On macOS, you can also install via Homebrew:

```bash
brew tap RutvikPansare/reqly
brew install reqly
reqly setup
```

(Homebrew will ask you to run `brew trust RutvikPansare/reqly` the first time, since it's a third-party tap.)

## The fastest way to start

Don't capture traffic, don't write YAML by hand - just tell your agent to read your code:

```
"Read my Express routes and build a Reqly collection for every endpoint"
```

The agent reads your codebase and calls `create_collection` + `create_request` for each route it finds. No traffic capture needed - it already knows your API from the code.

## Starter collection

Want to try Reqly before pointing it at your own API? Run:

```bash
reqly init
```

This copies a working example collection (against the free [JSONPlaceholder](https://jsonplaceholder.typicode.com) API, no auth needed) into `.reqly/` in your current project - collection variables, request chaining, a postScript that extracts a response value, and a flow. It won't overwrite any collections you already have. See `example/reqly-starter/README.md` for what each request demonstrates.

## What Reqly does

Reqly is not an AI—it's an engine for your AI. When connected, your AI coding agent can securely query your local APIs, introspect GraphQL endpoints, and verify behavior without you needing to tab out to a browser. All collections are stored in `.reqly/` in your project so they are committed to Git alongside your code. Reqly also serves a local developer UI for you at `http://localhost:4242`.

## MCP Tools

Reqly exposes these tools directly to your AI agent:

**Collections and Requests**

| Tool | Description |
|------|-------------|
| `list_collections` | Lists all collections and requests in the project |
| `create_collection` | Scaffolds a new collection |
| `create_request` | Adds a request to a collection. Supports `{{variables}}`, assertions, pre/post scripts, auth, multipart bodies. |
| `run_request` | Fires a request and returns status, body, headers, latency, assertions, diff, and contract violations |
| `run_collection` | Fires all requests in a collection sequentially |
| `get_response` | Retrieves the last stored (truncated) response for a request |
| `get_response_full` | Retrieves the last untruncated response |
| `export_collection` | Exports a collection as Postman v2.1 or OpenAPI 3.0 JSON |
| `import_collection` | Imports a Postman v2.1 or Bruno collection |

**Environments and Variables**

| Tool | Description |
|------|-------------|
| `set_environment` | Changes the active environment |
| `create_environment` | Creates a named environment with variables |
| `set_variable` | Sets a variable on an environment |
| `get_variables` | Lists variables for an environment (with source tags) |
| `delete_variable` | Removes a variable from an environment |
| `get_collection_variables` | Lists per-collection variables |
| `set_collection_variable` | Sets a per-collection variable |
| `delete_collection_variable` | Deletes a per-collection variable |
| `set_dotenv_files` | Configures which `.env` files are auto-loaded |
| `get_dotenv_files` | Lists the configured dotenv files |

**Auth**

| Tool | Description |
|------|-------------|
| `get_collection_auth` | Gets the default auth config for a collection |
| `set_collection_auth` | Sets Bearer/API Key/Basic/OAuth2 auth for all requests in a collection |
| `delete_collection_auth` | Removes collection-level auth |

**OpenAPI Contract Validation**

| Tool | Description |
|------|-------------|
| `set_collection_spec` | Points a collection at an OpenAPI spec (file path or URL). Validates every response against it. |
| `get_collection_spec` | Gets the spec config and load status |
| `delete_collection_spec` | Removes the spec from a collection |
| `list_spec_operations` | Lists all operations in the loaded spec |
| `validate_response` | Re-validates the last stored response without re-firing |

**Flows**

| Tool | Description |
|------|-------------|
| `create_flow` | Creates a new flow |
| `get_flow` | Gets a flow's config and steps |
| `list_flows` | Lists all flows |
| `delete_flow` | Deletes a flow |
| `add_flow_step` | Appends a step to a flow (run/extract/assert/poll/conditional) |
| `update_flow_step` | Replaces a step in place |
| `delete_flow_step` | Removes a step |
| `run_flow` | Executes a flow and returns per-step results |
| `export_flow_ci` | Generates a GitHub Actions workflow for a flow, writes it to `.github/workflows/`, and returns the path |

**Capture and Proxy**

| Tool | Description |
|------|-------------|
| `start_proxy` | Auto-captures local outbound traffic into a collection |
| `stop_proxy` | Stops traffic interception |
| `exec_with_proxy` | Starts the proxy and runs a dev command with it injected |
| `install_middleware` | Returns the inbound-capture middleware snippet for your framework |

**Mock Server**

| Tool | Description |
|------|-------------|
| `start_mock` | Starts the mock server for a collection on a given port |
| `stop_mock` | Stops the mock server |
| `get_mock_status` | Returns mock server status and active routes |

## Recently shipped

- **Flows** - multi-step automation tests (run, extract, assert, poll, conditional) with data-driven support
- **OpenAPI contract validation** - point a collection at a spec; every response is checked automatically
- **Multipart body editor** - send `multipart/form-data` with file and text parts
- **Response diffing** - detects what changed between runs: status, latency delta, body diff
- **Mock server** - serve saved examples as a real HTTP server for frontend dev and agent testing
- **Pre/post scripts** - per-request sandboxed JS that can read/write env vars before and after the request fires
- **GraphQL workspace** - dedicated editor with schema introspection, syntax highlighting, and variable panel
- **cURL import** - paste any cURL command; fields populate instantly
- **TypeScript interface generator** - infers a typed TS interface from any JSON response body
- **.env integration** - zero-config: if `.env` exists at the project root it's loaded automatically

## Flows

Flows are ordered sequences of steps stored in `.reqly/flows/<name>.yaml`. Each step type:

- **`run`** - fire a saved request (optional retry on specific status codes)
- **`extract`** - pull a value from the last response into a flow-local variable (`response.body.id`, `response.status`, etc.)
- **`assert`** - check the last response using the same assertion schema as request-level assertions
- **`poll`** - fire repeatedly until a condition is met (`until: "response.status === 200"`)
- **`conditional`** - branch: goto a step id, `skip`, or `abort` based on a response expression

Variables extracted by `extract` steps are available in subsequent request URLs and bodies via `{{varName}}`. For data-driven runs, set `data:` rows in the flow - the step sequence runs once per row with each row's keys injected as variables.

```bash
reqly run-flow "my-flow"
reqly run-flow "my-flow" --reporter json
reqly run-flow "my-flow" --data-row '{"userId":"42"}'
```

Generate a GitHub Actions workflow that installs Reqly and runs a flow in CI:

```bash
reqly export-flow "my-flow" --format github-actions
# Written to .github/workflows/my-flow.yml
```

Add a "Start server" step before "Run flow" in the generated workflow if the flow hits a local API. Agents can do the same via the `export_flow_ci` MCP tool.

## Capture Inbound Requests (Middleware)

If your codebase is too complex or undocumented for the AI-writes-collection workflow, install `reqly-middleware` to capture every request coming **into** your app automatically:

```bash
npm install reqly-middleware
```

```ts
// Express
import { reqlyMiddleware } from 'reqly-middleware'
app.use(reqlyMiddleware())

// Next.js (middleware.ts at project root)
import { reqlyNextMiddleware } from 'reqly-middleware/next'
export default reqlyNextMiddleware()

// Fastify
import { reqlyMiddlewareHook } from 'reqly-middleware'
fastify.addHook('onRequest', reqlyMiddlewareHook())
```

Restart your dev server and Reqly starts capturing inbound requests into the `Captured` collection. Local development only - it phones home to `localhost:4242` and has no effect in production. Ask your agent to call `install_middleware` to get the exact snippet for your framework.

## How collections work

Collections live in `.reqly/` inside your project directory as human-readable YAML files. They support variables, authentication profiles, and test assertions.

Example request YAML:
```yaml
name: create-user
method: POST
url: "{{baseUrl}}/api/users"
headers:
  Content-Type: application/json
body:
  email: test@example.com
assertions:
  - field: status
    operator: eq
    value: 201
  - field: body
    path: user.id
    operator: neq
    value: ""
```

## Assertions

Assertions run automatically after every request execution. Each assertion checks one thing:

| Property | Values | Notes |
|----------|--------|-------|
| `field` | `status` \| `body` \| `latency` | **Required.** Use `field`, not `type`. |
| `operator` | `eq` \| `neq` \| `contains` \| `lt` \| `gt` | **Required.** |
| `value` | string, number, or boolean | **Required.** Expected value. |
| `path` | dot-notation string | Required when `field` is `body`. Path into the JSON body, e.g. `user.id` or `data.items.0.name`. |

**Common mistake:** writing `type: "status"` instead of `field: "status"` - this silently produces an assertion that never matches, always failing with "got undefined".

Examples:
```yaml
assertions:
  - field: status       # HTTP status code
    operator: eq
    value: 200

  - field: body         # JSON body field at path
    path: user.active
    operator: eq
    value: true

  - field: latency      # response time in ms
    operator: lt
    value: 2000
```

## CLI Runner

You can use Reqly in your terminal or CI/CD pipelines to run test suites.

```bash
reqly run users
```

Supports reporter formats and environments:
```bash
reqly run users --env prod --reporter json
reqly run users --reporter tap
```

### Running Flows

```bash
reqly run-flow "Login Flow"
reqly run-flow "Login Flow" --reporter json
reqly run-flow "Login Flow" --reporter tap
reqly run-flow "Signup Flow" --data-row '{"email":"test@example.com"}'
```

### Exporting flows to CI

```bash
reqly export-flow "Login Flow" --format github-actions
```

Writes `.github/workflows/Login Flow.yml` (creates the directory if needed) that installs Reqly, starts it, and runs the flow on push and pull request. Add a "Start server" step before "Run flow" if the flow hits a local API.

### Mock server

Serve saved example responses as a real HTTP server so frontend code or agents can make calls against controlled responses without a live backend:

```bash
reqly mock <collection>           # default port 4243
reqly mock <collection> --port 5000
```

On start, Reqly prints a table of all active routes (method, path, example count). Press Ctrl+C to stop.

To select a specific example per request, set the `X-Reqly-Example: <name>` header. Without it, the first saved example is served.

The mock server also exposes REST routes on the main server (port 4242) for UI and programmatic control:

```
POST /api/mock/start   { collection, port? }
POST /api/mock/stop
GET  /api/mock/status
```
