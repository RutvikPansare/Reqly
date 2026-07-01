// Shared color helpers for method badges and status codes.
// Hoppscotch palette: GET=#22c55e, POST=#eab308, PUT=#3b82f6, PATCH=#f97316, DELETE=#ef4444.
// Status: 2xx green, 3xx blue, 4xx yellow, 5xx red.

export function methodColorClass(method: string): string {
  switch ((method || '').toUpperCase()) {
    case 'GET': return 'text-green-500';
    case 'POST': return 'text-yellow-500';
    case 'PUT': return 'text-blue-500';
    case 'PATCH': return 'text-orange-500';
    case 'DELETE': return 'text-red-500';
    default: return 'text-gray-400';
  }
}

// Pill-shaped method badge: background tint + exact-color text. Use with the
// shared METHOD_BADGE_BASE classes for consistent shape/weight across the app.
export const METHOD_BADGE_BASE = 'inline-flex items-center justify-center min-w-[44px] px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide';

export function methodBadgeClass(method: string): string {
  switch ((method || '').toUpperCase()) {
    case 'GET': return 'bg-green-500/15 text-green-500';
    case 'POST': return 'bg-yellow-500/15 text-yellow-500';
    case 'PUT': return 'bg-blue-500/15 text-blue-500';
    case 'PATCH': return 'bg-orange-500/15 text-orange-500';
    case 'DELETE': return 'bg-red-500/15 text-red-500';
    default: return 'bg-gray-700/30 text-gray-400';
  }
}

// Unified badge for any request type.
// Returns { label, style } so the caller just renders one <span>.
// gRPC  - neon cyan  (#06b6d4)  to match the gRPC workspace accent colour.
// GQL   - pink       (#db2777)  existing convention.
// REST  - falls back to methodBadgeClass(method).
export function requestBadgeInfo(
  type: string | undefined,
  method: string | undefined,
): { label: string; className: string; style?: React.CSSProperties } {
  switch (type) {
    case 'websocket':
      return {
        label: 'WS',
        className: METHOD_BADGE_BASE + ' shrink-0',
        style: { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' },
      };
    case 'sse':
      return {
        label: 'SSE',
        className: METHOD_BADGE_BASE + ' shrink-0',
        style: { background: 'rgba(20,184,166,0.15)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.3)' },
      };
    case 'socketio':
      return {
        label: 'SIO',
        className: METHOD_BADGE_BASE + ' shrink-0',
        style: { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' },
      };
    case 'mqtt':
      return {
        label: 'MQTT',
        className: METHOD_BADGE_BASE + ' shrink-0',
        style: { background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' },
      };
    case 'grpc':
      return {
        label: 'gRPC',
        className: METHOD_BADGE_BASE + ' shrink-0',
        style: { background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' },
      };
    case 'graphql':
    case 'graphql-subscription':
      return {
        label: type === 'graphql-subscription' ? 'SUB' : 'GQL',
        className: METHOD_BADGE_BASE + ' shrink-0',
        style: { background: '#db277720', color: '#db2777', border: '1px solid #db277740' },
      };
    default:
      return {
        label: (method || 'GET').toUpperCase(),
        className: `${METHOD_BADGE_BASE} ${methodBadgeClass(method || '')} shrink-0`,
      };
  }
}

export function statusColorClass(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-400';
  if (status >= 300 && status < 400) return 'text-blue-400';
  if (status >= 400 && status < 500) return 'text-yellow-400';
  if (status >= 500) return 'text-red-400';
  return 'text-gray-400';
}
