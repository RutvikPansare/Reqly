# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue




- [x] **T-040** Left icon navigation rail (M4 UI)
  - Narrow (~48px) icon-only column on the far left, between the window edge and the current sidebar panel
  - Icons (top to bottom): Collections (folder), Environments (globe), History (clock), Capture (radio), Settings (gear)
  - Clicking an icon switches what the sidebar panel shows - active icon highlighted
  - Default active: Collections
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/app/` - Hoppscotch uses a similar nav rail pattern on the left. Match the icon sizing, active indicator style, and spacing.
  - Keep sidebar on left - do NOT mirror Hoppscotch's right-side collection panel
  - _Dependency note: T-041 (Environment editor), T-043 (History panel), and Capture/Settings panels mount into this rail._

- [x] **T-041** Environment editor - full CRUD in UI (M4 UI)
  - Currently the UI only lets users switch environments, not create/edit/delete them or manage their variables
  - Environment panel (shown when Environments icon active in nav rail): list all environments, + New button, click to expand variable table
  - Variable table: Key / Value columns, + Add row, delete row (trash icon), inline editing
  - Create environment: modal or inline - name input, Save
  - Delete environment: confirm dialog
  - All changes call existing API endpoints: `POST /api/environments`, `PUT /api/environments/:name`, `DELETE /api/environments/:name`
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/environments/` for the variable table layout and editing pattern
  - _Requires T-040 (nav rail) for panel mounting._

- [x] **T-042** Collection manager UI - full CRUD from sidebar (M4 UI)
  - Right-click context menu on any collection or request in the sidebar: Rename, Delete, Duplicate, Add Request (on collection)
  - Inline rename: click name to edit in place, Enter to confirm, Escape to cancel
  - Drag to reorder requests within a collection (optional - skip if complex)
  - + New collection button at top of collections panel opens a name input inline
  - All actions call existing engine API endpoints
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/collections/` for the tree item component, context menu, and inline rename pattern
  - _Backend gap to close: `DELETE /api/collections/:name` and `DELETE /api/environments/:name` are not yet wired in express.ts - add them._

- [x] **T-043** Request history panel + backend (M4 UI)
  - History panel shown when History icon active in nav rail
  - Every fired request is logged: timestamp, method (colored badge), URL, status code, latency
  - Newest first. Limit to last 200 entries stored in memory (no persistence needed for MVP)
  - Click a history entry to load it into the request editor (pre-fills method, URL, headers, body)
  - Clear history button at top
  - Backend: add a `GET /api/history` and `DELETE /api/history` endpoint backed by an in-memory log; engine appends to log on every `run_request` / adhoc run call
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/history/` for the list item layout (method badge + URL + status + timestamp)
  - _Requires T-040 (nav rail) for panel mounting._

- [ ] **T-044** Search / command palette (M4 UI)
  - Triggered by ⌘K (Mac) / Ctrl+K (Windows/Linux), or clicking a search bar in the top area
  - Full-screen overlay with a centered input
  - Searches across: collection names, request names, URLs. Results grouped by type.
  - Keyboard navigable (arrow keys, Enter to open, Escape to close)
  - Clicking a result opens that request in the editor
  - No backend needed - search runs over the in-memory collection list from `GET /api/collections`
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/app/SpotlightSearch.vue` for the overlay layout, input styling, and grouped results pattern. Implement in React, same visual concept.

- [ ] **T-045** Request tabs - polish and closeable (M4 UI)
  - Each open request tab should have an X close button (appears on hover)
  - Unsaved changes indicator: small dot on the tab label if the request has been modified but not saved
  - Unsaved state tracking: keep the last-saved snapshot per tab so we can diff for a dirty flag
  - Tab overflow: if tabs overflow the width, show left/right scroll arrows
  - Active tab: bottom border highlight (Hoppscotch uses a colored underline - match that style)
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/http/` for the tab bar component and active/unsaved state styling

- [ ] **T-046** Variables tab in request editor (M4 UI)
  - Add a "Variables" tab next to Params / Headers / Body / Auth / Assertions
  - Shows all environment variables currently in scope (from the active environment)
  - Read-only list: Key / Value / Source (environment name). Not editable here - editing is done in the Environment editor (T-041).
  - Useful for debugging: "why isn't my {{baseUrl}} resolving?" - check this tab
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/http/` - Hoppscotch has a Variables panel that shows resolved variables, use the same two-column table layout

- [ ] **T-047** GraphQL mode in request editor (M4 UI)
  - Toggle button near the method dropdown to switch a request between REST and GraphQL mode
  - In GraphQL mode: URL bar stays, method locked to POST, Body tab replaced with a Query editor (textarea with monospace font) + Variables sub-tab (JSON input for GraphQL variables)
  - Schema introspection button: fires `POST <url>` with the standard introspection query, parses the response, stores schema in memory
  - With schema loaded: basic autocomplete in the query editor (field names, types)
  - On Send: engine posts `{ query, variables }` to the URL - the existing HTTP executor handles this transparently
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/graphql/` for the query editor layout, introspection flow, and variables panel. Also `example/hoppscotch/packages/hoppscotch-data/src/graphql/` for the data types.

- [ ] **T-048** Visual polish pass - match Hoppscotch aesthetic (M4 UI)
  - Audit every component against the Hoppscotch reference screenshots and `example/hoppscotch/`
  - Specific items:
    - Method badge colors: GET=green, POST=yellow, PUT=blue, PATCH=orange, DELETE=red - match Hoppscotch's exact palette
    - Sidebar section headers: smaller, uppercase, letter-spaced (`text-xs uppercase tracking-widest text-zinc-500`)
    - Button styles: Hoppscotch uses a tighter, flatter button with no radius on some elements - audit and align
    - Input fields: consistent border color, focus ring style across all tabs
    - Status code badge in response: colored by range (2xx green, 4xx yellow, 5xx red)
    - Spacing: audit all padding/gap values for consistency - Hoppscotch is dense but not cramped
  - Reference: `example/hoppscotch/packages/hoppscotch-common/src/components/` throughout. Use `hoppscotch.io` live site as the visual target.









