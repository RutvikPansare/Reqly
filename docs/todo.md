# Reqly - Todo

## Queue

### M6 - Script Power + Developer UX

### M7 - Data & CI Power

### GraphQL Polish


### Realtime Workspace Epic (T-185 through T-195)

> All tasks in this epic build toward the "Realtime" workspace: a dedicated nav-rail panel for WebSocket, SSE, Socket.IO, and MQTT connections. Tasks are ordered by dependency - implement them in sequence. Each component must stay under 200 lines. Reuse all existing CSS variables, classes, and hooks from the REST workspace.
>
> Visual reference: `example/hoppscotch/packages/hoppscotch-common/src/components/realtime/` and `src/pages/realtime/`. Do NOT copy Vue code - translate patterns to React using Reqly's existing UI conventions.
>
> **Key paths**:
> - Types: `src/types/request.ts`
> - Engine: `src/engine/`
> - MCP tools: `src/mcp/tools/`
> - Server: `src/server/express.ts`
> - UI components: `src/ui/src/components/`
> - UI hooks: `src/ui/src/hooks/`
> - UI API client: `src/ui/src/api.ts`
> - Colors/badges: `src/ui/src/lib/colors.ts`
> - App shell: `src/ui/src/App.tsx`
> - Nav rail: `src/ui/src/components/NavRail.tsx`
>
> **Existing patterns to follow precisely**:
> - Tab persistence: see how `reqly.tabs` and `reqly.activeTabId` work in `App.tsx` with `useState(() => rehydrate())` + debounced `localStorage.setItem`. Mirror this exactly.
> - Panel routing: see how `activePanel === 'grpc'` routes to `<GrpcWorkspace>` in `App.tsx`. Mirror for 'realtime'.
> - Badge system: `requestBadgeInfo()` in `src/ui/src/lib/colors.ts` - add new cases and reuse `METHOD_BADGE_BASE`.
> - Sidebar open/close: `useLocalStorage('reqly.collectionsExpanded', {})` pattern in `CollectionsPanel.tsx`.
> - Import extension: ALL local imports end in `.js` even when the source is `.ts`.
> - `onUpdate` propagation: see how `GrpcWorkspace` calls `onUpdate?.(state)` to keep App's `reqly.grpcRequest` in sync for refresh persistence.

- [ ] **T-185** Realtime request types, config interface, and badge colors
  - **File: `src/types/request.ts`**
    - Extend `RequestConfig.type` union to include `'websocket' | 'sse' | 'socketio' | 'mqtt'`
    - Add `RealtimeConfig` interface next to `GrpcConfig`:
      ```ts
      export interface RealtimeConfig {
        // WebSocket-only: list of subprotocol strings
        protocols?: string[];
        // SSE-only: event type to listen on (default 'message')
        eventType?: string;
        // Socket.IO-only: URL path (default '/socket.io'), client version, optional bearer token
        path?: string;
        clientVersion?: 'v2' | 'v3' | 'v4';
        authType?: 'none' | 'bearer';
        authToken?: string;
        // MQTT-only: client ID (default random), connection options
        mqttClientId?: string;
        mqttUsername?: string;
        mqttPassword?: string;
        mqttKeepalive?: number;
        mqttCleanSession?: boolean;
        // MQTT-only: last-will config
        mqttWillTopic?: string;
        mqttWillMessage?: string;
        mqttWillQos?: 0 | 1 | 2;
        mqttWillRetain?: boolean;
        // MQTT-only: list of topics currently subscribed (persisted in collection)
        mqttTopics?: { name: string; qos: 0 | 1 | 2 }[];
      }
      ```
    - Add optional `realtime?: RealtimeConfig` field to `RequestConfig` (next to `grpc?: GrpcConfig`)
  - **File: `src/ui/src/lib/colors.ts`**
    - Add four new cases to `requestBadgeInfo()` before the `default` case:
      - `'websocket'`: label `'WS'`, style `{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }`
      - `'sse'`: label `'SSE'`, style `{ background: 'rgba(20,184,166,0.15)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.3)' }`
      - `'socketio'`: label `'SIO'`, style `{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }`
      - `'mqtt'`: label `'MQTT'`, style `{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }`
  - **TDD**: Write tests in `src/types/` (or alongside the colors file) verifying `requestBadgeInfo` returns correct labels and styles for all four new types. Run `npm test` to confirm all existing tests still pass.

