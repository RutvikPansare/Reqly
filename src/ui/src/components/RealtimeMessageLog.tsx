import { useRef, useState, useEffect } from 'react';
import { Trash, ArrowUpToLine, ArrowDownToLine, ToggleRight, ToggleLeft, ArrowUpRight, ArrowDownLeft, Info, AlertCircle, Copy } from 'lucide-react';

export interface UIRealtimeMessage {
  id: string;
  ts: number;
  source: 'client' | 'server' | 'info' | 'error';
  payload: string;
  topic?: string;
  event?: string;
}

export function RealtimeMessageLog({
  messages,
  title = 'Messages',
  onClear
}: {
  messages: UIRealtimeMessage[];
  title?: string;
  onClear: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTo({ top: logRef.current.scrollHeight });
    }
  }, [messages.length, autoScroll]);

  const handleScroll = () => {
    if (!logRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = logRef.current;
    // If user scrolled up by more than 10px, turn off auto-scroll
    if (scrollTop + clientHeight < scrollHeight - 10) {
      if (autoScroll) setAutoScroll(false);
    } else {
      if (!autoScroll) setAutoScroll(true);
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'client': return <ArrowUpRight size={14} color="#f59e0b" />;
      case 'server': return <ArrowDownLeft size={14} color="#14b8a6" />;
      case 'error': return <AlertCircle size={14} color="#f87171" />;
      default: return <Info size={14} className="text-gray-500" />;
    }
  };

  const formatTs = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="panel-header flex items-center justify-between px-3 py-2 border-b border-gray-800" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <div className="flex items-center gap-2">
          <button onClick={onClear} title="Clear messages" className="text-gray-400 hover:text-white transition-colors">
            <Trash size={14} />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1"></div>
          <button onClick={() => logRef.current?.scrollTo({ top: 0 })} title="Scroll to top" className="text-gray-400 hover:text-white transition-colors">
            <ArrowUpToLine size={14} />
          </button>
          <button onClick={() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight })} title="Scroll to bottom" className="text-gray-400 hover:text-white transition-colors">
            <ArrowDownToLine size={14} />
          </button>
          <button onClick={() => setAutoScroll(!autoScroll)} title={`Auto-scroll ${autoScroll ? 'ON' : 'OFF'}`} className="transition-colors flex items-center" style={{ color: autoScroll ? '#4ade80' : 'var(--text-muted)' }}>
            {autoScroll ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
        </div>
      </div>
      
      <div 
        ref={logRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ background: 'var(--surface-1)' }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center italic text-sm" style={{ color: 'var(--text-muted)' }}>
            Connect to see messages
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map(msg => {
              const isExpanded = expandedRows[msg.id];
              return (
                <div key={msg.id} className="group flex items-start gap-2 px-3 py-1.5 border-b border-transparent hover:bg-gray-800/50 transition-colors" style={{ borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                  <div className="shrink-0 mt-0.5">{getSourceIcon(msg.source)}</div>
                  <div className="flex-1 min-w-0 flex flex-col font-mono text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-gray-500">{formatTs(msg.ts)}</span>
                      {msg.topic && <span className="shrink-0 text-purple-400">[{msg.topic}]</span>}
                      {msg.event && <span className="shrink-0 text-blue-400">[{msg.event}]</span>}
                      
                      <div className="flex-1 min-w-0 relative">
                        <span 
                          onClick={() => toggleRow(msg.id)} 
                          className={`cursor-pointer ${isExpanded ? 'whitespace-pre-wrap break-all' : 'truncate block'}`}
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {msg.payload}
                        </span>
                      </div>
                      
                      <button 
                        onClick={() => copyToClipboard(msg.payload)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-400 hover:text-white transition-opacity p-0.5 rounded"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
