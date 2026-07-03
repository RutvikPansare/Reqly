# Reqly - Todo

## Queue

---

### Multi-Project Workspace

#### Phase 1: Bruno Parity - Multi-repo sidebar (no new file format)

> Goal: let developers open multiple project directories simultaneously and see all their collections in one grouped sidebar. Same as Bruno's model. Zero new file formats - just a path list in existing config.

#### Phase 2: Workspace Model + Cross-repo Flows (Reqly differentiation)

> Goal: go beyond Bruno. Introduce a named, shareable workspace definition and let flows reference requests from any repo in the workspace by alias. This is what makes Reqly uniquely agent-native for microservices teams.

### Desktop App Onboarding

_(T-233 "Bundle server binary + 1-click AI agent setup wizard" shipped - see done.md, logged as T-239 because the T-233 id was already taken by the landing page task.)_

### Multi-Project Workspace

- [ ] **T-226** Multi-Project Workspace Phase 2: Workspace Model + Cross-repo Flows
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