- [ ] **T-186** Nav rail + App.tsx routing for Realtime workspace
  - **File: `src/ui/src/components/NavRail.tsx`**
    - Add `'realtime'` to the `NavPanel` export type: `'collections' | 'environments' | 'history' | 'graphql' | 'grpc' | 'realtime' | 'flows' | 'capture' | 'settings'`
    - Import `Wifi` from `lucide-react` (already imported in NavRail if using newer version; if not, add it)
    - Add a new `NavItem` entry: `{ id: 'realtime', label: 'Realtime', icon: <Wifi size={18} /> }` positioned between `grpc` and `capture` in `NAV_ITEMS`
  - **File: `src/ui/src/App.tsx`**
    - Add `realtimeRequest` state using `useLocalStorage<any>('reqly.realtimeRequest', null)` alongside the existing `grpcRequest` and `graphqlRequest` states
    - Add `setActivePanel('realtime')` call inside `handleSelectRequestFromSidebar` when `req.type` is one of `['websocket', 'sse', 'socketio', 'mqtt']`, similar to how grpc requests are routed:
      ```ts
      if (['websocket', 'sse', 'socketio', 'mqtt'].includes(req.type)) {
        setRealtimeRequest({ ...req, _collection: col });
        setActivePanel('realtime');
      }
      ```
    - In the sidebar conditional, add `activePanel !== 'realtime'` to the condition that hides the sidebar (the condition currently reads `activePanel !== 'graphql' && activePanel !== 'grpc'`; extend it)
    - In the main panel routing chain, add a branch for `activePanel === 'realtime'` that renders `<RealtimeWorkspace initialRequest={realtimeRequest} onUpdate={setRealtimeRequest} />`. Import `RealtimeWorkspace` from `'./components/RealtimeWorkspace'`.
    - The rendering order in the conditional chain should be: graphql → grpc → realtime → flows → empty-state-nudge → tabs (REST editor)
  - No TDD needed for pure routing wiring, but run `npm test` to ensure no regressions.

- [ ] **T-187** RealtimeCollectionsPanel - filtered sidebar showing only realtime requests
  - **File: `src/ui/src/components/RealtimeCollectionsPanel.tsx`** (NEW, <150 lines)
  - Props: `{ onSelectRequest: (req: any, collectionName: string) => void }`
  - On mount: calls `fetchCollections()` from `../api` and stores result in local state. Re-fetches on `window.dispatchEvent(new Event('reqly-reload'))` by listening to that event (same pattern as `CollectionsPanel`).
  - Filters requests: for each collection, only show requests where `req.type` is one of `['websocket', 'sse', 'socketio', 'mqtt']`. Skip collections with zero matching requests entirely.
  - Renders a list of collection groups. Each group: a header row (same styling as `CollectionsPanel` collection headers - `background: var(--surface-2)`, `borderBottom: '1px solid var(--border)'`, collection name in semibold, chevron toggle to expand/collapse). Below the header: the filtered request rows.
  - Each request row: `requestBadgeInfo(req.type, req.method)` badge on the left, request name text, onClick calls `onSelectRequest(req, collection.name)`.
  - Expand/collapse state: `useLocalStorage('reqly.realtimeCollectionsExpanded', {})` - object keyed by collection name, value boolean.
  - Empty state (no realtime requests in any collection): centered text "No realtime requests saved yet" with muted color.
  - Search bar at top: filter input that searches request names and collection names.
  - "New Request" button at top-right: calls `onSelectRequest({ type: 'websocket', url: '', name: 'New Request' }, '')` to open a blank WebSocket tab.
  - Style: all rows use `var(--surface-1)` background, `var(--border)` dividers, same density as `CollectionsPanel` (12px vertical padding per row, 16px horizontal).

