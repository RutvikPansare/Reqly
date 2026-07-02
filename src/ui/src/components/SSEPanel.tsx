import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { RealtimeMessageLog } from './RealtimeMessageLog.js';
import type { UIRealtimeMessage } from './RealtimeMessageLog.js';
import { ProtocolUrlBar } from './RealtimePanelChrome.js';
import type { WorkspaceTab } from '../hooks/useWorkspaceTabs.js';

interface SSEPanelProps { tab: WorkspaceTab; onTabUpdate: (updates: Partial<WorkspaceTab>) => void; onSave: () => void; flashSaved?: boolean; isDirty?: boolean; }

export function SSEPanel({ tab, onTabUpdate, onSave, flashSaved, isDirty }: SSEPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const evsRef = useRef<EventSource | null>(null);

  useEffect(() => () => evsRef.current?.close(), []);

  const handleStart = () => {
    if (status !== 'disconnected') { evsRef.current?.close(); setStatus('disconnected'); return; }
    if (!tab.url) return;
    setStatus('connecting');
    setMessages(prev => [...prev, { id: `${Date.now()}`, ts: Date.now(), source: 'info', payload: 'Connecting to SSE...' }]);
    try {
      const eventType = tab.realtime?.eventType || 'message';
      const evs = new EventSource(tab.url); evsRef.current = evs;
      evs.onopen = () => { setStatus('connected'); setMessages(prev => [...prev, { id: `${Date.now()}o`, ts: Date.now(), source: 'info', payload: 'Connected' }]); };
      evs.addEventListener(eventType, (e: any) => setMessages(prev => [...prev, { id: `${Date.now()}m${Math.random()}`, ts: Date.now(), source: 'server', payload: e.data || '', event: eventType }]));
      evs.onerror = () => { evs.close(); setStatus('disconnected'); setMessages(prev => [...prev, { id: `${Date.now()}e${Math.random()}`, ts: Date.now(), source: 'error', payload: 'SSE Error: connection lost or failed to connect' }]); };
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: `${Date.now()}x`, ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <ProtocolUrlBar badge="SSE" url={tab.url} placeholder="https://..." disabled={status !== 'disconnected'} onChange={url => onTabUpdate({ url })} status={status} action={status === 'connected' ? <><Square size={13} />Stop</> : status === 'connecting' ? 'Connecting...' : <><Play size={13} />Start</>} onAction={handleStart} onSave={onSave} flashSaved={flashSaved} isDirty={isDirty} />
      <div className="flex items-center gap-2 border-b px-4 py-1" style={{ borderColor: 'var(--border)' }}><span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Event type:</span><input className="input h-7 max-w-xs text-sm" value={tab.realtime?.eventType || ''} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, eventType: e.target.value } })} disabled={status !== 'disconnected'} placeholder="message" /></div>
      <div className="flex-1 min-h-0"><RealtimeMessageLog messages={messages} onClear={() => setMessages([])} /></div>
    </div>
  );
}
