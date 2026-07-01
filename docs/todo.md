# Reqly - Todo

## Queue

### M6 - Script Power + Developer UX

### M7 - Data & CI Power

### GraphQL Polish


### Realtime Workspace Epic (T-185 through T-195)

> **Architecture mandate (read before writing a single line of code):**
> Reqly is headless and MCP-first. The browser UI is a visual wrapper - it never opens a raw WebSocket, EventSource, or MQTT connection itself. Instead:
> 1. Engine classes in `src/engine/` manage the actual protocol connections on the Node.js server.
> 2. MCP tools in `src/mcp/tools/` expose those engine classes to agents.
> 3. Express routes in `src/server/express.ts` expose the same engine classes to the browser UI via REST + SSE push.
> 4. The browser UI calls the Express routes and renders whatever the server returns - zero protocol-specific npm packages in `src/ui/`.
>
> This is identical to how gRPC works: `grpc-streaming.ts` (engine) → `run_request.ts` (MCP) → `express.ts /api/run/adhoc` (REST) → `GrpcWorkspace.tsx` (UI calls `/api/run/adhoc`).
>
> For realtime, connections are long-lived (not request/response), so the server holds a `RealtimeSessionStore` in memory. The browser polls or receives SSE pushes of new messages. Agents call MCP tools to connect, send, receive, and disconnect.
>
> **Correct data flow**:
> ```
> Agent / UI
>   → POST /api/realtime/connect   (or MCP connect_realtime)
>   → engine: RealtimeSessionManager.connect(type, url, config) → sessionId
>   → GET  /api/realtime/:id/messages  (poll or SSE stream of new messages)
>   → POST /api/realtime/:id/send      (or MCP send_realtime_message)
>   → POST /api/realtime/:id/disconnect (or MCP disconnect_realtime)
> ```
>
> **Key paths**:
> - Types: `src/types/request.ts`
> - Engine: `src/engine/` - new files per protocol
> - MCP tools: `src/mcp/tools/`
> - Server: `src/server/express.ts`
> - UI components: `src/ui/src/components/`
> - UI hooks: `src/ui/src/hooks/`
> - UI API client: `src/ui/src/api.ts`
> - Colors/badges: `src/ui/src/lib/colors.ts`
>
> **Existing patterns to follow**:
> - TDD for all engine + MCP code (`src/engine/*.test.ts`, `src/mcp/tools/*.test.ts`)
> - All local imports end in `.js` even when the source is `.ts`
> - Tab persistence: debounced `localStorage.setItem` + `useState(() => rehydrate())` pattern from `App.tsx`
> - `onUpdate` propagation: see `GrpcWorkspace` → `setGrpcRequest` in `App.tsx`
> - Badge system: `requestBadgeInfo()` in `src/ui/src/lib/colors.ts`

- [ ] **T-185** Realtime request types and config interface (types-only, no logic)
  - **File: `src/types/request.ts`**
    - Extend `RequestConfig.type` union: `'rest' | 'graphql' | 'graphql-subscription' | 'grpc' | 'websocket' | 'sse' | 'socketio' | 'mqtt'`
    - Add `RealtimeConfig` interface next to `GrpcConfig`:
      ```ts
      export interface RealtimeConfig {
        /** WebSocket subprotocols */
        protocols?: string[];
        /** SSE event type to listen on (default: 'message') */
        eventType?: string;
        /** Socket.IO path (default: '/socket.io') */
        path?: string;
        /** Socket.IO client version */
        clientVersion?: 'v2' | 'v3' | 'v4';
        /** Socket.IO / MQTT auth */
        authType?: 'none' | 'bearer';
        authToken?: string;
        /** MQTT client ID (default: random) */
        mqttClientId?: string;
        mqttUsername?: string;
        mqttPassword?: string;
        mqttKeepalive?: number;
        mqttCleanSession?: boolean;
        /** MQTT last-will */
        mqttWillTopic?: string;
        mqttWillMessage?: string;
        mqttWillQos?: 0 | 1 | 2;
        mqttWillRetain?: boolean;
        /** MQTT subscribed topics (persisted per collection) */
        mqttTopics?: { name: string; qos: 0 | 1 | 2 }[];
        /** Seconds to buffer messages before returning (for MCP agent use, default: 5) */
        captureTimeout?: number;
      }
      ```
    - Add `realtime?: RealtimeConfig` to `RequestConfig` (next to `grpc?: GrpcConfig`)
  - **File: `src/ui/src/lib/colors.ts`**
    - Add four new cases to `requestBadgeInfo()`:
      - `'websocket'`: label `'WS'`, style `{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }`
      - `'sse'`: label `'SSE'`, style `{ background: 'rgba(20,184,166,0.15)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.3)' }`
      - `'socketio'`: label `'SIO'`, style `{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }`
      - `'mqtt'`: label `'MQTT'`, style `{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }`
  - **TDD**: Unit test `requestBadgeInfo` for all four new types. Run `npm test`.

