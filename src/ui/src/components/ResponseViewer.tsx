import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Copy, Check, Search, Braces, BookMarked, X, AlertTriangle } from 'lucide-react';
import { statusColorClass } from '../lib/colors';
import { TsInterfaceModal } from './TsInterfaceModal';
import { saveExample, listExamples } from '../api';
import { pushConsoleLogs } from './BottomPanel';
import { CollapsibleJson } from './InteractiveJsonTree';

interface ResponseViewerProps {
  response: any;
  isSending?: boolean;
  request?: any;
}

// Network/parse errors land here as a plain-string body with latency 0 (see
// App.tsx's handleFire) - distinct from a real HTTP 4xx/5xx response, which
// always has a latency and usually a JSON body. Only hint for the former.
const ERROR_HINTS: Array<[RegExp, string]> = [
  [/Failed to parse URL from/i, 'The URL could not be parsed. Check for unresolved {{variables}} or a missing protocol (https://).'],
  [/ECONNREFUSED/, 'Connection refused. Is the server running on this host/port?'],
  [/ENOTFOUND/, 'Hostname not found. Check the URL or your network connection.'],
  [/ETIMEDOUT/, 'Request timed out. The server did not respond in time.'],
];

function getErrorHint(body: unknown, latency: number | undefined): string | null {
  if (typeof body !== 'string' || latency) return null;
  for (const [pattern, hint] of ERROR_HINTS) {
    if (pattern.test(body)) return hint;
  }
  return null;
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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const saveModalInputRef = useRef<HTMLInputElement>(null);

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

  const handleSaveExample = () => {
    if (!canSaveExample) return;
    const statusLabel = response?.status ? `${response.status}` : '';
    setSaveModalName(statusLabel ? `Success ${statusLabel}` : '');
    setShowSaveModal(true);
    setTimeout(() => saveModalInputRef.current?.focus(), 50);
  };

  const confirmSaveExample = async () => {
    const name = saveModalName.trim();
    if (!name) return;
    setShowSaveModal(false);
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
      window.dispatchEvent(new CustomEvent('reqly-example-saved', { detail: { col: collectionName, req: requestName } }));
      window.dispatchEvent(new Event('reqly-reload'));
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
      <div className="flex flex-col h-full" style={{ background: 'var(--surface-1)' }}>
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

  const { status, latency, body, headers, diff, contractViolations, contractMatch, _isHistorical, _timestamp } = response || {};
  const hasDiff = diff && (diff.statusChanged || diff.latencyDelta !== 0 || diff.bodyChanges?.length > 0);
  const isError = status >= 400;
  const hasContract = contractMatch != null;
  const contractViolationCount = contractViolations?.length || 0;

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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ background: 'var(--surface-1)' }}>
      <div className="panel-header">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Response</span>
        {isSending ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={14} className="animate-spin text-blue-500" />
            Sending...
          </div>
        ) : (
          <div className="flex gap-3 text-xs font-mono items-center">
            <span className={statusColorClass(status)}>
              {status} {isError ? 'Error' : 'OK'}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{latency || 0} ms</span>
            {bodyBytes > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>{formatSize(bodyBytes)}</span>
            )}
            {_isHistorical && _timestamp && (
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
                Historical • {new Date(_timestamp).toLocaleString()}
              </span>
            )}
            {body != null && typeof body === 'object' && (
              <button
                onClick={() => setShowTsInterface(true)}
                className="icon-btn"
                title="Generate TypeScript interface"
              >
                <Braces size={14} />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="icon-btn"
              style={{ color: copied ? '#4ade80' : undefined }}
              title={copied ? 'Copied!' : 'Copy response body'}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {canSaveExample && (
              <button
                onClick={handleSaveExample}
                disabled={savingExample}
                className="icon-btn disabled:opacity-50"
                style={{ color: savedExampleMsg ? '#4ade80' : undefined }}
                title={savedExampleMsg || 'Save as example response'}
              >
                <BookMarked size={14} />
              </button>
            )}
          </div>
        )}
      </div>

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
        <button
          className={`tab-btn disabled:opacity-40 ${activeTab === 'assertions' ? 'active' : ''}`}
          style={
            (response?.assertions?.some((a: any) => !a.passed) || response?.testResults?.some((t: any) => !t.passed))
              ? { color: '#f87171', borderBottomColor: activeTab === 'assertions' ? '#ef4444' : undefined }
              : (response?.assertions?.length > 0 || response?.testResults?.length > 0)
                ? { color: '#4ade80', borderBottomColor: activeTab === 'assertions' ? '#4ade80' : undefined }
                : {}
          }
          onClick={() => setActiveTab('assertions')}
        >
          Tests{(() => {
            const failCount = (response?.assertions?.filter((a: any) => !a.passed).length || 0) + (response?.testResults?.filter((t: any) => !t.passed).length || 0);
            return failCount > 0 ? <span className="ml-1 px-1.5 rounded-full text-[10px]" style={{ background: '#ef4444', color: 'white' }}>{failCount}</span> : null;
          })()}
        </button>
        {canSaveExample && (
          <button
            className={`tab-btn disabled:opacity-40 ${activeTab === 'examples' ? 'active' : ''}`}
            onClick={() => { setActiveTab('examples'); if (!examplesLoaded) loadExamples(); }}
          >
            Examples
          </button>
        )}
        {hasContract && (
          <button
            className={`tab-btn disabled:opacity-40 ${activeTab === 'contract' ? 'active' : ''}`}
            style={contractViolationCount > 0 ? { color: '#f87171', borderBottomColor: activeTab === 'contract' ? '#ef4444' : undefined } : {}}
            onClick={() => setActiveTab('contract')}
          >
            Contract{contractViolationCount > 0 && (
              <span className="ml-1 px-1.5 rounded-full text-[10px]" style={{ background: '#ef4444', color: 'white' }}>{contractViolationCount}</span>
            )}
          </button>
        )}
        {activeTab === 'body' && body != null && (
          <div className="ml-auto flex items-center pr-2">
            <div className="flex items-center gap-1 px-2" style={{ background: 'transparent', height: '24px' }}>
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

      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden font-mono text-sm relative" style={{ background: 'var(--surface-1)' }}>
        {isSending && (
          <div className="absolute inset-0 backdrop-blur-sm z-10" style={{ background: 'rgba(0,0,0,0.3)' }} />
        )}

        {activeTab === 'body' && body !== undefined && body !== null && (
          <>
            {(() => {
              const hint = getErrorHint(body, latency);
              const hintEl = hint ? (
                <div className="flex items-start gap-2 m-4 mb-0 p-3 rounded-md text-xs" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{hint}</span>
                </div>
              ) : null;

              const str = typeof body === 'object' ? JSON.stringify(body, null, 2) : body;
              const isJson = typeof str === 'string' && (str.trim().startsWith('{') || str.trim().startsWith('['));

              let contentEl;
              if (isJson) {
                let parsed = body;
                if (typeof body === 'string') {
                  try { parsed = JSON.parse(body); } catch { /* ignore */ }
                }
                contentEl = (
                  <div className="p-1.5 flex flex-col flex-1 h-full min-h-0 min-w-0 w-full">
                    <CollapsibleJson label="Response Body" data={parsed} filter={bodyFilter} accent="#7dd3fc" className="h-full" />
                  </div>
                );
              } else {
                contentEl = (
                  <div className="p-1.5 flex-1 h-full min-h-0 min-w-0 w-full overflow-y-auto">
                    <pre
                      className="p-1.5 whitespace-pre-wrap outline-none leading-relaxed"
                      style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}
                      dangerouslySetInnerHTML={{ __html: getBodyHtml() }}
                    />
                  </div>
                );
              }

              return (
                <>
                  {hintEl}
                  {contentEl}
                </>
              );
            })()}
          </>
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

        {activeTab === 'contract' && hasContract && (
          <div className="p-4">
            {!contractMatch.matched ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#fbbf24' }}>
                  No matching operation found
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Inferred path: <span className="font-mono">{contractMatch.inferredPath}</span>. If this request maps to a spec operation, set <span className="font-mono">specOperationId</span> on it.
                </p>
              </div>
            ) : contractViolationCount === 0 ? (
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#4ade80' }}>
                All checks passed
                <span className="font-mono text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                  · {contractMatch.method} {contractMatch.path} · {contractMatch.operationId}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {contractViolations.map((v: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 mt-0.5"
                      style={{ background: v.severity === 'error' ? '#ef4444' : '#f59e0b', color: 'white' }}
                    >
                      {v.severity}
                    </span>
                    <div>
                      <div className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>{v.field}</div>
                      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{v.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'assertions' && (
          <div className="p-4 flex flex-col gap-2">
            {(!response?.assertions || response.assertions.length === 0) && (!response?.testResults || response.testResults.length === 0) ? (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No tests were run. You can add assertions in the request editor.
              </div>
            ) : (
              <>
                {response?.testResults?.map((t: any, i: number) => (
                  <div key={`tr-${i}`} className="flex items-start gap-2 p-2 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 mt-0.5"
                      style={{ background: t.passed ? '#4ade80' : '#ef4444', color: 'white' }}
                    >
                      {t.passed ? 'PASS' : 'FAIL'}
                    </span>
                    <div>
                      <div className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>{t.name}</div>
                      {!t.passed && t.error && (
                        <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{t.error}</div>
                      )}
                    </div>
                  </div>
                ))}
                {response?.assertions?.map((a: any, i: number) => (
                  <div key={`a-${i}`} className="flex items-start gap-2 p-2 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 mt-0.5"
                      style={{ background: a.passed ? '#4ade80' : '#ef4444', color: 'white' }}
                    >
                      {a.passed ? 'PASS' : 'FAIL'}
                    </span>
                    <div>
                      <div className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {a.assertion.field}{a.assertion.path ? `.${a.assertion.path}` : ''} {a.assertion.operator} {a.assertion.value}
                      </div>
                      {!a.passed && a.error && (
                        <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{a.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
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
                        <span className={`font-bold ${statusColorClass(ex.status)}`}>{ex.status}</span>
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
      {showSaveModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowSaveModal(false); }}
        >
          <div
            className="w-[420px] rounded-lg p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookMarked size={15} style={{ color: '#a78bfa' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Save Example</span>
              </div>
              <button
                onClick={() => setShowSaveModal(false)}
                className="rounded p-1 hover:bg-white/10 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Example name
              </label>
              <input
                ref={saveModalInputRef}
                type="text"
                value={saveModalName}
                onChange={e => setSaveModalName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmSaveExample();
                  if (e.key === 'Escape') setShowSaveModal(false);
                }}
                placeholder='e.g. "Success 200" or "Not Found 404"'
                className="rounded px-3 py-2 text-sm w-full outline-none"
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-1.5 rounded text-sm transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveExample}
                disabled={!saveModalName.trim()}
                className="px-4 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-40"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
