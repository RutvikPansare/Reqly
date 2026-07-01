import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { fetchCollections } from '../api';
import { requestBadgeInfo } from '../lib/colors';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface RealtimeCollectionsPanelProps {
  activeProtocol: string;
  onSelectRequest: (req: any, col: string) => void;
  onNewTab: (protocol: string) => void;
}

export function RealtimeCollectionsPanel({ activeProtocol, onSelectRequest, onNewTab }: RealtimeCollectionsPanelProps) {
  const [collections, setCollections] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useLocalStorage<Record<string, boolean>>('reqly.realtimeExpanded', {});
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadCollections = async () => {
    try {
      const cols = await fetchCollections();
      setCollections(cols);
    } catch (e) {
      console.error('Failed to load collections', e);
    }
  };

  useEffect(() => {
    loadCollections();
    const handleReload = () => loadCollections();
    window.addEventListener('reqly-reload', handleReload);
    return () => window.removeEventListener('reqly-reload', handleReload);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const toggleExpand = (colName: string) => {
    setExpanded(prev => ({ ...prev, [colName]: !prev[colName] }));
  };

  const filteredCollections = collections.map(col => {
    const rts = (col.requests || []).filter((r: any) => ['websocket', 'sse', 'socketio', 'mqtt'].includes(r.type));
    const matching = rts.filter((r: any) => !search || r.name?.toLowerCase().includes(search.toLowerCase()));
    return { ...col, requests: matching, hasRealtimeTotal: rts.length > 0 };
  }).filter(col => col.requests.length > 0 || (search === '' && col.hasRealtimeTotal));

  const totalRealtimeRequests = collections.reduce((acc, col) => 
    acc + (col.requests || []).filter((r: any) => ['websocket', 'sse', 'socketio', 'mqtt'].includes(r.type)).length, 0
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search realtime..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent border rounded pl-7 pr-2 py-1 text-sm focus:outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center justify-center rounded transition-colors px-2"
              style={{ height: '30px', background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <Plus size={14} className="mr-1" /> New
            </button>
            {menuOpen && (
              <div 
                className="absolute right-0 top-full mt-1 w-40 py-1 rounded shadow-lg z-50"
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
                      onNewTab(proto.id);
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

      <div className="flex-1 overflow-y-auto">
        {totalRealtimeRequests === 0 ? (
          <div className="p-4 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>
            No realtime requests saved yet.<br/><br/>Click "New" to start.
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="p-4 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>
            No matches found
          </div>
        ) : (
          filteredCollections.map(col => {
            const isExpanded = expanded[col.name] !== false;
            return (
              <div key={col.name} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <div 
                  className="flex items-center px-2 py-1.5 cursor-pointer hover:bg-gray-800 transition-colors"
                  style={{ background: 'var(--surface-2)' }}
                  onClick={() => toggleExpand(col.name)}
                >
                  {isExpanded ? <ChevronDown size={14} className="mr-1 text-gray-400" /> : <ChevronRight size={14} className="mr-1 text-gray-400" />}
                  <Folder size={14} className="mr-2 text-blue-400" />
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{col.name}</span>
                </div>
                {isExpanded && (
                  <div className="py-1">
                    {col.requests.length === 0 ? (
                      <div className="px-7 py-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>No realtime requests</div>
                    ) : (
                      col.requests.map((req: any) => {
                        const badge = requestBadgeInfo(req.type, undefined);
                        return (
                          <div
                            key={req.name}
                            className="flex items-center px-4 py-1 cursor-pointer hover:bg-gray-800 transition-colors pl-8 group"
                            onClick={() => onSelectRequest(req, col.name)}
                          >
                            <span className="text-[10px] font-bold w-12 shrink-0" style={{ color: badge.bg, filter: 'brightness(1.2)' }}>
                              {badge.label}
                            </span>
                            <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                              {req.name}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
