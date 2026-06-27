# Reqly Architecture

## Overview

Reqly is composed of two primary interfaces sharing a single core engine:

1. **MCP Server (stdio)**: Used by AI coding agents.
2. **Localhost Web UI**: Used by humans at `localhost:4242`.

## Tech Stack

- **Backend:** Node.js, TypeScript, Express
- **Frontend:** React, Tailwind CSS
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Testing:** Vitest

## Directory Structure

- `src/server/` - Express server, MCP server, CLI entry point, lock management
- `src/engine/` - HTTP executor, collection manager, environment manager, auth manager, flow runner
- `src/ui/` - React application
- `src/mcp/` - MCP tool definitions and schemas
- `src/types/` - Shared TypeScript types

## Data Storage

- **Collections:** YAML files in `.reqly/<collection-name>/<request-name>.yaml` within the user's project directory.
- **Collection metadata:** `.reqly/<collection-name>/collection.yaml` (variables, auth, spec config).
- **Flows:** YAML files in `.reqly/flows/<flow-name>.yaml`.
- **Environments:** `.reqly/environments.yaml`.
- **Global Config:** `~/.reqly/config.json` (BYOK key, active project, dotenv files).
- **Lock file:** `~/.reqly/running.json` (pid, projectDir, port, startedAt).

## Assertion Schema

Assertions are used in two places: on saved **requests** (run automatically after every execution) and in flow **assert steps** (run against the last response in the flow).

**Every assertion object has:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field` | `"status" \| "body" \| "latency"` | Yes | What to check. Use `"field"`, NOT `"type"`. |
| `operator` | `"eq" \| "neq" \| "contains" \| "lt" \| "gt"` | Yes | How to compare. |
| `value` | string, number, or boolean | Yes | Expected value. |
| `path` | string | Only for `body` | Dot-notation path into the JSON body, e.g. `"user.id"` or `"data.items.0.name"`. |

**Field meanings:**
- `status` - HTTP status code (number), e.g. `200`, `404`
- `body` - A JSON body field at `path` (requires `path`)
- `latency` - Response time in milliseconds

**Examples:**
```json
{ "field": "status", "operator": "eq", "value": 200 }
{ "field": "body", "path": "user.active", "operator": "eq", "value": true }
{ "field": "body", "path": "items.0.id", "operator": "neq", "value": "" }
{ "field": "latency", "operator": "lt", "value": 2000 }
```

**Common mistake:** Using `"type"` instead of `"field"` - e.g. `{ "type": "status", ... }` will silently fail because `field` is `undefined` and no switch case matches.

## Flow Step Schema

A flow is an ordered sequence of steps in `.reqly/flows/<name>.yaml`. Each step has `type` and `id` plus type-specific fields:

### `run` - fire a saved request
```yaml
type: run
id: unique-step-id
collection: my-collection
request: my-request
retry:              # optional
  times: 3
  on: [500, 503]    # retry while status is in this list
  delay: 1000       # ms between attempts
```

### `extract` - pull a value from the last response into flow scope
```yaml
type: extract
id: unique-step-id
from: response.body.userId    # response.status | response.latency | response.headers.<name> | response.body.<path>
into: userId                  # flow-local var, or env.varName to write the active environment
```

### `assert` - check the last response (uses assertion schema above)
```yaml
type: assert
id: unique-step-id
assertions:
  - field: status
    operator: eq
    value: 200
  - field: body
    path: user.id
    operator: neq
    value: ""
```

### `poll` - fire repeatedly until a condition is met
```yaml
type: poll
id: unique-step-id
collection: my-collection
request: my-request
until: "response.status === 200"   # expression: A === B, A !== B, or bare truthiness check
maxAttempts: 5
delay: 2000                        # ms between attempts
```

### `conditional` - branch on a flow expression
```yaml
type: conditional
id: unique-step-id
if: "response.body.completed === false"   # same expression syntax as poll.until
then: some-step-id                        # step id to jump to, or "skip" or "abort"
else: abort                               # optional
```

**Expression syntax** (no arbitrary JS eval): `A === B`, `A !== B`, or a bare truthiness check on a single operand. Operands: `response.status`, `response.body.<path>`, `response.headers.<name>`, `response.latency`, a flow-local variable name (bare token), or a quoted string literal / number / boolean.

**Flow variable scope:** Flow-local variables (set by `extract`) win over collection vars which win over env vars. Variable substitution uses `{{varName}}` syntax in request URLs, headers, and bodies.

## Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `src/server/index.ts` | Entry point. Parses CLI args, instantiates engine classes, assembles `EngineContext`, starts MCP + Express. |
| `src/engine/http-executor.ts` | Fires HTTP requests. Thin and engine-pure: no assertions, no diffing, no contract checking. |
| `src/engine/collection-manager.ts` | CRUD for collections, requests, collection metadata (variables/auth/spec). |
| `src/engine/flow-manager.ts` | CRUD for flows and flow steps. |
| `src/engine/flow-runner.ts` | Executes flows: step iteration, flow-local scope, retry/poll/conditional logic. |
| `src/engine/assertion-runner.ts` | Runs `Assertion[]` against an `HttpResponse`. Used by request runs and flow assert steps. |
| `src/engine/response-differ.ts` | Computes diff between two responses. |
| `src/engine/spec-loader.ts` | Loads and caches OpenAPI specs from file or URL. |
| `src/engine/contract-validator.ts` | Validates a response against a spec operation. |
| `src/mcp/server.ts` | MCP stdio server. Registers all tools, exposes `reqly://workflow` resource. |
| `src/mcp/tools/*.ts` | One file per MCP tool: `definition` (name, description, inputSchema) + `handler(args, context)`. |

