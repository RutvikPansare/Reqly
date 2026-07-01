import { useState, useRef, useEffect } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import type { RealtimeTab } from '../hooks/useRealtimeTabs';
import { requestBadgeInfo } from '../lib/colors';

interface RealtimeTabBarProps {
  tabs: RealtimeTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: (protocol: string) => void;
}

export function RealtimeTabBar({ tabs, activeTabId, onSelect, onClose, onNew }: RealtimeTabBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="flex items-center shrink-0 w-full" style={{ height: '40px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex overflow-x-auto flex-1 h-full" style={{ scrollbarWidth: 'none' }}>
        {tabs.map(tab => {
          const isActive = activeTabId === tab.id;
          const displayName = tab.tabName ?? tab.name ?? `New ${tab.protocol.toUpperCase()}`;
          const badge = requestBadgeInfo(tab.protocol, undefined);
          
          return (
            <div
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className="relative flex items-center gap-2 px-3 cursor-pointer min-w-32 max-w-44 group transition-colors h-full"
              style={{
                borderRight: '1px solid rgba(255,255,255,0.03)',
                background: 'transparent',
              }}
            >
              {isActive && (
                <span className="absolute left-0 bottom-0 right-0 h-0.5 bg-blue-500" aria-hidden="true" />
              )}
              <span className="text-[10px] font-bold shrink-0" style={{ color: badge.style?.color || 'var(--text-secondary)', filter: 'brightness(1.2)' }}>{badge.label}</span>
              <span
                className="text-xs truncate flex-1"
                style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                title={displayName}
              >
                {displayName}
              </span>
              <div className="w-4 h-4 flex items-center justify-center shrink-0 relative">
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                  className="rounded opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center hover:bg-gray-700/50"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}
        
        <div className="relative flex items-center h-full" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center shrink-0 transition-colors h-full px-2 gap-1 hover:bg-gray-800"
            style={{ color: 'var(--text-muted)' }}
            title="New Tab"
          >
            <Plus size={13} />
            <ChevronDown size={11} />
          </button>
          
          {menuOpen && (
            <div 
              className="absolute left-0 top-full mt-1 w-40 py-1 rounded shadow-lg z-50"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {[
                { id: 'websocket', label: 'WebSocket' },
                { id: 'sse', label: 'Server-Sent Events' },
                { id: 'socketio', label: 'Socket.IO' },
                { id: 'mqtt', label: 'MQTT' }
              ].map(proto => (
                <button
                  key={proto.id}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => {
                    onNew(proto.id);
                    setMenuOpen(false);
                  }}
                >
                  {proto.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
