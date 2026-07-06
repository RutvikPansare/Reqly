# Reqly for VS Code

Reqly is a prompt-first, agent-native API client. Collections live as YAML in `.reqly/` next to your code, AI agents drive them over MCP, and this extension surfaces the same engine natively inside VS Code, Cursor, Windsurf, and any VS Code-compatible editor.

The extension is a thin client over the local Reqly server at `localhost:4242`. Install Reqly first:

```sh
npm install -g getreqly
reqly start
```

## Features

- **Collections view** - browse projects, collections, and requests in the activity bar. Click a request to preview its YAML read-only; hit the inline play button to fire it.
- **Status bar environment switcher** - shows `Reqly: <env>`; click to switch the active environment.
- **Command palette** - `Reqly: Run Request`, `Reqly: Run Collection`, `Reqly: Switch Environment`, `Reqly: Start Proxy`, `Reqly: Open UI`.
- **Output channel** - responses, assertion results, and collection run summaries land in the Reqly output channel.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `reqly.serverUrl` | `http://localhost:4242` | Base URL of the local Reqly server |

## Requirements

A running Reqly server (`reqly start` or the Reqly desktop app). The extension reads whatever project the server has active; switch projects with `reqly use <path>` or from the Reqly UI.

## Development

```sh
cd packages/vscode
npm install
npm run build       # tsc -> dist/
npm run package     # vsce package -> .vsix
```

Unit tests for the API client run with the repo-wide vitest suite: `npm test` at the repo root.
