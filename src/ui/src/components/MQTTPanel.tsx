import { useEffect, useRef, useState } from 'react';
import { Send, ChevronDown, ChevronRight, X, CheckSquare, Square } from 'lucide-react';
import mqtt from 'mqtt';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { RealtimeMessageLog } from './RealtimeMessageLog.js';
import type { UIRealtimeMessage } from './RealtimeMessageLog.js';
import { ProtocolUrlBar } from './RealtimePanelChrome.js';
import { SplitPane } from './SplitPane.js';
import type { WorkspaceTab } from '../hooks/useWorkspaceTabs.js';

interface MQTTPanelProps { tab: WorkspaceTab; onTabUpdate: (updates: Partial<WorkspaceTab>) => void; onSave: () => void; flashSaved?: boolean; isDirty?: boolean; }

export function MQTTPanel({ tab, onTabUpdate, onSave, flashSaved, isDirty }: MQTTPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const [publishTopic, setPublishTopic] = useState('');
  const [publishMessage, setPublishMessage] = useState('');
  const [subTopic, setSubTopic] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null);
  const subscriptions = tab.realtime?.subscriptions || [];

  useEffect(() => () => { clientRef.current?.end(true); }, []);

  const handleConnect = () => {
    if (status !== 'disconnected') { clientRef.current?.end(true); setStatus('disconnected'); return; }
    if (!tab.url) return;
    setStatus('connecting');
    setMessages(prev => [...prev, { id: `${Date.now()}`, ts: Date.now(), source: 'info', payload: 'Connecting to MQTT broker...' }]);
    try {
      const client = mqtt.connect(tab.url, { clientId: tab.realtime?.mqttClientId || crypto.randomUUID().slice(0, 8), username: tab.realtime?.username, password: tab.realtime?.password, keepalive: tab.realtime?.keepalive ? parseInt(tab.realtime.keepalive, 10) : 60, clean: tab.realtime?.clean !== false });
      clientRef.current = client;
      client.on('connect', () => { setStatus('connected'); setMessages(prev => [...prev, { id: `${Date.now()}o`, ts: Date.now(), source: 'info', payload: 'Connected' }]); subscriptions.forEach((sub: string) => client.subscribe(sub)); });
      client.on('message', (topic, buf) => setMessages(prev => [...prev, { id: `${Date.now()}m${Math.random()}`, ts: Date.now(), source: 'server', payload: buf.toString(), topic }]));
      client.on('error', err => { setStatus('disconnected'); setMessages(prev => [...prev, { id: `${Date.now()}e${Math.random()}`, ts: Date.now(), source: 'error', payload: `MQTT Error: ${err.message}` }]); });
      client.on('close', () => { setStatus('disconnected'); setMessages(prev => [...prev, { id: `${Date.now()}c${Math.random()}`, ts: Date.now(), source: 'info', payload: 'Disconnected' }]); });
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: `${Date.now()}x`, ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  const updateRealtime = (updates: Record<string, any>) => onTabUpdate({ realtime: { ...tab.realtime, ...updates } });
  const handleSubscribe = () => { if (!subTopic) return; const next = Array.from(new Set([...subscriptions, subTopic])); updateRealtime({ subscriptions: next }); if (status === 'connected') clientRef.current?.subscribe(subTopic); setSubTopic(''); };
  const handleUnsubscribe = (topic: string) => { updateRealtime({ subscriptions: subscriptions.filter((t: string) => t !== topic) }); if (status === 'connected') clientRef.current?.unsubscribe(topic); };
  const handlePublish = () => { if (status !== 'connected' || !publishTopic || !publishMessage) return; clientRef.current?.publish(publishTopic, publishMessage, { retain: tab.realtime?.retain || false }); setMessages(prev => [...prev, { id: `${Date.now()}p`, ts: Date.now(), source: 'client', payload: publishMessage, topic: publishTopic }]); setPublishMessage(''); };

  const configPane = (
    <div className="h-full overflow-auto">
      <div className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-1.5 text-sm">
          <label className="flex items-center gap-2"><span style={{ color: 'var(--text-secondary)' }}>Client ID:</span><input className="input h-7 w-48" value={tab.realtime?.mqttClientId || ''} onChange={e => updateRealtime({ mqttClientId: e.target.value })} placeholder="Auto-generated" disabled={status !== 'disconnected'} /></label>
          <button onClick={() => setConfigOpen(v => !v)} className="btn btn-secondary h-7 rounded px-2 text-xs">{configOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Config</button>
        </div>
        {configOpen && <div className="grid gap-2 border-t px-4 py-2 text-sm md:grid-cols-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-3)' }}><input className="input h-8" value={tab.realtime?.username || ''} onChange={e => updateRealtime({ username: e.target.value })} placeholder="Username" disabled={status !== 'disconnected'} /><input className="input h-8" type="password" value={tab.realtime?.password || ''} onChange={e => updateRealtime({ password: e.target.value })} placeholder="Password" disabled={status !== 'disconnected'} /><input className="input h-8" type="number" value={tab.realtime?.keepalive || 60} onChange={e => updateRealtime({ keepalive: e.target.value })} placeholder="Keepalive" disabled={status !== 'disconnected'} /><button className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }} onClick={() => updateRealtime({ clean: !(tab.realtime?.clean !== false) })} disabled={status !== 'disconnected'}>{tab.realtime?.clean !== false ? <CheckSquare size={14} className="text-green-500" /> : <Square size={14} />}Clean session</button></div>}
      </div>
      <div className="grid md:grid-cols-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="border-b px-4 py-3 md:border-b-0 md:border-r" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Subscriptions</div>
          <div className="mb-2 flex gap-2"><input className="input h-8" value={subTopic} onChange={e => setSubTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubscribe()} placeholder="sensors/#" /><button onClick={handleSubscribe} disabled={!subTopic} className="btn btn-primary h-8 rounded px-3">Subscribe</button></div>
          <div className="space-y-1 overflow-y-auto max-h-28">{subscriptions.map((topic: string) => <div key={topic} className="flex items-center gap-2 rounded px-2 py-1 text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}><span className="flex-1 truncate">{topic}</span><button onClick={() => handleUnsubscribe(topic)} className="icon-btn h-5 w-5" title="Unsubscribe"><X size={12} /></button></div>)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Publish</span><button className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }} onClick={() => updateRealtime({ retain: !tab.realtime?.retain })}>{tab.realtime?.retain ? <CheckSquare size={14} className="text-green-500" /> : <Square size={14} />}Retain</button></div>
          <input className="input mb-2 h-8" value={publishTopic} onChange={e => setPublishTopic(e.target.value)} placeholder="topic/name" />
          <div className="min-h-[80px] overflow-hidden rounded" style={{ background: 'var(--surface-2)' }}><CodeMirror value={publishMessage} onChange={setPublishMessage} theme="dark" extensions={[json()]} height="80px" basicSetup={{ lineNumbers: false, foldGutter: false }} /></div>
          <div className="mt-2 flex justify-end"><button onClick={handlePublish} disabled={status !== 'connected' || !publishTopic || !publishMessage} className="btn btn-primary h-8 rounded px-3"><Send size={13} />Publish</button></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <ProtocolUrlBar badge="MQTT" url={tab.url} placeholder="ws:// or wss://..." disabled={status !== 'disconnected'} onChange={url => onTabUpdate({ url })} status={status} action={status === 'connected' ? 'Disconnect' : status === 'connecting' ? 'Connecting...' : 'Connect'} onAction={handleConnect} onSave={onSave} flashSaved={flashSaved} isDirty={isDirty} />
      <div className="flex-1 min-h-0">
        <SplitPane defaultSplit={50} minTop={20} minBottom={20} top={configPane} bottom={<RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />} />
      </div>
    </div>
  );
}
