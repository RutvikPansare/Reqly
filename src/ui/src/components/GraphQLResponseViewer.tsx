import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { ResponseViewer } from './ResponseViewer';

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

function syntaxHighlight(jsonStr: string): string {
  const escaped = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span style="color:#7dd3fc">${match}</span>`;
        return `<span style="color:#86efac">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span style="color:#c084fc">${match}</span>`;
      if (/null/.test(match)) return `<span style="color:#6b7280">${match}</span>`;
      return `<span style="color:#fdba74">${match}</span>`;
    }
  );
}

function CollapsibleJson({ label, data, defaultOpen = true, accent }: { label: string; data: unknown; defaultOpen?: boolean; accent?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="border border-[var(--border)] rounded mb-2 overflow-hidden">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-left hover:bg-[var(--surface-3)] transition-colors"
        style={{ background: 'var(--surface-2)' }}
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span style={{ color: accent ?? 'var(--text-primary)' }}>{label}</span>
        <span className="ml-auto text-gray-600 font-normal">
          {Array.isArray(data) ? `${(data as unknown[]).length} item${(data as unknown[]).length !== 1 ? 's' : ''}` : ''}
        </span>
      </button>
      {open && (
        <pre
          className="text-xs font-mono p-3 overflow-auto"
          style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', maxHeight: '400px' }}
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
        />
      )}
    </div>
  );
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
      </div>

      <div className="flex-1 overflow-y-auto p-3">
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
          />
        )}

        {hasExtensions && (
          <CollapsibleJson
            label="extensions"
            data={gql.extensions}
            defaultOpen={false}
            accent="#94a3b8"
          />
        )}

        {!hasData && !hasErrors && !hasExtensions && (
          <div className="text-xs text-gray-500 px-2 py-4 text-center">Empty GraphQL response</div>
        )}
      </div>
    </div>
  );
}
