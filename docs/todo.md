# Reqly - Todo

## Queue

### M6 - Script Power + Developer UX

### M7 - Data & CI Power

### GraphQL Polish


### Realtime Workspace Epic (T-185 through T-194)

> **Architecture mandate - read knowledge.md "Protocol Architecture Rule" section before starting.**
>
> TL;DR: Two use cases, two patterns. Do NOT mix them.
>
> **Agent/MCP use (ephemeral, bounded):**
> Engine `realtime-executor.ts` connects → buffers for `captureTimeout` seconds → disconnects → returns `{ messages, truncated }`. Same pattern as `grpc-streaming.ts`. One MCP tool: `run_realtime`. Stateless, no sessions, no server memory.
>
> **UI interactive use (long-lived, browser-native):**
> Browser connects DIRECTLY to the target server using native browser APIs and browser-compatible npm packages in `src/ui/package.json`. No proxy through the Reqly server. Sessions live in the browser tab. `new WebSocket(url)` and `new EventSource(url)` are native - zero packages. `socket.io-client` and `mqtt` (browser builds) go in `src/ui/package.json` only. Nothing new in root `package.json`.
>
> **Key paths:**
> - Types: `src/types/request.ts`
> - Engine (MCP path): `src/engine/realtime-executor.ts` (NEW)
> - MCP tool: `src/mcp/tools/run-realtime.ts` (NEW)
> - UI packages: `src/ui/package.json` only
> - UI components: `src/ui/src/components/`
> - UI hooks: `src/ui/src/hooks/`
> - Colors/badges: `src/ui/src/lib/colors.ts`
>
> **Existing patterns to follow:**
> - All local imports end in `.js` even when source is `.ts`
> - TDD mandatory for `src/engine/` and `src/mcp/` code
> - Tab persistence: debounced `localStorage.setItem` + `useState(() => rehydrate())` from `App.tsx`
> - `onUpdate` propagation: see `GrpcWorkspace` → `setGrpcRequest` in `App.tsx`
> - Badge system: `requestBadgeInfo()` in `src/ui/src/lib/colors.ts`

