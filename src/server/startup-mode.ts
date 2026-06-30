export type SwitchResult =
  | { ok: boolean; status: number }
  | 'econnrefused'
  | 'error';

export type McpMode = 'switched' | 'mcp-only' | 'start-fresh';

export function resolveMcpMode(result: SwitchResult): McpMode {
  if (result === 'econnrefused') return 'start-fresh';
  if (result === 'error') return 'mcp-only';
  if (result.ok) return 'switched';
  return 'mcp-only';
}
