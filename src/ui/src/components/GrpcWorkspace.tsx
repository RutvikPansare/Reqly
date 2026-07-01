import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send as SendIcon, Loader2, Save, Bookmark, Copy, Check, Search, X,
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { SplitPane } from './SplitPane';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import { VariableInput } from './VariableInput';
import type { VariableItem } from './VariableInput';
import { CollapsibleJson } from './InteractiveJsonTree';
import { addRequest, fetchCollections, fetchEnvironments, getCollectionVariables, fetchDotenvFiles } from '../api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StreamingType = 'unary' | 'server' | 'client' | 'bidirectional';

const STREAMING_META: Record<StreamingType, { label: string; short: string; desc: string }> = {
  unary:         { label: 'Unary',         short: 'UNR', desc: '1 request, 1 response' },
  server:        { label: 'Server Stream', short: 'SRV', desc: '1 request, many responses' },
  client:        { label: 'Client Stream', short: 'CLT', desc: 'Many requests, 1 response' },
  bidirectional: { label: 'Bidi Stream',   short: 'BDI', desc: 'Many requests, many responses' },
};

function grpcStatusStyle(status: string | undefined): { color: string; bg: string; border: string } {
  if (!status || status === 'OK') return { color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.25)' };
  return { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initStreamingType(req: any): StreamingType {
  const s = req?.grpc?.streaming;
  if (s === 'server' || s === 'client' || s === 'bidirectional') return s;
  return 'unary';
}

function initMessageJson(req: any): string {
  if (req?.grpc?.messages) return JSON.stringify(req.grpc.messages, null, 2);
  if (req?.grpc?.message) return JSON.stringify(req.grpc.message, null, 2);
  return '{\n  \n}';
}

function headersToKv(headers: Record<string, string> | undefined): KeyValuePair[] {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value, enabled: true }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GRPC_STATE_KEY = 'reqly.grpcWorkspaceState';

interface GrpcWorkspaceProps {
  initialRequest?: any;
  onUpdate?: (state: any) => void;
}

function loadPersistedState() {
  try { return JSON.parse(localStorage.getItem(GRPC_STATE_KEY) ?? 'null'); } catch { return null; }
}

export function GrpcWorkspace({ initialRequest, onUpdate }: GrpcWorkspaceProps = {}) {
  // Seed: explicit initialRequest (sidebar click) wins; otherwise fall back to last-saved workspace state
  const seed = initialRequest ?? loadPersistedState();

  // --- Request state ---
  const [url, setUrl]               = useState(seed?.url ?? '');
  const [protoFile, setProtoFile]   = useState(seed?.grpc?.protoFile ?? '');
  const [service, setService]       = useState(seed?.grpc?.service ?? '');
  const [method, setMethod]         = useState(seed?.grpc?.method ?? '');
  const [insecure, setInsecure]     = useState<boolean>(seed?.grpc?.insecure ?? true);
  const [streamTimeout, setStreamTimeout] = useState<number>(seed?.grpc?.streamTimeout ?? 10);
  const [streamingType, setStreamingType] = useState<StreamingType>(initStreamingType(seed));
  const [messageJson, setMessageJson]     = useState(initMessageJson(seed));
  const [metadata, setMetadata]     = useState<KeyValuePair[]>(headersToKv(seed?.headers));

  // --- UI state ---
  const [inputTab, setInputTab]     = useState<'message' | 'metadata'>('message');
  const [response, setResponse]     = useState<any>(null);
  const [isSending, setIsSending]   = useState(false);
  const [sendError, setSendError]   = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);

  // --- Save state ---
  const [showSaved, setShowSaved]         = useState(false);
  const [savedRequests, setSavedRequests] = useState<{ collection: string; request: any }[]>([]);
  const [collections, setCollections]     = useState<string[]>([]);
  const [saveCollection, setSaveCollection] = useState('');
  const [saveName, setSaveName]           = useState('');
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess]     = useState(false);
  const [showSaveForm, setShowSaveForm]   = useState(false);

  // --- Context tracking ---
  const [activeCollection, setActiveCollection]   = useState<string | undefined>(seed?._collection);
  const [activeRequestName, setActiveRequestName] = useState<string | undefined>(seed?.name);
  const [activeEnvVars, setActiveEnvVars]   = useState<Record<string, string>>({});
  const [activeEnvName, setActiveEnvName]   = useState('');
  const [collectionVars, setCollectionVars] = useState<Record<string, string>>({});
  const [dotenvVars, setDotenvVars]         = useState<{ key: string; source: string }[]>([]);

  const isMultiMessage = streamingType === 'client' || streamingType === 'bidirectional';
  const isStreaming    = streamingType !== 'unary';

  // Track the last initialRequest identity we applied so we can tell apart
  // sidebar clicks (different identity) from onUpdate echoes (same identity).
  const prevRequestIdRef = useRef<string | null>(
    seed ? `${seed._collection}::${seed.name}` : null
  );

  // React to sidebar clicks: when initialRequest changes to a genuinely
  // different request, update all state fields from the new request.
  useEffect(() => {
    if (!initialRequest) return;
    const id = `${initialRequest._collection}::${initialRequest.name}`;
    if (id === prevRequestIdRef.current) return; // echo from onUpdate, ignore
    prevRequestIdRef.current = id;
    setUrl(initialRequest.url ?? '');
    setProtoFile(initialRequest.grpc?.protoFile ?? '');
    setService(initialRequest.grpc?.service ?? '');
    setMethod(initialRequest.grpc?.method ?? '');
    setInsecure(initialRequest.grpc?.insecure ?? true);
    setStreamTimeout(initialRequest.grpc?.streamTimeout ?? 10);
    setStreamingType(initStreamingType(initialRequest));
    setMessageJson(initMessageJson(initialRequest));
    setMetadata(headersToKv(initialRequest.headers));
    setActiveCollection(initialRequest._collection);
    setActiveRequestName(initialRequest.name);
    setResponse(null);
  }, [initialRequest]);

  // --- Persist workspace state to localStorage + propagate back to App (debounced 600ms) ---
  useEffect(() => {
    const t = setTimeout(() => {
      const state = {
        url, name: activeRequestName, _collection: activeCollection,
        grpc: { protoFile, service, method, insecure, streamTimeout, streaming: streamingType === 'unary' ? undefined : streamingType },
        headers: Object.fromEntries(metadata.filter(m => m.enabled && m.key.trim()).map(m => [m.key, m.value])),
        body: { type: 'raw', raw: messageJson },
      };
      localStorage.setItem(GRPC_STATE_KEY, JSON.stringify(state));
      // Propagate back to App so reqly.grpcRequest stays current for refresh
      onUpdate?.(state);
    }, 600);
    return () => clearTimeout(t);
  }, [url, protoFile, service, method, insecure, streamTimeout, streamingType, messageJson, metadata, activeCollection, activeRequestName, onUpdate]);

  // --- Load collections + saved gRPC requests ---
  const reloadSaved = () => {
    fetchCollections().then((cols: any[]) => {
      setCollections(cols.map((c: any) => c.name));
      const reqs: { collection: string; request: any }[] = [];
      for (const col of cols) {
        for (const req of (col.requests ?? [])) {
          if (req.type === 'grpc') reqs.push({ collection: col.name, request: req });
        }
      }
      setSavedRequests(reqs);
    }).catch(() => {});
  };
  useEffect(() => { reloadSaved(); }, []);

  // --- Load env / dotenv vars for autocomplete ---
  useEffect(() => {
    const load = () => {
      fetchEnvironments().then((data: any) => {
        const active = data.environments?.find((e: any) => e.name === data.active);
        setActiveEnvName(active?.name ?? '');
        setActiveEnvVars(active?.variables ?? {});
      }).catch(() => {});
      fetchDotenvFiles().then((data: any) => setDotenvVars(data.variables ?? [])).catch(() => {});
    };
    load();
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, []);

  useEffect(() => {
    if (!activeCollection) { setCollectionVars({}); return; }
    const load = () => getCollectionVariables(activeCollection).then(setCollectionVars).catch(() => {});
    load();
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, [activeCollection]);

  // --- Sync when initialRequest changes (sidebar click) ---
  useEffect(() => {
    if (!initialRequest) return;
    setUrl(initialRequest.url ?? '');
    setProtoFile(initialRequest.grpc?.protoFile ?? '');
    setService(initialRequest.grpc?.service ?? '');
    setMethod(initialRequest.grpc?.method ?? '');
    setInsecure(initialRequest.grpc?.insecure ?? true);
    setStreamTimeout(initialRequest.grpc?.streamTimeout ?? 10);
    setStreamingType(initStreamingType(initialRequest));
    setMessageJson(initMessageJson(initialRequest));
    setMetadata(headersToKv(initialRequest.headers));
    setActiveCollection(initialRequest._collection);
    setActiveRequestName(initialRequest.name);
    setResponse(null);
    setSendError(null);
  }, [initialRequest]);

  // --- Available variables for autocomplete ---
  const availableVariables: VariableItem[] = useMemo(() => [
    ...Object.entries(collectionVars).map(([k, v]) => ({
      name: k, sourceType: 'collection', sourceName: activeCollection ?? 'collection', value: v,
    })),
    ...Object.entries(activeEnvVars)
      .filter(([k]) => !(k in collectionVars))
      .map(([k, v]) => ({ name: k, sourceType: 'env', sourceName: activeEnvName || 'env', value: v })),
    ...dotenvVars
      .filter(v => !(v.key in collectionVars) && !(v.key in activeEnvVars))
      .map(v => ({ name: v.key, sourceType: 'dotenv', sourceName: v.source, value: '' })),
  ], [collectionVars, activeEnvVars, activeEnvName, dotenvVars, activeCollection]);

  // --- Build gRPC config from form state ---
  const buildGrpcConfig = (parsedMessage: any) => {
    const cfg: any = {
      protoFile: protoFile.trim(),
      service: service.trim(),
      method: method.trim(),
      insecure,
    };
    if (streamingType !== 'unary') cfg.streaming = streamingType;
    if (isStreaming) cfg.streamTimeout = streamTimeout;
    if (isMultiMessage && Array.isArray(parsedMessage)) cfg.messages = parsedMessage;
    else cfg.message = parsedMessage ?? {};
    return cfg;
  };

  const parseMessageJson = (): { ok: boolean; value?: any; error?: string } => {
    const trimmed = messageJson.trim();
    if (!trimmed || trimmed === '{\n  \n}' || trimmed === '[\n  {\n    \n  }\n]') return { ok: true, value: isMultiMessage ? [] : {} };
    try { return { ok: true, value: JSON.parse(trimmed) }; }
    catch { return { ok: false, error: 'Message JSON is invalid - fix before invoking' }; }
  };

  // --- Handlers ---
  const handleSend = async () => {
    if (!url.trim())       { setSendError('Enter the gRPC server URL (host:port)'); return; }
    if (!protoFile.trim()) { setSendError('Enter the proto file name (e.g. grpcbin.proto)'); return; }
    if (!service.trim())   { setSendError('Enter the service name (e.g. hello.HelloService)'); return; }
    if (!method.trim())    { setSendError('Enter the method name (e.g. SayHello)'); return; }

    const parsed = parseMessageJson();
    if (!parsed.ok) { setSendError(parsed.error!); return; }

    setSendError(null);
    setIsSending(true);
    setResponse(null);

    const enabledMeta: Record<string, string> = {};
    for (const m of metadata) {
      if (m.enabled && m.key.trim()) enabledMeta[m.key.trim()] = m.value;
    }

    const grpcCfg = buildGrpcConfig(parsed.value);
    if (Object.keys(enabledMeta).length > 0) grpcCfg.metadata = enabledMeta;

    try {
      const res = await fetch('/api/run/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: { type: 'grpc', _collection: activeCollection, url: url.trim(), grpc: grpcCfg }
        }),
      });
      const data = await res.json();
      if (data.response) setResponse(data.response);
      else setSendError(data.error || 'RPC failed - check server URL and proto config');
    } catch (e: any) {
      setSendError(e.message);
    } finally {
      setIsSending(false);
      window.dispatchEvent(new Event('reqly-reload'));
    }
  };

  const handleSave = async () => {
    setSaveError(null);

    // If already saved (has collection + name), use them directly
    const col = activeCollection || saveCollection;
    const name = activeRequestName || saveName;

    if (!name.trim() || !col.trim()) { setSaveError('Collection and name are required'); return; }
    const parsed = parseMessageJson();
    if (!parsed.ok) { setSaveError(parsed.error!); return; }

    const enabledMeta = Object.fromEntries(metadata.filter(m => m.enabled && m.key.trim()).map(m => [m.key, m.value]));
    const grpcCfg = buildGrpcConfig(parsed.value);
    try {
      await addRequest(col, {
        id: Date.now().toString(),
        name: name.trim(),
        method: 'POST',
        url: url.trim(),
        type: 'grpc',
        ...(Object.keys(enabledMeta).length > 0 ? { headers: enabledMeta } : {}),
        grpc: grpcCfg,
      });
      setSaveSuccess(true);
      setShowSaveForm(false);
      setTimeout(() => setSaveSuccess(false), 2000);
      reloadSaved();
      window.dispatchEvent(new Event('reqly-reload'));
    } catch (e: any) {
      setSaveError(e.message || 'Save failed');
    }
  };

  // Only show the save form when there's no pre-existing collection+name
  const handleSaveClick = () => {
    if (activeCollection && activeRequestName) {
      handleSave();
    } else {
      setSaveCollection(saveCollection || '');
      setSaveName(saveName || '');
      setShowSaveForm(v => !v);
    }
  };

  const loadSaved = (req: any, col: string) => {
    setUrl(req.url ?? '');
    setProtoFile(req.grpc?.protoFile ?? '');
    setService(req.grpc?.service ?? '');
    setMethod(req.grpc?.method ?? '');
    setInsecure(req.grpc?.insecure ?? true);
    setStreamTimeout(req.grpc?.streamTimeout ?? 10);
    setStreamingType(initStreamingType(req));
    setMessageJson(initMessageJson(req));
    setMetadata(headersToKv(req.headers));
    setActiveCollection(col);
    setActiveRequestName(req.name);
    setResponse(null);
    setSendError(null);
  };

  const handleCopyResponse = () => {
    navigator.clipboard.writeText(JSON.stringify(response, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStreamingChange = (next: StreamingType) => {
    const wasMulti = streamingType === 'client' || streamingType === 'bidirectional';
    const willBeMulti = next === 'client' || next === 'bidirectional';
    setStreamingType(next);
    if (wasMulti !== willBeMulti) {
      setMessageJson(willBeMulti ? '[\n  {\n    \n  }\n]' : '{\n  \n}');
    }
  };

  const metadataCount = metadata.filter(m => m.enabled && m.key.trim()).length;

  // --- Render ---
  return (
    <div className="absolute inset-0 flex overflow-hidden" style={{ background: 'var(--surface-1)' }}>

      {/* Saved requests sidebar */}
      {showSaved && (
        <div
          className="w-60 shrink-0 flex flex-col overflow-hidden order-first"
          style={{ borderRight: '1px solid var(--border)', background: 'var(--surface-1)' }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2 shrink-0"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#06b6d4' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Saved gRPC Requests</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {collections.map(col => {
              const reqs = savedRequests.filter(r => r.collection === col);
              if (reqs.length === 0) return null;
              return (
                <div key={col} className="mb-2">
                  <div
                    className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {col}
                  </div>
                  {reqs.map(({ request }) => {
                    const isActive = activeCollection === col && activeRequestName === request.name;
                    const s = request.grpc?.streaming;
                    const short = s ? STREAMING_META[s as StreamingType]?.short : 'UNR';
                    return (
                      <button
                        key={request.name}
                        onClick={() => loadSaved(request, col)}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 transition-colors"
                        style={{
                          background: isActive ? 'rgba(6,182,212,0.1)' : 'transparent',
                          color: isActive ? '#06b6d4' : 'var(--text-secondary)',
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <span
                          className="text-[9px] font-bold font-mono shrink-0 px-1 rounded"
                          style={{ color: '#06b6d4', background: 'rgba(6,182,212,0.12)' }}
                        >
                          {short}
                        </span>
                        <span className="text-xs truncate">{request.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {savedRequests.length === 0 && (
              <div className="px-3 py-6 text-center text-xs italic" style={{ color: 'var(--text-muted)' }}>
                No saved gRPC requests yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex-1 min-w-0 overflow-hidden" style={{ height: '100%' }}>
        <SplitPane
          defaultSplit={48}
          top={<RequestPanel
            url={url} setUrl={setUrl}
            protoFile={protoFile} setProtoFile={setProtoFile}
            service={service} setService={setService}
            method={method} setMethod={setMethod}
            insecure={insecure} setInsecure={setInsecure}
            streamTimeout={streamTimeout} setStreamTimeout={setStreamTimeout}
            streamingType={streamingType} onStreamingChange={handleStreamingChange}
            messageJson={messageJson} setMessageJson={setMessageJson}
            metadata={metadata} setMetadata={setMetadata}
            inputTab={inputTab} setInputTab={setInputTab}
            availableVariables={availableVariables}
            isSending={isSending}
            sendError={sendError}
            showSaved={showSaved} setShowSaved={setShowSaved}
            showSaveForm={showSaveForm} setShowSaveForm={setShowSaveForm}
            saveSuccess={saveSuccess}
            saveCollection={saveCollection} setSaveCollection={setSaveCollection}
            saveName={saveName} setSaveName={setSaveName}
            saveError={saveError}
            collections={collections}
            metadataCount={metadataCount}
            isMultiMessage={isMultiMessage}
            isStreaming={isStreaming}
            onSend={handleSend}
            onSave={handleSaveClick}
          />}
          bottom={<ResponsePanel
            response={response}
            isSending={isSending}
            copied={copied}
            onCopy={handleCopyResponse}
          />}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request panel (extracted for readability)
// ---------------------------------------------------------------------------

interface RequestPanelProps {
  url: string; setUrl: (v: string) => void;
  protoFile: string; setProtoFile: (v: string) => void;
  service: string; setService: (v: string) => void;
  method: string; setMethod: (v: string) => void;
  insecure: boolean; setInsecure: (v: boolean) => void;
  streamTimeout: number; setStreamTimeout: (v: number) => void;
  streamingType: StreamingType; onStreamingChange: (v: StreamingType) => void;
  messageJson: string; setMessageJson: (v: string) => void;
  metadata: KeyValuePair[]; setMetadata: (v: KeyValuePair[]) => void;
  inputTab: 'message' | 'metadata'; setInputTab: (v: 'message' | 'metadata') => void;
  availableVariables: VariableItem[];
  isSending: boolean;
  sendError: string | null;
  showSaved: boolean; setShowSaved: (v: boolean) => void;
  showSaveForm: boolean; setShowSaveForm: (fn: (v: boolean) => boolean) => void;
  saveSuccess: boolean;
  saveCollection: string; setSaveCollection: (v: string) => void;
  saveName: string; setSaveName: (v: string) => void;
  saveError: string | null;
  collections: string[];
  metadataCount: number;
  isMultiMessage: boolean;
  isStreaming: boolean;
  onSend: () => void;
  onSave: () => void;
}

function RequestPanel(p: RequestPanelProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ background: 'var(--surface-1)' }}>

      {/* ── URL bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 shrink-0"
        style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}
      >
        <button
          className={`btn ${p.showSaved ? 'btn-primary' : 'btn-secondary'} rounded shrink-0`}
          onClick={() => p.setShowSaved(!p.showSaved)}
          style={{ padding: '0 10px', height: '32px' }}
          title="Toggle saved requests"
        >
          <Bookmark size={14} />
        </button>

        <div
          className="flex-1 flex items-center overflow-hidden"
          style={{ height: '32px', border: '1px solid var(--border-strong)', borderRadius: '6px', background: 'var(--surface-2)' }}
        >
          <span
            className="shrink-0 text-[11px] font-bold mx-2.5 px-1.5 py-0.5 rounded"
            style={{ color: '#06b6d4', background: 'rgba(6,182,212,0.14)', letterSpacing: '0.03em' }}
          >
            gRPC
          </span>
          <div className="w-px self-stretch my-1.5 shrink-0" style={{ background: 'var(--border-strong)' }} />
          <VariableInput
            variables={p.availableVariables}
            className="flex-1 px-3 text-sm bg-transparent focus:outline-none h-full font-mono"
            value={p.url}
            onChange={p.setUrl}
            placeholder="host:port  (e.g. grpcb.in:9000)"
          />
        </div>

        <button
          className="btn rounded gap-1.5 shrink-0 font-medium"
          onClick={p.onSend}
          disabled={p.isSending}
          style={{ height: '32px', padding: '0 14px', background: p.isSending ? 'var(--surface-3)' : '#0891b2', borderColor: '#0e7490', color: '#fff', fontSize: '0.8125rem' }}
        >
          {p.isSending
            ? <><Loader2 size={13} className="animate-spin" /> Invoking</>
            : <><SendIcon size={13} /> Invoke</>}
        </button>

        <button
          className="btn btn-secondary rounded gap-1.5 shrink-0"
          style={
            p.saveSuccess
              ? { height: '32px', background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontSize: '0.8125rem' }
              : { height: '32px', fontSize: '0.8125rem' }
          }
          onClick={p.onSave}
          title="Save to collection"
        >
          <Save size={13} />
          {p.saveSuccess ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* ── Save form ────────────────────────────────────────────────────── */}
      {p.showSaveForm && (
        <div
          className="flex items-center gap-2 shrink-0"
          style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}
        >
          <select
            className="text-xs rounded px-2 focus:outline-none"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)', height: '30px' }}
            value={p.saveCollection}
            onChange={e => p.setSaveCollection(e.target.value)}
          >
            <option value="">-- collection --</option>
            {p.collections.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            className="flex-1 text-xs rounded px-3 focus:outline-none"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)', height: '30px' }}
            value={p.saveName}
            onChange={e => p.setSaveName(e.target.value)}
            placeholder="Request name"
            onKeyDown={e => e.key === 'Enter' && p.onSave()}
            onFocus={e => (e.currentTarget.style.borderColor = '#06b6d4')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
          />
          <button
            className="btn rounded text-xs px-4"
            style={{ background: '#0891b2', borderColor: '#0e7490', color: '#fff', height: '30px' }}
            onClick={p.onSave}
          >
            Save
          </button>
          {p.saveError && <span className="text-xs text-red-400">{p.saveError}</span>}
        </div>
      )}

      {/* ── Mode + TLS + Timeout ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        style={{ padding: '7px 16px', borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-widest shrink-0 mr-1"
          style={{ color: 'var(--text-muted)', minWidth: '38px' }}
        >
          Mode
        </span>
        {(Object.entries(STREAMING_META) as [StreamingType, typeof STREAMING_META[StreamingType]][]).map(([type, meta]) => {
          const active = p.streamingType === type;
          return (
            <button
              key={type}
              onClick={() => p.onStreamingChange(type)}
              title={meta.desc}
              className="px-3 text-xs font-medium rounded transition-colors"
              style={{
                height: '26px',
                background: active ? 'rgba(6,182,212,0.14)' : 'transparent',
                color: active ? '#06b6d4' : 'var(--text-muted)',
                border: `1px solid ${active ? 'rgba(6,182,212,0.45)' : 'var(--border)'}`,
              }}
            >
              {meta.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-4">
          <button
            onClick={() => p.setInsecure(!p.insecure)}
            className="flex items-center gap-2 select-none cursor-pointer bg-transparent border-none p-0"
            title="Toggle TLS / plaintext"
          >
            <span
              className="text-xs"
              style={{ color: p.insecure ? 'var(--text-muted)' : '#06b6d4', minWidth: '52px', textAlign: 'right' }}
            >
              {p.insecure ? 'Plaintext' : 'TLS enabled'}
            </span>
            <div
              className="relative w-8 h-4 rounded-full transition-colors shrink-0"
              style={{ background: p.insecure ? 'var(--surface-3)' : '#0891b2' }}
            >
              <div
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-[left]"
                style={{ left: p.insecure ? '2px' : '17px' }}
              />
            </div>
          </button>

          {p.isStreaming && (
            <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <span className="text-xs">Timeout</span>
              <input
                type="number"
                min={1}
                max={300}
                value={p.streamTimeout}
                onChange={e => p.setStreamTimeout(Number(e.target.value))}
                className="rounded px-2 text-xs focus:outline-none w-14"
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)', height: '26px' }}
              />
              <span className="text-xs">s</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Proto / Service / Method ──────────────────────────────────────── */}
      <div
        className="grid grid-cols-3 gap-3 shrink-0"
        style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}
      >
        {[
          { label: 'Proto File', value: p.protoFile, setter: p.setProtoFile, placeholder: 'grpcbin.proto' },
          { label: 'Service',    value: p.service,   setter: p.setService,   placeholder: 'hello.HelloService' },
          { label: 'Method',     value: p.method,    setter: p.setMethod,    placeholder: 'SayHello' },
        ].map(({ label, value, setter, placeholder }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {label}
            </label>
            <input
              className="rounded px-3 text-sm font-mono focus:outline-none"
              style={{ height: '30px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
              value={value}
              onChange={e => setter(e.target.value)}
              placeholder={placeholder}
              onFocus={e => (e.currentTarget.style.borderColor = '#06b6d4')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
          </div>
        ))}
      </div>
      <div className="tab-bar shrink-0">
        <button
          className={`tab-btn ${p.inputTab === 'message' ? 'active' : ''}`}
          onClick={() => p.setInputTab('message')}
        >
          {p.isMultiMessage ? 'Messages' : 'Message'}
        </button>
        <button
          className={`tab-btn flex items-center gap-1 ${p.inputTab === 'metadata' ? 'active' : ''}`}
          onClick={() => p.setInputTab('metadata')}
        >
          Metadata
          {p.metadataCount > 0 && (
            <span
              className="ml-1 text-[10px] rounded-full px-1"
              style={{ background: '#0891b2', color: '#fff' }}
            >
              {p.metadataCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden" style={{ minHeight: '140px' }}>
        {p.inputTab === 'message' ? (
          <div className="h-full flex flex-col p-2 gap-1">
            {p.isMultiMessage && (
              <p className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                JSON array - each element is sent as a separate message
              </p>
            )}
            <div
              className="flex-1 min-h-0 overflow-hidden rounded"
              style={{ border: '1px solid var(--border)', minHeight: '120px' }}
            >
              <CodeMirror
                value={p.messageJson}
                height="100%"
                minHeight="120px"
                theme="dark"
                extensions={[json()]}
                onChange={p.setMessageJson}
                className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto [&_.cm-editor]:!bg-black [&_.cm-gutters]:!bg-black [&_.cm-gutters]:!border-[var(--border)]"
              />
            </div>
            {p.sendError && (
              <div
                className="shrink-0 text-xs px-2 py-1.5 rounded"
                style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}
              >
                {p.sendError}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full overflow-auto py-1">
            <KeyValueEditor pairs={p.metadata} onChange={p.setMetadata} variables={p.availableVariables} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Response panel
// ---------------------------------------------------------------------------

interface ResponsePanelProps {
  response: any;
  isSending: boolean;
  copied: boolean;
  onCopy: () => void;
}

function ResponsePanel({ response, isSending, copied, onCopy }: ResponsePanelProps) {
  const [activeTab, setActiveTab] = useState<'body' | 'raw'>('body');
  const [bodyFilter, setBodyFilter] = useState('');
  const isStreamResponse = response && Array.isArray(response.messages);

  // All branches share the same flex-1 root so the panel always fills the SplitPane bottom pane
  const isEmpty = isSending || !response;

  if (isEmpty) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2" style={{ background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
        {isSending ? (
          <>
            <Loader2 size={18} className="animate-spin" style={{ color: '#06b6d4' }} />
            <span className="text-sm">Invoking...</span>
          </>
        ) : (
          <>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.18)' }}
            >
              <SendIcon size={15} style={{ color: '#06b6d4' }} />
            </div>
            <span className="text-xs">Invoke a method to see the response</span>
          </>
        )}
      </div>
    );
  }

  const statusStyle = grpcStatusStyle(response.grpcStatus);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ background: 'var(--surface-1)' }}>

      {/* ── Header: status + actions ─────────────────────────────────────── */}
      <div className="panel-header">
        <div className="flex items-center gap-3 text-xs font-mono">
          {response.grpcStatus && (
            <span
              className="font-bold px-2 py-0.5 rounded"
              style={{ color: statusStyle.color, background: statusStyle.bg, border: `1px solid ${statusStyle.border}` }}
            >
              {response.grpcStatus}
            </span>
          )}
          {isStreamResponse ? (
            <>
              <span style={{ color: '#06b6d4' }}>
                {response.messages.length} message{response.messages.length !== 1 ? 's' : ''}
              </span>
              {response.truncated && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)' }}
                >
                  truncated
                </span>
              )}
            </>
          ) : (
            response.latency != null && (
              <span style={{ color: 'var(--text-muted)' }}>{response.latency}ms</span>
            )
          )}
          {response.grpcStatusCode != null && (
            <span style={{ color: 'var(--text-muted)' }}>code {response.grpcStatusCode}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="icon-btn"
            style={{ color: copied ? '#4ade80' : undefined }}
            title={copied ? 'Copied!' : 'Copy response'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'body' ? 'active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          {isStreamResponse ? 'Messages' : 'Body'}
        </button>
        <button
          className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          Raw
        </button>

        {/* Filter - only on body tab for non-stream responses */}
        {activeTab === 'body' && !isStreamResponse && response.body != null && (
          <div className="ml-auto flex items-center pr-2">
            <div className="flex items-center gap-1 px-2" style={{ height: '24px' }}>
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
                <button onClick={() => setBodyFilter('')} className="icon-btn p-0" style={{ color: 'var(--text-muted)' }}>
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Body content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto p-2">
        {activeTab === 'raw' ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all p-2 rounded" style={{ color: 'var(--text-secondary)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        ) : isStreamResponse ? (
          <StreamMessageList messages={response.messages} />
        ) : response.isError ? (
          <div
            className="text-sm font-mono p-2 rounded"
            style={{ color: '#f87171', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)' }}
          >
            {response.errorMessage || 'RPC error'}
          </div>
        ) : response.body != null ? (
          <CollapsibleJson label="response" data={response.body} defaultOpen={true} accent="#06b6d4" filter={bodyFilter} />
        ) : response.response != null ? (
          <CollapsibleJson label="response" data={response.response} defaultOpen={true} accent="#06b6d4" filter={bodyFilter} />
        ) : (
          <div className="text-xs italic p-2" style={{ color: 'var(--text-muted)' }}>Empty response body</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stream message list
// ---------------------------------------------------------------------------

interface StreamMessage {
  data: unknown;
  timestamp: string;
  direction: 'received' | 'sent';
}

function StreamMessageList({ messages }: { messages: StreamMessage[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {messages.map((msg, i) => {
        const isRecv = msg.direction === 'received';
        let timeStr = '';
        try {
          timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
          });
        } catch { /* ignore */ }

        return (
          <div
            key={i}
            className="rounded p-2"
            style={{
              background: isRecv ? 'rgba(6,182,212,0.04)' : 'rgba(168,85,247,0.04)',
              border: `1px solid ${isRecv ? 'rgba(6,182,212,0.15)' : 'rgba(168,85,247,0.15)'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                style={{
                  color: isRecv ? '#06b6d4' : '#a855f7',
                  background: isRecv ? 'rgba(6,182,212,0.12)' : 'rgba(168,85,247,0.12)',
                }}
              >
                {isRecv ? '↓ RECV' : '↑ SENT'}
              </span>
              {timeStr && (
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
              )}
              <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
            </div>
            <pre
              className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all m-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {JSON.stringify(msg.data, null, 2)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