- [ ] **T-188** Realtime tab system: useRealtimeTabs hook + RealtimeTabBar component
  - **File: `src/ui/src/hooks/useRealtimeTabs.ts`** (NEW, <150 lines)
    - Defines `RealtimeTab` type:
      ```ts
      interface RealtimeTab {
        id: string;
        tabName?: string;
        protocol: 'websocket' | 'sse' | 'socketio' | 'mqtt';
        url: string;
        realtime?: RealtimeConfig; // from src/types/request.ts
        name?: string;            // saved request name
        _collection?: string;     // saved collection name
      }
      ```
    - Exports `useRealtimeTabs()` hook that manages:
      - `tabs: RealtimeTab[]` - initialized via `rehydrateRealtimeTabs()` from `localStorage.getItem('reqly.realtimeTabs')`. If empty, creates one default tab: `{ id: 'rt-default', protocol: 'websocket', url: '', tabName: 'New WebSocket' }`.
      - `activeTabId: string` - from `useLocalStorage('reqly.realtimeActiveTabId', '')`.
      - Debounced persist (300ms) to `reqly.realtimeTabs` whenever `tabs` changes.
      - `addTab(protocol)`: creates new tab with `id: 'rt-' + Date.now()`, `protocol`, `url: ''`, default `tabName` based on protocol ('New WebSocket', 'New SSE', etc.), adds to tabs, sets as active.
      - `closeTab(id)`: removes tab; if it was active, activates the previous tab (or next if at start); never closes the last tab.
      - `updateTab(id, updates: Partial<RealtimeTab>)`: merges updates into the tab.
      - `activeTab`: derived as `tabs.find(t => t.id === activeTabId) ?? tabs[0]`.
    - `rehydrateRealtimeTabs()`: reads and parses `reqly.realtimeTabs` from localStorage; returns `RealtimeTab[]` or `[]` on error.
  - **File: `src/ui/src/components/RealtimeTabBar.tsx`** (NEW, <120 lines)
    - Props: `{ tabs, activeTabId, onSelect, onClose, onNew }`
    - Renders horizontal scrollable tab strip identical visually to REST tab bar in `App.tsx`:
      - Each tab: `requestBadgeInfo(tab.protocol, undefined)` badge (no method for realtime) + tab name + X close button
      - Active tab: blue underline bar (same `h-0.5 bg-blue-500` absolute bottom element)
      - `+` button at the right opens a small dropdown/menu to pick protocol: WebSocket, SSE, Socket.IO, MQTT - each calls `onNew(protocol)`
      - Overflow: `overflow-x-auto` with `scrollbarWidth: 'none'`
    - Height: 40px (same as REST tab bar)
    - Outer div style: `height: '40px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)'`

- [ ] **T-189** RealtimeWorkspace shell - assembles sidebar, tabs, and protocol panels
  - **File: `src/ui/src/components/RealtimeWorkspace.tsx`** (NEW, <160 lines)
  - Props: `{ initialRequest?: any; onUpdate?: (state: any) => void }`
  - Uses `useRealtimeTabs()` hook from T-188 for tab management.
  - On mount: if `initialRequest` is provided and its type is a realtime protocol, adds it as a new tab (or focuses existing tab with same `_collection::name` identity).
  - Uses `useRef` + `useEffect` to react to `initialRequest` prop changes (sidebar clicks), same identity-check pattern as `GrpcWorkspace`: `const id = \`${req._collection}::${req.name}\``; only apply if identity changed from `prevRequestIdRef.current`.
  - Debounced `useEffect` (600ms): calls `onUpdate?.(activeTab)` to sync `reqly.realtimeRequest` in App.tsx for refresh persistence.
  - Layout: `display: flex, height: '100%'`
    - Left: `<RealtimeCollectionsPanel onSelectRequest={handleSidebarSelect} />` in a `<aside>` (same `w-64` width as REST sidebar, same border-right).
    - Right: `flex-1 flex flex-col`:
      - `<RealtimeTabBar ...>` at top
      - Protocol panel below (fills remaining height with `flex-1 min-h-0`): render based on `activeTab.protocol`:
        - `'websocket'` → `<WebSocketPanel tab={activeTab} onTabUpdate={...} />`
        - `'sse'` → `<SSEPanel tab={activeTab} onTabUpdate={...} />`
        - `'socketio'` → `<SocketIOPanel tab={activeTab} onTabUpdate={...} />`
        - `'mqtt'` → `<MQTTPanel tab={activeTab} onTabUpdate={...} />`
  - `handleSidebarSelect(req, col)`: calls `tabs.addTab` with the request's protocol, URL, and config loaded from `req`, or focuses existing tab with matching identity.
  - `onTabUpdate(updates)`: calls `updateTab(activeTabId, updates)`.

