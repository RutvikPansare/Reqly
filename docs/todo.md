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