- [ ] **T-186** Engine: RealtimeSessionManager - server-side connection lifecycle
  - **File: `src/engine/realtime-session-manager.ts`** (NEW, <180 lines)
  - This is the heart of the feature. Runs in Node.js. Manages live connections to WebSocket, SSE, Socket.IO, and MQTT servers on behalf of the user. Never imported by `src/ui/`.
  - npm packages for the SERVER (add to root `package.json`, not `src/ui/package.json`):
    - `ws` (WebSocket client for Node.js)
    - `eventsource` (SSE client for Node.js)
    - `socket.io-client` (Socket.IO)
    - `mqtt` (MQTT over WebSocket)
  - **`RealtimeMessage` type** (export from this file):
    ```ts
    export interface RealtimeMessage {
      id: string;        // crypto.randomUUID()
      ts: number;        // Date.now()
      source: 'client' | 'server' | 'info' | 'error';
      payload: string;   // always stringified
      topic?: string;    // MQTT topic
      event?: string;    // Socket.IO event name
    }
    ```
  - **`RealtimeSession` type** (export):
    ```ts
    export interface RealtimeSession {
      id: string;
      type: 'websocket' | 'sse' | 'socketio' | 'mqtt';
      url: string;
      status: 'connecting' | 'connected' | 'disconnected' | 'error';
      messages: RealtimeMessage[];   // append-only ring buffer (max 1000)
      truncated: boolean;
      createdAt: number;
      onMessage?: (msg: RealtimeMessage) => void;  // set by SSE broadcaster
    }
    ```
  - **`RealtimeSessionManager` class**:
    - `private sessions = new Map<string, RealtimeSession>()`
    - `connect(type, url, config: RealtimeConfig): Promise<string>` - creates session, opens connection, returns `sessionId`. Resolves after first status event (connected or error). Rejects on connection failure.
      - WebSocket: `new WebSocket(url, config.protocols)` using `ws` package
      - SSE: `new EventSource(url)` using `eventsource` package; listens on `config.eventType ?? 'message'`
      - Socket.IO: `io(url, { path: config.path, auth: ... })` using `socket.io-client`
      - MQTT: `mqtt.connect(url, { clientId, username, password, keepalive, clean })` using `mqtt` package
    - `send(sessionId, message, options?: { eventName?: string; topic?: string; retain?: boolean }): void` - sends a message on the live connection. Throws if session not found or not connected.
    - `subscribe(sessionId, topic, qos): void` - MQTT-only. Throws for other types.
    - `unsubscribe(sessionId, topic): void` - MQTT-only.
    - `getMessages(sessionId, since?: number): RealtimeMessage[]` - returns messages after `since` timestamp (for polling). Returns all if `since` not provided.
    - `disconnect(sessionId): void` - closes connection, sets status `'disconnected'`, keeps session in map for 60s then removes.
    - `getSession(sessionId): RealtimeSession | undefined`
    - `listSessions(): RealtimeSession[]`
    - On each inbound message: push to `session.messages` (if length > 1000, shift oldest, set `session.truncated = true`), call `session.onMessage?.(msg)`.
  - **File: `src/engine/realtime-session-manager.test.ts`** (NEW, <150 lines)
    - Mock `ws`, `eventsource`, `socket.io-client`, `mqtt` with vi.mock - simulate connect/message/error events
    - Test: `connect('websocket', ...)` resolves with sessionId; messages appear via `getMessages()`
    - Test: `send()` writes to mock socket; message logged as `source: 'client'`
    - Test: `disconnect()` closes mock socket, status becomes `'disconnected'`
    - Test: ring buffer truncates at 1000 messages, sets `truncated: true`
    - Test: `connect()` with bad URL rejects with error
    - Run `npm test` - all existing + new tests pass.

