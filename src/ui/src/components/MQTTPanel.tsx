import { useRef, useState, useEffect } from 'react';
import { Bookmark, Send, ChevronDown, ChevronRight, X } from 'lucide-react';
import mqtt from 'mqtt';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { RealtimeMessageLog } from './RealtimeMessageLog';
import type { UIRealtimeMessage } from './RealtimeMessageLog';
import type { RealtimeTab } from '../hooks/useRealtimeTabs';

interface MQTTPanelProps {
  tab: RealtimeTab;
  onTabUpdate: (updates: Partial<RealtimeTab>) => void;
  onSave: () => void;
}

export function MQTTPanel({ tab, onTabUpdate, onSave }: MQTTPanelProps) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<UIRealtimeMessage[]>([]);
  const [publishTopic, setPublishTopic] = useState('');
  const [publishMessage, setPublishMessage] = useState('');
  const [subTopic, setSubTopic] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const clientRef = useRef<ReturnType<typeof mqtt.connect> | null>(null);
  
  const subscriptions = tab.realtime?.subscriptions || [];

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
      }
    };
  }, []);

  const handleConnect = () => {
    if (status === 'connected' || status === 'connecting') {
      clientRef.current?.end(true);
      setStatus('disconnected');
      return;
    }

    if (!tab.url) return;

    setStatus('connecting');
    setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connecting to MQTT broker...' }]);

    try {
      const clientId = tab.realtime?.mqttClientId || crypto.randomUUID().slice(0, 8);
      const username = tab.realtime?.username;
      const password = tab.realtime?.password;
      const keepalive = tab.realtime?.keepalive ? parseInt(tab.realtime.keepalive, 10) : 60;
      const clean = tab.realtime?.clean !== false;

      const client = mqtt.connect(tab.url, {
        clientId,
        username,
        password,
        keepalive,
        clean
      });
      clientRef.current = client;

      client.on('connect', () => {
        setStatus('connected');
        setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'info', payload: 'Connected' }]);
        
        subscriptions.forEach((sub: string) => {
          client.subscribe(sub);
        });
      });

      client.on('message', (topic, buf) => {
        setMessages(prev => [...prev, { 
          id: Date.now().toString() + Math.random(), 
          ts: Date.now(), 
          source: 'server', 
          payload: buf.toString(),
          topic
        }]);
      });

      client.on('error', (err) => {
        setStatus('disconnected');
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'error', payload: `MQTT Error: ${err.message}` }]);
      });

      client.on('close', () => {
        setStatus('disconnected');
        setMessages(prev => [...prev, { id: Date.now().toString() + Math.random(), ts: Date.now(), source: 'info', payload: `Disconnected` }]);
      });
    } catch (e: any) {
      setStatus('disconnected');
      setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'error', payload: e.message }]);
    }
  };

  const handlePublish = () => {
    if (status !== 'connected' || !publishMessage || !publishTopic) return;
    clientRef.current?.publish(publishTopic, publishMessage, { retain: tab.realtime?.retain || false });
    setMessages(prev => [...prev, { id: Date.now().toString(), ts: Date.now(), source: 'client', payload: publishMessage, topic: publishTopic }]);
    setPublishMessage('');
  };

  const handleSubscribe = () => {
    if (!subTopic) return;
    const newSubs = Array.from(new Set([...subscriptions, subTopic]));
    onTabUpdate({ realtime: { ...tab.realtime, subscriptions: newSubs } });
    if (status === 'connected') {
      clientRef.current?.subscribe(subTopic);
    }
    setSubTopic('');
  };

  const handleUnsubscribe = (topic: string) => {
    const newSubs = subscriptions.filter((t: string) => t !== topic);
    onTabUpdate({ realtime: { ...tab.realtime, subscriptions: newSubs } });
    if (status === 'connected') {
      clientRef.current?.unsubscribe(topic);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-1)]">
      <div className="flex flex-col border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 p-2" style={{ background: 'var(--surface-2)' }}>
          <input 
            type="text" 
            value={tab.url}
            onChange={e => onTabUpdate({ url: e.target.value })}
            disabled={status !== 'disconnected'}
            placeholder="ws:// or wss://..."
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

        <div className="flex items-center gap-4 px-3 py-1.5 text-sm" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-gray-400">Client ID:</span>
            <input 
              type="text" 
              value={tab.realtime?.mqttClientId || ''}
              onChange={e => onTabUpdate({ realtime: { ...tab.realtime, mqttClientId: e.target.value } })}
              placeholder="Auto-generated if empty"
              disabled={status !== 'disconnected'}
              className="w-48 bg-transparent border rounded px-2 py-0.5 focus:outline-none disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <button 
            onClick={() => setConfigOpen(!configOpen)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {configOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Config
          </button>
        </div>

        {configOpen && (
          <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm" style={{ background: 'var(--surface-3)' }}>
            <div className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Username:</span>
              <input type="text" value={tab.realtime?.username || ''} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, username: e.target.value } })} disabled={status !== 'disconnected'} className="flex-1 bg-transparent border rounded px-2 py-0.5 focus:outline-none disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Password:</span>
              <input type="password" value={tab.realtime?.password || ''} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, password: e.target.value } })} disabled={status !== 'disconnected'} className="flex-1 bg-transparent border rounded px-2 py-0.5 focus:outline-none disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-gray-400">Keepalive:</span>
              <input type="number" value={tab.realtime?.keepalive || 60} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, keepalive: e.target.value } })} disabled={status !== 'disconnected'} className="w-20 bg-transparent border rounded px-2 py-0.5 focus:outline-none disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                <input type="checkbox" checked={tab.realtime?.clean !== false} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, clean: e.target.checked } })} disabled={status !== 'disconnected'} />
                Clean Session
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 flex flex-col p-2 border-r" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xs text-gray-400 mb-1">Subscriptions</div>
          <div className="flex gap-2 mb-2">
            <input 
              type="text" 
              value={subTopic}
              onChange={e => setSubTopic(e.target.value)}
              placeholder="Topic (e.g. sensors/#)"
              className="flex-1 bg-transparent border rounded px-2 py-1 text-sm focus:outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubscribe(); }}
            />
            <button 
              onClick={handleSubscribe}
              disabled={!subTopic}
              className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              Subscribe
            </button>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px]">
            {subscriptions.map((topic: string) => (
              <div key={topic} className="flex items-center justify-between bg-gray-800/50 px-2 py-1 rounded text-sm text-gray-300">
                <span className="truncate flex-1">{topic}</span>
                <button onClick={() => handleUnsubscribe(topic)} className="text-red-400 hover:text-red-300 p-0.5">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col p-2">
          <div className="flex justify-between items-center mb-1">
            <div className="text-xs text-gray-400">Publish</div>
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={tab.realtime?.retain || false} onChange={e => onTabUpdate({ realtime: { ...tab.realtime, retain: e.target.checked } })} />
              Retain
            </label>
          </div>
          <input 
            type="text" 
            value={publishTopic}
            onChange={e => setPublishTopic(e.target.value)}
            placeholder="Topic"
            className="w-full mb-2 bg-transparent border rounded px-2 py-1 text-sm focus:outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <div className="flex-1 min-h-[60px] border rounded overflow-hidden" style={{ borderColor: 'var(--border)' }}>
             <CodeMirror
                value={publishMessage}
                onChange={(val) => setPublishMessage(val)}
                theme="dark"
                extensions={[json()]}
                height="60px"
                basicSetup={{ lineNumbers: false, foldGutter: false }}
              />
          </div>
          <div className="flex justify-end mt-2">
            <button 
              onClick={handlePublish}
              disabled={status !== 'connected' || !publishMessage || !publishTopic}
              className="flex items-center gap-1 px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={12} /> Publish
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <RealtimeMessageLog messages={messages} onClear={() => setMessages([])} />
      </div>
    </div>
  );
}
