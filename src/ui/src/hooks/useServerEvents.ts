import { useEffect, useRef } from 'react';

// Connects to the server's SSE stream and dispatches 'reqly-reload' whenever
// the server reports a state change. All panels already listen to 'reqly-reload'
// so this is the only wiring needed in the UI.
//
// Event types emitted by the server:
//   collections  - any collection / request / spec / auth / variables change
//   flows        - any flow or step change, or a flow run completing
//   environments - environment create / update / delete / active change
//   history      - after any request run or history clear
//   project      - project switched via /api/switch-project (triggers full reload)
export function useServerEvents() {
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const scheduleReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        window.dispatchEvent(new Event('reqly-reload'));
      }, 200);
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource('/api/events');

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string };
          if (event.type === 'project') {
            // Project switched - full page reload to re-init all state
            window.location.reload();
            return;
          }
          // Coalesce rapid bursts (e.g. agent adding many requests) into one reload
          scheduleReload();
        } catch { /* ignore malformed frames */ }
      };

      es.onerror = () => {
        es?.close();
        // Reconnect after 3s - handles server restarts cleanly
        if (!closed) setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      es?.close();
    };
  }, []);
}
