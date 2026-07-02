# Reqly - Todo

## Queue

---

### v2 Architecture: Disk-Persisted State + Independent Processes

> Goal: remove the singleton lock as a state coordinator. Each process (Electron, reqly mcp, CLI) runs a full independent engine. State is shared through files in `.reqly/`, same way collections already work. Do this before the Multi-Project Workspace milestone - it is the prerequisite.

- [ ] **T-220** Persist `HistoryStore` to `.reqly/history.ndjson` (append-only NDJSON)
  - Each `append()` call writes one JSON line to disk immediately (fire-and-forget, no await blocking the request path)
  - On startup, `HistoryStore` reads existing entries from the file (up to the 200-entry cap, most recent)
  - Electron UI watches `history.ndjson` for changes via `fs.watch` and re-renders the history panel when the agent adds entries
  - `reqly init` auto-adds `history.ndjson` to `.gitignore`
  - All existing `HistoryStore` tests must still pass; add tests for disk read/write

- [ ] **T-221** Persist `ResponseStore` to `.reqly/responses.json`
  - `ResponseStore` maps `requestName -> last HttpResponse`. Write the full map to disk after every `set()` call.
  - On startup, read and hydrate from disk so `{{requestName.response.field}}` chaining works across process restarts
  - `reqly init` auto-adds `responses.json` to `.gitignore`
  - Keep existing in-memory access pattern unchanged; disk is just the backing store

- [ ] **T-222** Remove singleton lock as state coordinator - each process runs a full engine
  - After T-220 and T-221 land, remove the MCP-only mode from `index.ts` startup
  - Every `reqly mcp` spawn runs its own full `EngineContext` + Express regardless of whether another process holds the lock
  - Retain the lock file write (`~/.reqly/running.json`) for process registry only (`reqly stop`, `reqly status`, `reqly app`), not for state coordination
  - Remove the `POST /api/switch-project` Express endpoint (no longer needed)
  - Remove `startupMode.ts` / `resolveMcpMode` logic (dead code after this)
  - All tests that exercise the MCP-only path must be updated or removed

- [ ] **T-223** Update `switch_project` MCP tool to local context swap
  - Replace the HTTP call to `/api/switch-project` with direct re-instantiation of `CollectionManager` and `EnvironmentManager` on the current process's `EngineContext`
  - No inter-process communication. Works whether or not another process is running.
  - Update tool description in `run-request.ts` and `llms.txt` to reflect the change
  - Add/update tests for the new local swap behaviour

- [ ] **T-224** Update `reqly init` to auto-gitignore runtime state files
  - When `reqly init` creates `.reqly/` in a project, append to `.gitignore` (or create it):
    ```
    .reqly/history.ndjson
    .reqly/responses.json
    ```
  - If `.gitignore` already contains these entries, skip silently
  - Document in README and `llms.txt`

---

### Multi-Project Workspace (depends on v2 architecture above)

- [ ] **T-225** Workspace model: `~/.reqly/workspaces/<name>/workspace.yaml`
  - Define the workspace YAML schema: `name`, `repos` (list of `{ alias, path }`), optional `sharedEnv`
  - `reqly workspace create <name>` scaffolds the folder and an empty `workspace.yaml`
  - `reqly workspace link <alias> <path>` adds a repo entry (updates the yaml, validates the path exists and has `.reqly/`)
  - MCP tool `create_workspace` / `link_workspace_repo` for agent use
  - Workspace files live in `~/.reqly/workspaces/<name>/` - not in any repo (they are machine-local developer config)

- [ ] **T-226** Cross-repo flows in workspace
  - Extend flow step `type: run` to accept `repo: <alias>` field alongside `collection` and `request`
  - Flow runner resolves `repo` alias via workspace config to the correct `projectDir`, instantiates a scoped `CollectionManager` for that dir, and executes the request
  - Cross-repo flow YAMLs live in `~/.reqly/workspaces/<name>/flows/`
  - `run_flow` MCP tool and `reqly run-flow` CLI updated to accept `--workspace <name>` flag
  - Update `llms.txt` with cross-repo flow YAML format and `repo:` field docs

