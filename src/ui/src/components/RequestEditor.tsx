import { useState, useEffect, useRef, useMemo } from 'react';
import { Send as SendIcon, Save as SaveIcon, Terminal, Code2, RefreshCw, ExternalLink } from 'lucide-react';
import { isDeepEqual } from '../lib/utils';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useVarCompletion } from '../hooks/useVarCompletion';
import { fetchAuthProfiles, createAuthProfile, fetchEnvironments, refreshOAuth2Token, startOAuth2Flow, getCollectionVariables, getCollectionAuth, fetchDotenvFiles } from '../api';
import { KeyValueEditor } from './KeyValueEditor';
import type { KeyValuePair } from './KeyValueEditor';
import { VariableInput, VarPill } from './VariableInput';
import type { VariableItem } from './VariableInput';
import { ScriptEditor } from './ScriptEditor';
import { CurlImportModal } from './CurlImportModal';
import { CodeGenModal } from './CodeGenModal';
import { AssertionEditor } from './AssertionEditor';
import { MultipartEditor } from './MultipartEditor';
import type { MultipartPartState } from './MultipartEditor';

interface RequestEditorProps {
  request: any;
  isActive?: boolean;
  onFire: (req: any) => void;
  onSave: (req: any) => void;
  onChange?: (req: any) => void;
}

function methodColor(method: string): string {
  switch ((method || '').toUpperCase()) {
    case 'GET':    return '#22c55e';
    case 'POST':   return '#eab308';
    case 'PUT':    return '#3b82f6';
    case 'PATCH':  return '#f97316';
    case 'DELETE': return '#ef4444';
    default:       return '#a1a1aa';
  }
}

