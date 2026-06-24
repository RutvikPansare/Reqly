# Reqly Decision Log

<!--
Append any non-obvious product or architecture calls here so the reasoning isn't lost.
Each entry records: date, the decision, and why it was taken.
Newest entries at the top.
-->

## 2026-06-24

**Decision:** Request history lives in a dedicated `HistoryStore` engine module (in-memory, capped at 200 entries) on `EngineContext`, parallel to `ResponseStore`, rather than as a server-only array or persisted file.
**Why:** History must capture every fired request regardless of entry point - adhoc UI runs, MCP `run_request`, and collection runs all need to append. Putting the store on `EngineContext` (the shared seam both the MCP tools and Express handlers already hold) means every execution path logs through one `append` call with no special-casing, and the UI's `GET /api/history` reads the same source. In-memory (no YAML persistence) matches the T-043 spec's MVP scope: history is a working scratchpad, not a committed artifact. The 200-entry cap bounds memory for long sessions.

**Decision:** Environment editing moved from a modal dialog to an inline, expandable variable table inside the Environments nav-rail panel; the standalone EnvironmentEditor modal was removed.
**Why:** The nav rail already owns the Environments surface. Inlining the Key/Value table with add/remove rows and per-environment Save keeps editing in context (the user is already looking at the list), avoids a second modal for routine variable tweaks, and matches Hoppscotch's inline environments editor pattern. Required adding `EnvironmentManager.deleteEnvironment` (TDD) and `DELETE /api/environments/:name`, which the task spec assumed already existed.

**Decision:** Split the monolithic Sidebar into a left icon NavRail plus switchable per-function panels (Collections / Environments / History / Capture).
**Why:** The M4 UI growth tasks (T-041 environment editor, T-043 history panel) need dedicated sidebar surfaces. A nav rail that swaps the panel content keeps a single 64px sidebar column while giving each function its own full-height view, matching Hoppscotch's Sidenav pattern without mirroring its right-side collection layout. Settings stays a modal (BYOK config does not fit a narrow column); the rail's Settings icon opens that modal rather than rendering inline.

## 2026-06-23

**Decision:** Reqly will not host any AI models itself.
**Why:** Reqly is purely an execution engine. The intelligence lives in the user's AI agent (Cursor, Claude Code) or via a BYOK API key. This keeps the engine fast, reliable, and decoupled from rapidly changing LLM landscapes.

**Decision:** Collections will be stored as YAML files.
**Why:** YAML is human-readable, git-diffable, and easily editable in a text editor. This allows the API collections to travel with the repository and be modified cleanly by both humans and AI agents.