- [ ] **T-187** Engine: context wiring + Express REST routes for realtime sessions
  - **File: `src/mcp/tools/types.ts`** (EDIT)
    - Import `RealtimeSessionManager` from `'../../engine/realtime-session-manager.js'`
    - Add `realtimeSessionManager: RealtimeSessionManager` to `EngineContext` interface
  - **File: `src/server/index.ts`** (EDIT)
    - Instantiate `new RealtimeSessionManager()` and inject into `EngineContext`
  - **File: `src/server/express.ts`** (EDIT - add routes only, <80 new lines)
    - All routes under `/api/realtime/`:
    - `POST /api/realtime/connect` body: `{ type, url, config }` → calls `context.realtimeSessionManager.connect(...)` → `res.json({ sessionId, status })`
    - `GET  /api/realtime/:sessionId` → `res.json(context.realtimeSessionManager.getSession(id))` (status, type, url, message count)
    - `GET  /api/realtime/:sessionId/messages?since=<ts>` → `res.json({ messages: [...], truncated })`
    - `GET  /api/realtime/:sessionId/stream` → SSE endpoint. Sets headers for SSE (`text/event-stream`). Sets `session.onMessage = msg => res.write('data: ...\n\n')`. Cleans up `session.onMessage` on `req.on('close')`. This is how the UI gets live push instead of polling.
    - `POST /api/realtime/:sessionId/send` body: `{ message, eventName?, topic?, retain? }` → calls `context.realtimeSessionManager.send(...)` → `res.json({ ok: true })`
    - `POST /api/realtime/:sessionId/subscribe` body: `{ topic, qos }` → MQTT subscribe → `res.json({ ok: true })`
    - `POST /api/realtime/:sessionId/disconnect` → `context.realtimeSessionManager.disconnect(id)` → `res.json({ ok: true })`
    - `GET  /api/realtime` → `res.json(context.realtimeSessionManager.listSessions())`
    - All routes return `{ error: string }` with status 400/404 on failure.
  - **TDD**: Integration tests for the Express routes using supertest (follow pattern in existing express tests). Test connect→send→messages→disconnect lifecycle. Run `npm test`.

- [ ] **T-188** MCP tools: connect_realtime, send_realtime_message, read_realtime_messages, disconnect_realtime
  - Four new files in `src/mcp/tools/`. Follow the exact pattern of `run-request.ts` and `src/mcp/tools/types.ts`.
  - **File: `src/mcp/tools/realtime-connect.ts`** (NEW, <80 lines)
    - Tool name: `connect_realtime`
    - Description (agents read this): "Opens a persistent connection to a WebSocket, SSE, Socket.IO, or MQTT server and returns a sessionId. Use this when you need to test a realtime endpoint, subscribe to a message stream, or verify protocol handshake. Supported types: 'websocket' (ws:// or wss://), 'sse' (http:// or https://), 'socketio' (http:// or https://), 'mqtt' (mqtt:// or ws://). Returns { sessionId, status, type, url }. After connecting, use read_realtime_messages to fetch messages and send_realtime_message to send. Always call disconnect_realtime when done."
    - Input schema: `{ type: enum['websocket','sse','socketio','mqtt'], url: string, config?: { protocols?, eventType?, path?, clientVersion?, authType?, authToken?, mqttClientId?, mqttUsername?, mqttPassword?, captureTimeout? } }`
    - Handler: calls `context.realtimeSessionManager.connect(args.type, args.url, args.config ?? {})`, returns `{ content: [{ type: 'text', text: JSON.stringify({ sessionId, status, type: args.type, url: args.url }) }] }`
  - **File: `src/mcp/tools/realtime-send.ts`** (NEW, <70 lines)
    - Tool name: `send_realtime_message`
    - Description: "Sends a message on an active realtime session opened by connect_realtime. For WebSocket and SSE: provide message as a string. For Socket.IO: provide message and eventName. For MQTT: provide message and topic (required). Returns { ok: true } on success."
    - Input schema: `{ sessionId: string, message: string, eventName?: string, topic?: string, retain?: boolean }`
    - Handler: `context.realtimeSessionManager.send(sessionId, message, { eventName, topic, retain })`
  - **File: `src/mcp/tools/realtime-messages.ts`** (NEW, <70 lines)
    - Tool name: `read_realtime_messages`
    - Description: "Returns messages buffered from a realtime session. Provide since (Unix ms timestamp) to fetch only new messages since last read. Returns { messages: [{ id, ts, source, payload, topic?, event? }], truncated, status }. source is 'client' (messages you sent), 'server' (messages received), 'info' (connection events), or 'error'. Poll this repeatedly to stream messages, or use it once after a captureTimeout to get a batch."
    - Input schema: `{ sessionId: string, since?: number }`
    - Handler: `context.realtimeSessionManager.getMessages(sessionId, args.since)` + getSession status
  - **File: `src/mcp/tools/realtime-disconnect.ts`** (NEW, <50 lines)
    - Tool name: `disconnect_realtime`
    - Description: "Closes a realtime session and cleans up the connection. Always call this when done. Returns { ok: true, messageCount: number }."
    - Input schema: `{ sessionId: string }`
    - Handler: gets message count, calls `context.realtimeSessionManager.disconnect(sessionId)`, returns summary
  - **Register all four** in `src/mcp/server.ts` (add to tools array)
  - **TDD**: Test each tool's `definition` (name, description non-empty, required schema fields) and `handler` (mock context.realtimeSessionManager, test success and error paths). Run `npm test`.

