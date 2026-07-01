import type { ReactNode } from 'react';
import { Save } from 'lucide-react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const statusColors: Record<ConnectionStatus, string> = {
  disconnected: 'var(--text-muted)',
  connecting: '#f59e0b',
  connected: '#10b981',
};

export function statusColor(status: ConnectionStatus) {
  return statusColors[status];
}

export function ProtocolUrlBar({ badge, url, placeholder, disabled, onChange, status, action, onAction, onSave }: {
  badge: string;
  url: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  status: ConnectionStatus;
  action: ReactNode;
  onAction: () => void;
  saved?: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex h-8 flex-1 items-center overflow-hidden rounded" style={{ border: '1px solid var(--border-strong)', borderRadius: '6px', background: 'var(--surface-2)' }}>
        <span className="mx-2.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ color: 'var(--accent)', background: 'var(--accent-muted)', letterSpacing: '0.03em' }}>{badge}</span>
        <div className="my-1.5 w-px self-stretch shrink-0" style={{ background: 'var(--border-strong)' }} />
        <input value={url} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} className="h-full flex-1 bg-transparent px-3 font-mono text-sm focus:outline-none disabled:opacity-50" style={{ color: 'var(--text-primary)' }} />
      </div>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor(status) }} title={status} aria-label={status} />
      <button onClick={onAction} className={`btn ${status === 'connected' ? 'btn-danger' : 'btn-primary'} h-8 min-w-[96px] justify-center rounded px-3`}>{action}</button>
      <button onClick={onSave} className="btn btn-secondary h-8 rounded gap-1.5 px-3" title="Save request (⌘S)"><Save size={13} />Save</button>
    </div>
  );
}
