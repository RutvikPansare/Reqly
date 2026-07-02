# Reqly - Todo

## Queue

---

### v2 Architecture: Disk-Persisted State + Independent Processes

> Goal: remove the singleton lock as a state coordinator. Each process (Electron, reqly mcp, CLI) runs a full independent engine. State is shared through files in `.reqly/`, same way collections already work. Do this before the Multi-Project Workspace milestone - it is the prerequisite.



- [ ] **T-222** Remove singleton lock as state coordinator - each process runs a full engine
  - **Engine/Server:** After T-220 and T-221 land, remove the MCP-only mode from `index.ts` startup. Every `reqly mcp` spawn runs its own full `EngineContext` + Express regardless of whether another process holds the lock.
  - **Server:** Retain the lock file write (`~/.reqly/running.json`) for process registry only (`reqly stop`, `reqly status`, `reqly app`) - not for state coordination
  - **Server:** Remove `startupMode.ts` / `resolveMcpMode` logic (dead code after this)
  - **Server:** Keep `POST /api/switch-project` endpoint - the UI still uses it to switch the current process's active project. Remove only the inter-process HTTP call to it from `index.ts` startup.
  - All tests that exercise the MCP-only startup path must be updated or removed

- [ ] **T-223** Update `switch_project` MCP tool to local context swap
  - **Engine/MCP:** Replace the HTTP call to `/api/switch-project` with direct re-instantiation of `CollectionManager` and `EnvironmentManager` on the current process's `EngineContext`. No inter-process communication.
  - **UI:** No change - UI's project switcher still calls `POST /api/switch-project` on its own process's Express, which remains and works as before
  - Update tool description in `switch-project.ts` and `llms.txt` to document that the tool now operates locally
  - Add/update tests for the new local swap behaviour

- [ ] **T-224** Update `reqly init` to auto-gitignore runtime state files
  - **CLI:** When `reqly init` creates `.reqly/` in a project, append to `.gitignore` (or create it):
    ```
    .reqly/history.ndjson
    .reqly/responses.json
    ```
  - Skip silently if entries already exist
  - **UI:** Settings panel or first-run banner confirms gitignore status (green tick / warning if `.gitignore` is missing the entries)
  - Update README and `llms.txt`

---

### Multi-Project Workspace (depends on v2 architecture above)

- [ ] **T-225** Workspace model: `~/.reqly/workspaces/<name>/workspace.yaml`
  - **Engine:** Define workspace YAML schema: `name`, `repos` (list of `{ alias, path }`), optional `sharedEnv`
  - **CLI:** `reqly workspace create <name>` scaffolds folder + empty `workspace.yaml`; `reqly workspace link <alias> <path>` adds a repo entry
  - **MCP:** `create_workspace` / `link_workspace_repo` tools for agent use
  - **UI:** Workspace switcher in the nav rail (replaces or augments project switcher). Sidebar groups collections under their repo alias. Each repo section is collapsible.
  - Workspace files live in `~/.reqly/workspaces/<name>/` - machine-local, not in any repo

- [ ] **T-226** Cross-repo flows in workspace
  - **Engine:** Extend flow step `type: run` to accept `repo: <alias>` field. Flow runner resolves alias via workspace config to the correct `projectDir`, instantiates a scoped `CollectionManager` for that dir.
  - **CLI/MCP:** `run_flow` and `reqly run-flow` accept `--workspace <name>` flag. Cross-repo flow YAMLs live in `~/.reqly/workspaces/<name>/flows/`.
  - **UI:** Flow builder step picker shows a repo selector when a workspace is active. Step cards display `repo / collection / request` instead of just `collection / request`.
  - Update `llms.txt` with cross-repo flow YAML format and `repo:` field docs