- [ ] **T-189** UI: api.ts client functions for realtime routes
  - **File: `src/ui/src/api.ts`** (EDIT - add functions only)
  - Add to the existing API client (follow the pattern of existing functions like `fetchCollections`, `addRequest`):
    ```ts
    export async function realtimeConnect(type: string, url: string, config?: Record<string, unknown>): Promise<{ sessionId: string; status: string }> { ... }
    export async function realtimeSend(sessionId: string, message: string, opts?: { eventName?: string; topic?: string; retain?: boolean }): Promise<void> { ... }
    export async function realtimeGetMessages(sessionId: string, since?: number): Promise<{ messages: any[]; truncated: boolean; status: string }> { ... }
    export async function realtimeDisconnect(sessionId: string): Promise<void> { ... }
    export async function realtimeSubscribe(sessionId: string, topic: string, qos: number): Promise<void> { ... }
    export async function realtimeUnsubscribe(sessionId: string, topic: string): Promise<void> { ... }
    ```
  - Each function: `fetch('/api/realtime/...')`, throw on non-OK, return parsed JSON.
  - For SSE streaming, export a helper: `openRealtimeStream(sessionId: string, onMessage: (msg: any) => void): () => void` - opens `new EventSource('/api/realtime/:id/stream')`, attaches `onmessage`, returns a cleanup function that calls `evs.close()`. This is a plain browser EventSource pointing at the Reqly local server (port 4242), NOT at the user's external target.
  - No TDD needed for pure HTTP wrapper functions, but run `npm test` to confirm no regressions.

- [ ] **T-190** UI: Nav rail, App.tsx routing, shared log components
  - **File: `src/ui/src/components/NavRail.tsx`** (EDIT)
    - Add `'realtime'` to `NavPanel` type
    - Import `Wifi` from `lucide-react`
    - Add `{ id: 'realtime', label: 'Realtime', icon: <Wifi size={18} /> }` between `grpc` and `capture`
  - **File: `src/ui/src/App.tsx`** (EDIT)
    - `const [realtimeRequest, setRealtimeRequest] = useLocalStorage<any>('reqly.realtimeRequest', null)`
    - In `handleSelectRequestFromSidebar`: if `req.type` in `['websocket','sse','socketio','mqtt']` → `setRealtimeRequest({ ...req, _collection: col }); setActivePanel('realtime')`
    - Sidebar visibility: add `activePanel !== 'realtime'` to the hide condition
    - Panel routing: add `activePanel === 'realtime' ? <RealtimeWorkspace initialRequest={realtimeRequest} onUpdate={setRealtimeRequest} />` in the chain
  - **File: `src/ui/src/components/RealtimeMessageLog.tsx`** (NEW, <130 lines)
    - Pure display component - receives messages from parent, renders them. No connection logic.
    - Props: `{ messages: RealtimeMessage[]; onClear: () => void }` (import `RealtimeMessage` from `'../../../src/engine/realtime-session-manager'` - no, wrong: define a mirror type in `../types.ts` or inline it)
    - Actually: define `export interface UIRealtimeMessage { id: string; ts: number; source: 'client'|'server'|'info'|'error'; payload: string; topic?: string; event?: string }` at the top of this file (mirrors server type but lives in UI layer)
    - Header: `panel-header` class, title "Messages", right side: Trash (clear) icon, scroll-top icon, scroll-bottom icon, auto-scroll toggle (green = on)
    - Body: `flex-1 min-h-0 overflow-y-auto` with auto-scroll via `useRef` + `useEffect` on `messages.length`
    - Each row (inline, no separate file needed if under 200 total):
      - Icon: `ArrowUpRight` amber for client, `ArrowDownLeft` teal for server, `Info` muted for info, `AlertCircle` red for error
      - Prefix: `[topic]` or `[event]` in muted text if present
      - Payload: truncated by default, click to expand
      - Timestamp: `HH:MM:SS` right-aligned
      - Copy on hover
    - Empty state: "Connect to see messages" italic muted centered
  - Run `npm test`.