- [ ] **T-186** Engine: `realtime-executor.ts` - buffered capture for MCP/agent use
  - **File: `src/engine/realtime-executor.ts`** (NEW, <180 lines)
  - Runs in Node.js. Used ONLY by the MCP tool and the `/api/run/realtime` Express route. NOT used by UI panels. Same pattern as `grpc-streaming.ts` - stateless, returns a result, caller gets the result when done.
  - npm packages (add to ROOT `package.json` only, NOT `src/ui/package.json`):
    - `ws` - WebSocket client for Node.js
    - `eventsource` - SSE client for Node.js
    - `socket.io-client` - Socket.IO (Node.js version, different from browser build)
    - `mqtt` - MQTT client
  - **`RealtimeMessage` type** (export):
    ```ts
    export interface RealtimeMessage {
      id: string;       // crypto.randomUUID()
      ts: number;       // Date.now()
      source: 'client' | 'server' | 'info' | 'error';
      payload: string;  // always a string
      topic?: string;   // MQTT only
      event?: string;   // Socket.IO only
    }
    ```
  - **`RealtimeCaptureResult` type** (export):
    ```ts
    export interface RealtimeCaptureResult {
      messages: RealtimeMessage[];
      truncated: boolean;
      isError?: boolean;
      errorMessage?: string;
    }
    ```
  - **`runRealtimeCapture(req: RealtimeCaptureRequest, opts: { captureTimeout: number }): Promise<RealtimeCaptureResult>`** (export):
    - `RealtimeCaptureRequest`: `{ type, url, config: RealtimeConfig, sendMessages?: { message: string; eventName?: string; topic?: string; retain?: boolean }[] }`
    - Opens the appropriate connection (ws / EventSource / io / mqtt), buffers received messages into an array (ring buffer max 500 - agents don't need 1000), sends `sendMessages` in order after connect, waits for `captureTimeout` seconds, disconnects, returns result.
    - On connection error: returns `{ messages: [info entry], truncated: false, isError: true, errorMessage }` (never rejects - always returns a result the MCP tool can return to the agent).
    - WebSocket: `new WebSocket(url, protocols)` from `ws` package
    - SSE: `new EventSource(url)` from `eventsource` package; listens on `eventType ?? 'message'`
    - Socket.IO: `io(url, { path, auth })` - use `socket.onAny((eventName, data) => ...)` to capture all events
    - MQTT: `mqtt.connect(url, opts)` - subscribe to `mqttTopics` after connect, publish `sendMessages` as publish calls
  - **File: `src/engine/realtime-executor.test.ts`** (NEW, <120 lines)
    - Mock `ws`, `eventsource`, `socket.io-client`, `mqtt` with `vi.mock()`
    - Simulate: connect event, N messages received, disconnect after captureTimeout
    - Test: returned `messages` array contains info + server messages
    - Test: `sendMessages` triggers send calls on the mock socket
    - Test: connection error returns `{ isError: true, errorMessage }` (no throw)
    - Test: ring buffer caps at 500, sets `truncated: true`
    - Run `npm test` - all existing + new tests pass.

- [ ] **T-187** MCP tool: `run_realtime` + Express route
  - **File: `src/mcp/tools/run-realtime.ts`** (NEW, <80 lines)
    - Tool name: `run_realtime`
    - Description: "Connects to a realtime endpoint (WebSocket, SSE, Socket.IO, or MQTT), captures messages for captureTimeout seconds, then disconnects and returns all received messages. Use this to verify a realtime endpoint works, test pub/sub flows, or capture a message sample. Returns { messages: [{ id, ts, source, payload, topic?, event? }], truncated, isError?, errorMessage? }. source values: 'server' = received from target, 'client' = sent by you, 'info' = connection events, 'error' = errors. Provide sendMessages to send messages after connecting (useful for WebSocket echo tests or MQTT publish). For types: 'websocket' expects ws:// or wss:// URLs; 'sse' expects http:// or https://; 'socketio' expects http:// or https://; 'mqtt' expects mqtt:// or ws:// URLs."
    - Input schema:
      ```json
      {
        "type": { "enum": ["websocket","sse","socketio","mqtt"] },
        "url": { "type": "string" },
        "captureTimeout": { "type": "number", "default": 5 },
        "sendMessages": { "type": "array", "items": { "type": "object", "properties": { "message": { "type": "string" }, "eventName": { "type": "string" }, "topic": { "type": "string" }, "retain": { "type": "boolean" } }, "required": ["message"] } },
        "config": { "type": "object" }
      }
      ```
    - Handler: calls `runRealtimeCapture({ type, url, config: args.config ?? {}, sendMessages: args.sendMessages ?? [] }, { captureTimeout: args.captureTimeout ?? 5 })`, returns JSON result.
  - Register in `src/mcp/server.ts`.
  - **File: `src/server/express.ts`** (EDIT - add ONE route only, ~15 lines)
    - `POST /api/run/realtime` - mirrors `/api/run/adhoc` for gRPC. Body: `{ type, url, captureTimeout?, sendMessages?, config? }`. Calls `runRealtimeCapture(...)`. Returns `res.json({ response: result })`. This lets the UI trigger a bounded capture from a saved collection request.
  - **TDD**: Test `definition` shape and `handler` with mocked `runRealtimeCapture`. Test Express route via supertest. Run `npm test`.

- [ ] **T-188** UI: `api.ts` additions + NavRail + App.tsx routing
  - **File: `src/ui/src/api.ts`** (EDIT - small addition)
    - Add one function: `runRealtimeCapture(req: { type: string; url: string; captureTimeout?: number; sendMessages?: any[]; config?: any }): Promise<{ messages: any[]; truncated: boolean; isError?: boolean; errorMessage?: string }>` - calls `POST /api/run/realtime`, returns parsed JSON `.response`. This is used to run saved collection requests from the UI.
  - **File: `src/ui/src/components/NavRail.tsx`** (EDIT)
    - Add `'realtime'` to `NavPanel` type export
    - Import `Wifi` from `lucide-react`
    - Add `{ id: 'realtime', label: 'Realtime', icon: <Wifi size={18} /> }` between `grpc` and `capture`
  - **File: `src/ui/src/App.tsx`** (EDIT)
    - `const [realtimeRequest, setRealtimeRequest] = useLocalStorage<any>('reqly.realtimeRequest', null)`
    - In `handleSelectRequestFromSidebar`: if `req.type` in `['websocket','sse','socketio','mqtt']` → `setRealtimeRequest({ ...req, _collection: col }); setActivePanel('realtime')`
    - Sidebar hide condition: add `activePanel !== 'realtime'`
    - Panel routing: `activePanel === 'realtime' ? <RealtimeWorkspace initialRequest={realtimeRequest} onUpdate={setRealtimeRequest} /> : ...`
  - Run `npm test`.

- [ ] **T-189** UI: shared display component + tab system
  - **File: `src/ui/src/components/RealtimeMessageLog.tsx`** (NEW, <150 lines)
    - Pure display component. Receives an array of messages from the parent panel, renders them. Zero connection logic.
    - Props: `{ messages: UIRealtimeMessage[]; title?: string; onClear: () => void }`
    - Define at top: `export interface UIRealtimeMessage { id: string; ts: number; source: 'client'|'server'|'info'|'error'; payload: string; topic?: string; event?: string }`
    - Header: `panel-header` CSS class (matches REST `ResponseViewer`), title left, right side: Trash icon (onClear), scroll-top icon, scroll-bottom icon, auto-scroll toggle (green = active)
    - Body: `flex-1 min-h-0 overflow-y-auto` with `ref={logRef}`. Auto-scroll: `useEffect` on `messages.length`, calls `logRef.current?.scrollTo({ top: logRef.current.scrollHeight })` if auto-scroll on. User scrolling up (detected via `onScroll` comparing `scrollTop + clientHeight < scrollHeight - 10`) turns auto-scroll off.
    - Each row (inline - keeps file count down): icon + prefix + payload (truncated, click to expand) + timestamp `HH:MM:SS` + copy-on-hover button
      - Icon: `ArrowUpRight` `#f59e0b` (client), `ArrowDownLeft` `#14b8a6` (server), `Info` muted (info), `AlertCircle` `#f87171` (error)
      - `[topic]` or `[event]` prefix in muted text before payload
    - Empty state: italic muted "Connect to see messages"
  - **File: `src/ui/src/hooks/useRealtimeTabs.ts`** (NEW, <120 lines)
    - `RealtimeTab`: `{ id: string; tabName?: string; protocol: 'websocket'|'sse'|'socketio'|'mqtt'; url: string; realtime?: any; name?: string; _collection?: string }`
    - `useRealtimeTabs()` returns: `{ tabs, activeTabId, activeTab, addTab, closeTab, updateTab, setActiveTabId }`
    - Persists to `reqly.realtimeTabs` (300ms debounce), reads from localStorage on init
    - Default: `[{ id: 'rt-default', protocol: 'websocket', url: '', tabName: 'New WebSocket' }]`
    - `addTab(protocol)`: `id: 'rt-' + Date.now()`, sensible `tabName` per protocol
    - `closeTab(id)`: never closes last tab, activates neighbour
  - **File: `src/ui/src/components/RealtimeTabBar.tsx`** (NEW, <100 lines)
    - Props: `{ tabs: RealtimeTab[]; activeTabId: string; onSelect: (id) => void; onClose: (id) => void; onNew: (protocol) => void }`
    - 40px height, `surface-1` bg, `var(--border)` bottom - identical to REST tab bar in App.tsx
    - Each tab: `requestBadgeInfo(tab.protocol, undefined)` badge + name + X button
    - `+` dropdown: WebSocket / SSE / Socket.IO / MQTT options
    - Active: `h-0.5 bg-blue-500` absolute bottom

- [ ] **T-190** UI: `RealtimeCollectionsPanel`
  - **File: `src/ui/src/components/RealtimeCollectionsPanel.tsx`** (NEW, <150 lines)
  - Props: `{ activeProtocol: string; onSelectRequest: (req: any, col: string) => void; onNewTab: (protocol: string) => void }`
  - Fetches collections on mount via `fetchCollections()`, re-fetches on `reqly-reload` window event
  - Filters per collection: only show requests where `req.type` in `['websocket','sse','socketio','mqtt']`
  - Groups by collection, collapsible (same styling as `CollectionsPanel` - `surface-2` header, `var(--border)` dividers, chevron toggle)
  - `useLocalStorage('reqly.realtimeExpanded', {})` for expand/collapse state per collection
  - Each row: `requestBadgeInfo(req.type, undefined)` badge + name, click → `onSelectRequest`
  - Top: search input + "New" dropdown button (opens protocol picker: WS / SSE / SIO / MQTT)
  - Empty state: "No realtime requests saved yet" + hint to click "New" above

- [ ] **T-191** UI: WebSocketPanel + SSEPanel (browser-native APIs, no server proxy)
  - **File: `src/ui/src/components/WebSocketPanel.tsx`** (NEW, <180 lines)
  - Props: `{ tab: RealtimeTab; onTabUpdate: (updates: Partial<RealtimeTab>) => void; onSave: () => void }`
  - State: `status: 'disconnected'|'connecting'|'connected'`, `messages: UIRealtimeMessage[]`, `messageText: string`, `subTab: 'communication'|'protocols'`
  - Connection: `const wsRef = useRef<WebSocket | null>(null)` - uses **native browser `WebSocket`** API directly (zero packages)
    - `connect()`: `wsRef.current = new WebSocket(tab.url, tab.realtime?.protocols ?? [])`. Status to `'connecting'`, info log "Connecting...". `ws.onopen` → connected. `ws.onmessage` → server message. `ws.onerror` → error log. `ws.onclose` → disconnected.
    - `send()`: `wsRef.current?.send(messageText)`, add client message to log
    - `disconnect()`: `wsRef.current?.close()`
  - Cleanup on unmount: `wsRef.current?.close()`
  - Layout (flex column, fills height):
    - URL bar row (8px padding, `surface-2` bg, `var(--border)` bottom): URL input (disabled connected), Bookmark icon (onSave), Connect/Disconnect button
    - Sub-tab pills: Communication / Protocols
    - Communication: CodeMirror `minHeight: 80px`, JSON/Raw type picker, Send button (disabled disconnected/empty)
    - Protocols sub-tab: list of protocol string inputs (add/remove rows) → `onTabUpdate({ realtime: { ...tab.realtime, protocols: [...] } })`
    - `<RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />` (flex-1 min-h-0)
  - **File: `src/ui/src/components/SSEPanel.tsx`** (NEW, <110 lines)
  - Props: same shape as WebSocketPanel
  - Connection: `const evsRef = useRef<EventSource | null>(null)` - uses **native browser `EventSource`** (zero packages)
    - `start()`: `new EventSource(tab.url)`. `evs.onopen` → started. `evs.addEventListener(eventType, handler)` → server messages. `evs.onerror` → error, auto-stop.
    - `stop()`: `evsRef.current?.close()`
  - Layout: URL + Event Type input row + Start/Stop button, then `<RealtimeMessageLog>` fills rest

- [ ] **T-192** UI: SocketIOPanel + MQTTPanel (browser-build packages in `src/ui/package.json`)
  - **npm install in `src/ui/`** (before writing any component):
    - `cd src/ui && npm install socket.io-client mqtt`
    - These are browser-compatible builds. Confirm they appear in `src/ui/package.json` dependencies. Do NOT add to root `package.json`.
  - **File: `src/ui/src/components/SocketIOPanel.tsx`** (NEW, <180 lines)
  - Import: `import { io } from 'socket.io-client'` (browser build, no `.js` extension needed for npm packages)
  - `const socketRef = useRef<ReturnType<typeof io> | null>(null)`
  - Connect: `io(tab.url, { path: tab.realtime?.path ?? '/socket.io', ...(authType === 'bearer' ? { auth: { token } } : {}) })`
  - Listen: `socket.onAny((eventName, data) => ...)` to capture all events
  - Send: `socket.emit(eventName, messageText)`
  - Layout: URL row + config row (path, version pills v4/v3/v2, auth picker) + event+message section + `<RealtimeMessageLog>`
  - **File: `src/ui/src/components/MQTTPanel.tsx`** (NEW, <160 lines)
  - Import: `import mqtt from 'mqtt'` (browser build uses WebSocket transport automatically when URL is `ws://` or `wss://`)
  - `const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null)`
  - Connect: `mqtt.connect(tab.url, { clientId: tab.realtime?.mqttClientId ?? crypto.randomUUID().slice(0,8), username, password, keepalive, clean })`
  - Events: `client.on('connect')`, `client.on('message', (topic, buf) => ...)`, `client.on('error')`, `client.on('close')`
  - Layout: URL + Client ID row + collapsible config (username, password, keepalive, clean) + subscribe section (topic input, QoS 0/1/2 pills, Subscribe button, list of active subscriptions each with Unsubscribe) + publish section (topic input, retain checkbox, CodeMirror editor, Publish button) + `<RealtimeMessageLog>` fills rest
  - Split subscribe + publish into inline sub-sections within the file (no separate files needed if total < 180 lines)

- [ ] **T-193** UI: `RealtimeWorkspace` shell + save/load + state persistence
  - **File: `src/ui/src/components/RealtimeWorkspace.tsx`** (NEW, <160 lines)
  - Props: `{ initialRequest?: any; onUpdate?: (state: any) => void }`
  - Uses `useRealtimeTabs()` from T-189
  - Sidebar-click handling: `useRef` identity check (`_collection::name`) → `updateTab(activeTabId, { url, protocol, realtime, name, _collection })` if same tab or `addTab` if new
  - Debounced `onUpdate?.(activeTab)` (600ms) for refresh persistence
  - Layout: `flex` `h-full`
    - Left aside `w-64`: `<RealtimeCollectionsPanel onSelectRequest={handleSidebarSelect} onNewTab={protocol => addTab(protocol)} activeProtocol={activeTab.protocol} />`
    - Right `flex-1 flex flex-col`:
      - `<RealtimeTabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} onNew={addTab} />`
      - Protocol panel `flex-1 min-h-0`: switch on `activeTab.protocol` → `<WebSocketPanel>` / `<SSEPanel>` / `<SocketIOPanel>` / `<MQTTPanel>`. Pass `tab={activeTab}`, `onTabUpdate={u => updateTab(activeTabId, u)}`, `onSave={handleSave}`.
  - **Save flow**: `handleSave()`:
    - Already saved (`activeTab._collection && activeTab.name`): calls `updateRequest(col, name, { type: activeTab.protocol, url: activeTab.url, name: activeTab.name, realtime: activeTab.realtime })` from `../api`, flashes inline "Saved" for 2s.
    - Not saved: shows modal (collection select + name input). On submit: `addRequest(col, { type: activeTab.protocol, url, name, realtime: config })`. On success: `updateTab(activeTabId, { name, _collection: col })`, dispatch `reqly-reload`, close modal.
  - **Collection YAML guard**: Check `src/engine/collection-manager.ts` - if `addRequest` validates/filters `method` and rejects non-HTTP-method values, fix the guard to allow realtime types. The `type` field should be preserved as-is in YAML.
  - **After all sub-tasks**: `npm test` (all pass), `npm run build` in `src/ui/`, copy `dist/ui/` → `dist/ui`, restart. Manual tests:
    1. Open Realtime workspace → WebSocket tab → connect `wss://echo.websocket.org` → send "hello" → see echo in log
    2. SSE tab → connect `https://sse.dev/test` → see streaming events
    3. Save a WebSocket request to a collection → refresh page → same tab visible → click in Collections panel → routes to Realtime workspace
    4. MCP: call `run_realtime` with `type: websocket`, `url: wss://echo.websocket.org`, `sendMessages: [{message: "ping"}]`, `captureTimeout: 3` → returns `{ messages: [{source: 'server', payload: 'ping'}], truncated: false }`

### Protocol Expansion (Later)

- [ ] **T-151** ~~WebSocket / SSE support~~ - superseded by T-185 to T-193 above
