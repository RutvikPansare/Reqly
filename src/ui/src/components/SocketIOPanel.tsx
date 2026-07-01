import { useRef, useState, useEffect } from 'react';
import { Bookmark, Send } from 'lucide-react';
import { io } from 'socket.io-client';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { RealtimeMessageLog } from './RealtimeMessageLog';
import type { UIRealtimeMessage } from './RealtimeMessageLog';
import type { RealtimeTab } from '../hooks/useRealtimeTabs';

interface SocketIOPanelProps {
  tab: RealtimeTab;
  onTabUpdate: (updates: Partial<RealtimeTab>) => void;
  onSave: () => void;
}

export function SocketIOPanel({ tab, onTabUpdate, onSave }: SocketIOPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [eventName, setEventName] = useState('');
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleConnect = () => {
    if (status === 'connected' || status === 'connecting') {
      socketRef.current?.disconnect();
      setStatus('disconnected');
      return;
    }

    if (!tab.url) return;

    setStatus('connecting');
    setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connecting to Socket.IO...' }]);

    try {
      const path = tab.realtime?.path || '/socket.io';
      const authType = tab.realtime?.authType || 'none';
      const token = tab.realtime?.token || '';

      const socket = io(tab.url, { 
        path,
        ...(authType === 'bearer' ? { auth: { token } } : {})
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setStatus('connected');
        setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connected' }]);
      });

      socket.onAny((event, ...args) => {
        setMessages(prev => [...prev, { 
          id: Date.now().toString() + Math.random(), 
          ts: Date.now(), 
          source: 'server', 
          payload: args.length === 1 && typeof args[0] !== 'object' ? String(args[0]) : JSON.stringify(args, null, 2),
          event
        }]);
      });

      socket.on('connect_error', (err) => {
        setStatus('disconnected');
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'error', payload: `Connect Error: ${err.message}` }]);
      });

      socket.on('disconnect', (reason) => {
        setStatus('disconnected');
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'info', payload: `Disconnected: ${reason}` }]);
      });
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  const handleSend = () => {
    if (status !== 'connected' || !messageText || !eventName) return;
    try {
      let payload = messageText;
      try { payload = JSON.parse(messageText); } catch {}
      
      socketRef.current?.emit(eventName, payload);
      setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'client', payload: messageText, event: eventName }]);
      setMessageText('');
    } catch (e: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'error', payload: `Send error: ${e.message}` }]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-1)]">
      <div className="flex items-center gap-2 p-2 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        <input 
          type="text" 
          value={tab.url}
          onChange={e => onTabUpdate({ url: e.target.value })}
          disabled={status !== 'disconnected'}
          placeholder="http://..."
          className="flex-1 bg-transparent border rounded px-2 py-1 text-sm focus:outline-none disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <button onClick={onSave} className="p-1.5 rounded transition-colors" style={{ color: tab._collection ? 'var(--accent)' : 'var(--text-muted)' }} title="Save Request">
          <Bookmark size={16} />
        </button>
        <button 
          onClick={handleConnect}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ 
            background: status === 'connected' ? '#ef4444' : status === 'connecting' ? '#f59e0b' : '#3b82f6',
            color: '#fff'
          }}
        >
          {status === 'connected' ? 'Disconnect' : status === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      </div>

      <div className="flex items-center gap-4 px-3 py-2 border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Path:</span>
          <input 
            type="text" 
            value={tab.realtime?.path || ''}
            onChange={e => onTabUpdate({ realtime: { ...tab.realtime, path: e.target.value } })}
            placeholder="/socket.io"
            className="w-32 bg-transparent border rounded px-2 py-0.5 focus:outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Auth:</span>
          <select 
            value={tab.realtime?.authType || 'none'}
            onChange={e => onTabUpdate({ realtime: { ...tab.realtime, authType: e.target.value } })}
            className="bg-transparent border rounded px-2 py-0.5 focus:outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="none">None</option>
            <option value="bearer">Bearer Token</option>
          </select>
          {tab.realtime?.authType === 'bearer' && (
            <input 
              type="text" 
              value={tab.realtime?.token || ''}
              onChange={e => onTabUpdate({ realtime: { ...tab.realtime, token: e.target.value } })}
              placeholder="Token"
              className="w-32 bg-transparent border rounded px-2 py-0.5 focus:outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col p-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex gap-2 mb-2">
          <input 
            type="text" 
            value={eventName}
            onChange={e => setEventName(e.target.value)}
            placeholder="Event name"
            className="w-48 bg-transparent border rounded px-2 py-1 text-sm focus:outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex-1 min-h-[80px] border rounded overflow-hidden" style={{ borderColor: 'var(--border)' }}>
           <CodeMirror
              value={messageText}
              onChange={(val) => setMessageText(val)}
              theme="dark"
              extensions={[json()]}
              height="80px"
              basicSetup={{ lineNumbers: false, foldGutter: false }}
            />
        </div>
        <div className="flex justify-end mt-2">
          <button 
            onClick={handleSend}
            disabled={status !== 'connected' || !messageText || !eventName}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} /> Emit
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />
      </div>
    </div>
  );
}