- [ ] **T-191** UI: RealtimeCollectionsPanel + RealtimeTabBar + useRealtimeTabs
  - **File: `src/ui/src/components/RealtimeCollectionsPanel.tsx`** (NEW, <150 lines)
    - Props: `{ onSelectRequest: (req: any, col: string) => void }`
    - Fetches collections on mount (via `fetchCollections()` from `../api`), re-fetches on `reqly-reload` window event
    - Filters: only shows requests where `req.type` in `['websocket','sse','socketio','mqtt']`
    - Groups by collection, collapsible headers (same styling as `CollectionsPanel` - `surface-2` bg, `var(--border)` divider)
    - Each row: `requestBadgeInfo(req.type, undefined)` badge + name, onClick → `onSelectRequest`
    - `useLocalStorage('reqly.realtimeExpanded', {})` for expand state
    - Search bar top: filters names
    - Empty state: "No realtime requests yet" muted
  - **File: `src/ui/src/hooks/useRealtimeTabs.ts`** (NEW, <150 lines)
    - `RealtimeTab` type: `{ id, tabName?, protocol, url, realtime?, name?, _collection?, sessionId? }`
    - `sessionId` is the live session ID returned by `realtimeConnect()` - stored per tab so UI can reconnect to a still-live session on remount
    - Persists to `reqly.realtimeTabs` (debounced 300ms). Does NOT persist `sessionId` (sessions are in-memory server-side; on reload, starts disconnected).
    - `addTab(protocol)`, `closeTab(id)`, `updateTab(id, updates)`, `activeTab`
    - Default tab: `{ id: 'rt-default', protocol: 'websocket', url: '', tabName: 'New WebSocket' }`
  - **File: `src/ui/src/components/RealtimeTabBar.tsx`** (NEW, <100 lines)
    - Props: `{ tabs, activeTabId, onSelect, onClose, onNew }`
    - 40px height, `surface-1` bg, `var(--border)` bottom border - identical to REST tab bar
    - Each tab: `requestBadgeInfo(tab.protocol, undefined)` badge + `tab.tabName` + X button
    - `+` button opens protocol picker popover: WebSocket, SSE, Socket.IO, MQTT options
    - Active tab: `h-0.5 bg-blue-500` bottom underline bar