export function RequestEditor({ request, isActive, onFire, onSave, onChange }: RequestEditorProps) {
  const tabs = ['params', 'headers', 'body', 'auth', 'inherited', 'assertions', 'variables', 'pre-script', 'post-script'];

  const [activeEnvVars, setActiveEnvVars] = useState<Record<string, string>>({});
  const [activeEnvName, setActiveEnvName] = useState<string>('');
  const [collectionVars, setCollectionVars] = useState<Record<string, string>>({});
  const [collectionAuthConfig, setCollectionAuthConfig] = useState<{ type: string; profileId?: string; credentials?: Record<string, string> } | null>(null);
  const [dotenvVars, setDotenvVars] = useState<{ key: string; source: string }[]>([]);

  useEffect(() => {
    const loadEnv = () => {
      fetchEnvironments()
        .then((data: any) => {
          const active = data.environments?.find((e: any) => e.name === data.active);
          setActiveEnvName(active?.name || '');
          setActiveEnvVars(active?.variables || {});
        })
        .catch(console.error);
      fetchDotenvFiles()
        .then((data: any) => setDotenvVars(data.variables || []))
        .catch(console.error);
    };
    loadEnv();
    window.addEventListener('reqly-reload', loadEnv);
    return () => window.removeEventListener('reqly-reload', loadEnv);
  }, []);

  useEffect(() => {
    const colName = request?._collection;
    if (!colName) {
      setCollectionVars({});
      setCollectionAuthConfig(null);
      return;
    }
    const loadColData = () => {
      getCollectionVariables(colName).then(setCollectionVars).catch(console.error);
      getCollectionAuth(colName).then(setCollectionAuthConfig).catch(console.error);
    };
    loadColData();
    window.addEventListener('reqly-reload', loadColData);
    return () => window.removeEventListener('reqly-reload', loadColData);
  }, [request?._collection]);

  const [activeTab, setActiveTab] = useState('params');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [paramsList, setParamsList] = useState<KeyValuePair[]>([]);
  const [headersList, setHeadersList] = useState<KeyValuePair[]>([]);
  const [assertions, setAssertions] = useState<any[]>([]);
  const [bodyText, setBodyText] = useState('');
  const [bodyType, setBodyType] = useState<'none' | 'json' | 'raw' | 'multipart'>('none');
  const [multipartParts, setMultipartParts] = useState<MultipartPartState[]>([]);
  const [preScript, setPreScript] = useState('');
  const [postScript, setPostScript] = useState('');
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [showCodeGen, setShowCodeGen] = useState(false);

  const parseParams = (urlStr: string): KeyValuePair[] => {
    const qIndex = urlStr.indexOf('?');
    if (qIndex === -1) return [];
    const qs = urlStr.slice(qIndex + 1);
    if (!qs) return [];
    return qs.split('&').map(p => {
      const [k, v] = p.split('=');
      return { key: decodeURIComponent(k || ''), value: decodeURIComponent(v || ''), enabled: true };
    });
  };

  useEffect(() => {
    if (request) {
      let initialUrl = request.url || '';
      setMethod(request.method || 'GET');
      const initialParams = parseParams(initialUrl);
      if (request.params) {
        Object.entries(request.params).forEach(([k, v]) => {
          initialParams.push({ key: k, value: String(v), enabled: true });
        });
      }
      if (request.disabledParams) {
        request.disabledParams.forEach((p: any) => {
          initialParams.push({ key: p.key, value: p.value, enabled: false });
        });
      }
      if (request.params && Object.keys(request.params).length > 0) {
        const qIndex = initialUrl.indexOf('?');
        const base = qIndex === -1 ? initialUrl : initialUrl.slice(0, qIndex);
        initialUrl = updateUrlWithParams(base, initialParams);
      }
      setUrl(initialUrl);
      setParamsList(initialParams);

      const hl: KeyValuePair[] = [];
      if (request.headers) {
        Object.entries(request.headers).forEach(([k, v]) => {
          hl.push({ key: k, value: String(v), enabled: true });
        });
      }
      if (request.disabledHeaders) {
        request.disabledHeaders.forEach((h: any) => {
          hl.push({ key: h.key, value: h.value, enabled: false });
        });
      }
      setHeadersList(hl);
      setAssertions(request.assertions || []);

      if (request.body && typeof request.body === 'object' && request.body.type === 'multipart') {
        setBodyType('multipart');
        // Strip ephemeral _file objects (they don't survive serialization).
        setMultipartParts((request.body.parts || []).map((p: any) => ({ ...p, _file: undefined })));
        setBodyText('');
      } else if (request.body) {
        setBodyType(typeof request.body === 'string' ? 'raw' : 'json');
        setBodyText(typeof request.body === 'object' ? JSON.stringify(request.body, null, 2) : String(request.body));
        setMultipartParts([]);
      } else {
        setBodyType('none');
        setBodyText('');
        setMultipartParts([]);
      }
      setPreScript(request.preScript || '');
      setPostScript(request.postScript || '');
    }
  }, [request?.id, request?.name]);

  // Encodes a query param piece for the URL while leaving {{variable}} templates
  // untouched - encoding the braces (e.g. {{client}} -> %7B%7Bclient%7D%7D) would
  // hide the template from the engine's variable substitution at request time.
  const encodeParamPart = (str: string) =>
    str.split(/(\{\{[^}]+\}\})/g).map((part, i) => (i % 2 === 1 ? part : encodeURIComponent(part))).join('');

  const updateUrlWithParams = (base: string, params: KeyValuePair[]) => {
    const active = params.filter(p => p.enabled && (p.key || p.value));
    if (active.length === 0) return base;
    const qs = active.map(p => `${encodeParamPart(p.key)}=${encodeParamPart(p.value)}`).join('&');
    return `${base}?${qs}`;
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setParamsList(parseParams(newUrl));
  };

  const handleParamsChange = (newParams: KeyValuePair[]) => {
    setParamsList(newParams);
    const qIndex = url.indexOf('?');
    const base = qIndex === -1 ? url : url.slice(0, qIndex);
    setUrl(updateUrlWithParams(base, newParams));
  };

    const [authType, setAuthType] = useState(request?.auth?.type || 'none');
    const [authProfileId, setAuthProfileId] = useState(request?.authProfileId || '');
    const [authCreds, setAuthCreds] = useState<any>(request?.auth?.credentials || {});
    const [profiles, setProfiles] = useState<any[]>([]);
    const [oauth2Status, setOauth2Status] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [oauth2StatusMsg, setOauth2StatusMsg] = useState('');

    useEffect(() => {
      fetchAuthProfiles().then(setProfiles).catch(console.error);
    }, []);

    const updateAuth = (type: string, creds: any, profileId: string) => {
      setAuthType(type);
      setAuthCreds(creds);
      setAuthProfileId(profileId);
    };

    const handleSaveProfile = async () => {
      const name = prompt('Name for this auth profile:');
      if (!name) return;
      try {
        const newProf = await createAuthProfile({ name, type: authType, credentials: authCreds });
        setProfiles([...profiles, newProf]);
        updateAuth(authType, authCreds, newProf.id);
      } catch (e) {
        console.error(e);
      }
    };

    const getHeadersRecord = () => {
      const hdrs: Record<string, string> = {};
      headersList.forEach(h => {
        if (h.enabled && h.key) hdrs[h.key] = h.value;
      });
      return Object.keys(hdrs).length > 0 ? hdrs : undefined;
    };

    const getParsedBody = () => {
      if (bodyType === 'multipart') {
        // Strip ephemeral _file objects from the persisted config shape.
        const cleanParts = multipartParts.map(({ _file: _f, ...rest }) => rest);
        return cleanParts.length > 0 ? { type: 'multipart', parts: cleanParts } : undefined;
      }
      if (!bodyText.trim()) return undefined;
      if (bodyType === 'json') {
        try { return JSON.parse(bodyText); } catch { return bodyText; }
      }
      return bodyText;
    };

    // Build multipart files map for fire (ephemeral - not included in saved config).
    const getMultipartFiles = (): Record<string, File> => {
      const files: Record<string, File> = {};
      for (const part of multipartParts) {
        if (part.type === 'file' && part._file) files[part.name] = part._file;
      }
      return files;
    };

    const buildRequest = () => {
      const disabledParams = paramsList.filter(p => !p.enabled && (p.key || p.value)).map(p => ({ key: p.key, value: p.value }));
      const disabledHeaders = headersList.filter(h => !h.enabled && (h.key || h.value)).map(h => ({ key: h.key, value: h.value }));
      
      const req: any = { ...request, method, url, assertions, headers: getHeadersRecord(), body: getParsedBody() };
      
      if (disabledParams.length > 0) req.disabledParams = disabledParams;
      else delete req.disabledParams;
      
      if (disabledHeaders.length > 0) req.disabledHeaders = disabledHeaders;
      else delete req.disabledHeaders;

      if (preScript.trim()) req.preScript = preScript;
      else delete req.preScript;
      if (postScript.trim()) req.postScript = postScript;
      else delete req.postScript;
      if (authProfileId) req.authProfileId = authProfileId;
      else if (authType !== 'none') req.auth = { type: authType, credentials: authCreds };
      else { delete req.authProfileId; delete req.auth; }
      return req;
    };

    const buildRequestForFire = () => {
      const req = buildRequest();
      // Attach ephemeral file objects so the fire handler can send them via FormData.
      const files = getMultipartFiles();
      if (Object.keys(files).length > 0) req._multipartFiles = files;
      return req;
    };

    const handleFireWithAuth = () => {
      onFire(buildRequestForFire());
    };

    const handleSaveWithAuth = () => {
      onSave(buildRequest());
    };

    // Keyboard shortcuts: ⌘↵ = Send, ⌘S = Save (only when this tab is active)
    const handleFireRef = useRef(handleFireWithAuth);
    const handleSaveRef = useRef(handleSaveWithAuth);
    handleFireRef.current = handleFireWithAuth;
    handleSaveRef.current = handleSaveWithAuth;

    useEffect(() => {
      if (!isActive) return;
      const onKey = (e: KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          handleFireRef.current();
        }
        if (e.key === 's') {
          e.preventDefault();
          handleSaveRef.current();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [isActive]);

    const isDirty = useMemo(() => {
      if (!request) return true;
      try {
        const req = buildRequest();
        const { _collection, _multipartFiles, ...restCurrent } = req;
        const { _collection: _c, _multipartFiles: _m, ...restOriginal } = request;
        return !isDeepEqual(restCurrent, restOriginal);
      } catch {
        return false;
      }
    }, [method, url, assertions, headersList, bodyText, bodyType, multipartParts, authType, authProfileId, authCreds, preScript, postScript, request]);

    // Report live edits so the parent can track dirty state.
    useEffect(() => {
      if (!onChange) return;
      onChange(buildRequest());
    }, [isDirty]);

  const availableVariables: VariableItem[] = [
    ...Object.entries(collectionVars).map(([k, v]) => ({
      name: k,
      sourceType: 'collection',
      sourceName: request?._collection || 'collection',
      value: v,
    })),
    ...Object.entries(activeEnvVars)
      .filter(([k]) => !(k in collectionVars))
      .map(([k, v]) => ({
        name: k,
        sourceType: 'env',
        sourceName: activeEnvName || 'env',
        value: v,
      })),
    ...dotenvVars
      .filter(v => !(v.key in collectionVars) && !(v.key in activeEnvVars))
      .map(v => ({
        name: v.key,
        sourceType: 'dotenv',
        sourceName: v.source,
        value: '',
      })),
  ];

  // CodeMirror completion extension for {{variable}} syntax in the body editor
  const varCompletionExtension = useVarCompletion(availableVariables);

  // Guard the OUTPUT only, after every hook has run. Placing this earlier (an
  // early return between hook calls) is a Rules-of-Hooks violation: if `request`
  // ever toggles falsy<->truthy on this instance, the hook count changes between
  // renders and React crashes the tree.
  if (!request) {
    return <div className="h-full flex items-center justify-center text-gray-500">Select a request to edit</div>;
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--surface-1)' }}>
      {/* URL bar */}
      <div className="flex px-2 py-1 gap-2" style={{ background: 'var(--surface-1)' }}>
        <div className="flex items-stretch flex-1" style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <select
            className="px-2 text-sm font-bold focus:outline-none"
            style={{ background: 'transparent', border: 'none', borderRight: '1px solid var(--border-strong)', color: methodColor(method) }}
            value={method}
            onChange={e => setMethod(e.target.value as any)}
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
          <VariableInput
            variables={availableVariables}
            className="flex-1 px-3 py-1.5 text-sm bg-transparent focus:outline-none"
            value={url}
            onChange={val => handleUrlChange(val)}
            placeholder="https://api.example.com/v1/users"
          />
        </div>
        <button
          className="btn btn-ghost rounded"
          onClick={() => setShowCurlImport(true)}
          title="Import from cURL"
          style={{ padding: '0 8px' }}
        >
          <Terminal size={14} />
        </button>
        <button
          className="btn btn-ghost rounded"
          onClick={() => setShowCodeGen(true)}
          title="Generate code snippet"
          style={{ padding: '0 8px' }}
        >
          <Code2 size={14} />
        </button>
        <button className="btn btn-primary rounded gap-1.5" onClick={handleFireWithAuth} title="Send request (⌘↵)">
          <SendIcon size={13} />Send
          <span className="text-[10px] opacity-50 ml-0.5">⌘↵</span>
        </button>
        <button className={`btn ${isDirty ? 'btn-primary' : 'btn-secondary'} rounded gap-1.5`} onClick={handleSaveWithAuth} title="Save request (⌘S)">
          <SaveIcon size={13} />Save
          <span className="text-[10px] opacity-50 ml-0.5">⌘S</span>
        </button>
      </div>

      {showCurlImport && (
        <CurlImportModal
          onClose={() => setShowCurlImport(false)}
          onImport={parsed => {
            setMethod(parsed.method as any);
            handleUrlChange(parsed.url);
            const newHeaders: KeyValuePair[] = Object.entries(parsed.headers || {}).map(([k, v]) => ({ key: k, value: v, enabled: true }));
            setHeadersList(newHeaders);
            if (parsed.body) setBodyText(parsed.body);
          }}
        />
      )}

      {showCodeGen && (
        <CodeGenModal
          request={buildRequest()}
          onClose={() => setShowCodeGen(false)}
        />
      )}

      {/* Tab bar */}
      <div className="tab-bar overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`tab-btn capitalize ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'pre-script' ? 'Pre-Script' : tab === 'post-script' ? 'Post-Script' : tab === 'inherited' ? 'Inherited' : tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2" style={{ background: 'var(--surface-1)' }}>
        {activeTab === 'params' ? (
          <div className="py-2">
            <KeyValueEditor pairs={paramsList} onChange={handleParamsChange} variables={availableVariables} />
          </div>
        ) : activeTab === 'headers' ? (
          <div className="py-2">
            <KeyValueEditor pairs={headersList} onChange={setHeadersList} variables={availableVariables} />
          </div>
        ) : activeTab === 'body' ? (
          <div className="flex flex-col gap-3 h-full">
            {/* Body type selector */}
            <div className="flex items-center gap-2 flex-wrap">
              {(['none', 'json', 'raw', 'multipart'] as const).map(t => (
                <button
                  key={t}
                  className="px-3 py-1 rounded text-sm capitalize transition-colors"
                  style={{
                    background: bodyType === t ? 'var(--accent)' : 'var(--surface-3)',
                    color: bodyType === t ? '#fff' : 'var(--text-muted)',
                    border: bodyType === t ? 'none' : '1px solid var(--border)',
                  }}
                  onClick={() => setBodyType(t)}
                >
                  {t === 'json' ? 'JSON' : t}
                </button>
              ))}
              {bodyType === 'json' && (
                <button
                  onClick={() => {
                    try { setBodyText(JSON.stringify(JSON.parse(bodyText), null, 2)); }
                    catch { alert('Invalid JSON - could not format.'); }
                  }}
                  className="ml-auto text-xs px-2 py-1 rounded transition-colors"
                  style={{ background: 'var(--surface-3)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                >
                  Format JSON
                </button>
              )}
            </div>

            {bodyType === 'none' && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No body will be sent with this request.</p>
            )}

            {(bodyType === 'json' || bodyType === 'raw') && (
              <div className="flex-1 border border-[var(--border)] rounded overflow-hidden focus-within:border-blue-500 transition-colors min-h-0">
                <CodeMirror
                  value={bodyText}
                  height="100%"
                  theme="dark"
                  extensions={bodyType === 'json' ? [json(), varCompletionExtension] : [varCompletionExtension]}
                  onChange={val => setBodyText(val)}
                  placeholder={bodyType === 'json' ? '{"key": "value"}' : 'Enter raw text here...'}
                  className="h-full text-sm font-mono [&_.cm-scroller]:overflow-auto [&_.cm-editor]:!bg-black [&_.cm-gutters]:!bg-black [&_.cm-gutters]:!border-[var(--border)]"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                  }}
                />
              </div>
            )}

            {bodyType === 'multipart' && (
              <>
                <MultipartEditor
                  parts={multipartParts}
                  onChange={setMultipartParts}
                  variables={availableVariables}
                />
                {multipartParts.some(p => p.type === 'file') && (
                  <p className="text-xs rounded px-3 py-2" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    File parts are saved as paths. Ensure the file exists at the saved path for CLI and MCP runs.
                  </p>
                )}
              </>
            )}
          </div>
        ) : activeTab === 'assertions' ? (
          <AssertionEditor assertions={assertions} onChange={setAssertions} />
        ) : activeTab === 'auth' ? (
          <div className="max-w-2xl">
            <div className="mb-6 flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24">Profile</label>
              <select 
                className="flex-1 bg-[var(--surface-3)] text-gray-200 border border-[var(--border-strong)] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                value={authProfileId}
                onChange={e => {
                  const id = e.target.value;
                  setAuthProfileId(id);
                  if (id) {
                    const prof = profiles.find(p => p.id === id);
                    if (prof) {
                      setAuthType(prof.type);
                      setAuthCreds(prof.credentials);
                    }
                  } else {
                    setAuthType('none');
                    setAuthCreds({});
                  }
                }}
              >
                <option value="">Inline Auth (No Profile)</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>

            <div className="mb-6 flex gap-4 items-center">
              <label className="text-sm font-semibold text-gray-300 w-24">Auth Type</label>
              <div className="flex gap-2 flex-wrap">
                {['none', 'bearer', 'apikey', 'basic', 'oauth2', 'mtls', 'awsv4'].map(t => (
                  <button 
                    key={t}
                    disabled={!!authProfileId}
                    className={`px-3 py-1 rounded text-sm capitalize transition-colors ${authType === t ? 'bg-blue-600 text-white' : 'bg-[var(--surface-3)] text-gray-400 hover:bg-[var(--surface-4)]'}`}
                    onClick={() => { setAuthType(t); setAuthCreds({}); }}
                  >
                    {t === 'apikey' ? 'API Key' : t === 'oauth2' ? 'OAuth 2.0' : t === 'mtls' ? 'mTLS' : t === 'awsv4' ? 'AWS SigV4' : t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[var(--surface-1)] p-4 rounded border border-[var(--border)] space-y-4">
              {authType === 'none' && <div className="text-sm text-gray-500 italic">This request does not use any authorization.</div>}
              
              {authType === 'bearer' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Token</label>
                  <VariableInput 
                    variables={availableVariables}
                    disabled={!!authProfileId}
                    className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                    placeholder="e.g. {{login.response.body.token}}"
                    value={authCreds.token || ''}
                    onChange={val => setAuthCreds({ ...authCreds, token: val })}
                  />
                </div>
              )}

              {authType === 'apikey' && (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Key Name</label>
                      <input 
                        type="text" 
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                        placeholder="X-API-Key"
                        value={authCreds.keyName || 'X-API-Key'}
                        onChange={e => setAuthCreds({ ...authCreds, keyName: e.target.value })}
                      />
                    </div>
                    <div className="w-48">
                      <label className="block text-sm text-gray-400 mb-1">Placement</label>
                      <select 
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                        value={authCreds.placement || 'header'}
                        onChange={e => setAuthCreds({ ...authCreds, placement: e.target.value })}
                      >
                        <option value="header">Header</option>
                        <option value="query">Query Param</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Value</label>
                    <VariableInput 
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      value={authCreds.value || ''}
                      onChange={val => setAuthCreds({ ...authCreds, value: val })}
                    />
                  </div>
                </>
              )}

              {authType === 'basic' && (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">Username</label>
                    <VariableInput 
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      value={authCreds.username || ''}
                      onChange={val => setAuthCreds({ ...authCreds, username: val })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-gray-400 mb-1">Password</label>
                    <VariableInput 
                      type="password" 
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      value={authCreds.password || ''}
                      onChange={val => setAuthCreds({ ...authCreds, password: val })}
                    />
                  </div>
                </div>
              )}

              {authType === 'oauth2' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Client ID</label>
                      <VariableInput variables={availableVariables} disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                        value={authCreds.clientId || ''} onChange={val => setAuthCreds({ ...authCreds, clientId: val })} />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Client Secret</label>
                      <VariableInput variables={availableVariables} disabled={!!authProfileId} type="password"
                        className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                        value={authCreds.clientSecret || ''} onChange={val => setAuthCreds({ ...authCreds, clientSecret: val })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Authorization URL</label>
                    <VariableInput variables={availableVariables} disabled={!!authProfileId}
                      className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      placeholder="https://provider.com/oauth/authorize"
                      value={authCreds.authUrl || ''} onChange={val => setAuthCreds({ ...authCreds, authUrl: val })} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Token URL</label>
                    <VariableInput variables={availableVariables} disabled={!!authProfileId}
                      className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500"
                      placeholder="https://provider.com/oauth/token"
                      value={authCreds.tokenUrl || ''} onChange={val => setAuthCreds({ ...authCreds, tokenUrl: val })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Redirect URI</label>
                      <input disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                        placeholder="http://localhost:9876/callback"
                        value={authCreds.redirectUri || ''} onChange={e => setAuthCreds({ ...authCreds, redirectUri: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Scope</label>
                      <input disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-3)] border border-[var(--border-strong)] rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                        placeholder="openid profile email"
                        value={authCreds.scope || ''} onChange={e => setAuthCreds({ ...authCreds, scope: e.target.value })} />
                    </div>
                  </div>

                  {/* Token status + actions */}
                  {authProfileId && (() => {
                    const prof = profiles.find(p => p.id === authProfileId);
                    const hasToken = !!prof?.credentials?.accessToken;
                    const expiry = prof?.credentials?.expiresAt ? new Date(Number(prof.credentials.expiresAt)) : null;
                    const isExpired = expiry ? Date.now() > expiry.getTime() : false;
                    return (
                      <div className="mt-2 p-3 rounded border border-[var(--border-strong)] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {hasToken
                              ? isExpired
                                ? <span className="text-red-400">Token expired {expiry?.toLocaleString()}</span>
                                : <span className="text-green-400">Token valid until {expiry?.toLocaleString() ?? 'unknown'}</span>
                              : <span className="text-gray-500">No access token stored</span>}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                            onClick={async () => {
                              setOauth2Status('pending');
                              setOauth2StatusMsg('Opening browser...');
                              try {
                                await startOAuth2Flow(authProfileId);
                                setOauth2Status('pending');
                                setOauth2StatusMsg('Waiting for authorization in browser...');
                                // Poll for token update
                                let tries = 0;
                                const interval = setInterval(async () => {
                                  tries++;
                                  const updated = await (await fetch('/api/auth-profiles')).json();
                                  const updatedProf = updated.find((p: any) => p.id === authProfileId);
                                  if (updatedProf?.credentials?.accessToken !== prof?.credentials?.accessToken) {
                                    clearInterval(interval);
                                    setProfiles(prev => prev.map(p => p.id === authProfileId ? updatedProf : p));
                                    setOauth2Status('success');
                                    setOauth2StatusMsg('Authorized! Token stored.');
                                  }
                                  if (tries > 60) { clearInterval(interval); setOauth2Status('error'); setOauth2StatusMsg('Timed out waiting for token.'); }
                                }, 5000);
                              } catch (e: any) {
                                setOauth2Status('error');
                                setOauth2StatusMsg(e.message);
                              }
                            }}
                          >
                            <ExternalLink size={13} /> Authorize
                          </button>
                          {hasToken && (
                            <button
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                              onClick={async () => {
                                setOauth2Status('pending');
                                setOauth2StatusMsg('Refreshing token...');
                                try {
                                  const updated = await refreshOAuth2Token(authProfileId);
                                  setProfiles(prev => prev.map(p => p.id === authProfileId ? updated : p));
                                  setOauth2Status('success');
                                  setOauth2StatusMsg('Token refreshed!');
                                } catch (e: any) {
                                  setOauth2Status('error');
                                  setOauth2StatusMsg(e.message);
                                }
                              }}
                            >
                              <RefreshCw size={13} /> Refresh Token
                            </button>
                          )}
                        </div>
                        {oauth2StatusMsg && (
                          <p className={`text-xs ${oauth2Status === 'error' ? 'text-red-400' : oauth2Status === 'success' ? 'text-green-400' : 'text-gray-400'}`}>
                            {oauth2StatusMsg}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {authType === 'mtls' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Certificate (PEM) path</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="{{cert_dir}}/client.crt"
                        value={authCreds.certPath || ''}
                        onChange={val => setAuthCreds({ ...authCreds, certPath: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Private key path</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="{{cert_dir}}/client.key"
                        value={authCreds.keyPath || ''}
                        onChange={val => setAuthCreds({ ...authCreds, keyPath: val })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">PKCS#12 (PFX) path</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="{{cert_dir}}/client.pfx"
                        value={authCreds.pfxPath || ''}
                        onChange={val => setAuthCreds({ ...authCreds, pfxPath: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Passphrase</label>
                      <VariableInput
                        type="password"
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="{{mtls_passphrase}}"
                        value={authCreds.passphrase || ''}
                        onChange={val => setAuthCreds({ ...authCreds, passphrase: val })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Custom Root CA path (optional)</label>
                    <VariableInput
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                      placeholder="{{cert_dir}}/ca.crt"
                      value={authCreds.caPath || ''}
                      onChange={val => setAuthCreds({ ...authCreds, caPath: val })}
                    />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Provide either (Certificate + Private Key) OR a (PFX) file. Fields support <code>{'{{variables}}'}</code>. Store certs in ~/.reqly/certs/ - never committed.
                  </p>
                </div>
              )}

              {authType === 'awsv4' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Access Key ID</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                        value={authCreds.accessKey || ''}
                        onChange={val => setAuthCreds({ ...authCreds, accessKey: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Secret Access Key</label>
                      <VariableInput
                        type="password"
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="wJalrXUtnFEMI/K7MDENG"
                        value={authCreds.secretKey || ''}
                        onChange={val => setAuthCreds({ ...authCreds, secretKey: val })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Region</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="us-east-1"
                        value={authCreds.region || ''}
                        onChange={val => setAuthCreds({ ...authCreds, region: val })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Service</label>
                      <VariableInput
                        variables={availableVariables}
                        disabled={!!authProfileId}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                        placeholder="execute-api"
                        value={authCreds.service || ''}
                        onChange={val => setAuthCreds({ ...authCreds, service: val })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Session Token <span className="text-gray-500 font-normal">(optional - for temporary credentials)</span></label>
                    <VariableInput
                      type="password"
                      variables={availableVariables}
                      disabled={!!authProfileId}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[var(--border-strong)] font-mono"
                      placeholder="{{aws_session_token}}"
                      value={authCreds.sessionToken || ''}
                      onChange={val => setAuthCreds({ ...authCreds, sessionToken: val })}
                    />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Signs REST and GraphQL requests via headers (Authorization, X-Amz-Date). For WebSocket connections (AppSync, IoT Core), the signature is applied as query parameters. Use <code>{'{{variables}}'}</code> - never commit credentials to YAML.
                  </p>
                </div>
              )}
            </div>

            {!authProfileId && authType !== 'none' && (
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={handleSaveProfile}
                  className="bg-[var(--surface-3)] hover:bg-[var(--surface-4)] text-blue-400 border border-[var(--border-strong)] hover:border-[var(--border-strong)] px-3 py-1.5 rounded text-sm transition-colors"
                >
                  Save as Profile
                </button>
              </div>
            )}
          </div>
        ) : activeTab === 'inherited' ? (() => {
          // Mirror http-executor.ts auth precedence:
          //   request-level auth (type:none = opt-out) > collection auth > nothing
          // Only count as explicit opt-out if request YAML has auth.type defined as 'none'.
          // Defaulting authType to 'none' when request has no auth is not an opt-out.
          const requestHasExplicitNone = authType === 'none' && !authProfileId && !!request?.auth?.type;
          const requestHasAuth = authProfileId || (authType && authType !== 'none');

          // Resolve effective auth source
          let effectiveCreds: Record<string, string> = {};
          let effectiveType = 'none';
          let authSource = 'none'; // 'profile' | 'inline' | 'collection' | 'none' | 'opted-out'

          if (requestHasExplicitNone) {
            authSource = 'opted-out';
          } else if (requestHasAuth) {
            effectiveCreds = authProfileId
              ? profiles.find((p: any) => p.id === authProfileId)?.credentials ?? {}
              : authCreds;
            effectiveType = authProfileId
              ? profiles.find((p: any) => p.id === authProfileId)?.type ?? authType
              : authType;
            authSource = authProfileId ? 'profile' : 'inline';
          } else if (collectionAuthConfig && collectionAuthConfig.type !== 'none') {
            // Fall back to collection auth
            if (collectionAuthConfig.profileId) {
              const prof = profiles.find((p: any) => p.id === collectionAuthConfig.profileId);
              effectiveCreds = prof?.credentials ?? collectionAuthConfig.credentials ?? {};
              effectiveType = prof?.type ?? collectionAuthConfig.type;
            } else {
              effectiveCreds = collectionAuthConfig.credentials ?? {};
              effectiveType = collectionAuthConfig.type;
            }
            authSource = 'collection';
          }

          type HeaderRow = { header: string; value: string; source: string; note?: string };
          const rows: HeaderRow[] = [];
          const mask = (v: string) => v ? (v.length > 8 ? `${'•'.repeat(v.length - 4)}${v.slice(-4)}` : '••••') : '(empty)';

          if (authSource !== 'opted-out' && effectiveType !== 'none') {
            if (effectiveType === 'bearer' && effectiveCreds.token) {
              rows.push({ header: 'Authorization', value: `Bearer ${mask(effectiveCreds.token)}`, source: authSource });
            } else if (effectiveType === 'basic' && effectiveCreds.username) {
              const raw = `${effectiveCreds.username}:${effectiveCreds.password || ''}`;
              const b64 = btoa(raw);
              rows.push({ header: 'Authorization', value: `Basic ${mask(b64)}`, source: authSource, note: `username: ${effectiveCreds.username}` });
            } else if ((effectiveType === 'apiKey' || effectiveType === 'apikey') && (effectiveCreds.value || effectiveCreds.key)) {
              const val = effectiveCreds.value || effectiveCreds.key;
              const placement = effectiveCreds.placement || 'header';
              if (placement === 'header') {
                rows.push({ header: effectiveCreds.keyName || 'x-api-key', value: mask(val), source: authSource });
              } else {
                rows.push({ header: `?${effectiveCreds.keyName || 'api_key'}`, value: mask(val), source: authSource, note: 'added as query parameter' });
              }
            } else if (effectiveType === 'oauth2') {
              const token = effectiveCreds.accessToken;
              const expiresAt = effectiveCreds.expiresAt ? Number(effectiveCreds.expiresAt) : null;
              const expired = expiresAt ? Date.now() > expiresAt : false;
              if (token) {
                rows.push({
                  header: 'Authorization',
                  value: `Bearer ${mask(token)}`,
                  source: authSource,
                  note: expired ? 'token expired - will auto-refresh if refresh_token is set' : expiresAt ? `expires ${new Date(expiresAt).toLocaleString()}` : undefined,
                });
              } else {
                rows.push({ header: 'Authorization', value: '(not yet obtained)', source: authSource, note: 'Authorize first in the Auth tab' });
              }
            } else if (effectiveType === 'mtls') {
              if (effectiveCreds.pfxPath) {
                rows.push({ header: 'TLS client cert', value: effectiveCreds.pfxPath, source: authSource, note: effectiveCreds.passphrase ? 'with passphrase' : 'no passphrase' });
              } else if (effectiveCreds.certPath && effectiveCreds.keyPath) {
                rows.push({ header: 'TLS client cert', value: effectiveCreds.certPath, source: authSource, note: `key: ${effectiveCreds.keyPath}` });
              } else {
                rows.push({ header: 'TLS client cert', value: '(incomplete)', source: authSource, note: 'pfxPath OR certPath+keyPath required' });
              }
              if (effectiveCreds.caPath) {
                rows.push({ header: 'TLS Root CA', value: effectiveCreds.caPath, source: authSource });
              }
            } else if (effectiveType === 'awsv4') {
              const region = effectiveCreds.region || 'us-east-1';
              const service = effectiveCreds.service || 'execute-api';
              rows.push({ header: 'Authorization', value: `AWS4-HMAC-SHA256 (signed at request time)`, source: authSource, note: `${region} / ${service}` });
              rows.push({ header: 'X-Amz-Date', value: '(computed at request time)', source: authSource });
              if (effectiveCreds.sessionToken) {
                rows.push({ header: 'X-Amz-Security-Token', value: mask(effectiveCreds.sessionToken), source: authSource });
              }
            }
          }

          const emptyMessage = authSource === 'opted-out'
            ? 'Request auth is set to None - collection auth is suppressed for this request'
            : 'No auth configured on this request or its collection';

          return (
            <div className="py-2 max-w-2xl">
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Read-only preview of headers that will be injected by the active auth configuration before firing.
                These are added automatically and do not appear in the Headers tab.
              </p>

              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: 'var(--text-muted)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12h.01M15 12h.01M9 16h6M5 8h14a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1Z"/>
                    <path d="M9 8V6a3 3 0 0 1 6 0v2"/>
                  </svg>
                  <span className="text-sm">{emptyMessage}</span>
                </div>
              ) : (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="grid grid-cols-[180px_1fr_100px] text-xs font-semibold uppercase tracking-widest px-3 py-2" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    <span>Header</span>
                    <span>Value</span>
                    <span>Source</span>
                  </div>
                  {rows.map((row, i) => (
                    <div key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : undefined }}>
                      <div className="grid grid-cols-[180px_1fr_100px] px-3 py-2 text-sm">
                        <span className="font-mono truncate" style={{ color: '#7dd3fc' }}>{row.header}</span>
                        <span className="font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{row.value}</span>
                        <span className="text-xs capitalize" style={{ color: row.source === 'collection' ? '#a78bfa' : 'var(--text-muted)' }}>{row.source}</span>
                      </div>
                      {row.note && (
                        <div className="px-3 pb-2 text-xs" style={{ color: 'var(--text-muted)' }}>{row.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {rows.length > 0 && (
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                  Values are partially masked for security. The full value is sent in the actual request.
                </p>
              )}
            </div>
          );
        })() : activeTab === 'variables' ? (
          <div className="py-2">
            <p className="text-xs text-gray-500 mb-3">
              Variables in scope: collection variables{request?._collection ? ` (${request._collection})` : ''} take priority over the active environment{activeEnvName ? ` (${activeEnvName})` : ''} on name collisions. Edit collection variables via the collection's right-click Settings menu, environment variables in the Environments panel.
            </p>
            {Object.keys(collectionVars).length === 0 && Object.keys(activeEnvVars).length === 0 && dotenvVars.length === 0 ? (
              <p className="text-sm text-gray-600 italic">No variables in scope.</p>
            ) : (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div className="grid grid-cols-[1fr_1fr_1fr] text-xs font-semibold text-gray-500 uppercase tracking-widest px-3 py-1.5 border-b border-[var(--border)]">
                  <span>Key</span>
                  <span>Value</span>
                  <span>Source</span>
                </div>
                {Object.entries(collectionVars).map(([k, v]) => (
                  <div key={`col-${k}`} className="grid grid-cols-[1fr_1fr_1fr] items-center px-3 py-1.5 text-sm border-b border-[var(--border)] last:border-b-0">
                    <span className="truncate"><VarPill varName={k} resolvedValue={String(v)} /></span>
                    <span className="text-gray-400 font-mono truncate">{String(v)}</span>
                    <span className="text-gray-500 truncate">{request?._collection}</span>
                  </div>
                ))}
                {Object.entries(activeEnvVars)
                  .filter(([k]) => collectionVars[k] === undefined)
                  .map(([k, v]) => (
                    <div key={`env-${k}`} className="grid grid-cols-[1fr_1fr_1fr] items-center px-3 py-1.5 text-sm border-b border-[var(--border)] last:border-b-0">
                      <span className="truncate"><VarPill varName={k} resolvedValue={String(v)} /></span>
                      <span className="text-gray-400 font-mono truncate">{String(v)}</span>
                      <span className="text-gray-500 truncate">{activeEnvName || 'env'}</span>
                    </div>
                  ))}
                {dotenvVars
                  .filter(v => collectionVars[v.key] === undefined && activeEnvVars[v.key] === undefined)
                  .map(v => (
                    <div key={`dotenv-${v.key}`} className="grid grid-cols-[1fr_1fr_1fr] items-center px-3 py-1.5 text-sm border-b border-[var(--border)] last:border-b-0">
                      <span className="truncate"><VarPill varName={v.key} resolvedValue="hidden" /></span>
                      <span className="text-gray-600 font-mono truncate italic">hidden</span>
                      <span className="text-gray-500 truncate">{v.source}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : activeTab === 'pre-script' ? (
          <div className="flex flex-col h-full gap-2">
            <p className="text-xs text-gray-500">
              Runs before the request fires. <code className="bg-[var(--surface-3)] px-1 rounded">env</code> (read/write) and <code className="bg-[var(--surface-3)] px-1 rounded">request</code> (read-only) are available. Mutations to <code className="bg-[var(--surface-3)] px-1 rounded">env</code> are applied for this request and downstream requests in a collection run.
            </p>
            <ScriptEditor
              value={preScript}
              onChange={setPreScript}
              placeholder={`// Example: set a dynamic header from env\n// env.timestamp = String(Date.now());\n// env.authToken = "Bearer " + env.rawToken;`}
            />
          </div>
        ) : activeTab === 'post-script' ? (
          <div className="flex flex-col h-full gap-2">
            <p className="text-xs text-gray-500">
              Runs after the response is received. <code className="bg-[var(--surface-3)] px-1 rounded">env</code> (read/write), <code className="bg-[var(--surface-3)] px-1 rounded">request</code>, and <code className="bg-[var(--surface-3)] px-1 rounded">response</code> are available. Use it to extract tokens from responses and store them in <code className="bg-[var(--surface-3)] px-1 rounded">env</code> for subsequent requests.
            </p>
            <ScriptEditor
              value={postScript}
              onChange={setPostScript}
              placeholder={`// Example: extract a token from the response body\n// if (response.status === 200) {\n//   env.authToken = response.body.token;\n// }`}
            />
          </div>
        ) : (
          <div className="text-gray-500 text-sm">
            {activeTab} editor coming soon...
          </div>
        )}
      </div>
    </div>
  );
}
