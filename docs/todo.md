# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-018** Prompt Bar Component
  - Text input for user prompts
  - Logic to send to LLM (using BYOK API key)
  - LLM calls MCP tools, result updates UI

## Backlog

- [ ] **T-011** Express server + REST API bridge (M2)
  - Add `express` server to `src/server/index.ts` alongside the MCP stdio server - same process, two interfaces
  - Server listens on `localhost:4242`
  - REST routes (prefix `/api/`) that the React UI calls to interact with the engine:
    - `GET  /api/collections` - list all collections
    - `GET  /api/collections/:name` - get collection with all requests
    - `POST /api/collections` - create collection `{ name }`
    - `POST /api/collections/:name/requests` - add request to collection
    - `PUT  /api/collections/:name/requests/:requestName` - update request
    - `DELETE /api/collections/:name/requests/:requestName` - delete request
    - `GET  /api/environments` - list environments + active
    - `POST /api/environments` - create environment
    - `PUT  /api/environments/:name/active` - set active environment
    - `POST /api/run` - fire a request `{ collectionName, requestName }`, returns `HttpResponse`
    - `POST /api/run/adhoc` - fire an unsaved request `{ config: RequestConfig }`, returns `HttpResponse`
    - `GET  /api/config` - get settings (model, hasApiKey boolean - never return the key itself)
    - `PUT  /api/config` - save BYOK key + model preference to `~/.reqly/config.json`
  - Serve the React static build from `src/ui/dist/` at `/` for all non-API routes
  - Engine modules are shared instances between MCP and REST handlers (no duplication)
  - TDD for route handlers: unit test each handler with mocked engine instances

- [ ] **T-012** React app scaffold + base layout (M2)
  - Scaffold with Vite: `npm create vite@latest src/ui -- --template react-ts`
  - Install Tailwind CSS v3, configure dark mode (`darkMode: 'class'`), apply dark class to `<html>`
  - Base colour palette in `tailwind.config.ts`: bg-zinc-950 (app bg), bg-zinc-900 (panel), bg-zinc-800 (hover), zinc-400 (muted text), zinc-100 (primary text), blue-500 (accent)
  - No `box-shadow` anywhere - use `border border-zinc-800` for depth
  - Base layout: fixed left sidebar (260px) + main content area filling remaining width + top bar (40px)
  - `src/ui/src/api/client.ts`: typed fetch wrapper for all `/api/*` calls, returns typed responses, throws on non-2xx
  - `src/ui/src/types/`: mirror of server types for the UI (can be shared via a `src/types/` symlink or copy)
  - Build output to `src/ui/dist/` (served by Express in T-011)
  - UI verification is visual - no unit tests required for scaffold

- [ ] **T-013** Sidebar (M2)
  - Left panel, 260px fixed, `bg-zinc-900 border-r border-zinc-800`
  - Top section: "Collections" label + `+` button to create a new collection (modal: text input for name)
  - Collection tree: each collection is a collapsible folder row. Click to expand, shows request list underneath
  - Request rows: show HTTP method badge (colour-coded: GET=blue, POST=green, PUT=yellow, PATCH=orange, DELETE=red) + request name
  - Click a request to open it in the Request Editor (sets active request in state)
  - Right-click a request: context menu with Rename and Delete options
  - Bottom section: "Environments" dropdown (compact, shows active env name) - triggers environment switcher popover
  - Active request is highlighted with `bg-zinc-800`
  - Fetch collections on mount via `GET /api/collections`, refetch after any mutation
  - No animations - instant show/hide on expand/collapse

- [ ] **T-014** Request Editor (M2)
  - Main content area, fills remaining width after sidebar
  - Top bar within editor: method dropdown (GET/POST/PUT/PATCH/DELETE, styled as a compact select) + URL input (flex-grow) + "Send" button (blue)
  - Four tabs below: Headers | Body | Auth | Params - `border-b border-zinc-800` tab row, active tab has `border-b-2 border-blue-500`
  - Headers tab: key-value table, each row has key input + value input + delete button. "Add header" row at bottom.
  - Body tab: radio toggle Raw/JSON/Form. Raw and JSON show a `<textarea>` with monospace font. Form shows key-value table.
  - Auth tab: dropdown to select a saved auth profile from `GET /api/config` auth list, or "None"
  - Params tab: key-value table for query params (appended to URL on send)
  - Pre-fills from selected collection request when one is opened from the sidebar
  - "Send" calls `POST /api/run` or `POST /api/run/adhoc`, passes result to Response Viewer via shared state
  - "Save" button: saves current editor state back to collection via `PUT /api/collections/:name/requests/:requestName`

- [ ] **T-015** Response Viewer (M2)
  - Panel below the Request Editor (split layout: editor top ~50%, response bottom ~50%, resizable via drag handle)
  - Empty state: muted text "Send a request to see the response"
  - On response: status badge (green for 2xx, red for 4xx/5xx, yellow for 3xx) + status text + latency in ms
  - Three tabs: Body | Headers | Raw
  - Body tab: JSON responses pretty-printed with syntax highlighting (use `JSON.stringify(data, null, 2)` in a `<pre>` block, colour tokens via CSS classes - no external lib needed)
  - Headers tab: key-value table of response headers
  - Raw tab: raw response body string in a `<pre>` block
  - "Copy" button top-right of body: copies response body to clipboard
  - Loading state: "Sending..." text + subtle pulse on the status area while request is in-flight

- [ ] **T-016** Environment Switcher (M2)
  - Compact dropdown in the top bar (top-right area), shows active environment name or "No environment"
  - Click opens a popover listing all environments from `GET /api/environments`
  - Click an environment to set it active via `PUT /api/environments/:name/active`
  - "New environment" option at bottom of popover - opens a modal: name input + key-value table for initial variables
  - Active environment name updates in the dropdown immediately on selection
  - Popover closes on outside click or Escape

- [ ] **T-017** Settings Panel (M2)
  - Accessible via gear icon in top-right corner of top bar
  - Opens as a slide-in panel from the right (280px wide) over the main content, `bg-zinc-900 border-l border-zinc-800`
  - "API Key" section: password input (`type="password"`), placeholder "sk-..." or equivalent. Save button calls `PUT /api/config`. Never pre-filled from server (server returns `hasApiKey: boolean` not the key).
  - "Model" section: dropdown to select LLM model (GPT-4o, GPT-4o-mini, Claude Sonnet, Claude Haiku). Saved to `~/.reqly/config.json`.
  - Confirmation toast on save: "Settings saved" for 2 seconds, then disappears
  - Close button (X) top-right of panel
  - No external toast library - use a simple absolute-positioned div with opacity transition

- [ ] **T-018** Prompt Bar (M2)
  - Fixed bar at the bottom of the main content area, `border-t border-zinc-800 bg-zinc-950`
  - Single text input: "Describe what you want..." placeholder
  - Submit on Enter or click the arrow button
  - On submit: `POST /api/prompt` with `{ prompt: string }` - server reads BYOK key + model from config, calls LLM API with the prompt and a system message describing available MCP tools
  - LLM response is streamed back via SSE or returned as a single JSON response
  - Server-side: the prompt handler formats a system prompt listing all 7 MCP tool definitions (name, description, inputSchema), calls the LLM, parses tool_use calls from the response, invokes the corresponding engine method, and returns the result
  - UI shows result inline below the prompt bar in a collapsible output area
  - If `hasApiKey` is false, input is disabled with tooltip "Add your API key in Settings"
  - Zero AI cost on Reqly's side - all LLM calls use the user's own key
