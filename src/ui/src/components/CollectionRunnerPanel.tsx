import { useState } from 'react';

interface CollectionRunnerPanelProps {
  collectionName: string;
  onClose: () => void;
}

export function CollectionRunnerPanel({ collectionName, onClose }: CollectionRunnerPanelProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [stopOnFailure, setStopOnFailure] = useState(false);

  const runCollection = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/run/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionName, stopOnFailure })
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-[720px] max-w-[92vw] h-[600px] max-h-[85vh] rounded-lg flex flex-col overflow-hidden"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex justify-between items-center px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-base font-semibold flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
            <svg className="w-4.5 h-4.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run: <span className="text-blue-400">{collectionName}</span>
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={stopOnFailure}
              onClick={() => setStopOnFailure(!stopOnFailure)}
              className="text-sm flex items-center gap-2 cursor-pointer select-none"
              style={{ color: 'var(--text-muted)' }}
            >
              Stop on failure
              <span className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${stopOnFailure ? 'bg-blue-600 border-blue-600' : 'bg-[var(--surface-3)] border-[var(--border-strong)]'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${stopOnFailure ? 'translate-x-4' : 'translate-x-1'}`} />
              </span>
            </button>
            <button
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={runCollection}
              disabled={running}
            >
              {running ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 4l10 6-10 6V4z" />
                  </svg>
                  Run Collection
                </>
              )}
            </button>
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onClick={onClose}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {result && (
          <div
            className="mx-5 mt-4 p-4 rounded-md flex justify-between items-center shrink-0"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <div className="flex gap-8">
              <div>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Total</div>
                <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{result.total}</div>
              </div>
              <div className="pl-8" style={{ borderLeft: '1px solid var(--border)' }}>
                <div className="text-xs text-green-500 uppercase tracking-wide">Passed</div>
                <div className="text-2xl font-bold text-green-500">{result.passed}</div>
              </div>
              <div className="pl-8" style={{ borderLeft: '1px solid var(--border)' }}>
                <div className="text-xs text-red-500 uppercase tracking-wide">Failed</div>
                <div className="text-2xl font-bold text-red-500">{result.failed}</div>
              </div>
            </div>
            <button
              onClick={runCollection}
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-md transition-colors"
              style={{ border: '1px solid var(--border)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-run
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          {result?.results?.map((req: any, i: number) => (
            <div
              key={i}
              className="p-4 rounded-md border min-w-0"
              style={req.passed
                ? { background: 'var(--surface-2)', border: '1px solid var(--border)' }
                : { background: 'rgba(153, 27, 27, 0.12)', border: '1px solid rgba(153, 27, 27, 0.4)' }}
            >
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {req.passed ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/15 text-green-500 shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/15 text-red-500 shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                  )}
                  <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{req.requestName}</span>
                </div>
                <div className="text-sm font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{req.duration} ms</div>
              </div>

              {req.error && (
                <div className="text-sm text-red-400 ml-7 mb-2 break-words whitespace-pre-wrap">Error: {req.error}</div>
              )}

              {req.assertions?.length > 0 && (
                <div className="ml-7 space-y-1">
                  {req.assertions.map((ass: any, j: number) => (
                    <div key={j} className={`text-xs break-words whitespace-pre-wrap ${ass.passed ? 'text-green-500/70' : 'text-red-400 font-semibold'}`}>
                      {ass.passed ? '✓' : '✗'} {ass.assertion.field} {ass.assertion.operator} {ass.assertion.value}
                      {!ass.passed && ` (got: ${ass.actual})`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {!result && !running && (
            <div className="text-center mt-16" style={{ color: 'var(--text-muted)' }}>
              Click "Run Collection" to execute all requests.
            </div>
          )}

          {running && !result && (
            <div className="text-center text-blue-400 mt-16 animate-pulse">
              Executing requests...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
