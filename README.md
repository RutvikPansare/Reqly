# Reqly

Reqly is an execution engine for API requests, designed primarily as an MCP (Model Context Protocol) server for AI coding agents. It gives your AI the ability to directly fire HTTP requests, test endpoints, and store API context in plain-text YAML inside your repository.

## Quick Setup

Run these two commands anywhere to install Reqly globally and configure your AI tool (Cursor, Claude Desktop, Claude Code, Gemini, or Codex) to use it:

```bash
npm install -g reqly
reqly setup
```

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
| `start_proxy` | Auto-captures local outbound traffic into a collection | `port`, `collectionName` |
| `stop_proxy` | Stops traffic interception | (None) |

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
