# Reqly Architecture

## Overview

Reqly is composed of two primary interfaces sharing a single core engine:

1. **MCP Server (stdio)**: Used by AI coding agents.
2. **Localhost Web UI**: Used by humans at `localhost:4242`.

## Tech Stack

- **Backend:** Node.js, TypeScript, Express/Fastify
- **Frontend:** React, Tailwind CSS
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Testing:** Vitest

## Directory Structure

- `src/server/` - Express/Fastify server, MCP server, tool handlers
- `src/engine/` - HTTP executor, collection manager, environment manager, auth manager
- `src/ui/` - React application
- `src/mcp/` - MCP tool definitions and schemas
- `src/types/` - Shared TypeScript types

## Data Storage

- **Collections:** Stored as YAML files in `.reqly/` within the user's project directory.
- **Global Config:** Stored in `~/.reqly/config.json` (for BYOK keys, etc.).