- [ ] **T-190** RealtimeMessageLog + RealtimeLogEntry - shared log display components
  - **File: `src/ui/src/components/RealtimeMessageLog.tsx`** (NEW, <130 lines)
    - Represents the right/bottom pane of each protocol panel - an append-only list of log entries.
    - Props: `{ entries: RealtimeLogEntry[]; title: string; onClear: () => void }`
    - `RealtimeLogEntry` type (export from this file):
      ```ts
      export interface RealtimeLogEntry {
        id: string;         // unique id for React key
        ts: number;         // Date.now()
        source: 'client' | 'server' | 'info' | 'error';
        payload: string;    // message content
        topic?: string;     // MQTT topic (shown as prefix)
        event?: string;     // Socket.IO event name (shown as prefix)
      }
      ```
    - Header: `panel-header` class (same as REST `ResponseViewer`), title on left, right side: Trash (clear) icon-btn, scroll-to-top icon-btn, scroll-to-bottom icon-btn, auto-scroll toggle icon-btn (green when on, muted when off).
    - Body: `flex-1 min-h-0 overflow-y-auto` div with `ref={logRef}` for scroll control.
    - Auto-scroll: `useEffect` watches `entries.length`. If `autoScroll` is true, scrolls to bottom. User scrolling up (detected via `onScroll` event checking `scrollTop`) disables auto-scroll.
    - Each entry: `<RealtimeLogEntryRow key={e.id} entry={e} />`
    - Empty state: centered `<div>Connect to see messages</div>` in muted italic.
  - **File: `src/ui/src/components/RealtimeLogEntryRow.tsx`** (NEW, <100 lines)
    - Props: `{ entry: RealtimeLogEntry }`
    - Row layout: `flex items-center gap-2 px-3 py-1.5 text-xs border-b` with `var(--border)` border.
    - Left icon (16px):
      - `client` → `ArrowUpRight` in `#f59e0b` (amber)
      - `server` → `ArrowDownLeft` in `#14b8a6` (teal)
      - `info` → `Info` in `var(--text-muted)`
      - `error` → `AlertCircle` in `#f87171`
    - Optional prefix: if `entry.topic` or `entry.event`, show as `[topic]` or `[eventName]` in muted text before payload.
    - Payload: truncated by default (`truncate` class). Click to expand (`useState(expanded)`). When expanded: show full text with `whitespace-pre-wrap break-all`.
    - Timestamp: right-aligned `var(--text-muted)` showing `HH:MM:SS` from `new Date(entry.ts).toLocaleTimeString()`.
    - Copy button: appears on row hover (group hover pattern), copies `entry.payload` to clipboard.