- [ ] **T-192** UI: WebSocketPanel + SSEPanel (call server-side sessions via api.ts)
  - **File: `src/ui/src/components/WebSocketPanel.tsx`** (NEW, <190 lines)
  - Props: `{ tab: RealtimeTab; onTabUpdate: (updates) => void }`
  - State: `status: 'disconnected'|'connecting'|'connected'`, `messages: UIRealtimeMessage[]`, `messageText: string`, `subTab: 'communication'|'protocols'`
  - **Connect**: calls `realtimeConnect('websocket', tab.url, { protocols: tab.realtime?.protocols })` from `../api` → gets `sessionId` → `onTabUpdate({ sessionId })` → opens SSE stream via `openRealtimeStream(sessionId, msg => setMessages(prev => [...prev, msg]))` (the SSE stream from the Reqly server at port 4242, NOT the user's WebSocket server). Store cleanup fn in `useRef`.
  - **Send**: calls `realtimeSend(tab.sessionId!, messageText)` → new message appears via SSE push
  - **Disconnect**: calls `realtimeDisconnect(tab.sessionId!)`, calls SSE cleanup fn, clears `sessionId`
  - Layout (flex column, fills parent height):
    - URL bar row (8px padding, `surface-2` bg, `var(--border)` bottom): URL input (disabled when connected), Connect/Disconnect button (neon blue border when disconnected, red when connected)
    - Sub-tab bar: Communication / Protocols pills
    - Communication: CodeMirror `minHeight: 80px`, JSON/Raw picker, Send button
    - Protocols tab: list of text inputs for WS subprotocols (add/remove), changes → `onTabUpdate`
    - `<RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />` (flex-1)
  - Cleanup on unmount: disconnect if connected, close SSE stream
  - **File: `src/ui/src/components/SSEPanel.tsx`** (NEW, <120 lines)
  - Same pattern but: `realtimeConnect('sse', url, { eventType })`, no send UI, only Start/Stop button. Messages arrive via `openRealtimeStream`.

- [ ] **T-193** UI: SocketIOPanel + MQTTPanel (call server-side sessions via api.ts)
  - **File: `src/ui/src/components/SocketIOPanel.tsx`** (NEW, <190 lines)
  - Same connect/send/disconnect pattern via `api.ts`. Config: path, clientVersion (v4/v3/v2 pills), auth (None/Bearer). Event name input + CodeMirror editor for message body. `<RealtimeMessageLog>` for messages.
  - **File: `src/ui/src/components/MQTTPanel.tsx`** (NEW, <170 lines)
  - Connect config: URL, client ID, collapsible section (username, password, keepalive, clean session).
  - **File: `src/ui/src/components/MQTTSubscribePanel.tsx`** (NEW, <90 lines)
  - Topic input, QoS picker, Subscribe button, list of active subscriptions each with Unsubscribe. Calls `realtimeSubscribe` / `realtimeUnsubscribe` from `../api`.
  - **File: `src/ui/src/components/MQTTPublishPanel.tsx`** (NEW, <90 lines)
  - Topic input, Retain checkbox, CodeMirror editor, Publish button. Calls `realtimeSend(sessionId, message, { topic, retain })`.

- [ ] **T-194** UI: RealtimeWorkspace shell + save/load + state persistence
  - **File: `src/ui/src/components/RealtimeWorkspace.tsx`** (NEW, <160 lines)
  - Props: `{ initialRequest?: any; onUpdate?: (state: any) => void }`
  - Uses `useRealtimeTabs()` from T-191
  - Reacts to `initialRequest` prop changes (sidebar click) via `useRef` identity check (`collection::name`)
  - Debounced `onUpdate?.(activeTab)` for App.tsx refresh persistence
  - Layout: `flex h-full`
    - Left aside: `w-64` `<RealtimeCollectionsPanel>`
    - Right `flex-1 flex flex-col`:
      - `<RealtimeTabBar>`
      - Protocol panel (`flex-1 min-h-0`): switch on `activeTab.protocol` → one of the four panel components
  - **Save flow**: Bookmark button in each panel's URL bar row calls `onSave?.()` on parent. RealtimeWorkspace handles:
    - Already saved (`tab._collection && tab.name`): calls `updateRequest(col, name, { type: protocol, url, realtime: config })` from `../api`, shows inline "Saved" flash. Pattern matches `GrpcWorkspace.handleSave`.
    - Not saved: shows save modal (collection picker + name input), calls `addRequest(col, { type: protocol, url, name, realtime: config })`, dispatches `reqly-reload`.
  - **Collection YAML**: Verify `CollectionManager` does not filter out non-HTTP methods. If it does, fix the guard so `type: 'websocket'` round-trips through `getCollection()` and `addRequest()`.
  - **After all sub-tasks**: `npm test` (all tests pass), `npm run build` in `src/ui/`, copy to `dist/ui/`, restart server. Manual test: open Realtime workspace → connect to `wss://echo.websocket.org` (or a local echo server) → send "hello" → see "hello" echoed back in the message log. Save to a collection. Open MCP client and call `connect_realtime` + `read_realtime_messages` + `disconnect_realtime`. Verify agent and UI both see messages from the same session.


### Protocol Expansion (Later)

- [ ] **T-151** ~~WebSocket / SSE support ("Realtime" workspace)~~ - superseded by T-185 through T-194 above

