import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { io } from 'socket.io-client';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { RealtimeMessageLog } from './RealtimeMessageLog.js';
import type { UIRealtimeMessage } from './RealtimeMessageLog.js';
import { ProtocolUrlBar } from './RealtimePanelChrome.js';
import { SplitPane } from './SplitPane.js';
import type { WorkspaceTab } from '../hooks/useWorkspaceTabs.js';

interface SocketIOPanelProps { tab: WorkspaceTab; onTabUpdate: (updates: Partial<WorkspaceTab>) => void; onSave: () => void; flashSaved?: boolean; }

export function SocketIOPanel({ tab, onTabUpdate, onSave, flashSaved }: SocketIOPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [eventName, setEventName] = useState('');
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  const handleConnect = () => {
    if (status !== 'disconnected') { socketRef.current?.disconnect(); setStatus('disconnected'); return; }
    if (!tab.url) return;
    setStatus('connecting');
    setMessages(prev => [...prev, { id: `${Date.now()}`, ts: Date.now(), source: 'info', payload: 'Connecting to Socket.IO...' }]);
    try {
      const socket = io(tab.url, { path: tab.realtime?.path || '/socket.io', ...(tab.realtime?.authType === 'bearer' ? { auth: { token: tab.realtime?.token || '' } } : {}) });
      socketRef.current = socket;
      socket.on('connect', () => { setStatus('connected'); setMessages(prev => [...prev, { id: `${Date.now()}o`, ts: Date.now(), source: 'info', payload: 'Connected' }]); });
      socket.onAny((event, ...args) => setMessages(prev => [...prev, { id: `${Date.now()}m${Math.random()}`, ts: Date.now(), source: 'server', payload: args.length === 1 && typeof args[0] !== 'object' ? String(args[0]) : JSON.stringify(args, null, 2), event }]));
      socket.on('connect_error', err => { setStatus('disconnected'); setMessages(prev => [...prev, { id: `${Date.now()}e${Math.random()}`, ts: Date.now(), source: 'error', payload: `Connect Error: ${err.message}` }]); });
      socket.on('disconnect', reason => { setStatus('disconnected'); setMessages(prev => [...prev, { id: `${Date.now()}d${Math.random()}`, ts: Date.now(), source: 'info', payload: `Disconnected: ${reason}` }]); });
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: `${Date.now()}x`, ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  const handleSend = () => {
    if (status !== 'connected' || !eventName || !messageText) return;
    try {
      let payload: any = messageText; try { payload = JSON.parse(messageText); } catch {}
      socketRef.current?.emit(eventName, payload);
      setMessages(prev => [...prev, { id: `${Date.now()}s`, ts: Date.now(), source: 'client', payload: messageText, event: eventName }]);
      setMessageText('');
    } catch (e: any) {
      setMessages(prev => [...prev, { id: `${Date.now()}f`, ts: Date.now(), source: 'error', payload: `Send error: ${e.message}` }]);
    }
  };

  const editorPane = (
    <div className="h-full overflow-auto px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Event:</span>
        <input className="input h-8 max-w-xs" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="event name" />
      </div>
      <div className="flex items-start gap-3">
        <div className="min-h-[120px] flex-1 overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}>
          <CodeMirror value={messageText} onChange={setMessageText} theme="dark" extensions={[json()]} height="120px" basicSetup={{ lineNumbers: false, foldGutter: false }} />
        </div>
        <button onClick={handleSend} disabled={status !== 'connected' || !eventName || !messageText} className="btn btn-primary h-8 rounded px-3"><Send size={13} />Emit</button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <ProtocolUrlBar badge="SIO" url={tab.url} placeholder="http://..." disabled={status !== 'disconnected'} onChange={url => onTabUpdate({ url })} status={status} action={status === 'connected' ? 'Disconnect' : status === 'connecting' ? 'Connecting...' : 'Connect'} onAction={handleConnect} onSave={onSave} flashSaved={flashSaved} />
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-1.5 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}><label className="flex items-center gap-2"><span style={{ color: 'var(--text-secondary)' }}>Path:</span><input className="input h-7 w-40" value={tab.realtime?.path || ''} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, path: e.target.value } })} placeholder="/socket.io" /></label><label className="flex items-center gap-2"><span style={{ color: 'var(--text-secondary)' }}>Auth:</span><select className="input h-7 w-32 py-0" value={tab.realtime?.authType || 'none'} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, authType: e.target.value } })}><option value="none">None</option><option value="bearer">Bearer</option></select></label>{tab.realtime?.authType === 'bearer' && <input className="input h-7 max-w-xs" value={tab.realtime?.token || ''} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, token: e.target.value } })} placeholder="Token" />}</div>
      <div className="flex-1 min-h-0">
        <SplitPane defaultSplit={42} minTop={15} minBottom={20} top={editorPane} bottom={<RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />} />
      </div>
    </div>
  );
}
