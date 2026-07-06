# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

---


### Cross-repo Flows (post-launch)

- [ ] **T-227** Cross-repo flows with `repo: <alias>` step field
  - **Engine:** Extend flow step `type: run` to accept an optional `repo: <alias>` field. Flow runner resolves `repo` via active workspace config to the correct `projectDir`, instantiates a scoped `CollectionManager` for that dir, and executes the request. Steps without `repo:` use the active project as today.
  - **CLI/MCP:** `run_flow` and `reqly run-flow` accept `--workspace <name>` to load alias resolution. Cross-repo flow YAMLs live in `~/.reqly/workspaces/<name>/flows/`.
  - **UI:** Flow builder step picker shows a repo selector dropdown (populated from active workspace aliases) when a workspace is active. Step cards display `auth / users / login` breadcrumb instead of `users / login`.
  - Update `llms.txt` with cross-repo flow YAML format, `repo:` field semantics, and workspace flag docs.
  - **Use Fable**
