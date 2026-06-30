import { useState, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Copy, Check, BookMarked, X } from 'lucide-react';
import { ResponseViewer } from './ResponseViewer';
import { CollapsibleJson } from './InteractiveJsonTree';
import { saveExample } from '../api';

interface Props {
  response: any;
  isSending?: boolean;
  request?: any;
}

function isGraphQLResponse(body: unknown): body is { data?: unknown; errors?: unknown[]; extensions?: unknown } {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return 'data' in b || 'errors' in b || 'extensions' in b;
}


function GqlStatusBadge({ hasData, hasErrors }: { hasData: boolean; hasErrors: boolean }) {
  if (hasErrors && !hasData) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
        <XCircle size={14} /> Errors
      </span>
    );
  }
  if (hasErrors && hasData) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
        <AlertTriangle size={14} /> Partial
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
      <CheckCircle2 size={14} /> OK
    </span>
  );
}

export function GraphQLResponseViewer({ response, isSending, request }: Props) {
  const body = response?.body;
  const [copied, setCopied] = useState(false);
  const [savingExample, setSavingExample] = useState(false);
  const [savedExampleMsg, setSavedExampleMsg] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [bodyFilter, setBodyFilter] = useState('');
  const saveModalInputRef = useRef<HTMLInputElement>(null);

  const collectionName = request?._collection;
  const requestName = request?.name;
  const canSaveExample = !!(response && collectionName && requestName);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(response?.body, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        status: response.status || 200,
        body: response.body,
        headers: response.headers || {},
        latency: response.latency || 0,
      });
      setSavedExampleMsg(`Saved "${name}"`);
      setTimeout(() => setSavedExampleMsg(''), 3000);
      window.dispatchEvent(new CustomEvent('reqly-example-saved', { detail: { col: collectionName, req: requestName } }));
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      alert(`Failed to save example: ${e.message}`);
    } finally {
      setSavingExample(false);
    }
  };

  // Only use the GraphQL-specific layout when the response body looks like a
  // GraphQL response ({data?, errors?, extensions?}). Fall back to the standard
  // viewer for everything else (network errors, non-GQL endpoints, etc.)
  if (!response || isSending || !isGraphQLResponse(body)) {
    return <ResponseViewer response={response} isSending={isSending} request={request} />;
  }

  const gql = body as { data?: unknown; errors?: Array<{ message: string; locations?: unknown; path?: unknown }>; extensions?: unknown };
  const hasErrors = Array.isArray(gql.errors) && gql.errors.length > 0;
  const hasData = gql.data !== undefined && gql.data !== null;
  const hasExtensions = gql.extensions !== undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--surface-1)' }}>
      {/* Mini status bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-[var(--border)] shrink-0" style={{ background: 'var(--surface-2)' }}>
        <GqlStatusBadge hasData={hasData} hasErrors={hasErrors} />
        {response.status && (
          <span className="text-xs text-gray-500">HTTP {response.status}</span>
        )}
        {response.latency !== undefined && (
          <span className="text-xs text-gray-500">{response.latency}ms</span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2 pr-2 border-r border-[var(--border)] mr-1">
          <input
            className="input text-xs py-0.5 px-2 w-32 bg-transparent"
            style={{ minHeight: '24px' }}
            placeholder="Filter..."
            value={bodyFilter}
            onChange={e => setBodyFilter(e.target.value)}
          />
          {bodyFilter && (
            <button onClick={() => setBodyFilter('')} style={{ color: 'var(--text-muted)', lineHeight: 1 }} className="text-xs leading-none mr-2">×</button>
          )}
        </div>
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

      <div className="flex-1 overflow-y-auto p-3 min-w-0 w-full">
        {/* Errors always shown first, prominently */}
        {hasErrors && (
          <div className="mb-3 border border-red-800 rounded overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-red-950 text-red-300 text-xs font-semibold">
              <XCircle size={13} />
              {gql.errors!.length} Error{gql.errors!.length !== 1 ? 's' : ''}
            </div>
            <div className="divide-y divide-red-900">
              {gql.errors!.map((e, i) => (
                <div key={i} className="px-3 py-2" style={{ background: 'var(--surface-1)' }}>
                  <div className="text-sm text-red-300 font-medium">{e.message}</div>
                  {!!e.path && (
                    <div className="text-[10px] text-gray-500 mt-0.5">path: {JSON.stringify(e.path)}</div>
                  )}
                  {!!e.locations && (
                    <div className="text-[10px] text-gray-600 mt-0.5">locations: {JSON.stringify(e.locations)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasData && (
          <CollapsibleJson
            label="data"
            data={gql.data}
            defaultOpen={!hasErrors}
            accent="#86efac"
            filter={bodyFilter}
          />
        )}

        {hasExtensions && (
          <CollapsibleJson
            label="extensions"
            data={gql.extensions}
            defaultOpen={false}
            accent="#94a3b8"
            filter={bodyFilter}
          />
        )}

        {!hasData && !hasErrors && !hasExtensions && (
          <div className="text-xs text-gray-500 px-2 py-4 text-center">Empty GraphQL response</div>
        )}
      </div>

      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
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
        </div>
      )}
    </div>
  );
}
