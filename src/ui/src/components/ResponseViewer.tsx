import { useState, useEffect } from 'react';
import { Loader2, Copy, Check, Search, Braces, BookMarked } from 'lucide-react';
import { statusBadgeClass } from '../lib/colors';
import { TsInterfaceModal } from './TsInterfaceModal';
import { saveExample, listExamples } from '../api';
import { pushConsoleLogs } from './BottomPanel';

interface ResponseViewerProps {
  response: any;
  isSending?: boolean;
  request?: any;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function syntaxHighlight(jsonStr: string): string {
  const escaped = jsonStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      if (/^"/.test(match)) {
        // JSON key
        if (/:$/.test(match)) return `<span style="color:#7dd3fc">${match}</span>`;
        // String value
        return `<span style="color:#86efac">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span style="color:#c084fc">${match}</span>`;
      if (/null/.test(match)) return `<span style="color:#6b7280">${match}</span>`;
      // Number
      return `<span style="color:#fdba74">${match}</span>`;
    }
  );
}

export function ResponseViewer({ response, isSending, request }: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState('body');
  const [copied, setCopied] = useState(false);
  const [bodyFilter, setBodyFilter] = useState('');
  const [showTsInterface, setShowTsInterface] = useState(false);
  const [savingExample, setSavingExample] = useState(false);
  const [savedExampleMsg, setSavedExampleMsg] = useState('');
  const [examples, setExamples] = useState<any[]>([]);
  const [examplesLoaded, setExamplesLoaded] = useState(false);

  const collectionName = request?._collection;
  const requestName = request?.name;
  const canSaveExample = !!(response && collectionName && requestName);

  useEffect(() => {
    setExamples([]);
    setExamplesLoaded(false);
  }, [collectionName, requestName]);

  // Push script logs to global bottom panel console
  useEffect(() => {
    if (response?.consoleLogs?.length) {
      const source = request?.name ? `${request.name}` : undefined;
      pushConsoleLogs(response.consoleLogs, source);
    }
  }, [response]);

  const loadExamples = async () => {
    if (!collectionName || !requestName) return;
    try {
      const data = await listExamples(collectionName, requestName);
      setExamples(data);
      setExamplesLoaded(true);
    } catch {
      setExamples([]);
      setExamplesLoaded(true);
    }
  };

  const handleSaveExample = async () => {
    if (!canSaveExample) return;
    const name = prompt('Name this example (e.g. "Success 200", "Not Found 404"):');
    if (!name) return;
    setSavingExample(true);
    try {
      await saveExample(collectionName, requestName, {
        exampleName: name,
        status: response.status,
        body: response.body,
        headers: response.headers || {},
        latency: response.latency || 0,
      });
      setSavedExampleMsg(`Saved "${name}"`);
      setTimeout(() => setSavedExampleMsg(''), 3000);
      // Refresh examples if tab is already open
      if (activeTab === 'examples') loadExamples();
    } catch (e: any) {
      alert(`Failed to save example: ${e.message}`);
    } finally {
      setSavingExample(false);
    }
  };

  const handleCopy = () => {
    if (response?.body) {
      const txt = typeof response.body === 'object' ? JSON.stringify(response.body, null, 2) : response.body;
      navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!response && !isSending) {
    return (
      <div className="flex-1 flex flex-col rounded overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="panel-header">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Response</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Send a request to see the response</p>
          <p className="text-xs opacity-50">Press <kbd style={{ fontFamily: 'inherit', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: '3px', padding: '0 4px' }}>⌘↵</kbd> to fire</p>
        </div>
      </div>
    );
  }

  const { status, latency, body, headers, diff } = response || {};
  const hasDiff = diff && (diff.statusChanged || diff.latencyDelta !== 0 || diff.bodyChanges?.length > 0);
  const isError = status >= 400;

  const bodyBytes = body != null
    ? new TextEncoder().encode(typeof body === 'object' ? JSON.stringify(body) : String(body)).length
    : 0;

  const getBodyHtml = () => {
    if (body === undefined || body === null) return '';
    try {
      const str = typeof body === 'object' ? JSON.stringify(body, null, 2) : body;
      const isJson = typeof str === 'string' && (str.trim().startsWith('{') || str.trim().startsWith('['));
      if (!isJson) return str as string;

      if (bodyFilter.trim()) {
        const q = bodyFilter.toLowerCase();
        const lines = (str as string).split('\n');
        const kept = lines.filter(l => l.toLowerCase().includes(q));
        if (kept.length === 0) return `<span style="color:var(--text-muted);font-style:italic">No lines match "${bodyFilter}"</span>`;
        return syntaxHighlight(kept.join('\n'));
      }
      return syntaxHighlight(str as string);
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
            {bodyBytes > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>{formatSize(bodyBytes)}</span>
            )}
            {body != null && typeof body === 'object' && (
              <button
                onClick={() => setShowTsInterface(true)}
                className="flex items-center gap-1 btn btn-secondary transition-all"
                style={{ fontSize: '0.75rem', padding: '0.125rem 0.625rem' }}
                title="Generate TypeScript interface"
              >
                <Braces size={12} />
                TS
              </button>
            )}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 btn btn-secondary transition-all"
              style={{ fontSize: '0.75rem', padding: '0.125rem 0.625rem', color: copied ? '#4ade80' : undefined, borderColor: copied ? 'rgba(74,222,128,0.3)' : undefined }}
              title="Copy response body"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            {canSaveExample && (
              <button
                onClick={handleSaveExample}
                disabled={savingExample}
                className="flex items-center gap-1 btn btn-secondary transition-all disabled:opacity-50"
                style={{ fontSize: '0.75rem', padding: '0.125rem 0.625rem', color: savedExampleMsg ? '#4ade80' : undefined, borderColor: savedExampleMsg ? 'rgba(74,222,128,0.3)' : undefined }}
                title="Save as example response"
              >
                <BookMarked size={12} />
                {savedExampleMsg || 'Save Example'}
              </button>
            )}
          </div>
        )}
      </div>

      {response?.assertions && response.assertions.length > 0 && !isSending && (
        <div className="px-4 py-2 border-b flex gap-4 overflow-x-auto" style={{ background: 'var(--surface-0)', borderColor: 'var(--border)' }}>
          {response.assertions.map((ass: any, i: number) => (
            <div key={i} className={`text-xs flex items-center gap-1 px-2 py-1 rounded ${ass.passed ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              <span>{ass.passed ? '✅' : '❌'}</span>
              <span className="font-mono">{ass.assertion.field}</span>
              <span style={{ color: 'var(--text-muted)' }}>{ass.assertion.operator}</span>
              <span>{ass.assertion.value}</span>
              {!ass.passed && <span className="ml-2 text-red-300 opacity-80">(got: {ass.actual})</span>}
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
        {canSaveExample && (
          <button
            className={`tab-btn disabled:opacity-40 ${activeTab === 'examples' ? 'active' : ''}`}
            onClick={() => { setActiveTab('examples'); if (!examplesLoaded) loadExamples(); }}
          >
            Examples
          </button>
        )}
        {activeTab === 'body' && body != null && (
          <div className="ml-auto flex items-center pr-2">
            <div className="flex items-center gap-1 px-2 rounded" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', height: '24px' }}>
              <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Filter..."
                value={bodyFilter}
                onChange={e => setBodyFilter(e.target.value)}
                className="bg-transparent outline-none text-xs w-24"
                style={{ color: 'var(--text-secondary)' }}
              />
              {bodyFilter && (
                <button onClick={() => setBodyFilter('')} style={{ color: 'var(--text-muted)', lineHeight: 1 }} className="text-xs leading-none">×</button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-sm relative" style={{ background: 'var(--surface-3)' }}>
        {isSending && (
          <div className="absolute inset-0 backdrop-blur-sm z-10" style={{ background: 'rgba(0,0,0,0.3)' }} />
        )}

        {activeTab === 'body' && body !== undefined && body !== null && (
          <pre
            className="p-4 whitespace-pre-wrap outline-none leading-relaxed"
            style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}
            dangerouslySetInnerHTML={{ __html: getBodyHtml() }}
          />
        )}

        {activeTab === 'headers' && headers && (
          <div className="w-full">
            {Object.entries(headers).map(([key, val]) => (
              <div key={key} className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-1/3 p-2 font-semibold break-all" style={{ color: '#7dd3fc', borderRight: '1px solid var(--border)' }}>{key}</div>
                <div className="w-2/3 p-2 break-all" style={{ color: 'var(--text-secondary)' }}>{String(val)}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'raw' && response && (
          <pre className="p-4 whitespace-pre overflow-x-auto" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            HTTP/1.1 {status} {isError ? 'Error' : 'OK'}{'\n'}
            {Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
            {'\n\n'}
            {typeof body === 'object' ? JSON.stringify(body, null, 2) : body}
          </pre>
        )}

        {activeTab === 'diff' && hasDiff && (
          <div className="p-4 font-mono text-sm space-y-1">
            {diff.statusChanged && <div className="text-yellow-400">~ status: {diff.prevStatus} → {diff.currStatus}</div>}
            {diff.latencyDelta !== 0 && (
              <div className={diff.latencyDelta > 0 ? 'text-red-400' : 'text-green-400'}>
                ~ latency: {diff.latencyDelta > 0 ? '+' : ''}{diff.latencyDelta} ms
              </div>
            )}
            {diff.bodyChanges?.length === 0 && !diff.statusChanged && diff.latencyDelta === 0 && (
              <div style={{ color: 'var(--text-muted)' }}>No changes detected.</div>
            )}
            {diff.bodyChanges?.map((line: string, i: number) => (
              <div key={i} className={line.startsWith('+') ? 'text-green-400' : line.startsWith('-') ? 'text-red-400' : 'text-yellow-400'}>
                {line}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'examples' && (
          <div className="p-4">
            {!examplesLoaded ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={14} className="animate-spin" /> Loading examples...
              </div>
            ) : examples.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: 'var(--text-muted)' }}>
                <BookMarked size={32} strokeWidth={1.2} opacity={0.35} />
                <p className="text-sm">No saved examples yet.</p>
                <p className="text-xs opacity-60">Click "Save Example" in the header after firing a request.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {examples.map((ex: any) => (
                  <div key={ex.id} className="rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border)' }}>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{ex.name}</span>
                      <div className="flex items-center gap-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        <span className={`status-badge ${statusBadgeClass(ex.status)}`}>{ex.status}</span>
                        <span>{ex.latency} ms</span>
                        <span>{new Date(ex.savedAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <pre
                      className="p-3 text-xs font-mono overflow-x-auto"
                      style={{ color: 'var(--text-secondary)', background: 'var(--surface-1)', maxHeight: '200px', overflowY: 'auto' }}
                      dangerouslySetInnerHTML={{
                        __html: ex.body != null
                          ? syntaxHighlight(typeof ex.body === 'object' ? JSON.stringify(ex.body, null, 2) : String(ex.body))
                          : '<span style="color:var(--text-muted);font-style:italic">(empty body)</span>',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {showTsInterface && body != null && (
        <TsInterfaceModal body={body} onClose={() => setShowTsInterface(false)} />
      )}
    </div>
  );
}
