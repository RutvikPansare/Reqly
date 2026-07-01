import { useEffect, useRef, useState } from 'react';
import { Send, Plus, X } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { RealtimeMessageLog } from './RealtimeMessageLog.js';
import type { UIRealtimeMessage } from './RealtimeMessageLog.js';
import { ProtocolUrlBar } from './RealtimePanelChrome.js';
import { SplitPane } from './SplitPane.js';
import type { RealtimeTab } from '../hooks/useRealtimeTabs.js';

interface WebSocketPanelProps { tab: RealtimeTab; onTabUpdate: (updates: Partial<RealtimeTab>) => void; onSave: () => void; flashSaved?: boolean; }

export function WebSocketPanel({ tab, onTabUpdate, onSave, flashSaved }: WebSocketPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [subTab, setSubTab] = useState<'communication' | 'protocols'>('communication');
  const wsRef = useRef<WebSocket | null>(null);
  const protocols = tab.realtime?.protocols || [];

  useEffect(() => () => wsRef.current?.close(), []);

  const handleConnect = () => {
    if (status !== 'disconnected') return wsRef.current?.close();
    if (!tab.url) return;
    setStatus('connecting');
    setMessages(prev => [...prev, { id: `${Date.now()}`, ts: Date.now(), source: 'info', payload: 'Connecting...' }]);
    try {
      const ws = new WebSocket(tab.url, protocols); wsRef.current = ws;
      ws.onopen = () => { setStatus('connected'); setMessages(prev => [...prev, { id: `${Date.now()}o`, ts: Date.now(), source: 'info', payload: 'Connected' }]); };
      ws.onmessage = e => setMessages(prev => [...prev, { id: `${Date.now()}m${Math.random()}`, ts: Date.now(), source: 'server', payload: e.data.toString() }]);
      ws.onerror = () => setMessages(prev => [...prev, { id: `${Date.now()}e${Math.random()}`, ts: Date.now(), source: 'error', payload: 'WebSocket Error' }]);
      ws.onclose = () => { setStatus('disconnected'); setMessages(prev => [...prev, { id: `${Date.now()}c${Math.random()}`, ts: Date.now(), source: 'info', payload: 'Disconnected' }]); };
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: `${Date.now()}x`, ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  const handleSend = () => {
    if (status !== 'connected' || !messageText) return;
    wsRef.current?.send(messageText);
    setMessages(prev => [...prev, { id: `${Date.now()}s`, ts: Date.now(), source: 'client', payload: messageText }]);
    setMessageText('');
  };

  const updateProtocols = (next: string[]) => onTabUpdate({ realtime: { ...tab.realtime, protocols: next } });

  const editorPane = subTab === 'communication' ? (
    <div className="h-full overflow-auto px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-h-[120px] flex-1 overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}>
          <CodeMirror value={messageText} onChange={setMessageText} theme="dark" extensions={[json()]} height="120px" basicSetup={{ lineNumbers: false, foldGutter: false }} />
        </div>
        <button onClick={handleSend} disabled={status !== 'connected' || !messageText} className="btn btn-primary h-8 rounded px-3"><Send size={13} />Send</button>
      </div>
    </div>
  ) : (
    <div className="h-full overflow-auto px-4 py-3">
      <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>Subprotocols requested from the server.</p>
      <div className="space-y-2">{protocols.map((value: string, index: number) => <div key={`${index}-${value}`} className="flex items-center gap-2"><input className="input h-8" value={value} onChange={e => updateProtocols(protocols.map((item: string, i: number) => i === index ? e.target.value : item))} placeholder="graphql-ws" /><button onClick={() => updateProtocols(protocols.filter((_: string, i: number) => i !== index))} className="icon-btn" title="Remove protocol"><X size={14} /></button></div>)}</div>
      <button onClick={() => updateProtocols([...protocols, ''])} className="btn btn-secondary mt-3 h-8 rounded px-3"><Plus size={13} />Add protocol</button>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <ProtocolUrlBar badge="WS" url={tab.url} placeholder="wss://..." disabled={status !== 'disconnected'} onChange={url => onTabUpdate({ url })} status={status} action={status === 'connected' ? 'Disconnect' : status === 'connecting' ? 'Connecting...' : 'Connect'} onAction={handleConnect} onSave={onSave} flashSaved={flashSaved} />
      <div className="flex items-center gap-2 border-b px-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>{(['communication', 'protocols'] as const).map(name => <button key={name} className={`tab-btn ${subTab === name ? 'active' : ''}`} onClick={() => setSubTab(name)}>{name === 'communication' ? 'Communication' : 'Protocols'}</button>)}</div>
      <div className="flex-1 min-h-0">
        <SplitPane defaultSplit={38} minTop={15} minBottom={20} top={editorPane} bottom={<RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />} />
      </div>
    </div>
  );
}
