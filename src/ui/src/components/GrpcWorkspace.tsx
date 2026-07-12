import { useState, useEffect, useRef, useMemo } from 'react';
import { isDeepEqual } from '../lib/utils';

import {
  Send as SendIcon, Loader2, Save, Copy, Check, Search, X
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { SplitPane } from './SplitPane';
import { CollectionsPanel } from './CollectionsPanel';
import { WorkspaceTabBar } from './WorkspaceTabBar';
import { useWorkspaceTabs } from '../hooks/useWorkspaceTabs';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import { VariableInput } from './VariableInput';
import type { VariableItem } from './VariableInput';
import { useVarCompletion } from '../hooks/useVarCompletion';
import { CollapsibleJson } from './InteractiveJsonTree';
import { fetchEnvironments, getCollectionVariables, fetchDotenvFiles, updateRequest } from '../api';
import { SaveToCollectionModal } from './SaveToCollectionModal.js';
import { ResizablePanel } from './ResizablePanel.js';

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

interface GrpcWorkspaceProps {
  initialRequest?: any;
  onUpdate?: (state: any) => void;
}

export function GrpcWorkspaceInner({ initialRequest, onUpdate }: GrpcWorkspaceProps = {}) {
  // Seed: explicit initialRequest (sidebar click) wins; otherwise fall back to last-saved workspace state
  const seed = initialRequest;

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
  const [saveSuccess, setSaveSuccess]     = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

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
      // Propagate back to App so reqly.grpcRequest stays current for refresh
      onUpdate?.(state);
    }, 600);
    return () => clearTimeout(t);
  }, [url, protoFile, service, method, insecure, streamTimeout, streamingType, messageJson, metadata, activeCollection, activeRequestName, onUpdate]);


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

  const isDirty = useMemo(() => {
    if (!initialRequest) return true;
    try {
      const parsed = parseMessageJson();
      if (!parsed.ok) return false;
      
      const enabledMeta: Record<string, string> = {};
      for (const m of metadata) {
        if (m.enabled && m.key.trim()) enabledMeta[m.key.trim()] = m.value;
      }
      
      const cfg: any = {
        protoFile: protoFile.trim(),
        service: service.trim(),
        method: method.trim(),
        insecure,
      };
      if (streamingType !== 'unary') cfg.streaming = streamingType;
      if (isStreaming) cfg.streamTimeout = streamTimeout;
      if (isMultiMessage && Array.isArray(parsed.value)) cfg.messages = parsed.value;
      else cfg.message = parsed.value ?? {};

      const current = {
        id: initialRequest.id || '',
        name: activeRequestName || '',
        method: 'POST',
        url: url.trim(),
        type: 'grpc',
        ...(Object.keys(enabledMeta).length > 0 ? { headers: enabledMeta } : {}),
        grpc: cfg,
      };

      const normalize = (r: any) => {
        if (!r) return {};
        const { _collection, _multipartFiles, ...rest } = r;
        return rest;
      };
      
      return !isDeepEqual(normalize(current), normalize(initialRequest));
    } catch {
      return false;
    }
  }, [initialRequest, activeRequestName, url, metadata, protoFile, service, method, insecure, streamTimeout, streamingType, messageJson, isStreaming, isMultiMessage]);

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

    try {
      const res = await fetch('/api/run/adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Metadata travels as request.headers - the same field saved YAML
          // uses - so the server merges it into gRPC Metadata with auth.
          request: {
            type: 'grpc',
            _collection: activeCollection,
            url: url.trim(),
            ...(Object.keys(enabledMeta).length > 0 ? { headers: enabledMeta } : {}),
            grpc: grpcCfg,
          }
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

  const buildRequestToSave = () => {
    const parsed = parseMessageJson();
    if (!parsed.ok) return null;
    const enabledMeta = Object.fromEntries(metadata.filter(m => m.enabled && m.key.trim()).map(m => [m.key, m.value]));
    const grpcCfg = buildGrpcConfig(parsed.value);
    return {
      id: initialRequest?.id,
      name: activeRequestName || 'New Request',
      method: 'POST',
      url: url.trim(),
      type: 'grpc',
      ...(Object.keys(enabledMeta).length > 0 ? { headers: enabledMeta } : {}),
      grpc: grpcCfg,
    };
  };

  const handleSaveClick = async () => {
    if (activeCollection && activeRequestName) {
      const reqToSave = buildRequestToSave();
      if (!reqToSave) {
        alert('Message JSON is invalid - fix before saving');
        return;
      }
      try {
        await updateRequest(activeCollection, activeRequestName, reqToSave);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        window.dispatchEvent(new Event('reqly-reload'));
        if (onUpdate) onUpdate({ ...reqToSave, _collection: activeCollection });
      } catch (e: any) {
        alert(e.message || 'Save failed');
      }
    } else {
      const reqToSave = buildRequestToSave();
      if (!reqToSave) {
        alert('Message JSON is invalid - fix before saving');
        return;
      }
      setSaveModalOpen(true);
    }
  };

  const handleSaved = (collectionName: string, requestName: string, requestId?: string) => {
    const reqToSave = buildRequestToSave();
    if (!reqToSave) return;
    reqToSave.id = requestId || reqToSave.id;
    reqToSave.name = requestName;
    setSaveModalOpen(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    // Record where the request now lives so the next Save updates it in place
    // instead of reopening the save modal.
    setActiveCollection(collectionName);
    setActiveRequestName(requestName);
    if (onUpdate) onUpdate({ ...reqToSave, _collection: collectionName, tabName: requestName });
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

  const varCompletionExtension = useVarCompletion(availableVariables);

  // --- Render ---
  return (
    <div className="absolute inset-0 flex overflow-hidden" style={{ background: 'var(--surface-1)' }}>


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
            saveSuccess={saveSuccess}
            metadataCount={metadataCount}
            isMultiMessage={isMultiMessage}
            isStreaming={isStreaming}
            onSend={handleSend}
            onSave={handleSaveClick}
            isDirty={isDirty}
            varCompletionExtension={varCompletionExtension}
          />}
          bottom={<ResponsePanel
            response={response}
            isSending={isSending}
            copied={copied}
            onCopy={handleCopyResponse}
          />}
        />
        {saveModalOpen && (
          <SaveToCollectionModal
            request={buildRequestToSave() || {}}
            defaultName={activeRequestName || ''}
            onClose={() => setSaveModalOpen(false)}
            onSaved={handleSaved}
          />
        )}
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
  saveSuccess: boolean;
  metadataCount: number;
  isMultiMessage: boolean;
  isStreaming: boolean;
  onSend: () => void;
  onSave: () => void;
  isDirty?: boolean;
  varCompletionExtension: any;
}

function RequestPanel(p: RequestPanelProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ background: 'var(--surface-1)' }}>

      {/* ── URL bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 shrink-0"
        style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}
      >

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
          className={`btn ${p.isDirty && !p.saveSuccess ? 'btn-primary' : 'btn-secondary'} rounded gap-1.5 shrink-0 transition-colors`}
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
        className="grid grid-cols-3 gap-2 shrink-0"
        style={{ padding: '2px 16px 4px 16px', borderBottom: '1px solid var(--border)' }}
      >
        {[
          { label: 'Proto File', value: p.protoFile, setter: p.setProtoFile, placeholder: 'grpcbin.proto' },
          { label: 'Service',    value: p.service,   setter: p.setService,   placeholder: 'hello.HelloService' },
          { label: 'Method',     value: p.method,    setter: p.setMethod,    placeholder: 'SayHello' },
        ].map(({ label, value, setter, placeholder }) => (
          <div key={label} className="flex flex-col">
            <label className="text-[9px] font-semibold uppercase tracking-wider mb-[1px]" style={{ color: 'var(--text-muted)' }}>
              {label}
            </label>
            <VariableInput
              variables={p.availableVariables}
              className="rounded px-1.5 text-[10px] font-mono focus:outline-none w-full"
              style={{ height: '20px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
              value={value}
              onChange={setter}
              placeholder={placeholder}
              onFocus={(e: any) => (e.currentTarget.style.borderColor = '#06b6d4')}
              onBlur={(e: any) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
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
                extensions={[json(), p.varCompletionExtension]}
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
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-2 gap-1.5">
        {activeTab === 'raw' ? (
          <pre className="flex-1 h-full overflow-auto text-xs font-mono whitespace-pre-wrap break-all p-2 rounded m-0" style={{ color: 'var(--text-secondary)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        ) : isStreamResponse ? (
          <div className="flex-1 h-full overflow-auto">
            <StreamMessageList messages={response.messages} />
          </div>
        ) : response.isError ? (
          <div
            className="text-sm font-mono p-2 rounded shrink-0"
            style={{ color: '#f87171', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)' }}
          >
            {response.errorMessage || 'RPC error'}
          </div>
        ) : response.body != null ? (
          <CollapsibleJson label="response" data={response.body} defaultOpen={true} accent="#06b6d4" filter={bodyFilter} className="flex-1 h-full" />
        ) : response.response != null ? (
          <CollapsibleJson label="response" data={response.response} defaultOpen={true} accent="#06b6d4" filter={bodyFilter} className="flex-1 h-full" />
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

export function GrpcWorkspace({ initialRequest, onUpdate }: { initialRequest?: any; onUpdate?: (state: any) => void }) {
  const { tabs, activeTabId, activeTab, addTab, closeTab, updateTab, loadTab, setActiveTabId } = useWorkspaceTabs('grpc', 'grpc', 'New gRPC Request');
  const prevRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only react to sidebar-selected requests (must have _collection + name).
    if (!initialRequest?._collection || !initialRequest?.name) return;
    const identity = `${initialRequest._collection}::${initialRequest.name}`;
    if (identity === prevRequestIdRef.current) return;
    prevRequestIdRef.current = identity;
    loadTab(initialRequest);
  }, [initialRequest]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ResizablePanel defaultWidth={256} storageKey="reqly:grpc-sidebar-width" className="flex-col" style={{ background: 'var(--surface-1)' }}>
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <CollectionsPanel
            activeRequest={activeTab}
            onSelectRequest={(req, col) => loadTab({ ...req, _collection: col })}
            onRunCollection={() => {}}
            typeFilter={['grpc']}
            defaultRequestType="grpc"
          />
        </div>
      </ResizablePanel>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={setActiveTabId}
          onClose={closeTab}
          onNew={() => addTab('grpc')}
          protocols={[{ id: 'grpc', label: 'gRPC' }]}
        />
        <div className="relative min-h-0 flex-1">
          {activeTab && (
            <GrpcWorkspaceInner
              key={activeTab.id}
              initialRequest={activeTab}
              onUpdate={(state: any) => {
                updateTab(activeTab.id, state);
                onUpdate?.(state);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
