import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { statusBadgeClass } from '../lib/colors';

interface ResponseViewerProps {
  response: any;
  isSending?: boolean;
}

export function ResponseViewer({ response, isSending }: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState('body');

  const handleCopy = () => {
    if (response?.body) {
      const txt = typeof response.body === 'object' ? JSON.stringify(response.body, null, 2) : response.body;
      navigator.clipboard.writeText(txt);
    }
  };

  if (!response && !isSending) {
    return (
      <div className="flex-1 flex flex-col rounded overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="panel-header">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Response</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
          Send a request to see the response
        </div>
      </div>
    );
  }

  const { status, latency, body, headers, diff } = response || {};
  const hasDiff = diff && (diff.statusChanged || diff.latencyDelta !== 0 || diff.bodyChanges?.length > 0);
  const isError = status >= 400;
  
  const syntaxHighlight = (jsonStr: string) => {
    jsonStr = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'text-blue-400'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-zinc-300'; // key
        } else {
          cls = 'text-green-400'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-gray-500'; // null
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  };

  const getBodyHtml = () => {
    if (body === undefined || body === null) return '';
    try {
      const str = typeof body === 'object' ? JSON.stringify(body, null, 2) : body;
      // Basic JSON detect
      if (typeof str === 'string' && (str.trim().startsWith('{') || str.trim().startsWith('['))) {
        return syntaxHighlight(str);
      }
      return str; // plain text
    } catch {
      return String(body);
    }
  };

  return (
    <div className="flex flex-col flex-1 rounded overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="panel-header">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Response</span>
        {isSending ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={14} className="animate-spin text-blue-500" />
            Sending...
          </div>
        ) : (
          <div className="flex gap-3 text-sm font-mono items-center">
            <span className={`status-badge ${statusBadgeClass(status)}`}>
              {status} {isError ? 'Error' : 'OK'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{latency || 0} ms</span>
            <button onClick={handleCopy} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.125rem 0.625rem' }}>
              Copy
            </button>
          </div>
        )}
      </div>
      
      {response?.assertions && response.assertions.length > 0 && !isSending && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex gap-4 overflow-x-auto">
          {response.assertions.map((ass: any, i: number) => (
            <div key={i} className={`text-xs flex items-center gap-1 px-2 py-1 rounded ${ass.passed ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              <span>{ass.passed ? '✅' : '❌'}</span>
              <span className="font-mono">{ass.assertion.field}</span>
              <span className="text-gray-500">{ass.assertion.operator}</span>
              <span>{ass.assertion.value}</span>
              {!ass.passed && (
                <span className="ml-2 text-red-300 opacity-80">(got: {ass.actual})</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="tab-bar">
        {['body', 'headers', 'raw'].map(tab => (
          <button 
            key={tab}
            disabled={isSending}
            className={`tab-btn capitalize ${activeTab === tab ? 'active' : ''} disabled:opacity-40`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        {hasDiff && (
          <button
            disabled={isSending}
            className={`tab-btn disabled:opacity-40 ${activeTab === 'diff' ? 'active' : ''}`}
            style={activeTab === 'diff' ? { color: '#fbbf24', borderBottomColor: '#f59e0b' } : {}}
            onClick={() => setActiveTab('diff')}
          >
            Diff
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-sm relative" style={{ background: 'var(--surface-3)' }}>
        {isSending && (
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm z-10" />
        )}
        
        {activeTab === 'body' && body !== undefined && body !== null && (
          <pre className="p-4 text-gray-300 whitespace-pre-wrap outline-none" dangerouslySetInnerHTML={{ __html: getBodyHtml() }} />
        )}
        
        {activeTab === 'headers' && headers && (
          <div className="w-full">
            {Object.entries(headers).map(([key, val]) => (
              <div key={key} className="flex border-b border-gray-800 hover:bg-gray-800/50">
                <div className="w-1/3 p-2 text-gray-400 font-semibold border-r border-gray-800 break-all">{key}</div>
                <div className="w-2/3 p-2 text-gray-300 break-all">{String(val)}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'raw' && response && (
          <pre className="p-4 text-gray-400 whitespace-pre overflow-x-auto">
            HTTP/1.1 {status} {isError ? 'Error' : 'OK'}{'\n'}
            {Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
            {'\n\n'}
            {typeof body === 'object' ? JSON.stringify(body, null, 2) : body}
          </pre>
        )}

        {activeTab === 'diff' && hasDiff && (
          <div className="p-4 font-mono text-sm space-y-1">
            {diff.statusChanged && (
              <div className="text-yellow-400">
                ~ status: {diff.prevStatus} -&gt; {diff.currStatus}
              </div>
            )}
            {diff.latencyDelta !== 0 && (
              <div className={diff.latencyDelta > 0 ? 'text-red-400' : 'text-green-400'}>
                ~ latency: {diff.latencyDelta > 0 ? '+' : ''}{diff.latencyDelta} ms
              </div>
            )}
            {diff.bodyChanges?.length === 0 && !diff.statusChanged && diff.latencyDelta === 0 && (
              <div className="text-gray-500">No changes detected.</div>
            )}
            {diff.bodyChanges?.map((line: string, i: number) => (
              <div
                key={i}
                className={
                  line.startsWith('+') ? 'text-green-400' :
                  line.startsWith('-') ? 'text-red-400' :
                  'text-yellow-400'
                }
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
