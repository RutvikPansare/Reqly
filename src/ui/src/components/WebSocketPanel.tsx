import React, { useRef, useState, useEffect } from 'react';
import { Bookmark, Send, Plus, X } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { RealtimeMessageLog, UIRealtimeMessage } from './RealtimeMessageLog';
import type { RealtimeTab } from '../hooks/useRealtimeTabs';

interface WebSocketPanelProps {
  tab: RealtimeTab;
  onTabUpdate: (updates: Partial<RealtimeTab>) => void;
  onSave: () => void;
}

export function WebSocketPanel({ tab, onTabUpdate, onSave }: WebSocketPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [subTab, setSubTab] = useState<'communication' | 'protocols'>('communication');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleConnect = () => {
    if (status === 'connected' || status === 'connecting') {
      wsRef.current?.close();
      return;
    }

    if (!tab.url) return;

    setStatus('connecting');
    setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connecting...' }]);

    try {
      const ws = new WebSocket(tab.url, tab.realtime?.protocols ?? []);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connected' }]);
      };

      ws.onmessage = (e) => {
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'server', payload: e.data.toString() }]);
      };

      ws.onerror = () => {
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'error', payload: 'WebSocket Error' }]);
      };

      ws.onclose = () => {
        setStatus('disconnected');
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'info', payload: 'Disconnected' }]);
      };
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  const handleSend = () => {
    if (status !== 'connected' || !messageText) return;
    wsRef.current?.send(messageText);
    setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'client', payload: messageText }]);
    setMessageText('');
  };

  const protocols = tab.realtime?.protocols || [];
  
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-1)' }}>
      <div className="flex items-center gap-2 p-2 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        <input 
          type="text" 
          value={tab.url}
          onChange={e => onTabUpdate({ url: e.target.value })}
          disabled={status !== 'disconnected'}
          placeholder="wss://..."
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

      <div className="flex px-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <button 
          onClick={() => setSubTab('communication')} 
          className={`py-2 px-3 text-sm font-medium transition-colors border-b-2 ${subTab === 'communication' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
        >
          Communication
        </button>
        <button 
          onClick={() => setSubTab('protocols')} 
          className={`py-2 px-3 text-sm font-medium transition-colors border-b-2 ${subTab === 'protocols' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
        >
          Protocols
        </button>
      </div>

      {subTab === 'communication' && (
        <div className="flex flex-col p-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex-1 min-h-[80px] border rounded overflow-hidden" style={{ borderColor: 'var(--border)' }}>
             <CodeMirror
                value={messageText}
                onChange={(val) => setMessageText(val)}
                theme="dark"
                extensions={[json()]}
                height="100px"
                basicSetup={{ lineNumbers: false, foldGutter: false }}
              />
          </div>
          <div className="flex justify-end mt-2">
            <button 
              onClick={handleSend}
              disabled={status !== 'connected' || !messageText}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} /> Send
            </button>
          </div>
        </div>
      )}

      {subTab === 'protocols' && (
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xs text-gray-400 mb-2">Subprotocols to request from the server (e.g. graphql-ws)</div>
          {protocols.map((p: string, idx: number) => (
            <div key={idx} className="flex gap-2 mb-2">
              <input 
                value={p}
                onChange={e => {
                  const newProtos = [...protocols];
                  newProtos[idx] = e.target.value;
                  onTabUpdate({ realtime: { ...tab.realtime, protocols: newProtos } });
                }}
                className="flex-1 bg-transparent border rounded px-2 py-1 text-sm focus:outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button 
                onClick={() => {
                  const newProtos = protocols.filter((_: any, i: number) => i !== idx);
                  onTabUpdate({ realtime: { ...tab.realtime, protocols: newProtos } });
                }}
                className="p-1 text-red-400 hover:text-red-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button 
            onClick={() => onTabUpdate({ realtime: { ...tab.realtime, protocols: [...protocols, ''] } })}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-2"
          >
            <Plus size={14} /> Add Protocol
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />
      </div>
    </div>
  );
}
