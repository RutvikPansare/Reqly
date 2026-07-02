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

### Multi-Project Workspace

#### Phase 1: Bruno Parity - Multi-repo sidebar (no new file format)

> Goal: let developers open multiple project directories simultaneously and see all their collections in one grouped sidebar. Same as Bruno's model. Zero new file formats - just a path list in existing config.

- [ ] **T-225** Multi-project path list + grouped sidebar
  - **Config/Engine:** Add `workspaceProjects: string[]` array to `~/.reqly/config.json`. Each entry is an absolute path to a project directory that has a `.reqly/` folder. The current active `projectDir` is always included implicitly.
  - **Engine:** `CollectionManager` gains a `loadAll(projectDirs: string[])` mode that reads collections from multiple `.reqly/` directories. Each collection is tagged with its source `projectDir`.
  - **CLI:**
    - `reqly workspace add <path>` - validates path has `.reqly/`, appends to `workspaceProjects` in config
    - `reqly workspace remove <path>` - removes from list
    - `reqly workspace list` - prints all open project paths
  - **MCP:** `add_workspace_project`, `remove_workspace_project`, `list_workspace_projects` tools. Agents can build a multi-repo workspace programmatically.
  - **Server:** `GET /api/workspace/projects` returns the list. `POST /api/workspace/projects` adds a path. `DELETE /api/workspace/projects` removes a path. All three refresh the in-memory `CollectionManager` immediately.
  - **UI:**
    - Collections sidebar grouped by project name (uses the folder name, e.g. `auth-service`, `payments-service`) with a collapsible section per project
    - Each section header shows the project name + folder icon. Clicking the `…` menu offers "Remove from workspace" and "Open in Finder/Explorer"
    - "Add project" button at the bottom of the collections sidebar: opens a native folder picker in Electron, or a path input field in web mode
    - Active project (the one requests fire against) is highlighted. Clicking a collection in a different project section automatically switches active project context.
    - History panel entries are tagged with the project name they came from (prep for T-220 disk-persisted history)
  - Update `llms.txt` and README with workspace CLI commands and MCP tools

#### Phase 2: Workspace Model + Cross-repo Flows (Reqly differentiation)

> Goal: go beyond Bruno. Introduce a named, shareable workspace definition and let flows reference requests from any repo in the workspace by alias. This is what makes Reqly uniquely agent-native for microservices teams.

- [ ] **T-226** Formal workspace model: `~/.reqly/workspaces/<name>/workspace.yaml`
  - **Engine:** Define workspace YAML schema:
    ```yaml
    name: checkout-team
    repos:
      - alias: auth
        path: /repos/auth-service
      - alias: payments
        path: /repos/payments-service
    sharedEnv:
      STAGING_BASE_URL: https://staging.example.com
    ```
  - **CLI:** `reqly workspace create <name>` scaffolds `~/.reqly/workspaces/<name>/workspace.yaml`. `reqly workspace link <name> <alias> <path>` adds a repo entry. `reqly workspace use <name>` sets active workspace.
  - **MCP:** `create_workspace`, `link_workspace_repo`, `use_workspace` tools. Full agent control over workspace setup.
  - **UI:** Workspace dropdown in nav rail header (above the project list). "New workspace" flow walks through naming + linking repos. Workspace settings panel shows repo aliases and shared env vars.
  - Workspace files live in `~/.reqly/workspaces/<name>/` - machine-local, not in any repo. `alias` names are stable across teammates (each developer runs `reqly workspace link` with their local path).

- [ ] **T-227** Cross-repo flows
  - **Engine:** Extend flow step `type: run` to accept an optional `repo: <alias>` field. Flow runner resolves `repo` via active workspace config to the correct `projectDir`, instantiates a scoped `CollectionManager` for that dir, and executes the request. Steps without `repo:` use the active project as today.
    ```yaml
    steps:
      - type: run
        id: login
        repo: auth             # resolves to /repos/auth-service/.reqly/
        collection: users
        request: login
      - type: extract
        from: login
        path: body.token
        into: authToken
      - type: run
        id: create-order
        repo: payments         # resolves to /repos/payments-service/.reqly/
        collection: orders
        request: create
    ```
  - **CLI/MCP:** `run_flow` and `reqly run-flow` accept `--workspace <name>` to load alias resolution. Cross-repo flow YAMLs live in `~/.reqly/workspaces/<name>/flows/` and can also be referenced from any repo's `.reqly/flows/` for single-repo flows.
  - **UI:** Flow builder step picker shows a repo selector dropdown (populated from active workspace aliases) when a workspace is active. Step cards display `auth / users / login` breadcrumb instead of `users / login`.
  - Update `llms.txt` with cross-repo flow YAML format, `repo:` field semantics, and workspace flag docs.

