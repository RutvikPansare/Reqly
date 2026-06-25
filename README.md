# Reqly

Reqly is an execution engine for API requests, designed primarily as an MCP (Model Context Protocol) server for AI coding agents. It gives your AI the ability to directly fire HTTP requests, test endpoints, and store API context in plain-text YAML inside your repository.

## Quick Setup

Run these two commands anywhere to install Reqly globally and configure your AI tool (Cursor, Claude Desktop, Claude Code, Gemini, or Codex) to use it:

```bash
npm install -g @rutvikpansare123/reqly
reqly setup
```

## The fastest way to start

Don't capture traffic, don't write YAML by hand - just tell your agent to read your code:

```
"Read my Express routes and build a Reqly collection for every endpoint"
```

The agent reads your codebase and calls `create_collection` + `create_request` for each route it finds. No traffic capture needed - it already knows your API from the code.

## What Reqly does

Reqly is not an AI—it's an engine for your AI. When connected, your AI coding agent can securely query your local APIs, introspect GraphQL endpoints, and verify behavior without you needing to tab out to a browser. All collections are stored in `.reqly/` in your project so they are committed to Git alongside your code. Reqly also serves a local developer UI for you at `http://localhost:4242`.

## MCP Tools

Reqly exposes these tools directly to your AI agent:

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `list_collections` | Lists all collections and requests in the project | (None) |
| `create_collection`| Scaffolds a brand new collection file | `name` |
| `create_request` | Adds a request to a collection | `collectionName`, `request` |
| `run_request` | Executes a specific request by name and returns the response | `collectionName`, `requestName` |
| `run_collection` | Fires all requests sequentially in a collection | `collectionName` |
| `get_response` | Retrieves the last stored response data for a request | `collectionName`, `requestName` |
| `set_environment` | Changes active env for variable resolution (`{{var}}`) | `environmentName` |
| `create_environment` | Creates a new named environment with variables | `name`, `variables` |
| `set_variable` | Sets a variable on an environment | `environmentName`, `key`, `value` |
| `get_variables` | Lists variables for an environment | `environmentName` |
| `delete_variable` | Removes a variable from an environment | `environmentName`, `key` |
| `get_response_full` | Retrieves the last untruncated response for a request | `collectionName`, `requestName` |
| `start_proxy` | Auto-captures local outbound traffic into a collection | `port`, `collectionName` |
| `stop_proxy` | Stops traffic interception | (None) |
| `exec_with_proxy` | Starts the proxy and runs a dev command with it injected | `command`, `collection`, `port` |
| `install_middleware` | Detects your framework and returns the inbound-capture middleware snippet | (None) |

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

Example `.reqly/users.yaml`:
```yaml
id: req_users_1
name: users
requests:
  - name: create_user
    method: POST
    url: "{{baseUrl}}/api/users"
    headers:
      Content-Type: application/json
    body:
      email: test@example.com
    assertions:
      - path: status
        operator: eq
        value: 201
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
