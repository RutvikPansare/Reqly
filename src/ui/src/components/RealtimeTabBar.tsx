import { X, Plus } from 'lucide-react';
import type { RealtimeTab } from '../hooks/useRealtimeTabs.js';
import { requestBadgeInfo } from '../lib/colors.js';

interface RealtimeTabBarProps {
  tabs: RealtimeTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (protocol: string) => void;
}

export function RealtimeTabBar({ tabs, activeTabId, onSelect, onClose, onNew }: RealtimeTabBarProps) {
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
      <div className="flex h-full shrink-0 items-center border-l px-1.5" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => onNew('websocket')} className="btn btn-secondary h-7 rounded px-2" style={{ minWidth: 'unset' }} title="New WebSocket tab"><Plus size={13} /></button>
      </div>
    </div>
  );
}
