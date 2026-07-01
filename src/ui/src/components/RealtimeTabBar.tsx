import { useEffect, useRef, useState } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import type { RealtimeTab } from '../hooks/useRealtimeTabs.js';
import { requestBadgeInfo } from '../lib/colors.js';

interface RealtimeTabBarProps {
  tabs: RealtimeTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (protocol: string) => void;
}

const PROTOCOLS = [
  { id: 'websocket', label: 'WebSocket' },
  { id: 'sse', label: 'Server-Sent Events' },
  { id: 'socketio', label: 'Socket.IO' },
  { id: 'mqtt', label: 'MQTT' },
];

export function RealtimeTabBar({ tabs, activeTabId, onSelect, onClose, onNew }: RealtimeTabBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="flex h-10 w-full shrink-0 items-center border-b" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
      <div className="flex h-full flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(tab => {
          const active = activeTabId === tab.id;
          const badge = requestBadgeInfo(tab.protocol, undefined);
          const label = tab.tabName ?? tab.name ?? `New ${tab.protocol.toUpperCase()}`;
          return (
            <button key={tab.id} onClick={() => onSelect(tab.id)} className="group relative flex h-full min-w-32 max-w-44 items-center gap-2 border-r px-3 text-left transition-colors" style={{ borderColor: 'rgba(255,255,255,0.04)', background: active ? 'var(--surface-2)' : 'transparent' }}>
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: 'var(--accent)' }} aria-hidden="true" />}
              <span className="shrink-0 text-[10px] font-bold" style={{ color: badge.style?.color || 'var(--text-secondary)' }}>{badge.label}</span>
              <span className="flex-1 truncate text-xs" style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }} title={label}>{label}</span>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--text-muted)' }} onClick={e => { e.stopPropagation(); onClose(tab.id); }}><X size={12} /></span>
            </button>
          );
        })}
      </div>
      {/* + button is outside overflow-x-auto so the dropdown is not clipped */}
      <div ref={menuRef} className="relative flex h-full shrink-0 items-center border-l px-1.5" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setMenuOpen(v => !v)} className="btn btn-secondary h-7 rounded px-2" style={{ gap: '4px', minWidth: 'unset' }} title="New tab">
          <Plus size={13} /><ChevronDown size={11} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded py-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)' }}>
            {PROTOCOLS.map(proto => (
              <button key={proto.id} className="w-full px-4 py-2 text-left text-xs transition-colors hover:bg-[var(--surface-3)]" style={{ color: 'var(--text-primary)' }} onClick={() => { onNew(proto.id); setMenuOpen(false); }}>{proto.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