- [ ] **T-191** WebSocketPanel - WebSocket connection UI
  - **File: `src/ui/src/components/WebSocketPanel.tsx`** (NEW, <190 lines)
  - Props: `{ tab: RealtimeTab; onTabUpdate: (updates: Partial<RealtimeTab>) => void }`
  - State managed locally (not persisted mid-connection): `connectionStatus: 'disconnected' | 'connecting' | 'connected'`, `log: RealtimeLogEntry[]`, `messageText: string`, `contentType: 'JSON' | 'Raw'`, `activeSubTab: 'communication' | 'protocols'`
  - WebSocket instance: `const wsRef = useRef<WebSocket | null>(null)`
  - Connection logic (`connect()`):
    - `wsRef.current = new WebSocket(tab.url, activeProtocols)`
    - Set status to `'connecting'`, add info log entry "Connecting to {url}..."
    - `ws.onopen`: set status `'connected'`, add info log entry "Connected"
    - `ws.onmessage`: add `source: 'server'` log entry with `event.data`
    - `ws.onerror`: add `source: 'error'` log entry "WebSocket error", set status `'disconnected'`
    - `ws.onclose`: add info log entry "Disconnected", set status `'disconnected'`
  - Disconnect: `wsRef.current?.close()`
  - Send: `wsRef.current?.send(messageText)`, add `source: 'client'` log entry, clear input
  - Layout (all `flex flex-col`, fills parent height):
    - **URL bar row** (8px padding): `<input>` for URL (disabled when connecting/connected), Connect/Disconnect button (neon blue/red pill)
    - **Sub-tab bar**: "Communication" and "Protocols" tab pills (same style as GrpcWorkspace's mode tabs)
    - **Communication tab** (visible when `activeSubTab === 'communication'`):
      - Message input: `<CodeMirror>` with `minHeight: '80px'`, JSON/Raw content type picker above it (small pill buttons)
      - Send button: right-aligned, disabled when not connected or message empty
    - **Protocols tab**: simple list of text inputs for WS subprotocols (add/remove rows). Changes saved to `onTabUpdate({ realtime: { ...tab.realtime, protocols: [...] } })`
    - **MessageLog** (flex-1, fills remaining space): `<RealtimeMessageLog entries={log} title="Messages" onClear={() => setLog([])} />`
  - `useEffect` cleanup: disconnect WebSocket on unmount.

- [ ] **T-192** SSEPanel - Server-Sent Events connection UI
  - **File: `src/ui/src/components/SSEPanel.tsx`** (NEW, <120 lines)
  - Props: `{ tab: RealtimeTab; onTabUpdate: (updates: Partial<RealtimeTab>) => void }`
  - State: `connectionStatus: 'stopped' | 'starting' | 'started'`, `log: RealtimeLogEntry[]`, `eventType: string` (init from `tab.realtime?.eventType ?? 'message'`)
  - EventSource instance: `const evsRef = useRef<EventSource | null>(null)`
  - Connection logic (`start()`):
    - `evsRef.current = new EventSource(tab.url)`
    - `evs.onopen`: set status `'started'`, add info log "Connected to {url}"
    - `evs.onerror`: add error log "Connection error", `evs.close()`, set status `'stopped'`
    - `evs.addEventListener(eventType, handler)`: on each event, add `source: 'server'` log entry with `event.data`
    - If `typeof EventSource === 'undefined'`: add error log "SSE not supported in this environment"
  - Stop: `evsRef.current?.close()`, set status `'stopped'`, add info log "Stopped"
  - Layout (flex column):
    - **URL + event type row** (8px padding):
      - URL input (full-width, disabled when started/starting)
      - Event Type label + input (`eventType` state), synced to `onTabUpdate` on blur
      - Start/Stop button: label changes based on status, green when stopped (Start), red when started (Stop)
    - **MessageLog** fills remaining space
  - `useEffect` cleanup: stop EventSource on unmount.

- [ ] **T-193** SocketIOPanel - Socket.IO connection UI
  - **File: `src/ui/src/components/SocketIOPanel.tsx`** (NEW, <190 lines)
  - Props: `{ tab: RealtimeTab; onTabUpdate: (updates: Partial<RealtimeTab>) => void }`
  - npm dependency: `socket.io-client` must be added to `src/ui/package.json`. Import as: `import { io, Socket } from 'socket.io-client'`
  - State: `connectionStatus: 'disconnected' | 'connecting' | 'connected'`, `log: RealtimeLogEntry[]`, `eventName: string`, `messageText: string`
  - Config from `tab.realtime`: `path` (default `/socket.io`), `clientVersion` (default `v4`), `authType` (default `none`), `authToken`
  - Socket instance: `const socketRef = useRef<Socket | null>(null)`
  - Connection (`connect()`):
    - Build options: `{ path: tab.realtime?.path ?? '/socket.io', ...(authType === 'bearer' ? { auth: { token: authToken } } : {}) }`
    - `socketRef.current = io(tab.url, options)`
    - `socket.on('connect', ...)`: status `'connected'`, log info "Connected"
    - `socket.on('disconnect', ...)`: status `'disconnected'`, log info "Disconnected"
    - `socket.on('connect_error', err)`: log error `err.message`, disconnect
    - `socket.on('*', ...)` or `socket.onAny((eventName, ...args) => ...)`: log received messages as `source: 'server'`, `event: eventName`
  - Send: `socketRef.current?.emit(eventName, messageText)`, log as `source: 'client'`, `event: eventName`
  - Layout (flex column):
    - **URL row** (8px padding): URL input + Connect/Disconnect button
    - **Config row** (8px padding): Path input, Client Version pills (v4/v3/v2), Auth picker (None / Bearer + token input)
    - **Event + Message section**: Event name input + CodeMirror editor (`minHeight: 80px`) + Send button (disabled when disconnected)
    - **MessageLog** fills remaining space
  - Disconnect + cleanup on unmount.

- [ ] **T-194** MQTTPanel - MQTT over WebSocket connection UI
  - **File: `src/ui/src/components/MQTTPanel.tsx`** (NEW, <180 lines)
  - **File: `src/ui/src/components/MQTTSubscribePanel.tsx`** (NEW, <100 lines) - topic subscribe/unsubscribe UI
  - **File: `src/ui/src/components/MQTTPublishPanel.tsx`** (NEW, <100 lines) - message publish UI
  - npm dependency: `mqtt` must be added to `src/ui/package.json`. Import as: `import mqtt, { MqttClient } from 'mqtt'`
  - Props on all three: `{ tab: RealtimeTab; onTabUpdate: (updates) => void }` + additional props passed from parent
  - `MQTTPanel.tsx` state: `connectionStatus`, `log`, `subscribedTopics: string[]`
  - MQTT client: `const clientRef = useRef<MqttClient | null>(null)`
  - Connection config from `tab.realtime`: `mqttClientId` (default random UUID via `crypto.randomUUID()`), `mqttUsername`, `mqttPassword`, `mqttKeepalive` (default 60), `mqttCleanSession` (default true)
  - Connect: `mqtt.connect(tab.url, { clientId, username, password, keepalive, clean })` 
    - `client.on('connect', ...)`: status `'connected'`, log info
    - `client.on('error', err)`: log error, disconnect
    - `client.on('message', (topic, message) => ...)`: log `source: 'server'`, `topic`, `payload: message.toString()`
    - `client.on('close', ...)`: status `'disconnected'`, log info
  - Layout of `MQTTPanel.tsx` (flex column):
    - **URL + Client ID row** (8px padding): URL input, Client ID input, Connect/Disconnect button
    - **Collapsible connection config**: `<details>` element or useState toggle - shows Username, Password, Keepalive, Clean Session checkbox. Collapsed by default. Disabled when connected.
    - **`<MQTTSubscribePanel>`** when connected: `clientRef`, `subscribedTopics`, `onMessage`, `onTabUpdate`
    - **`<MQTTPublishPanel>`** when connected: `clientRef`, `log setter`
    - **MessageLog** fills remaining space (grows with flex-1 min-h-0)
  - `MQTTSubscribePanel.tsx`: topic input + QoS picker (0/1/2) + Subscribe button. List of subscribed topics each with Unsubscribe button. On subscribe: `client.subscribe(topic, { qos })`, add to `subscribedTopics`, log "Subscribed to {topic}".
  - `MQTTPublishPanel.tsx`: topic input + Retain checkbox + CodeMirror editor (`minHeight: 60px`) + Publish button. On publish: `client.publish(topic, message, { retain })`, log `source: 'client'`, `topic: topic`.

- [ ] **T-195** Save/load realtime requests from collections + state persistence polish
  - **Save form in RealtimeWorkspace**:
    - Add `showSaveForm: boolean` state to `RealtimeWorkspace.tsx`.
    - Save button (Bookmark icon) in each protocol panel's URL bar row triggers `onSave?.()` callback to `RealtimeWorkspace`.
    - If `activeTab._collection && activeTab.name` are set (already saved): auto-save by calling `PUT /api/collections/{col}/requests/{name}` with the updated request config (or use existing `updateRequest` from `../api`). Show brief "Saved" toast.
    - If not yet saved: show a modal with collection picker (dropdown from `fetchCollections()`) and name input. On submit: call `addRequest(collectionName, { type: tab.protocol, url: tab.url, name, realtime: tab.realtime })` from `../api`. On success: `updateTab(activeTabId, { name, _collection: collectionName })`, dispatch `reqly-reload` event, close modal.
  - **State persistence polish**:
    - `RealtimeWorkspace.tsx`: debounced `useEffect` (600ms) calls `onUpdate?.(activeTab)` whenever `activeTab` changes (any field). This keeps `reqly.realtimeRequest` in App.tsx current so refresh restores the last active tab.
    - On mount: if `initialRequest` provided and is a realtime type, call `addTab` (or `focusTab` if identity matches). Otherwise, restore from `useRealtimeTabs` state (tabs already rehydrated from localStorage).
    - Badge display: ensure `CollectionsPanel.tsx` (the REST sidebar) renders the correct badge for realtime request types using `requestBadgeInfo(req.type, req.method)`. This already works if `requestBadgeInfo` handles the new types (T-185). Verify clicking a realtime request in the REST collections panel routes correctly to the realtime workspace (T-186 wiring).
  - **Collection YAML format**: No changes needed - the existing collection manager reads/writes arbitrary `type` values from YAML. Verify by checking that `type: websocket` round-trips through `CollectionManager.getCollection()` and `addRequest()`. If the collection manager filters to HTTP methods only, fix that guard.
  - **After all sub-tasks**: run `npm test` to confirm all 789+ tests pass. Then do `npm run build` in `src/ui/`, copy to `dist/ui/`, restart server. Test manually: create a WebSocket tab, connect to `wss://echo.websocket.org`, send a message, see it echoed back in the log. Save the request to a collection. Refresh the page - the same tab should be visible.


### Protocol Expansion (Later)

- [ ] **T-151** ~~WebSocket / SSE support ("Realtime" workspace)~~ - superseded by T-185 through T-195 above

