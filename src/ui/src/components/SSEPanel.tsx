import React, { useRef, useState, useEffect } from 'react';
import { Bookmark, Play, Square } from 'lucide-react';
import { RealtimeMessageLog, UIRealtimeMessage } from './RealtimeMessageLog';
import type { RealtimeTab } from '../hooks/useRealtimeTabs';

interface SSEPanelProps {
  tab: RealtimeTab;
  onTabUpdate: (updates: Partial<RealtimeTab>) => void;
  onSave: () => void;
}

export function SSEPanel({ tab, onTabUpdate, onSave }: SSEPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const evsRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (evsRef.current) {
        evsRef.current.close();
      }
    };
  }, []);

  const handleStart = () => {
    if (status === 'connected' || status === 'connecting') {
      evsRef.current?.close();
      setStatus('disconnected');
      return;
    }

    if (!tab.url) return;

    setStatus('connecting');
    setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connecting to SSE...' }]);

    try {
      const evs = new EventSource(tab.url);
      evsRef.current = evs;

      evs.onopen = () => {
        setStatus('connected');
        setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connected' }]);
      };

      const eventType = tab.realtime?.sseEventType || 'message';
      
      evs.addEventListener(eventType, (e: any) => {
        setMessages(prev => [...prev, { 
          id: Date.now().toString() + Math.random(), 
          ts: Date.now(), 
          source: 'server', 
          payload: e.data || '',
          event: eventType
        }]);
      });

      evs.onerror = (e: any) => {
        evs.close();
        setStatus('disconnected');
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'error', payload: 'SSE Error: connection lost or failed to connect' }]);
      };
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-1)' }}>
      <div className="flex items-center gap-2 p-2 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        <input 
          type="text" 
          value={tab.url}
          onChange={e => onTabUpdate({ url: e.target.value })}
          disabled={status !== 'disconnected'}
          placeholder="https://..."
          className="flex-1 bg-transparent border rounded px-2 py-1 text-sm focus:outline-none disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <input 
          type="text" 
          value={tab.realtime?.sseEventType || ''}
          onChange={e => onTabUpdate({ realtime: { ...tab.realtime, sseEventType: e.target.value } })}
          disabled={status !== 'disconnected'}
          placeholder="Event type (default: message)"
          className="w-48 bg-transparent border rounded px-2 py-1 text-sm focus:outline-none disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <button onClick={onSave} className="p-1.5 rounded transition-colors" style={{ color: tab._collection ? 'var(--accent)' : 'var(--text-muted)' }} title="Save Request">
          <Bookmark size={16} />
        </button>
        <button 
          onClick={handleStart}
          className="flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ 
            background: status === 'connected' ? '#ef4444' : status === 'connecting' ? '#f59e0b' : '#3b82f6',
            color: '#fff'
          }}
        >
          {status === 'connected' ? <><Square size={14} /> Stop</> : status === 'connecting' ? 'Connecting...' : <><Play size={14} /> Start</>}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />
      </div>
    </div>
  );
}
